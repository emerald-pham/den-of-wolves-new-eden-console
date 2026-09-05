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

const {
  claimGmInstance,
  connect,
  createSession,
  disconnectFromSession,
  joinSession,
  kickGmInstance,
  reconcileGmAuthority,
} = await import('./sessionService');
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

describe('GM instance commands', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(session, player);
  });

  afterEach(() => vi.restoreAllMocks());

  it('claims a named GM instance with this browser device information', async () => {
    const instance = {
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    };
    const callable = callableReturning({ data: { instance } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await claimGmInstance('Bridge laptop');

    expect(callable).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      name: 'Bridge laptop',
      instanceId: expect.any(String),
      deviceLabel: expect.any(String),
    }));
    expect(useSessionStore.getState().gmInstance).toEqual(instance);
  });

  it('queues a GM command while offline without contacting Firebase', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });

    await kickGmInstance('instance-2');

    expect(httpsCallable).not.toHaveBeenCalled();
    expect(useSessionStore.getState().pendingCommands).toEqual([
      expect.objectContaining({
        kind: 'kickGmInstance',
        payload: {
          sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2',
        },
      }),
    ]);
  });

  it('replays queued commands after refreshing the session on reconnect', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().enqueueCommand({
      id: 'command-1', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date().toISOString(),
    });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return callableReturning({ data: { session, player } });
      if (name === 'kickGmInstance') return callableReturning({ data: {} });
      if (name === 'listGmInstances') return callableReturning({ data: { instances: [
        useSessionStore.getState().gmInstance,
      ] } });
      return callableRejecting(new Error(`Unexpected callable ${name}`));
    });

    await connect();

    expect(useSessionStore.getState().pendingCommands).toEqual([]);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'kickGmInstance');
    expect(useSessionStore.getState().connection).toBe('live');
  });

  it('reports and drops a queued command that conflicts with server state', async () => {
    useSessionStore.getState().enqueueCommand({
      id: 'command-1', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date().toISOString(),
    });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return callableReturning({ data: { session, player } });
      return callableRejecting({ code: 'functions/failed-precondition', message: 'Already released.' });
    });

    await connect();

    expect(useSessionStore.getState().pendingCommands).toEqual([]);
    expect(useSessionStore.getState().communicationError).toEqual({
      code: 'failed-precondition', message: 'Already released.',
    });
  });

  it('expires offline commands after the fifteen-second reconnect window', async () => {
    useSessionStore.getState().enqueueCommand({
      id: 'command-1', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date(Date.now() - 15_001).toISOString(),
    });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return callableReturning({ data: { session, player } });
      return callableRejecting(new Error(`Unexpected callable ${name}`));
    });

    await connect();

    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), 'kickGmInstance');
    expect(useSessionStore.getState().pendingCommands).toEqual([]);
    expect(useSessionStore.getState().communicationError).toEqual({
      code: 'Wolf Intercepted Request Timeout',
      message: 'The queued command expired before the connection returned.',
    });
  });

  it('brings a kicked browser back to the server-authoritative role state', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setMode('gm');
    vi.mocked(httpsCallable).mockReturnValue(
      callableReturning({ data: { instances: [] } }),
    );

    await reconcileGmAuthority();

    expect(useSessionStore.getState().gmInstance).toBeNull();
    expect(useSessionStore.getState().mode).toBeNull();
    expect(useSessionStore.getState().lastRoute).toBe('/roles');
  });
});

describe('session lifecycle commands', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not create an overlapping session while one is loaded', async () => {
    useSessionStore.getState().setIdentity(session, player);

    await expect(createSession()).rejects.toThrow('Disconnect from the current session first.');
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('queues an offline disconnect without pretending the server accepted it', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    useSessionStore.getState().setIdentity(session, player);

    await disconnectFromSession();

    expect(useSessionStore.getState().session).toEqual(session);
    expect(useSessionStore.getState().pendingCommands).toEqual([
      expect.objectContaining({
        kind: 'disconnectFromSession',
        payload: { sessionId: 's1' },
      }),
    ]);
  });
});
