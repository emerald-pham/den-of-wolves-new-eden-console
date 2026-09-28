import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  set: vi.fn(), update: vi.fn(), delete: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path, collection: true }),
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: { path: string; collection?: boolean }) => ref.collection
        ? { docs: [...mock.documents.entries()]
          .filter(([path]) => path.startsWith(`${ref.path}/`) && path.split('/').length === ref.path.split('/').length + 1)
          .map(([path, value]) => snapshot(path, value)) }
        : snapshot(ref.path, mock.documents.get(ref.path)),
      set: (ref: { path: string }, value: Record<string, unknown>) => {
        mock.set(ref, value); mock.documents.set(ref.path, value);
      },
      update: (ref: { path: string }, patch: Record<string, unknown>) => {
        mock.update(ref, patch);
        const value = { ...(mock.documents.get(ref.path) ?? {}) };
        for (const [key, next] of Object.entries(patch)) {
          const parts = key.split('.');
          let target = value;
          for (const part of parts.slice(0, -1)) {
            target[part] = { ...((target[part] ?? {}) as object) };
            target = target[part] as Record<string, unknown>;
          }
          target[parts.at(-1)!] = next;
        }
        mock.documents.set(ref.path, value);
      },
      delete: (ref: { path: string }) => { mock.delete(ref); mock.documents.delete(ref.path); },
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    static fromDate(value: Date) { return new MockTimestamp(value); }
    constructor(private readonly date = new Date()) {}
    toDate() { return this.date; }
  },
}));

import { resolveShipMutiny } from './index';
import { recommendedRoleIds } from './roleConfiguration';

function snapshot(path: string, value: Record<string, unknown> | undefined) {
  return {
    exists: Boolean(value), id: path.split('/').at(-1), ref: { path },
    get: (key: string) => value?.[key], data: () => value,
  };
}

const command = {
  sessionId: 's1', instanceId: 'bridge', requestId: 'mutiny-1',
  shipId: 'dione', newCaptainUid: 'new', reduction: 2, expectedRevision: 0,
};
const request = (data = command, uid = 'gm') =>
  ({ data, auth: { uid } }) as CallableRequest<Record<string, unknown>>;

beforeEach(() => {
  mock.documents.clear(); mock.set.mockReset(); mock.update.mockReset(); mock.delete.mockReset();
  mock.documents.set('sessions/s1', {
    phase: 'active', currentTurn: 1, setupRevision: 4,
    activeVesselIds: ['aegis', 'dione'], shipUnrest: { dione: 8 }, vesselActionRevisions: { dione: 0 },
    shipMutinies: { dione: { status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'first' } },
    unrestAlerts: { dione: { shipId: 'dione', shipName: 'Dione', targetGmInstanceIds: ['bridge'], createdAt: 'first' } },
  });
  mock.documents.set('sessions/s1/players/gm', { role: 'gm', connected: true });
  mock.documents.set('sessions/s1/gmInstances/bridge', {
    uid: 'gm', connected: true, claimedAt: new Date(), lastSeenAt: new Date(),
  });
  mock.documents.set('sessions/s1/players/old', {
    role: 'player', connected: true, assignedRoleId: 'dione-captain',
    activeConsoleRoleId: 'dione-captain', seatId: 'dione-captain',
  });
  mock.documents.set('sessions/s1/players/new', {
    role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer', seatId: 'dione-engineer',
  });
  mock.documents.set('sessions/s1/seats/dione-captain', {
    roleId: 'dione-captain', status: 'claimed', holderUid: 'old',
  });
  mock.documents.set('sessions/s1/seats/dione-engineer', {
    roleId: 'dione-engineer', status: 'claimed', holderUid: 'new',
  });
  mock.documents.set('sessions/s1/secrets/loyalty-old', {
    visibleToUids: ['old'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
  mock.documents.set('sessions/s1/secrets/loyalty-new', {
    visibleToUids: ['new'], payload: { type: 'loyalty', kind: 'human', suspicion: null },
  });
  mock.documents.set('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm'], payload: { type: 'wolf-assignment', roleIds: ['dione-captain'] },
  });
});

it('atomically swaps captain and officer seats while preserving loyalty owners and chosen reduction', async () => {
  await expect(resolveShipMutiny.run(request())).resolves.toMatchObject({
    status: 'committed', shipId: 'dione', unrest: 6, newCaptainUid: 'new',
  });
  expect(mock.documents.get('sessions/s1/players/old')).toMatchObject({
    assignedRoleId: 'dione-engineer', seatId: 'dione-engineer', activeConsoleRoleId: null,
  });
  expect(mock.documents.get('sessions/s1/players/new')).toMatchObject({
    assignedRoleId: 'dione-captain', seatId: 'dione-captain', activeConsoleRoleId: null,
  });
  expect(mock.documents.get('sessions/s1/seats/dione-captain')).toMatchObject({ holderUid: 'new' });
  expect(mock.documents.get('sessions/s1/seats/dione-engineer')).toMatchObject({ holderUid: 'old' });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-old')).toMatchObject({ visibleToUids: ['old'] });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-new')).toMatchObject({ visibleToUids: ['new'] });
  expect(mock.documents.get('sessions/s1/secrets/wolf-assignment')?.payload).toMatchObject({
    roleIds: ['dione-engineer'],
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipUnrest: { dione: 6 }, unrestAlerts: {},
    shipMutinies: { dione: expect.objectContaining({ status: 'resolved', reduction: 2 }) },
  });
  expect(mock.documents.get('sessions/s1/roleBriefs/new')).toMatchObject({ visibleToUids: ['new'] });
  expect(mock.documents.get('sessions/s1/roleBriefs/old')).toMatchObject({ visibleToUids: ['old'] });
  mock.set.mockClear(); mock.update.mockClear();
  await expect(resolveShipMutiny.run(request())).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects non-GM authority, an unclaimed target seat, and stale revision without changing state', async () => {
  await expect(resolveShipMutiny.run(request(command, 'old'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  mock.documents.set('sessions/s1/seats/dione-engineer', { roleId: 'dione-engineer', status: 'open', holderUid: null });
  await expect(resolveShipMutiny.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  mock.documents.set('sessions/s1/seats/dione-engineer', { roleId: 'dione-engineer', status: 'claimed', holderUid: 'new' });
  await expect(resolveShipMutiny.run(request({ ...command, expectedRevision: 1 }))).resolves.toMatchObject({ status: 'stale' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('installs an acting captain from the confirmed sparse roster without changing seats or loyalty', async () => {
  mock.documents.set('sessions/s1', {
    phase: 'active', currentTurn: 1, setupRevision: 4,
    activeRoleIds: [...recommendedRoleIds(8)],
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    shipUnrest: { icebreaker: 8 }, vesselActionRevisions: { icebreaker: 0 },
    shipMutinies: { icebreaker: { status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'first' } },
  });
  mock.documents.delete('sessions/s1/players/old');
  mock.documents.set('sessions/s1/players/new', {
    role: 'player', connected: true, assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner', seatId: 'icebreaker-miner',
  });
  mock.documents.set('sessions/s1/seats/icebreaker-miner', {
    roleId: 'icebreaker-miner', status: 'claimed', holderUid: 'new',
  });
  mock.documents.set('sessions/s1/secrets/loyalty-new', {
    visibleToUids: ['new'], payload: { type: 'loyalty', kind: 'human', suspicion: null },
  });
  const sparse = { ...command, shipId: 'icebreaker' };
  await expect(resolveShipMutiny.run(request(sparse))).resolves.toMatchObject({
    status: 'committed', shipId: 'icebreaker', newCaptainUid: 'new', unrest: 6,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    activeRoleIds: [...recommendedRoleIds(8)],
    shipCommandCaptains: { icebreaker: 'new' },
    shipMutinies: { icebreaker: expect.objectContaining({ status: 'resolved' }) },
  });
  expect(mock.documents.get('sessions/s1/players/new')).toMatchObject({
    assignedRoleId: 'icebreaker-miner', seatId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner',
  });
  expect(mock.documents.get('sessions/s1/seats/icebreaker-miner')).toMatchObject({ holderUid: 'new' });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-new')).toMatchObject({ visibleToUids: ['new'] });
  expect(mock.documents.get('sessions/s1/mutinyRecoveries/mutiny-1')).toMatchObject({
    mode: 'acting-appointment', oldCaptainUid: null, newCaptainUid: 'new',
  });
  mock.set.mockClear(); mock.update.mockClear();
  await expect(resolveShipMutiny.run(request(sparse))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
