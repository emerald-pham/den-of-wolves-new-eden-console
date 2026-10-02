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
  await runWithReservation({ slot, kind: 'pc06-mission-transaction', command: 'node scripts/test-pc06-mission-transaction.emulator.mjs',
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', path, '--project',
      'dow-new-eden-pc06-mission-test', '--only', 'firestore', 'node scripts/test-pc06-mission-transaction.emulator.mjs'] });
} else {  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { dealPrivateInitialCards, commitAwayMissionLifecycleCommand, jumpShip, moveShipToLocation, confirmFleetPartition } = require('../functions/lib/index.js');
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const { activeVesselIdsForRoles } = require('../functions/lib/gameSetup.js');
  const { roleOwnedCraftManifestForSetup } = require('../functions/lib/craftOwnership.js');
  const { missionDeck, missionDeckStateFromCards } = require('../functions/lib/missionDeck.js');
  const { organiserSitesForChart } = require('../functions/lib/starChartLookup.js');
  const { awayMissionHandId } = require('../functions/lib/awayMissionCards.js');
  const db = getFirestore();
  const request = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  test('real Firestore mission bootstrap, automatic resolution, private exploration and oversized delivery remain atomic on retries', async () => {
    const id = `pc06-mission-${process.pid}`;
    const session = db.doc(`sessions/${id}`);
    const activeRoleIds = [...recommendedRoleIds(8)];
    const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
    const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'D')[0];
    const originalOpportunityId = `arrival-fleet-1-A-${coordinate}`;
    const opportunityId = `arrival-fleet-2-A-${coordinate}`;
    const missionId = `mission-${opportunityId}`;
    const missionRef = db.doc(`sessions/${id}/serverState/awayMissions/instances/${missionId}`);
    const navigationRef = db.doc(`sessions/${id}/serverState/navigation`);
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    const allCards = missionDeck();
    const prefix = ['A♥', '4♥', '10♦', 'A♦', '9♣', '10♣', '10♥', '9♥'];
    const deck = missionDeckStateFromCards([...prefix.map(cardId => allCards.find(card => card.id === cardId)),
      ...allCards.filter(card => !prefix.includes(card.id))]);
    try {
      const batch = db.batch();
      batch.set(session, { phase: 'active', currentTurn: 2, setupRevision: 1, playerCount: 8,
        expansion: 'base', turnLimit: 6, chartId: 'A', chartSelectionLocked: true,
        dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false, wolfCultEnabled: false,
        activeRoleIds, activeVesselIds, shipResources: { aegis: { food: 20, water: 20, fuel: 10, ore: 0, materials: 10, securityTeams: 9 } },
        shipSurvivors: { aegis: 2500 },
        shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: now },
          { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: now }],
        shuttleControl: {
          starlight: { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'alice', holderUid: 'alice', revision: 0 },
          highwall: { shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: 'bob', holderUid: 'bob', revision: 0 },
        }, retainedShuttles: {},
        turnPhase: { turn: 2, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
          airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
        turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3, startedAt: now, endsAt: end } });
      const initialCoordinates = Object.fromEntries(activeVesselIds.map(ship => [ship, ship === 'refinery-124' ? '0000' : coordinate]));
      batch.set(navigationRef, { revision: 4, shipGalacticCoordinates: initialCoordinates,
        shipNavigationLogs: Object.fromEntries(activeVesselIds.map(ship => [ship, []])), pursuitGroups: { 'fleet-1': 0 } });
      batch.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['refinery-124', ...activeVesselIds.filter(ship => ship !== 'refinery-124')], memberUids: ['gm', 'alice', 'bob'] });
      for (const [uid, role, assignedRoleId] of [['gm', 'gm', null], ['alice', 'player', 'wing-commander'], ['bob', 'player', 'icebreaker-miner']]) {
        batch.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role, connected: true, fleetGroupId: 'fleet-1', assignedRoleId });
      }
      batch.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid: 'gm', connected: true, lastSeenAt: now });
      batch.set(db.doc(`sessions/${id}/gmInstances/bridge/private/shipConsoleWriteGrant`), {
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge', uid: 'gm', shipId: 'aegis', grantedAt: now });
      batch.set(db.doc(`sessions/${id}/craftOwnership/manifest`), roleOwnedCraftManifestForSetup(activeRoleIds, 'none'));
      batch.set(db.doc(`sessions/${id}/serverState/missionDeck`), { ...deck, dealtCount: 0 });
      batch.set(db.doc(`sessions/${id}/missionOpportunities/${originalOpportunityId}`), { type: 'mission-opportunity', status: 'available',
        sessionId: id, id: originalOpportunityId, groupId: 'fleet-1', chart: 'A', coordinate, siteCode: 'D',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-source-arrival', sourceCycle: 2 });
      await batch.commit();
      const split = request('gm', { sessionId: id, instanceId: 'bridge', requestId: 'split-before-mission', expectedNavigationRevision: 4 });
      await confirmFleetPartition.run(split);
      assert.equal((await db.doc(`sessions/${id}/missionOpportunities/${originalOpportunityId}`).get()).exists, false);
      assert.equal((await db.doc(`sessions/${id}/missionOpportunities/${opportunityId}`).get()).get('sourceTransitionId'), 'jump-source-arrival');
      assert.equal((await db.doc(`sessions/${id}/players/alice`).get()).get('fleetGroupId'), 'fleet-2');
      assert.equal((await db.doc(`sessions/${id}/players/bob`).get()).get('fleetGroupId'), 'fleet-2');
      const deal = request('gm', { sessionId: id, instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 1,
        expectedPhaseRevision: 3, expectedCycle: 2, opportunityId, groupId: 'fleet-2', chart: 'A', coordinate,
        sourceCycle: 2, missionLeaderUid: 'alice', participantUids: ['alice', 'bob'] });
      const dealt = await Promise.all([dealPrivateInitialCards.run(deal), dealPrivateInitialCards.run(deal)]);
      assert.deepEqual(new Set(dealt.map(reply => reply.status)), new Set(['committed', 'replayed']));
      assert.equal((await db.doc(`sessions/${id}/serverState/missionDeck`).get()).get('dealtCount'), 2);
      for (const uid of ['alice', 'bob']) {
        const hand = (await db.doc(`sessions/${id}/awayMissionHands/${awayMissionHandId(missionId, uid)}`).get()).data();
        const pointer = (await db.doc(`sessions/${id}/awayMissionHandPointers/${awayMissionHandId(missionId, uid)}`).get()).data();
        assert.equal(hand.lifecyclePrivateState.participantUid, uid);
        assert.equal(hand.lifecyclePrivateState.cards.length, 1);
        assert.equal(pointer.lifecyclePublicState.phase, 'awaiting-card-selection');
        assert.doesNotMatch(JSON.stringify(pointer.lifecyclePublicState), /cardId|A♥|4♥/);
      }
      assert.deepEqual((await session.get()).get('missionCraftCommitments'), {
        starlight: { missionId, sourceCycle: 2 }, highwall: { missionId, sourceCycle: 2 } });
      await assert.rejects(jumpShip.run(request('gm', { sessionId: id, instanceId: 'bridge', requestId: 'held-host', shipId: 'aegis', destination: '5143' })), /committed.*away mission/i);
      const send = async (uid, type, fields = {}) => {
        const revision = (await missionRef.get()).get('revision');
        return commitAwayMissionLifecycleCommand.run(request(uid, { sessionId: id, missionId, requestId: `${type}-${revision}`,
          expectedRevision: revision, type, ...fields, ...(uid === 'gm' ? { instanceId: 'bridge' } : {}) }));
      };
      await send('bob', 'requestExtraCards', { count: 2 });
      await send('alice', 'requestExtraCards', { count: 2 });
      await send('alice', 'distributeExtraCard', { participantUid: 'bob', opportunityId: 'D-3' });
      await send('alice', 'distributeExtraCard', { participantUid: 'alice', opportunityId: 'D-3' });
      await send('alice', 'distributeExtraCard', { participantUid: 'bob', opportunityId: 'D-1' });
      await send('alice', 'distributeExtraCard', { participantUid: 'alice', opportunityId: 'D-1' });
      await send('gm', 'openDiscards');
      await send('alice', 'discardCard', { cardId: 'A♥' });
      await send('bob', 'discardCard', { cardId: '4♥' });
      await send('alice', 'assignCards', { placements: [{ cardId: 'A♦', opportunityId: 'D-3' }, { cardId: '10♣', opportunityId: 'D-1' }] });
      await send('bob', 'assignCards', { placements: [{ cardId: '10♦', opportunityId: 'D-3' }, { cardId: '9♣', opportunityId: 'D-1' }] });
      const resolved = (await missionRef.get()).get('lifecycleRecord');
      assert.equal(resolved.status, 'resolved');
      assert.equal(resolved.rewards.find(reward => reward.opportunityId === 'D-1').branch, 'critical');
      const revision = (await missionRef.get()).get('revision');
      const explore = request('gm', { sessionId: id, missionId, instanceId: 'bridge', type: 'exploreSystems',
        requestId: 'explore-once', expectedRevision: revision, opportunityId: 'D-3', targetCoordinates: ['4454', '5143'] });
      await assert.rejects(commitAwayMissionLifecycleCommand.run({ ...explore, auth: request('alice', {}).auth }), /facilitator/i);
      const explorationReplies = await Promise.all([commitAwayMissionLifecycleCommand.run(explore), commitAwayMissionLifecycleCommand.run(explore)]);
      assert.deepEqual(new Set(explorationReplies.map(reply => reply.status)), new Set(['committed', 'replayed']));
      const nav = (await navigationRef.get()).data();
      assert.deepEqual(nav.missionExploredCoordinatesByUid, { alice: ['4454', '5143'], bob: ['4454', '5143'] });
      assert.equal(nav.revision, 6);
      assert.deepEqual(nav.shipGalacticCoordinates, initialCoordinates);
      assert.deepEqual((await session.get()).get('missionCraftCommitments'), {
        starlight: { missionId, sourceCycle: 2 }, highwall: { missionId, sourceCycle: 2 } });
      const movementAfterResolution = request('gm', { sessionId: id, instanceId: 'bridge',
        requestId: 'host-movement-after-resolution', shipId: 'aegis', destination: '0000' });
      await assert.rejects(moveShipToLocation.run(movementAfterResolution), /committed.*away mission/i);
      await assert.rejects(moveShipToLocation.run(movementAfterResolution), /committed.*away mission/i);
      assert.equal((await navigationRef.get()).get('shipGalacticCoordinates.aegis'), initialCoordinates.aegis);
      const deliveryRevision = (await missionRef.get()).get('revision');
      const delivery = request('alice', { sessionId: id, missionId, type: 'dropOff', requestId: 'deliver-once',
        expectedRevision: deliveryRevision, shipId: 'aegis' });
      const deliveries = await Promise.all([commitAwayMissionLifecycleCommand.run(delivery), commitAwayMissionLifecycleCommand.run(delivery)]);
      assert.deepEqual(new Set(deliveries.map(reply => reply.status)), new Set(['committed', 'replayed']));
      assert.equal((await session.get()).get('shipResources.aegis.food'), 30);
      assert.equal((await session.get()).get('shipResources.aegis.water'), 28);
      assert.deepEqual((await session.get()).get('missionCraftCommitments'), {});
      assert.equal((await missionRef.get()).get('status'), 'complete');
      assert.equal((await db.doc(`sessions/${id}/serverState/missionRewardDeliveries/receipts/${missionId}`).get()).exists, true);
      const releasedMoves = await Promise.all([
        moveShipToLocation.run(movementAfterResolution), moveShipToLocation.run(movementAfterResolution),
      ]);
      assert.deepEqual(releasedMoves[0], releasedMoves[1]);
      assert.equal((await navigationRef.get()).get('shipGalacticCoordinates.aegis'), '0000');
    } finally { await db.recursiveDelete(session); }
  });
}
