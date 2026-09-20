import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({ kind: 'functions' })) }));

const { httpsCallable } = await import('firebase/functions');
const { investigatePlayer } = await import('./intelligenceInvestigationService');

beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table', joinCode: '4821', phase: 'active', currentTurn: 2,
      ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Agent', role: 'player', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setPrivateLoyalty({ kind: 'intelligence-agent', suspicion: 6 });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends only target identity and current cycle, never a claimed answer', async () => {
  const call = vi.fn().mockResolvedValue({ data: {
    status: 'committed', type: 'intelligence-investigation', sessionId: 's1',
    requestId: 'req-1', cycle: 2, revision: 1, investigatorUid: 'u1',
    targetUid: 'u2', targetDisplayName: 'Target', reportedWolf: false,
  } });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(investigatePlayer('u2', 'req-1')).resolves.toMatchObject({
    reportedWolf: false,
  });
  expect(call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'req-1', expectedCycle: 2, targetUid: 'u2',
  });
  expect(call.mock.calls[0]?.[0]).not.toHaveProperty('reportedWolf');
});

it('fails locally outside an active Intelligence Agent card', async () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'fleet-loyalist', suspicion: 5 });
  await expect(investigatePlayer('u2', 'req-1')).rejects.toThrow(/Intelligence Agent/i);
  expect(httpsCallable).not.toHaveBeenCalled();
});
