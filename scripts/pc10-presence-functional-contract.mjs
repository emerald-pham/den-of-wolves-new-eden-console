import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { PC10_PROOF_CALLABLE_ACTIONS } from './pc10-proof-diagnostics.mjs';

export const PC10_PRESENCE_FUNCTIONAL_CONTRACT = 'background-presence-with-live-authority-v1';
const require = createRequire(import.meta.url);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hashed = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0;
const generation = value => Number.isSafeInteger(value) && value >= 1;
const digest = (kind, value) => canonical(value)
  ? createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex') : null;
const knownRole = value => require('../functions/lib/roleConfiguration.js').ROLE_IDS.includes(value);
const millis = value => {
  try { const result = value?.toMillis?.(); return time(result) ? result : null; } catch { return null; }
};
const phase = value => ['lobby', 'setup', 'active', 'debrief', 'closed'].includes(value) ? value : null;
function configuredRoleMatches(root, roleId) {
  if (roleId === 'press-officer') return root.get('pressEnabled') !== false;
  const { ROLE_IDS, recommendedRoleIds, isJointEngineeringRoleId, isJointEngineeringRoleAvailable } = require('../functions/lib/roleConfiguration.js');
  const stored = root.get('activeRoleIds'), count = root.get('playerCount');
  const roles = (Array.isArray(stored) ? ROLE_IDS.filter(role => stored.includes(role))
    : recommendedRoleIds(Number.isSafeInteger(count) && count >= 8 && count <= 20 ? count : 18)).filter(role => role !== 'press-officer');
  return roles.includes(roleId) && (!isJointEngineeringRoleId(roleId) || isJointEngineeringRoleAvailable(roles, roleId));
}

export function validatePc10PresenceFunctionalContract(option) {
  if (option !== undefined && option !== PC10_PRESENCE_FUNCTIONAL_CONTRACT) {
    throw new TypeError('Unsupported presence functional contract.');
  }
  return option === PC10_PRESENCE_FUNCTIONAL_CONTRACT;
}

/** A projection of the ACTUAL validated native request, never a cadence guess.
 * Only the ordinary player's exact periodic payload can be background. Null,
 * defined console claims, GM leases and unknown fields do not qualify. */
export function classifyPc10PresenceRequest(metadata, postData) {
  if (metadata?.matched !== true || metadata.failureStage || metadata.name !== 'refreshPresence' ||
      !canonical(metadata.sessionId) || typeof postData !== 'string' || Buffer.byteLength(postData) > 512 * 1024) return 'unclassified';
  let envelope;
  try { envelope = JSON.parse(postData); } catch { return 'unclassified'; }
  if (!record(envelope) || Object.keys(envelope).join('|') !== 'data' || !record(envelope.data) ||
      envelope.data.sessionId !== metadata.sessionId) return 'unclassified';
  const keys = Object.keys(envelope.data).sort().join('|');
  if (keys === 'sessionId') return 'periodic-session-only';
  if (keys === 'activeConsoleRoleId|sessionId' && (envelope.data.activeConsoleRoleId === null ||
      knownRole(envelope.data.activeConsoleRoleId))) return 'console-claim';
  return 'unclassified';
}

/** Record the ORIGINAL SDK result. This does not infer any missing background
 * result, dispatch another request or copy arbitrary errors/private fields. */
export function buildPc10PresenceSdkRenewal({ roleId, actorUid, sessionId, project, startedAt, completedAt,
  generationBefore, nativeDocumentHash, reply }) {
  const result = reply?.result;
  const schemaValid = record(result) && Object.keys(result).every(key => ['sessionId', 'stationSelectionRequired'].includes(key)) &&
    canonical(result.sessionId) && (!Object.hasOwn(result, 'stationSelectionRequired') || typeof result.stationSelectionRequired === 'boolean');
  return Object.freeze({ schemaVersion: 1, kind: 'original-explicit-sdk-presence-renewal',
    roleId: knownRole(roleId) ? roleId : null, actorHash: digest('actor', actorUid), sessionHash: digest('session', sessionId),
    projectHash: digest('project', project), startedAt: time(startedAt) ? startedAt : null,
    completedAt: time(completedAt) && completedAt >= startedAt ? completedAt : null,
    generationBefore: generation(generationBefore) ? generationBefore : null,
    nativeDocumentHash: hashed(nativeDocumentHash) ? nativeDocumentHash : null,
    status: reply?.status === 200 ? 200 : 'denied', originalSdkSchemaValid: Boolean(schemaValid),
    originalSdkSessionMatches: Boolean(schemaValid && result.sessionId === sessionId),
    stationSelectionRequired: schemaValid ? result.stationSelectionRequired === true : null });
}

/** Existing emulator read-only point technique, restricted to this fixture's
 * known actors. It captures live lease/generation and the canonical own seat
 * (or Press holder), without a callable getter or any state/clock writes. */
export async function capturePc10PresenceAuthority({ db, project, emulatorHost = process.env.FIRESTORE_EMULATOR_HOST,
  sessionId, actors, now = Date.now, timeoutPort = { setTimeout, clearTimeout } }) {
  if (!/^demo-[a-z0-9-]+$/.test(project ?? '') || !/^(?:127\.0\.0\.1|localhost):[0-9]+$/.test(emulatorHost ?? '') ||
      !canonical(sessionId) || !Array.isArray(actors) || !actors.length || actors.length > 21 ||
      !actors.every(actor => canonical(actor?.actorUid) && knownRole(actor.roleId)) ||
      new Set(actors.map(actor => actor.actorUid)).size !== actors.length || new Set(actors.map(actor => actor.roleId)).size !== actors.length) {
    throw new TypeError('Presence authority evidence requires known independent local fixture actors.');
  }
  const { PRESENCE_LEASE_MS } = require('../functions/lib/sessionLifecycle.js');
  const rootPath = `sessions/${sessionId}`;
  const startedAt = now();
  if (!time(startedAt)) throw new TypeError('Presence authority evidence requires a valid current time.');
  let timer, points;
  try { points = await Promise.race([db.runTransaction(async tx => {
    const paths = [rootPath, ...actors.flatMap(actor => [`${rootPath}/players/${actor.actorUid}`, `activeMemberships/${actor.actorUid}`,
      ...(actor.roleId === 'press-officer' ? [] : [`${rootPath}/seats/${actor.roleId}`])])];
    return new Map(await Promise.all(paths.map(async path => [path, await tx.get(db.doc(path))])));
  }, { readOnly: true }), new Promise((_, reject) => {
    timer = timeoutPort.setTimeout(() => reject(new Error('Presence authority observation budget exceeded.')), 10_000);
  })]); } finally { timeoutPort.clearTimeout(timer); }
  const checkedAt = now();
  if (!time(checkedAt)) throw new TypeError('Presence authority evidence requires a valid current time.');
  if (checkedAt - startedAt > 10_000 || checkedAt < startedAt) throw new Error('Presence authority observation budget exceeded.');
  const root = points.get(rootPath);
  return actors.map(({ roleId, actorUid }) => {
    const player = points.get(`${rootPath}/players/${actorUid}`), membership = points.get(`activeMemberships/${actorUid}`);
    const seat = roleId === 'press-officer' ? null : points.get(`${rootPath}/seats/${roleId}`);
    const press = roleId === 'press-officer';
    return Object.freeze({ schemaVersion: 1, kind: 'pc10-presence-authority-readonly', roleId,
      actorHash: digest('actor', actorUid), sessionHash: digest('session', sessionId), projectHash: digest('project', project),
      checkedAt, sessionExists: root.exists === true, phase: phase(root.get('phase')),
      cycle: time(root.get('currentTurn')) ? root.get('currentTurn') : null,
      playerExists: player.exists === true, originalUidMatches: player.id === actorUid,
      connected: player.get('connected') === true, nonKicked: player.get('kickedAt') == null,
      ordinaryPlayer: player.get('role') === 'player', sameSessionMembership: membership.exists === true && membership.get('sessionId') === sessionId,
      assignedRoleMatches: press ? player.get('assignedRoleId') == null && player.get('seatId') == null
        : player.get('assignedRoleId') === roleId && player.get('seatId') === roleId,
      activeConsoleMatches: player.get('activeConsoleRoleId') === roleId,
      ownStationAuthority: press ? root.get('pressEnabled') !== false && root.get('pressHolderUid') === actorUid
        : seat.exists === true && seat.get('roleId') === roleId && seat.get('status') === 'claimed' && seat.get('holderUid') === actorUid,
      noReplacementOrEscape: player.get('replacementStatus') == null && typeof player.get('replacementRoleId') !== 'string' && player.get('escapeState') == null,
      configuredRoleMatches: configuredRoleMatches(root, roleId),
      generation: generation(player.get('connectionGeneration')) ? player.get('connectionGeneration') : null,
      lastSeenAtMs: millis(player.get('lastSeenAt')), membershipConnectedAtMs: millis(membership.get('connectedAt')), leaseMs: PRESENCE_LEASE_MS });
  });
}

const hashes = ['actorHash', 'sessionHash', 'projectHash', 'protocolRequestHash', 'nativeDocumentHash',
  'nativeContextHash', 'nativeFrameHash', 'nativeLoaderHash'];
const sameActor = (left, right) => left.roleId === right.roleId && ['actorHash', 'sessionHash', 'projectHash'].every(key =>
  hashed(left[key]) && left[key] === right[key]);
const liveFlags = value => value.schemaVersion === 1 && value.kind === 'pc10-presence-authority-readonly' &&
  value.phase === 'active' && time(value.cycle) && ['sessionExists', 'playerExists', 'originalUidMatches', 'connected', 'nonKicked',
    'ordinaryPlayer', 'sameSessionMembership', 'assignedRoleMatches', 'activeConsoleMatches', 'ownStationAuthority',
    'noReplacementOrEscape', 'configuredRoleMatches'].every(key => value[key] === true) && generation(value.generation) &&
  time(value.checkedAt) && value.leaseMs === 45_000 && time(value.lastSeenAtMs) && value.lastSeenAtMs <= value.checkedAt &&
  value.checkedAt - value.lastSeenAtMs < value.leaseMs && time(value.membershipConnectedAtMs) && value.membershipConnectedAtMs <= value.checkedAt;
const originalRenewal = value => value.schemaVersion === 1 && value.kind === 'original-explicit-sdk-presence-renewal' &&
  knownRole(value.roleId) && ['actorHash', 'sessionHash', 'projectHash', 'nativeDocumentHash'].every(key => hashed(value[key])) &&
  value.status === 200 && value.originalSdkSchemaValid === true && value.originalSdkSessionMatches === true &&
  value.stationSelectionRequired === false && generation(value.generationBefore) && time(value.startedAt) &&
  time(value.completedAt) && value.completedAt >= value.startedAt;
const liveAfterRenewal = (value, renewal, minimumTime) => liveFlags(value) && sameActor(value, renewal) &&
  value.generation === renewal.generationBefore && value.checkedAt >= minimumTime && value.checkedAt >= renewal.completedAt &&
  value.lastSeenAtMs >= renewal.startedAt && value.membershipConnectedAtMs >= renewal.startedAt;

/** Strong cohort assertions apply even in strict mode with no body failure.
 * Returned SDK success and both actual read-only observations are required. */
export function assertPc10PresenceCohortWitnesses({ roleIds, before, renewals, after }) {
  if (!Array.isArray(roleIds) || !roleIds.length || new Set(roleIds).size !== roleIds.length ||
      ![before, renewals, after].every(values => Array.isArray(values) && values.length === roleIds.length)) {
    throw new Error('Original SDK cohort renewal and live own authority are required.');
  }
  for (const roleId of roleIds) {
    const pre = before.filter(value => value.roleId === roleId), sdk = renewals.filter(value => value.roleId === roleId),
      post = after.filter(value => value.roleId === roleId);
    if (pre.length !== 1 || sdk.length !== 1 || post.length !== 1 || !liveFlags(pre[0]) || !originalRenewal(sdk[0]) ||
        !sameActor(pre[0], sdk[0]) || sdk[0].generationBefore !== pre[0].generation || sdk[0].startedAt < pre[0].checkedAt ||
        !liveAfterRenewal(post[0], sdk[0], sdk[0].completedAt) || post[0].cycle !== pre[0].cycle) {
      throw new Error('Original SDK cohort renewal and live own authority are required.');
    }
  }
}
const overlaps = (start, end, candidate) => !time(start) ||
  (candidate.requestFinishedAt >= start && (!time(end) || candidate.issuedAt <= end));
const safeCategories = new Set(['response-observation-unavailable', 'observation-drain-timeout', 'native-identity-mismatch',
  'native-document-unavailable', 'native-document-conflict', 'unknown-callable-lifecycle', 'request-metadata-unavailable',
  'native-body-incomplete', 'native-unexpected-http-status', 'unexpected-request-failure', 'proof-command-unavailable']);
const safeFailure = (failure, category = failure?.category) => ({
  roleId: knownRole(failure?.roleId) ? failure.roleId : null,
  name: Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, failure?.name ?? '') ? failure.name : null,
  protocolRequestHash: hashed(failure?.protocolRequestHash) ? failure.protocolRequestHash : null,
  category: safeCategories.has(category) ? category : 'unclassified-observation-failure',
});
const safeAuthority = value => Object.fromEntries([
  'schemaVersion', 'kind', 'roleId', 'actorHash', 'sessionHash', 'projectHash', 'checkedAt', 'sessionExists', 'phase', 'cycle',
  'playerExists', 'originalUidMatches', 'connected', 'nonKicked', 'ordinaryPlayer', 'sameSessionMembership', 'assignedRoleMatches',
  'activeConsoleMatches', 'ownStationAuthority', 'noReplacementOrEscape', 'configuredRoleMatches', 'generation', 'lastSeenAtMs', 'membershipConnectedAtMs', 'leaseMs',
].map(key => [key, value[key]]));
const safeRenewal = value => Object.fromEntries([
  'schemaVersion', 'kind', 'roleId', 'actorHash', 'sessionHash', 'projectHash', 'startedAt', 'completedAt', 'status', 'generationBefore',
  'nativeDocumentHash', 'originalSdkSchemaValid', 'originalSdkSessionMatches', 'stationSelectionRequired',
].map(key => [key, value[key]]));

/** Only bytes already captured from the original native member reader can
 * establish the generation preceding a background request. A later SDK/state
 * point, including recovery in the same document, cannot fill this gap. */
function precedingNativeMemberGeneration(observations, candidate) {
  const preceding = observations.filter(value => value.name === 'getCurrentMemberSession' &&
    value.captureMode === 'native-durable' && sameActor(value, candidate) && hashes.every(key => hashed(value[key])) &&
    ['nativeDocumentHash', 'nativeContextHash', 'nativeFrameHash', 'nativeLoaderHash'].every(key => value[key] === candidate[key]) &&
    value.protocolRequestHash !== candidate.protocolRequestHash && value.status === 200 && value.httpOutcome === 'result' &&
    value.resultActorHash === candidate.actorHash && value.resultSessionHash === candidate.sessionHash &&
    value.requestHash === null && value.resultRequestHash === null && hashed(value.bodyHash) &&
    Number.isSafeInteger(value.byteLength) && value.byteLength > 0 && value.byteLength <= 512 * 1024 &&
    time(value.issuedAt) && time(value.nativeRequestObservedAt) && value.nativeRequestObservedAt >= value.issuedAt &&
    time(value.headersReceivedAt) && value.headersReceivedAt >= value.nativeRequestObservedAt &&
    time(value.requestFinishedAt) && value.requestFinishedAt >= value.headersReceivedAt &&
    time(value.bodyCompletedAt) && value.bodyCompletedAt >= value.requestFinishedAt && value.bodyCompletedAt < candidate.issuedAt &&
    value.requestFailedAt === null && value.failureCategory === null && value.bodyFailureStage == null &&
    value.bodyReadFailureReason == null && value.denialCode === null && generation(value.connectionGeneration));
  const latest = preceding.reduce((found, value) => !found || value.bodyCompletedAt > found.bodyCompletedAt ? value : found, null);
  // Concurrent responses can arrive out of order. An older response finishing
  // later cannot hide a newer generation already observed before this request.
  if (!latest || preceding.some(value => value.connectionGeneration > latest.connectionGeneration)) return null;
  return latest;
}
const safePriorGeneration = value => ({ kind: 'completed-native-member-generation', name: value.name, roleId: value.roleId,
  ...Object.fromEntries(hashes.map(key => [key, value[key]])), issuedAt: value.issuedAt, headersReceivedAt: value.headersReceivedAt,
  requestFinishedAt: value.requestFinishedAt, bodyCompletedAt: value.bodyCompletedAt, bodyHash: value.bodyHash,
  byteLength: value.byteLength, generation: value.connectionGeneration, httpOutcome: value.httpOutcome,
  resultActorHash: value.resultActorHash, resultSessionHash: value.resultSessionHash });

/** Pure future-contract assessment. Raw traces/failures are never changed.
 * Strict transport remains failed for a missing body. Only this explicit
 * functional contract can separately report that instrumentation limitation. */
export function evaluatePc10PresenceInstrumentationContract({ option, observations = [], failures = [], renewals = [],
  authoritySnapshots = [], explicitSdkInvocations = [], actions = [] }) {
  const enabled = validatePc10PresenceFunctionalContract(option);
  if (![observations, failures, renewals, authoritySnapshots, explicitSdkInvocations, actions].every(Array.isArray)) {
    throw new TypeError('Presence functional evidence arrays are required.');
  }
  const hardFailures = [], instrumentationLimitations = [];
  for (const command of actions) {
    if (command.kind !== 'proof-command' || !time(command.commandIssuedAt) || !time(command.commandCompletedAt) ||
        command.commandCompletedAt < command.commandIssuedAt || command.commandFailedAt != null || command.failureCategory != null ||
        ![200, 'denied'].includes(command.status)) hardFailures.push(safeFailure(command, 'proof-command-unavailable'));
  }
  const validAuthority = (value, renewal, candidate) => sameActor(value, candidate) && liveAfterRenewal(value, renewal, candidate.requestFinishedAt);
  for (const failure of failures) {
    const candidates = observations.filter(value => value.roleId === failure.roleId &&
      hashed(failure.protocolRequestHash) && value.protocolRequestHash === failure.protocolRequestHash);
    const candidate = candidates.length === 1 ? candidates[0] : null;
    let pair;
    if (enabled && candidate && candidate.name === 'refreshPresence' && failure.name === 'refreshPresence' &&
        candidate.captureMode === 'native-durable' && knownRole(candidate.roleId) && hashes.every(key => hashed(candidate[key])) &&
        candidate.presenceRequestClassification === 'periodic-session-only' && candidate.status === 200 && failure.status === 200 &&
        time(candidate.nativeRequestObservedAt) && time(candidate.issuedAt) && time(candidate.requestFinishedAt) &&
        candidate.requestFinishedAt >= candidate.issuedAt && candidate.nativeRequestObservedAt >= candidate.issuedAt &&
        candidate.requestFailedAt === null && candidate.bodyCompletedAt === null && candidate.requestHash === null &&
        candidate.bodyFailureStage === 'native-get-response-body' && candidate.bodyReadFailureReason === 'body-unavailable' &&
        candidate.failureCategory === 'response-observation-unavailable' && failure.category === 'response-observation-unavailable' &&
        failure.bodyFailureStage === candidate.bodyFailureStage && failure.bodyReadFailureReason === candidate.bodyReadFailureReason &&
        !explicitSdkInvocations.some(value => value.roleId === candidate.roleId && overlaps(value.startedAt, value.completedAt, candidate)) &&
        !actions.some(value => value.roleId === candidate.roleId && overlaps(value.commandIssuedAt, value.commandCompletedAt, candidate))) {
      const prior = precedingNativeMemberGeneration(observations, candidate);
      for (const renewal of renewals) {
        if (!sameActor(renewal, candidate) || renewal.schemaVersion !== 1 || renewal.kind !== 'original-explicit-sdk-presence-renewal' ||
            renewal.status !== 200 || renewal.originalSdkSchemaValid !== true || renewal.originalSdkSessionMatches !== true ||
            renewal.stationSelectionRequired !== false || !generation(renewal.generationBefore) ||
            !prior || prior.connectionGeneration !== renewal.generationBefore ||
            renewal.nativeDocumentHash !== candidate.nativeDocumentHash || !time(renewal.startedAt) || !time(renewal.completedAt) ||
            renewal.completedAt < renewal.startedAt || !explicitSdkInvocations.some(value => value.roleId === renewal.roleId &&
              value.name === 'refreshPresence' && value.startedAt === renewal.startedAt && value.completedAt === renewal.completedAt) ||
            !actions.some(value => value.roleId === renewal.roleId && value.name === 'refreshPresence' && value.status === 200 &&
              value.commandIssuedAt <= renewal.startedAt && value.commandCompletedAt >= renewal.completedAt &&
              value.commandFailedAt == null && value.failureCategory == null)) continue;
        const authority = authoritySnapshots.find(value => validAuthority(value, renewal, candidate));
        if (authority) { pair = { renewal, authority, prior }; break; }
      }
    }
    if (!pair) { hardFailures.push(safeFailure(failure)); continue; }
    instrumentationLimitations.push({ kind: 'background-presence-body-instrumentation-limitation',
      roleId: candidate.roleId, name: candidate.name, ...Object.fromEntries(hashes.map(key => [key, candidate[key]])),
      presenceRequestClassification: candidate.presenceRequestClassification, issuedAt: candidate.issuedAt,
      requestFinishedAt: candidate.requestFinishedAt, status: 200, bodyCompletedAt: null,
      bodyFailureStage: candidate.bodyFailureStage, bodyReadFailureReason: candidate.bodyReadFailureReason,
      originalReplyReconstructed: false, priorGenerationWitness: safePriorGeneration(pair.prior),
      sdkRenewal: safeRenewal(pair.renewal), authoritativeState: safeAuthority(pair.authority) });
  }
  return { schemaVersion: 1, presenceFunctionalContract: option ?? null,
    strictTransportStatus: failures.length || hardFailures.length ? 'failed' : 'passed',
    functionalStatus: hardFailures.length ? 'failed' : 'passed', instrumentationLimitations, hardFailures,
    limitation: 'The missing background reply remains unavailable. This contract proves separate original SDK renewal and point-in-time live authority only.' };
}
