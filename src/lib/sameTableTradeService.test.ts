import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({
  collection: vi.fn((...args: unknown[]) => ({ kind: 'collection', args })),
  doc: vi.fn((...args: unknown[]) => ({ kind: 'document', args })),
  onSnapshot: vi.fn(),
  query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
  where: vi.fn((...args: unknown[]) => ({ kind: 'where', args })),
  callable: vi.fn(),
  call: vi.fn(),
  requireFresh: vi.fn(),
  listeners: [] as Array<{ target: unknown; next: (snapshot: unknown) => void; error: (error: unknown) => void }>,
}));

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  where: mocks.where,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ db: () => 'db', functions: () => 'functions' }));
vi.mock('./sessionMutationAuthority', () => ({ requireFreshSessionAuthority: mocks.requireFresh }));

import {
  acceptSameTableTradeOffer,
  attestPlayerHeldTokenBaseline,
  createSameTableTradeOffer,
  subscribeSameTableTradeInventory,
  subscribeSameTableTradeOffers,
} from './sameTableTradeService';

const balances = {
  ore: 4, fuel: 2, food: 3, water: 1, materials: 5, securityTeams: 2,
} as const;

function playerSession() {
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Aegis', joinCode: '1234', phase: 'active', ownerUid: 'gm',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'alice', sessionId: 's1', displayName: 'Alice', role: 'player', seatId: null,
    assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.onSnapshot.mockReset();
  mocks.collection.mockClear();
  mocks.doc.mockClear();
  mocks.query.mockClear();
  mocks.where.mockClear();
  mocks.callable.mockReset();
  mocks.call.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  mocks.requireFresh.mockReset();
  mocks.listeners = [];
  mocks.onSnapshot.mockImplementation((target: unknown, _options: unknown, next: (snapshot: unknown) => void, error: (error: unknown) => void) => {
    mocks.listeners.push({ target, next, error });
    return vi.fn();
  });
  useSessionStore.getState().reset();
  playerSession();
});

it('reads only the current player inventory by exact UID and ignores cache or malformed snapshots', () => {
  const onInventory = vi.fn();
  const stop = subscribeSameTableTradeInventory('s1', 'alice', onInventory);
  expect(mocks.doc).toHaveBeenCalledWith('db', 'sessions/s1/playerHeldResourceInventories/alice');

  const listener = mocks.listeners[0]!;
  listener.next({ metadata: { fromCache: true }, exists: () => true, data: () => ({
    type: 'player-held-resource-inventory', sessionId: 's1', playerUid: 'alice', revision: 1, balances,
  }) });
  listener.next({ metadata: { fromCache: false }, exists: () => true, data: () => ({
    type: 'player-held-resource-inventory', sessionId: 's1', playerUid: 'bob', revision: 1, balances,
  }) });
  expect(onInventory).not.toHaveBeenCalled();

  listener.next({ metadata: { fromCache: false }, exists: () => true, data: () => ({
    type: 'player-held-resource-inventory', sessionId: 's1', playerUid: 'alice', revision: 1, balances,
  }) });
  expect(onInventory).toHaveBeenCalledExactlyOnceWith({ revision: 1, balances });
  stop();
});

it('queries offers only addressed to this UID in its current fleet group and joins both private directions', () => {
  const onOffers = vi.fn();
  subscribeSameTableTradeOffers('s1', 'alice', 'fleet-1', onOffers);

  expect(mocks.where).toHaveBeenCalledWith('sessionId', '==', 's1');
  expect(mocks.where).toHaveBeenCalledWith('fleetGroupId', '==', 'fleet-1');
  expect(mocks.where).toHaveBeenCalledWith('fromUid', '==', 'alice');
  expect(mocks.where).toHaveBeenCalledWith('toUid', '==', 'alice');
  expect(mocks.listeners).toHaveLength(2);

  const outgoing = {
    type: 'same-table-trade-offer', sessionId: 's1', id: 'offer-1',
    fromUid: 'alice', toUid: 'bob', fleetGroupId: 'fleet-1', tableId: 'aegis',
    revision: 2, quantities: { ore: 2 }, status: 'pending',
  };
  const incoming = {
    type: 'same-table-trade-offer', sessionId: 's1', id: 'offer-2',
    fromUid: 'carol', toUid: 'alice', fleetGroupId: 'fleet-1', tableId: 'aegis',
    revision: 2, quantities: { fuel: 1 }, status: 'pending',
  };
  const snapshot = (id: string, data: unknown) => ({ id, data: () => data });
  mocks.listeners[0]!.next({ metadata: { fromCache: false }, docs: [snapshot('offer-1', outgoing)] });
  expect(onOffers).not.toHaveBeenCalled();
  mocks.listeners[1]!.next({ metadata: { fromCache: false }, docs: [snapshot('offer-2', incoming)] });
  expect(onOffers).toHaveBeenCalledWith({
    outgoing: [{ id: 'offer-1', fromUid: 'alice', toUid: 'bob', tableId: 'aegis', revision: 2, quantities: { ore: 2 }, status: 'pending' }],
    incoming: [{ id: 'offer-2', fromUid: 'carol', toUid: 'alice', tableId: 'aegis', revision: 2, quantities: { fuel: 1 }, status: 'pending' }],
  });
});

it('sends baseline, offer, and acceptance commands using their stable request identities', async () => {
  mocks.call.mockResolvedValue({ data: { status: 'accepted', sessionId: 's1' } });
  const gm = useSessionStore.getState();
  gm.setIdentity({
    id: 's1', name: 'Aegis', joinCode: '1234', phase: 'active', ownerUid: 'gm', createdAt: '', updatedAt: '',
  }, {
    uid: 'gm', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '',
  });
  gm.setGmInstance({ id: 'bridge', sessionId: 's1', uid: 'gm', name: 'Bridge', connected: true, joinedAt: '' } as never);

  await attestPlayerHeldTokenBaseline('bob', balances, 'baseline-uuid');
  expect(mocks.callable).toHaveBeenLastCalledWith('functions', 'attestPlayerHeldTokenBaseline');
  expect(mocks.call).toHaveBeenLastCalledWith({
    sessionId: 's1', instanceId: 'bridge', targetUid: 'bob', balances, attestationId: 'baseline-uuid',
  });

  playerSession();
  mocks.call.mockResolvedValue({ data: { status: 'created', sessionId: 's1' } });
  await createSameTableTradeOffer('offer-uuid', 'bob', { ore: 1 });
  expect(mocks.callable).toHaveBeenLastCalledWith('functions', 'createSameTableTradeOffer');
  expect(mocks.call).toHaveBeenLastCalledWith({
    sessionId: 's1', offerId: 'offer-uuid', recipientUid: 'bob', quantities: { ore: 1 },
  });

  await acceptSameTableTradeOffer('offer-2');
  expect(mocks.callable).toHaveBeenLastCalledWith('functions', 'acceptSameTableTradeOffer');
  expect(mocks.call).toHaveBeenLastCalledWith({ sessionId: 's1', offerId: 'offer-2' });
  expect(mocks.requireFresh).toHaveBeenCalledTimes(3);
});
