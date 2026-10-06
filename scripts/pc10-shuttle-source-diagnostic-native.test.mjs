import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION_ID = 'native-diagnostic-session';
const GROUP_ID = 'fleet-blue';
const CORE_UID = 'native-core-holder-auth-uid';
const CORE_ROLE = 'icebreaker-miner';
const CORE_SHUTTLE = 'starlight';
const PRESS_UID = 'native-press-holder-auth-uid';
const PRESS_ROLE = 'press-officer';
const PRESS_SHUTTLE = 'snn-press-shuttle';

const hashUid = async uid => {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

function coreStoreState() {
  const me = { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION_ID,
    uid: CORE_UID, fleetGroupId: GROUP_ID, activeConsoleRoleId: CORE_ROLE, assignedRoleId: CORE_ROLE,
    connectionGeneration: 6 };
  const session = { id: SESSION_ID, currentTurn: 1, phase: 'active', playerDiscovery: { groupId: GROUP_ID },
    activeVesselIds: ['icebreaker', 'dione'], activeRoleIds: [CORE_ROLE],
    memberSessionScope: { groupId: GROUP_ID, vesselIds: ['icebreaker', 'dione'], craftIds: [CORE_SHUTTLE] },
    currentActorBerthAuthority: { sessionId: SESSION_ID, actorUid: CORE_UID, groupId: GROUP_ID,
      role: 'player', connectionGeneration: 6, assignedRoleId: CORE_ROLE,
      activeConsoleRoleId: CORE_ROLE, replacementRoleId: null, replacementStatus: null, shipId: 'icebreaker' },
    shuttleControl: { [CORE_SHUTTLE]: { shuttleId: CORE_SHUTTLE, holderUid: CORE_UID,
      revision: 4, ownerRoleId: CORE_ROLE } },
    shuttleDockings: [{ shuttleId: CORE_SHUTTLE, shipId: 'icebreaker', dockedAt: '2026-10-06T12:00:00.000Z' }],
    shipFleetGroupIds: { icebreaker: GROUP_ID, dione: GROUP_ID },
  };
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 9, me, session };
}

function pressStoreState() {
  const me = { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION_ID,
    uid: PRESS_UID, fleetGroupId: 'fleet-press', activeConsoleRoleId: PRESS_ROLE, assignedRoleId: null,
    connectionGeneration: 7 };
  const session = { id: SESSION_ID, currentTurn: 1, phase: 'active', pressEnabled: true,
    playerDiscovery: { groupId: 'fleet-press', revision: 3, fleetGroupVesselIds: ['aegis', 'dione'] },
    activeVesselIds: ['aegis', 'dione'], activeRoleIds: [PRESS_ROLE],
    memberSessionScope: { groupId: 'fleet-press', vesselIds: [], craftIds: [PRESS_SHUTTLE] },
    currentActorBerthAuthority: null,
    shuttleControl: { [PRESS_SHUTTLE]: { shuttleId: PRESS_SHUTTLE, holderUid: PRESS_UID,
      revision: 2, ownerRoleId: PRESS_ROLE } },
    shuttleDockings: [{ shuttleId: PRESS_SHUTTLE, shipId: 'aegis', dockedAt: '2026-10-06T12:00:00.000Z' }],
  };
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 11, me, session };
}

function makeSerializedPage({ getState, currentUser, movementSnapshots = [] }) {
  const calls = { evaluate: [], store: 0, auth: 0, fetch: 0, doc: 0, getDoc: 0 };
  const store = { useSessionStore: { getState: () => { calls.store++; return getState(calls.store); } } };
  const firebase = { auth: () => { calls.auth++; return { currentUser: currentUser(calls.auth) }; },
    db: () => ({}) };
  const firestore = {
    doc: (_db, path) => { calls.doc++; return path; },
    getDoc: async path => {
      calls.getDoc++;
      const snapshot = movementSnapshots.shift();
      if (!snapshot) throw new Error(`Unexpected movement read for ${path}`);
      if (snapshot instanceof Error) throw snapshot;
      return snapshot;
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
    calls.evaluate.push({ callback, input });
    const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
    const execute = new Function('fixtureImport', 'fetch', 'crypto', 'input', `return (${source})(input);`);
    return execute(fixtureImport, fetchFixture, webcrypto, input);
  } };
  return { page, calls };
}

async function currentCoreAuthority(state) {
  const auth = { uid: CORE_UID };
  const serialized = makeSerializedPage({ getState: () => state, currentUser: () => auth });
  const surface = { page: serialized.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  return readActionState(surface, CORE_SHUTTLE);
}

function rawInvalidRequest() {
  return { status: 'requested', requestId: 'raw-request-should-not-be-retained', shuttleId: CORE_SHUTTLE,
    holderUid: CORE_UID, fleetGroupId: GROUP_ID, originShipId: 'icebreaker', destinationShipId: 'dione',
    cycle: 1, controlRevision: 4, requestedAt: '2026-10-06T12:00:00.000Z', unexpectedPrivateField: 'secret' };
}

async function makeCoreRecipeHarness({ movementSnapshots }) {
  const storeState = coreStoreState();
  const first = await currentCoreAuthority(storeState);
  const uidHash = await hashUid(CORE_UID);
  const origin = { sessionId: SESSION_ID, uidHash, shuttleId: CORE_SHUTTLE, groupId: GROUP_ID,
    cycle: 1, controlRevision: 4, sourceAuthority: first.currentDocumentAuthority };
  const actor = { sessionId: SESSION_ID, uidHash, profileRoleId: CORE_ROLE, activeConsoleRoleId: CORE_ROLE,
    assignedRoleId: CORE_ROLE, playerRole: 'player', sameActor: true, connection: 'live', freshness: 'server' };
  const gmActor = { sessionId: SESSION_ID, uidHash: await hashUid('native-owned-gm'), profileRoleId: 'gm',
    activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'gm-instance',
    sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' };
  const sessionProjection = { live: true, sessionId: SESSION_ID, cycle: 1, phase: 'active',
    holderGroupId: GROUP_ID, activeVesselIds: ['icebreaker', 'dione'], activeRoleIds: [CORE_ROLE],
    shuttleControl: storeState.session.shuttleControl, shuttleDockings: storeState.session.shuttleDockings,
    shipFleetGroupIds: storeState.session.shipFleetGroupIds };
  const serialized = makeSerializedPage({ getState: () => storeState, currentUser: () => ({ uid: CORE_UID }),
    movementSnapshots });
  const destinationSelect = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    locator: () => ({ evaluateAll: async fn => fn([
      { value: '', textContent: 'Choose local ship', disabled: false },
      { value: 'icebreaker', textContent: 'Icebreaker', disabled: false },
      { value: 'dione', textContent: 'Dione', disabled: false },
    ]) }), selectOption: async () => {} };
  const requestButton = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => {} };
  const panel = { getByLabel: (label, options = {}) => label === 'Destination ship' && options.exact === true
      ? destinationSelect : { count: async () => 0 },
    getByRole: (role, options = {}) => role === 'button' && options.name === 'Request departure' && options.exact === true
      ? requestButton : { count: async () => 0 } };
  serialized.page.url = () => `http://localhost:5174/#/shuttles/${CORE_SHUTTLE}`;
  serialized.page.getByRole = (role, options = {}) => role === 'region' && options.name === 'Shuttle departure' &&
      options.exact === true ? panel : { count: async () => 0 };
  serialized.page.locator = () => ({ count: async () => 0 });
  serialized.page.waitForURL = async () => { throw new Error('the original route should stay mounted'); };
  const surface = { page: serialized.page, observe: async () => actor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async () => { throw new Error('the recipe must not call the SDK directly'); } };
  const gmSurface = { ...surface, observe: async () => gmActor };
  const selections = [];
  const game = { select: async (roleId, options) => {
    selections.push({ roleId, options });
    return roleId === 'gm' ? gmSurface : surface;
  } };
  const playerSourceSample = await readActionState(surface, CORE_SHUTTLE);
  assert.deepEqual(playerSourceSample.currentDocumentAuthority, origin.sourceAuthority,
    'the test fixture retains the same actual serialized current-document authority');
  serialized.calls.evaluate.length = 0;
  serialized.calls.store = 0;
  serialized.calls.auth = 0;
  const context = { initial: { sessionId: SESSION_ID }, roster: [{ roleId: CORE_ROLE, uidHash }],
    shuttleOriginAuthority: origin, shuttleSourceDiagnosticOnly: true };
  return { game, surface, context, actor, sessionProjection, serialized, selections };
}

function safeCoreDiagnostic() {
  return { kind: 'pc10-shuttle-prepare-diagnostic-v1', zeroCredit: true,
    preparedPlanOffered: false, preparedPlanReasonPresent: true,
    preparedPlanReason: 'the current source movement document is not readable under this authenticated actor',
    transitionBeforePresent: false, originGuardPassed: true, secondMovementRead: 'missing',
    movementReadErrorCode: null,
    movementWitnessPresent: true, movementWitnessMatchesTransitionBefore: false };
}

test('Press reader opt-in retains exact predicate flags, key/null shape and the existing post-digest comparison', async () => {
  const state = pressStoreState();
  const serialized = makeSerializedPage({ getState: () => state, currentUser: () => ({ uid: PRESS_UID }) });
  const surface = { page: serialized.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const result = await readActionState(surface, PRESS_SHUTTLE, { diagnosticOnly: true });

  assert.equal(serialized.calls.evaluate.length, 1, 'diagnostic mode uses the existing single page evaluation');
  assert.deepEqual(serialized.calls.evaluate[0].input,
    { moduleUrl: '/src/store/useSessionStore.ts', shuttleId: PRESS_SHUTTLE, diagnosticOnly: true });
  assert.equal(serialized.calls.store, 2, 'the existing pre/post digest store samples are unchanged');
  assert.equal(serialized.calls.auth, 2, 'the existing pre/post digest Auth samples are unchanged');
  const diagnostic = result.sourceDiagnosticOnly;
  assert.ok(diagnostic, 'diagnostic opt-in returns safe source facts');
  assert.equal(diagnostic.kind, 'pc10-press-document-source-diagnostic-v1');
  assert.equal(diagnostic.zeroCredit, true);
  assert.equal(diagnostic.actorCurrent, true);
  assert.ok(Object.values(diagnostic.predicate).every(value => value === true));
  assert.equal(diagnostic.fields.currentActorBerthAuthority.present, true);
  assert.equal(diagnostic.fields.currentActorBerthAuthority.isNull, true);
  assert.equal(diagnostic.fields.memberSessionScope.vesselIdsPresent, true);
  assert.equal(diagnostic.fields.memberSessionScope.vesselIdsIsNull, false);
  assert.equal(diagnostic.postDigestInputMatches, true);
  assert.equal(result.pressDocumentAuthority.kind, 'press-shuttle-current-document');
  const diagnosticText = JSON.stringify(diagnostic);
  for (const privateValue of [SESSION_ID, PRESS_UID, 'fleet-press', PRESS_SHUTTLE, 'aegis']) {
    assert.equal(diagnosticText.includes(privateValue), false, 'diagnostic omits raw source identifiers');
  }
  assert.equal(diagnosticText.includes('"holderUid"'), false);
});

test('Press diagnostic separates absent keys, explicit null and each rejected authority conjunct without extra samples', async () => {
  const cases = [
    { name: 'Auth UID', mutate: { authUid: 'foreign-auth' }, gate: 'authMatchesProfile' },
    { name: 'session identity', mutate: { sessionId: 'foreign-session' }, gate: 'sessionMatchesProfile' },
    { name: 'current role', mutate: { activeConsoleRoleId: 'admiral' }, gate: 'pressActiveRole' },
    { name: 'assigned role', mutate: { assignedRoleId: 'press-officer' }, gate: 'unassigned' },
    { name: 'group scope', mutate: { scopeGroupId: 'fleet-other' }, gate: 'scopeGroupMatchesProfile' },
    { name: 'hydration revision', mutate: { hydrationRevision: 0 }, gate: 'hydrationRevisionValid' },
    { name: 'connection generation', mutate: { connectionGeneration: 0 }, gate: 'generationValid' },
    { name: 'discovery', mutate: { discovery: null }, gate: 'discoveryValid' },
  ];
  for (const item of cases) {
    const fixture = pressStoreState();
    const session = fixture.session;
    const me = fixture.me;
    let authUid = PRESS_UID;
    if (item.mutate.authUid) authUid = item.mutate.authUid;
    if (item.mutate.sessionId) { session.id = item.mutate.sessionId; me.sessionId = SESSION_ID; }
    if (item.mutate.activeConsoleRoleId) me.activeConsoleRoleId = item.mutate.activeConsoleRoleId;
    if (item.mutate.assignedRoleId !== undefined) me.assignedRoleId = item.mutate.assignedRoleId;
    if (item.mutate.scopeGroupId) session.memberSessionScope.groupId = item.mutate.scopeGroupId;
    if (item.mutate.hydrationRevision !== undefined) fixture.identityHydrationRevision = item.mutate.hydrationRevision;
    if (item.mutate.connectionGeneration !== undefined) me.connectionGeneration = item.mutate.connectionGeneration;
    if (Object.hasOwn(item.mutate, 'discovery')) session.playerDiscovery = item.mutate.discovery;
    const serialized = makeSerializedPage({ getState: () => fixture, currentUser: () => ({ uid: authUid }) });
    const surface = { page: serialized.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
    const result = await readActionState(surface, PRESS_SHUTTLE, { diagnosticOnly: true });
    assert.ok(result.sourceDiagnosticOnly, 'diagnostic opt-in returns safe source facts');
    assert.equal(result.sourceDiagnosticOnly.predicate[item.gate], false, item.name);
    assert.equal(result.pressDocumentAuthority, null, item.name + ': failed strict source authority stays null');
    assert.equal(serialized.calls.store, 1, item.name + ': failed predicate does not perform post-digest sample');
    assert.equal(serialized.calls.auth, 1, item.name + ': failed predicate does not perform post-digest Auth sample');
    assert.equal(serialized.calls.evaluate.length, 1, item.name + ': no extra page evaluation');
  }

  const absentScopeField = pressStoreState();
  delete absentScopeField.session.memberSessionScope.vesselIds;
  const absent = makeSerializedPage({ getState: () => absentScopeField, currentUser: () => ({ uid: PRESS_UID }) });
  const absentResult = await readActionState({ page: absent.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' },
    PRESS_SHUTTLE, { diagnosticOnly: true });
  assert.ok(absentResult.sourceDiagnosticOnly);
  assert.equal(absentResult.sourceDiagnosticOnly.fields.memberSessionScope.vesselIdsPresent, false);
  assert.equal(absentResult.sourceDiagnosticOnly.fields.memberSessionScope.vesselIdsIsNull, false);

  const nullScopeField = pressStoreState();
  nullScopeField.session.memberSessionScope.vesselIds = null;
  const explicitNull = makeSerializedPage({ getState: () => nullScopeField, currentUser: () => ({ uid: PRESS_UID }) });
  const nullResult = await readActionState({ page: explicitNull.page,
    storeModuleUrl: () => '/src/store/useSessionStore.ts' }, PRESS_SHUTTLE, { diagnosticOnly: true });
  assert.ok(nullResult.sourceDiagnosticOnly);
  assert.equal(nullResult.sourceDiagnosticOnly.fields.memberSessionScope.vesselIdsPresent, true);
  assert.equal(nullResult.sourceDiagnosticOnly.fields.memberSessionScope.vesselIdsIsNull, true);
});

test('Press post-digest source drift remains rejected and the diagnostic records only the existing equality result', async () => {
  const original = pressStoreState();
  const drifted = structuredClone(original);
  drifted.identityHydrationRevision++;
  const serialized = makeSerializedPage({ getState: count => count === 1 ? original : drifted,
    currentUser: () => ({ uid: PRESS_UID }) });
  const surface = { page: serialized.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const result = await readActionState(surface, PRESS_SHUTTLE, { diagnosticOnly: true });

  assert.ok(result.sourceDiagnosticOnly, 'diagnostic opt-in returns safe source facts');
  assert.equal(result.sourceDiagnosticOnly.actorCurrent, true, 'the original sampled Press predicate passed');
  assert.equal(result.sourceDiagnosticOnly.postDigestInputMatches, false,
    'the already-existing post-digest equality rejects the later source drift');
  assert.equal(result.pressDocumentAuthority, null);
  assert.equal(result.pressGroupAuthority, null);
  assert.equal(serialized.calls.store, 2);
  assert.equal(serialized.calls.auth, 2);
  assert.equal(serialized.calls.evaluate.length, 1);
});

test('core movement checkpoint retains a blocked original plan and the second source read without credit', async () => {
  const movementSnapshots = [
    { exists: () => true, data: () => rawInvalidRequest() },
    { exists: () => false, data: () => undefined },
  ];
  const harness = await makeCoreRecipeHarness({ movementSnapshots });
  const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  const prepared = await recipe({ context: harness.context, game: harness.game });
  const outcome = await prepared.prepare({ surface: harness.surface, actor: harness.actor,
    source: harness.sessionProjection });

  assert.equal(outcome.offered, false, 'an unreadable initial movement plan remains blocked');
  assert.equal(outcome.reason, 'source shuttle movement changed before the mounted action',
    'the existing last-guard reason and evaluation order are unchanged');
  assert.deepEqual(outcome.sourceDiagnosticOnly, safeCoreDiagnostic());
  assert.equal(harness.serialized.calls.getDoc, 2, 'initial and checkpoint movement reads remain one each');
  assert.equal(harness.serialized.calls.evaluate.length, 5,
    'GM source, original-holder source, initial plan and prepare use only existing page evaluations');
  assert.equal(harness.serialized.calls.fetch, 2);
  assert.equal(harness.serialized.calls.doc, 2);
  assert.equal(harness.selections.filter(row => row.roleId !== 'gm').length, 1);
  const diagnosticText = JSON.stringify(outcome.sourceDiagnosticOnly);
  for (const privateValue of [SESSION_ID, CORE_UID, GROUP_ID, CORE_SHUTTLE, 'raw-request-should-not-be-retained', 'secret']) {
    assert.equal(diagnosticText.includes(privateValue), false, 'core diagnostic omits raw private source values');
  }
});

test('core checkpoint records equality for the offered false-before transition without clicking', async () => {
  const movementSnapshots = [
    { exists: () => false, data: () => undefined },
    { exists: () => false, data: () => undefined },
  ];
  const harness = await makeCoreRecipeHarness({ movementSnapshots });
  const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  const prepared = await recipe({ context: harness.context, game: harness.game });
  const outcome = await prepared.prepare({ surface: harness.surface, actor: harness.actor,
    source: harness.sessionProjection });

  assert.equal(outcome.offered, true, outcome.reason);
  assert.equal(outcome.transitionBefore.exists, false);
  assert.ok(outcome.sourceDiagnosticOnly, 'diagnostic opt-in returns the checkpoint fields');
  assert.equal(outcome.sourceDiagnosticOnly.preparedPlanOffered, true);
  assert.equal(outcome.sourceDiagnosticOnly.preparedPlanReasonPresent, false);
  assert.equal(outcome.sourceDiagnosticOnly.transitionBeforePresent, true);
  assert.equal(outcome.sourceDiagnosticOnly.originGuardPassed, true);
  assert.equal(outcome.sourceDiagnosticOnly.secondMovementRead, 'missing');
  assert.equal(outcome.sourceDiagnosticOnly.movementWitnessPresent, true);
  assert.equal(outcome.sourceDiagnosticOnly.movementWitnessMatchesTransitionBefore, true);
  assert.equal(harness.serialized.calls.getDoc, 2);
});

test('core source checkpoint may retain only an allowlisted caught movement error code', async () => {
  const permissionDenied = Object.assign(new Error('secret request and UID must not persist'), {
    code: 'permission-denied',
  });
  const movementSnapshots = [
    { exists: () => true, data: () => rawInvalidRequest() },
    permissionDenied,
  ];
  const harness = await makeCoreRecipeHarness({ movementSnapshots });
  const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  const prepared = await recipe({ context: harness.context, game: harness.game });
  const outcome = await prepared.prepare({ surface: harness.surface, actor: harness.actor,
    source: harness.sessionProjection });

  assert.ok(outcome.sourceDiagnosticOnly, 'diagnostic opt-in retains the caught source code');
  assert.equal(outcome.offered, false);
  assert.equal(outcome.reason, 'source shuttle movement changed before the mounted action');
  assert.equal(outcome.sourceDiagnosticOnly.secondMovementRead, 'unreadable');
  assert.equal(outcome.sourceDiagnosticOnly.movementReadErrorCode, 'permission-denied');
  const diagnosticText = JSON.stringify(outcome.sourceDiagnosticOnly);
  assert.equal(diagnosticText.includes('secret request'), false);
  assert.equal(diagnosticText.includes(CORE_UID), false);
  assert.equal(harness.serialized.calls.getDoc, 2);
});

test('the existing pending outcome boundary appends only the safe opt-in diagnostic', async () => {
  const uidHash = await hashUid(CORE_UID);
  const gmSource = { live: true, sessionId: SESSION_ID, phase: 'active', cycle: 1,
    shuttleControl: { [CORE_SHUTTLE]: { shuttleId: CORE_SHUTTLE, holderUid: CORE_UID,
      revision: 4, ownerRoleId: CORE_ROLE } } };
  const actor = { sessionId: SESSION_ID, uidHash, profileRoleId: CORE_ROLE, activeConsoleRoleId: CORE_ROLE,
    assignedRoleId: CORE_ROLE, playerRole: 'player', sameActor: true, connection: 'live', freshness: 'server' };
  const gmActor = { sessionId: SESSION_ID, uidHash: await hashUid('native-owned-gm'), profileRoleId: 'gm',
    activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'gm-instance',
    sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' };
  const listeners = new Map();
  const surface = { observe: async () => actor, page: {
    on: (event, listener) => listeners.set(event, listener), off: event => listeners.delete(event),
  } };
  const gmSurface = { observe: async () => gmActor };
  const game = { select: async roleId => roleId === 'gm' ? gmSurface : surface,
    state: async selected => selected === gmSurface ? gmSource : { ...gmSource } };
  const context = { initial: { sessionId: SESSION_ID }, roster: [{ roleId: CORE_ROLE, uidHash }] };
  const reason = 'source shuttle movement changed before the mounted action';
  const outcome = await captureMountedProcedureAction({ context, game, caseId: 'core:requestShuttleDeparture',
    expected: { sessionId: SESSION_ID, roleId: CORE_ROLE, uidHash, cycle: 1, shuttleId: CORE_SHUTTLE },
    prepare: async () => ({ offered: false, reason, sourceDiagnosticOnly: safeCoreDiagnostic() }),
    inspect: async () => ({}) });

  assert.equal(outcome.status, 'pending');
  assert.equal(outcome.reason, reason);
  assert.deepEqual(outcome.sourceDiagnosticOnly, safeCoreDiagnostic());
  assert.equal(listeners.size, 0, 'the existing observer is detached after the pending operation');
});

test('default Press reader output keeps its prior shape when diagnostics are not requested', async () => {
  const state = pressStoreState();
  const serialized = makeSerializedPage({ getState: () => state, currentUser: () => ({ uid: PRESS_UID }) });
  const surface = { page: serialized.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const result = await readActionState(surface, PRESS_SHUTTLE);

  assert.equal(Object.hasOwn(result, 'sourceDiagnosticOnly'), false);
  assert.deepEqual(serialized.calls.evaluate[0].input, { moduleUrl: '/src/store/useSessionStore.ts',
    shuttleId: PRESS_SHUTTLE });
  assert.equal(serialized.calls.evaluate.length, 1);
  assert.equal(serialized.calls.store, 2);
  assert.equal(serialized.calls.auth, 2);
});
