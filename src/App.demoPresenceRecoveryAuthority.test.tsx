import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createCurrentMemberSessionReader as CreateMemberReader } from '../functions/src/memberSessionCallable';
import type { GameSession, Player } from '@/types/game';
import type { useSessionStore as SessionStore } from '@/store/useSessionStore';
import type * as SessionService from '@/lib/sessionService';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn() },
  otherAuth: { currentUser: { uid: 'ordinary-admiral-uid' }, authStateReady: vi.fn() },
  call: vi.fn(), listen: vi.fn(), read: vi.fn(), signIn: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: (...args: unknown[]) => sdk.signIn(...args) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (service: unknown, name: string) => (data: unknown) => sdk.call(name, data, service),
}));
vi.mock('@/lib/firebase', () => ({
  app: () => ({}), auth: () => sdk.auth, functions: () => ({ roleId: 'icebreaker-miner' }),
  demoActorServices: (profile: { roleId: string }) => ({
    auth: profile.roleId === 'admiral' ? sdk.otherAuth : sdk.auth, functions: { roleId: profile.roleId },
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
let acceptedJoin: GameSession;
let ledger: { name: string; roleId: string; uid: string | null; generation: number | undefined; hydration: number; connection: string; freshness: string }[];
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
  const roleId = options.press ? 'press-officer' : 'icebreaker-miner';
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
      { sessionId, roleId: 'admiral', uid: sdk.otherAuth.currentUser.uid, label: 'Other ordinary actor' },
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
        [`${rootPath()}/fleetGroups/fleet-1`]: { id: 'fleet-1', vesselIds: ['aegis', 'icebreaker'], memberUids: [actor.uid],
          ...(!legacy ? { memberShipIds: { [actor.uid]: 'icebreaker' } } : {}) },
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
  sdk.call.mockImplementation((name: string, data: unknown, service: { roleId?: string }) => {
    const roleId = service.roleId ?? 'icebreaker-miner';
    const uid = roleId === 'admiral' ? sdk.otherAuth.currentUser.uid : sdk.auth.currentUser?.uid ?? null;
    const current = useSessionStore.getState();
    ledger.push({ name, roleId, uid, generation: current.me?.connectionGeneration,
      hydration: current.identityHydrationRevision, connection: current.connection, freshness: current.sessionSnapshotFreshness });
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
      if (roleId === 'admiral') return Promise.resolve({ data: { sessionId } });
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
  acceptedJoin = sessionFrom(sessionId, projection.session as Record<string, unknown>);
  joinReply.resolve({ data: { session: acceptedJoin, player } });
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
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
  sessionId = `miner-presence-renewal-${++serial}`;
  sessionData = { name: 'Source-coupled Miner presence renewal', joinCode: '123456', phase: 'active', currentTurn: 1,
    playerCount: 18, activeVesselIds: ['aegis', 'icebreaker'], activeRoleIds: ['admiral', 'icebreaker-miner'],
    fullGameDemo: { status: 'active', progression: 'manual' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: 'original-authority-uid', sessionId, displayName: 'Original actor', role: 'player',
    connected: true, fleetGroupId: 'fleet-1', connectionGeneration: 2, assignedRoleId: 'icebreaker-miner',
    seatId: 'icebreaker-miner', activeConsoleRoleId: null, replacementRoleId: null, replacementStatus: null,
    joinedAt: new Date().toISOString() };
  listeners = []; memberResponses = []; presenceReplies = []; resumeReplies = []; frames = []; joinReply = deferred(); legacy = false; ledger = [];
  sdk.otherAuth.authStateReady.mockReset().mockResolvedValue(undefined);
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
  resumeReplies.forEach(pending => pending.resolve({ data: { session: acceptedJoin, player: actor } }));
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

describe('real demo presence recovery while the original Miner member read is pending', () => {
  it('keeps the source-shaped omitted-connected join and both ordinary roster identities stable on successful presence', async () => {
    await mount();
    expect(presenceReplies).toHaveLength(1);
    expect(ledger.filter(call => call.name === 'refreshPresence').map(call => call.roleId)).toEqual(['admiral', 'icebreaker-miner']);
    expect(Object.hasOwn(useSessionStore.getState().me!, 'connected')).toBe(false);
    presenceReplies[0]!.resolve({ data: { sessionId } });
    await advance(); await deliverPlayer();
    expect(callCount('resumeSession')).toBe(0);
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      identityHydrationRevision: 1, me: { uid: actor.uid, connectionGeneration: 2, activeConsoleRoleId: null } });
    expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeUndefined();
    expect(memberResponses).toHaveLength(1);
    expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it('withholds live authority while an original foreground roster resume is awaiting its original SDK reply', async () => {
    await mount(); await deliverPlayer();
    presenceReplies[0]!.reject(Object.assign(new Error('Original SDK presence is unavailable.'), { code: 'functions/unavailable' }));
    await advance();
    expect(callCount('resumeSession')).toBe(1);
    expect(ledger.filter(call => call.name === 'resumeSession')).toEqual([
      expect.objectContaining({ roleId: 'icebreaker-miner', uid: actor.uid, generation: 2, hydration: 1 }),
    ]);
    const { sessionSnapshotAuthorityFor, memberSessionResumeBlocksFreshness } = await import('@/lib/firestore');
    // Characterize the unchanged production seam before the behavioral assertion:
    // this gateway call has no normal sessionService pending-resume token.
    expect(memberSessionResumeBlocksFreshness(sessionSnapshotAuthorityFor(sessionId, actor.uid))).toBe(false);
    // Source resumeSession writes nextConnectionGeneration in its transaction
    // before replying. Its own-player callback and new current-member read may
    // arrive while the original SDK promise remains pending.
    actor = { ...actor, connectionGeneration: 3 };
    await deliverPlayer();
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    await deliverMember(memberResponses.length - 1);
    expect(useSessionStore.getState().me?.connectionGeneration).toBe(3);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    expect(resumeReplies).toHaveLength(1);
    expect(useSessionStore.getState().connection).not.toBe('live');
    expect(useSessionStore.getState().sessionSnapshotFreshness).toBe('cache');
  });

  it('keeps the normal public sessionService resume fence effective with the same roster and member callback', async () => {
    await mount(); await deliverPlayer();
    const recovering = service.connectAutomatically(); await advance();
    expect(resumeReplies).toHaveLength(1);
    const { sessionSnapshotAuthorityFor, memberSessionResumeBlocksFreshness } = await import('@/lib/firestore');
    expect(memberSessionResumeBlocksFreshness(sessionSnapshotAuthorityFor(sessionId, actor.uid))).toBe(true);
    actor = { ...actor, connectionGeneration: 3 };
    await deliverPlayer(); await deliverMember(memberResponses.length - 1);
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1, sessionSnapshotFreshness: 'cache',
      me: { uid: actor.uid, connectionGeneration: 3 } });
    expect(useSessionStore.getState().connection).not.toBe('live');
    const projection = await readMember();
    const { sessionFrom } = await import('@/lib/firestore');
    resumeReplies[0]!.resolve({ data: { session: sessionFrom(sessionId, projection.session as Record<string, unknown>), player: actor } });
    await recovering; await advance();
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 2,
      me: { uid: actor.uid, sessionId, connectionGeneration: 3 } });
    expect(callCount('resumeSession')).toBe(1);
  });

  it('stops the already-awaited renewal when its original document is disposed', async () => {
    await mount();
    act(unmount!); unmount = undefined;
    presenceReplies[0]!.reject(Object.assign(new Error('Original SDK presence is unavailable.'), { code: 'functions/unavailable' }));
    await advance();
    expect(callCount('resumeSession')).toBe(0);
    expect(callCount('refreshPresence')).toBe(2);
  });

  it('stops the already-awaited renewal after an actual member listener error withdraws live authority', async () => {
    await mount(); await deliverPlayer();
    act(() => currentPlayerReader().error({ code: 'unavailable' }));
    await advance();
    expect(useSessionStore.getState()).toMatchObject({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
    presenceReplies[0]!.reject(Object.assign(new Error('Original SDK presence is unavailable.'), { code: 'functions/unavailable' }));
    await advance();
    expect(callCount('resumeSession')).toBe(0);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
  });

  it('stops the already-awaited renewal after the original own-player server document becomes disconnected', async () => {
    await mount(); await deliverPlayer();
    await deliverPlayer({ ...actor, connected: false });
    expect(useSessionStore.getState().connection).not.toBe('live');
    presenceReplies[0]!.reject(Object.assign(new Error('Original SDK presence is unavailable.'), { code: 'functions/unavailable' }));
    await advance();
    expect(callCount('resumeSession')).toBe(0);
  });

  it('does not issue the delayed original-persona resume under a changed SDK Auth account', async () => {
    await mount(); await deliverPlayer();
    sdk.auth.currentUser = { uid: 'foreign-sdk-account' };
    presenceReplies[0]!.reject(Object.assign(new Error('Original SDK presence is unavailable.'), { code: 'functions/unavailable' }));
    await advance();
    expect(callCount('resumeSession')).toBe(0);
    expect(sdk.signIn).not.toHaveBeenCalled();
  });
});
