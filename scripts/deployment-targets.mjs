import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  classifyRiskGates,
  formatRiskGateOutputs,
  isVersionMetadataOnlyPackageChange,
} from './risk-gates.mjs';

export const ALL_DEPLOYMENT_TARGETS = Object.freeze([
  'hosting',
  'firestore',
  'functions',
]);

const WEB_FILES = new Set([
  'index.html',
  'pc01-review.html',
  'pc02-review.html',
  'pc03-review.html',
  'pc04-review.html',
  'pc06-review.html',
  'package.json',
  'package-lock.json',
]);

const FIRESTORE_FILES = new Set([
  'firestore.rules',
  'firestore.indexes.json',
]);

const TOOLING_ONLY_FILES = new Set([
  'docs/implementation-prompts.json',
  'config/render-performance-baseline.json',
]);

const CANDIDATE_REVEAL_CALLABLES = Object.freeze([
  'advanceTurn', 'assignReplacementRole', 'confirmSetup', 'joinSession', 'jumpShip',
  'moveShipToLocation', 'resumeSession', 'runMaintenance',
]);
// PC01 changes the common navigation parser and member projection. Ship-map
// writers must all adopt the new field before a scout result can be released.
const SCOUT_NAVIGATION_CALLABLES = Object.freeze([
  'advanceTurn', 'assignReplacementRole', 'confirmSetup', 'createSession',
  'joinSession', 'jumpShip', 'moveShipToLocation', 'resumeSession',
  'runMaintenance', 'setCandidatePlanCheckpoint', 'resolvePendingScoutRequest',
]);
const WOLF_ATTACK_DECLARATION_TYPE_ADDITIONS = Object.freeze([
  '  /** Stable identity for this declared attack; range actions bind to it. */\n  readonly attackId: string;\n',
  '  /** Hidden Maliades effects committed against this exact attack. */\n  readonly maliadesRangeEffects: unknown;\n',
]);
const MALIADE_REPAIR_STALE_REPLY_TYPE = `export interface MaliadesRepairCallableStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly craftId: 'maliades';
  readonly expectedHostShipId: string;
  readonly damageToRepair: number;
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedRevision: number;
  readonly currentRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
}
`;
const MALIADE_CALLABLE_MARKERS = Object.freeze([
  // One file owns three exported Functions, so path-only selection is too broad.
  // The content-aware selector below deploys one isolated export and rejects mixed diffs.
  ['resolveMaliadesMedium', 'export const resolveMaliadesMedium = onCall(CALLABLE_RUNTIME_OPTIONS, async request =>\n'],
  ['resolveMaliadesShort', 'export const resolveMaliadesShort = onCall(CALLABLE_RUNTIME_OPTIONS, async request =>\n'],
  ['repairMaliades', 'export const repairMaliades = onCall(CALLABLE_RUNTIME_OPTIONS, async request => {'],
]);
const MALIADE_REPAIR_REQUEST_ADDITIONS = Object.freeze([
  [
    `function exactCommandRequest(raw: unknown, kind: 'medium' | 'short' | 'repair'): Readonly<{\n  sessionId: string; requestId: string; expectedCycle: number; expectedRevision: number; expectedControlRevision?: number;\n  choices?: readonly MaliadesMediumChoice[]; targetIds?: readonly string[]; expectedHostShipId?: string;\n  damageToRepair?: number;\n}> {`,
    `function exactCommandRequest(raw: unknown, kind: 'medium' | 'short' | 'repair'): Readonly<{\n  sessionId: string; requestId: string; expectedCycle: number; expectedRevision: number;\n  choices?: readonly MaliadesMediumChoice[]; targetIds?: readonly string[]; expectedHostShipId?: string;\n  damageToRepair?: number;\n}> {`,
  ],
  [
    `  const allowed = kind === 'medium'\n    ? ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'choices']\n    : kind === 'short'\n      ? ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'targetIds']\n      : ['sessionId', 'requestId', 'expectedCycle', 'expectedControlRevision', 'expectedRevision', 'expectedHostShipId', 'damageToRepair'];`,
    `  const allowed = kind === 'medium'\n    ? ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'choices']\n    : kind === 'short'\n      ? ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'targetIds']\n      : ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'expectedHostShipId', 'damageToRepair'];`,
  ],
  [
    `  if (!Number.isSafeInteger(raw.expectedControlRevision) || (raw.expectedControlRevision as number) < 0 ||\n      typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId) ||\n      !Number.isSafeInteger(raw.damageToRepair) || (raw.damageToRepair as number) < 1 ||\n      (raw.damageToRepair as number) > 3) {\n    throw new HttpsError('invalid-argument', 'Invalid Maliades repair request.');\n  }`,
    `  if (typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId) ||\n      !Number.isSafeInteger(raw.damageToRepair) || (raw.damageToRepair as number) < 1 ||\n      (raw.damageToRepair as number) > 3) {\n    throw new HttpsError('invalid-argument', 'Invalid Maliades repair request.');\n  }`,
  ],
  [
    `  return {\n    sessionId: raw.sessionId, requestId: raw.requestId,\n    expectedCycle: raw.expectedCycle as number, expectedRevision: raw.expectedRevision as number,\n    expectedControlRevision: raw.expectedControlRevision as number,\n    expectedHostShipId: raw.expectedHostShipId, damageToRepair: raw.damageToRepair as number,\n  };`,
    `  return {\n    sessionId: raw.sessionId, requestId: raw.requestId,\n    expectedCycle: raw.expectedCycle as number, expectedRevision: raw.expectedRevision as number,\n    expectedHostShipId: raw.expectedHostShipId, damageToRepair: raw.damageToRepair as number,\n  };`,
  ],
]);

// Exact PC06 source transitions include factory wiring and transitive helpers.
// This owner inventory selects deployment targets; it does not grant review approval.
const PC06_DEPLOYMENT_CONSUMERS = JSON.parse(readFileSync(
  new URL('./pc06-deployment-consumers.json', import.meta.url), 'utf8',
));

function pc06TransitionConsumers(file, previous, current) {
  const transition = file === 'functions/src/index.ts'
    ? PC06_DEPLOYMENT_CONSUMERS.index : PC06_DEPLOYMENT_CONSUMERS.modules[file];
  const digest = source => createHash('sha256').update(source).digest('hex');
  if (!transition || digest(previous) !== transition.before) return null;
  if (digest(current) !== transition.after) {
    throw new Error(`Cannot safely map PC06 ${file} outside its exact source consumer audit.`);
  }
  return [...transition.consumers];
}

// Keep this dependency map explicit. When a shared helper changes, deploy every
// callable known to consume it; unknown production modules fail closed below.
const CALLABLES_BY_CHANGED_MODULE = Object.freeze({
  // PC05 source audit includes transitive helper consumers and re-exported callables.
  'functions/src/gameSetup.ts': [
    'transferBaseCapybaraCargo', 'readPrivateScoutResult', 'listPendingScoutRequests',
    'resolvePendingScoutRequest', 'createSession', 'confirmSetup',
    'setFacilitatorResponsibility', 'startGame', 'transferShuttleControlCommand',
    'dealPrivateInitialCards', 'openPrivateMissionDiscards', 'setShipPreference',
    'assignRole', 'releaseRole', 'setReplacementEligibility',
    'assignReplacementRole', 'setFacilitatorCensusNote', 'calculateArrestPosse',
    'deliverWolfCultIntelligence', 'transitionCrisis', 'setDiseaseQuarantine',
    'admitVoyage33', 'recordZealotryResponse', 'recordCivilUnrestResolution',
    'submitCivilUnrestGrievance', 'authorArbourVision', 'authorFacilitatorRuleCall',
    'setCandidatePlanCheckpoint', 'assignLoyalty', 'joinSession',
    'resumeSession', 'claimGmInstance', 'setGmShipConsoleWriteGrant',
    'listGmInstances', 'kickGmInstance', 'releaseGmInstance',
    'kickPlayer', 'triggerDradisContact', 'setPressEnabled',
    'moveShipToLocation', 'jumpShip', 'setShipConsoleLock',
    'setGmControlsLocked', 'setDebriefMode', 'advanceTurn',
    'parkShuttlesAtAirspaceClosure', 'startSinglePlayerDemo', 'replayTurnStartAnnouncement',
    'extendAirspaceWindow', 'setEmergencyTimerPaused', 'setWolfAttackWindow',
    'stageWolfAttackPreparation', 'declareWolfAttack', 'advanceWolfAttackToLongRange',
    'getPdfEscortWingLaunch', 'launchPdfEscortWing', 'startWolfConsoleVisit',
    'resolveWolfConsoleSabotage', 'submitWolfSupplySabotage', 'acknowledgeWolfHackingAlert',
    'submitWolfHomingBeacon', 'submitWolfIntelligence', 'investigateAsIntelligenceAgent',
    'unlockPressAirspace', 'popShipConfetti', 'refreshPresence',
    'disconnectFromSession', 'expireStalePlayers', 'releaseSeat',
    'elevateToGm', 'scavengeDestroyedShipStores', 'adjustShipResource',
    'adjustShipUnrest', 'consentCommissarPurge', 'applyCommissarPurge',
    'getCommissarPurgeAuthority', 'dismissUnrestAlert', 'resolveShipMutiny',
    'addShipDamage', 'adjustShipPopulation', 'applyShipCounterSteps',
    'setFighterWingCount', 'buildFighter', 'dismissPopulationAlert',
    'runHighwallMining', 'requestScout', 'rollHummingbirdHarvest',
    'allocateHummingbirdHarvest', 'setSmallShipDocking', 'runSmallShipMaintenance',
    'runVoyage33Maintenance', 'runVulcanAdditionalLabour', 'runMaintenance',
    'drawVipCard', 'transferVipCard', 'rerollVipUnrest',
    'publishAdmiralDirectiveCommand', 'recordPresidentActionCommand', 'updatePoliticalCapital',
    'setFleetRedAlert', 'repairAllShipDamage', 'rollbackMaintenance',
    'listUnresolvedJumpFailures', 'adjudicateFailedJump',
  ],
  'functions/src/wolfAssignment.ts': [
    'startGame',
  ],
  'functions/src/maintenance.ts': [
    'startGame', 'rechargeHostConsoleFromShuttle', 'joinSession', 'resumeSession',
    'getAegisCommandAndControl', 'applyAegisCommandAndControl', 'getDioneMaliadesLaunch', 'launchDioneMaliades',
    'getPdfEscortWingLaunch', 'launchPdfEscortWing', 'buildFighter', 'requestScout',
    'runVulcanAdditionalLabour', 'runMaintenance', 'drawVipCard', 'rerollVipUnrest',
    'rollbackMaintenance',
  ],
  'functions/src/shipPopulation.ts': [
    'createSession', 'confirmSetup', 'startGame',
    'rechargeHostConsoleFromShuttle', 'evacuateShuttleSurvivorsCommand', 'joinSession',
    'resumeSession', 'advanceTurn', 'startSinglePlayerDemo',
    'applyCommissarPurge', 'addShipDamage', 'adjustShipPopulation',
    'applyShipCounterSteps', 'runVulcanAdditionalLabour', 'runMaintenance',
    'jumpShip', 'adjudicateFailedJump',
  ],
  'functions/src/mutiny.ts': [
    'joinSession', 'resumeSession', 'moveShipToLocation',
    'jumpShip', 'setShipConsoleLock', 'getAegisCommandAndControl',
    'applyAegisCommandAndControl', 'getDioneMaliadesLaunch', 'launchDioneMaliades',
    'getPdfEscortWingLaunch', 'launchPdfEscortWing', 'unlockPressAirspace',
    'adjustShipResource', 'adjustShipUnrest', 'dismissUnrestAlert',
    'resolveShipMutiny', 'addShipDamage', 'adjustShipPopulation',
    'applyShipCounterSteps', 'setFighterWingCount', 'buildFighter',
    'dismissPopulationAlert', 'runHighwallMining', 'requestScout',
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest', 'setSmallShipDocking',
    'runSmallShipMaintenance', 'runVoyage33Maintenance', 'runMaintenance',
    'drawVipCard', 'transferVipCard', 'rerollVipUnrest',
    'publishAdmiralDirectiveCommand', 'recordPresidentActionCommand', 'updatePoliticalCapital',
    'setFleetRedAlert', 'repairAllShipDamage', 'rollbackMaintenance',
    'repairGorgoneionWithDrones', 'repairWarriorWithDrones', 'transferBaseCapybaraCargo',
    'startGame', 'assignReplacementRole', 'advanceTurn',
    'startSinglePlayerDemo', 'setWolfAttackWindow', 'declareWolfAttack',
    'runVulcanAdditionalLabour', 'adjudicateFailedJump',
  ],
  'functions/src/voyage33Maintenance.ts': [
    'startGame', 'joinSession', 'resumeSession',
    'advanceTurn', 'startSinglePlayerDemo', 'addShipDamage',
    'runVoyage33Maintenance', 'runMaintenance', 'resolveShipMutiny',
  ],
  'functions/src/actionAudit.ts': [
    'scavengeDestroyedShipStores', 'adjustShipResource', 'adjustShipUnrest',
    'adjustShipPopulation', 'applyShipCounterSteps',
    'runHighwallMining', 'authorFacilitatorRuleCall', 'setFighterWingCount',
    'repairAllShipDamage', 'addShipDamage',
  ],
  'functions/src/pressLogEvent.ts': [
    'evacuateShuttleSurvivorsCommand', 'applyCommissarPurge',
    'addShipDamage', 'adjustShipPopulation', 'applyShipCounterSteps',
    'runSmallShipMaintenance', 'runVoyage33Maintenance', 'runMaintenance',
    'recordPresidentActionCommand',
  ],
  'functions/src/candidateRevealProjection.ts': CANDIDATE_REVEAL_CALLABLES,
  'functions/src/callableRateLimitFirestore.ts': [
    'resumeSession', 'getSessionPresence', 'listGmInstances', 'rollDice',
    'confirmSetup', 'startGame', 'declareWolfAttack', 'runMaintenance',
  ],
  'functions/src/shuttleMovementConflict.ts': [
    'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit', 'completeShuttleArrival',
  ],
  'functions/src/shuttleDepartureCallable.ts': ['requestShuttleDeparture'],
  'functions/src/shuttleTransitCallable.ts': ['beginShuttleTransit', 'retargetShuttleTransit'],
  'functions/src/shuttleArrivalCallable.ts': ['completeShuttleArrival'],
  'functions/src/shipDamage.ts': [
    'repairConsolesFromAlly', 'repairGorgoneionWithDrones', 'repairWarriorWithDrones',
    'transferBaseCapybaraCargo', 'readEndeavourResearchWorkspace', 'repairMaliades',
    'createSession', 'startGame', 'rechargeHostConsoleFromShuttle',
    'repairConsolesFromBlacksmith', 'repairConsolesFromPhilia', 'repairConsolesFromMacaw',
    'repairConsolesFromChacau', 'upgradeEndeavourFieldTargets', 'joinSession',
    'resumeSession', 'moveShipToLocation', 'jumpShip',
    'adjudicateFailedJump', 'advanceTurn', 'startSinglePlayerDemo',
    'getAegisCommandAndControl', 'applyAegisCommandAndControl', 'getDioneMaliadesLaunch',
    'launchDioneMaliades', 'getPdfEscortWingLaunch', 'launchPdfEscortWing',
    'startWolfConsoleVisit', 'resolveWolfConsoleSabotage', 'submitWolfSupplySabotage',
    'acknowledgeWolfHackingAlert', 'fleeDestroyedShip', 'scavengeDestroyedShipStores',
    'addShipDamage', 'buildFighter', 'runVulcanAdditionalLabour',
    'runMaintenance', 'drawVipCard', 'repairAllShipDamage',
  ],
  'functions/src/jumpDrive.ts': [
    'jumpShip', 'adjudicateFailedJump',
  ],
  'functions/src/endeavourFieldUpgrades.ts': ['upgradeEndeavourFieldTargets'],
  'functions/src/endeavourResearch.ts': [
    'advanceEndeavourResearchTrack', 'readEndeavourResearchWorkspace', 'upgradeEndeavourFieldTargets',
  ],
  'functions/src/endeavourResearchCadence.ts': [
    'advanceEndeavourResearchTrack', 'readEndeavourResearchWorkspace',
  ],
  'functions/src/endeavourResearchWriter.ts': [
    'advanceEndeavourResearchTrack', 'readEndeavourResearchWorkspace',
  ],
  'functions/src/endeavourEcmDeviceWriter.ts': [
    'activateEndeavourEcmDevice', 'readEndeavourEcmDeviceWorkspace',
  ],
  'functions/src/scoutRequestCadence.ts': ['requestScout'],
  'functions/src/scoutResolutionPlan.ts': ['resolvePendingScoutRequest'],
  'functions/src/scoutResultCallable.ts': [
    'resolvePendingScoutRequest', 'readPrivateScoutResult', 'listPendingScoutRequests',
    'listMyScoutReports', 'readMyScoutDiscoveryNote',
  ],
  'functions/src/highwallMining.ts': ['runHighwallMining'],
  'functions/src/hummingbirdHarvestStaleReply.ts': [
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest',
  ],
  'functions/src/arrestPosse.ts': ['calculateArrestPosse'],
  'functions/src/extraShipAdmission.ts': [
    'assignReplacementRole', 'joinSession', 'resumeSession',
    'repairGorgoneionWithDrones', 'repairWarriorWithDrones', 'transferBaseCapybaraCargo',
    'resolveShipMutiny',
  ],
  'functions/src/shuttleDocking.ts': [
    'transferShuttleControlCommand',
  ],
  'functions/src/wolfActionAuthorization.ts': [
    'startWolfConsoleVisit', 'resolveWolfConsoleSabotage', 'submitWolfSupplySabotage',
    'submitWolfHomingBeacon', 'submitWolfIntelligence',
  ],
  'functions/src/replacementRoles.ts': [
    'assignReplacementRole', 'transferBaseCapybaraCargo', 'repairGorgoneionWithDrones',
    'repairWarriorWithDrones', 'readMyScoutDiscoveryNote', 'resolvePendingScoutRequest',
    'confirmSetup', 'startGame', 'transferShuttleControlCommand',
    'setReplacementEligibility', 'submitCivilUnrestGrievance', 'joinSession',
    'resumeSession', 'moveShipToLocation', 'jumpShip',
    'setShipConsoleLock', 'advanceTurn', 'startSinglePlayerDemo',
    'unlockPressAirspace', 'popShipConfetti', 'adjustShipResource',
    'adjustShipUnrest', 'consentCommissarPurge', 'applyCommissarPurge',
    'getCommissarPurgeAuthority', 'dismissUnrestAlert', 'resolveShipMutiny',
    'addShipDamage', 'adjustShipPopulation', 'applyShipCounterSteps',
    'setFighterWingCount', 'buildFighter', 'dismissPopulationAlert',
    'requestScout', 'rollHummingbirdHarvest', 'allocateHummingbirdHarvest',
    'setSmallShipDocking', 'runSmallShipMaintenance', 'runVoyage33Maintenance',
    'runMaintenance', 'drawVipCard', 'transferVipCard',
    'rerollVipUnrest', 'publishAdmiralDirectiveCommand', 'recordPresidentActionCommand',
    'updatePoliticalCapital', 'setFleetRedAlert', 'repairAllShipDamage',
    'rollbackMaintenance', 'adjudicateFailedJump',
  ],
  'functions/src/baseCapybaraCargoTransfer.ts': ['transferBaseCapybaraCargo'],
  'functions/src/baseCapybaraCargoTransferCallable.ts': ['transferBaseCapybaraCargo'],
  'functions/src/boaRecyclingCallable.ts': ['recycleWithBoa'],
  'functions/src/allyRepairCallable.ts': ['repairConsolesFromAlly'],
  'functions/src/macawRepair.ts': ['repairConsolesFromMacaw'],
  'functions/src/macawRepairCallable.ts': ['repairConsolesFromMacaw'],
  'functions/src/gorgoneionRepairDrones.ts': ['repairGorgoneionWithDrones'],
  'functions/src/gorgoneionRepairDronesCallable.ts': ['repairGorgoneionWithDrones'],
  'functions/src/warriorRepairDrones.ts': ['repairWarriorWithDrones'],
  'functions/src/warriorRepairDronesCallable.ts': ['repairWarriorWithDrones'],
  'functions/src/maliadesState.ts': [
    'declareWolfAttack', 'getDioneMaliadesLaunch', 'launchDioneMaliades', 'repairMaliades',
  ],
  'functions/src/pdfEscortWingProjection.ts': ['declareWolfAttack', 'launchPdfEscortWing'],
  'functions/src/pdfEscortWingState.ts': [
    'declareWolfAttack', 'getPdfEscortWingLaunch', 'launchPdfEscortWing',
  ],
  'functions/src/awayMissionCards.ts': ['dealPrivateInitialCards'],
  // This pure follow-on domain candidate has no deployed callable consumer yet.
  'functions/src/missionLifecycle.ts': [],
  // Small-craft state and mutiny guards are shared by these runtime paths.
  // Include transitive consumers; type-only and test imports are excluded.
  'functions/src/smallShip.ts': [
    'runSmallShipMaintenance', 'repairGorgoneionWithDrones', 'repairWarriorWithDrones',
    'transferBaseCapybaraCargo', 'startGame', 'assignReplacementRole',
    'joinSession', 'resumeSession', 'advanceTurn',
    'startSinglePlayerDemo', 'setWolfAttackWindow', 'declareWolfAttack',
    'resolveShipMutiny', 'addShipDamage', 'setSmallShipDocking',
    'runVoyage33Maintenance', 'runVulcanAdditionalLabour', 'runMaintenance',
    'jumpShip', 'adjudicateFailedJump',
  ],
  'functions/src/wolfCommandAndControl.ts': [
    'applyAegisCommandAndControl', 'applyWolfCommanderTargetRerolls',
    'finishWolfCommanderTargetingRerolls', 'getAegisCommandAndControl', 'getWolfCommanderTargeting',
  ],
  'functions/src/wolfCommanderRerolls.ts': [
    'applyAegisCommandAndControl', 'applyWolfCommanderTargetRerolls',
    'finishWolfCommanderTargetingRerolls', 'getAegisCommandAndControl', 'getWolfCommanderTargeting',
  ],
});
const VERIFIED_LIVE_FUNCTION_BASELINES = Object.freeze([{
  sha: '2e413cfb58b56300b6003a57d031686cc776caa8',
  callables: [
    'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit', 'completeShuttleArrival',
  ],
}]);

function normalizeFile(file) {
  return String(file).trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function isDocumentation(file) {
  return /(?:^|\/)(?:README(?:\..*)?|.*\.md)$/i.test(file);
}

function isTestFile(file) {
  return /(?:^|\/)(?:__tests__|tests)(?:\/|$)/i.test(file) ||
    /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i.test(file);
}

function isToolingOnly(file) {
  return TOOLING_ONLY_FILES.has(file) ||
    file.startsWith('.githooks/') ||
    file.startsWith('.github/') ||
    file.startsWith('scripts/') ||
    /(?:^|\/)(?:eslint\.config\.|\.eslintrc|vitest\.config\.)/.test(file);
}

function addAllTargets(targets) {
  for (const target of ALL_DEPLOYMENT_TARGETS) targets.add(target);
}

export function classifyChangedFiles(files, {
  manual = false,
  versionMetadataOnly = false,
} = {}) {
  if (manual) {
    return {
      targets: [...ALL_DEPLOYMENT_TARGETS],
      unknownFiles: [],
      ignoredFiles: [],
      riskGates: classifyRiskGates([], { manual: true }),
    };
  }

  const targets = new Set();
  const unknownFiles = [];
  const ignoredFiles = [];
  const normalizedFiles = [...new Set(files.map(normalizeFile).filter(Boolean))].sort();

  for (const file of normalizedFiles) {
    if (isDocumentation(file) || isTestFile(file) || isToolingOnly(file) ||
        (file.startsWith('evidence/') && file.toLowerCase().endsWith('.png'))) {
      ignoredFiles.push(file);
      continue;
    }
    if (file === 'firebase.json' || file === '.firebaserc') {
      addAllTargets(targets);
    } else if (FIRESTORE_FILES.has(file)) {
      targets.add('firestore');
    } else if (file.startsWith('functions/')) {
      targets.add('functions');
    } else if (
      WEB_FILES.has(file) ||
      file.startsWith('src/') ||
      file.startsWith('public/') ||
      /^tsconfig[^/]*\.json$/i.test(file) ||
      /^vite\.config\.[^/]+$/i.test(file)
    ) {
      targets.add('hosting');
    } else {
      unknownFiles.push(file);
      addAllTargets(targets);
    }
  }

  return {
    targets: ALL_DEPLOYMENT_TARGETS.filter((target) => targets.has(target)),
    unknownFiles,
    ignoredFiles,
    riskGates: classifyRiskGates(normalizedFiles, { manual, versionMetadataOnly }),
  };
}

function jsonAtRevision(revision, file, cwd = process.cwd()) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    }));
  } catch {
    return undefined;
  }
}

function versionMetadataOnlyForRange(before, after, files, cwd = process.cwd()) {
  if (!files.includes('package.json') || !files.includes('package-lock.json')) return false;
  return isVersionMetadataOnlyPackageChange({
    beforePackage: jsonAtRevision(before, 'package.json', cwd),
    afterPackage: jsonAtRevision(after, 'package.json', cwd),
    beforeLockfile: jsonAtRevision(before, 'package-lock.json', cwd),
    afterLockfile: jsonAtRevision(after, 'package-lock.json', cwd),
  });
}

function revisionIsAncestor(before, after, cwd = process.cwd()) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', before, after], {
      stdio: 'ignore', cwd,
    });
    return true;
  } catch {
    return false;
  }
}

export function classifyDeploymentRange({
  before,
  verificationBefore = before,
  after,
  currentMainTip = after,
  manual = false,
  changedFiles,
  verificationChangedFiles,
  versionMetadataOnly,
  verificationVersionMetadataOnly,
  cwd = process.cwd(),
  isAncestor = revisionIsAncestor,
} = {}) {
  const currentTip = Boolean(after && currentMainTip && after === currentMainTip);
  if (!currentTip) {
    return {
      targets: [],
      unknownFiles: [],
      ignoredFiles: [],
      currentTip: false,
      staleRun: true,
      baselineAncestry: false,
      verificationBaselineAncestry: false,
    };
  }
  if (manual) {
    const classified = classifyChangedFiles([], { manual: true });
    return {
      ...classified,
      deployOnly: classified.targets.join(','),
      currentTip: true,
      staleRun: false,
      baselineAncestry: true,
      verificationBaselineAncestry: true,
    };
  }
  if (!before) {
    const classified = classifyChangedFiles(['__missing_diff_revision__']);
    return {
      ...classified,
      deployOnly: deploymentSelector({ targets: classified.targets }),
      currentTip: true,
      staleRun: false,
      baselineAncestry: false,
      verificationBaselineAncestry: false,
    };
  }
  const baselineAncestry = isAncestor(before, after);
  if (!baselineAncestry) {
    return {
      ...classifyChangedFiles(['__unreadable_diff__']),
      currentTip: true,
      staleRun: false,
      baselineAncestry: false,
      verificationBaselineAncestry: false,
    };
  }
  const files = changedFiles ?? filesFromGit(before, after, cwd);
  const metadataOnly = versionMetadataOnly ?? versionMetadataOnlyForRange(before, after, files, cwd);
  const classification = classifyChangedFiles(files, { versionMetadataOnly: metadataOnly });
  const verificationBaselineAncestry = Boolean(
    verificationBefore && isAncestor(verificationBefore, after),
  );
  if (verificationBaselineAncestry) {
    const verificationFiles = verificationChangedFiles ?? (
      verificationBefore === before ? files : filesFromGit(verificationBefore, after, cwd)
    );
    const verificationMetadataOnly = verificationVersionMetadataOnly ?? versionMetadataOnlyForRange(
      verificationBefore,
      after,
      verificationFiles,
      cwd,
    );
    classification.riskGates = classifyRiskGates(verificationFiles, {
      versionMetadataOnly: verificationMetadataOnly,
    });
  } else {
    classification.riskGates = classifyRiskGates(['__unknown_diff__']);
  }
  // Keep the coarse release gate at Hosting + Functions for callable releases;
  // the Firebase selector below narrows the actual Function mutations.
  if (classification.targets.includes('functions') && !classification.targets.includes('hosting')) {
    classification.targets = ['hosting', ...classification.targets];
  }
  const deployOnly = deploymentSelector({ before, after, files, targets: classification.targets, cwd });
  return {
    ...classification,
    deployOnly,
    currentTip: true,
    staleRun: false,
    baselineAncestry: true,
    verificationBaselineAncestry,
  };
}

function functionExports(source) {
  const lines = source.split('\n');
  const declarations = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^export\s+const\s+([A-Za-z_$][\w$]*)\s*=/.exec(lines[index]);
    if (match) declarations.push({ name: match[1], line: index });
  }
  const exports = new Map();
  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index];
    let end = declarations[index + 1]?.line ?? lines.length;
    for (let line = declaration.line + 1; line < end; line += 1) {
      if (/^\}\);\s*$/.test(lines[line])) {
        end = line + 1;
        break;
      }
    }
    const block = lines.slice(declaration.line, end).join('\n');
    if (/=\s*onCall\s*</.test(block) || /=\s*onCall\s*\(/.test(block) || /=\s*onRequest\s*</.test(block) || /=\s*onRequest\s*\(/.test(block) || /=\s*onSchedule\s*</.test(block) || /=\s*onSchedule\s*\(/.test(block)) {
      exports.set(declaration.name, block);
    }
  }
  return exports;
}

// PC05 changes index-local authority helpers used by unchanged callable bodies.
// This bounded source receipt supplements direct callable-body selection and
// must be reconciled if the candidate changes before its first deployment.
const PC05_INDEX_HELPER_TRANSITION = Object.freeze({
  before: 'c3e2411d0784be6acdd7402325475bcbd78d410984e86261476b0010730eed64',
  after: '51eec3ab6fe1a97c7df6fddcda474ede2a9abfaacac2581a52866e5fc12d00d0',
  consumers: [
    'createSession', 'confirmSetup', 'transferShuttleControlCommand',
    'transferShuttleCargoCommand', 'rechargeHostConsoleFromShuttle', 'repairConsolesFromBlacksmith',
    'repairConsolesFromPhilia', 'repairConsolesFromMacaw', 'recycleWithBoa',
    'repairConsolesFromChacau', 'upgradeEndeavourFieldTargets', 'evacuateShuttleSurvivorsCommand',
    'requestShuttleDeparture', 'beginShuttleTransit', 'retargetShuttleTransit',
    'admitVoyage33', 'joinSession', 'resumeSession',
    'moveShipToLocation', 'jumpShip', 'listUnresolvedJumpFailures',
    'adjudicateFailedJump', 'setShipConsoleLock', 'getAegisCommandAndControl',
    'applyAegisCommandAndControl', 'getDioneMaliadesLaunch', 'launchDioneMaliades',
    'getPdfEscortWingLaunch', 'launchPdfEscortWing', 'unlockPressAirspace',
    'popShipConfetti', 'scavengeDestroyedShipStores', 'adjustShipResource',
    'adjustShipUnrest', 'consentCommissarPurge', 'applyCommissarPurge',
    'getCommissarPurgeAuthority', 'dismissUnrestAlert', 'resolveShipMutiny',
    'addShipDamage', 'adjustShipPopulation', 'applyShipCounterSteps',
    'setFighterWingCount', 'buildFighter', 'dismissPopulationAlert',
    'runHighwallMining', 'requestScout', 'rollHummingbirdHarvest',
    'allocateHummingbirdHarvest', 'setSmallShipDocking', 'runSmallShipMaintenance',
    'runVoyage33Maintenance', 'runVulcanAdditionalLabour', 'runMaintenance',
    'drawVipCard', 'transferVipCard', 'rerollVipUnrest',
    'publishAdmiralDirectiveCommand', 'recordPresidentActionCommand', 'updatePoliticalCapital',
    'setFleetRedAlert', 'publishPressDispatch', 'dismissPressDispatch',
    'repairAllShipDamage', 'rollbackMaintenance',
    'getWolfCommanderTargeting', 'applyWolfCommanderTargetRerolls', 'finishWolfCommanderTargetingRerolls',
    'startGame', 'setReplacementEligibility', 'assignReplacementRole', 'setFacilitatorCensusNote',
    'calculateArrestPosse', 'deliverWolfCultIntelligence', 'transitionCrisis', 'setDiseaseQuarantine',
    'recordZealotryResponse', 'recordCivilUnrestResolution', 'submitCivilUnrestGrievance',
    'authorArbourVision', 'authorFacilitatorRuleCall', 'setCandidatePlanCheckpoint', 'revealAndroidProof',
    'triggerDradisContact', 'setPressEnabled', 'setGmControlsLocked', 'advanceTurn',
    'startSinglePlayerDemo', 'replayTurnStartAnnouncement', 'beginOpenAirspacePhase',
    'extendAirspaceWindow', 'setEmergencyTimerPaused', 'declareWolfAttack',
    'advanceWolfAttackToLongRange', 'startWolfConsoleVisit', 'resolveWolfConsoleSabotage',
    'submitWolfSupplySabotage', 'submitWolfHomingBeacon', 'submitWolfIntelligence',
    'investigateAsIntelligenceAgent', 'fleeDestroyedShip', 'rollDice',
  ],
});

function changedIndexCallables(before, after, cwd, sourceAtRevision = null) {
  const readAt = (revision) => {
    if (sourceAtRevision) return sourceAtRevision(revision, 'functions/src/index.ts');
    try {
      return execFileSync('git', ['show', `${revision}:functions/src/index.ts`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine callable changes at ${revision}:functions/src/index.ts.`);
    }
  };
  const previousSource = readAt(before);
  const currentSource = readAt(after);
  const previous = functionExports(previousSource);
  const current = functionExports(currentSource);
  const names = new Set([...previous.keys(), ...current.keys()]);
  const changed = [...names].filter((name) => previous.get(name) !== current.get(name));
  if (changed.includes('repairConsolesFromPhilia')) {
    if (changed.length !== 1 || !previous.has('repairConsolesFromPhilia') ||
        !current.has('repairConsolesFromPhilia') ||
        indexSourceOutsideCallableBlocks(previousSource, previous) !==
          indexSourceOutsideCallableBlocks(currentSource, current)) {
      throw new Error(
        'Cannot safely map a Philia repair index change mixed with another callable or untracked source edit.',
      );
    }
  }
  if (changed.includes('repairConsolesFromBlacksmith')) {
    if (changed.length !== 1 || !previous.has('repairConsolesFromBlacksmith') ||
        !current.has('repairConsolesFromBlacksmith') ||
        indexSourceOutsideCallableBlocks(previousSource, previous) !==
          indexSourceOutsideCallableBlocks(currentSource, current)) {
      throw new Error(
        'Cannot safely map a Blacksmith repair index change mixed with another callable or untracked source edit.',
      );
    }
  }
  if (changed.includes('upgradeEndeavourFieldTargets')) {
    if (changed.length !== 1 || !current.has('upgradeEndeavourFieldTargets') ||
        indexSourceOutsideCallableBlocks(previousSource, previous, 'upgradeEndeavourFieldTargets') !==
          indexSourceOutsideCallableBlocks(currentSource, current, 'upgradeEndeavourFieldTargets')) {
      throw new Error(
        'Cannot safely map an Endeavour field-upgrade index change mixed with another callable or untracked source edit.',
      );
    }
  }
  const digest = (source) => createHash('sha256').update(source).digest('hex');
  if (previousSource !== currentSource && digest(previousSource) === PC05_INDEX_HELPER_TRANSITION.before) {
    if (digest(currentSource) !== PC05_INDEX_HELPER_TRANSITION.after) {
      throw new Error('Cannot safely map PC05 shared index changes outside the audited candidate.');
    }
    return [...new Set([...changed, ...PC05_INDEX_HELPER_TRANSITION.consumers])];
  }
  const pc06Consumers = pc06TransitionConsumers('functions/src/index.ts', previousSource, currentSource);
  if (pc06Consumers) return [...new Set([...changed, ...pc06Consumers])];
  return changed;
}

function indexSourceOutsideCallableBlocks(source, callables, omittedCallable = null) {
  let remainder = source;
  for (const [name, block] of callables) {
    const count = remainder.split(block).length - 1;
    if (count !== 1) {
      throw new Error(`Cannot safely isolate the ${name} export from the Functions entrypoint.`);
    }
    remainder = name === omittedCallable
      ? remainder.replace(`${block}\n`, '')
      : remainder.replace(block, `__FUNCTION_EXPORT_${name}__`);
  }
  return remainder;
}

function wolfAttackDeclarationTypeImpacts(before, after, cwd, sourceAtRevision = null) {
  const file = 'functions/src/wolfAttackDeclaration.ts';
  const readAt = (revision) => {
    if (sourceAtRevision) {
      const source = sourceAtRevision(revision, file);
      if (typeof source === 'string') return source;
      throw new Error(`Cannot safely determine declaration type changes at ${revision}:${file}.`);
    }
    try {
      return execFileSync('git', ['show', `${revision}:${file}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine declaration type changes at ${revision}:${file}.`);
    }
  };
  const previous = readAt(before);
  let currentRest = readAt(after);
  for (const addition of WOLF_ATTACK_DECLARATION_TYPE_ADDITIONS) {
    const beforeCount = previous.split(addition).length - 1;
    const afterCount = currentRest.split(addition).length - 1;
    if (beforeCount !== 0 || afterCount !== 1) {
      throw new Error('Cannot safely map wolf attack declaration changes outside the exact reviewed type-only attack-state additions.');
    }
    currentRest = currentRest.replace(addition, '');
  }
  if (currentRest !== previous) {
    throw new Error('Cannot safely map wolf attack declaration changes outside the exact reviewed type-only attack-state additions.');
  }
  return ['declareWolfAttack'];
}

const ENDEAVOUR_EVENT_FIELD_ENTRY = "  'endeavour-field-upgrade': ['shuttleId', 'targets'],\n";
const ENDEAVOUR_ENVELOPE_FIELD_ENTRY = "  'endeavour-field-upgrade': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n    field !== 'actorUid' && field !== 'actorRoleId'),\n";
const GORGONEION_EVENT_FIELD_ENTRY =
  "  'gorgoneion-repair-drones': ['smallShipId', 'hostShipId', 'systemId', 'materialsSpent'],\n";
const GORGONEION_ENVELOPE_FIELD_ENTRY =
  "  'gorgoneion-repair-drones': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n    field !== 'actorUid' && field !== 'actorRoleId'),\n";
const WARRIOR_EVENT_FIELD_ENTRY =
  "  'warrior-repair-drones': ['smallShipId', 'hostShipId', 'systemIds', 'materialsSpent'],\n";
const WARRIOR_ENVELOPE_FIELD_ENTRY =
  "  'warrior-repair-drones': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n    field !== 'actorUid' && field !== 'actorRoleId'),\n";
const MALIADE_LAUNCH_EVENT_FIELD_ENTRY = "  'maliades-launched': ['craftId', 'status'],\n";
const MALIADE_LAUNCH_ENVELOPE_FIELD_ENTRY =
  "  'maliades-launched': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n    field !== 'actorUid' && field !== 'actorRoleId'),\n";
const MALIADE_MEDIUM_EVENT_FIELD_ENTRY = "  'maliades-medium': ['craftId', 'cycle', 'revision'],\n";
const MALIADE_RANGE_PRIVACY_COMMENT =
  '  // Range outcomes remain private until an audience-safe attack projection exists.\n';
const MALIADE_MEDIUM_ENVELOPE_FIELD_ENTRY =
  "  'maliades-medium': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n    field !== 'actorUid' && field !== 'actorRoleId'),\n";
const MALIADE_SHORT_EVENT_FIELD_ENTRY = "  'maliades-short': ['craftId', 'cycle', 'revision'],\n";
const MALIADE_SHORT_ENVELOPE_FIELD_ENTRY =
  "  'maliades-short': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n    field !== 'actorUid' && field !== 'actorRoleId'),\n";
const MALIADE_REPAIR_EVENT_FIELD_ENTRY =
  "  'maliades-repair': ['craftId', 'hostShipId', 'damageRepaired', 'materialsSpent', 'damage', 'destroyed'],\n";
const MALIADE_REPAIR_ENVELOPE_FIELD_ENTRY =
  "  'maliades-repair': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n    field !== 'actorUid' && field !== 'actorRoleId'),\n";
const EVENT_REDACTION_ADDITIONS = Object.freeze([
  {
    entries: ["  'ship-jump': ['shipId', 'outcome', 'length', 'failureRoll', 'failureThreshold', 'fuelSpent', 'damageCount', 'emergency'],\n"],
    callables: ['jumpShip', 'adjudicateFailedJump'],
  },
  {
    entries: [ENDEAVOUR_EVENT_FIELD_ENTRY, ENDEAVOUR_ENVELOPE_FIELD_ENTRY],
    callables: ['upgradeEndeavourFieldTargets'],
  },
  {
    entries: [GORGONEION_EVENT_FIELD_ENTRY, GORGONEION_ENVELOPE_FIELD_ENTRY],
    callables: ['repairGorgoneionWithDrones'],
  },
  {
    entries: [WARRIOR_EVENT_FIELD_ENTRY, WARRIOR_ENVELOPE_FIELD_ENTRY],
    callables: ['repairWarriorWithDrones'],
  },
  {
    entries: [MALIADE_LAUNCH_EVENT_FIELD_ENTRY, MALIADE_LAUNCH_ENVELOPE_FIELD_ENTRY],
    callables: ['launchDioneMaliades'],
  },
  {
    entries: [
      MALIADE_RANGE_PRIVACY_COMMENT,
      MALIADE_MEDIUM_EVENT_FIELD_ENTRY,
      MALIADE_MEDIUM_ENVELOPE_FIELD_ENTRY,
    ],
    callables: ['resolveMaliadesMedium'],
  },
  {
    entries: [MALIADE_SHORT_EVENT_FIELD_ENTRY, MALIADE_SHORT_ENVELOPE_FIELD_ENTRY],
    callables: ['resolveMaliadesShort'],
  },
  {
    entries: [MALIADE_REPAIR_EVENT_FIELD_ENTRY, MALIADE_REPAIR_ENVELOPE_FIELD_ENTRY],
    callables: ['repairMaliades'],
  },
]);
const EVENT_REDACTION_CHANGE_ERROR =
  'Cannot safely map event redaction changes outside the reviewed additive event field allowlists.';
const P436_CONSOLE_RESOLVER_ID = "  | 'wolf-attack.command-and-control'\n";
const P436_COMMAND_AND_CONTROL_BLUEPRINT_BEFORE = [
  "  'aegis:command-and-control': {\n",
  "    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot be used when damaged.'),\n",
  "    upgrade: printed('At the end of the attack, choose up to one ship to take 1 less damage.'),\n",
  "    effect: 'After targeting, redirect one Wolf ship to AEGIS.',\n",
  "    resolver: unavailable('Command and Control is unavailable until the AEGIS attack resolver lands.', ['182']),\n",
  "  },\n",
].join('');
const P436_COMMAND_AND_CONTROL_BLUEPRINT_AFTER = P436_COMMAND_AND_CONTROL_BLUEPRINT_BEFORE.replace(
  "    resolver: unavailable('Command and Control is unavailable until the AEGIS attack resolver lands.', ['182']),\n",
  "    resolver: implemented('wolf-attack.command-and-control'),\n",
);
const P503A_ACK_GUARD_ADDITION = `/** Validate one facilitator acknowledgement for a pending sabotage alert. */
export function requireAcknowledgeWolfHackingAlertRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  alertId?: unknown;
  expectedRevision?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  alertId: string;
  expectedRevision: number;
} {
  const allowed = new Set([
    'sessionId', 'instanceId', 'requestId', 'alertId', 'expectedRevision',
  ]);
  if (Object.keys(data).some((key) => !allowed.has(key))) {
    throw new HttpsError('invalid-argument', 'Hacking alert acknowledgement contains unsupported fields.');
  }
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a positive integer.');
  }
  return {
    ...requireGmInstanceRequest(data),
    requestId: requiredId(data.requestId, 'requestId'),
    alertId: requiredId(data.alertId, 'alertId'),
    expectedRevision: data.expectedRevision as number,
  };
}

`;
const P513_ARREST_POSSE_GUARD_ADDITION = `/** Accept only inputs the facilitator chooses; suspicion is always read server-side. */
export function requireArrestPosseCalculationRequest(data: {
  sessionId?: unknown;
  instanceId?: unknown;
  requestId?: unknown;
  expectedRevision?: unknown;
  targetUid?: unknown;
  defenders?: unknown;
  adjustment?: unknown;
}): {
  sessionId: string;
  instanceId: string;
  requestId: string;
  expectedRevision: number;
  targetUid: string;
  defenders: number;
  adjustment?: -1 | 1;
} {
  const allowed = new Set([
    'sessionId', 'instanceId', 'requestId', 'expectedRevision', 'targetUid', 'defenders', 'adjustment',
  ]);
  if (Object.keys(data).some((key) => !allowed.has(key))) {
    throw new HttpsError('invalid-argument', 'Arrest posse requests contain unsupported fields.');
  }
  if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
    throw new HttpsError('invalid-argument', 'expectedRevision must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(data.defenders) || (data.defenders as number) < 0) {
    throw new HttpsError('invalid-argument', 'defenders must be a non-negative integer.');
  }
  if (data.adjustment !== undefined && data.adjustment !== -1 && data.adjustment !== 1) {
    throw new HttpsError('invalid-argument', 'adjustment must be -1, +1, or omitted.');
  }
  return {
    ...requireGmInstanceRequest(data),
    requestId: requiredId(data.requestId, 'requestId'),
    expectedRevision: data.expectedRevision as number,
    targetUid: requiredId(data.targetUid, 'targetUid'),
    defenders: data.defenders as number,
    ...(data.adjustment === undefined ? {} : { adjustment: data.adjustment as -1 | 1 }),
  };
}

`;
const REQUEST_GUARD_ADDITIONS = Object.freeze([
  { source: P503A_ACK_GUARD_ADDITION, callable: 'acknowledgeWolfHackingAlert' },
  { source: P513_ARREST_POSSE_GUARD_ADDITION, callable: 'calculateArrestPosse' },
]);
const PC04_REQUEST_GUARD_TRANSITION = Object.freeze({
  before: 'b80dbcc64847d47b02f519ec7e8e88a620a5f68acfcc53d07a421c0f73bf6c99',
  after: 'ded4d4f080ab07c3669c12891673cf60db7d899be484d3bbf4ce4578a6693288',
});

const P541_CANDIDATE_REVEAL_NAVIGATION_ADDITIONS = Object.freeze([
  ["import type { CandidateReveal } from './candidateRevealProjection';", 1],
  ['  readonly candidateReveals?: readonly CandidateReveal[];', 1],
  ['  candidateReveals?: readonly CandidateReveal[],', 2],
  ['      ...(candidateReveals !== undefined ? { candidateReveals: [...candidateReveals] } : {}),', 1],
  ['    ...(candidateReveals !== undefined ? { candidateReveals: [...candidateReveals] } : {}),', 1],
]);
const P541_NAVIGATION_WRITER_BEFORE =
  '  tx.set(ref, playerDiscoveryProjection(player, navigation, revision, fleetGroupVesselIds));\n';
const P541_NAVIGATION_WRITER_AFTER = [
  '  const projection = playerDiscoveryProjection(\n',
  '    player, navigation, revision, fleetGroupVesselIds, candidateReveals,\n',
  '  );\n',
  '  tx.set(ref, projection);\n',
].join('');

function endeavourEcmDeviceWriterImpacts(before, after, cwd, sourceAtRevision = null) {
  const file = 'functions/src/endeavourEcmDeviceWriter.ts';
  const readAt = (revision) => {
    if (sourceAtRevision) return sourceAtRevision(revision, file);
    try {
      return execFileSync('git', ['show', `${revision}:${file}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine callable changes at ${revision}:${file}.`);
    }
  };
  const previous = readAt(before);
  const current = readAt(after);
  const pauseImport = "import { requirePursuitEmergencyWindowAbsent } from './pursuitEmergencyWindow';\n";
  const pauseGuard = '      requirePursuitEmergencyWindowAbsent(session);\n';
  const count = (source, snippet) => source.split(snippet).length - 1;
  if (count(previous, pauseImport) === 0 && count(current, pauseImport) === 1 &&
      count(previous, pauseGuard) === 0 && count(current, pauseGuard) === 1 &&
      current.replace(pauseImport, '').replace(pauseGuard, '') === previous) {
    return ['activateEndeavourEcmDevice'];
  }
  return ['activateEndeavourEcmDevice', 'readEndeavourEcmDeviceWorkspace'];
}

function eventRedactionImpacts(before, after, cwd, sourceAtRevision = null) {
  const file = 'functions/src/eventRedaction.ts';
  const readAt = (revision) => {
    if (sourceAtRevision) return sourceAtRevision(revision, file);
    try {
      return execFileSync('git', ['show', `${revision}:${file}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine callable changes at ${revision}:${file}.`);
    }
  };
  const previous = readAt(before);
  const current = readAt(after);
  const count = (source, entry) => source.split(entry).length - 1;
  const additions = EVENT_REDACTION_ADDITIONS.flatMap(({ entries }) => entries);
  const impacts = [];
  for (const { entries, callables } of EVENT_REDACTION_ADDITIONS) {
    const previousCounts = entries.map((entry) => count(previous, entry));
    const currentCounts = entries.map((entry) => count(current, entry));
    const hasCompletePreviousPair = previousCounts.every((entryCount) => entryCount === 1);
    const hasNoPreviousPair = previousCounts.every((entryCount) => entryCount === 0);
    const hasCompleteCurrentPair = currentCounts.every((entryCount) => entryCount === 1);
    const hasNoCurrentPair = currentCounts.every((entryCount) => entryCount === 0);
    if ((!hasCompletePreviousPair && !hasNoPreviousPair) ||
        (!hasCompleteCurrentPair && !hasNoCurrentPair) ||
        (hasCompletePreviousPair && hasNoCurrentPair)) {
      throw new Error(EVENT_REDACTION_CHANGE_ERROR);
    }
    if (hasNoPreviousPair && hasCompleteCurrentPair) impacts.push(...callables);
  }
  const stripReviewedAdditions = (source) => additions.reduce((result, addition) => result.replace(addition, ''), source);
  if (impacts.length === 0 || stripReviewedAdditions(previous) !== stripReviewedAdditions(current)) {
    throw new Error(EVENT_REDACTION_CHANGE_ERROR);
  }
  return [...new Set(impacts)];
}

function candidateRevealNavigationProjectionImpacts(before, after, cwd, sourceAtRevision = null) {
  const file = 'functions/src/navigationProjection.ts';
  const readAt = (revision) => {
    if (sourceAtRevision) return sourceAtRevision(revision, file);
    try {
      return execFileSync('git', ['show', `${revision}:${file}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine candidate-reveal navigation changes at ${revision}:${file}.`);
    }
  };
  const previous = readAt(before);
  const current = readAt(after);
  const digest = (source) => createHash('sha256').update(source).digest('hex');
  // PC05 only adds the pending-rerole exclusion to playerShipId. Keep other
  // projection edits fail-closed until their separate consumer audit.
  const reroleExclusion = "  if (player.get('replacementStatus') != null) return undefined;\n";
  if (!previous.includes(reroleExclusion) && current.split(reroleExclusion).length === 2 &&
      current.replace(reroleExclusion, '') === previous) {
    return ["activateEndeavourEcmDevice", "resolvePendingScoutRequest", "createSession", "confirmSetup", "startGame", "dealPrivateInitialCards", "assignReplacementRole", "setCandidatePlanCheckpoint", "joinSession", "resumeSession", "moveShipToLocation", "jumpShip", "listUnresolvedJumpFailures", "adjudicateFailedJump", "advanceTurn", "startSinglePlayerDemo", "declareWolfAttack", "submitWolfHomingBeacon", "requestScout", "runMaintenance"];
  }
  // Exact reviewed PC01 file transition. An additional navigation change must
  // receive its own audited consumer mapping before Functions deployment.
  if (digest(previous) === 'a4e97d779601b9e6bd2b5c853a5bc5c2704372e6ccab23341f026b098a5dcb81' &&
      digest(current) === '6ecd631f00265d834784077b9467999b637ba65dcc6fb0536dda6273a117fc6d') {
    return [...SCOUT_NAVIGATION_CALLABLES];
  }
  const countLine = (source, line) => source.split('\n').filter((entry) => entry === line).length;
  const countBlock = (source, block) => source.split(block).length - 1;
  for (const [addition, expectedCount] of P541_CANDIDATE_REVEAL_NAVIGATION_ADDITIONS) {
    if (countLine(previous, addition) !== 0 || countLine(current, addition) !== expectedCount) {
      throw new Error('Cannot safely map navigation projection changes outside the additive candidate-reveal allowlist.');
    }
  }
  if (countBlock(previous, P541_NAVIGATION_WRITER_BEFORE) !== 1 ||
      countBlock(current, P541_NAVIGATION_WRITER_AFTER) !== 1) {
    throw new Error('Cannot safely map navigation projection changes outside the additive candidate-reveal allowlist.');
  }
  const normalizedCurrent = P541_CANDIDATE_REVEAL_NAVIGATION_ADDITIONS
    .reduce((source, [addition]) => source.split('\n').filter((line) => line !== addition).join('\n'), current)
    .replace(P541_NAVIGATION_WRITER_AFTER, P541_NAVIGATION_WRITER_BEFORE);
  if (normalizedCurrent !== previous) {
    throw new Error('Cannot safely map navigation projection changes outside the additive candidate-reveal allowlist.');
  }
  return [...CANDIDATE_REVEAL_CALLABLES];
}

function commandAndControlConsoleMetadataImpacts(before, after, cwd, sourceAtRevision = null) {
  const file = 'functions/src/consoleMetadata.ts';
  const readAt = (revision) => {
    if (sourceAtRevision) return sourceAtRevision(revision, file);
    try {
      return execFileSync('git', ['show', `${revision}:${file}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine callable changes at ${revision}:${file}.`);
    }
  };
  const previous = readAt(before);
  const current = readAt(after);
  const count = (source, snippet) => source.split(snippet).length - 1;
  if (
    count(previous, P436_CONSOLE_RESOLVER_ID) !== 0
    || count(current, P436_CONSOLE_RESOLVER_ID) !== 1
    || count(previous, P436_COMMAND_AND_CONTROL_BLUEPRINT_BEFORE) !== 1
    || count(current, P436_COMMAND_AND_CONTROL_BLUEPRINT_AFTER) !== 1
  ) {
    throw new Error('Cannot safely map console metadata changes outside the additive Command and Control resolver allowlist.');
  }
  const normalizedCurrent = current
    .replace(P436_CONSOLE_RESOLVER_ID, '')
    .replace(P436_COMMAND_AND_CONTROL_BLUEPRINT_AFTER, P436_COMMAND_AND_CONTROL_BLUEPRINT_BEFORE);
  if (normalizedCurrent !== previous) {
    throw new Error('Cannot safely map console metadata changes outside the additive Command and Control resolver allowlist.');
  }
  return ['rechargeHostConsoleFromShuttle', 'runVulcanAdditionalLabour', 'upgradeEndeavourFieldTargets'];
}

const ALL_RATE_LIMIT_CONSUMERS = [
  'resumeSession', 'getSessionPresence', 'listGmInstances', 'rollDice',
  'confirmSetup', 'startGame', 'declareWolfAttack', 'runMaintenance',
];

function rateLimitCallableImpacts(before, after, cwd, sourceAtRevision) {
  const readAt = (revision) => {
    if (sourceAtRevision) return sourceAtRevision(revision, 'functions/src/callableRateLimit.ts');
    try {
      return execFileSync('git', ['show', `${revision}:functions/src/callableRateLimit.ts`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine callable changes at ${revision}:functions/src/callableRateLimit.ts.`);
    }
  };
  const previous = readAt(before);
  const current = readAt(after);
  const policyObject = /export const CALLABLE_RATE_LIMIT_POLICIES = \{([\s\S]*?)^\} as const;/m;
  const previousMatch = policyObject.exec(previous);
  const currentMatch = policyObject.exec(current);
  if (!previousMatch || !currentMatch) throw new Error('Cannot safely map changed callable rate-limit policy entries.');
  const stripPolicyObject = (source) => source.replace(policyObject, '/* callable policies */');
  if (stripPolicyObject(previous) !== stripPolicyObject(current)) return [...ALL_RATE_LIMIT_CONSUMERS];
  const entries = (block) => {
    const parsed = new Map();
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;
      const match = /^([A-Za-z_$][\w$]*): \{ windowMs: (\d(?:_?\d)*), maxRequests: (\d(?:_?\d)*) \},?$/.exec(line);
      if (!match || parsed.has(match[1])) {
        throw new Error('Cannot safely parse callable rate-limit policy entries.');
      }
      parsed.set(match[1], `${match[2].replaceAll('_', '')}:${match[3].replaceAll('_', '')}`);
    }
    if (parsed.size === 0) throw new Error('Cannot safely parse an empty callable rate-limit policy.');
    return parsed;
  };
  const oldEntries = entries(previousMatch[1]);
  const newEntries = entries(currentMatch[1]);
  const names = new Set([...oldEntries.keys(), ...newEntries.keys()]);
  return [...names].filter((name) => oldEntries.get(name) !== newEntries.get(name));
}

function callableIsExportedAtRevision(name, revision, cwd, sourceAtRevision) {
  let indexSource;
  if (sourceAtRevision) {
    indexSource = sourceAtRevision(revision, 'functions/src/index.ts');
  } else {
    try {
      indexSource = execFileSync('git', ['show', `${revision}:functions/src/index.ts`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      throw new Error(`Cannot safely determine deployed callable exports at ${revision}:functions/src/index.ts.`);
    }
  }
  if (typeof indexSource !== 'string') {
    throw new Error(`Cannot safely determine deployed callable exports at ${revision}:functions/src/index.ts.`);
  }
  const directExport = new RegExp(`\\bexport\\s+(?:const|function)\\s+${name}\\b`);
  const reExport = new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"][^'"]+['"]`);
  return directExport.test(indexSource) || reExport.test(indexSource);
}

function replaceMaliadesScope(source, startMarker, endMarker, normalize, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || source.indexOf(startMarker, start + startMarker.length) >= 0 ||
      source.indexOf(endMarker, end + endMarker.length) >= 0) {
    throw new Error(`Cannot safely map Maliades callable changes without the audited ${label} boundary.`);
  }
  return `${source.slice(0, start)}${normalize(source.slice(start, end))}${source.slice(end)}`;
}

function canonicalMaliadesRepairPrefix(prefix) {
  let current = prefix;
  const pursuitPauseImport = "import { requirePursuitEmergencyWindowAbsent } from './pursuitEmergencyWindow';\n";
  const pursuitPauseImportCount = current.split(pursuitPauseImport).length - 1;
  if (pursuitPauseImportCount > 1) {
    throw new Error('Cannot safely map Maliades callable changes with duplicate pursuit-pause imports.');
  }
  if (pursuitPauseImportCount === 1) current = current.replace(pursuitPauseImport, '');
  const staleReplyBlock = `\n\n${MALIADE_REPAIR_STALE_REPLY_TYPE}\n`;
  const staleReplyCount = current.split(staleReplyBlock).length - 1;
  if (staleReplyCount > 1) throw new Error('Cannot safely map Maliades callable changes with duplicate stale reply types.');
  if (staleReplyCount === 1) current = current.replace(staleReplyBlock, '\n\n');

  current = replaceMaliadesScope(
    current,
    'function exactCommandRequest(',
    'function fingerprintFor(',
    (scope) => {
      let normalized = scope;
      for (const [addition, canonical] of MALIADE_REPAIR_REQUEST_ADDITIONS) {
        const count = normalized.split(addition).length - 1;
        if (count > 1) throw new Error('Cannot safely map Maliades callable changes with duplicate repair parser blocks.');
        if (count === 1) normalized = normalized.replace(addition, canonical);
      }
      return normalized;
    },
    'repair request validator',
  );
  current = replaceMaliadesScope(
    current,
    'function fingerprintFor(',
    'function replay<',
    (scope) => {
      const addition = `  const payload: Record<string, string | number | readonly string[]> = {\n    expectedCycle: request.expectedCycle,\n    ...(request.expectedControlRevision !== undefined ? { expectedControlRevision: request.expectedControlRevision } : {}),\n  };`;
      const count = scope.split(addition).length - 1;
      if (count > 1) throw new Error('Cannot safely map Maliades callable changes with duplicate repair fingerprint fields.');
      return count === 1
        ? scope.replace(addition, '  const payload: Record<string, string | number | readonly string[]> = { expectedCycle: request.expectedCycle };')
        : scope;
    },
    'repair request fingerprint',
  );
  return current;
}

function maliadesCallableSections(source) {
  if (typeof source !== 'string') throw new Error('Cannot safely map Maliades callable changes without source at both revisions.');
  const positions = MALIADE_CALLABLE_MARKERS.map(([name, marker]) => {
    const first = source.indexOf(marker);
    if (first < 0 || source.indexOf(marker, first + marker.length) >= 0) {
      throw new Error(`Cannot safely map Maliades callable changes without one ${name} export.`);
    }
    return [name, first];
  });
  if (positions.some(([, position], index) => index > 0 && position <= positions[index - 1][1])) {
    throw new Error('Cannot safely map Maliades callable changes after export order changed.');
  }
  const exports = [...source.matchAll(/export const (\w+) = onCall\b/g)].map((match) => match[1]);
  if (exports.join('|') !== MALIADE_CALLABLE_MARKERS.map(([name]) => name).join('|') || !/\}\);\n?$/.test(source)) {
    throw new Error('Cannot safely map Maliades callable changes after the export surface changed.');
  }
  const prefix = source.slice(0, positions[0][1]);
  const callables = new Map();
  for (let index = 0; index < positions.length; index += 1) {
    const [name, start] = positions[index];
    const end = positions[index + 1]?.[1] ?? source.length;
    callables.set(name, source.slice(start, end));
  }
  return { prefix, callables };
}

function maliadesCallableImpacts(before, after, cwd, sourceAtRevision = null) {
  const file = 'functions/src/maliadesCallable.ts';
  const readAt = (revision) => {
    let source;
    if (sourceAtRevision) {
      source = sourceAtRevision(revision, file);
    } else {
      try {
        source = execFileSync('git', ['show', `${revision}:${file}`], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
        });
      } catch {
        try {
          execFileSync('git', ['cat-file', '-e', `${revision}^{commit}`], {
            stdio: ['ignore', 'ignore', 'ignore'], cwd,
          });
        } catch {
          throw new Error(`Cannot safely determine Maliades callable source at ${revision}:${file}.`);
        }
        try {
          execFileSync('git', ['cat-file', '-e', `${revision}:${file}`], {
            stdio: ['ignore', 'ignore', 'ignore'], cwd,
          });
        } catch {
          return null;
        }
        throw new Error(`Cannot safely read existing Maliades callable source at ${revision}:${file}.`);
      }
    }
    if (typeof source !== 'string') {
      if (source === null) return null;
      throw new Error(`Cannot safely determine Maliades callable source at ${revision}:${file}.`);
    }
    return source;
  };
  const previousSource = readAt(before);
  const currentSource = readAt(after);
  if (currentSource === null) throw new Error('Cannot safely map a removed Maliades callable module.');
  const current = maliadesCallableSections(currentSource);
  if (previousSource === null) return [...current.callables.keys()];
  const previous = maliadesCallableSections(previousSource);
  if (canonicalMaliadesRepairPrefix(previous.prefix) !== canonicalMaliadesRepairPrefix(current.prefix)) {
    throw new Error('Cannot safely map Maliades callable changes outside the exact repair-only CAS contract.');
  }
  const changed = [...previous.callables.keys()].filter((name) =>
    previous.callables.get(name) !== current.callables.get(name));
  if (changed.length !== 1) {
    throw new Error('Cannot safely map Maliades callable changes that are mixed, empty, or ambiguous.');
  }
  return changed;
}

function requestGuardCallableImpacts(before, after, cwd, sourceAtRevision = null) {
  const file = 'functions/src/requestGuards.ts';
  const readAt = (revision) => {
    if (sourceAtRevision) return sourceAtRevision(revision, file);
    try {
      return execFileSync('git', ['show', `${revision}:${file}`], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      if (revision === before) return '';
      throw new Error(`Cannot safely determine callable changes at ${revision}:${file}.`);
    }
  };
  const previous = readAt(before);
  const current = readAt(after);
  const digest = (source) => createHash('sha256').update(source).digest('hex');
  // Exact reviewed PC05 jump parser, failure-list and adjudication contracts.
  // Unrelated guard changes still require their own audited transition.
  if (digest(previous) === 'ded4d4f080ab07c3669c12891673cf60db7d899be484d3bbf4ce4578a6693288' &&
      digest(current) === 'a878e1b151ce3bc8deb496f1f7ef836f59eb5d430f4764f370addc3541d650bd') {
    return ['advanceTurn', 'jumpShip', 'listUnresolvedJumpFailures', 'adjudicateFailedJump'];
  }
  if (digest(previous) === PC04_REQUEST_GUARD_TRANSITION.before &&
      digest(current) === PC04_REQUEST_GUARD_TRANSITION.after) {
    let indexSource;
    if (sourceAtRevision) {
      indexSource = sourceAtRevision(after, 'functions/src/index.ts');
    } else {
      try {
        indexSource = execFileSync('git', ['show', `${after}:functions/src/index.ts`], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd, maxBuffer: 16 * 1024 * 1024,
        });
      } catch {
        throw new Error(`Cannot safely determine PC04 request-guard consumers at ${after}:functions/src/index.ts.`);
      }
    }
    if (typeof indexSource !== 'string') {
      throw new Error(`Cannot safely determine PC04 request-guard consumers at ${after}:functions/src/index.ts.`);
    }
    const consumers = [...functionExports(indexSource)]
      .filter(([, block]) => block.includes('requireUid('))
      .map(([name]) => name);
    if (!consumers.includes('dealPrivateInitialCards')) {
      throw new Error('Cannot safely map the exact PC04 mission request guard to its deployed callable.');
    }
    return consumers;
  }
  const addedCallables = [];
  let previousRest = previous;
  let currentRest = current;
  for (const { source, callable } of REQUEST_GUARD_ADDITIONS) {
    const beforeCount = previous.split(source).length - 1;
    const afterCount = current.split(source).length - 1;
    if (beforeCount > 1 || afterCount > 1 || afterCount < beforeCount) {
      throw new Error('Cannot safely map request-guard changes outside the exact audited validators.');
    }
    if (afterCount > beforeCount) addedCallables.push(callable);
    if (beforeCount === 1) previousRest = previousRest.replace(source, '');
    if (afterCount === 1) currentRest = currentRest.replace(source, '');
  }
  if (addedCallables.length === 0) {
    throw new Error('Cannot safely map request-guard changes without an exact audited validator addition.');
  }
  if (currentRest !== previousRest) {
    throw new Error('Cannot safely map request-guard changes outside the exact audited validators.');
  }
  return addedCallables;
}

function reconnectCommandErrorImpacts(before, after, cwd, sourceAtRevision) {
  const file = 'functions/src/commandErrors.ts';
  const readAt = (revision) => sourceAtRevision ? sourceAtRevision(revision, file)
    : execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'],
    });
  const previous = readAt(before);
  const current = readAt(after);
  const addition = "  'station-selection-required',\n";
  if (previous.includes(addition) || current.split(addition).length !== 2 ||
      current.replace(addition, '') !== previous) {
    throw new Error('Cannot safely map command error changes outside the additive reconnect taxonomy value.');
  }
  // The taxonomy is consumed as a type; these three runtime writers emit the
  // new discriminant. Other error behavior must receive a separate audit.
  return ['joinSession', 'resumeSession', 'refreshPresence'];
}

function airspaceClosureTaskHandlerImpacts(before, after, cwd, sourceAtRevision) {
  const file = 'functions/src/airspaceClosureTaskHandlers.ts';
  const readAt = (revision) => sourceAtRevision ? sourceAtRevision(revision, file)
    : execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'],
    });
  const previous = readAt(before);
  const current = readAt(after);
  const explicitPrivateInvoker = "    invoker: 'private',\n";
  const privateDefaultComment =
    '    // Task Queue functions are private when invoker is omitted. Keeping the\n' +
    '    // default also avoids an unnecessary IAM rewrite during deployment.\n';
  if (previous.split(explicitPrivateInvoker).length !== 2 ||
      current.split(privateDefaultComment).length !== 2 ||
      previous.replace(explicitPrivateInvoker, privateDefaultComment) !== current) {
    throw new Error('Cannot safely map airspace closure task-handler changes outside the exact private-invoker deployment repair.');
  }
  return ['parkShuttlesAtAirspaceClosure'];
}

function callablesChangedInRange({ before, after, files, cwd, sourceAtRevision }) {
  const runtimeFiles = files.map(normalizeFile).filter((file) =>
    file.startsWith('functions/src/') && !isTestFile(file) && /\.(?:ts|js|mjs|cjs)$/.test(file));
  const selected = new Set();
  for (const file of runtimeFiles) {
    if (file !== 'functions/src/index.ts' && PC06_DEPLOYMENT_CONSUMERS.modules[file]) {
      const readAt = revision => {
        if (sourceAtRevision) return sourceAtRevision(revision, file);
        try {
          return execFileSync('git', ['show', `${revision}:${file}`], {
            cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
          });
        } catch {
          if (revision === before) return '';
          throw new Error(`Cannot safely determine PC06 module source ${file}.`);
        }
      };
      const consumers = pc06TransitionConsumers(file, readAt(before), readAt(after));
      if (consumers) {
        for (const name of consumers) selected.add(name);
        continue;
      }
    }
    if (file === 'functions/src/airspaceClosureTaskHandlers.ts') {
      for (const name of airspaceClosureTaskHandlerImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/commandErrors.ts') {
      for (const name of reconnectCommandErrorImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/index.ts') {
      for (const name of changedIndexCallables(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/requestGuards.ts') {
      for (const name of requestGuardCallableImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/callableRateLimit.ts') {
      for (const name of rateLimitCallableImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/eventRedaction.ts') {
      for (const name of eventRedactionImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/endeavourEcmDeviceWriter.ts') {
      for (const name of endeavourEcmDeviceWriterImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/navigationProjection.ts') {
      for (const name of candidateRevealNavigationProjectionImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/consoleMetadata.ts') {
      for (const name of commandAndControlConsoleMetadataImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/wolfAttackDeclaration.ts') {
      for (const name of wolfAttackDeclarationTypeImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    if (file === 'functions/src/maliadesCallable.ts') {
      for (const name of maliadesCallableImpacts(before, after, cwd, sourceAtRevision)) selected.add(name);
      continue;
    }
    let consumers = file === 'functions/src/pursuitEmergencyWindow.ts'
      ? [...PC05_INDEX_HELPER_TRANSITION.consumers,
        'activateEndeavourEcmDevice', 'advanceEndeavourResearchTrack', 'repairMaliades']
      : CALLABLES_BY_CHANGED_MODULE[file];
    if (file === 'functions/src/smallShip.ts') {
      const source = sourceAtRevision ? sourceAtRevision(after, file)
        : execFileSync('git', ['show', `${after}:${file}`], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      // Preserve the exact reviewed P238 historical resolver before PC05 added
      // shared small-craft state/mutiny consumers. Never apply the old set to
      // an unknown or current module revision.
      if (createHash('sha256').update(source).digest('hex') ===
          '618a1d69e2c01ca05aadf42af684727a4e41368e2eb6983b5407b95d378022c1') {
        consumers = ['runSmallShipMaintenance', 'repairGorgoneionWithDrones',
          'repairWarriorWithDrones', 'transferBaseCapybaraCargo'];
      }
    }
    if (!consumers) throw new Error(`No audited callable consumer map exists for changed Functions module ${file}.`);
    for (const name of consumers) {
      // The Warrior repair domain shares this helper, but the callable became
      // deployable only after its index export landed. Historical ranges that
      // predate that export must not target a nonexistent Function.
      if (file === 'functions/src/smallShip.ts' && name === 'repairWarriorWithDrones' &&
          !callableIsExportedAtRevision(name, after, cwd, sourceAtRevision)) continue;
      if ((file === 'functions/src/extraShipAdmission.ts' || file === 'functions/src/replacementRoles.ts' ||
          file === 'functions/src/smallShip.ts' || file === 'functions/src/baseCapybaraCargoTransfer.ts' ||
          file === 'functions/src/baseCapybaraCargoTransferCallable.ts') &&
          name === 'transferBaseCapybaraCargo' &&
          !callableIsExportedAtRevision(name, after, cwd, sourceAtRevision)) continue;
      selected.add(name);
    }
  }
  return [...selected];
}

export function deploymentSelector({ before, after, files, targets, cwd = process.cwd(), manual = false, sourceAtRevision = null, isAncestor = (ancestor, descendant) => revisionIsAncestor(ancestor, descendant, cwd), filesSinceBaseline } = {}) {
  if (!targets?.includes('functions')) return (targets ?? []).join(',');
  if (manual) throw new Error('Manual deployment with Functions requires an audited named-function selector.');
  if (!before || !after) throw new Error('Functions deployment requires a known successful deployment baseline.');
  let callableBaseline = before;
  for (const receipt of VERIFIED_LIVE_FUNCTION_BASELINES) {
    if (receipt.sha === before || !isAncestor(before, receipt.sha) || !isAncestor(receipt.sha, after)) continue;
    const priorFiles = filesFromGit(before, receipt.sha, cwd);
    const priorCallables = callablesChangedInRange({
      before, after: receipt.sha, files: priorFiles, cwd, sourceAtRevision,
    }).sort();
    if (priorCallables.join('|') !== [...receipt.callables].sort().join('|')) {
      throw new Error(`Changes before verified live Function baseline ${receipt.sha} do not match its audited callable receipt.`);
    }
    callableBaseline = receipt.sha;
    break;
  }
  const selected = callablesChangedInRange({
    before: callableBaseline,
    after,
    files: callableBaseline === before ? files : filesSinceBaseline ?? filesFromGit(callableBaseline, after, cwd),
    cwd,
    sourceAtRevision,
  });
  if (selected.length === 0) throw new Error('Functions changed but no named callable deployment could be proven.');
  const ordered = selected;
  const deployTargets = (targets ?? []).filter((target) => target !== 'functions');
  if (!deployTargets.includes('hosting')) deployTargets.unshift('hosting');
  deployTargets.push(...ordered.map((name) => `functions:${name}`));
  return deployTargets.join(',');
}

export function formatGitHubOutputs(result) {
  return [
    `targets=${result.targets.join(',')}`,
    `deploy_only=${result.deployOnly ?? result.targets.join(',')}`,
    `function_names=${(result.deployOnly ?? '').split(',').filter((target) => target.startsWith('functions:')).map((target) => target.slice('functions:'.length)).join(',')}`,
    `has_targets=${result.targets.length > 0}`,
    `unknown_files=${JSON.stringify(result.unknownFiles)}`,
    `ignored_files=${JSON.stringify(result.ignoredFiles)}`,
    `current_tip=${result.currentTip !== false}`,
    `stale_run=${result.staleRun === true}`,
    `baseline_ancestry=${result.baselineAncestry !== false}`,
    `verification_baseline_ancestry=${result.verificationBaselineAncestry !== false}`,
    formatRiskGateOutputs(result.riskGates ?? classifyRiskGates(['__unknown_diff__'])),
  ].join('\n');
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error('Usage: deployment-targets.mjs --before <sha> --verification-before <sha> --after <sha> [--current-main-tip <sha>] [--manual true|false]');
    }
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

function filesFromGit(before, after, cwd = process.cwd()) {
  if (!before || !after) return ['__missing_diff_revision__'];
  try {
    return execFileSync('git', ['diff', '--name-only', before, after], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    }).split('\n').filter(Boolean);
  } catch {
    return ['__unreadable_diff__'];
  }
}

if (process.argv[1] && process.argv[1].endsWith('/deployment-targets.mjs')) {
  const options = parseOptions(process.argv.slice(2));
  const result = classifyDeploymentRange({
    before: options.before,
    verificationBefore: options['verification-before'],
    after: options.after,
    currentMainTip: options['current-main-tip'] || options.after,
    manual: options.manual === 'true',
  });
  process.stdout.write(`${formatGitHubOutputs(result)}\n`);
}
