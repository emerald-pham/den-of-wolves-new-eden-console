import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createCurrentMemberSessionReader as CreateMemberReader } from '../functions/src/memberSessionCallable';
import type { GameSession, Player } from '@/types/game';
import type { useSessionStore as SessionStore } from '@/store/useSessionStore';
import type * as SessionService from '@/lib/sessionService';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn() },
  backgroundAuth: { currentUser: { uid: 'original-inactive-admiral' }, authStateReady: vi.fn() },
  call: vi.fn(), listen: vi.fn(), read: vi.fn(), signIn: vi.fn(), fetch: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: (...args: unknown[]) => sdk.signIn(...args) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (service: unknown, name: string) => (data: unknown) => sdk.call(name, data, service),
}));
vi.mock('@/lib/firebase', () => ({
  app: () => ({}), auth: () => sdk.auth, functions: () => ({ roleId: 'icebreaker-miner' }),
  demoActorServices: (profile: { roleId: string }) => ({
    auth: profile.roleId === 'admiral' ? sdk.backgroundAuth : sdk.auth, functions: { roleId: profile.roleId },
  }),
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

// Real App, normal manager join, member reader/subscriber, Controls, store and
// version monitor. Only existing SDK I/O and unrelated visual leaves are mocked.
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
  path: string;
  next: (value: ReturnType<typeof snapshot>) => void;
  error: (value: { code: string }) => void;
  active: boolean;
}
type IdentityReply = { data: { session: GameSession; player: Player } };
let serial = 0;
let sessionId: string;
let actor: Player;
let sessionData: Record<string, unknown>;
let listeners: Listener[];
let join: ReturnType<typeof deferred<IdentityReply>>;
let memberReplies: ReturnType<typeof deferred<{ data: Record<string, unknown> }>>[];
let resumes: ReturnType<typeof deferred<IdentityReply>>[];
let useSessionStore: typeof SessionStore;
let service: typeof SessionService;
let automaticConnect: { mock: { calls: unknown[][] }; mockClear: () => void };
let readMember: () => Promise<Record<string, unknown>>;
let sourceSession: GameSession;
let unmount: (() => void) | undefined;
let stopWatch: (() => void) | undefined;
let visibility: DocumentVisibilityState;
let ledger: { endpoint: string; roleId: string; hydration: number; generation: number | undefined;
  connection: string; freshness: string; visibility: DocumentVisibilityState; documentTimeOrigin: number }[];
let frames: { hydration: number; generation: number | undefined; connection: string; freshness: string }[];
const rootPath = () => `sessions/${sessionId}`;
const playerPath = () => `${rootPath()}/players/${actor.uid}`;
const callCount = (endpoint: string) => sdk.call.mock.calls.filter(call => call[0] === endpoint).length;

async function advance(ms = 100) {
  // Existing native SDK/React delivery scheduling; no setSystemTime, source
  // timer change, game clock, deadline change or document replacement.
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function publishPlayer() {
  const listener = listeners.filter(item => item.active && item.path === playerPath()).at(-1);
  expect(listener).toBeDefined();
  act(() => listener!.next(snapshot(playerPath(), { ...actor })));
  await advance();
}
async function deliverMember(index: number) {
  const data = await readMember();
  expect(memberReplies[index]).toBeDefined();
  await act(async () => { memberReplies[index]!.resolve({ data }); });
  await advance();
  return data;
}
async function mountReadyOriginalMiner({ waitForJoin = true, waitForPlayer = true } = {}) {
  window.history.replaceState({}, '', `/?demoActor=${sessionId}~icebreaker-miner&demoJoin=123456#/demo-actors`);
  ({ useSessionStore } = await import('@/store/useSessionStore'));
  service = await import('@/lib/sessionService');
  automaticConnect = vi.spyOn(service, 'connectAutomatically');
  const context = await import('@/lib/demoActorContext');
  context.rememberDemoActorAccount(context.activeDemoActorProfile!, actor.uid);
  localStorage.setItem(context.demoActorRosterStorageKey(sessionId), JSON.stringify([
    { sessionId, roleId: 'admiral', uid: sdk.backgroundAuth.currentUser.uid, label: 'Original Admiral' },
    { sessionId, roleId: 'icebreaker-miner', uid: actor.uid, label: 'Original Miner' },
  ]));
  const { createCurrentMemberSessionReader } = await import('../functions/src/memberSessionCallable');
  const reference = (path: string, collection = false) => ({ path, collection });
  const values = () => ({
    [rootPath()]: { ...sessionData }, [playerPath()]: { ...actor },
    [`${rootPath()}/fleetGroups/fleet-1`]: { id: 'fleet-1', vesselIds: ['icebreaker'], memberUids: [actor.uid],
      memberShipIds: { [actor.uid]: 'icebreaker' } },
  });
  const db = { doc: reference, collection: (path: string) => reference(path, true),
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ readOnly: true });
      const current: Record<string, Record<string, unknown>> = values();
      const serverSnapshot = (path: string) => ({ id: path.split('/').at(-1), exists: Object.hasOwn(current, path),
        data: () => current[path], get: (key: string) => current[path]?.[key] });
      return callback({ get: async (ref: ReturnType<typeof reference>) => ref.collection
        ? { docs: Object.keys(current).filter(path => path.startsWith(`${ref.path}/`) &&
          !path.slice(ref.path.length + 1).includes('/')).map(serverSnapshot) }
        : serverSnapshot(ref.path) });
    } };
  const reader = createCurrentMemberSessionReader({ db: db as unknown as Parameters<typeof CreateMemberReader>[0]['db'],
    projectSession: source => source.data() as Record<string, unknown> });
  readMember = () => reader({ auth: sdk.auth.currentUser!, data: { sessionId } });
  sdk.listen.mockImplementation((ref, _options, next, error) => {
    const listener = { path: ref.path, next, error, active: true };
    listeners.push(listener);
    return () => { listener.active = false; };
  });
  sdk.call.mockImplementation((endpoint: string, data: unknown, service: { roleId?: string }) => {
    const state = useSessionStore.getState();
    ledger.push({ endpoint, roleId: service.roleId ?? 'icebreaker-miner', hydration: state.identityHydrationRevision,
      generation: state.me?.connectionGeneration, connection: state.connection, freshness: state.sessionSnapshotFreshness,
      visibility, documentTimeOrigin: performance.timeOrigin });
    if (endpoint === 'joinSession') return join.promise;
    if (endpoint === 'getCurrentMemberSession') {
      expect(data).toEqual({ sessionId });
      const pending = deferred<{ data: Record<string, unknown> }>(); memberReplies.push(pending); return pending.promise;
    }
    if (endpoint === 'resumeSession') {
      expect(data).toEqual({ sessionId });
      const pending = deferred<IdentityReply>(); resumes.push(pending); return pending.promise;
    }
    if (endpoint === 'refreshPresence') return Promise.resolve({ data: { sessionId } });
    throw new Error(`Unexpected callable ${endpoint}`);
  });
  const { sessionFrom } = await import('@/lib/firestore');
  await import('@/routes/DemoActorManager');
  const { default: App } = await import('./App');
  unmount = render(<App />).unmount;
  await advance();
  expect(callCount('joinSession')).toBe(1);
  if (!waitForJoin) {
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 0, session: null });
    automaticConnect.mockClear();
    return;
  }
  const projection = await readMember();
  sourceSession = sessionFrom(sessionId, projection.session as Record<string, unknown>);
  expect(Object.hasOwn(sourceSession, 'currentActorBerthAuthority')).toBe(false);
  const player = { ...actor }; delete player.connected;
  await act(async () => { join.resolve({ data: { session: sourceSession, player } }); });
  await advance(300);
  expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  expect(Object.hasOwn(useSessionStore.getState().me!, 'connected')).toBe(false);
  if (!waitForPlayer) {
    automaticConnect.mockClear();
    return;
  }
  await publishPlayer();
  await deliverMember(0);
  // FIRST player queues the existing current refresh while the first getter is
  // pending. Complete that already-requested source read; add no API call.
  if (memberReplies.length > 1) await deliverMember(1);
  expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
    identityHydrationRevision: 1, me: { uid: actor.uid, sessionId, connected: true, connectionGeneration: 2 },
    session: { currentActorBerthAuthority: { actorUid: actor.uid, connectionGeneration: 2, shipId: 'icebreaker' } } });
  expect(callCount('resumeSession')).toBe(0);
  automaticConnect.mockClear();
  stopWatch = useSessionStore.subscribe(state => frames.push({ hydration: state.identityHydrationRevision,
    generation: state.me?.connectionGeneration, connection: state.connection, freshness: state.sessionSnapshotFreshness }));
}
async function shortVisibleReturn() {
  visibility = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange')));
  await advance(100);
  visibility = 'visible'; act(() => document.dispatchEvent(new Event('visibilitychange')));
  await advance(100);
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
  visibility = 'visible'; vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  sdk.fetch.mockReset().mockRejectedValue(new Error('No native network')); vi.stubGlobal('fetch', sdk.fetch);
  sessionId = `miner2-visible-return-${++serial}`;
  actor = { uid: 'original-visible-miner', sessionId, displayName: 'Original Miner', role: 'player', connected: true,
    fleetGroupId: 'fleet-1', connectionGeneration: 2, assignedRoleId: 'icebreaker-miner', seatId: 'icebreaker-miner',
    activeConsoleRoleId: null, replacementRoleId: null, replacementStatus: null, joinedAt: new Date().toISOString() };
  sessionData = { name: 'Source-owned member visibility', joinCode: '123456', phase: 'active', currentTurn: 1,
    playerCount: 8, activeVesselIds: ['aegis', 'icebreaker'], activeRoleIds: ['admiral', 'icebreaker-miner'],
    fullGameDemo: { status: 'active', progression: 'manual' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  listeners = []; memberReplies = []; resumes = []; ledger = []; frames = []; join = deferred();
  sdk.auth.currentUser = { uid: actor.uid }; sdk.auth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.backgroundAuth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset();
  sdk.signIn.mockReset().mockRejectedValue(new Error('The original persona cannot be replaced.'));
});
afterEach(async () => {
  console.info(JSON.stringify({ kind: 'native-member-visible-return', test: expect.getState().currentTestName,
    ledger, frames, current: { documentTimeOrigin: performance.timeOrigin, generation: useSessionStore?.getState().me?.connectionGeneration,
      hydration: useSessionStore?.getState().identityHydrationRevision, connection: useSessionStore?.getState().connection,
      freshness: useSessionStore?.getState().sessionSnapshotFreshness }, staticVersionFetches: sdk.fetch.mock.calls.length,
    automaticConnectCallsAfterInitialJoin: automaticConnect?.mock.calls.length }));
  stopWatch?.(); stopWatch = undefined;
  if (unmount) act(unmount); unmount = undefined;
  memberReplies.forEach(pending => pending.resolve({ data: {} }));
  resumes.forEach(pending => pending.resolve({ data: { session: sourceSession, player: actor } }));
  await act(async () => { await Promise.resolve(); });
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('original member short visibility return composition', () => {
  it('does not start another normal resume for a current LIVE/server document during a 100ms hidden return', async () => {
    await mountReadyOriginalMiner();
    const original = { timeOrigin: performance.timeOrigin, uid: sdk.auth.currentUser!.uid,
      generation: useSessionStore.getState().me!.connectionGeneration, hydration: useSessionStore.getState().identityHydrationRevision };
    await shortVisibleReturn();
    expect(sdk.fetch).not.toHaveBeenCalled(); // The real stale monitor rejects this interval.
    expect(performance.timeOrigin).toBe(original.timeOrigin);
    expect(sdk.auth.currentUser!.uid).toBe(original.uid);
    expect(useSessionStore.getState().me!.connectionGeneration).toBe(original.generation);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(original.hydration);
    expect(automaticConnect.mock.calls).toHaveLength(0);
    expect(callCount('resumeSession')).toBe(0);
  });

  it('normal same-profile manager Link changes only the hash, preserving the accepted document without resume', async () => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    act(() => fireEvent.click(screen.getByRole('link', { name: /^Enter this actor's stations$/ })));
    await advance(300);
    expect(window.location.hash).toBe('#/console'); expect(performance.timeOrigin).toBe(original);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      identityHydrationRevision: 1, me: { uid: actor.uid, connectionGeneration: 2 } });
    expect(callCount('resumeSession')).toBe(0); expect(sdk.fetch).not.toHaveBeenCalled();
  });

  it('retains the original accepted join when the normal DTO omits connected and FIRST member reads are pending', async () => {
    await mountReadyOriginalMiner({ waitForPlayer: false }); const original = performance.timeOrigin;
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      identityHydrationRevision: 1, me: { uid: actor.uid, sessionId, connectionGeneration: 2 } });
    expect(Object.hasOwn(useSessionStore.getState().me!, 'connected')).toBe(false);
    expect(memberReplies).toHaveLength(1);
    await shortVisibleReturn();
    expect(automaticConnect.mock.calls).toHaveLength(0); expect(callCount('resumeSession')).toBe(0);
    expect(performance.timeOrigin).toBe(original); expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeUndefined();
    expect(sdk.signIn).not.toHaveBeenCalled(); expect(sdk.fetch).not.toHaveBeenCalled();
  });

  it('retains the original normal pending-resume fence during genuine offline/cached visibility recovery', async () => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    act(() => window.dispatchEvent(new Event('offline')));
    expect(useSessionStore.getState()).toMatchObject({ connection: 'offline', sessionSnapshotFreshness: 'cache',
      identityHydrationRevision: 1, me: { uid: actor.uid, sessionId, connectionGeneration: 2 } });
    await shortVisibleReturn(); expect(resumes).toHaveLength(1);
    expect(automaticConnect.mock.calls).toHaveLength(1);
    const { sessionSnapshotAuthorityFor, memberSessionResumeBlocksFreshness } = await import('@/lib/sessionSnapshotAuthority');
    expect(memberSessionResumeBlocksFreshness(sessionSnapshotAuthorityFor(sessionId, actor.uid))).toBe(true);
    // Functions resume writes its next generation before the original SDK
    // reply. Deliver only that existing source-shaped own-player observation.
    actor = { ...actor, connectionGeneration: 3 }; await publishPlayer();
    const next = memberReplies.length - 1; await deliverMember(next);
    if (memberReplies.length > next + 1) await deliverMember(next + 1);
    expect(performance.timeOrigin).toBe(original);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId, connectionGeneration: 3 }, sessionSnapshotFreshness: 'cache' });
    expect(useSessionStore.getState().connection).not.toBe('live');
    // The real current-member read may render its field in cache. It cannot
    // authorize that field while the original resume token/freshness blocks it.
    expect(useSessionStore.getState().session?.currentActorBerthAuthority).toMatchObject({
      actorUid: actor.uid, connectionGeneration: 3, shipId: 'icebreaker',
    });
    expect(callCount('resumeSession')).toBe(1); expect(sdk.signIn).not.toHaveBeenCalled(); expect(sdk.fetch).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'missing'])('does not suppress ordinary recovery when actual Auth becomes %s', async kind => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    sdk.auth.currentUser = kind === 'foreign' ? { uid: 'foreign-visible-account' } : null;
    await shortVisibleReturn();
    expect(automaticConnect.mock.calls).toHaveLength(1);
    expect(performance.timeOrigin).toBe(original);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId, connectionGeneration: 2 }, sessionSnapshotFreshness: 'cache' });
    expect(useSessionStore.getState().connection).not.toBe('live');
    expect(callCount('resumeSession')).toBe(0); expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('does not suppress ordinary recovery when the stored member belongs to another session', async () => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    // A foreign current input is a denial fixture, never an accepted identity.
    act(() => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, sessionId: 'foreign-member-session' }));
    await shortVisibleReturn();
    expect(automaticConnect.mock.calls).toHaveLength(1); expect(resumes).toHaveLength(1);
    expect(performance.timeOrigin).toBe(original);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId: 'foreign-member-session', connectionGeneration: 2 }, sessionSnapshotFreshness: 'cache' });
    expect(useSessionStore.getState().connection).not.toBe('live'); expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('does not suppress initial document recovery before the ordinary join SDK hydrates identity', async () => {
    await mountReadyOriginalMiner({ waitForJoin: false }); const original = performance.timeOrigin;
    await shortVisibleReturn();
    expect(automaticConnect.mock.calls).toHaveLength(1); expect(callCount('resumeSession')).toBe(0);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 0, session: null, me: null });
    expect(useSessionStore.getState().sessionSnapshotFreshness).not.toBe('server');
    expect(performance.timeOrigin).toBe(original); expect(sdk.auth.currentUser!.uid).toBe(actor.uid);
    expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('does not suppress ordinary recovery after the original own-player confirms disconnected', async () => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    actor = { ...actor, connected: false }; await publishPlayer();
    expect(useSessionStore.getState().me!.connected).toBe(false);
    await shortVisibleReturn();
    expect(automaticConnect.mock.calls).toHaveLength(1); expect(resumes).toHaveLength(1);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId, connected: false, connectionGeneration: 2 }, sessionSnapshotFreshness: 'cache' });
    expect(useSessionStore.getState().connection).not.toBe('live'); expect(performance.timeOrigin).toBe(original);
    expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('does not suppress normal visible recovery when the original public member resume is already pending', async () => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    const pendingOriginal = service.resumeSession(sessionId); await advance();
    expect(resumes).toHaveLength(1);
    const { sessionSnapshotAuthorityFor, memberSessionResumeBlocksFreshness } = await import('@/lib/sessionSnapshotAuthority');
    expect(memberSessionResumeBlocksFreshness(sessionSnapshotAuthorityFor(sessionId, actor.uid))).toBe(true);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1 });
    await shortVisibleReturn();
    expect(automaticConnect.mock.calls).toHaveLength(1); expect(resumes).toHaveLength(2);
    expect(memberSessionResumeBlocksFreshness(sessionSnapshotAuthorityFor(sessionId, actor.uid))).toBe(true);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId, connectionGeneration: 2 }, sessionSnapshotFreshness: 'cache' });
    expect(useSessionStore.getState().connection).not.toBe('live'); expect(performance.timeOrigin).toBe(original);
    const player = { ...actor }; delete player.connected;
    await act(async () => { resumes[0]!.resolve({ data: { session: sourceSession, player } }); await pendingOriginal; });
    expect(memberSessionResumeBlocksFreshness(sessionSnapshotAuthorityFor(sessionId, actor.uid))).toBe(true);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  });

  it('keeps the real minute-stale version monitor recovery even when the original member was previously live', async () => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    visibility = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange')));
    await advance(60_000);
    visibility = 'visible'; act(() => document.dispatchEvent(new Event('visibilitychange')));
    await advance();
    expect(sdk.fetch).toHaveBeenCalledOnce(); expect(automaticConnect.mock.calls).toHaveLength(1);
    expect(resumes).toHaveLength(1); expect(performance.timeOrigin).toBe(original);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { uid: actor.uid, sessionId, connectionGeneration: 2 }, sessionSnapshotFreshness: 'cache' });
    expect(useSessionStore.getState().connection).not.toBe('live'); expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('keeps the real online callback recovery independent of the immediate visibility optimization', async () => {
    await mountReadyOriginalMiner(); const original = performance.timeOrigin;
    act(() => window.dispatchEvent(new Event('online'))); await advance();
    expect(automaticConnect.mock.calls).toHaveLength(1); expect(resumes).toHaveLength(1);
    expect(performance.timeOrigin).toBe(original); expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
    expect(useSessionStore.getState().connection).not.toBe('live'); expect(sdk.signIn).not.toHaveBeenCalled();
  });
});
