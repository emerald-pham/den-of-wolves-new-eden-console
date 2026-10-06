import { act, render } from '@testing-library/react';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sourceDelay } from 'node:timers/promises';
import { createContext, Script, SyntheticModule } from 'node:vm';
import ts from 'typescript';
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

async function mount(options: { demo?: boolean; press?: boolean; gm?: boolean; legacy?: boolean; cold?: boolean; rawOptionalAbsent?: boolean } = {}) {
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
  if (options.rawOptionalAbsent) {
    const raw = actor as unknown as Record<string, unknown>;
    delete raw.assignedRoleId; delete raw.replacementRoleId; delete raw.replacementStatus;
  }
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
    projectSession: (source, currentSid) => ({ ...source.data(), id: currentSid }) });
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
  const reply = await actualJoinReply();
  expect(reply.player).not.toHaveProperty('connected');
  expect(Object.hasOwn(projection.session as object, 'currentActorBerthAuthority')).toBe(false);
  joinReply.resolve({ data: reply });
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
  sessionId = `press-selection-readiness-${++serial}`;
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

const parsed = async (path: string) => ts.createSourceFile(path,
  await readFile(`${process.cwd()}/${path}`, 'utf8'), ts.ScriptTarget.Latest, true,
  path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function only(source: ts.SourceFile, predicate: (node: ts.Node) => boolean, within: ts.Node = source) {
  const found: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(within); assert.equal(found.length, 1, 'Extract exactly one actual source node.'); return found[0]!;
}
const javascript = (value: string) => ts.transpileModule(value, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace(/^export\s+/gm, '');
const sourceFunction = (source: ts.SourceFile, name: string) => only(source,
  node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source);

async function actualJoinReply(): Promise<Reply['data']> {
  const source = await parsed('functions/src/index.ts');
  const join = only(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'joinSession');
  const reply = only(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'reply', join) as ts.VariableDeclaration;
  const returned = only(source, node => ts.isReturnStatement(node) && node.getText(source).includes(
    'session: (await currentMemberSessionReader('), join);
  const { parsePlayerEscapeState } = await import('../functions/src/escapeState');
  const context = createContext({ Date, uid: actor.uid, sessionId, joinResult: { seatId: actor.seatId,
    connectionGeneration: actor.connectionGeneration, stationSelectionRequired: false },
    playerSnap: { get: (key: string) => (actor as unknown as Record<string, unknown>)[key] },
    currentMemberSessionReader: () => readMember(), parsePlayerEscapeState,
    Timestamp: class {}, commandError: () => { throw new Error('No malformed original actor.'); } });
  const code = [sourceFunction(source, 'cleanName'), sourceFunction(source, 'isoOf'),
    sourceFunction(source, 'playerEscapeState'),
    `(async () => { const reply = ${reply.initializer!.getText(source)}; ${returned.getText(source)} })()`].join('\n');
  return JSON.parse(JSON.stringify(await new Script(javascript(code)).runInContext(context))) as Reply['data'];
}

// Same existing native browser-module transport style as the current-document
// fixtures, bound to the actual rendered App's store/Auth/profile. The complete
// public factory and both actual callback bodies run; no acceptable tuple is
// created here and no proof predicate or source SDK call is substituted.
async function publicPressSelection(onRich?: (index: number) => Promise<void>) {
  const source = await parsed('scripts/pc10-two-browser-gameplay.mjs');
  const generic = await parsed('scripts/pc10-full-game-demo-ui-proof.mjs');
  const observed = only(generic, node => ts.isFunctionDeclaration(node) && node.name?.text === 'observe');
  const call = only(generic, node => ts.isCallExpression(node) && node.expression.getText(generic) === 'page.evaluate', observed) as ts.CallExpression;
  const contextModule = await import('@/lib/demoActorContext');
  const rows: { kind: string; index: number; value: Record<string, unknown> }[] = [];
  let rich = 0;
  async function evaluate(callback: string, moduleUrl: string, kind: string) {
    assert.equal(moduleUrl, '/src/store/useSessionStore.ts');
    const browser = createContext({ crypto: webcrypto, TextEncoder, Date,
      performance: { timeOrigin: window.performance.timeOrigin }, document: window.document, input: moduleUrl });
    const namespaces = new Map([
      ['/src/store/useSessionStore.ts', { useSessionStore }],
      ['/src/lib/firebase.ts', { auth: () => sdk.auth }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: contextModule.activeDemoActorProfile }],
    ] as const);
    const modules = new Map<string, SyntheticModule>();
    for (const [name, namespace] of namespaces) {
      const module = new SyntheticModule(Object.keys(namespace), function () {
        for (const [key, value] of Object.entries(namespace)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => { throw new Error('No added SDK or module import.'); }); await module.evaluate(); modules.set(name, module);
    }
    const value = JSON.parse(JSON.stringify(await new Script(`(${callback})(input)`, {
      importModuleDynamically: async name => {
        assert.ok(modules.has(name), `Only original observer source modules: ${name}`); return modules.get(name)!;
      },
    }).runInContext(browser))) as Record<string, unknown>;
    const index = kind === 'rich' ? ++rich : rows.filter(row => row.kind === kind).length + 1;
    rows.push({ kind, index, value }); if (kind === 'rich') await onRich?.(index); return value;
  }
  const crew = { storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: () => evaluate(call.arguments[0]!.getText(generic), '/src/store/useSessionStore.ts', 'generic'),
    page: { url: () => window.location.href,
      evaluate: (callback: (...args: never[]) => unknown, moduleUrl: string) => evaluate(callback.toString(), moduleUrl, 'rich'),
      goto: () => { throw new Error('No navigation or replacement document authorized.'); },
      getByRole: () => { throw new Error('Already held native route must not invoke any UI action.'); } },
    callable: () => { throw new Error('No new SDK command authorized.'); },
  };
  const roles = await parsed('functions/src/roleConfiguration.ts'), access = await parsed('functions/src/crewAccess.ts');
  const ids = only(roles, node => ts.isVariableDeclaration(node) && node.name.getText(roles) === 'ROLE_IDS') as ts.VariableDeclaration;
  const catalog = createContext({});
  new Script(javascript(`const ROLE_IDS = ${ids.initializer!.getText(roles)}; ${sourceFunction(access, 'shipForRole')}`)).runInContext(catalog);
  const shipForRole = new Script('shipForRole;').runInContext(catalog) as (role: string) => string | undefined;
  const factory = createContext({ assert, createHash, Date, delay: sourceDelay,
    normalMemberRoleRequiresBerth: (role: string) => shipForRole(role) !== undefined });
  new Script(javascript(sourceFunction(source, 'createTwoBrowserGameplay'))).runInContext(factory);
  const create = new Script('createTwoBrowserGameplay;').runInContext(factory) as
    (context: unknown) => { select: (role: string, options: { deadlineAt: number }) => Promise<unknown> };
  const adapter = create({ gm: {}, crew, initial: { sessionId, joinCode: '123456' },
    started: { fullGameDemo: { status: 'active', progression: 'manual' } },
    roster: [{ roleId: 'press-officer', uidHash: createHash('sha256').update(actor.uid).digest('hex').slice(0, 16) }],
    directory: '/native-no-files' });
  return { rows, select: () => adapter.select('press-officer', { deadlineAt: Date.now() + 2_000 }) };
}

async function heldPressRoute() {
  act(() => { window.location.hash = '/press'; }); await advance();
  expect(window.location.hash).toBe('#/press');
}
async function confirmOriginalPlayerAndMember() {
  presenceReplies.forEach(reply => reply.resolve({ data: { sessionId } }));
  await deliverMember(0); await deliverPlayer(); await deliverMember(1);
}
function expectCurrentConfirmedSource() {
  expect(useSessionStore.getState().me?.connected).toBe(true);
  expect(useSessionStore.getState().me?.assignedRoleId).toBeNull();
  expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeNull();
  expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
    connection: 'live', sessionSnapshotFreshness: 'server', me: { connectionGeneration: 3 } });
}

describe('actual initial ordinary Press source completion and public selection', () => {
  it('publishes the exact join reply without inventing connected or optional nullable fields', async () => {
    await mount({ rawOptionalAbsent: true });
    expect(useSessionStore.getState()).toMatchObject({ identityHydrationRevision: 1,
      connection: 'live', sessionSnapshotFreshness: 'server', me: { connectionGeneration: 3, activeConsoleRoleId: 'press-officer' } });
    expect(useSessionStore.getState().me).not.toHaveProperty('connected');
    expect(useSessionStore.getState().me).not.toHaveProperty('assignedRoleId');
    expect(useSessionStore.getState().me).not.toHaveProperty('replacementStatus');
    expect(useSessionStore.getState().session).not.toHaveProperty('currentActorBerthAuthority');
    expect(callCount('getCurrentMemberSession')).toBe(1);
    expect(useSessionStore.getState().session?.playerDiscovery).toBeUndefined();
  });

  it('matching real player parsing normalizes absent assignment to null while replacement status remains optional', async () => {
    await mount({ rawOptionalAbsent: true }); await confirmOriginalPlayerAndMember(); expectCurrentConfirmedSource();
    expect(useSessionStore.getState().me).not.toHaveProperty('replacementStatus');
    expect(callCount('joinSession')).toBe(1); expect(callCount('getCurrentMemberSession')).toBe(2);
    expect(callCount('refreshPresence')).toBe(1); expect(callCount('resumeSession')).toBe(0);
  });

  it('initial public Press select must not return before actual own player and current-member confirmation', async () => {
    await mount({ rawOptionalAbsent: true }); await heldPressRoute();
    const selection = await publicPressSelection(async index => { if (index === 3) await confirmOriginalPlayerAndMember(); });
    await selection.select(); expectCurrentConfirmedSource();
    expect(selection.rows.filter(row => row.kind === 'rich')[0]!.value.currentMemberBerthPresent).toBe(false);
    expect(callCount('getCurrentMemberSession')).toBe(2); expect(callCount('resumeSession')).toBe(0);
  });

  it('a completed first member transaction cannot stand in for the still-delayed original own player', async () => {
    await mount({ rawOptionalAbsent: true }); await deliverMember(0); await heldPressRoute();
    expect(useSessionStore.getState().session?.currentActorBerthAuthority).toBeNull();
    expect(useSessionStore.getState().me).not.toHaveProperty('connected');
    const selection = await publicPressSelection(async index => {
      if (index === 3) { await deliverPlayer(); await deliverMember(1); }
    });
    await selection.select(); expectCurrentConfirmedSource();
    expect(callCount('getCurrentMemberSession')).toBe(2); expect(callCount('resumeSession')).toBe(0);
  });

  it('completed original current Press retains all source predicates and selects without new SDK or navigation', async () => {
    await mount({ rawOptionalAbsent: true }); await confirmOriginalPlayerAndMember(); await heldPressRoute();
    const selection = await publicPressSelection(); await selection.select(); expectCurrentConfirmedSource();
    expect(callCount('joinSession')).toBe(1); expect(callCount('getCurrentMemberSession')).toBe(2);
    expect(callCount('resumeSession')).toBe(0); expect(callCount('refreshPresence')).toBe(1);
  });

  it('real changed source generation during the first sample cannot be adopted for selection', async () => {
    await mount({ rawOptionalAbsent: true }); await heldPressRoute();
    const selection = await publicPressSelection(async index => {
      if (index === 1) await deliverPlayer({ ...actor, connectionGeneration: 4 });
    });
    await expect(selection.select()).rejects.toThrow(/generation|Generation|changed/);
    expect(callCount('resumeSession')).toBe(0);
  });
});
