import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { beginShuttleTransit, requestShuttleDeparture } from './shuttleDepartureService';

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'owner', sessionId: 's1', displayName: 'Owner', role: 'player', seatId: null,
    assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the observed custody revision and cycle without optimistic mutation', async () => {
  await requestShuttleDeparture('starlight', 'icebreaker', 3, 2);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'requestShuttleDeparture');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), shuttleId: 'starlight',
    destinationShipId: 'icebreaker', expectedControlRevision: 3, expectedCycle: 2,
  });
});

it('rejects a cache-backed request before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(requestShuttleDeparture('starlight', 'icebreaker', 3, 2))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('begins transit from the exact observed departure, custody revision, and cycle', async () => {
  await beginShuttleTransit('starlight', 'departure-1', 3, 2);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'beginShuttleTransit');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), shuttleId: 'starlight',
    expectedDepartureRequestId: 'departure-1', expectedControlRevision: 3, expectedCycle: 2,
  });
});
