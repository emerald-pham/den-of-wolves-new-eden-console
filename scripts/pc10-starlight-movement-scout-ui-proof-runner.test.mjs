import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { pc11SameActorEpoch } from './qualification/pc11-normal-start-adapter.mjs';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { createP181StarlightBrowserIo, createP181StarlightNativeSurfaceFactory,
  captureP181SourceBindings, runP181StarlightMovementScoutUiProof } from './pc10-starlight-movement-scout-ui-proof.mjs';

// Keep the pre-implementation RED behavioral: the test invokes the expected
// P181 consumer transition with controlled observers and receipts. A missing
// implementation leaves the actual action trace empty; import failure alone
// is not the assertion under test.
const originalRoleIds = Object.freeze([
  'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
  'quellon-explorer', 'refinery-124-pdf-colonel',
  'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
]);

const original = Object.freeze({
  sessionId: 'normal-session', uid: 'wing-uid', uidHash: '81088b8f489c2407',
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
      scoutOffer: { eligible: true, sessionId: 'normal-session', cycle: 1, airspace: 'lifted',
        entitlementId: 'starlight', ownerRoleId: 'wing-commander', anchorShipId: 'aegis',
        firstRequestAvailable: true, fuelledSecondRequestAvailable: false,
        coordinate: '1100', printedCoordinates: ['1100', '1101'], distance: 2, range: 2 },
      privateResult: null, privateNote: null,
    },
  };
  let commandCount = 0, scoutCount = 0;
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
      state.session.transit = { transitRequestId: 'transit-1', revision: 1, status: 'in-transit',
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
    async selectPrintedScoutCoordinate(coordinate, offer) {
      assert.ok(offer.printedCoordinates.includes(coordinate));
      state.session.scoutOffer = { ...state.session.scoutOffer, coordinate };
      trace.push({ ui: 'select-current-printed-scout-coordinate', coordinate });
      return structuredClone(state.session.scoutOffer);
    },
    async requestScout(coordinate, before) {
      const ordinal = ++scoutCount;
      const request = { sessionId: 'normal-session', requestId: `scout-${ordinal}`,
        entitlementId: 'starlight', targetCoordinate: coordinate };
      const response = { status: 'requested', resolution: 'pending', requestId: request.requestId,
        sessionId: request.sessionId, cycle: before.cycle, entitlementId: 'starlight', source: 'craft',
        ownerRoleId: 'wing-commander', anchorShipId: 'aegis', receivingShipId: 'aegis',
        targetCoordinate: coordinate };
      state.session.scoutOffer = { ...state.session.scoutOffer, firstRequestAvailable: false,
        fuelledSecondRequestAvailable: true };
      return result('requestScout', request, response);
    },
    async resolveScoutNormally(request) {
      trace.push({ ui: 'normal-gm-scout-resolution', requestId: request.requestId });
      state.session.privateResult = { sessionId: 'normal-session', requestId: request.requestId, type: 'private-scout-result',
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
  return { io, trace, state, commandCount, receipt: result };
}

test('controlled shared-receipt IO consumes one original Starlight movement and private scout flow', async () => {
  const { io, trace } = makeConsumer();
  const result = await runP181StarlightMovementScoutUiProof({
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
  const scoutTargets = trace.filter(item => item.endpoint === 'requestScout').map(item => item.request.targetCoordinate);
  assert.deepEqual(scoutTargets, ['1100', '1101'],
    'A second same-cycle scan selects another currently printed coordinate when the normal form retains the first selection.');
  assert.deepEqual(result?.movement?.finalDocking, { shuttleId: 'starlight', shipId: 'shepherd' });
  assert.equal(result?.scouting?.privateReports?.length, 2);
  assert.equal(result?.scouting?.privateReports?.[0]?.requesterUid, undefined,
    'Saved proof rows must redact private raw requester identity.');
  assert.ok(trace.some(item => item.ui === 'reload-and-reselect-wing-commander'),
    'Recovery uses the original role chooser and actor after a normal reload.');
});

test('controlled actor observer stops on lost live berth before a source mutation', async () => {
  const { io, trace, state } = makeConsumer();
  state.actor.activeConsoleRoleId = null;
  await assert.rejects(runP181StarlightMovementScoutUiProof({
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

test('fresh Cycle 0 consumer runs normal setup, assignment, start and briefing clear before movement', async () => {
  const { io, trace, receipt } = makeConsumer();
  const freshInitial = { sessionId: 'normal-session', phase: 'lobby', cycle: 0,
    setupConfirmed: false, playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null };
  io.prepareNormalSession = async ({ initial }) => {
    assert.equal(initial.phase, 'lobby');
    assert.equal(initial.cycle, 0);
    const setupReceipt = await receipt('confirmSetup',
      { sessionId: initial.sessionId, playerCount: 8, chartId: 'A' }, { status: 'committed', setupRevision: 1 });
    const assignmentReceipt = await receipt('assignRole',
      { sessionId: initial.sessionId, roleId: 'wing-commander' }, { status: 'assigned', roleId: 'wing-commander' });
    const startReceipt = await receipt('startGame',
      { sessionId: initial.sessionId, requestId: 'start-original', instanceId: 'gm-original-instance' },
      { status: 'committed', phase: 'active', cycle: 1, instanceId: 'gm-original-instance' });
    const briefingReceipt = await receipt('clearTurnAdvanceInterstitial',
      { sessionId: initial.sessionId, requestId: 'clear-original' }, { status: 'cleared', cycle: 1 });
    return {
      initial: { ...initial, setupConfirmed: true, playerCount: 8, chartId: 'A', activeRoleIds: originalRoleIds },
      started: { sessionId: initial.sessionId, phase: 'active', cycle: 1, uidHash: 'b'.repeat(16),
        instanceId: 'gm-original-instance', fullGameDemo: null },
      roster: [{ roleId: 'wing-commander', uidHash: original.uidHash, sessionId: initial.sessionId }],
      gm: { uidHash: 'b'.repeat(16), sessionId: initial.sessionId, meSessionId: initial.sessionId,
        instanceId: 'gm-original-instance', hasAuth: true, sameActor: true, playerRole: 'gm',
        profileRoleId: null, profileSessionId: null, fullGameDemo: null, connectionGeneration: 2,
        identityHydrationRevision: 3, connection: 'live', freshness: 'server', connected: true,
        kicked: false, recoveryPending: false, invalidFields: [], currentOwnPlayerConfirmed: true,
        sdkHasServerAuthority: true, gmInstanceOwned: true },
      expectedWingCommander: original,
      setupReceipt, assignmentReceipt, startReceipt, briefingReceipt,
    };
  };

  let failure;
  try {
    await runP181StarlightMovementScoutUiProof({ initial: freshInitial, started: undefined, roster: undefined, gm: undefined,
      expectedWingCommander: undefined, io, absoluteDeadlineMs: Date.now() + 15 * 60_000 });
  } catch (error) { failure = error; }
  assert.deepEqual(trace.filter(item => ['confirmSetup', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial']
    .includes(item.endpoint)).map(item => item.endpoint),
  ['confirmSetup', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial'],
  `The executable normal-start transition must run from fresh Cycle 0 before readiness is required; early stop: ${failure?.message ?? 'none'}`);
});

test('first normal-start failure triggers one bounded owned cleanup and remains the surfaced error', async () => {
  const { io } = makeConsumer();
  const firstFailure = new Error('first original Cycle 0 start failure');
  let cleanupCalls = 0, cleanupInput;
  io.prepareNormalSession = async () => { throw firstFailure; };
  io.cleanupOwnedResources = async value => {
    cleanupCalls++;
    cleanupInput = value;
    return { status: 'owned-cleanup-complete' };
  };
  let surfaced;
  try {
    await runP181StarlightMovementScoutUiProof({
      initial: { sessionId: 'normal-session', phase: 'lobby', cycle: 0, setupConfirmed: false,
        playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null },
      started: undefined, roster: undefined, gm: undefined, expectedWingCommander: undefined,
      io, absoluteDeadlineMs: Date.now() + 15 * 60_000,
    });
  } catch (error) { surfaced = error; }
  assert.equal(cleanupCalls, 1, 'Cleanup runs once after an original startup failure.');
  assert.equal(cleanupInput.firstError, firstFailure);
  assert.equal(surfaced, firstFailure, 'Cleanup does not replace the original failure.');
});

test('fresh Cycle 0 native consumer uses the normal browser factory before requiring a live station', async () => {
  const trace = [];
  const freshInitial = { sessionId: 'fresh-normal-session', phase: 'lobby', cycle: 0,
    setupConfirmed: false, playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null };
  const normalStart = {
    async prepare({ initial }) {
      assert.equal(initial.sessionId, freshInitial.sessionId);
      trace.push('gm-create-session');
      trace.push('gm-normal-auth-and-consent');
      trace.push('gm-live-local-authorization-and-claim');
      trace.push('confirmSetup');
      trace.push('wing-commander-normal-join-and-consent');
      trace.push('assignRole');
      trace.push('normal-role-chooser');
      trace.push('startGame');
      trace.push('clearTurnAdvanceInterstitial');
      throw new Error('controlled first mismatch after original normal setup/start receipts');
    },
  };
  const io = createP181StarlightBrowserIo({ gm: { page: {} }, wingCommander: { page: {} },
    gameplay: { async select(roleId) { trace.push(`chooser:${roleId}`); } }, directory: '/tmp/p181-controlled-normal-driver',
    initial: freshInitial, started: undefined, expectedWingCommander: undefined, normalStart });
  io.cleanupOwnedResources = async () => ({ status: 'controlled-owned-cleanup-complete' });

  let firstFailure;
  try {
    await runP181StarlightMovementScoutUiProof({ initial: freshInitial, started: undefined,
      roster: undefined, gm: undefined, expectedWingCommander: undefined, io,
      absoluteDeadlineMs: Date.now() + 15 * 60_000 });
  } catch (error) { firstFailure = error; }

  assert.deepEqual(trace, [
    'gm-create-session', 'gm-normal-auth-and-consent', 'gm-live-local-authorization-and-claim',
    'confirmSetup', 'wing-commander-normal-join-and-consent', 'assignRole', 'normal-role-chooser',
    'startGame', 'clearTurnAdvanceInterstitial',
  ], `The executable consumer must cross ordinary admission and original ownership before movement; stopped at: ${firstFailure?.message ?? 'none'}`);
  assert.match(firstFailure?.message ?? '', /controlled first mismatch/,
    'A failure after the real source startup sequence remains the first error.');
});

test('controlled native factory owns exactly two processes and closes both after first startup error', async () => {
  const browsers = [], surfaces = [], routeHandlers = [];
  const chromium = {
    async launch(options) {
      assert.deepEqual(options, { channel: 'chrome', headless: true });
      const browser = {
        connected: true,
        isConnected() { return this.connected; },
        async close() { this.connected = false; },
        async newContext() {
          return {
            async route(pattern, handler) { routeHandlers.push({ pattern, handler }); },
            async newPage() {
              const page = new EventEmitter();
              page.url = () => 'http://127.0.0.1:5174/';
              page.setDefaultTimeout = () => {};
              page.setDefaultNavigationTimeout = () => {};
              return page;
            },
          };
        },
      };
      return browser;
    },
  };
  const remoteRequests = [], pageErrors = [], calls = [], requests = [];
  const factory = createP181StarlightNativeSurfaceFactory({ chromium, baseUrl: 'http://127.0.0.1:5174',
    ports: { auth: 9109, firestore: 8090, functions: 5011 }, directory: '/tmp/p181-controlled-factory',
    browsers, surfaces, remoteRequests, pageErrors, calls, requests });
  const gm = await factory.launch('normal-gm');
  const wing = await factory.launch('normal-wing-commander');
  assert.equal(gm.browser, browsers[0]);
  assert.equal(wing.browser, browsers[1]);
  assert.equal(surfaces.length, 2);
  assert.equal(routeHandlers.length, 2);
  await assert.rejects(factory.launch('normal-wing-commander'), /exactly one browser process per ordinary Auth actor/);
  let continued = 0, aborted = 0;
  await routeHandlers[0].handler({ request: () => ({ url: () => 'https://remote.example/data' }),
    async continue() { continued++; }, async abort() { aborted++; } });
  await routeHandlers[0].handler({ request: () => ({ url: () => 'http://127.0.0.1:5011/demo-local/us-central1/joinSession' }),
    async continue() { continued++; }, async abort() { aborted++; } });
  assert.deepEqual({ continued, aborted }, { continued: 1, aborted: 1 },
    'The controlled provider keeps the browser local-only and the original SDK port allowlisted.');

  const firstError = new Error('first original controlled setup/authority failure');
  let cleanupCalls = 0;
  const io = createP181StarlightBrowserIo({ gm, wingCommander: wing,
    gameplay: { async select() { throw new Error('No role selection after startup failure.'); } },
    directory: '/tmp/p181-controlled-factory',
    initial: { sessionId: 'fresh-native', phase: 'lobby', cycle: 0, setupConfirmed: false,
      playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null },
    started: undefined, expectedWingCommander: undefined,
    normalStart: { async prepare() { throw firstError; } },
    async cleanupOwnedResources({ firstError: surfaced }) {
      cleanupCalls++;
      assert.equal(surfaced, firstError);
      await Promise.all(browsers.map(browser => browser.close()));
      return { status: 'owned-cleanup-complete' };
    },
  });
  let surfaced;
  try {
    await runP181StarlightMovementScoutUiProof({
      initial: { sessionId: 'fresh-native', phase: 'lobby', cycle: 0, setupConfirmed: false,
        playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null },
      started: undefined, roster: undefined, gm: undefined, expectedWingCommander: undefined,
      io, absoluteDeadlineMs: Date.now() + 15 * 60_000,
    });
  } catch (error) { surfaced = error; }
  assert.equal(surfaced, firstError);
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(browsers.map(browser => browser.isConnected()), [false, false]);
});

test('native source boundary resolves every normal-start, custody, transit and scout implementation file', async () => {
  const { sourceFiles } = await captureP181SourceBindings(process.cwd());
  assert.ok(Object.keys(sourceFiles).length >= 35);
  for (const [path, digest] of Object.entries(sourceFiles)) {
    assert.match(digest, /^[a-f0-9]{64}$/, `The exact ${path} source file is bound before native execution.`);
  }
});

test('original actor consumer accepts reload only after the shared normal-resume receipt accepts its new epoch', async () => {
  const { io, trace, state } = makeConsumer();
  io.reloadAndReselectWingCommander = async () => {
    trace.push({ ui: 'original-normal-resumeSession-response-and-accepted-hydration' });
    state.actor.documentTimeOrigin = 1_000;
    const before = structuredClone(state.actor);
    state.actor = { ...state.actor, connectionGeneration: before.connectionGeneration + 1,
      identityHydrationRevision: before.identityHydrationRevision + 1, documentTimeOrigin: 2_000 };
    const resumeEvidence = { status: 'accepted', source: 'normal-resumeSession',
      uidHash: state.actor.uidHash, sessionId: state.actor.sessionId,
      connectionGeneration: state.actor.connectionGeneration,
      identityHydrationRevision: state.actor.identityHydrationRevision, sdkHasServerAuthority: true };
    assert.equal(pc11SameActorEpoch(before, state.actor, resumeEvidence), true,
      'The shared helper accepts only this same-actor server resume tuple.');
    return { actor: structuredClone(state.actor), flight: structuredClone(state.session), resumeEvidence };
  };

  const result = await runP181StarlightMovementScoutUiProof({
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
    expectedWingCommander: { ...original, documentTimeOrigin: 1_000 }, io,
    absoluteDeadlineMs: Date.now() + 15 * 60_000,
  });

  assert.equal(result.movement.status, 'observed');
  assert.equal(io.expectedWingCommander.connectionGeneration, original.connectionGeneration + 1);
  assert.equal(io.expectedWingCommander.identityHydrationRevision, original.identityHydrationRevision + 1);
  assert.equal(trace.filter(item => item.endpoint === 'beginShuttleTransit').length, 1);
});
