import { beforeEach, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import { resolveArrestPosse } from './arrestPosseService';

const call = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({ name: 'functions' })) }));
vi.mock('./sessionMutationAuthority', () => ({
  requireFreshSessionAuthority: vi.fn(), captureSessionAuthority: vi.fn(() => ({ sessionId: 's1', uid: 'gm' })),
  isCurrentSessionAuthority: vi.fn(() => true),
}));

beforeEach(() => {
  call.mockReset();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', phase: 'active', currentTurn: 3 } as never,
    { uid: 'gm', sessionId: 's1', role: 'gm' } as never);
  useSessionStore.getState().setGmInstance({ id: 'gm-1', sessionId: 's1', uid: 'gm' } as never);
});

function reply(fields: Record<string, unknown> = {}) {
  call.mockImplementation(async (payload: { requestId: string }) => ({ data: {
    status: 'committed', type: 'arrest-posse-outcome', sessionId: 's1', requestId: payload.requestId,
    turn: 3, revision: 1, targetUid: 'target', requiredPlayers: 1, presentPlayers: 1,
    outcome: 'arrested', deadlineCycle: 4, ...fields,
  } }));
}

it('accepts the first case revision independently of the current calculation revision', async () => {
  reply();
  await expect(resolveArrestPosse('target', ['crew'], 3, 17))
    .resolves.toMatchObject({ revision: 1, outcome: 'arrested' });
  expect(call).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 17 }));
});

it('accepts a later positive case revision without confusing it with the calculation counter', async () => {
  reply({ revision: 9 });
  await expect(resolveArrestPosse('target', ['crew'], 3, 2)).resolves.toMatchObject({ revision: 9 });
});

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid server case revision %s', async revision => {
  reply({ revision });
  await expect(resolveArrestPosse('target', ['crew'], 3, 2)).rejects.toThrow(/invalid posse result/);
});

it('requires and preserves explicitly labeled simulated evidence only in the protected active demo', async () => {
  const store = useSessionStore.getState();
  store.setSession({ ...store.session, fullGameDemo: { status: 'active', progression: 'manual' } } as never);
  reply({ attendanceEvidence: 'simulated-demo' });
  await expect(resolveArrestPosse('target', ['crew'], 3, 17, 'simulated-demo'))
    .resolves.toMatchObject({ attendanceEvidence: 'simulated-demo' });
  expect(call).toHaveBeenCalledWith(expect.objectContaining({ attendanceEvidence: 'simulated-demo' }));
  call.mockClear();
  await expect(resolveArrestPosse('target', ['crew'], 3, 17)).rejects.toThrow(/Simulate attendance/);
  expect(call).not.toHaveBeenCalled();
});

it('rejects a simulated result from a normal game and a missing evidence label from a demo', async () => {
  reply({ attendanceEvidence: 'simulated-demo' });
  await expect(resolveArrestPosse('target', ['crew'], 3, 2)).rejects.toThrow(/invalid posse result/);
  const store = useSessionStore.getState();
  store.setSession({ ...store.session, fullGameDemo: { status: 'active', progression: 'manual' } } as never);
  reply();
  await expect(resolveArrestPosse('target', ['crew'], 3, 2, 'simulated-demo')).rejects.toThrow(/invalid posse result/);
});
