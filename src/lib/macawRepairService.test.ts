import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairConsolesFromMacaw } from './macawRepairService';

const command = {
  requestId: 'macaw-repair-1', systemIds: ['storage', 'reactor'],
  expectedControlRevision: 2, expectedRepairRevision: 2,
  expectedCycle: 4, expectedHostShipId: 'capybara',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, shuttleId: 'macaw',
    hostShipId: 'capybara', systemIds: ['reactor', 'storage'],
    scrapRemaining: 1, cycle: 4, repairRevision: 3,
  },
});

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-captain', activeConsoleRoleId: 'capybara-captain', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the stable request and validates the exact Macaw reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(repairConsolesFromMacaw(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'capybara', systemIds: ['reactor', 'storage'],
    scrapRemaining: 1, cycle: 4, repairRevision: 3,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromMacaw');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: command.requestId, systemIds: command.systemIds,
    expectedControlRevision: 2, expectedRepairRevision: 2,
    expectedCycle: 4, expectedHostShipId: 'capybara',
  });
});

it('accepts replay and rejects malformed or cache-backed calls', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(repairConsolesFromMacaw(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different' } });
  await expect(repairConsolesFromMacaw(command)).rejects.toThrow(/malformed/i);
  await expect(repairConsolesFromMacaw({ ...command, systemIds: ['reactor', 'reactor'] }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairConsolesFromMacaw(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).toHaveBeenCalledTimes(2);
});
