// L2.2 (#244): after a reconnect, the entitled member's attack listener shows
// the current server attack projection, never the cached one, and the combat
// aftermath choice another actor committed while they were offline stays locked.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doc, getDoc, getDocFromServer, setDoc, writeBatch } from 'firebase/firestore';
import { db, subscribeWolfAttackMemberView } from '@/lib/firestore';
import type { WolfAttackMemberView } from '@/types/game';
import {
  asFixture, callAs, canonical, callAsMember, clientFor, closeHarness, memberGoesOffline, memberReconnects,
  Recorder, signInMember, signUpActor, until, type Actor,
} from './projectionReconnectHarness';

const sessionId = `pc10-3-attack-${process.pid}`;
const path = `sessions/${sessionId}`;
let macawUid: string;
let boa: Actor;
let outsider: Actor;

const damage = (target: string, amount: number) => ({ target, amount, populationBefore: 2_500, population: 2_000,
  state: { damagedSystemIds: [], destroyed: false }, draws: Array.from({ length: amount }, () => ({ casualty: false })) });
const resolvedAttack = {
  type: 'wolf-attack-state', status: 'resolved', attackId: 'attack-7', turn: 7, revision: 10, currentStep: 'resolved',
  deadlineAt: '2026-11-05T10:00:00.000Z', memberResults: [],
  calculationReceipt: {
    type: 'wolf-combat-calculation', version: 1, requestId: 'final-attack-7',
    phase: { turn: 7, phase: 'coordination', serverTime: '2026-11-05T09:59:00.000Z',
      deadlineAt: '2026-11-05T10:00:00.000Z', overrun: false },
    targeting: {}, ranges: [], boarding: [], fleetDamage: [damage('aegis', 3)],
    forceField: { status: 'unavailable', preventedDamage: 0 }, returningInstanceIds: [], survivingWolfShips: [],
  },
};
const declaredAttack = { type: 'wolf-attack-state', status: 'declared', attackId: 'attack-7', turn: 7, revision: 9,
  currentStep: 'boarding', deadlineAt: '2099-11-05T10:00:00.000Z', memberResults: [] };
const operator = (roleId: string) => ({ role: 'player', connected: true, assignedRoleId: roleId,
  activeConsoleRoleId: roleId, replacementRoleId: null, replacementStatus: null, escapeState: null, fleetGroupId: 'fleet-1' });
const collect = (requestId: string, shuttleId: 'macaw' | 'boa') => ({ sessionId, attackId: 'attack-7', requestId,
  action: 'collect-scrap', shuttleId, targetShipId: 'aegis' });
const fixtureRead = (documentPath: string) => asFixture(async (firestore) => (await getDoc(doc(firestore, documentPath))).data());
const totalScrap = async () => {
  const cargo = ((await fixtureRead(path))?.shuttleCargo ?? {}) as Record<string, { scrap?: number }>;
  return Object.values(cargo).reduce((sum, entry) => sum + (entry.scrap ?? 0), 0);
};

beforeAll(async () => {
  macawUid = await signInMember();
  [boa, outsider] = await Promise.all([signUpActor(), signUpActor()]);
  await asFixture(async (firestore) => {
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, path), {
      phase: 'active', currentTurn: 7, capybaraEnabled: true, activeVesselIds: ['aegis', 'capybara'],
      shuttleDockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' },
        { shuttleId: 'boa', shipId: 'aegis', dockedAt: 'fixture' }],
      shuttleControl: {
        macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: macawUid, holderUid: macawUid, revision: 0 },
        boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: boa.uid, holderUid: boa.uid, revision: 0 },
      },
      shuttleCargo: {},
    });
    batch.set(doc(firestore, `${path}/players/${macawUid}`), operator('capybara-captain'));
    batch.set(doc(firestore, `${path}/players/${boa.uid}`), operator('capybara-recycler'));
    batch.set(doc(firestore, `${path}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis', 'capybara'],
      memberUids: [macawUid, boa.uid] });
    await batch.commit();
    // Private attack state is a local fixture (finalization itself is proven by
    // the PC07 complete-attack HTTP proof). The member endpoint is produced by
    // the deployed-shape audience trigger from that private state.
    await setDoc(doc(firestore, `${path}/wolfAttackState/current`), declaredAttack);
  });
});

afterAll(closeHarness);

describe('L2.2 attack projection reconnect', () => {
  it('replaces the cached attack stage and result with the current server projection and keeps the committed pickup locked', async () => {
    const views = new Recorder<WolfAttackMemberView | null>();
    const stop = subscribeWolfAttackMemberView(sessionId, views.push);
    try {
      const declared = await views.next((view) => view?.revision === 9, 'initial declared attack view');
      expect(views.events[declared]).toMatchObject({ attackId: 'attack-7', status: 'declared', currentStep: 'boarding' });

      // Stage change while the member is offline: the attack resolves.
      await memberGoesOffline();
      const stageOfflineAt = views.events.length;
      await views.next((view) => view === null, 'cached declared view withdrawn while offline', stageOfflineAt);
      await asFixture((firestore) => setDoc(doc(firestore, `${path}/wolfAttackState/current`), resolvedAttack));
      await until(() => fixtureRead(`${path}/wolfAttackAudience/current`),
        (value) => value?.revision === 10, 'server audience resolved');
      await memberReconnects();
      const first = await views.next((view) => view?.revision === 10, 'resolved view after reconnect', stageOfflineAt);
      expect(views.events.slice(stageOfflineAt, first).every((view) => view === null)).toBe(true);
      expect(views.events[first]).toMatchObject({ attackId: 'attack-7', status: 'resolved', currentStep: 'resolved', results: [] });

      await memberGoesOffline();
      const offlineAt = views.events.length;
      // Losing the server stream withdraws the cached result instead of presenting it as current.
      await views.next((view) => view === null, 'cached view withdrawn while offline', offlineAt);

      const boaRequest = collect('boa-while-macaw-offline', 'boa');
      const committed = await callAs(boa, 'resolveWolfAttackAftermath', boaRequest);
      expect(committed).toMatchObject({ ok: true, result: { status: 'committed', shuttleId: 'boa', scrapGained: 1 } });
      await until(() => fixtureRead(`${path}/wolfAttackAudience/current`),
        (value) => value?.revision === 11, 'server audience advanced');
      expect(views.events.slice(offlineAt).every((view) => view === null)).toBe(true);

      await memberReconnects();
      const current = await views.next((view) => view?.revision === 11, 'current server view after reconnect', offlineAt);
      // No cached revision-10 view is republished on the way back.
      expect(views.events.slice(offlineAt, current).every((view) => view === null)).toBe(true);
      expect(views.events[current]).toMatchObject({ attackId: 'attack-7', status: 'resolved', revision: 11,
        results: [expect.objectContaining({ sourceId: 'capybara-scrap-collection-boa', targetId: 'aegis',
          outcome: { scrapGained: 1 } })] });

      // The returning Macaw holder's stale opportunity cannot be spent again.
      const stale = await callAsMember('resolveWolfAttackAftermath', collect('macaw-after-reconnect', 'macaw'));
      expect(stale).toMatchObject({ ok: false, status: 'FAILED_PRECONDITION' });
      // The committed actor's exact retry replays without a second effect.
      const replay = await callAs(boa, 'resolveWolfAttackAftermath', boaRequest);
      expect(replay).toEqual({ ok: true, result: { ...(committed.ok ? committed.result : {}), status: 'replayed' } });
      expect(await totalScrap()).toBe(1);
      expect((await fixtureRead(`${path}/wolfAttackAudience/current`))?.revision).toBe(11);
      // The listener converges on exactly the stored server endpoint.
      await until(async () => [canonical(views.events.at(-1)),
        canonical(await fixtureRead(`${path}/wolfAttackAudience/current`))],
      ([seen, stored]) => seen === stored, 'listener equals the server endpoint');
    } finally {
      stop();
    }
  });

  it('keeps private attack state and the committed receipt away from the member and the endpoint away from non-members', async () => {
    await expect(getDocFromServer(doc(db(), `${path}/wolfAttackState/current`))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDocFromServer(doc(db(), `${path}/commandReceipts/boa-while-macaw-offline`)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDocFromServer(doc(await clientFor(outsider.uid), `${path}/wolfAttackAudience/current`)))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });
});
