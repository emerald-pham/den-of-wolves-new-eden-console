import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { evaluateProcedureCapture } from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps, readActionState } from './pc10-pending-procedure-ui-recipes.mjs';

const PRESS_SHUTTLE_ID = 'snn-press-shuttle';
const SESSION_ID = 'press-session';
const UID = 'private-press-holder';
const UID_HASH = createHash('sha256').update(UID).digest('hex').slice(0, 16);
const GROUP_ID = 'fleet-press';
const hashJson = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const PRESS_GROUP_AUTHORITY = Object.freeze({ groupId: GROUP_ID,
  fleetGroupVesselIds: ['aegis', 'dione', 'icebreaker'], revision: 12 });
const SOURCE_AUTHORITY = Object.freeze({
  kind: 'press-shuttle-current-document', sessionId: SESSION_ID, uidHash: UID_HASH, groupId: GROUP_ID,
  activeConsoleRoleId: 'press-officer', assignedRoleId: null,
  connectionGeneration: 5, identityHydrationRevision: 9, documentTimeOrigin: 1_760_000_000_000,
  audienceHash: hashJson({ groupId: GROUP_ID, vesselIds: [], craftIds: [PRESS_SHUTTLE_ID] }),
  authorityHash: 'b'.repeat(64), discoveryRevision: 12,
  discoveryVesselsHash: hashJson(PRESS_GROUP_AUTHORITY.fleetGroupVesselIds), shuttleAuthorized: true,
});
const ORIGIN = Object.freeze({
  kind: 'press-shuttle-origin', sessionId: SESSION_ID, uidHash: UID_HASH, shuttleId: PRESS_SHUTTLE_ID,
  groupId: GROUP_ID, cycle: 3, controlRevision: 7, originShipId: 'aegis',
  sourceAuthority: SOURCE_AUTHORITY,
});

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

function memberStore(overrides = {}) {
  const base = {
    session: {
      id: SESSION_ID, phase: 'active', currentTurn: 3, pressEnabled: true,
      activeVesselIds: ['aegis', 'icebreaker', 'dione'],
      turnPhase: { turn: 3, progression: 'manual', airspace: { state: 'lifted' } },
      memberSessionScope: { groupId: GROUP_ID, vesselIds: [], craftIds: [PRESS_SHUTTLE_ID] },
      playerDiscovery: { groupId: GROUP_ID, fleetGroupVesselIds: ['aegis', 'icebreaker', 'dione'], revision: 12 },
      shuttleControl: { [PRESS_SHUTTLE_ID]: { shuttleId: PRESS_SHUTTLE_ID, ownerRoleId: 'press-officer',
        holderUid: UID, revision: 7 } },
      shuttleDockings: [{ shuttleId: PRESS_SHUTTLE_ID, shipId: 'aegis' }], shuttleVisitLog: [],
      shipResources: {}, shipFleetGroupIds: {},
    },
    me: { role: 'player', sessionId: SESSION_ID, uid: UID, connected: true, replacementStatus: null,
      fleetGroupId: GROUP_ID, activeConsoleRoleId: 'press-officer', assignedRoleId: null, connectionGeneration: 5 },
    connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 9,
  };
  const current = structuredClone(base);
  if (overrides.session) Object.assign(current.session, structuredClone(overrides.session));
  if (overrides.me) Object.assign(current.me, structuredClone(overrides.me));
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== 'session' && key !== 'me') current[key] = structuredClone(value);
  }
  return current;
}

function serializedSurface(currentState) {
  const uid = currentState.me?.uid ?? UID;
  const imports = async specifier => {
    if (specifier === '/src/lib/firebase.ts') return { auth: () => ({ currentUser: { uid } }) };
    if (specifier === '/src/store/useSessionStore.ts') return { useSessionStore: { getState: () => currentState } };
    throw new Error(`Unexpected browser module import: ${specifier}`);
  };
  return {
    storeModuleUrl: () => '/src/store/useSessionStore.ts',
    page: { evaluate: async (callback, args) => {
      const source = callback.toString()
        .replaceAll('await import(moduleUrl)', 'await fixtureImport(moduleUrl)')
        .replaceAll("await import('/src/lib/firebase.ts')", "await fixtureImport('/src/lib/firebase.ts')");
      assert.notEqual(source, callback.toString(), 'the serialized source reader must use the fixture module boundary');
      const serialized = new Function('fixtureImport', `return (${source});`)(imports);
      return serialized(args);
    } },
  };
}

function pressActor() {
  return { sameActor: true, sessionId: SESSION_ID, uidHash: UID_HASH, playerRole: 'player',
    profileRoleId: 'press-officer', activeConsoleRoleId: 'press-officer', assignedRoleId: null,
    connection: 'live', freshness: 'server' };
}

function departureWitness() {
  return { kind: 'press-shuttle-departure-witness', status: 'completed', endpoint: 'requestShuttleDeparture',
    sessionId: SESSION_ID, roleId: 'press-officer', uidHash: UID_HASH, shuttleId: PRESS_SHUTTLE_ID,
    groupId: GROUP_ID, cycle: 3, controlRevision: 7, originShipId: 'aegis', destinationShipId: 'icebreaker',
    departureRequestId: 'departure-1', requestedAt: '2026-10-06T10:00:00.000Z', sourceAuthority: SOURCE_AUTHORITY };
}

function transitWitness() {
  return { kind: 'press-shuttle-transit-witness', status: 'completed', endpoint: 'beginShuttleTransit',
    sessionId: SESSION_ID, roleId: 'press-officer', uidHash: UID_HASH, shuttleId: PRESS_SHUTTLE_ID,
    groupId: GROUP_ID, cycle: 3, controlRevision: 7, originShipId: 'aegis', destinationShipId: 'icebreaker',
    departureRequestId: 'departure-1', transitRequestId: 'transit-1', transitRevision: 1,
    requestedAt: '2026-10-06T10:00:00.000Z', departedAt: '2026-10-06T10:00:10.000Z',
    arrivesAt: '2026-10-06T10:01:10.000Z', sourceAuthority: SOURCE_AUTHORITY };
}

function browserLocator({ options = [], onClick = () => {}, onSelect = () => {} } = {}) {
  let selected = '';
  return {
    count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => onClick(),
    selectOption: async value => { selected = value; onSelect(value); },
    inputValue: async () => selected,
    locator: () => ({ evaluateAll: async callback => callback(options.map(option => ({ ...option }))) }),
    selected: () => selected,
  };
}

function pressRecipeHarness({ state = memberStore(), origin = ORIGIN, destinationOptions = [
  { value: 'quellon', textContent: 'Quellon', disabled: false },
  { value: 'icebreaker', textContent: 'Icebreaker', disabled: false },
], movement = null } = {}) {
  let selectedDestination = '';
  let clickCount = 0;
  let gmSelections = 0;
  const select = browserLocator({ options: destinationOptions, onSelect: value => { selectedDestination = value; } });
  const button = browserLocator({ onClick: () => { clickCount += 1; } });
  const panel = {
    getByLabel: label => label === 'Destination ship' ? select : browserLocator(),
    getByRole: () => button,
  };
  const surface = serializedSurface(state);
  surface.page.url = () => 'http://localhost:5174/#/press';
  surface.page.getByRole = () => panel;
  surface.page.locator = () => ({ count: async () => 0 });
  surface.page.waitForURL = async () => { throw new Error('The Press proof must not navigate to a standalone shuttle route.'); };
  const originalEvaluate = surface.page.evaluate;
  surface.page.evaluate = async (callback, args) => {
    if (callback.toString().includes('shuttleDepartures')) return movement;
    return originalEvaluate(callback, args);
  };
  surface.observe = async () => pressActor();
  const game = {
    select: async (roleId, options) => {
      if (roleId === 'gm') { gmSelections += 1; throw new Error('Press proof must not select the GM surface.'); }
      assert.equal(roleId, 'press-officer');
      assert.equal(options?.enter, false, 'the already mounted Press route is retained');
      return surface;
    },
  };
  const context = { initial: { sessionId: SESSION_ID }, roster: [{ roleId: 'press-officer', uidHash: UID_HASH }],
    pressShuttleOriginAuthority: origin };
  return { context, game, surface, select, clickCount: () => clickCount,
    selectedDestination: () => selectedDestination, gmSelections: () => gmSelections };
}

function movementInput(endpoint, { priorDeparture = departureWitness(), priorTransit = transitWitness() } = {}) {
  const expected = { sessionId: SESSION_ID, uidHash: UID_HASH, roleId: 'press-officer', shuttleId: PRESS_SHUTTLE_ID,
    groupId: GROUP_ID, cycle: 3, controlRevision: 7, sourceRevision: 7,
    sourceAuthority: SOURCE_AUTHORITY, pressOriginAuthority: ORIGIN, originShipId: 'aegis' };
  let transitionBefore, transitionAfter, request, result, destinationShipId;
  if (endpoint === 'requestShuttleDeparture') {
    destinationShipId = 'icebreaker';
    transitionBefore = { kind: 'shuttle-movement', exists: false, sessionId: SESSION_ID,
      shuttleId: PRESS_SHUTTLE_ID, holderUidHash: UID_HASH, groupId: GROUP_ID, controlRevision: 7, cycle: 3 };
    transitionAfter = { kind: 'shuttle-movement', exists: true, status: 'requested', sessionId: SESSION_ID,
      requestId: 'departure-1', shuttleId: PRESS_SHUTTLE_ID, holderUidHash: UID_HASH, groupId: GROUP_ID,
      destinationShipId, controlRevision: 7, cycle: 3 };
    request = { sessionId: SESSION_ID, requestId: 'departure-1', shuttleId: PRESS_SHUTTLE_ID,
      destinationShipId, expectedControlRevision: 7, expectedCycle: 3 };
    result = { status: 'requested', sessionId: SESSION_ID, requestId: request.requestId, shuttleId: PRESS_SHUTTLE_ID,
      holderUid: UID, fleetGroupId: GROUP_ID, originShipId: 'aegis', destinationShipId, cycle: 3,
      controlRevision: 7, requestedAt: '2026-10-06T10:00:00.000Z' };
  } else if (endpoint === 'beginShuttleTransit') {
    destinationShipId = 'icebreaker';
    transitionBefore = { kind: 'shuttle-movement', exists: true, status: 'requested', sessionId: SESSION_ID,
      requestId: 'departure-1', shuttleId: PRESS_SHUTTLE_ID, holderUidHash: UID_HASH, groupId: GROUP_ID,
      destinationShipId, controlRevision: 7, cycle: 3 };
    transitionAfter = { kind: 'shuttle-movement', exists: true, status: 'in-transit', sessionId: SESSION_ID,
      requestId: 'departure-1', transitRequestId: 'transit-1', shuttleId: PRESS_SHUTTLE_ID,
      holderUidHash: UID_HASH, groupId: GROUP_ID, destinationShipId, controlRevision: 7, cycle: 3, revision: 1 };
    request = { sessionId: SESSION_ID, requestId: 'transit-1', shuttleId: PRESS_SHUTTLE_ID,
      expectedDepartureRequestId: 'departure-1', expectedControlRevision: 7, expectedCycle: 3 };
    result = { status: 'in-transit', sessionId: SESSION_ID, requestId: 'departure-1', transitRequestId: request.requestId,
      shuttleId: PRESS_SHUTTLE_ID, holderUid: UID, fleetGroupId: GROUP_ID, destinationShipId, cycle: 3,
      controlRevision: 7, requestedAt: '2026-10-06T10:00:00.000Z', revision: 1,
      currentPosition: { x: 1, y: 2, z: 3 }, destinationPosition: { x: 4, y: 5, z: 6 },
      velocity: { x: 1, y: 1, z: 1 }, departedAt: '2026-10-06T10:00:10.000Z',
      arrivesAt: '2026-10-06T10:01:10.000Z' };
  } else {
    destinationShipId = 'dione';
    transitionBefore = { kind: 'shuttle-movement', exists: true, status: 'in-transit', sessionId: SESSION_ID,
      requestId: 'departure-1', transitRequestId: 'transit-1', shuttleId: PRESS_SHUTTLE_ID,
      holderUidHash: UID_HASH, groupId: GROUP_ID, destinationShipId: 'icebreaker', controlRevision: 7, cycle: 3, revision: 1 };
    transitionAfter = { ...transitionBefore, destinationShipId, revision: 2 };
    request = { sessionId: SESSION_ID, requestId: 'retarget-1', shuttleId: PRESS_SHUTTLE_ID,
      transitRequestId: 'transit-1', destinationShipId, expectedControlRevision: 7, expectedCycle: 3 };
    result = { status: 'in-transit', sessionId: SESSION_ID, requestId: 'departure-1', transitRequestId: 'transit-1',
      shuttleId: PRESS_SHUTTLE_ID, holderUid: UID, fleetGroupId: GROUP_ID, destinationShipId, cycle: 3,
      controlRevision: 7, requestedAt: '2026-10-06T10:00:00.000Z', revision: 2,
      currentPosition: { x: 1, y: 2, z: 3 }, destinationPosition: { x: 7, y: 8, z: 9 },
      velocity: { x: 1, y: 1, z: 1 }, departedAt: '2026-10-06T10:00:30.000Z',
      arrivesAt: '2026-10-06T10:01:30.000Z' };
  }
  expected.destinationShipId = destinationShipId;
  expected.departureRequestId = 'departure-1';
  expected.transitRequestId = 'transit-1';
  const actor = pressActor();
  return { caseId: `core:${endpoint}`, expected, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: { ...actor }, sourceBefore: { live: true, sessionId: SESSION_ID, cycle: 3, phase: 'active', revision: 7, groupId: GROUP_ID },
    sourceAfter: { live: true, sessionId: SESSION_ID, cycle: 3, phase: 'active', revision: 7, groupId: GROUP_ID },
    transitionBefore, transitionAfter, pressOriginAuthority: ORIGIN,
    pressSourceAuthorityBefore: SOURCE_AUTHORITY, pressSourceAuthorityAfter: { ...SOURCE_AUTHORITY },
    pressGroupAuthorityBefore: PRESS_GROUP_AUTHORITY, pressGroupAuthorityAfter: PRESS_GROUP_AUTHORITY,
    pressDockingBefore: { kind: 'press-shuttle-docking', shuttleId: PRESS_SHUTTLE_ID,
      dockingCount: endpoint === 'requestShuttleDeparture' || endpoint === 'beginShuttleTransit' ? 1 : 0,
      originShipId: endpoint === 'requestShuttleDeparture' || endpoint === 'beginShuttleTransit' ? 'aegis' : null },
    pressDockingAfter: { kind: 'press-shuttle-docking', shuttleId: PRESS_SHUTTLE_ID,
      dockingCount: endpoint === 'requestShuttleDeparture' ? 1 : 0,
      originShipId: endpoint === 'requestShuttleDeparture' ? 'aegis' : null },
    ...(endpoint === 'beginShuttleTransit' ? { pressShuttleDepartureWitness: priorDeparture } : {}),
    ...(endpoint === 'retargetShuttleTransit' ? { pressShuttleTransitWitness: priorTransit } : {}),
    sourceAuthorityBefore: SOURCE_AUTHORITY, sourceAuthorityAfter: { ...SOURCE_AUTHORITY },
    request, response: { httpStatus: 200, result, exactReplay: true },
    replay: { status: 'committed', result: structuredClone(result) },
    rendered: { visible: true, resultStatus: result.status } };
}

test('Press source mounts the ordinary SNN movement panel at its real Press route', async () => {
  const [sessionMode, shuttleConsole, shuttleControl] = await Promise.all([
    readFile(new URL('../src/routes/SessionMode.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/ShuttleConsole.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ShuttleControl.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(sessionMode, /<ShuttleConsole shuttleId="snn-press-shuttle"\s*\/>/);
  assert.match(shuttleConsole, /const isPressShuttle = shuttleId === 'snn-press-shuttle'/);
  assert.match(shuttleControl, /aria-label="Shuttle departure"/);
  for (const label of ['Destination ship', 'Request departure', 'Begin transit', 'New destination ship', 'Retarget shuttle', 'Complete arrival']) {
    const present = label === 'Complete arrival'
      ? shuttleControl.includes("'Complete arrival'")
      : shuttleControl.includes(`>${label}<`);
    assert.ok(present, `the source exposes the real ${label} control`);
  }
  assert.match(shuttleControl, /control\.holderUid === me\.uid/);
  assert.match(shuttleControl, /snn-press-shuttle/);
});

test('serialized member reader emits strict Press-only source authority without a core berth', async () => {
  const state = await readActionState(serializedSurface(memberStore()), PRESS_SHUTTLE_ID);
  assert.equal(state.currentDocumentAuthority, null, 'the intentional empty vessel scope never becomes a core berth');
  assert.ok(state.pressDocumentAuthority, 'the exact Press member document can authorize a separate SNN proof');
  const authority = state.pressDocumentAuthority;
  assert.equal(authority.kind, SOURCE_AUTHORITY.kind);
  assert.equal(authority.sessionId, SESSION_ID);
  assert.equal(authority.uidHash, UID_HASH);
  assert.equal(authority.groupId, GROUP_ID);
  assert.equal(authority.activeConsoleRoleId, 'press-officer');
  assert.equal(authority.assignedRoleId, null);
  assert.equal(authority.connectionGeneration, 5);
  assert.equal(authority.identityHydrationRevision, 9);
  assert.equal(authority.documentTimeOrigin, globalThis.performance.timeOrigin);
  assert.match(authority.audienceHash, /^[0-9a-f]{64}$/);
  assert.match(authority.authorityHash, /^[0-9a-f]{64}$/);
  assert.equal(authority.discoveryRevision, 12);
  assert.match(authority.discoveryVesselsHash, /^[0-9a-f]{64}$/);
  assert.equal(authority.shuttleAuthorized, true);
  assert.deepEqual(state.pressGroupAuthority, { groupId: GROUP_ID,
    fleetGroupVesselIds: ['aegis', 'dione', 'icebreaker'], revision: 12 });
  assert.doesNotMatch(JSON.stringify(state), new RegExp(UID));

  const drifts = [
    { me: { activeConsoleRoleId: 'icebreaker-miner' } },
    { me: { assignedRoleId: 'press-officer' } },
    { me: { fleetGroupId: 'foreign-group' } },
    { session: { memberSessionScope: { groupId: GROUP_ID, vesselIds: ['aegis'], craftIds: [PRESS_SHUTTLE_ID] } } },
    { session: { memberSessionScope: { groupId: GROUP_ID, vesselIds: [], craftIds: [] } } },
    { session: { playerDiscovery: { groupId: 'foreign-group', fleetGroupVesselIds: ['aegis'], revision: 12 } } },
    { session: { playerDiscovery: { groupId: GROUP_ID, fleetGroupVesselIds: ['aegis', 'aegis'], revision: 12 } } },
    { connection: 'offline' },
    { sessionSnapshotFreshness: 'cache' },
  ];
  for (const drift of drifts) {
    const changed = await readActionState(serializedSurface(memberStore(drift)), PRESS_SHUTTLE_ID);
    assert.equal(changed.pressDocumentAuthority, null, JSON.stringify(drift));
  }

  for (const drift of [{ me: { connectionGeneration: 6 } }, { identityHydrationRevision: 10 }]) {
    const changed = await readActionState(serializedSurface(memberStore(drift)), PRESS_SHUTTLE_ID);
    assert.ok(changed.pressDocumentAuthority, 'the changed generation or hydration is current when sampled');
    assert.notEqual(changed.pressDocumentAuthority.authorityHash, authority.authorityHash,
      'the changed current document cannot reuse a stale captured authority');
  }
});

test('default Press request keeps the original UID on #/press and selects only a current same-group panel option', async () => {
  const current = memberStore();
  const read = await readActionState(serializedSurface(current), PRESS_SHUTTLE_ID);
  const origin = { ...ORIGIN, sourceAuthority: read.pressDocumentAuthority };
  const harness = pressRecipeHarness({ state: current, origin });
  const recipe = await createPendingProcedureDefaultSteps()['core:requestShuttleDeparture'](harness);
  const plan = await recipe.prepare({ surface: harness.surface, actor: pressActor(),
    source: { cycle: 3, phase: 'active' } });
  assert.equal(plan.offered, true, plan.reason);
  assert.equal(harness.selectedDestination(), 'icebreaker', 'the foreign offered ship is not selected');
  assert.equal(harness.gmSelections(), 0, 'Press proof reads its own member projection');
  assert.equal(harness.surface.page.url().split('#')[1], '/press', 'the already-mounted Press route stays current');
  await plan.click();
  assert.equal(harness.clickCount(), 1);

  const missing = { ...harness.context, pressShuttleOriginAuthority: undefined };
  const blocked = await createPendingProcedureDefaultSteps()['core:requestShuttleDeparture']({ ...harness, context: missing });
  assert.equal((await blocked.prepare({ surface: harness.surface, actor: pressActor(),
    source: { cycle: 3, phase: 'active' } })).offered, false);
});

test('Press Request, Begin, and Retarget receipts need the same strict current source tuple and exact SDK replay', () => {
  const request = movementInput('requestShuttleDeparture');
  const requested = evaluateProcedureCapture(request);
  assert.equal(requested.status, 'completed', requested.reason);
  assert.equal(requested.exactSdkRetry, 'same-original-request-receipt-confirmed');
  assert.equal(requested.pressShuttleDepartureWitness.originShipId, 'aegis');

  const begin = movementInput('beginShuttleTransit', { priorDeparture: requested.pressShuttleDepartureWitness });
  const transit = evaluateProcedureCapture(begin);
  assert.equal(transit.status, 'completed', transit.reason);
  assert.equal(transit.pressShuttleTransitWitness.departureRequestId,
    requested.pressShuttleDepartureWitness.departureRequestId);
  assert.equal(transit.pressShuttleTransitWitness.originShipId, 'aegis');

  const retarget = movementInput('retargetShuttleTransit', { priorTransit: transit.pressShuttleTransitWitness });
  const retargeted = evaluateProcedureCapture(retarget);
  assert.equal(retargeted.status, 'completed', retargeted.reason);
  assert.equal(retargeted.exactSdkRetry, 'same-original-request-receipt-confirmed');
  assert.equal(retargeted.pressShuttleArrivalWitness.transitRevision, 2);
  assert.equal(retargeted.pressShuttleArrivalWitness.originShipId, 'aegis');

  for (const [endpoint, input] of [['requestShuttleDeparture', request], ['beginShuttleTransit', begin],
    ['retargetShuttleTransit', retarget]]) {
    assert.equal(evaluateProcedureCapture({ ...input, pressOriginAuthority: undefined }).status, 'pending',
      `${endpoint} missing original Press source witness`);
    assert.equal(evaluateProcedureCapture({ ...input,
      pressOriginAuthority: { ...ORIGIN, groupId: 'foreign-group' } }).status, 'pending',
    `${endpoint} foreign group`);
    assert.equal(evaluateProcedureCapture({ ...input,
      pressSourceAuthorityAfter: { ...SOURCE_AUTHORITY, identityHydrationRevision: 10 } }).status, 'pending',
    `${endpoint} changed document hydration`);
    assert.equal(evaluateProcedureCapture({ ...input, actorAfter: { ...input.actorAfter,
      activeConsoleRoleId: 'icebreaker-miner', profileRoleId: 'icebreaker-miner' } }).status, 'pending',
    `${endpoint} changed current role`);
    assert.equal(evaluateProcedureCapture({ ...input, response: { ...input.response, exactReplay: false } }).status, 'pending',
    `${endpoint} no exact SDK retry`);
  }
  assert.equal(evaluateProcedureCapture({ ...begin, pressShuttleDepartureWitness: undefined }).status, 'pending',
    'Begin must bind the source accepted Request witness');
  assert.equal(evaluateProcedureCapture({ ...retarget, pressShuttleTransitWitness: undefined }).status, 'pending',
    'Retarget must bind the source accepted Begin witness');
  assert.equal(evaluateProcedureCapture({ ...request,
    response: { ...request.response, result: { ...request.response.result, originShipId: 'dione' } } }).status, 'pending',
  'request result must preserve the actual original docking');
  assert.equal(evaluateProcedureCapture({ ...begin,
    pressShuttleDepartureWitness: { ...begin.pressShuttleDepartureWitness, groupId: 'foreign-group' } }).status, 'pending',
  'Begin rejects a foreign prior request tuple');
});

test('Press automatic arrival binds the exact source-timed transit and own visit projection without core ship balances', () => {
  const retarget = evaluateProcedureCapture(movementInput('retargetShuttleTransit'));
  assert.equal(retarget.status, 'completed', retarget.reason);
  const input = pressArrivalInput(retarget.pressShuttleArrivalWitness);
  const accepted = evaluateProcedureCapture(input);
  assert.equal(accepted.status, 'completed', accepted.reason);
  assert.equal(accepted.arrivalMode, 'automatic-source-effect');
  assert.equal(accepted.exactSdkRetry, 'not-claimed');
  assert.equal(evaluateProcedureCapture({ ...input, replay: {} }).status, 'pending', 'arrival is single-shot');
  assert.equal(evaluateProcedureCapture({ ...input,
    arrival: { ...input.arrival, automaticObservation: { ...input.arrival.automaticObservation, remainingMs: 35_001 } } }).status, 'pending',
  'the unchanged 35-second arming ceiling is enforced');
  assert.equal(evaluateProcedureCapture({ ...input,
    arrival: { ...input.arrival, automaticObservation: { ...input.arrival.automaticObservation,
      responseObservedAt: '2026-10-06T10:01:29.000Z' } } }).status, 'pending',
  'an automatic arrival response observed before source arrivesAt is not credited');
  assert.equal(evaluateProcedureCapture({ ...input,
    arrival: { ...input.arrival, authorityAfter: { ...SOURCE_AUTHORITY, connectionGeneration: 6 } } }).status, 'pending',
  'arrival rejects document generation drift');
  assert.equal(evaluateProcedureCapture({ ...input,
    arrival: { ...input.arrival, afterProjection: { ...input.arrival.afterProjection,
      visits: input.arrival.afterProjection.visits.slice(0, 1) } } }).status, 'pending',
  'arrival needs the exact departure and docking visits');
});

function pressArrivalInput(retargetWitness) {
  const arrivedAt = '2026-10-06T10:01:30.000Z';
  const before = { kind: 'press-shuttle-arrival-before', status: 'in-transit', sessionId: SESSION_ID,
    departureRequestId: 'departure-1', transitRequestId: 'transit-1', shuttleId: PRESS_SHUTTLE_ID,
    holderUidHash: UID_HASH, groupId: GROUP_ID, originShipId: 'aegis', destinationShipId: 'dione',
    controlRevision: 7, cycle: 3, transitRevision: 2,
    requestedAt: '2026-10-06T10:00:00.000Z', departedAt: '2026-10-06T10:00:30.000Z',
    arrivesAt: arrivedAt };
  const baseProjection = { kind: 'press-shuttle-arrival-projection', live: true, sessionId: SESSION_ID, cycle: 3,
    phase: 'active', turn: 3, progression: 'manual', airspaceState: 'lifted', pressAccess: null, timerPaused: false,
    holderUidHash: UID_HASH, controlRevision: 7, groupId: GROUP_ID, originShipId: 'aegis',
    destinationShipId: 'dione', destinationActive: true, destinationInGroup: true };
  const priorWitness = retargetWitness ?? { kind: 'press-shuttle-arrival-witness', status: 'completed', endpoint: 'retargetShuttleTransit',
    sessionId: SESSION_ID, roleId: 'press-officer', uidHash: UID_HASH, shuttleId: PRESS_SHUTTLE_ID,
    groupId: GROUP_ID, cycle: 3, controlRevision: 7, originShipId: 'aegis', departureRequestId: 'departure-1',
    transitRequestId: 'transit-1', destinationShipId: 'dione', transitRevision: 2,
    requestedAt: before.requestedAt, departedAt: before.departedAt, arrivesAt: before.arrivesAt,
    sourceAuthority: SOURCE_AUTHORITY };
  const afterProjection = { ...baseProjection, movementAbsent: true,
    dockings: [{ shuttleId: PRESS_SHUTTLE_ID, shipId: 'dione', dockedAt: arrivedAt }],
    visits: [
      { id: 'shuttle-arrival-transit-1-departed', shuttleId: PRESS_SHUTTLE_ID, shipId: 'aegis', action: 'departed', occurredAt: '2026-10-06T10:00:10.000Z' },
      { id: 'shuttle-arrival-transit-1-docked', shuttleId: PRESS_SHUTTLE_ID, shipId: 'dione', action: 'docked', occurredAt: arrivedAt },
    ], observedAt: '2026-10-06T10:02:11.000Z' };
  const result = { status: 'arrived', sessionId: SESSION_ID, requestId: 'arrival-transit-1',
    transitRequestId: 'transit-1', shuttleId: PRESS_SHUTTLE_ID, hostShipId: 'dione',
    transitRevision: 2, arrivedAt };
  const actor = pressActor();
  return { caseId: 'core:completeShuttleArrival', expected: { sessionId: SESSION_ID, uidHash: UID_HASH,
    roleId: 'press-officer', shuttleId: PRESS_SHUTTLE_ID, groupId: GROUP_ID, cycle: 3, controlRevision: 7,
    departureRequestId: 'departure-1', transitRequestId: 'transit-1', destinationShipId: 'dione',
    transitRevision: 2, sourceAuthority: SOURCE_AUTHORITY, pressOriginAuthority: ORIGIN }, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: { ...actor }, pressOriginAuthority: ORIGIN,
    pressGroupAuthorityBefore: PRESS_GROUP_AUTHORITY, pressGroupAuthorityAfter: PRESS_GROUP_AUTHORITY,
    sourceBefore: { live: true, sessionId: SESSION_ID, cycle: 3, phase: 'active', groupId: GROUP_ID },
    sourceAfter: { live: true, sessionId: SESSION_ID, cycle: 3, phase: 'active', groupId: GROUP_ID },
    request: { sessionId: SESSION_ID, requestId: 'arrival-transit-1', shuttleId: PRESS_SHUTTLE_ID,
      transitRequestId: 'transit-1', expectedControlRevision: 7 },
    response: { httpStatus: 200, result, exactReplay: false }, replay: null,
    rendered: { visible: true, resultStatus: 'arrived' },
    arrival: { captureMode: 'automatic-source-effect', priorWitness, authorityBefore: SOURCE_AUTHORITY,
      authorityAfter: SOURCE_AUTHORITY,
      groupAuthorityBefore: PRESS_GROUP_AUTHORITY, groupAuthorityAfter: PRESS_GROUP_AUTHORITY,
      automaticObservation: { kind: 'source-useEffect', panel: 'Shuttle departure',
      armedAt: '2026-10-06T10:01:00.000Z', arrivesAt: arrivedAt, remainingMs: 30_000,
        responseObservedAt: '2026-10-06T10:01:30.000Z' },
      before, beforeProjection: { ...baseProjection, dockingCount: 0 }, afterProjection } };
}
