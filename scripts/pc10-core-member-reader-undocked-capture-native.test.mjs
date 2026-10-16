import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION = 'core-reader-undocked-session';
const GROUP = 'fleet-1';
const UID = 'core-reader-original-holder-auth-uid';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const ROLE = 'wing-commander';
const SHUTTLE = 'starlight';
const HOST = 'aegis';
const DESTINATION = 'quellon';
const CYCLE = 1;
const CONTROL_REVISION = 0;
const DEPARTURE_ID = 'core-reader-departure';
const TRANSIT_ID = 'core-reader-transit';
const REQUESTED_AT = '2026-10-06T12:00:00.000Z';
const DEPARTED_AT = '2026-10-06T12:00:01.000Z';
const ARRIVES_AT = '2026-10-06T12:01:01.000Z';

function currentMemberStore({ docked, discovery = true, scopePatch = {}, authRole = ROLE } = {}) {
  const scope = { groupId: GROUP, vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE], ...scopePatch };
  const session = { id: SESSION, currentTurn: CYCLE, phase: 'active',
    ...(discovery ? { playerDiscovery: { groupId: GROUP, revision: 5, fleetGroupVesselIds: [HOST, DESTINATION] } } : {}),
    activeVesselIds: [HOST, DESTINATION], activeRoleIds: [ROLE],
    memberSessionScope: scopePatch === null ? null : scope,
    currentActorBerthAuthority: { sessionId: SESSION, actorUid: UID, groupId: GROUP, role: 'player',
      connectionGeneration: 2, assignedRoleId: ROLE, activeConsoleRoleId: ROLE,
      replacementRoleId: null, replacementStatus: null, shipId: HOST },
    shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID,
      ownerRoleId: ROLE, revision: CONTROL_REVISION } },
    shuttleDockings: docked ? [{ shuttleId: SHUTTLE, shipId: HOST,
      dockedAt: '2026-10-06T11:59:00.000Z' }] : [],
  };
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1,
    me: { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION, uid: UID,
      fleetGroupId: GROUP, activeConsoleRoleId: authRole, assignedRoleId: authRole, connectionGeneration: 2 },
    session };
}

function requestedMovement() {
  return { status: 'requested', requestId: DEPARTURE_ID, shuttleId: SHUTTLE, holderUid: UID,
    fleetGroupId: GROUP, originShipId: HOST, destinationShipId: DESTINATION, cycle: CYCLE,
    controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT };
}

function transitMovement() {
  return { status: 'in-transit', requestId: DEPARTURE_ID, transitRequestId: TRANSIT_ID,
    shuttleId: SHUTTLE, holderUid: UID, fleetGroupId: GROUP, destinationShipId: DESTINATION,
    cycle: CYCLE, controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT, revision: 1,
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 },
    velocity: { x: 1, y: 1, z: 1 }, departedAt: DEPARTED_AT, arrivesAt: ARRIVES_AT };
}

function makeSerializedPage({ getStore, getMovement, authUid = UID, click = async () => {
  throw new Error('A read-only or blocked source path must not click.');
} }) {
  const requestListeners = new Set();
  const responseWaiters = new Set();
  const reads = { pageEvaluations: 0, memberReaderEvaluations: 0, movementReads: 0 };
  const readerSnapshots = [];
  let visibleStatus = '';
  const store = { useSessionStore: { getState: getStore } };
  const firebase = { auth: () => ({ currentUser: authUid === null ? null : { uid: authUid } }), db: () => ({}) };
  const firestore = { doc: (_db, path) => path,
    getDoc: async () => {
      reads.movementReads++;
      const movement = getMovement();
      return { exists: () => movement !== null, data: () => structuredClone(movement) };
    } };
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
  const beginButton = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
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
    options.name === 'Begin transit' ? beginButton : empty };
  const page = {
    evaluate: async (callback, input) => {
      reads.pageEvaluations++;
      if (input && Object.hasOwn(input, 'moduleUrl') && !Object.hasOwn(input, 'sessionId')) {
        reads.memberReaderEvaluations++;
      }
      const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
      const value = await new Function('fixtureImport', 'fetch', 'crypto', 'input', `return (${source})(input);`)(
        fixtureImport, fetchFixture, webcrypto, input);
      if (input && Object.hasOwn(input, 'moduleUrl') && !Object.hasOwn(input, 'sessionId')) {
        readerSnapshots.push(structuredClone(value));
      }
      return value;
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
  return { page, reads, readerSnapshots };
}

function gmSource(docked) {
  return { live: true, sessionId: SESSION, phase: 'active', cycle: CYCLE, holderGroupId: GROUP,
    activeVesselIds: [HOST, DESTINATION], activeRoleIds: [ROLE],
    shipFleetGroupIds: { [HOST]: GROUP, [DESTINATION]: GROUP },
    shuttleControl: { [SHUTTLE]: { shuttleId: SHUTTLE, holderUid: UID,
      ownerRoleId: ROLE, revision: CONTROL_REVISION } },
    shuttleDockings: docked ? [{ shuttleId: SHUTTLE, shipId: HOST,
      dockedAt: '2026-10-06T11:59:00.000Z' }] : [],
  };
}

async function runBeginCapture({ removeDiscoveryAfterBegin = false, initialState = currentMemberStore({ docked: true }),
  authUid = UID } = {}) {
  let currentStore = initialState;
  let movement = requestedMovement();
  let committedResult;
  let exactReplayCount = 0;
  const serialized = makeSerializedPage({ getStore: () => currentStore, getMovement: () => movement,
    authUid, click: async () => {
      currentStore = currentMemberStore({ docked: false, discovery: !removeDiscoveryAfterBegin });
      movement = transitMovement();
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
  const { page } = serialized;
  const actor = { sessionId: SESSION, uidHash: UID_HASH, profileRoleId: ROLE,
    activeConsoleRoleId: ROLE, assignedRoleId: ROLE, playerRole: 'player', sameActor: true,
    connection: 'live', freshness: 'server' };
  const gmActor = { sessionId: SESSION, uidHash: 'd013f0dced1cf943', profileRoleId: 'gm',
    activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'native-owned-gm',
    gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' };
  const playerSurface = { page, observe: async () => actor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async (endpoint, request) => {
      exactReplayCount++;
      assert.equal(endpoint, 'beginShuttleTransit');
      assert.deepEqual(request, { sessionId: SESSION, requestId: TRANSIT_ID, shuttleId: SHUTTLE,
        expectedDepartureRequestId: DEPARTURE_ID, expectedControlRevision: CONTROL_REVISION,
        expectedCycle: CYCLE });
      return { status: 'committed', result: structuredClone(committedResult) };
    } };
  const gmSurface = { page, observe: async () => gmActor, storeModuleUrl: playerSurface.storeModuleUrl };
  const game = { select: async roleId => roleId === 'gm' ? gmSurface : playerSurface,
    state: async surface => surface === gmSurface ? gmSource(true) : readActionState(surface, SHUTTLE) };
  const initial = await readActionState(playerSurface, SHUTTLE);
  const originAuthority = { sessionId: SESSION, uidHash: UID_HASH, shuttleId: SHUTTLE,
    groupId: GROUP, cycle: CYCLE, controlRevision: CONTROL_REVISION,
    sourceAuthority: initial.currentDocumentAuthority };
  const context = { initial: { sessionId: SESSION, uidHash: UID_HASH },
    roster: [{ roleId: ROLE, uidHash: UID_HASH }], shuttleOriginAuthority: originAuthority,
    shuttleOriginHostShipId: HOST, shuttleSourceDiagnosticOnly: true };
  const plan = await createPendingProcedureDefaultSteps()['core:beginShuttleTransit']({ context, game });
  let inspected;
  const capture = await captureMountedProcedureAction({ context, game, caseId: 'core:beginShuttleTransit',
    expected: plan.expected, prepare: plan.prepare,
    inspect: async input => { inspected = await plan.inspect(input); return inspected; }, timeoutMs: 1_000 });
  return { capture, inspected, initial, plan, originAuthority, currentStore, committedResult,
    readerSnapshots: serialized.readerSnapshots, reads: serialized.reads, exactReplayCount };
}

test('full current member reader and default Begin capture preserve the valid undocked transit source tuple', async () => {
  const result = await runBeginCapture();
  const postReader = result.readerSnapshots.at(-1);

  assert.ok(result.initial.currentDocumentAuthority);
  assert.deepEqual(result.initial.currentMemberScope, { groupId: GROUP,
    vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE] });
  assert.equal(result.initial.holderGroupId, GROUP);
  assert.equal(Object.hasOwn(result.initial, 'shipFleetGroupIds'), true);
  assert.equal(result.initial.shipFleetGroupIds, undefined,
    'the actual member reader input provides no GM vessel-group map');
  assert.equal(result.capture.status, 'completed', result.capture.reason);
  assert.equal(result.plan.expected.sourceRevision, CONTROL_REVISION);
  assert.equal(result.inspected.sourceAfter.live, true);
  assert.equal(result.inspected.transitionAfter.status, 'in-transit');
  assert.equal(result.inspected.transitionAfter.revision, 1);
  assert.deepEqual(postReader.shuttleDockings, [], 'the post-state is the normal undocked transit projection');
  assert.deepEqual(postReader.currentMemberScope, { groupId: GROUP,
    vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE] });
  assert.equal(postReader.currentDocumentAuthority.connectionGeneration, 2);
  assert.equal(postReader.currentDocumentAuthority.identityHydrationRevision, 1);
  assert.equal(postReader.currentDocumentAuthority.authorityHash,
    result.initial.currentDocumentAuthority.authorityHash);
  assert.equal(postReader.currentDocumentAuthority.audienceHash,
    result.initial.currentDocumentAuthority.audienceHash);
  assert.equal(postReader.holderGroupId, GROUP);
  assert.equal(result.exactReplayCount, 1);
  assert.ok(result.reads.movementReads > 0);
});

test('characterize Begin guard when a synthetic poststate omits separate group discovery', async () => {
  const result = await runBeginCapture({ removeDiscoveryAfterBegin: true });
  const postReader = result.readerSnapshots.at(-1);
  const tuple = result.capture.sourceDiagnosticOnly?.captureTuple;

  assert.equal(result.capture.reason, 'live-source-cycle-revision-or-group-changed');
  assert.equal(tuple.kind, 'pc10-shuttle-capture-tuple-v1');
  assert.equal(tuple.zeroCredit, true);
  assert.equal(tuple.before.source.live, true);
  assert.equal(tuple.after.source.live, false);
  assert.equal(tuple.before.source.groupHash, tuple.after.source.groupHash);
  assert.equal(tuple.before.movement.state, 'requested');
  assert.equal(tuple.after.movement.state, 'in-transit');
  assert.equal(tuple.after.movement.revision, 1);
  assert.equal(JSON.stringify(tuple).includes(SESSION), false);
  assert.equal(JSON.stringify(tuple).includes(UID), false);
  assert.equal(postReader.live, true);
  assert.equal(postReader.holderGroupId, undefined);
  assert.equal(postReader.currentDocumentAuthority.authorityHash,
    result.initial.currentDocumentAuthority.authorityHash);
  assert.deepEqual(postReader.currentMemberScope, { groupId: GROUP,
    vesselIds: [HOST, DESTINATION], craftIds: [SHUTTLE] });
  assert.deepEqual(postReader.shuttleDockings, []);
  assert.equal(tuple.after.source.live, false);
  assert.equal(tuple.after.documentAuthority.authorityHash,
    tuple.before.documentAuthority.authorityHash);
  assert.equal(tuple.after.movement.state, 'in-transit');
  assert.equal(tuple.after.movement.revision, 1);
  assert.equal(result.exactReplayCount, 1);
  assert.equal(result.capture.status, 'pending');
});

test('the serialized reader denies foreign Auth/scope/null and the planner rejects an ambiguous vessel audience', async t => {
  const cases = [
    { name: 'foreign Auth UID', state: currentMemberStore({ docked: true }), authUid: 'foreign-auth-uid',
      currentDocumentAuthority: false, currentMemberScope: false },
    { name: 'foreign fleet scope', state: currentMemberStore({ docked: true,
      scopePatch: { groupId: 'fleet-2' } }), authUid: UID,
      currentDocumentAuthority: false, currentMemberScope: false },
    { name: 'null member scope', state: currentMemberStore({ docked: true,
      scopePatch: null }), authUid: UID,
      currentDocumentAuthority: false, currentMemberScope: false },
    { name: 'duplicate vessel audience', state: currentMemberStore({ docked: true,
      scopePatch: { vesselIds: [HOST, HOST, DESTINATION] } }), authUid: UID,
      currentDocumentAuthority: true, currentMemberScope: true },
  ];

  for (const item of cases) await t.test(item.name, async () => {
    const serialized = makeSerializedPage({ getStore: () => item.state, getMovement: () => requestedMovement(),
      authUid: item.authUid });
    const surface = { page: serialized.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
    const source = await readActionState(surface, SHUTTLE);
    assert.equal(!!source.currentDocumentAuthority, item.currentDocumentAuthority);
    assert.equal(!!source.currentMemberScope, item.currentMemberScope);
    if (item.name === 'duplicate vessel audience') {
      const actor = { sessionId: SESSION, uidHash: UID_HASH, profileRoleId: ROLE,
        activeConsoleRoleId: ROLE, assignedRoleId: ROLE, playerRole: 'player', sameActor: true,
        connection: 'live', freshness: 'server' };
      const gmActor = { sessionId: SESSION, uidHash: 'd013f0dced1cf943', profileRoleId: 'gm',
        activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'native-owned-gm',
        gmInstanceOwned: true, sameActor: true, connection: 'live', freshness: 'server' };
      const playerSurface = { ...surface, observe: async () => actor };
      const gmSurface = { ...surface, observe: async () => gmActor };
      const game = { select: async roleId => roleId === 'gm' ? gmSurface : playerSurface,
        state: async target => target === gmSurface ? gmSource(true) : readActionState(target, SHUTTLE) };
      const uidHash = UID_HASH;
      const originAuthority = { sessionId: SESSION, uidHash, shuttleId: SHUTTLE, groupId: GROUP,
        cycle: CYCLE, controlRevision: CONTROL_REVISION, sourceAuthority: source.currentDocumentAuthority };
      const context = { initial: { sessionId: SESSION, uidHash }, roster: [{ roleId: ROLE, uidHash }],
        shuttleOriginAuthority: originAuthority, shuttleOriginHostShipId: HOST };
      const plan = await createPendingProcedureDefaultSteps()['core:beginShuttleTransit']({ context, game });
      assert.equal((await plan.prepare({})).offered, false);
      assert.equal(plan.expected.groupId, undefined,
        'the duplicate audience must not be normalized or replaced by GM scope');
    }
  });
});
