import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as proof from './pc10-browser-session-proof.mjs';

async function callableObservationActor() {
  // This adapter now emits the CDP Network lifecycle used by the live collector;
  // the existing boundary cases and their assertions remain unchanged.
  const page = new EventEmitter();
  page.setDefaultTimeout = () => undefined;
  page.setDefaultNavigationTimeout = () => undefined;
  page.reload = async () => undefined;
  const cdp = new EventEmitter();
  const responseBodies = new Map();
  const finished = new Set();
  let nextRequest = 0;
  cdp.send = async (method, parameters = {}) => {
    if (method === 'Network.configureDurableMessages' || method === 'Network.enable') return {};
      if (method === 'Network.getResponseBody') {
        if (!finished.has(parameters.requestId)) throw new Error('Response body is not complete yet.');
        const body = responseBodies.get(parameters.requestId);
        if (!body) throw new Error('Response body is missing.');
        return body;
      }
    throw new Error(`Unexpected CDP command: ${method}`);
  };
  cdp.detach = async () => undefined;
  const context = { newPage: async () => page, setOffline: async () => undefined,
    newCDPSession: async target => { assert.equal(target, page); return cdp; },
    close: async () => undefined };
  const actor = await proof.createPc10BrowserActor({ newContext: async () => context }, 'http://localhost', 'admiral');
  const start = () => {
    const requestId = `legacy-${++nextRequest}`;
    cdp.emit('Network.requestWillBeSent', { requestId, timestamp: 1, wallTime: 1,
      request: { url: 'http://localhost/demo/us-central1/getCurrentMemberSession', method: 'POST',
        postData: JSON.stringify({ data: { sessionId: 'own-session' } }) } });
    return requestId;
  };
  const respond = request => {
    let resolve, reject;
    // This mock is a CDP Network.getResponseBody result; CDP names the flag
    // `base64Encoded`; the previous mock used an unsupported field name.
    const body = new Promise((yes, no) => { resolve = yes; reject = no; }).then(reply => ({
      body: JSON.stringify(reply), base64Encoded: false,
    }));
    void body.catch(() => undefined);
    responseBodies.set(request, body);
    cdp.emit('Network.responseReceived', { requestId: request, timestamp: 2,
      response: { url: 'http://localhost/demo/us-central1/getCurrentMemberSession', status: 200 } });
    return { resolve: () => resolve({ result: { actorUid: 'own-actor', sessionId: 'own-session' } }), reject };
  };
  const finish = request => {
    finished.add(request);
    cdp.emit('Network.loadingFinished', { requestId: request, timestamp: 3, encodedDataLength: 1 });
  };
  const fail = (request, code) => {
    cdp.emit('Network.loadingFailed', { requestId: request, timestamp: 3, errorText: code, canceled: true });
  };
  return { actor, page, context, cdp, start, respond, finish, fail };
}
const nextObservationTurn = () => new Promise(resolve => setImmediate(resolve));
const expectedProtocolRequestHash = requestId => createHash('sha256')
  .update(`pc10-cdp-request\0${requestId}`).digest('hex');

async function cdpCallableObservationActor({ durableConfigurationError, captureMode = 'durable',
  deferStreamStart = false, streamConfigurationError } = {}) {
  const page = new EventEmitter();
  page.setDefaultTimeout = () => undefined;
  page.setDefaultNavigationTimeout = () => undefined;
  page.reload = async () => undefined;
  const events = new EventEmitter();
  const commands = [];
  const responseBodies = new Map();
  const responseBodyErrors = new Map();
  const streamBuffers = new Map();
  const streamStartHandles = new Map();
  const finished = new Set();
  let nextRequest = 0;
  let navigationComplete = false;
  let durableMessagesEnabled = false;
  let durableBodyReadCount = 0;
  let durableBodyReadAfterNavigationCount = 0;
  // Keep mock command results aligned with CDP Network.getResponseBody's schema.
  events.send = async (method, parameters = {}) => {
    commands.push({ method, parameters });
    if (method === 'Network.configureDurableMessages') {
      if (durableConfigurationError) throw durableConfigurationError;
      durableMessagesEnabled = true;
      return {};
    }
    if (method === 'Network.enable') {
      // Chromium Network.enable resets enable_durable_messages_ to its default.
      durableMessagesEnabled = false;
      return {};
    }
    if (method === 'Network.getResponseBody') {
      if (responseBodyErrors.has(parameters.requestId)) throw responseBodyErrors.get(parameters.requestId);
      if (!finished.has(parameters.requestId)) throw new Error('Response body is not complete yet.');
      if (responseBodies.has(parameters.requestId)) {
        if (parameters.requestId === 'during-reload' && !navigationComplete) {
          await new Promise(resolve => { events.once('test-navigation-complete', resolve); });
        }
        if (parameters.requestId === 'during-reload') {
          durableBodyReadCount++;
          if (navigationComplete) durableBodyReadAfterNavigationCount++;
          if (!durableMessagesEnabled) throw new Error('Network.enable reset the durable response-body setting.');
        }
        return responseBodies.get(parameters.requestId);
      }
      throw new Error('Response body is missing.');
    }
    if (method === 'Network.streamResourceContent') {
      if (streamConfigurationError) throw streamConfigurationError;
      if (deferStreamStart) return new Promise((resolve, reject) =>
        streamStartHandles.set(parameters.requestId, { resolve, reject }));
      // A CDP command records dispatch immediately; its renderer-side buffer
      // snapshot arrives asynchronously rather than inline with the event hook.
      await Promise.resolve();
      return { bufferedData: streamBuffers.get(parameters.requestId) ?? '' };
    }
    throw new Error(`Unexpected CDP command: ${method}`);
  };
  events.detach = async () => undefined;
  const context = { newPage: async () => page, newCDPSession: async target => {
    assert.equal(target, page);
    return events;
  }, setOffline: async () => undefined, close: async () => undefined };
  const actor = await proof.createPc10BrowserActor({ newContext: async () => context },
    'http://localhost', 'admiral', undefined, { captureMode });
  const startRequest = ({ requestId = `protocol-${++nextRequest}`, name = 'getCurrentMemberSession',
    method = 'POST', omitMethod = false,
    postData = JSON.stringify({ data: { requestId: 'private-request', sessionId: 'own-session' } }) } = {}) => {
    events.emit('Network.requestWillBeSent', { requestId, timestamp: 1, wallTime: 1,
      request: { url: `http://localhost/demo/us-central1/${name}`, ...(omitMethod ? {} : { method }), postData } });
    return requestId;
  };
  const start = (requestId = `protocol-${++nextRequest}`, name = 'getCurrentMemberSession') =>
    startRequest({ requestId, name });
  const receiveHeaders = (requestId, status = 200, name = 'getCurrentMemberSession') => {
    events.emit('Network.responseReceived', { requestId, timestamp: 2,
      response: { url: `http://localhost/demo/us-central1/${name}`, status } });
  };
  const setResponseBody = (requestId, response, status = 200) => {
    responseBodies.set(requestId, response);
    receiveHeaders(requestId, status);
  };
  const respond = (requestId, reply = { result: { status: 'committed', revision: 7 } }, status = 200) => {
    setResponseBody(requestId, { body: typeof reply === 'string' ? reply : JSON.stringify(reply), base64Encoded: false }, status);
  };
  const failBodyRead = (requestId, error) => responseBodyErrors.set(requestId, error);
  const setStreamBuffer = (requestId, bufferedData) => streamBuffers.set(requestId, bufferedData);
  const resolveStreamStart = (requestId, bufferedData = streamBuffers.get(requestId) ?? '') => {
    const handle = streamStartHandles.get(requestId);
    assert.ok(handle, `No deferred stream start exists for the requested protocol ID.`);
    handle.resolve({ bufferedData });
    streamStartHandles.delete(requestId);
  };
  const rejectStreamStart = (requestId, error) => {
    const handle = streamStartHandles.get(requestId);
    assert.ok(handle, `No deferred stream start exists for the requested protocol ID.`);
    handle.reject(error);
    streamStartHandles.delete(requestId);
  };
  const receiveStreamChunk = (requestId, data) => events.emit('Network.dataReceived', {
    requestId, timestamp: 2.5, dataLength: Buffer.from(data, 'base64').length,
    encodedDataLength: Buffer.from(data, 'base64').length, data,
  });
  const finish = requestId => {
    finished.add(requestId);
    events.emit('Network.loadingFinished', { requestId, timestamp: 3, encodedDataLength: 1 });
  };
  const fail = (requestId, errorText = 'net::ERR_ABORTED', canceled = true) => {
    events.emit('Network.loadingFailed', { requestId, timestamp: 3, errorText, canceled });
  };
  return { actor, page, context, events, commands, responseBodies, start, startRequest, respond, setResponseBody, finish, fail,
    failBodyRead,
    setStreamBuffer, resolveStreamStart, rejectStreamStart, receiveStreamChunk,
    receiveHeaders, get durableBodyReadCount() { return durableBodyReadCount; },
    get durableBodyReadAfterNavigationCount() { return durableBodyReadAfterNavigationCount; },
    completeNavigation() { navigationComplete = true; events.emit('test-navigation-complete'); } };
}

// These two pre-finish rejection cases remain direct boundary tests: the live
// observer reads bodies only after Network.loadingFinished, so simulating an
// early getResponseBody rejection through CDP would invent a transport event
// and could incorrectly fail a legitimate still-in-flight callable.
function incompleteBodyBoundaryActor() {
  const observedCalls = [], callableObservationFailures = [], failuresByRequest = new WeakMap();
  const boundary = proof.createPc10CallableObservationBoundary({
    onFailure(state, category) {
      const byCategory = failuresByRequest.get(state) ?? new Map();
      if (byCategory.has(category)) return;
      const failure = { roleId: 'admiral', name: state.trace.name, requestHash: state.trace.requestHash,
        status: state.trace.status, category };
      byCategory.set(category, failure); failuresByRequest.set(state, byCategory); callableObservationFailures.push(failure);
    },
    onCancellation(state) {
      for (const failure of failuresByRequest.get(state)?.values() ?? []) {
        const index = callableObservationFailures.indexOf(failure);
        if (index !== -1) callableObservationFailures.splice(index, 1);
      }
      failuresByRequest.delete(state);
    },
    onBodyUnavailable({ trace }) { proof.observePc10CallableTrace(trace, { stage: 'body-unavailable', at: Date.now() }); },
  });
  const context = { setOffline: async () => undefined };
  const actor = { observedCalls, callableObservationFailures,
    callableObservationBoundaries: boundary.boundaries,
    drainObservedCalls: () => boundary.drain(),
    setOffline: value => boundary.transition(value ? 'offline' : 'online', () => context.setOffline(value)),
  };
  const start = () => {
    const trace = proof.createPc10CallableTrace({ name: 'getCurrentMemberSession',
      transport: 'independent-browser-SDK', data: { sessionId: 'own-session' },
      startedAt: Date.now() });
    const state = boundary.start(trace);
    observedCalls.push(trace);
    return state;
  };
  const respond = state => {
    proof.observePc10CallableTrace(state.trace, { stage: 'headers', at: Date.now(), status: 200 });
    let resolve, reject;
    const pendingBody = new Promise((yes, no) => { resolve = yes; reject = no; });
    boundary.capture(state, pendingBody.then(reply => {
      proof.observePc10CallableTrace(state.trace, { stage: 'body', at: Date.now(), reply });
    }));
    return { resolve: () => resolve({ result: { actorUid: 'own-actor', sessionId: 'own-session' } }), reject };
  };
  const finish = state => {
    proof.observePc10CallableTrace(state.trace, { stage: 'finished', at: Date.now() });
    boundary.finish(state);
  };
  const fail = (state, code) => {
    proof.observePc10CallableTrace(state.trace, { stage: 'failed', at: Date.now() });
    boundary.fail(state, code);
  };
  return { actor, context, start, respond, finish, fail };
}

test('the observer uses the protocol session and rejects unavailable durable body support', async () => {
  assert.equal(typeof proof.createPc10BrowserActor, 'function');
  const failure = new Error('Network.configureDurableMessages is unsupported');
  const page = new EventEmitter();
  page.setDefaultTimeout = () => undefined;
  page.setDefaultNavigationTimeout = () => undefined;
  const cdp = new EventEmitter();
  const methods = [];
  cdp.send = async method => { methods.push(method); if (method === 'Network.configureDurableMessages') throw failure; return {}; };
  cdp.detach = async () => undefined;
  const context = { newPage: async () => page, newCDPSession: async () => cdp, close: async () => undefined };
  await assert.rejects(proof.createPc10BrowserActor({ newContext: async () => context }, 'http://localhost', 'admiral'),
    error => error === failure);
  // Network.enable resets Chromium's durable-message flag; configure it after enable.
  assert.deepEqual(methods, ['Network.enable', 'Network.configureDurableMessages']);
});

test('a same original callable completed across reload retains its durable HTTP200 body', async () => {
  const fixture = await cdpCallableObservationActor();
  const { actor, page, commands, start, respond, finish, completeNavigation } = fixture;
  const requestId = start('during-reload');
  respond(requestId);
  let releaseReload;
  const reloadGate = new Promise(resolve => { releaseReload = resolve; });
  page.reload = async () => {
    await reloadGate;
    finish(requestId);
    completeNavigation();
  };
  const reload = actor.reload();
  await nextObservationTurn();
  releaseReload();
  await reload;
  await actor.drainObservedCalls();
  const enableIndex = commands.findIndex(({ method }) => method === 'Network.enable');
  const durableIndex = commands.findIndex(({ method }) => method === 'Network.configureDurableMessages');
  assert.ok(enableIndex >= 0 && durableIndex > enableIndex,
    'Configure durable messages after Network.enable so its default reset cannot disable them.');
  assert.ok(Number.isSafeInteger(commands[durableIndex].parameters.maxTotalBufferSize) &&
    commands[durableIndex].parameters.maxTotalBufferSize > 0);
  assert.equal(fixture.durableBodyReadCount, 1);
  assert.equal(fixture.durableBodyReadAfterNavigationCount, 1);
  assert.equal(actor.observedCalls.length, 1);
  assert.equal(actor.observedCalls[0].requestFinishedAt !== null, true);
  assert.equal(actor.observedCalls[0].bodyCompletedAt !== null, true);
  assert.equal(actor.observedCalls[0].resultStatus, 'committed');
  assert.deepEqual(actor.callableObservationFailures, []);
});

test('identical callable requests retain distinct CDP protocol lifecycles', async () => {
  const { actor, start, respond, finish } = await cdpCallableObservationActor();
  const first = start('protocol-one'), second = start('protocol-two');
  respond(first, { result: { status: 'committed', revision: 4 } }); finish(first);
  respond(second, { result: { status: 'replayed', revision: 5 } }); finish(second);
  await actor.drainObservedCalls();
  assert.equal(actor.observedCalls.length, 2);
  assert.equal(actor.observedCalls[0].requestHash, actor.observedCalls[1].requestHash);
  assert.equal(actor.observedCalls[0].revision, 4);
  assert.equal(actor.observedCalls[1].revision, 5);
  assert.equal(JSON.stringify(actor.observedCalls).includes('protocol-one'), false);
  assert.equal(JSON.stringify(actor.observedCalls).includes('protocol-two'), false);
});

test('actual CDP base64Encoded false and true response bodies decode to the same callable reply', async () => {
  for (const base64Encoded of [false, true]) {
    const { actor, start, setResponseBody, finish } = await cdpCallableObservationActor();
    const requestId = start();
    const reply = { result: { status: 'committed', revision: base64Encoded ? 9 : 8 } };
    const json = JSON.stringify(reply);
    setResponseBody(requestId, { body: base64Encoded ? Buffer.from(json, 'utf8').toString('base64') : json,
      base64Encoded });
    finish(requestId);
    await actor.drainObservedCalls();
    assert.equal(actor.observedCalls.length, 1);
    assert.equal(actor.observedCalls[0].revision, base64Encoded ? 9 : 8);
    assert.equal(actor.observedCalls[0].resultStatus, 'committed');
    assert.deepEqual(actor.callableObservationFailures, []);
  }
});

test('completed HTTP200 body read errors expose only exact Chromium reason enums and remain failed', async () => {
  for (const { message, expectedReason } of [
    { message: 'No resource with given identifier found', expectedReason: 'resource-not-found' },
    { message: 'Protocol error (Network.getResponseBody): No resource with given identifier found',
      expectedReason: 'resource-not-found' },
    { message: 'Protocol error (Network.getResponseBody): Request content was evicted from inspector cache',
      expectedReason: 'content-evicted' },
    { message: 'Protocol error (Network.getResponseBody): No data found for resource with given identifier',
      expectedReason: 'body-unavailable' },
    { message: 'Protocol error (Network.getResponseBody): secret-token / private payload', expectedReason: 'unknown' },
  ]) {
    const { actor, start, receiveHeaders, finish, failBodyRead } = await cdpCallableObservationActor();
    const requestId = start();
    receiveHeaders(requestId, 200);
    failBodyRead(requestId, new Error(message));
    finish(requestId);
    await actor.drainObservedCalls();
    const failure = actor.callableObservationFailures[0];
    assert.equal(actor.observedCalls[0].status, 200);
    assert.equal(actor.observedCalls[0].requestFinishedAt !== null, true);
    assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(actor.callableObservationFailures.length, 1);
    assert.equal(failure.category, 'response-observation-unavailable');
    assert.equal(failure.bodyFailureStage, 'get-response-body');
    assert.equal(failure.bodyFailureReason, expectedReason);
    const serialized = JSON.stringify(failure);
    assert.equal(serialized.includes(message), false);
    assert.equal(serialized.includes('secret-token'), false);
    assert.equal(serialized.includes('private payload'), false);
    assert.equal(serialized.includes(requestId), false);
  }
});

test('explicit stream mode waits for both stream start and loadingFinished before decoding ordered bytes', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const { actor, commands, start, receiveHeaders, receiveStreamChunk, finish, resolveStreamStart } = fixture;
  const requestId = start('stream-race');
  receiveHeaders(requestId, 200);
  await nextObservationTurn();
  const buffered = Buffer.from('{"result":{"status":', 'utf8').toString('base64');
  const chunkOne = Buffer.from('"committed","revision":', 'utf8').toString('base64');
  const chunkTwo = Buffer.from('41}}', 'utf8').toString('base64');
  receiveStreamChunk(requestId, chunkOne);
  receiveStreamChunk(requestId, chunkTwo);
  finish(requestId);
  let drained = false;
  const drain = actor.drainObservedCalls().then(() => { drained = true; });
  await nextObservationTurn();
  assert.equal(drained, false, 'A finished response is not decoded until the stream-start command completes.');
  assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(actor.observedCalls[0].revision, null);
  resolveStreamStart(requestId, buffered);
  await drain;
  assert.equal(actor.observedCalls.length, 1);
  assert.equal(actor.observedCalls[0].name, 'getCurrentMemberSession');
  assert.equal(actor.observedCalls[0].status, 200);
  assert.equal(actor.observedCalls[0].revision, 41);
  assert.equal(actor.observedCalls[0].resultStatus, 'committed');
  assert.equal(actor.observedCalls[0].bodyCompletedAt !== null, true);
  assert.deepEqual(actor.callableObservationFailures, []);
  assert.deepEqual(commands.filter(({ method }) => method === 'Network.streamResourceContent')
    .map(({ parameters }) => parameters.requestId), [requestId]);
  assert.equal(commands.some(({ method }) => method === 'Network.getResponseBody'), false);
  assert.equal(commands.some(({ method }) => method === 'Network.configureDurableMessages'), false);
});

test('stream chunks remain bound to distinct protocol IDs for identical callable payloads', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const { actor, commands, start, receiveHeaders, receiveStreamChunk, finish, resolveStreamStart } = fixture;
  const first = start('stream-id-one'), second = start('stream-id-two');
  receiveHeaders(first, 200);
  receiveHeaders(second, 200);
  await nextObservationTurn();
  const prefix = Buffer.from('{"result":{"status":"committed","revision":', 'utf8').toString('base64');
  receiveStreamChunk(second, Buffer.from('22}}', 'utf8').toString('base64'));
  receiveStreamChunk(first, Buffer.from('11}}', 'utf8').toString('base64'));
  finish(second);
  finish(first);
  resolveStreamStart(first, prefix);
  resolveStreamStart(second, prefix);
  await actor.drainObservedCalls();
  assert.equal(actor.observedCalls.length, 2);
  assert.equal(actor.observedCalls[0].requestHash, actor.observedCalls[1].requestHash);
  assert.deepEqual(actor.observedCalls.map(call => call.revision), [11, 22]);
  assert.deepEqual(commands.filter(({ method }) => method === 'Network.streamResourceContent')
    .map(({ parameters }) => parameters.requestId).sort(), [first, second].sort());
  assert.equal(commands.some(({ method }) => method === 'Network.getResponseBody'), false);
  assert.deepEqual(actor.callableObservationFailures, []);
});

test('stream capture retains buffered bytes when the actual reload finishes the callable', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const { actor, page, commands, start, receiveHeaders, setStreamBuffer, finish, completeNavigation } = fixture;
  const requestId = start('stream-during-reload');
  setStreamBuffer(requestId, Buffer.from('{"result":{"status":"committed","revision":27}}', 'utf8').toString('base64'));
  receiveHeaders(requestId, 200);
  await nextObservationTurn();
  page.reload = async () => {
    finish(requestId);
    completeNavigation();
  };
  await actor.reload();
  await actor.drainObservedCalls();
  assert.equal(actor.observedCalls.length, 1);
  assert.equal(actor.observedCalls[0].requestFinishedAt !== null, true);
  assert.equal(actor.observedCalls[0].bodyCompletedAt !== null, true);
  assert.equal(actor.observedCalls[0].revision, 27);
  assert.deepEqual(actor.callableObservationFailures, []);
  assert.equal(commands.some(({ method }) => method === 'Network.getResponseBody'), false);
});

test('unsupported, malformed, empty, oversized, wrong-lifecycle, and incomplete streams remain strict failures', async () => {
  const streamCases = [
    { label: 'unsupported', fixture: () => cdpCallableObservationActor({ captureMode: 'stream',
      streamConfigurationError: new Error('private CDP stream error') }),
      configure: async ({ requestId, finish }) => finish(requestId), stage: 'stream-start' },
    { label: 'malformed buffered bytes', fixture: () => cdpCallableObservationActor({ captureMode: 'stream' }),
      prepare: ({ requestId, setStreamBuffer }) => setStreamBuffer(requestId, '%%%'),
      configure: async ({ requestId, finish }) => finish(requestId),
      stage: 'stream-buffer-malformed' },
    { label: 'missing body bytes', fixture: () => cdpCallableObservationActor({ captureMode: 'stream' }),
      configure: async ({ requestId, finish }) => finish(requestId), stage: 'stream-body-empty' },
    { label: 'body over 512 KiB', fixture: () => cdpCallableObservationActor({ captureMode: 'stream' }),
      prepare: ({ requestId, setStreamBuffer }) =>
        setStreamBuffer(requestId, Buffer.alloc(512 * 1024 + 1, 0x61).toString('base64')),
      configure: async ({ requestId, finish }) => finish(requestId), stage: 'stream-body-too-large' },
  ];
  for (const { label, fixture: createFixture, prepare, configure, stage } of streamCases) {
    const fixture = await createFixture();
    const { actor, start, receiveHeaders, finish, setStreamBuffer } = fixture;
    const requestId = start(`strict-stream-${label.replaceAll(' ', '-')}`);
    await prepare?.({ requestId, setStreamBuffer, finish });
    receiveHeaders(requestId, 200);
    await nextObservationTurn();
    await configure({ requestId, setStreamBuffer, finish });
    await actor.drainObservedCalls();
    assert.equal(actor.observedCalls[0].status, 200, label);
    assert.equal(actor.observedCalls[0].bodyCompletedAt, null, label);
    assert.equal(actor.observedCalls[0].revision, null, label);
    assert.equal(actor.callableObservationFailures.length, 1, label);
    assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable', label);
    assert.equal(actor.callableObservationFailures[0].bodyFailureStage, stage, label);
    assert.equal(JSON.stringify(actor.callableObservationFailures).includes('private CDP stream error'), false);
    assert.equal(JSON.stringify(actor.callableObservationFailures).includes(requestId), false);
  }

  const malformedChunk = await cdpCallableObservationActor({ captureMode: 'stream' });
  const chunkRequest = malformedChunk.start('malformed-stream-chunk');
  malformedChunk.receiveHeaders(chunkRequest, 200);
  await nextObservationTurn();
  malformedChunk.receiveStreamChunk(chunkRequest, '%%%');
  malformedChunk.finish(chunkRequest);
  await malformedChunk.actor.drainObservedCalls();
  assert.equal(malformedChunk.actor.callableObservationFailures[0].bodyFailureStage, 'stream-chunk-malformed');

  const wrongLifecycle = await cdpCallableObservationActor({ captureMode: 'stream' });
  const lifecycleRequest = wrongLifecycle.start('stream-wrong-order');
  wrongLifecycle.receiveStreamChunk(lifecycleRequest, Buffer.from('{}').toString('base64'));
  wrongLifecycle.setStreamBuffer(lifecycleRequest, Buffer.from('{"result":{"status":"committed","revision":1}}').toString('base64'));
  wrongLifecycle.receiveHeaders(lifecycleRequest, 200);
  await nextObservationTurn();
  wrongLifecycle.finish(lifecycleRequest);
  await wrongLifecycle.actor.drainObservedCalls();
  assert.equal(wrongLifecycle.actor.callableObservationFailures.some(failure =>
    failure.category === 'unknown-callable-lifecycle'), true);
  assert.equal(wrongLifecycle.actor.observedCalls[0].bodyCompletedAt, null);

  const incomplete = await cdpCallableObservationActor({ captureMode: 'stream' });
  const incompleteRequest = incomplete.start('incomplete-stream-200');
  incomplete.setStreamBuffer(incompleteRequest, Buffer.from('{"result":{"status":"committed","revision":2}}').toString('base64'));
  incomplete.receiveHeaders(incompleteRequest, 200);
  await nextObservationTurn();
  await incomplete.actor.drainObservedCalls();
  assert.equal(incomplete.actor.observedCalls[0].requestFinishedAt, null);
  assert.equal(incomplete.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(incomplete.actor.observedCalls[0].revision, null);
  incomplete.fail(incompleteRequest, 'net::ERR_TIMED_OUT', false);
  await nextObservationTurn();
  assert.equal(incomplete.actor.callableObservationFailures.length, 1);
  assert.equal(incomplete.actor.callableObservationFailures[0].category, 'unexpected-request-failure');
  assert.equal(incomplete.actor.callableObservationFailures[0].transportError, 'timed-out');
  assert.equal(incomplete.actor.observedCalls[0].bodyCompletedAt, null);
});

test('an isBase64Encoded-only legacy body is malformed CDP observation data', async () => {
  const { actor, start, setResponseBody, finish } = await cdpCallableObservationActor();
  const requestId = start();
  setResponseBody(requestId, { body: JSON.stringify({ result: { status: 'committed', revision: 10 } }),
    isBase64Encoded: false });
  finish(requestId);
  await actor.drainObservedCalls();
  assert.equal(actor.observedCalls[0].status, 200);
  assert.equal(actor.observedCalls[0].requestFinishedAt !== null, true);
  assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable');
});

test('observed GET and OPTIONS requests to callable paths are ignored by protocol ID', async () => {
  const { actor, startRequest, receiveHeaders, finish } = await cdpCallableObservationActor();
  for (const method of ['GET', 'OPTIONS']) {
    const requestId = startRequest({ requestId: `non-callable-${method}`, method });
    receiveHeaders(requestId, method === 'OPTIONS' ? 204 : 200);
    finish(requestId);
  }
  await actor.drainObservedCalls();
  assert.deepEqual(actor.observedCalls, []);
  assert.deepEqual(actor.callableObservationFailures, []);
});

test('an allowlisted response with no observed protocol request remains unbound and fails closed', async () => {
  const { actor, events } = await cdpCallableObservationActor();
  const requestId = 'truly-unbound';
  events.emit('Network.responseReceived', { requestId, timestamp: 2,
    response: { url: 'http://localhost/demo/us-central1/getCurrentMemberSession', status: 200 } });
  await actor.drainObservedCalls();
  assert.deepEqual(actor.observedCalls, []);
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'unknown-callable-lifecycle');
  assert.equal(actor.callableObservationFailures[0].protocolRequestHash, expectedProtocolRequestHash(requestId));
});

test('an observed named POST with malformed request metadata remains a failure', async () => {
  const { actor, startRequest, respond, finish } = await cdpCallableObservationActor();
  const requestId = startRequest({ requestId: 'malformed-post', postData: '{malformed' });
  respond(requestId);
  finish(requestId);
  await actor.drainObservedCalls();
  assert.equal(actor.observedCalls.length, 1);
  assert.equal(actor.observedCalls[0].name, 'getCurrentMemberSession');
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'request-metadata-unavailable');
  assert.equal(actor.callableObservationFailures[0].protocolRequestHash, expectedProtocolRequestHash(requestId));
});

test('an allowlisted request without method metadata is not presumed to be a POST', async () => {
  const { actor, startRequest } = await cdpCallableObservationActor();
  startRequest({ requestId: 'missing-method', omitMethod: true });
  await actor.drainObservedCalls();
  assert.deepEqual(actor.observedCalls, []);
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'request-metadata-unavailable');
  assert.equal(actor.callableObservationFailures[0].protocolRequestHash,
    expectedProtocolRequestHash('missing-method'));
});

test('loadingFailed exposes only a hashed request ID, allowlisted error enum, and actual canceled flag', async () => {
  for (const { errorText, canceled, safeError } of [
    { errorText: 'net::ERR_ABORTED', canceled: false, safeError: 'aborted' },
    { errorText: 'net::ERR_PRIVATE_FAILURE secret-token', canceled: true, safeError: 'unknown' },
  ]) {
    const { actor, start, fail } = await cdpCallableObservationActor();
    const requestId = `private-protocol-${safeError}`;
    start(requestId);
    fail(requestId, errorText, canceled);
    await actor.drainObservedCalls();
    const failure = actor.callableObservationFailures[0];
    assert.equal(failure.category, 'unexpected-request-failure');
    assert.equal(failure.protocolRequestHash, expectedProtocolRequestHash(requestId));
    assert.equal(failure.transportError, safeError);
    assert.equal(failure.transportCancelled, canceled);
    const serialized = JSON.stringify(failure);
    assert.equal(serialized.includes(requestId), false);
    assert.equal(serialized.includes(errorText), false);
    assert.equal(serialized.includes('secret-token'), false);
  }
});

test('a completed HTTP200 with missing or malformed protocol body remains an observation failure', async () => {
  const missing = await cdpCallableObservationActor();
  const missingRequest = missing.start();
  missing.receiveHeaders(missingRequest, 200);
  missing.finish(missingRequest);
  await missing.actor.drainObservedCalls();
  assert.equal(missing.actor.observedCalls[0].status, 200);
  assert.equal(missing.actor.observedCalls[0].requestFinishedAt !== null, true);
  assert.equal(missing.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(missing.actor.callableObservationFailures.length, 1);
  assert.equal(missing.actor.callableObservationFailures[0].category, 'response-observation-unavailable');
  assert.equal(missing.actor.callableObservationFailures[0].protocolRequestHash,
    expectedProtocolRequestHash(missingRequest));
  assert.equal(missing.actor.callableObservationFailures[0].bodyFailureStage, 'get-response-body');
  for (const body of ['', '{not-json']) {
    const { actor, start, respond, finish } = await cdpCallableObservationActor();
    const requestId = start(); respond(requestId, body); finish(requestId);
    await actor.drainObservedCalls();
    assert.equal(actor.observedCalls[0].status, 200);
    assert.equal(actor.observedCalls[0].requestFinishedAt !== null, true);
    assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(actor.callableObservationFailures.length, 1);
    assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable');
    assert.equal(actor.callableObservationFailures[0].bodyFailureStage, 'json-parse');
    if (body) assert.equal(JSON.stringify(actor.callableObservationFailures).includes(body), false);
  }
});

test('live body drain finishes its completed response without chasing future polling', async () => {
  const { actor, start, respond, finish, fail } = await callableObservationActor();
  const first = start(), firstBody = respond(first);
  finish(first);
  let drained = false;
  const drain = actor.drainObservedCalls().then(() => { drained = true; });
  const future = start();
  firstBody.resolve();
  await nextObservationTurn();
  try {
    assert.equal(drained, true, 'An ongoing future poll must not starve the completed response boundary.');
    assert.equal(actor.observedCalls[1].bodyCompletedAt, null);
    assert.equal(actor.observedCalls[1].requestFinishedAt, null);
  } finally {
    fail(future, 'net::ERR_ABORTED');
    await drain;
  }
});

test('live drain retains unfinished transport as in-flight rather than fabricating a reply', async () => {
  const { actor, start, fail } = await callableObservationActor();
  const request = start();
  let drained = false;
  const drain = actor.drainObservedCalls().then(() => { drained = true; });
  await nextObservationTurn();
  try {
    assert.equal(drained, true, 'Natural offline must not first wait for unfinished background transport.');
    assert.equal(actor.observedCalls[0].status, null);
    assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(actor.observedCalls[0].requestFinishedAt, null);
    assert.equal(actor.callableObservationBoundaries.at(-1).inFlightRequests, 1);
  } finally {
    fail(request, 'net::ERR_ABORTED');
    await drain;
  }
});

test('live drain still waits for every already finished HTTP200 body observation', async () => {
  const { actor, start, respond, finish } = await callableObservationActor();
  const request = start(), body = respond(request);
  finish(request);
  let drained = false;
  const drain = actor.drainObservedCalls().then(() => { drained = true; });
  await nextObservationTurn();
  assert.equal(drained, false);
  body.resolve();
  await drain;
  assert.equal(actor.observedCalls[0].status, 200);
  assert.ok(actor.observedCalls[0].requestFinishedAt !== null);
  assert.ok(actor.observedCalls[0].bodyCompletedAt !== null);
  assert.deepEqual(actor.callableObservationFailures, []);
});

test('actual offline cancellation records an unfinished request without claiming HTTP success', async () => {
  const { actor, context, start, fail } = await callableObservationActor();
  const request = start();
  context.setOffline = async value => {
    assert.equal(value, true);
    fail(request, 'net::ERR_INTERNET_DISCONNECTED');
  };
  await actor.setOffline(true);
  const trace = actor.observedCalls[0];
  assert.equal(trace.observationDisposition, 'cancelled-during-planned-offline');
  assert.ok(trace.requestFailedAt !== null);
  assert.equal(trace.status, null);
  assert.equal(trace.bodyCompletedAt, null);
  assert.equal(trace.resultStatus, null);
  assert.deepEqual(actor.callableObservationFailures, []);
});

test('HTTP200 headers cancelled before network finish are recorded as partial transport', async () => {
  const { actor, context, start, respond, fail } = await callableObservationActor();
  const request = start(), body = respond(request);
  context.setOffline = async () => {
    body.reject(new Error('partial body interrupted'));
    fail(request, 'net::ERR_INTERNET_DISCONNECTED');
  };
  await actor.setOffline(true);
  await nextObservationTurn();
  const trace = actor.observedCalls[0];
  assert.equal(trace.status, 200, 'Retain the real headers; they are not a completed response.');
  assert.equal(trace.requestFinishedAt, null);
  assert.equal(trace.bodyCompletedAt, null);
  assert.equal(trace.observationDisposition, 'cancelled-during-planned-offline');
  assert.deepEqual(actor.callableObservationFailures, []);
});

test('a completed HTTP200 body loss remains a failure even during deliberate offline', async () => {
  const { actor, context, start, respond, finish } = await callableObservationActor();
  const request = start(), body = respond(request);
  finish(request);
  context.setOffline = async () => body.reject(new Error('real completed response was lost'));
  await actor.setOffline(true);
  await actor.drainObservedCalls();
  assert.equal(actor.observedCalls[0].status, 200);
  assert.ok(actor.observedCalls[0].requestFinishedAt !== null);
  assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
  assert.notEqual(actor.observedCalls[0].observationDisposition, 'cancelled-during-planned-offline');
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable');
});

test('body loss without an actual requestfailed cancellation is never excused by offline intent', async () => {
  const { actor, context, start, respond, finish } = await callableObservationActor();
  const request = start(), body = respond(request);
  context.setOffline = async () => {
    body.reject(new Error('real body failure'));
    finish(request);
  };
  await actor.setOffline(true);
  await actor.drainObservedCalls();
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable');
});

test('a rejected body with no terminal transport event stays a strict observation failure', async () => {
  const { actor, context, start, respond, fail } = incompleteBodyBoundaryActor();
  const request = start(), body = respond(request);
  context.setOffline = async () => body.reject(new Error('body unavailable without transport evidence'));
  await actor.setOffline(true);
  await nextObservationTurn();
  await actor.drainObservedCalls();
  try {
    assert.equal(actor.callableObservationFailures.length, 1);
    assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable');
    assert.equal(actor.observedCalls[0].requestFinishedAt, null);
    assert.equal(actor.observedCalls[0].requestFailedAt, null);
    assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
  } finally { fail(request, 'net::ERR_TIMED_OUT'); }
});

test('body rejection is classified only after its actual offline transport cancellation arrives', async () => {
  const { actor, start, respond, fail } = incompleteBodyBoundaryActor();
  const request = start(), body = respond(request);
  await actor.setOffline(true);
  body.reject(new Error('partial body rejected before the transport event'));
  await nextObservationTurn();
  assert.equal(actor.callableObservationFailures.length, 1, 'Intent alone never excuses a rejected body.');
  fail(request, 'net::ERR_INTERNET_DISCONNECTED');
  await actor.drainObservedCalls();
  assert.deepEqual(actor.callableObservationFailures, []);
  assert.equal(actor.observedCalls[0].observationDisposition, 'cancelled-during-planned-offline');
  assert.ok(actor.observedCalls[0].requestFailedAt !== null);
  assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
  assert.ok(actor.observedCalls[0].bodyObservationFailedAt !== null &&
    actor.observedCalls[0].bodyObservationFailedAt !== undefined);
});

test('network completion without a response observation cannot become a successful drain', async () => {
  const { actor, start, finish } = await callableObservationActor();
  finish(start());
  await actor.drainObservedCalls();
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable');
  assert.equal(actor.observedCalls[0].status, null);
  assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
});

test('an old unfinished request failing after online restoration is never classified as planned offline', async () => {
  const { actor, start, fail } = await callableObservationActor();
  const request = start();
  await actor.setOffline(true);
  await actor.setOffline(false);
  const offline = actor.callableObservationBoundaries.find(boundary => boundary.kind === 'offline');
  assert.equal(offline.endedAt, actor.callableObservationBoundaries.at(-1).completedAt);
  fail(request, 'net::ERR_INTERNET_DISCONNECTED');
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.notEqual(actor.observedCalls[0].observationDisposition, 'cancelled-during-planned-offline');
});

test('transport failure during a rejected offline operation remains an unexpected failure', async () => {
  const { actor, context, start, fail } = await callableObservationActor();
  const request = start(), failure = new Error('actual offline operation rejected');
  context.setOffline = async () => {
    fail(request, 'net::ERR_INTERNET_DISCONNECTED');
    throw failure;
  };
  await assert.rejects(actor.setOffline(true), error => error === failure);
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'unexpected-request-failure');
  assert.notEqual(actor.observedCalls[0].observationDisposition, 'cancelled-during-planned-offline');
});

test('reload tags only existing unfinished requests aborted during its actual operation', async () => {
  const { actor, page, start, respond, fail } = await callableObservationActor();
  const oldRequest = start(), body = respond(oldRequest);
  page.reload = async () => {
    body.reject(new Error('old document interrupted'));
    fail(oldRequest, 'net::ERR_ABORTED');
    const newDocumentRequest = start();
    fail(newDocumentRequest, 'net::ERR_ABORTED');
  };
  await actor.reload();
  await nextObservationTurn();
  assert.equal(actor.observedCalls[0].observationDisposition, 'cancelled-during-planned-navigation');
  assert.notEqual(actor.observedCalls[1].observationDisposition, 'cancelled-during-planned-navigation');
  assert.equal(actor.callableObservationFailures.length, 1);
  assert.equal(actor.callableObservationFailures[0].category, 'unexpected-request-failure');
});

test('unexpected timeout and offline failures after restoration remain strict and redacted', async () => {
  const { actor, context, start, fail } = await callableObservationActor();
  const request = start();
  context.setOffline = async value => { if (value) fail(request, 'net::ERR_TIMED_OUT PRIVATE NOTES'); };
  await actor.setOffline(true);
  await actor.setOffline(false);
  fail(start(), 'net::ERR_INTERNET_DISCONNECTED');
  assert.equal(actor.callableObservationFailures.length, 2);
  assert.ok(actor.callableObservationFailures.every(value => value.category === 'unexpected-request-failure'));
  assert.equal(JSON.stringify(actor.callableObservationFailures).includes('PRIVATE NOTES'), false);
});

test('a failed actual transition propagates its original error without a success boundary', async () => {
  const { actor, context } = await callableObservationActor();
  const failure = new Error('actual offline operation failed');
  context.setOffline = async () => { throw failure; };
  await assert.rejects(actor.setOffline(true), error => error === failure);
  assert.equal(actor.callableObservationBoundaries.at(-1).outcome, 'failed');
});

test('ordinary admission waits for the real joined identity before requiring its consent dialog', async () => {
  assert.equal(typeof proof.completePc10OrdinaryUiAdmission, 'function');
  let release, consented = false;
  const state = { hasAuth: true, sameActor: true, hasSession: true };
  const joined = new Promise(resolve => { release = resolve; });
  const completed = proof.completePc10OrdinaryUiAdmission({ join: () => joined,
    consent: async () => { consented = true; }, inspect: async () => state });
  await Promise.resolve(); assert.equal(consented, false);
  release(state); await completed; assert.equal(consented, true);
});

test('ordinary admission rejects missing or foreign joined identity before consent', async () => {
  assert.equal(typeof proof.completePc10OrdinaryUiAdmission, 'function');
  for (const missing of ['hasAuth', 'sameActor', 'hasSession']) {
    let consented = false;
    await assert.rejects(proof.completePc10OrdinaryUiAdmission({
      join: async () => ({ hasAuth: true, sameActor: true, hasSession: true, [missing]: false }),
      consent: async () => { consented = true; }, inspect: async () => ({}) }), /joined identity/i);
    assert.equal(consented, false);
  }
});

test('ordinary admission propagates consent failure and rejects lost identity afterward', async () => {
  assert.equal(typeof proof.completePc10OrdinaryUiAdmission, 'function');
  const state = { hasAuth: true, sameActor: true, hasSession: true }, failure = new Error('actual consent failed');
  await assert.rejects(proof.completePc10OrdinaryUiAdmission({ join: async () => state,
    consent: async () => { throw failure; }, inspect: async () => state }), error => error === failure);
  await assert.rejects(proof.completePc10OrdinaryUiAdmission({ join: async () => state,
    consent: async () => undefined, inspect: async () => ({ ...state, sameActor: false }) }), /joined identity/i);
});

test('observation barrier awaits response bodies and requests added while draining', async () => {
  assert.equal(typeof proof.drainPc10CallableObservations, 'function');
  const pending = new Set(); let revision = 0, releaseFirst, releaseSecond, finished = false;
  const first = new Promise(resolve => { releaseFirst = resolve; }); pending.add(first);
  const drain = proof.drainPc10CallableObservations({ pending, revision: () => revision,
    quietMs: 1, wait: async () => undefined }).then(() => { finished = true; });
  const second = new Promise(resolve => { releaseSecond = resolve; });
  pending.add(second); revision++; pending.delete(first); releaseFirst();
  await Promise.resolve(); await Promise.resolve(); assert.equal(finished, false);
  pending.delete(second); releaseSecond(); await drain; assert.equal(finished, true);
});

test('observation barrier rejects a drain failure instead of crediting navigation', async () => {
  assert.equal(typeof proof.drainPc10CallableObservations, 'function');
  const failure = new Error('response body cannot be observed');
  await assert.rejects(proof.drainPc10CallableObservations({ pending: new Set([Promise.reject(failure)]),
    revision: () => 1, wait: async () => undefined }), error => error === failure);
});

test('observation barrier restarts quiet interval when a complete late request arrives', async () => {
  assert.equal(typeof proof.drainPc10CallableObservations, 'function');
  const pending = new Set(); let revision = 0, waits = 0;
  await proof.drainPc10CallableObservations({ pending, revision: () => revision, quietMs: 1,
    wait: async () => { if (++waits === 1) revision++; } });
  assert.equal(waits, 2, 'A request that starts and finishes in the quiet window still requires a new quiet interval.');
});

function tableFixture(overrides = {}) {
  const events = [];
  const table = {
    clients: new Map([['core', { errors: [] }], ['press-officer', { errors: [] }]]),
    async writeEvidence(filename, details) {
      events.push({ kind: 'evidence', filename });
      return { sourceCommitAtStart: 'source', sourceCommit: 'source',
        runtimeIndexSha256AtStart: 'index', runtimeIndexSha256AtEnd: 'index',
        runtimeCompiledTreeSha256AtStart: 'tree', runtimeCompiledTreeSha256AtEnd: 'tree',
        errors: [], ...details, ...overrides };
    },
  };
  return { table, events };
}

test('after-overlap acceptance is awaited on the original table before final evidence', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  const { table, events } = tableFixture();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const result = proof.completePc10BrowserProof(table, {
    details: { checks: { overlappingGameplay: true } },
    afterOverlappingProof: async received => {
      assert.equal(received, table);
      events.push({ kind: 'follow-up-start' });
      await held;
      events.push({ kind: 'follow-up-finished' });
    },
  });
  await Promise.resolve();
  assert.deepEqual(events, [{ kind: 'follow-up-start' }]);
  release();
  const evidence = await result;
  assert.equal(evidence.checks.overlappingGameplay, true);
  assert.equal(evidence.completedAfterOverlappingProof, true);
  assert.deepEqual(events.map(event => event.kind), ['follow-up-start', 'follow-up-finished', 'evidence']);
});

test('a composed acceptance failure propagates without writing a success receipt', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  const { table, events } = tableFixture();
  const failure = new Error('real lease/recovery counterexample');
  await assert.rejects(proof.completePc10BrowserProof(table, {
    afterOverlappingProof: async () => { throw failure; },
  }), error => error === failure);
  assert.deepEqual(events, []);
});

test('browser errors prohibit follow-up acceptance instead of being ignored', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  const { table, events } = tableFixture();
  table.clients.get('press-officer').errors.push('uncaught browser error');
  let followed = false;
  await assert.rejects(proof.completePc10BrowserProof(table, {
    afterOverlappingProof: async () => { followed = true; },
  }), /browser runtime errors/i);
  assert.equal(followed, false);
  assert.deepEqual(events, []);
});

test('unavailable callable observations prohibit accepting a capacity proof', async () => {
  const { table } = tableFixture();
  table.clients.get('core').callableObservationFailures = [{ category: 'response-observation-unavailable' }];
  let followed = false;
  await assert.rejects(proof.completePc10BrowserProof(table, {
    afterOverlappingProof: async () => { followed = true; },
  }), /callable observations/i);
  assert.equal(followed, false);
  const { table: late } = tableFixture({ callableObservationFailures: [{ category: 'observation-drain-timeout' }] });
  await assert.rejects(proof.completePc10BrowserProof(late), /callable observations/i);
});

test('evidence cannot accept source or any compiled Functions byte changes during the run', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  for (const changed of [
    { sourceCommit: 'changed-source' },
    { runtimeIndexSha256AtEnd: 'changed-index' },
    { runtimeCompiledTreeSha256AtEnd: 'changed-helper' },
    { errors: [{ roleId: 'press-officer', message: 'late browser error' }] },
  ]) {
    const { table } = tableFixture(changed);
    await assert.rejects(proof.completePc10BrowserProof(table), /source|runtime|browser runtime errors/i);
  }
});

test('active browser readiness requires fresh same-actor role and console authority', () => {
  assert.equal(typeof proof.isFreshPc10BrowserRole, 'function');
  const core = { hasAuth: true, sameActor: true, hasSession: true, cycle: 1,
    roleId: 'ship-console', activeConsoleRoleId: 'ship-console', connection: 'live', freshness: 'server' };
  assert.equal(proof.isFreshPc10BrowserRole(core, 'ship-console'), true);
  for (const stale of [{ freshness: 'cache' }, { connection: 'offline' },
    { activeConsoleRoleId: null }, { sameActor: false }, { roleId: 'foreign-role' }]) {
    assert.equal(proof.isFreshPc10BrowserRole({ ...core, ...stale }, 'ship-console'), false);
  }
  assert.equal(proof.isFreshPc10BrowserRole({ ...core, roleId: null,
    activeConsoleRoleId: 'press-officer' }, 'press-officer'), true);
});

test('one document observer reads current SDK and store getters without caching identity or projection', () => {
  assert.equal(typeof proof.createPc10LiveObserver, 'function');
  let currentUser = { uid: 'original-browser' };
  let state = { me: { uid: 'original-browser', assignedRoleId: 'core-role', activeConsoleRoleId: 'core-role', seatId: 'core-role' },
    session: { id: 'own-session', phase: 'active', currentTurn: 1 }, connection: 'live', sessionSnapshotFreshness: 'server' };
  let authReads = 0;
  let stateReads = 0;
  const observe = proof.createPc10LiveObserver(() => { authReads++; return { currentUser }; },
    { getState() { stateReads++; return state; } });
  assert.equal(observe().sameActor, true);
  state = { ...state, me: { ...state.me, activeConsoleRoleId: 'press-officer', assignedRoleId: null, seatId: null },
    connection: 'offline', sessionSnapshotFreshness: 'cache' };
  assert.deepEqual(observe(), { hasAuth: true, sameActor: true, hasSession: true,
    roleId: null, activeConsoleRoleId: 'press-officer', seatId: null,
    connection: 'offline', freshness: 'cache', phase: 'active', cycle: 1 });
  currentUser = { uid: 'foreign-browser' };
  assert.equal(observe().sameActor, false);
  assert.equal(authReads, 3);
  assert.equal(stateReads, 3);
});

test('page observation measures live getters and document scheduling without reloading cached modules', async () => {
  assert.equal(typeof proof.observePc10PageIdentity, 'function');
  const events = [];
  let now = 100;
  let reads = 0;
  const live = { sameActor: true, activeConsoleRoleId: 'own-role' };
  const reader = runInNewContext(`(${proof.observePc10PageIdentity.toString()})`, {
    window: { [Symbol.for('pc10-proof-live-observer')]: { read: () => { reads++; return { ...live }; }, bootstrapCount: 1 } },
    document: { visibilityState: 'hidden', hasFocus: () => false }, navigator: { onLine: true },
    performance: { now: () => now++ }, Date: { now: () => 1000 + now }, Symbol,
    console: { debug: value => events.push(value) },
  });
  assert.equal((await reader({ observationId: 1 })).sameActor, true);
  live.sameActor = false;
  assert.equal((await reader({ observationId: 2 })).sameActor, false);
  assert.equal(reads, 2);
  const parsed = events.map(proof.parsePc10IdentityObservationEvent);
  assert.deepEqual(parsed.map(event => event.stage), ['entry', 'read', 'entry', 'read']);
  for (const event of parsed) {
    assert.equal(event.bootstrapRequired, false);
    assert.equal(event.bootstrapCount, 1);
    assert.equal(event.visibility, 'hidden');
    assert.equal(event.focused, false);
    assert.equal(event.online, true);
  }
  assert.equal(parsed[1].getterDurationMs, 1);
  assert.equal(parsed[1].bootstrapDurationMs, 0);
});

test('observation telemetry accepts only timing and document metadata and drops arbitrary private values', () => {
  assert.equal(typeof proof.parsePc10IdentityObservationEvent, 'function');
  const event = { observationId: 7, stage: 'read', browserAt: 1000, bootstrapRequired: false,
    bootstrapCount: 1, visibility: 'visible', focused: true, online: true,
    getterDurationMs: 0.1, bootstrapDurationMs: 0, totalDurationMs: 1,
    uid: 'secret-actor', idToken: 'secret-token', privateHands: ['secret-hand'], notes: 'secret-notes' };
  const parsed = proof.parsePc10IdentityObservationEvent(`PC10_IDENTITY_OBSERVATION:${JSON.stringify(event)}`);
  assert.equal(parsed.observationId, 7);
  assert.equal(parsed.getterDurationMs, 0.1);
  for (const secret of ['secret-actor', 'secret-token', 'secret-hand', 'secret-notes']) {
    assert.equal(JSON.stringify(parsed).includes(secret), false);
  }
  for (const malformed of ['unrelated browser log', 'PC10_IDENTITY_OBSERVATION:not-json',
    `PC10_IDENTITY_OBSERVATION:${JSON.stringify({ ...event, observationId: -1 })}`,
    `PC10_IDENTITY_OBSERVATION:${JSON.stringify({ ...event, stage: 'arbitrary-private-text' })}`]) {
    assert.equal(proof.parsePc10IdentityObservationEvent(malformed), null);
  }
});

test('failure-only server identity diagnosis distinguishes same-actor ready authority from denial without exporting the projection', () => {
  assert.equal(typeof proof.buildPc10ServerIdentityDiagnostic, 'function');
  const actor = { localId: 'private-actor', idToken: 'private-token' };
  const result = { actorUid: actor.localId, sessionId: 'own-session', groupId: 'fleet-alpha',
    connectionGeneration: 7, assignedRoleId: 'dione-president', activeConsoleRoleId: 'dione-president',
    session: { phase: 'active', currentTurn: 1, loyalty: 'private-loyalty', wolfNotes: 'private-notes' } };
  const input = { roleId: 'dione-president', actor, sessionId: 'own-session',
    reply: { status: 200, result }, startedAt: 100, completedAt: 140 };
  const ready = proof.buildPc10ServerIdentityDiagnostic(input);
  assert.equal(ready.sameActor, true);
  assert.equal(ready.sameSession, true);
  assert.equal(ready.roleMatches, true);
  assert.equal(ready.consoleMatches, true);
  assert.equal(ready.serverReady, true);
  assert.equal(ready.connectionGeneration, 7);
  assert.equal(ready.durationMs, 40);
  assert.match(ready.groupHash, /^[a-f0-9]{64}$/);
  for (const secret of ['private-actor', 'private-token', 'private-loyalty', 'private-notes', 'fleet-alpha']) {
    assert.equal(JSON.stringify(ready).includes(secret), false);
  }
  assert.equal(proof.buildPc10ServerIdentityDiagnostic({ ...input,
    reply: { status: 200, result: { ...result, actorUid: 'foreign-actor' } } }).serverReady, false);
  const denied = proof.buildPc10ServerIdentityDiagnostic({ ...input,
    reply: { status: 403, error: { status: 'PERMISSION_DENIED', message: 'private-error-notes' } } });
  assert.equal(denied.projectionAvailable, false);
  assert.equal(denied.serverReady, false);
  assert.equal(denied.denialCode, 'PERMISSION_DENIED');
  assert.equal(JSON.stringify(denied).includes('private-error-notes'), false);
});

test('actual rate-marker diagnosis reports a valid below-budget concurrent window without copying the private document', () => {
  assert.equal(typeof proof.buildPc10RateLimitStateDiagnostic, 'function');
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { evaluateCallableRateLimit, CALLABLE_RATE_LIMIT_POLICIES } = require('../functions/lib/callableRateLimit.js');
  const identity = { callableName: 'resumeSession', sessionId: 'private-session', uid: 'private-uid' };
  const policy = CALLABLE_RATE_LIMIT_POLICIES.resumeSession;
  const opener = evaluateCallableRateLimit(undefined, identity, policy, 61_001);
  assert.equal(opener.allowed, true);
  const input = { identity, stored: opener.state, observedAt: 61_010,
    requestObservation: { startedAt: 61_000, denialCategory: 'rate-limit-state-invalid' } };
  const result = proof.buildPc10RateLimitStateDiagnostic(input);
  assert.equal(result.markerHasExactKeys, true);
  assert.equal(result.markerIdentityMatches, true);
  assert.equal(result.requestCount, 1);
  assert.equal(result.windowStartedAtMs, 61_001);
  assert.equal(result.markerWindowAfterClientRequestStarted, true);
  assert.equal(result.markerWindowAfterFreshTime, false);
  assert.equal(result.freshClockDecision, 'allowed');
  assert.equal(result.maxRequests, 10);
  for (const secret of ['private-session', 'private-uid']) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(proof.buildPc10RateLimitStateDiagnostic({ ...input,
    stored: { ...opener.state, notes: 'hidden-note' } }).freshClockDecision, 'invalid-marker');
  assert.equal(proof.buildPc10RateLimitStateDiagnostic({ ...input,
    observedAt: 61_000 }).freshClockDecision, 'invalid-marker');
});

// Network.dataReceived.data is optional before streamResourceContent enables
// streaming. These events describe byte lengths, never replacement body bytes.
const receiveStreamMetadata = (fixture, requestId, dataLength, encodedDataLength = dataLength) =>
  fixture.events.emit('Network.dataReceived', { requestId, timestamp: 2.5, dataLength, encodedDataLength });
const streamReplyBytes = revision => Buffer.from(JSON.stringify({ result: { status: 'committed', revision } }));

test('pre-activation metadata completes only from the actual returned buffer and loadingFinished', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const requestId = fixture.start('pre-activation-buffer');
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  const bytes = streamReplyBytes(51);
  receiveStreamMetadata(fixture, requestId, 9, 3);
  receiveStreamMetadata(fixture, requestId, bytes.length - 9, 4);
  fixture.finish(requestId);
  let drained = false;
  const drain = fixture.actor.drainObservedCalls().then(() => { drained = true; });
  await nextObservationTurn();
  assert.equal(drained, false, 'Metadata and loadingFinished cannot supply the buffered bytes.');
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  fixture.resolveStreamStart(requestId, bytes.toString('base64'));
  await drain;
  assert.equal(fixture.actor.observedCalls[0].status, 200);
  assert.equal(fixture.actor.observedCalls[0].revision, 51);
  assert.equal(fixture.actor.observedCalls[0].requestFinishedAt !== null, true);
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt !== null, true);
  assert.deepEqual(fixture.actor.callableObservationFailures, []);
  assert.deepEqual(fixture.commands.find(command => command.method === 'Network.enable').parameters,
    { maxTotalBufferSize: 8 * 1024 * 1024, maxResourceBufferSize: 512 * 1024 });
});

test('buffered pre-activation bytes and actual chunks before and after the reply remain in exact order', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const requestId = fixture.start('stream-reply-order');
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  const prefix = Buffer.from('{"result":{"status":');
  receiveStreamMetadata(fixture, requestId, prefix.length);
  fixture.receiveStreamChunk(requestId, Buffer.from('"committed","revision":').toString('base64'));
  fixture.resolveStreamStart(requestId, prefix.toString('base64'));
  await nextObservationTurn();
  fixture.receiveStreamChunk(requestId, Buffer.from('52}}').toString('base64'));
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null, 'An activation reply is not loadingFinished.');
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].revision, 52);
  assert.equal(fixture.actor.observedCalls[0].resultStatus, 'committed');
  assert.deepEqual(fixture.actor.callableObservationFailures, []);
});

test('pre-activation metadata requires enough actual buffered bytes even when later chunks would fill the length', async () => {
  for (const buffer of ['', Buffer.from('{').toString('base64')]) {
    const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
    const requestId = fixture.start('unbacked-pre-activation');
    fixture.receiveHeaders(requestId);
    await nextObservationTurn();
    receiveStreamMetadata(fixture, requestId, 2);
    fixture.receiveStreamChunk(requestId, streamReplyBytes(53).toString('base64'));
    fixture.resolveStreamStart(requestId, buffer);
    fixture.finish(requestId);
    await fixture.actor.drainObservedCalls();
    assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(fixture.actor.observedCalls[0].revision, null);
    assert.equal(fixture.actor.callableObservationFailures.length, 1);
    assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-buffer-incomplete');
  }
});

test('a data-bearing chunk fences off later missing bytes before the activation reply returns', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const requestId = fixture.start('data-bearing-activation-fence');
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  fixture.receiveStreamChunk(requestId, streamReplyBytes(54).toString('base64'));
  receiveStreamMetadata(fixture, requestId, 1);
  fixture.resolveStreamStart(requestId, streamReplyBytes(99).toString('base64'));
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(fixture.actor.observedCalls[0].revision, null);
  assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-chunk-missing');
});

test('missing positive-length chunks after activation cannot borrow already returned buffer bytes', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const requestId = fixture.start('post-activation-missing');
  fixture.setStreamBuffer(requestId, streamReplyBytes(55).toString('base64'));
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  receiveStreamMetadata(fixture, requestId, 1);
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(fixture.actor.observedCalls[0].revision, null);
  assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-chunk-missing');
});

test('stream metadata lengths must be nonnegative safe integers before they can be accounted', async () => {
  const malformed = [
    [undefined, 1], [null, 1], ['1', 1], [-1, 1], [0.5, 1], [Number.MAX_SAFE_INTEGER + 1, 1],
    [1, undefined], [1, null], [1, '1'], [1, -1], [1, 0.5], [1, Number.MAX_SAFE_INTEGER + 1],
  ];
  for (const [dataLength, encodedDataLength] of malformed) {
    const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
    const requestId = fixture.start('malformed-stream-metadata');
    fixture.receiveHeaders(requestId);
    await nextObservationTurn();
    fixture.events.emit('Network.dataReceived', { requestId, timestamp: 2.5, dataLength, encodedDataLength });
    fixture.resolveStreamStart(requestId, streamReplyBytes(56).toString('base64'));
    fixture.finish(requestId);
    await fixture.actor.drainObservedCalls();
    assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(fixture.actor.observedCalls[0].revision, null);
    assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-metadata-malformed');
  }
});

test('data-bearing chunks must match dataLength rather than their compressed encodedDataLength', async () => {
  for (const lengthDelta of [-1, 0, 1]) {
    const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
    const requestId = fixture.start('stream-chunk-length-binding');
    fixture.receiveHeaders(requestId);
    await nextObservationTurn();
    const bytes = streamReplyBytes(57);
    fixture.events.emit('Network.dataReceived', { requestId, timestamp: 2.5,
      dataLength: bytes.length + lengthDelta, encodedDataLength: 1, data: bytes.toString('base64') });
    fixture.finish(requestId);
    await fixture.actor.drainObservedCalls();
    if (lengthDelta === 0) {
      assert.equal(fixture.actor.observedCalls[0].revision, 57);
      assert.deepEqual(fixture.actor.callableObservationFailures, []);
    } else {
      assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
      assert.equal(fixture.actor.observedCalls[0].revision, null);
      assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-chunk-length');
    }
  }
});

test('cumulative pre-activation byte declarations cannot exceed the existing 512 KiB body cap', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const requestId = fixture.start('pre-activation-cap');
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  receiveStreamMetadata(fixture, requestId, 256 * 1024);
  receiveStreamMetadata(fixture, requestId, 256 * 1024 + 1);
  fixture.resolveStreamStart(requestId, streamReplyBytes(58).toString('base64'));
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(fixture.actor.observedCalls[0].revision, null);
  assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-body-too-large');
});

test('Chromium zero-byte encoded-length flushes add no body bytes and still require loadingFinished', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const requestId = fixture.start('encoded-length-flush');
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  fixture.receiveStreamChunk(requestId, streamReplyBytes(59).toString('base64'));
  receiveStreamMetadata(fixture, requestId, 0, 19);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].requestFinishedAt, null);
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(fixture.actor.observedCalls[0].revision, null);
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].revision, 59);
  assert.deepEqual(fixture.actor.callableObservationFailures, []);
});

test('zero-byte metadata without any actual body stays empty and cannot manufacture a reply', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const requestId = fixture.start('zero-only-stream');
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  receiveStreamMetadata(fixture, requestId, 0, 4);
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(fixture.actor.observedCalls[0].revision, null);
  assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-body-empty');
});

test('pre-activation accounting cannot use a different protocol request buffer for identical payloads', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const first = fixture.start('metadata-protocol-one'), second = fixture.start('metadata-protocol-two');
  fixture.receiveHeaders(first);
  fixture.receiveHeaders(second);
  await nextObservationTurn();
  const bytes = streamReplyBytes(60);
  receiveStreamMetadata(fixture, first, bytes.length);
  receiveStreamMetadata(fixture, second, bytes.length);
  fixture.resolveStreamStart(first, bytes.toString('base64'));
  fixture.resolveStreamStart(second, '');
  fixture.finish(second);
  fixture.finish(first);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].requestHash, fixture.actor.observedCalls[1].requestHash);
  assert.equal(fixture.actor.observedCalls[0].revision, 60);
  assert.equal(fixture.actor.observedCalls[1].bodyCompletedAt, null);
  assert.equal(fixture.actor.observedCalls[1].revision, null);
  assert.equal(fixture.actor.callableObservationFailures.length, 1);
  assert.equal(fixture.actor.callableObservationFailures[0].protocolRequestHash,
    expectedProtocolRequestHash('metadata-protocol-two'));
  assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'stream-buffer-incomplete');
});

test('accounted metadata does not waive JSON validity or leak request IDs and private reply text', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream', deferStreamStart: true });
  const requestId = fixture.start('private-raw-protocol-id');
  fixture.receiveHeaders(requestId);
  await nextObservationTurn();
  const bytes = Buffer.from('private-token private-note invalid JSON');
  receiveStreamMetadata(fixture, requestId, bytes.length);
  fixture.resolveStreamStart(requestId, bytes.toString('base64'));
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  assert.equal(fixture.actor.observedCalls[0].revision, null);
  assert.equal(fixture.actor.callableObservationFailures[0].bodyFailureStage, 'json-parse');
  for (const privateValue of [requestId, 'private-token', 'private-note']) {
    assert.equal(JSON.stringify(fixture.actor.callableObservationFailures).includes(privateValue), false);
    assert.equal(JSON.stringify(fixture.actor.observedCalls).includes(privateValue), false);
  }
});

async function tableCaptureOptionFixture() {
  const calls = { mkdir: 0, sourceRead: 0, launches: 0, actors: [], fixture: 0, writes: [] };
  const roles = Array.from({ length: 20 }, (_, index) => `native-role-${index}`);
  const browser = { close: async () => undefined };
  const fixture = { roles, players: roles.map((_, index) => ({ localId: `native-actor-${index}` })),
    press: { localId: 'native-press' }, gm: { localId: 'native-gm' },
    call: async () => undefined, cleanup: async () => undefined };
  // Execute the actual table function with native ports. Only import.meta's
  // lexical URL needs substitution to evaluate the function in a VM context.
  // No filesystem, SDK, browser, subprocess or network port performs real I/O.
  const createTable = runInNewContext(`(${proof.createPc10BrowserTable.toString()
    .replaceAll('import.meta.url', 'pc10ModuleUrl')})`, {
    assert, URL, createHash, process: { env: { VITE_FIREBASE_PROJECT_ID: 'demo-native-table' } },
    pc10ModuleUrl: new URL('./pc10-browser-session-proof.mjs', import.meta.url).href,
    mkdir: async () => { calls.mkdir++; },
    execFileSync: () => { calls.sourceRead++; return 'native-source-binding'; },
    readFile: async () => Buffer.from('native-compiled-binding'),
    compiledFunctionsBinding: async () => ({ sha256: 'native-compiled-tree-binding' }),
    createRequire: () => () => ({ recommendedRoleIds: count => { assert.equal(count, 20); return roles; } }),
    chromium: { launch: async () => { calls.launches++; return browser; } },
    PC10_PROOF_CALLABLE_ACTIONS: (await import('./pc10-proof-diagnostics.mjs')).PC10_PROOF_CALLABLE_ACTIONS,
    createPc10BrowserActor: async (actualBrowser, baseUrl, label, viewport, options) => {
      assert.equal(actualBrowser, browser);
      calls.actors.push({ baseUrl, label, viewport, captureMode: options?.captureMode });
      return { label, join: async () => undefined, errors: [], observedCalls: [],
        callableObservationFailures: [], callableObservationBoundaries: [], identityObservations: [],
        drainObservedCalls: async () => undefined };
    },
    createPc07AuthenticatedSession: async () => { calls.fixture++; return fixture; },
    writeFile: async (path, content) => { calls.writes.push({ path, evidence: JSON.parse(content) }); },
  });
  return { calls, create: options => createTable({ baseUrl: 'http://localhost:5173',
    directory: '/native-evidence-no-write', ...options }) };
}

test('the table opt-in forwards stream capture to all twenty core actors and the independent Press actor', async () => {
  const fixture = await tableCaptureOptionFixture();
  const table = await fixture.create({ captureMode: 'stream' });
  assert.equal(fixture.calls.actors.length, 21);
  assert.equal(new Set(fixture.calls.actors.map(actor => actor.label)).size, 21);
  assert.equal(fixture.calls.actors.at(-1).label, 'press-officer');
  for (const actor of fixture.calls.actors) {
    assert.equal(actor.captureMode, 'stream');
    assert.equal(actor.viewport, undefined, 'Retain the existing actor viewport default.');
  }
  const evidence = await table.writeEvidence('native-mode.json');
  assert.equal(evidence.captureMode, 'stream');
  assert.equal(evidence.actualIndependentBrowserContexts, 21);
  assert.equal(fixture.calls.writes[0].evidence.captureMode, 'stream');
  await table.cleanup();
});

test('omitted and explicit durable table options retain durable capture for every actor and the evidence', async () => {
  for (const options of [{}, { captureMode: 'durable' }]) {
    const fixture = await tableCaptureOptionFixture();
    const table = await fixture.create(options);
    assert.equal(fixture.calls.actors.length, 21);
    for (const actor of fixture.calls.actors) assert.equal(actor.captureMode, 'durable');
    assert.equal((await table.writeEvidence('native-mode.json')).captureMode, 'durable');
    await table.cleanup();
  }
});

test('invalid table capture modes fail before any directory, compiled read, browser or admission port runs', async () => {
  for (const captureMode of [null, '', false, 'buffer', 'STREAM', {}]) {
    const fixture = await tableCaptureOptionFixture();
    await assert.rejects(fixture.create({ captureMode }), /Unsupported callable body capture mode/);
    assert.equal(fixture.calls.mkdir, 0);
    assert.equal(fixture.calls.sourceRead, 0);
    assert.equal(fixture.calls.launches, 0);
    assert.equal(fixture.calls.actors.length, 0);
    assert.equal(fixture.calls.fixture, 0);
    assert.equal(fixture.calls.writes.length, 0);
  }
});

test('stream activation starts once for the exact validated POST request before any response headers', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const requestId = fixture.start('early-protocol-id');
  await nextObservationTurn();
  assert.deepEqual(fixture.commands.filter(command => command.method === 'Network.streamResourceContent')
    .map(command => command.parameters.requestId), [requestId]);
  assert.equal(fixture.actor.observedCalls[0].headersReceivedAt, null);
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
  fixture.receiveHeaders(requestId);
  fixture.receiveStreamChunk(requestId, streamReplyBytes(71).toString('base64'));
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].revision, 71);
  assert.deepEqual(fixture.actor.callableObservationFailures, []);
  assert.equal(fixture.commands.filter(command => command.method === 'Network.streamResourceContent').length, 1);
});

test('a small response completing at headers retains its body when activation preceded those headers', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const originalSend = fixture.events.send;
  fixture.events.send = async (method, parameters) => {
    if (method === 'Network.streamResourceContent' && fixture.actor.observedCalls[0].headersReceivedAt !== null) {
      throw new Error('Request with the provided ID has already finished loading');
    }
    return originalSend(method, parameters);
  };
  const requestId = fixture.start('small-completed-response');
  await nextObservationTurn();
  fixture.receiveHeaders(requestId);
  fixture.receiveStreamChunk(requestId, streamReplyBytes(72).toString('base64'));
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].status, 200);
  assert.equal(fixture.actor.observedCalls[0].requestFinishedAt !== null, true);
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt !== null, true);
  assert.equal(fixture.actor.observedCalls[0].revision, 72);
  assert.deepEqual(fixture.actor.callableObservationFailures, []);
});

test('stream-start denials classify only exact primary messages and never serialize arbitrary errors', async () => {
  const prefix = 'Protocol error (Network.streamResourceContent): ';
  const messages = [
    ['Request with the provided ID does not exists', 'resource-not-found'],
    ['Request with the provided ID has already finished loading', 'already-finished'],
    [`${prefix}Request with the provided ID does not exists`, 'resource-not-found'],
    [`${prefix}Request with the provided ID has already finished loading`, 'already-finished'],
    ['private-token private-actor https://private.invalid/?query=private-notes', 'unknown'],
    ['Request with the provided ID has already finished loading private-notes', 'unknown'],
    [`${prefix}Request with the provided ID does not exists private-token`, 'unknown'],
  ];
  for (const [message, reason] of messages) {
    const fixture = await cdpCallableObservationActor({ captureMode: 'stream',
      streamConfigurationError: new Error(message) });
    const requestId = fixture.start('private-stream-error-protocol-id');
    fixture.receiveHeaders(requestId);
    await nextObservationTurn();
    fixture.finish(requestId);
    await fixture.actor.drainObservedCalls();
    const failure = fixture.actor.callableObservationFailures[0];
    assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(failure.bodyFailureStage, 'stream-start');
    assert.equal(failure.bodyFailureReason, reason);
    for (const privateValue of [message, requestId, 'private-token', 'private-actor', 'private-notes',
      'https://private.invalid']) assert.equal(JSON.stringify(failure).includes(privateValue), false);
  }
});

test('early stream activation excludes non-POST, unknown endpoints and malformed POST metadata', async () => {
  const requests = [
    { requestId: 'known-get', method: 'GET' },
    { requestId: 'known-options', method: 'OPTIONS' },
    { requestId: 'unknown-endpoint', name: 'notAnApprovedCallable' },
    { requestId: 'malformed-envelope', postData: 'private invalid JSON' },
    { requestId: 'malformed-data', postData: '{"data":[]}' },
  ];
  for (const request of requests) {
    const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
    const requestId = fixture.startRequest(request);
    await nextObservationTurn();
    fixture.receiveHeaders(requestId, 200, request.name);
    fixture.finish(requestId);
    await fixture.actor.drainObservedCalls();
    assert.equal(fixture.commands.some(command => command.method === 'Network.streamResourceContent'), false);
    if (request.postData) {
      assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
      assert.equal(fixture.actor.callableObservationFailures.some(failure =>
        failure.category === 'request-metadata-unavailable'), true);
    }
  }
});

test('request-start streaming cannot decode a completed buffer without the actual response-header lifecycle', async () => {
  for (const chunkBeforeHeaders of [false, true]) {
    const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
    const requestId = fixture.start('missing-response-headers');
    fixture.setStreamBuffer(requestId, streamReplyBytes(73).toString('base64'));
    await nextObservationTurn();
    if (chunkBeforeHeaders) fixture.receiveStreamChunk(requestId, Buffer.from(' ').toString('base64'));
    fixture.finish(requestId);
    await fixture.actor.drainObservedCalls();
    assert.equal(fixture.actor.observedCalls[0].headersReceivedAt, null);
    assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(fixture.actor.observedCalls[0].revision, null);
    assert.equal(fixture.actor.callableObservationFailures.some(failure =>
      failure.category === 'unknown-callable-lifecycle'), true);
  }
});

test('a repeated protocol request ID remains a lifecycle failure and cannot issue a second stream activation', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const requestId = fixture.start('repeated-stream-protocol-id');
  fixture.start(requestId);
  await nextObservationTurn();
  assert.deepEqual(fixture.commands.filter(command => command.method === 'Network.streamResourceContent')
    .map(command => command.parameters.requestId), [requestId]);
  fixture.receiveHeaders(requestId);
  fixture.receiveStreamChunk(requestId, streamReplyBytes(74).toString('base64'));
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls.length, 1);
  assert.equal(fixture.actor.callableObservationFailures.some(failure =>
    failure.category === 'unknown-callable-lifecycle'), true);
  assert.equal(fixture.commands.filter(command => command.method === 'Network.streamResourceContent').length, 1);
});

test('stream dispatch is not deferred behind response headers emitted in the same observation turn', async () => {
  const fixture = await cdpCallableObservationActor({ captureMode: 'stream' });
  const originalSend = fixture.events.send;
  fixture.events.send = async (method, parameters) => {
    if (method === 'Network.streamResourceContent' && fixture.actor.observedCalls[0].headersReceivedAt !== null) {
      throw new Error('Request with the provided ID has already finished loading');
    }
    return originalSend(method, parameters);
  };
  const requestId = fixture.start('same-turn-fast-response');
  fixture.receiveHeaders(requestId);
  fixture.receiveStreamChunk(requestId, streamReplyBytes(75).toString('base64'));
  fixture.finish(requestId);
  await fixture.actor.drainObservedCalls();
  assert.equal(fixture.actor.observedCalls[0].revision, 75);
  assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt !== null, true);
  assert.deepEqual(fixture.actor.callableObservationFailures, []);
});

test('the installed Playwright CDP API prefix preserves exact stream denial enums without accepting added text', async () => {
  const cases = [
    ['cdpSession.send: Protocol error (Network.streamResourceContent): Request with the provided ID does not exists',
      'resource-not-found'],
    ['cdpSession.send: Protocol error (Network.streamResourceContent): Request with the provided ID has already finished loading',
      'already-finished'],
    ['cdpSession.send: Protocol error (Network.streamResourceContent): Request with the provided ID does not exists private-token',
      'unknown'],
    ['cdpSession.send: Protocol error (Network.getResponseBody): Request with the provided ID does not exists',
      'unknown'],
  ];
  for (const [message, reason] of cases) {
    const fixture = await cdpCallableObservationActor({ captureMode: 'stream',
      streamConfigurationError: new Error(message) });
    const requestId = fixture.start('private-api-wrapper-protocol-id');
    fixture.receiveHeaders(requestId);
    fixture.finish(requestId);
    await fixture.actor.drainObservedCalls();
    const failure = fixture.actor.callableObservationFailures[0];
    assert.equal(fixture.actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(failure.bodyFailureStage, 'stream-start');
    assert.equal(failure.bodyFailureReason, reason);
    assert.equal(JSON.stringify(failure).includes(message), false);
    assert.equal(JSON.stringify(failure).includes('private-token'), false);
    assert.equal(JSON.stringify(failure).includes(requestId), false);
  }
});
