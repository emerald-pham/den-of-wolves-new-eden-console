import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { recycleWithBoa } from './boaRecyclingService';

const command = {
  requestId: 'boa-recycling-1', recipeId: 'food' as const,
  expectedControlRevision: 2, expectedRecyclingRevision: 4,
  expectedCycle: 5, expectedHostShipId: 'aegis',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, shuttleId: 'boa',
    hostShipId: 'aegis', recipeId: 'food', resourceId: 'food', resourceCost: 6,
    hostResourceRemaining: 2, scrapRemaining: 7, cycle: 5,
    recyclingRevision: 5, exchangesThisCycle: 2,
  },
});

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the expected docked-host command and validates its exact reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(recycleWithBoa(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'aegis', recipeId: 'food', resourceId: 'food',
    resourceCost: 6, hostResourceRemaining: 2, scrapRemaining: 7,
    cycle: 5, recyclingRevision: 5, exchangesThisCycle: 2,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'recycleWithBoa');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', ...command,
  });
});

it('accepts an exact replay and rejects malformed or cache-backed calls', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(recycleWithBoa(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different' } });
  await expect(recycleWithBoa(command)).rejects.toThrow(/malformed/i);
  await expect(recycleWithBoa({ ...command, recipeId: 'securityTeams' as never })).rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(recycleWithBoa(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).toHaveBeenCalledTimes(2);
});
