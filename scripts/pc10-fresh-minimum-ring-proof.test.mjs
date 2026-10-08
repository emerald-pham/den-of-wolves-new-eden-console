import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertStationPopulationAcknowledgmentTransition, assertStationPopulationGmActorAuthority, assertStationPopulationGmActorObserver, minimumRingPlan, runRingWorkflow, runStationCombatWaves, selectStationCombatCrew, stationCombatServerContext, stationDialogAccessibleName, stationPopulationAckMutinyRows, stationPopulationAlertsForGm, stationPopulationDismissIntent, stationPopulationGmActorAnchor, stationPopulationGmAuthorityPreflight } from './pc10-fresh-minimum-ring-proof.mjs';

const stationPopulationGmAttemptEvidence = JSON.parse(readFileSync(
  new URL('./fixtures/pc10-population-gm-observer-attempt-evidence.json', import.meta.url), 'utf8'));

function stationPopulationGmActualAttempt18() {
  const attempt = stationPopulationGmAttemptEvidence.attempt18;
  const live = structuredClone(attempt.native.after);
  const lifecycle = structuredClone(attempt.lifecycle.current);
  const expectedUid = 'source-only-synthetic-uid';
  // The original native capture retains UID hashes and session/instance/lease
  // values, but not the raw Auth UID or Firestore authority rows. These rows
  // are source-only synthetic test inputs, not native evidence.
  const serverPlayer = { uid: expectedUid, sessionId: lifecycle.sessionId, role: 'gm', connected: true,
    connectionGeneration: live.connectionGeneration };
  const serverInstance = { id: lifecycle.instanceId, uid: expectedUid, sessionId: lifecycle.sessionId,
    connected: true, claimedAt: lifecycle.claimedAt };
  const claimInstance = { id: lifecycle.instanceId, uid: expectedUid, sessionId: lifecycle.sessionId,
    claimedAt: lifecycle.claimedAt };
  return { attempt, live, lifecycle, expectedUid, serverPlayer, serverInstance, claimInstance,
    expectedSessionId: lifecycle.sessionId };
}

function stationPopulationGmPreflight(input, { readActor, readServerAuthority, onActorObservation } = {}) {
  return stationPopulationGmAuthorityPreflight({
    readActor: readActor ?? (async () => ({ live: structuredClone(input.live), lifecycle: structuredClone(input.lifecycle) })),
    readServerAuthority: readServerAuthority ?? (async () => ({ serverPlayer: input.serverPlayer, serverInstance: input.serverInstance })),
    claimInstance: input.claimInstance,
    expectedSessionId: input.expectedSessionId,
    expectedUid: input.expectedUid,
    onActorObservation,
  });
}

function stationLossFixture({ originalGeneration = 4, currentGeneration = 4 } = {}) {
  const actor = { uid: 'pdf', roleId: 'refinery-124-pdf-colonel',
    original: { uidHash: 'pdf-hash', sessionId: 'sid', fleetGroupId: 'fleet-1',
      connectionGeneration: originalGeneration, documentTimeOrigin: 10000, identityHydrationRevision: 2 } };
  const escapeState = { status: 'pending', shipId: 'refinery-124', destructionEventId: 'wolf-loss-1', revision: 3 };
  const root = { shipDamage: { 'refinery-124': { damagedSystemIds: ['reactor'], destroyed: true } } };
  const player = { uid: 'pdf', sessionId: 'sid', role: 'player', assignedRoleId: actor.roleId,
    activeConsoleRoleId: null, seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: currentGeneration,
    connected: true, escapeState };
  const commonMember = { hasAuth: true, sameActor: true, uidHash: 'pdf-hash', sessionId: 'sid', meSessionId: 'sid',
    profileRoleId: null, profileSessionId: null, playerRole: 'player', assignedRoleId: actor.roleId,
    seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: currentGeneration, documentTimeOrigin: 10000,
    identityHydrationRevision: 2, connection: 'live', freshness: 'server', kicked: false,
    replacementRoleId: null, replacementStatus: null, invalidFields: [] };
  return { actor, root, player, escapeState,
    before: { ...commonMember, activeConsoleRoleId: actor.roleId, escapeLocked: false,
      escapeState: null, browserProjectionConsistent: true },
    after: { ...commonMember, activeConsoleRoleId: null, escapeLocked: true,
      escapeState, browserProjectionConsistent: true } };
}

test('fresh Ring plan has three entitled Auth identities and zero unused-seat accounts', () => {
  const plan = minimumRingPlan();
  assert.equal(plan.actualAuthenticatedActors, 3);
  assert.equal(plan.configuredRoles, 13);
  assert.equal(plan.browserProcesses, 2);
  assert.equal(plan.browserContexts, 3);
  assert.equal(plan.hardCapMs, 1200000);
});

// Synthetic procedure contracts, never gameplay evidence. Each operation is
// replaced by the concrete normal-UI/SDK implementation in the executable.
test('fresh workflow creates actual prerequisites, then original recovery and ending; no discovery/checkpoint replay', async () => {
  const trace = [];
  const operations = Object.fromEntries(['setup', 'researchCycle', 'advance', 'arrive', 'repairRing',
    'crossAndRecover', 'finishPassages', 'sabotageAndClose'].map(name => [name, async value => {
    trace.push({ name, value }); return name === 'setup' ? { sessionId: 'fresh' } : undefined;
  }]));
  await runRingWorkflow(operations);
  assert.deepEqual(trace.map(value => value.name), ['setup', 'researchCycle', 'advance', 'researchCycle',
    'advance', 'researchCycle', 'advance', 'researchCycle', 'arrive', 'repairRing', 'crossAndRecover',
    'finishPassages', 'sabotageAndClose']);
  assert.deepEqual(trace.filter(value => value.name === 'researchCycle').map(value => value.value), [1, 2, 3, 4]);
  assert.deepEqual(trace.filter(value => value.name === 'advance').map(value => value.value), [2, 3, 4]);
  assert.equal(trace.some(value => /discover|checkpoint/i.test(value.name)), false);
});

test('station wave consumer seam preserves actor, Declare, combat and publication order through liberation', async () => {
  const trace = [], results = [
    { attackId: 'attack-1', pStationRepeat: { status: 'repeat' } },
    { attackId: 'attack-2', pStationRepeat: { status: 'stopped' } },
  ];
  const waves = await runStationCombatWaves({ maximumWaves: 12,
    assertActors: async ({ wave }) => trace.push(`actors:${wave}`),
    prepareAndDeclare: async ({ wave }) => trace.push(`declare:${wave}`),
    runWave: async ({ wave }) => { trace.push(`combat:${wave}`); return results[wave - 1]; },
    persistWaves: async current => trace.push(`persist:${current.length}`),
  });
  assert.deepEqual(trace, ['actors:1', 'declare:1', 'combat:1', 'persist:1',
    'actors:2', 'declare:2', 'combat:2', 'persist:2']);
  assert.deepEqual(waves, [
    { wave: 1, attackId: 'attack-1', repeat: { status: 'repeat' } },
    { wave: 2, attackId: 'attack-2', repeat: { status: 'stopped' } },
  ]);
});

test('station wave consumer dismisses its exact informational population alert before the next Declare', async () => {
  const trace = [];
  let populationAlertOpen = false;
  const results = [
    { attackId: 'attack-1', pStationRepeat: { status: 'repeat' } },
    { attackId: 'attack-2', pStationRepeat: { status: 'stopped' } },
  ];
  const waves = await runStationCombatWaves({ maximumWaves: 12,
    assertActors: async ({ wave }) => trace.push(`actors:${wave}`),
    prepareAndDeclare: async ({ wave }) => {
      trace.push(`declare:${wave}`);
      assert.equal(populationAlertOpen, false,
        'The first terminal pass raises a modal that intercepts the next normal Declare click.');
    },
    runWave: async ({ wave }) => {
      trace.push(`combat:${wave}`);
      if (wave === 1) populationAlertOpen = true;
      return results[wave - 1];
    },
    acknowledgeBetweenWaves: async ({ wave }) => {
      assert.equal(wave, 1);
      assert.equal(populationAlertOpen, true);
      trace.push('dismiss:exact-population-alert');
      populationAlertOpen = false;
    },
    persistWaves: async current => trace.push(`persist:${current.length}`),
  });
  assert.deepEqual(trace, ['actors:1', 'declare:1', 'combat:1', 'persist:1',
    'dismiss:exact-population-alert', 'actors:2', 'declare:2', 'combat:2', 'persist:2']);
  assert.equal(waves.length, 2);
});

test('Station combat diagnostics retain population, alert, mutiny and terminal guards without retaining the whole root', () => {
  const root = {
    currentTurn: 2, phase: 'active', activeVesselIds: ['aegis', 'dione'], shipDamage: {},
    shipResources: { dione: { food: 5, water: 4 } }, shipSurvivors: { aegis: 0, dione: 66000 },
    shipUnrest: { dione: 3 }, shipMutinies: {},
    populationAlerts: { dione: { shipId: 'dione', shipName: 'Dione', population: 66000,
      targetGmInstanceIds: ['gm-original'], createdAt: '2026-10-08T12:00:00.000Z' } },
    unrestAlerts: {}, vesselActionRevisions: { dione: 7 }, gameOutcome: null,
    survivorOutcome: null, debriefSnapshot: null, debriefMode: { active: false, revision: 0 },
    joinCode: 'private-code', ownerUid: 'private-uid', email: 'private@example.test',
  };
  const context = stationCombatServerContext({ sessionId: 'owned', root, pdfWing: null, publicAudience: null,
    players: [], fleetGroups: [] });
  for (const key of ['phase', 'shipResources', 'shipDamage', 'shipSurvivors', 'shipUnrest', 'shipMutinies',
    'populationAlerts', 'unrestAlerts', 'vesselActionRevisions', 'gameOutcome', 'survivorOutcome',
    'debriefSnapshot', 'debriefMode']) assert.deepEqual(context[key], root[key]);
  for (const key of ['joinCode', 'ownerUid', 'email']) assert.equal(context[key], undefined);
});

test('population acknowledgment accepts only one alert removal and its exact vessel revision', () => {
  const before = { sessionId: 'owned', currentTurn: 2, phase: 'active', shipDamage: { dione: { destroyed: false } },
    shipSurvivors: { dione: 66000 }, shipResources: { dione: { food: 5, water: 4 } }, shipUnrest: { dione: 3 },
    shipMutinies: {}, populationAlerts: { dione: { shipId: 'dione' }, aegis: { shipId: 'aegis' } },
    unrestAlerts: {}, vesselActionRevisions: { dione: 7, aegis: 2 }, gameOutcome: null,
    survivorOutcome: null, debriefSnapshot: null, debriefMode: { active: false, revision: 0 } };
  const after = { ...before, populationAlerts: { aegis: before.populationAlerts.aegis },
    vesselActionRevisions: { dione: 8, aegis: 2 } };
  assert.deepEqual(assertStationPopulationAcknowledgmentTransition(before, after, 'dione'),
    { expectedRevision: 7, revision: 8 });
  for (const changed of [
    { ...after, shipSurvivors: { dione: 65999 } },
    { ...after, shipResources: { dione: { food: 4, water: 4 } } },
    { ...after, shipDamage: { dione: { destroyed: true } } },
    { ...after, phase: 'debrief' },
    { ...after, populationAlerts: {} },
    { ...after, vesselActionRevisions: { dione: 9, aegis: 2 } },
    { ...after, vesselActionRevisions: { dione: 8, aegis: 3 } },
  ]) assert.throws(() => assertStationPopulationAcknowledgmentTransition(before, changed, 'dione'));
});

test('population alert selector keeps the existing single current-GM target boundary', () => {
  const first = { shipId: 'dione', targetGmInstanceIds: ['gm-1'] };
  const other = { shipId: 'aegis', targetGmInstanceIds: ['gm-2'] };
  assert.deepEqual(stationPopulationAlertsForGm({ dione: first, aegis: other }, 'gm-1'), [['dione', first]]);
  const second = { shipId: 'shepherd', targetGmInstanceIds: ['gm-1'] };
  assert.deepEqual(stationPopulationAlertsForGm({ dione: first, aegis: other, shepherd: second }, 'gm-1'),
    [['dione', first], ['shepherd', second]]);
});

test('Attempt18 serialized postclaim observer schemas pass the production GM preflight and bind its callback anchor', async () => {
  const input = stationPopulationGmActualAttempt18();
  assert.equal(Object.hasOwn(input.lifecycle, 'profileSessionId'), false,
    'The actual lifecycle observer omits profileSessionId.');
  assert.equal(input.live.profileSessionId, null,
    'The actual native ordinary observer emits the null profileSessionId guard.');
  assert.equal(input.lifecycle.playerRole, 'gm');
  assert.equal(input.lifecycle.gmInstanceOwned, true);
  assert.equal(input.live.gmInstanceOwned, true);
  assert.equal(input.lifecycle.sessionId, input.live.sessionId);
  assert.equal(input.lifecycle.uidHash, input.live.uidHash);
  assert.equal(input.lifecycle.generation, input.live.connectionGeneration);
  assert.equal(input.lifecycle.hydrationRevision, input.live.hydrationRevision);
  assert.equal(input.lifecycle.instanceId, input.live.instanceId);

  const result = await stationPopulationGmPreflight(input);
  assert.equal(result.anchor.generation, input.live.connectionGeneration);
  assert.equal(result.anchor.hydrationRevision, input.live.hydrationRevision);
  assert.equal(result.anchor.instanceId, input.live.instanceId);
  assert.equal(result.anchor.claimedAt, input.lifecycle.claimedAt);
  assert.doesNotThrow(() => assertStationPopulationGmActorObserver(result.anchor,
    { live: input.live, lifecycle: input.lifecycle }));
  const activeAck = stationPopulationGmAttemptEvidence.attempt18.activeAck;
  assert.equal(activeAck.lifecycle.phase, 'active');
  assert.equal(activeAck.lifecycle.playerRole, 'gm');
  assert.equal(Object.hasOwn(activeAck.lifecycle, 'profileSessionId'), false);
  assert.equal(activeAck.native.profileSessionId, null);
  assert.equal(activeAck.lifecycle.sessionId, input.lifecycle.sessionId);
  assert.equal(activeAck.lifecycle.uidHash, input.lifecycle.uidHash);
  assert.equal(activeAck.lifecycle.generation, input.lifecycle.generation);
  assert.equal(activeAck.lifecycle.hydrationRevision, input.lifecycle.hydrationRevision);
  assert.equal(activeAck.lifecycle.instanceId, input.lifecycle.instanceId);
  assert.equal(activeAck.lifecycle.claimedAt, input.lifecycle.claimedAt);
  assert.doesNotThrow(() => assertStationPopulationGmActorObserver(result.anchor,
    { live: activeAck.native, lifecycle: activeAck.lifecycle }),
  'The actual active-phase actor sample passes the production wave acknowledgment callback guard.');
  assert.equal(assertStationPopulationGmActorAuthority(result.anchor, {
    live: input.live, lifecycle: input.lifecycle, serverPlayer: input.serverPlayer,
    serverInstance: input.serverInstance, claimInstance: input.claimInstance,
    expectedSessionId: input.expectedSessionId, expectedUid: input.expectedUid,
  }), true);
});

test('Attempt19 preclaim serialized lifecycle remains rejected without a paired postclaim lifecycle observer', async () => {
  const attempt = stationPopulationGmAttemptEvidence.attempt19;
  const live = structuredClone(attempt.native.before);
  const lifecycle = structuredClone(attempt.lifecycle.current);
  assert.equal(lifecycle.playerRole, 'player');
  assert.equal(lifecycle.gmInstanceOwned, false);
  assert.equal(Object.hasOwn(lifecycle, 'profileSessionId'), false);
  assert.equal(lifecycle.instanceId, null);
  assert.equal(lifecycle.claimedAt, null);
  assert.equal(live.playerRole, 'player');
  assert.equal(live.gmInstanceOwned, false);
  assert.equal(live.profileSessionId, null);
  assert.notEqual(attempt.native.after.playerRole, lifecycle.playerRole,
    'The postclaim native-only observation is not a matching postclaim lifecycle observation.');

  const expectedUid = 'source-only-preclaim-uid';
  await assert.rejects(stationPopulationGmAuthorityPreflight({
    readActor: async () => ({ live: structuredClone(live), lifecycle: structuredClone(lifecycle) }),
    readServerAuthority: async () => ({ serverPlayer: { uid: expectedUid, sessionId: lifecycle.sessionId,
      role: 'player', connected: true, connectionGeneration: live.connectionGeneration }, serverInstance: null }),
    claimInstance: null, expectedSessionId: lifecycle.sessionId, expectedUid,
  }), /server-owned lease rows/i);
});

test('Attempt18 production preflight retains each full observer sample before later authority validation', async () => {
  const input = stationPopulationGmActualAttempt18(), retained = [];
  const server = { serverPlayer: input.serverPlayer,
    serverInstance: { ...input.serverInstance, connected: false } };
  await assert.rejects(stationPopulationGmPreflight(input, {
    readServerAuthority: async () => server,
    onActorObservation: (stage, actor) => retained.push({ stage, actor }),
  }));
  assert.deepEqual(retained.map(value => value.stage), ['before', 'current']);
  for (const value of retained) {
    assert.deepEqual(Object.keys(value.actor.live), Object.keys(input.live));
    assert.deepEqual(Object.keys(value.actor.lifecycle), Object.keys(input.lifecycle));
    assert.equal(value.actor.lifecycle.profileSessionId, undefined);
    assert.equal(value.actor.live.profileSessionId, null);
  }
});

test('Attempt18 serialized schema keeps missing or changed identity and profile guards strict', async () => {
  const input = stationPopulationGmActualAttempt18();
  const controls = [
    ['missing native session', live => { delete live.sessionId; }, /sessionId/],
    ['changed native generation', live => { live.connectionGeneration += 1; }, /generation/],
    ['missing native hydration', live => { delete live.hydrationRevision; }, /hydration/],
    ['missing native profile session', live => { delete live.profileSessionId; }, /profileSessionId/],
    ['contaminated native profile session', live => { live.profileSessionId = 'foreign-session'; }, /profileSessionId/],
    ['missing lifecycle generation', (_live, lifecycle) => { delete lifecycle.generation; }, /generation/],
    ['changed lifecycle hydration', (_live, lifecycle) => { lifecycle.hydrationRevision += 1; }, /hydration/],
    ['missing lifecycle instance', (_live, lifecycle) => { delete lifecycle.instanceId; }, /instanceId/],
    ['missing lifecycle claim lease', (_live, lifecycle) => { delete lifecycle.claimedAt; }, /claimedAt/],
  ];
  for (const [label, mutate, expected] of controls) {
    const changed = { ...input, live: structuredClone(input.live), lifecycle: structuredClone(input.lifecycle) };
    mutate(changed.live, changed.lifecycle);
    await assert.rejects(stationPopulationGmPreflight(changed), error => {
      assert.match(error.message, expected, label);
      return true;
    }, label);
  }
});

test('Station GM claim preflight binds both native observer schemas and rejects a changed generation', async () => {
  // This is the liveGm/surface.observe schema from the native callback: it emits
  // connectionGeneration, hydrationRevision, and null profileSessionId, while
  // lifecycle snapshots omit profileSessionId and provide generation/claimedAt.
  const claimedAt = '2026-10-08T12:00:00.000Z', expectedUid = 'gm-uid';
  const liveGmObserver = { hasAuth: true, sameActor: true, sessionId: 'sid', uidHash: 'gm-hash',
    connection: 'live', freshness: 'server', connectionGeneration: 1, hydrationRevision: 2,
    profileSessionId: null, instanceId: 'gm-instance', gmInstanceOwned: true };
  const lifecycleObserver = { hasAuth: true, sameActor: true, sessionId: 'sid', uidHash: 'gm-hash',
    connection: 'live', freshness: 'server', generation: 1, hydrationRevision: 2,
    playerRole: 'gm', profileRoleId: null, instanceId: 'gm-instance',
    claimedAt, gmInstanceOwned: true };
  assert.equal(Object.hasOwn(liveGmObserver, 'generation'), false);
  assert.equal(Object.hasOwn(liveGmObserver, 'claimedAt'), false);
  const input = { live: liveGmObserver, lifecycle: lifecycleObserver,
    serverPlayer: { uid: expectedUid, sessionId: 'sid', role: 'gm', connected: true, connectionGeneration: 1 },
    serverInstance: { id: 'gm-instance', uid: expectedUid, sessionId: 'sid', connected: true, claimedAt },
    claimInstance: { id: 'gm-instance', uid: expectedUid, sessionId: 'sid', claimedAt },
    expectedSessionId: 'sid', expectedUid };
  const trace = [];
  const preflight = await stationPopulationGmAuthorityPreflight({
    readActor: async () => { trace.push('native liveGm + lifecycle observers'); return { live: liveGmObserver, lifecycle: lifecycleObserver }; },
    readServerAuthority: async () => { trace.push('current player + GM instance lease'); return input; },
    claimInstance: input.claimInstance, expectedSessionId: 'sid', expectedUid });
  const anchor = preflight.anchor;
  assert.deepEqual(trace, ['native liveGm + lifecycle observers', 'current player + GM instance lease',
    'native liveGm + lifecycle observers'], 'Claim preflight bookends the authoritative source read with browser observations.');
  assert.equal(anchor.generation, liveGmObserver.connectionGeneration,
    'Attempt18 observed projection generation 1 against an undefined saved generation.');
  assert.equal(anchor.claimedAt, lifecycleObserver.claimedAt,
    'The actual lifecycle observer and server claim receipt supply the lease absent from liveGm.');
  assert.doesNotThrow(() => assertStationPopulationGmActorObserver(anchor, input));
  assert.equal(assertStationPopulationGmActorAuthority(anchor, input), true);

  let changedReads = 0;
  await assert.rejects(stationPopulationGmAuthorityPreflight({
    readActor: async () => {
      if (changedReads++ === 0) return { live: liveGmObserver, lifecycle: lifecycleObserver };
      return { live: { ...liveGmObserver, connectionGeneration: 2 },
        lifecycle: { ...lifecycleObserver, generation: 2 } };
    },
    readServerAuthority: async () => input,
    claimInstance: input.claimInstance, expectedSessionId: 'sid', expectedUid }), /generation/i);

  const changedGeneration = { ...input, live: { ...liveGmObserver, connectionGeneration: 2 },
    lifecycle: { ...lifecycleObserver, generation: 2 },
    serverPlayer: { ...input.serverPlayer, connectionGeneration: 2 } };
  assert.throws(() => assertStationPopulationGmActorAuthority(anchor, changedGeneration), /generation changed/i);
  const missingGeneration = { ...liveGmObserver }; delete missingGeneration.connectionGeneration;
  assert.throws(() => stationPopulationGmActorAnchor({ ...input, live: missingGeneration }), /connectionGeneration/i);
  const changedLease = { ...input, serverInstance: { ...input.serverInstance, claimedAt: '2026-10-08T12:01:00.000Z' } };
  assert.throws(() => stationPopulationGmActorAnchor(changedLease), /claim lease|claim receipt/i);
});

test('station wave consumer acknowledges each current-GM threshold alert before the next Declare', async () => {
  const trace = [], alerts = {
    aegis: { shipId: 'aegis', shipName: 'Aegis', targetGmInstanceIds: ['gm-1'] },
    dione: { shipId: 'dione', shipName: 'Dione', targetGmInstanceIds: ['gm-1'] },
  };
  const results = [
    { attackId: 'attack-1', pStationRepeat: { status: 'repeat' } },
    { attackId: 'attack-2', pStationRepeat: { status: 'stopped' } },
  ];
  await runStationCombatWaves({ maximumWaves: 12,
    assertActors: async () => {},
    prepareAndDeclare: async ({ wave }) => {
      trace.push(`declare:${wave}`);
      if (wave === 2) assert.deepEqual(Object.keys(alerts), [],
        'Every ordinary threshold dialog must be acknowledged before the next wave Declare.');
    },
    runWave: async ({ wave }) => results[wave - 1],
    acknowledgeBetweenWaves: async () => {
      for (const [shipId] of stationPopulationAlertsForGm(alerts, 'gm-1')) {
        trace.push(`dismiss:${shipId}`);
        delete alerts[shipId];
      }
    },
    persistWaves: async () => {},
  });
  assert.deepEqual(trace, ['declare:1', 'dismiss:aegis', 'dismiss:dione', 'declare:2']);
});

test('population dialog accessible name resolves every whitespace-separated labelledby ID', () => {
  assert.equal(stationDialogAccessibleName('population-title population-description', {
    'population-title': 'Survivor population threshold reached',
    'population-description': 'A census threshold requires GM attention.',
  }), 'Survivor population threshold reached A census threshold requires GM attention.');
});

test('population acknowledgment blocks unrest at eight even when the mutiny row is absent', () => {
  assert.deepEqual(stationPopulationAckMutinyRows({ activeVesselIds: ['dione'],
    shipUnrest: { dione: 8 }, shipMutinies: {} }), [['dione', undefined]]);
});

test('population acknowledgment fails closed on malformed mutiny data', () => {
  assert.throws(() => stationPopulationAckMutinyRows({ activeVesselIds: ['dione'], shipUnrest: { dione: 2 },
    shipMutinies: { dione: { status: 'active' } } }), /malformed mutiny record/i);
});

test('population dismissal rechecks exact intent and original deadline before the normal click', async () => {
  let clicks = 0, now = 100;
  await assert.rejects(stationPopulationDismissIntent({ deadlineAt: 1000, now: () => now,
    expected: { actor: 'gm-1', shipId: 'dione', revision: 7 },
    readCurrentIntent: async () => ({ actor: 'gm-1', shipId: 'aegis', revision: 2 }),
    click: async () => { clicks++; } }), /intent changed/i);
  assert.equal(clicks, 0);

  await assert.rejects(stationPopulationDismissIntent({ deadlineAt: 1000, now: () => now,
    expected: { actor: 'gm-1', shipId: 'dione', revision: 7 },
    readCurrentIntent: async () => { now = 1000; return { actor: 'gm-1', shipId: 'dione', revision: 7 }; },
    click: async () => { clicks++; } }), /deadline/i);
  assert.equal(clicks, 0);
});

test('population dismissal rereads safe GM source after the final enabled-state await', async () => {
  const trace = [], state = { unrest: 3 };
  let clicks = 0;
  const expected = { actor: 'gm-1', source: 'safe', attack: 'attack-final' };
  await assert.rejects(stationPopulationDismissIntent({ deadlineAt: 1000, now: () => 100, expected,
    readCurrentIntent: async () => {
      trace.push('pre-mount actor/source snapshot');
      const stale = { ...expected };
      trace.push('alertdialog count and visibility');
      await Promise.resolve();
      trace.push('button enabled state');
      state.unrest = 8;
      return stale;
    },
    readIntentBookend: async () => {
      trace.push('post-mount GM actor');
      trace.push('post-mount server source');
      assert.ok(state.unrest < 8, 'Mutiny appeared during the final enabled-state read.');
      return expected;
    },
    click: async () => { clicks++; },
  }), /mutiny appeared/i);
  assert.deepEqual(trace, ['pre-mount actor/source snapshot', 'alertdialog count and visibility',
    'button enabled state', 'post-mount GM actor', 'post-mount server source']);
  assert.equal(clicks, 0);
});

test('first prerequisite failure stops the workflow before candidate outcomes', async () => {
  const trace = [];
  const operations = { setup: async () => trace.push('setup'),
    researchCycle: async () => { trace.push('research'); throw new Error('real research unavailable'); },
    arrive: async () => trace.push('arrive') };
  await assert.rejects(runRingWorkflow(operations), /real research unavailable/);
  assert.deepEqual(trace, ['setup', 'research']);
});

test('station consumer waits for normal browser feed after authoritative server loss before removing the owner from choices', async () => {
  const actor = { uid: 'pdf', roleId: 'refinery-124-pdf-colonel',
    original: { uidHash: 'pdf-hash', sessionId: 'sid', fleetGroupId: 'fleet-1',
      connectionGeneration: 4, documentTimeOrigin: 10000, identityHydrationRevision: 2 } };
  const escapeState = { status: 'pending', shipId: 'refinery-124', destructionEventId: 'wolf-loss-1', revision: 3 };
  const root = { shipDamage: { 'refinery-124': { damagedSystemIds: ['reactor'], destroyed: true } } };
  const player = { uid: 'pdf', sessionId: 'sid', role: 'player', assignedRoleId: actor.roleId,
    activeConsoleRoleId: null, seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: 4,
    connected: true, escapeState };
  const commonMember = { hasAuth: true, sameActor: true, uidHash: 'pdf-hash', sessionId: 'sid', meSessionId: 'sid',
    profileRoleId: null, profileSessionId: null, playerRole: 'player', assignedRoleId: actor.roleId,
    seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: 4, documentTimeOrigin: 10000,
    identityHydrationRevision: 2, connection: 'live', freshness: 'server', kicked: false,
    replacementRoleId: null, replacementStatus: null, invalidFields: [] };
  const browserBeforeNormalFeed = { ...commonMember, activeConsoleRoleId: actor.roleId,
    escapeLocked: false, escapeState: null, browserProjectionConsistent: true };
  const browserAfterNormalFeed = { ...commonMember, activeConsoleRoleId: null,
    escapeLocked: true, escapeState, browserProjectionConsistent: true };
  const browserReads = [browserBeforeNormalFeed, browserAfterNormalFeed];
  const reads = { root: 0, players: 0, member: 0 }, waits = [], inactive = [];

  const active = await selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => { reads.root++; return root; },
    readPlayers: async () => { reads.players++; return [player]; },
    readMember: async () => browserReads[Math.min(reads.member++, browserReads.length - 1)],
    wait: async milliseconds => { waits.push(milliseconds); },
    onInactive: (value, member) => inactive.push({ roleId: value.roleId, escapeState: member.escapeState }),
  });

  assert.deepEqual(active, []);
  assert.deepEqual(inactive, [{ roleId: actor.roleId, escapeState }]);
  assert.deepEqual(reads, { root: 2, players: 2, member: 2 });
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 0 && waits[0] <= 200);
});

test('station loss wait tolerates connecting/cache publication while pinning the first current generation', async () => {
  const { actor, root, player, before, after } = stationLossFixture({ originalGeneration: 3, currentGeneration: 4 });
  const connecting = { ...before, connection: 'connecting', freshness: 'cache', connectionGeneration: 4 };
  const reads = { root: 0, players: 0, member: 0 };
  const active = await selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => { reads.root++; return root; },
    readPlayers: async () => { reads.players++; return [player]; },
    readMember: async () => [connecting, after][Math.min(reads.member++, 1)],
    wait: async () => {},
  });
  assert.deepEqual(active, []);
  assert.deepEqual(reads, { root: 2, players: 2, member: 2 });
});

test('station loss wait rejects a changed server escape tuple instead of rebasing to it', async () => {
  const { actor, root, player, before, after } = stationLossFixture();
  const nextEscape = { ...player.escapeState, destructionEventId: 'wolf-loss-2', revision: 4 };
  let playerReads = 0, memberReads = 0;
  await assert.rejects(selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => root,
    readPlayers: async () => [{ ...player, escapeState: playerReads++ === 0 ? player.escapeState : nextEscape }],
    readMember: async () => [before, { ...after, escapeState: nextEscape }][Math.min(memberReads++, 1)],
    wait: async () => {},
  }), /loss tuple changed/i);
  assert.equal(playerReads, 2);
  assert.equal(memberReads, 1);
});

test('station loss wait rejects a destroyed root that disappears after the server loss was observed', async () => {
  const { actor, root, player, before } = stationLossFixture();
  const roots = [root, { shipDamage: { 'refinery-124': { damagedSystemIds: [], destroyed: false } } }];
  let rootReads = 0;
  await assert.rejects(selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => roots[Math.min(rootReads++, 1)],
    readPlayers: async () => [player],
    readMember: async () => before,
    wait: async () => {},
  }), /destroyed root changed/i);
  assert.equal(rootReads, 2);
});

test('station loss wait rejects torn before/after browser reads before accepting the normal feed', async () => {
  const { actor, root, player, before, after } = stationLossFixture();
  const torn = { ...after, browserLossSample: after, browserLossSamples: [before, after], browserProjectionConsistent: true };
  const coherent = { ...after, browserLossSample: after, browserLossSamples: [after, after], browserProjectionConsistent: true };
  let memberReads = 0;
  const active = await selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => root,
    readPlayers: async () => [player],
    readMember: async () => [torn, coherent][Math.min(memberReads++, 1)],
    wait: async () => {},
  });
  assert.deepEqual(active, []);
  assert.equal(memberReads, 2);
});

test('station loss wait treats an incomplete cleared-role aggregate as pending until the explicit tuple arrives', async () => {
  const { actor, root, player, after } = stationLossFixture();
  const incomplete = { ...after, escapeState: null, escapeLocked: true, escapeStateValid: true,
    browserProjectionConsistent: false };
  let memberReads = 0, inactive = 0;
  const active = await selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => root,
    readPlayers: async () => [player],
    readMember: async () => [incomplete, after][Math.min(memberReads++, 1)],
    wait: async () => {},
    onInactive: () => inactive++,
  });
  assert.deepEqual(active, []);
  assert.equal(memberReads, 2);
  assert.equal(inactive, 1);
});

test('station loss wait cannot credit inactivity when an awaited source read finishes after the original deadline', async () => {
  const { actor, root, player, after } = stationLossFixture();
  const inactive = [];
  await assert.rejects(selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 20,
    readRoot: async () => {
      await new Promise(resolve => setTimeout(resolve, 35));
      return root;
    },
    readPlayers: async () => [player],
    readMember: async () => after,
    wait: async () => {},
    onInactive: value => inactive.push(value.roleId),
  }), /deadline/i);
  assert.deepEqual(inactive, []);
});

import * as proof from './pc10-fresh-minimum-ring-proof.mjs';
test('cleanup failure cannot publish a passed proof or erase the original failure', () => {
 const first = new Error('original crossing failure');
 const evidence = {status:'passed'};
 const cleanup = {errors:[{label:'owned Auth',error:'delete denied'}]};
 assert.equal(typeof proof.finalizeRingEvidence, 'function');
 const failure = proof.finalizeRingEvidence(evidence, cleanup, null);
 assert.equal(evidence.status,'failed'); assert.match(failure.message,/cleanup/i);
 assert.equal(proof.finalizeRingEvidence({status:'failed'},cleanup,first),first);
});
test('allocation binds the complete compiled tree before runtime', () => {
 const input={status:'EXPLICIT_PARENT_ALLOCATION_GRANTED',sourceRoot:'/tmp/source',projectId:'demo-ring',
 baseUrl:'http://127.0.0.1:5190',ports:{auth:9190,firestore:8180,functions:5100},
 sourceCommit:'a'.repeat(40),runnerSha256:'b'.repeat(64),compiledIndexSha256:'c'.repeat(64)};
 assert.throws(()=>proof.validateRingAllocation(input),/compiledTreeSha256/);
 assert.equal(proof.validateRingAllocation({...input,compiledTreeSha256:'d'.repeat(64)}).compiledTreeSha256,'d'.repeat(64));
});

test('actual candidate recovery expects server replay status while preserving every original result field',()=>{
 const original={type:'candidate-action-result',status:'committed',action:'ring-passage',requestId:'original',fuelSpent:5,outcome:'crossed'};
 assert.equal(typeof proof.expectedRingRecoveryReply,'function');
 assert.deepEqual(proof.expectedRingRecoveryReply(original),{...original,status:'replayed'});
 assert.equal(original.status,'committed');
});

test('maintenance pacing prevents the server thirty-request minute burst without retry or bypass',async()=>{
 let now=0;const waits=[];
 assert.equal(typeof proof.createRingMaintenancePacer,'function');
 const pace=proof.createRingMaintenancePacer({now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}});
 const times=[];for(let i=0;i<31;i++){await pace();times.push(now);}
 assert.ok(times[30]-times[0]>60000);assert.equal(waits.length,30);
});
test('owned Auth freshness tolerates second precision but forbids a preexisting identity',()=>{
 assert.equal(typeof proof.assertFreshRingIdentity,'function');
 proof.assertFreshRingIdentity({uid:'fresh',metadata:{creationTime:new Date(100000).toUTCString()}},100999,new Set());
 assert.throws(()=>proof.assertFreshRingIdentity({uid:'old',metadata:{creationTime:new Date(100000).toUTCString()}},100999,new Set(['old'])),/preexisting/i);
 assert.throws(()=>proof.assertFreshRingIdentity({uid:'old',metadata:{creationTime:new Date(99000).toUTCString()}},100999,new Set()),/fresh/i);
});
test('page errors and blocked remote requests preclude successful native proof',()=>{
 assert.equal(typeof proof.assertRingRuntimeClean,'function');
 proof.assertRingRuntimeClean([],[]);
 assert.throws(()=>proof.assertRingRuntimeClean([{message:'page failed'}],[]),/page/i);
 assert.throws(()=>proof.assertRingRuntimeClean([],['https://outside.example/']),/remote/i);
});

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('CLI entrypoint validates arguments through both canonical and /tmp alias paths',()=>{
 const canonical=fileURLToPath(new URL('./pc10-fresh-minimum-ring-proof.mjs',import.meta.url));
 const alias=canonical.replace(/^\/private\/tmp\//,'/tmp/');
 for(const filename of new Set([canonical,alias])){
  const result=spawnSync(process.execPath,[filename,'--invalid'],{encoding:'utf8'});
  assert.notEqual(result.status,0,`${filename} silently skipped its CLI guard`);
  assert.match(result.stderr,/Use --allocation/);
 }
});

test('Ring location comes from the entitled mounted GM chart, with exactly one candidate and locked chart',async()=>{
 assert.equal(typeof proof.readRingCoordinate,'function');
 let reads=0;
 const surface={storeModuleUrl:()=>'/native/store',page:{evaluate:async(callback,url)=>{
  assert.equal(typeof callback,'function');assert.equal(url,'/native/store');reads++;
  return{chartId:'A',locked:true,candidates:[{code:'N',coordinate:'1234'}]};
 }}};
 assert.equal(await proof.readRingCoordinate(surface),'1234');assert.equal(reads,1);
 surface.page.evaluate=async()=>({chartId:'A',locked:true,candidates:[]});
 await assert.rejects(proof.readRingCoordinate(surface),/one Ring/i);
 surface.page.evaluate=async()=>({chartId:'A',locked:false,candidates:[{code:'N',coordinate:'1234'}]});
 await assert.rejects(proof.readRingCoordinate(surface),/locked/i);
});
