import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { createPc10CallableTrace, pc10SafeCallableOutcome } from './pc10-proof-diagnostics.mjs';

// This is the explicit parent-authorized finite FUNCTIONAL contract. It never
// changes the strict collector/evaluator, repairs historical evidence, or claims
// to inspect every passive response. Native tests import only pure code here.
export const PC10_GATE2_FUNCTIONAL_CONTRACT = 'pc10-original-command-functional-gate2-v1';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const hashValue = value => hash(JSON.stringify(value));
const nativeDocumentHash = value => hash(`pc10-native-durable-document\0${value}`);
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const normalizeCode = value => typeof value === 'string' ? value.replace(/^functions\//, '').toLowerCase().replaceAll('_', '-') : null;
const EXPECTED_DENIAL_HTTP_STATUS = Object.freeze({ 'permission-denied': 403, 'failed-precondition': 400 });
const codeOf = reply => normalizeCode(reply?.code ?? reply?.error?.code ?? reply?.error?.status);
const time = value => Number.isSafeInteger(value) && value >= 0;
const generation = value => Number.isSafeInteger(value) && value >= 1;
const privateSources = new WeakMap();
const wire = value => value?.toDate instanceof Function ? value.toDate().toISOString()
  : Array.isArray(value) ? value.map(wire)
    : isRecord(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, wire(item)])) : value;
const allSettled = async operations => {
  const results = await Promise.allSettled(operations);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map(result => result.value);
};
const bounded = async (operation, ms, label) => {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(`${label} exceeded the unchanged ${ms}ms observation budget.`)), ms);
  })]); } finally { clearTimeout(timer); }
};

function assertBinding(binding, original, { allowWithdrawnMember = false } = {}) {
  assert.ok(binding && time(binding.observedAt), 'An actual original browser identity observation is required.');
  assert.equal(binding.authUid, original.uid, 'The actual browser Auth UID must remain the original UID.');
  assert.equal(binding.contextHash, original.contextHash, 'The independent original context handle must be retained.');
  assert.ok(validHash(binding.nativeDocumentHash), 'The original native-bound document is required.');
  if (allowWithdrawnMember && binding.storeUid == null && binding.sessionId == null) return;
  assert.equal(binding.storeUid, original.uid, 'The actual mounted store actor must be the original UID.');
  assert.equal(binding.sessionId, original.sessionId, 'The actual mounted browser session must be the original SID.');
  assert.equal(binding.activeConsoleRoleId, original.roleId, 'The original console binding must be retained.');
  assert.equal(binding.assignedRoleId ?? null, original.roleId === 'press-officer' ? null : original.roleId);
  assert.equal(binding.seatId ?? null, original.roleId === 'press-officer' ? null : original.roleId);
}

function assertSource(source, original, { allowDisconnected = false } = {}) {
  assert.equal(source?.uid, original.uid, 'Read-only authority must identify the original UID.');
  assert.equal(source?.sessionId, original.sessionId, 'Read-only authority must identify the original SID.');
  assert.equal(source?.roleId, original.roleId);
  assert.ok(time(source.checkedAt), 'A timed read-only source observation is required.');
  assert.equal(source.phase, 'active'); assert.equal(source.currentTurn, 1);
  assert.equal(source.nonKicked, true);
  assert.ok(generation(source.generation), 'The source generation must remain valid.');
  if (source.noReplacementOrEscape !== undefined) assert.equal(source.noReplacementOrEscape, true);
  if (source.configuredRoleMatches !== undefined) assert.equal(source.configuredRoleMatches, true);
  if (original.roleId === 'gm') {
    assert.ok(['gm', 'player'].includes(source.playerRole), 'Normal GM resume/claim must preserve the original actor.');
    if (source.gmInstanceUid != null) assert.equal(source.gmInstanceUid, original.uid);
    return;
  }
  assert.equal(source.playerRole, 'player');
  assert.equal(source.assignedRoleId, original.roleId === 'press-officer' ? null : original.roleId);
  assert.equal(source.activeConsoleRoleId, original.roleId);
  assert.equal(source.seatId, original.roleId === 'press-officer' ? null : original.roleId);
  assert.ok(typeof source.groupId === 'string' && Array.isArray(source.vesselIds) && Array.isArray(source.craftIds));
  if (original.scope) assert.deepEqual({ groupId: source.groupId,
    vesselIds: [...source.vesselIds].sort(), craftIds: [...source.craftIds].sort() }, original.scope,
  'This finite recovery proof must retain the original source-owned audience.');
  if (allowDisconnected && source.connected === false) return;
  assert.equal(source.connected, true); assert.equal(source.sameMembership, true);
  if (original.roleId === 'press-officer') {
    assert.equal(source.pressHolderUid, original.uid); assert.deepEqual(source.vesselIds, []);
  } else {
    assert.equal(source.seatHolderUid, original.uid); assert.equal(source.seatStatus, 'claimed');
  }
}

export function assertPc10FunctionalCommand(command) {
  assert.ok(command && time(command.registeredAt) && time(command.issuedAt) && time(command.completedAt)
    && command.registeredAt <= command.issuedAt && command.issuedAt <= command.completedAt && command.failedAt == null,
  'Every registered command needs its original awaited completion.');
  assert.equal(command.data?.sessionId, command.original?.sessionId, 'The registered command must retain its original SID.');
  const recovery = command.name === 'resumeSession' && command.beforeSource?.connected === false;
  assertSource(command.beforeSource, command.original, { allowDisconnected: recovery });
  assertSource(command.afterSource, command.original);
  assert.equal(command.beforeSource.currentTurn, command.afterSource.currentTurn);
  assertPc10FunctionalSourceOrder(command);
  if (command.original.roleId !== 'gm') {
    assertBinding(command.beforeBinding, command.original, { allowWithdrawnMember: recovery });
    assertBinding(command.afterBinding, command.original);
    assert.equal(command.beforeBinding.nativeDocumentHash, command.afterBinding.nativeDocumentHash,
      'A command cannot be attributed across a replaced browser document.');
    if (command.name !== 'privateFirestoreRead') {
      assert.ok(command.invocation && time(command.invocation.startedAt) && time(command.invocation.completedAt),
        'Retain the existing within-invocation native document witness.');
      assert.equal(command.invocation.nativeDocumentHash, command.beforeBinding.nativeDocumentHash);
      assert.ok(command.invocation.startedAt >= command.issuedAt && command.invocation.completedAt <= command.completedAt);
    }
  }
  assert.equal(command.validation?.passed, true, 'The ORIGINAL SDK result must be validated.');
  if (command.expectedDenial) {
    assert.notEqual(command.reply?.status, 200);
    assert.equal(codeOf(command.reply), command.expectedDenial, 'The exact expected denial code is required.');
  } else assert.equal(command.reply?.status, 200, 'An unclassified command failure cannot qualify.');
  if (command.name === 'getCurrentMemberSession') assertPc10CommandedMemberProjection({ reply: command.reply,
    original: command.original, before: command.beforeSource, after: command.afterSource });
  return true;
}

export function assertPc10FunctionalSourceOrder(command) {
  assert.ok(time(command.issuedAt) && time(command.completedAt));
  assert.ok(time(command.beforeSource?.checkedAt) && command.beforeSource.checkedAt <= command.issuedAt,
    'The source-before point must precede THIS original invocation.');
  assert.ok(time(command.afterSource?.checkedAt) && command.afterSource.checkedAt >= command.completedAt,
    'The source-after point must follow THIS original reply, never precede it.');
  if (command.beforeBinding) assert.ok(time(command.beforeBinding.observedAt) && command.beforeBinding.observedAt <= command.issuedAt);
  if (command.afterBinding) assert.ok(time(command.afterBinding.observedAt) && command.afterBinding.observedAt >= command.completedAt);
  if (command.invocation) assert.ok(command.invocation.startedAt >= command.issuedAt && command.invocation.completedAt <= command.completedAt);
  return true;
}

// Independent allowlists from memberSession.ts and index.publicMemberSessionSource.
// Do not import the product projection to adjudicate its own privacy result.
const PUBLIC_FIELDS = new Set(('id name joinCode phase currentTurn playerCount chartId expansion turnLimit setupConfirmed '
  + 'chartSelectionLocked configurationLocked setupRevision setup activeVesselIds activeRoleIds capybaraEnabled dioneEnabled '
  + 'universalArbourEnabled fleetPartitionRevision wolfCultEnabled pressEnabled pressClaimed pressAvailabilityRevision '
  + 'gmControlsLocked turnPhase turnState turnStartAnnouncement pursuitEmergencyWindow gameOutcome survivorOutcome '
  + 'fleetRedAlert fleetTicker pressDispatch debriefMode singlePlayerDemo fullGameDemo presidentialElection presidentialOffices '
  + 'currentMemberBallotSubmitted currentMemberIsPresident createdAt updatedAt ownerUid dradisContactTriggeredAt').split(' '));
const VESSEL_MAPS = ('shipResources shipDamage shipUpgrades shipUnrest shipMutinies shipSurvivors shipConsoleLocks '
  + 'vesselActionRevisions shipJumpStates shipJumpTransitions populationAlerts unrestAlerts maintenanceCycles smallShipStates').split(' ');
const CRAFT_MAPS = 'shuttleControl shuttleCargo shuttleFuelled shuttleEvacuations serviceShuttleRecharges retainedShuttles'.split(' ');
const DETAILS = { highwallMining: 'highwall', boaRecycling: 'boa', maliadesState: 'maliades',
  philiaRepairs: 'philia', blacksmithRepairs: 'blacksmith', macawRepairs: 'macaw', chacauRepairs: 'chacau', allyRepairs: 'ally',
  fighterWingCounts: 'aegis', pdfEscortWing: 'aegis', admiralDirectives: 'aegis', presidentWorkspace: 'dione',
  politicalCapital: 'dione', baseCapybaraCargo: 'capybara-small', warriorCargo: 'warrior',
  gorgoneionRepairDrones: 'gorgoneion', warriorRepairDrones: 'warrior', voyage33Admission: 'voyage-33',
  voyage33Maintenance: 'voyage-33', resolvedCrisisOutcome: 'dione' };
const ARRAY_FIELDS = 'admittedVesselIds shuttleDockings shuttleVisitLog confettiUsedShipIds memberSessionScope quarantineDocking'.split(' ');
const SESSION_FIELDS = new Set([...PUBLIC_FIELDS, ...VESSEL_MAPS, ...CRAFT_MAPS, ...Object.keys(DETAILS), ...ARRAY_FIELDS]);
const SERVER_ONLY_KEYS = new Set(('memberShipIds memberUids pressHolderUid loyaltyAssignments wolfAssignments '
  + 'secrets serverState candidateDeck crisisDeck damageDeck undrawnCards privateLoyalty gmAccessCode gmAccessSecret '
  + 'identityHash idToken refreshToken accessToken password').split(' '));
function noPrivateKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!SERVER_ONLY_KEYS.has(key), `A server-only field reached the original SDK projection: ${key}.`);
    noPrivateKeys(item);
  }
}
function assertAudienceSession(session, original, before, after) {
  assert.ok(isRecord(session));
  assert.ok(Object.keys(session).every(key => SESSION_FIELDS.has(key)), 'An unlisted session/private field reached the original SDK projection.');
  noPrivateKeys(session);
  assert.equal(session.id, original.sessionId); assert.equal(session.phase, after.phase); assert.equal(session.currentTurn, after.currentTurn);
  assert.deepEqual(before.vesselIds, after.vesselIds, 'The independent source vessel audience cannot drift during a privacy command.');
  assert.deepEqual(before.craftIds, after.craftIds); assert.equal(before.groupId, after.groupId);
  assert.deepEqual(session.memberSessionScope, { groupId: after.groupId, vesselIds: after.vesselIds, craftIds: after.craftIds },
    'The ORIGINAL projection audience must equal the independent current source whitelist.');
  const ships = new Set(after.vesselIds), craft = new Set(after.craftIds);
  for (const key of [...VESSEL_MAPS, ...CRAFT_MAPS]) {
    if (session[key] === undefined) continue;
    assert.ok(isRecord(session[key]));
    const audience = VESSEL_MAPS.includes(key) ? ships : craft;
    assert.ok(Object.keys(session[key]).every(id => audience.has(id)), `Foreign ${key} data is forbidden.`);
  }
  for (const key of ['populationAlerts', 'unrestAlerts']) if (session[key] !== undefined) assert.deepEqual(session[key], {});
  for (const [key, id] of Object.entries(DETAILS)) if (session[key] !== undefined) {
    assert.ok(ships.has(id) || craft.has(id), `Foreign detail ${key} is forbidden in this finite, unchanged-office scenario.`);
    if (Array.isArray(session[key]?.hosts)) assert.ok(session[key].hosts.every(host => ships.has(host.shipId)));
    if (session[key]?.hostShipId) assert.ok(ships.has(session[key].hostShipId));
  }
  for (const id of session.admittedVesselIds ?? []) assert.ok(ships.has(id));
  for (const id of session.confettiUsedShipIds ?? []) assert.ok(ships.has(id) || craft.has(id));
  for (const row of [...(session.shuttleDockings ?? []), ...(session.shuttleVisitLog ?? [])]) {
    assert.ok(craft.has(row.shuttleId));
    assert.ok(ships.has(row.shipId) || original.roleId === 'press-officer' && row.shuttleId === 'snn-press-shuttle');
  }
  if (session.quarantineDocking) {
    assert.ok(session.quarantineDocking.affectedShipIds.every(id => ships.has(id)));
    assert.ok(Object.keys(session.quarantineDocking.acceptedByShip ?? {}).every(id => ships.has(id)));
  }
  if (original.roleId === 'press-officer') {
    assert.deepEqual(after.vesselIds, []);
    assert.ok(after.craftIds.every(id => id === 'snn-press-shuttle'), 'This finite Press proof has only its source-owned SNN craft.');
    const snn = session.shuttleControl?.['snn-press-shuttle'];
    if (snn) { assert.equal(snn.holderUid, original.uid); assert.equal(snn.ownerRoleId, 'press-officer'); }
  }
}
export function assertPc10CommandedMemberProjection({ reply, original, before, after }) {
  assert.equal(reply?.status, 200); const result = reply.result;
  assert.ok(isRecord(result) && Object.keys(result).every(key => ['type', 'sessionId', 'actorUid', 'groupId',
    'connectionGeneration', 'assignedRoleId', 'activeConsoleRoleId', 'currentActorBerthAuthority', 'session'].includes(key)));
  assert.equal(result.type, 'current-member-session'); assert.equal(result.actorUid, original.uid);
  assert.equal(result.sessionId, original.sessionId); assert.equal(result.groupId, after.groupId);
  assert.equal(result.assignedRoleId, after.assignedRoleId); assert.equal(result.activeConsoleRoleId, after.activeConsoleRoleId);
  assert.ok(generation(result.connectionGeneration) && result.connectionGeneration >= before.generation
    && result.connectionGeneration <= after.generation, 'The original generation must lie in its authoritative invocation interval.');
  if (after.berthMapPresent !== undefined) assert.equal(Object.hasOwn(result, 'currentActorBerthAuthority'), after.berthMapPresent,
    'The source-owned berth map determines whether the projection carries explicit berth authority.');
  if (Object.hasOwn(result, 'currentActorBerthAuthority')) {
    assert.equal(after.berthMapPresent, true, 'An explicit berth field needs an independent source map witness.');
    const witnessedBerth = typeof after.berthShipId === 'string' && after.vesselIds.includes(after.berthShipId);
    if (!witnessedBerth) assert.equal(result.currentActorBerthAuthority, null,
      'A source actor with no audience-owned berth, including Press, must retain explicit null authority.');
    else assert.deepEqual(result.currentActorBerthAuthority, { sessionId: original.sessionId, actorUid: original.uid,
      groupId: after.groupId, role: 'player', connectionGeneration: result.connectionGeneration,
      assignedRoleId: after.assignedRoleId, activeConsoleRoleId: after.activeConsoleRoleId,
      replacementRoleId: null, replacementStatus: null, shipId: after.berthShipId });
  }
  assertAudienceSession(result.session, original, before, after);
  return true;
}

export function assessPc10FunctionalTransport({ commands = [], observations = [], failures = [], drains = [],
  transitions = [], historicalRecord, originals = new Map() } = {}) {
  const hardFailures = [], instrumentationLimits = [], verifiedCommands = new Set();
  if (historicalRecord) hardFailures.push({ category: 'historical-run-is-not-new-functional-evidence' });
  if (!commands.length) hardFailures.push({ category: 'no-original-command-evidence' });
  for (const command of commands) {
    try { assertPc10FunctionalCommand(command); verifiedCommands.add(command); }
    catch (error) { hardFailures.push({ commandId: command.commandId, roleId: command.roleId, category: 'unverified-original-command', message: error.message }); }
  }
  const cancellation = observation => ['cancelled-during-planned-offline', 'cancelled-during-planned-navigation'].includes(observation.observationDisposition)
    || transitions.some(entry => entry.outcome === 'completed' && entry.roleId === observation.roleId &&
      observation.requestFinishedAt == null && observation.bodyCompletedAt == null && time(observation.requestFailedAt) &&
      observation.requestFailedAt >= entry.startedAt && observation.requestFailedAt <= (entry.endedAt ?? entry.completedAt) &&
      (entry.kind === 'offline' && observation.transportError === 'internet-disconnected'
        || entry.kind === 'reload' && observation.transportError === 'aborted'));
  const bodyGap = observation => observation.status === 200 && observation.requestFailedAt == null &&
    time(observation.requestFinishedAt) && observation.bodyCompletedAt == null &&
    (observation.bodyFailureStage == null || observation.bodyFailureStage === 'native-get-response-body'
      && ['body-unavailable', 'resource-not-found', 'content-evicted'].includes(observation.bodyReadFailureReason)) &&
    ['nativeDocumentHash', 'nativeContextHash', 'nativeFrameHash', 'nativeLoaderHash', 'actorHash', 'sessionHash'].every(key => validHash(observation[key]));
  // An unread native denial is qualified only by one COMPLETE original SDK
  // invocation and its original Auth/source/document interval. This records
  // semantic denial evidence, never a replacement native body or denial code.
  const expectedDenialGapCommand = observation => {
    if (observation.captureMode !== 'native-durable' || observation.transport !== 'independent-browser-SDK'
      || ![403, 400].includes(observation.status) || observation.requestFailedAt != null || observation.transportError != null
      || observation.observationDisposition != null || observation.bodyCompletedAt != null || observation.bodyHash != null
      || observation.denialCode !== null || !['completedAt', 'bodyObservedAt', 'byteLength', 'resultActorHash',
        'resultSessionHash', 'resultRequestHash', 'resultGroupHash', 'httpOutcome', 'resultStatus', 'revision',
        'connectionGeneration'].every(key => observation[key] == null)
      || observation.bodyFailureStage !== 'native-get-response-body' || observation.bodyReadFailureReason !== 'body-unavailable'
      || observation.failureCategory !== 'response-observation-unavailable'
      || !['protocolRequestHash', 'nativeDocumentHash', 'nativeContextHash', 'nativeFrameHash', 'nativeLoaderHash',
        'actorHash', 'sessionHash', 'projectHash'].every(key => validHash(observation[key]))
      || ![observation.issuedAt, observation.headersReceivedAt, observation.requestFinishedAt,
        observation.bodyObservationFailedAt, observation.nativeDocumentWitnessObservedAt].every(time)
      || observation.startedAt !== observation.issuedAt || observation.nativeRequestObservedAt !== observation.issuedAt
      || observation.nativeDocumentWitnessObservedAt > observation.issuedAt
      || observation.headersReceivedAt < observation.issuedAt || observation.requestFinishedAt < observation.headersReceivedAt
      || observation.bodyObservationFailedAt < observation.requestFinishedAt
      || observations.filter(value => value.protocolRequestHash === observation.protocolRequestHash).length !== 1) return null;
    const candidates = commands.filter(command => command.roleId === observation.roleId && command.name === observation.name
      && time(command.invocation?.startedAt) && time(command.invocation?.completedAt)
      && observation.issuedAt >= command.invocation.startedAt && observation.issuedAt <= command.invocation.completedAt);
    if (candidates.length !== 1) return null;
    const command = candidates[0], original = originals.get(observation.roleId);
    if (!original || !verifiedCommands.has(command) || command.roleId !== original.roleId
      || command.kind !== 'original-functional-proof-command' || !isRecord(original.scope)
      || typeof original.scope.groupId !== 'string' || !Array.isArray(original.scope.vesselIds) || !Array.isArray(original.scope.craftIds)
      || command.original.uid !== original.uid || command.original.sessionId !== original.sessionId
      || command.original.contextHash !== original.contextHash || !validHash(original.contextHash)
      || command.invocation.kind !== 'explicit-sdk-invocation' || command.invocation.roleId !== command.roleId
      || command.invocation.name !== command.name || command.invocation.nativeDocumentHash !== observation.nativeDocumentHash
      || observation.requestFinishedAt > command.invocation.completedAt
      || observation.status !== EXPECTED_DENIAL_HTTP_STATUS[command.expectedDenial]
      || codeOf(command.reply) !== command.expectedDenial
      || command.registeredEndpoint !== command.name
      || command.registeredRequestFingerprint !== hashValue({ name: command.name, actorUid: original.uid, data: command.data })
      || command.trace?.transport !== 'independent-browser-SDK' || command.trace.name !== command.name
      || command.trace.issuedAt !== command.issuedAt || command.trace.completedAt !== command.completedAt
      || command.trace.status !== 'denied' || normalizeCode(command.trace.denialCode) !== command.expectedDenial
      || observations.filter(value => value.roleId === command.roleId && value.name === command.name
        && value.issuedAt >= command.invocation.startedAt && value.issuedAt <= command.invocation.completedAt).length !== 1) return null;
    const trace = createPc10CallableTrace({ name: command.name, data: command.data, actorUid: original.uid,
      transport: 'independent-browser-SDK', startedAt: command.issuedAt });
    if (!trace || !['actorHash', 'sessionHash', 'requestHash'].every(key => observation[key] === trace[key] && command.trace[key] === trace[key])) return null;
    try {
      assertBinding(command.beforeBinding, original); assertBinding(command.afterBinding, original);
      assertSource(command.beforeSource, original); assertSource(command.afterSource, original);
    } catch { return null; }
    if (![command.beforeSource, command.afterSource].every(source => validHash(source.sourceHash)
      && source.presence?.actorHash === observation.actorHash && source.presence.sessionHash === observation.sessionHash
      && source.presence.projectHash === observation.projectHash && source.presence.roleId === command.roleId
      && source.presence.originalUidMatches === true && source.presence.sameSessionMembership === true
      && time(source.presence.checkedAt) && source.presence.checkedAt <= source.checkedAt)) return null;
    if (command.afterSource.presence.checkedAt < command.completedAt) return null;
    const matchingFailures = failures.filter(failure => failure.protocolRequestHash === observation.protocolRequestHash && failure.roleId === observation.roleId);
    if (matchingFailures.length !== 1 || matchingFailures[0].category !== 'response-observation-unavailable'
      || !['name', 'status', 'requestHash', 'nativeDocumentHash', 'nativeContextHash', 'nativeFrameHash', 'nativeLoaderHash',
        'nativeRequestObservedAt', 'bodyFailureStage', 'bodyReadFailureReason'].every(key => matchingFailures[0][key] === observation[key])) return null;
    return command;
  };
  const expectedDenialGaps = new Map(observations.map(observation => [observation, expectedDenialGapCommand(observation)]).filter(([, command]) => command));
  const recordedGap = observation => bodyGap(observation) || expectedDenialGaps.has(observation);
  const nativeFailure = (observation, category) => ({ category, roleId: observation.roleId, name: observation.name,
    protocolRequestHash: observation.protocolRequestHash, issuedAt: observation.issuedAt,
    nativeRequestObservedAt: observation.nativeRequestObservedAt, nativeDocumentHash: observation.nativeDocumentHash,
    actorHash: observation.actorHash, sessionHash: observation.sessionHash, status: observation.status,
    requestFinishedAt: observation.requestFinishedAt, requestFailedAt: observation.requestFailedAt });
  for (const observation of observations) {
    const original = originals.get(observation.roleId);
    if (original) {
      const identityHash = (kind, value) => hash(`security-denial-${kind}\0${value}`);
      if (observation.actorHash !== identityHash('actor', original.uid)
        || (observation.sessionHash ?? observation.resultSessionHash) != null
          && (observation.sessionHash ?? observation.resultSessionHash) !== identityHash('session', original.sessionId)) {
        hardFailures.push({ roleId: observation.roleId, protocolRequestHash: observation.protocolRequestHash,
          category: 'native-original-identity-discrepancy' });
      }
    } else if (originals.size) hardFailures.push({ roleId: observation.roleId, category: 'unknown-native-original-actor' });
    if (cancellation(observation)) continue;
    if (observation.requestFinishedAt == null && observation.requestFailedAt == null) {
      hardFailures.push(nativeFailure(observation, 'unfinished-native-terminal-outcome'));
    }
    if (observation.requestFailedAt != null) hardFailures.push({ category: 'unexpected-native-transport-failure', roleId: observation.roleId });
    if (observation.status !== 200 && observation.status != null) {
      const classifiedDenial = expectedDenialGaps.has(observation) || commands.some(command => verifiedCommands.has(command)
        && command.roleId === observation.roleId && command.name === observation.name
        && command.expectedDenial && codeOf(command.reply) === command.expectedDenial
        && observation.status === EXPECTED_DENIAL_HTTP_STATUS[command.expectedDenial]
        && normalizeCode(observation.denialCode) === command.expectedDenial
        && (command.data.requestId ? observation.requestHash === createPc10CallableTrace({ name: command.name, data: command.data,
          actorUid: command.original.uid, transport: 'independent-browser-SDK', startedAt: 0 }).requestHash
          : observation.issuedAt >= command.issuedAt && observation.issuedAt <= command.completedAt));
      if (!classifiedDenial) hardFailures.push({ category: 'unclassified-native-http-outcome', roleId: observation.roleId,
        name: observation.name, status: observation.status });
    }
    const expectedDenial = expectedDenialGaps.get(observation);
    if (recordedGap(observation)) instrumentationLimits.push({ roleId: observation.roleId, name: observation.name,
      protocolRequestHash: observation.protocolRequestHash, category: 'original-native-body-remains-uninspected',
      originalReplyKnown: false, commandedReplySubstitution: false, passivePrivacyStatus:
        expectedDenial || observation.name === 'getCurrentMemberSession' || observation.name === 'resumeSession' ? 'UNINSPECTED' : 'NOT_INSPECTED',
      ...(expectedDenial ? { wireBodyStatus: 'UNINSPECTED', semanticExpectedDenial: {
        commandId: expectedDenial.commandId, code: expectedDenial.expectedDenial, httpStatus: observation.status } } : {}) });
    if (observation.status == null && observation.requestFailedAt == null) hardFailures.push(nativeFailure(observation, 'unfinished-native-http-outcome'));
  }
  for (const failure of failures) {
    const candidates = observations.filter(observation => failure.protocolRequestHash && observation.protocolRequestHash === failure.protocolRequestHash
      && observation.roleId === failure.roleId);
    const observation = candidates.length === 1 ? candidates[0] : null;
    const capturedGap = observation && (bodyGap(observation) && ['response-observation-unavailable', 'native-body-incomplete', 'observation-drain-timeout'].includes(failure.category)
      || expectedDenialGaps.has(observation) && failure.category === 'response-observation-unavailable');
    const plannedCancellation = observation && cancellation(observation) && ['unexpected-request-failure', 'response-observation-unavailable'].includes(failure.category);
    if (!capturedGap && !plannedCancellation && !(failure.category === 'observation-drain-timeout' && drains.some(entry => entry.roleId === failure.roleId && entry.outcome === 'failed')
      && observations.some(value => value.roleId === failure.roleId && recordedGap(value)))) hardFailures.push({ ...failure, category: failure.category ?? 'unclassified-native-failure' });
  }
  const incomplete = failures.length || drains.some(value => value.outcome !== 'completed')
    || observations.some(value => value.status !== 200 || !value.bodyHash || value.requestFailedAt != null || value.bodyCompletedAt == null);
  return { contract: PC10_GATE2_FUNCTIONAL_CONTRACT, functionalStatus: hardFailures.length ? 'FAILED' : 'PASSED',
    commandedPrivacyStatus: hardFailures.length ? 'FAILED' : commands.some(value => value.name === 'getCurrentMemberSession') ? 'PASSED' : 'NOT_PROVED',
    strictTransportStatus: incomplete ? 'INCOMPLETE' : 'COMPLETE',
    passivePrivacyStatus: instrumentationLimits.some(value => value.passivePrivacyStatus === 'UNINSPECTED') ? 'UNINSPECTED' : 'NO_BODY_GAP_RECORDED',
    hardFailures, instrumentationLimits,
    limitation: 'Only original commanded SDK replies are privacy-validated; no claim that every passive wire body was inspected.' };
}

/** Exactly one original client.callable per command, not table.command + a
 * second SDK request. This equivalent ledger retains trace and outcome, while
 * GM continues through the original authenticated fixture.call wrapper. */
export function createPc10FunctionalCommand({ ledger, originals, clients, observeBinding, captureAuthority,
  gmCall, validateReply, clock = Date.now }) {
  return async (roleId, name, payload = {}, options = {}) => {
    const original = originals.get(roleId); assert.ok(original);
    const data = { sessionId: original.sessionId, ...payload };
    const entry = { commandId: randomUUID(), kind: 'original-functional-proof-command', roleId, name, original, data,
      registeredEndpoint: name === 'privateFirestoreRead' ? `Firestore/getDocFromServer/sessions/${data.sessionId}/${data.suffix}` : name,
      registeredRequestFingerprint: hashValue({ name, actorUid: original.uid, data }),
      expectedDenial: options.expectedDenial ?? null, registeredAt: clock(), issuedAt: null, completedAt: null, failedAt: null };
    ledger.push(entry);
    try {
      assert.equal(data.sessionId, original.sessionId, 'Reject a rebound SID before issuing the original command.');
      entry.beforeBinding = roleId === 'gm' ? null : await observeBinding(roleId);
      entry.beforeSource = await captureAuthority(roleId, name, data);
      assertSource(entry.beforeSource, original, { allowDisconnected: name === 'resumeSession' });
      if (roleId !== 'gm') assertBinding(entry.beforeBinding, original,
        { allowWithdrawnMember: name === 'resumeSession' && entry.beforeSource.connected === false });
      entry.issuedAt = clock();
      entry.trace = createPc10CallableTrace({ name, data, actorUid: original.uid, startedAt: entry.issuedAt,
        transport: roleId === 'gm' ? 'authenticated-emulator-HTTP' : 'independent-browser-SDK' });
      const client = clients.get(roleId);
      const reply = roleId === 'gm' ? await gmCall(name, data)
        : name === 'privateFirestoreRead' ? await client.privateRead(data.sessionId, data.suffix)
          : await client.callable(name, data, { retainPresenceAuthority: true });
      entry.completedAt = clock(); entry.reply = reply; // The ORIGINAL awaited reply/error is retained.
      entry.invocation = client?.sdkInvocationForReply?.(reply) ?? null;
      if (entry.trace) Object.assign(entry.trace, pc10SafeCallableOutcome(reply), { completedAt: entry.completedAt });
      entry.afterBinding = roleId === 'gm' ? null : await observeBinding(roleId);
      entry.afterSource = await captureAuthority(roleId, name, data);
      entry.validation = await validateReply(entry);
      assertPc10FunctionalCommand(entry);
      return reply;
    } catch (error) {
      entry.failedAt = clock(); entry.failure = { category: 'original-command-unavailable-or-invalid', message: error.message };
      throw error;
    }
  };
}

/** The original strict drain always runs and its failure remains recorded.
 * Existing offline/online methods already call public Playwright once. Only
 * reload may need the direct public seam when its strict pre-drain rejects on
 * qualified passive capture alone. No collector/client API is overwritten. */
export async function transitionPc10FunctionalBrowser({ roleId, kind, client, original, transitions, drains,
  observeBinding, captureAuthority, qualifyDrainGap, afterTransition = async () => {}, clock = Date.now }) {
  const intentStartedAt = clock();
  const record = { roleId, kind, intentStartedAt, startedAt: intentStartedAt, completedAt: null, outcome: 'pending', seam: 'existing-client-transition' };
  transitions.push(record);
  try {
    record.beforeBinding = await observeBinding(roleId); record.beforeSource = await captureAuthority(roleId);
    assertSource(record.beforeSource, original, { allowDisconnected: true });
    assertBinding(record.beforeBinding, original,
      { allowWithdrawnMember: kind === 'online' && record.beforeSource.connected === false });
    const drain = { roleId, stage: `before-${kind}`, startedAt: clock(), completedAt: null, outcome: 'pending' }; drains.push(drain);
    let gap;
    try { await client.drainObservedCalls(); drain.outcome = 'completed'; }
    catch (error) { drain.outcome = 'failed'; drain.failure = error.message;
      gap = await qualifyDrainGap(roleId); drain.functionalQualification = gap;
      assert.equal(gap.allowed, true, 'Only an already recorded passive instrumentation gap permits the public transition seam.');
    } finally { drain.completedAt = clock(); }
    record.apiStartedAt = clock(); record.startedAt = record.apiStartedAt;
    if (kind === 'reload' && gap) {
      record.seam = 'public-Playwright-after-recorded-passive-drain-gap';
      await client.page.reload();
    } else if (kind === 'reload') await client.reload();
    else await client.setOffline(kind === 'offline');
    record.apiCompletedAt = clock();
    await afterTransition(roleId, kind);
    record.afterBinding = await observeBinding(roleId); record.afterSource = await captureAuthority(roleId);
    assertSource(record.afterSource, original, { allowDisconnected: true });
    assertBinding(record.afterBinding, original,
      { allowWithdrawnMember: kind === 'online' && record.afterSource.connected === false });
    assert.equal(record.beforeBinding.contextHash, record.afterBinding.contextHash);
    if (kind === 'reload') assert.notEqual(record.beforeBinding.nativeDocumentHash, record.afterBinding.nativeDocumentHash, 'A genuine reload must replace the native-bound document.');
    else assert.equal(record.beforeBinding.nativeDocumentHash, record.afterBinding.nativeDocumentHash);
    assert.equal(record.beforeSource.currentTurn, record.afterSource.currentTurn);
    if (kind === 'offline') assert.equal(record.afterBinding.online, false);
    if (kind === 'online') assert.equal(record.afterBinding.online, true);
    record.outcome = 'completed';
  } catch (error) { record.outcome = 'failed'; record.failure = error.message; throw error; }
  finally { record.completedAt = clock(); }
  return record;
}

/** Finite command composition. Both original replay payloads and the fixed
 * 7/7/6 cohorts are retained. Every recovered state commands one original SDK
 * privacy projection for every actor, never a passive/body fallback. */
export async function runPc10Gate2FunctionalScenario(table, harness) {
  const { fixture } = table, roles = [...table.clients.keys()], stages = [], messageCohortSizes = [];
  assert.equal(roles.length, 21); assert.equal(fixture.roles.length, 20);
  await harness.assertRoster(); stages.push('original-21-independent-Auth-identities');
  const before = await fixture.session.get();
  const resumes = await allSettled(roles.map(role => harness.command(role, 'resumeSession')));
  await harness.recoveredPrivacy('initial-resume'); stages.push('21-original-resumes-and-commanded-privacy');
  await allSettled(roles.map(async role => {
    const replies = await allSettled([
      harness.privateRead(role, 'secrets/wolf-assignment'), harness.privateRead(role, 'serverState/candidates'),
      harness.command(role, 'listGmScoutResolutionLog', { instanceId: fixture.instanceId }, { expectedDenial: 'permission-denied' }),
    ]);
    for (const reply of replies) { assert.equal(reply.status, 'denied'); assert.equal(codeOf(reply), 'permission-denied'); }
  })); stages.push('42-original-private-Firestore-and-21-GM-read-denials');
  for (let offset = 0; offset < fixture.roles.length; offset += 7) {
    const batch = fixture.roles.slice(offset, offset + 7); messageCohortSizes.push(batch.length);
    const choices = batch.map(role => ({ role, payload: { requestId: randomUUID(),
      expectedGroupId: resumes[roles.indexOf(role)].result.player.fleetGroupId,
      text: `PC10 automated browser overlap // ${role}` } }));
    const committed = await allSettled(choices.map(({ role, payload }) => harness.command(role, 'sendFleetGroupMessage', payload)));
    const replayed = await allSettled(choices.map(({ role, payload }) => harness.command(role, 'sendFleetGroupMessage', payload)));
    assert.deepEqual(replayed, committed); await harness.assertMessages(choices, committed);
  } stages.push('20-original-group-notes-7-7-6-and-exact-replays');
  const pressPayload = { requestId: randomUUID(), text: 'PC10 automated overlapping-session rehearsal',
    expectedRevision: (await fixture.session.get()).get('pressDispatch')?.revision ?? 0 };
  const dispatch = await harness.command('press-officer', 'publishPressDispatch', pressPayload);
  assert.deepEqual(await harness.command('press-officer', 'publishPressDispatch', pressPayload), dispatch);
  await harness.assertPress(pressPayload, dispatch); stages.push('original-Press-dispatch-and-exact-replay');
  const requests = fixture.roles.map(role => { const original = fixture.seatClaimRequests[role]; assert.ok(original?.requestId); return original; });
  const claims = await allSettled(fixture.roles.map((role, i) => harness.command(role, 'claimSeat', requests[i])));
  const replayedClaims = await allSettled(fixture.roles.map((role, i) => harness.command(role, 'claimSeat', requests[i])));
  assert.deepEqual(replayedClaims, claims); await harness.assertClaims(requests, claims); stages.push('20-original-seat-retries-and-exact-replays');
  await allSettled(roles.map(role => harness.command(role, 'refreshPresence', { activeConsoleRoleId: role })));
  await harness.command(fixture.roles[1], 'startGame', { instanceId: fixture.instanceId, requestId: randomUUID(),
    expectedSetupRevision: before.get('setupRevision') }, { expectedDenial: 'permission-denied' });
  stages.push('21-original-presence-and-exact-GM-start-denial');
  await allSettled(roles.map(role => harness.transition(role, 'offline')));
  await allSettled(roles.map(role => harness.transition(role, 'online')));
  await harness.assertRecovered(); await harness.recoveredPrivacy('online');
  await allSettled(roles.map(role => harness.transition(role, 'reload')));
  await harness.assertRecovered(); await harness.recoveredPrivacy('reload');
  assert.equal((await fixture.session.get()).get('currentTurn'), before.get('currentTurn'));
  stages.push('21-genuine-offline-online-and-once-reloaded-original-identities');
  const qualifiedClients = new Map(roles.map(role => [role, { observe: table.clients.get(role).observe,
    setOffline: value => harness.transition(role, value ? 'offline' : 'online') }]));
  const naturalDisconnect = await harness.naturalDisconnect({ fixture, clients: qualifiedClients,
    command: (role, name, payload) => harness.command(role, name, payload,
      name === 'claimSeat' ? { expectedDenial: 'failed-precondition' } : {}), assertSameIdentity: harness.assertAuthIdentity });
  assert.equal(naturalDisconnect.passed, true);
  await harness.assertRecovered(); await harness.recoveredPrivacy('natural-expiry');
  stages.push('real-45s-lease-existing-scheduler-and-once-restored-clock');
  return { completedStages: stages, messageCohortSizes, naturalDisconnect };
}

export async function capturePc10Gate2SourceBinding(root, runnerPath) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean).sort();
  const trackedFiles = [];
  for (const path of tracked) trackedFiles.push({ path, sha256: hash(await readFile(join(root, path))) });
  const compiled = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path); else compiled.push({ path: relative(join(root, 'functions/lib'), path), sha256: hash(await readFile(path)) });
    }
  }
  await visit(join(root, 'functions/lib')); compiled.sort((a, b) => a.path.localeCompare(b.path));
  const javascript = compiled.filter(entry => entry.path.endsWith('.js'));
  const canonicalPc10Mjs = trackedFiles.filter(entry => entry.path.endsWith('.mjs') && /^(?:test-)?pc10-/.test(basename(entry.path)));
  return { bindingScheme: 'relative-path-and-byte-sha256-list-v1', sourceCommit: git(['rev-parse', 'HEAD']), trackedClean: git(['status', '--porcelain', '--untracked-files=no']) === '',
    trackedFileCount: trackedFiles.length, trackedFiles, trackedTreeSha256: hashValue(trackedFiles),
    compiledFileCount: compiled.length, compiledFiles: compiled, compiledTreeSha256: hashValue(compiled),
    javascriptFileCount: javascript.length, javascriptTreeSha256: hashValue(javascript), canonicalPc10Mjs,
    canonicalPc10MjsSha256: hashValue(canonicalPc10Mjs), externalRunner: { path: runnerPath, sha256: hash(await readFile(runnerPath)) } };
}

export async function createPc10Gate2FunctionalHarness(table, { root, directory }) {
  const { fixture, clients } = table;
  const originals = new Map([...clients].map(([roleId]) => [roleId, { roleId, sessionId: fixture.sessionId,
    uid: (roleId === 'press-officer' ? fixture.press : fixture.byRole(roleId)).localId,
    contextHash: hash(`pc10-functional-context-handle\0${randomUUID()}`) }]));
  originals.set('gm', { roleId: 'gm', sessionId: fixture.sessionId, uid: fixture.gm.localId });
  const ledger = [], drains = [], transitions = [], recoveredPrivacyStates = [];
  const observeBinding = async roleId => {
    const client = clients.get(roleId), original = originals.get(roleId);
    const actual = await bounded(client.page.evaluate(async () => {
      const { auth } = await import('/src/lib/firebase.ts');
      const resource = performance.getEntriesByType('resource').findLast(entry => {
        try { return new URL(entry.name).pathname === '/src/store/useSessionStore.ts'; } catch { return false; }
      });
      const { useSessionStore } = await import(resource?.name ?? '/src/store/useSessionStore.ts');
      const state = useSessionStore.getState(), current = auth().currentUser;
      return { authUid: current?.uid ?? null, storeUid: state.me?.uid ?? null, sessionId: state.session?.id ?? null,
        assignedRoleId: state.me?.assignedRoleId ?? null, activeConsoleRoleId: state.me?.activeConsoleRoleId ?? null,
        seatId: state.me?.seatId ?? null, documentId: globalThis[Symbol.for('pc10-proof-native-durable-document')] ?? null,
        online: navigator.onLine, observedAt: Date.now() };
    }), 10_000, `${roleId} actual original Auth/SID/document binding`);
    assert.match(actual.documentId ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    const { documentId, ...binding } = actual;
    return { ...binding, contextHash: original.contextHash, nativeDocumentHash: nativeDocumentHash(documentId) };
  };
  const captureAuthority = async (roleId, name, data = {}) => {
    const original = originals.get(roleId), base = `sessions/${fixture.sessionId}`;
    // Keep the established authority helper and its unchanged 10s observation
    // budget; the independent audience query is also a read-only transaction.
    const presence = roleId === 'gm' ? null : (await table.capturePresenceAuthority([roleId]))[0];
    const point = await bounded(fixture.db.runTransaction(async tx => {
      const paths = [base, `${base}/players/${original.uid}`, `activeMemberships/${original.uid}`,
        ...(roleId === 'gm' ? [`${base}/gmInstances/${fixture.instanceId}`] : roleId === 'press-officer' ? [] : [`${base}/seats/${roleId}`]),
        ...(data.requestId ? [`${base}/commandReceipts/${data.requestId}`, `${base}/seatMutationRequests/${data.requestId}`, `${base}/events/seat-claim-${data.requestId}`] : [])];
      const docs = await Promise.all(paths.map(path => tx.get(fixture.db.doc(path))));
      const [groups, departures] = await Promise.all([tx.get(fixture.session.collection('fleetGroups')), tx.get(fixture.session.collection('shuttleDepartures'))]);
      return { docs: new Map(docs.map(doc => [doc.ref.path, doc])), groups: groups.docs, departures: departures.docs };
    }, { readOnly: true }), 10_000, `${roleId} current source audience`);
    const raw = point.docs.get(base).data(), player = point.docs.get(`${base}/players/${original.uid}`).data();
    assert.ok(raw && player);
    const groups = point.groups.map(doc => doc.data());
    const entitled = groups.filter(group => Array.isArray(group.memberUids) && group.memberUids.includes(original.uid));
    if (roleId !== 'gm') assert.equal(entitled.length, 1, 'A unique source-owned group must contain the original UID.');
    const group = entitled[0];
    if (roleId !== 'gm') assert.equal(group.id, player.fleetGroupId);
    const ships = new Set(roleId === 'gm' ? raw.activeVesselIds : roleId === 'press-officer' ? [] : group.vesselIds);
    for (const [id, state] of Object.entries(raw.smallShipStates ?? {})) if (state.hostShipId && ships.has(state.hostShipId)) ships.add(id);
    const craft = new Set((raw.shuttleDockings ?? []).filter(row => ships.has(row.shipId)).map(row => row.shuttleId));
    for (const doc of point.departures) if (ships.size > 0 && doc.get('fleetGroupId') === group?.id && ['requested', 'in-transit'].includes(doc.get('status'))) craft.add(doc.id);
    for (const [id, retained] of Object.entries(raw.retainedShuttles ?? {})) if (retained.holderUid === original.uid) craft.add(id);
    const snn = raw.shuttleControl?.['snn-press-shuttle'];
    if (roleId === 'press-officer' && raw.pressHolderUid === original.uid && raw.pressEnabled !== false
      && snn?.ownerRoleId === 'press-officer' && snn.holderUid === original.uid) craft.add('snn-press-shuttle');
    const seat = point.docs.get(`${base}/seats/${roleId}`), membership = point.docs.get(`activeMemberships/${original.uid}`);
    const receipt = point.docs.get(`${base}/commandReceipts/${data.requestId}`);
    const authority = { roleId, uid: original.uid, sessionId: fixture.sessionId, checkedAt: Date.now(),
      sourceHash: hashValue(wire({ root: raw, player, groups })), presence,
      phase: raw.phase, currentTurn: raw.currentTurn, setupRevision: raw.setupRevision,
      connected: player.connected === true, nonKicked: player.kickedAt == null, playerRole: player.role,
      assignedRoleId: player.assignedRoleId ?? null, activeConsoleRoleId: player.activeConsoleRoleId ?? null,
      seatId: player.seatId ?? null, generation: player.connectionGeneration ?? 1,
      groupId: roleId === 'gm' ? 'gm' : group.id, vesselIds: [...ships], craftIds: [...craft],
      berthMapPresent: Object.hasOwn(group ?? {}, 'memberShipIds'),
      berthShipId: group?.memberShipIds?.[original.uid] ?? null,
      seatHolderUid: seat?.get('holderUid') ?? null, seatStatus: seat?.get('status') ?? null,
      sameMembership: membership?.exists === true && membership.get('sessionId') === fixture.sessionId,
      pressHolderUid: roleId === 'press-officer' ? raw.pressHolderUid : null,
      noReplacementOrEscape: player.replacementStatus == null && typeof player.replacementRoleId !== 'string' && player.escapeState == null,
      configuredRoleMatches: roleId === 'gm' ? true : presence.configuredRoleMatches,
      ...(roleId === 'gm' ? { gmInstanceId: fixture.instanceId,
        gmInstanceUid: point.docs.get(`${base}/gmInstances/${fixture.instanceId}`)?.get('uid') ?? null,
        gmInstanceConnected: point.docs.get(`${base}/gmInstances/${fixture.instanceId}`)?.get('connected') === true } : {}),
      lastSeenAtMs: player.lastSeenAt?.toMillis?.() ?? null,
      receiptHash: receipt?.exists ? hashValue(wire(receipt.data())) : null,
      seatRequestHash: data.requestId ? hashValue(wire(point.docs.get(`${base}/seatMutationRequests/${data.requestId}`)?.data() ?? null)) : null,
      seatEventHash: data.requestId ? hashValue(wire(point.docs.get(`${base}/events/seat-claim-${data.requestId}`)?.data() ?? null)) : null,
      pressDispatchHash: hashValue(wire(raw.pressDispatch ?? null)) };
    privateSources.set(authority, { raw, player, receipt: receipt?.data() });
    return authority;
  };
  const validateReply = entry => {
    if (entry.expectedDenial) { assert.equal(codeOf(entry.reply), entry.expectedDenial); return { passed: true, expectedDenial: entry.expectedDenial }; }
    assert.equal(entry.reply.status, 200); const result = entry.reply.result, source = entry.afterSource;
    if (entry.name === 'getCurrentMemberSession') assertPc10CommandedMemberProjection({ reply: entry.reply,
      original: entry.original, before: entry.beforeSource, after: source });
    else if (entry.name === 'resumeSession' && entry.roleId !== 'gm') {
      assert.equal(result.player.uid, entry.original.uid); assert.equal(result.player.sessionId, fixture.sessionId);
      assert.equal(result.player.assignedRoleId ?? null, source.assignedRoleId); assert.equal(result.player.seatId ?? null, source.seatId);
      assert.equal(result.player.activeConsoleRoleId, source.activeConsoleRoleId); assert.equal(result.player.fleetGroupId, source.groupId);
      assert.ok(result.player.connectionGeneration >= entry.beforeSource.generation && result.player.connectionGeneration <= source.generation);
      assertAudienceSession(result.session, entry.original, entry.beforeSource, source);
    } else if (entry.name === 'refreshPresence') {
      assert.equal(result.sessionId, fixture.sessionId); assert.notEqual(result.stationSelectionRequired, true);
      assert.ok(Object.keys(result).every(key => ['sessionId', 'stationSelectionRequired'].includes(key)));
      if (entry.roleId !== 'gm') assert.ok(source.lastSeenAtMs >= entry.issuedAt);
    } else if (entry.name === 'sendFleetGroupMessage') {
      assert.deepEqual(result, { status: 'committed', groupId: source.groupId, messageId: entry.data.requestId });
      assert.deepEqual(privateSources.get(source).receipt?.result, result);
    } else if (entry.name === 'publishPressDispatch') {
      assert.deepEqual(privateSources.get(source).receipt?.result, result);
      assert.equal(result.revision, entry.data.expectedRevision + 1);
    } else if (entry.name === 'claimSeat') {
      assert.equal(result.status, 'replayed'); assert.equal(result.seatId, entry.roleId);
      assert.equal(result.requestId, entry.data.requestId);
      assert.equal(result.holderUid, entry.original.uid);
      for (const field of ['receiptHash', 'seatRequestHash', 'seatEventHash', 'setupRevision']) assert.equal(source[field], entry.beforeSource[field], 'Original seat receipt retries cannot mutate casting again.');
    } else if (entry.name === 'resumeSession' && entry.roleId === 'gm') {
      assert.equal(result.player.uid, entry.original.uid); assert.equal(result.player.sessionId, fixture.sessionId);
      assert.equal(result.session.id, fixture.sessionId); assert.equal(result.session.phase, source.phase);
      assert.equal(result.session.currentTurn, source.currentTurn);
    } else if (entry.name === 'claimGmInstance') {
      assert.equal(result.instance.uid, entry.original.uid); assert.equal(result.instance.sessionId, fixture.sessionId);
      assert.equal(result.instance.id, fixture.instanceId); assert.equal(source.playerRole, 'gm');
      assert.equal(source.gmInstanceConnected, true);
    }
    return { passed: true, originalSdkResultHash: hashValue(entry.reply), sourceAudienceHash: hashValue({ groupId: source.groupId, vesselIds: source.vesselIds, craftIds: source.craftIds }) };
  };
  const command = createPc10FunctionalCommand({ ledger, originals, clients, observeBinding, captureAuthority, validateReply,
    gmCall: async (name, data) => {
      const payload = JSON.parse(Buffer.from(fixture.gm.idToken.split('.')[1], 'base64url').toString('utf8'));
      assert.equal(payload.sub ?? payload.user_id, originals.get('gm').uid, 'The actual original GM HTTP credential must bind this UID.');
      return fixture.call(fixture.gm, name, data);
    } });
  const assessment = () => assessPc10FunctionalTransport({ commands: ledger, originals,
    observations: [...clients.values()].flatMap(client => client.observedCalls),
    failures: [...clients.values()].flatMap(client => client.callableObservationFailures), drains, transitions });
  const assertAuthIdentity = async () => {
    await allSettled([...clients.keys()].map(async role => { const observed = await observeBinding(role); assert.equal(observed.authUid, originals.get(role).uid); }));
  };
  const assertRecovered = async ({ initializeScope = false } = {}) => {
    const { isFreshPc10BrowserRole } = await import('./pc10-browser-session-proof.mjs');
    await allSettled([...clients.keys()].map(async role => {
      await clients.get(role).until('Original same-UID role restored', state => isFreshPc10BrowserRole(state, role));
      const original = originals.get(role);
      assertBinding(await observeBinding(role), original);
      const authority = await captureAuthority(role); assertSource(authority, original);
      if (initializeScope) {
        assert.equal(Object.hasOwn(original, 'scope'), false, 'Original audience is bound once before the command sequence.');
        original.scope = Object.freeze({ groupId: authority.groupId,
          vesselIds: Object.freeze([...authority.vesselIds].sort()), craftIds: Object.freeze([...authority.craftIds].sort()) });
        Object.freeze(original);
      }
    }));
  };
  const transition = async (roleId, kind) => {
    const record = await transitionPc10FunctionalBrowser({ roleId, kind, client: clients.get(roleId), original: originals.get(roleId),
      transitions, drains, observeBinding, captureAuthority, qualifyDrainGap: async () => {
        const result = assessment();
        return { allowed: result.hardFailures.length === 0 && result.instrumentationLimits.length > 0,
          strictTransportStatus: result.strictTransportStatus, limitations: result.instrumentationLimits, hardFailures: result.hardFailures };
      }, afterTransition: async (role, state) => {
        if (state === 'reload') {
          const { isFreshPc10BrowserRole } = await import('./pc10-browser-session-proof.mjs');
          await clients.get(role).until('Original reload role restored', value => isFreshPc10BrowserRole(value, role));
        }
      } });
    if (kind === 'online') {
      const offline = transitions.findLast(value => value.roleId === roleId && value.kind === 'offline' && value.endedAt == null);
      if (offline) offline.endedAt = record.apiCompletedAt;
    }
    return record;
  };
  const harness = { ledger, drains, transitions, originals, recoveredPrivacyStates, assessment, command, transition, assertAuthIdentity, assertRecovered,
    assertRoster: async () => {
      assert.equal(new Set([...clients.values()].map(client => client.context)).size, 21);
      assert.equal(new Set([...originals.values()].map(value => value.uid)).size, 22);
      await assertRecovered({ initializeScope: true });
    },
    privateRead: (role, suffix) => command(role, 'privateFirestoreRead', { suffix }, { expectedDenial: 'permission-denied' }),
    recoveredPrivacy: async state => {
      const marker = { state, startedAt: Date.now(), originalActors: [...clients.keys()], commandIds: [], completedAt: null };
      recoveredPrivacyStates.push(marker);
      await allSettled([...clients.keys()].map(async role => {
        const reply = await command(role, 'getCurrentMemberSession');
        marker.commandIds.push(ledger.findLast(entry => entry.reply === reply).commandId);
      }));
      assert.equal(marker.commandIds.length, 21); marker.completedAt = Date.now();
    },
    assertMessages: async choices => {
      const groups = [...new Set(choices.map(choice => ledger.findLast(entry => entry.data.requestId === choice.payload.requestId).afterSource.groupId))];
      const docs = await fixture.db.getAll(...groups.map(id => fixture.session.collection('fleetGroupMessages').doc(id)));
      for (const choice of choices) {
        const matches = docs.flatMap(doc => doc.get('messages') ?? []).filter(note => note.id === choice.payload.requestId);
        assert.equal(matches.length, 1); assert.equal(matches[0].actorUid, originals.get(choice.role).uid);
        assert.equal(matches[0].text, choice.payload.text);
      }
    },
    assertPress: async (payload, reply) => {
      assert.deepEqual((await fixture.session.get()).get('pressDispatch'), reply.result);
      const calls = ledger.filter(entry => entry.data.requestId === payload.requestId);
      assert.equal(calls.length, 2); assert.equal(calls[0].afterSource.pressDispatchHash, calls[1].afterSource.pressDispatchHash);
    },
    assertClaims: async requests => { for (const data of requests) assert.equal(ledger.filter(entry => entry.data.requestId === data.requestId).length, 2); },
    naturalDisconnect: async qualifiedTable => {
      const { runPc10NaturalDisconnectAcceptance } = await import('./pc10-natural-disconnect.mjs');
      return runPc10NaturalDisconnectAcceptance(qualifiedTable, { root, directory: join(directory, 'natural-disconnect'),
        expectBrowserContexts: 21, leaseMarginMs: 750, emptyObservationMs: 3000 });
    },
  };
  return harness;
}

/** Root supplies the created table and owns zero-session preflight and exact
 * witnessed SID cleanup AFTER browser closure. This never invokes either old
 * strict proof as if it passed and never owns release acceptance. */
export async function runPc10Gate2FunctionalProof(table, { root, directory, runnerPath, expectedSourceCommit }) {
  await mkdir(directory, { recursive: true });
  const before = await capturePc10Gate2SourceBinding(root, runnerPath);
  assert.equal(before.trackedClean, true); assert.equal(before.sourceCommit, expectedSourceCommit);
  assert.equal(before.compiledFileCount, 434); assert.equal(before.javascriptFileCount, 217);
  const harness = await createPc10Gate2FunctionalHarness(table, { root, directory });
  let scenario, failure;
  try { scenario = await runPc10Gate2FunctionalScenario(table, harness); }
  catch (error) { failure = error; }
  // Every original strict drain runs once at the unchanged budget; siblings
  // are observed even when another drain fails. No clearing/discarding arrays.
  await allSettled([...table.clients].map(async ([roleId, client]) => {
    const drain = { roleId, stage: 'final-strict-drain', startedAt: Date.now(), completedAt: null, outcome: 'pending' };
    harness.drains.push(drain);
    try { await client.drainObservedCalls(); drain.outcome = 'completed'; }
    catch (error) { drain.outcome = 'failed'; drain.failure = error.message; }
    finally { drain.completedAt = Date.now(); }
  }));
  const sourceAfter = await capturePc10Gate2SourceBinding(root, runnerPath);
  const transport = harness.assessment();
  if (!failure) try { assert.deepEqual(sourceAfter, before, 'Every Root tracked/compiled/PC10/runner source byte must remain frozen.');
    assert.equal(transport.functionalStatus, 'PASSED'); assert.equal(transport.commandedPrivacyStatus, 'PASSED');
    assert.deepEqual(harness.recoveredPrivacyStates.map(value => value.state), ['initial-resume', 'online', 'reload', 'natural-expiry']);
    assert.ok(harness.recoveredPrivacyStates.every(value => value.commandIds.length === 21 && value.completedAt));
    assert.equal([...table.clients.values()].flatMap(client => client.errors).length, 0);
    assert.equal(table.fixture.heartbeatFailures.length, 0);
  } catch (error) { failure = error; }
  const strictRaw = await table.writeEvidence('gate2-functional-strict-raw.json', {
    oldStrictProofInvoked: false, originalFunctionalContract: PC10_GATE2_FUNCTIONAL_CONTRACT });
  // writeEvidence itself performs unchanged strict drains. Reassess its newly
  // recorded failures; no post-cleanup response is a prior-state backfill.
  const strictSnapshot = JSON.parse(await readFile(join(directory, 'gate2-functional-strict-raw.json'), 'utf8'));
  const finalTransport = assessPc10FunctionalTransport({ commands: harness.ledger, originals: harness.originals,
    observations: strictSnapshot.observedBrowserCalls, failures: strictSnapshot.callableObservationFailures,
    drains: harness.drains, transitions: harness.transitions });
  if (!failure && finalTransport.functionalStatus !== 'PASSED') failure = Error('Final raw transport assessment contains a hard functional failure.');
  const sourceAtFinalEvidence = await capturePc10Gate2SourceBinding(root, runnerPath);
  if (!failure) try { assert.deepEqual(sourceAtFinalEvidence, before); } catch (error) { failure = error; }
  const report = { contract: PC10_GATE2_FUNCTIONAL_CONTRACT, status: failure ? 'FAILED' : 'FUNCTIONAL_PASSED',
    failure: failure?.message ?? null, actualBrowserProcesses: 1, originalBrowserAuthIdentities: 21, separateGmHttpAuthIdentities: 1,
    actualHumans: 0, actualHumanDevices: 0, sourceBefore: before, sourceAfter, sourceAtFinalEvidence,
    sessionId: table.fixture.sessionId, project: table.fixture.project, ...scenario,
    commands: harness.ledger, transitions: harness.transitions, strictDrains: harness.drains,
    originalExplicitSdkInvocations: [...table.clients.values()].flatMap(client => client.explicitSdkInvocations),
    originalBrowserCallableSdkCommandsIssued: harness.ledger.filter(entry => entry.roleId !== 'gm' && entry.name !== 'privateFirestoreRead' && entry.issuedAt != null).length,
    originalFirestoreSdkReadsIssued: harness.ledger.filter(entry => entry.name === 'privateFirestoreRead' && entry.issuedAt != null).length,
    originalGmHttpCommandsIssued: harness.ledger.filter(entry => entry.roleId === 'gm' && entry.issuedAt != null).length,
    commandedRecoveredPrivacy: harness.recoveredPrivacyStates, transport: finalTransport,
    originalStrictRawEvidence: 'gate2-functional-strict-raw.json', rawStrictSourceCommit: strictRaw.sourceCommit,
    cleanupOwnedByRoot: true, releaseAcceptance: false, historicalFailedRunsUnchanged: true,
    limits: ['Every recorded unread passive reply remains individually unknown; no ambient-response privacy credit.',
      'Only this finite commanded functional/recovery contract is evaluated; no full-game, human-device or release credit.',
      'SDK invocation retains existing native document metadata; Auth UID/SID are explicitly observed before and after in that same original document.'] };
  await writeFile(join(directory, 'gate2-functional.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (failure) { failure.pc10FunctionalReport = report; throw failure; }
  return report;
}
