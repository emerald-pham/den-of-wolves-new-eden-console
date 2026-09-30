#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { emulatorPortsForSlot, emulatorSlotForConfig, vitePortForSlot } from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const path = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(path, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc06-fleet-groups', command: 'node scripts/test-pc06-fleet-groups.emulator.mjs',
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', path, '--project',
      'dow-new-eden-pc06-groups-test', '--only', 'firestore', 'node scripts/test-pc06-fleet-groups.emulator.mjs'] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { confirmFleetPartition, readFleetGroupMessages, sendFleetGroupMessage } = require('../functions/lib/index.js');
  const db = getFirestore();
  const request = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  test('real Firestore transactions isolate partition pursuit, current notes and concurrent exact retries', async () => {
    const id = `pc06-groups-${process.pid}`;
    const session = db.doc(`sessions/${id}`);
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    try {
      const batch = db.batch();
      batch.set(session, { phase: 'active', currentTurn: 1, chartId: 'A', chartSelectionLocked: true,
        activeVesselIds: ['aegis', 'dione'], activeRoleIds: ['admiral', 'dione-captain'],
        turnPhase: { turn: 1, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
          airspace: { state: 'lifted', tickerActive: true, pressAccess: false } } });
      batch.set(db.doc(`sessions/${id}/serverState/navigation`), { revision: 4,
        shipGalacticCoordinates: { aegis: '0000', dione: '1413' }, shipNavigationLogs: { aegis: [], dione: [] },
        pursuitGroups: { 'fleet-1': 5 }, missionExploredCoordinatesByUid: { alice: ['1413'] } });
      batch.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['gm', 'alice'] });
      batch.set(db.doc(`sessions/${id}/players/gm`), { uid: 'gm', sessionId: id, role: 'gm', connected: true, fleetGroupId: 'fleet-1' });
      batch.set(db.doc(`sessions/${id}/players/alice`), { uid: 'alice', sessionId: id, role: 'player', connected: true,
        fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain' });
      batch.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid: 'gm', connected: true, lastSeenAt: now });
      await batch.commit();
      const confirmation = request('gm', { sessionId: id, instanceId: 'bridge', requestId: 'partition-1', expectedNavigationRevision: 4 });
      const [first, replay] = await Promise.all([confirmFleetPartition.run(confirmation), confirmFleetPartition.run(confirmation)]);
      assert.deepEqual(first, replay);
      assert.deepEqual(first, { status: 'committed', navigationRevision: 5, groupIds: ['fleet-1', 'fleet-2'] });
      const nav = (await db.doc(`sessions/${id}/serverState/navigation`).get()).data();
      assert.deepEqual(nav.pursuitGroups, { 'fleet-1': 5, 'fleet-2': 5 });
      assert.deepEqual(nav.missionExploredCoordinatesByUid, { alice: ['1413'] });
      assert.equal((await db.doc(`sessions/${id}/players/alice`).get()).get('fleetGroupId'), 'fleet-2');
      assert.equal((await db.doc(`sessions/${id}/playerDiscoveries/alice`).get()).get('groupId'), 'fleet-2');
      const note = request('alice', { sessionId: id, expectedGroupId: 'fleet-2', requestId: 'note-1', text: 'Dione remains here.' });
      const results = await Promise.all([sendFleetGroupMessage.run(note), sendFleetGroupMessage.run(note),
        sendFleetGroupMessage.run(request('alice', { ...note.data, requestId: 'note-2', text: 'Second distinct note.' }))]);
      assert.deepEqual(results[0], results[1]);
      const own = await readFleetGroupMessages.run(request('alice', { sessionId: id, expectedGroupId: 'fleet-2' }));
      assert.equal(own.messages.length, 2);
      assert.deepEqual(new Set(own.messages.map(message => message.id)), new Set(['note-1', 'note-2']));
      await assert.rejects(readFleetGroupMessages.run(request('gm', { sessionId: id, expectedGroupId: 'fleet-2' })), /cross fleet groups/);
      await assert.rejects(sendFleetGroupMessage.run(request('alice', { ...note.data, expectedGroupId: 'fleet-1' })), /cross fleet groups/);
      const other = await readFleetGroupMessages.run(request('gm', { sessionId: id, expectedGroupId: 'fleet-1' }));
      assert.deepEqual(other.messages, []);
      await db.doc(`sessions/${id}/players/alice`).update({ connected: false });
      await assert.rejects(readFleetGroupMessages.run(request('alice', { sessionId: id, expectedGroupId: 'fleet-2' })), /active session member/);
    } finally { await db.recursiveDelete(session); }
  });
}
