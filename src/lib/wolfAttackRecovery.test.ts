import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: { uid: 'gm1' } }), functions: () => ({}),
}));
const { httpsCallable } = await import('firebase/functions');
const { advanceWolfAttackToLongRange } = await import('./sessionService');
const reason = 'Retry the committed targeting transition.';
const deadlineAt = '2026-10-03T08:00:00.000Z';

function receipt(payload: Record<string, unknown>) {
  return {
    status: 'committed', type: 'wolf-attack-stage-advance', sessionId: payload.sessionId,
    requestId: payload.requestId, turn: 2, revision: 6, previousStep: 'targeting',
    currentStep: 'long-range', deadlineAt, reason, dangerConfirmed: true,
    delta: {
      from: { revision: 5, currentStep: 'targeting', deadlineAt },
      to: { revision: 6, currentStep: 'long-range', deadlineAt },
    }, rollback: { allowed: false },
  };
}

beforeEach(() => {
  vi.resetAllMocks(); useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Recovery test', joinCode: '1234', phase: 'active', currentTurn: 2,
    ownerUid: 'gm1', createdAt: '', updatedAt: '',
  }, { uid: 'gm1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '' });
  useSessionStore.getState().setGmInstance({
    id: 'instance-1', sessionId: 's1', uid: 'gm1', name: 'GM test',
    deviceLabel: 'Browser', claimedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('submits a trimmed reason, explicit danger confirmation and current revision', async () => {
  const call = Object.assign(vi.fn(async (payload: Record<string, unknown>) => ({ data: receipt(payload) })), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await expect(advanceWolfAttackToLongRange(2, 5, `  ${reason}  `, true)).resolves.toMatchObject({
    reason, dangerConfirmed: true, delta: { from: { revision: 5 }, to: { revision: 6 } },
    rollback: { allowed: false },
  });
  expect(call).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', instanceId: 'instance-1', expectedTurn: 2, expectedRevision: 5,
    reason, dangerConfirmed: true, requestId: expect.any(String),
  }));
});

it.each(['short', ' '.repeat(20), 'x'.repeat(401)])('denies an invalid reason before any callable: %s', async (invalid) => {
  await expect(advanceWolfAttackToLongRange(2, 5, invalid, true)).rejects.toThrow(/reason/i);
  expect(httpsCallable).not.toHaveBeenCalled();
});

it('denies absent danger confirmation before any callable', async () => {
  await expect(advanceWolfAttackToLongRange(2, 5, reason, false as true)).rejects.toThrow(/confirm/i);
  expect(httpsCallable).not.toHaveBeenCalled();
});

it.each([
  ['different reason', (value: ReturnType<typeof receipt>) => ({ ...value, reason: 'A different sufficient reason.' })],
  ['different delta revision', (value: ReturnType<typeof receipt>) => ({ ...value, delta: { ...value.delta, from: { ...value.delta.from, revision: 4 } } })],
  ['nested private field', (value: ReturnType<typeof receipt>) => ({ ...value, delta: { ...value.delta, to: { ...value.delta.to, actorUid: 'private' } } })],
  ['rollback granted', (value: ReturnType<typeof receipt>) => ({ ...value, rollback: { allowed: true } })],
  ['missing scoped delta', (value: ReturnType<typeof receipt>) => ({ ...value, delta: undefined })],
  ['unconfirmed receipt', (value: ReturnType<typeof receipt>) => ({ ...value, dangerConfirmed: false })],
])('rejects %s in the recovery reply', async (_label, mutate) => {
  const call = Object.assign(vi.fn(async (payload: Record<string, unknown>) => ({ data: mutate(receipt(payload)) })), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await expect(advanceWolfAttackToLongRange(2, 5, reason, true)).rejects.toThrow(/invalid.*receipt/i);
});
