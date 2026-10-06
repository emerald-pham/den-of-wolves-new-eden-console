import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { CORE_CRAFT_PROCEDURES, captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION_ID = 'native-core-source-order-session';
const GROUP_ID = 'fleet-core-source-order';
const CORE_UID = 'native-core-source-order-holder-auth-uid';
const CORE_ROLE = 'wing-commander';
const CORE_SHUTTLE = 'starlight';
const HOST = 'aegis';
const DESTINATION = 'dione';
const CONTROL_REVISION = 4;
const CYCLE = 1;
const REQUESTED_AT = '2026-10-06T12:00:00.000Z';
const DEPARTED_AT = '2026-10-06T12:00:01.000Z';
const ARRIVES_AT = '2026-10-06T12:01:01.000Z';

const hashUid = async uid => {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

function coreStoreState() {
  const me = { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION_ID,
    uid: CORE_UID, fleetGroupId: GROUP_ID, activeConsoleRoleId: CORE_ROLE, assignedRoleId: CORE_ROLE,
    connectionGeneration: 6 };
  const session = { id: SESSION_ID, currentTurn: CYCLE, phase: 'active',
    playerDiscovery: { groupId: GROUP_ID }, activeVesselIds: [HOST, DESTINATION], activeRoleIds: [CORE_ROLE],
    memberSessionScope: { groupId: GROUP_ID, vesselIds: [HOST, DESTINATION], craftIds: [CORE_SHUTTLE] },
    currentActorBerthAuthority: { sessionId: SESSION_ID, actorUid: CORE_UID, groupId: GROUP_ID,
      role: 'player', connectionGeneration: 6, assignedRoleId: CORE_ROLE,
      activeConsoleRoleId: CORE_ROLE, replacementRoleId: null, replacementStatus: null, shipId: HOST },
    shuttleControl: { [CORE_SHUTTLE]: { shuttleId: CORE_SHUTTLE, holderUid: CORE_UID,
      revision: CONTROL_REVISION, ownerRoleId: CORE_ROLE } },
    shuttleDockings: [{ shuttleId: CORE_SHUTTLE, shipId: HOST, dockedAt: REQUESTED_AT }],
  };
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 9, me, session };
}

function requestedMovement() {
  return { status: 'requested', requestId: 'departure-request-1', shuttleId: CORE_SHUTTLE,
    holderUid: CORE_UID, fleetGroupId: GROUP_ID, originShipId: HOST, destinationShipId: DESTINATION,
    cycle: CYCLE, controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT };
}

function transitMovement() {
  return { status: 'in-transit', requestId: 'departure-request-1', transitRequestId: 'transit-request-1',
    shuttleId: CORE_SHUTTLE, holderUid: CORE_UID, fleetGroupId: GROUP_ID,
    destinationShipId: DESTINATION, cycle: CYCLE, controlRevision: CONTROL_REVISION, revision: 1,
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 },
    velocity: { x: 1, y: 1, z: 1 }, requestedAt: REQUESTED_AT, departedAt: DEPARTED_AT,
    arrivesAt: ARRIVES_AT };
}

function transitResult() {
  const movement = transitMovement();
  return { status: 'in-transit', sessionId: SESSION_ID, requestId: movement.requestId,
    transitRequestId: movement.transitRequestId, shuttleId: movement.shuttleId, holderUid: movement.holderUid,
    fleetGroupId: movement.fleetGroupId, destinationShipId: movement.destinationShipId,
    cycle: movement.cycle, controlRevision: movement.controlRevision, requestedAt: movement.requestedAt,
    revision: movement.revision, currentPosition: movement.currentPosition,
    destinationPosition: movement.destinationPosition, velocity: movement.velocity,
    departedAt: movement.departedAt, arrivesAt: movement.arrivesAt };
}

function makeSerializedPage({ stateRef, movementSnapshots, onMovementRead }) {
  const calls = { evaluate: 0, store: 0, auth: 0, fetch: 0, doc: 0, getDoc: 0, events: [] };
  const store = { useSessionStore: { getState: () => {
    calls.store++;
    const dockingCount = stateRef.current.session.shuttleDockings.length;
    calls.events.push(`store:dockings=${dockingCount}`);
    return stateRef.current;
  } } };
  const firebase = { auth: () => { calls.auth++; return { currentUser: { uid: CORE_UID } }; } };
  const firestore = {
    doc: (_db, path) => { calls.doc++; return path; },
    getDoc: async path => {
      calls.getDoc++;
      const value = movementSnapshots.shift();
      if (value === undefined) throw new Error(`Unexpected movement read for ${path}`);
      calls.events.push(`movement-read:${value?.status ?? 'missing'}`);
      await onMovementRead?.(value, calls);
      return { exists: () => value !== null, data: () => value ?? undefined };
    },
  };
  const fixtureImport = async moduleUrl => {
    if (moduleUrl === '/src/store/useSessionStore.ts') return store;
    if (moduleUrl === '/src/lib/firebase.ts') return firebase;
    if (moduleUrl === '/src/lib/firestore.ts') return { db: () => ({}) };
    if (String(moduleUrl).includes('firebase_firestore.js')) return firestore;
    throw new Error(`Unexpected serialized source import: ${String(moduleUrl)}`);
  };
  const fetchFixture = async () => {
    calls.fetch++;
    return { text: async () => 'import { getDoc } from "firebase_firestore.js";' };
  };
  const page = { evaluate: async (callback, input) => {
    calls.evaluate++;
    const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
    const execute = new Function('fixtureImport', 'fetch', 'crypto', 'input', `return (${source})(input);`);
    return execute(fixtureImport, fetchFixture, webcrypto, input);
  } };
  return { page, calls };
}

async function makeCaptureHarness({ deferUndockingToMovementRead = false, retainDocking = false,
  postState } = {}) {
  const stateRef = { current: coreStoreState() };
  const events = [];
  const serialized = makeSerializedPage({ stateRef,
    movementSnapshots: [requestedMovement(), requestedMovement(), requestedMovement(), transitMovement()],
    onMovementRead: async (movement, calls) => {
      if (deferUndockingToMovementRead && movement?.status === 'in-transit') {
        const projected = coreStoreState();
        if (!retainDocking) projected.session.shuttleDockings = [];
        if (postState) stateRef.current = postState(projected) ?? projected;
        else stateRef.current = projected;
        calls.events.push(`projection-update:dockings=${stateRef.current.session.shuttleDockings.length}`);
      }
    } });
  const actorHash = await hashUid(CORE_UID);
  const actor = { sessionId: SESSION_ID, uidHash: actorHash, profileRoleId: CORE_ROLE,
    activeConsoleRoleId: CORE_ROLE, assignedRoleId: CORE_ROLE, playerRole: 'player',
    sameActor: true, connection: 'live', freshness: 'server' };
  const gmActor = { sessionId: SESSION_ID, uidHash: await hashUid('native-owned-gm-source'),
    profileRoleId: 'gm', activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm',
    instanceId: 'gm-source-instance', sameActor: true, gmInstanceOwned: true,
    connection: 'live', freshness: 'server' };
  const pageEvents = new Map();
  const request = { sessionId: SESSION_ID, requestId: 'transit-request-1', shuttleId: CORE_SHUTTLE,
    expectedDepartureRequestId: 'departure-request-1', expectedControlRevision: CONTROL_REVISION,
    expectedCycle: CYCLE };
  const resultAfter = transitResult();
  const response = { request: () => ({ method: () => 'POST',
      url: () => 'http://localhost:5001/demo/us-central1/beginShuttleTransit',
      postDataJSON: () => ({ data: request }) }),
    url: () => 'http://localhost:5001/demo/us-central1/beginShuttleTransit',
    status: () => 200, ok: () => true, json: async () => ({ result: resultAfter }) };
  const beginButton = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => {
      events.push('mounted-click');
      if (!deferUndockingToMovementRead) {
        const projected = coreStoreState();
        projected.session.shuttleDockings = [];
        stateRef.current = postState ? postState(projected) ?? projected : projected;
      }
    } };
  const panel = { getByRole: (role, options = {}) => role === 'button' &&
      options.name === 'Begin transit' && options.exact === true ? beginButton : { count: async () => 0 } };
  Object.assign(serialized.page, {
    url: () => `http://localhost:5174/#/shuttles/${CORE_SHUTTLE}`,
    getByRole: (role, options = {}) => role === 'region' && options.name === 'Shuttle departure' && options.exact === true
      ? panel : role === 'status' ? { allTextContents: async () => ['Transit begun.'] } : { count: async () => 0 },
    locator: () => ({ count: async () => 0 }),
    on: (event, handler) => { pageEvents.set(event, [...(pageEvents.get(event) ?? []), handler]); },
    off: (event, handler) => { pageEvents.set(event, (pageEvents.get(event) ?? []).filter(value => value !== handler)); },
    waitForResponse: async predicate => { assert.equal(predicate(response), true); return response; },
  });
  const surface = { page: serialized.page, observe: async () => actor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async (endpoint, payload) => {
      assert.equal(endpoint, 'beginShuttleTransit');
      assert.deepEqual(payload, request);
      return { status: 'committed', result: { ...resultAfter, status: 'replayed' } };
    } };
  const gmSurface = { ...surface, observe: async () => gmActor };
  const game = { select: async roleId => roleId === 'gm' ? gmSurface : surface,
    state: async () => ({ live: true, sessionId: SESSION_ID, cycle: CYCLE, phase: 'active',
      revision: CONTROL_REVISION, groupId: GROUP_ID, activeVesselIds: [HOST, DESTINATION],
      shuttleControl: stateRef.current.session.shuttleControl,
      shuttleDockings: stateRef.current.session.shuttleDockings,
      shipFleetGroupIds: { [HOST]: GROUP_ID, [DESTINATION]: GROUP_ID } }) };
  const originSource = await readActionState(surface, CORE_SHUTTLE);
  assert.ok(originSource.currentDocumentAuthority, 'fixture binds normal current document authority');
  const origin = { sessionId: SESSION_ID, uidHash: actorHash, shuttleId: CORE_SHUTTLE,
    groupId: GROUP_ID, cycle: CYCLE, controlRevision: CONTROL_REVISION,
    sourceAuthority: originSource.currentDocumentAuthority };
  const context = { initial: { sessionId: SESSION_ID }, roster: [{ roleId: CORE_ROLE, uidHash: actorHash }],
    shuttleOriginAuthority: origin, shuttleOriginHostShipId: HOST, shuttleSourceDiagnosticOnly: true };
  const spec = CORE_CRAFT_PROCEDURES.find(row => row.endpoint === 'beginShuttleTransit');
  const prepared = await createPendingProcedureDefaultSteps()[spec.id]({ context, game, spec });
  serialized.calls.evaluate = 0;
  serialized.calls.store = 0;
  serialized.calls.auth = 0;
  serialized.calls.fetch = 0;
  serialized.calls.doc = 0;
  serialized.calls.getDoc = 0;
  serialized.calls.events.length = 0;
  events.length = 0;
  const outcome = await captureMountedProcedureAction({ context, game, caseId: spec.id, ...prepared });
  return { outcome, calls: serialized.calls, events: serialized.calls.events, clickEvents: events };
}

test('Core Begin samples the current member projection after its existing movement read', async () => {
  const immediate = await makeCaptureHarness();
  assert.equal(immediate.outcome.status, 'completed', immediate.outcome.reason);
  const delayed = await makeCaptureHarness({ deferUndockingToMovementRead: true });
  const tuple = delayed.outcome.sourceDiagnosticOnly?.captureTuple?.postInspectPredicates;
  assert.equal(delayed.outcome.status, 'completed',
    `the in-flight source update should be sampled after the existing movement read: ${JSON.stringify({ tuple,
      events: delayed.events })}`);
  assert.equal(delayed.clickEvents.length, 1, 'one mounted Begin control caused the projection update');
  assert.deepEqual(tuple.member.dockingCount, 0);
  assert.equal(tuple.member.dockingStateMatches, true);
  assert.equal(tuple.member.memberGroupAvailable, true);
  assert.equal(tuple.member.memberGroupMatchesOrigin, true);
  assert.equal(tuple.member.memberGroupMatchesExpected, true);
  assert.equal(tuple.authority.originAuthorityMatches, true);
  assert.equal(tuple.authority.sameCurrentDocumentAuthority, true);
  const movementRead = delayed.events.indexOf('movement-read:in-transit');
  const projectionUpdate = delayed.events.indexOf('projection-update:dockings=0');
  const currentSample = delayed.events.lastIndexOf('store:dockings=0');
  assert.ok(movementRead >= 0 && projectionUpdate > movementRead && currentSample > projectionUpdate,
    `current serialized source sample follows movement read and projection update: ${delayed.events.join(', ')}`);
  assert.equal(delayed.calls.getDoc, immediate.calls.getDoc, 'reordering retains the existing movement-read count');
  assert.equal(delayed.calls.evaluate, immediate.calls.evaluate, 'reordering retains the existing page-evaluation count');
  assert.equal(delayed.calls.fetch, immediate.calls.fetch, 'reordering retains the existing Firestore-module fetch count');

  const retainedDocking = await makeCaptureHarness({ deferUndockingToMovementRead: true, retainDocking: true });
  assert.equal(retainedDocking.outcome.status, 'pending', 'a genuinely retained docking stays blocked');
  assert.equal(retainedDocking.outcome.reason, 'live-source-cycle-revision-or-group-changed');
  const retainedTuple = retainedDocking.outcome.sourceDiagnosticOnly.captureTuple.postInspectPredicates;
  assert.equal(retainedTuple.member.dockingCount, 1);
  assert.equal(retainedTuple.member.dockingStateMatches, false);
  assert.equal(retainedTuple.member.memberGroupAvailable, false);

  const wrongScope = await makeCaptureHarness({ deferUndockingToMovementRead: true,
    postState: state => {
      state.session.memberSessionScope.vesselIds = [HOST];
      return state;
    } });
  assert.equal(wrongScope.outcome.status, 'pending', 'the reordered sample still rejects destination scope drift');
  const scopeTuple = wrongScope.outcome.sourceDiagnosticOnly.captureTuple.postInspectPredicates;
  assert.equal(scopeTuple.member.dockingStateMatches, true);
  assert.equal(scopeTuple.member.destinationInMemberScope, false);
  assert.equal(scopeTuple.authority.sameCurrentDocumentAuthority, false);
  assert.equal(scopeTuple.member.memberGroupAvailable, false);
});
