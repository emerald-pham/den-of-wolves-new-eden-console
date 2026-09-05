import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));

const { connect, joinSession } = await import('./sessionService');
const { httpsCallable } = await import('firebase/functions');

const session = {
  id: 's1',
  name: 'Table one',
  joinCode: '4821',
  phase: 'lobby' as const,
  ownerUid: 'gm1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const player = {
  uid: 'u1',
  sessionId: 's1',
  displayName: 'Player',
  role: 'player' as const,
  seatId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

function callableReturning(value: unknown) {
  return Object.assign(vi.fn().mockResolvedValue(value), { stream: vi.fn() });
}

function callableRejecting(value: unknown) {
  return Object.assign(vi.fn().mockRejectedValue(value), { stream: vi.fn() });
}

describe('connect', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays offline when a retry runs before browser connectivity returns', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    await connect();

    expect(useSessionStore.getState().connection).toBe('offline');
  });

  it('validates and refreshes a persisted session on reconnect', async () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    const callable = callableReturning({ data: { session, player } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await connect();

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'resumeSession');
    expect(callable).toHaveBeenCalledWith({ sessionId: 's1' });
    expect(useSessionStore.getState().connection).toBe('live');
  });

  it('keeps the persisted session during a transient reconnect failure', async () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    vi.mocked(httpsCallable).mockReturnValue(
      callableRejecting({ code: 'functions/unavailable' }),
    );

    await connect();

    expect(useSessionStore.getState().connection).toBe('offline');
    expect(useSessionStore.getState().session).toEqual(session);
  });

  it('clears a persisted session when membership is no longer valid', async () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    vi.mocked(httpsCallable).mockReturnValue(
      callableRejecting({ code: 'functions/permission-denied' }),
    );

    await connect();

    expect(useSessionStore.getState().connection).toBe('live');
    expect(useSessionStore.getState().session).toBeNull();
  });
});

describe('joinSession', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the player role returned by the authoritative callable', async () => {
    const callable = callableReturning({ data: { session, player } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await joinSession('4821');

    expect(useSessionStore.getState().session).toEqual(session);
    expect(useSessionStore.getState().me).toEqual(player);
  });
});
