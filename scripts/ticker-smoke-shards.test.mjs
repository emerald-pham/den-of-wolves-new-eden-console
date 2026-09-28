import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTickerSmokePlan } from './ticker-smoke-shards.mjs';

test('keeps the complete ticker suite as the default local plan', () => {
  assert.deepEqual(resolveTickerSmokePlan({}), {
    scenarios: ['press', 'turn-zero'],
    normalLifecycle: true,
    reducedLifecycle: true,
  });
});

test('splits exact-SHA release coverage into complete independent shards', () => {
  assert.deepEqual(resolveTickerSmokePlan({ shard: 'press' }), {
    scenarios: ['press'], normalLifecycle: false, reducedLifecycle: false,
  });
  assert.deepEqual(resolveTickerSmokePlan({ shard: 'turn-zero' }), {
    scenarios: ['turn-zero'], normalLifecycle: false, reducedLifecycle: false,
  });
  assert.deepEqual(resolveTickerSmokePlan({ shard: 'lifecycle' }), {
    scenarios: [], normalLifecycle: true, reducedLifecycle: true,
  });
});

test('preserves focused legacy lifecycle modes and fails closed on bad shard input', () => {
  assert.deepEqual(resolveTickerSmokePlan({ onlyLifecycle: true }), {
    scenarios: [], normalLifecycle: true, reducedLifecycle: false,
  });
  assert.deepEqual(resolveTickerSmokePlan({ onlyReducedLifecycle: true }), {
    scenarios: [], normalLifecycle: false, reducedLifecycle: true,
  });
  assert.throws(() => resolveTickerSmokePlan({ shard: 'partial' }), /Unknown ticker smoke shard/);
  assert.throws(
    () => resolveTickerSmokePlan({ shard: 'press', onlyLifecycle: true }),
    /cannot be combined/,
  );
});
