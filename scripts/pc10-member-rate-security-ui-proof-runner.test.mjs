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

async function runActualRunner(mode, safetyTimeoutMs = 10_000) {
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
  const fakeLifecycleDepsPath = join(temporary, 'fake-lifecycle-deps.mjs');
  const fakeCorePath = join(temporary, 'fake-core.mjs');
  await writeFile(loaderPath, `
const target = ${JSON.stringify(runnerUrl)};
const actualLifecycle = ${JSON.stringify(pathToFileURL(join(root, 'scripts/pc10-member-gm-lifecycle-ui-proof.mjs')).href)};
const playwright = ${JSON.stringify(pathToFileURL(fakePlaywrightPath).href)};
const modules = ${JSON.stringify(pathToFileURL(fakeModulesPath).href)};
const childProcess = ${JSON.stringify(pathToFileURL(fakeChildProcessPath).href)};
const binding = ${JSON.stringify(pathToFileURL(fakeBindingPath).href)};
const proofHelpers = ${JSON.stringify(pathToFileURL(fakeProofHelpersPath).href)};
const lifecycle = ${JSON.stringify(pathToFileURL(fakeLifecyclePath).href)};
const lifecycleDeps = ${JSON.stringify(pathToFileURL(fakeLifecycleDepsPath).href)};
const core = ${JSON.stringify(pathToFileURL(fakeCorePath).href)};
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL === actualLifecycle) {
    if (specifier === './pc10-full-game-demo-proof-helpers.mjs') return { url: proofHelpers, shortCircuit: true };
    if (specifier === './pc10-two-browser-gameplay.mjs') return { url: lifecycleDeps, shortCircuit: true };
  }
  if (context.parentURL === target) {
    if (specifier === 'playwright') return { url: playwright, shortCircuit: true };
    if (specifier === 'node:module') return { url: modules, shortCircuit: true };
    if (specifier === 'node:child_process') return { url: childProcess, shortCircuit: true };
    if (specifier === './pc10-gate2-functional-proof.mjs') return { url: binding, shortCircuit: true };
    if (specifier === './pc10-full-game-demo-proof-helpers.mjs') return { url: proofHelpers, shortCircuit: true };
    if (specifier === './pc10-member-gm-lifecycle-ui-proof.mjs') {
      if (process.env.PC10_P631_TEST_MODE === 'readiness-real-claim') return nextResolve(specifier, context);
      return { url: lifecycle, shortCircuit: true };
    }
    if (specifier === './pc10-member-rate-security-ui-proof-core.mjs' &&
        process.env.PC10_P631_TEST_MODE?.startsWith('readiness-')) return { url: core, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`);
  await writeFile(preloadPath, `
const NativeDate = Date;
globalThis.__P631_CONTROLLED_CLOCK = { now: NativeDate.now(), checkboxTimeouts: [], observerTimeouts: [],
  events: [], observations: [], nextPageId: 0, gmPhase: 'created', memberPhase: 'created' };
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
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const clock = () => globalThis.__P631_CONTROLLED_CLOCK;
const record = async (kind, fields = {}) => {
  clock().events.push({ kind, ...fields });
  await writeFile(process.env.PC10_P631_TEST_TRACE, JSON.stringify(clock()), { mode: 0o600 });
};
const uidHash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
export async function observeFullGameDemoPresentationMember(surface) {
  const mode = process.env.PC10_P631_TEST_MODE;
  if (mode.startsWith('readiness-')) {
    const member = surface.label === 'browser-B-normal-member';
    const pageUid = member ? 'controlled-member-uid' : 'controlled-gm-uid';
    const phaseKey = member ? 'memberPhase' : 'gmPhase';
    const phase = clock()[phaseKey];
    const observationKey = member ? 'memberObservationCount' : 'gmObservationCount';
    clock()[observationKey] ??= 0;
    const sample = clock()[observationKey]++;
    const isPending = mode === 'readiness-player-pending-ready' || mode === 'readiness-deadline';
    const pending = sample === 0 && (member || isPending && phase === 'created');
    const revokedPhase = mode.match(/^readiness-gm-revoked-(claimed|setup|prepared)$/)?.[1];
    const revoked = !member && phase === revokedPhase;
    const state = {
      hasAuth: true, sameActor: true,
      uidHash: mode === 'readiness-changed-uid' && !member && phase === 'created' && !pending
        ? uidHash('different-registered-uid') : uidHash(pageUid),
      sessionId: mode === 'readiness-foreign-session' && !member && phase === 'created' && !pending ||
          member && mode === 'readiness-member-foreign-session'
        ? 'foreign-p631-session' : 'owned-p631-session',
      meSessionId: !member && mode === 'readiness-foreign-member-session' && phase === 'created' && !pending
        ? 'foreign-p631-session' : 'owned-p631-session',
      profileRoleId: null, profileSessionId: null,
      playerRole: phase === 'claimed' || phase === 'setup' || phase === 'prepared' ? 'gm' : 'player',
      connected: !revoked, currentOwnPlayerConfirmed: !revoked, kicked: revoked, escapeLocked: false,
      memberScopeMatches: member, currentMemberBerthMatches: member,
      replacementRoleId: null, replacementStatus: null,
      connectionGeneration: 1, identityHydrationRevision: 1, assignedRoleId: null,
      activeConsoleRoleId: null, seatId: null, currentCanonicalSeatOwned: false,
      connection: 'live', freshness: 'server',
      sdkHasServerAuthority: !pending && !(mode === 'readiness-stale-sdk' && !member && phase === 'created') &&
        !(mode === 'readiness-member-stale-sdk' && member),
      sdkResumePending: pending || mode === 'readiness-stale-sdk' && !member && phase === 'created' ||
        mode === 'readiness-member-stale-sdk' && member,
      gmInstanceOwned: phase === 'claimed' || phase === 'setup' || phase === 'prepared',
      instanceId: !member && mode === 'readiness-claimed-foreign-instance' &&
          (phase === 'claimed' || phase === 'setup' || phase === 'prepared')
        ? 'different-gm-instance'
        : phase === 'claimed' || phase === 'setup' || phase === 'prepared'
        ? 'owned-p631-gm-instance'
        : mode === 'readiness-foreign-instance' && !member && phase === 'created' ? 'foreign-gm-instance' : null,
      setupConfirmed: phase === 'setup' || phase === 'prepared', cycle: 0,
      phase: phase === 'setup' || phase === 'prepared' ? 'casting' : 'lobby',
      fullGameDemo: phase === 'prepared' ? { status: 'preparing', progression: 'manual' } : null,
      invalidFields: [],
    };
    clock().now += revoked ? 20_000 :
      !member && phase === 'created' && sample === 0 && mode === 'readiness-ready-at-deadline' ? 5_000 :
      !member && phase === 'created' && sample === 0 && mode === 'readiness-ready-after-deadline' ? 6_000 : 5_000;
    clock().observations.push({ member, phase, sample, pending, state });
    await record(member ? 'member-observation' : 'gm-observation', { phase, sample, pending });
    return state;
  }
  if (process.env.PC10_P631_TEST_MODE === 'authorization-body-stall') return {
    hasAuth: true, sameActor: true, uidHash: uidHash('controlled-gm-uid'),
    sessionId: 'owned-p631-session', meSessionId: 'owned-p631-session', profileRoleId: null,
    profileSessionId: null, playerRole: 'player',
    connected: true, currentOwnPlayerConfirmed: true, kicked: false, escapeLocked: false,
    replacementRoleId: null, replacementStatus: null, connection: 'live', freshness: 'server',
    connectionGeneration: 1, identityHydrationRevision: 1, assignedRoleId: null,
    activeConsoleRoleId: null, seatId: null, currentCanonicalSeatOwned: false,
    instanceId: null, gmInstanceOwned: false, invalidFields: [],
    sdkHasServerAuthority: true, sdkResumePending: false,
  };
  throw new Error('CONTROLLED_STOP_AFTER_CONSENT');
}
`);
  await writeFile(fakeLifecyclePath, `
import { writeFile } from 'node:fs/promises';
const clock = () => globalThis.__P631_CONTROLLED_CLOCK;
const record = async (kind, fields = {}) => {
  clock().events.push({ kind, ...fields });
  await writeFile(process.env.PC10_P631_TEST_TRACE, JSON.stringify(clock()), { mode: 0o600 });
};
export async function captureLifecycleUiAction(surface, endpoint, choose, options = {}) {
  if (!process.env.PC10_P631_TEST_MODE.startsWith('readiness-'))
    throw new Error('Unexpected lifecycle action in controlled runner test.');
  await choose();
  await record('lifecycle-action', { endpoint, surface: surface.label });
  if (endpoint === 'claimGmInstance') clock().gmPhase = 'claimed';
  if (endpoint === 'confirmSetup') clock().gmPhase = 'setup';
  if (endpoint === 'prepareFullGameDemo') clock().gmPhase = 'prepared';
  await writeFile(process.env.PC10_P631_TEST_TRACE, JSON.stringify(clock()), { mode: 0o600 });
  if (endpoint === 'claimGmInstance') return { endpoint, data: { instanceId: 'owned-p631-gm-instance' },
    result: { instance: { id: 'owned-p631-gm-instance' } } };
  if (endpoint === 'confirmSetup') return { endpoint, result: { status: 'committed' } };
  if (endpoint === 'prepareFullGameDemo') return { endpoint,
    data: { sessionId: 'owned-p631-session', instanceId: 'owned-p631-gm-instance',
      requestId: 'original-prepare-request', expectedSetupRevision: 1 },
    before: { playerRole: 'gm', gmInstanceOwned: true }, httpStatus: 200,
    result: { status: 'committed', fullGameDemo: { status: 'preparing', progression: 'manual' } } };
  throw new Error('Unexpected controlled lifecycle endpoint: ' + endpoint);
}
export async function openLifecycleSettings() { throw new Error('Unexpected settings path in controlled runner test.'); }
export async function closeLifecycleSettings() {}
`);
  await writeFile(fakeLifecycleDepsPath, `
export function createTwoBrowserGameplay() { throw new Error('Unused in the actual captureLifecycleUiAction source test.'); }
`);
  const actualCoreUrl = pathToFileURL(join(root, 'scripts/pc10-member-rate-security-ui-proof-core.mjs')).href;
  await writeFile(fakeCorePath, `
import * as actual from ${JSON.stringify(actualCoreUrl)};
export const P631_MEMBER_READ_LIMIT = actual.P631_MEMBER_READ_LIMIT;
export const parseP631SecurityDenialRecords = actual.parseP631SecurityDenialRecords;
export const assertP631RateDenialRecords = actual.assertP631RateDenialRecords;
export const p631LoggerHash = actual.p631LoggerHash;
export const runP631OwnedJourney = actual.runP631OwnedJourney;
export async function provePreparationRateLimit(options) {
  if (process.env.PC10_P631_TEST_MODE.startsWith('readiness-'))
    return { freshRequestLoggerHash: 'a'.repeat(64), exactOriginalReplay: true };
  return actual.provePreparationRateLimit(options);
}
export async function proveCurrentMemberReadRateLimit(options) {
  if (process.env.PC10_P631_TEST_MODE.startsWith('readiness-'))
    throw new Error('CONTROLLED_STOP_AFTER_MEMBER_READINESS');
  return actual.proveCurrentMemberReadRateLimit(options);
}
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
import { createHash } from 'node:crypto';
const trace = () => globalThis.__P631_CONTROLLED_CLOCK;
const flush = async () => writeFile(process.env.PC10_P631_TEST_TRACE,
  JSON.stringify(trace()), { mode: 0o600 });
class Locator {
  constructor(name, page = null) { this.name = String(name ?? ''); this.page = page; }
  async isVisible() { return !this.name.startsWith('/^REDUCED MOTION/i'); }
  async isEnabled() { return true; }
  async count() { return 3; }
  async all() { return [1, 2, 3].map(index => new Locator('checkbox-' + index)); }
  getByRole(role, options = {}) { return new Locator(options.name ?? role, this.page); }
  getByLabel(name) { return new Locator(name, this.page); }
  async click(options = {}) {
    trace().clickTimeouts ??= []; trace().clickTimeouts.push(options.timeout ?? null);
    trace().events.push({ kind: 'click', name: this.name }); await flush();
    await this.page?.handleClick(this.name);
  }
  async fill(value) { trace().events.push({ kind: 'fill', name: this.name, value }); await flush(); }
  async selectOption(value) { trace().events.push({ kind: 'select', name: this.name, value }); await flush(); }
  async check(options = {}) {
    trace().checkboxTimeouts.push(options.timeout ?? null);
    trace().now += 10_000;
    await flush();
  }
  async waitFor() {}
}
class Page {
  constructor(index) { this.listeners = new Map(); this.frame = {}; this.index = index; this.responses = 0; this.lifecycleWaiters = []; }
  on(name, callback) { this.listeners.set(name, callback); }
  off(name) { this.listeners.delete(name); }
  setDefaultTimeout() {}
  setDefaultNavigationTimeout() {}
  async goto() {}
  url() { return 'http://127.0.0.1:5174/'; }
  mainFrame() { return this.frame; }
  getByRole(role, options = {}) { return new Locator(options.name ?? role, this); }
  getByLabel(name) { return new Locator(name, this); }
  locator(name) { return new Locator(name, this); }
  async evaluate(_callback, args) {
    if (args?.moduleUrl && process.env.PC10_P631_TEST_MODE === 'readiness-real-claim') {
      const claimed = ['claimed', 'setup', 'prepared'].includes(trace().gmPhase);
      return { hasAuth: true, sameActor: true,
        uidHash: createHash('sha256').update('controlled-gm-uid').digest('hex').slice(0, 16),
        sessionId: 'owned-p631-session', connection: 'live', freshness: 'server',
        generation: 1, hydrationRevision: 1, playerRole: claimed ? 'gm' : 'player',
        instanceId: claimed ? 'owned-p631-gm-instance' : null,
        claimedAt: claimed ? 1 : null, gmInstanceOwned: claimed,
        privateAudienceMatches: true, foreignPendingCount: 0, activeConsoleRoleId: null };
    }
    if (args?.name === 'prepareFullGameDemo' && process.env.PC10_P631_TEST_MODE.startsWith('readiness-'))
      throw new Error('CONTROLLED_STOP_AFTER_MEMBER_READINESS');
    return this.index === 0 ? 'controlled-gm-uid' : 'controlled-member-uid';
  }
  async handleClick(name) {
    const mode = process.env.PC10_P631_TEST_MODE;
    if (mode !== 'readiness-real-claim') return;
    const endpoint = name === 'Join as GM' ? 'claimGmInstance'
      : name === 'Confirm setup // Confirm roster' ? 'confirmSetup' : null;
    if (!endpoint) return;
    if (endpoint === 'claimGmInstance') trace().gmPhase = 'claimed';
    if (endpoint === 'confirmSetup') trace().gmPhase = 'setup';
    const index = this.lifecycleWaiters.findIndex(waiter => waiter.endpoint === endpoint);
    if (index < 0) throw new Error('Actual lifecycle observer was not armed before the original UI control.');
    const [{ predicate, resolve }] = this.lifecycleWaiters.splice(index, 1);
    const data = endpoint === 'claimGmInstance'
      ? { sessionId: 'owned-p631-session', instanceId: 'owned-p631-gm-instance', requestId: 'claim-receipt' }
      : { sessionId: 'owned-p631-session', instanceId: 'owned-p631-gm-instance' };
    const result = endpoint === 'claimGmInstance'
      ? { instance: { id: 'owned-p631-gm-instance', claimedAt: 1 } }
      : { status: 'committed' };
    const request = { method: () => 'POST', postDataJSON: () => ({ data }) };
    const response = { url: () => 'http://127.0.0.1:5011/us-central1/' + endpoint, request: () => request,
      status: () => 200, json: async () => {
        if (endpoint === 'confirmSetup') throw new Error('CONTROLLED_STOP_AFTER_ACTUAL_GM_CLAIM');
        return { result };
      } };
    if (!predicate(response)) throw new Error('Actual lifecycle response did not satisfy the source observer predicate.');
    trace().events.push({ kind: 'actual-lifecycle-receipt', endpoint, data, result });
    await flush(); resolve(response);
  }
  async waitForResponse(predicate, options = {}) {
    trace().observerTimeouts.push(options.timeout ?? null);
    await flush();
    if (process.env.PC10_P631_TEST_MODE === 'observer-failure')
      throw new Error('PC10_PRIVATE_FAILURE_CANARY');
    if (process.env.PC10_P631_TEST_MODE === 'readiness-real-claim' && this.index === 0 && this.responses >= 2) {
      const endpoints = ['claimGmInstance', 'confirmSetup', 'prepareFullGameDemo'];
      const endpoint = endpoints[this.responses - 2]; this.responses++;
      return new Promise(resolve => this.lifecycleWaiters.push({ endpoint, predicate, resolve }));
    }
    const request = { method: () => 'POST', postDataJSON: () => ({ data: {
      sessionId: 'owned-p631-session', instanceId: 'owned-p631-gm', requestId: 'original-ui-request' } }) };
    const mode = process.env.PC10_P631_TEST_MODE;
    const authorization = this.index === 0 && this.responses > 0;
    const memberJoin = this.index === 1;
    this.responses++;
    const endpoint = memberJoin ? 'joinSession' : authorization ? null : 'createSession';
    if (authorization && mode.startsWith('readiness-')) trace().gmPhase = 'authorized';
    if (memberJoin && mode.startsWith('readiness-')) trace().memberPhase = 'joined';
    const response = { url: () => memberJoin ? 'http://127.0.0.1:5011/us-central1/joinSession'
        : authorization ? 'http://127.0.0.1:5174/__local-gm-access'
          : 'http://127.0.0.1:5011/us-central1/createSession', request: () => request,
      status: () => {
        if (mode === 'create-body-stall' && !authorization || mode === 'authorization-body-stall' && authorization)
          trace().now += 59_900;
        return 200;
      }, json: async () => {
        if ((mode === 'readiness-deadline' || mode === 'readiness-ready-at-deadline' ||
            mode === 'readiness-ready-after-deadline') && !authorization && !memberJoin) trace().now += 25_000;
        if (mode === 'create-body-stall' && !authorization || mode === 'authorization-body-stall' && authorization) {
          return new Promise(() => {});
        }
        return authorization ? { authenticated: true }
          : memberJoin ? { result: { session: { id: 'owned-p631-session' } } }
            : { result: { session: { id: 'owned-p631-session', joinCode: '1234' } } };
      } };
    if (!predicate(response)) throw new Error('Controlled response did not match the actual observer predicate.');
    return response;
  }
}
export const chromium = { launch: async () => {
  let connected = true;
  return { close: async () => { connected = false; }, isConnected: () => connected,
    newContext: async () => ({ route: async () => {}, newPage: async () => new Page(trace().nextPageId++) }) };
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
    { cwd: root, env, encoding: 'utf8', timeout: safetyTimeoutMs });
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

test('P631 createSession response body remains inside its original admission deadline', async () => {
  const run = await runActualRunner('create-body-stall', 2_000);
  try {
    assert.equal(run.child.status, 1, `${run.child.stderr}\n${run.child.stdout}\n${run.child.error?.code ?? ''}`);
    assert.notEqual(run.child.error?.code, 'ETIMEDOUT', 'The runner must stop the stalled body before the test safety timeout.');
    assert.equal(run.ownerResult?.failureStage, 'normal GM create, consent, local authorization and original prepare');
    assert.equal(run.ownerResult?.cleanup?.closedBrowsers, 1);
    assert.equal(run.ownerResult?.cleanup?.deletedAuthActors, 1);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 local GM authorization response body remains inside its original operation deadline', async () => {
  const run = await runActualRunner('authorization-body-stall', 2_000);
  try {
    assert.equal(run.child.status, 1, `${run.child.stderr}\n${run.child.stdout}\n${run.child.error?.code ?? ''}`);
    assert.notEqual(run.child.error?.code, 'ETIMEDOUT', 'The runner must stop the stalled body before the test safety timeout.');
    assert.equal(run.ownerResult?.failureStage, 'normal local GM authorization');
    assert.equal(run.ownerResult?.cleanup?.closedBrowsers, 1);
    assert.equal(run.ownerResult?.cleanup?.deletedAuthActors, 1);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 normal creator waits through pending SDK authority, then qualifies as a player before GM claim and member admission', async () => {
  const run = await runActualRunner('readiness-player-pending-ready');
  try {
    const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.ownerResult?.failureStage, 'ordinary current-member SDK read exhaustion and same-network GM read',
      `${run.child.stdout}\n${run.child.stderr}\n${retained.originalError?.message ?? ''}`);
    assert.equal(run.ownerResult?.actualAuthenticatedActors, 2);
    assert.equal(run.ownerResult?.cleanup?.closedBrowsers, 2);
    assert.equal(run.ownerResult?.cleanup?.deletedAuthActors, 2);
    assert.deepEqual(run.trace?.observations?.filter(item => item.phase === 'created').map(item => item.pending), [true, false]);
    const lifecycle = run.trace?.events?.filter(item => item.kind === 'lifecycle-action').map(item => item.endpoint);
    assert.deepEqual(lifecycle, ['claimGmInstance', 'confirmSetup', 'prepareFullGameDemo']);
    assert.ok(run.trace?.events?.some(item => item.kind === 'member-observation' && item.phase === 'joined'));
    assert.ok(run.ownerResult?.primaryFailureArtifact?.retained);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

for (const [mode, expectedMessage] of [
  ['readiness-foreign-session', /unexpected session identity/],
  ['readiness-foreign-member-session', /unexpected current-member identity/],
  ['readiness-changed-uid', /registered Auth UID changed/],
  ['readiness-foreign-instance', /pre-existing GM instance/],
]) {
  test(`P631 initial admission rejects ${mode.slice('readiness-'.length)} before local GM authorization`, async () => {
    const run = await runActualRunner(mode);
    try {
      assert.equal(run.child.status, 1, run.child.stderr);
      assert.equal(run.ownerResult?.failureStage, 'normal GM admitted App/store authority');
      assert.equal(run.ownerResult?.actualAuthenticatedActors, 1);
      assert.equal(run.ownerResult?.cleanup?.closedBrowsers, 1);
      assert.equal(run.trace?.events?.some(item => item.kind === 'lifecycle-action'), false);
      const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
      assert.match(retained.originalError?.message ?? '', expectedMessage);
    } finally { await rm(run.temporary, { recursive: true, force: true }); }
  });
}

test('P631 stale SDK readiness stays outside the GM-authority path and shares create admission deadline', async () => {
  const run = await runActualRunner('readiness-stale-sdk');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.ownerResult?.failureStage, 'normal GM admitted App/store authority');
    assert.equal(run.trace?.events?.some(item => item.kind === 'lifecycle-action'), false);
    const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
    assert.match(retained.contextInspect ?? '', /sdkHasServerAuthority: false/);
    assert.match(retained.contextInspect ?? '', /sdkResumePending: true/);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 live GM readiness must retain the exact instance claimed by the original UI receipt', async () => {
  const run = await runActualRunner('readiness-claimed-foreign-instance');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.ownerResult?.failureStage, 'normal live GM claim');
    assert.deepEqual(run.trace?.events?.filter(item => item.kind === 'lifecycle-action').map(item => item.endpoint),
      ['claimGmInstance']);
    assert.ok(run.trace?.observations?.some(item => item.phase === 'claimed'));
    assert.equal(run.ownerResult?.cleanup?.closedBrowsers, 1);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 ordinary member readiness rejects a foreign session through its own mounted App authority', async () => {
  const run = await runActualRunner('readiness-member-foreign-session');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.ownerResult?.failureStage, 'normal ordinary member App/store admission');
    assert.equal(run.ownerResult?.actualAuthenticatedActors, 2);
    assert.equal(run.ownerResult?.cleanup?.closedBrowsers, 2);
    assert.match(run.trace?.observations?.filter(item => item.member).at(-1)?.state.sessionId ?? '', /^foreign-/);
    const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
    assert.match(retained.originalError?.message ?? '', /unexpected session identity/);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 ordinary member does not qualify until current-member SDK authority is fresh', async () => {
  const run = await runActualRunner('readiness-member-stale-sdk');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.ownerResult?.failureStage, 'normal ordinary member App/store admission');
    assert.equal(run.ownerResult?.actualAuthenticatedActors, 2);
    assert.equal(run.trace?.events?.some(item => item.kind === 'member-observation'), true);
    const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
    assert.match(retained.contextInspect ?? '', /sdkHasServerAuthority: false/);
    assert.match(retained.contextInspect ?? '', /sdkResumePending: true/);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 initial readiness does not extend the original create-and-consent operation deadline', async () => {
  const run = await runActualRunner('readiness-deadline');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    assert.equal(run.ownerResult?.failureStage, 'normal GM admitted App/store authority');
    assert.equal(run.trace?.observations?.filter(item => item.phase === 'created').length, 1);
    const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
    assert.match(retained.originalError?.message ?? '', /original shared UI deadline expired/);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

test('P631 first GM claim reaches the actual lifecycle actor guard and binds its real UI receipt', async () => {
  const run = await runActualRunner('readiness-real-claim');
  try {
    assert.equal(run.child.status, 1, run.child.stderr);
    const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
    assert.equal(run.ownerResult?.failureStage, 'legal roster configuration and setup',
      `The ordinary player must pass the actual shared first-claim guard; observed ${run.ownerResult?.failureStage}: ` +
      `${retained.originalError?.message ?? run.child.stdout}\n${run.child.stderr}`);
    assert.ok(run.trace?.events?.some(item => item.kind === 'click' && item.name === 'Join as GM'),
      'The ordinary connected player must reach the first-claim control through the real shared guard.');
    const claim = run.trace?.events?.find(item => item.kind === 'actual-lifecycle-receipt' && item.endpoint === 'claimGmInstance');
    assert.equal(claim?.data?.instanceId, 'owned-p631-gm-instance');
    assert.equal(claim?.result?.instance?.id, claim?.data?.instanceId,
      'The actual shared capture helper must deliver the same claimed instance as request and reply.');
    assert.match(retained.originalError?.message ?? '', /CONTROLLED_STOP_AFTER_ACTUAL_GM_CLAIM/);
  } finally { await rm(run.temporary, { recursive: true, force: true }); }
});

for (const mode of ['readiness-ready-at-deadline', 'readiness-ready-after-deadline']) {
  test(`P631 does not credit ready App/store authority delivered ${mode.endsWith('at-deadline') ? 'at' : 'after'} its original deadline`, async () => {
    const run = await runActualRunner(mode);
    try {
      assert.equal(run.child.status, 1, run.child.stderr);
      assert.equal(run.ownerResult?.failureStage, 'normal GM admitted App/store authority',
        `${run.child.stdout}\n${run.child.stderr}`);
      const sample = run.trace?.observations?.find(item => !item.member && item.phase === 'created' && item.sample === 0);
      assert.equal(sample?.state?.connection, 'live');
      assert.equal(sample?.state?.sdkHasServerAuthority, true);
      assert.equal(sample?.state?.sdkResumePending, false);
      const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
      assert.match(retained.originalError?.message ?? '', /original shared UI deadline/);
      assert.match(retained.contextInspect ?? '', /sdkHasServerAuthority: true/);
      assert.match(retained.contextInspect ?? '', /Original normally admitted fresh GM/,
        'The late delivery tuple remains attached to the original timeout evidence.');
    } finally { await rm(run.temporary, { recursive: true, force: true }); }
  });
}

for (const [mode, expectedStage, expectedActions] of [
  ['readiness-gm-revoked-claimed', 'normal live GM claim', ['claimGmInstance']],
  ['readiness-gm-revoked-setup', 'legal roster configuration and setup', ['claimGmInstance', 'confirmSetup']],
  ['readiness-gm-revoked-prepared', 'original UI preparation before ordinary join',
    ['claimGmInstance', 'confirmSetup', 'prepareFullGameDemo']],
]) {
  test(`P631 rejects disconnected, unconfirmed and kicked GM authority at ${mode.slice('readiness-gm-revoked-'.length)} readiness`, async () => {
    const run = await runActualRunner(mode, 20_000);
    try {
      assert.equal(run.child.status, 1, run.child.stderr);
      assert.equal(run.ownerResult?.failureStage, expectedStage, `${run.child.stdout}\n${run.child.stderr}`);
      const lifecycle = run.trace?.events?.filter(item => item.kind === 'lifecycle-action').map(item => item.endpoint);
      assert.deepEqual(lifecycle, expectedActions);
      const revoked = run.trace?.observations?.find(item => !item.member && item.phase ===
        mode.slice('readiness-gm-revoked-'.length));
      assert.equal(revoked?.state?.connected, false);
      assert.equal(revoked?.state?.currentOwnPlayerConfirmed, false);
      assert.equal(revoked?.state?.kicked, true);
      assert.equal(revoked?.state?.memberScopeMatches, false);
      assert.equal(revoked?.state?.currentMemberBerthMatches, false,
        'GM qualification is bound to its own live instance and does not invent a player berth requirement.');
      const retained = JSON.parse(await readFile(join(run.evidenceDirectory, run.failureArtifacts[0]), 'utf8'));
      assert.match(retained.contextInspect ?? '', /connected: false/);
      assert.match(retained.contextInspect ?? '', /currentOwnPlayerConfirmed: false/);
      assert.match(retained.contextInspect ?? '', /kicked: true/);
    } finally { await rm(run.temporary, { recursive: true, force: true }); }
  });
}
