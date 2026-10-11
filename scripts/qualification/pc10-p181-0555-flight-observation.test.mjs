import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const proofPath = fileURLToPath(new URL('../pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url));
const proof = await readFile(proofPath, 'utf8');
const firestorePath = fileURLToPath(new URL('../../src/lib/firestore.ts', import.meta.url));
const firestore = await readFile(firestorePath, 'utf8');

function sourceRegion(source, startText, endText, description) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, 'Bind actual ' + description + ' source.');
  return source.slice(start, end);
}

const observerSource = sourceRegion(proof,
  'export async function observeP181StarlightSource(surface) {',
  '\n}\n\n/** Bind the bounded Starlight flow', 'P181 mounted source observer').trim()
  .replace(/^export /, '').replace(/\bimport\s*\(/g, 'load(') + '\n}';
const browserIoStart = proof.indexOf('export function createP181StarlightBrowserIo(');
const snapshotStart = proof.indexOf('  const snapshot = deadlineAt => work(', browserIoStart);
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

function baseState() {
  return {
    session: { id: 'normal-session-a', phase: 'active', currentTurn: 1,
      shuttleDockings: [], shuttleControl: { starlight: { shuttleId: 'starlight', revision: 0 } } },
    me: { uid: 'wing-uid-a', sessionId: 'normal-session-a', role: 'player',
      assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', seatId: 'wing-commander',
      connectionGeneration: 3 },
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

function harness({ deadlineAt = 10_000, initialState = baseState() } = {}) {
  const clock = { now: 1_000 };
  const timers = new Map();
  let nextTimerId = 0;
  let currentState = initialState;
  const authUser = { uid: 'wing-uid-a' };
  let nextSnapshot, snapshotError, onNext, onError;
  let subscribedResolve;
  const subscribed = new Promise(resolve => { subscribedResolve = resolve; });
  const observation = { subscriptions: 0, unsubscribeCount: 0, path: null, options: null, evaluateArgs: null };
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
  const modules = {
    '/src/lib/firebase.ts': { auth: () => ({ currentUser: authUser }) },
    '/src/lib/firestore.ts': { subscribeShuttleDeparture: reader },
    'controlled-store-module': { useSessionStore: { getState: () => currentState } },
  };
  const load = async specifier => {
    assert.ok(Object.hasOwn(modules, specifier), 'Unexpected source import: ' + specifier);
    return modules[specifier];
  };
  const observer = runInNewContext('(() => {' + observerSource +
    '; return observeP181StarlightSource; })()', {
      load, crypto: webcrypto, TextEncoder, Uint8Array, Promise, Error,
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
    page: { evaluate: async (callback, ...args) => {
      observation.evaluateArgs = args;
      return callback(...args);
    } },
  };
  let resultSettled = false;
  const result = Promise.resolve().then(() => observer(surface, deadlineAt)).then(
    value => { resultSettled = true; return { value }; },
    error => { resultSettled = true; return { error }; });
  return {
    clock, timers, observation, subscribed, result,
    isSettled: () => resultSettled,
    setState: state => { currentState = state; },
    getState: () => currentState,
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
    assert.equal(h.observation.evaluateArgs[1], deadlineAt,
      'The exact original cutoff is passed into the mounted source observation.');
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
