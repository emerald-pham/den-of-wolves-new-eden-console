import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { runHighwallMining } from './highwallMiningService';

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '', currentTurn: 2,
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Miner', role: 'player', seatId: null,
    assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the selected operation with observed state, custody, and cycle revisions', async () => {
  mocks.call.mockResolvedValue({ data: {
    status: 'committed', cycle: 2, revision: 3,
    operation: { requestId: 'mine-1', resource: 'ore', rolls: [2, 5, 3], amount: 10 },
    cargo: { ore: 13, materials: 2 },
  } });
  await expect(runHighwallMining('ore', 2, 4, 2)).resolves.toMatchObject({
    operation: { amount: 10 }, cargo: { ore: 13 },
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'runHighwallMining');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), resource: 'ore',
    expectedRevision: 2, expectedControlRevision: 4, expectedCycle: 2,
  });
});

it('rejects a malformed callable result', async () => {
  mocks.call.mockResolvedValue({ data: {
    status: 'committed', cycle: 2, revision: 3,
    operation: { requestId: 'mine-1', resource: 'ore', rolls: [6], amount: 6 },
    cargo: { ore: 9, materials: 2 },
  } });
  await expect(runHighwallMining('ore', 2, 4, 2)).rejects.toThrow(/invalid result/i);
});

it('rejects cache-backed authority before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(runHighwallMining('materials', 0, 4, 2)).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
