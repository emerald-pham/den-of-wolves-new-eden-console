import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useSessionStore } from '@/store/useSessionStore';
import type { SetupReceipt } from '@/types/game';

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
  kickPlayer,
  loginGmAccess,
  logoutGmAccess,
  popShipConfetti,
  refreshPresence,
  releaseConsoleRole,
  reconcileGmAuthority,
  resumeSession,
  setCapybaraEnabled,
  setDioneEnabled,
  setPressEnabled,
  setDebriefMode,
  setGmControlsLocked,
  advanceTurn,
  startGame,
  replayTurnStartAnnouncement,
  beginOpenAirspacePhase,
  extendAirspaceWindow,
  setEmergencyTimerPaused,
  setActiveRoleEnabled,
  setActiveRoleConfiguration,
  selectConsoleRole,
  applyRolePreset,
  applyShipCounterSteps,
  adjustShipPopulation,
  adjustShipResource,
  adjustShipUnrest,
  dismissPopulationAlert,
  dismissUnrestAlert,
  jumpShip,
  moveShipToLocation,
  setShipConsoleLock,
  startSinglePlayerDemo,
  triggerDradisContact,
} = await import('./sessionService');
const { httpsCallable } = await import('firebase/functions');
const { acceptCallableSessionAuthority, sessionSnapshotAuthorityFor } = await import('./firestore');
const authorityService = await import('./sessionService') as unknown as {
  confirmSetup: (setup: {
    playerCount: number;
    chartId: 'A' | 'B' | 'C';
    expansion: 'base' | 'capybara' | 'none';
    turnLimit: 6 | 7 | 8;
    dioneEnabled: boolean;
    capybaraEnabled: boolean;
    universalArbourEnabled: boolean;
    wolfCultEnabled: boolean;
    activeRoleIds: readonly string[];
  }) => Promise<unknown>;
  claimSeat: (seatId: string) => Promise<unknown>;
  releaseSeat: (seatId: string, reason: string) => Promise<unknown>;
  assignRole: (targetUid: string, roleId: string) => Promise<unknown>;
  releaseRole: (targetUid: string) => Promise<unknown>;
  setFacilitatorResponsibility: (change: {
    responsibility: 'main' | 'assistant';
    mode: 'share' | 'handoff' | 'drop';
    targetInstanceId?: string;
  }) => Promise<unknown>;
};

const session = {
  id: 's1',
  name: 'Table one',
  joinCode: '4821',
  phase: 'lobby' as const,
  ownerUid: 'gm1',
  pressEnabled: true,
  pressAvailabilityRevision: 0,
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

  it('does not promote a cache-marked offline connection before authority is accepted', async () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    let finishResume!: (value: { data: { session: typeof session; player: typeof player } }) => void;
    const resume = Object.assign(vi.fn(() => new Promise<{ data: { session: typeof session; player: typeof player } }>((resolve) => {
      finishResume = resolve;
    })), { stream: vi.fn() });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return resume;
      return callableReturning({ data: {} });
    });

    const connecting = connect();
    await vi.waitFor(() => expect(resume).toHaveBeenCalled());
    act(() => useSessionStore.getState().setConnection('offline'));
    finishResume({ data: { session, player } });
    await connecting;

    expect(useSessionStore.getState().connection).toBe('offline');
  });

  it('does not authorize a mutation while cached state is offline', async () => {
    useSessionStore.getState().setIdentity(
      { ...session, phase: 'casting', currentTurn: 0, setupRevision: 4 },
      { ...player, role: 'gm' },
    );
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('offline');

    await expect(startGame()).rejects.toThrow('Reconnect before starting the game.');
    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), 'startGame');
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

  it('clears every persisted authority field after a terminal resume denial', async () => {
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setSeats([{
      id: 'seat-1', sessionId: 's1', label: 'Seat 1', status: 'claimed',
      holderUid: 'u1', factionId: null, claimedAt: '2026-01-01T00:00:00.000Z',
    }]);
    useSessionStore.getState().setGmInstance({
      id: 'bridge', sessionId: 's1', uid: 'u1', name: 'Bridge',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setMode('gm');
    useSessionStore.getState().setLastRoute('/gm');
    vi.mocked(httpsCallable).mockReturnValue(
      callableRejecting({ code: 'functions/not-found' }),
    );

    await connect();

    expect(useSessionStore.getState()).toMatchObject({
      session: null,
      me: null,
      seats: [],
      gmInstance: null,
      mode: null,
      lastRoute: null,
    });
  });

  it('keeps reconnecting while a transient outbox replay remains queued', async () => {
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().enqueueCommand({
      id: 'command-1', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date().toISOString(),
      queuedWithServerAuthority: true,
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
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
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

    expect(useSessionStore.getState().session).toMatchObject(session);
    expect(useSessionStore.getState().session?.shuttleDockings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'dione' }),
      ]),
    );
    expect(useSessionStore.getState().me).toEqual(player);
  });

  it('seeds the listener authority from an accepted callable reply', async () => {
    const callableSession = { ...session, id: 'join-authority', joinCode: '918204' };
    const callablePlayer = { ...player, sessionId: callableSession.id };
    vi.mocked(httpsCallable).mockReturnValue(callableReturning({
      data: { session: callableSession, player: callablePlayer },
    }));

    await joinSession(callableSession.joinCode);

    expect(sessionSnapshotAuthorityFor(callableSession.id, callablePlayer.uid))
      .toMatchObject({ hasServerSessionAuthority: true });
  });

  it('does not let a late same-uid join hydrate over the newer displayed session', async () => {
    const sessionA = { ...session, id: 'join-a', joinCode: '111111', updatedAt: '2026-09-11T12:00:00.000Z' };
    const sessionB = { ...session, id: 'join-b', joinCode: '222222', updatedAt: '2026-09-11T12:01:00.000Z' };
    const playerA = { ...player, sessionId: sessionA.id };
    const playerB = { ...player, sessionId: sessionB.id };
    let resolveA!: (value: { data: { session: typeof sessionA; player: typeof playerA } }) => void;
    let resolveB!: (value: { data: { session: typeof sessionB; player: typeof playerB } }) => void;
    const joinA = Object.assign(vi.fn(() => new Promise<{ data: { session: typeof sessionA; player: typeof playerA } }>((resolve) => {
      resolveA = resolve;
    })), { stream: vi.fn() });
    const joinB = Object.assign(vi.fn(() => new Promise<{ data: { session: typeof sessionB; player: typeof playerB } }>((resolve) => {
      resolveB = resolve;
    })), { stream: vi.fn() });
    vi.mocked(httpsCallable)
      .mockReturnValueOnce(joinA as never)
      .mockReturnValueOnce(joinB as never);

    const joiningA = joinSession(sessionA.joinCode);
    await vi.waitFor(() => expect(joinA).toHaveBeenCalled());
    const joiningB = joinSession(sessionB.joinCode);
    await vi.waitFor(() => expect(joinB).toHaveBeenCalled());
    resolveB({ data: { session: sessionB, player: playerB } });
    await joiningB;
    useSessionStore.getState().setMode('gm');
    useSessionStore.getState().setLastRoute('/gm/join-b');
    expect(useSessionStore.getState()).toMatchObject({
      session: sessionB,
      me: playerB,
      sessionSnapshotFreshness: 'server',
      mode: 'gm',
      lastRoute: '/gm/join-b',
    });

    resolveA({ data: { session: sessionA, player: playerA } });
    await joiningA;

    expect(useSessionStore.getState()).toMatchObject({
      session: sessionB,
      me: playerB,
      sessionSnapshotFreshness: 'server',
      mode: 'gm',
      lastRoute: '/gm/join-b',
    });
  });

  it('does not let a late create hydrate over a newer join session', async () => {
    const createdSession = { ...session, id: 'created-a', joinCode: '333333', updatedAt: '2026-09-11T12:00:00.000Z' };
    const joinedSession = { ...session, id: 'joined-b', joinCode: '444444', updatedAt: '2026-09-11T12:01:00.000Z' };
    const createdPlayer = { ...player, sessionId: createdSession.id };
    const joinedPlayer = { ...player, sessionId: joinedSession.id };
    let resolveCreate!: (value: { data: { session: typeof createdSession; player: typeof createdPlayer } }) => void;
    let resolveJoin!: (value: { data: { session: typeof joinedSession; player: typeof joinedPlayer } }) => void;
    const create = Object.assign(vi.fn(() => new Promise<{ data: { session: typeof createdSession; player: typeof createdPlayer } }>((resolve) => {
      resolveCreate = resolve;
    })), { stream: vi.fn() });
    const join = Object.assign(vi.fn(() => new Promise<{ data: { session: typeof joinedSession; player: typeof joinedPlayer } }>((resolve) => {
      resolveJoin = resolve;
    })), { stream: vi.fn() });
    vi.mocked(httpsCallable).mockImplementation((_functions, name) => {
      if (name === 'createSession') return create as never;
      if (name === 'joinSession') return join as never;
      return callableRejecting(new Error(`Unexpected callable ${name}`)) as never;
    });

    const creating = createSession('A');
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    const joining = joinSession(joinedSession.joinCode);
    await vi.waitFor(() => expect(join).toHaveBeenCalled());
    resolveJoin({ data: { session: joinedSession, player: joinedPlayer } });
    await joining;
    useSessionStore.getState().setMode('gm');
    useSessionStore.getState().setLastRoute('/gm/joined-b');

    resolveCreate({ data: { session: createdSession, player: createdPlayer } });
    await creating;

    expect(useSessionStore.getState()).toMatchObject({
      session: joinedSession,
      me: joinedPlayer,
      sessionSnapshotFreshness: 'server',
      mode: 'gm',
      lastRoute: '/gm/joined-b',
    });
  });
});

describe('authoritative session replies', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(session, player);
  });

  afterEach(() => vi.restoreAllMocks());

  it('refuses a resume reply for a different session instead of replacing local identity', async () => {
    const otherSession = { ...session, id: 's2', joinCode: '9999' };
    vi.mocked(httpsCallable).mockReturnValue(
      callableReturning({ data: { session: otherSession, player: { ...player, sessionId: 's2' } } }),
    );

    await expect(resumeSession('s1')).resolves.toBe(false);

    expect(useSessionStore.getState().session).toEqual(session);
    expect(useSessionStore.getState().me).toEqual(player);
  });

  it('continues to accept a resume reply for the displayed session identity', async () => {
    vi.mocked(httpsCallable).mockReturnValue(
      callableReturning({ data: { session, player } }),
    );

    await expect(resumeSession(session.id)).resolves.toBe(true);

    expect(useSessionStore.getState()).toMatchObject({
      session,
      me: player,
      sessionSnapshotFreshness: 'server',
    });
  });

  it('does not call a rejected resume payload a live connection', async () => {
    const otherSession = { ...session, id: 's2', joinCode: '9999' };
    vi.mocked(httpsCallable).mockReturnValue(
      callableReturning({ data: { session: otherSession, player: { ...player, sessionId: 's2' } } }),
    );

    await connect();

    expect(useSessionStore.getState()).toMatchObject({
      connection: 'offline',
      session,
      me: player,
    });
  });

  it('keeps cached freshness and blocks mutations after a stale callable reply', async () => {
    const sessionId = 'stale-callable';
    const newerSession = {
      ...session,
      id: sessionId,
      phase: 'active' as const,
      currentTurn: 1,
      updatedAt: '2026-09-11T12:00:00.000Z',
    };
    const staleSession = {
      ...session,
      id: sessionId,
      updatedAt: '2026-09-11T11:00:00.000Z',
    };
    const gmPlayer = { ...player, role: 'gm' as const, sessionId };
    useSessionStore.getState().setIdentity(newerSession, gmPlayer);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId, uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
    const freshReply = callableReturning({ data: { session: newerSession, player: gmPlayer } });
    const staleReply = callableReturning({ data: { session: staleSession, player: gmPlayer } });
    vi.mocked(httpsCallable)
      .mockReturnValueOnce(freshReply)
      .mockReturnValueOnce(staleReply);

    await expect(resumeSession(sessionId)).resolves.toBe(true);
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    await expect(resumeSession(sessionId)).resolves.toBe(true);

    expect(useSessionStore.getState().session).toMatchObject({
      phase: 'active', currentTurn: 1, updatedAt: newerSession.updatedAt,
    });
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
    await expect(startGame()).rejects.toThrow(/reconnect/i);
    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), 'startGame');
  });

  it('does not promote a stale callable reconnect to live authority', async () => {
    const newerSession = {
      ...session,
      id: 'stale-connect',
      phase: 'active' as const,
      currentTurn: 1,
      updatedAt: '2026-09-11T12:00:00.000Z',
    };
    const staleSession = { ...newerSession, updatedAt: '2026-09-11T11:00:00.000Z' };
    const reconnectPlayer = { ...player, sessionId: newerSession.id };
    useSessionStore.getState().setIdentity(newerSession, reconnectPlayer);
    useSessionStore.getState().setConnection('offline');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    expect(acceptCallableSessionAuthority(newerSession, reconnectPlayer.uid)).toBe(true);
    vi.mocked(httpsCallable).mockReturnValue(callableReturning({
      data: { session: staleSession, player: reconnectPlayer },
    }));

    await connect();

    expect(useSessionStore.getState()).toMatchObject({
      session: newerSession,
      me: reconnectPlayer,
      connection: 'offline',
      sessionSnapshotFreshness: 'cache',
    });
  });
});

it('starts production through one server receipt and hydrates the GM-private setup result', async () => {
  useSessionStore.getState().setIdentity(
    { ...session, phase: 'casting', currentTurn: 0, setupRevision: 4 },
    { ...player, role: 'gm' },
  );
  useSessionStore.getState().setGmInstance({
    id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setGmSetupReceipt(null);
  const callable = callableReturning({
    data: {
      status: 'committed', sessionId: 's1', requestId: 'start-1', currentTurn: 1,
      setupRevision: 5,
      turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
      turnPhase: {
        turn: 1,
        teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
        openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
      },
      setupReceipt: {
        source: 'routine-start', playerCount: 8,
        mode: 'base', rosterIds: ['admiral'], pressEligibility: {},
        excludedGmCount: 1, wolfCount: 1, wolfRule: 'one-wolf-at-8-13',
        selectedWolfRoleIds: ['admiral'], eligibleRoleIds: ['admiral'],
        orderedModifiers: [], resultCount: 8, loyaltySource: 'automatic-default',
        request: {}, expectedSetupRevision: 4, committedSetupRevision: 5,
        actorUid: 'u1', serverTime: '2026-09-09T00:00:00.000Z', event: 'game-started',
      },
    },
  });
  vi.mocked(httpsCallable).mockReturnValue(callable);

  const reply = await startGame();

  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'startGame');
  expect(callable).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', instanceId: 'instance-1', expectedSetupRevision: 4,
    requestId: expect.any(String),
  }));
  expect(reply.status).toBe('committed');
  expect(useSessionStore.getState().session).toMatchObject({
    phase: 'active', currentTurn: 1, configurationLocked: true, setupRevision: 5,
    pursuitGroups: { fleet: 2 },
  });
  expect(useSessionStore.getState().gmSetupReceipt).toMatchObject({
    source: 'routine-start', committedSetupRevision: 5,
  });
});

it('reuses the same start request id after an ambiguous transport failure', async () => {
  useSessionStore.getState().setIdentity(
    { ...session, phase: 'casting', currentTurn: 0, setupRevision: 4 },
    { ...player, role: 'gm' },
  );
  useSessionStore.getState().setGmInstance({
    id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  const reply = {
    status: 'replayed' as const, sessionId: 's1', requestId: 'retry-start', currentTurn: 1,
    setupRevision: 5,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
    setupReceipt: {
      source: 'routine-start', playerCount: 8, mode: 'base',
      rosterIds: ['admiral'], pressEligibility: {}, excludedGmCount: 1, wolfCount: 1,
      wolfRule: 'one-wolf-at-8-13', selectedWolfRoleIds: ['admiral'], eligibleRoleIds: ['admiral'],
      orderedModifiers: [], resultCount: 8, loyaltySource: 'automatic-default', request: {},
      expectedSetupRevision: 4, committedSetupRevision: 5, actorUid: 'u1',
      serverTime: '2026-09-09T00:00:00.000Z', event: 'game-started',
    },
  };
  const callable = Object.assign(
    vi.fn()
      .mockRejectedValueOnce({ code: 'functions/unavailable', message: 'Transport interrupted.' })
      .mockResolvedValueOnce({ data: reply }),
    { stream: vi.fn() },
  );
  vi.mocked(httpsCallable).mockReturnValue(callable);

  await expect(startGame()).rejects.toMatchObject({ code: 'functions/unavailable' });
  const firstPayload = callable.mock.calls[0]?.[0] as { requestId: string };
  await expect(startGame()).resolves.toMatchObject({ status: 'replayed' });
  const secondPayload = callable.mock.calls[1]?.[0] as { requestId: string };
  expect(firstPayload.requestId).toBeTruthy();
  expect(secondPayload.requestId).toBe(firstPayload.requestId);
  expect(callable).toHaveBeenCalledTimes(2);
});

it('keeps a structured stale start result out of local Turn 1 hydration', async () => {
  useSessionStore.getState().setIdentity(
    { ...session, phase: 'casting', currentTurn: 0, setupRevision: 4 },
    { ...player, role: 'gm' },
  );
  useSessionStore.getState().setGmInstance({
    id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setGmSetupReceipt(null);
  const stale = {
    status: 'stale' as const, sessionId: 's1', requestId: 'stale-start',
    expectedSetupRevision: 4, currentSetupRevision: 5,
  };
  const callable = Object.assign(
    vi.fn().mockResolvedValue({ data: stale }),
    { stream: vi.fn() },
  );
  vi.mocked(httpsCallable).mockReturnValue(callable);

  await expect(startGame({ requestId: 'stale-start' })).resolves.toEqual(stale);
  await expect(startGame({ requestId: 'stale-start' })).resolves.toEqual(stale);
  expect(callable).toHaveBeenCalledTimes(2);
  expect(callable.mock.calls[0]?.[0]).toMatchObject({ requestId: 'stale-start' });
  expect(callable.mock.calls[1]?.[0]).toMatchObject({ requestId: 'stale-start' });
  expect(useSessionStore.getState().session).toMatchObject({ phase: 'casting', currentTurn: 0, setupRevision: 4 });
  expect(useSessionStore.getState().gmSetupReceipt).toBeNull();
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

    expect(callable).toHaveBeenCalledWith(expect.objectContaining({
      joinCodeVersion: 2,
      requestId: expect.any(String),
    }));
  });

});

describe('GM instance commands', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
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

  it('rejects a cache-derived GM mutation while offline without contacting Firebase', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(kickGmInstance('instance-2')).rejects.toThrow(/reconnect/i);

    expect(httpsCallable).not.toHaveBeenCalled();
    expect(useSessionStore.getState().pendingCommands).toEqual([]);
  });

  it('sends a player kick through the named GM instance', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: {} });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await kickPlayer('u2');

    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', targetUid: 'u2',
    });
    expect(useSessionStore.getState().pendingCommands).toEqual([]);
  });

  it('replays a server-authorized queued command after refreshing the session on reconnect', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().enqueueCommand({
      id: 'command-1', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date().toISOString(),
      queuedWithServerAuthority: true,
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

  it('reconciles GM authority after a server-authorized resume while reconnecting', async () => {
    const sessionId = 'reconcile-on-connect';
    const reconnectSession = { ...session, id: sessionId };
    const reconnectPlayer = { ...player, sessionId };
    useSessionStore.getState().setIdentity(reconnectSession, reconnectPlayer);
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId, uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return callableReturning({
        data: { session: reconnectSession, player: reconnectPlayer },
      });
      if (name === 'listGmInstances') return callableReturning({ data: { instances: [] } });
      return callableRejecting(new Error(`Unexpected callable ${name}`));
    });

    await connect();

    expect(useSessionStore.getState().gmInstance).toBeNull();
    expect(useSessionStore.getState().connection).toBe('live');
  });

  it('drops a cache-derived outbox mutation instead of replaying it after reconnect', async () => {
    useSessionStore.getState().setConnection('offline');
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    useSessionStore.getState().enqueueCommand({
      id: 'cached-command', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date().toISOString(),
    });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return callableReturning({ data: { session, player } });
      if (name === 'kickGmInstance') return callableReturning({ data: {} });
      return callableRejecting(new Error(`Unexpected callable ${name}`));
    });

    await connect();

    expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), 'kickGmInstance');
    expect(useSessionStore.getState().pendingCommands).toEqual([]);
    expect(useSessionStore.getState().communicationError).toEqual({
      kind: 'stale-revision',
      code: 'stale',
      message: 'The live session changed before this command committed. Refresh the live state and retry.',
    });
  });

  it('reports and drops a queued command that conflicts with server state', async () => {
    useSessionStore.getState().enqueueCommand({
      id: 'command-1', kind: 'kickGmInstance',
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: new Date().toISOString(),
      queuedWithServerAuthority: true,
    });
    vi.mocked(httpsCallable).mockImplementation((_, name) => {
      if (name === 'resumeSession') return callableReturning({ data: { session, player } });
      return callableRejecting({ code: 'functions/failed-precondition', message: 'Already released.' });
    });

    await connect();

    expect(useSessionStore.getState().pendingCommands).toEqual([]);
    expect(useSessionStore.getState().communicationError).toEqual({
      kind: 'unknown',
      code: 'failed-precondition',
      message: 'The command could not be completed. Refresh the live state and try again.',
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

  it('sends Press availability with the live CAS revision and applies the server result', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSession({
      ...session,
      pressEnabled: true,
      pressAvailabilityRevision: 4,
    });
    const callable = callableReturning({ data: { pressEnabled: false, revision: 5 } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await expect(setPressEnabled(false)).resolves.toBe('applied');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setPressEnabled');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1',
      instanceId: 'instance-1',
      requestId: expect.any(String),
      pressEnabled: false,
      expectedRevision: 4,
    });
    expect(useSessionStore.getState().session).toMatchObject({
      pressEnabled: false,
      pressAvailabilityRevision: 5,
    });
  });

  it('does not optimistically overwrite Press authority after a stale rejection', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSession({
      ...session,
      pressEnabled: true,
      pressAvailabilityRevision: 4,
    });
    vi.mocked(httpsCallable).mockReturnValue(callableRejecting({
      code: 'functions/failed-precondition',
      message: 'Press availability changed. Wait for the live update and try again.',
    }));

    await expect(setPressEnabled(false)).rejects.toMatchObject({ code: 'functions/failed-precondition' });

    expect(useSessionStore.getState().session).toMatchObject({
      pressEnabled: true,
      pressAvailabilityRevision: 4,
    });
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

  it('sends finale state through the active GM instance and applies the server result', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({
      data: { debriefMode: { active: true, revision: 1 } },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await setDebriefMode(true);

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setDebriefMode');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', active: true,
    });
    expect(useSessionStore.getState().session?.debriefMode).toEqual({ active: true, revision: 1 });

    const retractCallable = callableReturning({
      data: { debriefMode: { active: false, revision: 2 } },
    });
    vi.mocked(httpsCallable).mockReturnValue(retractCallable);

    await setDebriefMode(false);

    expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'setDebriefMode');
    expect(retractCallable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', active: false,
    });
    expect(useSessionStore.getState().session?.debriefMode).toEqual({ active: false, revision: 2 });
  });

  it('replays the current transmission locally for this GM only', async () => {
    vi.mocked(httpsCallable).mockReset();
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSession({
      ...session,
      currentTurn: 1,
      turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
    });

    await replayTurnStartAnnouncement('gm');

    expect(useSessionStore.getState().turnStartReplay).toMatchObject({
      sessionId: 's1', turn: 1, survivorPopulation: 242_500,
    });
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('replays the current transmission through the server for everyone', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSession({
      ...session,
      currentTurn: 2,
      turnStartAnnouncement: { turn: 2, survivorPopulation: 237_000, revision: 3 },
    });
    const callable = callableReturning({
      data: { turnStartAnnouncement: { turn: 2, survivorPopulation: 237_000, revision: 4 } },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await replayTurnStartAnnouncement('everyone');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'replayTurnStartAnnouncement');
    expect(callable).toHaveBeenCalledWith({ sessionId: 's1', instanceId: 'instance-1' });
    expect(useSessionStore.getState().session?.turnStartAnnouncement).toEqual({
      turn: 2, survivorPopulation: 237_000, revision: 4,
    });
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
        maintenanceCycles: {
          aegis: { step: 0, revision: 8, results: {}, charges: [], refuelled: [] },
        },
        shuttleFuelled: { starlight: false },
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
    expect(useSessionStore.getState().session?.maintenanceCycles).toEqual({
      aegis: { step: 0, revision: 8, results: {}, charges: [], refuelled: [] },
    });
    expect(useSessionStore.getState().session?.shuttleFuelled).toEqual({ starlight: false });
  });

  it('skips the Turn 1 fullscreen transmission and clears stale announcement state', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setSession({
      ...session,
      currentTurn: 0,
      turnStartAnnouncement: { turn: 1, survivorPopulation: 242_500 },
    });
    const callable = callableReturning({
      data: {
        currentTurn: 1,
        turnPhase: {
          turn: 1,
          teamPhaseEndsAt: '2026-01-01T00:10:00.000Z',
          openAirspaceEndsAt: '2026-01-01T00:30:00.000Z',
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
        },
      },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await advanceTurn({ skipTurnStartAnnouncement: true });

    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', expectedTurn: 0,
      skipTurnStartAnnouncement: true,
    });
    expect(useSessionStore.getState().session?.currentTurn).toBe(1);
    expect(useSessionStore.getState().session?.turnStartAnnouncement).toBeUndefined();
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
      message: 'The airspace-closed timer is still active.',
    }));

    await expect(beginOpenAirspacePhase(2)).rejects.toMatchObject({
      code: 'functions/failed-precondition',
    });
    expect(useSessionStore.getState().communicationError).toBeNull();
  });

  it('extends the server-owned airspace phase and reconciles the returned clock', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
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
    const callable = callableReturning({
      data: {
        turnPhase: {
          turn: 2,
          teamPhaseEndsAt: '2026-01-01T00:10:00.000Z',
          openAirspaceEndsAt: '2026-01-01T00:25:00.000Z',
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
        },
      },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await extendAirspaceWindow('restricted');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'extendAirspaceWindow');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', expectedTurn: 2, window: 'restricted',
    });
    expect(useSessionStore.getState().session?.turnPhase).toEqual({
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:10:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:25:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    });
  });

  it('changes the emergency timer only through the live GM callable and reconciles the pause', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
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
    const callable = callableReturning({
      data: {
        turnPhase: {
          turn: 2,
          teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
          openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
          timerPause: {
            window: 'restricted', remainingMs: 180_000,
            pausedAt: '2026-01-01T00:02:00.000Z',
          },
        },
      },
    });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await setEmergencyTimerPaused(true);

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setEmergencyTimerPaused');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', expectedTurn: 2, paused: true,
    });
    expect(useSessionStore.getState().session?.turnPhase).toEqual(expect.objectContaining({
      timerPause: {
        window: 'restricted', remainingMs: 180_000,
        pausedAt: '2026-01-01T00:02:00.000Z',
      },
    }));
  });

  it('does not queue an emergency timer command while offline', async () => {
    useSessionStore.getState().setConnection('offline');
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(setEmergencyTimerPaused(true)).rejects.toThrow(/reconnect and claim gm/i);
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(useSessionStore.getState().pendingCommands).toEqual([]);
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

  it('sends one confirmed role configuration through the active GM', async () => {
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    const callable = callableReturning({ data: { activeRoleIds: ['admiral'] } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await setActiveRoleConfiguration(['admiral']);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setActiveRoleConfiguration');
    expect(callable).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'instance-1', activeRoleIds: ['admiral'],
    });
    expect(useSessionStore.getState().session?.activeRoleIds).toEqual(['admiral']);

    await setActiveRoleEnabled('press-officer', false);
    await applyRolePreset(8);
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

describe('GM access login', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(session, player);
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs in through the callable and stores only a local timestamp', async () => {
    const callable = callableReturning({ data: { authenticated: true } });
    vi.mocked(httpsCallable).mockReturnValue(callable);

    await loginGmAccess('bananasplit');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'loginGmAccess');
    expect(callable).toHaveBeenCalledWith({ password: 'bananasplit' });
    expect(useSessionStore.getState().gmAccessAuthenticatedAt).toEqual(expect.any(Number));
    expect(localStorage.getItem('gmAccessPassword')).toBeNull();
  });

  it('logs out through the callable and clears the local GM session', async () => {
    const callable = callableReturning({ data: { authenticated: false } });
    vi.mocked(httpsCallable).mockReturnValue(callable);
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    useSessionStore.getState().setGmInstance({
      id: 'instance-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });

    await logoutGmAccess();

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'logoutGmAccess');
    expect(callable).toHaveBeenCalledWith({ sessionId: 's1', instanceId: 'instance-1' });
    expect(useSessionStore.getState().gmAccessAuthenticatedAt).toBeNull();
    expect(useSessionStore.getState().gmInstance).toBeNull();
  });
});

describe('command role presence', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(session, player);
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
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
      kind: 'conflict',
      code: 'already-exists',
      message: 'Another command won this update. Refresh the live state and retry.',
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
    await vi.waitFor(() => expect(finishDisconnect).toBeTypeOf('function'));
    const sessionB = { ...session, id: 's2', joinCode: '918204' };
    const playerB = { ...player, sessionId: sessionB.id, activeConsoleRoleId: 'b-console-role' };
    const gmB = {
      id: 'gm-b', sessionId: sessionB.id, uid: 'u1', name: 'Bridge B',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    };
    const seatsB = [{
      id: 'seat-b', sessionId: sessionB.id, label: 'Seat B', status: 'claimed' as const,
      holderUid: 'u1', factionId: null, claimedAt: '2026-01-01T00:00:00.000Z',
    }];
    const store = useSessionStore.getState();
    store.setIdentity(sessionB, playerB);
    store.setGmInstance(gmB);
    store.setSeats(seatsB);
    store.setPrivateLoyalty({ kind: 'B loyalty', suspicion: 2 });
    store.setMode('gm');
    store.setLastRoute('/gm/session-b');
    store.setConnection('live');
    finishDisconnect?.({ data: { sessionId: 's1' } });
    await expect(disconnecting).resolves.toBe('applied');

    expect(useSessionStore.getState()).toMatchObject({
      session: sessionB,
      me: playerB,
      gmInstance: gmB,
      seats: seatsB,
      privateLoyalty: { kind: 'B loyalty', suspicion: 2 },
      connection: 'live',
      mode: 'gm',
      lastRoute: '/gm/session-b',
    });
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

  it('keeps an unavailable disconnect queued until a later server acknowledgement', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get');
    online.mockReturnValue(false);
    useSessionStore.getState().setIdentity(session, player);
    await disconnectFromSession();
    online.mockReturnValue(true);
    vi.mocked(httpsCallable).mockReturnValue(
      callableRejecting({ code: 'functions/unavailable' }),
    );

    await connect();

    expect(useSessionStore.getState().connection).toBe('offline');
    expect(useSessionStore.getState().pendingCommands).toEqual([
      expect.objectContaining({ kind: 'disconnectFromSession' }),
    ]);
  });

  it('removes a queued disconnect only after the server acknowledges it', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get');
    online.mockReturnValue(false);
    useSessionStore.getState().setIdentity(session, player);
    await disconnectFromSession();
    const sessionB = { ...session, id: 's2', joinCode: '918204' };
    const playerB = { ...player, sessionId: sessionB.id, activeConsoleRoleId: 'b-console-role' };
    const gmB = {
      id: 'gm-b', sessionId: sessionB.id, uid: 'u1', name: 'Bridge B',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    };
    const seatsB = [{
      id: 'seat-b', sessionId: sessionB.id, label: 'Seat B', status: 'claimed' as const,
      holderUid: 'u1', factionId: null, claimedAt: '2026-01-01T00:00:00.000Z',
    }];
    const store = useSessionStore.getState();
    store.setIdentity(sessionB, playerB);
    store.setGmInstance(gmB);
    store.setSeats(seatsB);
    store.setPrivateLoyalty({ kind: 'B loyalty', suspicion: 2 });
    store.setMode('gm');
    store.setLastRoute('/gm/session-b');
    store.setSessionSnapshotFreshness('server');
    online.mockReturnValue(true);
    vi.mocked(httpsCallable).mockImplementation((_functions, name) => {
      if (name === 'resumeSession') {
        return callableReturning({ data: { session: sessionB, player: playerB } });
      }
      if (name === 'disconnectFromSession') {
        return callableReturning({ data: { sessionId: 's1' } });
      }
      if (name === 'listGmInstances') return callableReturning({ data: { instances: [gmB] } });
      return callableRejecting(new Error('Unexpected callable ' + name));
    });

    await connect();

    expect(useSessionStore.getState().pendingCommands).toEqual([]);
    expect(useSessionStore.getState()).toMatchObject({
      session: sessionB,
      me: playerB,
      gmInstance: gmB,
      seats: seatsB,
      privateLoyalty: { kind: 'B loyalty', suspicion: 2 },
      connection: 'live',
      mode: 'gm',
      lastRoute: '/gm/session-b',
    });
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
      kind: 'unauthorized',
      code: 'permission-denied',
      message: 'This command is not available to the current station.',
    });
  });
});

describe('client authority boundaries', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity({
      ...session,
      capybaraEnabled: true,
      dioneEnabled: true,
      gmControlsLocked: false,
    }, player);
    useSessionStore.getState().setGmInstance({
      id: 'bridge', sessionId: 's1', uid: 'u1', name: 'Bridge',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not invent settings from a malformed server result', async () => {
    vi.mocked(httpsCallable).mockReturnValue(callableReturning({ data: {} }));

    await setCapybaraEnabled(false);
    await setDioneEnabled(false);
    await setGmControlsLocked(true);

    expect(useSessionStore.getState().session).toMatchObject({
      capybaraEnabled: true,
      dioneEnabled: true,
      gmControlsLocked: false,
    });
  });

  it('does not send a presence mutation when this browser is offline or has no session', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    await refreshPresence();
    useSessionStore.getState().disconnect();
    await refreshPresence();

    expect(httpsCallable).not.toHaveBeenCalled();
  });
});

describe('immediate mutations require fresh server authority', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity({
      ...session,
      phase: 'casting',
      currentTurn: 1,
      turnStartAnnouncement: { turn: 1, survivorPopulation: 240_000 },
    }, { ...player, role: 'gm' });
    useSessionStore.getState().setGmInstance({
      id: 'bridge', sessionId: 's1', uid: 'u1', name: 'Bridge',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('cache');
    vi.mocked(httpsCallable).mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['resource counter', () => adjustShipResource('aegis', 'ore', 1), true],
    ['unrest counter', () => adjustShipUnrest('aegis', 1), true],
    ['unrest acknowledgement', () => dismissUnrestAlert('aegis'), true],
    ['population counter', () => adjustShipPopulation('aegis', 1), true],
    ['population acknowledgement', () => dismissPopulationAlert('aegis'), true],
    ['counter batch', () => applyShipCounterSteps('aegis', { counter: 'unrest' }, []), true],
    ['ship movement', () => moveShipToLocation('aegis', 'A-1'), true],
    ['console lock', () => setShipConsoleLock('aegis', true), true],
    ['ship jump', () => jumpShip('aegis', 'A-1'), true],
    ['game start', () => startGame(), true],
    ['turn advance', () => advanceTurn(), true],
    ['single-player demo', () => {
      const state = useSessionStore.getState();
      state.setSession({ ...state.session!, currentTurn: 0 });
      return startSinglePlayerDemo();
    }, true],
    ['fleetwide replay', () => replayTurnStartAnnouncement('everyone'), true],
    ['automatic airspace handoff', () => beginOpenAirspacePhase(1), false],
    ['airspace extension', () => extendAirspaceWindow('restricted'), true],
    ['emergency timer interlock', () => setEmergencyTimerPaused(true), true],
    ['DRADIS contact', () => triggerDradisContact(), true],
    ['console-role claim', () => selectConsoleRole('admiral'), true],
    ['console-role release', () => releaseConsoleRole(), true],
    ['presence heartbeat', () => refreshPresence(), false],
  ] as const)('does not call %s from a cache-backed session', async (_name, invoke, rejects) => {
    const pending = invoke();
    if (rejects) {
      await expect(pending).rejects.toThrow(/reconnect/i);
    } else {
      await expect(pending).resolves.toBeUndefined();
    }
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});

it('does not let a delayed direct callable patch overwrite newer session authority', async () => {
  const sessionId = 'direct-patch-race';
  const playerForRace = { ...player, sessionId };
  const initialSession = {
    ...session,
    id: sessionId,
    phase: 'active' as const,
    currentTurn: 1,
    updatedAt: '2026-09-11T12:00:00.000Z',
  };
  const newerSession = {
    ...initialSession,
    currentTurn: 2,
    updatedAt: '2026-09-11T12:01:00.000Z',
  };
  useSessionStore.getState().setIdentity(initialSession, playerForRace);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  expect(acceptCallableSessionAuthority(initialSession, playerForRace.uid)).toBe(true);

  let finishMove!: (value: { data: { shipId: string; destination: string } }) => void;
  const move = Object.assign(vi.fn(() => new Promise<{ data: { shipId: string; destination: string } }>((resolve) => {
    finishMove = resolve;
  })), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(move as never);
  const moving = moveShipToLocation('aegis', 'A-1');
  await vi.waitFor(() => expect(move).toHaveBeenCalled());

  expect(acceptCallableSessionAuthority(newerSession, playerForRace.uid)).toBe(true);
  useSessionStore.getState().setSession(newerSession);
  finishMove({ data: { shipId: 'aegis', destination: 'A-1' } });
  await moving;

  expect(useSessionStore.getState().session).toEqual(newerSession);
  expect(useSessionStore.getState().session?.shipGalacticCoordinates?.aegis).not.toBe('A-1');
});

describe('same-uid cross-session delayed callable matrix', () => {
  function sessionFor(sessionId: string) {
    return {
      ...session,
      id: sessionId,
      phase: 'casting' as const,
      currentTurn: 0,
      setupRevision: 4,
      updatedAt: `2026-09-11T12:00:${sessionId === 'session-a' ? '00' : '01'}.000Z`,
    };
  }

  function playerFor(sessionId: string, activeConsoleRoleId?: string) {
    return {
      ...player,
      sessionId,
      role: 'gm' as const,
      ...(activeConsoleRoleId === undefined ? {} : { activeConsoleRoleId }),
    };
  }

  function gmFor(sessionId: string, id = `gm-${sessionId}`) {
    return {
      id,
      sessionId,
      uid: 'u1',
      name: `Bridge ${sessionId}`,
      deviceLabel: 'Test browser',
      claimedAt: '2026-09-11T12:00:00.000Z',
    };
  }

  function setupReceiptFor(source: string): SetupReceipt {
    return {
      source,
      playerCount: 8,
      mode: 'base',
      rosterIds: ['admiral'],
      pressEligibility: {},
      excludedGmCount: 1,
      wolfCount: 1,
      wolfRule: 'one-wolf-at-8-13',
      selectedWolfRoleIds: ['admiral'],
      eligibleRoleIds: ['admiral'],
      orderedModifiers: [],
      resultCount: 8,
      loyaltySource: 'automatic-default',
      request: {},
      expectedSetupRevision: 4,
      committedSetupRevision: 5,
      actorUid: 'u1',
      serverTime: '2026-09-11T12:00:00.000Z',
      event: 'game-started',
    };
  }

  function enterSessionA() {
    const sessionA = sessionFor('session-a');
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity(sessionA, playerFor(sessionA.id));
    useSessionStore.getState().setGmInstance(gmFor(sessionA.id));
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    return sessionA;
  }

  function replaceDisplayedIdentityWithSessionB() {
    const sessionB = {
      ...sessionFor('session-b'),
      currentTurn: 7,
      dradisContactTriggeredAt: 'B-contact',
    };
    const playerB = playerFor(sessionB.id, 'b-console-role');
    const gmB = gmFor(sessionB.id);
    const receiptB = setupReceiptFor('session-b-receipt');
    const store = useSessionStore.getState();
    store.setIdentity(sessionB, playerB);
    store.setGmInstance(gmB);
    store.setGmSetupReceipt(receiptB);
    store.setMode('gm');
    store.setLastRoute('/gm/session-b');
    return { sessionB, playerB, gmB, receiptB };
  }

  function pendingCallable() {
    let resolve!: (value: { data: unknown }) => void;
    const callable = Object.assign(
      vi.fn(() => new Promise<{ data: unknown }>((next) => { resolve = next; })),
      { stream: vi.fn() },
    );
    return {
      callable,
      resolve: (data: unknown) => resolve({ data }),
    };
  }

  beforeEach(() => {
    vi.mocked(httpsCallable).mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not let a late GM-claim result replace Session B GM identity', async () => {
    enterSessionA();
    const pending = pendingCallable();
    vi.mocked(httpsCallable).mockReturnValue(pending.callable as never);

    const claiming = claimGmInstance('Session A bridge');
    await vi.waitFor(() => expect(pending.callable).toHaveBeenCalled());
    const { gmB, playerB } = replaceDisplayedIdentityWithSessionB();
    pending.resolve({ instance: gmFor('session-a', 'gm-a-late') });
    await claiming;

    expect(useSessionStore.getState().gmInstance).toEqual(gmB);
    expect(useSessionStore.getState().me).toEqual(playerB);
  });

  it('does not let a late console-role claim replace Session B identity', async () => {
    enterSessionA();
    const pending = pendingCallable();
    vi.mocked(httpsCallable).mockReturnValue(pending.callable as never);

    const selecting = selectConsoleRole('admiral');
    await vi.waitFor(() => expect(pending.callable).toHaveBeenCalled());
    const { playerB } = replaceDisplayedIdentityWithSessionB();
    pending.resolve({ sessionId: 'session-a' });
    await selecting;

    expect(useSessionStore.getState().me).toEqual(playerB);
  });

  it('does not let a late console-role release replace Session B mode or route', async () => {
    enterSessionA();
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console/session-a');
    const pending = pendingCallable();
    vi.mocked(httpsCallable).mockReturnValue(pending.callable as never);

    const releasing = releaseConsoleRole();
    await vi.waitFor(() => expect(pending.callable).toHaveBeenCalled());
    const { playerB } = replaceDisplayedIdentityWithSessionB();
    pending.resolve({ sessionId: 'session-a' });
    await releasing;

    expect(useSessionStore.getState().me).toEqual(playerB);
    expect(useSessionStore.getState().mode).toBe('gm');
    expect(useSessionStore.getState().lastRoute).toBe('/gm/session-b');
  });

  it('does not let a late GM reconciliation clear Session B GM identity or route', async () => {
    enterSessionA();
    const pending = pendingCallable();
    vi.mocked(httpsCallable).mockReturnValue(pending.callable as never);

    const reconciling = reconcileGmAuthority();
    await vi.waitFor(() => expect(pending.callable).toHaveBeenCalled());
    const { gmB } = replaceDisplayedIdentityWithSessionB();
    pending.resolve({ instances: [] });
    await reconciling;

    expect(useSessionStore.getState().gmInstance).toEqual(gmB);
    expect(useSessionStore.getState().mode).toBe('gm');
    expect(useSessionStore.getState().lastRoute).toBe('/gm/session-b');
  });

  it('does not let a late start receipt overwrite Session B setup projection', async () => {
    enterSessionA();
    const pending = pendingCallable();
    vi.mocked(httpsCallable).mockReturnValue(pending.callable as never);

    const starting = startGame({ requestId: 'session-a-start' });
    await vi.waitFor(() => expect(pending.callable).toHaveBeenCalled());
    const { sessionB, receiptB } = replaceDisplayedIdentityWithSessionB();
    pending.resolve({
      status: 'committed',
      sessionId: 'session-a',
      requestId: 'session-a-start',
      currentTurn: 1,
      setupRevision: 5,
      setupReceipt: setupReceiptFor('session-a-receipt'),
    });
    await starting;

    expect(useSessionStore.getState().session).toEqual(sessionB);
    expect(useSessionStore.getState().gmSetupReceipt).toEqual(receiptB);
  });

  it('does not let a late DRADIS result overwrite Session B event projection', async () => {
    enterSessionA();
    const pending = pendingCallable();
    vi.mocked(httpsCallable).mockReturnValue(pending.callable as never);

    const triggering = triggerDradisContact();
    await vi.waitFor(() => expect(pending.callable).toHaveBeenCalled());
    const { sessionB } = replaceDisplayedIdentityWithSessionB();
    pending.resolve({ triggeredAt: 'A-contact' });
    await triggering;

    expect(useSessionStore.getState().session).toEqual(sessionB);
  });
});

it('sends population changes and acknowledgement with the GM instance', async () => {
  useSessionStore.getState().setIdentity(session, player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
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

it('sends one ordered counter batch and applies only the server-confirmed amount', async () => {
  useSessionStore.getState().setIdentity({
    ...session,
    shipResources: { dione: { ore: 0, fuel: 6, food: 0, water: 0, materials: 0, securityTeams: 0 } },
  }, player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setGmInstance({
    id: 'gm1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: 'Test', claimedAt: 'now',
  });
  const call = callableReturning({ data: { amount: 8, appliedSteps: [1, 1], alertRaised: false } });
  vi.mocked(httpsCallable).mockReturnValue(call);

  const result = await applyShipCounterSteps(
    'dione', { counter: 'resource', resourceId: 'fuel' }, [1, 1],
  );

  expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'applyShipCounterSteps');
  expect(call).toHaveBeenLastCalledWith({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1, 1],
  });
  expect(useSessionStore.getState().session?.shipResources?.dione?.fuel).toBe(8);
  expect(result).toEqual({ amount: 8, alertRaised: false });
});

describe('authoritative setup and seating wrappers', () => {
  const setup = {
    playerCount: 8,
    chartId: 'A' as const,
    expansion: 'base' as const,
    turnLimit: 6 as const,
    dioneEnabled: true,
    capybaraEnabled: false,
    universalArbourEnabled: false,
    wolfCultEnabled: false,
    activeRoleIds: [
      'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
      'quellon-explorer', 'refinery-124-pdf-colonel',
      'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
    ],
  };

  beforeEach(() => {
    useSessionStore.getState().reset();
    useSessionStore.getState().setIdentity({
      ...session,
      setupRevision: 4,
      playerCount: setup.playerCount,
      chartId: setup.chartId,
      expansion: setup.expansion,
      turnLimit: setup.turnLimit,
      dioneEnabled: setup.dioneEnabled,
      capybaraEnabled: setup.capybaraEnabled,
      activeRoleIds: setup.activeRoleIds,
    }, player);
    useSessionStore.getState().setGmInstance({
      id: 'bridge', sessionId: 's1', uid: 'u1', name: 'Bridge',
      deviceLabel: 'Test browser', claimedAt: '2026-01-01T00:00:00.000Z',
    });
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    vi.mocked(httpsCallable).mockReset();
  });

  it('confirms the complete tuple with a request id and setup-revision CAS', async () => {
    const call = callableReturning({
      data: { status: 'committed', requestId: 'setup-1', setupRevision: 5 },
    });
    vi.mocked(httpsCallable).mockReturnValue(call);

    await authorityService.confirmSetup(setup);

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'confirmSetup');
    expect(call).toHaveBeenCalledWith({
      sessionId: 's1',
      instanceId: 'bridge',
      requestId: expect.any(String),
      expectedSetupRevision: 4,
      setup,
    });
  });

  it('projects the complete canonical setup tuple from the committed server receipt', async () => {
    const activeRoleIds = ['admiral', 'wing-commander'];
    const activeVesselIds = ['aegis', 'icebreaker'];
    const canonicalSetup = {
      playerCount: 19,
      chartId: 'B' as const,
      expansion: 'capybara' as const,
      turnLimit: 7 as const,
      dioneEnabled: true,
      capybaraEnabled: true,
      universalArbourEnabled: false,
      wolfCultEnabled: false,
      activeRoleIds,
      activeVesselIds,
    };
    vi.mocked(httpsCallable).mockReturnValue(callableReturning({
      data: {
        status: 'committed', requestId: 'setup-projection', setupRevision: 5,
        setup: canonicalSetup, activeRoleIds, activeVesselIds,
      },
    }));

    await expect(authorityService.confirmSetup({
      playerCount: 19, chartId: 'B', expansion: 'capybara', turnLimit: 7,
      dioneEnabled: true, capybaraEnabled: true, activeRoleIds,
      universalArbourEnabled: false, wolfCultEnabled: false,
    })).resolves.toBe('applied');

    expect(useSessionStore.getState().session).toMatchObject({
      setupRevision: 5,
      playerCount: 19,
      chartId: 'B',
      expansion: 'capybara',
      turnLimit: 7,
      dioneEnabled: true,
      capybaraEnabled: true,
      activeRoleIds,
      activeVesselIds,
      setup: canonicalSetup,
    });
  });

  it('claims a stable seat with a revision-bound idempotency request', async () => {
    const call = callableReturning({
      data: { status: 'replayed', requestId: 'claim-1', setupRevision: 5, seatId: 'admiral', holderUid: 'u1' },
    });
    vi.mocked(httpsCallable).mockReturnValue(call);

    await expect(authorityService.claimSeat('admiral')).resolves.toBe('applied');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'claimSeat');
    expect(call).toHaveBeenCalledWith({
      sessionId: 's1',
      seatId: 'admiral',
      requestId: expect.any(String),
      expectedSetupRevision: 4,
    });
  });

  it('releases a seat through the active GM instance and preserves replay-safe acknowledgement', async () => {
    const call = callableReturning({
      data: { status: 'replayed', requestId: 'release-1', setupRevision: 5, seatId: 'admiral' },
    });
    vi.mocked(httpsCallable).mockReturnValue(call);

    await expect(authorityService.releaseSeat('admiral', 'Roster correction')).resolves.toBe('applied');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'releaseSeat');
    expect(call).toHaveBeenCalledWith({
      sessionId: 's1',
      seatId: 'admiral',
      requestId: expect.any(String),
      expectedSetupRevision: 4,
      instanceId: 'bridge',
      reason: 'Roster correction',
    });
  });

  it('routes facilitator role release and reassignment through the named casting callables', async () => {
    const releaseCall = callableReturning({
      data: { sessionId: 's1', setupRevision: 5 },
    });
    vi.mocked(httpsCallable).mockReturnValue(releaseCall);

    await expect(authorityService.releaseRole('u2')).resolves.toBe('applied');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'releaseRole');
    expect(releaseCall).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'bridge', requestId: expect.any(String), targetUid: 'u2',
    });

    const assignCall = callableReturning({
      data: { sessionId: 's1', setupRevision: 6 },
    });
    vi.mocked(httpsCallable).mockReturnValue(assignCall);

    await expect(authorityService.assignRole('u2', 'admiral')).resolves.toBe('applied');
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'assignRole');
    expect(assignCall).toHaveBeenCalledWith({
      sessionId: 's1', instanceId: 'bridge', requestId: expect.any(String),
      targetUid: 'u2', roleId: 'admiral',
    });
    expect(useSessionStore.getState().session?.setupRevision).toBe(6);
  });

  it('maps stale authority CAS failures to a safe stale disposition for every guarded command', async () => {
    const stale = {
      status: 'stale', requestId: 'authority-stale', entity: 'setup',
      expectedRevision: 4, currentRevision: 5,
    };

    vi.mocked(httpsCallable).mockReturnValue(callableReturning({ data: stale }));
    await expect(authorityService.confirmSetup(setup)).resolves.toBe('stale');
    expect(useSessionStore.getState().communicationError).toEqual({
      kind: 'stale-revision',
      code: 'stale',
      message: 'The live session changed before this command committed. Refresh the live state and retry.',
    });

    vi.mocked(httpsCallable).mockReturnValue(callableReturning({ data: { ...stale, entity: 'facilitator' } }));
    await expect(authorityService.setFacilitatorResponsibility({
      responsibility: 'main', mode: 'share', targetInstanceId: 'other',
    })).resolves.toBe('stale');

    vi.mocked(httpsCallable).mockReturnValue(callableReturning({
      data: { ...stale, entity: 'seat', seatId: 'admiral' },
    }));
    await expect(authorityService.claimSeat('admiral')).resolves.toBe('stale');

    vi.mocked(httpsCallable).mockReturnValue(callableReturning({
      data: { ...stale, entity: 'seat', seatId: 'admiral' },
    }));
    await expect(authorityService.releaseSeat('admiral', 'Retry after live refresh')).resolves.toBe('stale');
  });
});
