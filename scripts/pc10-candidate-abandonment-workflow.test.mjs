import assert from 'node:assert/strict';
import test from 'node:test';
import { runRingWorkflow } from './pc10-fresh-minimum-ring-proof.mjs';

// Public proof-consumer seam: supplied observations stand for the browser/SDK
// boundary. This does not create gameplay state or earn native acceptance.
function rehearsal({ recoveryChange = {}, nextChange = {} } = {}) {
  const events = [];
  const paid = { sessionId: 'original-session', actorUidHash: 'original-miner',
    requestId: 'original-partial', candidateRevision: 1, contributedMaterials: 1,
    materialsRemaining: 4, candidateCompleted: false, phase: 'active', cycle: 1,
    reply: { type: 'candidate-action-result', status: 'committed', requestId: 'original-partial', revision: 1 } };
  const operations = Object.fromEntries(['setup', 'researchCycle', 'advance', 'arrive',
    'repairRing', 'crossAndRecover', 'finishPassages', 'sabotageAndClose'].map(name =>
    [name, async value => { events.push([name, value]); }]));
  Object.assign(operations, {
    preparePartialCandidate: async () => { events.push(['partial']); return structuredClone(paid); },
    recoverPartialCandidate: async () => { events.push(['cold-reload-exact-replay']); return { ...structuredClone(paid), ...recoveryChange }; },
    nextAfterPartialCandidate: async () => { events.push(['next-action']); return {
      ...structuredClone(paid), cycle: 2, nextActionEnabled: true,
      nextActorUidHash: 'original-miner', ...nextChange }; },
  });
  return { events, paid, operations };
}

test('unfinished Ring intent stops after one paid contribution, reload/replay and the next legitimate cycle action', async () => {
  const { events, operations, paid } = rehearsal();
  const proof = await runRingWorkflow(operations, { intent: 'abandon-after-partial' });
  assert.deepEqual(events, [['setup', undefined], ['partial'], ['cold-reload-exact-replay'], ['advance', 2], ['next-action']]);
  assert.deepEqual(proof.paid, paid);
  assert.equal(proof.next.phase, 'active');
  assert.equal(proof.next.candidateCompleted, false);
});

test('an exact-replay consumer rejects a second debit or changed candidate revision', async () => {
  for (const recoveryChange of [{ materialsRemaining: 3 }, { candidateRevision: 2 },
    { requestId: 'replacement-intent' }]) {
    const { operations } = rehearsal({ recoveryChange });
    await assert.rejects(runRingWorkflow(operations, { intent: 'abandon-after-partial' }),
      /replay must retain the original partial contribution/);
  }
});

test('continuation cannot pass with a completed site, inactive game or unavailable next action', async () => {
  for (const nextChange of [{ candidateCompleted: true }, { phase: 'debrief' },
    { nextActionEnabled: false }, { nextActorUidHash: 'different-miner' }, { cycle: 1 }]) {
    const { operations } = rehearsal({ nextChange });
    await assert.rejects(runRingWorkflow(operations, { intent: 'abandon-after-partial' }));
  }
});
