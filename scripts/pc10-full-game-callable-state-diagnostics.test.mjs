import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createContext, Script, SyntheticModule } from 'node:vm';
import * as proof from './pc10-full-game-demo-ui-proof.mjs';

// Read-only inert VM counterexamples. No browser, Auth request or gameplay.
const UID = 'native-callable-diagnostic-original';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
async function fixture(options = {}) {
  let currentUid = UID, ordinaryReads = 0, storeReads = 0, credentialReads = 0;
  const ordinary = Object.freeze({ uidHash: UID_HASH, sessionId: 'ordinary-native-session',
    hasAuth: true, sameActor: true, profileRoleId: 'controller', pendingCommandCount: 0 });
  const state = { session: { id: 'runtime-native-session' },
    me: { uid: UID, connectionGeneration: 2 }, identityHydrationRevision: 1,
    connection: 'live', sessionSnapshotFreshness: 'server', gmAccessAuthenticatedAt: 100,
    pendingCommands: [{ id: 'native-existing-command', kind: 'logoutGmAccess', actorUid: UID,
      createdAt: 10, queuedWithServerAuthority: false, payload: { sessionId: null, instanceId: null,
        requestId: 'native-real-nonce', password: 'NATIVE-SECRET-MUST-NOT-PERSIST',
        nested: { accessToken: 'NATIVE-TOKEN-MUST-NOT-PERSIST' } } }] };
  if (options.missing) {
    delete state.me.connectionGeneration; delete state.identityHydrationRevision;
    delete state.gmAccessAuthenticatedAt; delete state.pendingCommands[0].actorUid;
  }
  const user = { get uid() { return currentUid; },
    get accessToken() { credentialReads++; throw new Error('Never read Auth credentials.'); } };
  const context = createContext({ TextEncoder, performance: { timeOrigin: 1000 },
    crypto: { subtle: { digest: async (...args) => {
      if (options.swapAuthDuringDigest) currentUid = 'native-replacement-uid';
      return webcrypto.subtle.digest(...args);
    } } }, ...(options.missing ? {} : { navigator: { onLine: true } }) });
  const modules = new Map();
  for (const [path, exports] of [
    ['/src/lib/firebase.ts', { auth: () => ({ currentUser: user }) }],
    ['/src/store/useSessionStore.ts', { useSessionStore: { getState: () => { storeReads++; return state; } } }],
  ]) {
    const module = new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
    await module.link(() => { throw new Error('No transitive or SDK imports are allowed.'); });
    await module.evaluate(); modules.set(path, module);
  }
  const surface = { observe: async () => { ordinaryReads++; return ordinary; },
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    page: { evaluate: async (callback, argument) => {
      context.__argument = argument;
      return new Script(`(${callback.toString()})(__argument)`, { importModuleDynamically: async path => {
        assert.ok(modules.has(path), `Unexpected action or SDK import: ${path}`); return modules.get(path);
      } }).runInContext(context);
    } } };
  return { surface, ordinary, reads: () => ({ ordinaryReads, storeReads, credentialReads }) };
}

function requireDiagnosticObserver() {
  assert.equal(typeof proof.observeFullGameCallableDiagnostics, 'function',
    'Additional callable state is read by a diagnostic-specific observer.');
}

test('the ordinary full-game observer stays whole-byte identical to e134 while callable diagnostics use a separate observer', async () => {
  const current = await readFile(new URL('./pc10-full-game-demo-ui-proof.mjs', import.meta.url), 'utf8');
  const old = execFileSync('git', ['show', 'e13471e35501ff3e2a46286e57d58fe1a4a5c3ad:scripts/pc10-full-game-demo-ui-proof.mjs'], { encoding: 'utf8' });
  const observer = source => source.slice(source.indexOf('    async function observe()'), source.indexOf('    async function until('));
  assert.equal(observer(current), observer(old), 'Preserve the established generic actor projection and its omitted strict lifecycle tuple.');
  requireDiagnosticObserver();
});

test('callable diagnostics retain distinct ordinary and current runtime samples, real nonce and queue context without reading credentials', async () => {
  requireDiagnosticObserver(); const f = await fixture();
  const value = await proof.observeFullGameCallableDiagnostics(f.surface);
  assert.equal(value.ordinaryActor, f.ordinary);
  assert.equal(value.ordinaryActor.sessionId, 'ordinary-native-session');
  assert.equal(value.runtimeState.sessionId, 'runtime-native-session', 'Do not fuse observations from different samples.');
  assert.equal(value.runtimeState.uidHash, UID_HASH);
  assert.equal(value.runtimeState.navigatorOnline, true);
  assert.equal(value.runtimeState.connectionGeneration, 2);
  assert.equal(value.runtimeState.identityHydrationRevision, 1);
  assert.equal(value.runtimeState.pendingCommandDetails[0].kind, 'logoutGmAccess');
  assert.equal(value.runtimeState.pendingCommandDetails[0].payloadAuthorityContext.requestId, 'native-real-nonce');
  assert.equal(value.runtimeState.pendingCommandDetails[0].actorMatchesCurrentAuth, true);
  const encoded = JSON.stringify(value);
  for (const secret of ['NATIVE-SECRET-MUST-NOT-PERSIST', 'NATIVE-TOKEN-MUST-NOT-PERSIST', UID]) assert.equal(encoded.includes(secret), false);
  assert.deepEqual(f.reads(), { ordinaryReads: 1, storeReads: 1, credentialReads: 0 });
});

test('missing diagnostic generation, hydration, navigator and cached grant values stay unknown', async () => {
  requireDiagnosticObserver(); const f = await fixture({ missing: true });
  const { runtimeState } = await proof.observeFullGameCallableDiagnostics(f.surface);
  for (const field of ['connectionGeneration', 'identityHydrationRevision', 'navigatorOnline', 'gmAccessCached']) assert.equal(runtimeState[field], undefined, field);
  assert.equal(runtimeState.pendingCommandDetails[0].actorMatchesCurrentAuth, undefined);
  assert.equal(f.reads().credentialReads, 0);
});

test('an Auth change during diagnostic hashing fails the diagnostic sample rather than certifying the later actor', async () => {
  requireDiagnosticObserver(); const f = await fixture({ swapAuthDuringDigest: true });
  await assert.rejects(proof.observeFullGameCallableDiagnostics(f.surface), /Original Auth UID changed during callable diagnostic observation/);
  assert.equal(f.reads().credentialReads, 0);
});
