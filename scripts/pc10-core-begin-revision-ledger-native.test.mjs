import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION = 'core-begin-revision-ledger-session';
const GROUP = 'fleet-1';
const UID = 'original-wing-commander-auth-uid';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ROLE = 'wing-commander';
const SHUTTLE = 'starlight';
const HOST = 'aegis';
const DESTINATION = 'quellon';
const CYCLE = 1;
const CONTROL_REVISION = 0;
const DEPARTURE_ID = 'departure-ledger-1';
const TRANSIT_ID = 'transit-ledger-1';
const REQUESTED_AT = '2026-10-06T12:00:00.000Z';
const DEPARTED_AT = '2026-10-06T12:00:01.000Z';
const ARRIVES_AT = '2026-10-06T12:01:01.000Z';

const hashUid = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);

function requestedMovement() {
  return { status: 'requested', requestId: DEPARTURE_ID, shuttleId: SHUTTLE, holderUid: UID,
    fleetGroupId: GROUP, destinationShipId: DESTINATION, cycle: CYCLE,
    controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT };
}

function transitMovement() {
  return { status: 'in-transit', requestId: DEPARTURE_ID, transitRequestId: TRANSIT_ID,
    shuttleId: SHUTTLE, holderUid: UID, fleetGroupId: GROUP, destinationShipId: DESTINATION,
    cycle: CYCLE, controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT,
    revision: 1, currentPosition: { x: 0, y: 0, z: 0 },
    destinationPosition: { x: 1, y: 1, z: 1 }, velocity: { x: 1, y: 1, z: 1 },
    departedAt: DEPARTED_AT, arrivesAt: ARRIVES_AT };
}

function memberStore(docked) {
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1,
    me: { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION, uid: UID,
      fleetGroupId: GROUP, activeConsoleRoleId: ROLE, assignedRoleId: ROLE, connectionGeneration: 2 },
    session: { id: SESSION, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP },
      activeVesselIds: [HOST, DESTINATION], activeRoleIds: [ROLE],
      memberSessionScope: { groupId: GROUP, vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE] },
      currentActorBerthAuthority: { sessionId: SESSION, actorUid: UID, groupId: GROUP, role: 'player',
        connectionGeneration: 2, assignedRoleId: ROLE, activeConsoleRoleId: ROLE,
        replacementRoleId: null, replacementStatus: null, shipId: HOST },
      shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID,
        ownerRoleId: ROLE, revision: CONTROL_REVISION } },
      shuttleDockings: docked ? [{ shuttleId: SHUTTLE, shipId: HOST, dockedAt: '2026-10-06T11:59:00.000Z' }] : [],
    } };
}

function makeSerializedPage({ getStore, getMovement, click }) {
  const requestListeners = new Set();
  const responseWaiters = new Set();
  let visibleStatus = '';
  const calls = { evaluate: 0, movementRead: 0 };
  const store = { useSessionStore: { getState: getStore } };
  const firebase = { auth: () => ({ currentUser: { uid: UID } }), db: () => ({}) };
  const firestore = {
    doc: (_db, path) => path,
    getDoc: async () => {
      calls.movementRead++;
      return { exists: () => getMovement() !== null, data: () => structuredClone(getMovement()) };
    },
  };
  const fixtureImport = async moduleUrl => {
    if (moduleUrl === '/src/store/useSessionStore.ts') return store;
    if (moduleUrl === '/src/lib/firebase.ts') return firebase;
    if (moduleUrl === '/src/lib/firestore.ts') return { db: () => ({}) };
    if (String(moduleUrl).includes('firebase_firestore.js')) return firestore;
    throw new Error(`Unexpected serialized source import: ${String(moduleUrl)}`);
  };
  const fetchFixture = async () => ({ text: async () => 'import { getDoc } from "firebase_firestore.js";' });
  const empty = { count: async () => 0, isVisible: async () => false, isEnabled: async () => false,
    click: async () => { throw new Error('A missing mounted control must not be clicked.'); } };
  const button = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => {
      const { request, result } = await click();
      visibleStatus = 'Transit begun.';
      const requestObject = { method: () => 'POST',
        url: () => 'http://localhost:5001/demo/us-central1/beginShuttleTransit',
        postDataJSON: () => ({ data: request }) };
      const response = { request: () => requestObject, url: requestObject.url,
        ok: () => true, status: () => 200, json: async () => ({ result }) };
      for (const listener of requestListeners) listener(requestObject);
      for (const waiter of [...responseWaiters]) {
        if (waiter.predicate(response)) { responseWaiters.delete(waiter); waiter.resolve(response); }
      }
    } };
  const panel = { getByRole: (role, options = {}) => role === 'button' && options.exact === true &&
    options.name === 'Begin transit' ? button : empty };
  const page = {
    evaluate: async (callback, input) => {
      calls.evaluate++;
      const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
      return new Function('fixtureImport', 'fetch', 'crypto', 'input', `return (${source})(input);`)(
        fixtureImport, fetchFixture, webcrypto, input);
    },
    url: () => `http://localhost:5174/#/shuttles/${SHUTTLE}`,
    on: (name, listener) => { if (name === 'request') requestListeners.add(listener); },
    off: (name, listener) => { if (name === 'request') requestListeners.delete(listener); },
    waitForResponse: predicate => new Promise(resolve => responseWaiters.add({ predicate, resolve })),
    getByRole: (role, options = {}) => role === 'status'
      ? { allTextContents: async () => visibleStatus ? [visibleStatus] : [] }
      : role === 'region' && options.name === 'Shuttle departure' && options.exact === true
        ? panel : empty,
  };
  page.calls = calls;
  return page;
}

function gmSource(docked) {
  return { live: true, sessionId: SESSION, phase: 'active', cycle: CYCLE, holderGroupId: GROUP,
    activeVesselIds: [HOST, DESTINATION], activeRoleIds: [ROLE],
    shipFleetGroupIds: { [HOST]: GROUP, [DESTINATION]: GROUP },
    shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID,
      ownerRoleId: ROLE, revision: CONTROL_REVISION } },
    shuttleDockings: docked ? [{ shuttleId: SHUTTLE, shipId: HOST,
      dockedAt: '2026-10-06T11:59:00.000Z' }] : [] };
}

async function runDefaultBeginCapture(diagnosticOnly = false) {
  let currentStore = memberStore(true);
  let currentMovement = requestedMovement();
  let committedResult = null;
  let sdkRetryCount = 0;
  const page = makeSerializedPage({ getStore: () => currentStore, getMovement: () => currentMovement,
    click: async () => {
      currentStore = memberStore(false);
      currentMovement = transitMovement();
      committedResult = { status: 'in-transit', sessionId: SESSION, requestId: DEPARTURE_ID,
        transitRequestId: TRANSIT_ID, shuttleId: SHUTTLE, holderUid: UID, fleetGroupId: GROUP,
        destinationShipId: DESTINATION, cycle: CYCLE, controlRevision: CONTROL_REVISION,
        requestedAt: REQUESTED_AT, revision: 1, currentPosition: { x: 0, y: 0, z: 0 },
        destinationPosition: { x: 1, y: 1, z: 1 }, velocity: { x: 1, y: 1, z: 1 },
        departedAt: DEPARTED_AT, arrivesAt: ARRIVES_AT };
      return { request: { sessionId: SESSION, requestId: TRANSIT_ID, shuttleId: SHUTTLE,
        expectedDepartureRequestId: DEPARTURE_ID, expectedControlRevision: CONTROL_REVISION,
        expectedCycle: CYCLE }, result: committedResult };
    } });
  const actor = { sessionId: SESSION, uidHash: UID_HASH, profileRoleId: ROLE,
    activeConsoleRoleId: ROLE, assignedRoleId: ROLE, playerRole: 'player', sameActor: true,
    connection: 'live', freshness: 'server' };
  const gmActor = { sessionId: SESSION, uidHash: hashUid('live-gm-source-uid'), profileRoleId: 'gm',
    activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'owned-gm-instance',
    gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' };
  const playerSurface = { page, observe: async () => actor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async (endpoint, request) => {
      sdkRetryCount++;
      assert.equal(endpoint, 'beginShuttleTransit');
      assert.deepEqual(request, { sessionId: SESSION, requestId: TRANSIT_ID, shuttleId: SHUTTLE,
        expectedDepartureRequestId: DEPARTURE_ID, expectedControlRevision: CONTROL_REVISION,
        expectedCycle: CYCLE });
      return { status: 'committed', result: structuredClone(committedResult) };
    } };
  const gmSurface = { page, observe: async () => gmActor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  let memberReadCount = 0;
  const game = {
    select: async role => role === 'gm' ? gmSurface : playerSurface,
    state: async surface => {
      if (surface === gmSurface) return gmSource(true);
      memberReadCount++;
      return readActionState(surface, SHUTTLE);
    },
  };
  const initial = await readActionState(playerSurface, SHUTTLE);
  const originAuthority = { sessionId: SESSION, uidHash: UID_HASH, shuttleId: SHUTTLE,
    groupId: GROUP, cycle: CYCLE, controlRevision: CONTROL_REVISION,
    sourceAuthority: initial.currentDocumentAuthority };
  const context = { initial: { sessionId: SESSION, uidHash: UID_HASH },
    roster: [{ roleId: ROLE, uidHash: UID_HASH }], shuttleOriginAuthority: originAuthority,
    shuttleOriginHostShipId: HOST, ...(diagnosticOnly ? { shuttleSourceDiagnosticOnly: true } : {}) };
  const plan = await createPendingProcedureDefaultSteps()['core:beginShuttleTransit']({ context, game });
  assert.equal(plan.expected.controlRevision, CONTROL_REVISION);
  assert.equal(plan.expected.sourceRevision, CONTROL_REVISION);
  let inspected;
  const capture = await captureMountedProcedureAction({ context, game, caseId: 'core:beginShuttleTransit',
    expected: plan.expected, prepare: plan.prepare,
    inspect: async input => { inspected = await plan.inspect(input); return inspected; }, timeoutMs: 1_000 });

  return { capture, inspected, committedResult, sdkRetryCount, memberReadCount, calls: page.calls };
}

test('default Begin capture keeps control custody revision separate from transit receipt revision', async () => {
  const { capture, inspected, committedResult, sdkRetryCount, memberReadCount } = await runDefaultBeginCapture();
  assert.equal(capture.status, 'completed', capture.reason);
  assert.equal(capture.revision, CONTROL_REVISION);
  assert.equal(inspected.sourceAfter.revision, CONTROL_REVISION);
  assert.equal(inspected.transitionAfter.controlRevision, CONTROL_REVISION);
  assert.equal(inspected.transitionAfter.revision, 1);
  assert.equal(committedResult.revision, 1);
  assert.equal(inspected.sourceAfter.live, true);
  assert.equal(sdkRetryCount, 1);
  assert.ok(memberReadCount > 0);
});

test('opt-in Begin diagnostic retains redacted pre/post source authority and movement ledgers', async () => {
  const baseline = await runDefaultBeginCapture();
  const { capture, inspected, sdkRetryCount, calls } = await runDefaultBeginCapture(true);
  const tuple = capture.sourceDiagnosticOnly?.captureTuple;

  assert.ok(tuple, 'the original opt-in diagnostic should retain its already-sampled post-capture tuple');
  assert.equal(tuple.kind, 'pc10-shuttle-capture-tuple-v1');
  assert.equal(tuple.zeroCredit, true);
  for (const side of ['before', 'after']) {
    assert.deepEqual(Object.keys(tuple[side]).sort(), ['documentAuthority', 'movement', 'source']);
    assert.deepEqual(tuple[side].source, { present: true, live: true, sessionHash: hashUid(SESSION),
      cycle: CYCLE, phase: 'active', revision: CONTROL_REVISION, groupHash: hashUid(GROUP) });
    const authority = tuple[side].documentAuthority;
    assert.deepEqual(Object.keys(authority).sort(), ['audienceHash', 'authorityHash', 'connectionGeneration',
      'documentTimeOriginHash', 'groupHash', 'identityHydrationRevision', 'present', 'roleHash',
      'shuttleAuthorized', 'uidHash']);
    assert.equal(authority.present, true);
    assert.equal(authority.uidHash, UID_HASH);
    assert.equal(authority.groupHash, hashUid(GROUP));
    assert.equal(authority.roleHash, hashUid(ROLE));
    assert.equal(authority.connectionGeneration, 2);
    assert.equal(authority.identityHydrationRevision, 1);
    assert.equal(authority.shuttleAuthorized, true);
  }
  assert.deepEqual(tuple.before.movement, { present: true, exists: true, state: 'requested',
    sessionHash: hashUid(SESSION), requestHash: hashUid(DEPARTURE_ID), transitRequestHash: null,
    shuttleHash: hashUid(SHUTTLE), holderUidHash: UID_HASH, groupHash: hashUid(GROUP),
    destinationHash: hashUid(DESTINATION), cycle: CYCLE, controlRevision: CONTROL_REVISION, revision: null });
  assert.deepEqual(tuple.after.movement, { present: true, exists: true, state: 'in-transit',
    sessionHash: hashUid(SESSION), requestHash: hashUid(DEPARTURE_ID), transitRequestHash: hashUid(TRANSIT_ID),
    shuttleHash: hashUid(SHUTTLE), holderUidHash: UID_HASH, groupHash: hashUid(GROUP),
    destinationHash: hashUid(DESTINATION), cycle: CYCLE, controlRevision: CONTROL_REVISION, revision: 1 });
  for (const side of ['before', 'after']) {
    assert.match(tuple[side].documentAuthority.documentTimeOriginHash, /^[0-9a-f]{20}$/);
    assert.match(tuple[side].documentAuthority.audienceHash, /^[0-9a-f]{64}$/);
    assert.match(tuple[side].documentAuthority.authorityHash, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(tuple.before.documentAuthority, tuple.after.documentAuthority,
    'the same source document generation, hydration, and authority identity spans the capture');
  assert.equal(capture.status, 'completed', capture.reason,
    'diagnostic retention cannot change the original acceptance result');
  assert.equal(capture.revision, CONTROL_REVISION);
  assert.equal(inspected.sourceAfter.revision, CONTROL_REVISION);
  assert.equal(inspected.transitionAfter.revision, 1);
  assert.equal(sdkRetryCount, 1, 'the existing exact replay remains the only callable replay');
  assert.deepEqual(calls, baseline.calls,
    'diagnostic retention uses the same serialized projections and movement reads');
  const retained = JSON.stringify(capture.sourceDiagnosticOnly);
  for (const privateValue of [SESSION, UID, GROUP, SHUTTLE, HOST, DESTINATION, DEPARTURE_ID, TRANSIT_ID]) {
    assert.equal(retained.includes(privateValue), false, 'diagnostic omits raw private source identifiers');
  }
});
