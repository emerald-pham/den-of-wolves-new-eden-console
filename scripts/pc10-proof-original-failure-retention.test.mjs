import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, stat, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

// Exercise the actual full-game catch/finally, including secondary reporting
// and cleanup failures. OLD Source runs normally; it has no retention calls.
const source = await readFile(new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url), 'utf8');
const a = source.lastIndexOf('  } catch (error) {'), b = source.indexOf('\n}\n\nif (process.argv', a);
assert.ok(a > 0 && b > a, 'Bind the actual terminal catch and browser finally.');
const body = source.slice(a, b);
let helper;
try { helper = await import('./pc10-proof-failure-evidence.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
async function fixture({ reportFailure = false, closeFailure = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-original-failure-'));
  const original = Object.assign(new Error('Synthetic original assertion message.'),
    { name: 'AssertionError', actual: 3, expected: 2, operator: 'strictEqual', code: 'ERR_ASSERTION' });
  original.cause = Object.freeze(new Error('Synthetic original nested cause.'));
  const secondaryReport = new Error('Synthetic diagnostic write failure.'), secondaryClose = new Error('Synthetic browser close failure.');
  const recorded = [], writes = [], closed = [], evidence = {}, snapshot = { generation: 3, uidHash: 'synthetic-original-hash' };
  const scope = vm.createContext({ console: { error() {} }, URL, JSON,
    primary: original, directory, root: 'synthetic-source', sourceCommit: 'synthetic-exact-source',
    builtRuntimeIndexSha256: 'synthetic-index', presentationSourceHashes: {}, evidence, stage: 'synthetic-controller-return',
    roleSurfaces: [], transitions: [], calls: [], requests: [], errors: [], remoteRequests: [],
    surfaces: [{ label: 'original-crew', observe: async () => snapshot, page: { url: () => 'http://127.0.0.1/#/demo-actors', screenshot: async () => {} } }],
    browsers: [0, 1].map(i => ({ async close() { closed.push(i); if (closeFailure && i === 0) throw secondaryClose; } })),
    execFileSync: () => 'synthetic-exact-source', readFile: async () => 'synthetic-index',
    createHash: () => ({ update() { return this; }, digest() { return 'synthetic-index'; } }),
    presentationReadinessSourceHashes: async () => ({}),
    writeFile: async (path, bytes) => { writes.push({ path, bytes }); if (reportFailure) throw secondaryReport; },
    retainProofFailure: async (dir, label, error, context) => {
      recorded.push({ error, context, label }); assert.ok(helper, 'Source retention calls require the real helper.');
      return helper.retainProofFailure(dir, label, error, context);
    },
  });
  const invoke = new vm.Script('(async function() { let primaryFailure; try { throw primary;\n' + body + '\n})',
    { filename: 'actual-full-game-terminal-failure-block' }).runInContext(scope);
  return { directory, original, secondaryReport, secondaryClose, recorded, writes, closed, snapshot, async run() {
    try { await invoke(); } catch (error) { return error; } throw Error('The original failure must still be thrown.');
  }, async cleanup() { await rm(directory, { recursive: true }); } };
}
test('bridge: ordinary terminal failure rethrows the exact original error and closes both browsers', async () => {
  const f = await fixture(); try { assert.equal(await f.run(), f.original); assert.deepEqual(f.closed, [0, 1]); }
  finally { await f.cleanup(); }
});
test('terminal failure retains the full original stack, cause and held state in a private artifact', async () => {
  const f = await fixture(); try {
    assert.equal(await f.run(), f.original); assert.equal(f.recorded[0]?.error, f.original);
    const names = await readdir(f.directory); assert.equal(names.length, 1);
    const path = join(f.directory, names[0]); assert.equal((await stat(path)).mode & 0o777, 0o600);
    const raw = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(raw.originalError.message, f.original.message); assert.equal(raw.originalError.stack, f.original.stack);
    assert.equal(raw.originalError.cause.stack, f.original.cause.stack);
    assert.match(raw.originalError.fullInspect, /actual: 3/); assert.match(raw.originalError.fullInspect, /expected: 2/);
    assert.match(raw.contextInspect, /synthetic-controller-return/);
  } finally { await f.cleanup(); }
});
test('a diagnostic write failure cannot replace the original error and its stack', async () => {
  const f = await fixture({ reportFailure: true }); try {
    assert.equal(await f.run(), f.original); assert.deepEqual(f.closed, [0, 1]);
    assert.ok(f.recorded.some(r => r.error === f.original)); assert.ok(f.recorded.some(r => r.error === f.secondaryReport));
  } finally { await f.cleanup(); }
});
test('a browser close failure preserves the original error and still attempts every browser close', async () => {
  const f = await fixture({ closeFailure: true }); try {
    assert.equal(await f.run(), f.original); assert.deepEqual(f.closed, [0, 1]);
    assert.ok(f.recorded.some(r => r.error === f.original)); assert.ok(f.recorded.some(r => r.error === f.secondaryClose));
  } finally { await f.cleanup(); }
});
