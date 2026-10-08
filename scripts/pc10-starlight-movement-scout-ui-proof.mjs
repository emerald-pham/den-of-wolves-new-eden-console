import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { observeFullGameDemoPresentationMember } from './pc10-full-game-demo-proof-helpers.mjs';
import { pc11GmReadiness, pc11MemberReadiness } from './qualification/pc11-normal-start-adapter.mjs';
import { validateScoutBundle } from './pc10-navigation-scout-proof-contracts.mjs';

/** The printed eight-seat Chart A preset is enough to configure the original
 * Wing Commander berth; the actually admitted cohort remains one GM plus one
 * ordinary Wing Commander Auth identity. */
export const P181_NORMAL_SETUP = Object.freeze({
  playerCount: 8,
  chartId: 'A',
  roleIds: Object.freeze([
    'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
    'quellon-explorer', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ]),
  wingCommanderRoleId: 'wing-commander',
  shuttleId: 'starlight',
  hostShipId: 'aegis',
});

export const P181_SOURCE_BINDING_FILES = Object.freeze([
  'scripts/pc10-starlight-movement-scout-ui-proof.mjs',
  'scripts/pc10-member-gm-lifecycle-ui-proof.mjs',
  'scripts/pc10-two-browser-gameplay.mjs',
  'scripts/pc10-browser-ui-receipt.mjs',
  'scripts/qualification/pc11-normal-start-adapter.mjs',
  'src/components/AegisConsoleWorkspace.tsx',
  'src/routes/ShuttleConsole.tsx',
  'src/components/ShuttleControl.tsx',
  'src/components/ScoutRequestControls.tsx',
  'src/components/ScoutReportController.tsx',
  'src/components/GmScoutRevealController.tsx',
  'src/lib/scoutRequestAuthority.ts',
  'src/lib/shuttleDepartureService.ts',
  'src/lib/scoutRequestService.ts',
  'src/lib/scoutResultService.ts',
  'functions/src/index.ts',
  'functions/src/starlightScout.ts',
  'functions/src/scoutRequestCadence.ts',
]);

export const P181_REQUIRED_LIVE_PREDICATES = Object.freeze([
  'ordinary Auth create/join and consent; no local-only Auth or Admin gameplay write',
  'one live original GM instance and one distinct normally admitted Wing Commander Auth identity',
  'confirmed normal Chart A eight-seat roster and ordinary Cycle 0 to active Cycle 1 start',
  'same Wing Commander session, Auth UID hash, connection generation and hydration revision',
  'live server snapshot, assigned Wing Commander seat/current console and current Starlight holder',
  'active AEGIS/Starlight source, current custody revision, current cycle and lifted airspace',
  'actual offered departure/retarget targets, original UI requests and source receipts',
  'scouting only when the original current phase, entitlement, chart range and cadence allow it',
]);

const MOVEMENT_ENDPOINTS = new Set([
  'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit', 'completeShuttleArrival',
]);
const identifier = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const uidHash = value => createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
const fingerprint = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

function p181ActorReady(current, expected) {
  return Boolean(current && expected && current.hasAuth === true && current.sameActor === true &&
    current.sessionId === expected.sessionId && current.uidHash === expected.uidHash &&
    current.meSessionId === expected.sessionId && current.playerRole === 'player' &&
    current.profileRoleId == null && current.profileSessionId == null &&
    current.assignedRoleId === P181_NORMAL_SETUP.wingCommanderRoleId &&
    current.activeConsoleRoleId === P181_NORMAL_SETUP.wingCommanderRoleId &&
    current.seatId === P181_NORMAL_SETUP.wingCommanderRoleId &&
    current.replacementRoleId == null && current.replacementStatus == null &&
    current.connection === 'live' && current.freshness === 'server' &&
    current.currentOwnPlayerConfirmed === true && current.sdkHasServerAuthority === true &&
    Number.isSafeInteger(current.connectionGeneration) && current.connectionGeneration >= 1 &&
    Number.isSafeInteger(current.identityHydrationRevision) && current.identityHydrationRevision >= 1 &&
    current.connectionGeneration === expected.connectionGeneration &&
    current.identityHydrationRevision === expected.identityHydrationRevision);
}

function requireActor(current, expected, label = 'Current Wing Commander') {
  assert.ok(p181ActorReady(current, expected),
    `${label} must retain the original live Wing Commander Auth, seat, console and server authority.`);
}

function requireStartedContext({ initial, started, roster, gm, expectedWingCommander }) {
  assert.ok(initial && started && Array.isArray(roster), 'Normal setup and original admission receipts are required.');
  assert.equal(initial.sessionId, started.sessionId, 'Use the same original normal session.');
  assert.equal(initial.phase, 'lobby', 'Preserve the confirmed Cycle 0 lobby before ordinary role admission.');
  assert.equal(initial.cycle, 0);
  assert.equal(initial.setupConfirmed, true, 'Use the live confirmed normal setup.');
  assert.equal(initial.playerCount, P181_NORMAL_SETUP.playerCount);
  assert.equal(initial.chartId, P181_NORMAL_SETUP.chartId);
  assert.deepEqual([...initial.activeRoleIds].sort(), [...P181_NORMAL_SETUP.roleIds].sort(),
    'Keep the supported original eight-seat preset.');
  assert.equal(initial.fullGameDemo ?? null, null, 'The source runner accepts ordinary normal-start sessions only.');
  assert.equal(started.phase, 'active');
  assert.ok(Number.isSafeInteger(started.cycle) && started.cycle >= 1, 'A real active cycle is required.');
  assert.equal(started.fullGameDemo ?? null, null, 'Manual source markers do not replace a normal start.');
  assert.equal(started.sessionId, initial.sessionId);
  assert.ok(identifier(expectedWingCommander?.sessionId) && expectedWingCommander.sessionId === initial.sessionId);
  assert.equal(expectedWingCommander.roleId, P181_NORMAL_SETUP.wingCommanderRoleId);
  assert.ok(/^[a-f0-9]{16}$/.test(expectedWingCommander.uidHash ?? ''),
    'Capture the Wing Commander Auth identity during original casting admission.');
  assert.equal(roster.length, 1, 'The scoped roster contains only the actually admitted Wing Commander player.');
  assert.deepEqual(roster.map(row => row.roleId), [P181_NORMAL_SETUP.wingCommanderRoleId]);
  assert.equal(roster[0].uidHash, expectedWingCommander.uidHash);
  assert.equal(roster[0].sessionId, initial.sessionId);
  assert.notEqual(expectedWingCommander.uidHash, started.uidHash, 'GM and player Auth identities must be independent.');
  assert.ok(pc11GmReadiness(gm, {
    uidHash: started.uidHash, sessionId: initial.sessionId, instanceId: started.instanceId,
  }), 'The original authenticated GM must own the live server-authority instance.');
  assert.equal(gm.uidHash, started.uidHash);
  assert.equal(gm.instanceId, started.instanceId);
  assert.equal(gm.sessionId, initial.sessionId);
  const member = {
    ...expectedWingCommander,
    hasAuth: true, sameActor: true, meSessionId: initial.sessionId,
    profileRoleId: null, profileSessionId: null, playerRole: 'player',
    connected: true, currentOwnPlayerConfirmed: true, kicked: false, escapeLocked: false,
    replacementRoleId: null, replacementStatus: null, fullGameDemo: null,
    connectionGeneration: expectedWingCommander.connectionGeneration,
    identityHydrationRevision: expectedWingCommander.identityHydrationRevision,
    connection: 'live', freshness: 'server', sdkHasServerAuthority: true,
    phase: 'active', cycle: started.cycle, assignedRoleId: P181_NORMAL_SETUP.wingCommanderRoleId,
    activeConsoleRoleId: P181_NORMAL_SETUP.wingCommanderRoleId, seatId: P181_NORMAL_SETUP.wingCommanderRoleId,
    currentCanonicalSeatOwned: true, invalidFields: [],
  };
  assert.ok(pc11MemberReadiness(member, {
    sessionId: initial.sessionId, uidHash: expectedWingCommander.uidHash,
    roleId: P181_NORMAL_SETUP.wingCommanderRoleId, stage: 'station',
    connectionGeneration: expectedWingCommander.connectionGeneration,
    identityHydrationRevision: expectedWingCommander.identityHydrationRevision,
  }), 'The original admitted Wing Commander must own the current canonical station seat.');
  return member;
}

function verifySourceReceipt(capture, endpoint, { sessionId, actor, cycle, shuttleId, requiredResult }) {
  assert.equal(capture?.httpStatus, 200, `${endpoint} must retain the original successful UI response.`);
  assert.equal(capture.request?.sessionId, sessionId);
  if (capture.request?.requestId !== undefined) assert.ok(identifier(capture.request.requestId));
  if (capture.request?.shuttleId !== undefined) assert.equal(capture.request.shuttleId, shuttleId);
  assert.ok(!['stale', 'denied', 'rejected'].includes(capture.result?.status),
    `${endpoint} cannot be stale or denied.`);
  if (requiredResult) assert.ok(requiredResult(capture.result), `${endpoint} returned an incomplete source receipt.`);
  if (endpoint === 'requestScout') {
    assert.ok(['requested', 'replayed'].includes(capture.result?.status));
    assert.equal(capture.result.resolution, 'pending');
    assert.equal(capture.request.entitlementId, 'starlight');
    assert.equal(capture.result.requestId, capture.request.requestId);
    assert.equal(capture.result.sessionId, sessionId);
    assert.equal(capture.result.cycle, cycle);
    assert.equal(capture.result.ownerRoleId, P181_NORMAL_SETUP.wingCommanderRoleId);
    assert.equal(capture.result.anchorShipId, P181_NORMAL_SETUP.hostShipId);
    assert.equal(capture.result.targetCoordinate, capture.request.targetCoordinate);
    assert.equal(capture.result.receivingShipId, 'aegis');
  }
}

function safeScoutRow(reply, bundle) {
  return Object.freeze({
    status: 'observed',
    entitlementId: 'starlight',
    cycle: reply.cycle,
    requestFingerprint: fingerprint({ sessionId: reply.sessionId, requestId: reply.requestId,
      coordinate: reply.targetCoordinate, cycle: reply.cycle }),
    reportFingerprint: fingerprint(bundle.report),
    resultFingerprint: fingerprint(bundle.result),
    noteFingerprint: fingerprint(bundle.note),
    requesterUidHash: uidHash(bundle.result.requesterUid),
    privateFactsPersisted: false,
  });
}

function pushReceipt(receipts, endpoint, capture) {
  receipts.push({ ...publicLifecycleReceipt(capture), endpoint });
}

function assertCurrentFlight(actor, flight, expected, { requireAegisDocking = false } = {}) {
  requireActor(actor, expected);
  assert.equal(flight.phase, 'active', 'The original active session must remain live.');
  assert.ok(Number.isSafeInteger(flight.cycle) && flight.cycle >= 1);
  assert.equal(flight.airspace, 'lifted', 'Starlight flight actions require current lifted airspace.');
  assert.ok(flight.activeVesselIds?.includes(P181_NORMAL_SETUP.hostShipId), 'AEGIS must remain active.');
  assert.ok(flight.activeRoleIds?.includes(P181_NORMAL_SETUP.wingCommanderRoleId));
  const control = flight.control;
  assert.equal(control?.shuttleId, P181_NORMAL_SETUP.shuttleId);
  assert.equal(control?.holderUid, actor.uid, 'The original Wing Commander must hold Starlight now.');
  assert.ok(Number.isSafeInteger(control.revision) && control.revision >= 0,
    'Use the currently observed Starlight custody revision.');
  if (requireAegisDocking) {
    assert.equal(flight.docking?.shuttleId, P181_NORMAL_SETUP.shuttleId);
    assert.equal(flight.docking?.shipId, P181_NORMAL_SETUP.hostShipId,
      'Begin the source movement from Starlight’s actual starting AEGIS berth.');
    assert.equal(flight.departure ?? null, null, 'Do not adopt or replace a prior shuttle departure.');
    assert.equal(flight.transit ?? null, null, 'Do not adopt or replace a prior shuttle transit.');
  }
  return control;
}

async function waitForArrivalWindow(io, transit, deadlineAt) {
  if (typeof io.waitForArrivalWindow === 'function') {
    return io.waitForArrivalWindow(transit, Math.min(60_000, deadlineAt - Date.now()));
  }
  assert.ok(Number.isFinite(Date.parse(transit?.arrivesAt)), 'The actual server transit receipt must publish its arrival time.');
  const sourceArrivalAt = Date.parse(transit.arrivesAt);
  const operationEnd = Math.min(deadlineAt, Date.now() + 60_000);
  let flight;
  while (Date.now() < operationEnd) {
    const current = await io.observeFlight();
    const actor = await io.observeMember();
    requireActor(actor, io.expectedWingCommander);
    assert.equal(current.sessionId, io.sessionId);
    assert.equal(current.phase, 'active');
    if (current.transit?.transitRequestId !== transit.transitRequestId) {
      throw new Error('Original Starlight transit authority changed before its source arrival.');
    }
    flight = current;
    if (Date.now() >= sourceArrivalAt) return flight;
    await delay(Math.min(250, operationEnd - Date.now(), sourceArrivalAt - Date.now()));
  }
  throw new Error(`Original 60-second Starlight transit did not reach its actual arrival window: ${JSON.stringify(flight?.transit ?? null)}`);
}

/**
 * Run the bounded P181 movement/scout behavior after a normal two-actor startup.
 * `io` must be backed by the ordinary GM and Wing Commander browser surfaces;
 * it exposes only actual UI controls, App observers and receipt helpers. Tests
 * use controlled surfaces around the same shared receipt observer, never Auth
 * actors or emulator writes.
 */
export async function runP181StarlightMovementScoutUiProof({
  initial, started, roster, gm, expectedWingCommander, io,
  absoluteDeadlineMs, requiredBranches = ['movement', 'first-scout'],
  evidenceDirectory,
}) {
  assert.ok(io && typeof io.observeMember === 'function' && typeof io.observeFlight === 'function',
    'Pass the original mounted UI actor and Starlight source observers.');
  assert.ok(Number.isFinite(absoluteDeadlineMs) && absoluteDeadlineMs > Date.now(),
    'The parent allocation’s absolute deadline is required.');
  assert.ok(requiredBranches.every(branch => ['movement', 'first-scout', 'second-scout'].includes(branch)));
  assert.equal(new Set(requiredBranches).size, requiredBranches.length);
  const admittedMember = requireStartedContext({ initial, started, roster, gm, expectedWingCommander });
  io.sessionId = initial.sessionId;
  io.expectedWingCommander = { ...admittedMember, ...expectedWingCommander };
  const receipts = [], movement = { status: 'pending' }, scouting = { status: 'pending', privateReports: [] };
  const branches = [];
  const remaining = () => {
    const ms = Math.min(60_000, absoluteDeadlineMs - Date.now());
    assert.ok(ms > 0, 'Original P181 operation deadline expired; no extension or mutation retry.');
    return ms;
  };
  const mark = (branch, status, detail = undefined) => branches.push({ branch, status, ...(detail ? { detail } : {}) });
  const currentMember = async () => {
    const actor = await io.observeMember(); requireActor(actor, io.expectedWingCommander); return actor;
  };
  const currentFlight = async options => {
    const actor = await currentMember(), flight = await io.observeFlight();
    assert.equal(flight.sessionId, initial.sessionId);
    assertCurrentFlight(actor, flight, io.expectedWingCommander, options);
    return { actor, flight };
  };
  const operation = async (endpoint, callback, check) => {
    const before = await currentMember();
    const capture = await callback(remaining(), before);
    verifySourceReceipt(capture, endpoint, { sessionId: initial.sessionId, actor: before,
      cycle: (await io.observeFlight()).cycle, shuttleId: P181_NORMAL_SETUP.shuttleId,
      requiredResult: check });
    requireActor(await io.observeMember(), io.expectedWingCommander,
      'Original actor after the actual source response');
    pushReceipt(receipts, endpoint, capture);
    return capture;
  };

  await currentFlight({ requireAegisDocking: true });
  await io.openStarlightFromWingWorkspace(remaining());
  await currentFlight({ requireAegisDocking: true });

  // Capture the actual source offers before selecting either destination.
  const start = (await currentFlight({ requireAegisDocking: true })).flight;
  const destinations = await io.departureOptions(remaining());
  assert.ok(Array.isArray(destinations) && destinations.length > 0,
    'Use an actually offered source destination; never manufacture a destination.');
  const destination = destinations.find(value => value !== start.docking.shipId);
  assert.ok(destination, 'Starlight needs a currently offered destination other than its own berth.');
  const departure = await operation('requestShuttleDeparture',
    (budget, actor) => io.requestDeparture(destination, start, actor, budget),
    result => ['requested', 'committed', 'replayed'].includes(result?.status) &&
      identifier(result?.requestId));
  assert.equal(departure.request.sessionId, initial.sessionId);
  assert.equal(departure.request.shuttleId, P181_NORMAL_SETUP.shuttleId);
  assert.equal(departure.request.destinationShipId, destination);
  assert.equal(departure.request.expectedControlRevision, start.control.revision);
  assert.equal(departure.request.expectedCycle, start.cycle);
  const departureState = await io.waitForDeparture(departure.result, remaining());
  assert.equal(departureState.departure?.requestId, departure.result.requestId,
    'A current source departure projection must match the real UI receipt.');
  assert.equal(departureState.departure?.destinationShipId, destination);
  mark('departure', 'observed');

  const beforeBegin = (await currentFlight()).flight;
  assert.equal(beforeBegin.departure?.requestId, departure.result.requestId);
  const transitCapture = await operation('beginShuttleTransit',
    (budget, actor) => io.beginTransit(beforeBegin.departure, beforeBegin, actor, budget),
    result => result?.status === 'in-transit' && identifier(result?.transitRequestId) &&
      Number.isSafeInteger(result?.revision));
  assert.equal(transitCapture.request.expectedDepartureRequestId, departure.result.requestId);
  assert.equal(transitCapture.request.expectedControlRevision, beforeBegin.control.revision);
  assert.equal(transitCapture.request.expectedCycle, beforeBegin.cycle);
  const transit = await io.waitForTransit(transitCapture.result, remaining());
  assert.equal(transit.transit?.transitRequestId, transitCapture.result.transitRequestId,
    'The current in-transit projection must match the original Begin receipt.');
  assert.equal(transit.transit?.originShipId, start.docking.shipId);
  assert.equal(transit.transit?.destinationShipId, destination);
  assert.equal(transit.transit?.status, 'in-transit');
  mark('begin-transit', 'observed');

  const retargetOptions = await io.retargetOptions(transit.transit, remaining());
  assert.ok(Array.isArray(retargetOptions));
  const retargetDestination = retargetOptions.find(value => value !== transit.transit.originShipId &&
    value !== transit.transit.destinationShipId);
  if (retargetDestination) {
    const beforeRetarget = (await currentFlight()).flight;
    const retargetCapture = await operation('retargetShuttleTransit',
      (budget, actor) => io.retargetTransit(beforeRetarget.transit, retargetDestination, beforeRetarget, actor, budget),
      result => result?.status === 'in-transit' && result?.transitRequestId === transit.transit.transitRequestId &&
        result?.destinationShipId === retargetDestination && Number.isSafeInteger(result?.revision));
    assert.equal(retargetCapture.request.transitRequestId, transit.transit.transitRequestId);
    assert.equal(retargetCapture.request.destinationShipId, retargetDestination);
    assert.equal(retargetCapture.request.expectedControlRevision, beforeRetarget.control.revision);
    assert.equal(retargetCapture.request.expectedCycle, beforeRetarget.cycle);
    const retargeted = await io.waitForTransit(retargetCapture.result, remaining());
    assert.equal(retargeted.transit?.transitRequestId, transit.transit.transitRequestId);
    assert.equal(retargeted.transit?.destinationShipId, retargetDestination);
    assert.equal(retargeted.transit?.retargetRequestId, retargetCapture.request.requestId);
    mark('retarget', 'observed');

    await waitForArrivalWindow(io, retargeted.transit, absoluteDeadlineMs);
    const beforeArrival = (await currentFlight()).flight;
    assert.equal(beforeArrival.transit?.transitRequestId, transit.transit.transitRequestId);
    assert.equal(beforeArrival.transit?.destinationShipId, retargetDestination);
    const arrival = await operation('completeShuttleArrival',
      (budget, actor) => io.completeArrival(beforeArrival.transit, beforeArrival, actor, budget),
      result => result && result.hostShipId === retargetDestination &&
        typeof result.arrivedAt === 'string' && Number.isFinite(Date.parse(result.arrivedAt)));
    assert.equal(arrival.request.transitRequestId, beforeArrival.transit.transitRequestId);
    assert.equal(arrival.request.expectedControlRevision, beforeArrival.control.revision);
    const finalFlight = await io.waitForDocking(arrival.result, remaining());
    assert.deepEqual(finalFlight.docking, { shuttleId: P181_NORMAL_SETUP.shuttleId, shipId: retargetDestination },
      'Committed UI arrival must match the current source docking, with no duplicate arrival action.');
    assert.equal(finalFlight.transit ?? null, null);
    movement.status = 'observed';
    movement.finalDocking = finalFlight.docking;
    movement.transitRequestFingerprint = fingerprint({ sessionId: initial.sessionId,
      transitRequestId: transit.transit.transitRequestId, destinationShipId: retargetDestination });
    mark('arrival', 'observed');
  } else {
    const reason = 'No current normal retarget destination was offered; retain the real in-transit source state.';
    mark('retarget-arrival', 'pending', reason);
    if (requiredBranches.includes('movement')) throw new Error(reason);
  }

  // A normal refresh and role chooser entry are read-only recovery, never a
  // second movement request. The actual member adapter uses the captured UID.
  const recovered = await io.reloadAndReselectWingCommander(remaining());
  requireActor(recovered.actor, io.expectedWingCommander, 'Wing Commander after normal reload/reselection');
  assert.deepEqual(recovered.flight.docking, movement.finalDocking,
    'Current source docking after reload must match the original committed arrival.');
  assert.equal(recovered.flight.transit ?? null, null);
  mark('reload-reselection', 'observed');

  const firstOffer = await io.currentScoutOffer(remaining());
  const firstCanRun = firstOffer?.eligible === true && firstOffer.firstRequestAvailable === true &&
    firstOffer.sessionId === initial.sessionId && firstOffer.cycle === recovered.flight.cycle &&
    firstOffer.airspace === 'lifted' && firstOffer.entitlementId === 'starlight' &&
    firstOffer.ownerRoleId === P181_NORMAL_SETUP.wingCommanderRoleId &&
    firstOffer.anchorShipId === P181_NORMAL_SETUP.hostShipId &&
    Array.isArray(firstOffer.printedCoordinates) && firstOffer.printedCoordinates.includes(firstOffer.coordinate) &&
    Number.isSafeInteger(firstOffer.distance) && firstOffer.distance >= 0 && firstOffer.distance <= 2;
  if (!firstCanRun) {
    const reason = firstOffer?.blocker ?? 'Current original Starlight first-scan source offer is unavailable.';
    mark('first-scout', 'pending', reason);
    if (requiredBranches.includes('first-scout')) throw new Error(`Required first scout is uncredited: ${reason}`);
  } else {
    const originalCycle = firstOffer.cycle;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const offer = attempt === 1 ? firstOffer : await io.currentScoutOffer(remaining());
      const available = attempt === 1 ? offer.firstRequestAvailable === true
        : offer.fuelledSecondRequestAvailable === true && offer.firstRequestAvailable === false;
      if (!available || offer.cycle !== originalCycle || offer.airspace !== 'lifted') {
        const branch = attempt === 1 ? 'first-scout' : 'second-scout';
        const reason = offer?.blocker ?? (attempt === 2
          ? 'No authoritative current-cycle Starlight fuel/cadence offer for a second distinct scan.'
          : 'The original first Starlight scan is no longer offered in this current cycle.');
        mark(branch, 'pending', reason);
        if (attempt === 1 && requiredBranches.includes(branch)) throw new Error(`Required ${branch} is uncredited: ${reason}`);
        break;
      }
      assert.ok(typeof offer.coordinate === 'string' && /^\d{4}$/.test(offer.coordinate));
      assert.ok(offer.printedCoordinates.includes(offer.coordinate));
      let selectedOffer = offer;
      if (attempt === 2 && offer.coordinate === scouting.privateReports[0].targetCoordinate) {
        const alternate = offer.printedCoordinates.find(value => value !== scouting.privateReports[0].targetCoordinate);
        assert.ok(alternate, 'The actual current chart needs another printed coordinate before a second scan.');
        assert.equal(typeof io.selectPrintedScoutCoordinate, 'function',
          'Second scan must use the actual printed-coordinate control, never forge a request coordinate.');
        selectedOffer = await io.selectPrintedScoutCoordinate(alternate, offer, remaining());
        assert.equal(selectedOffer?.coordinate, alternate);
        assert.ok(selectedOffer.printedCoordinates.includes(alternate));
      }
      if (attempt === 2) assert.notEqual(selectedOffer.coordinate, scouting.privateReports[0].targetCoordinate,
        'The fuelled same-cycle scan must select a distinct printed system.');
      const { actor, flight } = await currentFlight();
      assert.equal(flight.cycle, originalCycle);
      const capture = await operation('requestScout',
        (budget, current) => io.requestScout(selectedOffer.coordinate, flight, current, budget),
        result => ['requested', 'replayed'].includes(result?.status) && result?.resolution === 'pending' &&
          result?.cycle === originalCycle);
      const bundle = await io.resolveScoutNormally(capture.result, remaining());
      assert.ok(bundle, 'Wait for the original automatic result or use the visible normal GM recovery control if it remains pending.');
      assert.equal(uidHash(bundle.result.requesterUid), actor.uidHash,
        'The original private requester UID must hash to the current normally admitted Wing Commander.');
      validateScoutBundle(bundle, { actor: { ...actor, uid: bundle.result.requesterUid }, reply: capture.result });
      const row = safeScoutRow(capture.result, bundle);
      scouting.privateReports.push({ ...row, targetCoordinate: capture.result.targetCoordinate });
      mark(attempt === 1 ? 'first-scout' : 'second-scout', 'observed');
    }
    scouting.status = scouting.privateReports.length > 0 ? 'observed' : 'pending';
  }

  const endpoints = receipts.map(receipt => receipt.endpoint);
  for (const endpoint of MOVEMENT_ENDPOINTS) {
    assert.ok(endpoints.filter(value => value === endpoint).length <= 1,
      `${endpoint} must not be repeated with a fresh request identity.`);
  }
  const result = {
    schemaVersion: 1,
    status: 'SOURCE_RUNNER_FLOW_COMPLETE',
    actualAcceptance: false,
    fixedCatalogClosures: 0,
    checkpointOrReleaseCredit: 0,
    initial, started,
    configuredPlayerCount: P181_NORMAL_SETUP.playerCount,
    actuallyAdmittedAuthActors: 2,
    actuallyAdmittedPlayerRoles: [P181_NORMAL_SETUP.wingCommanderRoleId],
    actualBrowserProcessesRequired: 2,
    actualBrowserContextsRequired: 2,
    movement,
    scouting,
    receipts,
    branches,
    limitations: [
      'This source driver and controlled consumer tests grant zero native actors, gameplay acceptance, catalog closure or release credit.',
      'Movement/scout branches are earned only from the original current UI and live source projections.',
      'A second scout remains pending unless the original current-cycle Starlight fuel and cadence are observed.',
      'A missing eligible source destination, lifted-airspace window, current berth or actual private result remains pending or stops the required branch.',
      'No peer audience, capacity, fighter, mission, full-workspace or all-role claim is made by this two-actor slice.',
    ],
  };
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
    await writeFile(resolve(evidenceDirectory, 'p181-starlight-movement-scout.json'),
      `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  }
  return result;
}

/** Read the mounted normal App's original actor and Starlight source projection.
 * The result is held in memory; callers persist only safe fingerprints. */
export async function observeP181StarlightSource(surface) {
  return surface.page.evaluate(async moduleUrl => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(moduleUrl);
    const state = useSessionStore.getState(), user = auth().currentUser, session = state.session;
    if (!user || !session || user.uid !== state.me?.uid || state.me?.sessionId !== session.id ||
        state.connection !== 'live' || state.sessionSnapshotFreshness !== 'server') {
      throw new Error('Original authenticated Wing Commander source projection is not live and server fresh.');
    }
    const digest = async value => value ? Array.from(new Uint8Array(await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const me = state.me;
    const movement = state.shuttleDepartures?.starlight ?? null;
    const dockings = session.shuttleDockings?.filter(item => item.shuttleId === 'starlight') ?? [];
    const control = session.shuttleControl?.starlight ?? null;
    return {
      actor: { uid: user.uid, uidHash: await digest(user.uid), sessionId: me.sessionId,
        meSessionId: me.sessionId, hasAuth: true, sameActor: true, playerRole: me.role,
        profileRoleId: null, profileSessionId: null, assignedRoleId: me.assignedRoleId ?? null,
        activeConsoleRoleId: me.activeConsoleRoleId ?? null, seatId: me.seatId ?? null,
        replacementRoleId: me.replacementRoleId ?? null, replacementStatus: me.replacementStatus ?? null,
        generation: me.connectionGeneration, connectionGeneration: me.connectionGeneration,
        hydrationRevision: state.identityHydrationRevision,
        identityHydrationRevision: state.identityHydrationRevision,
        connection: state.connection, freshness: state.sessionSnapshotFreshness,
        currentOwnPlayerConfirmed: state.currentOwnPlayerConfirmed === true,
        sdkHasServerAuthority: state.sdkHasServerAuthority === true },
      sessionId: session.id, phase: session.phase, cycle: session.currentTurn,
      airspace: session.turnPhase?.airspace?.state ?? null,
      turnStatePhase: state.turnState?.phase ?? null,
      fullGameDemo: session.fullGameDemo ?? null,
      activeRoleIds: [...(session.activeRoleIds ?? [])],
      activeVesselIds: [...(session.activeVesselIds ?? [])],
      control: control ? { shuttleId: control.shuttleId, holderUid: control.holderUid,
        ownerUid: control.ownerUid, revision: control.revision } : null,
      docking: dockings.length === 1 ? { shuttleId: dockings[0].shuttleId, shipId: dockings[0].shipId } : null,
      departure: movement?.status === 'requested' ? movement : null,
      transit: movement?.status === 'in-transit' ? movement : null,
      shipGalacticCoordinates: session.shipGalacticCoordinates ?? {},
      shuttleFuelled: session.shuttleFuelled ?? {},
      maintenanceCycles: session.maintenanceCycles ?? {},
      scoutCadence: session.scoutCadence ?? null,
      currentOwnPlayerConfirmed: state.currentOwnPlayerConfirmed === true,
      sourceFreshness: state.sessionSnapshotFreshness,
    };
  }, surface.storeModuleUrl());
}

/** Bind the bounded Starlight flow to the original mounted Playwright surfaces.
 * All four movement/scout mutations use the shared lifecycle receipt capture. */
export function createP181StarlightBrowserIo({ gm, wingCommander, gameplay, directory, initial, started,
  expectedWingCommander }) {
  assert.ok(gm?.page && wingCommander?.page && gameplay?.select && directory);
  const roleNavigation = gameplay;
  const expected = expectedWingCommander;
  const member = async () => observeFullGameDemoPresentationMember(wingCommander,
    { knownRoleIds: P181_NORMAL_SETUP.roleIds });
  const snapshot = async () => {
    const value = await observeP181StarlightSource(wingCommander);
    return { ...value, actor: value.actor };
  };
  const runAction = async (surface, endpoint, choose, timeout) => {
    const capture = await captureLifecycleUiAction(surface, endpoint, choose, {
      timeout, original: await observeLifecycleActor(surface, initial.sessionId),
    });
    return { ...capture, request: capture.data };
  };
  async function selectWing(deadlineAt) {
    const surface = await roleNavigation.select(P181_NORMAL_SETUP.wingCommanderRoleId,
      { enter: true, deadlineAt });
    assert.equal(surface, wingCommander, 'The original Wing Commander Auth surface must remain the chooser target.');
    return surface;
  }
  async function observeFlight() {
    const value = await snapshot();
    assert.equal(value.actor.uidHash, expected.uidHash);
    return value;
  }
  const io = {
    sessionId: initial.sessionId,
    expectedWingCommander: expected,
    now: () => Date.now(),
    async observeMember() { return member(); },
    async observeFlight() { return observeFlight(); },
    async openStarlightFromWingWorkspace(timeout) {
      await selectWing(Date.now() + timeout);
      const link = wingCommander.page.getByRole('link', { name: 'Open Starlight shuttle console', exact: true });
      await link.waitFor({ state: 'visible', timeout });
      await link.click({ timeout });
      await wingCommander.page.getByRole('region', { name: 'Shuttle control', exact: true })
        .waitFor({ state: 'visible', timeout });
    },
    async departureOptions(timeout) {
      const select = wingCommander.page.getByLabel('Destination ship', { exact: true });
      await select.waitFor({ state: 'visible', timeout });
      return select.locator('option').evaluateAll(options => options.filter(option => !option.disabled && option.value)
        .map(option => option.value));
    },
    async retargetOptions(transit, timeout) {
      const select = wingCommander.page.getByLabel('New destination ship', { exact: true });
      await select.waitFor({ state: 'visible', timeout });
      return select.locator('option').evaluateAll(options => options.filter(option => !option.disabled && option.value)
        .map(option => option.value));
    },
    async requestDeparture(destination, before, actor, timeout) {
      const control = before.control;
      const select = wingCommander.page.getByLabel('Destination ship', { exact: true });
      await select.selectOption(destination, { timeout });
      assert.equal(await select.inputValue(), destination);
      const capture = await runAction(wingCommander, 'requestShuttleDeparture', () =>
        wingCommander.page.getByRole('button', { name: 'Request departure', exact: true }).click({ timeout }), timeout);
      return { httpStatus: capture.httpStatus, request: capture.data, result: capture.result };
    },
    async waitForDeparture(receipt, timeout) {
      const until = Date.now() + timeout; let value;
      while (Date.now() < until) {
        value = await observeFlight();
        if (value.departure?.requestId === receipt.requestId) return value;
        await delay(Math.min(200, until - Date.now()));
      }
      throw new Error(`Original Starlight departure receipt did not appear in the current UI projection: ${JSON.stringify(value?.departure ?? null)}`);
    },
    async beginTransit(departure, before, actor, timeout) {
      const capture = await runAction(wingCommander, 'beginShuttleTransit', () =>
        wingCommander.page.getByRole('button', { name: 'Begin transit', exact: true }).click({ timeout }), timeout);
      return { httpStatus: capture.httpStatus, request: capture.data, result: capture.result };
    },
    async waitForTransit(receipt, timeout) {
      const until = Date.now() + timeout; let value;
      while (Date.now() < until) {
        value = await observeFlight();
        if (value.transit?.transitRequestId === receipt.transitRequestId) return value;
        await delay(Math.min(200, until - Date.now()));
      }
      throw new Error(`Original Starlight transit receipt did not appear in the current UI projection: ${JSON.stringify(value?.transit ?? null)}`);
    },
    async retargetTransit(transit, destination, before, actor, timeout) {
      const select = wingCommander.page.getByLabel('New destination ship', { exact: true });
      await select.selectOption(destination, { timeout });
      assert.equal(await select.inputValue(), destination);
      const capture = await runAction(wingCommander, 'retargetShuttleTransit', () =>
        wingCommander.page.getByRole('button', { name: 'Retarget shuttle', exact: true }).click({ timeout }), timeout);
      return { httpStatus: capture.httpStatus, request: capture.data, result: capture.result };
    },
    async waitForArrivalWindow(transit, timeout) {
      return waitForArrivalWindow(this, transit, Date.now() + timeout);
    },
    async completeArrival(transit, before, actor, timeout) {
      const button = wingCommander.page.getByRole('button', { name: 'Complete arrival', exact: true });
      await button.waitFor({ state: 'visible', timeout });
      assert.equal(await button.isEnabled(), true, 'The original server timer must offer arrival before its UI command.');
      const capture = await runAction(wingCommander, 'completeShuttleArrival', () => button.click({ timeout }), timeout);
      return { httpStatus: capture.httpStatus, request: capture.data, result: capture.result };
    },
    async waitForDocking(receipt, timeout) {
      const until = Date.now() + timeout; let value;
      while (Date.now() < until) {
        value = await observeFlight();
        if (value.docking?.shipId === receipt.hostShipId && !value.transit) return value;
        await delay(Math.min(200, until - Date.now()));
      }
      throw new Error(`Source arrival did not publish its current docking: ${JSON.stringify(value?.docking ?? null)}`);
    },
    async reloadAndReselectWingCommander(timeout) {
      await wingCommander.page.reload({ waitUntil: 'domcontentloaded', timeout });
      await wingCommander.until('Original Wing Commander after normal reload', value =>
        value.sessionId === initial.sessionId && value.uidHash === expected.uidHash &&
        value.connection === 'live' && value.freshness === 'server', timeout);
      await selectWing(Date.now() + timeout);
      const after = await observeFlight();
      await wingCommander.page.getByRole('link', { name: 'Open Starlight shuttle console', exact: true }).click({ timeout });
      await wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true })
        .waitFor({ state: 'visible', timeout });
      return { actor: await member(), flight: await observeFlight() };
    },
    async currentScoutOffer(timeout) {
      const view = await observeFlight();
      const panel = wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true });
      await panel.waitFor({ state: 'visible', timeout });
      const coordinateInput = panel.getByLabel('Printed system coordinate', { exact: true });
      const button = panel.getByRole('button', { name: 'Record request', exact: true });
      const printedCoordinates = await gm.page.evaluate(async () => {
        const region = [...document.querySelectorAll('[aria-label="GM starmap"]')][0];
        return region ? [...region.querySelectorAll('button[data-system-coordinate]')]
          .filter(value => !value.disabled).map(value => value.dataset.systemCoordinate) : [];
      });
      const input = await coordinateInput.inputValue();
      const target = /^\d{4}$/.test(input) ? input : printedCoordinates[0];
      const source = await wingCommander.page.evaluate(async ({ storeUrl, target }) => {
        const { useSessionStore } = await import(storeUrl);
        const session = useSessionStore.getState().session;
        const cycle = session?.currentTurn;
        const fuelled = session?.shuttleFuelled?.starlight === true;
        const maintenance = session?.maintenanceCycles?.aegis;
        const currentFuel = fuelled && maintenance?.turn === cycle && maintenance.refuelled?.includes('starlight') &&
          (maintenance.step === 7 || maintenance.step === 0 && Number.isFinite(Date.parse(maintenance.completedAt)));
        return { sessionId: session?.id, cycle, airspace: session?.turnPhase?.airspace?.state ?? null,
          active: session?.phase === 'active', currentFuel: currentFuel === true,
          currentCoordinates: session?.shipGalacticCoordinates ?? {}, target };
      }, { storeUrl: wingCommander.storeModuleUrl(), target });
      const targetSelected = target === input;
      if (target && printedCoordinates.includes(target) && !targetSelected) await coordinateInput.fill(target, { timeout });
      const active = source.active && source.cycle >= 1 && source.airspace === 'lifted';
      const cadence = await wingCommander.callable('listMyScoutReports', { sessionId: initial.sessionId });
      const currentCycleReports = Array.isArray(cadence) ? cadence.filter(row => row.cycle === source.cycle && row.entitlementId === 'starlight') : [];
      const firstRequestAvailable = active && currentCycleReports.length === 0 && await button.isEnabled();
      const fuelledSecondRequestAvailable = active && currentCycleReports.length === 1 && source.currentFuel && await button.isEnabled();
      let distance = null;
      if (target && printedCoordinates.includes(target)) distance = await wingCommander.page.evaluate(async ({ storeUrl, coordinate }) => {
        const { useSessionStore } = await import(storeUrl);
        const { jumpDistanceBetween } = await import('/functions/src/starChartGraph.ts');
        const origin = useSessionStore.getState().session?.shipGalacticCoordinates?.aegis;
        return jumpDistanceBetween(origin, coordinate);
      }, { storeUrl: wingCommander.storeModuleUrl(), coordinate: target });
      return { eligible: Boolean(active && await button.isEnabled()), firstRequestAvailable,
        fuelledSecondRequestAvailable, sessionId: source.sessionId, cycle: source.cycle,
        airspace: source.airspace, entitlementId: 'starlight', ownerRoleId: P181_NORMAL_SETUP.wingCommanderRoleId,
        anchorShipId: P181_NORMAL_SETUP.hostShipId, coordinate: target, printedCoordinates, distance,
        blocker: !active ? 'source-coordination-not-open' : null };
    },
    async selectPrintedScoutCoordinate(coordinate, offer, timeout) {
      assert.ok(offer.printedCoordinates.includes(coordinate), 'Select only a currently printed source coordinate.');
      const panel = wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true });
      const input = panel.getByLabel('Printed system coordinate', { exact: true });
      await input.fill(coordinate, { timeout });
      assert.equal(await input.inputValue(), coordinate, 'The original UI must retain the selected printed system.');
      const refreshed = await io.currentScoutOffer(timeout);
      assert.equal(refreshed.coordinate, coordinate);
      assert.equal(refreshed.cycle, offer.cycle);
      return refreshed;
    },
    async requestScout(coordinate, before, actor, timeout) {
      const panel = wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true });
      const input = panel.getByLabel('Printed system coordinate', { exact: true });
      await input.fill(coordinate, { timeout });
      const capture = await runAction(wingCommander, 'requestScout', () =>
        panel.getByRole('button', { name: 'Record request', exact: true }).click({ timeout }), timeout);
      return { httpStatus: capture.httpStatus, request: capture.data, result: capture.result };
    },
    async resolveScoutNormally(reply, timeout) {
      // First observe the current private requester report. Only a still-pending
      // request uses the ordinary current GM recovery button.
      const readBundle = async () => {
        const reports = await wingCommander.callable('listMyScoutReports', { sessionId: initial.sessionId });
        const report = reports?.find(value => value.requestId === reply.requestId);
        if (!report || report.status !== 'resolved' || !report.noteId) return null;
        const [result, note] = await Promise.all([
          wingCommander.callable('readPrivateScoutResult', { sessionId: initial.sessionId, requestId: reply.requestId }),
          wingCommander.callable('readMyScoutDiscoveryNote', { sessionId: initial.sessionId, noteId: report.noteId }),
        ]);
        return { report, result, note };
      };
      let bundle = await readBundle();
      if (!bundle) {
        await roleNavigation.select('gm', { enter: true, deadlineAt: Date.now() + timeout });
        const panel = gm.page.getByRole('region', { name: 'GM scout reveals', exact: true });
        await panel.waitFor({ state: 'visible', timeout });
        const reveal = panel.getByRole('button', { name: `Reveal Starlight scout at ${reply.targetCoordinate}`, exact: true });
        if (await reveal.isVisible().catch(() => false)) {
          await runAction(gm, 'resolvePendingScoutRequest', () => reveal.click({ timeout }), timeout);
          await roleNavigation.select(P181_NORMAL_SETUP.wingCommanderRoleId, { enter: true, deadlineAt: Date.now() + timeout });
          const shuttleLink = wingCommander.page.getByRole('link', { name: 'Open Starlight shuttle console', exact: true });
          if (await shuttleLink.isVisible().catch(() => false)) await shuttleLink.click({ timeout });
          await wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true }).waitFor({ state: 'visible', timeout });
          bundle = await readBundle();
        }
      }
      return bundle;
    },
  };
  return io;
}

/** Hash only exact on-disk source bindings; the owner supplies the served and
 * compiled runtime receipt when they run the native scenario. */
export async function captureP181SourceBindings(sourceRoot) {
  const root = resolve(sourceRoot), bindings = {};
  for (const path of P181_SOURCE_BINDING_FILES) {
    bindings[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
  }
  return { sourceRoot: root, sourceFiles: bindings };
}
