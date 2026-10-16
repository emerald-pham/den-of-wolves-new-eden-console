import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createPc10OriginObservationLedger, createPc10OriginBrowserCapture } from './pc10-origin-callable-observer.mjs';
import { createPc10CallableObservationBoundary } from './pc10-browser-session-proof.mjs';

const projectId = 'demo-origin-document-native';
const functionsOrigin = 'http://127.0.0.1:5031';
const uid = 'native-private-actor', sessionId = 'native-private-session';
const docA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', docB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const calls = [], failures = [], timers = new Map(); let clock = 1000, timerId = 0;
  const ledger = createPc10OriginObservationLedger({ label: 'admiral', projectId, functionsOrigin,
    observedCalls: calls, failures, boundaryFactory: createPc10CallableObservationBoundary,
    requireDocumentWitness: true, now: () => clock,
    timeoutPort: { setTimeout: (callback, duration) => { timers.set(++timerId, { callback, duration }); return timerId; },
      clearTimeout: id => timers.delete(id) } });
  const packet = (id, stage, extra = {}) => ledger.receive({ schemaVersion: 1, originId: id,
    name: 'getCurrentMemberSession', stage, at: clock, ...extra });
  const issue = (doc, number = 1) => { const id = `${doc}:${number}`; packet(id, 'issued'); return id; };
  const metadata = id => packet(id, 'metadata', { actorHash: digest('actor', uid), sessionHash: digest('session', sessionId),
    requestHash: null, groupHash: null, projectHash: digest('project', projectId), failureStage: null });
  const body = id => {
    packet(id, 'headers', { status: 200 });
    const bytes = Buffer.from(JSON.stringify({ result: { actorUid: uid, sessionId, revision: 1 } }));
    return packet(id, 'body', { byteLength: bytes.length, bodyHash: createHash('sha256').update(bytes).digest('hex'),
      resultActorHash: digest('actor', uid), resultSessionHash: digest('session', sessionId), resultRequestHash: null,
      resultGroupHash: null, outcome: 'result', resultStatus: null, revision: 1, connectionGeneration: 1, denialCode: null });
  };
  const witness = (doc, contextId, scriptId, frameId = 'main-frame') => {
    for (const method of ['nativeContext', 'nativeScript', 'announceDocument', 'nativeDocument']) {
      assert.equal(typeof ledger[method], 'function', `${method} is required`);
    }
    ledger.nativeContext({ context: { id: contextId, uniqueId: `native-context-${contextId}`, auxData: { isDefault: true, type: 'default', frameId } } });
    ledger.nativeScript({ scriptId, executionContextId: contextId, url: 'private-script-url', hash: 'private-source' });
    ledger.announceDocument(doc);
    ledger.nativeDocument({ name: '__pc10OriginDocumentWitness', executionContextId: contextId,
      payload: JSON.stringify({ schemaVersion: 1, documentId: doc }) });
  };
  const request = (protocolId, scriptId, loaderId = 'loader-a', frameId = 'main-frame') => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const bearer = `${encode({ alg: 'none' })}.${encode({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`,
      sub: uid, user_id: uid, iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    ledger.network('request', { requestId: protocolId, loaderId, frameId,
      initiator: { type: 'script', stack: { callFrames: [{ functionName: 'pc10OriginFetch', scriptId, url: 'private-script-url' }] } },
      request: { url: `${functionsOrigin}/${projectId}/us-central1/getCurrentMemberSession`, method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: 'private-unused',
        postData: JSON.stringify({ data: { sessionId } }) } });
  };
  const finish = protocolId => {
    ledger.network('headers', { requestId: protocolId, response: { status: 200 } });
    ledger.network('finished', { requestId: protocolId });
  };
  const expire = async promise => {
    await nextTurn(); assert.equal(timers.size, 1); assert.equal([...timers.values()][0].duration, 10_000);
    [...timers.values()][0].callback(); await assert.rejects(promise, /Origin callable/);
  };
  return { ledger, calls, failures, timers, packet, issue, metadata, body, witness, request, finish, expire,
    tick: amount => { clock += amount; }, now: () => clock };
}

test('actual context/script/native loader witnesses bind the same real document with hashed receipt evidence', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a');
  const id = f.issue(docA); f.tick(2); f.metadata(id); f.request('wire-a', 'script-a'); f.tick(2); f.finish('wire-a'); f.body(id);
  await f.ledger.drain();
  assert.ok(f.calls[0].protocolRequestHash);
  assert.match(f.calls[0].originDocumentHash, /^[a-f0-9]{64}$/);
  assert.match(f.calls[0].nativeDocumentHash, /^[a-f0-9]{64}$/);
  assert.equal(f.calls[0].originDocumentHash, f.calls[0].nativeDocumentHash);
  assert.equal(f.calls[0].originIssuedObservedAt, 1000);
  assert.equal(f.calls[0].originMetadataObservedAt, 1002);
  assert.equal(f.calls[0].nativeHeadersStatus, 200);
  assert.deepEqual(f.failures, []);
  assert.equal(JSON.stringify([f.calls, f.failures]).includes('private-'), false);
});

test('an earlier unknown origin cannot poison a witnessed replacement document but remains an actual census failure', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); f.issue(docA); f.request('wire-old', 'script-a'); f.finish('wire-old');
  f.witness(docB, 2, 'script-b'); const fresh = f.issue(docB); f.metadata(fresh); f.request('wire-new', 'script-b', 'loader-b'); f.finish('wire-new'); f.body(fresh);
  assert.ok(f.calls[1].protocolRequestHash, 'Replacement document may pair despite the earlier undelivered metadata.');
  assert.equal(f.calls[1].protocolRequestHash, createHash('sha256').update('pc10-cdp-request\0wire-new').digest('hex'));
  await f.expire(f.ledger.drain());
  assert.ok(f.failures.some(value => value.category === 'origin-request-unaccounted'));
  assert.equal(f.calls[0].bodyCompletedAt, null);
});

test('identical old and new wire keys never cross document witnesses even when old metadata arrives last', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); const old = f.issue(docA); f.request('wire-old', 'script-a');
  f.witness(docB, 2, 'script-b'); const fresh = f.issue(docB); f.metadata(fresh); f.request('wire-new', 'script-b', 'loader-b');
  f.finish('wire-new'); f.body(fresh); f.metadata(old); f.finish('wire-old'); f.body(old); await f.ledger.drain();
  assert.deepEqual(f.calls.map(x => x.protocolRequestHash), ['wire-old', 'wire-new'].map(value =>
    createHash('sha256').update(`pc10-cdp-request\0${value}`).digest('hex')));
  assert.notEqual(f.calls[0].nativeDocumentHash, f.calls[1].nativeDocumentHash);
  assert.deepEqual(f.failures, []);
});

test('same-document earlier unknown metadata still preserves dispatch order for identical wire requests', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); const one = f.issue(docA), two = f.issue(docA, 2);
  f.request('wire-one', 'script-a'); f.request('wire-two', 'script-a'); f.metadata(two);
  assert.equal(f.calls[1].protocolRequestHash, undefined);
  f.metadata(one); f.finish('wire-one'); f.finish('wire-two'); f.body(one); f.body(two); await f.ledger.drain();
  assert.deepEqual(f.calls.map(x => x.protocolRequestHash), ['wire-one', 'wire-two'].map(value =>
    createHash('sha256').update(`pc10-cdp-request\0${value}`).digest('hex')));
  assert.deepEqual(f.failures, []);
});

test('missing native document witness is not replaced by time, current-frame guesses or a matching body', async () => {
  const f = fixture(); const id = f.issue(docA); f.metadata(id); f.request('wire-a', 'unknown-script'); f.finish('wire-a'); f.body(id);
  await f.expire(f.ledger.drain());
  assert.equal(f.calls[0].protocolRequestHash, undefined);
  assert.ok(f.failures.some(x => x.category === 'origin-native-document-unavailable'));
});

test('native context unique identity, main-frame agreement and loader consistency fail closed', async () => {
  for (const kind of ['wrong-frame', 'loader-transfer', 'conflicting-script']) {
    const f = fixture(); f.witness(docA, 1, 'script-a'); const id = f.issue(docA); f.metadata(id);
    if (kind === 'conflicting-script') { f.witness(docB, 2, 'script-b'); f.ledger.nativeScript({ scriptId: 'script-a', executionContextId: 2 }); }
    f.request('wire-a', 'script-a', 'loader-a', kind === 'wrong-frame' ? 'foreign-frame' : 'main-frame');
    if (kind === 'loader-transfer') f.request('wire-second', 'script-a', 'foreign-loader');
    assert.ok(f.failures.some(x => x.category === 'origin-document-witness-conflict'), kind);
  }
});

test('actual native context binding cannot attach an unannounced or malformed document UUID', () => {
  const f = fixture(); assert.equal(typeof f.ledger.nativeContext, 'function');
  f.ledger.nativeContext({ context: { id: 1, uniqueId: 'actual-unique-context', auxData: { isDefault: true, frameId: 'main-frame' } } });
  f.ledger.nativeDocument({ name: '__pc10OriginDocumentWitness', executionContextId: 1, payload: JSON.stringify({ documentId: docA, schemaVersion: 1 }) });
  f.ledger.nativeDocument({ name: '__pc10OriginDocumentWitness', executionContextId: 1, payload: '{private raw malicious error' });
  assert.ok(f.failures.some(x => x.category === 'origin-document-witness-conflict'));
  assert.equal(JSON.stringify(f.failures).includes('private raw'), false);
});

test('finite pre-navigation barrier waits for an already-issued origin before its metadata or headers arrive', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); const id = f.issue(docA);
  assert.equal(typeof f.ledger.drainBeforeNavigation, 'function'); let done = false;
  const barrier = f.ledger.drainBeforeNavigation().then(() => { done = true; }); await nextTurn();
  assert.equal(done, false); f.metadata(id); f.request('wire-a', 'script-a'); await nextTurn(); assert.equal(done, false);
  f.finish('wire-a'); await nextTurn(); assert.equal(done, false, 'Native terminal alone cannot stand in for actual origin bytes.');
  f.body(id); await barrier; assert.equal(done, true); assert.deepEqual(f.failures, []);
});

test('finite pre-navigation barrier waits for already-native transport whose origin notification is still queued', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); f.request('wire-a', 'script-a');
  assert.equal(typeof f.ledger.drainBeforeNavigation, 'function'); let done = false;
  const barrier = f.ledger.drainBeforeNavigation().then(() => { done = true; }); await nextTurn(); assert.equal(done, false);
  const id = f.issue(docA); f.metadata(id); f.finish('wire-a'); f.body(id); await barrier;
  assert.equal(done, true); assert.deepEqual(f.failures, []);
});

test('finite snapshot never chases later normal polling and records its Node post-snapshot timing honestly', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); const first = f.issue(docA); f.metadata(first); f.request('wire-first', 'script-a');
  assert.equal(typeof f.ledger.drainBeforeNavigation, 'function'); const barrier = f.ledger.drainBeforeNavigation();
  await nextTurn(); f.tick(5); const future = f.issue(docA, 2); f.metadata(future); f.request('wire-future', 'script-a');
  f.finish('wire-first'); f.body(first); await barrier;
  assert.equal(f.calls[1].bodyCompletedAt, null);
  assert.equal(f.calls[1].originIssuedAfterNavigationSnapshot, true);
  assert.equal(f.calls[1].originIssuedObservedAt, 1005);
  assert.match(f.calls[1].originNavigationSnapshotHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(f.failures, []);
});

test('missing pre-navigation metadata, complete200 body or actual native terminal all remain strict at10s', async () => {
  for (const absent of ['metadata', 'body', 'terminal']) {
    const f = fixture(); f.witness(docA, 1, 'script-a'); const id = f.issue(docA); f.request('wire-a', 'script-a');
    if (absent !== 'metadata') f.metadata(id);
    if (absent !== 'body' && absent !== 'metadata') f.body(id);
    if (absent !== 'terminal') f.finish('wire-a');
    assert.equal(typeof f.ledger.drainBeforeNavigation, 'function'); await f.expire(f.ledger.drainBeforeNavigation());
    assert.ok(f.failures.length > 0, absent); assert.equal(f.calls[0].observationDisposition, undefined);
  }
});

test('a separately observed body failure rejects the pre-navigation barrier without cancelling original traffic', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); const id = f.issue(docA); f.metadata(id); f.request('wire-a', 'script-a'); f.finish('wire-a');
  f.packet(id, 'failure', { failureStage: 'origin-body-read-failed' });
  assert.equal(typeof f.ledger.drainBeforeNavigation, 'function');
  await assert.rejects(f.ledger.drainBeforeNavigation(), /Origin callable/);
  assert.ok(f.failures.some(x => x.category === 'response-observation-unavailable'));
});

test('normal reload operation runs exactly once after its finite barrier and retains later-request failure evidence', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); const first = f.issue(docA); f.metadata(first); f.request('wire-first', 'script-a');
  let operations = 0;
  const reload = f.ledger.transition('reload', async () => { operations++; f.tick(1); f.issue(docA, 2); });
  await nextTurn(); assert.equal(operations, 0); f.finish('wire-first'); f.body(first); await reload;
  assert.equal(operations, 1); assert.equal(f.calls[1].originIssuedAfterNavigationSnapshot, true);
  assert.equal(f.calls[1].bodyCompletedAt, null); assert.equal(f.calls[1].observationDisposition, undefined);
});

test('failed finite barrier cannot execute normal navigation or erase its original strict evidence', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); f.issue(docA); let operations = 0;
  const reload = f.ledger.transition('reload', async () => { operations++; }); await f.expire(reload);
  assert.equal(operations, 0); assert.ok(f.failures.length > 0);
  assert.ok(f.ledger.boundaries.some(x => x.kind === 'issued-origin-pre-navigation-drain' && x.outcome === 'failed'));
});

test('browser witness bootstrap uses supported actual contexts before pairing, without request interception or debug pauses', async () => {
  const events = new EventEmitter(), operations = []; let nodeBinding, content;
  events.send = async (name, params) => { operations.push({ name, params }); return {}; }; events.detach = async () => undefined;
  const frame = { evaluate: async (operation, value) => { assert.equal(typeof operation, 'function'); return value.documentId === docA; } };
  const page = { mainFrame: () => frame };
  const capture = await createPc10OriginBrowserCapture({ context: { exposeBinding: async (_name, fn) => { nodeBinding = fn; },
    addInitScript: async value => { content = value.content; }, newCDPSession: async () => events },
  page, label: 'admiral', projectId, functionsOrigin, observedCalls: [], failures: [], boundaryFactory: createPc10CallableObservationBoundary });
  assert.deepEqual(await nodeBinding({ page, frame }, { schemaVersion: 1, stage: 'document', documentId: docA }), { ok: true });
  assert.deepEqual(operations.map(x => x.name), ['Network.enable', 'Runtime.enable', 'Debugger.enable', 'Runtime.addBinding']);
  assert.match(content, /documentWitness/);
  assert.equal(operations.some(x => /Fetch\.|setBreakpoint|\.pause|\.resume|setExtraHTTPHeaders|replay/.test(x.name)), false);
  await capture.close();
});

test('an already-settled completed transport with rejected body is still incomplete at the finite barrier', async () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); const id = f.issue(docA); f.metadata(id); f.request('wire-a', 'script-a'); f.finish('wire-a');
  f.packet(id, 'failure', { failureStage: 'origin-body-read-failed' }); await nextTurn();
  await assert.rejects(f.ledger.drainBeforeNavigation(), /Origin callable/);
  assert.ok(f.failures.some(x => x.category === 'response-observation-unavailable'));
  assert.equal(f.calls[0].bodyCompletedAt, null);
});

test('a contradictory native script/context witness cannot become eligible through later script backfill', () => {
  const f = fixture(); f.witness(docA, 1, 'script-a'); f.witness(docB, 2, 'script-b');
  f.ledger.nativeScript({ scriptId: 'script-a', executionContextId: 2 });
  f.ledger.nativeScript({ scriptId: 'script-a', executionContextId: 1 });
  const id = f.issue(docA); f.metadata(id); f.request('wire-a', 'script-a');
  assert.equal(f.calls[0].protocolRequestHash, undefined);
  assert.ok(f.failures.some(x => x.category === 'origin-document-witness-conflict'));
});

test('malicious document-notification getters cannot escape through the supported binding as private errors', async () => {
  const events = new EventEmitter(); let nodeBinding;
  events.send = async () => ({}); events.detach = async () => undefined;
  const frame = {}, page = { mainFrame: () => frame }, failures = [];
  const capture = await createPc10OriginBrowserCapture({ context: { exposeBinding: async (_name, fn) => { nodeBinding = fn; },
    addInitScript: async () => undefined, newCDPSession: async () => events },
  page, label: 'admiral', projectId, functionsOrigin, observedCalls: [], failures, boundaryFactory: createPc10CallableObservationBoundary });
  const malicious = { get stage() { throw new Error('private-token-private-url-private-arbitrary-error'); } };
  assert.deepEqual(await nodeBinding({ page, frame }, malicious), { ok: false });
  assert.ok(failures.some(x => x.category === 'origin-binding-schema'));
  assert.equal(JSON.stringify(failures).includes('private-token'), false);
  await capture.close();
});

test('reuse of a numeric native context identity cannot assign an unknown old script to a replacement document', () => {
  const f = fixture(); f.witness(docA, 1, 'script-a');
  f.ledger.nativeContextDestroyed({ executionContextId: 1 });
  f.ledger.nativeContext({ context: { id: 1, uniqueId: 'replacement-context-unique-id',
    auxData: { isDefault: true, frameId: 'main-frame' } } });
  f.ledger.announceDocument(docB);
  f.ledger.nativeDocument({ name: '__pc10OriginDocumentWitness', executionContextId: 1,
    payload: JSON.stringify({ schemaVersion: 1, documentId: docB }) });
  f.ledger.nativeScript({ scriptId: 'previously-unknown-old-script', executionContextId: 1 });
  const fresh = f.issue(docB); f.metadata(fresh); f.request('old-wire-late', 'previously-unknown-old-script', 'loader-old');
  assert.equal(f.calls[0].protocolRequestHash, undefined, 'A reused numeric ID cannot prove the old script belongs to this new unique context.');
  assert.ok(f.failures.some(x => x.category === 'origin-document-witness-conflict'));
});

test('malformed document witness schema is recorded as failure without invoking the native witness', async () => {
  const events = new EventEmitter(), operations = []; let nodeBinding;
  events.send = async name => { operations.push(name); return {}; }; events.detach = async () => undefined;
  const frame = {}, page = { mainFrame: () => frame }, failures = [];
  const capture = await createPc10OriginBrowserCapture({ context: { exposeBinding: async (_name, fn) => { nodeBinding = fn; },
    addInitScript: async () => undefined, newCDPSession: async () => events },
  page, label: 'admiral', projectId, functionsOrigin, observedCalls: [], failures, boundaryFactory: createPc10CallableObservationBoundary });
  assert.deepEqual(await nodeBinding({ page, frame }, { schemaVersion: 1, stage: 'document', documentId: docA,
    raw: 'private-url-private-uid-private-token' }), { ok: false });
  assert.ok(failures.some(x => x.category === 'origin-binding-schema'));
  assert.deepEqual(operations, ['Network.enable']);
  assert.equal(JSON.stringify(failures).includes('private-url'), false);
  await capture.close();
});

test('an actual incomplete offline cancellation remains classified without waiving a separately observed body fault', async () => {
  for (const separateFault of [false, true]) {
    const f = fixture(); f.witness(docA, 1, 'script-a'); const id = f.issue(docA); f.metadata(id); f.request('wire-a', 'script-a');
    await f.ledger.transition('offline', async () => {
      f.tick(1); f.ledger.network('failed', { requestId: 'wire-a', errorText: 'net::ERR_INTERNET_DISCONNECTED', canceled: false });
      f.packet(id, 'failure', { failureStage: separateFault ? 'origin-body-read-failed' : 'origin-fetch-failed' });
      await nextTurn();
    });
    assert.equal(f.calls[0].observationDisposition, 'cancelled-during-planned-offline');
    assert.equal(f.calls[0].bodyCompletedAt, null);
    if (separateFault) {
      await assert.rejects(f.ledger.drainBeforeNavigation(), /Origin callable/);
      assert.ok(f.failures.some(x => x.category === 'response-observation-unavailable'));
    } else {
      await f.ledger.drainBeforeNavigation();
      assert.deepEqual(f.failures, []);
    }
  }
});
