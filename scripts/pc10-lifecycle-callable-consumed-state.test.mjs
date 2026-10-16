import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { captureLifecycleUiAction } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { originalProofError } from './pc10-proof-failure-evidence.mjs';

// The actual public capture function and actual authority assertions consume
// inert browser observations. No live browser/Auth/SDK/Admin or gameplay credit.
const actor = change => ({ sessionId: 'native-session', uidHash: 'a'.repeat(16), hasAuth: true,
  sameActor: true, connection: 'live', freshness: 'server', generation: 2,
  hydrationRevision: 1, playerRole: 'player', profileRoleId: 'controller',
  activeConsoleRoleId: null, seatId: null, assignedRoleId: null, gmInstanceOwned: false,
  instanceId: null, claimedAt: null, gmAccessCached: true,
  privateAudienceMatches: true, foreignPendingCount: 0, pendingCount: 0,
  privateCount: 2, privatePayloadCount: 0, ...change });

function fixture({ changed, failure = Object.freeze(new Error('native response timed out')), body } = {}) {
  const page = new EventEmitter(); let reads = 0, chooseCount = 0, waitCount = 0, waitTimeout;
  page.evaluate = async () => actor(reads++ ? changed : {});
  page.waitForResponse = async (predicate, options) => {
    waitCount++; waitTimeout = options.timeout;
    if (body) {
      const response = { url: () => 'http://127.0.0.1:5011/demo-pc10-native/us-central1/logoutGmAccess',
        request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: { sessionId: null, instanceId: null } }) }),
        status: () => 403, json: async () => body };
      assert.equal(predicate(response), true); return response;
    }
    throw failure;
  };
  const surface = { page, storeModuleUrl: () => '/native-inert-store' };
  return { surface, failure, choose: async () => { chooseCount++; }, counts: () => ({ reads, chooseCount, waitCount, waitTimeout }) };
}

test('actual lifecycle timeout preserves its exact before/current member tuple and supplied deadline on the original frozen exception', async () => {
  const f = fixture(), deadlineAt = Date.now() + 60_000;
  await assert.rejects(captureLifecycleUiAction(f.surface, 'logoutGmAccess', f.choose, { deadlineAt }), e => e === f.failure);
  assert.deepEqual({ ...f.counts(), waitTimeout: undefined }, { reads: 2, chooseCount: 1, waitCount: 1, waitTimeout: undefined });
  const held = originalProofError(f.failure).heldObservationsInspect;
  for (const needle of ['captureLifecycleUiAction', 'logoutGmAccess', 'before:', 'current:', 'generation: 2', 'hydrationRevision: 1', 'deadlineAt:']) assert.ok(held.includes(needle), needle);
  assert.ok(f.counts().waitTimeout > 0 && f.counts().waitTimeout <= 60_000);
});

test('an authority failure before the click retains both consumed tuples and never performs the stale action', async () => {
  const f = fixture({ changed: { generation: 3 } }); let error;
  await assert.rejects(captureLifecycleUiAction(f.surface, 'logoutGmAccess', f.choose), e => { error = e; return /generation|equal/i.test(e.message); });
  assert.equal(f.counts().chooseCount, 0);
  const held = originalProofError(error).heldObservationsInspect;
  assert.ok(held.includes('generation: 2')); assert.ok(held.includes('generation: 3'));
});

test('native HTTP rejection retains the actual matched request, parsed error body and actor tuple without retrying the mutation', async () => {
  const f = fixture({ body: { error: { status: 'PERMISSION_DENIED', message: 'native server denial' } } }); let error;
  await assert.rejects(captureLifecycleUiAction(f.surface, 'logoutGmAccess', f.choose), e => { error = e; return /actual UI request rejected/.test(e.message); });
  assert.equal(f.counts().chooseCount, 1); assert.equal(f.counts().waitCount, 1);
  const held = originalProofError(error).heldObservationsInspect;
  for (const needle of ['httpStatus: 403', 'requestData:', 'sessionId: null', 'instanceId: null', 'PERMISSION_DENIED', 'native server denial']) assert.ok(held.includes(needle), needle);
});

test('an exhausted original operation deadline cannot arm a new observer or click and keeps the already consumed actor evidence', async () => {
  const f = fixture(); let error;
  await assert.rejects(captureLifecycleUiAction(f.surface, 'logoutGmAccess', f.choose, { deadlineAt: Date.now() - 1 }), e => { error = e; return /deadline/.test(e.message); });
  assert.equal(f.counts().waitCount, 0); assert.equal(f.counts().chooseCount, 0);
  const held = originalProofError(error).heldObservationsInspect;
  assert.ok(held.includes('before:')); assert.ok(held.includes('deadlineAt:'));
});
