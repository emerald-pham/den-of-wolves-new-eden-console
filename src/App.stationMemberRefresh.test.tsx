import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createCurrentMemberSessionReader as CreateMemberReader } from '../functions/src/memberSessionCallable';
import type { GameSession, Player } from '@/types/game';
import type { useSessionStore as SessionStore } from '@/store/useSessionStore';
import type * as SessionService from '@/lib/sessionService';

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
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
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
  const roleId = options.press ? 'press-officer' : 'refinery-124-pdf-colonel';
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
        [`${rootPath()}/fleetGroups/fleet-1`]: { id: 'fleet-1', vesselIds: ['refinery-124'], memberUids: [actor.uid],
          ...(!legacy ? { memberShipIds: { [actor.uid]: 'refinery-124' } } : {}) },
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
    if (name === 'refreshPresence' && typeof data.activeConsoleRoleId === 'string') {
      expect(data).toEqual({ sessionId, activeConsoleRoleId: actor.assignedRoleId });
      // Real selectConsoleRole awaits this normal SDK acknowledgement; the
      // player/member server deliveries are independent source callbacks.
      return Promise.resolve({ data: { sessionId } });
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
    me: { uid: actor.uid, sessionId, connectionGeneration: 3 } });
  if (!options.gm) expect(callCount('getCurrentMemberSession')).toBe(1);
  frames = [];
  watch = useSessionStore.subscribe(state => frames.push({ connection: state.connection,
    freshness: state.sessionSnapshotFreshness, generation: state.me?.connectionGeneration,
    hydration: state.identityHydrationRevision }));
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime('2026-10-06T09:20:00.000Z'); localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
  sessionId = `station-member-refresh-${++serial}`;
  sessionData = { name: 'Station member refresh', joinCode: '123456', phase: 'active', currentTurn: 1,
    playerCount: 18, activeVesselIds: ['refinery-124'], activeRoleIds: ['refinery-124-pdf-colonel'],
    fullGameDemo: { status: 'active', progression: 'manual' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: 'original-station-uid', sessionId, displayName: 'Original actor', role: 'player',
    connected: true, fleetGroupId: 'fleet-1', connectionGeneration: 3, assignedRoleId: 'refinery-124-pdf-colonel',
    seatId: 'refinery-124-pdf-colonel', activeConsoleRoleId: null, replacementRoleId: null, replacementStatus: null,
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
  resumeReplies.forEach(pending => pending.reject(new Error('Retired original native transport.')));
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});


async function joined() {
  await mount();
  presenceReplies.forEach(pending => pending.resolve({ data: { sessionId } }));
  await deliverMember(0); await deliverPlayer(); await deliverMember(1);
  expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
    connection: 'live', sessionSnapshotFreshness: 'server', me: { uid: actor.uid, sessionId,
      connectionGeneration: 3, activeConsoleRoleId: null },
    session: { currentActorBerthAuthority: { connectionGeneration: 3, activeConsoleRoleId: null } } });
  expect(callCount('resumeSession')).toBe(0);
}
async function activate() {
  await joined();
  // This is the real normal station-entry service used by ShipConsole. No
  // store identity/live setter or fabricated command acknowledgement exists.
  await act(async () => { await service.selectConsoleRole('refinery-124-pdf-colonel'); });
  expect(useSessionStore.getState().me?.activeConsoleRoleId).toBe('refinery-124-pdf-colonel');
  actor = { ...actor, activeConsoleRoleId: 'refinery-124-pdf-colonel' };
  await deliverPlayer();
  expect(callCount('getCurrentMemberSession')).toBe(3);
  expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
  expect(useSessionStore.getState().connection).not.toBe('live');
  expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeNull();
  expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
}
function expectReadOnlyOriginal() {
  expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
    me: { uid: actor.uid, sessionId, connectionGeneration: 3 }, sessionSnapshotFreshness: 'cache' });
  expect(useSessionStore.getState().connection).not.toBe('live');
  expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeNull();
  expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
}

describe('ordinary station activation waits only for its owned current member refresh', () => {
  it('does not resume or publish private authority while its SAME original activated actor transaction is pending', async () => {
    await activate();
    await advance(2_200);
    expect(callCount('resumeSession')).toBe(0);
    expectReadOnlyOriginal();
    expect(callCount('joinSession')).toBe(1);
    expect(callCount('getCurrentMemberSession')).toBe(3);
    expect(callCount('refreshPresence')).toBe(2);
    expect(sdk.signIn).not.toHaveBeenCalled();
    await deliverMember(2);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { connectionGeneration: 3, activeConsoleRoleId: 'refinery-124-pdf-colonel' },
      connection: 'live', sessionSnapshotFreshness: 'server',
      session: { currentActorBerthAuthority: { actorUid: actor.uid, connectionGeneration: 3,
        activeConsoleRoleId: 'refinery-124-pdf-colonel' } } });
    expect(callCount('resumeSession')).toBe(0);
    expect(callCount('getCurrentMemberSession')).toBe(3);
  });

  it('drains an older in-flight member reply without authorizing it or starting normal resume for the queued activation refresh', async () => {
    await joined();
    const oldReply = await readMember();
    await deliverPlayer();
    expect(callCount('getCurrentMemberSession')).toBe(3);
    await act(async () => { await service.selectConsoleRole('refinery-124-pdf-colonel'); });
    actor = { ...actor, activeConsoleRoleId: 'refinery-124-pdf-colonel' }; await deliverPlayer();
    await advance(2_200);
    expect(callCount('resumeSession')).toBe(0);
    expectReadOnlyOriginal();
    memberResponses[2]!.resolve({ data: oldReply }); await advance();
    expect(callCount('getCurrentMemberSession')).toBe(4);
    expectReadOnlyOriginal();
    await deliverMember(3);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { connectionGeneration: 3 }, connection: 'live', sessionSnapshotFreshness: 'server' });
    expect(callCount('resumeSession')).toBe(0);
  });

  it.each([
    ['generation', { connectionGeneration: 4 }], ['group', { fleetGroupId: 'fleet-2' }],
    ['assignment', { assignedRoleId: 'admiral' }], ['seat', { seatId: 'admiral' }],
    ['replacement', { replacementRoleId: 'commissar' }], ['withdrawn replacement', { replacementStatus: 'awaiting-re-role' }],
  ] as const)('retains real recovery after a later %s change while activation refresh is pending', async (_name, change) => {
    await activate(); await deliverPlayer({ ...actor, ...change }); await advance(2_200);
    expect(callCount('resumeSession')).toBe(1);
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
    expect(useSessionStore.getState().connection).not.toBe('live');
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeNull();
  });

  it.each(['disconnected', 'missing', 'kicked', 'permission-denied', 'unavailable'] as const)(
    'does not let activation pending ownership mask real %s', async kind => {
      await activate(); const reader = currentPlayerReader();
      act(() => {
        if (kind === 'permission-denied' || kind === 'unavailable') reader.error({ code: kind });
        else reader.next(snapshot(playerPath(), kind === 'missing' ? null : {
          ...actor, ...(kind === 'disconnected' ? { connected: false } : { kickedAt: 'now' }),
        }));
      });
      expect(useSessionStore.getState().connection).not.toBe('live');
      await advance(2_200);
      expect(callCount('resumeSession')).toBe(kind === 'kicked' ? 0 : 1);
      if (kind === 'kicked') expect(useSessionStore.getState().session).toBeNull();
      else expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
    },
  );

  it('retains genuine browser offline/reconnect behavior during the member refresh', async () => {
    await activate(); act(() => window.dispatchEvent(new Event('offline'))); await advance(2_200);
    expect(callCount('resumeSession')).toBe(1);
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  });

  it.each([
    ['foreign UID', { actorUid: 'foreign-original' }], ['foreign SID', { sessionId: 'foreign-session' }],
    ['foreign group', { groupId: 'fleet-2' }], ['old active role', { activeConsoleRoleId: null }],
  ] as const)('rejects the %s activation transaction and resumes only through normal recovery', async (_name, change) => {
    await activate(); await deliverMember(2, change); await advance(2_200);
    expect(callCount('resumeSession')).toBe(1);
    expectReadOnlyOriginal();
  });

  it.each(['foreign', 'missing'] as const)('does not retain pending ownership after original Auth becomes %s', async kind => {
    await activate(); sdk.auth.currentUser = kind === 'foreign' ? { uid: 'foreign-auth' } : null;
    await advance(2_200);
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
    expect(useSessionStore.getState().connection).not.toBe('live');
    expect(sdk.signIn).not.toHaveBeenCalled();
    // The original persona cannot be replaced by anonymous fallback. Normal
    // reconnect attempts reject the wrong/missing account before issuing SDK.
    expect(callCount('resumeSession')).toBe(0);
  });

  it('cannot restore a retired activation reply or listener after disconnect', async () => {
    await activate(); const retired = currentPlayerReader();
    act(() => useSessionStore.getState().disconnect()); await advance();
    await deliverMember(2);
    act(() => retired.next(snapshot(playerPath(), { ...actor }))); await advance();
    expect(useSessionStore.getState()).toMatchObject({ session: null, me: null, sessionSnapshotFreshness: 'unknown' });
    expect(callCount('resumeSession')).toBe(0);
  });

  it('keeps activation private discovery buffered until its matching transaction independently accepts', async () => {
    await activate();
    const reader = listeners.filter(value => value.active && value.path === `${rootPath()}/playerDiscoveries/${actor.uid}`).at(-1)!;
    act(() => reader.next(snapshot(reader.path, { groupId: 'fleet-1', shipId: 'refinery-124', fleetGroupVesselIds: ['refinery-124'],
      currentCoordinate: '1413', knownCoordinates: ['1413'], knownSystems: {}, pursuitDistance: 1, navigationLogs: [], revision: 3 })));
    await advance(2_200); expect(callCount('resumeSession')).toBe(0);
    expectReadOnlyOriginal();
    await deliverMember(2);
    expect(useSessionStore.getState().session?.playerDiscovery).toMatchObject({ shipId: 'refinery-124', revision: 3 });
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, me: { connectionGeneration: 3 } });
  });
});
