import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as pc07 from './pc07-authenticated-session.mjs';
import { localGmAccessConfiguration } from './local-gm-access.mjs';
import { PC10_PROOF_CALLABLE_ACTIONS, createPc10CallableTrace, observePc10CallableTrace,
  observePc10FailureBeforeCleanup } from './pc10-proof-diagnostics.mjs';

const moduleUrl = new URL('./pc10-browser-session-proof.mjs', import.meta.url);
const source = await readFile(moduleUrl, 'utf8');
const tableSource = source.slice(source.indexOf('export async function createPc10BrowserTable('),
  source.indexOf('export async function runPc10OverlappingRecoveryProof('));
assert.ok(tableSource.startsWith('export async function createPc10BrowserTable('));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

/** Reuse the existing startup native I/O fixture and execute both production factories, their failed-fixture helper, and original
 * cleanup closures. The only substituted ports are I/O: no real browser, SDK,
 * HTTP, Admin, app or gameplay runs. Only NEW child counterexamples use a local Node process and inert terminal timers. */
function startupFixture({ postAssignment = false, successful = false, closeGate,
  closeFails = false, diagnosticFails = false, observerThrows = false,
  writeFailures = [], deletionFails = false, terminalDelayMs = 0, closeUnreferenced = false, lifecycleRealTimers = false } = {}) {
  const roles = Array.from({ length: 20 }, (_, index) => `native-core-${index}`);
  const sessionId = 'native-own-startup-session';
  const primary = new Error(postAssignment ? 'original post-assignment identity failure' :
    'original normal SDK join outcome unverified');
  const closeError = new Error('original browser close failure');
  const diagnosticError = new Error('original diagnostic failure');
  const deletionError = new Error('original own fixture cleanup failure');
  const events = [], commands = [], joins = [], deletions = [], writes = [], writeAttempts = [];
  const timerHandles = new Set();
  const closeStarted = deferred();
  let authCount = 0, closeCalls = 0, browserClosed = false, fixtureAssigned = false;
  const db = {
    doc(path) {
      assert.equal(path, `sessions/${sessionId}`, 'Only the original own fixture is addressed.');
      return { path, async get() { return { get: key => key === 'setupRevision' ? 0 :
        key === 'turnPhase' ? { timerPause: { pausedAt: 1 } } : undefined }; } };
    },
    async recursiveDelete(ref) {
      events.push('delete-start');
      deletions.push(ref.path);
      if (deletionFails) throw deletionError;
      if (terminalDelayMs) {
        console.log(JSON.stringify({ nativeOwnSidDeletionIssued: true }));
        await new Promise(resolve => setTimeout(resolve, terminalDelayMs).unref());
      }
      events.push('delete-complete');
    },
  };
  const requirePort = () => path => {
    if (path.endsWith('roleConfiguration.js')) return { recommendedRoleIds: count => {
      assert.equal(count, 20); return roles;
    } };
    if (path === 'firebase-admin/firestore') return { getFirestore: () => db };
    if (path === 'firebase-admin/app') return { getApps: () => [{}], initializeApp() { assert.fail('No app is created.'); } };
    if (path.endsWith('callableRateLimit.js')) return { CALLABLE_RATE_LIMIT_POLICIES: {},
      callableRateLimitDocumentId() { assert.fail('No rate marker read is requested.'); } };
    assert.fail(`Unexpected native require port: ${path}`);
  };
  const processPort = { env: { VITE_FIREBASE_PROJECT_ID: 'demo-native-startup-cleanup' } };
  const fetchPort = async (url, options) => {
    if (url.includes('/accounts:signUp?')) {
      assert.equal(options.method, 'POST');
      const actor = { localId: `native-http-${++authCount}`, idToken: `native-token-${authCount}` };
      return { status: 200, json: async () => actor };
    }
    const name = url.split('/').at(-1);
    assert.ok(Object.hasOwn(PC10_PROOF_CALLABLE_ACTIONS, name));
    const { data } = JSON.parse(options.body);
    commands.push({ name, data, actor: options.headers.Authorization });
    events.push(`call:${name}`);
    const session = { id: sessionId, joinCode: 'NATIVE-CODE', setupRevision: 0 };
    return { status: 200, json: async () => ({ result: { session, setupRevision: 0 } }) };
  };
  const pc07Context = {
    assert, URL, randomUUID, process: processPort, pc10ModuleUrl: moduleUrl.href,
    readFile: async path => {
      assert.equal(path, '.env.emulators.local');
      return 'VITE_USE_EMULATORS=1\nVITE_FIREBASE_AUTH_EMULATOR_PORT=9101\n' +
        'VITE_FIREBASE_FIRESTORE_EMULATOR_PORT=8091\nVITE_FIREBASE_FUNCTIONS_EMULATOR_PORT=5012';
    },
    createRequire: requirePort, localGmAccessConfiguration,
    grantLocalGmAccess: async () => { events.push('gm-access'); }, fetch: fetchPort,
    shouldMaintainFixturePresence: pc07.shouldMaintainFixturePresence,
    joinConfiguredBrowserPlayers: pc07.joinConfiguredBrowserPlayers,
    finishFailedPc07Fixture: pc07.finishFailedPc07Fixture,
    buildFixtureCallableObservation: pc07.buildFixtureCallableObservation,
    createPc10CallableTrace, observePc10CallableTrace,
    AbortSignal: { timeout: ms => { assert.equal(ms, 60_000); return { aborted: false }; } },
    createFixtureHeartbeatController(options) {
      const controller = pc07.createFixtureHeartbeatController({ ...options,
        setInterval(_tick, ms) {
          assert.equal(ms, 10_000);
          const handle = lifecycleRealTimers && fixtureAssigned ? globalThis.setInterval(_tick, ms) : {};
          timerHandles.add(handle); return handle;
        },
        clearInterval: handle => {
          if (lifecycleRealTimers && typeof handle.ref === 'function') globalThis.clearInterval(handle);
          timerHandles.delete(handle);
        },
      });
      return { ...controller, stop: async () => {
        events.push('heartbeats-stop'); await controller.stop();
      } };
    },
  };
  pc07Context.performFixtureCallable = runInNewContext(`(${pc07.performFixtureCallable.toString()})`, pc07Context);
  const createFixture = runInNewContext(`(${pc07.createPc07AuthenticatedSession.toString()
    .replaceAll('import.meta.url', 'pc10ModuleUrl')})`, pc07Context);
  const browser = { async close() {
    closeCalls++; events.push('close-start'); closeStarted.resolve();
    if (closeGate) await closeGate.promise;
    if (closeFails) { events.push('close-rejected'); throw closeError; }
    if (closeUnreferenced) await new Promise(resolve => setTimeout(resolve, 15).unref());
    browserClosed = true; events.push('close-complete');
  } };
  const clients = new Map();
  const createTable = runInNewContext(`(${tableSource.replace(/^export /, '')
    .replaceAll('import.meta.url', 'pc10ModuleUrl')})`, {
    assert, URL, createHash, process: processPort, pc10ModuleUrl: moduleUrl.href,
    mkdir: async () => undefined, execFileSync: () => 'native-source-binding',
    readFile: async () => Buffer.from('native-compiled-binding'),
    compiledFunctionsBinding: async () => ({ sha256: 'native-compiled-tree-binding' }),
    createRequire: requirePort, chromium: { launch: async () => browser },
    PC10_PROOF_CALLABLE_ACTIONS, buildFixtureCallableObservation: pc07.buildFixtureCallableObservation,
    observePc10FailureBeforeCleanup,
    capturePc10AuthoritativeFailureSnapshot: async context => {
      events.push('diagnostic'); assert.equal(context.sessionId, sessionId);
      if (diagnosticFails) throw diagnosticError;
      return { kind: 'native-original-source-witness', sessionId };
    },
    createPc10BrowserActor: async (actualBrowser, _baseUrl, label) => {
      assert.equal(actualBrowser, browser);
      const client = { label, errors: [], observedCalls: [], callableObservationFailures: [],
        callableObservationBoundaries: [], identityObservations: [],
        async join() {
          joins.push(label);
          const failed = !postAssignment && !successful && label === roles[7];
          client.observedCalls.push({ name: 'joinSession', roleId: label,
            transport: 'independent-browser-SDK', status: failed ? null : 200,
            headersReceivedAt: failed ? null : 1, bodyReceivedAt: failed ? null : 2,
            completedAt: failed ? null : 2 });
          if (failed) {
            client.callableObservationFailures.push({ roleId: label, category: 'unknown-callable-lifecycle' });
            throw primary;
          }
          return { localId: `native-browser-${label}`, idToken: `native-token-${label}` };
        },
        bindOriginIdentity(uid, sid) {
          assert.equal(uid, `native-browser-${label}`); assert.equal(sid, sessionId);
          if (postAssignment) throw primary;
        },
        async drainObservedCalls() {
          events.push(`drain:${label}`);
          if (client.callableObservationFailures.length) throw new Error('original unknown native drain');
        },
      };
      clients.set(label, client); return client;
    },
    createPc07AuthenticatedSession: async (name, count, options) => {
      if (observerThrows) {
        const observe = options.beforeFailureCleanup;
        options = { ...options, beforeFailureCleanup: async (...args) => {
          await observe(...args); throw diagnosticError;
        } };
      }
      const fixture = await createFixture(name, count, options);
      fixtureAssigned = true; return fixture;
    },
    writeFile: async (path, content) => {
      const filename = path.split('/').at(-1);
      events.push(`write:${filename}`); writeAttempts.push(filename);
      if (writeFailures.includes(filename)) throw new Error(`native write unavailable: ${filename}`);
      writes.push({ filename, evidence: JSON.parse(content) });
    },
  });
  const create = () => createTable({ baseUrl: 'http://localhost:5174',
    directory: '/native-no-filesystem-write', captureMode: 'native-durable' });
  return { create, primary, closeError, diagnosticError, deletionError, roles, sessionId,
    events, commands, joins, deletions, clients, writes, writeAttempts, timerHandles, closeStarted,
    state: () => ({ authCount, closeCalls, browserClosed, fixtureAssigned }) };
}

if (process.env.PC10_CLEANUP_NATIVE_CHILD) {
  const kind = process.env.PC10_CLEANUP_NATIVE_CHILD;
  const fixture = startupFixture({ successful: true, lifecycleRealTimers: true,
    terminalDelayMs: kind === 'deletion' ? 15 : 0, closeUnreferenced: kind === 'close' });
  const table = await fixture.create();
  console.log(JSON.stringify({ nativeTableAssigned: true, kind }));
  await table.cleanup();
  assert.equal(fixture.timerHandles.size, 0);
  console.log(JSON.stringify({ nativeCleanupFulfilled: true, closeCalls: fixture.state().closeCalls,
    ownSidDeletionCount: fixture.deletions.length, commandCount: fixture.commands.length }));
} else {
  test('completed-table cleanup preserves rejected original browser close and blocks own fixture deletion', async () => {
    const fixture = startupFixture({ successful: true, closeFails: true });
    const table = await fixture.create(), commandCount = fixture.commands.length;
    await assert.rejects(table.cleanup(), error => error === fixture.closeError);
    assert.deepEqual(fixture.deletions, [], 'A failed browser close cannot authorize any SID deletion.');
    assert.equal(fixture.state().closeCalls, 1);
    assert.equal(fixture.commands.length, commandCount);
    assert.equal(fixture.timerHandles.size, 0);
  });

  test('completed-table cleanup retains a deferred original browser close before exact own deletion', async () => {
    const closeGate = deferred(), fixture = startupFixture({ successful: true, closeGate });
    const table = await fixture.create();
    let fulfilled = false;
    const result = table.cleanup().then(() => { fulfilled = true; });
    await fixture.closeStarted.promise;
    assert.equal(fulfilled, false); assert.deepEqual(fixture.deletions, []);
    closeGate.resolve(); await result;
    assert.deepEqual(fixture.deletions, [`sessions/${fixture.sessionId}`]);
    assert.equal(fixture.state().closeCalls, 1);
    assert.ok(fixture.events.indexOf('close-complete') < fixture.events.indexOf('delete-start'));
    assert.equal(fixture.timerHandles.size, 0);
  });

  test('completed-table cleanup preserves the original deletion failure without retry and releases its handles', async () => {
    const fixture = startupFixture({ successful: true, deletionFails: true });
    const table = await fixture.create(), commandCount = fixture.commands.length;
    await assert.rejects(table.cleanup(), error => error === fixture.deletionError);
    assert.equal(fixture.state().closeCalls, 1);
    assert.deepEqual(fixture.deletions, [`sessions/${fixture.sessionId}`]);
    assert.equal(fixture.commands.length, commandCount);
    assert.equal(fixture.timerHandles.size, 0);
  });

  for (const kind of ['close', 'deletion']) test(`production cleanup awaits an unreferenced ${kind} terminal port without Node unsettled-await exit`, () => {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: process.cwd(), env: { ...process.env, PC10_CLEANUP_NATIVE_CHILD: kind }, encoding: 'utf8', timeout: 5_000,
    });
    console.log(JSON.stringify({ nativeChild: kind, status: child.status, signal: child.signal,
      stdout: child.stdout, stderr: child.stderr }));
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, 'The original cleanup must fulfill before a Node owner can exit.');
    assert.match(child.stdout, /"nativeCleanupFulfilled":true/);
    assert.match(child.stdout, /"ownSidDeletionCount":1/);
    assert.doesNotMatch(child.stderr, /unsettled top-level await/);
  });
}
