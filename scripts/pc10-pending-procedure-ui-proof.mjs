import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { sameActionReceipt } from './pc10-specialist-gameplay.mjs';

const RESULT_STATUSES = new Set(['committed', 'applied', 'repaired', 'arrived', 'requested', 'replayed', 'resolved']);
const STATUSLESS_VESSEL_RESULTS = Object.freeze({
  addShipDamage: { valid: result => typeof result?.destroyed === 'boolean', action: 'add-damage' },
  repairAllShipDamage: { valid: result => result?.repaired === true, action: 'repair-damage' },
  dismissPopulationAlert: { valid: result => result?.dismissed === true, action: 'dismiss-population' },
  dismissUnrestAlert: { valid: result => result?.dismissed === true, action: 'dismiss-unrest' },
});
const REVISION_FIELDS = ['revision', 'repairRevision', 'choiceRevision', 'controlRevision', 'movementRevision',
  'currentRevision', 'upgradeRevision', 'wingRevision', 'counterRevision'];
const TRAINING_CHOICE_CODE = 'gm-training:deliberate-choice';
const CASES = [];

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
add(C, 'runHighwallMining', 'icebreaker-miner', 'team', { mountedPath: 'HighwallMining',
  requirement: 'current Icebreaker Miner, active Highwall docked to its proper host, eligible action phase and remaining operation capacity',
  costPolicy: 'server rolls Materials 1d6 or Ore 3d6; two operations, or three with fuelled Highwall, per cycle', randomOutcome: true });
add(C, 'beginShuttleTransit', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel',
  requirement: 'exact live departure request, current craft holder, valid route/group and no source movement blocker', sourceGroup: true,
  unavailableReason: 'no valid source-accepted pending departure request exists' });
add(C, 'completeShuttleArrival', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel arrival control',
  requirement: 'server has naturally marked the exact current transit chain as arrived; same holder and request remain current',
  unavailableReason: 'no real transit has naturally reached server-arrived state', replayPolicy: 'single-shot' });
add(C, 'evacuateShuttleSurvivorsCommand', 'current-shuttle-holder', 'coordination', { mountedPath: 'Survivor evacuation panel',
  requirement: 'current craft holder, valid destination, live Coordination and remaining cycle evacuation capacity', sourceGroup: true,
  costPolicy: 'move only currently projected survivors, bounded by source roster and five-thousand-per-cycle limit' });
add(C, 'requestShuttleDeparture', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel',
  requirement: 'current holder, enabled craft, source-accepted destination and live departure window; attack/movement blockers clear', sourceGroup: true });
add(C, 'retargetShuttleTransit', 'current-shuttle-holder', 'coordination', { mountedPath: 'Shuttle departure panel retarget control',
  requirement: 'same current holder and original request-bound in-flight transit inside the source retarget window', sourceGroup: true,
  unavailableReason: 'no valid in-flight source transit is inside the retarget window' });
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

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 20);
}

function hashUid(uid) {
  return createHash('sha256').update(uid).digest('hex').slice(0, 16);
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

/** Validate an actual mounted action using source state, the unmodified POST and its receipt-safe retry. */
export function evaluateProcedureCapture(input) {
  const spec = CASE_BY_ID.get(input?.caseId);
  if (!spec) throw new Error(`Unknown pending procedure case: ${String(input?.caseId)}`);
  if (!input.offered) return pending(spec, input.reason ?? spec.unavailableReason);
  const expected = input.expected ?? {};
  const gm = spec.actorRoleId === 'gm';
  if (input.mountedUi !== true || !matchesActor(input.actorBefore, expected, gm) ||
      !matchesActor(input.actorAfter, expected, gm)) return pending(spec, 'original-authenticated-role-or-mounted-control-not-current');
  if (input.sourceBefore?.live !== true || input.sourceAfter?.live !== true ||
      input.sourceBefore?.sessionId !== expected.sessionId || input.sourceAfter?.sessionId !== expected.sessionId ||
      input.sourceBefore?.cycle !== expected.cycle || input.sourceAfter?.cycle !== expected.cycle ||
      input.sourceBefore?.revision !== expected.sourceRevision ||
      input.sourceAfter?.revision === undefined || input.sourceAfter.revision <= input.sourceBefore.revision ||
      expected.groupId !== undefined && (input.sourceBefore?.groupId !== expected.groupId ||
        input.sourceAfter?.groupId !== expected.groupId)) return pending(spec, 'live-source-cycle-revision-or-group-changed');
  const request = input.request;
  const acceptedStatus = acceptedResultStatus(spec, input.response?.result, request, expected);
  if (request?.sessionId !== expected.sessionId ||
      expected.cycle !== undefined && request.expectedCycle !== undefined && request.expectedCycle !== expected.cycle ||
      expected.sourceRevision !== undefined && request.expectedRevision !== undefined && request.expectedRevision !== expected.sourceRevision ||
      spec.replayPolicy === 'exact-request-id' && typeof (request?.requestId ?? request?.idempotencyKey) !== 'string' ||
      input.response?.httpStatus !== 200 || !acceptedStatus) {
    return pending(spec, 'captured-request-or-server-result-does-not-match-the-source-case');
  }
  if (input.response?.exactReplay !== true && spec.replayPolicy === 'exact-request-id') {
    return pending(spec, 'exact-original-sdk-retry-not-confirmed');
  }
  if (spec.replayPolicy === 'exact-request-id' && input.replay?.result &&
      !sameActionReceipt(input.response.result, input.replay.result)) return pending(spec, 'exact-retry-receipt-differs');
  if (revisionOf(input.response.result) !== input.sourceAfter.revision) return pending(spec, 'server-result-and-live-projection-revisions-differ');
  if (input.rendered?.visible !== true || input.rendered.resultStatus !== acceptedStatus) {
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
  return {
    status: 'completed', caseId: spec.id, family: spec.family, endpoint: spec.endpoint,
    actorRoleId: expected.roleId, cycle: expected.cycle, revision: input.sourceAfter.revision,
    actorHash: hash(input.actorBefore.uidHash), requestFingerprint: hash(input.request),
    exactSdkRetry: spec.replayPolicy === 'exact-request-id' ? 'same-original-request-receipt-confirmed' : 'not-claimed',
    ...(input.cost ? { cost: { resource: input.cost.resource, amount: input.cost.amount, direction: input.cost.direction } } : {}),
    ...(trainingChoice ? { trainingChoice } : {}),
    randomOutcomeRecorded: false,
    rendered: acceptedStatus,
  };
}

function acceptedResultStatus(spec, result, request, expected) {
  if (RESULT_STATUSES.has(result?.status)) return result.status;
  const vesselResult = STATUSLESS_VESSEL_RESULTS[spec.endpoint];
  if (!vesselResult || !vesselResult.valid(result) || typeof result?.actorUid !== 'string' ||
      hashUid(result.actorUid) !== expected.uidHash ||
      result.vesselId !== request?.shipId || result.turn !== expected.cycle || result.phase !== 'active' ||
      typeof request?.requestId !== 'string' || result.idempotencyKey !== request.requestId ||
      result.auditId !== `${vesselResult.action}-${request.requestId}` || !Number.isSafeInteger(result.revision)) return null;
  return 'committed';
}

/** Capture one ordinary visible control action; its unmodified SDK request is retried only with its own idempotency key. */
export async function captureMountedProcedureAction({ context, game, caseId, expected, prepare, inspect,
  trainingChoice = null, timeoutMs = 60_000 }) {
  const spec = CASE_BY_ID.get(caseId);
  if (!spec) throw new Error(`Unknown pending procedure case: ${String(caseId)}`);
  if (spec.replayPolicy === 'not-mounted') return pending(spec, spec.unavailableReason);
  assert.ok(context?.initial?.sessionId && typeof game?.select === 'function', 'Use the fresh connected two-browser game.');
  assert.equal(typeof prepare, 'function');
  assert.equal(typeof inspect, 'function');
  let roleId = expected?.roleId ?? spec.actorRoleId;
  let resolvedHolder = null;
  if (spec.actorRoleId === 'current-shuttle-holder' || spec.actorRoleId === 'current-ally-holder') {
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
  const surface = await game.select(roleId);
  const actorBefore = await surface.observe();
  const isGm = roleId === 'gm';
  const rosterActor = context.roster?.find(actor => actor.roleId === roleId);
  const normalizedExpected = { ...expected, sessionId: context.initial.sessionId, roleId,
    uidHash: expected?.uidHash ?? (isGm ? actorBefore.uidHash : rosterActor?.uidHash),
    ...(isGm ? { instanceId: expected?.instanceId ?? actorBefore.instanceId } : {}) };
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
  if (resolvedHolder) {
    const currentHolder = resolveCurrentHolderActor({ shuttleId: resolvedHolder.shuttleId,
      control: sourceBefore.shuttleControl?.[resolvedHolder.shuttleId], roster: context.roster, expectedRoleId: roleId });
    if (!currentHolder || currentHolder.uidHash !== resolvedHolder.uidHash) {
      return pending(spec, 'source-shuttle-holder-changed-before-action');
    }
  }
  const sourceRevision = expected?.sourceRevision ?? (expected?.shipId
    ? sourceBefore.vesselActionRevisions?.[expected.shipId] ?? 0 : undefined);
  const groupId = expected?.groupId ?? (expected?.shipId
    ? sourceBefore.shipFleetGroupIds?.[expected.shipId] : undefined);
  const sourceBeforeProof = { live: sourceBefore.live, sessionId: sourceBefore.sessionId,
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
  if (preClickActionRequest) return pending(spec, 'matching-action-callable-post-preceded-the-mounted-control-click');
  if (action?.offered !== true || typeof action.click !== 'function') {
    return pending(spec, action?.reason ?? spec.unavailableReason);
  }
  const displayedCost = action.cost ?? null;
  const result = await observeUiReceipt({
    waitForResponse: () => surface.page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith(`/us-central1/${spec.endpoint}`), { timeout: timeoutMs }),
    choose: action.click,
  });
  let body;
  try { body = await result.json(); } catch { body = null; }
  const request = result.request().postDataJSON()?.data;
  const actualResult = body?.result;
  if (!result.ok() || !actualResult || request?.sessionId !== context.initial.sessionId) {
    return pending(spec, 'mounted-ui-action-did-not-return-a-current-success-receipt');
  }
  const actorAfter = await surface.observe();
  if (!matchesActor(actorAfter, normalizedExpected, isGm)) return pending(spec, 'original-actor-or-GM-instance-changed-during-action');
  let replay = null;
  let exactReplay = false;
  if (spec.replayPolicy === 'exact-request-id') {
    const key = request.requestId ?? request.idempotencyKey;
    if (typeof key !== 'string' || !key) return pending(spec, 'source-request-has-no-exact-retry-key');
    replay = await surface.callable(spec.endpoint, request);
    exactReplay = replay?.status === 'committed' && sameActionReceipt(actualResult, replay.result);
  }
  const observed = await inspect({ context, game, surface, actor: actorBefore, actorAfter,
    sourceBefore, request, result: actualResult, replay: replay?.result ?? null });
  const sourceAfter = observed?.sourceAfter;
  const proof = evaluateProcedureCapture({ caseId, expected: { ...normalizedExpected, cycle: sourceBefore.cycle,
    sourceRevision, groupId, cost: action.expectedCost ?? normalizedExpected.cost,
    distinctConsent: action.distinctConsent ?? normalizedExpected.distinctConsent },
  offered: true, mountedUi: true, actorBefore, actorAfter,
  sourceBefore: sourceBeforeProof, sourceAfter,
  request, response: { httpStatus: result.status(), result: actualResult, exactReplay }, replay,
  rendered: observed?.rendered, cost: observed?.cost ?? displayedCost, consent: observed?.consent,
  trainingChoice, randomOutcomeForced: false, randomOutcomeRecorded: false });
  return proof;
}

async function runCasesAtCheckpoint({ family, cases, checkpoint, context, steps, gameFactory, directory }) {
  const game = gameFactory(context), selected = cases.filter(spec => spec.checkpoint === checkpoint);
  const evidence = { schemaVersion: 1, family, checkpoint, sourceCommit: context.sourceCommit ?? null,
    humanPhysicalProof: false, adminGameplayWrites: false, acceleratedClock: false,
    privateTextPersisted: false, sourceRandomnessForced: false,
    cases: selected.map(spec => ({ caseId: spec.id, endpoint: spec.endpoint, status: 'pending',
      reason: 'no-current-mounted-action-has-been-observed' })) };
  for (const spec of selected) {
    const step = steps[spec.id] ?? steps[spec.endpoint];
    if (typeof step !== 'function') continue;
    const prepared = await step({ context, game, spec });
    if (!prepared || typeof prepared.prepare !== 'function' || typeof prepared.inspect !== 'function') {
      evidence.cases.find(row => row.caseId === spec.id).reason = 'step-did-not-return-mounted-control-and-projection-inspector';
      continue;
    }
    const outcome = await captureMountedProcedureAction({ context, game, caseId: spec.id,
      ...prepared, trainingChoice: prepared.trainingChoice ?? null });
    const index = evidence.cases.findIndex(row => row.caseId === spec.id);
    evidence.cases[index] = outcome;
  }
  const summary = { status: 'pending', family, checkpoint,
    observedProcedureCount: evidence.cases.filter(row => row.status === 'completed').length,
    pendingProcedureCount: evidence.cases.filter(row => row.status !== 'completed').length,
    familyAcceptanceClaimed: false };
  evidence.summary = summary;
  if (directory) {
    await mkdir(directory, { recursive: true });
    const name = family === C ? 'pending-core-craft-actions' : 'pending-gm-rulings-counters';
    await writeFile(resolve(directory, `${name}-${checkpoint}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  return { ...summary, evidence };
}

/** Additive hooks for a root-owned Base/Capy/extra-role runner. Uncomposed or unoffered rows stay pending. */
export function createPendingCoreCraftActionsCallback({ steps = {}, gameFactory = createTwoBrowserGameplay } = {}) {
  const run = checkpoint => context => runCasesAtCheckpoint({ family: C, cases: CORE_CRAFT_PROCEDURES,
    checkpoint, context, steps, gameFactory, directory: context.directory });
  return Object.freeze({ onStarted: run('team'), onCoordination: run('coordination'),
    beforeMissionDeal: run('before-mission-deal'), afterWolf: run('after-wolf') });
}

/** Prestart facilitator setup and source-offered live rulings/counters; this never owns the root runner's phases. */
export function createPendingGmRulingsCountersCallbacks({ steps = {}, gameFactory = createTwoBrowserGameplay } = {}) {
  const run = checkpoint => context => runCasesAtCheckpoint({ family: G, cases: GM_RULING_COUNTER_PROCEDURES,
    checkpoint, context, steps, gameFactory, directory: context.directory });
  return Object.freeze({ onSetup: run('on-setup'), onStarted: run('on-started'),
    onMaintenance: run('maintenance'), onEligibleAlert: run('eligible-alert'),
    onEligibleMutiny: run('eligible-mutiny'), onEligibleDestruction: run('eligible-destruction'),
    onCycle6: run('cycle-6') });
}
