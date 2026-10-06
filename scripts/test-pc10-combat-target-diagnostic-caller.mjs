import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import ts from 'typescript';

// Reuse only the retained native fixture's setup/functions, never its cases or
// assertions. The entire actual TSX view, Base callback, target helper,
// certificate and original actor guards execute unchanged. New inert plumbing
// supplies browser DOM/performance to its already serialized store callback,
// and counts existing reads. No transport, browser or gameplay is started.
const fixtureUrl = new URL('./test-pc10-base-range-target-certificate.mjs', import.meta.url);
const originalText = await readFile(fixtureUrl, 'utf8');
const file = ts.createSourceFile(fixtureUrl.pathname, originalText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const firstCase = file.statements.find(node => ts.isExpressionStatement(node) &&
  ts.isCallExpression(node.expression) && node.expression.expression.getText(file) === 'test');
assert.ok(firstCase);
let fixtureText = originalText.slice(0, firstCase.getStart(file));
const replaceExactlyOnce = (before, after) => {
  assert.equal(fixtureText.split(before).length, 2, 'Bind each NEW inert fixture extension to its exact retained source.');
  fixtureText = fixtureText.replace(before, after);
};
replaceExactlyOnce('async function readStore(callback, url, isGm) {',
  'async function readStore(callback, url, isGm) {\n    nativeDiagnosticCounts.metadata++;');
replaceExactlyOnce('const browser = createContext({});',
  'const browser = createContext({ document: dom.window.document, window: dom.window, navigator: dom.window.navigator, performance: { timeOrigin: 123456, now: () => 20 } });');
replaceExactlyOnce('observe: async () => ({ ...(isGm ? gmActor : crewActor()) }),',
  'observe: async () => { nativeDiagnosticCounts.observe++; return { ...(isGm ? gmActor : crewActor()) }; },');
replaceExactlyOnce("report = JSON.parse(text);", "nativeDiagnosticCounts.saves++; report = JSON.parse(text);");
fixtureText += '\nexport const nativeDiagnosticCounts = { metadata: 0, observe: 0, saves: 0 };\n' +
  'export { nativeFixture, currentView, clickBoundary, cleanup };\n';
const context = createContext({ URL, console, structuredClone });
const module = new SourceTextModule(fixtureText, { context, identifier: fixtureUrl.href,
  initializeImportMeta: meta => { meta.url = fixtureUrl.href; } });
await module.link(async specifier => {
  const exports = await import(specifier.startsWith('.') ? new URL(specifier, fixtureUrl).href : specifier);
  return new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await module.evaluate();
const { nativeFixture, currentView, clickBoundary, cleanup, nativeDiagnosticCounts: counts } = module.namespace;
function resetCounts() { for (const key of Object.keys(counts)) counts[key] = 0; }
function diagnostics(f) { return f.report().observations.filter(row => row.stage === 'range target checkpoint diagnostics'); }
function view() {
  return currentView({ currentStep: 'medium-range', range: 'medium-range',
    eligibleActions: [{ actionId: 'native-missiles', sourceId: 'aegis-missile-launchers', range: 'medium-range' }],
    hitSlots: [{ actionId: 'native-missiles', count: 2, damagePerHit: 1 }] });
}
const noPrivateValues = rows => {
  const text = JSON.stringify(rows);
  for (const value of ['native-session','native-original-attack','native-missiles','contact-1','contact-2','shepherd','quellon'])
    assert.equal(text.includes(value), false, 'Retain fingerprints/counts/flags only.');
};

test('public Base buffers each existing target checkpoint until its original certificate/failure save', async () => {
  resetCounts(); const f = nativeFixture({ view: view() });
  await assert.rejects(f.run(), error => error === clickBoundary);
  assert.equal(f.certificates.length, 1); assert.equal(f.certificates[0].matched, true);
  assert.equal(f.selected.length, 2); assert.equal(f.clicks.length, 1);
  assert.equal(f.reads.length, 1); assert.equal(f.certificateReads(), 1);
  const rows = diagnostics(f);
  assert.equal(rows.length, 1, 'Attach one new batch; preserve the original certificate observation.');
  assert.equal(rows[0].samples.length, 12, 'Eight original field checkpoints plus four original certificate checkpoints.');
  assert.deepEqual(rows[0].samples.map(sample => sample.checkpointOrdinal), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(rows[0].samples.map(sample => sample.checkpointStage), Array(8).fill('selection').concat(Array(4).fill('certificate')));
  assert.equal(rows[0].originalDeadlineAt, f.deadline());
  assert.equal(rows[0].reactFormKeyObserved, false); assert.equal(rows[0].continuousMountObserved, false);
  assert.equal(rows[0].samples[0].dom.fieldCount, 2);
  assert.notEqual(rows[0].samples[4].dom.fields[0].valueFingerprint, rows[0].samples[0].dom.fields[0].valueFingerprint);
  assert.equal(rows[0].samples[7].dom.commitEnabled, true);
  noPrivateValues(rows);
  assert.equal(counts.saves, 3, 'Only original initial, certificate and failure save calls; no per-checkpoint save.');
  // These unchanged baseline counts include normal entry/readiness/receipt
  // guards as well as the12 helper checkpoints. No diagnostic sample is added.
  assert.equal(counts.metadata, 16); assert.equal(counts.observe, 50);
  assert.ok(f.clicks[0].options.timeout <= f.clicks[0].remainingMs + 1);
  assert.equal(f.report().requests.length, 0); cleanup();
});

test('a lost actual controlled draft remains failed and retained without a reset, retry or pass', async () => {
  resetCounts(); const f = nativeFixture({ view: view(), afterSelections: effects => effects.remount() });
  await assert.rejects(f.run(), /Final range target source and paint certificate failed/);
  assert.equal(f.certificates[0].matched, false); assert.equal(f.clicks.length, 0);
  assert.equal(f.selected.length, 2); assert.equal(f.reads.length, 1); assert.equal(f.certificateReads(), 1);
  const rows = diagnostics(f); assert.equal(rows.length, 1); assert.equal(rows[0].samples.length, 12);
  assert.equal(rows[0].samples.at(-1).dom.commitEnabled, false);
  assert.equal(rows[0].continuousMountObserved, false, 'The inert real-React remount is not inferred from discrete samples.');
  noPrivateValues(rows); assert.equal(counts.saves, 3); cleanup();
});

test('a real original assignment change after selection still fails its existing held guard and saves only observed diagnostics', async () => {
  resetCounts(); const actorDrift = {};
  const f = nativeFixture({ view: view(), actorDrift, afterSelections: () => { actorDrift.assignedRoleId = 'wing-commander'; } });
  await assert.rejects(f.run(), /Original combat assignedRoleId changed/);
  assert.equal(f.selected.length, 2); assert.equal(f.clicks.length, 0);
  const rows = diagnostics(f); assert.equal(rows.length, 1); assert.equal(rows[0].samples.length, 8);
  assert.equal(rows[0].samples.at(-1).checkpointOrdinal, 8);
  assert.equal(counts.saves, 2, 'Use only the original initial and failure save boundaries.');
  noPrivateValues(rows); cleanup();
});

test('original deadline expiry while saving the certificate cannot get a new sample or UI click budget', async () => {
  resetCounts(); const f = nativeFixture({ view: view(), expireWhileSaving: true });
  await assert.rejects(f.run(), /original target certificate decision deadline/);
  assert.equal(f.selected.length, 2); assert.equal(f.clicks.length, 0);
  const rows = diagnostics(f); assert.equal(rows.length, 1); assert.equal(rows[0].samples.length, 11);
  assert.equal(rows[0].originalDeadlineAt, f.deadline()); assert.equal(f.reads.length, 1);
  assert.equal(counts.saves, 3); noPrivateValues(rows); cleanup();
});
