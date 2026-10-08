import assert from 'node:assert/strict';
import test from 'node:test';
import {
  P631_MEMBER_READ_LIMIT, P631_PREPARATION_LIMIT,
  provePreparationRateLimit, proveCurrentMemberReadRateLimit,
  parseP631SecurityDenialRecords, assertP631RateDenialRecords, p631LoggerHash,
  runP631OwnedJourney,
} from './pc10-member-rate-security-ui-proof-core.mjs';

function marker(callableName, requestCount, windowStartedAtMs, identityHash = 'a'.repeat(64)) {
  return { type: 'callable-rate-limit', version: 1, callableName, identityHash, windowStartedAtMs, requestCount };
}

test('preparation bucket reaches six, denies the seventh fresh request, and replays the original receipt unchanged', async () => {
  const originalPayload = { sessionId: 'owned-session', instanceId: 'owned-gm-instance',
    requestId: 'original-ui-request', expectedSetupRevision: 4 };
  const original = { endpoint: 'prepareFullGameDemo', data: originalPayload, httpStatus: 200,
    before: { playerRole: 'gm', gmInstanceOwned: true },
    result: { status: 'committed', expectedSetupRevision: 4, currentSetupRevision: 4,
      fullGameDemo: { status: 'preparing', progression: 'manual' } } };
  let bucket = marker('prepareFullGameDemo', 1, 50_000);
  const receipt = { exists: true, updateTimeMs: 51_000, valueHash: 'original-receipt-hash' };
  const effect = { updateTimeMs: 52_000, setupRevision: 4,
    fullGameDemo: { status: 'preparing', progression: 'manual' }, originalReceipt: receipt };
  const requests = [];
  let requestNumber = 0;
  const gm = { callable: async (name, data) => {
    assert.equal(name, 'prepareFullGameDemo');
    requests.push(data);
    if (data.requestId === originalPayload.requestId) return { status: 'committed', result: {
      status: 'replayed', sessionMatches: true, requestMatches: true, expectedSetupRevision: 4,
      currentSetupRevision: 4, fullGameDemo: { status: 'preparing', progression: 'manual' },
    } };
    if (bucket.requestCount < P631_PREPARATION_LIMIT) {
      bucket = { ...bucket, requestCount: bucket.requestCount + 1 };
      return { status: 'committed', result: { status: 'committed', sessionMatches: true, requestMatches: true,
        expectedSetupRevision: 4, fullGameDemo: { status: 'preparing', progression: 'manual' } } };
    }
    return { status: 'denied', code: 'functions/resource-exhausted',
      details: { commandError: 'rate-limited', retryAfterSeconds: 31 } };
  } };

  const proof = await provePreparationRateLimit({ gm, original,
    readMarker: async () => bucket, readEffect: async () => effect,
    readOriginalReceipt: async () => receipt,
    makeRequestId: () => `fresh-request-${++requestNumber}`, now: () => 60_000 });
  assert.equal(proof.distinctChargedRequests, 6);
  assert.equal(proof.markerCountAtLimit, 6);
  assert.equal(proof.retryAfterSeconds, 31);
  assert.equal(proof.exactOriginalReplay, true);
  assert.equal(proof.replayDidNotChargeOrMutate, true);
  assert.equal(requests.length, 7);
  assert.equal(requests.at(-1), originalPayload, 'The retry uses the exact captured original payload object.');
  assert.equal(requests.filter(request => request.requestId === originalPayload.requestId).length, 1);
  assert.equal(bucket.windowStartedAtMs, 50_000);
});

test('preparation replay must remain inside the original exhausted 60-second window', async () => {
  const payload = { sessionId: 'owned-session', instanceId: 'owned-gm-instance',
    requestId: 'original-ui-request', expectedSetupRevision: 4 };
  const original = { endpoint: 'prepareFullGameDemo', data: payload, httpStatus: 200,
    before: { playerRole: 'gm', gmInstanceOwned: true },
    result: { status: 'committed', expectedSetupRevision: 4, currentSetupRevision: 4,
      fullGameDemo: { status: 'preparing', progression: 'manual' } } };
  let time = 50_000;
  let bucket = marker('prepareFullGameDemo', 1, 50_000);
  let replayCalls = 0, fresh = 0;
  const gm = { callable: async (_name, request) => {
    if (request.requestId === payload.requestId) {
      replayCalls++;
      return { status: 'committed', result: { status: 'replayed', sessionMatches: true,
        requestMatches: true, expectedSetupRevision: 4, currentSetupRevision: 4,
        fullGameDemo: { status: 'preparing', progression: 'manual' } } };
    }
    if (bucket.requestCount < P631_PREPARATION_LIMIT) {
      bucket = { ...bucket, requestCount: bucket.requestCount + 1 };
      return { status: 'committed', result: { status: 'committed', sessionMatches: true,
        requestMatches: true, expectedSetupRevision: 4,
        fullGameDemo: { status: 'preparing', progression: 'manual' } } };
    }
    time = 110_000;
    return { status: 'denied', code: 'functions/resource-exhausted',
      details: { commandError: 'rate-limited', retryAfterSeconds: 1 } };
  } };
  await assert.rejects(provePreparationRateLimit({ gm, original,
    readMarker: async () => bucket,
    readEffect: async () => ({ setupRevision: 4, status: 'preparing' }),
    readOriginalReceipt: async () => ({ exists: true, updateTimeMs: 51_000 }),
    makeRequestId: () => `fresh-${++fresh}`, now: () => time,
  }), /original preparation window expired/i);
  assert.equal(replayCalls, 0, 'Do not claim replay idempotency after its original rate window has expired.');
});

test('ordinary current-member reads exhaust only that UID marker while same-session GM SDK read succeeds', async () => {
  let memberMarker = marker('getCurrentMemberSession', 118, 10_000, 'b'.repeat(64));
  const gmMarker = marker('getCurrentMemberSession', 3, 10_000, 'c'.repeat(64));
  let memberCalls = 0, gmCalls = 0;
  const member = { callable: async name => {
    assert.equal(name, 'getCurrentMemberSession');
    memberCalls++;
    if (memberMarker.requestCount >= P631_MEMBER_READ_LIMIT) return { status: 'denied',
      code: 'functions/resource-exhausted', details: { commandError: 'rate-limited', retryAfterSeconds: 22 } };
    memberMarker = { ...memberMarker, requestCount: memberMarker.requestCount + 1 };
    return { status: 'committed', result: { type: 'current-member-session', sessionMatches: true, actorMatches: true } };
  } };
  const gm = { callable: async (_name, payload) => {
    gmCalls++;
    assert.deepEqual(payload, { sessionId: 'owned-session' });
    return { status: 'committed', result: { type: 'current-member-session', sessionMatches: true, actorMatches: true } };
  } };
  let time = 30_000;
  const proof = await proveCurrentMemberReadRateLimit({ member, gm, sessionId: 'owned-session',
    readMemberMarker: async () => memberMarker, readGmMarker: async () => gmMarker, now: () => time });
  assert.equal(proof.preexistingMemberRequestCount, 118);
  assert.equal(proof.explicitSuccessfulReads, 2);
  assert.equal(proof.memberLimitReached, 120);
  assert.equal(proof.retryAfterSeconds, 22);
  assert.equal(proof.gmSameSessionReadSucceeded, true);
  assert.equal(proof.distinctUidMarkerHashes, true);
  assert.equal(memberCalls, 3);
  assert.equal(gmCalls, 1);
  assert.equal(time - proof.memberWindowStartedAtMs, 20_000);
});

test('same-session GM success must complete before the exhausted member read window expires', async () => {
  let time = 30_000;
  const memberMarker = marker('getCurrentMemberSession', 120, 10_000, 'b'.repeat(64));
  const gmMarker = marker('getCurrentMemberSession', 3, 10_000, 'c'.repeat(64));
  const member = { callable: async () => ({ status: 'denied', code: 'resource-exhausted',
    details: { commandError: 'rate-limited', retryAfterSeconds: 40 } }) };
  const gm = { callable: async () => {
    time = 70_000;
    return { status: 'committed', result: { type: 'current-member-session',
      sessionMatches: true, actorMatches: true } };
  } };
  await assert.rejects(proveCurrentMemberReadRateLimit({ member, gm, sessionId: 'owned-session',
    readMemberMarker: async () => memberMarker, readGmMarker: async () => gmMarker, now: () => time,
  }), /original member read window expired/i);
});

test('P631 denial log parser returns only allowlisted hashes and rejects extra body fields', () => {
  const prep = { type: 'security-denial', schemaVersion: 1, callableName: 'prepareFullGameDemo',
    code: 'resource-exhausted', category: 'rate-limit', actorHash: p631LoggerHash('actor', 'gm-uid'),
    sessionHash: p631LoggerHash('session', 'owned-session'), requestHash: p631LoggerHash('request', 'fresh-request'),
    redactionPolicy: 'security-denial-hashed-metadata-v1' };
  const read = { type: 'security-denial', schemaVersion: 1, callableName: 'getCurrentMemberSession',
    code: 'resource-exhausted', category: 'rate-limit', actorHash: p631LoggerHash('actor', 'member-uid'),
    sessionHash: p631LoggerHash('session', 'owned-session'),
    redactionPolicy: 'security-denial-hashed-metadata-v1' };
  const records = parseP631SecurityDenialRecords([
    JSON.stringify({ severity: 'WARNING', jsonPayload: prep }),
    JSON.stringify({ severity: 'WARNING', message: 'Callable security denial', timestamp: '2026-10-08T00:00:00Z', ...read }),
    JSON.stringify({ type: 'security-denial', ...prep, facilitatorNotes: 'PRIVATE_CANARY' }),
  ].join('\n'));
  const expected = [
    { callableName: 'prepareFullGameDemo', actorHash: prep.actorHash, sessionHash: prep.sessionHash, requestHash: prep.requestHash },
    { callableName: 'getCurrentMemberSession', actorHash: read.actorHash, sessionHash: read.sessionHash },
  ];
  assert.deepEqual(assertP631RateDenialRecords(records.slice(0, 2), expected).map(record => record.callableName),
    ['prepareFullGameDemo', 'getCurrentMemberSession']);
  assert.equal(JSON.stringify(records).includes('PRIVATE_CANARY'), false);
  assert.throws(() => assertP631RateDenialRecords(records, expected), /arbitrary request\/body fields/i);
  assert.throws(() => assertP631RateDenialRecords(parseP631SecurityDenialRecords(
    JSON.stringify({ severity: 'WARNING', message: 'PRIVATE_CANARY', ...read })), [expected[1]]),
  /arbitrary request\/body fields/i);
  assert.throws(() => assertP631RateDenialRecords(parseP631SecurityDenialRecords(
    JSON.stringify({ severity: 'WARNING', ...read, requestHash: 'PRIVATE_CANARY' })), [expected[1]]),
  /requestHash.*64-character hash/i);
});

test('P631 member denial records reject a non-hash optional requestHash', () => {
  const read = { type: 'security-denial', schemaVersion: 1, callableName: 'getCurrentMemberSession',
    code: 'resource-exhausted', category: 'rate-limit', actorHash: 'a'.repeat(64),
    sessionHash: 'b'.repeat(64), requestHash: 'PRIVATE_CANARY',
    redactionPolicy: 'security-denial-hashed-metadata-v1' };
  const records = parseP631SecurityDenialRecords(JSON.stringify(read));
  assert.throws(() => assertP631RateDenialRecords(records, [{ callableName: read.callableName,
    actorHash: read.actorHash, sessionHash: read.sessionHash }]), /requestHash.*64-character hash/i);
});

test('P631 current-member denial records omit requestHash for the one-field callable payload', () => {
  const read = { type: 'security-denial', schemaVersion: 1, callableName: 'getCurrentMemberSession',
    code: 'resource-exhausted', category: 'rate-limit', actorHash: 'a'.repeat(64),
    sessionHash: 'b'.repeat(64), requestHash: 'c'.repeat(64),
    redactionPolicy: 'security-denial-hashed-metadata-v1' };
  const records = parseP631SecurityDenialRecords(JSON.stringify(read));
  assert.throws(() => assertP631RateDenialRecords(records, [{ callableName: read.callableName,
    actorHash: read.actorHash, sessionHash: read.sessionHash }]), /must omit requestHash/i);
});

test('owned journey always runs cleanup and rethrows the same first operation failure', async () => {
  const primary = new Error('first operation failure');
  const cleanupFailure = new Error('cleanup follow-up');
  const order = [];
  await assert.rejects(runP631OwnedJourney({
    prepareGmAndOriginal: async () => { order.push('prepare'); return {}; },
    saturatePreparation: async () => { order.push('preparation-budget'); return {}; },
    admitMember: async () => { order.push('admit-member'); return {}; },
    saturateMemberReads: async () => { order.push('member-budget'); throw primary; },
    verifyPrivateMarkerDenials: async () => { order.push('must-not-run-private'); },
    verifyRateDenialLogs: async () => { order.push('must-not-run-logs'); },
    cleanup: async received => { order.push('cleanup'); assert.equal(received, primary); throw cleanupFailure; },
  }), error => {
    assert.equal(error, primary);
    assert.equal(error.p631CleanupError, cleanupFailure);
    return true;
  });
  assert.deepEqual(order, ['prepare', 'preparation-budget', 'admit-member', 'member-budget', 'cleanup']);
});
