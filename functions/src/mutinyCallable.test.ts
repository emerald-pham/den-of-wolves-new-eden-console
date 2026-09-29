import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { emptySmallShipState } from './smallShip';
import { emptyVoyage33MaintenanceState } from './voyage33Maintenance';

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

  const after = mock.documents.get('sessions/s1')!;
  mock.documents.set('sessions/s1', {
    ...after, shipUnrest: { icebreaker: 8 }, vesselActionRevisions: { icebreaker: 1 },
    shipMutinies: { icebreaker: { status: 'active', revision: 3, triggerUnrest: 8, triggeredAt: 'again' } },
  });
  await expect(resolveShipMutiny.run(request({ ...sparse, requestId: 'mutiny-2', expectedRevision: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1')?.shipCommandCaptains).toEqual({ icebreaker: 'new' });
});

it('transfers a base-craft Captain replacement role and leaves the former holder awaiting a new role', async () => {
  const craft = emptySmallShipState('gorgoneion', 'aegis');
  mock.documents.set('sessions/s1', {
    phase: 'active', currentTurn: 1, setupRevision: 4,
    activeVesselIds: ['aegis'], expansion: 'base', capybaraEnabled: true,
    smallShipStates: {
      gorgoneion: {
        ...craft, dockingRevision: 1, unrest: 8, cycle: { ...craft.cycle, revision: 4 },
        mutiny: { status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'first' },
      },
    },
  });
  mock.documents.set('sessions/s1/players/old', {
    role: 'player', connected: true, assignedRoleId: 'aegis-admiral',
    replacementRoleId: 'gorgoneion-captain', activeConsoleRoleId: null, seatId: null,
  });
  mock.documents.set('sessions/s1/players/new', {
    role: 'player', connected: true, assignedRoleId: 'aegis-engineer',
    replacementRoleId: null, activeConsoleRoleId: 'aegis-engineer', seatId: 'aegis-engineer',
  });
  mock.documents.set('sessions/s1/seats/aegis-engineer', {
    roleId: 'aegis-engineer', status: 'claimed', holderUid: 'new',
  });
  mock.documents.set('sessions/s1/replacementEligibility/new', {
    sessionId: 's1', targetUid: 'new', eligible: true, revision: 2,
    reason: 'dead',
  });
  mock.documents.set('sessions/s1/roleBriefs/old', { visibleToUids: ['old'], payload: { roleId: 'gorgoneion-captain' } });
  const craftCommand = {
    ...command, shipId: 'gorgoneion', newCaptainUid: 'new', expectedRevision: 4,
    recoveryMode: 'replacement-transfer', expectedEligibilityRevision: 2,
  };

  await expect(resolveShipMutiny.run(request(craftCommand))).resolves.toMatchObject({
    status: 'committed', shipId: 'gorgoneion', unrest: 6, oldCaptainUid: 'old', newCaptainUid: 'new',
  });
  expect(mock.documents.get('sessions/s1')?.smallShipStates).toMatchObject({
    gorgoneion: {
      unrest: 6, cycle: { revision: 5 },
      mutiny: { status: 'resolved', revision: 2, reduction: 2 },
    },
  });
  expect(mock.documents.get('sessions/s1/players/old')).toMatchObject({
    assignedRoleId: 'aegis-admiral', replacementRoleId: null,
    replacementStatus: 'awaiting-re-role', activeConsoleRoleId: null, seatId: null,
  });
  expect(mock.documents.get('sessions/s1/players/new')).toMatchObject({
    assignedRoleId: 'aegis-engineer', replacementRoleId: 'gorgoneion-captain',
    replacementStatus: null, activeConsoleRoleId: null, seatId: null,
  });
  expect(mock.documents.get('sessions/s1/seats/aegis-engineer')).toMatchObject({ status: 'open', holderUid: null });
  expect(mock.documents.get('sessions/s1/replacementEligibility/new')).toMatchObject({
    eligible: false, replacementRoleId: 'gorgoneion-captain', consumedByRequestId: 'mutiny-1', revision: 3,
  });
  expect(mock.documents.has('sessions/s1/roleBriefs/old')).toBe(false);
  expect(mock.documents.get('sessions/s1/roleBriefs/new')).toMatchObject({ visibleToUids: ['new'] });
  expect(mock.documents.get('sessions/s1/mutinyRecoveries/mutiny-1')).toMatchObject({
    mode: 'replacement-transfer', oldCaptainUid: 'old', newCaptainUid: 'new',
  });
  expect(mock.documents.get('sessions/s1/events/mutiny-mutiny-1')).not.toMatchObject({
    payload: expect.objectContaining({ oldCaptainUid: expect.anything(), newCaptainUid: expect.anything() }),
  });

  mock.set.mockClear(); mock.update.mockClear(); mock.delete.mockClear();
  await expect(resolveShipMutiny.run(request(craftCommand))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('binds a base-craft transfer to one positive current eligibility revision', async () => {
  const craft = emptySmallShipState('gorgoneion', 'aegis');
  mock.documents.set('sessions/s1', {
    phase: 'active', currentTurn: 1, setupRevision: 4,
    activeVesselIds: ['aegis'], expansion: 'base', capybaraEnabled: true,
    smallShipStates: {
      gorgoneion: {
        ...craft, dockingRevision: 1, unrest: 8, cycle: { ...craft.cycle, revision: 4 },
        mutiny: { status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'first' },
      },
    },
  });
  mock.documents.set('sessions/s1/players/old', {
    role: 'player', connected: true, assignedRoleId: 'aegis-admiral',
    replacementRoleId: 'gorgoneion-captain', activeConsoleRoleId: null, seatId: null,
  });
  mock.documents.set('sessions/s1/players/new', {
    role: 'player', connected: true, assignedRoleId: 'aegis-engineer',
    replacementRoleId: null, activeConsoleRoleId: null, seatId: null,
  });
  const recovery = {
    ...command, shipId: 'gorgoneion', newCaptainUid: 'new', expectedRevision: 4,
    recoveryMode: 'replacement-transfer', expectedEligibilityRevision: 2,
  };

  mock.documents.set('sessions/s1/replacementEligibility/new', {
    sessionId: 's1', targetUid: 'new', eligible: true, reason: 'dead',
  });
  await expect(resolveShipMutiny.run(request(recovery)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.documents.set('sessions/s1/replacementEligibility/new', {
    sessionId: 's1', targetUid: 'new', eligible: true, revision: 3,
    reason: 'dead',
  });
  await expect(resolveShipMutiny.run(request({ ...recovery, requestId: 'mutiny-stale-eligibility' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('records Voyage 33-0 crew-captain attestation without granting a player role', async () => {
  const voyage = emptyVoyage33MaintenanceState('aegis');
  mock.documents.set('sessions/s1', {
    phase: 'active', currentTurn: 1, setupRevision: 4,
    activeVesselIds: ['aegis'],
    voyage33Admission: {
      type: 'voyage-admission', sessionId: 's1', id: 'voyage-33-0', status: 'admitted',
      crisisId: 'approach-1', crisisRevision: 2, population: 40_000, unrest: 0,
      hostShipId: null,
      commitments: {
        requiresHostDocking: true, hostProvidesResources: true,
        maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1,
      },
    },
    voyage33Maintenance: {
      ...voyage, unrest: 9, cycle: { ...voyage.cycle, revision: 3 },
      mutiny: { status: 'active', revision: 3, triggerUnrest: 9, triggeredAt: 'first' },
    },
  });
  const voyageCommand = {
    sessionId: 's1', instanceId: 'bridge', requestId: 'voyage-mutiny-1',
    shipId: 'voyage-33-0', newCaptainUid: null, reduction: 2,
    expectedRevision: 3, recoveryMode: 'crew-attestation',
  };

  await expect(resolveShipMutiny.run(request(voyageCommand))).resolves.toMatchObject({
    status: 'committed', shipId: 'voyage-33-0', unrest: 7,
    oldCaptainUid: null, newCaptainUid: null,
  });
  expect(mock.documents.get('sessions/s1')?.voyage33Maintenance).toMatchObject({
    unrest: 7, cycle: { revision: 4 },
    mutiny: { status: 'resolved', revision: 4, reduction: 2 },
  });
  expect(mock.documents.get('sessions/s1/mutinyRecoveries/voyage-mutiny-1')).toMatchObject({
    mode: 'crew-attestation', oldCaptainUid: null, newCaptainUid: null,
    attestation: 'crew-installed-in-world-captain',
  });
  expect(mock.documents.get('sessions/s1/events/mutiny-voyage-mutiny-1')).not.toMatchObject({
    payload: expect.objectContaining({ newCaptainUid: expect.anything() }),
  });
  expect([...mock.documents.keys()].filter(path => path.includes('/players/'))).toHaveLength(3);

  await expect(resolveShipMutiny.run(request({
    ...voyageCommand, requestId: 'voyage-mutiny-player', newCaptainUid: 'new',
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
