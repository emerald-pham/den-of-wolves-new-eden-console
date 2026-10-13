import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createCurrentMemberSessionReader as CreateMemberReader } from '../functions/src/memberSessionCallable';
import type { GameSession, Player } from '@/types/game';
import type { useSessionStore as SessionStore } from '@/store/useSessionStore';
import type * as SessionService from '@/lib/sessionService';
import { acknowledgeSessionWaiver } from '@/lib/sessionWaiver';

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
  query: (reference: unknown) => reference, where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(),
  onSnapshot: (...args: unknown[]) => sdk.listen(...args),
  getDocFromServer: (reference: unknown) => sdk.read(reference),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('@/lib/firebaseConfig', () => ({ useEmulators: false, emulatorPorts: { firestore: 8080 } }));
vi.mock('@/lib/versionUpgrade', () => ({ startVersionUpgradeMonitor: () => () => undefined }));

// The actual App, demo manager, normal join/resume service, Firestore member
// feed, transaction reader/projection and Zustand run together. Only SDK I/O
// and unrelated chrome/gameplay leaves use the existing test-fixture pattern.
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
function snapshot(path: string, data: Record<string, unknown> | null, fromCache = false) {
  return { id: path.split('/').at(-1), metadata: { fromCache },
    exists: () => data !== null, data: () => data, get: (field: string) => data?.[field] };
}
interface Listener {
  readonly path: string;
  readonly next: (value: ReturnType<typeof snapshot>) => void;
  readonly error: (value: { code: string }) => void;
  active: boolean;
}
type Reply = { data: { session: GameSession; player: Player } };
let serial = 0;
let sessionId: string;
let actor: Player;
let sessionData: Record<string, unknown>;
let listeners: Listener[];
let joinReply: ReturnType<typeof deferred<Reply>>;
let memberResponses: ReturnType<typeof deferred<{ data: Record<string, unknown> }>>[];
let presenceReplies: ReturnType<typeof deferred<{ data: { sessionId: string } }>>[];
let resumeReplies: ReturnType<typeof deferred<Reply>>[];
let useSessionStore: typeof SessionStore;
let service: typeof SessionService;
let readMember: () => Promise<Record<string, unknown>>;
let unmount: (() => void) | undefined;
let watch: (() => void) | undefined;
let frames: { connection: string; freshness: string; generation: number | undefined; hydration: number }[];
let legacy: boolean;
const rootPath = () => `sessions/${sessionId}`;
const playerPath = () => `${rootPath()}/players/${actor.uid}`;
const callCount = (name: string) => sdk.call.mock.calls.filter(call => call[0] === name).length;
const currentPlayerReader = () => listeners.filter(reader => reader.active && reader.path === playerPath()).at(-1)!;

async function advance(ms = 100) {
  // SDK/React delivery and the unchanged existing 2s normal reconnect timer;
  // this changes no engine clock, gameplay outcome or proof deadline.
  for (let remaining = ms; remaining > 0; remaining -= 100) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, remaining)); });
  }
}
async function deliverMember(index: number, change: Record<string, unknown> = {}) {
  expect(memberResponses[index]).toBeDefined();
  const data = await readMember();
  memberResponses[index]!.resolve({ data: { ...data, ...change } });
  await advance();
  return data;
}
async function deliverPlayer(value: Record<string, unknown> = { ...actor }, fromCache = false) {
  const reader = currentPlayerReader();
  expect(reader).toBeDefined();
  act(() => reader.next(snapshot(playerPath(), value, fromCache)));
  await advance();
}

async function mount(options: { demo?: boolean; press?: boolean; gm?: boolean; legacy?: boolean; cold?: boolean } = {}) {
  const roleId = options.press ? 'press-officer' : 'executive-officer';
  window.history.replaceState({}, '', options.demo === false || options.gm ? '/#/console'
    : `/?demoActor=${sessionId}~${roleId}&demoJoin=123456#/demo-actors`);
  ({ useSessionStore } = await import('@/store/useSessionStore'));
  service = await import('@/lib/sessionService');
  const context = await import('@/lib/demoActorContext');
  legacy = options.legacy === true;
  if (legacy) delete sessionData.fullGameDemo;
  actor = { ...actor, role: options.gm ? 'gm' : 'player',
    assignedRoleId: options.gm || options.press ? null : roleId,
    seatId: options.gm || options.press ? null : roleId,
    activeConsoleRoleId: options.press ? roleId : null };
  if (context.activeDemoActorProfile) {
    context.rememberDemoActorAccount(context.activeDemoActorProfile, actor.uid);
    localStorage.setItem(context.demoActorRosterStorageKey(sessionId), JSON.stringify([
      { sessionId, roleId, uid: actor.uid, label: 'Original actor' },
    ]));
  }
  const { createCurrentMemberSessionReader } = await import('../functions/src/memberSessionCallable');
  const serverSnapshot = (path: string, value?: Record<string, unknown>) => ({
    id: path.split('/').at(-1), exists: value !== undefined,
    data: () => value, get: (key: string) => value?.[key],
  });
  const reference = (path: string, collection = false) => ({ path, collection });
  // Inert read-only transport: all six source transaction reads run; neither
  // the scenario nor this fixture issues a store identity/live update.
  const db = { doc: reference, collection: (path: string) => reference(path, true),
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ readOnly: true });
      const values: Record<string, Record<string, unknown>> = {
        [rootPath()]: { ...sessionData }, [playerPath()]: { ...actor },
        [`${rootPath()}/fleetGroups/fleet-1`]: { id: 'fleet-1', vesselIds: ['aegis'], memberUids: [actor.uid],
          ...(!legacy ? { memberShipIds: { [actor.uid]: 'aegis' } } : {}) },
      };
      return callback({ get: async (ref: ReturnType<typeof reference>) => ref.collection
        ? { docs: Object.keys(values).filter(path => path.startsWith(`${ref.path}/`) &&
          !path.slice(ref.path.length + 1).includes('/')).map(path => serverSnapshot(path, values[path])) }
        : serverSnapshot(ref.path, values[ref.path]) });
    } };
  const reader = createCurrentMemberSessionReader({ db: db as unknown as Parameters<typeof CreateMemberReader>[0]['db'],
    projectSession: source => source.data() as Record<string, unknown> });
  readMember = () => reader({ ...(sdk.auth.currentUser ? { auth: sdk.auth.currentUser } : {}), data: { sessionId } });
  sdk.read.mockImplementation(ref => Promise.resolve(snapshot(ref.path, sessionData)));
  sdk.listen.mockImplementation((ref, _options, next, error) => {
    const listener = { path: ref.path, next, error, active: true };
    listeners.push(listener);
    // The FIRST own player is intentionally delivered by the scenario, not
    // implicitly ahead of the current-member transaction.
    if (ref.path === rootPath() && actor.role === 'gm') {
      setTimeout(() => { if (listener.active) next(snapshot(rootPath(), sessionData)); }, 0);
    }
    return () => { listener.active = false; };
  });
  sdk.call.mockImplementation((name, data) => {
    if (name === 'joinSession') return joinReply.promise;
    if (name === 'getCurrentMemberSession') {
      expect(data).toEqual({ sessionId });
      const pending = deferred<{ data: Record<string, unknown> }>();
      memberResponses.push(pending); return pending.promise;
    }
    if (name === 'resumeSession') {
      // Exactly the normal production reconnect path is exercised. A pending
      // original SDK is never replaced by a fixture setIdentity or live flag.
      const pending = deferred<Reply>(); resumeReplies.push(pending); return pending.promise;
    }
    if (name === 'refreshPresence') {
      // The production DemoActorControls starts normal persona renewal after
      // join. Its SDK reply and own-player server callback arrive separately.
      expect(data).toEqual({ sessionId });
      const pending = deferred<{ data: { sessionId: string } }>();
      presenceReplies.push(pending); return pending.promise;
    }
    throw new Error(`Unexpected callable ${name}`);
  });
  if (options.cold) {
    const { SESSION_STORAGE_KEY } = await import('@/store/useSessionStore');
    const { sessionFrom } = await import('@/lib/firestore');
    const projected = await readMember();
    localStorage.setItem(context.demoActorSessionStorageKey(SESSION_STORAGE_KEY), JSON.stringify({ version: 1,
      state: { session: sessionFrom(sessionId, projected.session as Record<string, unknown>), me: actor,
        mode: 'console', pendingCommands: [], lastRoute: '/demo-actors' } }));
    await useSessionStore.persist.rehydrate();
  }
  await import('@/routes/DemoActorManager');
  const { default: App } = await import('./App');
  unmount = render(<App />).unmount;
  await advance();
  if (options.cold) return;
  if (options.demo === false || options.gm) {
    // The ordinary public service is the same manager's join action.
    void service.joinSession('123456'); await advance();
  }
  expect(callCount('joinSession')).toBe(1);
  expect(useSessionStore.getState().session).toBeNull();
  const projection = await readMember();
  const { sessionFrom } = await import('@/lib/firestore');
  const player = { ...actor };
  // index.ts join reply retains transaction generation and .session only;
  // connected and envelope-only currentActorBerthAuthority are absent.
  delete player.connected;
  expect(Object.hasOwn(projection.session as object, 'currentActorBerthAuthority')).toBe(false);
  joinReply.resolve({ data: { session: sessionFrom(sessionId, projection.session as Record<string, unknown>), player } });
  await advance();
  expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
    me: { uid: actor.uid, sessionId, connectionGeneration: 2 } });
  if (!options.gm) expect(callCount('getCurrentMemberSession')).toBe(1);
  frames = [];
  watch = useSessionStore.subscribe(state => frames.push({ connection: state.connection,
    freshness: state.sessionSnapshotFreshness, generation: state.me?.connectionGeneration,
    hydration: state.identityHydrationRevision }));
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime('2026-10-06T09:20:00.000Z'); localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  acknowledgeSessionWaiver();
  sessionId = `initial-actor-authority-${++serial}`;
  sessionData = { name: 'Initial actor authority', joinCode: '123456', phase: 'active', currentTurn: 1,
    playerCount: 18, activeVesselIds: ['aegis'], activeRoleIds: ['executive-officer'],
    fullGameDemo: { status: 'active', progression: 'manual' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: 'original-authority-uid', sessionId, displayName: 'Original actor', role: 'player',
    connected: true, fleetGroupId: 'fleet-1', connectionGeneration: 2, assignedRoleId: 'executive-officer',
    seatId: 'executive-officer', activeConsoleRoleId: null, replacementRoleId: null, replacementStatus: null,
    joinedAt: new Date().toISOString() };
  listeners = []; memberResponses = []; presenceReplies = []; resumeReplies = []; frames = []; joinReply = deferred(); legacy = false;
  sdk.auth.currentUser = { uid: actor.uid }; sdk.auth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset().mockResolvedValue(snapshot(rootPath(), null));
  sdk.signIn.mockReset().mockRejectedValue(new Error('The original account cannot be replaced.'));
});
afterEach(async () => {
  watch?.(); watch = undefined;
  if (unmount) act(unmount); unmount = undefined;
  // Retired SDK callbacks must not publish on the next case; settle every
  // intercepted transport without accepting a manufactured replacement actor.
  memberResponses.forEach(pending => pending.resolve({ data: {} }));
  presenceReplies.forEach(pending => pending.resolve({ data: { sessionId } }));
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

describe('initial accepted actor confirmation before a slow member transaction', () => {
  it.each<[string, { demo?: boolean; legacy?: boolean; press?: boolean }]>([
    ['demo core', {}], ['ordinary legacy', { demo: false, legacy: true }], ['Press', { press: true }],
  ])('keeps the accepted %s join generation through normal presence, FIRST matching player and pending member read', async (_name, options) => {
    await mount(options);
    if (options.demo !== false) {
      expect(presenceReplies).toHaveLength(1);
      expect(callCount('refreshPresence')).toBe(1);
      presenceReplies[0]!.resolve({ data: { sessionId } });
      await advance();
    }
    await deliverPlayer();
    // The original first read is still pending past the existing App retry.
    // Native timer delivery grants no new gameplay time or actor authority.
    await advance(2_200);
    expect(callCount('resumeSession')).toBe(0);
    expect(frames.every(frame => frame.connection !== 'offline')).toBe(true);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      connection: 'live', sessionSnapshotFreshness: 'server', me: { uid: actor.uid, sessionId,
        connectionGeneration: 2, assignedRoleId: actor.assignedRoleId,
        activeConsoleRoleId: actor.activeConsoleRoleId } });
    expect(sdk.signIn).not.toHaveBeenCalled();
    expect(callCount('joinSession')).toBe(1);
    expect(callCount('getCurrentMemberSession')).toBe(1);
    expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
    await deliverMember(0); await deliverMember(1);
    expect(callCount('getCurrentMemberSession')).toBe(2);
    expect(callCount('resumeSession')).toBe(0);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    if (_name === 'demo core') expect(useSessionStore.getState().session?.currentActorBerthAuthority)
      .toMatchObject({ actorUid: actor.uid, sessionId, connectionGeneration: 2 });
    if (_name === 'Press') expect(useSessionStore.getState().me).toMatchObject({ assignedRoleId: null, seatId: null });
    if (_name === 'ordinary legacy') expect(Object.hasOwn(useSessionStore.getState().session!, 'currentActorBerthAuthority')).toBe(false);
  });

  it('does not restart normal recovery when FIRST player precedes the read and a metadata-only presence update arrives again', async () => {
    await mount();
    await deliverPlayer(); await deliverPlayer({ ...actor, lastSeenAt: new Date().toISOString() });
    await advance(2_200);
    expect(callCount('resumeSession')).toBe(0);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { connectionGeneration: 2 }, connection: 'live', sessionSnapshotFreshness: 'server' });
    await deliverMember(0); await deliverMember(1);
    expect(callCount('getCurrentMemberSession')).toBe(2);
    expect(callCount('resumeSession')).toBe(0);
  });

  it.each([
    ['generation', { connectionGeneration: 3 }], ['group', { fleetGroupId: 'fleet-2' }],
    ['primary', { assignedRoleId: 'admiral' }], ['active role', { activeConsoleRoleId: 'executive-officer' }],
    ['role', { role: 'gm' }],
  ] as const)('withdraws genuinely different FIRST %s while the initial member read is pending', async (_name, change) => {
    await mount();
    const reader = currentPlayerReader();
    act(() => reader.next(snapshot(playerPath(), { ...actor, ...change })));
    expect(frames.some(frame => frame.connection === 'offline' && frame.freshness === 'cache')).toBe(true);
  });

  it.each(['disconnected', 'missing', 'kicked', 'permission-denied', 'unavailable'] as const)(
    'withdraws FIRST %s while the initial transaction remains pending', async kind => {
      await mount(); const reader = currentPlayerReader();
      act(() => {
        if (kind === 'permission-denied' || kind === 'unavailable') reader.error({ code: kind });
        else reader.next(snapshot(playerPath(), kind === 'missing' ? null : {
          ...actor, ...(kind === 'disconnected' ? { connected: false } : { kickedAt: 'now' }),
        }));
      });
      expect(useSessionStore.getState().connection).not.toBe('live');
      if (kind !== 'kicked') expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
      // A generic transient listener error is not terminal revocation. Its
      // already pending authenticated transaction may subsequently confirm.
      // Disconnection/missing/kicked/permission-denied actually revoke it.
      await deliverMember(0);
      if (kind !== 'unavailable') expect(useSessionStore.getState().connection).not.toBe('live');
      else expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
    },
  );

  it('cannot use an accepted join as FIRST confirmation after original Auth changes', async () => {
    await mount(); sdk.auth.currentUser = { uid: 'foreign-auth-uid' };
    const reader = currentPlayerReader();
    act(() => reader.next(snapshot(playerPath(), { ...actor })));
    expect(frames.some(frame => frame.connection === 'offline' && frame.freshness === 'cache')).toBe(true);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  });

  it.each([
    ['foreign UID', { actorUid: 'foreign-original' }], ['foreign SID', { sessionId: 'foreign-session' }],
    ['foreign group', { groupId: 'fleet-2' }],
  ] as const)('does not make the FIRST player credit a %s transaction', async (_name, change) => {
    await mount(); await deliverPlayer(); await deliverMember(0, change);
    expect(useSessionStore.getState().connection).not.toBe('live');
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
    expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
  });

  it('keeps cached player data out of original confirmation and later accepts only the matching server player', async () => {
    await mount(); await deliverPlayer({ ...actor, connectionGeneration: 1 }, true);
    expect(useSessionStore.getState().me?.connectionGeneration).toBe(2);
    expect(useSessionStore.getState().me?.connected).toBeUndefined();
    expect(callCount('getCurrentMemberSession')).toBe(1);
    await deliverPlayer(); await advance(2_200);
    expect(callCount('resumeSession')).toBe(0);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connectionGeneration: 2 } });
  });

  it('cannot restore a retired initial read or player callback after disconnect', async () => {
    await mount(); const retired = currentPlayerReader();
    act(() => useSessionStore.getState().disconnect()); await advance();
    await deliverMember(0);
    act(() => retired.next(snapshot(playerPath(), { ...actor })));
    await advance();
    expect(useSessionStore.getState()).toMatchObject({ session: null, me: null, sessionSnapshotFreshness: 'unknown', roleBrief: null });
    expect(callCount('resumeSession')).toBe(0);
  });

  it('withdraws a real later generation change and retains the original normal retry behavior', async () => {
    await mount(); await deliverMember(0); await deliverPlayer(); await deliverMember(1);
    await deliverPlayer({ ...actor, connectionGeneration: 3 });
    expect(useSessionStore.getState()).toMatchObject({ connection: 'offline', sessionSnapshotFreshness: 'cache',
      identityHydrationRevision: 1, me: { connectionGeneration: 3 } });
    await advance(2_200);
    expect(callCount('resumeSession')).toBe(1);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  });

  it('retains GM root startup without ordinary initial-member confirmation', async () => {
    await mount({ gm: true }); await deliverPlayer(); await advance(2_200);
    expect(callCount('getCurrentMemberSession')).toBe(0);
    expect(callCount('resumeSession')).toBe(0);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      identityHydrationRevision: 1, me: { role: 'gm', connectionGeneration: 2 } });
  });

  it('does not initialize member authority from a persisted HY0 actor while the original normal resume is pending', async () => {
    await mount({ cold: true });
    expect(useSessionStore.getState().identityHydrationRevision).toBe(0);
    expect(callCount('resumeSession')).toBe(1);
    expect(callCount('joinSession')).toBe(0);
    expect(callCount('getCurrentMemberSession')).toBe(0);
    expect(listeners.some(reader => reader.path === playerPath())).toBe(false);
    expect(useSessionStore.getState().connection).not.toBe('live');
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
  });

  it('does not initialize FIRST matching player after the original Auth UID disappears', async () => {
    await mount(); sdk.auth.currentUser = null;
    const reader = currentPlayerReader();
    act(() => reader.next(snapshot(playerPath(), { ...actor })));
    expect(frames.some(frame => frame.connection === 'offline' && frame.freshness === 'cache')).toBe(true);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  });

  it.each([
    ['awaiting replacement', { replacementStatus: 'awaiting-re-role' }],
    ['replacement role', { replacementRoleId: 'commissar' }],
    ['escape', { escapeState: { status: 'pending', shipId: 'aegis', destructionEventId: 'original-destruction', revision: 1 } }],
  ] as const)('does not treat FIRST %s as unrevoked initial core authority', async (_name, change) => {
    await mount(); const reader = currentPlayerReader();
    act(() => reader.next(snapshot(playerPath(), { ...actor, ...change })));
    expect(frames.some(frame => frame.connection === 'offline' && frame.freshness === 'cache')).toBe(true);
  });

  it('does not preserve initial operational freshness when the accepted join is already terminal debrief', async () => {
    sessionData = { ...sessionData, phase: 'debrief', fullGameDemo: { status: 'complete', progression: 'manual' } };
    await mount(); await deliverPlayer();
    expect(useSessionStore.getState()).toMatchObject({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
  });

  it('keeps early private discovery buffered through FIRST initialization until the original transaction independently confirms', async () => {
    await mount();
    const reader = listeners.filter(value => value.active && value.path === `${rootPath()}/playerDiscoveries/${actor.uid}`).at(-1)!;
    const discovery = { groupId: 'fleet-1', shipId: 'aegis', fleetGroupVesselIds: ['aegis'],
      currentCoordinate: '1413', knownCoordinates: ['1413'], knownSystems: {}, pursuitDistance: 1,
      navigationLogs: [], revision: 2 };
    act(() => reader.next(snapshot(reader.path, discovery)));
    await deliverPlayer();
    expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
    await deliverMember(0); await deliverMember(1);
    expect(useSessionStore.getState().session?.playerDiscovery).toMatchObject({ shipId: 'aegis', revision: 2 });
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connectionGeneration: 2 } });
  });
});
