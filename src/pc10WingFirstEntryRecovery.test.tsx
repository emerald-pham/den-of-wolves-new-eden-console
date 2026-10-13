import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { TextEncoder } from 'node:util';
import type { createCurrentMemberSessionReader as MemberReader } from '../functions/src/memberSessionCallable';
import { roleAssignmentDecision } from '../functions/src/gameSetup';
import { canClaimSeat } from '../functions/src/seatPolicy';
import { boundCoreConsoleRole } from '../functions/src/consoleRolePolicy';
import type { GameSession, Player } from '@/types/game';
import type { useSessionStore as Store } from '@/store/useSessionStore';
import type * as Service from '@/lib/sessionService';
import type * as Authority from '@/lib/sessionSnapshotAuthority';

const sdk = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null, authStateReady: vi.fn() },
  call: vi.fn(), listen: vi.fn(), read: vi.fn(), signIn: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: (...args: unknown[]) => sdk.signIn(...args) }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_service: unknown, name: string) =>
  (data: Record<string, unknown>) => sdk.call(name, data) }));
vi.mock('@/lib/firebase', () => ({ app: () => ({}), auth: () => sdk.auth,
  functions: () => ({}), demoActorServices: () => ({ auth: sdk.auth, functions: {} }) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }), collection: (_db: unknown, path: string) => ({ path }),
  query: (reference: unknown) => reference, where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(),
  onSnapshot: (...args: unknown[]) => sdk.listen(...args), getDocFromServer: (ref: unknown) => sdk.read(ref),
  Timestamp: class { toDate() { return new Date(0); } },
}));
vi.mock('@/lib/firebaseConfig', () => ({ useEmulators: false, emulatorPorts: { firestore: 8080 } }));
vi.mock('@/lib/versionUpgrade', () => ({ startVersionUpgradeMonitor: () => () => undefined }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/ShipPlot', () => ({ default: () => null }));
vi.mock('@/components/WolfHackingRuntime', () => ({ default: () => null }));
vi.mock('@/components/TurnPhaseCoordinator', () => ({ default: () => null }));
vi.mock('@/components/TurnStartAnnouncement', () => ({ default: () => null }));
vi.mock('@/components/CrisisReportPanel', () => ({ default: () => null }));
vi.mock('@/components/FleetGroupWorkspace', () => ({ default: () => null }));
vi.mock('@/routes/SessionMode', () => ({ default: () => <main>Stations</main> }));
vi.mock('@/routes/RoleSelect', () => ({ default: () => <main>Stations</main> }));

// One focused source coupling, not a native runner. Only SDK I/O and unrelated
// visual leaves are inert. Store authority/freshness is never fixture-set.
const WING = 'wing-commander';
const VESSELS = ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
const ROLES = ['admiral', WING, 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer',
  'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'];
const SOURCE_PATH = 'scripts/pc10-starlight-movement-scout-ui-proof.mjs';
const SOURCE_COMMIT = 'a6d53813edae37e76e769233cff2c593e443a7ae';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function document(path: string, value: Record<string, unknown> | null) {
  return { id: path.split('/').at(-1), metadata: { fromCache: false }, exists: () => value !== null,
    data: () => value, get: (key: string) => value?.[key] };
}
interface Listener { path: string; active: boolean; next: (value: unknown) => void; }
type Reply = { data: { session: GameSession; player: Player } };
interface MemberCall { id: number; settled: boolean; reply: Promise<Record<string, unknown>>;
  pending: ReturnType<typeof deferred<{ data: Record<string, unknown> }>>; }
interface Startup { check: () => Promise<{ fresh: boolean }>; close: () => Promise<unknown>; failed: Promise<never>; }
let serial = 0;
let sessionId: string;
let actor: Player;
let root: Record<string, unknown>;
let group: Record<string, unknown>;
let seat: Record<string, unknown>;
let claimSnapshot: Player | undefined;
let listeners: Listener[];
let members: MemberCall[];
let resumes: { pending: ReturnType<typeof deferred<Reply>>; reply: Promise<Reply> }[];
let presence: ReturnType<typeof deferred<{ data: { sessionId: string } }>> | undefined;
let store: typeof Store;
let service: typeof Service;
let authorityModule: typeof Authority;
let readMember: () => Promise<Record<string, unknown>>;
let parseSession: (id: string, data: Record<string, unknown>) => GameSession;
let startup: Startup | undefined;
let startupFailure: Promise<Error | null> | undefined;
let holdPresenceCommit = false;
let commitPresence: (() => void) | undefined;
let unmount: (() => void) | undefined;
let stopWatch: (() => void) | undefined;
let trace: Record<string, unknown>[];
let assertions: { label: string; passed: boolean }[];
let lastStore: string;
const rootPath = () => `sessions/${sessionId}`;
const playerPath = () => `${rootPath()}/players/${actor.uid}`;
const counts = (name: string) => sdk.call.mock.calls.filter(call => call[0] === name).length;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const berthKind = (session: GameSession | undefined | null) => !session || !Object.hasOwn(session, 'currentActorBerthAuthority')
  ? 'absent' : session.currentActorBerthAuthority === null ? 'null' : 'positive';
function summary() {
  const current = store?.getState();
  const me = current?.me;
  const berth = current?.session?.currentActorBerthAuthority;
  const sdkAuthority = authorityModule && authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid);
  const map = group?.memberShipIds as Record<string, string> | undefined;
  return { generation: me?.connectionGeneration ?? null, hydration: current?.identityHydrationRevision ?? null,
    assigned: me?.assignedRoleId ?? null, active: me?.activeConsoleRoleId ?? null, seat: me?.seatId ?? null,
    connected: me?.connected ?? null, principalMatches: me ? me.uid === actor.uid && me.sessionId === sessionId : null,
    phase: current?.session?.phase ?? null, cycle: current?.session?.currentTurn ?? null,
    connection: current?.connection ?? null, freshness: current?.sessionSnapshotFreshness ?? null,
    berth: berthKind(current?.session), positiveBerthMatches: berth ? berth.actorUid === actor.uid &&
      berth.sessionId === sessionId && berth.connectionGeneration === me?.connectionGeneration &&
      berth.assignedRoleId === me?.assignedRoleId && berth.activeConsoleRoleId === me?.activeConsoleRoleId : null,
    canonicalMapPresent: Object.hasOwn(group ?? {}, 'memberShipIds'), canonicalOwnAegis: map?.[actor.uid] === 'aegis',
    canonicalGeneration: actor?.connectionGeneration, canonicalSeatOwned: seat?.holderUid === actor?.uid,
    canonicalActive: actor?.activeConsoleRoleId ?? null,
    projectionPending: current?.currentActorBerthProjectionPending != null,
    projectionOriginKind: current?.currentActorBerthProjectionPending?.kind ?? null,
    privateDiscovery: Boolean(current?.session?.playerDiscovery),
    privateCoordinates: Boolean(current?.session?.shipGalacticCoordinates),
    privateLogs: Boolean(current?.session?.shipNavigationLogs),
    sdkServer: sdkAuthority?.hasServerSessionAuthority ?? null,
    sdkPending: sdkAuthority ? authorityModule.memberSessionResumeBlocksFreshness(sdkAuthority) : null };
}
function record(kind: string, details: Record<string, unknown> = {}) {
  trace.push({ at: Date.now(), kind, ...details, state: summary() });
}
function check(label: string, operation: () => void) {
  try { operation(); assertions.push({ label, passed: true }); record('assert', { label, passed: true }); }
  catch (error) { assertions.push({ label, passed: false }); record('assert', { label, passed: false }); throw error; }
}
async function advance(ms = 100) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100)
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(100, ms - elapsed)); });
}
function listener(path: string) {
  const current = listeners.filter(value => value.active && value.path === path).at(-1);
  assert.ok(current, `The actual mounted source reader must exist for ${path.replace(actor.uid, 'own-player')}`);
  return current;
}
async function deliverPlayer(value: Player = clone(actor)) {
  record('deliver.own-player', { deliveredGeneration: value.connectionGeneration,
    deliveredSeat: value.seatId, deliveredActive: value.activeConsoleRoleId, deliveredConnected: value.connected });
  act(() => listener(playerPath()).next(document(playerPath(), value as unknown as Record<string, unknown>)));
  await advance();
}
async function deliverSeats() {
  record('deliver.seats', { ownSeat: seat.holderUid === actor.uid, seatStatus: seat.status });
  act(() => listener(`${rootPath()}/seats`).next({ docs: [document(`${rootPath()}/seats/${WING}`, clone(seat))],
    metadata: { fromCache: false } }));
  await advance();
}
async function deliverMember(call: MemberCall) {
  const data = await call.reply;
  const berth = data.currentActorBerthAuthority as Record<string, unknown> | null | undefined;
  record('deliver.current-member', { id: call.id, responseGeneration: data.connectionGeneration,
    responseAssigned: data.assignedRoleId, responseActive: data.activeConsoleRoleId,
    responseBerth: !Object.hasOwn(data, 'currentActorBerthAuthority') ? 'absent' : berth === null ? 'null' : 'positive',
    responseOwnAegis: berth?.shipId === 'aegis', responseActorMatches: data.actorUid === actor.uid });
  call.settled = true;
  call.pending.resolve({ data });
  await advance();
}
async function drainMembers() {
  for (let round = 0; round < 5; round++) {
    const batch = members.filter(value => !value.settled);
    if (!batch.length) return;
    for (const call of batch) await deliverMember(call);
  }
  assert.equal(members.filter(value => !value.settled).length, 0, 'Only the existing serial feed may request current reads.');
}
async function publishDiscovery() {
  record('deliver.private-discovery');
  act(() => listener(`${rootPath()}/playerDiscoveries/${actor.uid}`).next(document('private-discovery', {
    groupId: 'fleet-1', fleetGroupVesselIds: VESSELS, shipId: 'aegis', currentCoordinate: '1413',
    knownCoordinates: ['1413'], knownSystems: {}, pursuitDistance: 1, navigationLogs: [], revision: 1,
  })));
  await advance();
}
async function dto(): Promise<Reply> {
  const response = await readMember();
  return { data: { session: parseSession(sessionId, response.session as Record<string, unknown>), player: clone(actor) } };
}
async function installPorts() {
  ({ useSessionStore: store } = await import('@/store/useSessionStore'));
  ({ sessionFrom: parseSession } = await import('@/lib/firestore'));
  service = await import('@/lib/sessionService');
  authorityModule = await import('@/lib/sessionSnapshotAuthority');
  const { createCurrentMemberSessionReader } = await import('../functions/src/memberSessionCallable');
  const ref = (path: string, collection = false) => ({ path, collection });
  const database = { doc: ref, collection: (path: string) => ref(path, true),
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
      check('real member reader uses a read-only transaction', () => assert.deepEqual(options, { readOnly: true }));
      const values: Record<string, Record<string, unknown>> = {
        [rootPath()]: clone(root), [playerPath()]: clone(actor), [`${rootPath()}/fleetGroups/fleet-1`]: clone(group),
      };
      record('reader.atomic-snapshot');
      return callback({ get: async (reference: ReturnType<typeof ref>) => {
        record('reader.get', { kind: reference.collection ? 'collection' : 'document',
          leaf: reference.path.split('/').slice(-2).join('/').replace(actor.uid, 'own-player') });
        return reference.collection ? { docs: Object.keys(values).filter(path => path.startsWith(`${reference.path}/`) &&
          !path.slice(reference.path.length + 1).includes('/')).map(path => document(path, values[path])) }
          : document(reference.path, values[reference.path] ?? null);
      } });
    } };
  const reader = createCurrentMemberSessionReader({ db: database as unknown as Parameters<typeof MemberReader>[0]['db'],
    projectSession: source => source.data() as Record<string, unknown> });
  readMember = () => reader({ ...(sdk.auth.currentUser ? { auth: sdk.auth.currentUser } : {}), data: { sessionId } });
  sdk.listen.mockImplementation((reference, _options, next) => {
    const value = { path: reference.path, next, active: true }; listeners.push(value);
    record('reader.subscribe', { leaf: reference.path.split('/').slice(-2).join('/').replace(actor.uid, 'own-player') });
    return () => { value.active = false; };
  });
  sdk.read.mockImplementation(reference => Promise.resolve(document(reference.path, clone(root))));
  sdk.call.mockImplementation(async (name: string, data: Record<string, unknown>) => {
    record('sdk.request', { endpoint: name });
    assert.equal(sdk.auth.currentUser?.uid, actor.uid, 'Backing ports reject the wrong authenticated actor.');
    if (name === 'joinSession') {
      assert.deepEqual(data, { joinCode: '123456' });
      assert.equal(actor.connected, false);
      actor = { ...actor, connected: true, connectionGeneration: 1 };
      group = { ...group, memberUids: [actor.uid] };
      record('port.join.committed');
      const reply = await dto();
      delete reply.data.player.connected; // Production join DTO omits it.
      return reply;
    }
    assert.equal(data.sessionId, sessionId);
    if (name === 'getCurrentMemberSession') {
      const call = { id: members.length, settled: false, reply: readMember(), pending: deferred<{ data: Record<string, unknown> }>() };
      members.push(call); record('port.member.queued', { id: call.id }); return call.pending.promise;
    }
    if (name === 'resumeSession') {
      assert.equal(actor.connected, true);
      actor = { ...actor, connectionGeneration: (actor.connectionGeneration ?? 0) + 1 };
      if (actor.assignedRoleId === WING) group = { ...group, memberShipIds: { [actor.uid]: 'aegis' } };
      const call = { pending: deferred<Reply>(), reply: dto() }; resumes.push(call);
      record('port.resume.committed', { originalRequest: resumes.length === 1 }); return call.pending.promise;
    }
    if (name === 'claimSeat') {
      check('claimSeat enforces current actor/casting/revision/open-seat/assignment ownership', () => {
        assert.equal(actor.connected, true); assert.equal(actor.role, 'player');
        assert.equal(root.phase, 'casting'); assert.equal(root.currentTurn, 0);
        assert.equal(data.seatId, WING); assert.equal(data.expectedSetupRevision, root.setupRevision);
        assert.equal(canClaimSeat(actor.seatId), true); assert.equal(actor.assignedRoleId, WING);
        assert.equal(seat.status, 'open'); assert.equal(seat.holderUid, null);
        assert.equal(actor.replacementStatus, null); assert.ok(typeof data.requestId === 'string');
      });
      actor = { ...actor, seatId: WING }; claimSnapshot = clone(actor);
      seat = { ...seat, status: 'claimed', holderUid: actor.uid, claimedAt: new Date().toISOString() };
      root = { ...root, setupRevision: Number(root.setupRevision) + 1, updatedAt: new Date(Date.now() + 1).toISOString() };
      record('port.claimSeat.committed');
      return { data: { status: 'committed', requestId: data.requestId, setupRevision: root.setupRevision,
        seatId: WING, holderUid: actor.uid } };
    }
    if (name === 'refreshPresence') {
      if (data.activeConsoleRoleId === undefined) return { data: { sessionId } };
      check('presence requires connected assigned Wing and its own canonical claimed seat', () => {
        assert.equal(actor.connected, true); assert.equal(data.activeConsoleRoleId, WING);
        assert.equal(boundCoreConsoleRole(actor.assignedRoleId, actor.seatId), WING);
        assert.equal(seat.status, 'claimed'); assert.equal(seat.holderUid, actor.uid);
        assert.equal(actor.replacementRoleId, null); assert.equal(actor.replacementStatus, null);
      });
      presence = deferred();
      commitPresence = () => {
        actor = { ...actor, activeConsoleRoleId: WING };
        record('port.presence.committed.ack-held');
      };
      if (holdPresenceCommit) record('port.presence.request.commit-held');
      else commitPresence();
      return presence.promise;
    }
    throw new Error(`Unimplemented inert transport ${name}`);
  });
  stopWatch = store.subscribe(() => {
    const state = JSON.stringify(summary());
    if (state !== lastStore) { lastStore = state; record('store.publication'); }
  });
}
async function acceptedPrefix() {
  await installPorts();
  const { default: App } = await import('./App');
  unmount = render(<App />).unmount;
  await advance();
  await act(async () => { await service.joinSession('123456'); });
  await advance();
  await deliverPlayer(); await drainMembers(); await deliverSeats();
  check('normal join accepted1/1, unassigned/unseated and omitted own berth', () => {
    assert.deepEqual([store.getState().me?.connectionGeneration, store.getState().identityHydrationRevision], [1, 1]);
    assert.equal(store.getState().me?.assignedRoleId, null); assert.equal(store.getState().me?.seatId, null);
    assert.equal(berthKind(store.getState().session), 'absent'); assert.equal(counts('resumeSession'), 0);
  });
  // A facilitator casting input port changes server backing state only. It
  // uses the production decision; no client GM role or Store assignment is invented.
  check('facilitator assignment is legal in the configured casting roster', () =>
    assert.deepEqual(roleAssignmentDecision([], actor.uid, WING, ROLES), { allowed: true }));
  actor = { ...actor, assignedRoleId: WING, activeConsoleRoleId: null };
  root = { ...root, phase: 'casting', setupRevision: 2, updatedAt: new Date(Date.now() + 1).toISOString() };
  record('port.facilitator-assignment.committed');
  await deliverPlayer();
  // Trigger the existing App online recovery, not a fixture identity/live setter.
  act(() => window.dispatchEvent(new Event('online'))); await advance();
  check('exactly one original normal assignment resume was dispatched', () => assert.equal(resumes.length, 1));
  resumes[0].pending.resolve(await resumes[0].reply); record('deliver.original-resume.connected-dto');
  await advance(); await deliverPlayer(); await drainMembers(); await deliverSeats();
  check('normal resume and current reader accept assignedWing/unseated positive2/2', () => {
    const state = store.getState();
    assert.deepEqual([state.me?.connectionGeneration, state.identityHydrationRevision], [2, 2]);
    assert.equal(state.me?.connected, true); assert.equal(state.me?.assignedRoleId, WING);
    assert.equal(state.me?.seatId, null); assert.equal(state.me?.activeConsoleRoleId, null);
    assert.equal(state.session?.phase, 'casting'); assert.equal(state.session?.currentTurn, 0);
    assert.equal(state.connection, 'live'); assert.equal(state.sessionSnapshotFreshness, 'server');
    assert.equal(state.session?.currentActorBerthAuthority?.shipId, 'aegis');
    assert.equal(state.session?.currentActorBerthAuthority?.connectionGeneration, 2);
    assert.equal(authorityModule.memberSessionResumeBlocksFreshness(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid)), false);
    assert.equal(counts('joinSession'), 1); assert.equal(counts('resumeSession'), 1); assert.equal(sdk.signIn.mock.calls.length, 0);
  });
  await publishDiscovery();
  check('positive current2/2 reader releases an actual own private chart', () => {
    assert.ok(store.getState().session?.playerDiscovery); assert.ok(store.getState().session?.shipGalacticCoordinates);
  });
  await retainStartup();
}
async function retainStartup() {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const start = source.indexOf('export async function retainP181MemberAuthority(');
  const end = source.indexOf('\nexport async function observeP181StarlightSource(', start);
  assert.ok(start >= 0 && end > start);
  const retain = runInNewContext(source.slice(start, end).replace('export ', '') + '\nretainP181MemberAuthority', {
    assert, p181MemberObservationOrdinal: 0, retainP181CallerRejection: (error: unknown) => error,
    rememberProofFailure: () => undefined,
  }) as (surface: unknown, deadline: number, options: unknown) => Promise<Startup>;
  const context = await import('@/lib/demoActorContext');
  const windowPort = {};
  const surface = { storeModuleUrl: () => '/src/store/useSessionStore.ts',
    sessionAuthorityModuleUrl: () => '/src/lib/sessionSnapshotAuthority.ts',
    page: { evaluate: async (callback: (args: unknown) => unknown, args: unknown) => runInNewContext(
      '(' + String(callback).replace(/\bimport\s*\(/g, '__load(') + ')(__args)', {
        __args: args, __load: async (path: string) => {
          if (path === '/src/lib/firebase.ts') return { auth: () => ({ get currentUser() { return sdk.auth.currentUser; },
            onAuthStateChanged: () => () => undefined }) };
          if (path === '/src/lib/demoActorContext.ts') return context;
          if (path === '/src/store/useSessionStore.ts') return { useSessionStore: store };
          if (path === '/src/lib/sessionSnapshotAuthority.ts') return authorityModule;
          throw new Error(`Unexpected inert retainer module ${path}`);
        }, window: windowPort, performance: { timeOrigin: performance.timeOrigin }, Date, URL,
        setTimeout, clearTimeout, crypto: webcrypto, TextEncoder,
      }) } };
  startup = await retain(surface, Date.now() + 15_000, { mode: 'startup', memberRoleId: WING,
    expected: { sessionId, uidHash: createHash('sha256').update(actor.uid).digest('hex').slice(0, 16) },
    navigationFrom: { connectionGeneration: store.getState().me!.connectionGeneration,
      identityHydrationRevision: store.getState().identityHydrationRevision }, startCycleOne: true });
  startupFailure = startup.failed.then(() => null, failure => failure);
  check('exact mounted SDK/startup consumer pins current positive original2/2', () => assert.ok(startup));
  assert.equal((await startup.check()).fresh, true); record('startup.positive-pin.current-sdk-settled');
}
function expectPending(label: string) {
  check(label, () => {
    const state = store.getState();
    assert.deepEqual([state.me?.connectionGeneration, state.identityHydrationRevision], [2, 2]);
    assert.equal(state.me?.connected, true); assert.equal(state.sessionSnapshotFreshness, 'cache');
    assert.notEqual(state.connection, 'live'); assert.equal(state.session?.currentActorBerthAuthority, null);
    assert.equal(state.currentActorBerthProjectionPending?.kind, 'app-wing-first-entry-withheld');
    for (const field of ['playerDiscovery', 'shipGalacticCoordinates', 'shipNavigationLogs', 'voyage33Movement'])
      assert.equal(Object.hasOwn(state.session ?? {}, field), false);
  });
}
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime('2026-10-13T19:40:00.000Z'); localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
  window.history.replaceState({}, '', '/#/console');
  sessionId = `wing-open-seat-${++serial}`;
  root = { name: 'Wing source fixture', joinCode: '123456', phase: 'lobby', currentTurn: 0,
    playerCount: 8, chartId: 'A', setupConfirmed: true, setupRevision: 1, activeRoleIds: ROLES,
    activeVesselIds: VESSELS, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: 'original-wing-source-actor', sessionId, displayName: 'Wing fixture actor', role: 'player',
    connected: false, connectionGeneration: 1, fleetGroupId: 'fleet-1', assignedRoleId: null,
    activeConsoleRoleId: null, seatId: null, replacementRoleId: null, replacementStatus: null,
    joinedAt: new Date().toISOString() };
  group = { id: 'fleet-1', memberUids: [], vesselIds: VESSELS };
  seat = { roleId: WING, status: 'open', holderUid: null, factionId: 'aegis', claimedAt: null };
  listeners = []; members = []; resumes = []; presence = undefined; claimSnapshot = undefined;
  trace = []; assertions = []; lastStore = ''; startup = undefined; startupFailure = undefined;
  holdPresenceCommit = false; commitPresence = undefined;
  sdk.auth.currentUser = { uid: actor.uid }; sdk.auth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset();
  sdk.signIn.mockReset().mockRejectedValue(new Error('Original mock Auth transport cannot be replaced.'));
});
afterEach(async context => {
  const evidence = { schemaVersion: 1, test: context.task.name, runLabel: process.env.PC10_WING_FIXTURE_RUN_LABEL ?? 'unlabeled',
    sourceCommit: SOURCE_COMMIT, sourceTree: '00bf1e0f1d21d3b38dec2a136f01198a00e740f2',
    runtime: process.version, realStoreAuthoritySettersUsedByFixture: trace.some(row => row.kind === 'negative.store-reset'),
    fixtureManufacturesAcceptedAuthorityOrFreshness: false, assertions, trace,
    requests: sdk.call.mock.calls.map(([endpoint]) => endpoint),
    limits: ['Inert SDK/Auth/snapshot/ownership ports; actual App/service/reader/parser/Store/startup consumer.',
      'No actual server writer, native browser/Auth/network/runtime/gameplay or historical callback attribution.',
      'Focused source repair only; no existing-test change, build, install, commit or native acceptance.'],
    sourceHashes: ['src/pc10WingFirstEntryRecovery.test.tsx', 'src/App.tsx', 'src/lib/sessionService.ts',
      'src/lib/firestore.ts', 'src/lib/sessionSnapshotAuthority.ts', 'src/store/useSessionStore.ts', 'functions/src/memberSessionCallable.ts', SOURCE_PATH]
      .map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })) };
  const directory = join(process.cwd(), 'source-evidence', 'first-entry-source-correction-20261013', evidence.runLabel);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, context.task.name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 130) + '.json'),
    JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  stopWatch?.(); stopWatch = undefined;
  await startup?.close().catch(() => undefined);
  if (unmount) act(unmount); unmount = undefined;
  members.filter(call => !call.settled).forEach(call => call.pending.resolve({ data: {} }));
  presence?.resolve({ data: { sessionId } });
  for (const resume of resumes) resume.pending.resolve(await resume.reply);
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

describe('prospective accepted2/2 Wing first-entry recovery', () => {
  it('recovers the original2/2 Wing first-entry after an early positive member reply without retirement or another resume', async () => {
    await acceptedPrefix();
    let selection!: Promise<void>;
    await act(async () => { selection = service.selectConsoleRole(WING); }); await advance();
    check('real selection claims the original open Wing seat before presence', () => {
      assert.equal(counts('claimSeat'), 1); assert.ok(presence); assert.ok(claimSnapshot);
      assert.equal((group.memberShipIds as Record<string, string>)[actor.uid], 'aegis');
      const requests = sdk.call.mock.calls.map(([name]) => name);
      assert.ok(requests.indexOf('claimSeat') < requests.lastIndexOf('refreshPresence'));
    });
    await deliverSeats(); await deliverPlayer(claimSnapshot!);
    check('actual claimed-seat projection retains positive original2/2 before early member reply', () => {
      assert.equal(store.getState().me?.seatId, WING); assert.equal(store.getState().me?.activeConsoleRoleId, null);
      assert.equal(berthKind(store.getState().session), 'positive');
      assert.deepEqual([store.getState().me?.connectionGeneration, store.getState().identityHydrationRevision], [2, 2]);
    });
    const queued = members.filter(call => !call.settled).at(-1)!;
    assert.ok(queued); await deliverMember(queued);
    expectPending('early positive reply withdraws local privacy while original canonical ownership remains');
    const pending = await startup!.check();
    check('exact startup consumer remains pending instead of retiring validated original first-entry', () => {
      assert.equal(pending.fresh, false); assert.equal(counts('resumeSession'), 1);
      assert.equal(actor.connectionGeneration, 2);
      assert.equal((group.memberShipIds as Record<string, string>)[actor.uid], 'aegis');
    });
    record('startup.pending.original2-2');
    await deliverPlayer();
    expectPending('actual own console callback remains private until matching current reader accepts');
    await publishDiscovery();
    expectPending('private discovery cannot publish while the matching reader is pending');
    await assert.rejects(service.getAegisFighterWingLaunch('fighter-wing-alpha'), /Reconnect/);
    await assert.rejects(service.launchAegisFighterWing('fighter-wing-alpha', 0, 0, 0), /Reconnect/);
    check('pending valid private view/action intents issue no SDK operations', () => {
      assert.equal(counts('getAegisFighterWingLaunch'), 0); assert.equal(counts('launchAegisFighterWing'), 0);
      assert.equal(counts('resumeSession'), 1); assert.equal((pending as { fresh: boolean }).fresh, false);
    });
    act(() => window.dispatchEvent(new Event('online'))); await advance();
    check('ordinary reconnect notification does not supersede the source-owned first-entry wait', () => {
      assert.equal(counts('resumeSession'), 1); assert.equal(actor.connectionGeneration, 2);
    });
    presence!.resolve({ data: { sessionId } }); record('deliver.presence-ack');
    await act(async () => { await selection; }); await advance();
    expectPending('presence acknowledgement alone never restores authority or private data');
    await drainMembers(); await publishDiscovery();
    check('matching actual reader restores original2/2 live server authority and private discovery', () => {
      const state = store.getState();
      assert.deepEqual([state.me?.connectionGeneration, state.identityHydrationRevision], [2, 2]);
      assert.equal(state.me?.seatId, WING); assert.equal(state.me?.activeConsoleRoleId, WING);
      assert.equal(state.connection, 'live'); assert.equal(state.sessionSnapshotFreshness, 'server');
      assert.equal(state.session?.currentActorBerthAuthority?.shipId, 'aegis');
      assert.equal(state.session?.currentActorBerthAuthority?.activeConsoleRoleId, WING);
      assert.equal(authorityModule.memberSessionResumeBlocksFreshness(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid)), false);
      assert.ok(state.session?.playerDiscovery); assert.ok(state.session?.shipGalacticCoordinates);
      assert.equal(counts('resumeSession'), 1); assert.equal(sdk.signIn.mock.calls.length, 0);
    });
    check('local positive publication alone stays cache/private-withheld until the actual freshness callback', () => {
      assert.ok(trace.some(row => row.kind === 'store.publication' &&
        (row.state as Record<string, unknown>).active === WING && (row.state as Record<string, unknown>).berth === 'positive' &&
        (row.state as Record<string, unknown>).freshness === 'cache' && !(row.state as Record<string, unknown>).privateDiscovery));
    });
    assert.equal((await startup!.check()).fresh, true); record('startup.restored.current-original2-2');
  });

  it('keeps accepted first-entry ownership across a matching pre-activation reader until ordinary presence and player delivery', async () => {
    await acceptedPrefix(); holdPresenceCommit = true;
    let selection!: Promise<void>;
    await act(async () => { selection = service.selectConsoleRole(WING); }); await advance();
    await deliverSeats(); await deliverPlayer(claimSnapshot!); await drainMembers();
    check('real reader confirms claimed-seat pre-activation without completing target-console entry', () => {
      assert.equal(store.getState().me?.activeConsoleRoleId, null);
      assert.equal(store.getState().session?.currentActorBerthAuthority?.activeConsoleRoleId, null);
      assert.equal(store.getState().connection, 'live'); assert.equal(counts('resumeSession'), 1);
    });
    commitPresence!(); await deliverPlayer();
    expectPending('ordinary player activation still has its accepted CAS provenance after an intermediate positive read');
    assert.equal((await startup!.check()).fresh, false);
    presence!.resolve({ data: { sessionId } }); await act(async () => { await selection; });
    await drainMembers(); await publishDiscovery();
    check('actual activated reader restores current original2/2 without a second resume', () => {
      assert.deepEqual([store.getState().me?.connectionGeneration, store.getState().identityHydrationRevision], [2, 2]);
      assert.equal(store.getState().connection, 'live'); assert.equal(store.getState().sessionSnapshotFreshness, 'server');
      assert.ok(store.getState().session?.playerDiscovery); assert.equal(counts('resumeSession'), 1);
    });
    assert.equal((await startup!.check()).fresh, true); record('startup.restored.after-intermediate-positive-read');
  });

  it('clears actual first-entry provenance on reader-backed canonical null and rejects changed proof contexts', async () => {
    await acceptedPrefix();
    await act(async () => { void service.selectConsoleRole(WING); }); await advance();
    await deliverSeats(); await deliverPlayer(claimSnapshot!);
    await deliverMember(members.filter(call => !call.settled).at(-1)!);
    expectPending('real accepted first-entry proof exists before canonical null');
    const state = store.getState();
    const origin = state.currentActorBerthProjectionPending!;
    assert.equal(origin.kind, 'app-wing-first-entry-withheld');
    if (origin.kind !== 'app-wing-first-entry-withheld') throw new Error('The actual source must supply first-entry provenance.');
    const matches = authorityModule.wingFirstEntryMatches;
    assert.equal(matches(origin, state, actor.uid, performance.timeOrigin), true);
    const changes: Array<[string, Partial<Player>]> = [
      ['actor', { uid: 'foreign-source-actor' }], ['member session', { sessionId: 'foreign-session' }],
      ['group', { fleetGroupId: 'fleet-2' }], ['role', { role: 'gm' }], ['assigned role', { assignedRoleId: 'admiral' }],
      ['seat', { seatId: null }], ['console', { activeConsoleRoleId: 'admiral' }],
      ['lease', { connectionGeneration: 3 }], ['connected', { connected: false }],
      ['replacement', { replacementRoleId: 'admiral' }], ['replacement status', { replacementStatus: 'awaiting-re-role' }],
    ];
    check('first-entry proof rejects changed actor/session/group/role/seat/console/lease/connection/replacement', () => {
      for (const [field, change] of changes) {
        assert.equal(matches(origin, { ...state, me: { ...state.me!, ...change } }, actor.uid, performance.timeOrigin), false, field);
        record('proof.changed-context.rejected', { field });
      }
      assert.equal(matches(origin, state, 'foreign-source-actor', performance.timeOrigin), false);
      assert.equal(matches(origin, state, actor.uid, performance.timeOrigin + 1), false);
      assert.equal(matches(origin, { ...state, identityHydrationRevision: 3 }, actor.uid, performance.timeOrigin), false);
      assert.equal(matches(origin, { ...state, session: { ...state.session!, currentTurn: 1 } }, actor.uid, performance.timeOrigin), false);
      assert.equal(matches(origin, { ...state, session: { ...state.session!, memberSessionScope: { groupId: 'fleet-1', vesselIds: [], craftIds: [] } } }, actor.uid, performance.timeOrigin), false);
    });
    group = { ...group, memberShipIds: {} }; record('port.canonical-own-entry.removed.during-first-entry');
    await deliverPlayer(); await drainMembers();
    const failure = await startupFailure;
    check('canonical null cannot inherit the valid local first-entry proof or release private data', () => {
      assert.equal(berthKind(store.getState().session), 'null'); assert.equal(store.getState().currentActorBerthProjectionPending, null);
      assert.equal(authorityModule.pendingWingFirstEntry(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid),
        store.getState(), actor.uid, performance.timeOrigin), undefined);
      assert.equal(failure?.message, 'Original startup own berth authority retired.');
      assert.ok(trace.some(row => row.kind === 'deliver.current-member' && row.responseBerth === 'null'));
      assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
    });
  });

  it('keeps the original startup deadline while first-entry provenance remains pending', async () => {
    await acceptedPrefix();
    await act(async () => { void service.selectConsoleRole(WING); }); await advance();
    await deliverSeats(); await deliverPlayer(claimSnapshot!);
    await deliverMember(members.filter(call => !call.settled).at(-1)!);
    const current = store.getState(); const origin = current.currentActorBerthProjectionPending!;
    assert.equal(origin.kind, 'app-wing-first-entry-withheld');
    if (origin.kind !== 'app-wing-first-entry-withheld') throw new Error('The source must supply the pending proof.');
    const persisted = store.persist.getOptions().partialize!(current) as Record<string, unknown>;
    check('first-entry proof is absent from the actual persistence envelope', () => assert.equal(Object.hasOwn(persisted, 'currentActorBerthProjectionPending'), false));
    vi.setSystemTime(origin.deadlineAt);
    check('expired first-entry proof is not a pending owner', () => {
      assert.equal(authorityModule.wingFirstEntryMatches(origin, current, actor.uid, performance.timeOrigin), false);
      assert.equal(authorityModule.pendingWingFirstEntry(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid),
        current, actor.uid, performance.timeOrigin), undefined);
    });
    await assert.rejects(startup!.check(), /timed out|deadline/i); record('startup.original-deadline.terminal');
  });

  it('normal store reset removes a still-current first-entry proof and remains terminal', async () => {
    await acceptedPrefix();
    await act(async () => { void service.selectConsoleRole(WING); }); await advance();
    await deliverSeats(); await deliverPlayer(claimSnapshot!);
    await deliverMember(members.filter(call => !call.settled).at(-1)!);
    const current = store.getState();
    const authority = authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid);
    assert.ok(authorityModule.pendingWingFirstEntry(authority, current, actor.uid, performance.timeOrigin));
    // Clearing authority is a negative reset consumer check, never an accepted
    // identity/freshness fixture setter or a manufactured restoration.
    act(() => store.getState().reset()); record('negative.store-reset');
    check('normal reset clears pending provenance and accepted identity', () => {
      assert.equal(store.getState().currentActorBerthProjectionPending, null); assert.equal(store.getState().me, null);
      assert.equal(authorityModule.pendingWingFirstEntry(authority, current, actor.uid, performance.timeOrigin), undefined);
    });
    await assert.rejects(startup!.check(), /member authority retired/);
  });

  it('keeps reader-backed canonical own-map removal terminal after the same accepted2/2 prefix', async () => {
    await acceptedPrefix();
    group = { ...group, memberShipIds: {} }; record('port.canonical-own-entry.removed');
    await deliverPlayer(); await drainMembers();
    const failure = await startupFailure;
    check('actual atomic reader canonical null clears origin and retains missing-berth failure', () => {
      assert.equal(berthKind(store.getState().session), 'null'); assert.equal(store.getState().currentActorBerthProjectionPending, null);
      assert.equal(failure?.message, 'Original startup own berth authority retired.');
      assert.ok(trace.some(row => row.kind === 'deliver.current-member' && row.responseBerth === 'null'));
    });
    group = { ...group, memberShipIds: { [actor.uid]: 'aegis' } }; record('port.canonical-own-entry.restored');
    await deliverPlayer(); await drainMembers();
    await assert.rejects(startup!.check(), /Original startup own berth authority retired/);
    record('startup.canonical-null-floor.remains-terminal');
  });

  it('rejects wrong original Auth without replacing the accepted2/2 actor', async () => {
    await acceptedPrefix(); sdk.auth.currentUser = { uid: 'foreign-source-actor' }; record('transport.auth-changed');
    await assert.rejects(startup!.check(), /Auth authority or document retired/);
    check('no seat/presence action or replacement sign-in follows wrong Auth', () => {
      assert.equal(counts('claimSeat'), 0); assert.equal(sdk.signIn.mock.calls.length, 0);
    });
  });

  it('retains the terminal lease floor when another mock document resumes before the original normal resume', async () => {
    await acceptedPrefix();
    // A second document uses the same authenticated backing resume port; its
    // reply is not applied to this App or its SDK authority object.
    const otherDocument = sdk.call('resumeSession', { sessionId }); await advance();
    const remote = resumes.at(-1)!; remote.pending.resolve(await remote.reply); await otherDocument;
    record('deliver.other-document.normal-resume');
    check('other document lease3 does not manufacture original Store identity or freshness', () => {
      assert.equal(actor.connectionGeneration, 3);
      assert.deepEqual([store.getState().me?.connectionGeneration, store.getState().identityHydrationRevision], [2, 2]);
    });
    let original!: Promise<boolean>;
    await act(async () => { original = service.resumeSession(sessionId); }); await advance();
    const current = resumes.at(-1)!; current.pending.resolve(await current.reply);
    await act(async () => { await original; }); await advance();
    const failure = await startupFailure;
    check('actual accepted resume4/3 cannot cross startup original2/2 one-resume floor', () => {
      assert.deepEqual([store.getState().me?.connectionGeneration, store.getState().identityHydrationRevision], [4, 3]);
      assert.match(failure?.message ?? '', /navigation epoch left its one normal resume/);
      assert.equal(counts('claimSeat'), 0);
      const witness = (failure as Error & { firstP181AuthorityRejectedState?: unknown }).firstP181AuthorityRejectedState;
      record('startup.lease-floor.first-rejection', { witness: clone(witness) });
    });
  });
});
