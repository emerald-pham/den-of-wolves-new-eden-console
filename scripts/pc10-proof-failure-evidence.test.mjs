import assert from 'node:assert/strict';
import test from 'node:test';
import * as evidence from './pc10-proof-failure-evidence.mjs';

test('held proof observations can be recovered from the original frozen error without a new observation', () => {
  const original = Object.freeze(new Error('original source rejection'));
  const observed = Object.freeze({ originalRequest: 'retained-original', revision: 7 });
  evidence.rememberProofFailure(original, observed);
  const held = evidence.heldProofFailureObservations(original);
  assert.deepEqual(held, [observed]);
  assert.equal(held[0], observed);
  held.push({ synthetic: true });
  assert.deepEqual(evidence.heldProofFailureObservations(original), [observed]);
  assert.equal(original.message, 'original source rejection');
  for (const unknown of [null, undefined, 1, 'error', Symbol('error'), new Error('unobserved')]) {
    assert.deepEqual(evidence.heldProofFailureObservations(unknown), []);
  }
});
