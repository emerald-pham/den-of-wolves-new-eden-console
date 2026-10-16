import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { assertOriginalActor } from './pc10-member-gm-lifecycle-contracts.mjs';

// Execute the real route and wait bodies with finite observations. No SDK,
// browser, signup, wall-clock acceleration in gameplay, or contract substitute.
const path = new URL('./pc10-member-gm-lifecycle-ui-proof.mjs', import.meta.url);
const source = await readFile(path, 'utf8');
function between(start, end, after = 0) {
  const a = source.indexOf(start, after), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Bind the actual route transition before fixtures.');
  return source.slice(a, b);
}
const waitBody = between('export async function untilLifecycle(', 'export function publicLifecycleReceipt').replace(/^export /, '');
const restoreBody = between('  async function restore(context, snapshot, url) {', '  async function controller(context) {');
const staleStart = source.indexOf("await perform('stale-seat-clear'");
const staleBody = between('        await context.crew.page.reload();', '        const gmUrl = ', staleStart);
const kickStart = source.indexOf('const kickRecovery = await recoverLifecycleUiAction');
const kickBody = between('        await context.crew.page.reload();', '        dialog = await openLifecycleSettings', kickStart);
const actor = { sessionId: 'synthetic-original-session', uidHash: 'synthetic-original-controller',
  hasAuth: true, sameActor: true, connection: 'live', freshness: 'server', generation: 2,
  privateAudienceMatches: true, foreignPendingCount: 0, playerRole: 'player',
  profileRoleId: 'controller', gmInstanceOwned: false, instanceId: null, claimedAt: null, privateCount: 0 };
const savedUrl = 'http://127.0.0.1:5174/?demoActor=synthetic-original-session~controller#/demo-actors';
function fixture({ navigation = null, generation = 2, current = {}, gotoError, kind = 'restore', gm = false } = {}) {
  let now = 0; const held = [], calls = { goto: [], reload: 0, waits: [], observations: 0 };
  const expected = { ...actor, ...(gm ? { playerRole: 'gm', gmInstanceOwned: true, instanceId: 'synthetic-original-gm' } : {}) };
  const state = { ...actor, generation, ...current };
  const context = { crew: { page: { async goto(url) { calls.goto.push(url); if (gotoError) throw gotoError; return navigation; },
    async reload() { calls.reload++; } } } };
  const scope = vm.createContext({ assert, assertOriginalActor, Date: { now: () => now },
    delay: async ms => { now += ms; }, observeLifecycleActor: async surface => {
      assert.equal(surface, context.crew); calls.observations++; return state;
    }, rememberProofFailure: (error, detail) => held.push({ error, detail }) });
  const realWait = new vm.Script('(' + waitBody.trim() + ')', { filename: path.pathname }).runInContext(scope);
  scope.untilLifecycle = async (...args) => { calls.waits.push({ expected: args[1], options: args[4] ?? {} }); return realWait(...args); };
  let body = restoreBody;
  if (kind !== 'restore') body = 'async function transition(context, before, current) {\n' + (kind === 'stale' ? staleBody : kickBody) + '\n}';
  const invoke = new vm.Script('(' + body.trim() + ')', { filename: path.pathname }).runInContext(scope);
  return { calls, held, state, expected, async run() { return kind === 'restore'
    ? invoke(context, expected, savedUrl) : invoke(context, expected, expected); } };
}
function original(f) {
  assert.equal(f.calls.waits.length, 1); assert.equal(f.calls.waits[0].expected, f.expected);
  assert.equal(f.state.uidHash, actor.uidHash); assert.equal(f.state.sessionId, actor.sessionId);
}
test('bridge: original same-document controller return retains generation and privacy', async () => {
  const f = fixture(); await f.run(); original(f); assert.deepEqual(f.calls.goto, [savedUrl]); assert.equal(f.state.generation, 2);
});
test('document controller return accepts the newer original member generation', async () => {
  const f = fixture({ navigation: { mainResourceResponse: true }, generation: 3 }); await f.run(); original(f);
  assert.equal(f.calls.waits[0].options.rejoined, true);
});
test('document controller return rejects an unchanged generation', async () => {
  await assert.rejects(() => fixture({ navigation: { mainResourceResponse: true } }).run());
});
test('document controller return rejects a stale generation', async () => {
  await assert.rejects(() => fixture({ navigation: { mainResourceResponse: true }, generation: 1 }).run());
});
test('hash return rejects unexplained generation advancement', async () => {
  await assert.rejects(() => fixture({ generation: 3 }).run());
});
test('a normal station hash return retains its original member generation', async () => {
  const f = fixture({ current: { profileRoleId: 'dione-captain', assignedRoleId: 'dione-captain', seatId: 'dione-captain' } });
  await f.run(); original(f); assert.equal(f.state.generation, 2);
});
test('a failed document navigation retains and throws its original error', async () => {
  const error = Object.freeze(new Error('Synthetic original navigation failure.'));
  const f = fixture({ gotoError: error }); await assert.rejects(() => f.run(), e => e === error); assert.equal(f.calls.observations, 0);
});
for (const [name, current] of [['foreign UID', { uidHash: 'synthetic-foreign-controller' }],
  ['foreign session', { sessionId: 'synthetic-foreign-session' }], ['foreign audience', { privateAudienceMatches: false }],
  ['foreign pending command', { foreignPendingCount: 1 }], ['cached state', { freshness: 'cache' }],
  ['unmatched actor', { sameActor: false }], ['absent authentication', { hasAuth: false }]]) {
  test('document return still rejects ' + name, async () => {
    await assert.rejects(() => fixture({ navigation: { mainResourceResponse: true }, generation: 3, current }).run());
  });
}
for (const kind of ['stale', 'kick']) {
  test(kind + ': explicit document reload requires a newer original member generation', async () => {
    const f = fixture({ kind, gm: kind === 'kick', generation: 3 }); await f.run(); original(f);
    assert.equal(f.calls.reload, 1); assert.equal(f.calls.waits[0].options.rejoined, true);
    assert.equal(f.calls.waits[0].options.timeout, undefined, 'Keep the existing sixty-second wait.');
    if (kind === 'kick') assert.equal(f.calls.waits[0].options.releasedGm, true);
  });
  test(kind + ': explicit document reload cannot retain the old generation', async () => {
    await assert.rejects(() => fixture({ kind, gm: kind === 'kick' }).run());
  });
}
test('the actual wait retains its consumed authority tuple and original assertion without another observation', async () => {
  const f = fixture({ generation: 3 }); let originalError;
  await assert.rejects(() => f.run(), error => { originalError = error; return error instanceof assert.AssertionError; });
  assert.equal(f.calls.observations, 1); assert.equal(f.held.length, 1);
  assert.equal(f.held[0].error, originalError); assert.equal(f.held[0].detail.current, f.state);
  assert.equal(f.held[0].detail.expected, f.expected); assert.equal(f.held[0].detail.authority.rejoined, false);
  assert.match(originalError.stack, /assertOriginalActor/);
});
test('the actual wait retains its last consumed timeout tuple within the original deadline', async () => {
  const f = fixture({ current: { freshness: 'cache' } }); await assert.rejects(() => f.run());
  assert.equal(f.calls.observations, 300); assert.equal(f.held.length, 1);
  assert.equal(f.held[0].detail.current, f.state); assert.equal(f.held[0].detail.timeout, 60_000);
});
