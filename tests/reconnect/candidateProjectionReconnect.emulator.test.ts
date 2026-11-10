// L2.3 (#245): after a reconnect, an entitled fleet member's candidate reveal
// projection (main's candidate outcome surface) is replaced by the current
// server state, and the committed reveal is not repeated. Candidate
// contribution actions are not on main; they belong to PC10.5-PC10.6.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doc, getDoc, getDocFromServer, Timestamp, writeBatch } from 'firebase/firestore';
import { subscribeSessionState } from '@/lib/firestore';
import type { PlayerDiscoveryProjection } from '@/types/game';
import {
  asFixture, callAs, clientFor, closeHarness, memberGoesOffline, memberReconnects,
  Recorder, signInMember, signUpActor, until, type Actor,
} from './projectionReconnectHarness';

const sessionId = `pc10-3-candidate-${process.pid}`;
const path = `sessions/${sessionId}`;
let wingUid: string;
let gm: Actor;
let scientist: Actor;
let explorer: Actor;

const fixtureRead = (documentPath: string) => asFixture(async (firestore) => (await getDoc(doc(firestore, documentPath))).data());

beforeAll(async () => {
  wingUid = await signInMember();
  [gm, scientist, explorer] = await Promise.all([signUpActor(), signUpActor(), signUpActor()]);
  const now = Date.now();
  const member = (uid: string, role: string, group: string, roleId: string) => ({ uid, sessionId, role, connected: true,
    lastSeenAt: Timestamp.now(), fleetGroupId: group, assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId });
  await asFixture(async (firestore) => {
    const seed = writeBatch(firestore);
    seed.set(doc(firestore, path), { phase: 'active', currentTurn: 4, chartId: 'A', chartSelectionLocked: true,
      activeRoleIds: ['wing-commander', 'shepherd-scientist', 'quellon-explorer'],
      activeVesselIds: ['aegis', 'shepherd', 'quellon'],
      turnPhase: { turn: 4, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
      shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: new Date(now).toISOString() }],
      shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
        ownerUid: scientist.uid, holderUid: scientist.uid, revision: 3 } },
      shuttleFuelled: { endeavour: false } });
    seed.set(doc(firestore, `${path}/players/${gm.uid}`), member(gm.uid, 'gm', 'fleet-1', 'admiral'));
    seed.set(doc(firestore, `${path}/gmInstances/gm-browser`), { uid: gm.uid, connected: true, lastSeenAt: now });
    seed.set(doc(firestore, `${path}/players/${scientist.uid}`), member(scientist.uid, 'player', 'fleet-1', 'shepherd-scientist'));
    seed.set(doc(firestore, `${path}/players/${wingUid}`), member(wingUid, 'player', 'fleet-1', 'wing-commander'));
    seed.set(doc(firestore, `${path}/players/${explorer.uid}`), member(explorer.uid, 'player', 'fleet-2', 'quellon-explorer'));
    seed.set(doc(firestore, `${path}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis', 'shepherd'],
      memberUids: [gm.uid, scientist.uid, wingUid] });
    seed.set(doc(firestore, `${path}/fleetGroups/fleet-2`), { id: 'fleet-2', vesselIds: ['quellon'], memberUids: [explorer.uid] });
    seed.set(doc(firestore, `${path}/serverState/navigation`), { revision: 5,
      shipGalacticCoordinates: { aegis: '0000', shepherd: '0000', quellon: '1413' },
      shipNavigationLogs: { aegis: [], shepherd: [], quellon: [] }, pursuitGroups: { 'fleet-1': 2, 'fleet-2': 4 } });
    // A current, pre-reveal member projection exists before the member goes away.
    seed.set(doc(firestore, `${path}/playerDiscoveries/${wingUid}`), { groupId: 'fleet-1',
      fleetGroupVesselIds: ['aegis', 'shepherd'], shipId: 'aegis', currentCoordinate: '0000',
      knownCoordinates: ['0000'], knownSystems: {}, pursuitDistance: 2, navigationLogs: [], revision: 5 });
    await seed.commit();
  });
});

afterAll(closeHarness);

describe('L2.3 candidate projection reconnect', () => {
  it('replaces the cached candidate projection with the current server reveal and does not repeat the committed reveal', async () => {
    const discoveries = new Recorder<PlayerDiscoveryProjection | null>();
    const errors: string[] = [];
    const stop = subscribeSessionState(sessionId, wingUid, {
      sessionReadAudience: 'member',
      onSession: () => undefined,
      onPlayer: () => undefined,
      onKicked: () => errors.push('kicked'),
      onSeats: () => undefined,
      onPlayerDiscovery: discoveries.push,
      onError: () => errors.push('error'),
    });
    try {
      await discoveries.next((projection) => projection?.revision === 5, 'pre-reveal member projection');
      expect(discoveries.events.find((projection) => projection?.revision === 5)?.candidateReveals).toBeUndefined();

      await memberGoesOffline();
      const offlineAt = discoveries.events.length;
      await discoveries.next((projection) => projection === null, 'cached projection withdrawn while offline', offlineAt);

      // The Shepherd Scientist scouts the candidate while the Wing Commander is
      // away; the server's committed-scout continuation resolves it.
      const scoutRequest = { sessionId, requestId: 'scan-1', entitlementId: 'endeavour', targetCoordinate: '0408' };
      const requested = await callAs(scientist, 'requestScout', scoutRequest);
      expect(requested).toMatchObject({ ok: true, result: { status: 'requested' } });
      const navigation = await until(() => fixtureRead(`${path}/serverState/navigation`),
        (value) => value?.revision === 6, 'navigation advanced');
      await until(() => fixtureRead(`${path}/playerDiscoveries/${wingUid}`),
        (value) => Array.isArray(value?.candidateReveals) && value.candidateReveals.length === 1, 'member reveal stored');
      expect(discoveries.events.slice(offlineAt).every((projection) => !projection?.candidateReveals?.length)).toBe(true);

      await memberReconnects();
      const current = await discoveries.next((projection) => projection?.candidateReveals?.length === 1,
        'current reveal after reconnect', offlineAt);
      expect(discoveries.events[current]).toMatchObject({ groupId: 'fleet-1',
        candidateReveals: [{ code: 'O', title: 'Deep Nebula' }] });
      expect(JSON.stringify(discoveries.events[current])).not.toMatch(/organiserSites|accruedBonus|chartId/);

      // The committed scout and its reveal are replayed, not repeated.
      expect(await callAs(scientist, 'requestScout', scoutRequest))
        .toEqual({ ok: true, result: { ...(requested.ok ? requested.result : {}), status: 'replayed' } });
      expect(await callAs(gm, 'resolvePendingScoutRequest', { sessionId, requestId: 'scan-1', instanceId: 'gm-browser' }))
        .toMatchObject({ ok: true, result: { status: 'replayed' } });
      expect(await fixtureRead(`${path}/serverState/navigation`)).toEqual(navigation);
      expect(errors).toEqual([]);
    } finally {
      stop();
    }
  });

  it('keeps the reveal away from the other fleet group and the private scout result away from the member', async () => {
    const foreign = await getDocFromServer(doc(await clientFor(explorer.uid), `${path}/playerDiscoveries/${explorer.uid}`));
    expect(foreign.data()?.candidateReveals ?? []).toEqual([]);
    await expect(getDocFromServer(doc(await clientFor(explorer.uid), `${path}/playerDiscoveries/${wingUid}`)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callAs(explorer, 'readPrivateScoutResult', { sessionId, requestId: 'scan-1' }))
      .resolves.toMatchObject({ ok: false, status: 'PERMISSION_DENIED' });
  });
});
