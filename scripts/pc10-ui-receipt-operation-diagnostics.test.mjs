import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as receipt from './pc10-browser-ui-receipt.mjs';
import { originalProofError } from './pc10-proof-failure-evidence.mjs';

// Finite inert observer/transport counterexamples, with no browser, Auth,
// emulator, server request, gameplay, human, visual or release credit.
const request = (endpoint = 'logoutGmAccess', body = { sessionId: null, instanceId: null }) => ({
  url: () => `http://127.0.0.1:5011/demo-pc10-native/us-central1/${endpoint}`,
  method: () => 'POST', postDataJSON: () => ({ data: body }), failure: () => ({ errorText: 'net::ERR_FAILED' }),
});
const response = (r = request(), status = 200) => ({ url: r.url, request: () => r, status: () => status });
const actor = (change = {}) => ({ hasAuth: true, sameActor: true, uidHash: 'a'.repeat(16),
  sessionId: 'native-session', playerRole: 'player', profileRoleId: 'controller',
  documentTimeOrigin: 1_000, connectionGeneration: 2, identityHydrationRevision: 1,
  connection: 'live', freshness: 'server', gmInstanceOwned: false, gmAccessCached: true,
  navigatorOnline: true, pendingCommandCount: 0, pendingCommandDetails: [], ...change });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-receipt-operation-native-'));
  const page = new EventEmitter();
  page.url = () => 'http://127.0.0.1:5174/?demoJoin=NATIVE-CODE#/demo-actors';
  page.isClosed = () => false;
  let state = actor(), reads = 0;
  const diagnostics = { directory, label: 'inert-native-page', inspectState: async () => {
    reads++; return structuredClone(state);
  } };
  async function packets() {
    const names = await readdir(join(directory, 'callable-ui-operations')).catch(() => []);
    return Promise.all(names.filter(n => n.endsWith('.json')).map(async n =>
      ({ path: join(directory, 'callable-ui-operations', n), data: JSON.parse(await readFile(join(directory, 'callable-ui-operations', n), 'utf8')) })));
  }
  return { page, directory, diagnostics, packets, reads: () => reads,
    state: change => { state = actor(change); }, close: () => rm(directory, { recursive: true, force: true }) };
}
const eventTypes = ['request', 'response', 'requestfailed', 'framenavigated', 'close', 'crash', 'pageerror'];
const only = async f => { const p = await f.packets(); assert.equal(p.length, 1); return p[0]; };

test('before the click, a protected operation packet exists and the original response observer is already armed', async () => {
  const f = await fixture(); let armed = false;
  try {
    const value = response();
    await receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      consumed: { endpoint: 'logoutGmAccess', deadlineAt: 60_000, before: actor() },
      waitForResponse: () => { armed = true; return Promise.resolve(value); },
      choose: async () => {
        assert.equal(armed, true);
        const { path, data } = await only(f);
        assert.equal(data.stateBefore.navigatorOnline, true);
        assert.equal(data.consumed.before.connectionGeneration, 2);
        assert.equal(data.consumed.deadlineAt, 60_000);
        assert.equal((await stat(path)).mode & 0o777, 0o600);
      } });
  } finally { await f.close(); }
});

test('a synchronous request and response emitted during the real choice are retained without issuing another action', async () => {
  const f = await fixture(); let clicks = 0, resolveWait;
  try {
    const r = request(), reply = response(r);
    const returned = await receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => new Promise(resolve => { resolveWait = resolve; }),
      choose: async () => { clicks++; f.page.emit('request', r); f.page.emit('response', reply); resolveWait(reply); } });
    assert.equal(returned, reply); assert.equal(clicks, 1);
    const { data } = await only(f);
    assert.equal(data.events.filter(e => e.kind === 'request' && e.endpoint === 'logoutGmAccess').length, 1);
    assert.equal(data.events.filter(e => e.kind === 'response' && e.endpoint === 'logoutGmAccess' && e.httpStatus === 200).length, 1);
    assert.equal(data.status, 'response-observed');
    assert.equal(data.choiceCompleted, true);
  } finally { await f.close(); }
});

test('an issued request followed by response timeout is recorded as issued even though no response was captured', async () => {
  const f = await fixture(); let rejectWait;
  const failure = Object.freeze(new Error('native original response timeout'));
  try {
    await assert.rejects(receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => new Promise((_, reject) => { rejectWait = reject; }),
      choose: async () => { f.page.emit('request', request()); rejectWait(failure); } }), e => e === failure);
    const { data } = await only(f);
    assert.equal(data.events.filter(e => e.kind === 'request').length, 1);
    assert.equal(data.events.filter(e => e.kind === 'response').length, 0);
    assert.equal(data.status, 'response-observer-failed');
    assert.match(originalProofError(failure).heldObservationsInspect, /logoutGmAccess/);
    assert.match(originalProofError(failure).heldObservationsInspect, /stateBefore/);
  } finally { await f.close(); }
});

test('a queued cleanup with no observed transport retains the exact before and after command state without concluding no request occurred', async () => {
  const f = await fixture(); const failure = new Error('native original wait timed out');
  try {
    await assert.rejects(receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.reject(failure), choose: async () => f.state({
        gmAccessCached: false, pendingCommandCount: 1,
        pendingCommandDetails: [{ id: 'native-existing-command', kind: 'logoutGmAccess',
          payloadAuthorityContext: { sessionId: null, instanceId: null }, queuedWithServerAuthority: false }] }) }), e => e === failure);
    const { data } = await only(f);
    assert.equal(data.stateBefore.pendingCommandCount, 0);
    assert.equal(data.stateAfter.pendingCommandCount, 1);
    assert.equal(data.stateAfter.pendingCommandDetails[0].kind, 'logoutGmAccess');
    assert.equal(data.noObservedRequestProvesNoRequest, false);
  } finally { await f.close(); }
});

test('transport failure, page disposal, crash and navigation are retained with the original error and listeners removed', async () => {
  const f = await fixture(); let rejectWait; const failure = new Error('native disposed response wait');
  const r = request();
  try {
    await assert.rejects(receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => new Promise((_, reject) => { rejectWait = reject; }),
      choose: async () => {
        f.page.emit('request', r); f.page.emit('requestfailed', r);
        f.page.emit('framenavigated', { url: () => 'http://127.0.0.1:5174/?demoJoin=PRIVATE-CODE#/gm' });
        f.page.emit('crash'); f.page.emit('close'); rejectWait(failure);
      } }), e => e === failure);
    const { data } = await only(f);
    for (const kind of ['requestfailed', 'framenavigated', 'crash', 'close']) assert.ok(data.events.some(e => e.kind === kind), kind);
    assert.equal(JSON.stringify(data).includes('PRIVATE-CODE'), false);
    assert.ok(eventTypes.every(name => f.page.listenerCount(name) === 0));
  } finally { await f.close(); }
});

test('a successful receipt removes only its own listeners and retains existing page telemetry', async () => {
  const f = await fixture(); const permanent = () => {}; f.page.on('request', permanent);
  try {
    await receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.resolve(response()), choose: async () => {} });
    assert.equal(f.page.listenerCount('request'), 1);
    assert.equal(f.page.listeners('request')[0], permanent);
    assert.ok(eventTypes.filter(e => e !== 'request').every(name => f.page.listenerCount(name) === 0));
    assert.equal((await only(f)).data.status, 'response-observed');
  } finally { await f.close(); }
});

test('request parsing failure is actionable metadata and cannot replace the original response timeout', async () => {
  const f = await fixture(), original = Object.freeze(new Error('native timeout, not parser failure'));
  try {
    await assert.rejects(receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.reject(original), choose: async () => f.page.emit('request', {
        ...request(), postDataJSON: () => { throw new Error('native malformed body'); } }) }), e => e === original);
    const { data } = await only(f);
    assert.match(JSON.stringify(data.events), /native malformed body/);
    assert.match(JSON.stringify(data.originalError), /native timeout, not parser failure/);
  } finally { await f.close(); }
});

test('credential fields are omitted recursively while the real request nonce and authority payload remain visible', async () => {
  const f = await fixture();
  try {
    await receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => Promise.resolve(response()), choose: async () => f.page.emit('request', request('nativeCommand', {
        requestId: 'native-actual-request-id', sessionId: 'native-session',
        password: 'NATIVE-PASSWORD-MUST-NOT-PERSIST', nested: { authorization: 'NATIVE-AUTH-MUST-NOT-PERSIST',
          accessToken: 'NATIVE-TOKEN-MUST-NOT-PERSIST', expectedRevision: 40 } })) });
    const text = JSON.stringify((await only(f)).data);
    for (const secret of ['NATIVE-PASSWORD-MUST-NOT-PERSIST', 'NATIVE-AUTH-MUST-NOT-PERSIST', 'NATIVE-TOKEN-MUST-NOT-PERSIST']) assert.equal(text.includes(secret), false);
    assert.ok(text.includes('native-actual-request-id')); assert.ok(text.includes('expectedRevision'));
  } finally { await f.close(); }
});

test('a choice error stays primary while a later abandoned response timeout remains handled and recorded', async () => {
  const f = await fixture(); let rejectWait; const primary = Object.freeze(new Error('native unavailable real control'));
  try {
    await assert.rejects(receipt.observeUiReceipt({ page: f.page, diagnostics: f.diagnostics,
      waitForResponse: () => new Promise((_, reject) => { rejectWait = reject; }),
      choose: async () => { throw primary; } }), e => e === primary);
    rejectWait(new Error('native late observer timeout'));
    await new Promise(resolve => setImmediate(resolve));
    const { data } = await only(f);
    assert.equal(data.status, 'choice-failed');
    assert.equal(data.originalError.message, primary.message);
    assert.match(originalProofError(primary).heldObservationsInspect, /choice-failed/);
  } finally { await f.close(); }
});

test('an actor-state diagnostic read failure after the primary timeout cannot replace the original error', async () => {
  const f = await fixture(); let reads = 0; const primary = Object.freeze(new Error('native original timeout'));
  try {
    await assert.rejects(receipt.observeUiReceipt({ page: f.page, diagnostics: { ...f.diagnostics,
      inspectState: async () => { if (++reads === 2) throw new Error('native page state unavailable after disposal'); return actor(); } },
      waitForResponse: () => Promise.reject(primary), choose: async () => {} }), e => e === primary);
    const { data } = await only(f);
    assert.equal(data.originalError.message, primary.message);
    assert.match(JSON.stringify(data.stateAfterError), /state unavailable after disposal/);
  } finally { await f.close(); }
});

test('a failed mandatory before-action packet write stops the UI choice and still handles the armed observer', async () => {
  const f = await fixture(); let chooseCount = 0, rejectWait;
  try {
    const invalidDirectory = join(f.directory, 'parent-is-a-file');
    const { writeFile } = await import('node:fs/promises'); await writeFile(invalidDirectory, 'native fixture file');
    await assert.rejects(receipt.observeUiReceipt({ page: f.page, diagnostics: { ...f.diagnostics, directory: invalidDirectory },
      waitForResponse: () => new Promise((_, reject) => { rejectWait = reject;
        setImmediate(() => reject(new Error('native finite observer timeout after missing diagnostics'))); }),
      choose: async () => { chooseCount++; } }));
    assert.equal(chooseCount, 0);
    rejectWait(new Error('native abandoned observer rejection'));
    await new Promise(resolve => setImmediate(resolve));
  } finally { await f.close(); }
});

test('page-bound diagnostics cover an unchanged subsequent callable helper and retain its original wait options', async () => {
  const f = await fixture();
  try {
    assert.equal(typeof receipt.attachUiReceiptDiagnostics, 'function');
    const originalMethod = () => {}; f.page.waitForResponse = originalMethod;
    receipt.attachUiReceiptDiagnostics(f.page, f.diagnostics);
    assert.equal(f.page.waitForResponse, originalMethod, 'Diagnostics never patch a Playwright method.');
    const options = { timeout: 60_000 }, predicate = r => r.status() === 200;
    await receipt.observeUiReceipt({ page: f.page, consumed: { originalWaitTimeoutMs: options.timeout },
      waitForResponse: () => { assert.equal(options.timeout, 60_000); assert.equal(predicate(response()), true); return Promise.resolve(response()); },
      choose: async () => assert.ok((await only(f)).data.stateBefore) });
    assert.equal((await only(f)).data.consumed.originalWaitTimeoutMs, 60_000);
  } finally { await f.close(); }
});

test('the immediately pre-click held tuple is durably attached without inventing a new actor or request', async () => {
  const f = await fixture();
  try {
    assert.equal(typeof receipt.retainUiReceiptContext, 'function');
    receipt.attachUiReceiptDiagnostics(f.page, f.diagnostics);
    await receipt.observeUiReceipt({ page: f.page, consumed: { endpoint: 'logoutGmAccess', deadlineAt: 60_000 },
      waitForResponse: () => Promise.resolve(response()), choose: async () => {
        const current = actor(); await receipt.retainUiReceiptContext(f.page, { current, before: actor(), endpoint: 'logoutGmAccess', deadlineAt: 60_000 });
        const { data } = await only(f);
        assert.deepEqual(data.consumed.current, current);
        assert.equal(data.consumed.deadlineAt, 60_000);
      } });
  } finally { await f.close(); }
});

test('without registered or explicit diagnostics, the existing observer makes no extra state read and keeps error identity', async () => {
  const original = Object.freeze(new Error('native legacy original'));
  let chooseCount = 0;
  await assert.rejects(receipt.observeUiReceipt({ waitForResponse: () => Promise.reject(original),
    choose: async () => { chooseCount++; } }), e => e === original);
  assert.equal(chooseCount, 1);
});
