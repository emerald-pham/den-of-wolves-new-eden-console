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
const script = 'node scripts/test-pc06-starlight-refuel.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc06-starlight-refuel', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc06-starlight-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { runMaintenance, requestScout } = require('../functions/lib/index.js');
  const db = getFirestore();
  test('real AEGIS bay refuel and completion retain one distinct second Starlight scan', async () => {
    const id = `pc06-starlight-${process.pid}`, uid = `${id}-gm`, wing = `${id}-wing`;
    const session = db.doc(`sessions/${id}`);
    const now = new Date().toISOString(), end = new Date(Date.now() + 20 * 60_000).toISOString();
    const call = (actor, data) => ({ auth: { uid: actor, token: { sub: actor, firebase: { sign_in_provider: 'custom' } } }, data });
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'active', currentTurn: 2, configurationLocked: true, chartId: 'A', chartSelectionLocked: true,
        activeRoleIds: ['wing-commander'], activeVesselIds: ['aegis'],
        shipResources: { aegis: { ore: 0, fuel: 3, food: 2, water: 2, materials: 0, securityTeams: 2 } },
        shipSurvivors: { aegis: 2500 }, shipUnrest: { aegis: 0 },
        shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } }, shipUpgrades: {},
        maintenanceCycles: { aegis: { step: 6, revision: 8, turn: 2,
          results: { '5': 'Production resolved.' }, charges: ['jump-drive'], refuelled: [] } },
        shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: now }],
        shuttleControl: { starlight: { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: wing, holderUid: wing, revision: 0 } },
        shuttleFuelled: { starlight: false }, shuttleCargo: {},
        turnPhase: { turn: 2, teamPhaseEndsAt: end, openAirspaceEndsAt: end,
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false } }, unrestAlerts: {}, populationAlerts: {} });
      seed.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role: 'gm', connected: true });
      seed.set(db.doc(`sessions/${id}/players/${wing}`), { uid: wing, sessionId: id, role: 'player', connected: true,
        fleetGroupId: 'fleet-1', assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
      seed.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid, connected: true, claimedAt: now, lastSeenAt: now });
      seed.set(db.doc(`sessions/${id}/gmInstances/bridge/private/shipConsoleWriteGrant`), {
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge', uid, shipId: 'aegis', grantedAt: now });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis'], memberUids: [wing] });
      seed.set(db.doc(`sessions/${id}/serverState/navigation`), { shipGalacticCoordinates: { aegis: '0000' }, shipNavigationLogs: {}, pursuitGroups: { 'fleet-1': 3 } });
      await seed.commit();
      for (const [action, expectedRevision, refuels] of [['bays', 8, { 'shuttle-bay-zeta': 'starlight' }], ['bays', 9, {}], ['end', 10, undefined]]) {
        const data = { sessionId: id, instanceId: 'bridge', shipId: 'aegis', requestId: `maintenance-${expectedRevision}`,
          action, expectedRevision, ...(refuels ? { refuels } : {}) };
        assert.equal((await runMaintenance.run(call(uid, data))).status, 'committed');
      }
      const completed = await session.get();
      assert.equal(completed.get('maintenanceCycles.aegis.step'), 0);
      assert.equal(completed.get('maintenanceCycles.aegis.turn'), 2);
      assert.deepEqual(completed.get('maintenanceCycles.aegis.refuelled'), ['starlight']);
      assert.equal(completed.get('shipResources.aegis.fuel'), 2);
      assert.equal(completed.get('shuttleFuelled.starlight'), true);
      await session.update({ 'turnPhase.airspace.state': 'lifted' });
      const first = { sessionId: id, entitlementId: 'starlight', requestId: 'first', targetCoordinate: '5143' };
      const second = { ...first, requestId: 'second', targetCoordinate: '9997' };
      assert.equal((await requestScout.run(call(wing, first))).status, 'requested');
      assert.equal((await requestScout.run(call(wing, second))).status, 'requested');
      assert.equal((await requestScout.run(call(wing, second))).status, 'replayed');
      const cadence = (await db.doc(`sessions/${id}/scoutCadence/2-starlight`).get()).data();
      assert.equal(cadence.scans.length, 2);
      await assert.rejects(requestScout.run(call(wing, { ...first, requestId: 'third', targetCoordinate: '1413' })), error => error.code === 'failed-precondition');
      assert.deepEqual((await db.doc(`sessions/${id}/scoutCadence/2-starlight`).get()).data(), cadence);
      assert.equal((await db.doc(`sessions/${id}/scoutRequests/third`).get()).exists, false);
      assert.equal((await session.get()).get('shipResources.aegis.fuel'), 2);
    } finally { await db.recursiveDelete(session); }
  });
}
