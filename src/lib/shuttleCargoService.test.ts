import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { transferShuttleCargo } from './shuttleCargoService';

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the exact cargo direction, amount, and custody revision', async () => {
  await transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'transferShuttleCargoCommand');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), shuttleId: 'hummingbird', resourceId: 'food',
    direction: 'load', amount: 2, expectedControlRevision: 3,
  });
});

it('rejects cache-backed authority before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 1, 3))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
