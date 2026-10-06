import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION = 'core-postinspect-member-session';
const GROUP = 'fleet-postinspect';
const UID = 'core-postinspect-holder-uid';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ROLE = 'quellon-explorer';
const SHUTTLE = 'starlight';
const HOST = 'quellon';
const DEPARTURE_DESTINATION = 'dione';
const RETARGET_DESTINATION = 'icebreaker';
const CONTROL_REVISION = 4;
const CYCLE = 2;
const REQUESTED_AT = '2026-10-06T11:58:00.000Z';
const DEPARTED_AT = '2026-10-06T11:59:00.000Z';
const ARRIVES_AT = '2026-10-06T12:00:00.000Z';

const hashUid = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);

function memberState(endpoint, after = false, arrivalMovement, arrivalAt) {
  const hasDockingBefore = endpoint !== 'retargetShuttleTransit' && endpoint !== 'completeShuttleArrival';
  const hasDockingAfter = endpoint === 'requestShuttleDeparture';
  return {
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 9,
    me: { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION, uid: UID,
      fleetGroupId: GROUP, activeConsoleRoleId: ROLE, assignedRoleId: ROLE, connectionGeneration: 6 },
    session: {
      id: SESSION, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP },
      activeVesselIds: [HOST, DEPARTURE_DESTINATION, RETARGET_DESTINATION], activeRoleIds: [ROLE],
      ...(endpoint === 'completeShuttleArrival' ? { turnPhase: { turn: CYCLE, progression: 'manual',
        airspace: { state: 'lifted', pressAccess: false } } } : {}),
      memberSessionScope: { groupId: GROUP,
        vesselIds: [HOST, DEPARTURE_DESTINATION, RETARGET_DESTINATION], craftIds: [SHUTTLE] },
      currentActorBerthAuthority: { sessionId: SESSION, actorUid: UID, groupId: GROUP, role: 'player',
        connectionGeneration: 6, assignedRoleId: ROLE, activeConsoleRoleId: ROLE,
        replacementRoleId: null, replacementStatus: null, shipId: HOST },
      shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID,
        revision: CONTROL_REVISION, ownerRoleId: ROLE } },
      shuttleDockings: after && endpoint === 'completeShuttleArrival'
        ? [{ shuttleId: SHUTTLE, shipId: RETARGET_DESTINATION, dockedAt: arrivalAt }]
        : (after ? hasDockingAfter : hasDockingBefore)
          ? [{ shuttleId: SHUTTLE, shipId: HOST, dockedAt: '2026-10-06T11:00:00.000Z' }] : [],
      ...(endpoint === 'completeShuttleArrival' ? {
        turnPhase: { turn: CYCLE, progression: 'manual', airspace: { state: 'lifted', pressAccess: false } },
        shipResources: { [RETARGET_DESTINATION]: { food: 8, materials: 3 } },
        shuttleCargo: { [SHUTTLE]: { food: 2 } },
        shuttleVisitLog: after ? [
          { id: 'shuttle-arrival-transit-postinspect-1-departed', shuttleId: SHUTTLE,
            shipId: HOST, action: 'departed', occurredAt: arrivalMovement?.departedAt ?? DEPARTED_AT },
          { id: 'shuttle-arrival-transit-postinspect-1-docked', shuttleId: SHUTTLE,
            shipId: RETARGET_DESTINATION, action: 'docked', occurredAt: arrivalAt },
        ] : [],
      } : {}),
      ...(after && endpoint === 'requestShuttleDeparture'
        ? { shuttleDepartureRequests: { [SHUTTLE]: { status: 'requested' } } } : {}),
    },
  };
}

function requestedMovement() {
  return { status: 'requested', requestId: 'departure-postinspect-1', shuttleId: SHUTTLE,
    holderUid: UID, fleetGroupId: GROUP, originShipId: HOST,
    destinationShipId: DEPARTURE_DESTINATION, cycle: CYCLE,
    controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT };
}

function transitMovement(destinationShipId = DEPARTURE_DESTINATION, revision = 1, timestamps = {}) {
  return { status: 'in-transit', requestId: 'departure-postinspect-1',
    transitRequestId: 'transit-postinspect-1', shuttleId: SHUTTLE, holderUid: UID,
    fleetGroupId: GROUP, destinationShipId, cycle: CYCLE, controlRevision: CONTROL_REVISION,
    requestedAt: timestamps.requestedAt ?? REQUESTED_AT, revision, currentPosition: { x: 0, y: 0, z: 0 },
    destinationPosition: { x: 1, y: 1, z: 1 }, velocity: { x: 1, y: 1, z: 1 },
    departedAt: timestamps.departedAt ?? DEPARTED_AT,
    arrivesAt: timestamps.arrivesAt ?? ARRIVES_AT };
}

function initialMovement(endpoint, arrivalMovement) {
  if (endpoint === 'requestShuttleDeparture') return null;
  if (endpoint === 'beginShuttleTransit') return requestedMovement();
  if (endpoint === 'completeShuttleArrival') return arrivalMovement;
  return transitMovement();
}

function postMovement(endpoint) {
  if (endpoint === 'requestShuttleDeparture') return requestedMovement();
  if (endpoint === 'beginShuttleTransit') return transitMovement();
  if (endpoint === 'completeShuttleArrival') return null;
  return transitMovement(RETARGET_DESTINATION, 2);
}

function callableRequest(endpoint) {
  const base = { sessionId: SESSION, requestId: 'departure-postinspect-1', shuttleId: SHUTTLE };
  if (endpoint === 'completeShuttleArrival') return { sessionId: SESSION, shuttleId: SHUTTLE,
    transitRequestId: 'transit-postinspect-1', expectedControlRevision: CONTROL_REVISION };
  if (endpoint === 'requestShuttleDeparture') return { ...base,
    destinationShipId: DEPARTURE_DESTINATION, expectedControlRevision: CONTROL_REVISION, expectedCycle: CYCLE };
  if (endpoint === 'beginShuttleTransit') return { ...base, requestId: 'transit-postinspect-1',
    expectedDepartureRequestId: 'departure-postinspect-1', expectedControlRevision: CONTROL_REVISION,
    expectedCycle: CYCLE };
  return { ...base, requestId: 'retarget-postinspect-1', transitRequestId: 'transit-postinspect-1',
    destinationShipId: RETARGET_DESTINATION, expectedControlRevision: CONTROL_REVISION, expectedCycle: CYCLE };
}

function callableResult(endpoint, arrivalAt, arrivalMovement) {
  if (endpoint === 'completeShuttleArrival') return { status: 'arrived', sessionId: SESSION,
    requestId: 'arrival-transit-postinspect-1', transitRequestId: 'transit-postinspect-1',
    shuttleId: SHUTTLE, hostShipId: RETARGET_DESTINATION, arrivedAt,
    transitRevision: arrivalMovement.revision };
  if (endpoint === 'requestShuttleDeparture') return { status: 'requested', sessionId: SESSION,
    requestId: 'departure-postinspect-1', shuttleId: SHUTTLE, holderUid: UID, fleetGroupId: GROUP,
    originShipId: HOST, destinationShipId: DEPARTURE_DESTINATION, cycle: CYCLE,
    controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT };
  const movement = postMovement(endpoint);
  if (endpoint === 'beginShuttleTransit') return { status: 'in-transit', sessionId: SESSION,
    requestId: 'departure-postinspect-1', transitRequestId: 'transit-postinspect-1', shuttleId: SHUTTLE,
    holderUid: UID, fleetGroupId: GROUP, destinationShipId: DEPARTURE_DESTINATION, cycle: CYCLE,
    controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT, revision: 1,
    currentPosition: movement.currentPosition, destinationPosition: movement.destinationPosition,
    velocity: movement.velocity, departedAt: movement.departedAt, arrivesAt: movement.arrivesAt };
  return { status: 'in-transit', sessionId: SESSION, requestId: 'departure-postinspect-1',
    transitRequestId: 'transit-postinspect-1', shuttleId: SHUTTLE, holderUid: UID, fleetGroupId: GROUP,
    destinationShipId: RETARGET_DESTINATION, cycle: CYCLE, controlRevision: CONTROL_REVISION,
    requestedAt: REQUESTED_AT, revision: 2, currentPosition: movement.currentPosition,
    destinationPosition: movement.destinationPosition, velocity: movement.velocity,
    departedAt: movement.departedAt, arrivesAt: movement.arrivesAt };
}

function gameProjection(state) {
  return { live: true, sessionId: SESSION, phase: 'active', cycle: CYCLE,
    holderGroupId: GROUP, currentMemberScope: state.session.memberSessionScope,
    activeVesselIds: [...state.session.activeVesselIds], shuttleDockings: [...state.session.shuttleDockings],
    shuttleControl: structuredClone(state.session.shuttleControl),
    currentActorBerthAuthority: structuredClone(state.session.currentActorBerthAuthority) };
}

function serializedPage({ getState, getMovement, getArrivalMovement, currentUser, endpoint, click,
  automaticArrival = false }) {
  const responseWaiters = new Set();
  const requestListeners = new Set();
  let visibleStatus = '';
  let replayResult = null;
  const store = { useSessionStore: { getState } };
  const firebase = { auth: () => ({ currentUser: currentUser() }), db: () => ({}) };
  const firestore = {
    doc: (_db, path) => path,
    getDoc: async () => ({ exists: () => getMovement() !== null, data: () => structuredClone(getMovement()) }),
  };
  const fixtureImport = async moduleUrl => {
    if (moduleUrl === '/src/store/useSessionStore.ts') return store;
    if (moduleUrl === '/src/lib/firebase.ts') return firebase;
    if (moduleUrl === '/src/lib/firestore.ts') return { db: () => ({}) };
    if (String(moduleUrl).includes('firebase_firestore.js')) return firestore;
    throw new Error(`Unexpected fixture import: ${String(moduleUrl)}`);
  };
  const fetchFixture = async () => ({ text: async () => 'import { getDoc } from "firebase_firestore.js";' });
  const page = { evaluate: async (callback, input) => {
    const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
    const execute = new Function('fixtureImport', 'fetch', 'crypto', 'input', `return (${source})(input);`);
    return execute(fixtureImport, fetchFixture, webcrypto, input);
  },
  url: () => `http://localhost:5174/#/shuttles/${SHUTTLE}`,
  on: (name, listener) => { if (name === 'request') requestListeners.add(listener); },
  off: (name, listener) => { if (name === 'request') requestListeners.delete(listener); },
  waitForResponse: predicate => new Promise(resolve => responseWaiters.add({ predicate, resolve })),
  getByRole: (role, options = {}) => {
    if (role === 'status') return { allTextContents: async () => visibleStatus ? [visibleStatus] : [] };
    if (role === 'region' && options.name === 'Shuttle departure') return panel;
    return empty;
  } };
  const empty = { count: async () => 0, isVisible: async () => false, isEnabled: async () => false,
    click: async () => { throw new Error('A missing mounted control must not be clicked.'); } };
  const labels = {
    requestShuttleDeparture: 'Destination ship',
    retargetShuttleTransit: 'New destination ship',
  };
  const buttonNames = {
    requestShuttleDeparture: 'Request departure',
    beginShuttleTransit: 'Begin transit',
    retargetShuttleTransit: 'Retarget shuttle',
    completeShuttleArrival: 'Complete arrival',
  };
  const options = endpoint === 'requestShuttleDeparture'
    ? [{ value: 'orion', textContent: 'Orion', disabled: false },
      { value: DEPARTURE_DESTINATION, textContent: 'Dione', disabled: false }]
    : [{ value: DEPARTURE_DESTINATION, textContent: 'Dione', disabled: false },
      { value: RETARGET_DESTINATION, textContent: 'Icebreaker', disabled: false }];
  const select = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    locator: () => ({ evaluateAll: async fn => fn(options.map(value => ({ ...value }))) }),
    selectOption: async () => {} };
  let clickCount = 0;
  const button = name => ({
    count: async () => endpoint === 'completeShuttleArrival'
      ? !automaticArrival && name === 'Complete arrival' ? 1 : 0
      : name === buttonNames[endpoint] ? 1 : 0,
    isVisible: async () => true, isEnabled: async () => true,
    click: async () => {
      assert.equal(name, buttonNames[endpoint]);
      clickCount++;
      const arrivalAt = await click();
      const request = callableRequest(endpoint);
      const result = callableResult(endpoint, arrivalAt, getArrivalMovement?.());
      replayResult = result;
      visibleStatus = endpoint === 'requestShuttleDeparture' ? 'Departure requested.'
        : endpoint === 'beginShuttleTransit' ? 'Transit begun.'
          : endpoint === 'completeShuttleArrival' ? 'Shuttle arrived at Icebreaker.' : 'Course changed.';
      const requestObject = { method: () => 'POST',
        url: () => `http://localhost:5001/demo/us-central1/${endpoint}`,
        postDataJSON: () => ({ data: request }) };
      const response = { request: () => requestObject, url: requestObject.url,
        ok: () => true, status: () => 200, json: async () => ({ result }) };
      for (const listener of requestListeners) listener(requestObject);
      for (const waiter of [...responseWaiters]) {
        if (waiter.predicate(response)) { responseWaiters.delete(waiter); waiter.resolve(response); }
      }
    },
  });
  const panel = {
    getByLabel: (label, opts = {}) => label === labels[endpoint] && opts.exact === true ? select : empty,
    getByRole: (role, opts = {}) => role === 'button' && opts.exact === true ? button(opts.name) : empty,
  };
  return { page, clickCount: () => clickCount, replayResult: () => replayResult,
    setStatus: value => { visibleStatus = value; } };
}

async function makeCaptureHarness(endpoint, { postMutation, includeOriginHost = true,
  originHostShipId = HOST } = {}) {
  let currentMember = memberState(endpoint);
  let currentMovement = initialMovement(endpoint);
  let result = null;
  const memberUi = serializedPage({ getState: () => currentMember, getMovement: () => currentMovement,
    currentUser: () => ({ uid: UID }), endpoint, click: async () => {
      currentMember = memberState(endpoint, true);
      currentMovement = postMovement(endpoint);
      postMutation?.(currentMember);
    } });
  const gmState = () => ({ connection: 'live', sessionSnapshotFreshness: 'server',
    session: { id: SESSION, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP },
      activeVesselIds: [HOST, DEPARTURE_DESTINATION, RETARGET_DESTINATION], activeRoleIds: [ROLE],
      shipFleetGroupIds: { [HOST]: GROUP, [DEPARTURE_DESTINATION]: GROUP, [RETARGET_DESTINATION]: GROUP },
      shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID, revision: CONTROL_REVISION } },
      shuttleDockings: currentMember.session.shuttleDockings } });
  const gmUi = serializedPage({ getState: gmState, getMovement: () => null,
    currentUser: () => ({ uid: 'live-owned-gm-uid' }), endpoint, click: async () => {} });
  const actor = { sessionId: SESSION, uidHash: UID_HASH, profileRoleId: ROLE,
    activeConsoleRoleId: ROLE, assignedRoleId: ROLE, playerRole: 'player', sameActor: true,
    connection: 'live', freshness: 'server' };
  const gmActor = { sessionId: SESSION, uidHash: hashUid('live-owned-gm-uid'), profileRoleId: 'gm',
    activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'live-owned-gm-instance',
    gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' };
  const memberSurface = { page: memberUi.page, observe: async () => actor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async () => ({ status: 'committed', result: structuredClone(result ?? memberUi.replayResult()) }) };
  const gmSurface = { page: gmUi.page, observe: async () => gmActor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const game = { select: async role => role === 'gm' ? gmSurface : memberSurface,
    state: async surface => surface === gmSurface ? {
      live: true, sessionId: SESSION, phase: 'active', cycle: CYCLE, holderGroupId: GROUP,
      activeVesselIds: [HOST, DEPARTURE_DESTINATION, RETARGET_DESTINATION],
      shipFleetGroupIds: { [HOST]: GROUP, [DEPARTURE_DESTINATION]: GROUP, [RETARGET_DESTINATION]: GROUP },
      shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID, revision: CONTROL_REVISION } },
    } : gameProjection(currentMember) };
  const sourceSurface = { page: memberUi.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const initial = await readActionState(sourceSurface, SHUTTLE);
  const origin = { sessionId: SESSION, uidHash: UID_HASH, shuttleId: SHUTTLE, groupId: GROUP,
    cycle: CYCLE, controlRevision: CONTROL_REVISION, sourceAuthority: initial.currentDocumentAuthority };
  const context = { initial: { sessionId: SESSION, uidHash: UID_HASH },
    roster: [{ roleId: ROLE, uidHash: UID_HASH }], shuttleOriginAuthority: origin,
    ...(includeOriginHost ? { shuttleOriginHostShipId: originHostShipId } : {}) };
  const plan = await createPendingProcedureDefaultSteps()[`core:${endpoint}`]({ context, game });
  const captured = await captureMountedProcedureAction({ context, game, caseId: `core:${endpoint}`,
    expected: plan.expected, prepare: plan.prepare, inspect: plan.inspect, timeoutMs: 1000 });
  return { captured, context, currentMember, clickCount: memberUi.clickCount(), plan,
    currentMovement, getCurrentMember: () => currentMember, getCurrentMovement: () => currentMovement };
}

function arrivalTransit(arrivalOffsetMs) {
  const arrivesAtMs = Date.now() + arrivalOffsetMs;
  const departedAtMs = arrivesAtMs - 60_000;
  return transitMovement(RETARGET_DESTINATION, 2, {
    requestedAt: new Date(departedAtMs - 60_000).toISOString(),
    departedAt: new Date(departedAtMs).toISOString(),
    arrivesAt: new Date(arrivesAtMs).toISOString(),
  });
}

async function makeArrivalHarness({ arrivalOffsetMs = -1_000, automatic = false,
  preMutation, postMutation, originHostShipId = HOST } = {}) {
  const movement = arrivalTransit(arrivalOffsetMs);
  let currentMember = memberState('completeShuttleArrival');
  preMutation?.(currentMember);
  let currentMovement = movement;
  let sdkCalls = 0;
  const memberUi = serializedPage({ getState: () => currentMember,
    getMovement: () => currentMovement, getArrivalMovement: () => movement,
    currentUser: () => ({ uid: UID }), endpoint: 'completeShuttleArrival', automaticArrival: automatic,
    click: async () => {
      const arrivedAt = new Date().toISOString();
      currentMember = memberState('completeShuttleArrival', true, movement, arrivedAt);
      postMutation?.(currentMember);
      currentMovement = null;
      return arrivedAt;
    } });
  const gmState = () => ({ connection: 'live', sessionSnapshotFreshness: 'server',
    session: { id: SESSION, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP },
      activeVesselIds: [HOST, DEPARTURE_DESTINATION, RETARGET_DESTINATION], activeRoleIds: [ROLE],
      shipFleetGroupIds: { [HOST]: GROUP, [DEPARTURE_DESTINATION]: GROUP, [RETARGET_DESTINATION]: GROUP },
      shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID, revision: CONTROL_REVISION } },
      shuttleDockings: currentMember.session.shuttleDockings } });
  const gmUi = serializedPage({ getState: gmState, getMovement: () => null,
    currentUser: () => ({ uid: 'live-owned-gm-uid' }), endpoint: 'completeShuttleArrival', click: async () => {} });
  const actor = { sessionId: SESSION, uidHash: UID_HASH, profileRoleId: ROLE,
    activeConsoleRoleId: ROLE, assignedRoleId: ROLE, playerRole: 'player', sameActor: true,
    connection: 'live', freshness: 'server' };
  const gmActor = { sessionId: SESSION, uidHash: hashUid('live-owned-gm-uid'), profileRoleId: 'gm',
    activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'live-owned-gm-instance',
    gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' };
  const memberSurface = { page: memberUi.page, observe: async () => actor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async () => { sdkCalls++; throw new Error('single-shot arrival must not replay'); } };
  const gmSurface = { page: gmUi.page, observe: async () => gmActor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const game = { select: async role => role === 'gm' ? gmSurface : memberSurface,
    state: async surface => surface === gmSurface ? {
      live: true, sessionId: SESSION, phase: 'active', cycle: CYCLE, holderGroupId: GROUP,
      activeVesselIds: [HOST, DEPARTURE_DESTINATION, RETARGET_DESTINATION],
      shipFleetGroupIds: { [HOST]: GROUP, [DEPARTURE_DESTINATION]: GROUP, [RETARGET_DESTINATION]: GROUP },
      shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID, revision: CONTROL_REVISION } },
    } : gameProjection(currentMember) };
  const sourceSurface = { page: memberUi.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const initial = await readActionState(sourceSurface, SHUTTLE);
  const origin = { sessionId: SESSION, uidHash: UID_HASH, shuttleId: SHUTTLE, groupId: GROUP,
    cycle: CYCLE, controlRevision: CONTROL_REVISION, sourceAuthority: initial.currentDocumentAuthority };
  const witness = { status: 'completed', endpoint: 'retargetShuttleTransit', sessionId: SESSION,
    roleId: ROLE, uidHash: UID_HASH, shuttleId: SHUTTLE, groupId: GROUP, cycle: CYCLE,
    controlRevision: CONTROL_REVISION, departureRequestId: movement.requestId,
    transitRequestId: movement.transitRequestId, destinationShipId: RETARGET_DESTINATION,
    transitRevision: movement.revision, sourceAuthority: initial.currentDocumentAuthority };
  const context = { initial: { sessionId: SESSION, uidHash: UID_HASH },
    roster: [{ roleId: ROLE, uidHash: UID_HASH }], shuttleOriginAuthority: origin,
    shuttleArrivalWitness: witness, shuttleOriginHostShipId: originHostShipId,
    ...(automatic ? { shuttleArrivalCaptureMode: 'automatic-source-effect' } : {}) };
  const plan = await createPendingProcedureDefaultSteps()['core:completeShuttleArrival']({ context, game });
  return { context, game, memberSurface, currentMember, currentMovement, movement, plan,
    actor, source: gameProjection(currentMember), clickCount: () => memberUi.clickCount(), sdkCalls: () => sdkCalls,
    capture: () => captureMountedProcedureAction({ context, game, caseId: 'core:completeShuttleArrival',
      expected: plan.expected, prepare: plan.prepare, inspect: plan.inspect, timeoutMs: 1_000 }),
    observe: () => plan.observe?.() };
}

test('Core Request, Begin, and Retarget post-inspect captures validate the actual current member scope', async t => {
  for (const endpoint of ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit']) {
    await t.test(`${endpoint} accepts only its normal scoped lifecycle poststate`, async () => {
      const harness = await makeCaptureHarness(endpoint);
      assert.equal(harness.captured.status, 'completed', harness.captured.reason);
      assert.equal(harness.clickCount, 1, 'the exact mounted action is captured once');
      assert.equal(harness.captured.endpoint, endpoint);
    });
  }
});

test('post-inspect scope drift blocks an inactive original host and an unexpected later docking', async t => {
  for (const endpoint of ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit']) {
    await t.test(`${endpoint} blocks an inactive origin host`, async () => {
      const harness = await makeCaptureHarness(endpoint, { postMutation: state => {
        state.session.activeVesselIds = state.session.activeVesselIds.filter(id => id !== HOST);
      } });
      assert.equal(harness.captured.status, 'pending');
      assert.equal(harness.clickCount, 1, 'the poststate is checked after one ordinary mounted action');
    });
    if (endpoint !== 'requestShuttleDeparture') {
      await t.test(`${endpoint} blocks a reappearing docking after undocking`, async () => {
        const harness = await makeCaptureHarness(endpoint, { postMutation: state => {
          state.session.shuttleDockings = [{ shuttleId: SHUTTLE,
            shipId: DEPARTURE_DESTINATION, dockedAt: '2026-10-06T11:59:59.000Z' }];
        } });
        assert.equal(harness.captured.status, 'pending');
        assert.equal(harness.clickCount, 1);
      });
    }
  }
});

test('post-inspect scope drift blocks each Core movement endpoint without replacing the original source witness', async t => {
  for (const endpoint of ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit']) {
    await t.test(`${endpoint} blocks a destination that is no longer active`, async () => {
      const destination = endpoint === 'retargetShuttleTransit' ? RETARGET_DESTINATION : DEPARTURE_DESTINATION;
      const harness = await makeCaptureHarness(endpoint, { postMutation: state => {
        state.session.activeVesselIds = state.session.activeVesselIds.filter(id => id !== destination);
      } });
      assert.equal(harness.captured.status, 'pending');
      assert.equal(harness.captured.reason, 'live-source-cycle-revision-or-group-changed');
      assert.equal(harness.clickCount, 1, 'the invalid poststate is observed after its one normal UI action');
    });
  }
});

test('Core Begin and Retarget require the caller-bound original host and normal undocked poststate', async t => {
  for (const endpoint of ['beginShuttleTransit', 'retargetShuttleTransit']) {
    await t.test(`${endpoint} blocks an unbound host witness`, async () => {
      const harness = await makeCaptureHarness(endpoint, { includeOriginHost: false });
      assert.equal(harness.captured.status, 'pending');
      assert.equal(harness.clickCount, 0, 'missing origin-host witness blocks before the mounted control');
    });
  }
  const foreignHost = await makeCaptureHarness('retargetShuttleTransit', { originHostShipId: 'foreign-host' });
  assert.equal(foreignHost.captured.status, 'pending');
  assert.equal(foreignHost.clickCount, 0, 'a host outside the actual current scope cannot be inferred or substituted');
});

test('Core arrival arms and inspects through the real member scope after natural source time', async () => {
  const harness = await makeArrivalHarness();
  const prepared = await harness.plan.prepare({ surface: harness.memberSurface,
    actor: harness.actor, source: harness.source });
  assert.equal(prepared.offered, true, prepared.reason);
  assert.equal(prepared.arrival.beforeProjection.destinationGroupId, GROUP,
    'pre-arrival destination group is projected from the current member scope');
  assert.equal(prepared.arrival.beforeProjection.dockingCount, 0);
  const captured = await harness.capture();
  assert.equal(captured.status, 'completed', captured.reason);
  assert.equal(harness.clickCount(), 1, 'the ready mounted Complete arrival control is captured once');
  assert.equal(harness.sdkCalls(), 0, 'the arrival remains single-shot without SDK replay');
});

test('Core arrival blocks a missing original host or an out-of-scope or inactive destination', async t => {
  const cases = [
    ['host is absent from current member scope', state => {
      state.session.memberSessionScope.vesselIds = [DEPARTURE_DESTINATION, RETARGET_DESTINATION];
    }],
    ['destination is absent from current member scope', state => {
      state.session.memberSessionScope.vesselIds = [HOST, DEPARTURE_DESTINATION];
    }],
    ['destination is not active', state => {
      state.session.activeVesselIds = [HOST, DEPARTURE_DESTINATION];
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const harness = await makeArrivalHarness({ preMutation: mutate });
      const prepared = await harness.plan.prepare({ surface: harness.memberSurface,
        actor: harness.actor, source: harness.source });
      assert.equal(prepared.offered, false, prepared.reason);
      assert.equal(harness.clickCount(), 0);
    });
  }
  const afterScopeDrift = await makeArrivalHarness({ postMutation: state => {
    state.session.memberSessionScope.vesselIds = [HOST, DEPARTURE_DESTINATION];
  } });
  const captured = await afterScopeDrift.capture();
  assert.equal(captured.status, 'pending', 'post-arrival scope drift cannot validate as a source arrival');
  assert.equal(afterScopeDrift.clickCount(), 1);
});

test('Core automatic arrival arms only inside the original 35-second window before arrivesAt', async () => {
  const inWindow = await makeArrivalHarness({ arrivalOffsetMs: 30_000, automatic: true });
  const armed = await inWindow.plan.prepare({ surface: inWindow.memberSurface,
    actor: inWindow.actor, source: inWindow.source });
  assert.equal(armed.offered, true, armed.reason);
  assert.equal(armed.arrival.automaticObservation.arrivesAt, inWindow.movement.arrivesAt);
  assert.ok(armed.arrival.automaticObservation.remainingMs > 0 &&
    armed.arrival.automaticObservation.remainingMs <= 35_000);
  await armed.observe();
  assert.equal(inWindow.clickCount(), 0, 'source-timed automatic observation never clicks the UI');

  const outsideWindow = await makeArrivalHarness({ arrivalOffsetMs: 35_001, automatic: true });
  const outside = await outsideWindow.plan.prepare({ surface: outsideWindow.memberSurface,
    actor: outsideWindow.actor, source: outsideWindow.source });
  assert.equal(outside.offered, false, 'the observer cannot arm before the original 35-second window');
  assert.equal(outsideWindow.clickCount(), 0);

  const earlyManual = await makeArrivalHarness({ arrivalOffsetMs: 1_000 });
  const early = await earlyManual.plan.prepare({ surface: earlyManual.memberSurface,
    actor: earlyManual.actor, source: earlyManual.source });
  assert.equal(early.offered, false, 'manual arrival cannot be captured before actual arrivesAt');
  assert.equal(earlyManual.clickCount(), 0);
});
