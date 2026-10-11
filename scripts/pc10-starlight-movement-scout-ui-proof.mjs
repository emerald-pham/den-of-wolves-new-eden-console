import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
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
import { checkServedEnvironment } from './qualification/pc11-launch.mjs';
import { localGmAccessConfiguration } from './local-gm-access.mjs';
import { emulatorEnvironmentForSlot, emulatorPortsForSlot, vitePortForSlot } from './emulator-slots.js';
import { resolveFirebaseToolsInvocation } from './run-emulator-command.mjs';
import { coordinationFilePath } from './emulator-resource-registry.mjs';
import { validateScoutBundle } from './pc10-navigation-scout-proof-contracts.mjs';
import { rememberProofFailure, retainProofFailure } from './pc10-proof-failure-evidence.mjs';

/** The authorized AMB-13 preset decision (audit D003, owner 2026-09-08) retains
 * Wing Commander in the supported eight-seat Chart A preset. The admitted
 * cohort remains one GM plus one ordinary Wing Commander Auth identity. */
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
  'scripts/pc10-starlight-movement-scout-ui-proof-runner.test.mjs',
  'scripts/pc10-member-gm-lifecycle-ui-proof.mjs',
  'scripts/pc10-full-game-demo-proof-helpers.mjs',
  'scripts/pc10-two-browser-gameplay.mjs',
  'scripts/pc10-browser-ui-receipt.mjs',
  'scripts/pc10-ui-receipt-diagnostics.mjs',
  'scripts/pc10-proof-failure-evidence.mjs',
  'scripts/pc10-member-navigation-resume.mjs',
  'scripts/qualification/pc11-normal-start-adapter.mjs',
  'scripts/qualification/pc11-contract-preflight.mjs',
  'scripts/qualification/pc11-launch.mjs',
  'scripts/run-emulator-command.mjs',
  'scripts/configure-emulator-slot.mjs',
  'scripts/emulator-resource-registry.mjs',
  'scripts/emulator-slots.js',
  'scripts/local-gm-access.mjs',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'scripts/qualification/pc11-normal-start-adapter.test.mjs',
  'scripts/qualification/pc11-three-actor-trade-philia.test.mjs',
  'scripts/qualification/pc11-live-base-contract.test.mjs',
  'scripts/qualification/pc11-three-actor-trade-philia.mjs',
  'src/routes/Landing.tsx',
  'src/routes/SessionMode.tsx',
  'src/routes/RoleSelect.tsx',
  'src/routes/ShipRoleSelect.tsx',
  'src/routes/ShipConsole.tsx',
  'src/routes/GmConsole.tsx',
  'src/lib/firebase.ts',
  'src/lib/firebaseConfig.ts',
  'src/lib/emulatorPorts.ts',
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
const p181NativePassedPreflight = new WeakSet();
const uidHash = value => createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
const fingerprint = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const safeP181Error = error => {
  const name = ['AssertionError', 'Error', 'TypeError', 'TimeoutError'].includes(error?.name)
    ? error.name : 'Error';
  const code = ['permission-denied', 'unauthenticated', 'unavailable', 'failed-precondition',
    'not-found', 'resource-exhausted', 'deadline-exceeded'].includes(error?.code) ? error.code : undefined;
  const classification = code ?? (name === 'AssertionError' ? 'assertion-failure'
    : name === 'TimeoutError' ? 'deadline-exceeded' : 'operation-failed');
  return { name, classification,
    fingerprint: fingerprint({ name, code: code ?? null,
      message: typeof error?.message === 'string' ? error.message : '' }),
    ...(code ? { code } : {}) };
};

function p181Remaining(deadlineAt, maximum = 60_000) {
  const budget = Math.min(maximum, deadlineAt - Date.now());
  assert.ok(Number.isFinite(budget) && budget > 0,
    'Original finite P181 deadline expired; no later choice or renewed deadline.');
  return budget;
}

async function p181BoundedWork(label, operation, deadlineAt, hold = () => {}, maximum = 60_000) {
  // Ordinary observations/actions keep their short cutoff. Lifecycle callers
  // explicitly retain their original absolute cutoff, without renewing it.
  deadlineAt = Math.min(deadlineAt, Date.now() + maximum);
  const budget = p181Remaining(deadlineAt, Infinity);
  let timer, delivered, failure;
  const observed = Promise.resolve().then(() => {
    p181Remaining(deadlineAt);
    return operation();
  }).then(value => {
    delivered = value;
    hold(value);
    p181Remaining(deadlineAt);
    return value;
  });
  try {
    return await Promise.race([observed, new Promise((_, reject) => {
      timer = setTimeout(() => {
        failure = new Error(`${label}: original finite P181 deadline expired.`);
        failure.name = 'TimeoutError';
        reject(failure);
      }, budget);
    })]);
  } catch (error) {
    rememberProofFailure(error, { operation: label, deadlineAt, delivered });
    throw error;
  } finally { clearTimeout(timer); }
}

function p181ActorReady(current, expected) {
  return Boolean(current && expected && current.sdkResumePending === false &&
    current.currentMemberBerthPresent === true && current.currentMemberBerthNull === false &&
    current.currentMemberBerthMatches === true && current.memberScopeMatches === true &&
    typeof current.fleetGroupId === 'string' && /^fleet-[1-9][0-9]*$/.test(current.fleetGroupId) &&
    current.fleetGroupId === expected.fleetGroupId &&
    pc11MemberReadiness(current, { sessionId: expected.sessionId, uidHash: expected.uidHash,
      roleId: P181_NORMAL_SETUP.wingCommanderRoleId, stage: 'station',
      connectionGeneration: expected.connectionGeneration,
      identityHydrationRevision: expected.identityHydrationRevision }));
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
  assert.equal(expectedWingCommander.sdkResumePending, false,
    'The mounted App authority observer must report that member resume is not pending.');
  assert.equal(expectedWingCommander.currentMemberBerthPresent, true);
  assert.equal(expectedWingCommander.currentMemberBerthNull, false);
  assert.equal(expectedWingCommander.currentMemberBerthMatches, true,
    'Require the exact App-observed current member berth tuple.');
  assert.equal(expectedWingCommander.memberScopeMatches, true,
    'Require the exact App-observed session member scope.');
  assert.ok(typeof expectedWingCommander.fleetGroupId === 'string' &&
    /^fleet-[1-9][0-9]*$/.test(expectedWingCommander.fleetGroupId));
  assert.ok(pc11MemberReadiness(expectedWingCommander, {
    sessionId: initial.sessionId, uidHash: expectedWingCommander.uidHash,
    roleId: P181_NORMAL_SETUP.wingCommanderRoleId, stage: 'station',
    connectionGeneration: expectedWingCommander.connectionGeneration,
    identityHydrationRevision: expectedWingCommander.identityHydrationRevision,
  }), 'The original admitted Wing Commander must own the current canonical station seat.');
  return expectedWingCommander;
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
  assert.equal(control?.holderUidHash, actor.uidHash,
    'The actual current Starlight holder hash must bind to the original Wing Commander; raw UID stays in the page.');
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
  const held = { operationStage: 'normal startup', observations: {}, receipts: [] };
  const work = async (stage, operation, deadlineAt = Math.min(absoluteDeadlineMs, Date.now() + 60_000), maximum = 60_000) => {
    held.operationStage = stage;
    return p181BoundedWork(stage, operation, deadlineAt, value => { held.observations[stage] = value; }, maximum);
  };
  const step = (method, ...args) => {
    const deadlineAt = Math.min(absoluteDeadlineMs, Date.now() + (method === 'openStarlightFromWingWorkspace' ? 35_000 : 60_000));
    return work(method, () => io[method](...args, p181Remaining(deadlineAt), deadlineAt), deadlineAt);
  };
  try {
  assert.ok(io && (typeof io.prepareNormalSession === 'function' ||
    typeof io.observeMember === 'function' && typeof io.observeFlight === 'function'),
  'Pass the original normal setup observer or mounted UI actor and Starlight source observers.');
  assert.ok(Number.isFinite(absoluteDeadlineMs) && absoluteDeadlineMs > Date.now(),
    'The parent allocation’s absolute deadline is required.');
  assert.ok(requiredBranches.every(branch => ['movement', 'first-scout', 'second-scout'].includes(branch)));
  assert.equal(new Set(requiredBranches).size, requiredBranches.length);
  io.absoluteDeadlineAt = absoluteDeadlineMs;
  let startupReceipts = [];
  if (!started || !gm || !Array.isArray(roster) || initial?.setupConfirmed !== true ||
      expectedWingCommander?.roleId !== P181_NORMAL_SETUP.wingCommanderRoleId) {
    assert.equal(typeof io.prepareNormalSession, 'function',
      'A fresh Cycle 0 P181 run must prepare its normal UI session before testing readiness or flight actions.');
    const deadlineAt = Math.min(absoluteDeadlineMs, Date.now() + 60_000);
    const prepared = await work('prepareNormalSession', () => io.prepareNormalSession({ initial, deadlineAt,
      requiredBranches: [...requiredBranches], setup: P181_NORMAL_SETUP }), deadlineAt);
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
  io.originalGmRegistration = { uidHash: started.uidHash, sessionId: initial.sessionId,
    instanceId: started.instanceId, claimedAt: started.claimedAt };
  if (typeof io.waitForLiftedAirspace === 'function') {
    const deadlineAt = absoluteDeadlineMs;
    const flight = await work('waitForLiftedAirspace', () => io.waitForLiftedAirspace(deadlineAt), deadlineAt, Infinity);
    assert.equal(flight.sessionId, initial.sessionId);
    assert.equal(flight.phase, 'active');
    assert.ok(flight.cycle >= 1);
    assert.equal(flight.airspace, 'lifted', 'Wait for the original source timer; do not advance or alter it.');
  }
  const receipts = startupReceipts.map(capture => ({ ...publicLifecycleReceipt(capture), endpoint: capture.endpoint }));
  held.receipts = receipts;
  const movement = { status: 'pending' }, scouting = { status: 'pending', privateReports: [] };
  const branches = [];

  const mark = (branch, status, detail = undefined) => branches.push({ branch, status, ...(detail ? { detail } : {}) });
  const currentMember = async (deadlineAt = Math.min(absoluteDeadlineMs, Date.now() + 60_000)) => {
    const actor = await work('observeMember', () => io.observeMember(deadlineAt), deadlineAt);
    held.actor = actor;
    requireActor(actor, io.expectedWingCommander);
    return actor;
  };
  const currentFlight = async (options, deadlineAt = Math.min(absoluteDeadlineMs, Date.now() + 60_000)) => {
    const actor = await currentMember(deadlineAt);
    const flight = await work('observeFlight', () => io.observeFlight(deadlineAt), deadlineAt);
    held.flight = flight;
    assert.equal(flight.sessionId, initial.sessionId);
    assertCurrentFlight(actor, flight, io.expectedWingCommander, options);
    return { actor, flight };
  };
  const operation = async (endpoint, callback, check) => {
    const deadlineAt = Math.min(absoluteDeadlineMs, Date.now() + 60_000);
    const before = await currentMember(deadlineAt);
    const capture = await work(endpoint, () => callback(p181Remaining(deadlineAt), before, deadlineAt), deadlineAt);
    held.capture = capture;
    const flight = await work('receipt source flight', () => io.observeFlight(deadlineAt), deadlineAt);
    held.flight = flight;
    verifySourceReceipt(capture, endpoint, { sessionId: initial.sessionId, actor: before,
      cycle: flight.cycle, shuttleId: P181_NORMAL_SETUP.shuttleId, requiredResult: check });
    requireActor(await currentMember(deadlineAt), io.expectedWingCommander,
      'Original actor after the actual source response');
    pushReceipt(receipts, endpoint, capture);
    io.onReceipt?.(receipts.at(-1));
    return capture;
  };

  await currentFlight({ requireAegisDocking: true });
  await step('openStarlightFromWingWorkspace');
  await currentFlight({ requireAegisDocking: true });

  // Capture the actual source offers before selecting either destination.
  const start = (await currentFlight({ requireAegisDocking: true })).flight;
  const destinations = await step('departureOptions');
  assert.ok(Array.isArray(destinations) && destinations.length > 0,
    'Use an actually offered source destination; never manufacture a destination.');
  const destination = destinations.find(value => value !== start.docking.shipId);
  assert.ok(destination, 'Starlight needs a currently offered destination other than its own berth.');
  const departure = await operation('requestShuttleDeparture',
    (budget, actor, deadlineAt) => io.requestDeparture(destination, start, actor, budget, deadlineAt),
    result => ['requested', 'committed', 'replayed'].includes(result?.status) &&
      identifier(result?.requestId));
  assert.equal(departure.request.sessionId, initial.sessionId);
  assert.equal(departure.request.shuttleId, P181_NORMAL_SETUP.shuttleId);
  assert.equal(departure.request.destinationShipId, destination);
  assert.equal(departure.request.expectedControlRevision, start.control.revision);
  assert.equal(departure.request.expectedCycle, start.cycle);
  const departureState = await step('waitForDeparture', departure.result);
  assert.equal(departureState.departure?.requestId, departure.result.requestId,
    'A current source departure projection must match the real UI receipt.');
  assert.equal(departureState.departure?.destinationShipId, destination);
  mark('departure', 'observed');

  const beforeBegin = (await currentFlight()).flight;
  assert.equal(beforeBegin.departure?.requestId, departure.result.requestId);
  const transitCapture = await operation('beginShuttleTransit',
    (budget, actor, deadlineAt) => io.beginTransit(beforeBegin.departure, beforeBegin, actor, budget, deadlineAt),
    result => result?.status === 'in-transit' && identifier(result?.transitRequestId) &&
      Number.isSafeInteger(result?.revision));
  assert.equal(transitCapture.request.expectedDepartureRequestId, departure.result.requestId);
  assert.equal(transitCapture.request.expectedControlRevision, beforeBegin.control.revision);
  assert.equal(transitCapture.request.expectedCycle, beforeBegin.cycle);
  const transit = await step('waitForTransit', transitCapture.result);
  assert.equal(transit.transit?.transitRequestId, transitCapture.result.transitRequestId,
    'The current in-transit projection must match the original Begin receipt.');
  assert.equal(transit.transit?.originShipId, start.docking.shipId);
  assert.equal(transit.transit?.destinationShipId, destination);
  assert.equal(transit.transit?.status, 'in-transit');
  mark('begin-transit', 'observed');

  const retargetOptions = await step('retargetOptions', transit.transit);
  assert.ok(Array.isArray(retargetOptions));
  const retargetDestination = retargetOptions.find(value => value !== transit.transit.originShipId &&
    value !== transit.transit.destinationShipId);
  if (retargetDestination) {
    const beforeRetarget = (await currentFlight()).flight;
    const retargetCapture = await operation('retargetShuttleTransit',
      (budget, actor, deadlineAt) => io.retargetTransit(beforeRetarget.transit, retargetDestination, beforeRetarget, actor, budget, deadlineAt),
      result => result?.status === 'in-transit' && result?.transitRequestId === transit.transit.transitRequestId &&
        result?.destinationShipId === retargetDestination && Number.isSafeInteger(result?.revision));
    assert.equal(retargetCapture.request.transitRequestId, transit.transit.transitRequestId);
    assert.equal(retargetCapture.request.destinationShipId, retargetDestination);
    assert.equal(retargetCapture.request.expectedControlRevision, beforeRetarget.control.revision);
    assert.equal(retargetCapture.request.expectedCycle, beforeRetarget.cycle);
    const retargeted = await step('waitForTransit', retargetCapture.result);
    assert.equal(retargeted.transit?.transitRequestId, transit.transit.transitRequestId);
    assert.equal(retargeted.transit?.destinationShipId, retargetDestination);
    assert.equal(retargeted.transit?.retargetRequestId, retargetCapture.request.requestId);
    mark('retarget', 'observed');

    const arrivalWindow = await step('waitForArrivalWindow', retargeted.transit);
    const beforeArrival = arrivalWindow?.beforeFlight;
    const arrival = arrivalWindow?.capture;
    assert.ok(beforeArrival && arrival,
      'Retain the original automatic timer request and reply before the source deletes its transit projection.');
    assertCurrentFlight(arrivalWindow.actor, beforeArrival, io.expectedWingCommander);
    assert.equal(beforeArrival.sessionId, initial.sessionId);
    assert.equal(beforeArrival.transit?.transitRequestId, transit.transit.transitRequestId);
    assert.equal(beforeArrival.transit?.destinationShipId, retargetDestination);
    verifySourceReceipt(arrival, 'completeShuttleArrival', { sessionId: initial.sessionId,
      actor: arrivalWindow.actor, cycle: beforeArrival.cycle, shuttleId: P181_NORMAL_SETUP.shuttleId,
      requiredResult: result => result?.hostShipId === retargetDestination &&
        typeof result.arrivedAt === 'string' && Number.isFinite(Date.parse(result.arrivedAt)) &&
        Date.parse(result.arrivedAt) >= Date.parse(beforeArrival.transit.arrivesAt) });
    assert.equal(arrival.request.transitRequestId, beforeArrival.transit.transitRequestId);
    assert.equal(arrival.request.expectedControlRevision, beforeArrival.control.revision);
    assert.equal(arrival.request.expectedCycle ?? beforeArrival.cycle, beforeArrival.cycle);
    requireActor(arrivalWindow.actor, io.expectedWingCommander,
      'Original Wing Commander after automatic source arrival');
    const finalFlight = await step('waitForDocking', arrival.result);
    assert.equal(finalFlight.control?.revision > beforeArrival.control.revision, true,
      'Automatic source arrival must advance current Starlight custody revision.');
    assertCurrentFlight(arrivalWindow.actor, finalFlight, io.expectedWingCommander);
    assert.deepEqual(finalFlight.docking, { shuttleId: P181_NORMAL_SETUP.shuttleId, shipId: retargetDestination },
      'Committed UI arrival must match the current source docking, with no duplicate arrival action.');
    assert.equal(finalFlight.transit ?? null, null);
    pushReceipt(receipts, 'completeShuttleArrival', arrival);
    io.onReceipt?.(receipts.at(-1));
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
  const recovered = await step('reloadAndReselectWingCommander');
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

  const firstOffer = await step('currentScoutOffer');
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
      const offer = attempt === 1 ? firstOffer : await step('currentScoutOffer');
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
        selectedOffer = await step('selectPrintedScoutCoordinate', alternate, offer);
        assert.equal(selectedOffer?.coordinate, alternate);
        assert.ok(selectedOffer.printedCoordinates.includes(alternate));
      }
      if (attempt === 2) assert.notEqual(selectedOffer.coordinate, scouting.privateReports[0].targetCoordinate,
        'The fuelled same-cycle scan must select a distinct printed system.');
      const { actor, flight } = await currentFlight();
      assert.equal(flight.cycle, originalCycle);
      const capture = await operation('requestScout',
        (budget, current, deadlineAt) => io.requestScout(selectedOffer.coordinate, flight, current, budget, deadlineAt),
        result => ['requested', 'replayed'].includes(result?.status) && result?.resolution === 'pending' &&
          result?.cycle === originalCycle);
      const bundle = await step('resolveScoutNormally', capture.result);
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
    await work('Create private source evidence directory', () => mkdir(evidenceDirectory, { recursive: true, mode: 0o700 }));
    await work('Persist original source receipts', () => writeFile(resolve(evidenceDirectory, 'p181-starlight-movement-scout.json'),
      `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' }));
  }
  return result;
  } catch (error) {
    rememberProofFailure(error, { operation: 'P181 movement/scout core', ...held });
    throw error;
  }
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
  if (firstError && typeof input?.io?.retainFirstFailure === 'function') {
    try {
      const deadlineAt = Math.min(input.cleanupDeadlineMs ?? input.absoluteDeadlineMs, Date.now() + 60_000);
      await p181BoundedWork('Retain the original first failure before owned teardown',
        () => input.io.retainFirstFailure(firstError, { deadlineAt }), deadlineAt);
    } catch (error) {
      rememberProofFailure(firstError, { primaryRetentionBeforeCleanupFailure: error });
    }
  }
  const cleanupOwnedResources = input?.io?.cleanupOwnedResources;
  if (typeof cleanupOwnedResources === 'function') {
    const deadlineAt = input.cleanupDeadlineMs ?? input.absoluteDeadlineMs ?? Date.now();
    try {
      assert.ok(Number.isFinite(deadlineAt) && deadlineAt > Date.now(),
        'Original P181 cleanup deadline expired; do not extend or begin a new cleanup action.');
      cleanup = await p181BoundedWork('P181 owned cleanup',
        () => cleanupOwnedResources({ firstError, deadlineAt }), deadlineAt, undefined, Infinity);
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
      actor: { uidHash: await digest(user.uid), sessionId: me.sessionId,
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
      control: control ? { shuttleId: control.shuttleId,
        holderUidHash: await digest(control.holderUid), ownerUidHash: await digest(control.ownerUid),
        revision: control.revision } : null,
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
  expectedWingCommander, normalStart, cleanupOwnedResources, retainFirstFailure, captureOriginalGmAction, onReceipt }) {
  assert.ok(gm?.page && wingCommander?.page && gameplay?.select && directory);
  const endFor = (timeout = 60_000, deadlineAt) => Math.min(io.absoluteDeadlineAt ?? Infinity,
    deadlineAt ?? Date.now() + Math.min(60_000, timeout));
  const work = (label, action, deadlineAt, hold, maximum) => p181BoundedWork(label, action, deadlineAt, hold, maximum);
  const member = deadlineAt => work('Read original mounted member DTO', () =>
    observeFullGameDemoPresentationMember(wingCommander, { knownRoleIds: P181_NORMAL_SETUP.roleIds }),
    Math.min(deadlineAt, Date.now() + 60_000));
  const snapshot = deadlineAt => work('Read original mounted Starlight source', () =>
    observeP181StarlightSource(wingCommander), Math.min(deadlineAt, Date.now() + 60_000));
  const callable = async (surface, name, data, deadlineAt) => {
    const reply = await work(`Original SDK ${name}`, () => surface.callable(name, data), deadlineAt);
    assert.equal(reply?.status, 'committed', `Original normal SDK callable ${name} must be authorized and current.`);
    return reply.result;
  };
  async function selectWing(deadlineAt) {
    const surface = await work('Choose original Wing Commander workspace', () =>
      gameplay.select(P181_NORMAL_SETUP.wingCommanderRoleId, { enter: true, deadlineAt }), deadlineAt);
    assert.equal(surface, wingCommander, 'The original Wing Commander Auth surface must remain the chooser target.');
    return surface;
  }
  async function observeFlight(deadlineAt) {
    const value = await snapshot(deadlineAt);
    assert.equal(value.actor.uidHash, io.expectedWingCommander.uidHash);
    return value;
  }
  const qualifyMember = async (deadlineAt, before) => {
    const actor = await member(deadlineAt);
    requireActor(actor, io.expectedWingCommander);
    const flight = await observeFlight(deadlineAt);
    assert.equal(flight.sessionId, io.sessionId);
    assertCurrentFlight(actor, flight, io.expectedWingCommander);
    if (before) {
      assert.equal(flight.cycle, before.cycle, 'Retain the original source cycle before choosing.');
      assert.equal(flight.control.revision, before.control.revision, 'Retain the original source custody revision before choosing.');
    }
    return actor;
  };
  const qualifyGm = async deadlineAt => {
    const registered = io.originalGmRegistration;
    assert.ok(registered?.uidHash && registered.instanceId && typeof registered.claimedAt === 'string',
      'Original registered GM UID, instance and held claim receipt are required for recovery.');
    const current = await work('Read original GM safe SDK tuple', () =>
      observeFullGameDemoPresentationMember(gm, { knownRoleIds: P181_NORMAL_SETUP.roleIds }), deadlineAt);
    const recoveryPending = await work('Read original GM recovery state', () => gm.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      return useSessionStore.getState().gmRecoveryPending;
    }, gm.storeModuleUrl()), deadlineAt);
    assert.equal(pc11GmReadiness({ ...current, recoveryPending }, registered), true,
      'Original registered GM must retain live server SDK authority before recovery.');
    assert.equal(current.sdkResumePending, false);
    const lifecycle = await work('Read original held GM lifecycle claim', () =>
      observeLifecycleActor(gm, initial.sessionId), deadlineAt);
    assert.equal(lifecycle.uidHash, registered.uidHash, 'Keep the original GM Auth account.');
    assert.equal(lifecycle.sessionId, registered.sessionId);
    assert.equal(lifecycle.instanceId, registered.instanceId);
    assert.equal(lifecycle.claimedAt, registered.claimedAt, 'Bind the actual held original GM claim, never a safe DTO alias.');
    assert.equal(lifecycle.generation, current.connectionGeneration);
    assert.equal(lifecycle.hydrationRevision, current.identityHydrationRevision);
    return lifecycle;
  };
  const runAction = async (surface, endpoint, choose, deadlineAt, before) => {
    const held = { endpoint, deadlineAt }; let capture;
    try {
      if (surface === gm) {
        const original = await qualifyGm(deadlineAt);
        held.original = original;
        const guardedChoice = async () => { await qualifyGm(deadlineAt); p181Remaining(deadlineAt); await choose(); };
        capture = await work(`Capture original GM ${endpoint}`, () => typeof captureOriginalGmAction === 'function'
          ? captureOriginalGmAction(surface, endpoint, guardedChoice, deadlineAt)
          : captureLifecycleUiAction(surface, endpoint, guardedChoice,
            { timeout: p181Remaining(deadlineAt), deadlineAt, original, gm: true }), deadlineAt,
        value => { held.capture = value; });
        await qualifyGm(deadlineAt);
      } else {
        assert.equal(surface, wingCommander);
        const actor = await qualifyMember(deadlineAt, before);
        held.actor = actor; held.beforeFlight = before;
        // options.original is the shared helper's GM observer contract. Its
        // supported ordinary-member path still asserts its lifecycle epoch;
        // this caller separately binds the held UID/seat/berth and fresh SDK.
        capture = await work(`Capture original member ${endpoint}`, () => captureLifecycleUiAction(surface, endpoint,
          async () => { await qualifyMember(deadlineAt, before); p181Remaining(deadlineAt); await choose(); },
          { timeout: p181Remaining(deadlineAt), deadlineAt, gm: false }), deadlineAt,
        value => { held.capture = value; });
        const after = await qualifyMember(deadlineAt);
        held.afterActor = after;
        assert.equal(capture.before.uidHash, io.expectedWingCommander.uidHash);
        assert.equal(capture.before.sessionId, io.expectedWingCommander.sessionId);
        assert.equal(capture.before.generation, actor.connectionGeneration);
        assert.equal(capture.before.hydrationRevision, actor.identityHydrationRevision);
      }
      return { ...capture, request: capture.data };
    } catch (error) { rememberProofFailure(error, { operation: 'P181 original browser action', ...held }); throw error; }
  };
  const pause = (milliseconds, deadlineAt) => work('Original source polling interval', () =>
    delay(Math.min(milliseconds, p181Remaining(deadlineAt))), deadlineAt);
  async function pollFlight(description, predicate, deadlineAt) {
    let flight;
    while (Date.now() < deadlineAt) {
      flight = await observeFlight(deadlineAt);
      if (predicate(flight)) return flight;
      await pause(200, deadlineAt);
    }
    const error = new Error(description);
    rememberProofFailure(error, { operation: description, flight, deadlineAt }); throw error;
  }
  const io = {
    sessionId: initial.sessionId, expectedWingCommander,
    originalGmRegistration: started ? { ...started, sessionId: initial.sessionId } : undefined,
    now: () => Date.now(), onReceipt,
    ...(typeof normalStart?.prepare === 'function' ? { prepareNormalSession: args =>
      work('Original normal session setup/start', () => normalStart.prepare(args), args.deadlineAt) } : {}),
    ...(typeof cleanupOwnedResources === 'function' ? { cleanupOwnedResources } : {}),
    ...(typeof retainFirstFailure === 'function' ? { retainFirstFailure } : {}),
    async waitForLiftedAirspace(deadlineAt) {
      deadlineAt = endFor(60_000, deadlineAt);
      return work('Wait for original lifted airspace', async () => {
        let flight;
        while (Date.now() < deadlineAt) {
          requireActor(await member(deadlineAt), io.expectedWingCommander);
          flight = await observeFlight(deadlineAt);
          assert.equal(flight.sessionId, io.sessionId); assert.equal(flight.phase, 'active');
          if (flight.cycle >= 1 && flight.airspace === 'lifted') return flight;
          await pause(250, deadlineAt);
        }
        throw new Error('Original Starlight airspace did not lift before its finite deadline.');
      }, deadlineAt, undefined, Infinity);
    },
    async observeMember(deadlineAt) { return member(endFor(60_000, deadlineAt)); },
    async observeFlight(deadlineAt) { return observeFlight(endFor(60_000, deadlineAt)); },
    async openStarlightFromWingWorkspace(timeout, deadlineAt) {
      deadlineAt = Math.min(endFor(timeout, deadlineAt), Date.now() + 35_000);
      await selectWing(deadlineAt);
      const link = wingCommander.page.getByRole('link', { name: 'Open Starlight shuttle console', exact: true });
      await work('Wait for original Starlight link', () => link.waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }), deadlineAt);
      await work('Open original Starlight console', () => link.click({ timeout: p181Remaining(deadlineAt) }), deadlineAt);
      await work('Wait for original Starlight controls', () => wingCommander.page.getByRole('region', { name: 'Shuttle control', exact: true })
        .waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }), deadlineAt);
    },
    async departureOptions(timeout, deadlineAt) {
      deadlineAt = Math.min(endFor(timeout, deadlineAt), Date.now() + 35_000);
      const select = wingCommander.page.getByLabel('Destination ship', { exact: true });
      await work('Wait for original departure offers', () => select.waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }), deadlineAt);
      return work('Read original departure offers', () => select.locator('option').evaluateAll(options =>
        options.filter(option => !option.disabled && option.value).map(option => option.value)), deadlineAt);
    },
    async retargetOptions(transit, timeout, deadlineAt) {
      deadlineAt = Math.min(endFor(timeout, deadlineAt), Date.now() + 35_000);
      const select = wingCommander.page.getByLabel('New destination ship', { exact: true });
      await work('Wait for original retarget offers', () => select.waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }), deadlineAt);
      return work('Read original retarget offers', () => select.locator('option').evaluateAll(options =>
        options.filter(option => !option.disabled && option.value).map(option => option.value)), deadlineAt);
    },
    async requestDeparture(destination, before, actor, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt); const choiceEnd = Math.min(deadlineAt, Date.now() + 35_000);
      requireActor(actor, io.expectedWingCommander);
      const select = wingCommander.page.getByLabel('Destination ship', { exact: true });
      await work('Select original departure destination', () => select.selectOption(destination, { timeout: p181Remaining(choiceEnd) }), choiceEnd);
      assert.equal(await work('Read original selected departure', () => select.inputValue(), choiceEnd), destination);
      return runAction(wingCommander, 'requestShuttleDeparture', () => work('Choose original departure', () =>
        wingCommander.page.getByRole('button', { name: 'Request departure', exact: true }).click({ timeout: p181Remaining(choiceEnd) }), choiceEnd), deadlineAt, before);
    },
    async waitForDeparture(receipt, timeout, deadlineAt) {
      return pollFlight('Original departure receipt did not publish before its finite deadline.',
        value => value.departure?.requestId === receipt.requestId, endFor(timeout, deadlineAt));
    },
    async beginTransit(departure, before, actor, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt); const choiceEnd = Math.min(deadlineAt, Date.now() + 35_000);
      requireActor(actor, io.expectedWingCommander);
      return runAction(wingCommander, 'beginShuttleTransit', () => work('Choose original Begin transit', () =>
        wingCommander.page.getByRole('button', { name: 'Begin transit', exact: true }).click({ timeout: p181Remaining(choiceEnd) }), choiceEnd), deadlineAt, before);
    },
    async waitForTransit(receipt, timeout, deadlineAt) {
      return pollFlight('Original transit receipt did not publish before its finite deadline.',
        value => value.transit?.transitRequestId === receipt.transitRequestId, endFor(timeout, deadlineAt));
    },
    async retargetTransit(transit, destination, before, actor, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt); const choiceEnd = Math.min(deadlineAt, Date.now() + 35_000);
      requireActor(actor, io.expectedWingCommander);
      const select = wingCommander.page.getByLabel('New destination ship', { exact: true });
      await work('Select original retarget destination', () => select.selectOption(destination, { timeout: p181Remaining(choiceEnd) }), choiceEnd);
      assert.equal(await work('Read original selected retarget', () => select.inputValue(), choiceEnd), destination);
      return runAction(wingCommander, 'retargetShuttleTransit', () => work('Choose original retarget', () =>
        wingCommander.page.getByRole('button', { name: 'Retarget shuttle', exact: true }).click({ timeout: p181Remaining(choiceEnd) }), choiceEnd), deadlineAt, before);
    },
    async waitForArrivalWindow(transit, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt);
      const held = { transit, deadlineAt }; let body, capture;
      try {
        const actorBefore = await work('Read held original arrival member', () => io.observeMember(deadlineAt), deadlineAt); held.actorBefore = actorBefore;
        requireActor(actorBefore, io.expectedWingCommander);
        const beforeFlight = await work('Read held original arrival flight', () => io.observeFlight(deadlineAt), deadlineAt); held.beforeFlight = beforeFlight;
        assert.equal(beforeFlight.sessionId, initial.sessionId);
        assertCurrentFlight(actorBefore, beforeFlight, io.expectedWingCommander);
        assert.equal(beforeFlight.transit?.transitRequestId, transit.transitRequestId);
        assert.equal(beforeFlight.transit?.destinationShipId, transit.destinationShipId);
        const expected = { sessionId: initial.sessionId, shuttleId: P181_NORMAL_SETUP.shuttleId,
          transitRequestId: transit.transitRequestId, expectedControlRevision: beforeFlight.control.revision };
        const matches = response => {
          try {
            if (!new URL(response.url()).pathname.endsWith('/us-central1/completeShuttleArrival') || response.request().method() !== 'POST') return false;
            const data = response.request().postDataJSON()?.data;
            return Object.entries(expected).every(([key, value]) => data?.[key] === value);
          } catch { return false; }
        };
        const response = await work('Observe original automatic arrival receipt', () => observeUiReceipt({ page: wingCommander.page,
          consumed: { phase: 'original automatic Starlight arrival timer', endpoint: 'completeShuttleArrival', ...expected, deadlineAt },
          waitForResponse: () => wingCommander.page.waitForResponse(matches, { timeout: p181Remaining(deadlineAt) }),
          choose: async () => {} }), deadlineAt, value => { held.response = value; });
        body = await work('Read original automatic arrival body', () => response.json(), deadlineAt, value => { held.body = value; });
        capture = { endpoint: 'completeShuttleArrival', data: response.request().postDataJSON()?.data,
          request: response.request().postDataJSON()?.data, before: {
            sessionId: actorBefore.sessionId, uidHash: actorBefore.uidHash,
            generation: actorBefore.connectionGeneration, hydrationRevision: actorBefore.identityHydrationRevision,
          }, httpStatus: response.status(), result: body.result, ...(body.error ? { error: body.error } : {}) };
        held.capture = capture;
        const succeeded = response.status() < 400 && !body.error && body.result?.hostShipId === transit.destinationShipId &&
          Number.isFinite(Date.parse(body.result.arrivedAt)) && Date.parse(body.result.arrivedAt) >= Date.parse(transit.arrivesAt);
        if (!succeeded) {
          const retry = wingCommander.page.getByRole('button', { name: 'Retry arrival', exact: true });
          const retryOffered = await work('Read offered arrival retry visibility', () => retry.isVisible(), deadlineAt) &&
            await work('Read offered arrival retry authority', () => retry.isEnabled(), deadlineAt);
          assert.equal(retryOffered, true, 'Retry only when the original mounted source UI actually offers its Retry arrival control.');
          const choiceEnd = Math.min(deadlineAt, Date.now() + 35_000);
          capture = await runAction(wingCommander, 'completeShuttleArrival', () => work('Choose offered original arrival retry', () =>
            retry.click({ timeout: p181Remaining(choiceEnd) }), choiceEnd), deadlineAt, beforeFlight);
          held.retryCapture = capture;
        }
        for (const [key, value] of Object.entries(expected)) assert.equal(capture.request?.[key], value);
        const actorAfter = await work('Read held original arrival member', () => io.observeMember(deadlineAt), deadlineAt); held.actorAfter = actorAfter;
        requireActor(actorAfter, io.expectedWingCommander);
        const afterFlight = await work('Read held original arrival flight', () => io.observeFlight(deadlineAt), deadlineAt); held.afterFlight = afterFlight;
        assert.equal(afterFlight.sessionId, expected.sessionId); assert.equal(afterFlight.phase, 'active');
        assert.equal(afterFlight.control?.shuttleId, expected.shuttleId);
        assert.ok(afterFlight.control.revision > beforeFlight.control.revision);
        assert.deepEqual(afterFlight.docking, { shuttleId: expected.shuttleId, shipId: transit.destinationShipId });
        assert.equal(afterFlight.transit ?? null, null);
        return { beforeFlight, afterFlight, actor: actorAfter, capture };
      } catch (error) { rememberProofFailure(error, { operation: 'P181 automatic arrival', ...held, body, capture }); throw error; }
    },
    async completeArrival(transit, before, actor, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt); const choiceEnd = Math.min(deadlineAt, Date.now() + 35_000);
      requireActor(actor, io.expectedWingCommander);
      const button = wingCommander.page.getByRole('button', { name: 'Retry arrival', exact: true });
      await work('Wait for offered original arrival retry', () => button.waitFor({ state: 'visible', timeout: p181Remaining(choiceEnd) }), choiceEnd);
      assert.equal(await work('Read original retry enabled state', () => button.isEnabled(), choiceEnd), true);
      return runAction(wingCommander, 'completeShuttleArrival', () => work('Choose original arrival retry', () =>
        button.click({ timeout: p181Remaining(choiceEnd) }), choiceEnd), deadlineAt, before);
    },
    async waitForDocking(receipt, timeout, deadlineAt) {
      return pollFlight('Original docking did not publish before its finite deadline.',
        value => value.docking?.shipId === receipt.hostShipId && !value.transit, endFor(timeout, deadlineAt));
    },
    async reloadAndReselectWingCommander(timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt);
      const before = await member(deadlineAt);
      const navigation = createMemberNavigationResumeObserver(wingCommander.page, {
        directory, roleId: P181_NORMAL_SETUP.wingCommanderRoleId, deadlineAt, memberContract: 'pc11-live-base' });
      let failed, acceptedActor, resumeEvidence, recovered;
      try {
        await work('Prepare original navigation observer', () => navigation.prepare(before), deadlineAt);
        await work('Reload original member document', () => wingCommander.page.reload({ waitUntil: 'domcontentloaded',
          timeout: p181Remaining(deadlineAt, 35_000) }), Math.min(deadlineAt, Date.now() + 35_000));
        while (Date.now() < deadlineAt) {
          const current = await member(deadlineAt);
          assert.equal(current.sessionId, initial.sessionId); assert.equal(current.uidHash, io.expectedWingCommander.uidHash);
          navigation.sample(current);
          if (current.connection !== 'live' || current.freshness !== 'server') { await pause(200, deadlineAt); continue; }
          if (current.connectionGeneration !== before.connectionGeneration || current.identityHydrationRevision !== before.identityHydrationRevision ||
              current.documentTimeOrigin !== before.documentTimeOrigin) {
            const accepted = await work('Accept exact original navigation SDK receipt', () =>
              navigation.accept(before, current, () => member(deadlineAt)), deadlineAt);
            if (!accepted) { await pause(150, deadlineAt); continue; }
            acceptedActor = accepted;
            resumeEvidence = { status: 'accepted', source: 'normal-resumeSession', uidHash: accepted.uidHash,
              sessionId: accepted.sessionId, connectionGeneration: accepted.connectionGeneration,
              identityHydrationRevision: accepted.identityHydrationRevision, sdkHasServerAuthority: accepted.sdkHasServerAuthority };
          } else acceptedActor = current;
          break;
        }
        assert.ok(acceptedActor, 'Original reload recovery must keep its initial finite deadline.');
        await selectWing(deadlineAt);
        const link = wingCommander.page.getByRole('link', { name: 'Open Starlight shuttle console', exact: true });
        if (await work('Read offered original Starlight link', () => link.isVisible(), deadlineAt))
          await work('Reopen original Starlight console', () => link.click({ timeout: p181Remaining(deadlineAt, 35_000) }), deadlineAt);
        await work('Wait for original scouting panel', () => wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true })
          .waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt, 35_000) }), deadlineAt);
        const after = await member(deadlineAt);
        assert.equal(after.sessionId, initial.sessionId); assert.equal(after.uidHash, io.expectedWingCommander.uidHash);
        recovered = { actor: after, flight: await observeFlight(deadlineAt), ...(resumeEvidence ? { resumeEvidence } : {}) };
      } catch (error) { failed = error; }
      finally {
        try { await work('Finish original navigation observer', () => navigation.finish(failed), deadlineAt); }
        catch (error) { if (!failed) failed = error; else rememberProofFailure(failed, { navigationCleanupError: error }); }
      }
      if (failed) { rememberProofFailure(failed, { operation: 'P181 navigation recovery', before, acceptedActor, recovered }); throw failed; }
      return recovered;
    },
    async currentScoutOffer(timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt);
      const panel = wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true });
      await work('Wait for original scouting offer', () => panel.waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt, 35_000) }), deadlineAt);
      const input = panel.getByLabel('Printed system coordinate', { exact: true });
      const button = panel.getByRole('button', { name: 'Record request', exact: true });
      const printedCoordinates = await work('Read original printed GM chart coordinates', () => gm.page.evaluate(() => {
        const region = [...document.querySelectorAll('[aria-label="GM starmap"]')][0];
        return region ? [...region.querySelectorAll('button[data-system-coordinate]')].filter(value => !value.disabled)
          .map(value => value.dataset.systemCoordinate) : [];
      }), deadlineAt);
      const selected = await work('Read original scouting coordinate', () => input.inputValue(), deadlineAt);
      const target = /^\d{4}$/.test(selected) ? selected : printedCoordinates[0];
      const source = await work('Read original scouting source offer', () => wingCommander.page.evaluate(async ({ storeUrl, target }) => {
        const { useSessionStore } = await import(storeUrl);
        const session = useSessionStore.getState().session, cycle = session?.currentTurn;
        const maintenance = session?.maintenanceCycles?.aegis;
        const currentFuel = session?.shuttleFuelled?.starlight === true && maintenance?.turn === cycle &&
          maintenance.refuelled?.includes('starlight') && (maintenance.step === 7 || maintenance.step === 0 && Number.isFinite(Date.parse(maintenance.completedAt)));
        return { sessionId: session?.id, cycle, airspace: session?.turnPhase?.airspace?.state ?? null,
          active: session?.phase === 'active', currentFuel: currentFuel === true, target };
      }, { storeUrl: wingCommander.storeModuleUrl(), target }), deadlineAt);
      if (target && printedCoordinates.includes(target) && target !== selected)
        await work('Select original printed scouting coordinate', () => input.fill(target, { timeout: p181Remaining(deadlineAt, 35_000) }), deadlineAt);
      const active = source.active && source.cycle >= 1 && source.airspace === 'lifted';
      const cadence = await callable(wingCommander, 'listMyScoutReports', { sessionId: initial.sessionId }, deadlineAt);
      const currentReports = Array.isArray(cadence) ? cadence.filter(row => row.cycle === source.cycle && row.entitlementId === 'starlight') : [];
      const enabled = await work('Read original scouting command availability', () => button.isEnabled(), deadlineAt);
      let distance = null;
      if (target && printedCoordinates.includes(target)) distance = await work('Read original chart distance', () => wingCommander.page.evaluate(async ({ storeUrl, coordinate }) => {
        const { useSessionStore } = await import(storeUrl);
        const { jumpDistanceBetween } = await import('/functions/src/starChartGraph.ts');
        return jumpDistanceBetween(useSessionStore.getState().session?.shipGalacticCoordinates?.aegis, coordinate);
      }, { storeUrl: wingCommander.storeModuleUrl(), coordinate: target }), deadlineAt);
      return { eligible: Boolean(active && enabled), firstRequestAvailable: active && currentReports.length === 0 && enabled,
        fuelledSecondRequestAvailable: active && currentReports.length === 1 && source.currentFuel && enabled,
        sessionId: source.sessionId, cycle: source.cycle, airspace: source.airspace, entitlementId: 'starlight',
        ownerRoleId: P181_NORMAL_SETUP.wingCommanderRoleId, anchorShipId: P181_NORMAL_SETUP.hostShipId,
        coordinate: target, printedCoordinates, distance, blocker: !active ? 'source-coordination-not-open' : null };
    },
    async selectPrintedScoutCoordinate(coordinate, offer, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt);
      assert.ok(offer.printedCoordinates.includes(coordinate));
      const input = wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true })
        .getByLabel('Printed system coordinate', { exact: true });
      await work('Select another original printed coordinate', () => input.fill(coordinate, { timeout: p181Remaining(deadlineAt, 35_000) }), deadlineAt);
      assert.equal(await work('Read original changed scouting coordinate', () => input.inputValue(), deadlineAt), coordinate);
      const refreshed = await io.currentScoutOffer(p181Remaining(deadlineAt), deadlineAt);
      assert.equal(refreshed.coordinate, coordinate); assert.equal(refreshed.cycle, offer.cycle); return refreshed;
    },
    async requestScout(coordinate, before, actor, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt); const choiceEnd = Math.min(deadlineAt, Date.now() + 35_000);
      requireActor(actor, io.expectedWingCommander);
      const input = wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true })
        .getByLabel('Printed system coordinate', { exact: true });
      await work('Select original scout request coordinate', () => input.fill(coordinate, { timeout: p181Remaining(choiceEnd) }), choiceEnd);
      return runAction(wingCommander, 'requestScout', () => work('Choose original scout request', () =>
        wingCommander.page.getByRole('region', { name: 'Starlight scouting request', exact: true })
          .getByRole('button', { name: 'Record request', exact: true }).click({ timeout: p181Remaining(choiceEnd) }), choiceEnd), deadlineAt, before);
    },
    async resolveScoutNormally(reply, timeout, deadlineAt) {
      deadlineAt = endFor(timeout, deadlineAt);
      const held = { reply, deadlineAt }; let bundle;
      const readBundle = async () => {
        const reports = await callable(wingCommander, 'listMyScoutReports', { sessionId: initial.sessionId }, deadlineAt);
        held.reports = reports;
        const report = reports?.find(value => value.requestId === reply.requestId);
        if (!report || report.status !== 'resolved' || !report.noteId) return null;
        const [result, note] = await Promise.all([
          callable(wingCommander, 'readPrivateScoutResult', { sessionId: initial.sessionId, requestId: reply.requestId }, deadlineAt)
            .then(value => { held.result = value; return value; }),
          callable(wingCommander, 'readMyScoutDiscoveryNote', { sessionId: initial.sessionId, noteId: report.noteId }, deadlineAt)
            .then(value => { held.note = value; return value; }),
        ]);
        return { report, result, note };
      };
      try {
        let nextGmReadAt = Date.now() + 1_000, recoveryIssued = false;
        while (Date.now() < deadlineAt) {
          bundle = await work('Read original private scout bundle', readBundle, deadlineAt, value => { held.bundle = value; });
          if (bundle) return bundle;
          if (!recoveryIssued && Date.now() >= nextGmReadAt) {
            await qualifyGm(deadlineAt);
            const selected = await work('Choose original GM recovery workspace', () => gameplay.select('gm', { enter: true, deadlineAt }), deadlineAt);
            assert.equal(selected, gm, 'Recovery must use the original registered GM browser.');
            const panel = gm.page.getByRole('region', { name: 'GM scout reveals', exact: true });
            if (await work('Read original GM reveal panel', () => panel.isVisible(), deadlineAt)) {
              const reveal = panel.getByRole('button', { name: `Reveal Starlight scout at ${reply.targetCoordinate}`, exact: true });
              if (await work('Read original offered GM reveal', () => reveal.isVisible(), deadlineAt) &&
                  await work('Read original enabled GM reveal', () => reveal.isEnabled(), deadlineAt)) {
                const choiceEnd = Math.min(deadlineAt, Date.now() + 35_000);
                held.recoveryCapture = await runAction(gm, 'resolvePendingScoutRequest', () => work('Choose original GM scout recovery', () =>
                  reveal.click({ timeout: p181Remaining(choiceEnd) }), choiceEnd), deadlineAt);
                recoveryIssued = true;
              }
            }
            nextGmReadAt = Date.now() + 1_000;
          }
          await pause(250, deadlineAt);
        }
        return bundle ?? null;
      } catch (error) { rememberProofFailure(error, { operation: 'P181 original scout result/recovery', ...held }); throw error; }
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
  directory, browsers, surfaces, remoteRequests, pageErrors, calls, requests,
  absoluteDeadlineAt = Infinity, cleanupDeadlineAt }) {
  assert.ok(chromium?.launch && typeof baseUrl === 'string' && directory);
  const origin = new URL(baseUrl);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  const allowedPorts = new Set([origin.port, ...Object.values(ports).map(String)]);
  let launchCount = 0;
  const pendingAcquisitions = new Set();
  async function launch(label, requestedDeadlineAt) {
    const deadlineAt = Math.min(absoluteDeadlineAt, requestedDeadlineAt ?? Date.now() + 60_000);
    const cleanupAt = cleanupDeadlineAt ?? deadlineAt + 60_000;
    p181Remaining(deadlineAt);
    assert.ok(['normal-gm', 'normal-wing-commander'].includes(label));
    assert.equal(launchCount < P181_NATIVE_TIMING.nativeBrowserProcesses, true,
      'P181 owns exactly one browser process per ordinary Auth actor.');
    launchCount++;
    let browser, acquisitionFailure;
    const acquire = Promise.resolve().then(() => {
      p181Remaining(deadlineAt);
      return chromium.launch({ channel: 'chrome', headless: true });
    }).then(async value => {
      browser = value; browsers.push(value);
      if (Date.now() >= deadlineAt) {
        try { await p181BoundedWork('Close exact late-acquired original browser', () => value.close(), cleanupAt); }
        catch (error) { if (acquisitionFailure) rememberProofFailure(acquisitionFailure, { lateBrowserCleanupError: error }); }
        p181Remaining(deadlineAt);
      }
      return value;
    });
    pendingAcquisitions.add(acquire);
    acquire.then(() => pendingAcquisitions.delete(acquire), () => pendingAcquisitions.delete(acquire));
    let context, page;
    try {
      await p181BoundedWork('Acquire original browser process', () => acquire, deadlineAt);
      context = await p181BoundedWork('Acquire original browser context', () => browser.newContext({
        viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' }), deadlineAt);
      await p181BoundedWork('Install original local-only request boundary', () => context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
        if (['127.0.0.1', 'localhost'].includes(url.hostname) && allowedPorts.has(url.port)) return route.continue();
        remoteRequests.push(`${url.origin}${url.pathname}`);
        return route.abort();
      }), deadlineAt);
      page = await p181BoundedWork('Acquire original browser page', () => context.newPage(), deadlineAt);
    } catch (error) {
      acquisitionFailure = error;
      if (browser?.isConnected()) {
        try { await p181BoundedWork('Close exact partially acquired original browser', () => browser.close(), cleanupAt); }
        catch (secondary) { rememberProofFailure(error, { partialBrowserCleanupError: secondary }); }
      }
      rememberProofFailure(error, { operation: 'P181 original browser acquisition', label, deadlineAt,
        browserAcquired: !!browser, contextAcquired: !!context, pageAcquired: !!page });
      throw error;
    }
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
      async until(description, predicate, timeout = 60_000, requestedEnd) {
        const end = Math.min(absoluteDeadlineAt, requestedEnd ?? Date.now() + Math.min(timeout, 60_000)); let current;
        try {
          while (Date.now() < end) {
            current = await p181BoundedWork(description, () => observeLifecycleActor(surface), end);
            if (predicate(current)) return current;
            await p181BoundedWork('Original mounted readiness interval', () => delay(Math.min(200, p181Remaining(end))), end);
          }
          throw new Error(description);
        } catch (error) { rememberProofFailure(error, { operation: description, current, deadlineAt: end }); throw error; }
      },
      async consent(requestedEnd) {
        const end = Math.min(absoluteDeadlineAt, requestedEnd ?? Date.now() + 35_000, Date.now() + 35_000);
        const work = (label, action) => p181BoundedWork(label, action, end);
        const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
        while (!(await work('Read original consent dialog', () => waiver.isVisible())))
          await work('Wait for original consent dialog', () => delay(Math.min(100, p181Remaining(end))));
        const checks = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
        assert.equal(await work('Read original consent regulation count', () => checks.count()), 3);
        for (const check of await work('Read original consent controls', () => checks.all()))
          await work('Acknowledge original consent regulation', () => check.check({ timeout: p181Remaining(end) }));
        const acknowledge = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
        while (!(await work('Read original consent countdown', () => acknowledge.isEnabled())))
          await work('Wait for original consent countdown', () => delay(Math.min(100, p181Remaining(end))));
        await work('Accept original consent', () => acknowledge.click({ timeout: p181Remaining(end) }));
        await work('Wait for original consent dismissal', () => waiver.waitFor({ state: 'hidden', timeout: p181Remaining(end) }));
      },
      async reducedMotion(requestedEnd) {
        const end = Math.min(absoluteDeadlineAt, requestedEnd ?? Date.now() + 35_000);
        const button = page.getByRole('button', { name: /^REDUCED MOTION/i });
        if (await p181BoundedWork('Read original motion preference', () => button.isVisible(), end))
          await p181BoundedWork('Choose original motion preference', () => button.click({ timeout: p181Remaining(end) }), end);
      },
      async paintTwoFrames(requestedEnd) {
        const end = Math.min(absoluteDeadlineAt, requestedEnd ?? Date.now() + 35_000);
        await p181BoundedWork('Paint original mounted frames', () => page.evaluate(() =>
          new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))), end);
      },
      async callable(name, data, requestedEnd) {
        const end = Math.min(absoluteDeadlineAt, requestedEnd ?? Date.now() + 60_000);
        return p181BoundedWork(`Original browser SDK ${name}`, () => page.evaluate(async ({ name, data, sdkUrl }) => {
          const { functions } = await import('/src/lib/firebase.ts');
          const { httpsCallable } = await import(sdkUrl);
          try { return { status: 'committed', result: (await httpsCallable(functions(), name)(data)).data }; }
          catch (error) { return { status: 'denied', code: error.code ?? 'other' }; }
        }, { name, data, sdkUrl }), end);
      },
    };
    attachUiReceiptDiagnostics(page, { directory, label, inspectState: () => observeLifecycleActor(surface) });
    surfaces.push(surface);
    return surface;
  }
  return { launch, browsers, surfaces, pendingAcquisitions };
}

function p181AssertFunctionsBuildBinding(bindings, record, sourceHash) {
  assert.ok(Array.isArray(bindings.functionsSourceFiles) && bindings.functionsSourceFiles.length > 0);
  assert.ok(Array.isArray(bindings.compiledFiles) && bindings.compiledFiles.length > 0,
    'A complete compiled Functions manifest must exist before native actors are created.');
  assert.equal(record.compiledFileCount, bindings.compiledFiles.length);
  assert.deepEqual(record.compiledFiles, bindings.compiledFiles,
    'Bind every loaded Functions output, including transitive arrival and scout modules.');
  assert.equal(record.compiledTreeSha256, bindings.compiledTreeSha256);
  assert.equal(record.compiledTreeSha256, sourceHash(JSON.stringify(record.compiledFiles)));
  assert.equal(record.functionsSourceTreeSha256, bindings.functionsSourceTreeSha256,
    'Bind the complete Functions build inputs to the accepted current source tree.');
}

async function p181PlannedEnvironmentEvidence(configuration, checked) {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const source = await checked('Read committed public Firebase defaults', () => readFile(resolve(configuration.sourceRoot, 'src/lib/firebaseConfig.ts'), 'utf8'));
  const committed = source.match(/const committed = \{([\s\S]+?)\} satisfies FirebaseOptions;/)?.[1];
  assert.ok(committed, 'Planned P181 public defaults must remain source-backed committed literals.');
  const value = key => {
    const found = committed.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1];
    assert.ok(found, `Planned P181 public ${key} requires its committed default.`); return found;
  };
  const siteKey = source.match(/const committedAppCheckSiteKey = '([^']+)'/)?.[1];
  assert.ok(siteKey, 'Planned P181 public App Check requires its committed default.');
  const publicFirebaseDefaults = { VITE_FIREBASE_API_KEY: value('apiKey'), VITE_FIREBASE_AUTH_DOMAIN: value('authDomain'),
    VITE_FIREBASE_STORAGE_BUCKET: value('storageBucket'), VITE_FIREBASE_MESSAGING_SENDER_ID: value('messagingSenderId'),
    VITE_FIREBASE_APP_ID: value('appId'), VITE_APP_CHECK_SITE_KEY: siteKey };
  const known = new Set([...Object.keys(publicFirebaseDefaults), ...Object.keys(emulatorEnvironmentForSlot(configuration.slot)),
    'VITE_FIREBASE_PROJECT_ID', 'VITE_LOCAL_GM_ACCESS']);
  const unreviewed = new Set([...Object.keys(process.env), ...Object.keys(configuration.commands.vite.env)]
    .filter(name => name.startsWith('VITE_') && !known.has(name)));
  const dotenvFiles = [];
  for (const name of ['.env', '.env.local', '.env.emulators', '.env.emulators.local']) {
    const path = resolve(configuration.sourceRoot, name), present = existsSync(path);
    const bytes = present ? await checked('Bind existing mode dotenv metadata', () => readFile(path)) : null;
    // Names and hashes only. Explicit child values for every consumed VITE key
    // take precedence in unchanged Vite; no dotenv values or credentials escape.
    const variableNames = bytes ? [...new Set([...bytes.toString().matchAll(/^\s*(?:export\s+)?([\w.-]+)\s*=/gm)]
      .map(match => match[1]))].sort() : [];
    for (const key of variableNames) if (key.startsWith('VITE_') && !known.has(key)) unreviewed.add(key);
    dotenvFiles.push({ path, present, sha256: bytes ? hash(bytes) : null, variableNames });
  }
  return { publicFirebaseDefaults, publicDefaultsOrigin: 'src/lib/firebaseConfig.ts committed public literals',
    publicDefaultsSourceSha256: hash(source), dotenvFiles,
    dotenvPrecedence: 'Explicit child VITE environment overrides all mode dotenv files.', unreviewedViteNames: [...unreviewed].sort() };
}

/** Qualify concrete commands as inert data. The unchanged wrappers still own
 * configuration/reservation and require a separate fresh parent allocation. */
async function p181ValidatePlannedLaunch(plannedLaunch, sourceRoot, sourceCommit, checked) {
  assert.ok(plannedLaunch && typeof plannedLaunch === 'object', 'Planned P181 launch configuration is required before resource readiness.');
  const configuration = JSON.parse(JSON.stringify(plannedLaunch));
  assert.deepEqual(Object.keys(configuration).sort(), ['schemaVersion', 'referenceInterval', 'sourceRoot', 'sourceCommit', 'slot',
    'projectId', 'baseUrl', 'ports', 'evidenceDirectory', 'runtimeLaunchRecord', 'allocationStartedAtMs', 'allocationDeadlineMs',
    'firebaseAliasPath', 'coordinationFile', 'expectedServedEnvironment', 'commands'].sort(), 'Planned P181 launch must use the exact concrete schema.');
  assert.equal(configuration.schemaVersion, 1); assert.equal(configuration.referenceInterval, true,
    'Planned P181 timestamps are reference data, never allocation authority.');
  assert.equal(resolve(configuration.sourceRoot), sourceRoot, 'Planned P181 source root must be the exact candidate.');
  assert.equal(configuration.sourceCommit, sourceCommit, 'Planned P181 source commit must be the exact candidate.');
  const { slot, projectId, baseUrl, ports, evidenceDirectory, runtimeLaunchRecord } = configuration;
  assert.ok(Number.isSafeInteger(slot) && slot >= 5 && slot <= 14, 'Planned P181 launch must use a canonical non-retained slot5–14.');
  assert.match(projectId ?? '', /^demo-[a-z0-9-]{3,64}$/, 'Planned P181 project must be the original local demo project.');
  assert.deepEqual(ports, emulatorPortsForSlot(slot), 'Planned P181 canonical emulator ports must use the original slot.');
  assert.equal(baseUrl, `http://127.0.0.1:${vitePortForSlot(slot)}`, 'Planned P181 canonical Vite URL/port and loopback host required.');
  assert.ok(evidenceDirectory?.startsWith('/tmp/') && resolve(evidenceDirectory) === evidenceDirectory,
    'Planned P181 launch requires an absolute owned /tmp evidence directory.');
  assert.ok(runtimeLaunchRecord?.startsWith(`${evidenceDirectory}/`) && resolve(runtimeLaunchRecord) === runtimeLaunchRecord,
    'Planned P181 runtime launch record must remain in its exact evidence tree.');
  assert.ok(Number.isSafeInteger(configuration.allocationStartedAtMs) && Number.isSafeInteger(configuration.allocationDeadlineMs) &&
    configuration.allocationDeadlineMs - configuration.allocationStartedAtMs === P181_NATIVE_TIMING.totalAllocationMs,
    'Planned P181 original 26-minute reference interval must not be renewed.');
  const canonicalCoordination = coordinationFilePath(process.env);
  assert.equal(configuration.coordinationFile, canonicalCoordination, 'Planned P181 coordination must use the existing shared ledger path.');
  assert.ok(existsSync(canonicalCoordination), 'Planned P181 canonical coordination path must already exist.');
  const commands = configuration.commands;
  assert.deepEqual(Object.keys(commands ?? {}).sort(), ['configure', 'emulators', 'vite', 'proof'].sort(), 'Planned P181 requires exactly four existing commands.');
  const expectedArgs = {
    configure: ['scripts/configure-emulator-slot.mjs', String(slot)],
    emulators: ['scripts/run-emulator-command.mjs', 'start', '--project', projectId, '--only', 'auth,functions,firestore'],
    vite: ['scripts/run-emulator-command.mjs', 'vite', '--host', '127.0.0.1', '--strictPort'],
    proof: ['scripts/pc10-starlight-movement-scout-ui-proof.mjs'],
  };
  const expectedHosts = { FIRESTORE_EMULATOR_HOST: `127.0.0.1:${ports.firestore}`, FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${ports.auth}` };
  for (const [name, expected] of Object.entries(expectedHosts)) assert.ok(!process.env[name] || process.env[name] === expected,
    `Planned P181 inherited ${name} emulator host conflicts with the original slot.`);
  for (const [stage, command] of Object.entries(commands)) {
    assert.deepEqual(Object.keys(command).sort(), ['node', 'argv', 'cwd', 'env'].sort(), `Planned P181 ${stage} command record required.`);
    assert.equal(command.node, process.execPath, `Planned P181 ${stage} must use this absolute Node executable.`);
    assert.ok(command.node.startsWith('/')); assert.equal(resolve(command.cwd), sourceRoot, `Planned P181 ${stage} cwd must match the original source.`);
    assert.deepEqual(command.argv, expectedArgs[stage], `Planned P181 ${stage} must reuse its exact supported command and arguments.`);
    const env = command.env;
    assert.ok(env && typeof env === 'object' && !Array.isArray(env), `Planned P181 ${stage} full environment required.`);
    assert.ok(Object.values(env).every(value => typeof value === 'string'), `Planned P181 ${stage} environment values must be explicit strings.`);
    assert.equal(env.HOME, process.env.HOME, `Planned P181 ${stage} must preserve ordinary HOME/configstore.`);
    assert.equal(env.PATH, process.env.PATH ?? '', `Planned P181 ${stage} must preserve current installed resolver PATH.`);
    for (const name of ['XDG_CONFIG_HOME', 'TMPDIR']) assert.equal(env[name], process.env[name], `Planned P181 ${stage} must preserve ordinary ${name}.`);
    for (const name of ['CI', 'NODE_OPTIONS', 'NODE_PATH', 'TICKER_SMOKE_CACHE_DIR', 'BROWSER', 'BROWSER_ARGS', 'DEBUG']) {
      assert.equal(env[name], '', `Planned P181 ${stage} ${name} must be explicitly empty; no registry fallback, hooks or unowned cache/browser/debug.`);
    }
    assert.equal(env.NO_UPDATE_NOTIFIER, '1', `Planned P181 ${stage} must disable the update notifier.`);
    for (const [name, expected] of Object.entries(expectedHosts)) assert.equal(env[name], expected, `Planned P181 ${stage} ${name} emulator host required.`);
    for (const name of ['CODEX_COORDINATION_FILE', 'DOW_EMULATOR_COORDINATION_FILE']) {
      assert.ok(typeof env[name] === 'string' && env[name].startsWith('/'), `Planned P181 ${stage} requires explicit ${name}.`);
      assert.equal(coordinationFilePath({ [name]: env[name] }), canonicalCoordination, `Planned P181 ${stage} ${name} must resolve to the same shared ledger.`);
    }
  }
  assert.equal(commands.vite.env.NODE_ENV, 'development', 'Planned P181 Vite NODE_ENV must explicitly be development.');
  const plannedViteSource = `import.meta.env = ${JSON.stringify({ ...commands.vite.env, DEV: configuration.expectedServedEnvironment?.DEV })};\n`;
  checkServedEnvironment(plannedViteSource, { baseUrl, projectId, ports });
  assert.deepEqual(localGmAccessConfiguration('serve', commands.vite.env), { projectId, authPort: ports.auth, firestorePort: ports.firestore });
  assert.equal(commands.vite.env.VITE_DEV_SERVER_PORT, String(vitePortForSlot(slot)), 'Planned P181 canonical Vite port required.');
  const environment = await p181PlannedEnvironmentEvidence(configuration, checked);
  for (const [name, value] of Object.entries(environment.publicFirebaseDefaults)) assert.equal(commands.vite.env[name], value,
    `Planned P181 public ${name} must explicitly use its committed default.`);
  const expectedVite = { ...environment.publicFirebaseDefaults, ...emulatorEnvironmentForSlot(slot), VITE_FIREBASE_PROJECT_ID: projectId, VITE_LOCAL_GM_ACCESS: '1' };
  for (const [name, value] of Object.entries(expectedVite)) assert.equal(commands.vite.env[name], value, `Planned P181 canonical ${name} required.`);
  assert.deepEqual(configuration.expectedServedEnvironment, { ...expectedVite, DEV: true }, 'Planned P181 expected served environment must match all consumed client settings.');
  const proofEnv = { P181_RUNTIME_ALLOCATED: 'yes', P181_SOURCE_ROOT: configuration.sourceRoot, P181_SOURCE_COMMIT: sourceCommit,
    P181_PROJECT: projectId, P181_UI_URL: baseUrl, P181_PORTS_JSON: JSON.stringify({ auth: ports.auth, functions: ports.functions, firestore: ports.firestore }),
    P181_EVIDENCE_DIRECTORY: evidenceDirectory, P181_RUNTIME_LAUNCH_RECORD: runtimeLaunchRecord,
    P181_ALLOCATION_STARTED_AT_MS: String(configuration.allocationStartedAtMs), P181_ALLOCATION_DEADLINE_MS: String(configuration.allocationDeadlineMs) };
  for (const [name, value] of Object.entries(proofEnv)) assert.equal(commands.proof.env[name], value, `Planned P181 proof ${name} must retain the exact original tuple.`);
  assert.equal(commands.emulators.env.FIREBASE_DEBUG_PATH, resolve(evidenceDirectory, 'firebase-debug.log'), 'Planned P181 Firebase debug output must use its owned evidence tree.');
  const common = ['HOME', 'PATH', 'XDG_CONFIG_HOME', 'TMPDIR', 'CI', 'NODE_OPTIONS', 'NODE_PATH', 'TICKER_SMOKE_CACHE_DIR', 'BROWSER', 'BROWSER_ARGS', 'DEBUG',
    'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'NO_UPDATE_NOTIFIER', 'CODEX_COORDINATION_FILE', 'DOW_EMULATOR_COORDINATION_FILE'];
  for (const [stage, command] of Object.entries(commands)) {
    const allowed = new Set([...common, ...(stage === 'proof' ? Object.keys(proofEnv) : []), ...(stage === 'emulators' ? ['FIREBASE_DEBUG_PATH'] : []), ...(stage === 'vite' ? ['NODE_ENV'] : [])]);
    assert.ok(Object.keys(command.env).every(name => allowed.has(name) || (stage === 'vite' && name.startsWith('VITE_'))),
      `Planned P181 ${stage} full environment must contain only the concrete reviewed settings.`);
  }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const nodeExecutable = await checked('Bind original Node executable path', () => realpath(process.execPath));
  const nodeExecutableSha256 = hash(await checked('Bind original Node executable bytes', () => readFile(nodeExecutable)));
  const args = ['emulators:start', '--config', resolve(sourceRoot, 'firebase.local.json'), '--project', projectId, '--only', 'auth,functions,firestore'];
  const invocation = await checked('Resolve installed pinned Firebase metadata only', () => resolveFirebaseToolsInvocation(args,
    { repository: sourceRoot, searchPath: commands.emulators.env.PATH, nodeExecutable: process.execPath, allowRegistryFallback: false }));
  assert.equal(invocation.command, process.execPath); assert.equal(invocation.packageVersion, '15.29.0'); assert.equal(invocation.registryResolution, false);
  assert.ok(configuration.firebaseAliasPath?.startsWith('/'), 'Planned P181 installed Firebase alias must be absolute.');
  const executablePath = await checked('Bind original installed Firebase entry', () => realpath(invocation.args[0]));
  assert.equal(await checked('Bind original Firebase PATH alias', () => realpath(configuration.firebaseAliasPath)), executablePath,
    'Planned P181 installed Firebase alias must match the unchanged resolver entry.');
  const installedFirebase = { aliasPath: configuration.firebaseAliasPath, executablePath,
    entrySha256: hash(await checked('Bind installed Firebase entry bytes', () => readFile(executablePath))),
    packagePath: invocation.packagePath, packageSha256: hash(await checked('Bind installed Firebase package metadata bytes', () => readFile(invocation.packagePath))),
    packageVersion: invocation.packageVersion, registryResolution: false, command: invocation.command, argv: invocation.args };
  const vitePackagePath = await checked('Resolve original local Vite metadata', () => realpath(resolve(sourceRoot, 'node_modules/vite/package.json')));
  const vitePackageBytes = await checked('Read original local Vite metadata', () => readFile(vitePackagePath));
  const vitePackage = JSON.parse(vitePackageBytes), lockedVite = JSON.parse(await checked('Read original locked Vite input', () => readFile(resolve(sourceRoot, 'package-lock.json')))).packages['node_modules/vite'];
  assert.equal(vitePackage.name, 'vite'); assert.equal(vitePackage.version, lockedVite.version); assert.equal(vitePackage.bin.vite, 'bin/vite.js');
  const viteEntry = await checked('Resolve original local Vite entry', () => realpath(resolve(sourceRoot, 'node_modules/vite/bin/vite.js')));
  assert.equal(await checked('Bind original local Vite alias', () => realpath(resolve(sourceRoot, 'node_modules/.bin/vite'))), viteEntry);
  const installedVite = { packagePath: vitePackagePath, packageVersion: vitePackage.version, packageSha256: hash(vitePackageBytes),
    executablePath: viteEntry, entrySha256: hash(await checked('Bind original local Vite entry bytes', () => readFile(viteEntry))),
    localNoInstall: true, wrapperArguments: ['--no-install', 'vite', '--mode', 'emulators', ...commands.vite.argv.slice(2)] };
  return { configuration, allocationAuthority: false, nodeExecutable, nodeExecutableSha256, installedFirebase, installedVite, environment };
}

/** Reuse the actual canonical source tests and original complete build bytes
 * before allocation. Live served-source verification remains a native gate. */
async function p181SourceOnlyPreflight(options) {
  const issuedAt = Date.now(), requestedEnd = options.sourceOnlyDeadlineMs;
  assert.ok(Number.isSafeInteger(requestedEnd) && requestedEnd > issuedAt,
    'Original finite source-only deadline expired or was not issued.');
  const deadlineAt = Math.min(requestedEnd, issuedAt + 60_000);
  const checked = (label, action) => p181BoundedWork(label, action, deadlineAt);
  const sourceRoot = resolve(options.sourceRoot ?? process.cwd());
  const sourceEntry = await checked('Read exact source-only checkout', () => realpath(new URL('..', import.meta.url)));
  assert.equal(await checked('Resolve exact source-only checkout', () => realpath(sourceRoot)), sourceEntry,
    'Source-only preflight must use this exact isolated checkout.');
  const git = (root, args) => {
    const value = execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: p181Remaining(deadlineAt) }).trim();
    p181Remaining(deadlineAt); return value;
  };
  const sourceCommit = git(sourceRoot, ['rev-parse', 'HEAD']);
  assert.equal(sourceCommit, options.sourceCommit, 'Source-only candidate must match the exact parent source commit.');
  assert.equal(git(sourceRoot, ['status', '--porcelain', '--untracked-files=no']), '',
    'Source-only preflight requires the exact committed source candidate.');
  const validatedPlannedLaunch = await p181ValidatePlannedLaunch(options.plannedLaunch, sourceRoot, sourceCommit, checked);
  assert.equal(existsSync(resolve(sourceRoot, 'src/lib/demoActorContext.ts')), true,
    'The published ordinary App observer must consume the actual null-profile module.');
  assert.ok(options.buildBindingPath?.startsWith('/tmp/') && /^[a-f0-9]{64}$/.test(options.buildBindingSha256 ?? ''),
    'Use the exact parent-approved immutable build binding and digest.');
  const sourceHash = value => createHash('sha256').update(value).digest('hex');
  const recordBytes = await checked('Read original complete build binding', () => readFile(options.buildBindingPath));
  assert.equal(sourceHash(recordBytes), options.buildBindingSha256);
  const buildRecord = JSON.parse(recordBytes);
  assert.ok(buildRecord.sourceRoot?.startsWith('/private/tmp/') || buildRecord.sourceRoot?.startsWith('/tmp/'));
  const buildRoot = await checked('Resolve original retained build mapping', () => realpath(buildRecord.sourceRoot));
  const complete = root => captureP181SourceBindings(root, { buildRoot, completeInputs: true, deadlineAt });
  const sourceBindings = await checked('Bind complete candidate source and retained build bytes', () => complete(sourceRoot));
  const retainedBindings = await checked('Verify original retained build source provenance', () => complete(buildRoot));
  assert.equal(retainedBindings.sourceCommit, buildRecord.sourceCommit);
  assert.equal(retainedBindings.sourceTree, buildRecord.sourceTree);
  assert.equal(git(buildRoot, ['status', '--porcelain', '--untracked-files=no']), '',
    'Retained build provenance must remain the original committed source.');
  assert.equal(buildRecord.trackedFileCount, buildRecord.trackedFiles.length);
  assert.equal(sourceHash(JSON.stringify(buildRecord.trackedFiles)), buildRecord.trackedSourceManifestSha256);
  assert.deepEqual(retainedBindings.trackedFiles, buildRecord.trackedFiles,
    'Every retained tracked build input must match its original source receipt.');
  assert.deepEqual(sourceBindings.trackedFiles.map(value => value.path), buildRecord.trackedFiles.map(value => value.path));
  const proofOnlyPaths = new Set([
    'scripts/pc10-starlight-movement-scout-ui-proof.mjs',
    'scripts/pc10-starlight-movement-scout-ui-proof-runner.test.mjs',
    'scripts/pc10-member-gm-lifecycle-ui-proof.mjs',
    'scripts/qualification/pc11-live-base-contract.test.mjs',
    'scripts/qualification/pc11-three-actor-trade-philia.test.mjs',
  ]);
  const originalInputs = new Map(buildRecord.trackedFiles.map(value => [value.path, value.sha256]));
  for (const { path, sha256 } of sourceBindings.trackedFiles) {
    if (!proofOnlyPaths.has(path)) assert.equal(sha256, originalInputs.get(path),
      `Reused build requires the exact original tracked input ${path}.`);
  }
  assert.deepEqual(sourceBindings.functionsSourceFiles, buildRecord.functionsSourceFiles,
    'Every Functions build input must match the original accepted build.');
  p181AssertFunctionsBuildBinding(sourceBindings, buildRecord, sourceHash);
  assert.equal(sourceBindings.compiledFiles.find(([path]) => path === 'index.js')?.[1], buildRecord.builtFunctionsSha256);
  assert.ok(sourceBindings.frontendFiles.length > 0, 'The complete original client build must be present.');
  assert.equal(sourceBindings.frontendFiles.length, buildRecord.frontendFileCount);
  assert.deepEqual(sourceBindings.frontendFiles, buildRecord.frontendFiles, 'Every original frontend build output must match.');
  assert.equal(sourceBindings.frontendTreeSha256, buildRecord.frontendTreeSha256);
  assert.equal(sourceHash(JSON.stringify(buildRecord.frontendFiles)), buildRecord.frontendTreeSha256);
  assert.equal(buildRecord.trackedSourceUnchangedAcrossBuilds, true);
  assert.ok(Number.isSafeInteger(buildRecord.allBuildsCompletedAtMs) && buildRecord.allBuildsCompletedAtMs <= Date.now());
  assert.equal(Object.keys(buildRecord.buildReceipts).length, 2);
  for (const receipt of Object.values(buildRecord.buildReceipts)) {
    assert.equal(receipt.sourceCommit, buildRecord.sourceCommit); assert.equal(receipt.sourceTree, buildRecord.sourceTree);
    assert.equal(receipt.exitCode, 0); assert.ok(receipt.completedAtMs <= buildRecord.allBuildsCompletedAtMs);
    assert.equal(sourceHash(await checked('Verify original build command receipt', () => readFile(receipt.path))), receipt.sha256);
    assert.equal(sourceHash(await checked('Verify original build log', () => readFile(receipt.log))), receipt.logSha256);
  }
  // The unchanged canonical runner has a fixed 15s synchronous child cutoff.
  // Admit it only when that entire existing cutoff fits the original residual.
  assert.ok(p181Remaining(deadlineAt) >= 15_000,
    'Original finite source-only deadline cannot contain the canonical preflight cutoff.');
  const sourceContractPreflight = await checked('Run actual canonical source contract preflight', () => runPc11ContractPreflight(sourceRoot));
  const after = await checked('Rebind exact source and build after canonical preflight', () => complete(sourceRoot));
  assert.deepEqual(after, sourceBindings, 'Source-only preflight must retain the exact candidate and original build bytes.');
  assert.equal(git(sourceRoot, ['rev-parse', 'HEAD']), sourceCommit);
  assert.equal(git(sourceRoot, ['status', '--porcelain', '--untracked-files=no']), '');
  const { installedFirebase, installedVite, nodeExecutable, nodeExecutableSha256 } = validatedPlannedLaunch;
  for (const [path, expected] of [[nodeExecutable, nodeExecutableSha256], [installedFirebase.executablePath, installedFirebase.entrySha256],
    [installedFirebase.packagePath, installedFirebase.packageSha256], [installedVite.executablePath, installedVite.entrySha256], [installedVite.packagePath, installedVite.packageSha256]]) {
    assert.equal(sourceHash(await checked('Rebind exact installed executable/package metadata', () => readFile(path))), expected);
  }
  assert.equal(await checked('Rebind exact installed Firebase alias', () => realpath(installedFirebase.aliasPath)), installedFirebase.executablePath);
  assert.equal(await checked('Rebind exact local Vite alias', () => realpath(resolve(sourceRoot, 'node_modules/.bin/vite'))), installedVite.executablePath);
  assert.deepEqual(await p181PlannedEnvironmentEvidence(validatedPlannedLaunch.configuration, checked), validatedPlannedLaunch.environment,
    'Planned P181 consumed public defaults and dotenv metadata must remain exact through qualification.');
  p181Remaining(deadlineAt);
  return { status: 'P181_SOURCE_ONLY_PREFLIGHT_PASS', sourceCommit, sourceBindings, sourceContractPreflight,
    validatedPlannedLaunch, plannedLaunchSha256: sourceHash(JSON.stringify(validatedPlannedLaunch)),
    plannedLaunchLimitations: validatedPlannedLaunch.environment.unreviewedViteNames.length
      ? ['Any unreviewed VITE names remain launch limitations requiring parent review.'] : [],
    buildProvenance: { sourceRoot: buildRoot, sourceCommit: buildRecord.sourceCommit, sourceTree: buildRecord.sourceTree,
      bindingPath: options.buildBindingPath, bindingSha256: options.buildBindingSha256,
      compiledFileCount: buildRecord.compiledFileCount, frontendFileCount: buildRecord.frontendFileCount,
      allBuildsCompletedAtMs: buildRecord.allBuildsCompletedAtMs, builtHere: false },
    sourceOnlyDeadlineMs: requestedEnd, effectiveDeadlineMs: deadlineAt, measuredAtMs: Date.now(),
    browserProcesses: 0, sdkClients: 0, networkRequests: 0, runtimeProof: false,
    nativeCredit: 0, releaseCredit: 0, liveServedVerificationRequired: true };
}

/**
 * Complete ordinary two-actor browser scenario. The allocation must be issued
 * by the parent before this function is called. Nothing in this module starts
 * an App, emulator, build, CLI probe, or server. `runtime` is the parent's
 * already-launched local-only App/SDK boundary; Chrome, Auth, setup, role
 * selection, start, movement and scouting are driven through the real UI.
 */
export async function runP181StarlightMovementScoutNative(options = {}) {
  if (options.sourceOnly === true) return p181SourceOnlyPreflight(options);
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

  const totalEnd = options.allocationDeadlineMs ?? Number(process.env.P181_ALLOCATION_DEADLINE_MS);
  const issuedStart = options.allocationStartedAtMs ?? process.env.P181_ALLOCATION_STARTED_AT_MS;
  const startAt = issuedStart === undefined || issuedStart === null
    ? totalEnd - P181_NATIVE_TIMING.totalAllocationMs : Number(issuedStart);
  assert.ok(Number.isSafeInteger(startAt) && Number.isFinite(totalEnd) &&
    totalEnd - startAt >= P181_NATIVE_TIMING.totalAllocationMs,
  'P181 requires the parent issued 26-minute allocation, including native operations, owned cleanup and independent verification.');
  assert.ok(startAt <= Date.now() && Date.now() < totalEnd,
    'Use the original absolute parent allocation interval, including startup time already consumed.');
  const proofStopAt = totalEnd - P181_NATIVE_TIMING.proofStopReserveMs;
  const cleanupDeadlineAt = totalEnd - P181_NATIVE_TIMING.parentIndependentVerificationReserveMs;
  const browserLaunchDeadlineAt = startAt + P181_NATIVE_TIMING.latestBrowserLaunchMs;
  assert.ok(Date.now() < proofStopAt,
    'The original proof stop has passed; preserve the fixed cleanup and parent verification reserves.');
  const preflightDeadlineAt = Math.min(proofStopAt, Date.now() + 60_000);
  const preflight = (label, action) => p181BoundedWork(label, action, preflightDeadlineAt);
  const sourceEntry = await preflight('Read original source checkout', () => realpath(new URL('..', import.meta.url)));
  assert.equal(await preflight('Resolve original source root', () => realpath(sourceRoot)), sourceEntry, 'The parent must run the exact isolated source checkout.');
  assert.equal(existsSync(resolve(sourceRoot, 'src/lib/demoActorContext.ts')), true,
    'The ordinary App observer may inspect the null demo profile but must never use a demo actor.');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  assert.equal(sourceCommit, process.env.P181_SOURCE_COMMIT,
    'Runtime launch and checked source must use the parent-provided exact source commit.');
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'],
    { cwd: sourceRoot, encoding: 'utf8' }).trim(), '', 'Native source must be the committed P181 source candidate.');
  const launchRecordPath = process.env.P181_RUNTIME_LAUNCH_RECORD;
  assert.ok(launchRecordPath?.startsWith('/tmp/'), 'Read the exact parent-issued isolated runtime launch record.');
  const launchRecord = JSON.parse(await preflight('Read original runtime launch record', () => readFile(launchRecordPath, 'utf8')));
  assert.equal(launchRecord.sourceCommit, sourceCommit);
  assert.equal(await preflight('Resolve original launch source root', () => realpath(launchRecord.sourceRoot)), sourceEntry);
  assert.equal(launchRecord.projectId, projectId);
  assert.deepEqual(launchRecord.ports, ports);
  assert.equal(launchRecord.baseUrl, baseUrl);
  assert.equal(launchRecord.functionsBuiltBeforeLaunch, true);
  assert.equal(launchRecord.processCwdsVerified, true);

  await preflight('Create original private native evidence directory', () => mkdir(directory, { recursive: true, mode: 0o700 }));
  const sourceContractPreflight = runPc11ContractPreflight(sourceRoot);
  const sourceBindingsBefore = await preflight('Bind original source and complete compiled manifest', () => captureP181SourceBindings(sourceRoot));
  const sourceHash = value => createHash('sha256').update(value).digest('hex');
  const hashShort = value => uidHash(value);
  const remoteRequests = [], pageErrors = [], calls = [], requests = [], browsers = [], surfaces = [];
  const sourceRuntimeText = await preflight('Read original served Firebase runtime source', async () => (await fetch(`${baseUrl}/src/lib/firebaseConfig.ts`,
    { signal: AbortSignal.timeout(Math.min(5_000, p181Remaining(preflightDeadlineAt))) })).text());
  const runtime = validateProofRuntime(proofRuntimeFromViteSource(sourceRuntimeText), { baseUrl, projectId, ports });
  await preflight('Qualify original served local GM environment', () => checkServedEnvironment(sourceRuntimeText, { baseUrl, projectId, ports }));
  assert.equal(sourceHash(await preflight('Read original compiled Functions entrypoint', () => readFile(resolve(sourceRoot, 'functions/lib/index.js')))),
    launchRecord.builtFunctionsSha256, 'The loaded emulator entrypoint must match the pre-launch build record.');
  assert.equal(launchRecord.functionsBuiltBeforeLaunch, true);
  p181AssertFunctionsBuildBinding(sourceBindingsBefore, launchRecord, sourceHash);
  assert.ok(Number.isSafeInteger(launchRecord.buildCompletedAtMs) &&
    Number.isSafeInteger(launchRecord.runtimeStartedAtMs));
  assert.ok(launchRecord.buildCompletedAtMs < launchRecord.runtimeStartedAtMs,
    'The accepted Functions build must finish before the runtime starts.');
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
    const response = await preflight(`Read original served ${path} headers`, () => fetch(`${baseUrl}/${path}?raw`,
      { signal: AbortSignal.timeout(Math.min(5_000, p181Remaining(preflightDeadlineAt))) }));
    assert.equal(response.status, 200, `The local App must serve the exact ${path} source.`);
    assert.equal(sourceHash(await preflight(`Read original served ${path} body`, () => response.text())),
      sourceHash(await preflight(`Read original checked ${path}`, () => readFile(resolve(sourceRoot, path), 'utf8'))),
      `The mounted App must match the committed ${path} source.`);
  }
  p181NativePassedPreflight.add(options);
  let gm, wingCommander, sessionId, joinCode, creationRequestId, startRequestId, gmInstanceId, gmClaimedAt;
  let ownedRequestTracker, wingAdmissionTracker, requestTrackerError;
  const originalCreate = { dispatched: false, responseSettled: false, transportPending: false };
  const pendingOriginalIdentities = [];
  const ownedAuthUids = new Map();
  let originalGmClaimActor;
  let cleanupPromise, cleanupResult, firstError, proofResult;
  let privateFailureArtifact = null;
  const cleanupFailures = [];
  const trace = [];
  const operationDeadline = () => Math.min(proofStopAt, Date.now() + P181_NATIVE_TIMING.operationTimeoutMs);
  const bounded = async (label, operation, deadlineAt = cleanupDeadlineAt, hold = () => {}) => {
    const budget = deadlineAt - Date.now();
    assert.ok(budget > 0, `${label}: original finite P181 deadline expired.`);
    let timer, delivered;
    try {
      const result = await Promise.race([Promise.resolve().then(() => {
        assert.ok(Date.now() < deadlineAt, `${label}: original finite P181 deadline expired.`);
        return operation();
      }).then(value => { delivered = value; hold(value); return value; }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: original finite P181 deadline expired.`)), budget);
      })]);
      assert.ok(Date.now() < deadlineAt, `${label}: result arrived after the original finite P181 deadline.`);
      return result;
    } catch (error) {
      rememberProofFailure(error, { operation: label, deadlineAt, delivered });
      throw error;
    } finally { clearTimeout(timer); }
  };
  let adminRequire, db, authAdmin, adminApp, factory;
  const normalPreparationDiagnostic = { activeAwaitedOperation: null };
  const retainFirstFailure = async (error, { deadlineAt = cleanupDeadlineAt } = {}) => {
    if (privateFailureArtifact) return privateFailureArtifact;
    const normalPreparation = { activeAwaitedOperation: normalPreparationDiagnostic.activeAwaitedOperation };
    if (normalPreparation.activeAwaitedOperation ===
        'Original Wing Commander normal role chooser/seat claim' &&
        typeof wingCommander?.page?.screenshot === 'function') {
      const diagnosticDeadlineAt = Math.min(deadlineAt, cleanupDeadlineAt, Date.now() + 5_000);
      try {
        const screenshot = await bounded('Capture original Wing Commander station readiness screenshot',
          () => wingCommander.page.screenshot({
            timeout: Math.max(1, Math.min(5_000, diagnosticDeadlineAt - Date.now())),
          }), diagnosticDeadlineAt);
        const path = resolve(directory, 'p181-normal-preparation-failure.png');
        await bounded('Save original Wing Commander station readiness screenshot',
          () => writeFile(path, screenshot, { flag: 'wx', mode: 0o600 }), diagnosticDeadlineAt);
        normalPreparation.screenshot = { path, sha256: createHash('sha256').update(screenshot).digest('hex') };
      } catch (screenshotError) {
        normalPreparation.screenshotError = screenshotError;
      }
    }
    // These are already-held facts. Freeze the original private disk record
    // before any owned teardown, including teardown begun by the UI wrapper.
    rememberProofFailure(error, { sourceCommit,
      sourceBindingsBefore: sourceBindingsBefore?.sourceFiles ?? null,
      heldReceipts: trace, heldRemoteRequests: remoteRequests, heldPageErrors: pageErrors,
      heldOriginalCreate: { ...originalCreate }, normalPreparationDiagnostic: normalPreparation });
    try {
      privateFailureArtifact = await bounded('Retain original native failure before owned teardown',
        () => retainProofFailure(directory, 'p181-native-primary', error, {
          sourceCommit, sourceBindingsBefore, receipts: trace, remoteRequests, pageErrors,
          heldOriginalCreate: { ...originalCreate }, normalPreparationDiagnostic: normalPreparation,
        }), Math.min(deadlineAt, cleanupDeadlineAt, Date.now() + 60_000));
    } catch (retentionError) {
      privateFailureArtifact = { evidenceWriteFailed: true };
      rememberProofFailure(error, { nativeFailureRetentionError: retentionError });
    }
    return privateFailureArtifact;
  };
  const previousFirestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const previousAuthEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  async function awaitOriginalIdentityCaptures(deadlineAt) {
    const results = await bounded('Original admission Auth ownership capture',
      () => Promise.all(pendingOriginalIdentities), deadlineAt);
    const failed = results.find(value => value?.error);
    if (failed) throw failed.error;
    if (requestTrackerError) throw requestTrackerError;
  }
  const cleanupOwnedResources = async ({ firstError: _firstError, deadlineAt }) => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      // The unchanged receipt/recovery helpers receive this owner's original
      // finite read/transaction fence. A late get cannot continue into deletion.
      const scopedDb = end => {
        const originals = new WeakMap();
        const wrap = ref => {
          const guarded = new Proxy(ref, { get(target, key) {
            if (key === 'get') return () => bounded('Read exact owned cleanup record', () => target.get(), end);
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          } });
          originals.set(guarded, ref); return guarded;
        };
        return new Proxy(db, { get(target, key) {
          if (key === 'doc') return path => wrap(target.doc(path));
          if (key === 'runTransaction') return callback => bounded('Exact owned cleanup transaction', () =>
            target.runTransaction(tx => callback({
              get: ref => bounded('Read exact owned cleanup transaction record', () => tx.get(originals.get(ref) ?? ref), end),
              delete: ref => {
                assert.ok(Date.now() < end, 'Original owned cleanup transaction deadline expired.');
                tx.delete(originals.get(ref) ?? ref);
              },
            })), end);
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      };
      const cleanup = { browsersClosed: 0, sessionAbsent: false, joinCodeAbsent: false,
        ownedMembershipPointersAbsent: false, deletedFreshAuthIdentities: 0, remoteRequests: remoteRequests.length,
        errors: [] };
      const step = async (name, action) => {
        const end = Math.min(deadlineAt, Date.now() + 60_000);
        try { return await bounded(`P181 cleanup ${name}`, () => action(end), end); }
        catch (error) {
          cleanupFailures.push({ step: name, error });
          if (_firstError) rememberProofFailure(_firstError, { secondaryCleanupFailure: { step: name, error } });
          cleanup.errors.push({ step: name, error: safeP181Error(error) });
          return null;
        }
      };
      await step('finish original create/start request ownership observer', async () => {
        ownedRequestTracker?.finish();
        wingAdmissionTracker?.finish();
      });
      await step('settle original Auth admission ownership observers', async end => {
        await awaitOriginalIdentityCaptures(end);
      });
      if (factory?.pendingAcquisitions?.size) await step('settle original browser acquisitions within the fixed cleanup reserve', () =>
        Promise.allSettled([...factory.pendingAcquisitions]));
      await step('settle and close the exact owned browser processes', async end => {
        await Promise.all(browsers.map(async browser => {
          assert.ok(Date.now() < end, 'Original owned browser cleanup deadline expired.');
          if (browser.isConnected()) await browser.close();
          assert.equal(browser.isConnected(), false);
          cleanup.browsersClosed++;
        }));
        assert.equal(cleanup.browsersClosed, browsers.length);
      });
      if (!db && (sessionId || creationRequestId)) {
        cleanup.errors.push({ step: 'recover owned session after provider acquisition failure',
          error: { name: 'Error', message: 'Firestore owner is unavailable for the exact original session receipt.' } });
      }
      if (db && !sessionId && identifier(creationRequestId) && ownedAuthUids.has('gm')) {
        await step('recover only the exact original normal create scope', async end => {
          sessionId = await recoverPc11CreatedSession({ db: scopedDb(end), uid: ownedAuthUids.get('gm'), requestId: creationRequestId });
          if (sessionId == null) {
            assert.equal(originalCreate.dispatched, true);
            assert.equal(originalCreate.requestId, creationRequestId);
            assert.equal(originalCreate.responseRequestId, creationRequestId);
            assert.equal(originalCreate.responseSettled, true, 'A pending original create cannot prove absent scope.');
            assert.equal(originalCreate.transportPending, false);
            assert.ok(originalCreate.httpStatus >= 400 && originalCreate.body?.error && !originalCreate.body?.result,
              'Only the settled rejected original create response permits no-commit cleanup.');
            const uid = ownedAuthUids.get('gm');
            const absence = await Promise.all([
              db.doc(`sessionCreationRequests/${uid}_${creationRequestId}`).get(),
              db.doc(`activeMemberships/${uid}`).get(), db.doc(`gmAccess/${uid}`).get(),
              db.collection('sessions').get(),
              db.collectionGroup('players').where('connected', '==', true).get(),
              db.collectionGroup('gmInstances').where('connected', '==', true).get(),
            ]);
            assert.ok(absence.slice(0, 3).every(value => !value.exists),
              'The exact rejected create has no original receipt, membership or GM access.');
            assert.deepEqual(absence.slice(3).map(value => value.size), [0, 0, 0],
              'No pending or late original gameplay commit may remain before exact fresh Auth deletion.');
            assert.equal(cleanup.browsersClosed, browsers.length);
            assert.ok(Date.now() < end, 'Original rejected-create absence proof deadline expired.');
            cleanup.rejectedCreateAbsentProof = { requestFingerprint: fingerprint({ requestId: creationRequestId, uidHash: hashShort(uid) }),
              settledRejectedResponse: true, originalReceiptAbsent: true, originalMembershipAbsent: true, gameplayScopeAbsent: true };
          } else assert.ok(identifier(sessionId), 'The exact original create receipt must resolve to an owned session ID.');
        });
      }
      if (db && sessionId && ownedAuthUids.has('gm')) {
        if (!identifier(creationRequestId)) {
          cleanup.errors.push({ step: 'verify original create ownership before session cleanup',
            error: { name: 'Error', message: 'Original create request ID is absent; refuse session cleanup.' } });
        } else {
        const heldCreationProof = await step('hold exact original normal create ownership before deletion', async () => {
          const ref = db.doc(`sessionCreationRequests/${ownedAuthUids.get('gm')}_${creationRequestId}`);
          const creation = await ref.get();
          assert.equal(creation.exists, true, 'The original create ownership proof must exist before deleting its session.');
          assert.equal(creation.get('requestId'), creationRequestId);
          assert.equal(creation.get('sessionId'), sessionId);
          assert.equal(creation.get('fingerprint')?.actorUid, ownedAuthUids.get('gm'));
          assert.equal(creation.get('fingerprint')?.requestId, creationRequestId);
          return { ref, requestId: creationRequestId, sessionId, actorUid: ownedAuthUids.get('gm') };
        });
        if (heldCreationProof) await step('remove only the original confirmed join-code pointer', async end => {
          if (!joinCode) joinCode = (await db.doc(`sessions/${sessionId}`).get()).get('joinCode');
          assert.match(joinCode ?? '', /^\d{4,8}$/);
          const ref = db.doc(`joinCodes/${joinCode}`);
          await db.runTransaction(async tx => {
            const current = await tx.get(ref);
            if (current.exists) { assert.equal(current.get('sessionId'), sessionId);
              assert.ok(Date.now() < end, 'Original join-code cleanup deadline expired.'); tx.delete(ref); }
          });
          cleanup.joinCodeAbsent = !(await ref.get()).exists;
          assert.equal(cleanup.joinCodeAbsent, true);
        });
        if (heldCreationProof) await step('delete only the session named by the held normal create receipt', async end => {
          const creation = await heldCreationProof.ref.get();
          assert.equal(creation.exists, true, 'Retain original create ownership until its exact session is deleted.');
          assert.equal(creation.get('requestId'), heldCreationProof.requestId);
          assert.equal(creation.get('sessionId'), heldCreationProof.sessionId);
          assert.equal(creation.get('fingerprint')?.actorUid, heldCreationProof.actorUid);
          assert.equal(creation.get('fingerprint')?.requestId, heldCreationProof.requestId);
          const ref = db.doc(`sessions/${sessionId}`), current = await ref.get();
          assert.ok(Date.now() < end, 'Original owned-session cleanup deadline expired.');
          if (current.exists) await db.recursiveDelete(ref);
          cleanup.sessionAbsent = !(await ref.get()).exists;
          assert.equal(cleanup.sessionAbsent, true);
        });
        let lifecycleRootsRemoved;
        if (cleanup.sessionAbsent && heldCreationProof) {
          lifecycleRootsRemoved = await step('remove exact original GM lifecycle records after session deletion', async end => {
            return removePc11OwnedRootRecords({ db: scopedDb(end), uid: ownedAuthUids.get('gm'), sessionId,
              creationRequestId, startRequestId, instanceId: gmInstanceId });
          });
        }
        if (cleanup.sessionAbsent && lifecycleRootsRemoved) await step('remove only the two captured original actor memberships', async end => {
          const memberships = await db.collection('activeMemberships').where('sessionId', '==', sessionId).get();
          const owned = new Set(ownedAuthUids.values());
          assert.ok(memberships.docs.length <= 2 && memberships.docs.every(doc => owned.has(doc.id)),
            'Refuse membership cleanup for any actor not captured at ordinary Auth admission.');
          await db.runTransaction(async tx => {
            const current = await Promise.all(memberships.docs.map(doc => tx.get(doc.ref)));
            assert.ok(current.every(doc => doc.exists && doc.get('sessionId') === sessionId));
            assert.ok(Date.now() < end, 'Original owned-membership cleanup deadline expired.');
            current.forEach(doc => tx.delete(doc.ref));
          });
          cleanup.ownedMembershipPointersAbsent =
            (await db.collection('activeMemberships').where('sessionId', '==', sessionId).get()).size === 0;
          assert.equal(cleanup.ownedMembershipPointersAbsent, true);
        });
      }
      }
      const sessionScopeReleased = cleanup.browsersClosed === browsers.length &&
        (!sessionId && !creationRequestId || cleanup.rejectedCreateAbsentProof?.gameplayScopeAbsent === true ||
        cleanup.sessionAbsent && cleanup.joinCodeAbsent && cleanup.ownedMembershipPointersAbsent);
      if (ownedAuthUids.size > 0 && !authAdmin) {
        cleanup.errors.push({ step: 'delete captured fresh Auth actors',
          error: { name: 'Error', message: 'Auth Admin owner is unavailable for captured original identities.' } });
      }
      if (sessionScopeReleased && authAdmin) for (const [label, uid] of ownedAuthUids) await step(`delete captured fresh Auth actor ${label}`, async end => {
          const user = await authAdmin.getUser(uid);
          const createdAt = Date.parse(user.metadata.creationTime);
          assert.ok(createdAt >= startAt && createdAt <= Date.now(),
            'Refuse Auth deletion unless the original Auth identity was created during this exact run.');
          assert.ok(Date.now() < end, 'Original exact fresh Auth cleanup deadline expired.');
          await authAdmin.deleteUser(uid);
          cleanup.deletedFreshAuthIdentities++;
        });
      if (db) {
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
      }
      if (adminApp) await step('delete owner Admin app', () => adminApp.delete());
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
    adminRequire = createRequire(resolve(sourceRoot, 'functions/package.json'));
    const { initializeApp, getApps } = adminRequire('firebase-admin/app');
    const { getFirestore } = adminRequire('firebase-admin/firestore');
    const { getAuth } = adminRequire('firebase-admin/auth');
    assert.equal(getApps().length, 0, 'The P181 owner creates exactly one local Firebase Admin app.');
    const expectedFirestoreHost = `127.0.0.1:${ports.firestore}`;
    const expectedAuthHost = `127.0.0.1:${ports.auth}`;
    assert.ok(!process.env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST === expectedFirestoreHost);
    assert.ok(!process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST === expectedAuthHost);
    process.env.FIRESTORE_EMULATOR_HOST = expectedFirestoreHost;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = expectedAuthHost;
    adminApp = initializeApp({ projectId });
    db = getFirestore(adminApp);
    authAdmin = getAuth(adminApp);
    const scopeBefore = await bounded('Acquire original empty provider scope', () => Promise.all([
      db.collection('sessions').get(),
      db.collectionGroup('players').where('connected', '==', true).get(),
      db.collectionGroup('gmInstances').where('connected', '==', true).get(),
    ]), operationDeadline());
    assert.deepEqual(scopeBefore.map(value => value.size), [0, 0, 0],
      'Only the empty isolated emulator scope may be used for this fresh normal session.');
    const chromium = options.chromium ?? adminRequire('playwright').chromium;
    factory = createP181StarlightNativeSurfaceFactory({ chromium, baseUrl, ports,
      directory, browsers, surfaces, remoteRequests, pageErrors, calls, requests,
      absoluteDeadlineAt: proofStopAt, cleanupDeadlineAt });
  } catch (error) {
    try {
      const cleanup = await cleanupOwnedResources({ firstError: error, deadlineAt: cleanupDeadlineAt });
      if (cleanup?.status === 'failed') throw new Error('Original P181 provider initialization cleanup did not complete.');
    } catch (cleanupError) {
      rememberProofFailure(error, { providerInitializationCleanupFailure: cleanupError });
    }
    rememberProofFailure(error, { primaryFailureStage: 'P181 provider initialization',
      sourceCommit, sourceBindingsBefore: sourceBindingsBefore?.sourceFiles ?? null });
    try {
      await bounded('Retain original provider failure privately', () => retainProofFailure(directory, 'p181-provider-initialization', error, {
        sourceCommit, sourceBindingsBefore: sourceBindingsBefore?.sourceFiles ?? null, cleanup: cleanupResult,
      }), Math.min(cleanupDeadlineAt, Date.now() + 60_000));
    } catch (retentionError) {
      rememberProofFailure(error, { providerFailureRetentionError: retentionError });
    }
    throw error;
  }
  const readSourceSession = async (surface, deadlineAt = operationDeadline()) => bounded(
    'Read original mounted source session', () => surface.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      const session = useSessionStore.getState().session;
      if (!session) throw new Error('Original mounted session projection is absent.');
      return { sessionId: session.id, phase: session.phase, cycle: session.currentTurn,
        setupConfirmed: session.setupConfirmed === true, playerCount: session.playerCount ?? null,
        chartId: session.chartId ?? null, activeRoleIds: [...(session.activeRoleIds ?? [])],
        fullGameDemo: session.fullGameDemo ?? null, airspace: session.turnPhase?.airspace?.state ?? null,
        activeVesselIds: [...(session.activeVesselIds ?? [])], joinCode: session.joinCode ?? null };
    }, surface.storeModuleUrl()), deadlineAt);
  const readAuthUid = async (surface, deadlineAt = operationDeadline()) => bounded(
    'Read original normal Auth identity', () => surface.page.evaluate(async () => {
      const { auth } = await import('/src/lib/firebase.ts');
      const uid = auth().currentUser?.uid;
      if (typeof uid !== 'string' || !uid) throw new Error('Original normal Auth actor is absent.');
      return uid;
    }), deadlineAt);
  const registerAuth = async (surface, label, deadlineAt = operationDeadline()) => {
    const uid = await readAuthUid(surface, deadlineAt);
    assert.ok(![...ownedAuthUids].some(([owner, value]) => owner !== label && value === uid),
      'GM and Wing Commander must be distinct ordinary Auth identities.');
    if (ownedAuthUids.has(label)) assert.equal(ownedAuthUids.get(label), uid, 'Retain the same original Auth identity.');
    ownedAuthUids.set(label, uid);
    return { uid, uidHash: hashShort(uid) };
  };
  const readFullActor = async (surface, deadlineAt = operationDeadline()) => bounded(
    'Read original Auth/session/SDK readiness tuple', () => observeFullGameDemoPresentationMember(surface,
      { knownRoleIds: P181_NORMAL_SETUP.roleIds }), deadlineAt);
  const waitForFullActor = async (surface, description, predicate, deadlineAt) => {
    const readDeadlineAt = Math.min(deadlineAt, Date.now() + P181_NATIVE_TIMING.operationTimeoutMs);
    let current;
    while (Date.now() < readDeadlineAt) {
      current = await readFullActor(surface, readDeadlineAt);
      assert.ok(Date.now() < readDeadlineAt, `${description}: readiness tuple arrived after its original deadline.`);
      if (predicate(current)) return current;
      await bounded(`${description}: readiness retry interval`,
        () => delay(Math.min(200, readDeadlineAt - Date.now())), readDeadlineAt);
    }
    throw new Error(`${description}: ${JSON.stringify(current)}`);
  };
  const readGmRecoveryPending = (surface, deadlineAt = operationDeadline()) => bounded(
    'Read original GM recovery state', () => surface.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      return useSessionStore.getState().gmRecoveryPending;
    }, surface.storeModuleUrl()), deadlineAt);
  const waitForGm = async (deadlineAt, { active = false, instanceId = gmInstanceId } = {}) => {
    const readDeadlineAt = Math.min(deadlineAt, Date.now() + P181_NATIVE_TIMING.operationTimeoutMs);
    let member, recoveryPending;
    while (Date.now() < readDeadlineAt) {
      member = await readFullActor(gm, readDeadlineAt);
      assert.ok(Date.now() < readDeadlineAt, 'Original GM readiness tuple arrived after its deadline.');
      recoveryPending = await readGmRecoveryPending(gm, readDeadlineAt);
      assert.ok(Date.now() < readDeadlineAt, 'Original GM recovery read arrived after its deadline.');
      const expected = { uidHash: ownedAuthUids.get('gm') && hashShort(ownedAuthUids.get('gm')),
        sessionId, instanceId };
      if (pc11GmReadiness({ ...member, recoveryPending }, expected) &&
          (!active || member.phase === 'active' && member.cycle >= 1)) return { ...member, recoveryPending };
      await bounded('Original GM readiness retry interval',
        () => delay(Math.min(200, readDeadlineAt - Date.now())), readDeadlineAt);
    }
    throw new Error(`Original live normal GM authority did not become ready: ${JSON.stringify(member)}`);
  };
  async function captureAction(surface, endpoint, choose, deadlineAt) {
    const choiceDeadlineAt = Math.min(deadlineAt, Date.now() + 35_000);
    deadlineAt = Math.min(deadlineAt, Date.now() + P181_NATIVE_TIMING.operationTimeoutMs);
    const before = await bounded('Observe original actor before native action',
      () => observeLifecycleActor(surface, sessionId), deadlineAt);
    const timeout = deadlineAt - Date.now();
    assert.ok(timeout > 0);
    const firstGmClaim = surface === gm && endpoint === 'claimGmInstance' && gmInstanceId == null;
    if (firstGmClaim) {
      assert.ok(originalGmClaimActor, 'Bind the ordinary original GM Auth member after local authorization.');
      const currentMember = await readFullActor(surface, deadlineAt);
      assert.equal(pc11SameActorEpoch(originalGmClaimActor, currentMember), true,
        'First GM claim must use the same original connected member and App SDK session epoch.');
      assert.equal(currentMember.uidHash, hashShort(ownedAuthUids.get('gm')));
      assert.equal(currentMember.sessionId, sessionId);
      assert.equal(currentMember.playerRole, 'player');
      assert.equal(currentMember.connected, true);
      assert.equal(currentMember.kicked, false);
      assert.equal(currentMember.escapeLocked, false);
      assert.equal(currentMember.currentOwnPlayerConfirmed, true);
      assert.equal(currentMember.sdkHasServerAuthority, true);
      assert.equal(currentMember.sdkResumePending, false);
      assert.equal(currentMember.invalidFields.length, 0);
      assert.equal(currentMember.gmInstanceOwned, false);
      assert.equal(before.uidHash, currentMember.uidHash);
      assert.equal(before.sessionId, currentMember.sessionId);
      assert.equal(before.generation, currentMember.connectionGeneration);
      assert.equal(before.hydrationRevision, currentMember.identityHydrationRevision);
    }
    const originalGmMutation = surface === gm && !firstGmClaim && gmInstanceId != null;
    if (originalGmMutation) {
      const registeredUid = ownedAuthUids.get('gm');
      assert.ok(typeof registeredUid === 'string' && registeredUid.length > 0,
        'Original registered GM Auth identity is required before a privileged mutation.');
      assert.ok(typeof gmClaimedAt === 'string' && gmClaimedAt.length > 0,
        'Original registered GM claim receipt is required before a privileged mutation.');
      const currentMember = await readFullActor(surface, deadlineAt);
      const recoveryPending = await readGmRecoveryPending(surface, deadlineAt);
      const expected = { uidHash: hashShort(registeredUid), sessionId, instanceId: gmInstanceId };
      assert.equal(pc11GmReadiness({ ...currentMember, recoveryPending }, expected), true,
        'Privileged mutations require the original registered GM Auth actor and current live SDK authority.');
      assert.equal(before.uidHash, currentMember.uidHash,
        'GM observer receipt must describe the current registered Auth actor.');
      assert.equal(before.sessionId, currentMember.sessionId);
      assert.equal(before.generation, currentMember.connectionGeneration);
      assert.equal(before.hydrationRevision, currentMember.identityHydrationRevision);
      assert.equal(before.instanceId, gmInstanceId);
      assert.equal(before.claimedAt, gmClaimedAt);
      assert.equal(currentMember.sdkResumePending, false);
    }
    const beforeDispatch = async () => {
      if (firstGmClaim || originalGmMutation) {
        const recoveryPending = originalGmMutation ? await readGmRecoveryPending(surface, deadlineAt) : undefined;
        const current = await readFullActor(surface, deadlineAt);
        assert.equal(current.uidHash, hashShort(ownedAuthUids.get('gm')));
        assert.equal(current.sessionId, sessionId);
        assert.equal(current.sdkResumePending, false);
        if (firstGmClaim) assert.equal(pc11SameActorEpoch(originalGmClaimActor, current), true);
        else assert.equal(pc11GmReadiness({ ...current, recoveryPending },
          { uidHash: hashShort(ownedAuthUids.get('gm')), sessionId, instanceId: gmInstanceId }), true);
      }
    };
    const normalSetup = originalGmMutation &&
      ['confirmSetup', 'assignRole', 'startGame', 'clearTurnAdvanceInterstitial'].includes(endpoint);
    const capture = await bounded('Capture original UI choice, SDK operation and receipt',
      () => captureLifecycleUiAction(surface, endpoint,
        () => bounded('Choose original native UI action', choose, choiceDeadlineAt),
        firstGmClaim ? { timeout, deadlineAt, gm: false, beforeDispatch, sdkAuthority: true }
          : { timeout, deadlineAt, original: before, gm: surface === gm, beforeDispatch, normalSetup,
            sdkAuthority: originalGmMutation }), deadlineAt);
    if (firstGmClaim) {
      assert.equal(capture.before.uidHash, originalGmClaimActor.uidHash);
      assert.equal(capture.before.sessionId, originalGmClaimActor.sessionId);
      assert.equal(capture.before.generation, originalGmClaimActor.connectionGeneration);
      assert.equal(capture.before.hydrationRevision, originalGmClaimActor.identityHydrationRevision);
      assert.equal(capture.before.playerRole, 'player');
      assert.equal(capture.before.gmInstanceOwned, false);
    }
    trace.push(publicLifecycleReceipt(capture));
    return capture;
  }
  async function authorizeAndClaimOriginalGm(deadlineAt) {
    deadlineAt = Math.min(deadlineAt, Date.now() + P181_NATIVE_TIMING.operationTimeoutMs);
    return bounded('Original GM local authorization and first claim', async () => {
    const before = await bounded('Observe original GM before local authorization',
      () => observeLifecycleActor(gm, sessionId), deadlineAt);
    const origin = new URL(gm.page.url()).origin;
    const settings = await bounded('Open original GM local authorization settings',
      () => openLifecycleSettings(gm), deadlineAt);
    const authorize = settings.getByRole('button', { name: 'Authorize local emulator GM', exact: true });
    await bounded('Wait for original local GM authorization choice',
      () => authorize.waitFor({ state: 'visible', timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt);
    const response = await bounded('Capture original local GM authorization response', () => observeUiReceipt({ page: gm.page,
      consumed: { phase: 'P181 normal local GM authorization', credentialPayloadRecorded: false },
      waitForResponse: () => gm.page.waitForResponse(value => new URL(value.url()).origin === origin &&
        new URL(value.url()).pathname === '/__local-gm-access' && value.request().method() === 'POST',
      { timeout: Math.min(60_000, deadlineAt - Date.now()) }),
      choose: () => bounded('Choose original local GM authorization', () =>
        authorize.click({ timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt) }), deadlineAt);
    assert.equal(response.status(), 200);
    assert.equal((await bounded('Read original authorization response body', () => response.json(), deadlineAt)).authenticated, true);
    await bounded('Read original authorization state', () =>
      settings.getByRole('button', { name: 'Revoke GM access', exact: true }).waitFor({ state: 'visible' }), deadlineAt);
    const authorized = await bounded('Observe authorized original GM actor',
      () => observeLifecycleActor(gm, sessionId), deadlineAt);
    assert.equal(authorized.uidHash, before.uidHash);
    assert.equal(authorized.sessionId, before.sessionId);
    assert.equal(authorized.gmInstanceOwned, false);
    const claimActor = await readFullActor(gm, deadlineAt);
    assert.equal(claimActor.uidHash, hashShort(ownedAuthUids.get('gm')));
    assert.equal(claimActor.sessionId, sessionId);
    assert.equal(claimActor.hasAuth, true);
    assert.equal(claimActor.sameActor, true);
    assert.equal(claimActor.playerRole, 'player');
    assert.equal(claimActor.connected, true);
    assert.equal(claimActor.kicked, false);
    assert.equal(claimActor.escapeLocked, false);
    assert.equal(claimActor.currentOwnPlayerConfirmed, true);
    assert.equal(claimActor.sdkHasServerAuthority, true);
    assert.equal(claimActor.sdkResumePending, false);
    assert.deepEqual(claimActor.invalidFields, []);
    assert.equal(claimActor.connection, 'live');
    assert.equal(claimActor.freshness, 'server');
    assert.equal(claimActor.profileRoleId, null);
    assert.equal(claimActor.profileSessionId, null);
    assert.equal(claimActor.fullGameDemo, null);
    assert.equal(claimActor.gmInstanceOwned, false);
    assert.equal(claimActor.assignedRoleId, null);
    assert.equal(claimActor.activeConsoleRoleId, null);
    assert.equal(claimActor.seatId, null);
    originalGmClaimActor = claimActor;
    await bounded('Close original local authorization settings', () => closeLifecycleSettings(settings), deadlineAt);
    await bounded('Choose original GM join route', () =>
      gm.page.getByRole('link', { name: /GM join$/i }).click({ timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt);
    await bounded('Fill original GM name', () =>
      gm.page.getByLabel('Input GM Name', { exact: true }).fill('P181 Starlight GM',
        { timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt);
    const claimed = await captureAction(gm, 'claimGmInstance', () =>
      gm.page.getByRole('button', { name: 'Join as GM', exact: true }).click(), deadlineAt);
    assert.ok(claimed.result?.instance);
    assert.equal(claimed.result.instance.id, claimed.data.instanceId);
    assert.equal(claimed.result.instance.uid, ownedAuthUids.get('gm'));
    assert.equal(claimed.result.instance.sessionId, sessionId);
    assert.equal(typeof claimed.result.instance.claimedAt, 'string');
    assert.equal(new Date(claimed.result.instance.claimedAt).toISOString(), claimed.result.instance.claimedAt);
    const live = await waitForGm(deadlineAt, { instanceId: claimed.result.instance.id });
    assert.equal(live.uidHash, hashShort(ownedAuthUids.get('gm')));
    assert.equal(live.sessionId, sessionId);
    assert.equal(live.instanceId, claimed.result.instance.id);
    assert.equal(live.gmInstanceOwned, true);
    assert.equal(live.sdkHasServerAuthority, true);
    assert.equal(live.recoveryPending, false);
    const liveActor = await bounded('Observe owned original GM claim',
      () => observeLifecycleActor(gm, sessionId), deadlineAt);
    assert.equal(liveActor.uidHash, hashShort(ownedAuthUids.get('gm')));
    assert.equal(liveActor.sessionId, sessionId);
    assert.equal(liveActor.playerRole, 'gm');
    assert.equal(liveActor.gmInstanceOwned, true);
    assert.equal(liveActor.instanceId, claimed.result.instance.id);
    assert.equal(liveActor.claimedAt, claimed.result.instance.claimedAt);
    gmInstanceId = claimed.result.instance.id;
    gmClaimedAt = claimed.result.instance.claimedAt;
    originalGmClaimActor = undefined;
    return claimed;
    }, deadlineAt);
  }
  async function selectOriginalRole(roleId, { enter = true, deadlineAt = operationDeadline() } = {}) {
    deadlineAt = Math.min(deadlineAt, proofStopAt, Date.now() + 35_000);
    const work = (label, action) => bounded(label, action, deadlineAt);
    if (roleId === 'gm') {
      if (new URL(gm.page.url()).hash.startsWith('#/gm')) { p181Remaining(deadlineAt); return gm; }
      const link = gm.page.getByRole('link', { name: 'GM Console', exact: true });
      if (await work('Read original GM console link', () => link.isVisible()))
        await work('Enter original GM console', () => link.click({ timeout: p181Remaining(deadlineAt) }));
      else {
        const catalog = gm.page.getByRole('button', { name: /^Open station catalog/ });
        if (await work('Read original GM station catalog', () => catalog.isVisible()))
          await work('Open original GM station catalog', () => catalog.click({ timeout: p181Remaining(deadlineAt) }));
        await work('Choose original GM station', () => gm.page.getByRole('link', { name: 'GM Console', exact: true })
          .click({ timeout: p181Remaining(deadlineAt) }));
      }
      await work('Wait for original GM console', () => gm.page.getByRole('heading', { name: 'GM Console', exact: true })
        .waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }));
      return gm;
    }
    assert.equal(roleId, P181_NORMAL_SETUP.wingCommanderRoleId);
    const route = new URL(wingCommander.page.url()).hash;
    if (route.startsWith('#/shuttles/')) {
      const back = wingCommander.page.getByRole('link', { name: 'Back to AEGIS Wing Commander console', exact: true });
      await work('Return to original Wing Commander console', () => back.click({ timeout: p181Remaining(deadlineAt) }));
      await work('Wait for original AEGIS workspace', () => wingCommander.page.getByRole('heading', { name: 'AEGIS', exact: true })
        .waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }));
      return wingCommander;
    }
    if (route.endsWith('/roles/wing-commander')) { p181Remaining(deadlineAt); return wingCommander; }
    const change = wingCommander.page.getByRole('link', { name: /^(?:View ship consoles|Change role)$/ });
    if (await work('Read original role chooser link', () => change.isVisible()))
      await work('Open original role chooser', () => change.click({ timeout: p181Remaining(deadlineAt) }));
    if (enter) {
      const option = wingCommander.page.locator('a[href$="/roles/wing-commander"]').first();
      await work('Wait for original Wing Commander choice', () => option.waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }));
      await work('Choose original Wing Commander station', () => option.click({ timeout: p181Remaining(deadlineAt) }));
      await work('Wait for original Wing Commander console', () => wingCommander.page.getByRole('heading', { name: 'AEGIS', exact: true })
        .waitFor({ state: 'visible', timeout: p181Remaining(deadlineAt) }));
    }
    return wingCommander;
  }


  try {
    const chromium = options.chromium ?? adminRequire('playwright').chromium;
    assert.ok(Date.now() < browserLaunchDeadlineAt, 'Launch both original browser processes inside the first two minutes.');
    const launchDeadlineAt = Math.min(browserLaunchDeadlineAt, operationDeadline());
    gm = await bounded('Acquire original normal GM browser', () => factory.launch('normal-gm', launchDeadlineAt), launchDeadlineAt);
    wingCommander = await bounded('Acquire original Wing Commander browser', () => factory.launch('normal-wing-commander', launchDeadlineAt), launchDeadlineAt);
    assert.equal(browsers.length, 2);
    assert.equal(surfaces.length, 2);
    ownedRequestTracker = createPc11OwnedRequestTracker(gm.page, receipt => {
      if (receipt.endpoint === 'createSession') {
        creationRequestId = receipt.requestId;
        pendingOriginalIdentities.push(registerAuth(gm, 'gm').then(() => ({ ok: true }))
          .catch(error => { requestTrackerError ??= error; return { error }; }));
      }
      if (receipt.endpoint === 'startGame') {
        if (receipt.sessionId !== sessionId || receipt.instanceId !== gmInstanceId) {
          requestTrackerError = new Error('Original start request changed normal session or GM instance authority.');
          return;
        }
        startRequestId = receipt.requestId;
      }
    });
    creationRequestId = null;
    const gmAdmissionDeadlineAt = operationDeadline();
    await bounded('Open original normal GM session page',
      () => gm.page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: P181_NATIVE_TIMING.pageTimeoutMs }),
      gmAdmissionDeadlineAt);
    await bounded('Set original GM browser motion preference', () => gm.reducedMotion(), gmAdmissionDeadlineAt);
    const created = await bounded('Capture original normal session create response', () => observeUiReceipt({ page: gm.page,
      consumed: { phase: 'original normal session create', noCredentialsRetained: true },
      waitForResponse: () => gm.page.waitForResponse(response =>
        new URL(response.url()).pathname.endsWith('/us-central1/createSession') && response.request().method() === 'POST',
      { timeout: P181_NATIVE_TIMING.pageTimeoutMs }),
      choose: () => bounded('Choose original normal create admission', () => gm.page.getByRole('button', { name: 'Create a session', exact: true })
        .click({ timeout: Math.min(P181_NATIVE_TIMING.pageTimeoutMs, gmAdmissionDeadlineAt - Date.now()) }), gmAdmissionDeadlineAt) }), gmAdmissionDeadlineAt, response => {
      originalCreate.requestId = creationRequestId;
      originalCreate.dispatched = identifier(creationRequestId); originalCreate.transportPending = true;
      originalCreate.httpStatus = response.status();
      originalCreate.responseRequestId = response.request().postDataJSON()?.data?.requestId;
    });
    await awaitOriginalIdentityCaptures(gmAdmissionDeadlineAt);
    const createdBody = await bounded('Read original normal session create body',
      () => created.json(), gmAdmissionDeadlineAt, body => {
        originalCreate.body = body; originalCreate.responseSettled = true; originalCreate.transportPending = false;
      });
    assert.equal(created.status(), 200);
    assert.equal(createdBody.error, undefined);
    sessionId = createdBody.result?.session?.id;
    joinCode = createdBody.result?.session?.joinCode;
    const createRequest = created.request().postDataJSON()?.data;
    creationRequestId ??= createRequest?.requestId;
    assert.ok(identifier(sessionId));
    assert.ok(identifier(creationRequestId));
    assert.match(joinCode ?? '', /^\d{4,8}$/);
    await registerAuth(gm, 'gm', gmAdmissionDeadlineAt);
    await bounded('Accept original GM consent', () => gm.consent(gmAdmissionDeadlineAt), gmAdmissionDeadlineAt);
    const createdActor = await waitForFullActor(gm, 'Original normal GM create and Auth session', value =>
      value.hasAuth && value.sameActor && value.sessionId === sessionId && value.cycle === 0 &&
      value.profileRoleId == null && value.profileSessionId == null && value.connection === 'live' &&
      value.freshness === 'server' && value.fullGameDemo == null,
    gmAdmissionDeadlineAt);
    const initial = { sessionId, phase: createdActor.phase, cycle: createdActor.cycle,
      setupConfirmed: false, playerCount: null, chartId: null, activeRoleIds: [], fullGameDemo: null };
    assert.equal(initial.phase, 'lobby');
    assert.equal(initial.cycle, 0);
    trace.push('gm-create-session', 'gm-normal-auth-and-consent');

    const gameplay = { select: selectOriginalRole };
    const normalStart = {
      async prepare({ initial: fresh, deadlineAt, setup }) {
        deadlineAt = Math.min(deadlineAt, operationDeadline());
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
        const setupUiEnd = Math.min(deadlineAt, Date.now() + 35_000);
        const setupUi = (label, action) => bounded(label, action, setupUiEnd);
        const setupRegion = gm.page.getByRole('region', { name: 'Setup', exact: true });
        if (!await setupUi('Read original setup pane', () => setupRegion.isVisible())) {
          const openCatalog = gm.page.getByRole('button', { name: /^Open station catalog/ });
          if (await setupUi('Read original setup catalog', () => openCatalog.isVisible()))
            await setupUi('Open original setup catalog', () => openCatalog.click({ timeout: p181Remaining(setupUiEnd) }));
          await setupUi('Choose original setup GM console', () => gm.page.getByRole('link', { name: 'GM Console', exact: true })
            .click({ timeout: p181Remaining(setupUiEnd) }));
        }
        const setupPane = gm.page.getByRole('region', { name: 'Setup', exact: true });
        await setupUi('Open original setup controls', () => setupPane.getByRole('button', { name: 'Setup', exact: true })
          .click({ timeout: p181Remaining(setupUiEnd) }));
        await setupUi('Select original normal player count', () => setupPane.getByLabel('Recommended player count', { exact: true })
          .selectOption(String(P181_NORMAL_SETUP.playerCount), { timeout: p181Remaining(setupUiEnd) }));
        await setupUi('Select original normal chart', () => setupPane.getByLabel('Star chart', { exact: true })
          .selectOption(P181_NORMAL_SETUP.chartId, { timeout: p181Remaining(setupUiEnd) }));
        const confirmSetup = await captureAction(gm, 'confirmSetup', () => setupUi('Confirm original normal setup', () =>
          setupPane.getByRole('button', { name: 'Confirm setup // Confirm roster', exact: true })
            .click({ timeout: p181Remaining(setupUiEnd) })), deadlineAt);
        assert.equal(confirmSetup.httpStatus, 200);
        const confirmed = await waitForFullActor(gm, 'Original confirmed normal Cycle 0 lobby', value =>
          value.sessionId === sessionId && value.phase === 'lobby' && value.cycle === 0 &&
          value.setupConfirmed && value.connection === 'live' && value.freshness === 'server', deadlineAt);
        const configured = await readSourceSession(gm, deadlineAt);
        assert.deepEqual([...configured.activeRoleIds].sort(), [...P181_NORMAL_SETUP.roleIds].sort(),
          'Use the supported source preset’s exact eight-seat Chart A roles.');
        const confirmedInitial = { sessionId, phase: confirmed.phase, cycle: confirmed.cycle,
          setupConfirmed: true, playerCount: configured.playerCount, chartId: configured.chartId,
          activeRoleIds: configured.activeRoleIds, fullGameDemo: configured.fullGameDemo };
        assert.equal(confirmedInitial.playerCount, P181_NORMAL_SETUP.playerCount);
        assert.equal(confirmedInitial.chartId, P181_NORMAL_SETUP.chartId);
        assert.equal(confirmedInitial.fullGameDemo, null);
        trace.push('confirmSetup');

        await bounded('Open original Wing Commander admission page',
          () => wingCommander.page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: P181_NATIVE_TIMING.pageTimeoutMs }), deadlineAt);
        await bounded('Set original Wing Commander browser motion preference',
          () => wingCommander.reducedMotion(), deadlineAt);
        await bounded('Enter original normal session code', () =>
          wingCommander.page.getByRole('textbox', { name: 'Session code', exact: true })
            .fill(joinCode, { timeout: P181_NATIVE_TIMING.pageTimeoutMs }), deadlineAt);
        wingAdmissionTracker = createPc11OwnedRequestTracker(wingCommander.page, receipt => {
          if (receipt.endpoint !== 'joinSession') return;
          pendingOriginalIdentities.push(registerAuth(wingCommander, 'wing-commander').then(() => ({ ok: true }))
            .catch(error => { requestTrackerError ??= error; return { error }; }));
        });
        const joined = await bounded('Capture original Wing Commander join response', () => observeUiReceipt({ page: wingCommander.page,
          consumed: { phase: 'original ordinary Wing Commander session-code join', credentialsRetained: false },
          waitForResponse: () => wingCommander.page.waitForResponse(response =>
            new URL(response.url()).pathname.endsWith('/us-central1/joinSession') && response.request().method() === 'POST',
          { timeout: P181_NATIVE_TIMING.pageTimeoutMs }),
          choose: () => bounded('Choose original Wing Commander admission', () => wingCommander.page.getByRole('button', { name: 'Join a session', exact: true })
            .click({ timeout: Math.min(P181_NATIVE_TIMING.pageTimeoutMs, deadlineAt - Date.now()) }), deadlineAt) }), deadlineAt);
        await awaitOriginalIdentityCaptures(deadlineAt);
        assert.equal(joined.status(), 200);
        assert.equal((await bounded('Read original Wing Commander join body',
          () => joined.json(), deadlineAt)).error, undefined);
        const admittedAuth = await registerAuth(wingCommander, 'wing-commander', deadlineAt);
        await bounded('Accept original Wing Commander consent', () => wingCommander.consent(deadlineAt), deadlineAt);
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
        const displayName = (await bounded('Observe original admitted Wing Commander actor',
          () => observeLifecycleActor(wingCommander, sessionId), deadlineAt)).displayName;
        assert.ok(typeof displayName === 'string' && displayName.length > 0);
        const casting = gm.page.getByRole('region', { name: 'Facilitator casting', exact: true });
        const castingUiEnd = Math.min(deadlineAt, Date.now() + 35_000);
        await bounded('Select original Wing Commander casting role', () => casting.getByLabel(`Role for ${displayName}`, { exact: true })
          .selectOption(P181_NORMAL_SETUP.wingCommanderRoleId, { timeout: p181Remaining(castingUiEnd) }), castingUiEnd);
        const assignment = await captureAction(gm, 'assignRole', () =>
          casting.getByRole('button', { name: `Assign role to ${displayName}`, exact: true })
            .click({ timeout: Math.min(35_000, deadlineAt - Date.now()) }), deadlineAt);
        await waitForFullActor(wingCommander, 'Original normal Wing Commander role assignment', value =>
          value.assignedRoleId === P181_NORMAL_SETUP.wingCommanderRoleId && value.activeConsoleRoleId == null &&
          value.phase === 'casting' && value.cycle === 0,
        deadlineAt);
        trace.push('wing-commander-normal-join-and-consent', 'assignRole');

        const navigationStart = await readFullActor(wingCommander, deadlineAt);
        const navigation = createMemberNavigationResumeObserver(wingCommander.page, { directory,
          roleId: P181_NORMAL_SETUP.wingCommanderRoleId, deadlineAt, memberContract: 'pc11-live-base' });
        let station, navigationError;
        try {
          await bounded('Prepare original station navigation observer', () => navigation.prepare(navigationStart), deadlineAt);
          const roleLink = wingCommander.page.locator('a[href$="/roles/wing-commander"]').first();
          const navigationUiEnd = Math.min(deadlineAt, Date.now() + 35_000);
          await bounded('Wait for original station chooser', () => roleLink.waitFor({ state: 'visible', timeout: p181Remaining(navigationUiEnd) }), navigationUiEnd);
          await bounded('Choose original station berth', () => roleLink.click({ timeout: p181Remaining(navigationUiEnd) }), navigationUiEnd);
          normalPreparationDiagnostic.activeAwaitedOperation =
            'Original Wing Commander normal role chooser/seat claim';
          station = await waitForFullActor(wingCommander, 'Original Wing Commander normal role chooser/seat claim', value =>
            pc11MemberReadiness(value, { sessionId, uidHash: admittedAuth.uidHash,
              roleId: P181_NORMAL_SETUP.wingCommanderRoleId, stage: 'station' }) && value.memberScopeMatches === true,
          deadlineAt);
          normalPreparationDiagnostic.activeAwaitedOperation = null;
          if (station.connectionGeneration !== navigationStart.connectionGeneration ||
              station.identityHydrationRevision !== navigationStart.identityHydrationRevision) {
            const accepted = await bounded('Accept original actor-bound role navigation receipt',
              () => navigation.accept(navigationStart, station, () => readFullActor(wingCommander, deadlineAt)), deadlineAt);
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
          const productionUiEnd = Math.min(deadlineAt, Date.now() + 35_000);
          await bounded('Choose original production start', () => production.getByRole('button', { name: 'Start production // Advance to Cycle 1', exact: true })
            .click({ timeout: p181Remaining(productionUiEnd) }), productionUiEnd);
          await bounded('Confirm original production start', () => production.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1', exact: true })
            .click({ timeout: p181Remaining(productionUiEnd) }), productionUiEnd);
        }, deadlineAt);
        assert.ok(['committed', 'replayed'].includes(start.result?.status));
        assert.equal(requestTrackerError, undefined,
          'Stop on the first original start request/session/instance mismatch.');
        startRequestId = start.data.requestId;
        gmInstanceId = start.data.instanceId;
        assert.ok(identifier(startRequestId) && identifier(gmInstanceId));
        const startedGm = await waitForGm(deadlineAt, { active: true });
        const started = { sessionId, phase: startedGm.phase, cycle: startedGm.cycle,
          uidHash: startedGm.uidHash, instanceId: startedGm.instanceId, claimedAt: gmClaimedAt, fullGameDemo: startedGm.fullGameDemo };
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
      captureOriginalGmAction: captureAction, onReceipt: receipt => trace.push(receipt),
      retainFirstFailure,
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
    const sourceBindingsAfter = await bounded('Recheck original complete source manifest', () => captureP181SourceBindings(sourceRoot), operationDeadline());
    assert.deepEqual(sourceBindingsAfter, sourceBindingsBefore,
      'Preserve the exact committed source and complete Functions build manifest throughout the normal UI run.');
  } catch (error) {
    firstError = error;
    rememberProofFailure(firstError, { primaryFailureStage: 'P181 native flow',
      sourceCommit, sourceBindingsBefore: sourceBindingsBefore?.sourceFiles ?? null,
      heldReceipts: trace, heldRemoteRequests: remoteRequests, heldPageErrors: pageErrors,
      heldOriginalCreate: { ...originalCreate } });
  } finally {
    if (firstError) await retainFirstFailure(firstError);
    if (!cleanupPromise) {
      try { cleanupResult = await cleanupOwnedResources({ firstError,
        deadlineAt: cleanupDeadlineAt }); }
      catch (error) {
        cleanupFailures.push({ step: 'owned cleanup', error });
        if (firstError) rememberProofFailure(firstError, { secondaryCleanupFailure: error });
        else firstError = error;
        cleanupResult = { status: 'failed', errors: [{ step: 'owned cleanup', error: safeP181Error(error) }] };
      }
    } else {
      // The UI wrapper may have begun this exact chain. Its native steps are
      // fenced by the original cleanup cutoff; settle that chain before
      // retaining qualification or releasing this owner's resources.
      try { cleanupResult = await cleanupPromise; }
      catch (error) {
        cleanupFailures.push({ step: 'owned cleanup', error });
        if (firstError) rememberProofFailure(firstError, { secondaryCleanupFailure: error });
        else firstError = error;
        cleanupResult = { status: 'failed', errors: [{ step: 'owned cleanup', error: safeP181Error(error) }] };
      }
    }
    if (!firstError && cleanupResult?.status !== 'owned-cleanup-complete') {
      firstError = cleanupFailures[0]?.error ?? new Error('P181 owned cleanup did not complete.');
      rememberProofFailure(firstError, { primaryFailureStage: 'P181 native cleanup',
        heldCleanupFailures: cleanupFailures, heldReceipts: trace });
    }
    let privateCleanupArtifact = null;
    if (firstError) {
      rememberProofFailure(firstError, { sourceCommit,
        sourceBindingsBefore: sourceBindingsBefore?.sourceFiles ?? null,
        heldReceipts: trace, heldRemoteRequests: remoteRequests, heldPageErrors: pageErrors,
        heldOriginalCreate: { ...originalCreate }, cleanup: cleanupResult, cleanupFailures });
      try {
        // The pre-teardown primary remains immutable. Only bookkeeping can
        // use the residual parent budget after the owned cleanup cutoff.
        privateCleanupArtifact = await bounded('Retain original native cleanup qualification privately', () => retainProofFailure(directory, 'p181-native-cleanup', firstError, {
          sourceCommit, sourceBindingsBefore, receipts: trace, remoteRequests, pageErrors,
          cleanup: cleanupResult, cleanupFailures,
        }), Math.min(totalEnd, Date.now() + 60_000));
      } catch (retentionError) {
        privateCleanupArtifact = { evidenceWriteFailed: true };
        rememberProofFailure(firstError, { nativeFailureRetentionError: retentionError });
      }
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
      finalization: { allocationDeadlineAt: totalEnd, measuredAtMs: Date.now(),
        parentVerificationRemainingMs: Math.max(0, totalEnd - Date.now()) },
      cleanup: cleanupResult,
      firstError: firstError ? safeP181Error(firstError) : null,
      privateFailureEvidence: firstError ? (
        privateFailureArtifact?.evidenceWriteFailed === false || privateCleanupArtifact?.evidenceWriteFailed === false
          ? 'private-retained' : 'private-retention-failed') : null,
      zeroNativeCreditBeforeRun: true,
      limitations: [
        'Controlled IO tests and source preparation are not mounted App/backend/native gameplay acceptance.',
        'The normal two-actor run earns only its observed Starlight movement and first private scan; no peer audience, capacity, fighter, mission, full-workspace or all-role claim is made.',
        'Second scan remains unearned unless live original-cycle fuel, maintenance, cadence and another printed coordinate are actually offered.',
        'Independent port/process/emulator reservation verification remains the parent owner’s responsibility within the original allocation; finalization records only the remaining budget, never a verified handback.',
      ],
    };
    const finalOutcome = { ...outcome, ...(proofResult ?? {}) };
    if (firstError) {
      finalOutcome.status = 'P181_STOPPED_FIRST_FAILURE';
      finalOutcome.actualAcceptance = false;
      finalOutcome.fixedCatalogClosures = 0;
      finalOutcome.checkpointOrReleaseCredit = 0;
      finalOutcome.firstError = safeP181Error(firstError);
    }
    try {
      await bounded('Write original safe native outcome', () => writeFile(resolve(directory, 'p181-starlight-movement-scout.json'),
        `${JSON.stringify(finalOutcome, null, 2)}\n`, { mode: 0o600, flag: 'wx' }), Math.min(totalEnd, Date.now() + 60_000));
    } catch (error) {
      if (!firstError) {
        firstError = error;
        rememberProofFailure(firstError, { primaryFailureStage: 'P181 public final output write',
          sourceCommit, heldReceipts: trace, cleanup: cleanupResult });
        try {
          await bounded('Retain original output failure privately', () => retainProofFailure(directory, 'p181-final-output', firstError,
            { sourceCommit, receipts: trace, cleanup: cleanupResult }), Math.min(totalEnd, Date.now() + 60_000));
        } catch (retentionError) {
          rememberProofFailure(firstError, { nativeFailureRetentionError: retentionError });
        }
      } else rememberProofFailure(firstError, { secondaryFinalOutputWriteFailure: error });
    }
  }
  if (firstError) throw firstError;
  assert.equal(cleanupResult?.status, 'owned-cleanup-complete', 'Native proof only ends after exact owned cleanup.');
  return proofResult;
}

/** Bind the exact on-disk P181 source set, complete Functions build inputs,
 * and every compiled Functions output. The parent supplies the accepted
 * pre-launch manifest and runtime chronology for native execution. */
export async function captureP181SourceBindings(sourceRoot, options = {}) {
  const root = resolve(sourceRoot), bindings = {};
  const buildRoot = resolve(options.buildRoot ?? root), deadlineAt = options.deadlineAt;
  const checked = (label, operation) => deadlineAt === undefined ? operation()
    : p181BoundedWork(label, operation, deadlineAt);
  const read = path => checked('Read exact source/build binding input', () => readFile(path));
  const git = args => {
    const result = execFileSync('git', args, { cwd: root, encoding: 'utf8',
      ...(deadlineAt === undefined ? {} : { timeout: p181Remaining(deadlineAt) }) });
    if (deadlineAt !== undefined) p181Remaining(deadlineAt);
    return result;
  };
  for (const path of P181_SOURCE_BINDING_FILES) {
    bindings[path] = createHash('sha256').update(await read(resolve(root, path))).digest('hex');
  }
  const manifestFor = async (base, required = false) => {
    const files = [];
    async function walk(directory, relative = '') {
      const entries = await checked('Read exact build manifest directory', () => readdir(directory, { withFileTypes: true }));
      for (const entry of entries) {
        const child = resolve(directory, entry.name), name = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(child, name);
        else if (entry.isFile()) files.push([name, createHash('sha256').update(await read(child)).digest('hex')]);
      }
    }
    try { await walk(base); }
    catch (error) { if (!required && error?.code === 'ENOENT') return []; throw error; }
    return files.sort(([a], [b]) => a.localeCompare(b));
  };
  const hashManifest = files => createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const functionsSourceFiles = [];
  for (const path of ['functions/package.json', 'functions/package-lock.json', 'functions/tsconfig.json']) {
    functionsSourceFiles.push([path, createHash('sha256').update(await read(resolve(root, path))).digest('hex')]);
  }
  for (const [path, digest] of await manifestFor(resolve(root, 'functions/src'), true)) {
    functionsSourceFiles.push([`functions/src/${path}`, digest]);
  }
  functionsSourceFiles.sort(([a], [b]) => a.localeCompare(b));
  const compiledFiles = await manifestFor(resolve(buildRoot, 'functions/lib'), options.completeInputs === true);
  let completeInputs = {};
  if (options.completeInputs === true) {
    const trackedFiles = [];
    for (const path of git(['ls-files', '-z']).split('\0').filter(Boolean)) {
      trackedFiles.push({ path, sha256: createHash('sha256').update(await read(resolve(root, path))).digest('hex') });
    }
    const frontendFiles = await manifestFor(resolve(buildRoot, 'dist'), true);
    completeInputs = { buildRoot, sourceTree: git(['rev-parse', 'HEAD^{tree}']).trim(), trackedFiles,
      trackedSourceManifestSha256: hashManifest(trackedFiles),
      frontendFiles, frontendFileCount: frontendFiles.length, frontendTreeSha256: hashManifest(frontendFiles) };
  }
  return { sourceRoot: root,
    sourceCommit: git(['rev-parse', 'HEAD']).trim(),
    sourceFiles: bindings, functionsSourceFiles, functionsSourceTreeSha256: hashManifest(functionsSourceFiles),
    compiledFiles, compiledFileCount: compiledFiles.length, compiledTreeSha256: hashManifest(compiledFiles), ...completeInputs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const nativeOptions = {};
  const originalFailureDeadlineAt = Math.min(
    Number(process.env.P181_ALLOCATION_DEADLINE_MS) - P181_NATIVE_TIMING.proofStopReserveMs, Date.now() + 60_000);
  runP181StarlightMovementScoutNative(nativeOptions).catch(async error => {
    if (!p181NativePassedPreflight.has(nativeOptions)) {
      const requestedDirectory = resolve(process.env.P181_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence');
      const failureDirectory = requestedDirectory.startsWith('/tmp/') ? requestedDirectory : '/tmp/dow-pc10-evidence';
      rememberProofFailure(error, { primaryFailureStage: 'P181 pre-native source preflight',
        originalFailureDeadlineAt });
      try {
        await p181BoundedWork('Retain original pre-native CLI failure privately',
          () => retainProofFailure(failureDirectory, 'p181-pre-native', error,
            { originalFailureDeadlineAt, noNativeOwnershipEntered: true }), originalFailureDeadlineAt);
      } catch (retentionError) {
        rememberProofFailure(error, { preNativeFailureRetentionError: retentionError });
      }
    }
    process.stderr.write(`${JSON.stringify({ status: 'P181_STOPPED_FIRST_FAILURE', error: safeP181Error(error) })}\n`);
    process.exitCode = 1;
  });
}
