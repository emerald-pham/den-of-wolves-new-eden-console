import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => 'functions') }));
vi.mock('./sessionMutationAuthority', () => ({ requireFreshSessionAuthority: vi.fn() }));
vi.mock('@/store/useSessionStore', () => ({
  useSessionStore: { getState: () => ({ session: { id: 's1' } }) },
}));

import { repairConsolesFromAlly } from './allyRepairService';

const command = {
  requestId: 'ally-1', systemIds: ['storage', 'reactor'], expectedControlRevision: 2,
  expectedRepairRevision: 0, expectedCycle: 3, expectedHostShipId: 'shepherd',
};

beforeEach(() => mocks.callable.mockReset());

it('calls the production Ally callable and validates the canonical response', async () => {
  const call = vi.fn().mockResolvedValue({ data: {
    status: 'committed', sessionId: 's1', requestId: 'ally-1', shuttleId: 'ally',
    hostShipId: 'shepherd', systemIds: ['reactor', 'storage'], materialsRemaining: 4,
    cycle: 3, repairRevision: 1,
  } });
  mocks.callable.mockReturnValue(call);
  await expect(repairConsolesFromAlly(command)).resolves.toMatchObject({
    status: 'committed', systemIds: ['reactor', 'storage'], materialsRemaining: 4,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromAlly');
  expect(call).toHaveBeenCalledWith(expect.objectContaining({ systemIds: ['storage', 'reactor'] }));
});

it('fails closed on a malformed response', async () => {
  mocks.callable.mockReturnValue(vi.fn().mockResolvedValue({ data: {
    status: 'committed', sessionId: 's1', requestId: 'ally-1', shuttleId: 'ally',
    hostShipId: 'shepherd', systemIds: ['reactor'], materialsRemaining: 4,
    cycle: 3, repairRevision: 1,
  } }));
  await expect(repairConsolesFromAlly(command)).rejects.toThrow(/malformed/i);
});
