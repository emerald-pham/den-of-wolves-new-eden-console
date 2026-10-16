import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { assertOriginalActor } from './pc10-member-gm-lifecycle-contracts.mjs';

// Execute the actual manager-restoration block with the unchanged authority
// contract. Playwright goto returns null for a hash change and a Response for
// document navigation. These finite fixtures perform no browser or SDK work.
const source = await readFile(new URL('./pc10-two-live-gm-responsibility-proof.mjs', import.meta.url), 'utf8');
const begin = source.indexOf("      stage = 'original controller manager, roster and casting restoration';");
const end = source.indexOf("      failure.guard = 'restored-controller.exact-original-controller-and-gm-routes';", begin);
assert.ok(begin > 0 && end > begin, 'Bind the actual manager restoration before regressions.');
const body = source.slice(begin, end);
const account = { sessionId: 'synthetic-original-session', uidHash: 'synthetic-original-controller',
  hasAuth: true, sameActor: true, connection: 'live', freshness: 'server',
  privateAudienceMatches: true, foreignPendingCount: 0, generation: 2,
  playerRole: 'player', gmInstanceOwned: false, instanceId: null, claimedAt: null,
  profileRoleId: 'controller', privatePayloadCount: 0, pendingCount: 0,
  seatId: null, assignedRoleId: null, activeConsoleRoleId: null,
  setupRevision: 40, gmAccessCached: false };
const managerUrl = 'http://127.0.0.1:5174/?demoActor=synthetic-original-controller#/demo-actors';

function fixture({ navigation = null, current = {}, bridge = false } = {}) {
  const controller = { ...account, generation: 1 }, released = { ...account };
  const calls = { goto: [], until: [] }, failure = { held: {} }, evidence = {};
  const context = { crew: { page: { async goto(url) { calls.goto.push(url); return navigation; } } } };
  const invoke = new vm.Script('(async function(context,controller,released,failure,evidence,savedCrewUrl,revision,untilLifecycle) {let stage;\n' +
    body + '\nreturn failure.held.restored;})', { filename: 'actual-manager-navigation-restoration-block' })
    .runInContext(vm.createContext({ assert }));
  return { calls, failure, evidence, released, async run() {
    return invoke(context, controller, released, failure, evidence, managerUrl, 37,
      async (surface, expected, predicate, description, options = {}) => {
        assert.equal(surface, context.crew);
        calls.until.push({ expected, options: { ...options } });
        const generation = bridge ? (options.rejoined ? expected.generation + 1 : expected.generation) : 2;
        const actor = { ...account, generation, ...current };
        if (!predicate(actor)) throw Error('Original manager restoration predicate not satisfied.');
        assertOriginalActor(expected, actor, options);
        return actor;
      });
  } };
}
function originalFlow(f) {
  assert.deepEqual(f.calls.goto, [managerUrl]); assert.equal(f.calls.until.length, 1);
  assert.equal(f.calls.until[0].expected, f.released);
}

test('bridge: the actual OLD block restores the original actor after document navigation', async () => {
  const f = fixture({ navigation: { syntheticMainResourceResponse: true }, bridge: true });
  const actor = await f.run(); originalFlow(f);
  assert.equal(actor.uidHash, f.released.uidHash); assert.equal(actor.sessionId, f.released.sessionId);
  assert.equal(actor.privatePayloadCount, 0); assert.equal(actor.gmAccessCached, false);
  assert.equal(f.calls.until[0].options.rejoined, true);
});
test('same-document manager navigation keeps the exact released member generation', async () => {
  const f = fixture(); const actor = await f.run(); originalFlow(f);
  assert.equal(actor.generation, 2); assert.equal(f.calls.until[0].options.rejoined, false);
  assert.equal(f.evidence.managerNavigation.sameDocument, true);
  assert.equal(f.evidence.managerNavigation.releasedGeneration, 2);
  assert.equal(f.evidence.managerNavigation.restoredGeneration, 2);
});
test('same-document navigation rejects a newer generation instead of disguising a reconnect', async () => {
  const f = fixture({ current: { generation: 3 } }); await assert.rejects(() => f.run()); originalFlow(f);
});
test('same-document navigation rejects the stale pre-GM member generation', async () => {
  const f = fixture({ current: { generation: 1 } }); await assert.rejects(() => f.run()); originalFlow(f);
});
for (const [name, current] of [
  ['foreign UID', { uidHash: 'synthetic-foreign-controller' }],
  ['foreign session', { sessionId: 'synthetic-foreign-session' }],
  ['remaining private payload', { privatePayloadCount: 1 }],
  ['retained GM access', { gmAccessCached: true }],
  ['cached rather than server state', { freshness: 'cache' }],
]) {
  test('same-document manager restoration rejects ' + name, async () => {
    const f = fixture({ current }); await assert.rejects(() => f.run()); originalFlow(f);
  });
}
test('document navigation still rejects an unchanged released member generation', async () => {
  const f = fixture({ navigation: { syntheticMainResourceResponse: true } });
  await assert.rejects(() => f.run()); originalFlow(f);
});
