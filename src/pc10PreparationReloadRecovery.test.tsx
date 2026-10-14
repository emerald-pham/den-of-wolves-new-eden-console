import { act, render, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { TextEncoder } from 'node:util';
import { EventEmitter } from 'node:events';
// This source-only .mjs consumer has no declaration; bind its complete page port below.
// @ts-expect-error TS7016: the exact existing JavaScript module has no declaration file.
import { createMemberNavigationResumeObserver as createMemberNavigationResumeObserverJs } from '../scripts/pc10-member-navigation-resume.mjs';

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
vi.mock('@/components/AegisConsoleWorkspace', () => ({ default: () => <main>Admiral station</main> }));


// One focused source coupling, not a native runner. Only SDK I/O and unrelated
// visual leaves are inert. Store authority/freshness is never fixture-set.
const TARGET = 'admiral';
const PEER_UID = 'retained-peer-wing-source-actor';
const VESSELS = ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
const ROLES = ['admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer',
  'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'];
const SOURCE_PATH = 'scripts/pc10-starlight-movement-scout-ui-proof.mjs';
const SOURCE_COMMIT = 'f141da68e45a9f52c9330c8b8baa544823f5c695';
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
interface Listener { path: string; active: boolean; next: (value: unknown) => void; error?: (cause: unknown) => void; }
type Reply = { data: { session: GameSession; player: Player } };
interface MemberCall { id: number; settled: boolean; reply: Promise<Record<string, unknown>>;
  pending: ReturnType<typeof deferred<{ data: Record<string, unknown> }>>; }
interface Casting { pin: (value: unknown) => Promise<unknown>; check: () => Promise<{ fresh: boolean }>; noteCastingResumeRequest: (value: Record<string, unknown>) => Promise<unknown>; close: () => Promise<unknown>; failed: Promise<never>; }
interface MemberNavigationObserver {
  path: string;
  resumeRequestCount(): number;
  sample(current: Record<string, unknown>): void;
  bind(current: Record<string, unknown>): void;
  prepare(current: Record<string, unknown>): Promise<void>;
  accept(original: Record<string, unknown>, current: Record<string, unknown>,
    readAcceptedCurrent: () => Promise<Record<string, unknown>>, assignment: Record<string, unknown>):
    Promise<Record<string, unknown> | false>;
  finish(error?: unknown): Promise<void>;
}
// The real export is used unchanged. A complete on/off/url port guarantees the
// helper's observer-return branch; this is a local type contract, not a wrapper.
const createMemberNavigationResumeObserver = createMemberNavigationResumeObserverJs as (
  page: Pick<ReturnType<typeof surfacePort>['page'], 'on' | 'off' | 'url'>,
  options: { directory: string; roleId: string; deadlineAt: number;
    transition: 'casting-assignment'; proofProfile: 'wing-bays'; memberContract: 'pc11-live-base';
    expectedGmUidHash: string; expectedGmInstanceId: string }
) => MemberNavigationObserver;
let pageEvents: EventEmitter;
let documentEpoch: number;
let pageWindow: Record<string, unknown>;
let serial = 0;
let sessionId: string;
let actor: Player & { kickedAt?: string };
let root: Record<string, unknown>;
let group: Record<string, unknown>;
let seat: Record<string, unknown>;
let listeners: Listener[];
let members: MemberCall[];
let resumes: { pending: ReturnType<typeof deferred<Reply>>; reply: Promise<Reply> }[];
let heldPresence: ReturnType<typeof deferred<{ data: { sessionId: string } }>> | undefined;
let store: typeof Store;
let service: typeof Service;
let authorityModule: typeof Authority;
let readMember: () => Promise<Record<string, unknown>>;
let parseSession: (id: string, data: Record<string, unknown>) => GameSession;
let casting: Casting | undefined;
let firstRejection: Record<string, unknown> | undefined;
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

async function dto(): Promise<Reply> {
  const response = await readMember();
  return { data: { session: parseSession(sessionId, response.session as Record<string, unknown>), player: clone(actor) } };
}
async function installPorts() {
  ({ useSessionStore: store } = await import('@/store/useSessionStore'));
  ({ sessionFrom: parseSession } = await import('@/lib/firestore'));
  service = await import('@/lib/sessionService');
  authorityModule = await import('@/lib/sessionSnapshotAuthority');
  // Record actual lifecycle calls without substituting their result or state.
  const beginEntry = authorityModule.beginAdmiralFirstEntry;
  vi.spyOn(authorityModule, 'beginAdmiralFirstEntry').mockImplementation((...args) => {
    const entry = beginEntry(...args), before = args[1], current = args[2];
    record('actual.admiral-first-entry.begin', { created: Boolean(entry),
      beforeConsoleFieldPresent: Object.hasOwn(before.me ?? {}, 'activeConsoleRoleId'),
      beforeConsoleExactlyNull: before.me?.activeConsoleRoleId === null,
      beforeSeatNullish: before.me?.seatId == null,
      beforeFreshness: before.sessionSnapshotFreshness, currentFreshness: current.sessionSnapshotFreshness,
      beforeConnection: before.connection, currentConnection: current.connection,
      beforeSetupRevision: before.session?.setupRevision, currentSetupRevision: current.session?.setupRevision,
      receiptRevision: args[5].setupRevision,
      currentBerthSame: JSON.stringify(before.session?.currentActorBerthAuthority) === JSON.stringify(current.session?.currentActorBerthAuthority) });
    return entry;
  });
  const finishEntry = authorityModule.finishAdmiralFirstEntry;
  vi.spyOn(authorityModule, 'finishAdmiralFirstEntry').mockImplementation((...args) => {
    finishEntry(...args); record('actual.admiral-first-entry.finish', { explicitEntry: Boolean(args[1]) });
  });
  const awaitReader = authorityModule.awaitAdmiralFirstEntryReader;
  vi.spyOn(authorityModule, 'awaitAdmiralFirstEntryReader').mockImplementation((...args) => {
    const entry = awaitReader(...args);
    record('actual.admiral-first-entry.reader-wait', { retained: Boolean(entry),
      sourceBerth: berthKind(args[1].session), publicMarkerPresent: args[1].currentActorBerthProjectionPending != null });
    return entry;
  });
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
  sdk.listen.mockImplementation((reference, _options, next, error) => {
    const value = { path: reference.path, next, active: true,
      ...(typeof error === 'function' ? { error } : {}) }; listeners.push(value);
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
      const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5051/demo-source/us-central1/resumeSession',
        postDataJSON: () => ({ data }) };
      pageEvents.emit('request', request);
      record('capture.real-bootstrap-resume', { localHydration: store.getState().identityHydrationRevision,
        realFencePending: authorityModule.memberSessionResumeBlocksFreshness(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid)) });
      // This backing write belongs only to normal resume reconciliation, matching
      // the actual writer's ensureInitialFleetGroup/reconcileSessionFleetMember.
      group = { ...group, memberShipIds: { ...(group.memberShipIds as Record<string, string>), [actor.uid]: 'aegis' } };
      actor = { ...actor, connectionGeneration: (actor.connectionGeneration ?? 0) + 1 };
      const reply = dto().then(value => { delete (value.data.player as { connected?: boolean }).connected; return value; });
      const call = { pending: deferred<Reply>(), reply }; resumes.push(call);
      const delivered = await call.pending.promise;
      pageEvents.emit('response', { request: () => request, url: request.url, status: () => 200,
        json: async () => ({ result: delivered.data }) });
      return delivered;
    }
    if (name === 'claimSeat') {
      assert.equal(data.seatId, TARGET); assert.equal(data.expectedSetupRevision, root.setupRevision);
      assert.equal(actor.assignedRoleId, TARGET); assert.equal(actor.seatId, null);
      assert.equal(seat.status, 'open'); assert.equal(seat.holderUid, null);
      seat = { ...seat, status: 'claimed', holderUid: actor.uid }; actor = { ...actor, seatId: TARGET };
      root = { ...root, setupRevision: Number(root.setupRevision) + 1, updatedAt: new Date(Date.now() + 1).toISOString() };
      record('port.real-shaped-claim-cas');
      return { data: { status: 'committed', requestId: data.requestId, setupRevision: root.setupRevision, seatId: TARGET, holderUid: actor.uid } };
    }
    if (name === 'refreshPresence') {
      if (data.activeConsoleRoleId !== undefined) {
        assert.equal(data.activeConsoleRoleId, TARGET); assert.equal(seat.holderUid, actor.uid);
        assert.equal(actor.seatId, TARGET); actor = { ...actor, activeConsoleRoleId: TARGET };
      }
      record('port.normal-presence.committed');
      return data.activeConsoleRoleId !== undefined && heldPresence ? heldPresence.promise : { data: { sessionId } };
    }
    throw new Error(`Unimplemented inert transport ${name}`);
  });
  stopWatch = store.subscribe(() => {
    const state = JSON.stringify(summary());
    if (state !== lastStore) { lastStore = state; record('store.publication'); }
  });
}
function surfacePort() {
  return { storeModuleUrl: () => '/src/store/useSessionStore.ts',
    sessionAuthorityModuleUrl: () => '/src/lib/sessionSnapshotAuthority.ts',
    page: { on: (name: string, cb: (...args: unknown[]) => void) => pageEvents.on(name, cb),
      off: (name: string, cb: (...args: unknown[]) => void) => pageEvents.off(name, cb),
      url: () => 'http://127.0.0.1:5178/#/console', reload: reloadActualApp, evaluate: async (callback: (args: unknown) => unknown, args: unknown) => runInNewContext(
      '(' + String(callback).replace(/\bimport\s*\(/g, '__load(') + ')(__args)', {
        __args: args, __load: async (path: string) => {
          if (path === '/src/lib/firebase.ts') return { auth: () => ({ get currentUser() { return sdk.auth.currentUser; },
            authStateReady: () => sdk.auth.authStateReady(),
            onAuthStateChanged: () => () => undefined }) };
          if (path === '/src/lib/demoActorContext.ts') return import('@/lib/demoActorContext');
          if (path === '/src/store/useSessionStore.ts') return { useSessionStore: store };
          if (path === '/src/lib/sessionSnapshotAuthority.ts') return authorityModule;
          throw new Error(`Unexpected inert consumer module ${path}`);
        }, window: pageWindow, performance: { get timeOrigin() { return documentEpoch; } }, Date, URL,
        setTimeout, clearTimeout, crypto: webcrypto, TextEncoder,
      }) } };
}
async function readActualMember() {
  const source = readFileSync('scripts/pc10-full-game-demo-proof-helpers.mjs', 'utf8');
  const start = source.indexOf('export async function observeFullGameDemoPresentationMember(');
  const end = source.indexOf('\nexport async function waitForFullGameDemoPresentationActor(', start);
  assert.ok(start >= 0 && end > start);
  const observe = runInNewContext(source.slice(start, end).replace('export ', '') + '\nobserveFullGameDemoPresentationMember', { assert, URL }) as
    (surface: unknown, options: unknown) => Promise<Record<string, unknown>>;
  const value = await observe(surfacePort(), { knownRoleIds: ROLES });
  return value;
}
async function observeActualAdmission() {
  const value = await readActualMember();
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
function actualRetainer() {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const start = source.indexOf('export async function retainP181MemberAuthority('), end = source.indexOf('\nexport async function observeP181StarlightSource(', start);
  return runInNewContext(source.slice(start,end).replace('export ', '') + '\nretainP181MemberAuthority', {
    assert, p181MemberObservationOrdinal: 0, retainP181CallerRejection: (error: unknown) => error, rememberProofFailure: () => undefined,
  });
}
function recoverP181AdmiralPreparation(options: Record<string, unknown>):
  Promise<{ accepted: Record<string, unknown>; authority: Casting }> {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const remainingStart = source.indexOf('function p181Remaining('), workEnd = source.indexOf('\n/** The original parent', remainingStart);
  const recoverStart = source.indexOf('export async function recoverP181AdmiralPreparation('), recoverEnd = source.indexOf('\nfunction requireActor(',recoverStart);
  const adapter = readFileSync('scripts/qualification/pc11-normal-start-adapter.mjs', 'utf8');
  const adapterBody = adapter.slice(adapter.indexOf('function isNonblankString('), adapter.indexOf('/** Preserve the same Auth/session epoch;'));
  return runInNewContext(adapterBody.replace(/export /g,'') + '\n' + source.slice(remainingStart,workEnd) + '\n' +
    source.slice(recoverStart,recoverEnd).replace('export ', '') + '\nrecoverP181AdmiralPreparation(__options)', {
      assert, Date, setTimeout, clearTimeout, createMemberNavigationResumeObserver, retainP181MemberAuthority: actualRetainer(),
      rememberProofFailure: () => undefined, delay: advance, __options: options,
    });
}
async function captureActualRenderedPublicUi() {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const start = source.indexOf('export async function captureP181PreparationPublicUi(');
  const end = source.indexOf('\n/** One intentional new document', start);
  const workStart = source.indexOf('function p181Remaining(');
  const workEnd = source.indexOf('\n/** The original parent', workStart);
  const geometry = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(
    [new DOMRect(0,0,20,20)] as unknown as DOMRectList);
  try {
    const publicSurface = { page: {
      evaluate: async (callback: (value: unknown) => unknown, args: unknown) => runInNewContext('(' + String(callback) + ')(__args)', {
        __args: args, document: globalThis.document, MutationObserver, Date,
        getComputedStyle: (node: Element) => {
          const actual = getComputedStyle(node);
          return { visibility: actual.visibility, backgroundImage: actual.backgroundImage || 'none' };
        },
      }),
      screenshot: async () => {
        assert.equal(getComputedStyle(globalThis.document.querySelector('input')!).visibility, 'hidden');
        return Buffer.from('inert screenshot byte port for actual mounted public markup');
      },
    } };
    const captured = await runInNewContext(source.slice(workStart,workEnd) + '\n' + source.slice(start,end).replace('export ', '') +
      '\ncaptureP181PreparationPublicUi(__surface,Date.now()+1000,Date.now()+2000)', {
        assert, Date, setTimeout, clearTimeout, __surface: publicSurface, rememberProofFailure: () => undefined,
      });
    check('actual mounted adjacent Admiral spans survive only the public capture allowlist', () => {
      assert.ok(captured.publicDom.some((row: { kind: string; text: string }) => row.kind === 'station' && row.text === 'Admiral OPEN'));
      assert.ok(captured.publicDom.some((row: { kind: string; text: string }) => row.kind === 'heading' && row.text === 'Stations and consoles'));
      assert.equal(globalThis.document.querySelectorAll('[data-p181-public-capture]').length, 0);
      assert.equal(captured.label, 'privacy-redacted current-page diagnostic');
    });
    record('actual-mounted-safe-public-dom', { publicDom: captured.publicDom, omissions: captured.omissions,
      geometryAndScreenshotAreMocks: true });
  } finally { geometry.mockRestore(); }
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
    casting = await retain(surfacePort(), Date.now() + 15_000, { mode: 'casting-assignment', proofProfile: 'wing-bays',
      castingRoleId: TARGET, castingAdmission: admission,
      expected: options.expected ?? admissionExpected(admission) });
    casting.failed.catch(() => undefined);
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
    assert.deepEqual(roleAssignmentDecision([{ uid: PEER_UID, roleId: 'wing-commander' }], actor.uid, TARGET, ROLES), { allowed: true });
  });
  actor = { ...actor, assignedRoleId: TARGET, activeConsoleRoleId: null, seatId: null };
  // Actual assignRole does not write a fleet-group berth map.
  root = { ...root, setupRevision: Number(root.setupRevision) + 1, updatedAt: new Date(Date.now() + 1).toISOString() };
  record('port.facilitator-assign-admiral.committed');
  await deliverPlayer();
}

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime('2026-10-14T00:10:00.000Z'); localStorage.clear();
  pageEvents = new EventEmitter(); documentEpoch = 1000; pageWindow = {};
  vi.spyOn(performance, 'timeOrigin', 'get').mockImplementation(() => documentEpoch);
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
  casting = undefined; firstRejection = undefined;
  heldPresence = undefined;
  sdk.auth.currentUser = { uid: actor.uid }; sdk.auth.authStateReady.mockReset().mockResolvedValue(undefined);
  sdk.call.mockReset(); sdk.listen.mockReset(); sdk.read.mockReset();
  sdk.signIn.mockReset().mockRejectedValue(new Error('Original mock Auth transport cannot be replaced.'));
});
afterEach(async context => {
  const label = process.env.PC10_PREPARATION_FIXTURE_RUN_LABEL ?? 'unlabeled';
  const directory = join(process.cwd(), 'source-evidence', 'preparation-capture-and-reload-20261013', label);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const evidence = { schemaVersion: 1, test: context.task.name, runLabel: label, sourceBaseCommit: SOURCE_COMMIT,
    sourceBaseTree: '3b974d67f2c1e0cba280abb56bd9c2a62b890a09', runtime: process.version,
    fixtureManufacturesAcceptedAuthorityOrFreshness: false, assertions, trace,
    requests: sdk.call.mock.calls.map(([endpoint]) => endpoint), firstRejection: firstRejection ?? null,
    sourceHashes: ['src/pc10PreparationReloadRecovery.test.tsx', SOURCE_PATH,
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
  heldPresence?.resolve({ data: { sessionId } });
  for (const call of resumes) call.pending.resolve(await call.reply);
  await act(async () => { await Promise.resolve(); }); vi.useRealTimers(); vi.restoreAllMocks();
});

async function reloadActualApp() {
  record('ordinary.reload-port.close-old-document'); if (unmount) act(unmount); unmount = undefined;
  stopWatch?.(); stopWatch = undefined; vi.resetModules(); documentEpoch += 1000; pageWindow = {};
  await installPorts();
  // Await the actual lazy route modules' local transform, which does not run on
  // the fixture's virtual clock. Their real components and effects remain used.
  await act(async () => { await import('@/routes/SessionMode'); await import('@/routes/ShipConsole'); });
  const { default: App } = await import('./App'); unmount = render(<App />).unmount;
  await advance(); assert.equal(resumes.length, 1);
  check('normal new App bootstrap starts one captured real resume from restored cache hydration0', () => {
    assert.equal(store.getState().identityHydrationRevision, 0); assert.equal(counts('resumeSession'), 1);
    assert.equal((group.memberShipIds as Record<string, string>)[PEER_UID], 'aegis');
  });
}
async function recoveredAdmiralPrefix() {
  const admitted = await acceptedNullAdmission(); await retainActualCasting(admitted);
  const surface = surfacePort(); const directory = join(process.cwd(), 'source-evidence', 'preparation-capture-and-reload-20261013', process.env.PC10_PREPARATION_FIXTURE_RUN_LABEL ?? 'unlabeled');
  const oldNavigation = createMemberNavigationResumeObserver(surface.page, { directory, roleId: TARGET, deadlineAt: Date.now()+15000,
    transition: 'casting-assignment', proofProfile: 'wing-bays', memberContract: 'pc11-live-base',
    expectedGmUidHash: 'a'.repeat(16), expectedGmInstanceId: 'source-gm-instance' });
  await oldNavigation.prepare(admitted); await commitSupportedAssignment(); await drainMembers();
  const assigned = await readActualMember();
  check('faithful assignRole keeps the own map absent and settles normal public currentness without a resume', () => {
    assert.equal(assigned.assignedRoleId, TARGET); assert.equal(assigned.currentMemberBerthNull, true);
    assert.deepEqual([assigned.connectionGeneration, assigned.identityHydrationRevision], [1,1]);
    assert.equal(assigned.connection, 'live'); assert.equal(assigned.sdkResumePending, false); assert.equal(counts('resumeSession'), 0);
    assert.equal((group.memberShipIds as Record<string,string>)[actor.uid], undefined);
  });
  const assignment = { endpoint: 'assignRole', httpStatus: 200,
    before: { sessionId, playerRole: 'gm', uidHash: 'a'.repeat(16), gmInstanceOwned: true, instanceId: 'source-gm-instance', setupRevision: 1 },
    data: { sessionId, targetUid: actor.uid, roleId: TARGET, instanceId: 'source-gm-instance', expectedSetupRevision: 1 },
    result: { sessionId, setupRevision: 2 } };
  let deliveryStep = 0;
  const readReloadMember = async () => {
    if (deliveryStep === 1) { resumes[0]!.pending.resolve(await resumes[0]!.reply); await advance(); }
    if (deliveryStep === 2) await deliverPlayer();
    if (deliveryStep === 3) { await drainMembers(); await deliverSeats(); }
    const current = await readActualMember();
    record('ordinary.reload-independent-read', { deliveryStep, connected: current.connected,
      currentOwnPlayerConfirmed: current.currentOwnPlayerConfirmed, berthPresent: current.currentMemberBerthPresent,
      berthNull: current.currentMemberBerthNull, berthMatches: current.currentMemberBerthMatches,
      sdkPending: current.sdkResumePending });
    if (deliveryStep === 0) check('restored cache hydration0 remains unready with the captured normal resume pending', () => {
      assert.deepEqual([current.connectionGeneration, current.identityHydrationRevision], [1,0]);
      assert.equal(current.freshness, 'cache');
      // The presentation flag reflects the cached connected pointer too;
      // server freshness, positive berth and the SDK fence still deny readiness.
      assert.equal(current.currentOwnPlayerConfirmed, true);
      assert.equal(current.sdkHasServerAuthority, false); assert.equal(current.sdkResumePending, true);
      assert.equal(current.currentMemberBerthPresent, false);
    });
    deliveryStep += 1; return current;
  };
  const recovered = await recoverP181AdmiralPreparation({ surface, admitted, assigned, assignment, oldAuthority: casting,
    oldNavigation, directory, deadlineAt: Date.now()+15000, readCurrent: readReloadMember,
    note: (operation: string,status: string) => record('procedure.step', {operation,status}) });
  casting = recovered.authority;
  check('real new document member reader SDK fence restore positive2/1 without fabricated own map or online event', () => {
    assert.deepEqual([recovered.accepted.connectionGeneration, recovered.accepted.identityHydrationRevision], [2,1]);
    assert.equal(recovered.accepted.documentTimeOrigin, 2000); assert.equal(recovered.accepted.currentMemberBerthMatches, true);
    assert.equal(recovered.accepted.sdkResumePending, false); assert.equal(counts('resumeSession'), 1);
    assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
  });
  return { admitted, surface, recovered };
}
async function openOrdinaryAdmiral() {
  const { admitted, surface, recovered } = await recoveredAdmiralPrefix();
  // Match the existing driver: casting authority closes before ordinary chooser.
  await recovered.authority.close(); casting = undefined;
  let role = globalThis.document.querySelector<HTMLAnchorElement>('a[href$="/roles/admiral"]');
  for (let elapsed = 0; !role && elapsed < 1000; elapsed += 100) {
    await advance(); role = globalThis.document.querySelector<HTMLAnchorElement>('a[href$="/roles/admiral"]');
  }
  record('ordinary.chooser-public-locator', {
    roleLinkPresent: Boolean(role),
    publicRoute: location.hash === '#/console' ? 'console' : location.hash === '#/' ? 'landing' : 'other',
    stationsHeadingPresent: [...globalThis.document.querySelectorAll('h1')].some(value => value.textContent === 'Stations and consoles'),
    openingStationsNoticePresent: [...globalThis.document.querySelectorAll('[role="status"]')].some(value => value.textContent === 'Opening stations…'),
  });
  check('ordinary rendered Roles exposes the same public Admiral href used by the driver', () => assert.ok(role));
  check('actual SessionMode source renders adjacent Admiral label and status spans', () => assert.equal(role!.textContent, 'AdmiralOPEN'));
  await captureActualRenderedPublicUi();
  fireEvent.click(role!);
  // Arm the same startup/navigation consumer as the existing driver before
  // the route fade/effect can claim or publish the station responses.
  casting = await actualRetainer()(surface,Date.now()+15000,{mode:'startup',proofProfile:'wing-bays',memberRoleId:TARGET,
    expected:{sessionId,uidHash:admitted.uidHash},navigationFrom:recovered.accepted,startCycleOne:true});
  casting!.failed.catch(error => record('actual.retainer.terminal', { message: (error as Error).message,
    firstWitness: (error as { firstP181AuthorityRejectedState?: unknown }).firstP181AuthorityRejectedState ?? null })); await advance(400);
}

async function heldAdmiralEntry() {
  await openOrdinaryAdmiral();
  await deliverPlayer();
  const state = store.getState(), origin = state.currentActorBerthProjectionPending;
  assert.ok(origin && origin.kind === 'app-admiral-first-entry-withheld', 'Actual accepted CAS and App withdrawal must originate the marker.');
  assert.equal(berthKind(state.session), 'null');
  assert.equal(state.connection, 'offline'); assert.equal(state.sessionSnapshotFreshness, 'cache');
  assert.equal((await casting!.check()).fresh, false);
  const sdkAuthority = authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid);
  assert.ok(authorityModule.pendingAdmiralFirstEntry(sdkAuthority, state, actor.uid, performance.timeOrigin));
  check('real pending Admiral CAS is private withheld and not persisted or action ready', () => {
    assert.equal(Boolean(state.session?.playerDiscovery), false);
    assert.equal(Boolean(state.session?.shipGalacticCoordinates), false);
    assert.equal(Boolean(state.session?.shipNavigationLogs), false);
    assert.equal(Object.hasOwn(store.persist.getOptions().partialize!(state) as object, 'currentActorBerthProjectionPending'), false);
    assert.equal(counts('resumeSession'), 1);
  });
  return { state, origin, sdkAuthority };
}

describe('faithful ordinary assigned-unseated preparation recovery', () => {
  it('uses actual cache bootstrap resume after one explicit document close, then the ordinary Admiral chooser', async () => {
    await openOrdinaryAdmiral();
    const unconfirmedStation = await readActualMember();
    check('ordinary active pointer alone remains nonready before matching reader and seat callbacks', () => {
      assert.equal(unconfirmedStation.currentMemberBerthMatches,false);
      // The successful CAS receipt already owns the seat. It cannot supply
      // the independent current-member active-role/berth projection.
      assert.equal(unconfirmedStation.currentCanonicalSeatOwned,true);
      assert.equal(Boolean(store.getState().session?.playerDiscovery),false);
    });
    assert.equal((await casting!.check()).fresh, false);
    await deliverPlayer();
    const pending = store.getState();
    check('actual local withdrawal retains distinct Admiral provenance and denies readiness', () => {
      assert.equal(pending.currentActorBerthProjectionPending?.kind, 'app-admiral-first-entry-withheld');
      assert.equal(berthKind(pending.session), 'null'); assert.equal(pending.connection, 'offline');
      assert.equal(pending.sessionSnapshotFreshness, 'cache');
      assert.equal(Boolean(pending.session?.playerDiscovery), false);
    });
    assert.equal((await casting!.check()).fresh, false);
    const privateReadCount = counts('getCommissarPurgeAuthority');
    await assert.rejects(service.refreshCommissarPurgeAuthority(), /Reconnect/);
    await assert.rejects(service.applyCommissarPurge('aegis'), /Reconnect/);
    check('actual private read and action issue no SDK call during pending entry', () => {
      assert.equal(counts('getCommissarPurgeAuthority'), privateReadCount);
      assert.equal(counts('applyCommissarPurge'), 0); assert.equal(counts('resumeSession'), 1);
    });
    await drainMembers(); await deliverSeats();
    const station = await readActualMember();
    check('ordinary rendered chooser uses real seat CAS presence and matching current reader without a second resume', () => {
      assert.equal(counts('claimSeat'), 1); assert.equal(actor.activeConsoleRoleId, TARGET); assert.equal(seat.holderUid, actor.uid);
      assert.equal(station.currentCanonicalSeatOwned, true); assert.equal(station.activeConsoleRoleId, TARGET);
      assert.equal(station.currentMemberBerthMatches, true); assert.equal(station.sdkResumePending, false);
      assert.deepEqual([station.connectionGeneration, station.identityHydrationRevision], [2,1]); assert.equal(counts('resumeSession'), 1);
    });
    assert.equal((await casting!.check()).fresh,true);
    record('procedure.ready.for-same-actor-existing-wing-bays');
  });
  it('clears the genuine pending origin on actual App unmount without changing Auth document or canonical owner', async () => {
    const { state, sdkAuthority } = await heldAdmiralEntry();
    const originalDocument = documentEpoch;
    assert.ok(unmount); act(unmount); unmount = undefined; record('negative.actual-App-unmount');
    check('real unmount clears SDK and Store provenance while original identity and canonical map remain', () => {
      assert.equal(documentEpoch, originalDocument); assert.equal(sdk.auth.currentUser?.uid, actor.uid);
      assert.equal((group.memberShipIds as Record<string,string>)[actor.uid], 'aegis');
      assert.equal(sdkAuthority.hasServerSessionAuthority, true);
      assert.equal(authorityModule.pendingAdmiralFirstEntry(sdkAuthority, state, actor.uid, performance.timeOrigin), undefined);
      assert.equal(store.getState().currentActorBerthProjectionPending, null);
    });
    await assert.rejects(casting!.check(), /Original startup own berth authority retired/);
    assert.equal(counts('resumeSession'), 1);
  });
  it('keeps actual canonical own-map removal during pending entry terminal after a later positive reader', async () => {
    await heldAdmiralEntry();
    group = { ...group, memberShipIds: { [PEER_UID]: 'aegis' } };
    root = { ...root, updatedAt: new Date(Date.now()+1).toISOString() };
    record('port.canonical-own-entry.removed-during-Admiral-pending');
    await drainMembers(); await advance(1200); await drainMembers();
    check('real canonical null cannot inherit accepted local provenance', () => {
      assert.equal(berthKind(store.getState().session), 'null');
      assert.equal(store.getState().currentActorBerthProjectionPending, null);
      assert.equal(authorityModule.pendingAdmiralFirstEntry(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid),
        store.getState(), actor.uid, performance.timeOrigin), undefined);
      assert.ok(trace.some(row => row.kind === 'deliver.current-member' && row.responseBerth === 'null'));
      assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
    });
    await assert.rejects(casting!.check(), /Original startup own berth authority retired/);
    group = { ...group, memberShipIds: { [PEER_UID]: 'aegis', [actor.uid]: 'aegis' } };
    root = { ...root, updatedAt: new Date(Date.now()+1).toISOString() };
    await advance(1200); await drainMembers();
    await assert.rejects(casting!.check(), /Original startup own berth authority retired/);
  });
  it('retires a real pending origin on the ordinary reader error even while SDK serverSeen remains true', async () => {
    const { state, sdkAuthority } = await heldAdmiralEntry();
    const errorPort = listener(playerPath()).error; assert.ok(errorPort);
    act(() => errorPort(Object.assign(new Error('source-shaped reader denied'), { code: 'permission-denied' })));
    record('deliver.actual-reader-error'); await advance();
    check('ordinary error clears provenance and keeps private authority held despite stale SDK serverSeen', () => {
      assert.equal(sdkAuthority.hasServerSessionAuthority, true);
      assert.equal(store.getState().connection, 'offline'); assert.equal(store.getState().sessionSnapshotFreshness, 'cache');
      assert.equal(store.getState().currentActorBerthProjectionPending, null);
      assert.equal(authorityModule.pendingAdmiralFirstEntry(sdkAuthority, state, actor.uid, performance.timeOrigin), undefined);
      assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
    });
    await assert.rejects(casting!.check(), /Original startup own berth authority retired/);
  });
  it('expires genuine pending provenance at its original finite deadline without storing or renewing it', async () => {
    const { state, origin, sdkAuthority } = await heldAdmiralEntry();
    vi.setSystemTime(origin.deadlineAt);
    check('expired origin is not SDK ownership even with unchanged actor map and serverSeen', () => {
      assert.equal(authorityModule.admiralFirstEntryMatches(origin, state, actor.uid, performance.timeOrigin), false);
      assert.equal(authorityModule.pendingAdmiralFirstEntry(sdkAuthority, state, actor.uid, performance.timeOrigin), undefined);
      assert.equal(counts('resumeSession'), 1);
    });
    await assert.rejects(casting!.check(), /deadline|timed out/i);
  });
  it('clears the genuine pending SDK origin on the ordinary Store reset', async () => {
    const { state, sdkAuthority } = await heldAdmiralEntry();
    act(() => store.getState().reset()); record('negative.store-reset');
    assert.equal(store.getState().currentActorBerthProjectionPending, null); assert.equal(store.getState().me, null);
    assert.equal(authorityModule.pendingAdmiralFirstEntry(sdkAuthority, state, actor.uid, performance.timeOrigin), undefined);
    await assert.rejects(casting!.check(), /Original startup own berth authority retired/);
  });
  it('clears genuine accepted entry when the held normal presence response fails', async () => {
    heldPresence = deferred();
    await heldAdmiralEntry();
    heldPresence.reject(Object.assign(new Error('source-shaped ordinary presence failure'), { code: 'unavailable' }));
    record('deliver.normal-presence-failure'); await advance();
    assert.equal(store.getState().currentActorBerthProjectionPending, null);
    assert.equal(authorityModule.pendingAdmiralFirstEntry(authorityModule.sessionSnapshotAuthorityFor(sessionId, actor.uid),
      store.getState(), actor.uid, performance.timeOrigin), undefined);
    await assert.rejects(casting!.check(), /Original startup own berth authority retired/);
    assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
    assert.equal(counts('resumeSession'), 1);
  });
  it('retains the same guard through real reader waiting before the held presence reply and restores only from matching current delivery', async () => {
    heldPresence = deferred();
    await heldAdmiralEntry();
    heldPresence.resolve({ data: { sessionId } }); record('deliver.held-normal-presence-ack');
    await advance();
    assert.equal((await casting!.check()).fresh, false);
    assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
    await drainMembers(); await deliverSeats();
    assert.equal((await casting!.check()).fresh, true);
    assert.deepEqual([store.getState().me?.connectionGeneration, store.getState().identityHydrationRevision], [2,1]);
    assert.equal(store.getState().currentActorBerthProjectionPending, null);
    assert.equal(counts('claimSeat'), 1); assert.equal(counts('resumeSession'), 1);
    record('startup.restored.after-actual-reader-wait-and-held-presence');
  });
  it('keeps real reader canonical loss during the new-document acceptance reread terminal', async () => {
    const admitted = await acceptedNullAdmission(); await retainActualCasting(admitted);
    const surface = surfacePort();
    const directory = join(process.cwd(), 'source-evidence', 'preparation-capture-and-reload-20261013', process.env.PC10_PREPARATION_FIXTURE_RUN_LABEL ?? 'unlabeled');
    const oldNavigation = createMemberNavigationResumeObserver(surface.page, { directory, roleId: TARGET, deadlineAt: Date.now()+15000,
      transition: 'casting-assignment', proofProfile: 'wing-bays', memberContract: 'pc11-live-base',
      expectedGmUidHash: 'a'.repeat(16), expectedGmInstanceId: 'source-gm-instance' });
    await oldNavigation.prepare(admitted); await commitSupportedAssignment(); await drainMembers();
    const assigned = await readActualMember();
    const assignment = { endpoint: 'assignRole', httpStatus: 200,
      before: { sessionId, playerRole: 'gm', uidHash: 'a'.repeat(16), gmInstanceOwned: true, instanceId: 'source-gm-instance', setupRevision: 1 },
      data: { sessionId, targetUid: actor.uid, roleId: TARGET, instanceId: 'source-gm-instance', expectedSetupRevision: 1 },
      result: { sessionId, setupRevision: 2 } };
    let deliveryStep = 0;
    await assert.rejects(recoverP181AdmiralPreparation({ surface, admitted, assigned, assignment, oldAuthority: casting,
      oldNavigation, directory, deadlineAt: Date.now()+15000, readCurrent: async () => {
        if (deliveryStep === 1) { resumes[0]!.pending.resolve(await resumes[0]!.reply); await advance(); }
        if (deliveryStep === 2) await deliverPlayer();
        if (deliveryStep === 3) { await drainMembers(); await deliverSeats(); }
        if (deliveryStep === 4) {
          // Remove only the canonical owner in the backing reader snapshot;
          // the actual App receives that real parser/transaction result.
          group = { ...group, memberShipIds: { [PEER_UID]: 'aegis' } };
          root = { ...root, updatedAt: new Date(Date.now() + 1).toISOString() };
          record('negative.real-canonical-own-map-removal-before-new-document-pin');
          await deliverPlayer(); await drainMembers();
        }
        const current = await readActualMember();
        record('negative.reload-reread', { deliveryStep, berthPresent: current.currentMemberBerthPresent,
          berthNull: current.currentMemberBerthNull, berthMatches: current.currentMemberBerthMatches });
        deliveryStep += 1; return current;
      }, note: (operation: string,status: string) => record('procedure.step', {operation,status}) }), /positive berth was retired/);
    check('canonical reader loss remains private and cannot pin, claim, or add a resume', () => {
      assert.equal(berthKind(store.getState().session), 'null'); assert.equal(counts('resumeSession'), 1);
      assert.equal(counts('claimSeat'), 0); assert.equal(actor.activeConsoleRoleId, null);
      assert.equal((group.memberShipIds as Record<string,string>)[PEER_UID], 'aegis');
      assert.equal(store.getState().currentActorBerthProjectionPending, null);
      assert.equal(Boolean(store.getState().session?.playerDiscovery), false);
      assert.equal(Boolean(store.getState().session?.shipGalacticCoordinates), false);
    });
  });
});
