import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertNavigationScoutActor, assertNavigationScoutConsequenceActor, assertNavigationScoutCensus, waitForNavigationScoutPaint,
  assertNavigationScoutRequest, assertNavigationScoutReplay, assertNavigationScoutCost,
  validateScoutBundle, safeNavigationScoutEvidence, summarizeNavigationScoutBranches,
  captureNavigationScoutUiReceipt,
} from './pc10-navigation-scout-proof-contracts.mjs';
import { createNavigationScoutProof } from './pc10-navigation-scout-ui-proof.mjs';
import * as contracts from './pc10-navigation-scout-proof-contracts.mjs';

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

test('a response cannot claim another original actor, cycle or request envelope before recovery', async () => {
  for (const patch of [{ actorUid: 'foreign-actor' }, { turn: 3 }, { idempotencyKey: 'foreign-request' }]) {
    let sdk = 0;
    const result = { status: 'jumped', shipId: 'aegis', actorUid: 'actual-owner', turn: 2,
      idempotencyKey: 'original-jump', revision: 9, ...patch };
    await assert.rejects(captureNavigationScoutUiReceipt({ endpoint: 'jumpShip', original: actor(),
      surface: { callable: async () => { sdk++; return { status: 'committed', result }; } },
      inspect: async () => actor(), choose: async () => {}, intent: { shipId: 'aegis', coordinate: '1100' },
      waitForResponse: async () => ({ status: () => 200, json: async () => ({ result }),
        request: () => ({ postDataJSON: () => ({ data: jump() }) }) }) }), /actor|cycle|receipt|request|source/);
    assert.equal(sdk, 0);
  }
});

test('source replay status cannot disappear while all other fields are unchanged', () => {
  const { status, ...withoutStatus } = scoutReply();
  assert.equal(status, 'requested');
  assert.throws(() => assertNavigationScoutReplay('requestScout', scoutReply(), withoutStatus), /status|receipt|source/);
});

test('safe evidence rejects raw identity content and unobserved private cost fields', () => {
  assert.throws(() => safeNavigationScoutEvidence({ branch: 'scout-report', status: 'observed',
    actor: { ...actor(), uidHash: 'actual-owner' } }), /hash|identity|evidence/i);
  assert.throws(() => safeNavigationScoutEvidence({ branch: 'known-jump', status: 'observed',
    costs: { fuel: 2, privateBonus: 6 } }), /Unknown/);
});

test('factory is additive, lazy and explicit about required branches; construction never launches or mutates', () => {
  const proof = createNavigationScoutProof(undefined, { requiredBranches: ['known-jump', 'scout-report'] });
  for (const key of ['onSetup', 'onStarted', 'runNavigation', 'runScoutReaders', 'save', 'summary']) assert.equal(typeof proof[key], 'function');
  assert.throws(() => createNavigationScoutProof(undefined, { requiredBranches: ['invented'] }), /Unknown/);
  assert.throws(() => createNavigationScoutProof(undefined, { requiredBranches: ['known-jump', 'known-jump'] }), /duplicate/i);
});

test('a source-valid zero-fuel upgraded jump still consumes its real charge', () => {
  assertNavigationScoutCost('jumpShip', { status: 'jumped', fuelCost: 0, remainingFuel: 5 },
    { beforeFuel: 5, afterFuel: 5, chargedBefore: true, chargedAfter: false });
  assert.throws(() => assertNavigationScoutCost('jumpShip', { status: 'jumped', fuelCost: 0, remainingFuel: 5 },
    { beforeFuel: 5, afterFuel: 5, chargedBefore: true, chargedAfter: true }), /charge/);
});

test('the current Comms replacement holder may retain a historical core role, without granting that role the scan', () => {
  const current = { ...actor(), replacementRoleId: 'comms-officer', activeConsoleRoleId: null };
  const request = { sessionId: 'session-one', requestId: 'actual-comms', entitlementId: 'comms-officer', targetCoordinate: '1100' };
  const intent = { entitlementId: 'comms-officer', coordinate: '1100', printedCoordinates: ['1100'] };
  assertNavigationScoutRequest('requestScout', request, current, intent);
  assert.throws(() => assertNavigationScoutRequest('requestScout', request, actor(), intent), /holder|replacement|source/);
  assert.throws(() => assertNavigationScoutRequest('requestScout', request, { ...current, activeConsoleRoleId: 'wing-commander' }, intent), /holder|replacement|source/);
});

// Mock transport only: these fixtures prove helper control flow, never gameplay.
async function nativeFactoryContext(read) {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-navigation-scout-native-'));
  let version = 0, changedUid = false, readCount = 0, phase = 'active';
  const handlers = new Map();
  const current = () => ({ ...gmActor(), phase, ...(changedUid ? { uidHash: 'c'.repeat(16) } : {}), cursor: { version } });
  const gm = { storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => current(),
    until: async (_description, predicate) => { const value = current(); assert.ok(predicate(value)); return value; },
    page: { on: (event, fn) => handlers.set(event, fn), off: event => handlers.delete(event),
      getByRole: () => ({ isVisible: async () => false }),
      getByText: () => ({ isVisible: async () => true, waitFor: async () => {} }), evaluate: async (_fn, arg) => {
      if (typeof arg === 'string') return current();
      readCount++;
      return read({ readCount, advance: () => { version++; }, changeUid: () => { changedUid = true; } });
    } } };
  const roster = [{ roleId: 'admiral', uidHash: 'a'.repeat(16) }, { roleId: 'wing-commander', uidHash: 'd'.repeat(16) }];
  const context = { gm, crew: {}, directory, roster, initial: { sessionId: 'session-one', joinCode: 'ordinary-join' },
    started: { ...gmActor(), activeRoleIds: roster.map(actor => actor.roleId), fullGameDemo: { status: 'active', progression: 'manual' } } };
  return { context, count: () => readCount, setPhase: value => { phase = value; },
    emit: endpoint => handlers.get('request')?.({ method: () => 'POST', url: () => `http://normal-local/us-central1/${endpoint}`,
      postDataJSON: () => ({ data: { sessionId: 'session-one', instanceId: 'original-instance' } }) }) };
}

test('canonical onStarted activeRoleIds census binds without requiring invented callback fields', async () => {
  const { context } = await nativeFactoryContext(async () => ({ failures: [] }));
  const proof = createNavigationScoutProof(context);
  await proof.onStarted(context);
  assert.equal(proof.summary().actualAcceptance, false);
});

test('a rejected source read permits one newer same-original-cursor reread and leaves no-natural-failure uncredited', async () => {
  const native = await nativeFactoryContext(async ({ readCount, advance }) => {
    if (readCount === 1) { advance(); throw new Error('Scouting authority changed. Refresh the station.'); }
    return { failures: [] };
  });
  const proof = createNavigationScoutProof(native.context);
  await proof.onStarted(native.context);
  await proof.runNavigation([{ branch: 'natural-failure', roleId: 'gm', shipId: 'aegis' }]);
  assert.equal(native.count(), 2);
  assert.deepEqual(proof.summary().pending, ['natural-failure']);
  assert.equal(proof.summary().actualAcceptance, false);
});

test('private source replies are withdrawn after actual actor change rather than rerun or saved', async () => {
  const native = await nativeFactoryContext(async ({ changeUid, advance }) => {
    advance(); changeUid(); return { failures: [], hiddenFact: 'never-save-this' };
  });
  const proof = createNavigationScoutProof(native.context);
  await proof.onStarted(native.context);
  await assert.rejects(proof.runNavigation([{ branch: 'natural-failure', roleId: 'gm', shipId: 'aegis' }]), /Original/);
  assert.equal(native.count(), 1);
  assert.ok(!JSON.stringify(await proof.save()).includes('never-save-this'));
});

test('a source read cannot loop through perpetual snapshot changes, and required natural failure cannot be inferred', async () => {
  const native = await nativeFactoryContext(async ({ advance }) => { advance(); throw new Error('Scouting authority changed.'); });
  const proof = createNavigationScoutProof(native.context);
  await proof.onStarted(native.context);
  await assert.rejects(proof.runNavigation([{ branch: 'natural-failure', roleId: 'gm', shipId: 'aegis' }]), /authority changed/);
  assert.equal(native.count(), 2);
  const unavailable = await nativeFactoryContext(async () => ({ failures: [] }));
  const required = createNavigationScoutProof(unavailable.context, { requiredBranches: ['natural-failure'] });
  await required.onStarted(unavailable.context);
  await assert.rejects(required.runNavigation([{ branch: 'natural-failure', roleId: 'gm', shipId: 'aegis' }]), /Required natural-failure/);
});

test('late current paint cannot be accepted after the original stage budget', async () => {
  let time = 0;
  await assert.rejects(waitForNavigationScoutPaint({ original: actor(), timeoutMs: 100,
    now: () => time, inspect: async () => actor(), inspectPaint: async () => {
      time = 101; return { mounted: true, current: true, eligible: true };
    } }), /budget|deadline/);
});

test('a late UI result remains uncredited and does not start SDK receipt recovery', async () => {
  let time = 0, sdk = 0;
  await assert.rejects(captureNavigationScoutUiReceipt({ endpoint: 'jumpShip', original: actor(), timeoutMs: 100,
    now: () => time, surface: { callable: async () => { sdk++; return { status: 'committed', result: { status: 'jumped' } }; } },
    inspect: async () => actor(), choose: async () => {}, intent: { shipId: 'aegis', coordinate: '1100' },
    waitForResponse: async () => ({ status: () => 200, json: async () => { time = 101; return { result: { status: 'jumped' } }; },
      request: () => ({ postDataJSON: () => ({ data: jump() }) }) }) }), /budget|deadline/);
  assert.equal(sdk, 0);
});

test('prestart observation ends at the genuine start request, not at the later callback after active readers mount', async () => {
  const native = await nativeFactoryContext(async () => []);
  native.setPhase('casting');
  const proof = createNavigationScoutProof(undefined, { requiredBranches: ['prestart-readers'] });
  await proof.onSetup(native.context);
  native.emit('startGame'); native.setPhase('active');
  native.emit('listPendingScoutRequests'); native.emit('listGmScoutResolutionLog');
  await proof.onStarted(native.context);
  assert.ok(proof.summary().observed.includes('prestart-readers'));
  assert.equal(proof.summary().actualAcceptance, false);
});

test('a reader really sent before the genuine GM start remains a failed prestart contract', async () => {
  const native = await nativeFactoryContext(async () => []);
  native.setPhase('casting');
  const proof = createNavigationScoutProof(undefined, { requiredBranches: ['prestart-readers'] });
  await proof.onSetup(native.context); native.emit('listPendingScoutRequests');
  native.emit('startGame'); native.setPhase('active');
  await assert.rejects(proof.onStarted(native.context), /Prestart/);
});

test('safe failure evidence keeps the actual public HTTP/code boundary without private error text', () => {
  const row = safeNavigationScoutEvidence({ branch: 'taxi-fuel', status: 'failed', actor: actor(),
    endpoint: 'sendScoutTaxiTransfer', httpStatus: 400, errorCode: 'FAILED_PRECONDITION', reason: 'source-cost-blocked' });
  assert.equal(row.httpStatus, 400); assert.equal(row.errorCode, 'FAILED_PRECONDITION');
  assert.throws(() => safeNavigationScoutEvidence({ branch: 'taxi-fuel', status: 'failed',
    errorCode: 'A private scout title' }), /code|Unknown|evidence/);
});

test('a later failed required source procedure cannot reuse earlier branch credit', () => {
  assert.throws(() => summarizeNavigationScoutBranches([
    { branch: 'scout-report', status: 'observed' }, { branch: 'scout-report', status: 'failed' },
  ], ['scout-report']), /Required scout-report/);
});

test('courier delivery matches the real server prefix, request identity and original actor in the actual target group', () => {
  assert.equal(typeof contracts.validateScoutTaxiDelivery, 'function');
  const request = { requestId: 'actual-courier', shuttleId: 'starlight', text: 'Original source note' };
  const expected = { request, actor: actor(), targetGroupId: 'fleet-2' };
  const note = { id: request.requestId, actorUid: 'actual-owner', text: 'Scout taxi from aegis: Original source note', sentAt: '2026-10-05T00:02:00.000Z' };
  contracts.validateScoutTaxiDelivery({ groupId: 'fleet-2', messages: [note] }, expected);
  for (const patch of [{ id: 'old-request' }, { actorUid: 'foreign-owner' }, { text: request.text }]) {
    assert.throws(() => contracts.validateScoutTaxiDelivery({ groupId: 'fleet-2', messages: [{ ...note, ...patch }] }, expected), /source|courier|note/);
  }
  assert.throws(() => contracts.validateScoutTaxiDelivery({ groupId: 'fleet-1', messages: [note] }, expected), /group/);
});

test('a GM recovery control that races automatic resolution does not receive GM recovery credit', () => {
  assert.equal(typeof contracts.classifyScoutRecovery, 'function');
  const result = scoutBundle().result;
  const expected = { requesterUid: result.requesterUid, requestId: result.requestId, sessionId: result.sessionId,
    sourceId: result.sourceId, cycle: result.cycle, targetCoordinate: result.targetCoordinate };
  const log = { requestId: result.requestId, cycle: result.cycle, sourceId: result.sourceId,
    originShipId: 'aegis', receivingShipId: 'aegis', targetCoordinate: result.targetCoordinate,
    systemFact: result.systemFact, recordedAt: '2026-10-05T00:02:00.000Z', resolutionMode: 'gm-recovery' };
  assert.equal(contracts.classifyScoutRecovery(log, { status: 'resolved', result }, expected).state, 'observed');
  assert.equal(contracts.classifyScoutRecovery({ ...log, resolutionMode: 'automatic' }, { status: 'replayed', result }, expected).state, 'pending');
  assert.equal(contracts.classifyScoutRecovery(log, { status: 'replayed', result }, expected).state, 'pending');
  assert.throws(() => contracts.classifyScoutRecovery(log,
    { status: 'resolved', result: { ...result, requesterUid: 'foreign-owner' } }, expected), /source|requester/);
});
