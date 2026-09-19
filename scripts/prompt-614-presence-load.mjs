#!/usr/bin/env node
// Isolated emulator proof. Admin writes establish stale-pointer fixtures only;
// heartbeat and expiry use the production callable and scheduled handler.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('firebase.local.json', root), 'utf8'));
const ports = config.emulators;
const projectId = 'dow-new-eden-console';
// Override before loading Admin or the production handler: never use production.
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore.port}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth.port}`;
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const requireFunctions = createRequire(new URL('functions/package.json', root));
const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore');
const { expireStalePlayers } = requireFunctions('./lib/index.js');
const db = getFirestore();
const apps = [];
const evidence = {
  prompt: '614', status: 'failed',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  environment: 'local Firebase emulators; no production capacity claim',
  ports: { auth: ports.auth.port, functions: ports.functions.port, firestore: ports.firestore.port },
  ticks: [],
};
const evidencePath = process.env.P614_EVIDENCE_PATH ?? '/tmp/p614-presence-load.json';

async function client(label) {
  const app = initializeApp({ projectId, apiKey: 'demo-api-key', appId: `p614-${randomUUID()}` }, `p614-${label}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth.port}`, { disableWarnings: true });
  await signInAnonymously(auth);
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', ports.functions.port);
  return { uid: auth.currentUser.uid, call: async (name, data) => (await httpsCallable(functions, name)(data)).data };
}

let sessionId;
let expiryPromise;
try {
  const owner = await client('owner');
  const created = await owner.call('createSession', {
    requestId: `p614-${randomUUID()}`, name: 'Presence load rehearsal', displayName: 'Facilitator',
    playerCount: 20, expansion: 'capybara', chartId: 'A', turnLimit: 8,
  });
  sessionId = created.session.id;
  const roles = created.session.activeRoleIds;
  assert.equal(roles.length, 20);
  const players = [];
  for (let index = 0; index < 20; index++) {
    const player = await client(`player-${index}`);
    await player.call('joinSession', { joinCode: created.session.joinCode, displayName: `Player ${index}` });
    players.push(player);
  }
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const batch = db.batch();
  const staleUids = [];
  const recent = Timestamp.now();
  for (let index = 0; index < players.length; index++) {
    const uid = players[index].uid;
    const roleId = roles[index];
    const staleUid = `p614-stale-${randomUUID()}`;
    staleUids.push(staleUid);
    batch.update(sessionRef.collection('players').doc(uid), {
      seatId: roleId, assignedRoleId: roleId, activeConsoleRoleId: roleId,
      lastSeenAt: recent, connected: true,
    });
    batch.set(sessionRef.collection('seats').doc(roleId), {
      roleId, status: 'claimed', holderUid: uid, claimedAt: recent,
    });
    batch.set(sessionRef.collection('players').doc(staleUid), {
      sessionId, uid: staleUid, role: 'player', displayName: 'Obsolete device',
      connected: true, seatId: roleId, assignedRoleId: roleId,
      lastSeenAt: Timestamp.fromMillis(Date.now() - 60_000),
    });
    batch.set(db.doc(`activeMemberships/${staleUid}`), { sessionId });
  }
  await batch.commit();
  // Three synchronized cohorts at the production ten-second cadence. Do not
  // hide a failed call behind a retry or quietly reduce concurrency.
  const heartbeatRunStart = Date.now();
  expiryPromise = expireStalePlayers.run({}).then(() => null, error => error);
  for (let tick = 0; tick < 3; tick++) {
    const started = Date.now();
    const results = await Promise.allSettled(players.map(player => player.call('refreshPresence', { sessionId })));
    const failures = results.flatMap((result, index) => result.status === 'rejected'
      ? [{ index, code: result.reason?.code ?? 'unknown', message: String(result.reason?.message ?? result.reason).slice(0, 180) }]
      : []);
    evidence.ticks.push({ tick, startedAfterMs: started - heartbeatRunStart, callCount: results.length, durationMs: Date.now() - started, failures });
    assert.equal(failures.length, 0, `Heartbeat cohort ${tick} failed: ${JSON.stringify(failures)}`);
    const live = await Promise.all(players.map(player => sessionRef.collection('players').doc(player.uid).get()));
    for (let index = 0; index < live.length; index++) {
      assert.equal(live[index].get('connected'), true);
      assert.equal(live[index].get('seatId'), roles[index]);
      assert.ok(live[index].get('lastSeenAt').toMillis() >= started);
      const seat = await sessionRef.collection('seats').doc(roles[index]).get();
      assert.equal(seat.get('holderUid'), players[index].uid);
      assert.equal(seat.get('status'), 'claimed');
      assert.equal((await db.doc(`activeMemberships/${players[index].uid}`).get()).get('sessionId'), sessionId);
    }
    if (tick < 2) await delay(Math.max(0, 10_000 - (Date.now() - started)));
  }
  const expiryError = await expiryPromise;
  if (expiryError) throw expiryError;
  for (const uid of staleUids) {
    assert.equal((await sessionRef.collection('players').doc(uid).get()).get('connected'), false);
    assert.equal((await db.doc(`activeMemberships/${uid}`).get()).exists, false);
  }
  assert.equal((await sessionRef.get()).get('deleteAfter'), null);
  evidence.status = 'passed';
  evidence.results = { currentHolders: 20, obsoleteDevicesExpired: 20, heartbeatCalls: 60, cadenceMs: 10_000 };
  console.log('P614 concurrent heartbeat/expiry proof passed.');
} catch (error) {
  evidence.error = { code: error?.code ?? 'unknown', message: String(error?.message ?? error).slice(0, 1000) };
  throw error;
} finally {
  await expiryPromise;
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  await Promise.all(apps.map(app => deleteApp(app)));
  await db.terminate();
}
