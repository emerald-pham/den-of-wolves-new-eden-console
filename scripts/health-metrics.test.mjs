import assert from 'node:assert/strict';
import test from 'node:test';
import { createHealthMetricsRecorder, listenerDelayAfter } from './health-metrics.mjs';

test('aggregates safe callable and listener health without input identities', async () => {
  let now = 0;
  const health = createHealthMetricsRecorder({ clock: () => now });
  await health.measureCallable('refresh-presence', async () => { now = 12; return { status: 'committed', sessionId: 'must-not-leak' }; });
  now = 20;
  await health.measureCallable('adjust-ship-resource', async () => { now = 34; return { status: 'stale', requestId: 'must-not-leak' }; }, { attempt: 2 });
  health.recordTransient('refresh-presence', 'resource-exhausted', { attempt: 1, durationMs: 3 });
  health.recordTransient('refresh-presence', 'unavailable', { attempt: 2, durationMs: 4 });
  health.recordListener('session-projection', 'initial', 17);
  const summary = health.summary();

  assert.equal(summary.callableSamples, 4);
  assert.equal(summary.listenerSamples, 1);
  assert.equal(summary.retryAttempts, 2);
  assert.deepEqual(new Set(summary.callables.map((metric) => metric.outcome)), new Set(['success', 'contention', 'throttled', 'unavailable']));
  const serialized = JSON.stringify(summary);
  for (const forbidden of ['must-not-leak', 'sessionId', 'requestId', 'super-secret-content', 'uid-123-secret', 'joinCode']) {
    assert.equal(serialized.includes(forbidden), false, `Health evidence leaked ${forbidden}.`);
  }
});

test('rejects unsafe names and invalid durations before evidence is recorded', () => {
  const health = createHealthMetricsRecorder();
  assert.throws(() => health.recordTransient('contains/session', 'unavailable', { attempt: 1 }), /privacy-safe/);
  assert.throws(() => health.recordTransient('session-secret', 'unavailable', { attempt: 1 }), /fixed health metric vocabulary/);
  assert.throws(() => health.recordListener('session-projection', 'initial', Number.POSITIVE_INFINITY), /duration/);
});

test('classifies business and internal failures as rejected rather than contention', async () => {
  const health = createHealthMetricsRecorder();
  for (const code of ['functions/already-exists', 'functions/internal']) {
    await assert.rejects(health.measureCallable('refresh-presence', async () => {
      throw Object.assign(new Error(code), { code });
    }));
  }
  assert.deepEqual(health.summary().callables.map((metric) => metric.outcome), ['rejected']);
});

test('attributes reconnect delay to the first event after resume begins', () => {
  assert.equal(listenerDelayAfter([100, 150, 230], 200), 30);
  assert.equal(listenerDelayAfter([100, 150], 200), undefined);
});
