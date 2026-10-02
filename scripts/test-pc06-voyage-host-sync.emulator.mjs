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
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({
    slot,
    kind: 'pc06-voyage-host-sync',
    command: 'node scripts/test-pc06-voyage-host-sync.emulator.mjs',
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: [
      '--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc06-voyage-host-sync-test', '--only', 'firestore',
      'node scripts/test-pc06-voyage-host-sync.emulator.mjs',
    ],
  });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const {
    dockVoyage33,
    jumpShip,
    jumpVoyage33,
  } = require('../functions/lib/index.js');
  const { getFirestore } = require('firebase-admin/firestore');
  const { INITIAL_SHIP_RESOURCES } = require('../functions/lib/resources.js');
  const { navigationStateDocumentPath } = require('../functions/lib/navigationProjection.js');
  const { neighborsForCoordinate } = require('../functions/lib/starChartGraph.js');
  const { emptyVoyage33MovementState } = require('../functions/lib/voyage33Movement.js');
  const { VOYAGE_33_COMMITMENTS, VOYAGE_33_ID } = require('../functions/lib/voyageAdmission.js');
  const { emptyVoyage33MaintenanceState } = require('../functions/lib/voyage33Maintenance.js');
  const db = getFirestore();

  const request = (uid, data) => ({
    auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } },
    data,
  });

  test('native jump sync advances Voyage and old host replays preserve a later independent move and redock', async () => {
    const id = `pc06-voyage-host-sync-${process.pid}`;
    const gm = `${id}-gm`;
    const session = db.doc(`sessions/${id}`);
    const navigation = db.doc(navigationStateDocumentPath(id));
    const grant = db.doc(`sessions/${id}/gmInstances/bridge/private/shipConsoleWriteGrant`);
    const ships = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
    const now = new Date().toISOString();
    const phaseEnd = new Date(Date.now() + 20 * 60_000).toISOString();
    const admission = {
      type: 'voyage-admission', sessionId: id, id: VOYAGE_33_ID, status: 'admitted',
      crisisId: 'approach-1', crisisRevision: 2, population: 40_000, unrest: 0,
      hostShipId: null, commitments: VOYAGE_33_COMMITMENTS,
    };
    const movement = {
      ...emptyVoyage33MovementState('0000'),
      jumpState: { lastJumpTurn: 0, emergencyJumpUsed: false },
    };
    const maintenance = {
      ...emptyVoyage33MaintenanceState('aegis'),
      dockingRevision: 1,
      population: 26_500,
      unrest: 4,
      cycle: {
        step: 4, revision: 8, results: { '1': 'Rations were recorded.' },
        charges: ['hydroponics'], turn: 1, rationBonus: 18,
      },
    };
    const resources = Object.fromEntries(ships.map((shipId) => [
      shipId,
      { ...INITIAL_SHIP_RESOURCES[shipId], fuel: 50 },
    ]));
    const strandedHostCoordinate = '1413';
    const hostDestination = neighborsForCoordinate(strandedHostCoordinate)?.[0];
    assert.ok(hostDestination, 'the locked chart supplies a host destination from the stranded host coordinate');
    const jumpCommand = {
      sessionId: id, instanceId: 'bridge', shipId: 'aegis',
      destination: hostDestination, requestId: 'host-jump-before-redock',
    };

    try {
      const seed = db.batch();
      seed.set(session, {
        phase: 'active', currentTurn: 1, setupRevision: 0, playerCount: 8, chartId: 'A',
        chartSelectionLocked: true, configurationLocked: true, ownerUid: gm,
        activeRoleIds: [], activeVesselIds: ships, admittedVesselIds: [VOYAGE_33_ID],
        voyage33Admission: admission, voyage33Movement: movement, voyage33Maintenance: maintenance,
        shipResources: resources,
        shipDamage: Object.fromEntries(ships.map((shipId) => [
          shipId, { damagedSystemIds: [], destroyed: false },
        ])),
        shipSurvivors: {}, shipUnrest: {}, shipMutinies: {}, shipUpgrades: {},
        shipJumpStates: {}, shipJumpTransitions: {}, vesselActionRevisions: {},
        maintenanceCycles: Object.fromEntries(ships.map((shipId) => [
          shipId, { turn: 1, step: 0, revision: 0, results: {}, charges: ['jump-drive'] },
        ])),
        missionCraftCommitments: {}, smallShipStates: {},
        turnPhase: {
          turn: 1, teamPhaseEndsAt: phaseEnd, openAirspaceEndsAt: phaseEnd,
          airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
        },
        turnState: {
          currentTurn: 1, maxTurn: 6, phase: 'coordination', phaseRevision: 1,
          startedAt: now, endsAt: phaseEnd,
        },
        createdAt: now, updatedAt: now,
      });
      seed.set(db.doc(`sessions/${id}/players/${gm}`), {
        uid: gm, sessionId: id, role: 'gm', connected: true, fleetGroupId: 'fleet-1',
        assignedRoleId: null, displayName: 'Emulator fixture', joinedAt: now,
      });
      seed.set(db.doc(`sessions/${id}/gmInstances/bridge`), {
        uid: gm, connected: true, lastSeenAt: now,
      });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), {
        id: 'fleet-1', vesselIds: ships, memberUids: [gm],
      });
      seed.set(db.doc(`activeMemberships/${gm}`), { uid: gm, sessionId: id, role: 'gm' });
      seed.set(navigation, {
        revision: 0,
        shipGalacticCoordinates: Object.fromEntries(ships.map((shipId) => [
          shipId, shipId === 'aegis' ? strandedHostCoordinate : '0000',
        ])),
        shipNavigationLogs: Object.fromEntries(ships.map((shipId) => [shipId, []])),
        pursuitGroups: { 'fleet-1': 2 },
        systemHistory: {}, scoutedCoordinatesByShip: {},
      });
      await seed.commit();
      await grant.set({
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge',
        uid: gm, shipId: 'aegis', grantedAt: now,
      });

      await jumpShip.run(request(gm, jumpCommand));
      const afterHostJump = (await session.get()).data();
      assert.deepEqual(afterHostJump?.voyage33Movement, {
        ...movement, coordinate: hostDestination, revision: 1,
      });
      assert.deepEqual(afterHostJump?.voyage33Maintenance, maintenance,
        'host movement leaves Voyage population, unrest, ration record, charge, and docking revision intact');
      assert.equal((await navigation.get()).get('shipGalacticCoordinates.aegis'), hostDestination);

      const beforeCapturedRetry = afterHostJump?.voyage33Movement;
      const fuelBeforeStaleRetry = afterHostJump?.shipResources?.aegis?.fuel;
      const stale = await jumpVoyage33.run(request(gm, {
        sessionId: id, instanceId: 'bridge', shipId: VOYAGE_33_ID, hostShipId: 'aegis',
        destination: '5143', requestId: 'old-voyage-command',
        expectedMovementRevision: 0, expectedDockingRevision: 1,
      }));
      assert.equal(stale.status, 'stale');
      assert.equal(stale.currentMovementRevision, 1);
      assert.deepEqual((await session.get()).get('voyage33Movement'), beforeCapturedRetry);
      assert.equal((await session.get()).get('shipResources.aegis.fuel'), fuelBeforeStaleRetry);

      const independentDestination = neighborsForCoordinate(hostDestination)?.[0];
      assert.ok(independentDestination, 'the locked chart supplies an independent Voyage destination');
      const independentJump = await jumpVoyage33.run(request(gm, {
        sessionId: id, instanceId: 'bridge', shipId: VOYAGE_33_ID, hostShipId: 'aegis',
        destination: independentDestination, requestId: 'voyage-independent-jump',
        expectedMovementRevision: 1, expectedDockingRevision: 1,
      }));
      assert.equal(independentJump.status, 'jumped');
      assert.equal(independentJump.maintenanceState.hostShipId, null);
      assert.equal(independentJump.movementState.coordinate, independentDestination);

      await navigation.update({ 'shipGalacticCoordinates.dione': independentDestination });
      await session.update({
        turnPhase: {
          turn: 1, teamPhaseEndsAt: phaseEnd, openAirspaceEndsAt: phaseEnd,
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
        },
        turnState: {
          currentTurn: 1, maxTurn: 6, phase: 'team', phaseRevision: 2,
          startedAt: now, endsAt: phaseEnd,
        },
      });
      const redock = await dockVoyage33.run(request(gm, {
        sessionId: id, instanceId: 'bridge', shipId: VOYAGE_33_ID, hostShipId: 'dione',
        requestId: 'voyage-redock-on-other-host',
        expectedMovementRevision: 2, expectedDockingRevision: 2,
      }));
      assert.equal(redock.status, 'committed');
      assert.equal(redock.maintenanceState.hostShipId, 'dione');
      assert.equal(redock.movementState.coordinate, independentDestination);

      await grant.set({
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge',
        uid: gm, shipId: 'aegis', grantedAt: now,
      });
      const beforeHostReplay = (await session.get()).data();
      const beforeNavigationReplay = (await navigation.get()).data();
      const beforeHostReceipt = (await db.doc(`sessions/${id}/commandReceipts/${jumpCommand.requestId}`).get()).data();
      const beforeHostEvent = (await db.doc(`sessions/${id}/events/ship-jump-${jumpCommand.requestId}`).get()).data();

      await jumpShip.run(request(gm, jumpCommand));

      assert.deepEqual((await session.get()).data(), beforeHostReplay,
        'an exact host replay performs no session write after Voyage has independently jumped and redocked');
      assert.deepEqual((await navigation.get()).data(), beforeNavigationReplay);
      assert.deepEqual(
        (await db.doc(`sessions/${id}/commandReceipts/${jumpCommand.requestId}`).get()).data(),
        beforeHostReceipt,
      );
      assert.deepEqual(
        (await db.doc(`sessions/${id}/events/ship-jump-${jumpCommand.requestId}`).get()).data(),
        beforeHostEvent,
      );
      assert.deepEqual((await session.get()).get('voyage33Movement'), {
        ...independentJump.movementState,
      });
      assert.equal((await session.get()).get('voyage33Maintenance.hostShipId'), 'dione');
    } finally {
      await db.recursiveDelete(session);
      await db.doc(`activeMemberships/${gm}`).delete();
    }
  });
}
