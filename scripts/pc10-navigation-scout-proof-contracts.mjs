import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';

/** Native proof contracts. No authority, game writes, draws or initial SDK mutations. */
export const NAV_SCOUT_BRANCHES = Object.freeze([
  'prestart-readers', 'group-navigation', 'group-message', 'known-share', 'known-jump',
  'gm-move', 'partition', 'taxi-courier', 'taxi-fuel', 'taxi-passengers', 'natural-failure',
  'dradis', 'press-access', 'scout-request', 'gm-scout-recovery', 'scout-report',
  'candidate-reader', 'scout-reload', 'scout-foreign-denial', 'scout-offline-withdrawal',
  'scout-audience-withdrawal',
]);
export const navigationScoutHash = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const record = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const counter = value => Number.isSafeInteger(value) && value >= 0;
const coordinate = value => typeof value === 'string' && /^\d{4}$/.test(value);
const id = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const group = value => typeof value === 'string' && /^fleet-[1-9][0-9]*$/.test(value);
function keys(value, allowed, required = allowed) {
  assert.ok(record(value) && Object.keys(value).every(key => allowed.includes(key)), 'Unknown source/private fields.');
  assert.ok(required.every(key => Object.hasOwn(value, key)), 'Missing source fields.');
}

const identityFields = ['sessionId', 'uidHash', 'playerRole', 'profileRoleId', 'assignedRoleId',
  'activeConsoleRoleId', 'seatId', 'replacementRoleId', 'replacementStatus', 'groupId', 'generation',
  'phase', 'cycle', 'airspace', 'turnStatePhase', 'instanceId', 'instanceClaimedAt'];
function originalIdentity(current, original, omitGroup = false) {
  assert.ok(record(current) && record(original), 'Original actor authority is missing.');
  assert.ok(id(original.sessionId) && /^[a-f0-9]{16}$/.test(original.uidHash ?? ''), 'Original actor identity is missing.');
  for (const key of identityFields) {
    if (omitGroup && key === 'groupId') continue;
    assert.equal(current[key] ?? null, original[key] ?? null, `Original ${key} authority changed.`);
  }
  assert.equal(current.hasAuth, true, 'Original Auth must remain current.');
  assert.equal(current.sameActor, true, 'Original Auth and current player must agree.');
  if (original.playerRole === 'gm') {
    assert.ok(original.instanceId && original.instanceClaimedAt, 'Original GM authority is required.');
    assert.equal(current.gmInstanceOwned, true, 'Original GM authority must remain owned.');
  }
}

export function assertNavigationScoutActor(current, original) {
  originalIdentity(current, original);
  assert.equal(current.connection, 'live', 'Original actor must be live.');
  assert.equal(current.freshness, 'server', 'Original actor needs fresh server authority.');
}

/** Only a verified own-vessel navigation result may change group. Private reads never use this seam. */
export function assertNavigationScoutConsequenceActor(current, original, consequence) {
  if (current.groupId === original.groupId) return assertNavigationScoutActor(current, original);
  originalIdentity(current, original, true);
  assert.equal(current.connection, 'live'); assert.equal(current.freshness, 'server');
  assert.ok(['jumpShip', 'moveShipToLocation', 'adjudicateFailedJump'].includes(consequence?.endpoint),
    'A source navigation consequence is required for a group change.');
  assert.ok(original.shipId && consequence.result?.shipId === original.shipId,
    'The source group consequence must concern the original actor ship.');
  assert.ok(counter(consequence.result.revision) && consequence.result.revision > (original.vesselRevisions?.[original.shipId] ?? -1),
    'The source group consequence needs the newly committed ship revision.');
  assert.ok(group(current.groupId) && consequence.shipGroups?.[original.shipId] === current.groupId,
    'The new group must match the observed authoritative source ship partition.');
}

export function assertNavigationScoutCensus(context) {
  assert.ok(context?.initial?.sessionId && context.started?.sessionId === context.initial.sessionId, 'Fresh census session mismatch.');
  assert.equal(context.started.phase, 'active');
  assert.equal(context.started.fullGameDemo?.status, 'active', 'Use the actual protected full-game manual start.');
  assert.equal(context.started.fullGameDemo?.progression, 'manual', 'Use real manual GM controls.');
  const roles = context.started.confirmedRoleIds ?? context.started.activeRoleIds;
  assert.ok(Array.isArray(roles) && roles.length > 0 && new Set(roles).size === roles.length, 'Confirmed role census is required.');
  const pressIncluded = context.started.pressIncluded ?? context.roster.some(actor => actor.roleId === 'press-officer');
  const expected = [...roles, ...(pressIncluded ? ['press-officer'] : [])];
  assert.deepEqual(context.roster.map(actor => actor.roleId).sort(), expected.sort(), 'Full confirmed roster and Press census must agree.');
  assert.ok(context.roster.every(actor => /^[a-f0-9]{16}$/.test(actor.uidHash ?? '')), 'Every census actor needs its original Auth identity.');
  assert.equal(new Set(context.roster.map(actor => actor.uidHash)).size, context.roster.length,
    'Normally admitted Auth identities must remain independent.');
}

/** Read-only paint wait, under the existing per-stage budget. Unknown paint does not mean unavailable. */
export async function waitForNavigationScoutPaint({ inspect, inspectPaint, original, timeoutMs = 60_000,
  now = Date.now, wait = () => delay(200) }) {
  assert.ok(timeoutMs > 0 && timeoutMs <= 60_000, 'The stage budget cannot exceed 60 seconds.');
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const current = await inspect(); originalIdentity(current, original);
    if (current.connection !== 'live' || current.freshness !== 'server') { await wait(); continue; }
    const paint = await inspectPaint();
    assertNavigationScoutActor(await inspect(), original);
    assert.ok(now() < deadline, 'Original source paint deadline expired.');
    if (paint?.mounted === true && paint.current === true) {
      if (paint.eligible === true) return { state: 'offered' };
      if (paint.eligible === false && typeof paint.blocker === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(paint.blocker)) {
        return { state: 'blocked', reason: paint.blocker };
      }
    }
    await wait();
  }
  throw new Error('Current original-actor source paint deadline expired; no mutation or reload was issued.');
}

const requestFields = Object.freeze({
  sendFleetGroupMessage: ['sessionId', 'requestId', 'expectedGroupId', 'text'],
  shareKnownSystemDetails: ['sessionId', 'requestId', 'expectedGroupId', 'expectedNavigationRevision', 'coordinate', 'recipientShipIds'],
  confirmFleetPartition: ['sessionId', 'instanceId', 'requestId', 'expectedNavigationRevision'],
  sendScoutTaxiTransfer: ['sessionId', 'requestId', 'expectedGroupId', 'expectedNavigationRevision', 'expectedFleetPartitionRevision',
    'expectedCycle', 'expectedControlRevision', 'shuttleId', 'targetShipId', 'payload'],
  sendScoutTaxiCourier: ['sessionId', 'requestId', 'shuttleId', 'targetShipId', 'text', 'expectedCycle',
    'expectedControlRevision', 'expectedNavigationRevision'],
  jumpShip: ['sessionId', 'requestId', 'shipId', 'destination', 'expectedRevision', 'instanceId'],
  moveShipToLocation: ['sessionId', 'requestId', 'instanceId', 'shipId', 'destination', 'expectedRevision'],
  adjudicateFailedJump: ['sessionId', 'requestId', 'instanceId', 'expectedRevision', 'failureRequestId', 'consequence', 'destination'],
  requestScout: ['sessionId', 'requestId', 'entitlementId', 'targetCoordinate'],
  resolvePendingScoutRequest: ['sessionId', 'requestId', 'instanceId'],
  triggerDradisContact: ['sessionId', 'instanceId'],
  unlockPressAirspace: ['sessionId', 'instanceId'],
});
const gmCommands = new Set(['moveShipToLocation', 'adjudicateFailedJump', 'confirmFleetPartition',
  'resolvePendingScoutRequest', 'triggerDradisContact']);
const requiredFields = { jumpShip: requestFields.jumpShip.filter(k => k !== 'instanceId'),
  adjudicateFailedJump: requestFields.adjudicateFailedJump.filter(k => k !== 'destination'),
  unlockPressAirspace: ['sessionId'] };
const entitlementRoles = { starlight: 'wing-commander', hummingbird: 'quellon-explorer', endeavour: 'shepherd-scientist',
  'comms-officer': 'comms-officer' };

export function assertNavigationScoutRequest(endpoint, request, actor, intent = {}) {
  assert.ok(requestFields[endpoint], 'Unknown source endpoint.');
  keys(request, requestFields[endpoint], requiredFields[endpoint] ?? requestFields[endpoint]);
  assert.equal(request.sessionId, actor.sessionId, 'Original source session is required.');
  if ('requestId' in request) assert.ok(id(request.requestId), 'Source receipt identity is required.');
  if (gmCommands.has(endpoint)) {
    assert.equal(actor.playerRole, 'gm', 'Original GM source actor is required.');
    assert.equal(request.instanceId, actor.instanceId, 'Original source GM instance is required.');
  } else if ('instanceId' in request) assert.equal(request.instanceId, actor.instanceId, 'Original source instance changed.');
  if ('expectedGroupId' in request) assert.equal(request.expectedGroupId, actor.groupId, 'Original group is required.');
  if ('expectedNavigationRevision' in request) assert.equal(request.expectedNavigationRevision, actor.navigationRevision, 'Current navigation revision is required.');
  if ('expectedFleetPartitionRevision' in request) assert.equal(request.expectedFleetPartitionRevision, actor.fleetPartitionRevision, 'Current partition revision is required.');
  if ('expectedCycle' in request) assert.equal(request.expectedCycle, actor.cycle, 'Current source cycle is required.');
  if ('expectedControlRevision' in request) assert.equal(request.expectedControlRevision, actor.controlRevisions?.[request.shuttleId], 'Current custody revision is required.');
  if (['jumpShip', 'moveShipToLocation'].includes(endpoint)) {
    assert.equal(request.shipId, intent.shipId, 'Source ship intent mismatch.');
    assert.equal(request.expectedRevision, actor.vesselRevisions?.[request.shipId] ?? 0, 'Current ship revision is required.');
    assert.equal(request.destination, intent.coordinate, 'Original source destination intent mismatch.');
    assert.ok(coordinate(request.destination), 'Source destination is malformed.');
    if (endpoint === 'jumpShip') assert.ok(actor.knownCoordinates?.includes(request.destination), 'A known source destination is required.');
    else assert.ok(intent.printedCoordinates?.includes(request.destination), 'A printed source destination is required.');
  }
  if (endpoint === 'shareKnownSystemDetails') {
    assert.equal(request.coordinate, intent.coordinate, 'Original source share intent mismatch.');
    assert.ok(actor.knownCoordinates?.includes(request.coordinate), 'Share only a current known system.');
    assert.deepEqual(request.recipientShipIds, intent.recipientShipIds ?? 'all', 'Original source recipient intent mismatch.');
    assert.ok(request.recipientShipIds === 'all' || (Array.isArray(request.recipientShipIds) && request.recipientShipIds.length > 0 &&
      new Set(request.recipientShipIds).size === request.recipientShipIds.length &&
      request.recipientShipIds.every(id => actor.localShipIds?.includes(id))), 'Every source recipient must be in the current group.');
  }
  if (endpoint === 'sendFleetGroupMessage' || endpoint === 'sendScoutTaxiCourier') {
    assert.equal(request.text, intent.text?.trim(), 'Source note intent mismatch.');
    assert.ok(typeof request.text === 'string' && request.text.length > 0 && request.text.length <= (endpoint === 'sendFleetGroupMessage' ? 240 : 200), 'Source note length is invalid.');
  }
  if (endpoint === 'sendScoutTaxiTransfer' || endpoint === 'sendScoutTaxiCourier') {
    assert.equal(request.shuttleId, intent.shuttleId, 'Source shuttle intent mismatch.');
    assert.equal(request.targetShipId, intent.targetShipId, 'Source target intent mismatch.');
    assert.ok(['starlight', 'hummingbird'].includes(request.shuttleId) && actor.assignedRoleId === entitlementRoles[request.shuttleId],
      'The original source taxi holder is required.');
    assert.ok(!actor.localShipIds?.includes(request.targetShipId), 'A separated source taxi destination is required.');
    if (endpoint === 'sendScoutTaxiTransfer') {
      if (request.payload?.kind === 'fuel') {
        keys(request.payload, ['kind', 'units']);
        assert.ok(request.payload.units === 1 || request.payload.units === 2, 'Source taxi fuel is limited to one or two units.');
        assert.equal(request.payload.units, intent.units, 'Source fuel intent mismatch.');
      } else {
        keys(request.payload, ['kind', 'playerUids']); assert.equal(request.payload.kind, 'players');
        assert.deepEqual(request.payload.playerUids, intent.passengerUids, 'Source passenger intent mismatch.');
        assert.ok(Array.isArray(request.payload.playerUids) && request.payload.playerUids.length >= 1 && request.payload.playerUids.length <= 2 &&
          new Set(request.payload.playerUids).size === request.payload.playerUids.length && request.payload.playerUids.every(id) &&
          !request.payload.playerUids.includes(actor.uid), 'Source passengers must be one or two distinct original non-operator accounts.');
      }
    }
  }
  if (endpoint === 'adjudicateFailedJump') {
    for (const key of ['failureRequestId', 'expectedRevision', 'consequence']) assert.equal(request[key], intent[key], 'Actual source failure and ruling are required.');
    assert.equal(request.destination, intent.coordinate, 'Source ruling destination mismatch.');
  }
  if (endpoint === 'requestScout') {
    assert.equal(request.entitlementId, intent.entitlementId, 'Original source scout intent mismatch.');
    assert.equal(request.targetCoordinate, intent.coordinate, 'Original source scout coordinate intent mismatch.');
    assert.ok(intent.printedCoordinates?.includes(request.targetCoordinate), 'Only an actually printed source coordinate is offered.');
    if (request.entitlementId === 'comms-officer') {
      assert.equal(actor.replacementRoleId, 'comms-officer', 'The actual Comms replacement source holder is required.');
      assert.equal(actor.activeConsoleRoleId, null, 'Comms replacement source holder cannot hold an old core console.');
      assert.equal(actor.replacementStatus, null, 'Complete the genuine source reassignment before scanning.');
    } else {
      assert.equal(actor.assignedRoleId, entitlementRoles[request.entitlementId], 'Original source scout holder is required.');
      assert.equal(actor.replacementRoleId, null, 'A historical core assignment cannot confer source craft ownership.');
    }
  }
  if (endpoint === 'resolvePendingScoutRequest') assert.equal(request.requestId, intent.requestId, 'Only the genuinely pending source request can be recovered.');
  if (endpoint === 'unlockPressAirspace') assert.equal(actor.profileRoleId, 'admiral', 'Use the original Admiral source control.');
  return request;
}

const sourceStatusPairs = { requestScout: ['requested', 'replayed'], resolvePendingScoutRequest: ['resolved', 'replayed'],
  sendScoutTaxiCourier: ['committed', 'replayed'], sendScoutTaxiTransfer: ['committed', 'replayed'] };
export function assertNavigationScoutReplay(endpoint, result, replay) {
  assert.ok(!['triggerDradisContact', 'unlockPressAirspace'].includes(endpoint), 'Source idempotent replay is unsupported.');
  if (sourceStatusPairs[endpoint]) {
    assert.ok(sourceStatusPairs[endpoint].includes(result?.status) && sourceStatusPairs[endpoint].includes(replay?.status),
      'Both source receipt statuses are required before exact comparison.');
    assert.equal(replay.status, 'replayed', 'The source SDK recovery must return the original replay status.');
  }
  const comparable = value => {
    if (!record(value)) return value;
    if (sourceStatusPairs[endpoint]?.includes(value.status)) {
      const rest = { ...value }; delete rest.status; return rest;
    }
    return value;
  };
  assert.deepEqual(comparable(replay), comparable(result), 'Exact original receipt must retain every server consequence and draw.');
}

export function assertNavigationScoutCost(endpoint, result, observed) {
  if (endpoint === 'jumpShip' && result.status === 'jumped') {
    assert.ok(counter(result.fuelCost), 'Source jump fuel cost is required.');
    assert.equal(observed.beforeFuel - observed.afterFuel, result.fuelCost, 'Actual jump fuel cost must be paid exactly once.');
    assert.equal(observed.afterFuel, result.remainingFuel, 'Actual remaining fuel must match the receipt.');
    assert.equal(observed.chargedBefore, true, 'The actual Jump Drive charge is required.');
    assert.equal(observed.chargedAfter, false, 'The source Jump Drive charge must be consumed.');
  } else if (endpoint === 'sendScoutTaxiTransfer' && result.kind === 'fuel') {
    assert.ok(result.units === 1 || result.units === 2, 'Source taxi fuel cost is invalid.');
    assert.equal(observed.beforeFuel - observed.afterFuel, result.units, 'Source taxi fuel must be paid exactly once.');
    assert.equal(observed.afterTargetFuel - observed.beforeTargetFuel, result.units, 'Actual destination must receive the source fuel.');
    assert.equal(observed.afterFuel, result.sourceFuelRemaining, 'Source fuel receipt must match the current ledger.');
  } else assert.fail('This source cost requires an actual supported paid consequence.');
}

export function validateScoutBundle(bundle, { actor, reply }) {
  keys(bundle, ['report', 'result', 'note']);
  const { report, result, note } = bundle;
  keys(report, ['requestId', 'cycle', 'entitlementId', 'targetCoordinate', 'status', 'noteId']);
  keys(result, ['type', 'sessionId', 'requestId', 'requesterUid', 'sourceId', 'cycle', 'targetCoordinate', 'systemFact']);
  keys(note, ['type', 'id', 'cycle', 'targetCoordinate', 'systemFact', 'recordedAt']);
  assert.equal(report.status, 'resolved'); assert.equal(result.type, 'private-scout-result'); assert.equal(note.type, 'player-discovery-note');
  assert.equal(result.requesterUid, actor.uid, 'The private scout requester must remain the original source actor.');
  assert.equal(result.sessionId, actor.sessionId);
  for (const key of ['requestId', 'cycle', 'targetCoordinate']) {
    assert.equal(report[key], reply[key], 'Private report source mismatch.');
    assert.equal(result[key], reply[key], 'Private result source mismatch.');
  }
  assert.equal(report.entitlementId, reply.entitlementId); assert.equal(result.sourceId, reply.entitlementId);
  assert.ok(/^[a-f0-9]{64}$/.test(report.noteId)); assert.equal(note.id, report.noteId, 'Private note identity mismatch.');
  assert.equal(note.cycle, report.cycle); assert.equal(note.targetCoordinate, report.targetCoordinate);
  assert.ok(Number.isFinite(Date.parse(note.recordedAt)), 'Private note date is invalid.');
  for (const fact of [result.systemFact, note.systemFact]) {
    keys(fact, ['coordinate', 'code', 'title']); assert.equal(fact.coordinate, report.targetCoordinate);
    assert.ok(/^[A-P]$/.test(fact.code) && typeof fact.title === 'string' && fact.title.length > 0 && fact.title.length <= 160,
      'Private scout fact is malformed.');
  }
  assert.deepEqual(note.systemFact, result.systemFact, 'The saved private note must preserve the exact source fact.');
  return bundle;
}

export function validateScoutTaxiDelivery(notes, { request, actor, targetGroupId }) {
  keys(notes, ['groupId', 'messages']);
  assert.equal(notes.groupId, targetGroupId, 'The delivered source note must be in the actual target group.');
  const anchor = request.shuttleId === 'starlight' ? 'aegis' : request.shuttleId === 'hummingbird' ? 'quellon' : null;
  assert.ok(anchor && Array.isArray(notes.messages), 'The source courier notes are malformed.');
  const candidates = notes.messages.filter(note => note.id === request.requestId);
  assert.equal(candidates.length, 1, 'Only the actual courier source request can establish delivery.');
  const note = candidates[0]; keys(note, ['id', 'actorUid', 'text', 'sentAt']);
  assert.equal(note.actorUid, actor.uid, 'The source courier actor must match.');
  assert.equal(note.text, `Scout taxi from ${anchor}: ${request.text}`, 'The delivered source courier note must match its actual producer.');
  assert.ok(Number.isFinite(Date.parse(note.sentAt)), 'Source courier note time is invalid.');
  return note;
}

export function classifyScoutRecovery(log, reply, expected) {
  assert.ok(log && ['automatic', 'gm-recovery'].includes(log.resolutionMode), 'The actual source recovery mode is required.');
  assert.ok(['resolved', 'replayed'].includes(reply.status) && reply.result?.type === 'private-scout-result');
  for (const key of ['requestId', 'cycle', 'sourceId', 'targetCoordinate']) {
    assert.equal(log[key], expected[key], 'Source recovery log mismatch.');
    assert.equal(reply.result[key], expected[key], 'Source recovery result mismatch.');
  }
  assert.equal(reply.result.sessionId, expected.sessionId, 'Source recovery session mismatch.');
  assert.equal(reply.result.requesterUid, expected.requesterUid, 'Source recovery requester mismatch.');
  assert.deepEqual(log.systemFact, reply.result.systemFact, 'Source recovery fact mismatch.');
  return log.resolutionMode === 'gm-recovery' && reply.status === 'resolved' ? { state: 'observed' }
    : { state: 'pending', reason: log.resolutionMode === 'automatic' ? 'source-resolved-automatically' : 'source-recovery-already-committed' };
}

export function safeNavigationScoutEvidence(input) {
  keys(input, ['branch', 'status', 'roleId', 'actor', 'endpoint', 'request', 'result', 'replayResult', 'nextActor',
    'setupChoice', 'replay', 'costs', 'reason', 'httpStatus', 'errorCode'], ['branch', 'status']);
  assert.ok(NAV_SCOUT_BRANCHES.includes(input.branch), 'Unknown evidence branch.');
  assert.ok(['observed', 'pending', 'blocked', 'failed'].includes(input.status), 'Unknown evidence status.');
  if (input.roleId !== undefined) assert.ok(/^[a-z][a-z0-9-]{0,79}$/.test(input.roleId));
  if (input.endpoint !== undefined) assert.ok(/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(input.endpoint));
  if (input.nextActor !== undefined) assert.ok(['caller', 'gm', 'requester', 'current-holder', 'connected-passenger'].includes(input.nextActor));
  if (input.replay !== undefined) assert.ok(['exact-original', 'source-unsupported', 'read-only', 'pending'].includes(input.replay));
  if (input.reason !== undefined) assert.ok(/^[a-z][a-z0-9-]{0,79}$/.test(input.reason), 'Evidence reasons are fixed labels, not private source text.');
  if (input.httpStatus !== undefined) assert.ok(Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599);
  if (input.errorCode !== undefined) assert.ok(['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'PERMISSION_DENIED', 'NOT_FOUND',
    'UNAUTHENTICATED', 'ABORTED', 'ALREADY_EXISTS', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'INTERNAL', 'UNAVAILABLE',
    'UNKNOWN', 'OUT_OF_RANGE', 'UNIMPLEMENTED'].includes(input.errorCode), 'Unknown public evidence error code.');
  if (input.costs !== undefined) {
    keys(input.costs, ['fuel', 'cadenceAttempts', 'passengers'], []);
    assert.ok(Object.values(input.costs).every(counter), 'Evidence costs must be observed bounded counters.');
  }
  if (input.actor !== undefined) assert.ok(/^[a-f0-9]{16}$/.test(input.actor.uidHash ?? ''), 'Evidence needs a safe original identity hash.');
  return { branch: input.branch, status: input.status,
    ...(input.roleId ? { roleId: input.roleId } : {}), ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    ...(input.actor ? { uidHash: input.actor.uidHash, cycle: input.actor.cycle,
      groupHash: navigationScoutHash(input.actor.groupId).slice(0, 16),
      navigationRevision: input.actor.navigationRevision, fleetPartitionRevision: input.actor.fleetPartitionRevision } : {}),
    ...(input.request !== undefined ? { requestFingerprint: navigationScoutHash(input.request) } : {}),
    ...(input.result !== undefined ? { resultFingerprint: navigationScoutHash(input.result) } : {}),
    ...(input.replayResult !== undefined ? { replayFingerprint: navigationScoutHash(input.replayResult) } : {}),
    ...(input.nextActor ? { nextActor: input.nextActor } : {}), ...(input.replay ? { replay: input.replay } : {}),
    ...(input.costs ? { costs: { ...input.costs } } : {}), ...(input.reason ? { reason: input.reason } : {}),
    ...(input.httpStatus !== undefined ? { httpStatus: input.httpStatus } : {}), ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    setupChoice: input.setupChoice === true };
}

export function summarizeNavigationScoutBranches(rows, required = []) {
  assert.ok(Array.isArray(required) && required.every(branch => NAV_SCOUT_BRANCHES.includes(branch)), 'Unknown required branch.');
  assert.equal(new Set(required).size, required.length, 'Duplicate required branches.');
  const latest = new Map(rows.map(row => [row.branch, row]));
  const observed = [...latest.values()].filter(row => row.status === 'observed').map(row => row.branch);
  const pending = [...latest.values()].filter(row => row.status !== 'observed').map(row => row.branch);
  for (const branch of required) assert.ok(observed.includes(branch), `Required ${branch} has no completed observed source procedure.`);
  return { actualAcceptance: false, observed, pending, required: [...required] };
}

/** Observe the real UI request first. SDK use is restricted to its exact supported receipt replay. */
export async function captureNavigationScoutUiReceipt({ surface, endpoint, original, intent, inspect, choose,
  waitForResponse, record: save, timeoutMs = 60_000, consequenceGroups, now = Date.now }) {
  assert.ok(timeoutMs > 0 && timeoutMs <= 60_000, 'The receipt stage budget cannot exceed 60 seconds.');
  const deadline = now() + timeoutMs;
  const withinBudget = () => assert.ok(now() < deadline, 'Original source UI receipt deadline expired.');
  assertNavigationScoutActor(await inspect(), original);
  withinBudget();
  const response = await observeUiReceipt({ page: surface.page, waitForResponse: waitForResponse ?? (() => surface.page.waitForResponse(
    response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`),
    { timeout: timeoutMs })), choose });
  const body = await response.json(); const request = structuredClone(response.request().postDataJSON()?.data);
  const result = body.result;
  save?.({ request, result, httpStatus: response.status(), errorCode: body.error?.status, replay: 'pending' });
  withinBudget();
  assert.equal(response.status(), 200, 'Actual source UI request was rejected.');
  assertNavigationScoutRequest(endpoint, request, original, intent);
  assert.ok(record(result) && result.status !== 'stale', 'Actual source UI receipt is stale or rejected.');
  if (result.requestId !== undefined) assert.equal(result.requestId, request.requestId, 'Source receipt request identity changed.');
  if (result.actorUid !== undefined) assert.equal(result.actorUid, original.uid, 'Original source receipt actor changed.');
  if (result.turn !== undefined) assert.equal(result.turn, original.cycle, 'Original source receipt cycle changed.');
  if (result.phase !== undefined) assert.equal(result.phase, original.phase, 'Original source receipt phase changed.');
  if (result.idempotencyKey !== undefined) assert.equal(result.idempotencyKey, request.requestId, 'Original source receipt request changed.');
  const after = async () => {
    const current = await inspect();
    if (current.groupId !== original.groupId && consequenceGroups) {
      assertNavigationScoutConsequenceActor(current, original, { endpoint, result, shipGroups: await consequenceGroups(result) });
    } else assertNavigationScoutActor(current, original);
  };
  await after();
  withinBudget();
  if (!Object.hasOwn(request, 'requestId')) return { request, result, replay: 'source-unsupported' };
  const recovery = await surface.callable(endpoint, structuredClone(request));
  await after();
  withinBudget();
  assert.equal(recovery.status, 'committed', 'Exact original SDK receipt recovery was rejected.');
  assertNavigationScoutReplay(endpoint, result, recovery.result);
  return { request, result, replayResult: recovery.result, replay: 'exact-original' };
}
