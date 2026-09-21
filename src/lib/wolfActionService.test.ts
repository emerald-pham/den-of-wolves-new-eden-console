import { beforeEach, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import { submitWolfHomingBeacon, submitWolfIntelligence } from './wolfActionService';

const call = vi.fn();

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({ name: 'functions' })) }));
vi.mock('./sessionMutationAuthority', () => ({ requireFreshSessionAuthority: vi.fn() }));

beforeEach(() => {
  call.mockReset();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({ id: 's1', phase: 'active', currentTurn: 2 } as never);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });
});

it('sends only message intent and current cycle authority to the server', async () => {
  const result = {
    status: 'committed' as const, type: 'wolf-intelligence' as const,
    sessionId: 's1', requestId: 'wolf-intel-1', cycle: 2, revision: 1,
    coverRoleId: 'dione-engineer', message: 'Relay quiet.', suspicion: 3,
  };
  call.mockResolvedValue({ data: result });

  await expect(submitWolfIntelligence('  Relay quiet.  ', 'wolf-intel-1')).resolves.toEqual(result);
  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'submitWolfIntelligence');
  expect(call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'wolf-intel-1', expectedCycle: 2, message: 'Relay quiet.',
  });
});

it('rejects lower audiences and inactive cycles before calling the server', async () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'fleet-loyalist', suspicion: 0 });
  await expect(submitWolfIntelligence('Relay quiet.')).rejects.toThrow(/only a Wolf holder/i);
  useSessionStore.getState().setPrivateLoyalty({ kind: 'wolf-agent', suspicion: 0 });
  useSessionStore.getState().setSession({ id: 's1', phase: 'briefing', currentTurn: 0 } as never);
  await expect(submitWolfIntelligence('Relay quiet.')).rejects.toThrow(/active cycle/i);
  expect(call).not.toHaveBeenCalled();
});

it('submits only current cycle authority for a server-targeted homing beacon', async () => {
  const result = {
    status: 'committed' as const, type: 'wolf-homing-beacon' as const,
    sessionId: 's1', requestId: 'wolf-beacon-1', cycle: 2, revision: 1,
    coverRoleId: 'dione-engineer', groupId: 'fleet-1', coordinate: '5143',
    dueCycle: 3, arrivalTiming: 'after-cycle-start' as const, suspicion: 5,
  };
  call.mockResolvedValue({ data: result });

  await expect(submitWolfHomingBeacon('wolf-beacon-1')).resolves.toEqual(result);
  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'submitWolfHomingBeacon');
  expect(call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'wolf-beacon-1', expectedCycle: 2,
  });
});
