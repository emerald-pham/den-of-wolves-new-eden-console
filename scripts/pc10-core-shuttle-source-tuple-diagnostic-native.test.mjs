import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { CORE_CRAFT_PROCEDURES, captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION_ID = 'native-core-source-session';
const GROUP_ID = 'fleet-core-source';
const CORE_UID = 'native-core-source-holder-auth-uid';
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
    shipFleetGroupIds: { [HOST]: GROUP_ID, [DESTINATION]: GROUP_ID },
  };
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 9, me, session };
}

function requestedMovement() {
  return { status: 'requested', requestId: 'departure-request-1', shuttleId: CORE_SHUTTLE,
    holderUid: CORE_UID, fleetGroupId: GROUP_ID, originShipId: HOST, destinationShipId: DESTINATION,
    cycle: CYCLE, controlRevision: CONTROL_REVISION, requestedAt: REQUESTED_AT };
}

function transitMovement(overrides = {}) {
  return { status: 'in-transit', requestId: 'departure-request-1', transitRequestId: 'transit-request-1',
    shuttleId: CORE_SHUTTLE, holderUid: CORE_UID, fleetGroupId: GROUP_ID,
    destinationShipId: DESTINATION, cycle: CYCLE, controlRevision: CONTROL_REVISION, revision: 1,
    currentPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 1, y: 1, z: 1 },
    velocity: { x: 1, y: 1, z: 1 }, requestedAt: REQUESTED_AT, departedAt: DEPARTED_AT,
    arrivesAt: ARRIVES_AT, ...overrides };
}

function transitResult(overrides = {}) {
  const movement = transitMovement(overrides);
  return { status: 'in-transit', sessionId: SESSION_ID, requestId: movement.requestId,
    transitRequestId: movement.transitRequestId, shuttleId: movement.shuttleId, holderUid: movement.holderUid,
    fleetGroupId: movement.fleetGroupId, destinationShipId: movement.destinationShipId,
    cycle: movement.cycle, controlRevision: movement.controlRevision, requestedAt: movement.requestedAt,
    revision: movement.revision, currentPosition: movement.currentPosition,
    destinationPosition: movement.destinationPosition, velocity: movement.velocity,
    departedAt: movement.departedAt, arrivesAt: movement.arrivesAt };
}

function makeSerializedPage({ stateRef, movementSnapshots }) {
  const calls = { evaluate: 0, store: 0, auth: 0, fetch: 0, doc: 0, getDoc: 0 };
  const store = { useSessionStore: { getState: () => { calls.store++; return stateRef.current; } } };
  const firebase = { auth: () => { calls.auth++; return { currentUser: { uid: CORE_UID } }; } };
  const firestore = {
    doc: (_db, path) => { calls.doc++; return path; },
    getDoc: async path => {
      calls.getDoc++;
      const value = movementSnapshots.shift();
      if (value === undefined) throw new Error(`Unexpected movement read for ${path}`);
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

async function makeCaptureHarness({ postState, movementAfter = transitMovement(), resultAfter = transitResult(),
  diagnosticOnly = true } = {}) {
  const stateRef = { current: coreStoreState() };
  const serialized = makeSerializedPage({ stateRef,
    movementSnapshots: [requestedMovement(), requestedMovement(), requestedMovement(), movementAfter] });
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
  const response = { request: () => ({ method: () => 'POST',
      url: () => 'http://localhost:5001/demo/us-central1/beginShuttleTransit',
      postDataJSON: () => ({ data: request }) }),
    url: () => 'http://localhost:5001/demo/us-central1/beginShuttleTransit',
    status: () => 200, ok: () => true, json: async () => ({ result: resultAfter }) };
  let clickCount = 0;
  const beginButton = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => {
      clickCount++;
      const after = coreStoreState();
      after.session.shuttleDockings = [];
      if (postState) stateRef.current = postState(after) ?? after;
      else stateRef.current = after;
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
  const selections = [];
  const game = { select: async (roleId, options) => {
    selections.push({ roleId, options });
    return roleId === 'gm' ? gmSurface : surface;
  },
  state: async () => ({ live: true, sessionId: SESSION_ID, cycle: CYCLE, phase: 'active',
    revision: CONTROL_REVISION, groupId: GROUP_ID, activeVesselIds: [HOST, DESTINATION],
    shuttleControl: stateRef.current.session.shuttleControl,
    shuttleDockings: stateRef.current.session.shuttleDockings,
    shipFleetGroupIds: stateRef.current.session.shipFleetGroupIds }) };

  const originSource = await readActionState(surface, CORE_SHUTTLE);
  assert.ok(originSource.currentDocumentAuthority, 'fixture produces normal current source authority');
  const origin = { sessionId: SESSION_ID, uidHash: actorHash, shuttleId: CORE_SHUTTLE,
    groupId: GROUP_ID, cycle: CYCLE, controlRevision: CONTROL_REVISION,
    sourceAuthority: originSource.currentDocumentAuthority };
  const context = { initial: { sessionId: SESSION_ID }, roster: [{ roleId: CORE_ROLE, uidHash: actorHash }],
    shuttleOriginAuthority: origin, shuttleOriginHostShipId: HOST,
    ...(diagnosticOnly ? { shuttleSourceDiagnosticOnly: true } : {}) };
  const initialSpec = CORE_CRAFT_PROCEDURES.find(spec => spec.endpoint === 'beginShuttleTransit');
  const prepared = await createPendingProcedureDefaultSteps()[initialSpec.id]({ context, game, spec: initialSpec });
  serialized.calls.evaluate = 0;
  serialized.calls.store = 0;
  serialized.calls.auth = 0;
  serialized.calls.fetch = 0;
  serialized.calls.doc = 0;
  serialized.calls.getDoc = 0;
  const outcome = await captureMountedProcedureAction({ context, game, caseId: initialSpec.id, ...prepared });
  return { outcome, serialized, clickCount, selections, origin };
}

const expectedPredicateDiagnostic = {
  kind: 'pc10-core-shuttle-post-inspect-predicate-diagnostic-v1', zeroCredit: true,
  source: { latestLive: true, sessionMatches: true, cycleMatches: true, phaseActive: true,
    liveStateCurrent: true, holderGroupMatchesOrigin: true, memberScopeGroupMatchesOrigin: true },
  authority: { originAuthorityMatches: true, sameCurrentDocumentAuthority: true,
    currentDocumentAuthorityPresent: true,
    currentControlCraftMatches: true, currentControlHolderMatchesOrigin: true,
    currentControlRevisionMatchesOrigin: true },
  member: { originHostPresent: true, dockingCount: 0, dockingStateMatches: true,
    memberScopeMatches: true, originHostInMemberScope: true, originHostActive: true,
    destinationDiffersFromOriginHost: true, destinationInMemberScope: true, destinationActive: true,
    memberGroupAvailable: true, memberGroupMatchesOrigin: true, memberGroupMatchesExpected: true },
  movement: { recordPresent: true, missing: false, unreadable: false, state: 'in-transit', revision: 1, statusMatches: true,
    shuttleMatches: true, holderMatchesOrigin: true, groupMatchesOrigin: true,
    controlRevisionMatchesOrigin: true, cycleMatches: true, destinationMatchesSelected: true,
    currentControlRevisionMatchesOrigin: true, destinationDiffersFromOriginHost: true,
    resultDestinationMatches: true, sourceTupleCurrent: true, movementTupleCurrent: true,
    requestOriginMatchesHost: null },
};

test('Core movement opt-in capture retains exact post-inspect source, authority, scope and movement predicates', async () => {
  const normal = await makeCaptureHarness();
  assert.equal(normal.outcome.status, 'completed', normal.outcome.reason);
  const normalDiagnostic = normal.outcome.sourceDiagnosticOnly?.captureTuple?.postInspectPredicates;
  assert.deepEqual(normalDiagnostic, expectedPredicateDiagnostic,
    'the public default recipe and full capture must preserve the inspector predicate tuple');
  assert.equal(normal.outcome.sourceDiagnosticOnly.captureTuple.after.source.groupHash, await hashUid(GROUP_ID),
    'the post-sample hash identifies the member scope group without exposing its value');
  assert.equal(normal.clickCount, 1, 'one visible mounted Begin action was captured');
  assert.equal(normal.serialized.calls.evaluate, 6, 'the existing default recipe/capture evaluation count is unchanged');
  assert.equal(normal.serialized.calls.getDoc, 3, 'only the existing plan, prepare and inspect movement reads ran');
  assert.equal(normal.serialized.calls.fetch, 3);

  const diagnosticText = JSON.stringify(normal.outcome.sourceDiagnosticOnly);
  for (const privateValue of [SESSION_ID, CORE_UID, GROUP_ID, CORE_SHUTTLE, HOST, DESTINATION,
    'departure-request-1', 'transit-request-1']) {
    assert.equal(diagnosticText.includes(privateValue), false, 'the source diagnostic contains no raw private identifier');
  }

  const defaultCapture = await makeCaptureHarness({ diagnosticOnly: false });
  assert.equal(defaultCapture.outcome.status, 'completed', 'default source capture preserves the same accepted fixture');
  assert.equal(defaultCapture.outcome.revision, normal.outcome.revision);
  assert.equal(defaultCapture.outcome.exactSdkRetry, normal.outcome.exactSdkRetry);
  assert.equal(Object.hasOwn(defaultCapture.outcome, 'sourceDiagnosticOnly'), false,
    'diagnostic fields stay absent when the opt-in is not requested');
  assert.equal(defaultCapture.serialized.calls.evaluate, normal.serialized.calls.evaluate);
  assert.equal(defaultCapture.serialized.calls.getDoc, normal.serialized.calls.getDoc);

  const rejectedCases = [
    { name: 'reader live false', postState: state => { state.connection = 'offline'; },
      assert: tuple => { assert.equal(tuple.source.latestLive, false); assert.equal(tuple.source.liveStateCurrent, false); } },
    { name: 'cycle drift', postState: state => { state.session.currentTurn = CYCLE + 1; },
      assert: tuple => { assert.equal(tuple.source.cycleMatches, false); assert.equal(tuple.movement.cycleMatches, true); } },
    { name: 'non-active phase', postState: state => { state.session.phase = 'setup'; },
      assert: tuple => { assert.equal(tuple.source.phaseActive, false); assert.equal(tuple.source.liveStateCurrent, false); } },
    { name: 'holder group differs from member scope', postState: state => { state.session.playerDiscovery.groupId = 'foreign-group'; },
      assert: tuple => { assert.equal(tuple.source.holderGroupMatchesOrigin, false);
        assert.equal(tuple.source.memberScopeGroupMatchesOrigin, true); assert.equal(tuple.authority.originAuthorityMatches, false); } },
    { name: 'member destination removed', postState: state => { state.session.memberSessionScope.vesselIds = [HOST]; },
      assert: tuple => { assert.equal(tuple.member.destinationInMemberScope, false);
        assert.equal(tuple.authority.sameCurrentDocumentAuthority, false); assert.equal(tuple.member.memberGroupAvailable, false); } },
    { name: 'origin host removed from member scope', postState: state => { state.session.memberSessionScope.vesselIds = [DESTINATION]; },
      assert: tuple => { assert.equal(tuple.member.originHostInMemberScope, false);
        assert.equal(tuple.authority.currentDocumentAuthorityPresent, false); assert.equal(tuple.member.memberGroupAvailable, false); } },
    { name: 'host no longer active', postState: state => { state.session.activeVesselIds = [DESTINATION]; },
      assert: tuple => { assert.equal(tuple.member.originHostActive, false); assert.equal(tuple.member.memberGroupAvailable, false); } },
    { name: 'destination no longer active', postState: state => { state.session.activeVesselIds = [HOST]; },
      assert: tuple => { assert.equal(tuple.member.destinationInMemberScope, true);
        assert.equal(tuple.member.destinationActive, false); assert.equal(tuple.member.memberGroupAvailable, false); } },
    { name: 'Begin retains a docking', postState: state => { state.session.shuttleDockings = [
      { shuttleId: CORE_SHUTTLE, shipId: HOST, dockedAt: REQUESTED_AT }]; },
      assert: tuple => { assert.equal(tuple.member.dockingCount, 1);
        assert.equal(tuple.member.dockingStateMatches, false); assert.equal(tuple.member.memberGroupAvailable, false); } },
    { name: 'current document hydration drift', postState: state => { state.identityHydrationRevision++; },
      assert: tuple => { assert.equal(tuple.authority.currentDocumentAuthorityPresent, true);
        assert.equal(tuple.authority.sameCurrentDocumentAuthority, false);
        assert.equal(tuple.authority.originAuthorityMatches, false); } },
    { name: 'current holder control drift', postState: state => { state.session.shuttleControl[CORE_SHUTTLE].holderUid = 'foreign-holder'; },
      assert: tuple => { assert.equal(tuple.authority.currentControlHolderMatchesOrigin, false);
        assert.equal(tuple.authority.originAuthorityMatches, false); } },
    { name: 'current control revision drift', postState: state => { state.session.shuttleControl[CORE_SHUTTLE].revision++; },
      assert: tuple => { assert.equal(tuple.authority.currentControlRevisionMatchesOrigin, false);
        assert.equal(tuple.movement.currentControlRevisionMatchesOrigin, false); } },
    { name: 'movement status drift', movementAfter: requestedMovement(),
      assert: tuple => { assert.equal(tuple.movement.recordPresent, true); assert.equal(tuple.movement.statusMatches, false); } },
    { name: 'movement holder drift', movementAfter: transitMovement({ holderUid: 'foreign-holder' }),
      assert: tuple => { assert.equal(tuple.movement.holderMatchesOrigin, false); } },
    { name: 'movement group drift', movementAfter: transitMovement({ fleetGroupId: 'foreign-group' }),
      assert: tuple => { assert.equal(tuple.movement.groupMatchesOrigin, false); } },
    { name: 'movement control revision drift', movementAfter: transitMovement({ controlRevision: CONTROL_REVISION + 1 }),
      assert: tuple => { assert.equal(tuple.movement.controlRevisionMatchesOrigin, false); } },
    { name: 'movement cycle drift', movementAfter: transitMovement({ cycle: CYCLE + 1 }),
      assert: tuple => { assert.equal(tuple.movement.cycleMatches, false); } },
    { name: 'movement destination drift', movementAfter: transitMovement({ destinationShipId: HOST }),
      assert: tuple => { assert.equal(tuple.movement.destinationMatchesSelected, false); } },
    { name: 'result destination drift', resultAfter: transitResult({ destinationShipId: HOST }),
      assert: tuple => { assert.equal(tuple.movement.resultDestinationMatches, false); } },
  ];
  for (const item of rejectedCases) {
    const capture = await makeCaptureHarness(item);
    assert.equal(capture.outcome.status, 'pending', `${item.name} remains uncredited`);
    assert.equal(capture.outcome.reason, 'live-source-cycle-revision-or-group-changed', item.name);
    const tuple = capture.outcome.sourceDiagnosticOnly?.captureTuple?.postInspectPredicates;
    assert.ok(tuple, `${item.name} is retained in opt-in post-inspect evidence`);
    assert.equal(tuple.zeroCredit, true);
    item.assert(tuple);
    if (item.name === 'holder group differs from member scope') {
      assert.equal(capture.outcome.sourceDiagnosticOnly.captureTuple.after.source.groupHash, await hashUid(GROUP_ID),
        'the differing holderGroupId is distinguished from the still-original member scope group hash');
    }
  }
});
