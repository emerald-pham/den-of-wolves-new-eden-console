import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

export const P631_RATE_WINDOW_MS = 60_000;
export const P631_PREPARATION_LIMIT = 6;
export const P631_MEMBER_READ_LIMIT = 120;

const normalizeCode = value => typeof value === 'string'
  ? value.replace(/^functions\//, '').toLowerCase().replaceAll('_', '-') : null;
const rateDenied = reply => reply?.status === 'denied' && normalizeCode(reply.code) === 'resource-exhausted' &&
  reply.details?.commandError === 'rate-limited' && Number.isSafeInteger(reply.details.retryAfterSeconds) &&
  reply.details.retryAfterSeconds >= 1;
const hash = value => createHash('sha256').update(value).digest('hex');
const identityHash = (kind, value) => hash(`security-denial-${kind}\0${value}`);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function assertMarker(marker, callableName) {
  assert.ok(marker, `${callableName} must have an authoritative rate marker.`);
  assert.deepEqual(Object.keys(marker).sort(), [
    'callableName', 'identityHash', 'requestCount', 'type', 'version', 'windowStartedAtMs',
  ]);
  assert.equal(marker.type, 'callable-rate-limit');
  assert.equal(marker.version, 1);
  assert.equal(marker.callableName, callableName);
  assert.match(marker.identityHash, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(marker.windowStartedAtMs) && marker.windowStartedAtMs >= 0);
  assert.ok(Number.isSafeInteger(marker.requestCount) && marker.requestCount >= 1);
  return marker;
}

function assertOriginalWindowLive(marker, label, now) {
  assert.ok(now() - marker.windowStartedAtMs < P631_RATE_WINDOW_MS,
    `The original ${label} window expired before the focused proof completed.`);
}

function assertCommittedPreparation(reply, request, label) {
  assert.equal(reply?.status, 'committed', `${label} must use the original authenticated SDK and commit.`);
  assert.equal(reply.result?.status, 'committed', `${label} must receive a committed preparation receipt.`);
  assert.equal(reply.result?.sessionMatches, true);
  assert.equal(reply.result?.requestMatches, true);
  assert.equal(reply.result?.expectedSetupRevision, request.expectedSetupRevision);
  assert.deepEqual(reply.result?.fullGameDemo, { status: 'preparing', progression: 'manual' });
}

/** Consume the actual GM preparation bucket after its original normal UI receipt. */
export async function provePreparationRateLimit({
  gm, original, readMarker, readEffect, readOriginalReceipt, makeRequestId = randomUUID, now = Date.now,
} = {}) {
  assert.equal(original?.endpoint, 'prepareFullGameDemo');
  const payload = original.data;
  assert.ok(payload && typeof payload === 'object');
  assert.match(payload.sessionId ?? '', /^[\w-]{1,128}$/);
  assert.match(payload.instanceId ?? '', /^[\w-]{1,128}$/);
  assert.match(payload.requestId ?? '', /^[\w-]{1,128}$/);
  assert.ok(Number.isSafeInteger(payload.expectedSetupRevision));
  assert.equal(original.before?.playerRole, 'gm');
  assert.equal(original.before?.gmInstanceOwned, true);
  assert.equal(original.httpStatus < 400, true);
  assert.equal(original.result?.status, 'committed');
  assert.deepEqual(original.result?.fullGameDemo, { status: 'preparing', progression: 'manual' });

  const beforeMarker = assertMarker(await readMarker(), 'prepareFullGameDemo');
  assert.equal(beforeMarker.requestCount, 1,
    'The captured original normal UI request must be the first and only charged preparation so far.');
  const beforeEffect = await readEffect();
  const beforeReceipt = await readOriginalReceipt();
  assert.ok(beforeReceipt?.exists, 'The original UI request must already have its authoritative command receipt.');

  const distinctRequests = new Set([payload.requestId]);
  const requestHashes = [hash(payload.requestId)];
  for (let attempt = 2; attempt <= P631_PREPARATION_LIMIT; attempt++) {
    const requestId = makeRequestId();
    assert.ok(typeof requestId === 'string' && requestId.length > 0);
    assert.equal(distinctRequests.has(requestId), false, 'Every charged preparation request needs a fresh request ID.');
    distinctRequests.add(requestId);
    requestHashes.push(hash(requestId));
    const request = { ...payload, requestId };
    assertCommittedPreparation(await gm.callable('prepareFullGameDemo', request), request,
      `Distinct preparation request ${attempt}`);
  }

  const exhaustedMarker = assertMarker(await readMarker(), 'prepareFullGameDemo');
  assert.equal(exhaustedMarker.requestCount, P631_PREPARATION_LIMIT);
  assert.equal(exhaustedMarker.windowStartedAtMs, beforeMarker.windowStartedAtMs);

  const freshRequestId = makeRequestId();
  assert.equal(distinctRequests.has(freshRequestId), false);
  distinctRequests.add(freshRequestId);
  const freshRequest = { ...payload, requestId: freshRequestId };
  const denied = await gm.callable('prepareFullGameDemo', freshRequest);
  assert.equal(rateDenied(denied), true, 'The seventh fresh request must return RESOURCE_EXHAUSTED with retryAfterSeconds.');
  const markerAfterDenial = assertMarker(await readMarker(), 'prepareFullGameDemo');
  assert.equal(markerAfterDenial.requestCount, P631_PREPARATION_LIMIT,
    'The denied fresh request must not charge the exhausted marker.');
  assert.equal(markerAfterDenial.windowStartedAtMs, beforeMarker.windowStartedAtMs);
  assertOriginalWindowLive(markerAfterDenial, 'preparation', now);

  // This is the exact object captured from the original UI request; keep it in
  // memory and replay it through the same mounted App Firebase SDK.
  assertOriginalWindowLive(markerAfterDenial, 'preparation', now);
  const replay = await gm.callable('prepareFullGameDemo', payload);
  assertOriginalWindowLive(markerAfterDenial, 'preparation', now);
  assert.equal(replay?.status, 'committed');
  assert.equal(replay.result?.status, 'replayed');
  assert.equal(replay.result?.sessionMatches, true);
  assert.equal(replay.result?.requestMatches, true);
  assert.equal(replay.result?.expectedSetupRevision, original.result.expectedSetupRevision);
  assert.equal(replay.result?.currentSetupRevision, original.result.currentSetupRevision);
  assert.deepEqual(replay.result?.fullGameDemo, original.result.fullGameDemo);

  const markerAfterReplay = assertMarker(await readMarker(), 'prepareFullGameDemo');
  const receiptAfterReplay = await readOriginalReceipt();
  const effectAfterReplay = await readEffect();
  assertOriginalWindowLive(markerAfterReplay, 'preparation', now);
  assert.equal(markerAfterReplay.requestCount, P631_PREPARATION_LIMIT,
    'The exact original receipt replay must bypass the exhausted bucket without another charge.');
  assert.equal(markerAfterReplay.windowStartedAtMs, beforeMarker.windowStartedAtMs);
  assert.ok(same(receiptAfterReplay, beforeReceipt), 'Exact replay must leave its original receipt unchanged.');
  assert.ok(same(effectAfterReplay, beforeEffect), 'Exact replay must not create a new preparation effect.');

  return {
    originalRequestHash: hash(payload.requestId),
    distinctChargedRequestHashes: requestHashes,
    freshRequestHash: hash(freshRequestId),
    freshRequestDenied: true,
    retryAfterSeconds: denied.details.retryAfterSeconds,
    freshRequestLoggerHash: identityHash('request', freshRequestId),
    markerCountAtLimit: markerAfterDenial.requestCount,
    distinctChargedRequests: requestHashes.length,
    exactOriginalReplay: true,
    replayDidNotChargeOrMutate: true,
  };
}

/** Exhaust one ordinary member's real read bucket, then prove GM isolation on the same host. */
export async function proveCurrentMemberReadRateLimit({
  member, gm, sessionId, readMemberMarker, readGmMarker,
  maxAttempts = P631_MEMBER_READ_LIMIT + 10, now = Date.now,
} = {}) {
  assert.match(sessionId ?? '', /^[\w-]{1,128}$/);
  assert.ok(Number.isSafeInteger(maxAttempts) && maxAttempts > P631_MEMBER_READ_LIMIT);
  const startingMarker = await readMemberMarker();
  const initialWindowStillOpen = startingMarker && now() - startingMarker.windowStartedAtMs < P631_RATE_WINDOW_MS;
  if (startingMarker) {
    assertMarker(startingMarker, 'getCurrentMemberSession');
    assert.ok(startingMarker.requestCount <= P631_MEMBER_READ_LIMIT);
  }
  const beganAt = now();
  let successfulReads = 0, denied;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const reply = await member.callable('getCurrentMemberSession', { sessionId });
    if (reply?.status === 'denied') { denied = reply; break; }
    assert.equal(reply?.status, 'committed');
    assert.equal(reply.result?.type, 'current-member-session');
    assert.equal(reply.result?.sessionMatches, true);
    assert.equal(reply.result?.actorMatches, true,
      'Each ordinary SDK response must remain bound to the original member Auth UID.');
    successfulReads++;
  }
  assert.equal(rateDenied(denied), true,
    'The original ordinary member must hit RESOURCE_EXHAUSTED before the bounded request loop ends.');
  assert.ok(now() - beganAt < P631_RATE_WINDOW_MS,
    'All explicit member reads must remain inside the original 60-second budget.');
  const exhaustedMarker = assertMarker(await readMemberMarker(), 'getCurrentMemberSession');
  assert.equal(exhaustedMarker.requestCount, P631_MEMBER_READ_LIMIT);
  if (initialWindowStillOpen) assert.equal(exhaustedMarker.windowStartedAtMs, startingMarker.windowStartedAtMs,
    'The original member rate window must not reset during the focused run.');
  else assert.ok(exhaustedMarker.windowStartedAtMs >= beganAt - 1_000 && exhaustedMarker.windowStartedAtMs <= now(),
    'The complete current-member saturation must use one live 60-second window.');
  assert.ok(denied.details.retryAfterSeconds >= 1);
  assertOriginalWindowLive(exhaustedMarker, 'member read', now);

  const gmReply = await gm.callable('getCurrentMemberSession', { sessionId });
  assertOriginalWindowLive(exhaustedMarker, 'member read', now);
  assert.equal(gmReply?.status, 'committed', 'The original same-network GM must retain its own read budget.');
  assert.equal(gmReply.result?.type, 'current-member-session');
  assert.equal(gmReply.result?.sessionMatches, true);
  assert.equal(gmReply.result?.actorMatches, true);
  const memberMarkerAfterGm = assertMarker(await readMemberMarker(), 'getCurrentMemberSession');
  assert.equal(memberMarkerAfterGm.requestCount, exhaustedMarker.requestCount,
    'The original member marker must not reset while verifying the same-session GM result.');
  assert.equal(memberMarkerAfterGm.windowStartedAtMs, exhaustedMarker.windowStartedAtMs,
    'The same exhausted member window must remain authoritative through GM verification.');
  assertOriginalWindowLive(memberMarkerAfterGm, 'member read', now);
  const gmMarker = assertMarker(await readGmMarker(), 'getCurrentMemberSession');
  assertOriginalWindowLive(memberMarkerAfterGm, 'member read', now);
  assert.ok(gmMarker.requestCount < P631_MEMBER_READ_LIMIT);
  assert.notEqual(gmMarker.identityHash, exhaustedMarker.identityHash,
    'Same-network actors must use distinct UID-bound marker identities.');

  return {
    preexistingMemberRequestCount: startingMarker?.requestCount ?? 0,
    explicitSuccessfulReads: successfulReads,
    memberLimitReached: exhaustedMarker.requestCount,
    retryAfterSeconds: denied.details.retryAfterSeconds,
    memberWindowStartedAtMs: exhaustedMarker.windowStartedAtMs,
    gmSameSessionReadSucceeded: true,
    gmMarkerCount: gmMarker?.requestCount ?? null,
    distinctUidMarkerHashes: true,
  };
}

const logKeys = new Set(['type', 'schemaVersion', 'callableName', 'code', 'category',
  'actorHash', 'sessionHash', 'requestHash', 'redactionPolicy']);

/** Extract only the application denial payload from structured Functions logs. */
export function parseP631SecurityDenialRecords(text) {
  assert.equal(typeof text, 'string');
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    const start = line.indexOf('{');
    if (start < 0) continue;
    let outer;
    try { outer = JSON.parse(line.slice(start)); } catch { continue; }
    const record = outer?.jsonPayload?.type === 'security-denial' ? outer.jsonPayload : outer;
    if (record?.type !== 'security-denial') continue;
    const keys = Object.keys(record);
    const loggerEnvelopeFields = new Set(['severity', 'message', 'time', 'timestamp']);
    const extraFields = keys.filter(key => {
      if (logKeys.has(key)) return false;
      if (key === 'severity') return record[key] !== 'WARNING';
      if (key === 'message') return record[key] !== 'Callable security denial';
      if (key === 'time' || key === 'timestamp') return typeof record[key] !== 'string';
      return !loggerEnvelopeFields.has(key);
    }).sort();
    records.push({
      type: record.type,
      schemaVersion: record.schemaVersion,
      callableName: record.callableName,
      code: record.code,
      category: record.category,
      ...(Object.hasOwn(record, 'actorHash') ? { actorHash: record.actorHash } : {}),
      ...(Object.hasOwn(record, 'sessionHash') ? { sessionHash: record.sessionHash } : {}),
      ...(Object.hasOwn(record, 'requestHash') ? { requestHash: record.requestHash } : {}),
      redactionPolicy: record.redactionPolicy,
      extraFields,
    });
  }
  return records;
}

/** Require the two scoped rate-denial logger records to contain hashes and allowlisted fields only. */
export function assertP631RateDenialRecords(records, expected) {
  assert.ok(Array.isArray(records));
  const summaries = [];
  for (const item of expected) {
    const matches = records.filter(record => record.callableName === item.callableName &&
      record.actorHash === item.actorHash && record.sessionHash === item.sessionHash &&
      record.code === 'resource-exhausted' && record.category === 'rate-limit');
    assert.ok(matches.length >= 1, `Missing scoped ${item.callableName} rate-denial log record.`);
    let exactRequestHashFound = item.requestHash === undefined;
    for (const record of matches) {
      assert.equal(record.type, 'security-denial');
      assert.equal(record.schemaVersion, 1);
      assert.equal(record.redactionPolicy, 'security-denial-hashed-metadata-v1');
      assert.deepEqual(record.extraFields, [], 'Denial logs must not include arbitrary request/body fields.');
      assert.match(record.actorHash ?? '', /^[a-f0-9]{64}$/);
      assert.match(record.sessionHash ?? '', /^[a-f0-9]{64}$/);
      if (Object.hasOwn(record, 'requestHash')) {
        assert.match(record.requestHash ?? '', /^[a-f0-9]{64}$/,
          'An optional requestHash must be a 64-character hash.');
        if (item.requestHash === undefined) {
          assert.fail('Current-member denial records must omit requestHash for the one-field callable payload.');
        }
        if (record.requestHash === item.requestHash) exactRequestHashFound = true;
      }
    }
    assert.equal(exactRequestHashFound, true,
      `Scoped ${item.callableName} preparation denial must include the expected request hash.`);
    const record = matches.find(candidate => item.requestHash === undefined || candidate.requestHash === item.requestHash);
    summaries.push(Object.fromEntries(['callableName', 'code', 'category', 'actorHash', 'sessionHash',
      ...(item.requestHash === undefined ? [] : ['requestHash']), 'redactionPolicy']
      .filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]])));
  }
  return summaries;
}

/** Run the real proof stages and always close/delete owned resources, preserving the first failure. */
export async function runP631OwnedJourney({
  prepareGmAndOriginal, saturatePreparation, admitMember, saturateMemberReads,
  verifyPrivateMarkerDenials, verifyRateDenialLogs, cleanup,
} = {}) {
  for (const [name, action] of Object.entries({ prepareGmAndOriginal, saturatePreparation,
    admitMember, saturateMemberReads, verifyPrivateMarkerDenials, verifyRateDenialLogs, cleanup })) {
    assert.equal(typeof action, 'function', `${name} must be supplied by the owned runner.`);
  }
  let result, primaryError, hasPrimaryError = false, cleanupError;
  try {
    const gmContext = await prepareGmAndOriginal();
    const preparation = await saturatePreparation(gmContext);
    const memberContext = await admitMember(gmContext);
    const memberRead = await saturateMemberReads(gmContext, memberContext);
    const privateMarkerReads = await verifyPrivateMarkerDenials(gmContext, memberContext);
    const rateDenialLogs = await verifyRateDenialLogs(gmContext, memberContext);
    result = { preparation, memberRead, privateMarkerReads, rateDenialLogs };
  } catch (error) {
    primaryError = error; hasPrimaryError = true;
  }
  try { await cleanup(hasPrimaryError ? primaryError : null); }
  catch (error) { cleanupError = error; }
  if (hasPrimaryError) {
    if (cleanupError && primaryError && ['object', 'function'].includes(typeof primaryError)) {
      Object.defineProperty(primaryError, 'p631CleanupError', { value: cleanupError, configurable: true });
    }
    throw primaryError;
  }
  if (cleanupError) throw cleanupError;
  return result;
}

export function p631LoggerHash(kind, value) {
  assert.ok(['actor', 'session', 'request'].includes(kind));
  assert.equal(typeof value, 'string');
  return identityHash(kind, value);
}
