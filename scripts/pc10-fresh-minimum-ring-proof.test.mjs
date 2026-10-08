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

import * as proof from './pc10-fresh-minimum-ring-proof.mjs';
test('cleanup failure cannot publish a passed proof or erase the original failure', () => {
 const first = new Error('original crossing failure');
 const evidence = {status:'passed'};
 const cleanup = {errors:[{label:'owned Auth',error:'delete denied'}]};
 assert.equal(typeof proof.finalizeRingEvidence, 'function');
 const failure = proof.finalizeRingEvidence(evidence, cleanup, null);
 assert.equal(evidence.status,'failed'); assert.match(failure.message,/cleanup/i);
 assert.equal(proof.finalizeRingEvidence({status:'failed'},cleanup,first),first);
});
test('allocation binds the complete compiled tree before runtime', () => {
 const input={status:'EXPLICIT_PARENT_ALLOCATION_GRANTED',sourceRoot:'/tmp/source',projectId:'demo-ring',
 baseUrl:'http://127.0.0.1:5190',ports:{auth:9190,firestore:8180,functions:5100},
 sourceCommit:'a'.repeat(40),runnerSha256:'b'.repeat(64),compiledIndexSha256:'c'.repeat(64)};
 assert.throws(()=>proof.validateRingAllocation(input),/compiledTreeSha256/);
 assert.equal(proof.validateRingAllocation({...input,compiledTreeSha256:'d'.repeat(64)}).compiledTreeSha256,'d'.repeat(64));
});
