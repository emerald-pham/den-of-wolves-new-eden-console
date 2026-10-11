import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const proofPath = fileURLToPath(new URL('../pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
const proof = await readFile(proofPath, 'utf8');
const firestorePath = fileURLToPath(new URL('../../src/lib/firestore.ts', import.meta.url));
const firestore = await readFile(firestorePath, 'utf8');
const storePath = fileURLToPath(new URL('../../src/store/useSessionStore.ts', import.meta.url));
const storeSource = await readFile(storePath, 'utf8');
const sessionServicePath = fileURLToPath(new URL('../../src/lib/sessionService.ts', import.meta.url));
const sessionServiceSource = await readFile(sessionServicePath, 'utf8');
const appPath = fileURLToPath(new URL('../../src/App.tsx', import.meta.url));
const appSource = await readFile(appPath, 'utf8');
const sessionAuthorityPath = fileURLToPath(new URL('../../src/lib/sessionSnapshotAuthority.ts', import.meta.url));
const sessionAuthoritySource = await readFile(sessionAuthorityPath, 'utf8');
const zustandPath = fileURLToPath(new URL('../../node_modules/zustand/vanilla.js', import.meta.url));
const zustandSource = await readFile(zustandPath, 'utf8');
const zustandSourceHash = createHash('sha256').update(zustandSource).digest('hex');
assert.equal(zustandSourceHash, '11b4ba22fadad3a5fe89438615c2099d4a839f64691c9435e46e0b2e793b9b08',
  'Bind the installed Zustand setter/listener behavior used by these reentrant cases.');

function sourceRegion(source, startText, endText, description) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, 'Bind actual ' + description + ' source.');
  return source.slice(start, end);
}

function sourceRegionAt(source, startText, endText, from, description) {
  const start = source.indexOf(startText, from);
  const end = source.indexOf(endText, start);
  assert.ok(start >= from && end > start, 'Bind actual ' + description + ' source.');
  return source.slice(start, end);
}

const observerSource = sourceRegion(proof,
  'export async function observeP181StarlightSource(',
  '\n}\n\n/** Bind the bounded Starlight flow', 'P181 mounted source observer').trim()
  .replace(/^export /, '').replace(/\bimport\s*\(/g, 'load(') + '\n}';
const browserIoStart = proof.indexOf('export function createP181StarlightBrowserIo(');
const snapshotStart = proof.indexOf('  const snapshot = deadlineAt =>', browserIoStart);
const snapshotEnd = proof.indexOf('\n  const callable = async', snapshotStart);
assert.ok(browserIoStart >= 0 && snapshotStart > browserIoStart && snapshotEnd > snapshotStart,
  'Bind the actual browser I/O source-observation call site.');
const snapshotConsumerSource = proof.slice(snapshotStart, snapshotEnd);

const movementReaderBody = sourceRegion(firestore,
  'export function subscribeShuttleDeparture(',
  '\n}\n\n/** Subscribe to the exact holder\'s current private Intelligence Agent report.',
  'production subscribeShuttleDeparture contract');
const movementReaderStart = movementReaderBody.indexOf('  let subscribed = true;');
assert.ok(movementReaderStart >= 0, 'Bind the actual production flight-listener body.');

const parserBody = sourceRegion(firestore,
  'function shuttleDeparture(value: unknown, shuttleId: string): ShuttleMovementState | null {',
  '\n}\n\nfunction shipUpgrades', 'production shuttleDeparture parser');
const parserBodyStart = parserBody.indexOf('  const raw = recordValue(value);');
assert.ok(parserBodyStart >= 0, 'Bind the actual movement parser body.');
const pointBody = sourceRegion(firestore,
  'function shuttlePoint(value: unknown): ShuttleTransitState[\'currentPosition\'] | null {',
  '\n}\n\nfunction shuttleDeparture', 'production transit-position parser');
const pointBodyStart = pointBody.indexOf('  const raw = recordValue(value);');
assert.ok(pointBodyStart >= 0, 'Bind the actual transit-position parser body.');

const recordValue = value => typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
const parseEntityId = (_kind, value) => typeof value === 'string' && value.length > 0 &&
  value.length <= 1500 && !value.includes('/') ? value : undefined;
const shuttlePoint = new Function('recordValue',
  'return function shuttlePoint(value) {' + pointBody.slice(pointBodyStart).replace(/\s+as number/g, '') + '\n};')(
  recordValue);
const shuttleDeparture = new Function('recordValue', 'parseEntityId', 'SHUTTLECRAFT', 'shuttlePoint',
  'return function shuttleDeparture(value, shuttleId) {' +
  parserBody.slice(parserBodyStart).replace(/\s+as (?:number|const)/g, '') + '\n};')(
    recordValue, parseEntityId, [{ id: 'starlight' }], shuttlePoint);

const makeProductionReader = deps => new Function('deps',
  'const { onSnapshot, doc, db, shuttleDeparture } = deps; return function subscribeShuttleDeparture(' +
  'sessionId, shuttleId, onDeparture, onError = () => undefined) {' +
  movementReaderBody.slice(movementReaderStart) + '\n};')(deps);

const zustandSetterStart = zustandSource.indexOf('var createStoreImpl =');
const zustandSetterEnd = zustandSource.indexOf('\nvar createStore =', zustandSetterStart);
assert.ok(zustandSetterStart >= 0 && zustandSetterEnd > zustandSetterStart,
  'Bind the installed Zustand createStoreImpl setter/listener source.');
const zustandSetterSource = zustandSource.slice(zustandSetterStart, zustandSetterEnd);
const installedZustandCreateStore = runInNewContext('(() => {' + zustandSetterSource +
  '\nreturn createStoreImpl;})()', { Set, Object });
function actualInstalledZustandStore(initialState) {
  const store = installedZustandCreateStore(() => initialState);
  // The existing focused harness reads this test-only alias; observer calls use
  // the actual installed Zustand getState/subscribe/setState methods above.
  store.state = store.getState;
  return store;
}

// Whitelisted from the saved native 0555 normal-member DTO at
// /tmp/dow-pc10-evidence/p181-74e32ca3-sequenced-immediate-dispatch-next-20261011/member-navigation/fcf74766-f716-4290-b536-78b0ab2adc4f.json
// (4,580 bytes, SHA-256 8bccd4e02b5cfc5cfaa674e536e5dd54b13a4d0093c9e6d636c1bf936fbd5bd4,
// currentBinding). Raw UID/session ID are not copied: both are replaced by
// test-only aliases. The record is an original normal-member DTO, not a full
// raw GameSession, canonical-seat proof, phase/cycle snapshot, or SDK authority
// tuple; unknown values stay absent. currentOwnPlayerConfirmed is a separate
// derived DTO output and is not copied into SessionState. The saved
// currentBinding.connected value is copied only to the supported Player.connected field.
const SAVED_0555_MEMBER_DTO = Object.freeze({
  provenanceStatus: 'selected-current-original-member',
  hasAuth: true,
  sameActor: true,
  playerRole: 'player',
  assignedRoleId: 'wing-commander',
  activeConsoleRoleId: null,
  seatId: null,
  fleetGroupId: 'fleet-1',
  connected: true,
  connectionGeneration: 2,
  identityHydrationRevision: 2,
  connection: 'live',
  freshness: 'server',
  sdkHasServerAuthority: undefined,
  sdkResumePending: undefined,
});

const SAVED_MEMBER_SESSION_ALIAS = 'saved-native-session-alias';
const SAVED_MEMBER_UID_ALIAS = 'saved-native-original-uid-alias';

function rawSessionStateFromSavedMemberDto(dto = SAVED_0555_MEMBER_DTO) {
  return {
    session: { id: SAVED_MEMBER_SESSION_ALIAS },
    me: {
      uid: SAVED_MEMBER_UID_ALIAS,
      sessionId: SAVED_MEMBER_SESSION_ALIAS,
      role: dto.playerRole,
      assignedRoleId: dto.assignedRoleId,
      activeConsoleRoleId: dto.activeConsoleRoleId,
      seatId: dto.seatId,
      fleetGroupId: dto.fleetGroupId,
      connected: dto.connected,
      connectionGeneration: dto.connectionGeneration,
    },
    identityHydrationRevision: dto.identityHydrationRevision,
    connection: dto.connection,
    sessionSnapshotFreshness: dto.freshness,
  };
}

// Execute the actual store setter bodies plus the accepted normal-resume call
// sites from sessionService. Only the Zustand merge and irrelevant helper
// behavior are represented locally; no app/provider module is imported.
const setIdentitySource = sourceRegion(storeSource,
  '      setIdentity: (session, me) =>', '      setSeats:', 'SessionState.setIdentity setter');
const setConnectionSource = sourceRegion(storeSource,
  '      setConnection: (connection) => {', '      setSessionSnapshotFreshness:', 'SessionState.setConnection setter');
const setFreshnessSource = sourceRegion(storeSource,
  '      setSessionSnapshotFreshness: (sessionSnapshotFreshness) => {',
  '      setVoyage33MovementProjectionFresh:', 'SessionState.setSessionSnapshotFreshness setter');
const clearMovementHelperSource = sourceRegion(storeSource,
  'function clearVoyageMovement(session: GameSession | null): GameSession | null {',
  'function normalizePersistedSession', 'clearVoyageMovement helper')
  .replace('function clearVoyageMovement(session: GameSession | null): GameSession | null {',
    'function clearVoyageMovement(session) {');
const sameAssignmentHelperSource = sourceRegion(storeSource,
  'function samePrivateAssignment(previous: Player | null, next: Player | null): boolean {',
  'export const useSessionStore', 'samePrivateAssignment helper')
  .replace('function samePrivateAssignment(previous: Player | null, next: Player | null): boolean {',
    'function samePrivateAssignment(previous, next) {');
const clearVoyageMovement = new Function(`${clearMovementHelperSource}; return clearVoyageMovement;`)();
const samePrivateAssignment = new Function(`${sameAssignmentHelperSource}; return samePrivateAssignment;`)();
const connectWithRetryStart = sessionServiceSource.indexOf('async function connectWithRetryPolicy(');
const markConnectingSource = sourceRegionAt(sessionServiceSource,
  "    store.setConnection('connecting');", '    const rememberedSession = store.session;',
  connectWithRetryStart, 'normal connect connecting transition');
const markCacheSource = sourceRegionAt(sessionServiceSource,
  "      store.setSessionSnapshotFreshness('cache');", '      try {',
  connectWithRetryStart, 'normal reconnect cache transition');
const applySessionStart = sessionServiceSource.indexOf('function applySession(');
const acceptedResumeCallsSource = sourceRegionAt(sessionServiceSource,
  '    store.setIdentity(acceptedSession, reply.player);',
  '    if (reply.stationSelectionRequired === true)',
  applySessionStart, 'accepted normal resume identity/freshness setters');
const promoteLiveSource = sourceRegionAt(sessionServiceSource,
  '    const latest = useSessionStore.getState();', '\n  } catch (cause) {',
  connectWithRetryStart, 'accepted normal resume live-promotion branch');

// Bind the actual current App listener predicate and its freshness transition.
// The callback is deliberately cut at its two store authority setters; unrelated
// App projections are outside this observer test.
const appCurrentStart = appSource.indexOf('    const callbackCurrent = () =>');
const appCurrentEnd = appSource.indexOf('\n    let pendingRoleBrief', appCurrentStart);
assert.ok(appCurrentStart >= 0 && appCurrentEnd > appCurrentStart,
  'Bind the production App listener-current predicate.');
const appCurrentSource = appSource.slice(appCurrentStart, appCurrentEnd).trim();
const appFreshnessStart = appSource.indexOf('        onSessionFreshness: (fresh) => {');
const appFreshnessSetter = "          store.setSessionSnapshotFreshness(fresh ? 'server' : 'cache');";
const appFreshnessSetterEnd = appSource.indexOf(appFreshnessSetter, appFreshnessStart);
assert.ok(appFreshnessStart >= 0 && appFreshnessSetterEnd > appFreshnessStart,
  'Bind the production App session-freshness authority transition.');
const appFreshnessOpen = appSource.indexOf('{', appFreshnessStart);
const appFreshnessBody = appSource.slice(appFreshnessOpen + 1,
  appFreshnessSetterEnd + appFreshnessSetter.length);

const authorityMapSource = sourceRegion(sessionAuthoritySource,
  'const sessionSnapshotAuthorities = new Map<string, SessionSnapshotAuthority>();',
  '\n\n// A member feed can confirm current content before the normal resume SDK',
  'session authority lookup map')
  .replace('const sessionSnapshotAuthorities = new Map<string, SessionSnapshotAuthority>();',
    'const sessionSnapshotAuthorities = new Map();');
const createSessionAuthoritySource = sourceRegion(sessionAuthoritySource,
  'export function createSessionSnapshotAuthority()', '\n}\n\nexport function sessionSnapshotAuthorityVersion',
  'production session authority constructor')
  .replace(/^export function createSessionSnapshotAuthority\(\): SessionSnapshotAuthority \{/,
    'function createSessionSnapshotAuthority() {') + '\n}';
const sessionAuthorityForSource = sourceRegion(sessionAuthoritySource,
  'export function sessionSnapshotAuthorityFor(', '\n}\n\nfunction cursorFromMillis',
  'production session authority lookup')
  .replace(/export function sessionSnapshotAuthorityFor\(\s*sessionId: string,\s*uid: string,\s*\): SessionSnapshotAuthority \{/,
    'function sessionSnapshotAuthorityFor(sessionId, uid) {') + '\n}';
const memberResumeTokensSource = sourceRegion(sessionAuthoritySource,
  'const memberResumeTokens = new WeakMap<SessionSnapshotAuthority, symbol>();',
  '\nexport function beginMemberSessionResume', 'production member-resume token state')
  .replace('const memberResumeTokens = new WeakMap<SessionSnapshotAuthority, symbol>();',
    'const memberResumeTokens = new WeakMap();');
const beginMemberResumeSource = sourceRegion(sessionAuthoritySource,
  'export function beginMemberSessionResume(', '\n}\n\nexport function isCurrentMemberSessionResume',
  'production member-resume barrier').replace(
    /export function beginMemberSessionResume\(authority: SessionSnapshotAuthority\): symbol \{/,
    'function beginMemberSessionResume(authority) {') + '\n}';
const memberResumeBlocksSource = sourceRegion(sessionAuthoritySource,
  'export function memberSessionResumeBlocksFreshness(', '\n}\n\n/** One authority object',
  'production member-resume freshness barrier').replace(
    /export function memberSessionResumeBlocksFreshness\(authority: SessionSnapshotAuthority\): boolean \{/,
    'function memberSessionResumeBlocksFreshness(authority) {') + '\n}';

function makeProductionSessionAuthorityRuntime() {
  return new Function(`${authorityMapSource}; ${memberResumeTokensSource}; ${createSessionAuthoritySource}; ` +
    `${sessionAuthorityForSource}; ${beginMemberResumeSource}; ${memberResumeBlocksSource}; ` +
    'return { sessionSnapshotAuthorityFor, beginMemberSessionResume, memberSessionResumeBlocksFreshness };')();
}

function makeProductionAppFreshnessHandler(useSessionStore, authorityRuntime, {
  current = true, sessionId = SAVED_MEMBER_SESSION_ALIAS, uid = SAVED_MEMBER_UID_ALIAS,
  playerRole = 'player',
} = {}) {
  const appRoutesMounted = { current };
  const playerListenerGeneration = { current: 7 };
  const listenerGeneration = 7;
  const active = true;
  const gmInstanceId = 'gm-instance-test-alias';
  const callbackCurrent = new Function('active', 'appRoutesMounted', 'playerListenerGeneration',
    'listenerGeneration', 'useSessionStore', 'gmInstanceId',
    `${appCurrentSource}; return callbackCurrent;`)(active, appRoutesMounted,
      playerListenerGeneration, listenerGeneration, useSessionStore, gmInstanceId);
  return new Function('callbackCurrent', 'pendingStationMemberRefresh', 'useSessionStore',
    'playerRole', 'memberSessionResumeBlocksFreshness', 'sessionSnapshotAuthorityFor',
    'sessionId', 'playerUid', `return function onSessionFreshness(fresh) {${appFreshnessBody}\n};`)(
      callbackCurrent, undefined, useSessionStore, playerRole,
      authorityRuntime.memberSessionResumeBlocksFreshness,
      authorityRuntime.sessionSnapshotAuthorityFor, sessionId, uid);
}

function actualSessionStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  const set = update => {
    const previous = state;
    const patch = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener(state, previous);
  };
  const get = () => state;
  const compile = (body, name) => new Function('set', 'get', 'clearVoyageMovement', 'samePrivateAssignment',
    `return ({${body}\n})[${JSON.stringify(name)}];`)(set, get, clearVoyageMovement, samePrivateAssignment);
  const actions = {
    setIdentity: compile(setIdentitySource, 'setIdentity'),
    setConnection: compile(setConnectionSource, 'setConnection'),
    setSessionSnapshotFreshness: compile(setFreshnessSource, 'setSessionSnapshotFreshness'),
  };
  return {
    get session() { return state.session; },
    ...actions,
    getState: () => ({ ...state, ...actions }),
    state: () => state,
    setState: set,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    subscriberCount: () => listeners.size,
  };
}

function applyAcceptedNormalResume(store, acceptedSession, reply) {
  const acceptedBlock = `if (acceptedByAuthority) {\n${acceptedResumeCallsSource}\n}`;
  new Function('store', 'acceptedSession', 'reply', 'acceptedByAuthority', acceptedBlock)(
    store, acceptedSession, reply, true);
  const useSessionStore = { getState: () => store.getState() };
  new Function('useSessionStore', promoteLiveSource)(useSessionStore);
  return store.state();
}

function beginNormalResume(store) {
  new Function('store', markConnectingSource)(store);
  new Function('store', markCacheSource)(store);
  return store.state();
}

function normalResumeDataFromSavedMemberDto() {
  const state = rawSessionStateFromSavedMemberDto();
  return {
    acceptedSession: state.session,
    reply: {
      player: state.me,
      stationSelectionRequired: false,
    },
  };
}

function baseState() {
  return {
    session: { id: 'normal-session-a', phase: 'active', currentTurn: 1,
      shuttleDockings: [], shuttleControl: { starlight: { shuttleId: 'starlight', revision: 0 } } },
    me: { uid: 'wing-uid-a', sessionId: 'normal-session-a', role: 'player',
      assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', seatId: 'wing-commander',
      connectionGeneration: 3, fleetGroupId: 'fleet-1' },
    identityHydrationRevision: 3,
    connection: 'live', sessionSnapshotFreshness: 'server',
    currentOwnPlayerConfirmed: true, sdkHasServerAuthority: true,
  };
}

function requestedMovement(overrides = {}) {
  return {
    status: 'requested', requestId: 'request-original-1', shuttleId: 'starlight',
    holderUid: 'wing-uid-a', fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 1, controlRevision: 0,
    requestedAt: '2026-10-11T06:06:35.829Z', ...overrides,
  };
}

function transitMovement(overrides = {}) {
  return {
    status: 'in-transit', requestId: 'request-original-1', shuttleId: 'starlight',
    holderUid: 'wing-uid-a', fleetGroupId: 'fleet-1', destinationShipId: 'icebreaker',
    cycle: 1, controlRevision: 0, requestedAt: '2026-10-11T06:06:35.829Z',
    transitRequestId: 'transit-original-1', revision: 1,
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 3, y: 4, z: 5 },
    velocity: { x: 1, y: 1, z: 1 }, departedAt: '2026-10-11T06:06:40.000Z',
    arrivesAt: '2026-10-11T06:07:40.000Z', ...overrides,
  };
}

function harness({ deadlineAt = 10_000, initialState = baseState(), store: suppliedStore,
  onModuleLoad, authUser = { uid: 'wing-uid-a' }, afterDigest } = {}) {
  const clock = { now: 1_000 };
  const timers = new Map();
  let nextTimerId = 0;
  let currentState = initialState;
  const storeListeners = new Set();
  let nextSnapshot, snapshotError, onNext, onError;
  let subscribedResolve;
  const subscribed = new Promise(resolve => { subscribedResolve = resolve; });
  const observation = { subscriptions: 0, unsubscribeCount: 0, path: null, options: null,
    evaluateArgs: null, moduleLoads: [], storeSubscriptions: 0, storeUnsubscribeCount: 0 };
  const onSnapshot = (ref, options, next, error) => {
    observation.subscriptions++;
    observation.path = ref.path;
    observation.options = options;
    onNext = next;
    onError = error;
    subscribedResolve();
    return () => { observation.unsubscribeCount++; };
  };
  const reader = makeProductionReader({
    onSnapshot,
    doc: (_database, path) => ({ path }),
    db: () => ({ controlled: true }),
    shuttleDeparture,
  });
  const useSessionStore = suppliedStore ?? {
    getState: () => currentState,
    subscribe: listener => { storeListeners.add(listener); return () => storeListeners.delete(listener); },
    setState: state => {
      const previous = currentState;
      currentState = state;
      for (const listener of [...storeListeners]) listener(currentState, previous);
    },
  };
  const observerStore = {
    getState: () => useSessionStore.getState(),
    subscribe: listener => {
      observation.storeSubscriptions++;
      const stop = useSessionStore.subscribe(listener);
      return () => { observation.storeUnsubscribeCount++; stop(); };
    },
  };
  const modules = {
    '/src/lib/firebase.ts': { auth: () => ({ currentUser: authUser }) },
    '/src/lib/firestore.ts': { subscribeShuttleDeparture: reader },
    'controlled-store-module': { useSessionStore: observerStore },
  };
  let resultSettled = false;
  const load = async specifier => {
    observation.moduleLoads.push({ specifier, clock: clock.now, afterFailure: resultSettled });
    assert.ok(Object.hasOwn(modules, specifier), 'Unexpected source import: ' + specifier);
    if (onModuleLoad) return onModuleLoad(specifier, modules[specifier], { clock, observation });
    return modules[specifier];
  };
  const observer = runInNewContext('(() => {' + observerSource +
    '; return observeP181StarlightSource; })()', {
      load, crypto: { subtle: { digest: async (...args) => {
        const value = await webcrypto.subtle.digest(...args);
        afterDigest?.();
        return value;
      } } }, TextEncoder, Uint8Array, Promise, Error,
      Date: { now: () => clock.now, parse: Date.parse },
      setTimeout: (callback, delay) => {
        const timer = { id: ++nextTimerId, callback, delay };
        timers.set(timer.id, timer);
        return timer.id;
      },
      clearTimeout: id => timers.delete(id),
    });
  const surface = {
    storeModuleUrl: () => 'controlled-store-module',
    page: { evaluate: async (callback, argument) => {
      observation.evaluateArgs = [argument];
      return callback(argument);
    } },
  };
  const result = Promise.resolve().then(() => observer(surface, deadlineAt)).then(
    value => { resultSettled = true; return { value }; },
    error => { resultSettled = true; return { error }; });
  return {
    clock, timers, observation, subscribed, result,
    isSettled: () => resultSettled,
    setState: state => {
      if (suppliedStore) suppliedStore.setState(state);
      else useSessionStore.setState(state);
    },
    getState: () => suppliedStore ? suppliedStore.state() : currentState,
    emitSnapshot(data, { fromCache = false, exists = data !== null } = {}) {
      assert.equal(typeof onNext, 'function', 'The actual production subscriber must be installed before emitting a snapshot.');
      onNext({ metadata: { fromCache }, exists: () => exists, data: () => data });
    },
    emitError(error = new Error('controlled denied flight-document read')) {
      assert.equal(typeof onError, 'function', 'The actual production subscriber must be installed before emitting an error.');
      onError(error);
    },
    advanceToDeadline() {
      clock.now = deadlineAt;
      for (const timer of [...timers.values()]) timer.callback();
    },
  };
}

async function waitForSubscriptionOrCompletion(h) {
  return Promise.race([h.subscribed.then(() => true), h.result.then(() => false)]);
}

async function allowSettledWork() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function resumeDelayedImport({ heldSpecifier, settleBeforeResume }) {
  const deadlineAt = 2_000;
  const importReached = deferred(), releaseImport = deferred();
  const h = harness({ deadlineAt, onModuleLoad: async (specifier, module) => {
    if (specifier === heldSpecifier) {
      importReached.resolve();
      await releaseImport.promise;
    }
    return module;
  } });
  await importReached.promise;
  let outcome;
  if (settleBeforeResume) {
    h.advanceToDeadline();
    outcome = await h.result;
  } else h.clock.now = deadlineAt;
  releaseImport.resolve();
  await allowSettledWork();
  if (!h.isSettled()) h.advanceToDeadline();
  outcome ??= await h.result;
  await allowSettledWork();
  return { h, outcome, lateLoads: h.observation.moduleLoads.filter(load =>
    load.clock >= deadlineAt || load.afterFailure) };
}

test('the unchanged production member reader resets on attach, filters cache, parses server state and disposes', () => {
  let nextSnapshot, snapshotError, path, snapshotOptions, unsubscribeCount = 0;
  const events = [], errors = [];
  const reader = makeProductionReader({
    onSnapshot: (ref, options, next, error) => {
      path = ref.path;
      snapshotOptions = options;
      nextSnapshot = next;
      snapshotError = error;
      return () => { unsubscribeCount++; };
    },
    doc: (_database, value) => ({ path: value }),
    db: () => ({ controlled: true }),
    shuttleDeparture,
  });
  const unsubscribe = reader('normal-session-a', 'starlight', value => events.push(value), error => errors.push(error));
  assert.deepEqual(events, [null], 'The normal source listener clears prior movement synchronously on attach.');
  assert.equal(path, 'sessions/normal-session-a/shuttleDepartures/starlight');
  assert.equal(snapshotOptions.includeMetadataChanges, true);
  nextSnapshot({ metadata: { fromCache: true }, exists: () => true, data: () => requestedMovement() });
  assert.deepEqual(events, [null], 'The normal reader must not surface cache-only flight state.');
  const requested = requestedMovement();
  nextSnapshot({ metadata: { fromCache: false }, exists: () => true, data: () => requested });
  assert.equal(events[1].requestId, requested.requestId);
  assert.equal(events[1].status, 'requested');
  unsubscribe();
  nextSnapshot({ metadata: { fromCache: false }, exists: () => true, data: () => transitMovement() });
  assert.equal(events.length, 2, 'Disposed source listeners cannot deliver later movement.');
  assert.equal(unsubscribeCount, 1);
  assert.deepEqual(errors, []);
  assert.equal(typeof snapshotError, 'function');
});

test('the existing source freshness gate still rejects a cached member before subscribing', async () => {
  const stale = baseState();
  stale.connection = 'cache';
  stale.sessionSnapshotFreshness = 'cache';
  const h = harness({ initialState: stale });
  const outcome = await h.result;
  assert.match(outcome.error?.message ?? '', /live and server fresh/);
  assert.equal(h.observation.subscriptions, 0, 'No source read begins from a cached member projection.');
});

test('P181 observes the original requested movement through the normal server-backed document reader', async () => {
  const h = harness();
  assert.equal(Object.hasOwn(baseState(), 'shuttleDepartures'), false,
    'The normal source store has no global shuttleDepartures map.');
  if (await waitForSubscriptionOrCompletion(h)) {
    await allowSettledWork();
    assert.equal(h.observation.path, 'sessions/normal-session-a/shuttleDepartures/starlight');
    assert.equal(h.observation.options.includeMetadataChanges, true);
    assert.equal(h.isSettled(), false, 'The synchronous subscription reset is not a server absence.');
    h.emitSnapshot(requestedMovement(), { fromCache: true });
    await allowSettledWork();
    h.emitSnapshot(requestedMovement());
  }
  const outcome = await h.result;
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value.departure?.requestId, 'request-original-1',
    'A matching committed requested document must be observed from the actual member subscription.');
  assert.equal(outcome.value.transit, null);
  assert.equal(h.observation.subscriptions, 1);
  assert.equal(h.observation.unsubscribeCount, 1);
});

test('P181 observes the authoritative in-transit document from the same ordinary member reader', async () => {
  const h = harness();
  if (await waitForSubscriptionOrCompletion(h)) h.emitSnapshot(transitMovement());
  const outcome = await h.result;
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value.transit?.transitRequestId, 'transit-original-1');
  assert.equal(outcome.value.departure, null);
  assert.equal(h.observation.path, 'sessions/normal-session-a/shuttleDepartures/starlight');
  assert.equal(h.observation.unsubscribeCount, 1);
});

test('P181 treats only a confirmed server snapshot as a legitimate absent flight plan', async () => {
  const h = harness();
  if (await waitForSubscriptionOrCompletion(h)) h.emitSnapshot(null, { exists: false });
  const outcome = await h.result;
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value.departure, null);
  assert.equal(outcome.value.transit, null);
  assert.equal(h.observation.subscriptions, 1,
    'Null from the absent global field or synchronous subscription reset cannot stand in for a server snapshot.');
  assert.equal(h.observation.unsubscribeCount, 1);
});

test('P181 preserves normal member document denial/error instead of converting it to empty state', async () => {
  const h = harness();
  if (await waitForSubscriptionOrCompletion(h)) h.emitError(Object.assign(new Error('permission denied'), { code: 'permission-denied' }));
  const outcome = await h.result;
  assert.ok(outcome.error, 'The actual protected reader denial must remain a failed observation.');
  assert.equal(h.observation.subscriptions, 1);
  assert.equal(h.observation.unsubscribeCount, 1);
});

test('P181 retires the flight observer if the original member identity epoch changes before delivery', async () => {
  const h = harness();
  if (await waitForSubscriptionOrCompletion(h)) {
    const state = structuredClone(h.getState());
    state.me.connectionGeneration++;
    state.identityHydrationRevision++;
    h.setState(state);
    h.emitSnapshot(requestedMovement());
  }
  const outcome = await h.result;
  assert.ok(outcome.error, 'A movement callback from a retired source epoch must not be accepted.');
  assert.equal(h.observation.unsubscribeCount, 1);
});

test('P181 flight observation uses the original caller deadline and disposes at expiry', async () => {
  const deadlineAt = 2_000;
  const h = harness({ deadlineAt });
  if (await waitForSubscriptionOrCompletion(h)) {
    assert.equal(h.observation.evaluateArgs[0]?.deadlineAt, deadlineAt,
      'The exact original cutoff is passed in Playwright’s single serialized argument.');
    assert.ok([...h.timers.values()].some(timer => timer.delay === deadlineAt - h.clock.now),
      'The observer may use only the remaining portion of the original deadline.');
    h.advanceToDeadline();
  }
  const outcome = await h.result;
  assert.equal(outcome.error?.name, 'TimeoutError', 'Observation ends at the original finite cutoff.');
  assert.equal(h.observation.unsubscribeCount, 1);
});

test('P181 browser I/O forwards its original operation cutoff into the mounted observer', async () => {
  const wingCommander = { controlled: true };
  const deadlineAt = 42_000;
  let workDeadline, observerArgs;
  const snapshot = runInNewContext('(() => {' + snapshotConsumerSource +
    '; return snapshot; })()', {
      wingCommander,
      Date: { now: () => 1_000 },
      observeP181StarlightSource: (...args) => {
        observerArgs = args;
        return Promise.resolve({ controlled: true });
      },
      work: async (_label, operation, cutoff) => {
        workDeadline = cutoff;
        return operation();
      },
    });
  await snapshot(deadlineAt);
  assert.equal(observerArgs[0], wingCommander);
  assert.equal(observerArgs[1], deadlineAt,
    'The observer receives the existing caller cutoff; the source observation cannot start a fresh wait.');
  assert.equal(workDeadline, deadlineAt);
});

test('P181 browser I/O passes the same effective 60-second cutoff to the observer and wrapper', async () => {
  const wingCommander = { controlled: true };
  const laterDeadlineAt = 120_000;
  const effectiveDeadlineAt = 61_000;
  let workDeadline, observerArgs;
  const snapshot = runInNewContext('(() => {' + snapshotConsumerSource +
    '; return snapshot; })()', {
      wingCommander,
      Date: { now: () => 1_000 },
      observeP181StarlightSource: (...args) => {
        observerArgs = args;
        return Promise.resolve({ controlled: true });
      },
      work: async (_label, operation, cutoff) => {
        workDeadline = cutoff;
        return operation();
      },
    });
  await snapshot(laterDeadlineAt);
  assert.equal(observerArgs[0], wingCommander);
  assert.equal(observerArgs[1], effectiveDeadlineAt,
    'The observer receives the exact cutoff already imposed by its bounded work wrapper.');
  assert.equal(workDeadline, effectiveDeadlineAt);
});

test('P181 does not continue loading modules when the first import resumes after timeout settles', async () => {
  const { h, outcome, lateLoads } = await resumeDelayedImport({
    heldSpecifier: '/src/lib/firebase.ts', settleBeforeResume: true,
  });
  assert.equal(outcome.error?.name, 'TimeoutError', 'The original timeout remains authoritative.');
  assert.deepEqual(lateLoads, [], 'No later source module load begins after the timeout settles.');
  assert.equal(h.observation.subscriptions, 0);
});

test('P181 does not load Firestore when the store import resumes after timeout settles', async () => {
  const { h, outcome, lateLoads } = await resumeDelayedImport({
    heldSpecifier: 'controlled-store-module', settleBeforeResume: true,
  });
  assert.equal(outcome.error?.name, 'TimeoutError', 'The original timeout remains authoritative.');
  assert.deepEqual(lateLoads, [], 'No later source module load begins after the timeout settles.');
  assert.equal(h.observation.subscriptions, 0);
});

test('P181 does not start later module loads when the first import resumes at cutoff before the timer callback', async () => {
  const { h, outcome, lateLoads } = await resumeDelayedImport({
    heldSpecifier: '/src/lib/firebase.ts', settleBeforeResume: false,
  });
  assert.equal(outcome.error?.name, 'TimeoutError', 'The original cutoff is authoritative even before its timer callback.');
  assert.deepEqual(lateLoads, [], 'No module-load port starts at or after the original cutoff.');
  assert.equal(h.observation.subscriptions, 0);
});

test('P181 retires a delayed movement callback when the current member fleet audience changes', async () => {
  const h = harness();
  if (await waitForSubscriptionOrCompletion(h)) {
    const state = structuredClone(h.getState());
    state.me.fleetGroupId = 'fleet-2';
    h.setState(state);
    h.emitSnapshot(requestedMovement({ fleetGroupId: 'fleet-1' }));
  }
  const outcome = await h.result;
  assert.equal(h.getState().me.fleetGroupId, 'fleet-2');
  assert.ok(outcome.error, 'An old-fleet listener callback cannot be accepted after the member audience changes.');
  assert.equal(outcome.value?.departure, undefined);
  assert.equal(h.observation.subscriptions, 1);
  assert.equal(h.observation.unsubscribeCount, 1);
});

function savedMemberInitialState() {
  return rawSessionStateFromSavedMemberDto();
}

function assertProjectionDiagnostic(outcome, { stage, ...expected }) {
  const message = outcome.error?.message ?? '';
  assert.match(message, new RegExp(`stage=${stage}`));
  for (const [predicate, value] of Object.entries(expected)) {
    assert.match(message, new RegExp(`${predicate}=${value}`),
      `The diagnostic must report the bounded ${predicate} predicate outcome.`);
  }
  assert.match(message, /generation=2; hydrationRevision=2/,
    'The diagnostic includes supported, bounded source revisions.');
  assert.doesNotMatch(message, /saved-native-(?:session|original-uid)-alias/,
    'The diagnostic does not reveal raw or test-alias identifiers.');
}

function savedMemberFreshnessRace({ deadlineAt = 10_000 } = {}) {
  const saved = savedMemberInitialState();
  // This synthetic gmInstance ID is only the App callbackCurrent route guard.
  const store = actualSessionStore({ ...saved, gmInstance: { id: 'gm-instance-test-alias' } });
  const authorityRuntime = makeProductionSessionAuthorityRuntime();
  const onSessionFreshness = makeProductionAppFreshnessHandler(store, authorityRuntime);
  const h = harness({ store, deadlineAt, authUser: { uid: SAVED_MEMBER_UID_ALIAS } });
  return { saved, store, authorityRuntime, onSessionFreshness, h };
}

for (const { field, retiredValue } of [
  { field: 'fleetGroupId', retiredValue: 'retired-fixture-fleet' },
  { field: 'connectionGeneration', retiredValue: 99 },
]) {
  test(`P181 retires a pending callback when installed Zustand reentrantly delivers retired ${field}`, async () => {
    const store = actualInstalledZustandStore(rawSessionStateFromSavedMemberDto());
    const expectedValue = store.getState().me[field];
    let unreadyOriginal;
    const delivered = [];

    // This earlier real Zustand listener synchronously restores the exact
    // same offline/cache object when the nested identity mutation is delivered.
    store.subscribe(state => {
      if (state.me[field] === retiredValue) store.setState(unreadyOriginal, true);
    });
    const actualSubscribe = store.subscribe;
    store.subscribe = listener => actualSubscribe((state, previousState) => {
      delivered.push({
        stateChanged: state.me[field] !== expectedValue,
        previousChanged: previousState.me[field] !== expectedValue,
        getStateChanged: store.getState().me[field] !== expectedValue,
      });
      return listener(state, previousState);
    });

    const h = harness({ store, authUser: { uid: SAVED_MEMBER_UID_ALIAS } });
    assert.equal(await waitForSubscriptionOrCompletion(h), true,
      'The actual observer and protected reader subscribe before the reentrant state case.');
    store.setState({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
    unreadyOriginal = store.getState();
    h.emitSnapshot(requestedMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
    await allowSettledWork();
    assert.equal(h.isSettled(), false,
      'A same-member protected document callback remains pending while readiness is withdrawn.');

    const retiredMember = { ...store.getState().me, [field]: retiredValue };
    store.setState({ me: retiredMember });
    const nestedRetirementWasDelivered = delivered.some(item =>
      !item.stateChanged && item.previousChanged && !item.getStateChanged);
    assert.equal(nestedRetirementWasDelivered, true,
      'Installed Zustand delivered previousState with the retired identity while getState had already been restored.');
    store.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });

    const outcome = await h.result;
    assert.equal(outcome.value, undefined,
      'The observer must not accept the original movement after any delivered audience/generation retirement.');
    assert.match(outcome.error?.message ?? '', /identity epoch changed/);
    assert.equal(h.observation.unsubscribeCount, 1);
    assert.equal(h.observation.storeUnsubscribeCount, 1);
    assert.equal(h.timers.size, 0);
  });
}

test('the exact normal resume setters move a saved sanitized member from cache rejection to a protected server read', async () => {
  const initial = savedMemberInitialState();
  assert.equal(initial.connection, 'live');
  assert.equal(initial.sessionSnapshotFreshness, 'server');
  assert.equal(Object.hasOwn(initial, 'currentOwnPlayerConfirmed'), false);
  assert.equal(Object.hasOwn(initial, 'sdkHasServerAuthority'), false);
  assert.equal(Object.hasOwn(initial, 'sdkResumePending'), false);
  const store = actualSessionStore(initial);
  const { acceptedSession, reply } = normalResumeDataFromSavedMemberDto();

  const intermediate = beginNormalResume(store);
  assert.equal(intermediate.connection, 'connecting');
  assert.equal(intermediate.sessionSnapshotFreshness, 'cache');
  const beforeResume = harness({ initialState: intermediate, authUser: { uid: SAVED_MEMBER_UID_ALIAS } });
  const blockedIntermediate = await beforeResume.result;
  assert.match(blockedIntermediate.error?.message ?? '', /live and server fresh/);
  assert.equal(beforeResume.observation.subscriptions, 0,
    'The actual observer does not start a protected document read from an intermediate cache state.');

  const ready = applyAcceptedNormalResume(store, acceptedSession, reply);
  assert.equal(ready.connection, 'live');
  assert.equal(ready.sessionSnapshotFreshness, 'server');
  assert.equal(ready.identityHydrationRevision, initial.identityHydrationRevision + 1);
  assert.equal(ready.me.uid, SAVED_MEMBER_UID_ALIAS);
  assert.equal(ready.me.sessionId, SAVED_MEMBER_SESSION_ALIAS);
  assert.equal(Object.hasOwn(ready, 'currentOwnPlayerConfirmed'), false);
  assert.equal(Object.hasOwn(ready, 'sdkHasServerAuthority'), false);
  assert.equal(Object.hasOwn(ready, 'sdkResumePending'), false);

  const h = harness({ initialState: ready, authUser: { uid: SAVED_MEMBER_UID_ALIAS } });
  if (await waitForSubscriptionOrCompletion(h)) {
    await allowSettledWork();
    assert.equal(h.observation.path,
      `sessions/${SAVED_MEMBER_SESSION_ALIAS}/shuttleDepartures/starlight`);
    assert.equal(h.isSettled(), false,
      'The reader reset is not treated as a protected server document snapshot.');
    h.emitSnapshot(requestedMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
  }
  const observed = await h.result;
  assert.equal(observed.error, undefined);
  assert.equal(observed.value?.departure?.requestId, 'request-original-1');
  assert.equal(observed.value?.actor?.assignedRoleId, 'wing-commander');
  assert.equal(observed.value?.actor?.connection, 'live');
  assert.equal(observed.value?.actor?.freshness, 'server');
  assert.equal(h.observation.subscriptions, 1);
  assert.equal(h.observation.unsubscribeCount, 1);
});

const projectionFailureCases = [
  {
    name: 'missing authenticated user',
    expected: { authPresent: false, sessionPresent: true, actorMatches: false,
      memberSessionMatches: true, connectionLive: true, snapshotServer: true },
    options: { authUser: null },
  },
  {
    name: 'missing session',
    expected: { authPresent: true, sessionPresent: false, actorMatches: true,
      memberSessionMatches: false, connectionLive: true, snapshotServer: true },
    mutate: state => { state.session = null; },
  },
  {
    name: 'authenticated UID does not match member',
    expected: { authPresent: true, sessionPresent: true, actorMatches: false,
      memberSessionMatches: true, connectionLive: true, snapshotServer: true },
    mutate: state => { state.me.uid = 'other-test-actor-alias'; },
  },
  {
    name: 'member session does not match session projection',
    expected: { authPresent: true, sessionPresent: true, actorMatches: true,
      memberSessionMatches: false, connectionLive: true, snapshotServer: true },
    mutate: state => { state.me.sessionId = 'other-test-session-alias'; },
  },
  {
    name: 'member connection is intermediate',
    expected: { authPresent: true, sessionPresent: true, actorMatches: true,
      memberSessionMatches: true, connectionLive: false, snapshotServer: true },
    mutate: state => { state.connection = 'connecting'; },
  },
  {
    name: 'member snapshot is cached',
    expected: { authPresent: true, sessionPresent: true, actorMatches: true,
      memberSessionMatches: true, connectionLive: true, snapshotServer: false },
    mutate: state => { state.sessionSnapshotFreshness = 'cache'; },
  },
];

for (const failure of projectionFailureCases) {
  test(`P181 reports the actual initial source guard for ${failure.name}`, async () => {
    const initialState = savedMemberInitialState();
    failure.mutate?.(initialState);
    const authUser = failure.options && Object.hasOwn(failure.options, 'authUser')
      ? failure.options.authUser : { uid: SAVED_MEMBER_UID_ALIAS };
    const h = harness({ initialState, authUser });
    const outcome = await h.result;
    assert.ok(outcome.error, 'The existing source authority guard continues to reject this projection.');
    assert.equal(h.observation.subscriptions, 0,
      'The unchanged authority guard prevents a protected read when any actual source predicate fails.');
    assertProjectionDiagnostic(outcome, { stage: 'initial', ...failure.expected });
  });
}

test('P181 retains a protected departure callback across same-member freshness recovery', async () => {
  const { saved, store, onSessionFreshness, h } = savedMemberFreshnessRace();
  if (await waitForSubscriptionOrCompletion(h)) {
    assert.equal(store.state().identityHydrationRevision, saved.identityHydrationRevision);
    onSessionFreshness(false);
    assert.equal(store.state().connection, 'offline');
    assert.equal(store.state().sessionSnapshotFreshness, 'cache');
    h.emitSnapshot(requestedMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
    await allowSettledWork();
    onSessionFreshness(true);
    assert.equal(store.state().connection, 'live');
    assert.equal(store.state().sessionSnapshotFreshness, 'server');
    assert.equal(store.state().identityHydrationRevision, saved.identityHydrationRevision,
      'The App freshness recovery does not replace the original member identity.');
  }
  const outcome = await h.result;
  assert.equal(outcome.error, undefined,
    'The observer must retain a protected server document callback while the same member freshness is withdrawn, then accept it after the production App callback restores live/server.');
  assert.equal(outcome.value?.departure?.requestId, 'request-original-1');
  assert.equal(outcome.value?.actor?.connection, 'live');
  assert.equal(outcome.value?.actor?.freshness, 'server');
  assert.equal(h.observation.subscriptions, 1);
  assert.equal(h.observation.unsubscribeCount, 1);
  assert.equal(h.observation.storeSubscriptions, 1);
  assert.equal(h.observation.storeUnsubscribeCount, 1);
});

test('a pending P181 document callback times out at the original deadline while the same member remains offline/cache', async () => {
  const { onSessionFreshness, h } = savedMemberFreshnessRace({ deadlineAt: 2_000 });
  if (await waitForSubscriptionOrCompletion(h)) {
    onSessionFreshness(false);
    h.emitSnapshot(requestedMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
    await allowSettledWork();
    assert.equal(h.isSettled(), false,
      'A same-member non-ready transition must wait for its original cutoff, not fail early or renew the deadline.');
    assert.ok([...h.timers.values()].some(timer => timer.delay === 1_000),
      'The observer keeps only the remaining original deadline.');
    h.advanceToDeadline();
  }
  const outcome = await h.result;
  assert.equal(outcome.error?.name, 'TimeoutError');
  assert.equal(h.observation.unsubscribeCount, 1);
  assert.equal(h.observation.storeUnsubscribeCount, 1);
  h.emitSnapshot(transitMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
  await allowSettledWork();
  assert.equal((await h.result).error?.name, 'TimeoutError',
    'A late protected-reader callback cannot revive an expired observation.');
  assert.equal(h.observation.unsubscribeCount, 1);
  assert.equal(h.observation.storeUnsubscribeCount, 1);
});

test('a pending P181 callback is retired when the original generation and hydration identity changes', async () => {
  const { store, onSessionFreshness, h } = savedMemberFreshnessRace();
  if (await waitForSubscriptionOrCompletion(h)) {
    onSessionFreshness(false);
    h.emitSnapshot(requestedMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
    await allowSettledWork();
    assert.equal(h.isSettled(), false,
      'The original server document value remains pending while the member is non-ready.');
    const current = store.state();
    store.setState({ ...current, identityHydrationRevision: current.identityHydrationRevision + 1,
      me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 } });
  }
  const outcome = await h.result;
  assert.match(outcome.error?.message ?? '', /identity epoch changed/);
  assert.equal(h.observation.unsubscribeCount, 1);
  assert.equal(h.observation.storeUnsubscribeCount, 1);
});

test('a protected reader error remains terminal while a P181 document callback is pending', async () => {
  const { onSessionFreshness, h } = savedMemberFreshnessRace();
  if (await waitForSubscriptionOrCompletion(h)) {
    onSessionFreshness(false);
    h.emitSnapshot(requestedMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
    await allowSettledWork();
    assert.equal(h.isSettled(), false,
      'A protected server value can wait for same-member readiness until the reader reports an error.');
    h.emitError(new Error('controlled protected document read failed'));
  }
  const outcome = await h.result;
  assert.match(outcome.error?.message ?? '', /flight-plan document read failed/);
  assert.equal(h.observation.unsubscribeCount, 1);
  assert.equal(h.observation.storeUnsubscribeCount, 1);
  onSessionFreshness(true);
  assert.equal((await h.result).error?.message, outcome.error?.message,
    'Later freshness cannot replace the first protected-reader failure.');
});

test('the production App freshness callback moves the saved same-member DTO from offline/cache to live/server without changing identity', () => {
  const saved = savedMemberInitialState();
  const store = actualSessionStore({ ...saved, gmInstance: { id: 'gm-instance-test-alias' } });
  const authorityRuntime = makeProductionSessionAuthorityRuntime();
  const onSessionFreshness = makeProductionAppFreshnessHandler(store, authorityRuntime);
  onSessionFreshness(false);
  assert.equal(store.state().connection, 'offline');
  assert.equal(store.state().sessionSnapshotFreshness, 'cache');
  onSessionFreshness(true);
  assert.equal(store.state().connection, 'live');
  assert.equal(store.state().sessionSnapshotFreshness, 'server');
  assert.equal(store.state().session.id, saved.session.id);
  assert.equal(store.state().me.uid, saved.me.uid);
  assert.equal(store.state().me.sessionId, saved.me.sessionId);
  assert.equal(store.state().identityHydrationRevision, saved.identityHydrationRevision);
  assert.equal(store.state().me.connectionGeneration, saved.me.connectionGeneration);
  assert.equal(store.state().me.assignedRoleId, saved.me.assignedRoleId);
  assert.equal(Object.hasOwn(store.state(), 'currentOwnPlayerConfirmed'), false);
  assert.equal(Object.hasOwn(store.state(), 'sdkHasServerAuthority'), false);
  assert.equal(Object.hasOwn(store.state(), 'sdkResumePending'), false);
});

test('the production App freshness callback keeps the same member stale while a normal resume barrier is pending', () => {
  const saved = savedMemberInitialState();
  const store = actualSessionStore({ ...saved, gmInstance: { id: 'gm-instance-test-alias' } });
  const authorityRuntime = makeProductionSessionAuthorityRuntime();
  const authority = authorityRuntime.sessionSnapshotAuthorityFor(SAVED_MEMBER_SESSION_ALIAS, SAVED_MEMBER_UID_ALIAS);
  authorityRuntime.beginMemberSessionResume(authority);
  const onSessionFreshness = makeProductionAppFreshnessHandler(store, authorityRuntime);
  onSessionFreshness(true);
  assert.equal(store.state().connection, 'connecting');
  assert.equal(store.state().sessionSnapshotFreshness, 'cache');
  assert.equal(store.state().identityHydrationRevision, saved.identityHydrationRevision);
});

test('P181 labels a member projection failure at post-fingerprint verification', async () => {
  let h;
  h = harness({ initialState: savedMemberInitialState(),
    authUser: { uid: SAVED_MEMBER_UID_ALIAS }, afterDigest: () => {
      const stale = structuredClone(h.getState());
      stale.sessionSnapshotFreshness = 'cache';
      h.setState(stale);
    } });
  if (await waitForSubscriptionOrCompletion(h)) {
    h.emitSnapshot(requestedMovement({ holderUid: SAVED_MEMBER_UID_ALIAS }));
  }
  const outcome = await h.result;
  assert.ok(outcome.error);
  assert.equal(h.observation.subscriptions, 1);
  assert.equal(h.observation.unsubscribeCount, 1);
  assertProjectionDiagnostic(outcome, { stage: 'post-fingerprint-verification', authPresent: true,
    sessionPresent: true, actorMatches: true, memberSessionMatches: true,
    connectionLive: true, snapshotServer: false });
});
