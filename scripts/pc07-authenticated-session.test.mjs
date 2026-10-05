import assert from 'node:assert/strict';
import test from 'node:test';
import { joinConfiguredBrowserPlayers, shouldMaintainFixturePresence } from './pc07-authenticated-session.mjs';
import * as fixture from './pc07-authenticated-session.mjs';
import { createServer } from 'node:http';

async function localCallableServer(t, respond) {
  const server = createServer(respond);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('authenticated fixture calls bound an actual nonresponding local server without retry or identity disclosure', async t => {
  const requests = [];
  const origin = await localCallableServer(t, request => { requests.push(request.url); });
  assert.equal(typeof fixture.performFixtureCallable, 'function');
  await assert.rejects(() => fixture.performFixtureCallable({ origin, project: 'demo-test',
    actor: { localId: 'not-in-diagnostics', idToken: 'not-in-diagnostics' },
    name: 'resumeSession', data: { sessionId: 'private-not-in-diagnostics' }, timeoutMs: 100 }), error =>
    error.message === 'Local fixture callable resumeSession exceeded 100ms without a reply.');
  assert.deepEqual(requests, ['/demo-test/us-central1/resumeSession']);
});

test('bounded fixture transport returns the actual callable JSON and HTTP status', async t => {
  const origin = await localCallableServer(t, (_request, response) => {
    response.writeHead(409, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { status: 'ABORTED' } }));
  });
  assert.equal(typeof fixture.performFixtureCallable, 'function');
  assert.deepEqual(await fixture.performFixtureCallable({ origin, project: 'demo-test',
    actor: { idToken: 'local-test-only' }, name: 'claimSeat', data: {}, timeoutMs: 1_000 }),
  { status: 409, error: { status: 'ABORTED' } });
});

test('native proof records issued and actual body-completion times rather than treating headers as completion', async t => {
  const origin = await localCallableServer(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
    setTimeout(() => response.end(JSON.stringify({ result: { status: 'committed', privateNote: 'never-copy' } })), 75);
  });
  const issued = [], completed = [];
  const reply = await fixture.performFixtureCallable({ origin, project: 'demo-test',
    actor: { localId: 'private-actor', idToken: 'private-token' }, name: 'sendFleetGroupMessage',
    data: { sessionId: 'private-session', requestId: 'private-request', text: 'private-text' },
    timeoutMs: 1_000, onCallableIssued: value => issued.push(value),
    onCallableObservation: value => completed.push(value) });
  assert.equal(reply.status, 200);
  assert.equal(issued.length, 1);
  assert.equal(completed.length, 1);
  assert.equal(issued[0].bodyCompletedAt, null);
  assert.ok(completed[0].bodyCompletedAt - completed[0].headersReceivedAt >= 50);
  assert.equal(completed[0].completedAt, completed[0].bodyCompletedAt);
  assert.equal(completed[0].requestHash, issued[0].requestHash);
  assert.equal(completed[0].action, 'send-fleet-group-message');
  for (const secret of ['private-actor', 'private-token', 'private-text', 'private-request', 'never-copy']) {
    assert.equal(JSON.stringify([...issued, ...completed]).includes(secret), false);
  }
});

test('native no-response failure still reports its issued request and terminal failure once without retry', async t => {
  const requests = [], issued = [], completed = [];
  const origin = await localCallableServer(t, request => requests.push(request.url));
  await assert.rejects(() => fixture.performFixtureCallable({ origin, project: 'demo-test',
    actor: { localId: 'private-actor', idToken: 'private-token' }, name: 'claimSeat',
    data: { sessionId: 'private-session', requestId: 'private-request' }, timeoutMs: 100,
    onCallableIssued: value => issued.push(value), onCallableObservation: value => completed.push(value) }),
  error => error.message === 'Local fixture callable claimSeat exceeded 100ms without a reply.');
  assert.equal(requests.length, 1);
  assert.equal(issued.length, 1);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].bodyCompletedAt, null);
  assert.ok(completed[0].requestFailedAt >= issued[0].issuedAt);
  assert.equal(completed[0].requestHash, issued[0].requestHash);
});

test('an unavailable terminal observer cannot replace the real native timeout', async t => {
  const origin = await localCallableServer(t, () => {});
  await assert.rejects(() => fixture.performFixtureCallable({ origin, project: 'demo-test',
    actor: { localId: 'private-actor', idToken: 'private-token' }, name: 'resumeSession',
    data: { sessionId: 'private-session' }, timeoutMs: 100,
    onCallableObservation: () => { throw new Error('private observer error'); } }), error =>
    error.message === 'Local fixture callable resumeSession exceeded 100ms without a reply.' &&
    error.pc07CallableObservationUnavailable === true);
});

test('malformed JSON after real HTTP headers is a body-observation failure rather than an invented network failure', async t => {
  const origin = await localCallableServer(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('unparseable-body');
  });
  const completed = [];
  await assert.rejects(() => fixture.performFixtureCallable({ origin, project: 'demo-test',
    actor: { localId: 'private-actor', idToken: 'private-token' }, name: 'resumeSession',
    data: { sessionId: 'private-session' }, timeoutMs: 1000,
    onCallableObservation: value => completed.push(value) }), SyntaxError);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].failureCategory, 'response-observation-unavailable');
  assert.equal(completed[0].requestFailedAt, null);
  assert.ok(completed[0].bodyObservationFailedAt >= completed[0].headersReceivedAt);
});

test('callable observations retain only hashed identity and bounded authority metadata', () => {
  assert.equal(typeof fixture.buildFixtureCallableObservation, 'function');
  const observation = fixture.buildFixtureCallableObservation({ name: 'resumeSession',
    transport: 'authenticated-emulator-HTTP', actorUid: 'private-actor', sessionId: 'private-session',
    startedAt: 10, completedAt: 25, status: 200, reply: { result: {
      player: { uid: 'private-actor', fleetGroupId: 'fleet-2', connectionGeneration: 7,
        assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', idToken: 'credential-do-not-copy' },
      session: { id: 'private-session', loyalty: 'hidden-loyalty', chartCoordinates: 'hidden-chart' },
      freeformNote: 'private-freeform-note', dice: [1, 2, 3],
    } } });
  assert.match(observation.actorHash, /^[a-f0-9]{64}$/);
  assert.match(observation.sessionHash, /^[a-f0-9]{64}$/);
  assert.match(observation.groupHash, /^[a-f0-9]{64}$/);
  assert.equal(observation.connectionGeneration, 7);
  assert.equal(observation.durationMs, 15);
  const serialized = JSON.stringify(observation);
  for (const privateValue of ['private-actor', 'private-session', 'fleet-2', 'credential-do-not-copy',
    'hidden-loyalty', 'hidden-chart', 'private-freeform-note', 'dice', 'admiral']) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test('denial observations omit freeform errors and unvalidated authority values', () => {
  assert.equal(typeof fixture.buildFixtureCallableObservation, 'function');
  const observation = fixture.buildFixtureCallableObservation({ name: 'getCurrentMemberSession',
    transport: 'independent-browser-SDK', startedAt: 10, completedAt: 20, status: 429,
    reply: { error: { status: 'RESOURCE_EXHAUSTED', message: 'sensitive error prose', details: { token: 'secret' } },
      result: { actorUid: {}, sessionId: '../private', groupId: '../hidden', connectionGeneration: -1,
        assignedRoleId: 'unvalidated-private-role', activeConsoleRoleId: 'unvalidated-private-console' } } });
  assert.equal(observation.denialCode, 'RESOURCE_EXHAUSTED');
  assert.equal(observation.actorHash, null);
  assert.equal(observation.sessionHash, null);
  assert.equal(observation.groupHash, null);
  assert.equal(observation.connectionGeneration, null);
  assert.equal(JSON.stringify(observation).includes('sensitive'), false);
  assert.equal(JSON.stringify(observation).includes('secret'), false);
  assert.equal(JSON.stringify(observation).includes('private'), false);
});

test('rate denial observations distinguish only the approved counter categories', () => {
  const input = { name: 'resumeSession', transport: 'authenticated-emulator-HTTP',
    startedAt: 10, completedAt: 20, status: 429 };
  for (const commandError of ['rate-limit-state-invalid', 'rate-limited']) {
    const value = fixture.buildFixtureCallableObservation({ ...input,
      reply: { error: { status: 'RESOURCE_EXHAUSTED', details: { commandError, notes: 'secret-notes' } } } });
    assert.equal(value.denialCategory, commandError);
    assert.equal(JSON.stringify(value).includes('secret-notes'), false);
  }
  assert.equal(fixture.buildFixtureCallableObservation({ ...input,
    reply: { error: { details: { commandError: 'private-unvalidated-text' } } } }).denialCategory, null);
});

test('fixture failure diagnostics finish before cleanup and cannot replace the original failure', async () => {
  assert.equal(typeof fixture.finishFailedPc07Fixture, 'function');
  const events = [];
  const error = new Error('actual callable 429');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const result = fixture.finishFailedPc07Fixture(error, {
    observeFailure: async () => { events.push('observe'); await held; events.push('observed'); },
    cleanup: async () => { events.push('cleanup'); },
  });
  const failure = result.catch(value => value);
  await Promise.resolve();
  assert.deepEqual(events, ['observe']);
  release();
  assert.equal(await failure, error);
  assert.deepEqual(events, ['observe', 'observed', 'cleanup']);
});

test('an unavailable fixture failure observation remains marked and preserves the real failure and cleanup', async () => {
  assert.equal(typeof fixture.finishFailedPc07Fixture, 'function');
  const error = new Error('actual identity failure');
  let cleaned = false;
  await assert.rejects(fixture.finishFailedPc07Fixture(error, {
    observeFailure: async () => { throw new Error('observer unavailable'); },
    cleanup: async () => { cleaned = true; },
  }), value => value === error);
  assert.equal(error.pc07FailureObservationUnavailable, true);
  assert.equal(cleaned, true);
});

test('the optional fixture observer sees the real failed response once without altering its status', async t => {
  const seen = [];
  const origin = await localCallableServer(t, (_request, response) => {
    response.writeHead(429, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'original error' } }));
  });
  const reply = await fixture.performFixtureCallable({ origin, project: 'demo-test',
    actor: { localId: 'native-actor', idToken: 'never-in-observation' }, name: 'resumeSession',
    data: { sessionId: 'native-session' }, timeoutMs: 1_000,
    onCallableObservation: value => seen.push(value) });
  assert.equal(reply.status, 429);
  assert.equal(reply.error.message, 'original error');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].status, 429);
  assert.equal(seen[0].name, 'resumeSession');
  assert.match(seen[0].actorHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(seen).includes('never-in-observation'), false);
});

test('browser-owned presence can expire without an API heartbeat keeping core or Press connected', () => {
  assert.equal(shouldMaintainFixturePresence({ browserControlled: true, browserOwnsPresence: true }), false);
  assert.equal(shouldMaintainFixturePresence({ browserControlled: true, browserOwnsPresence: true,
    serializeFixtureCalls: true }), false);
  assert.equal(shouldMaintainFixturePresence({ browserControlled: false, browserOwnsPresence: true }), true);
});

test('existing API and serialized browser proof heartbeat policies remain explicit', () => {
  assert.equal(shouldMaintainFixturePresence({ browserControlled: true }), true);
  assert.equal(shouldMaintainFixturePresence({ browserControlled: false }), true);
  assert.equal(shouldMaintainFixturePresence({ browserControlled: true, serializeFixtureCalls: true }), false);
  assert.equal(shouldMaintainFixturePresence({ browserControlled: false, serializeFixtureCalls: true }), true);
});

test('configured browser actors replace matching core players before ordinary joins', async () => {
  const roles = ['admiral', 'pdf-fighter-ace', 'wolf-agent'];
  const players = [{ localId: 'auth-1' }, { localId: 'auth-2' }, { localId: 'auth-3' }];
  const calls = [];
  const ace = { localId: 'browser-ace', idToken: 'fresh-token-ace' };
  const wolf = { localId: 'browser-wolf', idToken: 'fresh-token-wolf' };

  const browserIndexes = await joinConfiguredBrowserPlayers({
    roles,
    players,
    joinCode: 'game-code',
    joinBrowserPlayers: {
      'pdf-fighter-ace': async code => { calls.push(['ace', code]); return ace; },
      'wolf-agent': async code => { calls.push(['wolf', code]); return wolf; },
    },
  });

  assert.deepEqual(calls, [['ace', 'game-code'], ['wolf', 'game-code']]);
  assert.deepEqual(browserIndexes, new Set([1, 2]));
  assert.deepEqual(players, [{ localId: 'auth-1' }, ace, wolf]);
});

test('the legacy singular browser option remains supported', async () => {
  const players = [{ localId: 'auth-1' }, { localId: 'auth-2' }];
  const browser = { localId: 'browser-ace', idToken: 'fresh-token' };
  let joinedWith;

  const browserIndexes = await joinConfiguredBrowserPlayers({
    roles: ['admiral', 'pdf-fighter-ace'],
    players,
    joinCode: 'legacy-code',
    browserRoleId: 'pdf-fighter-ace',
    joinBrowserPlayer: async code => { joinedWith = code; return browser; },
  });

  assert.equal(joinedWith, 'legacy-code');
  assert.deepEqual(browserIndexes, new Set([1]));
  assert.equal(players[1], browser);
});

test('browser mapping rejects non-core and duplicate role assignments', async () => {
  const input = { roles: ['admiral'], players: [{ localId: 'auth-1' }], joinCode: 'x' };
  await assert.rejects(() => joinConfiguredBrowserPlayers({
    ...input,
    joinBrowserPlayers: { 'wolf-agent': async () => ({ localId: 'browser' }) },
  }), /printed core station/);
  await assert.rejects(() => joinConfiguredBrowserPlayers({
    ...input,
    browserRoleId: 'admiral',
    joinBrowserPlayer: async () => ({ localId: 'singular' }),
    joinBrowserPlayers: { admiral: async () => ({ localId: 'mapped' }) },
  }), /configured once/);
});
