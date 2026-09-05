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
  functions: vi.fn(),
}));

const { connect, joinSession } = await import('./sessionService');
const { httpsCallable } = await import('firebase/functions');

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
});

describe('joinSession', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the player role returned by the authoritative callable', async () => {
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
    const callable = Object.assign(
      vi.fn().mockResolvedValue({ data: { session, player } }),
      { stream: vi.fn() },
    );
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await joinSession('4821');

    expect(useSessionStore.getState().session).toEqual(session);
    expect(useSessionStore.getState().me).toEqual(player);
  });
});
