import test from 'node:test';
import assert from 'node:assert/strict';
import { assertClearedPrivateState } from './pc10-member-gm-lifecycle-contracts.mjs';

// Existing clearance behavior is exercised directly; no missing new import is a RED.
const before = { uidHash: '1111111111111111', sessionId: 'native-source-session' };
function cleared() {
  return { hasAuth: true, uidHash: before.uidHash, sessionId: null,
    privateCount: 2, privatePayloadCount: 0, instanceId: null,
    gmInstanceOwned: false, foreignPendingCount: 0 };
}

test('current Source content zero clears the two exact harmless aggregate defaults', () => {
  assert.doesNotThrow(() => assertClearedPrivateState(before, cleared()));
});

test('a present positive payload count fails even if a legacy aggregate is zero', () => {
  const current = cleared(); current.privateCount = 0; current.privatePayloadCount = 1;
  assert.throws(() => assertClearedPrivateState(before, current));
});

test('present malformed, missing-valued or inherited content counts fail closed', () => {
  for (const value of [undefined, null, '0', false, -1, 0.5, NaN, Infinity]) {
    const current = cleared(); current.privateCount = 0; current.privatePayloadCount = value;
    assert.throws(() => assertClearedPrivateState(before, current));
  }
  const current = cleared(); delete current.privatePayloadCount; current.privateCount = 0;
  Object.setPrototypeOf(current, { privatePayloadCount: 0 });
  assert.throws(() => assertClearedPrivateState(before, current));
});

test('legacy Native fixtures with no new field still require their original aggregate zero', () => {
  const current = cleared(); delete current.privatePayloadCount;
  current.privateCount = 0;
  assert.doesNotThrow(() => assertClearedPrivateState(before, current));
  for (const value of [2, undefined, null, '0', -1]) {
    current.privateCount = value;
    assert.throws(() => assertClearedPrivateState(before, current));
  }
});

test('content clearance does not relax original UID, membership or instance authority', () => {
  for (const change of [{ hasAuth: false }, { uidHash: '2222222222222222' },
    { sessionId: 'foreign-session' }, { instanceId: 'foreign-instance' },
    { gmInstanceOwned: true }, { foreignPendingCount: 1 }]) {
    assert.throws(() => assertClearedPrivateState(before, { ...cleared(), ...change }));
  }
});
