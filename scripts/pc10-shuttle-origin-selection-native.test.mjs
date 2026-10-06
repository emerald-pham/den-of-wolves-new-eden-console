import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { evaluateProcedureCapture } from './pc10-pending-procedure-ui-proof.mjs';

const SESSION_ID = 'native-shuttle-origin-session';
const GROUP_ID = 'fleet-blue';
const PRESS_UID = 'press-holder-auth-uid';
const CORE_UID = 'core-holder-auth-uid';
const PRESS_ROLE = 'press-officer';
const CORE_ROLE = 'icebreaker-miner';
const PRESS_SHUTTLE = 'snn-press-shuttle';
const CORE_SHUTTLE = 'starlight';
const CONTROL_REVISION = 4;
const CYCLE = 1;

function uidHash(uid) {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

function currentAuthority({ uid = CORE_UID, roleId = CORE_ROLE, groupId = GROUP_ID } = {}) {
  return {
    sessionId: SESSION_ID, uidHash: uidHash(uid), groupId, roleId,
    connectionGeneration: 3, identityHydrationRevision: 5, documentTimeOrigin: 1_760_000_000_000,
    audienceHash: 'a'.repeat(64), authorityHash: 'b'.repeat(64), shuttleAuthorized: true,
  };
}

function originAuthority({ uid = CORE_UID, roleId = CORE_ROLE, shuttleId = CORE_SHUTTLE,
  groupId = GROUP_ID, cycle = CYCLE, controlRevision = CONTROL_REVISION,
  sourceAuthority = currentAuthority({ uid, roleId, shuttleId, groupId }) } = {}) {
  return { sessionId: SESSION_ID, uidHash: uidHash(uid), shuttleId, groupId, cycle, controlRevision, sourceAuthority };
}

function makeArrivalWitness({ uid = PRESS_UID, roleId = PRESS_ROLE, shuttleId = PRESS_SHUTTLE,
  groupId = 'fleet-press', cycle = CYCLE, controlRevision = 2,
  sourceAuthority = currentAuthority({ uid, roleId, shuttleId, groupId }) } = {}) {
  return {
    status: 'completed', endpoint: 'retargetShuttleTransit', sessionId: SESSION_ID, roleId,
    uidHash: uidHash(uid), shuttleId, groupId, cycle, controlRevision,
    departureRequestId: 'depart-original-0001', transitRequestId: 'transit-original-0001',
    destinationShipId: 'dione', transitRevision: 3, sourceAuthority,
  };
}

const pressActor = Object.freeze({
  sessionId: SESSION_ID, uidHash: uidHash(PRESS_UID), profileRoleId: PRESS_ROLE,
  activeConsoleRoleId: PRESS_ROLE, assignedRoleId: null, playerRole: 'player',
  sameActor: true, connection: 'live', freshness: 'server',
});
const coreActor = Object.freeze({
  sessionId: SESSION_ID, uidHash: uidHash(CORE_UID), profileRoleId: CORE_ROLE,
  activeConsoleRoleId: CORE_ROLE, assignedRoleId: CORE_ROLE, playerRole: 'player',
  sameActor: true, connection: 'live', freshness: 'server',
});
const gmActor = Object.freeze({
  sessionId: SESSION_ID, uidHash: uidHash('owned-gm-auth-uid'), profileRoleId: 'gm',
  activeConsoleRoleId: 'gm', assignedRoleId: 'gm', playerRole: 'gm', instanceId: 'gm-instance',
  sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server',
});

function sourceState() {
  return {
    live: true, sessionId: SESSION_ID, phase: 'active', cycle: CYCLE,
    turnPhase: { turn: CYCLE, progression: 'manual', airspace: { state: 'lifted', pressAccess: false } },
    holderGroupId: GROUP_ID,
    activeVesselIds: ['icebreaker', 'dione', 'aegis'],
    activeRoleIds: [PRESS_ROLE, CORE_ROLE],
    shipFleetGroupIds: { icebreaker: GROUP_ID, dione: GROUP_ID, aegis: 'fleet-red' },
    shuttleControl: {
      [PRESS_SHUTTLE]: { shuttleId: PRESS_SHUTTLE, holderUid: PRESS_UID, revision: 2, ownerRoleId: PRESS_ROLE },
      [CORE_SHUTTLE]: { shuttleId: CORE_SHUTTLE, holderUid: CORE_UID, revision: CONTROL_REVISION, ownerRoleId: CORE_ROLE },
    },
    shuttleDockings: [
      { shuttleId: PRESS_SHUTTLE, shipId: 'aegis', dockedAt: '2026-10-06T12:00:00.000Z' },
      { shuttleId: CORE_SHUTTLE, shipId: 'icebreaker', dockedAt: '2026-10-06T12:00:00.000Z' },
    ],
    currentDocumentAuthority: currentAuthority(),
    currentMemberScope: { groupId: GROUP_ID, vesselIds: ['icebreaker', 'dione'], craftIds: [CORE_SHUTTLE] },
  };
}

function emptyLocator() {
  return {
    count: async () => 0, isVisible: async () => false, isEnabled: async () => false,
    click: async () => { throw new Error('an absent locator must never be clicked'); },
  };
}

function makeHarness({ origin = originAuthority(), witness, movement = null,
  mutateState = () => {}, duplicateCoreUid = false } = {}) {
  const state = sourceState();
  mutateState(state);
  const pressState = { ...state, currentDocumentAuthority: null };
  const gmState = { ...state, holderGroupId: undefined, currentDocumentAuthority: undefined };
  const sourceSelections = [];
  const routeLookups = [];
  const chosenOptions = [];
  let clickCount = 0;

  const destinationSelect = {
    count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    locator: () => ({
      evaluateAll: async fn => fn([
        { value: '', textContent: 'Choose local ship', disabled: false },
        { value: 'icebreaker', textContent: 'Icebreaker', disabled: false },
        { value: 'dione', textContent: 'Dione', disabled: false },
      ]),
    }),
    selectOption: async value => { chosenOptions.push(value); },
  };
  const requestButton = {
    count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => { clickCount++; },
  };
  const panel = {
    getByLabel: (label, options = {}) => label === 'Destination ship' && options.exact === true
      ? destinationSelect : emptyLocator(),
    getByRole: (role, options = {}) => role === 'button' && options.name === 'Request departure' &&
      options.exact === true ? requestButton : emptyLocator(),
  };

  function surfaceFor(roleId) {
    const actor = roleId === 'gm' ? gmActor : roleId === PRESS_ROLE ? pressActor : coreActor;
    const body = roleId === 'gm' ? gmState : roleId === PRESS_ROLE ? pressState : state;
    const route = roleId === PRESS_ROLE ? '#/press' : roleId === 'gm' ? '#/gm' : '#/shuttles/' + CORE_SHUTTLE;
    const page = {
      url: () => 'http://localhost:5174/' + route,
      evaluate: async (_fn, arg) => {
        if (arg && Object.hasOwn(arg, 'sessionId') && Object.hasOwn(arg, 'shuttleId')) return movement;
        return body;
      },
      locator: selector => { routeLookups.push({ roleId, selector }); return emptyLocator(); },
      getByLabel: () => emptyLocator(),
      getByRole: (role, options = {}) => {
        if (role === 'region' && options.name === 'Shuttle departure' && options.exact === true) return panel;
        if (role === 'status') return { allTextContents: async () => [] };
        return emptyLocator();
      },
      waitForURL: async () => { throw new Error('route navigation was not offered'); },
    };
    return {
      page, observe: async () => actor, storeModuleUrl: () => '/src/store/useSessionStore.ts',
      callable: async () => { throw new Error('the source recipe must not call the SDK directly'); },
    };
  }

  const gm = surfaceFor('gm');
  const game = {
    select: async (roleId, options) => {
      sourceSelections.push({ roleId, options });
      return roleId === 'gm' ? gm : surfaceFor(roleId);
    },
  };
  const roster = [
    { roleId: PRESS_ROLE, uidHash: uidHash(PRESS_UID) },
    { roleId: CORE_ROLE, uidHash: uidHash(CORE_UID) },
  ];
  if (duplicateCoreUid) roster.push({ roleId: 'dione-captain', uidHash: uidHash(CORE_UID) });
  const context = {
    initial: { sessionId: SESSION_ID }, roster, shuttleOriginAuthority: origin,
    ...(witness ? { shuttleArrivalWitness: witness } : {}),
  };
  return {
    context, game, state, sourceSelections, routeLookups, chosenOptions,
    coreSurface: surfaceFor(CORE_ROLE), coreActor, clickCount: () => clickCount,
  };
}

function serializedRequestCapture(expected) {
  const press = expected.uidHash === uidHash(PRESS_UID);
  const uid = press ? PRESS_UID : CORE_UID;
  const actor = press ? pressActor : coreActor;
  const shuttleId = expected.shuttleId ?? CORE_SHUTTLE;
  const groupId = expected.groupId ?? GROUP_ID;
  const sourceAuthority = expected.sourceAuthority;
  const result = {
    status: 'requested', sessionId: SESSION_ID, requestId: 'departure-original-0001',
    shuttleId, holderUid: uid, fleetGroupId: groupId,
    originShipId: 'icebreaker', destinationShipId: 'dione', cycle: CYCLE,
    controlRevision: CONTROL_REVISION, requestedAt: '2026-10-06T12:01:00.000Z',
  };
  return {
    caseId: 'core:requestShuttleDeparture', expected: { ...expected }, offered: true, mountedUi: true,
    originAuthority: { sessionId: SESSION_ID, uidHash: expected.uidHash, shuttleId,
      groupId, cycle: CYCLE, controlRevision: CONTROL_REVISION, sourceAuthority },
    actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: SESSION_ID, cycle: CYCLE, revision: CONTROL_REVISION, groupId },
    sourceAfter: { live: true, sessionId: SESSION_ID, cycle: CYCLE, revision: CONTROL_REVISION, groupId },
    transitionBefore: { kind: 'shuttle-movement', exists: false, sessionId: SESSION_ID,
      shuttleId, holderUidHash: expected.uidHash, groupId,
      controlRevision: CONTROL_REVISION, cycle: CYCLE },
    transitionAfter: { kind: 'shuttle-movement', exists: true, status: 'requested', sessionId: SESSION_ID,
      requestId: result.requestId, shuttleId, holderUidHash: expected.uidHash, groupId,
      destinationShipId: 'dione', controlRevision: CONTROL_REVISION, cycle: CYCLE },
    sourceAuthorityBefore: sourceAuthority, sourceAuthorityAfter: sourceAuthority,
    request: { sessionId: SESSION_ID, requestId: result.requestId, shuttleId,
      destinationShipId: 'dione', expectedControlRevision: CONTROL_REVISION, expectedCycle: CYCLE },
    response: { httpStatus: 200, result, exactReplay: true },
    replay: { result: { ...result, status: 'replayed' } },
    rendered: { visible: true, resultStatus: 'requested' },
  };
}

test('the public default recipe follows the exact original core holder when Press is first in server order', async () => {
  const harness = makeHarness();
  const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  const prepared = await recipe({ context: harness.context, game: harness.game });

  assert.equal(prepared.expected.shuttleId, CORE_SHUTTLE);
  assert.equal(prepared.expected.roleId, CORE_ROLE);
  assert.equal(prepared.expected.uidHash, uidHash(CORE_UID));
  assert.equal(prepared.expected.groupId, GROUP_ID);
  assert.deepEqual(harness.sourceSelections.filter(row => row.roleId !== 'gm'), [
    { roleId: CORE_ROLE, options: { enter: false } },
  ]);
  assert.deepEqual(harness.routeLookups, [], 'the already-current exact core route stays mounted');
  assert.deepEqual(harness.chosenOptions, ['dione'], 'the destination comes from the actual offered selector');

  const offered = await prepared.prepare({ surface: harness.coreSurface, actor: harness.coreActor, source: harness.state });
  assert.equal(offered.offered, true, offered.reason);
  assert.equal(offered.transitionBefore.shuttleId, CORE_SHUTTLE);
  assert.equal(harness.clickCount(), 0, 'preparation observes the source control and never clicks it');
  const capture = serializedRequestCapture(prepared.expected);
  const accepted = evaluateProcedureCapture(capture);
  assert.equal(accepted.status, 'completed', accepted.reason);
  assert.equal(accepted.endpoint, 'requestShuttleDeparture');
  assert.equal(evaluateProcedureCapture({ ...capture,
    request: { ...capture.request, shuttleId: PRESS_SHUTTLE } }).status, 'pending');
  assert.equal(evaluateProcedureCapture({ ...capture,
    expected: { ...capture.expected, shuttleId: PRESS_SHUTTLE } }).status, 'pending');
});

test('missing, stale, foreign, duplicate, and unknown original tuples block without another-holder fallback', async () => {
  const invalid = [
    { name: 'missing original witness', origin: null },
    { name: 'stale control revision', origin: originAuthority({ controlRevision: CONTROL_REVISION + 1 }) },
    { name: 'stale cycle', origin: originAuthority({ cycle: CYCLE + 1 }) },
    { name: 'foreign holder UID and role', origin: originAuthority({
      uid: PRESS_UID, roleId: PRESS_ROLE, sourceAuthority: currentAuthority({
        uid: PRESS_UID, roleId: PRESS_ROLE, shuttleId: CORE_SHUTTLE,
      }),
    }) },
    { name: 'unknown shuttle', origin: originAuthority({ shuttleId: 'unlisted-shuttle' }) },
  ];
  for (const item of invalid) {
    const harness = makeHarness({ origin: item.origin });
    const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
    const prepared = await recipe({ context: harness.context, game: harness.game });
    assert.deepEqual(harness.sourceSelections.filter(row => row.roleId !== 'gm'), [],
      item.name + ': no Press-first or alternate profile selection');
    assert.equal(prepared.expected.shuttleId, undefined, item.name + ': no target is substituted');
    const offered = await prepared.prepare({ surface: harness.coreSurface, actor: harness.coreActor, source: harness.state });
    assert.equal(offered.offered, false, item.name + ': missing/stale authority remains pending');
  }

  const duplicate = makeHarness({ duplicateCoreUid: true });
  const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  const prepared = await recipe({ context: duplicate.context, game: duplicate.game });
  assert.deepEqual(duplicate.sourceSelections.filter(row => row.roleId !== 'gm'), [],
    'a duplicated admitted UID is ambiguous and cannot fall through to Press or another role');
  assert.equal(prepared.expected.shuttleId, undefined);
});

test('all four public movement recipes retain the same supplied holder without selecting the first roster entry', async () => {
  const matchingArrival = makeArrivalWitness({ uid: CORE_UID, roleId: CORE_ROLE, shuttleId: CORE_SHUTTLE,
    groupId: GROUP_ID, controlRevision: CONTROL_REVISION, sourceAuthority: currentAuthority() });
  const cases = [
    { endpoint: 'requestShuttleDeparture', movement: null },
    { endpoint: 'beginShuttleTransit', movement: { status: 'requested', sessionId: SESSION_ID,
      requestId: 'departure-original-0001', shuttleId: CORE_SHUTTLE, holderUidHash: uidHash(CORE_UID),
      groupId: GROUP_ID, destinationShipId: 'dione', controlRevision: CONTROL_REVISION, cycle: CYCLE } },
    { endpoint: 'retargetShuttleTransit', movement: { status: 'in-transit', sessionId: SESSION_ID,
      requestId: 'departure-original-0001', transitRequestId: 'transit-original-0001', shuttleId: CORE_SHUTTLE,
      holderUidHash: uidHash(CORE_UID), groupId: GROUP_ID, destinationShipId: 'dione',
      controlRevision: CONTROL_REVISION, cycle: CYCLE, revision: 2 } },
    { endpoint: 'completeShuttleArrival', movement: { status: 'in-transit', sessionId: SESSION_ID,
      requestId: matchingArrival.departureRequestId, transitRequestId: matchingArrival.transitRequestId,
      shuttleId: CORE_SHUTTLE, holderUidHash: uidHash(CORE_UID), groupId: GROUP_ID,
      destinationShipId: matchingArrival.destinationShipId, controlRevision: CONTROL_REVISION,
      cycle: CYCLE, revision: matchingArrival.transitRevision, arrivesAt: '2026-10-06T12:00:00.000Z' },
      witness: matchingArrival },
  ];
  for (const item of cases) {
    const harness = makeHarness({ movement: item.movement, witness: item.witness });
    const recipe = createPendingProcedureDefaultSteps()[`core:${item.endpoint}`];
    const prepared = await recipe({ context: harness.context, game: harness.game });
    assert.equal(prepared.expected.shuttleId, CORE_SHUTTLE, item.endpoint);
    assert.equal(prepared.expected.roleId, CORE_ROLE, item.endpoint);
    assert.deepEqual(harness.sourceSelections.filter(row => row.roleId !== 'gm'), [
      { roleId: CORE_ROLE, options: { enter: false } },
    ], item.endpoint + ': original admitted holder only');
  }
});

test('an arrival witness that disagrees with the original holder authority remains pending with no fallback', async () => {
  const harness = makeHarness({
    origin: originAuthority(),
    witness: makeArrivalWitness(),
  });
  const recipe = createPendingProcedureDefaultSteps()['core:completeShuttleArrival'];
  const prepared = await recipe({ context: harness.context, game: harness.game });
  assert.deepEqual(harness.sourceSelections.filter(row => row.roleId !== 'gm'), []);
  assert.equal(prepared.expected.shuttleId, undefined);
  const offered = await prepared.prepare({ surface: harness.coreSurface, actor: harness.coreActor, source: harness.state });
  assert.equal(offered.offered, false);
});

test('a valid retarget witness can carry the same original authority into the arrival-only factory', async () => {
  const witness = makeArrivalWitness({ uid: CORE_UID, roleId: CORE_ROLE, shuttleId: CORE_SHUTTLE,
    groupId: GROUP_ID, controlRevision: CONTROL_REVISION, sourceAuthority: currentAuthority() });
  const harness = makeHarness({ origin: null, witness });
  const recipe = createPendingProcedureDefaultSteps()['core:completeShuttleArrival'];
  const prepared = await recipe({ context: harness.context, game: harness.game });
  assert.equal(prepared.expected.shuttleId, CORE_SHUTTLE);
  assert.equal(prepared.expected.roleId, CORE_ROLE);
  assert.deepEqual(harness.sourceSelections.filter(row => row.roleId !== 'gm'), [
    { roleId: CORE_ROLE, options: { enter: false } },
  ]);
});

test('Press movement is explicitly pending because its current member scope has no core berth or vessel map', async () => {
  const pressOrigin = {
    sessionId: SESSION_ID, uidHash: uidHash(PRESS_UID), shuttleId: PRESS_SHUTTLE,
    groupId: 'fleet-red', cycle: CYCLE, controlRevision: 2,
  };
  const harness = makeHarness({ origin: pressOrigin });
  const recipe = createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'];
  const prepared = await recipe({ context: harness.context, game: harness.game });
  assert.deepEqual(harness.sourceSelections.filter(row => row.roleId !== 'gm'), []);
  assert.equal(prepared.expected.shuttleId, undefined);
  const offered = await prepared.prepare({ surface: harness.coreSurface, actor: pressActor, source: harness.state });
  assert.equal(offered.offered, false);
  assert.match(offered.reason, /Press.*no current berth.*vessel scope/i);
  assert.equal(harness.clickCount(), 0);
  const serialized = evaluateProcedureCapture(serializedRequestCapture({
    sessionId: SESSION_ID, uidHash: uidHash(PRESS_UID), roleId: PRESS_ROLE, cycle: CYCLE,
    sourceRevision: 2, controlRevision: 2, groupId: 'fleet-red', shuttleId: PRESS_SHUTTLE,
    destinationShipId: 'dione', sourceAuthority: null,
  }));
  assert.equal(serialized.status, 'pending',
    'the serialized source proof cannot manufacture a Press berth or current-document authority');
});
