import assert from 'node:assert/strict';
import {
  createPoliticsPressCallbacks,
  validateElectionPlan,
  validateElectionTieDecision,
} from './pc10-politics-press-proof.mjs';
import { createCrisisVoyageCallbacks, assertRequiredCrisisChoices } from './pc10-crisis-voyage-proof.mjs';
import { createArrestPosseCallbacks, assertRequiredArrestChoices } from './pc10-arrest-posse-proof.mjs';

export const BASE_PROCEDURE_SOURCE_BINDING = Object.freeze({
  rootRevision: '9fbaf7df1e8fbdd9b45ed6b2871b3831a4477f01',
  proofDraft: '/tmp/dow-pc10-evidence/proof-draft/pc10-base-gameplay.mjs',
  proofDraftSha256: 'd3ce4d1cf80316943fa27e4f7bb0d09e4de41aa95948012e09765efda7b6d040',
  functionsIndexSha256: '9f26b38328feac5eef7e86f61b9ab901243247a2d6b370c430ede49b7c365f35',
  electionUiSha256: '54f6a172087d009279637bd147df00869f05f608cee8c9ee678b5888a669d3dd',
  arrestUiSha256: 'dede2b1dcadc36af720aa915fbffcbdcb3fd955d5527fe31e48c01c30b482d5b',
  gmConsoleSha256: 'e393c90b18ea8c519a75728980b5244ca80d21e8e28575b5afe0270c86a8b37b',
  presidentUiSha256: '77ab1f19379add86460c754eee6aa55da11f7ef0f8fd7e991839b2d90a72b96d',
  fleetGroupUiSha256: '4fda3fca57310a7afa5402f6b67e9f8dd0db489223c10548b4d6cd986e4b2635',
  pressDispatchUiSha256: '92e5067f2131587ac640da21f71a09a44bb47ad0a2f1396de69b2f64150f6f91',
  admiralDirectiveUiSha256: '68b09f1fded2780a8bc625a8f36e3a9b3a6c7ea195d118c9c1a6e22a4d7112b7',
  redAlertUiSha256: '34a7d1d25c113a610c8a2f8362f0a51a375412fc7b93f5696ef31d11cde0fe4f',
  approachingVesselUiSha256: '96c5e54fb8bb4dba5940a9456cf7ac8f7f364b822cfc0134b440d65f700e4812',
  civilUnrestUiSha256: 'a6d2df124dcd72483560e2a248a65ad92ac9901a6e90589906b03a4b046291a8',
  voyageMovementUiSha256: 'b29a4cb309be5867540223ad567efd325de9a3c30ae83b048fa3bace62bf6491',
  voyageMaintenanceUiSha256: 'cadec7d5ec459953f3e2d8cc267b004ef2899c5f69ee45bfcbc4bb939a3e75c1',
});

/**
 * Exact splice points in the current four-cycle Base draft. These are finite
 * source slots, not cycle automation or gameplay acceptance.
 */
export const BASE_PENDING_PROCEDURE_STAGES = Object.freeze([
  Object.freeze({ id: 'team1AfterNormalStart', cycle: 1, phase: 'team',
    after: 'advanceBaseDetectorResearch(expectedCycle: 1)',
    before: 'paidMaintenance(1, true)',
    callbacks: Object.freeze(['politics.onStarted', 'crisis.onStarted', 'arrest.onStarted']) }),
  Object.freeze({ id: 'coordination1AfterOpeningWolf', cycle: 1, phase: 'coordination',
    after: 'runBaseCombatAndDeduction(combat: opening)', before: 'advance()',
    callbacks: Object.freeze(['politics.onElectionClose', 'politics.onCoordination']) }),
  Object.freeze({ id: 'team2AfterMaintenance', cycle: 2, phase: 'team',
    after: 'paidMaintenance(2)', before: 'coordination()',
    callbacks: Object.freeze(['politics.onElectionBallot', 'crisis.onVoyageMovement(dock)',
      'crisis.onVoyageMaintenance', 'arrest.onArrestPosse', 'arrest.onArrestDisposition']) }),
  Object.freeze({ id: 'coordination2BeforeMissionDeal', cycle: 2, phase: 'coordination',
    after: 'coordination()', before: 'scout(Starlight)',
    callbacks: Object.freeze(['politics.onElectionClose', 'politics.onCoordination',
      'crisis.onVoyageMovement(jump)']) }),
  Object.freeze({ id: 'team3AfterMissionDelivery', cycle: 3, phase: 'team',
    after: 'missionUi(wing-commander, drop rewards)', before: 'advanceBaseDetectorResearch(expectedCycle: 3)',
    callbacks: Object.freeze(['politics.onElectionBallot', 'crisis.onVoyageMaintenance',
      'arrest.onArrestPosse', 'arrest.onArrestDisposition']) }),
  Object.freeze({ id: 'coordination3BeforeAdvance', cycle: 3, phase: 'coordination',
    after: 'paidMaintenance(3) and coordination()', before: 'advance()',
    callbacks: Object.freeze(['politics.onElectionClose', 'politics.onCoordination',
      'crisis.onVoyageMovement(jump)']) }),
  Object.freeze({ id: 'team4AfterMaintenance', cycle: 4, phase: 'team',
    after: 'paidMaintenance(4)', before: 'coordination()',
    callbacks: Object.freeze(['politics.onElectionBallot', 'crisis.onVoyageMaintenance',
      'arrest.onArrestPosse', 'arrest.onArrestDisposition']) }),
  Object.freeze({ id: 'coordination4AfterInvestigation', cycle: 4, phase: 'coordination',
    after: 'runBaseCombatAndDeduction(detectorTest, investigate, sendWolfIntelligence)',
    before: 'normal ending callback',
    callbacks: Object.freeze(['politics.onElectionClose', 'politics.onCoordination']) }),
]);

export const BASE_PENDING_PROCEDURE_SOURCE_RULES = Object.freeze({
  politics: Object.freeze({
    team1Actors: 'The normal active Team1 start is required. Admiral directives and Red Alert enter the original Admiral role; President records require the actual current Dione President; Press dispatch enters the current claimed press-officer; fleet notes enter the selected current group member. Each helper checks the mounted source control and its current authority before clicking.',
    choices: 'Supply the actual fleet-policy / alert / President / dispatch / group-note text and action explicitly. Source limits are 500 characters for Admiral and President text, 220 for Press, and 240 for group notes. A President Coordination visit spends one political capital and requires a ship currently offered by the President control; it is not evidence of physical attendance.',
    electionActors: 'The original owned GM instance configures policy at Team1. The current server electorate checkbox list is authoritative: each ballot is submitted by its original connected active, non-replacement, non-escaped core ship-role actor with a ship for that role; Press is explicitly excluded. Candidate choices must be among source-offered candidates and tied-office rulings remain explicit GM choices.',
    electionStart: 'The normal Team1 onStarted callback configures the election and, only when openCycle is 1, submits the explicitly supplied ballots during that same Team window. For openCycle 2–4, onElectionBallot runs at that cycle’s Team stage after the original normal turn actions.',
  }),
  election: Object.freeze({
    eligibleVoters: 'functions/src/index.ts electionRoster at 43446: active connected non-replacement, non-escaped core ship roles only; Press is excluded. The actual GM checkbox list remains authoritative.',
    ballotWindow: 'functions/src/index.ts castPresidentialBallot at 43560: one secret ballot per eligible original voter, active Team phase, configured openCycle through closeCycle.',
    closeWindow: 'functions/src/index.ts resolvePresidentialElection at 43638: no earlier than closeCycle; at that cycle, the Team window must have ended. In this Base run, closeCycle 1 resolves at Coordination 1 after the opening Wolf action.',
    vacancy: 'A vacancy confirmation is a separate explicit server input; the current mounted callback has no confirmation choice. Keep that source outcome pending.',
  }),
  posse: Object.freeze({
    target: 'The live GM census dropdown is authoritative. calculateArrestPosse at functions/src/index.ts:13140 requires the original active owned GM instance and a matching nonnegative-suspicion census/loyalty record. Target and current roster are explicit caller inputs; the module does not select either.',
    attendance: 'resolveArrestPosse at functions/src/index.ts:13344 requires the current target, current connected non-target players, and the same-cycle server calculation. Only the full-game demo may send simulated-demo; evidence always reports zero physical attendance.',
    disposition: 'An arrested result sets deadlineCycle to arrest cycle + 1. resolveArrestCaseDisposition at functions/src/index.ts:13529 offers release/execution through that next Team deadline; after it closes, only a reasoned facilitator-resolution is valid.',
  }),
  crisisAndVoyage: Object.freeze({
    currentCrisis: 'The existing onStarted handler is a Cycle1 fresh-start callback and consumes only a crisis already present in its actual mounted source workspace. Later-cycle naturally appearing crises have no callback in this composition and remain pending. No crisis, result, or hidden roll is created or supplied here.',
    actors: 'Crisis adjudication, Voyage admission/movement/maintenance, and the physical game rulings are actual-current-GM controls; Civil Unrest grievance uses the explicitly selected original group member and its mounted member control.',
    blockers: 'Approaching Vessel response requires the current crisis to be debated; only a real-vessel choice can proceed to admission. Disease quarantine, Religious Zealotry, and Civil Unrest require their matching current crisis state. An absent, closed, or unmounted case remains blocked.',
    movement: 'Voyage 33-0 is conditional on actual admission: dock only in Team, jump only in Coordination, with the source-listed host/destination.',
    maintenance: 'Voyage maintenance is Team-only and requires actual admission and docking. Each callback supplies one currently offered step; do not infer or fill later steps.',
  }),
});

export const BASE_PENDING_PROCEDURE_ROOT_INPUTS = Object.freeze([
  'Reuse the runner context from the actual normal start: session, current owned GM, crew surface, original roster, directory, and captured started snapshot.',
  'Supply political policy, voter role IDs and each voter’s private ballot choice explicitly. The live server electorate checkbox list is the final eligibility check; Press is excluded from election voters.',
  'If requesting a President action, name the actual current President role explicitly. A Coordination visit additionally needs the explicit expected cycle and a ship currently offered by the President control.',
  'Choose Admiral, President, Press, Red Alert, and fleet-group actions/text explicitly. The source actor is respectively the current Admiral, current President, claimed Press officer, Admiral, or a current member of the selected live group; the mounted workspace is authoritative.',
  'Supply only crisis choices matching an actual current debated crisis. Voyage host, destination, and each maintenance step must come from the current mounted source choices.',
  'Choose an arrest target from the current GM census and current roster; choose defender/adjustment inputs and any simulated-demo attendee roles explicitly. Attendance is software simulation only.',
  'Choose release/execution only when its next-Team deadline control is offered. A missed deadline requires an explicit reasoned facilitator ruling; no disposition is selected by this module.',
]);

const TEAM_POLITICS_KEYS = Object.freeze([
  'admiralDirective', 'redAlert', 'presidentAction', 'pressDispatch', 'groupMessage', 'election',
]);
const INITIAL_CRISIS_KEYS = Object.freeze([
  'approachingVessel', 'diseaseQuarantine', 'zealotry', 'civilUnrest', 'grievance',
]);
const INITIAL_CRISIS_REQUIRED = new Set([
  'approaching-vessel-response', 'voyage-admission', 'disease-quarantine',
  'zealotry-response', 'civil-unrest-resolution', 'civil-unrest-team-grievance',
]);

function hasAnyOwn(value, keys) {
  return Boolean(value && typeof value === 'object' && keys.some(key => Object.hasOwn(value, key)));
}

function hasRequiredBranch(value, branches) {
  return Array.isArray(value?.requiredBranches) && value.requiredBranches.some(branch => branches.has(branch));
}

function cycleOf(slot) {
  const match = typeof slot === 'string' && /^(?:team|coordination)([1-9][0-9]*)$/.exec(slot);
  return match ? Number(match[1]) : undefined;
}

function verifySlot(slot, allowedPhases, prefix) {
  if (slot === undefined) return;
  const cycle = cycleOf(slot);
  assert.ok(Number.isSafeInteger(cycle), `${prefix} must name a Team or Coordination cycle slot.`);
  assert.ok(allowedPhases.some(phase => slot.startsWith(phase)), `${prefix} must match its source phase.`);
}

async function dispatch(stage, context, operations) {
  const results = [];
  for (const [name, enabled, invoke] of operations) {
    if (enabled) results.push(Object.freeze({ callback: name, result: await invoke(context) }));
  }
  return Object.freeze({ stage, invoked: results.length, results: Object.freeze(results),
    physicalAttendanceProof: false, gameplayAcceptance: false });
}

/**
 * Compose the existing proof callbacks at their real Base source stages.
 * Inputs are the proof modules' existing choice objects; this composer never
 * supplies roles, voters, destinations, crisis facts, or arrest outcomes.
 */
export function createBasePendingProcedureComposition({
  politics: politicsChoices,
  crisis: crisisChoices,
  arrest: arrestChoices,
  crisisSchedule = {},
  arrestSchedule = {},
} = {}) {
  if (politicsChoices?.election !== undefined) validateElectionPlan(politicsChoices.election);
  if (politicsChoices?.electionTieDecision !== undefined) validateElectionTieDecision(politicsChoices.electionTieDecision);
  if (politicsChoices?.presidentAction !== undefined) {
    assert.ok(typeof politicsChoices.presidentAction.roleId === 'string' && politicsChoices.presidentAction.roleId.length > 0,
      'A President action needs the actual current President role explicitly; the callback default is not used here.');
  }
  if (crisisChoices !== undefined) assertRequiredCrisisChoices(crisisChoices);
  if (arrestChoices !== undefined) assertRequiredArrestChoices(arrestChoices);

  const politics = politicsChoices === undefined ? undefined : createPoliticsPressCallbacks(politicsChoices);
  const crisis = crisisChoices === undefined ? undefined : createCrisisVoyageCallbacks(crisisChoices);
  const arrest = arrestChoices === undefined ? undefined : createArrestPosseCallbacks(arrestChoices);
  const election = politicsChoices?.election;
  const electionOpen = election?.policy?.openCycle;
  const electionClose = election?.policy?.closeCycle;
  const visitCycle = politicsChoices?.coordinationVisit?.expectedCycle;
  if (politicsChoices?.coordinationVisit !== undefined) {
    assert.ok(Number.isSafeInteger(visitCycle) && visitCycle >= 1,
      'A President Coordination visit needs its explicit source cycle.');
  }
  const movement = crisisChoices?.voyageMovement;
  const movementSlot = crisisSchedule.movementSlot ?? (movement?.action === 'dock' ? 'team2'
    : movement?.action === 'jump' ? 'coordination2' : undefined);
  const maintenanceSlot = crisisChoices?.voyageMaintenance === undefined ? undefined
    : crisisSchedule.maintenanceSlot ?? 'team2';
  const posseSlot = arrestSchedule.posseSlot ?? (arrestChoices?.posse !== undefined ? 'team1' : undefined);
  const dispositionSlot = arrestChoices?.disposition === undefined ? undefined
    : arrestSchedule.dispositionSlot ?? (posseSlot ? `team${cycleOf(posseSlot) + 1}` : undefined);

  verifySlot(movementSlot, movement?.action === 'dock' ? ['team'] : ['coordination'], 'crisisSchedule.movementSlot');
  verifySlot(maintenanceSlot, ['team'], 'crisisSchedule.maintenanceSlot');
  verifySlot(posseSlot, ['team'], 'arrestSchedule.posseSlot');
  verifySlot(dispositionSlot, ['team', 'coordination'], 'arrestSchedule.dispositionSlot');

  const pending = [];
  if (electionOpen > 4) pending.push('Election ballots open after the four-cycle Base scenario; a separate normal scenario is required.');
  if (electionClose > 4) pending.push('Election closes after the four-cycle Base scenario; a separate normal scenario is required.');
  if (visitCycle > 4) pending.push('President Coordination visit is outside the four-cycle Base scenario.');
  if (movementSlot && cycleOf(movementSlot) > 4) pending.push('Voyage movement is outside the four-cycle Base scenario.');
  if (maintenanceSlot && cycleOf(maintenanceSlot) > 4) pending.push('Voyage maintenance step is outside the four-cycle Base scenario.');
  if (posseSlot && cycleOf(posseSlot) > 4) pending.push('Arrest-posse attempt is outside the four-cycle Base scenario.');
  if (dispositionSlot && cycleOf(dispositionSlot) > 4) pending.push('Prisoner disposition is outside the four-cycle Base scenario.');
  if (arrestChoices?.posse !== undefined && arrestChoices?.disposition === undefined) {
    pending.push('A posse result may create a pending prisoner case; no disposition is chosen without a separate explicit source choice.');
  }
  if (arrestChoices?.disposition !== undefined && posseSlot === undefined && arrestSchedule.dispositionSlot === undefined) {
    pending.push('A prisoner disposition without a posse attempt in this composition needs an explicit current source slot; no prior case or deadline is inferred.');
  }
  pending.push('No source-current crisis, target, eligible voter, ship, or ballot choice is inferred by this composition.');
  pending.push('The simulated-demo posse path proves zero human or physical attendance.');
  pending.push('Vice President vacancy confirmation remains pending because the mounted proof callback has no explicit confirmation control.');

  const runTeam = async (stage, cycle, context) => dispatch(stage, context, [
    ['politics.onElectionBallot', election !== undefined && electionOpen === cycle && cycle !== 1,
      value => politics.onElectionBallot(value)],
    ['crisis.onVoyageMovement', movement?.action === 'dock' && movementSlot === `team${cycle}`,
      value => crisis.onVoyageMovement(value)],
    ['crisis.onVoyageMaintenance', maintenanceSlot === `team${cycle}`,
      value => crisis.onVoyageMaintenance(value)],
    ['arrest.onArrestPosse', arrest !== undefined && arrestChoices?.posse !== undefined &&
      posseSlot === `team${cycle}` && cycle !== 1, value => arrest.onArrestPosse(value)],
    ['arrest.onArrestDisposition', arrest !== undefined && arrestChoices?.disposition !== undefined &&
      dispositionSlot === `team${cycle}`, value => arrest.onArrestDisposition(value)],
  ]);

  const runCoordination = async (stage, cycle, context) => dispatch(stage, context, [
    ['politics.onElectionClose', election !== undefined && electionClose === cycle,
      value => politics.onElectionClose(value)],
    ['politics.onCoordination', politicsChoices?.coordinationVisit !== undefined && visitCycle === cycle,
      value => politics.onCoordination(value)],
    ['crisis.onVoyageMovement', movement?.action === 'jump' && movementSlot === `coordination${cycle}`,
      value => crisis.onVoyageMovement(value)],
    ['arrest.onArrestDisposition', arrest !== undefined && arrestChoices?.disposition !== undefined &&
      dispositionSlot === `coordination${cycle}`, value => arrest.onArrestDisposition(value)],
  ]);

  return Object.freeze({
    sourceBinding: BASE_PROCEDURE_SOURCE_BINDING,
    stages: BASE_PENDING_PROCEDURE_STAGES,
    pending: Object.freeze(pending),
    async team1AfterNormalStart(context) {
      return dispatch('team1AfterNormalStart', context, [
        ['politics.onStarted', politics !== undefined && (hasAnyOwn(politicsChoices, TEAM_POLITICS_KEYS) ||
          hasRequiredBranch(politicsChoices, new Set(['admiral-directive', 'fleet-red-alert', 'president-action',
            'press-publish-dismiss', 'fleet-group-note', 'election-policy', 'secret-election-ballots', 'election-server-resolution']))),
        value => politics.onStarted(value)],
        ['crisis.onStarted', crisis !== undefined && (hasAnyOwn(crisisChoices, INITIAL_CRISIS_KEYS) ||
          hasRequiredBranch(crisisChoices, INITIAL_CRISIS_REQUIRED)), value => crisis.onStarted(value)],
        ['arrest.onStarted', arrest !== undefined && posseSlot === 'team1' && arrestChoices?.posse !== undefined,
          value => arrest.onStarted(value)],
      ]);
    },
    coordination1AfterOpeningWolf(context) { return runCoordination('coordination1AfterOpeningWolf', 1, context); },
    team2AfterMaintenance(context) { return runTeam('team2AfterMaintenance', 2, context); },
    coordination2BeforeMissionDeal(context) { return runCoordination('coordination2BeforeMissionDeal', 2, context); },
    team3AfterMissionDelivery(context) { return runTeam('team3AfterMissionDelivery', 3, context); },
    coordination3BeforeAdvance(context) { return runCoordination('coordination3BeforeAdvance', 3, context); },
    team4AfterMaintenance(context) { return runTeam('team4AfterMaintenance', 4, context); },
    coordination4AfterInvestigation(context) { return runCoordination('coordination4AfterInvestigation', 4, context); },
  });
}
