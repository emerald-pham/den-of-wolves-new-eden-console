import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { CANDIDATE_PROOF_SHIPS } from './pc10-candidate-proof-helpers.mjs';
import { assertWolfChoiceActor, createWolfChoiceWaiter, observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';
import { assertOriginalBaseActor, baseWolfActionExpectation } from './pc10-base-combat-deduction-contracts.mjs';
import { selectBaseRangeTargetControls } from './pc10-base-range-target-controls.mjs';
const attackSummary = value => value && ({
  status: value.status, revision: value.revision, currentStep: value.currentStep,
  turn: value.turn, enemyCount: value.preparation?.shipIds?.length,
  stationRepeatStatus: value.pStationRepeat?.status,
});

/** Resolve an actually declared current attack. No roster, dice or survivor input. */
export async function resolveLiveWolfAttack(context, { tools = candidateGameplayTools(context),
  timeoutMs = 8 * 60_000, declareIfPlanned = false, verifyReplay = true, chooseNext } = {}) {
  const { gm, roster } = context;
  const replays = [];
  assert.ok(timeoutMs > 0 && timeoutMs <= 8 * 60_000, 'Keep the existing maximum eight-minute combat budget.');
  const originalGm = await gm.observe();
  const originalReadGm = typeof gm.storeModuleUrl === 'function' ? await observeWolfChoiceActor(gm) : null;
  if (originalReadGm) assertOriginalBaseActor(originalReadGm, originalGm);
  let deadline, stageDeadline, stageKey, nextAttack, closedProgress;
  const readySources = new WeakMap();
  let sourceWait;
  async function waitChoice(surface, current, spec) {
    const result = await sourceWait(surface, current, spec, { deadlineAt: stageDeadline });
    readySources.delete(surface);
    if (result.status === 'eligible') readySources.set(surface, { expected: result.expected, actor: result.originalActor });
    return result;
  }
  const select = (roleId, options = {}) => tools.select(roleId, { ...options, deadlineAt: stageDeadline });
  async function uiReceipt(surface, endpoint, decision, expectedAction = {}) {
    const bound = readySources.get(surface);
    if (bound) {
      assertWolfChoiceActor(await observeWolfChoiceActor(surface), bound.actor);
      assertOriginalBaseActor(await gm.observe(), originalGm);
      const current = await attack();
      for (const key of ['attackId', 'turn', 'revision', 'currentStep', 'status'])
        assert.equal(current[key], bound.expected[key], `Current source ${key} changed before the UI choice.`);
      assert.ok(Date.now() < stageDeadline && Date.now() < deadline, 'Current choice must stay within its original stage budget.');
    }
    let result;
    const response = await observeUiReceipt({
      waitForResponse: () => surface.page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`)),
      choose: async () => { result = await tools.receipt(surface, endpoint, decision); },
    });
    const request = response.request().postDataJSON()?.data;
    if (bound) {
      assertWolfChoiceActor(await observeWolfChoiceActor(surface), bound.actor);
      assertOriginalBaseActor(await gm.observe(), originalGm);
      const expectedRequest = { ...expectedAction, ...baseWolfActionExpectation(endpoint, bound.expected),
        ...(endpoint === 'assignWolfRangeTargets' ? { range: bound.expected.currentStep } : {}) };
      for (const [key, value] of Object.entries(expectedRequest))
        assert.deepEqual(request?.[key], value, `The actual UI request must retain the ready source ${key}.`);
    }
    if (verifyReplay && typeof request?.requestId === 'string') {
      const replay = await surface.callable(endpoint, request);
      assert.equal(replay.status, 'committed', `${endpoint} original actor exact receipt recovery`);
      assert.deepEqual(replay.result, result, `${endpoint} exact receipt must preserve server rolls and consequences`);
      replays.push({ endpoint, requestFingerprint: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
        resultFingerprint: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
        transport: 'actual original browser Auth SDK, captured unchanged UI request', status: 'identical' });
    }
    return result;
  }
  const attack = () => tools.read('gm', 'wolfAttackState/current');
  async function afterChoice(previous, reason = 'Real Wolf choice did not commit', boardingSourceClosed) {
    const consequenceDeadline = Math.min(Date.now() + 60_000, deadline, stageDeadline); let current;
    let heldActor, heldGm, actorWindow, gmWindow;
    const budget = () => assert.ok(Date.now() < consequenceDeadline,
      'Original boarding source progress deadline expired; no new choice, mutation or credit.');
    function authority(currentActor, originalActor, priorWindow) {
      const unchanged = currentActor.airspace === originalActor.airspace && currentActor.turnStatePhase === originalActor.turnStatePhase;
      const restored = originalActor.airspace === 'restricted' && currentActor.airspace === 'lifted' &&
        ['team', 'coordination'].includes(originalActor.turnStatePhase) && currentActor.turnStatePhase === 'coordination';
      assert.ok(unchanged || restored, 'Original boarding source wait has no proven full forward restoration.');
      if (priorWindow.airspace === 'lifted') {
        assert.equal(currentActor.airspace, 'lifted'); assert.equal(currentActor.turnStatePhase, 'coordination');
      }
      assertWolfChoiceActor({ ...currentActor, airspace: originalActor.airspace,
        turnStatePhase: originalActor.turnStatePhase }, originalActor);
      assert.equal(currentActor.entitledShipId, originalActor.entitledShipId);
      assert.deepEqual(currentActor.discoveryAuthority, originalActor.discoveryAuthority,
        'Original boarding source wait discovery authority changed.');
      return { airspace: currentActor.airspace, turnStatePhase: currentActor.turnStatePhase };
    }
    async function heldAuthority() {
      budget(); const actor = await observeWolfChoiceActor(boardingSourceClosed.surface); budget();
      actorWindow = authority(actor, heldActor, actorWindow);
      const facilitator = await observeWolfChoiceActor(gm); budget();
      gmWindow = authority(facilitator, heldGm, gmWindow);
      return { actor, facilitator };
    }
    if (boardingSourceClosed) {
      budget(); const ready = boardingSourceClosed.readiness;
      assert.equal(ready.status, 'source-excluded'); assert.equal(ready.reason, 'no-special-choice');
      assert.equal(ready.choice?.type, 'wolf-boarding-special-choice-unavailable');
      assert.equal(ready.choice.sessionId, context.initial.sessionId);
      assert.equal(ready.choice.reason, 'no-special-choice');
      for (const key of ['attackId', 'turn', 'revision', 'currentStep', 'status']) assert.equal(ready.expected[key], previous[key]);
      assert.equal(previous.status, 'declared'); assert.equal(previous.currentStep, 'boarding');
      assert.equal(previous.airspaceLocked, true);
      heldActor = ready.originalActor;
      assert.equal(heldActor?.playerRole, 'player');
      assert.ok(roster.some(actor => actor.roleId === heldActor.profileRoleId && actor.uidHash === heldActor.uidHash));
      const facilitator = await observeWolfChoiceActor(gm); budget();
      assertOriginalBaseActor(facilitator, originalGm);
      // The richer observer supplies the real GM lease/audience fields omitted
      // by the generic driver. No member seat/group/generation is invented.
      assert.ok(originalReadGm, 'Original GM store authority is required before the boarding choice read.');
      heldGm = originalReadGm;
      for (const key of ['sessionId', 'uidHash', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId', 'playerRole',
        'phase', 'cycle', 'fleetGroupId', 'connectionGeneration', 'identityHydrationRevision', 'replacementRoleId',
        'replacementStatus', 'seatId', 'discoveryAuthority', 'entitledShipId', 'phaseProgression']) {
        for (const actor of [heldActor, heldGm]) assert.ok(Object.hasOwn(actor, key) && actor[key] !== undefined,
          `Original boarding source wait requires ${key} evidence.`);
        if (Object.hasOwn(originalGm, key)) assert.deepEqual(heldGm[key], originalGm[key], `Original GM ${key} changed before source waiting.`);
      }
      for (const actor of [heldActor, heldGm]) {
        assert.equal(actor.sessionId, context.initial.sessionId); assert.equal(actor.cycle, previous.turn);
        assert.equal(actor.phase, 'active'); assert.equal(actor.phaseProgression, 'manual');
        assert.equal(actor.airspace, 'restricted'); assert.ok(['team', 'coordination'].includes(actor.turnStatePhase));
        assert.ok(Number.isSafeInteger(actor.connectionGeneration) && actor.connectionGeneration >= 0);
        assert.ok(Number.isSafeInteger(actor.identityHydrationRevision) && actor.identityHydrationRevision > 0);
      }
      assert.equal(heldGm.playerRole, 'gm');
      actorWindow = heldActor; gmWindow = facilitator;
      await heldAuthority();
    }
    while (Date.now() < consequenceDeadline) {
      if (boardingSourceClosed) await heldAuthority();
      current = await attack();
      if (boardingSourceClosed) {
        budget();
        assert.ok(current && (!Object.hasOwn(current, 'sessionId') || current.sessionId === context.initial.sessionId));
        assert.equal(current.attackId, previous.attackId, 'Original boarding source wait attack changed.');
        assert.equal(current.turn, previous.turn, 'Original boarding source wait cycle changed.');
        assert.ok(Number.isSafeInteger(current.revision) && current.revision >= previous.revision,
          'Original boarding source wait revision is missing or stale.');
        const held = await heldAuthority();
        if (current.revision > previous.revision) {
          if (current.status === 'resolved') {
            assert.equal(current.currentStep, 'resolved'); assert.equal(current.airspaceLocked, false);
            nextAttack = closedProgress = current; return current;
          }
          // Normal finalization can first request the actual Commander ruling
          // after locked rolls. Only that exact new source control can continue.
          assert.equal(current.status, 'declared'); assert.equal(current.currentStep, 'boarding');
          assert.equal(current.airspaceLocked, true);
          const target = current.boardingCommanderRulingRequiredTarget;
          assert.ok(typeof target === 'string' && target && previous.boardingCommanderRulingRequiredTarget === undefined &&
            target === previous.boardingCommanderChoice?.targetShipId && current.boardingCommanderRuling === undefined,
          'Only the actual new pending Commander ruling may continue declared boarding.');
          assert.deepEqual(current.boardingCommanderChoice, previous.boardingCommanderChoice);
          assertWolfChoiceActor(held.actor, heldActor); assertWolfChoiceActor(held.facilitator, heldGm);
          nextAttack = closedProgress = current; return current;
        }
        assert.equal(current.status, 'declared'); assert.equal(current.currentStep, 'boarding');
        assert.equal(current.airspaceLocked, true);
        await delay(200); continue;
      }
      if (current?.revision > previous.revision || current?.attackId !== previous.attackId) return current;
      await delay(200);
    }
    if (boardingSourceClosed) budget();
    throw new Error(`${reason}: ${JSON.stringify(attackSummary(current))}`);
  }
  async function commanderRole(current) {
    const uid = current.decisionSummary?.commander?.actors?.[0]?.uid;
    if (!uid) return null;
    const uidHash = createHash('sha256').update(uid).digest('hex').slice(0, 16);
    const actor = roster.find(value => value.uidHash === uidHash);
    assert.ok(actor, 'The actual Commander must be one of the admitted accounts.');
    return actor.roleId;
  }
  async function targeting(current) {
    const roleId = await commanderRole(current);
    if (roleId && current.decisionSummary?.commander?.status === 'pending') {
      const surface = await select(roleId, { enter: false });
      const url = new URL(surface.page.url()); url.hash = '/brief'; await surface.page.goto(url.href);
      await surface.until('Actual current Commander brief', value => value.sameActor && value.connection === 'live' && value.freshness === 'server');
      const ready = await waitChoice(surface, current, { kind: 'commander-targeting' });
      if (ready.status === 'source-changed') return;
      assert.equal(ready.status, 'eligible', 'The required Commander control must actually be offered.');
      await uiReceipt(surface, 'finishWolfCommanderTargetingRerolls', () => surface.page.getByRole('button', { name: 'Finish rerolls', exact: true }).click());
      await afterChoice(current); return;
    }
    const wing = await select('wing-commander');
    for (const [label, sourceId] of [['Fighter Wing Alpha', 'fighter-wing-alpha'], ['Fighter Wing Bravo', 'fighter-wing-bravo']]) {
      const ready = await waitChoice(wing, current, { kind: 'aegis-launch', sourceId });
      if (ready.status === 'source-changed') return;
      if (ready.status !== 'eligible') continue;
      const launch = wing.page.getByRole('button', { name: `Launch ${label}`, exact: true });
      if (await launch.isVisible() && await launch.isEnabled()) {
        const prior = await attack();
        await uiReceipt(wing, 'launchAegisFighterWing', () => launch.click());
        await afterChoice(prior); return;
      }
      const pass = wing.page.getByRole('button', { name: `Pass ${label}`, exact: true });
      assert.equal(await pass.isEnabled(), true, 'Use only the source-offered explicit pass.');
      await uiReceipt(wing, 'passWolfFighterLaunchChoice', () => pass.click());
      await afterChoice(current); return;
    }
    const executive = await select('executive-officer');
    const warheadReady = await waitChoice(executive, current, { kind: 'warheads' });
    if (warheadReady.status === 'source-changed') return;
    const enrich = executive.page.getByRole('button', { name: 'Enrich warheads // 5 ore', exact: true });
    if (warheadReady.status === 'eligible') {
      const pass = executive.page.getByRole('button', { name: 'Pass enriched warheads', exact: true });
      const control = await enrich.isVisible() && await enrich.isEnabled() ? enrich : pass;
      await uiReceipt(executive, 'commitAegisEnrichedWarheadChoice', () => control.click());
      await afterChoice(current); return;
    }
    const commandReady = await waitChoice(executive, current, { kind: 'command-and-control' });
    if (commandReady.status === 'source-changed') return;
    const cnc = executive.page.getByRole('button', { name: 'Pass Command and Control', exact: true });
    if (commandReady.status === 'eligible') {
      await uiReceipt(executive, 'passAegisCommandAndControl', () => cnc.click());
      await afterChoice(current); return;
    }
    await afterChoice(current, 'Current Wing and EO targeting controls have only explicit blockers and no source progress; no role reload fallback');
  }
  async function fighterRange(current) {
    if (current.currentStep === 'long-range') return false;
    const range = current.currentStep === 'medium-range' ? 'Medium Range' : 'Short Range';
    const wing = await select('wing-commander');
    for (const [label, sourceId] of [['Fighter Wing Alpha', 'fighter-wing-alpha'], ['Fighter Wing Bravo', 'fighter-wing-bravo']]) {
      const ready = await waitChoice(wing, current, { kind: 'fighter-range', sourceId, range: current.currentStep });
      if (ready.status === 'source-changed') return true;
      if (ready.status !== 'eligible') continue;
      const panel = wing.page.getByRole('region', { name: `${label} ${range} actions`, exact: true });
      const commit = panel.getByRole('button', { name: range === 'Medium Range' ? 'Resolve Medium actions' : 'Pass Short Range', exact: true });
      if (!(await commit.isVisible())) continue;
      if (range === 'Medium Range') {
        const actions = panel.getByRole('combobox', { name: /^Fighter \d+ action$/ });
        for (let i = 0; i < await actions.count(); i++) {
          const action = actions.nth(i), label = (await action.getAttribute('aria-label')).replace('action', 'target');
          await action.selectOption('attack');
          const target = panel.getByRole('combobox', { name: label, exact: true });
          const options = await target.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled).map(node => ({ value: node.value, label: node.textContent })));
          if (!options.length) continue;
          const chosen = options.find(option => /battlestation/i.test(option.label)) ?? options[i % options.length];
          await target.selectOption(chosen.value);
        }
        if (!(await commit.isEnabled())) {
          const pass = panel.getByRole('button', { name: 'Pass Medium Range', exact: true });
          if (!(await pass.isEnabled())) continue;
          await uiReceipt(wing, 'commitWolfFighterRangeActionChoice', () => pass.click());
        } else await uiReceipt(wing, 'commitWolfFighterRangeActionChoice', () => commit.click());
      } else {
        for (const checkbox of await panel.getByRole('checkbox', { name: /^Fighter \d+ Short attack$/ }).all()) await checkbox.check();
        const resolve = panel.getByRole('button', { name: 'Resolve selected Short attacks', exact: true });
        const attackButton = await resolve.isEnabled() ? resolve : panel.getByRole('button', { name: 'Pass Short Range', exact: true });
        await uiReceipt(wing, 'commitWolfFighterRangeActionChoice', () => attackButton.click());
      }
      await afterChoice(current); return true;
    }
    return false;
  }
  async function supportRange(current) {
    const miner = await select('icebreaker-miner');
    const link = miner.page.getByRole('link', { name: 'Open Highwall shuttle console', exact: true });
    await link.waitFor({ state: 'visible', timeout: Math.max(1, Math.min(35_000, stageDeadline - Date.now())) });
    await link.click();
    const ready = await waitChoice(miner, current, { kind: 'range-support', sourceId: 'highwall', range: current.currentStep });
    if (ready.status === 'source-changed') return true;
    if (ready.status !== 'eligible') return false;
    const range = { 'long-range': 'Long Range', 'medium-range': 'Medium Range', 'short-range': 'Short Range' }[current.currentStep];
    const panel = miner.page.getByRole('region', { name: `Highwall Cannon ${range} choice`, exact: true });
    const use = panel.getByRole('button', { name: 'Use Highwall Cannon', exact: true });
    const pass = panel.getByRole('button', { name: 'Pass this range', exact: true });
    if (!(await pass.isVisible()) || !(await pass.isEnabled())) return false;
    await uiReceipt(miner, 'commitWolfRangeSupportActionChoice', () => (use.isEnabled().then(enabled => enabled ? use : pass)).then(button => button.click()));
    await afterChoice(current); return true;
  }
  async function aegisRange(current) {
    const executive = await select('executive-officer');
    const ready = await waitChoice(executive, current, { kind: 'range-actions' });
    if (ready.status === 'source-changed') return;
    assert.equal(ready.status, 'eligible', 'The current required EO range or target-assignment controls must actually be offered.');
    const panel = executive.page.getByRole('region', { name: 'Wolf range actions', exact: true });
    const use = panel.getByRole('button', { name: 'Use selected actions', exact: true });
    if (await use.isVisible()) {
      const checkboxes = panel.getByRole('checkbox');
      for (const box of await checkboxes.all()) await box.check();
      const button = await use.isEnabled() ? use : panel.getByRole('button', { name: 'Pass this range', exact: true });
      await uiReceipt(executive, 'commitWolfRangeActionChoice', () => button.click());
    } else {
      const view = ready.choice;
      assert.equal(view.turn, current.turn); assert.equal(view.revision, current.revision);
      assert.equal(view.currentStep, current.currentStep); assert.equal(view.range, current.currentStep);
      const assignments = await selectBaseRangeTargetControls({ panel, view,
        deadlineAt: Math.min(stageDeadline, deadline),
        checkpoint: async () => assertWolfChoiceActor(await observeWolfChoiceActor(executive), ready.originalActor),
      });
      const commit = panel.getByRole('button', { name: 'Commit target assignments', exact: true });
      assert.equal(await commit.isVisible(), true, 'Current target assignment commit must remain rendered.');
      await uiReceipt(executive, 'assignWolfRangeTargets', () => commit.click(), { assignments });
    }
    await afterChoice(current);
  }
  async function boarding(current) {
    const actors = ['executive-officer', 'refinery-124-pdf-colonel',
      ...Object.values(CANDIDATE_PROOF_SHIPS).map(ship => ship.engineer),
      ...roster.map(actor => actor.roleId).filter(roleId => roleId !== 'press-officer')];
    for (const roleId of [...new Set(actors)].filter(roleId => roster.some(actor => actor.roleId === roleId))) {
      const actor = await select(roleId);
      const specialReady = await waitChoice(actor, current, { kind: 'boarding-special' });
      if (specialReady.status === 'source-changed') return;
      if (specialReady.status === 'source-excluded' && specialReady.reason === 'no-special-choice') {
        await afterChoice(current, 'Source boarding choices are complete; normal source finalization did not progress',
          { surface: actor, readiness: specialReady }); return;
      }
      const special = actor.page.getByRole('region', { name: 'Current boarding special choice', exact: true });
      if (specialReady.status === 'eligible') {
        const stay = special.getByRole('button', { name: /^Stay at / });
        const pass = special.getByRole('button', { name: 'Pass rerolls', exact: true });
        const militia = special.getByRole('button', { name: 'Commit Militia risk', exact: true });
        const button = await stay.isVisible() ? stay : await pass.isVisible() ? pass : await militia.isVisible() ? militia : null;
        if (button && await button.isEnabled()) {
          await uiReceipt(actor, 'commitWolfBoardingSpecialChoice', () => button.click());
          await afterChoice(current); return;
        }
      }
      const defenceReady = await waitChoice(actor, current, { kind: 'boarding-defence' });
      if (defenceReady.status === 'source-changed') return;
      if (defenceReady.status !== 'eligible') continue;
      const defend = actor.page.getByRole('button', { name: 'Commit defence', exact: true });
      if (await defend.isVisible()) {
        const panel = actor.page.getByRole('region', { name: / boarding defence$/i }).filter({ has: defend });
        const teams = panel.getByRole('combobox');
        const options = await teams.locator('option').evaluateAll(nodes => nodes.filter(node => node.value && !node.disabled).map(node => node.value));
        await teams.selectOption(options.at(-1));
        await uiReceipt(actor, 'commitWolfBoardingDefenceChoice', () => defend.click());
        await afterChoice(current); return;
      }
    }
    await afterChoice(current, 'Current boarding actors have only explicit blockers and no source progress; no repeat role reload loop');
  }
  let current = await attack();
  const setup = await tools.state();
  assert.equal(setup.phase, 'active');
  assert.ok(current, 'Only a real current GM-private attack can be resolved.');
  await tools.record('current real Wolf attack resolver setup', {
    cycle: setup.cycle, phase: setup.phase, airspace: setup.turnPhase?.airspace?.state,
    shipResources: setup.shipResources, shipSurvivors: setup.shipSurvivors,
    activeVesselIds: setup.activeVesselIds,
    charges: Object.fromEntries(Object.entries(setup.maintenanceCycles ?? {}).map(([id, cycle]) => [id, cycle.charges])),
    attack: attackSummary(current),
    limits: ['P11/P18/P20 confirmed core boarding actors are visited. Live Dione/Maliades, Boa, PDF Escort, replacement and facilitator rulings still require the actual source run; no native test establishes gameplay.'],
  });
  if (current.status === 'planned') {
    assert.ok(declareIfPlanned, 'Planned attack requires the explicit normal GM declaration option.');
    await tools.select('gm');
    const preparation = gm.page.getByRole('region', { name: 'Private Wolf attack preparation', exact: true });
    await uiReceipt(gm, 'declareWolfAttack', () => preparation.getByRole('button', { name: 'Declare Wolf attack', exact: true }).click());
    current = await attack();
  }
  assert.notEqual(current.status, 'planned', 'No planner or undeclared-source bypass.');
  deadline = Date.now() + timeoutMs;
  sourceWait = createWolfChoiceWaiter(context, { tools, originalGm, deadlineAt: deadline });
  while (Date.now() < deadline) {
    current = nextAttack ?? await attack(); nextAttack = undefined;
    if (closedProgress) {
      assert.equal(current?.attackId, closedProgress.attackId, 'Original boarding continuation attack changed.');
      assert.equal(current.turn, closedProgress.turn, 'Original boarding continuation cycle changed.');
      assert.ok(Number.isSafeInteger(current.revision) && current.revision >= closedProgress.revision,
        'Original boarding continuation source revision regressed.');
      if (current.revision === closedProgress.revision)
        for (const key of ['status', 'currentStep', 'airspaceLocked']) assert.equal(current[key], closedProgress[key]);
    }
    assert.equal((await tools.state()).phase, 'active');
    if (current.status === 'resolved') break;
    const key = JSON.stringify([current.attackId, current.turn, current.revision, current.currentStep]);
    if (key !== stageKey) { stageKey = key; stageDeadline = Math.min(Date.now() + 60_000, deadline); }
    assert.ok(Date.now() < stageDeadline, 'Original current combat decision stage deadline expired.');
    if (chooseNext) {
      const chosen = await chooseNext(current, { waitChoice, deadlineAt: stageDeadline });
      if (chosen?.status === 'current-ui-blocked') {
        await afterChoice(current, chosen.reason, chosen.boardingSourceClosed); continue;
      }
      if (chosen) continue;
    }
    if (current.currentStep === 'targeting') await targeting(current);
    else if (['long-range', 'medium-range', 'short-range'].includes(current.currentStep)) {
      if (await fighterRange(current)) continue;
      if (await supportRange(current)) continue;
      await aegisRange(current);
    } else if (current.currentStep === 'boarding') await boarding(current);
    else await delay(350);
  }
  assert.equal(current?.status, 'resolved', `Real attack must finalize. ${JSON.stringify(attackSummary(current))}`);
  await tools.record('real current Wolf attack finalized', { attack: attackSummary(current), exactReceiptReplays: replays });
  return current;
}
