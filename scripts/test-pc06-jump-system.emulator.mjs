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
  await runWithReservation({ slot, kind: 'pc06-jump-system', command: 'node scripts/test-pc06-jump-system.emulator.mjs',
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', path, '--project',
      'dow-new-eden-pc06-jump-test', '--only', 'firestore', 'node scripts/test-pc06-jump-system.emulator.mjs'] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { confirmSetup, jumpShip, confirmFleetPartition, resumeSession } = require('../functions/lib/index.js');
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const { activeVesselIdsForRoles } = require('../functions/lib/gameSetup.js');
  const { INITIAL_SHIP_RESOURCES } = require('../functions/lib/resources.js');
  const { organiserSitesForChart } = require('../functions/lib/starChartLookup.js');
  const { jumpDistanceBetween } = require('../functions/lib/starChartGraph.js');
  const { jumpLengthBetween, jumpFuelCost } = require('../functions/lib/jumpDrive.js');
  const db = getFirestore();
  const request = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  test('one composed chart selection, independent core jumps, pursuit, arrival and reconnect scenario uses real transactions', async () => {
    const id = `pc06-navigation-${process.pid}`;
    const gm = `${id}-gm`, alice = `${id}-alice`, bob = `${id}-bob`;
    const session = db.doc(`sessions/${id}`);
    const navRef = db.doc(`sessions/${id}/serverState/navigation`);
    const roles = [...recommendedRoleIds(8)];
    const ships = [...activeVesselIdsForRoles(roles)];
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    const sites = organiserSitesForChart('A');
    const firstDestination = Object.keys(sites).find(c => sites[c].code === 'D' && jumpLengthBetween('0000', c));
    const secondDestination = Object.keys(sites).find(c => c !== firstDestination && sites[c].code === 'G' && jumpLengthBetween('0000', c));
    assert.ok(firstDestination && secondDestination, 'canonical chart supplies reachable mission and quiet-jump nodes');
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'casting', currentTurn: 0, setupRevision: 0, playerCount: 8, chartId: 'B',
        expansion: 'base', turnLimit: 6, dioneEnabled: false, capybaraEnabled: false,
        universalArbourEnabled: false, wolfCultEnabled: false, activeRoleIds: roles, activeVesselIds: ships,
        ownerUid: gm, createdAt: now, updatedAt: now });
      for (const [uid, role, assignedRoleId] of [[gm, 'gm', null], [alice, 'player', 'admiral'], [bob, 'player', 'icebreaker-miner']]) {
        seed.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role, connected: true,
          fleetGroupId: 'fleet-1', assignedRoleId, displayName: 'Local scenario actor', joinedAt: now });
      }
      seed.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid: gm, connected: true, lastSeenAt: now });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ships, memberUids: [gm, alice, bob] });
      seed.set(navRef, { revision: 0, shipGalacticCoordinates: Object.fromEntries(ships.map(ship => [ship, '0000'])),
        shipNavigationLogs: Object.fromEntries(ships.map(ship => [ship, []])), pursuitGroups: { 'fleet-1': 5 } });
      await seed.commit();
      const setup = request(gm, { sessionId: id, instanceId: 'bridge', requestId: 'select-chart', expectedSetupRevision: 0,
        playerCount: 8, chartId: 'A', lockChart: true, expansion: 'base', turnLimit: 6,
        dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false, wolfCultEnabled: false });
      const selected = await confirmSetup.run(setup);
      assert.equal(selected.status, 'committed');
      assert.equal((await session.get()).get('chartId'), 'A');
      assert.equal((await session.get()).get('chartSelectionLocked'), true);
      assert.equal((await confirmSetup.run(setup)).status, 'replayed');
      const inventories = Object.fromEntries(ships.map(ship => [ship, { ...INITIAL_SHIP_RESOURCES[ship], fuel: 30 }]));
      await session.update({ phase: 'active', currentTurn: 1, configurationLocked: true,
        shipResources: inventories, shipDamage: {}, shipUnrest: {},
        maintenanceCycles: Object.fromEntries(ships.map(ship => [ship, { turn: 1, charges: ['jump-drive'] }])),
        turnPhase: { turn: 1, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
          airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
        turnState: { currentTurn: 1, maxTurn: 6, phase: 'coordination', phaseRevision: 1, startedAt: now, endsAt: end } });
      const grant = async shipId => db.doc(`sessions/${id}/gmInstances/bridge/private/shipConsoleWriteGrant`).set({
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge', uid: gm, shipId, grantedAt: now });
      await grant('aegis');
      const first = request(gm, { sessionId: id, instanceId: 'bridge', shipId: 'aegis', destination: firstDestination, requestId: 'first-jump' });
      const replies = await Promise.all([jumpShip.run(first), jumpShip.run(first)]);
      assert.deepEqual(replies[0], replies[1]);
      assert.equal(replies[0].status, 'jumped');
      const afterFirst = (await navRef.get()).data();
      assert.equal(afterFirst.shipGalacticCoordinates.aegis, firstDestination);
      for (const ship of ships.filter(ship => ship !== 'aegis')) assert.equal(afterFirst.shipGalacticCoordinates[ship], '0000');
      assert.equal((await session.get()).get('shipResources.aegis.fuel'), 30 - jumpFuelCost('aegis', jumpLengthBetween('0000', firstDestination), false));
      assert.ok(replies[0].missionOpportunityId);
      const opportunity = await db.doc(`sessions/${id}/missionOpportunities/${replies[0].missionOpportunityId}`).get();
      assert.equal(opportunity.get('coordinate'), firstDestination);
      assert.equal(opportunity.get('sourceTransitionId'), 'jump-first-jump');
      assert.equal((await session.get()).get('shipJumpTransitions.aegis.destination'), firstDestination);
      assert.equal(afterFirst.pursuitGroups['fleet-1'], Math.max(0, 5 - jumpDistanceBetween('0000', firstDestination)));
      const partition = await confirmFleetPartition.run(request(gm, { sessionId: id, instanceId: 'bridge', requestId: 'split-after-first', expectedNavigationRevision: afterFirst.revision }));
      assert.deepEqual(partition.groupIds, ['fleet-1', 'fleet-2']);
      const pursuitBefore = (await navRef.get()).get('pursuitGroups');
      assert.equal((await db.doc(`sessions/${id}/players/${bob}`).get()).get('fleetGroupId'), 'fleet-2');
      await grant('icebreaker');
      const second = request(gm, { sessionId: id, instanceId: 'bridge', shipId: 'icebreaker', destination: secondDestination, requestId: 'second-jump' });
      const moved = await jumpShip.run(second);
      assert.equal(moved.status, 'jumped');
      const afterSecond = (await navRef.get()).data();
      assert.equal(afterSecond.shipGalacticCoordinates.aegis, firstDestination);
      assert.equal(afterSecond.shipGalacticCoordinates.icebreaker, secondDestination);
      assert.deepEqual(afterSecond.pursuitGroups, pursuitBefore, 'quiet-arrival system does not reduce either group');
      assert.equal((await session.get()).get('shipResources.icebreaker.fuel'), 30 - jumpFuelCost('icebreaker', jumpLengthBetween('0000', secondDestination), false));
      assert.deepEqual(await jumpShip.run(second), moved);
      const resumed = await resumeSession.run(request(bob, { sessionId: id }));
      assert.equal(resumed.player.fleetGroupId, 'fleet-2');
      const discovery = (await db.doc(`sessions/${id}/playerDiscoveries/${bob}`).get()).data();
      assert.equal(discovery.currentCoordinate, secondDestination);
      assert.equal(discovery.groupId, 'fleet-2');
      assert.ok(discovery.knownCoordinates.includes(secondDestination));
      assert.ok(!discovery.knownCoordinates.includes(firstDestination), 'another partition arrival is not granted on reconnect');
      const opportunities = await db.collection(`sessions/${id}/missionOpportunities`).get();
      assert.equal(opportunities.size, 2);
      assert.deepEqual(new Set(opportunities.docs.map(doc => doc.get('coordinate'))), new Set([firstDestination, secondDestination]));
      assert.equal((await navRef.get()).get('revision'), afterSecond.revision);
      assert.equal((await session.get()).get('shipResources.icebreaker.fuel'), moved.remainingFuel);
    } finally {
      await db.recursiveDelete(session);
      await Promise.all([gm, alice, bob].map(uid => db.doc(`activeMemberships/${uid}`).delete()));
    }
  });
}
