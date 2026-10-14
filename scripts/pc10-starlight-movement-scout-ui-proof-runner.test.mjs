import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, mkdtemp, stat, mkdir, writeFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import typescript from 'typescript';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { pc11GmReadiness, pc11MemberReadiness, pc11SameActorEpoch, removePc11OwnedRootRecords,
  recoverPc11CreatedSession, createPc11OwnedRequestTracker } from './qualification/pc11-normal-start-adapter.mjs';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { originalProofError, rememberProofFailure, retainProofFailure } from './pc10-proof-failure-evidence.mjs';
import { observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt }
  from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { observeFullGameDemoPresentationMember, proofRuntimeFromViteSource,
  validateProofRuntime } from './pc10-full-game-demo-proof-helpers.mjs';
import { checkServedEnvironment } from './qualification/pc11-launch.mjs';
import { localGmAccessConfiguration } from './local-gm-access.mjs';
import { emulatorEnvironmentForSlot, emulatorPortsForSlot, vitePortForSlot } from './emulator-slots.js';
import { resolveFirebaseToolsInvocation } from './run-emulator-command.mjs';
import { coordinationFilePath } from './emulator-resource-registry.mjs';
import { loadEnv } from 'vite';
import { validateScoutBundle } from './pc10-navigation-scout-proof-contracts.mjs';
import { runPc11ContractPreflight } from './qualification/pc11-contract-preflight.mjs';
import { createP181StarlightBrowserIo, createP181StarlightNativeSurfaceFactory,
  captureP181SourceBindings, observeP181StarlightSource, runP181StarlightMovementScoutUiProof,
  runP181StarlightMovementScoutNative, retainP181CallerRejection, P181_NATIVE_TIMING } from './pc10-starlight-movement-scout-ui-proof.mjs';

// Keep the pre-implementation RED behavioral: the test invokes the expected
// P181 consumer transition with controlled observers and receipts. A missing
// implementation leaves the actual action trace empty; import failure alone
// is not the assertion under test.
const originalRoleIds = Object.freeze([
  'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
  'quellon-explorer', 'refinery-124-pdf-colonel',
  'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
]);

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
// Exact existing deadline consumers with controlled clocks and deferred
// provider operations. These tests exercise the source body, not a duplicate
// deadline algorithm; no runtime, browser, Auth, server or build is started.
const p181DeadlineSourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
const p181DeadlineSource = await readFile(p181DeadlineSourcePath, 'utf8');
const p181DeadlineDigest = value => createHash('sha256').update(value).digest('hex');

// Reconstructed artifact isolation evidence after the owner-confirmed reboot.
// These invoke the actual pre-SDK source assertions with inert filesystem/path
// ports. They never create an allocation, process, browser, SDK or network client.
function actualP181ArtifactAssertion(message, values) {
  const marker = p181DeadlineSource.indexOf(message);
  const start = p181DeadlineSource.lastIndexOf('  assert.ok(', marker);
  const end = p181DeadlineSource.indexOf(';', marker) + 1;
  assert.ok(marker >= 0 && start >= 0 && end > marker);
  const helperStart = p181DeadlineSource.indexOf('export function p181OwnedArtifactPath(');
  const helper = helperStart < 0 ? '' : p181DeadlineSource.slice(helperStart,
    p181DeadlineSource.indexOf('\n}\n', helperStart) + 3).replace('export ', '');
  return runInNewContext(`${helper}\n${p181DeadlineSource.slice(start, end)}`, { assert, resolve, ...values });
}

function actualP181RetainedBuildLocation(values) {
  const marker = p181DeadlineSource.indexOf("  const buildRoot = await checked('Resolve original retained build mapping'");
  const start = p181DeadlineSource.lastIndexOf('  assert.ok(', marker);
  const end = p181DeadlineSource.indexOf(';', start) + 1;
  const helperStart = p181DeadlineSource.indexOf('export function p181OwnedArtifactPath(');
  const helper = helperStart < 0 ? '' : p181DeadlineSource.slice(helperStart,
    p181DeadlineSource.indexOf('\n}\n', helperStart) + 3).replace('export ', '');
  assert.ok(marker > start && start >= 0 && end < marker);
  return runInNewContext(`${helper}\n${p181DeadlineSource.slice(start, end)}`, { assert, resolve, ...values });
}

function actualP181PlannedLaunchQualifier(plannedLaunch) {
  const ownedPathStart = p181DeadlineSource.indexOf('export function p181OwnedArtifactPath(');
  const ownedPathEnd = p181DeadlineSource.indexOf('\n}\n', ownedPathStart) + 3;
  const environmentStart = p181DeadlineSource.indexOf('async function p181PlannedEnvironmentEvidence(');
  const environmentEnd = p181DeadlineSource.indexOf('\n}\n\n/** Artifact bytes', environmentStart) + 2;
  const validatorStart = p181DeadlineSource.indexOf('async function p181ValidatePlannedLaunch(');
  const validatorEnd = p181DeadlineSource.indexOf('\n}\n\n/** Reuse the actual canonical source tests', validatorStart) + 2;
  assert.ok(ownedPathStart >= 0 && ownedPathEnd > ownedPathStart);
  assert.ok(environmentStart >= 0 && environmentEnd > environmentStart);
  assert.ok(validatorStart >= 0 && validatorEnd > validatorStart);
  const helpers = `${p181DeadlineSource.slice(ownedPathStart, ownedPathEnd).replace('export ', '')}\n` +
    `${p181DeadlineSource.slice(environmentStart, environmentEnd)}\n` +
    p181DeadlineSource.slice(validatorStart, validatorEnd);
  const sourceAssert = { ...assert,
    deepEqual: (actual, expected, ...options) => assert.deepEqual(
      JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), ...options) };
  return runInNewContext(`(async () => { ${helpers}
    return p181ValidatePlannedLaunch(__plannedLaunch, __sourceRoot, __plannedLaunch.sourceCommit,
      async (_label, action) => action());
  })()`, {
    assert: sourceAssert, createHash, existsSync, readFile, realpath, resolve, process, JSON,
    P181_NATIVE_TIMING,
    emulatorEnvironmentForSlot, emulatorPortsForSlot, vitePortForSlot,
    coordinationFilePath, checkServedEnvironment, localGmAccessConfiguration,
    resolveFirebaseToolsInvocation,
    __plannedLaunch: plannedLaunch, __sourceRoot: resolve(repositoryRoot),
  });
}

const durableArtifactSourceRoot = '/Users/owner/workspace/pc10-recovery/proof-candidate';
const durableArtifactDirectory = '/Users/owner/workspace/pc10-recovery/native-runs/fresh';
const durableArtifactRecord = `${durableArtifactDirectory}/runtime-launch-record.json`;

test('P181 durable artifact directory passes the actual native isolation gate', () => {
  actualP181ArtifactAssertion('P181 evidence must remain in the isolated', {
    sourceRoot: durableArtifactSourceRoot, directory: durableArtifactDirectory,
  });
});

test('P181 durable artifact directory passes the actual planned isolation gate', () => {
  actualP181ArtifactAssertion('Planned P181 launch requires an absolute owned', {
    sourceRoot: durableArtifactSourceRoot, evidenceDirectory: durableArtifactDirectory,
  });
});

test('P181 durable build receipt passes the actual digest and isolation gate', () => {
  actualP181ArtifactAssertion('Use the exact parent-approved immutable build binding and digest.', {
    sourceRoot: durableArtifactSourceRoot,
    options: { buildBindingPath: '/Users/owner/workspace/pc10-recovery/build-recovery/binding.json',
      buildBindingSha256: 'a'.repeat(64) },
  });
});

test('P181 durable runtime record passes the actual native receipt path gate', () => {
  actualP181ArtifactAssertion('Read the exact parent-issued isolated runtime launch record.', {
    sourceRoot: durableArtifactSourceRoot, directory: durableArtifactDirectory,
    launchRecordPath: durableArtifactRecord,
  });
});

test('P181 durable retained build root passes the actual provenance location gate', () => {
  actualP181RetainedBuildLocation({ sourceRoot: durableArtifactSourceRoot,
    buildRecord: { sourceRoot: '/Users/owner/workspace/pc10-recovery/product-07237376' } });
});

test('P181 durable retained build root still rejects a foreign workspace', () => {
  assert.throws(() => actualP181RetainedBuildLocation({ sourceRoot: durableArtifactSourceRoot,
    buildRecord: { sourceRoot: '/Users/owner/foreign/build' } }));
});

test('P181 durable artifact native gate still rejects a foreign workspace', () => {
  assert.throws(() => actualP181ArtifactAssertion('P181 evidence must remain in the isolated', {
    sourceRoot: durableArtifactSourceRoot, directory: '/Users/owner/foreign/runtime',
  }));
});

test('P181 durable build receipt still requires the exact SHA256 shape', () => {
  assert.throws(() => actualP181ArtifactAssertion('Use the exact parent-approved immutable build binding and digest.', {
    sourceRoot: durableArtifactSourceRoot,
    options: { buildBindingPath: '/Users/owner/workspace/pc10-recovery/build-recovery/binding.json',
      buildBindingSha256: 'unbound' },
  }));
});

test('P181 durable artifact native gate preserves existing isolated tmp input', () => {
  actualP181ArtifactAssertion('P181 evidence must remain in the isolated', {
    sourceRoot: '/private/tmp/source', directory: '/tmp/owned-proof/fresh',
  });
});

test('P181 durable runtime record rejects another run even inside isolated tmp', () => {
  assert.throws(() => actualP181ArtifactAssertion('Read the exact parent-issued isolated runtime launch record.', {
    sourceRoot: '/private/tmp/source', directory: '/tmp/owned-proof/fresh',
    launchRecordPath: '/tmp/other-proof/runtime-launch-record.json',
  }));
});

const p181NativeEntry = p181DeadlineSource.indexOf('export async function runP181StarlightMovementScoutNative(');
function p181NativeRegion(startText, endText, after = p181NativeEntry) {
  const start = p181DeadlineSource.indexOf(startText, after);
  const end = p181DeadlineSource.indexOf(endText, start);
  assert.ok(start > after && end > start, `Bind the actual native consumer ${startText}.`);
  return p181DeadlineSource.slice(start, end);
}
const p181TimingBody = p181NativeRegion('  const totalEnd = options.allocationDeadlineMs', '  const sourceEntry =');
const p181BoundedBody = p181NativeRegion('  const bounded = async', '\n  let adminRequire');
const p181FullActorWaitBody = p181NativeRegion('  const waitForFullActor = async', '\n  const readGmRecoveryPending');
const p181StationWaitBody = p181NativeRegion(
  "          const navigationUiEnd = Math.min(deadlineAt, Date.now() + 35_000);",
  '          if (station.connectionGeneration !== navigationStart.connectionGeneration');
const p181FirstFailureRetentionBody = p181NativeRegion(
  '  const retainFirstFailure = async', '\n  const previousFirestoreEmulatorHost');
const p181GmWaitBody = p181NativeRegion('  const waitForGm = async', '\n  async function captureAction');
const p181CleanupDeadlineBody = p181NativeRegion('    if (!cleanupPromise) {', '\n    const outcome =',
  p181DeadlineSource.indexOf('    proofResult = await runP181StarlightMovementScoutUiProof', p181NativeEntry));

function actualP181TimingConsumer({ now, issuedAt, end }) {
  const timing = runInNewContext(`options => { ${p181TimingBody}
    return { startAt, totalEnd, proofStopAt, cleanupDeadlineAt, browserLaunchDeadlineAt };
  }`, { assert, P181_NATIVE_TIMING, Date: { now: () => now }, process: { env: {} } });
  return timing({ allocationStartedAtMs: issuedAt, allocationDeadlineMs: end });
}

function actualP181BoundedConsumer({ now = 10, completesAt = 20 } = {}) {
  const timers = new Set();
  const bounded = runInNewContext(`(() => { ${p181BoundedBody}; return bounded; })()`, {
    assert, Date: { now: () => now }, Promise, rememberProofFailure,
    ownerStop: actualOpenP181OwnerStopPort(), normalOperationsStopped: false,
    setTimeout: callback => { timers.add(callback); return callback; },
    clearTimeout: timer => timers.delete(timer),
  });
  return { timers, bounded, execute: () => bounded('Actual operation', async () => {
    now = completesAt;
    return 'actual-result';
  }, 100) };
}

function actualOpenP181OwnerStopPort() {
  const start = p181DeadlineSource.indexOf('function createP181OwnerStopObserver(');
  const end = p181DeadlineSource.indexOf('\n}\n\nfunction p181ActorReady', start) + 2;
  assert.ok(start >= 0 && end > start);
  const input = new EventEmitter();
  input.resume = input.pause = () => input;
  input.destroy = () => { input.destroyed = true; };
  // Isolated closure readers supply the new input port without a process,
  // runtime or stop claim. Full native consumers exercise notifications below.
  return runInNewContext(`${p181DeadlineSource.slice(start, end)}
    createP181OwnerStopObserver(__input, {});`, { assert, Date, rememberProofFailure, __input: input });
}

function actualP181ReadinessConsumer(kind, late, { memberReads, recoveryResult = false } = {}) {
  let now = 10;
  const ownedUid = 'controlled-original-gm';
  const uidHash = createHash('sha256').update(ownedUid).digest('hex').slice(0, 16);
  const state = { reads: 0 };
  const member = { hasAuth: true, sameActor: true, uidHash, sessionId: 'controlled-session',
    meSessionId: 'controlled-session', playerRole: 'gm', profileRoleId: null,
    profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
    identityHydrationRevision: 2, connection: 'live', freshness: 'server',
    connected: true, kicked: false, recoveryPending: false, invalidFields: [],
      currentOwnPlayerConfirmed: true, sdkHasServerAuthority: true, sdkResumePending: false,
    gmInstanceOwned: true, instanceId: 'controlled-gm-instance', phase: 'active', cycle: 1 };
  const context = { assert, Date: { now: () => now }, JSON, P181_NATIVE_TIMING, pc11GmReadiness,
    retainP181CallerRejection,
    gm: { controlled: true }, gmInstanceId: member.instanceId, sessionId: member.sessionId,
    ownedAuthUids: new Map([['gm', ownedUid]]),
    hashShort: value => createHash('sha256').update(value).digest('hex').slice(0, 16),
    readFullActor: async () => {
      if (late && kind === 'full') now = 101;
      const index = state.reads++;
      return memberReads ? memberReads[Math.min(index, memberReads.length - 1)] : member;
    },
    readGmRecoveryPending: async () => { if (late) now = 101; return recoveryResult; },
    // This clock-only adapter controls the retained observer port. The
    // contemporary R5 cases below use the actual mounted Auth/store observer.
    retainP181MemberAuthority: async () => ({ check: async () => {}, close: async () => {}, failed: new Promise(() => {}) }),
    bounded: async (_label, action) => action(),
    delay: async amount => { now += Math.max(1, amount); } };
  const body = kind === 'full' ? p181FullActorWaitBody : p181GmWaitBody;
  const method = kind === 'full' ? 'waitForFullActor' : 'waitForGm';
  const wait = runInNewContext(`(() => { ${body}; return ${method}; })()`, context);
  return { member, execute: () => kind === 'full'
    ? wait({}, 'Actual actor readiness', value => value.currentOwnPlayerConfirmed, 100)
    : wait(100, { active: true }) };
}

function actualP181StationWaitDiagnosticConsumer() {
  let entered;
  const reachedWait = new Promise(resolve => { entered = resolve; });
  const diagnostic = { activeAwaitedOperation: null };
  const roleLink = { first() { return this; }, waitFor: async () => {}, click: async () => {} };
  const run = runInNewContext(`(async () => { ${p181StationWaitBody} })()`, {
    Date, Math, normalPreparationDiagnostic: diagnostic, roleLink,
    deadlineAt: Date.now() + 60_000,
    wingCommander: { page: { locator: () => roleLink } },
    memberName: 'Wing Commander', memberRoleId: 'wing-commander',
    memberSurface: { page: { locator: () => roleLink } },
    bounded: async (_label, action) => action(),
    p181Remaining: () => 1_000,
    waitForFullActor: async (_surface, description) => {
      entered(description);
      return new Promise(() => {});
    },
    pc11MemberReadiness: () => false,
    sessionId: 'controlled-session', admittedAuth: { uidHash: 'controlled-uid-hash' },
    navigationStart: {},
    P181_NORMAL_SETUP: { wingCommanderRoleId: 'wing-commander' },
  });
  return { diagnostic, reachedWait, run };
}

function actualP181FirstFailureRetentionConsumer({ screenshotFails = false } = {}) {
  const error = Object.assign(new Error('original finite prepareNormalSession timeout'), { name: 'TimeoutError' });
  const screenshotBytes = Buffer.from('controlled-private-screenshot');
  const screenshots = [], writes = [], retained = [], bounds = [];
  const currentSurface = { page: { privateInput: 'controlled private input value', screenshot: async options => {
    screenshots.push(options);
    if (screenshotFails) throw new Error('controlled screenshot capture failure');
    return screenshotBytes;
  } } };
  const diagnostic = { active: true, actorRole: 'wing-commander', surface: currentSurface,
    activeAwaitedOperation: 'Original Wing Commander normal role chooser/seat claim',
    pendingReadiness: { connectionGeneration: 1, identityHydrationRevision: 1, sdkResumePending: true },
    steps: [{ ordinal: 1, actorRole: 'wing-commander', operation: 'normal-navigation.station-readiness-consumer',
      startedAtMs: 900, completedAtMs: null, status: 'pending' }] };
  const context = {
    assert, createHash, resolve, Date: { now: () => 1_000 }, error,
    normalPreparationDiagnostic: diagnostic,
    safeP181Error: p181ActualSafeError,
    captureP181PreparationPublicUi: async (surface, deadlineAt, cleanupDeadlineAt) => {
      assert.equal(surface, currentSurface, 'Capture the currently held actor surface.');
      assert.ok(deadlineAt <= 5_000 && cleanupDeadlineAt === 5_000);
      const screenshot = await surface.page.screenshot({ fullPage: false, timeout: deadlineAt - 1_000 });
      return { screenshot, label: 'privacy-redacted current-page diagnostic',
        publicDom: [{ kind: 'heading', text: 'Stations and consoles' }],
        omissions: 'All other content, inputs and private role content omitted; viewport only.', observedAtMs: 1_000 };
    },
    directory: '/tmp/p181-controlled-normal-preparation-diagnostic',
    privateFailureArtifact: null, sourceCommit: 'controlled-source-commit',
    sourceBindingsBefore: { sourceFiles: { controlled: 'source-hash' } },
    trace: [], remoteRequests: [], pageErrors: [], originalCreate: {},
    cleanupDeadlineAt: 5_000,
    rememberProofFailure,
    bounded: async (label, operation, deadlineAt) => {
      bounds.push({ label, deadlineAt });
      assert.ok(deadlineAt <= 5_000, 'Diagnostic retention keeps the original cleanup cutoff.');
      return operation();
    },
    writeFile: async (path, body, options) => writes.push({ path, body, options }),
    retainProofFailure: async (_directory, label, originalError, detail) => {
      retained.push({ label, error: originalError, detail });
      return { path: '/tmp/p181-controlled-original-failure.json', evidenceWriteFailed: false };
    },
  };
  context.finalizationBounded = context.bounded;
  const retain = runInNewContext(`(() => { ${p181FirstFailureRetentionBody}; return retainFirstFailure; })()`, context);
  return { error, diagnostic, screenshotBytes, screenshots, writes, retained, bounds,
    execute: () => retain(error, { deadlineAt: 5_000 }) };
}


// Exact finalization consumer probes use controlled writes and a real held-error observer.
// No provider, browser, Auth, server, build or network resource is started.
const p181FinalizationSourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
const p181FinalizationSource = await readFile(p181FinalizationSourcePath, 'utf8');
const p181FinalizationDigest = value => createHash('sha256').update(value).digest('hex');
const p181FinalizationStart = p181FinalizationSource.indexOf(
  '    assert.equal(remoteRequests.length, 0,', p181FinalizationSource.indexOf('export async function runP181StarlightMovementScoutNative('));
const p181FinalizationEnd = p181FinalizationSource.indexOf('\n/** Bind the exact on-disk P181 source set', p181FinalizationStart);
assert.ok(p181FinalizationStart > 0 && p181FinalizationEnd > p181FinalizationStart,
  'Bind the actual native catch/finally/final writer consumer.');
const p181FinalizationBody = p181FinalizationSource.slice(p181FinalizationStart, p181FinalizationEnd).trim();
const p181FingerprintStart = p181FinalizationSource.indexOf('const fingerprint =');
const p181FingerprintEnd = p181FinalizationSource.indexOf('\nconst safeP181Error', p181FingerprintStart);
assert.ok(p181FingerprintStart > 0 && p181FingerprintEnd > p181FingerprintStart);
const p181FingerprintBody = p181FinalizationSource.slice(p181FingerprintStart, p181FingerprintEnd);
const p181ActualFingerprint = runInNewContext(`(() => { ${p181FingerprintBody}; return fingerprint; })()`, { createHash });
const p181SafeErrorStart = p181FinalizationSource.indexOf('const safeP181Error =');
const p181SafeErrorEnd = p181FinalizationSource.indexOf('\n\nfunction p181ActorReady', p181SafeErrorStart);
assert.ok(p181SafeErrorStart > 0 && p181SafeErrorEnd > p181SafeErrorStart);
const p181SafeErrorBody = p181FinalizationSource.slice(p181SafeErrorStart, p181SafeErrorEnd);
const p181ActualSafeError = runInNewContext(`(() => { ${p181SafeErrorBody}; return safeP181Error; })()`,
  { fingerprint: p181ActualFingerprint });

function actualP181FinalizationConsumer({ remote = false, pageError = false, changedSource = false,
  primary = undefined, cleanupFails = false } = {}) {
  const writes = [], privateRecords = [];
  const before = { sourceFiles: { source: 'unchanged' } };
  const cleanup = { status: cleanupFails ? 'failed' : 'owned-cleanup-complete',
    errors: cleanupFails ? [{ step: 'controlled cleanup', error: { name: 'Error' } }] : [] };
  const context = {
    assert, Date, resolve, JSON, P181_NATIVE_TIMING, safeP181Error: p181ActualSafeError,
    ownerStop: actualOpenP181OwnerStopPort(), normalOperationsStopped: false,
    directory: '/tmp/p181-controlled-in-memory-only', sourceRoot: repositoryRoot,
    sourceCommit: 'controlled-source-not-native', sourceContractPreflight: { controlled: true },
    sourceBindingsBefore: before, runtime: { controlled: true }, servedSourceFiles: [],
    remoteRequests: remote ? ['https://controlled-foreign.invalid/blocked'] : [],
    pageErrors: pageError ? [{ surface: 'normal-wing-commander', name: 'TypeError' }] : [],
    surfaces: [{}, {}], browsers: [{}, {}], nativeActorCount: 2, proofProfile: 'starlight',
    ownedAuthUids: new Map(), trace: [], originalCreate: {},
    startAt: Date.now(), proofStopAt: Date.now() + 60_000,
    totalEnd: Date.now() + 240_000, privateFailureArtifact: null,
    retainFirstFailure: async () => undefined,
    cleanupDeadlineAt: Date.now() + 120_000, cleanupPromise: undefined,
    cleanupResult: undefined, cleanupFailures: [], firstError: primary,
    proofResult: { status: 'SOURCE_RUNNER_FLOW_COMPLETE', actualAcceptance: false,
      fixedCatalogClosures: 0, checkpointOrReleaseCredit: 0 },
    hashShort: value => p181FinalizationDigest(String(value)).slice(0, 16),
    bounded: async (_label, operation, deadlineAt) => { assert.ok(deadlineAt > Date.now()); return operation(); },
    operationDeadline: () => Date.now() + 60_000,
    captureP181SourceBindings: async () => changedSource
      ? { sourceFiles: { source: 'changed-after-core' } } : before,
    cleanupOwnedResources: async () => cleanup,
    writeFile: async (path, text, options) => { writes.push({ path, text, options }); },
    rememberProofFailure,
    retainProofFailure: async (_directory, label, error, detail) => {
      privateRecords.push({ label, error, full: originalProofError(error), detail });
      return { path: '/tmp/p181-controlled-in-memory-only/original-failure-controlled.json',
        evidenceWriteFailed: false };
    },
  };
  context.finalizationBounded = context.bounded;
  const run = runInNewContext(`(async () => { try { ${p181FinalizationBody})`, context,
    { filename: p181FinalizationSourcePath });
  return { context, writes, privateRecords, async execute() {
    let thrown;
    try { await run(); } catch (error) { thrown = error; }
    const output = writes.find(item => item.path.endsWith('/p181-starlight-movement-scout.json'));
    assert.ok(output, 'The actual final writer must execute in the controlled consumer.');
    return { thrown, output, final: JSON.parse(output.text) };
  } };
}

const nativeRootGuardOptions = sourceRoot => {
  const allocationStartedAtMs = Date.now();
  return {
  runtimeAllocated: 'yes',
  allocationStartedAtMs,
  sourceRoot,
  baseUrl: 'http://127.0.0.1:5173',
  projectId: 'demo-p181-root-test',
  ports: { auth: 9109, firestore: 8090, functions: 5011 },
  evidenceDirectory: '/tmp/p181-source-root-guard-test',
  allocationDeadlineMs: allocationStartedAtMs + 27 * 60_000,
  };
};

test('native source guard accepts the actual repository root before provider access', async () => {
  const previousCommit = process.env.P181_SOURCE_COMMIT;
  process.env.P181_SOURCE_COMMIT = 'intentional-source-guard-test-mismatch';
  try {
    await assert.rejects(runP181StarlightMovementScoutNative(nativeRootGuardOptions(repositoryRoot)),
      /Runtime launch and checked source must use the parent-provided exact source commit/,
      'A legitimate repository root must pass realpath equality and continue to the next intentional preflight guard.');
  } finally {
    if (previousCommit === undefined) delete process.env.P181_SOURCE_COMMIT;
    else process.env.P181_SOURCE_COMMIT = previousCommit;
  }
});

test('native source guard rejects a scripts-directory sourceRoot before provider access', async () => {
  await assert.rejects(runP181StarlightMovementScoutNative(nativeRootGuardOptions(resolve(repositoryRoot, 'scripts'))),
    /The parent must run the exact isolated source checkout/,
    'A scripts directory or unrelated path cannot substitute for the repository checkout.');
});

const original = Object.freeze({
  sessionId: 'normal-session', uid: 'wing-uid', uidHash: '81088b8f489c2407',
  meSessionId: 'normal-session',
  hasAuth: true, sameActor: true, playerRole: 'player', profileRoleId: null, profileSessionId: null,
  assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
  seatId: 'wing-commander', replacementRoleId: null, replacementStatus: null,
  roleId: 'wing-commander', generation: 2, connectionGeneration: 2,
  hydrationRevision: 3, identityHydrationRevision: 3, connection: 'live', freshness: 'server',
  phase: 'active', cycle: 1, airspace: 'lifted', turnStatePhase: 'coordination',
  documentTimeOrigin: 1_000,
  fullGameDemo: null, currentOwnPlayerConfirmed: true, sdkHasServerAuthority: true,
  connected: true, kicked: false, escapeLocked: false, sdkResumePending: false,
  invalidFields: [], currentCanonicalSeatOwned: true, currentMemberBerthPresent: true,
  currentMemberBerthNull: false, currentMemberBerthMatches: true, memberScopeMatches: true,
  fleetGroupId: 'fleet-1',
  groupId: 'fleet-1', shipId: 'aegis',
});

function makeConsumer({ departureOriginOverride, retargetProjectionRevisionOverride, date = Date } = {}) {
  const trace = [];
  const state = {
    actor: { ...original },
    session: { sessionId: 'normal-session', phase: 'active', cycle: 1, airspace: 'lifted', turnStatePhase: 'coordination',
      activeRoleIds: ['admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
        'quellon-explorer', 'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
        'joint-engineering-shepherd-icebreaker'],
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      control: { shuttleId: 'starlight', holderUidHash: '81088b8f489c2407',
        ownerUidHash: '81088b8f489c2407', revision: 4 },
      docking: { shuttleId: 'starlight', shipId: 'aegis' },
      departure: null, transit: null,
      scoutOffer: { eligible: true, sessionId: 'normal-session', cycle: 1, airspace: 'lifted',
        entitlementId: 'starlight', ownerRoleId: 'wing-commander', anchorShipId: 'aegis',
        firstRequestAvailable: true, fuelledSecondRequestAvailable: false,
        coordinate: '1100', printedCoordinates: ['1100', '1101'], distance: 2, range: 2 },
      privateResult: null, privateNote: null,
    },
  };
  let commandCount = 0, scoutCount = 0, transitWaitCount = 0;
  const page = new EventEmitter();
  page.url = () => 'http://127.0.0.1:5174/#/shuttles/starlight';
  const result = async (endpoint, request, value) => {
    commandCount++;
    const response = {
      url: () => `http://127.0.0.1:5013/demo-p181-test/us-central1/${endpoint}`,
      status: () => 200,
      request: () => ({ url: () => response.url(), method: () => 'POST',
        postDataJSON: () => ({ data: structuredClone(request) }) }),
      json: async () => ({ result: structuredClone(value) }),
    };
    let observerArmed = false;
    const observed = await observeUiReceipt({ page, consumed: { endpoint, source: 'controlled actual UI fixture' },
      waitForResponse: () => { observerArmed = true; return Promise.resolve(response); },
      choose: async () => {
        assert.equal(observerArmed, true, 'The existing shared receipt observer is armed before the consumer action.');
        trace.push({ endpoint, request: structuredClone(request) });
      } });
    assert.equal(observed, response);
    const data = structuredClone(observed.request().postDataJSON().data);
    return { endpoint, data, request: data, before: structuredClone(state.actor),
      httpStatus: observed.status(), result: (await observed.json()).result };
  };
  const io = {
    async observeMember() { return structuredClone(state.actor); },
    async observeFlight() { return structuredClone(state.session); },
    async openStarlightFromWingWorkspace() { trace.push({ ui: 'open-starlight' }); },
    async departureOptions() { return ['icebreaker', 'shepherd']; },
    async retargetOptions() { return ['aegis', 'shepherd', 'quellon']; },
    async requestDeparture(destination, before) {
      const request = { sessionId: 'normal-session', requestId: 'departure-1', shuttleId: 'starlight',
        destinationShipId: destination, expectedControlRevision: before.control.revision, expectedCycle: before.cycle };
      state.session.departure = { requestId: request.requestId,
        originShipId: departureOriginOverride ?? state.session.docking.shipId,
        destinationShipId: destination, cycle: before.cycle };
      return result('requestShuttleDeparture', request, { status: 'requested', requestId: request.requestId });
    },
    async waitForDeparture() { return structuredClone(state.session); },
    async beginTransit(departure, before) {
      const request = { sessionId: 'normal-session', requestId: 'begin-1', shuttleId: 'starlight',
        expectedDepartureRequestId: departure.requestId, expectedControlRevision: before.control.revision,
        expectedCycle: before.cycle };
      const departedAt = new date().toISOString();
      state.session.transit = { status: 'in-transit', requestId: departure.requestId,
        transitRequestId: 'transit-1', shuttleId: 'starlight', holderUid: 'wing-uid', fleetGroupId: 'fleet-1',
        destinationShipId: departure.destinationShipId, cycle: before.cycle, controlRevision: before.control.revision,
        requestedAt: new date(date.now() - 1_000).toISOString(), revision: 1,
        currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 },
        velocity: { x: 1, y: 1, z: 1 }, departedAt,
        arrivesAt: new date(date.parse(departedAt) + 60_000).toISOString() };
      state.session.departure = null;
      return result('beginShuttleTransit', request, { ...state.session.transit, sessionId: request.sessionId });
    },
    async waitForTransit() {
      transitWaitCount++;
      const current = structuredClone(state.session);
      if (transitWaitCount === 2 && retargetProjectionRevisionOverride !== undefined && current.transit)
        current.transit.revision = retargetProjectionRevisionOverride;
      return current;
    },
    async retargetTransit(transit, destination, before) {
      const request = { sessionId: 'normal-session', requestId: 'retarget-1', shuttleId: 'starlight',
        transitRequestId: transit.transitRequestId, destinationShipId: destination,
        expectedControlRevision: before.control.revision, expectedCycle: before.cycle };
      const departedAt = new date().toISOString();
      state.session.transit = { ...state.session.transit, destinationShipId: destination,
        revision: state.session.transit.revision + 1, departedAt,
        arrivesAt: new date(date.parse(departedAt) + 60_000).toISOString() };
      return result('retargetShuttleTransit', request, { ...state.session.transit, sessionId: request.sessionId });
    },
    async waitForArrivalWindow(transit, timeout, deadlineAt) {
      assert.equal(deadlineAt, Math.min(this.absoluteDeadlineAt, date.parse(transit.arrivesAt) + 60_000),
        'The source due time and original proof cutoff fix one arrival response deadline.');
      assert.ok(timeout > 0 && timeout <= deadlineAt - date.parse(transit.departedAt));
      assert.equal(Date.parse(transit.arrivesAt) - Date.parse(transit.departedAt), 60_000,
        'Controlled source timer models the native Starlight 60-second duration without sleeping or making actors.');
      const beforeFlight = structuredClone(state.session);
      const capture = await this.completeArrival(transit, beforeFlight, state.actor, timeout);
      return { beforeFlight, afterFlight: structuredClone(state.session),
        actor: structuredClone(state.actor), capture };
    },
    async completeArrival(transit, before) {
      const request = { sessionId: 'normal-session', shuttleId: 'starlight',
        transitRequestId: transit.transitRequestId, expectedControlRevision: before.control.revision };
      state.session.docking = { shuttleId: 'starlight', shipId: transit.destinationShipId };
      state.session.transit = null;
      // Arrival changes docking/history, not the custody CAS revision.
      return result('completeShuttleArrival', request, { status: 'arrived', sessionId: request.sessionId,
        requestId: `arrival-${transit.transitRequestId}`, transitRequestId: transit.transitRequestId,
        shuttleId: request.shuttleId, hostShipId: transit.destinationShipId,
        arrivedAt: new date(Math.max(date.now(), date.parse(transit.arrivesAt) + 1)).toISOString(),
        transitRevision: transit.revision });
    },
    async waitForDocking() { return structuredClone(state.session); },
    async currentScoutOffer() { return structuredClone(state.session.scoutOffer); },
    async selectPrintedScoutCoordinate(coordinate, offer) {
      assert.ok(offer.printedCoordinates.includes(coordinate));
      state.session.scoutOffer = { ...state.session.scoutOffer, coordinate };
      trace.push({ ui: 'select-current-printed-scout-coordinate', coordinate });
      return structuredClone(state.session.scoutOffer);
    },
    async requestScout(coordinate, before) {
      const ordinal = ++scoutCount;
      const request = { sessionId: 'normal-session', requestId: `scout-${ordinal}`,
        entitlementId: 'starlight', targetCoordinate: coordinate };
      const response = { status: 'requested', resolution: 'pending', requestId: request.requestId,
        sessionId: request.sessionId, cycle: before.cycle, entitlementId: 'starlight', source: 'craft',
        ownerRoleId: 'wing-commander', anchorShipId: 'aegis', receivingShipId: state.session.docking.shipId,
        targetCoordinate: coordinate };
      state.session.scoutOffer = { ...state.session.scoutOffer, firstRequestAvailable: false,
        fuelledSecondRequestAvailable: true };
      return result('requestScout', request, response);
    },
    async resolveScoutNormally(request) {
      trace.push({ ui: 'normal-gm-scout-resolution', requestId: request.requestId });
      state.session.privateResult = { sessionId: 'normal-session', requestId: request.requestId, type: 'private-scout-result',
        requesterUid: 'wing-uid', sourceId: 'starlight', cycle: 1, targetCoordinate: request.targetCoordinate,
        systemFact: { coordinate: request.targetCoordinate, code: 'A', title: 'Actual private current fact' } };
      state.session.privateNote = { id: '1'.repeat(64), type: 'player-discovery-note', cycle: 1,
        targetCoordinate: request.targetCoordinate, systemFact: { ...state.session.privateResult.systemFact },
        recordedAt: new Date().toISOString() };
      return { report: { requestId: request.requestId, cycle: 1, entitlementId: 'starlight',
        targetCoordinate: request.targetCoordinate, status: 'resolved', noteId: state.session.privateNote.id },
        result: structuredClone(state.session.privateResult), note: structuredClone(state.session.privateNote) };
    },
    async reloadAndReselectWingCommander() {
      trace.push({ ui: 'reload-and-reselect-wing-commander' });
      return { actor: structuredClone(state.actor), flight: structuredClone(state.session) };
    },
  };
  return { io, trace, state, commandCount, receipt: result };
}

function completeProofInput(io, expectedWingCommander = original) {
  return {
    initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: true,
      playerCount: 8, chartId: 'A', fullGameDemo: null, activeRoleIds: originalRoleIds },
    started: { sessionId: 'normal-session', phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
      instanceId: 'gm-original-instance', fullGameDemo: null },
    roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: 'normal-session' }],
    gm: { uidHash: 'b'.repeat(16), sessionId: 'normal-session', meSessionId: 'normal-session',
      instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
      profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
      identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
      kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
      sdkHasServerAuthority: true, gmInstanceOwned: true },
    expectedWingCommander,
    io,
    absoluteDeadlineMs: Date.now() + 15 * 60_000,
  };
}

function setSafeStarlightCustody(state, holderUid) {
  const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
  state.session.control = { shuttleId: 'starlight', holderUidHash: hash(holderUid),
    ownerUidHash: hash(holderUid), revision: state.session.control.revision };
}

async function actualCaptureActionConsumer({ ownedGm = false, endpoint = 'claimGmInstance',
  currentUid = 'controlled-original-uid' } = {}) {
  const sourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const source = await readFile(sourcePath, 'utf8');
  const start = source.indexOf('  async function captureAction(');
  const end = source.indexOf('  async function authorizeAndClaimOriginalGm(', start);
  assert.ok(start >= 0 && end > start, 'Read the exact current nested captureAction source body.');
  const body = source.slice(start, end).trim();
  const rawUid = currentUid;
  const registeredUid = 'controlled-original-uid';
  const actor = { sessionId: 'controlled-session', meSessionId: 'controlled-session',
    uidHash: createHash('sha256').update(rawUid).digest('hex').slice(0, 16),
    hasAuth: true, sameActor: true, connection: 'live', freshness: 'server',
    documentTimeOrigin: 1_000, generation: 1, hydrationRevision: 1,
    connectionGeneration: 1, identityHydrationRevision: 1,
    phase: 'casting', cycle: 0, setupRevision: 0, connected: true, kicked: false, escapeLocked: false,
    currentOwnPlayerConfirmed: true, sdkHasServerAuthority: true, sdkResumePending: false,
    invalidFields: [], profileRoleId: null, profileSessionId: null, recoveryPending: false,
    privateAudienceMatches: true, foreignPendingCount: 0,
    playerRole: ownedGm ? 'gm' : 'player', gmInstanceOwned: ownedGm,
    instanceId: ownedGm ? 'controlled-owned-instance' : null,
    claimedAt: ownedGm ? 'controlled-original-claim' : null,
    activeConsoleRoleId: null };
  const counts = { choices: 0, observers: 0 };
  const data = { sessionId: actor.sessionId, instanceId: 'controlled-owned-instance',
    ...(endpoint === 'confirmSetup' ? { requestId: 'controlled-confirm', expectedSetupRevision: 0 } : {}) };
  const response = { url: () => `http://127.0.0.1:5011/demo-p181-controlled/us-central1/${endpoint}`,
    request: () => ({ method: () => 'POST', postDataJSON: () => ({ data }) }),
    status: () => 200, json: async () => ({ result: endpoint === 'confirmSetup'
      ? { status: 'committed', requestId: data.requestId, setupRevision: 1, setupConfirmed: true }
      : { status: 'committed', instance: {
        id: data.instanceId, sessionId: actor.sessionId, uid: rawUid, claimedAt: 'controlled-original-claim' } } }) };
  const surface = { storeModuleUrl: () => 'controlled-store-url',
    sessionAuthorityModuleUrl: () => '/src/lib/sessionSnapshotAuthority.ts',
    page: { evaluate: async () => structuredClone(actor),
      waitForResponse: async predicate => {
        counts.observers++;
        assert.equal(predicate(response), true);
        return response;
      } } };
  const trace = [];
  const captureAction = runInNewContext(`(${body})`, {
    assert, Date, P181_NATIVE_TIMING, gm: surface, sessionId: actor.sessionId,
    gmInstanceId: ownedGm ? 'controlled-owned-instance' : null,
    gmClaimedAt: ownedGm ? 'controlled-original-claim' : null,
    ownedAuthUids: new Map([['gm', registeredUid]]), hashShort: value => createHash('sha256').update(value).digest('hex').slice(0, 16),
    bounded: actualP181BoundedConsumer().bounded,
    originalGmClaimActor: structuredClone(actor),
    readFullActor: async () => structuredClone(actor), pc11SameActorEpoch,
    pc11GmReadiness, readGmRecoveryPending: async () => false,
    observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt, trace,
  }, { filename: sourcePath });
  return { counts, trace, async run() {
    return captureAction(surface, endpoint, async () => {
      counts.choices++;
      if (endpoint === 'confirmSetup') actor.setupRevision = 1;
    }, Date.now() + 5_000);
  } };
}

const controlledSetupCode = new Map();

// Execute complete current production modules, including their registered
// callable boundaries and real validators/authority/receipt/transition logic.
// Only platform registration, storage and transport are inert ports. This is
// source evidence, never browser, Firebase SDK or native gameplay evidence.
function controlledSetupProducers() {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const sourceRoot = fileURLToPath(new URL('../functions/src/', import.meta.url));
  const docs = new Map(), writes = [], registrations = [], modules = new Map();
  const deleted = Symbol('controlled delete');
  class Timestamp {
    constructor(ms) { this.ms = ms; }
    static now() { return new Timestamp(Date.now()); }
    static fromMillis(ms) { return new Timestamp(ms); }
    static fromDate(date) { return new Timestamp(date.getTime()); }
    toDate() { return new Date(this.ms); }
    toMillis() { return this.ms; }
  }
  class HttpsError extends Error {
    constructor(code, message, details) { super(message); this.code = code; this.details = details; }
  }
  const clone = value => value instanceof Timestamp ? new Timestamp(value.ms)
    : value instanceof Date ? new Date(value) : Array.isArray(value) ? value.map(clone)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) : value;
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) });
  const snapshot = path => {
    const fields = clone(docs.get(path));
    return { id: ref(path).id, ref: ref(path), exists: fields !== undefined,
      data: () => fields, get: key => key.split('.').reduce((v, k) => v?.[k], fields) };
  };
  const query = path => ({ path, query: true, doc: id => ref(`${path}/${id ?? 'controlled-session'}`),
    get: async () => read({ path, query: true }) });
  const read = reference => reference.query ? { docs: [...docs.keys()]
    .filter(path => path.startsWith(`${reference.path}/`) && !path.slice(reference.path.length + 1).includes('/'))
    .map(snapshot) } : snapshot(reference.path);
  const apply = (path, fields, merge) => {
    const current = merge ? clone(docs.get(path) ?? {}) : {};
    for (const [key, value] of Object.entries(fields)) {
      const parts = key.split('.'), leaf = parts.pop(); let target = current;
      for (const part of parts) target = target[part] ??= {};
      if (value === deleted) delete target[leaf]; else target[leaf] = clone(value);
    }
    docs.set(path, current);
  };
  const db = { doc: ref, collection: query, async runTransaction(operation) {
    const pending = [];
    const result = await operation({ get: async reference => read(reference),
      getAll: async (...references) => references.map(read),
      set: (reference, fields, options) => pending.push({ path: reference.path, fields, merge: !!options }),
      create: (reference, fields) => { assert.equal(docs.has(reference.path), false); pending.push({ path: reference.path, fields }); },
      update: (reference, fields) => { assert.ok(docs.has(reference.path)); pending.push({ path: reference.path, fields, merge: true }); },
      delete: reference => pending.push({ path: reference.path, remove: true }) });
    for (const row of pending) {
      writes.push(row);
      if (row.remove) docs.delete(row.path); else apply(row.path, row.fields, row.merge);
    }
    return result;
  } };
  const register = kind => (...args) => {
    const handler = args.at(-1); registrations.push(kind);
    return Object.assign(handler, { run: handler });
  };
  const ports = {
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => db, Timestamp,
      FieldValue: { delete: () => deleted, serverTimestamp: () => Timestamp.now() },
      FieldPath: { documentId: () => '__name__' } },
    'firebase-admin/functions': { getFunctions: () => { throw new Error('Unexpected controlled task transport acquisition.'); } },
    'firebase-functions/v2': { setGlobalOptions() {} },
    'firebase-functions/v2/https': { HttpsError, onCall: register('callable') },
    'firebase-functions/v2/firestore': { onDocumentWritten: register('write-trigger') },
    'firebase-functions/v2/scheduler': { onSchedule: register('schedule') },
    'firebase-functions/v2/tasks': { onTaskDispatched: register('task') },
    'firebase-functions/logger': { warn() {}, info() {}, error() {}, debug() {} },
    'firebase-functions': { logger: { warn() {}, info() {}, error() {}, debug() {} } },
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} }; modules.set(path, module);
    if (!controlledSetupCode.has(path)) controlledSetupCode.set(path, ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: path,
    }).outputText);
    runInNewContext(controlledSetupCode.get(path), { module, exports: module.exports, Date, Buffer,
      process: { env: { GCLOUD_PROJECT: 'demo-p181-controlled', FUNCTIONS_EMULATOR: 'true' } },
      require(name) {
        if (Object.hasOwn(ports, name)) return ports[name];
        if (name.startsWith('node:')) return require(name);
        assert.ok(name.startsWith('.'), `No uncontrolled production module transport: ${name}`);
        return load(resolve(dirname(path), name.endsWith('.ts') ? name : `${name}.ts`));
      },
    }, { filename: path });
    return module.exports;
  }
  return { handlers: load(resolve(sourceRoot, 'index.ts')), docs, writes, registrations, Timestamp,
    sourceModulePaths: [...modules.keys()], async invoke(endpoint, data, uid = 'controlled-original-gm') {
      return this.handlers[endpoint].run({ data, auth: { uid } });
    } };
}

async function actualSetupTransitionConsumer({ afterReply, beforeChoice, afterFreshGmRead, replyChange,
  publication, afterLifecycleRead } = {}) {
  const producer = controlledSetupProducers(), gmUid = 'controlled-original-gm', wingUid = 'controlled-original-wing';
  const created = await producer.invoke('createSession', { requestId: 'controlled-create', name: 'Controlled normal setup',
    displayName: 'Controlled GM', playerCount: 8, chartId: 'A' });
  const sessionId = created.session.id, sessionPath = `sessions/${sessionId}`;
  producer.docs.set(`${sessionPath}/players/${gmUid}`, { ...created.player, role: 'gm', connected: true, connectionGeneration: 1 });
  producer.docs.set(`${sessionPath}/players/${wingUid}`, { uid: wingUid, sessionId, role: 'player',
    connected: true, connectionGeneration: 1, assignedRoleId: null, activeConsoleRoleId: null, seatId: null });
  const claimedAt = new Date().toISOString(), instanceId = 'controlled-original-bridge';
  producer.docs.set(`${sessionPath}/gmInstances/${instanceId}`, { uid: gmUid, sessionId, connected: true,
    responsibility: 'main', claimedAt: producer.Timestamp.fromMillis(Date.parse(claimedAt)), lastSeenAt: producer.Timestamp.now() });
  const local = { generation: 1, hydrationRevision: 1, uid: gmUid, freshness: 'server', connection: 'live',
    instanceId, claimedAt, sdkHasServerAuthority: true, sdkResumePending: false };
  const session = () => producer.docs.get(sessionPath);
  const publications = []; let publicationQueue = [], mountedSession;
  const store = () => {
    mountedSession = publicationQueue.length ? publicationQueue.shift() : session();
    if (currentReply) publications.push({ phase: mountedSession.phase, cycle: mountedSession.currentTurn,
      setupRevision: mountedSession.setupRevision, sdkResumePending: local.sdkResumePending,
      sdkHasServerAuthority: local.sdkHasServerAuthority });
    return { session: { ...mountedSession, id: sessionId },
    me: { ...producer.docs.get(`${sessionPath}/players/${local.uid}`), uid: local.uid, connectionGeneration: local.generation },
    gmInstance: { ...producer.docs.get(`${sessionPath}/gmInstances/${instanceId}`), id: local.instanceId,
      claimedAt: local.claimedAt }, connection: local.connection, sessionSnapshotFreshness: local.freshness,
    identityHydrationRevision: local.hydrationRevision, gmAccessAuthenticatedAt: 1, gmRecoveryPending: false, pendingCommands: [],
    gmAwayMissionHandPointers: [], gmLoyaltyCensusStatus: 'loading' };
  };
  const page = new EventEmitter(), trace = [], counts = { choices: 0, observers: 0, provider: 0, browser: 0, auth: 0 };
  const surface = { page, storeModuleUrl: () => '/controlled-current-store',
    sessionAuthorityModuleUrl: () => '/src/lib/sessionSnapshotAuthority.ts' };
  const mutations = [], rawResults = []; let gmReads = 0;
  let observer, endpoint, data, currentReply;
  page.url = () => 'http://127.0.0.1:5277/#/gm/setup';
  page.evaluate = async (callback, argument) => {
    const value = await runInNewContext(
    `(${callback.toString().replaceAll('import(', 'controlledImport(')})`, {
      crypto: webcrypto, TextEncoder, Date,
      document: { querySelector: selector => (mountedSession ?? session()).turnPhase?.timerPause?.reason === 'turn-interstitial' &&
        selector.includes('Cycle briefing') ? {} : null },
      controlledImport: async name => name === '/src/lib/firebase.ts' ? { auth: () => ({ currentUser: { uid: local.uid } }) }
        : name === '/src/lib/demoActorContext.ts' ? { activeDemoActorProfile: null }
          : name === '/controlled-current-store' ? { useSessionStore: { getState: store } }
            : name === '/src/lib/sessionSnapshotAuthority.ts' ? {
              sessionSnapshotAuthorityFor: () => ({ hasServerSessionAuthority: local.sdkHasServerAuthority }),
              memberSessionResumeBlocksFreshness: () => local.sdkResumePending }
            : assert.fail(`Unexpected controlled observer import: ${name}`),
    })(argument);
    afterLifecycleRead?.({ value, session: session(), local, endpoint, counts, gmReads });
    return value;
  };
  page.waitForResponse = async (predicate, options) => {
    counts.observers++; assert.ok(options.timeout > 0 && options.timeout <= 60_000);
    return new Promise(resolve => { observer = response => { assert.equal(predicate(response), true); resolve(response); }; });
  };
  const actor = async () => {
    const safe = await observeLifecycleActor(surface, sessionId);
    return { ...safe, meSessionId: sessionId, documentTimeOrigin: 1_000,
      connectionGeneration: safe.generation, identityHydrationRevision: safe.hydrationRevision,
      connected: true, kicked: false, escapeLocked: false, currentOwnPlayerConfirmed: true,
      sdkHasServerAuthority: local.sdkHasServerAuthority, sdkResumePending: local.sdkResumePending,
      invalidFields: [], profileRoleId: null, profileSessionId: null, recoveryPending: false };
  };
  const path = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const source = await readFile(path, 'utf8'), start = source.indexOf('  async function captureAction(');
  const end = source.indexOf('  async function authorizeAndClaimOriginalGm(', start);
  assert.ok(start >= 0 && end > start);
  const capture = runInNewContext(`(${source.slice(start, end).trim()})`, {
    assert, Date, P181_NATIVE_TIMING, gm: surface, sessionId, gmInstanceId: instanceId, gmClaimedAt: claimedAt,
    ownedAuthUids: new Map([['gm', gmUid]]), hashShort: value => createHash('sha256').update(value).digest('hex').slice(0, 16),
    bounded: actualP181BoundedConsumer().bounded, originalGmClaimActor: await actor(),
    readFullActor: async () => { const value = await actor(); gmReads++;
      afterFreshGmRead?.({ session: session(), local, endpoint, counts, gmReads }); return value; },
    pc11SameActorEpoch, pc11GmReadiness, readGmRecoveryPending: async () => false,
    observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt, trace,
  }, { filename: path });
  return { producer, session, local, counts, trace, mutations, rawResults, surface, actor, publications,
    setupData: () => ({ sessionId, instanceId, requestId: 'controlled-confirm', expectedSetupRevision: session().setupRevision,
      playerCount: 8, chartId: 'A', activeRoleIds: originalRoleIds }),
    assignData: requestId => ({ sessionId, instanceId, requestId: requestId ?? 'controlled-assign', targetUid: wingUid, roleId: 'wing-commander' }),
    startData: () => ({ sessionId, instanceId, requestId: 'controlled-start', expectedSetupRevision: session().setupRevision }),
    clearData: () => ({ sessionId, requestId: 'controlled-clear', expectedCycle: session().currentTurn,
      expectedPausedAt: session().turnPhase.timerPause.pausedAt }),
    async direct(name, request) { return producer.invoke(name, request); },
    async claimWing() {
      return producer.invoke('claimSeat', { sessionId, requestId: 'controlled-wing-seat', seatId: 'wing-commander',
        expectedSetupRevision: session().setupRevision }, wingUid);
    },
    async run(name, request, deadlineAt = Date.now() + 5_000) {
      endpoint = name; data = request; currentReply = null; publicationQueue = []; publications.length = 0;
      const previous = structuredClone(session());
      return capture(surface, name, async () => {
        beforeChoice?.({ session: session(), local, endpoint }); counts.choices++; mutations.push(name);
        currentReply = await producer.invoke(name, request); rawResults.push(currentReply);
        afterReply?.({ session: session(), local, endpoint, result: currentReply });
        publicationQueue = publication?.({ previous, committed: structuredClone(session()), endpoint,
          result: currentReply }) ?? [];
        const result = replyChange ? replyChange(currentReply, name) : currentReply;
        observer({ url: () => `http://127.0.0.1:5011/demo-p181-controlled/us-central1/${name}`,
          request: () => ({ method: () => 'POST', postDataJSON: () => ({ data }) }),
          status: () => 200, json: async () => ({ result }) });
      }, deadlineAt);
    } };
}

async function prepareControlledCasting(fixture) {
  await fixture.direct('confirmSetup', fixture.setupData());
  await fixture.direct('assignRole', fixture.assignData());
  await fixture.claimWing();
}

test('setup publication delayed real assignRole accepts only its eventual casting revision after the old and local-revision-only snapshots', async () => {
  const f = await actualSetupTransitionConsumer({ publication: ({ previous, committed, result }) => [
    previous, { ...previous, setupRevision: result.setupRevision }, committed,
  ] });
  await f.direct('confirmSetup', f.setupData());
  let captured, error;
  try { captured = await f.run('assignRole', f.assignData()); } catch (e) { error = e; }
  assert.equal(f.rawResults.length, 1); assert.equal(f.rawResults[0].setupRevision, 2);
  assert.equal(f.session().phase, 'casting'); assert.equal(f.session().setupRevision, 2);
  assert.equal(error, undefined, `Real assignment committed; independent publication must settle without another choice: ${error?.message}`);
  assert.equal(captured.result.setupRevision, 2);
  assert.deepEqual(f.publications.map(({ phase, cycle, setupRevision }) => ({ phase, cycle, setupRevision })), [
    { phase: 'lobby', cycle: 0, setupRevision: 1 },
    { phase: 'lobby', cycle: 0, setupRevision: 2 },
    { phase: 'casting', cycle: 0, setupRevision: 2 },
  ]);
  assert.deepEqual(f.counts, { choices: 1, observers: 1, provider: 0, browser: 0, auth: 0 });
});

test('setup publication delayed real confirmSetup waits for its exact next revision without changing phase or cycle', async () => {
  const f = await actualSetupTransitionConsumer({ publication: ({ previous, committed }) => [previous, committed] });
  const captured = await f.run('confirmSetup', f.setupData());
  assert.equal(captured.result.status, 'committed');
  assert.deepEqual(f.publications.map(({ phase, cycle, setupRevision }) => ({ phase, cycle, setupRevision })), [
    { phase: 'lobby', cycle: 0, setupRevision: 0 }, { phase: 'lobby', cycle: 0, setupRevision: 1 },
  ]);
  assert.equal(f.counts.choices, 1); assert.equal(f.counts.observers, 1);
});

test('setup publication delayed real startGame waits from its original casting/C0 to the exact active/C1 briefing receipt', async () => {
  const f = await actualSetupTransitionConsumer({ publication: ({ previous, committed }) => [previous, committed] });
  await prepareControlledCasting(f);
  const captured = await f.run('startGame', f.startData());
  assert.equal(captured.result.currentTurn, 1);
  assert.equal(captured.result.turnPhase.timerPause.pausedAt, f.session().turnPhase.timerPause.pausedAt);
  assert.deepEqual(f.publications.map(({ phase, cycle, setupRevision }) => ({ phase, cycle, setupRevision })), [
    { phase: 'casting', cycle: 0, setupRevision: 3 }, { phase: 'active', cycle: 1, setupRevision: 4 },
  ]);
  assert.equal(f.counts.choices, 1); assert.equal(f.counts.observers, 1);
});

test('setup publication delayed real briefing clear waits only for its exact resumed clock and never clears twice', async () => {
  const f = await actualSetupTransitionConsumer({ publication: ({ previous, committed }) => [previous, committed] });
  await prepareControlledCasting(f); await f.direct('startGame', f.startData());
  const request = f.clearData(), captured = await f.run('clearTurnAdvanceInterstitial', request);
  assert.equal(captured.result.pausedAt, request.expectedPausedAt);
  assert.equal(f.session().turnPhase.timerPause, undefined);
  assert.equal(f.session().turnPhase.teamPhaseEndsAt, captured.result.turnPhase.teamPhaseEndsAt);
  assert.equal(f.publications.length, 2);
  assert.equal(f.counts.choices, 1); assert.equal(f.counts.observers, 1);
});

test('setup publication cannot qualify an obsolete snapshot when its original absolute deadline expires', async () => {
  const f = await actualSetupTransitionConsumer({ publication: ({ previous }) => Array.from({ length: 20 }, () => previous) });
  await f.direct('confirmSetup', f.setupData());
  const end = Date.now() + 100;
  await assert.rejects(f.run('assignRole', f.assignData(), end), /deadline|exhaust/i);
  assert.equal(f.session().phase, 'casting'); assert.equal(f.session().setupRevision, 2);
  assert.equal(f.counts.choices, 1); assert.equal(f.counts.observers, 1);
  assert.equal(f.trace.length, 0);
});

test('setup publication retains live original authority on each delayed committed snapshot', async () => {
  let delayed = false;
  const f = await actualSetupTransitionConsumer({ publication: ({ previous, committed }) => [previous, committed],
    afterLifecycleRead: ({ local, value, counts }) => {
      if (counts.choices === 1 && value.setupRevision === 1 && !delayed) { delayed = true; local.hydrationRevision++; }
    } });
  await f.direct('confirmSetup', f.setupData());
  await assert.rejects(f.run('assignRole', f.assignData()), /hydrat|revision/i);
  assert.equal(f.counts.choices, 1); assert.equal(f.session().phase, 'casting'); assert.equal(f.trace.length, 0);
});

for (const [field, changed] of [['sdkResumePending', true], ['sdkHasServerAuthority', false]]) {
  test(`setup dispatch fresh ${field} fence denies the real confirmSetup producer after awaited preparation`, async () => {
    const f = await actualSetupTransitionConsumer({ afterFreshGmRead: ({ local, gmReads }) => {
      if (gmReads === 2) local[field] = changed;
    } });
    const before = f.producer.writes.length;
    let error;
    try { await f.run('confirmSetup', f.setupData()); } catch (e) { error = e; }
    assert.ok(error, `Original SDK ${field} changed before dispatch, but the real producer was accepted.`);
    assert.match(error.message, /SDK|server authority|resume|pending/i);
    assert.equal(f.local[field], changed);
    assert.equal(f.counts.choices, 0, 'No producer call after the fresh authority fence fails.');
    assert.equal(f.producer.writes.length, before); assert.equal(f.rawResults.length, 0); assert.equal(f.trace.length, 0);
  });
}

test('setup transition real assignRole lobby/C0 producer is accepted by the actual nested observer only at its committed casting revision', async () => {
  const f = await actualSetupTransitionConsumer(); await f.direct('confirmSetup', f.setupData());
  assert.equal(f.session().phase, 'lobby'); assert.equal(f.session().currentTurn, 0);
  let captured, error;
  try { captured = await f.run('assignRole', f.assignData()); } catch (e) { error = e; }
  assert.equal(f.session().phase, 'casting'); assert.equal(f.session().currentTurn, 0);
  assert.equal(f.rawResults.length, 1); assert.equal(f.counts.choices, 1);
  assert.equal(f.producer.docs.get('sessions/controlled-session/players/controlled-original-wing').assignedRoleId, 'wing-commander');
  assert.equal(error, undefined, `Actual producer committed the legitimate casting transition; observer rejected: ${error?.message}`);
  assert.equal(captured.result.setupRevision, f.session().setupRevision);
});

test('setup transition real startGame producer advances casting/C0 to ordinary active/C1 with its exact receipt and held briefing', async () => {
  const f = await actualSetupTransitionConsumer(); await prepareControlledCasting(f);
  let captured, error;
  try { captured = await f.run('startGame', f.startData()); } catch (e) { error = e; }
  assert.equal(f.session().phase, 'active'); assert.equal(f.session().currentTurn, 1);
  assert.equal(f.session().fullGameDemo, undefined); assert.equal(f.rawResults[0].status, 'committed');
  assert.equal(f.rawResults[0].currentTurn, 1); assert.equal(f.session().turnPhase.timerPause.reason, 'turn-interstitial');
  assert.equal(error, undefined, `Actual producer committed the legitimate first cycle; observer rejected: ${error?.message}`);
  assert.equal(captured.result.requestId, captured.data.requestId);
});

test('setup transition complete normal two-actor source journey keeps setup, assignment, seat, start and exact briefing clear meanings', async () => {
  const f = await actualSetupTransitionConsumer();
  await f.run('confirmSetup', f.setupData());
  assert.equal(f.session().phase, 'lobby'); assert.equal(f.session().currentTurn, 0);
  await f.run('assignRole', f.assignData());
  await f.claimWing();
  await f.run('startGame', f.startData());
  const request = f.clearData(); await f.run('clearTurnAdvanceInterstitial', request);
  assert.equal(f.session().phase, 'active'); assert.equal(f.session().currentTurn, 1);
  assert.equal(f.session().turnPhase.timerPause, undefined);
  assert.deepEqual(f.mutations, ['confirmSetup', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial']);
  assert.deepEqual(f.counts, { choices: 4, observers: 4, provider: 0, browser: 0, auth: 0 });
  assert.equal(f.producer.docs.get('sessions/controlled-session/players/controlled-original-gm').seatId, null);
});

test('setup transition a released role is assigned again in casting/C0 at the actual current revision', async () => {
  const f = await actualSetupTransitionConsumer(); await prepareControlledCasting(f);
  const { roleId: _roleId, ...release } = f.assignData('controlled-release');
  await f.direct('releaseRole', release);
  const before = f.session().setupRevision;
  const capture = await f.run('assignRole', f.assignData('controlled-reassign'));
  assert.equal(capture.result.setupRevision, before + 1); assert.equal(f.session().phase, 'casting'); assert.equal(f.session().currentTurn, 0);
});

test('setup transition actual production stale start remains denied without advancing phase, cycle or observer action recovery', async () => {
  const f = await actualSetupTransitionConsumer(); await prepareControlledCasting(f);
  const before = { ...f.session() }, request = { ...f.startData(), expectedSetupRevision: f.session().setupRevision - 1 };
  await assert.rejects(f.run('startGame', request), /no committed result/);
  assert.equal(f.session().phase, before.phase); assert.equal(f.session().currentTurn, before.currentTurn);
  assert.equal(f.rawResults[0].status, 'stale'); assert.equal(f.counts.choices, 1);
});

test('setup transition an unrelated assignment phase or cycle publication is rejected after the real producer reply', async () => {
  for (const change of [{ phase: 'active' }, { phase: 'debrief' }, { currentTurn: 1 }]) {
    const f = await actualSetupTransitionConsumer({ afterReply: ({ session, endpoint }) => {
      if (endpoint === 'assignRole') Object.assign(session, change);
    } });
    await f.direct('confirmSetup', f.setupData());
    await assert.rejects(f.run('assignRole', f.assignData()), /phase|casting|cycle|revision/i);
    assert.equal(f.rawResults.length, 1); assert.equal(f.counts.choices, 1);
  }
});

test('setup transition committed assignment cannot be accepted at the obsolete original lobby snapshot', async () => {
  const f = await actualSetupTransitionConsumer({ afterReply: ({ session }) => { session.phase = 'lobby'; } });
  await f.direct('confirmSetup', f.setupData());
  await assert.rejects(f.run('assignRole', f.assignData()), /phase|casting/i);
  assert.equal(f.rawResults.length, 1); assert.equal(f.counts.choices, 1);
});

test('setup transition a casting/C0 reply with an unrelated setup revision cannot qualify the original request', async () => {
  const f = await actualSetupTransitionConsumer({ afterReply: ({ session }) => { session.setupRevision = 999; } });
  await prepareControlledCasting(f);
  const { roleId: _roleId, ...release } = f.assignData('controlled-release'); await f.direct('releaseRole', release);
  await assert.rejects(f.run('assignRole', f.assignData('controlled-reassign')), /revision/i);
  assert.equal(f.rawResults.length, 1); assert.equal(f.counts.choices, 1);
});

test('setup transition a changed original GM Auth, generation, hydration, instance or claim after a real reply is denied', async () => {
  for (const change of [{ uid: 'foreign-gm' }, { generation: 2 }, { hydrationRevision: 2 },
    { instanceId: 'foreign-bridge' }, { claimedAt: 'foreign-claim' }, { connection: 'offline' }, { freshness: 'cache' }]) {
    const f = await actualSetupTransitionConsumer({ afterReply: ({ local }) => Object.assign(local, change) });
    await assert.rejects(f.run('confirmSetup', f.setupData()));
    assert.equal(f.rawResults.length, 1); assert.equal(f.counts.choices, 1);
  }
});

test('setup transition hydration drift after a committed same-phase setup response is denied by the actual observer', async () => {
  const f = await actualSetupTransitionConsumer({ afterReply: ({ local }) => { local.hydrationRevision++; } });
  await assert.rejects(f.run('confirmSetup', f.setupData()), /hydrat|revision|equal/i);
  assert.equal(f.rawResults[0].status, 'committed'); assert.equal(f.session().phase, 'lobby'); assert.equal(f.session().currentTurn, 0);
});

test('setup transition pre-dispatch phase, cycle and epoch fences survive the actual awaited original GM readiness read', async () => {
  for (const change of [{ phase: 'casting' }, { currentTurn: 1 }, { hydrationRevision: 2 }]) {
    const f = await actualSetupTransitionConsumer({ afterFreshGmRead: ({ session, local, gmReads }) => {
      if (gmReads === 2) {
        if (change.hydrationRevision) local.hydrationRevision = change.hydrationRevision;
        else Object.assign(session, change);
      }
    } });
    await f.direct('confirmSetup', f.setupData());
    const before = f.producer.writes.length;
    await assert.rejects(f.run('assignRole', f.assignData()), /phase|cycle|hydrat|revision|equal/i);
    assert.equal(f.counts.choices, 0, 'No mutation may dispatch after its awaited authority read changed the original tuple.');
    assert.equal(f.producer.writes.length, before);
  }
});

test('setup transition wrong start receipt request, session, cycle or revision is rejected after the real producer commit', async () => {
  for (const change of [{ requestId: 'foreign-start' }, { sessionId: 'foreign-session' }, { currentTurn: 2 }, { setupRevision: 999 }]) {
    const f = await actualSetupTransitionConsumer({ replyChange: (result, endpoint) => endpoint === 'startGame' ? { ...result, ...change } : result });
    await prepareControlledCasting(f);
    await assert.rejects(f.run('startGame', f.startData()), /phase|cycle|revision|request|session/i);
    assert.equal(f.rawResults[0].status, 'committed'); assert.equal(f.session().currentTurn, 1); assert.equal(f.counts.choices, 1);
  }
});

test('setup transition wrong briefing cycle or held timestamp cannot qualify the actual clear producer response', async () => {
  for (const change of [{ cycle: 2 }, { pausedAt: '2026-10-01T00:00:00.000Z' }]) {
    const f = await actualSetupTransitionConsumer({ replyChange: result => ({ ...result, ...change }) });
    await prepareControlledCasting(f); await f.direct('startGame', f.startData());
    await assert.rejects(f.run('clearTurnAdvanceInterstitial', f.clearData()), /cycle|paused|briefing|hold/i);
    assert.equal(f.session().currentTurn, 1); assert.equal(f.session().turnPhase.timerPause, undefined);
    assert.equal(f.counts.choices, 1);
  }
});

test('setup transition proof-only lifecycle observer changes retain the complete original product/build provenance on the actual sourceOnly API', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true,
    alterRead: (path, bytes) => path === resolve(repositoryRoot, 'scripts/pc10-member-gm-lifecycle-ui-proof.mjs')
      ? Buffer.concat([Buffer.from(bytes), Buffer.from('\n// controlled proof-only observer revision\n')]) : undefined });
  assertPreflightInert(fixture);
  assert.equal(fixture.error, undefined, `Explicit proof-only observer input must preserve complete build provenance: ${fixture.error?.message}`);
  assert.equal(fixture.result.buildProvenance.compiledFileCount, 450);
  assert.equal(fixture.result.buildProvenance.frontendFileCount, 277);
  assert.equal(fixture.result.sourceBindings.functionsSourceFiles.length, 542);
  assert.equal(fixture.result.sourceBindings.trackedFiles.length, 2082 + 3);
});

test('sourceOnly accepts only the reviewed O proof driver and its actual-consumer test without changing build provenance', async () => {
  const proofPaths = ['scripts/pc10-candidate-manual-ui-proof.mjs', 'scripts/test-pc10-candidate-proof-helpers.mjs'];
  const altered = new Map(proofPaths.map(path => [resolve(repositoryRoot, path), undefined]));
  const fixture = await actualPreNativeConsumer({ sourceOnly: true,
    alterRead: (path, bytes) => {
      if (!altered.has(path)) return undefined;
      const next = Buffer.concat([Buffer.from(bytes), Buffer.from('\n// controlled reviewed O proof-only revision\n')]);
      altered.set(path, next);
      return next;
    } });
  assertPreflightInert(fixture);
  assert.equal(fixture.error, undefined,
    `The exact reviewed proof-only driver/test pair must reuse the retained build: ${fixture.error?.message}`);
  assert.equal(fixture.result.status, 'P181_SOURCE_ONLY_PREFLIGHT_PASS');
  assert.deepEqual([...altered.values()].map(Boolean), [true, true], 'Both exact proof paths must be hashed by the actual consumer.');
  for (const path of proofPaths) {
    const input = fixture.result.sourceBindings.trackedFiles.find(value => value.path === path);
    assert.ok(input, `Keep the original tracked ${path} input present.`);
    assert.equal(input.sha256, createHash('sha256').update(altered.get(resolve(repositoryRoot, path))).digest('hex'));
  }
  assert.equal(fixture.result.buildProvenance.builtHere, false);
  assert.equal(fixture.result.buildProvenance.compiledFileCount, 450);
  assert.equal(fixture.result.buildProvenance.frontendFileCount, 277);
  assert.equal(fixture.result.sourceBindings.functionsSourceFiles.length, 542);
});

test('sourceOnly still rejects changed App and Functions inputs and an unreviewed tracked script', async () => {
  for (const path of ['src/lib/sessionService.ts', 'functions/src/index.ts']) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true,
      alterRead: (readPath, bytes) => readPath === resolve(repositoryRoot, path)
        ? Buffer.concat([Buffer.from(bytes), Buffer.from('\n// controlled product input mismatch\n')]) : undefined });
    assertPreflightInert(fixture); assert.ok(fixture.error, `Accepted changed protected input ${path}.`);
    assert.equal(fixture.error.code, 'ERR_ASSERTION');
    assert.ok(fixture.error.message.includes(path), `Name the protected input that changed: ${fixture.error.message}`);
    assert.equal(fixture.counters.contract, 0);
  }

  const unreviewed = 'scripts/pc10-unreviewed-source-input.mjs';
  const fixture = await actualPreNativeConsumer({ sourceOnly: true,
    changeCandidateTrackedPaths: paths => [...paths, unreviewed],
    virtualInputs: { [resolve(repositoryRoot, unreviewed)]: 'export const unreviewed = true;\n' } });
  assertPreflightInert(fixture); assert.ok(fixture.error, `Accepted unknown tracked input ${unreviewed}.`);
  assert.equal(fixture.error.code, 'ERR_ASSERTION');
  assert.ok(fixture.error.message.includes(`unexpected tracked input ${unreviewed}`), fixture.error.message);
  assert.equal(fixture.counters.contract, 0);
});

async function actualCompiledFunctionsGuard({ staleIndex = false, staleDependency = false,
  staleSource = false, builtAfterLaunch = false } = {}) {
  const sourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const source = await readFile(sourcePath, 'utf8');
  const start = source.indexOf("  assert.equal(sourceHash(await preflight('Read original compiled Functions entrypoint', () => readFile(resolve(sourceRoot, 'functions/lib/index.js')))),");
  const end = source.indexOf('  const servedSourceFiles = [', start);
  assert.ok(start >= 0 && end > start, 'Read the exact current native compiled Functions guard.');
  const body = source.slice(start, end).trim();
  const root = fileURLToPath(new URL('..', import.meta.url));
  const originalArtifacts = { 'index.js': 'controlled-index-v1',
    'starlightScout.js': 'controlled-scout-v1', 'shuttleTransit.js': 'controlled-transit-v1' };
  const digest = value => createHash('sha256').update(value).digest('hex');
  const compiledFiles = Object.entries(originalArtifacts)
    .map(([path, bytes]) => [path, digest(bytes)]).sort(([a], [b]) => a.localeCompare(b));
  const currentArtifacts = { ...originalArtifacts,
    ...(staleIndex ? { 'index.js': 'controlled-index-v2' } : {}),
    ...(staleDependency ? { 'starlightScout.js': 'controlled-scout-v2' } : {}) };
  const launchRecord = { builtFunctionsSha256: digest(originalArtifacts['index.js']),
    compiledFiles, compiledFileCount: compiledFiles.length,
    compiledTreeSha256: digest(JSON.stringify(compiledFiles)),
    functionsSourceTreeSha256: 'controlled-current-source-tree', functionsBuiltBeforeLaunch: true,
    buildCompletedAtMs: builtAfterLaunch ? 3_000 : 1_000, runtimeStartedAtMs: 2_000 };
  const sourceBindingsBefore = { functionsSourceFiles: [['functions/src/index.ts', digest('controlled-source')],
    ['functions/package-lock.json', digest('controlled-lock')]],
    compiledFiles: Object.entries(currentArtifacts)
    .map(([path, bytes]) => [path, digest(bytes)]).sort(([a], [b]) => a.localeCompare(b)),
    functionsSourceTreeSha256: staleSource ? 'controlled-changed-source-tree' : 'controlled-current-source-tree' };
  sourceBindingsBefore.compiledTreeSha256 = digest(JSON.stringify(sourceBindingsBefore.compiledFiles));
  const readPaths = [];
  const commonStart = source.indexOf('\nfunction p181AssertFunctionsBuildBinding(');
  const commonEnd = source.indexOf('\n\n/**', commonStart + 1);
  const commonGuard = commonStart < 0 ? undefined : runInNewContext(
    `(() => { ${source.slice(commonStart, commonEnd)}; return p181AssertFunctionsBuildBinding; })()`, { assert });
  const guard = runInNewContext(`(async function() { ${body} })`, {
    assert, sourceHash: digest, resolve, sourceRoot: root, launchRecord, sourceBindingsBefore,
    p181AssertFunctionsBuildBinding: commonGuard,
    preflight: async (_label, operation) => operation(),
    readFile: async path => {
      readPaths.push(path);
      const name = path.slice(resolve(root, 'functions/lib').length + 1);
      assert.ok(Object.hasOwn(currentArtifacts, name));
      return Buffer.from(currentArtifacts[name]);
    },
  }, { filename: sourcePath });
  return { guard, readPaths, sourcePath, source, digest };
}

async function actualNativeCleanupConsumer({ foreignMembership = false, providerState = 'ready' } = {}) {
  const sourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const source = await readFile(sourcePath, 'utf8');
  const start = source.indexOf('  const cleanupOwnedResources = async');
  const endMarkers = [
    '\n\n  try {\n    const chromium = options.chromium',
    '\n  try {\n    adminRequire = createRequire(',
  ].map(marker => source.indexOf(marker, start)).filter(value => value >= 0);
  const end = Math.min(...endMarkers);
  assert.ok(start >= 0 && end > start, 'Read the exact current native cleanup consumer body.');
  const body = source.slice(start, end).trim();
  const records = new Map([
    ['sessions/p181-cleanup-session', { joinCode: '345678' }],
    ['joinCodes/345678', { sessionId: 'p181-cleanup-session' }],
    ['sessionCreationRequests/original-gm_create-1', { requestId: 'create-1',
      sessionId: 'p181-cleanup-session', fingerprint: { actorUid: 'original-gm', requestId: 'create-1' } }],
    ['gmAccess/original-gm', { uid: 'original-gm' }],
    ['activeMemberships/original-gm', { sessionId: 'p181-cleanup-session' }],
    ['activeMemberships/original-wing', { sessionId: 'p181-cleanup-session' }],
  ]);
  if (foreignMembership) records.set('activeMemberships/foreign-member', { sessionId: 'p181-cleanup-session' });
  const operations = [];
  const snapshot = path => {
    const value = records.get(path);
    return { exists: value !== undefined, ref: { path }, get: key => key.split('.').reduce((part, k) => part?.[k], value) };
  };
  const ref = path => ({ path, get: async () => snapshot(path) });
  const db = providerState === 'ready' ? ({
    doc: ref,
    runTransaction: async callback => callback({
      get: async value => snapshot(value.path),
      delete: value => { operations.push(`delete:${value.path}`); records.delete(value.path); },
    }),
    recursiveDelete: async value => { operations.push(`delete:${value.path}`); records.delete(value.path); },
    collection(name) {
      if (name === 'sessions') return { get: async () => ({ size: [...records.keys()].filter(path =>
        path.startsWith('sessions/') && !path.slice('sessions/'.length).includes('/')).length }) };
      if (name === 'activeMemberships') return { where(field, operator, value) {
        assert.equal(field, 'sessionId'); assert.equal(operator, '==');
        const selected = [...records.entries()].filter(([, data]) => data.sessionId === value);
        return { get: async () => ({ size: selected.length, docs: selected.map(([path]) => ({
          id: path.slice('activeMemberships/'.length), ref: ref(path), exists: true,
          get: key => snapshot(path).get(key),
        })) }) };
      } };
      throw new Error(`Unexpected controlled collection ${name}`);
    },
    collectionGroup() { return { where() { return { get: async () => ({ size: 0 }) }; } }; },
    terminate: async () => { operations.push('terminate:firestore'); },
  }) : undefined;
  const deletedAuth = [];
  const authAdmin = providerState === 'ready' ? {
    getUser: async uid => ({ metadata: { creationTime: new Date().toISOString() } }),
    deleteUser: async uid => { deletedAuth.push(uid); operations.push(`delete-auth:${uid}`); },
  } : undefined;
  const adminApp = providerState === 'absent' ? undefined : {
    delete: async () => { operations.push('delete:admin-app'); },
  };
  const browsers = [], remoteRequests = [];
  const previousFirestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const previousAuthEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const cleanupOwnedResources = await runInNewContext(`(async () => { ${body}; return cleanupOwnedResources; })()`, {
    assert, Date, process, db, authAdmin, adminApp,
    ownedRequestTracker: undefined, wingAdmissionTracker: undefined, admiralAdmissionTracker: undefined,
    nativeActorCount: 2, factory: undefined, browsers, remoteRequests,
    awaitOriginalIdentityCaptures: async () => {},
    ownedAuthUids: providerState === 'ready' ? new Map([['gm', 'original-gm'], ['wing-commander', 'original-wing']]) : new Map(),
    sessionId: providerState === 'ready' ? 'p181-cleanup-session' : null,
    joinCode: providerState === 'ready' ? '345678' : null,
    creationRequestId: providerState === 'ready' ? 'create-1' : null,
    startRequestId: null, gmInstanceId: null, startAt: Date.now() - 1_000,
    previousFirestoreEmulatorHost, previousAuthEmulatorHost,
    cleanupPromise: undefined, cleanupResult: undefined, cleanupFailures: [],
    rememberProofFailure,
    bounded: async (label, operation, deadlineAt) => {
      assert.ok(deadlineAt > Date.now(), `${label} received the fixed cleanup deadline.`);
      return operation();
    },
    identifier: value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value),
    safeP181Error: error => ({ name: error?.name ?? 'Error', message: error?.message ?? '' }),
    removePc11OwnedRootRecords, recoverPc11CreatedSession,
  });
  return { records, operations, deletedAuth, cleanupOwnedResources,
    async run(firstError = null) {
      return cleanupOwnedResources({ firstError, deadlineAt: Date.now() + 5_000 });
    } };
}

async function actualNativeAdmissionTrackerConsumer() {
  const sourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const source = await readFile(sourcePath, 'utf8');
  const start = source.indexOf('    ownedRequestTracker = createPc11OwnedRequestTracker(gm.page, receipt => {');
  const end = source.indexOf('    creationRequestId = null;', start);
  assert.ok(start >= 0 && end > start, 'Read the exact current native request ownership consumer.');
  const body = source.slice(start, end).trim();
  const page = new EventEmitter();
  const ownedAuthUids = new Map();
  const state = { creationRequestId: null, startRequestId: null, requestTrackerError: null,
    sessionId: 'admission-session', gmInstanceId: 'claimed-gm-instance', authCaptures: [] };
  const gm = { page };
  const registerAuth = async (surface, label) => {
    assert.equal(surface, gm);
    const uid = 'fresh-original-gm-uid';
    const old = ownedAuthUids.get(label);
    if (old) assert.equal(old, uid);
    ownedAuthUids.set(label, uid);
    state.authCaptures.push({ label, uid });
    return { uid, uidHash: createHash('sha256').update(uid).digest('hex').slice(0, 16) };
  };
  const context = {
    gm, createPc11OwnedRequestTracker, ownedAuthUids, registerAuth,
    pendingOriginalIdentities: [], creationRequestId: state.creationRequestId, startRequestId: state.startRequestId,
    requestTrackerError: state.requestTrackerError, sessionId: state.sessionId,
    gmInstanceId: state.gmInstanceId,
  };
  Object.defineProperty(context, 'creationRequestId', { get: () => state.creationRequestId,
    set: value => { state.creationRequestId = value; }, configurable: true });
  const tracker = runInNewContext(`(() => { ${body}; return ownedRequestTracker; })()`, context, { filename: sourcePath });
  const dispatch = (endpoint, data) => page.emit('request', {
    url: () => `http://127.0.0.1:5011/demo-p181-test/us-central1/${endpoint}`,
    method: () => 'POST', postDataJSON: () => ({ data }),
  });
  return { state, ownedAuthUids, pendingOriginalIdentities: context.pendingOriginalIdentities, tracker, dispatch };
}

async function actualNativeAdminProviderAcquire() {
  const sourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const source = await readFile(sourcePath, 'utf8');
  const startMarkers = [
    '  const adminRequire = createRequire(resolve(sourceRoot, \'functions/package.json\'));',
    '  adminRequire = createRequire(resolve(sourceRoot, \'functions/package.json\'));',
  ];
  const start = Math.min(...startMarkers.map(marker => source.indexOf(marker)).filter(value => value >= 0));
  const endMarkers = [
    '  const db = getFirestore(adminApp), authAdmin = getAuth(adminApp);',
    '  db = getFirestore(adminApp); authAdmin = getAuth(adminApp);',
    '    authAdmin = getAuth(adminApp);',
  ];
  const endLine = endMarkers.find(marker => source.indexOf(marker, start) >= 0);
  const end = endLine ? source.indexOf(endLine, start) : -1;
  assert.ok(start >= 0 && end > start, 'Read the exact current native Admin provider acquisition body.');
  const body = source.slice(start, end + endLine.length).trim();
  const cleanupStart = source.indexOf('  const cleanupOwnedResources = async');
  let teardown;
  if (cleanupStart >= 0 && cleanupStart < start) teardown = (await actualNativeCleanupConsumer()).cleanupOwnedResources;
  const beforeFirestore = process.env.FIRESTORE_EMULATOR_HOST;
  const beforeAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const calls = [];
  const db = {}, authAdmin = {}, adminApp = {};
  const adminRequire = name => {
    if (name === 'firebase-admin/app') return {
      getApps: () => [], initializeApp: options => {
        calls.push('initializeApp');
        assert.equal(typeof teardown, 'function',
          'An idempotent owner teardown must already exist before the first Admin app acquisition.');
        assert.equal(options.projectId, 'demo-p181-provider-test');
        return adminApp;
      },
    };
    if (name === 'firebase-admin/firestore') return { getFirestore: value => { assert.equal(value, adminApp); return db; } };
    if (name === 'firebase-admin/auth') return { getAuth: value => { assert.equal(value, adminApp); return authAdmin; } };
    throw new Error(`Unexpected controlled Admin module ${name}`);
  };
  try {
    await runInNewContext(`(async () => { ${body}; return { db, authAdmin, adminApp }; })()`, {
      assert, process, resolve, sourceRoot: repositoryRoot,
      createRequire: () => adminRequire,
      projectId: 'demo-p181-provider-test', ports: { auth: 9109, firestore: 8090 },
    }, { filename: sourcePath });
  } finally {
    if (beforeFirestore === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = beforeFirestore;
    if (beforeAuth === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = beforeAuth;
  }
  return calls;
}

async function actualNativeWingJoinConsumer() {
  const sourcePath = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const source = await readFile(sourcePath, 'utf8');
  const joinStart = source.indexOf('await bounded(`Open original ${memberName} admission page`,');
  const joinEnd = source.indexOf('await bounded(`Accept original ${memberName} consent`,', joinStart);
  assert.ok(joinStart >= 0 && joinEnd > joinStart, 'Read the exact current normal Wing Commander join consumer.');
  const joinBody = source.slice(joinStart, joinEnd).trim();
  const ownedAuthUids = new Map();
  const observations = { authAtRequest: null, authCaptureCalls: 0 };
  const page = new EventEmitter();
  let rejectResponse;
  page.goto = async () => {};
  page.waitForResponse = () => new Promise((resolve, reject) => {
    rejectResponse = reject;
    queueMicrotask(() => reject(new Error('controlled join response stall')));
  });
  page.getByRole = (role, options) => {
    if (role === 'textbox') return { fill: async () => {} };
    assert.equal(role, 'button');
    assert.equal(options.name, 'Join a session');
    return { click: async () => page.emit('request', {
      url: () => 'http://127.0.0.1:5011/demo-p181-test/us-central1/joinSession',
      method: () => 'POST', postDataJSON: () => ({ data: { sessionId: 'admission-session' } }),
    }) };
  };
  const registerAuth = async (surface, label) => {
    observations.authCaptureCalls++;
    const uid = 'fresh-wing-uid';
    ownedAuthUids.set(label, uid);
    return { uid, uidHash: createHash('sha256').update(uid).digest('hex').slice(0, 16) };
  };
  const wingCommander = { page, reducedMotion: async () => {}, consent: async () => {} };
  page.on('request', () => queueMicrotask(() => {
    observations.authAtRequest = ownedAuthUids.has('wing-commander');
  }));
  const run = runInNewContext(`(async () => { ${joinBody}; return true; })()`, {
    assert, Date, Math, P181_NATIVE_TIMING, baseUrl: 'http://127.0.0.1:5173', joinCode: '345678',
    wingCommander, memberSurface: wingCommander, memberRoleId: 'wing-commander', memberName: 'Wing Commander',
    observeUiReceipt, registerAuth, createPc11OwnedRequestTracker,
    wingAdmissionTracker: undefined, admiralAdmissionTracker: undefined,
    bounded: async (_label, operation) => operation(),
    pendingOriginalIdentities: [], requestTrackerError: null,
    awaitOriginalIdentityCaptures: async () => {},
    deadlineAt: Date.now() + 5_000,
  }, { filename: sourcePath });
  return { run, observations, ownedAuthUids, page, rejectResponse };
}

test('exact current native compiled guard accepts a complete matching source/build manifest', async () => {
  await (await actualCompiledFunctionsGuard()).guard();
});

test('exact current native compiled guard rejects a changed index', async () => {
  await assert.rejects((await actualCompiledFunctionsGuard({ staleIndex: true })).guard());
});

test('exact current native guard rejects a changed scout dependency with an unchanged index', async () => {
  await assert.rejects((await actualCompiledFunctionsGuard({ staleDependency: true })).guard(),
    'The full compiled tree must be checked, not only index.js.');
});

test('exact current native guard rejects a mismatch between compiled and source trees', async () => {
  await assert.rejects((await actualCompiledFunctionsGuard({ staleSource: true })).guard(),
    'The complete build must bind to the accepted source tree.');
});

test('exact current native guard rejects a build completed after runtime launch', async () => {
  await assert.rejects((await actualCompiledFunctionsGuard({ builtAfterLaunch: true })).guard(),
    'A boolean built-before field cannot override actual timestamp order.');
});

test('exact native compiled guard stays source-bound during controlled execution', async () => {
  const fixture = await actualCompiledFunctionsGuard();
  await fixture.guard();
  assert.equal(createHash('sha256').update(await readFile(fixture.sourcePath)).digest('hex'),
    createHash('sha256').update(fixture.source).digest('hex'));
});

test('current P181 source binding consumer records complete Functions source and output manifests', async () => {
  const bindings = await captureP181SourceBindings(repositoryRoot);
  assert.ok(Array.isArray(bindings.functionsSourceFiles),
    'Bind every Functions source/build input before native actors.');
  assert.ok(bindings.functionsSourceFiles.some(([path]) => path === 'functions/package-lock.json'));
  assert.ok(Array.isArray(bindings.compiledFiles),
    'Record every current compiled Functions output, including transitive callable dependencies.');
  assert.match(bindings.functionsSourceTreeSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.match(bindings.compiledTreeSha256 ?? '', /^[a-f0-9]{64}$/);
});

test('exact native cleanup keeps create ownership through session deletion after a startup failure', async () => {
  const consumer = await actualNativeCleanupConsumer();
  const startupError = new Error('controlled normal-start observer failure');
  const cleanup = await consumer.run(startupError);
  const sessionDelete = consumer.operations.indexOf('delete:sessions/p181-cleanup-session');
  const creationDelete = consumer.operations.indexOf('delete:sessionCreationRequests/original-gm_create-1');
  assert.ok(sessionDelete >= 0, 'The exact session from the held original create record must be removed.');
  assert.ok(creationDelete > sessionDelete,
    'Keep the validated create ownership proof until its session deletion succeeds.');
  assert.equal(cleanup.status, 'owned-cleanup-complete', JSON.stringify(cleanup.errors));
  assert.equal(cleanup.sessionAbsent, true);
  assert.equal(consumer.records.has('sessionCreationRequests/original-gm_create-1'), false);
  assert.deepEqual(consumer.deletedAuth, ['original-gm', 'original-wing']);
});

test('early native owner cleanup tolerates failure before Firestore provider acquisition', async () => {
  const noProviders = await actualNativeCleanupConsumer({ providerState: 'absent' });
  const noProviderCleanup = await noProviders.run(new Error('controlled Admin import failure'));
  assert.equal(noProviderCleanup.status, 'owned-cleanup-complete', JSON.stringify(noProviderCleanup.errors));
  assert.equal(noProviders.operations.includes('terminate:firestore'), false);
  assert.equal(noProviders.operations.includes('delete:admin-app'), false);

  const appOnly = await actualNativeCleanupConsumer({ providerState: 'app-only' });
  const appOnlyCleanup = await appOnly.run(new Error('controlled Firestore provider failure'));
  assert.equal(appOnlyCleanup.status, 'owned-cleanup-complete', JSON.stringify(appOnlyCleanup.errors));
  assert.equal(appOnly.operations.includes('terminate:firestore'), false);
  assert.equal(appOnly.operations.includes('delete:admin-app'), true);
});

test('exact native cleanup preserves a foreign membership encountered after owned-session deletion', async () => {
  const consumer = await actualNativeCleanupConsumer({ foreignMembership: true });
  const cleanup = await consumer.run(new Error('controlled startup failure'));
  assert.equal(consumer.records.has('activeMemberships/foreign-member'), true,
    'Cleanup must never delete a membership whose Auth UID was not captured at ordinary admission.');
  assert.ok(cleanup.errors.some(value => value.step === 'remove only the two captured original actor memberships'));
});

test('exact native admission tracker captures the original GM Auth UID during the create request', async () => {
  const consumer = await actualNativeAdmissionTrackerConsumer();
  consumer.dispatch('createSession', { requestId: 'create-1' });
  await Promise.all(consumer.pendingOriginalIdentities);
  assert.equal(consumer.state.creationRequestId, 'create-1');
  assert.equal(consumer.ownedAuthUids.get('gm'), 'fresh-original-gm-uid',
    'Register the original Auth identity before create response parsing can fail or stall.');
  assert.deepEqual(consumer.state.authCaptures.map(value => value.label), ['gm']);
  consumer.tracker.finish();
});

test('exact native provider acquisition has an owned teardown registered before Admin initialization', async () => {
  const calls = await actualNativeAdminProviderAcquire();
  assert.deepEqual(calls, ['initializeApp']);
});

test('exact native Wing Commander join retains Auth ownership before a stalled success response', async () => {
  const consumer = await actualNativeWingJoinConsumer();
  await assert.rejects(consumer.run, /controlled join response stall/);
  assert.equal(consumer.observations.authAtRequest, true,
    'A failed or stalled ordinary join response cannot erase the fresh Wing Commander Auth UID from cleanup ownership.');
  assert.equal(consumer.ownedAuthUids.get('wing-commander'), 'fresh-wing-uid');
  consumer.page.removeAllListeners();
});

test('exact current native consumer dispatches the ordinary member first GM claim', async () => {
  const consumer = await actualCaptureActionConsumer();
  await consumer.run();
  assert.equal(consumer.counts.choices, 1);
  assert.equal(consumer.counts.observers, 1);
  assert.equal(consumer.trace.length, 1);
});

test('exact current native consumer still blocks member setup and accepts an already-owned GM', async () => {
  const member = await actualCaptureActionConsumer({ endpoint: 'confirmSetup' });
  await assert.rejects(member.run());
  assert.equal(member.counts.choices, 0);

  const gm = await actualCaptureActionConsumer({ ownedGm: true, endpoint: 'confirmSetup' });
  await gm.run();
  assert.equal(gm.counts.choices, 1);
  assert.equal(gm.counts.observers, 1);
});

test('exact current native consumer refuses privileged work from a foreign current GM actor', async () => {
  const consumer = await actualCaptureActionConsumer({ ownedGm: true, endpoint: 'confirmSetup',
    currentUid: 'foreign-current-uid' });
  await assert.rejects(consumer.run(), /original registered GM|original Auth|GM authority/i);
  assert.equal(consumer.counts.choices, 0);
  assert.equal(consumer.counts.observers, 0);
});

test('exact nested native capture consumer stays source-bound during controlled execution', async () => {
  const path = fileURLToPath(new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
  const bytes = await readFile(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const consumer = await actualCaptureActionConsumer();
  await assert.doesNotReject(consumer.run());
  assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), digest);
});

test('native browser adapter captures one automatic arrival receipt before transit deletion', async () => {
  const now = Date.now();
  const transit = { requestId: 'departure-1', transitRequestId: 'trip-1', status: 'in-transit',
    controlRevision: 4, revision: 2,
    destinationShipId: 'shepherd', departedAt: new Date(now).toISOString(),
    arrivesAt: new Date(now + 60_000).toISOString(), cycle: 1 };
  let flight = { sessionId: 'normal-session', phase: 'active', cycle: 1, airspace: 'lifted',
    activeRoleIds: ['wing-commander'], activeVesselIds: ['aegis'],
    control: { shuttleId: 'starlight', holderUidHash: original.uidHash,
      ownerUidHash: original.uidHash, revision: 4 },
    docking: { shuttleId: 'starlight', shipId: 'aegis' }, departure: null, transit };
  const requestData = { sessionId: 'normal-session', shuttleId: 'starlight', transitRequestId: 'trip-1',
    expectedControlRevision: 4 };
  const responseUrl = 'http://127.0.0.1:5013/demo-local/us-central1/completeShuttleArrival';
  const response = {
    url: () => responseUrl,
    status: () => 200,
    request: () => ({ url: () => responseUrl, method: () => 'POST',
      postDataJSON: () => ({ data: structuredClone(requestData) }) }),
    json: async () => ({ result: { status: 'arrived', sessionId: 'normal-session',
      requestId: 'arrival-trip-1', transitRequestId: 'trip-1', shuttleId: 'starlight',
      hostShipId: 'shepherd', transitRevision: 2,
      arrivedAt: new Date(now + 60_001).toISOString() } }),
  };
  let observerArms = 0, automaticRequests = 0;
  const wing = mountedP181Surface('wing-uid');
  const page = wing.page;
  page.waitForResponse = (predicate, { timeout }) => new Promise((resolve, reject) => {
    observerArms++;
    const deadline = setTimeout(() => reject(new Error('original arrival receipt deadline expired')), timeout);
    const automaticTimer = setTimeout(() => {
      automaticRequests++;
      flight = { ...flight,
        docking: { shuttleId: 'starlight', shipId: 'shepherd' }, transit: null };
      if (predicate(response)) { clearTimeout(deadline); resolve(response); }
      else { clearTimeout(deadline); reject(new Error('automatic arrival request did not match the original trip')); }
    }, 5);
    void automaticTimer;
  });
  const io = createP181StarlightBrowserIo({ gm: mountedP181Surface('original-gm', { gm: true }), wingCommander: wing,
    gameplay: { async select() {} }, directory: '/tmp/p181-controlled-arrival-adapter',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original });
  io.observeMember = async () => structuredClone(original);
  io.observeFlight = async () => structuredClone(flight);

  const arrival = await io.waitForArrivalWindow(transit, 1_000, Date.now() + 1_000, structuredClone(flight));
  assert.equal(observerArms, 1, 'Arm the original automatic SDK receipt observer exactly once.');
  assert.equal(automaticRequests, 1, 'Consume the Starlight timer transition rather than issuing a second arrival command.');
  assert.equal(arrival.capture.endpoint, 'completeShuttleArrival');
  assert.equal(arrival.capture.request.sessionId, 'normal-session');
  assert.equal(arrival.capture.request.transitRequestId, 'trip-1');
  assert.equal(arrival.capture.request.expectedControlRevision, 4);
  assert.equal(arrival.afterFlight.docking.shipId, 'shepherd');
  assert.equal(arrival.afterFlight.transit, null);
  assert.equal(arrival.afterFlight.control.revision, 4);
});

test('actual movement consumer accepts the shared safe member DTO and hash-bound Starlight custody', async () => {
  const { io, state } = makeConsumer();
  const actor = { ...original };
  delete actor.uid;
  state.actor = actor;
  setSafeStarlightCustody(state, 'wing-uid');
  assert.equal(Object.hasOwn(state.actor, 'uid'), false,
    'The shared member observer exports uidHash rather than the private raw Auth UID.');
  assert.equal(Object.hasOwn(state.session.control, 'holderUid'), false,
    'The source projection keeps craft custody identity private and returns its hash.');

  await assert.doesNotReject(runP181StarlightMovementScoutUiProof(completeProofInput(io, actor)),
    'The original hash-matched current Starlight holder must be admitted by the executable consumer.');
});

test('actual movement consumer refuses a departure from a different origin before Begin', async () => {
  const { io, trace } = makeConsumer({ departureOriginOverride: 'icebreaker' });
  await assert.rejects(runP181StarlightMovementScoutUiProof(completeProofInput(io)),
    /original observed Starlight berth/i);
  assert.deepEqual(trace.filter(item => item.endpoint).map(item => item.endpoint), ['requestShuttleDeparture'],
    'A changed departure origin cannot reach the one-shot Begin action.');
});

test('actual movement consumer rejects a stale public transit projection after the canonical retarget receipt', async () => {
  const { io, trace } = makeConsumer({ retargetProjectionRevisionOverride: 1 });
  await assert.rejects(runP181StarlightMovementScoutUiProof(completeProofInput(io)),
    /current public transit projection must match the exact canonical retarget receipt revision/i);
  assert.deepEqual(trace.filter(item => item.endpoint).map(item => item.endpoint), [
    'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
  ], 'A stale current-leg revision cannot proceed to the automatic arrival observation.');
});

test('actual movement consumer rejects a different safe Starlight holder hash before mutation', async () => {
  const { io, trace, state } = makeConsumer();
  const actor = { ...original };
  delete actor.uid;
  state.actor = actor;
  setSafeStarlightCustody(state, 'foreign-uid');

  await assert.rejects(runP181StarlightMovementScoutUiProof(completeProofInput(io, actor)),
    /current Starlight holder hash must bind/i);
  assert.equal(trace.some(item => item.endpoint), false,
    'A foreign safe holder hash cannot authorize a source mutation.');
});

test('actual movement consumer rejects stale or withdrawn member authority tuples', async () => {
  const failures = [];
  const cases = [
    ['pending SDK resume', { sdkResumePending: true }],
    ['withdrawn canonical seat', { currentCanonicalSeatOwned: false }],
    ['withdrawn current berth', { currentMemberBerthMatches: false }],
    ['kicked member', { kicked: true }],
  ];
  for (const [label, change] of cases) {
    const { io, trace, state } = makeConsumer();
    state.actor = { ...original, ...change };
    let failure;
    try { await runP181StarlightMovementScoutUiProof(completeProofInput(io)); }
    catch (error) { failure = error; }
    if (!failure) failures.push(`${label}: executable consumer accepted the invalid tuple`);
    if (trace.some(item => item.endpoint)) failures.push(`${label}: source mutation was issued`);
  }
  assert.deepEqual(failures, [], 'Only current original connected, non-kicked, seated authority can act.');
});

test('controlled shared-receipt IO consumes one original Starlight movement and private scout flow', async () => {
  const { io, trace } = makeConsumer();
  const result = await runP181StarlightMovementScoutUiProof({
    initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: true,
      playerCount: 8, chartId: 'A', fullGameDemo: null, activeRoleIds: originalRoleIds },
    started: { sessionId: 'normal-session', phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
      instanceId: 'gm-original-instance', fullGameDemo: null },
    roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: 'normal-session' }],
    gm: { uidHash: 'b'.repeat(16), sessionId: 'normal-session', meSessionId: 'normal-session',
      instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
      profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
      identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
      kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
      sdkHasServerAuthority: true, gmInstanceOwned: true },
    expectedWingCommander: original,
    io,
    absoluteDeadlineMs: Date.now() + 15 * 60_000,
  });

  assert.deepEqual(trace.filter(item => item.endpoint).map(item => item.endpoint), [
    'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
    'completeShuttleArrival', 'requestScout', 'requestScout',
  ], 'The real UI procedure must consume the full movement transition and only the two actually fuelled same-cycle scan receipts.');
  assert.equal(trace.filter(item => item.endpoint === 'completeShuttleArrival').length, 1,
    'The automatic timer receipt is the one arrival command; no duplicate Complete arrival is issued.');
  assert.equal(trace.filter(item => item.endpoint === 'beginShuttleTransit').length, 1,
    'An uncertain Begin must never be repeated with a new command identity.');
  const retargetRequest = trace.find(item => item.endpoint === 'retargetShuttleTransit')?.request;
  assert.equal(retargetRequest?.destinationShipId, 'shepherd',
    'Retarget keeps the original AEGIS origin excluded even though the public transit has no origin field.');
  const scoutTargets = trace.filter(item => item.endpoint === 'requestScout').map(item => item.request.targetCoordinate);
  assert.deepEqual(scoutTargets, ['1100', '1101'],
    'A second same-cycle scan selects another currently printed coordinate when the normal form retains the first selection.');
  assert.deepEqual(result?.movement?.finalDocking, { shuttleId: 'starlight', shipId: 'shepherd' });
  assert.equal(result?.scouting?.privateReports?.length, 2);
  assert.equal(result?.scouting?.privateReports?.[0]?.requesterUid, undefined,
    'Saved proof rows must redact private raw requester identity.');
  assert.ok(trace.some(item => item.ui === 'reload-and-reselect-wing-commander'),
    'Recovery uses the original role chooser and actor after a normal reload.');
});

test('controlled actor observer stops on lost live berth before a source mutation', async () => {
  const { io, trace, state } = makeConsumer();
  state.actor.activeConsoleRoleId = null;
  await assert.rejects(runP181StarlightMovementScoutUiProof({
    initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: true,
      playerCount: 8, chartId: 'A', fullGameDemo: null, activeRoleIds: originalRoleIds },
    started: { sessionId: 'normal-session', phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
      instanceId: 'gm-original-instance', fullGameDemo: null },
    roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: 'normal-session' }],
    gm: { uidHash: 'b'.repeat(16), sessionId: 'normal-session', meSessionId: 'normal-session',
      instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
      profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
      identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
      kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
      sdkHasServerAuthority: true, gmInstanceOwned: true },
    expectedWingCommander: original, io, absoluteDeadlineMs: Date.now() + 15 * 60_000,
  }), /current.*Wing Commander|berth|authority/i);
  assert.equal(trace.some(item => item.endpoint), false, 'A missing current console/station must not trigger a request.');
});

test('fresh Cycle 0 consumer runs normal setup, assignment, start and briefing clear before movement', async () => {
  const { io, trace, receipt } = makeConsumer();
  const freshInitial = { sessionId: 'normal-session', phase: 'lobby', cycle: 0,
    setupConfirmed: false, playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null };
  io.prepareNormalSession = async ({ initial }) => {
    assert.equal(initial.phase, 'lobby');
    assert.equal(initial.cycle, 0);
    const setupReceipt = await receipt('confirmSetup',
      { sessionId: initial.sessionId, playerCount: 8, chartId: 'A' }, { status: 'committed', setupRevision: 1 });
    const assignmentReceipt = await receipt('assignRole',
      { sessionId: initial.sessionId, roleId: 'wing-commander' }, { status: 'assigned', roleId: 'wing-commander' });
    const startReceipt = await receipt('startGame',
      { sessionId: initial.sessionId, requestId: 'start-original', instanceId: 'gm-original-instance' },
      { status: 'committed', phase: 'active', cycle: 1, instanceId: 'gm-original-instance' });
    const briefingReceipt = await receipt('clearTurnAdvanceInterstitial',
      { sessionId: initial.sessionId, requestId: 'clear-original' }, { status: 'cleared', cycle: 1 });
    return {
      initial: { ...initial, setupConfirmed: true, playerCount: 8, chartId: 'A', activeRoleIds: originalRoleIds },
      started: { sessionId: initial.sessionId, phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
        instanceId: 'gm-original-instance', fullGameDemo: null },
      roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: initial.sessionId }],
      gm: { uidHash: 'b'.repeat(16), sessionId: initial.sessionId, meSessionId: initial.sessionId,
        instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
        profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
        identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
        kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
        sdkHasServerAuthority: true, gmInstanceOwned: true },
      expectedWingCommander: original,
      setupReceipt, assignmentReceipt, startReceipt, briefingReceipt,
    };
  };

  let failure;
  try {
    await runP181StarlightMovementScoutUiProof({ initial: freshInitial, started: undefined, roster: undefined, gm: undefined,
      expectedWingCommander: undefined, io, absoluteDeadlineMs: Date.now() + 15 * 60_000 });
  } catch (error) { failure = error; }
  assert.deepEqual(trace.filter(item => ['confirmSetup', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial']
    .includes(item.endpoint)).map(item => item.endpoint),
  ['confirmSetup', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial'],
  `The executable normal-start transition must run from fresh Cycle 0 before readiness is required; early stop: ${failure?.message ?? 'none'}`);
});

test('first normal-start failure triggers one bounded owned cleanup and remains the surfaced error', async () => {
  const { io } = makeConsumer();
  const firstFailure = new Error('first original Cycle 0 start failure');
  let cleanupCalls = 0, cleanupInput;
  io.prepareNormalSession = async () => { throw firstFailure; };
  io.cleanupOwnedResources = async value => {
    cleanupCalls++;
    cleanupInput = value;
    return { status: 'owned-cleanup-complete' };
  };
  let surfaced;
  try {
    await runP181StarlightMovementScoutUiProof({
      initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: false,
        playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null },
      started: undefined, roster: undefined, gm: undefined, expectedWingCommander: undefined,
      io, absoluteDeadlineMs: Date.now() + 15 * 60_000,
    });
  } catch (error) { surfaced = error; }
  assert.equal(cleanupCalls, 1, 'Cleanup runs once after an original startup failure.');
  assert.equal(cleanupInput.firstError, firstFailure);
  assert.equal(surfaced, firstFailure, 'Cleanup does not replace the original failure.');
});

test('fresh Cycle 0 native consumer uses the normal browser factory before requiring a live station', async () => {
  const trace = [];
  const freshInitial = { sessionId: 'fresh-normal-session', phase: 'lobby', cycle: 0,
    setupConfirmed: false, playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null };
  const normalStart = {
    async prepare({ initial }) {
      assert.equal(initial.sessionId, freshInitial.sessionId);
      trace.push('gm-create-session');
      trace.push('gm-normal-auth-and-consent');
      trace.push('gm-live-local-authorization-and-claim');
      trace.push('confirmSetup');
      trace.push('wing-commander-normal-join-and-consent');
      trace.push('assignRole');
      trace.push('normal-role-chooser');
      trace.push('startGame');
      trace.push('clearTurnAdvanceInterstitial');
      throw new Error('controlled first mismatch after original normal setup/start receipts');
    },
  };
  const io = createP181StarlightBrowserIo({ gm: { page: {} }, wingCommander: { page: {} },
    gameplay: { async select(roleId) { trace.push(`chooser:${roleId}`); } }, directory: '/tmp/p181-controlled-normal-driver',
    initial: freshInitial, started: undefined, expectedWingCommander: undefined, normalStart });
  io.cleanupOwnedResources = async () => ({ status: 'controlled-owned-cleanup-complete' });

  let firstFailure;
  try {
    await runP181StarlightMovementScoutUiProof({ initial: freshInitial, started: undefined,
      roster: undefined, gm: undefined, expectedWingCommander: undefined, io,
      absoluteDeadlineMs: Date.now() + 15 * 60_000 });
  } catch (error) { firstFailure = error; }

  assert.deepEqual(trace, [
    'gm-create-session', 'gm-normal-auth-and-consent', 'gm-live-local-authorization-and-claim',
    'confirmSetup', 'wing-commander-normal-join-and-consent', 'assignRole', 'normal-role-chooser',
    'startGame', 'clearTurnAdvanceInterstitial',
  ], `The executable consumer must cross ordinary admission and original ownership before movement; stopped at: ${firstFailure?.message ?? 'none'}`);
  assert.match(firstFailure?.message ?? '', /controlled first mismatch/,
    'A failure after the real source startup sequence remains the first error.');
});

test('controlled native factory owns exactly two processes and closes both after first startup error', async () => {
  const browsers = [], surfaces = [], routeHandlers = [];
  const chromium = {
    async launch(options) {
      assert.deepEqual(options, { channel: 'chrome', headless: true });
      const browser = {
        connected: true,
        isConnected() { return this.connected; },
        async close() { this.connected = false; },
        async newContext() {
          return {
            async route(pattern, handler) { routeHandlers.push({ pattern, handler }); },
            async newPage() {
              const page = new EventEmitter();
              page.url = () => 'http://127.0.0.1:5174/';
              page.setDefaultTimeout = () => {};
              page.setDefaultNavigationTimeout = () => {};
              return page;
            },
          };
        },
      };
      return browser;
    },
  };
  const remoteRequests = [], pageErrors = [], calls = [], requests = [];
  const factory = createP181StarlightNativeSurfaceFactory({ chromium, baseUrl: 'http://127.0.0.1:5174',
    ports: { auth: 9109, firestore: 8090, functions: 5011 }, directory: '/tmp/p181-controlled-factory',
    browsers, surfaces, remoteRequests, pageErrors, calls, requests });
  const gm = await factory.launch('normal-gm');
  const wing = await factory.launch('normal-wing-commander');
  assert.equal(gm.browser, browsers[0]);
  assert.equal(wing.browser, browsers[1]);
  assert.equal(surfaces.length, 2);
  assert.equal(routeHandlers.length, 2);
  await assert.rejects(factory.launch('normal-wing-commander'), /exactly one browser process per ordinary Auth actor/);
  let continued = 0, aborted = 0;
  await routeHandlers[0].handler({ request: () => ({ url: () => 'https://remote.example/data' }),
    async continue() { continued++; }, async abort() { aborted++; } });
  await routeHandlers[0].handler({ request: () => ({ url: () => 'http://127.0.0.1:5011/demo-local/us-central1/joinSession' }),
    async continue() { continued++; }, async abort() { aborted++; } });
  assert.deepEqual({ continued, aborted }, { continued: 1, aborted: 1 },
    'The controlled provider keeps the browser local-only and the original SDK port allowlisted.');

  const firstError = new Error('first original controlled setup/authority failure');
  let cleanupCalls = 0;
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { async select() { throw new Error('No role selection after startup failure.'); } },
    directory: '/tmp/p181-controlled-factory',
    initial: { sessionId: 'fresh-native', phase: 'lobby', cycle: 0, setupConfirmed: false,
      playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null },
    started: undefined, expectedWingCommander: undefined,
    normalStart: { async prepare() { throw firstError; } },
    async cleanupOwnedResources({ firstError: surfaced }) {
      cleanupCalls++;
      assert.equal(surfaced, firstError);
      await Promise.all(browsers.map(browser => browser.close()));
      return { status: 'owned-cleanup-complete' };
    },
  });
  let surfaced;
  try {
    await runP181StarlightMovementScoutUiProof({
      initial: { sessionId: 'fresh-native', phase: 'lobby', cycle: 0, setupConfirmed: false,
        playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null },
      started: undefined, roster: undefined, gm: undefined, expectedWingCommander: undefined,
      io, absoluteDeadlineMs: Date.now() + 15 * 60_000,
    });
  } catch (error) { surfaced = error; }
  assert.equal(surfaced, firstError);
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(browsers.map(browser => browser.isConnected()), [false, false]);
});

test('native source boundary resolves every normal-start, custody, transit and scout implementation file', async () => {
  const { sourceFiles } = await captureP181SourceBindings(process.cwd());
  assert.ok(Object.keys(sourceFiles).length >= 35);
  for (const [path, digest] of Object.entries(sourceFiles)) {
    assert.match(digest, /^[a-f0-9]{64}$/, `The exact ${path} source file is bound before native execution.`);
  }
});

test('original actor consumer accepts reload only after the shared normal-resume receipt accepts its new epoch', async () => {
  const { io, trace, state } = makeConsumer();
  io.reloadAndReselectWingCommander = async () => {
    trace.push({ ui: 'original-normal-resumeSession-response-and-accepted-hydration' });
    state.actor.documentTimeOrigin = 1_000;
    const before = structuredClone(state.actor);
    state.actor = { ...state.actor, connectionGeneration: before.connectionGeneration + 1,
      identityHydrationRevision: before.identityHydrationRevision + 1, documentTimeOrigin: 2_000 };
    const resumeEvidence = { status: 'accepted', source: 'normal-resumeSession',
      uidHash: state.actor.uidHash, sessionId: state.actor.sessionId,
      connectionGeneration: state.actor.connectionGeneration,
      identityHydrationRevision: state.actor.identityHydrationRevision, sdkHasServerAuthority: true,
      documentTimeOrigin: state.actor.documentTimeOrigin, sdkResumePending: false };
    assert.equal(pc11SameActorEpoch(before, state.actor, resumeEvidence), true,
      'The shared helper accepts only this same-actor server resume tuple.');
    return { actor: structuredClone(state.actor), flight: structuredClone(state.session), resumeEvidence };
  };

  const result = await runP181StarlightMovementScoutUiProof({
    initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: true,
      playerCount: 8, chartId: 'A', fullGameDemo: null, activeRoleIds: originalRoleIds },
    started: { sessionId: 'normal-session', phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
      instanceId: 'gm-original-instance', fullGameDemo: null },
    roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: 'normal-session' }],
    gm: { uidHash: 'b'.repeat(16), sessionId: 'normal-session', meSessionId: 'normal-session',
      instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
      profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
      identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
      kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
      sdkHasServerAuthority: true, gmInstanceOwned: true },
    expectedWingCommander: { ...original, documentTimeOrigin: 1_000 }, io,
    absoluteDeadlineMs: Date.now() + 15 * 60_000,
  });

  assert.equal(result.movement.status, 'observed');
  assert.equal(io.expectedWingCommander.connectionGeneration, original.connectionGeneration + 1);
  assert.equal(io.expectedWingCommander.identityHydrationRevision, original.identityHydrationRevision + 1);
  assert.equal(trace.filter(item => item.endpoint === 'beginShuttleTransit').length, 1);
});

test('F6 admits within the original full grant after startup consumed one minute', () => {
  const issuedAt = 1_000_000;
  const actual = actualP181TimingConsumer({ now: issuedAt + 60_000, issuedAt,
    end: issuedAt + P181_NATIVE_TIMING.totalAllocationMs });
  assert.equal(actual.startAt, issuedAt);
});

test('F6 anchors browser launch cutoff to the parent issued grant', () => {
  const issuedAt = 1_000_000, now = issuedAt + 60_000;
  const actual = actualP181TimingConsumer({ now, issuedAt,
    end: now + P181_NATIVE_TIMING.totalAllocationMs });
  assert.equal(actual.browserLaunchDeadlineAt, issuedAt + P181_NATIVE_TIMING.latestBrowserLaunchMs);
});

test('F6 rejects an actual bounded operation that completes after its deadline before timer delivery', async () => {
  const consumer = actualP181BoundedConsumer({ completesAt: 101 });
  await assert.rejects(consumer.execute(), /deadline|expired|late/i);
  assert.equal(consumer.timers.size, 0);
});

test('F6 rejects a late actual full actor ready tuple', async () => {
  await assert.rejects(actualP181ReadinessConsumer('full', true).execute(), /deadline|expired|late|readiness/i);
});

test('F6 rejects actual GM readiness when the recovery read crosses the deadline', async () => {
  await assert.rejects(actualP181ReadinessConsumer('gm', true).execute(), /deadline|expired|late|ready/i);
});

test('actual Wing Commander station wait exposes its active semantic awaited operation', async () => {
  const consumer = actualP181StationWaitDiagnosticConsumer();
  const reached = await consumer.reachedWait;
  assert.equal(reached, 'Original Wing Commander normal role chooser/seat claim');
  assert.equal(consumer.diagnostic.activeAwaitedOperation,
    'Original Wing Commander normal role chooser/seat claim',
  'The exact source wait must name the station/seat readiness operation while it is pending.');
});

test('actual native first-failure retention saves the bounded private readiness screenshot and original timeout', async () => {
  const consumer = actualP181FirstFailureRetentionConsumer();
  const artifact = await consumer.execute();
  assert.equal(consumer.retained.length, 1);
  assert.equal(consumer.retained[0].error, consumer.error,
    'Capturing diagnostics must preserve the original finite prepare timeout object.');
  assert.equal(consumer.screenshots.length, 1,
    'Capture the first-failure screenshot before owned browser teardown.');
  assert.equal(consumer.retained[0].detail.normalPreparationDiagnostic.activeAwaitedOperation,
    'Original Wing Commander normal role chooser/seat claim');
  assert.equal(consumer.writes.length, 1);
  assert.equal(consumer.writes[0].options.mode, 0o600);
  assert.equal(consumer.writes[0].options.flag, 'wx');
  assert.deepEqual(consumer.writes[0].body, consumer.screenshotBytes);
  const diagnostic = consumer.retained[0].detail.normalPreparationDiagnostic;
  assert.equal(diagnostic.activeAtFailure, true);
  assert.equal(diagnostic.publicUiCapture.sha256,
    createHash('sha256').update(consumer.screenshotBytes).digest('hex'));
  assert.equal(diagnostic.publicUiCapture.label, 'privacy-redacted current-page diagnostic');
  assert.equal(diagnostic.publicUiCapture.actorRole, 'wing-commander');
  assert.equal(diagnostic.publicUiCapture.renderedOrUsabilityAcceptance, false);
  assert.match(diagnostic.publicUiCapture.omissions, /inputs.*private/);
  assert.deepEqual(diagnostic.pendingReadiness, consumer.diagnostic.pendingReadiness);
  assert.equal(diagnostic.steps[0].startedAtMs, 900); assert.equal(diagnostic.steps[0].completedAtMs, null);
  assert.equal(JSON.stringify(diagnostic).includes('controlled private input value'), false);
  assert.equal(artifact.evidenceWriteFailed, false);
  assert.ok(consumer.bounds.every(value => value.deadlineAt <= 5_000));
});

test('actual native first-failure retention records screenshot errors without replacing the original timeout', async () => {
  const consumer = actualP181FirstFailureRetentionConsumer({ screenshotFails: true });
  await consumer.execute();
  assert.equal(consumer.retained.length, 1);
  assert.equal(consumer.retained[0].error, consumer.error);
  const diagnostic = consumer.retained[0].detail.normalPreparationDiagnostic ?? {};
  assert.equal(consumer.screenshots.length, 1);
  assert.equal(diagnostic.publicUiCapture.status, 'failed-closed');
  assert.equal(diagnostic.publicUiCapture.rawPageFallback, false);
  assert.equal(diagnostic.publicUiCapture.primaryErrorPreserved, true);
  assert.equal(diagnostic.publicUiCapture.error.name, 'Error');
  assert.match(diagnostic.publicUiCapture.error.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(diagnostic).includes('controlled screenshot capture failure'), false);
  assert.equal(JSON.stringify(diagnostic).includes('controlled private input value'), false);
  assert.equal(consumer.writes.length, 0);
});

test('F6 preserves the original cleanup deadline after it expires', async () => {
  const received = [];
  const cleanup = runInNewContext(`async () => { ${p181CleanupDeadlineBody}; return cleanupResult; }`, {
    Date: { now: () => 101 }, cleanupPromise: undefined, cleanupDeadlineAt: 100,
    totalEnd: 200, privateFailureArtifact: null, retainFirstFailure: async () => undefined,
    cleanupResult: undefined, cleanupFailures: [], firstError: undefined,
    safeP181Error: error => ({ name: error.name }), rememberProofFailure,
    cleanupOwnedResources: async options => { received.push(options.deadlineAt); return { status: 'owned-cleanup-complete' }; },
  });
  await cleanup();
  assert.deepEqual(received, [100]);
});

test('F6 positive controls retain timely bounded operations and real readiness tuples', async () => {
  const bounded = actualP181BoundedConsumer();
  assert.equal(await bounded.execute(), 'actual-result');
  assert.equal(bounded.timers.size, 0);
  const full = actualP181ReadinessConsumer('full', false);
  const gm = actualP181ReadinessConsumer('gm', false);
  assert.equal(await full.execute(), full.member);
  assert.equal((await gm.execute()).instanceId, gm.member.instanceId);
});

test('F6 exact consumer source bytes remain stable through controlled probes', async () => {
  assert.equal(p181DeadlineDigest(await readFile(p181DeadlineSourcePath, 'utf8')),
    p181DeadlineDigest(p181DeadlineSource));
});


test('actual post-core remote request failure remains authoritative in final status', async () => {
  const result = await actualP181FinalizationConsumer({ remote: true }).execute();
  assert.ok(result.thrown);
  assert.equal(result.final.status, 'P181_STOPPED_FIRST_FAILURE');
  assert.equal(result.final.actualAcceptance, false);
  assert.equal(result.final.fixedCatalogClosures, 0);
});

test('actual post-core mounted page error remains authoritative in final status', async () => {
  const result = await actualP181FinalizationConsumer({ pageError: true }).execute();
  assert.ok(result.thrown);
  assert.equal(result.final.status, 'P181_STOPPED_FIRST_FAILURE');
});

test('actual post-core changed-source failure remains authoritative in final status', async () => {
  const result = await actualP181FinalizationConsumer({ changedSource: true }).execute();
  assert.ok(result.thrown);
  assert.equal(result.final.status, 'P181_STOPPED_FIRST_FAILURE');
});

test('actual public error consumer omits private UID and note canaries', async () => {
  const uidCanary = 'SYNTHETIC_PRIVATE_UID_CANARY', noteCanary = 'SYNTHETIC_PRIVATE_SCOUT_NOTE_CANARY';
  const primary = new Error(`Held observation uid=${uidCanary}; private note=${noteCanary}`);
  const result = await actualP181FinalizationConsumer({ primary }).execute();
  assert.equal(result.thrown, primary);
  assert.equal(result.output.text.includes(uidCanary), false);
  assert.equal(result.output.text.includes(noteCanary), false);
});

test('actual native failure consumer privately retains full primary and already-held observations', async () => {
  const uidCanary = 'SYNTHETIC_PRIVATE_UID_CANARY', noteCanary = 'SYNTHETIC_PRIVATE_SCOUT_NOTE_CANARY';
  const primary = new Error(`private note=${noteCanary}`);
  primary.actual = { uid: uidCanary };
  primary.expected = { note: noteCanary };
  rememberProofFailure(primary, { originalHeldUid: uidCanary });
  const consumer = actualP181FinalizationConsumer({ primary, cleanupFails: true });
  const result = await consumer.execute();
  assert.equal(result.thrown, primary, 'Cleanup must not replace the original exception.');
  const retained = consumer.privateRecords.find(item => item.error === primary);
  assert.ok(retained, 'The actual native failure consumer must retain a private original-failure artifact.');
  assert.equal(retained.full.stack, primary.stack);
  assert.ok(retained.full.actualInspect.includes(uidCanary));
  assert.ok(retained.full.expectedInspect.includes(noteCanary));
  assert.ok(retained.full.heldObservationsInspect.includes(uidCanary));
  assert.equal(retained.detail.cleanup.status, 'failed',
    'Keep the already observed cleanup failure boundary with the original private error artifact.');
});

test('successful actual finalization keeps zero acceptance and exclusive private output flags', async () => {
  const result = await actualP181FinalizationConsumer().execute();
  assert.equal(result.thrown, undefined);
  assert.equal(result.final.actualAcceptance, false);
  assert.equal(result.final.fixedCatalogClosures, 0);
  assert.equal(result.output.options.mode, 0o600);
  assert.equal(result.output.options.flag, 'wx');
});

test('actual finalization and public error consumers stay source-bound during the probe', async () => {
  const current = await readFile(p181FinalizationSourcePath, 'utf8');
  assert.equal(p181FinalizationDigest(current), p181FinalizationDigest(p181FinalizationSource));
});

// Remaining review regressions execute the complete public consumers. The
// native module has only its imports supplied by controlled dependencies; its
// complete startup, action and cleanup bodies run without a browser/provider.
// The shared safe member/lifecycle producers execute their actual page callback
// over an in-memory mounted store. No synthetic claimedAt alias is supplied.
function mountedP181Surface(uid, { gm = false, casting = false } = {}) {
  const session = { id: 'normal-session', phase: casting ? 'lobby' : 'active', currentTurn: casting ? 0 : 1,
    setupConfirmed: !casting, setupRevision: 0, playerCount: 8, chartId: 'A', activeRoleIds: [...originalRoleIds],
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd'], fullGameDemo: null,
    turnPhase: { airspace: { state: 'lifted' } }, shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis' }],
    shuttleControl: { starlight: { shuttleId: 'starlight', holderUid: 'wing-uid', ownerUid: 'wing-uid', revision: 4 } },
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: ['starlight'] }, joinCode: '345678' };
  const me = { uid, sessionId: session.id, role: gm ? 'gm' : 'player', displayName: uid,
    connectionGeneration: 2, connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: casting || gm ? null : 'wing-commander', activeConsoleRoleId: casting || gm ? null : 'wing-commander',
    seatId: casting || gm ? null : 'wing-commander' };
  session.currentActorBerthAuthority = { sessionId: session.id, actorUid: uid, groupId: 'fleet-1', role: 'player',
    connectionGeneration: 2, assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
    replacementRoleId: null, replacementStatus: null, shipId: 'aegis' };
  const state = { session, me, connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 3,
    gmInstance: gm ? { id: 'gm-original-instance', uid, sessionId: session.id,
      claimedAt: '2026-10-08T00:00:00.000Z' } : null,
    gmAccessAuthenticatedAt: gm ? 1 : null, gmRecoveryPending: false, sdkHasServerAuthority: true,
    sdkResumePending: false, seats: [{ id: 'wing-commander', roleId: 'wing-commander', status: 'claimed', holderUid: uid }],
    shuttleDepartures: {}, pendingCommands: [], gmAwayMissionHandPointers: [], gmLoyaltyCensusStatus: 'loading' };
  const page = new EventEmitter();
  let route = gm ? '#/gm' : '#/roles/wing-commander', pending;
  const choices = [], observedBodies = [], waits = [];
  const storeListeners = new Set(), movementListeners = new Set(), authListeners = new Set();
  const surface = { page, state, uid, choices, observedBodies, waits, window: { navigator: { onLine: true } },
    storeModuleUrl: () => 'http://127.0.0.1:5173/src/store/useSessionStore.ts',
    sessionAuthorityModuleUrl: () => 'http://127.0.0.1:5173/src/lib/sessionSnapshotAuthority.ts',
    callable: async () => ({ status: 'committed', result: [] }),
    reducedMotion: async () => {}, consent: async () => {} };
  surface.publish = change => {
    const previous = structuredClone(state);
    if (typeof change === 'function') change(state); else Object.assign(state, change);
    for (const listener of [...storeListeners]) listener(state, previous);
  };
  surface.publishMovement = (movement, { fromCache = false } = {}) => {
    surface.movement = movement;
    if (!fromCache) for (const listener of [...movementListeners]) listener(movement);
  };
  surface.publishAuth = user => {
    surface.uid = user?.uid ?? null;
    for (const next of [...authListeners]) next(user);
  };
  surface.observers = { stores: storeListeners, movements: movementListeners, auth: authListeners,
    attachments: 0, detachments: 0, storeAttachments: 0, storeDetachments: 0 };
  const modules = path => {
    if (path === '/src/lib/firebase.ts') return { auth: () => ({
      get currentUser() { return surface.uid ? { uid: surface.uid } : null; },
      onAuthStateChanged: next => { authListeners.add(next); return () => authListeners.delete(next); },
      authStateReady: async () => { surface.authReadinessCalls = (surface.authReadinessCalls ?? 0) + 1; await surface.authReady; },
    }) };
    if (path === '/src/lib/demoActorContext.ts') return { get activeDemoActorProfile() {
      return surface.activeDemoActorProfile ?? null;
    } };
    if (path.includes('useSessionStore')) return { useSessionStore: { getState: () => state,
      subscribe: listener => { surface.observers.storeAttachments++; storeListeners.add(listener);
        return () => { if (storeListeners.delete(listener)) surface.observers.storeDetachments++; }; } } };
    if (path.includes('sessionSnapshotAuthority')) return surface.authorityRuntime ?? {
      sessionSnapshotAuthorityFor: () => ({ hasServerSessionAuthority: state.sdkHasServerAuthority }),
      memberSessionResumeBlocksFreshness: () => state.sdkResumePending };
    if (path === '/src/lib/firestore.ts') return { subscribeShuttleDeparture: (_sessionId, _shuttleId, next) => {
      surface.observers.attachments++; movementListeners.add(next); next(null);
      queueMicrotask(() => { if (movementListeners.has(next)) {
        surface.onProtectedAttach?.(); next(surface.movement ?? null);
      } });
      return () => { surface.observers.detachments++; movementListeners.delete(next); };
    } };
    if (path === '/src/lib/scoutResultService.ts' && surface.scoutRuntime) return surface.scoutRuntime;
    if (path === '/src/lib/scoutResultService.ts') return Object.fromEntries([
      'listMyScoutReports', 'readPrivateScoutResult', 'readMyScoutDiscoveryNote', 'listPendingScoutRequests',
    ].map(name => [name, async value => {
      const payload = { sessionId: state.session.id,
        ...(name === 'readPrivateScoutResult' ? { requestId: value } : {}),
        ...(name === 'readMyScoutDiscoveryNote' ? { noteId: value } : {}),
        ...(name === 'listPendingScoutRequests' ? { instanceId: state.gmInstance.id } : {}) };
      return (await surface.callable(name, payload)).result;
    }]));
    if (surface.bayRuntimeModules && Object.hasOwn(surface.bayRuntimeModules, path)) return surface.bayRuntimeModules[path];
    throw new Error(`Unexpected controlled mounted module ${path}`);
  };
  page.evaluate = async (callback, args) => {
    const executable = String(callback).replace(/\bimport\s*\(/g, '__load(');
    const result = await runInNewContext(`(${executable})(__args)`, { __args: args,
      __load: async path => { await surface.beforeModule?.(path); return modules(path); },
      crypto: { subtle: { digest: async (...values) => {
        const digest = await webcrypto.subtle.digest(...values); await surface.onDigest?.(String(callback)); return digest;
      } } }, TextEncoder, performance: { timeOrigin: surface.documentTimeOrigin ?? 1000 },
      Date, URL, setTimeout, clearTimeout, window: surface.window,
      document: surface.document ?? { querySelector: () => null, querySelectorAll: () => [] } });
    return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
  };
  page.url = () => `http://127.0.0.1:5173/${route}`;
  page.goto = async () => { route = '#/'; };
  page.reload = async () => {};
  page.waitForResponse = (predicate, options) => {
    waits.push(options);
    return new Promise((resolveResponse, reject) => { pending = { predicate, resolveResponse, reject }; });
  };
  surface.deliver = (endpoint, data, result, { status = 200, error, bodyWait } = {}) => {
    const request = { url: () => `http://127.0.0.1:5011/demo-controlled/us-central1/${endpoint}`,
      method: () => 'POST', postDataJSON: () => ({ data }), isNavigationRequest: () => false };
    const response = { url: request.url, request: () => request, status: () => status,
      json: async () => { observedBodies.push({ endpoint, data, result, error });
        if (bodyWait) await (typeof bodyWait === 'function' ? bodyWait() : bodyWait);
        return error ? { error } : { result }; } };
    page.emit('request', request); page.emit('response', response);
    if (pending?.predicate(response)) { const current = pending; pending = null; current.resolveResponse(response); }
    return response;
  };
  const locator = name => ({
    getByRole: (_role, options) => locator(options?.name), getByLabel: label => locator(label),
    locator: () => locator(name), first() { return this; },
    waitFor: async () => {}, count: async () => 1, all: async () => [],
    check: async () => { await surface.onCheck?.(String(name)); },
    scrollIntoViewIfNeeded: async () => {},
    isVisible: async () => name !== 'Retry arrival', isEnabled: async () => true,
    fill: async value => { surface.input = value; }, selectOption: async value => {
      surface.input = value; await surface.onSelection?.(String(name), value);
    },
    inputValue: async () => surface.input ?? 'icebreaker', evaluateAll: async () => ['icebreaker', 'shepherd'],
    click: async () => { choices.push(String(name)); await surface.onChoice?.(String(name)); },
  });
  page.getByRole = (_role, options) => locator(options?.name);
  page.getByLabel = name => locator(name); page.locator = name => locator(name);
  surface.setRoute = value => { route = value; };
  return surface;
}

async function actualP181CastingAssignmentFixture(t, { assignmentTarget, assignmentRole, deferMemberTransition = false,
  resumeGeneration = 3, resumeHydration = 4, resumeStatus = 200, resumeSessionId = 'normal-session',
  resumeUid = 'wing-uid', resumeAssignedRoleId = 'wing-commander', deliverResume = true,
  resumeBodyWait, observerDeadlineMs = 4_000, resumeBerthGap = false,
  memberRoleId = 'wing-commander', proofProfile = 'starlight', omitInitialMemberBerth = false,
  documentTimeOrigin = 1000 } = {}) {
  const wing = mountedP181Surface('wing-uid', { casting: true });
  wing.documentTimeOrigin = documentTimeOrigin;
  wing.state.session.phase = 'lobby'; wing.state.session.setupConfirmed = true; wing.state.session.setupRevision = 1;
  wing.state.me.assignedRoleId = null; wing.state.me.activeConsoleRoleId = null; wing.state.me.seatId = null;
  wing.state.seats = [{ id: memberRoleId, roleId: memberRoleId, status: 'available', holderUid: null }];
  wing.state.session.currentActorBerthAuthority = { ...wing.state.session.currentActorBerthAuthority,
    assignedRoleId: null, activeConsoleRoleId: null };
  if (omitInitialMemberBerth) delete wing.state.session.currentActorBerthAuthority;
  const before = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  const gm = mountedP181Surface('original-gm', { gm: true, casting: true });
  gm.state.session.phase = 'lobby'; gm.state.session.setupConfirmed = true; gm.state.session.setupRevision = 1;
  const gmBefore = await observeLifecycleActor(gm, 'normal-session');
  const directory = await mkdtemp('/tmp/p181-casting-assignment-resume-');
  const observer = createMemberNavigationResumeObserver(wing.page, { directory, roleId: memberRoleId, proofProfile,
    deadlineAt: Date.now() + observerDeadlineMs, memberContract: 'pc11-live-base', transition: 'casting-assignment',
    expectedGmUidHash: createHash('sha256').update(gm.uid).digest('hex').slice(0, 16),
    expectedGmInstanceId: gm.state.gmInstance.id,
    onCastingResumeRequest: resume => wing.onCastingResumeRequest?.(resume) });
  await observer.prepare(before);
  t.after(async () => { await observer.finish().catch(() => {}); });

  const data = { sessionId: 'normal-session', instanceId: gm.state.gmInstance.id,
    requestId: 'assign-original', expectedSetupRevision: gm.state.session.setupRevision,
    targetUid: assignmentTarget ?? wing.uid, roleId: assignmentRole ?? memberRoleId };
  const assignment = await captureLifecycleUiAction(gm, 'assignRole', async () => {
    gm.state.session.phase = 'casting'; gm.state.session.setupRevision++;
    gm.deliver('assignRole', data, { status: 'committed', sessionId: 'normal-session',
      requestId: data.requestId, setupRevision: gm.state.session.setupRevision });
  }, { original: gmBefore, gm: true, normalSetup: true, sdkAuthority: true, deadlineAt: Date.now() + 3_000 });

  const applyAssignmentAndResume = async () => {
    wing.publish(state => {
      state.session.phase = 'casting'; state.session.setupRevision = 2;
      state.me.assignedRoleId = memberRoleId;
      state.connection = 'connecting'; state.sessionSnapshotFreshness = 'cache';
      state.sdkResumePending = true;
      state.session.currentActorBerthAuthority = { ...(state.session.currentActorBerthAuthority ?? {}),
        sessionId: state.session.id, actorUid: state.me.uid, groupId: state.me.fleetGroupId,
        role: 'player', connectionGeneration: state.me.connectionGeneration, assignedRoleId: memberRoleId,
        activeConsoleRoleId: null, replacementRoleId: null, replacementStatus: null, shipId: 'aegis' };
    });
    if (wing.onCastingBerthPublished) {
      const pendingMember = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
      await wing.onCastingBerthPublished(pendingMember);
    }
    if (resumeBerthGap) {
      const replySession = { id: 'normal-session', phase: 'casting', currentTurn: 0,
        setupConfirmed: true, setupRevision: 2, memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'] } };
      const replyPlayer = { ...wing.state.me, uid: resumeUid, sessionId: resumeSessionId,
        assignedRoleId: resumeAssignedRoleId, connectionGeneration: resumeGeneration };
      delete replyPlayer.connected;
      assert.equal(Object.hasOwn(replySession, 'currentActorBerthAuthority'), false,
        'The ordinary resume DTO contains the member session but not the separately enveloped own-berth witness.');
      assert.equal(Object.hasOwn(replyPlayer, 'connected'), false,
        'The ordinary resume DTO omits the feed-owned current connected field.');
      if (deliverResume) wing.deliver('resumeSession', { sessionId: resumeSessionId }, { session: replySession,
        player: replyPlayer }, { status: resumeStatus, bodyWait: resumeBodyWait });
      await wing.castingResumeNotice;
      if (wing.castingResumeNoticeError) throw wing.castingResumeNoticeError;
      wing.publish(state => {
        delete state.me.connected;
        state.me.connectionGeneration = resumeGeneration;
        state.identityHydrationRevision = resumeHydration;
        delete state.session.currentActorBerthAuthority;
        state.sessionSnapshotFreshness = 'server';
      });
      wing.publish(state => { state.sdkResumePending = false; state.connection = 'live';
        state.sessionSnapshotFreshness = 'server'; });
      await wing.onResumeDtoApplied?.(await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds }));
      return observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
    }
    wing.publish(state => {
      state.me.connectionGeneration = resumeGeneration;
      state.identityHydrationRevision = resumeHydration;
      state.session.currentActorBerthAuthority = { ...state.session.currentActorBerthAuthority,
        connectionGeneration: resumeGeneration };
    });
    if (deliverResume) {
      wing.deliver('resumeSession', { sessionId: resumeSessionId }, { session: { id: resumeSessionId },
        player: { ...wing.state.me, uid: resumeUid, sessionId: resumeSessionId,
          assignedRoleId: resumeAssignedRoleId, connectionGeneration: resumeGeneration } },
      { status: resumeStatus, bodyWait: resumeBodyWait });
      await wing.castingResumeNotice;
      if (wing.castingResumeNoticeError) throw wing.castingResumeNoticeError;
    }
    wing.publish(state => {
      state.sdkResumePending = false; state.connection = 'live'; state.sessionSnapshotFreshness = 'server';
    });
    return observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  };
  const restoreCurrentMemberBerth = () => wing.publish(state => {
    state.me.connected = true;
    state.session.currentActorBerthAuthority = { ...state.session.currentActorBerthAuthority,
      sessionId: state.session.id, actorUid: state.me.uid, groupId: state.me.fleetGroupId,
      role: 'player', connectionGeneration: state.me.connectionGeneration,
      assignedRoleId: state.me.assignedRoleId, activeConsoleRoleId: null,
      replacementRoleId: null, replacementStatus: null, shipId: 'aegis' };
  });
  const restoreOwnPlayerConnected = () => wing.publish(state => { state.me.connected = true; });
  const restoreCurrentMemberBerthOnly = () => wing.publish(state => {
    state.session.currentActorBerthAuthority = { ...state.session.currentActorBerthAuthority,
      sessionId: state.session.id, actorUid: state.me.uid, groupId: state.me.fleetGroupId,
      role: 'player', connectionGeneration: state.me.connectionGeneration,
      assignedRoleId: state.me.assignedRoleId, activeConsoleRoleId: null,
      replacementRoleId: null, replacementStatus: null, shipId: 'aegis' };
  });
  const current = deferMemberTransition ? null : await applyAssignmentAndResume();
  return { wing, gm, observer, before, current, assignment, applyAssignmentAndResume,
    restoreCurrentMemberBerth, restoreOwnPlayerConnected, restoreCurrentMemberBerthOnly, directory };
}

test('Wing bay profile accepts the ordinary Admiral assignment and its original captured resume', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { memberRoleId: 'admiral',
    proofProfile: 'wing-bays', resumeAssignedRoleId: 'admiral' });
  const accepted = await f.observer.accept(f.before, f.current,
    () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment);
  assert.ok(accepted, 'The declared ordinary Admiral profile must consume its real assignment/resume receipts.');
  assert.equal(accepted.assignedRoleId, 'admiral');
  assert.equal(accepted.currentMemberBerthMatches, true);
  assert.equal(accepted.connectionGeneration, f.before.connectionGeneration + 1);
  assert.equal(f.assignment.data.targetUid, f.wing.uid);
});

test('P181 casting acceptance captures asynchronous receipt rejections', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const wrongAssignment = structuredClone(f.assignment);
  wrongAssignment.data.targetUid = 'another-auth-actor';
  await assert.rejects(f.observer.accept(f.before, f.current,
    () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), wrongAssignment), error => {
    assert.match(error.message, /successful original GM assignRole target\/role receipt/);
    assert.equal(error.firstP181AuthorityRejectedState?.boundary, 'casting-assignment.accept');
    assert.equal(error.firstP181AuthorityRejectedState?.predicate, 'casting-resume-receipt');
    assert.equal(error.firstP181AuthorityRejectedState?.context.assignmentReceiptPresent, true);
    return true;
  });
  await f.observer.finish();
});

test('Wing bay profile retains ordinary Admiral casting authority before its assignment', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { memberRoleId: 'admiral',
    proofProfile: 'wing-bays', resumeAssignedRoleId: 'admiral', deferMemberTransition: true });
  const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const authority = await retainP181MemberAuthority(f.wing, Date.now() + 3_000, {
    mode: 'casting-assignment', castingRoleId: 'admiral', proofProfile: 'wing-bays',
    expected: { sessionId: f.before.sessionId, uidHash: f.before.uidHash,
      fleetGroupId: f.before.fleetGroupId, documentTimeOrigin: f.before.documentTimeOrigin,
      connectionGeneration: f.before.connectionGeneration,
      identityHydrationRevision: f.before.identityHydrationRevision },
  });
  try { await authority.check(); }
  finally { await authority.close(); }
  assert.equal(f.wing.observers.stores.size, 0);
  assert.equal(f.wing.observers.auth.size, 0);
});

function ordinaryAdmiralSurface() {
  const surface = mountedP181Surface('ordinary-admiral');
  surface.state.me.assignedRoleId = surface.state.me.activeConsoleRoleId = surface.state.me.seatId = 'admiral';
  surface.state.seats = [{ id: 'admiral', roleId: 'admiral', holderUid: surface.uid, status: 'claimed' }];
  Object.assign(surface.state.session.currentActorBerthAuthority,
    { assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral' });
  surface.setRoute('#/roles/admiral');
  return surface;
}

test('Wing bay profile observes the actual ordinary Admiral station without accepting later role retirement', async () => {
  const surface = ordinaryAdmiralSurface();
  const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const expected = await observeFullGameDemoPresentationMember(surface, { knownRoleIds: originalRoleIds });
  assert.equal(pc11MemberReadiness(expected, { sessionId: expected.sessionId,
    uidHash: expected.uidHash, roleId: 'admiral', stage: 'station' }), true);
  const authority = await retainP181MemberAuthority(surface, Date.now() + 3_000, {
    mode: 'startup', proofProfile: 'wing-bays', memberRoleId: 'admiral', expected,
  });
  try {
    await authority.check();
    surface.publish(state => { state.me.assignedRoleId = 'wing-commander'; });
    await assert.rejects(authority.check(), /role|authority|retired/i);
  } finally {
    // This deliberate authority retirement also survives observer teardown.
    await authority.close().catch(() => {});
  }
  assert.equal(surface.observers.stores.size, 0);
});

test('ordinary authority rejects an unknown profile instead of silently adopting the Wing default', async () => {
  const surface = mountedP181Surface('ordinary-wing');
  const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  await assert.rejects(async () => {
    const authority = await retainP181MemberAuthority(surface, Date.now() + 3_000, {
      mode: 'startup', proofProfile: 'unknown-cohort',
      expected: { sessionId: surface.state.session.id,
        uidHash: createHash('sha256').update(surface.uid).digest('hex').slice(0, 16) },
    });
    await authority.close();
  }, /profile/i);
  assert.equal(surface.observers.stores.size, 0);
});

test('ordinary casting navigation rejects an unknown profile instead of consuming its Wing receipts', async t => {
  await assert.rejects(async () => {
    const f = await actualP181CastingAssignmentFixture(t, { proofProfile: 'unknown-cohort' });
    await f.observer.accept(f.before, f.current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment);
  }, /profile/i);
});

test('the unchanged default observer refuses an Admiral station', async () => {
  const surface = ordinaryAdmiralSurface();
  const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  await assert.rejects(retainP181MemberAuthority(surface, Date.now() + 3_000, {
    mode: 'startup', memberRoleId: 'admiral',
    expected: { sessionId: surface.state.session.id,
      uidHash: createHash('sha256').update(surface.uid).digest('hex').slice(0, 16) },
  }), /role|profile|station/i);
});

async function actualOwnedMembershipCleanup({ actorCount = 3, foreign = false, defaultProfile = false } = {}) {
  const source = readFileSync(p181DeadlineSourcePath, 'utf8');
  const start = source.indexOf('if (cleanup.sessionAbsent && lifecycleRootsRemoved) await step(');
  const end = source.indexOf('\n      }\n      }\n      const sessionScopeReleased', start);
  assert.ok(start >= 0 && end > start, 'Use the exact existing owned membership cleanup consumer.');
  const ownedAuthUids = new Map(Array.from({ length: actorCount }, (_, i) => [`actor-${i}`, `owned-${i}`]));
  const records = new Map([...ownedAuthUids.values()].map(uid => [uid, { sessionId: 'normal-session' }]));
  if (foreign) records.set('foreign-uid', { sessionId: 'normal-session' });
  const deletes = [];
  const ref = id => ({ id });
  const document = id => ({ id, ref: ref(id), exists: records.has(id), get: key => records.get(id)?.[key] });
  const db = {
    collection: name => { assert.equal(name, 'activeMemberships'); return {
      where: (field, op, value) => { assert.deepEqual([field, op, value], ['sessionId', '==', 'normal-session']); return {
        get: async () => ({ size: records.size, docs: [...records.keys()].map(document) }),
      }; },
    }; },
    runTransaction: async callback => callback({ get: async held => document(held.id),
      delete: held => { deletes.push(held.id); records.delete(held.id); } }),
  };
  const cleanup = { sessionAbsent: true };
  let failure;
  try {
    await runInNewContext(`(async () => { ${source.slice(start, end)} })()`, {
      assert, ownedAuthUids, db, cleanup, lifecycleRootsRemoved: true, sessionId: 'normal-session',
      nativeActorCount: defaultProfile ? 2 : 3, Date,
      step: async (_name, action) => action(Date.now() + 3_000),
    });
  } catch (error) { failure = error; }
  return { failure, deletes, records, cleanup };
}

test('Wing bay cleanup removes exactly three captured original memberships', async () => {
  const held = await actualOwnedMembershipCleanup();
  assert.equal(held.failure, undefined, 'The declared three-actor profile must release all three exact original pointers.');
  assert.deepEqual(held.deletes, ['owned-0', 'owned-1', 'owned-2']);
  assert.equal(held.cleanup.ownedMembershipPointersAbsent, true);
});

test('Wing bay cleanup refuses a foreign membership before any deletion', async () => {
  const held = await actualOwnedMembershipCleanup({ foreign: true });
  assert.match(String(held.failure), /actor|membership|captured/i);
  assert.deepEqual(held.deletes, []);
  assert.equal(held.records.size, 4);
});

test('the original cleanup still removes two pointers and refuses a third captured actor in the default profile', async () => {
  const ordinary = await actualOwnedMembershipCleanup({ actorCount: 2, defaultProfile: true });
  assert.equal(ordinary.failure, undefined);
  assert.deepEqual(ordinary.deletes, ['owned-0', 'owned-1']);
  const extra = await actualOwnedMembershipCleanup({ defaultProfile: true });
  assert.match(String(extra.failure), /actor|membership|captured/i);
  assert.deepEqual(extra.deletes, []);
});

test('P181 casting assignment accepts only the original GM receipt and the member’s captured normal resume', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  const sourceModule = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const assignmentAuthority = await sourceModule.retainP181MemberAuthority(f.wing, Date.now() + 3_000, {
    mode: 'casting-assignment', castingRoleId: 'wing-commander',
    expected: { sessionId: f.before.sessionId, uidHash: f.before.uidHash, fleetGroupId: f.before.fleetGroupId,
      connectionGeneration: f.before.connectionGeneration,
      identityHydrationRevision: f.before.identityHydrationRevision, documentTimeOrigin: f.before.documentTimeOrigin },
  });
  const wait = await reconciledNativeWait(f.wing, 'full');
  let transitioned = false;
  f.wing.onDigest = async () => {
    if (transitioned) return;
    transitioned = true;
    await f.applyAssignmentAndResume();
  };
  const navigationStart = await wait(f.wing, 'Original Wing Commander assignment readiness', value =>
    pc11MemberReadiness(value, { sessionId: f.before.sessionId, uidHash: f.before.uidHash,
      roleId: 'wing-commander', stage: 'casting' }) && value.phase === 'casting' && value.cycle === 0 &&
      value.sdkResumePending === false, Date.now() + 3_000, f.before, assignmentAuthority);
  assert.equal(transitioned, true, 'The mounted source consumer observed assignment and normal resume during its wait.');
  const accepted = await f.observer.accept(f.before, navigationStart,
    () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment);
  assert.ok(accepted, 'The real casting assignment and ordinary resume must reach fresh member readiness.');
  assert.equal(accepted.assignedRoleId, 'wing-commander');
  assert.equal(accepted.connectionGeneration, f.before.connectionGeneration + 1);
  assert.equal(accepted.identityHydrationRevision, f.before.identityHydrationRevision + 1);
  assert.equal(accepted.sdkResumePending, false);
  assert.equal(f.assignment.data.targetUid, f.wing.uid);
  assert.equal(f.assignment.data.roleId, 'wing-commander');
  assert.equal(f.assignment.result.sessionId, f.before.sessionId);
  await assignmentAuthority.close();
  await f.observer.finish();
  assert.equal(f.wing.observers.stores.size, 0, 'The mounted readiness consumer leaves no Store observers attached.');
  for (const event of ['request', 'response', 'requestfailed', 'framenavigated'])
    assert.equal(f.wing.page.listenerCount(event), 0, `The passive resume observer removes its ${event} listener.`);
});

test('P181 casting assignment waits for the current member berth after ordinary resume DTO hydration', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, resumeBerthGap: true });
  const authority = await castingAssignmentAuthorityFor(f);
  const wait = await reconciledNativeWait(f.wing, 'full');
  let transitioned = false;
  let earlyAcceptance;
  f.wing.onResumeDtoApplied = async hydrated => {
    assert.equal(hydrated.currentOwnPlayerConfirmed, false);
    assert.equal(hydrated.currentMemberBerthPresent, false);
    earlyAcceptance = await f.observer.accept(f.before, hydrated,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment);
    f.restoreCurrentMemberBerth();
  };
  f.wing.onDigest = async () => {
    if (transitioned) return;
    transitioned = true;
    await f.applyAssignmentAndResume();
  };
  try {
    const hydrated = await wait(f.wing, 'Original casting assignment with normal resume DTO', value =>
      pc11MemberReadiness(value, { sessionId: f.before.sessionId, uidHash: f.before.uidHash,
        roleId: 'wing-commander', stage: 'casting' }) && value.phase === 'casting' &&
        value.sdkResumePending === false, Date.now() + 3_000, f.before, authority);
    assert.equal(transitioned, true);
    assert.equal(earlyAcceptance, false,
      'Do not accept missing connected/current-berth fields from the resume DTO as current-member confirmation.');
    assert.equal(hydrated.currentOwnPlayerConfirmed, true);
    const confirmed = await wait(f.wing, 'Original casting member berth confirmation', value =>
      pc11MemberReadiness(value, { sessionId: f.before.sessionId, uidHash: f.before.uidHash,
        roleId: 'wing-commander', stage: 'casting' }) && value.phase === 'casting' &&
        value.sdkResumePending === false && value.currentMemberBerthMatches === true,
    Date.now() + 3_000, f.before, authority);
    assert.equal(confirmed.currentMemberBerthPresent, true);
    assert.equal(confirmed.currentMemberBerthMatches, true);
    const accepted = await f.observer.accept(f.before, confirmed,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment);
    assert.ok(accepted);
    assert.equal(accepted.currentMemberBerthMatches, true);
  } finally {
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

function actualP181CastingReadyPredicate(before) {
  const source = readFileSync(p181DeadlineSourcePath, 'utf8');
  const marker = 'const castingReady = value =>';
  const start = source.indexOf(marker);
  const end = source.indexOf(';', start);
  assert.ok(start >= 0 && end > start, 'Bind the production P181 casting readiness predicate.');
  const expression = source.slice(start + marker.length, end).trim();
  return runInNewContext(`value => ${expression}`, {
    pc11MemberReadiness,
    sessionId: before.sessionId,
    admittedAuth: { uidHash: before.uidHash },
    P181_NORMAL_SETUP: { wingCommanderRoleId: 'wing-commander' },
    memberRoleId: 'wing-commander',
  });
}

test('P181 casting wait stays pending when connected restores before the current berth', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, resumeBerthGap: true });
  const authority = await castingAssignmentAuthorityFor(f);
  const wait = await reconciledNativeWait(f.wing, 'full');
  const ready = actualP181CastingReadyPredicate(f.before);
  let transitioned = false, lateBerth;
  f.wing.onResumeDtoApplied = async hydrated => {
    assert.equal(hydrated.currentOwnPlayerConfirmed, false);
    assert.equal(hydrated.currentMemberBerthPresent, false);
    f.restoreOwnPlayerConnected();
    const connectedOnly = await observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds });
    assert.equal(connectedOnly.currentOwnPlayerConfirmed, true);
    assert.equal(connectedOnly.currentMemberBerthPresent, false);
    lateBerth = setTimeout(f.restoreCurrentMemberBerthOnly, 350);
    assert.equal(ready(connectedOnly), false,
      'The actual production casting readiness predicate must continue waiting for the current berth.');
    await authority.check();
    assert.equal(await f.observer.accept(f.before, connectedOnly,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment), false,
    'A captured resume does not become ready from connected restoration alone.');
  };
  f.wing.onDigest = async () => {
    if (transitioned) return;
    transitioned = true;
    await f.applyAssignmentAndResume();
  };
  try {
    const current = await wait(f.wing, 'Casting assignment after connected restoration', ready,
      Date.now() + 2_000, f.before, authority);
    assert.equal(transitioned, true);
    assert.equal(current.currentOwnPlayerConfirmed, true);
    assert.equal(current.currentMemberBerthPresent, true);
    assert.equal(current.currentMemberBerthNull, false);
    assert.equal(current.currentMemberBerthMatches, true);
    assert.ok(await f.observer.accept(f.before, current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment));
  } finally {
    clearTimeout(lateBerth);
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 casting wait stays pending when connected restores before the current berth from an initially absent berth', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, resumeBerthGap: true,
    omitInitialMemberBerth: true });
  const authority = await castingAssignmentAuthorityFor(f);
  const wait = await reconciledNativeWait(f.wing, 'full');
  const ready = actualP181CastingReadyPredicate(f.before);
  let transitioned = false, lateBerth;
  f.wing.onResumeDtoApplied = async hydrated => {
    assert.equal(hydrated.currentOwnPlayerConfirmed, false);
    assert.equal(hydrated.currentMemberBerthPresent, false);
    f.restoreOwnPlayerConnected();
    const connectedOnly = await observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds });
    assert.equal(connectedOnly.currentOwnPlayerConfirmed, true);
    assert.equal(connectedOnly.currentMemberBerthPresent, false);
    lateBerth = setTimeout(f.restoreCurrentMemberBerthOnly, 350);
    assert.equal(ready(connectedOnly), false,
      'The actual production casting readiness predicate must continue waiting for the current berth.');
    await authority.check();
    assert.equal(await f.observer.accept(f.before, connectedOnly,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment), false,
    'A captured resume does not become ready from connected restoration alone.');
  };
  f.wing.onDigest = async () => {
    if (transitioned) return;
    transitioned = true;
    await f.applyAssignmentAndResume();
  };
  try {
    const current = await wait(f.wing, 'Casting assignment after connected restoration', ready,
      Date.now() + 2_000, f.before, authority);
    assert.equal(transitioned, true);
    assert.equal(current.currentOwnPlayerConfirmed, true);
    assert.equal(current.currentMemberBerthPresent, true);
    assert.equal(current.currentMemberBerthNull, false);
    assert.equal(current.currentMemberBerthMatches, true);
    assert.ok(await f.observer.accept(f.before, current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment));
  } finally {
    clearTimeout(lateBerth);
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 casting observer holds when the current berth restores before connected', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, resumeBerthGap: true });
  const authority = await castingAssignmentAuthorityFor(f);
  const wait = await reconciledNativeWait(f.wing, 'full');
  const ready = actualP181CastingReadyPredicate(f.before);
  let transitioned = false, lateConnected;
  f.wing.onResumeDtoApplied = async hydrated => {
    assert.equal(hydrated.currentOwnPlayerConfirmed, false);
    assert.equal(hydrated.currentMemberBerthPresent, false);
    f.restoreCurrentMemberBerthOnly();
    const berthOnly = await observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds });
    assert.equal(berthOnly.currentOwnPlayerConfirmed, false);
    assert.equal(berthOnly.currentMemberBerthPresent, true);
    assert.equal(berthOnly.currentMemberBerthNull, false);
    await authority.check();
    assert.equal(await f.observer.accept(f.before, berthOnly,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment), false,
    'A captured resume remains pending while the own-player connected witness is still omitted.');
    lateConnected = setTimeout(f.restoreOwnPlayerConnected, 250);
  };
  f.wing.onDigest = async () => {
    if (transitioned) return;
    transitioned = true;
    await f.applyAssignmentAndResume();
  };
  try {
    const current = await wait(f.wing, 'Casting assignment after berth restoration', ready,
      Date.now() + 2_000, f.before, authority);
    assert.equal(transitioned, true);
    assert.equal(current.currentOwnPlayerConfirmed, true);
    assert.equal(current.currentMemberBerthPresent, true);
    assert.equal(current.currentMemberBerthNull, false);
    assert.equal(current.currentMemberBerthMatches, true);
    assert.ok(await f.observer.accept(f.before, current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment));
  } finally {
    clearTimeout(lateConnected);
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 casting observer holds when the current berth restores before connected from an initially absent berth', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, resumeBerthGap: true,
    omitInitialMemberBerth: true });
  const authority = await castingAssignmentAuthorityFor(f);
  const wait = await reconciledNativeWait(f.wing, 'full');
  const ready = actualP181CastingReadyPredicate(f.before);
  let transitioned = false, lateConnected;
  f.wing.onResumeDtoApplied = async hydrated => {
    assert.equal(hydrated.currentOwnPlayerConfirmed, false);
    assert.equal(hydrated.currentMemberBerthPresent, false);
    f.restoreCurrentMemberBerthOnly();
    const berthOnly = await observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds });
    assert.equal(berthOnly.currentOwnPlayerConfirmed, false);
    assert.equal(berthOnly.currentMemberBerthPresent, true);
    assert.equal(berthOnly.currentMemberBerthNull, false);
    await authority.check();
    assert.equal(await f.observer.accept(f.before, berthOnly,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment), false,
    'A captured resume remains pending while the own-player connected witness is still omitted.');
    lateConnected = setTimeout(f.restoreOwnPlayerConnected, 250);
  };
  f.wing.onDigest = async () => {
    if (transitioned) return;
    transitioned = true;
    await f.applyAssignmentAndResume();
  };
  try {
    const current = await wait(f.wing, 'Casting assignment after berth restoration', ready,
      Date.now() + 2_000, f.before, authority);
    assert.equal(transitioned, true);
    assert.equal(current.currentOwnPlayerConfirmed, true);
    assert.equal(current.currentMemberBerthPresent, true);
    assert.equal(current.currentMemberBerthNull, false);
    assert.equal(current.currentMemberBerthMatches, true);
    assert.ok(await f.observer.accept(f.before, current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment));
  } finally {
    clearTimeout(lateConnected);
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 casting authority rejects a mismatched berth during the captured connected omission', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, resumeBerthGap: true });
  const authority = await castingAssignmentAuthorityFor(f);
  const wait = await reconciledNativeWait(f.wing, 'full');
  const ready = actualP181CastingReadyPredicate(f.before);
  let transitioned = false;
  f.wing.onResumeDtoApplied = async hydrated => {
    assert.equal(hydrated.currentOwnPlayerConfirmed, false);
    assert.equal(hydrated.currentMemberBerthPresent, false);
    f.wing.publish(state => {
      state.session.currentActorBerthAuthority = { sessionId: state.session.id, actorUid: state.me.uid,
        groupId: state.me.fleetGroupId, role: 'player', connectionGeneration: state.me.connectionGeneration,
        assignedRoleId: state.me.assignedRoleId, activeConsoleRoleId: null,
        replacementRoleId: null, replacementStatus: null, shipId: 'foreign-ship' };
    });
    await assert.rejects(authority.check(), /berth (?:changed|identity)/i,
      'A wrong present berth remains terminal even while connected is omitted.');
  };
  f.wing.onDigest = async () => {
    if (transitioned) return;
    transitioned = true;
    await f.applyAssignmentAndResume();
  };
  try {
    await assert.rejects(wait(f.wing, 'Casting assignment rejects a mismatched partial berth', ready,
      Date.now() + 2_000, f.before, authority), /berth (?:changed|identity)/i);
    assert.equal(transitioned, true);
  } finally {
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 casting assignment permits a same-epoch role receipt only with fully fresh unseated readiness', async t => {
  const f = await actualP181CastingAssignmentFixture(t, {
    resumeGeneration: 2, resumeHydration: 3, deliverResume: false,
  });
  const accepted = await f.observer.accept(f.before, f.current,
    () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment);
  assert.ok(accepted);
  assert.equal(accepted.connectionGeneration, f.before.connectionGeneration);
  assert.equal(accepted.identityHydrationRevision, f.before.identityHydrationRevision);
  assert.equal(accepted.sdkResumePending, false);
  await f.observer.finish();
});

for (const [label, options, replacementReceipt, expected] of [
  ['missing original GM receipt', {}, undefined, /receipt/i],
  ['foreign GM target', { assignmentTarget: 'foreign-target' }, undefined, /receipt/i],
  ['wrong selected role', { assignmentRole: 'admiral' }, undefined, /receipt|role/i],
  ['missing ordinary resume', { deliverResume: false }, undefined, /receipt|resume/i],
  ['foreign resume UID', { resumeUid: 'foreign-member' }, undefined, /receipt|scope|actor/i],
  ['foreign resume session', { resumeSessionId: 'foreign-session' }, undefined, /receipt|request|session/i],
  ['wrong resumed role', { resumeAssignedRoleId: 'admiral' }, undefined, /receipt|role|scope/i],
  ['wrong resumed lease', { resumeGeneration: 4 }, undefined, /receipt|lease|epoch/i],
  ['wrong resumed hydration', { resumeHydration: 5 }, undefined, /lease|hydration|epoch/i],
  ['rejected resume response', { resumeStatus: 403 }, undefined, /HTTP 200|resume/i],
  ['foreign original GM identity', {}, receipt => ({ ...receipt,
    before: { ...receipt.before, uidHash: 'f'.repeat(16) } }), /receipt/i],
  ['foreign original GM instance', {}, receipt => ({ ...receipt,
    before: { ...receipt.before, instanceId: 'foreign-instance' } }), /receipt/i],
  ['wrong committed setup revision', {}, receipt => ({ ...receipt,
    result: { ...receipt.result, setupRevision: receipt.result.setupRevision + 1 } }), /receipt/i],
]) {
  test(`P181 casting assignment rejects ${label}`, async t => {
    const f = await actualP181CastingAssignmentFixture(t, options);
    const assignment = replacementReceipt ? replacementReceipt(f.assignment) : label === 'missing original GM receipt'
      ? undefined : f.assignment;
    await assert.rejects(f.observer.accept(f.before, f.current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), assignment), expected);
    await f.observer.finish();
  });
}

test('P181 casting assignment times out on an ordinary resume body delivered after its original deadline', async t => {
  let releaseBody;
  const bodyWait = new Promise(resolveBody => { releaseBody = resolveBody; });
  const f = await actualP181CastingAssignmentFixture(t, { resumeBodyWait: bodyWait, observerDeadlineMs: 70 });
  try {
    await assert.rejects(f.observer.accept(f.before, f.current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment), /deadline|expired/i);
  } finally {
    releaseBody();
    await f.observer.finish();
  }
});

test('P181 casting assignment rejects a second ordinary resume even after the first receipt settled', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const repeatedPlayer = { ...f.wing.state.me, uid: f.wing.uid, sessionId: f.before.sessionId,
    assignedRoleId: 'wing-commander', connectionGeneration: f.before.connectionGeneration + 1 };
  f.wing.deliver('resumeSession', { sessionId: f.before.sessionId }, {
    session: { id: f.before.sessionId }, player: repeatedPlayer,
  });
  await assert.rejects(f.observer.accept(f.before, f.current,
    () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment),
  /multiple normal resume requests/i);
  await f.observer.finish();
});

async function castingAssignmentAuthorityFor(f) {
  const sourceModule = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const authority = await sourceModule.retainP181MemberAuthority(f.wing, Date.now() + 2_000, {
    mode: 'casting-assignment', castingRoleId: 'wing-commander',
    expected: { sessionId: f.before.sessionId, uidHash: f.before.uidHash, fleetGroupId: f.before.fleetGroupId,
      connectionGeneration: f.before.connectionGeneration,
      identityHydrationRevision: f.before.identityHydrationRevision, documentTimeOrigin: f.before.documentTimeOrigin },
  });
  f.wing.onCastingResumeRequest = resume => {
    f.wing.castingResumeNotice = authority.noteCastingResumeRequest(resume).catch(error => {
      f.wing.castingResumeNoticeError = error;
      throw error;
    });
    return f.wing.castingResumeNotice;
  };
  return authority;
}

const invalidFirstCastingBerths = [
  ['actor UID', () => ({ actorUid: 'foreign-actor' })],
  ['session ID', () => ({ sessionId: 'foreign-session' })],
  ['fleet group', () => ({ groupId: 'fleet-2' })],
  ['member role', () => ({ role: 'gm' })],
  ['missing ship', () => ({ shipId: '' })],
  ['lease generation', (_berth, f) => ({ connectionGeneration: f.before.connectionGeneration + 2 })],
  ['assigned role pointer', () => ({ assignedRoleId: 'admiral' })],
  ['active console pointer', () => ({ activeConsoleRoleId: 'wing-commander' })],
  ['replacement role pointer', () => ({ replacementRoleId: 'admiral' })],
  ['replacement status pointer', () => ({ replacementStatus: 'assigned' })],
];
for (const [label, mutate] of invalidFirstCastingBerths) {
  test(`P181 casting retainer rejects a first berth with a mismatched ${label} before pinning`, async t => {
    const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true,
      omitInitialMemberBerth: true });
    const authority = await castingAssignmentAuthorityFor(f);
    try {
      const originalBerth = { sessionId: f.before.sessionId, actorUid: f.wing.uid,
        groupId: f.before.fleetGroupId, role: 'player', connectionGeneration: f.before.connectionGeneration,
        assignedRoleId: 'wing-commander', activeConsoleRoleId: null,
        replacementRoleId: null, replacementStatus: null, shipId: 'aegis' };
      f.wing.publish(state => {
        state.session.phase = 'casting'; state.me.assignedRoleId = 'wing-commander';
        state.connection = 'connecting'; state.sessionSnapshotFreshness = 'cache'; state.sdkResumePending = true;
        state.session.currentActorBerthAuthority = { ...originalBerth, ...mutate(originalBerth, f) };
      });
      const error = await authority.failed.then(() => null, failure => failure);
      assert.ok(error, `The invalid ${label} must be terminal before a binding exists.`);
      assert.match(error.message, /berth|authority|identity/i);
      assert.equal(error.firstMemberSignatureRejectedState, undefined,
        'Malformed or mismatched source input must fail in the casting validator, not the generic signature comparator.');
    } finally {
      await authority.close().catch(() => {});
      await f.observer.finish();
    }
  });
}

for (const [label, retire] of [
  ['explicit null', state => { state.session.currentActorBerthAuthority = null; }],
  ['omission before the captured DTO gap', state => { delete state.session.currentActorBerthAuthority; }],
  ['ship replacement', state => { state.session.currentActorBerthAuthority.shipId = 'foreign-ship'; }],
]) {
  test(`P181 casting retainer keeps a bound first berth terminal after ${label}`, async t => {
    const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true,
      omitInitialMemberBerth: true });
    const authority = await castingAssignmentAuthorityFor(f);
    let heldFailure;
    f.wing.onCastingBerthPublished = async current => {
      assert.equal(current.currentMemberBerthMatches, true);
      assert.equal((await authority.check()).fresh, false,
        'The first valid publication is held while the ordinary resume fence is pending.');
      f.wing.publish(retire);
      heldFailure = await authority.failed.then(() => null, failure => failure);
      assert.match(heldFailure?.message ?? '', /berth|authority|retired/i);
      throw heldFailure;
    };
    try {
      await assert.rejects(f.applyAssignmentAndResume(), error => error === heldFailure);
      assert.ok(heldFailure);
      assert.equal(heldFailure.firstMemberSignatureRejectedState, undefined,
        'The one-field pin must ratchet and later retirement must fail its casting-specific guard.');
    } finally {
      await authority.close().catch(() => {});
      await f.observer.finish();
    }
  });
}

const transientCastingRetirements = [
  ['Auth identity', async f => { f.wing.publishAuth(null); f.wing.publishAuth({ uid: 'wing-uid' }); }],
  ['actor demotion', f => { f.wing.publish(state => { state.me.role = 'gm'; });
    f.wing.publish(state => { state.me.role = 'player'; }); }],
  ['fleet membership', f => { f.wing.publish(state => { state.me.fleetGroupId = 'fleet-2';
    state.session.currentActorBerthAuthority = { ...state.session.currentActorBerthAuthority, groupId: 'fleet-2' }; });
    f.wing.publish(state => { state.me.fleetGroupId = 'fleet-1';
      state.session.currentActorBerthAuthority = { ...state.session.currentActorBerthAuthority, groupId: 'fleet-1' }; }); }],
  ['kick', f => { f.wing.publish(state => { state.me.kickedAt = 'transient-kick'; });
    f.wing.publish(state => { delete state.me.kickedAt; }); }],
  ['escape lock', f => { f.wing.publish(state => { state.me.escapeState = { status: 'locked' }; });
    f.wing.publish(state => { delete state.me.escapeState; }); }],
  ['replacement', f => { f.wing.publish(state => { state.me.replacementRoleId = 'admiral';
    state.me.replacementStatus = 'pending'; }); f.wing.publish(state => {
    delete state.me.replacementRoleId; delete state.me.replacementStatus; }); }],
  ['explicit connected=false', f => { f.wing.publish(state => { state.me.connected = false; });
    f.wing.publish(state => { state.me.connected = true; }); }],
  // App emits offline during legitimate freshness withdrawal. Keep the
  // rejection control on idle, which is ineligible for an admitted caster.
  ['ineligible connection', f => { f.wing.publish(state => { state.connection = 'idle'; });
    f.wing.publish(state => { state.connection = 'live'; }); }],
  ['explicit null own berth', f => { f.wing.publish(state => { state.session.currentActorBerthAuthority = null; });
    f.wing.publish(state => { state.session.currentActorBerthAuthority = { ...state.session.currentActorBerthAuthority,
      sessionId: state.session.id, actorUid: state.me.uid, groupId: state.me.fleetGroupId,
      role: 'player', connectionGeneration: state.me.connectionGeneration,
      assignedRoleId: state.me.assignedRoleId, activeConsoleRoleId: null,
      replacementRoleId: null, replacementStatus: null, shipId: 'aegis' }; }); }],
  ['mismatched own berth', f => { f.wing.publish(state => { state.session.currentActorBerthAuthority = {
    ...state.session.currentActorBerthAuthority, shipId: 'foreign-ship' }; });
    f.wing.publish(state => { state.session.currentActorBerthAuthority = { ...state.session.currentActorBerthAuthority,
      shipId: 'aegis' }; }); }],
  ['own berth disappearance after resume settlement', f => { f.wing.publish(state => {
    delete state.session.currentActorBerthAuthority; }); f.wing.publish(state => {
    state.session.currentActorBerthAuthority = { sessionId: state.session.id, actorUid: state.me.uid,
      groupId: state.me.fleetGroupId, role: 'player', connectionGeneration: state.me.connectionGeneration,
      assignedRoleId: state.me.assignedRoleId, activeConsoleRoleId: null,
      replacementRoleId: null, replacementStatus: null, shipId: 'aegis' }; }); }],
  ['connected field disappearance after resume settlement', f => { f.wing.publish(state => {
    delete state.me.connected; }); f.wing.publish(state => { state.me.connected = true; }); }],
  ['station claim before chooser', f => { f.wing.publish(state => {
    state.me.activeConsoleRoleId = 'wing-commander'; state.me.seatId = 'wing-commander';
    state.seats[0] = { ...state.seats[0], status: 'claimed', holderUid: 'wing-uid' };
  }); }],
  ['member lease', f => { f.wing.publish(state => { state.me.connectionGeneration += 2; });
    f.wing.publish(state => { state.me.connectionGeneration -= 2; }); }],
  ['mounted hydration', f => { f.wing.publish(state => { state.identityHydrationRevision += 2; });
    f.wing.publish(state => { state.identityHydrationRevision -= 2; }); }],
  ['SDK server fence', f => { f.wing.publish(state => { state.sdkHasServerAuthority = false; });
    f.wing.publish(state => { state.sdkHasServerAuthority = true; }); }],
  ['settled resume pending fence', f => { f.wing.publish(state => { state.sdkResumePending = true; });
    f.wing.publish(state => { state.sdkResumePending = false; }); }],
  ['actor profile', async (f, authority) => { f.wing.activeDemoActorProfile = { roleId: 'admiral', sessionId: 'normal-session' };
    await authority.check(); }],
];

for (const [label, retire] of transientCastingRetirements) {
  test(`P181 casting assignment keeps ${label} retirement terminal across restoration`, async t => {
    const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
    const authority = await castingAssignmentAuthorityFor(f);
    const wait = await reconciledNativeWait(f.wing, 'full');
    let injected = false;
    f.wing.onDigest = async () => {
      if (injected) return;
      injected = true;
      await f.applyAssignmentAndResume();
      await retire(f, authority);
    };
    try {
      await assert.rejects(wait(f.wing, 'Original casting assignment readiness', value =>
        pc11MemberReadiness(value, { sessionId: f.before.sessionId, uidHash: f.before.uidHash,
          roleId: 'wing-commander', stage: 'casting' }) && value.phase === 'casting' &&
          value.sdkResumePending === false, Date.now() + 1_800, f.before, authority),
      /retir|authority|identity|role|fleet|seat|berth|fence|document|profile|lease|hydration/i);
      assert.equal(injected, true);
    } finally {
      await authority.close().catch(() => {});
      await f.observer.finish();
    }
  });
}

test('P181 casting assignment authority retires on document replacement', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  const authority = await castingAssignmentAuthorityFor(f);
  f.wing.documentTimeOrigin = 2000;
  try { await assert.rejects(authority.check(), /documentTimeOrigin|document|observation/i); }
  finally { await authority.close().catch(() => {}); await f.observer.finish(); }
});

test('P181 casting assignment rejects connected omission without a captured ordinary resume', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  const authority = await castingAssignmentAuthorityFor(f);
  f.wing.onCastingResumeRequest = undefined;
  try {
    await f.applyAssignmentAndResume();
    f.wing.publish(state => { delete state.me.connected; });
    await assert.rejects(authority.check(), /connected|authority|retired/i);
  } finally {
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

// Expanded first-rejection controls intentionally exercise the real mounted
// store/Auth observer. The assertions are additive: terminal decisions and
// their original messages remain the contract; this group requires the
// bounded first witness to survive the browser-command and failure bridge.
const expandedRetainerRejections = [
  ['Auth identity', f => f.wing.publishAuth({ uid: 'foreign-uid' }), 'auth-identity'],
  ['member session', f => f.wing.publish(state => { state.me.sessionId = 'foreign-session'; }), 'member-session-scope'],
  ['actor role', f => f.wing.publish(state => { state.me.role = 'gm'; }), 'member-role'],
  ['fleet group', f => f.wing.publish(state => { state.me.fleetGroupId = 'fleet-2'; })],
  ['phase and cycle', f => f.wing.publish(state => { state.session.phase = 'active'; state.session.currentTurn = 1; }), 'phase-cycle-setup'],
  ['SDK server authority', f => f.wing.publish(state => { state.sdkHasServerAuthority = false; }), 'sdk-authority-fence'],
  ['connected authority', f => f.wing.publish(state => { state.me.connected = false; }), 'connected-authority'],
  ['member lease', f => f.wing.publish(state => { state.me.connectionGeneration += 2; }), 'lease-hydration-epoch'],
  ['own station seat', f => f.wing.publish(state => {
    state.me.activeConsoleRoleId = 'wing-commander'; state.me.seatId = 'wing-commander';
    state.seats[0] = { ...state.seats[0], status: 'claimed', holderUid: 'wing-uid' };
  }), 'seat-berth'],
  ['explicit null own berth', f => f.wing.publish(state => { state.session.currentActorBerthAuthority = null; }), 'seat-berth'],
];
for (const [label, reject, expectedPredicate] of expandedRetainerRejections) {
  test(`P181 actual retained authority first-rejection capture covers ${label}`, async t => {
    const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
    const authority = await castingAssignmentAuthorityFor(f);
    try {
      reject(f);
      const error = await authority.failed.then(() => null, failure => failure);
      assert.ok(error, `The original ${label} guard remains terminal.`);
      assert.ok(error.firstP181AuthorityRejectedState,
        `The first ${label} rejection must traverse the actual retainer, command bridge, and native error path.`);
      const witness = error.firstP181AuthorityRejectedState;
      assert.equal(witness.schemaVersion, 1);
      assert.equal(typeof witness.boundary, 'string');
      assert.equal(typeof witness.predicate, 'string');
      if (expectedPredicate) assert.equal(witness.predicate, expectedPredicate,
        `${label} first rejection: ${error.message}`);
      assert.ok(['lobby', 'casting', 'briefing', 'active', 'paused', 'debrief', 'closed', null]
        .includes(witness.phase));
      assert.ok(witness.firstPinContext,
        'Retain the first already-inspected pin, including its original source phase.');
      assert.equal(witness.firstPinContext.observed.authMatchesOriginal, true);
      assert.equal(witness.firstPinContext.observed.phase, 'lobby');
      assert.equal(witness.firstPinContext.observed.cycle, 0);
      const encoded = JSON.stringify(witness);
      for (const privateKey of ['"uid"', '"sessionId"', '"fleetGroupId"', '"shipId"'])
        assert.equal(encoded.includes(privateKey), false, `The bounded witness must not export ${privateKey}.`);
      if (label === 'Auth identity') {
        assert.equal(witness.observed.authMatchesOriginal, false,
          'The callback tuple identifies the first Auth mismatch without reading the Store again.');
        const serialized = originalProofError(error);
        assert.ok(serialized.fullInspect.includes('firstP181AuthorityRejectedState'));
        assert.ok(serialized.heldObservationsInspect.includes('firstP181AuthorityRejectedState'),
          'The generic witness must cross the native primary-failure serializer.');
        const evidence = await retainProofFailure(f.directory, 'first-authority-witness', error);
        assert.equal(evidence.evidenceWriteFailed, false);
        const record = JSON.parse(await readFile(evidence.path, 'utf8'));
        assert.equal(record.originalError.message, error.message);
        assert.ok(record.originalError.fullInspect.includes('firstP181AuthorityRejectedState'));
      }
    } finally {
      await authority.close().catch(() => {});
      await f.observer.finish();
    }
  });
}

test('P181 first rejection preserves fractional performance time origins', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, documentTimeOrigin: 1000.25 });
  const authority = await castingAssignmentAuthorityFor(f);
  try {
    f.wing.publishAuth({ uid: 'foreign-uid' });
    await assert.rejects(authority.failed, error => {
      const witness = error.firstP181AuthorityRejectedState;
      assert.ok(witness);
      assert.equal(witness.firstPinContext.expected.documentTimeOriginPresent, true);
      assert.equal(witness.firstPinContext.expected.documentMatches, true);
      assert.equal(witness.firstPinContext.observed.documentTimeOriginPresent, true);
      assert.equal(witness.firstPinContext.observed.documentMatchesOriginal, true);
      return true;
    });
  } finally {
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 document retirement carries its first witness through the authority failed channel', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  const authority = await castingAssignmentAuthorityFor(f);
  try {
    f.wing.documentTimeOrigin = 2000.5;
    const checkFailure = authority.check().then(() => null, error => error);
    await assert.rejects(authority.failed, error => {
      assert.equal(error.message, 'Original P181 observation documentTimeOrigin changed.');
      assert.equal(error.firstP181AuthorityRejectedState?.predicate, 'document-binding');
      assert.equal(error.firstP181AuthorityRejectedState?.observed.documentMatchesOriginal, false);
      assert.equal(error.firstP181AuthorityRejectedState?.sourceRead, 'already-held-only');
      return true;
    });
    const checkError = await checkFailure;
    assert.ok(checkError?.firstP181AuthorityRejectedState,
      'Both the direct check and the already-armed failed channel preserve the first document witness.');
  } finally {
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 retainer classifies GM instance retirement specifically', async () => {
  const gm = mountedP181Surface('original-gm', { gm: true });
  const before = await observeFullGameDemoPresentationMember(gm, { knownRoleIds: originalRoleIds });
  const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const authority = await retainP181MemberAuthority(gm, Date.now() + 3_000, { mode: 'startup', requireGm: true,
    expected: { sessionId: before.sessionId, uidHash: before.uidHash, instanceId: before.instanceId } });
  try {
    gm.publish(state => { state.gmInstance.id = 'replacement-gm-instance'; });
    await assert.rejects(authority.failed, error => {
      assert.equal(error.firstP181AuthorityRejectedState?.predicate, 'gm-instance-recovery');
      return true;
    });
  } finally { await authority.close().catch(() => {}); }
});

test('P181 ordinary false and pending authority observations remain holds without first-rejection capture', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  const authority = await castingAssignmentAuthorityFor(f);
  try {
    f.wing.publish(state => { state.sdkResumePending = true; });
    const result = await authority.check();
    assert.equal(result.fresh, false);
    const terminalDuringPendingHold = await Promise.race([
      authority.failed.then(() => true, () => true),
      new Promise(resolvePending => setTimeout(() => resolvePending(false), 25)),
    ]);
    assert.equal(terminalDuringPendingHold, false,
      'An ordinary non-fresh/pending state remains a hold and does not become a terminal witness.');
  } finally {
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 actual ordinary-navigation observer preserves the first receipt rejection', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const navigation = createMemberNavigationResumeObserver(f.wing.page, { directory: f.directory,
    roleId: 'wing-commander', deadlineAt: Date.now() + 3_000, memberContract: 'pc11-live-base' });
  const station = { ...f.current, connectionGeneration: f.current.connectionGeneration + 1,
    identityHydrationRevision: f.current.identityHydrationRevision + 1 };
  await navigation.prepare(f.current);
  let error;
  try {
    await navigation.accept(f.current, station, async () => station);
  } catch (caught) { error = caught; }
  await navigation.finish(error);
  assert.match(error?.message ?? '', /normal resume receipt and accepted hydration/i,
    'The original missing-receipt rejection remains unchanged.');
  assert.ok(error?.firstP181AuthorityRejectedState,
    'The actual station-navigation consumer must retain its first terminal receipt witness.');
  assert.equal(error.firstP181AuthorityRejectedState.boundary, 'normal-navigation.accept');
  assert.equal(error.firstP181AuthorityRejectedState.firstPin.sessionMatchesExpected, true);
});

test('P181 observer reports navigation unprepared when acceptance fails before prepare', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const navigation = createMemberNavigationResumeObserver(f.wing.page, { directory: f.directory,
    roleId: 'wing-commander', deadlineAt: Date.now() + 3_000, memberContract: 'pc11-live-base' });
  const station = { ...f.current, connectionGeneration: f.current.connectionGeneration + 1,
    identityHydrationRevision: f.current.identityHydrationRevision + 1 };
  let error;
  try { await navigation.accept(f.before, station, async () => station); } catch (caught) { error = caught; }
  await navigation.finish(error);
  assert.match(error?.message ?? '', /normal resume receipt and accepted hydration/i);
  assert.equal(error.firstP181AuthorityRejectedState?.context.navigationPrepared, false);
});

test('P181 actual full-actor caller preserves its first terminal assertion witness', async () => {
  const valid = actualP181ReadinessConsumer('full', false).member;
  const rejected = { ...valid, hasAuth: false };
  const consumer = actualP181ReadinessConsumer('full', false, { memberReads: [rejected] });
  await assert.rejects(consumer.execute(), error => Boolean(error.firstP181AuthorityRejectedState &&
    error.firstP181AuthorityRejectedState.observed.hasAuth === false &&
    error.firstP181AuthorityRejectedState.sourceRead === 'held-only'),
    'The existing caller-side Auth assertion must serialize its held tuple without a new read.');
});

test('P181 actual GM caller preserves authority loss across the awaited recovery read', async () => {
  const valid = actualP181ReadinessConsumer('gm', false).member;
  const rejected = { ...valid, playerRole: 'player' };
  const consumer = actualP181ReadinessConsumer('gm', false, { memberReads: [valid, rejected] });
  await assert.rejects(consumer.execute(), error => Boolean(error.firstP181AuthorityRejectedState &&
    error.firstP181AuthorityRejectedState.observed.roleMatchesExpected === false &&
    error.firstP181AuthorityRejectedState.context.recoveryFlagObserved),
    'The post-recovery reread must retain the first terminal role witness without re-probing.');
});

test('P181 admission UID and casting readiness assertions retain the held admitted tuple', async () => {
  const source = readFileSync(p181DeadlineSourcePath, 'utf8');
  const marker = '          try {\n            assert.equal(admitted.uidHash, admittedAuth.uidHash);';
  const start = source.indexOf(marker);
  const end = source.indexOf('\n          const displayName', start);
  assert.ok(start >= 0 && end > start, 'Bind the actual normal-admission readiness assertions.');
  const consumer = source.slice(start, end);
  const valid = actualP181ReadinessConsumer('full', false).member;
  for (const [label, admitted, admittedAuth, expected] of [
    ['UID hash', { ...valid, uidHash: 'wrong-held-hash' }, { uidHash: valid.uidHash },
      witness => witness.observed.uidHashMatchesExpected === false],
    ['casting readiness', { ...valid, connection: 'offline' }, { uidHash: valid.uidHash },
      witness => witness.observed.connection === 'offline'],
  ]) {
    const operation = runInNewContext(`(async () => { ${consumer} })()`, { assert, admitted, admittedAuth,
      sessionId: valid.sessionId, memberRoleId: 'wing-commander', pc11MemberReadiness,
      retainP181CallerRejection });
    await assert.rejects(operation, error => {
      const witness = error.firstP181AuthorityRejectedState;
      assert.ok(witness, `${label} remains terminal and includes the held tuple.`);
      assert.equal(witness.boundary, 'casting-assignment.admitted-readiness');
      assert.equal(witness.sourceRead, 'held-only');
      assert.ok(expected(witness));
      return true;
    });
  }
});

async function remainingNativeConsumer({ rejectedCreate = false, pendingCreate = false, lateCommit = false,
  scopeStall = false, launchStall = false, foreignState = false, clock, coreInput,
  directory, closeOwned, terminateOwned, writeOutcome, configureSurfaces, afterGmClaim,
  servedEnvironmentChange, unclaimedWingSeat = false, rejectedMessage = 'ordinary rejected create', proofProfile,
  ordinaryPreparation = false, wingBayFlow = false, onNormalStarted, onWingBayAction,
  servedSourceBody, servedSourceResponseUrl, cliEntry = false, landingSourceBody, checkedLandingSource, ownerInput } = {}) {
  let now = Date.now();
  if (clock) now = clock.now();
  const records = new Map(), deletedAuth = [], operations = [], writes = [], privateRecords = [], surfaces = [], browsers = [];
  const preflightAcquisitions = { provider: 0, browser: 0 };
  const fetchedUrls = [];
  const gm = mountedP181Surface('native-original-gm', { casting: true });
  const wing = mountedP181Surface('native-original-wing', { casting: true });
  const admiral = mountedP181Surface('native-original-admiral', { casting: true });
  if (unclaimedWingSeat) {
    for (const surface of [gm, wing]) surface.state.seats = [{ id: 'wing-commander', roleId: 'wing-commander',
      status: 'available', holderUid: null }];
  }
  const get = path => ({ exists: records.has(path), ref: ref(path),
    get: key => key.split('.').reduce((value, part) => value?.[part], records.get(path)) });
  const ref = path => ({ path, get: async () => get(path) });
  if (foreignState) records.set('activeMemberships/foreign-uid', { sessionId: 'foreign-session' });
  const query = predicate => ({ get: async () => {
    const rows = [...records.entries()].filter(([path, value]) => predicate(path, value));
    return { size: rows.length, docs: rows.map(([path]) => ({ id: path.split('/').at(-1), ref: ref(path),
      exists: true, get: key => get(path).get(key) })) };
  } });
  const db = { doc: ref,
    collection: name => ({ get: query(path => path.startsWith(`${name}/`) && path.split('/').length === 2).get,
      where: (field, _op, value) => query((path, data) => path.startsWith(`${name}/`) && data[field] === value) }),
    collectionGroup: name => ({ where: (field, _op, value) => ({ get: async () => {
      if (scopeStall && operations.length === 0) return new Promise(() => {});
      return query((path, data) => path.includes(`/${name}/`) && data[field] === value).get();
    } }) }),
    runTransaction: async callback => callback({ get: async value => get(value.path),
      delete: value => { records.delete(value.path); operations.push(`delete:${value.path}`); } }),
    recursiveDelete: async value => { records.delete(value.path); operations.push(`delete:${value.path}`); },
    terminate: async () => { operations.push('terminate'); await terminateOwned?.(); } };
  const authAdmin = { getUser: async uid => ({ uid, metadata: { creationTime: new Date(now - 100).toISOString() } }),
    deleteUser: async uid => { deletedAuth.push(uid); } };
  const adminApp = { delete: async () => { operations.push('delete-admin'); } };
  const create = () => {
    records.set('sessions/normal-session', { joinCode: '345678' });
    records.set('joinCodes/345678', { sessionId: 'normal-session' });
    records.set('sessionCreationRequests/native-original-gm_create-original', { requestId: 'create-original',
      sessionId: 'normal-session', fingerprint: { actorUid: gm.uid, requestId: 'create-original' } });
    records.set(`activeMemberships/${gm.uid}`, { sessionId: 'normal-session' });
  };
  gm.onChoice = async name => {
    if (name === 'Create a session') {
      if (!rejectedCreate && !pendingCreate || lateCommit) create();
      if (pendingCreate) {
        gm.page.emit('request', { url: () => 'http://127.0.0.1:5011/demo-controlled/us-central1/createSession',
          method: () => 'POST', postDataJSON: () => ({ data: { requestId: 'create-original' } }) });
        return;
      }
      gm.deliver('createSession', { requestId: 'create-original' }, { session: { id: 'normal-session', joinCode: '345678' } },
        rejectedCreate ? { status: 403, error: { status: 'PERMISSION_DENIED', message: rejectedMessage } } : {});
    }
    if (name === 'Authorize local emulator GM') {
      gm.state.gmAccessAuthenticatedAt = 1;
      const response = { url: () => 'http://127.0.0.1:5173/__local-gm-access', status: () => 200,
        request: () => ({ method: () => 'POST' }), json: async () => ({ authenticated: true }) };
      gm.page.emit('response', response); // Respond through the original armed page observer.
      gm.deliverLocal?.(response);
    }
    if (name === 'Join as GM') {
      const instance = { id: 'gm-original-instance', uid: gm.uid, sessionId: 'normal-session', claimedAt: '2026-10-08T00:00:00.000Z' };
      gm.state.gmInstance = instance; gm.state.me.role = 'gm';
      if (afterGmClaim) await afterGmClaim(gm); else gm.setRoute('#/gm');
      gm.deliver('claimGmInstance', { sessionId: 'normal-session', instanceId: instance.id }, { instance });
    }
    if (name === 'Confirm setup // Confirm roster') {
      const expectedSetupRevision = gm.state.session.setupRevision;
      gm.state.session.setupConfirmed = true;
      gm.state.session.setupRevision = expectedSetupRevision + 1;
      gm.deliver('confirmSetup', { sessionId: 'normal-session', instanceId: gm.state.gmInstance.id,
        requestId: 'confirm-original', expectedSetupRevision, playerCount: 8, chartId: 'A' },
      { status: 'committed', requestId: 'confirm-original', setupRevision: expectedSetupRevision + 1, setupConfirmed: true });
    }
    if (name.startsWith('Assign role to ')) gm.deliver('assignRole',
      { sessionId: 'normal-session', requestId: 'assign-original', roleId: 'wing-commander' }, null,
      { status: 403, error: { status: 'PERMISSION_DENIED', message: 'controlled downstream assignment rejection' } });
  };
  wing.onChoice = async name => {
    if (name === 'Join a session') {
      wing.state.session.setupConfirmed = true;
      records.set(`activeMemberships/${wing.uid}`, { sessionId: 'normal-session' });
      wing.deliver('joinSession', { joinCode: '345678' }, { session: { id: 'normal-session' } });
    }
  };
  if (ordinaryPreparation) {
    const members = [wing, admiral];
    for (const surface of [gm, ...members]) surface.state.seats = ['wing-commander', 'admiral']
      .map(roleId => ({ id: roleId, roleId, holderUid: null, status: 'available' }));
    const gmChoices = gm.onChoice;
    gm.onChoice = async name => {
      if (name.startsWith('Assign role to ')) {
        const surface = members.find(member => name === `Assign role to ${member.uid}`);
        assert.ok(surface, 'Assign only the display name of the original normally admitted actor.');
        const roleId = gm.input;
        const expectedSetupRevision = gm.state.session.setupRevision;
        gm.state.session.phase = 'casting'; gm.state.session.setupRevision++;
        gm.deliver('assignRole', { sessionId: 'normal-session', instanceId: gm.state.gmInstance.id,
          requestId: `assign-${surface.uid}`, expectedSetupRevision, targetUid: surface.uid, roleId },
        { status: 'committed', sessionId: 'normal-session', requestId: `assign-${surface.uid}`,
          setupRevision: gm.state.session.setupRevision });
        surface.publish(state => {
          state.session.phase = 'casting'; state.session.setupRevision = gm.state.session.setupRevision;
          state.me.assignedRoleId = roleId; state.connection = 'connecting';
          state.sessionSnapshotFreshness = 'cache'; state.sdkResumePending = true;
          state.session.currentActorBerthAuthority.assignedRoleId = roleId;
        });
        const nextGeneration = surface.state.me.connectionGeneration + 1;
        surface.deliver('resumeSession', { sessionId: 'normal-session' }, {
          session: { id: 'normal-session' }, player: { ...surface.state.me, connectionGeneration: nextGeneration },
        });
        await remainingSettleUntil(() => Boolean(surface.window.__p181OriginalMemberObservation?.castingResumeRequest),
          'original casting resume guard notification');
        surface.publish(state => {
          state.me.connectionGeneration = nextGeneration; state.identityHydrationRevision++;
          state.session.currentActorBerthAuthority.connectionGeneration = nextGeneration;
          state.connection = 'live'; state.sessionSnapshotFreshness = 'server'; state.sdkResumePending = false;
        });
        return;
      }
      if (name === 'ARE YOU SURE? // ADVANCE TO CYCLE 1') {
        const expectedSetupRevision = gm.state.session.setupRevision;
        const turnPhase = { turn: 1, airspace: { state: 'restricted', tickerActive: false, pressAccess: false },
          teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
          openAirspaceEndsAt: new Date(now + 840_000).toISOString(),
          timerPause: { reason: 'turn-interstitial', window: 'restricted', remainingMs: 600_000,
            pausedAt: new Date(now).toISOString() } };
        for (const surface of [gm, ...members]) surface.publish(state => {
          state.session.phase = 'active'; state.session.currentTurn = 1;
          state.session.setupRevision = expectedSetupRevision + 1;
          state.session.turnPhase = structuredClone(turnPhase);
        });
        gm.deliver('startGame', { sessionId: 'normal-session', instanceId: gm.state.gmInstance.id,
          requestId: 'start-original', expectedSetupRevision },
        { status: 'committed', sessionId: 'normal-session', requestId: 'start-original', currentTurn: 1,
          setupRevision: expectedSetupRevision + 1, turnPhase });
        await onNormalStarted?.({ gm, wing, admiral });
        return;
      }
      if (name === 'Clear cycle briefing // resume clock') {
        const pausedAt = gm.state.session.turnPhase.timerPause.pausedAt;
        for (const surface of [gm, ...members]) surface.publish(state => {
          delete state.session.turnPhase.timerPause;
        });
        gm.deliver('clearTurnAdvanceInterstitial', { sessionId: 'normal-session', instanceId: gm.state.gmInstance.id,
          requestId: 'clear-original', expectedCycle: 1, expectedPausedAt: pausedAt },
        { status: 'cleared', cycle: 1, pausedAt, turnPhase: structuredClone(gm.state.session.turnPhase) });
        return;
      }
      await gmChoices(name);
    };
    for (const surface of members) surface.onChoice = async name => {
      if (name === 'Join a session') {
        surface.state.session.setupConfirmed = true;
        records.set(`activeMemberships/${surface.uid}`, { sessionId: 'normal-session' });
        surface.deliver('joinSession', { joinCode: '345678' }, { session: { id: 'normal-session' } });
      }
      if (name === `a[href$="/roles/${surface.state.me.assignedRoleId}"]`) {
        const roleId = surface.state.me.assignedRoleId;
        surface.setRoute(`#/roles/${roleId}`);
        surface.publish(state => {
          state.me.activeConsoleRoleId = state.me.seatId = roleId;
          state.seats = state.seats.map(seat => seat.id === roleId
            ? { ...seat, holderUid: surface.uid, status: 'claimed' } : seat);
          state.session.currentActorBerthAuthority.activeConsoleRoleId = roleId;
        });
      }
    };
    if (wingBayFlow) {
      const joinedOrSelected = admiral.onChoice;
      const actions = { 'Check storage': 'storage', 'Proceed with rations': 'rations',
        'Run unrest check': 'unrest', 'Run riot check': 'riot' };
      const rations = {}, consoles = [];
      let confirmation;
      admiral.onSelection = (name, value) => { rations[name === 'Food ration level' ? 'foodLevel' : 'waterLevel'] = Number(value); };
      admiral.onCheck = name => { consoles.push({ 'Fighter Bay Alpha': 'fighter-bay-alpha',
        'Fighter Bay Bravo': 'fighter-bay-bravo', 'Construction Bay': 'construction-bay' }[name]); };
      admiral.onChoice = async name => {
        if (name === 'Begin Maintenance Cycle: Cycle 1') { confirmation = 'begin'; return; }
        if (name === 'Power up reactor') { confirmation = 'reactor'; return; }
        const action = name === 'ARE YOU SURE?' ? confirmation : actions[name];
        if (!action) { await joinedOrSelected(name); return; }
        const revision = admiral.state.session.maintenanceCycles?.aegis?.revision ?? 0;
        const data = { sessionId: 'normal-session', shipId: 'aegis', action, consoleRoleId: 'admiral',
          requestId: `maintenance-${action}`, expectedRevision: revision,
          ...(action === 'rations' ? rations : {}), ...(action === 'reactor' ? { consoles } : {}) };
        for (const surface of [gm, ...members]) surface.publish(state => {
          state.session.maintenanceCycles = { aegis: { turn: 1, revision: revision + 1, step: revision + 1,
            charges: action === 'reactor' ? [...consoles] : [], refuelled: [], results: {} } };
        });
        const response = admiral.deliver('runMaintenance', data, { revision: revision + 1, step: revision + 1 });
        await onWingBayAction?.({ action, gm, wing, admiral, response });
      };
    }
  }
  await configureSurfaces?.({ gm, wing, admiral });
  const originalGmWait = gm.page.waitForResponse;
  gm.page.waitForResponse = (predicate, options) => {
    const wait = originalGmWait(predicate, options);
    gm.deliverLocal = response => { if (predicate(response)) gm.page.emit('controlled-local-reply', response); };
    return Promise.race([wait, new Promise(resolveResponse => gm.page.once('controlled-local-reply', resolveResponse))]);
  };
  const digest = value => createHash('sha256').update(value).digest('hex');
  const bindings = { sourceFiles: { controlled: 'unchanged' }, functionsSourceFiles: [['functions/src/index.ts', 'controlled']],
    compiledFiles: [['index.js', digest('controlled-index')]], functionsSourceTreeSha256: 'controlled-source' };
  bindings.compiledTreeSha256 = digest(JSON.stringify(bindings.compiledFiles));
  const launch = { sourceCommit: 'controlled-remaining-native', sourceRoot: repositoryRoot, projectId: 'demo-controlled',
    ports: { auth: 9109, firestore: 8090, functions: 5011 }, baseUrl: 'http://127.0.0.1:5173',
    functionsBuiltBeforeLaunch: true, processCwdsVerified: true, builtFunctionsSha256: digest('controlled-index'),
    compiledFiles: bindings.compiledFiles, compiledFileCount: 1, compiledTreeSha256: bindings.compiledTreeSha256,
    functionsSourceTreeSha256: bindings.functionsSourceTreeSha256,
    buildCompletedAtMs: now - 1002, runtimeStartedAtMs: now - 1000 };
  const servedEnv = { DEV: true, VITE_LOCAL_GM_ACCESS: '1', VITE_USE_EMULATORS: '1',
    VITE_FIREBASE_PROJECT_ID: launch.projectId, VITE_FIREBASE_AUTH_EMULATOR_PORT: String(launch.ports.auth),
    VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: String(launch.ports.functions),
    VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: String(launch.ports.firestore) };
  servedEnvironmentChange?.(servedEnv);
  const runtimeSource = `import.meta.env = ${JSON.stringify(servedEnv)};\n`;
  const env = { P181_SOURCE_COMMIT: launch.sourceCommit,
    P181_RUNTIME_LAUNCH_RECORD: `${directory ?? '/tmp/in-memory-remaining-native'}/in-memory-launch.json`,
    ...(cliEntry ? { P181_RUNTIME_ALLOCATED: 'yes', P181_PROOF_PROFILE: proofProfile ?? 'starlight',
      P181_SOURCE_ROOT: repositoryRoot, P181_UI_URL: launch.baseUrl, P181_PROJECT: launch.projectId,
      P181_PORTS_JSON: JSON.stringify(launch.ports),
      P181_EVIDENCE_DIRECTORY: directory ?? '/tmp/in-memory-remaining-native',
      P181_ALLOCATION_STARTED_AT_MS: String(now - 1000),
      P181_ALLOCATION_DEADLINE_MS: String(now - 1000 + 26 * 60_000) } : {}) };
  const sourceParts = p181DeadlineSource.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '')
    .replace(/import\.meta\.url/g, '__moduleUrl').split('\nif (process.argv[1]');
  assert.equal(sourceParts.length, 2, 'Retain the unique actual command-line entry block.');
  const source = sourceParts[0], cliTail = `\nif (process.argv[1]${sourceParts[1]}`;
  let resolveCliCompletion;
  const cliCompletion = new Promise(resolveCompletion => { resolveCliCompletion = resolveCompletion; });
  const cli = { argv: cliEntry ? ['/opt/local/bin/node', p181DeadlineSourcePath] : [], env, stderr: [], exitCode: undefined };
  const ownedInput = ownerInput ?? new EventEmitter();
  ownedInput.resume ??= () => ownedInput;
  ownedInput.pause ??= () => ownedInput;
  ownedInput.destroy ??= () => { ownedInput.destroyed = true; };
  const processFixture = { env, argv: cli.argv, cwd: () => repositoryRoot, stdin: ownedInput,
    stderr: { write: value => cli.stderr.push(value) } };
  Object.defineProperty(processFixture, 'exitCode', { get: () => cli.exitCode,
    set: value => { cli.exitCode = value; resolveCliCompletion(value); } });
  const context = { assert: { ...assert, deepEqual: (a, b, ...args) => assert.deepEqual(
    JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), ...args) },
    createHash, typescript, createRequire: () => { preflightAcquisitions.provider++; return name => {
      if (name === 'firebase-admin/app') return { getApps: () => [], initializeApp: () => adminApp };
      if (name === 'firebase-admin/firestore') return { getFirestore: () => db };
      if (name === 'firebase-admin/auth') return { getAuth: () => authAdmin };
      if (cliEntry && name === 'playwright') return { chromium: {} };
      throw new Error(`Unexpected controlled provider ${name}`);
    }; }, execFileSync: (_cmd, args) => args[0] === 'status' ? '' : launch.sourceCommit,
    existsSync: () => true, realpath: async () => repositoryRoot, resolve, URL, pathToFileURL, fileURLToPath,
    process: processFixture, Date: clock?.Date ?? class extends Date { static now() { return now; } },
    setTimeout: clock?.setTimeout ?? ((callback, budget) => setTimeout(() => { now += budget + 1; callback(); }, 25)),
    clearTimeout: clock?.clearTimeout ?? clearTimeout,
    delay: clock?.delay ?? (async amount => { now += Math.max(1, amount); }),
    readFile: async path => path === env.P181_RUNTIME_LAUNCH_RECORD ? JSON.stringify(launch)
      : String(path).endsWith('functions/lib/index.js') ? 'controlled-index'
      : String(path).endsWith('src/routes/Landing.tsx') && checkedLandingSource !== undefined
        ? checkedLandingSource : 'controlled-served-source',
    mkdir: directory ? mkdir : async () => {}, readdir: async () => [],
    writeFile: async (path, body, options) => {
      writes.push({ path, body, options });
      if (directory) await writeFile(path, body, options);
      await writeOutcome?.(path, body);
    },
    fetch: async url => {
      fetchedUrls.push(String(url));
      return { status: 200, url: servedSourceResponseUrl ?? String(url),
        text: async () => String(url).endsWith('/src/lib/firebaseConfig.ts') ? runtimeSource
          : String(url).endsWith('/src/routes/Landing.tsx?raw') && landingSourceBody !== undefined
            ? landingSourceBody : servedSourceBody ?? 'controlled-served-source' };
    }, AbortSignal,
    observeUiReceipt, observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt,
    createMemberNavigationResumeObserver,
    openLifecycleSettings: async surface => surface.page.getByRole('dialog', { name: 'Session settings' }),
    closeLifecycleSettings: async () => {}, observeFullGameDemoPresentationMember,
    proofRuntimeFromViteSource, validateProofRuntime, checkServedEnvironment,
    pc11GmReadiness, pc11SameActorEpoch, removePc11OwnedRootRecords, createPc11OwnedRequestTracker, recoverPc11CreatedSession,
    pc11MemberReadiness: (await import('./qualification/pc11-normal-start-adapter.mjs')).pc11MemberReadiness,
    runPc11ContractPreflight: () => ({ sourceOnly: true }), validateScoutBundle: () => {},
    rememberProofFailure, retainProofFailure: async (target, label, error, detail) => {
      privateRecords.push(originalProofError(error));
      return directory ? retainProofFailure(target, label, error, detail) : { evidenceWriteFailed: false };
    },
    __moduleUrl: new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url).href,
    __bindings: bindings,
    __factory: { launch: async label => {
      preflightAcquisitions.browser++;
      if (launchStall) return new Promise(() => {});
      const surface = label === 'normal-gm' ? gm : label === 'normal-wing-commander' ? wing : admiral;
      surface.label = label;
      const browser = { isConnected: () => !browser.closed, close: async () => {
        operations.push(`close-start:${label}`); await closeOwned?.(label);
        browser.closed = true; operations.push(`close:${label}`);
      } };
      surfaces.push(surface); browsers.push(browser); return surface;
    } },
    __coreInput: coreInput,
    __ordinaryPreparation: ordinaryPreparation,
    __wingBayFlow: wingBayFlow,
    __cliCompletion: cliCompletion,
    __options: { runtimeAllocated: 'yes', chromium: {}, ...launch, evidenceDirectory: directory ?? '/tmp/in-memory-remaining-native',
      ...(proofProfile === undefined ? {} : { proofProfile }),
      allocationStartedAtMs: now - 1000, allocationDeadlineMs: now - 1000 + 26 * 60_000 } };
  // The factory boundary supplies only controlled acquisition. The whole native
  // owner still performs empty-scope admission, request capture and cleanup.
  context.__factory.launch = ((launchSurface) => async label => {
    const surface = await launchSurface(label);
    context.__nativeBrowsers?.push(browsers.at(-1)); context.__nativeSurfaces?.push(surface);
    return surface;
  })(context.__factory.launch);
  const program = runInNewContext(`(async () => { ${source}
    captureP181SourceBindings = async () => __bindings;
    createP181StarlightNativeSurfaceFactory = ({ browsers, surfaces }) => {
      __nativeBrowsers = browsers; __nativeSurfaces = surfaces; return __factory;
    };
    if (__coreInput) {
      const originalCore = runP181StarlightMovementScoutCore;
      runP181StarlightMovementScoutCore = input => originalCore(__coreInput(input));
    }
    if (__ordinaryPreparation && !__wingBayFlow) runP181StarlightMovementScoutUiProof = input =>
      input.io.prepareNormalSession({ initial: input.initial, setup: P181_NORMAL_SETUP,
        deadlineAt: input.absoluteDeadlineMs, requiredBranches: [] });
    ${cliEntry ? `${cliTail}\nawait __cliCompletion;` : `
      try { await runP181StarlightMovementScoutNative(__options); }
      catch (error) { return error; }`}
  })()`, context, { filename: p181DeadlineSourcePath });
  return { gm, wing, admiral, surfaces, browsers, records, deletedAuth, operations, writes, privateRecords, program, preflightAcquisitions,
    cli, fetchedUrls, launch, ownerInput: ownedInput,
    allocationDeadlineAt: context.__options.allocationDeadlineMs,
    cleanupDeadlineAt: context.__options.allocationDeadlineMs - P181_NATIVE_TIMING.parentIndependentVerificationReserveMs };
}

test('Wing bay actual native owner acquires and tears down its three declared surfaces after ordinary create rejection', async () => {
  const held = await remainingNativeConsumer({ proofProfile: 'wing-bays', rejectedCreate: true });
  const first = await held.program;
  assert.ok(first, 'The original ordinary create rejection must remain primary.');
  assert.equal(held.preflightAcquisitions.browser, 3,
    'The declared native bay procedure needs three independent original surfaces before normal admission.');
  assert.deepEqual(held.surfaces.map(surface => surface.uid),
    ['native-original-gm', 'native-original-wing', 'native-original-admiral']);
  assert.equal(held.browsers.every(browser => browser.closed), true);
  assert.deepEqual(held.deletedAuth, ['native-original-gm']);
  const outcome = JSON.parse(held.writes.find(item => item.path.endsWith('p181-starlight-movement-scout.json')).body);
  assert.equal(outcome.cleanup.browsersClosed, 3);
  assert.equal(outcome.firstError.fingerprint, createHash('sha256').update(JSON.stringify({
    name: first.name, code: null, message: first.message,
  })).digest('hex'), 'The safe public fingerprint must preserve the original failure without publishing its private text.');
});

test('Wing bay actual native entry refuses an unknown proof profile before acquiring any provider or browser', async () => {
  const held = await remainingNativeConsumer({ proofProfile: 'unknown-cohort', rejectedCreate: true });
  const failure = await held.program;
  assert.match(String(failure), /profile/i);
  assert.deepEqual(held.preflightAcquisitions, { provider: 0, browser: 0 });
  assert.deepEqual(held.operations, []);
});

test('Wing bay actual normal-start consumer joins and casts both independent ordinary members before its real Cycle1 start', async () => {
  const held = await remainingNativeConsumer({ proofProfile: 'wing-bays', ordinaryPreparation: true,
    clock: remainingLifecycleClock() });
  const failure = await held.program;
  assert.equal(failure, undefined, 'The normal three-actor prefix must finish through its original UI source consumer.');
  const outcome = JSON.parse(held.writes.find(item => item.path.endsWith('p181-starlight-movement-scout.json')).body);
  assert.deepEqual(outcome.roster.map(actor => actor.roleId), ['wing-commander', 'admiral']);
  assert.equal(outcome.actualAuthActors, 3);
  assert.equal(outcome.started.cycle, 1);
  assert.deepEqual(outcome.receipts.map(receipt => receipt.endpoint),
    ['confirmSetup', 'assignRole', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial']);
  assert.equal(outcome.cleanup.browsersClosed, 3);
  assert.equal(outcome.cleanup.deletedFreshAuthIdentities, 3);
  assert.equal(outcome.cleanup.ownedMembershipPointersAbsent, true);
  assert.deepEqual([...held.records.keys()], []);
});

async function actualFiniteWingBayConsumer({ transientWingRetirement = false } = {}) {
  const mounted = actualP181NavigationMount();
  const runtimeModules = Object.fromEntries(['src/lib/shipStateProjection.ts', 'src/data/aegisConsoles.ts',
    'src/data/shipPopulation.ts'].map(path => [`/${path}`, mounted.sourceModule(resolve(repositoryRoot, path))]));
  const fixture = await remainingNativeConsumer({ proofProfile: 'wing-bays', ordinaryPreparation: true,
    wingBayFlow: true, clock: remainingLifecycleClock(),
    configureSurfaces: ({ gm, wing, admiral }) => {
      for (const surface of [gm, wing, admiral]) {
        surface.bayRuntimeModules = runtimeModules;
        Object.assign(surface.state.session, {
          fighterWingCounts: { 'fighter-wing-alpha': { count: 4, revision: 0 },
            'fighter-wing-bravo': { count: 4, revision: 0 } },
          shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
          shipResources: { aegis: { materials: 5, food: 100, water: 100, fuel: 5 } },
          shipUpgrades: { aegis: [] }, shipSurvivors: { aegis: 60 }, shipUnrest: { aegis: 0 },
        });
      }
      wing.document = mounted.document;
      // Inert provider fixture only; these bytes never become native image evidence.
      wing.page.screenshot = async () => Buffer.from('SOURCE_ONLY_INERT_SCREENSHOT_PROVIDER');
    },
    onNormalStarted: ({ wing }) => mounted.mount(wing, '/ships/aegis/roles/wing-commander'),
    onWingBayAction: async ({ action, wing, response }) => {
      if (transientWingRetirement && action === 'storage') {
        // The ordinary SDK has received this response. Keep its already
        // delivered body before the fixture publishes the transient fence.
        // Earlier evidence remains: the guard correctly stopped even sooner,
        // before the harness itself consumed this second body.
        await response.json();
        wing.publish(state => { state.sdkResumePending = true; });
        wing.publish(state => { state.sdkResumePending = false; });
      }
      await mounted.mount(wing, '/ships/aegis/roles/wing-commander');
    },
  });
  return { fixture, mounted };
}

test('Wing bay actual finite native consumer drives ordinary maintenance and reads the mounted current Wing cards', async () => {
  const { fixture, mounted } = await actualFiniteWingBayConsumer();
  try {
    const failure = await fixture.program;
    assert.equal(failure, undefined, 'The declared native branch must drive the actual finite bay IO through owned cleanup.');
    const outcome = JSON.parse(fixture.writes.find(item => item.path.endsWith('p181-starlight-movement-scout.json')).body);
    assert.equal(outcome.proofProfile, 'wing-bays');
    assert.equal(outcome.actualAuthActors, 3);
    assert.deepEqual(outcome.sourceUiReceipts.filter(receipt => receipt.endpoint === 'runMaintenance').length, 6);
    assert.deepEqual(outcome.bayAfter.cards.map(card => [card.strength, card.buildEnabled]),
      [['4 fighters // revision 0', false], ['4 fighters // revision 0', false]]);
    assert.equal(fixture.wing.choices.some(choice => choice.includes('Starlight')), false);
    assert.equal(outcome.cleanup.deletedFreshAuthIdentities, 3);
    assert.deepEqual([...fixture.records.keys()], []);
  } finally { await mounted.close(); }
});

test('Wing bay actual finite native consumer retains transient SDK retirement while consuming a delivered successful maintenance reply', async () => {
  const { fixture, mounted } = await actualFiniteWingBayConsumer({ transientWingRetirement: true });
  try {
    const failure = await fixture.program;
    assert.match(String(failure), /SDK authority|resume|authority retired/i);
    assert.equal(fixture.admiral.observedBodies.filter(receipt => receipt.endpoint === 'runMaintenance').length, 2);
    assert.equal(fixture.admiral.choices.includes('Run unrest check'), false);
    assert.equal(fixture.browsers.every(browser => browser.closed), true);
    assert.deepEqual([...fixture.records.keys()], []);
  } finally { await mounted.close(); }
});

test('Wing bay preparation preserves the unchanged two-actor normal-start prefix for the default profile', async () => {
  const held = await remainingNativeConsumer({ ordinaryPreparation: true, clock: remainingLifecycleClock() });
  assert.equal(await held.program, undefined);
  const outcome = JSON.parse(held.writes.find(item => item.path.endsWith('p181-starlight-movement-scout.json')).body);
  assert.deepEqual(outcome.roster.map(actor => actor.roleId), ['wing-commander']);
  assert.equal(outcome.actualAuthActors, 2);
  assert.equal(outcome.cleanup.browsersClosed, 2);
  assert.equal(outcome.cleanup.deletedFreshAuthIdentities, 2);
  assert.deepEqual([...held.records.keys()], []);
});

// Route regressions mount the unchanged route components, actual Zustand store,
// role data and React Router handlers. Only SDK/service boundaries and unrelated
// presentation leaves are inert. The native runner's complete consumer still
// owns all issued deadlines and cleanup; this is not native/browser evidence.
function actualP181NavigationMount() {
  const require = createRequire(import.meta.url), ts = require('typescript');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'http://127.0.0.1:5173/' });
  const globals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const React = require('react'), { createRoot } = require('react-dom/client');
  const { within, fireEvent } = require('@testing-library/dom');
  const router = require('react-router-dom'), modules = new Map(), serviceChoices = [], routes = [], clicks = [], blocked = [];
  const actualComponents = new Set(['AegisConsoleWorkspace', 'FleetConsoleWorkspace', 'FleetRoleConsoleTemplate',
    'RoleConsoleTemplate', 'ShuttleConsoleTemplate']);
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports;
    assert.ok(existsSync(path), `Mounted route fixture must read the actual dependency ${path}.`);
    const module = { exports: {} }; modules.set(path, module);
    if (!['.ts', '.tsx'].includes(extname(path))) {
      readFileSync(path); module.exports = { __esModule: true, default: path }; return module.exports;
    }
    const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const dependency = name => {
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? resolve(repositoryRoot, 'src', name.slice(2)) : resolve(dirname(path), name);
      const resolved = extname(base) ? base : ['.ts', '.tsx', '/index.ts', '/index.tsx']
        .map(suffix => base + suffix).find(existsSync);
      assert.ok(resolved, `Mounted route fixture must resolve ${name} from ${path}.`);
      if (resolved.endsWith('/lib/sessionService.ts')) return new Proxy({}, { get: (_target, action) =>
        async (...args) => { serviceChoices.push({ action, args }); } });
      if (resolved.endsWith('/lib/firestore.ts')) return {
        subscribeShipConfetti: () => () => {}, subscribeConnectedPlayers: () => () => {}, subscribeDamageDraws: () => () => {},
      };
      if (resolved.includes('/components/') && !actualComponents.has(resolved.split('/').at(-1).replace(/\.tsx?$/, '')))
        return { __esModule: true, default: ({ children }) => children ?? null };
      assert.ok(!resolved.endsWith('/lib/firebase.ts'), 'Mounted navigation may not load the real SDK.');
      return load(resolved);
    };
    runInNewContext(output, { exports: module.exports, module, require: dependency, console,
      window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
      sessionStorage: dom.window.sessionStorage, URL, Date, setTimeout, clearTimeout, queueMicrotask }, { filename: path });
    return module.exports;
  };
  const store = load(resolve(repositoryRoot, 'src/store/useSessionStore.ts')).useSessionStore;
  const components = Object.fromEntries(['RoleSelect', 'SessionMode', 'ShipConsole', 'ShipRoleSelect', 'ShuttleConsole']
    .map(name => [name, load(resolve(repositoryRoot, `src/routes/${name}.tsx`)).default]));
  const container = dom.window.document.getElementById('root'), root = createRoot(container);
  let active = false, currentRoute, navigate;
  function RouteObserver() {
    const location = router.useLocation(); navigate = router.useNavigate();
    React.useEffect(() => { currentRoute = location.pathname; routes.push(currentRoute); }, [location.pathname]);
    return null;
  }
  const element = (type, props) => React.createElement(type, props);
  const mount = async (surface, initialRoute) => {
    await React.act(async () => {
      store.getState().setIdentity(surface.state.session, surface.state.me);
      store.getState().setGmInstance(surface.state.gmInstance);
      store.getState().setMode('console');
      store.setState({ connection: surface.state.connection, sessionSnapshotFreshness: surface.state.sessionSnapshotFreshness,
        seats: surface.state.seats, gmAccessAuthenticatedAt: Date.now() });
      root.render(element(router.MemoryRouter, { initialEntries: [initialRoute], future: { v7_startTransition: true,
        v7_relativeSplatPath: true }, children: [element(RouteObserver, { key: 'observer' }), element(router.Routes,
        { key: 'routes', children: [
          element(router.Route, { key: 'gm-join', path: '/roles', element: element(components.RoleSelect) }),
          element(router.Route, { key: 'catalog', path: '/console', element: element(components.SessionMode, { mode: 'console' }) }),
          // The destination's setup widgets remain at the controlled native UI
          // boundary. No assertion claims the private GM console was painted.
          element(router.Route, { key: 'gm', path: '/gm', element: null }),
          element(router.Route, { key: 'chooser', path: '/ships/:shipId/roles', element: element(components.ShipRoleSelect) }),
          element(router.Route, { key: 'station', path: '/ships/:shipId/roles/:roleId', element: element(components.ShipConsole) }),
          element(router.Route, { key: 'shuttle', path: '/shuttles/:shuttleId', element: element(components.ShuttleConsole) }),
        ] })] }));
    });
    active = true;
  };
  const attach = surface => {
    const originalUrl = surface.page.url, originalRole = surface.page.getByRole, originalLocator = surface.page.locator;
    surface.page.url = () => active ? `http://127.0.0.1:5173/#${currentRoute}` : originalUrl();
    const locator = (find, label) => ({ first() { return this; },
      isVisible: async () => Boolean(find()),
      waitFor: async () => { if (!find()) { blocked.push(label); await new Promise(() => {}); } },
      click: async () => {
        const target = find();
        if (!target) { blocked.push(label); await new Promise(() => {}); return; }
        const before = currentRoute;
        await React.act(async () => { fireEvent.click(target); });
        clicks.push({ label, before, after: currentRoute }); surface.choices.push(label);
      },
    });
    surface.page.getByRole = (role, options) => {
      const name = options?.name;
      const navigation = role === 'link' || role === 'button' &&
        (typeof name === 'string' ? name.startsWith('Open station catalog') : name?.source?.includes('Open station catalog')) ||
        role === 'heading' && name === 'AEGIS';
      if (!active || !navigation) return originalRole(role, options);
      const match = typeof name === 'object' && name?.source ? new RegExp(name.source, name.flags) : name;
      return locator(() => within(container).queryByRole(role, { ...options, name: match }), String(name));
    };
    surface.page.locator = selector => active && selector === 'a[href$="/roles/wing-commander"]'
      ? locator(() => container.querySelector(selector), selector) : originalLocator(selector);
  };
  return { mount, attach, store, sourceModule: load, document: dom.window.document,
    routes, clicks, blocked, serviceChoices, route: () => currentRoute,
    navigate: async route => { await React.act(async () => { navigate(route); }); },
    close: async () => {
      await React.act(async () => { root.unmount(); }); dom.window.close();
      for (const [key, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
    } };
}

test('Attempt3 actual mounted post-claim GM routes reach native confirmSetup through the ordinary catalog', async () => {
  const mounted = actualP181NavigationMount(), clock = remainingLifecycleClock();
  try {
    const fixture = await remainingNativeConsumer({ clock, unclaimedWingSeat: true,
      configureSurfaces: ({ gm }) => mounted.attach(gm),
      afterGmClaim: gm => mounted.mount(gm, '/roles'),
    });
    await remainingSettleUntil(() => mounted.blocked.length || fixture.gm.choices.includes('Confirm setup // Confirm roster'),
      'mounted GM route navigation or original confirmSetup');
    if (mounted.blocked.length) clock.advanceTo(clock.now() + 35_000);
    const error = await fixture.program;
    assert.ok(fixture.gm.choices.includes('Confirm setup // Confirm roster'),
      `The complete native consumer must reach confirmSetup after actual RoleSelect -> catalog -> GM routing: ${error?.message}`);
    assert.deepEqual(mounted.routes.slice(0, 3), ['/roles', '/console', '/gm']);
    assert.equal(mounted.store.getState().mode, 'console');
    assert.match(error?.message ?? '', /assignRole: actual UI request rejected/);
    assert.equal(mounted.serviceChoices.length, 0, 'Catalog navigation may not issue a role/lease/SDK command.');
    assert.equal(fixture.gm.state.me.uid, 'native-original-gm');
    assert.equal(fixture.operations.filter(value => value === 'close:normal-gm').length, 1);
  } finally { await mounted.close(); }
});

async function actualP181WingNavigation(initialRoute) {
  const mounted = actualP181NavigationMount(), clock = remainingLifecycleClock();
  try {
    let result, settled;
    const fixture = await remainingNativeConsumer({ clock,
      configureSurfaces: async ({ wing }) => {
        wing.state.session.phase = 'active'; wing.state.session.currentTurn = 1; wing.state.session.setupConfirmed = true;
        Object.assign(wing.state.me, { assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', seatId: 'wing-commander' });
        await mounted.mount(wing, initialRoute); mounted.attach(wing);
      },
      coreInput: input => {
        // Reuse the existing source-qualified prepared-core fixture to isolate
        // navigation. The complete native-owned selector and real browser IO
        // run over mounted routes; this does not claim an end-to-end start.
        const { io } = makeConsumer({ date: clock.Date });
        const open = io.openStarlightFromWingWorkspace;
        io.openStarlightFromWingWorkspace = async (timeout, end) => {
          await input.io.openStarlightFromWingWorkspace(timeout, end);
          await input.io.openStarlightFromWingWorkspace(timeout, end);
          await open(timeout, end); result = 'actual-route-open-and-return';
        };
        io.cleanupOwnedResources = input.io.cleanupOwnedResources;
        io.retainFirstFailure = input.io.retainFirstFailure;
        return { ...completeProofInput(io), absoluteDeadlineMs: input.absoluteDeadlineMs, cleanupDeadlineMs: input.cleanupDeadlineMs };
      },
    });
    fixture.program.then(() => { settled = true; });
    await remainingSettleUntil(() => mounted.blocked.length || result || settled,
      'mounted Wing open/return, original navigation wait or actual primary failure');
    if (mounted.blocked.length) clock.advanceTo(clock.now() + 35_000);
    const error = await fixture.program;
    assert.equal(result, 'actual-route-open-and-return',
      `The native Wing selector must leave the actual viewed console, enter its assigned station, open Starlight and return: ${error?.message}`);
    assert.equal(error, undefined, 'The prepared source-only core and original native finalizer must also settle successfully.');
    assert.equal(mounted.route(), '/shuttles/starlight');
    assert.ok(mounted.clicks.some(value => value.label === 'Back to AEGIS Wing Commander console' &&
      value.before === '/shuttles/starlight' && value.after === '/ships/aegis/roles/wing-commander'));
    assert.ok(mounted.clicks.filter(value => value.label === 'Open Starlight shuttle console').length === 2);
    assert.equal(mounted.store.getState().me.uid, 'native-original-wing');
    assert.equal(mounted.store.getState().me.assignedRoleId, 'wing-commander');
    assert.equal(mounted.store.getState().me.activeConsoleRoleId, 'wing-commander');
    assert.ok(mounted.serviceChoices.every(value => value.action === 'selectConsoleRole' && value.args[0] === 'wing-commander'),
      'Viewing and navigation retain the ordinary assignment; no foreign role/GM action is issued.');
    assert.equal(fixture.operations.filter(value => value === 'close:normal-wing-commander').length, 1);
    return { routes: [...mounted.routes], clicks: [...mounted.clicks] };
  } finally { await mounted.close(); }
}

test('Attempt3 actual native Wing selector returns from the mounted viewed console via its current chooser link', async () => {
  const observed = await actualP181WingNavigation('/ships/aegis/roles/executive-officer');
  assert.deepEqual(observed.routes.slice(0, 4), ['/ships/aegis/roles/executive-officer', '/ships/aegis/roles',
    '/ships/aegis/roles/wing-commander', '/shuttles/starlight']);
});

test('Attempt3 mounted assigned Wing console and actual Starlight open/return links are valid controls', async () => {
  const observed = await actualP181WingNavigation('/ships/aegis/roles/wing-commander');
  assert.equal(observed.clicks.some(value => value.after === '/ships/aegis/roles'), false);
});

test('remaining F8-R1 full native startup uses the actual safe DTO after the original GM claim', async () => {
  const fixture = await remainingNativeConsumer({ unclaimedWingSeat: true });
  const error = await fixture.program;
  assert.ok(fixture.gm.choices.includes('Confirm setup // Confirm roster'),
    `Original held claim must authorize confirmSetup despite the safe DTO omitting claimedAt; ${error?.message}`);
  assert.match(error?.message ?? '', /assignRole: actual UI request rejected/,
    'The controlled downstream rejection remains primary after the real privileged consumer passed.');
});

test('remaining F8-R2 actual browser member actions use shared member capture and original authority', async () => {
  for (const endpoint of ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit', 'requestScout']) {
    const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
    const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
    const data = { sessionId: 'normal-session', requestId: 'member-original', shuttleId: 'starlight' };
    wing.onChoice = async () => wing.deliver(endpoint, data, { status: 'committed' });
    const io = createP181StarlightBrowserIo({ gm, wingCommander: wing, gameplay: { select: async () => wing },
      directory: '/tmp/in-memory-member-actions', initial: { sessionId: 'normal-session' }, expectedWingCommander: actor });
    const before = { control: { revision: 4, holderUidHash: actor.uidHash }, cycle: 1 };
    const call = endpoint === 'requestShuttleDeparture' ? () => io.requestDeparture('icebreaker', before, actor, 1000)
      : endpoint === 'beginShuttleTransit' ? () => io.beginTransit({}, before, actor, 1000)
      : endpoint === 'retargetShuttleTransit' ? () => io.retargetTransit({}, 'icebreaker', before, actor, 1000)
      : () => io.requestScout('1100', before, actor, 1000);
    const capture = await call();
    assert.equal(capture.httpStatus, 200); assert.equal(capture.before.uidHash, actor.uidHash);
    assert.equal(wing.choices.length, 1, `${endpoint} chooses once using the actual ordinary actor.`);
  }
});

test('remaining F8-R3 actual browser recovery rejects a foreign GM before reveal choice', async () => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('foreign-gm', { gm: true });
  const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  let issued = false;
  wing.callable = async name => ({ status: 'committed', result: name === 'listMyScoutReports'
    ? issued ? [{ requestId: 'scout-original', cycle: 1, entitlementId: 'starlight', targetCoordinate: '1100', status: 'resolved', noteId: '1'.repeat(64) }] : [] : {} });
  gm.onChoice = async () => { issued = true; gm.deliver('resolvePendingScoutRequest',
    { sessionId: 'normal-session', instanceId: 'gm-original-instance', requestId: 'scout-original' }, { status: 'resolved' }); };
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing, gameplay: { select: async () => gm },
    directory: '/tmp/in-memory-recovery', initial: { sessionId: 'normal-session' },
    started: { uidHash: createHash('sha256').update('original-gm').digest('hex').slice(0, 16),
      sessionId: 'normal-session', instanceId: 'gm-original-instance', claimedAt: gm.state.gmInstance.claimedAt },
    expectedWingCommander: actor });
  await assert.rejects(io.resolveScoutNormally({ sessionId: 'normal-session', requestId: 'scout-original', targetCoordinate: '1100', cycle: 1, entitlementId: 'starlight', anchorShipId: 'aegis', receivingShipId: 'aegis' }, 1600),
    /original.*GM|registered.*GM|Auth account|original mounted member uidHash/i);
  assert.deepEqual(gm.choices, [], 'A self-consistent foreign live GM cannot substitute for the original registration.');
});

test('remaining F6-R1 actual core bounds a stalled member read and begins one fixed-reserve cleanup', async () => {
  const { io } = makeConsumer(); let cleanupCalls = 0, suppliedDeadline;
  io.observeMember = () => new Promise(() => {});
  io.cleanupOwnedResources = async ({ deadlineAt }) => { cleanupCalls++; suppliedDeadline = deadlineAt; return { status: 'owned-cleanup-complete' }; };
  const input = { ...completeProofInput(io), absoluteDeadlineMs: Date.now() + 30, cleanupDeadlineMs: Date.now() + 150 };
  const status = await Promise.race([runP181StarlightMovementScoutUiProof(input).then(() => 'accepted', () => 'rejected'),
    new Promise(done => setTimeout(() => done('pending'), 85))]);
  assert.equal(status, 'rejected'); assert.equal(cleanupCalls, 1); assert.equal(suppliedDeadline, input.cleanupDeadlineMs);
});

test('remaining F6-R1 actual browser bounds a stalled callable result', async () => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  wing.callable = () => new Promise(() => {});
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing, gameplay: { select: async () => wing },
    directory: '/tmp/in-memory-stall', initial: { sessionId: 'normal-session' }, expectedWingCommander: actor });
  const status = await Promise.race([io.resolveScoutNormally({ requestId: 'scout-original' }, 30)
    .then(() => 'accepted', () => 'rejected'), new Promise(done => setTimeout(() => done('pending'), 85))]);
  assert.equal(status, 'rejected'); assert.deepEqual(gm.choices, []);
});

test('remaining F6-R1 full native provider scope and browser acquisition are bounded', async () => {
  for (const kind of ['scopeStall', 'launchStall']) {
    const fixture = await remainingNativeConsumer({ [kind]: true });
    const status = await Promise.race([fixture.program.then(error => error ? 'rejected' : 'accepted'),
      new Promise(done => setTimeout(() => done('pending'), 85))]);
    assert.equal(status, 'rejected', `${kind} must release work to the exact native cleanup owner.`);
    assert.equal(fixture.operations.filter(value => value === 'terminate').length, 1);
    assert.deepEqual(fixture.gm.choices, []);
  }
});

test('remaining F7-R1 full native rejected create without receipt deletes only captured fresh Auth', async () => {
  const fixture = await remainingNativeConsumer({ rejectedCreate: true, foreignState: true });
  const error = await fixture.program;
  assert.equal(error.actual, 403, 'Keep the original rejected create error as primary.');
  assert.deepEqual(fixture.deletedAuth, ['native-original-gm']);
  assert.equal(fixture.records.has('activeMemberships/foreign-uid'), true, 'Preserve foreign membership scope.');
  assert.equal(fixture.operations.filter(value => value === 'terminate').length, 1);
});

test('remaining F7-R1 full native pending or late-committed create never infers absent scope', async () => {
  for (const lateCommit of [false, true]) {
    const fixture = await remainingNativeConsumer({ pendingCreate: true, lateCommit });
    const status = await Promise.race([fixture.program.then(error => error ? 'rejected' : 'accepted'),
      new Promise(done => setTimeout(() => done('pending'), 85))]);
    assert.equal(status, 'rejected');
    if (!lateCommit) assert.deepEqual(fixture.deletedAuth, [], 'No settled rejected original response means no absent-scope teardown credit.');
    else assert.equal(fixture.records.has('sessions/normal-session'), false, 'A late commit uses exact receipt-owned session teardown.');
  }
});

test('remaining F9-R1 actual core retains held actor flight offers and earlier receipt at the failure boundary', async () => {
  const { io, state } = makeConsumer();
  const prior = io.waitForDeparture;
  io.waitForDeparture = async (...args) => { const value = await prior(...args); state.session.control.holderUidHash = 'f'.repeat(16); return value; };
  let error; try { await runP181StarlightMovementScoutUiProof(completeProofInput(io)); } catch (failure) { error = failure; }
  assert.ok(error);
  const full = originalProofError(error);
  assert.match(full.heldObservationsInspect, /requestShuttleDeparture/);
  assert.match(full.heldObservationsInspect, /holderUidHash/);
  assert.match(full.heldObservationsInspect, /departureOptions|destinations|offers/);
  assert.match(full.heldObservationsInspect, /Wing Commander|actor/);
  const directory = await mkdtemp('/tmp/p181-held-core-');
  const secondary = new Error('private secondary canary');
  rememberProofFailure(error, { secondaryCleanupFailure: secondary });
  const artifact = await retainProofFailure(directory, 'remaining-core', error);
  assert.equal((await stat(artifact.path)).mode & 0o777, 0o600);
  const bytes = await readFile(artifact.path, 'utf8');
  assert.match(bytes, /private secondary canary/); assert.match(bytes, /requestShuttleDeparture/);
});

test('remaining F4-R1 actual full core returns and persists exactly one safe observed automatic arrival receipt', async () => {
  const { io, trace } = makeConsumer();
  const directory = await mkdtemp('/tmp/p181-arrival-receipt-');
  const result = await runP181StarlightMovementScoutUiProof({ ...completeProofInput(io), evidenceDirectory: directory });
  const saved = JSON.parse(await readFile(resolve(directory, 'p181-starlight-movement-scout.json'), 'utf8'));
  for (const value of [result, saved]) {
    const arrival = value.receipts.filter(row => row.endpoint === 'completeShuttleArrival');
    assert.equal(arrival.length, 1); assert.equal(arrival[0].httpStatus, 200);
    assert.equal(arrival[0].originalActor.uidHash, original.uidHash);
    assert.equal(arrival[0].requestId, null, 'Automatic arrival producer has a transit identity, not an invented request ID.');
    assert.equal(JSON.stringify(arrival).includes('wing-uid'), false);
  }
  assert.equal(trace.filter(row => row.endpoint === 'completeShuttleArrival').length, 1);
});

async function remainingArrivalBrowser({ stalledBody = false, invalidBody = false } = {}) {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  const transit = { transitRequestId: 'transit-original', status: 'in-transit', originShipId: 'aegis',
    destinationShipId: 'shepherd', departedAt: new Date(Date.now() - 60_001).toISOString(),
    arrivesAt: new Date(Date.now() - 1).toISOString(), cycle: 1, requestId: 'departure-original',
    shuttleId: 'starlight', controlRevision: 4, revision: 2 };
  wing.publishMovement(transit);
  const responseWait = wing.page.waitForResponse;
  wing.page.waitForResponse = (predicate, options) => {
    const response = responseWait(predicate, options);
    queueMicrotask(() => wing.deliver('completeShuttleArrival', { sessionId: 'normal-session', shuttleId: 'starlight',
      transitRequestId: transit.transitRequestId, expectedControlRevision: 4 },
      { hostShipId: invalidBody ? 'foreign-ship' : 'shepherd', arrivedAt: new Date().toISOString(),
        privateCanary: 'private-held-arrival-body-canary' },
      stalledBody ? { bodyWait: () => new Promise(() => {}) } : {}));
    return response;
  };
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing, gameplay: { select: async () => wing },
    directory: '/tmp/in-memory-arrival-body', initial: { sessionId: 'normal-session' }, expectedWingCommander: actor });
  const beforeFlight = await io.observeFlight(Date.now() + 1000);
  return { wing, io, transit, beforeFlight };
}

test('remaining F6-R1 actual browser bounds the original automatic arrival response body', async () => {
  const { io, transit, wing, beforeFlight } = await remainingArrivalBrowser({ stalledBody: true });
  const status = await Promise.race([io.waitForArrivalWindow(transit, 30, Date.now() + 30, beforeFlight).then(() => 'accepted', () => 'rejected'),
    new Promise(done => setTimeout(() => done('pending'), 85))]);
  assert.equal(status, 'rejected'); assert.deepEqual(wing.choices, []);
});

test('remaining F6-R1 actual core rejects a late member tuple before the next awaited flight read', async () => {
  const { io } = makeConsumer(); let flightReads = 0;
  io.observeMember = async () => { await new Promise(done => setTimeout(done, 50)); return { ...original }; };
  io.observeFlight = async () => { flightReads++; return {}; };
  const input = { ...completeProofInput(io), absoluteDeadlineMs: Date.now() + 20, cleanupDeadlineMs: Date.now() + 150 };
  await assert.rejects(runP181StarlightMovementScoutUiProof(input));
  await new Promise(done => setTimeout(done, 65));
  assert.equal(flightReads, 0, 'After exhaustion, the delivered member is held but no later choice/read is started.');
});

test('remaining F9-R1 actual automatic arrival assertion retains the already-read response body privately', async () => {
  const { io, transit, beforeFlight } = await remainingArrivalBrowser({ invalidBody: true });
  let error; try { await io.waitForArrivalWindow(transit, 1000, Date.now() + 1000, beforeFlight); } catch (failure) { error = failure; }
  assert.match(error?.message ?? '', /Retry only/);
  assert.match(originalProofError(error).heldObservationsInspect, /private-held-arrival-body-canary/);
  const directory = await mkdtemp('/tmp/p181-held-arrival-body-');
  const artifact = await retainProofFailure(directory, 'remaining-arrival-body', error);
  assert.equal((await stat(artifact.path)).mode & 0o777, 0o600);
  assert.match(await readFile(artifact.path, 'utf8'), /private-held-arrival-body-canary/);
});

test('remaining F8-R2 member browser rejects changed SDK epoch and revoked berth before choosing', async () => {
  for (const change of ['epoch', 'berth', 'sdk', 'holder']) {
    const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
    const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
    if (change === 'epoch') wing.state.identityHydrationRevision++;
    if (change === 'berth') wing.state.session.currentActorBerthAuthority = null;
    if (change === 'sdk') wing.state.sdkResumePending = true;
    if (change === 'holder') wing.state.session.shuttleControl.starlight.holderUid = 'foreign-uid';
    const io = createP181StarlightBrowserIo({ gm, wingCommander: wing, gameplay: { select: async () => wing },
      directory: '/tmp/in-memory-member-controls', initial: { sessionId: 'normal-session' }, expectedWingCommander: actor });
    await assert.rejects(io.beginTransit({}, { control: { revision: 4, holderUidHash: actor.uidHash }, cycle: 1 }, actor, 1000));
    assert.deepEqual(wing.choices, []);
  }
});

test('remaining F6-R1 actual surface factory bounds browser acquisition before any context choice', async () => {
  const browsers = [], surfaces = []; let contexts = 0;
  const factory = createP181StarlightNativeSurfaceFactory({ chromium: { launch: () => new Promise(() => {}) },
    baseUrl: 'http://127.0.0.1:5173', ports: { auth: 9109, firestore: 8090, functions: 5011 },
    directory: '/tmp/in-memory-factory-stall', browsers, surfaces, remoteRequests: [], pageErrors: [], calls: [], requests: [] });
  const status = await Promise.race([factory.launch('normal-gm', Date.now() + 30).then(() => 'accepted', () => 'rejected'),
    new Promise(done => setTimeout(() => done('pending'), 85))]);
  assert.equal(status, 'rejected'); assert.equal(contexts, 0); assert.deepEqual(surfaces, []);
});

test('remaining F6-R1 actual browser pending coordinate choice cannot start a late SDK mutation', async () => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  const locator = wing.page.getByRole;
  wing.page.getByRole = (...args) => {
    const panel = locator(...args), getByLabel = panel.getByLabel;
    panel.getByLabel = (...labelArgs) => ({ ...getByLabel(...labelArgs), fill: async () => {
      await new Promise(done => setTimeout(done, 50));
    } });
    return panel;
  };
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing, gameplay: { select: async () => wing },
    directory: '/tmp/in-memory-late-choice', initial: { sessionId: 'normal-session' }, expectedWingCommander: actor });
  await assert.rejects(io.requestScout('1100', { cycle: 1, control: { revision: 4 } }, actor, 20), /deadline/i);
  await new Promise(done => setTimeout(done, 65));
  assert.deepEqual(wing.choices, []); assert.equal(wing.waits.length, 0);
});

test('remaining F8-R3 exact original GM recovery with fresh SDK keeps one reveal and reads the owned result', async () => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  let issued = 0;
  wing.callable = async name => ({ status: 'committed', result: name === 'listMyScoutReports'
    ? issued ? [{ requestId: 'scout-original', cycle: 1, entitlementId: 'starlight', targetCoordinate: '1100', status: 'resolved', noteId: '1'.repeat(64) }] : [] : { held: name } });
  gm.onChoice = async () => { issued++; gm.deliver('resolvePendingScoutRequest',
    { sessionId: 'normal-session', instanceId: 'gm-original-instance', requestId: 'scout-original' }, { status: 'resolved' }); };
  gm.callable = async () => ({ status: 'committed', result: [{ requestId: 'scout-original', cycle: 1,
    entitlementId: 'starlight', targetCoordinate: '1100', anchorShipId: 'aegis' }] });
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing, gameplay: { select: async () => gm },
    directory: '/tmp/in-memory-original-recovery', initial: { sessionId: 'normal-session' },
    started: { uidHash: createHash('sha256').update(gm.uid).digest('hex').slice(0, 16),
      instanceId: gm.state.gmInstance.id, claimedAt: gm.state.gmInstance.claimedAt }, expectedWingCommander: actor });
  const bundle = await io.resolveScoutNormally({ sessionId: 'normal-session', requestId: 'scout-original', targetCoordinate: '1100', cycle: 1, entitlementId: 'starlight', anchorShipId: 'aegis', receivingShipId: 'aegis' }, 2000);
  assert.equal(issued, 1); assert.equal(bundle.result.held, 'readPrivateScoutResult');
  assert.equal(bundle.note.held, 'readMyScoutDiscoveryNote');
});

test('remaining F6-R1 actual surface factory owns and closes a late browser without creating its context', async () => {
  let contexts = 0, closed = false;
  const page = new EventEmitter(); page.setDefaultTimeout = () => {}; page.setDefaultNavigationTimeout = () => {};
  const browser = { isConnected: () => !closed, close: async () => { closed = true; },
    newContext: async () => { contexts++; return { route: async () => {}, newPage: async () => page }; } };
  const browsers = [], surfaces = [];
  const factory = createP181StarlightNativeSurfaceFactory({ chromium: { launch: async () => {
    await new Promise(done => setTimeout(done, 50)); return browser;
  } }, baseUrl: 'http://127.0.0.1:5173', ports: { auth: 9109, firestore: 8090, functions: 5011 },
    directory: '/tmp/in-memory-late-factory', browsers, surfaces, remoteRequests: [], pageErrors: [], calls: [], requests: [],
    cleanupDeadlineAt: Date.now() + 180 });
  await assert.rejects(factory.launch('normal-gm', Date.now() + 20), /deadline/i);
  await new Promise(done => setTimeout(done, 65));
  assert.equal(browsers.length, 1); assert.equal(closed, true); assert.equal(contexts, 0); assert.deepEqual(surfaces, []);
});

test('remaining F9-R1 full native rejected-create failure retains its already-read private body', async () => {
  const fixture = await remainingNativeConsumer({ rejectedCreate: true });
  const error = await fixture.program;
  assert.equal(error.actual, 403);
  assert.ok(fixture.privateRecords.length >= 1);
  assert.match(fixture.privateRecords.at(-1).heldObservationsInspect, /ordinary rejected create/,
    'Native catch must attach the original body read before rejecting the actual response.');
  const publicOutput = fixture.writes.find(value => value.path.endsWith('/p181-starlight-movement-scout.json'));
  assert.ok(publicOutput); assert.equal(publicOutput.body.includes('ordinary rejected create'), false);
});

// Deterministic source-only time: no system, product or runtime clock changes.
// Actual producer timestamps and every original consumer cutoff share this one
// explicit clock. The scheduler delivers the consumer's original timers.
function remainingLifecycleClock() {
  let now = Date.now(), nextId = 0;
  const timers = new Map(), budgets = [];
  const advanceTo = end => {
    assert.ok(end >= now);
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = end;
  };
  return { now: () => now, advanceTo, timers, budgets,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    setTimeout: (callback, budget) => {
      const id = ++nextId; budgets.push(budget);
      timers.set(id, { at: now + budget, callback }); return id;
    },
    clearTimeout: id => timers.delete(id),
    delay: async amount => { advanceTo(now + amount); },
  };
}

function remainingActualModule(clock) {
  const source = p181DeadlineSource.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '')
    .replace(/import\.meta\.url/g, '__moduleUrl').split('\nif (process.argv[1]')[0];
  return runInNewContext(`(() => { ${source}
    return { runP181StarlightMovementScoutUiProof, createP181StarlightBrowserIo };
  })()`, { assert: { ...assert, deepEqual: (a, b, ...args) => assert.deepEqual(
    JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), ...args) },
    createHash, Date: clock.Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    delay: clock.delay, mkdir, writeFile, resolve, URL,
    observeUiReceipt, observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt,
    observeFullGameDemoPresentationMember, pc11GmReadiness, pc11SameActorEpoch, validateScoutBundle,
    pc11MemberReadiness: pc11MemberReadinessForRemaining,
    rememberProofFailure, retainProofFailure,
    __moduleUrl: new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url).href,
  }, { filename: p181DeadlineSourcePath });
}
const { pc11MemberReadiness: pc11MemberReadinessForRemaining } = await import('./qualification/pc11-normal-start-adapter.mjs');

async function remainingOriginalTimerProducer(clock) {
  // Evaluate complete unchanged pure producer files in memory. This does not
  // build Functions, load the runtime entry, or call a provider.
  const ts = createRequire(import.meta.url)('typescript');
  const modules = new Map();
  for (const name of ['turnZero', 'turnInterstitial']) {
    const source = await readFile(resolve(repositoryRoot, `functions/src/${name}.ts`), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const module = { exports: {} };
    runInNewContext(output, { exports: module.exports, module, Date: clock.Date,
      require: name => { assert.equal(name, './turnZero'); return modules.get('turnZero'); } },
    { filename: `functions/src/${name}.ts` });
    modules.set(name, module.exports);
  }
  return { ...modules.get('turnZero'), ...modules.get('turnInterstitial') };
}

async function remainingNaturalTimerConsumer({ proofRemainingMs = 15 * 60_000, latePoll = false } = {}) {
  const clock = remainingLifecycleClock(), producer = await remainingOriginalTimerProducer(clock);
  const phaseStart = clock.now(), startedPhase = producer.startTurnPhase(1);
  const held = producer.holdTurnAdvancePhase(startedPhase, phaseStart);
  const phase = producer.clearHeldTurnAdvancePhase(held, 1, held.timerPause.pausedAt, clock.now());
  assert.equal(held.timerPause.remainingMs, 600_000);
  assert.equal(Date.parse(phase.teamPhaseEndsAt) - phaseStart, 600_000);
  assert.equal(phase.progression, undefined); assert.equal(phase.timerPause, undefined);
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  wing.state.session.turnPhase = phase;
  wing.state.turnState = producer.turnStateForPhase(phase, 6, 1, new clock.Date(phaseStart).toISOString());
  const actor = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  const { io, state, trace } = makeConsumer({ date: clock.Date });
  state.session.airspace = 'restricted'; state.session.turnStatePhase = 'team';
  const pollBudgets = [], projectionStates = [];
  const originalEvaluate = wing.page.evaluate;
  let reads = 0;
  wing.page.evaluate = async (...args) => {
    reads++;
    pollBudgets.push(Math.min(...[...clock.timers.values()].map(timer => timer.at - clock.now())));
    if (latePoll && reads === 1) await clock.delay(60_000);
    // Only the controlled server projection boundary changes state, after the
    // unchanged producer's exact natural deadline. No timer/phase override or
    // gameplay command is issued by the P181 consumer.
    if (producer.turnPhaseDeadlinePassed(phase, 'team') && wing.state.session.turnPhase.airspace.state !== 'lifted') {
      wing.state.session.turnPhase = { ...phase, airspace: { ...phase.airspace, state: 'lifted', tickerActive: true } };
      wing.state.turnState = producer.updateTurnStateForPhase(wing.state.session.turnPhase, wing.state.turnState);
      state.session.airspace = 'lifted'; state.session.turnStatePhase = 'coordination';
    }
    projectionStates.push(wing.state.session.turnPhase.airspace.state);
    return originalEvaluate(...args);
  };
  const consumer = remainingActualModule(clock);
  const browserIo = consumer.createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async () => wing }, directory: '/tmp/in-memory-natural-timer',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: actor });
  let issuedWaitEnd;
  io.waitForLiftedAirspace = end => {
    issuedWaitEnd = end; browserIo.absoluteDeadlineAt = end;
    browserIo.expectedWingCommander = actor;
    return browserIo.waitForLiftedAirspace(end);
  };
  const proofEnd = phaseStart + proofRemainingMs;
  let result, error;
  try { result = await consumer.runP181StarlightMovementScoutUiProof({ ...completeProofInput(io),
    absoluteDeadlineMs: proofEnd }); } catch (failure) { error = failure; }
  return { clock, producer, phase, phaseStart, proofEnd, issuedWaitEnd,
    result, error, trace, pollBudgets, projectionStates };
}

test('remaining F6-R2 actual core and browser wait through the unchanged ten-minute producer schedule', async () => {
  const observed = await remainingNaturalTimerConsumer();
  assert.equal(observed.error, undefined,
    `Actual natural wait was truncated: original phase600000ms, allocated${observed.issuedWaitEnd - observed.phaseStart}ms, ${observed.error?.message}`);
  assert.equal(observed.issuedWaitEnd, observed.proofEnd, 'Retain the original lifecycle proof stop.');
  assert.ok(observed.clock.now() >= Date.parse(observed.phase.teamPhaseEndsAt));
  assert.equal(observed.result.movement.status, 'observed');
  assert.equal(observed.projectionStates[0], 'restricted');
  assert.ok(observed.projectionStates.includes('lifted'));
  assert.ok(observed.pollBudgets.every(budget => budget > 0 && budget <= 60_000),
    'Every actual member/source observation retains an individual finite budget.');
});

test('remaining F6-R2 exhausted original lifecycle rejects restricted airspace without a later choice', async () => {
  const observed = await remainingNaturalTimerConsumer({ proofRemainingMs: 500 });
  assert.ok(observed.error); assert.equal(observed.issuedWaitEnd, observed.proofEnd);
  assert.equal(observed.clock.now(), observed.proofEnd);
  assert.ok(observed.projectionStates.every(state => state === 'restricted'));
  assert.deepEqual(observed.trace, []);
});

test('remaining F6-R2 a member poll delivered at its individual cutoff cannot authorize the natural wait', async () => {
  const observed = await remainingNaturalTimerConsumer({ latePoll: true });
  assert.ok(observed.error); assert.deepEqual(observed.trace, []);
  assert.ok(observed.clock.now() < Date.parse(observed.phase.teamPhaseEndsAt));
  assert.ok(observed.pollBudgets[0] <= 60_000);
});

test('remaining F6-R2 proof-stop equality denies the actual core before any source observation', async () => {
  const clock = remainingLifecycleClock(), module = remainingActualModule(clock), { io, trace } = makeConsumer();
  let reads = 0; io.observeMember = async () => { reads++; return original; };
  await assert.rejects(module.runP181StarlightMovementScoutUiProof({ ...completeProofInput(io), absoluteDeadlineMs: clock.now() }));
  assert.equal(reads, 0); assert.deepEqual(trace, []);
});

const remainingDeferred = () => {
  let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve };
};
async function remainingSettleUntil(predicate, label) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (predicate()) return;
    await new Promise(done => setTimeout(done, 1));
  }
  assert.ok(predicate(), `Controlled source fixture did not reach ${label}.`);
}

test('remaining F6-R3 actual UI wrapper and full native finalizer settle one original cleanup after60s', async () => {
  const clock = remainingLifecycleClock(), close = remainingDeferred(), terminate = remainingDeferred();
  let closeStarted = false, terminateStarted = false, returned = false;
  const fixture = await remainingNativeConsumer({ clock,
    coreInput: input => {
      // Isolate the cleanup seam with a complete prepared core input; the real
      // core itself rejects the actual stale SDK tuple. Native create/admission,
      // the UI wrapper and the complete finalizer remain original source.
      clock.advanceTo(input.absoluteDeadlineMs - 1);
      const { io, state } = makeConsumer(); state.actor.sdkHasServerAuthority = false;
      io.cleanupOwnedResources = input.io.cleanupOwnedResources;
      if (input.io.retainFirstFailure) io.retainFirstFailure = input.io.retainFirstFailure;
      return { ...completeProofInput(io), absoluteDeadlineMs: input.absoluteDeadlineMs };
    },
    closeOwned: async label => { if (label === 'normal-gm') { closeStarted = true; await close.promise; } },
    terminateOwned: async () => { terminateStarted = true; await terminate.promise; },
  });
  fixture.program.then(() => { returned = true; });
  await remainingSettleUntil(() => closeStarted, 'original owned browser close');
  const cleanupStartedAt = clock.now();
  assert.equal(fixture.cleanupDeadlineAt - cleanupStartedAt, 120_001);
  clock.advanceTo(cleanupStartedAt + 55_000); close.resolve();
  await remainingSettleUntil(() => terminateStarted, 'original provider teardown');
  clock.advanceTo(cleanupStartedAt + 65_000);
  await new Promise(done => setTimeout(done, 5));
  const returnedWhileOwnedWorkPending = returned;
  clock.advanceTo(cleanupStartedAt + 75_000); terminate.resolve();
  const error = await fixture.program;
  await new Promise(done => setTimeout(done, 5));
  assert.equal(returnedWhileOwnedWorkPending, false,
    'The actual wrapper/finalizer returned while the already-issued owned cleanup Promise was pending.');
  assert.match(error.message, /original live Wing Commander/);
  assert.equal(fixture.operations.filter(value => value === 'close-start:normal-gm').length, 1);
  assert.equal(fixture.operations.filter(value => value === 'terminate').length, 1);
  const outcome = JSON.parse(fixture.writes.find(value => value.path.endsWith('p181-starlight-movement-scout.json')).body);
  assert.equal(outcome.cleanup.status, 'owned-cleanup-complete');
});

test('remaining F9-R2 full native retains private first body before slow cleanup and writes final qualification', async () => {
  const clock = remainingLifecycleClock(), terminate = remainingDeferred();
  const directory = await mkdtemp('/tmp/p181-remaining-finalizer-private-');
  let terminateStarted = false;
  const canary = 'PRIVATE_ALREADY_READ_F9_R2_BODY';
  const fixture = await remainingNativeConsumer({ clock, directory, rejectedCreate: true,
    rejectedMessage: `ordinary rejected create ${canary}`,
    terminateOwned: async () => { terminateStarted = true; await terminate.promise; },
  });
  await remainingSettleUntil(() => terminateStarted, 'original slow owned teardown');
  const earlyFiles = (await readdir(directory)).filter(name => name.startsWith('original-failure-'));
  const earlyBytes = await Promise.all(earlyFiles.map(name => readFile(resolve(directory, name), 'utf8')));
  clock.advanceTo(fixture.cleanupDeadlineAt); terminate.resolve();
  const error = await fixture.program;
  assert.equal(error.actual, 403, 'Keep the original rejected response as primary.');
  assert.ok(earlyFiles.length > 0, 'The actual private writer was starved until after cleanup exhausted its cutoff.');
  assert.ok(earlyBytes.some(body => body.includes(canary)), 'Freeze the already-read original body before teardown.');
  for (let index = 0; index < earlyFiles.length; index++) {
    const path = resolve(directory, earlyFiles[index]);
    assert.equal(await readFile(path, 'utf8'), earlyBytes[index], 'The original failure artifact is immutable.');
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
  const privateFiles = (await readdir(directory)).filter(name => name.startsWith('original-failure-'));
  assert.ok(privateFiles.length >= 2, 'Retain secondary cleanup qualification in a separate immutable private record.');
  const privateBodies = await Promise.all(privateFiles.map(name => readFile(resolve(directory, name), 'utf8')));
  assert.ok(privateBodies.some(body => body.includes('secondaryCleanupFailure')));
  const outcomePath = resolve(directory, 'p181-starlight-movement-scout.json');
  const publicBody = await readFile(outcomePath, 'utf8'), outcome = JSON.parse(publicBody);
  assert.equal(publicBody.includes(canary), false); assert.equal(publicBody.includes('native-original-gm'), false);
  assert.equal((await stat(outcomePath)).mode & 0o777, 0o600);
  assert.equal(outcome.status, 'P181_STOPPED_FIRST_FAILURE'); assert.equal(outcome.cleanup.status, 'failed');
  assert.equal(outcome.finalization.allocationDeadlineAt, fixture.allocationDeadlineAt);
  assert.equal(outcome.finalization.parentVerificationRemainingMs, 120_000);
  assert.equal(fixture.operations.filter(value => value === 'terminate').length, 1);
});

test('remaining F9-R2 original total-end equality denies final bookkeeping without renewing cleanup', async () => {
  const clock = remainingLifecycleClock(), terminate = remainingDeferred(); let terminateStarted = false;
  const fixture = await remainingNativeConsumer({ clock, rejectedCreate: true,
    terminateOwned: async () => { terminateStarted = true; await terminate.promise; } });
  await remainingSettleUntil(() => terminateStarted, 'original teardown at the parent boundary');
  clock.advanceTo(fixture.allocationDeadlineAt); terminate.resolve();
  const error = await fixture.program;
  assert.equal(error.actual, 403); assert.equal(fixture.writes.length, 0);
  assert.equal(clock.now(), fixture.allocationDeadlineAt);
  assert.equal(fixture.operations.filter(value => value === 'terminate').length, 1);
});

test('remaining F9-R2 full native rejects a final writer delivered at the original total-end equality', async () => {
  const clock = remainingLifecycleClock();
  const directory = await mkdtemp('/tmp/p181-remaining-finalizer-late-');
  let fixture;
  fixture = await remainingNativeConsumer({ clock, directory, rejectedCreate: true,
    writeOutcome: async () => { clock.advanceTo(fixture.allocationDeadlineAt); } });
  const error = await fixture.program;
  assert.equal(error.actual, 403);
  assert.ok(originalProofError(error).heldObservationsInspect.includes('secondaryFinalOutputWriteFailure'));
  assert.equal(clock.now(), fixture.allocationDeadlineAt);
  assert.equal(fixture.writes.length, 1, 'The observed late disk write does not authorize later bookkeeping.');
});

// Whole existing native API/CLI, real read-only source/build bytes and the
// unchanged private writer. External acquisition functions are counted and
// forbidden. A binding rejection is an actual assertion, never an injected
// exception. Virtual time affects this isolated source fixture only.
// The default retains the historical lost-receipt dependency. An explicitly
// supplied current verified binding exercises the same actual sourceOnly
// assertions; it never recreates that receipt or changes its historical result.
const preflightBuildBindingPath = process.env.P181_SOURCE_TEST_BUILD_BINDING_PATH ??
  '/tmp/dow-pc10-evidence/OWNER_PC10_P181_CCE72456_EXACT_COMPLETE_BUILD_BINDING_20261010.json';
const preflightBuildBindingSha256 = process.env.P181_SOURCE_TEST_BUILD_BINDING_SHA256 ??
  '73387acf1548ee9f41269afa0ec79401678c0de7f95ced7c0834f874273b3779';
function p181CommittedPublicFirebaseEnvironment() {
  const source = readFileSync(resolve(repositoryRoot, 'src/lib/firebaseConfig.ts'), 'utf8');
  const committed = source.match(/const committed = \{([\s\S]+?)\} satisfies FirebaseOptions;/)[1];
  const value = key => committed.match(new RegExp(`${key}:\\s*'([^']+)'`))[1];
  return { VITE_FIREBASE_API_KEY: value('apiKey'), VITE_FIREBASE_AUTH_DOMAIN: value('authDomain'),
    VITE_FIREBASE_STORAGE_BUCKET: value('storageBucket'), VITE_FIREBASE_MESSAGING_SENDER_ID: value('messagingSenderId'),
    VITE_FIREBASE_APP_ID: value('appId'), VITE_APP_CHECK_SITE_KEY: source.match(/const committedAppCheckSiteKey = '([^']+)'/)[1] };
}
function p181ReferencePlannedLaunch(sourceCommit, evidenceDirectory = '/tmp/p181-launch-reference', start = Date.now()) {
  const slot = 5, projectId = 'demo-pc10-p181-source-plan', ports = emulatorPortsForSlot(slot);
  const baseUrl = `http://127.0.0.1:${vitePortForSlot(slot)}`;
  const coordinationFile = coordinationFilePath();
  const nodeEnvironment = { HOME: process.env.HOME, PATH: process.env.PATH ?? '',
    ...(process.env.XDG_CONFIG_HOME === undefined ? {} : { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME }),
    ...(process.env.TMPDIR === undefined ? {} : { TMPDIR: process.env.TMPDIR }),
    CI: '', NODE_OPTIONS: '', NODE_PATH: '', TICKER_SMOKE_CACHE_DIR: '', BROWSER: '', BROWSER_ARGS: '', DEBUG: '',
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${ports.firestore}`, FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${ports.auth}`,
    NO_UPDATE_NOTIFIER: '1', CODEX_COORDINATION_FILE: coordinationFile, DOW_EMULATOR_COORDINATION_FILE: coordinationFile };
  const publicDefaults = p181CommittedPublicFirebaseEnvironment();
  const viteEnv = { ...nodeEnvironment, ...publicDefaults, ...emulatorEnvironmentForSlot(slot), VITE_FIREBASE_PROJECT_ID: projectId,
    VITE_LOCAL_GM_ACCESS: '1', NODE_ENV: 'development' };
  const runtimeLaunchRecord = resolve(evidenceDirectory, 'reference-launch.json');
  const allocationStartedAtMs = start, allocationDeadlineMs = start + P181_NATIVE_TIMING.totalAllocationMs;
  const command = (argv, env = {}) => ({ node: process.execPath, argv, cwd: repositoryRoot, env: { ...nodeEnvironment, ...env } });
  const firebaseAliasPath = (process.env.PATH ?? '').split(':').filter(Boolean)
    .map(path => resolve(path, 'firebase')).find(existsSync);
  return { schemaVersion: 1, referenceInterval: true, sourceRoot: repositoryRoot, sourceCommit,
    slot, projectId, baseUrl, ports, evidenceDirectory, runtimeLaunchRecord,
    allocationStartedAtMs, allocationDeadlineMs, firebaseAliasPath, coordinationFile,
    expectedServedEnvironment: { ...publicDefaults, ...emulatorEnvironmentForSlot(slot), VITE_FIREBASE_PROJECT_ID: projectId,
      VITE_LOCAL_GM_ACCESS: '1', DEV: true },
    commands: {
      configure: command(['scripts/configure-emulator-slot.mjs', String(slot)]),
      emulators: command(['scripts/run-emulator-command.mjs', 'start', '--project', projectId, '--only', 'auth,functions,firestore'],
        { ...nodeEnvironment, FIREBASE_DEBUG_PATH: resolve(evidenceDirectory, 'firebase-debug.log'),
          DOW_FIREBASE_EMULATOR_LOG_DIRECTORY: evidenceDirectory }),
      vite: command(['scripts/run-emulator-command.mjs', 'vite', '--host', '127.0.0.1', '--strictPort'], viteEnv),
      proof: command(['scripts/pc10-starlight-movement-scout-ui-proof.mjs'], {
        P181_RUNTIME_ALLOCATED: 'yes', P181_SOURCE_ROOT: repositoryRoot, P181_SOURCE_COMMIT: sourceCommit,
        P181_PROJECT: projectId, P181_UI_URL: baseUrl,
        P181_PORTS_JSON: JSON.stringify({ auth: ports.auth, functions: ports.functions, firestore: ports.firestore }),
        P181_EVIDENCE_DIRECTORY: evidenceDirectory, P181_RUNTIME_LAUNCH_RECORD: runtimeLaunchRecord,
        P181_ALLOCATION_STARTED_AT_MS: String(allocationStartedAtMs), P181_ALLOCATION_DEADLINE_MS: String(allocationDeadlineMs),
      }),
    } };
}
async function actualPreNativeConsumer({ cli = false, sourceOnly = false, sourceCommit,
  deadlineOffset = 60_000, alterRead, missingRead, exhaustAfterRead, exhaustOnBindingFailure = false,
  evidenceDirectory, plannedLaunchChange, omitPlannedLaunch = false, inheritedEnvironment = {},
  changeCandidateTrackedPaths, virtualInputs = {} } = {}) {
  const issuedAt = Date.now(); let now = issuedAt, firstAssertion;
  const sourceOnlyDeadlineMs = issuedAt + deadlineOffset;
  const directory = evidenceDirectory ?? await mkdtemp('/tmp/p181-pre-native-');
  const counters = { fetch: 0, provider: 0, browser: 0, contract: 0, writer: 0,
    configuration: 0, reservation: 0, runtimeLaunch: 0, installedMetadata: 0 };
  const stderr = [];
  const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const expectedCommit = sourceCommit ?? (cli ? 'PRIVATE-p181-source-binding-canary' : currentCommit);
  const plannedLaunch = p181ReferencePlannedLaunch(currentCommit, directory, issuedAt);
  plannedLaunchChange?.(plannedLaunch);
  const env = { HOME: process.env.HOME, PATH: process.env.PATH ?? '',
    ...(process.env.XDG_CONFIG_HOME === undefined ? {} : { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME }),
    ...(process.env.TMPDIR === undefined ? {} : { TMPDIR: process.env.TMPDIR }),
    ...inheritedEnvironment, P181_SOURCE_ROOT: repositoryRoot, P181_SOURCE_COMMIT: expectedCommit,
    P181_RUNTIME_ALLOCATED: cli ? 'yes' : undefined,
    P181_UI_URL: 'http://127.0.0.1:5173', P181_PROJECT: 'demo-controlled',
    P181_PORTS_JSON: JSON.stringify({ auth: 9109, firestore: 8090, functions: 5011 }),
    P181_EVIDENCE_DIRECTORY: directory,
    P181_ALLOCATION_STARTED_AT_MS: String(issuedAt - 1000),
    P181_ALLOCATION_DEADLINE_MS: String(issuedAt - 1000 + P181_NATIVE_TIMING.totalAllocationMs) };
  const processFixture = { env, execPath: process.execPath, argv: cli ? [process.execPath, p181DeadlineSourcePath] : [],
    cwd: () => repositoryRoot, stderr: { write: value => stderr.push(value) } };
  const context = { assert: { ...assert,
    equal: (...args) => {
      try { return assert.equal(...args); }
      catch (error) {
        firstAssertion ??= error;
        if (exhaustOnBindingFailure) now = issuedAt + 60_000;
        throw error;
      }
    }, deepEqual: (a, b, ...args) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), ...args) },
    createHash, existsSync, realpath, resolve, URL, fileURLToPath, pathToFileURL, process: processFixture,
    execFileSync: (command, args, options) => {
      if (command !== 'git') {
        counters.runtimeLaunch++;
        if (args[0]?.endsWith('configure-emulator-slot.mjs')) counters.configuration++;
        assert.fail('Source preflight cannot execute a runtime/configuration command.');
      }
      // The controlled API fixture represents the committed checkpoint while
      // its new test is staged; the final source-only command uses real status.
      if (args[0] === 'status') return '';
      const output = execFileSync(command, args, options);
      if (args[0] === 'ls-files' && resolve(options.cwd) === resolve(repositoryRoot) && changeCandidateTrackedPaths) {
        return `${changeCandidateTrackedPaths(output.split('\0').filter(Boolean)).sort().join('\0')}\0`;
      }
      return output;
    },
    Date: class extends Date { static now() { return now; } }, setTimeout, clearTimeout,
    mkdir, readdir, writeFile,
    readFile: async (path, encoding) => {
      const name = String(path);
      const value = Object.hasOwn(virtualInputs, name) && !missingRead?.(name)
        ? encoding ? String(virtualInputs[name]) : Buffer.from(virtualInputs[name])
        : await readFile(missingRead?.(name) ? '/tmp/p181-missing-source-input-does-not-exist' : path, encoding);
      if (exhaustAfterRead?.(name)) now = sourceOnlyDeadlineMs;
      return alterRead?.(name, value) ?? value;
    },
    runPc11ContractPreflight: root => { counters.contract++; return runPc11ContractPreflight(root); },
    checkServedEnvironment, localGmAccessConfiguration, emulatorEnvironmentForSlot, emulatorPortsForSlot, vitePortForSlot,
    coordinationFilePath,
    resolveFirebaseToolsInvocation: async (...args) => { counters.installedMetadata++; return resolveFirebaseToolsInvocation(...args); },
    reserveEmulatorSlot: () => { counters.reservation++; assert.fail('Source preflight cannot reserve a row.'); },
    spawn: () => { counters.runtimeLaunch++; assert.fail('Source preflight cannot spawn runtime.'); },
    rememberProofFailure, retainProofFailure: async (...args) => { counters.writer++; return retainProofFailure(...args); },
    createRequire: () => { counters.provider++; assert.fail('Source preflight cannot acquire a provider.'); },
    fetch: () => { counters.fetch++; assert.fail('Source preflight cannot fetch.'); },
    createP181StarlightNativeSurfaceFactory: () => { counters.browser++; assert.fail('Source preflight cannot acquire a browser.'); },
    __moduleUrl: pathToFileURL(p181DeadlineSourcePath).href,
    __options: { sourceOnly, sourceRoot: repositoryRoot, sourceCommit: expectedCommit,
      sourceOnlyDeadlineMs, buildBindingPath: preflightBuildBindingPath,
      buildBindingSha256: preflightBuildBindingSha256,
      ...(omitPlannedLaunch ? {} : { plannedLaunch }) } };
  const source = p181DeadlineSource.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '')
    .replace(/import\.meta\.url/g, '__moduleUrl');
  let result, error;
  if (cli) await runInNewContext(source, context, { filename: p181DeadlineSourcePath });
  else {
    try { result = await runInNewContext(`(async () => { ${source}\nreturn runP181StarlightMovementScoutNative(__options); })()`, context,
      { filename: p181DeadlineSourcePath }); }
    catch (failure) { error = failure; }
  }
  return { result, error, firstAssertion, stderr: stderr.join(''), counters, processFixture,
    directory, sourceOnlyDeadlineMs, now, currentCommit, plannedLaunch };
}

function assertPreflightInert(fixture) {
  assert.equal(fixture.counters.fetch, 0); assert.equal(fixture.counters.provider, 0);
  assert.equal(fixture.counters.browser, 0);
  assert.equal(fixture.counters.configuration, 0); assert.equal(fixture.counters.reservation, 0);
  assert.equal(fixture.counters.runtimeLaunch, 0);
}

for (const [representation, wire] of [
  ['raw bytes', 'controlled-served-source'],
  ['JSON string literal', 'export default "controlled-served-source";\n'],
  ['static template literal', 'export default `controlled-served-source`;\n//# sourceMappingURL=data:application/json;base64,e30='],
]) test(`decoded source gate accepts exact ${representation} before the three normal actors`, async () => {
    const held = await remainingNativeConsumer({ proofProfile: 'wing-bays', rejectedCreate: true, servedSourceBody: wire });
    const failure = await held.program;
    assert.equal(held.preflightAcquisitions.browser, 3,
      `The actual native source gate must decode exact literal bytes before the existing ordinary flow: ${String(failure)}`);
    assert.equal(held.browsers.every(browser => browser.closed), true);
    assert.equal(held.writes.some(item => item.path.endsWith('p181-pre-browser-failure-phase.json')), false);
});

test('decoded source gate refuses changed literals and executable envelopes before any provider or browser', async () => {
  for (const wire of ['export default "changed-source";', 'export default `changed-source`;',
    'export default `controlled-${unknown}`;', 'export default (() => "controlled-served-source")();',
    'export default "controlled-served-source"; globalThis.untrusted = true;',
    'export { value as default };', 'export = "controlled-served-source";', 'export default "unterminated']) {
    const held = await remainingNativeConsumer({ proofProfile: 'wing-bays', rejectedCreate: true, servedSourceBody: wire });
    const failure = await held.program;
    assert.ok(failure);
    assert.deepEqual(held.preflightAcquisitions, { provider: 0, browser: 0 });
  }
});

test('decoded source gate refuses a foreign response URL even when the returned source text matches', async () => {
  const held = await remainingNativeConsumer({ proofProfile: 'wing-bays', rejectedCreate: true,
    servedSourceResponseUrl: 'http://foreign.invalid/src/routes/Landing.tsx?raw' });
  const failure = await held.program;
  assert.ok(failure);
  assert.equal(held.preflightAcquisitions.browser, 0,
    'A matching body cannot authorize a different served source origin.');
});

test('pre-browser source failure emits a distinct bound terminal phase without inventing native cleanup', async () => {
  const held = await remainingNativeConsumer({ proofProfile: 'wing-bays', rejectedCreate: true,
    servedSourceBody: 'export default "changed-source";' });
  const failure = await held.program;
  assert.ok(failure);
  assert.deepEqual(held.preflightAcquisitions, { provider: 0, browser: 0 });
  const phaseWrite = held.writes.find(item => item.path.endsWith('p181-pre-browser-failure-phase.json'));
  assert.ok(phaseWrite, 'The actual failure transition must retain positive evidence before actors ever existed.');
  const phase = JSON.parse(phaseWrite.body);
  assert.equal(phase.phase, 'pre-browser-failed');
  assert.equal(phase.browserAcquisitionStarted, false);
  assert.equal(phase.actualAuthActors, 0);
  assert.equal(phase.actualBrowserProcesses, 0);
  assert.equal(phase.sourceCommit, 'controlled-remaining-native');
  assert.equal(phase.projectId, 'demo-controlled');
  assert.equal(phase.allocationDeadlineAt, held.allocationDeadlineAt);
  assert.match(phase.runtimeLaunchRecordSha256, /^[a-f0-9]{64}$/);
  assert.equal(phase.originalError.fingerprint, createHash('sha256').update(JSON.stringify({
    name: failure.name, code: failure.code ?? null, message: failure.message,
  })).digest('hex'));
  assert.equal(held.writes.some(item => item.path.endsWith('p181-starlight-movement-scout.json')), false,
    'Service-only failure is phase evidence, not a manufactured actor cleanup PASS.');
});

test('a reached browser acquisition retains the original native cleanup barrier and three-actor accounting', async () => {
  const held = await remainingNativeConsumer({ proofProfile: 'wing-bays', rejectedCreate: true });
  await held.program;
  assert.equal(held.preflightAcquisitions.browser, 3);
  assert.equal(held.writes.some(item => item.path.endsWith('p181-pre-browser-failure-phase.json')), false);
  const nativeWrite = held.writes.find(item => item.path.endsWith('p181-starlight-movement-scout.json'));
  assert.ok(nativeWrite);
  const outcome = JSON.parse(nativeWrite.body);
  assert.equal(outcome.actualBrowserProcesses, 3);
  assert.equal(outcome.cleanup.browsersClosed, 3);
  assert.equal(held.browsers.every(browser => browser.closed), true);
});

// Preserve the actual earlier Landing ?raw response as inert compressed data.
// Its inline map contains the historical checkout path; neither it nor the
// returned source is executed. Embedding the fixture keeps build inputs fixed.
const retainedP181LandingWire = gunzipSync(Buffer.from(
  'H4sIAAAAAAACE+1a23biyJJ976/Q8cw6trurbcCmqqguVw9grsYYCxCgc2bq6IYQ6EIjiVt1rTWfMU8zvzifMDsyJSEwlKvXnMeutVwGZWZkZMSOHREpG+u5twgE3RgroR0I/7Ac9r24WFhLxb63/LmtbN4IX4RWsd8u1yvi53qx/NBo1z4/VrrdYq3S/VxpF0utyr3wVRgvPEc4v7reX33+yw+R1C9C6BvdQAmMN0KwmRtC1Vs4laXhBsnihaFoQXpFy3Jnb2hdy9OUwPJc9qWtLC0TcvbX/bzwwsBY/Kx7TlqEhsHA6Bq+z5ZPPcuNviTL/+3attRrnz/tGoulpRlpEcVO57NUEbuNp3ZqzdJY0Pz0RN8IHj1S8wmDC0s3mLr8UWdhjI2F4WrGwb7OwXBa4MLwA28Ray/SAY9rzYYObR0diCSkVjGJ1wfj6aUu/KLY1tYoe46juHplsfAWkc/a8ZieHjzQSUsN+ZD8g+a5fiC0KrViefS5/HRf+dyqtGu9unAn3P4Sje4/fotV49DVyDSC5WOzuW0E0Eg3LjT890Hwg4XlmpcfBNXzbENxhS8/CLBXEC5cgWZc2YZrBhPh7u7u2M6///5iVmr4lx++pvd3rcBS7CagwxTwDWWhTVIq8A9MA34Y4D80cAzXWAl9sdVlCzrKQnH8aPXllWkEF+fTSOb5pfDrr8I5jJUc4uDUTOSl8Ne/Ctf/8fe/6z/96/VVAHTEz3+N9vzAhEB75q4W3ADNuJPuhI6lzT4ed+Eb4dwBHhTTOBd+p4gKFpviGPHUNXAk3T//lPaInZJ7oSkA0wchdGeut3Jhjr1dd0bROSOQWY4hjMu5/CWZP1H83kJxfYIlmQAL6VDeWGAzmc/OPXVqgDPILvzpX/DUDW0bTyBJEM7JzefwYTSOiWkpVxqTTKK4F5kLrq8FYhybjGrpjHmuFzAEwnojGAzXgu7hHKTl0hAUCLNtRbUNIYhVZvgScDoub2E4CpTAluPQFhRfUMJggsjTr4SqtTBUBbpFkhV7pWz8RHIkhpYKwcTg4nwQqaUJgbL2XM/ZCGYIPYlcFBVa4rh+YCi6gGP6IDRjIcwXHk6LxdZY4KZmk2gNJnFfwTZ/ObT6JfNggsovQgSTD5H9oq/CV7Lb1x18I28zLBr7eSaBUQSUi8sUStyY3O/SVH+RwoUd5QI+I84M6Rl/I5u9ITqmE/w7n8hSzwX2uvv0IqJjkVdRcKZlqaG/YbJK+LAna6zYe4D9m8EjCXOZPdOTP+4Fxe8Mop8u6P+UgIjMo2Uper64IH8bTHf26SqamlrsGN+zzkkrbCt+wJPKd6xMJu8pjISnG9+nMJuaWkzpTQ81Q+cJEknk7li6TDs2jsFY6dhgAC6O/+uxfHmx0xvkSAYHkSGEfvyRYP2j8OQaAoCKyBnDMYgvIVh5+A1f+YLBAp5im9hICDwBrC0sLHMSfGBz1TAIoJlgelyaTkG3mlg2Re7C+C2EQmByop+xTcvesFCmMeItnt0EfwLiJOkkkqLGWHBxCwVPSCuFBZQynwOflGosF7PxMHQxpNuGTvHtWDzChR+v8b/ib1xtF2uos4jMmWEuFPbsg8CjocOXflx6lv4J/L33PQr/CP8XwSLkPhQSmO9QLID9NtECKLBSrEDgW11E40IMmYtz8igy93kyEkf+xfn1wdhXuCDQJhFvXSY7JBq8zEeXydKx5cJ/m/QidpJd9HLe+kqwSMzluUQOFwbVpx92perHeu+xxb7ZhoPvZC4yUySdTb+aL9jve0538dHZtD0vcOunKlJW2nDNmTYRlV6w9R9Z/tAAZ7+tOMbdWXTos0/RwT7q1jI9rvBC/OfAm9sWUK5Z2s8UPfTl7NNHf664n546FbHYo8K2XRkIlftKW7gWyo3yx2s2zCd1R91e5VHo9oq9fjceucZuyc6T7BHFPn8OrMA2Ev0wj5aenvkz1+zecClvDTx7afgfhDZqqIpuuNHG3y3MD9WzT33XG48tDVwvUDWluOTbMkfXvsCP15Pspx/iL/tNTLKn4VKOryvaDBs98szn3315tT36mkigjKvfI9zvvlBiiQeuk62/xJz2a+R3ftaILI4dNylMyMFj1JjGmQCWUGDOJebNPdsK0l7AHvs8mt6J7fZp7ysezIUFDHZ3RlQe+rF4RTXsu7O4m4plnn3qTcBpukFtFLEbgtmF+uAo4qyYs68+Xs9f7EP93jfPSBCZnUHQ3f4Zvh6KEgSRB0/Eqlq4WFCrGe1+uPE17bwv4+N1+jsljwMr/TGjiEZkB6Lv40pdCR10MijMiDgP7XO5wxCAy+EQj+8rd8gDiRE5FfspnKQ3OLlsvrAcBaaPlp8dmImnwAODUol9d8aHzg7Gju1xfCalPMSbvh8r8T/PLdtoaO6+cB49xa97FwAXl5f7Yg5xU2azdzA9gATXc89snAh/2APGsSN6i7NP3oJ5NT0ZVYdzdD7lhTMcshuqjhXcfeEZ6QDoHxnejq5nI2fCJHBsJKy7M5L3MyWYs8Mzx2ClwYPzMiEHW1ruPAwORFh6eoPvcPixeRw0gbEODkfYllQ23J25oWMsLO1wBropL+6X78481/g5sBzjqDqOsm6xrv/uS6rlP0QXqwknnq0bsF2G/TsUxDruuy+0x+FqdGj3lmkFPhxoo31YWcEE7SIOwjpKQZsoC8STgW4PVadDNzSsyPOtNccw+sKXcMcMExvyqoTA/YL0opaHz7gKlAXq1Sum59XCYEe6uP773++vTfT755dXPgLIuMi8Sd99XF4eSN0/2/X3h7/PkPvPCn+6svnLkaugVwKaguYPhPM/l9CE5Du/5QMe3QBZ4+zbVPbiHvFiv1P6VTgfo+Y+p9sePnL+ihW+vBAg8lZJ4IoJ//s///WfTJ7IJsaPo41Ryxu+h4IXVrykuf99/vU7mJG47aDuSGuBru0EV0bWijLrp2g+aolIAEuO6YSYKkYvvyalFOvH0zdC6Sx5fGe25CzK7IptLIL9JMlKRi44vvr4eliZxjtfvbhFY7qErm6gKUE9tKfQTrzQQzGnmFTuE3ZVFDgnJX4FWNiHq5da7JUM85R9ktTjQdCxlkH14EznD3QNx/qFRrtXEavFcgUtRanfaN0LX1I36V+TRoKrwdX7eE1dDn2+pJujf6BXv77+F8H3woVmPKL/hZP6YutOVwLlA74iavjt3NT33F/oEu3t7Rtj08zJw+ZWGRTCxtTbtsrNYDQsrZRB3tU2jbeNWbX03K/4cr9aknsBPldLTxn27B19fv7z2Z/P/nz257Pvf2aBY8LRIGsTvwyyGb/h2K7qFDZyfz3Xbp6tJzvQMWer3kibUU7aNqZztTFbT1RHnKuOFur19m3Dxjq3vdSHzak8bN+ruXxGHuQzbK4j3Wq1wkYvl2byQJ7og3WmUV1ZyiC7Um+amUalutEcOzcarCvKsL1Sa9V8q1x616isS1I/f9+tSN1hZlJ6zgTN3kwf9/pSr5+p1kWpPRb7+dLzbF0Vy6VCoyZv1FzGbG5ul8/D5kYZyhO1IuIMJX80nLlP2bWmOnYQ6fKuUZe2stTOjIaijf0yxrBkNyryUnOyVd2RQj0t86ZpjwbtTHMbaMNafq4OS0vNfTaNTekR3LzA+qyWkx7VXHui1+ylaq1Mfdi2e041pwx0POub427J0ZxC0CjrG3lQnerl7AY2zcjDRiDXCsER2VPNkbBW6sGmLCdgn9/UnB324QctR/ukdMwUl2rNtlo3bVu7ac/hA6xrYv+2fUR2CRAYSzOp28/Ynd6BHJx/w+Vr74bVdZj4qu6bOGemNyhkSJ/ejWxrbnMu1/o+s2c/u2Tnt0s4I8Zgx1Fu7+zFVm49H1mFQL0RScdnzHGgp606R/Xc4OwZ7G0nZ7abwJloN+oZU3abS7VbdJ/LBV8ZNJbawZwj8shPiT37NyL8faDfDd+vdcPwkdhSB27k7kt7UKyog6qvDOf2cw7nGlRDuQL74fkOV3nC1QT+eSsPRMRHNhgN8jMROFVvGsfsM92f09xGZ6EfjOW3wOej2NdLz1l7/JwpVESpgO/5ulQxzU63mOF4by9Vt40Ya3fEijTuVaQnMSs2GvcZsz1N5Dn6ID/luC3NtQzWDEu+DPvhPDO5O8F+ov1klbZ6vUkxP8dnS80VfOA4bNRJzq3ZqDdtvS5tIIPNbzlr+FTPKOViodPLmNi7/txvy8PMgS719ftGrb0EhkK1JoXyjehBv0KnW7rvZcTqMLOuIu773Xumb4HsTz+yC2wxDN2aiME59Ee8z5f4fE/7P9Tb9gh8pNx7pnYjbqiGeujtPid61yIb1cEXdckm26iOdNOoSt1eNZJRLU00pxpom8kWZwYPmvOWo9t62XQVpzBXZ0x/96FbvO5sii731Z5NjtmVOC8rd2dm0xqZrSx8UV1rctmftTbgT+D+IdKJ5O7088BxHIdjCT628eOKeQ0c06sBezU7lDMcf3SWfs2eKtv1EzAEPK3nhiPNXuK06KoDip2qC4ybY3xHXGY01y7JrmhrNuyQK4Ry/dHtHMeNT1glu0aY9ka5KmKt/xa8ECq5/FLP3RJuHg/mmQbh1CqaJB/5xoT+W622nhjdIjgpFTd92G+QpbxTBecsNWsyHQ0Ro90Zs0WjXIrjwhsN2334C/Io7kWGB7KFXrdX8qDgwOcT4meOM5w91/xNJn7fFJ0m8MvlFieEW9WVfLWM5zbXswHbjJj/NODu1ozOyXx4KL/lMFyYkFNAbMfxw3MRZLU27+GzwnQ0QL5wwCEDMcof4JpBm/Gw0S3Z7LzuI2zznvgm06hNJjp4a9SFroM1bN/05W4pszvzs8l1LJG9OBbL75eER/h9Dn8RD8J/K3M0fMSPlFGI3wbPIXLgHL63RmSfGseHtoGcuj4xMFepVXMkN4pZk/zJuB/7KzUptRfLrfPRpoTfkyX0DnAWVx/YM6yZkoyRUyBZc4o/xNWsUYPtELeai9xhlVbYG3LzUZzaTqMc+5yvYXLI3hGOG+UR5lSP+v+hW4pwUkzH5btGLUscP5EJq4nfkmfmuBfHcvYwpmdxvcL86WbjuLCNOveBXJMc6OsDk+lYSWLgoTx7gX81VTOAA8lPT6OhPJdz1YzcNedPh/MJP0POg9H8VB3ycv4gx/zmk531Cn2WdBYbODfyIe3rkV6d3glera2XwDzL/y034sfy7Mg+zax2M4v2oc/2i31kYB6xc2Rtkj+34Ese73YmPh9yMWzRW7/gknG5FKK+9DvWhP1+6B1yfJzPE1sd1gLeA8ctcW6hQzmP9urmt/G8FzKBn+RcSf3Ba4iH8iRaz+2p8XOH6qB/xI/VrV6Naps/Ki+19tiZ9UqW89AfPrPYZj5/IRN1IPKIjtpSrkQ1H9WQkd5xfdhHrMjgMJnF+0ssQsZUZTWk3WW1MHF+ykfEqbCV2flGHQg8TmCHaP3MRI5hvmd72THPer/Fsf9glToquJNyDNWmMvFGXfSIv/Tce1OvTcDR+hbcR3cxeeIEtbYi3tti3rJRo7xfQg2hezpyMeaDJ5tZHWMqcXSuEHFg8bdGTUTf8GzqOcisMb7GOapZOgv4DHvYIepun8kqrziX1ipkF5aP2D0Qzau3PfVGD9n+XFfGO9Bvt1e9OSFdwJvgYdRlNfQ+uepKq0moXVATbIgzSX+q2ZCTWa2wtuUy49lAId5Lcpy3jHIqbGuH4PA0f9lqVBNEfvJGka5PVtGLMPQcy+zUZXDH809UewEPyOH2FrGbQx8zw7wUJ8c8MfOQJ7O7vB6PcU54qOWz8EeCJeiIOmXHo2x+rXozGtiwcXV6yIM7eSwmvGaOYRq9E+q3GOdlJjdM8a7bOjFvTDl4KIIDi3HNM09qSy5nx2HW5FSdND+Q6WAOcLfOH5FVRozlH2pUD7btvXUSP2NSF+Jzuk5GffRA/eMDYRv9OWKlRnWhOJTh0+f33arY7kU9MGrxgOZ0rBlqOObDlI1LNu+R88AOlyUmuS5t6xLzM2IpRB+72fWtZoyTg36W9xoPu5ouqffxGbEjZjXn1nyoJr58H9UzU+JALQObDfq0Rms48R2Fjrp6ZXXslP/v18jdI/AQcUf7ie4/OrDZsNycUD9LtVhrCG6srefEFaOcPW0NCsQHiNW8zeRPb9+jvpio03ynX5G6z5LY7GVuzd5MGqIeqYj9W/BO6b7bf3yPnnI1Gtz+1Knz3/2s3ZMqUrtRbfexTupvV0su6/Z9KyfO9Wk+5fPie+W+ckzXBEvDLPh2KPoye974KYmbaD2T/W0bjYfAiA4+aA3ozBK32Uy0sW4pW6Whmlvj/I9v0cva+qZURd0QdsoF1OrVcM+2+InO+X06d7NbfdCMfCSFak4G9ttzqompTyH5jAcrSfwl9kyfE7p4j718VIPtbPfyLshOj5uETVY/9yfIBwHZok35cTTQbW2bfderVKXerN0Qpea4W6nedzM2+tZCW5Tavee+Xu1nC+hPq2X0s5U4/mLZlJ9h3wpxd2cYWBS3+3Pe/7TDN39m3KRqlE3Re+HLnBTz8Cv+bFLPFucw1OFZh3rYCCOo+ZvzUTfrwzaxb1bwMTAgvYwXzj3vjuTra9Tk+/aM9Hy5PsYG7OIUfLmXZfuwGgb9A9Pfoj7bngCD6A0kP9IrqVeo9o7PxGMw31dYHhXBRzb1FHP0KtQHhpQ/Zcq96JmQd5P6rTVFrN3nj+lMvMDu82Av4KS97ZG9Ij3VuLfOFsY7O8wC9KahkuU2xV4FI2X3vlPIwp6FU7aATbsxp5GevJZoZ8FBxMfm7j7rhC3LBabvUfn3q+WR53O6P0jxZ/rsqwbl51qEJZfVhFktu48XxIqt3nObpO4hd/1qxEF9slHkB37fktQuUx0xye6Hd7Ve2KiW6D6JejuWu0/56WGY3X+GcyYxsc+bR8/aQV2kvxY7uahuQD3HuV/eEIdFmHuh03fJvKGaMTshzMT1UmTbQ76OZEY15Qnfs7uGCJsjV8rotULI9jwx/xUuBjeJGfiLyTumD7BK/S7iEjXjffYd9twah75IOLUQPtM9Zs4vGBsTfsj8FNcQ5HfERhLTD+VovName/HM7s71FjWCXThqmxNnfKbYo/6JauhvxQ4wE9vsiKxUDj7i6/qrtkSvyv2K+g65qviC46N4c6j2eo1r2P0il2eye+hBE3X1c8FAD9WlMTdzAj+cQ1+Tj8+WPFiz543aJKMO1qgJGxF+qe+/DdhdknQaq8DGjqPZvZB0NCe0chGvH/UJ6g63lNWrx30L7JzQqXkCg98+96vr6+xONeJC0Tbq4rdig+vOe4pIT/QpAwkx3/7WugnibsnrnLWtJ2sLIeoicEQW9Vhkz9MygtFw8oi4cvWaWTAO7tcPa5KkNmH9r+Qh58/kYeTvaXH1eI+f6rfswu+hUc+wWv2UfLrbFGu2ixpvS3yg1ukuSEd9YZqq857uluj+e47+c4pedEOcSH/7gLmbRi3L3ssgH1LdulWGZswb6Ffz3+AczHd06OZ7Mu9pGLcct1vcB7L7sHg++pTqRs5JmZbLz9lCLo7uCrwW8XV1XWnlNL9R1tyHbn6L/E93G6tW+eB9RXk2P+Gvo5zW2h491/sUtx+Txd4vRRy05dzwTZy+kvd2Oed0XLF7BcSSNItrWvYOp1w9+e7o4XieOMUlrEf9f3I48ckup70W3873nPsVPol0adTS9ozvxrJUC2Wo7v1Wjsace5W9r8m+i+9gT7xv9V7ev1Etrjt099XcFN/y98xiFrh1/6D9352Q3Y3v4Cg++fP7lZu3itF+3Wg/U430RW8Q64D6Ef0UeA5xjPz+OG90ymOneese5Y9X8zPdURyJ63oQ7SfNeokOI4fVtq/lwWh+a7hX9/6UyGH3cOCfujSl9ySovVcd92UtCnm5fZ3twoseLxe/r6jQe052X8nfXRz0Ut+ht8zfD/P8na7fnSrisJk5WbNGdxGxLrt3HuhXTvT1hA2+XyM88X7QbNC7rroU0rsPuiuR6d2Z9aKP3dOhURXpPRf2Znc59EPvhrL6q/u12X1xtHd4Wu/i/BBnzH9H/LSrn+SleiPSfeoRzoz/ZmUVQE/CKesDqbdRBo8B6w2d1D3KdM31mhWeRalZkirsby6eREkzxb5Y7U139z/RnVJvILX7Yj9jdvv5PtbUnvvtaqP83ny2pWav8mwamepzv1oYYKzX7Reexr30HVKke8rvOC/6DjuxDb83jN6nlxvWsLuyZMf25W7jbcMqSBrhYlOwqYZBnp5plIu7hYqaa1NdE+r1xyXj+KG5fJwWN20rs34sZ1btbgHx0160bkrTx14xoHeJaq6QaQ13fTHGNnjmoLZhXCmz9w3wnfOIuGY987aVOfgbIzdz938LCj8N90EAAA==', 'base64')).toString('utf8');

test('exact native CLI entry accepts the retained Landing envelope and selects the three-actor profile',
  { timeout: 5000 }, async () => {
    assert.equal(p181DeadlineDigest(retainedP181LandingWire),
      'a43f727dc48c6c14cef1f9b5f0384587106815f1a254883409addda100827510');
    const checkedLandingSource = await readFile(resolve(repositoryRoot, 'src/routes/Landing.tsx'), 'utf8');
    assert.equal(p181DeadlineDigest(checkedLandingSource),
      '54b16f173b7357584aab927a18b5f5ebce1437b649bfb20f43fe9a9b458ee98d');
    const held = await remainingNativeConsumer({ cliEntry: true, proofProfile: 'wing-bays', rejectedCreate: true,
      landingSourceBody: retainedP181LandingWire, checkedLandingSource });
    await held.program;
    assert.deepEqual(held.cli.argv, ['/opt/local/bin/node', p181DeadlineSourcePath]);
    assert.equal(held.cli.env.P181_PROOF_PROFILE, 'wing-bays');
    assert.equal(held.cli.exitCode, 1, 'The actual CLI must retain the intentional downstream create failure.');
    assert.equal(held.cli.stderr.length, 1);
    assert.equal(JSON.parse(held.cli.stderr[0]).status, 'P181_STOPPED_FIRST_FAILURE');
    assert.equal(held.preflightAcquisitions.browser, 3,
      `The command-selected entry must pass decoded-source verification and use the existing three-actor route: ${held.privateRecords.map(error => error.message).join(' | ')}`);
    assert.ok(held.privateRecords.some(error => error.heldObservationsInspect.includes('ordinary rejected create')),
      held.privateRecords.map(error => error.message).join(' | '));
    for (const path of ['src/components/MaintenanceSystems.tsx', 'src/lib/maintenanceService.ts',
      'src/lib/shipStateProjection.ts', 'src/data/aegisConsoles.ts', 'src/data/shipPopulation.ts']) {
      assert.ok(held.fetchedUrls.includes(`${held.launch.baseUrl}/${path}?raw`),
        'The actual CLI must consume the Wing-bays profile rather than the API default.');
    }
    assert.equal(held.writes.some(item => item.path.endsWith('p181-pre-browser-failure-phase.json')), false);
    const native = held.writes.find(item => item.path.endsWith('p181-starlight-movement-scout.json'));
    assert.ok(native, 'Acquired actors still require the existing native cleanup outcome.');
    const outcome = JSON.parse(native.body);
    assert.equal(outcome.actualBrowserProcesses, 3);
    assert.equal(outcome.cleanup.browsersClosed, 3);
    assert.equal(held.browsers.every(browser => browser.closed), true);
});

test('exact native CLI entry retains a bound pre-browser source failure and its original exit',
  { timeout: 5000 }, async () => {
    const checkedLandingSource = await readFile(resolve(repositoryRoot, 'src/routes/Landing.tsx'), 'utf8');
    const held = await remainingNativeConsumer({ cliEntry: true, proofProfile: 'wing-bays',
      checkedLandingSource, landingSourceBody: `export default ${JSON.stringify(`${checkedLandingSource}\n/* changed source */`)};` });
    await held.program;
    assert.deepEqual(held.cli.argv, ['/opt/local/bin/node', p181DeadlineSourcePath]);
    assert.equal(held.cli.exitCode, 1);
    assert.equal(held.cli.stderr.length, 1);
    assert.equal(JSON.parse(held.cli.stderr[0]).status, 'P181_STOPPED_FIRST_FAILURE');
    assert.deepEqual(held.preflightAcquisitions, { provider: 0, browser: 0 });
    assert.deepEqual(held.fetchedUrls, [`${held.launch.baseUrl}/src/lib/firebaseConfig.ts`,
      `${held.launch.baseUrl}/src/routes/Landing.tsx?raw`]);
    const original = held.privateRecords[0];
    assert.ok(original.message.includes('exact decoded served src/routes/Landing.tsx'));
    const phaseWrite = held.writes.find(item => item.path.endsWith('p181-pre-browser-failure-phase.json'));
    assert.ok(phaseWrite, 'The actual CLI catch must settle after positive service-only phase evidence.');
    assert.equal(phaseWrite.path, `${held.cli.env.P181_EVIDENCE_DIRECTORY}/p181-pre-browser-failure-phase.json`);
    const phase = JSON.parse(phaseWrite.body);
    assert.equal(phase.phase, 'pre-browser-failed');
    assert.equal(phase.browserAcquisitionStarted, false);
    assert.equal(phase.actualAuthActors, 0);
    assert.equal(phase.actualBrowserProcesses, 0);
    assert.equal(phase.sourceCommit, held.cli.env.P181_SOURCE_COMMIT);
    assert.equal(phase.sourceRoot, resolve(held.cli.env.P181_SOURCE_ROOT));
    assert.equal(phase.projectId, held.cli.env.P181_PROJECT);
    assert.equal(phase.allocationStartedAtMs, Number(held.cli.env.P181_ALLOCATION_STARTED_AT_MS));
    assert.equal(phase.allocationDeadlineAt, Number(held.cli.env.P181_ALLOCATION_DEADLINE_MS));
    assert.equal(phase.runtimeLaunchRecordSha256, p181DeadlineDigest(JSON.stringify(held.launch)));
    assert.equal(phase.originalError.fingerprint, p181DeadlineDigest(JSON.stringify({
      name: original.name, code: original.code ?? null, message: original.message,
    })));
    assert.equal(held.writes.some(item => item.path.endsWith('p181-starlight-movement-scout.json')), false,
      'A command-line failure before actors existed must not fabricate actor cleanup.');
});

test('pre-native existing API completes the actual canonical and complete retained build source preflight before allocation', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true });
  assertPreflightInert(fixture);
  assert.equal(fixture.error, undefined, `SOURCE-ONLY preflight must precede allocation: ${fixture.error?.message}`);
  assert.equal(fixture.counters.contract, 1);
  assert.equal(fixture.result.status, 'P181_SOURCE_ONLY_PREFLIGHT_PASS');
  assert.equal(fixture.result.runtimeProof, false); assert.equal(fixture.result.sourceCommit, fixture.currentCommit);
  assert.equal(fixture.result.sourceContractPreflight.status, 'PC11_SOURCE_CONTRACT_PREFLIGHT_PASS');
  assert.equal(fixture.result.buildProvenance.sourceCommit, 'cce724564cb3652d2182cce9d16aaac4af2e7a30');
  assert.equal(fixture.result.buildProvenance.builtHere, false);
  assert.equal(fixture.result.buildProvenance.compiledFileCount, 450);
  assert.equal(fixture.result.buildProvenance.frontendFileCount, 277);
  assert.equal(fixture.result.sourceBindings.functionsSourceFiles.length, 542);
  assert.equal(fixture.result.sourceBindings.trackedFiles.length, 2082 + 3);
  for (const path of ['scripts/pc10-p181-role-navigation-baseline.test.mjs',
    'scripts/qualification/pc10-p181-0449-phase-observation.test.mjs',
    'scripts/qualification/pc10-p181-0555-flight-observation.test.mjs']) {
    assert.ok(fixture.result.sourceBindings.trackedFiles.some(value => value.path === path));
  }
  assert.ok(fixture.result.sourceBindings.sourceFiles['scripts/qualification/pc11-live-base-contract.test.mjs']);
  assert.ok(fixture.now < fixture.sourceOnlyDeadlineMs);
});

test('pre-native source-only proof-test additions cannot admit new client or Functions inputs', async () => {
  for (const path of ['src/pc10-unreviewed-input.ts', 'functions/src/pc10-unreviewed-input.ts']) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true,
      changeCandidateTrackedPaths: paths => [...paths, path],
      virtualInputs: { [resolve(repositoryRoot, path)]: 'export const unreviewed = true;\n' } });
    assertPreflightInert(fixture); assert.ok(fixture.error);
    assert.equal(fixture.error.code, 'ERR_ASSERTION',
      `Product-input denial must come from the source preflight guard: ${fixture.error.message}`);
    assert.equal(fixture.counters.contract, 0);
  }
});

test('pre-native source-only proof-test additions cannot remove an original product or proof input', async () => {
  for (const path of ['src/lib/sessionService.ts', 'scripts/qualification/pc11-normal-start-adapter.mjs']) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true,
      changeCandidateTrackedPaths: paths => paths.filter(value => value !== path) });
    assertPreflightInert(fixture); assert.ok(fixture.error);
    assert.ok(fixture.error.message.includes(path) || fixture.error.expected?.includes(path),
      'The missing original input must be identified in the actual failure.');
    assert.equal(fixture.counters.contract, 0);
  }
});

test('pre-native source-only wrong candidate commit is denied without allocation or external acquisition', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true, sourceCommit: 'f'.repeat(40) });
  assertPreflightInert(fixture); assert.ok(fixture.error);
  assert.equal(fixture.error.actual, fixture.currentCommit); assert.equal(fixture.error.expected, 'f'.repeat(40));
  assert.equal(fixture.counters.contract, 0);
});

test('pre-native source-only altered or missing actual source input is denied before any provider', async () => {
  for (const change of [
    { alterRead: (path, value) => path.endsWith('/src/lib/sessionService.ts') ? `${value}\n// controlled mismatch` : undefined },
    { missingRead: path => path.endsWith('/src/lib/sessionService.ts') },
  ]) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true, ...change });
    assertPreflightInert(fixture); assert.ok(fixture.error);
    if (change.missingRead) assert.equal(fixture.error.code, 'ENOENT');
    else assert.match(fixture.error.message, /tracked.*input|build input|client.*source/i);
    assert.equal(fixture.counters.contract, 0);
  }
});

test('pre-native source-only changed or missing complete Functions or client build bytes are denied', async () => {
  for (const suffix of ['/functions/lib/starlightScout.js', '/dist/index.html']) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true,
      alterRead: (path, value) => path.endsWith(suffix) ? Buffer.concat([Buffer.from(value), Buffer.from('changed')]) : undefined });
    assertPreflightInert(fixture); assert.ok(fixture.error);
    assert.match(fixture.error.message, suffix.includes('/functions/')
      ? /Bind every loaded Functions output, including transitive arrival and scout modules/
      : /Every original frontend build output must match/);
    assert.equal(fixture.counters.contract, 0);
    const missing = await actualPreNativeConsumer({ sourceOnly: true, missingRead: path => path.endsWith(suffix) });
    assertPreflightInert(missing); assert.equal(missing.error?.code, 'ENOENT');
    assert.equal(missing.counters.contract, 0);
  }
});

test('pre-native source-only finite issued deadline rejects expiration and post-read equality without renewal', async () => {
  for (const change of [{ deadlineOffset: 0 }, { deadlineOffset: -1 },
    { exhaustAfterRead: path => path === preflightBuildBindingPath }]) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true, ...change });
    assertPreflightInert(fixture); assert.ok(fixture.error);
    assert.match(fixture.error.message, /deadline.*expired|finite.*deadline/i);
    assert.equal(fixture.counters.contract, 0);
  }
});

test('pre-native normal mode still requires the original parent allocation', async () => {
  const fixture = await actualPreNativeConsumer();
  assertPreflightInert(fixture); assert.match(fixture.error?.message ?? '', /Parent runtime allocation is required/);
  assert.equal(fixture.counters.contract, 0); assert.equal(fixture.counters.writer, 0);
});

test('launch readiness actual exported sourceOnly API rejects a missing local GM opt-in before resources', async () => {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const plannedLaunch = p181ReferencePlannedLaunch(sourceCommit);
  delete plannedLaunch.commands.vite.env.VITE_LOCAL_GM_ACCESS;
  delete plannedLaunch.expectedServedEnvironment.VITE_LOCAL_GM_ACCESS;
  let error;
  try {
    await runP181StarlightMovementScoutNative({ sourceOnly: true, sourceRoot: repositoryRoot, sourceCommit,
      sourceOnlyDeadlineMs: Date.now() + 60_000, buildBindingPath: preflightBuildBindingPath,
      buildBindingSha256: preflightBuildBindingSha256, plannedLaunch });
  } catch (failure) { error = failure; }
  assert.match(error?.message ?? 'Existing sourceOnly API accepted the missing GM opt-in', /Local GM UI\/plugin opt-in required/);
});

test('launch readiness whole sourceOnly consumer rejects disabled GM opt-in with zero launch counters', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true, plannedLaunchChange: plan => {
    plan.commands.vite.env.VITE_LOCAL_GM_ACCESS = '0'; plan.expectedServedEnvironment.VITE_LOCAL_GM_ACCESS = '0';
  } });
  assertPreflightInert(fixture);
  assert.match(fixture.error?.message ?? 'Accepted disabled GM opt-in', /Local GM UI\/plugin opt-in required/);
  assert.equal(fixture.counters.contract, 0); assert.equal(fixture.counters.installedMetadata, 0);
});

test('launch readiness whole sourceOnly consumer rejects a foreign Vite project before resources', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true, plannedLaunchChange: plan => {
    plan.commands.vite.env.VITE_FIREBASE_PROJECT_ID = 'demo-foreign'; plan.expectedServedEnvironment.VITE_FIREBASE_PROJECT_ID = 'demo-foreign';
  } });
  assertPreflightInert(fixture);
  assert.match(fixture.error?.message ?? 'Accepted foreign Vite project', /Runtime must be the root-owned project/);
  assert.equal(fixture.counters.contract, 0);
});

test('launch readiness whole sourceOnly consumer rejects production DEV before resources', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true,
    plannedLaunchChange: plan => { plan.expectedServedEnvironment.DEV = false; } });
  assertPreflightInert(fixture); assert.ok(fixture.error, 'Accepted DEV:false planned environment');
  assert.equal(fixture.error.actual, false); assert.equal(fixture.error.expected, true);
  assert.equal(fixture.counters.contract, 0);
});

test('launch readiness whole sourceOnly API rejects inherited production without an explicit development override', async () => {
  const accepted = [];
  for (const value of [undefined, 'production']) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true, inheritedEnvironment: { NODE_ENV: 'production' },
      plannedLaunchChange: plan => {
        if (value === undefined) delete plan.commands.vite.env.NODE_ENV;
        else plan.commands.vite.env.NODE_ENV = value;
      } });
    assertPreflightInert(fixture);
    if (!fixture.error) accepted.push(value ?? 'inherited-production');
    else {
      assert.match(fixture.error.message, /planned.*NODE_ENV.*development/i);
      assert.equal(fixture.counters.contract, 0); assert.equal(fixture.counters.installedMetadata, 0);
    }
  }
  assert.deepEqual(accepted, [], `Accepted production Vite environment: ${accepted.join(', ')}`);
});

test('launch readiness explicit development remains valid despite an inherited production value', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true, inheritedEnvironment: { NODE_ENV: 'production' } });
  assertPreflightInert(fixture); assert.equal(fixture.error, undefined);
  assert.equal(fixture.result.status, 'P181_SOURCE_ONLY_PREFLIGHT_PASS');
});

test('launch readiness ambient and planned foreign emulator endpoints fail on the whole sourceOnly API', async () => {
  const accepted = [];
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    for (const inherited of [true, false]) {
      const fixture = await actualPreNativeConsumer({ sourceOnly: true,
        ...(inherited ? { inheritedEnvironment: { [name]: '127.0.0.1:1' } } : {
          plannedLaunchChange: plan => { plan.commands.proof.env[name] = '127.0.0.1:1'; },
        }) });
      assertPreflightInert(fixture);
      if (!fixture.error) accepted.push(`${inherited ? 'ambient' : 'proof'}-${name}`);
      else assert.match(fixture.error.message, /Planned P181 .*emulator host/i);
    }
  }
  assert.deepEqual(accepted, [], `Accepted foreign local endpoints: ${accepted.join(', ')}`);
});

test('launch readiness ambient cache browser and debug settings require explicit empty stage values', async () => {
  const accepted = [];
  for (const stage of ['configure', 'emulators', 'vite', 'proof']) {
    for (const name of ['TICKER_SMOKE_CACHE_DIR', 'BROWSER', 'BROWSER_ARGS', 'DEBUG']) {
      const fixture = await actualPreNativeConsumer({ sourceOnly: true,
        plannedLaunchChange: plan => { plan.commands[stage].env[name] = name === 'TICKER_SMOKE_CACHE_DIR' ? '/tmp/foreign-cache' : 'unreviewed'; } });
      assertPreflightInert(fixture);
      if (!fixture.error) accepted.push(`${stage}-${name}`);
      else assert.match(fixture.error.message, /Planned P181 .*explicitly empty/i);
    }
  }
  assert.deepEqual(accepted, [], `Accepted unintended cache/browser/debug settings: ${accepted.join(', ')}`);
});

test('launch readiness committed public Firebase settings are required on the full sourceOnly API', async () => {
  const accepted = [];
  for (const name of Object.keys(p181CommittedPublicFirebaseEnvironment())) {
    for (const missing of [true, false]) {
      const fixture = await actualPreNativeConsumer({ sourceOnly: true, plannedLaunchChange: plan => {
        if (missing) delete plan.commands.vite.env[name];
        else plan.commands.vite.env[name] = 'unreviewed-public-override';
      } });
      assertPreflightInert(fixture);
      if (!fixture.error) accepted.push(`${missing ? 'missing' : 'changed'}-${name}`);
      else assert.match(fixture.error.message, /Planned P181 .*public.*committed default/i);
    }
  }
  assert.deepEqual(accepted, [], `Accepted missing/unreviewed public settings: ${accepted.join(', ')}`);
});

test('launch readiness canonical unchanged Vite loadEnv uses explicit public values ahead of every mode dotenv file', async () => {
  const directory = await mkdtemp('/tmp/p181-launch-dotenv-control-');
  const plan = p181ReferencePlannedLaunch('a'.repeat(40));
  const expected = { ...plan.expectedServedEnvironment }; delete expected.DEV;
  const names = [...Object.keys(expected), 'NODE_ENV', 'VITE_USER_NODE_ENV', 'BROWSER', 'BROWSER_ARGS'];
  const original = new Map(names.map(name => [name, process.env[name]]));
  try {
    for (const path of ['.env', '.env.local', '.env.emulators', '.env.emulators.local']) {
      await writeFile(resolve(directory, path), Object.keys(expected).map(name => `${name}=dotenv-foreign-public-value`).join('\n'), { flag: 'wx', mode: 0o600 });
    }
    for (const [name, value] of Object.entries(expected)) process.env[name] = value;
    process.env.NODE_ENV = 'development'; process.env.VITE_USER_NODE_ENV = 'development';
    process.env.BROWSER = ''; process.env.BROWSER_ARGS = '';
    const effective = loadEnv('emulators', directory, 'VITE_');
    for (const [name, value] of Object.entries(expected)) assert.equal(effective[name], value, name);
    assert.deepEqual(localGmAccessConfiguration('serve', effective),
      { projectId: plan.projectId, authPort: plan.ports.auth, firestorePort: plan.ports.firestore });
  } finally {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('launch readiness rejects each wrong canonical browser or full emulator port without resource work', async () => {
  const changes = ['auth', 'functions', 'firestore'].map(key => ({ name: `browser-${key}`, mutate: plan => {
    const name = `VITE_FIREBASE_${key.toUpperCase()}_EMULATOR_PORT`;
    plan.commands.vite.env[name] = '1'; plan.expectedServedEnvironment[name] = '1';
  } })).concat(Object.keys(emulatorPortsForSlot(5)).map(key => ({ name: `slot-${key}`,
    mutate: plan => { plan.ports[key] = 1; } })), [{ name: 'vite-port',
    mutate: plan => { plan.commands.vite.env.VITE_DEV_SERVER_PORT = '1'; plan.expectedServedEnvironment.VITE_DEV_SERVER_PORT = '1'; } }]);
  const accepted = [];
  for (const change of changes) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true, plannedLaunchChange: change.mutate });
    assertPreflightInert(fixture);
    if (!fixture.error) accepted.push(change.name);
    else assert.match(fixture.error.message, /Root-owned .* port required|canonical.*port|canonical Vite|canonical emulator ports/i);
  }
  assert.deepEqual(accepted, [], `Accepted wrong planned ports: ${accepted.join(', ')}`);
});

test('launch readiness requires complete exact commands and disables both wrappers registry fallback', async () => {
  const changes = [
    { name: 'missing-plan', options: { omitPlannedLaunch: true } },
    { name: 'relative-node', mutate: plan => { plan.commands.configure.node = 'node'; } },
    { name: 'foreign-existing-executable', mutate: plan => { plan.commands.configure.node = '/bin/ls'; } },
    { name: 'foreign-cwd', mutate: plan => { plan.commands.proof.cwd = '/tmp'; } },
    { name: 'configure-row', mutate: plan => { plan.commands.configure.argv[1] = '6'; } },
    { name: 'wrong-emulator-project', mutate: plan => { plan.commands.emulators.argv[3] = 'demo-foreign'; } },
    { name: 'missing-strict-port', mutate: plan => { plan.commands.vite.argv.pop(); } },
    { name: 'wrong-proof', mutate: plan => { plan.commands.proof.argv[0] = 'scripts/qualification/pc11-three-actor-trade-philia.mjs'; } },
    { name: 'wrong-proof-project', mutate: plan => { plan.commands.proof.env.P181_PROJECT = 'demo-foreign'; } },
    { name: 'foreign-HOME', mutate: plan => { plan.commands.emulators.env.HOME = '/tmp/foreign-configstore-home'; } },
    { name: 'foreign-configstore', mutate: plan => { plan.commands.emulators.env.XDG_CONFIG_HOME = '/tmp/foreign-configstore'; } },
    { name: 'foreign-debug-file', mutate: plan => { plan.commands.emulators.env.FIREBASE_DEBUG_PATH = '/tmp/foreign-debug.log'; } },
    { name: 'different-resolver-PATH', mutate: plan => { plan.commands.emulators.env.PATH = ''; } },
    { name: 'different-installed-alias', mutate: plan => { plan.firebaseAliasPath = process.execPath; } },
    { name: 'update-notifier-enabled', mutate: plan => { plan.commands.emulators.env.NO_UPDATE_NOTIFIER = ''; } },
    ...['vite', 'emulators'].flatMap(key => [
      { name: `${key}-missing-CI`, mutate: plan => { delete plan.commands[key].env.CI; } },
      { name: `${key}-registry-fallback`, mutate: plan => { plan.commands[key].env.CI = '1'; } },
      { name: `${key}-truthy-zero-CI`, mutate: plan => { plan.commands[key].env.CI = '0'; } },
    ]),
    ...['configure', 'emulators', 'vite', 'proof'].flatMap(key => ['NODE_OPTIONS', 'NODE_PATH'].flatMap(name => [
      { name: `${key}-missing-${name}`, mutate: plan => { delete plan.commands[key].env[name]; } },
      { name: `${key}-nonempty-${name}`, mutate: plan => { plan.commands[key].env[name] = name === 'NODE_OPTIONS' ? '--require /tmp/foreign-node-hook.cjs' : '/tmp/foreign-node-modules'; } },
    ])),
    ...['configure', 'emulators', 'vite', 'proof'].flatMap(key => [
      { name: `${key}-missing-CODEX-coordination`, mutate: plan => { delete plan.commands[key].env.CODEX_COORDINATION_FILE; } },
      { name: `${key}-missing-DOW-coordination`, mutate: plan => { delete plan.commands[key].env.DOW_EMULATOR_COORDINATION_FILE; } },
      { name: `${key}-conflicting-coordination`, mutate: plan => { plan.commands[key].env.DOW_EMULATOR_COORDINATION_FILE = '/tmp/p181-foreign-coordination.json'; } },
      { name: `${key}-foreign-coordination`, mutate: plan => {
        plan.commands[key].env.CODEX_COORDINATION_FILE = '/tmp/p181-foreign-coordination.json';
        plan.commands[key].env.DOW_EMULATOR_COORDINATION_FILE = '/tmp/p181-foreign-coordination.json';
      } },
    ]),
    { name: 'renewed-allocation', mutate: plan => { plan.allocationDeadlineMs += 60_000;
      plan.commands.proof.env.P181_ALLOCATION_DEADLINE_MS = String(plan.allocationDeadlineMs); } },
  ];
  const accepted = [];
  for (const change of changes) {
    const fixture = await actualPreNativeConsumer({ sourceOnly: true, ...change.options, plannedLaunchChange: change.mutate });
    assertPreflightInert(fixture);
    if (!fixture.error) accepted.push(change.name);
    else assert.match(fixture.error.message, /Planned P181|planned launch|registry fallback|26-minute reference/i);
  }
  assert.deepEqual(accepted, [], `Accepted incomplete/wrong planned commands: ${accepted.join(', ')}`);
});

test('Wing bay planned launch binds the explicit three-actor profile without acquiring resources', async () => {
  const directory = resolve('/tmp', `p181-uncreated-wing-profile-${process.pid}-${Date.now()}`);
  const plan = p181ReferencePlannedLaunch('a'.repeat(40), directory);
  plan.commands.proof.env.P181_PROOF_PROFILE = 'wing-bays';
  const receipt = await actualP181PlannedLaunchQualifier(plan);
  assert.equal(receipt.proofProfile, 'wing-bays');
  assert.equal(receipt.configuration.commands.proof.env.P181_PROOF_PROFILE, 'wing-bays');
  assert.equal(receipt.configuration.allocationDeadlineMs - receipt.configuration.allocationStartedAtMs,
    P181_NATIVE_TIMING.totalAllocationMs, 'The named profile keeps the existing finite reference interval.');
  assert.equal(receipt.allocationAuthority, false);
  assert.equal(existsSync(directory), false);
});

for (const explicit of [false, true]) {
  test(`Wing bay planned launch preserves the ${explicit ? 'explicit' : 'omitted'} default Starlight profile`, async () => {
    const directory = resolve('/tmp', `p181-uncreated-default-profile-${process.pid}-${Date.now()}-${explicit}`);
    const plan = p181ReferencePlannedLaunch('a'.repeat(40), directory);
    if (explicit) plan.commands.proof.env.P181_PROOF_PROFILE = 'starlight';
    const receipt = await actualP181PlannedLaunchQualifier(plan);
    assert.equal(receipt.proofProfile, 'starlight');
    assert.equal(Object.hasOwn(receipt.configuration.commands.proof.env, 'P181_PROOF_PROFILE'), explicit);
    assert.equal(receipt.allocationAuthority, false);
    assert.equal(existsSync(directory), false);
  });
}

test('Wing bay planned launch denies unknown profiles and profile settings outside the proof command', async () => {
  for (const profile of ['', 'wing', 'all-roles', 'gm-only']) {
    const plan = p181ReferencePlannedLaunch('a'.repeat(40));
    plan.commands.proof.env.P181_PROOF_PROFILE = profile;
    await assert.rejects(actualP181PlannedLaunchQualifier(plan));
  }
  for (const stage of ['configure', 'emulators', 'vite']) {
    const plan = p181ReferencePlannedLaunch('a'.repeat(40));
    plan.commands[stage].env.P181_PROOF_PROFILE = 'wing-bays';
    await assert.rejects(actualP181PlannedLaunchQualifier(plan), /full environment must contain only/);
  }
});

test('planned launch qualification binds Firebase log production to the exact future evidence directory', async () => {
  const directory = resolve('/tmp', `p181-uncreated-firebase-log-${process.pid}-${Date.now()}`);
  assert.equal(existsSync(directory), false, 'The future attempt evidence directory must be absent during source-only qualification.');
  const plan = p181ReferencePlannedLaunch('a'.repeat(40), directory);
  assert.equal(plan.commands.emulators.env.DOW_FIREBASE_EMULATOR_LOG_DIRECTORY, directory);
  const receipt = await actualP181PlannedLaunchQualifier(plan);
  assert.equal(receipt.configuration.commands.emulators.env.DOW_FIREBASE_EMULATOR_LOG_DIRECTORY, directory);
  assert.equal(receipt.configuration.commands.emulators.cwd, repositoryRoot,
    'The wrapper remains rooted in the source checkout to resolve its config and source files.');
  assert.equal(receipt.installedFirebase.cwd, directory,
    'The installed Firebase child must use the exact attempt directory for relative debug log output.');
  const configIndex = receipt.installedFirebase.argv.indexOf('--config');
  assert.ok(configIndex >= 0);
  assert.equal(receipt.installedFirebase.argv[configIndex + 1], resolve(repositoryRoot, 'firebase.local.json'),
    'Firebase must retain the explicit absolute source config while its child cwd is isolated.');
  assert.equal(existsSync(directory), false, 'Source-only qualification must validate the future path without creating it.');
});

test('launch readiness rejects missing, mismatched, or leaked Firebase log directory settings', async () => {
  const directory = resolve('/tmp', `p181-planned-log-cases-${process.pid}-${Date.now()}`);
  const cases = [
    { name: 'missing emulator log directory', mutate: plan => { delete plan.commands.emulators.env.DOW_FIREBASE_EMULATOR_LOG_DIRECTORY; } },
    { name: 'mismatched emulator log directory', mutate: plan => { plan.commands.emulators.env.DOW_FIREBASE_EMULATOR_LOG_DIRECTORY = '/tmp/p181-foreign-emulator-logs'; } },
    { name: 'log directory leaked to Vite', mutate: plan => { plan.commands.vite.env.DOW_FIREBASE_EMULATOR_LOG_DIRECTORY = plan.evidenceDirectory; } },
  ];
  for (const change of cases) {
    const plan = p181ReferencePlannedLaunch('a'.repeat(40), directory);
    plan.commands.emulators.env.DOW_FIREBASE_EMULATOR_LOG_DIRECTORY = directory;
    change.mutate(plan);
    const expectedMessage = change.name === 'log directory leaked to Vite'
      ? /Planned P181 vite full environment must contain only/
      : /Planned P181 emulator DOW_FIREBASE_EMULATOR_LOG_DIRECTORY must equal the exact evidence directory/;
    await assert.rejects(actualP181PlannedLaunchQualifier(plan), expectedMessage, change.name);
  }
  assert.equal(existsSync(directory), false, 'Qualification must never create the future attempt directory.');
});

test('launch readiness canonical positive returns an exact installed command receipt and inert digest', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true });
  assertPreflightInert(fixture); assert.equal(fixture.error, undefined);
  assert.equal(fixture.result.status, 'P181_SOURCE_ONLY_PREFLIGHT_PASS');
  assert.deepEqual(localGmAccessConfiguration('serve', fixture.plannedLaunch.commands.vite.env),
    { projectId: fixture.plannedLaunch.projectId, authPort: fixture.plannedLaunch.ports.auth, firestorePort: fixture.plannedLaunch.ports.firestore });
  const receipt = fixture.result.validatedPlannedLaunch;
  assert.ok(receipt, 'The API must return its exact validated command/environment record, not an unqualified build pass.');
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.configuration)), fixture.plannedLaunch);
  assert.equal(receipt.allocationAuthority, false);
  assert.equal(receipt.installedFirebase.packageVersion, '15.29.0');
  assert.equal(receipt.installedFirebase.registryResolution, false);
  assert.equal(receipt.installedFirebase.cwd, fixture.plannedLaunch.evidenceDirectory);
  assert.equal(receipt.installedFirebase.aliasPath, fixture.plannedLaunch.firebaseAliasPath);
  assert.equal(receipt.installedFirebase.executablePath, await realpath(fixture.plannedLaunch.firebaseAliasPath));
  assert.equal(receipt.installedFirebase.entrySha256, p181DeadlineDigest(await readFile(receipt.installedFirebase.executablePath)));
  assert.equal(receipt.nodeExecutable, await realpath(process.execPath));
  assert.equal(receipt.nodeExecutableSha256, p181DeadlineDigest(await readFile(receipt.nodeExecutable)));
  assert.equal(receipt.installedFirebase.packageSha256, p181DeadlineDigest(await readFile(receipt.installedFirebase.packagePath)));
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.environment.publicFirebaseDefaults)), p181CommittedPublicFirebaseEnvironment());
  assert.equal(receipt.environment.publicDefaultsOrigin, 'src/lib/firebaseConfig.ts committed public literals');
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.environment.unreviewedViteNames)), []);
  assert.equal(receipt.environment.dotenvPrecedence, 'Explicit child VITE environment overrides all mode dotenv files.');
  assert.equal(fixture.result.plannedLaunchSha256, p181DeadlineDigest(JSON.stringify(receipt)));
  assert.equal(fixture.counters.contract, 1); assert.equal(fixture.counters.installedMetadata, 1);
});

test('launch readiness unreviewed unrelated VITE names remain disclosed launch limitations', async () => {
  const fixture = await actualPreNativeConsumer({ sourceOnly: true,
    plannedLaunchChange: plan => { plan.commands.vite.env.VITE_FUTURE_UNREVIEWED_SETTING = '1'; } });
  assertPreflightInert(fixture); assert.equal(fixture.error, undefined);
  assert.ok(fixture.result.validatedPlannedLaunch, 'The accepted plan needs an exact record with its unreviewed launch limitations.');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.result.validatedPlannedLaunch.environment.unreviewedViteNames)),
    ['VITE_FUTURE_UNREVIEWED_SETTING']);
  assert.ok(fixture.result.plannedLaunchLimitations.some(value => value.includes('unreviewed VITE')));
});

test('launch readiness actual native served GM check precedes provider and browser acquisition', async () => {
  const fixture = await remainingNativeConsumer({ servedEnvironmentChange: env => { delete env.VITE_LOCAL_GM_ACCESS; } });
  const error = await fixture.program;
  assert.match(error?.message ?? '', /Local GM UI\/plugin opt-in required/);
  assert.deepEqual(fixture.preflightAcquisitions, { provider: 0, browser: 0 });
  assert.equal(fixture.gm.choices.length, 0); assert.equal(fixture.deletedAuth.length, 0);
});

test('pre-native actual CLI retains the genuine source-binding first failure privately with public-safe output', async () => {
  const fixture = await actualPreNativeConsumer({ cli: true });
  assertPreflightInert(fixture); assert.equal(fixture.counters.contract, 0);
  assert.equal(fixture.processFixture.exitCode, 1);
  assert.equal(fixture.firstAssertion?.actual, fixture.currentCommit);
  assert.equal(fixture.firstAssertion?.expected, 'PRIVATE-p181-source-binding-canary');
  const publicOutput = JSON.parse(fixture.stderr);
  assert.equal(publicOutput.status, 'P181_STOPPED_FIRST_FAILURE');
  assert.equal(publicOutput.error.classification, 'assertion-failure');
  assert.equal(publicOutput.error.fingerprint, p181DeadlineDigest(JSON.stringify({ name: 'AssertionError', code: null,
    message: fixture.firstAssertion.message })));
  assert.equal(fixture.stderr.includes('PRIVATE-p181-source-binding-canary'), false);
  assert.equal(fixture.stderr.includes(fixture.firstAssertion.stack), false);
  const files = (await readdir(fixture.directory)).filter(name => name.startsWith('original-failure-'));
  assert.equal(files.length, 1, 'The actual pre-native CLI must retain its first raw error before returning.');
  const path = resolve(fixture.directory, files[0]), retained = JSON.parse(await readFile(path, 'utf8'));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal(retained.originalError.message, fixture.firstAssertion.message);
  assert.equal(retained.originalError.stack, fixture.firstAssertion.stack);
  assert.ok(retained.originalError.expectedInspect.includes('PRIVATE-p181-source-binding-canary'));
  assert.equal(fixture.counters.writer, 1);
});

test('pre-native actual CLI preserves primary binding rejection when its original retention deadline is exhausted', async () => {
  const fixture = await actualPreNativeConsumer({ cli: true, exhaustOnBindingFailure: true });
  assertPreflightInert(fixture); assert.equal(fixture.processFixture.exitCode, 1);
  assert.equal(fixture.firstAssertion?.expected, 'PRIVATE-p181-source-binding-canary');
  assert.equal(JSON.parse(fixture.stderr).error.classification, 'assertion-failure');
  assert.equal(fixture.counters.writer, 0); assert.deepEqual(await readdir(fixture.directory), []);
  assert.equal(fixture.stderr.includes('PRIVATE-p181-source-binding-canary'), false);
});

// The actual core and browser adapter share the existing source-only clock.
// A controlled automatic SDK response is delivered after the unchanged
// 60-second transit, without changing any product or system clock.
async function arrivalDueResponseConsumer({ proofRemainingMs = 300_000, stalled = false, rejected = false } = {}) {
  const clock = remainingLifecycleClock(), consumer = remainingActualModule(clock);
  const { io, state, trace } = makeConsumer({ date: clock.Date });
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  const browserIo = consumer.createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async () => wing }, directory: '/tmp/in-memory-p181-arrival-deadline',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original });
  browserIo.observeMember = io.observeMember;
  browserIo.observeFlight = io.observeFlight;
  io.beginPathAuthority = (...args) => browserIo.beginPathAuthority(...args);
  io.checkPathAuthority = (...args) => browserIo.checkPathAuthority(...args);
  io.finishPathAuthority = (...args) => browserIo.finishPathAuthority(...args);
  const ordinaryWait = wing.page.waitForResponse, deliveries = [];
  let dueAt, issuedDeadlineAt, responseTimeout, automaticResponses = 0;
  wing.page.waitForResponse = (predicate, options) => {
    responseTimeout = options.timeout; issuedDeadlineAt = clock.now() + options.timeout;
    const pending = ordinaryWait(predicate, options);
    deliveries.push(Promise.resolve().then(async () => {
      // Drain the immediate original member read before advancing the existing
      // deterministic clock through a minute of flight. The separate early
      // response case keeps an explicitly delayed pre-read pending.
      await new Promise(done => setImmediate(done));
      clock.advanceTo(dueAt + (stalled ? 60_001 : 80));
      if (stalled) return;
      const transit = structuredClone(state.session.transit);
      const request = { sessionId: 'normal-session', shuttleId: 'starlight',
        transitRequestId: transit.transitRequestId, expectedControlRevision: state.session.control.revision };
      automaticResponses++;
      if (rejected) {
        wing.deliver('completeShuttleArrival', request, undefined,
          { status: 400, error: { status: 'FAILED_PRECONDITION', message: 'Controlled current arrival rejection.' } });
      } else {
        const capture = await io.completeArrival(transit, structuredClone(state.session), state.actor);
        wing.deliver('completeShuttleArrival', capture.request, capture.result);
      }
    }));
    return pending;
  };
  io.waitForArrivalWindow = (transit, timeout, deadlineAt, beforeFlight) => {
    dueAt = clock.Date.parse(transit.arrivesAt);
    browserIo.absoluteDeadlineAt = io.absoluteDeadlineAt;
    return browserIo.waitForArrivalWindow(transit, timeout, deadlineAt, beforeFlight);
  };
  const proofEnd = clock.now() + proofRemainingMs;
  let result, error;
  try { result = await consumer.runP181StarlightMovementScoutUiProof({ ...completeProofInput(io),
    absoluteDeadlineMs: proofEnd, cleanupDeadlineMs: proofEnd + 5_000 }); } catch (failure) { error = failure; }
  await Promise.all(deliveries);
  return { result, error, trace, dueAt, proofEnd, issuedDeadlineAt, responseTimeout, automaticResponses, clock };
}

test('arrival due deadline actual core and browser retain the reply after a full source transit', async () => {
  const observed = await arrivalDueResponseConsumer();
  assert.equal(observed.error, undefined);
  assert.equal(observed.result.status, 'SOURCE_RUNNER_FLOW_COMPLETE');
  assert.equal(observed.issuedDeadlineAt, observed.dueAt + 60_000);
  assert.ok(observed.responseTimeout > 60_000, 'The normal flight must not consume the response window.');
  assert.equal(observed.automaticResponses, 1);
  assert.equal(observed.trace.filter(row => row.endpoint === 'completeShuttleArrival').length, 1);
  assert.ok(observed.trace.some(row => row.ui === 'reload-and-reselect-wing-commander'));
  assert.equal(observed.trace.filter(row => row.endpoint === 'requestScout').length, 2,
    'The unchanged controlled offer includes the first scout and its fuelled second request.');
  assert.equal(observed.result.actualAcceptance, false);
});

test('arrival due deadline actual core and browser preserve the original absolute proof cutoff', async () => {
  const observed = await arrivalDueResponseConsumer({ proofRemainingMs: 60_010 });
  assert.equal(observed.result, undefined);
  assert.match(observed.error?.message ?? '', /deadline/i);
  assert.equal(observed.issuedDeadlineAt, observed.proofEnd);
  assert.equal(observed.trace.some(row => row.ui === 'reload-and-reselect-wing-commander'), false);
  assert.equal(observed.trace.some(row => row.endpoint === 'requestScout'), false);
});

test('arrival due deadline actual core and browser stop at the fixed source due plus response cutoff', async () => {
  const observed = await arrivalDueResponseConsumer({ stalled: true });
  assert.equal(observed.result, undefined);
  assert.match(observed.error?.message ?? '', /deadline/i);
  assert.equal(observed.issuedDeadlineAt, observed.dueAt + 60_000);
  assert.ok(observed.issuedDeadlineAt < observed.proofEnd);
  assert.equal(observed.automaticResponses, 0);
  assert.equal(observed.trace.some(row => row.ui === 'reload-and-reselect-wing-commander'), false);
  assert.equal(observed.trace.some(row => row.endpoint === 'requestScout'), false);
});

test('arrival due deadline actual browser retains rejection rather than granting arrival or choosing an unoffered retry', async () => {
  const observed = await arrivalDueResponseConsumer({ rejected: true });
  assert.equal(observed.result, undefined);
  assert.match(observed.error?.message ?? '', /Retry only/);
  assert.equal(observed.automaticResponses, 1);
  assert.equal(observed.trace.some(row => row.endpoint === 'completeShuttleArrival'), false);
  assert.equal(observed.trace.some(row => row.ui === 'reload-and-reselect-wing-commander'), false);
  assert.equal(observed.trace.some(row => row.endpoint === 'requestScout'), false);
  assert.match(originalProofError(observed.error).heldObservationsInspect, /Controlled current arrival rejection/);
});

// Source-shaped arrival effects: the reducer leaves custody unchanged, consumes
// the current leg, and publishes docking. No emulator, SDK actor or browser runs.
function sourceArrivalAdapter({ custodyAdvance = false, publicationLag = false,
  replayed = false, staleBaseline = false, missingBaseline = false,
  wrongReplyRevision = false } = {}) {
  const now = Date.now();
  const transit = { requestId: 'source-departure', transitRequestId: 'source-trip', shuttleId: 'starlight',
    destinationShipId: 'shepherd', status: 'in-transit', cycle: 1, controlRevision: 4, revision: 2,
    departedAt: new Date(now - 60_001).toISOString(), arrivesAt: new Date(now - 1).toISOString() };
  let flight = { sessionId: 'normal-session', phase: 'active', cycle: 1, airspace: 'lifted',
    activeRoleIds: ['wing-commander'], activeVesselIds: ['aegis', 'shepherd'],
    control: { shuttleId: 'starlight', holderUidHash: original.uidHash, ownerUidHash: original.uidHash, revision: 4 },
    docking: null, departure: null, transit: structuredClone(transit) };
  let observerArms = 0, requests = 0, sourceReads = 0;
  const request = { sessionId: 'normal-session', shuttleId: 'starlight',
    transitRequestId: transit.transitRequestId, expectedControlRevision: 4 };
  const reply = { status: replayed ? 'replayed' : 'arrived', sessionId: 'normal-session',
    requestId: 'arrival-source-trip', transitRequestId: transit.transitRequestId,
    shuttleId: 'starlight', hostShipId: 'shepherd', arrivedAt: new Date(now + 5).toISOString(),
    transitRevision: wrongReplyRevision ? 3 : 2 };
  const response = { url: () => 'http://127.0.0.1:5013/demo-local/us-central1/completeShuttleArrival',
    status: () => 200, request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }),
    json: async () => ({ result: structuredClone(reply) }), opaqueBrowserReference: { marker: 'opaque-browser-reference' } };
  const wing = mountedP181Surface('wing-uid');
  const page = wing.page;
  page.waitForResponse = (predicate, { timeout }) => new Promise((resolve, reject) => {
    observerArms++;
    const deadline = setTimeout(() => reject(new Error('original source arrival deadline expired')), timeout);
    setTimeout(() => {
      requests++;
      const committed = { ...flight, control: { ...flight.control, revision: custodyAdvance ? 5 : 4 },
        docking: { shuttleId: 'starlight', shipId: 'shepherd' }, transit: null };
      flight = publicationLag ? { ...committed, docking: { shuttleId: 'starlight', shipId: 'aegis' } } : committed;
      if (publicationLag) setTimeout(() => { flight = committed; }, 10);
      clearTimeout(deadline);
      if (predicate(response)) resolve(response); else reject(new Error('source arrival request mismatch'));
    }, 5);
  });
  const io = createP181StarlightBrowserIo({ gm: mountedP181Surface('original-gm', { gm: true }), wingCommander: wing,
    gameplay: { async select() {} }, directory: '/tmp/p181-source-arrival-semantics',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original });
  io.observeMember = async () => structuredClone(original);
  io.observeFlight = async () => {
    sourceReads++;
    const value = structuredClone(flight);
    if (sourceReads === 1 && staleBaseline) value.transit.revision = 1;
    if (sourceReads === 1 && missingBaseline) value.transit = null;
    return value;
  };
  const beforeFlight = structuredClone(flight);
  if (staleBaseline) beforeFlight.transit.revision = 1;
  if (missingBaseline) beforeFlight.transit = null;
  return { io, transit, beforeFlight, counts: () => ({ observerArms, requests, sourceReads }) };
}

test('source arrival custody semantics accept unchanged custody and one committed docking', async () => {
  const f = sourceArrivalAdapter();
  const result = await f.io.waitForArrivalWindow(f.transit, 1_000, Date.now() + 1_000, f.beforeFlight);
  assert.deepEqual(result.afterFlight.control, result.beforeFlight.control);
  assert.equal(result.capture.result.status, 'arrived');
  assert.equal(result.capture.result.transitRevision, 2);
  assert.deepEqual(result.afterFlight.docking, { shuttleId: 'starlight', shipId: 'shepherd' });
  assert.equal(result.afterFlight.transit, null);
  assert.equal(f.counts().requests, 1);
});

test('source arrival custody semantics reject a fabricated custody advance with otherwise valid effects', async () => {
  const f = sourceArrivalAdapter({ custodyAdvance: true });
  await assert.rejects(f.io.waitForArrivalWindow(f.transit, 1_000, Date.now() + 1_000, f.beforeFlight), /custody/i);
  assert.equal(f.counts().requests, 1);
});

test('source arrival custody semantics wait for the matching published docking within the original deadline', async () => {
  const f = sourceArrivalAdapter({ publicationLag: true });
  const result = await f.io.waitForArrivalWindow(f.transit, 1_000, Date.now() + 1_000, f.beforeFlight);
  assert.deepEqual(result.afterFlight.control, result.beforeFlight.control);
  assert.equal(result.afterFlight.docking.shipId, 'shepherd');
  assert.ok(f.counts().sourceReads >= 2, 'A lagging original source snapshot needs another read, not another action.');
  assert.equal(f.counts().requests, 1);
});

test('source arrival custody semantics accept exact already-applied receipt without changing custody', async () => {
  const f = sourceArrivalAdapter({ replayed: true });
  const result = await f.io.waitForArrivalWindow(f.transit, 1_000, Date.now() + 1_000, f.beforeFlight);
  assert.equal(result.capture.result.status, 'replayed');
  assert.deepEqual(result.afterFlight.control, result.beforeFlight.control);
  assert.equal(f.counts().requests, 1);
});

test('source arrival custody semantics reject stale and already-deleted baselines before observing a request', async () => {
  for (const options of [{ staleBaseline: true }, { missingBaseline: true }]) {
    const f = sourceArrivalAdapter(options);
    await assert.rejects(f.io.waitForArrivalWindow(f.transit, 1_000, Date.now() + 1_000, f.beforeFlight));
    assert.deepEqual(f.counts(), { observerArms: 0, requests: 0, sourceReads: 0 });
  }
});

test('source arrival custody semantics retain the actual reply when its completed-leg revision is wrong', async () => {
  const f = sourceArrivalAdapter({ wrongReplyRevision: true });
  let failed;
  try { await f.io.waitForArrivalWindow(f.transit, 1_000, Date.now() + 1_000, f.beforeFlight); } catch (error) { failed = error; }
  assert.ok(failed, 'A receipt for another completed leg must fail.');
  assert.match(originalProofError(failed).heldObservationsInspect, /transitRevision: 3/);
  assert.equal(f.counts().requests, 1);
});

test('source arrival core semantics preserve custody through reload and scout to the actual parked host', async () => {
  const { io, trace } = makeConsumer();
  const result = await runP181StarlightMovementScoutUiProof(completeProofInput(io));
  assert.equal(result.movement.finalControl.revision, 4);
  assert.equal(result.movement.finalDocking.shipId, 'shepherd');
  assert.equal(result.scouting.privateReports.length, 2);
  assert.equal(trace.filter(row => row.endpoint === 'completeShuttleArrival').length, 1);
});

test('source arrival core semantics reject an AEGIS scout receiver after a Shepherd docking', async () => {
  const { io } = makeConsumer();
  const request = io.requestScout;
  io.requestScout = async (...args) => {
    const capture = await request(...args);
    return { ...capture, result: { ...capture.result, receivingShipId: 'aegis' } };
  };
  await assert.rejects(runP181StarlightMovementScoutUiProof(completeProofInput(io)), /receiving|parked host/i);
});

test('source arrival core semantics stop on changed custody after reload before any scout request', async () => {
  const { io, trace } = makeConsumer();
  const reload = io.reloadAndReselectWingCommander;
  io.reloadAndReselectWingCommander = async (...args) => {
    const recovered = await reload(...args);
    recovered.flight.control.holderUidHash = 'c'.repeat(16);
    return recovered;
  };
  await assert.rejects(runP181StarlightMovementScoutUiProof(completeProofInput(io)), /holder|custody/i);
  assert.equal(trace.filter(row => row.endpoint === 'requestScout').length, 0);
});

// Exercise the real reload adapter, mounted member reader, and passive SDK
// observer. Only the source-flight subscription port is controlled; no browser,
// Auth provider, emulator, store setter, or gameplay command runs in this test.
async function reloadAuthReadinessFixture(t, { restoredUid = 'wing-uid', pending = false,
  resume = true, foreignSession = false, authorityChange, documentTimeOrigin = 2000,
  settledDocumentTimeOrigin, hydrationDelay = 0, unchangedEpoch = false,
  resetDocumentHydration = false, oldHydrationRevision = 3, newHydrationRevision = 1,
  settledHydrationRevision } = {}) {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  wing.state.identityHydrationRevision = oldHydrationRevision;
  const original = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  const directory = await mkdtemp('/tmp/p181-reload-auth-readiness-');
  let settleAuth, restorationTimer, hydrationTimer;
  wing.authReady = new Promise(resolveReady => { settleAuth = resolveReady; });
  t.after(() => { clearTimeout(restorationTimer); clearTimeout(hydrationTimer); });
  const evaluateMounted = wing.page.evaluate;
  let memberReads = 0;
  wing.page.evaluate = async (callback, args) => {
    if (args && Object.hasOwn(args, 'moduleUrl') && Object.hasOwn(args, 'deadlineAt') &&
        !Object.hasOwn(args, 'knownRoleIds') && String(callback).includes('captureProjection')) {
      return { sessionId: 'normal-session', phase: 'active', cycle: 1, airspace: 'lifted',
        sourceFreshness: 'server', actor: { uidHash: original.uidHash, sessionId: wing.state.session.id,
          documentTimeOrigin: wing.documentTimeOrigin ?? 1000,
          connectionGeneration: wing.state.me.connectionGeneration,
          identityHydrationRevision: wing.state.identityHydrationRevision },
        activeRoleIds: [...originalRoleIds], activeVesselIds: ['aegis', 'icebreaker', 'shepherd'],
        control: { shuttleId: 'starlight', holderUidHash: original.uidHash,
          ownerUidHash: original.uidHash, revision: 4 },
        docking: { shuttleId: 'starlight', shipId: 'shepherd' }, departure: null, transit: null };
    }
    if (args && Object.hasOwn(args, 'knownRoleIds') && ++memberReads === 3) {
      if (settledDocumentTimeOrigin !== undefined) wing.documentTimeOrigin = settledDocumentTimeOrigin;
      if (settledHydrationRevision !== undefined) wing.state.identityHydrationRevision = settledHydrationRevision;
    }
    return evaluateMounted(callback, args);
  };
  wing.page.reload = async options => {
    wing.reloadOptions = options;
    wing.documentTimeOrigin = documentTimeOrigin;
    wing.uid = null;
    if (resetDocumentHydration) wing.state.identityHydrationRevision = 0;
    wing.state.connection = 'connecting'; wing.state.sessionSnapshotFreshness = 'cache';
    wing.state.sdkHasServerAuthority = false; wing.state.sdkResumePending = true;
    if (!pending) restorationTimer = setTimeout(() => {
      wing.uid = restoredUid;
      wing.state.me.connectionGeneration = unchangedEpoch ? 2 : 3;
      wing.state.identityHydrationRevision = resetDocumentHydration
        ? hydrationDelay ? 0 : newHydrationRevision : unchangedEpoch || hydrationDelay ? 3 : 4;
      wing.state.session.currentActorBerthAuthority.connectionGeneration = wing.state.me.connectionGeneration;
      wing.state.connection = 'live'; wing.state.sessionSnapshotFreshness = 'server';
      wing.state.sdkHasServerAuthority = !hydrationDelay; wing.state.sdkResumePending = !!hydrationDelay;
      if (foreignSession) wing.state.session.id = 'foreign-session';
      if (authorityChange === 'revoked-berth') wing.state.session.currentActorBerthAuthority = null;
      if (authorityChange === 'foreign-berth') wing.state.session.currentActorBerthAuthority.actorUid = 'foreign-uid';
      if (authorityChange === 'revoked-seat') wing.state.seats[0].holderUid = 'foreign-uid';
      if (authorityChange === 'pending-sdk') wing.state.sdkResumePending = true;
      if (resume) wing.deliver('resumeSession', { sessionId: 'normal-session' }, {
        session: { id: 'normal-session' }, player: { ...wing.state.me } });
      if (hydrationDelay) hydrationTimer = setTimeout(() => {
        wing.state.identityHydrationRevision = resetDocumentHydration ? newHydrationRevision : 4;
        wing.state.sdkHasServerAuthority = true; wing.state.sdkResumePending = false;
      }, hydrationDelay);
      settleAuth();
    }, 40);
  };
  const selections = [];
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async (roleId, options) => { selections.push({ roleId, ...options }); return wing; } },
    directory, initial: { sessionId: 'normal-session' }, expectedWingCommander: original });
  return { io, wing, original, selections, directory };
}

test('reload Auth readiness actual adapter waits for original Auth and matching normal SDK resume', async t => {
  const { io, wing, original, selections, directory } = await reloadAuthReadinessFixture(t);
  const deadlineAt = Date.now() + 2000;
  const recovered = await io.reloadAndReselectWingCommander(2000, deadlineAt);
  assert.equal(wing.authReadinessCalls, 1);
  assert.equal(recovered.actor.uidHash, original.uidHash);
  assert.equal(recovered.actor.documentTimeOrigin, 2000);
  assert.equal(recovered.actor.connectionGeneration, 3);
  assert.equal(recovered.actor.identityHydrationRevision, 4);
  assert.equal(recovered.resumeEvidence.source, 'normal-resumeSession');
  assert.equal(recovered.resumeEvidence.sdkHasServerAuthority, true);
  assert.equal(recovered.flight.docking.shipId, 'shepherd');
  assert.deepEqual(selections, [{ roleId: 'wing-commander', enter: true, deadlineAt }]);
  const files = await readdir(resolve(directory, 'member-navigation'));
  const evidence = JSON.parse(await readFile(resolve(directory, 'member-navigation', files[0]), 'utf8'));
  assert.equal(evidence.deadlineAt, deadlineAt);
  assert.equal(evidence.noSdkOrGameplayActionIssued, true);
  assert.equal(evidence.documentReload, true);
  assert.equal(evidence.transitions.length, 1);
});

test('reload Auth readiness actual adapter rejects another restored UID before selecting', async t => {
  const { io, wing, original, selections } = await reloadAuthReadinessFixture(t, { restoredUid: 'other-uid' });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), error => {
    assert.equal(error.operator, 'strictEqual');
    assert.equal(error.expected, original.uidHash);
    assert.equal(error.actual, createHash('sha256').update('other-uid').digest('hex').slice(0, 16));
    return true;
  });
  assert.equal(wing.authReadinessCalls, 1); assert.deepEqual(selections, []);
});

test('reload Auth readiness actual adapter rejects settled missing Auth before selecting', async t => {
  const { io, wing, original, selections } = await reloadAuthReadinessFixture(t, { restoredUid: null });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), error => {
    assert.equal(error.operator, 'strictEqual'); assert.equal(error.actual, null);
    assert.equal(error.expected, original.uidHash); return true;
  });
  assert.equal(wing.authReadinessCalls, 1); assert.deepEqual(selections, []);
});

test('reload Auth readiness actual adapter preserves the original deadline while Auth remains pending', async t => {
  const { io, wing, selections } = await reloadAuthReadinessFixture(t, { pending: true });
  const startedAt = Date.now(), deadlineAt = startedAt + 160;
  await assert.rejects(io.reloadAndReselectWingCommander(2000, deadlineAt), /Auth restoration.*deadline/i);
  assert.ok(Date.now() >= deadlineAt); assert.ok(Date.now() - startedAt < 1000);
  assert.equal(wing.authReadinessCalls, 1); assert.deepEqual(selections, []);
});

test('reload Auth readiness actual adapter requires a captured matching SDK resume after restoration', async t => {
  const { io, wing, selections } = await reloadAuthReadinessFixture(t, { resume: false });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /matching normal resume receipt/i);
  assert.equal(wing.authReadinessCalls, 1); assert.deepEqual(selections, []);
});

test('reload Auth readiness actual adapter rejects another restored session before selecting', async t => {
  const { io, wing, selections } = await reloadAuthReadinessFixture(t, { foreignSession: true });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), error => {
    assert.equal(error.operator, 'strictEqual'); assert.equal(error.actual, 'foreign-session');
    assert.equal(error.expected, 'normal-session'); return true;
  });
  assert.equal(wing.authReadinessCalls, 1); assert.deepEqual(selections, []);
});

test('reload Auth readiness actual adapter preserves current berth seat and SDK authority after restoration', async t => {
  for (const authorityChange of ['revoked-berth', 'foreign-berth', 'revoked-seat', 'pending-sdk']) {
    const { io, wing, selections } = await reloadAuthReadinessFixture(t, { authorityChange });
    const deadlineAt = Date.now() + 180;
    await assert.rejects(io.reloadAndReselectWingCommander(2000, deadlineAt), /original.*deadline/i);
    assert.equal(wing.authReadinessCalls, 1);
    assert.deepEqual(selections, [], `Do not select a workspace with ${authorityChange}.`);
  }
});

test('reload Auth readiness actual adapter requires a new document and retains it during SDK acceptance', async t => {
  for (const documentTimeOrigin of [1000, 900]) {
    const { io, selections } = await reloadAuthReadinessFixture(t, { documentTimeOrigin });
    await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /new(?:er)? document/i);
    assert.deepEqual(selections, []);
  }
  const { io, selections } = await reloadAuthReadinessFixture(t, { settledDocumentTimeOrigin: 3000 });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /documentTimeOrigin changed/i);
  assert.deepEqual(selections, []);
});

test('reload Auth readiness actual adapter waits for the original SDK hydration after new lease publication', async t => {
  const { io, directory } = await reloadAuthReadinessFixture(t, { hydrationDelay: 60 });
  const recovered = await io.reloadAndReselectWingCommander(2000, Date.now() + 2000);
  assert.equal(recovered.actor.identityHydrationRevision, 4);
  assert.equal(recovered.actor.sdkResumePending, false);
  const files = await readdir(resolve(directory, 'member-navigation'));
  const evidence = JSON.parse(await readFile(resolve(directory, 'member-navigation', files[0]), 'utf8'));
  assert.ok(evidence.samples.some(sample => sample.current.connectionGeneration === 3 &&
    sample.current.identityHydrationRevision === 3));
  assert.equal(evidence.transitions.length, 1);
});

test('reload Auth readiness actual adapter retains the ordinary observer document identity contract', async () => {
  const wing = mountedP181Surface('wing-uid');
  const before = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  const directory = await mkdtemp('/tmp/p181-ordinary-navigation-document-');
  const observer = createMemberNavigationResumeObserver(wing.page, { directory, roleId: 'wing-commander',
    deadlineAt: Date.now() + 2000, memberContract: 'pc11-live-base' });
  try {
    await observer.prepare(before);
    wing.documentTimeOrigin = 2000; wing.state.me.connectionGeneration = 3;
    wing.state.identityHydrationRevision = 4;
    wing.state.session.currentActorBerthAuthority.connectionGeneration = 3;
    wing.deliver('resumeSession', { sessionId: 'normal-session' }, {
      session: { id: 'normal-session' }, player: { ...wing.state.me } });
    const current = { ...await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds }),
      currentOwnBerthConfirmed: true };
    await assert.rejects(observer.accept(before, current, async () => current), /documentTimeOrigin changed/i);
  } finally { await observer.finish(); }
});

test('reload Auth readiness actual adapter rejects an unchanged document and epoch without a resume receipt', async t => {
  const { io, selections } = await reloadAuthReadinessFixture(t, {
    documentTimeOrigin: 1000, unchangedEpoch: true, resume: false });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /new(?:er)? document/i);
  assert.deepEqual(selections, []);
});

// The October 11 native trace observed old document hydration2 -> new0 -> new1.
// Zustand initializes this counter to0 and does not restore it from persistence.
// These source-shaped transitions exercise the actual adapter/observer/core;
// they are controlled SDK ports, not native gameplay or historical captures.
test('reload document hydration actual contract accepts observed new-document counter1 after old counter2', async t => {
  const { io, original, wing, selections } = await reloadAuthReadinessFixture(t, {
    resetDocumentHydration: true, oldHydrationRevision: 2 });
  const deadlineAt = Date.now() + 2000;
  const recovered = await io.reloadAndReselectWingCommander(2000, deadlineAt);
  assert.equal(original.identityHydrationRevision, 2);
  assert.equal(recovered.actor.identityHydrationRevision, 1);
  assert.equal(recovered.actor.connectionGeneration, 3);
  assert.equal(recovered.actor.uidHash, original.uidHash);
  assert.equal(recovered.actor.documentTimeOrigin, 2000);
  assert.equal(recovered.actor.sdkHasServerAuthority, true);
  assert.equal(recovered.actor.sdkResumePending, false);
  assert.equal(recovered.resumeEvidence.documentTimeOrigin, 2000);
  assert.equal(recovered.resumeEvidence.sdkResumePending, false);
  assert.equal(pc11SameActorEpoch(original, recovered.actor, recovered.resumeEvidence), true);
  assert.equal(wing.authReadinessCalls, 1);
  assert.deepEqual(selections, [{ roleId: 'wing-commander', enter: true, deadlineAt }]);
});

test('reload document hydration actual contract waits within initial deadline for new counter0 to1', async t => {
  const { io, directory } = await reloadAuthReadinessFixture(t, {
    resetDocumentHydration: true, oldHydrationRevision: 2, hydrationDelay: 60 });
  const deadlineAt = Date.now() + 2000;
  const recovered = await io.reloadAndReselectWingCommander(2000, deadlineAt);
  assert.equal(recovered.actor.identityHydrationRevision, 1);
  assert.equal(recovered.actor.sdkResumePending, false);
  const [name] = await readdir(resolve(directory, 'member-navigation'));
  const evidence = JSON.parse(await readFile(resolve(directory, 'member-navigation', name), 'utf8'));
  assert.equal(evidence.deadlineAt, deadlineAt);
  assert.ok(evidence.samples.some(row => row.current.connectionGeneration === 3 && row.current.identityHydrationRevision === 0));
  assert.equal(evidence.transitions.length, 1);
});

test('reload document hydration actual contract never selects without positive hydration and completed SDK authority', async t => {
  for (const options of [{ newHydrationRevision: 0 }, { authorityChange: 'pending-sdk' },
    { authorityChange: 'revoked-berth' }, { authorityChange: 'foreign-berth' }, { authorityChange: 'revoked-seat' }]) {
    const { io, selections } = await reloadAuthReadinessFixture(t, {
      resetDocumentHydration: true, oldHydrationRevision: 2, ...options });
    const deadlineAt = Date.now() + 180;
    await assert.rejects(io.reloadAndReselectWingCommander(2000, deadlineAt), /original.*deadline/i);
    assert.deepEqual(selections, [], JSON.stringify(options));
  }
});

test('reload document hydration actual contract rejects a different hydrated epoch during settled SDK read', async t => {
  const { io, selections } = await reloadAuthReadinessFixture(t, {
    resetDocumentHydration: true, oldHydrationRevision: 2, settledHydrationRevision: 2 });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /hydration|strictly equal/i);
  assert.deepEqual(selections, []);
});

test('reload document hydration actual contract rejects missing normal receipt with a valid reset counter', async t => {
  const { io, selections } = await reloadAuthReadinessFixture(t, {
    resetDocumentHydration: true, oldHydrationRevision: 2, resume: false });
  await assert.rejects(io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /matching normal resume receipt/i);
  assert.deepEqual(selections, []);
});

test('original actor core reload counter accepts new document hydration1 before actual first scout consumer', async () => {
  const { io, state, trace } = makeConsumer();
  state.actor.identityHydrationRevision = 2;
  state.actor.hydrationRevision = 2;
  const expectedWingCommander = { ...state.actor };
  io.reloadAndReselectWingCommander = async () => {
    state.actor = { ...state.actor, documentTimeOrigin: 2000, connectionGeneration: 3,
      generation: 3, identityHydrationRevision: 1, hydrationRevision: 1 };
    return { actor: structuredClone(state.actor), flight: structuredClone(state.session),
      resumeEvidence: { status: 'accepted', source: 'normal-resumeSession', uidHash: state.actor.uidHash,
        sessionId: state.actor.sessionId, connectionGeneration: 3, identityHydrationRevision: 1,
        documentTimeOrigin: 2000, sdkHasServerAuthority: true, sdkResumePending: false } };
  };
  const result = await runP181StarlightMovementScoutUiProof(completeProofInput(io, expectedWingCommander));
  assert.equal(result.movement.finalDocking.shipId, 'shepherd');
  assert.equal(result.scouting.privateReports.length, 2);
  assert.equal(trace.filter(row => row.endpoint === 'requestScout').length, 2);
  assert.equal(io.expectedWingCommander.identityHydrationRevision, 1);
});

for (const [name, change] of [
  ['pending SDK resume', state => { state.actor.sdkResumePending = true; }],
  ['retired SDK authority', state => { state.actor.sdkHasServerAuthority = false; }],
  ['offline member', state => { state.actor.connection = 'offline'; }],
  ['cached member', state => { state.actor.freshness = 'cache'; }],
  ['foreign UID', state => { state.actor.uidHash = 'c'.repeat(16); }],
  ['changed lease', state => { state.actor.connectionGeneration++; }],
  ['changed local hydration', state => { state.actor.identityHydrationRevision++; }],
  ['foreign fleet audience', state => { state.actor.fleetGroupId = 'fleet-2'; }],
  ['revoked berth', state => { state.actor.currentMemberBerthMatches = false; }],
  ['changed custody revision', state => { state.session.control.revision++; }],
  ['changed docking', state => { state.session.docking.shipId = 'icebreaker'; }],
]) {
  test(`delayed private scout actual consumer denies first-scan credit after ${name}`, async () => {
    const { io, state, trace } = makeConsumer();
    const resolveNormally = io.resolveScoutNormally;
    io.resolveScoutNormally = async (...args) => {
      const bundle = await resolveNormally(...args);
      await Promise.resolve();
      change(state);
      // Native normal setup has no fuelled second scan. Do not let a later
      // optional second action accidentally catch a stale first acceptance.
      state.session.scoutOffer.firstRequestAvailable = false;
      state.session.scoutOffer.fuelledSecondRequestAvailable = false;
      return bundle;
    };
    await assert.rejects(runP181StarlightMovementScoutUiProof(completeProofInput(io)),
      /authority|custody|docking|Wing Commander|strictly equal/i);
    assert.equal(trace.filter(row => row.endpoint === 'requestScout').length, 1);
  });
}

// Contemporary complete-path cases reuse the mounted surface, controlled
// receipt producer and exact proof entry. No browser, provider, build or
// resource operation occurs; all private facts remain synthetic test values.
async function completeReadinessAuthority(surface) {
  const ts = createRequire(import.meta.url)('typescript');
  const source = await readFile(resolve(repositoryRoot, 'src/lib/sessionSnapshotAuthority.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  runInNewContext(output, { module, exports: module.exports, require: () => ({}) });
  surface.authorityRuntime = module.exports;
  const authority = module.exports.sessionSnapshotAuthorityFor(surface.state.session.id, surface.uid);
  authority.hasServerSessionAuthority = true;
  delete surface.state.sdkHasServerAuthority; delete surface.state.sdkResumePending;
  return authority;
}
function completeReadinessIo(wing, gm, directory = '/tmp/in-memory-complete-readiness') {
  return createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async () => wing }, directory,
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original });
}

test('complete boundary readiness independent member read waits for matching-epoch App freshness', async t => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  await completeReadinessAuthority(wing);
  wing.publish({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
  const pending = completeReadinessIo(wing, gm).observeMember(Date.now() + 1000);
  const timer = setTimeout(() => wing.publish({ connection: 'live', sessionSnapshotFreshness: 'server' }), 100);
  t.after(() => clearTimeout(timer));
  const member = await pending;
  assert.equal(member.connection, 'live'); assert.equal(member.freshness, 'server');
  assert.equal(member.sdkHasServerAuthority, true); assert.equal(member.sdkResumePending, false);
  assert.equal(wing.observers.stores.size, 0);
});

test('complete boundary readiness member digest observes role retirement even when immediately restored', async () => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  await completeReadinessAuthority(wing);
  let first = true;
  wing.onDigest = () => {
    if (!first) return; first = false;
    wing.publish(state => { state.me.role = 'gm'; });
    wing.publish(state => { state.me.role = 'player'; });
  };
  await assert.rejects(completeReadinessIo(wing, gm).observeMember(Date.now() + 1000), /authority|identity|epoch/i);
  assert.equal(wing.observers.stores.size, 0);
});

test('complete boundary readiness actual transit publication waits for exact retarget revision and destination', async () => {
  const clock = remainingLifecycleClock(), module = remainingActualModule(clock);
  const { io: ordinary, state } = makeConsumer({ date: clock.Date });
  await ordinary.requestDeparture('icebreaker', state.session);
  await ordinary.beginTransit(state.session.departure, state.session);
  const before = structuredClone(state.session);
  const receipt = (await ordinary.retargetTransit(before.transit, 'shepherd', before)).result;
  const successor = structuredClone(state.session);
  const browser = module.createP181StarlightBrowserIo({ gm: { page: {} }, wingCommander: { page: {} },
    gameplay: { select: async () => {} }, directory: '/tmp/in-memory-retarget-publication',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original });
  let reads = 0;
  browser.observeMember = async () => ({ ...original });
  browser.observeFlight = async () => ++reads === 1 ? before : successor;
  const observed = await browser.waitForTransit(receipt, 1000, clock.now() + 1000, before);
  assert.equal(observed.transit.revision, receipt.revision);
  assert.equal(observed.transit.destinationShipId, receipt.destinationShipId);
  assert.equal(reads, 2, 'The same transit ID at the old revision cannot satisfy exact publication.');
});

for (const [name, change] of [
  ['unexpected revision', flight => { flight.transit.revision += 2; }],
  ['foreign leg', flight => { flight.transit.transitRequestId = 'foreign-leg'; }],
  ['changed cycle', flight => { flight.cycle++; }],
]) {
  test(`complete boundary readiness transit publication immediately rejects ${name}`, async () => {
    const clock = remainingLifecycleClock(), module = remainingActualModule(clock);
    const { io: ordinary, state } = makeConsumer({ date: clock.Date });
    await ordinary.requestDeparture('icebreaker', state.session);
    await ordinary.beginTransit(state.session.departure, state.session);
    const receipt = structuredClone(state.session.transit), changed = structuredClone(state.session); change(changed);
    const browser = module.createP181StarlightBrowserIo({ gm: { page: {} }, wingCommander: { page: {} },
      gameplay: { select: async () => {} }, directory: '/tmp/in-memory-rejected-publication',
      initial: { sessionId: 'normal-session' }, expectedWingCommander: original });
    browser.observeMember = async () => ({ ...original });
    let reads = 0; browser.observeFlight = async () => { reads++; return changed; };
    await assert.rejects(browser.waitForTransit(receipt, 1000, clock.now() + 1000), /context|revision|leg|cycle|publication/i);
    assert.equal(reads, 1, 'A terminal changed publication cannot be polled until restoration.');
  });
}

test('complete boundary readiness automatic arrival receipt is armed before delayed member and public leg deletion', async () => {
  const { io: ordinary, state } = makeConsumer();
  await ordinary.requestDeparture('icebreaker', state.session);
  await ordinary.beginTransit(state.session.departure, state.session);
  await ordinary.retargetTransit(state.session.transit, 'shepherd', state.session);
  const before = structuredClone(state.session), transit = before.transit;
  const wing = mountedP181Surface('wing-uid'), browser = completeReadinessIo(wing, mountedP181Surface('original-gm', { gm: true }));
  let armed = false, responses = 0;
  const originalWait = wing.page.waitForResponse;
  wing.page.waitForResponse = (...args) => { armed = true; return originalWait(...args); };
  browser.observeMember = async () => {
    if (!responses) {
      const capture = await ordinary.completeArrival(transit, before);
      responses++;
      wing.deliver('completeShuttleArrival', capture.request, capture.result);
    }
    assert.equal(armed, true, 'The independent automatic response can precede the awaited member read.');
    return { ...original };
  };
  browser.observeFlight = async () => structuredClone(state.session);
  const arrived = await browser.waitForArrivalWindow(transit, 1000, Date.now() + 1000, before);
  assert.equal(arrived.beforeFlight.transit.revision, transit.revision);
  assert.equal(arrived.afterFlight.transit, null); assert.equal(arrived.afterFlight.docking.shipId, 'shepherd');
  assert.equal(responses, 1); assert.equal(wing.choices.length, 0);
});

test('complete boundary readiness reload waits for observed new-document authority module after Auth', async t => {
  const fixture = await reloadAuthReadinessFixture(t, { resetDocumentHydration: true, oldHydrationRevision: 2 });
  const authorityUrl = fixture.wing.sessionAuthorityModuleUrl, reload = fixture.wing.page.reload;
  let observed = true, timer;
  fixture.wing.sessionAuthorityModuleUrl = () => observed ? authorityUrl() : null;
  fixture.wing.page.reload = async (...args) => {
    observed = false; await reload(...args); timer = setTimeout(() => { observed = true; }, 90);
  };
  t.after(() => clearTimeout(timer));
  const recovered = await fixture.io.reloadAndReselectWingCommander(1000, Date.now() + 1000);
  assert.equal(recovered.actor.documentTimeOrigin, 2000); assert.equal(recovered.actor.identityHydrationRevision, 1);
  assert.equal(fixture.selections.length, 1);
});

test('complete boundary readiness reload rejects a second document during role selection before scout', async t => {
  const fixture = await reloadAuthReadinessFixture(t, { resetDocumentHydration: true, oldHydrationRevision: 2 });
  const select = fixture.io; // The existing fixture records the actual chooser boundary.
  fixture.wing.page.getByRole = (_role, options) => ({
    isVisible: async () => options.name === 'Open Starlight shuttle console',
    click: async () => { fixture.wing.documentTimeOrigin = 3000; }, waitFor: async () => {},
  });
  await assert.rejects(select.reloadAndReselectWingCommander(1000, Date.now() + 1000), /document|epoch|authority/i);
});

for (const boundary of ['listMyScoutReports', 'readPrivateScoutResult', 'readMyScoutDiscoveryNote']) {
  test(`complete boundary readiness scout ${boundary} retirement stops private follow-on and reveal`, async () => {
    const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
    await completeReadinessAuthority(wing);
    wing.state.session.shuttleDockings = [{ shuttleId: 'starlight', shipId: 'shepherd' }];
    const { io: ordinary, state } = makeConsumer(); state.session.docking.shipId = 'shepherd';
    const reply = (await ordinary.requestScout('1100', state.session)).result;
    const bundle = await ordinary.resolveScoutNormally(reply), calls = [];
    wing.callable = async name => {
      calls.push(name);
      if (name === boundary) {
        wing.publish(s => { s.me.fleetGroupId = 'fleet-2'; });
        wing.publish(s => { s.me.fleetGroupId = 'fleet-1'; });
      }
      return { status: 'committed', result: name === 'listMyScoutReports' ? [bundle.report]
        : name === 'readPrivateScoutResult' ? bundle.result : bundle.note };
    };
    const browser = completeReadinessIo(wing, gm);
    await assert.rejects(browser.resolveScoutNormally(reply, 1000, Date.now() + 1000), /authority|epoch|context/i);
    assert.equal(calls[0], 'listMyScoutReports');
    if (boundary === 'listMyScoutReports') assert.equal(calls.length, 1);
    if (boundary === 'readPrivateScoutResult') assert.equal(calls.includes('readMyScoutDiscoveryNote'), false);
    assert.equal(gm.choices.length, 0); assert.equal(wing.observers.stores.size, 0);
  });
}

for (const [name, change] of [
  ['retired SDK authority', (wing, authority) => { authority.hasServerSessionAuthority = false; }],
  ['pending SDK resume', (wing, authority) => { wing.authorityRuntime.beginMemberSessionResume(authority); }],
  ['disconnected player', wing => { wing.state.me.connected = false; }],
]) {
  test(`complete boundary readiness cached member immediately rejects ${name}`, async () => {
    const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
    const authority = await completeReadinessAuthority(wing);
    wing.publish({ connection: 'offline', sessionSnapshotFreshness: 'cache' }); change(wing, authority);
    await assert.rejects(completeReadinessIo(wing, gm).observeMember(Date.now() + 1000), /authority|original|epoch/i);
    assert.equal(wing.choices.length, 0); assert.equal(wing.observers.stores.size, 0);
  });
}

test('complete boundary readiness cached member retains its original finite cutoff', async () => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  await completeReadinessAuthority(wing); wing.publish({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
  await assert.rejects(completeReadinessIo(wing, gm).observeMember(Date.now() + 60), /deadline/i);
  // Host and page timers share the cutoff but can be delivered in either
  // order. Late freshness cannot authorize the already-failed operation;
  // allow only its deadline cleanup callback to drain before counting stops.
  wing.publish({ connection: 'live', sessionSnapshotFreshness: 'server' });
  await new Promise(done => setTimeout(done, 10));
  assert.equal(wing.observers.stores.size, 0); assert.equal(wing.choices.length, 0);
});

async function completeReadinessAppFreshness(wing) {
  const source = await readFile(resolve(repositoryRoot, 'src/App.tsx'), 'utf8');
  const start = source.indexOf('        onSessionFreshness: (fresh) => {');
  const endText = "          store.setSessionSnapshotFreshness(fresh ? 'server' : 'cache');";
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(source.indexOf('{', start) + 1, end + endText.length);
  const store = { getState: () => ({ ...wing.state,
    setConnection: connection => wing.publish({ connection }),
    setSessionSnapshotFreshness: sessionSnapshotFreshness => wing.publish({ sessionSnapshotFreshness }) }) };
  return new Function('callbackCurrent', 'pendingStationMemberRefresh', 'useSessionStore', 'playerRole',
    'memberSessionResumeBlocksFreshness', 'sessionSnapshotAuthorityFor', 'sessionId', 'playerUid',
    `return function onSessionFreshness(fresh) {${body}\n};`)(() => true, undefined, store, 'player',
    wing.authorityRuntime.memberSessionResumeBlocksFreshness, wing.authorityRuntime.sessionSnapshotAuthorityFor,
    wing.state.session.id, wing.uid);
}

test('complete boundary readiness one exact-entry sequential replay covers initial callback digest departure arrival reload and first scout', async t => {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  let replayBundle, freshnessRaceIssued = false;
  const playerServiceCalls = [];
  const wingScoutPort = await attachActualScoutResultService(wing, async (name, payload) => {
    playerServiceCalls.push({ name, payload });
    if (name === 'listMyScoutReports') {
      if (!freshnessRaceIssued) {
        freshnessRaceIssued = true;
        wing.publish({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
        timers.push(setTimeout(() => wing.publish({ connection: 'live', sessionSnapshotFreshness: 'server' }), 20));
        return [actualP181Report('discarded-cache-response')];
      }
      return replayBundle ? [replayBundle.report] : [];
    }
    if (name === 'readPrivateScoutResult') return replayBundle.result;
    if (name === 'readMyScoutDiscoveryNote') return replayBundle.note;
    throw new Error('Unexpected player scout callable ' + name);
  });
  await attachActualScoutResultService(gm, async name => {
    if (name === 'listPendingScoutRequests') return [];
    throw new Error('Unexpected GM scout callable ' + name);
  });
  const authority = wingScoutPort.authority;
  const freshness = await completeReadinessAppFreshness(wing);
  wing.state.identityHydrationRevision = 2;
  const actor = { ...original, ...await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds }),
    roleId: 'wing-commander', hydrationRevision: 2 };
  const directory = await mkdtemp('/tmp/p181-complete-sequential-readiness-');
  const { io, state, trace } = makeConsumer(); state.actor = actor;
  const browser = completeReadinessIo(wing, gm, directory); browser.expectedWingCommander = actor;
  io.beginPathAuthority = (...args) => browser.beginPathAuthority(...args);
  io.checkPathAuthority = (...args) => browser.checkPathAuthority(...args);
  io.finishPathAuthority = (...args) => browser.finishPathAuthority(...args);
  const events = [], timers = [];
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  const sync = () => {
    wing.publish(s => {
      s.session.activeVesselIds = [...state.session.activeVesselIds];
      s.session.shuttleDockings = state.session.docking ? [structuredClone(state.session.docking)] : [];
    });
    const movement = state.session.transit ?? (state.session.departure ? {
      ...state.session.departure, status: 'requested', shuttleId: 'starlight', holderUid: 'wing-uid',
      fleetGroupId: 'fleet-1', controlRevision: 4, requestedAt: new Date().toISOString(),
    } : null);
    wing.publishMovement(movement);
  };
  sync();
  let firstFlight = true, digestDip = false, callbackDip = false;
  wing.onDigest = async source => {
    if (digestDip || !source.includes('captureProjection')) return;
    digestDip = true; events.push('digest-cache-withdrawal'); freshness(false);
    await new Promise(done => setImmediate(done)); freshness(true);
  };
  wing.onProtectedAttach = () => {
    if (firstFlight || callbackDip) return;
    callbackDip = true; events.push('protected-callback-cache-withdrawal'); freshness(false);
    timers.push(setTimeout(() => freshness(true), 5));
  };
  io.observeMember = async deadlineAt => {
    browser.expectedWingCommander = io.expectedWingCommander ?? actor;
    const value = await browser.observeMember(deadlineAt);
    state.actor = { ...state.actor, ...value, generation: value.connectionGeneration, hydrationRevision: value.identityHydrationRevision };
    return value;
  };
  io.observeFlight = async deadlineAt => {
    browser.expectedWingCommander = io.expectedWingCommander ?? actor;
    if (firstFlight) {
      firstFlight = false; events.push('initial-cache-sample'); freshness(false);
      timers.push(setTimeout(() => freshness(true), 5));
    }
    return browser.observeFlight(deadlineAt);
  };
  for (const method of ['requestDeparture', 'beginTransit', 'retargetTransit']) {
    const action = io[method]; io[method] = async (...args) => { const value = await action(...args); sync(); return value; };
  }
  const ordinaryRequest = io.requestDeparture;
  io.requestDeparture = async (...args) => {
    const value = await ordinaryRequest(...args);
    freshness(false); events.push('departure-member-cache'); timers.push(setTimeout(() => freshness(true), 5)); return value;
  };
  io.waitForDeparture = (...args) => browser.waitForDeparture(...args);
  io.waitForTransit = (...args) => browser.waitForTransit(...args);
  browser.observeMember = (...args) => createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async () => wing }, directory, initial: { sessionId: 'normal-session' },
    expectedWingCommander: browser.expectedWingCommander }).observeMember(...args);
  let automaticArrival = false;
  const responseWait = wing.page.waitForResponse;
  wing.page.waitForResponse = (...args) => {
    const pending = responseWait(...args);
    if (!automaticArrival) queueMicrotask(async () => {
      automaticArrival = true; const transit = structuredClone(state.session.transit);
      const capture = await io.completeArrival(transit, state.session); sync();
      events.push('arrival-response-before-pre-read'); wing.deliver('completeShuttleArrival', capture.request, capture.result);
    });
    return pending;
  };
  io.waitForArrivalWindow = (...args) => browser.waitForArrivalWindow(...args);
  io.waitForDocking = (...args) => browser.waitForDocking(...args);
  wing.page.reload = async () => {
    events.push('new-document-reload'); wing.documentTimeOrigin = 2000;
    wing.publish(s => {
      s.identityHydrationRevision = 0; s.me.connectionGeneration = 3;
      s.session.currentActorBerthAuthority.connectionGeneration = 3;
    });
    const token = wing.authorityRuntime.beginMemberSessionResume(authority);
    wing.deliver('resumeSession', { sessionId: 'normal-session' }, {
      session: { id: 'normal-session' }, player: { ...wing.state.me } });
    wing.authReady = Promise.resolve();
    timers.push(setTimeout(() => {
      wing.authorityRuntime.finishMemberSessionResume(authority, token, true);
      wing.publish({ identityHydrationRevision: 1 }); freshness(true); events.push('new-document-hydration-one');
    }, 5));
  };
  io.reloadAndReselectWingCommander = (...args) => browser.reloadAndReselectWingCommander(...args);
  const ordinaryOffer = io.currentScoutOffer;
  io.currentScoutOffer = async (...args) => ({ ...await ordinaryOffer(...args), fuelledSecondRequestAvailable: false });
  const ordinaryResolution = io.resolveScoutNormally;
  io.resolveScoutNormally = async reply => {
    replayBundle = await ordinaryResolution(reply);
    return browser.resolveScoutNormally(reply, 2000, Date.now() + 2000);
  };
  const result = await runP181StarlightMovementScoutUiProof(completeProofInput(io, actor));
  assert.equal(result.status, 'SOURCE_RUNNER_FLOW_COMPLETE'); assert.equal(result.actualAcceptance, false);
  assert.equal(result.movement.finalDocking.shipId, 'shepherd'); assert.equal(result.scouting.privateReports.length, 1);
  assert.equal(result.checkpointOrReleaseCredit, 0); assert.equal(result.fixedCatalogClosures, 0);
  assert.ok(playerServiceCalls.filter(row => row.name === 'listMyScoutReports').length >= 2);
  assert.equal(playerServiceCalls.find(row => row.name === 'readPrivateScoutResult').payload.requestId, replayBundle.report.requestId);
  assert.equal(playerServiceCalls.find(row => row.name === 'readMyScoutDiscoveryNote').payload.noteId, replayBundle.report.noteId);
  for (const endpoint of ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit', 'completeShuttleArrival', 'requestScout'])
    assert.equal(trace.filter(row => row.endpoint === endpoint).length, 1, `Exactly one original ${endpoint}.`);
  assert.ok(events.includes('initial-cache-sample')); assert.ok(events.includes('digest-cache-withdrawal'));
  assert.ok(events.includes('protected-callback-cache-withdrawal')); assert.ok(events.includes('departure-member-cache'));
  assert.ok(events.includes('arrival-response-before-pre-read')); assert.ok(events.includes('new-document-hydration-one'));
  assert.equal(io.expectedWingCommander.identityHydrationRevision, 1); assert.equal(io.expectedWingCommander.documentTimeOrigin, 2000);
  assert.equal(wing.observers.stores.size, 0); assert.equal(wing.observers.movements.size, 0);
  assert.equal(wing.observers.attachments, wing.observers.detachments);
});

for (const kind of ['full', 'gm']) {
  test(`complete boundary readiness native ${kind} startup rejects changed original identity before a later restore`, async () => {
    let now = 10, reads = 0;
    const uid = 'startup-original', hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
    const surface = { label: 'normal-gm' }, originalActor = {
      ...original, uidHash: hash(uid), sessionId: 'startup-session', meSessionId: 'startup-session',
      playerRole: 'gm', instanceId: 'original-instance', gmInstanceOwned: true, recoveryPending: false,
      connection: 'offline', freshness: 'cache', documentTimeOrigin: 1000,
    };
    const snapshots = [originalActor, { ...originalActor,
      ...(kind === 'full' ? { uidHash: hash('foreign-uid') } : { connectionGeneration: 3 }) },
      { ...originalActor, connection: 'live', freshness: 'server' }];
    const body = kind === 'full' ? p181FullActorWaitBody : p181GmWaitBody;
    const name = kind === 'full' ? 'waitForFullActor' : 'waitForGm';
    const wait = runInNewContext(`(() => { ${body}; return ${name}; })()`, {
      assert, Date: { now: () => now }, P181_NATIVE_TIMING, pc11GmReadiness, pc11SameActorEpoch,
      retainP181CallerRejection,
      gm: surface, wingCommander: {}, sessionId: 'startup-session', gmInstanceId: 'original-instance',
      ownedAuthUids: new Map([['gm', uid]]), hashShort: hash,
      readFullActor: async () => snapshots[Math.min(reads++, snapshots.length - 1)],
      readGmRecoveryPending: async () => false, bounded: async (_label, action) => action(),
      retainP181MemberAuthority: async () => ({ check: async () => {}, close: async () => {}, failed: new Promise(() => {}) }),
      delay: async amount => { now += amount; },
    });
    await assert.rejects(kind === 'full' ? wait(surface, 'Original startup', value => value.connection === 'live', 1000)
      : wait(1000, { active: true }), /identity|epoch|original|authority/i);
    assert.equal(reads, 2, 'Changed identity or lease must stop at its first observed sample.');
  });
}

// Residual arming regressions execute the real core/retained observer and
// BrowserIo wait. Module and callable ports are inert; SDK authority and its
// lifecycle/turn-phase producers are the actual source, as in the R4 fixture.
for (const retire of [true, false]) {
  test(`reconciled arming original airspace wait retains membership retirement=${retire}`, async t => {
    const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
    await attachActualScoutResultService(wing, async () => assert.fail('No product service call belongs to the airspace arming case.'));
    wing.state.session.turnPhase.airspace.state = 'restricted';
    const browser = completeReadinessIo(wing, gm), { io, trace } = makeConsumer();
    const counts = [];
    let timer, detachments = 0, cleanups = 0;
    wing.onProtectedAttach = () => {
      if (timer) return;
      timer = setTimeout(() => {
        counts.push({ stores: wing.observers.stores.size, movements: wing.observers.movements.size });
        if (retire) {
          wing.publish(s => { s.me.fleetGroupId = 'fleet-retired'; });
          wing.publish(s => { s.me.fleetGroupId = 'fleet-1'; });
        } else {
          wing.publish({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
          wing.publish({ connection: 'live', sessionSnapshotFreshness: 'server' });
        }
        wing.publish(s => { s.session.turnPhase.airspace.state = 'lifted'; });
      }, 30);
    };
    t.after(() => clearTimeout(timer));
    for (const method of ['waitForLiftedAirspace', 'beginPathAuthority', 'checkPathAuthority'])
      io[method] = (...args) => browser[method](...args);
    io.finishPathAuthority = async () => { detachments++; await browser.finishPathAuthority(); };
    io.cleanupOwnedResources = async () => { cleanups++; return { status: 'owned-cleanup-complete' }; };
    const input = completeProofInput(io);
    input.absoluteDeadlineMs = Date.now() + 2_000;
    input.cleanupDeadlineMs = input.absoluteDeadlineMs + 300;
    if (retire) {
      await assert.rejects(runP181StarlightMovementScoutUiProof(input), /authority|identity|epoch|original/i);
      assert.equal(trace.length, 0, 'Retirement in the original airspace wait precedes all movement/scout/UI commands.');
    } else {
      const result = await runP181StarlightMovementScoutUiProof(input);
      assert.equal(result.status, 'SOURCE_RUNNER_FLOW_COMPLETE');
    }
    assert.equal(counts.length, 1);
    assert.ok(counts[0].stores > 0, 'The original Store is observed throughout the airspace polling pause.');
    assert.equal(counts[0].movements, 0, 'The injection follows the completed individual flight read.');
    assert.equal(detachments, 1); assert.equal(cleanups, 1);
    assert.equal(wing.observers.stores.size, 0); assert.equal(wing.observers.auth.size, 0);
    assert.ok(Date.now() < input.absoluteDeadlineMs, 'Neither recovery nor failure extends the original cutoff.');
  });
}

async function reconciledSdkImportGate(wing) {
  await attachActualScoutResultService(wing, async () => assert.fail('Observer installation grants no product service operation.'));
  let entered, release;
  const atSdk = new Promise(done => { entered = done; });
  const gate = new Promise(done => { release = done; });
  wing.beforeModule = async path => {
    if (path.includes('sessionSnapshotAuthority')) { entered(); await gate; }
  };
  return { atSdk, release };
}

for (const mode of ['station', 'navigation']) {
  for (const retire of [true, false]) {
    test(`reconciled arming ${mode} observes available Store during SDK import retirement=${retire}`, async t => {
      const wing = mountedP181Surface('wing-uid'), gate = await reconciledSdkImportGate(wing);
      const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
      const cutoff = Date.now() + 1_000;
      let observer;
      if (mode === 'navigation') observer = await retainP181MemberAuthority(wing, cutoff,
        { mode: 'auth-only', expected: { sessionId: 'normal-session', uidHash: original.uidHash } });
      t.after(async () => { gate.release(); await observer?.close().catch(() => {}); });
      const pending = mode === 'station'
        ? retainP181MemberAuthority(wing, cutoff, { mode, expected: original, pinControl: true })
            .then(value => { observer = value; return value; })
        : observer.pin({ mode, expected: original, pinControl: true, pinDocking: true });
      pending.catch(() => {});
      await gate.atSdk;
      const count = wing.observers.stores.size;
      if (retire) {
        wing.publish(s => { s.me.fleetGroupId = 'fleet-retired'; });
        wing.publish(s => { s.me.fleetGroupId = 'fleet-1'; });
      } else {
        wing.publish({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
        wing.publish({ connection: 'live', sessionSnapshotFreshness: 'server' });
      }
      gate.release();
      if (retire) await assert.rejects(pending, /authority|identity|epoch|original/i);
      else { await pending; await observer.check(); }
      assert.ok(count > 0, 'The available Store is subscribed before the delayed SDK module returns.');
      assert.equal(wing.choices.length, 0); assert.equal(wing.observedBodies.length, 0);
      await observer?.close().catch(() => {});
      assert.equal(wing.observers.stores.size, 0); assert.equal(wing.observers.auth.size, 0);
      assert.equal(wing.observers.storeAttachments, 1); assert.equal(wing.observers.storeDetachments, 1);
      assert.ok(Date.now() < cutoff);
    });
  }
}

test('reconciled arming SDK import cutoff cannot resurrect a retired station observer', async t => {
  const wing = mountedP181Surface('wing-uid'), gate = await reconciledSdkImportGate(wing);
  const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const cutoff = Date.now() + 60;
  const pending = retainP181MemberAuthority(wing, cutoff, { mode: 'station', expected: original, pinControl: true });
  pending.catch(() => {});
  t.after(gate.release);
  await gate.atSdk;
  await new Promise(done => setTimeout(done, 80));
  gate.release();
  await assert.rejects(pending, /deadline|finite/i);
  assert.equal(wing.observers.stores.size, 0); assert.equal(wing.observers.auth.size, 0);
  assert.equal(wing.observers.storeAttachments, 1); assert.equal(wing.observers.storeDetachments, 1);
  assert.equal(wing.window.__p181OriginalMemberObservation, undefined);
});

test('reconciled arming close during new-document SDK import cannot resubscribe or authorize', async t => {
  const wing = mountedP181Surface('wing-uid'), gate = await reconciledSdkImportGate(wing);
  const { retainP181MemberAuthority } = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const observer = await retainP181MemberAuthority(wing, Date.now() + 1_000,
    { mode: 'auth-only', expected: { sessionId: 'normal-session', uidHash: original.uidHash } });
  t.after(gate.release);
  const pending = observer.pin({ mode: 'navigation', expected: original, pinControl: true, pinDocking: true });
  pending.catch(() => {});
  await gate.atSdk;
  await observer.close();
  gate.release();
  await assert.rejects(pending, /ended|authority|original/i);
  assert.equal(wing.observers.stores.size, 0); assert.equal(wing.observers.auth.size, 0);
  assert.equal(wing.observers.storeAttachments, 1); assert.equal(wing.observers.storeDetachments, 1);
  assert.equal(wing.window.__p181OriginalMemberObservation, undefined);
  assert.equal(wing.choices.length, 0);
});

test('complete boundary readiness GM recovery cannot reveal another request at the same coordinate', async () => {
  const clock = remainingLifecycleClock(), module = remainingActualModule(clock);
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  wing.state.session.shuttleDockings = [{ shuttleId: 'starlight', shipId: 'shepherd' }];
  const { io: ordinary, state } = makeConsumer(); state.session.docking.shipId = 'shepherd';
  const reply = (await ordinary.requestScout('1100', state.session)).result;
  const bundle = await ordinary.resolveScoutNormally(reply);
  let revealed = false;
  wing.callable = async name => ({ status: 'committed', result: name === 'listMyScoutReports'
    ? revealed ? [bundle.report] : [] : name === 'readPrivateScoutResult' ? bundle.result : bundle.note });
  gm.callable = async () => ({ status: 'committed', result: [{ requestId: 'another-request', cycle: 1,
    entitlementId: 'starlight', targetCoordinate: reply.targetCoordinate, anchorShipId: 'aegis' }] });
  const gmActor = await observeFullGameDemoPresentationMember(gm, { knownRoleIds: originalRoleIds });
  const browser = module.createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async roleId => roleId === 'gm' ? gm : wing }, directory: '/tmp/in-memory-scout-recovery-request',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original,
    started: { ...gmActor, claimedAt: gm.state.gmInstance.claimedAt } });
  gm.onChoice = async () => {
    revealed = true; gm.deliver('resolvePendingScoutRequest', { sessionId: 'normal-session',
      requestId: 'another-request', instanceId: gm.state.gmInstance.id }, { status: 'resolved', result: bundle.result });
  };
  await assert.rejects(browser.resolveScoutNormally(reply, 2500, clock.now() + 2500), /request|queue|original|authority/i);
  assert.equal(revealed, false); assert.equal(gm.choices.length, 0);
});

test('complete boundary readiness GM authority retired and restored during queue read stops reveal', async () => {
  const clock = remainingLifecycleClock(), module = remainingActualModule(clock);
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  const { io: ordinary, state } = makeConsumer();
  const reply = (await ordinary.requestScout('1100', state.session)).result, bundle = await ordinary.resolveScoutNormally(reply);
  let revealed = false, queueReads = 0;
  wing.callable = async name => ({ status: 'committed', result: name === 'listMyScoutReports'
    ? revealed ? [bundle.report] : [] : name === 'readPrivateScoutResult' ? bundle.result : bundle.note });
  gm.callable = async () => {
    queueReads++;
    gm.publish(s => { s.me.role = 'player'; }); gm.publish(s => { s.me.role = 'gm'; });
    return { status: 'committed', result: [{ requestId: reply.requestId, cycle: reply.cycle,
      entitlementId: reply.entitlementId, targetCoordinate: reply.targetCoordinate, anchorShipId: reply.anchorShipId }] };
  };
  const gmActor = await observeFullGameDemoPresentationMember(gm, { knownRoleIds: originalRoleIds });
  const browser = module.createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async roleId => roleId === 'gm' ? gm : wing }, directory: '/tmp/in-memory-scout-queue-authority',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original,
    started: { ...gmActor, claimedAt: gm.state.gmInstance.claimedAt } });
  gm.onChoice = async () => {
    revealed = true; gm.deliver('resolvePendingScoutRequest', { sessionId: 'normal-session',
      requestId: reply.requestId, instanceId: gm.state.gmInstance.id }, { status: 'resolved', result: bundle.result });
  };
  await assert.rejects(browser.resolveScoutNormally(reply, 2500, clock.now() + 2500), /authority|epoch|original/i);
  assert.equal(queueReads, 1); assert.equal(revealed, false); assert.equal(gm.choices.length, 0);
});

// The reconciled review's counterexamples exercise the existing browser and
// native entry consumers. A retained source sample is passed as data, never as
// a fabricated success receipt. All identities and service ports are inert.
for (const [name, change] of [
  ['destination', leg => { leg.destinationShipId = 'quellon'; }],
  ['departure timestamp', leg => { leg.departedAt = '2026-10-10T00:00:00.000Z'; }],
  ['arrival timestamp', leg => { leg.arrivesAt = '2026-10-10T00:01:00.000Z'; }],
]) {
  test(`reconciled R1 exact retarget predecessor rejects changed ${name} before another read`, async () => {
    const { io: ordinary, state } = makeConsumer();
    await ordinary.requestDeparture('icebreaker', state.session);
    await ordinary.beginTransit(state.session.departure, state.session);
    const before = structuredClone(state.session);
    const receipt = (await ordinary.retargetTransit(before.transit, 'shepherd', before)).result;
    const foreign = structuredClone(before); change(foreign.transit);
    const browser = completeReadinessIo(mountedP181Surface('wing-uid'), mountedP181Surface('original-gm', { gm: true }));
    let reads = 0;
    browser.observeMember = async () => ({ ...original });
    browser.observeFlight = async () => ++reads === 1 ? foreign : structuredClone(state.session);
    await assert.rejects(browser.waitForTransit(receipt, 1000, Date.now() + 1000, before), /predecessor|retained|original|transit/i);
    assert.equal(reads, 1, 'A foreign predecessor cannot wait for restoration or another source sample.');
  });
}

async function reconciledRecoveryFixture() {
  const wing = mountedP181Surface('wing-uid'), gm = mountedP181Surface('original-gm', { gm: true });
  await completeReadinessAuthority(wing); await completeReadinessAuthority(gm);
  const { io: ordinary, state } = makeConsumer();
  const reply = (await ordinary.requestScout('1100', state.session)).result;
  const bundle = await ordinary.resolveScoutNormally(reply);
  const events = { revealed: false, privateReads: 0, queueReads: 0, observerCounts: [] };
  wing.callable = async name => {
    if (name !== 'listMyScoutReports') events.privateReads++;
    return { status: 'committed', result: name === 'listMyScoutReports' ? events.revealed ? [bundle.report] : []
      : name === 'readPrivateScoutResult' ? bundle.result : bundle.note };
  };
  gm.callable = async () => {
    events.queueReads++;
    return { status: 'committed', result: [{ requestId: reply.requestId, cycle: reply.cycle,
      entitlementId: reply.entitlementId, targetCoordinate: reply.targetCoordinate, anchorShipId: reply.anchorShipId }] };
  };
  const gmActor = await observeFullGameDemoPresentationMember(gm, { knownRoleIds: originalRoleIds });
  const browser = createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async roleId => roleId === 'gm' ? gm : wing }, directory: '/tmp/in-memory-reconciled-recovery',
    initial: { sessionId: 'normal-session' }, expectedWingCommander: original,
    started: { ...gmActor, claimedAt: gm.state.gmInstance.claimedAt } });
  gm.onChoice = async () => {
    events.revealed = true;
    gm.deliver('resolvePendingScoutRequest', { sessionId: 'normal-session', requestId: reply.requestId,
      instanceId: gm.state.gmInstance.id }, { status: 'resolved', result: bundle.result });
  };
  return { wing, gm, browser, reply, bundle, events };
}

test('reconciled R2 Wing retirement and restoration during GM queue blocks reveal and private follow-on', async () => {
  const f = await reconciledRecoveryFixture(), queue = f.gm.callable;
  f.gm.callable = async (...args) => {
    f.events.observerCounts.push(f.wing.observers.stores.size);
    f.wing.publish(s => { s.me.fleetGroupId = 'fleet-retired'; });
    f.wing.publish(s => { s.me.fleetGroupId = 'fleet-1'; });
    return queue(...args);
  };
  await assert.rejects(f.browser.resolveScoutNormally(f.reply, 2500, Date.now() + 2500), /authority|epoch|original|member/i);
  assert.equal(f.events.revealed, false); assert.equal(f.events.privateReads, 0);
  assert.equal(f.gm.choices.length, 0); assert.equal(f.events.queueReads, 1);
  assert.ok(f.events.observerCounts.every(count => count > 0));
  assert.equal(f.wing.observers.stores.size, 0); assert.equal(f.gm.observers.stores.size, 0);
});

for (const boundary of ['recovery state', 'lifecycle claim']) {
  test(`reconciled R2 GM retirement and restoration during ${boundary} blocks reveal`, async () => {
    const f = await reconciledRecoveryFixture(), evaluate = f.gm.page.evaluate;
    let retired = false;
    f.gm.page.evaluate = async (callback, args) => {
      const atBoundary = boundary === 'recovery state' ? typeof args === 'string' && String(callback).includes('gmRecoveryPending')
        : args?.expectedSessionId === 'normal-session' && !Object.hasOwn(args, 'knownRoleIds');
      if (atBoundary && !retired) {
        retired = true; f.events.observerCounts.push(f.gm.observers.stores.size);
        f.gm.publish(s => { s.me.role = 'player'; }); f.gm.publish(s => { s.me.role = 'gm'; });
      }
      return evaluate(callback, args);
    };
    await assert.rejects(f.browser.resolveScoutNormally(f.reply, 2500, Date.now() + 2500), /authority|epoch|original|member|role/i);
    assert.equal(retired, true); assert.equal(f.events.revealed, false); assert.equal(f.events.privateReads, 0);
    assert.equal(f.gm.choices.length, 0); assert.ok(f.events.observerCounts.every(count => count > 0));
  });
}

for (const boundary of ['response wait', 'response body']) {
  test(`reconciled R2 arrival ${boundary} preserves terminal custody retirement after restoration`, async t => {
    const { io: ordinary, state } = makeConsumer();
    await ordinary.requestDeparture('icebreaker', state.session);
    await ordinary.beginTransit(state.session.departure, state.session);
    const before = structuredClone(state.session), transit = before.transit;
    const capture = await ordinary.completeArrival(transit, before);
    const wing = mountedP181Surface('wing-uid'), browser = completeReadinessIo(wing, mountedP181Surface('original-gm', { gm: true }));
    const counts = [], retire = () => {
      counts.push(wing.observers.stores.size);
      wing.publish(s => { s.session.shuttleControl.starlight.revision++; });
      wing.publish(s => { s.session.shuttleControl.starlight.revision--; });
    };
    browser.observeMember = async () => ({ ...original });
    browser.observeFlight = async () => structuredClone(state.session);
    const wait = wing.page.waitForResponse;
    let delivered = 0, timer;
    wing.page.waitForResponse = (...args) => {
      const pending = wait(...args);
      timer = setTimeout(() => {
        delivered++;
        if (boundary === 'response wait') retire();
        wing.deliver('completeShuttleArrival', capture.request, capture.result,
          { bodyWait: boundary === 'response body' ? async () => retire() : undefined });
      }, 30);
      return pending;
    };
    t.after(() => clearTimeout(timer));
    await assert.rejects(browser.waitForArrivalWindow(transit, 1000, Date.now() + 1000, before), /authority|custody|epoch|original/i);
    assert.equal(delivered, 1); assert.ok(counts.every(count => count > 0));
    assert.equal(wing.choices.length, 0); assert.equal(wing.observers.stores.size, 0);
  });
}

test('reconciled R3 Auth retirement and restoration during new-document UID digest stops reselection', async t => {
  const f = await reloadAuthReadinessFixture(t, { resetDocumentHydration: true, oldHydrationRevision: 2 });
  f.wing.state.session.shuttleDockings = [{ shuttleId: 'starlight', shipId: 'shepherd' }];
  let retired = false;
  f.wing.onDigest = callback => {
    if (retired || !callback.includes('return { uidHash, documentTimeOrigin:')) return;
    retired = true; f.wing.publishAuth(null); f.wing.publishAuth({ uid: 'wing-uid' });
  };
  await assert.rejects(f.io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /auth|identity|authority|original/i);
  assert.equal(retired, true); assert.equal(f.selections.length, 0);
});

for (const [name, retire, restore] of [
  ['fleet group', s => { s.me.fleetGroupId = 'fleet-retired'; }, s => { s.me.fleetGroupId = 'fleet-1'; }],
  ['own seat', s => { s.seats[0].holderUid = 'foreign-uid'; }, s => { s.seats[0].holderUid = 'wing-uid'; }],
  ['custody', s => { s.session.shuttleControl.starlight.revision++; }, s => { s.session.shuttleControl.starlight.revision--; }],
]) {
  test(`reconciled R3 accepted document ${name} retirement during console reopen blocks recovery`, async t => {
    const f = await reloadAuthReadinessFixture(t, { resetDocumentHydration: true, oldHydrationRevision: 2 });
    f.wing.state.session.shuttleDockings = [{ shuttleId: 'starlight', shipId: 'shepherd' }];
    const getByRole = f.wing.page.getByRole, counts = [];
    f.wing.page.getByRole = (role, options) => {
      const locator = getByRole(role, options);
      if (role === 'link' && options?.name === 'Open Starlight shuttle console') {
        const click = locator.click;
        locator.click = async (...args) => { counts.push(f.wing.observers.stores.size);
          f.wing.publish(retire); f.wing.publish(restore); return click(...args); };
      }
      return locator;
    };
    await assert.rejects(f.io.reloadAndReselectWingCommander(2000, Date.now() + 2000), /authority|custody|identity|epoch|original/i);
    assert.equal(counts.length, 1); assert.ok(counts[0] > 0);
    assert.equal(f.wing.observers.stores.size, 0);
  });
}

async function reconciledNativeWait(surface, kind, readRecovery) {
  const sourceModule = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const name = kind === 'full' ? 'waitForFullActor' : 'waitForGm';
  const body = kind === 'full' ? p181FullActorWaitBody : p181GmWaitBody;
  const owner = surface.state?.me?.role === 'gm' ? 'gm' : 'wing-commander';
  const context = { assert, Date, P181_NATIVE_TIMING, pc11GmReadiness, pc11SameActorEpoch,
    gm: owner === 'gm' ? surface : {}, wingCommander: owner === 'wing-commander' ? surface : {}, admiral: {},
    sessionId: 'normal-session', gmInstanceId: 'gm-original-instance',
    normalPreparationDiagnostic: { active: true, frozen: false, actorRole: owner, surface,
      activeAwaitedOperation: null, pendingReadiness: null, steps: [] },
    p181PreparationTuple: sourceModule.p181PreparationTuple,
    retainP181CallerRejection: sourceModule.retainP181CallerRejection,
    ownedAuthUids: new Map([[owner, surface.uid]]),
    hashShort: value => createHash('sha256').update(value).digest('hex').slice(0, 16),
    readFullActor: async () => observeFullGameDemoPresentationMember(surface, { knownRoleIds: originalRoleIds }),
    readGmRecoveryPending: readRecovery ?? (async () => false),
    bounded: async (_label, action) => action(), delay: async amount => new Promise(done => setTimeout(done, amount)),
    retainP181MemberAuthority: sourceModule.retainP181MemberAuthority };
  const markerStart = p181DeadlineSource.indexOf('  const markPreparationActor =', p181NativeEntry);
  const markerEnd = p181DeadlineSource.indexOf('\n  const bounded =', markerStart);
  assert.ok(markerStart > p181NativeEntry && markerEnd > markerStart);
  context.markPreparationActor = runInNewContext(p181DeadlineSource.slice(markerStart,markerEnd) + '\nmarkPreparationActor',context);
  return runInNewContext(`(() => { ${body}; return ${name}; })()`, context);
}

test('reconciled R5 exact native startup detects Auth retirement and restoration during member digest', async () => {
  const gm = mountedP181Surface('original-gm', { gm: true });
  let retired = false;
  gm.onDigest = () => { if (retired) return; retired = true; gm.publishAuth(null); gm.publishAuth({ uid: 'original-gm' }); };
  const wait = await reconciledNativeWait(gm, 'full');
  await assert.rejects(wait(gm, 'Original startup', () => true, Date.now() + 1000), /auth|identity|authority|original/i);
  assert.equal(retired, true); assert.equal(gm.observers.auth.size, 0);
});

for (const restore of [false, true]) {
  test(`reconciled R5 exact GM recovery read cannot return earlier authority after role loss restore=${restore}`, async () => {
    const gm = mountedP181Surface('original-gm', { gm: true });
    const counts = [], wait = await reconciledNativeWait(gm, 'gm', async () => {
      counts.push(gm.observers.stores.size);
      gm.publish(s => { s.me.role = 'player'; });
      if (restore) gm.publish(s => { s.me.role = 'gm'; });
      return false;
    });
    await assert.rejects(wait(Date.now() + 1000, { active: true }), /auth|identity|authority|original|role/i);
    assert.equal(counts.length, 1); assert.ok(counts[0] > 0);
    assert.equal(gm.observers.stores.size, 0);
  });
}

// Append below the existing mountedP181Surface / VM fixture definitions in
// scripts/pc10-starlight-movement-scout-ui-proof-runner.test.mjs. Requires ROOT's
// surface.scoutRuntime module-loader preference and persistent surface.window hook.
async function attachActualScoutResultService(surface, provider) {
  const ts = createRequire(import.meta.url)('typescript');
  assert.ok(surface.window?.navigator, 'Use the mounted surface persistent window port.');
  const compile = async (relative, dependencies = {}) => {
    const source = await readFile(resolve(repositoryRoot, relative), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const module = { exports: {} };
    runInNewContext(output, { module, exports: module.exports, window: surface.window,
      require(name) {
        assert.ok(Object.hasOwn(dependencies, name),
          'Only an explicitly inert module port is allowed for ' + name + ' from ' + relative + '.');
        return dependencies[name];
      },
    }, { filename: relative });
    return module.exports;
  };
  const turnPhase = await compile('src/lib/turnPhase.ts');
  const lifecycle = await compile('functions/src/lifecycle.ts');
  const authorityRuntime = await compile('src/lib/sessionSnapshotAuthority.ts', {
    './turnPhase': turnPhase,
    '../../functions/src/lifecycle': lifecycle,
  });
  surface.authorityRuntime = authorityRuntime;
  const authority = authorityRuntime.sessionSnapshotAuthorityFor(surface.state.session.id, surface.uid);
  assert.equal(authorityRuntime.acceptServerSessionAuthority(authority, surface.state.session,
    { seconds: 1, nanoseconds: 0 }), true);
  delete surface.state.sdkHasServerAuthority;
  delete surface.state.sdkResumePending;

  const store = { useSessionStore: { getState: () => surface.state } };
  const mutationAuthority = await compile('src/lib/sessionMutationAuthority.ts', {
    '@/store/useSessionStore': store,
    './sessionSnapshotAuthority': authorityRuntime,
  });
  const requestAuthority = await compile('src/lib/scoutRequestAuthority.ts', {
    './turnPhase': turnPhase,
  });
  const service = await compile('src/lib/scoutResultService.ts', {
    'firebase/functions': {
      httpsCallable: (_functions, name) => async payload => ({
        data: await provider(name, payload, { authorityRuntime, authority }),
      }),
    },
    '@/store/useSessionStore': store,
    './firebase': { functions: () => ({ inertControlledCallablePort: true }) },
    './scoutRequestAuthority': requestAuthority,
    './sessionMutationAuthority': mutationAuthority,
  });
  surface.scoutRuntime = service;
  return { service, authorityRuntime, authority };
}

function actualP181PlayerScoutRead(surface, deadlineAt) {
  return observeP181StarlightSource(surface, deadlineAt, { scoutRead: {
    name: 'listMyScoutReports', args: [], cycle: 1, hostShipId: 'aegis',
  } });
}

function actualP181Report(requestId, status = 'pending', noteId = null) {
  return { requestId, cycle: 1, entitlementId: 'starlight', targetCoordinate: '1100',
    status, noteId };
}

function actualP181QueueRow(requestId) {
  return { requestId, cycle: 1, entitlementId: 'starlight',
    anchorShipId: 'aegis', targetCoordinate: '1100' };
}

function advanceActualP181Cursor(surface, port, seconds) {
  surface.publish(state => {
    state.session = { ...state.session, p181R4GuardedReadWitness: 'same member and phase' };
  });
  assert.equal(port.authorityRuntime.acceptServerSessionAuthority(port.authority,
    surface.state.session, { seconds, nanoseconds: 0 }), true);
}

test('R4 actual scout service discards a player reply made cache-stale and rereads under the same member', async () => {
  const wing = mountedP181Surface('wing-uid');
  let calls = 0, firstAt, secondAt, restore;
  const actual = await attachActualScoutResultService(wing, async name => {
    assert.equal(name, 'listMyScoutReports');
    calls++;
    if (calls === 1) {
      firstAt = Date.now();
      wing.publish({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
      restore = setTimeout(() => wing.publish({ connection: 'live', sessionSnapshotFreshness: 'server' }), 20);
      return [actualP181Report('stale-cache-reply')];
    }
    secondAt = Date.now();
    return [actualP181Report('current-live-reply')];
  });
  try {
    const value = await actualP181PlayerScoutRead(wing, Date.now() + 4_000);
    assert.equal(value.scoutValue[0].requestId, 'current-live-reply',
      'Discard the valid but stale asynchronous response and return only the fresh guarded read.');
    assert.equal(calls, 2, 'One exact authority error permits one new service read.');
    assert.ok(secondAt - firstAt >= 900, 'Use the published one-second player recovery interval.');
    assert.equal(wing.state.me.uid, 'wing-uid');
    assert.equal(wing.state.me.role, 'player');
    assert.equal(wing.state.session.currentTurn, 1);
    assert.equal(actual.authority.hasServerSessionAuthority, true);
    assert.equal(wing.observers.stores.size, 0);
    assert.equal(wing.observers.movements.size, 0);
    assert.equal(wing.observers.attachments, wing.observers.detachments);
  } finally { if (restore) clearTimeout(restore); }
});

test('R4 actual scout service discards a player reply after a newer server cursor and rereads within the original cutoff', async () => {
  const wing = mountedP181Surface('wing-uid');
  let calls = 0, firstAt, secondAt;
  const actual = await attachActualScoutResultService(wing, async name => {
    assert.equal(name, 'listMyScoutReports');
    calls++;
    if (calls === 1) {
      firstAt = Date.now();
      advanceActualP181Cursor(wing, actual, 2);
      return [actualP181Report('cursor-stale-reply')];
    }
    secondAt = Date.now();
    return [actualP181Report('cursor-current-reply')];
  });
  const originalCutoff = Date.now() + 4_000;
  const value = await actualP181PlayerScoutRead(wing, originalCutoff);
  assert.equal(value.scoutValue[0].requestId, 'cursor-current-reply');
  assert.equal(calls, 2);
  assert.ok(secondAt - firstAt >= 900, 'Restart the guarded report read on the existing one-second interval.');
  assert.ok(Date.now() < originalCutoff, 'A retry retains the operation original cutoff.');
  assert.equal(wing.state.session.phase, 'active');
  assert.equal(wing.state.session.currentTurn, 1);
  assert.equal(wing.state.me.uid, 'wing-uid');
  assert.equal(wing.state.me.role, 'player');
  assert.equal(wing.observers.stores.size, 0);
  assert.equal(wing.observers.movements.size, 0);
});

for (const terminal of ['member-retirement', 'access-denial', 'malformed-data']) {
  test('R4 actual scout service never retries terminal ' + terminal, async () => {
    const wing = mountedP181Surface('wing-uid');
    let calls = 0;
    await attachActualScoutResultService(wing, async name => {
      assert.equal(name, 'listMyScoutReports');
      calls++;
      if (terminal === 'member-retirement') {
        wing.publish(state => { state.me.role = 'gm'; });
        wing.publish(state => { state.me.role = 'player'; });
        return [actualP181Report('must-not-be-used')];
      }
      if (terminal === 'access-denial') {
        throw Object.assign(new Error('controlled access denial'), { code: 'permission-denied' });
      }
      return [{ requestId: 47, invalid: true }];
    });
    const cutoff = Date.now() + 2_000;
    await assert.rejects(actualP181PlayerScoutRead(wing, cutoff),
      terminal === 'member-retirement' ? /authority|identity|retired/i
        : terminal === 'access-denial' ? /controlled access denial|permission/i
          : /invalid report index/i);
    await new Promise(done => setTimeout(done, 15));
    assert.equal(calls, 1, 'Only the exact known authority-change error may retry.');
    assert.equal(Date.now() < cutoff, true);
    assert.equal(wing.observers.stores.size, 0);
    assert.equal(wing.observers.movements.size, 0);
  });
}

test('R4 actual player cursor churn stops at two exact-error retries and keeps the original cutoff', async () => {
  const wing = mountedP181Surface('wing-uid');
  let calls = 0, firstAt, lastAt;
  const actual = await attachActualScoutResultService(wing, async name => {
    assert.equal(name, 'listMyScoutReports');
    calls++;
    if (calls === 1) firstAt = Date.now();
    lastAt = Date.now();
    advanceActualP181Cursor(wing, actual, calls + 1);
    return [actualP181Report('churned-stale-' + calls)];
  });
  const cutoff = Date.now() + 4_500;
  await assert.rejects(actualP181PlayerScoutRead(wing, cutoff), /authority|retry|deadline/i);
  assert.equal(calls, 3, 'Allow the original read plus at most two published retries.');
  assert.ok(lastAt - firstAt >= 1_800, 'Each retry uses the existing one-second restart interval.');
  assert.ok(Date.now() < cutoff, 'Retry-cap exhaustion does not renew or consume a fresh operation cutoff.');
  assert.equal(wing.observers.stores.size, 0);
  assert.equal(wing.observers.movements.size, 0);
});

test('R4 actual player retry expires at its original cutoff while the guarded service reply is pending', async () => {
  const wing = mountedP181Surface('wing-uid');
  let calls = 0;
  const actual = await attachActualScoutResultService(wing, async name => {
    assert.equal(name, 'listMyScoutReports');
    calls++;
    await new Promise(done => setTimeout(done, 150));
    advanceActualP181Cursor(wing, actual, 2);
    return [actualP181Report('late-stale-reply')];
  });
  await assert.rejects(actualP181PlayerScoutRead(wing, Date.now() + 70), /deadline|expired|timeout/i);
  await new Promise(done => setTimeout(done, 180));
  assert.equal(calls, 1, 'A late response cannot start a retry after the original operation cutoff.');
  assert.equal(wing.observers.stores.size, 0);
  assert.equal(wing.observers.movements.size, 0);
});

test('R4 actual GM queue cursor rejection is discarded until a five-second guarded reread binds the original request', async () => {
  const { io: producer, state } = makeConsumer();
  const reply = (await producer.requestScout('1100', state.session)).result;
  const bundle = await producer.resolveScoutNormally(reply);
  const wing = mountedP181Surface('wing-uid');
  const gm = mountedP181Surface('original-gm', { gm: true });
  let revealed = false, playerReads = 0, queueReads = 0;
  const queueTimes = [], revealChoices = [];
  const pendingReport = actualP181Report(reply.requestId, 'pending', null);
  const expectedQueue = actualP181QueueRow(reply.requestId);
  const rejectedQueue = actualP181QueueRow('newer-but-not-original-request');
  await attachActualScoutResultService(wing, async name => {
    if (name === 'listMyScoutReports') {
      playerReads++;
      return [revealed ? bundle.report : pendingReport];
    }
    if (name === 'readPrivateScoutResult') return bundle.result;
    if (name === 'readMyScoutDiscoveryNote') return bundle.note;
    throw new Error('Unexpected player scout callable ' + name);
  });
  const gmPort = await attachActualScoutResultService(gm, async name => {
    assert.equal(name, 'listPendingScoutRequests');
    queueReads++;
    queueTimes.push(Date.now());
    if (queueReads === 1) {
      advanceActualP181Cursor(gm, gmPort, 2);
      return [rejectedQueue];
    }
    return [expectedQueue];
  });
  const expectedWing = await observeFullGameDemoPresentationMember(wing, { knownRoleIds: originalRoleIds });
  const observedGm = await observeFullGameDemoPresentationMember(gm, { knownRoleIds: originalRoleIds });
  const started = { ...observedGm, claimedAt: gm.state.gmInstance.claimedAt };
  const browser = createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { select: async role => role === 'gm' ? gm : wing },
    directory: '/tmp/in-memory-r4-gm-queue-recovery',
    initial: { sessionId: 'normal-session' }, started, expectedWingCommander: expectedWing });
  gm.onChoice = async name => {
    if (name !== 'Reveal Starlight scout at 1100') return;
    revealChoices.push(name);
    revealed = true;
    gm.deliver('resolvePendingScoutRequest', {
      sessionId: 'normal-session', requestId: reply.requestId, instanceId: gm.state.gmInstance.id,
    }, { status: 'resolved', result: bundle.result });
  };
  const cutoff = Date.now() + 12_000;
  const value = await browser.resolveScoutNormally(reply, 12_000, cutoff);
  assert.equal(value.report.requestId, reply.requestId);
  assert.equal(value.result.requestId, reply.requestId);
  assert.equal(value.note.id, bundle.note.id);
  assert.equal(playerReads >= 2, true);
  assert.equal(queueReads, 2, 'The rejected old queue is discarded and a fresh service queue is obtained.');
  assert.ok(queueTimes[1] - queueTimes[0] >= 4_900,
    'The next GM queue read follows the published five-second reload interval.');
  assert.deepEqual(revealChoices, ['Reveal Starlight scout at 1100']);
  assert.equal(gm.observedBodies.filter(row => row.endpoint === 'resolvePendingScoutRequest').length, 1);
  assert.deepEqual(gm.observedBodies.find(row => row.endpoint === 'resolvePendingScoutRequest').data, {
    sessionId: 'normal-session', requestId: reply.requestId, instanceId: 'gm-original-instance',
  });
  assert.equal(gm.state.me.uid, 'original-gm');
  assert.equal(gm.state.me.role, 'gm');
  assert.equal(gm.state.gmInstance.id, 'gm-original-instance');
  assert.equal(gm.state.session.currentTurn, 1);
  assert.equal(gm.observers.stores.size, 0);
  assert.equal(wing.observers.stores.size, 0);
});

test('reconciled retained observer installation keeps the exact core cutoff and one cleanup', async () => {
  const { io } = makeConsumer();
  let detached = 0, cleaned = 0;
  io.beginPathAuthority = async () => new Promise(() => {});
  io.finishPathAuthority = async () => { detached++; };
  const cleanup = io.cleanupOwnedResources;
  io.cleanupOwnedResources = async (...args) => { cleaned++; return cleanup(...args); };
  const input = completeProofInput(io);
  input.absoluteDeadlineMs = Date.now() + 40; input.cleanupDeadlineMs = Date.now() + 300;
  const proof = runP181StarlightMovementScoutUiProof(input).then(
    value => ({ value }), error => ({ error }));
  const result = await Promise.race([proof, new Promise(resolve => setTimeout(() => resolve({ stalled: true }), 120))]);
  assert.equal(result.stalled, undefined, 'Stalled observer installation must stop at the existing core cutoff.');
  assert.match(result.error?.message ?? '', /deadline|finite/i);
  assert.equal(detached, 1); assert.equal(cleaned, 1);
});

for (const kind of ['full', 'gm']) {
  test(`reconciled retained ${kind} startup observer installation keeps the original readiness cutoff`, async () => {
    const body = kind === 'full' ? p181FullActorWaitBody : p181GmWaitBody;
    const name = kind === 'full' ? 'waitForFullActor' : 'waitForGm';
    const gm = {}, uid = 'original-gm', timers = new Set();
    const wait = runInNewContext(`(() => { ${body}; return ${name}; })()`, {
      assert, Date, P181_NATIVE_TIMING, gm, sessionId: 'normal-session', gmInstanceId: 'gm-original-instance',
      ownedAuthUids: new Map([['gm', uid]]),
      hashShort: value => createHash('sha256').update(value).digest('hex').slice(0, 16),
      retainP181MemberAuthority: async () => new Promise(() => {}),
      bounded: async (label, action, deadlineAt) => {
        let timer;
        try { return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error(label + ': original deadline expired.'),
            { name: 'TimeoutError' })), Math.max(0, deadlineAt - Date.now())); timers.add(timer);
        })]); } finally { clearTimeout(timer); timers.delete(timer); }
      },
    });
    const deadlineAt = Date.now() + 40;
    const operation = (kind === 'full' ? wait(gm, 'Original startup', () => true, deadlineAt)
      : wait(deadlineAt, { active: true })).then(value => ({ value }), error => ({ error }));
    const result = await Promise.race([operation, new Promise(resolve => setTimeout(() => resolve({ stalled: true }), 120))]);
    for (const timer of timers) clearTimeout(timer);
    assert.equal(result.stalled, undefined, 'The native consumer must bound its observer installation.');
    assert.equal(result.error?.name, 'TimeoutError');
  });
}
for (const [field, change, expectedValue, expectedKind] of [
  ['connection', state => { state.connection = 'idle'; }, 'idle', 'string'],
  ['assignedRoleId', state => { state.me.assignedRoleId = 'admiral'; }, 'admiral', 'string'],
  ['setupConfirmed', state => { state.session.setupConfirmed = false; }, false, 'boolean'],
  ['setupConfirmed', state => { delete state.session.setupConfirmed; }, null, 'undefined'],
  ['cycle', state => { state.session.currentTurn = 1; }, 1, 'number'],
]) {
  test(`P181 first rejected casting state retains ${field} ${expectedKind} through original failure transport`, async t => {
    const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
    const authority = await castingAssignmentAuthorityFor(f);
    const moduleReads = [];
    f.wing.beforeModule = path => { moduleReads.push(path); };
    try {
      f.wing.publish(change);
      const failure = await authority.failed.then(() => null, error => error);
      assert.equal(failure.message, 'Original P181 casting actor, role, seat, phase or connection changed.');
      assert.ok(failure.firstCastingRejectedState,
        'The already-inspected rejected state must survive the original failure promise, rather than only its composite message.');
      const witness = failure.firstCastingRejectedState;
      assert.equal(witness.schemaVersion, 1);
      assert.equal(witness.observationOrigin, 'delivered');
      assert.ok(witness.failedPredicates.includes(field));
      assert.equal(witness.inspected[field].value, expectedValue);
      assert.equal(witness.inspected[field].valueKind, expectedKind);
      assert.equal(witness.inspected[field].present, expectedKind !== 'undefined');
      assert.equal(witness.expected.uidHash, f.before.uidHash);
      assert.equal(witness.expected.sessionId, f.before.sessionId);
      assert.equal(witness.epoch.connectionGeneration.value, f.before.connectionGeneration);
      const privateError = originalProofError(failure);
      assert.ok(privateError.heldObservationsInspect.includes('firstCastingRejectedState'),
        'The existing private first-failure consumer must retain the original witness.');
      assert.equal(Object.hasOwn(witness, 'actorUid'), false);
      const first = JSON.stringify(witness);
      f.wing.publish(state => {
        state.connection = 'live'; state.me.assignedRoleId = null;
        state.session.setupConfirmed = true; state.session.currentTurn = 0;
      });
      await assert.rejects(authority.check(), error => {
        assert.equal(JSON.stringify(error.firstCastingRejectedState), first,
          'A later check/recovery must return the first rejected tuple unchanged.');
        return error.message === failure.message;
      });
      assert.deepEqual(moduleReads, [], 'No post-retirement module/SDK re-probe supplies rejection evidence.');
    } finally { await authority.close().catch(() => {}); }
    assert.equal(f.wing.observers.stores.size, 0); assert.equal(f.wing.observers.auth.size, 0);
  });
}
test('P181 first rejected casting state does not replace an earlier distinct member retirement', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  const authority = await castingAssignmentAuthorityFor(f);
  try {
    f.wing.publish(state => { state.me.connected = false; });
    f.wing.publish(state => { state.connection = 'offline'; });
    const failure = await authority.failed.then(() => null, error => error);
    assert.match(failure.message, /connected member authority retired/);
    assert.equal(failure.firstCastingRejectedState, undefined);
    await assert.rejects(authority.check(), /connected member authority retired/);
  } finally { await authority.close().catch(() => {}); }
});
function currentFixtureOwnerStop(fixture, clock, overrides = {}) {
  return { schemaVersion: 1, kind: 'P181_OWNER_OPERATION_STOP',
    sourceRoot: resolve(repositoryRoot), sourceCommit: fixture.launch.sourceCommit, projectId: fixture.launch.projectId,
    allocationStartedAtMs: fixture.allocationDeadlineAt - P181_NATIVE_TIMING.totalAllocationMs,
    allocationDeadlineAt: fixture.allocationDeadlineAt,
    runtimeLaunchRecordSha256: createHash('sha256').update(JSON.stringify(fixture.launch)).digest('hex'),
    requestedAtMs: clock.now(), reasonSha256: 'a'.repeat(64), ...overrides };
}
for (const [label, deliver] of [
  ['bound original stop', (input, request) => input.emit('data', JSON.stringify(request) + '\n')],
  ['stale source stop', (input, request) => input.emit('data', JSON.stringify({ ...request, sourceCommit: 'foreign-source' }) + '\n')],
  ['foreign source root stop', (input, request) => input.emit('data', JSON.stringify({ ...request, sourceRoot: '/foreign/source' }) + '\n')],
  ['foreign project stop', (input, request) => input.emit('data', JSON.stringify({ ...request, projectId: 'demo-foreign' }) + '\n')],
  ['renewed start stop', (input, request) => input.emit('data', JSON.stringify({ ...request,
    allocationStartedAtMs: request.allocationStartedAtMs + 1 }) + '\n')],
  ['renewed deadline stop', (input, request) => input.emit('data', JSON.stringify({ ...request,
    allocationDeadlineAt: request.allocationDeadlineAt + 1 }) + '\n')],
  ['wrong launch record stop', (input, request) => input.emit('data', JSON.stringify({ ...request,
    runtimeLaunchRecordSha256: 'b'.repeat(64) }) + '\n')],
  ['future request stop', (input, request) => input.emit('data', JSON.stringify({ ...request,
    requestedAtMs: request.allocationDeadlineAt + 1 }) + '\n')],
  ['extra authority field stop', (input, request) => input.emit('data', JSON.stringify({ ...request,
    renewDeadline: true }) + '\n')],
  ['malformed stop', input => input.emit('data', '{not-json}\n')],
  ['closed owner channel', input => input.emit('end')],
  ['failed owner channel', input => input.emit('error', new Error('SYNTHETIC_PRIVATE_PIPE_FAILURE'))],
]) {
  test(`P181 owned stop channel prevents new gameplay after ${label} and preserves cleanup`, async () => {
    const input = new EventEmitter(), clock = remainingLifecycleClock();
    let fixture;
    fixture = await remainingNativeConsumer({ proofProfile: 'wing-bays', ordinaryPreparation: true, clock,
      ownerInput: input, afterGmClaim: gm => {
        gm.setRoute('#/gm'); deliver(input, currentFixtureOwnerStop(fixture, clock));
      } });
    const first = await fixture.program;
    assert.equal(fixture.gm.choices.includes('Confirm setup // Confirm roster'), false,
      'The actual native operation boundary must refuse the next mutation after the original owner channel stops.');
    assert.equal(fixture.wing.choices.includes('Join a session'), false);
    assert.equal(fixture.admiral.choices.includes('Join a session'), false);
    assert.ok(first, 'An owner stop/channel failure remains an explicit native failure.');
    assert.equal(fixture.browsers.every(browser => browser.closed), true);
    const outcome = JSON.parse(fixture.writes.find(item => item.path.endsWith('p181-starlight-movement-scout.json')).body);
    assert.equal(outcome.cleanup.status, 'owned-cleanup-complete');
    assert.equal(outcome.cleanup.deletedFreshAuthIdentities, 1);
    assert.equal(outcome.finalization.allocationDeadlineAt, fixture.allocationDeadlineAt);
    assert.ok(outcome.ownerOperationStop, 'The original owner channel failure/stop must be retained as stop-only evidence.');
    assert.equal(outcome.ownerOperationStop.status, label === 'bound original stop' ? 'received-owner-stop' : 'owner-channel-failed');
    assert.equal(outcome.ownerOperationStop.grantsActionAuthority, false);
    assert.equal(outcome.actualAcceptance, false);
  });
}
test('P181 owned stop channel does not replace an earlier native rejection during finalization', async () => {
  const input = new EventEmitter(), clock = remainingLifecycleClock();
  let fixture;
  fixture = await remainingNativeConsumer({ clock, ownerInput: input, rejectedCreate: true,
    closeOwned: () => input.emit('data', JSON.stringify(currentFixtureOwnerStop(fixture, clock)) + '\n') });
  const first = await fixture.program;
  assert.equal(first.actual, 403);
  assert.equal(first.expected, 200);
  assert.equal(fixture.browsers.every(browser => browser.closed), true);
  assert.equal(first.ownerOperationStop, undefined, 'A later owner notification must not replace the earlier primary.');
});


// Source-shaped consumer regressions: execute actual App/Store expressions
// through the existing controlled page/SDK fixture; no browser or Firebase client.
const diagnosisSourceRoot = repositoryRoot;
const currentAppText = readFileSync(resolve(diagnosisSourceRoot, 'src/App.tsx'), 'utf8');
const currentStoreText = readFileSync(resolve(diagnosisSourceRoot, 'src/store/useSessionStore.ts'), 'utf8');
function actualPropertyExpression(text, name, scriptKind) {
  const file = typescript.createSourceFile('actual-source.tsx', text,
    typescript.ScriptTarget.Latest, true, scriptKind);
  const matches = [];
  const visit = node => {
    if (typescript.isPropertyAssignment(node) && node.name.getText(file) === name)
      matches.push(node.initializer.getText(file));
    typescript.forEachChild(node, visit);
  };
  visit(file); assert.equal(matches.length, 1, `Use the one actual ${name} source expression.`);
  return typescript.transpileModule(`const actualCallback = ${matches[0]};`, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022 },
  }).outputText + '\nactualCallback;';
}
const appFreshnessExpression = actualPropertyExpression(currentAppText, 'onSessionFreshness', typescript.ScriptKind.TSX);
const storeConnectionExpression = actualPropertyExpression(currentStoreText, 'setConnection', typescript.ScriptKind.TS);
const storeFreshnessExpression = actualPropertyExpression(currentStoreText, 'setSessionSnapshotFreshness', typescript.ScriptKind.TS);
const storeFile = typescript.createSourceFile('actual-store.ts', currentStoreText,
  typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TS);
const clearMovementNode = storeFile.statements.find(node => typescript.isFunctionDeclaration(node) &&
  node.name?.text === 'clearVoyageMovement');
assert.ok(clearMovementNode);
const clearMovementExpression = typescript.transpileModule(clearMovementNode.getText(storeFile), {
  compilerOptions: { target: typescript.ScriptTarget.ES2022 },
}).outputText;
function actualAppFreshnessFor(f) {
  const state = f.wing.state;
  const ports = { get: () => state,
    set: update => f.wing.publish(s => Object.assign(s, typeof update === 'function' ? update(s) : update)),
  };
  const setConnection = runInNewContext(clearMovementExpression + storeConnectionExpression, { ...ports });
  const setSessionSnapshotFreshness = runInNewContext(clearMovementExpression + storeFreshnessExpression, { ...ports });
  const store = () => ({ ...state, setConnection, setSessionSnapshotFreshness,
    setVoyage33MovementProjection: () => {},
  });
  return runInNewContext(appFreshnessExpression, {
    callbackCurrent: () => true, pendingStationMemberRefresh: undefined, playerRole: 'player',
    useSessionStore: { getState: store }, sessionId: state.session.id, playerUid: f.wing.uid,
    sessionSnapshotAuthorityFor: () => ({ hasServerSessionAuthority: state.sdkHasServerAuthority }),
    memberSessionResumeBlocksFreshness: () => state.sdkResumePending,
    pendingGmDiscovery: undefined, invalidatePendingStationReleaseFreshness: () => {},
    clearCurrentGroupCandidateReveals: () => {}, applyPendingGmDiscovery: () => {},
    applyPendingPlayerDiscovery: () => {}, restoreRetainedGroupCandidateProjection: () => {},
    reconcileStationRelease: () => {},
  });
}
async function armedCastingFixture(t, deadlineMs) {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  const module = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
  const deadlineAt = Date.now() + (deadlineMs ?? 2_000);
  const authority = await module.retainP181MemberAuthority(f.wing, deadlineAt, {
    mode: 'casting-assignment', proofProfile: 'wing-bays', castingRoleId: 'wing-commander',
    expected: { sessionId: f.before.sessionId, uidHash: f.before.uidHash,
      fleetGroupId: f.before.fleetGroupId, connectionGeneration: f.before.connectionGeneration,
      identityHydrationRevision: f.before.identityHydrationRevision, documentTimeOrigin: f.before.documentTimeOrigin },
  });
  authority.failed.catch(() => {});
  t.after(async () => { await authority.close().catch(() => {}); });
  return { f, authority, fresh: actualAppFreshnessFor(f), deadlineAt };
}

test('P181 casting freshness contract: actual false-freshness waits without granting authority', async t => {
  const { f, authority, fresh } = await armedCastingFixture(t);
  f.wing.state.session.voyage33Movement = { controlledPrivateMarker: 'withdraw-this-projection' };
  fresh(false);
  assert.equal(f.wing.state.connection, 'offline');
  assert.equal(f.wing.state.sessionSnapshotFreshness, 'cache');
  assert.equal(f.wing.state.session.voyage33Movement, undefined,
    'Actual Store reducers still withdraw the private movement projection.');
  const readiness = await authority.check();
  assert.equal(readiness.fresh, false,
    'Same original actor/role/lease while not fresh must wait, without action qualification.');
  assert.equal(f.wing.choices.length, 0);
});

test('P181 casting freshness contract: repeated same-identity freshness withdrawal can restore', async t => {
  const { f, authority, fresh } = await armedCastingFixture(t);
  for (let index = 0; index < 3; index++) {
    fresh(false);
    assert.equal((await authority.check()).fresh, false);
    fresh(true);
    assert.equal((await authority.check()).fresh, true);
  }
  assert.equal(f.wing.state.me.connectionGeneration, f.before.connectionGeneration);
  assert.equal(f.wing.state.identityHydrationRevision, f.before.identityHydrationRevision);
  assert.equal(f.wing.choices.length, 0);
});

test('P181 casting freshness contract: unavailable freshness retains the original finite deadline', async t => {
  const { f, authority, fresh, deadlineAt } = await armedCastingFixture(t, 250);
  fresh(false);
  const failure = await authority.failed.then(() => null, error => error);
  assert.match(failure.message, /deadline|expired/i,
    'No authority contradiction is invented and no fresh deadline is created for a same-identity cache interval.');
  assert.ok(Date.now() >= deadlineAt);
  assert.equal(f.wing.choices.length, 0);
});

test('P181 casting freshness control: true-freshness callback with pending SDK resume grants no readiness', async t => {
  const { f, authority, fresh } = await armedCastingFixture(t);
  f.wing.publish({ sdkResumePending: true });
  fresh(true);
  assert.equal(f.wing.state.connection, 'connecting');
  assert.equal(f.wing.state.sessionSnapshotFreshness, 'cache');
  assert.equal((await authority.check()).fresh, false);
  f.wing.publish({ sdkResumePending: false });
  fresh(true);
  assert.equal((await authority.check()).fresh, true);
  assert.equal(f.wing.choices.length, 0);
});

test('P181 casting freshness wait discards captured-ready tuple when current retained check is unavailable', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const proofText = readFileSync(resolve(diagnosisSourceRoot, 'scripts/pc10-starlight-movement-scout-ui-proof.mjs'), 'utf8');
  const file = typescript.createSourceFile('actual-proof.mjs', proofText,
    typescript.ScriptTarget.Latest, true, typescript.ScriptKind.JS);
  let expression;
  const visit = node => {
    if (typescript.isVariableDeclaration(node) && node.name.getText(file) === 'waitForFullActor')
      expression = node.initializer.getText(file);
    typescript.forEachChild(node, visit);
  };
  visit(file); assert.ok(expression);
  let checks = 0, currentFresh = false;
  const originalCheck = { failed: new Promise(() => {}),
    check: async () => ({ fresh: currentFresh = ++checks > 1 }),
  };
  const wait = runInNewContext(`(${expression})`, {
    assert, Date, Promise, P181_NATIVE_TIMING,
    gm: {}, sessionId: f.before.sessionId,
    ownedAuthUids: new Map([['wing-commander', f.wing.uid]]),
    hashShort: uid => createHash('sha256').update(uid).digest('hex').slice(0, 16),
    bounded: async (_label, action) => action(), delay: async () => {},
    readFullActor: async () => structuredClone(f.current),
    retainP181MemberAuthority: () => { throw new Error('The original casting override must be retained.'); },
  });
  const current = await wait(f.wing, 'Original casting readiness', value =>
    value.connection === 'live' && value.freshness === 'server' && value.sdkResumePending === false,
  Date.now() + 1_000, null, originalCheck);
  assert.equal(current.uidHash, f.before.uidHash);
  assert.equal(currentFresh, true,
    'No qualified casting result may return while the current retained check is false.');
  assert.equal(f.wing.choices.length, 0);
});


const pendingCastingContradictions = [
  ['Auth identity', (_state, f) => { f.wing.uid = null; }, /Auth.*retired/],
  ['member UID', state => { state.me.uid = 'foreign-member'; }, /identity|authority/],
  ['player role', state => { state.me.role = 'gm'; }, /casting actor|role/],
  ['assignment', state => { state.me.assignedRoleId = 'admiral'; }, /casting actor|role/],
  ['connected false', state => { state.me.connected = false; }, /connected member authority retired/],
  ['fleet group', state => { state.me.fleetGroupId = 'fleet-2'; }, /berth|fleet|authority/],
  ['SDK server authority', state => { state.sdkHasServerAuthority = false; }, /SDK server authority retired/],
  ['member lease', state => { state.me.connectionGeneration += 2; }, /lease|hydration/],
  ['hydration', state => { state.identityHydrationRevision += 2; }, /lease|hydration/],
  ['station claim', state => { state.me.activeConsoleRoleId = 'wing-commander'; state.me.seatId = 'wing-commander'; }, /casting actor|seat/],
  ['cycle', state => { state.session.currentTurn = 1; }, /casting actor|phase/],
  ['phase', state => { state.session.phase = 'active'; }, /casting actor|phase/],
  ['setup', state => { state.session.setupConfirmed = false; }, /casting actor|phase/],
  ['kick', state => { state.me.kickedAt = 'owned-kick'; }, /identity|authority/],
  ['escape', state => { state.me.escapeState = { status: 'locked' }; }, /identity|authority/],
  ['replacement', state => { state.me.replacementRoleId = 'admiral'; }, /identity|authority/],
  ['explicit null berth', state => { state.session.currentActorBerthAuthority = null; }, /berth.*retired/],
  ['foreign berth', state => { state.session.currentActorBerthAuthority.shipId = 'foreign-ship'; }, /berth.*(?:changed|fleet)/],
  ['ineligible connection', state => { state.connection = 'idle'; }, /casting actor|connection/],
  ['actor profile', (_state, f) => { f.wing.activeDemoActorProfile = { roleId: 'admiral', sessionId: 'normal-session' }; }, /profile changed/],
];
for (const [timing, initiallyPending] of [['during pending', true], ['simultaneous withdrawal', false]]) {
  for (const [label, change, pattern] of pendingCastingContradictions) {
    test(`P181 casting freshness preserves ${label} retirement ${timing} through restoration`, async t => {
      const { f, authority, fresh } = await armedCastingFixture(t);
      const original = structuredClone(f.wing.state);
      if (initiallyPending) {
        fresh(false);
        assert.equal((await authority.check()).fresh, false,
          'A valid original actor must remain observed while freshness is unavailable.');
      }
      f.wing.publish(state => {
        state.connection = 'offline'; state.sessionSnapshotFreshness = 'cache';
        change(state, f);
      });
      const first = await authority.failed.then(() => null, error => error);
      assert.match(first.message, pattern,
        'Unavailability must not preempt the genuine authority failure.');
      f.wing.uid = 'wing-uid'; f.wing.activeDemoActorProfile = null;
      f.wing.publish(state => Object.assign(state, original));
      fresh(true);
      await assert.rejects(authority.check(), error => error.message === first.message);
      assert.equal(f.wing.choices.length, 0);
    });
  }
}

// Execute the actual local casting loop and navigation handoff with inert
// provider ports. Acceptance/navigation are observed effects, never real UI
// actions; the source body must fence them with current retained freshness.
async function actualCastingFreshnessHandoff(f, { lostAfterAcceptance = false,
  exhausted = false, contradictoryAfterAcceptance = false, lostDuringPreparation = false,
  contradictoryDuringPreparation = false, pendingCloseFails = false } = {}) {
  const text = readFileSync(p181DeadlineSourcePath, 'utf8');
  const start = text.indexOf('            const castingReady = value =>');
  const end = text.indexOf('          } catch (error) {', start);
  assert.ok(start >= 0 && end > start);
  let now = 10, fresh = lostAfterAcceptance || contradictoryAfterAcceptance ||
    lostDuringPreparation || contradictoryDuringPreparation;
  let accepted = 0, prepared = 0, discarded = 0, retries = 0, contradiction = false;
  const trace = [];
  const deadlineAt = 100, current = structuredClone(f.current);
  const authority = { failed: new Promise(() => {}), check: async () => {
    if (contradiction) throw new Error('Original casting authority retired during awaited acceptance.');
    trace.push(fresh ? 'check-current-fresh' : 'check-current-unavailable');
    return { fresh };
  } };
  const ports = {
    assert, Date: { now: () => now }, Math, Promise, pc11MemberReadiness,
    sessionId: f.before.sessionId, admittedAuth: { uidHash: f.before.uidHash }, admitted: f.before,
    memberName: 'Wing Commander', memberRoleId: 'wing-commander', memberSurface: f.wing,
    directory: '/inert-evidence', proofProfile: 'wing-bays', deadlineAt, castingDeadlineAt: deadlineAt,
    castingResumeNotice: Promise.resolve(), castingResumeNoticeError: null, castingAuthority: authority,
    assignment: f.assignment,
    waitForFullActor: async (_surface, _description, ready, cutoff, _original, retained) => {
      assert.equal(cutoff, deadlineAt); assert.equal(retained, authority);
      assert.equal(ready(current), true); trace.push('captured-ready'); return structuredClone(current);
    },
    castingResume: { accept: async () => {
      assert.equal(fresh, true, 'No casting acceptance may run while the current retained check is false.');
      accepted++; trace.push('accept'); await Promise.resolve();
      if (accepted === 1 && lostAfterAcceptance) fresh = false;
      if (accepted === 1 && contradictoryAfterAcceptance) contradiction = true;
      return structuredClone(current);
    } },
    readFullActor: async () => structuredClone(current),
    createMemberNavigationResumeObserver: () => {
      assert.equal(fresh, true, 'No navigation observer may be created from unavailable current authority.');
      return { prepare: async () => {
        assert.equal(fresh, true, 'No navigation preparation may run while current authority is unavailable.');
        prepared++; trace.push('prepare');
        await Promise.resolve();
        if (prepared === 1 && lostDuringPreparation) fresh = false;
        if (prepared === 1 && contradictoryDuringPreparation) contradiction = true;
      }, finish: async () => {
        trace.push('close-prepared');
        if (pendingCloseFails) throw new Error('Original pending navigation observer cleanup failed.');
        discarded++;
      } };
    },
    bounded: async (_label, action, cutoff) => {
      assert.equal(cutoff, deadlineAt, 'The casting gate cannot extend its original deadline.');
      if (now >= cutoff) throw new Error('Original casting readiness deadline expired.');
      const value = await action();
      if (now >= cutoff) throw new Error('Original casting readiness deadline expired.');
      return value;
    },
    delay: async () => { retries++; now += 25; trace.push('pending-wait'); if (!exhausted) fresh = true; },
  };
  let result, error;
  try { result = await runInNewContext(`(async () => {
    let navigationStart, navigation; ${text.slice(start, end)}
    return { navigationStart };
  })()`, ports); } catch (failure) { error = failure; }
  return { result, error, accepted, prepared, discarded, retries, trace, now, deadlineAt, currentFresh: fresh };
}
for (const lostAfterAcceptance of [false, true]) {
  const boundary = lostAfterAcceptance ? 'after awaited acceptance before navigation' : 'before acceptance';
  test(`P181 casting freshness handoff waits for current authority ${boundary}`, async t => {
    const f = await actualP181CastingAssignmentFixture(t);
    const result = await actualCastingFreshnessHandoff(f, { lostAfterAcceptance });
    assert.equal(result.error, undefined,
      'The actual local consumer must wait through unavailable freshness without accepting or navigating.');
    assert.ok(result.retries > 0, 'Pending must remain inside the original bounded wait.');
    assert.equal(result.prepared, 1);
    assert.ok(result.result.navigationStart);
    assert.equal(f.wing.choices.length, 0);
  });
  test(`P181 casting freshness handoff expires without onward navigation ${boundary}`, async t => {
    const f = await actualP181CastingAssignmentFixture(t);
    const result = await actualCastingFreshnessHandoff(f, { lostAfterAcceptance, exhausted: true });
    assert.match(result.error?.message ?? '', /deadline|did not reach/);
    assert.equal(result.prepared, 0);
    assert.equal(result.accepted, lostAfterAcceptance ? 1 : 0,
      'No repeated acceptance is allowed while current freshness is unavailable.');
    assert.ok(result.now >= result.deadlineAt);
  });
}
test('P181 casting freshness handoff keeps a true retirement after awaited acceptance terminal', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const result = await actualCastingFreshnessHandoff(f, { contradictoryAfterAcceptance: true });
  assert.match(result.error?.message ?? '', /authority retired/);
  assert.equal(result.prepared, 0);
});
test('P181 casting freshness handoff rechecks after navigation preparation and closes pending observer before retry', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const result = await actualCastingFreshnessHandoff(f, { lostDuringPreparation: true });
  assert.equal(result.error, undefined);
  assert.equal(result.currentFresh, true,
    'The onward binding must remain unavailable until current freshness returns after preparation.');
  assert.ok(result.result.navigationStart);
  assert.equal(result.discarded, 1, 'Dispose the already prepared owned observer before retry.');
  assert.equal(result.prepared, 2);
  assert.ok(result.trace.indexOf('close-prepared') < result.trace.indexOf('pending-wait'));
  assert.equal(f.wing.choices.length, 0);
});
test('P181 casting freshness handoff exhausts original cutoff after navigation preparation without onward binding', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const result = await actualCastingFreshnessHandoff(f, { lostDuringPreparation: true, exhausted: true });
  assert.match(result.error?.message ?? '', /deadline|did not reach/);
  assert.equal(result.result?.navigationStart, undefined);
  assert.equal(result.discarded, 1);
  assert.equal(result.prepared, 1);
  assert.ok(result.now >= result.deadlineAt);
});
test('P181 casting freshness handoff keeps true authority loss during navigation preparation terminal', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const result = await actualCastingFreshnessHandoff(f, { contradictoryDuringPreparation: true });
  assert.match(result.error?.message ?? '', /authority retired/);
  assert.equal(result.result?.navigationStart, undefined);
  assert.equal(result.prepared, 1);
  assert.equal(result.retries, 0);
});
test('P181 casting freshness handoff keeps pending prepared-observer cleanup failure terminal', async t => {
  const f = await actualP181CastingAssignmentFixture(t);
  const result = await actualCastingFreshnessHandoff(f, { lostDuringPreparation: true, pendingCloseFails: true });
  assert.match(result.error?.message ?? '', /navigation observer cleanup failed/);
  assert.equal(result.result?.navigationStart, undefined);
  assert.equal(result.discarded, 0);
  assert.equal(result.retries, 0);
});
// Exact generic-signature consumer controls. These execute the existing
// observer and its original first-failure transport; no browser or SDK client.
async function memberSignatureCaptureFixture(t, configure) {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true });
  configure?.(f);
  const authority = await castingAssignmentAuthorityFor(f);
  authority.failed.catch(() => {});
  t.after(async () => { await authority.close().catch(() => {}); });
  return { f, authority };
}

test('P181 member-signature rejection captures the compared scope field and authority without a later read', async t => {
  const { f, authority } = await memberSignatureCaptureFixture(t);
  const reads = [];
  f.wing.beforeModule = path => { reads.push(path); };
  f.wing.publish(s => { s.session.memberSessionScope.vesselIds = ['different-controlled-vessel']; });
  const error = await authority.failed.then(() => null, error => error);
  assert.equal(error.message, 'Original P181 member epoch, phase or source custody authority retired.');
  const witness = error.firstMemberSignatureRejectedState;
  assert.ok(witness, 'The actual generic comparison must retain its first differing fields.');
  assert.equal(witness.predicate, 'serializedMemberSignatureMatchesPinned');
  assert.equal(witness.observationOrigin, 'delivered');
  assert.ok(witness.differentFields.includes('scope'));
  assert.equal(witness.expectedState.scope.valueKind, 'object');
  assert.equal(witness.inspectedState.scope.valueKind, 'object');
  assert.equal(witness.authority.identity.authMatchesOriginal, true);
  assert.equal(witness.authority.identity.memberMatchesAuth, true);
  assert.equal(witness.authority.identity.sessionMatchesOriginal, true);
  assert.equal(witness.authority.epoch.connectionGeneration.value, f.before.connectionGeneration);
  assert.equal(witness.authority.sdk.hasServerSessionAuthority, true);
  assert.equal(witness.authority.sdk.resumePending, false);
  assert.ok(originalProofError(error).heldObservationsInspect.includes('firstMemberSignatureRejectedState'));
  assert.deepEqual(reads, [], 'Do not re-probe a Store/SDK/module after the rejected tuple.');
});

test('P181 member-signature rejection preserves the first capture across check pin close and later restoration', async t => {
  const { f, authority } = await memberSignatureCaptureFixture(t);
  f.wing.publish(s => { s.session.fullGameDemo = { enabled: true }; });
  const firstError = await authority.failed.then(() => null, error => error);
  assert.ok(firstError.firstMemberSignatureRejectedState);
  const encoded = JSON.stringify(firstError.firstMemberSignatureRejectedState);
  f.wing.publish(s => { s.session.fullGameDemo = null; });
  for (const action of [() => authority.check(), () => authority.pin({ expected: f.before }), () => authority.close()]) {
    await assert.rejects(action(), error => {
      assert.equal(error.message, firstError.message);
      assert.equal(JSON.stringify(error.firstMemberSignatureRejectedState), encoded);
      return true;
    });
  }
  assert.equal(f.wing.observers.stores.size, 0);
  assert.equal(f.wing.observers.auth.size, 0);
});

test('P181 member-signature rejection records previous before a healthy delivered tuple', async t => {
  const { f, authority } = await memberSignatureCaptureFixture(t);
  const previous = structuredClone(f.wing.state);
  previous.session.memberSessionScope.vesselIds = ['previous-controlled-change'];
  for (const listener of [...f.wing.observers.stores]) listener(f.wing.state, previous);
  const error = await authority.failed.then(() => null, error => error);
  assert.ok(error.firstMemberSignatureRejectedState);
  assert.equal(error.firstMemberSignatureRejectedState.observationOrigin, 'previous');
  assert.ok(error.firstMemberSignatureRejectedState.differentFields.includes('scope'));
});

test('P181 member-signature rejection redacts identifiers unknown keys tokens and nested private payloads', async t => {
  const secret = 'PRIVATE-BEARER-CREDENTIAL-SENTINEL';
  const { f, authority } = await memberSignatureCaptureFixture(t, f => {
    f.wing.state.session.memberSessionScope[secret] = { email: 'private@example.invalid', accessToken: secret };
    f.wing.state.session.fullGameDemo = { profiles: [{ uid: f.wing.uid, token: secret }] };
  });
  f.wing.publish(s => { s.session.memberSessionScope[secret].accessToken += '-changed'; });
  const error = await authority.failed.then(() => null, error => error);
  const witness = error.firstMemberSignatureRejectedState;
  assert.ok(witness);
  const encoded = JSON.stringify(witness);
  for (const hidden of [secret, 'private@example.invalid', f.wing.uid, f.before.sessionId])
    assert.equal(encoded.includes(hidden), false, 'Only fixed-schema summaries/match flags may leave the browser.');
  assert.ok(encoded.length < 9_000, 'Capture is bounded to the known signature fields and sanitized authority.');
  assert.equal(witness.authority.identity.authMatchesOriginal, true);
});

test('P181 startup berth first rejection retains a safe discriminant through the actual observer and failure writer', async t => {
  const cases = [
    ['omitted', state => { delete state.session.currentActorBerthAuthority; }, ['berthMissing'], false, 'undefined'],
    ['explicit null', state => { state.session.currentActorBerthAuthority = null; }, ['berthMissing'], true, 'null'],
    ['actor mismatch', state => { state.session.currentActorBerthAuthority.actorUid = 'private-other-actor'; },
      ['actorUidMismatch'], true, 'object'],
    ['group mismatch', state => { state.session.currentActorBerthAuthority.groupId = 'private-other-group'; },
      ['groupIdMismatch'], true, 'object'],
    ['ship mismatch with private unknown field', state => {
      state.session.currentActorBerthAuthority.shipId = 'private-other-ship';
      state.session.currentActorBerthAuthority.privateUnknown = { accessToken: 'PRIVATE-BERTH-TOKEN', email: 'private@example.invalid' };
    }, ['shipIdMismatch'], true, 'object'],
    ['role mismatch', state => { state.session.currentActorBerthAuthority.role = 'gm'; },
      ['roleMismatch'], true, 'object'],
  ];

  for (const [label, rejectBerth, failedPredicates, fieldPresent, valueKind] of cases) {
    const f = await actualP181CastingAssignmentFixture(t);
    f.wing.moduleReads = 0;
    f.wing.beforeModule = () => { f.wing.moduleReads++; };
    const sourceModule = await import('./pc10-starlight-movement-scout-ui-proof.mjs');
    const authority = await sourceModule.retainP181MemberAuthority(f.wing, Date.now() + 3_000, {
      mode: 'startup', proofProfile: 'starlight', memberRoleId: 'wing-commander',
      expected: { sessionId: f.current.sessionId, uidHash: f.current.uidHash },
      navigationFrom: f.current, startCycleOne: true,
    });
    try {
      assert.equal((await authority.check()).fresh, true,
        'Seed startup authority only after the original normal assignment and captured resume were accepted.');
      assert.equal(f.current.phase, 'casting');
      assert.equal(f.current.cycle, 0);
      assert.equal(f.current.assignedRoleId, 'wing-commander');
      assert.equal(f.current.sdkResumePending, false);
      f.wing.publish(rejectBerth);
      const error = await authority.failed.then(() => null, failure => failure);
      assert.equal(error?.message, 'Original startup own berth authority retired.', label);
      const witness = error?.firstStartupBerthRejectedState;
      assert.ok(witness, `${label}: preserve the exact first startup-berth disjunct without changing rejection.`);
      assert.equal(witness.predicate, 'startupOwnedBerthMatchesCurrent');
      assert.equal(witness.observationOrigin, 'delivered');
      assert.deepEqual(witness.failedPredicates, failedPredicates);
      assert.equal(witness.berth.fieldPresent, fieldPresent);
      assert.equal(witness.berth.valueKind, valueKind);
      assert.equal(witness.firstPin.phase, 'casting');
      assert.equal(witness.firstPin.cycle, 0);
      assert.equal(witness.firstPin.assignedRoleId, 'wing-commander');
      assert.equal(witness.firstPin.activeConsoleRoleId, null);
      assert.equal(witness.firstPin.seatId, null);
      assert.equal(witness.firstPin.afterAssignment, true);
      assert.equal(witness.firstPin.navigationEpochMatchesBaseline, true);
      assert.equal(witness.firstPin.sdkSettledAtPin, false,
        'The first Store observation precedes import of the actual SDK authority module.');
      assert.equal(witness.firstPin.sdkObservationComplete, false);
      assert.equal(witness.firstPin.sdkHasServerAuthority, null);
      assert.equal(witness.firstPin.sdkResumePending, null,
        'Do not mislabel the conservative pre-SDK default as an observed pending fence.');
      assert.equal(witness.identity.authMatchesOriginal, true);
      assert.equal(witness.identity.memberMatchesAuth, true);
      assert.equal(witness.identity.sessionMatchesExpected, true);
      assert.equal(witness.epoch.connectionGeneration, f.current.connectionGeneration);
      assert.equal(witness.epoch.identityHydrationRevision, f.current.identityHydrationRevision);
      assert.equal(witness.sdk.observationComplete, true);
      assert.equal(witness.sdk.hasServerSessionAuthority, true);
      assert.equal(witness.sdk.resumePending, false);
      if (label === 'actor mismatch') assert.equal(witness.berth.actorUidMatchesAuth, false);
      if (label === 'group mismatch') assert.equal(witness.berth.groupIdMatchesMember, false);
      if (label.startsWith('ship mismatch')) assert.equal(witness.berth.shipIdMatchesPinned, false);
      if (label === 'role mismatch') assert.equal(witness.berth.roleIsPlayer, false);

      const encoded = JSON.stringify(witness);
      for (const privateValue of [f.wing.uid, f.current.sessionId, f.current.fleetGroupId,
        'aegis', 'private-other-actor', 'private-other-group', 'private-other-ship',
        'PRIVATE-BERTH-TOKEN', 'private@example.invalid'])
        assert.equal(encoded.includes(privateValue), false, `${label}: do not serialize ${privateValue}.`);
      assert.ok(encoded.length < 4_000, 'The fixed startup-berth tuple stays bounded.');

      if (label === 'omitted') {
        const beforeClose = originalProofError(error);
        assert.ok(beforeClose.heldObservationsInspect.includes('firstStartupBerthRejectedState'),
          'The retained browser witness must cross the actual command/failed boundary.');
        const evidence = await retainProofFailure(f.directory, 'startup-berth-diagnostic', error);
        assert.equal(evidence.evidenceWriteFailed, false);
        const record = JSON.parse(await readFile(evidence.path, 'utf8'));
        assert.equal(record.originalError.message, 'Original startup own berth authority retired.');
        assert.ok(record.originalError.fullInspect.includes('firstStartupBerthRejectedState'),
          'The native primary failure writer must retain the diagnostic on its original error.');
        assert.ok(record.originalError.heldObservationsInspect.includes('firstStartupBerthRejectedState'));
        for (const privateValue of [f.wing.uid, f.current.sessionId, f.current.fleetGroupId,
          'aegis', 'PRIVATE-BERTH-TOKEN', 'private@example.invalid']) {
          assert.equal(record.originalError.fullInspect.includes(privateValue), false);
          assert.equal(record.originalError.heldObservationsInspect.includes(privateValue), false);
        }
      }

      const readsAtFailure = f.wing.moduleReads ?? 0;
      f.wing.publish(state => {
        state.session.currentActorBerthAuthority = { sessionId: state.session.id, actorUid: state.me.uid,
          groupId: state.me.fleetGroupId, role: 'player', connectionGeneration: state.me.connectionGeneration,
          assignedRoleId: state.me.assignedRoleId, activeConsoleRoleId: null, replacementRoleId: null,
          replacementStatus: null, shipId: 'aegis' };
      });
      for (const action of [() => authority.check(), () => authority.pin({ expected: {} }), () => authority.close()]) {
        await assert.rejects(action(), failure => {
          assert.equal(failure.message, error.message, `${label}: later restoration cannot replace the first failure.`);
          assert.equal(JSON.stringify(failure.firstStartupBerthRejectedState), encoded);
          return true;
        });
      }
      assert.equal(f.wing.moduleReads ?? 0, readsAtFailure,
        `${label}: do not re-probe provider modules after the first rejection.`);
      assert.equal(f.wing.choices.length, 0);
      assert.equal(f.wing.observers.stores.size, 0);
      assert.equal(f.wing.observers.auth.size, 0);
    } finally {
      await authority.close().catch(() => {});
    }
  }
});

test('P181 casting assignment binds a matching berth during pending resume, but only the captured settled consumer may accept it', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, omitInitialMemberBerth: true });
  assert.equal(f.before.currentMemberBerthPresent, false,
    'The actual mounted observer begins from the legitimate unassigned member snapshot without a berth.');
  const authority = await castingAssignmentAuthorityFor(f);
  let pendingMember;
  f.wing.onCastingBerthPublished = async current => {
    pendingMember = current;
    assert.equal(current.phase, 'casting');
    assert.equal(current.assignedRoleId, 'wing-commander');
    assert.equal(current.currentMemberBerthMatches, true);
    assert.equal(current.sdkResumePending, true,
      'The first canonical berth publication may race ahead of settled ordinary resume hydration.');
    assert.equal((await authority.check()).fresh, false,
      'A validated projection publication while resume is pending grants no fresh authority.');
  };
  try {
    const current = await f.applyAssignmentAndResume();
    assert.ok(pendingMember, 'The actual mounted store consumer observed the first new berth publication.');
    assert.equal(pendingMember.currentOwnPlayerConfirmed, true);
    assert.equal((await authority.check()).fresh, true,
      'Freshness returns only after the captured resume advances and settles the same actor.');
    const accepted = await f.observer.accept(f.before, current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment);
    assert.ok(accepted, 'The separate actual casting-resume consumer accepts the exact GM and ordinary resume receipts.');
    assert.equal(accepted.currentMemberBerthMatches, true);
    assert.equal(accepted.sdkResumePending, false);
    assert.equal(accepted.connectionGeneration, f.before.connectionGeneration + 1);
    assert.equal(accepted.identityHydrationRevision, f.before.identityHydrationRevision + 1);
    assert.equal(f.wing.choices.length, 0, 'Observation and receipt acceptance grant no gameplay action.');
  } finally {
    await authority.close().catch(() => {});
    await f.observer.finish();
  }
});

test('P181 casting resume refuses a first berth whose ship is outside the original member scope', async t => {
  const f = await actualP181CastingAssignmentFixture(t, { deferMemberTransition: true, omitInitialMemberBerth: true });
  f.wing.onCastingBerthPublished = async current => {
    assert.equal(current.currentMemberBerthMatches, true);
    f.wing.publish(state => { state.session.currentActorBerthAuthority.shipId = 'foreign-ship'; });
  };
  try {
    const current = await f.applyAssignmentAndResume();
    assert.equal(current.currentMemberBerthPresent, true);
    assert.equal(current.currentMemberBerthMatches, false,
      'A ship outside the original member scope cannot become current berth readiness.');
    assert.equal(current.sdkResumePending, false);
    assert.equal(current.connection, 'live');
    assert.equal(current.freshness, 'server');
    await assert.rejects(f.observer.accept(f.before, current,
      () => observeFullGameDemoPresentationMember(f.wing, { knownRoleIds: originalRoleIds }), f.assignment),
    /current.*readiness|berth/i);
  } finally {
    await f.observer.finish();
  }
});

test('P181 member-signature rejection leaves the declared phase and role assignment normalization accepted', async t => {
  const { f, authority } = await memberSignatureCaptureFixture(t);
  f.wing.publish(s => {
    s.session.phase = 'casting'; s.me.assignedRoleId = 'wing-commander';
    s.session.currentActorBerthAuthority.assignedRoleId = 'wing-commander';
  });
  assert.equal((await authority.check()).fresh, true);
  assert.equal(f.wing.choices.length, 0, 'Readiness observation itself grants no gameplay action.');
});

for (const [label, retire] of [
  ['identity', s => { s.me.uid = 'different-private-actor'; }],
  ['epoch', s => { s.me.connectionGeneration += 3; }],
  ['lease', s => { s.me.connected = false; }],
]) test(`P181 member-signature rejection cannot replace earlier ${label} retirement`, async t => {
  const { f, authority } = await memberSignatureCaptureFixture(t);
  f.wing.publish(retire);
  f.wing.publish(s => { s.session.memberSessionScope.vesselIds = ['later-signature-change']; });
  const error = await authority.failed.then(() => null, error => error);
  assert.equal(error.firstMemberSignatureRejectedState, undefined);
  assert.notEqual(error.message, 'Original P181 member epoch, phase or source custody authority retired.');
  await assert.rejects(authority.check(), e => e.message === error.message);
  assert.equal(f.wing.choices.length, 0);
});
