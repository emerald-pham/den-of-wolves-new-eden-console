import { execFileSync } from 'node:child_process';
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
const WOLF_ATTACK_DECLARATION_TYPE_ADDITIONS = Object.freeze([
  '  /** Stable identity for this declared attack; range actions bind to it. */\n  readonly attackId: string;\n',
  '  /** Hidden Maliades effects committed against this exact attack. */\n  readonly maliadesRangeEffects: unknown;\n',
]);

// Keep this dependency map explicit. When a shared helper changes, deploy every
// callable known to consume it; unknown production modules fail closed below.
const CALLABLES_BY_CHANGED_MODULE = Object.freeze({
  'functions/src/actionAudit.ts': [
    'scavengeDestroyedShipStores', 'adjustShipResource', 'adjustShipUnrest',
    'adjustShipPopulation', 'applyShipCounterSteps',
    'runHighwallMining', 'authorFacilitatorRuleCall',
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
  'functions/src/arrestPosse.ts': ['calculateArrestPosse'],
  'functions/src/extraShipAdmission.ts': [
    'assignReplacementRole', 'joinSession', 'resumeSession',
    'repairGorgoneionWithDrones', 'repairWarriorWithDrones', 'transferBaseCapybaraCargo',
  ],
  'functions/src/replacementRoles.ts': ['assignReplacementRole', 'transferBaseCapybaraCargo'],
  'functions/src/baseCapybaraCargoTransfer.ts': ['transferBaseCapybaraCargo'],
  'functions/src/baseCapybaraCargoTransferCallable.ts': ['transferBaseCapybaraCargo'],
  'functions/src/gorgoneionRepairDrones.ts': ['repairGorgoneionWithDrones'],
  'functions/src/gorgoneionRepairDronesCallable.ts': ['repairGorgoneionWithDrones'],
  'functions/src/warriorRepairDrones.ts': ['repairWarriorWithDrones'],
  'functions/src/warriorRepairDronesCallable.ts': ['repairWarriorWithDrones'],
  'functions/src/maliadesCallable.ts': [
    'repairMaliades', 'resolveMaliadesMedium', 'resolveMaliadesShort',
  ],
  'functions/src/maliadesState.ts': [
    'declareWolfAttack', 'getDioneMaliadesLaunch', 'launchDioneMaliades', 'repairMaliades',
  ],
  // advanceSmallShipMaintenance is used by these three deployed transactions;
  // type-only and test imports do not add callable consumers.
  'functions/src/smallShip.ts': [
    'runSmallShipMaintenance', 'repairGorgoneionWithDrones', 'repairWarriorWithDrones',
    'transferBaseCapybaraCargo',
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
  after,
  currentMainTip = after,
  manual = false,
  changedFiles,
  versionMetadataOnly,
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
    };
  }
  const baselineAncestry = isAncestor(before, after);
  if (!baselineAncestry) {
    return {
      ...classifyChangedFiles(['__unreadable_diff__']),
      currentTip: true,
      staleRun: false,
      baselineAncestry: false,
    };
  }
  const files = changedFiles ?? filesFromGit(before, after, cwd);
  const metadataOnly = versionMetadataOnly ?? versionMetadataOnlyForRange(before, after, files, cwd);
  const classification = classifyChangedFiles(files, { versionMetadataOnly: metadataOnly });
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
  const previous = functionExports(readAt(before));
  const current = functionExports(readAt(after));
  const names = new Set([...previous.keys(), ...current.keys()]);
  return [...names].filter((name) => previous.get(name) !== current.get(name));
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

function callablesChangedInRange({ before, after, files, cwd, sourceAtRevision }) {
  const runtimeFiles = files.map(normalizeFile).filter((file) =>
    file.startsWith('functions/src/') && !isTestFile(file) && /\.(?:ts|js|mjs|cjs)$/.test(file));
  const selected = new Set();
  for (const file of runtimeFiles) {
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
    const consumers = CALLABLES_BY_CHANGED_MODULE[file];
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
    formatRiskGateOutputs(result.riskGates ?? classifyRiskGates(['__unknown_diff__'])),
  ].join('\n');
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error('Usage: deployment-targets.mjs --before <sha> --after <sha> [--current-main-tip <sha>] [--manual true|false]');
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
    after: options.after,
    currentMainTip: options['current-main-tip'] || options.after,
    manual: options.manual === 'true',
  });
  process.stdout.write(`${formatGitHubOutputs(result)}\n`);
}
