import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { sameActionReceipt } from './pc10-specialist-gameplay.mjs';
import { observeLifecycleActor } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { assertLateReplyAuthority } from './pc10-member-gm-lifecycle-contracts.mjs';

const RESULT_STATUSES = new Set(['committed', 'applied', 'repaired', 'arrived', 'requested', 'replayed', 'resolved', 'in-transit']);
const STATUSLESS_VESSEL_RESULTS = Object.freeze({
  addShipDamage: { valid: result => typeof result?.destroyed === 'boolean', action: 'add-damage' },
  repairAllShipDamage: { valid: result => result?.repaired === true, action: 'repair-damage' },
  dismissPopulationAlert: { valid: result => result?.dismissed === true, action: 'dismiss-population' },
  dismissUnrestAlert: { valid: result => result?.dismissed === true, action: 'dismiss-unrest' },
  setShipConsoleLock: { valid: result => typeof result?.locked === 'boolean', action: 'console-lock' },
});
const SOURCE_ALERT_TYPE_BY_ENDPOINT = Object.freeze({
  dismissPopulationAlert: 'population',
  dismissUnrestAlert: 'unrest',
});
const SOURCE_ALERT_WITNESS_KEYS = Object.freeze(['kind', 'type', 'sessionId', 'shipId',
  'sourceRevision', 'alertIdentityHash', 'gmUidHash', 'gmInstanceHash']);
const SOURCE_ALERT_SOURCE_KEYS = Object.freeze(['kind', 'sessionId', 'cycle', 'shipId',
  'sourceRevision', 'alertIdentityHash', 'alertIdentityMatched', 'originalGmUidHash', 'originalGmInstanceHash']);
const SOURCE_ALERT_RECEIPT_KEYS = Object.freeze(['kind', 'type', 'shipId', 'sourceRevisionBefore',
  'sourceRevisionAfter', 'alertIdentityHash', 'alertIdentityMatched', 'alertRemoved',
  'originalGmUidHash', 'originalGmInstanceHash', 'exactReplay']);
const COUNTER_BATCH_REQUEST_KEYS = Object.freeze(['sessionId', 'instanceId', 'shipId', 'counter', 'steps',
  'requestId', 'expectedRevision', 'resourceId']);
const COUNTER_BATCH_RESULT_KEYS = Object.freeze(['amount', 'appliedSteps', 'alertRaised', 'sessionId', 'instanceId',
  'shipId', 'counter', 'resourceId', 'requestId', 'expectedRevision', 'actorUid', 'actorRoleId', 'vesselId',
  'turn', 'phase', 'revision', 'idempotencyKey', 'auditId']);
const COUNTER_SELECTION_FIELDS = Object.freeze(['sessionId', 'instanceId', 'uidHash', 'claimedAt',
  'connectionGeneration', 'hydrationRevision', 'actorRoleId', 'phase', 'cycle', 'shipId', 'groupId',
  'groupLabel', 'resourceId', 'resourceLabel', 'step', 'beforeAmount', 'beforeVisibleAmount', 'beforeRevision']);
const COUNTER_SELECTION_KEYS = Object.freeze(['kind', ...COUNTER_SELECTION_FIELDS]);
const COUNTER_SOURCE_WITNESS_KEYS = Object.freeze(['kind', ...COUNTER_SELECTION_FIELDS,
  'afterAmount', 'afterVisibleAmount', 'afterRevision']);
const COUNTER_RENDERED_KEYS = Object.freeze(['kind', 'visible', 'resultStatus', 'shipId', 'groupId',
  'resourceId', 'resourceLabel', 'beforeAmount', 'amount']);
const REVISION_FIELDS = ['revision', 'repairRevision', 'choiceRevision', 'controlRevision', 'movementRevision',
  'currentRevision', 'upgradeRevision', 'wingRevision', 'counterRevision', 'recyclingRevision', 'evacuationRevision',
  'rechargeRevision'];
const TRAINING_CHOICE_CODE = 'gm-training:deliberate-choice';
const CASES = [];
const PRIVATE_CAPTURE_INPUT = Symbol('pc10-private-capture-input');

function add(family, endpoint, actorRoleId, checkpoint, details = {}) {
  CASES.push(Object.freeze({
    id: `${family === 'pending-core-craft-actions' ? 'core' : 'gm'}:${endpoint}`,
    family, endpoint, actorRoleId, checkpoint,
    mountedPath: details.mountedPath ?? 'source-mounted control; resolve from live UI before acting',
    requirement: details.requirement ?? 'current authenticated actor, fresh server projection and source-offered control',
    unavailableReason: details.unavailableReason ?? 'source condition or visible control is not available in this actual state',
    costPolicy: details.costPolicy ?? 'record only the visible printed cost and server-confirmed ledger delta',
    replayPolicy: details.replayPolicy ?? 'exact-request-id',
    trainingChoice: details.trainingChoice ?? false,
    randomOutcome: details.randomOutcome ?? false,
    ...(details.distinctConsent ? { distinctConsent: true } : {}),
    ...(details.sourceGroup ? { sourceGroup: true } : {}),
    ...(details.note ? { note: details.note } : {}),
  }));
}

const C = 'pending-core-craft-actions';
add(C, 'allocateHummingbirdHarvest', 'quellon-explorer', 'coordination', { mountedPath: 'HummingbirdHarvest allocation control',
  requirement: 'the same Explorer owns a current server-generated pending two-die harvest and one Food/one Water allocation is actually offered',
  costPolicy: 'no ship-resource cost; server receipt assigns the two existing dice to Food and Water' });
add(C, 'chooseBoaMissionReclamationOpportunity', 'capybara-recycler', 'before-mission-deal', { mountedPath: 'Boa mission reclamation panel',
  requirement: 'Recycler is current; an unstarted printed task is actually offered at the Recycler group location with current choice revision',
  unavailableReason: 'no unstarted printed task is offered at the current Recycler location' });
add(C, 'rechargeHostConsoleFromShuttle', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle console service-recharge panel',
  requirement: 'current shuttle holder, exact active/docked shuttle and eligible host console; server-listed source inputs remain available',
  costPolicy: 'debit only the actual selected printed source inputs; Scrap conversion must be explicit in the rendered choice' });
add(C, 'recycleWithBoa', 'capybara-recycler', 'coordination', { mountedPath: 'Boa recycling panel',
  requirement: 'Capybara mode, live Coordination, current docked Boa and one affordable printed recipe',
  costPolicy: 'one Scrap for six Food/Water/Ore/Fuel or three Materials; one actual selected recipe' });
add(C, 'repairConsolesFromAlly', 'current-ally-holder', 'coordination', { mountedPath: 'Ally console-repair panel',
  requirement: 'current Ally holder, docked with eligible undestroyed host and one or two currently damaged consoles',
  costPolicy: 'four host Materials per selected console; second host requires a fuelled Ally' });
add(C, 'repairConsolesFromBlacksmith', 'icebreaker-engineer', 'coordination', { mountedPath: 'Shuttle console Blacksmith repair panel',
  requirement: 'current Icebreaker Engineer/Blacksmith, an active eligible host and one or two actually damaged consoles',
  costPolicy: 'four host Materials per selected console; second host requires fuelled Blacksmith' });
add(C, 'repairConsolesFromChacau', 'refinery-124-engineer', 'coordination', { mountedPath: 'Shuttle console Chacau repair panel',
  requirement: 'current Refinery 124 Engineer/Chacau, an active eligible host and one or two actually damaged consoles',
  costPolicy: 'four host Materials per selected console; second host requires fuelled Chacau' });
add(C, 'repairConsolesFromMacaw', 'capybara-captain', 'coordination', { mountedPath: 'Macaw repair panel',
  requirement: 'current Capybara Captain, live Coordination, eligible docked host and actual damaged consoles',
  costPolicy: 'one Capybara Scrap per repaired console; source host/repair/fuel limits apply' });
add(C, 'repairConsolesFromPhilia', 'dione-engineer', 'coordination', { mountedPath: 'Shuttle console Philia repair panel',
  requirement: 'current Dione Engineer with current Philia control, eligible active host and actual damaged consoles',
  costPolicy: 'four host Materials per selected console; second host requires fuelled Philia' });
add(C, 'repairMaliades', 'dione-engineer', 'team', { mountedPath: 'Maliades repair panel',
  requirement: 'launched undestroyed Maliades, current Dione Engineer, restricted Team airspace and fuelled shuttle docked to an active host',
  costPolicy: 'one host Material per actual damage point repaired' });
add(C, 'rollHummingbirdHarvest', 'quellon-explorer', 'coordination', { mountedPath: 'HummingbirdHarvest server-roll control',
  requirement: 'first applicable cycle, current Explorer and fuelled eligible Hummingbird in its scouting action phase',
  costPolicy: 'no player resource cost; outcome is a private server-generated two-die roll', randomOutcome: true });
add(C, 'runHighwallMining', 'icebreaker-miner', 'coordination', { mountedPath: 'HighwallMining',
  requirement: 'current Icebreaker Miner, active Highwall docked to its proper host, eligible action phase and remaining operation capacity',
  costPolicy: 'server rolls Materials 1d6 or Ore 3d6; two operations, or three with fuelled Highwall, per cycle', randomOutcome: true });
add(C, 'requestShuttleDeparture', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel',
  requirement: 'current holder, enabled craft, source-accepted destination and live departure window; attack/movement blockers clear', sourceGroup: true });
add(C, 'beginShuttleTransit', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel',
  requirement: 'exact live departure request, current craft holder, valid route/group and no source movement blocker', sourceGroup: true,
  unavailableReason: 'no valid source-accepted pending departure request exists' });
add(C, 'retargetShuttleTransit', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel retarget control',
  requirement: 'same current holder and original request-bound in-flight transit inside the source retarget window', sourceGroup: true,
  unavailableReason: 'no valid in-flight source transit is inside the retarget window' });
add(C, 'completeShuttleArrival', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel arrival control',
  requirement: 'server has naturally marked the exact current transit chain as arrived; same holder and request remain current',
  unavailableReason: 'no real transit has naturally reached server-arrived state', replayPolicy: 'single-shot' });
add(C, 'evacuateShuttleSurvivorsCommand', 'current-shuttle-holder', 'coordination', { mountedPath: 'Survivor evacuation panel',
  requirement: 'current craft holder, valid destination, live Coordination and remaining cycle evacuation capacity', sourceGroup: true,
  costPolicy: 'move only currently projected survivors, bounded by source roster and five-thousand-per-cycle limit' });
add(C, 'transferShuttleCargoCommand', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle cargo transfer panel',
  requirement: 'same-group active player, current docking/host, live Coordination, positive currently affordable quantity and selected resource', sourceGroup: true,
  costPolicy: 'two-sided host/craft balances change by exactly the selected quantity; no resource creation' });
add(C, 'transferShuttleControlCommand', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle control handoff/reclaim panel',
  requirement: 'current craft holder or explicitly entitled GM; real active target remains in allowed current group', sourceGroup: true,
  costPolicy: 'no resource cost; changes only the selected craft holder/control revision' });

const G = 'pending-gm-rulings-counters';
add(G, 'addShipDamage', 'gm', 'maintenance', { mountedPath: 'MaintenanceSystems GM Assign damage',
  requirement: 'actual enabled GM Assign damage button for an active selected supported ship and current damage revision',
  costPolicy: 'no player cost; card and affected system are drawn by the server and are never selected or recorded by this driver', randomOutcome: true,
  trainingChoice: true });
add(G, 'applyShipCounterSteps', 'gm', 'on-started', { mountedPath: 'GmConsole Fleet resource controls',
  requirement: 'owned live GM instance, actual selected ship, current vessel revision and a bounded visible counter step', trainingChoice: true });
add(G, 'dismissPopulationAlert', 'gm', 'eligible-alert', { mountedPath: 'PopulationAlert GM dismissal control',
  requirement: 'source-created current population alert on an active authorized vessel', unavailableReason: 'no source-created population alert is currently offered' });
add(G, 'dismissUnrestAlert', 'gm', 'eligible-alert', { mountedPath: 'UnrestAlert GM dismissal control',
  requirement: 'source-created current unrest alert on the selected active vessel', unavailableReason: 'no source-created unrest alert is currently offered' });
add(G, 'repairAllShipDamage', 'gm', 'maintenance', { mountedPath: 'MaintenanceSystems GM Repair all damage',
  requirement: 'owned live GM instance with scoped selected-ship write grant and currently damaged/destroyed supported ship', trainingChoice: true });
add(G, 'resolveShipMutiny', 'gm', 'eligible-mutiny', { mountedPath: 'GmMutinyRecovery',
  requirement: 'source-eligible mutiny, current ship/craft/Voyage mode and matching live eligibility revision',
  unavailableReason: 'no authentic source-eligible mutiny is currently offered', trainingChoice: true });
add(G, 'rollbackMaintenance', 'gm', 'maintenance', { mountedPath: 'MaintenanceSystems GM Roll back maintenance step',
  requirement: 'first-cycle active maintenance, exact current turn/step/revision and an existing matching undo record',
  unavailableReason: 'no matching latest maintenance undo record is currently offered' });
add(G, 'runMaintenance', 'gm', 'maintenance', { mountedPath: 'MaintenanceSystems ordered step controls',
  requirement: 'active eligible ship, first-cycle maintenance, current ordered step, live actor and current revision',
  costPolicy: 'use actual printed rations/production inputs; unrest, riot and damage results remain server-calculated', randomOutcome: true, trainingChoice: true });
add(G, 'scavengeDestroyedShipStores', 'gm', 'eligible-destruction', { mountedPath: 'GmConsole destroyed-ship store transfer controls',
  requirement: 'a source-destroyed ship, active destination in the same current group and allocation bounded by live source inventory',
  unavailableReason: 'no source-destroyed ship with an eligible active destination is currently offered', trainingChoice: true });
add(G, 'setFighterWingCount', 'gm', 'on-started', { mountedPath: 'GmConsole Fighter Wing configuration',
  requirement: 'AEGIS active, owned live GM instance and a count within current server-projected construction capacity', trainingChoice: true });
add(G, 'authorFacilitatorRuleCall', 'gm', 'on-started', { mountedPath: 'GmConsole Facilitator rule call',
  requirement: 'current live GM and revision; bounded ambiguity/source/decision with GM-only or actually eligible private audience', trainingChoice: true,
  note: 'Training ruling text is deliberately labeled and evidence stores only a fixed label, never authored text.' });
add(G, 'setCandidatePlanCheckpoint', 'gm', 'cycle-6', { mountedPath: 'GmConsole Cycle 6 candidate plan checkpoint',
  requirement: 'actual Cycle 6, current navigation/discovery revision and live owned GM instance',
  unavailableReason: 'the source checkpoint is locked outside Cycle 6', trainingChoice: true });
add(G, 'setFacilitatorCensusNote', 'gm', 'on-started', { mountedPath: 'GmConsole facilitator loyalty-census notes',
  requirement: 'current live GM census, real eligible target and exact census revision', trainingChoice: true,
  note: 'Census note content is private and never persisted in proof evidence.' });
add(G, 'setFacilitatorResponsibility', 'gm', 'on-setup', { mountedPath: 'GmConsole facilitator responsibility controls',
  requirement: 'live owned GM instance and current setup revision; change only an actually offered lane/instance', trainingChoice: true });
add(G, 'setGmControlsLocked', 'gm', 'on-started', { mountedPath: 'GmConsole shared control lock', replayPolicy: 'single-shot',
  requirement: 'active gameplay and current owned live GM instance; set explicit value then restore the original value through its visible control', trainingChoice: true });
add(G, 'setGmShipConsoleWriteGrant', 'gm', 'on-started', { mountedPath: 'ShipConsole scoped GM write grant', replayPolicy: 'single-shot',
  requirement: 'selected active ship and current GM instance claim; grant one browser instance only and revoke it after use', trainingChoice: true });
add(G, 'setShipConsoleLock', 'gm', 'on-started', { mountedPath: 'ShipConsole current-console lock',
  requirement: 'active ship/current action revision and entitled current ship actor or scoped live GM grant', trainingChoice: true });

export const CORE_CRAFT_PROCEDURES = Object.freeze(CASES.filter(row => row.family === C));
export const GM_RULING_COUNTER_PROCEDURES = Object.freeze(CASES.filter(row => row.family === G));
const CASE_BY_ID = new Map(CASES.map(row => [row.id, row]));

function pending(spec, reason, fields = {}) {
  return { status: 'pending', caseId: spec.id, endpoint: spec.endpoint,
    reason: String(reason ?? spec.unavailableReason).slice(0, 160), ...fields };
}

const SHUTTLE_SOURCE_DIAGNOSTIC_KEYS = Object.freeze(['kind', 'zeroCredit', 'preparedPlanOffered',
  'preparedPlanReasonPresent', 'preparedPlanReason', 'transitionBeforePresent', 'originGuardPassed',
  'secondMovementRead', 'movementReadErrorCode', 'movementWitnessPresent',
  'movementWitnessMatchesTransitionBefore']);
const SHUTTLE_SOURCE_DIAGNOSTIC_CODES = new Set(['aborted', 'cancelled', 'deadline-exceeded',
  'failed-precondition', 'not-found', 'permission-denied', 'resource-exhausted', 'unauthenticated',
  'unavailable', 'unknown']);

function safeShuttleSourceDiagnostic(value) {
  if (!exactKeys(value, SHUTTLE_SOURCE_DIAGNOSTIC_KEYS) ||
      value.kind !== 'pc10-shuttle-prepare-diagnostic-v1' || value.zeroCredit !== true ||
      typeof value.preparedPlanOffered !== 'boolean' ||
      typeof value.preparedPlanReasonPresent !== 'boolean' ||
      value.preparedPlanReason !== null && (typeof value.preparedPlanReason !== 'string' ||
        !/^[A-Za-z][A-Za-z .,'-]{0,180}$/.test(value.preparedPlanReason)) ||
      typeof value.transitionBeforePresent !== 'boolean' ||
      value.originGuardPassed !== null && typeof value.originGuardPassed !== 'boolean' ||
      !['not-read', 'unreadable', 'missing', 'record'].includes(value.secondMovementRead) ||
      value.movementReadErrorCode !== null && !SHUTTLE_SOURCE_DIAGNOSTIC_CODES.has(value.movementReadErrorCode) ||
      typeof value.movementWitnessPresent !== 'boolean' ||
      value.movementWitnessMatchesTransitionBefore !== null &&
        typeof value.movementWitnessMatchesTransitionBefore !== 'boolean') return null;
  return Object.fromEntries(SHUTTLE_SOURCE_DIAGNOSTIC_KEYS.map(key => [key, value[key]]));
}

function appendShuttleSourceDiagnostic(outcome, value, input) {
  const diagnostic = safeShuttleSourceDiagnostic(value);
  if (diagnostic) {
    if (input) appendShuttleCaptureTuple(outcome, diagnostic, input);
    outcome.sourceDiagnosticOnly = diagnostic;
  }
  return outcome;
}

const SHUTTLE_CAPTURE_DIAGNOSTIC_ENDPOINTS = new Set(['requestShuttleDeparture', 'beginShuttleTransit',
  'retargetShuttleTransit', 'completeShuttleArrival']);
const SHUTTLE_CAPTURE_DIAGNOSTIC_STATES = new Set(['requested', 'in-transit', 'arrived']);
const CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS = Object.freeze({
  source: ['sessionMatches', 'cycleMatches', 'phaseActive', 'liveStateCurrent',
    'holderGroupMatchesOrigin', 'memberScopeGroupMatchesOrigin'],
  authority: ['originAuthorityMatches', 'currentDocumentAuthorityPresent', 'sameCurrentDocumentAuthority', 'currentControlCraftMatches',
    'currentControlHolderMatchesOrigin', 'currentControlRevisionMatchesOrigin'],
  member: ['dockingStateMatches', 'memberScopeMatches', 'originHostPresent', 'originHostInMemberScope',
    'originHostActive', 'destinationDiffersFromOriginHost', 'destinationInMemberScope', 'destinationActive',
    'memberGroupAvailable', 'memberGroupMatchesOrigin', 'memberGroupMatchesExpected'],
  movement: ['recordPresent', 'missing', 'unreadable', 'statusMatches', 'shuttleMatches',
    'holderMatchesOrigin', 'groupMatchesOrigin', 'controlRevisionMatchesOrigin', 'cycleMatches',
    'destinationMatchesSelected', 'currentControlRevisionMatchesOrigin', 'destinationDiffersFromOriginHost',
    'resultDestinationMatches', 'sourceTupleCurrent', 'movementTupleCurrent'],
});

function safeCoreShuttlePostInspectPredicateDiagnostic(value) {
  const keys = Object.keys(CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS);
  if (!exactKeys(value, ['kind', 'zeroCredit', ...keys]) ||
      value.kind !== 'pc10-core-shuttle-post-inspect-predicate-diagnostic-v1' || value.zeroCredit !== true ||
      !exactKeys(value.source, ['latestLive', ...CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.source]) ||
      value.source.latestLive !== null && typeof value.source.latestLive !== 'boolean' ||
      !exactKeys(value.authority, CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.authority) ||
      !exactKeys(value.member, ['dockingCount', ...CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.member]) ||
      !Number.isSafeInteger(value.member.dockingCount) || value.member.dockingCount < 0 || value.member.dockingCount > 2 ||
      !exactKeys(value.movement, ['state', 'revision', ...CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.movement,
        'requestOriginMatchesHost']) ||
      value.movement.state !== null && !SHUTTLE_CAPTURE_DIAGNOSTIC_STATES.has(value.movement.state) ||
      value.movement.revision !== null && (!Number.isSafeInteger(value.movement.revision) || value.movement.revision < 1)) return null;
  for (const [name, fields] of Object.entries(CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS)) {
    if (fields.some(key => typeof value[name][key] !== 'boolean')) return null;
  }
  if (value.movement.requestOriginMatchesHost !== undefined &&
      value.movement.requestOriginMatchesHost !== null && typeof value.movement.requestOriginMatchesHost !== 'boolean') return null;
  return {
    kind: value.kind, zeroCredit: true,
    source: Object.fromEntries(['latestLive', ...CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.source]
      .map(key => [key, value.source[key]])),
    authority: Object.fromEntries(CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.authority
      .map(key => [key, value.authority[key]])),
    member: Object.fromEntries(['dockingCount', ...CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.member]
      .map(key => [key, value.member[key]])),
    movement: Object.fromEntries(['state', 'revision', ...CORE_SHUTTLE_POST_INSPECT_DIAGNOSTIC_BOOLEAN_KEYS.movement,
      'requestOriginMatchesHost'].map(key => [key, value.movement[key] ?? null])),
  };
}

function diagnosticRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnosticRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function diagnosticIdHash(value) {
  return typeof value === 'string' && value ? hashUid(value) : null;
}

function safeShuttleCaptureSource(value) {
  const source = diagnosticRecord(value) ? value : null;
  return { present: source !== null, isNull: value === null,
    live: typeof source?.live === 'boolean' ? source.live : null,
    sessionHash: diagnosticIdHash(source?.sessionId), cycle: diagnosticRevision(source?.cycle),
    revision: diagnosticRevision(source?.revision), groupHash: diagnosticIdHash(source?.groupId) };
}

function safeShuttleCaptureAuthority(value) {
  const authority = diagnosticRecord(value) ? value : null;
  return { present: authority !== null, isNull: value === null,
    uidHash: /^[0-9a-f]{16}$/.test(authority?.uidHash ?? '') ? authority.uidHash : null,
    groupHash: diagnosticIdHash(authority?.groupId), roleHash: diagnosticIdHash(authority?.roleId),
    connectionGeneration: diagnosticRevision(authority?.connectionGeneration),
    identityHydrationRevision: diagnosticRevision(authority?.identityHydrationRevision),
    documentTimeOriginHash: Number.isFinite(authority?.documentTimeOrigin) && authority.documentTimeOrigin > 0
      ? hash(authority.documentTimeOrigin) : null,
    audienceHash: /^[0-9a-f]{64}$/.test(authority?.audienceHash ?? '') ? authority.audienceHash : null,
    authorityHash: /^[0-9a-f]{64}$/.test(authority?.authorityHash ?? '') ? authority.authorityHash : null,
    shuttleAuthorized: typeof authority?.shuttleAuthorized === 'boolean' ? authority.shuttleAuthorized : null };
}

function safeShuttleCaptureMovement(value) {
  const movement = diagnosticRecord(value) ? value : null;
  return { present: movement !== null, isNull: value === null,
    exists: typeof movement?.exists === 'boolean' ? movement.exists : null,
    state: SHUTTLE_CAPTURE_DIAGNOSTIC_STATES.has(movement?.status) ? movement.status : null,
    sessionHash: diagnosticIdHash(movement?.sessionId), requestHash: diagnosticIdHash(movement?.requestId),
    transitRequestHash: diagnosticIdHash(movement?.transitRequestId), shuttleHash: diagnosticIdHash(movement?.shuttleId),
    holderUidHash: /^[0-9a-f]{16}$/.test(movement?.holderUidHash ?? '') ? movement.holderUidHash : null,
    groupHash: diagnosticIdHash(movement?.groupId), destinationHash: diagnosticIdHash(movement?.destinationShipId),
    cycle: diagnosticRevision(movement?.cycle), controlRevision: diagnosticRevision(movement?.controlRevision),
    revision: diagnosticRevision(movement?.revision) };
}

function safeShuttleCaptureTuple(input) {
  const endpoint = typeof input?.caseId === 'string' && input.caseId.startsWith('core:')
    ? input.caseId.slice('core:'.length) : null;
  if (!SHUTTLE_CAPTURE_DIAGNOSTIC_ENDPOINTS.has(endpoint) ||
      input.expected?.shuttleId === PRESS_SHUTTLE_ID) return null;
  const arrival = endpoint === 'completeShuttleArrival';
  const postInspectPredicates = endpoint === 'completeShuttleArrival' ? null
    : safeCoreShuttlePostInspectPredicateDiagnostic(input.corePostInspectPredicates);
  return { kind: 'pc10-shuttle-capture-tuple-v1', zeroCredit: true,
    before: {
      source: safeShuttleCaptureSource(input.sourceBefore),
      documentAuthority: safeShuttleCaptureAuthority(input.sourceAuthorityBefore ??
        (arrival ? input.arrival?.authorityBefore : undefined)),
      movement: safeShuttleCaptureMovement(input.transitionBefore ?? (arrival ? input.arrival?.before : undefined)),
    },
    after: {
      source: safeShuttleCaptureSource(input.sourceAfter),
      documentAuthority: safeShuttleCaptureAuthority(input.sourceAuthorityAfter ??
        (arrival ? input.arrival?.authorityAfter : undefined)),
      movement: safeShuttleCaptureMovement(input.transitionAfter ?? (arrival ? input.response?.result : undefined)),
    },
    ...(postInspectPredicates && input.expected?.shuttleId !== PRESS_SHUTTLE_ID
      ? { postInspectPredicates } : {}) };
}

function appendShuttleCaptureTuple(outcome, diagnostic, input) {
  const tuple = safeShuttleCaptureTuple(input);
  if (diagnostic && tuple) diagnostic.captureTuple = tuple;
  return outcome;
}

function safeGmFormFailureDiagnostic(value) {
  if (!value || !['mount', 'writable'].includes(value.stage)) return null;
  const keys = ['stage', 'route', 'gmMainCount', 'loading', 'screenFadeCount', 'crossingOut',
    'outgoingStationsCount', 'formCount', 'formVisible', 'formEnabled'];
  if (value.stage === 'writable') keys.push('controlsWritable');
  if (!exactKeys(value, keys) || !['gm', 'stations', 'other'].includes(value.route) ||
      ['gmMainCount', 'screenFadeCount', 'outgoingStationsCount', 'formCount'].some(key =>
        !Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 2) ||
      ['loading', 'crossingOut', 'formVisible', 'formEnabled'].some(key => typeof value[key] !== 'boolean') ||
      value.stage === 'writable' && value.controlsWritable !== false) return null;
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 20);
}

function hashUid(uid) {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
}

function canonicalSourceAlertValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return { date: value.toISOString() };
  if (Array.isArray(value)) {
    const items = value.map(canonicalSourceAlertValue);
    return items.some(item => item === undefined) ? undefined : items;
  }
  if (!diagnosticRecord(value)) return undefined;
  const timestampSeconds = Number.isSafeInteger(value.seconds) ? value.seconds : value._seconds;
  const timestampNanoseconds = Number.isSafeInteger(value.nanoseconds) ? value.nanoseconds : value._nanoseconds;
  if (Number.isSafeInteger(timestampSeconds) && Number.isSafeInteger(timestampNanoseconds)) {
    return { seconds: timestampSeconds, nanoseconds: timestampNanoseconds };
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const normalized = canonicalSourceAlertValue(value[key]);
    if (normalized === undefined) return undefined;
    result[key] = normalized;
  }
  return result;
}

function validSourceAlertTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value === 'string') return Number.isFinite(Date.parse(value));
  if (!diagnosticRecord(value)) return false;
  const seconds = Number.isSafeInteger(value.seconds) ? value.seconds : value._seconds;
  const nanoseconds = Number.isSafeInteger(value.nanoseconds) ? value.nanoseconds : value._nanoseconds;
  return Number.isSafeInteger(seconds) && seconds >= 0 &&
    Number.isSafeInteger(nanoseconds) && nanoseconds >= 0 && nanoseconds < 1_000_000_000;
}

/** Return a redacted witness for one exact, current server-created GM alert row. */
export function createGmSourceAlertWitness(state, { type, shipId, sessionId, gmUidHash, gmInstanceId } = {}) {
  if (!['population', 'unrest'].includes(type) || typeof shipId !== 'string' || !shipId ||
      typeof sessionId !== 'string' || state?.live !== true || state.sessionId !== sessionId ||
      state.phase !== 'active' || !Array.isArray(state.activeVesselIds) ||
      !state.activeVesselIds.includes(shipId) || !/^[0-9a-f]{16}$/.test(gmUidHash ?? '') ||
      typeof gmInstanceId !== 'string' || !gmInstanceId) return null;
  const alerts = type === 'population' ? state.populationAlerts : state.unrestAlerts;
  const row = alerts?.[shipId];
  const rowKeys = type === 'population'
    ? ['shipId', 'shipName', 'targetGmInstanceIds', 'createdAt', 'population']
    : ['shipId', 'shipName', 'targetGmInstanceIds', 'createdAt'];
  if (!exactKeys(row, rowKeys) || row.shipId !== shipId || typeof row.shipName !== 'string' || !row.shipName.trim() ||
      !Array.isArray(row.targetGmInstanceIds) || row.targetGmInstanceIds.length === 0 ||
      row.targetGmInstanceIds.some(value => typeof value !== 'string' || !value) ||
      new Set(row.targetGmInstanceIds).size !== row.targetGmInstanceIds.length ||
      !row.targetGmInstanceIds.includes(gmInstanceId) || !validSourceAlertTimestamp(row.createdAt) ||
      type === 'population' && (!Number.isSafeInteger(row.population) || row.population < 0)) return null;
  const revision = state.vesselActionRevisions?.[shipId];
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  const canonicalRow = canonicalSourceAlertValue(row);
  if (!canonicalRow) return null;
  const alertIdentityHash = createHash('sha256').update(JSON.stringify({ type, shipId, row: canonicalRow })).digest('hex');
  return { kind: 'gm-source-alert-witness-v1', type, sessionId, shipId, sourceRevision: revision,
    alertIdentityHash, gmUidHash, gmInstanceHash: hashUid(gmInstanceId) };
}

export function gmSourceAlertWitnessMatches(state, witness, { sessionId, gmUidHash, gmInstanceId } = {}) {
  if (!exactKeys(witness, SOURCE_ALERT_WITNESS_KEYS) || witness.kind !== 'gm-source-alert-witness-v1' ||
      witness.sessionId !== sessionId || witness.gmUidHash !== gmUidHash ||
      witness.gmInstanceHash !== hashUid(gmInstanceId ?? '')) return false;
  const current = createGmSourceAlertWitness(state, { type: witness.type, shipId: witness.shipId,
    sessionId, gmUidHash, gmInstanceId });
  return !!current && JSON.stringify(current) === JSON.stringify(witness);
}

/** Map public server custody to one already-admitted profile without returning the raw UID. */
export function resolveCurrentHolderActor({ shuttleId, control, roster, expectedRoleId } = {}) {
  if (typeof shuttleId !== 'string' || !shuttleId || control?.shuttleId !== shuttleId ||
      typeof control?.holderUid !== 'string' || !control.holderUid || !Array.isArray(roster)) return null;
  const uidHash = hashUid(control.holderUid);
  const matches = roster.filter(actor => actor?.uidHash === uidHash && typeof actor.roleId === 'string' && actor.roleId);
  if (matches.length !== 1 || expectedRoleId !== undefined && matches[0].roleId !== expectedRoleId) return null;
  return Object.freeze({ roleId: matches[0].roleId, uidHash, shuttleId });
}

/** Resolve printed-owner transfer authority only from the source control and one admitted owner/holder pair. */
export function resolveCurrentPrintedOwnerActor({ shuttleId, control, roster } = {}) {
  if (typeof shuttleId !== 'string' || !shuttleId || control?.shuttleId !== shuttleId ||
      typeof control?.ownerRoleId !== 'string' || !control.ownerRoleId ||
      typeof control?.ownerUid !== 'string' || !control.ownerUid ||
      typeof control?.holderUid !== 'string' || !control.holderUid ||
      !Number.isSafeInteger(control.revision) || control.revision < 0 || !Array.isArray(roster)) return null;
  const ownerUidHash = hashUid(control.ownerUid);
  const holderUidHash = hashUid(control.holderUid);
  const ownerMatches = roster.filter(actor => actor?.roleId === control.ownerRoleId &&
    actor?.uidHash === ownerUidHash);
  const holderMatches = roster.filter(actor => actor?.uidHash === holderUidHash &&
    typeof actor?.roleId === 'string' && actor.roleId);
  if (ownerMatches.length !== 1 || holderMatches.length !== 1) return null;
  return Object.freeze({ roleId: ownerMatches[0].roleId, uidHash: ownerUidHash, shuttleId,
    ownerUidHash, holderUidHash, controlRevision: control.revision });
}

function revisionOf(value) {
  for (const key of REVISION_FIELDS) if (Number.isSafeInteger(value?.[key]) && value[key] >= 0) return value[key];
  return null;
}

function matchesActor(actor, expected, gm) {
  if (actor?.sameActor !== true || actor.sessionId !== expected.sessionId ||
      actor.connection !== 'live' || actor.freshness !== 'server') return false;
  if (gm) return actor.playerRole === 'gm' && actor.gmInstanceOwned === true &&
    actor.uidHash === expected.uidHash && actor.instanceId === expected.instanceId;
  return actor.profileRoleId === expected.roleId && actor.activeConsoleRoleId === expected.roleId &&
    actor.uidHash === expected.uidHash;
}

function validCost(expected, actual) {
  if (!expected) return true;
  if (!actual || actual.resource !== expected.resource || actual.amount !== expected.amount ||
      actual.direction !== expected.direction || !Number.isFinite(actual.before) || !Number.isFinite(actual.after)) return false;
  return expected.direction === 'debit' ? actual.after === actual.before - actual.amount
    : expected.direction === 'credit' ? actual.after === actual.before + actual.amount : false;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}

function sameCounterSelection(expected, actual) {
  return exactKeys(expected, COUNTER_SELECTION_KEYS) && exactKeys(actual, COUNTER_SELECTION_KEYS) &&
    expected.kind === 'gm-counter-selection-v1' && actual.kind === 'gm-counter-selection-v1' &&
    COUNTER_SELECTION_FIELDS.every(field => expected[field] === actual[field]);
}

const SOURCE_AUTHORITY_KEYS = Object.freeze(['sessionId', 'uidHash', 'groupId', 'roleId',
  'connectionGeneration', 'identityHydrationRevision', 'documentTimeOrigin', 'audienceHash', 'authorityHash',
  'shuttleAuthorized']);
const SHUTTLE_ORIGIN_AUTHORITY_KEYS = Object.freeze(['sessionId', 'uidHash', 'shuttleId', 'groupId', 'cycle',
  'controlRevision', 'sourceAuthority']);

function validSourceAuthority(value, expected) {
  return exactKeys(value, SOURCE_AUTHORITY_KEYS) && value.sessionId === expected.sessionId &&
    value.uidHash === expected.uidHash && /^[0-9a-f]{16}$/.test(value.uidHash ?? '') &&
    value.groupId === expected.groupId && value.roleId === expected.roleId &&
    Number.isSafeInteger(value.connectionGeneration) && value.connectionGeneration >= 1 &&
    Number.isSafeInteger(value.identityHydrationRevision) && value.identityHydrationRevision >= 1 &&
    Number.isFinite(value.documentTimeOrigin) && value.documentTimeOrigin > 0 &&
    /^[0-9a-f]{64}$/.test(value.audienceHash ?? '') && /^[0-9a-f]{64}$/.test(value.authorityHash ?? '') &&
    value.shuttleAuthorized === true && typeof expected.shuttleId === 'string' && expected.shuttleId.length > 0;
}

function sameSourceAuthority(left, right) {
  return exactKeys(left, SOURCE_AUTHORITY_KEYS) && exactKeys(right, SOURCE_AUTHORITY_KEYS) &&
    SOURCE_AUTHORITY_KEYS.every(key => left[key] === right[key]);
}

function validShuttleOriginAuthority(value, expected) {
  return exactKeys(value, SHUTTLE_ORIGIN_AUTHORITY_KEYS) && value.sessionId === expected.sessionId &&
    value.uidHash === expected.uidHash && value.shuttleId === expected.shuttleId &&
    value.groupId === expected.groupId && value.cycle === expected.cycle &&
    value.controlRevision === expected.controlRevision &&
    validSourceAuthority(value.sourceAuthority, expected) && sameSourceAuthority(value.sourceAuthority, expected.sourceAuthority);
}

function validMovementAuthorityTuple(input, expected) {
  return validSourceAuthority(input.sourceAuthorityBefore, expected) &&
    validSourceAuthority(input.sourceAuthorityAfter, expected) &&
    sameSourceAuthority(input.sourceAuthorityBefore, input.sourceAuthorityAfter) &&
    sameSourceAuthority(input.sourceAuthorityBefore, expected.sourceAuthority) &&
    validShuttleOriginAuthority(input.originAuthority, { sessionId: expected.sessionId,
      uidHash: expected.uidHash, shuttleId: expected.shuttleId, groupId: expected.groupId,
      cycle: expected.cycle, controlRevision: expected.controlRevision, roleId: expected.roleId,
      sourceAuthority: expected.sourceAuthority });
}

function validPublicPoint(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 3 && ['x', 'y', 'z'].every(key => Number.isFinite(value[key]));
}

/** Narrow witnesses for mounted shuttle commands whose source receipt has no independent action revision. */
function validShuttleTransition(input, endpoint) {
  const { expected, request, response, transitionBefore: before, transitionAfter: after } = input;
  const result = response?.result;
  if (endpoint === 'requestShuttleDeparture') {
    const beforeKeys = ['kind', 'exists', 'sessionId', 'shuttleId', 'holderUidHash', 'groupId', 'controlRevision', 'cycle'];
    const afterKeys = ['kind', 'exists', 'status', 'sessionId', 'requestId', 'shuttleId', 'holderUidHash', 'groupId',
      'destinationShipId', 'controlRevision', 'cycle'];
    const resultKeys = ['status', 'sessionId', 'requestId', 'shuttleId', 'holderUid', 'fleetGroupId', 'originShipId',
      'destinationShipId', 'cycle', 'controlRevision', 'requestedAt'];
    const requestKeys = ['sessionId', 'requestId', 'shuttleId', 'destinationShipId', 'expectedControlRevision', 'expectedCycle'];
    return exactKeys(before, beforeKeys) && before.kind === 'shuttle-movement' && before.exists === false &&
      before.sessionId === expected.sessionId && before.shuttleId === expected.shuttleId &&
      before.holderUidHash === expected.uidHash && before.groupId === expected.groupId &&
      before.controlRevision === expected.controlRevision && before.cycle === expected.cycle &&
      exactKeys(after, afterKeys) && after.kind === 'shuttle-movement' && after.exists === true && after.status === 'requested' &&
      after.sessionId === expected.sessionId && after.requestId === request?.requestId &&
      after.shuttleId === expected.shuttleId && after.holderUidHash === expected.uidHash && after.groupId === expected.groupId &&
      after.destinationShipId === expected.destinationShipId && after.controlRevision === expected.controlRevision &&
      after.cycle === expected.cycle && exactKeys(request, requestKeys) && request.sessionId === expected.sessionId &&
      request.shuttleId === expected.shuttleId && request.destinationShipId === expected.destinationShipId &&
      request.expectedControlRevision === expected.controlRevision && request.expectedCycle === expected.cycle &&
      exactKeys(result, resultKeys) && result.status === 'requested' && result.sessionId === expected.sessionId &&
      result.requestId === request.requestId && result.shuttleId === expected.shuttleId &&
      hashUid(result.holderUid) === expected.uidHash && result.fleetGroupId === expected.groupId &&
      result.destinationShipId === expected.destinationShipId && result.cycle === expected.cycle &&
      result.controlRevision === expected.controlRevision && typeof result.originShipId === 'string' &&
      typeof result.requestedAt === 'string' && Number.isFinite(Date.parse(result.requestedAt)) &&
      validMovementAuthorityTuple(input, expected);
  }
  if (endpoint === 'transferShuttleCargoCommand') {
    const witnessKeys = ['kind', 'sessionId', 'cycle', 'shuttleId', 'holderUidHash', 'groupId', 'controlRevision',
      'hostShipId', 'resourceId', 'direction', 'amount', 'shipAmount', 'shuttleAmount'];
    const requestKeys = ['sessionId', 'requestId', 'shuttleId', 'resourceId', 'direction', 'amount', 'expectedControlRevision'];
    const resultKeys = ['status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'resourceId', 'direction',
      'amount', 'shipAmount', 'shuttleAmount'];
    if (!exactKeys(before, witnessKeys) || !exactKeys(after, witnessKeys) || before.kind !== 'shuttle-cargo' ||
        after.kind !== 'shuttle-cargo' || !exactKeys(request, requestKeys) || !exactKeys(result, resultKeys)) return false;
    const sameAuthority = witness => witness.sessionId === expected.sessionId && witness.cycle === expected.cycle &&
      witness.shuttleId === expected.shuttleId && witness.holderUidHash === expected.uidHash &&
      witness.groupId === expected.groupId && witness.controlRevision === expected.controlRevision &&
      witness.hostShipId === expected.hostShipId && witness.resourceId === expected.resourceId &&
      witness.direction === expected.direction && witness.amount === expected.amount;
    if (!sameAuthority(before) || !sameAuthority(after) || request.sessionId !== expected.sessionId ||
        request.shuttleId !== expected.shuttleId || request.resourceId !== expected.resourceId ||
        request.direction !== expected.direction || request.amount !== expected.amount ||
        request.expectedControlRevision !== expected.controlRevision ||
        result.status !== 'committed' || result.sessionId !== expected.sessionId || result.requestId !== request.requestId ||
        result.shuttleId !== expected.shuttleId || result.hostShipId !== expected.hostShipId ||
        result.resourceId !== expected.resourceId || result.direction !== expected.direction || result.amount !== expected.amount ||
        result.shipAmount !== after.shipAmount || result.shuttleAmount !== after.shuttleAmount) return false;
    const expectedShip = before.direction === 'load' ? before.shipAmount - before.amount : before.shipAmount + before.amount;
    const expectedShuttle = before.direction === 'load' ? before.shuttleAmount + before.amount : before.shuttleAmount - before.amount;
    return Number.isSafeInteger(before.shipAmount) && before.shipAmount >= 0 &&
      Number.isSafeInteger(before.shuttleAmount) && before.shuttleAmount >= 0 &&
      expectedShip >= 0 && expectedShuttle >= 0 && after.shipAmount === expectedShip && after.shuttleAmount === expectedShuttle;
  }
  if (endpoint === 'beginShuttleTransit') {
    const beforeKeys = ['kind', 'exists', 'status', 'sessionId', 'requestId', 'shuttleId', 'holderUidHash', 'groupId',
      'destinationShipId', 'controlRevision', 'cycle'];
    const afterKeys = ['kind', 'exists', 'status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId',
      'holderUidHash', 'groupId', 'destinationShipId', 'controlRevision', 'cycle', 'revision'];
    const requestKeys = ['sessionId', 'requestId', 'shuttleId', 'expectedDepartureRequestId',
      'expectedControlRevision', 'expectedCycle'];
    const resultKeys = ['status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId', 'holderUid', 'fleetGroupId',
      'destinationShipId', 'cycle', 'controlRevision', 'requestedAt', 'revision', 'currentPosition',
      'destinationPosition', 'velocity', 'departedAt', 'arrivesAt'];
    return exactKeys(before, beforeKeys) && before.kind === 'shuttle-movement' && before.exists === true &&
      before.status === 'requested' && before.sessionId === expected.sessionId && before.shuttleId === expected.shuttleId &&
      before.holderUidHash === expected.uidHash && before.groupId === expected.groupId &&
      before.controlRevision === expected.controlRevision && before.cycle === expected.cycle &&
      exactKeys(after, afterKeys) && after.kind === 'shuttle-movement' && after.exists === true && after.status === 'in-transit' &&
      after.sessionId === expected.sessionId && after.requestId === before.requestId &&
      after.transitRequestId === request?.requestId && after.shuttleId === expected.shuttleId &&
      after.holderUidHash === expected.uidHash && after.groupId === expected.groupId &&
      after.destinationShipId === before.destinationShipId && after.controlRevision === expected.controlRevision &&
      after.cycle === expected.cycle && Number.isSafeInteger(after.revision) && after.revision >= 1 &&
      exactKeys(request, requestKeys) && request.sessionId === expected.sessionId &&
      request.shuttleId === expected.shuttleId && request.expectedDepartureRequestId === before.requestId &&
      request.expectedControlRevision === expected.controlRevision && request.expectedCycle === expected.cycle &&
      exactKeys(result, resultKeys) && result.status === 'in-transit' && result.sessionId === expected.sessionId &&
      result.requestId === before.requestId && result.transitRequestId === request.requestId &&
      result.shuttleId === expected.shuttleId && hashUid(result.holderUid) === expected.uidHash &&
      result.fleetGroupId === expected.groupId && result.destinationShipId === before.destinationShipId &&
      result.controlRevision === expected.controlRevision && result.cycle === expected.cycle &&
      result.revision === after.revision && result.revision >= 1 && validPublicPoint(result.currentPosition) &&
      validPublicPoint(result.destinationPosition) && validPublicPoint(result.velocity) &&
      typeof result.requestedAt === 'string' && Number.isFinite(Date.parse(result.requestedAt)) &&
      typeof result.departedAt === 'string' && Number.isFinite(Date.parse(result.departedAt)) &&
      typeof result.arrivesAt === 'string' && Number.isFinite(Date.parse(result.arrivesAt)) &&
      validMovementAuthorityTuple(input, expected);
  }
  if (endpoint === 'evacuateShuttleSurvivorsCommand') {
    const witnessKeys = ['kind', 'sessionId', 'cycle', 'shuttleId', 'holderUidHash', 'groupId', 'controlRevision',
      'sourceShipId', 'destinationShipId', 'amount', 'sourcePopulation', 'destinationPopulation',
      'ledgerCycle', 'movedThisCycle', 'evacuationRevision'];
    const requestKeys = ['sessionId', 'requestId', 'shuttleId', 'destinationShipId', 'amount',
      'expectedControlRevision', 'expectedCycle', 'expectedEvacuationRevision'];
    const resultKeys = ['status', 'sessionId', 'requestId', 'shuttleId', 'sourceShipId', 'destinationShipId',
      'amount', 'sourcePopulation', 'destinationPopulation', 'cycle', 'movedThisCycle', 'evacuationRevision'];
    if (!exactKeys(before, witnessKeys) || !exactKeys(after, witnessKeys) ||
        before.kind !== 'shuttle-evacuation' || after.kind !== 'shuttle-evacuation' ||
        !exactKeys(request, requestKeys) || !exactKeys(result, resultKeys)) return false;
    const sameSelection = witness => witness.sessionId === expected.sessionId && witness.cycle === expected.cycle &&
      witness.shuttleId === expected.shuttleId && witness.holderUidHash === expected.uidHash &&
      witness.groupId === expected.groupId && witness.controlRevision === expected.controlRevision &&
      witness.sourceShipId === expected.sourceShipId && witness.destinationShipId === expected.destinationShipId &&
      witness.amount === expected.amount && witness.amount === request?.amount;
    const populationsValid = witness => Number.isSafeInteger(witness.sourcePopulation) && witness.sourcePopulation >= 0 &&
      Number.isSafeInteger(witness.destinationPopulation) && witness.destinationPopulation >= 0 &&
      Number.isSafeInteger(witness.ledgerCycle) && witness.ledgerCycle >= 0 && witness.ledgerCycle <= expected.cycle &&
      Number.isSafeInteger(witness.movedThisCycle) && witness.movedThisCycle >= 0 && witness.movedThisCycle <= 5_000 &&
      Number.isSafeInteger(witness.evacuationRevision) && witness.evacuationRevision >= 0;
    if (!sameSelection(before) || !sameSelection(after) || !populationsValid(before) || !populationsValid(after) ||
        before.ledgerCycle === expected.cycle && before.movedThisCycle > 5_000 - before.amount ||
        before.ledgerCycle !== expected.cycle && before.movedThisCycle !== 0 ||
        !Number.isSafeInteger(before.amount) || before.amount < 1 || before.amount > 5_000 ||
        before.sourcePopulation < before.amount || after.sourcePopulation !== before.sourcePopulation - before.amount ||
        after.destinationPopulation !== before.destinationPopulation + before.amount ||
        after.ledgerCycle !== expected.cycle || after.movedThisCycle !== before.movedThisCycle + before.amount ||
        after.evacuationRevision !== before.evacuationRevision + 1 ||
        request.sessionId !== expected.sessionId || request.shuttleId !== expected.shuttleId ||
        request.destinationShipId !== expected.destinationShipId || request.expectedControlRevision !== expected.controlRevision ||
        request.expectedCycle !== expected.cycle || request.expectedEvacuationRevision !== before.evacuationRevision ||
        result.status !== 'committed' || result.sessionId !== expected.sessionId || result.requestId !== request.requestId ||
        result.shuttleId !== expected.shuttleId || result.sourceShipId !== expected.sourceShipId ||
        result.destinationShipId !== expected.destinationShipId || result.amount !== expected.amount ||
        result.sourcePopulation !== after.sourcePopulation || result.destinationPopulation !== after.destinationPopulation ||
        result.cycle !== expected.cycle || result.movedThisCycle !== after.movedThisCycle ||
        result.evacuationRevision !== after.evacuationRevision) return false;
    return true;
  }
  if (endpoint === 'retargetShuttleTransit') {
    const movementKeys = ['kind', 'exists', 'status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId',
      'holderUidHash', 'groupId', 'destinationShipId', 'controlRevision', 'cycle', 'revision'];
    const requestKeys = ['sessionId', 'requestId', 'shuttleId', 'transitRequestId', 'destinationShipId',
      'expectedControlRevision', 'expectedCycle'];
    const resultKeys = ['status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId', 'holderUid', 'fleetGroupId',
      'destinationShipId', 'cycle', 'controlRevision', 'requestedAt', 'revision', 'currentPosition',
      'destinationPosition', 'velocity', 'departedAt', 'arrivesAt'];
    return exactKeys(before, movementKeys) && before.kind === 'shuttle-movement' && before.exists === true &&
      before.status === 'in-transit' && before.sessionId === expected.sessionId && before.shuttleId === expected.shuttleId &&
      before.holderUidHash === expected.uidHash && before.groupId === expected.groupId &&
      (expected.departureRequestId === undefined || before.requestId === expected.departureRequestId) &&
      before.transitRequestId === expected.transitRequestId && before.controlRevision === expected.controlRevision &&
      before.cycle === expected.cycle && Number.isSafeInteger(before.revision) && before.revision >= 1 &&
      exactKeys(after, movementKeys) && after.kind === 'shuttle-movement' && after.exists === true &&
      after.status === 'in-transit' && after.sessionId === expected.sessionId && after.shuttleId === expected.shuttleId &&
      after.holderUidHash === expected.uidHash && after.groupId === expected.groupId &&
      after.requestId === before.requestId && after.transitRequestId === before.transitRequestId &&
      after.controlRevision === expected.controlRevision && after.cycle === expected.cycle &&
      after.revision === before.revision + 1 && after.destinationShipId === expected.destinationShipId &&
      exactKeys(request, requestKeys) && request.sessionId === expected.sessionId && request.shuttleId === expected.shuttleId &&
      request.transitRequestId === before.transitRequestId && request.destinationShipId === expected.destinationShipId &&
      request.expectedControlRevision === expected.controlRevision && request.expectedCycle === expected.cycle &&
      exactKeys(result, resultKeys) && result.status === 'in-transit' && result.sessionId === expected.sessionId &&
      result.requestId === before.requestId && result.transitRequestId === before.transitRequestId &&
      result.shuttleId === expected.shuttleId && hashUid(result.holderUid) === expected.uidHash &&
      result.fleetGroupId === expected.groupId && result.destinationShipId === expected.destinationShipId &&
      result.controlRevision === expected.controlRevision && result.cycle === expected.cycle &&
      result.revision === after.revision && validPublicPoint(result.currentPosition) &&
      validPublicPoint(result.destinationPosition) && validPublicPoint(result.velocity) &&
      typeof result.requestedAt === 'string' && Number.isFinite(Date.parse(result.requestedAt)) &&
      typeof result.departedAt === 'string' && Number.isFinite(Date.parse(result.departedAt)) &&
      typeof result.arrivesAt === 'string' && Number.isFinite(Date.parse(result.arrivesAt)) &&
      validMovementAuthorityTuple(input, expected);
  }
  return false;
}

function validShuttleArrivalCapture(input, expected) {
  const arrival = input.arrival;
  const ready = arrival?.readyControl;
  const before = arrival?.before;
  const beforeProjection = arrival?.beforeProjection;
  const afterProjection = arrival?.afterProjection;
  const request = input.request;
  const response = input.response;
  const result = response?.result;
  const transitRequestId = expected.transitRequestId;
  const shuttleId = expected.shuttleId;
  const destinationShipId = expected.destinationShipId;
  const baseProjectionKeys = ['kind', 'live', 'sessionId', 'cycle', 'phase', 'turn', 'progression',
    'airspaceState', 'pressAccess', 'timerPaused', 'holderUidHash', 'controlRevision',
    'holderGroupId', 'destinationGroupId', 'destinationActive', 'resourceBalances'];
  const beforeProjectionKeys = [...baseProjectionKeys, 'dockingCount'];
  const afterProjectionKeys = [...baseProjectionKeys, 'movementAbsent', 'dockings', 'visits', 'observedAt'];
  const dockingKeys = ['shuttleId', 'shipId', 'dockedAt'];
  const visitKeys = ['id', 'shuttleId', 'shipId', 'action', 'occurredAt'];
  const movementKeys = ['kind', 'status', 'sessionId', 'departureRequestId', 'transitRequestId',
    'shuttleId', 'holderUidHash', 'groupId', 'destinationShipId', 'controlRevision', 'cycle',
    'transitRevision', 'requestedAt', 'departedAt', 'arrivesAt'];
  const requestKeys = ['sessionId', 'shuttleId', 'transitRequestId', 'expectedControlRevision'];
  const resultKeys = ['status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId',
    'hostShipId', 'arrivedAt', 'transitRevision'];
  const priorWitnessKeys = ['status', 'endpoint', 'sessionId', 'roleId', 'uidHash', 'shuttleId', 'groupId',
    'cycle', 'controlRevision', 'departureRequestId', 'transitRequestId', 'destinationShipId', 'transitRevision',
    'sourceAuthority'];
  const balanceKeys = ['host', 'shuttle'];
  const inventoryKeys = ['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap'];
  const sourceKeys = ['live', 'sessionId', 'cycle', 'phase', 'groupId'];
  const coordinationIsManual = projection => projection?.phase === 'active' &&
    projection.progression === 'manual' && projection.timerPaused === false &&
    projection.turn === projection.cycle &&
    (projection.airspaceState === 'lifted' ||
      shuttleId === 'snn-press-shuttle' && projection.pressAccess === true);
  const validInstant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const validInventory = value => exactKeys(value, Object.keys(value ?? {})) &&
    Object.keys(value).every(key => inventoryKeys.includes(key)) &&
    Object.values(value).every(amount => Number.isSafeInteger(amount) && amount >= 0);

  if (input.mountedUi !== true || typeof expected.roleId !== 'string' ||
      !matchesActor(input.actorBefore, expected, false) || !matchesActor(input.actorAfter, expected, false) ||
      !exactKeys(arrival, arrival?.captureMode === 'automatic-source-effect'
        ? ['captureMode', 'priorWitness', 'automaticObservation', 'before', 'beforeProjection',
          'authorityBefore', 'authorityAfter', 'afterProjection']
        : ['readyControl', 'priorWitness', 'before', 'beforeProjection', 'authorityBefore',
          'authorityAfter', 'afterProjection']) ||
      !exactKeys(arrival.priorWitness, priorWitnessKeys) || arrival.priorWitness.status !== 'completed' ||
      arrival.priorWitness.endpoint !== 'retargetShuttleTransit' ||
      arrival.priorWitness.sessionId !== expected.sessionId || arrival.priorWitness.roleId !== expected.roleId ||
      arrival.priorWitness.uidHash !== expected.uidHash || arrival.priorWitness.shuttleId !== shuttleId ||
      arrival.priorWitness.groupId !== expected.groupId || arrival.priorWitness.cycle !== expected.cycle ||
      arrival.priorWitness.controlRevision !== expected.controlRevision ||
      arrival.priorWitness.departureRequestId !== expected.departureRequestId ||
      arrival.priorWitness.transitRequestId !== transitRequestId ||
      arrival.priorWitness.destinationShipId !== destinationShipId ||
      arrival.priorWitness.transitRevision !== expected.transitRevision ||
      !validSourceAuthority(expected.sourceAuthority, { sessionId: expected.sessionId, uidHash: expected.uidHash,
        groupId: expected.groupId, roleId: expected.roleId, shuttleId }) ||
      !validSourceAuthority(arrival.authorityBefore, { sessionId: expected.sessionId, uidHash: expected.uidHash,
        groupId: expected.groupId, roleId: expected.roleId, shuttleId }) ||
      !validSourceAuthority(arrival.authorityAfter, { sessionId: expected.sessionId, uidHash: expected.uidHash,
        groupId: expected.groupId, roleId: expected.roleId, shuttleId }) ||
      !sameSourceAuthority(arrival.priorWitness.sourceAuthority, expected.sourceAuthority) ||
      !sameSourceAuthority(arrival.authorityBefore, expected.sourceAuthority) ||
      !sameSourceAuthority(arrival.authorityAfter, expected.sourceAuthority) ||
      !validShuttleOriginAuthority(input.originAuthority, { sessionId: expected.sessionId,
        uidHash: expected.uidHash, shuttleId, groupId: expected.groupId, cycle: expected.cycle,
        controlRevision: expected.controlRevision, roleId: expected.roleId, sourceAuthority: expected.sourceAuthority }) ||
      !exactKeys(input.sourceBefore, sourceKeys) || !exactKeys(input.sourceAfter, sourceKeys) ||
      input.sourceBefore.live !== true || input.sourceAfter.live !== true ||
      input.sourceBefore.sessionId !== expected.sessionId || input.sourceAfter.sessionId !== expected.sessionId ||
      input.sourceBefore.cycle !== expected.cycle || input.sourceAfter.cycle !== expected.cycle ||
      input.sourceBefore.phase !== 'active' || input.sourceAfter.phase !== 'active' ||
      input.sourceBefore.groupId !== expected.groupId || input.sourceAfter.groupId !== expected.groupId ||
      (arrival.captureMode === 'automatic-source-effect'
        ? !exactKeys(arrival.automaticObservation, ['kind', 'panel', 'armedAt', 'arrivesAt', 'remainingMs', 'responseObservedAt']) ||
          arrival.automaticObservation.kind !== 'source-useEffect' ||
          arrival.automaticObservation.panel !== 'Shuttle departure' ||
          !validInstant(arrival.automaticObservation.armedAt) ||
          arrival.automaticObservation.arrivesAt !== before?.arrivesAt ||
          !Number.isSafeInteger(arrival.automaticObservation.remainingMs) ||
          arrival.automaticObservation.remainingMs < 1 || arrival.automaticObservation.remainingMs > 35_000 ||
          Date.parse(arrival.automaticObservation.arrivesAt) <= Date.parse(arrival.automaticObservation.armedAt) ||
          Math.abs(Date.parse(arrival.automaticObservation.arrivesAt) -
            Date.parse(arrival.automaticObservation.armedAt) - arrival.automaticObservation.remainingMs) > 1_000 ||
          !validInstant(arrival.automaticObservation.responseObservedAt) ||
          Date.parse(arrival.automaticObservation.responseObservedAt) < Date.parse(before?.arrivesAt ?? '')
        : !exactKeys(ready, ['panel', 'label', 'visible', 'enabled', 'sessionId', 'cycle', 'transitRequestId', 'observedAt']) ||
          ready.panel !== 'Shuttle departure' || ready.label !== 'Complete arrival' ||
          ready.visible !== true || ready.enabled !== true || ready.sessionId !== expected.sessionId ||
          ready.cycle !== expected.cycle || ready.transitRequestId !== transitRequestId || !validInstant(ready.observedAt)) ||
      !exactKeys(before, movementKeys) || before.kind !== 'shuttle-arrival-before' ||
      before.status !== 'in-transit' || before.sessionId !== expected.sessionId ||
      typeof before.departureRequestId !== 'string' || !before.departureRequestId ||
      before.departureRequestId !== expected.departureRequestId ||
      before.transitRequestId !== transitRequestId || before.shuttleId !== shuttleId ||
      before.holderUidHash !== expected.uidHash || before.groupId !== expected.groupId ||
      before.destinationShipId !== destinationShipId || before.controlRevision !== expected.controlRevision ||
      before.cycle !== expected.cycle || before.transitRevision !== expected.transitRevision ||
      !Number.isSafeInteger(before.transitRevision) || before.transitRevision < 1 ||
      !validInstant(before.requestedAt) || !validInstant(before.departedAt) || !validInstant(before.arrivesAt) ||
      Date.parse(before.requestedAt) > Date.parse(before.departedAt) ||
      Date.parse(before.arrivesAt) - Date.parse(before.departedAt) !== 60_000 ||
      arrival.captureMode !== 'automatic-source-effect' && Date.parse(ready.observedAt) < Date.parse(before.arrivesAt) ||
      !exactKeys(beforeProjection, beforeProjectionKeys) || beforeProjection.kind !== 'shuttle-arrival-projection' ||
      beforeProjection.live !== true || beforeProjection.sessionId !== expected.sessionId ||
      beforeProjection.cycle !== expected.cycle || beforeProjection.holderUidHash !== expected.uidHash ||
      beforeProjection.controlRevision !== expected.controlRevision || beforeProjection.holderGroupId !== expected.groupId ||
      beforeProjection.destinationGroupId !== expected.groupId || beforeProjection.destinationActive !== true ||
      beforeProjection.dockingCount !== 0 || !coordinationIsManual(beforeProjection) ||
      !exactKeys(request, requestKeys) || request.sessionId !== expected.sessionId ||
      request.shuttleId !== shuttleId || request.transitRequestId !== transitRequestId ||
      request.expectedControlRevision !== expected.controlRevision ||
      response?.httpStatus !== 200 || !exactKeys(response, ['httpStatus', 'exactReplay', 'result']) ||
      response.exactReplay !== false || input.replay !== null ||
      !exactKeys(result, resultKeys) || result.status !== 'arrived' || result.sessionId !== expected.sessionId ||
      result.requestId !== `arrival-${transitRequestId}` || result.transitRequestId !== transitRequestId ||
      result.shuttleId !== shuttleId || result.hostShipId !== destinationShipId ||
      result.transitRevision !== before.transitRevision || !validInstant(result.arrivedAt) ||
      Date.parse(result.arrivedAt) < Date.parse(before.arrivesAt) ||
      !exactKeys(afterProjection, afterProjectionKeys) || afterProjection.kind !== 'shuttle-arrival-projection' ||
      afterProjection.live !== true || afterProjection.sessionId !== expected.sessionId ||
      afterProjection.cycle !== expected.cycle || afterProjection.holderUidHash !== expected.uidHash ||
      afterProjection.controlRevision !== expected.controlRevision || afterProjection.holderGroupId !== expected.groupId ||
      afterProjection.destinationGroupId !== expected.groupId || afterProjection.destinationActive !== true ||
      afterProjection.movementAbsent !== true || !coordinationIsManual(afterProjection) ||
      afterProjection.phase !== beforeProjection.phase || afterProjection.turn !== beforeProjection.turn ||
      afterProjection.progression !== beforeProjection.progression ||
      afterProjection.airspaceState !== beforeProjection.airspaceState ||
      afterProjection.pressAccess !== beforeProjection.pressAccess ||
      !exactKeys(afterProjection.resourceBalances, balanceKeys) ||
      !exactKeys(beforeProjection.resourceBalances, balanceKeys) ||
      !validInventory(beforeProjection.resourceBalances.host) ||
      !validInventory(beforeProjection.resourceBalances.shuttle) ||
      !validInventory(afterProjection.resourceBalances.host) ||
      !validInventory(afterProjection.resourceBalances.shuttle) ||
      !exactKeys(afterProjection.resourceBalances.host, Object.keys(beforeProjection.resourceBalances.host)) ||
      !exactKeys(afterProjection.resourceBalances.shuttle, Object.keys(beforeProjection.resourceBalances.shuttle)) ||
      JSON.stringify(afterProjection.resourceBalances) !== JSON.stringify(beforeProjection.resourceBalances) ||
      !validInstant(afterProjection.observedAt) || Date.parse(afterProjection.observedAt) < Date.parse(before.arrivesAt) ||
      !Array.isArray(afterProjection.dockings) || afterProjection.dockings.length !== 1 ||
      !exactKeys(afterProjection.dockings[0], dockingKeys) ||
      afterProjection.dockings[0].shuttleId !== shuttleId ||
      afterProjection.dockings[0].shipId !== destinationShipId ||
      afterProjection.dockings[0].dockedAt !== result.arrivedAt ||
      !Array.isArray(afterProjection.visits) || afterProjection.visits.length !== 2 ||
      afterProjection.visits.some(visit => !exactKeys(visit, visitKeys) || visit.shuttleId !== shuttleId ||
        !validInstant(visit.occurredAt)) ||
      afterProjection.visits.filter(visit => visit.id === `shuttle-arrival-${transitRequestId}-departed` &&
        visit.action === 'departed' && visit.shipId !== destinationShipId &&
        Date.parse(visit.occurredAt) >= Date.parse(before.requestedAt) &&
        Date.parse(visit.occurredAt) <= Date.parse(before.departedAt)).length !== 1 ||
      afterProjection.visits.filter(visit => visit.id === `shuttle-arrival-${transitRequestId}-docked` &&
        visit.action === 'docked' && visit.shipId === destinationShipId && visit.occurredAt === result.arrivedAt).length !== 1 ||
      input.rendered?.visible !== true || input.rendered.resultStatus !== 'arrived') {
    return pending(CASE_BY_ID.get('core:completeShuttleArrival'),
      'single-shot-arrival-does-not-match-the-live-holder-transit-ready-control-and-source-docking');
  }
  return {
    status: 'completed', caseId: 'core:completeShuttleArrival', family: 'pending-core-craft-actions',
    endpoint: 'completeShuttleArrival', actorRoleId: expected.roleId, cycle: expected.cycle,
    actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(request),
    arrivalMode: arrival.captureMode ?? 'manual-control',
    exactSdkRetry: 'not-claimed', randomOutcomeRecorded: false, rendered: 'arrived',
  };
}

// Press SNN has a deliberately narrower member projection than the core shuttles:
// its private audience contains the craft but no vessel map or ship balances.
const PRESS_SHUTTLE_ID = 'snn-press-shuttle';
const PRESS_DOCUMENT_AUTHORITY_KEYS = Object.freeze(['kind', 'sessionId', 'uidHash', 'groupId',
  'activeConsoleRoleId', 'assignedRoleId', 'connectionGeneration', 'identityHydrationRevision',
  'documentTimeOrigin', 'audienceHash', 'authorityHash', 'discoveryRevision',
  'discoveryVesselsHash', 'shuttleAuthorized']);
const PRESS_ORIGIN_AUTHORITY_KEYS = Object.freeze(['kind', 'sessionId', 'uidHash', 'shuttleId', 'groupId',
  'cycle', 'controlRevision', 'originShipId', 'sourceAuthority']);
const PRESS_GROUP_AUTHORITY_KEYS = Object.freeze(['groupId', 'fleetGroupVesselIds', 'revision']);
const PRESS_DOCKING_KEYS = Object.freeze(['kind', 'shuttleId', 'dockingCount', 'originShipId']);
const PRESS_DEPARTURE_WITNESS_KEYS = Object.freeze(['kind', 'status', 'endpoint', 'sessionId', 'roleId',
  'uidHash', 'shuttleId', 'groupId', 'cycle', 'controlRevision', 'originShipId', 'destinationShipId',
  'departureRequestId', 'requestedAt', 'sourceAuthority']);
const PRESS_TRANSIT_WITNESS_KEYS = Object.freeze(['kind', 'status', 'endpoint', 'sessionId', 'roleId',
  'uidHash', 'shuttleId', 'groupId', 'cycle', 'controlRevision', 'originShipId', 'destinationShipId',
  'departureRequestId', 'transitRequestId', 'transitRevision', 'requestedAt', 'departedAt', 'arrivesAt',
  'sourceAuthority']);
const PRESS_ARRIVAL_WITNESS_KEYS = Object.freeze(['kind', 'status', 'endpoint', 'sessionId', 'roleId',
  'uidHash', 'shuttleId', 'groupId', 'cycle', 'controlRevision', 'originShipId', 'departureRequestId',
  'transitRequestId', 'destinationShipId', 'transitRevision', 'requestedAt', 'departedAt', 'arrivesAt',
  'sourceAuthority']);

function pressHashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validPressDocumentAuthority(value, expected = {}) {
  return exactKeys(value, PRESS_DOCUMENT_AUTHORITY_KEYS) &&
    value.kind === 'press-shuttle-current-document' && value.sessionId === expected.sessionId &&
    typeof value.sessionId === 'string' && value.uidHash === expected.uidHash &&
    /^[0-9a-f]{16}$/.test(value.uidHash ?? '') && value.groupId === expected.groupId &&
    typeof value.groupId === 'string' && value.groupId.length > 0 &&
    value.activeConsoleRoleId === 'press-officer' && value.assignedRoleId === null &&
    Number.isSafeInteger(value.connectionGeneration) && value.connectionGeneration >= 1 &&
    Number.isSafeInteger(value.identityHydrationRevision) && value.identityHydrationRevision >= 1 &&
    Number.isFinite(value.documentTimeOrigin) && value.documentTimeOrigin > 0 &&
    /^[0-9a-f]{64}$/.test(value.audienceHash ?? '') && /^[0-9a-f]{64}$/.test(value.authorityHash ?? '') &&
    Number.isSafeInteger(value.discoveryRevision) && value.discoveryRevision >= 0 &&
    /^[0-9a-f]{64}$/.test(value.discoveryVesselsHash ?? '') && value.shuttleAuthorized === true;
}

function samePressDocumentAuthority(left, right) {
  return exactKeys(left, PRESS_DOCUMENT_AUTHORITY_KEYS) && exactKeys(right, PRESS_DOCUMENT_AUTHORITY_KEYS) &&
    PRESS_DOCUMENT_AUTHORITY_KEYS.every(key => left[key] === right[key]);
}

function validPressGroupAuthority(value, authority, originShipId, destinationShipId) {
  if (!exactKeys(value, PRESS_GROUP_AUTHORITY_KEYS) || value.groupId !== authority?.groupId ||
      value.revision !== authority?.discoveryRevision || !Array.isArray(value.fleetGroupVesselIds) ||
      value.fleetGroupVesselIds.length === 0 ||
      value.fleetGroupVesselIds.some(id => typeof id !== 'string' || !id) ||
      new Set(value.fleetGroupVesselIds).size !== value.fleetGroupVesselIds.length) return false;
  const vessels = [...value.fleetGroupVesselIds].sort();
  return JSON.stringify(value.fleetGroupVesselIds) === JSON.stringify(vessels) &&
    pressHashJson(vessels) === authority.discoveryVesselsHash &&
    pressHashJson({ groupId: value.groupId, vesselIds: [], craftIds: [PRESS_SHUTTLE_ID] }) === authority.audienceHash &&
    vessels.includes(originShipId) && vessels.includes(destinationShipId);
}

function validPressOriginAuthority(value, expected = {}) {
  return exactKeys(value, PRESS_ORIGIN_AUTHORITY_KEYS) && value.kind === 'press-shuttle-origin' &&
    value.sessionId === expected.sessionId && value.uidHash === expected.uidHash &&
    /^[0-9a-f]{16}$/.test(value.uidHash ?? '') && value.shuttleId === PRESS_SHUTTLE_ID &&
    value.shuttleId === expected.shuttleId && value.groupId === expected.groupId &&
    typeof value.groupId === 'string' && value.groupId.length > 0 && value.cycle === expected.cycle &&
    Number.isSafeInteger(value.cycle) && value.cycle >= 1 &&
    value.controlRevision === expected.controlRevision && Number.isSafeInteger(value.controlRevision) &&
    value.controlRevision >= 0 && typeof value.originShipId === 'string' && value.originShipId.length > 0 &&
    validPressDocumentAuthority(value.sourceAuthority, { sessionId: value.sessionId,
      uidHash: value.uidHash, groupId: value.groupId }) &&
    (!expected.sourceAuthority || samePressDocumentAuthority(value.sourceAuthority, expected.sourceAuthority));
}

function samePressOriginAuthority(left, right) {
  return validPressOriginAuthority(left, { sessionId: right?.sessionId, uidHash: right?.uidHash,
    shuttleId: right?.shuttleId, groupId: right?.groupId, cycle: right?.cycle,
    controlRevision: right?.controlRevision, sourceAuthority: right?.sourceAuthority }) &&
    validPressOriginAuthority(right, { sessionId: left?.sessionId, uidHash: left?.uidHash,
      shuttleId: left?.shuttleId, groupId: left?.groupId, cycle: left?.cycle,
      controlRevision: left?.controlRevision, sourceAuthority: left?.sourceAuthority }) &&
    left.originShipId === right.originShipId && samePressDocumentAuthority(left.sourceAuthority, right.sourceAuthority);
}

function validPressDepartureWitness(witness, origin, destinationShipId) {
  return exactKeys(witness, PRESS_DEPARTURE_WITNESS_KEYS) && witness.kind === 'press-shuttle-departure-witness' &&
    witness.status === 'completed' && witness.endpoint === 'requestShuttleDeparture' &&
    witness.sessionId === origin.sessionId && witness.roleId === 'press-officer' &&
    witness.uidHash === origin.uidHash && witness.shuttleId === PRESS_SHUTTLE_ID &&
    witness.groupId === origin.groupId && witness.cycle === origin.cycle &&
    witness.controlRevision === origin.controlRevision && witness.originShipId === origin.originShipId &&
    witness.destinationShipId === destinationShipId && typeof witness.departureRequestId === 'string' &&
    witness.departureRequestId.length > 0 && typeof witness.requestedAt === 'string' &&
    Number.isFinite(Date.parse(witness.requestedAt)) &&
    samePressDocumentAuthority(witness.sourceAuthority, origin.sourceAuthority);
}

function validPressTransitWitness(witness, origin, departureWitness, destinationShipId) {
  return exactKeys(witness, PRESS_TRANSIT_WITNESS_KEYS) && witness.kind === 'press-shuttle-transit-witness' &&
    witness.status === 'completed' && witness.endpoint === 'beginShuttleTransit' &&
    witness.sessionId === origin.sessionId && witness.roleId === 'press-officer' &&
    witness.uidHash === origin.uidHash && witness.shuttleId === PRESS_SHUTTLE_ID &&
    witness.groupId === origin.groupId && witness.cycle === origin.cycle &&
    witness.controlRevision === origin.controlRevision && witness.originShipId === origin.originShipId &&
    witness.destinationShipId === destinationShipId &&
    witness.departureRequestId === departureWitness.departureRequestId &&
    typeof witness.transitRequestId === 'string' && witness.transitRequestId.length > 0 &&
    Number.isSafeInteger(witness.transitRevision) && witness.transitRevision >= 1 &&
    witness.requestedAt === departureWitness.requestedAt && typeof witness.departedAt === 'string' &&
    typeof witness.arrivesAt === 'string' && Number.isFinite(Date.parse(witness.departedAt)) &&
    Number.isFinite(Date.parse(witness.arrivesAt)) &&
    Date.parse(witness.arrivesAt) - Date.parse(witness.departedAt) === 60_000 &&
    Date.parse(witness.requestedAt) <= Date.parse(witness.departedAt) &&
    samePressDocumentAuthority(witness.sourceAuthority, origin.sourceAuthority);
}

function validPressArrivalWitness(witness, origin, expected = {}) {
  return exactKeys(witness, PRESS_ARRIVAL_WITNESS_KEYS) && witness.kind === 'press-shuttle-arrival-witness' &&
    witness.status === 'completed' && witness.endpoint === 'retargetShuttleTransit' &&
    witness.sessionId === origin.sessionId && witness.roleId === 'press-officer' &&
    witness.uidHash === origin.uidHash && witness.shuttleId === PRESS_SHUTTLE_ID &&
    witness.groupId === origin.groupId && witness.cycle === origin.cycle &&
    witness.controlRevision === origin.controlRevision && witness.originShipId === origin.originShipId &&
    typeof witness.departureRequestId === 'string' && witness.departureRequestId.length > 0 &&
    typeof witness.transitRequestId === 'string' && witness.transitRequestId.length > 0 &&
    typeof witness.destinationShipId === 'string' && witness.destinationShipId.length > 0 &&
    (expected.destinationShipId === undefined || witness.destinationShipId === expected.destinationShipId) &&
    Number.isSafeInteger(witness.transitRevision) && witness.transitRevision >= 1 &&
    typeof witness.requestedAt === 'string' && typeof witness.departedAt === 'string' &&
    typeof witness.arrivesAt === 'string' && [witness.requestedAt, witness.departedAt, witness.arrivesAt]
      .every(value => Number.isFinite(Date.parse(value))) &&
    Date.parse(witness.requestedAt) <= Date.parse(witness.departedAt) &&
    Date.parse(witness.arrivesAt) - Date.parse(witness.departedAt) === 60_000 &&
    samePressDocumentAuthority(witness.sourceAuthority, origin.sourceAuthority);
}

function validPressMovementCapture(input, endpoint) {
  const expected = input.expected ?? {};
  const origin = input.pressOriginAuthority;
  const before = input.transitionBefore;
  const after = input.transitionAfter;
  const request = input.request;
  const result = input.response?.result;
  const groupBefore = input.pressGroupAuthorityBefore;
  const groupAfter = input.pressGroupAuthorityAfter;
  const sameAuthority = validPressOriginAuthority(origin, { sessionId: expected.sessionId,
    uidHash: expected.uidHash, shuttleId: expected.shuttleId, groupId: expected.groupId,
    cycle: expected.cycle, controlRevision: expected.controlRevision,
    sourceAuthority: expected.sourceAuthority }) &&
    validPressOriginAuthority(expected.pressOriginAuthority, { sessionId: expected.sessionId,
      uidHash: expected.uidHash, shuttleId: expected.shuttleId, groupId: expected.groupId,
      cycle: expected.cycle, controlRevision: expected.controlRevision,
      sourceAuthority: expected.sourceAuthority }) && samePressOriginAuthority(origin, expected.pressOriginAuthority) &&
    expected.originShipId === origin.originShipId && expected.destinationShipId !== origin.originShipId &&
    validPressDocumentAuthority(input.pressSourceAuthorityBefore, { sessionId: expected.sessionId,
      uidHash: expected.uidHash, groupId: expected.groupId }) &&
    validPressDocumentAuthority(input.pressSourceAuthorityAfter, { sessionId: expected.sessionId,
      uidHash: expected.uidHash, groupId: expected.groupId }) &&
    samePressDocumentAuthority(input.pressSourceAuthorityBefore, origin.sourceAuthority) &&
    samePressDocumentAuthority(input.pressSourceAuthorityAfter, origin.sourceAuthority) &&
    validPressGroupAuthority(groupBefore, origin.sourceAuthority, origin.originShipId, expected.destinationShipId) &&
    validPressGroupAuthority(groupAfter, origin.sourceAuthority, origin.originShipId, expected.destinationShipId) &&
    JSON.stringify(groupBefore) === JSON.stringify(groupAfter) &&
    Array.isArray(input.pressActiveVesselIdsBefore) && Array.isArray(input.pressActiveVesselIdsAfter) &&
    JSON.stringify(input.pressActiveVesselIdsBefore) === JSON.stringify(input.pressActiveVesselIdsAfter) &&
    input.pressActiveVesselIdsBefore.includes(origin.originShipId) &&
    input.pressActiveVesselIdsBefore.includes(expected.destinationShipId) &&
    validPressDocking(input.pressDockingBefore, endpoint === 'requestShuttleDeparture' || endpoint === 'beginShuttleTransit'
      ? 1 : 0, endpoint === 'requestShuttleDeparture' || endpoint === 'beginShuttleTransit'
        ? origin.originShipId : null) &&
    validPressDocking(input.pressDockingAfter, endpoint === 'requestShuttleDeparture' ? 1 : 0,
      endpoint === 'requestShuttleDeparture' ? origin.originShipId : null) &&
    exactKeys(input.sourceBefore, ['live', 'sessionId', 'cycle', 'phase', 'revision', 'groupId']) &&
    exactKeys(input.sourceAfter, ['live', 'sessionId', 'cycle', 'phase', 'revision', 'groupId']) &&
    input.sourceBefore.live === true && input.sourceAfter.live === true &&
    input.sourceBefore.sessionId === origin.sessionId && input.sourceAfter.sessionId === origin.sessionId &&
    input.sourceBefore.cycle === origin.cycle && input.sourceAfter.cycle === origin.cycle &&
    input.sourceBefore.phase === 'active' && input.sourceAfter.phase === 'active' &&
    input.sourceBefore.revision === expected.sourceRevision &&
    input.sourceAfter.revision === (endpoint === 'requestShuttleDeparture'
      ? expected.sourceRevision : result?.revision) &&
    input.sourceBefore.groupId === origin.groupId && input.sourceAfter.groupId === origin.groupId &&
    input.mountedUi === true && matchesActor(input.actorBefore, expected, false) &&
    matchesActor(input.actorAfter, expected, false) && input.actorBefore.profileRoleId === 'press-officer' &&
    input.actorAfter.profileRoleId === 'press-officer' && input.actorBefore.activeConsoleRoleId === 'press-officer' &&
    input.actorAfter.activeConsoleRoleId === 'press-officer' && input.actorBefore.assignedRoleId === null &&
    input.actorAfter.assignedRoleId === null && input.response?.httpStatus === 200 &&
    exactKeys(input.response, ['httpStatus', 'result', 'exactReplay']) && input.response.exactReplay === true &&
    input.replay?.status === 'committed' && sameActionReceipt(result, input.replay.result) &&
    input.rendered?.visible === true && input.rendered.resultStatus === result?.status;
  if (!sameAuthority || !request || !result || request.sessionId !== expected.sessionId ||
      request.shuttleId !== PRESS_SHUTTLE_ID || request.expectedControlRevision !== origin.controlRevision ||
      request.expectedCycle !== origin.cycle || result.sessionId !== expected.sessionId ||
      result.shuttleId !== PRESS_SHUTTLE_ID || hashUid(result.holderUid) !== origin.uidHash ||
      result.fleetGroupId !== origin.groupId || result.cycle !== origin.cycle ||
      result.controlRevision !== origin.controlRevision ||
      !Array.isArray(input.pressActiveVesselIdsBefore) ||
      new Set(input.pressActiveVesselIdsBefore).size !== input.pressActiveVesselIdsBefore.length ||
      input.pressActiveVesselIdsBefore.some(id => typeof id !== 'string' || !id) ||
      JSON.stringify(input.pressActiveVesselIdsBefore) !== JSON.stringify([...input.pressActiveVesselIdsBefore].sort())) return false;

  const beforeKeys = endpoint === 'requestShuttleDeparture'
    ? ['kind', 'exists', 'sessionId', 'shuttleId', 'holderUidHash', 'groupId', 'controlRevision', 'cycle']
    : endpoint === 'beginShuttleTransit'
      ? ['kind', 'exists', 'status', 'sessionId', 'requestId', 'shuttleId', 'holderUidHash', 'groupId',
        'destinationShipId', 'controlRevision', 'cycle']
      : ['kind', 'exists', 'status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId',
        'holderUidHash', 'groupId', 'destinationShipId', 'controlRevision', 'cycle', 'revision'];
  const afterKeys = endpoint === 'requestShuttleDeparture'
    ? ['kind', 'exists', 'status', 'sessionId', 'requestId', 'shuttleId', 'holderUidHash', 'groupId',
      'destinationShipId', 'controlRevision', 'cycle']
    : ['kind', 'exists', 'status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId',
      'holderUidHash', 'groupId', 'destinationShipId', 'controlRevision', 'cycle', 'revision'];
  if (!exactKeys(before, beforeKeys) || !exactKeys(after, afterKeys) || before.kind !== 'shuttle-movement' ||
      after.kind !== 'shuttle-movement' || before.sessionId !== origin.sessionId || after.sessionId !== origin.sessionId ||
      before.shuttleId !== PRESS_SHUTTLE_ID || after.shuttleId !== PRESS_SHUTTLE_ID ||
      before.holderUidHash !== origin.uidHash || after.holderUidHash !== origin.uidHash ||
      before.groupId !== origin.groupId || after.groupId !== origin.groupId ||
      before.controlRevision !== origin.controlRevision || after.controlRevision !== origin.controlRevision ||
      before.cycle !== origin.cycle || after.cycle !== origin.cycle) return false;

  const departureKeys = ['sessionId', 'requestId', 'shuttleId', 'destinationShipId', 'expectedControlRevision', 'expectedCycle'];
  const transitKeys = ['sessionId', 'requestId', 'shuttleId', 'expectedDepartureRequestId',
    'expectedControlRevision', 'expectedCycle'];
  const retargetKeys = ['sessionId', 'requestId', 'shuttleId', 'transitRequestId', 'destinationShipId',
    'expectedControlRevision', 'expectedCycle'];
  const requestId = request.requestId;
  const validRequest = exactKeys(request, endpoint === 'requestShuttleDeparture' ? departureKeys
    : endpoint === 'beginShuttleTransit' ? transitKeys : retargetKeys) &&
    typeof requestId === 'string' && requestId.length > 0;
  if (!validRequest) return false;

  if (endpoint === 'requestShuttleDeparture') {
    const resultKeys = ['status', 'sessionId', 'requestId', 'shuttleId', 'holderUid', 'fleetGroupId',
      'originShipId', 'destinationShipId', 'cycle', 'controlRevision', 'requestedAt'];
    return before.exists === false && after.exists === true && after.status === 'requested' &&
      before.exists === false && after.requestId === requestId &&
      request.destinationShipId === expected.destinationShipId && request.destinationShipId !== origin.originShipId &&
      result.status === 'requested' && result.requestId === requestId &&
      result.originShipId === origin.originShipId && result.destinationShipId === expected.destinationShipId &&
      exactKeys(result, resultKeys) && typeof result.requestedAt === 'string' &&
      Number.isFinite(Date.parse(result.requestedAt));
  }

  if (endpoint === 'beginShuttleTransit') {
    const prior = input.pressShuttleDepartureWitness;
    const resultKeys = ['status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId', 'holderUid',
      'fleetGroupId', 'destinationShipId', 'cycle', 'controlRevision', 'requestedAt', 'revision',
      'currentPosition', 'destinationPosition', 'velocity', 'departedAt', 'arrivesAt'];
    if (!validPressDepartureWitness(prior, origin, expected.destinationShipId) ||
        before.exists !== true || before.status !== 'requested' || before.requestId !== prior.departureRequestId ||
        before.destinationShipId !== prior.destinationShipId || after.exists !== true || after.status !== 'in-transit' ||
        after.requestId !== prior.departureRequestId || after.transitRequestId !== requestId ||
        after.destinationShipId !== prior.destinationShipId || request.expectedDepartureRequestId !== prior.departureRequestId ||
        result.status !== 'in-transit' || result.requestId !== prior.departureRequestId || result.transitRequestId !== requestId ||
        result.destinationShipId !== prior.destinationShipId || result.requestedAt !== prior.requestedAt ||
        result.revision !== after.revision || !Number.isSafeInteger(result.revision) || result.revision < 1 ||
        !exactKeys(result, resultKeys) || !validPublicPoint(result.currentPosition) ||
        !validPublicPoint(result.destinationPosition) || !validPublicPoint(result.velocity) ||
        typeof result.departedAt !== 'string' || typeof result.arrivesAt !== 'string' ||
        !Number.isFinite(Date.parse(result.departedAt)) || !Number.isFinite(Date.parse(result.arrivesAt)) ||
        Date.parse(result.arrivesAt) - Date.parse(result.departedAt) !== 60_000 ||
        Date.parse(result.requestedAt) > Date.parse(result.departedAt)) return false;
    return true;
  }

  const prior = input.pressShuttleTransitWitness;
  const resultKeys = ['status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId', 'holderUid',
    'fleetGroupId', 'destinationShipId', 'cycle', 'controlRevision', 'requestedAt', 'revision',
    'currentPosition', 'destinationPosition', 'velocity', 'departedAt', 'arrivesAt'];
  return validPressTransitWitness(prior, origin, input.pressShuttleDepartureWitness ??
    { departureRequestId: prior?.departureRequestId, requestedAt: prior?.requestedAt }, before.destinationShipId) &&
    before.exists === true && before.status === 'in-transit' && before.requestId === prior.departureRequestId &&
    before.transitRequestId === prior.transitRequestId && before.destinationShipId === prior.destinationShipId &&
    before.revision === prior.transitRevision && after.exists === true && after.status === 'in-transit' &&
    after.requestId === prior.departureRequestId && after.transitRequestId === prior.transitRequestId &&
    after.destinationShipId === expected.destinationShipId && expected.destinationShipId !== prior.destinationShipId &&
    after.revision === before.revision + 1 && request.transitRequestId === prior.transitRequestId &&
    request.destinationShipId === expected.destinationShipId && result.status === 'in-transit' &&
    result.requestId === prior.departureRequestId && result.transitRequestId === prior.transitRequestId &&
    result.destinationShipId === expected.destinationShipId && result.requestedAt === prior.requestedAt &&
    result.revision === after.revision && exactKeys(result, resultKeys) &&
    validPublicPoint(result.currentPosition) && validPublicPoint(result.destinationPosition) &&
    validPublicPoint(result.velocity) && typeof result.departedAt === 'string' && typeof result.arrivesAt === 'string' &&
    Number.isFinite(Date.parse(result.departedAt)) && Number.isFinite(Date.parse(result.arrivesAt)) &&
    Date.parse(result.arrivesAt) - Date.parse(result.departedAt) === 60_000 &&
    Date.parse(result.departedAt) >= Date.parse(prior.departedAt) &&
    Date.parse(result.departedAt) < Date.parse(prior.arrivesAt);
}

function validPressDocking(value, dockingCount, originShipId) {
  return exactKeys(value, PRESS_DOCKING_KEYS) && value.kind === 'press-shuttle-docking' &&
    value.shuttleId === PRESS_SHUTTLE_ID && value.dockingCount === dockingCount &&
    value.originShipId === originShipId;
}

function validPressArrivalCapture(input, expected) {
  const spec = CASE_BY_ID.get('core:completeShuttleArrival');
  const arrival = input.arrival;
  const before = arrival?.before;
  const beforeProjection = arrival?.beforeProjection;
  const afterProjection = arrival?.afterProjection;
  const origin = input.pressOriginAuthority;
  const witness = arrival?.priorWitness;
  const departureWitness = input.pressShuttleDepartureWitness;
  const transitWitness = input.pressShuttleTransitWitness;
  const result = input.response?.result;
  const transitRequestId = expected.transitRequestId;
  const destinationShipId = expected.destinationShipId;
  const sourceKeys = ['live', 'sessionId', 'cycle', 'phase', 'groupId'];
  const projectionBaseKeys = ['kind', 'live', 'sessionId', 'cycle', 'phase', 'turn', 'progression',
    'airspaceState', 'pressAccess', 'timerPaused', 'holderUidHash', 'controlRevision', 'groupId',
    'originShipId', 'destinationShipId', 'destinationActive', 'destinationInGroup'];
  const validInstant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const manualCoordination = projection => projection?.phase === 'active' &&
    projection.progression === 'manual' && projection.timerPaused === false &&
    projection.turn === projection.cycle &&
    (projection.airspaceState === 'lifted' || projection.pressAccess === true);
  const validGroup = validPressGroupAuthority(input.pressGroupAuthorityBefore, origin?.sourceAuthority,
    origin?.originShipId, destinationShipId) &&
    validPressGroupAuthority(input.pressGroupAuthorityAfter, origin?.sourceAuthority,
      origin?.originShipId, destinationShipId) &&
    JSON.stringify(input.pressGroupAuthorityBefore) === JSON.stringify(input.pressGroupAuthorityAfter);
  const validAuthority = validPressOriginAuthority(origin, { sessionId: expected.sessionId,
    uidHash: expected.uidHash, shuttleId: expected.shuttleId, groupId: expected.groupId,
    cycle: expected.cycle, controlRevision: expected.controlRevision, sourceAuthority: expected.sourceAuthority }) &&
    validPressOriginAuthority(expected.pressOriginAuthority, { sessionId: expected.sessionId,
      uidHash: expected.uidHash, shuttleId: expected.shuttleId, groupId: expected.groupId,
      cycle: expected.cycle, controlRevision: expected.controlRevision, sourceAuthority: expected.sourceAuthority }) &&
    samePressOriginAuthority(origin, expected.pressOriginAuthority) &&
    validPressDocumentAuthority(arrival?.authorityBefore, { sessionId: expected.sessionId,
      uidHash: expected.uidHash, groupId: expected.groupId }) &&
    validPressDocumentAuthority(arrival?.authorityAfter, { sessionId: expected.sessionId,
      uidHash: expected.uidHash, groupId: expected.groupId }) &&
    samePressDocumentAuthority(arrival.authorityBefore, origin.sourceAuthority) &&
    samePressDocumentAuthority(arrival.authorityAfter, origin.sourceAuthority) && validGroup;
  const manual = arrival?.captureMode !== 'automatic-source-effect';
  const requestKeys = ['sessionId', 'shuttleId', 'transitRequestId', 'expectedControlRevision'];
  const resultKeys = ['status', 'sessionId', 'requestId', 'transitRequestId', 'shuttleId',
    'hostShipId', 'arrivedAt', 'transitRevision'];
  const baseFields = validPressDepartureWitness(departureWitness, origin, transitWitness?.destinationShipId) &&
    validPressTransitWitness(transitWitness, origin, departureWitness, transitWitness?.destinationShipId) &&
    validPressArrivalWitness(witness, origin, expected) &&
    witness.departureRequestId === departureWitness.departureRequestId &&
    witness.transitRequestId === transitWitness.transitRequestId &&
    witness.transitRevision === transitWitness.transitRevision + 1 &&
    witness.destinationShipId !== transitWitness.destinationShipId &&
    witness.requestedAt === transitWitness.requestedAt &&
    Date.parse(witness.departedAt) >= Date.parse(transitWitness.departedAt) &&
    Date.parse(witness.departedAt) < Date.parse(transitWitness.arrivesAt) &&
    witness.departureRequestId === expected.departureRequestId &&
    witness.transitRequestId === transitRequestId && witness.destinationShipId === destinationShipId &&
    witness.transitRevision === expected.transitRevision &&
    witness.requestedAt === before?.requestedAt && witness.departedAt === before?.departedAt &&
    witness.arrivesAt === before?.arrivesAt && expected.sourceAuthority &&
    samePressDocumentAuthority(witness.sourceAuthority, expected.sourceAuthority) &&
    validPressDocking(input.pressDockingBefore, 0, null) &&
    validPressDocking(input.pressDockingAfter, 1, destinationShipId) && validAuthority &&
    Array.isArray(input.pressActiveVesselIdsBefore) && Array.isArray(input.pressActiveVesselIdsAfter) &&
    JSON.stringify(input.pressActiveVesselIdsBefore) === JSON.stringify(input.pressActiveVesselIdsAfter) &&
    input.pressActiveVesselIdsBefore.includes(origin?.originShipId) &&
    input.pressActiveVesselIdsBefore.includes(destinationShipId) &&
    exactKeys(input.sourceBefore, sourceKeys) && exactKeys(input.sourceAfter, sourceKeys) &&
    input.sourceBefore.live === true && input.sourceAfter.live === true &&
    input.sourceBefore.sessionId === expected.sessionId && input.sourceAfter.sessionId === expected.sessionId &&
    input.sourceBefore.cycle === expected.cycle && input.sourceAfter.cycle === expected.cycle &&
    input.sourceBefore.phase === 'active' && input.sourceAfter.phase === 'active' &&
    input.sourceBefore.groupId === expected.groupId && input.sourceAfter.groupId === expected.groupId &&
    input.mountedUi === true && matchesActor(input.actorBefore, expected, false) &&
    matchesActor(input.actorAfter, expected, false) && input.actorBefore.profileRoleId === 'press-officer' &&
    input.actorAfter.profileRoleId === 'press-officer' && input.actorBefore.activeConsoleRoleId === 'press-officer' &&
    input.actorAfter.activeConsoleRoleId === 'press-officer' && input.actorBefore.assignedRoleId === null &&
    input.actorAfter.assignedRoleId === null && exactKeys(input.response, ['httpStatus', 'result', 'exactReplay']) &&
    input.response.httpStatus === 200 && input.response.exactReplay === false && input.replay === null &&
    exactKeys(input.request, requestKeys) && input.request.sessionId === expected.sessionId &&
    input.request.shuttleId === PRESS_SHUTTLE_ID && input.request.transitRequestId === transitRequestId &&
    input.request.expectedControlRevision === expected.controlRevision &&
    exactKeys(result, resultKeys) && result.status === 'arrived' && result.sessionId === expected.sessionId &&
    result.requestId === `arrival-${transitRequestId}` && result.transitRequestId === transitRequestId &&
    result.shuttleId === PRESS_SHUTTLE_ID && result.hostShipId === destinationShipId &&
    result.transitRevision === expected.transitRevision && validInstant(result.arrivedAt) &&
    input.rendered?.visible === true && input.rendered.resultStatus === 'arrived';
  const validBefore = exactKeys(before, ['kind', 'status', 'sessionId', 'departureRequestId', 'transitRequestId',
    'shuttleId', 'holderUidHash', 'groupId', 'originShipId', 'destinationShipId', 'controlRevision', 'cycle',
    'transitRevision', 'requestedAt', 'departedAt', 'arrivesAt']) &&
    before.kind === 'press-shuttle-arrival-before' && before.status === 'in-transit' &&
    before.sessionId === expected.sessionId && before.departureRequestId === expected.departureRequestId &&
    before.transitRequestId === transitRequestId && before.shuttleId === PRESS_SHUTTLE_ID &&
    before.holderUidHash === expected.uidHash && before.groupId === expected.groupId &&
    before.originShipId === origin?.originShipId && before.destinationShipId === destinationShipId &&
    before.controlRevision === expected.controlRevision && before.cycle === expected.cycle &&
    before.transitRevision === expected.transitRevision && Number.isSafeInteger(before.transitRevision) &&
    [before.requestedAt, before.departedAt, before.arrivesAt].every(validInstant) &&
    Date.parse(before.requestedAt) <= Date.parse(before.departedAt) &&
    Date.parse(before.arrivesAt) - Date.parse(before.departedAt) === 60_000 &&
    Date.parse(result?.arrivedAt ?? '') >= Date.parse(before.arrivesAt);
  const validProjection = exactKeys(beforeProjection, [...projectionBaseKeys, 'dockingCount']) &&
    beforeProjection.kind === 'press-shuttle-arrival-projection' && beforeProjection.live === true &&
    beforeProjection.sessionId === expected.sessionId && beforeProjection.cycle === expected.cycle &&
    beforeProjection.holderUidHash === expected.uidHash && beforeProjection.controlRevision === expected.controlRevision &&
    beforeProjection.groupId === expected.groupId && beforeProjection.originShipId === origin?.originShipId &&
    beforeProjection.destinationShipId === destinationShipId && beforeProjection.destinationActive === true &&
    beforeProjection.destinationInGroup === true && beforeProjection.dockingCount === 0 &&
    manualCoordination(beforeProjection) &&
    exactKeys(afterProjection, [...projectionBaseKeys, 'movementAbsent', 'dockings', 'visits', 'observedAt']) &&
    afterProjection.kind === 'press-shuttle-arrival-projection' && afterProjection.live === true &&
    afterProjection.sessionId === expected.sessionId && afterProjection.cycle === expected.cycle &&
    afterProjection.holderUidHash === expected.uidHash && afterProjection.controlRevision === expected.controlRevision &&
    afterProjection.groupId === expected.groupId && afterProjection.originShipId === origin?.originShipId &&
    afterProjection.destinationShipId === destinationShipId && afterProjection.destinationActive === true &&
    afterProjection.destinationInGroup === true && afterProjection.movementAbsent === true &&
    manualCoordination(afterProjection) && afterProjection.phase === beforeProjection.phase &&
    afterProjection.turn === beforeProjection.turn && afterProjection.progression === beforeProjection.progression &&
    afterProjection.airspaceState === beforeProjection.airspaceState && afterProjection.pressAccess === beforeProjection.pressAccess &&
    validInstant(afterProjection.observedAt) && Date.parse(afterProjection.observedAt) >= Date.parse(before.arrivesAt) &&
    Array.isArray(afterProjection.dockings) && afterProjection.dockings.length === 1 &&
    exactKeys(afterProjection.dockings[0], ['shuttleId', 'shipId', 'dockedAt']) &&
    afterProjection.dockings[0].shuttleId === PRESS_SHUTTLE_ID &&
    afterProjection.dockings[0].shipId === destinationShipId && afterProjection.dockings[0].dockedAt === result?.arrivedAt &&
    Array.isArray(afterProjection.visits) && afterProjection.visits.length === 2 &&
    afterProjection.visits.every(visit => exactKeys(visit, ['id', 'shuttleId', 'shipId', 'action', 'occurredAt']) &&
      visit.shuttleId === PRESS_SHUTTLE_ID && validInstant(visit.occurredAt)) &&
    afterProjection.visits.filter(visit => visit.id === `shuttle-arrival-${transitRequestId}-departed` &&
      visit.shipId === origin.originShipId && visit.action === 'departed' &&
      Date.parse(visit.occurredAt) >= Date.parse(before.requestedAt) &&
      Date.parse(visit.occurredAt) <= Date.parse(before.departedAt)).length === 1 &&
    afterProjection.visits.filter(visit => visit.id === `shuttle-arrival-${transitRequestId}-docked` &&
      visit.shipId === destinationShipId && visit.action === 'docked' &&
      visit.occurredAt === result?.arrivedAt).length === 1;
  const readyKeys = ['panel', 'label', 'visible', 'enabled', 'sessionId', 'cycle', 'transitRequestId', 'observedAt'];
  const automaticKeys = ['kind', 'panel', 'armedAt', 'arrivesAt', 'remainingMs', 'responseObservedAt'];
  const ready = arrival?.readyControl;
  const automatic = arrival?.automaticObservation;
  const validMode = manual
    ? exactKeys(arrival, ['readyControl', 'priorWitness', 'authorityBefore', 'authorityAfter',
      'groupAuthorityBefore', 'groupAuthorityAfter', 'before', 'beforeProjection', 'afterProjection']) &&
      exactKeys(ready, readyKeys) && ready.panel === 'Shuttle departure' && ready.label === 'Complete arrival' &&
      ready.visible === true && ready.enabled === true && ready.sessionId === expected.sessionId &&
      ready.cycle === expected.cycle && ready.transitRequestId === transitRequestId &&
      validInstant(ready.observedAt) && Date.parse(ready.observedAt) >= Date.parse(before?.arrivesAt ?? '')
    : exactKeys(arrival, ['captureMode', 'priorWitness', 'authorityBefore', 'authorityAfter',
      'groupAuthorityBefore', 'groupAuthorityAfter', 'automaticObservation', 'before',
      'beforeProjection', 'afterProjection']) && arrival.captureMode === 'automatic-source-effect' &&
      exactKeys(automatic, automaticKeys) && automatic.kind === 'source-useEffect' &&
      automatic.panel === 'Shuttle departure' && validInstant(automatic.armedAt) &&
      automatic.arrivesAt === before?.arrivesAt && Number.isSafeInteger(automatic.remainingMs) &&
      automatic.remainingMs >= 1 && automatic.remainingMs <= 35_000 &&
      Date.parse(automatic.arrivesAt) > Date.parse(automatic.armedAt) &&
      Math.abs(Date.parse(automatic.arrivesAt) - Date.parse(automatic.armedAt) - automatic.remainingMs) <= 1_000 &&
      validInstant(automatic.responseObservedAt) &&
      Date.parse(automatic.responseObservedAt) >= Date.parse(before?.arrivesAt ?? '');
  if (!baseFields || !validBefore || !validProjection || !validMode || !validAuthority) {
    return pending(spec, 'press-single-shot-arrival-does-not-match-original-holder-source-transit-and-natural-arrival');
  }
  return { status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
    actorRoleId: 'press-officer', cycle: expected.cycle, revision: expected.transitRevision,
    actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(input.request),
    arrivalMode: arrival.captureMode ?? 'manual-control', exactSdkRetry: 'not-claimed',
    randomOutcomeRecorded: false, rendered: 'arrived' };
}

function exactReplayMatches(input, result) {
  return input.response?.exactReplay === true && input.replay?.status === 'committed' &&
    exactKeys(input.replay.result, Object.keys(result)) && sameActionReceipt(result, input.replay.result);
}

function sameReloadedActor(value, expected) {
  return value && matchesActor(value, expected, true);
}

function validGrantProjection(projection, expected, enabled, claimedAt) {
  return exactKeys(projection, ['kind', 'live', 'sessionId', 'cycle', 'uidHash', 'instanceId',
    'shipId', 'targetShipId', 'enabled', 'claimedAtHash']) && projection.kind === 'gm-ship-console-write-grant' &&
    projection.live === true && projection.sessionId === expected.sessionId && projection.cycle === expected.cycle &&
    projection.uidHash === expected.uidHash && projection.instanceId === expected.instanceId &&
    projection.shipId === (enabled ? 'aegis' : null) && projection.targetShipId === 'aegis' &&
    projection.enabled === enabled && projection.claimedAtHash === hash(claimedAt);
}

function validGrantRestore(restore, expected, claimedAt) {
  const request = restore?.request, result = restore?.response?.result;
  const projection = restore?.afterReload?.projection;
  return exactKeys(restore, ['request', 'response', 'rendered', 'afterReload']) &&
    exactKeys(request, ['sessionId', 'instanceId', 'shipId', 'enabled', 'claimedAt']) &&
    request.sessionId === expected.sessionId && request.instanceId === expected.instanceId &&
    request.shipId === 'aegis' && request.enabled === false && request.claimedAt === claimedAt &&
    Number.isFinite(Date.parse(request.claimedAt)) && restore.response?.httpStatus === 200 &&
    exactKeys(restore.response, ['httpStatus', 'result']) && exactKeys(result, ['enabled']) && result.enabled === false &&
    restore.rendered?.visible === true && restore.rendered.enabled === false &&
    (restore.rendered.controlPressed === undefined || restore.rendered.controlPressed === false) &&
    (restore.rendered.observerMode === undefined || restore.rendered.observerMode === 'read') &&
    sameReloadedActor(restore.afterReload?.actor, expected) &&
    validGrantProjection(projection, expected, false, claimedAt);
}

function validGrantEnable(enable, expected, claimedAt) {
  const request = enable?.request, result = enable?.response?.result;
  return exactKeys(enable, ['request', 'response', 'rendered', 'afterEnable']) &&
    exactKeys(request, ['sessionId', 'instanceId', 'shipId', 'enabled', 'claimedAt']) &&
    request.sessionId === expected.sessionId && request.instanceId === expected.instanceId &&
    request.shipId === 'aegis' && request.enabled === true && request.claimedAt === claimedAt &&
    Number.isFinite(Date.parse(claimedAt)) && exactKeys(enable.response, ['httpStatus', 'result']) &&
    enable.response.httpStatus === 200 && exactKeys(result, ['enabled', 'shipId']) &&
    result.enabled === true && result.shipId === 'aegis' && enable.rendered?.visible === true &&
    enable.rendered.controlPressed === true && enable.rendered.observerMode === 'write' &&
    sameReloadedActor(enable.afterEnable?.actor, expected) &&
    validGrantProjection(enable.afterEnable?.projection, expected, true, claimedAt);
}

function evaluateMountedGmCapture(spec, input, expected) {
  const endpoint = spec.endpoint;
  if (input.mountedUi !== true || expected.roleId !== 'gm' ||
      !matchesActor(input.actorBefore, expected, true) || !matchesActor(input.actorAfter, expected, true) ||
      input.sourceBefore?.live !== true || input.sourceAfter?.live !== true ||
      input.sourceBefore?.sessionId !== expected.sessionId || input.sourceAfter?.sessionId !== expected.sessionId ||
      input.sourceBefore?.cycle !== expected.cycle || input.sourceAfter?.cycle !== expected.cycle ||
      input.trainingChoice !== TRAINING_CHOICE_CODE) {
    return pending(spec, 'original-authenticated-GM-instance-or-live-source-is-not-current');
  }

  const request = input.request, response = input.response, result = response?.result;
  if (endpoint === 'setGmShipConsoleWriteGrant') {
    const restore = input.restore;
    const noReplayClaim = exactKeys(response, ['httpStatus', 'result']) ||
      exactKeys(response, ['httpStatus', 'result', 'exactReplay']) && response.exactReplay === false;
    if (expected.shipId !== 'aegis' || expected.sourceRevision !== undefined ||
        input.sourceBefore.revision !== undefined || input.sourceAfter.revision !== undefined ||
        !exactKeys(request, ['sessionId', 'instanceId', 'shipId', 'enabled', 'claimedAt']) ||
        request.sessionId !== expected.sessionId || request.instanceId !== expected.instanceId ||
        request.shipId !== 'aegis' || request.enabled !== true || !Number.isFinite(Date.parse(request.claimedAt)) ||
        response?.httpStatus !== 200 || !noReplayClaim ||
        !exactKeys(result, ['enabled', 'shipId']) || result.enabled !== true || result.shipId !== 'aegis' ||
        input.replay !== null || response.exactReplay === true ||
        input.rendered?.visible !== true || input.rendered.controlPressed !== true ||
        input.rendered.observerMode !== 'write' || !validGrantProjection(input.beforeProjection, expected, false, request.claimedAt) ||
        !sameReloadedActor(input.afterEnable?.actor, expected) ||
        !validGrantProjection(input.afterEnable?.projection, expected, true, request.claimedAt) ||
        !sameReloadedActor(input.afterReload?.actor, expected) ||
        !validGrantProjection(input.afterReload?.projection, expected, false, request.claimedAt) ||
        !validGrantRestore(restore, expected, request.claimedAt)) {
      return pending(spec, 'single-shot-write-grant-or-source-confirmed-UI-revoke-is-not-proved');
    }
    return {
      status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
      actorRoleId: expected.roleId, cycle: expected.cycle,
      actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(request),
      exactSdkRetry: 'not-claimed', trainingChoice: TRAINING_CHOICE_CODE,
      randomOutcomeRecorded: false, rendered: 'committed',
    };
  }

  if (endpoint === 'setShipConsoleLock') {
    const before = input.sourceSpecificBefore, reload = input.afterReload;
    const projection = reload?.projection;
    const requestKeys = ['sessionId', 'instanceId', 'shipId', 'locked', 'requestId', 'expectedRevision'];
    const resultKeys = ['shipId', 'locked', 'actorUid', 'actorRoleId', 'vesselId', 'turn', 'phase',
      'revision', 'idempotencyKey', 'auditId'];
    if (expected.shipId !== 'aegis' || !Number.isSafeInteger(expected.sourceRevision) ||
        !exactKeys(before, ['kind', 'live', 'sessionId', 'cycle', 'uidHash', 'instanceId', 'shipId',
          'locked', 'revision', 'grantEnabled']) || before.kind !== 'ship-console-lock' ||
        before.live !== true || before.sessionId !== expected.sessionId || before.cycle !== expected.cycle ||
        before.uidHash !== expected.uidHash || before.instanceId !== expected.instanceId || before.shipId !== 'aegis' ||
        before.locked !== true || before.revision !== expected.sourceRevision || before.grantEnabled !== true ||
        input.sourceBefore.revision !== expected.sourceRevision ||
        input.sourceAfter.revision !== expected.sourceRevision + 1 ||
        !exactKeys(request, requestKeys) || request.sessionId !== expected.sessionId ||
        request.instanceId !== expected.instanceId || request.shipId !== 'aegis' || request.locked !== false ||
        typeof request.requestId !== 'string' || !request.requestId ||
        request.expectedRevision !== expected.sourceRevision || response?.httpStatus !== 200 ||
        !exactKeys(response, ['httpStatus', 'result', 'exactReplay']) || !exactKeys(result, resultKeys) ||
        result.shipId !== 'aegis' || result.locked !== false || hashUid(result.actorUid) !== expected.uidHash ||
        result.actorRoleId !== null || result.vesselId !== 'aegis' || result.turn !== expected.cycle ||
        result.phase !== 'active' || result.revision !== expected.sourceRevision + 1 ||
        result.idempotencyKey !== request.requestId || result.auditId !== `console-lock-${request.requestId}` ||
        !exactReplayMatches(input, result) || !input.replay?.result ||
        !sameReloadedActor(reload?.actor, expected) ||
        !exactKeys(projection, ['kind', 'live', 'sessionId', 'cycle', 'uidHash', 'instanceId', 'shipId',
          'locked', 'revision']) || projection.kind !== 'ship-console-lock' || projection.live !== true ||
        projection.sessionId !== expected.sessionId || projection.cycle !== expected.cycle ||
        projection.uidHash !== expected.uidHash || projection.instanceId !== expected.instanceId ||
        projection.shipId !== 'aegis' || projection.locked !== false || projection.revision !== result.revision ||
        input.rendered?.visible !== true || input.rendered.locked !== false ||
        input.rendered.lockLabel !== 'ICN console lock // clear' ||
        !validGrantEnable(input.enableGrant, expected, input.restore?.request?.claimedAt) ||
        !validGrantRestore(input.restore, expected, input.restore?.request?.claimedAt)) {
      return pending(spec, 'AEGIS-console-lock-request-receipt-replay-reload-or-grant-revoke-is-not-proved');
    }
    if (!sameActionReceipt(result, input.replay.result)) return pending(spec, 'exact-console-lock-replay-receipt-differs');
    return {
      status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
      actorRoleId: expected.roleId, cycle: expected.cycle, revision: result.revision,
      actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(request),
      exactSdkRetry: 'same-original-request-receipt-confirmed', trainingChoice: TRAINING_CHOICE_CODE,
      randomOutcomeRecorded: false, rendered: 'committed',
    };
  }

  if (endpoint === 'setFacilitatorCensusNote') {
    const before = input.sourceSpecificBefore, reload = input.afterReload, projection = reload?.projection;
    const requestKeys = ['sessionId', 'instanceId', 'requestId', 'expectedRevision', 'targetUid', 'note'];
    const resultKeys = ['sessionId', 'targetUid', 'revision', 'note'];
    const targetUidHash = hashUid(request?.targetUid), noteHash = hash(request?.note);
    if (!Number.isSafeInteger(expected.sourceRevision) ||
        !exactKeys(before, ['kind', 'live', 'sessionId', 'cycle', 'uidHash', 'instanceId', 'revision',
          'targetUidHash', 'entryPresent']) || before.kind !== 'facilitator-census' || before.live !== true ||
        before.sessionId !== expected.sessionId || before.cycle !== expected.cycle || before.uidHash !== expected.uidHash ||
        before.instanceId !== expected.instanceId || before.revision !== expected.sourceRevision ||
        !targetUidHash || before.targetUidHash !== targetUidHash || before.entryPresent !== true ||
        input.sourceBefore.revision !== expected.sourceRevision || input.sourceAfter.revision !== expected.sourceRevision + 1 ||
        !exactKeys(request, requestKeys) || request.sessionId !== expected.sessionId ||
        request.instanceId !== expected.instanceId || typeof request.requestId !== 'string' || !request.requestId ||
        request.expectedRevision !== expected.sourceRevision || typeof request.targetUid !== 'string' || !request.targetUid ||
        typeof request.note !== 'string' || !request.note || request.note.length > 240 ||
        response?.httpStatus !== 200 || !exactKeys(response, ['httpStatus', 'result', 'exactReplay']) ||
        !exactKeys(result, resultKeys) || result.sessionId !== expected.sessionId || result.targetUid !== request.targetUid ||
        result.note !== request.note || result.revision !== expected.sourceRevision + 1 ||
        !exactReplayMatches(input, result) || !sameReloadedActor(reload?.actor, expected) ||
        !exactKeys(projection, ['kind', 'live', 'sessionId', 'cycle', 'uidHash', 'instanceId', 'revision',
          'targetUidHash', 'noteHash']) || projection.kind !== 'facilitator-census' || projection.live !== true ||
        projection.sessionId !== expected.sessionId || projection.cycle !== expected.cycle ||
        projection.uidHash !== expected.uidHash || projection.instanceId !== expected.instanceId ||
        projection.revision !== result.revision || projection.targetUidHash !== targetUidHash ||
        projection.noteHash !== noteHash || input.rendered?.visible !== true ||
        input.rendered.targetUidHash !== targetUidHash || input.rendered.noteFieldValueHash !== noteHash) {
      return pending(spec, 'census-note-request-receipt-replay-or-reloaded-entry-is-not-proved');
    }
    return {
      status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
      actorRoleId: expected.roleId, cycle: expected.cycle, revision: result.revision,
      actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(request),
      exactSdkRetry: 'same-original-request-receipt-confirmed', trainingChoice: TRAINING_CHOICE_CODE,
      randomOutcomeRecorded: false, rendered: 'committed',
    };
  }

  if (endpoint === 'authorFacilitatorRuleCall') {
    const reload = input.afterReload, projection = reload?.projection;
    const requestKeys = ['sessionId', 'instanceId', 'requestId', 'expectedRevision', 'ambiguity', 'source', 'decision', 'audience'];
    const resultKeys = ['status', 'sessionId', 'callId', 'revision', 'ambiguity', 'source', 'decision', 'audience',
      'actorUid', 'createdAt', 'label'];
    const fields = ['ambiguity', 'source', 'decision', 'audience'];
    if (!Number.isSafeInteger(expected.sourceRevision) ||
        input.sourceBefore.revision !== expected.sourceRevision || input.sourceAfter.revision !== expected.sourceRevision + 1 ||
        !exactKeys(request, requestKeys) || request.sessionId !== expected.sessionId ||
        request.instanceId !== expected.instanceId || typeof request.requestId !== 'string' || !request.requestId ||
        request.expectedRevision !== expected.sourceRevision || request.audience !== 'gm-only' ||
        fields.some(field => typeof request[field] !== 'string' || !request[field].trim()) ||
        response?.httpStatus !== 200 || !exactKeys(response, ['httpStatus', 'result', 'exactReplay']) ||
        !exactKeys(result, resultKeys) || result.status !== 'committed' || result.sessionId !== expected.sessionId ||
        result.callId !== request.requestId || result.revision !== expected.sourceRevision + 1 ||
        result.ambiguity !== request.ambiguity || result.source !== request.source || result.decision !== request.decision ||
        result.audience !== 'gm-only' || hashUid(result.actorUid) !== expected.uidHash ||
        result.label !== 'FACILITATOR RULE CALL' || typeof result.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(result.createdAt)) || !exactReplayMatches(input, result) ||
        !sameReloadedActor(reload?.actor, expected) ||
        !exactKeys(projection, ['kind', 'live', 'sessionId', 'cycle', 'uidHash', 'instanceId', 'revision',
          'callId', 'actorUidHash', 'label', 'audience', 'ambiguityHash', 'sourceHash', 'decisionHash']) ||
        projection.kind !== 'facilitator-rule-call' || projection.live !== true ||
        projection.sessionId !== expected.sessionId || projection.cycle !== expected.cycle ||
        projection.uidHash !== expected.uidHash || projection.instanceId !== expected.instanceId ||
        projection.revision !== result.revision || projection.callId !== result.callId ||
        projection.actorUidHash !== expected.uidHash || projection.label !== 'FACILITATOR RULE CALL' ||
        projection.audience !== 'gm-only' || projection.ambiguityHash !== hash(request.ambiguity) ||
        projection.sourceHash !== hash(request.source) || projection.decisionHash !== hash(request.decision) ||
        input.rendered?.visible !== true || input.rendered.resultStatus !== 'committed') {
      return pending(spec, 'facilitator-rule-call-request-receipt-replay-or-reloaded-decision-is-not-proved');
    }
    return {
      status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
      actorRoleId: expected.roleId, cycle: expected.cycle, revision: result.revision,
      actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(request),
      exactSdkRetry: 'same-original-request-receipt-confirmed', trainingChoice: TRAINING_CHOICE_CODE,
      randomOutcomeRecorded: false, rendered: 'committed',
    };
  }
  return pending(spec, 'no-strict-mounted-GM-validator-is-registered');
}

function sourceAlertReceiptFor(spec, input, expected) {
  const type = SOURCE_ALERT_TYPE_BY_ENDPOINT[spec.endpoint];
  if (!type) return null;
  const witness = input.sourceAlertWitness;
  const transition = input.sourceAlertTransition;
  const request = input.request;
  const result = input.response?.result;
  const replay = input.replay;
  const sourceBefore = input.sourceAlertSourceBefore;
  if (!exactKeys(witness, SOURCE_ALERT_WITNESS_KEYS) || witness.kind !== 'gm-source-alert-witness-v1' ||
      witness.type !== type || witness.sessionId !== expected.sessionId || witness.shipId !== expected.shipId ||
      witness.sourceRevision !== expected.sourceRevision || witness.gmUidHash !== expected.uidHash ||
      witness.gmInstanceHash !== hashUid(expected.instanceId ?? '') ||
      !exactKeys(sourceBefore, SOURCE_ALERT_SOURCE_KEYS) || sourceBefore.kind !== 'gm-source-alert-source-v1' ||
      sourceBefore.sessionId !== expected.sessionId || sourceBefore.cycle !== expected.cycle ||
      sourceBefore.shipId !== witness.shipId || sourceBefore.sourceRevision !== witness.sourceRevision ||
      sourceBefore.alertIdentityHash !== witness.alertIdentityHash ||
      sourceBefore.alertIdentityMatched !== true || sourceBefore.originalGmUidHash !== expected.uidHash ||
      sourceBefore.originalGmInstanceHash !== witness.gmInstanceHash ||
      input.sourceBefore?.revision !== witness.sourceRevision ||
      !exactKeys(transition, SOURCE_ALERT_RECEIPT_KEYS) || transition.kind !== 'gm-source-alert-receipt-v1' ||
      transition.type !== type || transition.shipId !== witness.shipId ||
      transition.sourceRevisionBefore !== witness.sourceRevision ||
      transition.sourceRevisionAfter !== witness.sourceRevision + 1 ||
      transition.alertIdentityHash !== witness.alertIdentityHash || transition.alertIdentityMatched !== true ||
      transition.alertRemoved !== true || transition.originalGmUidHash !== expected.uidHash ||
      transition.originalGmInstanceHash !== witness.gmInstanceHash || transition.exactReplay !== true ||
      !exactKeys(request, ['sessionId', 'shipId', 'instanceId', 'requestId', 'expectedRevision']) ||
      request.sessionId !== expected.sessionId || request.shipId !== witness.shipId ||
      request.instanceId !== expected.instanceId || typeof request.requestId !== 'string' || !request.requestId ||
      request.expectedRevision !== witness.sourceRevision || result?.dismissed !== true ||
      result.shipId !== witness.shipId || hashUid(result.actorUid ?? '') !== expected.uidHash ||
      result.vesselId !== witness.shipId || result.turn !== expected.cycle || result.phase !== 'active' ||
      result.revision !== witness.sourceRevision + 1 || result.idempotencyKey !== request.requestId ||
      result.auditId !== `${type === 'population' ? 'dismiss-population' : 'dismiss-unrest'}-${request.requestId}` ||
      input.sourceAfter?.revision !== witness.sourceRevision + 1 || input.response?.httpStatus !== 200 ||
      input.response?.exactReplay !== true || replay?.status !== 'committed' ||
      !sameActionReceipt(result, replay.result)) return null;
  return {
    kind: 'gm-source-alert-receipt-v1',
    type,
    shipId: witness.shipId,
    sourceRevisionBefore: witness.sourceRevision,
    sourceRevisionAfter: witness.sourceRevision + 1,
    alertIdentityHash: witness.alertIdentityHash,
    alertIdentityMatched: true,
    alertRemoved: true,
    originalGmUidHash: expected.uidHash,
    originalGmInstanceHash: witness.gmInstanceHash,
    exactReplay: true,
  };
}

/** Validate an actual mounted action using source state, the unmodified POST and its receipt-safe retry. */
export function evaluateProcedureCapture(input) {
  const spec = CASE_BY_ID.get(input?.caseId);
  if (!spec) throw new Error(`Unknown pending procedure case: ${String(input?.caseId)}`);
  if (!input.offered) return pending(spec, input.reason ?? spec.unavailableReason);
  const expected = input.expected ?? {};
  const gm = spec.actorRoleId === 'gm';
  if (gm && ['setGmShipConsoleWriteGrant', 'setShipConsoleLock', 'setFacilitatorCensusNote',
    'authorFacilitatorRuleCall'].includes(spec.endpoint)) {
    return evaluateMountedGmCapture(spec, input, expected);
  }
  if (['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit'].includes(spec.endpoint) &&
      input.pressOriginAuthority !== undefined) {
    if (!validPressMovementCapture(input, spec.endpoint)) {
      return pending(spec, 'press-movement-receipt-does-not-match-original-holder-document-group-and-source-chain');
    }
    const result = input.response.result;
    const common = { status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
      actorRoleId: 'press-officer', cycle: expected.cycle, revision: input.sourceAfter.revision,
      actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(input.request),
      exactSdkRetry: 'same-original-request-receipt-confirmed', randomOutcomeRecorded: false,
      rendered: result.status };
    if (spec.endpoint === 'requestShuttleDeparture') return { ...common, pressShuttleDepartureWitness: {
      kind: 'press-shuttle-departure-witness', status: 'completed', endpoint: spec.endpoint,
      sessionId: expected.sessionId, roleId: 'press-officer', uidHash: expected.uidHash,
      shuttleId: PRESS_SHUTTLE_ID, groupId: expected.groupId, cycle: expected.cycle,
      controlRevision: expected.controlRevision, originShipId: expected.originShipId,
      destinationShipId: expected.destinationShipId, departureRequestId: input.request.requestId,
      requestedAt: result.requestedAt, sourceAuthority: expected.sourceAuthority,
    } };
    if (spec.endpoint === 'beginShuttleTransit') return { ...common, pressShuttleTransitWitness: {
      kind: 'press-shuttle-transit-witness', status: 'completed', endpoint: spec.endpoint,
      sessionId: expected.sessionId, roleId: 'press-officer', uidHash: expected.uidHash,
      shuttleId: PRESS_SHUTTLE_ID, groupId: expected.groupId, cycle: expected.cycle,
      controlRevision: expected.controlRevision, originShipId: expected.originShipId,
      destinationShipId: expected.destinationShipId,
      departureRequestId: input.pressShuttleDepartureWitness.departureRequestId,
      transitRequestId: input.request.requestId, transitRevision: result.revision,
      requestedAt: result.requestedAt, departedAt: result.departedAt, arrivesAt: result.arrivesAt,
      sourceAuthority: expected.sourceAuthority,
    } };
    return { ...common, pressShuttleArrivalWitness: {
      kind: 'press-shuttle-arrival-witness', status: 'completed', endpoint: spec.endpoint,
      sessionId: expected.sessionId, roleId: 'press-officer', uidHash: expected.uidHash,
      shuttleId: PRESS_SHUTTLE_ID, groupId: expected.groupId, cycle: expected.cycle,
      controlRevision: expected.controlRevision, originShipId: expected.originShipId,
      departureRequestId: input.pressShuttleTransitWitness.departureRequestId,
      transitRequestId: input.pressShuttleTransitWitness.transitRequestId,
      destinationShipId: expected.destinationShipId, transitRevision: result.revision,
      requestedAt: result.requestedAt, departedAt: result.departedAt, arrivesAt: result.arrivesAt,
      sourceAuthority: expected.sourceAuthority,
    } };
  }
  if (spec.endpoint === 'completeShuttleArrival' && input.pressOriginAuthority !== undefined) {
    return validPressArrivalCapture(input, expected);
  }
  if (spec.endpoint === 'completeShuttleArrival') return validShuttleArrivalCapture(input, expected);
  const revisionlessSourceReceipt = ['requestShuttleDeparture', 'transferShuttleCargoCommand', 'beginShuttleTransit']
    .includes(spec.endpoint) && validShuttleTransition(input, spec.endpoint);
  if (spec.endpoint === 'evacuateShuttleSurvivorsCommand' && !validShuttleTransition(input, spec.endpoint)) {
    return pending(spec, 'evacuation-request-and-receipt-do-not-match-current-holder-custody-cycle-and-population-ledger');
  }
  if (spec.endpoint === 'retargetShuttleTransit' && !validShuttleTransition(input, spec.endpoint)) {
    return pending(spec, 'retarget-request-does-not-match-the-current-authorized-transit-and-next-source-revision');
  }
  if (input.mountedUi !== true || !matchesActor(input.actorBefore, expected, gm) ||
      !matchesActor(input.actorAfter, expected, gm)) return pending(spec, 'original-authenticated-role-or-mounted-control-not-current');
  if (input.sourceBefore?.live !== true || input.sourceAfter?.live !== true ||
      input.sourceBefore?.sessionId !== expected.sessionId || input.sourceAfter?.sessionId !== expected.sessionId ||
      input.sourceBefore?.cycle !== expected.cycle || input.sourceAfter?.cycle !== expected.cycle ||
      input.sourceBefore?.revision !== expected.sourceRevision ||
      input.sourceAfter?.revision === undefined ||
      (!revisionlessSourceReceipt && input.sourceAfter.revision <= input.sourceBefore.revision) ||
      expected.groupId !== undefined && (input.sourceBefore?.groupId !== expected.groupId ||
        input.sourceAfter?.groupId !== expected.groupId)) return pending(spec, 'live-source-cycle-revision-or-group-changed');
  const request = input.request;
  const acceptedStatus = acceptedResultStatus(spec, input.response?.result, request, expected, input);
  if (request?.sessionId !== expected.sessionId ||
      expected.cycle !== undefined && request.expectedCycle !== undefined && request.expectedCycle !== expected.cycle ||
      expected.sourceRevision !== undefined && request.expectedRevision !== undefined && request.expectedRevision !== expected.sourceRevision ||
      spec.replayPolicy === 'exact-request-id' && typeof (request?.requestId ?? request?.idempotencyKey) !== 'string' ||
      input.response?.httpStatus !== 200 || !acceptedStatus) {
    return pending(spec, 'captured-request-or-server-result-does-not-match-the-source-case');
  }
  if (spec.endpoint === 'chooseBoaMissionReclamationOpportunity' &&
      request.expectedChoiceRevision !== input.sourceBefore.revision) {
    return pending(spec, 'Boa-choice-request-did-not-use-the-current-source-choice-revision');
  }
  if (spec.endpoint === 'recycleWithBoa' &&
      request.expectedRecyclingRevision !== input.sourceBefore.revision) {
    return pending(spec, 'Boa-recycling-request-did-not-use-the-current-ledger-revision');
  }
  if (spec.endpoint === 'evacuateShuttleSurvivorsCommand' &&
      (request.expectedEvacuationRevision !== input.sourceBefore.revision ||
       request.expectedControlRevision !== expected.controlRevision)) {
    return pending(spec, 'shuttle-evacuation-request-did-not-use-current-ledger-and-custody-revisions');
  }
  if (spec.endpoint === 'rechargeHostConsoleFromShuttle' &&
      (request.expectedControlRevision !== expected.controlRevision ||
       request.expectedMaintenanceRevision !== expected.maintenanceRevision ||
       request.expectedHostShipId !== expected.expectedHostShipId || request.expectedCycle !== expected.cycle)) {
    return pending(spec, 'service-recharge-request-did-not-use-current-custody-maintenance-host-and-cycle');
  }
  if (input.response?.exactReplay !== true && spec.replayPolicy === 'exact-request-id') {
    return pending(spec, 'exact-original-sdk-retry-not-confirmed');
  }
  if (spec.replayPolicy === 'exact-request-id' && input.replay?.result &&
      !sameActionReceipt(input.response.result, input.replay.result)) return pending(spec, 'exact-retry-receipt-differs');
  if (!revisionlessSourceReceipt && revisionOf(input.response.result) !== input.sourceAfter.revision) {
    return pending(spec, 'server-result-and-live-projection-revisions-differ');
  }
  const renderedCounterResult = spec.endpoint === 'applyShipCounterSteps'
    ? acceptedCounterRenderedResult(input.rendered, input.counterSourceWitness, acceptedStatus)
    : input.rendered?.visible === true && input.rendered.resultStatus === acceptedStatus;
  if (!renderedCounterResult) {
    return pending(spec, 'current-result-not-visible-in-the-mounted-control');
  }
  if (!validCost(expected.cost, input.cost)) return pending(spec, 'printed-cost-or-authoritative-ledger-delta-mismatch');
  if (expected.groupId !== undefined && (input.request.groupId !== undefined && input.request.groupId !== expected.groupId)) {
    return pending(spec, 'request-group-does-not-match-current-source-group');
  }
  if (expected.distinctConsent === true) {
    const consent = input.consent;
    if (!consent || consent.required !== true || consent.status !== 'committed' || consent.sameSession !== true ||
        consent.sessionId !== expected.sessionId || consent.actorUidHash !== expected.uidHash ||
        !consent.counterpartyUidHash || consent.counterpartyUidHash === consent.actorUidHash ||
        consent.groupId !== expected.groupId || !consent.proposalId) return pending(spec, 'distinct-current-group-consent-not-confirmed');
  }
  if (spec.randomOutcome && (input.randomOutcomeForced === true || input.randomOutcomeRecorded === true)) {
    return pending(spec, 'server-random-result-was-forced-or-private-output-was-recorded');
  }
  const trainingChoice = spec.trainingChoice ? input.trainingChoice : null;
  if (spec.trainingChoice && trainingChoice !== TRAINING_CHOICE_CODE) {
    return pending(spec, 'deliberate-facilitator-choice-safe-code-was-not-disclosed');
  }
  const sourceAlertReceipt = sourceAlertReceiptFor(spec, input, expected);
  if (SOURCE_ALERT_TYPE_BY_ENDPOINT[spec.endpoint] && !sourceAlertReceipt) {
    return pending(spec, 'source-alert-identity-original-GM-request-receipt-and-removal-are-not-bound');
  }
  return {
    status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
    actorRoleId: expected.roleId, cycle: expected.cycle, revision: input.sourceAfter.revision,
    actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(input.request),
    ...(spec.endpoint === 'retargetShuttleTransit' ? { shuttleArrivalWitness: {
      status: 'completed', endpoint: 'retargetShuttleTransit', sessionId: expected.sessionId,
      roleId: expected.roleId, uidHash: expected.uidHash, shuttleId: expected.shuttleId,
      groupId: expected.groupId, cycle: expected.cycle, controlRevision: expected.controlRevision,
      departureRequestId: input.transitionBefore.requestId, transitRequestId: expected.transitRequestId,
      destinationShipId: expected.destinationShipId, transitRevision: input.transitionAfter.revision,
      sourceAuthority: input.sourceAuthorityAfter,
    } } : {}),
    exactSdkRetry: spec.replayPolicy === 'exact-request-id' ? 'same-original-request-receipt-confirmed' : 'not-claimed',
    ...(input.cost ? { cost: { resource: input.cost.resource, amount: input.cost.amount, direction: input.cost.direction } } : {}),
    ...(trainingChoice ? { trainingChoice } : {}),
    ...(sourceAlertReceipt ? { sourceAlertReceipt } : {}),
    randomOutcomeRecorded: false,
    rendered: acceptedStatus,
  };
}

function acceptedResultStatus(spec, result, request, expected, input) {
  if (spec.endpoint === 'applyShipCounterSteps') {
    return acceptedCounterBatchStatus(result, request, expected, input.counterSourceWitness,
      input.actorBefore, input.actorAfter);
  }
  if (RESULT_STATUSES.has(result?.status)) return result.status;
  const vesselResult = STATUSLESS_VESSEL_RESULTS[spec.endpoint];
  if (!vesselResult || !vesselResult.valid(result) || typeof result?.actorUid !== 'string' ||
      hashUid(result.actorUid) !== expected.uidHash ||
      result.vesselId !== request?.shipId || result.turn !== expected.cycle || result.phase !== 'active' ||
      typeof request?.requestId !== 'string' || result.idempotencyKey !== request.requestId ||
      result.auditId !== `${vesselResult.action}-${request.requestId}` || !Number.isSafeInteger(result.revision)) return null;
  return 'committed';
}

function acceptedCounterBatchStatus(result, request, expected, witness, actorBefore, actorAfter) {
  const selection = expected?.counterSelection;
  if (!exactKeys(request, COUNTER_BATCH_REQUEST_KEYS) || !exactKeys(result, COUNTER_BATCH_RESULT_KEYS) ||
      !exactKeys(selection, COUNTER_SELECTION_KEYS) || !exactKeys(witness, COUNTER_SOURCE_WITNESS_KEYS) ||
      selection.kind !== 'gm-counter-selection-v1' || witness.kind !== 'gm-counter-source-witness-v1') return null;
  const witnessMatchesSelection = COUNTER_SELECTION_FIELDS.every(field => witness[field] === selection[field]);
  const safeAmount = value => Number.isSafeInteger(value) && value >= 0;
  const safeRevision = value => Number.isSafeInteger(value) && value >= 0;
  if (!witnessMatchesSelection || selection.sessionId !== expected.sessionId ||
      selection.instanceId !== expected.instanceId || selection.uidHash !== expected.uidHash ||
      typeof selection.claimedAt !== 'string' || !Number.isFinite(Date.parse(selection.claimedAt)) ||
      !Number.isSafeInteger(selection.connectionGeneration) || selection.connectionGeneration < 1 ||
      !Number.isSafeInteger(selection.hydrationRevision) || selection.hydrationRevision < 1 ||
      !(selection.actorRoleId === null || typeof selection.actorRoleId === 'string') ||
      selection.phase !== 'active' || selection.phase !== expected.phase && expected.phase !== undefined ||
      selection.cycle !== expected.cycle || selection.shipId !== expected.shipId ||
      selection.groupId !== expected.groupId || selection.groupLabel !== expected.targetShipName ||
      typeof selection.groupLabel !== 'string' || !selection.groupLabel ||
      typeof selection.resourceId !== 'string' || !selection.resourceId ||
      typeof selection.resourceLabel !== 'string' || !selection.resourceLabel ||
      ![-1, 1].includes(selection.step) || !safeAmount(selection.beforeAmount) ||
      selection.beforeVisibleAmount !== selection.beforeAmount ||
      !safeRevision(selection.beforeRevision) || selection.beforeRevision !== expected.sourceRevision ||
      !safeAmount(witness.afterAmount) || witness.afterVisibleAmount !== witness.afterAmount ||
      !safeRevision(witness.afterRevision) || witness.afterRevision !== selection.beforeRevision + 1 ||
      witness.afterAmount !== selection.beforeAmount + selection.step || witness.afterAmount < 0) return null;
  if (actorBefore?.activeConsoleRoleId !== selection.actorRoleId ||
      actorAfter?.activeConsoleRoleId !== selection.actorRoleId ||
      request.sessionId !== expected.sessionId || request.instanceId !== expected.instanceId ||
      request.shipId !== expected.shipId || request.counter !== 'resource' ||
      request.resourceId !== selection.resourceId || !Array.isArray(request.steps) ||
      request.steps.length !== 1 || request.steps[0] !== selection.step ||
      typeof request.requestId !== 'string' || request.requestId.length === 0 ||
      request.expectedRevision !== expected.sourceRevision ||
      result.amount !== witness.afterAmount || result.appliedSteps.length !== 1 ||
      result.appliedSteps[0] !== request.steps[0] || result.alertRaised !== false ||
      result.sessionId !== request.sessionId || result.instanceId !== request.instanceId ||
      result.shipId !== request.shipId || result.counter !== 'resource' ||
      result.resourceId !== request.resourceId || result.requestId !== request.requestId ||
      result.expectedRevision !== request.expectedRevision || typeof result.actorUid !== 'string' ||
      hashUid(result.actorUid) !== expected.uidHash || result.actorRoleId !== selection.actorRoleId ||
      result.vesselId !== request.shipId || result.turn !== expected.cycle || result.phase !== 'active' ||
      result.revision !== expected.sourceRevision + 1 || result.idempotencyKey !== request.requestId ||
      result.auditId !== `counter-batch-${request.requestId}`) return null;
  return 'committed';
}

function acceptedCounterRenderedResult(rendered, witness, acceptedStatus) {
  return exactKeys(rendered, COUNTER_RENDERED_KEYS) &&
    rendered.kind === 'gm-counter-rendered-source-v1' && rendered.visible === true &&
    rendered.resultStatus === acceptedStatus &&
    rendered.shipId === witness.shipId && rendered.groupId === witness.groupId &&
    rendered.resourceId === witness.resourceId && rendered.resourceLabel === witness.resourceLabel &&
    rendered.beforeAmount === witness.beforeAmount && rendered.amount === witness.afterAmount &&
    witness.beforeVisibleAmount === witness.beforeAmount && witness.afterVisibleAmount === witness.afterAmount;
}

/** Capture one ordinary visible control action; its unmodified SDK request is retried only with its own idempotency key. */
export async function captureMountedProcedureAction({ context, game, caseId, expected, prepare, inspect,
  trainingChoice = null, timeoutMs = 60_000, deferEvaluation = false, gmOperation = null }) {
  const spec = CASE_BY_ID.get(caseId);
  if (!spec) throw new Error(`Unknown pending procedure case: ${String(caseId)}`);
  if (spec.replayPolicy === 'not-mounted') return pending(spec, spec.unavailableReason);
  const sourceAlertType = SOURCE_ALERT_TYPE_BY_ENDPOINT[spec.endpoint];
  if (sourceAlertType && (typeof context?.started?.uidHash !== 'string' ||
      !/^[0-9a-f]{16}$/.test(context.started.uidHash) || typeof context.started.instanceId !== 'string' ||
      !context.started.instanceId || context.started.uidHash !== context.initial?.uidHash ||
      context.started.sessionId !== undefined && context.started.sessionId !== context.initial?.sessionId)) {
    return pending(spec, 'the original started-GM identity is unavailable for source-alert capture');
  }
  assert.ok(context?.initial?.sessionId && typeof game?.select === 'function', 'Use the fresh connected two-browser game.');
  assert.equal(typeof prepare, 'function');
  assert.equal(typeof inspect, 'function');
  const certifiedGm = ['setGmShipConsoleWriteGrant', 'setShipConsoleLock',
    'setFacilitatorCensusNote', 'authorFacilitatorRuleCall'].includes(spec.endpoint);
  if (certifiedGm && (!gmOperation?.original || !gmOperation.current || !Number.isFinite(gmOperation.deadlineAt))) {
    return pending(spec, 'original-GM-current-document-certificate-is-unavailable');
  }
  const remaining = () => {
    if (!certifiedGm) return timeoutMs;
    const value = Math.min(timeoutMs, gmOperation.deadlineAt - Date.now());
    assert.ok(Number.isFinite(value) && value > 0, 'The original GM capture operation deadline is exhausted.');
    return value;
  };
  const observeCaptureActor = async surface => {
    if (!certifiedGm) return surface.observe();
    remaining();
    const current = await observeLifecycleActor(surface, context.initial.sessionId);
    assertLateReplyAuthority(gmOperation.current, current);
    assert.equal(current.uidHash, context.initial.uidHash);
    assert.equal(current.uidHash, context.started?.uidHash);
    assert.equal(current.instanceId, context.started?.instanceId);
    assert.equal(current.claimedAt, gmOperation.original.claimedAt);
    assert.ok(Number.isSafeInteger(current.hydrationRevision) && current.hydrationRevision >= 1);
    assert.equal(current.phase, gmOperation.original.phase); assert.equal(current.cycle, gmOperation.original.cycle);
    remaining();
    return current;
  };
  let roleId = expected?.roleId ?? spec.actorRoleId;
  let resolvedHolder = null;
  let resolvedPrintedOwner = null;
  const pressMovementCapture = spec.actorRoleId === 'current-shuttle-holder' &&
    expected?.pressOriginAuthority?.shuttleId === PRESS_SHUTTLE_ID &&
    expected?.pressOriginAuthority?.uidHash === expected?.uidHash;
  if (pressMovementCapture) {
    const admittedPressHolder = context.roster?.filter(candidate => candidate.uidHash === expected.uidHash) ?? [];
    if (admittedPressHolder.length !== 1 || admittedPressHolder[0].roleId !== 'press-officer') {
      return pending(spec, 'original-Press-holder-is-not-uniquely-admitted-in-the-existing-roster');
    }
    roleId = 'press-officer';
  } else if (spec.endpoint === 'transferShuttleControlCommand' &&
      spec.actorRoleId === 'current-shuttle-holder' && expected?.shuttleId !== PRESS_SHUTTLE_ID) {
    const shuttleId = expected?.shuttleId;
    if (!shuttleId) return pending(spec, 'source shuttle identity was not supplied');
    const gmSurface = await game.select('gm');
    const gmActor = await gmSurface.observe();
    if (!gmActor.sameActor || gmActor.sessionId !== context.initial.sessionId ||
        gmActor.connection !== 'live' || gmActor.freshness !== 'server' || gmActor.gmInstanceOwned !== true) {
      return pending(spec, 'live-owned-GM-source-read-is-not-current');
    }
    const gmSource = await game.state(gmSurface);
    if (!gmSource?.live || gmSource.sessionId !== context.initial.sessionId || gmSource.phase !== 'active' ||
        expected?.cycle !== undefined && gmSource.cycle !== expected.cycle) {
      return pending(spec, 'current-server-shuttle-custody-is-not-ready');
    }
    resolvedPrintedOwner = resolveCurrentPrintedOwnerActor({ shuttleId,
      control: gmSource.shuttleControl?.[shuttleId], roster: context.roster });
    if (!resolvedPrintedOwner || resolvedPrintedOwner.roleId !== expected?.roleId ||
        resolvedPrintedOwner.uidHash !== expected?.uidHash ||
        resolvedPrintedOwner.ownerUidHash !== expected?.controlOwnerUidHash ||
        resolvedPrintedOwner.holderUidHash !== expected?.controlHolderUidHash ||
        resolvedPrintedOwner.controlRevision !== expected?.controlRevision ||
        expected?.sourceRevision !== resolvedPrintedOwner.controlRevision) {
      return pending(spec, 'current printed owner, holder, or shuttle-control revision is not the captured admitted tuple');
    }
    roleId = resolvedPrintedOwner.roleId;
  } else if (spec.actorRoleId === 'current-shuttle-holder' || spec.actorRoleId === 'current-ally-holder') {
    const shuttleId = spec.actorRoleId === 'current-ally-holder' ? 'ally' : expected?.shuttleId;
    if (!shuttleId) return pending(spec, 'source shuttle identity was not supplied');
    const gmSurface = await game.select('gm');
    const gmActor = await gmSurface.observe();
    if (!gmActor.sameActor || gmActor.sessionId !== context.initial.sessionId ||
        gmActor.connection !== 'live' || gmActor.freshness !== 'server' || gmActor.gmInstanceOwned !== true) {
      return pending(spec, 'live-owned-GM-source-read-is-not-current');
    }
    const gmSource = await game.state(gmSurface);
    if (!gmSource?.live || gmSource.sessionId !== context.initial.sessionId || gmSource.phase !== 'active' ||
        expected?.cycle !== undefined && gmSource.cycle !== expected.cycle) {
      return pending(spec, 'current-server-shuttle-custody-is-not-ready');
    }
    resolvedHolder = resolveCurrentHolderActor({ shuttleId,
      control: gmSource.shuttleControl?.[shuttleId], roster: context.roster, expectedRoleId: expected?.roleId });
    if (!resolvedHolder) return pending(spec, 'current-server-holder-is-not-one-unique-admitted-role');
    roleId = resolvedHolder.roleId;
  }
  const preserveMountedShuttleRoute = spec.actorRoleId === 'current-shuttle-holder' &&
    ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
      'completeShuttleArrival'].includes(spec.endpoint);
  const surface = certifiedGm ? await game.select(roleId, { deadlineAt: gmOperation.deadlineAt })
    : preserveMountedShuttleRoute ? await game.select(roleId, { enter: false }) : await game.select(roleId);
  const actorBefore = await observeCaptureActor(surface);
  const isGm = roleId === 'gm';
  const rosterActor = context.roster?.find(actor => actor.roleId === roleId);
  const normalizedExpected = { ...expected, sessionId: context.initial.sessionId, roleId,
    uidHash: sourceAlertType ? context.started.uidHash
      : expected?.uidHash ?? (isGm ? actorBefore.uidHash : rosterActor?.uidHash),
    ...(isGm ? { instanceId: sourceAlertType ? context.started.instanceId
      : expected?.instanceId ?? actorBefore.instanceId } : {}) };
  if (!normalizedExpected.uidHash || !matchesActor(actorBefore, normalizedExpected, isGm)) {
    return pending(spec, 'original-authenticated-actor-is-not-live-in-the-current-role');
  }
  if (typeof surface.page?.on !== 'function' || typeof surface.page?.off !== 'function') {
    return pending(spec, 'browser-request-observer-is-unavailable');
  }
  const sourceBefore = await game.state(isGm ? context.gm : surface);
  if (!sourceBefore?.live || sourceBefore.sessionId !== context.initial.sessionId ||
      sourceBefore.phase !== 'active' || expected?.cycle !== undefined && sourceBefore.cycle !== expected.cycle) {
    return pending(spec, 'current-session-or-source-phase-is-not-ready');
  }
  if (sourceAlertType && (!gmSourceAlertWitnessMatches(sourceBefore, expected.sourceAlertWitness, {
      sessionId: context.initial.sessionId, gmUidHash: context.started.uidHash,
      gmInstanceId: context.started.instanceId }) || expected.sourceAlertWitness?.type !== sourceAlertType ||
      expected.sourceAlertWitness?.shipId !== expected.shipId ||
      expected.sourceAlertWitness?.sourceRevision !== sourceBefore.vesselActionRevisions?.[expected.shipId])) {
    return pending(spec, 'the exact original-GM source alert or vessel revision changed before the mounted control');
  }
  if (resolvedHolder) {
    const currentHolder = resolveCurrentHolderActor({ shuttleId: resolvedHolder.shuttleId,
      control: sourceBefore.shuttleControl?.[resolvedHolder.shuttleId], roster: context.roster, expectedRoleId: roleId });
    if (!currentHolder || currentHolder.uidHash !== resolvedHolder.uidHash) {
      return pending(spec, 'source-shuttle-holder-changed-before-action');
    }
  }
  if (resolvedPrintedOwner) {
    const currentOwner = resolveCurrentPrintedOwnerActor({ shuttleId: resolvedPrintedOwner.shuttleId,
      control: sourceBefore.shuttleControl?.[resolvedPrintedOwner.shuttleId], roster: context.roster });
    if (!currentOwner || currentOwner.roleId !== resolvedPrintedOwner.roleId ||
        currentOwner.uidHash !== resolvedPrintedOwner.uidHash ||
        currentOwner.ownerUidHash !== resolvedPrintedOwner.ownerUidHash ||
        currentOwner.holderUidHash !== resolvedPrintedOwner.holderUidHash ||
        currentOwner.controlRevision !== resolvedPrintedOwner.controlRevision) {
      return pending(spec, 'source shuttle printed owner, holder, or control revision changed before the mounted action');
    }
  }
  const sourceRevision = spec.endpoint === 'setGmShipConsoleWriteGrant' ? undefined
    : expected?.sourceRevision ?? (expected?.shipId
      ? sourceBefore.vesselActionRevisions?.[expected.shipId] ?? 0 : undefined);
  const groupId = expected?.groupId ?? (expected?.shipId
    ? sourceBefore.shipFleetGroupIds?.[expected.shipId] : undefined);
  const sourceBeforeProof = spec.endpoint === 'completeShuttleArrival'
    ? { live: sourceBefore.live, sessionId: sourceBefore.sessionId,
      cycle: sourceBefore.cycle, phase: sourceBefore.phase, ...(groupId ? { groupId } : {}) }
    : pressMovementCapture ? { live: sourceBefore.live, sessionId: sourceBefore.sessionId,
      cycle: sourceBefore.cycle, phase: sourceBefore.phase, revision: sourceRevision, ...(groupId ? { groupId } : {}) }
    : { live: sourceBefore.live, sessionId: sourceBefore.sessionId,
      cycle: sourceBefore.cycle, revision: sourceRevision, ...(groupId ? { groupId } : {}) };
  let preClickActionRequest = false;
  const beforeMountedClick = request => {
    try {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/us-central1/${spec.endpoint}`)) {
        preClickActionRequest = true;
      }
    } catch { /* Unparseable unrelated requests do not count as this callable. */ }
  };
  surface.page.on('request', beforeMountedClick);
  let action;
  try {
    action = await prepare({ context, game, surface, actor: actorBefore, source: sourceBefore,
      expected: normalizedExpected, spec });
    await new Promise(resolveTick => setImmediate(resolveTick));
  } finally {
    surface.page.off('request', beforeMountedClick);
  }
  const keepSourceDiagnostic = (outcome, input) => appendShuttleSourceDiagnostic(outcome,
    action?.sourceDiagnosticOnly, input);
  if (preClickActionRequest) return keepSourceDiagnostic(pending(spec,
    'matching-action-callable-post-preceded-the-mounted-control-click'));
  if (action?.offered !== true || typeof action.click !== 'function' && typeof action.observe !== 'function') {
    const formDiagnostic = ['authorFacilitatorRuleCall', 'setFacilitatorCensusNote'].includes(spec.endpoint)
      ? safeGmFormFailureDiagnostic(action?.formDiagnostic) : null;
    return keepSourceDiagnostic(pending(spec, action?.reason ?? spec.unavailableReason,
      formDiagnostic ? { formDiagnostic } : {}));
  }
  if (spec.endpoint === 'applyShipCounterSteps' &&
      !sameCounterSelection(normalizedExpected.counterSelection, action.counterSelection)) {
    return keepSourceDiagnostic(pending(spec, 'the original selected GM resource counter changed before the mounted click'));
  }
  const displayedCost = action.cost ?? null;
  const result = await observeUiReceipt({ page: surface.page,
    waitForResponse: () => surface.page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith(`/us-central1/${spec.endpoint}`), { timeout: remaining() }),
    choose: action.observe ?? action.click,
  });
  if (action.arrival?.captureMode === 'automatic-source-effect') {
    action.arrival.automaticObservation.responseObservedAt = new Date().toISOString();
  }
  let body;
  try { body = await result.json(); } catch { body = null; }
  const request = result.request().postDataJSON()?.data;
  const actualResult = body?.result;
  if (!result.ok() || !actualResult || request?.sessionId !== context.initial.sessionId) {
    return keepSourceDiagnostic(pending(spec, 'mounted-ui-action-did-not-return-a-current-success-receipt'));
  }
  const actorAfter = await observeCaptureActor(surface);
  if (!matchesActor(actorAfter, normalizedExpected, isGm)) return keepSourceDiagnostic(pending(spec,
    'original-actor-or-GM-instance-changed-during-action'));
  let replay = null;
  let exactReplay = false;
  if (spec.replayPolicy === 'exact-request-id') {
    const key = request.requestId ?? request.idempotencyKey;
    if (typeof key !== 'string' || !key) return keepSourceDiagnostic(pending(spec, 'source-request-has-no-exact-retry-key'));
    replay = await surface.callable(spec.endpoint, request);
    if (certifiedGm) await observeCaptureActor(surface);
    exactReplay = replay?.status === 'committed' && sameActionReceipt(actualResult, replay.result);
  }
  const observed = await inspect({ context, game, surface, actor: actorBefore, actorAfter,
    sourceBefore, request, result: actualResult, replay: replay?.result ?? null });
  if (certifiedGm) await observeCaptureActor(surface);
  const sourceAfter = observed?.sourceAfter;
  const capturedExpected = { ...normalizedExpected, cycle: sourceBefore.cycle,
    ...(spec.endpoint !== 'completeShuttleArrival' ? { sourceRevision } : {}),
    groupId, cost: action.expectedCost ?? normalizedExpected.cost,
    distinctConsent: action.distinctConsent ?? normalizedExpected.distinctConsent };
  const proofInput = { caseId, expected: capturedExpected,
  ...(sourceAlertType ? { sourceAlertWitness: expected.sourceAlertWitness,
    sourceAlertSourceBefore: { kind: 'gm-source-alert-source-v1', sessionId: context.initial.sessionId,
      cycle: sourceBefore.cycle, shipId: expected.sourceAlertWitness.shipId,
      sourceRevision, alertIdentityHash: expected.sourceAlertWitness.alertIdentityHash,
      alertIdentityMatched: true, originalGmUidHash: context.started.uidHash,
      originalGmInstanceHash: expected.sourceAlertWitness.gmInstanceHash },
    sourceAlertTransition: observed?.sourceAlertTransition } : {}),
  offered: true, mountedUi: true, actorBefore, actorAfter,
  sourceBefore: sourceBeforeProof, sourceAfter,
  transitionBefore: action.transitionBefore, transitionAfter: observed?.transitionAfter,
  ...(['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit'].includes(spec.endpoint)
    ? { originAuthority: action.originAuthority,
    sourceAuthorityBefore: action.sourceAuthorityBefore, sourceAuthorityAfter: observed?.sourceAuthorityAfter } : {}),
  ...(pressMovementCapture && ['requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit'].includes(spec.endpoint)
    ? { pressOriginAuthority: action.pressOriginAuthority,
      pressShuttleDepartureWitness: action.pressShuttleDepartureWitness,
      pressShuttleTransitWitness: action.pressShuttleTransitWitness,
      pressSourceAuthorityBefore: action.pressSourceAuthorityBefore,
      pressSourceAuthorityAfter: observed?.pressSourceAuthorityAfter,
      pressGroupAuthorityBefore: action.pressGroupAuthorityBefore,
      pressGroupAuthorityAfter: observed?.pressGroupAuthorityAfter,
      pressActiveVesselIdsBefore: action.pressActiveVesselIdsBefore,
      pressActiveVesselIdsAfter: observed?.pressActiveVesselIdsAfter,
      pressDockingBefore: action.pressDockingBefore,
      pressDockingAfter: observed?.pressDockingAfter } : {}),
  ...(spec.endpoint === 'applyShipCounterSteps'
    ? { counterSourceWitness: observed?.counterSourceWitness } : {}),
  ...(observed?.corePostInspectPredicates ? { corePostInspectPredicates: observed.corePostInspectPredicates } : {}),
  request, response: { httpStatus: result.status(), result: actualResult, exactReplay }, replay,
  rendered: observed?.rendered, cost: observed?.cost ?? displayedCost, consent: observed?.consent,
  sourceSpecificBefore: observed?.sourceSpecificBefore, beforeProjection: observed?.beforeProjection,
  afterEnable: observed?.afterEnable, enableGrant: observed?.enableGrant,
  afterReload: observed?.afterReload, restore: observed?.restore,
  ...(spec.endpoint === 'completeShuttleArrival' ? { arrival: {
    ...action.arrival, authorityAfter: observed?.authorityAfter,
    ...(pressMovementCapture ? { groupAuthorityAfter: observed?.pressGroupAuthorityAfter } : {}),
    afterProjection: observed?.arrivalAfter,
  }, originAuthority: action.originAuthority,
    ...(pressMovementCapture ? { pressOriginAuthority: action.pressOriginAuthority,
      pressShuttleDepartureWitness: action.pressShuttleDepartureWitness,
      pressShuttleTransitWitness: action.pressShuttleTransitWitness,
      pressGroupAuthorityBefore: action.pressGroupAuthorityBefore,
      pressGroupAuthorityAfter: observed?.pressGroupAuthorityAfter,
      pressActiveVesselIdsBefore: action.pressActiveVesselIdsBefore,
      pressActiveVesselIdsAfter: observed?.pressActiveVesselIdsAfter,
      pressDockingBefore: action.pressDockingBefore,
      pressDockingAfter: observed?.pressDockingAfter } : {}),
  } : {}),
  cleanupGrant: observed?.cleanupGrant,
  trainingChoice, randomOutcomeForced: false, randomOutcomeRecorded: false };
  if (deferEvaluation) {
    const deferred = pending(spec, 'single-shot-write-grant-awaits-the-mounted-lock-and-ui-revoke');
    Object.defineProperty(deferred, PRIVATE_CAPTURE_INPUT, { value: proofInput });
    return keepSourceDiagnostic(deferred, proofInput);
  }
  const proof = evaluateProcedureCapture(proofInput);
  if (spec.endpoint === 'setShipConsoleLock') Object.defineProperty(proof, PRIVATE_CAPTURE_INPUT, { value: proofInput });
  return keepSourceDiagnostic(proof, proofInput);
}

async function runCasesAtCheckpoint({ family, cases, checkpoint, context, steps, gameFactory, directory,
  onlyCaseIds, excludeCaseIds, evidenceSuffix }) {
  const allowedCases = onlyCaseIds ? new Set(onlyCaseIds) : null;
  const excludedCases = excludeCaseIds ? new Set(excludeCaseIds) : null;
  const game = gameFactory(context), selected = cases.filter(spec => spec.checkpoint === checkpoint &&
    (!allowedCases || allowedCases.has(spec.id)) && (!excludedCases || !excludedCases.has(spec.id)));
  const evidence = { schemaVersion: 1, family, checkpoint, sourceCommit: context.sourceCommit ?? null,
    humanPhysicalProof: false, adminGameplayWrites: false, acceleratedClock: false,
    privateTextPersisted: false, sourceRandomnessForced: false,
    cases: selected.map(spec => ({ caseId: spec.id, endpoint: spec.endpoint, status: 'pending',
      reason: 'no-current-mounted-action-has-been-observed' })) };
  let deferredGrant = null;
  let deferredGrantIndex = -1;
  const finishDeferredGrant = async lockInput => {
    if (!deferredGrant) return;
    const restore = deferredGrant.restore ?? lockInput?.restore ?? await deferredGrant.cleanupGrant?.().catch(() => null);
    const grantClaim = deferredGrant.request?.claimedAt;
    const restoreClaim = restore?.request?.claimedAt;
    const sameCapturedLease = typeof grantClaim === 'string' && grantClaim === restoreClaim &&
      deferredGrant.expected?.sessionId === restore?.request?.sessionId &&
      deferredGrant.expected?.instanceId === restore?.request?.instanceId &&
      deferredGrant.afterEnable?.projection?.enabled === true &&
      deferredGrant.afterEnable?.projection?.claimedAtHash === hash(grantClaim) &&
      deferredGrant.afterReload?.projection?.enabled === false &&
      deferredGrant.afterReload?.projection?.claimedAtHash === hash(grantClaim);
    if (restore && sameCapturedLease) {
      deferredGrant.restore = restore;
      evidence.cases[deferredGrantIndex] = evaluateProcedureCapture(deferredGrant);
    } else {
      evidence.cases[deferredGrantIndex] = pending(CASE_BY_ID.get('gm:setGmShipConsoleWriteGrant'),
        'single-shot-enable-and-ui-revoke-do-not-share-the-same-live-GM-lease', {
          leaseDiagnostic: {
            restorePresent: Boolean(restore),
            enabledProjectionPresent: deferredGrant.afterEnable?.projection?.enabled === true,
            durableRevokedProjectionPresent: deferredGrant.afterReload?.projection?.enabled === false,
            projectionClaimMatches: typeof grantClaim === 'string' &&
              typeof deferredGrant.afterReload?.projection?.claimedAtHash === 'string'
              ? deferredGrant.afterReload.projection.claimedAtHash === hash(grantClaim) : null,
            restoreClaimMatches: typeof grantClaim === 'string' && typeof restoreClaim === 'string'
              ? grantClaim === restoreClaim : null,
            restoreSessionMatches: typeof restore?.request?.sessionId === 'string'
              ? deferredGrant.expected?.sessionId === restore.request.sessionId : null,
            restoreInstanceMatches: typeof restore?.request?.instanceId === 'string'
              ? deferredGrant.expected?.instanceId === restore.request.instanceId : null,
          },
        });
    }
    deferredGrant = null;
    deferredGrantIndex = -1;
  };
  for (const spec of selected) {
    const step = steps[spec.id] ?? steps[spec.endpoint];
    if (typeof step !== 'function') continue;
    let prepared;
    try { prepared = await step({ context, game, spec }); }
    catch {
      const failedIndex = evidence.cases.findIndex(row => row.caseId === spec.id);
      evidence.cases[failedIndex] = pending(spec, 'mounted-GM-source-preparation-did-not-complete');
      if (spec.endpoint === 'setShipConsoleLock') await finishDeferredGrant(null);
      continue;
    }
    if (!prepared || typeof prepared.prepare !== 'function' || typeof prepared.inspect !== 'function') {
      evidence.cases.find(row => row.caseId === spec.id).reason = 'step-did-not-return-mounted-control-and-projection-inspector';
      if (spec.endpoint === 'setShipConsoleLock') await finishDeferredGrant(null);
      continue;
    }
    let outcome;
    try {
      outcome = await captureMountedProcedureAction({ context, game, caseId: spec.id,
        ...prepared, trainingChoice: prepared.trainingChoice ?? null,
        deferEvaluation: spec.endpoint === 'setGmShipConsoleWriteGrant' });
    } catch {
      const failedIndex = evidence.cases.findIndex(row => row.caseId === spec.id);
      evidence.cases[failedIndex] = pending(spec, 'mounted-GM-control-action-did-not-return-a-verifiable-receipt');
      if (spec.endpoint === 'setGmShipConsoleWriteGrant') await prepared.cleanupMountedGmGrant?.().catch(() => null);
      if (spec.endpoint === 'setShipConsoleLock') await finishDeferredGrant(null);
      continue;
    }
    const index = evidence.cases.findIndex(row => row.caseId === spec.id);
    if (spec.endpoint === 'setGmShipConsoleWriteGrant') {
      deferredGrant = outcome[PRIVATE_CAPTURE_INPUT] ?? null;
      deferredGrantIndex = index;
      evidence.cases[index] = outcome;
      if (!deferredGrant) await prepared.cleanupMountedGmGrant?.().catch(() => null);
      continue;
    }
    evidence.cases[index] = outcome;
    if (spec.endpoint === 'setShipConsoleLock' && deferredGrant) {
      const lockInput = outcome[PRIVATE_CAPTURE_INPUT];
      await finishDeferredGrant(lockInput);
    }
  }
  await finishDeferredGrant(null);
  const summary = { status: 'pending', family, checkpoint,
    observedProcedureCount: evidence.cases.filter(row => row.status === 'completed').length,
    pendingProcedureCount: evidence.cases.filter(row => row.status !== 'completed').length,
    familyAcceptanceClaimed: false };
  evidence.summary = summary;
  if (directory) {
    await mkdir(directory, { recursive: true });
    const name = family === C ? 'pending-core-craft-actions' : 'pending-gm-rulings-counters';
    await writeFile(resolve(directory, `${name}-${evidenceSuffix ?? checkpoint}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  return { ...summary, evidence };
}

/** Additive hooks for a root-owned Base/Capy/extra-role runner. Uncomposed or unoffered rows stay pending. */
export function createPendingCoreCraftActionsCallback({ steps = {}, gameFactory = createTwoBrowserGameplay } = {}) {
  const run = checkpoint => context => runCasesAtCheckpoint({ family: C, cases: CORE_CRAFT_PROCEDURES,
    checkpoint, context, steps, gameFactory, directory: context.directory });
  const runCoordinationWithoutShuttleMovement = context => runCasesAtCheckpoint({ family: C,
    cases: CORE_CRAFT_PROCEDURES, checkpoint: 'coordination',
    excludeCaseIds: ['core:requestShuttleDeparture', 'core:beginShuttleTransit',
      'core:retargetShuttleTransit', 'core:completeShuttleArrival'],
    evidenceSuffix: 'coordination-without-shuttle-movement', context, steps, gameFactory,
    directory: context.directory });
  const runShuttleMovement = context => runCasesAtCheckpoint({ family: C,
    cases: CORE_CRAFT_PROCEDURES, checkpoint: 'coordination',
    onlyCaseIds: ['core:requestShuttleDeparture', 'core:beginShuttleTransit', 'core:retargetShuttleTransit'],
    evidenceSuffix: 'shuttle-movement', context, steps, gameFactory, directory: context.directory });
  const runSourceTimedArrival = context => runCasesAtCheckpoint({ family: C, cases: CORE_CRAFT_PROCEDURES,
    checkpoint: 'coordination', onlyCaseIds: ['core:completeShuttleArrival'], evidenceSuffix: 'shuttle-arrival-ready',
    context, steps, gameFactory, directory: context.directory });
  const runAutomaticSourceArrival = context => runCasesAtCheckpoint({ family: C, cases: CORE_CRAFT_PROCEDURES,
    checkpoint: 'coordination', onlyCaseIds: ['core:completeShuttleArrival'], evidenceSuffix: 'shuttle-arrival-automatic',
    context: { ...context, shuttleArrivalCaptureMode: 'automatic-source-effect' }, steps, gameFactory,
    directory: context.directory });
  return Object.freeze({ onStarted: run('team'), onCoordination: run('coordination'),
    onCoordinationWithoutShuttleMovement: runCoordinationWithoutShuttleMovement,
    onShuttleMovement: runShuttleMovement,
    beforeMissionDeal: run('before-mission-deal'), afterWolf: run('after-wolf'),
    onShuttleArrivalReady: runSourceTimedArrival, onShuttleAutoArrivalArmed: runAutomaticSourceArrival });
}

/** Prestart facilitator setup and source-offered live rulings/counters; this never owns the root runner's phases. */
export function createPendingGmRulingsCountersCallbacks({ steps = {}, gameFactory = createTwoBrowserGameplay } = {}) {
  const setupGameFactory = gameFactory === createTwoBrowserGameplay
    ? context => context.roster === undefined
      ? createTwoBrowserGameplay(context, { preAdmissionGmOnly: true }) : gameFactory(context)
    : gameFactory;
  const run = checkpoint => context => runCasesAtCheckpoint({ family: G, cases: GM_RULING_COUNTER_PROCEDURES,
    checkpoint, context, steps, gameFactory: checkpoint === 'on-setup' ? setupGameFactory : gameFactory,
    directory: context.directory });
  const runEligibleAlert = async context => {
    const alertCaseId = { unrest: 'gm:dismissUnrestAlert', population: 'gm:dismissPopulationAlert' };
    const makeEvidence = cases => ({ schemaVersion: 1, family: G, checkpoint: 'eligible-alert',
      sourceCommit: context.sourceCommit ?? null, humanPhysicalProof: false, adminGameplayWrites: false,
      acceleratedClock: false, privateTextPersisted: false, sourceRandomnessForced: false, cases });
    const finish = async (cases, sourceInterruptionsReady) => {
      const evidence = makeEvidence(cases);
      evidence.sourceInterruptionsReady = sourceInterruptionsReady;
      const summary = { status: 'pending', family: G, checkpoint: 'eligible-alert',
        observedProcedureCount: cases.filter(row => row.status === 'completed').length,
        pendingProcedureCount: cases.filter(row => row.status !== 'completed').length,
        familyAcceptanceClaimed: false };
      evidence.summary = summary;
      if (context.directory) {
        await mkdir(context.directory, { recursive: true });
        await writeFile(resolve(context.directory, 'pending-gm-rulings-counters-eligible-alert.json'),
          `${JSON.stringify(evidence, null, 2)}\n`);
      }
      return { ...summary, sourceInterruptionsReady, evidence };
    };
    const pendingSourceCases = reason => ['unrest', 'population'].map(type => pending(
      CASE_BY_ID.get(alertCaseId[type]), reason));
    const started = context?.started;
    if (typeof started?.uidHash !== 'string' || !/^[0-9a-f]{16}$/.test(started.uidHash) ||
        typeof started.instanceId !== 'string' || !started.instanceId ||
        started.uidHash !== context.initial?.uidHash ||
        started.sessionId !== undefined && started.sessionId !== context.initial?.sessionId) {
      return finish(pendingSourceCases('the original started-GM identity is unavailable'), false);
    }
    let game, surface, actor, source;
    try {
      game = gameFactory(context);
      surface = await game.select('gm');
      actor = await surface.observe();
      source = await game.state(surface);
    } catch {
      return finish(pendingSourceCases('the current source alert projection is unavailable under the original GM'), false);
    }
    const originalGmCurrent = actor?.sameActor === true && actor.sessionId === context.initial.sessionId &&
      actor.connection === 'live' && actor.freshness === 'server' && actor.playerRole === 'gm' &&
      actor.gmInstanceOwned === true && actor.uidHash === started.uidHash && actor.instanceId === started.instanceId;
    const sourceCurrent = source?.live === true && source.sessionId === context.initial.sessionId &&
      source.phase === 'active' && Number.isSafeInteger(source.cycle);
    const alertMapsCurrent = diagnosticRecord(source?.unrestAlerts) && diagnosticRecord(source?.populationAlerts);
    if (!originalGmCurrent || !sourceCurrent || !alertMapsCurrent) {
      return finish(pendingSourceCases('the source projection is not current for the original GM'), false);
    }
    const sourceAlerts = ['unrest', 'population'].flatMap(type => {
      const rows = type === 'unrest' ? source.unrestAlerts : source.populationAlerts;
      return Object.keys(rows).map(shipId => ({ type, shipId }));
    });
    const cases = [];
    let everySourceAlertBound = true;
    for (const entry of sourceAlerts) {
      try {
        actor = await surface.observe();
        source = await game.state(surface);
      } catch {
        everySourceAlertBound = false;
        cases.push(pending(CASE_BY_ID.get(alertCaseId[entry.type]),
          'the current source alert projection became unavailable before dismissal'));
        continue;
      }
      const originalGmStillCurrent = actor?.sameActor === true && actor.sessionId === context.initial.sessionId &&
        actor.connection === 'live' && actor.freshness === 'server' && actor.playerRole === 'gm' &&
        actor.gmInstanceOwned === true && actor.uidHash === started.uidHash && actor.instanceId === started.instanceId;
      const sourceStillCurrent = source?.live === true && source.sessionId === context.initial.sessionId &&
        source.phase === 'active' && Number.isSafeInteger(source.cycle) &&
        diagnosticRecord(source.unrestAlerts) && diagnosticRecord(source.populationAlerts);
      if (!originalGmStillCurrent || !sourceStillCurrent) {
        everySourceAlertBound = false;
        cases.push(pending(CASE_BY_ID.get(alertCaseId[entry.type]),
          'the current source alert projection is not active under the original GM'));
        continue;
      }
      const witness = createGmSourceAlertWitness(source, { ...entry, sessionId: context.initial.sessionId,
        gmUidHash: started.uidHash, gmInstanceId: started.instanceId });
      if (!witness) {
        everySourceAlertBound = false;
        cases.push(pending(CASE_BY_ID.get(alertCaseId[entry.type]),
          'source alert is malformed, stale, inactive, or targeted to another GM instance'));
        continue;
      }
      const caseContext = { ...context, directory: undefined, sourceAlertWitness: witness };
      const result = await runCasesAtCheckpoint({ family: G, cases: GM_RULING_COUNTER_PROCEDURES,
        checkpoint: 'eligible-alert', context: caseContext, steps, gameFactory,
        onlyCaseIds: [alertCaseId[entry.type]] });
      const outcome = result.evidence.cases[0];
      cases.push(outcome ?? pending(CASE_BY_ID.get(alertCaseId[entry.type]),
        'no source-bound mounted dismissal outcome was returned'));
      if (outcome?.status !== 'completed' || outcome.sourceAlertReceipt?.type !== witness.type ||
          outcome.sourceAlertReceipt?.shipId !== witness.shipId ||
          outcome.sourceAlertReceipt?.sourceRevisionBefore !== witness.sourceRevision ||
          outcome.sourceAlertReceipt?.alertIdentityHash !== witness.alertIdentityHash ||
          outcome.sourceAlertReceipt?.originalGmUidHash !== started.uidHash ||
          outcome.sourceAlertReceipt?.originalGmInstanceHash !== witness.gmInstanceHash ||
          outcome.sourceAlertReceipt?.exactReplay !== true) everySourceAlertBound = false;
    }
    let sourceAfter, actorAfter;
    try {
      sourceAfter = await game.state(surface);
      actorAfter = await surface.observe();
    } catch { everySourceAlertBound = false; }
    const remainingAlerts = alertMapsCurrent && diagnosticRecord(sourceAfter?.unrestAlerts) &&
      diagnosticRecord(sourceAfter?.populationAlerts)
      ? Object.keys(sourceAfter.unrestAlerts).length + Object.keys(sourceAfter.populationAlerts).length : -1;
    const finalSourceCurrent = sourceAfter?.live === true && sourceAfter.sessionId === context.initial.sessionId &&
      sourceAfter.phase === 'active' && Number.isSafeInteger(sourceAfter.cycle);
    const finalOriginalGmCurrent = actorAfter?.sameActor === true && actorAfter.sessionId === context.initial.sessionId &&
      actorAfter.connection === 'live' && actorAfter.freshness === 'server' && actorAfter.playerRole === 'gm' &&
      actorAfter.gmInstanceOwned === true && actorAfter.uidHash === started.uidHash &&
      actorAfter.instanceId === started.instanceId;
    const ready = everySourceAlertBound && finalSourceCurrent && finalOriginalGmCurrent && remainingAlerts === 0;
    return finish(cases, ready);
  };
  return Object.freeze({ onSetup: run('on-setup'), onStarted: run('on-started'),
    onMaintenance: run('maintenance'), onEligibleAlert: runEligibleAlert,
    onEligibleMutiny: run('eligible-mutiny'), onEligibleDestruction: run('eligible-destruction'),
    onCycle6: run('cycle-6') });
}
