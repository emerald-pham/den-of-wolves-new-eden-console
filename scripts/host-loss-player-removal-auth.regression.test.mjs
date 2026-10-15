import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const root = process.env.HOST_LOSS_SOURCE_ROOT ?? '/Users/emeraldpham/Documents/Codex/2026-10-05/task/pc10-reboot-recovery/host-loss-player-alerts-repair-20261015';
const require = createRequire(`${root}/package.json`);
const ts = require('typescript');
function declaration(file, name) {
  const source = ts.createSourceFile(file, readFileSync(`${root}/${file}`, 'utf8'), ts.ScriptTarget.Latest, true);
  const node = source.statements.find(statement => statement.name?.text === name ||
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(entry => entry.name.getText(source) === name));
  assert.ok(node, `actual declaration ${name}`);
  return node.getText(source).replace(/^export\s+/, '');
}
const actualSource = [
  declaration('functions/src/identifiers.ts', 'isWireSafeEntityId'),
  declaration('functions/src/playerRemovalEvent.ts', 'PLAYER_REMOVAL_CAUSES'),
  declaration('functions/src/playerRemovalEvent.ts', 'parsePlayerRemovalEvent'),
  declaration('src/lib/firestore.ts', 'optionalIso'),
  declaration('src/lib/firestore.ts', 'subscribeGmPlayerRemovalEvents'),
].join('\n');
const js = ts.transpileModule(actualSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function fixture(initialAuth = { uid: 'gm1' }) {
  const state = {
    session: { id: 's1' }, me: { sessionId: 's1', uid: 'gm1', role: 'gm', connected: true, connectionGeneration: 4 },
    gmInstance: { id: 'bridge', sessionId: 's1', uid: 'gm1', claimedAt: '2026-10-15T06:00:00.000Z' },
    gmRecoveryPending: false, connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 2,
  };
  const authState = { currentUser: initialAuth };
  const authListeners = new Set();
  const storeListeners = new Set();
  let receive, stopped = false;
  const observed = [];
  const ports = {
    useSessionStore: { getState: () => state, subscribe: callback => { storeListeners.add(callback); return () => storeListeners.delete(callback); } },
    auth: () => authState,
    onAuthStateChanged: (_auth, callback) => { authListeners.add(callback); return () => authListeners.delete(callback); },
    db: () => ({}), collection: (_db, path) => ({ path }), query: ref => ref,
    where: (...args) => args, orderBy: (...args) => args, limit: (...args) => args,
    onSnapshot: (_query, _options, next) => { receive = next; return () => { stopped = true; }; },
  };
  const context = vm.createContext(ports);
  vm.runInContext(js, context);
  const stop = context.subscribeGmPlayerRemovalEvents('s1', entries => observed.push(JSON.parse(JSON.stringify(entries))));
  const value = { type: 'player-removal', sessionId: 's1', sourceId: 'damage-destroyed-icebreaker',
    playerUid: 'victim', playerName: 'Private victim name', roleId: 'icebreaker-miner', roleName: 'Icebreaker Miner',
    cause: 'ship-destroyed', shipId: 'icebreaker', cycle: 1, createdAt: '2026-10-15T06:53:19.000Z' };
  const snapshot = () => receive({ metadata: { fromCache: false }, docs: [{ id: `player-removal-${'a'.repeat(64)}`, data: () => value }] });
  return { state, authState, observed, snapshot, stop, storeListeners, authListeners, opened: () => typeof receive === 'function', stopped: () => stopped };
}

test('actual private subscription publishes the current original GM server payload', () => {
  const f = fixture(); f.snapshot(); assert.equal(f.observed.at(-1).length, 1); f.stop();
});
test('actual private subscription withdraws on original store-role revocation and rejects late callback', () => {
  const f = fixture(); f.snapshot(); f.state.me.role = 'player'; f.storeListeners.forEach(callback => callback());
  const count = f.observed.length; f.snapshot(); assert.equal(f.observed.length, count); assert.equal(f.observed.at(-1).length, 0);
  assert.equal(f.stopped(), true); f.stop();
});
for (const mode of ['signed-out', 'foreign-user']) test(`actual private subscription rejects late server payload after authenticated identity ${mode}`, () => {
  const f = fixture(); f.snapshot();
  f.authState.currentUser = mode === 'signed-out' ? null : { uid: 'foreign' };
  f.snapshot();
  assert.equal(f.observed.at(-1).length, 0, 'old GM store descriptor cannot authorize a private payload after actual Auth changed');
  assert.equal(f.stopped(), true); f.stop();
});

for (const mode of ['signed-out', 'foreign-user']) test(`actual private subscription refuses opening with authenticated identity ${mode}`, () => {
  const f = fixture(mode === 'signed-out' ? null : { uid: 'foreign' });
  assert.equal(f.opened(), false, 'stale GM store must not open a private query without matching actual Auth');
  assert.equal(f.observed.at(-1).length, 0); f.stop();
});
for (const mode of ['signed-out', 'foreign-user']) test(`actual private subscription clears retained UI immediately on Auth ${mode} without waiting for store or Firestore`, () => {
  const f = fixture(); f.snapshot();
  f.authState.currentUser = mode === 'signed-out' ? null : { uid: 'foreign' };
  f.authListeners.forEach(callback => callback(f.authState.currentUser));
  assert.equal(f.observed.at(-1).length, 0, 'Auth revocation must withdraw already rendered private records');
  assert.equal(f.stopped(), true); assert.equal(f.authListeners.size, 0); assert.equal(f.storeListeners.size, 0);
  f.snapshot(); assert.equal(f.observed.at(-1).length, 0); f.stop();
});
