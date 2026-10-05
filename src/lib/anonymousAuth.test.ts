import { beforeEach, expect, it, vi } from 'vitest';
import type { Auth } from 'firebase/auth';
import { ensureAnonymousAuth } from './anonymousAuth';

const sdk = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('firebase/auth', () => ({ signInAnonymously: sdk.signIn }));
beforeEach(() => { vi.clearAllMocks(); });

function restored(uid: string | null) {
  return { currentUser: uid ? { uid } : null, authStateReady: vi.fn(async () => undefined) } as unknown as Auth;
}

it('fails closed when an established actor account is missing or has changed', async () => {
  await expect(ensureAnonymousAuth(restored(null), 'prepared-uid')).rejects.toThrow(/unavailable/i);
  await expect(ensureAnonymousAuth(restored('wrong-uid'), 'prepared-uid')).rejects.toThrow(/identity changed/i);
  expect(sdk.signIn).not.toHaveBeenCalled();
});

it('keeps concurrent sign-in flights separate for genuinely distinct SDK apps', async () => {
  const a = restored(null), b = restored(null);
  sdk.signIn.mockImplementation(async (instance: Auth) => ({ user: { uid: instance === a ? 'actor-a' : 'actor-b' } }));
  const [first, second] = await Promise.all([ensureAnonymousAuth(a), ensureAnonymousAuth(b)]);
  expect(first.uid).not.toBe(second.uid);
  expect(sdk.signIn).toHaveBeenCalledTimes(2);
});

it('allows a retry after a transient signup failure without retaining a rejected flight', async () => {
  const instance = restored(null);
  sdk.signIn.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ user: { uid: 'recovered' } });
  await expect(ensureAnonymousAuth(instance)).rejects.toThrow('offline');
  await expect(ensureAnonymousAuth(instance)).resolves.toMatchObject({ uid: 'recovered' });
  expect(sdk.signIn).toHaveBeenCalledTimes(2);
});
