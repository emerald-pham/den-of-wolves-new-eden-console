import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { runVoyage33Maintenance } from './smallShipService';

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.call.mockResolvedValue({ data: { status: 'committed' } });
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.setState({
    connection: 'live',
    sessionSnapshotFreshness: 'server',
    session: {
      id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1',
      createdAt: '', updatedAt: '',
    },
    me: {
      uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '',
    },
    gmInstance: {
      id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '',
    },
  });
});

it('sends the docking revision with the maintenance CAS cursor', async () => {
  await runVoyage33Maintenance('begin', 4, 2, { foodLevel: 1 }, 'voyage-maint-1');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'runVoyage33Maintenance');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', shipId: 'voyage-33-0', action: 'begin', expectedRevision: 4,
    expectedDockingRevision: 2, foodLevel: 1, requestId: 'voyage-maint-1', instanceId: 'gm1',
  });
});

it('keeps the docking revision in a transient retry payload', async () => {
  mocks.call.mockRejectedValueOnce({ code: 'functions/unavailable' });
  await expect(runVoyage33Maintenance('rations', 5, 3, { waterLevel: 1 }, 'voyage-retry'))
    .rejects.toMatchObject({ code: 'functions/unavailable' });
  const firstRequest = mocks.call.mock.calls[0]?.[0];
  await runVoyage33Maintenance('rations', 5, 3, { waterLevel: 1 }, 'voyage-retry');
  expect(mocks.call.mock.calls[1]?.[0]).toEqual(firstRequest);
});
