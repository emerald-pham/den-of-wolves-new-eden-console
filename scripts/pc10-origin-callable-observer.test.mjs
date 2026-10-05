import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import * as proof from './pc10-browser-session-proof.mjs';
import { PC10_PROOF_CALLABLE_ACTIONS } from './pc10-proof-diagnostics.mjs';

// An absent implementation is the intended red state, not a skipped test.
let origin = {};
try { origin = await import('./pc10-origin-callable-observer.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

const projectId = 'demo-origin-native';
const functionsOrigin = 'http://127.0.0.1:5031';
const ownUid = 'native-private-actor';
const ownSession = 'native-private-session';
const requestId = 'native-private-request';
const config = { projectId, functionsOrigin, bindingName: '__pc10OriginNative',
  callableActions: PC10_PROOF_CALLABLE_ACTIONS };
const hashed = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function token(changes = {}) {
  const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${base64({ alg: 'none', typ: 'JWT' })}.${base64({
    aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: ownUid, user_id: ownUid,
    iat: Math.floor(Date.now() / 1000) - 30, exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: 'anonymous' }, ...changes,
  })}.`;
}
function request(name = 'getCurrentMemberSession', data = { sessionId: ownSession }, overrides = {}) {
  return { url: `${functionsOrigin}/${projectId}/us-central1/${name}`,
    options: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ data }), ...overrides } };
}
function response(body = { result: { actorUid: ownUid, sessionId: ownSession, revision: 3 } },
  { status = 200, url = request().url, bytes, bodyStream, headers = { 'Content-Type': 'application/json' }, redirected = false } = {}) {
  const value = new Response(bodyStream ?? bytes ?? JSON.stringify(body), { status, headers });
  Object.defineProperty(value, 'url', { value: url });
  Object.defineProperty(value, 'redirected', { value: redirected });
  return value;
}
function api() {
  for (const name of ['installPc10OriginCallableFetch', 'parsePc10OriginRequest', 'parsePc10OriginResult',
    'createPc10OriginObservationLedger', 'createPc10OriginBrowserCapture']) {
    assert.equal(typeof origin[name], 'function', `${name} is required`);
  }
  return origin;
}
function nativeFixture({ responder, clock, timerPort, ledgerTimers, bindingPort, finish = true } = {}) {
  const implementation = api();
  const packets = [], nativeCalls = [], observedCalls = [], failures = [];
  const ledger = implementation.createPc10OriginObservationLedger({ label: 'admiral', projectId, functionsOrigin,
    observedCalls, failures, boundaryFactory: proof.createPc10CallableObservationBoundary,
    now: clock ? () => clock.at : Date.now, timeoutPort: ledgerTimers });
  let protocolCounter = 0;
  const network = (stage, id, values = {}) => ledger.network(stage, { requestId: id, ...values });
  const nativeFetch = function (...args) {
    const nativeCall = { thisValue: this, args };
    nativeCalls.push(nativeCall);
    const [url, options] = args;
    const protocolId = `native-protocol-${++protocolCounter}`;
    network('request', protocolId, { request: { url: String(url), method: options?.method ?? 'GET',
      headers: options?.headers ?? {}, postData: options?.body } });
    const operation = Promise.resolve().then(() => responder ? responder({ url, options, protocolId })
      : response(undefined, { url: String(url) }));
    nativeCall.promise = operation.then(value => {
      network('headers', protocolId, { response: { url: String(url), status: value.status } });
      if (finish) network('finished', protocolId);
      return value;
    }, error => {
      network('failed', protocolId, { errorText: error.name === 'AbortError' ? 'net::ERR_ABORTED' : 'net::ERR_FAILED',
        canceled: error.name === 'AbortError' });
      throw error;
    });
    return nativeCall.promise;
  };
  const browser = { fetch: nativeFetch, URL, Headers, Request, Response, Uint8Array, TextEncoder, TextDecoder,
    crypto: webcrypto, atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout: timerPort?.setTimeout ?? setTimeout, clearTimeout: timerPort?.clearTimeout ?? clearTimeout,
    Date: clock ? class extends Date { static now() { return clock.at; } } : Date,
    [config.bindingName]: packet => {
      packets.push(structuredClone(packet));
      return bindingPort ? bindingPort(packet, ledger) : Promise.resolve(ledger.receive(packet));
    } };
  function install() {
    runInNewContext(`(${implementation.installPc10OriginCallableFetch.toString()})(configuration,
      (${implementation.parsePc10OriginRequest.toString()}), (${implementation.parsePc10OriginResult.toString()}))`,
    { ...browser, configuration: config });
  }
  // Retain the same browser global across simulated document replacement.
  const realm = { ...browser, configuration: config };
  const script = `(${implementation.installPc10OriginCallableFetch.toString()})(configuration,
    (${implementation.parsePc10OriginRequest.toString()}), (${implementation.parsePc10OriginResult.toString()}))`;
  runInNewContext(script, realm);
  return { realm, ledger, packets, nativeCalls, observedCalls, failures, network,
    fetch: input => realm.fetch(input.url, input.options),
    newDocument: () => { const fresh = { ...browser, configuration: config }; runInNewContext(script, fresh); return fresh; },
    install };
}
async function settled(fixture) { await nextTurn(); await fixture.ledger.drain(); }

test('opt-in origin capture completes a fast real Response clone and returns the identical original response', async () => {
  const original = response();
  const fixture = nativeFixture({ responder: () => original });
  const input = request();
  const returned = await fixture.fetch(input);
  await settled(fixture);
  assert.equal(returned, original);
  assert.equal(original.bodyUsed, false);
  assert.deepEqual(await returned.json(), { result: { actorUid: ownUid, sessionId: ownSession, revision: 3 } });
  assert.equal(fixture.nativeCalls.length, 1);
  assert.equal(fixture.nativeCalls[0].args[0], input.url);
  assert.equal(fixture.nativeCalls[0].args[1], input.options);
  assert.equal(fixture.observedCalls.length, 1);
  assert.equal(fixture.observedCalls[0].revision, 3);
  assert.equal(fixture.observedCalls[0].actorHash, hashed('actor', ownUid));
  assert.equal(fixture.observedCalls[0].sessionHash, hashed('session', ownSession));
  assert.ok(fixture.observedCalls[0].bodyCompletedAt !== null);
  assert.ok(fixture.observedCalls[0].originResponseReturnedAt >= fixture.observedCalls[0].bodyCompletedAt);
  assert.deepEqual(fixture.failures, []);
});

test('network dispatch never awaits hashing or Node binding and nonmatching fetches retain their native promise', async () => {
  const gate = deferred();
  const fixture = nativeFixture({ bindingPort: (packet, ledger) => packet.stage === 'issued'
    ? gate.promise.then(() => ledger.receive(packet)) : Promise.resolve(ledger.receive(packet)) });
  const input = request();
  const operation = fixture.fetch(input);
  assert.equal(fixture.nativeCalls.length, 1, 'Native dispatch starts in this turn without a binding acknowledgement.');
  assert.equal(fixture.nativeCalls[0].args[1], input.options);
  gate.resolve();
  await operation;
  await settled(fixture);
  assert.deepEqual(fixture.failures, []);
  for (const nonmatching of [request('notAnApprovedCallable'), { url: 'https://external.invalid/private', options: {} },
    request('getCurrentMemberSession', undefined, { method: 'GET' })]) {
    const prior = fixture.packets.length;
    const untouched = fixture.fetch(nonmatching);
    assert.equal(untouched, fixture.nativeCalls.at(-1).promise, 'Nonmatching traffic retains its exact native promise.');
    await untouched;
    assert.equal(fixture.packets.length, prior);
  }
});

test('overlapping identical actual requests retain distinct origin identities and their own actual results', async () => {
  const first = deferred(), second = deferred();
  const fixture = nativeFixture({ responder: ({ protocolId, url }) => (protocolId.endsWith('-1') ? first : second)
    .promise.then(revision => response({ result: { actorUid: ownUid, sessionId: ownSession, revision } }, { url })) });
  const input = request('claimSeat', { sessionId: ownSession, requestId });
  const one = fixture.fetch(input), two = fixture.fetch(input);
  second.resolve(12); first.resolve(11);
  await Promise.all([one, two]); await settled(fixture);
  assert.equal(fixture.nativeCalls.length, 2);
  assert.equal(fixture.observedCalls.length, 2);
  assert.notEqual(fixture.observedCalls[0].originRequestHash, fixture.observedCalls[1].originRequestHash);
  assert.equal(fixture.observedCalls[0].requestHash, fixture.observedCalls[1].requestHash);
  assert.deepEqual(fixture.observedCalls.map(value => value.revision), [11, 12]);
  assert.deepEqual(fixture.failures, []);
});

test('malformed original bearer identity, project, session and envelope fail proof closed without changing transport', async () => {
  const cases = [
    request('getCurrentMemberSession', { sessionId: ownSession }, { headers: { Authorization: 'Bearer private-malformed' } }),
    request('getCurrentMemberSession', { sessionId: ownSession }, { headers: { Authorization: `Bearer ${token({ aud: 'demo-foreign' })}`, 'Content-Type': 'application/json' } }),
    request('getCurrentMemberSession', { sessionId: '../private-session' }),
    request('getCurrentMemberSession', { sessionId: ownSession }, { body: '{private invalid' }),
    request('getCurrentMemberSession', { sessionId: ownSession }, { body: '{"data":[],"private":"secret"}' }),
    request('getCurrentMemberSession', { sessionId: ownSession }, { body: '{"data":{"sessionId":"native-private-session"},"extra":"private"}' }),
    { ...request(), url: `${functionsOrigin}/demo-foreign/us-central1/getCurrentMemberSession` },
  ];
  for (const input of cases) {
    const original = response(undefined, { url: input.url });
    const fixture = nativeFixture({ responder: () => original });
    assert.equal(await fixture.fetch(input), original);
    await settled(fixture);
    assert.equal(fixture.nativeCalls.length, 1);
    assert.equal(fixture.observedCalls.every(value => value.bodyCompletedAt === null), true);
    assert.ok(fixture.failures.length > 0);
    assert.equal(JSON.stringify(fixture.packets).includes('private-malformed'), false);
  }
});

test('a forged token UID alias, issuer or expired credential never becomes accepted actor evidence', async () => {
  for (const changes of [{ user_id: 'foreign-actor' }, { iss: 'https://private.invalid' }, { sub: '../private' },
    { exp: Math.floor(Date.now() / 1000) - 1 }]) {
    const input = request('getCurrentMemberSession', { sessionId: ownSession },
      { headers: { Authorization: `Bearer ${token(changes)}`, 'Content-Type': 'application/json' } });
    const fixture = nativeFixture();
    await fixture.fetch(input); await settled(fixture);
    assert.ok(fixture.failures.length > 0);
    assert.equal(fixture.observedCalls.some(value => value.bodyCompletedAt !== null), false);
  }
});

test('actual returned UID, session, request and group mismatches remain strict observation failures', async () => {
  const cases = [
    { actorUid: 'foreign-actor', sessionId: ownSession },
    { actorUid: ownUid, sessionId: 'foreign-session' },
    { actorUid: ownUid, sessionId: ownSession, requestId: 'foreign-request' },
    { actorUid: ownUid, sessionId: ownSession, groupId: 'fleet-2' },
    { actorUid: ownUid, sessionId: ownSession, player: { uid: 'foreign-actor', sessionId: ownSession } },
  ];
  for (const result of cases) {
    const input = request('sendFleetGroupMessage', { sessionId: ownSession, requestId, expectedGroupId: 'fleet-1' });
    const fixture = nativeFixture({ responder: ({ url }) => response({ result }, { url }) });
    await fixture.fetch(input); await settled(fixture);
    assert.equal(fixture.observedCalls[0].bodyCompletedAt, null);
    assert.ok(fixture.failures.some(value => value.category === 'response-observation-unavailable'));
  }
});

test('missing results, conflicting envelopes, malformed JSON and invalid UTF8 cannot use headers as body completion', async () => {
  for (const bytes of [Buffer.from('{}'), Buffer.from('{"data":{},"result":{}}'), Buffer.from('null'),
    Buffer.from('[{"result":{}}]'), Buffer.from('{private'), Buffer.from([0xff, 0xfe])]) {
    const fixture = nativeFixture({ responder: ({ url }) => response(undefined, { url, bytes }) });
    await fixture.fetch(request()); await settled(fixture);
    assert.equal(fixture.observedCalls[0].status, 200);
    assert.equal(fixture.observedCalls[0].bodyCompletedAt, null);
    assert.ok(fixture.failures.length > 0);
  }
});

test('real HTTP denials retain approved status/code but never copy malicious error details or private bodies', async () => {
  const secret = 'private-token-private-url-private-error-private-note';
  const fixture = nativeFixture({ responder: ({ url }) => response({ error: { status: 'PERMISSION_DENIED',
    message: secret, details: { token: token(), uid: ownUid, nested: secret } } }, { status: 403, url }) });
  await fixture.fetch(request()); await settled(fixture);
  assert.equal(fixture.observedCalls[0].status, 403);
  assert.equal(fixture.observedCalls[0].denialCode, 'permission-denied');
  assert.deepEqual(fixture.failures, []);
  for (const privateValue of [secret, token(), ownUid, ownSession]) {
    assert.equal(JSON.stringify([fixture.packets, fixture.observedCalls, fixture.failures]).includes(privateValue), false);
  }
});

test('response redirects, non-JSON content, impossible status and incomplete member identity are not accepted', async () => {
  for (const build of [() => response(undefined, { url: 'https://foreign.invalid/private' }),
    () => response(undefined, { redirected: true }),
    () => response(undefined, { headers: { 'Content-Type': 'text/html' } }),
    () => { const value = response(); Object.defineProperty(value, 'status', { value: 0 }); return value; },
    () => response({ result: { sessionId: ownSession } })]) {
    const fixture = nativeFixture({ responder: build });
    await fixture.fetch(request()); await settled(fixture);
    assert.equal(fixture.observedCalls[0].bodyCompletedAt, null);
    assert.ok(fixture.failures.length > 0);
  }
});

test('the exact original native fetch rejection survives while only its safe failure enum is recorded', async () => {
  const error = new Error('private error with token and note');
  const fixture = nativeFixture({ responder: () => { throw error; } });
  await assert.rejects(fixture.fetch(request()), actual => actual === error);
  await settled(fixture);
  assert.equal(fixture.nativeCalls.length, 1);
  assert.ok(fixture.failures.some(value => value.category === 'unexpected-request-failure'));
  assert.equal(JSON.stringify([fixture.failures, fixture.packets]).includes(error.message), false);
});

test('the original AbortSignal and request options are preserved without an injected header, retry or abort', async () => {
  const controller = new AbortController();
  const input = request('getCurrentMemberSession', { sessionId: ownSession }, { signal: controller.signal });
  const originalHeaders = { ...input.options.headers };
  const fixture = nativeFixture();
  await fixture.fetch(input); await settled(fixture);
  assert.equal(fixture.nativeCalls[0].args[1], input.options);
  assert.equal(fixture.nativeCalls[0].args[1].signal, controller.signal);
  assert.deepEqual(input.options.headers, originalHeaders);
  assert.equal(controller.signal.aborted, false);
  assert.equal(fixture.nativeCalls.length, 1);
});

test('body capture keeps the 512KiB resource cap and never exports an oversized body', async () => {
  const fixture = nativeFixture({ responder: ({ url }) => response(undefined, { url,
    bytes: Buffer.alloc(512 * 1024 + 1, 32) }) });
  await fixture.fetch(request()); await settled(fixture);
  assert.equal(fixture.observedCalls[0].bodyCompletedAt, null);
  assert.ok(fixture.failures.some(value => value.bodyFailureStage === 'origin-body-too-large'));
  assert.equal(fixture.packets.some(value => Object.hasOwn(value, 'body') || Object.hasOwn(value, 'bytes')), false);
});

test('overlapping clone buffers retain the 8MiB aggregate cap rather than a separate cap per request', async () => {
  const controllers = [];
  const fixture = nativeFixture({ finish: false, responder: ({ url }) => response(undefined, { url,
    bodyStream: new ReadableStream({ start(controller) { controllers.push(controller); } }) }) });
  const operations = Array.from({ length: 17 }, () => fixture.fetch(request()));
  await nextTurn();
  const bytes = Buffer.alloc(512 * 1024, 32);
  for (const controller of controllers) controller.enqueue(bytes);
  await nextTurn(); await nextTurn();
  assert.ok(fixture.packets.some(value => value.failureStage === 'origin-total-body-too-large'));
  for (const controller of controllers) controller.close();
  await Promise.all(operations);
  assert.equal(fixture.nativeCalls.length, 17);
});

test('body and binding capture retain a single unchanged 10s observation budget and preserve the original response on timeout', async () => {
  const timers = new Map(); let timerId = 0;
  const timerPort = { setTimeout: (callback, duration) => { timers.set(++timerId, { callback, duration }); return timerId; },
    clearTimeout: id => timers.delete(id) };
  const original = response(undefined, { bodyStream: new ReadableStream() });
  const fixture = nativeFixture({ responder: () => original, timerPort, finish: false });
  const operation = fixture.fetch(request());
  await nextTurn();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].duration, 10_000);
  [...timers.values()][0].callback();
  assert.equal(await operation, original);
  assert.ok(fixture.packets.some(value => value.failureStage === 'origin-observation-timeout'));
  assert.equal(original.bodyUsed, false);
});

test('Node-owned origin evidence survives a real document replacement and new requests use a new document identity', async () => {
  const fixture = nativeFixture();
  await fixture.fetch(request()); await settled(fixture);
  const original = structuredClone(fixture.observedCalls[0]);
  const documentTwo = fixture.newDocument();
  const input = request();
  await documentTwo.fetch(input.url, input.options); await settled(fixture);
  assert.equal(fixture.observedCalls.length, 2);
  assert.deepEqual(fixture.observedCalls[0], original);
  assert.notEqual(fixture.observedCalls[0].originRequestHash, fixture.observedCalls[1].originRequestHash);
  assert.deepEqual(fixture.failures, []);
});

test('a real renderer cancellation during the completed normal reload boundary is retained separately from unexpected aborts', async () => {
  const clock = { at: Date.now() };
  const gate = deferred();
  const fixture = nativeFixture({ clock, responder: () => gate.promise });
  const operation = fixture.fetch(request());
  void operation.catch(() => undefined);
  await nextTurn();
  await fixture.ledger.transition('reload', async () => {
    clock.at += 1; gate.reject(new DOMException('private navigation reason', 'AbortError'));
    await nextTurn(); clock.at += 1;
  });
  await assert.rejects(operation, error => error.name === 'AbortError');
  await settled(fixture);
  assert.equal(fixture.observedCalls[0].observationDisposition, 'cancelled-during-planned-navigation');
  assert.equal(fixture.observedCalls[0].requestFailedAt !== null, true);
  assert.deepEqual(fixture.failures, []);
  const unexpected = nativeFixture({ responder: () => { throw new DOMException('private reason', 'AbortError'); } });
  await assert.rejects(unexpected.fetch(request())); await settled(unexpected);
  assert.ok(unexpected.failures.some(value => value.category === 'unexpected-request-failure'));
});

test('HTTP200 loadingFinished plus lost originating body stays failed even across a deliberate reload boundary', async () => {
  const fixture = nativeFixture({ responder: () => response(undefined, { bytes: Buffer.from('{private broken') }) });
  await fixture.fetch(request());
  await fixture.ledger.transition('reload', async () => undefined);
  await settled(fixture);
  assert.equal(fixture.observedCalls[0].status, 200);
  assert.ok(fixture.observedCalls[0].requestFinishedAt !== null);
  assert.equal(fixture.observedCalls[0].bodyCompletedAt, null);
  assert.ok(fixture.failures.some(value => value.category === 'response-observation-unavailable'));
  assert.notEqual(fixture.observedCalls[0].observationDisposition, 'cancelled-during-planned-navigation');
});

test('origin census rejects an eligible native POST without a corresponding origin closure and a duplicate protocol identity', async () => {
  const timers = new Map(); let timerId = 0;
  const fixture = nativeFixture({ ledgerTimers: { setTimeout: (callback, duration) => {
    timers.set(++timerId, { callback, duration }); return timerId;
  }, clearTimeout: id => timers.delete(id) } });
  const input = request();
  fixture.network('request', 'unwrapped-native', { request: { url: input.url, method: 'POST',
    headers: input.options.headers, postData: input.options.body } });
  fixture.network('headers', 'unwrapped-native', { response: { url: input.url, status: 200 } });
  fixture.network('finished', 'unwrapped-native');
  const missing = fixture.ledger.drain();
  await nextTurn();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].duration, 10_000);
  [...timers.values()][0].callback();
  await assert.rejects(missing, /Origin callable census exceeded the observation budget/);
  assert.ok(fixture.failures.some(value => value.category === 'origin-request-unaccounted'));
  const duplicate = nativeFixture();
  await duplicate.fetch(input); await settled(duplicate);
  duplicate.network('request', 'native-protocol-1', { request: { url: input.url, method: 'POST',
    headers: input.options.headers, postData: input.options.body } });
  assert.ok(duplicate.failures.some(value => value.category === 'unknown-callable-lifecycle'));
});

test('sanitized binding rejects unknown stages, duplicate completion and arbitrary raw error properties', async () => {
  const fixture = nativeFixture();
  await fixture.fetch(request()); await settled(fixture);
  const body = fixture.packets.find(value => value.stage === 'body');
  assert.ok(body);
  fixture.ledger.receive({ ...body });
  fixture.ledger.receive({ ...body, stage: 'private-stage', raw: 'private-token-private-error' });
  assert.ok(fixture.failures.some(value => value.category === 'unknown-callable-lifecycle'));
  assert.ok(fixture.failures.some(value => value.category === 'origin-binding-schema'));
  assert.equal(JSON.stringify(fixture.failures).includes('private-token-private-error'), false);
});

test('normal SDK identity binding rejects a different live UID or own session without trusting request claims alone', async () => {
  const fixture = nativeFixture();
  await fixture.fetch(request()); await settled(fixture);
  fixture.ledger.bindIdentity('different-sdk-uid', ownSession);
  assert.ok(fixture.failures.some(value => value.category === 'origin-identity-mismatch'));
  const other = nativeFixture();
  other.ledger.bindIdentity(ownUid, 'different-sdk-session');
  await other.fetch(request()); await settled(other);
  assert.ok(other.failures.some(value => value.category === 'origin-identity-mismatch'));
});

test('origin setup uses supported binding and init script before modules and never enables a CDP body collector', async () => {
  const implementation = api();
  const operations = [], events = new EventEmitter();
  events.send = async (name, data) => { operations.push({ name, data }); return {}; };
  events.detach = async () => undefined;
  const page = { mainFrame: () => 'main-frame' };
  const context = { exposeBinding: async (name, callback) => { operations.push({ name: 'binding', callback }); },
    addInitScript: async value => { operations.push({ name: 'init', value }); },
    newCDPSession: async target => { assert.equal(target, page); return events; } };
  const capture = await implementation.createPc10OriginBrowserCapture({ context, page, label: 'admiral',
    projectId, functionsOrigin, observedCalls: [], failures: [], boundaryFactory: proof.createPc10CallableObservationBoundary });
  assert.deepEqual(operations.map(value => value.name), ['binding', 'init', 'Network.enable']);
  assert.equal(typeof operations[1].value.content, 'string');
  assert.deepEqual(operations[2].data, { maxTotalBufferSize: 8 * 1024 * 1024, maxResourceBufferSize: 512 * 1024 });
  await capture.close();
});

test('the origin Node binding fails an unrelated page or child-frame source without serializing that source', async () => {
  const implementation = api();
  let binding;
  const events = new EventEmitter(); events.send = async () => ({}); events.detach = async () => undefined;
  const page = { mainFrame: () => 'main' };
  const failures = [];
  await implementation.createPc10OriginBrowserCapture({ context: {
    exposeBinding: async (_name, callback) => { binding = callback; }, addInitScript: async () => undefined,
    newCDPSession: async () => events }, page, label: 'admiral', projectId, functionsOrigin,
  observedCalls: [], failures, boundaryFactory: proof.createPc10CallableObservationBoundary });
  await binding({ page: { url: 'private-url' }, frame: 'private-frame' }, { raw: 'private-token' });
  assert.ok(failures.some(value => value.category === 'origin-binding-source'));
  assert.equal(JSON.stringify(failures).includes('private-'), false);
});

test('captureMode origin is explicitly opt-in while durable/stream and the original observation budgets remain present', async () => {
  api();
  const source = await readFile(new URL('./pc10-browser-session-proof.mjs', import.meta.url), 'utf8');
  assert.match(source, /captureMode = 'durable'/);
  assert.match(source, /createPc10OriginBrowserCapture/);
  assert.match(source, /captureMode === 'origin'/);
  assert.match(source, /captureMode === 'stream'/);
  assert.match(source, /captureMode === 'durable'/);
  assert.match(source, /10_000, 'callable observations'/);
  assert.match(source, /maxTotalBufferSize: 8 \* 1024 \* 1024, maxResourceBufferSize: 512 \* 1024/);
});

test('finite census draining waits for already-finished request metadata without chasing future polling', async () => {
  const gate = deferred();
  const fixture = nativeFixture({ bindingPort: (packet, ledger) => packet.stage === 'metadata'
    ? gate.promise.then(() => ledger.receive(packet)) : Promise.resolve(ledger.receive(packet)) });
  const operation = fixture.fetch(request());
  await nextTurn();
  let completed = false;
  const drain = fixture.ledger.drain().then(() => { completed = true; });
  await nextTurn();
  assert.equal(completed, false, 'Finished transport still requires its actual origin metadata and body.');
  assert.deepEqual(fixture.failures, []);
  gate.resolve();
  await operation; await drain;
  assert.deepEqual(fixture.failures, []);
});

test('the optional return-intent timestamp cannot add an unbounded acknowledgement after the existing body budget', async () => {
  const gate = deferred();
  const original = response();
  const fixture = nativeFixture({ responder: () => original, bindingPort: (packet, ledger) => packet.stage === 'returned'
    ? gate.promise.then(() => ledger.receive(packet)) : Promise.resolve(ledger.receive(packet)) });
  const operation = fixture.fetch(request());
  await nextTurn(); await nextTurn();
  const finished = await Promise.race([operation, nextTurn().then(() => 'return-binding-still-pending')]);
  assert.equal(finished, original, 'Body/metadata already persisted; only the diagnostic return-intent binding is still pending.');
  gate.resolve(); await operation; await settled(fixture);
  assert.deepEqual(fixture.failures, []);
});

test('a body binding acknowledgement exceeding the unchanged budget stays a deadline failure after actual bytes were captured', async () => {
  const gate = deferred(), timers = new Map(); let timerId = 0;
  const timerPort = { setTimeout: (callback, duration) => { timers.set(++timerId, { callback, duration }); return timerId; },
    clearTimeout: id => timers.delete(id) };
  const original = response();
  const fixture = nativeFixture({ responder: () => original, timerPort, bindingPort: (packet, ledger) => {
    const result = ledger.receive(packet);
    return packet.stage === 'body' ? gate.promise.then(() => result) : Promise.resolve(result);
  } });
  const operation = fixture.fetch(request());
  await nextTurn(); await nextTurn();
  assert.ok(fixture.observedCalls[0].bodyCompletedAt !== null);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].duration, 10_000);
  [...timers.values()][0].callback();
  assert.equal(await operation, original);
  await nextTurn();
  assert.equal(fixture.observedCalls[0].originFailureStage, 'origin-observation-timeout');
  assert.ok(fixture.failures.some(value => value.category === 'origin-observation-deadline'));
  const snapshot = structuredClone(fixture.observedCalls[0]);
  gate.resolve(); await nextTurn();
  assert.deepEqual(fixture.observedCalls[0], snapshot, 'A late acknowledgement cannot rewrite deadline evidence.');
});

test('unrelated protocol completions remain untouched while a known unbound callable response fails the census', () => {
  const fixture = nativeFixture();
  fixture.network('headers', 'unrelated-image', { response: { url: 'https://external.invalid/private-image', status: 200 } });
  fixture.network('finished', 'unrelated-image');
  fixture.network('failed', 'unrelated-unobserved', { errorText: 'private unrelated error', canceled: false });
  assert.deepEqual(fixture.failures, []);
  fixture.network('headers', 'lost-callable-request', { response: { url: request().url, status: 200 } });
  assert.ok(fixture.failures.some(value => value.category === 'unknown-callable-lifecycle'));
});

test('the actual actor adapter opts into origin binding without enabling durable or streamed CDP bodies', async () => {
  api();
  const operations = [], page = new EventEmitter(), cdp = new EventEmitter();
  page.setDefaultTimeout = () => undefined; page.setDefaultNavigationTimeout = () => undefined;
  page.mainFrame = () => 'main';
  cdp.send = async (name, parameters) => { operations.push({ name, parameters }); return {}; };
  cdp.detach = async () => operations.push({ name: 'detach' });
  const context = { newPage: async () => page, newCDPSession: async () => cdp,
    exposeBinding: async () => operations.push({ name: 'binding' }),
    addInitScript: async () => operations.push({ name: 'init' }),
    close: async () => operations.push({ name: 'context-close' }) };
  const actor = await proof.createPc10BrowserActor({ newContext: async () => context }, 'http://localhost:5174', 'admiral',
    undefined, { captureMode: 'origin', originProjectId: projectId, originFunctionsOrigin: functionsOrigin });
  assert.deepEqual(operations.map(value => value.name), ['binding', 'init', 'Network.enable']);
  await actor.drainObservedCalls();
  await actor.close();
  assert.deepEqual(operations.map(value => value.name), ['binding', 'init', 'Network.enable', 'detach', 'context-close']);
});

test('a clone body failure during a real planned transport cancellation remains a body failure', async () => {
  const clock = { at: Date.now() };
  let controller;
  const fixture = nativeFixture({ clock, finish: false, responder: ({ url }) => response(undefined, { url,
    bodyStream: new ReadableStream({ start(value) { controller = value; } }) }) });
  const operation = fixture.fetch(request());
  await nextTurn();
  await fixture.ledger.transition('reload', async () => {
    clock.at += 1;
    fixture.network('failed', 'native-protocol-1', { errorText: 'net::ERR_ABORTED', canceled: true });
    controller.error(new Error('private body failure'));
    await nextTurn(); clock.at += 1;
  });
  await operation; await settled(fixture);
  assert.equal(fixture.observedCalls[0].status, 200);
  assert.equal(fixture.observedCalls[0].bodyCompletedAt, null);
  assert.ok(fixture.failures.some(value => value.category === 'response-observation-unavailable' &&
    value.bodyFailureStage === 'origin-body-read-failed'), 'Transport cancellation cannot erase a separately observed clone failure.');
  assert.equal(JSON.stringify([fixture.packets, fixture.failures]).includes('private body failure'), false);
});

test('captured originating bytes still require an actual terminal native network event within the same10s drain', async () => {
  const timers = new Map(); let counter = 0;
  const fixture = nativeFixture({ finish: false, ledgerTimers: { setTimeout: (callback, duration) => {
    timers.set(++counter, { callback, duration }); return counter;
  }, clearTimeout: id => timers.delete(id) } });
  await fixture.fetch(request());
  const drain = fixture.ledger.drain();
  await nextTurn();
  assert.ok(fixture.observedCalls[0].bodyCompletedAt !== null);
  assert.equal(fixture.observedCalls[0].requestFinishedAt, null);
  assert.equal([...timers.values()][0].duration, 10_000);
  [...timers.values()][0].callback();
  await assert.rejects(drain, /Origin callable census exceeded the observation budget/);
  assert.ok(fixture.failures.some(value => value.category === 'unknown-callable-lifecycle'));
});

test('malicious binding getters cannot serialize an arbitrary private error through the supported Node callback', () => {
  const fixture = nativeFixture();
  const packet = { get schemaVersion() { throw new Error('private-token-private-url-private-binding-error'); } };
  assert.deepEqual(fixture.ledger.receive(packet), { ok: false });
  assert.ok(fixture.failures.some(value => value.category === 'origin-binding-schema'));
  assert.equal(JSON.stringify(fixture.failures).includes('private-token'), false);
});

test('delayed sanitized metadata preserves the actual earlier requestfailed boundary rather than inventing late failure time', async () => {
  const clock = { at: Date.now() }, metadataGate = deferred(), responseGate = deferred();
  const fixture = nativeFixture({ clock, responder: () => responseGate.promise,
    bindingPort: (packet, ledger) => packet.stage === 'metadata'
      ? metadataGate.promise.then(() => ledger.receive(packet)) : Promise.resolve(ledger.receive(packet)) });
  const operation = fixture.fetch(request());
  void operation.catch(() => undefined);
  await nextTurn();
  await fixture.ledger.transition('reload', async () => {
    clock.at += 1; responseGate.reject(new DOMException('private real abort reason', 'AbortError'));
    await nextTurn(); clock.at += 1;
  });
  await assert.rejects(operation, error => error.name === 'AbortError');
  metadataGate.resolve();
  await nextTurn(); await settled(fixture);
  assert.equal(fixture.observedCalls[0].requestFailedAt, clock.at - 1);
  assert.equal(fixture.observedCalls[0].observationDisposition, 'cancelled-during-planned-navigation');
  assert.deepEqual(fixture.failures, []);
});

test('a completed origin body arriving after an actual cancelled transport cannot retain cancellation credit', async () => {
  const clock = { at: Date.now() }, metadataGate = deferred();
  const fixture = nativeFixture({ clock, finish: false, bindingPort: (packet, ledger) => packet.stage === 'metadata'
    ? metadataGate.promise.then(() => ledger.receive(packet)) : Promise.resolve(ledger.receive(packet)) });
  const operation = fixture.fetch(request());
  await nextTurn();
  await fixture.ledger.transition('reload', async () => {
    clock.at += 1;
    fixture.network('failed', 'native-protocol-1', { errorText: 'net::ERR_ABORTED', canceled: true });
    await nextTurn(); clock.at += 1;
  });
  metadataGate.resolve();
  await operation; await settled(fixture);
  assert.equal(fixture.observedCalls[0].status, 200);
  assert.ok(fixture.observedCalls[0].bodyCompletedAt !== null, 'Actual completed bytes remain recorded.');
  assert.ok(fixture.failures.some(value => value.category === 'origin-transport-mismatch'),
    'A completed original body and cancelled wire transport are contradictory strict evidence.');
  assert.equal(fixture.observedCalls[0].observationDisposition, undefined,
    'Delayed complete bytes cannot inherit earlier incomplete cancellation credit.');
});
