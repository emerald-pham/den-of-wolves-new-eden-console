import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
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
    const body = new Promise((yes, no) => { resolve = yes; reject = no; }).then(reply => ({
      body: JSON.stringify(reply), isBase64Encoded: false,
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

async function cdpCallableObservationActor({ durableConfigurationError } = {}) {
  const page = new EventEmitter();
  page.setDefaultTimeout = () => undefined;
  page.setDefaultNavigationTimeout = () => undefined;
  page.reload = async () => undefined;
  const events = new EventEmitter();
  const commands = [];
  const responseBodies = new Map();
  const finished = new Set();
  let nextRequest = 0;
  let navigationComplete = false;
  events.send = async (method, parameters = {}) => {
    commands.push({ method, parameters });
    if (method === 'Network.configureDurableMessages') {
      if (durableConfigurationError) throw durableConfigurationError;
      return {};
    }
    if (method === 'Network.enable') return {};
    if (method === 'Network.getResponseBody') {
      if (!finished.has(parameters.requestId)) throw new Error('Response body is not complete yet.');
      if (responseBodies.has(parameters.requestId)) {
        if (parameters.requestId === 'during-reload' && !navigationComplete) {
          await new Promise(resolve => { events.once('test-navigation-complete', resolve); });
        }
        return responseBodies.get(parameters.requestId);
      }
      throw new Error('Response body is missing.');
    }
    throw new Error(`Unexpected CDP command: ${method}`);
  };
  events.detach = async () => undefined;
  const context = { newPage: async () => page, newCDPSession: async target => {
    assert.equal(target, page);
    return events;
  }, setOffline: async () => undefined, close: async () => undefined };
  const actor = await proof.createPc10BrowserActor({ newContext: async () => context }, 'http://localhost', 'admiral');
  const start = (requestId = `protocol-${++nextRequest}`, name = 'getCurrentMemberSession') => {
    events.emit('Network.requestWillBeSent', { requestId, timestamp: 1, wallTime: 1,
      request: { url: `http://localhost/demo/us-central1/${name}`, method: 'POST',
        postData: JSON.stringify({ data: { requestId: 'private-request', sessionId: 'own-session' } }) } });
    return requestId;
  };
  const receiveHeaders = (requestId, status = 200) => {
    events.emit('Network.responseReceived', { requestId, timestamp: 2,
      response: { url: 'http://localhost/demo/us-central1/getCurrentMemberSession', status } });
  };
  const respond = (requestId, reply = { result: { status: 'committed', revision: 7 } }, status = 200) => {
    responseBodies.set(requestId, typeof reply === 'string' ? { body: reply, isBase64Encoded: false }
      : { body: JSON.stringify(reply), isBase64Encoded: false });
    receiveHeaders(requestId, status);
  };
  const finish = requestId => {
    finished.add(requestId);
    events.emit('Network.loadingFinished', { requestId, timestamp: 3, encodedDataLength: 1 });
  };
  const fail = (requestId, errorText = 'net::ERR_ABORTED') => {
    events.emit('Network.loadingFailed', { requestId, timestamp: 3, errorText, canceled: true });
  };
  return { actor, page, context, events, commands, responseBodies, start, respond, finish, fail,
    receiveHeaders, completeNavigation() { navigationComplete = true; events.emit('test-navigation-complete'); } };
}

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
  assert.deepEqual(methods, ['Network.configureDurableMessages']);
});

test('a same original callable completed across reload retains its durable HTTP200 body', async () => {
  const { actor, page, events, commands, start, respond, finish, completeNavigation } = await cdpCallableObservationActor();
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
  assert.ok(commands.some(({ method, parameters }) => method === 'Network.configureDurableMessages' &&
    Number.isSafeInteger(parameters.maxTotalBufferSize) && parameters.maxTotalBufferSize > 0));
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
  for (const body of ['', '{not-json']) {
    const { actor, start, respond, finish } = await cdpCallableObservationActor();
    const requestId = start(); respond(requestId, body); finish(requestId);
    await actor.drainObservedCalls();
    assert.equal(actor.observedCalls[0].status, 200);
    assert.equal(actor.observedCalls[0].requestFinishedAt !== null, true);
    assert.equal(actor.observedCalls[0].bodyCompletedAt, null);
    assert.equal(actor.callableObservationFailures.length, 1);
    assert.equal(actor.callableObservationFailures[0].category, 'response-observation-unavailable');
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
