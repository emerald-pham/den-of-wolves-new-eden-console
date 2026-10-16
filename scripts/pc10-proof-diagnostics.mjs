import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// Only names used by this proof or its normal client/GM lifecycle are recorded.
// The three receipt actions below are the exact server fingerprint spellings.
export const PC10_PROOF_CALLABLE_ACTIONS = Object.freeze({
  createSession: 'create-session', claimGmInstance: 'claim-gm-instance',
  confirmSetup: 'confirm-setup', assignRole: 'assign-role', claimSeat: 'claim-seat',
  joinSession: 'join-session', resumeSession: 'resume-session',
  getCurrentMemberSession: 'read-current-member-session', refreshPresence: 'refresh-presence',
  getSessionPresence: 'read-session-presence', disconnectFromSession: 'disconnect-session',
  startGame: 'start-game', clearTurnAdvanceInterstitial: 'clear-turn-advance-interstitial',
  readFleetGroupNavigation: 'read-fleet-group-navigation', readFleetGroupMessages: 'read-fleet-group-messages',
  listGmScoutResolutionLog: 'read-gm-scout-resolution-log',
  sendFleetGroupMessage: 'send-fleet-group-message', publishPressDispatch: 'publish-press-dispatch',
});

// Matches the canonical source ID syntax; never hash arbitrary request values.
const isId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = (kind, value) => isId(value)
  ? createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex') : null;
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const action = name => Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, name) ? PC10_PROOF_CALLABLE_ACTIONS[name] : null;
const denialCodes = new Set(['unauthenticated', 'permission-denied', 'invalid-argument', 'resource-exhausted',
  'failed-precondition', 'not-found', 'aborted', 'unavailable', 'deadline-exceeded', 'internal', 'cancelled']);

export function pc10SafeCallableOutcome(reply) {
  const raw = reply?.error?.status ?? reply?.error?.code;
  const normalized = typeof raw === 'string' ? raw.replace(/^functions\//, '').toLowerCase().replaceAll('_', '-') : null;
  return {
    status: Number.isInteger(reply?.status) && reply.status >= 100 && reply.status <= 599 ? reply.status
      : reply?.status === 'denied' ? 'denied' : null,
    resultStatus: ['committed', 'replayed'].includes(reply?.result?.status) ? reply.result.status : null,
    revision: integer(reply?.result?.revision),
    denialCode: denialCodes.has(normalized) ? normalized : null,
  };
}

/** Issued records exist before any response; bodies/credentials stay in memory. */
export function createPc10CallableTrace({ name, transport, data, actorUid, startedAt } = {}) {
  if (!action(name)) return null;
  assert.ok(['authenticated-emulator-HTTP', 'independent-browser-SDK'].includes(transport));
  assert.ok(Number.isFinite(startedAt) && startedAt >= 0);
  return { name, action: action(name), transport, startedAt, issuedAt: startedAt,
    requestHash: hash('request', data?.requestId), actorHash: hash('actor', actorUid),
    sessionHash: hash('session', data?.sessionId), groupHash: hash('group', data?.expectedGroupId),
    headersReceivedAt: null, bodyCompletedAt: null, requestFinishedAt: null, requestFailedAt: null,
    completedAt: null, durationMs: null, status: null, resultStatus: null, revision: null,
    denialCode: null, failureCategory: null };
}

/** Each timestamp measures its own actual event. Failed body observation is
 * distinct from a network failure and cannot turn headers into completion. */
export function observePc10CallableTrace(trace, { stage, at, status, reply } = {}) {
  assert.ok(trace && action(trace.name));
  assert.ok(Number.isFinite(at) && at >= trace.issuedAt);
  if (stage === 'headers') {
    trace.headersReceivedAt = at;
    trace.status = pc10SafeCallableOutcome({ status }).status;
  } else if (stage === 'finished') trace.requestFinishedAt = at;
  else if (stage === 'failed') {
    trace.requestFailedAt = at;
    trace.failureCategory = 'network-request-failed';
  } else if (stage === 'body-unavailable') {
    trace.bodyObservationFailedAt = at;
    trace.failureCategory = 'response-observation-unavailable';
  } else if (stage === 'body') {
    trace.bodyCompletedAt = at;
    trace.completedAt = at;
    trace.durationMs = at - trace.issuedAt;
    const outcome = pc10SafeCallableOutcome({ ...reply, status: trace.status ?? reply?.status });
    Object.assign(trace, outcome);
  } else assert.fail('Unrecognized callable observation stage.');
  return trace;
}

export function pc10MessageCohortSize(value = 7) {
  assert.ok((typeof value === 'number' && Number.isInteger(value)) ||
    (typeof value === 'string' && /^[0-9]+$/.test(value)), 'Message cohort must be an integer from 2 to 20.');
  const size = Number(value);
  assert.ok(size >= 2 && size <= 20, 'Message cohort must be an integer from 2 to 20.');
  return size;
}

function receiptFingerprint({ name, actorUid, data }) {
  const base = { action: action(name), sessionId: data.sessionId, requestId: data.requestId,
    actorUid, instanceId: null };
  if (name === 'sendFleetGroupMessage') return { ...base, expectedRevision: null,
    payload: { groupId: data.expectedGroupId, text: data.text } };
  if (name === 'claimSeat') return { ...base, expectedRevision: data.expectedSetupRevision,
    payload: { seatId: data.seatId } };
  if (name === 'publishPressDispatch') return { ...base, expectedRevision: data.expectedRevision,
    payload: { text: data.text } };
  return null;
}

/** A point-in-time diagnostic, never an assertion that an in-flight request
 * cannot commit later. No broad query, clock/presence update or private export. */
export async function capturePc10AuthoritativeFailureSnapshot({ db, project, emulatorHost = process.env.FIRESTORE_EMULATOR_HOST,
  sessionId, gm, players = [], press, roles = [], requests = [], now = Date.now } = {}) {
  assert.match(project ?? '', /^demo-[a-z0-9-]+$/, 'Failure snapshots require a local demo project.');
  assert.match(emulatorHost ?? '', /^(?:127\.0\.0\.1|localhost):[0-9]+$/, 'Failure snapshots require a loopback emulator.');
  assert.ok(isId(sessionId), 'Failure snapshots require a canonical own session.');
  const actors = [...(gm ? [gm] : []), ...players, ...(press ? [press] : [])];
  assert.ok(actors.length > 0 && actors.every(actor => isId(actor?.localId)), 'Only known fixture actors may be inspected.');
  const actorUids = new Set(actors.map(actor => actor.localId));
  assert.equal(actorUids.size, actors.length, 'Fixture actors must have independent identities.');
  assert.ok(roles.every(isId), 'Only known fixture seats may be inspected.');
  const knownRequests = new Map();
  for (const request of requests) {
    assert.ok(actorUids.has(request.actorUid), 'Receipt witness actor must belong to this fixture.');
    assert.equal(request.data?.sessionId, sessionId, 'Receipt witness must belong to this fixture session.');
    if (!['claimSeat', 'sendFleetGroupMessage', 'publishPressDispatch'].includes(request.name)) continue;
    assert.ok(isId(request.data.requestId), 'Receipt witness must have a canonical request.');
    const fingerprint = receiptFingerprint(request);
    const key = JSON.stringify(fingerprint); // Private comparison key remains in memory.
    const prior = knownRequests.get(key);
    if (!prior || request.reply?.status === 200) knownRequests.set(key, { ...request, fingerprint });
  }
  const witnesses = [...knownRequests.values()];
  const rootPath = `sessions/${sessionId}`;
  const startedAt = now();
  const evidence = await db.runTransaction(async tx => {
    const paths = [...new Set([rootPath,
      ...actors.flatMap(actor => [`${rootPath}/players/${actor.localId}`, `activeMemberships/${actor.localId}`]),
      ...roles.map(role => `${rootPath}/seats/${role}`),
      ...witnesses.map(request => `${rootPath}/commandReceipts/${request.data.requestId}`),
    ])];
    const points = new Map(await Promise.all(paths.map(async path => [path, await tx.get(db.doc(path))])));
    const root = points.get(rootPath);
    const groupIds = [...new Set(actors.map(actor => points.get(`${rootPath}/players/${actor.localId}`).get('fleetGroupId'))
      .filter(value => typeof value === 'string' && /^fleet-[1-9][0-9]*$/.test(value)))];
    const groupHistories = await Promise.all(groupIds.map(async groupId => {
      const history = await tx.get(db.doc(`${rootPath}/fleetGroupMessages/${groupId}`));
      const stored = history.get('messages');
      const messages = Array.isArray(stored) ? stored : [];
      const requested = witnesses.filter(request => request.name === 'sendFleetGroupMessage' &&
        request.data.expectedGroupId === groupId);
      return { groupHash: hash('group', groupId), exists: history.exists,
        messageCount: Array.isArray(stored) ? stored.length : null,
        knownRequestedMessageCount: requested.filter(request => messages.some(message => record(message) &&
          message.id === request.data.requestId && message.actorUid === request.actorUid &&
          message.text === request.data.text)).length };
    }));
    return { sessionExists: root.exists,
      phase: ['lobby', 'setup', 'active', 'debrief', 'closed'].includes(root.get('phase')) ? root.get('phase') : null,
      cycle: integer(root.get('currentTurn')), actorCount: actors.length,
      connectedActorCount: actors.filter(actor => points.get(`${rootPath}/players/${actor.localId}`).get('connected') === true).length,
      existingPlayerDocumentCount: actors.filter(actor => points.get(`${rootPath}/players/${actor.localId}`).exists).length,
      sameSessionMembershipCount: actors.filter(actor => points.get(`activeMemberships/${actor.localId}`).get('sessionId') === sessionId).length,
      ownSeatHolderCount: roles.filter((role, index) => {
        const seat = points.get(`${rootPath}/seats/${role}`);
        return seat.exists && seat.get('status') === 'claimed' && seat.get('holderUid') === players[index]?.localId;
      }).length,
      receipts: witnesses.map(request => {
        const receipt = points.get(`${rootPath}/commandReceipts/${request.data.requestId}`);
        return { name: request.name, action: action(request.name), actorHash: hash('actor', request.actorUid),
          requestHash: hash('request', request.data.requestId), exists: receipt.exists,
          fingerprintMatches: receipt.exists ? isDeepStrictEqual(receipt.get('fingerprint'), request.fingerprint) : null,
          observedSuccessfulReplyMatches: receipt.exists && request.reply?.status === 200
            ? isDeepStrictEqual(receipt.get('result'), request.reply.result) : null };
      }), groupHistories };
  }, { readOnly: true });
  return { schemaVersion: 1, kind: 'pre-cleanup-authoritative-readonly',
    sessionHash: hash('session', sessionId), startedAt, completedAt: now(), ...evidence,
    limitation: 'Point-in-time evidence; an in-flight request may commit after this observation.' };
}

/** Diagnostics are secondary to the original error. Evidence is attempted
 * before caller-owned cleanup, including when a diagnostic is unavailable. */
export async function observePc10FailureBeforeCleanup(error, { snapshot, identity, rate, writeEvidence } = {}) {
  const diagnosticFailures = [];
  for (const [callback, category] of [[snapshot, 'authoritative-snapshot-unavailable'],
    [identity, 'identity-diagnostic-unavailable'], [rate, 'rate-diagnostic-unavailable']]) {
    try { if (callback) await callback(); } catch { diagnosticFailures.push(category); }
  }
  try { if (writeEvidence) await writeEvidence({ diagnosticFailures }); }
  catch { error.pc10FailureEvidenceUnavailable = true; }
  return error;
}
