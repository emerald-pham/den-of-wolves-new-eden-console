import assert from 'node:assert/strict';
import test from 'node:test';
import { joinConfiguredBrowserPlayers } from './pc07-authenticated-session.mjs';

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
