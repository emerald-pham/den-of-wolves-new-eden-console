#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HEALTH_METRIC_VOCABULARY } from './health-metrics.mjs';

const evidencePath = process.argv[2];
if (!evidencePath) throw new Error('Usage: node scripts/validate-prompt-636-health.mjs <evidence.json>');
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const health = evidence?.results?.health;
assert.equal(evidence.status, 'passed', 'The source emulator rehearsal did not pass.');
assert.equal(health?.schemaVersion, 1, 'Missing P636 health schema.');
assert.ok(health.callableSamples > 0, 'No callable latency samples were recorded.');
assert.ok(health.listenerSamples > 0, 'No listener-delay samples were recorded.');
assert.ok(health.retryAttempts >= 2, 'Transient recovery did not record retry attempts.');
const allowed = (values) => new Set(values);
const callableNames = allowed(HEALTH_METRIC_VOCABULARY.callableNames);
const sources = allowed(HEALTH_METRIC_VOCABULARY.sources);
const projections = allowed(HEALTH_METRIC_VOCABULARY.projections);
const allowedStages = allowed(HEALTH_METRIC_VOCABULARY.stages);
for (const metric of health.callables) {
  assert.ok(callableNames.has(metric.name), `Unknown callable metric name ${metric.name}.`);
  assert.ok(sources.has(metric.source), `Unknown callable metric source ${metric.source}.`);
}
for (const metric of health.listeners) {
  assert.ok(projections.has(metric.projection), `Unknown listener projection ${metric.projection}.`);
  assert.ok(allowedStages.has(metric.stage), `Unknown listener stage ${metric.stage}.`);
}
const outcomes = new Set(health.callables.map((metric) => metric.outcome));
for (const outcome of ['success', 'denied', 'throttled', 'unavailable', 'contention']) {
  assert.ok(outcomes.has(outcome), `Missing ${outcome} callable health evidence.`);
}
for (const outcome of ['throttled', 'unavailable']) {
  assert.ok(health.callables.some((metric) => metric.outcome === outcome && metric.source === 'injected-transport'),
    `${outcome} evidence must remain explicitly labeled as injected transport.`);
}
assert.ok(health.callables.some((metric) => metric.name === 'refresh-presence' &&
  metric.source === 'emulator-recovery' && metric.outcome === 'success' && metric.retryAttempts > 0),
'The transient probe did not finish with a measured real-emulator recovery call.');
const stages = new Set(health.listeners.map((metric) => metric.stage));
for (const stage of ['initial', 'start-update', 'action-update', 'reconnect-update']) {
  assert.ok(stages.has(stage), `Missing ${stage} listener-delay evidence.`);
}
const serialized = JSON.stringify(health);
for (const forbidden of ['sessionId', 'requestId', 'joinCode', 'uid', 'payload', 'message']) {
  assert.equal(serialized.includes(forbidden), false, `Health evidence contains forbidden field ${forbidden}.`);
}
console.log(`P636 health evidence passed: ${health.callableSamples} callable and ${health.listenerSamples} listener samples.`);
