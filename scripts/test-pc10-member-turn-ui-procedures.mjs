import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureLifecycleUiAction, recoverLifecycleUiAction, publicLifecycleReceipt,
  createMemberGmLifecycleUiProof } from './pc10-member-gm-lifecycle-ui-proof.mjs';

const actor = { sessionId: 's', uidHash: '0123456789abcdef', hasAuth: true, sameActor: true,
  connection: 'live', freshness: 'server', generation: 1, hydrationRevision: 2, playerRole: 'gm',
  instanceId: 'i', claimedAt: 'lease', gmInstanceOwned: true,
  privateAudienceMatches: true, foreignPendingCount: 0, activeConsoleRoleId: null };
const data = { sessionId: 's', instanceId: 'i', targetUid: 'not-public', requestId: 'actual-ui-id' };
function surface({ state = actor, body = { result: { sessionId: 's', setupRevision: 3 } } } = {}) {
  let choices = 0, replays = 0, armed = false;
  const response = { request: () => ({ postDataJSON: () => ({ data }), method: () => 'POST' }),
    url: () => 'http://127.0.0.1:5011/demo-pc10-owner/us-central1/releaseRole',
    status: () => 200, json: async () => body };
  return { page: { evaluate: async () => state,
    waitForResponse: async predicate => { armed = true; assert.ok(predicate(response)); return response; } },
  storeModuleUrl: () => '/src/store/useSessionStore.ts',
  callable: async () => { replays++; return { status: 'committed', result: body.result }; },
  choose: async () => { assert.equal(armed, true); choices++; },
  counts: () => ({ choices, replays }) };
}
test('native observer arms before click and preserves exact actual request in memory only', async () => {
  const s = surface(); const capture = await captureLifecycleUiAction(s, 'releaseRole', s.choose);
  assert.deepEqual(capture.data, data); assert.equal(s.counts().choices, 1);
  assert.equal(publicLifecycleReceipt(capture).requestFingerprint.length, 64);
  assert.ok(!JSON.stringify(publicLifecycleReceipt(capture)).includes('not-public'));
});
test('denied UI transport does not become committed recovery evidence', async () => {
  const s = surface({ body: { error: { status: 'FAILED_PRECONDITION' } } });
  await assert.rejects(captureLifecycleUiAction(s, 'releaseRole', s.choose));
  assert.equal(s.counts().replays, 0);
});
test('foreign late reply cannot trigger an exact SDK replay', async () => {
  const s = surface(); const capture = await captureLifecycleUiAction(s, 'releaseRole', s.choose);
  const foreign = surface({ state: { ...actor, uidHash: 'foreign' } });
  await assert.rejects(recoverLifecycleUiAction(foreign, capture));
  assert.equal(foreign.counts().replays, 0);
});
test('non-idempotent turn requests are never repeated by generic recovery', async () => {
  const s = surface();
  await assert.rejects(recoverLifecycleUiAction(s, { endpoint: 'extendAirspaceWindow',
    before: actor, data: { sessionId: 's', instanceId: 'i' }, result: {} }));
  assert.equal(s.counts().replays, 0);
});
test('callback construction starts no runtime and exposes separate preparation/active/terminal hooks', () => {
  const proof = createMemberGmLifecycleUiProof({ cases: ['gm-registration-lock'] });
  for (const key of ['onBeforeStart', 'onStarted', 'onTerminal']) assert.equal(typeof proof[key], 'function');
  assert.equal(proof.evidence.actualRuntimeRuns, 0);
  assert.throws(() => createMemberGmLifecycleUiProof({ cases: ['invented-case'] }));
});
