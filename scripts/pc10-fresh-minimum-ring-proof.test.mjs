import assert from 'node:assert/strict';
import test from 'node:test';
import { minimumRingPlan, runRingWorkflow } from './pc10-fresh-minimum-ring-proof.mjs';

test('fresh Ring plan has three entitled Auth identities and zero unused-seat accounts', () => {
  const plan = minimumRingPlan();
  assert.equal(plan.actualAuthenticatedActors, 3);
  assert.equal(plan.configuredRoles, 13);
  assert.equal(plan.browserProcesses, 2);
  assert.equal(plan.browserContexts, 3);
  assert.equal(plan.hardCapMs, 1200000);
});

// Synthetic procedure contracts, never gameplay evidence. Each operation is
// replaced by the concrete normal-UI/SDK implementation in the executable.
test('fresh workflow creates actual prerequisites, then original recovery and ending; no discovery/checkpoint replay', async () => {
  const trace = [];
  const operations = Object.fromEntries(['setup', 'researchCycle', 'advance', 'arrive', 'repairRing',
    'crossAndRecover', 'finishPassages', 'sabotageAndClose'].map(name => [name, async value => {
    trace.push({ name, value }); return name === 'setup' ? { sessionId: 'fresh' } : undefined;
  }]));
  await runRingWorkflow(operations);
  assert.deepEqual(trace.map(value => value.name), ['setup', 'researchCycle', 'advance', 'researchCycle',
    'advance', 'researchCycle', 'advance', 'researchCycle', 'arrive', 'repairRing', 'crossAndRecover',
    'finishPassages', 'sabotageAndClose']);
  assert.deepEqual(trace.filter(value => value.name === 'researchCycle').map(value => value.value), [1, 2, 3, 4]);
  assert.deepEqual(trace.filter(value => value.name === 'advance').map(value => value.value), [2, 3, 4]);
  assert.equal(trace.some(value => /discover|checkpoint/i.test(value.name)), false);
});

test('first prerequisite failure stops the workflow before candidate outcomes', async () => {
  const trace = [];
  const operations = { setup: async () => trace.push('setup'),
    researchCycle: async () => { trace.push('research'); throw new Error('real research unavailable'); },
    arrive: async () => trace.push('arrive') };
  await assert.rejects(runRingWorkflow(operations), /real research unavailable/);
  assert.deepEqual(trace, ['setup', 'research']);
});
