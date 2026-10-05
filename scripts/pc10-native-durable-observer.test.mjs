import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createPc10CallableObservationBoundary } from './pc10-browser-session-proof.mjs';

const target = new URL('./pc10-native-durable-observer.mjs', import.meta.url);
let implementation = {};
try { implementation = await import(target.href); }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || !error.message.includes(target.pathname)) throw error;
}
const projectId = 'demo-native-durable-unit', functionsOrigin = 'http://127.0.0.1:5031';
const uid = 'private-unit-actor', sessionId = 'private-unit-session', groupId = 'private-unit-group';
const docA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', docB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const sourceUrl = 'pc10-native-durable-init.js';
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const reply = (extra = {}) => ({ body: JSON.stringify({ result: { actorUid: uid, sessionId, revision: 3, connectionGeneration: 2, ...extra } }), base64Encoded: false });
function api(name) { assert.equal(typeof implementation[name], 'function', `${name} is the required tested collector port`); return implementation[name]; }
function fixture({ readBody = () => Promise.resolve(reply()) } = {}) {
  const calls = [], failures = [], reads = [], timers = new Map(); let clock = 1000, timerId = 0;
  const ledger = api('createPc10NativeDurableObservationLedger')({ label: 'admiral', projectId, functionsOrigin,
    observedCalls: calls, failures, readBody: id => { reads.push(id); return readBody(id); },
    boundaryFactory: createPc10CallableObservationBoundary, now: () => clock,
    timeoutPort: { setTimeout: (callback, duration) => { timers.set(++timerId, { callback, duration }); return timerId; },
      clearTimeout: id => timers.delete(id) } });
  const witness = (doc = docA, contextId = 1, scriptId = 'script-a', frameId = 'main-frame') => {
    ledger.nativeFrame({ frame: { id: 'main-frame' } });
    ledger.nativeContext({ context: { id: contextId, uniqueId: `context-${contextId}`, auxData: { isDefault: true, frameId } } });
    ledger.nativeScript({ scriptId, executionContextId: contextId, url: sourceUrl });
    ledger.nativeDocument({ name: '__pc10NativeDurableDocumentWitness', executionContextId: contextId,
      payload: JSON.stringify({ schemaVersion: 1, documentId: doc }) });
  };
  const request = (id = 'wire-a', { name = 'getCurrentMemberSession', actor = uid, project = projectId, data = { sessionId },
    scriptId = 'script-a', frameId = 'main-frame', loaderId = 'loader-a', patch = {}, headers = {} } = {}) => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const bearer = `${encode({ alg: 'none' })}.${encode({ aud: project, iss: `https://securetoken.google.com/${project}`,
      sub: actor, user_id: actor, iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    const event = { requestId: id, frameId, loaderId,
      initiator: { type: 'script', stack: { callFrames: [{ functionName: 'pc10NativeDurableFetch', scriptId, url: sourceUrl }] } },
      request: { url: `${functionsOrigin}/${project}/us-central1/${name}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...headers }, postData: JSON.stringify({ data }) }, ...patch };
    ledger.network('request', event); return event;
  };
  const headers = (id = 'wire-a', status = 200, extra = {}) => ledger.network('headers', { requestId: id,
    response: { status, url: `${functionsOrigin}/${projectId}/us-central1/getCurrentMemberSession`,
      mimeType: 'application/json', headers: { 'content-type': 'application/json' }, ...extra } });
  const finish = (id = 'wire-a') => ledger.network('finished', { requestId: id, encodedDataLength: 100 });
  const expire = async operation => { await nextTurn(); assert.ok(timers.size > 0); const timer = [...timers.values()][0];
    assert.equal(timer.duration, 10_000); timer.callback(); await assert.rejects(operation, /Native durable/); };
  return { ledger, calls, failures, reads, timers, witness, request, headers, finish, expire, tick: amount => { clock += amount; } };
}
const noPrivate = values => { const text = JSON.stringify(values); for (const value of [uid, sessionId, groupId, 'wire-', 'script-', 'context-', docA, 'Bearer', 'private-malicious', sourceUrl]) assert.equal(text.includes(value), false, value); };

test('fast local completion reads exactly the actual native ID and records complete bytes, identity and witnesses', async () => {
  const f = fixture(); f.witness(); f.ledger.bindIdentity(uid, sessionId); f.request(); f.tick(2); f.headers(); f.tick(3); f.finish();
  assert.deepEqual(f.reads, ['wire-a'], 'Body retrieval dispatches synchronously at actual loadingFinished.');
  await f.ledger.drain(); const value = f.calls[0];
  assert.equal(value.captureMode, 'native-durable'); assert.equal(value.actorHash, digest('actor', uid));
  assert.equal(value.sessionHash, digest('session', sessionId)); assert.equal(value.projectHash, digest('project', projectId));
  assert.equal(value.requestHash, null); assert.equal(value.revision, 3); assert.equal(value.connectionGeneration, 2);
  assert.equal(value.requestFinishedAt, 1005); assert.equal(value.bodyCompletedAt, 1005); assert.equal(value.byteLength, Buffer.byteLength(reply().body));
  assert.equal(value.bodyHash, createHash('sha256').update(reply().body).digest('hex'));
  for (const field of ['protocolRequestHash', 'nativeDocumentHash', 'nativeContextHash', 'nativeFrameHash', 'nativeLoaderHash']) assert.match(value[field], /^[a-f0-9]{64}$/);
  assert.deepEqual(f.failures, []); noPrivate([f.calls, f.failures]);
});

test('old document destruction cannot remove a native body read that completes after replacement', async () => {
  const body = deferred(); const f = fixture({ readBody: () => body.promise }); f.witness(); f.request(); f.headers(); f.finish();
  f.ledger.nativeContextDestroyed({ executionContextId: 1 }); f.witness(docB, 2, 'script-b');
  const drain = f.ledger.drain(); body.resolve(reply()); await drain;
  assert.ok(f.calls[0].bodyHash); assert.deepEqual(f.failures, []); assert.equal(f.reads.length, 1);
});

test('identical concurrent POSTs bind exact native IDs and never swap old/new document result revisions', async () => {
  const bodies = new Map([['wire-old', deferred()], ['wire-new', deferred()]]);
  const f = fixture({ readBody: id => bodies.get(id).promise }); f.witness(); f.request('wire-old'); f.headers('wire-old'); f.finish('wire-old');
  f.ledger.nativeContextDestroyed({ executionContextId: 1 }); f.witness(docB, 2, 'script-b'); f.request('wire-new', { scriptId: 'script-b', loaderId: 'loader-b' });
  f.headers('wire-new'); f.finish('wire-new'); const drain = f.ledger.drain();
  bodies.get('wire-new').resolve(reply({ revision: 8 })); bodies.get('wire-old').resolve(reply({ revision: 4 })); await drain;
  assert.deepEqual(f.calls.map(value => value.revision), [4, 8]); assert.notEqual(f.calls[0].nativeDocumentHash, f.calls[1].nativeDocumentHash);
  assert.deepEqual(f.reads, ['wire-old', 'wire-new']); assert.deepEqual(f.failures, []);
});

test('late script/context/document events can prove an actual request without timestamp or current-frame guessing', async () => {
  const f = fixture(); f.request(); f.headers(); f.finish(); const drain = f.ledger.drain(); await nextTurn();
  assert.equal(f.calls[0].bodyCompletedAt, null); f.witness(); await drain; assert.deepEqual(f.failures, []);
});

test('a missing document witness cannot be replaced by complete bytes or a matching current frame', async () => {
  const f = fixture(); f.request(); f.headers(); f.finish(); await f.expire(f.ledger.drain());
  assert.equal(f.calls[0].bodyCompletedAt, null); assert.ok(f.failures.some(value => value.category === 'native-document-unavailable'));
});

for (const kind of ['wrong-frame', 'subframe', 'loader-transfer', 'script-transfer', 'reused-context', 'wrong-script-source', 'ambiguous-wrapper']) {
  test(`actual document witness rejects ${kind} rather than pairing by timing`, async () => {
    const f = fixture(); f.witness();
    if (kind === 'script-transfer') { f.witness(docB, 2, 'script-b'); f.ledger.nativeScript({ scriptId: 'script-a', executionContextId: 2, url: sourceUrl }); }
    if (kind === 'reused-context') f.ledger.nativeContext({ context: { id: 1, uniqueId: 'other-private-context', auxData: { isDefault: true, frameId: 'main-frame' } } });
    if (kind === 'wrong-script-source') f.ledger.nativeScript({ scriptId: 'script-a', executionContextId: 1, url: 'private-malicious-script' });
    const patch = kind === 'ambiguous-wrapper' ? { initiator: { type: 'script', stack: { callFrames: [
      { functionName: 'pc10NativeDurableFetch', scriptId: 'script-a' }, { functionName: 'pc10NativeDurableFetch', scriptId: 'script-b' }] } } } : {};
    if (kind === 'subframe') { f.witness(docB, 2, 'script-b', 'foreign-frame'); }
    f.request('wire-a', { frameId: ['wrong-frame', 'subframe'].includes(kind) ? 'foreign-frame' : 'main-frame', scriptId: kind === 'subframe' ? 'script-b' : 'script-a', patch });
    if (kind === 'loader-transfer') f.request('wire-b', { loaderId: 'foreign-loader' });
    await nextTurn(); assert.ok(f.failures.some(value => ['native-document-conflict', 'native-document-unavailable'].includes(value.category)), kind);
    noPrivate([f.calls, f.failures]);
  });
}

test('malformed native binding fields and duplicate document/context assignments fail without serializing payloads', () => {
  const f = fixture(); f.witness();
  for (const payload of ['private-malicious-error', JSON.stringify({ schemaVersion: 1, documentId: docA, token: 'private-malicious-error' }), JSON.stringify({ schemaVersion: 1, documentId: docB })]) {
    f.ledger.nativeDocument({ name: '__pc10NativeDurableDocumentWitness', executionContextId: 1, payload });
  }
  assert.ok(f.failures.some(value => value.category === 'native-document-conflict')); noPrivate(f.failures);
});

for (const kind of ['project', 'bearer', 'headers', 'session', 'request-id', 'envelope']) {
  test(`actual POST ${kind} metadata is mandatory and invalid values remain a strict census failure`, async () => {
    const f = fixture(); f.witness();
    const options = kind === 'project' ? { project: 'demo-foreign-private' }
      : kind === 'bearer' ? { headers: { Authorization: 'Bearer private-malicious-error' } }
      : kind === 'headers' ? { headers: { 'Content-Type': 'text/plain' } }
      : kind === 'session' ? { data: { sessionId: 7 } }
      : kind === 'request-id' ? { name: 'sendFleetGroupMessage', data: { sessionId } }
      : { patch: { request: { url: `${functionsOrigin}/${projectId}/us-central1/getCurrentMemberSession`, method: 'POST', postData: 'private-malicious-error' } } };
    f.request('wire-a', options); await nextTurn(); assert.ok(f.failures.some(value => value.category === 'request-metadata-unavailable')); noPrivate([f.calls, f.failures]);
  });
}

for (const [kind, changed] of [['actor', { actorUid: 'foreign-private-uid' }], ['session', { sessionId: 'foreign-private-session' }], ['missing-identity', { actorUid: undefined }], ['revision', { revision: -1 }]]) {
  test(`complete response ${kind} mismatch cannot be accepted on its exact native ID`, async () => {
    const f = fixture({ readBody: () => Promise.resolve(reply(changed)) }); f.witness(); f.request(); f.headers(); f.finish();
    await assert.rejects(f.ledger.drain(), /Native durable/); assert.equal(f.calls[0].bodyCompletedAt, null);
    assert.ok(f.failures.some(value => value.category === 'response-observation-unavailable')); noPrivate([f.calls, f.failures]);
  });
}

test('receipt request and audience group mismatches cannot pass even with correct actor/session bytes', async () => {
  for (const field of ['requestId', 'groupId']) {
    const f = fixture({ readBody: () => Promise.resolve(reply({ requestId: 'request-a', groupId, [field]: 'foreign-private-value' })) }); f.witness();
    f.request('wire-a', { name: 'sendFleetGroupMessage', data: { sessionId, requestId: 'request-a', expectedGroupId: groupId } });
    f.headers('wire-a', 200, { url: `${functionsOrigin}/${projectId}/us-central1/sendFleetGroupMessage` }); f.finish();
    await assert.rejects(f.ledger.drain(), /Native durable/); assert.equal(f.calls[0].bodyCompletedAt, null); assert.ok(f.failures.length);
  }
});

test('bound real actor/session identity applies before and after native metadata and rejects audience changes', async () => {
  for (const late of [false, true]) {
    const f = fixture(); f.witness(); if (!late) f.ledger.bindIdentity('other-private-actor', sessionId);
    f.request(); if (late) f.ledger.bindIdentity(uid, 'other-private-session');
    assert.ok(f.failures.some(value => value.category === 'native-identity-mismatch')); noPrivate([f.calls, f.failures]);
  }
});

test('complete expected denial bytes remain visible and unexpected HTTP500 is a retained failure', async () => {
  for (const status of [403, 500]) {
    const f = fixture({ readBody: () => Promise.resolve({ body: JSON.stringify({ error: { status: status === 403 ? 'PERMISSION_DENIED' : 'INTERNAL', message: 'private-malicious-error' } }), base64Encoded: false }) });
    f.witness(); f.request(); f.headers('wire-a', status); f.finish(); await f.ledger.drain();
    assert.ok(f.calls[0].bodyHash); assert.equal(f.calls[0].denialCode, status === 403 ? 'permission-denied' : 'internal');
    assert.equal(f.failures.some(value => value.category === 'native-unexpected-http-status'), status === 500); noPrivate([f.calls, f.failures]);
  }
});

for (const [kind, value] of [['empty', { body: '', base64Encoded: false }], ['malformed-base64', { body: 'e30=private-malicious-error', base64Encoded: true }],
  ['shape', { body: '{}', base64Encoded: 'private-malicious-error' }], ['json', { body: '{private-malicious-error', base64Encoded: false }],
  ['utf8', { body: Buffer.from([0xff, 0xfe]).toString('base64'), base64Encoded: true }],
  ['envelope', { body: JSON.stringify({ result: { actorUid: uid, sessionId }, private: 'private-malicious-error' }), base64Encoded: false }],
  ['oversize', { body: 'x'.repeat(512 * 1024 + 1), base64Encoded: false }]]) {
  test(`missing or invalid ${kind} body bytes never become a completed HTTP200 observation`, async () => {
    const f = fixture({ readBody: () => Promise.resolve(value) }); f.witness(); f.request(); f.headers(); f.finish();
    await assert.rejects(f.ledger.drain(), /Native durable/); assert.equal(f.calls[0].bodyCompletedAt, null); assert.ok(f.failures.length); noPrivate([f.calls, f.failures]);
  });
}

for (const [message, reason] of [['No resource with given identifier found', 'resource-not-found'], ['Request content was evicted from inspector cache', 'content-evicted'],
  ['No data found for resource with given identifier', 'body-unavailable'], ['private-malicious-error token/raw-uid', 'unknown']]) {
  test(`unavailable exact native response fails closed with safe reason ${reason}`, async () => {
    const f = fixture({ readBody: () => Promise.reject(new Error(`Protocol error (Network.getResponseBody): ${message}`)) }); f.witness(); f.request(); f.headers(); f.finish();
    await assert.rejects(f.ledger.drain(), /Native durable/); assert.equal(f.calls[0].bodyReadFailureReason, reason); assert.equal(f.reads.length, 1); noPrivate([f.calls, f.failures]);
  });
}

test('completed native200 lacking bytes is not waived by a later genuine reload or abort', async () => {
  const f = fixture({ readBody: () => Promise.reject(new Error('No resource with given identifier found')) }); f.witness(); f.request(); f.headers(); f.finish();
  await assert.rejects(f.ledger.transition('reload', async () => true), /Native durable/);
  f.ledger.network('failed', { requestId: 'wire-a', errorText: 'net::ERR_ABORTED', canceled: true });
  assert.equal(f.calls[0].observationDisposition, undefined); assert.equal(f.calls[0].bodyCompletedAt, null); assert.ok(f.failures.length);
});

test('actual incomplete offline cancellation stays distinct from unexpected abort and separate body loss', async () => {
  for (const planned of [false, true]) {
    const f = fixture(); f.witness(); f.request();
    if (planned) await f.ledger.transition('offline', async () => { f.ledger.network('failed', { requestId: 'wire-a', errorText: 'net::ERR_INTERNET_DISCONNECTED', canceled: false }); });
    else f.ledger.network('failed', { requestId: 'wire-a', errorText: 'net::ERR_ABORTED', canceled: true });
    await nextTurn();
    if (planned) { await f.ledger.drain(); assert.equal(f.calls[0].observationDisposition, 'cancelled-during-planned-offline'); assert.deepEqual(f.failures, []); }
    else { assert.ok(f.failures.length); assert.equal(f.calls[0].observationDisposition, undefined); }
    assert.equal(f.reads.length, 0);
  }
});

test('finite drain waits every already-issued incomplete request but never chases later normal polling', async () => {
  const f = fixture(); f.witness(); f.request('wire-a'); let done = false;
  const drain = f.ledger.drain().then(() => { done = true; }); await nextTurn(); assert.equal(done, false);
  f.request('wire-future'); f.headers('wire-a'); f.finish('wire-a'); await drain; assert.equal(done, true);
  assert.equal(f.calls[1].bodyCompletedAt, null); assert.ok(f.calls[1].issuedAfterDrainSnapshot); assert.deepEqual(f.failures, []);
  f.headers('wire-future'); f.finish('wire-future'); await f.ledger.drain(); assert.ok(f.calls[1].bodyHash);
});

test('body capture and finite issued-set drain retain exactly the existing10s deadline and cannot accept late completion', async () => {
  const body = deferred(); const f = fixture({ readBody: () => body.promise }); f.witness(); f.request(); f.headers(); f.finish();
  await f.expire(f.ledger.drain()); body.resolve(reply()); await nextTurn();
  assert.equal(f.calls[0].bodyCompletedAt, null); assert.ok(f.failures.some(value => value.bodyFailureStage === 'native-body-timeout'));
});

test('unobserved terminal event and duplicate/native redirect lifecycles remain strict failures', async () => {
  const f = fixture(); f.witness(); f.headers('missing-native-id'); f.request(); f.request(); f.headers(); f.finish(); f.finish(); await nextTurn();
  assert.ok(f.failures.some(value => value.category === 'unknown-callable-lifecycle')); assert.equal(f.reads.length, 1); noPrivate([f.calls, f.failures]);
});

test('in-flight transport without actual native terminal is never replaced by body retrieval or elapsed clocks', async () => {
  const f = fixture(); f.witness(); f.request(); f.headers(); await f.expire(f.ledger.drain());
  assert.deepEqual(f.reads, []); assert.equal(f.calls[0].requestFinishedAt, null); assert.ok(f.failures.some(value => value.category === 'unknown-callable-lifecycle'));
});

test('8MiB total in-memory body budget is enforced separately from each512KiB response limit', async () => {
  const bytes = reply(); const prefix = JSON.stringify({ result: { actorUid: uid, sessionId, padding: '' } });
  bytes.body = prefix.replace('"padding":""', `"padding":"${'x'.repeat(512 * 1024 - Buffer.byteLength(prefix))}"`);
  assert.equal(Buffer.byteLength(bytes.body), 512 * 1024);
  const f = fixture({ readBody: () => Promise.resolve(bytes) });
  for (let number = 0; number < 17; number++) { f.request(`wire-${number}`); f.headers(`wire-${number}`); f.finish(`wire-${number}`); }
  await nextTurn(); assert.ok(f.failures.some(value => value.bodyFailureStage === 'native-total-body-too-large'));
  f.witness(); await nextTurn(); assert.equal(f.calls.filter(value => value.bodyCompletedAt !== null).length, 16);
});

test('native setup mandates configured durability before init scripts and has fixed per-context buffers', async () => {
  const events = [], cdp = new EventEmitter(); cdp.send = async (name, value) => { events.push({ name, value });
    if (name === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main-frame' } } }; return {}; };
  cdp.detach = async () => events.push({ name: 'detach' });
  const context = { newCDPSession: async () => cdp, addInitScript: async value => events.push({ name: 'init', value }) };
  const capture = await api('createPc10NativeDurableBrowserCapture')({ context, page: {}, label: 'admiral', projectId, functionsOrigin,
    observedCalls: [], failures: [], boundaryFactory: createPc10CallableObservationBoundary });
  for (const name of ['Network.enable', 'Network.configureDurableMessages', 'Runtime.enable', 'Debugger.enable', 'Runtime.addBinding', 'Page.getFrameTree']) assert.ok(events.some(value => value.name === name), name);
  const configured = events.find(value => value.name === 'Network.configureDurableMessages');
  assert.deepEqual(configured.value, { maxTotalBufferSize: 8 * 1024 * 1024, maxResourceBufferSize: 512 * 1024 });
  assert.ok(events.findIndex(value => value.name === 'Network.configureDurableMessages') < events.findIndex(value => value.name === 'init'));
  assert.equal(capture.observationBudgetMs, 10_000); assert.equal(capture.captureMode, 'native-durable'); await capture.close();
});

test('unsupported configured durability fails before app initialization with no old collector fallback or raw error', async () => {
  const events = [], cdp = new EventEmitter(); cdp.send = async name => { events.push(name); if (name === 'Network.configureDurableMessages') throw new Error('private-malicious-error token'); return {}; };
  cdp.detach = async () => events.push('detach');
  const context = { newCDPSession: async () => cdp, addInitScript: async () => events.push('init') };
  await assert.rejects(api('createPc10NativeDurableBrowserCapture')({ context, page: {}, label: 'admiral', projectId, functionsOrigin,
    observedCalls: [], failures: [], boundaryFactory: createPc10CallableObservationBoundary }), error => error.message === 'Native durable collector setup is unavailable.');
  assert.equal(events.includes('init'), false); assert.equal(events.includes('detach'), true);
});

test('init fetch wrapper preserves the same promise, receiver, original arguments and every nonmatching request', () => {
  const install = api('installPc10NativeDurableWitness'); const nativeCalls = [], packets = [], result = Promise.resolve({ private: true });
  const realm = vm.createContext({ crypto: webcrypto, fetch: function (...args) { nativeCalls.push({ receiver: this, args }); return result; },
    __pc10NativeDurableDocumentWitness: value => packets.push(JSON.parse(value)) });
  vm.runInContext(`(${install.toString()})({bindingName:'__pc10NativeDurableDocumentWitness'});`, realm);
  const input = { url: 'https://nonmatching.invalid', private: true }, options = { method: 'POST', headers: { private: true } }, receiver = { own: true };
  const actual = Reflect.apply(realm.fetch, receiver, [input, options]);
  assert.equal(actual, result); assert.equal(nativeCalls.length, 1); assert.equal(nativeCalls[0].receiver, receiver); assert.equal(nativeCalls[0].args[0], input); assert.equal(nativeCalls[0].args[1], options);
  assert.equal(packets.length, 1); assert.deepEqual(Object.keys(packets[0]).sort(), ['documentId', 'schemaVersion']);
  assert.equal(realm.fetch.name, 'pc10NativeDurableFetch'); assert.match(packets[0].documentId, /^[a-f0-9-]{36}$/);
});

test('passthrough witness propagates synchronous native fetch exceptions unchanged without retry or private diagnostics', () => {
  const install = api('installPc10NativeDurableWitness'); const error = new Error('private-malicious-error'); let count = 0;
  const realm = vm.createContext({ crypto: webcrypto, fetch: () => { count++; throw error; }, __pc10NativeDurableDocumentWitness: () => undefined });
  vm.runInContext(`(${install.toString()})({bindingName:'__pc10NativeDurableDocumentWitness'});`, realm);
  assert.throws(() => realm.fetch('anything'), actual => actual === error); assert.equal(count, 1);
});

test('new explicit capture mode is registered for actor/table while original default and strict modes stay present', async () => {
  const source = await readFile(new URL('./pc10-browser-session-proof.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ createPc10NativeDurableBrowserCapture \} from '\.\/pc10-native-durable-observer\.mjs'/);
  assert.equal((source.match(/\['durable', 'stream', 'origin', 'native-durable'\]\.includes\(captureMode\)/g) ?? []).length, 2);
  assert.match(source, /captureMode === 'native-durable' \? createPc10NativeDurableBrowserCapture : createPc10OriginBrowserCapture/);
  assert.equal((source.match(/captureMode = 'durable'/g) ?? []).length, 2);
});

test('queued body callbacks cannot turn elapsed time beyond10s into success before a timer is dispatched', async () => {
  const body = deferred(); const f = fixture({ readBody: () => body.promise }); f.witness(); f.request(); f.headers(); f.finish();
  const drain = f.ledger.drain(); f.tick(10_001); body.resolve(reply());
  await assert.rejects(drain, /Native durable/); assert.equal(f.calls[0].bodyCompletedAt, null);
  assert.ok(f.failures.some(value => value.bodyFailureStage === 'native-body-timeout'));
});

test('finite drain cannot accept a late terminal after its10s elapsed budget merely because timer dispatch is delayed', async () => {
  const f = fixture(); f.witness(); f.request(); const drain = f.ledger.drain(); f.tick(10_001); f.headers(); f.finish();
  await assert.rejects(drain, /Native durable/); assert.equal(f.ledger.boundaries.at(-1).outcome, 'failed');
  assert.ok(f.failures.some(value => value.category === 'observation-drain-timeout'));
});
