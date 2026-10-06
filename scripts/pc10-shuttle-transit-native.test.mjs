import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  CORE_CRAFT_PROCEDURES,
  captureMountedProcedureAction,
  evaluateProcedureCapture,
} from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import {
  BASE_PENDING_PROCEDURE_PLACEMENTS,
  createBasePendingProcedureCallbacks,
} from './pc10-base-pending-procedure-composition.mjs';

const SESSION = 'shuttle-arrival-session';
const UID = 'shuttle-holder-uid';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ACTOR = { uidHash: UID_HASH, sessionId: SESSION, profileRoleId: 'quellon-explorer',
  activeConsoleRoleId: 'quellon-explorer', sameActor: true, connection: 'live', freshness: 'server' };

function currentDocumentAuthority(overrides = {}) {
  return { sessionId: SESSION, uidHash: UID_HASH, groupId: 'fleet-1', roleId: 'quellon-explorer',
    connectionGeneration: 4, identityHydrationRevision: 3,
    documentTimeOrigin: 1_760_000_000_000,
    audienceHash: 'a'.repeat(64), authorityHash: 'b'.repeat(64), shuttleAuthorized: true,
    ...overrides };
}

function shuttleArrivalWitness() {
  return { status: 'completed', endpoint: 'retargetShuttleTransit', sessionId: SESSION,
    roleId: 'quellon-explorer', uidHash: UID_HASH, shuttleId: 'starlight', groupId: 'fleet-1',
    cycle: 2, controlRevision: 4, departureRequestId: 'departure-1', transitRequestId: 'transit-1',
    destinationShipId: 'icebreaker', transitRevision: 2, sourceAuthority: currentDocumentAuthority() };
}

function shuttleOriginAuthority(sourceAuthority = currentDocumentAuthority()) {
  return { sessionId: SESSION, uidHash: UID_HASH, shuttleId: 'starlight', groupId: 'fleet-1',
    cycle: 2, controlRevision: 4, sourceAuthority };
}

function validArrivalCapture() {
  const now = Date.now();
  const requestedAt = new Date(now - 130_000).toISOString();
  const departedAt = new Date(now - 120_000).toISOString();
  const arrivesAt = new Date(now - 60_000).toISOString();
  const arrivedAt = new Date(now - 500).toISOString();
  const transitRequestId = 'transit-1';
  const shuttleId = 'starlight';
  const destinationShipId = 'icebreaker';
  const transitRevision = 2;
  return {
    caseId: 'core:completeShuttleArrival',
    expected: { sessionId: SESSION, uidHash: UID_HASH, roleId: 'quellon-explorer', cycle: 2,
      groupId: 'fleet-1', shuttleId, controlRevision: 4, departureRequestId: 'departure-1',
      transitRequestId, destinationShipId, transitRevision, sourceAuthority: currentDocumentAuthority() },
    originAuthority: shuttleOriginAuthority(),
    offered: true,
    mountedUi: true,
    actorBefore: ACTOR,
    actorAfter: ACTOR,
    sourceBefore: { live: true, sessionId: SESSION, cycle: 2, phase: 'active', groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: SESSION, cycle: 2, phase: 'active', groupId: 'fleet-1' },
    arrival: {
      priorWitness: shuttleArrivalWitness(),
      authorityBefore: currentDocumentAuthority(), authorityAfter: currentDocumentAuthority(),
      readyControl: { panel: 'Shuttle departure', label: 'Complete arrival', visible: true,
        enabled: true, sessionId: SESSION, cycle: 2, transitRequestId,
        observedAt: new Date(now - 250).toISOString() },
      before: { kind: 'shuttle-arrival-before', status: 'in-transit', sessionId: SESSION,
        departureRequestId: 'departure-1', transitRequestId, shuttleId, holderUidHash: UID_HASH,
        groupId: 'fleet-1', destinationShipId, controlRevision: 4, cycle: 2,
        transitRevision, requestedAt, departedAt, arrivesAt },
      beforeProjection: { kind: 'shuttle-arrival-projection', live: true, sessionId: SESSION,
        cycle: 2, phase: 'active', turn: 2, progression: 'manual', airspaceState: 'lifted',
        pressAccess: false, timerPaused: false, holderUidHash: UID_HASH, controlRevision: 4,
        holderGroupId: 'fleet-1', destinationGroupId: 'fleet-1', destinationActive: true, dockingCount: 0,
        resourceBalances: { host: { food: 8, materials: 3 }, shuttle: { food: 2 } } },
      afterProjection: { kind: 'shuttle-arrival-projection', live: true, sessionId: SESSION,
        cycle: 2, phase: 'active', turn: 2, progression: 'manual', airspaceState: 'lifted',
        pressAccess: false, timerPaused: false, holderUidHash: UID_HASH, controlRevision: 4,
        holderGroupId: 'fleet-1', destinationGroupId: 'fleet-1', destinationActive: true, movementAbsent: true,
        resourceBalances: { host: { food: 8, materials: 3 }, shuttle: { food: 2 } },
        dockings: [{ shuttleId, shipId: destinationShipId, dockedAt: arrivedAt }],
        visits: [
          { id: `shuttle-arrival-${transitRequestId}-departed`, shuttleId,
            shipId: 'quellon', action: 'departed', occurredAt: departedAt },
          { id: `shuttle-arrival-${transitRequestId}-docked`, shuttleId,
            shipId: destinationShipId, action: 'docked', occurredAt: arrivedAt },
        ], observedAt: new Date(now - 100).toISOString() },
    },
    request: { sessionId: SESSION, shuttleId, transitRequestId, expectedControlRevision: 4 },
    response: { httpStatus: 200, exactReplay: false, result: { status: 'arrived', sessionId: SESSION,
      requestId: `arrival-${transitRequestId}`, transitRequestId, shuttleId,
      hostShipId: destinationShipId, arrivedAt, transitRevision } },
    replay: null,
    rendered: { visible: true, resultStatus: 'arrived' },
  };
}

function validRetargetCapture() {
  const witness = shuttleArrivalWitness();
  const requestedAt = new Date(Date.now() - 120_000).toISOString();
  const departedAt = new Date(Date.now() - 60_000).toISOString();
  const arrivesAt = new Date(Date.now()).toISOString();
  const before = { kind: 'shuttle-movement', exists: true, status: 'in-transit', sessionId: SESSION,
    requestId: witness.departureRequestId, transitRequestId: witness.transitRequestId,
    shuttleId: witness.shuttleId, holderUidHash: UID_HASH, groupId: witness.groupId,
    destinationShipId: 'dione', controlRevision: witness.controlRevision, cycle: witness.cycle, revision: 1 };
  const after = { ...before, destinationShipId: witness.destinationShipId, revision: witness.transitRevision };
  const request = { sessionId: SESSION, requestId: 'retarget-request-1', shuttleId: witness.shuttleId,
    transitRequestId: witness.transitRequestId, destinationShipId: witness.destinationShipId,
    expectedControlRevision: witness.controlRevision, expectedCycle: witness.cycle };
  const result = { status: 'in-transit', sessionId: SESSION, requestId: witness.departureRequestId,
    transitRequestId: witness.transitRequestId, shuttleId: witness.shuttleId, holderUid: UID,
    fleetGroupId: witness.groupId, destinationShipId: witness.destinationShipId, cycle: witness.cycle,
    controlRevision: witness.controlRevision, requestedAt, revision: witness.transitRevision,
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 },
    velocity: { x: 1, y: 1, z: 1 }, departedAt, arrivesAt };
  return {
    caseId: 'core:retargetShuttleTransit',
    expected: { sessionId: SESSION, uidHash: UID_HASH, roleId: witness.roleId, cycle: witness.cycle,
      groupId: witness.groupId, shuttleId: witness.shuttleId, controlRevision: witness.controlRevision,
      departureRequestId: witness.departureRequestId, transitRequestId: witness.transitRequestId,
      destinationShipId: witness.destinationShipId, sourceRevision: 1, sourceAuthority: witness.sourceAuthority },
    originAuthority: shuttleOriginAuthority(witness.sourceAuthority),
    sourceAuthorityBefore: witness.sourceAuthority, sourceAuthorityAfter: witness.sourceAuthority,
    offered: true, mountedUi: true, actorBefore: ACTOR, actorAfter: ACTOR,
    sourceBefore: { live: true, sessionId: SESSION, cycle: witness.cycle, phase: 'active', revision: 1, groupId: witness.groupId },
    sourceAfter: { live: true, sessionId: SESSION, cycle: witness.cycle, phase: 'active', revision: witness.transitRevision, groupId: witness.groupId },
    transitionBefore: before, transitionAfter: after, request,
    response: { httpStatus: 200, exactReplay: true, result }, replay: { status: 'committed', result },
    rendered: { visible: true, resultStatus: 'in-transit' },
  };
}

function makeMountedRetargetHarness({ originOverrides = {}, currentAuthorityOverrides = {} } = {}) {
  const state = { live: true, sessionId: SESSION, phase: 'active', cycle: 2,
    playerDiscovery: { groupId: 'fleet-1' }, holderGroupId: 'fleet-1',
    activeVesselIds: ['quellon', 'dione', 'icebreaker'],
    shipFleetGroupIds: { quellon: 'fleet-1', dione: 'fleet-1', icebreaker: 'fleet-1' },
    currentMemberScope: { groupId: 'fleet-1', vesselIds: ['quellon', 'dione', 'icebreaker'],
      craftIds: ['starlight'] },
    shuttleControl: { starlight: { shuttleId: 'starlight', holderUid: UID, revision: 4 } },
    shuttleDockings: [],
    currentDocumentAuthority: currentDocumentAuthority(currentAuthorityOverrides) };
  const movement = { status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: UID, holderUidHash: UID_HASH, groupId: 'fleet-1',
    destinationShipId: 'dione', controlRevision: 4, cycle: 2, revision: 1,
    requestedAt: new Date(Date.now() - 20_000).toISOString(),
    departedAt: new Date(Date.now() - 10_000).toISOString(),
    arrivesAt: new Date(Date.now() + 50_000).toISOString() };
  let clickCount = 0;
  const action = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => { clickCount += 1; } };
  const select = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    locator: () => ({ evaluateAll: async () => [
      { value: 'dione', text: 'Dione', offered: true, enabled: true },
      { value: 'icebreaker', text: 'Icebreaker', offered: true, enabled: true },
    ] }), selectOption: async () => {} };
  const panel = { getByLabel: () => select, getByRole: () => action };
  const page = { url: () => 'http://localhost:5174/#/shuttles/starlight',
    evaluate: async (_fn, input) => input && typeof input === 'object' && input.sessionId
      ? structuredClone(movement) : structuredClone(state),
    getByRole: (role, options = {}) => role === 'region' && options.name === 'Shuttle departure'
      ? panel : action };
  const player = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ACTOR };
  const gm = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ uidHash: 'gm-hash', sessionId: SESSION, playerRole: 'gm', instanceId: 'gm-instance',
      gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' }) };
  const game = { select: async role => role === 'gm' ? gm : player,
    state: async surface => surface.page.evaluate(() => null, '/src/store/useSessionStore.ts') };
  const origin = { sessionId: SESSION, uidHash: UID_HASH, shuttleId: 'starlight', groupId: 'fleet-1',
    cycle: 2, controlRevision: 4, sourceAuthority: currentDocumentAuthority(), ...originOverrides };
  const context = { initial: { sessionId: SESSION }, gm,
    roster: [{ roleId: 'quellon-explorer', uidHash: UID_HASH }], shuttleOriginAuthority: origin,
    shuttleOriginHostShipId: 'quellon' };
  return { context, game, player, state, movement, clickCount: () => clickCount };
}

function makeMountedArrivalHarness({ retryCount = 0, completeCount = 1, completeEnabled = true,
  arrivalOffsetMs = -60_000, automaticArrival = false } = {}) {
  const now = Date.now();
  const transit = { status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: UID, fleetGroupId: 'fleet-1', destinationShipId: 'icebreaker',
    cycle: 2, controlRevision: 4, revision: 2,
    requestedAt: new Date(now + arrivalOffsetMs - 70_000).toISOString(),
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 },
    velocity: { x: 1, y: 1, z: 1 }, departedAt: new Date(now + arrivalOffsetMs - 60_000).toISOString(),
    arrivesAt: new Date(now + arrivalOffsetMs).toISOString() };
  let movement = { status: transit.status, requestId: transit.requestId,
    transitRequestId: transit.transitRequestId, shuttleId: transit.shuttleId, holderUid: UID,
    holderUidHash: UID_HASH,
    groupId: transit.fleetGroupId, destinationShipId: transit.destinationShipId,
    controlRevision: transit.controlRevision, cycle: transit.cycle, revision: transit.revision,
    requestedAt: transit.requestedAt, departedAt: transit.departedAt, arrivesAt: transit.arrivesAt };
  let state = { live: true, sessionId: SESSION, phase: 'active', cycle: 2,
    turnPhase: { turn: 2, progression: 'manual', airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
      teamPhaseEndsAt: new Date(now + 60_000).toISOString(), openAirspaceEndsAt: new Date(now + 120_000).toISOString() },
    holderGroupId: 'fleet-1', playerDiscovery: { groupId: 'fleet-1' },
    activeVesselIds: ['quellon', 'icebreaker'], shipFleetGroupIds: { quellon: 'fleet-1', icebreaker: 'fleet-1' },
    shuttleControl: { starlight: { shuttleId: 'starlight', holderUid: UID, revision: 4 } },
    currentDocumentAuthority: currentDocumentAuthority(),
    shuttleDockings: [], shuttleVisitLog: [],
    shipResources: { icebreaker: { food: 8, materials: 3 } },
    shuttleCargo: { starlight: { food: 2 } } };
  const requestListeners = new Set();
  const responseListeners = new Set();
  let clickCount = 0;
  let sdkCalls = 0;
  let statusText = '';

  const responseFor = (request, result) => ({
    request: () => request,
    url: () => request.url(),
    ok: () => true,
    status: () => 200,
    json: async () => ({ result }),
  });
  const makeButton = name => ({
    count: async () => name === 'Complete arrival' ? completeCount : name === 'Retry arrival' ? retryCount : 0,
    isVisible: async () => true,
    isEnabled: async () => name === 'Complete arrival' ? completeEnabled : true,
    click: async () => {
      assert.equal(name, 'Complete arrival');
      clickCount += 1;
      const payload = { sessionId: SESSION, shuttleId: 'starlight', transitRequestId: 'transit-1',
        expectedControlRevision: 4 };
      const request = { method: () => 'POST',
        url: () => 'https://functions.example/us-central1/completeShuttleArrival',
        postDataJSON: () => ({ data: payload }) };
      for (const listener of requestListeners) listener(request);
      const arrivedAt = new Date(Date.now() - 100).toISOString();
      state = { ...state,
        shuttleDockings: [{ shuttleId: 'starlight', shipId: 'icebreaker', dockedAt: arrivedAt }],
        shuttleVisitLog: [
          { id: 'shuttle-arrival-transit-1-departed', shuttleId: 'starlight', shipId: 'quellon',
            action: 'departed', occurredAt: transit.departedAt },
          { id: 'shuttle-arrival-transit-1-docked', shuttleId: 'starlight', shipId: 'icebreaker',
            action: 'docked', occurredAt: arrivedAt },
        ] };
      movement = null;
      statusText = 'Shuttle arrived at Icebreaker.';
      const result = { status: 'arrived', sessionId: SESSION, requestId: 'arrival-transit-1',
        transitRequestId: 'transit-1', shuttleId: 'starlight', hostShipId: 'icebreaker', arrivedAt,
        transitRevision: 2 };
      const response = responseFor(request, result);
      for (const listener of responseListeners) listener(response);
    },
  });
  const panel = { getByRole: (_role, options = {}) => makeButton(options.name) };
  const page = {
    url: () => 'http://localhost:5174/#/shuttles/starlight',
    on: (event, listener) => { if (event === 'request') requestListeners.add(listener); },
    off: (event, listener) => { if (event === 'request') requestListeners.delete(listener); },
    evaluate: async (_fn, input) => input && typeof input === 'object' && input.sessionId
      ? structuredClone(movement)
      : structuredClone(state),
    getByRole: (role, options = {}) => role === 'region' && options.name === 'Shuttle departure'
      ? panel
      : role === 'status' ? { allTextContents: async () => statusText ? [statusText] : [] }
        : makeButton(options.name),
    waitForResponse: (predicate, { timeout = 1_000 } = {}) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { responseListeners.delete(listener); reject(new Error('response timeout')); }, timeout);
      const listener = value => {
        if (!predicate(value)) return;
        clearTimeout(timer);
        responseListeners.delete(listener);
        resolve(value);
      };
      responseListeners.add(listener);
      if (automaticArrival) setTimeout(() => {
        if (Date.now() < Date.parse(transit.arrivesAt)) return;
        const payload = { sessionId: SESSION, shuttleId: 'starlight', transitRequestId: 'transit-1',
          expectedControlRevision: 4 };
        const request = { method: () => 'POST',
          url: () => 'https://functions.example/us-central1/completeShuttleArrival',
          postDataJSON: () => ({ data: payload }) };
        for (const requestListener of requestListeners) requestListener(request);
        const arrivedAt = new Date().toISOString();
        state = { ...state,
          shuttleDockings: [{ shuttleId: 'starlight', shipId: 'icebreaker', dockedAt: arrivedAt }],
          shuttleVisitLog: [
            { id: 'shuttle-arrival-transit-1-departed', shuttleId: 'starlight', shipId: 'quellon',
              action: 'departed', occurredAt: transit.departedAt },
            { id: 'shuttle-arrival-transit-1-docked', shuttleId: 'starlight', shipId: 'icebreaker',
              action: 'docked', occurredAt: arrivedAt },
          ] };
        movement = null;
        statusText = 'Shuttle arrived at Icebreaker.';
        const result = { status: 'arrived', sessionId: SESSION, requestId: 'arrival-transit-1',
          transitRequestId: 'transit-1', shuttleId: 'starlight', hostShipId: 'icebreaker', arrivedAt,
          transitRevision: 2 };
        const response = responseFor(request, result);
        for (const responseListener of responseListeners) responseListener(response);
      }, Math.max(0, Date.parse(transit.arrivesAt) - Date.now() + 5));
    }),
  };
  const player = { page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ACTOR, callable: async () => { sdkCalls += 1; throw new Error('single-shot arrival must not replay'); } };
  const gmPage = { ...page, evaluate: async (_fn, input) => input && typeof input === 'object' && input.sessionId
    ? structuredClone(movement) : structuredClone(state) };
  const gm = { page: gmPage, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => ({ uidHash: 'gm-hash', sessionId: SESSION, playerRole: 'gm', instanceId: 'gm-instance',
      gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' }) };
  const game = { select: async role => role === 'gm' ? gm : player,
    state: async surface => surface.page.evaluate(() => null, '/src/store/useSessionStore.ts') };
  const context = { initial: { sessionId: SESSION }, gm, roster: [{ roleId: 'quellon-explorer', uidHash: UID_HASH }] };
  context.shuttleArrivalWitness = shuttleArrivalWitness();
  context.shuttleOriginAuthority = shuttleOriginAuthority();
  return { context, game, player, initialState: structuredClone(state),
    changeCurrentHolder: () => { state = { ...state, shuttleControl: { ...state.shuttleControl,
      starlight: { ...state.shuttleControl.starlight, holderUid: 'new-holder' } } }; },
    changeCurrentDocumentAuthority: mutation => { state = { ...state, currentDocumentAuthority:
      mutation(state.currentDocumentAuthority && structuredClone(state.currentDocumentAuthority)) }; },
    removeCurrentDocumentAuthority: () => { state = { ...state }; delete state.currentDocumentAuthority; },
    clickCount: () => clickCount, sdkCalls: () => sdkCalls };
}

test('the Base movement rows follow the source-legal request, begin, retarget, arrival order', () => {
  const ids = CORE_CRAFT_PROCEDURES.map(row => row.id);
  const order = ['core:requestShuttleDeparture', 'core:beginShuttleTransit',
    'core:retargetShuttleTransit', 'core:completeShuttleArrival'];
  assert.deepEqual(order.map(id => ids.indexOf(id)).sort((a, b) => a - b), order.map(id => ids.indexOf(id)));
  const placement = BASE_PENDING_PROCEDURE_PLACEMENTS.find(row => row.stage === 'cycle-1-coordination');
  assert.deepEqual(placement.caseIds.filter(id => order.includes(id)), order);
  assert.equal(typeof createBasePendingProcedureCallbacks().onShuttleArrivalReady, 'function',
    'the later source-time hook must not rerun every Coordination mutation');
  assert.equal(typeof createBasePendingProcedureCallbacks().onShuttleAutoArrivalArmed, 'function',
    'the separate pre-arrival observer hook must stay arrival-only');
});

test('a completed retarget exports only its validated holder, custody, cycle, group and transit tuple', () => {
  const proof = evaluateProcedureCapture(validRetargetCapture());
  assert.equal(proof.status, 'completed');
  assert.deepEqual(proof.shuttleArrivalWitness, shuttleArrivalWitness());
});

test('single-shot arrival accepts only the current mounted source receipt and docking projection', () => {
  const capture = validArrivalCapture();
  assert.equal(evaluateProcedureCapture(capture).status, 'completed');
  for (const [index, mutate] of [
    value => { value.actorAfter = { ...ACTOR, uidHash: 'different-holder' }; },
    value => { value.actorAfter = { ...ACTOR, connection: 'offline', freshness: 'stale' }; },
    value => { value.sourceBefore.live = false; },
    value => { value.sourceAfter.sessionId = 'stale-session'; },
    value => { value.expected.shuttleId = 'blacksmith'; },
    value => { value.expected.transitRevision += 1; },
    value => { value.arrival.before.groupId = 'different-group'; },
    value => { value.arrival.before.destinationShipId = 'dione'; },
    value => { value.arrival.before.controlRevision += 1; },
    value => { value.arrival.beforeProjection.controlRevision += 1; },
    value => { value.arrival.beforeProjection.destinationActive = false; },
    value => { value.arrival.beforeProjection.destinationGroupId = 'foreign-group'; },
    value => { value.arrival.beforeProjection.holderGroupId = 'foreign-group'; },
    value => { value.arrival.beforeProjection.timerPaused = true; },
    value => { value.arrival.beforeProjection.airspaceState = 'closed'; },
    value => { value.arrival.before.departureRequestId = 'foreign-departure'; },
    value => { delete value.arrival.priorWitness; },
    value => { delete value.arrival.authorityBefore; },
    value => { value.arrival.authorityAfter.identityHydrationRevision += 1; },
    value => { value.arrival.authorityAfter.documentTimeOrigin += 1; },
    value => { value.arrival.authorityAfter.connectionGeneration += 1; },
    value => { value.arrival.authorityAfter.audienceHash = 'c'.repeat(64); },
    value => { value.arrival.priorWitness.groupId = 'foreign-group'; },
    value => { value.arrival.priorWitness.uidHash = 'foreign-holder'; },
    value => { value.arrival.priorWitness.sessionId = 'stale-session'; },
    value => { value.arrival.priorWitness.cycle += 1; },
    value => { value.arrival.priorWitness.controlRevision += 1; },
    value => { value.arrival.priorWitness.departureRequestId = 'stale-departure'; },
    value => { value.arrival.priorWitness.transitRequestId = 'stale-transit'; },
    value => { value.arrival.priorWitness.destinationShipId = 'dione'; },
    value => { value.arrival.priorWitness.transitRevision += 1; },
    value => { value.arrival.priorWitness.unreviewed = true; },
    value => { value.arrival.priorWitness.sourceAuthority.uidHash = 'foreign-holder'; },
    value => { value.originAuthority.groupId = 'foreign-group'; },
    value => { value.originAuthority.sourceAuthority.authorityHash = 'c'.repeat(64); },
    value => { value.arrival.before.transitRequestId = 'foreign-transit'; },
    value => { value.arrival.before.cycle += 1; },
    value => { value.arrival.readyControl.observedAt = new Date(Date.now() - 90_000).toISOString(); },
    value => { value.arrival.beforeProjection.live = false; },
    value => { value.arrival.beforeProjection.progression = 'automatic'; },
    value => { value.arrival.readyControl.label = 'Retry arrival'; },
    value => { value.arrival.readyControl.enabled = false; },
    value => { value.arrival.before.arrivesAt = new Date(Date.now() + 30_000).toISOString(); },
    value => { value.arrival.afterProjection.destinationGroupId = 'different-group'; },
    value => { value.arrival.afterProjection.holderGroupId = 'different-group'; },
    value => { value.arrival.afterProjection.destinationActive = false; },
    value => { value.arrival.afterProjection.dockings[0].shipId = 'dione'; },
    value => { value.arrival.afterProjection.movementAbsent = false; },
    value => { value.arrival.afterProjection.dockings.push({ ...value.arrival.afterProjection.dockings[0] }); },
    value => { value.arrival.afterProjection.resourceBalances.host.food -= 1; },
    value => { value.arrival.afterProjection.visits[1].shipId = 'dione'; },
    value => { value.arrival.before.unreviewed = true; },
    value => { value.request.requestId = 'manufactured-request-id'; },
    value => { value.request.unreviewed = true; },
    value => { value.request.expectedControlRevision += 1; },
    value => { value.response.result.status = 'replayed'; },
    value => { value.response.result.transitRevision += 1; },
    value => { value.response.result.hostShipId = 'dione'; },
    value => { value.response.result.unreviewed = true; },
    value => { value.response.exactReplay = true; },
    value => { value.replay = { result: { ...value.response.result } }; },
    value => { value.sourceAfter.phase = 'stale'; },
  ].entries()) {
    const mutated = structuredClone(capture);
    mutate(mutated);
    assert.equal(evaluateProcedureCapture(mutated).status, 'pending', `mutation ${index}`);
  }
  const noGroup = structuredClone(capture);
  delete noGroup.expected.groupId;
  assert.equal(evaluateProcedureCapture(noGroup).status, 'pending', 'absent caller-bound expected group');

  const automatic = structuredClone(capture);
  delete automatic.arrival.readyControl;
  automatic.arrival.captureMode = 'automatic-source-effect';
  automatic.arrival.automaticObservation = { kind: 'source-useEffect', panel: 'Shuttle departure',
    armedAt: new Date(Date.parse(automatic.arrival.before.arrivesAt) - 30_000).toISOString(),
    arrivesAt: automatic.arrival.before.arrivesAt, remainingMs: 30_000,
    responseObservedAt: new Date(Date.parse(automatic.arrival.before.arrivesAt) + 100).toISOString() };
  assert.equal(evaluateProcedureCapture(automatic).arrivalMode, 'automatic-source-effect');
  const earlyObservation = structuredClone(automatic);
  earlyObservation.arrival.automaticObservation.responseObservedAt = new Date(
    Date.parse(automatic.arrival.before.arrivesAt) - 1).toISOString();
  assert.equal(evaluateProcedureCapture(earlyObservation).status, 'pending',
    'an earlier automatic response cannot be backfilled');
  const lateArm = structuredClone(automatic);
  lateArm.arrival.automaticObservation.remainingMs = 35_001;
  assert.equal(evaluateProcedureCapture(lateArm).status, 'pending', 'observer cannot claim an arm outside 35 seconds');
});

test('the default arrival recipe captures one ready mounted action without SDK replay', async () => {
  const step = createPendingProcedureDefaultSteps()['core:completeShuttleArrival'];
  const missingWitness = makeMountedArrivalHarness();
  delete missingWitness.context.shuttleArrivalWitness;
  const missingPrepared = await step({ context: missingWitness.context, game: missingWitness.game });
  const missingResult = await captureMountedProcedureAction({ context: missingWitness.context, game: missingWitness.game,
    caseId: 'core:completeShuttleArrival', timeoutMs: 1000, ...missingPrepared });
  assert.equal(missingResult.status, 'pending');
  assert.equal(missingWitness.clickCount(), 0);

  const staleWitness = makeMountedArrivalHarness();
  staleWitness.context.shuttleArrivalWitness.groupId = 'foreign-group';
  const stalePrepared = await step({ context: staleWitness.context, game: staleWitness.game });
  const staleResult = await captureMountedProcedureAction({ context: staleWitness.context, game: staleWitness.game,
    caseId: 'core:completeShuttleArrival', timeoutMs: 1000, ...stalePrepared });
  assert.equal(staleResult.status, 'pending');
  assert.equal(staleWitness.clickCount(), 0);

  for (const options of [{ retryCount: 1 }, { completeCount: 2 },
    { completeEnabled: false }, { arrivalOffsetMs: 30_000 }]) {
    const blocked = makeMountedArrivalHarness(options);
    const blockedPrepared = await step({ context: blocked.context, game: blocked.game });
    const blockedResult = await captureMountedProcedureAction({ context: blocked.context, game: blocked.game,
      caseId: 'core:completeShuttleArrival', timeoutMs: 1000, ...blockedPrepared });
    assert.equal(blockedResult.status, 'pending', JSON.stringify(options));
    assert.equal(blocked.clickCount(), 0, JSON.stringify(options));
  }

  const harness = makeMountedArrivalHarness();
  const prepared = await step({ context: harness.context, game: harness.game });
  assert.equal(prepared.expected.groupId, 'fleet-1');
  assert.equal(prepared.expected.transitRevision, 2);
  const result = await captureMountedProcedureAction({ context: harness.context, game: harness.game,
    caseId: 'core:completeShuttleArrival', timeoutMs: 1000, ...prepared });
  assert.equal(result.status, 'completed', result.reason);
  assert.equal(harness.clickCount(), 1);
  assert.equal(harness.sdkCalls(), 0);

  const changedHolder = makeMountedArrivalHarness();
  const holderPrepared = await step({ context: changedHolder.context, game: changedHolder.game });
  const mountedAction = await holderPrepared.prepare({ surface: changedHolder.player, actor: ACTOR,
    source: changedHolder.initialState });
  assert.equal(mountedAction.offered, true);
  changedHolder.changeCurrentHolder();
  await assert.rejects(mountedAction.click(), /source arrival chain/);
  assert.equal(changedHolder.clickCount(), 0, 'a new holder cannot submit the stale prepared arrival');

  const changedDocument = makeMountedArrivalHarness();
  const documentPrepared = await step({ context: changedDocument.context, game: changedDocument.game });
  const documentAction = await documentPrepared.prepare({ surface: changedDocument.player, actor: ACTOR,
    source: changedDocument.initialState });
  assert.equal(documentAction.offered, true);
  changedDocument.changeCurrentDocumentAuthority(value => ({ ...value,
    identityHydrationRevision: value.identityHydrationRevision + 1 }));
  await assert.rejects(documentAction.click(), /source arrival chain/);
  assert.equal(changedDocument.clickCount(), 0, 'a rehydrated document cannot submit the stale prepared arrival');
});

test('the public retarget recipe carries the pre-departure group across undocking', async () => {
  const harness = makeMountedRetargetHarness();
  const step = createPendingProcedureDefaultSteps()['core:retargetShuttleTransit'];
  const prepared = await step({ context: harness.context, game: harness.game });
  assert.equal(prepared.expected.groupId, 'fleet-1', 'retarget uses caller-bound origin group after docking is gone');
  const action = await prepared.prepare({ surface: harness.player, actor: ACTOR, source: harness.state });
  assert.equal(action.offered, true, action.reason);
  assert.equal(action.transitionBefore.groupId, 'fleet-1');
  await action.click();
  assert.equal(harness.clickCount(), 1);

  for (const options of [
    { originOverrides: { groupId: 'fleet-2' } },
    { originOverrides: { uidHash: 'foreign-holder' } },
    { originOverrides: { cycle: 1 } },
    { originOverrides: { controlRevision: 3 } },
    { currentAuthorityOverrides: { connectionGeneration: 5 } },
    { currentAuthorityOverrides: { documentTimeOrigin: 1_760_000_000_001 } },
  ]) {
    const stale = makeMountedRetargetHarness(options);
    const stalePlan = await step({ context: stale.context, game: stale.game });
    const staleAction = await stalePlan.prepare({ surface: stale.player, actor: ACTOR, source: stale.state });
    assert.equal(staleAction.offered, false, JSON.stringify(options));
    assert.equal(stale.clickCount(), 0, JSON.stringify(options));
  }

  const missingOrigin = makeMountedRetargetHarness();
  delete missingOrigin.context.shuttleOriginAuthority;
  const missingPlan = await step({ context: missingOrigin.context, game: missingOrigin.game });
  const missingAction = await missingPlan.prepare({ surface: missingOrigin.player, actor: ACTOR,
    source: missingOrigin.state });
  assert.equal(missingAction.offered, false, 'no caller-bound pre-departure group means no retarget');
  assert.equal(missingOrigin.clickCount(), 0);
});

test('the public arrival recipe blocks missing or drifted same-document holder authority after retarget', async () => {
  const step = createPendingProcedureDefaultSteps()['core:completeShuttleArrival'];
  const mutations = [
    harness => harness.removeCurrentDocumentAuthority(),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, uidHash: 'foreign-holder' })),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, sessionId: 'other-session' })),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, groupId: 'fleet-2' })),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, audienceHash: 'c'.repeat(64) })),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, shuttleAuthorized: false })),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, connectionGeneration: value.connectionGeneration + 1 })),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, identityHydrationRevision: value.identityHydrationRevision + 1 })),
    harness => harness.changeCurrentDocumentAuthority(value => ({ ...value, documentTimeOrigin: value.documentTimeOrigin + 1 })),
  ];
  for (const [index, mutate] of mutations.entries()) {
    const harness = makeMountedArrivalHarness();
    mutate(harness);
    const prepared = await step({ context: harness.context, game: harness.game });
    const result = await captureMountedProcedureAction({ context: harness.context, game: harness.game,
      caseId: 'core:completeShuttleArrival', timeoutMs: 1000, ...prepared });
    assert.equal(result.status, 'pending', `authority mutation ${index}`);
    assert.equal(harness.clickCount(), 0, `authority mutation ${index} must not click`);
  }
});

test('the separate automatic arrival observer arms before natural source time and never clicks', async () => {
  const harness = makeMountedArrivalHarness({ completeCount: 0, arrivalOffsetMs: 400, automaticArrival: true });
  harness.context.shuttleArrivalCaptureMode = 'automatic-source-effect';
  const step = createPendingProcedureDefaultSteps()['core:completeShuttleArrival'];
  const prepared = await step({ context: harness.context, game: harness.game });
  const result = await captureMountedProcedureAction({ context: harness.context, game: harness.game,
    caseId: 'core:completeShuttleArrival', timeoutMs: 1000, ...prepared });
  assert.equal(result.status, 'completed', result.reason);
  assert.equal(harness.clickCount(), 0, 'automatic acceptance captures the ordinary useEffect request without a UI click');
  assert.equal(harness.sdkCalls(), 0, 'arrival is never retried through an SDK call');
  assert.equal(result.arrivalMode, 'automatic-source-effect');
});

test('capture preserves the legacy source-before shape outside shuttle arrival', async () => {
  const requestData = { sessionId: SESSION, requestId: 'highwall-request-1', expectedCycle: 2,
    expectedRevision: 7, shipId: 'icebreaker', action: 'ore' };
  const receipt = { status: 'committed', revision: 8, amount: 3 };
  let resolveResponse;
  const response = { ok: () => true, status: () => 200, json: async () => ({ result: receipt }),
    request: () => ({ method: () => 'POST', url: () => 'http://localhost/us-central1/runHighwallMining',
      postDataJSON: () => ({ data: requestData }) }) };
  const page = { on: () => {}, off: () => {}, waitForResponse: () => new Promise(resolve => { resolveResponse = resolve; }) };
  const actor = { uidHash: UID_HASH, sessionId: SESSION, profileRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner', sameActor: true, connection: 'live', freshness: 'server' };
  const sourceBefore = { live: true, sessionId: SESSION, phase: 'active', cycle: 2,
    vesselActionRevisions: { icebreaker: 7 }, shipFleetGroupIds: { icebreaker: 'fleet-1' } };
  const surface = { page, observe: async () => actor,
    callable: async () => ({ status: 'committed', result: receipt }) };
  const context = { initial: { sessionId: SESSION }, roster: [{ roleId: 'icebreaker-miner', uidHash: UID_HASH }] };
  const game = { select: async () => surface, state: async () => sourceBefore };
  const captured = await captureMountedProcedureAction({ context, game, caseId: 'core:runHighwallMining',
    expected: { sessionId: SESSION, uidHash: UID_HASH, roleId: 'icebreaker-miner', cycle: 2,
      sourceRevision: 7, groupId: 'fleet-1', shipId: 'icebreaker' },
    prepare: async () => ({ offered: true, click: async () => resolveResponse(response) }),
    inspect: async () => ({ sourceAfter: { live: true, sessionId: SESSION, cycle: 2, revision: 8, groupId: 'fleet-1' },
      rendered: { visible: true, resultStatus: 'committed' } }), deferEvaluation: true });
  const captureInputSymbol = Object.getOwnPropertySymbols(captured)[0];
  assert.ok(captureInputSymbol, 'the capture seam exposes its deferred proof input to the native regression');
  assert.deepEqual(captured[captureInputSymbol].sourceBefore,
    { live: true, sessionId: SESSION, cycle: 2, revision: 7, groupId: 'fleet-1' },
    'non-arrival capture retains the original legacy projection shape');

  const arrival = makeMountedArrivalHarness();
  const arrivalStep = createPendingProcedureDefaultSteps()['core:completeShuttleArrival'];
  const arrivalPlan = await arrivalStep({ context: arrival.context, game: arrival.game });
  const arrivalCapture = await captureMountedProcedureAction({ context: arrival.context, game: arrival.game,
    caseId: 'core:completeShuttleArrival', timeoutMs: 1000, deferEvaluation: true, ...arrivalPlan });
  const arrivalInputSymbol = Object.getOwnPropertySymbols(arrivalCapture)[0];
  assert.ok(arrivalInputSymbol);
  assert.deepEqual(arrivalCapture[arrivalInputSymbol].sourceBefore,
    { live: true, sessionId: SESSION, cycle: 2, phase: 'active', groupId: 'fleet-1' },
    'arrival alone keeps the required phase in its source-before proof');
});
