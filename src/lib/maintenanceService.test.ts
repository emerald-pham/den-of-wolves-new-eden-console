import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { rollbackMaintenance, runMaintenance } from './maintenanceService';

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

it('allows maintenance commands backed by a live server snapshot', async () => {
  await runMaintenance('aegis', 'begin', 2);
  await rollbackMaintenance('aegis', 2);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'runMaintenance');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'rollbackMaintenance');
});

it('reuses the Reactor request after a transient failure instead of charging twice', async () => {
  mocks.call.mockRejectedValueOnce({ code: 'functions/unavailable' });
  await expect(runMaintenance('aegis', 'reactor', 5, { consoles: ['jump-drive'] }))
    .rejects.toMatchObject({ code: 'functions/unavailable' });
  const firstRequest = mocks.call.mock.calls[0]?.[0];
  expect(firstRequest.requestId).toEqual(expect.any(String));
  await runMaintenance('aegis', 'reactor', 5, { consoles: ['jump-drive'] });
  expect(mocks.call.mock.calls[1]?.[0]).toEqual(firstRequest);
});

it.each([
  ['maintenance', () => runMaintenance('aegis', 'begin', 2)],
  ['rollback', () => rollbackMaintenance('aegis', 2)],
] as const)('rejects cache-backed %s authority before creating a callable', async (_name, invoke) => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(invoke()).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
