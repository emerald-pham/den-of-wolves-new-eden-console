// L1.4 (#242) and T2.1 (#252): a member's station is released and claimed by
// another member while they are away. On return the app's own client stack
// (src/lib/sessionService resumeSession/selectConsoleRole against the built
// resumeSession, refreshPresence and claimSeat callables) keeps the membership,
// clears the old station, shows the reselect instruction, and every stale
// former-station action is either an exact replay of its original receipt or
// refused without a write. The jsdom half (chooser, safe draft, outbox) is
// src/routes/StationLossReconnect.route.test.tsx. The facilitator's release
// clears the seat pointer, so resume takes the server's "no seat, unbound
// active console" branch (reconcileReturningSeat) to require reselection.
// Run: node scripts/test-pc10-3-projection-reconnect.emulator.mjs tests/reconnect/stationLossReconnect.emulator.test.ts
// Evidence class: local emulator, compiled callables, local fixture seed; not deployed gameplay.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { recommendedRoleIds } from '../../functions/src/roleConfiguration';
import { activeVesselIdsForRoles } from '../../functions/src/gameSetup';
import { resumeSession, selectConsoleRole } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import {
  asFixture, callAs, callAsMember, closeHarness, memberGoesOffline, memberReconnects, signInMember, signUpActor,
  type Actor, type CallOutcome,
} from './projectionReconnectHarness';

const sessionId = `pc10-3-station-loss-${process.pid}`;
const path = `sessions/${sessionId}`;
const seatId = 'wing-commander';
const NOTICE = 'Your previous station is no longer available. Return to station select and reselect your role.';
let memberUid: string;
let gm: Actor;
let rival: Actor;

const read = (relative: string) => asFixture(async (firestore) => (await getDoc(doc(firestore, `${path}/${relative}`))).data());
const setupRevision = async () => (await read('') ?? {}).setupRevision as number;
// The app's station authority checks read `window.navigator.onLine`. This node
// project has no DOM, so model an online browser only while the app's own
// station-selection code runs, after the Firebase clients already exist.
async function inOnlineBrowser<T>(work: () => Promise<T>): Promise<T> {
  vi.stubGlobal('window', { navigator: { onLine: true } });
  try {
    return await work();
  } finally {
    vi.unstubAllGlobals();
  }
}
/** The app's reconnect: resume through src/lib, then go live as connectAutomatically does on an accepted reply. */
async function appResume(): Promise<void> {
  expect(await resumeSession(sessionId)).toBe(true);
  useSessionStore.getState().setConnection('live');
}
const committed = (outcome: CallOutcome, label: string) => {
  if (!outcome.ok) throw new Error(`${label}: ${outcome.status} ${outcome.message}`);
  return outcome.result;
};

beforeAll(async () => {
  memberUid = await signInMember();
  [gm, rival] = await Promise.all([signUpActor(), signUpActor()]);
  const activeRoleIds = [...recommendedRoleIds(8)];
  const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
  const now = new Date().toISOString();
  await asFixture(async (firestore) => {
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, path), { phase: 'casting', currentTurn: 0, setupRevision: 0, playerCount: 8,
      chartId: 'A', expansion: 'base', turnLimit: 6, dioneEnabled: false, capybaraEnabled: false,
      universalArbourEnabled: false, wolfCultEnabled: false, activeRoleIds, activeVesselIds,
      ownerUid: gm.uid, joinCode: '7301', name: 'PC10.3 station loss', createdAt: now, updatedAt: now });
    for (const roleId of activeRoleIds) {
      batch.set(doc(firestore, `${path}/seats/${roleId}`), { id: roleId, roleId, status: 'open', holderUid: null });
    }
    for (const [uid, role] of [[gm.uid, 'gm'], [memberUid, 'player'], [rival.uid, 'player']] as const) {
      batch.set(doc(firestore, `${path}/players/${uid}`), { uid, sessionId, role, connected: true,
        displayName: 'Local fixture actor', joinedAt: now, seatId: null, assignedRoleId: null });
    }
    batch.set(doc(firestore, `${path}/gmInstances/bridge`), { uid: gm.uid, connected: true, lastSeenAt: now });
    await batch.commit();
  });
});

afterAll(closeHarness);

describe('L1.4 and T2.1 station loss across a reconnect', () => {
  it('returns the member to station selection and refuses every stale former-station action', async () => {
    // The member's tab holds a snapshot; resume through the app replaces it with server authority.
    const store = useSessionStore.getState();
    store.reset();
    store.setIdentity({ id: sessionId } as GameSession, { uid: memberUid, sessionId } as Player);
    await appResume();
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('server');

    // The member claims the Wing Commander seat and opens that station.
    const claim = { sessionId, seatId, requestId: 'member-claim', expectedSetupRevision: await setupRevision() };
    expect(committed(await callAsMember('claimSeat', claim), 'member claim')).toMatchObject({ status: 'committed', holderUid: memberUid });
    await appResume();
    await inOnlineBrowser(() => selectConsoleRole(seatId));
    expect(useSessionStore.getState().me).toMatchObject({ uid: memberUid, seatId, activeConsoleRoleId: seatId });
    expect(await read(`players/${memberUid}`)).toMatchObject({ seatId, activeConsoleRoleId: seatId });

    // While the member is away, the facilitator releases the seat and another member claims it.
    await memberGoesOffline();
    committed(await callAs(gm, 'releaseSeat', { sessionId, seatId, requestId: 'gm-release',
      expectedSetupRevision: await setupRevision(), instanceId: 'bridge', reason: 'Player stepped away' }), 'gm release');
    committed(await callAs(rival, 'claimSeat', { sessionId, seatId, requestId: 'rival-claim',
      expectedSetupRevision: await setupRevision() }), 'rival claim');
    const revisionAfterLoss = await setupRevision();

    // Return: membership kept, old station cleared, reselect instruction shown.
    await memberReconnects();
    await appResume();
    expect(useSessionStore.getState()).toMatchObject({
      session: { id: sessionId },
      me: { uid: memberUid, sessionId, role: 'player', seatId: null, activeConsoleRoleId: null },
      sessionSnapshotFreshness: 'server',
      communicationError: { kind: 'station-selection-required', message: NOTICE },
    });
    expect(await read(`players/${memberUid}`)).toMatchObject({ connected: true, seatId: null, activeConsoleRoleId: null });
    expect(await read(`seats/${seatId}`)).toMatchObject({ status: 'claimed', holderUid: rival.uid });

    // T2.1: an abandoned route reopening the old station sends nothing while the notice is pending.
    await inOnlineBrowser(() => selectConsoleRole(seatId));
    expect(useSessionStore.getState().me?.activeConsoleRoleId).toBeNull();
    expect(await read(`players/${memberUid}`)).toMatchObject({ activeConsoleRoleId: null });

    // The exact original claim replays its receipt only; a fresh claim is refused. Nothing is written.
    expect(committed(await callAsMember('claimSeat', claim), 'exact replay')).toMatchObject({ status: 'replayed', holderUid: memberUid });
    expect(await callAsMember('claimSeat', { ...claim, requestId: 'member-claim-again', expectedSetupRevision: revisionAfterLoss }))
      .toMatchObject({ ok: false, status: 'ABORTED' });
    expect(await setupRevision()).toBe(revisionAfterLoss);
    expect(await read(`seats/${seatId}`)).toMatchObject({ status: 'claimed', holderUid: rival.uid });

    // After the notice is dismissed, a deliberate reselect of the lost station is refused by the
    // server and returns the member to station selection with the same instruction.
    useSessionStore.getState().setCommunicationError(null);
    await expect(inOnlineBrowser(() => selectConsoleRole(seatId))).rejects.toMatchObject({
      code: 'functions/permission-denied', details: { commandError: 'station-selection-required' },
    });
    expect(useSessionStore.getState()).toMatchObject({
      me: { uid: memberUid, seatId: null, activeConsoleRoleId: null },
      communicationError: { kind: 'station-selection-required', message: NOTICE },
    });
    expect(await read(`players/${memberUid}`)).toMatchObject({ seatId: null, activeConsoleRoleId: null });
    expect(await read(`seats/${seatId}`)).toMatchObject({ status: 'claimed', holderUid: rival.uid });
  });
});
