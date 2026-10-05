import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_CRAFT_PROCEDURES, GM_RULING_COUNTER_PROCEDURES } from './pc10-pending-procedure-ui-proof.mjs';
import { evaluateProcedureCapture } from './pc10-pending-procedure-ui-proof.mjs';
import { chooseOfferedAffordableOption, createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';

// Reason: the finite recipe map must cover only the already-approved rows and
// choose actions from source-rendered, enabled options within their displayed
// live budget. Missing or malformed choices remain pending; no gameplay input
// is invented to make a recipe appear available.

test('default source-mounted recipes cover the existing finite procedure rows exactly', () => {
  const steps = createPendingProcedureDefaultSteps();
  const expected = [...CORE_CRAFT_PROCEDURES, ...GM_RULING_COUNTER_PROCEDURES]
    .map(row => row.id).sort();
  assert.deepEqual(Object.keys(steps).sort(), expected);
  for (const [caseId, recipe] of Object.entries(steps)) {
    assert.equal(typeof recipe, 'function', `${caseId} has a leaf recipe`);
  }
});

test('affordable option selection uses only current enabled source choices and the lowest real cost', () => {
  const option = chooseOfferedAffordableOption([
    { value: 'food', cost: 6, enabled: true, offered: true },
    { value: 'materials', cost: 3, enabled: true, offered: true },
    { value: 'fuel', cost: 1, enabled: false, offered: true },
    { value: 'hidden', cost: 0, enabled: true, offered: false },
    { value: 'unknown', cost: Number.NaN, enabled: true, offered: true },
  ], 4);
  assert.deepEqual(option, { value: 'materials', cost: 3, enabled: true, offered: true });
  assert.equal(chooseOfferedAffordableOption([
    { value: 'food', cost: 6, enabled: true, offered: true },
  ], 5), null, 'An unaffordable choice stays unavailable.');
  assert.equal(chooseOfferedAffordableOption([
    { value: 'fuel', cost: 1, enabled: false, offered: true },
  ], 20), null, 'A disabled choice is never selected.');
});

test('Boa recycling checkpoint matches the mounted Coordination-only procedure', () => {
  const recycle = CORE_CRAFT_PROCEDURES.find(row => row.endpoint === 'recycleWithBoa');
  assert.equal(recycle?.checkpoint, 'coordination');
});

test('Highwall mining checkpoint matches the mounted Coordination-only procedure', () => {
  const mining = CORE_CRAFT_PROCEDURES.find(row => row.endpoint === 'runHighwallMining');
  assert.equal(mining?.checkpoint, 'coordination');
});

test('Boa recycling receipt binds its recycling ledger revision and printed cost', () => {
  const actor = { uidHash: 'recycler-hash', sessionId: 'session-1', profileRoleId: 'capybara-recycler',
    activeConsoleRoleId: 'capybara-recycler', sameActor: true, connection: 'live', freshness: 'server' };
  const result = { status: 'committed', sessionId: 'session-1', requestId: 'recycle-1', shuttleId: 'boa',
    hostShipId: 'capybara', recipeId: 'materials', resourceId: 'materials', resourceCost: 3,
    hostResourceRemaining: 3, scrapRemaining: 1, cycle: 2, recyclingRevision: 5, exchangesThisCycle: 1 };
  const input = { caseId: 'core:recycleWithBoa', expected: { sessionId: 'session-1', uidHash: 'recycler-hash',
    roleId: 'capybara-recycler', cycle: 2, sourceRevision: 4,
    cost: { resource: 'materials', amount: 3, direction: 'debit' } }, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 4 },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 5 },
    request: { sessionId: 'session-1', requestId: 'recycle-1', recipeId: 'materials', expectedCycle: 2,
      expectedRecyclingRevision: 4 }, response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'committed' },
    cost: { resource: 'materials', amount: 3, direction: 'debit', before: 6, after: 3 } };
  const accepted = evaluateProcedureCapture(input);
  assert.equal(accepted.status, 'completed');
  assert.equal(accepted.revision, 5);
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, expectedRecyclingRevision: 3 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    cost: { ...input.cost, after: 2 } }).status, 'pending');
});

test('Shuttle evacuation binds its public ledger revision and current custody revision', () => {
  const actor = { uidHash: 'holder-hash', sessionId: 'session-1', profileRoleId: 'quellon-explorer',
    activeConsoleRoleId: 'quellon-explorer', sameActor: true, connection: 'live', freshness: 'server' };
  const input = { caseId: 'core:evacuateShuttleSurvivorsCommand', expected: { sessionId: 'session-1',
    uidHash: 'holder-hash', roleId: 'quellon-explorer', cycle: 2, sourceRevision: 4, controlRevision: 10,
    shuttleId: 'starlight', groupId: 'fleet-1', sourceShipId: 'quellon', destinationShipId: 'icebreaker', amount: 100 }, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 4, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 5, groupId: 'fleet-1' },
    transitionBefore: { kind: 'shuttle-evacuation', sessionId: 'session-1', cycle: 2, shuttleId: 'starlight',
      holderUidHash: 'holder-hash', groupId: 'fleet-1', controlRevision: 10, sourceShipId: 'quellon',
      destinationShipId: 'icebreaker', amount: 100, sourcePopulation: 1000, destinationPopulation: 500,
      ledgerCycle: 1, movedThisCycle: 0, evacuationRevision: 4 },
    transitionAfter: { kind: 'shuttle-evacuation', sessionId: 'session-1', cycle: 2, shuttleId: 'starlight',
      holderUidHash: 'holder-hash', groupId: 'fleet-1', controlRevision: 10, sourceShipId: 'quellon',
      destinationShipId: 'icebreaker', amount: 100, sourcePopulation: 900, destinationPopulation: 600,
      ledgerCycle: 2, movedThisCycle: 100, evacuationRevision: 5 },
    request: { sessionId: 'session-1', requestId: 'evac-1', expectedCycle: 2, shuttleId: 'starlight',
      destinationShipId: 'icebreaker', amount: 100, expectedEvacuationRevision: 4, expectedControlRevision: 10 },
    response: { httpStatus: 200, result: { status: 'committed', requestId: 'evac-1', sessionId: 'session-1',
      shuttleId: 'starlight', sourceShipId: 'quellon', destinationShipId: 'icebreaker', amount: 100,
      sourcePopulation: 900, destinationPopulation: 600, cycle: 2, movedThisCycle: 100,
      evacuationRevision: 5 }, exactReplay: true },
    replay: { result: { status: 'replayed', requestId: 'evac-1', sessionId: 'session-1', shuttleId: 'starlight',
      sourceShipId: 'quellon', destinationShipId: 'icebreaker', amount: 100, sourcePopulation: 900,
      destinationPopulation: 600, cycle: 2, movedThisCycle: 100, evacuationRevision: 5 } },
    rendered: { visible: true, resultStatus: 'committed' } };
  const departureResult = evaluateProcedureCapture(input);
  assert.equal(departureResult.status, 'completed', departureResult.reason);
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, expectedEvacuationRevision: 3 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, expectedControlRevision: 9 } }).status, 'pending');
});

test('evacuation receipt binds the selected shuttle, population pair, quantity, and actual ledger delta', () => {
  const actor = { uidHash: 'holder-hash', sessionId: 'session-1', profileRoleId: 'quellon-explorer',
    activeConsoleRoleId: 'quellon-explorer', sameActor: true, connection: 'live', freshness: 'server' };
  const result = { status: 'committed', sessionId: 'session-1', requestId: 'evac-2', shuttleId: 'starlight',
    sourceShipId: 'quellon', destinationShipId: 'icebreaker', amount: 100, sourcePopulation: 900,
    destinationPopulation: 600, cycle: 2, movedThisCycle: 100, evacuationRevision: 5 };
  const input = { caseId: 'core:evacuateShuttleSurvivorsCommand', expected: { sessionId: 'session-1',
    uidHash: 'holder-hash', roleId: 'quellon-explorer', cycle: 2, sourceRevision: 4, controlRevision: 10,
    shuttleId: 'starlight', groupId: 'fleet-1', sourceShipId: 'quellon', destinationShipId: 'icebreaker', amount: 100 },
    offered: true, mountedUi: true, actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 4, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 5, groupId: 'fleet-1' },
    transitionBefore: { kind: 'shuttle-evacuation', sessionId: 'session-1', cycle: 2, shuttleId: 'starlight',
      holderUidHash: 'holder-hash', groupId: 'fleet-1', controlRevision: 10, sourceShipId: 'quellon',
      destinationShipId: 'icebreaker', amount: 100, sourcePopulation: 1000, destinationPopulation: 500,
      ledgerCycle: 1, movedThisCycle: 0, evacuationRevision: 4 },
    transitionAfter: { kind: 'shuttle-evacuation', sessionId: 'session-1', cycle: 2, shuttleId: 'starlight',
      holderUidHash: 'holder-hash', groupId: 'fleet-1', controlRevision: 10, sourceShipId: 'quellon',
      destinationShipId: 'icebreaker', amount: 100, sourcePopulation: 900, destinationPopulation: 600,
      ledgerCycle: 2, movedThisCycle: 100, evacuationRevision: 5 },
    request: { sessionId: 'session-1', requestId: 'evac-2', shuttleId: 'starlight', destinationShipId: 'icebreaker',
      amount: 100, expectedCycle: 2, expectedEvacuationRevision: 4, expectedControlRevision: 10 },
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'committed' } };
  const accepted = evaluateProcedureCapture(input);
  assert.equal(accepted.status, 'completed', accepted.reason);
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, amount: 200 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionBefore: { ...input.transitionBefore, groupId: 'other-fleet' } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, unexpectedPrivateField: 'not allowed' } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, sourcePopulation: 800 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    response: { ...input.response, result: { ...result, destinationShipId: 'dione' } } }).status, 'pending');
});

test('Service shuttle recharge binds its own ledger plus custody and maintenance revisions', () => {
  const actor = { uidHash: 'engineer-hash', sessionId: 'session-1', profileRoleId: 'icebreaker-engineer',
    activeConsoleRoleId: 'icebreaker-engineer', sameActor: true, connection: 'live', freshness: 'server' };
  const result = { status: 'committed', sessionId: 'session-1', requestId: 'recharge-1', shuttleId: 'blacksmith',
    hostShipId: 'icebreaker', consoleId: 'hydroponics', cycle: 2, maintenanceRevision: 9,
    rechargeRevision: 3, immediate: true, message: 'Host console recharged.' };
  const input = { caseId: 'core:rechargeHostConsoleFromShuttle', expected: { sessionId: 'session-1',
    uidHash: 'engineer-hash', roleId: 'icebreaker-engineer', cycle: 2, sourceRevision: 2,
    controlRevision: 7, maintenanceRevision: 8, expectedHostShipId: 'icebreaker', shuttleId: 'blacksmith' },
    offered: true, mountedUi: true, actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 2 },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 3 },
    request: { sessionId: 'session-1', requestId: 'recharge-1', expectedCycle: 2,
      shuttleId: 'blacksmith', expectedControlRevision: 7, expectedMaintenanceRevision: 8,
      expectedHostShipId: 'icebreaker' },
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'committed' } };
  const transitResult = evaluateProcedureCapture(input);
  assert.equal(transitResult.status, 'completed', transitResult.reason);
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, expectedControlRevision: 6 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, expectedMaintenanceRevision: 7 } }).status, 'pending');
});

test('Boa mission choice receipt binds its choice revision to the current rendered workspace', () => {
  const actor = { uidHash: 'recycler-hash', sessionId: 'session-1', profileRoleId: 'capybara-recycler',
    activeConsoleRoleId: 'capybara-recycler', sameActor: true, connection: 'live', freshness: 'server' };
  const input = { caseId: 'core:chooseBoaMissionReclamationOpportunity',
    expected: { sessionId: 'session-1', uidHash: 'recycler-hash', roleId: 'capybara-recycler', cycle: 2,
      sourceRevision: 7, groupId: 'fleet-1' }, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 7, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 8, groupId: 'fleet-1' },
    request: { sessionId: 'session-1', requestId: 'choice-1', expectedCycle: 2, expectedControlRevision: 4,
      expectedChoiceRevision: 7, missionOpportunityId: 'mission-1', taskOpportunityId: 'A-1' },
    response: { httpStatus: 200, result: { status: 'committed', choiceRevision: 8 }, exactReplay: true },
    replay: { result: { status: 'replayed', choiceRevision: 8 } },
    rendered: { visible: true, resultStatus: 'committed' }, cost: null, consent: null };
  const result = evaluateProcedureCapture(input);
  assert.equal(result.status, 'completed');
  assert.equal(result.revision, 8);
  const staleChoice = evaluateProcedureCapture({ ...input,
    request: { ...input.request, expectedChoiceRevision: 6 } });
  assert.equal(staleChoice.status, 'pending', 'A receipt cannot certify a choice made from another source revision.');
});

// Reason: these callable contracts have authoritative typed before/after state
// and exact receipts but do not expose a new monotonic action revision. The
// recipe must validate their exact request/receipt/state tuple rather than
// treating the unchanged shuttle-control revision as an artificial blocker.
test('departure request can complete from its exact typed server movement receipt', () => {
  const actor = { uidHash: '1bbda739c2a9bf0a', sessionId: 'session-1', profileRoleId: 'quellon-explorer',
    activeConsoleRoleId: 'quellon-explorer', sameActor: true, connection: 'live', freshness: 'server' };
  const result = { status: 'requested', sessionId: 'session-1', requestId: 'depart-1', shuttleId: 'starlight',
    holderUid: 'private-holder-uid', fleetGroupId: 'fleet-1', originShipId: 'quellon', destinationShipId: 'icebreaker',
    cycle: 2, controlRevision: 4, requestedAt: '2026-10-05T12:00:00.000Z' };
  const input = { caseId: 'core:requestShuttleDeparture', expected: { sessionId: 'session-1', uidHash: '1bbda739c2a9bf0a',
    roleId: 'quellon-explorer', cycle: 2, sourceRevision: 4, controlRevision: 4, groupId: 'fleet-1',
    shuttleId: 'starlight', destinationShipId: 'icebreaker' }, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 4, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 4, groupId: 'fleet-1' },
    transitionBefore: { kind: 'shuttle-movement', exists: false, sessionId: 'session-1', shuttleId: 'starlight',
      holderUidHash: '1bbda739c2a9bf0a', groupId: 'fleet-1', controlRevision: 4, cycle: 2 },
    transitionAfter: { kind: 'shuttle-movement', exists: true, status: 'requested', sessionId: 'session-1',
      requestId: 'depart-1', shuttleId: 'starlight', holderUidHash: '1bbda739c2a9bf0a', groupId: 'fleet-1',
      destinationShipId: 'icebreaker', controlRevision: 4, cycle: 2 },
    request: { sessionId: 'session-1', requestId: 'depart-1', shuttleId: 'starlight', destinationShipId: 'icebreaker',
      expectedControlRevision: 4, expectedCycle: 2 },
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'requested' } };
  const departureResult = evaluateProcedureCapture(input);
  assert.equal(departureResult.status, 'completed', departureResult.reason);
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, holderUidHash: 'foreign-holder' } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, destinationShipId: 'dione' } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, unreviewed: true } }).status, 'pending');
});

test('cargo transfer can complete only from the exact two-sided source ledger delta', () => {
  const actor = { uidHash: 'holder-hash', sessionId: 'session-1', profileRoleId: 'quellon-explorer',
    activeConsoleRoleId: 'quellon-explorer', sameActor: true, connection: 'live', freshness: 'server' };
  const result = { status: 'committed', sessionId: 'session-1', requestId: 'cargo-1', shuttleId: 'starlight',
    hostShipId: 'quellon', resourceId: 'food', direction: 'load', amount: 1, shipAmount: 4, shuttleAmount: 3 };
  const input = { caseId: 'core:transferShuttleCargoCommand', expected: { sessionId: 'session-1', uidHash: 'holder-hash',
    roleId: 'quellon-explorer', cycle: 2, sourceRevision: 4, controlRevision: 4, groupId: 'fleet-1',
    shuttleId: 'starlight', hostShipId: 'quellon', resourceId: 'food', direction: 'load', amount: 1 },
    offered: true, mountedUi: true, actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 4, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 4, groupId: 'fleet-1' },
    transitionBefore: { kind: 'shuttle-cargo', sessionId: 'session-1', cycle: 2, shuttleId: 'starlight',
      holderUidHash: 'holder-hash', groupId: 'fleet-1', controlRevision: 4, hostShipId: 'quellon',
      resourceId: 'food', direction: 'load', amount: 1, shipAmount: 5, shuttleAmount: 2 },
    transitionAfter: { kind: 'shuttle-cargo', sessionId: 'session-1', cycle: 2, shuttleId: 'starlight',
      holderUidHash: 'holder-hash', groupId: 'fleet-1', controlRevision: 4, hostShipId: 'quellon',
      resourceId: 'food', direction: 'load', amount: 1, shipAmount: 4, shuttleAmount: 3 },
    request: { sessionId: 'session-1', requestId: 'cargo-1', shuttleId: 'starlight', resourceId: 'food',
      direction: 'load', amount: 1, expectedControlRevision: 4 },
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'committed' } };
  const cargoResult = evaluateProcedureCapture(input);
  assert.equal(cargoResult.status, 'completed', cargoResult.reason);
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, shuttleAmount: 4 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, amount: 2 } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    response: { ...input.response, result: { ...result, privateUid: 'must-not-be-accepted' } } }).status, 'pending');
});

test('begin transit binds the prior departure and current public transit projection', () => {
  const actor = { uidHash: '1bbda739c2a9bf0a', sessionId: 'session-1', profileRoleId: 'quellon-explorer',
    activeConsoleRoleId: 'quellon-explorer', sameActor: true, connection: 'live', freshness: 'server' };
  const result = { status: 'in-transit', sessionId: 'session-1', requestId: 'depart-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: 'private-holder-uid', fleetGroupId: 'fleet-1', destinationShipId: 'icebreaker',
    cycle: 2, controlRevision: 4, revision: 1, requestedAt: '2026-10-05T12:00:00.000Z',
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 }, velocity: { x: 1, y: 1, z: 1 },
    departedAt: '2026-10-05T12:00:01.000Z', arrivesAt: '2026-10-05T12:01:01.000Z' };
  const input = { caseId: 'core:beginShuttleTransit', expected: { sessionId: 'session-1', uidHash: '1bbda739c2a9bf0a',
    roleId: 'quellon-explorer', cycle: 2, sourceRevision: 4, controlRevision: 4, groupId: 'fleet-1',
    shuttleId: 'starlight' }, offered: true, mountedUi: true, actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 4, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 1, groupId: 'fleet-1' },
    transitionBefore: { kind: 'shuttle-movement', exists: true, status: 'requested', sessionId: 'session-1',
      requestId: 'depart-1', shuttleId: 'starlight', holderUidHash: '1bbda739c2a9bf0a', groupId: 'fleet-1',
      destinationShipId: 'icebreaker', controlRevision: 4, cycle: 2 },
    transitionAfter: { kind: 'shuttle-movement', exists: true, status: 'in-transit', sessionId: 'session-1',
      requestId: 'depart-1', transitRequestId: 'transit-1', shuttleId: 'starlight', holderUidHash: '1bbda739c2a9bf0a',
      groupId: 'fleet-1', destinationShipId: 'icebreaker', controlRevision: 4, cycle: 2, revision: 1 },
    request: { sessionId: 'session-1', requestId: 'transit-1', shuttleId: 'starlight',
      expectedDepartureRequestId: 'depart-1', expectedControlRevision: 4, expectedCycle: 2 },
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'in-transit' } };
  assert.equal(evaluateProcedureCapture(input).status, 'completed');
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, expectedDepartureRequestId: 'foreign-departure' } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, revision: 2 } }).status, 'pending');
});

test('retarget requires the exact current transit, legal offered destination, and next transit revision', () => {
  const actor = { uidHash: '1bbda739c2a9bf0a', sessionId: 'session-1', profileRoleId: 'quellon-explorer',
    activeConsoleRoleId: 'quellon-explorer', sameActor: true, connection: 'live', freshness: 'server' };
  const result = { status: 'in-transit', sessionId: 'session-1', requestId: 'depart-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: 'private-holder-uid', fleetGroupId: 'fleet-1', destinationShipId: 'dione',
    cycle: 2, controlRevision: 4, revision: 3, requestedAt: '2026-10-05T12:00:00.000Z',
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 2, y: 2, z: 2 }, velocity: { x: 1, y: 1, z: 1 },
    departedAt: '2026-10-05T12:00:02.000Z', arrivesAt: '2026-10-05T12:01:02.000Z' };
  const input = { caseId: 'core:retargetShuttleTransit', expected: { sessionId: 'session-1', uidHash: '1bbda739c2a9bf0a',
    roleId: 'quellon-explorer', cycle: 2, sourceRevision: 2, controlRevision: 4, groupId: 'fleet-1',
    shuttleId: 'starlight', transitRequestId: 'transit-1', destinationShipId: 'dione' }, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 2, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 3, groupId: 'fleet-1' },
    transitionBefore: { kind: 'shuttle-movement', exists: true, status: 'in-transit', sessionId: 'session-1',
      requestId: 'depart-1', transitRequestId: 'transit-1', shuttleId: 'starlight', holderUidHash: '1bbda739c2a9bf0a',
      groupId: 'fleet-1', destinationShipId: 'icebreaker', controlRevision: 4, cycle: 2, revision: 2 },
    transitionAfter: { kind: 'shuttle-movement', exists: true, status: 'in-transit', sessionId: 'session-1',
      requestId: 'depart-1', transitRequestId: 'transit-1', shuttleId: 'starlight', holderUidHash: '1bbda739c2a9bf0a',
      groupId: 'fleet-1', destinationShipId: 'dione', controlRevision: 4, cycle: 2, revision: 3 },
    request: { sessionId: 'session-1', requestId: 'retarget-1', shuttleId: 'starlight', transitRequestId: 'transit-1',
      destinationShipId: 'dione', expectedControlRevision: 4, expectedCycle: 2 },
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'in-transit' } };
  const accepted = evaluateProcedureCapture(input);
  assert.equal(accepted.status, 'completed', accepted.reason);
  assert.equal(evaluateProcedureCapture({ ...input,
    request: { ...input.request, transitRequestId: 'foreign-transit' } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...input,
    transitionAfter: { ...input.transitionAfter, revision: 4 } }).status, 'pending');
});
