// L2.1 (#243): after a reconnect, the original participant's mission workspace
// projection shows the current mission state and their private result, never a
// cached hand, and their committed assignment stays locked.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collection, doc, getDoc, getDocFromServer, getDocsFromServer, query, where, writeBatch } from 'firebase/firestore';
import {
  subscribeToOwnAwayMissionLifecycles,
  type AwayMissionLifecycleFeedState,
} from '@/lib/awayMissionLifecycleService';
import { awayMissionHandId } from '../../functions/src/awayMissionCards';
import { roleOwnedCraftManifestForSetup } from '../../functions/src/craftOwnership';
import { activeVesselIdsForRoles } from '../../functions/src/gameSetup';
import { missionDeck, missionDeckStateFromCards } from '../../functions/src/missionDeck';
import { recommendedRoleIds } from '../../functions/src/roleConfiguration';
import { organiserSitesForChart } from '../../functions/src/starChartLookup';
import {
  asFixture, callAs, callAsMember, clientFor, closeHarness, memberGoesOffline, memberReconnects,
  Recorder, signInMember, signUpActor, type Actor, type CallOutcome,
} from './projectionReconnectHarness';

const sessionId = `pc10-3-mission-${process.pid}`;
const path = `sessions/${sessionId}`;
const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'A')![0];
const opportunityId = `arrival-fleet-1-A-${coordinate}`;
const missionId = `mission-${opportunityId}`;
const missionPath = `${path}/serverState/awayMissions/instances/${missionId}`;
let wingUid: string;
let gm: Actor;
let miner: Actor;

const missionRevision = () => asFixture(async (firestore) =>
  (await getDoc(doc(firestore, missionPath))).get('revision') as number);
const lifecycle = (type: string, requestId: string, expectedRevision: number, fields: Record<string, unknown> = {}) =>
  ({ sessionId, missionId, requestId, expectedRevision, type, ...fields });
const committed = (outcome: CallOutcome, label: string) => {
  if (!outcome.ok) throw new Error(`${label}: ${outcome.status} ${outcome.message}`);
  return outcome.result;
};
async function send(actor: Actor | 'wing', type: string, fields: Record<string, unknown> = {}) {
  const revision = await missionRevision();
  const data = lifecycle(type, `${type}-${revision}`, revision, { ...fields, ...(actor !== 'wing' && actor === gm ? { instanceId: 'bridge' } : {}) });
  return committed(actor === 'wing' ? await callAsMember('commitAwayMissionLifecycleCommand', data)
    : await callAs(actor, 'commitAwayMissionLifecycleCommand', data), type);
}

beforeAll(async () => {
  wingUid = await signInMember();
  [gm, miner] = await Promise.all([signUpActor(), signUpActor()]);
  const activeRoleIds = [...recommendedRoleIds(8)];
  const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
  const now = new Date().toISOString();
  const end = new Date(Date.now() + 20 * 60_000).toISOString();
  const allCards = missionDeck();
  const prefix = ['A♥', '4♥', '10♦'];
  const deck = missionDeckStateFromCards([...prefix.map((cardId) => allCards.find((card) => card.id === cardId)!),
    ...allCards.filter((card) => !prefix.includes(card.id))]);
  await asFixture(async (firestore) => {
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, path), { phase: 'active', currentTurn: 2, setupRevision: 1, playerCount: 8,
      expansion: 'base', turnLimit: 6, chartId: 'A', chartSelectionLocked: true,
      dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false, wolfCultEnabled: false,
      activeRoleIds, activeVesselIds,
      shipResources: { aegis: { food: 20, water: 20, fuel: 10, ore: 0, materials: 10, securityTeams: 9 } },
      shipSurvivors: { aegis: 2500 },
      shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: now },
        { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: now }],
      shuttleControl: {
        starlight: { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: wingUid, holderUid: wingUid, revision: 0 },
        highwall: { shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: miner.uid, holderUid: miner.uid, revision: 0 },
      }, retainedShuttles: {},
      turnPhase: { turn: 2, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
        airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
      turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3, startedAt: now, endsAt: end } });
    batch.set(doc(firestore, `${path}/serverState/navigation`), { revision: 4,
      shipGalacticCoordinates: Object.fromEntries(activeVesselIds.map((ship) => [ship, ship === 'refinery-124' ? '0000' : coordinate])),
      shipNavigationLogs: Object.fromEntries(activeVesselIds.map((ship) => [ship, []])), pursuitGroups: { 'fleet-1': 0 } });
    batch.set(doc(firestore, `${path}/fleetGroups/fleet-1`), { id: 'fleet-1',
      vesselIds: ['refinery-124', ...activeVesselIds.filter((ship) => ship !== 'refinery-124')],
      memberUids: [gm.uid, wingUid, miner.uid] });
    for (const [uid, role, assignedRoleId] of [[gm.uid, 'gm', null], [wingUid, 'player', 'wing-commander'],
      [miner.uid, 'player', 'icebreaker-miner']] as const) {
      batch.set(doc(firestore, `${path}/players/${uid}`), { uid, sessionId, role, connected: true, fleetGroupId: 'fleet-1', assignedRoleId });
    }
    batch.set(doc(firestore, `${path}/gmInstances/bridge`), { uid: gm.uid, connected: true, lastSeenAt: now });
    batch.set(doc(firestore, `${path}/craftOwnership/manifest`), roleOwnedCraftManifestForSetup(activeRoleIds, 'none'));
    batch.set(doc(firestore, `${path}/serverState/missionDeck`), { ...deck, dealtCount: 0 });
    batch.set(doc(firestore, `${path}/missionOpportunities/${opportunityId}`), { type: 'mission-opportunity', status: 'available',
      sessionId, id: opportunityId, groupId: 'fleet-1', chart: 'A', coordinate, siteCode: 'A',
      sourceShipId: 'aegis', sourceTransitionId: 'jump-source-arrival', sourceCycle: 2 });
    await batch.commit();
  });
  committed(await callAs(gm, 'dealPrivateInitialCards', { sessionId, instanceId: 'bridge', requestId: 'start-wing',
    expectedSetupRevision: 1, expectedPhaseRevision: 3, expectedCycle: 2, opportunityId, groupId: 'fleet-1',
    chart: 'A', coordinate, sourceCycle: 2, missionLeaderUid: wingUid, participantUids: [wingUid, miner.uid] }), 'deal');
  await send('wing', 'requestExtraCards', { count: 1 });
  await send('wing', 'distributeExtraCard', { participantUid: wingUid, opportunityId: 'A-1' });
  await send(gm, 'openDiscards');
  await send(miner, 'discardCard', { cardId: '4♥' });
  await send('wing', 'discardCard', { cardId: 'A♥' });
});

afterAll(closeHarness);

describe('L2.1 mission projection reconnect', () => {
  it('replaces the cached hand with the current resolved mission and private result, and keeps the committed assignment locked', async () => {
    const feed = new Recorder<AwayMissionLifecycleFeedState>();
    const stop = subscribeToOwnAwayMissionLifecycles(sessionId, wingUid, feed.push);
    try {
      const assignmentRevision = await missionRevision();
      await feed.next((state) => state.status === 'ready' && state.missions[0]?.privateState.revision === assignmentRevision,
        'current assignment workspace');

      // The Wing Commander commits a card; the mission waits for the miner.
      const wingAssignment = lifecycle('assignCards', 'wing-assignment', assignmentRevision,
        { placements: [{ cardId: '10♦', opportunityId: 'A-1' }] });
      const firstReply = committed(await callAsMember('commitAwayMissionLifecycleCommand', wingAssignment), 'wing assignment');
      expect(firstReply.status).toBe('committed');
      const committedRevision = firstReply.revision as number;
      await feed.next((state) => state.status === 'ready' && state.missions[0]?.privateState.revision === committedRevision &&
        state.missions[0]?.privateState.assignmentCommitted === true, 'committed assignment projected');

      await memberGoesOffline();
      const offlineAt = feed.events.length;
      await feed.next((state) => state.status === 'stale' && state.missions.length === 0,
        'cached workspace withdrawn while offline', offlineAt);

      // The mission resolves while the Wing Commander is away.
      await send(miner, 'assignCards', { placements: [] });
      const resolvedRevision = await missionRevision();
      expect(resolvedRevision).toBeGreaterThan(committedRevision);
      expect(feed.events.slice(offlineAt).every((state) => state.missions.length === 0)).toBe(true);

      await memberReconnects();
      const current = await feed.next((state) => state.status === 'ready' &&
        state.missions[0]?.publicState.revision === resolvedRevision, 'resolved mission after reconnect', offlineAt);
      // No cached, pre-resolution hand is republished on the way back.
      expect(feed.events.slice(offlineAt, current).every((state) => state.missions.length === 0)).toBe(true);
      const mission = feed.events[current]?.missions[0];
      if (!mission) throw new Error('The resolved mission projection is missing.');
      expect(mission.publicState.phase).toBe('resolved');
      expect(mission.privateState).toMatchObject({ participantUid: wingUid, phase: 'resolved', revision: resolvedRevision,
        assignmentCommitted: true });
      expect(mission.privateState.cards.find((card) => card.id === '10♦'))
        .toEqual({ id: '10♦', value: 10, status: 'assigned', opportunityId: 'A-1' });
      const result = mission.publicState.outcomes?.find((entry) => entry.opportunityId === 'A-1');
      expect(result).toMatchObject({ opportunityId: 'A-1', contributorCount: 1, bonusTotal: 3, difficulty: 17 });

      // The committed choice cannot be applied again, by retry or by a new request.
      const replay = committed(await callAsMember('commitAwayMissionLifecycleCommand', wingAssignment), 'exact retry');
      expect(replay.status).toBe('replayed');
      const again = await callAsMember('commitAwayMissionLifecycleCommand', lifecycle('assignCards', 'wing-assignment-again',
        resolvedRevision, { placements: [{ cardId: '10♦', opportunityId: 'A-1' }] }));
      expect(again).toMatchObject({ ok: false, status: 'FAILED_PRECONDITION' });
      expect(await missionRevision()).toBe(resolvedRevision);
    } finally {
      stop();
    }
  });

  it('keeps the Wing Commander’s private hand and pointer away from another participant', async () => {
    const handId = awayMissionHandId(missionId, wingUid);
    const minerClient = await clientFor(miner.uid);
    await expect(getDocFromServer(doc(minerClient, `${path}/awayMissionHands/${handId}`)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDocFromServer(doc(minerClient, `${path}/awayMissionHandPointers/${handId}`)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    const ownPointers = await getDocsFromServer(query(collection(minerClient, `${path}/awayMissionHandPointers`),
      where('sessionId', '==', sessionId), where('participantUid', '==', miner.uid)));
    expect(ownPointers.docs.map((entry) => entry.id)).toEqual([awayMissionHandId(missionId, miner.uid)]);
    expect(JSON.stringify(ownPointers.docs.map((entry) => entry.data()))).not.toMatch(/10♦|A♥/);
  });
});
