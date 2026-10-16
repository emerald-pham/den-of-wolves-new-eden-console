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
  const roleId = options.press === false ? 'refinery-124-pdf-colonel' : 'press-officer';
  window.history.replaceState({}, '', options.demo === false || options.gm ? '/#/console'
    : `/?demoActor=${sessionId}~${roleId}&demoJoin=123456#/demo-actors`);
  ({ useSessionStore } = await import('@/store/useSessionStore'));
  service = await import('@/lib/sessionService');
  const context = await import('@/lib/demoActorContext');
  legacy = options.legacy === true;
  if (legacy) delete sessionData.fullGameDemo;
  actor = { ...actor, role: options.gm ? 'gm' : 'player',
    assignedRoleId: options.gm || roleId === 'press-officer' ? null : roleId,
    seatId: options.gm || roleId === 'press-officer' ? null : roleId,
    activeConsoleRoleId: roleId === 'press-officer' ? roleId : null };
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
      expect(data).toEqual({ sessionId, activeConsoleRoleId: actor.activeConsoleRoleId });
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
  sessionId = `press-group-discovery-${++serial}`;
  sessionData = { name: 'Press group discovery', joinCode: '123456', phase: 'active', currentTurn: 1,
    playerCount: 18, activeVesselIds: ['refinery-124'], activeRoleIds: ['press-officer'], pressEnabled: true, pressHolderUid: 'original-station-uid',
    shuttleControl: { 'snn-press-shuttle': { shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer',
      ownerUid: 'original-station-uid', holderUid: 'original-station-uid', revision: 0 } },
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

async function joinedPress() {
  await mount();
  presenceReplies.forEach(reply => reply.resolve({ data: { sessionId } }));
  await deliverMember(0); await deliverPlayer(); await deliverMember(1);
  expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
    connection: 'live', sessionSnapshotFreshness: 'server', me: { uid: actor.uid, sessionId,
      connectionGeneration: 3, activeConsoleRoleId: 'press-officer', assignedRoleId: null, seatId: null },
    session: { currentActorBerthAuthority: null,
      memberSessionScope: { groupId: 'fleet-1', vesselIds: [], craftIds: ['snn-press-shuttle'] } } });
}
async function sourceDiscovery(change: Record<string, unknown> = {}, retiredReader?: Listener) {
  const { playerDiscoveryProjection } = await import('../functions/src/navigationProjection');
  const projection = playerDiscoveryProjection({ get: (key: string) => actor[key as keyof Player] }, {
    shipGalacticCoordinates: { 'refinery-124': '1413' }, shipNavigationLogs: {}, pursuitGroups: { 'fleet-1': 2 },
  }, 4, ['refinery-124']);
  expect(projection).not.toHaveProperty('shipId');
  expect(projection).not.toHaveProperty('currentCoordinate');
  const reader = retiredReader ?? listeners.filter(value => value.active && value.path === `${rootPath()}/playerDiscoveries/${actor.uid}`).at(-1)!;
  act(() => reader.next(snapshot(reader.path, { ...projection, ...change })));
  await advance();
}
function expectNoPrivateShipOrCandidates() {
  const session = useSessionStore.getState().session;
  expect(session?.shipGalacticCoordinates).toBeUndefined();
  expect(session?.shipNavigationLogs).toBeUndefined();
  expect(session?.currentGroupCandidateReveals).toBeUndefined();
  expect(session?.playerDiscovery?.shipId).toBeUndefined();
  expect(session?.playerDiscovery?.currentCoordinate).toBeUndefined();
  expect(session?.playerDiscovery?.candidateReveals).toBeUndefined();
  expect(session?.playerDiscovery?.systemHistory).toBeUndefined();
}
function expectOwnGroup() {
  expect(useSessionStore.getState().session?.playerDiscovery).toEqual({
    groupId: 'fleet-1', fleetGroupVesselIds: ['refinery-124'], revision: 4,
    knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [],
  });
  expectNoPrivateShipOrCandidates();
}
function expectWithdrawn() {
  expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
  expectNoPrivateShipOrCandidates();
}

describe('ordinary original Press receives only current own group metadata', () => {
  it('binds the real own SNN scope and control without inventing a root holder or retained occupancy flag', async () => {
    await joinedPress();
    expect(useSessionStore.getState().session?.pressClaimed).toBe(false);
    expect(useSessionStore.getState().session).not.toHaveProperty('pressHolderUid');
    expect(useSessionStore.getState().session?.shuttleControl?.['snn-press-shuttle']).toEqual({
      shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer', ownerUid: actor.uid, holderUid: actor.uid, revision: 0,
    });
    await sourceDiscovery(); expectOwnGroup();
  });

  it('accepts the actual no-ship server projection through normal join/member/player/SDK source delivery', async () => {
    await joinedPress(); await sourceDiscovery(); expectOwnGroup();
    expect(callCount('joinSession')).toBe(1);
    expect(callCount('getCurrentMemberSession')).toBe(2);
    expect(callCount('refreshPresence')).toBe(1);
    expect(callCount('resumeSession')).toBe(0);
  });

  it('retains group metadata through the same normal presence player callback and matching next member header', async () => {
    await joinedPress(); await sourceDiscovery();
    await deliverPlayer();
    await deliverMember(2);
    expectOwnGroup();
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      me: { connectionGeneration: 3 }, connection: 'live', sessionSnapshotFreshness: 'server' });
    expect(callCount('getCurrentMemberSession')).toBe(3);
    expect(callCount('resumeSession')).toBe(0);
  });

  it('never copies source known coordinates or group candidate names into the Press metadata view', async () => {
    await joinedPress(); await sourceDiscovery({ knownCoordinates: ['0000', '1413'], knownSystems: { secret: '1413' },
      candidateReveals: [{ code: 'N', title: 'PRIVATE CANDIDATE' }], missionCommittedCraftIds: ['starlight'] });
    expectOwnGroup();
    expect(JSON.stringify(useSessionStore.getState().session?.playerDiscovery)).not.toMatch(/PRIVATE CANDIDATE|secret|1413|starlight/);
  });

  it.each([
    ['foreign group', { groupId: 'fleet-2' }], ['ship', { shipId: 'refinery-124' }],
    ['coordinate', { currentCoordinate: '1413' }], ['duplicate vessels', { fleetGroupVesselIds: ['refinery-124', 'refinery-124'] }],
    ['invalid revision', { revision: -1 }],
  ] as const)('rejects a %s discovery without a static-ship fallback', async (_label, change) => {
    await joinedPress(); await sourceDiscovery(change); expectWithdrawn();
  });

  it.each([
    ['control holder', { holderUid: 'foreign' }], ['control owner', { ownerUid: 'foreign' }],
    ['control role', { ownerRoleId: 'wing-commander' }], ['control revision', { revision: -1 }],
  ] as const)('withdraws group metadata when current %s changes', async (_label, change) => {
    await joinedPress(); await sourceDiscovery();
    const control = (sessionData.shuttleControl as Record<string, Record<string, unknown>>)['snn-press-shuttle'];
    sessionData = { ...sessionData, shuttleControl: { 'snn-press-shuttle': { ...control, ...change } } };
    await deliverPlayer(); await deliverMember(2); await sourceDiscovery(); expectWithdrawn();
  });

  it.each([
    ['generation', { connectionGeneration: 4 }], ['group', { fleetGroupId: 'fleet-2' }],
    ['released Press', { activeConsoleRoleId: null }], ['primary assignment', { assignedRoleId: 'executive-officer' }],
    ['primary seat', { seatId: 'executive-officer' }], ['replacement', { replacementRoleId: 'commissar' }],
    ['replacement status', { replacementStatus: 'awaiting-re-role' }],
    ['disconnected', { connected: false }], ['kicked', { kickedAt: 'now' }],
  ] as const)('withdraws a prior group projection on current actor %s', async (_label, change) => {
    await joinedPress(); await sourceDiscovery();
    const reader = listeners.filter(value => value.active && value.path === `${rootPath()}/playerDiscoveries/${actor.uid}`).at(-1)!;
    await deliverPlayer({ ...actor, ...change }); await sourceDiscovery({}, _label === 'kicked' ? reader : undefined); expectWithdrawn();
  });

  it.each(['foreign', 'missing'] as const)('cannot retain or accept under %s original Auth', async kind => {
    await joinedPress(); await sourceDiscovery();
    sdk.auth.currentUser = kind === 'foreign' ? { uid: 'foreign-auth' } : null;
    await sourceDiscovery(); expectWithdrawn();
    expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'expired session', 'wrong holder'] as const)('withdraws when Press is %s in the next current member source', async kind => {
    await joinedPress(); await sourceDiscovery();
    sessionData = { ...sessionData, ...(kind === 'disabled' ? { pressEnabled: false }
      : kind === 'expired session' ? { phase: 'debrief' } : { pressHolderUid: 'foreign' }) };
    await deliverPlayer(); await deliverMember(2); await sourceDiscovery(); expectWithdrawn();
  });

  it.each(['cache', 'missing', 'permission-denied'] as const)('withdraws a %s protected discovery without positive stale restoration', async kind => {
    await joinedPress(); await sourceDiscovery();
    const reader = listeners.filter(value => value.active && value.path === `${rootPath()}/playerDiscoveries/${actor.uid}`).at(-1)!;
    act(() => {
      if (kind === 'permission-denied') reader.error({ code: kind });
      else reader.next(snapshot(reader.path, kind === 'missing' ? null : { groupId: 'fleet-1', fleetGroupVesselIds: ['refinery-124'], revision: 5 }, true));
    });
    await advance(); expectWithdrawn();
  });

  it('cannot restore a retired listener after the original document disconnects', async () => {
    await joinedPress(); await sourceDiscovery();
    const retired = listeners.filter(value => value.active && value.path === `${rootPath()}/playerDiscoveries/${actor.uid}`).at(-1)!;
    act(() => useSessionStore.getState().disconnect()); await advance();
    act(() => retired.next(snapshot(retired.path, { groupId: 'fleet-1', fleetGroupVesselIds: ['refinery-124'], revision: 4 })));
    await advance(); expect(useSessionStore.getState().session).toBeNull();
  });

  it.each([
    ['capital scope', { groupId: 'fleet-1', vesselIds: ['refinery-124'], craftIds: ['snn-press-shuttle'] }],
    ['missing SNN scope', { groupId: 'fleet-1', vesselIds: [], craftIds: [] }],
    ['foreign craft', { groupId: 'fleet-1', vesselIds: [], craftIds: ['starlight'] }],
    ['foreign group', { groupId: 'fleet-2', vesselIds: [], craftIds: ['snn-press-shuttle'] }],
  ] as const)('rejects a %s current member envelope without reusing prior group metadata', async (_label, scope) => {
    await joinedPress(); await sourceDiscovery(); await deliverPlayer();
    const source = await readMember();
    await deliverMember(2, { session: { ...(source.session as Record<string, unknown>), memberSessionScope: scope } });
    await sourceDiscovery(); expectWithdrawn();
  });

  it('withdraws the old group metadata on a same-holder control revision change before any new protected delivery', async () => {
    await joinedPress(); await sourceDiscovery();
    const control = (sessionData.shuttleControl as Record<string, Record<string, unknown>>)['snn-press-shuttle'];
    sessionData = { ...sessionData, shuttleControl: { 'snn-press-shuttle': { ...control, revision: 1 } } };
    await deliverPlayer(); await deliverMember(2); expectWithdrawn();
  });

  it('rejects a foreign SID current member response and cannot restore the prior discovery', async () => {
    await joinedPress(); await sourceDiscovery(); await deliverPlayer();
    await deliverMember(2, { sessionId: 'foreign-session' }); await sourceDiscovery(); expectWithdrawn();
  });

  it('does not transfer group metadata across actual normal resume hydration or accept its retired callback', async () => {
    await joinedPress(); await sourceDiscovery();
    const retired = listeners.filter(value => value.active && value.path === `${rootPath()}/playerDiscoveries/${actor.uid}`).at(-1)!;
    act(() => window.dispatchEvent(new Event('online'))); await advance();
    expect(callCount('resumeSession')).toBe(1);
    const source = await readMember();
    const { sessionFrom } = await import('@/lib/firestore');
    actor = { ...actor, connectionGeneration: 4 };
    resumeReplies[0]!.resolve({ data: { session: sessionFrom(sessionId, source.session as Record<string, unknown>), player: { ...actor } } });
    await advance();
    expect(useSessionStore.getState().identityHydrationRevision).toBe(2);
    expect(useSessionStore.getState().me?.connectionGeneration).toBe(4);
    await sourceDiscovery({}, retired); expectWithdrawn();
  });

  it('does not infer a modern Press audience from cached HY0 identity while ordinary resume is pending', async () => {
    await mount({ cold: true });
    expect(useSessionStore.getState().identityHydrationRevision).toBe(0);
    expect(useSessionStore.getState().sessionSnapshotFreshness).not.toBe('server');
    expect(callCount('getCurrentMemberSession')).toBe(0);
    expect(listeners.some(value => value.active && value.path.includes('/playerDiscoveries/'))).toBe(false);
    expectWithdrawn();
  });

  it('does not manufacture a modern null berth for a genuinely absent legacy transaction witness', async () => {
    await mount({ legacy: true });
    presenceReplies.forEach(reply => reply.resolve({ data: { sessionId } }));
    await deliverMember(0); await deliverPlayer(); await deliverMember(1);
    expect(useSessionStore.getState().session).not.toHaveProperty('currentActorBerthAuthority');
    await sourceDiscovery(); expectWithdrawn();
  });

  it('withdraws the group-only view on the normal source escape-state transition', async () => {
    await joinedPress(); await sourceDiscovery();
    await deliverPlayer({ ...actor, escapeState: { status: 'pending', shipId: 'refinery-124',
      destructionEventId: 'press-destruction', revision: 1 } });
    expect(useSessionStore.getState().me?.escapeState?.status).toBe('pending');
    await sourceDiscovery(); expectWithdrawn();
  });
});
