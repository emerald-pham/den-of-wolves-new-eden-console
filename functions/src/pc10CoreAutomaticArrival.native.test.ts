// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createHash, webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants, Script } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { GameSession, Player } from '@/types/game';

type Fields = Record<string, unknown>;
const io = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const listeners = new Map<string, (snapshot: unknown) => void>();
  const calls: string[] = [];
  const reference = (path: string, collection = false) => ({ path, collection, id: path.split('/').at(-1) });
  const snapshot = (path: string) => {
    const value = documents.get(path);
    return { id: path.split('/').at(-1), exists: value !== undefined, data: () => value,
      get: (key: string) => value?.[key] };
  };
  const runTransaction = async (run: (tx: unknown) => unknown) => run({
    get: async (ref: ReturnType<typeof reference>) => ref.collection
      ? { docs: [...documents.keys()].filter(path => path.startsWith(`${ref.path}/`) &&
        !path.slice(ref.path.length + 1).includes('/')).map(snapshot) }
      : snapshot(ref.path),
    set: (ref: ReturnType<typeof reference>, value: Fields) => documents.set(ref.path, { ...value }),
    update: (ref: ReturnType<typeof reference>, value: Fields) =>
      documents.set(ref.path, { ...documents.get(ref.path), ...value }),
    delete: (ref: ReturnType<typeof reference>) => documents.delete(ref.path),
    create: (ref: ReturnType<typeof reference>, value: Fields) => {
      if (documents.has(ref.path)) throw new Error(`Duplicate native document ${ref.path}`);
      documents.set(ref.path, { ...value });
    },
  });
  return { documents, listeners, calls, snapshot, reference,
    notifyMovement: () => undefined,
    afterArrival: (() => undefined) as () => void | Promise<void>,
    beforeMemberReply: (() => undefined) as () => void,
    emitTransport: (() => undefined) as (endpoint: string, data: unknown, result: unknown, cause?: unknown) => undefined,
    auth: { currentUser: { uid: 'native-core-retarget-holder' } as { uid: string } | null },
    dispatch: vi.fn(), db: { doc: reference, collection: (path: string) => reference(path, true), runTransaction } };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => io.db,
  FieldValue: { serverTimestamp: () => new Date().toISOString(), delete: () => 'delete-field' },
  Timestamp: class {
    constructor(private readonly value: Date) {}
    static now() { return new this(new Date()); }
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
  } }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class extends Error {
    constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, handler?: unknown) => ({ run: handler ?? optionsOrHandler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: () => ({}) }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: () => ({}) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_service: unknown, endpoint: string) => async (data: unknown) => {
    io.calls.push(endpoint);
    try {
      const result = await io.dispatch(endpoint, data);
      if (endpoint === 'completeShuttleArrival') await io.afterArrival();
      io.notifyMovement();
      io.emitTransport(endpoint, data, result);
      return { data: result };
    } catch (cause) {
      io.emitTransport(endpoint, data, undefined, cause);
      throw cause;
    }
  },
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}), connectFirestoreEmulator: vi.fn(),
  doc: (_database: unknown, path: string) => io.reference(path),
  collection: (_database: unknown, path: string) => io.reference(path, true),
  query: (reference: unknown) => reference, where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getDocFromServer: vi.fn(), Timestamp: class { toDate() { return new Date(0); } },
  onSnapshot: (ref: { path: string }, _options: unknown, next: (snapshot: unknown) => void) => {
    io.listeners.set(ref.path, next);
    if (ref.path.includes('/shuttleDepartures/')) queueMicrotask(() => {
      if (io.listeners.get(ref.path) !== next) return;
      const value = io.documents.get(ref.path);
      next({ exists: () => value !== undefined, metadata: { fromCache: false }, data: () => value });
    });
    if (ref.path.endsWith('/players')) queueMicrotask(() => {
      if (io.listeners.get(ref.path) !== next) return;
      next({ docs: [], metadata: { fromCache: false } });
    });
    return () => { if (io.listeners.get(ref.path) === next) io.listeners.delete(ref.path); };
  },
}));
vi.mock('../../src/lib/firebase', () => ({ app: () => ({}), functions: () => ({}), auth: () => io.auth }));
vi.mock('../../src/lib/firebaseConfig', () => ({ useEmulators: false, emulatorPorts: { firestore: 8080 } }));

const { requestShuttleDeparture: requestHandler, beginShuttleTransit: beginHandler,
  retargetShuttleTransit: retargetHandler, completeShuttleArrival: arrivalHandler, getCurrentMemberSession } = await import('./index');
const { default: ShuttleControl } = await import('../../src/components/ShuttleControl');
const consumer = await import('../../src/lib/firestore');
// Distinct real-source ESM URLs reproduce the App/proof module-identity seam.
const source: typeof consumer = await import('../../src/lib/firestore.ts?pc10AppImportOwner');
const { useSessionStore } = await import('@/store/useSessionStore');
const { stripGmNavigationProjection } = await import('../../src/lib/navigationPrivacy');
const { isWireSafeEntityId } = await import('../../src/types/identifiers');
const { acceptCallableSessionAuthority } = await import('../../src/lib/sessionSnapshotAuthority');
// Native import preserves the complete public MJS helpers and their serialized
// page callbacks. Vitest must not rewrite those callbacks into its import shim.
const nativeImport = new Script('url => import(url)', {
  importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
}).runInThisContext() as (url: string) => Promise<{
  readActionState: (surface: Fields, craft: string) => Promise<Fields>;
  createPendingProcedureDefaultSteps: () => Record<string, (input: Fields) => Promise<Fields>>;
  captureMountedProcedureAction: (input: Fields) => Promise<Fields>;
}>;
const recipes = await nativeImport(pathToFileURL(resolve('scripts/pc10-pending-procedure-ui-recipes.mjs')).href);
const proof = await nativeImport(pathToFileURL(resolve('scripts/pc10-pending-procedure-ui-proof.mjs')).href);
const SESSION = 'native-core-retarget-destination';
const UID = 'native-core-retarget-holder';
const HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ROOT = `sessions/${SESSION}`;
const ROLE = 'wing-commander';
const SHUTTLE = 'starlight';
const HOST = 'aegis';
const DESTINATION = 'dione';
const RETARGET_DESTINATION = 'icebreaker';
const GROUP = 'fleet-1';

const actor = { uid: UID, sessionId: SESSION, displayName: 'Native holder', joinedAt: new Date().toISOString(),
  role: 'player', connected: true, seatId: ROLE, assignedRoleId: ROLE, activeConsoleRoleId: ROLE,
  fleetGroupId: GROUP, connectionGeneration: 2, replacementRoleId: null, replacementStatus: null } as Player;
const call = (data: Fields) => ({ auth: { uid: io.auth.currentUser!.uid }, data }) as CallableRequest<Fields>;
let stop: (() => void) | undefined;
let stage = 'initializing';

async function appSessionPublisher() {
  const app = ts.createSourceFile('src/App.tsx', await readFile(resolve('src/App.tsx'), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const named = (name: string) => {
    const matches: ts.Node[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name ||
          ts.isVariableDeclaration(node) && node.name.getText(app) === name ||
          ts.isPropertyAssignment(node) && node.name.getText(app) === name) matches.push(node);
      ts.forEachChild(node, visit);
    };
    visit(app); assert.equal(matches.length, 1, `Use the one actual App ${name} declaration`);
    return matches[0]!;
  };
  const functions = ['pursuitEmergencyAuthorityMatches', 'stripOwnPlayerNavigation', 'stripNavigationProjection',
    'currentActorBerthMatches', 'currentActorBerthDiscoveryMatches'].map(name => named(name).getText(app));
  const variables = ['isPressAudience', 'currentPressGroupDiscoveryMatches', 'pressGroupMetadata']
    .map(name => `const ${named(name).getText(app)};`);
  const publish = named('onSession') as ts.PropertyAssignment;
  // Compile the production App callback and its exact source predicates,
  // including independent discovery preservation; do not fabricate a merged
  // post-state or replace the capture's group/authority predicates.
  const compiled = ts.transpileModule(`${functions.join('\n')}\n${variables.join('\n')}\n
    let retainedGroupCandidateProjection, pendingPlayerDiscovery, pendingGmDiscovery, pendingRoleBrief;
    const callbackCurrent = () => true, playerProjectionFresh = true;
    return (${publish.initializer.getText(app)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('useSessionStore', 'stripGmNavigationProjection', 'isWireSafeEntityId', 'playerUid', 'initialMember', compiled)(
    useSessionStore, stripGmNavigationProjection, isWireSafeEntityId, UID, actor) as (session: GameSession) => void;
}

beforeEach(() => {
  stage = 'starting-fixture';
  io.afterArrival = () => undefined;
  io.beforeMemberReply = () => undefined;
  io.documents.clear(); io.listeners.clear(); io.calls.length = 0;
  io.auth.currentUser = { uid: UID };
  useSessionStore.getState().reset();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-06T20:00:00.000Z'));
  const now = Date.now();
  io.documents.set(ROOT, { id: SESSION, name: 'Native source', joinCode: 'NATIVE', phase: 'active', currentTurn: 1,
    activeRoleIds: [ROLE, 'dione-captain', 'icebreaker-miner'], activeVesselIds: [HOST, DESTINATION, RETARGET_DESTINATION],
    turnPhase: { turn: 1, progression: 'manual', teamPhaseEndsAt: new Date(now - 60_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 600_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    shuttleDockings: [{ shuttleId: 'snn-press-shuttle', shipId: HOST, dockedAt: 'SESSION START' },
      { shuttleId: SHUTTLE, shipId: HOST, dockedAt: 'SESSION START' },
      { shuttleId: 'highwall', shipId: RETARGET_DESTINATION, dockedAt: 'SESSION START' }],
    shuttleVisitLog: [], shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, ownerRoleId: ROLE,
      ownerUid: UID, holderUid: UID, revision: 0 } },
    createdAt: new Date(now - 120_000).toISOString(), updatedAt: new Date(now - 60_000).toISOString() });
  io.documents.set(`${ROOT}/players/${UID}`, { ...actor });
  io.documents.set(`${ROOT}/fleetGroups/${GROUP}`, { id: GROUP, vesselIds: [HOST, DESTINATION, RETARGET_DESTINATION],
    memberUids: [UID], memberShipIds: { [UID]: HOST } });
  arrivals.length = 0;
  transport.length = 0; counts.clicks = 0; counts.replays = 0; counts.movementReads = 0;
  io.dispatch.mockImplementation(async (endpoint: string, data: Fields) => {
    if (endpoint === 'getCurrentMemberSession') {
      const result = await getCurrentMemberSession.run(call(data));
      io.beforeMemberReply();
      return result;
    }
    if (endpoint === 'requestShuttleDeparture') return requestHandler.run(call(data));
    if (endpoint === 'beginShuttleTransit') return beginHandler.run(call(data));
    if (endpoint === 'retargetShuttleTransit') return retargetHandler.run(call(data));
    if (endpoint === 'completeShuttleArrival') return arrivalHandler.run(call(data));
    throw new Error(`Unexpected native SDK operation ${endpoint}`);
  });
});
afterEach(() => {
  process.stderr.write(`Native source stage: ${stage}; operations: ${JSON.stringify(io.calls)}\n`);
  cleanup(); stop?.(); stop = undefined; vi.useRealTimers(); useSessionStore.getState().reset();
  vi.unstubAllGlobals();
});

async function startFeed(reader: typeof consumer = source, renewIdentity = true) {
  const onSession = await appSessionPublisher();
  const initial = await getCurrentMemberSession.run(call({ sessionId: SESSION }));
  stage = 'initial-member-returned';
  if (renewIdentity) useSessionStore.getState().setIdentity(reader.sessionFrom(SESSION, initial.session), actor);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  let ready!: () => void;
  let fail!: (cause: unknown) => void;
  const published = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
  stop = reader.subscribeSessionState(SESSION, UID, { sessionReadAudience: 'member',
    sessionSnapshotAuthority: reader.sessionSnapshotAuthorityFor(SESSION, UID),
    initialMemberActor: () => actor,
    onSession: session => { try { onSession(session); } catch (cause) { fail(cause); throw cause; } },
    onPlayer: player => useSessionStore.getState().setMe(player),
    onSessionFreshness: fresh => {
      useSessionStore.getState().setSessionSnapshotFreshness(fresh ? 'server' : 'unknown');
      if (fresh && io.calls.filter(value => value === 'getCurrentMemberSession').length >= 2) ready();
    },
    onPlayerDiscovery: discovery => {
      if (discovery) useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, playerDiscovery: discovery });
    }, onSeats: vi.fn(), onKicked: vi.fn(), onError: () => { fail(new Error('Native member feed failed')); } });
  const publish = (path: string, value: Fields) => {
    const next = io.listeners.get(`${ROOT}/${path}`)!;
    next({ exists: () => true, metadata: { fromCache: false }, data: () => value, get: (key: string) => value[key] });
  };
  publish(`players/${UID}`, { ...actor });
  publish(`playerDiscoveries/${UID}`, { groupId: GROUP, shipId: HOST,
    fleetGroupVesselIds: [HOST, DESTINATION, RETARGET_DESTINATION], revision: 1, currentCoordinate: '0000',
    knownCoordinates: ['0000'], knownSystems: {}, navigationLogs: [], pursuitDistance: 1 });
  stage = 'member-feed-awaiting-first-publication';
  await published;
  stage = 'member-feed-published';
  // The publication callback has accepted the transaction and scheduled only
  // the existing timer. No timer, gameplay clock or observer poll is advanced.
  assert.equal(useSessionStore.getState().session?.playerDiscovery?.groupId, GROUP);
}

type NativeResponse = {
  request: () => { method: () => string; url: () => string; postDataJSON: () => { data: unknown } };
  url: () => string;
  ok: () => boolean;
  status: () => number;
  json: () => Promise<Fields>;
};
const arrivals: Fields[] = [];
const transport: { endpoint: string; request: unknown; result?: unknown; error?: unknown; httpStatus: number }[] = [];
const counts = { clicks: 0, replays: 0, movementReads: 0 };

function mountedSurface() {
  const requestListeners = new Set<(request: ReturnType<NativeResponse['request']>) => void>();
  const responseWaiters = new Set<{ predicate: (response: NativeResponse) => boolean;
    resolve: (response: NativeResponse) => void }>();
  io.notifyMovement = () => {
    const path = `${ROOT}/shuttleDepartures/${SHUTTLE}`;
    const value = io.documents.get(path);
    io.listeners.get(path)?.({ exists: () => value !== undefined,
      metadata: { fromCache: false }, data: () => value });
    return undefined;
  };
  io.emitTransport = (endpoint, data, result, cause) => {
    const error = cause ? { code: (cause as { code?: string }).code,
      message: cause instanceof Error ? cause.message : String(cause) } : undefined;
    // The inert SDK adapter preserves the actual Source handler reply/error.
    // It does not replace a denied result with a success receipt.
    const httpStatus = error ? 400 : 200;
    transport.push({ endpoint, request: data, ...(error ? { error } : { result }), httpStatus });
    const url = `http://native.invalid/us-central1/${endpoint}`;
    const request = { method: () => 'POST', url: () => url, postDataJSON: () => ({ data }) };
    const response: NativeResponse = { request: () => request, url: () => url,
      ok: () => !error, status: () => httpStatus, json: async () => error ? { error } : { result } };
    for (const listener of requestListeners) listener(request);
    for (const waiter of [...responseWaiters]) if (waiter.predicate(response)) {
      responseWaiters.delete(waiter); waiter.resolve(response);
    }
    return undefined;
  };
  const wrap = (find: () => HTMLElement | null): Fields => ({
    count: async () => find() ? 1 : 0,
    isVisible: async () => !!find() && !find()!.hidden,
    isEnabled: async () => !!find() && !(find() as HTMLButtonElement).disabled,
    click: async () => { const button = find(); assert.ok(button);
      counts.clicks++; await act(async () => { fireEvent.click(button); }); },
    selectOption: async (value: string) => { const select = find(); assert.ok(select);
      await act(async () => { fireEvent.change(select, { target: { value } }); }); },
    locator: () => ({ evaluateAll: async (run: (options: HTMLOptionElement[]) => unknown) =>
      run(Array.from((find() as HTMLSelectElement).options)) }),
    getByLabel: (label: string) => wrap(() => find() ? within(find()!).queryByLabelText(label, { exact: true }) : null),
    getByRole: (role: Parameters<typeof screen.queryByRole>[0], options: Fields) =>
      wrap(() => find() ? within(find()!).queryByRole(role, options) : null),
  });
  const moduleImport = async (url: string) => {
    if (url === '/src/store/useSessionStore.ts') return { useSessionStore };
    if (url === '/src/lib/firebase.ts') return { auth: () => io.auth };
    if (url === '/src/lib/firestore.ts') return consumer;
    if (url.includes('firebase_firestore.js')) return {
      doc: (_database: unknown, path: string) => path,
      getDoc: async (path: string) => { counts.movementReads++;
        const value = io.documents.get(path);
        return { exists: () => value !== undefined, data: () => value }; },
    };
    throw new Error(`Unexpected serialized source ${url}`);
  };
  const page = {
    evaluate: async (callback: (input: unknown) => unknown, input: unknown) => {
      let result: unknown;
      await act(async () => { result = await new Function('moduleImport', 'fetch', 'crypto', 'input',
        `return (${callback.toString().replace(/\bimport\s*\(/g, 'moduleImport(')})(input);`)(
        moduleImport, async () => ({ text: async () => 'import { getDoc } from "firebase_firestore.js";' }), webcrypto, input); });
      return result;
    },
    url: () => `http://native.invalid/#/shuttles/${SHUTTLE}`,
    on: (_event: string, listener: (request: ReturnType<NativeResponse['request']>) => void) => requestListeners.add(listener),
    off: (_event: string, listener: (request: ReturnType<NativeResponse['request']>) => void) => requestListeners.delete(listener),
    waitForResponse: (predicate: (response: NativeResponse) => boolean) =>
      new Promise<NativeResponse>(resolve => responseWaiters.add({ predicate, resolve })),
    locator: () => wrap(() => null),
    getByRole: (role: Parameters<typeof screen.queryByRole>[0], options: Fields = {}) => role === 'status'
      ? { allTextContents: async () => screen.queryAllByRole('status').map(node => node.textContent) }
      : wrap(() => screen.queryByRole(role, options)),
  };
  const surface = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => {
    const current = useSessionStore.getState();
    return { sessionId: current.session?.id, uidHash: HASH, profileRoleId: current.me?.assignedRoleId,
      activeConsoleRoleId: current.me?.activeConsoleRoleId, assignedRoleId: current.me?.assignedRoleId,
      playerRole: current.me?.role, sameActor: io.auth.currentUser?.uid === current.me?.uid,
      connection: current.connection, freshness: current.sessionSnapshotFreshness };
  }, callable: async (endpoint: string, data: Fields) => {
    counts.replays++;
    const last = transport.filter(row => row.endpoint === endpoint).at(-1);
    assert.deepEqual(data, last?.request, 'Replay the exact mounted Source request');
    return { status: 'committed', result: await io.dispatch(endpoint, data) };
  } };
  const gmActor = { sessionId: SESSION, uidHash: 'd013f0dced1cf943', profileRoleId: 'gm', activeConsoleRoleId: 'gm',
    assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'native-owned-gm', gmInstanceOwned: true,
    sameActor: true, connection: 'live', freshness: 'server' };
  const gmProjection = () => {
    const session = source.sessionFrom(SESSION, io.documents.get(ROOT)!);
    const shipFleetGroupIds = Object.fromEntries([...io.documents.entries()]
      .filter(([path]) => path.startsWith(`${ROOT}/fleetGroups/`))
      .flatMap(([, group]) => (group.vesselIds as string[]).map(shipId => [shipId, group.id])));
    return { live: true, sessionId: session.id, phase: session.phase, cycle: session.currentTurn, revision: 0,
      activeVesselIds: session.activeVesselIds, shuttleControl: session.shuttleControl,
      shuttleDockings: session.shuttleDockings, shipFleetGroupIds };
  };
  const gmSurface = { observe: async () => gmActor, page: { ...page,
    evaluate: async (callback: (input: unknown) => unknown, input: unknown) =>
      new Function('moduleImport', 'fetch', 'crypto', 'input',
        `return (${callback.toString().replace(/\bimport\s*\(/g, 'moduleImport(')})(input);`)(
        async (url: string) => url === '/src/store/useSessionStore.ts' ? { useSessionStore: { getState: () => ({
          ...useSessionStore.getState(), session: { ...source.sessionFrom(SESSION, io.documents.get(ROOT)!),
            shipFleetGroupIds: gmProjection().shipFleetGroupIds } }) } } : moduleImport(url),
        async () => ({ text: async () => 'import { getDoc } from "firebase_firestore.js";' }), webcrypto, input),
  }, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const game = { select: async (role: string) => role === 'gm' ? gmSurface : surface,
    state: async (selected: unknown) => selected === gmSurface ? gmProjection() : recipes.readActionState(surface, SHUTTLE) };
  return { surface, game, requestListeners, responseWaiters };
}

async function inFlightFixture({ legalRetarget = true } = {}) {
  if (!legalRetarget) {
    const root = io.documents.get(ROOT)!;
    root.activeVesselIds = [HOST, DESTINATION]; root.activeRoleIds = [ROLE, 'dione-captain'];
    root.shuttleDockings = (root.shuttleDockings as Fields[]).filter(row => row.shuttleId !== 'highwall');
    io.documents.get(`${ROOT}/fleetGroups/${GROUP}`)!.vesselIds = [HOST, DESTINATION];
  }
  await startFeed();
  const harness = mountedSurface();
  const control = (useSessionStore.getState().session!.shuttleControl!)[SHUTTLE]!;
  await act(async () => { render(createElement(ShuttleControl, { control })); });
  const before = await recipes.readActionState(harness.surface, SHUTTLE);
  const context: Fields = { initial: { sessionId: SESSION }, roster: [{ roleId: ROLE, uidHash: HASH }],
    shuttleOriginAuthority: { sessionId: SESSION, uidHash: HASH, shuttleId: SHUTTLE, groupId: GROUP,
      cycle: 1, controlRevision: 0, sourceAuthority: before.currentDocumentAuthority },
    shuttleOriginHostShipId: HOST, shuttleSourceDiagnosticOnly: true };
  const prior = [];
  for (const endpoint of ['requestShuttleDeparture', 'beginShuttleTransit']) {
    const plan = await recipes.createPendingProcedureDefaultSteps()[`core:${endpoint}`]!({ context, game: harness.game });
    const outcome = await proof.captureMountedProcedureAction({ context, game: harness.game, caseId: `core:${endpoint}`, ...plan });
    assert.equal(outcome.status, 'completed', `Real mounted ${endpoint}: ${JSON.stringify(outcome)}`);
    prior.push(outcome);
  }
  const afterBegin = await recipes.readActionState(harness.surface, SHUTTLE);
  assert.deepEqual(afterBegin.currentDocumentAuthority, before.currentDocumentAuthority);
  assert.equal((io.documents.get(`${ROOT}/shuttleDepartures/${SHUTTLE}`)!).status, 'in-transit');
  assert.equal((io.documents.get(`${ROOT}/shuttleDepartures/${SHUTTLE}`)!).destinationShipId, DESTINATION);
  assert.equal(Object.hasOwn(io.documents.get(`${ROOT}/shuttleDepartures/${SHUTTLE}`)!, 'originShipId'), false);
  const panel = screen.getByRole('region', { name: 'Shuttle departure' });
  const dropdown = within(panel).getByLabelText('New destination ship') as HTMLSelectElement;
  const offered = Array.from(dropdown.options).filter(option => !!option.value).map(option => option.value);
  assert.equal(offered[0], HOST, 'The actual product offers the original host first, as retained Core13 shows');
  return { ...harness, context, before, afterBegin, prior, offered, panel, dropdown };
}

async function originalRetargetedFixture() {
  const fixture = await inFlightFixture();
  // Advance only the Native clock/timers. The real production duration and
  // effect remain untouched, and no native timer fabricates a docking/receipt.
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  const plan = await recipes.createPendingProcedureDefaultSteps()['core:retargetShuttleTransit']!({
    context: fixture.context, game: fixture.game });
  const outcome = await proof.captureMountedProcedureAction({ context: fixture.context, game: fixture.game,
    caseId: 'core:retargetShuttleTransit', ...plan });
  assert.equal(outcome.status, 'completed', JSON.stringify(outcome));
  fixture.prior.push(outcome);
  fixture.context.shuttleArrivalWitness = outcome.shuttleArrivalWitness;
  fixture.context.shuttleArrivalCaptureMode = 'automatic-source-effect';
  const movement = io.documents.get(`${ROOT}/shuttleDepartures/${SHUTTLE}`)!;
  assert.equal(movement.revision, 2);
  assert.equal(Date.parse(movement.arrivesAt as string) - Date.parse(movement.departedAt as string), 60_000);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  assert.equal(io.calls.filter(endpoint => endpoint === 'completeShuttleArrival').length, 0);
  return { ...fixture, movement: structuredClone(movement) };
}

async function automaticCapture(fixture: Awaited<ReturnType<typeof originalRetargetedFixture>>, retain = false) {
  const start = { clicks: counts.clicks, replays: counts.replays, calls: io.calls.length,
    movementReads: counts.movementReads };
  const plan = await recipes.createPendingProcedureDefaultSteps()['core:completeShuttleArrival']!({
    context: fixture.context, game: fixture.game });
  let prepared: Fields | undefined;
  let observed: Fields | undefined;
  let armed!: () => void;
  const arming = new Promise<void>(resolve => { armed = resolve; });
  const capture = proof.captureMountedProcedureAction({ context: fixture.context, game: fixture.game,
    caseId: 'core:completeShuttleArrival', ...plan,
    prepare: async (input: Fields) => {
      const action = await plan.prepare!(input) as Fields;
      prepared = action;
      assert.equal(action.offered, true, `Real current automatic plan: ${JSON.stringify(action)}`);
      return { ...action, observe: async () => {
        await (action.observe as () => Promise<void>)();
        armed();
      } };
    },
    inspect: async (input: Fields) => {
      observed = await plan.inspect!(input) as Fields;
      arrivals.push(observed);
      return observed;
    },
  });
  await arming;
  const remaining = Date.parse(fixture.movement.arrivesAt as string) - Date.now();
  assert.ok(remaining > 0 && remaining <= 35_000);
  stage = 'genuine-automatic-arrival-effect';
  // The mounted product effect alone sends arrival when its real Source leg
  // deadline is reached. All ordinary member feed timers run normally too.
  await act(async () => { await vi.advanceTimersByTimeAsync(remaining); });
  const outcome = await capture;
  const after = await recipes.readActionState(fixture.surface, SHUTTLE);
  const result = { prior: fixture.prior, before: fixture.before, prepared, observed, outcome,
    counts: { clicks: counts.clicks - start.clicks, replays: counts.replays - start.replays,
      movementReads: counts.movementReads - start.movementReads },
    sdkCalls: io.calls.slice(start.calls),
    postReceiptMemberReads: io.calls.slice(start.calls + io.calls.slice(start.calls).indexOf('completeShuttleArrival') + 1)
      .filter(endpoint => endpoint === 'getCurrentMemberSession').length,
    transport: transport.filter(row => row.endpoint === 'completeShuttleArrival'),
    authoritativeRoot: io.documents.get(ROOT),
    movementAbsent: !io.documents.has(`${ROOT}/shuttleDepartures/${SHUTTLE}`),
    privateChainAbsent: !io.documents.has(`${ROOT}/shuttleTransitChains/${SHUTTLE}`),
    after, renderedStatuses: screen.queryAllByRole('status').map(node => node.textContent),
    remainingRequestListeners: fixture.requestListeners.size, remainingResponseWaiters: fixture.responseWaiters.size };
  if (retain && process.env.PC10_CORE_ARRIVAL_NATIVE_EVIDENCE) await writeFile(process.env.PC10_CORE_ARRIVAL_NATIVE_EVIDENCE,
    JSON.stringify(result, null, 2));
  return result;
}

it('the real automatic completion retains the original current member docking and visible receipt after exact Request Begin Retarget replays', async () => {
  const fixture = await originalRetargetedFixture();
  const evidence = await automaticCapture(fixture, true);
  expect(evidence.transport).toHaveLength(1);
  expect(evidence.transport[0]).toMatchObject({ httpStatus: 200,
    result: { status: 'arrived', hostShipId: RETARGET_DESTINATION, transitRevision: 2 } });
  expect(evidence.movementAbsent).toBe(true);
  expect(evidence.privateChainAbsent).toBe(true);
  expect(evidence.counts.clicks).toBe(0);
  expect(evidence.counts.replays).toBe(0);
  expect(evidence.after.currentDocumentAuthority).toEqual(evidence.before.currentDocumentAuthority);
  expect(evidence.remainingRequestListeners).toBe(0);
  expect(evidence.remainingResponseWaiters).toBe(0);
  expect(evidence.observed?.sourceAfter).toMatchObject({ live: true });
  expect(evidence.outcome.status, JSON.stringify(evidence.observed)).toBe('completed');
  expect(evidence.postReceiptMemberReads).toBe(1);
  expect(evidence.renderedStatuses.some(text => text?.includes('Shuttle arrived at Icebreaker.'))).toBe(true);
});

it('the real arrival success receipt remains visible when its private-safe current member projection follows the deleted movement', async () => {
  const fixture = await originalRetargetedFixture();
  const evidence = await automaticCapture(fixture);
  // The unmodified normal five-second feed, not a fixture projection or added
  // confirmation, delivers the genuine completion writer's docking/history.
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  const current = await recipes.readActionState(fixture.surface, SHUTTLE);
  expect(current.currentDocumentAuthority).toEqual(fixture.before.currentDocumentAuthority);
  expect((current.shuttleDockings as Fields[]).filter(row => row.shuttleId === SHUTTLE)).toEqual([
    { shuttleId: SHUTTLE, shipId: RETARGET_DESTINATION,
      dockedAt: (evidence.transport[0]!.result as Fields).arrivedAt },
  ]);
  expect((current.shuttleVisitLog as Fields[]).filter(row => row.shuttleId === SHUTTLE)).toHaveLength(2);
  expect(screen.queryAllByRole('status').some(node => node.textContent?.includes('Shuttle arrived at Icebreaker.'))).toBe(true);
});

it.each(['generation', 'hydration', 'uid', 'session', 'auth', 'holder', 'control', 'group', 'role', 'cache',
  'reconnect', 'cycle', 'document', 'checkpoint', 'another-trip'])(
  'the real arrival receipt cannot survive original %s authority drift while the writer completes', async drift => {
    const fixture = await originalRetargetedFixture();
    io.afterArrival = async () => {
      const current = useSessionStore.getState();
      if (drift === 'generation') current.setMe({ ...current.me!, connectionGeneration: 3 });
      if (drift === 'hydration') current.setIdentity(current.session!, current.me!);
      if (drift === 'uid') current.setMe({ ...current.me!, uid: 'foreign-holder' });
      if (drift === 'session') current.setMe({ ...current.me!, sessionId: 'foreign-session' });
      if (drift === 'auth') io.auth.currentUser = { uid: 'foreign-auth' };
      if (drift === 'group') current.setMe({ ...current.me!, fleetGroupId: 'fleet-2' });
      if (drift === 'role') current.setMe({ ...current.me!, activeConsoleRoleId: 'dione-captain' });
      if (drift === 'cache') current.setSessionSnapshotFreshness('cache');
      if (drift === 'reconnect') current.setConnection('connecting');
      if (drift === 'cycle') current.setSession({ ...current.session!, currentTurn: 2 });
      if (drift === 'document') {
        const changedPerformance = Object.create(globalThis.performance) as Performance;
        Object.defineProperty(changedPerformance, 'timeOrigin', { value: globalThis.performance.timeOrigin + 1 });
        vi.stubGlobal('performance', changedPerformance);
      }
      if (drift === 'checkpoint') {
        const session = source.sessionFrom(SESSION, io.documents.get(ROOT)!);
        assert.equal(acceptCallableSessionAuthority(session, UID), true);
      }
      if (drift === 'another-trip') await requestHandler.run(call({ sessionId: SESSION,
        requestId: 'native-other-trip', shuttleId: SHUTTLE, destinationShipId: HOST,
        expectedControlRevision: 0, expectedCycle: 1 }));
      if (drift === 'holder' || drift === 'control') {
        const control = current.session!.shuttleControl![SHUTTLE]!;
        current.setSession({ ...current.session!, shuttleControl: { ...current.session!.shuttleControl,
          [SHUTTLE]: { ...control, ...(drift === 'holder' ? { holderUid: 'foreign-holder' } : { revision: 1 }) } } });
      }
    };
    const evidence = await automaticCapture(fixture);
    expect(evidence.transport).toHaveLength(1);
    expect(evidence.transport[0]).toMatchObject({ httpStatus: 200, result: { status: 'arrived' } });
    expect(evidence.outcome.status).toBe('pending');
    expect(evidence.counts.clicks).toBe(0);
    expect(evidence.counts.replays).toBe(0);
    expect(evidence.renderedStatuses.some(text => text?.includes('Shuttle arrived at Icebreaker.'))).toBe(false);
  },
);

it.each(['generation', 'hydration', 'uid', 'cancelled', 'closed'])(
  'post-receipt confirmation rejects %s feed authority drift during its real member read', async drift => {
    const fixture = await originalRetargetedFixture();
    io.beforeMemberReply = () => {
      if (io.calls.at(-2) !== 'completeShuttleArrival') return;
      const current = useSessionStore.getState();
      if (drift === 'generation') current.setMe({ ...current.me!, connectionGeneration: 3 });
      if (drift === 'hydration') current.setIdentity(current.session!, current.me!);
      if (drift === 'uid') io.auth.currentUser = { uid: 'foreign-auth' };
      if (drift === 'closed') current.setSession({ ...current.session!, phase: 'closed' });
      if (drift === 'cancelled') { stop?.(); stop = undefined; }
    };
    const evidence = await automaticCapture(fixture);
    expect(evidence.transport).toHaveLength(1);
    expect(evidence.transport[0]).toMatchObject({ httpStatus: 200, result: { status: 'arrived' } });
    expect(evidence.outcome.status).toBe('pending');
    expect(evidence.counts.clicks).toBe(0);
    expect(evidence.counts.replays).toBe(0);
    expect(evidence.postReceiptMemberReads).toBe(1);
  },
);
