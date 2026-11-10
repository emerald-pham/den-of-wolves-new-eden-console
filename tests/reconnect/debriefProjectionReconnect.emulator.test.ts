// L2.4 (#246): a member who returns after the facilitator ends the final cycle
// receives the current debrief state, not the cached active game, and cannot
// regain gameplay actions. Main's resumeSession rejects a closed session;
// reading closed history belongs to E2 (PC10.5) and is not covered here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doc, getDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { subscribeSessionState } from '@/lib/firestore';
import type { GameSession } from '@/types/game';
import {
  asFixture, callAs, callAsMember, closeHarness, memberGoesOffline, memberReconnects,
  Recorder, signInMember, signUpActor, until, type Actor,
} from './projectionReconnectHarness';

const sessionId = `pc10-3-debrief-${process.pid}`;
const path = `sessions/${sessionId}`;
let memberUid: string;
let gm: Actor;
let scientist: Actor;

const fixtureRead = (documentPath: string) => asFixture(async (firestore) => (await getDoc(doc(firestore, documentPath))).data());
const scout = (requestId: string) => ({ sessionId, requestId, entitlementId: 'endeavour', targetCoordinate: '0408' });

beforeAll(async () => {
  memberUid = await signInMember();
  [gm, scientist] = await Promise.all([signUpActor(), signUpActor()]);
  const member = (uid: string, role: string, roleId: string) => ({ uid, sessionId, role, connected: true,
    lastSeenAt: Timestamp.now(), fleetGroupId: 'fleet-1', assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId });
  await asFixture(async (firestore) => {
    const seed = writeBatch(firestore);
    seed.set(doc(firestore, path), { phase: 'active', currentTurn: 6, turnLimit: 6, chartId: 'A', chartSelectionLocked: true,
      activeRoleIds: ['wing-commander', 'shepherd-scientist'], activeVesselIds: ['aegis', 'shepherd'],
      turnPhase: { turn: 6, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z', openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
      shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: new Date().toISOString() }],
      shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
        ownerUid: scientist.uid, holderUid: scientist.uid, revision: 3 } },
      shuttleFuelled: { endeavour: false } });
    seed.set(doc(firestore, `${path}/players/${gm.uid}`), member(gm.uid, 'gm', 'admiral'));
    seed.set(doc(firestore, `${path}/gmInstances/gm-browser`), { uid: gm.uid, connected: true, lastSeenAt: Date.now() });
    seed.set(doc(firestore, `${path}/players/${memberUid}`), member(memberUid, 'player', 'wing-commander'));
    seed.set(doc(firestore, `${path}/players/${scientist.uid}`), member(scientist.uid, 'player', 'shepherd-scientist'));
    seed.set(doc(firestore, `${path}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis', 'shepherd'],
      memberUids: [gm.uid, memberUid, scientist.uid] });
    seed.set(doc(firestore, `${path}/serverState/navigation`), { revision: 5,
      shipGalacticCoordinates: { aegis: '0000', shepherd: '0000' },
      shipNavigationLogs: { aegis: [], shepherd: [] }, pursuitGroups: { 'fleet-1': 2 } });
    await seed.commit();
  });
});

afterAll(closeHarness);

function listen(sessions: Recorder<GameSession>, errors: string[]) {
  return subscribeSessionState(sessionId, memberUid, {
    sessionReadAudience: 'member',
    onSession: sessions.push,
    onPlayer: () => undefined,
    onKicked: () => errors.push('kicked'),
    onSeats: () => undefined,
    onError: () => errors.push('error'),
  });
}

describe('L2.4 debrief projection reconnect', () => {
  it('replaces the cached active game with the current debrief state and keeps gameplay actions closed', async () => {
    const before = new Recorder<GameSession>();
    const errors: string[] = [];
    const stopBefore = listen(before, errors);
    await before.next((session) => session.phase === 'active' && session.currentTurn === 6, 'active final cycle');
    // The member leaves: the transport drops and the app's listener stops.
    await memberGoesOffline();
    stopBefore();

    // While they are away, the facilitator opens finale mode and ends the final cycle.
    expect(await callAs(gm, 'setDebriefMode', { sessionId, instanceId: 'gm-browser', active: true }))
      .toMatchObject({ ok: true, result: { debriefMode: { active: true, revision: 1 } } });
    const advanced = await callAs(gm, 'advanceTurn', { sessionId, instanceId: 'gm-browser', requestId: 'final-advance',
      expectedTurn: 6, overridePhaseTimer: true });
    expect(advanced).toMatchObject({ ok: true, result: { phase: 'debrief', currentTurn: 6 } });
    await until(() => fixtureRead(path), (value) => value?.phase === 'debrief', 'server debrief phase');

    await memberReconnects();
    const after = new Recorder<GameSession>();
    const stopAfter = listen(after, errors);
    try {
      const first = await after.next(() => true, 'first session after reconnect');
      // The first projection the returning member receives is already the debrief.
      expect(after.events[first]).toMatchObject({ phase: 'debrief', currentTurn: 6, debriefMode: { active: true, revision: 1 } });
      expect(after.events.every((session) => session.phase === 'debrief')).toBe(true);
      expect(errors).toEqual([]);

      // Gameplay actions stay closed for the returning member and for other players.
      const gameplayClosed = { ok: false, status: 'FAILED_PRECONDITION',
        message: expect.stringMatching(/^Scouting requests require active gameplay\./) };
      expect(await callAsMember('requestScout', scout('member-after-debrief'))).toMatchObject(gameplayClosed);
      // Even the entitled Endeavour owner cannot scout once the game is in debrief.
      expect(await callAs(scientist, 'requestScout', scout('scientist-after-debrief'))).toMatchObject(gameplayClosed);
      // Exact replay of the final advance returns the stored result and does not advance again.
      expect(await callAs(gm, 'advanceTurn', { sessionId, instanceId: 'gm-browser', requestId: 'final-advance',
        expectedTurn: 6, overridePhaseTimer: true })).toEqual(advanced);
      expect(await callAs(gm, 'advanceTurn', { sessionId, instanceId: 'gm-browser', requestId: 'advance-again',
        expectedTurn: 6, overridePhaseTimer: true })).toMatchObject({ ok: false });
      expect(await fixtureRead(path)).toMatchObject({ phase: 'debrief', currentTurn: 6 });
    } finally {
      stopAfter();
    }
  });

  it('rejects resuming a closed session (closed-history reads are E2, not on main)', async () => {
    await asFixture((firestore) => updateDoc(doc(firestore, path), { phase: 'closed' }));
    expect(await callAsMember('resumeSession', { sessionId }))
      .toMatchObject({ ok: false, status: 'FAILED_PRECONDITION', message: expect.stringMatching(/^That session has closed\./) });
    expect(await callAs(gm, 'setDebriefMode', { sessionId, instanceId: 'gm-browser', active: false }))
      .toMatchObject({ ok: false, status: 'FAILED_PRECONDITION' });
  });
});
