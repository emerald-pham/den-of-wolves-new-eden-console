import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CORE_CRAFT_PROCEDURES,
  GM_RULING_COUNTER_PROCEDURES,
  captureMountedProcedureAction,
  evaluateProcedureCapture,
} from './pc10-pending-procedure-ui-proof.mjs';

// Reason: keep source-owned pending procedure rows finite and executable without
// treating a route visit, SDK-only call, unavailable control, or synthetic
// outcome as gameplay evidence. The source actor hash must be explicit in every
// pure capture fixture; random/private reply fields may exist transiently but
// must never be copied into the returned evidence.

const EXPECTED_CORE = [
  'allocateHummingbirdHarvest', 'chooseBoaMissionReclamationOpportunity', 'rechargeHostConsoleFromShuttle',
  'recycleWithBoa', 'repairConsolesFromAlly', 'repairConsolesFromBlacksmith', 'repairConsolesFromChacau',
  'repairConsolesFromMacaw', 'repairConsolesFromPhilia', 'repairMaliades', 'rollHummingbirdHarvest',
  'runHighwallMining', 'beginShuttleTransit', 'completeShuttleArrival', 'evacuateShuttleSurvivorsCommand',
  'requestShuttleDeparture', 'retargetShuttleTransit', 'transferShuttleCargoCommand', 'transferShuttleControlCommand',
];

const EXPECTED_GM = [
  'addShipDamage', 'applyShipCounterSteps', 'dismissPopulationAlert', 'dismissUnrestAlert', 'repairAllShipDamage',
  'resolveShipMutiny', 'rollbackMaintenance', 'runMaintenance', 'scavengeDestroyedShipStores', 'setFighterWingCount',
  'authorFacilitatorRuleCall', 'setCandidatePlanCheckpoint', 'setFacilitatorCensusNote',
  'setFacilitatorResponsibility', 'setGmControlsLocked', 'setGmShipConsoleWriteGrant', 'setShipConsoleLock',
];

const actor = { uidHash: 'actor-hash', sessionId: 'session-1', profileRoleId: 'icebreaker-miner',
  activeConsoleRoleId: 'icebreaker-miner', sameActor: true, connection: 'live', freshness: 'server' };
const request = { sessionId: 'session-1', requestId: 'request-1', expectedCycle: 2,
  expectedRevision: 7, shipId: 'icebreaker', action: 'ore' };
const result = { status: 'committed', revision: 8, amount: 6 };
const capture = overrides => ({
  caseId: 'core:runHighwallMining', expected: { sessionId: 'session-1', uidHash: 'actor-hash', roleId: 'icebreaker-miner',
    cycle: 2, sourceRevision: 7, groupId: 'group-1', resourceCost: null },
  offered: true, mountedUi: true, actorBefore: actor, actorAfter: actor,
  sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 7, groupId: 'group-1' },
  sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 8, groupId: 'group-1' },
  request, response: { httpStatus: 200, result, exactReplay: true }, replay: { status: 'committed', result: { ...result, status: 'replayed' } },
  rendered: { visible: true, resultStatus: 'committed' }, trainingChoice: null, cost: null,
  consent: null, ...overrides,
});

test('finite family registry has one source-bound case for each remaining endpoint', () => {
  assert.deepEqual(CORE_CRAFT_PROCEDURES.map(row => row.endpoint).sort(), [...EXPECTED_CORE].sort());
  assert.deepEqual(GM_RULING_COUNTER_PROCEDURES.map(row => row.endpoint).sort(), [...EXPECTED_GM].sort());
  for (const row of [...CORE_CRAFT_PROCEDURES, ...GM_RULING_COUNTER_PROCEDURES]) {
    assert.ok(row.id && row.actorRoleId && row.checkpoint && row.requirement && row.unavailableReason);
    assert.ok(['exact-request-id', 'single-shot', 'not-mounted'].includes(row.replayPolicy));
  }
});

test('only a same-session mounted UI receipt with the original actor and exact replay earns completion', () => {
  assert.equal(evaluateProcedureCapture(capture()).status, 'completed');
  for (const changes of [
    { mountedUi: false },
    { actorAfter: { ...actor, uidHash: 'foreign-uid' } },
    { actorAfter: { ...actor, sessionId: 'other-session' } },
    { actorAfter: { ...actor, activeConsoleRoleId: 'different-role' } },
    { request: { ...request, sessionId: 'other-session' } },
    { response: { httpStatus: 200, result: { ...result, status: 'stale' } } },
    { replay: { status: 'committed', result: { status: 'committed', revision: 9 } } },
    { rendered: { visible: false, resultStatus: 'committed' } },
  ]) assert.equal(evaluateProcedureCapture(capture(changes)).status, 'pending');
});

test('current cycle, revision, and fleet group must remain the source-owned values', () => {
  for (const changes of [
    { sourceBefore: { live: false, sessionId: 'session-1', cycle: 2, revision: 7, groupId: 'group-1' } },
    { sourceBefore: { live: true, sessionId: 'session-1', cycle: 3, revision: 7, groupId: 'group-1' } },
    { sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 6, groupId: 'group-1' } },
    { sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 7, groupId: 'other-group' } },
    { sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 8, groupId: 'other-group' } },
    { request: { ...request, expectedRevision: 6 } },
  ]) assert.equal(evaluateProcedureCapture(capture(changes)).status, 'pending');
});

test('unoffered operations remain pending without a click', async () => {
  let clicks = 0;
  const unoffered = await captureMountedProcedureAction({
    context: { initial: { sessionId: 'session-1' }, gm: {}, crew: {} },
    game: { select: async () => ({ observe: async () => actor }),
      state: async () => ({ live: true, sessionId: 'session-1', phase: 'active', cycle: 2 }) },
    caseId: 'core:runHighwallMining',
    prepare: async () => ({ offered: false }),
    inspect: async () => { throw new Error('not called'); },
  });
  assert.equal(unoffered.status, 'pending');
  assert.equal(clicks, 0);
});

test('damage draw is classified as mounted only through the actual GM Assign damage control', () => {
  const damage = GM_RULING_COUNTER_PROCEDURES.find(row => row.endpoint === 'addShipDamage');
  assert.equal(damage.mountedPath, 'MaintenanceSystems GM Assign damage');
  assert.equal(damage.actorRoleId, 'gm');
  assert.equal(damage.randomOutcome, true);
  assert.equal(damage.replayPolicy, 'exact-request-id');
});

test('printed costs, real distinct consent, and replay-safe receipts are mandatory', () => {
  const repair = capture({ caseId: 'core:repairConsolesFromBlacksmith',
    expected: { sessionId: 'session-1', uidHash: 'actor-hash', roleId: 'icebreaker-engineer', cycle: 2, sourceRevision: 7,
      groupId: 'group-1', cost: { resource: 'materials', amount: 4, direction: 'debit' } },
    actorBefore: { ...actor, profileRoleId: 'icebreaker-engineer', activeConsoleRoleId: 'icebreaker-engineer' },
    actorAfter: { ...actor, profileRoleId: 'icebreaker-engineer', activeConsoleRoleId: 'icebreaker-engineer' },
    request: { ...request, expectedRevision: 7, systemIds: ['jump-drive'] },
    cost: { resource: 'materials', amount: 4, direction: 'debit', before: 8, after: 4 },
  });
  assert.equal(evaluateProcedureCapture(repair).status, 'completed');
  assert.equal(evaluateProcedureCapture({ ...repair, cost: { ...repair.cost, after: 5 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...repair, cost: { ...repair.cost, amount: 3 } }).status, 'pending');

  const consent = capture({ caseId: 'core:transferShuttleControlCommand',
    expected: { sessionId: 'session-1', uidHash: 'holder-hash', roleId: 'icebreaker-miner', cycle: 2,
      sourceRevision: 7, groupId: 'group-1', distinctConsent: true },
    actorBefore: { ...actor, uidHash: 'holder-hash' }, actorAfter: { ...actor, uidHash: 'holder-hash' }, consent: {
    required: true, requestId: 'proposal-1', proposalId: 'proposal-1', status: 'committed', sameSession: true,
    sessionId: 'session-1', actorUidHash: 'holder-hash', counterpartyUidHash: 'holder-hash', groupId: 'group-1',
  } });
  assert.equal(evaluateProcedureCapture(consent).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...consent, consent: { ...consent.consent,
    counterpartyUidHash: 'distinct-holder-hash' } }).status, 'completed');
});

test('evidence projection never persists raw requests, notes, UIDs, or random damage cards', () => {
  const raw = capture({ request: { ...request, instanceId: 'private-instance', note: 'private note',
    actorUid: 'raw-uid', card: 'hidden-card' }, response: { httpStatus: 200, exactReplay: true,
    result: { ...result, card: 'hidden-card', note: 'private note' } }, replay: { status: 'committed',
    result: { ...result, status: 'replayed', card: 'hidden-card', note: 'private note' } },
    trainingChoice: 'GM training: a deliberate example ruling' });
  const evaluated = evaluateProcedureCapture(raw);
  assert.equal(evaluated.status, 'completed');
  assert.doesNotMatch(JSON.stringify(evaluated), /private-instance|private note|raw-uid|hidden-card/);
  assert.equal(evaluated.trainingChoice, undefined, 'A player-side random action cannot claim a GM training choice.');
  assert.equal(evaluated.randomOutcomeRecorded, false);

  const gmActor = { uidHash: 'gm-hash', sessionId: 'session-1', playerRole: 'gm', instanceId: 'gm-instance',
    gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' };
  const gmDamage = evaluateProcedureCapture(capture({ caseId: 'gm:addShipDamage',
    expected: { sessionId: 'session-1', uidHash: 'gm-hash', instanceId: 'gm-instance', roleId: 'gm',
      cycle: 2, sourceRevision: 7 }, actorBefore: gmActor, actorAfter: gmActor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 7 },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 8 },
    request: { sessionId: 'session-1', instanceId: 'gm-instance', requestId: 'damage-1',
      expectedCycle: 2, expectedRevision: 7, shipId: 'shepherd' },
    trainingChoice: 'GM training: assign damage through the normal control.',
  }));
  assert.equal(gmDamage.status, 'completed');
  assert.equal(gmDamage.trainingChoice, 'GM training: assign damage through the normal control.');
  assert.equal(gmDamage.randomOutcomeRecorded, false);
});
