import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { pc11ProofTiming } from './qualification/pc11-normal-start-adapter.mjs';

// Exercise finite native consumers without importing their executable runner.
// The test-first baseline is the accepted two-actor Highwall driver, whose
// cohort/cleanup/timing cannot establish this distinct three-actor audience claim.
const path = process.env.PC10_SCOUT_PRIVACY_RUNNER ?? new URL('./pc10-scout-private-audience-ui-proof.mjs', import.meta.url);
const source = await readFile(path, 'utf8'), require = createRequire(import.meta.url), ts = require('typescript');
const ast = ts.createSourceFile(String(path), source, ts.ScriptTarget.Latest, true);
const mainTry = ast.statements.find(ts.isTryStatement), work = [];
assert.ok(mainTry);
function visit(node) {
  if (ts.isArrowFunction(node) && ts.isBlock(node.body) && node.body.getText(ast).includes("launchSurface('browser-A-normal-GM')")) work.push(node.body);
  ts.forEachChild(node, visit);
}
visit(mainTry.tryBlock); assert.equal(work.length, 1);
const main = work[0].statements;
const plain = value => JSON.parse(JSON.stringify(value));
const check = { ...assert, deepEqual: (a, b, message) => assert.deepEqual(plain(a), plain(b), message) };
const execute = (body, context) => vm.runInNewContext(`(async()=>{${body}})()`, { assert: check, ...context });

test('private scout audience proof launches independent normal GM, Scientist and ordinary peer', async () => {
  const end = main.findIndex(node => node.getText(ast).includes("await mark('normal GM create and consent')"));
  assert.ok(end > 0); const launched = [];
  await execute(main.slice(0, end).map(node => node.getText(ast)).join('\n'), {
    mark: async () => {}, launchSurface: async label => { launched.push(label); return { label }; },
  });
  assert.deepEqual(launched, ['browser-A-normal-GM', 'browser-B-normal-Scientist', 'browser-C-normal-Peer']);
});

test('private scout proof admits and assigns both original normal members through the actual casting controls', async () => {
  const loop = main.find(node => ts.isForOfStatement(node) && node.getText(ast).includes('normalJoin(surface,label)'));
  assert.ok(loop); const joined = [], assigned = [], entered = [];
  const gm = { page: { getByRole: () => ({ getByLabel: () => ({ selectOption: async role => assigned.push(role) }),
    getByRole: () => ({ click: async () => {} }) }) } };
  await execute(loop.getText(ast), { gm, miner: { label: 'Miner' }, scientist: { label: 'Scientist' }, peer: { label: 'Peer' },
    roleIds: { Miner: 'icebreaker-miner', Scientist: 'shepherd-scientist', Peer: 'icebreaker-miner' },
    mark: async () => {}, normalJoin: async (_surface, label) => joined.push(label),
    observeLifecycleActor: async surface => ({ displayName: surface.label }), action: async (_s, _e, choose) => choose(),
    memberReady: async () => {}, enterRole: async (_s, label) => entered.push(label), claims: [] });
  assert.deepEqual(joined, ['Scientist', 'Peer']);
  assert.deepEqual(assigned, ['shepherd-scientist', 'icebreaker-miner']);
  assert.deepEqual(entered, ['Scientist', 'Peer']);
});

test('absolute parent allocation includes all earlier startup and retains the original cleanup reserve', () => {
  const start = ast.statements.findIndex(node => node.getText(ast).startsWith('startAt=Date.now()'));
  const end = ast.statements.indexOf(mainTry); assert.ok(start >= 0 && end > start);
  const FakeDate = class extends Date { static now() { return 1000000; } };
  const observed = vm.runInNewContext(`let startAt,totalEnd,workEnd;${ast.statements.slice(start, end).map(node => node.getText(ast)).join('\n')}\n({startAt,totalEnd,workEnd})`, {
    Date: FakeDate, evidence: {}, pc11ProofTiming,
    freeze: { macAllocation: { parentDeadlineEpochMs: 1140000 } }, process: { env: { PC10_PARENT_ALLOCATION_DEADLINE_MS: '1140000' } },
  });
  assert.equal(observed.totalEnd, 1140000);
  assert.equal(observed.workEnd, 1080000);
});

async function pointerCleanup({ foreign = false } = {}) {
  const nodes = [];
  function find(node) {
    if (ts.isArrowFunction(node) && ts.isBlock(node.body) && node.body.getText(ast).includes("where('sessionId','==',sid)") &&
        node.body.getText(ast).includes('Refuse unknown actor cleanup.')) nodes.push(node.body);
    ts.forEachChild(node, find);
  }
  find(mainTry.finallyBlock); assert.equal(nodes.length, 1);
  const actorUids = new Map([['GM1', 'own-gm'], ['Scientist', 'own-scientist'], ['Peer', 'own-peer']]);
  const ids = [...actorUids.values()]; if (foreign) ids[2] = 'foreign-actor';
  const docs = ids.map(id => ({ id, exists: true, ref: { id }, get: () => 'owned-session' }));
  const deleted = []; let reads = 0;
  const db = { collection: () => ({ where: () => ({ get: async () => reads++ === 0 ? { docs, size: 3 } : { docs: [], size: 0 } }) }),
    runTransaction: async consume => consume({ get: async ref => docs.find(doc => doc.id === ref.id), delete: ref => deleted.push(ref.id) }) };
  const cleanup = {};
  await execute(nodes[0].statements.map(node => node.getText(ast)).join('\n'), { db, actorUids, sid: 'owned-session', cleanup });
  return { cleanup, deleted };
}
test('cleanup handles all three verified original members without relaxing exact-session ownership', async () => {
  const { cleanup, deleted } = await pointerCleanup();
  assert.equal(cleanup.deletedOwnPointers, 3); assert.equal(cleanup.remainingOwnPointers, 0);
  assert.deepEqual(deleted, ['own-gm', 'own-scientist', 'own-peer']);
});
test('three-member cleanup still refuses an unknown actor before any deletion', async () => {
  await assert.rejects(pointerCleanup({ foreign: true }), /Refuse unknown actor cleanup/);
});
