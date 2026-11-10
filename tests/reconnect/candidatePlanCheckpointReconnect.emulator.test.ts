// L2.3 (#245), facilitator half: main's Cycle 6 candidate plan checkpoint. A
// facilitator device that reconnects after the checkpoint changed elsewhere
// shows the current checkpoint, and replaying its own earlier choice does not
// reapply it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doc, getDoc, getDocFromServer, Timestamp, writeBatch } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { subscribeSessionState, type GmDiscoveryProjection } from '@/lib/firestore';
import {
  asFixture, callAs, callAsMember, clientFor, closeHarness, memberGoesOffline, memberReconnects,
  Recorder, signInMember, signUpActor, until, type Actor,
} from './projectionReconnectHarness';

const sessionId = `pc10-3-plan-${process.pid}`;
const path = `sessions/${sessionId}`;
let gmUid: string;
let player: Actor;

const fixtureRead = (documentPath: string) => asFixture(async (firestore) => (await getDoc(doc(firestore, documentPath))).data());
const checkpoint = (instanceId: string, requestId: string, planExists: boolean) =>
  ({ sessionId, instanceId, requestId, planExists });

beforeAll(async () => {
  gmUid = await signInMember();
  player = await signUpActor();
  const member = (uid: string, role: string, roleId: string) => ({ uid, sessionId, role, connected: true,
    lastSeenAt: Timestamp.now(), fleetGroupId: 'fleet-1', assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId });
  await asFixture(async (firestore) => {
    const seed = writeBatch(firestore);
    seed.set(doc(firestore, path), { phase: 'active', currentTurn: 6, turnLimit: 6, chartId: 'A', chartSelectionLocked: true,
      activeRoleIds: ['wing-commander'], activeVesselIds: ['aegis'],
      turnPhase: { turn: 6, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: true } } });
    seed.set(doc(firestore, `${path}/players/${gmUid}`), member(gmUid, 'gm', 'admiral'));
    seed.set(doc(firestore, `${path}/players/${player.uid}`), member(player.uid, 'player', 'wing-commander'));
    // One facilitator with two devices.
    for (const instanceId of ['gm-laptop', 'gm-tablet']) {
      seed.set(doc(firestore, `${path}/gmInstances/${instanceId}`), { uid: gmUid, connected: true, lastSeenAt: Timestamp.now() });
    }
    seed.set(doc(firestore, `${path}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis'], memberUids: [gmUid, player.uid] });
    seed.set(doc(firestore, `${path}/serverState/navigation`), { revision: 5, shipGalacticCoordinates: { aegis: '0000' },
      shipNavigationLogs: { aegis: [] }, pursuitGroups: { 'fleet-1': 2 } });
    await seed.commit();
  });
});

afterAll(closeHarness);

describe('L2.3 candidate plan checkpoint reconnect', () => {
  it('replaces the cached checkpoint with the current server checkpoint and does not reapply a replayed choice', async () => {
    const discoveries = new Recorder<GmDiscoveryProjection | null>();
    const errors: string[] = [];
    const stop = subscribeSessionState(sessionId, gmUid, {
      sessionReadAudience: 'gm',
      onSession: () => undefined,
      onPlayer: () => undefined,
      onKicked: () => errors.push('kicked'),
      onSeats: () => undefined,
      onGmDiscovery: discoveries.push,
      onError: () => errors.push('error'),
    });
    try {
      // The laptop records that a plan exists and sees it.
      const laptopChoice = checkpoint('gm-laptop', 'plan-from-laptop', true);
      const recorded = await callAsMember('setCandidatePlanCheckpoint', laptopChoice);
      expect(recorded).toMatchObject({ ok: true });
      await discoveries.next((projection) => projection?.candidatePlanCheckpoint?.planExists === true, 'laptop checkpoint');

      await memberGoesOffline();
      const offlineAt = discoveries.events.length;
      await discoveries.next((projection) => projection === null, 'cached checkpoint withdrawn while offline', offlineAt);

      // The same facilitator corrects the checkpoint from the tablet.
      const tablet: Actor = { uid: gmUid, idToken: await auth().currentUser!.getIdToken() };
      expect(await callAs(tablet, 'setCandidatePlanCheckpoint', checkpoint('gm-tablet', 'plan-from-tablet', false)))
        .toMatchObject({ ok: true });
      const navigation = await until(() => fixtureRead(`${path}/serverState/navigation`),
        (value) => value?.candidatePlanCheckpoint?.planExists === false, 'server checkpoint corrected');

      await memberReconnects();
      const current = await discoveries.next((projection) => projection?.candidatePlanCheckpoint?.planExists === false,
        'current checkpoint after reconnect', offlineAt);
      expect(discoveries.events.slice(offlineAt, current)
        .every((projection) => projection?.candidatePlanCheckpoint?.planExists !== true)).toBe(true);

      // The laptop's queued exact retry returns its stored receipt and changes nothing.
      const replay = await callAsMember('setCandidatePlanCheckpoint', laptopChoice);
      expect(replay).toEqual(recorded);
      expect(await fixtureRead(`${path}/serverState/navigation`)).toEqual(navigation);
      expect(discoveries.events.at(-1)?.candidatePlanCheckpoint?.planExists).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      stop();
    }
  });

  it('keeps the facilitator checkpoint projection away from players', async () => {
    await expect(getDocFromServer(doc(await clientFor(player.uid), `${path}/gmDiscovery/current`)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(await callAs(player, 'setCandidatePlanCheckpoint', checkpoint('gm-laptop', 'player-forgery', true)))
      .toMatchObject({ ok: false, status: 'PERMISSION_DENIED' });
  });
});
