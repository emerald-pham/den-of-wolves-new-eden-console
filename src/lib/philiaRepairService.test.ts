import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairConsolesFromPhilia } from './philiaRepairService';

const command = {
  requestId: 'philia-repair-1', systemIds: ['storage', 'reactor'],
  expectedControlRevision: 2, expectedRepairRevision: 2,
  expectedCycle: 4, expectedHostShipId: 'dione',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, shuttleId: 'philia',
    hostShipId: 'dione', systemIds: ['reactor', 'storage'],
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
    assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends a caller-stable request id and validates the exact committed reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(repairConsolesFromPhilia(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'dione', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 4, repairRevision: 3,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromPhilia');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'philia-repair-1', systemIds: ['storage', 'reactor'],
    expectedControlRevision: 2, expectedRepairRevision: 2,
    expectedCycle: 4, expectedHostShipId: 'dione',
  });
});

it('accepts the exact replay response and rejects a response bound to another request', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(repairConsolesFromPhilia(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different-request' } });
  await expect(repairConsolesFromPhilia(command)).rejects.toThrow(/malformed/i);
});

it('rejects malformed command and cache-backed authority before calling the backend', async () => {
  await expect(repairConsolesFromPhilia({ ...command, systemIds: ['reactor', 'reactor'] }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairConsolesFromPhilia(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
