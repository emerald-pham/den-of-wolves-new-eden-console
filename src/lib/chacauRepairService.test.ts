import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairConsolesFromChacau } from './chacauRepairService';

const command = {
  requestId: 'chacau-repair-1', systemIds: ['storage', 'reactor'],
  expectedControlRevision: 2, expectedRepairRevision: 2,
  expectedCycle: 4, expectedHostShipId: 'refinery-124',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, shuttleId: 'chacau',
    hostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 4, repairRevision: 3,
  },
});

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'refinery-124-engineer', activeConsoleRoleId: 'refinery-124-engineer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the Chacau command and validates its exact committed reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(repairConsolesFromChacau(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 4, repairRevision: 3,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromChacau');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'chacau-repair-1', systemIds: ['storage', 'reactor'],
    expectedControlRevision: 2, expectedRepairRevision: 2,
    expectedCycle: 4, expectedHostShipId: 'refinery-124',
  });
});

it('accepts the exact replay response and rejects replies for another request or craft', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(repairConsolesFromChacau(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different-request' } });
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/malformed/i);
  mocks.call.mockResolvedValue({ data: { ...response().data, shuttleId: 'philia' } });
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/malformed/i);
});

it('rejects malformed commands and cache-backed authority before calling the backend', async () => {
  await expect(repairConsolesFromChacau({ ...command, systemIds: ['reactor', 'reactor'] }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
