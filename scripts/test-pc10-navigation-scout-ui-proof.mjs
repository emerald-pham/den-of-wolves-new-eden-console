import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
  assertNavigationScoutActor, assertNavigationScoutConsequenceActor, assertNavigationScoutCensus, waitForNavigationScoutPaint,
  assertNavigationScoutRequest, assertNavigationScoutReplay, assertNavigationScoutCost,
  validateScoutBundle, safeNavigationScoutEvidence, summarizeNavigationScoutBranches,
  captureNavigationScoutUiReceipt,
} from './pc10-navigation-scout-proof-contracts.mjs';
import { createNavigationScoutProof } from './pc10-navigation-scout-ui-proof.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const actor = () => ({ sessionId: 'session-one', uid: 'actual-owner', uidHash: 'a'.repeat(16),
  hasAuth: true, sameActor: true, playerRole: 'player', profileRoleId: 'wing-commander',
  assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', seatId: 'wing-commander',
  replacementRoleId: null, replacementStatus: null, groupId: 'fleet-1', generation: 3,
  phase: 'active', cycle: 2, airspace: 'lifted', turnStatePhase: 'coordination',
  connection: 'live', freshness: 'server', instanceId: null, instanceClaimedAt: null,
  gmInstanceOwned: false, navigationRevision: 7, fleetPartitionRevision: 4,
  vesselRevisions: { aegis: 8 }, controlRevisions: { starlight: 6 },
  knownCoordinates: ['1100', '1200'], localShipIds: ['aegis', 'dione'],
  shipId: 'aegis', shipGroups: { aegis: 'fleet-1', dione: 'fleet-1', quellon: 'fleet-2' },
});
const gmActor = () => ({ ...actor(), playerRole: 'gm', profileRoleId: 'gm', assignedRoleId: null,
  activeConsoleRoleId: null, seatId: null, uid: 'original-gm', uidHash: 'b'.repeat(16),
  instanceId: 'original-instance', instanceClaimedAt: '2026-10-05T00:00:00.000Z', gmInstanceOwned: true,
});
const share = () => ({ sessionId: 'session-one', requestId: 'original-share', expectedGroupId: 'fleet-1',
  expectedNavigationRevision: 7, coordinate: '1100', recipientShipIds: ['dione'] });
const jump = () => ({ sessionId: 'session-one', requestId: 'original-jump', shipId: 'aegis',
  expectedRevision: 8, destination: '1100' });
const scoutReply = () => ({ status: 'requested', resolution: 'pending', sessionId: 'session-one',
  requestId: 'original-scout', cycle: 2, entitlementId: 'starlight', source: 'craft',
  ownerRoleId: 'wing-commander', anchorShipId: 'aegis', receivingShipId: 'aegis', targetCoordinate: '1100' });
const scoutBundle = () => {
  const fact = { coordinate: '1100', code: 'A', title: 'Private current fact' };
  return { report: { requestId: 'original-scout', cycle: 2, entitlementId: 'starlight', targetCoordinate: '1100',
    status: 'resolved', noteId: '1'.repeat(64) },
  result: { type: 'private-scout-result', sessionId: 'session-one', requestId: 'original-scout',
    requesterUid: 'actual-owner', sourceId: 'starlight', cycle: 2, targetCoordinate: '1100', systemFact: fact },
  note: { type: 'player-discovery-note', id: '1'.repeat(64), cycle: 2, targetCoordinate: '1100',
    systemFact: { ...fact }, recordedAt: '2026-10-05T00:01:00.000Z' } };
};

test('the original current audience is required, including generation, console and GM instance', () => {
  assertNavigationScoutActor(actor(), actor());
  assertNavigationScoutActor(gmActor(), gmActor());
  for (const [key, value] of Object.entries({ uidHash: 'c'.repeat(16), sessionId: 'foreign',
    profileRoleId: 'admiral', assignedRoleId: 'admiral', activeConsoleRoleId: null, groupId: 'fleet-2',
    generation: 4, cycle: 3, airspace: 'restricted', turnStatePhase: 'team', phase: 'debrief',
    hasAuth: false, sameActor: false, connection: 'offline', freshness: 'cache' })) {
    assert.throws(() => assertNavigationScoutActor({ ...actor(), [key]: value }, actor()),
      /Original|live|server|authority/, key);
  }
  for (const patch of [{ instanceId: 'replacement-instance' }, { instanceClaimedAt: 'later' },
    { gmInstanceOwned: false }, { playerRole: 'player' }]) {
    assert.throws(() => assertNavigationScoutActor({ ...gmActor(), ...patch }, gmActor()), /Original|authority/);
  }
});

test('fresh source census uses all confirmed roles and independent normally admitted accounts', () => {
  const context = { initial: { sessionId: 'session-one' }, started: { sessionId: 'session-one', phase: 'active',
    fullGameDemo: { status: 'active', progression: 'manual' }, confirmedRoleIds: ['admiral', 'wing-commander'],
    pressIncluded: true }, roster: [
    { roleId: 'admiral', uidHash: 'a'.repeat(16) }, { roleId: 'wing-commander', uidHash: 'b'.repeat(16) },
    { roleId: 'press-officer', uidHash: 'c'.repeat(16) }] };
  assertNavigationScoutCensus(context);
  assert.throws(() => assertNavigationScoutCensus({ ...context, roster: context.roster.slice(0, 2) }), /census|roster|Press/);
  assert.throws(() => assertNavigationScoutCensus({ ...context, roster: context.roster.map(x => ({ ...x, uidHash: 'a'.repeat(16) })) }), /independent/);
  assert.throws(() => assertNavigationScoutCensus({ ...context, started: { ...context.started, fullGameDemo: null } }), /manual/);
});

test('a navigation consequence may rebind only the original ship to its observed authoritative new group', () => {
  const current = { ...actor(), groupId: 'fleet-3', vesselRevisions: { aegis: 9 } };
  const consequence = { endpoint: 'jumpShip', result: { status: 'jumped', shipId: 'aegis', revision: 9 },
    shipGroups: { aegis: 'fleet-3' } };
  assertNavigationScoutConsequenceActor(current, actor(), consequence);
  for (const patch of [{ groupId: 'fleet-4' }, { uidHash: 'c'.repeat(16) }, { cycle: 3 }, { generation: 4 }]) {
    assert.throws(() => assertNavigationScoutConsequenceActor({ ...current, ...patch }, actor(), consequence), /Original|source|group/);
  }
  assert.throws(() => assertNavigationScoutConsequenceActor(current, actor(),
    { ...consequence, endpoint: 'readPrivateScoutResult' }), /source|group/);
  assert.throws(() => assertNavigationScoutConsequenceActor(current, actor(),
    { ...consequence, result: { ...consequence.result, shipId: 'quellon' } }), /source|group/);
});

test('delayed source paint waits without reloading, mutation or an increased budget', async () => {
  let time = 0, inspections = 0;
  const result = await waitForNavigationScoutPaint({ original: actor(), timeoutMs: 600,
    inspect: async () => actor(), now: () => time, wait: async () => { time += 100; },
    inspectPaint: async () => (++inspections < 3 ? { mounted: false } :
      { mounted: true, current: true, eligible: true }) });
  assert.equal(result.state, 'offered'); assert.equal(inspections, 3);
  assert.equal(time, 200);
});

test('an actual current explicit blocker is uncredited; missing or wrong-source paint stays pending', async () => {
  const blocked = await waitForNavigationScoutPaint({ original: actor(), inspect: async () => actor(),
    inspectPaint: async () => ({ mounted: true, current: true, eligible: false, blocker: 'source-cost-blocked' }) });
  assert.deepEqual(blocked, { state: 'blocked', reason: 'source-cost-blocked' });
  let time = 0;
  await assert.rejects(waitForNavigationScoutPaint({ original: actor(), timeoutMs: 300,
    now: () => time, wait: async () => { time += 100; }, inspect: async () => actor(),
    inspectPaint: async () => ({ mounted: true, current: false, eligible: true }) }), /paint.*deadline|deadline.*paint/);
  await assert.rejects(waitForNavigationScoutPaint({ original: actor(), inspect: async () => ({ ...actor(), groupId: 'fleet-2' }),
    inspectPaint: async () => ({ mounted: true, current: true, eligible: true }) }), /Original/);
  await assert.rejects(waitForNavigationScoutPaint({ original: actor(), timeoutMs: 60_001,
    inspect: async () => actor(), inspectPaint: async () => ({}) }), /60|budget/);
});

test('a known share and ordinary jump must use current actual knowledge, recipients and revision', () => {
  assertNavigationScoutRequest('shareKnownSystemDetails', share(), actor(), { coordinate: '1100', recipientShipIds: ['dione'] });
  assertNavigationScoutRequest('jumpShip', jump(), actor(), { shipId: 'aegis', coordinate: '1100' });
  for (const patch of [{ expectedGroupId: 'fleet-2' }, { expectedNavigationRevision: 6 },
    { coordinate: '9999' }, { recipientShipIds: ['quellon'] }, { hiddenDeck: ['P'] }]) {
    assert.throws(() => assertNavigationScoutRequest('shareKnownSystemDetails', { ...share(), ...patch }, actor(),
      { coordinate: '1100', recipientShipIds: ['dione'] }), /source|known|group|revision|recipient|Unknown/);
  }
  for (const patch of [{ expectedRevision: 7 }, { destination: '9999' }, { blind: true }, { roll: 6 }]) {
    assert.throws(() => assertNavigationScoutRequest('jumpShip', { ...jump(), ...patch }, actor(),
      { shipId: 'aegis', coordinate: '1100' }), /source|known|revision|Unknown/);
  }
});

test('taxi source binds current custody/cycle/partition and real separated destination and passenger census', () => {
  const request = { sessionId: 'session-one', requestId: 'actual-taxi', expectedGroupId: 'fleet-1',
    expectedNavigationRevision: 7, expectedFleetPartitionRevision: 4, expectedCycle: 2, expectedControlRevision: 6,
    shuttleId: 'starlight', targetShipId: 'quellon', payload: { kind: 'fuel', units: 2 } };
  const intent = { shuttleId: 'starlight', targetShipId: 'quellon', units: 2 };
  assertNavigationScoutRequest('sendScoutTaxiTransfer', request, actor(), intent);
  for (const patch of [{ expectedCycle: 1 }, { expectedControlRevision: 5 }, { expectedFleetPartitionRevision: 3 },
    { targetShipId: 'dione' }, { payload: { kind: 'fuel', units: 3 } }]) {
    assert.throws(() => assertNavigationScoutRequest('sendScoutTaxiTransfer', { ...request, ...patch }, actor(), intent),
      /source|cycle|revision|separated|fuel|intent/);
  }
  const passengers = { ...request, payload: { kind: 'players', playerUids: ['actual-passenger'] } };
  assertNavigationScoutRequest('sendScoutTaxiTransfer', passengers, actor(),
    { shuttleId: 'starlight', targetShipId: 'quellon', passengerUids: ['actual-passenger'] });
  assert.throws(() => assertNavigationScoutRequest('sendScoutTaxiTransfer',
    { ...passengers, payload: { kind: 'players', playerUids: ['invented-passenger'] } }, actor(),
    { shuttleId: 'starlight', targetShipId: 'quellon', passengerUids: ['actual-passenger'] }), /passenger|intent/);
});

test('GM movement and a genuine failure ruling keep source request identity, not player-cost or fabricated failure data', () => {
  const move = { sessionId: 'session-one', instanceId: 'original-instance', requestId: 'actual-move',
    shipId: 'aegis', destination: '1200', expectedRevision: 8 };
  assertNavigationScoutRequest('moveShipToLocation', move, gmActor(), { shipId: 'aegis', coordinate: '1200', printedCoordinates: ['1200'] });
  assert.throws(() => assertNavigationScoutRequest('moveShipToLocation', move, actor(),
    { shipId: 'aegis', coordinate: '1200', printedCoordinates: ['1200'] }), /GM|instance|source/);
  const ruling = { sessionId: 'session-one', instanceId: 'original-instance', requestId: 'actual-ruling',
    expectedRevision: 9, failureRequestId: 'actual-jump', consequence: 'nothing-happens' };
  const intent = { failureRequestId: 'actual-jump', expectedRevision: 9, consequence: 'nothing-happens' };
  assertNavigationScoutRequest('adjudicateFailedJump', ruling, gmActor(), intent);
  assert.throws(() => assertNavigationScoutRequest('adjudicateFailedJump', { ...ruling, shipId: 'aegis' }, gmActor(), intent), /Unknown/);
  assert.throws(() => assertNavigationScoutRequest('adjudicateFailedJump', { ...ruling, failureRequestId: 'invented' }, gmActor(), intent), /source/);
});

test('scout request is the actual holder and printed input; no caller dice, fabricated cycle or private result', () => {
  const request = { sessionId: 'session-one', requestId: 'original-scout', entitlementId: 'starlight', targetCoordinate: '1100' };
  assertNavigationScoutRequest('requestScout', request, actor(), { entitlementId: 'starlight', coordinate: '1100', printedCoordinates: ['1100'] });
  for (const patch of [{ entitlementId: 'endeavour' }, { targetCoordinate: '9999' }, { expectedCycle: 2 }, { code: 'P' }, { draw: 6 }]) {
    assert.throws(() => assertNavigationScoutRequest('requestScout', { ...request, ...patch }, actor(),
      { entitlementId: 'starlight', coordinate: '1100', printedCoordinates: ['1100'] }), /source|holder|printed|Unknown/);
  }
});

test('receipt replay preserves every consequence and server draw, with endpoint-specific source statuses', () => {
  const result = { status: 'drive-failure', shipId: 'aegis', requestId: 'original-jump', failureRoll: 1,
    fuelSpent: 0, damageDraws: [{ card: 'actual-server-card', systemId: 'jump-drive' }] };
  assertNavigationScoutReplay('jumpShip', result, structuredClone(result));
  assert.throws(() => assertNavigationScoutReplay('jumpShip', result, { ...result, failureRoll: 6 }), /consequence|receipt/);
  assertNavigationScoutReplay('requestScout', scoutReply(), { ...scoutReply(), status: 'replayed' });
  assert.throws(() => assertNavigationScoutReplay('requestScout', scoutReply(), { ...scoutReply(), cycle: 3, status: 'replayed' }), /consequence|receipt/);
  assert.throws(() => assertNavigationScoutReplay('triggerDradisContact', { triggeredAt: 'now' }, { triggeredAt: 'now' }), /unsupported|idempotent/);
  assert.throws(() => assertNavigationScoutReplay('unlockPressAirspace', {}, {}), /unsupported|idempotent/);
});

test('actual jump and taxi cost proof cannot accept an unpaid or double-paid consequence', () => {
  assertNavigationScoutCost('jumpShip', { status: 'jumped', fuelCost: 2, remainingFuel: 5 },
    { beforeFuel: 7, afterFuel: 5, chargedBefore: true, chargedAfter: false });
  for (const patch of [{ afterFuel: 7 }, { afterFuel: 3 }, { chargedBefore: false }, { chargedAfter: true }]) {
    assert.throws(() => assertNavigationScoutCost('jumpShip', { status: 'jumped', fuelCost: 2, remainingFuel: 5 },
      { beforeFuel: 7, afterFuel: 5, chargedBefore: true, chargedAfter: false, ...patch }), /fuel|charge|cost/);
  }
  assertNavigationScoutCost('sendScoutTaxiTransfer', { kind: 'fuel', units: 2, sourceFuelRemaining: 5 },
    { beforeFuel: 7, afterFuel: 5, beforeTargetFuel: 3, afterTargetFuel: 5 });
  assert.throws(() => assertNavigationScoutCost('sendScoutTaxiTransfer', { kind: 'fuel', units: 2, sourceFuelRemaining: 5 },
    { beforeFuel: 7, afterFuel: 5, beforeTargetFuel: 3, afterTargetFuel: 3 }), /fuel|cost/);
});

test('private scout report/result/note bind one requester and reject nested hidden data', () => {
  validateScoutBundle(scoutBundle(), { actor: actor(), reply: scoutReply() });
  const wrongRequester = scoutBundle(); wrongRequester.result.requesterUid = 'foreign-owner';
  assert.throws(() => validateScoutBundle(wrongRequester, { actor: actor(), reply: scoutReply() }), /requester|source/);
  const hidden = scoutBundle(); hidden.result.systemFact.bonus = 8;
  assert.throws(() => validateScoutBundle(hidden, { actor: actor(), reply: scoutReply() }), /private|Unknown|fact/);
  const wrongNote = scoutBundle(); wrongNote.note.systemFact.code = 'P';
  assert.throws(() => validateScoutBundle(wrongNote, { actor: actor(), reply: scoutReply() }), /note|fact/);
});

test('saved proof metadata cannot leak scout facts, private notes, raw UIDs or caller unknown fields', () => {
  const evidence = safeNavigationScoutEvidence({ branch: 'scout-report', status: 'observed', roleId: 'wing-commander',
    actor: actor(), endpoint: 'readPrivateScoutResult', result: scoutBundle().result, nextActor: 'caller',
    setupChoice: false, replay: 'read-only', costs: { fuel: 0 } });
  assert.equal(evidence.uidHash, actor().uidHash); assert.equal(evidence.resultFingerprint, digest(scoutBundle().result));
  const text = JSON.stringify(evidence);
  for (const value of ['actual-owner', 'Private current fact', '1100', 'fleet-1', 'original-scout']) assert.ok(!text.includes(value));
  assert.throws(() => safeNavigationScoutEvidence({ branch: 'scout-report', status: 'observed', actor: actor(),
    result: scoutBundle().result, privateFact: 'leak' }), /Unknown|evidence/);
});

test('a blocked required procedure fails; optional natural branches remain pending and never become global passed credit', () => {
  const rows = [{ branch: 'known-jump', status: 'observed' }, { branch: 'natural-failure', status: 'pending' }];
  const summary = summarizeNavigationScoutBranches(rows, ['known-jump']);
  assert.equal(summary.actualAcceptance, false); assert.deepEqual(summary.pending, ['natural-failure']);
  assert.throws(() => summarizeNavigationScoutBranches(rows, ['natural-failure']), /required.*natural-failure/i);
  assert.throws(() => summarizeNavigationScoutBranches(rows, ['invented']), /Unknown/);
});

test('UI receipt is observed before the genuine choice; SDK is exact recovery only and not an initial mutation', async () => {
  const order = [], original = actor(), request = jump();
  const result = { status: 'jumped', requestId: request.requestId, shipId: 'aegis', fuelCost: 2, remainingFuel: 5 };
  const surface = { callable: async (name, payload) => { order.push('replay'); assert.equal(name, 'jumpShip');
    assert.deepEqual(payload, request); return { status: 'committed', result: structuredClone(result) }; } };
  await captureNavigationScoutUiReceipt({ surface, endpoint: 'jumpShip', original,
    inspect: async () => actor(), choose: async () => { order.push('choice'); },
    waitForResponse: async () => { order.push('observe'); return {
      status: () => 200, json: async () => ({ result }), request: () => ({ postDataJSON: () => ({ data: request }) }) }; },
    intent: { shipId: 'aegis', coordinate: '1100' }, record: () => order.push('record') });
  assert.deepEqual(order, ['observe', 'choice', 'record', 'replay']);
});

test('source non-idempotent UI commands are recorded once, without any SDK recovery mutation', async () => {
  let sdk = 0;
  const original = gmActor();
  const result = await captureNavigationScoutUiReceipt({ endpoint: 'triggerDradisContact', original,
    surface: { callable: async () => { sdk++; } }, inspect: async () => gmActor(),
    choose: async () => {}, waitForResponse: async () => ({ status: () => 200,
      json: async () => ({ result: { triggeredAt: '2026-10-05T00:01:00.000Z' } }),
      request: () => ({ postDataJSON: () => ({ data: { sessionId: original.sessionId, instanceId: original.instanceId } }) }) }),
    intent: {}, record: () => {} });
  assert.equal(sdk, 0); assert.equal(result.replay, 'source-unsupported');
});

test('UI failure records safe receipt evidence but cannot replay a stale reply or changed audience', async () => {
  let sdk = 0, recorded = 0;
  await assert.rejects(captureNavigationScoutUiReceipt({ endpoint: 'jumpShip', original: actor(),
    surface: { callable: async () => { sdk++; } }, inspect: async () => actor(), choose: async () => {},
    intent: { shipId: 'aegis', coordinate: '1100' }, record: () => { recorded++; },
    waitForResponse: async () => ({ status: () => 200, json: async () => ({ result: { status: 'stale' } }),
      request: () => ({ postDataJSON: () => ({ data: jump() }) }) }) }), /stale|rejected/);
  assert.equal(recorded, 1); assert.equal(sdk, 0);
});

test('factory is additive, lazy and explicit about required branches; construction never launches or mutates', () => {
  const proof = createNavigationScoutProof(undefined, { requiredBranches: ['known-jump', 'scout-report'] });
  for (const key of ['onSetup', 'onStarted', 'runNavigation', 'runScoutReaders', 'save', 'summary']) assert.equal(typeof proof[key], 'function');
  assert.throws(() => createNavigationScoutProof(undefined, { requiredBranches: ['invented'] }), /Unknown/);
  assert.throws(() => createNavigationScoutProof(undefined, { requiredBranches: ['known-jump', 'known-jump'] }), /duplicate/i);
});
