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
  popShipConfetti,
  releaseConsoleRole,
  reconcileGmAuthority,
  assignWolves,
  assignWolfRoles,
  resetWolves,
  setCapybaraEnabled,
  setDioneEnabled,
  setGmControlsLocked,
  advanceTurn,
  beginOpenAirspacePhase,
  setActiveRoleEnabled,
  selectConsoleRole,
  applyRolePreset,
  triggerDradisContact,
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

  it('keeps reconnecting while a transient outbox replay remains queued', async () => {
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().enqueueCommand({
      id: 'command-1', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date().toISOString(),
    });
    let attempts = 0;
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return callableReturning({ data: { session, player } });
      if (name === 'kickGmInstance') {
        attempts += 1;
        return attempts === 1
          ? callableRejecting({ code: 'functions/unavailable' })
          : callableReturning({ data: {} });
      }
      return callableRejecting(new Error(`Unexpected callable ${name}`));
    });

    await connect();

    expect(useSessionStore.getState().connection).toBe('offline');
    expect(useSessionStore.getState().pendingCommands).toHaveLength(1);

    await connect();

    expect(useSessionStore.getState().connection).toBe('live');
    expect(useSessionStore.getState().pendingCommands).toEqual([]);
  });

  it('queues a command when callable capacity is temporarily exhausted', async () => {
    useSessionStore.getState().setIdentity(session, player);
    vi.mocked(httpsCallable).mockReturnValue(
      callableRejecting({ code: 'functions/resource-exhausted', message: 'Try again shortly.' }),
    );

    await expect(claimGmInstance('Bridge')).resolves.toBe('queued');

    expect(useSessionStore.getState().connection).toBe('offline');
    expect(useSessionStore.getState().pendingCommands).toEqual([
      expect.objectContaining({ kind: 'claimGmInstance' }),
    ]);
  });

  it('does not restore a session after a local disconnect races a resume reply', async () => {
    useSessionStore.getState().setIdentity(session, player);
    let markResumeStarted: () => void = () => undefined;
    const resumeStarted = new Promise<void>((resolve) => { markResumeStarted = resolve; });
    let finishResume: (value: { data: { session: typeof session; player: typeof player } }) => void;
    const pendingResume = new Promise<{ data: { session: typeof session; player: typeof player } }>((resolve) => {
      finishResume = resolve;
    });
    const resume = Object.assign(vi.fn(() => {
      markResumeStarted();
      return pendingResume;
    }), { stream: vi.fn() });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return resume;
      if (name === 'disconnectFromSession') {
        return callableReturning({ data: { sessionId: 's1' } });
      }
      return callableRejecting(new Error(`Unexpected callable ${name}`));
    });

    const connecting = connect();
    await resumeStarted;
    await disconnectFromSession();
    finishResume!({ data: { session, player } });
    await connecting;

    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().me).toBeNull();
    expect(useSessionStore.getState().connection).toBe('live');
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

describe('createSession', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('declares support for the six-digit session-code format', async () => {
    const callable = callableReturning({ data: { session, player } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await createSession();

    expect(callable).toHaveBeenCalledWith({ joinCodeVersion: 2 });
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
    expect(useSessionStore.getState().me?.role).toBe('gm');
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

  it('sends Capybara availability through the active GM instance', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { capybaraEnabled: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await setCapybaraEnabled(false);

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setCapybaraEnabled');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', capybaraEnabled: false,
    });
    expect(useSessionStore.getState().session?.capybaraEnabled).toBe(false);
  });

  it('sends Dione availability through the active GM instance', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { dioneEnabled: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await setDioneEnabled(false);

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setDioneEnabled');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', dioneEnabled: false,
    });
    expect(useSessionStore.getState().session?.dioneEnabled).toBe(false);
  });

  it('sends the GM registration lock through the active GM instance', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { gmControlsLocked: true } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await setGmControlsLocked(true);

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setGmControlsLocked');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', locked: true,
    });
    expect(useSessionStore.getState().session?.gmControlsLocked).toBe(true);
  });

  it('advances the displayed turn through the active GM instance', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSession({ ...session, currentTurn: 3 });
    const callable = callableReturning({
      data: {
        currentTurn: 4,
        turnStartAnnouncement: { turn: 4, survivorPopulation: 232_501 },
        turnPhase: {
          turn: 4,
          teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
          openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
        },
      },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await advanceTurn({ overridePhaseTimer: true });

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'advanceTurn');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', expectedTurn: 3, overridePhaseTimer: true,
    });
    expect(useSessionStore.getState().session?.currentTurn).toBe(4);
    expect(useSessionStore.getState().session?.turnStartAnnouncement).toEqual({
      turn: 4,
      survivorPopulation: 232_501,
    });
    expect(useSessionStore.getState().session?.turnPhase).toEqual({
      turn: 4,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    });
  });

  it('leaves a slight server-clock lag retryable while the same team phase remains live', async () => {
    useSessionStore.getState().setSession({
      ...session,
      currentTurn: 2,
      turnPhase: {
        turn: 2,
        teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
        openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
    });
    useSessionStore.getState().setConnection('live');
    vi.mocked(httpsCallable).mockReturnValue(callableRejecting({
      code: 'functions/failed-precondition',
      message: 'The team phase timer is still active.',
    }));

    await expect(beginOpenAirspacePhase(2)).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    });
    expect(useSessionStore.getState().communicationError).toBeNull();
  });

  it('triggers a fleetwide DRADIS contact through the active GM instance', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const triggeredAt = '2026-01-01T00:05:00.000Z';
    const callable = callableReturning({ data: { triggeredAt } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await triggerDradisContact();

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'triggerDradisContact');
    expect(callable).toHaveBeenCalledWith({ sessionId: 's1', instanceId: 'instance-1' });
    expect(useSessionStore.getState().session?.dradisContactTriggeredAt).toBe(triggeredAt);
  });

  it('asks the server to randomly assign wolves and returns the secret result', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { roleIds: ['press-officer'] } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await expect(assignWolves(1)).resolves.toEqual(['press-officer']);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'assignWolves');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', count: 1,
    });
  });

  it('asks the server to save the GM-selected wolf roles', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { roleIds: ['press-officer'] } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await expect(assignWolfRoles(['press-officer'])).resolves.toEqual(['press-officer']);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'assignWolfRoles');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', roleIds: ['press-officer'],
    });
  });

  it('asks the server to reset the wolf assignment', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { reset: true } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await expect(resetWolves()).resolves.toBeUndefined();
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'resetWolves');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1',
    });
  });

  it('changes role availability and applies player-count presets through the active GM', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { activeRoleIds: ['admiral'] } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await setActiveRoleEnabled('press-officer', false);
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', roleId: 'press-officer', enabled: false,
    });
    await applyRolePreset(8);
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', playerCount: 8,
    });
    expect(useSessionStore.getState().session?.activeRoleIds).toEqual(['admiral']);
  });

  it('activates a ship confetti dispenser and records its spent state', async () => {
    const callable = callableReturning({ data: { shipId: 'aegis', status: 'fired' } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await popShipConfetti('aegis', 'admiral');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'popShipConfetti');
    expect(callable).toHaveBeenCalledWith({ sessionId: 's1', shipId: 'aegis', roleId: 'admiral' });
    expect(useSessionStore.getState().session?.confettiUsedShipIds).toEqual(['aegis']);
  });

  it('does not spend the dispenser when one officer is waiting for a second', async () => {
    const callable = callableReturning({ data: { shipId: 'dione', status: 'awaiting-officer' } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await expect(popShipConfetti('dione', 'dione-engineer')).resolves.toBe('awaiting-officer');

    expect(useSessionStore.getState().session?.confettiUsedShipIds ?? []).toEqual([]);
  });

  it('does not mark the reusable SNN evidence shredder spent', async () => {
    const callable = callableReturning({ data: { shipId: 'snn-press-shuttle' } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await popShipConfetti('snn-press-shuttle', 'press-officer');

    expect(useSessionStore.getState().session?.confettiUsedShipIds ?? []).toEqual([]);
  });

});

describe('command role presence', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(session, player);
    vi.mocked(httpsCallable).mockReturnValue(callableReturning({ data: { sessionId: 's1' } }));
  });

  afterEach(() => vi.restoreAllMocks());

  it('selects and explicitly releases the authoritative command role', async () => {
    await selectConsoleRole('admiral');
    expect(useSessionStore.getState().me?.activeConsoleRoleId).toBe('admiral');

    await releaseConsoleRole();

    expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'refreshPresence');
    expect(useSessionStore.getState().me?.activeConsoleRoleId).toBeNull();
    expect(useSessionStore.getState().mode).toBe('console');
    expect(useSessionStore.getState().lastRoute).toBe('/console');
  });

  it('reports when another player already holds the selected role', async () => {
    vi.mocked(httpsCallable).mockReturnValue(callableRejecting({
      code: 'functions/already-exists',
      message: 'That console role is already taken.',
    }));

    await expect(selectConsoleRole('admiral')).rejects.toMatchObject({
      code: 'functions/already-exists',
    });

    expect(useSessionStore.getState().me?.activeConsoleRoleId).toBeUndefined();
    expect(useSessionStore.getState().communicationError).toEqual({
      code: 'already-exists',
      message: 'That console role is already taken.',
    });
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

  it('clears the local session immediately while an online disconnect is pending', async () => {
    useSessionStore.getState().setIdentity(session, player);
    let finishDisconnect: ((value: { data: { sessionId: string } }) => void) | undefined;
    const pendingReply = new Promise<{ data: { sessionId: string } }>((resolve) => {
      finishDisconnect = resolve;
    });
    vi.mocked(httpsCallable).mockReturnValue(
      Object.assign(vi.fn(() => pendingReply), { stream: vi.fn() }),
    );

    const disconnecting = disconnectFromSession();

    expect(useSessionStore.getState().session).toBeNull();
    finishDisconnect?.({ data: { sessionId: 's1' } });
    await expect(disconnecting).resolves.toBe('applied');
  });

  it('queues an offline disconnect and immediately clears the local session', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    useSessionStore.getState().setIdentity(session, player);

    await disconnectFromSession();

    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().pendingCommands).toEqual([
      expect.objectContaining({
        kind: 'disconnectFromSession',
        payload: { sessionId: 's1' },
      }),
    ]);
  });

  it('drops unrelated queued actions when disconnecting locally', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().enqueueCommand({
      id: 'old-command', kind: 'claimGmInstance',
      payload: {
        sessionId: 's1', instanceId: 'instance-1', name: 'Bridge', deviceLabel: 'Browser',
      },
      createdAt: new Date().toISOString(),
    });

    await disconnectFromSession();

    expect(useSessionStore.getState().pendingCommands).toEqual([
      expect.objectContaining({ kind: 'disconnectFromSession' }),
    ]);
  });

  it('clears local session state even when the server says it was already gone', async () => {
    useSessionStore.getState().setIdentity(session, player);
    vi.mocked(httpsCallable).mockReturnValue(callableRejecting({
      code: 'functions/permission-denied',
      message: 'You are no longer in that session.',
    }));

    await expect(disconnectFromSession()).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });

    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().communicationError).toEqual({
      code: 'permission-denied',
      message: 'You are no longer in that session.',
    });
  });
});

it('sends population changes and acknowledgement with the GM instance', async () => {
  useSessionStore.getState().setIdentity(session, player);
  useSessionStore.getState().setGmInstance({ id: 'gm1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test', claimedAt: 'now' });
  const call = callableReturning({ data: {} });
  vi.mocked(httpsCallable).mockReturnValue(call);
  const { adjustShipPopulation, dismissPopulationAlert } = await import('./sessionService');
  await adjustShipPopulation('capybara', -1);
  expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'adjustShipPopulation');
  expect(call).toHaveBeenLastCalledWith({ sessionId: 's1', shipId: 'capybara', delta: -1, instanceId: 'gm1' });
  await dismissPopulationAlert('capybara');
  expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'dismissPopulationAlert');
  expect(call).toHaveBeenLastCalledWith({ sessionId: 's1', shipId: 'capybara', instanceId: 'gm1' });
});
