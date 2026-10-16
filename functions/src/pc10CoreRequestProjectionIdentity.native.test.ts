// @vitest-environment jsdom
import assert from 'node:assert/strict';
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
    create: (ref: ReturnType<typeof reference>, value: Fields) => {
      if (documents.has(ref.path)) throw new Error(`Duplicate native document ${ref.path}`);
      documents.set(ref.path, { ...value });
    },
  });
  return { documents, listeners, calls, snapshot, reference,
    auth: { currentUser: { uid: 'native-core-request-holder' } as { uid: string } | null },
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
    return { data: await io.dispatch(endpoint, data) };
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
    return () => { if (io.listeners.get(ref.path) === next) io.listeners.delete(ref.path); };
  },
}));
vi.mock('../../src/lib/firebase', () => ({ app: () => ({}), functions: () => ({}), auth: () => io.auth }));
vi.mock('../../src/lib/firebaseConfig', () => ({ useEmulators: false, emulatorPorts: { firestore: 8080 } }));

const { requestShuttleDeparture: requestHandler, getCurrentMemberSession } = await import('./index');
const { requestShuttleDeparture: requestClient } = await import('../../src/lib/shuttleDepartureService');
const consumer = await import('../../src/lib/firestore');
// Distinct real-source ESM URLs reproduce the App/proof module-identity seam.
const source: typeof consumer = await import('../../src/lib/firestore.ts?pc10AppImportOwner');
const { useSessionStore } = await import('@/store/useSessionStore');
const { stripGmNavigationProjection } = await import('../../src/lib/navigationPrivacy');
const { isWireSafeEntityId } = await import('../../src/types/identifiers');
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
const SESSION = 'native-core-request-projection';
const UID = 'native-core-request-holder';
const HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ROOT = `sessions/${SESSION}`;
const ROLE = 'wing-commander';
const SHUTTLE = 'starlight';
const HOST = 'aegis';
const DESTINATION = 'icebreaker';
const GROUP = 'fleet-1';
let lastRequest: Fields | undefined;
let lastResult: unknown;
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
  io.documents.clear(); io.listeners.clear(); io.calls.length = 0;
  io.auth.currentUser = { uid: UID };
  useSessionStore.getState().reset();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const now = Date.now();
  io.documents.set(ROOT, { id: SESSION, name: 'Native source', joinCode: 'NATIVE', phase: 'active', currentTurn: 1,
    activeRoleIds: [ROLE, 'icebreaker-miner'], activeVesselIds: [HOST, DESTINATION],
    turnPhase: { turn: 1, teamPhaseEndsAt: new Date(now - 60_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 600_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    shuttleDockings: [{ shuttleId: 'snn-press-shuttle', shipId: HOST, dockedAt: 'SESSION START' },
      { shuttleId: SHUTTLE, shipId: HOST, dockedAt: 'SESSION START' },
      { shuttleId: 'highwall', shipId: DESTINATION, dockedAt: 'SESSION START' }],
    shuttleVisitLog: [], shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, ownerRoleId: ROLE,
      ownerUid: UID, holderUid: UID, revision: 0 } },
    createdAt: new Date(now - 120_000).toISOString(), updatedAt: new Date(now - 60_000).toISOString() });
  io.documents.set(`${ROOT}/players/${UID}`, { ...actor });
  io.documents.set(`${ROOT}/fleetGroups/${GROUP}`, { id: GROUP, vesselIds: [HOST, DESTINATION],
    memberUids: [UID], memberShipIds: { [UID]: HOST } });
  lastRequest = undefined; lastResult = undefined;
  io.dispatch.mockImplementation(async (endpoint: string, data: Fields) => {
    if (endpoint === 'getCurrentMemberSession') return getCurrentMemberSession.run(call(data));
    if (endpoint === 'requestShuttleDeparture') {
      lastRequest = data; lastResult = await requestHandler.run(call(data)); return lastResult;
    }
    throw new Error(`Unexpected native SDK operation ${endpoint}`);
  });
});
afterEach(() => {
  process.stderr.write(`Native source stage: ${stage}; operations: ${JSON.stringify(io.calls)}\n`);
  stop?.(); stop = undefined; vi.useRealTimers(); useSessionStore.getState().reset();
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
    fleetGroupVesselIds: [HOST, DESTINATION], revision: 1, currentCoordinate: '0000',
    knownCoordinates: ['0000'], knownSystems: {}, navigationLogs: [], pursuitDistance: 1 });
  stage = 'member-feed-awaiting-first-publication';
  await published;
  stage = 'member-feed-published';
  // The publication callback has accepted the transaction and scheduled only
  // the existing timer. No timer, gameplay clock or observer poll is advanced.
  assert.equal(useSessionStore.getState().session?.playerDiscovery?.groupId, GROUP);
}


function serializedSurface(readStore = useSessionStore) {
  const counts = { movementReads: 0, clicks: 0, replays: 0 };
  const moduleImport = async (url: string) => {
    if (url === '/src/store/useSessionStore.ts') return { useSessionStore: readStore };
    if (url === '/src/lib/firebase.ts') return { auth: () => io.auth };
    if (url === '/src/lib/firestore.ts') return consumer;
    if (url.includes('firebase_firestore.js')) return {
      doc: (_db: unknown, path: string) => path,
      getDoc: async (path: string) => {
        counts.movementReads++;
        const value = io.documents.get(path);
        return { exists: () => value !== undefined, data: () => value };
      },
    };
    throw new Error(`Unexpected serialized native source ${url}`);
  };
  const observedActor = { sessionId: SESSION, uidHash: HASH, profileRoleId: ROLE,
    activeConsoleRoleId: ROLE, assignedRoleId: ROLE, playerRole: 'player', sameActor: true,
    connection: 'live', freshness: 'server' };
  const response = { request: () => ({ method: () => 'POST',
    url: () => 'http://native.invalid/us-central1/requestShuttleDeparture', postDataJSON: () => ({ data: lastRequest }) }),
    url: () => 'http://native.invalid/us-central1/requestShuttleDeparture', status: () => 200, ok: () => true,
    json: async () => ({ result: lastResult }) };
  const button = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => { counts.clicks++; await requestClient(SHUTTLE, DESTINATION, 0, 1); } };
  const empty = { count: async () => 0 };
  const select = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    selectOption: async (value: string) => { assert.equal(value, DESTINATION); },
    locator: () => ({ evaluateAll: (run: (options: Fields[]) => unknown) =>
      run([{ value: DESTINATION, textContent: 'Icebreaker', disabled: false }]) }) };
  const page = {
    evaluate: async (callback: (input: unknown) => unknown, input: unknown) =>
      new Function('moduleImport', 'fetch', 'crypto', 'input',
        `return (${callback.toString().replace(/\bimport\s*\(/g, 'moduleImport(')})(input);`)(
        moduleImport, async () => ({ text: async () => 'import { getDoc } from "firebase_firestore.js";' }), webcrypto, input),
    url: () => `http://native.invalid/#/shuttles/${SHUTTLE}`,
    on: vi.fn(), off: vi.fn(), locator: () => empty,
    waitForResponse: async () => response,
    getByRole: (role: string, options: { name?: string; exact?: boolean } = {}) => role === 'status'
      ? { allTextContents: async () => lastResult ? ['Departure requested.'] : [] }
      : role === 'region' && options.name === 'Shuttle departure' && options.exact
        ? { getByLabel: () => select,
          getByRole: (_role: string, child: { name: string }) => child.name === 'Request departure' ? button : empty } : empty,
  };
  const surface = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => observedActor,
    callable: async (endpoint: string, payload: Fields) => {
      assert.equal(endpoint, 'requestShuttleDeparture'); assert.deepEqual(payload, lastRequest); counts.replays++;
      return { status: 'committed', result: await requestHandler.run(call(payload)) };
    } };
  return { surface, counts };
}

async function captureRequest() {
  await startFeed();
  assert.notEqual(source, consumer, 'Different ESM URLs create distinct real source module instances');
  assert.notEqual(source.confirmCurrentMemberSessionProjection, consumer.confirmCurrentMemberSessionProjection);
  expect(await source.confirmCurrentMemberSessionProjection(SESSION, UID)).toBe(true);
  const { surface, counts } = serializedSurface();
  const before = await recipes.readActionState(surface, SHUTTLE);
  // The custody-only GM reader uses the real header parser and the group
  // documents that authorize the member DTO. It does not supply a post-action
  // member tuple, patch member state, or replace any source predicate.
  const gmStore = { getState: () => ({ ...useSessionStore.getState(), session: {
    ...source.sessionFrom(SESSION, io.documents.get(ROOT)!),
    shipFleetGroupIds: Object.fromEntries([...io.documents.entries()]
      .filter(([path]) => path.startsWith(`${ROOT}/fleetGroups/`))
      .flatMap(([, group]) => (group.vesselIds as string[]).map(shipId => [shipId, group.id]))),
  } }) } as typeof useSessionStore;
  const gmReader = serializedSurface(gmStore).surface;
  const gmSurface = { ...gmReader, observe: async () => ({ sessionId: SESSION, uidHash: 'd013f0dced1cf943',
    profileRoleId: 'gm', activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm',
    instanceId: 'native-owned-gm', gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' }) };
  const game = { select: async (role: string) => role === 'gm' ? gmSurface : surface,
    state: async () => ({ live: true, sessionId: SESSION, cycle: 1, phase: 'active', revision: 0, groupId: GROUP,
      activeVesselIds: [HOST, DESTINATION], shuttleControl: io.documents.get(ROOT)!.shuttleControl,
      shuttleDockings: io.documents.get(ROOT)!.shuttleDockings,
      shipFleetGroupIds: { [HOST]: GROUP, [DESTINATION]: GROUP } }) };
  const context = { initial: { sessionId: SESSION }, roster: [{ roleId: ROLE, uidHash: HASH }],
    shuttleOriginAuthority: { sessionId: SESSION, uidHash: HASH, shuttleId: SHUTTLE, groupId: GROUP,
      cycle: 1, controlRevision: 0, sourceAuthority: before.currentDocumentAuthority },
    shuttleOriginHostShipId: HOST, shuttleSourceDiagnosticOnly: true };
  const plan = await recipes.createPendingProcedureDefaultSteps()['core:requestShuttleDeparture']!({ context, game });
  const readsBefore = io.calls.filter(value => value === 'getCurrentMemberSession').length;
  const outcome = await proof.captureMountedProcedureAction({ context, game, caseId: 'core:requestShuttleDeparture', ...plan });
  const after = await recipes.readActionState(surface, SHUTTLE);
  const evidence = { counts,
    memberReadsAfterAction: io.calls.filter(value => value === 'getCurrentMemberSession').length - readsBefore,
    sourcePremise: { sameRealSourceDifferentEsmModules: source !== consumer,
      originalAppFeedWasConfirmed: true, originalAuthorityStillReadableAfterRequest: !!after?.currentDocumentAuthority,
      handlerMovement: io.documents.get(`${ROOT}/shuttleDepartures/${SHUTTLE}`) }, before, after, outcome };
  if (process.env.PC10_CORE_REQUEST_NATIVE_EVIDENCE) await writeFile(process.env.PC10_CORE_REQUEST_NATIVE_EVIDENCE,
    JSON.stringify(evidence, null, 2));
  return evidence;
}

it('Core Request confirms the owned real member feed through the current public reader across distinct source ESM imports', async () => {
  const { counts, before, after, outcome, sourcePremise, memberReadsAfterAction } = await captureRequest();
  expect(counts).toMatchObject({ clicks: 1, replays: 1 });
  expect(sourcePremise.handlerMovement).toMatchObject({ status: 'requested', shuttleId: SHUTTLE,
    holderUid: UID, fleetGroupId: GROUP, originShipId: HOST, destinationShipId: DESTINATION, cycle: 1, controlRevision: 0 });
  expect(after.currentDocumentAuthority).toEqual(before.currentDocumentAuthority);
  expect(outcome.status, JSON.stringify(outcome.sourceDiagnosticOnly)).toBe('completed');
  expect(memberReadsAfterAction).toBe(1);
  expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
});

function heldMemberRead() {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  io.dispatch.mockImplementationOnce(async (endpoint: string, data: Fields) => {
    assert.equal(endpoint, 'getCurrentMemberSession');
    const response = await getCurrentMemberSession.run(call(data));
    entered(); await pending; return response;
  });
  return { started, release };
}

it('a replacement feed imported through another source URL cancels the original confirmation without changing HY', async () => {
  await startFeed();
  const held = heldMemberRead();
  const pending = source.confirmCurrentMemberSessionProjection(SESSION, UID);
  await held.started;
  const oldStop = stop;
  try {
    await startFeed(consumer, false);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    held.release();
    expect(await pending).toBe(false);
    oldStop?.();
    expect(await consumer.confirmCurrentMemberSessionProjection(SESSION, UID)).toBe(true);
  } finally { held.release(); oldStop?.(); }
});

it('a previous source-module player callback cannot replace the newer owned feed generation', async () => {
  await startFeed();
  const oldPlayerCallback = io.listeners.get(`${ROOT}/players/${UID}`)!;
  const oldStop = stop;
  try {
    await startFeed(consumer, false);
    const stalePlayer = { ...actor, connectionGeneration: 3 };
    oldPlayerCallback({ exists: () => true, metadata: { fromCache: false }, data: () => stalePlayer,
      get: (key: keyof Player) => stalePlayer[key] });
    expect(useSessionStore.getState().me?.connectionGeneration).toBe(2);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    oldStop?.();
    expect(await consumer.confirmCurrentMemberSessionProjection(SESSION, UID)).toBe(true);
  } finally { oldStop?.(); }
});

it('bare source confirmation keeps Auth UID, freshness and disconnected-profile rejection across import URLs', async () => {
  await startFeed();
  const readsBefore = io.calls.length;
  io.auth.currentUser = { uid: 'foreign-native-auth' };
  expect(await consumer.confirmCurrentMemberSessionProjection(SESSION, UID)).toBe(false);
  io.auth.currentUser = { uid: UID };
  useSessionStore.getState().setSessionSnapshotFreshness('unknown');
  expect(await consumer.confirmCurrentMemberSessionProjection(SESSION, UID)).toBe(false);
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setMe({ ...actor, connected: false });
  expect(await consumer.confirmCurrentMemberSessionProjection(SESSION, UID)).toBe(false);
  expect(io.calls.length).toBe(readsBefore);
});
