import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as proof from './pc10-browser-session-proof.mjs';

const requestHash = value => createHash('sha256').update(`security-denial-request\0${value}`).digest('hex');

test('issued callable evidence survives a missing HTTP response without copying its request body', () => {
  assert.equal(typeof proof.createPc10CallableTrace, 'function');
  const trace = proof.createPc10CallableTrace({ name: 'sendFleetGroupMessage',
    transport: 'independent-browser-SDK', actorUid: 'private-actor', startedAt: 100,
    data: { sessionId: 'private-session', requestId: 'private-request', expectedGroupId: 'fleet-2',
      text: 'private-freeform-text', idToken: 'private-credential', hiddenBonus: 99 } });
  assert.equal(trace.name, 'sendFleetGroupMessage');
  assert.equal(trace.action, 'send-fleet-group-message');
  assert.equal(trace.requestHash, requestHash('private-request'));
  assert.equal(trace.issuedAt, 100);
  assert.equal(trace.headersReceivedAt, null);
  assert.equal(trace.bodyCompletedAt, null);
  assert.equal(trace.requestFinishedAt, null);
  assert.equal(trace.requestFailedAt, null);
  for (const value of ['private-actor', 'private-session', 'private-request', 'fleet-2',
    'private-freeform-text', 'private-credential', 'hiddenBonus']) {
    assert.equal(JSON.stringify(trace).includes(value), false);
  }
  assert.equal(proof.createPc10CallableTrace({ name: 'private-unapproved-endpoint',
    transport: 'independent-browser-SDK', startedAt: 100 }), null);
  const malformed = proof.createPc10CallableTrace({ name: 'claimSeat',
    transport: 'independent-browser-SDK', startedAt: 100,
    data: { sessionId: '../secret', requestId: '../secret', action: 'secret-unapproved-action' } });
  assert.equal(malformed.requestHash, null);
  assert.equal(malformed.sessionHash, null);
  assert.equal(malformed.action, 'claim-seat');
});

test('HTTP headers, network finish and actual JSON body completion have distinct measured timestamps', () => {
  assert.equal(typeof proof.observePc10CallableTrace, 'function');
  const trace = proof.createPc10CallableTrace({ name: 'publishPressDispatch',
    transport: 'independent-browser-SDK', startedAt: 100,
    data: { requestId: 'press-request', sessionId: 'own-session' } });
  proof.observePc10CallableTrace(trace, { stage: 'headers', at: 120, status: 200 });
  assert.equal(trace.headersReceivedAt, 120);
  assert.equal(trace.bodyCompletedAt, null);
  proof.observePc10CallableTrace(trace, { stage: 'finished', at: 125 });
  proof.observePc10CallableTrace(trace, { stage: 'body', at: 130,
    reply: { result: { revision: 4, dispatches: [{ text: 'private-dispatch' }] } } });
  assert.equal(trace.requestFinishedAt, 125);
  assert.equal(trace.bodyCompletedAt, 130);
  assert.equal(trace.completedAt, 130);
  assert.equal(trace.durationMs, 30);
  assert.equal(trace.revision, 4);
  assert.equal(JSON.stringify(trace).includes('private-dispatch'), false);
});

test('network failures retain correlation and each genuine retry gets a separate issued trace', () => {
  assert.equal(typeof proof.observePc10CallableTrace, 'function');
  const input = { name: 'claimSeat', transport: 'independent-browser-SDK',
    data: { requestId: 'one-stable-request', sessionId: 'own-session' } };
  const first = proof.createPc10CallableTrace({ ...input, startedAt: 100 });
  const retry = proof.createPc10CallableTrace({ ...input, startedAt: 200 });
  proof.observePc10CallableTrace(first, { stage: 'failed', at: 150,
    error: { message: 'private network error', url: 'private-url', headers: 'private-token' } });
  assert.equal(first.requestFailedAt, 150);
  assert.equal(first.bodyCompletedAt, null);
  assert.equal(first.failureCategory, 'network-request-failed');
  assert.equal(first.requestHash, retry.requestHash);
  assert.notEqual(first.issuedAt, retry.issuedAt);
  assert.equal(retry.requestFailedAt, null);
  assert.equal(JSON.stringify(first).includes('private network error'), false);
});

test('browser event hooks retain a real issued-only request and complete the same trace after body observation', async () => {
  // Keep the same assertions while adapting the fixture to the observer's
  // canonical CDP request IDs and Network lifecycle (one body store per ID).
  const page = new EventEmitter();
  page.setDefaultTimeout = () => undefined;
  page.setDefaultNavigationTimeout = () => undefined;
  const cdp = new EventEmitter();
  const bodies = new Map(), finished = new Set();
  cdp.send = async (method, parameters = {}) => {
    if (method === 'Network.configureDurableMessages' || method === 'Network.enable') return {};
    if (method === 'Network.getResponseBody') {
      if (!finished.has(parameters.requestId)) throw new Error('Response body is not complete yet.');
      return bodies.get(parameters.requestId);
    }
    throw new Error(`Unexpected CDP command: ${method}`);
  };
  cdp.detach = async () => undefined;
  const context = { newPage: async () => page, newCDPSession: async () => cdp, close: async () => {} };
  const browser = { newContext: async () => context };
  const client = await proof.createPc10BrowserActor(browser, 'http://localhost:5174', 'admiral');
  const request = { requestId: 'protocol-private-request', timestamp: 1, wallTime: 1,
    request: { url: 'http://127.0.0.1:5011/demo-proof/us-central1/sendFleetGroupMessage', method: 'POST',
      postData: JSON.stringify({ data: { sessionId: 'private-session', requestId: 'private-request',
        expectedGroupId: 'fleet-2', text: 'private-note', Authorization: 'private-token' } }) } };
  cdp.emit('Network.requestWillBeSent', request);
  assert.equal(client.observedCalls.length, 1);
  assert.equal(client.observedCalls[0].bodyCompletedAt, null);
  assert.equal(client.observedCalls[0].requestHash, requestHash('private-request'));
  let release;
  // This mock is a CDP Network.getResponseBody result. Use its exact
  // `base64Encoded` field rather than the previous unsupported mock field.
  const body = new Promise(resolve => { release = resolve; }).then(reply => ({
    body: JSON.stringify(reply), base64Encoded: false,
  }));
  void body.catch(() => undefined);
  bodies.set(request.requestId, body);
  cdp.emit('Network.responseReceived', { requestId: request.requestId, timestamp: 2,
    response: { url: request.request.url, status: 200 } });
  const trace = client.observedCalls[0];
  assert.ok(trace.headersReceivedAt >= trace.issuedAt);
  assert.equal(trace.bodyCompletedAt, null);
  finished.add(request.requestId);
  cdp.emit('Network.loadingFinished', { requestId: request.requestId, timestamp: 3, encodedDataLength: 1 });
  release({ result: { status: 'committed', groupId: 'fleet-2', messageId: 'private-request', text: 'private-note' } });
  await client.drainObservedCalls();
  assert.equal(client.observedCalls.length, 1);
  assert.equal(client.observedCalls[0], trace);
  assert.ok(trace.bodyCompletedAt >= trace.requestFinishedAt);
  assert.equal(trace.status, 200);
  const failed = { ...request, requestId: 'protocol-other-request', request: { ...request.request,
    postData: JSON.stringify({ data: { sessionId: 'private-session', requestId: 'other-private-request' } }) } };
  cdp.emit('Network.requestWillBeSent', failed);
  cdp.emit('Network.loadingFailed', { requestId: failed.requestId, timestamp: 4, errorText: 'net::ERR_ABORTED', canceled: true });
  assert.equal(client.observedCalls.length, 2);
  assert.ok(client.observedCalls[1].requestFailedAt >= client.observedCalls[1].issuedAt);
  assert.equal(client.observedCalls[1].bodyCompletedAt, null);
  for (const value of ['private-session', 'private-request', 'private-note', 'private-token', 'fleet-2']) {
    assert.equal(JSON.stringify(client.observedCalls).includes(value), false);
  }
});

test('message cohort is explicitly disclosed while retaining the existing default overlap', () => {
  assert.equal(typeof proof.pc10MessageCohortSize, 'function');
  assert.equal(proof.pc10MessageCohortSize(), 7);
  assert.equal(proof.pc10MessageCohortSize('7'), 7);
  assert.equal(proof.pc10MessageCohortSize(3), 3);
  assert.equal(proof.pc10MessageCohortSize('2'), 2);
  for (const value of [1, 0, 21, '1', '', '3-extra', 2.5, null]) {
    assert.throws(() => proof.pc10MessageCohortSize(value), /cohort/i);
  }
});

function snapshotFixture({ receiptActor = 'private-actor', storedReply, rootExists = true } = {}) {
  const uid = 'private-actor', sessionId = 'private-session', requestId = 'private-request';
  const data = { sessionId, requestId, expectedGroupId: 'fleet-2', text: 'private-note' };
  const result = { status: 'committed', groupId: 'fleet-2', messageId: requestId };
  const fingerprint = { action: 'send-fleet-group-message', sessionId, requestId,
    actorUid: receiptActor, instanceId: null, expectedRevision: null,
    payload: { groupId: 'fleet-2', text: 'private-note' } };
  const rows = new Map([
    [`sessions/${sessionId}`, rootExists ? { phase: 'active', currentTurn: 1,
      hiddenChart: 'private-chart', pressDispatch: { revision: 1, dispatches: [{ text: 'private-dispatch' }] } } : undefined],
    [`sessions/${sessionId}/players/${uid}`, { connected: true, kicked: false, role: 'player',
      assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', fleetGroupId: 'fleet-2',
      connectionGeneration: 2, privateHands: ['private-hand'] }],
    [`sessions/${sessionId}/players/private-gm`, { connected: true, role: 'gm' }],
    [`activeMemberships/${uid}`, { sessionId }],
    ['activeMemberships/private-gm', { sessionId: 'foreign-session-do-not-export' }],
    [`sessions/${sessionId}/seats/admiral`, { status: 'claimed', holderUid: uid }],
    [`sessions/${sessionId}/commandReceipts/${requestId}`, { fingerprint, result: storedReply ?? result,
      privateAudit: 'private-audit' }],
    [`sessions/${sessionId}/fleetGroupMessages/fleet-2`, { groupId: 'fleet-2', messages: [
      { id: requestId, actorUid: uid, text: 'private-note', sentAt: 'private-timestamp' },
      { id: 'another-private-request', actorUid: 'another-private-actor', text: 'foreign-note' },
    ] }],
  ]);
  const reads = [];
  let transactionOptions;
  const db = {
    doc(path) { return { path }; },
    async runTransaction(callback, options) {
      transactionOptions = options;
      const tx = {
        async get(ref) {
          reads.push(ref.path);
          const row = rows.get(ref.path);
          return { exists: row !== undefined, get: key => row?.[key], data: () => row };
        },
        set() { throw new Error('Diagnostic must never write.'); },
        update() { throw new Error('Diagnostic must never write.'); },
        delete() { throw new Error('Diagnostic must never write.'); },
      };
      return callback(tx);
    },
  };
  let now = 100;
  return { db, reads, rows, options: () => transactionOptions,
    input: { db, project: 'demo-pc10-proof', emulatorHost: '127.0.0.1:8097', sessionId,
      gm: { localId: 'private-gm', idToken: 'private-gm-token' },
      players: [{ localId: uid, idToken: 'private-player-token' }], roles: ['admiral'],
      requests: [{ name: 'sendFleetGroupMessage', actorUid: uid, data, reply: { status: 200, result } }],
      now: () => now++ } };
}

test('pre-cleanup authoritative snapshot reads only known own documents and exports aggregate/bound booleans', async () => {
  assert.equal(typeof proof.capturePc10AuthoritativeFailureSnapshot, 'function');
  const fixture = snapshotFixture();
  const evidence = await proof.capturePc10AuthoritativeFailureSnapshot(fixture.input);
  assert.deepEqual(fixture.options(), { readOnly: true });
  assert.equal(evidence.sessionExists, true);
  assert.equal(evidence.phase, 'active');
  assert.equal(evidence.cycle, 1);
  assert.equal(evidence.actorCount, 2);
  assert.equal(evidence.connectedActorCount, 2);
  assert.equal(evidence.sameSessionMembershipCount, 1);
  assert.equal(evidence.ownSeatHolderCount, 1);
  assert.equal(evidence.receipts[0].requestHash, requestHash('private-request'));
  assert.equal(evidence.receipts[0].exists, true);
  assert.equal(evidence.receipts[0].fingerprintMatches, true);
  assert.equal(evidence.receipts[0].observedSuccessfulReplyMatches, true);
  assert.equal(evidence.groupHistories[0].messageCount, 2);
  assert.equal(evidence.groupHistories[0].knownRequestedMessageCount, 1);
  assert.ok(evidence.completedAt > evidence.startedAt);
  assert.equal(fixture.reads.some(path => path.includes('foreign-session')), false);
  assert.equal(fixture.reads.some(path => path.includes('secrets') || path.includes('serverState')), false);
  assert.equal(fixture.reads.filter(path => path.endsWith('/commandReceipts/private-request')).length, 1);
  for (const value of ['private-actor', 'private-session', 'private-request', 'fleet-2', 'private-note',
    'private-chart', 'private-hand', 'private-audit', 'private-dispatch', 'private-player-token',
    'private-gm-token', 'foreign-session-do-not-export', 'another-private-actor', 'foreign-note']) {
    assert.equal(JSON.stringify(evidence).includes(value), false, value);
  }
});

test('failure snapshot distinguishes a timeout with a real receipt from a foreign fingerprint or absent receipt', async () => {
  assert.equal(typeof proof.capturePc10AuthoritativeFailureSnapshot, 'function');
  const pending = snapshotFixture();
  pending.input.requests[0].reply = { status: 'denied', error: { code: 'functions/deadline-exceeded' } };
  const committed = await proof.capturePc10AuthoritativeFailureSnapshot(pending.input);
  assert.equal(committed.receipts[0].exists, true);
  assert.equal(committed.receipts[0].fingerprintMatches, true);
  assert.equal(committed.receipts[0].observedSuccessfulReplyMatches, null);
  const foreign = snapshotFixture({ receiptActor: 'foreign-private-actor' });
  assert.equal((await proof.capturePc10AuthoritativeFailureSnapshot(foreign.input)).receipts[0].fingerprintMatches, false);
  const absent = snapshotFixture();
  absent.rows.delete('sessions/private-session/commandReceipts/private-request');
  assert.equal((await proof.capturePc10AuthoritativeFailureSnapshot(absent.input)).receipts[0].exists, false);
  const noRoot = snapshotFixture({ rootExists: false });
  assert.equal((await proof.capturePc10AuthoritativeFailureSnapshot(noRoot.input)).sessionExists, false);
});

test('snapshot scope rejects production hosts, foreign session witnesses and foreign actors before any read', async () => {
  assert.equal(typeof proof.capturePc10AuthoritativeFailureSnapshot, 'function');
  for (const override of [{ project: 'production-game' }, { emulatorHost: 'remote.example:8097' },
    { sessionId: '../foreign' }, { requests: [{ name: 'sendFleetGroupMessage', actorUid: 'foreign-actor',
      data: { sessionId: 'private-session', requestId: 'known-request' } }] },
    { requests: [{ name: 'sendFleetGroupMessage', actorUid: 'private-actor',
      data: { sessionId: 'foreign-session', requestId: 'known-request' } }] }]) {
    const fixture = snapshotFixture();
    await assert.rejects(() => proof.capturePc10AuthoritativeFailureSnapshot({ ...fixture.input, ...override }));
    assert.deepEqual(fixture.reads, []);
  }
});

test('failed diagnostics cannot replace the actual proof error and failure evidence precedes cleanup', async () => {
  assert.equal(typeof proof.observePc10FailureBeforeCleanup, 'function');
  const events = [];
  const failure = new Error('actual SDK deadline');
  const original = await proof.observePc10FailureBeforeCleanup(failure, {
    snapshot: async () => { events.push('snapshot'); throw new Error('private diagnostic failure'); },
    identity: async () => { events.push('identity'); },
    rate: async () => { events.push('rate'); },
    writeEvidence: async details => {
      events.push('evidence');
      assert.deepEqual(details.diagnosticFailures, ['authoritative-snapshot-unavailable']);
      assert.equal(JSON.stringify(details).includes('private diagnostic failure'), false);
    },
  });
  events.push('cleanup');
  assert.equal(original, failure);
  assert.deepEqual(events, ['snapshot', 'identity', 'rate', 'evidence', 'cleanup']);
});
