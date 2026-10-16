import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPc10FunctionalTransport, assertPc10FunctionalCommand } from './pc10-gate2-functional-proof.mjs';
import { createPc10CallableTrace } from './pc10-proof-diagnostics.mjs';

// Exercise a FULLY matching original command, source interval and captured
// native denial. Only the HTTP status differs in the rejection cases.
function matchedDenial(code, status, withRequestId) {
  const original = { roleId: 'aegis-captain', uid: 'original-http-actor', sessionId: 'original-http-session',
    contextHash: 'a'.repeat(64) };
  const name = code === 'permission-denied' ? 'startGame' : 'claimSeat';
  const data = { sessionId: original.sessionId, ...(withRequestId ? { requestId: 'original-http-request' } : {}) };
  const source = checkedAt => ({ roleId: original.roleId, uid: original.uid, sessionId: original.sessionId,
    checkedAt, phase: 'active', currentTurn: 1, nonKicked: true, generation: 3, playerRole: 'player',
    assignedRoleId: original.roleId, activeConsoleRoleId: original.roleId, seatId: original.roleId,
    groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [], connected: true, sameMembership: true,
    seatHolderUid: original.uid, seatStatus: 'claimed' });
  const binding = observedAt => ({ authUid: original.uid, storeUid: original.uid, sessionId: original.sessionId,
    observedAt, contextHash: original.contextHash, nativeDocumentHash: 'b'.repeat(64),
    assignedRoleId: original.roleId, activeConsoleRoleId: original.roleId, seatId: original.roleId });
  const command = { commandId: 'original-http-command', original, roleId: original.roleId, name, data,
    expectedDenial: code, registeredAt: 10, issuedAt: 11, completedAt: 13, failedAt: null,
    beforeSource: source(10), afterSource: source(14), beforeBinding: binding(10), afterBinding: binding(14),
    invocation: { startedAt: 11, completedAt: 13, nativeDocumentHash: 'b'.repeat(64) },
    reply: { status: 'denied', error: { code: `functions/${code}` } }, validation: { passed: true } };
  const trace = createPc10CallableTrace({ name, data, actorUid: original.uid,
    transport: 'independent-browser-SDK', startedAt: 12 });
  const observation = { ...trace, roleId: original.roleId, issuedAt: 12, status,
    denialCode: code.toUpperCase().replaceAll('-', '_'), httpOutcome: 'error',
    requestFinishedAt: 13, requestFailedAt: null, bodyCompletedAt: 14, bodyHash: 'c'.repeat(64),
    nativeDocumentHash: 'b'.repeat(64), nativeContextHash: 'd'.repeat(64), nativeFrameHash: 'e'.repeat(64),
    nativeLoaderHash: 'f'.repeat(64), protocolRequestHash: '1'.repeat(64) };
  assertPc10FunctionalCommand(command);
  return { commands: [command], observations: [observation], originals: new Map([[original.roleId, original]]) };
}

for (const [code, canonicalStatus] of [['permission-denied', 403], ['failed-precondition', 400]]) {
  test(`fully matching ${code} keeps its canonical HTTP${canonicalStatus} denial`, () => {
    for (const withRequestId of [false, true]) {
      const result = assessPc10FunctionalTransport(matchedDenial(code, canonicalStatus, withRequestId));
      assert.equal(result.functionalStatus, 'PASSED'); assert.deepEqual(result.hardFailures, []);
    }
  });
  for (const status of [500, 503]) test(`matching original ${code} cannot classify HTTP${status} as its expected denial`, () => {
    for (const withRequestId of [false, true]) {
      const input = matchedDenial(code, status, withRequestId), bytes = JSON.stringify(input.observations);
      const result = assessPc10FunctionalTransport(input);
      assert.equal(result.functionalStatus, 'FAILED');
      assert.ok(result.hardFailures.some(value => value.category === 'unclassified-native-http-outcome' && value.status === status));
      assert.equal(JSON.stringify(input.observations), bytes, 'The original transport status and body metadata remain unchanged.');
    }
  });
  test(`matching ${code} rejects a swapped or other unexpected non200 HTTP status`, () => {
    for (const status of [canonicalStatus === 403 ? 400 : 403, 201, 401, 404, 409, 429]) {
      for (const withRequestId of [false, true]) {
        const result = assessPc10FunctionalTransport(matchedDenial(code, status, withRequestId));
        assert.equal(result.functionalStatus, 'FAILED');
        assert.ok(result.hardFailures.some(value => value.category === 'unclassified-native-http-outcome' && value.status === status));
      }
    }
  });
}
