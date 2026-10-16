import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createCurrentMemberSessionReader as CreateMemberReader } from '../functions/src/memberSessionCallable';
import { createCandidateCallables } from '../functions/src/candidatePathsCallable';
import type { Firestore } from 'firebase-admin/firestore';
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
type Fields = Record<string, unknown>;
type CandidateSource = {
  readonly documents: Map<string, Fields>;
  readonly handlers: ReturnType<typeof createCandidateCallables>;
};
let serial = 0;
let sessionId: string;
let actor: Player;
let sessionData: Record<string, unknown>;
let candidateSource: CandidateSource | undefined;
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

function candidateLossSource(): CandidateSource {
  const documents = new Map<string, Fields>();
  const reference = (path: string, collection = false) => ({ path, id: path.split('/').at(-1)!, collection });
  const snapshot = (path: string) => ({ ...reference(path), ref: reference(path), exists: documents.has(path),
    get: (field: string) => field.split('.').reduce<unknown>((value, key) =>
      (value as Fields | undefined)?.[key], documents.get(path)),
    data: () => documents.get(path) });
  const update = (target: { path: string }, fields: Fields) => {
    const next = structuredClone(documents.get(target.path) ?? {});
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.'); let current = next;
      for (const key of parts.slice(0, -1)) { current[key] ??= {}; current = current[key] as Fields; }
      current[parts.at(-1)!] = value;
    }
    documents.set(target.path, next);
  };
  const db = { doc: (path: string) => reference(path), collection: (path: string) => reference(path, true),
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone([...documents.entries()]); let written = false;
      try {
        return await callback({
          get: async (target: ReturnType<typeof reference>) => target.collection
            ? { docs: [...documents.keys()].filter(path => path.startsWith(`${target.path}/`) &&
              !path.slice(target.path.length + 1).includes('/')).map(snapshot) }
            : snapshot(target.path),
          set: (target: { path: string }, value: Fields) => { written = true; documents.set(target.path, structuredClone(value)); },
          create: (target: { path: string }, value: Fields) => { written = true;
            if (documents.has(target.path)) throw new Error('Existing immutable audit');
            documents.set(target.path, structuredClone(value)); },
          update: (target: { path: string }, value: Fields) => { written = true; update(target, value); },
          delete: (target: { path: string }) => { written = true; documents.delete(target.path); },
        });
      } catch (error) {
        documents.clear(); for (const [path, value] of before) documents.set(path, value);
        throw error;
      }
    } } as unknown as Firestore;
  const handlers = createCandidateCallables({ db, die: () => 6, now: () => new Date('2026-10-06T09:20:00Z'),
    requireShipAuthority: async () => undefined, commitTerminal: async (_tx, _ref, _session, input) => input,
    survivorOutcome: session => ({ type: 'survivor-outcome', finalSurvivors: session.get('shipSurvivors.shepherd') }),
    serverTimestamp: () => 'server-time' });
  const put = (path: string, value: Fields) => documents.set(path, value);
  put('sessions/s1', { name: 'Candidate loss table', joinCode: '123456', phase: 'active', currentTurn: 6,
    chartId: 'A', configurationLocked: true, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T09:20:00.000Z',
    activeVesselIds: ['aegis', 'shepherd'], activeRoleIds: ['admiral', 'shepherd-captain'],
    fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { turn: 6, teamPhaseEndsAt: '2026-10-06T10:00:00.000Z', openAirspaceEndsAt: '2026-10-06T13:00:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
    maintenanceCycles: { aegis: { step: 0, revision: 1, turn: 6, charges: ['jump-drive'], results: {}, refuelled: [] },
      shepherd: { step: 0, revision: 1, turn: 6, charges: ['jump-drive'], results: {}, refuelled: [] } },
    shipResources: Object.fromEntries(['aegis', 'shepherd'].map(ship => [ship,
      { ore: 0, fuel: 20, materials: 10, food: 10, water: 10, securityTeams: 1 }])),
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false }, shepherd: { damagedSystemIds: [], destroyed: false } },
    shipSurvivors: { aegis: 5000, shepherd: 5000 }, shuttleControl: {}, shuttleDockings: [] });
  put('sessions/s1/players/admiral', { uid: 'admiral', sessionId: 's1', displayName: 'Admiral', role: 'player', connected: true,
    connectionGeneration: 2, assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', seatId: 'admiral', fleetGroupId: 'fleet-1',
    joinedAt: '2026-10-06T08:00:00.000Z' });
  put('sessions/s1/players/captain', { uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', connected: true,
    connectionGeneration: 2, assignedRoleId: 'shepherd-captain', activeConsoleRoleId: 'shepherd-captain',
    seatId: 'shepherd-captain', fleetGroupId: 'fleet-1', joinedAt: '2026-10-06T08:00:00.000Z' });
  put('sessions/s1/players/gm', { uid: 'gm', sessionId: 's1', displayName: 'GM', role: 'gm', connected: true,
    fleetGroupId: 'fleet-1', joinedAt: '2026-10-06T08:00:00.000Z' });
  put('sessions/s1/gmInstances/instance1', { uid: 'gm', connected: true, lastSeenAt: '2026-10-06T09:20:00Z' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis', 'shepherd'],
    memberUids: ['admiral', 'captain', 'gm'], memberShipIds: { admiral: 'aegis', captain: 'shepherd' } });
  put('sessions/s1/serverState/navigation', { revision: 1, shipGalacticCoordinates: { aegis: '0408', shepherd: '0408' },
    systemHistory: { aegis: { '0408': { coordinate: '0408', candidateDiscovery: { id: 'arrival1',
      occurredAt: '2026-10-06T08:30:00.000Z', code: 'O', title: 'Deep Nebula', source: 'arrival' } } } } });
  for (let index = 0; index < 2; index += 1) put(`sessions/s1/deepNebulaScans/scan-${index}`,
    { type: 'deep-nebula-scan', sessionId: 's1', requestId: `scan-${index}`, shipId: 'aegis', cycle: 5, targetCoordinate: '0408' });
  return { documents, handlers };
}

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

async function mount(options: { demo?: boolean; press?: boolean; gm?: boolean; legacy?: boolean; cold?: boolean;
  path?: string; roleId?: string } = {}) {
  const roleId = options.roleId ?? (options.press ? 'press-officer' : 'executive-officer');
  const path = options.path ?? (options.demo === false || options.gm ? '/console' : '/demo-actors');
  window.history.replaceState({}, '', options.demo === false || options.gm ? `/#${path}`
    : `/?demoActor=${sessionId}~${roleId}&demoJoin=123456#${path}`);
  ({ useSessionStore } = await import('@/store/useSessionStore'));
  service = await import('@/lib/sessionService');
  const context = await import('@/lib/demoActorContext');
  legacy = options.legacy === true;
  if (legacy) delete sessionData.fullGameDemo;
  actor = { ...actor, role: options.gm ? 'gm' : 'player',
    assignedRoleId: options.gm || options.press ? null : roleId,
    seatId: options.gm || options.press ? null : roleId,
    activeConsoleRoleId: options.gm ? null : options.press ? roleId : actor.activeConsoleRoleId ?? null };
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
      const values: Record<string, Record<string, unknown>> = Object.fromEntries(candidateSource?.documents ?? []);
      values[rootPath()] = { ...sessionData };
      values[playerPath()] = { ...actor };
      values[`${rootPath()}/fleetGroups/fleet-1`] = {
        ...(candidateSource?.documents.get(`${rootPath()}/fleetGroups/fleet-1`) ?? {}),
        id: 'fleet-1', vesselIds: ['aegis'], memberUids: [actor.uid],
        ...(!legacy ? { memberShipIds: { [actor.uid]: 'aegis' } } : {}),
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
    if (name === 'readCandidateWorkspace') {
      if (!candidateSource) throw new Error('Candidate source fixture is unavailable.');
      return candidateSource.handlers.read({ data: data as Record<string, unknown>, auth: { uid: actor.uid } })
        .then(value => ({ data: value }));
    }
    if (name === 'refreshPresence') {
      // The production DemoActorControls starts normal persona renewal after
      // join. Its SDK reply and own-player server callback arrive separately.
      // The same endpoint also receives the active role on a console entry.
      expect(data).toMatchObject({ sessionId });
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
  candidateSource = undefined;
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

async function mountCandidateLoss(path: string) {
  candidateSource = candidateLossSource();
  const command = { sessionId: 's1', requestId: 'candidate-loss-app', expectedRevision: 0,
    expectedGroupId: 'fleet-1', code: 'O', coordinate: '0408', action: 'nebula-jump', shipId: 'aegis' };
  const loss = await candidateSource.handlers.execute({ data: command, auth: { uid: 'admiral' } });
  expect(loss).toMatchObject({ status: 'committed', outcome: 'lost', fuelSpent: 6 });
  sessionId = 's1';
  sessionData = { ...candidateSource.documents.get('sessions/s1')!, updatedAt: '2026-10-06T09:20:00.000Z' };
  actor = structuredClone(candidateSource.documents.get('sessions/s1/players/admiral')!) as unknown as Player;
  sdk.auth.currentUser = { uid: actor.uid };
  await mount({ demo: false, path, roleId: 'admiral' });
  for (const reply of presenceReplies) reply.resolve({ data: { sessionId } });
  await advance();
  await deliverPlayer({ ...actor });
  await deliverMember(0);
  if (memberResponses[1]) await deliverMember(1);
  useSessionStore.getState().setMode('console');
  return { loss, command };
}

async function deliverCandidateDiscovery() {
  const path = `${rootPath()}/playerDiscoveries/${actor.uid}`;
  const reader = listeners.filter(value => value.active && value.path === path).at(-1)!;
  expect(reader).toBeDefined();
  act(() => reader.next(snapshot(path, { groupId: 'fleet-1', shipId: 'aegis', fleetGroupVesselIds: ['aegis'],
    currentCoordinate: '0408', knownCoordinates: ['0408'], knownSystems: {}, pursuitDistance: 1,
    navigationLogs: [], candidateReveals: [{ code: 'O', title: 'Deep Nebula' }], revision: 2 })));
  await advance();
}

describe('candidate-loss actor recovery through the current member surface', () => {
  it('shows the real lost result and closes the destroyed vessel console actions', async () => {
    const { loss } = await mountCandidateLoss('/console');
    expect(candidateSource?.documents.get('sessions/s1/players/admiral')?.candidateDisposition)
      .toEqual({ code: 'O', outcome: 'lost', cycle: 6 });
    expect(useSessionStore.getState()).toMatchObject({ connection: 'live', sessionSnapshotFreshness: 'server',
      me: { uid: actor.uid, role: 'player', activeConsoleRoleId: 'admiral' },
      session: { shipDamage: { aegis: { destroyed: true } }, shipSurvivors: { aegis: 0 } } });
    expect(loss).toMatchObject({ outcome: 'lost' });

    await deliverCandidateDiscovery();
    const [{ default: ShipConsole }, { MemoryRouter, Route, Routes }] = await Promise.all([
      import('@/routes/ShipConsole'), import('react-router-dom'),
    ]);
    render(<MemoryRouter initialEntries={['/ships/aegis/roles/admiral']}>
      <Routes><Route path="/ships/:shipId/roles/:roleId" element={<ShipConsole />} /></Routes>
    </MemoryRouter>);
    await advance(300);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const discoveries = screen.getByRole('region', { name: 'Candidate discoveries' });
    expect(within(discoveries).getAllByText('Deep Nebula')).toHaveLength(2);
    expect(within(discoveries).getByText(/the ship was lost within the Deep Nebula/i)).toBeVisible();
    const begin = screen.getByRole('button', { name: /begin maintenance cycle/i });
    expect(begin).toBeDisabled();
  });

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
