// PC10.3 browser-proof helper: an ordinary authenticated session left in the
// casting window (setup confirmed, every printed core seat cast and claimed,
// game not started). Seat release and claim are casting-window commands
// (`requireCastingWindow`), so a station can be released and taken by another
// member through production callables only before start.
//
// Same actors and calls as scripts/pc07-authenticated-session.mjs, stopping
// before `startGame`: an HTTP GM (local GM access grant, the dev-only fixture
// the PC07 helper also uses), `confirmSetup`, then for each printed seat a
// browser or HTTP player joins, is cast with `assignRole`, claims its seat with
// `claimSeat` and opens its console with `refreshPresence`. A browser seat
// listed in `uncastBrowserRoles` is claimed by its member without a cast role
// (claimSeat allows an uncast member in the casting window). `rivals` extra
// HTTP players join uncast to take released seats later. No session, seat or
// player document is written by the fixture. Tokens stay in memory.
//
// Usage inside a reserved emulator row (see scripts/pc10-3-reconnect-harness.mjs):
//   const f = await createCastingSession('name', 8, { joinBrowserPlayers: { 'quellon-explorer': member.join } });
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { grantLocalGmAccess, localGmAccessConfiguration } from './local-gm-access.mjs';
import { joinConfiguredBrowserPlayers } from './pc07-authenticated-session.mjs';

export async function createCastingSession(name, playerCount = 8, { joinBrowserPlayers = {}, uncastBrowserRoles = [], rivals: rivalCount = 1 } = {}) {
  const env = Object.fromEntries((await readFile('.env.emulators.local', 'utf8')).trim().split('\n').map(line => line.split('=')));
  const project = process.env.VITE_FIREBASE_PROJECT_ID;
  const config = localGmAccessConfiguration('serve', { ...env, VITE_LOCAL_GM_ACCESS: '1', VITE_FIREBASE_PROJECT_ID: project });
  if (!config) throw Error('Explicit demo project and isolated emulator ports required.');
  const functionsPort = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT);
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const { getFirestore } = require('firebase-admin/firestore');
  const { initializeApp, getApps } = require('firebase-admin/app');
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${config.firestorePort}`;
  if (!getApps().length) initializeApp({ projectId: project });
  const db = getFirestore();
  const actor = async () => {
    const r = await fetch(`http://127.0.0.1:${config.authPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    assert.equal(r.status, 200);
    return r.json();
  };
  const call = async (who, fn, data) => {
    const r = await fetch(`http://127.0.0.1:${functionsPort}/${project}/us-central1/${fn}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.idToken}` }, body: JSON.stringify({ data }) });
    return { status: r.status, ...await r.json() };
  };
  const ok = (reply, step) => { assert.equal(reply.status, 200, `${step}: ${reply.error?.message}`); return reply.result; };
  const gm = await actor();
  const players = await Promise.all(Array.from({ length: playerCount }, actor));
  const rivals = await Promise.all(Array.from({ length: rivalCount }, actor));
  const created = ok(await call(gm, 'createSession', { requestId: randomUUID(), joinCodeVersion: 2, name }), 'create');
  const sessionId = created.session.id, session = db.doc(`sessions/${sessionId}`), instanceId = 'pc10-3-casting-proof';
  let heartbeat;
  let heartbeatPending = Promise.resolve();
  const heartbeatActors = new Map();
  const heartbeatFailures = [];
  const beat = () => {
    heartbeatPending = heartbeatPending.then(async () => {
      for (const [label, { who, data }] of heartbeatActors) {
        const reply = await call(who, 'refreshPresence', { sessionId, ...data }).catch(error => ({ status: 0, error }));
        if (reply.status !== 200) heartbeatFailures.push({ actor: label, status: reply.status, message: String(reply.error?.message ?? '') });
      }
    });
  };
  try {
    const appOrigin = process.env.PC07_LOCAL_GM_ORIGIN ?? 'http://127.0.0.1:5174';
    await grantLocalGmAccess(config, { method: 'POST', host: new URL(appOrigin).host, origin: appOrigin, remoteAddress: '127.0.0.1', token: gm.idToken });
    ok(await call(gm, 'claimGmInstance', { sessionId, instanceId, name: 'Local facilitator', deviceLabel: 'PC10.3 casting proof' }), 'GM claim');
    heartbeatActors.set('gm', { who: gm, data: { instanceId } });
    heartbeat = setInterval(beat, 10_000);
    const roles = recommendedRoleIds(playerCount);
    ok(await call(gm, 'confirmSetup', { sessionId, instanceId, requestId: randomUUID(), expectedSetupRevision: created.session.setupRevision ?? 0,
      playerCount, chartId: 'A', lockChart: true, expansion: 'base', turnLimit: 6, dioneEnabled: playerCount >= 12, capybaraEnabled: false,
      universalArbourEnabled: false, wolfCultEnabled: false, activeRoleIds: roles }), 'confirm');
    const browserIndexes = await joinConfiguredBrowserPlayers({ roles, players, joinCode: created.session.joinCode, joinBrowserPlayers });
    for (const [i, player] of players.entries()) {
      if (!browserIndexes.has(i)) ok(await call(player, 'joinSession', { joinCode: created.session.joinCode, displayName: `Local actor ${i + 1}` }), 'join');
      const uncast = browserIndexes.has(i) && uncastBrowserRoles.includes(roles[i]);
      if (!uncast) ok(await call(gm, 'assignRole', { sessionId, instanceId, requestId: randomUUID(), targetUid: player.localId, roleId: roles[i] }), 'cast');
      const current = ok(await call(player, 'resumeSession', { sessionId }), 'resume');
      ok(await call(player, 'claimSeat', { sessionId, seatId: roles[i], requestId: randomUUID(),
        expectedSetupRevision: current.session.setupRevision }), 'seat');
      ok(await call(player, 'refreshPresence', { sessionId, activeConsoleRoleId: roles[i] }), 'console');
      if (!browserIndexes.has(i)) heartbeatActors.set(`player-${i + 1}`, { who: player, data: { activeConsoleRoleId: roles[i] } });
    }
    for (const [i, rival] of rivals.entries()) {
      ok(await call(rival, 'joinSession', { joinCode: created.session.joinCode, displayName: `Rival member ${i + 1}` }), 'rival join');
      heartbeatActors.set(`rival-${i + 1}`, { who: rival, data: {} });
    }
    const setupRevision = async () => (await session.get()).get('setupRevision');
    return { db, project, gm, players, rivals, roles, sessionId, session, instanceId, call, ok, heartbeatFailures, setupRevision,
      byRole: role => players[roles.indexOf(role)],
      cleanup: async () => { clearInterval(heartbeat); await heartbeatPending; await db.recursiveDelete(session); } };
  } catch (error) {
    clearInterval(heartbeat);
    await heartbeatPending;
    await db.recursiveDelete(session);
    throw error;
  }
}
