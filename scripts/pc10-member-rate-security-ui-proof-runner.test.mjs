import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const runner = join(root, 'scripts/pc10-member-rate-security-ui-proof.mjs');
const router = join(root, 'scripts/pc10-security-http-proof.mjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function runActualRunner(mode) {
  const temporary = await mkdtemp(join(tmpdir(), 'pc10-p631-runner-consumer-'));
  const evidenceDirectory = join(temporary, 'private-evidence');
  const preflightPath = join(temporary, 'preflight.json');
  const freezePath = join(temporary, 'freeze.json');
  const functionsLogPath = join(temporary, 'functions.log');
  const launcherPath = join(temporary, 'retained-launcher.txt');
  const loaderPath = join(temporary, 'loader.mjs');
  const preloadPath = join(temporary, 'preload.mjs');
  const callPath = join(temporary, 'call-runner.mjs');
  const tracePath = join(temporary, 'trace.json');
  const sourceCommit = 'controlled-p631-source-commit';
  const sourceTree = 'controlled-p631-source-tree';
  const allocationDeadlineMs = Date.now() + 300_000;
  const runtime = { baseUrl: 'http://127.0.0.1:5174', projectId: 'demo-pc10-owner-integrated-2',
    ports: { auth: 9109, functions: 5011, firestore: 8090 } };
  const scope = { sessions: 0, connectedPlayers: 0, connectedGmInstances: 0 };
  const hashes = { trackedTreeSha256: 'a'.repeat(64), compiledTreeSha256: 'b'.repeat(64),
    javascriptTreeSha256: 'c'.repeat(64) };
  const launcherBytes = Buffer.from('controlled pinned launcher\n');
  await writeFile(launcherPath, launcherBytes);
  const installedLauncher = { path: launcherPath, sha256: sha(launcherBytes) };
  const preflight = { status: 'READY_FOR_P631_TWO_ACTOR',
    source: { sourceCommit, sourceTree, ...hashes }, runtime, scope, installedLauncher };
  const preflightBytes = Buffer.from(JSON.stringify(preflight));
  await writeFile(preflightPath, preflightBytes);
  const runnerBytes = await readFile(runner), routerBytes = await readFile(router);
  const freeze = { status: 'FROZEN_BEFORE_EXECUTION', sourceCommit, sourceTree, runtime, scope,
    preflight: { path: preflightPath, sha256: sha(preflightBytes) }, installedLauncher,
    macAllocation: { status: 'EXPLICIT_PARENT_ALLOCATION_GRANTED', parentDeadlineEpochMs: allocationDeadlineMs },
    review: { currentStatus: 'PASS_BOUNDED_SOURCE_ONLY', sourceCommit },
    runner: { path: 'scripts/pc10-member-rate-security-ui-proof.mjs', sha256: sha(runnerBytes) },
    modeRouter: { path: 'scripts/pc10-security-http-proof.mjs', sha256: sha(routerBytes) },
    compiledSourceBuild: { exitCode: 0, compiledTreeSha256: hashes.compiledTreeSha256, sourceCommit },
    sourceBinding: hashes };
  await writeFile(freezePath, JSON.stringify(freeze));

  const runnerUrl = pathToFileURL(runner).href;
  const fakePlaywrightPath = join(temporary, 'fake-playwright.mjs');
  const fakeModulesPath = join(temporary, 'fake-node-modules.mjs');
  const fakeChildProcessPath = join(temporary, 'fake-child-process.mjs');
  const fakeBindingPath = join(temporary, 'fake-gate-binding.mjs');
  const fakeProofHelpersPath = join(temporary, 'fake-proof-helpers.mjs');
  const fakeLifecyclePath = join(temporary, 'fake-lifecycle.mjs');
  await writeFile(loaderPath, `
const target = ${JSON.stringify(runnerUrl)};
const playwright = ${JSON.stringify(pathToFileURL(fakePlaywrightPath).href)};
const modules = ${JSON.stringify(pathToFileURL(fakeModulesPath).href)};
const childProcess = ${JSON.stringify(pathToFileURL(fakeChildProcessPath).href)};
const binding = ${JSON.stringify(pathToFileURL(fakeBindingPath).href)};
const proofHelpers = ${JSON.stringify(pathToFileURL(fakeProofHelpersPath).href)};
const lifecycle = ${JSON.stringify(pathToFileURL(fakeLifecyclePath).href)};
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL === target) {
    if (specifier === 'playwright') return { url: playwright, shortCircuit: true };
    if (specifier === 'node:module') return { url: modules, shortCircuit: true };
    if (specifier === 'node:child_process') return { url: childProcess, shortCircuit: true };
    if (specifier === './pc10-gate2-functional-proof.mjs') return { url: binding, shortCircuit: true };
    if (specifier === './pc10-full-game-demo-proof-helpers.mjs') return { url: proofHelpers, shortCircuit: true };
    if (specifier === './pc10-member-gm-lifecycle-ui-proof.mjs') return { url: lifecycle, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`);
  await writeFile(preloadPath, `
const NativeDate = Date;
globalThis.__P631_CONTROLLED_CLOCK = { now: NativeDate.now(), checkboxTimeouts: [], observerTimeouts: [] };
class ControlledDate extends NativeDate { static now() { return globalThis.__P631_CONTROLLED_CLOCK.now; } }
globalThis.Date = ControlledDate;
globalThis.fetch = async () => ({ status: 200, text: async () => '' });
`);
  await writeFile(callPath, `
import { runP631MemberRateSecurityUiProof } from ${JSON.stringify(runnerUrl)};
await runP631MemberRateSecurityUiProof();
`);
  await writeFile(fakeChildProcessPath, `
export function execFileSync(_file, args) {
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') return ${JSON.stringify(sourceCommit + '\n')};
  if (args[0] === 'rev-parse' && args[1] === 'HEAD^{tree}') return ${JSON.stringify(sourceTree + '\n')};
  if (args[0] === 'status' && args[1] === '--porcelain') return '';
  throw new Error('Unexpected controlled git request.');
}
`);
  await writeFile(fakeBindingPath, `
export async function capturePc10Gate2SourceBinding() {
  return { sourceCommit: ${JSON.stringify(sourceCommit)}, trackedClean: true,
    trackedTreeSha256: ${JSON.stringify(hashes.trackedTreeSha256)},
    compiledTreeSha256: ${JSON.stringify(hashes.compiledTreeSha256)},
    javascriptTreeSha256: ${JSON.stringify(hashes.javascriptTreeSha256)} };
}
`);
  await writeFile(fakeProofHelpersPath, `
export function proofRuntimeFromViteSource() { return { projectId: 'demo-pc10-owner-integrated-2',
  useEmulators: true, ports: { auth: 9109, functions: 5011, firestore: 8090 } }; }
export function validateProofRuntime(runtime) { return runtime; }
export async function observeFullGameDemoPresentationMember() {
  throw new Error('CONTROLLED_STOP_AFTER_CONSENT');
}
`);
  await writeFile(fakeLifecyclePath, `
export async function captureLifecycleUiAction() { throw new Error('Unexpected lifecycle action in controlled runner test.'); }
export async function openLifecycleSettings() { throw new Error('Unexpected settings path in controlled runner test.'); }
export async function closeLifecycleSettings() {}
`);
  await writeFile(fakeModulesPath, `
const empty = () => ({ size: 0, docs: [] });
const db = {
  collection: () => ({ get: async () => empty(), where: () => ({ get: async () => empty() }) }),
  collectionGroup: () => ({ where: () => ({ get: async () => empty() }) }),
  doc: path => ({ path, get: async () => ({ exists: false, data: () => undefined,
    updateTime: { toMillis: () => 0 } }), delete: async () => {} }),
  recursiveDelete: async () => {},
  runTransaction: async operation => operation({ get: async () => ({ exists: false }), delete: () => {} }),
  terminate: async () => {},
};
const auth = { getUser: async () => ({ metadata: { creationTime: new Date(Date.now()).toISOString() } }),
  deleteUser: async () => {} };
export function createRequire() {
  return specifier => {
    if (specifier === 'firebase-admin/app') return { getApps: () => [], initializeApp: () => ({}) };
    if (specifier === 'firebase-admin/firestore') return { getFirestore: () => db };
    if (specifier === 'firebase-admin/auth') return { getAuth: () => auth };
    if (String(specifier).endsWith('functions/lib/callableRateLimit.js'))
      return { callableRateLimitDocumentId: () => 'controlled-marker' };
    throw new Error('Unexpected controlled module request.');
  };
}
`);
  await writeFile(fakePlaywrightPath, `
import { writeFile } from 'node:fs/promises';
const trace = () => globalThis.__P631_CONTROLLED_CLOCK;
const flush = async () => writeFile(process.env.PC10_P631_TEST_TRACE,
  JSON.stringify(trace()), { mode: 0o600 });
class Locator {
  constructor(name) { this.name = String(name ?? ''); }
  async isVisible() { return !this.name.startsWith('/^REDUCED MOTION/i'); }
  async isEnabled() { return true; }
  async count() { return 3; }
  async all() { return [1, 2, 3].map(index => new Locator('checkbox-' + index)); }
  getByRole(role, options = {}) { return new Locator(options.name ?? role); }
  async click(options = {}) { trace().clickTimeouts ??= []; trace().clickTimeouts.push(options.timeout ?? null); await flush(); }
  async fill() {}
  async selectOption() {}
  async check(options = {}) {
    trace().checkboxTimeouts.push(options.timeout ?? null);
    trace().now += 10_000;
    await flush();
  }
  async waitFor() {}
}
class Page {
  constructor() { this.listeners = new Map(); this.frame = {}; }
  on(name, callback) { this.listeners.set(name, callback); }
  off(name) { this.listeners.delete(name); }
  setDefaultTimeout() {}
  setDefaultNavigationTimeout() {}
  async goto() {}
  url() { return 'http://127.0.0.1:5174/'; }
  mainFrame() { return this.frame; }
  getByRole(role, options = {}) { return new Locator(options.name ?? role); }
  getByLabel(name) { return new Locator(name); }
  locator(name) { return new Locator(name); }
  async evaluate() { return 'controlled-gm-uid'; }
  async waitForResponse(predicate, options = {}) {
    trace().observerTimeouts.push(options.timeout ?? null);
    await flush();
    if (process.env.PC10_P631_TEST_MODE === 'observer-failure')
      throw new Error('PC10_PRIVATE_FAILURE_CANARY');
    const request = { method: () => 'POST', postDataJSON: () => ({ data: {
      sessionId: 'owned-p631-session', instanceId: 'owned-p631-gm', requestId: 'original-ui-request' } }) };
    const response = { url: () => 'http://127.0.0.1:5011/us-central1/createSession', request: () => request,
      status: () => 200, json: async () => ({ result: { session: { id: 'owned-p631-session', joinCode: '1234' } } }) };
    if (!predicate(response)) throw new Error('Controlled response did not match the actual observer predicate.');
    return response;
  }
}
export const chromium = { launch: async () => {
  let connected = true;
  return { close: async () => { connected = false; }, isConnected: () => connected,
    newContext: async () => ({ route: async () => {}, newPage: async () => new Page() }) };
} };
`);

  const env = { ...process.env,
    PC10_SOURCE_ROOT: root,
    PC10_OWNER_SOURCE_COMMIT: sourceCommit,
    PC10_PARENT_ALLOCATION_DEADLINE_MS: String(allocationDeadlineMs),
    PC10_P631_BASE_URL: runtime.baseUrl,
    PC10_P631_PROJECT_ID: runtime.projectId,
    PC10_P631_AUTH_PORT: '9109', PC10_P631_FUNCTIONS_PORT: '5011', PC10_P631_FIRESTORE_PORT: '8090',
    PC10_P631_EVIDENCE_DIRECTORY: evidenceDirectory,
    PC10_P631_LAUNCH_PREFLIGHT_PATH: preflightPath,
    PC10_P631_SOURCE_FREEZE_PATH: freezePath,
    PC10_P631_FUNCTIONS_LOG_PATH: functionsLogPath,
    PC10_P631_PINNED_LAUNCHER_PATH: launcherPath,
    PC10_P631_TEST_MODE: mode,
    PC10_P631_TEST_TRACE: tracePath,
  };
  const child = spawnSync(process.execPath,
    ['--no-warnings', '--experimental-loader', loaderPath, '--import', preloadPath, callPath],
    { cwd: root, env, encoding: 'utf8', timeout: 10_000 });
  let trace = null, ownerResult = null, failureArtifacts = [];
  try { trace = JSON.parse(await readFile(tracePath, 'utf8')); } catch { /* The earliest controlled stop may precede a trace write. */ }
  try { ownerResult = JSON.parse(await readFile(join(evidenceDirectory, 'OWNER_RESULT.json'), 'utf8')); }
  catch { /* A source-freeze failure has no owner result. */ }
  try {
    failureArtifacts = (await readdir(evidenceDirectory)).filter(name => name.startsWith('original-failure-'));
  } catch { /* The strict source-freeze gate may not create evidence. */ }
  return { child, trace, ownerResult, failureArtifacts, evidenceDirectory, temporary };
}

test('P631 runner preserves original UI failure stage and held failure evidence through cleanup', async () => {
  const run = await runActualRunner('observer-failure');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.ownerResult?.failureStage, 'normal GM create, consent, local authorization and original prepare',
      run.child.stdout + run.child.stderr);
    assert.equal(run.failureArtifacts.length, 1, 'Retain the first actual observer failure in the private evidence directory.');
    const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
    assert.match(retained.originalError?.message ?? '', /PC10_PRIVATE_FAILURE_CANARY/);
    assert.match(retained.originalError?.heldObservationsInspect ?? '', /observeUiReceipt/);
    assert.equal(run.child.stdout.includes('PC10_PRIVATE_FAILURE_CANARY'), false,
      'Raw failure details remain outside stdout evidence.');
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 consent controls share one original UI deadline across all checkboxes', async () => {
  const run = await runActualRunner('consent-deadline');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.trace?.checkboxTimeouts?.length, 3, run.child.stdout + run.child.stderr);
    assert.ok(run.trace.checkboxTimeouts.every(timeout => Number.isFinite(timeout) && timeout > 0 && timeout <= 35_000),
      `Every consent checkbox must receive a bounded remaining timeout. Observed ${JSON.stringify(run.trace?.checkboxTimeouts)}.`);
    assert.ok(run.trace.checkboxTimeouts[0] >= run.trace.checkboxTimeouts[1] &&
      run.trace.checkboxTimeouts[1] >= run.trace.checkboxTimeouts[2],
    `Checkbox controls must share a decreasing deadline, not restart 35 seconds each. Observed ${JSON.stringify(run.trace.checkboxTimeouts)}.`);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});
