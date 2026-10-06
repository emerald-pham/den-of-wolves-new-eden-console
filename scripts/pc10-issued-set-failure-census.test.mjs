import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import test from 'node:test';
import { createPc10BrowserActor } from './pc10-browser-session-proof.mjs';
import { createPc10Gate2FunctionalHarness } from './pc10-gate2-functional-proof.mjs';

const uid = 'original-census-actor', sessionId = 'original-census-session', roleId = 'admiral';
const project = 'demo-issued-census-unit', origin = 'http://127.0.0.1:5031';
const documentId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const turn = () => new Promise(resolve => setImmediate(resolve));
const body = result => ({ body: JSON.stringify({ result }), base64Encoded: false });
const error = () => Object.assign(new Error('original permission denial'), { code: 'functions/permission-denied' });

/** Actual actor/native factory + serialized original SDK callback + actual
 * harness command/authority/qualifier/whole transition. Only SDK/RPC/CDP/DB/time
 * ports are inert; no copied drain or qualification policy drives these cases. */
async function fixture(t, { firstGap = true } = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const page = new EventEmitter(), cdp = new EventEmitter();
  const counts = { sdk: 0, sdkImports: 0, nativeReads: [], offline: 0, initScripts: 0, sourceReads: 0 };
  const timerDurations = [], originalTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (...args) => { timerDurations.push(args[1]); return originalTimeout(...args); });
  let online = true;
  page.setDefaultTimeout = () => {}; page.setDefaultNavigationTimeout = () => {};
  const bodies = new Map(), names = new Map();
  cdp.send = async (name, input) => {
    if (name === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main-frame' } } };
    if (name === 'Network.getResponseBody') {
      counts.nativeReads.push(input.requestId);
      if (input.requestId === 'original-denial' && firstGap) throw Error('Protocol error (Network.getResponseBody): No data found for resource with given identifier');
      return bodies.get(input.requestId) ?? body({ actorUid: uid, sessionId, revision: 2, connectionGeneration: 3 });
    }
    assert.ok(['Network.enable', 'Network.configureDurableMessages', 'Runtime.enable', 'Debugger.enable',
      'Runtime.addBinding', 'Page.enable'].includes(name)); return {};
  };
  cdp.detach = async () => {};
  const context = { newPage: async () => page, newCDPSession: async () => cdp,
    addInitScript: async () => { counts.initScripts++; }, close: async () => {},
    setOffline: async value => { assert.equal(value, true); counts.offline++; online = false; } };
  const client = await createPc10BrowserActor({ newContext: async () => context }, 'http://127.0.0.1:5174', roleId,
    undefined, { captureMode: 'native-durable', originProjectId: project, originFunctionsOrigin: origin });
  cdp.emit('Runtime.executionContextCreated', { context: { id: 1, uniqueId: 'original-context', auxData: { isDefault: true, frameId: 'main-frame' } } });
  cdp.emit('Debugger.scriptParsed', { scriptId: 'original-script', executionContextId: 1, url: 'pc10-native-durable-init.js' });
  cdp.emit('Runtime.bindingCalled', { name: '__pc10NativeDurableDocumentWitness', executionContextId: 1,
    payload: JSON.stringify({ schemaVersion: 1, documentId }) });
  client.bindOriginIdentity(uid, sessionId);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ aud: project, iss: `https://securetoken.google.com/${project}`,
    sub: uid, user_id: uid, iat: 1, exp: 3600 })}.`;
  const request = (id, name = 'getCurrentMemberSession') => { names.set(id, name); cdp.emit('Network.requestWillBeSent', {
    requestId: id, frameId: 'main-frame', loaderId: 'original-loader',
    initiator: { type: 'script', stack: { callFrames: [{ functionName: 'pc10NativeDurableFetch', scriptId: 'original-script', url: 'pc10-native-durable-init.js' }] } },
    request: { url: `${origin}/${project}/us-central1/${name}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, postData: JSON.stringify({ data: { sessionId } }) } }); };
  const finish = (id, status = 200, result) => {
    if (result !== undefined) bodies.set(id, body(result));
    cdp.emit('Network.responseReceived', { requestId: id, response: { status,
      url: `${origin}/${project}/us-central1/${names.get(id)}`, mimeType: 'application/json', headers: { 'content-type': 'application/json' } } });
    cdp.emit('Network.loadingFinished', { requestId: id, encodedDataLength: 100 });
  };
  const sandbox = { Date, Symbol, URL, performance: { getEntriesByType: () => [] }, navigator: { get onLine() { return online; } } };
  Object.defineProperty(sandbox, Symbol.for('pc10-proof-native-durable-document'), { value: documentId });
  const realm = vm.createContext(sandbox), modules = new Map();
  const player = { uid, sessionId, role: 'player', connected: true, connectionGeneration: 3, fleetGroupId: 'fleet-1',
    assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId };
  const session = { id: sessionId, phase: 'active', currentTurn: 1, setupRevision: 42, activeVesselIds: ['aegis'], shuttleDockings: [] };
  const group = { id: 'fleet-1', memberUids: [uid], vesselIds: ['aegis'] };
  const importModule = async specifier => {
    if (!modules.has(specifier)) {
      let exports;
      if (specifier === '/src/lib/firebase.ts') exports = { functions: () => 'inert-functions', auth: () => ({ currentUser: { uid } }) };
      else if (specifier === '/src/store/useSessionStore.ts') exports = { useSessionStore: { getState: () => ({ me: player, session }) } };
      else if (specifier.endsWith('/firebase_functions.js')) exports = { httpsCallable: (functions, name) => {
        assert.equal(functions, 'inert-functions'); assert.equal(name, 'listGmScoutResolutionLog'); counts.sdkImports++;
        return async data => { assert.deepEqual(data, { sessionId }); counts.sdk++;
          request('original-denial', name); finish('original-denial', 403, { error: { status: 'PERMISSION_DENIED' } }); throw error(); };
      } };
      else assert.fail('Unplanned SDK/module import.');
      const module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: realm });
      await module.link(() => assert.fail('No dependency imports.')); await module.evaluate(); modules.set(specifier, module);
    }
    return modules.get(specifier);
  };
  page.evaluate = async (callback, argument) => {
    realm.arg = argument;
    return structuredClone(await new vm.Script(`(${callback.toString()})(arg)`, { importModuleDynamically: importModule }).runInContext(realm));
  };
  const snapshot = (path, data) => ({ ref: { path }, exists: true, data: () => data, get: key => data[key] });
  const sessionPath = `sessions/${sessionId}`;
  const table = { clients: new Map([[roleId, client]]), capturePresenceAuthority: async () => [{
    roleId, actorHash: digest('actor', uid), sessionHash: digest('session', sessionId), projectHash: digest('project', project),
    configuredRoleMatches: true, originalUidMatches: true, sameSessionMembership: true, checkedAt: Date.now() }],
    fixture: { sessionId, gm: { localId: 'separate-current-gm' }, byRole: () => ({ localId: uid }),
      session: { collection: name => ({ path: `${sessionPath}/${name}` }) }, db: { doc: path => ({ path }),
        runTransaction: async (operation, options) => { assert.deepEqual(options, { readOnly: true }); counts.sourceReads++;
          return operation({ get: async ref => {
            if (ref.path === `${sessionPath}/fleetGroups`) return { docs: [snapshot(`${ref.path}/fleet-1`, group)] };
            if (ref.path === `${sessionPath}/shuttleDepartures`) return { docs: [] };
            if (ref.path === sessionPath) return snapshot(ref.path, session);
            if (ref.path === `${sessionPath}/players/${uid}`) return snapshot(ref.path, player);
            if (ref.path === `${sessionPath}/seats/${roleId}`) return snapshot(ref.path, { holderUid: uid, status: 'claimed' });
            if (ref.path === `activeMemberships/${uid}`) return snapshot(ref.path, { sessionId });
            assert.fail('Unplanned authority read.');
          } });
        } } } };
  const harness = await createPc10Gate2FunctionalHarness(table, { root: '/inert-root', directory: '/inert-evidence' });
  harness.originals.get(roleId).scope = { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] };
  const originalReply = await harness.command(roleId, 'listGmScoutResolutionLog', {}, { expectedDenial: 'permission-denied' });
  assert.deepEqual(originalReply, { status: 'denied', error: { code: 'functions/permission-denied' } });
  await turn(); assert.equal(harness.assessment().functionalStatus, 'PASSED', 'Fixture proves genuine complete SDK expected-denial/source/document linkage before pending native request.');
  request('original-pending');
  let closed = false;
  t.after(async () => { if (!closed) { await client.close(); closed = true; } t.mock.restoreAll(); t.mock.timers.reset(); });
  return { client, harness, counts, timerDurations, request, finish, fail: id => cdp.emit('Network.loadingFailed', {
    requestId: id, errorText: 'net::ERR_ABORTED', canceled: true }), turn };
}

function start(f) {
  let settled = false;
  const operation = f.harness.transition(roleId, 'offline');
  void operation.then(() => { settled = true; }, () => { settled = true; });
  return { operation, settled: () => settled };
}

test('real whole transition retains the failed body gap but completes every original issued transport inside the same10s census', async t => {
  const f = await fixture(t); const transition = start(f); await turn();
  assert.equal(transition.settled(), false, 'An original unavailable body cannot abort census while another original target is still pending.');
  assert.equal(f.counts.offline, 0); assert.equal(f.harness.drains[0].outcome, 'pending');
  t.mock.timers.tick(500); f.finish('original-pending'); await transition.operation;
  assert.equal(f.counts.offline, 1); assert.equal(f.counts.sdk, 1); assert.equal(f.counts.sdkImports, 1);
  assert.deepEqual(f.counts.nativeReads, ['original-denial', 'original-pending']);
  const drain = f.harness.drains[0]; assert.equal(drain.outcome, 'failed'); assert.equal(drain.functionalQualification.allowed, true);
  const result = f.harness.assessment(); assert.equal(result.functionalStatus, 'PASSED'); assert.equal(result.strictTransportStatus, 'INCOMPLETE');
  assert.equal(result.instrumentationLimits[0].wireBodyStatus, 'UNINSPECTED');
  assert.equal(f.client.observedCalls[0].bodyCompletedAt, null); assert.equal(Object.hasOwn(f.client.observedCalls[0], 'bodyHash'), false); assert.equal(f.client.callableObservationFailures.length, 1);
  const native = f.client.callableObservationBoundaries.find(x => x.kind === 'issued-native-durable-drain');
  assert.equal(native.issuedNativeTransports, 2); assert.equal(native.outcome, 'failed'); assert.equal(native.completedAt - native.startedAt, 500);
  assert.ok(f.timerDurations.every(ms => ms === 10000));
});

test('same unavailable body cannot mask a genuinely unfinished issued request at the exact unchanged10s deadline', async t => {
  const f = await fixture(t); const transition = start(f); await turn();
  t.mock.timers.tick(9999); await turn(); assert.equal(transition.settled(), false); assert.equal(f.counts.offline, 0);
  t.mock.timers.tick(1); await assert.rejects(transition.operation, /Only an already recorded passive instrumentation gap/);
  const gap = f.harness.drains[0].functionalQualification; assert.equal(gap.allowed, false);
  assert.ok(gap.hardFailures.some(x => x.category === 'unfinished-native-terminal-outcome'));
  assert.ok(gap.hardFailures.some(x => x.category === 'unfinished-native-http-outcome'));
  assert.equal(f.counts.offline, 0); assert.deepEqual(f.counts.nativeReads, ['original-denial']);
  assert.equal(f.harness.transitions[0].apiStartedAt, undefined); assert.equal(f.harness.ledger[0].completedAt, 1000);
});

for (const status of [403, 500, 503]) test(`finished unexpected nativeHTTP${status} stays hard after complete original census`, async t => {
  const f = await fixture(t); const transition = start(f); await turn(); t.mock.timers.tick(20);
  f.finish('original-pending', status, { error: { status: 'PERMISSION_DENIED' } });
  await assert.rejects(transition.operation, /Only an already recorded passive instrumentation gap/);
  assert.equal(f.counts.offline, 0); assert.equal(f.harness.drains[0].functionalQualification.allowed, false);
  assert.ok(f.harness.drains[0].functionalQualification.hardFailures.some(x => x.category === 'unclassified-native-http-outcome' && x.status === status));
});

test('actual cancellation before public offlineAPI remains unexpected despite original transition intent', async t => {
  const f = await fixture(t); const transition = start(f); await turn(); t.mock.timers.tick(20); f.fail('original-pending');
  await assert.rejects(transition.operation, /Only an already recorded passive instrumentation gap/);
  assert.equal(f.counts.offline, 0); assert.equal(f.client.observedCalls[1].observationDisposition, undefined);
  assert.ok(f.harness.drains[0].functionalQualification.hardFailures.some(x => x.category === 'unexpected-native-transport-failure'));
});

test('new postSnapshot pending transport is not chased or exempted by complete issued-set failure census', async t => {
  const f = await fixture(t); const transition = start(f); await turn();
  f.request('future-unfinished'); t.mock.timers.tick(20); f.finish('original-pending');
  await assert.rejects(transition.operation, /Only an already recorded passive instrumentation gap/);
  assert.equal(f.counts.offline, 0); assert.deepEqual(f.counts.nativeReads, ['original-denial', 'original-pending']);
  assert.equal(f.client.observedCalls[2].issuedAfterDrainSnapshot, true);
  assert.ok(f.harness.drains[0].functionalQualification.hardFailures.some(x => x.category === 'unfinished-native-terminal-outcome'
    && x.protocolRequestHash === f.client.observedCalls[2].protocolRequestHash));
});

// Advance wall-clock Date WITHOUT dispatching the existing timer, matching the
// old Native elapsed-budget neighbor. No grace or new timer is introduced.
test('delayed timer dispatch cannot qualify a late issued census merely because its body gap is already known', async t => {
  const f = await fixture(t); const transition = start(f); await turn();
  assert.equal(transition.settled(), false);
  t.mock.timers.setTime(11001); f.finish('original-pending');
  await assert.rejects(transition.operation, /Only an already recorded passive instrumentation gap/);
  assert.equal(f.counts.offline, 0);
  const gap = f.harness.drains[0].functionalQualification; assert.equal(gap.allowed, false);
  assert.ok(gap.hardFailures.some(x => x.category === 'observation-drain-timeout'));
  assert.equal(f.client.callableObservationBoundaries.find(x => x.kind === 'issued-native-durable-drain').outcome, 'failed');
});
