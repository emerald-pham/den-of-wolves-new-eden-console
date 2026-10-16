import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn() },
  signIn: vi.fn(), callable: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: sdk.signIn }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => sdk.callable }));
vi.mock('./firebase', () => ({ auth: () => sdk.auth, functions: () => ({ kind: 'functions' }) }));

const { connect, joinSession } = await import('./sessionService');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); useSessionStore.getState().reset();
  sdk.auth.currentUser = null;
  sdk.auth.authStateReady.mockResolvedValue(undefined);
  sdk.callable.mockImplementation(async () => ({ data: {
    session: { id: 's1', joinCode: '482100', phase: 'lobby', ownerUid: 'gm', updatedAt: '2026-10-05T01:00:00.000Z' },
    player: { uid: sdk.auth.currentUser?.uid, sessionId: 's1', role: 'player', seatId: null },
  } }));
});

it('concurrent mount-connect and join wait for restored Auth before creating an anonymous account', async () => {
  const restoration = deferred();
  sdk.auth.authStateReady.mockReturnValue(restoration.promise);
  sdk.signIn.mockImplementation(async () => {
    sdk.auth.currentUser = { uid: 'new-anonymous' };
    return { user: sdk.auth.currentUser };
  });
  const connecting = connect();
  const joining = joinSession('482100');
  await Promise.resolve(); await Promise.resolve();
  expect(sdk.signIn).not.toHaveBeenCalled();
  sdk.auth.currentUser = { uid: 'restored-actor' };
  restoration.resolve();
  await Promise.all([connecting, joining]);
  expect(sdk.signIn).not.toHaveBeenCalled();
  expect(useSessionStore.getState().me?.uid).toBe('restored-actor');
});

it('single-flights anonymous signup across concurrent connect and join', async () => {
  const signup = deferred();
  sdk.signIn.mockImplementation(async () => {
    await signup.promise;
    sdk.auth.currentUser = { uid: 'one-anonymous' };
    return { user: sdk.auth.currentUser };
  });
  const connecting = connect();
  const joining = joinSession('482100');
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(sdk.signIn).toHaveBeenCalledTimes(1);
  signup.resolve();
  await Promise.all([connecting, joining]);
  expect(useSessionStore.getState().me?.uid).toBe('one-anonymous');
});
