import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';

// Keep the pre-implementation RED behavioral: the test invokes the expected
// P181 consumer transition with controlled observers and receipts. A missing
// implementation leaves the actual action trace empty; import failure alone
// is not the assertion under test.
let runProof;
try {
  ({ runP181StarlightMovementScoutUiProof: runProof } =
    await import('./pc10-starlight-movement-scout-ui-proof.mjs'));
} catch {
  runProof = undefined;
}

const originalRoleIds = Object.freeze([
  'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
  'quellon-explorer', 'refinery-124-pdf-colonel',
  'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
]);

const original = Object.freeze({
  sessionId: 'normal-session', uid: 'wing-uid', uidHash: 'a'.repeat(16),
  meSessionId: 'normal-session',
  hasAuth: true, sameActor: true, playerRole: 'player', profileRoleId: null,
  assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
  seatId: 'wing-commander', replacementRoleId: null, replacementStatus: null,
  roleId: 'wing-commander', generation: 2, connectionGeneration: 2,
  hydrationRevision: 3, identityHydrationRevision: 3, connection: 'live', freshness: 'server',
  phase: 'active', cycle: 1, airspace: 'lifted', turnStatePhase: 'coordination',
  fullGameDemo: null, currentOwnPlayerConfirmed: true, sdkHasServerAuthority: true,
  groupId: 'fleet-1', shipId: 'aegis',
});

function makeConsumer() {
  const trace = [];
  const state = {
    actor: { ...original },
    session: { sessionId: 'normal-session', phase: 'active', cycle: 1, airspace: 'lifted', turnStatePhase: 'coordination',
      activeRoleIds: ['admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
        'quellon-explorer', 'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
        'joint-engineering-shepherd-icebreaker'],
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      control: { shuttleId: 'starlight', holderUid: 'wing-uid', ownerUid: 'wing-uid', revision: 4 },
      docking: { shuttleId: 'starlight', shipId: 'aegis' },
      departure: null, transit: null,
      scoutOffer: { entitled: true, firstRequestAvailable: true, fuelledSecondRequestAvailable: true,
        coordinate: '1100', printedCoordinates: ['1100'], range: 2 },
      privateResult: null, privateNote: null,
    },
  };
  let commandCount = 0;
  const page = new EventEmitter();
  page.url = () => 'http://127.0.0.1:5174/#/shuttles/starlight';
  const result = async (endpoint, request, value) => {
    commandCount++;
    const response = {
      url: () => `http://127.0.0.1:5013/demo-p181-test/us-central1/${endpoint}`,
      status: () => 200,
      request: () => ({ url: () => response.url(), method: () => 'POST',
        postDataJSON: () => ({ data: structuredClone(request) }) }),
      json: async () => ({ result: structuredClone(value) }),
    };
    let observerArmed = false;
    const observed = await observeUiReceipt({ page, consumed: { endpoint, source: 'controlled actual UI fixture' },
      waitForResponse: () => { observerArmed = true; return Promise.resolve(response); },
      choose: async () => {
        assert.equal(observerArmed, true, 'The existing shared receipt observer is armed before the consumer action.');
        trace.push({ endpoint, request: structuredClone(request) });
      } });
    assert.equal(observed, response);
    const data = structuredClone(observed.request().postDataJSON().data);
    return { endpoint, data, request: data, before: structuredClone(state.actor),
      httpStatus: observed.status(), result: (await observed.json()).result };
  };
  const io = {
    async observeMember() { return structuredClone(state.actor); },
    async observeFlight() { return structuredClone(state.session); },
    async openStarlightFromWingWorkspace() { trace.push({ ui: 'open-starlight' }); },
    async departureOptions() { return ['icebreaker', 'shepherd']; },
    async retargetOptions() { return ['shepherd', 'quellon']; },
    async requestDeparture(destination, before) {
      const request = { sessionId: 'normal-session', requestId: 'departure-1', shuttleId: 'starlight',
        destinationShipId: destination, expectedControlRevision: before.control.revision, expectedCycle: before.cycle };
      state.session.departure = { requestId: request.requestId, destinationShipId: destination, cycle: before.cycle };
      return result('requestShuttleDeparture', request, { status: 'requested', requestId: request.requestId });
    },
    async waitForDeparture() { return structuredClone(state.session); },
    async beginTransit(departure, before) {
      const request = { sessionId: 'normal-session', requestId: 'begin-1', shuttleId: 'starlight',
        expectedDepartureRequestId: departure.requestId, expectedControlRevision: before.control.revision,
        expectedCycle: before.cycle };
      state.session.transit = { transitRequestId: 'transit-1', status: 'in-transit',
        originShipId: 'aegis', destinationShipId: departure.destinationShipId,
        departedAt: new Date().toISOString(), arrivesAt: new Date(Date.now() + 60_000).toISOString(), cycle: before.cycle };
      state.session.departure = null;
      return result('beginShuttleTransit', request, { ...state.session.transit, requestId: request.requestId });
    },
    async waitForTransit() { return structuredClone(state.session); },
    async retargetTransit(transit, destination, before) {
      const request = { sessionId: 'normal-session', requestId: 'retarget-1', shuttleId: 'starlight',
        transitRequestId: transit.transitRequestId, destinationShipId: destination,
        expectedControlRevision: before.control.revision, expectedCycle: before.cycle };
      state.session.transit = { ...state.session.transit, destinationShipId: destination,
        retargetRequestId: request.requestId, departedAt: new Date().toISOString(),
        arrivesAt: new Date(Date.now() + 60_000).toISOString() };
      return result('retargetShuttleTransit', request, { ...state.session.transit, requestId: request.requestId });
    },
    async waitForArrivalWindow(transit, timeout) {
      assert.equal(timeout, 60_000);
      assert.equal(Date.parse(transit.arrivesAt) - Date.parse(transit.departedAt), 60_000,
        'Controlled source timer models the native Starlight 60-second duration without sleeping or making actors.');
      return structuredClone(state.session);
    },
    async completeArrival(transit, before) {
      const request = { sessionId: 'normal-session', shuttleId: 'starlight',
        transitRequestId: transit.transitRequestId, expectedControlRevision: before.control.revision };
      state.session.docking = { shuttleId: 'starlight', shipId: transit.destinationShipId };
      state.session.transit = null;
      state.session.control = { ...state.session.control, revision: 5 };
      return result('completeShuttleArrival', request, { hostShipId: transit.destinationShipId,
        arrivedAt: new Date().toISOString() });
    },
    async waitForDocking() { return structuredClone(state.session); },
    async currentScoutOffer() { return structuredClone(state.session.scoutOffer); },
    async requestScout(coordinate, before, ordinal) {
      const request = { sessionId: 'normal-session', requestId: `scout-${ordinal}`,
        entitlementId: 'starlight', targetCoordinate: coordinate };
      const response = { status: 'requested', resolution: 'pending', requestId: request.requestId,
        sessionId: request.sessionId, cycle: before.cycle, entitlementId: 'starlight', source: 'craft',
        ownerRoleId: 'wing-commander', anchorShipId: 'aegis', receivingShipId: 'aegis',
        targetCoordinate: coordinate };
      return result('requestScout', request, response);
    },
    async resolveScoutNormally(request) {
      trace.push({ ui: 'normal-gm-scout-resolution', requestId: request.requestId });
      state.session.privateResult = { requestId: request.requestId, type: 'private-scout-result',
        requesterUid: 'wing-uid', sourceId: 'starlight', cycle: 1, targetCoordinate: request.targetCoordinate,
        systemFact: { coordinate: request.targetCoordinate, code: 'A', title: 'Actual private current fact' } };
      state.session.privateNote = { id: '1'.repeat(64), type: 'player-discovery-note', cycle: 1,
        targetCoordinate: request.targetCoordinate, systemFact: { ...state.session.privateResult.systemFact },
        recordedAt: new Date().toISOString() };
      return { report: { requestId: request.requestId, cycle: 1, entitlementId: 'starlight',
        targetCoordinate: request.targetCoordinate, status: 'resolved', noteId: state.session.privateNote.id },
        result: structuredClone(state.session.privateResult), note: structuredClone(state.session.privateNote) };
    },
    async reloadAndReselectWingCommander() {
      trace.push({ ui: 'reload-and-reselect-wing-commander' });
      return { actor: structuredClone(state.actor), flight: structuredClone(state.session) };
    },
  };
  return { io, trace, state, commandCount };
}

test('a normally admitted current Wing Commander performs one original Starlight departure, Begin, retarget, arrival and private scout flow', async () => {
  const { io, trace } = makeConsumer();
  const result = await runProof?.({
    initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: true,
      playerCount: 8, chartId: 'A', fullGameDemo: null, activeRoleIds: originalRoleIds },
    started: { sessionId: 'normal-session', phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
      instanceId: 'gm-original-instance', fullGameDemo: null },
    roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: 'normal-session' }],
    gm: { uidHash: 'b'.repeat(16), sessionId: 'normal-session', meSessionId: 'normal-session',
      instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
      profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
      identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
      kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
      sdkHasServerAuthority: true, gmInstanceOwned: true },
    expectedWingCommander: original,
    io,
    absoluteDeadlineMs: Date.now() + 15 * 60_000,
  });

  assert.deepEqual(trace.filter(item => item.endpoint).map(item => item.endpoint), [
    'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
    'completeShuttleArrival', 'requestScout', 'requestScout',
  ], 'The real UI procedure must consume the full movement transition and only the two actually fuelled same-cycle scan receipts.');
  assert.equal(trace.filter(item => item.endpoint === 'beginShuttleTransit').length, 1,
    'An uncertain Begin must never be repeated with a new command identity.');
  assert.deepEqual(result?.movement?.finalDocking, { shuttleId: 'starlight', shipId: 'shepherd' });
  assert.equal(result?.scouting?.privateReports?.length, 2);
  assert.equal(result?.scouting?.privateReports?.[0]?.requesterUid, undefined,
    'Saved proof rows must redact private raw requester identity.');
  assert.ok(trace.some(item => item.ui === 'reload-and-reselect-wing-commander'),
    'Recovery uses the original role chooser and actor after a normal reload.');
});

if (runProof) test('a lost live berth or non-lifted phase stops before the first source mutation', async () => {
  const { io, trace, state } = makeConsumer();
  state.actor.activeConsoleRoleId = null;
  await assert.rejects(runProof?.({
    initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: true,
      playerCount: 8, chartId: 'A', fullGameDemo: null, activeRoleIds: originalRoleIds },
    started: { sessionId: 'normal-session', phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
      instanceId: 'gm-original-instance', fullGameDemo: null },
    roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: 'normal-session' }],
    gm: { uidHash: 'b'.repeat(16), sessionId: 'normal-session', meSessionId: 'normal-session',
      instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
      profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
      identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
      kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
      sdkHasServerAuthority: true, gmInstanceOwned: true },
    expectedWingCommander: original, io, absoluteDeadlineMs: Date.now() + 15 * 60_000,
  }), /current.*Wing Commander|berth|authority/i);
  assert.equal(trace.some(item => item.endpoint), false, 'A missing current console/station must not trigger a request.');
});
else test('lost-live-berth negative guard is exercised after the consumer runner is implemented', t => t.skip('Main behavioral RED records the missing transition before implementation.'));
