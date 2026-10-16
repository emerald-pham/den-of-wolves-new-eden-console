import assert from 'node:assert/strict';
import test from 'node:test';

test('Ring proof can load without the optional Station activation module', async () => {
  const ring = await import('./pc10-fresh-minimum-ring-proof.mjs');
  assert.equal(typeof ring.runRingWorkflow, 'function');
  assert.equal(typeof ring.runFreshMinimumRingProof, 'function');
});
