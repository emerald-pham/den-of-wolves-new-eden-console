import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { rechargeHostConsoleFromShuttle } from './serviceShuttleRechargeService';

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'refinery-engineer', activeConsoleRoleId: 'refinery-engineer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends immediate production choices and returns the authoritative result', async () => {
  mocks.call.mockResolvedValue({ data: {
    immediate: true, message: 'Fuel Refinery: spent 4 ore, generated 4 fuel.',
  } });

  await expect(rechargeHostConsoleFromShuttle('wobbly', 'fuel-refinery', 2, 7, 3, undefined, 4))
    .resolves.toEqual({
      immediate: true, message: 'Fuel Refinery: spent 4 ore, generated 4 fuel.',
    });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'rechargeHostConsoleFromShuttle');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), shuttleId: 'wobbly',
    consoleId: 'fuel-refinery', expectedControlRevision: 2,
    expectedMaintenanceRevision: 7, expectedCycle: 3, productionOreAmount: 4,
  });
});

it('rejects malformed success data', async () => {
  mocks.call.mockResolvedValue({ data: { immediate: 'yes', message: 'wrong' } });
  await expect(rechargeHostConsoleFromShuttle('condor', 'jump-drive', 2, 7, 3))
    .rejects.toThrow(/response was malformed/i);
});

it('rejects cache-backed authority before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(rechargeHostConsoleFromShuttle('condor', 'jump-drive', 2, 7, 3))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
