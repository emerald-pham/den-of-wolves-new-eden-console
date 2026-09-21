import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: () => callable }));
vi.mock('./firebase', () => ({ functions: () => ({}) }));

import { publishAdmiralDirective } from './admiralDirectiveService';

beforeEach(() => {
  callable.mockReset().mockResolvedValue({ data: {} });
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Session', joinCode: '123456', phase: 'active', ownerUid: 'u1',
    createdAt: '', updatedAt: '', currentTurn: 2,
    admiralDirectives: { revision: 3, entries: [] },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player',
    seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  vi.stubGlobal('crypto', { randomUUID: () => 'request-1' });
});

it('publishes against the current server revision without optimistic mutation', async () => {
  await publishAdmiralDirective('defence-coordination', 'Hold formation.');
  expect(callable).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'request-1', kind: 'defence-coordination',
    text: 'Hold formation.', expectedRevision: 3,
  });
  expect(useSessionStore.getState().session?.admiralDirectives?.entries).toEqual([]);
});

it('rejects cached authority before calling the server', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(publishAdmiralDirective('fleet-policy', 'Conserve fuel.')).rejects.toThrow(/live|reconnect/i);
  expect(callable).not.toHaveBeenCalled();
});
