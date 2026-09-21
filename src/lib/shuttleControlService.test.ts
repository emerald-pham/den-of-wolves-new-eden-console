import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { transferShuttleControl } from './shuttleControlService';

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

it('sends a handoff with the observed revision and no optimistic mutation', async () => {
  await transferShuttleControl('starlight', 'handoff', 3, 'crew');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'transferShuttleControlCommand');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), shuttleId: 'starlight',
    action: 'handoff', expectedRevision: 3, targetUid: 'crew',
  });
});

it('rejects a cache-backed reclaim before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(transferShuttleControl('starlight', 'reclaim', 4))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
