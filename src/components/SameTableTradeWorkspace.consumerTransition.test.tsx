import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({
  collection: vi.fn((...args: unknown[]) => ({ kind: 'collection', args })),
  doc: vi.fn((...args: unknown[]) => ({ kind: 'document', args })),
  onSnapshot: vi.fn(),
  query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ kind: 'query', source, constraints })),
  where: vi.fn((...args: unknown[]) => ({ kind: 'where', args })),
  callable: vi.fn(),
  call: vi.fn(),
  requireFresh: vi.fn(),
  listeners: [] as Array<{
    target: unknown;
    next: (snapshot: unknown) => void;
    error: (error: unknown) => void;
  }>,
}));

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  where: mocks.where,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('@/lib/firebase', () => ({ db: () => 'db', functions: () => 'functions' }));
vi.mock('@/lib/firestore', () => ({ db: () => 'db' }));
vi.mock('@/lib/sessionMutationAuthority', () => ({ requireFreshSessionAuthority: mocks.requireFresh }));

import SameTableTradeWorkspace from './SameTableTradeWorkspace';

const offerId = '3f23b456-789a-4abc-8def-0123456789ab';
const zeroBalances = { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 } as const;
const acceptedBalances = { ...zeroBalances, ore: 2 } as const;
const normalizedQuantities = { ore: 2, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 } as const;

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

function renderWorkspace() {
  return render(<SameTableTradeWorkspace
    sessionId="s1"
    currentPlayerUid="alice"
    currentPlayerName="Alice"
    fleetGroupId="fleet-1"
    counterparties={[{ id: 'bob', name: 'Bob' }]}
  />);
}

function listenerFor(field: 'toUid' | 'fromUid') {
  return mocks.listeners.find(({ target }) => {
    if (typeof target !== 'object' || target === null || !('constraints' in target)) return false;
    const constraints = (target as { constraints: Array<{ args?: unknown[] }> }).constraints;
    return constraints.some((constraint) => constraint.args?.[0] === field);
  })!;
}

function offerDocument(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

function serverOffer(overrides: Record<string, unknown> = {}) {
  return {
    type: 'same-table-trade-offer',
    sessionId: 's1',
    id: offerId,
    fromUid: 'bob',
    toUid: 'alice',
    fleetGroupId: 'fleet-1',
    tableId: 'aegis',
    revision: 0,
    quantities: normalizedQuantities,
    status: 'pending',
    ...overrides,
  };
}

function ownInventory() {
  return {
    type: 'player-held-resource-inventory',
    sessionId: 's1',
    playerUid: 'alice',
    revision: 0,
    balances: zeroBalances,
    baseline: {
      attestationId: '1f23b456-789a-4abc-8def-0123456789ab',
      attestedByUid: 'gm',
      revision: 0,
      balances: zeroBalances,
      attestedAt: 'server-time',
    },
  };
}

function liveSnapshot(docs: unknown[] = []) {
  return { metadata: { fromCache: false }, docs };
}

beforeEach(() => {
  mocks.collection.mockClear();
  mocks.doc.mockClear();
  mocks.query.mockClear();
  mocks.where.mockClear();
  mocks.listeners = [];
  mocks.onSnapshot.mockReset();
  mocks.callable.mockReset();
  mocks.call.mockReset();
  mocks.requireFresh.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  mocks.onSnapshot.mockImplementation((
    target: unknown,
    _options: unknown,
    next: (snapshot: unknown) => void,
    error: (error: unknown) => void,
  ) => {
    mocks.listeners.push({ target, next, error });
    return vi.fn();
  });
  useSessionStore.getState().reset();
  playerSession();
});

it('accepts a server-normalized incoming offer through the real workspace transition', async () => {
  const user = userEvent.setup();
  mocks.call.mockResolvedValue({ data: {
    status: 'committed',
    sessionId: 's1',
    offerId,
    revision: 1,
    inventory: { playerUid: 'alice', revision: 1, balances: acceptedBalances },
    receipt: {
      receiptId: offerId,
      offerId,
      fromUid: 'bob',
      toUid: 'alice',
      tableId: 'aegis',
      revision: 0,
      quantities: normalizedQuantities,
    },
  } });

  renderWorkspace();
  const inventoryListener = mocks.listeners.find(({ target }) =>
    typeof target === 'object' && target !== null && 'kind' in target &&
    (target as { kind: string }).kind === 'document');
  expect(inventoryListener).toBeDefined();
  act(() => inventoryListener!.next({
    metadata: { fromCache: false },
    exists: () => true,
    data: ownInventory,
  }));

  const incoming = listenerFor('toUid');
  act(() => {
    listenerFor('fromUid').next(liveSnapshot());
    incoming.next(liveSnapshot());
  });
  expect(screen.getByText('No incoming offers.')).toBeVisible();

  act(() => incoming.next(liveSnapshot([offerDocument(offerId, serverOffer())])));
  const accept = await screen.findByRole('button', { name: 'Accept exact offer from Bob' });
  await user.click(accept);

  await waitFor(() => expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', offerId }));
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'acceptSameTableTradeOffer');
  expect(await screen.findByRole('status')).toHaveTextContent(/trade confirmed/i);
  const holdings = screen.getByLabelText('Your held tokens');
  expect(holdings).toHaveTextContent(/Ore\s+2/);
  expect(holdings).toHaveTextContent(/Fuel\s+0/);
});

it('ignores cached, all-zero, negative, unknown-resource, and foreign-recipient offers', () => {
  renderWorkspace();
  const inventoryListener = mocks.listeners.find(({ target }) =>
    typeof target === 'object' && target !== null && 'kind' in target &&
    (target as { kind: string }).kind === 'document');
  act(() => inventoryListener!.next({
    metadata: { fromCache: false },
    exists: () => true,
    data: ownInventory,
  }));
  const incoming = listenerFor('toUid');
  act(() => {
    listenerFor('fromUid').next(liveSnapshot());
    incoming.next(liveSnapshot());
  });

  act(() => incoming.next({
    metadata: { fromCache: true },
    docs: [offerDocument(offerId, serverOffer())],
  }));
  expect(screen.queryByRole('button', { name: 'Accept exact offer from Bob' })).not.toBeInTheDocument();

  const invalidOffers = [
    offerDocument('4f23b456-789a-4abc-8def-0123456789ab', serverOffer({
      id: '4f23b456-789a-4abc-8def-0123456789ab',
      quantities: zeroBalances,
    })),
    offerDocument('5f23b456-789a-4abc-8def-0123456789ab', serverOffer({
      id: '5f23b456-789a-4abc-8def-0123456789ab',
      quantities: { ...normalizedQuantities, ore: -2 },
    })),
    offerDocument('6f23b456-789a-4abc-8def-0123456789ab', serverOffer({
      id: '6f23b456-789a-4abc-8def-0123456789ab',
      quantities: { ore: 2, unknown: 1 },
    })),
    offerDocument('7f23b456-789a-4abc-8def-0123456789ab', serverOffer({
      id: '7f23b456-789a-4abc-8def-0123456789ab',
      toUid: 'mallory',
    })),
  ];
  act(() => incoming.next(liveSnapshot(invalidOffers)));
  expect(screen.getByText('No incoming offers.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Accept exact offer from Bob' })).not.toBeInTheDocument();

  const outgoingOfferId = '8f23b456-789a-4abc-8def-0123456789ab';
  act(() => listenerFor('fromUid').next(liveSnapshot([offerDocument(outgoingOfferId, serverOffer({
    id: outgoingOfferId,
    fromUid: 'alice',
    toUid: 'bob',
  }))])));
  const outgoing = screen.getByRole('listitem', { name: 'Offer to Bob' });
  expect(outgoing).toHaveTextContent(/Ore\s+2/);
  expect(outgoing).toHaveTextContent(/Waiting for recipient/i);
});
