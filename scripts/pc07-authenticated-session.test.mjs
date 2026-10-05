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
