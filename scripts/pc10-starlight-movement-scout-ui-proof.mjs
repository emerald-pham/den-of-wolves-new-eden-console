import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt, attachUiReceiptDiagnostics } from './pc10-browser-ui-receipt.mjs';
import { observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt,
  openLifecycleSettings, closeLifecycleSettings } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { observeFullGameDemoPresentationMember, proofRuntimeFromViteSource,
  validateProofRuntime } from './pc10-full-game-demo-proof-helpers.mjs';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { pc11GmReadiness, pc11MemberReadiness, removePc11OwnedRootRecords,
  pc11SameActorEpoch, createPc11OwnedRequestTracker, recoverPc11CreatedSession } from './qualification/pc11-normal-start-adapter.mjs';
import { runPc11ContractPreflight } from './qualification/pc11-contract-preflight.mjs';
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
  'scripts/pc10-full-game-demo-proof-helpers.mjs',
  'scripts/pc10-two-browser-gameplay.mjs',
  'scripts/pc10-browser-ui-receipt.mjs',
  'scripts/pc10-ui-receipt-diagnostics.mjs',
  'scripts/pc10-proof-failure-evidence.mjs',
  'scripts/pc10-member-navigation-resume.mjs',
  'scripts/qualification/pc11-normal-start-adapter.mjs',
  'scripts/qualification/pc11-contract-preflight.mjs',
  'scripts/qualification/pc11-three-actor-trade-philia.mjs',
  'src/routes/Landing.tsx',
  'src/routes/SessionMode.tsx',
  'src/routes/RoleSelect.tsx',
  'src/routes/ShipRoleSelect.tsx',
  'src/routes/ShipConsole.tsx',
  'src/routes/GmConsole.tsx',
  'src/lib/firebase.ts',
  'src/lib/firebaseConfig.ts',
  'src/store/useSessionStore.ts',
  'src/data/rolePresets.ts',
  'src/data/roles.ts',
  'src/data/ships.ts',
  'src/lib/sessionSnapshotAuthority.ts',
  'src/lib/sessionService.ts',
  'src/lib/turnInterstitialService.ts',
  'src/lib/turnPhase.ts',
  'functions/src/turnInterstitial.ts',
  'src/components/GmStarmapModule.tsx',
  'functions/src/starChartGraph.ts',
  'functions/src/shuttleTransit.ts',
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
const safeP181Error = error => ({
  name: ['AssertionError', 'Error', 'TypeError', 'TimeoutError'].includes(error?.name) ? error.name : 'Error',
  message: typeof error?.message === 'string' ? error.message.slice(0, 500) : 'P181 operation failed.',
  ...(typeof error?.code === 'string' && /^[a-z0-9-]{1,64}$/i.test(error.code) ? { code: error.code } : {}),
});

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
async function runP181StarlightMovementScoutCore({
  initial, started, roster, gm, expectedWingCommander, io,
  absoluteDeadlineMs, requiredBranches = ['movement', 'first-scout'],
  evidenceDirectory,
}) {
  assert.ok(io && (typeof io.prepareNormalSession === 'function' ||
    typeof io.observeMember === 'function' && typeof io.observeFlight === 'function'),
  'Pass the original normal setup observer or mounted UI actor and Starlight source observers.');
  assert.ok(Number.isFinite(absoluteDeadlineMs) && absoluteDeadlineMs > Date.now(),
    'The parent allocation’s absolute deadline is required.');
  assert.ok(requiredBranches.every(branch => ['movement', 'first-scout', 'second-scout'].includes(branch)));
  assert.equal(new Set(requiredBranches).size, requiredBranches.length);
  let startupReceipts = [];
  if (!started || !gm || !Array.isArray(roster) || initial?.setupConfirmed !== true ||
      expectedWingCommander?.roleId !== P181_NORMAL_SETUP.wingCommanderRoleId) {
    assert.equal(typeof io.prepareNormalSession, 'function',
      'A fresh Cycle 0 P181 run must prepare its normal UI session before testing readiness or flight actions.');
    const prepared = await io.prepareNormalSession({ initial, deadlineAt: absoluteDeadlineMs,
      requiredBranches: [...requiredBranches], setup: P181_NORMAL_SETUP });
    assert.ok(prepared && Array.isArray(prepared.receipts),
      'The existing normal setup/start consumer must return its original observed UI receipts.');
    ({ initial, started, roster, gm, expectedWingCommander } = prepared);
    startupReceipts = prepared.receipts;
    assert.deepEqual(startupReceipts.map(value => value.endpoint),
      ['confirmSetup', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial'],
      'Use the exact normal setup, role assignment, production start and original Cycle 1 briefing-clear sequence.');
    for (const capture of startupReceipts) {
      assert.equal(capture.httpStatus, 200);
      assert.equal(capture.data?.sessionId, initial.sessionId);
      publicLifecycleReceipt(capture);
    }
  }
  assert.ok(typeof io.observeMember === 'function' && typeof io.observeFlight === 'function',
    'Normal startup must hand back the original mounted UI actor and current Starlight source observers.');
  const admittedMember = requireStartedContext({ initial, started, roster, gm, expectedWingCommander });
  io.sessionId = initial.sessionId;
  io.expectedWingCommander = { ...admittedMember, ...expectedWingCommander };
  if (typeof io.waitForLiftedAirspace === 'function') {
    const flight = await io.waitForLiftedAirspace(absoluteDeadlineMs);
    assert.equal(flight.sessionId, initial.sessionId);
    assert.equal(flight.phase, 'active');
    assert.ok(flight.cycle >= 1);
    assert.equal(flight.airspace, 'lifted', 'Wait for the original source timer; do not advance or alter it.');
  }
  const receipts = startupReceipts.map(capture => ({ ...publicLifecycleReceipt(capture), endpoint: capture.endpoint }));
  const movement = { status: 'pending' }, scouting = { status: 'pending', privateReports: [] };
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
  const expectedBeforeReload = { ...io.expectedWingCommander };
  const recovered = await io.reloadAndReselectWingCommander(remaining());
  assert.equal(pc11SameActorEpoch(expectedBeforeReload, recovered.actor, recovered.resumeEvidence), true,
    'A changed document or lease epoch requires the shared exact normal-resumeSession receipt and accepted SDK fence.');
  if (recovered.resumeEvidence) {
    io.expectedWingCommander = { ...io.expectedWingCommander,
      connectionGeneration: recovered.actor.connectionGeneration,
      identityHydrationRevision: recovered.actor.identityHydrationRevision,
      documentTimeOrigin: recovered.actor.documentTimeOrigin };
  }
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

/** Preserve the first setup/authority/receipt failure while giving the owned
 * browser/Auth/session teardown one finite deadline on both success and error. */
export async function runP181StarlightMovementScoutUiProof(input) {
  let value, firstError, cleanup;
  try {
    value = await runP181StarlightMovementScoutCore(input);
  } catch (error) {
    firstError = error;
  }
  const cleanupOwnedResources = input?.io?.cleanupOwnedResources;
  if (typeof cleanupOwnedResources === 'function') {
    const deadlineAt = input.cleanupDeadlineMs ?? input.absoluteDeadlineMs ?? Date.now();
    try {
      assert.ok(Number.isFinite(deadlineAt) && deadlineAt > Date.now(),
        'Original P181 cleanup deadline expired; do not extend or begin a new cleanup action.');
      cleanup = await cleanupOwnedResources({ firstError, deadlineAt });
      if (cleanup?.status === 'failed') throw new Error('Original P181 owned cleanup did not complete.');
    } catch (error) {
      if (firstError) {
        Object.defineProperty(firstError, 'cleanupError', { value: error, configurable: true });
      } else firstError = error;
    }
  }
  if (firstError) throw firstError;
  return cleanup ? { ...value, cleanup } : value;
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
  expectedWingCommander, normalStart, cleanupOwnedResources }) {
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
  const callable = async (surface, name, data) => {
    const reply = await surface.callable(name, data);
    assert.equal(reply?.status, 'committed', `Original normal SDK callable ${name} must be authorized and current.`);
    return reply.result;
  };
  async function selectWing(deadlineAt) {
    const surface = await roleNavigation.select(P181_NORMAL_SETUP.wingCommanderRoleId,
      { enter: true, deadlineAt });
    assert.equal(surface, wingCommander, 'The original Wing Commander Auth surface must remain the chooser target.');
    return surface;
  }
  async function observeFlight() {
    const value = await snapshot();
    assert.equal(value.actor.uidHash, io.expectedWingCommander.uidHash);
    return value;
  }
  const io = {
    sessionId: initial.sessionId,
    expectedWingCommander: expected,
    now: () => Date.now(),
    ...(typeof normalStart?.prepare === 'function' ? { prepareNormalSession: args => normalStart.prepare(args) } : {}),
    ...(typeof cleanupOwnedResources === 'function' ? { cleanupOwnedResources } : {}),
    async waitForLiftedAirspace(deadlineAt) {
      let flight;
      while (Date.now() < deadlineAt) {
        const actor = await io.observeMember();
        requireActor(actor, io.expectedWingCommander);
        flight = await io.observeFlight();
        assert.equal(flight.sessionId, io.sessionId);
        assert.equal(flight.phase, 'active');
        if (flight.cycle >= 1 && flight.airspace === 'lifted') return flight;
        await delay(Math.min(250, deadlineAt - Date.now()));
      }
      throw new Error(`Original Starlight coordination airspace did not lift before the P181 proof deadline: ${JSON.stringify(flight)}`);
    },
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
      return capture;
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
      return capture;
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
      return capture;
    },
    async waitForArrivalWindow(transit, timeout) {
      return waitForArrivalWindow(this, transit, Date.now() + timeout);
    },
    async completeArrival(transit, before, actor, timeout) {
      const button = wingCommander.page.getByRole('button', { name: 'Complete arrival', exact: true });
      await button.waitFor({ state: 'visible', timeout });
      assert.equal(await button.isEnabled(), true, 'The original server timer must offer arrival before its UI command.');
      const capture = await runAction(wingCommander, 'completeShuttleArrival', () => button.click({ timeout }), timeout);
      return capture;
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
      const deadlineAt = Date.now() + timeout;
      const before = await member();
      const navigation = createMemberNavigationResumeObserver(wingCommander.page, {
        directory, roleId: P181_NORMAL_SETUP.wingCommanderRoleId, deadlineAt, memberContract: 'pc11-live-base',
      });
      let failed, acceptedActor, resumeEvidence, recovered;
      try {
        await navigation.prepare(before);
        await wingCommander.page.reload({ waitUntil: 'domcontentloaded',
          timeout: Math.min(35_000, deadlineAt - Date.now()) });
        while (Date.now() < deadlineAt) {
          const current = await member();
          assert.equal(current.sessionId, initial.sessionId);
          assert.equal(current.uidHash, io.expectedWingCommander.uidHash);
          navigation.sample(current);
          if (current.connection !== 'live' || current.freshness !== 'server') {
            await delay(Math.min(200, deadlineAt - Date.now()));
            continue;
          }
          if (current.connectionGeneration !== before.connectionGeneration ||
              current.identityHydrationRevision !== before.identityHydrationRevision ||
              current.documentTimeOrigin !== before.documentTimeOrigin) {
            const accepted = await navigation.accept(before, current, () => member());
            if (!accepted) { await delay(Math.min(150, deadlineAt - Date.now())); continue; }
            acceptedActor = accepted;
            resumeEvidence = { status: 'accepted', source: 'normal-resumeSession',
              uidHash: accepted.uidHash, sessionId: accepted.sessionId,
              connectionGeneration: accepted.connectionGeneration,
              identityHydrationRevision: accepted.identityHydrationRevision,
              sdkHasServerAuthority: accepted.sdkHasServerAuthority };
          } else acceptedActor = current;
          break;
        }
        assert.ok(acceptedActor, 'Original reload recovery must keep its initial finite deadline.');
        await selectWing(deadlineAt);
        const shuttleLink = wingCommander.page.getByRole('link', { name: 'Open Starlight shuttle console', exact: true });
        if (await shuttleLink.isVisible().catch(() => false)) await shuttleLink.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
        await wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true })
          .waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) });
        const after = await member();
        assert.equal(after.sessionId, initial.sessionId);
        assert.equal(after.uidHash, io.expectedWingCommander.uidHash);
        recovered = { actor: after, flight: await observeFlight(), ...(resumeEvidence ? { resumeEvidence } : {}) };
      } catch (error) { failed = error; }
      finally {
        try { await navigation.finish(failed); }
        catch (error) { if (!failed) failed = error; else Object.defineProperty(failed, 'navigationCleanupError', { value: error }); }
      }
      if (failed) throw failed;
      assert.ok(recovered, 'Original navigation cleanup must finish before the member is returned.');
      return recovered;
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
      const cadence = await callable(wingCommander, 'listMyScoutReports', { sessionId: initial.sessionId });
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
      return capture;
    },
    async resolveScoutNormally(reply, timeout) {
      // Poll only the original Auth actor's private report. A still-pending
      // request may use the exact ordinary GM recovery control once; no
      // request is repeated or synthesized by this wait.
      const readBundle = async () => {
        const reports = await callable(wingCommander, 'listMyScoutReports', { sessionId: initial.sessionId });
        const report = reports?.find(value => value.requestId === reply.requestId);
        if (!report || report.status !== 'resolved' || !report.noteId) return null;
        const [result, note] = await Promise.all([
          callable(wingCommander, 'readPrivateScoutResult', { sessionId: initial.sessionId, requestId: reply.requestId }),
          callable(wingCommander, 'readMyScoutDiscoveryNote', { sessionId: initial.sessionId, noteId: report.noteId }),
        ]);
        return { report, result, note };
      };
      const deadlineAt = Date.now() + timeout;
      let nextGmReadAt = Date.now() + 1_000, recoveryIssued = false, bundle;
      while (Date.now() < deadlineAt) {
        bundle = await readBundle();
        if (bundle) return bundle;
        if (!recoveryIssued && Date.now() >= nextGmReadAt) {
          await roleNavigation.select('gm', { enter: true, deadlineAt });
          const panel = gm.page.getByRole('region', { name: 'GM scout reveals', exact: true });
          if (await panel.isVisible().catch(() => false)) {
            const reveal = panel.getByRole('button', {
              name: `Reveal Starlight scout at ${reply.targetCoordinate}`, exact: true,
            });
            if (await reveal.isVisible().catch(() => false) && await reveal.isEnabled()) {
              await runAction(gm, 'resolvePendingScoutRequest',
                () => reveal.click({ timeout: Math.min(timeout, deadlineAt - Date.now()) }),
                Math.min(timeout, deadlineAt - Date.now()));
              recoveryIssued = true;
            }
          }
          nextGmReadAt = Date.now() + 1_000;
        }
        await delay(Math.min(250, deadlineAt - Date.now()));
      }
      return bundle ?? null;
    },
  };
  return io;
}

export const P181_NATIVE_TIMING = Object.freeze({
  totalAllocationMs: 26 * 60_000,
  executionTargetMs: 21 * 60_000,
  latestBrowserLaunchMs: 2 * 60_000,
  ownedCleanupReserveMs: 2 * 60_000,
  parentIndependentVerificationReserveMs: 2 * 60_000,
  proofStopReserveMs: 4 * 60_000,
  pageTimeoutMs: 35_000,
  operationTimeoutMs: 60_000,
  nativeBrowserProcesses: 2,
  nativeBrowserContexts: 2,
});

/** Create only the two ordinary browser processes/contexts owned by P181.
 * Remote requests are aborted; the caller supplies an already allocated,
 * isolated local emulator/App origin. */
export function createP181StarlightNativeSurfaceFactory({ chromium, baseUrl, ports,
  directory, browsers, surfaces, remoteRequests, pageErrors, calls, requests }) {
  assert.ok(chromium?.launch && typeof baseUrl === 'string' && directory);
  const origin = new URL(baseUrl);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  const allowedPorts = new Set([origin.port, ...Object.values(ports).map(String)]);
  async function launch(label) {
    assert.ok(['normal-gm', 'normal-wing-commander'].includes(label));
    assert.equal(browsers.length < P181_NATIVE_TIMING.nativeBrowserProcesses, true,
      'P181 owns exactly one browser process per ordinary Auth actor.');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
      if (['127.0.0.1', 'localhost'].includes(url.hostname) && allowedPorts.has(url.port)) return route.continue();
      remoteRequests.push(`${url.origin}${url.pathname}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(P181_NATIVE_TIMING.pageTimeoutMs);
    page.setDefaultNavigationTimeout(P181_NATIVE_TIMING.pageTimeoutMs);
    let storeUrl = '/src/store/useSessionStore.ts';
    let sdkUrl = '/node_modules/.vite/deps/firebase_functions.js';
    let authorityUrl = null;
    page.on('pageerror', error => pageErrors.push({ surface: label,
      name: ['Error', 'TypeError', 'AssertionError'].includes(error?.name) ? error.name : 'Error' }));
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) authorityUrl = null;
      if (url.pathname === '/src/lib/sessionSnapshotAuthority.ts' && authorityUrl === null) authorityUrl = url.href;
      if (url.pathname === '/src/store/useSessionStore.ts') storeUrl = url.href;
      if (url.pathname.endsWith('/firebase_functions.js')) sdkUrl = url.href;
      const endpoint = url.pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
      if (endpoint && request.method() === 'POST') requests.push({ surface: label, endpoint,
        transport: 'actual browser Firebase SDK', at: new Date().toISOString() });
    });
    page.on('response', response => {
      const endpoint = new URL(response.url()).pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
      if (endpoint && response.request().method() === 'POST') calls.push({ surface: label, endpoint,
        status: response.status(), at: new Date().toISOString() });
    });
    const surface = {
      label, browser, context, page,
      storeModuleUrl: () => storeUrl,
      sessionAuthorityModuleUrl: () => authorityUrl,
      async until(description, predicate, timeout = 60_000) {
        const end = Date.now() + timeout; let current;
        while (Date.now() < end) {
          current = await observeLifecycleActor(surface);
          if (predicate(current)) return current;
          await delay(Math.min(200, end - Date.now()));
        }
        throw new Error(`${description}: ${JSON.stringify(current)}`);
      },
      async consent() {
        const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
        const admissionEnd = Date.now() + P181_NATIVE_TIMING.pageTimeoutMs;
        while (!(await waiver.isVisible().catch(() => false)) && Date.now() < admissionEnd) await delay(100);
        assert.equal(await waiver.isVisible(), true, 'Ordinary Auth admission must show the original code-of-conduct dialog.');
        const checks = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
        assert.equal(await checks.count(), 3);
        for (const check of await checks.all()) await check.check();
        const acknowledge = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
        const consentEnd = Date.now() + P181_NATIVE_TIMING.pageTimeoutMs;
        while (!(await acknowledge.isEnabled()) && Date.now() < consentEnd) await delay(100);
        assert.equal(await acknowledge.isEnabled(), true, 'Keep the original consent countdown and controls.');
        await acknowledge.click();
        await waiver.waitFor({ state: 'hidden' });
      },
      async reducedMotion() {
        const button = page.getByRole('button', { name: /^REDUCED MOTION/i });
        if (await button.isVisible().catch(() => false)) await button.click();
      },
      async paintTwoFrames() {
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))));
      },
      async callable(name, data) {
        return page.evaluate(async ({ name, data, sdkUrl }) => {
          const { functions } = await import('/src/lib/firebase.ts');
          const { httpsCallable } = await import(sdkUrl);
          try { return { status: 'committed', result: (await httpsCallable(functions(), name)(data)).data }; }
          catch (error) { return { status: 'denied', code: error.code ?? 'other' }; }
        }, { name, data, sdkUrl });
      },
    };
    attachUiReceiptDiagnostics(page, { directory, label, inspectState: () => observeLifecycleActor(surface) });
    surfaces.push(surface);
    return surface;
  }
  return { launch, browsers, surfaces };
}

/**
 * Complete ordinary two-actor browser scenario. The allocation must be issued
 * by the parent before this function is called. Nothing in this module starts
 * an App, emulator, build, CLI probe, or server. `runtime` is the parent's
 * already-launched local-only App/SDK boundary; Chrome, Auth, setup, role
 * selection, start, movement and scouting are driven through the real UI.
 */
export async function runP181StarlightMovementScoutNative(options = {}) {
  const sourceRoot = resolve(options.sourceRoot ?? process.env.P181_SOURCE_ROOT ?? process.cwd());
  const baseUrl = options.baseUrl ?? process.env.P181_UI_URL;
  const projectId = options.projectId ?? process.env.P181_PROJECT;
  const ports = options.ports ?? JSON.parse(process.env.P181_PORTS_JSON ?? 'null');
  const directory = resolve(options.evidenceDirectory ?? process.env.P181_EVIDENCE_DIRECTORY ?? '');
  const allocated = options.runtimeAllocated ?? process.env.P181_RUNTIME_ALLOCATED;
  assert.equal(allocated, 'yes', 'Parent runtime allocation is required before native App/Auth/SDK access.');
  assert.ok(baseUrl?.startsWith('http://127.0.0.1:') && ports &&
    Object.values(ports).every(value => Number.isSafeInteger(value) && value > 0));
  assert.ok(/^demo-[a-z0-9-]{3,64}$/.test(projectId ?? ''), 'Use the allocated local demo project only.');
  assert.ok(directory.startsWith('/tmp/'), 'P181 evidence must remain in the isolated /tmp evidence tree.');

  const startAt = Date.now();
  const totalEnd = options.allocationDeadlineMs ?? Number(process.env.P181_ALLOCATION_DEADLINE_MS);
  assert.ok(Number.isFinite(totalEnd) && totalEnd - startAt >= P181_NATIVE_TIMING.totalAllocationMs,
    'P181 requires its full 26-minute allocation, including native operations, owned cleanup and independent verification.');
  const proofStopAt = totalEnd - P181_NATIVE_TIMING.proofStopReserveMs;
  const cleanupDeadlineAt = totalEnd - P181_NATIVE_TIMING.parentIndependentVerificationReserveMs;
  const browserLaunchDeadlineAt = startAt + P181_NATIVE_TIMING.latestBrowserLaunchMs;
  const sourceEntry = await realpath(new URL('../..', import.meta.url));
  assert.equal(await realpath(sourceRoot), sourceEntry, 'The parent must run the exact isolated source checkout.');
  assert.equal(existsSync(resolve(sourceRoot, 'src/lib/demoActorContext.ts')), true,
    'The ordinary App observer may inspect the null demo profile but must never use a demo actor.');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  assert.equal(sourceCommit, process.env.P181_SOURCE_COMMIT,
    'Runtime launch and checked source must use the parent-provided exact source commit.');
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'],
    { cwd: sourceRoot, encoding: 'utf8' }).trim(), '', 'Native source must be the committed P181 source candidate.');
  const launchRecordPath = process.env.P181_RUNTIME_LAUNCH_RECORD;
  assert.ok(launchRecordPath?.startsWith('/tmp/'), 'Read the exact parent-issued isolated runtime launch record.');
  const launchRecord = JSON.parse(await readFile(launchRecordPath, 'utf8'));
  assert.equal(launchRecord.sourceCommit, sourceCommit);
  assert.equal(await realpath(launchRecord.sourceRoot), sourceEntry);
  assert.equal(launchRecord.projectId, projectId);
  assert.deepEqual(launchRecord.ports, ports);
  assert.equal(launchRecord.baseUrl, baseUrl);
  assert.equal(launchRecord.functionsBuiltBeforeLaunch, true);
  assert.equal(launchRecord.processCwdsVerified, true);

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const sourceContractPreflight = runPc11ContractPreflight(sourceRoot);
  const sourceBindingsBefore = await captureP181SourceBindings(sourceRoot);
  const sourceHash = value => createHash('sha256').update(value).digest('hex');
  const hashShort = value => uidHash(value);
  const remoteRequests = [], pageErrors = [], calls = [], requests = [], browsers = [], surfaces = [];
  const sourceRuntimeText = await (await fetch(`${baseUrl}/src/lib/firebaseConfig.ts`,
    { signal: AbortSignal.timeout(5_000) })).text();
  const runtime = validateProofRuntime(proofRuntimeFromViteSource(sourceRuntimeText), { baseUrl, projectId, ports });
  assert.equal(sourceHash(await readFile(resolve(sourceRoot, 'functions/lib/index.js'))),
    launchRecord.builtFunctionsSha256, 'The loaded emulator bundle must match the exact pre-launch build record.');
  const servedSourceFiles = [
    'src/routes/Landing.tsx', 'src/routes/SessionMode.tsx', 'src/routes/RoleSelect.tsx',
    'src/routes/ShipRoleSelect.tsx', 'src/routes/ShipConsole.tsx', 'src/routes/GmConsole.tsx',
    'src/data/rolePresets.ts', 'src/lib/sessionSnapshotAuthority.ts', 'src/lib/sessionService.ts',
    'src/lib/turnInterstitialService.ts', 'src/lib/turnPhase.ts', 'src/components/GmStarmapModule.tsx',
    'src/components/AegisConsoleWorkspace.tsx', 'src/routes/ShuttleConsole.tsx',
    'src/components/ShuttleControl.tsx', 'src/components/ScoutRequestControls.tsx',
    'src/components/ScoutReportController.tsx', 'src/components/GmScoutRevealController.tsx',
  ];
  for (const path of servedSourceFiles) {
    const response = await fetch(`${baseUrl}/${path}?raw`, { signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 200, `The local App must serve the exact ${path} source.`);
    assert.equal(sourceHash(await response.text()), sourceHash(await readFile(resolve(sourceRoot, path), 'utf8')),
      `The mounted App must match the committed ${path} source.`);
  }
  const adminRequire = createRequire(resolve(sourceRoot, 'functions/package.json'));
  const { initializeApp, getApps } = adminRequire('firebase-admin/app');
  const { getFirestore } = adminRequire('firebase-admin/firestore');
  const { getAuth } = adminRequire('firebase-admin/auth');
  assert.equal(getApps().length, 0, 'The P181 owner creates exactly one local Firebase Admin app.');
  const expectedFirestoreHost = `127.0.0.1:${ports.firestore}`;
  const expectedAuthHost = `127.0.0.1:${ports.auth}`;
  const previousFirestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const previousAuthEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST === expectedFirestoreHost);
  assert.ok(!process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST === expectedAuthHost);
  process.env.FIRESTORE_EMULATOR_HOST = expectedFirestoreHost;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = expectedAuthHost;
  const adminApp = initializeApp({ projectId });
  const db = getFirestore(adminApp), authAdmin = getAuth(adminApp);
  try {
    const scopeBefore = await Promise.all([
      db.collection('sessions').get(),
      db.collectionGroup('players').where('connected', '==', true).get(),
      db.collectionGroup('gmInstances').where('connected', '==', true).get(),
    ]);
    assert.deepEqual(scopeBefore.map(value => value.size), [0, 0, 0],
      'Only the empty isolated emulator scope may be used for this fresh normal session.');
  } catch (error) {
    await db.terminate().catch(() => {});
    await adminApp.delete().catch(() => {});
    if (previousFirestoreEmulatorHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = previousFirestoreEmulatorHost;
    if (previousAuthEmulatorHost === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = previousAuthEmulatorHost;
    throw error;
  }
  const chromium = options.chromium ?? adminRequire('playwright').chromium;
  const factory = createP181StarlightNativeSurfaceFactory({ chromium, baseUrl, ports,
    directory, browsers, surfaces, remoteRequests, pageErrors, calls, requests });
  let gm, wingCommander, sessionId, joinCode, creationRequestId, startRequestId, gmInstanceId;
  let ownedRequestTracker, requestTrackerError;
  const ownedAuthUids = new Map();
  let cleanupPromise, cleanupResult, firstError, proofResult;
  const trace = [];
  const operationDeadline = () => Math.min(proofStopAt, Date.now() + P181_NATIVE_TIMING.operationTimeoutMs);
  const bounded = async (label, operation, deadlineAt = cleanupDeadlineAt) => {
    const budget = deadlineAt - Date.now();
    assert.ok(budget > 0, `${label}: original finite P181 deadline expired.`);
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: original finite P181 deadline expired.`)), budget);
      })]);
    } finally { clearTimeout(timer); }
  };
  const readSourceSession = async surface => surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const session = useSessionStore.getState().session;
    if (!session) throw new Error('Original mounted session projection is absent.');
    return { sessionId: session.id, phase: session.phase, cycle: session.currentTurn,
      setupConfirmed: session.setupConfirmed === true, playerCount: session.playerCount ?? null,
      chartId: session.chartId ?? null, activeRoleIds: [...(session.activeRoleIds ?? [])],
      fullGameDemo: session.fullGameDemo ?? null, airspace: session.turnPhase?.airspace?.state ?? null,
      activeVesselIds: [...(session.activeVesselIds ?? [])], joinCode: session.joinCode ?? null };
  }, surface.storeModuleUrl());
  const readAuthUid = async surface => surface.page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    const uid = auth().currentUser?.uid;
    if (typeof uid !== 'string' || !uid) throw new Error('Original normal Auth actor is absent.');
    return uid;
  });
  const registerAuth = async (surface, label) => {
    const uid = await readAuthUid(surface);
    assert.ok(![...ownedAuthUids].some(([owner, value]) => owner !== label && value === uid),
      'GM and Wing Commander must be distinct ordinary Auth identities.');
    if (ownedAuthUids.has(label)) assert.equal(ownedAuthUids.get(label), uid, 'Retain the same original Auth identity.');
    ownedAuthUids.set(label, uid);
    return { uid, uidHash: hashShort(uid) };
  };
  const readFullActor = async surface => observeFullGameDemoPresentationMember(surface,
    { knownRoleIds: P181_NORMAL_SETUP.roleIds });
  const waitForFullActor = async (surface, description, predicate, deadlineAt) => {
    let current;
    while (Date.now() < deadlineAt) {
      current = await readFullActor(surface);
      if (predicate(current)) return current;
      await delay(Math.min(200, deadlineAt - Date.now()));
    }
    throw new Error(`${description}: ${JSON.stringify(current)}`);
  };
  const waitForGm = async (deadlineAt, { active = false } = {}) => {
    let member, recoveryPending;
    while (Date.now() < deadlineAt) {
      member = await readFullActor(gm);
      recoveryPending = await gm.page.evaluate(async moduleUrl => {
        const { useSessionStore } = await import(moduleUrl);
        return useSessionStore.getState().gmRecoveryPending;
      }, gm.storeModuleUrl());
      const expected = { uidHash: ownedAuthUids.get('gm') && hashShort(ownedAuthUids.get('gm')),
        sessionId, instanceId: gmInstanceId };
      if (pc11GmReadiness({ ...member, recoveryPending }, expected) &&
          (!active || member.phase === 'active' && member.cycle >= 1)) return { ...member, recoveryPending };
      await delay(Math.min(200, deadlineAt - Date.now()));
    }
    throw new Error(`Original live normal GM authority did not become ready: ${JSON.stringify(member)}`);
  };
  async function captureAction(surface, endpoint, choose, deadlineAt) {
    const before = await observeLifecycleActor(surface, sessionId);
    const timeout = Math.min(P181_NATIVE_TIMING.operationTimeoutMs, deadlineAt - Date.now());
    assert.ok(timeout > 0);
    const capture = await captureLifecycleUiAction(surface, endpoint, choose,
      { timeout, deadlineAt, original: before, gm: surface === gm });
    trace.push(publicLifecycleReceipt(capture));
    return capture;
  }
  async function authorizeAndClaimOriginalGm(deadlineAt) {
    const before = await observeLifecycleActor(gm, sessionId);
    const origin = new URL(gm.page.url()).origin;
    const settings = await openLifecycleSettings(gm);
    const authorize = settings.getByRole('button', { name: 'Authorize local emulator GM', exact: true });
    await authorize.waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) });
    const response = await observeUiReceipt({ page: gm.page,
      consumed: { phase: 'P181 normal local GM authorization', credentialPayloadRecorded: false },
      waitForResponse: () => gm.page.waitForResponse(value => new URL(value.url()).origin === origin &&
        new URL(value.url()).pathname === '/__local-gm-access' && value.request().method() === 'POST',
      { timeout: Math.min(60_000, deadlineAt - Date.now()) }),
      choose: () => authorize.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) }) });
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).authenticated, true);
    await settings.getByRole('button', { name: 'Revoke GM access', exact: true }).waitFor({ state: 'visible' });
    const authorized = await observeLifecycleActor(gm, sessionId);
    assert.equal(authorized.uidHash, before.uidHash);
    assert.equal(authorized.sessionId, before.sessionId);
    assert.equal(authorized.gmInstanceOwned, false);
    await closeLifecycleSettings(settings);
    await gm.page.getByRole('link', { name: /GM join$/i }).click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
    await gm.page.getByLabel('Input GM Name', { exact: true }).fill('P181 Starlight GM',
      { timeout: Math.min(35_000, deadlineAt - Date.now()) });
    const claimed = await captureAction(gm, 'claimGmInstance', () =>
      gm.page.getByRole('button', { name: 'Join as GM', exact: true }).click(), deadlineAt);
    assert.ok(claimed.result?.instance);
    assert.equal(claimed.result.instance.id, claimed.data.instanceId);
    assert.equal(claimed.result.instance.uid, ownedAuthUids.get('gm'));
    assert.equal(claimed.result.instance.sessionId, sessionId);
    gmInstanceId = claimed.data.instanceId;
    await waitForGm(deadlineAt);
    return claimed;
  }
  async function selectOriginalRole(roleId, { enter = true, deadlineAt = operationDeadline() } = {}) {
    if (roleId === 'gm') {
      const route = new URL(gm.page.url()).hash;
      if (route.startsWith('#/gm')) return gm;
      const gmLink = gm.page.getByRole('link', { name: 'GM Console', exact: true });
      if (await gmLink.isVisible().catch(() => false)) await gmLink.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
      else {
        const catalog = gm.page.getByRole('button', { name: 'Open station catalog', exact: true });
        if (await catalog.isVisible().catch(() => false)) await catalog.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
        await gm.page.getByRole('link', { name: 'GM Console', exact: true })
          .click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
      }
      await gm.page.getByRole('heading', { name: 'GM Console', exact: true })
        .waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) });
      return gm;
    }
    assert.equal(roleId, P181_NORMAL_SETUP.wingCommanderRoleId);
    const route = new URL(wingCommander.page.url()).hash;
    if (route.startsWith('#/shuttles/')) {
      const back = wingCommander.page.getByRole('link', { name: 'Back to AEGIS Wing Commander console', exact: true });
      await back.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
      await wingCommander.page.getByRole('heading', { name: 'AEGIS', exact: true })
        .waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) });
      return wingCommander;
    }
    if (route.endsWith('/roles/wing-commander')) return wingCommander;
    const changeRole = wingCommander.page.getByRole('link', { name: 'Change role', exact: true });
    if (await changeRole.isVisible().catch(() => false)) {
      await changeRole.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
    }
    if (enter) {
      const option = wingCommander.page.locator('a[href$="/roles/wing-commander"]').first();
      await option.waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) });
      await option.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
      await wingCommander.page.getByRole('heading', { name: 'AEGIS', exact: true })
        .waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) });
    }
    return wingCommander;
  }
  const cleanupOwnedResources = async ({ firstError: _firstError, deadlineAt }) => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      const cleanup = { browsersClosed: 0, sessionAbsent: false, joinCodeAbsent: false,
        ownedMembershipPointersAbsent: false, deletedFreshAuthIdentities: 0, remoteRequests: remoteRequests.length,
        errors: [] };
      const step = async (name, action) => {
        try { return await bounded(`P181 cleanup ${name}`, action, deadlineAt); }
        catch (error) { cleanup.errors.push({ step: name, error: safeP181Error(error) }); return null; }
      };
      await step('finish original create/start request ownership observer', async () => {
        ownedRequestTracker?.finish();
      });
      await step('settle and close the exact owned browser processes', async () => {
        await Promise.all(browsers.map(async browser => {
          if (browser.isConnected()) await browser.close();
          assert.equal(browser.isConnected(), false);
          cleanup.browsersClosed++;
        }));
        assert.equal(cleanup.browsersClosed, browsers.length);
      });
      if (!sessionId && identifier(creationRequestId) && ownedAuthUids.has('gm')) {
        await step('recover only the exact original normal create scope', async () => {
          sessionId = await recoverPc11CreatedSession({ db, uid: ownedAuthUids.get('gm'), requestId: creationRequestId });
          assert.ok(identifier(sessionId), 'The exact original create receipt must resolve to an owned session ID.');
        });
      }
      if (sessionId && ownedAuthUids.has('gm')) {
        if (!identifier(creationRequestId)) {
          cleanup.errors.push({ step: 'verify original create ownership before session cleanup',
            error: { name: 'Error', message: 'Original create request ID is absent; refuse session cleanup.' } });
        } else {
        await step('remove only the original confirmed join-code pointer', async () => {
          if (!joinCode) joinCode = (await db.doc(`sessions/${sessionId}`).get()).get('joinCode');
          assert.match(joinCode ?? '', /^\d{4,8}$/);
          const ref = db.doc(`joinCodes/${joinCode}`);
          await db.runTransaction(async tx => {
            const current = await tx.get(ref);
            if (current.exists) { assert.equal(current.get('sessionId'), sessionId); tx.delete(ref); }
          });
          cleanup.joinCodeAbsent = !(await ref.get()).exists;
          assert.equal(cleanup.joinCodeAbsent, true);
        });
        await step('remove exact original GM lifecycle records', async () => {
          await removePc11OwnedRootRecords({ db, uid: ownedAuthUids.get('gm'), sessionId,
            creationRequestId, startRequestId, instanceId: gmInstanceId });
        });
        await step('delete only the session named by the original normal create receipt', async () => {
          const creation = await db.doc(`sessionCreationRequests/${ownedAuthUids.get('gm')}_${creationRequestId}`).get();
          assert.equal(creation.exists, true, 'Verify original create request ownership before deleting its session.');
          assert.equal(creation.get('requestId'), creationRequestId);
          assert.equal(creation.get('sessionId'), sessionId);
          assert.equal(creation.get('fingerprint')?.actorUid, ownedAuthUids.get('gm'));
          const ref = db.doc(`sessions/${sessionId}`), current = await ref.get();
          if (current.exists) await db.recursiveDelete(ref);
          cleanup.sessionAbsent = !(await ref.get()).exists;
          assert.equal(cleanup.sessionAbsent, true);
        });
        await step('remove only the two captured original actor memberships', async () => {
          const memberships = await db.collection('activeMemberships').where('sessionId', '==', sessionId).get();
          const owned = new Set(ownedAuthUids.values());
          assert.ok(memberships.docs.length <= 2 && memberships.docs.every(doc => owned.has(doc.id)),
            'Refuse membership cleanup for any actor not captured at ordinary Auth admission.');
          await db.runTransaction(async tx => {
            const current = await Promise.all(memberships.docs.map(doc => tx.get(doc.ref)));
            assert.ok(current.every(doc => doc.exists && doc.get('sessionId') === sessionId));
            current.forEach(doc => tx.delete(doc.ref));
          });
          cleanup.ownedMembershipPointersAbsent =
            (await db.collection('activeMemberships').where('sessionId', '==', sessionId).get()).size === 0;
          assert.equal(cleanup.ownedMembershipPointersAbsent, true);
        });
        }
      }
      for (const [label, uid] of ownedAuthUids) await step(`delete captured fresh Auth actor ${label}`, async () => {
        const user = await authAdmin.getUser(uid);
        const createdAt = Date.parse(user.metadata.creationTime);
        assert.ok(createdAt >= startAt && createdAt <= Date.now(),
          'Refuse Auth deletion unless the original Auth identity was created during this exact run.');
        await authAdmin.deleteUser(uid);
        cleanup.deletedFreshAuthIdentities++;
      });
      await step('verify empty local gameplay scope', async () => {
        const scope = await Promise.all([
          db.collection('sessions').get(),
          db.collectionGroup('players').where('connected', '==', true).get(),
          db.collectionGroup('gmInstances').where('connected', '==', true).get(),
        ]);
        cleanup.finalScope = { sessions: scope[0].size, connectedPlayers: scope[1].size,
          connectedGmInstances: scope[2].size };
        assert.deepEqual(cleanup.finalScope, { sessions: 0, connectedPlayers: 0, connectedGmInstances: 0 });
      });
      await step('terminate owner Firestore client', () => db.terminate());
      await step('delete owner Admin app', () => adminApp.delete());
      await step('restore parent process emulator environment', async () => {
        if (previousFirestoreEmulatorHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
        else process.env.FIRESTORE_EMULATOR_HOST = previousFirestoreEmulatorHost;
        if (previousAuthEmulatorHost === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
        else process.env.FIREBASE_AUTH_EMULATOR_HOST = previousAuthEmulatorHost;
      });
      cleanup.status = cleanup.errors.length === 0 ? 'owned-cleanup-complete' : 'failed';
      cleanupResult = cleanup;
      return cleanup;
    })();
    return cleanupPromise;
  };

  try {
    const chromium = options.chromium ?? adminRequire('playwright').chromium;
    assert.ok(Date.now() <= browserLaunchDeadlineAt, 'Launch both original browser processes inside the first two minutes.');
    gm = await factory.launch('normal-gm');
    wingCommander = await factory.launch('normal-wing-commander');
    assert.equal(browsers.length, 2);
    assert.equal(surfaces.length, 2);
    ownedRequestTracker = createPc11OwnedRequestTracker(gm.page, receipt => {
      if (receipt.endpoint === 'createSession') creationRequestId = receipt.requestId;
      if (receipt.endpoint === 'startGame') {
        if (receipt.sessionId !== sessionId || receipt.instanceId !== gmInstanceId) {
          requestTrackerError = new Error('Original start request changed normal session or GM instance authority.');
          return;
        }
        startRequestId = receipt.requestId;
      }
    });
    creationRequestId = null;
    await gm.page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: P181_NATIVE_TIMING.pageTimeoutMs });
    await gm.reducedMotion();
    const created = await observeUiReceipt({ page: gm.page,
      consumed: { phase: 'original normal session create', noCredentialsRetained: true },
      waitForResponse: () => gm.page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith('/us-central1/createSession') && response.request().method() === 'POST',
      { timeout: P181_NATIVE_TIMING.pageTimeoutMs }),
      choose: () => gm.page.getByRole('button', { name: 'Create a session', exact: true })
        .click({ timeout: P181_NATIVE_TIMING.pageTimeoutMs }) });
    assert.equal(created.status(), 200);
    const createdBody = await created.json();
    assert.equal(createdBody.error, undefined);
    sessionId = createdBody.result?.session?.id;
    joinCode = createdBody.result?.session?.joinCode;
    const createRequest = created.request().postDataJSON()?.data;
    creationRequestId ??= createRequest?.requestId;
    assert.ok(identifier(sessionId));
    assert.ok(identifier(creationRequestId));
    assert.match(joinCode ?? '', /^\d{4,8}$/);
    await registerAuth(gm, 'gm');
    await gm.consent();
    const createdActor = await waitForFullActor(gm, 'Original normal GM create and Auth session', value =>
      value.hasAuth && value.sameActor && value.sessionId === sessionId && value.cycle === 0 &&
      value.profileRoleId == null && value.profileSessionId == null && value.connection === 'live' &&
      value.freshness === 'server' && value.fullGameDemo == null,
    operationDeadline());
    const initial = { sessionId, phase: createdActor.phase, cycle: createdActor.cycle,
      setupConfirmed: false, playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null };
    assert.equal(initial.phase, 'lobby');
    assert.equal(initial.cycle, 0);
    trace.push('gm-create-session', 'gm-normal-auth-and-consent');

    const gameplay = { select: selectOriginalRole };
    const normalStart = {
      async prepare({ initial: fresh, deadlineAt, setup }) {
        assert.ok(Date.now() < deadlineAt && deadlineAt <= proofStopAt);
        assert.equal(fresh.sessionId, sessionId);
        assert.equal(fresh.phase, 'lobby');
        assert.equal(fresh.cycle, 0);
        assert.equal(fresh.setupConfirmed, false);
        assert.deepEqual(setup, P181_NORMAL_SETUP);
        await authorizeAndClaimOriginalGm(deadlineAt);
        trace.push('gm-live-local-authorization-and-claim');

        const gmConsole = new URL(gm.page.url()).hash;
        if (!gmConsole.startsWith('#/gm')) await selectOriginalRole('gm', { enter: true, deadlineAt });
        const setupRegion = gm.page.getByRole('region', { name: 'Setup', exact: true });
        if (!await setupRegion.isVisible().catch(() => false)) {
          const openCatalog = gm.page.getByRole('button', { name: 'Open station catalog', exact: true });
          if (await openCatalog.isVisible().catch(() => false)) await openCatalog.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
          await gm.page.getByRole('link', { name: 'GM Console', exact: true }).click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
        }
        const setupPane = gm.page.getByRole('region', { name: 'Setup', exact: true });
        await setupPane.getByRole('button', { name: 'Setup', exact: true }).click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
        await setupPane.getByLabel('Recommended player count', { exact: true })
          .selectOption(String(P181_NORMAL_SETUP.playerCount), { timeout: Math.min(35_000, deadlineAt - Date.now()) });
        await setupPane.getByLabel('Star chart', { exact: true }).selectOption(P181_NORMAL_SETUP.chartId,
          { timeout: Math.min(35_000, deadlineAt - Date.now()) });
        const confirmSetup = await captureAction(gm, 'confirmSetup', () =>
          setupPane.getByRole('button', { name: 'Confirm setup // Confirm roster', exact: true })
            .click({ timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt);
        assert.equal(confirmSetup.httpStatus, 200);
        const confirmed = await waitForFullActor(gm, 'Original confirmed normal Cycle 0 lobby', value =>
          value.sessionId === sessionId && value.phase === 'lobby' && value.cycle === 0 &&
          value.setupConfirmed && value.connection === 'live' && value.freshness === 'server', deadlineAt);
        const configured = await readSourceSession(gm);
        assert.deepEqual([...configured.activeRoleIds].sort(), [...P181_NORMAL_SETUP.roleIds].sort(),
          'Use the supported source preset’s exact eight-seat Chart A roles.');
        const confirmedInitial = { sessionId, phase: confirmed.phase, cycle: confirmed.cycle,
          setupConfirmed: true, playerCount: configured.playerCount, chartId: configured.chartId,
          activeRoleIds: configured.activeRoleIds, fullGameDemo: configured.fullGameDemo };
        assert.equal(confirmedInitial.playerCount, P181_NORMAL_SETUP.playerCount);
        assert.equal(confirmedInitial.chartId, P181_NORMAL_SETUP.chartId);
        assert.equal(confirmedInitial.fullGameDemo, null);
        trace.push('confirmSetup');

        await wingCommander.page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: P181_NATIVE_TIMING.pageTimeoutMs });
        await wingCommander.reducedMotion();
        await wingCommander.page.getByRole('textbox', { name: 'Session code', exact: true })
          .fill(joinCode, { timeout: P181_NATIVE_TIMING.pageTimeoutMs });
        const joined = await observeUiReceipt({ page: wingCommander.page,
          consumed: { phase: 'original ordinary Wing Commander session-code join', credentialsRetained: false },
          waitForResponse: () => wingCommander.page.waitForResponse(response =>
            new URL(response.url()).pathname.endsWith('/us-central1/joinSession') && response.request().method() === 'POST',
          { timeout: P181_NATIVE_TIMING.pageTimeoutMs }),
          choose: () => wingCommander.page.getByRole('button', { name: 'Join a session', exact: true })
            .click({ timeout: P181_NATIVE_TIMING.pageTimeoutMs }) });
        assert.equal(joined.status(), 200);
        assert.equal((await joined.json()).error, undefined);
        const admittedAuth = await registerAuth(wingCommander, 'wing-commander');
        await wingCommander.consent();
        const admitted = await waitForFullActor(wingCommander, 'Normal Wing Commander admission before assignment', value =>
          value.hasAuth && value.sameActor && value.sessionId === sessionId && value.cycle === 0 &&
          (value.phase === 'lobby' || value.phase === 'casting') && value.setupConfirmed &&
          value.assignedRoleId == null && value.activeConsoleRoleId == null && value.seatId == null &&
          value.connection === 'live' && value.freshness === 'server' && value.sdkHasServerAuthority === true,
        deadlineAt);
        assert.equal(admitted.uidHash, admittedAuth.uidHash);
        assert.equal(pc11MemberReadiness(admitted, { sessionId, uidHash: admittedAuth.uidHash,
          roleId: null, stage: 'casting' }), true,
        'Capture original Auth identity during normal admission, before role assignment or berth claim.');
        const displayName = (await observeLifecycleActor(wingCommander, sessionId)).displayName;
        assert.ok(typeof displayName === 'string' && displayName.length > 0);
        const casting = gm.page.getByRole('region', { name: 'Facilitator casting', exact: true });
        await casting.getByLabel(`Role for ${displayName}`, { exact: true })
          .selectOption(P181_NORMAL_SETUP.wingCommanderRoleId, { timeout: Math.min(35_000, deadlineAt - Date.now()) });
        const assignment = await captureAction(gm, 'assignRole', () =>
          casting.getByRole('button', { name: `Assign role to ${displayName}`, exact: true })
            .click({ timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt);
        await waitForFullActor(wingCommander, 'Original normal Wing Commander role assignment', value =>
          value.assignedRoleId === P181_NORMAL_SETUP.wingCommanderRoleId && value.activeConsoleRoleId == null &&
          value.phase === 'casting' && value.cycle === 0,
        deadlineAt);
        trace.push('wing-commander-normal-join-and-consent', 'assignRole');

        const navigationStart = await readFullActor(wingCommander);
        const navigation = createMemberNavigationResumeObserver(wingCommander.page, { directory,
          roleId: P181_NORMAL_SETUP.wingCommanderRoleId, deadlineAt, memberContract: 'pc11-live-base' });
        let station, navigationError;
        try {
          await navigation.prepare(navigationStart);
          const roleLink = wingCommander.page.locator('a[href$="/roles/wing-commander"]').first();
          await roleLink.waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) });
          await roleLink.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
          station = await waitForFullActor(wingCommander, 'Original Wing Commander normal role chooser/seat claim', value =>
            pc11MemberReadiness(value, { sessionId, uidHash: admittedAuth.uidHash,
              roleId: P181_NORMAL_SETUP.wingCommanderRoleId, stage: 'station' }) && value.memberScopeMatches === true,
          deadlineAt);
          if (station.connectionGeneration !== navigationStart.connectionGeneration ||
              station.identityHydrationRevision !== navigationStart.identityHydrationRevision) {
            const accepted = await navigation.accept(navigationStart, station, () => readFullActor(wingCommander));
            assert.ok(accepted, 'Original role chooser must retain its actor-bound normal resume receipt.');
            station = { ...station, ...accepted };
          }
        } catch (error) { navigationError = error; }
        finally {
          try { await bounded('P181 role chooser navigation observer teardown', () => navigation.finish(navigationError),
            Math.min(cleanupDeadlineAt, deadlineAt + 5_000)); }
          catch (error) { if (!navigationError) navigationError = error; }
        }
        if (navigationError) throw navigationError;
        trace.push('normal-role-chooser');

        const production = gm.page.locator('fieldset[aria-label="Ordinary production start"]');
        const start = await captureAction(gm, 'startGame', async () => {
          await production.getByRole('button', { name: 'Start production // Advance to Cycle 1', exact: true })
            .click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
          await production.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1', exact: true })
            .click({ timeout: Math.min(35_000, deadlineAt - Date.now()) });
        }, deadlineAt);
        assert.ok(['committed', 'replayed'].includes(start.result?.status));
        assert.equal(requestTrackerError, undefined,
          'Stop on the first original start request/session/instance mismatch.');
        startRequestId = start.data.requestId;
        gmInstanceId = start.data.instanceId;
        assert.ok(identifier(startRequestId) && identifier(gmInstanceId));
        const startedGm = await waitForGm(deadlineAt, { active: true });
        const started = { sessionId, phase: startedGm.phase, cycle: startedGm.cycle,
          uidHash: startedGm.uidHash, instanceId: startedGm.instanceId, fullGameDemo: startedGm.fullGameDemo };
        assert.equal(started.phase, 'active');
        assert.ok(started.cycle >= 1);
        assert.equal(started.fullGameDemo, null);

        const briefing = gm.page.getByRole('region', { name: 'Cycle briefing clearance', exact: true });
        const clear = await captureAction(gm, 'clearTurnAdvanceInterstitial', () =>
          briefing.getByRole('button', { name: 'Clear cycle briefing // resume clock', exact: true })
            .click({ timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt);
        assert.ok(['cleared', 'replayed'].includes(clear.result?.status));
        await waitForFullActor(gm, 'Normal Cycle 1 briefing cleared and original clock resumed', value =>
          value.sessionId === sessionId && value.phase === 'active' && value.cycle === 1 &&
          !value.briefingPresent && value.sdkHasServerAuthority,
        deadlineAt);
        station = await waitForFullActor(wingCommander, 'Original Wing Commander Cycle 1 station authority', value =>
          pc11MemberReadiness(value, { sessionId, uidHash: admittedAuth.uidHash,
            roleId: P181_NORMAL_SETUP.wingCommanderRoleId, stage: 'station' }) && value.memberScopeMatches === true,
        deadlineAt);
        const gmReady = await waitForGm(deadlineAt, { active: true });
        const roster = [{ roleId: P181_NORMAL_SETUP.wingCommanderRoleId,
          uidHash: admittedAuth.uidHash, sessionId }];
        trace.push('startGame', 'clearTurnAdvanceInterstitial');
        return { initial: confirmedInitial, started, roster, gm: gmReady,
          expectedWingCommander: { ...station, sessionId, uidHash: admittedAuth.uidHash,
            roleId: P181_NORMAL_SETUP.wingCommanderRoleId },
          receipts: [confirmSetup, assignment, start, clear] };
      },
    };

    const cleanupIo = { cleanupOwnedResources };
    const freshIo = createP181StarlightBrowserIo({ gm, wingCommander, gameplay, directory,
      initial, started: undefined, expectedWingCommander: undefined, normalStart,
      cleanupOwnedResources: cleanupIo.cleanupOwnedResources });
    freshIo.cleanupOwnedResources = cleanupOwnedResources;
    freshIo.openedAt = new Date(startAt).toISOString();
    freshIo.sourceRoot = sourceRoot;
    freshIo.sourceCommit = sourceCommit;

    proofResult = await runP181StarlightMovementScoutUiProof({ initial, started: undefined,
      roster: undefined, gm: undefined, expectedWingCommander: undefined,
      io: freshIo, absoluteDeadlineMs: proofStopAt, cleanupDeadlineMs: cleanupDeadlineAt,
      requiredBranches: ['movement', 'first-scout'] });
    assert.equal(remoteRequests.length, 0, 'The normal native browser flow must remain local-only.');
    assert.equal(pageErrors.length, 0, 'Do not accept a native scenario with mounted App errors.');
    assert.equal(surfaces.length, P181_NATIVE_TIMING.nativeBrowserContexts);
    assert.equal(browsers.length, P181_NATIVE_TIMING.nativeBrowserProcesses);
    const sourceBindingsAfter = await captureP181SourceBindings(sourceRoot);
    assert.deepEqual(sourceBindingsAfter.sourceFiles, sourceBindingsBefore.sourceFiles,
      'Preserve the exact committed source candidate throughout the normal UI run.');
  } catch (error) {
    firstError = error;
  } finally {
    if (!cleanupPromise) {
      try { cleanupResult = await cleanupOwnedResources({ firstError,
        deadlineAt: Math.max(Date.now() + 1, cleanupDeadlineAt) }); }
      catch (error) { cleanupResult = { status: 'failed', errors: [{ step: 'owned cleanup', error: safeP181Error(error) }] }; }
    }
    const outcome = {
      schemaVersion: 1,
      status: firstError ? 'P181_STOPPED_FIRST_FAILURE' : 'P181_NATIVE_FLOW_COMPLETE_ZERO_ACCEPTANCE',
      actualAcceptance: false,
      fixedCatalogClosures: 0,
      checkpointOrReleaseCredit: 0,
      sourceCommit,
      sourceContractPreflight,
      sourceBindingsBefore: sourceBindingsBefore?.sourceFiles ?? null,
      runtime,
      servedSourceFiles,
      normalStartupReceiptOrder: trace,
      sourceUiReceipts: trace.length ? trace : [],
      actualBrowserProcesses: browsers.length,
      actualBrowserContexts: surfaces.length,
      actualAuthActors: ownedAuthUids.size,
      actorUidHashes: Object.fromEntries([...ownedAuthUids].map(([label, uid]) => [label, hashShort(uid)])),
      remoteRequests,
      pageErrors,
      elapsedMs: Date.now() - startAt,
      proofStopAt: new Date(proofStopAt).toISOString(),
      cleanupDeadlineAt: new Date(cleanupDeadlineAt).toISOString(),
      ownedCleanupReserveMs: P181_NATIVE_TIMING.ownedCleanupReserveMs,
      independentVerificationReserveMs: P181_NATIVE_TIMING.parentIndependentVerificationReserveMs,
      cleanup: cleanupResult,
      firstError: firstError ? safeP181Error(firstError) : null,
      zeroNativeCreditBeforeRun: true,
      limitations: [
        'Controlled IO tests and source preparation are not mounted App/backend/native gameplay acceptance.',
        'The normal two-actor run earns only its observed Starlight movement and first private scan; no peer audience, capacity, fighter, mission, full-workspace or all-role claim is made.',
        'Second scan remains unearned unless live original-cycle fuel, maintenance, cadence and another printed coordinate are actually offered.',
        'Independent port/process/emulator reservation verification remains the parent owner’s final two-minute handoff responsibility.',
      ],
    };
    try {
      await writeFile(resolve(directory, 'p181-starlight-movement-scout.json'),
        `${JSON.stringify({ ...outcome, ...(proofResult ?? {}) }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    } catch (error) {
      if (!firstError) firstError = error;
      else Object.defineProperty(firstError, 'evidenceWriteError', { value: error });
    }
  }
  if (firstError) throw firstError;
  assert.equal(cleanupResult?.status, 'owned-cleanup-complete', 'Native proof only ends after exact owned cleanup.');
  return proofResult;
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runP181StarlightMovementScoutNative().catch(error => {
    process.stderr.write(`${JSON.stringify({ status: 'P181_STOPPED_FIRST_FAILURE', error: safeP181Error(error) })}\n`);
    process.exitCode = 1;
  });
}
