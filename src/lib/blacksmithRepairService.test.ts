import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairConsolesFromBlacksmith } from './blacksmithRepairService';

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'icebreaker-engineer', activeConsoleRoleId: 'icebreaker-engineer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the exact repair cursors and selected consoles', async () => {
  mocks.call.mockResolvedValue({ data: { materialsRemaining: 4, repairRevision: 3 } });
  await expect(repairConsolesFromBlacksmith(['reactor', 'storage'], 2, 2, 4, 'icebreaker'))
    .resolves.toEqual({ materialsRemaining: 4, repairRevision: 3 });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromBlacksmith');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), systemIds: ['reactor', 'storage'],
    expectedControlRevision: 2, expectedRepairRevision: 2, expectedCycle: 4,
    expectedHostShipId: 'icebreaker',
  });
});

it('rejects malformed success data and cache-backed authority', async () => {
  mocks.call.mockResolvedValue({ data: { materialsRemaining: -1, repairRevision: 3 } });
  await expect(repairConsolesFromBlacksmith(['reactor'], 2, 2, 4, 'icebreaker')).rejects.toThrow(/malformed/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairConsolesFromBlacksmith(['reactor'], 2, 2, 4, 'icebreaker')).rejects.toThrow(/live session state/i);
});
