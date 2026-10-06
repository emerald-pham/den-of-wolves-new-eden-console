import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

/** Execute both production factories, their failed-fixture helper, and original
 * cleanup closures. The only substituted ports are I/O: no real browser, SDK,
 * HTTP, timer, Admin, filesystem write, subprocess, or app environment runs. */
function startupFixture({ postAssignment = false, successful = false, closeGate,
  closeFails = false, diagnosticFails = false, observerThrows = false,
  writeFailures = [], deletionFails = false } = {}) {
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
          const handle = {}; timerHandles.add(handle); return handle;
        },
        clearInterval: handle => timerHandles.delete(handle),
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

async function failed(fixture) {
  const error = await fixture.create().then(() => assert.fail('Startup unexpectedly succeeded.'), value => value);
  assert.equal(error, fixture.primary, 'The original SDK/identity failure is the thrown error.');
  assert.equal(fixture.timerHandles.size, 0, 'The original fixture heartbeat timers are stopped.');
  return error;
}

function assertSafeDeletion(fixture) {
  assert.deepEqual(fixture.deletions, [`sessions/${fixture.sessionId}`]);
  const closed = fixture.events.indexOf('close-complete');
  const deletion = fixture.events.indexOf('delete-start');
  assert.ok(closed >= 0 && closed < deletion, 'The original close must fulfill before own SID deletion starts.');
  assert.equal(fixture.state().closeCalls, 1, 'A startup close is attempted once.');
  assert.equal(fixture.commands.filter(value => value.name === 'createSession').length, 1);
  assert.ok(fixture.events.findLastIndex(value => value.startsWith('call:')) < closed,
    'Cleanup issues no SDK/gameplay call or retry.');
}

function assertOriginalUnknownJoin(fixture) {
  const packet = fixture.writes.find(value => value.filename === 'startup-failure.json').evidence;
  const original = fixture.clients.get(fixture.roles[7]).observedCalls[0];
  assert.deepEqual(packet.observedBrowserCalls.find(value => value.roleId === fixture.roles[7]), original);
  assert.equal(original.status, null);
  assert.equal(original.headersReceivedAt, null);
  assert.equal(original.bodyReceivedAt, null);
  assert.equal(original.completedAt, null);
  assert.ok(packet.callableObservationFailures.some(value => value.category === 'unknown-callable-lifecycle'));
  assert.ok(packet.callableObservationFailures.some(value => value.category === 'observation-drain-timeout'));
  assert.equal(packet.fixtureCallableIssued.length, fixture.commands.length);
  assert.equal(packet.fixtureCallableObservations.length, fixture.commands.length);
  assert.deepEqual(fixture.joins, fixture.roles.slice(0, 8), 'No join is retried or replaced.');
}

test('early production fixture failure diagnoses, stops timers, and fulfills browser close before own deletion', async () => {
  const fixture = startupFixture();
  await failed(fixture); assertSafeDeletion(fixture); assertOriginalUnknownJoin(fixture);
  assert.equal(fixture.state().fixtureAssigned, false);
  assert.ok(fixture.events.indexOf('write:startup-pre-cleanup-diagnostics.json') < fixture.events.indexOf('delete-start'));
  assert.ok(fixture.events.indexOf('heartbeats-stop') < fixture.events.indexOf('close-start'));
});

test('post-assignment production table failure closes browser before the original fixture cleanup', async () => {
  const fixture = startupFixture({ postAssignment: true });
  await failed(fixture); assertSafeDeletion(fixture);
  assert.equal(fixture.state().fixtureAssigned, true);
  assert.equal(fixture.joins.length, 21);
  assert.ok(fixture.events.indexOf('write:startup-failure.json') < fixture.events.indexOf('close-start'));
});

for (const postAssignment of [false, true]) test(`a deferred production browser close blocks ${postAssignment ? 'assigned' : 'early'} fixture deletion`, async () => {
  const closeGate = deferred(), fixture = startupFixture({ postAssignment, closeGate });
  let settled = false;
  const result = fixture.create().then(() => assert.fail('Unexpected table.'), error => { settled = true; return error; });
  await fixture.closeStarted.promise;
  try {
    assert.equal(settled, false);
    assert.deepEqual(fixture.deletions, [], 'A pending close cannot authorize deletion.');
  } finally { closeGate.resolve(); await result; }
  assert.equal(await result, fixture.primary); assertSafeDeletion(fixture);
  assert.equal(fixture.timerHandles.size, 0);
});

for (const postAssignment of [false, true]) test(`a rejected production browser close preserves primary failure and blocks ${postAssignment ? 'assigned' : 'early'} deletion without retry`, async () => {
  const fixture = startupFixture({ postAssignment, closeFails: true });
  const error = await failed(fixture);
  assert.equal(error.pc10StartupBrowserCloseUnavailable, true);
  assert.equal(error.pc10StartupBrowserCloseError, fixture.closeError);
  assert.equal(fixture.state().closeCalls, 1, 'Do not quietly retry a rejected close.');
  assert.equal(fixture.state().browserClosed, false);
  assert.deepEqual(fixture.deletions, [], 'Neither this own SID nor any other session may be deleted.');
  if (!postAssignment) assertOriginalUnknownJoin(fixture);
});

test('a swallowed production diagnostic failure cannot swallow the separate close barrier failure', async () => {
  const fixture = startupFixture({ diagnosticFails: true, observerThrows: true, closeFails: true });
  const error = await failed(fixture);
  assert.equal(error.pc07FailureObservationUnavailable, true);
  assert.equal(error.pc07FailureCleanupUnavailable, true);
  assert.equal(error.pc07FailureCleanupError, fixture.closeError);
  assert.deepEqual(fixture.deletions, []);
  assert.equal(fixture.state().closeCalls, 1);
  assertOriginalUnknownJoin(fixture);
});

test('unavailable original diagnostics retain their category and primary failure while safe cleanup proceeds', async () => {
  const fixture = startupFixture({ diagnosticFails: true });
  await failed(fixture); assertSafeDeletion(fixture); assertOriginalUnknownJoin(fixture);
  const diagnostics = fixture.writes.find(value => value.filename === 'startup-pre-cleanup-diagnostics.json').evidence;
  assert.deepEqual(diagnostics.diagnosticFailures, ['authoritative-snapshot-unavailable']);
});

test('failed raw startup evidence write cannot replace the original failure or skip browser-first cleanup', async () => {
  const fixture = startupFixture({ postAssignment: true, writeFailures: ['startup-failure.json'] });
  const error = await failed(fixture); assertSafeDeletion(fixture);
  assert.equal(error.pc10StartupFailureEvidenceUnavailable, true);
  assert.ok(fixture.writeAttempts.includes('startup-failure.json'));
});

test('failed final cleanup evidence write preserves the original unknown join and fulfilled cleanup boundary', async () => {
  const fixture = startupFixture({ writeFailures: ['startup-cleanup-boundary.json'] });
  const error = await failed(fixture); assertSafeDeletion(fixture); assertOriginalUnknownJoin(fixture);
  assert.equal(error.pc10StartupCleanupEvidenceUnavailable, true);
  assert.ok(fixture.writeAttempts.includes('startup-cleanup-boundary.json'));
});

test('an original own fixture deletion error is retained separately without replacing the SDK failure', async () => {
  const fixture = startupFixture({ deletionFails: true });
  const error = await failed(fixture);
  assert.equal(error.pc07FailureCleanupUnavailable, true);
  assert.equal(error.pc07FailureCleanupError, fixture.deletionError);
  assertSafeDeletion(fixture); assertOriginalUnknownJoin(fixture);
});

test('failed startup records the genuine fulfilled versus blocked cleanup boundary without claiming join success', async () => {
  for (const closeFails of [false, true]) {
    const fixture = startupFixture({ closeFails }); await failed(fixture);
    const packet = fixture.writes.find(value => value.filename === 'startup-cleanup-boundary.json').evidence;
    assert.equal(packet.status, 'failed');
    assert.equal(packet.browserClose, closeFails ? 'failed' : 'fulfilled');
    assert.equal(packet.pc07FailureCleanupComplete, !closeFails);
    assert.equal(packet.fixtureCleanup, closeFails ? 'blocked-before-deletion' : 'completed-by-PC07');
    assert.equal(packet.primaryFailurePreserved, true);
    assertOriginalUnknownJoin(fixture);
  }
});

test('the unchanged successful table cleanup still closes original readers then cleans exactly its fixture', async () => {
  const fixture = startupFixture({ successful: true });
  const table = await fixture.create();
  assert.equal(fixture.joins.length, 21); assert.equal(fixture.deletions.length, 0);
  const commandCount = fixture.commands.length;
  await table.cleanup(); assertSafeDeletion(fixture);
  assert.equal(fixture.commands.length, commandCount);
  assert.equal(fixture.timerHandles.size, 0);
  assert.ok(fixture.events.indexOf('close-complete') < fixture.events.indexOf('heartbeats-stop'));
  assert.equal(fixture.writeAttempts.includes('startup-cleanup-boundary.json'), false);
});
