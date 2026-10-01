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
const script = 'node scripts/test-pc06-scout-taxi.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc06-scout-taxi', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc06-taxi-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { sendScoutTaxiCourier, requestScout, readFleetGroupMessages, sendFleetGroupMessage } = require('../functions/lib/index.js');
  const db = getFirestore();
  test('production courier handler delivers once through native Firestore without widening ordinary communication', async () => {
    const id = `pc06-taxi-${process.pid}`;
    const explorer = `${id}-explorer`, wing = `${id}-wing`;
    const session = db.doc(`sessions/${id}`);
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    const call = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'active', currentTurn: 3, chartId: 'A', chartSelectionLocked: true,
        activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
        activeVesselIds: ['aegis', 'quellon', 'shepherd'],
        turnPhase: { turn: 3, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
          airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
        shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: now }],
        shuttleControl: { hummingbird: { shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer',
          ownerUid: explorer, holderUid: explorer, revision: 0 } } });
      seed.set(db.doc(`sessions/${id}/players/${explorer}`), { uid: explorer, sessionId: id, role: 'player', connected: true,
        fleetGroupId: 'fleet-2', assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer' });
      seed.set(db.doc(`sessions/${id}/players/${wing}`), { uid: wing, sessionId: id, role: 'player', connected: true,
        fleetGroupId: 'fleet-1', assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis', 'shepherd'], memberUids: [wing] });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-2`), { id: 'fleet-2', vesselIds: ['quellon'], memberUids: [explorer] });
      seed.set(db.doc(`sessions/${id}/serverState/navigation`), { revision: 2,
        shipGalacticCoordinates: { aegis: '0000', shepherd: '0000', quellon: '1413' }, pursuitGroups: { 'fleet-1': 2, 'fleet-2': 4 } });
      await seed.commit();
      const beforeSession = (await session.get()).data();
      const navigation = db.doc(`sessions/${id}/serverState/navigation`);
      const beforeNavigation = (await navigation.get()).data();
      const data = { sessionId: id, requestId: 'taxi-native', shuttleId: 'hummingbird', targetShipId: 'aegis', text: 'Hold position.',
        expectedCycle: 3, expectedControlRevision: 0, expectedNavigationRevision: 2 };
      const results = await Promise.all([sendScoutTaxiCourier.run(call(explorer, data)), sendScoutTaxiCourier.run(call(explorer, data))]);
      assert.deepEqual(results.map(result => result.status).sort(), ['committed', 'replayed']);
      const receipt = await db.doc(`sessions/${id}/commandReceipts/taxi-native`).get();
      assert.equal(receipt.get('fingerprint.action'), 'scout-taxi-authority');
      const audit = await db.doc(`sessions/${id}/scoutTaxiCourierAudits/taxi-native`).get();
      assert.equal(audit.get('visit.authorityPath'), 'scout-taxi-authority');
      const notes = await readFleetGroupMessages.run(call(wing, { sessionId: id, expectedGroupId: 'fleet-1' }));
      assert.equal(notes.messages.length, 1);
      assert.equal(notes.messages[0].text, 'Scout taxi from quellon: Hold position.');
      const cadence = await db.doc(`sessions/${id}/scoutCadence/3-hummingbird`).get();
      assert.equal(cadence.get('scans').length, 1);
      assert.equal((await db.doc(`sessions/${id}/scoutRequests/taxi-native`).get()).exists, false);
      await assert.rejects(readFleetGroupMessages.run(call(explorer, { sessionId: id, expectedGroupId: 'fleet-1' })),
        error => error.code === 'permission-denied');
      await assert.rejects(sendFleetGroupMessage.run(call(explorer, { sessionId: id, expectedGroupId: 'fleet-1', requestId: 'forbidden', text: 'Forbidden' })),
        error => error.code === 'permission-denied');
      await assert.rejects(requestScout.run(call(explorer, { sessionId: id, requestId: 'spent-capacity', entitlementId: 'hummingbird', targetCoordinate: '5143' })),
        error => error.code === 'failed-precondition');
      assert.deepEqual((await session.get()).data(), beforeSession);
      assert.deepEqual((await navigation.get()).data(), beforeNavigation);
      assert.equal((await db.doc(`sessions/${id}/players/${explorer}`).get()).get('fleetGroupId'), 'fleet-2');
      assert.equal((await db.collection(`sessions/${id}/commandReceipts`).get()).size, 1);
      const unchangedDelivery = async () => Promise.all([
        db.doc(`sessions/${id}/fleetGroupMessages/fleet-1`).get(),
        db.doc(`sessions/${id}/scoutCadence/3-hummingbird`).get(),
        db.doc(`sessions/${id}/scoutTaxiCourierAudits/taxi-native`).get(),
        db.doc(`sessions/${id}/commandReceipts/taxi-native`).get(),
      ]).then(snapshots => snapshots.map(snapshot => snapshot.data()));
      const delivered = await unchangedDelivery();
      await session.update({ currentTurn: 4, turnPhase: { ...beforeSession.turnPhase, turn: 4 } });
      for (const shipId of ['aegis', 'quellon']) {
        await session.update({ shipDamage: { [shipId]: { destroyed: true, damagedSystemIds: [] } } });
        const denied = { ...data, expectedCycle: 4, requestId: `destroyed-${shipId}` };
        await assert.rejects(sendScoutTaxiCourier.run(call(explorer, denied)), error => error.code === 'failed-precondition' && /Destroyed ships/.test(error.message));
        assert.equal((await db.doc(`sessions/${id}/commandReceipts/${denied.requestId}`).get()).exists, false);
        assert.equal((await db.doc(`sessions/${id}/scoutTaxiCourierAudits/${denied.requestId}`).get()).exists, false);
        assert.deepEqual(await unchangedDelivery(), delivered);
      }
      await session.update({ currentTurn: 4, shipDamage: {} });
      await navigation.update({ revision: 3 });
      assert.deepEqual(await sendScoutTaxiCourier.run(call(explorer, { ...data, reconcileOnly: true })), {
        status: 'replayed', requestId: data.requestId, shuttleId: data.shuttleId, targetShipId: data.targetShipId, cycle: 3,
      });
      assert.deepEqual(await sendScoutTaxiCourier.run(call(explorer, { ...data, requestId: 'never-delivered', reconcileOnly: true })), {
        status: 'not-delivered', requestId: 'never-delivered', shuttleId: data.shuttleId, targetShipId: data.targetShipId, cycle: 3,
      });
      await assert.rejects(sendScoutTaxiCourier.run(call(explorer, { ...data, requestId: 'never-delivered' })),
        error => error.code === 'failed-precondition');
      assert.deepEqual(await unchangedDelivery(), delivered);
      assert.equal((await db.collection(`sessions/${id}/commandReceipts`).get()).size, 1);

    } finally { await db.recursiveDelete(session); }
  });
}
