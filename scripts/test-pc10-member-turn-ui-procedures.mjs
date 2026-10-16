import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureLifecycleUiAction, recoverLifecycleUiAction, publicLifecycleReceipt,
  createMemberGmLifecycleUiProof, untilLifecycle } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { createTurnCycleDemoUiProof } from './pc10-turn-cycle-demo-ui-proof.mjs';

const actor = { sessionId: 's', uidHash: '0123456789abcdef', hasAuth: true, sameActor: true,
  connection: 'live', freshness: 'server', generation: 1, hydrationRevision: 2, playerRole: 'gm',
  instanceId: 'i', claimedAt: 'lease', gmInstanceOwned: true,
  privateAudienceMatches: true, foreignPendingCount: 0, activeConsoleRoleId: null };
const data = { sessionId: 's', instanceId: 'i', targetUid: 'not-public', requestId: 'actual-ui-id' };
function surface({ state = actor, body = { result: { sessionId: 's', setupRevision: 3 } },
  endpoint = 'releaseRole', requestData = data } = {}) {
  let choices = 0, replays = 0, armed = false;
  const response = { request: () => ({ postDataJSON: () => ({ data: requestData }), method: () => 'POST' }),
    url: () => `http://127.0.0.1:5011/demo-pc10-owner/us-central1/${endpoint}`,
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
test('a forged receipt object cannot turn an initial SDK mutation into UI recovery', async () => {
  const s = surface();
  await assert.rejects(recoverLifecycleUiAction(s, { endpoint: 'releaseRole', before: actor,
    data, result: { sessionId: 's', setupRevision: 3 } }));
  assert.equal(s.counts().replays, 0);
});
test('stable GM claim repeat never reclaims a different current lease', async () => {
  const member = { ...actor, playerRole: 'player', gmInstanceOwned: false, instanceId: null, claimedAt: null };
  const s = surface({ state: member, endpoint: 'claimGmInstance',
    requestData: { sessionId: 's', instanceId: 'i', name: 'Actual UI name', deviceLabel: 'Actual UI device' },
    body: { result: { instance: { id: 'i', claimedAt: 'lease' } } } });
  const capture = await captureLifecycleUiAction(s, 'claimGmInstance', s.choose);
  s.page.evaluate = async () => ({ ...actor, instanceId: 'foreign-lease' });
  await assert.rejects(recoverLifecycleUiAction(s, capture, { stateRepeat: true }));
  assert.equal(s.counts().replays, 0);
  s.page.evaluate = async () => actor;
  const recovered = await recoverLifecycleUiAction(s, capture, { stateRepeat: true });
  assert.equal(recovered.protocol, 'stable-instance-repeat'); assert.equal(recovered.sourceReceiptRecovered, false);
});
test('captured old disconnect tests a newer genuine generation without invented receipt credit', async () => {
  const member = { ...actor, playerRole: 'player', gmInstanceOwned: false, instanceId: null, claimedAt: null };
  const s = surface({ state: member, endpoint: 'disconnectFromSession',
    requestData: { sessionId: 's', connectionGeneration: 1 }, body: { result: null } });
  const capture = await captureLifecycleUiAction(s, 'disconnectFromSession', s.choose);
  s.page.evaluate = async () => ({ ...member, generation: 2 });
  const recovered = await recoverLifecycleUiAction(s, capture, { rejoined: true });
  assert.equal(recovered.protocol, 'generation-bound-cleanup'); assert.equal(recovered.sourceReceiptRecovered, false);
});
test('bounded freshness wait never acts on cache and resumes only the same original live authority', async () => {
  const states = [{ ...actor, connection: 'connecting', freshness: 'cache' }, actor];
  const s = surface(); s.page.evaluate = async () => states.shift() ?? actor;
  assert.deepEqual(await untilLifecycle(s, actor, () => true, 'Live original restoration', { timeout: 1_000 }), actor);
  const foreign = surface({ state: { ...actor, uidHash: 'wrong' } });
  await assert.rejects(untilLifecycle(foreign, actor, () => true, 'Wrong actor', { timeout: 1_000 }));
});
test('callback construction starts no runtime and exposes separate preparation/active/terminal hooks', () => {
  const proof = createMemberGmLifecycleUiProof({ cases: ['gm-registration-lock'] });
  for (const key of ['onBeforeStart', 'onStarted', 'onTerminal']) assert.equal(typeof proof[key], 'function');
  assert.equal(proof.evidence.actualRuntimeRuns, 0);
  assert.throws(() => createMemberGmLifecycleUiProof({ cases: ['invented-case'] }));
});
test('turn constructor rejects an invented case and never starts a runtime', () => {
  const proof = createTurnCycleDemoUiProof({ cases: ['manual-coordination', 'genuine-terminal'] });
  assert.equal(typeof proof.onStarted, 'function'); assert.equal(typeof proof.onTerminal, 'function');
  assert.equal(proof.evidence.actualRuntimeRuns, 0);
  assert.throws(() => createTurnCycleDemoUiProof({ cases: ['invented'] }));
});
test('authorization payload never contributes password contents to a report digest', () => {
  const a = publicLifecycleReceipt({ endpoint: 'loginGmAccess', before: actor,
    data: { password: 'first-credential' }, result: { authenticated: true }, httpStatus: 200 });
  const b = publicLifecycleReceipt({ endpoint: 'loginGmAccess', before: actor,
    data: { password: 'second-credential' }, result: { authenticated: true }, httpStatus: 200 });
  assert.equal(a.requestFingerprint, b.requestFingerprint);
  assert.ok(!JSON.stringify(a).includes('first-credential'));
});
