import { resolve } from 'node:path';
import {
  CORE_CRAFT_PROCEDURES,
  GM_RULING_COUNTER_PROCEDURES,
  createPendingCoreCraftActionsCallback,
  createPendingGmRulingsCountersCallbacks,
} from './pc10-pending-procedure-ui-proof.mjs';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';

/**
 * Source binding for the finite Base runner composition. This module only
 * supplies callback placement and existing recipe wiring; it never advances
 * phases, creates actors, calls a gameplay endpoint, or changes source state.
 */
export const BASE_PENDING_PROCEDURE_SOURCE_BINDING = Object.freeze({
  rootCommit: '650c83efe73bb4910967be11125c61e8d01db9f3',
  rootCommitKind: 'integrated dependency source before metadata refresh; owner runner binds actual candidate',
  baseRunnerPath: '/tmp/dow-pc10-evidence/proof-draft/pc10-base-gameplay.mjs',
  baseRunnerSha256: 'd3ce4d1cf80316943fa27e4f7bb0d09e4de41aa95948012e09765efda7b6d040',
  procedureProofPath: 'scripts/pc10-pending-procedure-ui-proof.mjs',
  procedureProofSha256: '874223a02336dbf05800481e79e85e984b660eb50689f3b0131efd50a68dacd5',
  procedureRecipesPath: 'scripts/pc10-pending-procedure-ui-recipes.mjs',
  procedureRecipesSha256: '39987a0c278bcd6b8f8b2568ba4bac115ba3c4363a3d185ef0df7a9b0995c364',
});

/**
 * Exact insertion points in the existing fresh Base runner. Call these only
 * from the named root-owned checkpoints; the hooks do not perform progression.
 */
export const BASE_PENDING_PROCEDURE_PLACEMENTS = Object.freeze([
  Object.freeze({
    stage: 'cycle-1-started',
    sourceAnchor: 'pc10-base-gameplay.mjs:147-164',
    after: 'normal Cycle 1 start and source-derived initial GM supplies',
    before: 'Cycle 1 Detector research and the six paid Maintenance procedures',
    hooks: Object.freeze(['gm.onStarted', 'core.onStarted']),
    caseIds: Object.freeze(['gm:on-started/*', 'core:repairMaliades']),
  }),
  Object.freeze({
    stage: 'cycle-1-coordination',
    sourceAnchor: 'pc10-base-gameplay.mjs:164-170',
    after: 'six Cycle 1 paid Maintenance procedures and the ordinary manual Coordination opening',
    before: 'the naturally offered opening Wolf attack',
    hooks: Object.freeze(['core.onCoordination']),
    caseIds: Object.freeze(CORE_CRAFT_PROCEDURES.filter(row => row.checkpoint === 'coordination').map(row => row.id)),
  }),
  Object.freeze({
    stage: 'cycle-1-source-timed-shuttle-auto-arrival-observer-armed',
    sourceAnchor: 'ShuttleControl.tsx source arrival timer and automatic completion effect',
    after: 'the same manual Cycle 1 Coordination has the original retargeted transit with 1–35 seconds remaining',
    before: 'the natural source arrivesAt and automatic useEffect callable response',
    hooks: Object.freeze(['core.onShuttleAutoArrivalArmed']),
    caseIds: Object.freeze(['core:completeShuttleArrival']),
    note: 'After the natural wait outside capture, this arrival-only flow arms the existing browser response observer before arrivesAt and makes no click or callable retry. It accepts only the ordinary current holder useEffect response and exact arrived projection; a missed or prior response stays pending. Use this separately named automatic flow or the manual ready-control flow, never both for one transit.',
  }),
  Object.freeze({
    stage: 'cycle-1-source-timed-shuttle-arrival-ready',
    sourceAnchor: 'the mounted Shuttle departure panel and its current source-projected arrivesAt',
    after: 'the same manual Cycle 1 Coordination reaches the natural retargeted arrival time and the current holder sees the enabled Complete arrival control',
    before: 'the root-owned manual advance to Cycle 2',
    hooks: Object.freeze(['core.onShuttleArrivalReady']),
    caseIds: Object.freeze(['core:completeShuttleArrival']),
    note: 'Carry the completed Retarget proof shuttleArrivalWitness through context.shuttleArrivalWitness. The root waits on the actual current mounted ready control and source time, then invokes this arrival-only hook once; it does not rerun other Coordination mutations or retry the SDK call.',
  }),
  Object.freeze({
    stage: 'cycle-1-after-wolf',
    sourceAnchor: 'pc10-base-gameplay.mjs:169-172',
    after: 'the complete natural Cycle 1 Wolf attack and aftermath',
    before: 'the root-owned manual advance to Cycle 2',
    hooks: Object.freeze(['core.afterWolf']),
    caseIds: Object.freeze(CORE_CRAFT_PROCEDURES.filter(row => row.checkpoint === 'after-wolf').map(row => row.id)),
    note: 'There are currently no core craft rows at the after-wolf checkpoint; this hook intentionally performs no action.',
  }),
  Object.freeze({
    stage: 'cycle-2-coordination',
    sourceAnchor: 'pc10-base-gameplay.mjs:173-180',
    after: 'Cycle 2 Detector research, six paid Maintenance procedures, and ordinary manual Coordination opening',
    before: 'Starlight/Hummingbird scouting and the six ordinary charged jumps',
    hooks: Object.freeze(['core.onCoordination']),
    caseIds: Object.freeze(CORE_CRAFT_PROCEDURES.filter(row => row.checkpoint === 'coordination').map(row => row.id)),
  }),
  Object.freeze({
    stage: 'cycle-2-before-mission-deal',
    sourceAnchor: 'pc10-base-gameplay.mjs:181-199',
    after: 'the six source-accepted charged jumps to the actual Chart A location',
    before: 'the ordinary GM New-location mission start control',
    hooks: Object.freeze(['core.beforeMissionDeal']),
    caseIds: Object.freeze(['core:chooseBoaMissionReclamationOpportunity']),
    note: 'Boa remains pending when the Base roster has no Capybara/Recycler or no live printed opportunity.',
  }),
  Object.freeze({
    stage: 'cycle-3-coordination',
    sourceAnchor: 'pc10-base-gameplay.mjs:235-248',
    after: 'normal Cycle 3 mission result resolution, reward delivery, Detector research, and six paid Maintenance procedures',
    before: 'the root-owned manual advance to Cycle 4',
    hooks: Object.freeze(['core.onCoordination']),
    caseIds: Object.freeze(CORE_CRAFT_PROCEDURES.filter(row => row.checkpoint === 'coordination').map(row => row.id)),
  }),
  Object.freeze({
    stage: 'cycle-4-coordination',
    sourceAnchor: 'pc10-base-gameplay.mjs:249-257',
    after: 'Cycle 4 Detector research, six paid Maintenance procedures, and ordinary manual Coordination opening',
    before: 'private Scientist/Wolf deduction, crisis, and the root-owned normal ending',
    hooks: Object.freeze(['core.onCoordination']),
    caseIds: Object.freeze(CORE_CRAFT_PROCEDURES.filter(row => row.checkpoint === 'coordination').map(row => row.id)),
  }),
  Object.freeze({
    stage: 'after-paid-maintenance-each-cycle',
    sourceAnchor: 'pc10-base-gameplay.mjs:156-162,166,175,246,251',
    after: 'the existing ordinary paid maintenance UI completes all six core ships for that cycle',
    before: 'the next normal Coordination action or root-owned phase advance',
    hooks: Object.freeze(['gm.onMaintenance']),
    caseIds: Object.freeze(GM_RULING_COUNTER_PROCEDURES.filter(row => row.checkpoint === 'maintenance').map(row => row.id)),
    note: 'GM procedure overrides are caller supplied; no default GM repair, damage, rollback, or maintenance choice is made.',
  }),
  Object.freeze({
    stage: 'source-created-gm-interruption-only',
    sourceAnchor: 'scripts/pc10-pending-procedure-ui-proof.mjs:GM eligible-alert/mutiny/destruction case rows',
    after: 'an actual server/source-created eligible alert, mutiny, or ship destruction',
    before: 'the existing normal GM recovery control is dismissed or resolved',
    hooks: Object.freeze(['gm.onEligibleAlert', 'gm.onEligibleMutiny', 'gm.onEligibleDestruction']),
    caseIds: Object.freeze(['gm:dismissPopulationAlert', 'gm:dismissUnrestAlert', 'gm:resolveShipMutiny', 'gm:scavengeDestroyedShipStores']),
    note: 'Never synthesize the event. Leave the row pending when the real source event/target is absent.',
  }),
  Object.freeze({
    stage: 'separate-cycle-6-variant-only',
    sourceAnchor: 'scripts/pc10-pending-procedure-ui-proof.mjs:127-129',
    after: 'an actual Cycle 6 active-game session before its normal terminal path',
    before: 'the root-owned normal ending',
    hooks: Object.freeze(['gm.onCycle6']),
    caseIds: Object.freeze(['gm:setCandidatePlanCheckpoint']),
    note: 'The four-cycle Base run ends earlier; do not move this checkpoint into that run or invent Cycle 6.',
  }),
]);

/** Live target rules inherited from the existing recipe resolvers. These are
 * not setup instructions; current UID, console, docking, group, resource and
 * revision must still come from the normal current server projection. */
export const BASE_CORE_TARGET_RULES = Object.freeze([
  Object.freeze({ cases: Object.freeze(['core:rollHummingbirdHarvest', 'core:allocateHummingbirdHarvest']),
    actorRoleId: 'quellon-explorer', shuttleId: 'hummingbird', initialBaseHost: 'quellon',
    currentAuthority: 'the same admitted Quellon Explorer and current source-projected fuel/docking/action phase; allocation follows only a completed real roll' }),
  Object.freeze({ cases: Object.freeze(['core:runHighwallMining']), actorRoleId: 'icebreaker-miner', shuttleId: 'highwall',
    currentAuthority: 'active Highwall on its proper live host with current Icebreaker Miner, source-eligible operation phase and remaining cycle capacity; use server dice/results' }),
  Object.freeze({ cases: Object.freeze(['core:repairMaliades']), actorRoleId: 'dione-engineer', shuttleId: 'maliades', initialBaseHost: 'dione',
    currentAuthority: 'actual launched, undestroyed, fuelled Maliades, current docked host, restricted Team window, damage and host Materials from live projection' }),
  Object.freeze({ cases: Object.freeze(['core:chooseBoaMissionReclamationOpportunity', 'core:recycleWithBoa', 'core:repairConsolesFromMacaw']),
    actorRoleIds: Object.freeze(['capybara-recycler', 'capybara-captain']), shuttleIds: Object.freeze(['boa', 'macaw']),
    currentAuthority: 'Capybara mode and current normal holder/mission/docking/custody; retain pending in the six-ship Base when Capybara is absent' }),
  Object.freeze({ cases: Object.freeze(['core:repairConsolesFromAlly', 'core:repairConsolesFromBlacksmith', 'core:repairConsolesFromChacau', 'core:repairConsolesFromPhilia']),
    roleOrHolderResolvedFrom: 'current authenticated console role plus GM-projected control, unique docking and live active host',
    currentAuthority: 'actual currently damaged eligible host consoles, same fleet group, any required live shuttle fuel, and printed Materials cost' }),
  Object.freeze({ cases: Object.freeze(['core:rechargeHostConsoleFromShuttle', 'core:beginShuttleTransit', 'core:completeShuttleArrival', 'core:evacuateShuttleSurvivorsCommand', 'core:requestShuttleDeparture', 'core:retargetShuttleTransit', 'core:transferShuttleCargoCommand', 'core:transferShuttleControlCommand']),
    roleOrHolderResolvedFrom: 'current GM-projected shuttleControl UID matched to exactly one admitted roster identity; revalidate the actor console after normal navigation',
    currentAuthority: 'current source holder, docking, host, group and request-bound movement/cargo/evacuation ledger; only rendered legal destinations/resources and server-confirmed source costs/results' }),
]);

/** Inputs required before a root-owned normal mounted-GM step may replace the
 * deliberately blocked default recipe. The list does not supply any value. */
export const BASE_GM_CHOICE_INPUTS = Object.freeze([
  Object.freeze({ endpoint: 'setFacilitatorResponsibility', checkpoint: 'on-setup',
    currentTarget: 'A second live GM instance currently listed beside the original GM instance; the normal solo Base has none.',
    requiredInputs: Object.freeze(['responsibility: main|assistant', 'mode: share|handoff|drop', 'targetInstanceId when offered', 'current expectedSetupRevision']),
    requestFields: Object.freeze(['sessionId', 'instanceId', 'requestId', 'expectedSetupRevision', 'responsibility', 'mode', 'targetInstanceId?']),
    sourceConstraint: 'Use only an own-instance button shown for an actually present other instance; recheck the setup revision and authority.' }),
  Object.freeze({ endpoint: 'setGmControlsLocked', checkpoint: 'on-started',
    currentTarget: 'The original live GM instance and current session registration-lock state.',
    requiredInputs: Object.freeze(['locked: explicit boolean']),
    requestFields: Object.freeze(['sessionId', 'instanceId', 'locked']),
    sourceConstraint: 'No mounted src UI invocation of this service was found in this source; do not call the service directly to manufacture a UI action. Remain pending unless a normal visible control is supplied by the owner.' }),
  Object.freeze({ endpoint: 'setGmShipConsoleWriteGrant', checkpoint: 'on-started',
    currentTarget: 'The active AEGIS ship and the original GM browser instance/claimedAt shown by the normal ship-console observer confirmation.',
    requiredInputs: Object.freeze(['shipId: AEGIS only while it remains active', 'enabled: true for the caller-planned GM maintenance, then false/revoke afterward', 'original sessionId/uid/instanceId/claimedAt authority']),
    requestFields: Object.freeze(['sessionId', 'instanceId', 'shipId', 'enabled', 'claimedAt']),
    sourceConstraint: 'Use the rendered observer confirmation and revoke through normal cleanup; this endpoint has no request-id receipt, so do not claim an exact SDK replay.' }),
  Object.freeze({ endpoint: 'setShipConsoleLock', checkpoint: 'on-started',
    currentTarget: 'AEGIS current command console before the opening Wolf attack, through its ordinary entitled ship/GM route.',
    requiredInputs: Object.freeze(['shipId: AEGIS while active', 'locked: explicit true then false before combat, each based on the current value and a fresh vessel-action revision']),
    requestFields: Object.freeze(['sessionId', 'shipId', 'locked', 'requestId', 'expectedRevision', 'instanceId when present']),
    sourceConstraint: 'Use the normal mounted lock toggle only; capture the live revision and same actor/session before and after.' }),
  Object.freeze({ endpoint: 'setCandidatePlanCheckpoint', checkpoint: 'cycle-6',
    currentTarget: 'Original GM view at the actual active Cycle 6 checkpoint.',
    requiredInputs: Object.freeze(['planExists: explicit boolean reflecting whether a plan actually exists']),
    requestFields: Object.freeze(['sessionId', 'instanceId', 'requestId', 'planExists']),
    sourceConstraint: 'Current four-cycle Base ends in Cycle 4; only a separate normal Cycle 6 variant may reach this control. Set true only when a candidate plan was genuinely completed; never synthesize a plan.' }),
  Object.freeze({ endpoint: 'setFacilitatorCensusNote', checkpoint: 'on-started',
    currentTarget: 'One UID currently present in the original GM’s live loyalty census.',
    requiredInputs: Object.freeze(['targetUid: a real fixture UID currently present in the live census', 'note: caller-supplied text explicitly states virtual automated personas/0 physical humans, or explicit empty string to clear', 'current census revision']),
    requestFields: Object.freeze(['sessionId', 'instanceId', 'requestId', 'expectedRevision', 'targetUid', 'note']),
    sourceConstraint: 'Record only an opaque receipt/status in evidence. Never include census note text, loyalty, or private mapping in the report.' }),
  Object.freeze({ endpoint: 'authorFacilitatorRuleCall', checkpoint: 'on-started',
    currentTarget: 'Original live GM’s normal Facilitator rule call form and current rule-call revision.',
    requiredInputs: Object.freeze(['ambiguity: 1–240 chars', 'source: 1–240 chars', 'decision: 1–500 chars explicitly identifying virtual automated personas/0 physical humans', 'audience: gm-only|selected-player (the root-directed evidence note may use gm-only)', 'recipientUid only for a current active selected player', 'supersedesCallId only for an existing unsuperseded call']),
    requestFields: Object.freeze(['sessionId', 'instanceId', 'requestId', 'expectedRevision', 'ambiguity', 'source', 'decision', 'audience', 'recipientUid?', 'supersedesCallId?']),
    sourceConstraint: 'The ruling must answer an actual ambiguity with a source the root supplies; never invent ruling text or widen its audience.' }),
]);

const GM_EXPLICIT_INPUTS = new Set(BASE_GM_CHOICE_INPUTS.map(row => row.endpoint));
const GM_CASE_IDS = new Set(GM_RULING_COUNTER_PROCEDURES.flatMap(row => [row.id, row.endpoint]));
const CORE_CASE_IDS = new Set(CORE_CRAFT_PROCEDURES.flatMap(row => [row.id, row.endpoint]));

function validateOverrides(overrides, allowed, label) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError(`${label} must be an object keyed by an existing finite case id or endpoint.`);
  }
  for (const [key, step] of Object.entries(overrides)) {
    if (!allowed.has(key)) throw new TypeError(`${label} cannot add the unregistered case ${key}.`);
    if (typeof step !== 'function') throw new TypeError(`${label}.${key} must be a source-mounted recipe function.`);
  }
}

function overridesByCaseId(overrides, procedures) {
  const byEndpoint = new Map(procedures.map(row => [row.endpoint, row.id]));
  return Object.fromEntries(Object.entries(overrides).map(([key, step]) => [byEndpoint.get(key) ?? key, step]));
}

function stageContext(context, label) {
  if (!context || typeof context !== 'object' || typeof context.directory !== 'string') {
    throw new TypeError('The existing Base runner context must provide its evidence directory.');
  }
  return { ...context, directory: resolve(context.directory, 'base-pending-procedures', label) };
}

function invoke(hook, label) {
  return context => hook(stageContext(context, label));
}

function combine(label, ...hooks) {
  return async context => {
    const stage = stageContext(context, label);
    const results = [];
    for (const hook of hooks) results.push(await hook(stage));
    return results;
  };
}

/**
 * Make the Base hooks from the already-tested finite factories. Core steps use
 * their source-mounted default recipes. GM steps do not default any decision;
 * the seven authored choices remain pending until the root supplies an
 * explicit mounted-control step under the unchanged capture contract.
 */
export function createBasePendingProcedureCallbacks({
  coreStepOverrides = {},
  gmChoiceSteps = {},
  gmStepOverrides = {},
  gameFactory,
} = {}) {
  validateOverrides(coreStepOverrides, CORE_CASE_IDS, 'coreStepOverrides');
  validateOverrides(gmChoiceSteps, GM_EXPLICIT_INPUTS, 'gmChoiceSteps');
  validateOverrides(gmStepOverrides, GM_CASE_IDS, 'gmStepOverrides');

  const defaults = createPendingProcedureDefaultSteps();
  const coreSteps = Object.fromEntries(CORE_CRAFT_PROCEDURES.map(row => [row.id, defaults[row.id]]));
  const gmSteps = Object.fromEntries(GM_RULING_COUNTER_PROCEDURES.map(row => [row.id, defaults[row.id]]));
  Object.assign(coreSteps, overridesByCaseId(coreStepOverrides, CORE_CRAFT_PROCEDURES));
  Object.assign(gmSteps,
    overridesByCaseId(gmStepOverrides, GM_RULING_COUNTER_PROCEDURES),
    overridesByCaseId(gmChoiceSteps, GM_RULING_COUNTER_PROCEDURES));

  const core = createPendingCoreCraftActionsCallback({ steps: coreSteps, ...(gameFactory ? { gameFactory } : {}) });
  const gm = createPendingGmRulingsCountersCallbacks({ steps: gmSteps, ...(gameFactory ? { gameFactory } : {}) });
  const allocateOnly = createPendingCoreCraftActionsCallback({
    steps: { 'core:allocateHummingbirdHarvest': coreSteps['core:allocateHummingbirdHarvest'] },
    ...(gameFactory ? { gameFactory } : {}),
  });

  async function cycle1Coordination(context) {
    const result = await core.onCoordinationWithoutShuttleMovement(
      stageContext(context, 'cycle-1-coordination-without-shuttle-movement'));
    const roll = result?.evidence?.cases?.find(row => row.caseId === 'core:rollHummingbirdHarvest');
    const allocation = roll?.status === 'completed'
      ? await allocateOnly.onCoordination(stageContext(context, 'cycle-1-after-successful-hummingbird-roll'))
      : null;
    return { coordination: result, postRollAllocation: allocation };
  }

  let interruptionSequence = 0;
  const eligibleInterruption = hook => context => {
    interruptionSequence += 1;
    return hook(stageContext(context, `source-interruption-${String(interruptionSequence).padStart(2, '0')}`));
  };

  return Object.freeze({
    onSetup: invoke(gm.onSetup, 'cycle-0-setup'),
    onCycle1Started: combine('cycle-1-started-after-supplies', gm.onStarted, core.onStarted),
    onCycle1Maintenance: invoke(gm.onMaintenance, 'cycle-1-after-six-paid-maintenance'),
    onCycle1Coordination: cycle1Coordination,
    onCycle1ShuttleMovement: invoke(core.onShuttleMovement, 'cycle-1-shuttle-movement-after-actor-changing-coordination'),
    onShuttleAutoArrivalArmed: invoke(core.onShuttleAutoArrivalArmed, 'shuttle-auto-arrival-observer-armed'),
    onShuttleArrivalReady: invoke(core.onShuttleArrivalReady, 'shuttle-arrival-ready'),
    onCycle1AfterWolf: invoke(core.afterWolf, 'cycle-1-after-wolf'),
    onCycle2Maintenance: invoke(gm.onMaintenance, 'cycle-2-after-six-paid-maintenance'),
    onCycle2Coordination: invoke(core.onCoordination, 'cycle-2-coordination'),
    beforeCycle2MissionDeal: invoke(core.beforeMissionDeal, 'cycle-2-before-mission-deal'),
    onCycle3Maintenance: invoke(gm.onMaintenance, 'cycle-3-after-six-paid-maintenance'),
    onCycle3Coordination: invoke(core.onCoordination, 'cycle-3-coordination-after-mission-delivery'),
    onCycle4Maintenance: invoke(gm.onMaintenance, 'cycle-4-after-six-paid-maintenance'),
    onCycle4Coordination: invoke(core.onCoordination, 'cycle-4-coordination'),
    onEligibleAlert: eligibleInterruption(gm.onEligibleAlert),
    onEligibleMutiny: eligibleInterruption(gm.onEligibleMutiny),
    onEligibleDestruction: eligibleInterruption(gm.onEligibleDestruction),
    onCycle6: invoke(gm.onCycle6, 'separate-cycle-6-variant-only'),
  });
}
