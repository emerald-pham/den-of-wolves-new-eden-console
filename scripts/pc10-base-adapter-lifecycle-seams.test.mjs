import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { projectionFixture } from './fixtures/pc10-member-projection-native-fixture.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { observeBasePostCombatActor, assertBasePostCombatActorIdentity } from './pc10-base-post-combat-actor-observation.mjs';
import { baseShipRoleCandidates, assessLiveBaseAction } from './pc10-base-post-combat-choice-policy.mjs';
const roleId = 'dione-engineer';
async function sourceFixture({ consoleRole = null } = {}) {
  const f = projectionFixture({ actorRoleId: roleId, freshDemo: false, released: true }); await f.resumeSessionOnly();
  const s = f.store.getState(); f.store.setState({ session: { ...s.session, phase: 'active', currentTurn: 2,
    activeRoleIds: [roleId, 'dione-captain'], activeVesselIds: ['dione'] },
    me: { ...s.me, activeConsoleRoleId: consoleRole } });
  const current = f.store.getState(), uidHash = createHash('sha256').update(current.me.uid).digest('hex').slice(0, 16);
  const initial = { sessionId: current.session.id, joinCode: 'NATIVE' }, originalActor = { roleId, uidHash };
  const a = createTwoBrowserGameplay({ gm: {}, crew: f.crew, initial, roster: [originalActor], directory: '/native-no-output' });
  return { f, a, initial, originalActor };
}
function assess(currentSession, actor, originalActor, requireConsole = false) {
  const gm = { sessionId: currentSession.sessionId, uidHash: 'native-original-gm', instanceId: 'native-owned-gm',
    playerRole: 'gm', gmInstanceOwned: true, phase: 'active', cycle: 2, connection: 'live', freshness: 'server' };
  return assessLiveBaseAction({ sessionId: currentSession.sessionId, expectedCycle: 2, shipId: 'dione', roleId,
    sourceGm: gm, originalGm: gm, currentSession: { ...currentSession, currentTurn: currentSession.cycle },
    ship: { shipId: 'dione', currentTurn: 2, damage: { destroyed: false } }, originalActor, currentActor: actor, requireConsole });
}
test('actual state adapter carries only source activeRoleIds into the ship candidate policy', async () => {
  const { f, a, originalActor } = await sourceFixture(); const state = await a.state(f.crew);
  assert.deepEqual(state.activeRoleIds, [roleId, 'dione-captain']);
  assert.deepEqual(baseShipRoleCandidates({ roster: [originalActor], activeRoleIds: state.activeRoleIds, shipId: 'dione' }), [roleId]);
  assert.equal(f.counters.sdkCalls, 0);
});
test('actual state adapter and composed actor observer satisfy current live action policy before console entry', async () => {
  const { f, a, originalActor } = await sourceFixture();
  const state = await a.state(f.crew), actor = await observeBasePostCombatActor(f.crew);
  assert.equal(actor.sameActor, true); assert.equal(actor.activeConsoleRoleId, null);
  assert.deepEqual(assess(state, actor, originalActor), { status: 'eligible', blockers: [] });
  assert.equal(assess(state, actor, originalActor, true).status, 'pending');
  assert.equal(f.counters.sdkCalls, 0);
});
test('account-only identity does not grant the strict held mission-console contract', async () => {
  const { f } = await sourceFixture(); const actor = await observeBasePostCombatActor(f.crew);
  assert.equal(actor.sameActor, true); assert.throws(() => assertBasePostCombatActorIdentity(actor, actor));
});
test('missing source active roles remain missing and cannot manufacture candidates or eligibility', async () => {
  const { f, a, originalActor } = await sourceFixture({ consoleRole: roleId });
  const s = f.store.getState(), session = { ...s.session }; delete session.activeRoleIds; f.store.setState({ session });
  const state = await a.state(f.crew), actor = await observeBasePostCombatActor(f.crew);
  assert.equal(state.activeRoleIds, undefined); assert.deepEqual(baseShipRoleCandidates({ roster: [originalActor],
    activeRoleIds: state.activeRoleIds, shipId: 'dione' }), []); assert.equal(assess(state, actor, originalActor).status, 'pending');
});
for (const [name, change] of [['different member UID', s => ({ me: { ...s.me, uid: 'private-foreign-member' } })],
  ['different session', s => ({ me: { ...s.me, sessionId: 'foreign-session' } })],
  ['wrong role', s => ({ me: { ...s.me, role: 'gm' } })],
  ['missing console field', s => { const me = { ...s.me }; delete me.activeConsoleRoleId; return { me }; }]]) {
  test('account-only readiness retains its original identity checks: ' + name, async () => {
    const { f, a, originalActor } = await sourceFixture(); f.store.setState(change(f.store.getState()));
    if (name === 'different member UID' || name === 'wrong role') {
      await assert.rejects(() => observeBasePostCombatActor(f.crew)); return;
    }
    const state = await a.state(f.crew), actor = await observeBasePostCombatActor(f.crew);
    assert.equal(assess(state, actor, originalActor).status, 'pending');
  });
}
// Execute the unchanged composed driver's existing terminal failure body.
const source = await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs', import.meta.url), 'utf8');
const begin = source.lastIndexOf('  } catch (error) {') + '  } catch (error) {'.length;
const end = source.indexOf('\n  }\n}', begin); assert.ok(begin > 0 && end > begin);
test('composed Base failure saves held state and keeps the original error if its report write also fails', async () => {
  const original = new Error('Original native Base guard.'), secondary = new Error('Native Base report failure.'), held = [];
  const consumed = { state: { activeRoleIds: [roleId] }, selectedMember: { seatId: null } };
  const scope = vm.createContext({ rememberProofFailure: (error, state) => held.push({ error, state }),
    retainProofFailure: async () => ({ path: '/native-protected-receipt' }),
    error: original, a: { consumedObservations: () => consumed, save: async () => { throw secondary; } },
    stages: [], checks: {}, costs: [], composedStages: [], pendingActions: [], governance: { pending: [] }, directory: '/native-no-output' });
  const run = new vm.Script('(async function() {\n' + source.slice(begin, end) + '\n})').runInContext(scope);
  await assert.rejects(run(), error => error === original); assert.ok(held.some(row => row.error === original));
});
