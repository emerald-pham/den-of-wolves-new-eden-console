import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const SESSION_ID = 'member-scope-session';
const GROUP_ID = 'fleet-blue';
const FOREIGN_GROUP_ID = 'fleet-red';
const UID = 'member-scope-holder-uid';
const ROLE_ID = 'icebreaker-miner';
const SHUTTLE_ID = 'starlight';
const SHIP_IDS = ['aegis', 'dione'];
const CONTROL_REVISION = 4;
const CYCLE = 1;
const uidHash = async uid => {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

function memberStore(overrides = {}) {
  const me = { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION_ID,
    uid: UID, fleetGroupId: GROUP_ID, activeConsoleRoleId: ROLE_ID, assignedRoleId: ROLE_ID,
    connectionGeneration: 6, ...(overrides.me ?? {}) };
  const session = { id: SESSION_ID, currentTurn: CYCLE, phase: 'active',
    playerDiscovery: { groupId: GROUP_ID }, activeVesselIds: ['aegis', 'dione', 'orion'],
    activeRoleIds: [ROLE_ID],
    memberSessionScope: { groupId: GROUP_ID, vesselIds: [...SHIP_IDS], craftIds: [SHUTTLE_ID] },
    currentActorBerthAuthority: { sessionId: SESSION_ID, actorUid: UID, groupId: GROUP_ID,
      role: 'player', connectionGeneration: 6, assignedRoleId: ROLE_ID,
      activeConsoleRoleId: ROLE_ID, replacementRoleId: null, replacementStatus: null, shipId: 'aegis' },
    shuttleControl: { [SHUTTLE_ID]: { shuttleId: SHUTTLE_ID, holderUid: UID,
      revision: CONTROL_REVISION, ownerRoleId: ROLE_ID } },
    shuttleDockings: [{ shuttleId: SHUTTLE_ID, shipId: 'aegis', dockedAt: '2026-10-06T12:00:00.000Z' }],
    ...(overrides.session ?? {}) };
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 9,
    me, session, ...(overrides.current ?? {}) };
}

function gmStore() {
  return { connection: 'live', sessionSnapshotFreshness: 'server', session: {
    id: SESSION_ID, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP_ID },
    activeVesselIds: ['aegis', 'dione', 'orion'], activeRoleIds: [ROLE_ID],
    shipFleetGroupIds: { aegis: GROUP_ID, dione: GROUP_ID, orion: FOREIGN_GROUP_ID },
    shuttleControl: { [SHUTTLE_ID]: { shuttleId: SHUTTLE_ID, holderUid: UID,
      revision: CONTROL_REVISION, ownerRoleId: ROLE_ID } },
    shuttleDockings: [{ shuttleId: SHUTTLE_ID, shipId: 'aegis', dockedAt: '2026-10-06T12:00:00.000Z' }],
  } };
}

function serializedPage({ stateForAction, stateForMovement = () => memberStore(), currentUser = () => ({ uid: UID }) }) {
  let evaluationKind;
  let actionReads = 0;
  let movementReads = 0;
  let docReads = 0;
  let getDocReads = 0;
  const selectedDestinations = [];
  const calls = { action: 0, movement: 0, doc: 0, getDoc: 0 };
  const store = { useSessionStore: { getState: () => {
    if (evaluationKind === 'movement') {
      calls.movement++;
      return stateForMovement(++movementReads);
    }
    calls.action++;
    return stateForAction(++actionReads);
  } } };
  const firebase = { auth: () => ({ currentUser: currentUser() }), db: () => ({}) };
  const firestore = {
    doc: (_db, path) => { calls.doc++; docReads++; return path; },
    getDoc: async path => {
      calls.getDoc++; getDocReads++;
      assert.match(path, new RegExp(`sessions/${SESSION_ID}/shuttleDepartures/${SHUTTLE_ID}$`));
      return { exists: () => false, data: () => undefined };
    },
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
    evaluationKind = Object.hasOwn(input ?? {}, 'sessionId') ? 'movement' : 'action';
    const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
    const execute = new Function('fixtureImport', 'fetch', 'crypto', 'input', `return (${source})(input);`);
    try { return await execute(fixtureImport, fetchFixture, webcrypto, input); }
    finally { evaluationKind = undefined; }
  } };
  return { page, calls, selectedDestinations, resetActionReads: () => { actionReads = 0; calls.action = 0; },
    actionReads: () => actionReads, docReads: () => docReads, getDocReads: () => getDocReads };
}

function locators(page, selectedDestinations, availableOptions) {
  let clickCount = 0;
  const empty = { count: async () => 0, isVisible: async () => false, isEnabled: async () => false,
    click: async () => { throw new Error('an absent source control must not be clicked'); } };
  const select = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    locator: () => ({ evaluateAll: async fn => fn(availableOptions().map(option => ({ ...option }))) }),
    selectOption: async value => { selectedDestinations.push(value); } };
  const request = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => { clickCount++; } };
  const panel = {
    getByLabel: (label, options = {}) => label === 'Destination ship' && options.exact === true ? select : empty,
    getByRole: (role, options = {}) => role === 'button' && options.name === 'Request departure' &&
      options.exact === true ? request : empty,
  };
  page.url = () => `http://localhost:5174/#/shuttles/${SHUTTLE_ID}`;
  page.getByRole = (role, options = {}) => role === 'region' && options.name === 'Shuttle departure' &&
    options.exact === true ? panel : empty;
  return { panel, clickCount: () => clickCount };
}

async function makeHarness({ memberSequence, options } = {}) {
  let activeMember = memberStore();
  let authUid = UID;
  const memberPage = serializedPage({
    stateForAction: index => memberSequence?.(index, activeMember) ?? activeMember,
    stateForMovement: () => activeMember,
    currentUser: () => ({ uid: authUid }),
  });
  const memberUi = locators(memberPage.page, memberPage.selectedDestinations,
    options ?? (() => [
      { value: '', textContent: 'Choose local ship', disabled: false },
      { value: 'orion', textContent: 'Orion', disabled: false },
      { value: 'dione', textContent: 'Dione', disabled: false },
    ]));
  const actorHash = await uidHash(UID);
  const actor = { sessionId: SESSION_ID, uidHash: actorHash, profileRoleId: ROLE_ID,
    activeConsoleRoleId: ROLE_ID, assignedRoleId: ROLE_ID, playerRole: 'player', sameActor: true,
    connection: 'live', freshness: 'server' };
  const gmPage = serializedPage({ stateForAction: () => gmStore(), currentUser: () => ({ uid: 'owned-gm-uid' }) });
  const gmActor = { sessionId: SESSION_ID, uidHash: await uidHash('owned-gm-uid'), profileRoleId: 'gm',
    activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'gm-instance',
    sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' };
  const memberSurface = { page: memberPage.page, observe: async () => actor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    callable: async () => { throw new Error('the recipe must not make a direct SDK call'); } };
  const gmSurface = { page: gmPage.page, observe: async () => gmActor,
    storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const selections = [];
  const game = { select: async (roleId, optionsValue) => {
    selections.push({ roleId, options: optionsValue });
    return roleId === 'gm' ? gmSurface : memberSurface;
  } };
  const baselinePage = serializedPage({ stateForAction: () => memberStore(), currentUser: () => ({ uid: UID }) });
  const baselineSurface = { page: baselinePage.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const baseline = await readActionState(baselineSurface, SHUTTLE_ID);
  const originAuthority = { sessionId: SESSION_ID, uidHash: actorHash, shuttleId: SHUTTLE_ID,
    groupId: GROUP_ID, cycle: CYCLE, controlRevision: CONTROL_REVISION,
    sourceAuthority: baseline.currentDocumentAuthority };
  const context = { initial: { sessionId: SESSION_ID }, roster: [{ roleId: ROLE_ID, uidHash: actorHash }],
    shuttleOriginAuthority: originAuthority };
  return { memberPage, memberSurface, gmSurface, game, context, actor, memberUi, selections,
    baseline, getMember: () => activeMember, setMember: value => { activeMember = value; },
    setAuthUid: value => { authUid = value; }, memberSource: baseline };
}

async function buildRequestPlan(harness) {
  const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  return recipe({ context: harness.context, game: harness.game });
}

function changeMember(mutator) {
  const state = memberStore();
  mutator(state);
  return state;
}

test('serialized member source exposes only its validated current scope, without a fleet group map', async () => {
  const state = memberStore();
  assert.equal(Object.hasOwn(state.session, 'shipFleetGroupIds'), false);
  const page = serializedPage({ stateForAction: () => state });
  const surface = { page: page.page, storeModuleUrl: () => '/src/store/useSessionStore.ts' };
  const source = await readActionState(surface, SHUTTLE_ID);

  assert.equal(source.currentDocumentAuthority.groupId, GROUP_ID);
  assert.deepEqual(source.currentMemberScope, { groupId: GROUP_ID, vesselIds: SHIP_IDS, craftIds: [SHUTTLE_ID] });
  assert.equal(source.shipFleetGroupIds, undefined, 'the member scope does not synthesize or expose the GM map');
  assert.notStrictEqual(source.currentMemberScope.vesselIds, state.session.memberSessionScope.vesselIds,
    'the serialized current scope is an inert copy from the same member sample');
});

test('public core departure recipe stays within current member scope and same-group destination options', async () => {
  const harness = await makeHarness();
  assert.deepEqual(harness.memberSource.currentMemberScope,
    { groupId: GROUP_ID, vesselIds: SHIP_IDS, craftIds: [SHUTTLE_ID] });
  assert.equal(harness.memberSource.shipFleetGroupIds, undefined);

  const prepared = await buildRequestPlan(harness);
  assert.equal(prepared.expected.groupId, GROUP_ID);
  assert.equal(prepared.expected.destinationShipId, 'dione',
    'the first offered active-vessel option is foreign, so the recipe chooses only the current member scope');
  assert.equal(harness.memberPage.selectedDestinations[0], 'dione');
  const action = await prepared.prepare({ surface: harness.memberSurface, actor: harness.actor,
    source: harness.memberSource });
  assert.equal(action.offered, true, action.reason);
  assert.equal(harness.memberPage.getDocReads(), 2, 'the original read and existing prepare checkpoint remain single reads');
  assert.equal(harness.memberUi.clickCount(), 0, 'prepare observes but does not click the mounted request');
  await action.click();
  assert.deepEqual(harness.memberPage.selectedDestinations, ['dione', 'dione'],
    'the pre-click check reselects only the same still-offered scoped destination');
  assert.equal(harness.memberUi.clickCount(), 1);
});

test('the exact same public callback blocks when scope, docking host, destination, or authority changes', async t => {
  const cases = [
    ['missing member scope', state => { delete state.session.memberSessionScope; }],
    ['foreign current group', state => {
      state.me.fleetGroupId = FOREIGN_GROUP_ID;
      state.session.playerDiscovery.groupId = FOREIGN_GROUP_ID;
      state.session.memberSessionScope.groupId = FOREIGN_GROUP_ID;
      state.session.currentActorBerthAuthority.groupId = FOREIGN_GROUP_ID;
    }],
    ['host outside the original member scope', state => {
      state.session.shuttleDockings[0].shipId = 'orion';
    }],
    ['craft absent from current member scope', state => { state.session.memberSessionScope.craftIds = []; }],
    ['destination absent from current member scope', state => { state.session.memberSessionScope.vesselIds = ['aegis']; }],
    ['offline cached member projection', state => { state.connection = 'offline'; state.sessionSnapshotFreshness = 'cache'; }],
    ['changed actor UID', state => { state.me.uid = 'different-member-uid'; state.session.currentActorBerthAuthority.actorUid = 'different-member-uid'; }],
    ['changed Auth UID', () => {}, 'different-auth-uid'],
    ['changed generation', state => { state.me.connectionGeneration++; state.session.currentActorBerthAuthority.connectionGeneration++; }],
    ['changed hydration revision', state => { state.identityHydrationRevision++; }],
    ['changed control revision', state => { state.session.shuttleControl[SHUTTLE_ID].revision++; }],
    ['changed cycle', state => { state.session.currentTurn++; }],
  ];
  for (const [name, mutate, changedAuthUid] of cases) {
    await t.test(name, async () => {
      const harness = await makeHarness();
      harness.setMember(changeMember(mutate));
      if (changedAuthUid) harness.setAuthUid(changedAuthUid);
      const prepared = await buildRequestPlan(harness);
      const action = await prepared.prepare({ surface: harness.memberSurface, actor: harness.actor,
        source: harness.memberSource });
      assert.equal(action.offered, false, action.reason);
      assert.equal(harness.memberUi.clickCount(), 0);
    });
  }
});

test('changed same-group host or no-longer-active destination blocks at the existing pre-action read', async t => {
  for (const [name, mutate] of [
    ['host changed within the same current group', state => { state.session.shuttleDockings[0].shipId = 'dione'; }],
    ['destination no longer active', state => { state.session.activeVesselIds = ['aegis', 'orion']; }],
    ['member scope changed after planning', state => { state.session.memberSessionScope.vesselIds = ['aegis', 'orion']; }],
  ]) {
    await t.test(name, async () => {
      const before = memberStore();
      const after = changeMember(mutate);
      let memberActionReads = 0;
      const harness = await makeHarness({ memberSequence: () => {
        memberActionReads++;
        return memberActionReads === 1 ? before : after;
      } });
      const prepared = await buildRequestPlan(harness);
      assert.equal(prepared.expected.destinationShipId, 'dione');
      const action = await prepared.prepare({ surface: harness.memberSurface, actor: harness.actor,
        source: harness.memberSource });
      assert.equal(action.offered, false, action.reason);
      assert.equal(harness.memberUi.clickCount(), 0);
    });
  }
});
