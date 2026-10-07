import { rememberProofFailure, retainProofFailure } from './pc10-proof-failure-evidence.mjs';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { advanceBaseDetectorResearch, runBaseCombatAndDeduction } from './pc10-base-combat-deduction-ui-proof.mjs';
import { completeOfferedTurnAdvance } from './pc10-full-game-demo-proof-helpers.mjs';
import { createBasePendingProcedureCallbacks } from './pc10-base-pending-procedure-composition.mjs';
import { createBasePendingProcedureComposition } from './pc10-base-politics-crisis-arrest-composition.mjs';
import { runBaseC4CustomCrisisLifecycle } from './pc10-crisis-voyage-proof.mjs';
import { BASE_MISSION_ROLE_PRIORITY, assessLiveBaseAction, baseShipForRole, baseShipRoleCandidates,
  chooseAvailableBaseShipRole, selectBaseMissionTeam, selectCurrentBaseMissionCarriers,
  recheckChosenBaseShipRole, validateBaseMissionStartReceipt, validateBaseScoutRequestReceipt
} from './pc10-base-post-combat-choice-policy.mjs';
import { assertBasePostCombatActorIdentity, observeBasePostCombatActor } from './pc10-base-post-combat-actor-observation.mjs';
import { assertWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';

function sequenceCallbacks(callbacks, label) {
  const ordered = callbacks.filter(callback => callback !== undefined);
  for (const callback of ordered) assert.equal(typeof callback, 'function', `${label} entries must be callbacks.`);
  if (ordered.length === 0) return undefined;
  return async context => {
    const results = [];
    for (const callback of ordered) results.push(await callback(context));
    return results;
  };
}

function optionalCallbacks(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an explicit ordered callback array.`);
  for (const callback of value) assert.equal(typeof callback, 'function', `${label} entries must be callbacks.`);
  return value;
}

function safeCompositionSummary(result) {
  return {
    status: result?.status ?? null,
    accepted: result?.accepted ?? null,
    invoked: result?.invoked ?? null,
    observedProcedureCount: result?.observedProcedureCount ?? result?.summary?.observedProcedureCount ?? null,
    pendingProcedureCount: result?.pendingProcedureCount ?? result?.summary?.pendingProcedureCount ?? null,
    blockerCodes: Array.isArray(result?.blockerCodes) ? result.blockerCodes : undefined,
    completedStates: Array.isArray(result?.completedStates) ? result.completedStates : undefined,
  };
}

/**
 * Map existing setup and driver hooks onto the untouched Base runner. All
 * gameplay choices, terminal callbacks and the ordinary ending function are
 * supplied by the root caller; omitted procedure branches remain pending.
 */
export function createBaseGameplayDriverOptions({
  rootHooks = {},
  pendingProcedureOptions = {},
  politicsChoices,
  crisisChoices,
  arrestChoices,
  crisisSchedule,
  arrestSchedule,
  c4CrisisChoice,
  normalEnding,
  terminalBefore = [],
  terminalAfter = [],
  gameFactory,
} = {}) {
  assert.ok(rootHooks && typeof rootHooks === 'object' && !Array.isArray(rootHooks));
  for (const name of ['onSetup', 'onBeforeStart', 'onStarted']) {
    if (rootHooks[name] !== undefined) assert.equal(typeof rootHooks[name], 'function', `rootHooks.${name} must be callable.`);
  }
  assert.equal(typeof normalEnding, 'function', 'Supply the normal root-owned ending callback.');
  optionalCallbacks(terminalBefore, 'terminalBefore');
  optionalCallbacks(terminalAfter, 'terminalAfter');

  const procedures = createBasePendingProcedureCallbacks({ ...pendingProcedureOptions,
    ...(gameFactory ? { gameFactory } : {}) });
  const governance = createBasePendingProcedureComposition({ politics: politicsChoices, crisis: crisisChoices,
    arrest: arrestChoices, crisisSchedule, arrestSchedule });
  const integration = Object.freeze({ procedures, governance, c4CrisisChoice, normalEnding,
    terminalBefore: [...terminalBefore], terminalAfter: [...terminalAfter] });

  return Object.freeze({
    onSetup: sequenceCallbacks([rootHooks.onSetup, procedures.onSetup], 'onSetup'),
    onBeforeStart: rootHooks.onBeforeStart,
    onStarted: rootHooks.onStarted,
    runEnding: context => runBaseGameplay(context, integration),
    // Separate-cycle callers may use this only after a genuine Cycle 6 source checkpoint.
    onCycle6: procedures.onCycle6,
  });
}

export const BASE_COMPOSED_SOURCE_BINDING = Object.freeze({
  // Historical extracted Base origin; current candidate is bound by the owner runner.
  frozenRootCommit: '060237c5c1f2d9a5700742dd2641e743984b72b8',
  integratedDependencySourceCommit: '650c83efe73bb4910967be11125c61e8d01db9f3',
  untouchedOriginalRunner: Object.freeze({
    path: '/tmp/dow-pc10-evidence/proof-draft/pc10-base-gameplay.mjs',
    sha256: 'd3ce4d1cf80316943fa27e4f7bb0d09e4de41aa95948012e09765efda7b6d040',
  }),
  functionsIndexSha256: '9a3a68277e8e531405afee32f2aecd28e8f84ac365b4d65a7c9cd1b4552fc8ac',
  compositionSources: Object.freeze({
    coreAndGm: 'cb71587f9e0f55f67e01e034fba359c63947383a3d3801523136837a2c98f6e2',
    politicsCrisisArrest: 'b65d9175ee82b6acb80581c5de62efb6b52e8f7bb7203be3b18e702707d769ec',
    c4CrisisLifecycle: '8e075e10914c81e21c06b96e08cf341932c55d177210ff66f095cb43bdf2fbfe',
  }),
});

export const BASE_COMPOSED_CALLBACK_ORDER = Object.freeze([
  'setup:rootHooks.onSetup', 'setup:gm.onSetup', 'beforeStart:rootHooks.onBeforeStart',
  'started:rootHooks.onStarted', 'runEnding:existing Base gameplay sequence',
  'team1:pending.onCycle1Started after initial source-based supplies',
  'team1:politics.team1AfterNormalStart after research before paid maintenance',
  'team1:pending.onCycle1Maintenance after paid maintenance',
  'coordination1:pending.onCycle1Coordination before opening Wolf',
  'coordination1:politics.coordination1AfterOpeningWolf then pending.onCycle1AfterWolf',
  'team2:pending.onCycle2Maintenance then politics.team2AfterMaintenance',
  'coordination2:pending.onCycle2Coordination then politics.coordination2BeforeMissionDeal',
  'coordination2:pending.beforeCycle2MissionDeal after charged jumps before normal mission deal',
  'team3:politics.team3AfterMissionDelivery after actual reward delivery',
  'team3:pending.onCycle3Maintenance after paid maintenance',
  'coordination3:pending.onCycle3Coordination then politics.coordination3BeforeAdvance',
  'team4:pending.onCycle4Maintenance then politics.team4AfterMaintenance',
  'coordination4:pending.onCycle4Coordination before private deduction; politics.coordination4AfterInvestigation after',
  'terminal:runBaseC4CustomCrisisLifecycle then terminalBefore[] then normalEnding then terminalAfter[]',
  'separate-cycle-6-variant:procedures.onCycle6 is exposed but not invoked in the four-cycle Base run',
]);

/** Fresh normal core choices. This module grants no acceptance before its run. */
export async function runBaseGameplay(context, integration) {
  assert.ok(integration?.procedures && integration?.governance,
    'Use createBaseGameplayDriverOptions with the explicit root-owned finite composition.');
  const a = createTwoBrowserGameplay(context);
  const sourceTools = candidateGameplayTools(context);
  const { gm, initial, roster, directory } = context;
  const { procedures, governance } = integration;
  const stages = [], checks = {}, costs = [], composedStages = [], pendingActions = [];
  const originalGm = context.started ?? await gm.observe();
  assert.equal(originalGm.sessionId, initial.sessionId, 'Keep the originally started GM session.');
  assert.equal(originalGm.playerRole, 'gm');
  assert.equal(originalGm.gmInstanceOwned, true);
  assert.ok(originalGm.uidHash && originalGm.instanceId, 'Keep the original authenticated GM and owned instance.');
  function pending(action, blockers, details = {}) {
    const blockerCodes = [...new Set((Array.isArray(blockers) ? blockers : [blockers]).filter(value =>
      typeof value === 'string' && value.length > 0))];
    pendingActions.push({ action, status: 'pending', blockerCodes, ...details });
    return { status: 'pending', blockerCodes };
  }
  async function currentGmReadiness(expectedCycle) {
    const sourceGm = await gm.observe();
    const blockers = [];
    if (sourceGm.sessionId !== initial.sessionId || sourceGm.uidHash !== originalGm.uidHash ||
        sourceGm.instanceId !== originalGm.instanceId || sourceGm.playerRole !== 'gm' ||
        sourceGm.gmInstanceOwned !== true) blockers.push('original-owned-gm-instance-not-current');
    if (sourceGm.phase !== 'active' || sourceGm.cycle !== expectedCycle ||
        sourceGm.connection !== 'live' || sourceGm.freshness !== 'server') blockers.push('original-gm-not-live-at-current-cycle');
    return { status: blockers.length ? 'pending' : 'eligible', blockers, sourceGm };
  }
  async function currentRoleReadiness(shipId, roleId, expectedCycle, { expectedGroupId, enterConsole = true } = {}) {
    const originalActor = roster.find(actor => actor.roleId === roleId);
    if (!originalActor || baseShipForRole(roleId) !== shipId) {
      return { status: 'pending', blockers: ['original-role-not-in-current-source-roster'], roleId, shipId };
    }
    const inspect = async (surface, requireConsole) => {
      const [gmReady, current, ship, actor] = await Promise.all([
        currentGmReadiness(expectedCycle), a.state(), a.shipState(shipId, gm), observeBasePostCombatActor(surface),
      ]);
      const currentSession = { ...current, sessionId: current.sessionId, currentTurn: current.cycle,
        phase: current.phase, live: current.live };
      const assessment = assessLiveBaseAction({ sessionId: initial.sessionId, expectedCycle, shipId, roleId,
        expectedGroupId, sourceGm: gmReady.sourceGm, originalGm, currentSession,
        ship: ship?.shipProjection, originalActor, currentActor: actor, requireConsole });
      return { ...assessment, roleId, shipId, cycle: expectedCycle, fleetGroupId: actor?.fleetGroupId,
        actorUidHash: actor?.uidHash, surface, actor, currentSession, shipProjection: ship?.shipProjection };
    };
    let surface;
    try {
      surface = await a.select(roleId, { enter: false, deadlineAt: Date.now() + 15_000 });
    } catch (error) {
      if (String(error?.message ?? '').includes('Original role navigation deadline expired')) {
        return { status: 'pending', blockers: ['original-role-not-current-live'], roleId, shipId };
      }
      throw error;
    }
    let result = await inspect(surface, false);
    if (result.status !== 'eligible' || !enterConsole) return result;
    try {
      surface = await a.select(roleId, { deadlineAt: Date.now() + 15_000 });
    } catch (error) {
      if (String(error?.message ?? '').includes('Original role navigation deadline expired')) {
        return { status: 'pending', blockers: ['original-role-console-not-current-live'], roleId, shipId };
      }
      throw error;
    }
    // Re-read the owned GM, server session and hull after ordinary role entry.
    result = await inspect(surface, true);
    return result;
  }
  async function chooseCurrentShipRole(shipId, expectedCycle, { expectedGroupId, enterConsole = true } = {}) {
    const sourceGm = await currentGmReadiness(expectedCycle);
    if (sourceGm.status !== 'eligible') return { status: 'pending', roleId: null, blockers: sourceGm.blockers };
    const current = await a.state();
    const candidates = baseShipRoleCandidates({ roster, activeRoleIds: current.activeRoleIds, shipId });
    const readinessByRoleId = {};
    for (const roleId of candidates) readinessByRoleId[roleId] = await currentRoleReadiness(shipId, roleId, expectedCycle,
      { expectedGroupId, enterConsole });
    const selected = chooseAvailableBaseShipRole({ candidates, readinessByRoleId, expectedCycle });
    return recheckChosenBaseShipRole({ selection: selected, expectedCycle,
      inspectCurrentRole: roleId => currentRoleReadiness(shipId, roleId, expectedCycle,
        { expectedGroupId, enterConsole }) });
  }
  async function compose(stage, callback) {
    if (typeof callback !== 'function') return undefined;
    const result = await callback(context);
    composedStages.push({ stage, ...safeCompositionSummary(result) });
    return result;
  }
  async function sourceInterruptions(stage) {
    for (const [name, callback] of [
      ['eligible-alert', procedures.onEligibleAlert],
      ['eligible-mutiny', procedures.onEligibleMutiny],
      ['eligible-destruction', procedures.onEligibleDestruction],
    ]) await compose(`${stage}/${name}`, callback);
  }
  async function mark(stage) {
    stages.push({ stage, at: new Date().toISOString() });
    await writeFile(`${directory}/base-gameplay-progress.json`, `${JSON.stringify({ stages, checks, pendingActions }, null, 2)}\n`);
    console.log(JSON.stringify({ stage }));
  }
  async function uiRpc(role, name, choose, { replay = true, expectedCycle, expectedGroupId } = {}) {
    const surface = await a.select(role);
    const before = await surface.observe();
    const cycle = expectedCycle ?? (await a.state()).cycle;
    const readiness = role === 'gm'
      ? await currentGmReadiness(cycle)
      : await currentRoleReadiness(baseShipForRole(role), role, cycle, { expectedGroupId, enterConsole: true });
    if (readiness.status !== 'eligible') return { status: 'pending', currentSourceBlocked: true,
      blockerCodes: readiness.blockers };
    const response = await observeUiReceipt({
      waitForResponse: () => surface.page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith(`/us-central1/${name}`) && response.request().method() === 'POST'),
      choose: () => choose(surface.page),
    });
    const body = await response.json();
    assert.equal(response.ok(), true, `${name}: ${body.error?.message ?? response.status()}`);
    const request = response.request().postDataJSON()?.data;
    assert.equal(request.sessionId, initial.sessionId);
    assert.equal((await surface.observe()).uidHash, before.uidHash);
    if (replay) {
      const again = await surface.callable(name, request);
      assert.equal(again.status, 'committed', `Exact ${name} UI acknowledgement retry`);
      const clean = value => { const result = { ...value }; delete result.status; return result; };
      assert.deepEqual(clean(again.result), clean(body.result));
    }
    a.actions.push({ roleId: role, name, transport: 'actual connected UI control', exactBrowserSdkReplay: replay,
      requestFingerprint: createHash('sha256').update(JSON.stringify(request)).digest('hex'), status: response.status() });
    return body.result;
  }
  async function readServerSource(path, { collection = false } = {}) {
    const surface = await a.select('gm', { enter: false });
    const cycle = (await a.state()).cycle;
    const gmReady = await currentGmReadiness(cycle);
    assert.equal(gmReady.status, 'eligible', 'Read source mission records only as the original live GM.');
    const outcome = await surface.page.evaluate(async ({ sid, path, collection }) => {
      try {
        const source = await (await fetch('/src/lib/firestore.ts')).text();
        const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
        if (!match) throw new Error('Read the actual browser Firestore SDK import before the current source read.');
        const sdk = await import(match[1]);
        const { db } = await import('/src/lib/firestore.ts');
        const referencePath = `sessions/${sid}/${path}`;
        const snapshot = collection
          ? await sdk.getDocsFromServer(sdk.collection(db(), referencePath))
          : await sdk.getDocFromServer(sdk.doc(db(), referencePath));
        const value = collection
          ? snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
          : snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
        return { status: 'ok', value, fromCache: snapshot.metadata?.fromCache ?? null,
          hasPendingWrites: snapshot.metadata?.hasPendingWrites ?? null };
      } catch (error) {
        return { status: 'error', code: typeof error?.code === 'string' ? error.code : null };
      }
    }, { sid: initial.sessionId, path, collection });
    assert.equal(outcome.status, 'ok', 'The entitled current server source read must succeed.');
    assert.equal(outcome.fromCache, false, 'The mission source read must be server-backed.');
    assert.equal(outcome.hasPendingWrites, false, 'The mission source read must have no pending writes.');
    return outcome;
  }
  async function currentMissionSession() {
    const state = await a.state();
    // This source page read extracts only current nonprivate carrier custody fields.
    const session = await gm.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      const current = useSessionStore.getState();
      const value = current.session;
      return { retainedShuttles: value?.retainedShuttles ?? {}, sessionId: value?.id ?? null,
        shuttleDockings: value?.shuttleDockings ?? [], shuttleControl: value?.shuttleControl ?? {},
        shipFleetGroupIds: value?.shipFleetGroupIds ?? {}, shipGalacticCoordinates: value?.shipGalacticCoordinates ?? {},
        activeVesselIds: value?.activeVesselIds ?? [], activeRoleIds: value?.activeRoleIds ?? [],
        cycle: value?.currentTurn ?? null, phase: value?.phase ?? null,
        live: current.connection === 'live' && current.sessionSnapshotFreshness === 'server' };
    }, gm.storeModuleUrl());
    return { ...state, ...session, currentTurn: state.cycle };
  }
  async function coordination() {
    const s = await gm.observe();
    assert.equal(s.phaseProgression, 'manual');
    if (s.airspace === 'restricted') {
      await gm.page.getByRole('button', { name: 'Open Coordination manually', exact: true }).click();
      await gm.until('Genuine manual Coordination', value => value.airspace === 'lifted' && value.cycle === s.cycle);
    }
  }
  async function advance() {
    await coordination();
    const before = await gm.observe();
    const reply = await uiRpc('gm', 'advanceTurn', async page => {
      const offered = page.getByRole('button', { name: `ARE YOU SURE? // Advance to Cycle ${before.cycle + 1}`, exact: true });
      await completeOfferedTurnAdvance({
        expected: { sessionId: initial.sessionId, uidHash: before.uidHash,
          instanceId: before.instanceId, cycle: before.cycle },
        inspect: async () => ({ ...(await gm.observe()), confirmationOffered: await offered.isVisible() }),
        clickAdvance: () => page.getByRole('button', { name: `Advance to Cycle ${before.cycle + 1}`, exact: true }).click(),
        clickConfirmation: () => offered.click(),
      });
    }, { expectedCycle: before.cycle });
    assert.equal(reply.currentSourceBlocked, undefined, 'The original current GM must own the offered manual advance.');
    await gm.until('Committed next manual Team', value => value.cycle === before.cycle + 1 || value.phase === 'debrief');
    const after = await a.state();
    if (after.turnPhase?.timerPause?.reason === 'turn-interstitial') {
      // The same normal server announcement control acknowledges the actual
      // held presentation; it neither sets a deadline nor advances gameplay.
      await a.command('executive-officer', 'clearTurnAdvanceInterstitial', {
        requestId: randomUUID(), expectedCycle: after.cycle,
        expectedPausedAt: after.turnPhase.timerPause.pausedAt,
      });
    }
  }
  async function scout(role, label, coordinate, expectedCycle) {
    const shipId = baseShipForRole(role);
    const readiness = await currentRoleReadiness(shipId, role, expectedCycle, { enterConsole: true });
    if (readiness.status !== 'eligible') return pending(`scout-${label.toLowerCase()}`, readiness.blockers,
      { shipId, roleId: role, cycle: expectedCycle });
    const link = readiness.surface.page.getByRole('link', { name: `Open ${label} shuttle console`, exact: true });
    if (await link.count() !== 1 || !(await link.isVisible())) return pending(`scout-${label.toLowerCase()}`,
      ['mounted-shuttle-console-unavailable'], { shipId, roleId: role, cycle: expectedCycle });
    const result = await uiRpc(role, 'requestScout', async page => {
      await page.getByRole('link', { name: `Open ${label} shuttle console`, exact: true }).click();
      const panel = page.getByRole('region', { name: `${label} scouting request`, exact: true });
      await panel.getByRole('textbox', { name: 'Printed system coordinate', exact: true }).fill(coordinate);
      await panel.getByRole('button', { name: 'Record request', exact: true }).click();
    }, { expectedCycle });
    if (result.currentSourceBlocked) return pending(`scout-${label.toLowerCase()}`, result.blockerCodes,
      { shipId, roleId: role, cycle: expectedCycle });
    return validateBaseScoutRequestReceipt({ receipt: result, sessionId: initial.sessionId,
      expectedCycle, roleId: role, targetCoordinate: coordinate });
  }
  async function jump(ship, name, destination, expectedCycle) {
    const selection = await chooseCurrentShipRole(ship, expectedCycle);
    if (selection.status !== 'eligible') return pending(`jump-${ship}-cycle-${expectedCycle}`, selection.blockers,
      { shipId: ship, cycle: expectedCycle });
    const panel = selection.readiness.surface.page.getByRole('region', { name: `${name} Jump Drive control`, exact: true });
    const launchButton = panel.getByRole('button', { name: /^Jump to \d{4}$/, exact: true });
    if (await panel.count() !== 1 || !(await panel.isVisible()) || await launchButton.count() !== 1 ||
        !(await launchButton.isVisible())) return pending(`jump-${ship}-cycle-${expectedCycle}`,
      ['mounted-current-destination-unavailable'], { shipId: ship, roleId: selection.roleId, cycle: expectedCycle });
    const before = (await a.state()).shipResources[ship].fuel;
    const actualRole = selection.roleId;
    const result = await uiRpc(actualRole, 'jumpShip', async page => {
      const panel = page.getByRole('region', { name: `${name} Jump Drive control`, exact: true });
      for (let index = 0; index < 4; index++) {
        const current = Number(await panel.getByLabel(`Coordinate digit ${index + 1} value`, { exact: true }).textContent());
        const required = Number(destination[index]);
        for (let count = 0; count < (required - current + 10) % 10; count++)
          await panel.getByRole('button', { name: `Increase coordinate digit ${index + 1}`, exact: true }).click();
      }
      await panel.getByRole('button', { name: 'Lock destination coordinates', exact: true }).click();
      const power = panel.getByRole('slider', { name: 'Jump drive power', exact: true });
      await power.focus(); await power.press('End');
      await panel.getByRole('button', { name: `Jump to ${destination}`, exact: true }).click();
    }, { expectedCycle });
    if (result.currentSourceBlocked) return pending(`jump-${ship}-cycle-${expectedCycle}`, result.blockerCodes,
      { shipId: ship, roleId: actualRole, cycle: expectedCycle });
    assert.equal(result.status, 'jumped'); assert.equal(result.destination, destination);
    costs.push({ ship, action: 'normal charged jump', beforeFuel: before, chargedFuel: result.fuelCost,
      expectedAfterFuel: before - result.fuelCost });
    return result;
  }
  async function mountedMissionParticipantLabels(panel) {
    const labels = panel.locator('label.away-mission-start-panel__participant');
    const result = [];
    for (const label of await labels.all()) {
      if (!(await label.isVisible())) continue;
      const text = (await label.innerText()).replace(/\s+/g, ' ').trim();
      if (text) result.push(text);
    }
    return result;
  }
  async function missionSourceInputs(opportunity, cycle, mountedParticipantLabels) {
    const currentSession = await currentMissionSession();
    const [navigationRead, fleetGroupRead] = await Promise.all([
      readServerSource('serverState/navigation'), readServerSource(`fleetGroups/${opportunity.groupId}`),
    ]);
    const departureCraftIds = ['starlight', 'highwall', 'endeavour', 'hummingbird'];
    const departures = await Promise.all(departureCraftIds.map(async craftId => [craftId,
      (await readServerSource(`shuttleDepartures/${craftId}`)).value]));
    const readinessByRoleId = {};
    const roleIds = new Set([
      ...BASE_MISSION_ROLE_PRIORITY,
      'icebreaker-miner',
      ...roster.filter(actor => {
        const label = `${actor.displayName} // ${actor.roleId}`;
        return mountedParticipantLabels.includes(label);
      }).map(actor => actor.roleId),
    ]);
    for (const roleId of roleIds) {
      const shipId = baseShipForRole(roleId);
      if (!shipId || !roster.some(actor => actor.roleId === roleId) ||
          !currentSession.activeRoleIds.includes(roleId)) continue;
      readinessByRoleId[roleId] = await currentRoleReadiness(shipId, roleId, cycle,
        { expectedGroupId: opportunity.groupId, enterConsole: false });
    }
    const carrierResult = selectCurrentBaseMissionCarriers({ opportunity, currentSession, navigationRead, fleetGroupRead,
      roster, readinessByRoleId, departureByCraftId: Object.fromEntries(departures),
      retainedShuttles: currentSession.retainedShuttles });
    return { currentSession, navigationRead, readinessByRoleId, carrierResult };
  }
  async function currentMissionStartCandidate(expectedCycle) {
    const panel = gm.page.getByRole('region', { name: 'New-location mission start', exact: true });
    if (await panel.count() !== 1 || !(await panel.isVisible())) return pending('source-mission-start',
      ['mounted-mission-start-panel-unavailable'], { cycle: expectedCycle });
    const opportunityRead = await readServerSource('missionOpportunities', { collection: true });
    const startedRead = await readServerSource('missionStartSnapshots', { collection: true });
    const opportunities = opportunityRead.value;
    if (!Array.isArray(opportunities) || !Array.isArray(startedRead.value)) return pending('source-mission-start',
      ['current-server-opportunity-source-unavailable'], { cycle: expectedCycle });
    const startedIds = new Set(startedRead.value.map(value => value.opportunityId ?? value.id).filter(value => typeof value === 'string'));
    const allAvailable = opportunities.filter(value => value?.type === 'mission-opportunity' && value.status === 'available' &&
      !startedIds.has(value.id));
    const opportunityIds = [];
    const selector = panel.getByRole('combobox', { name: 'Mission opportunity', exact: true });
    if (await selector.count() === 1) {
      for (const option of await selector.locator('option').evaluateAll(nodes => nodes
        .filter(node => node.value && !node.disabled).map(node => node.value))) opportunityIds.push(option);
    } else if (await selector.count() === 0 && allAvailable.length === 1) {
      opportunityIds.push(allAvailable[0].id);
    }
    if (opportunityIds.length === 0) return pending('source-mission-start',
      ['mounted-opportunity-choice-not-unique'], { cycle: expectedCycle });
    const currentState = await a.state();
    const candidates = allAvailable.filter(value => opportunityIds.includes(value.id) && value.sourceCycle === expectedCycle &&
      value.chart === currentState.chartId);
    for (const opportunity of candidates.sort((left, right) => left.id.localeCompare(right.id))) {
      const allowed = opportunityIds.filter(value => value === opportunity.id);
      if (allowed.length !== 1) continue;
      if (await selector.count() === 1) await selector.selectOption(opportunity.id);
      const expectedPaint = `Newly reached ${opportunity.siteCode} location from ${opportunity.sourceShipId} (${opportunity.sourceTransitionId}).`;
      const painted = panel.getByText(expectedPaint, { exact: true });
      if (await painted.count() !== 1) continue;
      await painted.waitFor({ state: 'visible', timeout: 10_000 });
      const mountedParticipantLabels = await mountedMissionParticipantLabels(panel);
      const source = await missionSourceInputs(opportunity, expectedCycle, mountedParticipantLabels);
      if (source.carrierResult.status !== 'ready') {
        pending(`mission-carrier-${opportunity.id}`, source.carrierResult.blockers,
          { groupId: opportunity.groupId, cycle: expectedCycle });
        continue;
      }
      const team = selectBaseMissionTeam({ opportunity, mountedParticipantLabels, roster,
        activeRoleIds: source.currentSession.activeRoleIds, readinessByRoleId: source.readinessByRoleId,
        maxParticipants: 3 });
      if (team.status !== 'ready') {
        pending(`mission-participants-${opportunity.id}`, ['no-unique-current-mounted-original-participant'],
          { groupId: opportunity.groupId, cycle: expectedCycle });
        continue;
      }
      return { status: 'ready', opportunity, team, carrierCraftIds: source.carrierResult.carrierCraftIds,
        mountedParticipantLabels, panel };
    }
    return pending('source-mission-start', ['no-current-mounted-opportunity-with-source-carrier-and-participants'],
      { cycle: expectedCycle });
  }
  async function confirmMissionStartCandidate(candidate, expectedCycle) {
    const gmReady = await currentGmReadiness(expectedCycle);
    assert.equal(gmReady.status, 'eligible', 'Mission start remains owned by the original current GM.');
    const sourceRead = await readServerSource(`missionOpportunities/${candidate.opportunity.id}`);
    assert.ok(sourceRead.value, 'The selected source opportunity remains present on the server.');
    for (const key of ['id', 'groupId', 'chart', 'coordinate', 'siteCode', 'sourceShipId', 'sourceTransitionId', 'sourceCycle', 'status'])
      assert.equal(sourceRead.value[key], candidate.opportunity[key], `Current mission opportunity ${key} changed.`);
    const mountedParticipantLabels = await mountedMissionParticipantLabels(candidate.panel);
    const source = await missionSourceInputs(candidate.opportunity, expectedCycle, mountedParticipantLabels);
    assert.equal(source.carrierResult.status, 'ready', 'A current source-authorized carrier remains usable.');
    const currentTeam = selectBaseMissionTeam({ opportunity: candidate.opportunity, mountedParticipantLabels,
      roster, activeRoleIds: source.currentSession.activeRoleIds, readinessByRoleId: source.readinessByRoleId,
      maxParticipants: 3 });
    assert.deepEqual(currentTeam, candidate.team, 'The same current mounted original participants and leader remain eligible.');
    assert.ok(source.carrierResult.carrierCraftIds.some(value => candidate.carrierCraftIds.includes(value)),
      'The same source carrier remains available at the opportunity.');
    return { ...source, currentTeam };
  }
  async function missionPanel(role, missionId) {
    const surface = await a.select(role, { enter: false });
    if (role !== 'gm') {
      await surface.page.getByRole('link', { name: 'Demo crew', exact: true }).click();
      await surface.until('The same admitted actor returns to the normal manager', value =>
        value.sameActor && value.sessionId === initial.sessionId && value.connection === 'live' && value.freshness === 'server');
      await surface.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
      await surface.page.getByRole('link', { name: 'Open private brief', exact: true }).click();
      await surface.until('The same normally admitted participant opens their private brief', value =>
        value.sameActor && value.sessionId === initial.sessionId && value.connection === 'live' && value.freshness === 'server');
    }
    const panel = surface.page.getByRole('region', { name: `Away mission // ${missionId}`, exact: true });
    await panel.waitFor();
    return { surface, panel };
  }
  async function assertMissionActorHeld(surface, expectedActor) {
    const current = await observeBasePostCombatActor(surface);
    assertWolfChoiceActor(current, expectedActor);
    assertBasePostCombatActorIdentity(current, expectedActor);
    return current;
  }
  async function missionUi(role, missionId, choose, { expectedGroupId, offered } = {}) {
    const expectedCycle = (await a.state()).cycle;
    const readyBefore = role === 'gm'
      ? await currentGmReadiness(expectedCycle)
      : await currentRoleReadiness(baseShipForRole(role), role, expectedCycle,
        { expectedGroupId, enterConsole: false });
    if (readyBefore.status !== 'eligible') {
      pending(`mission-${role}-${missionId}`, readyBefore.blockers,
        { roleId: role, groupId: expectedGroupId, cycle: expectedCycle });
      return null;
    }
    const { surface, panel } = await missionPanel(role, missionId);
    const readyAfter = role === 'gm'
      ? await currentGmReadiness(expectedCycle)
      : await currentRoleReadiness(baseShipForRole(role), role, expectedCycle,
        { expectedGroupId, enterConsole: false });
    if (readyAfter.status !== 'eligible') {
      pending(`mission-${role}-${missionId}`, readyAfter.blockers,
        { roleId: role, groupId: expectedGroupId, cycle: expectedCycle });
      return null;
    }
    let heldActor;
    if (role === 'gm') {
      heldActor = await observeBasePostCombatActor(surface);
      for (const field of ['sessionId', 'uidHash', 'instanceId', 'playerRole', 'phase', 'cycle',
        'connection', 'freshness', 'gmInstanceOwned'])
        assert.ok(heldActor[field] === readyAfter.sourceGm[field], `Original mission GM ${field} changed before the UI choice.`);
      assertWolfChoiceActor(heldActor, heldActor);
      assertBasePostCombatActorIdentity(heldActor, heldActor);
    } else {
      heldActor = readyAfter.actor;
      await assertMissionActorHeld(surface, heldActor);
    }
    if (offered && !(await offered(panel))) {
      pending(`mission-${role}-${missionId}`, ['mounted-current-lifecycle-action-unavailable'],
        { roleId: role, groupId: expectedGroupId, cycle: expectedCycle });
      return null;
    }
    const response = await observeUiReceipt({
      waitForResponse: () => surface.page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith('/us-central1/commitAwayMissionLifecycleCommand') && response.request().method() === 'POST'),
      choose: () => choose(panel, async action => {
        await assertMissionActorHeld(surface, heldActor);
        return action();
      }),
    });
    const body = await response.json();
    await assertMissionActorHeld(surface, heldActor);
    assert.equal(response.ok(), true, `Actual mission UI: ${body.error?.message ?? response.status()}`);
    const request = response.request().postDataJSON()?.data;
    await assertMissionActorHeld(surface, heldActor);
    const replay = await surface.callable('commitAwayMissionLifecycleCommand', request);
    assert.equal(replay.status, 'committed');
    assert.equal(replay.result.revision, body.result.revision);
    assert.deepEqual(replay.result.publicState, body.result.publicState);
    await assertMissionActorHeld(surface, heldActor);
    a.actions.push({ roleId: role, name: 'commitAwayMissionLifecycleCommand', actionType: request.type,
      transport: 'actual connected UI control', exactBrowserSdkReplay: true, revision: body.result.revision,
      privateCardContentsRecorded: false });
    return body.result;
  }
  const ships = [
    ['aegis', 'executive-officer', 'AEGIS', ['Jump Drive', 'Command and Control', 'Missile Launchers', 'Point Defence Lasers'], { 'Shuttle Bay Zeta': 'starlight' }],
    ['dione', 'dione-engineer', 'Dione', ['Jump Drive', 'Hydroponics', 'Water Reclamation', 'Fighter Bay'], {}],
    ['icebreaker', 'icebreaker-engineer', 'Icebreaker', ['Jump Drive', 'Mining Drone Control', 'Ram Scoop', 'Hydroponics'], {}],
    ['shepherd', 'shepherd-engineer', 'Shepherd', ['Jump Drive', 'Advanced Hydroponics', 'Water Reclamation'], { 'Shuttle Bay': 'endeavour' }],
    ['quellon', 'quellon-engineer', 'Quellon', ['Jump Drive', 'Water Production', 'Water Production II'], { 'Shuttle Bay': 'hummingbird' }],
    ['refinery-124', 'refinery-124-engineer', 'Refinery 124', ['Jump Drive', 'Fuel Refinery', 'Fuel Refinery II', 'Water Reclamation'], {}],
  ];
  try {
    await mark('ordinary GM ration choices from actual source schedules for four paid maintenance cycles');
    const budget = await sourceTools.printedRationBudget(Object.fromEntries(ships.map(([id]) => [id, 4])));
    for (const [ship] of ships) {
      await sourceTools.gmSupplies(ship, 'food', budget[ship].food);
      await sourceTools.gmSupplies(ship, 'water', budget[ship].water);
      await sourceTools.gmSupplies(ship, 'fuel', 30);
    }
    await sourceTools.gmSupplies('aegis', 'ore', 5);
    await compose('cycle-1-started-after-source-supplies', procedures.onCycle1Started);
    const combatConsoles = ['Fighter Bay Alpha', 'Fighter Bay Bravo', 'Command and Control', 'Missile Launchers', 'Point Defence Lasers'];
    const paidMaintenance = async (cycle, combat = false) => {
      const completedShips = [];
      for (const [ship, , , consoles, refuels] of ships) {
        const selection = await chooseCurrentShipRole(ship, cycle);
        if (selection.status !== 'eligible') {
          pending(`maintenance-${ship}-cycle-${cycle}`, selection.blockers, { shipId: ship, cycle });
          continue;
        }
        const surface = selection.readiness.surface;
        const maintenancePage = surface.page.getByRole('button', { name: 'Maintenance', exact: true });
        let panel = surface.page.getByRole('region', { name: / maintenance cycle$/i }).first();
        if (!(await panel.isVisible()) && await maintenancePage.count() === 1 && await maintenancePage.isVisible()) {
          await maintenancePage.click();
          await panel.waitFor({ state: 'visible', timeout: 10_000 });
        }
        const begin = panel.getByRole('button', { name: `Begin Maintenance Cycle: Cycle ${cycle}`, exact: true });
        if (await panel.count() !== 1 || !(await panel.isVisible()) || await begin.count() !== 1 ||
            !(await begin.isVisible()) || !(await begin.isEnabled())) {
          pending(`maintenance-${ship}-cycle-${cycle}`, ['mounted-current-cycle-maintenance-unavailable'],
            { shipId: ship, roleId: selection.roleId, cycle });
          continue;
        }
        const current = await currentRoleReadiness(ship, selection.roleId, cycle, { enterConsole: true });
        if (current.status !== 'eligible') {
          pending(`maintenance-${ship}-cycle-${cycle}`, current.blockers, { shipId: ship, roleId: selection.roleId, cycle });
          continue;
        }
        await a.maintenanceUi(ship, selection.roleId, { consoles: combat && ship === 'aegis' ? combatConsoles : consoles,
          refuels: combat && ship === 'aegis' ? {} : refuels,
          afterBegin: () => sourceTools.gmRepair(ship), afterRiot: () => sourceTools.gmRepair(ship) });
        checks[`${ship}MaintenanceCycle${cycle}`] = true;
        completedShips.push(ship);
      }
      if (completedShips.length !== ships.length) checks[`allSixMaintenanceCycle${cycle}`] = false;
      else checks[`allSixMaintenanceCycle${cycle}`] = true;
      return completedShips;
    };
    const researchCross = async cycle => {
      const readiness = await currentRoleReadiness('shepherd', 'shepherd-scientist', cycle, { enterConsole: true });
      if (readiness.status !== 'eligible') {
        pending(`scientist-detector-research-cycle-${cycle}`, readiness.blockers,
          { shipId: 'shepherd', roleId: 'shepherd-scientist', cycle });
        return false;
      }
      const shuttleLink = readiness.surface.page.getByRole('link', { name: 'Open Endeavour shuttle console', exact: true });
      const state = await a.state();
      const endeavours = (state.shuttleDockings ?? []).filter(value => value?.shuttleId === 'endeavour');
      const docking = endeavours[0];
      const control = state.shuttleControl?.endeavour;
      if (await shuttleLink.count() !== 1 || !(await shuttleLink.isVisible()) || endeavours.length !== 1 ||
          docking?.shipId !== 'shepherd' || docking?.inTransit === true || docking?.transit === true ||
          docking?.status === 'in-transit' || docking?.state === 'in-transit' || docking?.dockingState === 'in-transit' ||
          control?.ownerRoleId !== 'shepherd-scientist' || control?.holderUid == null ||
          createHash('sha256').update(control.holderUid).digest('hex').slice(0, 16) !== readiness.actorUidHash) {
        pending(`scientist-detector-research-cycle-${cycle}`, ['current-endeavour-research-route-unavailable'],
          { shipId: 'shepherd', roleId: 'shepherd-scientist', cycle });
        return false;
      }
      const result = await advanceBaseDetectorResearch(context, { expectedCycle: cycle,
        evidenceName: `base-research-cycle-${cycle}.json` });
      const branch = result?.branches?.['detector-research-cross'];
      if (branch?.status !== 'committed') {
        pending(`scientist-detector-research-cycle-${cycle}`,
          branch?.blocker ? [branch.blocker] : ['current-source-did-not-commit-research'],
          { shipId: 'shepherd', roleId: 'shepherd-scientist', cycle });
        return false;
      }
      checks[`separateScientistResearchCycle${cycle}`] = true;
      return true;
    };
    await researchCross(1);
    await compose('cycle-1-team-after-research-before-maintenance', governance.team1AfterNormalStart);
    await mark('real Team1 five-slot AEGIS combat and source-applicable original paid maintenance accounts');
    await paidMaintenance(1, true);
    await compose('cycle-1-after-six-paid-maintenance', procedures.onCycle1Maintenance);
    await sourceInterruptions('cycle-1-after-maintenance-source-events');
    await coordination();
    await compose('cycle-1-coordination-before-opening-wolf', procedures.onCycle1Coordination);
    await mark('genuine offered opening Wolf composition and all natural combat procedures');
    await runBaseCombatAndDeduction(context, { combat: 'opening', expectedCycle: 1, deduction: false,
      commandAndControl: 'redirect', protectedShipPriority: ['shepherd', 'quellon'],
      evidenceName: 'base-opening-combat.json' });
    checks.openingCombatAndPublicAftermath = true;
    await compose('cycle-1-coordination-after-opening-wolf', governance.coordination1AfterOpeningWolf);
    await compose('cycle-1-after-opening-wolf', procedures.onCycle1AfterWolf);
    await sourceInterruptions('cycle-1-after-wolf-source-events');
    await advance();
    await researchCross(2);
    await mark('real Team2 replaces prior five-slot combat allocation with paid Jump Drive and bays');
    await paidMaintenance(2);
    await compose('cycle-2-after-six-paid-maintenance', procedures.onCycle2Maintenance);
    await sourceInterruptions('cycle-2-after-maintenance-source-events');
    await compose('cycle-2-team-after-maintenance', governance.team2AfterMaintenance);
    await mark('manual Coordination2 and actual source-owner scouting');
    await coordination();
    await compose('cycle-2-coordination-before-scouting', procedures.onCycle2Coordination);
    await compose('cycle-2-coordination-before-scouting-and-mission', governance.coordination2BeforeMissionDeal);
    const scoutResults = [
      await scout('wing-commander', 'Starlight', '1413', 2),
      await scout('quellon-explorer', 'Hummingbird', '1413', 2),
    ];
    checks.scoutRequestsAndExactRetries = scoutResults.every(result => result?.status === 'committed');
    await mark('source-applicable charged jumps to the actual ChartA mission location');
    const jumpResults = [];
    for (const [ship, , name] of ships) jumpResults.push(await jump(ship, name, '1413', 2));
    checks.sixChargedJumpsAndExactRetries = jumpResults.every(result => result?.status === 'jumped');
    await compose('cycle-2-after-six-charged-jumps-before-mission-deal', procedures.beforeCycle2MissionDeal);
    await mark('normal current GM source selects one actually available group opportunity, its current carrier and mounted participants');
    let mission = null, missionPrivateComplete = false, delivered = null;
    const candidate = await currentMissionStartCandidate(2);
    if (candidate.status === 'ready') {
      const dealt = await uiRpc('gm', 'dealPrivateInitialCards', async page => {
        const confirmed = await confirmMissionStartCandidate(candidate, 2);
        const panel = page.getByRole('region', { name: 'New-location mission start', exact: true });
        for (const roleId of confirmed.currentTeam.participantRoleIds) {
          const actor = roster.find(value => value.roleId === roleId);
          assert.ok(actor?.displayName, 'The current mounted original participant must retain its source roster label.');
          const label = `${actor.displayName} // ${roleId}`;
          assert.ok(confirmed.mountedParticipantLabels.includes(label));
          await panel.getByRole('checkbox', { name: label, exact: true }).check();
        }
        const leader = roster.find(value => value.roleId === confirmed.currentTeam.missionLeaderRoleId);
        const leaderLabel = `${leader.displayName} // ${leader.roleId}`;
        await panel.getByRole('combobox', { name: 'Mission Leader', exact: true }).selectOption({ label: leaderLabel });
        const start = panel.getByRole('button', { name: 'Start mission', exact: true });
        assert.equal(await start.isEnabled(), true, 'Start only the exact mounted opportunity and selected current group roster.');
        await start.click();
      }, { expectedCycle: 2 });
      if (dealt.currentSourceBlocked) {
        pending('source-mission-start', dealt.blockerCodes, { groupId: candidate.opportunity.groupId, cycle: 2 });
      } else {
        assert.equal(dealt.status, 'committed');
        assert.equal(dealt.sessionId, initial.sessionId);
        assert.equal(dealt.opportunityId, candidate.opportunity.id);
        assert.equal(dealt.groupId, candidate.opportunity.groupId);
        assert.equal(dealt.coordinate, candidate.opportunity.coordinate);
        assert.equal(dealt.sourceCycle, candidate.opportunity.sourceCycle);
        const receiptRead = await readServerSource(`missionStartSnapshots/${candidate.opportunity.id}`);
        const receiptSummary = validateBaseMissionStartReceipt({ receipt: receiptRead.value,
          opportunity: candidate.opportunity, sessionId: initial.sessionId, roster,
          participantRoleIds: candidate.team.participantRoleIds,
          missionLeaderRoleId: candidate.team.missionLeaderRoleId });
        assert.ok(receiptSummary.carrierCraftIds.some(value => candidate.carrierCraftIds.includes(value)),
          'The exact server mission-start receipt must confirm at least one currently offered source carrier.');
        assert.equal(receiptSummary.groupId, candidate.opportunity.groupId);
        assert.equal(receiptSummary.sourceCycle, candidate.opportunity.sourceCycle);
        mission = { id: dealt.missionId, groupId: candidate.opportunity.groupId,
          participantRoleIds: candidate.team.participantRoleIds,
          missionLeaderRoleId: candidate.team.missionLeaderRoleId,
          sourceCarrierCraftIds: receiptSummary.carrierCraftIds };
        checks.realMissionStartAndExactRetry = true;
        await mark('normal mission private requests, discard and assignments use only the current verified participants');
        let complete = true;
        for (const roleId of mission.participantRoleIds) {
          const result = await missionUi(roleId, mission.id,
            (panel, commit) => commit(() =>
              panel.getByRole('button', { name: 'Request extra cards privately', exact: true }).click()),
            { expectedGroupId: mission.groupId, offered: async panel => {
              const button = panel.getByRole('button', { name: 'Request extra cards privately', exact: true });
              return await button.count() === 1 && await button.isVisible() && await button.isEnabled();
            } });
          if (!result) { complete = false; break; }
        }
        if (complete) for (const recipientRoleId of mission.participantRoleIds) {
          const result = await missionUi(mission.missionLeaderRoleId, mission.id, async (panel, commit) => {
            const recipient = panel.getByRole('combobox', { name: 'Participant for extra card', exact: true });
            const recipients = await recipient.locator('option').evaluateAll(nodes => nodes
              .filter(node => node.value && !node.disabled).map(node => node.value));
            const originalRecipient = roster.find(actor => actor.roleId === recipientRoleId);
            assert.ok(originalRecipient?.uidHash, 'Bind each explicitly requested original participant.');
            const matchingRecipients = recipients.filter(uid => createHash('sha256').update(uid)
              .digest('hex').slice(0, 16) === originalRecipient.uidHash);
            assert.equal(matchingRecipients.length, 1, 'The current source must offer exactly this original recipient.');
            await recipient.selectOption(matchingRecipients[0]);
            const opportunity = panel.getByRole('combobox', { name: 'Opportunity for blind extra card', exact: true });
            const offered = await opportunity.locator('option').evaluateAll(nodes => nodes
              .filter(node => node.value && !node.disabled).map(node => node.value));
            assert.ok(offered.length > 0, 'Use only an actual blind extra-card opportunity.');
            await opportunity.selectOption(offered[0]);
            await commit(() => panel.getByRole('button', { name: 'Distribute one card blindly', exact: true }).click());
          }, { expectedGroupId: mission.groupId, offered: async panel => {
            const recipient = panel.getByRole('combobox', { name: 'Participant for extra card', exact: true });
            const recipientRole = roster.find(actor => actor.roleId === recipientRoleId);
            if (!recipientRole?.uidHash || await recipient.count() !== 1 || !(await recipient.isVisible())) return false;
            const recipients = await recipient.locator('option').evaluateAll(nodes =>
              nodes.filter(node => node.value && !node.disabled).map(node => node.value));
            const offeredRecipients = recipients.filter(uid => createHash('sha256').update(uid)
              .digest('hex').slice(0, 16) === recipientRole.uidHash);
            const opportunity = panel.getByRole('combobox', { name: 'Opportunity for blind extra card', exact: true });
            if (offeredRecipients.length !== 1 || await opportunity.count() !== 1) return false;
            const choices = await opportunity.locator('option').evaluateAll(nodes =>
              nodes.filter(node => node.value && !node.disabled).map(node => node.value));
            const button = panel.getByRole('button', { name: 'Distribute one card blindly', exact: true });
            return choices.length > 0 && await button.count() === 1 && await button.isVisible() && await button.isEnabled();
          } });
          if (!result) { complete = false; break; }
        }
        if (complete) {
          const open = await missionUi('gm', mission.id,
            (panel, commit) => commit(() =>
              panel.getByRole('button', { name: 'Open private discards', exact: true }).click()),
            { offered: async panel => {
              const button = panel.getByRole('button', { name: 'Open private discards', exact: true });
              return await button.count() === 1 && await button.isVisible() && await button.isEnabled();
            } });
          complete = Boolean(open);
        }
        if (complete) for (const roleId of mission.participantRoleIds) {
          const result = await missionUi(roleId, mission.id,
            (panel, commit) => commit(() => panel.getByRole('button', { name: /^Discard .* secretly$/ }).first().click()),
            { expectedGroupId: mission.groupId, offered: async panel => {
              const button = panel.getByRole('button', { name: /^Discard .* secretly$/ }).first();
              return await button.count() > 0 && await button.isVisible() && await button.isEnabled();
            } });
          if (!result) { complete = false; break; }
        }
        if (complete) for (const roleId of mission.participantRoleIds) {
          const result = await missionUi(roleId, mission.id, async (panel, commit) => {
            const choices = await panel.getByRole('combobox', { name: /^Opportunity for / }).all();
            const used = new Set();
            for (const choice of choices) {
              const offered = await choice.locator('option').evaluateAll(nodes => nodes
                .filter(node => node.value && !node.disabled).map(node => node.value));
              const selected = offered.find(value => !used.has(value));
              if (selected) { await choice.selectOption(selected); used.add(selected); }
            }
            await commit(() => panel.getByRole('button', { name: 'Submit mission assignments', exact: true }).click());
          }, { expectedGroupId: mission.groupId, offered: async panel => {
            const button = panel.getByRole('button', { name: 'Submit mission assignments', exact: true });
            return await button.count() === 1 && await button.isVisible() && await button.isEnabled();
          } });
          if (!result) { complete = false; break; }
        }
        missionPrivateComplete = complete;
        checks.privateMissionCardsAndLeaderChoices = complete;
        if (!complete) pending('mission-private-choices', ['current-original-participant-no-longer-eligible'],
          { groupId: mission.groupId, cycle: 2 });
      }
    }
    if (!mission) {
      checks.realMissionStartAndExactRetry = false;
      checks.privateMissionCardsAndLeaderChoices = false;
      checks.serverMissionResolutionAndCustodyDelivery = false;
    }
    await mark('real next Team continues on source state; mission resolution requires a completed legal participant sequence');
    await advance();
    if (mission && missionPrivateComplete) {
      const facilitatorCards = await missionUi('gm', mission.id,
        (panel, commit) => commit(() =>
          panel.getByRole('button', { name: 'Add facilitator cards', exact: true }).click()),
        { offered: async panel => {
          const button = panel.getByRole('button', { name: 'Add facilitator cards', exact: true });
          return await button.count() === 1 && await button.isVisible() && await button.isEnabled();
        } });
      if (facilitatorCards) {
        const resolved = await missionUi('gm', mission.id,
          (panel, commit) => commit(() =>
            panel.getByRole('button', { name: 'Resolve away mission', exact: true }).click()),
          { offered: async panel => {
            const button = panel.getByRole('button', { name: 'Resolve away mission', exact: true });
            return await button.count() === 1 && await button.isVisible() && await button.isEnabled();
          } });
        if (resolved?.publicState.status === 'resolved') {
          delivered = await missionUi(mission.missionLeaderRoleId, mission.id,
            (panel, commit) => commit(() =>
              panel.getByRole('button', { name: 'Drop mission rewards at selected ship', exact: true }).click()),
            { expectedGroupId: mission.groupId, offered: async panel => {
              const button = panel.getByRole('button', { name: 'Drop mission rewards at selected ship', exact: true });
              return await button.count() === 1 && await button.isVisible() && await button.isEnabled();
            } });
          if (delivered?.publicState.status === 'complete') checks.serverMissionResolutionAndCustodyDelivery = true;
          else pending('mission-reward-delivery', ['current-mission-leader-or-source-control-unavailable'],
            { groupId: mission.groupId, cycle: 3 });
        }
      }
    } else if (mission) pending('mission-resolution-and-custody-delivery',
      ['mission-private-choices-not-fully-committed'], { groupId: mission.groupId, cycle: 3 });
    if (delivered?.publicState.status === 'complete')
      await compose('cycle-3-team-after-real-mission-delivery', governance.team3AfterMissionDelivery);
    else pending('cycle-3-governance-after-mission-delivery', ['no-current-committed-mission-delivery'], { cycle: 3 });
    await researchCross(3);
    await mark('real Team3 source research and six paid maintenance accounts after private mission delivery');
    await paidMaintenance(3);
    await compose('cycle-3-after-six-paid-maintenance', procedures.onCycle3Maintenance);
    await sourceInterruptions('cycle-3-after-maintenance-source-events');
    await coordination();
    await compose('cycle-3-coordination-before-advance', procedures.onCycle3Coordination);
    await compose('cycle-3-coordination-before-advance-governance', governance.coordination3BeforeAdvance);
    await advance();
    const researchCycle4 = await researchCross(4);
    await mark('real Team4 fourth detector cross and six paid maintenance accounts');
    await paidMaintenance(4);
    await compose('cycle-4-after-six-paid-maintenance', procedures.onCycle4Maintenance);
    await sourceInterruptions('cycle-4-after-maintenance-source-events');
    await compose('cycle-4-team-after-maintenance', governance.team4AfterMaintenance);
    await coordination();
    await compose('cycle-4-coordination-before-private-deduction-core-actions', procedures.onCycle4Coordination);
    await mark('actual original private Scientist Intelligence Wolf and GM deduction procedures only after four distinct current research commits');
    const censusRead = await readServerSource('loyaltyCensus/current');
    const censusEntries = censusRead.value?.entries;
    let deductionReady = researchCycle4 && [1, 2, 3].every(cycle => checks[`separateScientistResearchCycle${cycle}`] === true) &&
      Array.isArray(censusEntries);
    if (deductionReady) {
      for (const [name, kinds] of [
        ['wolf-detector-target', ['wolf-agent']],
        ['private-wolf-intelligence', ['wolf-agent', 'wolf-cult']],
        ['private-intelligence-agent', ['intelligence-agent']],
      ]) {
        const entry = censusEntries.find(value => typeof value?.uid === 'string' && kinds.includes(value.kind) &&
          roster.some(actor => actor.uidHash === createHash('sha256').update(value.uid).digest('hex').slice(0, 16)));
        const actor = entry && roster.find(value => value.uidHash ===
          createHash('sha256').update(entry.uid).digest('hex').slice(0, 16));
        if (!entry || !actor) { deductionReady = false; pending(`cycle-4-${name}`, ['current-private-holder-not-in-original-roster'], { cycle: 4 }); continue; }
        const readiness = await currentRoleReadiness(baseShipForRole(actor.roleId), actor.roleId, 4, { enterConsole: false });
        if (readiness.status !== 'eligible') {
          deductionReady = false;
          pending(`cycle-4-${name}`, readiness.blockers, { roleId: actor.roleId, shipId: baseShipForRole(actor.roleId), cycle: 4 });
        }
      }
    } else pending('cycle-4-private-deduction', ['four-distinct-scientist-research-commits-or-current-server-census-missing'], { cycle: 4 });
    if (deductionReady) {
      await runBaseCombatAndDeduction(context, { combat: 'none', expectedCycle: 4, detectorTest: true,
        investigate: true, sendWolfIntelligence: true,
        requiredBranches: ['agent-detector', 'intelligence-investigation', 'wolf-intelligence', 'suspicion-guidance'],
        evidenceName: 'base-private-deduction-cycle-4.json' });
      checks.sourceResearchAndPrivateDeduction = true;
      await compose('cycle-4-coordination-after-investigation-governance', governance.coordination4AfterInvestigation);
    } else checks.sourceResearchAndPrivateDeduction = false;
    await mark('normal original-GM mounted custom crisis lifecycle; source-dependent missing inputs remain pending');
    const c4CrisisLifecycle = checks.serverMissionResolutionAndCustodyDelivery
      ? await runBaseC4CustomCrisisLifecycle(context, integration.c4CrisisChoice)
      : pending('cycle-4-custom-crisis-lifecycle', ['requires-current-real-mission-delivery'], { cycle: 4 });
    checks.realGmCrisisLifecycleAndRetries = c4CrisisLifecycle.status === 'source-actions-committed' &&
      c4CrisisLifecycle.completedStates?.length === 6;
    composedStages.push({ stage: 'cycle-4-custom-crisis-lifecycle', ...safeCompositionSummary(c4CrisisLifecycle) });
    await mark('normal root-owned terminal-before, ending, and terminal-after callback sequence');
    await a.save('base-gameplay-actions.json', { status: 'gameplay-committed-ending-pending', stages, checks, costs,
      composedStages,
      compositionPending: governance.pending,
      c4CrisisLifecycle: safeCompositionSummary(c4CrisisLifecycle),
      pendingActions, missionOutcomes: delivered?.publicState.outcomes?.map(({ outcome }) => outcome),
      scope: 'Fresh source-eligible Base maintenance, scouts, charged jumps, separate Scientist research and mounted mission. Destroyed, escaped, unoffered, unavailable and absent source roles remain pending.' });
    for (const callback of integration.terminalBefore) await callback(context);
    await integration.normalEnding(context);
    for (const callback of integration.terminalAfter) await callback(context);
    await a.save('base-gameplay-actions.json', { status: 'passed', stages, checks, costs,
      composedStages,
      compositionPending: governance.pending,
      c4CrisisLifecycle: safeCompositionSummary(c4CrisisLifecycle),
      terminalCallbackOrder: { beforeCount: integration.terminalBefore.length,
        normalEnding: true, afterCount: integration.terminalAfter.length },
      ending: (await gm.observe()).phase, pendingActions,
      missionOutcomes: delivered?.publicState.outcomes?.map(({ outcome }) => outcome) });
  } catch (error) {
    rememberProofFailure(error, { operation: 'runBaseGameplay', consumedObservations: a.consumedObservations?.(),
      stages, checks, costs, composedStages, pendingActions, compositionPending: governance.pending });
    await retainProofFailure(directory, 'base-composed', error);
    try {
      await a.save('base-gameplay-actions.json', { status: 'failed-or-incomplete', stages, checks, costs,
        composedStages, pendingActions, compositionPending: governance.pending, message: error.message });
    } catch (reportError) {
      await retainProofFailure(directory, 'base-composed-report', reportError, { primaryError: error });
    }
    throw error;
  }
}
