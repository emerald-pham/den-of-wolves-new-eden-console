import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPc10CallableObservationBoundary } from './pc10-browser-session-proof.mjs';
import { createPc10NativeDurableObservationLedger } from './pc10-native-durable-observer.mjs';
import { assessPc10FunctionalTransport, createPc10FunctionalCommand } from './pc10-gate2-functional-proof.mjs';

// Reuse the real producer, lifecycle boundary, original-command wrapper and
// functional qualifier. Only their I/O and clock ports are inert. A synthetic
// unsigned local Auth envelope follows the existing native fixture; no browser,
// SDK, database, historical response or historical run is executed here.
const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const documentId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const documentHash = createHash('sha256').update(`pc10-native-durable-document\0${documentId}`).digest('hex');
const functionsOrigin = 'http://127.0.0.1:5011', projectId = 'demo-native-request-clock';
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function fixture({ status = 403, bodyReason = 'No data found for resource with given identifier' } = {}) {
  let clock = 1000, sdkCalls = 0, serial = 0, timerId = 0;
  const now = () => { const sample = clock; clock += 6; return sample; };
  const commands = [], observations = [], failures = [], drains = [], reads = [], timers = new Map();
  const original = { roleId: 'dione-engineer', uid: 'clock-original-actor', sessionId: 'clock-original-session',
    contextHash: digest('context', 'clock-original-context'), scope: { groupId: 'fleet-1', vesselIds: ['dione'], craftIds: [] } };
  const originals = new Map([[original.roleId, original]]), invocations = new WeakMap();
  const native = createPc10NativeDurableObservationLedger({ label: original.roleId, projectId, functionsOrigin,
    observedCalls: observations, failures, boundaryFactory: createPc10CallableObservationBoundary, now,
    readBody: id => { reads.push(id); return Promise.reject(new Error(`Protocol error (Network.getResponseBody): ${bodyReason}`)); },
    timeoutPort: { setTimeout: (callback, duration) => { timers.set(++timerId, { callback, duration }); return timerId; },
      clearTimeout: id => timers.delete(id) } });
  native.nativeFrame({ frame: { id: 'main-frame' } });
  native.nativeContext({ context: { id: 1, uniqueId: 'original-context', auxData: { isDefault: true, frameId: 'main-frame' } } });
  native.nativeScript({ scriptId: 'original-script', executionContextId: 1, url: 'pc10-native-durable-init.js' });
  native.nativeDocument({ name: '__pc10NativeDurableDocumentWitness', executionContextId: 1,
    payload: JSON.stringify({ schemaVersion: 1, documentId }) });
  native.bindIdentity(original.uid, original.sessionId);
  const binding = () => ({ authUid: original.uid, storeUid: original.uid, sessionId: original.sessionId,
    assignedRoleId: original.roleId, activeConsoleRoleId: original.roleId, seatId: original.roleId,
    contextHash: original.contextHash, nativeDocumentHash: documentHash, online: true, observedAt: now() });
  const source = () => {
    const checkedAt = now();
    return { roleId: original.roleId, uid: original.uid, sessionId: original.sessionId, checkedAt,
      sourceHash: digest('source', 'unchanged-current-authority'), phase: 'active', currentTurn: 1,
      connected: true, nonKicked: true, playerRole: 'player', assignedRoleId: original.roleId,
      activeConsoleRoleId: original.roleId, seatId: original.roleId, generation: 3,
      groupId: original.scope.groupId, vesselIds: [...original.scope.vesselIds], craftIds: [],
      sameMembership: true, seatHolderUid: original.uid, seatStatus: 'claimed',
      noReplacementOrEscape: true, configuredRoleMatches: true,
      presence: { roleId: original.roleId, actorHash: digest('actor', original.uid),
        sessionHash: digest('session', original.sessionId), projectHash: digest('project', projectId),
        checkedAt, originalUidMatches: true, sameSessionMembership: true } };
  };
  const client = {
    async callable(name, data, options) {
      assert.deepEqual(options, { retainPresenceAuthority: true }); sdkCalls++;
      const invocation = { kind: 'explicit-sdk-invocation', roleId: original.roleId, name, startedAt: now(),
        completedAt: null, nativeDocumentHash: documentHash };
      const id = `original-request-${++serial}`, encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${encode({ alg: 'none' })}.${encode({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`,
        sub: original.uid, user_id: original.uid, iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
      const url = `${functionsOrigin}/${projectId}/us-central1/${name}`;
      native.network('request', { requestId: id, frameId: 'main-frame', loaderId: 'original-loader',
        initiator: { type: 'script', stack: { callFrames: [{ functionName: 'pc10NativeDurableFetch', scriptId: 'original-script' }] } },
        request: { url, method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          postData: JSON.stringify({ data }) } });
      native.network('headers', { requestId: id, response: { url, status, headers: { 'content-type': 'application/json' } } });
      native.network('finished', { requestId: id, encodedDataLength: 100 });
      await nextTurn();
      invocation.completedAt = now();
      const reply = { status: 'denied', error: { code: 'functions/permission-denied' } };
      invocations.set(reply, invocation); return reply;
    },
    sdkInvocationForReply: reply => invocations.get(reply),
  };
  const command = createPc10FunctionalCommand({ ledger: commands, originals,
    clients: new Map([[original.roleId, client]]), observeBinding: binding, captureAuthority: source,
    clock: now, validateReply: entry => ({ passed: entry.reply.error.code === 'functions/permission-denied',
      expectedDenial: entry.expectedDenial }) });
  const run = async (count = 1) => {
    for (let index = 0; index < count; index++) await command(original.roleId, 'listGmScoutResolutionLog',
      { instanceId: 'pc07-local-proof' }, { expectedDenial: 'permission-denied' });
    await assert.rejects(native.drain(), /Native durable issued-set evidence is unavailable/);
    drains.push({ roleId: original.roleId, outcome: 'failed' });
    await nextTurn(); assert.equal(timers.size, 0, 'All inert body/drain timers close on the original failure path.');
    assert.equal(sdkCalls, count); assert.equal(reads.length, count); assert.equal(observations.length, count);
    return { commands, observations, failures, drains, originals };
  };
  return { run };
}

function assessUnchanged(input) {
  const before = JSON.stringify(input), result = assessPc10FunctionalTransport(input);
  assert.equal(JSON.stringify(input), before, 'Qualification cannot rewrite original commands or native records.');
  return result;
}

test('advancing clock in the real original request callback preserves one source-bound semantic denial with an unread body', async () => {
  const input = await fixture().run(), result = assessUnchanged(input), raw = input.observations[0], command = input.commands[0];
  assert.equal(result.functionalStatus, 'PASSED'); assert.deepEqual(result.hardFailures, []);
  assert.equal(raw.startedAt, raw.issuedAt); assert.equal(raw.nativeRequestObservedAt, raw.issuedAt);
  assert.equal(raw.status, 403); assert.equal(raw.bodyCompletedAt, null); assert.equal(raw.denialCode, null);
  assert.equal(raw.bodyHash, undefined); assert.equal(raw.requestHash, null); assert.equal(raw.requestFailedAt, null);
  assert.equal(raw.bodyFailureStage, 'native-get-response-body'); assert.equal(raw.bodyReadFailureReason, 'body-unavailable');
  assert.equal(raw.nativeDocumentHash, command.invocation.nativeDocumentHash);
  assert.ok(raw.headersReceivedAt > raw.issuedAt); assert.ok(raw.requestFinishedAt > raw.headersReceivedAt);
  assert.ok(command.invocation.completedAt >= raw.requestFinishedAt);
  assert.deepEqual(Object.keys(command.invocation).sort(),
    ['completedAt', 'kind', 'name', 'nativeDocumentHash', 'roleId', 'startedAt']);
  assert.deepEqual(command.reply, { status: 'denied', error: { code: 'functions/permission-denied' } });
  assert.equal(input.failures.length, 1); assert.equal(result.strictTransportStatus, 'INCOMPLETE');
  assert.equal(result.passivePrivacyStatus, 'UNINSPECTED'); assert.equal(result.commandedPrivacyStatus, 'NOT_PROVED');
  assert.equal(result.instrumentationLimits[0].wireBodyStatus, 'UNINSPECTED');
  assert.deepEqual(result.instrumentationLimits[0].semanticExpectedDenial,
    { commandId: command.commandId, code: 'permission-denied', httpStatus: 403 });
});

test('separate advancing-clock original callbacks retain distinct request samples and one-to-one SDK windows', async () => {
  const input = await fixture().run(2), result = assessUnchanged(input);
  assert.equal(result.functionalStatus, 'PASSED'); assert.equal(result.instrumentationLimits.length, 2);
  const [first, second] = input.observations;
  assert.notEqual(first.protocolRequestHash, second.protocolRequestHash);
  assert.ok(second.issuedAt > first.requestFinishedAt);
  for (const raw of input.observations) assert.equal(raw.nativeRequestObservedAt, raw.issuedAt);
});

for (const [label, mutate] of [
  ['a contradictory native request timestamp', input => { input.observations[0].nativeRequestObservedAt++; }],
  ['a changed original Auth UID', input => { input.commands[0].afterBinding.authUid = 'foreign-actor'; }],
  ['a changed source SID', input => { input.commands[0].afterSource.sessionId = 'foreign-session'; }],
  ['a replaced within-invocation document', input => { input.commands[0].invocation.nativeDocumentHash = 'f'.repeat(64); }],
  ['an unknown original SDK completion', input => { input.commands[0].completedAt = null; }],
]) test(`${label} remains hard under the unchanged functional qualifier`, async () => {
  const input = await fixture().run(); mutate(input);
  assert.equal(assessUnchanged(input).functionalStatus, 'FAILED');
});

for (const status of [500, 503]) test(`HTTP${status} cannot inherit a matching original SDK permission denial`, async () => {
  const input = await fixture({ status }).run(), result = assessUnchanged(input);
  assert.equal(result.functionalStatus, 'FAILED');
  assert.ok(result.hardFailures.some(value => value.category === 'unclassified-native-http-outcome' && value.status === status));
});

test('a different unavailable-body reason remains hard with a correctly sampled request', async () => {
  const input = await fixture({ bodyReason: 'No resource with given identifier found' }).run();
  assert.equal(input.observations[0].bodyReadFailureReason, 'resource-not-found');
  assert.equal(assessUnchanged(input).functionalStatus, 'FAILED');
});
