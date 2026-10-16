import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { assertOriginalActor, lifecycleCaseAvailability } from './pc10-member-gm-lifecycle-contracts.mjs';

// Execute the actual casting case with the actual server assignment patch and
// actual normal station-entry function. Finite fixtures use no Auth/SDK/browser.
const source = await readFile(new URL('./pc10-member-gm-lifecycle-ui-proof.mjs', import.meta.url), 'utf8');
const begin = source.indexOf("      await perform('casting-release', context, async () => {");
const end = source.indexOf("      await perform('stale-seat-clear', context, async () => {", begin);
assert.ok(begin > 0 && end > begin, 'Bind the actual original casting case.');
const body = source.slice(begin, end);
const ts = createRequire(import.meta.url)('typescript');
async function parse(path) {
  return ts.createSourceFile(path, await readFile(new URL('../' + path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
}
function only(file, predicate) {
  const found = []; function visit(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(file); assert.equal(found.length, 1, 'Bind one actual contract before fixtures.'); return found[0];
}
const server = await parse('functions/src/index.ts');
const assign = only(server, n => ts.isVariableDeclaration(n) && n.name.getText(server) === 'assignRole');
const targetWrite = only(assign, n => ts.isCallExpression(n) && n.expression.getText(server) === 'tx.update' &&
  n.arguments[0]?.getText(server) === 'target.ref');
const assignmentPatch = new vm.Script('(assignment => (' + targetWrite.arguments[1].getText(server) + '))')
  .runInNewContext();
const client = await parse('src/lib/sessionService.ts');
const enter = only(client, n => ts.isFunctionDeclaration(n) && n.name?.text === 'selectConsoleRole');
const entrySource = ts.transpileModule(enter.getText(client), { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  .outputText.replace(/^export\s+/gm, '');
const uid = 'synthetic-original-casting-actor', sid = 'synthetic-original-session', roleId = 'dione-captain';
const uidHash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const actor = { sessionId: sid, uidHash: uidHash(uid), hasAuth: true, sameActor: true,
  connection: 'live', freshness: 'server', generation: 3, hydrationRevision: 1, playerRole: 'player',
  gmInstanceOwned: false, gmAccessCached: false, instanceId: null, claimedAt: null,
  profileRoleId: roleId, assignedRoleId: roleId, activeConsoleRoleId: null, seatId: roleId,
  privateAudienceMatches: true, foreignPendingCount: 0, pendingCount: 0, phase: 'casting', cycle: 0, setupRevision: 40 };
const timeout = code => Object.assign(new Error('Original casting restoration remains unqualified.'), { code });

function fixture({ readyAfter = 0, restored = {}, foreignSeat = false, unavailable = false,
  requestedRole = roleId, missingRoster = false } = {}) {
  let now = 0, observation = { ...actor, ...(unavailable ? { phase: 'active', cycle: 1 } : {}) };
  const calls = { sequence: [], originalSelect: [], nativeEntry: [], until: [], seatClaims: 0, presence: 0, reloads: 0 };
  const store = { session: { id: sid }, me: { uid, sessionId: sid, role: 'player', assignedRoleId: roleId, seatId: roleId },
    seats: [{ id: roleId, roleId, status: 'claimed', holderUid: uid }], communicationError: null,
    setMe(value) { this.me = value; observation.activeConsoleRoleId = value.activeConsoleRoleId ?? null; },
    setCommunicationError(value) { this.communicationError = value; } };
  const clientScope = vm.createContext({ useSessionStore: { getState: () => store },
    sessionAuthorityCheckpoint: () => ({ uid, sessionId: sid }), sessionAuthorityUid: s => s.me.uid,
    authorityCheckpointIsCurrent: c => c.uid === store.me.uid && c.sessionId === store.session.id,
    requireStationReselection: () => { store.communicationError = { kind: 'station-selection-required' }; },
    interception: e => e, claimSeat: async id => { assert.equal(id, roleId); calls.seatClaims++;
      assert.equal(store.me.role, 'player'); assert.equal(store.me.assignedRoleId, roleId);
      assert.equal(store.seats[0].status, 'open'); store.seats[0] = { ...store.seats[0], status: 'claimed', holderUid: uid };
      store.me.seatId = id; observation.seatId = id; return 'applied'; },
    refreshPresence: async id => { assert.equal(id, roleId); calls.presence++; } });
  new vm.Script(entrySource).runInContext(clientScope);
  const enterNormalStation = new vm.Script('selectConsoleRole').runInContext(clientScope);
  const row = { roleId, uidHash: uidHash(uid), displayName: 'Synthetic original Dione Captain' };
  const context = { roster: missingRoster ? [] : [row], gm: { page: { getByRole: (tag, opts) => {
    assert.equal(tag, 'button'); assert.equal(opts.name, 'Release role from ' + row.displayName); assert.equal(opts.exact, true);
    return { async click() { calls.sequence.push('release-click'); } }; } } }, crew: { page: { async reload() {
    calls.reloads++; calls.sequence.push('reload'); observation = { ...observation, generation: 4, ...restored };
  } } } };
  const options = { castingRoleId: requestedRole }; let result;
  const scope = vm.createContext({ assert, Date: { now: () => now }, uidHash, lifecycleCaseAvailability,
    createTwoBrowserGameplay: c => { assert.equal(c, context); return { async select(id, opts = {}) {
      calls.nativeEntry.push({ roleId: id, options: { ...opts }, at: now }); calls.sequence.push('normal-station-entry');
      assert.equal(id, roleId); assert.equal(observation.uidHash, actor.uidHash); assert.equal(observation.sessionId, sid);
      assert.equal(observation.freshness, 'server'); assert.equal(observation.privateAudienceMatches, true);
      now += readyAfter; await enterNormalStation(id); return context.crew;
    } }; } });
  const invoke = new vm.Script('(async function(context,options,perform,select,observeLifecycleActor,blocked,captureLifecycleUiAction,recoverLifecycleUiAction,untilLifecycle,castRestore,publicLifecycleReceipt) {\n' + body + '\n})')
    .runInContext(scope);
  return { calls, async run() { await invoke(context, options,
    async (id, c, action) => { assert.equal(id, 'casting-release'); assert.equal(c, context); result = await action(); },
    async (c, id, enter) => { assert.equal(c, context); calls.originalSelect.push({ roleId: id, enter }); },
    async s => { assert.equal(s, context.crew); return { ...observation }; },
    (id, reason) => ({ status: 'blocked', reason }),
    async (s, endpoint, choose) => { assert.equal(s, context.gm); assert.equal(endpoint, 'releaseRole'); await choose();
      observation.assignedRoleId = null; observation.seatId = null; store.me.assignedRoleId = null; store.me.seatId = null;
      store.seats[0] = { ...store.seats[0], status: 'open', holderUid: null }; calls.sequence.push('release');
      return { data: { targetUid: uid }, httpStatus: 200, result: { setupRevision: 41 } }; },
    async () => { calls.sequence.push('release-replay'); return { exact: true }; },
    async (s, expected, predicate, label, authority = {}) => { assert.equal(s, context.crew);
      calls.until.push({ expected, label, authority: { ...authority }, at: now });
      if (!predicate(observation)) throw timeout('ORIGINAL_STATION_NOT_RESTORED');
      assertOriginalActor(expected, observation, authority); return { ...observation }; },
    async (c, r) => { assert.equal(c, context); assert.equal(r, row);
      const patch = assignmentPatch({ roleId }); Object.assign(store.me, patch); Object.assign(observation, patch);
      store.seats[0] = { ...store.seats[0], status: foreignSeat ? 'claimed' : 'open', holderUid: foreignSeat ? 'synthetic-foreign-holder' : null };
      calls.sequence.push('assignment', 'assignment-replay'); return { assignment: { exact: true } }; },
    capture => ({ httpStatus: capture.httpStatus })); return result;
  } };
}

test('bridge: the actual server assignment patch grants a role and clears console authority without claiming a seat', () => {
  const patch = assignmentPatch({ roleId }); assert.deepEqual(Object.keys(patch).sort(), ['activeConsoleRoleId', 'assignedRoleId']);
  assert.equal(patch.assignedRoleId, roleId); assert.equal(patch.activeConsoleRoleId, null);
});
test('bridge: the actual casting case retains the original release, exact replay, reassignment and document reload', async () => {
  const f = fixture(); try { await f.run(); } catch (e) { assert.equal(e.code, 'ORIGINAL_STATION_NOT_RESTORED'); }
  assert.deepEqual(f.calls.sequence.slice(0, 6), ['release-click', 'release', 'release-replay', 'assignment', 'assignment-replay', 'reload']);
  assert.equal(f.calls.reloads, 1); assert.deepEqual(f.calls.originalSelect, [{ roleId, enter: false }]);
});
test('normal station entry restores the exact original seat after assignment-only reload advances the member generation', async () => {
  const f = fixture(); const result = await f.run(); assert.equal(result.stationRestored, true);
  assert.equal(result.restoredConnectionGeneration, 4); assert.equal(f.calls.nativeEntry.length, 1);
  assert.equal(f.calls.seatClaims, 1); assert.equal(f.calls.presence, 1);
  assert.equal(f.calls.until.at(-1).authority.rejoined, true);
});
test('normal station entry and the original strict restoration check share sixty seconds', async () => {
  const f = fixture({ readyAfter: 20_000 }); await f.run();
  assert.equal(f.calls.nativeEntry[0].options.deadlineAt, 60_000);
  assert.equal(f.calls.until.at(-1).authority.timeout, 40_000);
});
test('normal station entry cannot exhaust the original deadline and then receive another readiness budget', async () => {
  const f = fixture({ readyAfter: 60_001 }); await assert.rejects(() => f.run());
  assert.equal(f.calls.until.length, 1);
});
test('an explicit document reload cannot retain the old member generation', async () => {
  const f = fixture({ restored: { generation: 3 } }); await assert.rejects(() => f.run());
});
test('an active game cannot reuse the Cycle0 casting procedure', async () => {
  const f = fixture({ unavailable: true }); assert.equal((await f.run()).status, 'blocked'); assert.equal(f.calls.reloads, 0);
});
test('Press cannot use the core-role casting-seat procedure', async () => {
  const f = fixture({ requestedRole: 'press-officer' }); assert.equal((await f.run()).status, 'blocked'); assert.equal(f.calls.reloads, 0);
});
test('casting restoration requires the genuinely admitted original roster actor', async () => {
  const f = fixture({ missingRoster: true }); assert.equal((await f.run()).status, 'blocked'); assert.equal(f.calls.reloads, 0);
});
for (const [name, restored] of [['foreign UID', { uidHash: 'synthetic-foreign-uid-hash' }],
  ['foreign session', { sessionId: 'synthetic-foreign-session' }], ['foreign private audience', { privateAudienceMatches: false }],
  ['cached instead of server state', { freshness: 'cache' }]]) {
  test('casting-seat restoration rejects ' + name, async () => { await assert.rejects(() => fixture({ restored }).run()); });
}
test('normal station entry cannot replace a foreign station holder', async () => {
  const f = fixture({ foreignSeat: true }); await assert.rejects(() => f.run()); assert.equal(f.calls.seatClaims, 0);
});
