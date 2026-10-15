import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const root = '/Users/emeraldpham/Documents/Codex/2026-10-05/task/pc10-reboot-recovery/host-loss-player-alerts-repair-20261015';
const commit = process.env.HOST_LOSS_REVIEW_COMMIT;
const ts = createRequire(`${root}/package.json`)('typescript');
const file = path => commit ? execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) : readFileSync(`${root}/${path}`, 'utf8');
function declaration(path, name) {
  const source = ts.createSourceFile(path, file(path), ts.ScriptTarget.Latest, true);
  const node = source.statements.find(statement => statement.name?.text === name || ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(entry => entry.name.getText(source) === name));
  assert.ok(node, name); return node.getText(source).replace(/^export\s+/, '');
}
const actual = [
  ['functions/src/identifiers.ts', 'isWireSafeEntityId'],
  ['functions/src/playerRemovalEvent.ts', 'PLAYER_REMOVAL_CAUSES'],
  ['functions/src/playerRemovalEvent.ts', 'parsePlayerRemovalEvent'],
  ['functions/src/playerRemovalAlert.ts', 'writePlayerRemovalAlert'],
  ['functions/src/escapeState.ts', 'isRecord'],
  ['functions/src/escapeState.ts', 'parsePlayerEscapeState'],
  ['functions/src/escapeState.ts', 'escapeStateForDestruction'],
  ['functions/src/crewAccess.ts', 'shipForRole'],
  ...['playerEscapeState', 'playerAuthoritativeVesselIds', 'playerHoldsDestroyedShip', 'markPlayersForShipEscape'].map(name => ['functions/src/index.ts', name]),
].map(([path, name]) => declaration(path, name)).join('\n');
const js = ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture() {
  const records = new Map();
  const context = vm.createContext({ createHash, ROLE_IDS: ['icebreaker-miner'],
    // Pure catalog lookups are not the boundary being varied.
    roleBriefFor: id => id === 'icebreaker-miner' ? { vesselName: 'Icebreaker', roleName: 'Miner' } : undefined,
    replacementRoleFor: () => undefined,
    FieldValue: { serverTimestamp: () => 'server-time' },
    db: { doc: path => ({ path }) },
    commandError: (_code, message) => new Error(message),
  });
  vm.runInContext(js, context);
  const victim = () => { const fields = { role: 'player', assignedRoleId: 'icebreaker-miner', displayName: 'Original Miner' };
    return { exists: true, id: 'miner', ref: { path: 'sessions/s1/players/miner' }, get: key => fields[key] }; };
  const tx = { update: () => undefined, set: (ref, value) => records.set(ref.path, JSON.parse(JSON.stringify(value))) };
  const mark = (revision, cycle, player = victim(), incident = `ship-damage:request-${cycle}-${revision}`) => context.markPlayersForShipEscape(tx, 's1', [player], 'icebreaker', 'damage-destroyed-icebreaker', revision, cycle, incident);
  return { records, mark, victim };
}
test('actual source destruction callers use independent vessel, maintenance and attack revision domains', () => {
  const source = file('functions/src/index.ts');
  assert.match(source, /markPlayersForShipEscape\(\s*tx, change\.sessionId,[\s\S]*?currentRevision \+ 1,/);
  assert.match(source, /markPlayersForShipEscape\(\s*tx, data\.sessionId,[\s\S]*?result\.cycle\.revision,/);
  assert.match(source, /markPlayersForShipEscape\(tx, sessionId, destroyedPlayers, target, destruction\.eventId, nextRevision,/);
});
test('actual destruction helper keeps two incidents with differing numeric revisions', () => {
  const f = fixture(); f.mark(9, 1); f.mark(10, 2); assert.equal(f.records.size, 2);
});
test('actual destruction helper does not generate another alert for a pending original escape', () => {
  const f = fixture(); f.mark(9, 1); const original = [...f.records]; const player = f.victim();
  const get = player.get; player.get = key => key === 'escapeState' ? { status: 'pending', shipId: 'icebreaker', destructionEventId: 'damage-destroyed-icebreaker', revision: 9 } : get(key);
  f.mark(9, 1, player); assert.deepEqual([...f.records], original);
});
test('distinct later destruction from another revision domain must retain original victim incident', () => {
  const f = fixture(); f.mark(9, 1); const first = [...f.records];
  // Prepared fresh current-victim input at a later incident, not a claimed
  // full repair/flee/reassignment/native path. Independent caller domains may
  // both legitimately have numeric9; cycle2 makes the incidents distinct.
  f.mark(9, 2);
  assert.equal(f.records.size, 2, 'independent source revision domains must not overwrite the original incident');
  assert.deepEqual(f.records.get(first[0][0]), first[0][1]);
});

test('distinct caller incidents within the same cycle and equal numeric revision preserve both records', () => {
  const f = fixture(); f.mark(9, 1, f.victim(), 'ship-damage:damage-one'); const first = [...f.records];
  f.mark(9, 1, f.victim(), 'maintenance:maintenance-one');
  assert.equal(f.records.size, 2, 'caller domain and original receipt identity distinguish incidents in the same cycle');
  assert.deepEqual(f.records.get(first[0][0]), first[0][1]);
});

// Later GREEN qualification of the real four call-site expressions, not an
// absent-argument RED: evaluate their original command/attack identities and
// feed them to the actual helper/writer with identical numeric CAS revisions.
test('actual four callers retain their original domain and command or attack identity', () => {
  const source = ts.createSourceFile('index.ts', file('functions/src/index.ts'), ts.ScriptTarget.Latest, true);
  const keys = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'markPlayersForShipEscape') {
      assert.equal(node.arguments.length, 8);
      keys.push(vm.runInNewContext(node.arguments[7].getText(source), {
        requestId: 'original-jump', attackId: 'original-attack',
        identity: { requestId: 'original-draw' }, data: { requestId: 'original-maintenance' },
      }));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.deepEqual(keys.sort(), ['jump-damage:original-jump', 'maintenance:original-maintenance',
    'ship-damage:original-draw', 'wolf-attack:original-attack'].sort());
  const f = fixture();
  for (const key of keys) f.mark(9, 1, f.victim(), key);
  assert.equal(f.records.size, 4);
  const original = [...f.records]; f.mark(9, 1, f.victim(), keys[0]);
  assert.deepEqual([...f.records], original);
});
