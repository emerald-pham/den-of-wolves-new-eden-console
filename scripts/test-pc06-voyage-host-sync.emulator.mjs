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
    joinSession,
    jumpShip,
    jumpVoyage33,
    resumeSession,
  } = require('../functions/lib/index.js');
  const { getFirestore } = require('firebase-admin/firestore');
  const { INITIAL_SHIP_RESOURCES } = require('../functions/lib/resources.js');
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const { activeVesselIdsForRoles } = require('../functions/lib/gameSetup.js');
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
    const privateMovement = db.doc(`sessions/${id}/serverState/voyage33Movement`);
    const gmProjection = db.doc(`sessions/${id}/gmDiscovery/current`);
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
      assert.equal(Object.hasOwn(afterHostJump ?? {}, 'voyage33Movement'), false,
        'the member-readable session header no longer carries Voyage coordinates');
      assert.deepEqual((await privateMovement.get()).get('movementState'), {
        ...movement, coordinate: hostDestination, revision: 1,
      });
      assert.deepEqual((await gmProjection.get()).get('voyage33Movement'), {
        ...movement, coordinate: hostDestination, revision: 1,
      });
      const firstGmProjection = (await gmProjection.get()).data();
      for (const field of [
        'shipGalacticCoordinates', 'shipNavigationLogs', 'knownSystems', 'organiserSites',
        'pursuitDistances', 'pursuitGroups', 'shipFleetGroupIds', 'revision',
      ]) {
        assert.ok(Object.hasOwn(firstGmProjection ?? {}, field),
          `the GM movement projection remains a complete ${field} view`);
      }
      assert.equal((await gmProjection.get()).get('shipGalacticCoordinates.aegis'), hostDestination,
        'the composed GM view includes its normal navigation projection');
      assert.deepEqual(afterHostJump?.voyage33Maintenance, maintenance,
        'host movement leaves Voyage population, unrest, ration record, charge, and docking revision intact');
      assert.equal((await navigation.get()).get('shipGalacticCoordinates.aegis'), hostDestination);

      const otherHostDestination = neighborsForCoordinate('0000')?.find((coordinate) => coordinate !== hostDestination);
      assert.ok(otherHostDestination, 'the chart supplies an unrelated vessel destination');
      await grant.set({
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge',
        uid: gm, shipId: 'dione', grantedAt: now,
      });
      await jumpShip.run(request(gm, {
        sessionId: id, instanceId: 'bridge', shipId: 'dione',
        destination: otherHostDestination, requestId: 'ordinary-navigation-after-voyage-sync',
      }));
      assert.deepEqual((await privateMovement.get()).get('movementState'), {
        ...movement, coordinate: hostDestination, revision: 1,
      });
      assert.deepEqual((await gmProjection.get()).get('voyage33Movement'), {
        ...movement, coordinate: hostDestination, revision: 1,
      }, 'a later ordinary navigation publication keeps the canonical Voyage movement projection');
      const coordinatesAfterNormalNavigation = (await navigation.get()).get('shipGalacticCoordinates');
      const gmNavigationBeforeVoyageJump = (await gmProjection.get()).data();
      assert.deepEqual((await gmProjection.get()).get('shipGalacticCoordinates'), coordinatesAfterNormalNavigation,
        'the regular GM navigation view remains complete after its ordinary rebuild');

      const beforeCapturedRetry = (await privateMovement.get()).get('movementState');
      const fuelBeforeStaleRetry = afterHostJump?.shipResources?.aegis?.fuel;
      const stale = await jumpVoyage33.run(request(gm, {
        sessionId: id, instanceId: 'bridge', shipId: VOYAGE_33_ID, hostShipId: 'aegis',
        destination: '5143', requestId: 'old-voyage-command',
        expectedMovementRevision: 0, expectedDockingRevision: 1,
      }));
      assert.equal(stale.status, 'stale');
      assert.equal(stale.currentMovementRevision, 1);
      assert.deepEqual((await privateMovement.get()).get('movementState'), beforeCapturedRetry);
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
      assert.equal((await session.get()).get('voyage33Movement'), undefined);
      assert.deepEqual((await privateMovement.get()).get('movementState'), independentJump.movementState);
      assert.deepEqual((await gmProjection.get()).get('voyage33Movement'), independentJump.movementState);
      assert.deepEqual((await gmProjection.get()).get('shipGalacticCoordinates'),
        (await navigation.get()).get('shipGalacticCoordinates'),
        'Voyage-only field publication preserves the existing GM navigation fields');
      const gmNavigationAfterVoyageJump = (await gmProjection.get()).data();
      for (const field of [
        'shipGalacticCoordinates', 'shipNavigationLogs', 'knownSystems', 'organiserSites',
        'pursuitDistances', 'pursuitGroups', 'shipFleetGroupIds', 'revision',
      ]) {
        assert.deepEqual(gmNavigationAfterVoyageJump?.[field], gmNavigationBeforeVoyageJump?.[field],
          `a partial Voyage projection write preserves GM navigation field ${field}`);
      }

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
      assert.deepEqual((await privateMovement.get()).get('movementState'), redock.movementState);
      assert.deepEqual((await gmProjection.get()).get('shipGalacticCoordinates'),
        (await navigation.get()).get('shipGalacticCoordinates'),
        'redocking publishes movement without replacing the composed navigation view');

      await grant.set({
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge',
        uid: gm, shipId: 'aegis', grantedAt: now,
      });
      const beforeHostReplay = (await session.get()).data();
      const beforeNavigationReplay = (await navigation.get()).data();
      const beforePrivateMovementReplay = (await privateMovement.get()).data();
      const beforeGmProjectionReplay = (await gmProjection.get()).data();
      const beforeHostReceipt = (await db.doc(`sessions/${id}/commandReceipts/${jumpCommand.requestId}`).get()).data();
      const beforeHostEvent = (await db.doc(`sessions/${id}/events/ship-jump-${jumpCommand.requestId}`).get()).data();

      await jumpShip.run(request(gm, jumpCommand));

      assert.deepEqual((await session.get()).data(), beforeHostReplay,
        'an exact host replay performs no session write after Voyage has independently jumped and redocked');
      assert.deepEqual((await navigation.get()).data(), beforeNavigationReplay);
      assert.deepEqual((await privateMovement.get()).data(), beforePrivateMovementReplay);
      assert.deepEqual((await gmProjection.get()).data(), beforeGmProjectionReplay);
      assert.deepEqual(
        (await db.doc(`sessions/${id}/commandReceipts/${jumpCommand.requestId}`).get()).data(),
        beforeHostReceipt,
      );
      assert.deepEqual(
        (await db.doc(`sessions/${id}/events/ship-jump-${jumpCommand.requestId}`).get()).data(),
        beforeHostEvent,
      );
      assert.deepEqual((await privateMovement.get()).get('movementState'), {
        ...independentJump.movementState,
      });
      assert.equal((await session.get()).get('voyage33Movement'), undefined);
      assert.equal((await session.get()).get('voyage33Maintenance.hostShipId'), 'dione');
    } finally {
      await db.recursiveDelete(session);
      await db.doc(`activeMemberships/${gm}`).delete();
    }
  });

  test('native emergency host movement reads arrival pressure before its damage press-log write', async () => {
    const id = `pc06-voyage-host-sync-emergency-${process.pid}`;
    const gm = `${id}-gm`;
    const session = db.doc(`sessions/${id}`);
    const navigation = db.doc(`sessions/${id}/serverState/navigation`);
    const privateMovement = db.doc(`sessions/${id}/serverState/voyage33Movement`);
    const gmProjection = db.doc(`sessions/${id}/gmDiscovery/current`);
    const arrivalPressure = db.doc(`sessions/${id}/serverState/wolfArrivalPressure/groups/fleet-1`);
    const grant = db.doc(`sessions/${id}/gmInstances/bridge/private/shipConsoleWriteGrant`);
    const ships = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
    const now = new Date().toISOString();
    const phaseEnd = new Date(Date.now() + 20 * 60_000).toISOString();
    const emergencyWindow = {
      type: 'pursuit-emergency-window', status: 'offered', cycle: 1,
      navigationRevision: 0, groupIds: ['fleet-1'], openedAt: now,
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
      { ...INITIAL_SHIP_RESOURCES[shipId], fuel: 0 },
    ]));
    const priorPressure = {
      type: 'wolf-base-arrival-pressure', status: 'operational', groupId: 'fleet-1',
      chart: 'A', coordinate: '4454', siteCode: 'M', sourceShipId: 'aegis',
      sourceTransitionId: 'arrival-before-emergency', cycle: 1, revision: 1,
      attackStatus: 'scheduled', arrivalTiming: 'immediate', minimumBattleStations: 2,
      minimumOtherShipDamage: 25, missionAccess: 'blockedWhileWolfBaseOperational',
      recurringUntil: ['baseDestroyed', 'jumpAway'],
    };
    const requestId = 'native-emergency-read-order';

    try {
      const seed = db.batch();
      seed.set(session, {
        phase: 'active', currentTurn: 1, setupRevision: 0, playerCount: 8, chartId: 'A',
        chartSelectionLocked: true, configurationLocked: true, ownerUid: gm,
        activeRoleIds: [], activeVesselIds: ships, admittedVesselIds: [VOYAGE_33_ID],
        voyage33Admission: {
          type: 'voyage-admission', sessionId: id, id: VOYAGE_33_ID, status: 'admitted',
          crisisId: 'approach-1', crisisRevision: 2, population: 40_000, unrest: 0,
          hostShipId: null, commitments: VOYAGE_33_COMMITMENTS,
        },
        voyage33Maintenance: maintenance,
        shipResources: resources,
        shipDamage: Object.fromEntries(ships.map((shipId) => [
          shipId, { damagedSystemIds: [], destroyed: false },
        ])),
        shipSurvivors: { aegis: 2500 }, shipUnrest: {}, shipMutinies: {}, shipUpgrades: {},
        shipJumpStates: { aegis: { emergencyJumpUsed: false } },
        shipJumpTransitions: {}, vesselActionRevisions: {},
        maintenanceCycles: Object.fromEntries(ships.map((shipId) => [
          shipId, { turn: 1, step: 0, revision: 0, results: {}, charges: [] },
        ])),
        missionCraftCommitments: {}, smallShipStates: {},
        pursuitEmergencyWindow: {
          type: emergencyWindow.type, status: emergencyWindow.status,
          cycle: emergencyWindow.cycle, openedAt: emergencyWindow.openedAt,
        },
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
        assignedRoleId: null, displayName: 'Emulator emergency fixture', joinedAt: now,
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
        shipGalacticCoordinates: Object.fromEntries(ships.map((shipId) => [shipId, '0000'])),
        shipNavigationLogs: Object.fromEntries(ships.map((shipId) => [shipId, []])),
        pursuitGroups: { 'fleet-1': 10 },
        pursuitEmergencyWindow: emergencyWindow,
        systemHistory: {}, scoutedCoordinatesByShip: {},
      });
      seed.set(privateMovement, { movementState: movement, updatedAt: now });
      seed.set(arrivalPressure, {
        type: 'wolf-base-arrival-pressure-state',
        groupId: 'fleet-1', chart: 'A', revision: 1, entries: [priorPressure],
      });
      await seed.commit();
      await grant.set({
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge',
        uid: gm, shipId: 'aegis', grantedAt: now,
      });

      const reply = await jumpShip.run(request(gm, {
        sessionId: id, instanceId: 'bridge', shipId: 'aegis', destination: '5143',
        requestId, emergency: true,
      }));
      assert.equal(reply.status, 'jumped');
      assert.equal(reply.emergency, true);
      assert.equal((await session.get()).get('voyage33Movement'), undefined,
        'emergency movement also leaves the member-readable header empty');
      assert.deepEqual((await privateMovement.get()).get('movementState'), {
        ...movement, coordinate: '5143', revision: 1,
      });
      assert.deepEqual((await gmProjection.get()).get('voyage33Movement'), {
        ...movement, coordinate: '5143', revision: 1,
      });
      const survivorsAfterEmergency = (await session.get()).get('shipSurvivors.aegis');
      assert.ok(survivorsAfterEmergency < 2500,
        'the emergency jump applies its guaranteed Jump Drive damage consequence');
      const pressLog = await db.collection(`sessions/${id}/pressLog`).get();
      assert.ok(pressLog.docs.some((entry) => {
        const value = entry.data();
        return value.sourceId === `ship-damage:${requestId}` && value.cause === 'ship-damage' &&
          value.fromPopulation === 2500 && value.toPopulation === survivorsAfterEmergency;
      }), 'the actual handler writes its damage press-log event in this transaction');
      const pressure = (await arrivalPressure.get()).data();
      assert.equal(pressure?.revision, 2,
        'the transaction reads and updates the existing arrival-pressure document');
      assert.ok(pressure?.entries.some((entry) =>
        entry.sourceTransitionId === 'arrival-before-emergency' && entry.status === 'departed'));
      assert.ok(pressure?.entries.some((entry) =>
        entry.sourceTransitionId === `jump-${requestId}` && entry.status === 'operational' &&
        entry.coordinate === '5143'));
    } finally {
      await db.recursiveDelete(session);
      await db.doc(`activeMemberships/${gm}`).delete();
    }
  });

  test('native join and resume authorize, validate, and atomically migrate legacy movement', async () => {
    const id = `pc06-voyage-host-sync-join-${process.pid}`;
    const gm = `${id}-gm`;
    const member = `${id}-member`;
    const joinCode = '3141';
    const session = db.doc(`sessions/${id}`);
    const privateMovement = db.doc(`sessions/${id}/serverState/voyage33Movement`);
    const gmProjection = db.doc(`sessions/${id}/gmDiscovery/current`);
    const roles = [...recommendedRoleIds(8)];
    const ships = [...activeVesselIdsForRoles(roles)];
    const now = new Date().toISOString();
    const validMovement = {
      ...emptyVoyage33MovementState('1413'),
      revision: 9,
      jumpState: { lastJumpTurn: 2, emergencyJumpUsed: false },
    };
    try {
      await session.set({
        phase: 'active', currentTurn: 2, setupRevision: 0, playerCount: 8, chartId: 'A',
        joinCode, chartSelectionLocked: true, configurationLocked: true, ownerUid: gm,
        activeRoleIds: roles, activeVesselIds: ships, admittedVesselIds: [VOYAGE_33_ID],
        voyage33Admission: {
          type: 'voyage-admission', sessionId: id, id: VOYAGE_33_ID, status: 'admitted',
          crisisId: 'approach-1', crisisRevision: 2, population: 40_000, unrest: 0,
          hostShipId: null, commitments: VOYAGE_33_COMMITMENTS,
        },
        voyage33Movement: { ...validMovement, coordinate: '9999' },
        voyage33Maintenance: {
          ...emptyVoyage33MaintenanceState('aegis'), dockingRevision: 3,
          population: 26_500, unrest: 4,
          cycle: { step: 4, revision: 8, results: { '1': 'Rations were recorded.' }, charges: ['hydroponics'], turn: 2 },
        },
        createdAt: now, updatedAt: now,
      });
      await db.doc(`joinCodes/${joinCode}`).set({ sessionId: id });
      await db.doc(`sessions/${id}/players/${gm}`).set({
        uid: gm, sessionId: id, role: 'gm', connected: true, fleetGroupId: 'fleet-1',
        assignedRoleId: null, displayName: 'Join migration fixture', joinedAt: now,
      });
      await db.doc(`sessions/${id}/fleetGroups/fleet-1`).set({
        id: 'fleet-1', vesselIds: ships, memberUids: [],
      });
      await db.doc(`sessions/${id}/serverState/navigation`).set({
        revision: 0,
        shipGalacticCoordinates: Object.fromEntries(ships.map((shipId) => [shipId, '0000'])),
        shipNavigationLogs: Object.fromEntries(ships.map((shipId) => [shipId, []])),
        pursuitGroups: { 'fleet-1': 2 },
      });
      await db.doc(`activeMemberships/${gm}`).set({ uid: gm, sessionId: id });

      await assert.rejects(
        resumeSession.run(request(`${id}-stranger`, { sessionId: id })),
        { code: 'permission-denied' },
        'an unaffiliated actor cannot trigger a movement migration',
      );
      assert.equal((await session.get()).get('voyage33Movement').coordinate, '9999');
      assert.equal((await privateMovement.get()).exists, false);

      await assert.rejects(
        joinSession.run(request(member, { joinCode, displayName: 'New fleet member' })),
        { code: 'failed-precondition' },
        'a malformed legacy coordinate fails closed before the join commits',
      );
      assert.deepEqual((await session.get()).get('voyage33Movement'), { ...validMovement, coordinate: '9999' });
      assert.equal((await db.doc(`sessions/${id}/players/${member}`).get()).exists, false);
      assert.equal((await privateMovement.get()).exists, false);

      await session.update({ voyage33Movement: validMovement });
      const joined = await joinSession.run(request(member, { joinCode, displayName: 'New fleet member' }));
      assert.equal(Object.hasOwn(joined.session, 'voyage33Movement'), false,
        'join does not return the former public coordinate');
      assert.equal((await session.get()).get('voyage33Movement'), undefined);
      assert.deepEqual((await privateMovement.get()).get('movementState'), validMovement,
        'the authorized join transaction migrates the full independent movement history');
      assert.deepEqual((await gmProjection.get()).get('voyage33Movement'), validMovement,
        'the GM workspace receives only a private movement projection');

      const resumed = await resumeSession.run(request(member, { sessionId: id }));
      assert.equal(Object.hasOwn(resumed.session, 'voyage33Movement'), false,
        'resume never returns the coordinate to a member');
      assert.deepEqual((await gmProjection.get()).get('voyage33Movement'), validMovement,
        'a navigation projection refresh preserves current Voyage authority');

      // Reconstruct a valid legacy-only record in the emulator to exercise the
      // reconnect migration path independently from join.
      await privateMovement.delete();
      await session.update({ voyage33Movement: validMovement });
      const resumedLegacy = await resumeSession.run(request(member, { sessionId: id }));
      assert.equal(Object.hasOwn(resumedLegacy.session, 'voyage33Movement'), false);
      assert.equal((await session.get()).get('voyage33Movement'), undefined);
      assert.deepEqual((await privateMovement.get()).get('movementState'), validMovement,
        'resume migrates a valid legacy record only after it revalidates the connected actor');
      assert.deepEqual((await gmProjection.get()).get('voyage33Movement'), validMovement);
    } finally {
      await db.recursiveDelete(session);
      await Promise.all([
        db.doc(`joinCodes/${joinCode}`).delete(),
        db.doc(`activeMemberships/${gm}`).delete(),
        db.doc(`activeMemberships/${member}`).delete(),
      ]);
    }
  });
}
