import { beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { limitCurrentMemberSessionReader } from './memberSessionLimit';
import { CALLABLE_RATE_LIMIT_POLICIES } from './callableRateLimit';

const limiter = vi.hoisted(() => ({ enforce: vi.fn() }));
vi.mock('./callableRateLimitFirestore', () => ({ enforceExpensiveCallableRateLimit: limiter.enforce }));
let actor: Record<string, unknown> | undefined;
let phase = 'active';
const read = vi.fn(async () => ({ session: { id: 's1' } }));
const db = { doc: (path: string) => ({ path }), runTransaction: async (handler: (tx: unknown) => unknown) => handler({
  get: async ({ path }: { path: string }) => path === 'sessions/s1'
    ? { exists: true, get: () => phase }
    : { exists: !!actor, get: (key: string) => actor?.[key] },
}) } as unknown as Firestore;
const bounded = limitCurrentMemberSessionReader({ db, read });
beforeEach(() => { phase = 'active'; actor = { connected: true, role: 'player' }; read.mockClear(); limiter.enforce.mockReset(); });

it('allows projection polling from multiple legitimate devices under a session/UID budget', async () => {
  expect(CALLABLE_RATE_LIMIT_POLICIES.getCurrentMemberSession).toEqual({ windowMs: 60_000, maxRequests: 120 });
  await expect(bounded({ auth: { uid: 'u1' }, data: { sessionId: 's1' } })).resolves.toEqual({ session: { id: 's1' } });
  expect(limiter.enforce).toHaveBeenCalledWith(db, { callableName: 'getCurrentMemberSession', sessionId: 's1', uid: 'u1' });
  expect(read).toHaveBeenCalledOnce();
});
it('uses a lock-free entitlement preflight before the separate private limiter write', async () => {
  const transaction = vi.spyOn(db, 'runTransaction');
  try {
    await bounded({ auth: { uid: 'u1' }, data: { sessionId: 's1' } });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
  } finally { transaction.mockRestore(); }
});

it('rejects malformed, foreign, kicked and disconnected requests before scans or limiter writes', async () => {
  for (const invalid of [{ data: { sessionId: 's1' } }, { auth: { uid: 'u1' }, data: { sessionId: 's1', groupId: 'forged' } }])
    await expect(bounded(invalid)).rejects.toHaveProperty('code');
  for (const fields of [undefined, { connected: false }, { connected: true, role: 'player', kickedAt: 'now' }]) {
    actor = fields;
    await expect(bounded({ auth: { uid: 'u1' }, data: { sessionId: 's1' } })).rejects.toMatchObject({ code: 'permission-denied' });
  }
  expect(limiter.enforce).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

it('contains exhausted requests without entering the collection-reading transaction', async () => {
  const denied = { code: 'resource-exhausted', details: { commandError: 'rate-limited', retryAfterSeconds: 4 } };
  limiter.enforce.mockRejectedValueOnce(denied);
  await expect(bounded({ auth: { uid: 'u1' }, data: { sessionId: 's1' } })).rejects.toBe(denied);
  expect(read).not.toHaveBeenCalled();
  await expect(bounded({ auth: { uid: 'u2' }, data: { sessionId: 's1' } })).resolves.toHaveProperty('session');
});

it('preserves a disconnected existing player history read only after authoritative closure', async () => {
  phase = 'closed'; actor = { connected: false, role: 'player', fleetGroupId: 'fleet-1' };
  await expect(bounded({ auth: { uid: 'u1' }, data: { sessionId: 's1' } })).resolves.toHaveProperty('session');
  expect(limiter.enforce).toHaveBeenCalledOnce();
  for (const denied of [{ ...actor, role: 'gm' }, { ...actor, kickedAt: 'now' }, { ...actor, fleetGroupId: '' }]) {
    actor = denied;
    await expect(bounded({ auth: { uid: 'u1' }, data: { sessionId: 's1' } })).rejects.toMatchObject({ code: 'permission-denied' });
  }
});
