import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { completeOfferedTurnAdvance } from './pc10-full-game-demo-proof-helpers.mjs';
import { MEMBER_TURN_SOURCE_PIN, assertOriginalActor, fingerprint } from './pc10-member-gm-lifecycle-contracts.mjs';
import { TURN_CYCLE_CASES, turnCaseAvailability, assertSolePlayerCycleDemo, assertActualCycleTransition,
  assertNaturalOpenRequest, assertObservedTerminal } from './pc10-turn-cycle-demo-contracts.mjs';
import { captureMemberTurnSourceBinding, observeLifecycleActor, untilLifecycle, captureLifecycleUiAction,
  recoverLifecycleUiAction, publicLifecycleReceipt, openLifecycleSettings, closeLifecycleSettings,
  recordLifecycleAffordance, assertMemberTurnRuntime, assertMemberTurnContext } from './pc10-member-gm-lifecycle-ui-proof.mjs';

async function offered(locator) { return await locator.count() === 1 && await locator.isVisible() && await locator.isEnabled(); }

/** Wait for real presentation completion; acknowledge only a real held briefing.
 * No clock override, DOM hiding, forced click or store mutation is available here.
 */
export async function completeOfferedCyclePresentation(surface, expected, {
  clearBriefing = false, deadlineAt, sdkAuthority = false, setupStart,
} = {}) {
  if (deadlineAt !== undefined) assert.ok(Number.isFinite(deadlineAt), 'Use an actual absolute presentation deadline.');
  const deadline = Math.min(Date.now() + 60_000, deadlineAt ?? Infinity), receipts = [];
  const checkDeadline = () => assert.ok(Date.now() < deadline, 'Original presentation deadline/budget expired.');
  checkDeadline();
  let sawTransmission = false, sawBriefing = false;
  const identityKeys = ['playerRole', 'profileRoleId', 'profileSessionId', 'assignedRoleId',
    'activeConsoleRoleId', 'seatId', 'fleetGroupId', 'replacementRoleId', 'replacementStatus',
    'hydrationRevision', 'instanceId', 'claimedAt', 'gmInstanceOwned'];
  const sourceKeys = ['phase', 'cycle', 'setupRevision', 'phaseTurn', 'progression', 'airspace',
    'airspaceTickerActive', 'airspacePressAccess', 'timerPause', 'teamEndsAt', 'openEndsAt',
    'announcementTurn', 'announcementRevisionPresent', 'announcementRevisionRaw', 'fullGameDemo'];
  const phaseTuple = phase => {
    assert.ok(phase && typeof phase === 'object' && !Array.isArray(phase), 'Use the actual committed turnPhase.');
    assert.ok(Number.isSafeInteger(phase.turn) && phase.turn >= 1);
    assert.equal(phase.progression, 'manual');
    assert.equal(phase.airspace?.state, 'restricted');
    for (const key of ['tickerActive', 'pressAccess']) assert.equal(typeof phase.airspace[key], 'boolean');
    for (const key of ['teamPhaseEndsAt', 'openAirspaceEndsAt']) {
      assert.equal(typeof phase[key], 'string'); assert.ok(Number.isFinite(Date.parse(phase[key])), 'Actual committed clock is required.');
    }
    assert.ok(Date.parse(phase.openAirspaceEndsAt) >= Date.parse(phase.teamPhaseEndsAt));
    const pause = phase.timerPause ?? null;
    assert.equal(pause, null, 'Actual manual start phase has no timer hold.');
    return { phaseTurn: phase.turn, progression: phase.progression, airspace: phase.airspace.state,
      airspaceTickerActive: phase.airspace.tickerActive, airspacePressAccess: phase.airspace.pressAccess,
      timerPause: pause, teamEndsAt: phase.teamPhaseEndsAt, openEndsAt: phase.openAirspaceEndsAt };
  };
  let committed;
  if (sdkAuthority) {
    assert.equal(expected.meSessionId, expected.sessionId, 'Original own-player session must match the actual session.');
    assertOriginalActor(expected, expected, { gm: expected.gmInstanceOwned });
    assert.ok(Number.isSafeInteger(expected.hydrationRevision) && expected.hydrationRevision >= 1);
    for (const key of identityKeys) assert.ok(Object.hasOwn(expected, key), `Actual original ${key} must be sampled.`);
    if (expected.profileRoleId === null) assert.equal(expected.profileSessionId, null);
    else {
      assert.ok(typeof expected.profileRoleId === 'string' && expected.profileRoleId.length > 0);
      assert.equal(expected.profileSessionId, expected.sessionId, 'Original profile must belong to this actual session.');
    }
    assert.equal(expected.sdkHasServerAuthority, true); assert.equal(expected.sdkResumePending, false);
    assert.equal(expected.recoveryPending, false); assert.equal(expected.currentOwnPlayerConfirmed, true);
    assert.equal(expected.connected, true); assert.equal(expected.kicked, false); assert.equal(expected.escapeLocked, false);
    if (setupStart) {
      assert.equal(setupStart.endpoint, 'startGame'); assert.equal(setupStart.httpStatus, 200);
      assertOriginalActor(setupStart.before, setupStart.before, { gm: true });
      assert.equal(setupStart.before.sessionId, expected.sessionId);
      assert.equal(setupStart.before.phase, 'casting'); assert.equal(setupStart.before.cycle, 0);
      assert.equal(expected.phase, 'casting'); assert.equal(expected.cycle, 0);
      const { data, result } = setupStart;
      assert.equal(data.sessionId, expected.sessionId); assert.equal(data.instanceId, setupStart.before.instanceId);
      assert.ok(typeof data.requestId === 'string' && data.requestId.length > 0);
      assert.equal(data.expectedSetupRevision, expected.setupRevision);
      assert.equal(data.expectedSetupRevision, setupStart.before.setupRevision);
      assert.equal(result.status, 'committed'); assert.equal(result.sessionId, data.sessionId);
      assert.equal(result.requestId, data.requestId); assert.equal(result.currentTurn, 1);
      assert.equal(result.setupRevision, data.expectedSetupRevision + 1);
      assert.equal(result.fullGameDemo?.status, 'active'); assert.equal(result.fullGameDemo?.progression, 'manual');
      const phase = phaseTuple(result.turnPhase);
      assert.equal(phase.phaseTurn, result.currentTurn);
      assert.equal(result.turnStartAnnouncement?.turn, result.currentTurn);
      const revisionPresent = Object.hasOwn(result.turnStartAnnouncement, 'revision');
      if (revisionPresent) assert.ok(Number.isSafeInteger(result.turnStartAnnouncement.revision) && result.turnStartAnnouncement.revision >= 0);
      committed = { phase: 'active', cycle: result.currentTurn, setupRevision: result.setupRevision,
        ...phase, announcementTurn: result.turnStartAnnouncement.turn,
        announcementRevisionPresent: revisionPresent,
        announcementRevisionRaw: revisionPresent ? result.turnStartAnnouncement.revision : null, fullGameDemo: result.fullGameDemo };
    }
  } else assert.equal(setupStart, undefined, 'Receipt-bound setup requires actual SDK authority.');
  const matchesSource = (current, source) => sourceKeys.every(key => {
    try { assert.deepEqual(current[key], source[key]); return true; } catch { return false; }
  });
  const inspect = async () => {
    checkDeadline();
    const current = await observeLifecycleActor(surface, expected.sessionId, { sdkAuthority });
    checkDeadline();
    if (!sdkAuthority) { assertOriginalActor(expected, current, { gm: expected.gmInstanceOwned }); return { current, ready: true }; }
    assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
    assert.equal(current.uidHash, expected.uidHash); assert.equal(current.sessionId, expected.sessionId);
    assert.equal(current.meSessionId, expected.sessionId, 'Current own-player session must retain the original session.');
    assert.equal(current.generation, expected.generation);
    for (const key of identityKeys) assert.deepEqual(current[key], expected[key], `Original presentation ${key} changed.`);
    assert.equal(current.privateAudienceMatches, true); assert.equal(current.foreignPendingCount, 0);
    assert.equal(current.connected, true); assert.equal(current.currentOwnPlayerConfirmed, true);
    assert.equal(current.kicked, false); assert.equal(current.escapeLocked, false);
    for (const key of ['sdkHasServerAuthority', 'sdkResumePending', 'recoveryPending']) assert.equal(typeof current[key], 'boolean');
    const published = committed ? matchesSource(current, committed) : matchesSource(current, expected);
    assert.ok(published || committed && matchesSource(current, expected), 'Original or exact committed setup publication required.');
    if (current.connection === 'connecting') {
      assert.ok(['cache', 'server'].includes(current.freshness)); return { current, ready: false };
    }
    assertOriginalActor(expected, current, { gm: expected.gmInstanceOwned });
    assert.equal(current.sdkHasServerAuthority, true); assert.equal(current.sdkResumePending, false);
    assert.equal(current.recoveryPending, false);
    return { current, ready: published };
  };
  while (Date.now() < deadline) {
    const { current, ready } = await inspect();
    sawTransmission ||= current.transmissionPresent; sawBriefing ||= current.briefingPresent;
    if (!ready) { await delay(Math.min(100, deadline - Date.now())); continue; }
    if (current.briefingPresent && clearBriefing) {
      assert.equal(committed, undefined, 'Manual setup cannot acquire a fabricated held-briefing choice.');
      const button = surface.page.getByRole('region', { name: 'Cycle briefing clearance', exact: true })
        .getByRole('button', { name: 'Clear cycle briefing // resume clock', exact: true });
      const available = await offered(button);
      const final = await inspect();
      if (available && final.ready && final.current.briefingPresent) {
        const receipt = await captureLifecycleUiAction(surface, 'clearTurnAdvanceInterstitial', async () => {
          const beforeClick = await inspect();
          assert.equal(beforeClick.ready, true, 'Only currently live published authority clears a briefing.');
          assert.equal(beforeClick.current.briefingPresent, true); checkDeadline(); await button.click();
        }, { deadlineAt: deadline });
        checkDeadline();
        // Recovery repeats this real receipt only; its final callable also uses the original authority/deadline.
        const recoverySurface = { ...surface, callable: async (...args) => {
          assert.equal((await inspect()).ready, true); checkDeadline();
          const result = await surface.callable(...args); checkDeadline(); return result;
        } };
        const recovery = await recoverLifecycleUiAction(recoverySurface, receipt);
        await inspect(); receipts.push({ ...publicLifecycleReceipt(receipt), recovery });
      }
    }
    if (!current.transmissionPresent && !current.briefingPresent) {
      await surface.paintTwoFrames();
      const { current: painted, ready: paintReady } = await inspect();
      if (paintReady && !painted.transmissionPresent && !painted.briefingPresent) {
        checkDeadline(); return { sawTransmission, sawBriefing, receipts, actualPaintReady: true };
      }
    }
    await delay(Math.min(100, deadline - Date.now()));
  }
  throw new Error('Normal transmission/briefing did not complete inside the original presentation deadline/budget.');
}

/** Additive hooks for full games or a separately sourced ordinary timed game. */
export function createTurnCycleDemoUiProof(options = {}) {
  const requested = new Set(options.cases ?? ['gm-only-transmission', 'fleet-transmission']);
  for (const id of requested) assert.ok(TURN_CYCLE_CASES[id], `Unknown finite turn case ${id}`);
  const evidence = { schemaVersion: 1, planningSourcePin: MEMBER_TURN_SOURCE_PIN,
    actualRuntimeRuns: 0, nativeChecksAreGameplayProof: false,
    confettiScope: 'Ordinary game controls only; no Codex celebration tool.',
    cases: Object.fromEntries(Object.keys(TURN_CYCLE_CASES).map(id => [id,
      { status: 'pending', reason: requested.has(id) ? 'Awaiting actual source-offered UI.' : 'Not selected for this source scenario.' }])) };
  let binding;
  const blocked = (id, reason, affordance) => { evidence.cases[id] = { status: 'blocked-uncredited', reason, ...(affordance ? { affordance } : {}) }; };
  async function begin(context) {
    assert.ok(context.initial.sessionId && context.initial.joinCode);
    await assertMemberTurnContext(context);
    evidence.runtimeFence ??= await assertMemberTurnRuntime(context.gm, options);
    assert.deepEqual(await assertMemberTurnRuntime(context.crew, options), evidence.runtimeFence);
    binding ??= await captureMemberTurnSourceBinding(options.sourceRoot ?? process.cwd()); evidence.sourceBefore = binding;
  }
  async function save(context) {
    evidence.sourceAfter = await captureMemberTurnSourceBinding(options.sourceRoot ?? process.cwd());
    evidence.sourceUnchanged = fingerprint(evidence.sourceAfter) === fingerprint(binding);
    await mkdir(context.directory, { recursive: true });
    await writeFile(resolve(context.directory, 'turn-cycle-demo.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    assert.equal(evidence.sourceUnchanged, true, 'Source drift remains uncredited.');
  }
  async function perform(id, context, action) {
    if (!requested.has(id)) return;
    const state = await observeLifecycleActor(context.gm);
    assertOriginalActor(state, state, { gm: true });
    const availability = turnCaseAvailability(id, state);
    if (availability.status !== 'ready') { blocked(id, availability.reason); return; }
    try { const result = await action(state); if (result) evidence.cases[id] = { status: 'actual-ui-procedure-observed', ...result }; }
    catch (error) { evidence.cases[id] = { status: 'failed-uncredited', error: error.message }; await save(context); throw error; }
  }
  return { evidence,
    async onStarted(context) {
      await begin(context); const { gm, crew } = context;
      const gmExpected = await observeLifecycleActor(gm), crewExpected = await observeLifecycleActor(crew), crewUrl = crew.page.url();
      assert.notEqual(gmExpected.uidHash, crewExpected.uidHash, 'Full game has independent original GM/member Auth.');
      const controls = gm.page.getByRole('region', { name: 'Cycle controls', exact: true });
      await perform('gm-only-transmission', context, async before => {
        const control = controls.getByRole('button', { name: 'Replay last transmission // GM only', exact: true });
        const affordance = await recordLifecycleAffordance(control);
        if (!affordance.offered) return blocked('gm-only-transmission', 'A current source transmission must exist.', affordance);
        await control.click();
        await untilLifecycle(gm, before, current => current.localReplayToken !== before.localReplayToken,
          'Actual local GM presentation replay', { gm: true });
        const presentation = await completeOfferedCyclePresentation(gm, before);
        const after = await observeLifecycleActor(gm);
        assert.equal(after.announcementRevision, before.announcementRevision);
        assert.equal((await observeLifecycleActor(crew)).announcementRevision, crewExpected.announcementRevision);
        return { protocol: 'local-presentation', serverAnnouncementUnchanged: true, presentation, nextActor: 'Original GM' };
      });
      await perform('fleet-transmission', context, async before => {
        const control = controls.getByRole('button', { name: 'Replay last transmission // Everyone', exact: true });
        const affordance = await recordLifecycleAffordance(control);
        if (!affordance.offered) return blocked('fleet-transmission', 'A current source transmission must exist.', affordance);
        const receipt = await captureLifecycleUiAction(gm, 'replayTurnStartAnnouncement', () => control.click());
        await untilLifecycle(gm, before, current => current.announcementRevision === before.announcementRevision + 1,
          'Actual new fleet announcement revision', { gm: true });
        await untilLifecycle(crew, crewExpected, current => current.announcementRevision === before.announcementRevision + 1,
          'Original crew receives fleet replay');
        const gmPresentation = await completeOfferedCyclePresentation(gm, before);
        const crewPresentation = await completeOfferedCyclePresentation(crew, crewExpected);
        return { transmission: publicLifecycleReceipt(receipt), gmPresentation, crewPresentation,
          exactReplayNotSupported: true, automaticallyRepeated: false, nextActor: 'Every original console follows the same new server revision.' };
      });
      await perform('briefing-clearance', context, async before => ({ presentation:
        await completeOfferedCyclePresentation(gm, before, { clearBriefing: true }), nextActor: 'Original GM/member holding the actual cycle briefing.' }));
      for (const id of ['airspace-restricted-extension', 'natural-open', 'airspace-open-extension', 'emergency-timer']) {
        await perform(id, context, async before => {
          if (id === 'natural-open') {
            const remaining = Date.parse(before.teamEndsAt) - Date.now();
            if (!Number.isFinite(remaining) || remaining < 0 || remaining >= 60_000) return blocked(id,
              'Observe in a separate ordinary timed game within 60 seconds of the real Team deadline; no clock acceleration or early SDK handoff.');
            const response = await observeUiReceipt({ page: gm.page,
              consumed: { endpoint: 'beginOpenAirspacePhase', before, automatic: true },
              waitForResponse: () => gm.page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/us-central1/beginOpenAirspacePhase') &&
                r.request().method() === 'POST', { timeout: 60_000 }),
              choose: async () => {},
            });
            const data = response.request().postDataJSON()?.data;
            assertNaturalOpenRequest(before, data, Date.now()); const body = await response.json();
            assert.ok(response.status() < 400 && !body.error);
            await untilLifecycle(gm, before, current => current.airspace === 'lifted', 'Natural source Team handoff', { gm: true });
            return { requestFingerprint: fingerprint(data), resultFingerprint: fingerprint(body.result),
              naturalDeadlineObserved: true, initialSdkMutation: false, nextActor: 'Coordination actors' };
          }
          if (id === 'emergency-timer') {
            if (!options.emergencyScenario?.trim()) return blocked(id, 'Specify the actual disclosed GM emergency/training scenario; no emergency or physical fact is invented.');
            const region = gm.page.getByRole('region', { name: 'Emergency timer control', exact: true });
            const first = region.getByRole('button', { name: 'Disarm interlock // Pause timer', exact: true });
            if (!await offered(first)) return blocked(id, 'An unpaused ordinary timer and source eligibility must be offered.', await recordLifecycleAffordance(first));
            const reason = region.getByRole('textbox', { name: 'Attack timer intervention reason', exact: true });
            if (await reason.count()) await reason.fill(options.emergencyScenario);
            const sequence = async (prefix, firstLabel) => {
              await region.getByRole('button', { name: firstLabel, exact: true }).click();
              await region.getByRole('button', { name: `${prefix} // 2 confirmations remaining`, exact: true }).click();
              return captureLifecycleUiAction(gm, 'setEmergencyTimerPaused', () =>
                region.getByRole('button', { name: `${prefix} // 1 confirmation remaining`, exact: true }).click());
            };
            const pause = await sequence('Disarm interlock', 'Disarm interlock // Pause timer');
            await untilLifecycle(gm, before, current => current.timerPause !== null, 'Actual normal emergency pause', { gm: true });
            const resume = await sequence('Re-arm interlock', 'Re-arm interlock // Resume timer');
            await untilLifecycle(gm, before, current => current.timerPause === null, 'Actual normal emergency resume', { gm: true });
            return { gmChoice: options.emergencyScenario, pause: publicLifecycleReceipt(pause), resume: publicLifecycleReceipt(resume),
              automaticExactRepeat: false, nextActor: 'Original live timed-game actors' };
          }
          const window = id.includes('restricted') ? 'restricted' : 'open';
          const label = window === 'restricted' ? 'Airspace restricted' : 'Airspace open';
          const region = controls.getByRole('region', { name: 'Airspace time controls', exact: true });
          const first = region.getByRole('button', { name: `Add 5 minutes // ${label}`, exact: true });
          if (!await offered(first)) return blocked(id, 'Named current source time-extension control is not offered.', await recordLifecycleAffordance(first));
          await first.click();
          const receipt = await captureLifecycleUiAction(gm, 'extendAirspaceWindow', () => region.getByRole('button',
            { name: `ARE YOU SURE? // Add 5 minutes // ${label}`, exact: true }).click());
          const beforeDeadline = Date.parse(window === 'restricted' ? before.teamEndsAt : before.openEndsAt);
          const after = await untilLifecycle(gm, before, current => Date.parse(window === 'restricted' ? current.teamEndsAt : current.openEndsAt) === beforeDeadline + 300_000,
            'Exactly one offered five-minute extension', { gm: true });
          return { extension: publicLifecycleReceipt(receipt), exactlyFiveMinutesAdded: true, exactReplayNotSupported: true,
            afterDeadline: window === 'restricted' ? after.teamEndsAt : after.openEndsAt, nextActor: 'Current timed phase actors' };
        });
      }
      await perform('game-finale', context, async before => {
        const region = gm.page.getByRole('region', { name: 'Finale controls', exact: true });
        const first = region.getByRole('button', { name: 'Finale // Enable debrief mode', exact: true });
        if (!await offered(first)) return blocked('game-finale', 'This case begins with the ordinary visual finale off.', await recordLifecycleAffordance(first));
        await first.click();
        const enable = await captureLifecycleUiAction(gm, 'setDebriefMode', () => region.getByRole('button', { name: 'ARE YOU SURE? // Enable finale', exact: true }).click());
        await untilLifecycle(gm, before, s => s.debriefMode?.active === true, 'Normal shared game finale enabled', { gm: true });
        const repeat = await recoverLifecycleUiAction(gm, enable, { stateRepeat: true });
        const retract = await captureLifecycleUiAction(gm, 'setDebriefMode', () => region.getByRole('button', { name: 'Retract finale // Stop confetti', exact: true }).click());
        await untilLifecycle(gm, before, s => s.debriefMode?.active === false, 'Normal game finale retracted', { gm: true });
        return { enable: publicLifecycleReceipt(enable), repeat, retract: publicLifecycleReceipt(retract),
          genuineTerminalClaimed: false, nextActor: 'Original GM continues actual game' };
      });
      for (const id of ['bridge-confetti', 'newspaper-confetti']) await perform(id, context, async () => {
        const roles = id === 'newspaper-confetti' ? ['press-officer'] : options.bridgeRoleIds;
        if (!Array.isArray(roles) || roles.length < 1 || roles.length > 2) return blocked(id, 'Specify one or two current original source bridgeRoleIds; a second officer is a genuine separate Auth choice.');
        const receipts = []; let fired = false;
        for (const roleId of roles) {
          const row = context.roster.find(row => row.roleId === roleId);
          if (!row) return blocked(id, `Original admitted ${roleId} is absent; no synthetic officer/Press actor.`);
          await createTwoBrowserGameplay(context).select(roleId);
          const coverName = id === 'newspaper-confetti' ? 'Open newspaper confetti cover' : 'Open confetti activation cover';
          const actionName = id === 'newspaper-confetti' ? 'Activate newspaper confetti' : 'Activate Emergency Bridge Confetti Dispenser';
          const cover = crew.page.getByRole('button', { name: coverName, exact: true });
          if (!await offered(cover)) return blocked(id, 'The original current console must offer an unspent dispenser/cover.', await recordLifecycleAffordance(cover));
          await cover.click();
          const receipt = await captureLifecycleUiAction(crew, 'popShipConfetti', () => crew.page.getByRole('button', { name: actionName, exact: true }).click());
          if (receipts.length) assert.equal(receipt.data.shipId, receipts[0].shipId, 'Second officer must act on the same real bridge dispenser.');
          assert.ok(['fired', 'awaiting-officer'].includes(receipt.result.status ?? receipt.result));
          const recovery = id === 'newspaper-confetti' ? await recoverLifecycleUiAction(crew, receipt) : null;
          receipts.push({ ...publicLifecycleReceipt(receipt), recovery });
          fired = (receipt.result.status ?? receipt.result) === 'fired'; if (fired) break;
        }
        if (!fired) { blocked(id, 'A genuine second source-allowed current officer is still required; first approval is not a fired result.'); evidence.cases[id].partialReceipts = receipts; return; }
        return { receipts, actualGameUiOnly: true, exactReceiptSupported: id === 'newspaper-confetti',
          cost: id === 'newspaper-confetti' ? 'Reusable newspaper dispenser; actual source replay does not fire a second signal.' : 'One bridge dispenser use; no fabricated approval and no automatic repeat.', nextActor: crewExpected.profileRoleId };
      });
      // Finish active cases with the original selected browser B identity/UI.
      await crew.page.goto(crewUrl);
      await untilLifecycle(crew, crewExpected, s => s.sameActor && s.sessionId === crewExpected.sessionId && s.connection === 'live' && s.freshness === 'server', 'Original crew restored after turn cases');
      await perform('manual-coordination', context, async before => {
        const button = controls.getByRole('button', { name: 'Open Coordination manually', exact: true });
        const affordance = await recordLifecycleAffordance(button);
        if (!affordance.offered) return blocked('manual-coordination', 'Resolve the actual displayed source blocker; never bypass the Team guard.', affordance);
        const receipt = await captureLifecycleUiAction(gm, 'advanceFullGameDemoPhase', () => button.click());
        await untilLifecycle(gm, before, s => s.airspace === 'lifted' && s.cycle === before.cycle && s.progression === 'manual', 'Source normal manual Coordination', { gm: true });
        return { phase: publicLifecycleReceipt(receipt), recovery: await recoverLifecycleUiAction(gm, receipt), noCountdownInjected: true, nextActor: 'Coordination actors' };
      });
      for (const id of ['cycle-advance', 'cycle-skip']) await perform(id, context, async before => {
        if (id === 'cycle-skip' && !options.skipScenario?.trim()) return blocked(id, 'Supply a separate disclosed GM skip scenario; this is not the ordinary final-cycle progression.');
        const next = before.cycle + 1, firstLabel = `${id === 'cycle-skip' ? 'Skip' : 'Advance'} to Cycle ${next}`;
        const first = controls.getByRole('button', { name: firstLabel, exact: true });
        if (!await offered(first)) return blocked(id, 'The actual source cycle action is unavailable.', await recordLifecycleAffordance(first));
        let confirmationClicked = false;
        const receipt = await captureLifecycleUiAction(gm, 'advanceTurn', async () => {
          if (id === 'cycle-skip') {
            await first.click(); await controls.getByRole('button', { name: `ARE YOU SURE? // Skip to Cycle ${next}`, exact: true }).click(); confirmationClicked = true;
          } else {
            const confirmation = controls.getByRole('button', { name: `ARE YOU SURE? // Advance to Cycle ${next}`, exact: true });
            const result = await completeOfferedTurnAdvance({ expected: before,
              inspect: async () => ({ ...(await observeLifecycleActor(gm)), confirmationOffered: await confirmation.isVisible() }),
              clickAdvance: () => first.click(), clickConfirmation: () => confirmation.click() });
            confirmationClicked = result.confirmationClicked;
          }
        });
        const after = await observeLifecycleActor(gm);
        if (after.phase === 'debrief' && after.cycle === before.cycle) assertObservedTerminal(after);
        else assertActualCycleTransition(before, after, receipt.result);
        const recovery = await recoverLifecycleUiAction(gm, receipt);
        const presentation = await completeOfferedCyclePresentation(gm, after, { clearBriefing: options.clearProducedBriefing === true });
        return { advance: publicLifecycleReceipt(receipt), recovery, confirmationActuallyOffered: confirmationClicked,
          ...(id === 'cycle-skip' ? { gmChoice: options.skipScenario } : {}), presentation, nextActor: 'Actors in the actual resulting cycle/ending' };
      });
      await save(context);
    },
    /** Invoke after a genuine source ending. It cannot manufacture a terminal. */
    async onTerminal(context) {
      await begin(context);
      if (requested.has('genuine-terminal')) {
        let current = await observeLifecycleActor(context.gm);
        const originalCrew = await observeLifecycleActor(context.crew);
        assert.equal(originalCrew.sessionId, context.initial.sessionId);
        const receipts = [];
        if (['success', 'failure'].includes(current.phase)) {
          const freeze = context.gm.page.getByRole('button', { name: 'Freeze failure into debrief', exact: true });
          if (!await offered(freeze)) { blocked('genuine-terminal', 'The actual ending must offer the normal GM failure freeze.'); await save(context); return; }
          const receipt = await captureLifecycleUiAction(context.gm, 'beginSessionDebrief', () => freeze.click());
          receipts.push({ ...publicLifecycleReceipt(receipt), recovery: await recoverLifecycleUiAction(context.gm, receipt) });
          current = await untilLifecycle(context.gm, current, s => s.phase === 'debrief' && s.debriefSnapshot, 'Actual failure frozen into source debrief', { gm: true });
        }
        if (!['debrief', 'closed'].includes(current.phase)) blocked('genuine-terminal', 'Root must first produce a genuine source ending; visual finale mode earns no terminal credit.');
        else {
          const terminal = assertObservedTerminal(current);
          if (current.phase === 'debrief' && options.closeProducedDebrief === true) {
            const close = context.gm.page.getByRole('button', { name: 'Close session', exact: true });
            if (!await offered(close)) { blocked('genuine-terminal', 'Wait for the committed source snapshot and current original GM close control.'); await save(context); return; }
            const receipt = await captureLifecycleUiAction(context.gm, 'closeSession', () => close.click());
            receipts.push({ ...publicLifecycleReceipt(receipt), recovery: await recoverLifecycleUiAction(context.gm, receipt) });
            await context.gm.until('Genuine closed source phase', s => s.phase === 'closed');
          }
          await context.crew.page.reload();
          const restored = await untilLifecycle(context.crew, originalCrew, s =>
            s.sameActor && s.connection === 'live' && s.freshness === 'server' && ['debrief', 'closed'].includes(s.phase),
          'Original crew reloads genuine terminal history');
          assert.equal(restored.sessionId, context.initial.sessionId); assert.equal(restored.privateCount, 0);
          evidence.cases['genuine-terminal'] = { status: 'actual-source-terminal-observed', terminal, receipts,
            crewPrivateCacheCleared: true, wholeRoleFunctionCredit: false };
        }
      }
      await save(context);
    },
  };
}

/** Separate fresh one-member path. Caller supplies the existing ordinary surface;
 * this function never launches a browser, signs in as another UID or seeds a game.
 */
export async function runFreshSolePlayerCycleDemo({ member, directory }, options = {}) {
  const evidence = { schemaVersion: 1, fullGameStartCredit: false, wholeGameCredit: false,
    path: 'Separate fresh sole-player existing Cycle 0→1 demo', normalConsentRequired: true,
    adminGameplayWrites: false, clockAccelerated: false, sourceBefore: await captureMemberTurnSourceBinding(options.sourceRoot ?? process.cwd()) };
  const url = new URL(member.page.url()); assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  evidence.runtimeFence = await assertMemberTurnRuntime(member, options);
  assert.equal(url.searchParams.has('demoActor'), false, 'Use a fresh normal default document, not a full-game persona document.');
  const old = await observeLifecycleActor(member); assert.equal(old.sessionId, null);
  try {
    const create = await observeUiReceipt({ page: member.page, waitForResponse: () => member.page.waitForResponse(r =>
      new URL(r.url()).pathname.endsWith('/us-central1/createSession') && r.request().method() === 'POST'),
    choose: () => member.page.getByRole('button', { name: 'Create a session', exact: true }).click() });
    assert.ok(create.status() < 400 && !(await create.json()).error);
    await member.consent();
    const initial = await member.until('Fresh sole ordinary member', s => s.hasAuth && s.sameActor && s.sessionId && s.cycle === 0 && s.connection === 'live' && s.freshness === 'server');
    if (old.uidHash) assert.equal(initial.uidHash, old.uidHash);
    const before = await observeLifecycleActor(member);
    const presence = await member.callable('getSessionPresence', { sessionId: initial.sessionId });
    assert.equal(presence.status, 'committed');
    assertSolePlayerCycleDemo({ ...before, connectedPlayers: presence.result.connectedPlayers });
    evidence.originalUidHash = before.uidHash; evidence.sessionId = before.sessionId;
    evidence.presenceRead = { transport: 'Entitled normal SDK read only', connectedPlayers: presence.result.connectedPlayers };
    const settings = await openLifecycleSettings(member);
    const start = await captureLifecycleUiAction(member, 'startSinglePlayerDemo', () => settings.getByRole('button', { name: 'Start single-player demo', exact: true }).click());
    await untilLifecycle(member, before, s => s.cycle === 1 && s.singlePlayerDemo?.status === 'active', 'Actual sole-player Cycle 1 marker');
    evidence.start = publicLifecycleReceipt(start); evidence.automaticExactStartRepeat = false;
    evidence.presentation = await completeOfferedCyclePresentation(member, before, { clearBriefing: true });
    if (options.completeWithNormalLocalGm === true) {
      const dialog = await openLifecycleSettings(member);
      const authorize = dialog.getByRole('button', { name: 'Authorize local emulator GM', exact: true });
      assert.equal(await offered(authorize), true, 'Normal local GM authorization must be visibly offered.');
      const grant = await captureLifecycleUiAction(member, 'loginGmAccess', () => authorize.click());
      await closeLifecycleSettings(dialog);
      await member.page.getByRole('link', { name: 'GM join', exact: true }).click();
      await member.page.getByRole('textbox', { name: 'Input GM Name', exact: true }).fill(options.gmName ?? 'PC10 sole-cycle GM');
      const claim = await captureLifecycleUiAction(member, 'claimGmInstance', () => member.page.getByRole('button', { name: 'Join as GM', exact: true }).click());
      const gm = await untilLifecycle(member, before, s => s.gmInstanceOwned && s.playerRole === 'gm', 'Original sole member normally claims GM');
      const consoleLink = member.page.getByRole('link', { name: 'GM Console', exact: true });
      if (!await consoleLink.isVisible()) {
        const catalog = new URL(member.page.url()); catalog.hash = '/console'; await member.page.goto(catalog.href);
      }
      await member.page.getByRole('link', { name: 'GM Console', exact: true }).click();
      const region = member.page.getByRole('region', { name: 'Cycle controls', exact: true });
      const first = region.getByRole('button', { name: 'Advance to Cycle 2', exact: true });
      const complete = await captureLifecycleUiAction(member, 'advanceTurn', async () => {
        await first.click();
        const confirm = region.getByRole('button', { name: 'ARE YOU SURE? // Advance to Cycle 2', exact: true });
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
          const state = await observeLifecycleActor(member); assertOriginalActor(gm, state, { gm: true });
          if (state.singlePlayerDemo?.status === 'complete') return;
          if (await offered(confirm)) { await confirm.click(); return; }
          await delay(100);
        }
        throw new Error('Normal sole-cycle completion/confirmation did not appear.');
      });
      await untilLifecycle(member, gm, s => s.cycle === 1 && s.singlePlayerDemo?.status === 'complete', 'Source Cycle 1 terminal demo boundary', { gm: true });
      assert.equal(complete.result.currentTurn, 1); assert.equal(complete.result.status, 'complete');
      evidence.normalGm = { grant: publicLifecycleReceipt(grant), claim: publicLifecycleReceipt(claim) };
      evidence.completion = { receipt: publicLifecycleReceipt(complete), recovery: await recoverLifecycleUiAction(member, complete),
        cycle: 1, currentUidPreserved: true, genuineFullGameDebriefClaimed: false };
    } else evidence.completion = { status: 'blocked-uncredited', reason: 'Source completion requires a normal eligible GM and offered advance; no automatic deadline completion is invented.' };
  } catch (error) { evidence.failure = error.message; throw error; }
  finally {
    evidence.sourceAfter = await captureMemberTurnSourceBinding(options.sourceRoot ?? process.cwd());
    evidence.sourceUnchanged = fingerprint(evidence.sourceBefore) === fingerprint(evidence.sourceAfter);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'sole-player-cycle-demo.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    assert.equal(evidence.sourceUnchanged, true);
  }
  return evidence;
}
