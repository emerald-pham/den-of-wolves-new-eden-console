import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import {
  beginShuttleTransit,
  completeShuttleArrival,
  requestShuttleDeparture,
  retargetShuttleTransit,
} from './shuttleDepartureService';
import { ShuttleMovementConflictError } from './shuttleMovementConflict';

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

it('retargets a trip with the observed transit identity, destination, custody revision, and cycle', async () => {
  await retargetShuttleTransit('starlight', 'transit-1', 'dione', 3, 2);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'retargetShuttleTransit');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), shuttleId: 'starlight',
    transitRequestId: 'transit-1', destinationShipId: 'dione',
    expectedControlRevision: 3, expectedCycle: 2,
  });
});

it('uses a trip-stable arrival command bound to the current custody revision', async () => {
  mocks.call.mockResolvedValue({
    data: { status: 'arrived', hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:00:00.000Z' },
  });
  await expect(completeShuttleArrival('starlight', 'transit-1', 3)).resolves.toEqual({
    hostShipId: 'icebreaker', arrivedAt: '2026-09-22T12:00:00.000Z',
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'completeShuttleArrival');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', shuttleId: 'starlight', transitRequestId: 'transit-1', expectedControlRevision: 3,
  });
});

it('surfaces validated lost-race state and never retries the mutation', async () => {
  mocks.call.mockRejectedValue({
    code: 'functions/failed-precondition',
    details: {
      commandError: 'conflict',
      movementConflict: {
        type: 'shuttle-movement-conflict', sessionId: 's1', shuttleId: 'starlight',
        current: {
          status: 'docked',
          docking: { shuttleId: 'starlight', shipId: 'icebreaker', dockedAt: '2026-09-22T12:00:00.000Z' },
        },
      },
    },
  });
  await expect(requestShuttleDeparture('starlight', 'dione', 3, 2)).rejects.toMatchObject({
    name: 'ShuttleMovementConflictError',
    conflict: {
      sessionId: 's1', shuttleId: 'starlight',
      current: { status: 'docked', docking: { shipId: 'icebreaker' } },
    },
  });
  expect(mocks.call).toHaveBeenCalledTimes(1);
  await expect(beginShuttleTransit('starlight', 'departure-1', 3, 2))
    .rejects.toBeInstanceOf(ShuttleMovementConflictError);
  expect(mocks.call).toHaveBeenCalledTimes(2);
  await expect(retargetShuttleTransit('starlight', 'transit-1', 'dione', 3, 2))
    .rejects.toBeInstanceOf(ShuttleMovementConflictError);
  expect(mocks.call).toHaveBeenCalledTimes(3);
  await expect(completeShuttleArrival('starlight', 'transit-1', 3))
    .rejects.toBeInstanceOf(ShuttleMovementConflictError);
  expect(mocks.call).toHaveBeenCalledTimes(4);
});

it('rejects cache-backed arrival completion before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(completeShuttleArrival('starlight', 'transit-1', 3))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
