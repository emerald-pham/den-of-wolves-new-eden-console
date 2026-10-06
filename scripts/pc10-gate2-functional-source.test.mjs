import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { assessPc10FunctionalTransport, assertPc10FunctionalSourceOrder } from './pc10-gate2-functional-proof.mjs';

const original = { roleId: 'aegis-captain', uid: 'original-a', sessionId: 'original-session' };
const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const observation = (changes = {}) => ({ roleId: original.roleId, name: 'getCurrentMemberSession', status: 200,
  requestFinishedAt: 12, requestFailedAt: null, bodyCompletedAt: null, bodyHash: null,
  actorHash: digest('actor', original.uid), sessionHash: digest('session', original.sessionId),
  protocolRequestHash: '2'.repeat(64), nativeDocumentHash: 'a'.repeat(64), nativeContextHash: 'b'.repeat(64),
  nativeFrameHash: 'c'.repeat(64), nativeLoaderHash: 'd'.repeat(64),
  bodyFailureStage: 'native-get-response-body', bodyReadFailureReason: 'body-unavailable', ...changes });
const assess = input => assessPc10FunctionalTransport({ originals: new Map([[original.roleId, original]]), ...input });

test('native actor and SID mismatch cannot be classified as a passive instrumentation limitation', () => {
  for (const changes of [{ actorHash: digest('actor', 'foreign') }, { sessionHash: digest('session', 'foreign') }]) {
    const result = assess({ observations: [observation(changes)] });
    assert.ok(result.hardFailures.some(value => value.category === 'native-original-identity-discrepancy'));
  }
});
test('a malformed original native body/schema is a failure, not a collector gap exception', () => {
  const raw = observation({ bodyFailureStage: 'native-json-parse', bodyReadFailureReason: null });
  const result = assess({ observations: [raw], failures: [{ roleId: raw.roleId, protocolRequestHash: raw.protocolRequestHash,
    category: 'response-observation-unavailable' }] });
  assert.ok(result.hardFailures.some(value => value.category === 'response-observation-unavailable'));
  assert.equal(result.instrumentationLimits.length, 0);
});
test('unknown CDP rejection and exceeded buffer budget do not silently qualify', () => {
  for (const changes of [
    { bodyReadFailureReason: 'unknown' }, { bodyFailureStage: 'native-body-too-large', bodyReadFailureReason: null },
    { bodyFailureStage: 'native-total-body-too-large', bodyReadFailureReason: null },
  ]) {
    const raw = observation(changes);
    const result = assess({ observations: [raw], failures: [{ roleId: raw.roleId, protocolRequestHash: raw.protocolRequestHash,
      category: 'response-observation-unavailable' }] });
    assert.equal(result.instrumentationLimits.length, 0);
    assert.ok(result.hardFailures.some(value => value.category === 'response-observation-unavailable'));
  }
});
test('source points must bracket the original invocation and cannot be later cleanup or stale witnesses', () => {
  const valid = { issuedAt: 11, completedAt: 12, beforeSource: { checkedAt: 10 }, afterSource: { checkedAt: 13 },
    beforeBinding: { observedAt: 10 }, afterBinding: { observedAt: 13 },
    invocation: { startedAt: 11, completedAt: 12 } };
  assert.doesNotThrow(() => assertPc10FunctionalSourceOrder(valid));
  for (const changes of [
    { beforeSource: { checkedAt: 14 } }, { afterSource: { checkedAt: 10 } },
    { beforeBinding: { observedAt: 14 } }, { afterBinding: { observedAt: 10 } },
    { invocation: { startedAt: 10, completedAt: 12 } },
  ]) assert.throws(() => assertPc10FunctionalSourceOrder({ ...valid, ...changes }));
});
test('HTTP 200 headers without a real terminal outcome cannot hide an unfinished native action', () => {
  const raw = observation({ requestFinishedAt: null });
  const result = assess({ observations: [raw] });
  assert.ok(result.hardFailures.some(value => value.category === 'unfinished-native-terminal-outcome'));
});
