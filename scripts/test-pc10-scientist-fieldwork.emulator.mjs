#!/usr/bin/env node
// PC10.1 / #434: compiled production Scientist callables against native Firestore.
// Proves, for research, device construction, field upgrades and scouting, that a
// concurrent duplicate request produces one effect at the real cost, that the
// wrong actor is rejected without writes, and that the result stays private.
// Authentication and initial state are local fixtures; this is not deployed gameplay.
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
const script = 'node scripts/test-pc10-scientist-fieldwork.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-scientist-fieldwork', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc10-scientist-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const {
    readEndeavourResearchWorkspace, advanceEndeavourResearchTrack, buildEndeavourScienceDevice,
    upgradeEndeavourFieldTargets, requestScout,
  } = require('../functions/lib/index.js');
  const db = getFirestore();
  const call = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  const statuses = (results) => results.map(result => result.status).sort();
  const denied = (code) => (error) => error.code === code;

  test('Scientist research, device, upgrade and scouting commit once at the real cost through native Firestore', async () => {
    const id = `pc10-sci-${process.pid}`;
    const scientist = `${id}-scientist`, wing = `${id}-wing`;
    const session = db.doc(`sessions/${id}`);
    const now = new Date().toISOString();
    const phase = (state) => ({ turn: 3, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
      airspace: { state, tickerActive: true, pressAccess: state === 'lifted' } });
    const doc = (path) => db.doc(`sessions/${id}/${path}`);
    const materials = async (shipId) => (await session.get()).get(`shipResources.${shipId}.materials`);
    const ore = async () => (await session.get()).get('shipResources.shepherd.ore');
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'active', currentTurn: 3, chartId: 'A', chartSelectionLocked: true,
        activeRoleIds: ['shepherd-scientist', 'wing-commander'], activeVesselIds: ['shepherd', 'aegis'],
        turnPhase: phase('restricted'),
        shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: now }],
        shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
          ownerUid: scientist, holderUid: scientist, revision: 3 } },
        shuttleFuelled: { endeavour: false },
        shipResources: {
          shepherd: { ore: 10, fuel: 4, food: 10, water: 8, materials: 30, securityTeams: 2 },
          aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 8, securityTeams: 9 },
        },
        shipUpgrades: { shepherd: [], aegis: [] } });
      seed.set(doc(`players/${scientist}`), { uid: scientist, sessionId: id, role: 'player', connected: true,
        fleetGroupId: 'fleet-1', assignedRoleId: 'shepherd-scientist', seatId: 'shepherd-scientist',
        activeConsoleRoleId: 'shepherd-scientist', replacementRoleId: null });
      seed.set(doc(`players/${wing}`), { uid: wing, sessionId: id, role: 'player', connected: true,
        fleetGroupId: 'fleet-1', assignedRoleId: 'wing-commander', seatId: 'wing-commander',
        activeConsoleRoleId: 'wing-commander', replacementRoleId: null });
      seed.set(doc('fleetGroups/fleet-1'), { id: 'fleet-1', vesselIds: ['shepherd', 'aegis'], memberUids: [scientist, wing] });
      seed.set(doc('serverState/endeavourResearch'), { reactor: 1, 'ecm-device': 1 });
      seed.set(doc('serverState/navigation'), { revision: 1,
        shipGalacticCoordinates: { shepherd: '0000', aegis: '0000' }, pursuitGroups: { 'fleet-1': 8 } });
      await seed.commit();

      // Private workspace: the entitled Scientist reads real quotes; another member cannot.
      const before = await readEndeavourResearchWorkspace.run(call(scientist, { sessionId: id }));
      assert.equal(before.researchRevision, 0);
      assert.equal(before.scienceDevices.buildCosts['ecm-device'], 13);
      assert.equal(before.scienceDevices.shepherdMaterials, 30);
      await assert.rejects(readEndeavourResearchWorkspace.run(call(wing, { sessionId: id })), denied('permission-denied'));

      // Research: concurrent duplicate standard choice crosses one box and costs no ore.
      const research = { sessionId: id, requestId: 'research-1', expectedControlRevision: 3,
        expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'standard' };
      await assert.rejects(advanceEndeavourResearchTrack.run(call(wing, research)), denied('permission-denied'));
      assert.equal((await doc('commandReceipts/research-1').get()).exists, false);
      assert.deepEqual(statuses(await Promise.all([
        advanceEndeavourResearchTrack.run(call(scientist, research)),
        advanceEndeavourResearchTrack.run(call(scientist, research)),
      ])), ['committed', 'replayed']);
      assert.equal((await doc('serverState/endeavourResearch').get()).get('reactor'), 2);
      assert.equal((await doc('serverState/endeavourResearchCadence').get()).get('choices').length, 1);
      assert.equal(await ore(), 10);

      // Research: concurrent duplicate Shepherd-ore choice debits exactly five ore.
      const funded = { ...research, requestId: 'research-2', expectedResearchRevision: 1,
        trackId: 'ecm-device', funding: 'shepherd-ore' };
      assert.deepEqual(statuses(await Promise.all([
        advanceEndeavourResearchTrack.run(call(scientist, funded)),
        advanceEndeavourResearchTrack.run(call(scientist, funded)),
      ])), ['committed', 'replayed']);
      assert.equal(await ore(), 5);
      assert.equal((await doc('serverState/endeavourResearch').get()).get('ecm-device'), 2);

      // Device: concurrent duplicate ECM construction debits the quoted price once.
      const quoted = await readEndeavourResearchWorkspace.run(call(scientist, { sessionId: id }));
      const price = quoted.scienceDevices.buildCosts['ecm-device'];
      assert.equal(price, 9); // printed ECM construction prices: 18/13/9/7/5 by boxes crossed (two crossed)
      const build = { sessionId: id, requestId: 'build-1', expectedCycle: 3, expectedControlRevision: 3,
        expectedResearchRevision: quoted.researchRevision, expectedDeviceRevision: quoted.scienceDevices.revision,
        deviceId: 'ecm-device' };
      await assert.rejects(buildEndeavourScienceDevice.run(call(wing, build)), denied('permission-denied'));
      assert.equal(await materials('shepherd'), 30);
      const built = await Promise.all([
        buildEndeavourScienceDevice.run(call(scientist, build)),
        buildEndeavourScienceDevice.run(call(scientist, build)),
      ]);
      assert.deepEqual(statuses(built), ['committed', 'replayed']);
      assert.ok(built.every(result => result.materialCost === price && result.shepherdMaterials === 30 - price));
      assert.equal(await materials('shepherd'), 30 - price);
      const devices = (await doc('serverState/endeavourScienceDevices').get()).data();
      assert.deepEqual(devices, { revision: 1, ecmBuilt: true, detectorBuilt: false });
      await assert.rejects(buildEndeavourScienceDevice.run(call(scientist, { ...build, requestId: 'build-again',
        expectedDeviceRevision: 1 })), denied('failed-precondition'));
      assert.equal(await materials('shepherd'), 30 - price);
      assert.equal((await db.collection(`sessions/${id}/endeavourScienceDeviceAudits`).get()).size, 1);

      // Field upgrade (Coordination): concurrent duplicate charges each target once at the shared cost.
      await session.update({ turnPhase: phase('lifted') });
      const shepherdBefore = await materials('shepherd');
      const upgraded = await readEndeavourResearchWorkspace.run(call(scientist, { sessionId: id }));
      const reactorCost = upgraded.tracks.find(track => track.trackId === 'reactor').currentMaterialCost;
      assert.equal(reactorCost, 6);
      const upgrade = { sessionId: id, requestId: 'upgrade-1', expectedHostShipId: 'shepherd',
        expectedControlRevision: 3, expectedUpgradeRevision: upgraded.fieldUpgradeState.upgradeRevision,
        expectedCycle: 3, targets: [{ shipId: 'shepherd', systemId: 'reactor' }, { shipId: 'aegis', systemId: 'reactor' }] };
      // A non-Scientist in the same fleet group fails the role binding (failed-precondition), not the holder check.
      await assert.rejects(upgradeEndeavourFieldTargets.run(call(wing, upgrade)),
        error => ['permission-denied', 'failed-precondition'].includes(error.code));
      assert.equal(await materials('shepherd'), shepherdBefore);
      assert.equal((await doc('commandReceipts/upgrade-1').get()).exists, false);
      assert.deepEqual(statuses(await Promise.all([
        upgradeEndeavourFieldTargets.run(call(scientist, upgrade)),
        upgradeEndeavourFieldTargets.run(call(scientist, upgrade)),
      ])), ['committed', 'replayed']);
      assert.equal(await materials('shepherd'), shepherdBefore - reactorCost);
      assert.equal(await materials('aegis'), 8 - reactorCost);
      assert.deepEqual((await session.get()).get('shipUpgrades'), { shepherd: ['reactor'], aegis: ['reactor'] });

      // Scouting (Coordination): concurrent duplicate records one request and uses the cycle quota once.
      const scout = { sessionId: id, requestId: 'scout-1', entitlementId: 'endeavour', targetCoordinate: '4888' };
      await assert.rejects(requestScout.run(call(wing, scout)), denied('permission-denied'));
      assert.equal((await doc('scoutRequests/scout-1').get()).exists, false);
      assert.deepEqual(statuses(await Promise.all([
        requestScout.run(call(scientist, scout)),
        requestScout.run(call(scientist, scout)),
      ])), ['replayed', 'requested']);
      assert.equal((await db.collection(`sessions/${id}/scoutRequests`).get()).size, 1);
      await assert.rejects(requestScout.run(call(scientist, { ...scout, requestId: 'scout-2', targetCoordinate: '5143' })),
        denied('failed-precondition'));
      assert.equal((await doc('scoutRequests/scout-2').get()).exists, false);
    } finally { await db.recursiveDelete(session); }
  });
}
