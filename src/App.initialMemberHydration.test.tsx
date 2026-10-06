import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession, Player } from '@/types/game';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn() },
  call: vi.fn(), listen: vi.fn(), read: vi.fn(), signIn: vi.fn(),
}));

vi.mock('firebase/auth', () => ({ signInAnonymously: (...args: unknown[]) => sdk.signIn(...args) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_service: unknown, name: string) => (data: unknown) => sdk.call(name, data),
}));
vi.mock('@/lib/firebase', () => ({
  app: () => ({}), auth: () => sdk.auth, functions: () => ({}),
  demoActorServices: () => ({ auth: sdk.auth, functions: {} }),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_database: unknown, path: string) => ({ path }),
  collection: (_database: unknown, path: string) => ({ path }),
  query: (reference: unknown) => reference,
  where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(),
  onSnapshot: (...args: unknown[]) => sdk.listen(...args),
  getDocFromServer: (reference: unknown) => sdk.read(reference),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('@/lib/firebaseConfig', () => ({
  useEmulators: false, emulatorPorts: { firestore: 8080 },
}));
vi.mock('@/lib/versionUpgrade', () => ({ startVersionUpgradeMonitor: () => () => undefined }));

// App, the immutable demo profile/normal Auth restoration, session service,
// Firestore member feed and persisted Zustand identity are production sources.
// Only SDK I/O and unrelated gameplay/chrome leaves are substituted.
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/ShipPlot', () => ({ default: () => null }));
vi.mock('@/components/WolfHackingRuntime', () => ({ default: () => null }));
vi.mock('@/components/TurnPhaseCoordinator', () => ({ default: () => null }));
vi.mock('@/components/TurnStartAnnouncement', () => ({ default: () => null }));
vi.mock('@/components/CrisisReportPanel', () => ({ default: () => null }));
vi.mock('@/components/FleetGroupWorkspace', () => ({ default: () => null }));
vi.mock('@/routes/SessionMode', () => ({ default: () => <main>Stations</main> }));
vi.mock('@/routes/RoleSelect', () => ({ default: () => <main>Stations</main> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

function snapshot(path: string, data: Record<string, unknown> | null) {
  return { id: path.split('/').at(-1), metadata: { fromCache: false },
    exists: () => data !== null, data: () => data, get: (field: string) => data?.[field] };
}

interface Listener {
  readonly path: string;
  readonly next: (value: ReturnType<typeof snapshot>) => void;
  readonly error: (value: { code: string }) => void;
  readonly startedBeforeIdentity: boolean;
  active: boolean;
}

let serial = 0;
let sessionId: string;
let actor: Player;
let sessionData: Record<string, unknown>;
let listeners: Listener[];
let authReady: ReturnType<typeof deferred<void>>;
let resumeReply: ReturnType<typeof deferred<{ data: { session: GameSession; player: Player } }>>;
let useSessionStore: typeof import('@/store/useSessionStore').useSessionStore;
let sessionFrom: typeof import('@/lib/firestore').sessionFrom;
let unmount: (() => void) | undefined;
let watches: (() => void)[];
let legacyProjection: boolean;
const rootPath = () => `sessions/${sessionId}`;
const actorPath = () => `${rootPath()}/players/${actor.uid}`;
const callCount = (name: string) => sdk.call.mock.calls.filter(call => call[0] === name).length;
const currentSession = () => sessionFrom(sessionId, { ...sessionData,
  ...(actor.role === 'player' ? { memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [] } } : {}),
});
const memberReply = () => ({ data: { type: 'current-member-session', sessionId, actorUid: actor.uid,
  groupId: actor.fleetGroupId, connectionGeneration: actor.connectionGeneration,
  assignedRoleId: actor.assignedRoleId, activeConsoleRoleId: actor.activeConsoleRoleId,
  session: currentSession(),
  // Press deliberately has no primary berth; a core actor's exact current
  // transaction witness must still be parsed and matched by the real reader.
  ...(!legacyProjection ? { currentActorBerthAuthority: actor.assignedRoleId ? {
    sessionId, actorUid: actor.uid, groupId: actor.fleetGroupId, role: actor.role,
    connectionGeneration: actor.connectionGeneration, assignedRoleId: actor.assignedRoleId,
    activeConsoleRoleId: actor.activeConsoleRoleId, replacementRoleId: null, replacementStatus: null, shipId: 'aegis',
  } : null } : {}),
} });

async function advance(ms = 100) {
  // Native timer turns allow React's normal listener cleanup. This controls
  // SDK delivery only; no game clock, engine result or proof budget is changed.
  for (let remaining = ms; remaining > 0; remaining -= 100) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, remaining)); });
  }
}

async function mount(options: { demo?: boolean; role?: Player['role']; press?: boolean; closed?: boolean } = {}) {
  const roleId = options.press ? 'press-officer' : 'wing-commander';
  window.history.replaceState({}, '', options.demo === false || options.role === 'gm'
    ? '/#/console' : `/?demoActor=${sessionId}~${roleId}&demoJoin=123456#/demo-actors`);
  ({ useSessionStore } = await import('@/store/useSessionStore'));
  ({ sessionFrom } = await import('@/lib/firestore'));
  const { SESSION_STORAGE_KEY } = await import('@/store/useSessionStore');
  const context = await import('@/lib/demoActorContext');
  legacyProjection = options.demo === false;
  if (legacyProjection) {
    const { fullGameDemo: _marker, ...legacySession } = sessionData;
    sessionData = legacySession;
  }
  actor = { ...actor, role: options.role ?? 'player',
    assignedRoleId: options.role === 'gm' || options.press ? null : roleId,
    seatId: options.role === 'gm' || options.press ? null : roleId,
    activeConsoleRoleId: options.press ? roleId : null };
  if (options.closed) sessionData = { ...sessionData, phase: 'closed' };
  if (context.activeDemoActorProfile) {
    context.rememberDemoActorAccount(context.activeDemoActorProfile, actor.uid);
    localStorage.setItem(context.demoActorRosterStorageKey(sessionId), JSON.stringify([
      { sessionId, roleId, uid: actor.uid, label: 'Original fixture actor' },
    ]));
  }
  localStorage.setItem(context.demoActorSessionStorageKey(SESSION_STORAGE_KEY), JSON.stringify({ version: 1,
    state: { session: currentSession(), me: actor, mode: 'console', pendingCommands: [], lastRoute: '/console' } }));
  await useSessionStore.persist.rehydrate();
  expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 0,
    sessionSnapshotFreshness: 'cache', me: { uid: actor.uid, connectionGeneration: 6 } });
  sdk.listen.mockImplementation((reference, _options, next, error) => {
    const listener: Listener = { path: reference.path, next, error, active: true,
      startedBeforeIdentity: useSessionStore.getState().identityHydrationRevision === 0 };
    listeners.push(listener);
    if (reference.path === actorPath() && !listener.startedBeforeIdentity) {
      setTimeout(() => { if (listener.active) next(snapshot(actorPath(), { ...actor })); }, 0);
    } else if (reference.path === rootPath() && actor.role === 'gm') {
      setTimeout(() => { if (listener.active) next(snapshot(rootPath(), sessionData)); }, 0);
    } else if (reference.path === `${rootPath()}/roleBriefs/${actor.uid}` && actor.assignedRoleId) {
      setTimeout(() => { if (listener.active) next(snapshot(reference.path, {
        type: 'role-brief', sessionId, assignmentUid: actor.uid, visibleToUids: [actor.uid],
        roleId: actor.assignedRoleId, roleName: 'Wing Commander', vesselName: 'AEGIS',
        text: 'Original private briefing.', commonRules: 'Fixture common rules.', setupRevision: 1,
      })); }, 0);
    }
    return () => { listener.active = false; };
  });
  sdk.call.mockImplementation(async name => {
    if (name === 'resumeSession') return resumeReply.promise;
    if (name === 'getCurrentMemberSession') {
      await authReady.promise;
      if (sdk.auth.currentUser?.uid !== actor.uid) {
        throw Object.assign(new Error('Fixture Rules reject foreign or missing Auth.'), { code: 'functions/permission-denied' });
      }
      return memberReply();
    }
    if (name === 'refreshPresence') return { data: { sessionId } };
    throw new Error(`Unexpected callable ${name}`);
  });
  const { default: App } = await import('./App');
  unmount = render(<App />).unmount;
  await advance();
}

async function restoreAuth(uid = actor.uid) {
  sdk.auth.currentUser = { uid };
  authReady.resolve();
  await advance();
}

async function finishResume(change: { foreignSession?: boolean } = {}) {
  // resumeSession's server transaction increments the original generation and
  // updatedAt (functions/src/index.ts); delivery remains a normal SDK reply.
  actor = { ...actor, connectionGeneration: 7 };
  sessionData = { ...sessionData, updatedAt: new Date(Date.now() + 1).toISOString() };
  const resumed = currentSession();
  resumeReply.resolve({ data: { session: change.foreignSession ? { ...resumed, id: 'foreign-session' } : resumed,
    player: change.foreignSession ? { ...actor, sessionId: 'foreign-session' } : actor } });
  await advance();
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime('2026-10-06T05:00:00.000Z');
  localStorage.clear(); watches = []; listeners = []; legacyProjection = false;
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
  sessionId = `initial-member-${++serial}`;
  sessionData = { name: 'Initial member fixture', joinCode: '123456', phase: 'active', currentTurn: 1,
    playerCount: 18, fullGameDemo: { status: 'active', progression: 'manual' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: 'original-demo-uid', sessionId, displayName: 'Original actor', role: 'player', connected: true,
    fleetGroupId: 'fleet-1', connectionGeneration: 6, assignedRoleId: 'wing-commander', seatId: 'wing-commander',
    activeConsoleRoleId: null, replacementRoleId: null, replacementStatus: null, joinedAt: new Date().toISOString() };
  authReady = deferred<void>(); resumeReply = deferred();
  sdk.auth.currentUser = null; sdk.auth.authStateReady.mockReset().mockReturnValue(authReady.promise);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset().mockResolvedValue(snapshot(rootPath(), null));
  sdk.signIn.mockReset().mockRejectedValue(new Error('An established actor must never be replaced.'));
});

afterEach(async () => {
  watches.forEach(stop => stop());
  if (unmount) act(unmount);
  unmount = undefined;
  authReady.resolve();
  resumeReply.resolve({ data: { session: currentSession(), player: actor } });
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

describe('current-document member listener hydration ordering', () => {
  it.each<[string, { demo?: boolean; press?: boolean }]>([
    ['demo', {}], ['ordinary legacy', { demo: false }], ['Press', { press: true }],
  ])(
    'keeps %s cache read-only until original normal Auth/resume identity is accepted', async (_label, options) => {
      await mount(options);
      expect(useSessionStore.getState().session?.id).toBe(sessionId);
      expect(useSessionStore.getState().identityHydrationRevision).toBe(0);
      expect(listeners).toHaveLength(0);
      expect(callCount('getCurrentMemberSession')).toBe(0);
      await restoreAuth();
      expect(callCount('resumeSession')).toBe(1);
      expect(listeners).toHaveLength(0);
      expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
      await finishResume();
      expect(listeners.some(listener => listener.path === actorPath())).toBe(true);
      expect(listeners.every(listener => !listener.startedBeforeIdentity)).toBe(true);
      expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
        identityHydrationRevision: 1, me: { uid: actor.uid, sessionId, connectionGeneration: 7 } });
      expect(callCount('resumeSession')).toBe(1);
      expect(sdk.signIn).not.toHaveBeenCalled();
      if (options.press) expect(useSessionStore.getState().me).toMatchObject({ assignedRoleId: null,
        seatId: null, activeConsoleRoleId: 'press-officer' });
      if (options.demo === false) expect(screen.getByText('Stations')).toBeInTheDocument();
      if (options.demo === false) expect(Object.hasOwn(useSessionStore.getState().session!, 'currentActorBerthAuthority')).toBe(false);
    },
  );

  it('cannot publish an older initial server player into the accepted normal resume generation', async () => {
    await mount();
    const queuedInitialPlayer = listeners.find(listener => listener.path === actorPath() && listener.startedBeforeIdentity);
    const beforeResume = { ...actor };
    const acceptedFrames: number[] = [];
    let delivered = false;
    watches.push(useSessionStore.subscribe(state => {
      if (state.identityHydrationRevision === 0) return;
      if (queuedInitialPlayer && !delivered) {
        delivered = true;
        // A source-registered server event can run before React retires the
        // old effect. The real callback/freshness/actor epoch handlers run here.
        queueMicrotask(() => queuedInitialPlayer.next(snapshot(actorPath(), beforeResume)));
      }
      acceptedFrames.push(useSessionStore.getState().me?.connectionGeneration ?? -1);
    }));
    await restoreAuth(); await finishResume();
    expect(acceptedFrames.length).toBeGreaterThan(0);
    expect(acceptedFrames.every(generation => generation === 7)).toBe(true);
    expect(useSessionStore.getState()).toMatchObject({ me: { uid: actor.uid, sessionId, connectionGeneration: 7 },
      identityHydrationRevision: 1, connection: 'live', sessionSnapshotFreshness: 'server' });
    await advance(2_100);
    expect(callCount('resumeSession')).toBe(1);
  });

  it('does not publish initial feed live/offline recovery before the original resume identity is accepted', async () => {
    await mount();
    const initialPlayer = listeners.find(listener => listener.path === actorPath() && listener.startedBeforeIdentity);
    const beforeResume = { ...actor };
    const prematureLiveFrames: number[] = [];
    watches.push(useSessionStore.subscribe(state => {
      if (state.identityHydrationRevision === 0 && state.connection === 'live' && state.sessionSnapshotFreshness === 'server') {
        prematureLiveFrames.push(state.me?.connectionGeneration ?? -1);
      }
    }));
    await restoreAuth();
    if (initialPlayer) {
      act(() => initialPlayer.next(snapshot(actorPath(), beforeResume)));
      await advance();
      // The normal resume transaction can commit before its callable reply is
      // delivered. An original reader's earlier server player fingerprint is
      // now incompatible with its current-member transaction read.
      actor = { ...actor, connectionGeneration: 7 };
      act(() => initialPlayer.next(snapshot(actorPath(), beforeResume)));
      await advance();
      expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 0,
        connection: 'offline', sessionSnapshotFreshness: 'cache' });
    }
    expect(prematureLiveFrames).toEqual([]);
    await finishResume(); await advance(2_100);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      connection: 'live', sessionSnapshotFreshness: 'server', me: { connectionGeneration: 7 } });
    expect(callCount('resumeSession')).toBe(1);
  });

  it('does not start an established demo member reader for a foreign restored Auth UID', async () => {
    await mount(); await restoreAuth('foreign-auth-uid');
    expect(callCount('resumeSession')).toBe(0);
    expect(callCount('getCurrentMemberSession')).toBe(0);
    expect(listeners).toHaveLength(0);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 0,
      connection: 'offline', me: { uid: actor.uid, sessionId, connectionGeneration: 6 } });
    expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('does not mint or subscribe a replacement for a missing established demo Auth UID', async () => {
    await mount(); authReady.resolve(); await advance();
    expect(callCount('resumeSession')).toBe(0);
    expect(listeners).toHaveLength(0);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(0);
    expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('retains the original displayed SID and blocks member startup after a foreign normal resume reply', async () => {
    await mount(); await restoreAuth(); await finishResume({ foreignSession: true });
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 0,
      connection: 'offline', session: { id: sessionId }, me: { uid: actor.uid, sessionId, connectionGeneration: 6 } });
    expect(listeners).toHaveLength(0);
    expect(callCount('getCurrentMemberSession')).toBe(0);
  });

  it('preserves the existing GM root listener startup while its normal resume is pending', async () => {
    await mount({ role: 'gm' });
    expect(listeners.some(listener => listener.path === rootPath())).toBe(true);
    expect(callCount('getCurrentMemberSession')).toBe(0);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(0);
    await restoreAuth(); await finishResume();
    expect(useSessionStore.getState().me?.role).toBe('gm');
    expect(callCount('resumeSession')).toBe(1);
  });

  it('keeps closed cached history free of operational member listeners', async () => {
    await mount({ closed: true });
    expect(listeners).toHaveLength(0);
    expect(callCount('getCurrentMemberSession')).toBe(0);
    expect(useSessionStore.getState().session?.phase).toBe('closed');
  });

  it('still withdraws the accepted current member on a genuine later server disconnection', async () => {
    await mount(); await restoreAuth(); await finishResume();
    const playerListener = listeners.filter(listener => listener.active && listener.path === actorPath()).at(-1);
    expect(playerListener).toBeDefined();
    act(() => playerListener!.next(snapshot(actorPath(), { ...actor, connected: false })));
    expect(useSessionStore.getState()).toMatchObject({ connection: 'offline', sessionSnapshotFreshness: 'cache',
      session: { currentActorBerthAuthority: null }, identityHydrationRevision: 1 });
    expect(useSessionStore.getState().roleBrief).toBeNull();
    expect(callCount('resumeSession')).toBe(1);
  });
});
