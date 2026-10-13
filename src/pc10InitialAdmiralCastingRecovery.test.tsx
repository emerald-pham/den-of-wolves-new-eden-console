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
const TARGET = 'admiral';
const PEER_UID = 'retained-peer-wing-source-actor';
const VESSELS = ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
const ROLES = ['admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer',
  'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'];
const SOURCE_PATH = 'scripts/pc10-starlight-movement-scout-ui-proof.mjs';
const SOURCE_COMMIT = '01c42508e2eb4002698356e6fa8f18dbc9530fbe';
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}
function document(path: string, value: Record<string, unknown> | null) {
  return { id: path.split('/').at(-1), metadata: { fromCache: false }, exists: () => value !== null,
    data: () => value, get: (key: string) => value?.[key] };
}
interface Listener { path: string; active: boolean; next: (value: unknown) => void; }
type Reply = { data: { session: GameSession; player: Player } };
interface MemberCall { id: number; settled: boolean; reply: Promise<Record<string, unknown>>;
  pending: ReturnType<typeof deferred<{ data: Record<string, unknown> }>>; }
interface Casting { check: () => Promise<{ fresh: boolean }>; noteCastingResumeRequest: (value: Record<string, unknown>) => Promise<unknown>; close: () => Promise<unknown>; failed: Promise<never>; }
let serial = 0;
let sessionId: string;
let actor: Player;
let root: Record<string, unknown>;
let group: Record<string, unknown>;
let seat: Record<string, unknown>;
let listeners: Listener[];
let members: MemberCall[];
let resumes: { pending: ReturnType<typeof deferred<Reply>>; reply: Promise<Reply> }[];
let store: typeof Store;
let service: typeof Service;
let authorityModule: typeof Authority;
let readMember: () => Promise<Record<string, unknown>>;
let parseSession: (id: string, data: Record<string, unknown>) => GameSession;
let casting: Casting | undefined;
let resumeRequest: Record<string, unknown> | undefined;
let resumeNotice: Promise<unknown> | undefined;
let firstRejection: Record<string, unknown> | undefined;
let castingFailure: Promise<Error | null> | undefined;
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
  act(() => listener(`${rootPath()}/seats`).next({ docs: [document(`${rootPath()}/seats/${TARGET}`, clone(seat))],
    metadata: { fromCache: false } }));
  await advance();
}
async function deliverMember(call: MemberCall) {
  try {
    const data = await call.reply;
    const berth = data.currentActorBerthAuthority as Record<string, unknown> | null | undefined;
    record('deliver.current-member', { id: call.id, responseGeneration: data.connectionGeneration,
      responseAssigned: data.assignedRoleId, responseActive: data.activeConsoleRoleId,
      responseBerth: !Object.hasOwn(data, 'currentActorBerthAuthority') ? 'absent' : berth === null ? 'null' : 'positive',
      responseOwnAegis: berth?.shipId === 'aegis', responseActorMatches: data.actorUid === actor.uid });
    call.settled = true; call.pending.resolve({ data });
  } catch (error) {
    record('deliver.current-member-real-reader-denial', { id: call.id,
      code: (error as { code?: string }).code ?? null, message: (error as Error).message });
    call.settled = true; call.pending.reject(error);
  }
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
        [rootPath()]: clone(root), [playerPath()]: clone({ ...actor }), [`${rootPath()}/fleetGroups/fleet-1`]: clone(group),
      };
      record('reader.atomic-snapshot');
      return callback({ get: async (reference: ReturnType<typeof ref>) => {
        record('reader.get', { kind: reference.collection ? 'collection' : 'document',
          leaf: reference.path.split('/').slice(-2).join('/').replace(actor.uid, 'own-player') });
        return reference.collection ? { docs: Object.keys(values).filter(path => path.startsWith(`${reference.path}/`) &&
          !path.slice(reference.path.length + 1).includes('/')).map(path => document(path, values[path]!)) }
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
    assert.equal(sdk.auth.currentUser?.uid, actor.uid, 'Backing ports reject wrong authenticated actor.');
    if (name === 'joinSession') {
      assert.deepEqual(data, { joinCode: '123456' });
      assert.equal(actor.connected, false);
      actor = { ...actor, connected: true, connectionGeneration: 1 };
      group = { ...group, memberUids: [PEER_UID, actor.uid] };
      record('port.normal-join.committed-with-peer-map-retained');
      const reply = await dto();
      delete (reply.data.player as { connected?: boolean }).connected;
      return reply;
    }
    assert.equal(data.sessionId, sessionId);
    if (name === 'getCurrentMemberSession') {
      const call = { id: members.length, settled: false, reply: readMember(), pending: deferred<{ data: Record<string, unknown> }>() };
      // Keep a deliberately held real transaction failure handled until its
      // independent delivery reaches the mounted App's ordinary SDK error path.
      call.reply.catch(() => undefined);
      members.push(call); record('port.member.queued', { id: call.id }); return call.pending.promise;
    }
    if (name === 'resumeSession') {
      assert.equal(actor.connected, true); assert.equal(actor.assignedRoleId, TARGET);
      const state = store.getState();
      resumeRequest = { sessionId: String(data.sessionId), uidHash: createHash('sha256').update(sdk.auth.currentUser.uid).digest('hex').slice(0, 16),
        documentTimeOrigin: performance.timeOrigin, connectionGeneration: state.me?.connectionGeneration,
        identityHydrationRevision: state.identityHydrationRevision };
      assert.ok(casting, 'Original observer must own the actual ordinary request.');
      record('capture.actual-ordinary-resume', { generation: resumeRequest.connectionGeneration,
        hydration: resumeRequest.identityHydrationRevision,
        realMemberFencePending: authorityModule.memberSessionResumeBlocksFreshness(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid)) });
      resumeNotice = casting.noteCastingResumeRequest(resumeRequest);
      await resumeNotice;
      actor = { ...actor, connectionGeneration: (actor.connectionGeneration ?? 0) + 1 };
      const reply = dto().then(value => {
        delete (value.data.player as { connected?: boolean }).connected;
        return value;
      });
      const call = { pending: deferred<Reply>(), reply }; resumes.push(call);
      record('port.normal-resume.committed-dto-reply-held');
      return call.pending.promise;
    }
    if (name === 'refreshPresence') {
      assert.equal(data.activeConsoleRoleId, undefined);
      record('port.normal-presence.committed'); return { data: { sessionId } };
    }
    throw new Error(`Unimplemented inert transport ${name}`);
  });
  stopWatch = store.subscribe(() => {
    const state = JSON.stringify(summary());
    if (state !== lastStore) { lastStore = state; record('store.publication'); }
  });
}
function surfacePort(documentEpoch = { timeOrigin: performance.timeOrigin }) {
  const windowPort = {};
  return { storeModuleUrl: () => '/src/store/useSessionStore.ts',
    sessionAuthorityModuleUrl: () => '/src/lib/sessionSnapshotAuthority.ts',
    page: { evaluate: async (callback: (args: unknown) => unknown, args: unknown) => runInNewContext(
      '(' + String(callback).replace(/\bimport\s*\(/g, '__load(') + ')(__args)', {
        __args: args, __load: async (path: string) => {
          if (path === '/src/lib/firebase.ts') return { auth: () => ({ get currentUser() { return sdk.auth.currentUser; },
            onAuthStateChanged: () => () => undefined }) };
          if (path === '/src/lib/demoActorContext.ts') return import('@/lib/demoActorContext');
          if (path === '/src/store/useSessionStore.ts') return { useSessionStore: store };
          if (path === '/src/lib/sessionSnapshotAuthority.ts') return authorityModule;
          throw new Error(`Unexpected inert consumer module ${path}`);
        }, window: windowPort, performance: documentEpoch, Date, URL,
        setTimeout, clearTimeout, crypto: webcrypto, TextEncoder,
      }) } };
}
async function observeActualAdmission() {
  const source = readFileSync('scripts/pc10-full-game-demo-proof-helpers.mjs', 'utf8');
  const start = source.indexOf('export async function observeFullGameDemoPresentationMember(');
  const end = source.indexOf('\nexport async function waitForFullGameDemoPresentationActor(', start);
  assert.ok(start >= 0 && end > start);
  const observe = runInNewContext(source.slice(start, end).replace('export ', '') + '\nobserveFullGameDemoPresentationMember', { assert, URL }) as
    (surface: unknown, options: unknown) => Promise<Record<string, unknown>>;
  const value = await observe(surfacePort(), { knownRoleIds: ROLES });
  const adapter = readFileSync('scripts/qualification/pc11-normal-start-adapter.mjs', 'utf8');
  const body = adapter.slice(adapter.indexOf('function isNonblankString('), adapter.indexOf('/** Preserve the same Auth/session epoch;'));
  const ready = runInNewContext(body.replace(/export /g, '') + '\npc11MemberReadiness', { assert }) as
    (value: unknown, expected: unknown) => boolean;
  assert.equal(ready(value, { sessionId, uidHash: createHash('sha256').update(actor.uid).digest('hex').slice(0, 16),
    roleId: null, stage: 'casting', connectionGeneration: 1, identityHydrationRevision: 1 }), true);
  assert.equal(value.sdkResumePending, false);
  record('admission.actual-ui-consumer-validated', { berthPresent: value.currentMemberBerthPresent,
    berthNull: value.currentMemberBerthNull, berthMatches: value.currentMemberBerthMatches,
    generation: value.connectionGeneration, hydration: value.identityHydrationRevision,
    sdkServer: value.sdkHasServerAuthority, sdkResumePending: value.sdkResumePending });
  return value;
}
function admissionExpected(admission: Record<string, unknown>) {
  return { sessionId, uidHash: admission.uidHash, fleetGroupId: admission.fleetGroupId,
    connectionGeneration: admission.connectionGeneration, identityHydrationRevision: admission.identityHydrationRevision,
    documentTimeOrigin: admission.documentTimeOrigin };
}
async function retainActualCasting(admission: Record<string, unknown>, options: {
  documentEpoch?: { timeOrigin: number }; expected?: ReturnType<typeof admissionExpected>;
} = {}) {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const start = source.indexOf('export async function retainP181MemberAuthority(');
  const end = source.indexOf('\nexport async function observeP181StarlightSource(', start);
  assert.ok(start >= 0 && end > start);
  const retain = runInNewContext(source.slice(start, end).replace('export ', '') + '\nretainP181MemberAuthority', {
    assert, p181MemberObservationOrdinal: 0, retainP181CallerRejection: (error: unknown) => error,
    rememberProofFailure: () => undefined,
  }) as (surface: unknown, deadline: number, options: unknown) => Promise<Casting>;
  try {
    casting = await retain(surfacePort(options.documentEpoch), Date.now() + 15_000, { mode: 'casting-assignment', proofProfile: 'wing-bays',
      castingRoleId: TARGET, castingAdmission: admission,
      expected: options.expected ?? admissionExpected(admission) });
    castingFailure = casting.failed.then(() => null, failure => failure);
  } catch (error) {
    firstRejection = (error as { firstP181AuthorityRejectedState?: Record<string, unknown> }).firstP181AuthorityRejectedState;
    record('retainer.first-rejection', { message: (error as Error).message, firstP181AuthorityRejectedState: firstRejection ?? null });
    throw error;
  }
}
async function acceptedNullAdmission(expectedBerth: 'null' | 'positive' = 'null') {
  await installPorts();
  const { default: App } = await import('./App'); unmount = render(<App />).unmount;
  await advance();
  await act(async () => { await service.joinSession('123456'); }); await advance();
  await deliverPlayer(); await drainMembers(); await deliverSeats();
  check('normal1/1 Admiral admission is source-reader present-null with the peer map retained', () => {
    const state = store.getState();
    assert.deepEqual([state.me?.connectionGeneration, state.identityHydrationRevision], [1, 1]);
    assert.equal(state.me?.role, 'player'); assert.equal(state.me?.assignedRoleId, null);
    assert.equal(state.me?.activeConsoleRoleId, null); assert.equal(state.me?.seatId, null); assert.equal(state.me?.connected, true);
    assert.equal(state.connection, 'live'); assert.equal(state.sessionSnapshotFreshness, 'server');
    assert.equal(berthKind(state.session), expectedBerth); assert.equal(state.currentActorBerthProjectionPending, null);
    assert.equal((group.memberShipIds as Record<string, string>)[PEER_UID], 'aegis');
    assert.equal((group.memberShipIds as Record<string, string>)[actor.uid] === 'aegis', expectedBerth === 'positive');
    assert.equal(counts('resumeSession'), 0);
    assert.equal(Boolean(state.session?.playerDiscovery), false);
  });
  return observeActualAdmission();
}
async function commitSupportedAssignment() {
  check('server-side facilitator port uses the real configured assignment decision', () => {
    assert.equal(actor.connected, true); assert.equal(actor.role, 'player');
    assert.equal(root.phase, 'casting'); assert.equal(root.currentTurn, 0); assert.equal(root.setupConfirmed, true);
    assert.deepEqual(roleAssignmentDecision([{ uid: PEER_UID, assignedRoleId: 'wing-commander' }], actor.uid, TARGET, ROLES), { allowed: true });
  });
  actor = { ...actor, assignedRoleId: TARGET, activeConsoleRoleId: null, seatId: null };
  group = { ...group, memberShipIds: { ...(group.memberShipIds as Record<string, string>), [actor.uid]: 'aegis' } };
  root = { ...root, setupRevision: Number(root.setupRevision) + 1, updatedAt: new Date(Date.now() + 1).toISOString() };
  record('port.facilitator-assign-admiral.committed');
  await deliverPlayer();
}
async function observeTerminal(expression: RegExp) {
  assert.ok(casting);
  try { await casting.check(); assert.fail('The original casting consumer must reject this real negative delivery.'); }
  catch (error) {
    assert.match((error as Error).message, expression);
    firstRejection = (error as { firstP181AuthorityRejectedState?: Record<string, unknown> }).firstP181AuthorityRejectedState;
    record('retainer.terminal-negative', { message: (error as Error).message,
      firstP181AuthorityRejectedState: firstRejection ?? null });
  }
}
async function establishedOriginalPositive() {
  const admission = await acceptedNullAdmission();
  await retainActualCasting(admission); assert.equal((await casting!.check()).fresh, false);
  await commitSupportedAssignment(); assert.equal((await casting!.check()).fresh, false);
  act(() => window.dispatchEvent(new Event('online'))); await advance(300);
  assert.ok(resumeNotice); await resumeNotice;
  assert.equal(resumes.length, 1); assert.equal(counts('resumeSession'), 1);
  assert.deepEqual([resumeRequest?.connectionGeneration, resumeRequest?.identityHydrationRevision], [1, 1]);
  resumes[0]!.pending.resolve(await resumes[0]!.reply); await advance(); await deliverPlayer();
  assert.equal((await casting!.check()).fresh, false); await drainMembers();
  assert.deepEqual([store.getState().me?.connectionGeneration, store.getState().identityHydrationRevision], [2, 2]);
  assert.equal(berthKind(store.getState().session), 'positive'); assert.equal((await casting!.check()).fresh, true);
  record('negative-control.prefix-real-positive2-2');
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime('2026-10-13T22:20:00.000Z'); localStorage.clear();
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  (await import('@/lib/sessionWaiver')).acknowledgeSessionWaiver();
  window.history.replaceState({}, '', '/#/console'); sessionId = `initial-admiral-${++serial}`;
  root = { name: 'Initial Admiral coupled source fixture', joinCode: '123456', phase: 'casting', currentTurn: 0,
    playerCount: 8, chartId: 'A', setupConfirmed: true, setupRevision: 1, activeRoleIds: ROLES,
    activeVesselIds: VESSELS, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  actor = { uid: 'original-initial-admiral-source-actor', sessionId, displayName: 'Original Admiral fixture actor', role: 'player',
    connected: false, connectionGeneration: 1, fleetGroupId: 'fleet-1', assignedRoleId: null,
    activeConsoleRoleId: null, seatId: null, replacementRoleId: null, replacementStatus: null,
    joinedAt: new Date().toISOString() };
  group = { id: 'fleet-1', memberUids: [PEER_UID], vesselIds: VESSELS, memberShipIds: { [PEER_UID]: 'aegis' } };
  seat = { roleId: TARGET, status: 'open', holderUid: null, factionId: 'aegis', claimedAt: null };
  listeners = []; members = []; resumes = []; trace = []; assertions = []; lastStore = '';
  casting = undefined; castingFailure = undefined; resumeRequest = undefined; resumeNotice = undefined; firstRejection = undefined;
  sdk.auth.currentUser = { uid: actor.uid }; sdk.auth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset();
  sdk.signIn.mockReset().mockRejectedValue(new Error('Original mock Auth transport cannot be replaced.'));
});
afterEach(async context => {
  const label = process.env.PC10_ADMIRAL_FIXTURE_RUN_LABEL ?? 'unlabeled';
  const directory = join(process.cwd(), 'source-evidence', 'initial-admiral-null-correction-20261013', label);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const evidence = { schemaVersion: 1, test: context.task.name, runLabel: label, sourceBaseCommit: SOURCE_COMMIT,
    sourceBaseTree: 'b4035297b0938ccacb3f5e2eeb7a8668c4d933d1', runtime: process.version,
    fixtureManufacturesAcceptedAuthorityOrFreshness: false, assertions, trace,
    requests: sdk.call.mock.calls.map(([endpoint]) => endpoint), firstRejection: firstRejection ?? null,
    sourceHashes: ['src/pc10InitialAdmiralCastingRecovery.test.tsx', SOURCE_PATH,
      'scripts/pc10-full-game-demo-proof-helpers.mjs', 'scripts/qualification/pc11-normal-start-adapter.mjs',
      'src/App.tsx', 'src/lib/sessionService.ts', 'src/lib/firestore.ts', 'src/lib/sessionSnapshotAuthority.ts',
      'src/store/useSessionStore.ts', 'functions/src/memberSessionCallable.ts'].map(path => ({ path,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })),
    limits: ['Actual mounted App/service/reader/parser/Store and exact retainer/presentation consumers; SDK/Auth/ownership ports are mocks.',
      'No native browser/Auth/server writer/network/gameplay/history attribution or acceptance.'] };
  writeFileSync(join(directory, context.task.name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 130) + '.json'),
    JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  stopWatch?.(); stopWatch = undefined;
  await casting?.close().catch(() => undefined);
  if (unmount) act(unmount); unmount = undefined;
  members.filter(call => !call.settled).forEach(call => call.pending.resolve({ data: {} }));
  for (const call of resumes) call.pending.resolve(await call.reply);
  await act(async () => { await Promise.resolve(); }); vi.useRealTimers();
});
describe('prospective normal initial Admiral admission and casting', () => {
  it('keeps established reader-backed canonical loss terminal even if a later positive reply returns', async () => {
    await establishedOriginalPositive();
    group = { ...group, memberShipIds: { [PEER_UID]: 'aegis' } };
    root = { ...root, updatedAt: new Date(Date.now() + 1).toISOString() };
    record('negative.established-own-map-removal'); await deliverPlayer(); await drainMembers();
    assert.equal(berthKind(store.getState().session), 'null');
    assert.equal(store.getState().currentActorBerthProjectionPending, null);
    await observeTerminal(/casting member berth was explicitly retired/);
    group = { ...group, memberShipIds: { [PEER_UID]: 'aegis', [actor.uid]: 'aegis' } };
    root = { ...root, updatedAt: new Date(Date.now() + 1).toISOString() };
    record('negative.later-positive-map-restoration-does-not-reset-retainer');
    await deliverPlayer(); await drainMembers(); assert.equal(berthKind(store.getState().session), 'positive');
    await observeTerminal(/casting member berth was explicitly retired/);
    check('canonical positive restoration cannot erase the already retained original failure', () => {
      assert.equal(counts('resumeSession'), 1); assert.equal((group.memberShipIds as Record<string, string>)[PEER_UID], 'aegis');
    });
  });
  it('rejects altered admission provenance against the actual original actor document session group and epochs', async () => {
    const admission = await acceptedNullAdmission(); const expected = admissionExpected(admission);
    const alterations = [
      { uidHash: 'foreign-source-actor-fingerprint' }, { documentTimeOrigin: Number(admission.documentTimeOrigin) + 1 },
      { sessionId: 'foreign-source-session' }, { fleetGroupId: 'foreign-source-group' },
      { connectionGeneration: 2 }, { identityHydrationRevision: 2 },
    ];
    for (const alteration of alterations) {
      record('negative.altered-carried-provenance', { fields: Object.keys(alteration) });
      await assert.rejects(retainActualCasting({ ...admission, ...alteration }, { expected }), /casting admission provenance changed/);
    }
    assert.equal(counts('resumeSession'), 0); assert.equal(berthKind(store.getState().session), 'null');
  });
  it.each(['Auth', 'document'] as const)('keeps an actual %s change terminal while original null waits', async kind => {
    const admission = await acceptedNullAdmission(); const documentEpoch = { timeOrigin: performance.timeOrigin };
    await retainActualCasting(admission, { documentEpoch }); assert.equal((await casting!.check()).fresh, false);
    if (kind === 'Auth') sdk.auth.currentUser = { uid: 'foreign-auth-source-actor' };
    else documentEpoch.timeOrigin += 1;
    record('negative.actual-owned-surface-binding-change', { binding: kind });
    await observeTerminal(kind === 'Auth' ? /Auth authority or document retired/ : /documentTimeOrigin changed/);
    if (kind === 'Auth') sdk.auth.currentUser = { uid: actor.uid };
    else documentEpoch.timeOrigin -= 1;
    await observeTerminal(kind === 'Auth' ? /Auth authority or document retired/ : /documentTimeOrigin changed/);
    assert.equal(counts('resumeSession'), 0);
  });
  it.each(['scope', 'group', 'role', 'disconnected', 'kicked', 'replacement', 'lease'] as const)
  ('keeps a real %s source change terminal throughout initial-null pending', async kind => {
    const admission = await acceptedNullAdmission(); await retainActualCasting(admission);
    assert.equal((await casting!.check()).fresh, false);
    if (kind === 'scope') group = { ...group, vesselIds: ['aegis', 'icebreaker', 'shepherd', 'dione', 'refinery-124'] };
    if (kind === 'group') actor = { ...actor, fleetGroupId: 'foreign-fleet' };
    if (kind === 'role') actor = { ...actor, assignedRoleId: 'wing-commander' };
    if (kind === 'disconnected') actor = { ...actor, connected: false };
    if (kind === 'kicked') actor = { ...actor, kickedAt: new Date().toISOString() };
    if (kind === 'replacement') actor = { ...actor, replacementRoleId: 'admiral' };
    if (kind === 'lease') actor = { ...actor, connectionGeneration: 3 };
    root = { ...root, updatedAt: new Date(Date.now() + 1).toISOString() };
    record('negative.real-source-delivery', { changed: kind }); await deliverPlayer(); await drainMembers();
    await observeTerminal(/Original (?:expected )?P181 (?:member|casting|connected|fleetGroupId)/);
    check('initial-null permission does not release private data or create a replacement resume', () => {
      assert.equal(counts('resumeSession'), 0); assert.equal(store.getState().currentActorBerthProjectionPending, null);
      assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
      assert.equal((group.memberShipIds as Record<string, string>)[PEER_UID], 'aegis');
    });
  });
  it('rejects a second ordinary resume without advancing the original plus-one canonical lease', async () => {
    await establishedOriginalPositive();
    record('negative.actual-second-service-resume');
    await assert.rejects(service.resumeSession(sessionId), /casting resume request changed its member baseline/);
    assert.equal(counts('resumeSession'), 2); assert.equal(resumes.length, 1); assert.equal(actor.connectionGeneration, 2);
    await observeTerminal(/casting SDK resume fence reopened|casting resume request changed its member baseline/);
  });
  it('cannot extend the original deadline while the validated initial null waits', async () => {
    const admission = await acceptedNullAdmission(); await retainActualCasting(admission);
    assert.equal((await casting!.check()).fresh, false); await advance(15_100);
    await observeTerminal(/retained authority deadline expired/);
    assert.equal(counts('resumeSession'), 0); assert.equal(berthKind(store.getState().session), 'null');
  });
  it('keeps positive admission loss before observer arming terminal without a missing-pin exemption', async () => {
    // A legitimate previously mapped, currently disconnected legacy member has
    // no stored generation. Normal admission hydrates its real reader witness;
    // no Store/SDK authority or freshness is fixture-set.
    delete actor.connectionGeneration;
    group = { ...group, memberUids: [PEER_UID, actor.uid], memberShipIds: { [PEER_UID]: 'aegis', [actor.uid]: 'aegis' } };
    const admission = await acceptedNullAdmission('positive');
    assert.equal(admission.currentMemberBerthPresent, true); assert.equal(admission.currentMemberBerthNull, false);
    assert.equal(admission.currentMemberBerthMatches, true); record('admission.positive-before-observer-arm');
    group = { ...group, memberShipIds: { [PEER_UID]: 'aegis' } };
    root = { ...root, updatedAt: new Date(Date.now() + 1).toISOString() };
    record('negative.canonical-own-map-removal-before-arm');
    await deliverPlayer(); await drainMembers();
    assert.equal(berthKind(store.getState().session), 'null');
    assert.equal(store.getState().currentActorBerthProjectionPending, null);
    await assert.rejects(retainActualCasting(admission), /casting member berth was explicitly retired/);
    check('a saved positive admission remains terminal even though this observer never pinned it', () => {
      assert.equal(counts('resumeSession'), 0); assert.equal((group.memberShipIds as Record<string, string>)[PEER_UID], 'aegis');
      assert.equal(firstRejection?.firstPinContext, null);
    });
  });
  it('retains validated original1/1 present-null admission and reaches actual positive2/2 through one captured normal resume', async () => {
    const admission = await acceptedNullAdmission();
    await retainActualCasting(admission);
    check('initial null admission remains nonready without retirement or invented local origin', () => {
      assert.ok(casting); assert.equal(store.getState().currentActorBerthProjectionPending, null);
    });
    assert.equal((await casting!.check()).fresh, false); record('retainer.pending.original-null1-1');
    await publishDiscovery();
    assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
    await commitSupportedAssignment();
    assert.equal((await casting!.check()).fresh, false); record('retainer.pending.assigned-before-normal-resume');
    act(() => window.dispatchEvent(new Event('online'))); await advance(300);
    assert.ok(resumeNotice); await resumeNotice;
    check('actual original request owns one resume and preserves peer canonical membership', () => {
      assert.equal(resumes.length, 1); assert.equal(counts('resumeSession'), 1);
      assert.deepEqual([resumeRequest?.connectionGeneration, resumeRequest?.identityHydrationRevision], [1, 1]);
      assert.equal((group.memberShipIds as Record<string, string>)[PEER_UID], 'aegis');
      assert.equal((group.memberShipIds as Record<string, string>)[actor.uid], 'aegis');
    });
    resumes[0]!.pending.resolve(await resumes[0]!.reply); record('deliver.original-resume-dto-without-connected-or-berth');
    await advance();
    assert.equal((await casting!.check()).fresh, false);
    await deliverPlayer();
    assert.equal((await casting!.check()).fresh, false); record('retainer.pending.own-player-before-positive-member');
    await drainMembers();
    check('actual matching member reader and SDK restore assigned unseated original2/2 without extra resume', () => {
      const state = store.getState();
      assert.deepEqual([state.me?.connectionGeneration, state.identityHydrationRevision], [2, 2]);
      assert.equal(state.me?.assignedRoleId, TARGET); assert.equal(state.me?.activeConsoleRoleId, null); assert.equal(state.me?.seatId, null);
      assert.equal(state.connection, 'live'); assert.equal(state.sessionSnapshotFreshness, 'server');
      assert.equal(state.session?.currentActorBerthAuthority?.actorUid, actor.uid);
      assert.equal(state.session?.currentActorBerthAuthority?.shipId, 'aegis');
      assert.equal(state.session?.currentActorBerthAuthority?.connectionGeneration, 2);
      assert.equal(authorityModule.memberSessionResumeBlocksFreshness(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid)), false);
      assert.equal(counts('joinSession'), 1); assert.equal(counts('resumeSession'), 1); assert.equal(sdk.signIn.mock.calls.length, 0);
    });
    assert.equal((await casting!.check()).fresh, true); record('retainer.restored.actual-positive2-2');
    assert.equal(await Promise.race([castingFailure!, Promise.resolve(null)]), null);
  });
});
