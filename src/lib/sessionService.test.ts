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

const { connect } = await import('./sessionService');

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
