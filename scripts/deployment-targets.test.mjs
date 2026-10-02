import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyChangedFiles, deploymentSelector } from './deployment-targets.mjs';

test('classifies the isolated PC01 review entry as Hosting', () => {
  const result = classifyChangedFiles(['pc01-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('classifies the isolated PC02 review entry as Hosting', () => {
  const result = classifyChangedFiles(['pc02-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('classifies the isolated PC03 review entry as Hosting', () => {
  const result = classifyChangedFiles(['pc03-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('classifies the isolated PC04 review entry as Hosting', () => {
  const result = classifyChangedFiles(['pc04-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('classifies the isolated PC06 review entry as Hosting', () => {
  const result = classifyChangedFiles(['pc06-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('PC01 selects its new callables and existing ship-map writers for deployment', () => {
  const before = '9fc824f5';
  const after = '33fb746d';
  const files = execFileSync('git', ['diff', '--name-only', `${before}..${after}`], {
    encoding: 'utf8',
  }).trim().split('\n');
  const selected = deploymentSelector({ before, after, files, targets: ['hosting', 'firestore', 'functions'] });
  for (const name of [
    'requestScout', 'resolvePendingScoutRequest', 'readPrivateScoutResult',
    'listPendingScoutRequests', 'listMyScoutReports', 'readMyScoutDiscoveryNote',
    'activateEndeavourEcmDevice', 'readEndeavourEcmDeviceWorkspace',
    'advanceTurn', 'jumpShip', 'moveShipToLocation', 'runMaintenance', 'joinSession', 'resumeSession',
  ]) {
    assert.ok(selected.includes(`functions:${name}`), `${name} must receive the PC01 ship-map contract`);
  }
});

const COMMAND_AND_CONTROL_CALLABLES = [
  'applyAegisCommandAndControl',
  'applyWolfCommanderTargetRerolls',
  'finishWolfCommanderTargetingRerolls',
  'getAegisCommandAndControl',
  'getWolfCommanderTargeting',
];
const CONSOLE_METADATA_CALLABLES = [
  'rechargeHostConsoleFromShuttle',
  'runVulcanAdditionalLabour',
  'upgradeEndeavourFieldTargets',
];
const ENDEAVOUR_RESEARCH_CALLABLES = [
  'advanceEndeavourResearchTrack',
  'readEndeavourResearchWorkspace',
];
const GORGONEION_REPAIR_CALLABLES = ['repairGorgoneionWithDrones'];
const WARRIOR_REPAIR_CALLABLES = ['repairWarriorWithDrones'];
const BOA_RECYCLING_CALLABLES = ['recycleWithBoa'];
const MACAW_REPAIR_CALLABLES = ['repairConsolesFromMacaw'];
const ALLY_REPAIR_CALLABLES = ['repairConsolesFromAlly'];
const PHILIA_REPAIR_CALLABLES = ['repairConsolesFromPhilia'];
const BLACKSMITH_REPAIR_CALLABLES = ['repairConsolesFromBlacksmith'];
const SERVICE_SHUTTLE_RECHARGE_CALLABLES = ['rechargeHostConsoleFromShuttle'];
const MALIADE_EVENT_REDACTION_ADDITIONS = [
  {
    eventField: "  'maliades-launched': ['craftId', 'status'],\n",
    envelopeField: [
      "  'maliades-launched': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n",
      "    field !== 'actorUid' && field !== 'actorRoleId'),\n",
    ].join(''),
    callable: 'launchDioneMaliades',
  },
  {
    eventField: "  'maliades-medium': ['craftId', 'cycle', 'revision'],\n",
    extraEntry: '  // Range outcomes remain private until an audience-safe attack projection exists.\n',
    envelopeField: [
      "  'maliades-medium': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n",
      "    field !== 'actorUid' && field !== 'actorRoleId'),\n",
    ].join(''),
    callable: 'resolveMaliadesMedium',
  },
  {
    eventField: "  'maliades-short': ['craftId', 'cycle', 'revision'],\n",
    envelopeField: [
      "  'maliades-short': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n",
      "    field !== 'actorUid' && field !== 'actorRoleId'),\n",
    ].join(''),
    callable: 'resolveMaliadesShort',
  },
  {
    eventField: "  'maliades-repair': ['craftId', 'hostShipId', 'damageRepaired', 'materialsSpent', 'damage', 'destroyed'],\n",
    envelopeField: [
      "  'maliades-repair': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n",
      "    field !== 'actorUid' && field !== 'actorRoleId'),\n",
    ].join(''),
    callable: 'repairMaliades',
  },
];
const MALIADE_SOURCE_MODULE_CALLABLES = Object.freeze({
  'functions/src/maliadesState.ts': [
    'declareWolfAttack', 'getDioneMaliadesLaunch', 'launchDioneMaliades', 'repairMaliades',
  ],
  'functions/src/wolfAttackDeclaration.ts': ['declareWolfAttack'],
});
const PDF_ESCORT_WING_SOURCE_MODULE_CALLABLES = Object.freeze({
  'functions/src/pdfEscortWingState.ts': [
    'declareWolfAttack', 'getPdfEscortWingLaunch', 'launchPdfEscortWing',
  ],
  'functions/src/pdfEscortWingProjection.ts': ['declareWolfAttack', 'launchPdfEscortWing'],
});
const AWAY_MISSION_SOURCE_MODULE_CALLABLES = Object.freeze({
  'functions/src/awayMissionCards.ts': ['dealPrivateInitialCards'],
  // Pure follow-on candidate only; no deployed callable imports it yet.
  'functions/src/missionLifecycle.ts': [],
});
const WOLF_ATTACK_DECLARATION_ADDITIONS = [
  '  /** Stable identity for this declared attack; range actions bind to it. */\n  readonly attackId: string;\n',
  '  /** Hidden Maliades effects committed against this exact attack. */\n  readonly maliadesRangeEffects: unknown;\n',
];
const WOLF_ATTACK_DECLARATION_AFTER = readFileSync(
  new URL('../functions/src/wolfAttackDeclaration.ts', import.meta.url), 'utf8',
);
for (const addition of WOLF_ATTACK_DECLARATION_ADDITIONS) {
  assert.equal(WOLF_ATTACK_DECLARATION_AFTER.split(addition).length - 1, 1);
}
const WOLF_ATTACK_DECLARATION_BEFORE = WOLF_ATTACK_DECLARATION_ADDITIONS.reduce(
  (source, addition) => source.replace(addition, ''),
  WOLF_ATTACK_DECLARATION_AFTER,
);
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
const MALIADE_CALLABLE_AFTER = readFileSync(
  new URL('../functions/src/maliadesCallable.ts', import.meta.url), 'utf8',
);
const MALIADE_REPAIR_EXPORT_START = 'export const repairMaliades = onCall(CALLABLE_RUNTIME_OPTIONS, async request => {';
function replaceMaliadeFixtureOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  assert.equal(count, 1, `Maliades selector fixture expects one ${label}`);
  return source.replace(before, after);
}
function buildMaliadeCallableBefore(source) {
  let before = replaceMaliadeFixtureOnce(
    source, `\n\n${MALIADE_REPAIR_STALE_REPLY_TYPE}\n`, '\n\n', 'stale reply interface');
  before = replaceMaliadeFixtureOnce(before, ' expectedControlRevision?: number;', '', 'repair revision type');
  before = replaceMaliadeFixtureOnce(before, ", 'expectedControlRevision'", '', 'repair request key');
  before = replaceMaliadeFixtureOnce(
    before,
    `  if (!Number.isSafeInteger(raw.expectedControlRevision) || (raw.expectedControlRevision as number) < 0 ||\n      typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId) ||`,
    `  if (typeof raw.expectedHostShipId !== 'string' || !isResourceShipId(raw.expectedHostShipId) ||`,
    'repair request validation',
  );
  before = replaceMaliadeFixtureOnce(
    before,
    '    expectedControlRevision: raw.expectedControlRevision as number,\n', '', 'repair revision parser output');
  before = replaceMaliadeFixtureOnce(
    before,
    `  const payload: Record<string, string | number | readonly string[]> = {\n    expectedCycle: request.expectedCycle,\n    ...(request.expectedControlRevision !== undefined ? { expectedControlRevision: request.expectedControlRevision } : {}),\n  };`,
    '  const payload: Record<string, string | number | readonly string[]> = { expectedCycle: request.expectedCycle };',
    'repair idempotency fingerprint',
  );
  const repairStart = before.indexOf(MALIADE_REPAIR_EXPORT_START);
  assert.notEqual(repairStart, -1, 'Maliades repair export fixture must remain present');
  return `${before.slice(0, repairStart)}${MALIADE_REPAIR_EXPORT_START}\n  void request;\n  return null;\n});\n`;
}
const MALIADE_CALLABLE_BEFORE = buildMaliadeCallableBefore(MALIADE_CALLABLE_AFTER);

test('ignores stored rendered evidence without treating it as a deployable file', () => {
  const files = [
    'evidence/prompt-428-gm-control/README.md',
    'evidence/prompt-428-gm-control/phone-320-full.png',
  ];
  const result = classifyChangedFiles(files);
  assert.deepEqual(result.targets, []);
  assert.deepEqual(result.unknownFiles, []);
  assert.deepEqual(result.ignoredFiles, files);

  const unexpectedArtifact = classifyChangedFiles([
    'evidence/prompt-428-gm-control/unexpected.ts',
  ]);
  assert.deepEqual(unexpectedArtifact.unknownFiles, [
    'evidence/prompt-428-gm-control/unexpected.ts',
  ]);
  assert.deepEqual(unexpectedArtifact.targets, ['hosting', 'firestore', 'functions']);
});

const BASE_CAPYBARA_CARGO_CALLABLES = ['transferBaseCapybaraCargo'];
const SMALL_SHIP_MAINTENANCE_CALLABLES = ['runSmallShipMaintenance'];
const P238_DEPLOYMENT_BASELINE = '213efd24bedd65f5ef60c800f6dc8e63308af08b';
const P238_MAPPED_CANDIDATE = 'd005c510';
const CANDIDATE_REVEAL_CALLABLES = [
  'advanceTurn', 'assignReplacementRole', 'confirmSetup', 'joinSession', 'jumpShip',
  'moveShipToLocation', 'resumeSession', 'runMaintenance',
];
const P436_EXPORTS = [...COMMAND_AND_CONTROL_CALLABLES, ...CONSOLE_METADATA_CALLABLES];
const P503A_CALLABLES = [
  'acknowledgeWolfHackingAlert',
  'resolveWolfConsoleSabotage',
  'submitWolfSupplySabotage',
];
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
const REQUEST_GUARD_SOURCE_AFTER = readFileSync(
  new URL('../functions/src/requestGuards.ts', import.meta.url), 'utf8',
);
assert.equal(REQUEST_GUARD_SOURCE_AFTER.split(P503A_ACK_GUARD_ADDITION).length - 1, 1);
assert.equal(REQUEST_GUARD_SOURCE_AFTER.split(P513_ARREST_POSSE_GUARD_ADDITION).length - 1, 1);
const REQUEST_GUARD_SOURCE_BASE = REQUEST_GUARD_SOURCE_AFTER
  .replace(P503A_ACK_GUARD_ADDITION, '')
  .replace(P513_ARREST_POSSE_GUARD_ADDITION, '');
const P503A_ACK_GUARD_SOURCE_BEFORE = REQUEST_GUARD_SOURCE_BASE;
const P503A_ACK_GUARD_SOURCE_AFTER = REQUEST_GUARD_SOURCE_BASE + P503A_ACK_GUARD_ADDITION;
const P513_ARREST_POSSE_GUARD_SOURCE_BEFORE =
  REQUEST_GUARD_SOURCE_BASE + P503A_ACK_GUARD_ADDITION;

const P436_RESOLVER_ID_ADDITION = "  | 'wolf-attack.command-and-control'\n";
const COMMAND_AND_CONTROL_BLUEPRINT_BEFORE = [
  "  'aegis:command-and-control': {\n",
  "    phase: 'Wolf attack', step: null, charge: reactorCharge, damage: printed('Cannot be used when damaged.'),\n",
  "    upgrade: printed('At the end of the attack, choose up to one ship to take 1 less damage.'),\n",
  "    effect: 'After targeting, redirect one Wolf ship to AEGIS.',\n",
  "    resolver: unavailable('Command and Control is unavailable until the AEGIS attack resolver lands.', ['182']),\n",
  "  },\n",
].join('');
const COMMAND_AND_CONTROL_BLUEPRINT_AFTER = COMMAND_AND_CONTROL_BLUEPRINT_BEFORE.replace(
  "    resolver: unavailable('Command and Control is unavailable until the AEGIS attack resolver lands.', ['182']),\n",
  "    resolver: implemented('wolf-attack.command-and-control'),\n",
);
const CONSOLE_METADATA_AFTER = readFileSync(new URL('../functions/src/consoleMetadata.ts', import.meta.url), 'utf8');
assert.equal(CONSOLE_METADATA_AFTER.split(P436_RESOLVER_ID_ADDITION).length - 1, 1);
assert.equal(CONSOLE_METADATA_AFTER.split(COMMAND_AND_CONTROL_BLUEPRINT_AFTER).length - 1, 1);
const CONSOLE_METADATA_BEFORE = CONSOLE_METADATA_AFTER
  .replace(P436_RESOLVER_ID_ADDITION, '')
  .replace(COMMAND_AND_CONTROL_BLUEPRINT_AFTER, COMMAND_AND_CONTROL_BLUEPRINT_BEFORE);
const P541_NAVIGATION_ADDITIONS = [
  ["import type { CandidateReveal } from './candidateRevealProjection';", 1],
  ['  readonly candidateReveals?: readonly CandidateReveal[];', 1],
  ['  candidateReveals?: readonly CandidateReveal[],', 2],
  ['      ...(candidateReveals !== undefined ? { candidateReveals: [...candidateReveals] } : {}),', 1],
  ['    ...(candidateReveals !== undefined ? { candidateReveals: [...candidateReveals] } : {}),', 1],
];
const P541_NAVIGATION_WRITER_BEFORE =
  '  tx.set(ref, playerDiscoveryProjection(player, navigation, revision, fleetGroupVesselIds));\n';
const P541_NAVIGATION_WRITER_AFTER = [
  '  const projection = playerDiscoveryProjection(\n',
  '    player, navigation, revision, fleetGroupVesselIds, candidateReveals,\n',
  '  );\n',
  '  tx.set(ref, projection);\n',
].join('');
// Historical reviewed transitions remain pinned as new checkpoint behavior evolves.
const PC05_REVIEWED_CANDIDATE = 'c27842ff6d9e240209bbfc5798f7dbeff519110a';
const NAVIGATION_PROJECTION_AFTER = execFileSync('git',
  ['show', `${PC05_REVIEWED_CANDIDATE}:functions/src/navigationProjection.ts`], { encoding: 'utf8' });
let NAVIGATION_PROJECTION_BEFORE = NAVIGATION_PROJECTION_AFTER;
for (const [addition, expectedCount] of P541_NAVIGATION_ADDITIONS) {
  assert.equal(NAVIGATION_PROJECTION_BEFORE.split('\n').filter((line) => line === addition).length, expectedCount);
  NAVIGATION_PROJECTION_BEFORE = NAVIGATION_PROJECTION_BEFORE
    .split('\n').filter((line) => line !== addition).join('\n');
}
assert.equal(NAVIGATION_PROJECTION_BEFORE.split(P541_NAVIGATION_WRITER_AFTER).length - 1, 1);
NAVIGATION_PROJECTION_BEFORE = NAVIGATION_PROJECTION_BEFORE
  .replace(P541_NAVIGATION_WRITER_AFTER, P541_NAVIGATION_WRITER_BEFORE);
const INDEX_SOURCE = [
  ...P436_EXPORTS, ...GORGONEION_REPAIR_CALLABLES, ...WARRIOR_REPAIR_CALLABLES,
  ...BASE_CAPYBARA_CARGO_CALLABLES, ...BOA_RECYCLING_CALLABLES,
  ...ALLY_REPAIR_CALLABLES, ...PHILIA_REPAIR_CALLABLES, ...BLACKSMITH_REPAIR_CALLABLES,
  ...SMALL_SHIP_MAINTENANCE_CALLABLES,
  'calculateArrestPosse', 'declareWolfAttack', 'getDioneMaliadesLaunch',
  ...MALIADE_EVENT_REDACTION_ADDITIONS.map(({ callable }) => callable),
].map((name) => `export const ${name} = onCall(async () => {});`).join('\n');
const GORGONEION_EVENT_FIELD_ENTRY =
  "  'gorgoneion-repair-drones': ['smallShipId', 'hostShipId', 'systemId', 'materialsSpent'],\n";
const GORGONEION_ENVELOPE_FIELD_ENTRY = [
  "  'gorgoneion-repair-drones': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n",
  "    field !== 'actorUid' && field !== 'actorRoleId'),\n",
].join('');
const WARRIOR_EVENT_FIELD_ENTRY =
  "  'warrior-repair-drones': ['smallShipId', 'hostShipId', 'systemIds', 'materialsSpent'],\n";
const WARRIOR_ENVELOPE_FIELD_ENTRY = [
  "  'warrior-repair-drones': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n",
  "    field !== 'actorUid' && field !== 'actorRoleId'),\n",
].join('');
const ENDEAVOUR_EVENT_FIELD_ENTRY = "  'endeavour-field-upgrade': ['shuttleId', 'targets'],\n";
const ENDEAVOUR_ENVELOPE_FIELD_ENTRY = [
  "  'endeavour-field-upgrade': MEMBER_ENVELOPE_FIELDS.filter((field) =>\n",
  "    field !== 'actorUid' && field !== 'actorRoleId'),\n",
].join('');
const EVENT_REDACTION_AFTER = readFileSync(
  new URL('../functions/src/eventRedaction.ts', import.meta.url), 'utf8',
);
for (const { eventField, envelopeField, extraEntry = '' } of MALIADE_EVENT_REDACTION_ADDITIONS) {
  assert.equal(EVENT_REDACTION_AFTER.split(eventField).length - 1, 1);
  assert.equal(EVENT_REDACTION_AFTER.split(envelopeField).length - 1, 1);
  if (extraEntry) assert.equal(EVENT_REDACTION_AFTER.split(extraEntry).length - 1, 1);
}
assert.equal(EVENT_REDACTION_AFTER.split(GORGONEION_EVENT_FIELD_ENTRY).length - 1, 1);
assert.equal(EVENT_REDACTION_AFTER.split(GORGONEION_ENVELOPE_FIELD_ENTRY).length - 1, 1);
assert.equal(EVENT_REDACTION_AFTER.split(WARRIOR_EVENT_FIELD_ENTRY).length - 1, 1);
assert.equal(EVENT_REDACTION_AFTER.split(WARRIOR_ENVELOPE_FIELD_ENTRY).length - 1, 1);
const EVENT_REDACTION_P397_BEFORE = MALIADE_EVENT_REDACTION_ADDITIONS.reduce(
  (source, { eventField, envelopeField, extraEntry = '' }) =>
    source.replace(eventField, '').replace(envelopeField, '').replace(extraEntry, ''),
  EVENT_REDACTION_AFTER,
);
const EVENT_REDACTION_P244_BEFORE = EVENT_REDACTION_P397_BEFORE
  .replace(WARRIOR_EVENT_FIELD_ENTRY, '')
  .replace(WARRIOR_ENVELOPE_FIELD_ENTRY, '');
const EVENT_REDACTION_BEFORE = EVENT_REDACTION_P397_BEFORE
  .replace(GORGONEION_EVENT_FIELD_ENTRY, '')
  .replace(GORGONEION_ENVELOPE_FIELD_ENTRY, '')
  .replace(WARRIOR_EVENT_FIELD_ENTRY, '')
  .replace(WARRIOR_ENVELOPE_FIELD_ENTRY, '');
const EVENT_REDACTION_WITHOUT_REVIEWED_ADDITIONS = EVENT_REDACTION_BEFORE
  .replace(ENDEAVOUR_EVENT_FIELD_ENTRY, '')
  .replace(ENDEAVOUR_ENVELOPE_FIELD_ENTRY, '');

function selectorFor(files, {
  metadataBefore = CONSOLE_METADATA_BEFORE,
  metadataAfter = CONSOLE_METADATA_AFTER,
  navigationBefore = NAVIGATION_PROJECTION_BEFORE,
  navigationAfter = NAVIGATION_PROJECTION_AFTER,
  eventRedactionBefore = EVENT_REDACTION_BEFORE,
  eventRedactionAfter = EVENT_REDACTION_P397_BEFORE,
  wolfAttackDeclarationBefore = WOLF_ATTACK_DECLARATION_BEFORE,
  wolfAttackDeclarationAfter = WOLF_ATTACK_DECLARATION_AFTER,
  maliadeCallableBefore = MALIADE_CALLABLE_BEFORE,
  maliadeCallableAfter = MALIADE_CALLABLE_AFTER,
} = {}) {
  return deploymentSelector({
    before: 'base',
    after: 'candidate',
    files: ['functions/src/index.ts', ...files],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      if (file === 'functions/src/index.ts') return INDEX_SOURCE;
      if (file === 'functions/src/consoleMetadata.ts') {
        return revision === 'base' ? metadataBefore : metadataAfter;
      }
      if (file === 'functions/src/navigationProjection.ts') {
        return revision === 'base' ? navigationBefore : navigationAfter;
      }
      if (file === 'functions/src/eventRedaction.ts') {
        return revision === 'base' ? eventRedactionBefore : eventRedactionAfter;
      }
      if (file === 'functions/src/wolfAttackDeclaration.ts') {
        return revision === 'base' ? wolfAttackDeclarationBefore : wolfAttackDeclarationAfter;
      }
      if (file === 'functions/src/maliadesCallable.ts') {
        return revision === 'base' ? maliadeCallableBefore : maliadeCallableAfter;
      }
      return '';
    },
  });
}

function selectedFunctions(selected) {
  return selected.split(',').filter((target) => target.startsWith('functions:')).sort();
}

function functionTargets(names) {
  return names.map((name) => `functions:${name}`).sort();
}

test('maps jump resolution changes to both authoritative jump paths', () => {
  const selected = selectorFor(['functions/src/jumpDrive.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(['jumpShip', 'adjudicateFailedJump']));
});

test('maps Command and Control helpers without relying on index changes', () => {
  const selected = selectorFor(['functions/src/wolfCommandAndControl.ts']);
  assert.equal(selected.split(',')[0], 'hosting');
  assert.deepEqual(selectedFunctions(selected), functionTargets(COMMAND_AND_CONTROL_CALLABLES));
});

test('maps the private Endeavour research writer to both production callables', () => {
  const selected = selectorFor(['functions/src/endeavourResearchWriter.ts']);
  assert.equal(selected.split(',')[0], 'hosting');
  assert.deepEqual(selectedFunctions(selected), functionTargets(ENDEAVOUR_RESEARCH_CALLABLES));
});

test('maps the Gorgoneion repair resolver and transaction to the deployed repair callable', () => {
  for (const file of [
    'functions/src/gorgoneionRepairDrones.ts',
    'functions/src/gorgoneionRepairDronesCallable.ts',
  ]) {
    const selected = selectorFor([file]);
    assert.deepEqual(selectedFunctions(selected), functionTargets(GORGONEION_REPAIR_CALLABLES));
  }
});

test('maps Warrior repair resolver and transaction to its deployed repair callable', () => {
  for (const file of [
    'functions/src/warriorRepairDrones.ts',
    'functions/src/warriorRepairDronesCallable.ts',
  ]) {
    const selected = selectorFor([file]);
    assert.deepEqual(selectedFunctions(selected), functionTargets(WARRIOR_REPAIR_CALLABLES));
  }
});

test('maps base Capybara cargo resolver and transaction to its deployed transfer callable', () => {
  for (const file of [
    'functions/src/baseCapybaraCargoTransfer.ts',
    'functions/src/baseCapybaraCargoTransferCallable.ts',
  ]) {
    const selected = selectorFor([file]);
    assert.deepEqual(selectedFunctions(selected), functionTargets(BASE_CAPYBARA_CARGO_CALLABLES));
  }
});

test('maps Boa recycling callable contract changes to only recycleWithBoa', () => {
  const selected = selectorFor(['functions/src/boaRecyclingCallable.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(BOA_RECYCLING_CALLABLES));
});

test('maps Macaw repair resolver and callable changes to only repairConsolesFromMacaw', () => {
  for (const file of ['functions/src/macawRepair.ts', 'functions/src/macawRepairCallable.ts']) {
    const selected = selectorFor([file]);
    assert.deepEqual(selectedFunctions(selected), functionTargets(MACAW_REPAIR_CALLABLES));
  }
});

test('maps Ally repair callable changes to only repairConsolesFromAlly', () => {
  const selected = selectorFor(['functions/src/allyRepairCallable.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(ALLY_REPAIR_CALLABLES));
});

test('maps an isolated Philia index export diff only to repairConsolesFromPhilia', () => {
  const before = INDEX_SOURCE;
  const after = before.replace(
    'export const repairConsolesFromPhilia = onCall(async () => {});',
    'export const repairConsolesFromPhilia = onCall(async () => { return { status: \'stale\' }; });',
  );
  assert.notEqual(after, before);
  const selected = deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(PHILIA_REPAIR_CALLABLES));
});

test('fails closed when the Philia and Ally index exports change together', () => {
  const before = INDEX_SOURCE;
  const after = before
    .replace('repairConsolesFromPhilia = onCall(async () => {});',
      'repairConsolesFromPhilia = onCall(async () => { return { status: \'stale\' }; });')
    .replace('repairConsolesFromAlly = onCall(async () => {});',
      'repairConsolesFromAlly = onCall(async () => { return { status: \'changed\' }; });');
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  }), /cannot safely map a Philia repair index change mixed with another callable/i);
});

test('maps an isolated Blacksmith index export diff only to repairConsolesFromBlacksmith', () => {
  const before = INDEX_SOURCE;
  const after = before.replace(
    'export const repairConsolesFromBlacksmith = onCall(async () => {});',
    "export const repairConsolesFromBlacksmith = onCall(async () => { return { status: 'stale' }; });",
  );
  assert.notEqual(after, before);
  const selected = deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(BLACKSMITH_REPAIR_CALLABLES));
});

test('maps an isolated service-shuttle recharge index diff only to its callable', () => {
  const before = INDEX_SOURCE;
  const after = before.replace(
    'export const rechargeHostConsoleFromShuttle = onCall(async () => {});',
    "export const rechargeHostConsoleFromShuttle = onCall(async () => { return { status: 'stale' }; });",
  );
  assert.notEqual(after, before);
  const selected = deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(SERVICE_SHUTTLE_RECHARGE_CALLABLES));
});

test('maps an isolated Endeavour field-upgrade callable diff to Hosting and only its Function', () => {
  const after = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  const marker = 'export const upgradeEndeavourFieldTargets = onCall<';
  const start = after.indexOf(marker);
  assert.notEqual(start, -1);
  const lineEnd = after.indexOf('\n', start);
  const before = `${after.slice(0, lineEnd + 1)}    // baseline marker\n${after.slice(lineEnd + 1)}`;
  const selected = deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  });
  assert.deepEqual(selected.split(','), ['hosting', 'functions:upgradeEndeavourFieldTargets']);
});

test('fails closed for Endeavour callable changes mixed with another export or an untracked helper', () => {
  const after = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  const marker = 'export const upgradeEndeavourFieldTargets = onCall<';
  const start = after.indexOf(marker);
  assert.notEqual(start, -1);
  const lineEnd = after.indexOf('\n', start);
  const before = `${after.slice(0, lineEnd + 1)}    // baseline marker\n${after.slice(lineEnd + 1)}`;
  const otherCallableMarker = 'export const createSession = onCall<';
  const otherStart = after.indexOf(otherCallableMarker);
  assert.notEqual(otherStart, -1);
  const otherLineEnd = after.indexOf('\n', otherStart);
  const mixedCallable = after.slice(0, otherLineEnd + 1) +
    '  // independent callable change\n' + after.slice(otherLineEnd + 1);
  const revisions = (candidate) => ({
    before: 'base', after: 'candidate',
    files: [
      'functions/src/index.ts', 'src/components/EndeavourFieldUpgradePanel.tsx',
      'src/version.test.ts', 'src/changelog.ts', 'package.json', 'package-lock.json',
      'docs/implementation-prompts.json',
    ],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : candidate;
    },
  });
  assert.throws(() => deploymentSelector(revisions(mixedCallable)),
    /Cannot safely map an Endeavour field-upgrade index change mixed with another callable or untracked source edit/i);
  assert.throws(() => deploymentSelector({
    ...revisions(after), files: [...revisions(after).files, 'functions/src/unmappedEndeavourHelper.ts'],
  }), /No audited callable consumer map exists/i);

  const helperMixed = `${after}\nfunction untrackedEndeavourHelper() { return 'changed'; }\n`;
  assert.throws(() => deploymentSelector(revisions(helperMixed)),
    /Cannot safely map an Endeavour field-upgrade index change mixed with another callable or untracked source edit/i);
});

test('fails closed when a new Endeavour callable is added alongside an untracked helper', () => {
  const after = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  const marker = 'export const upgradeEndeavourFieldTargets = onCall<';
  const start = after.indexOf(marker);
  assert.notEqual(start, -1);
  const close = after.indexOf('\n});', start);
  assert.notEqual(close, -1);
  const before = after.slice(0, start) + after.slice(close + '\n});'.length);
  const helperMixed = `${after}\nfunction untrackedEndeavourHelper() { return 'changed'; }\n`;
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : helperMixed;
    },
  }), /Cannot safely map an Endeavour field-upgrade index change mixed with another callable or untracked source edit/i);
});

test('fails closed when Blacksmith and another callable export change together', () => {
  const before = INDEX_SOURCE;
  const after = before
    .replace('repairConsolesFromBlacksmith = onCall(async () => {});',
      "repairConsolesFromBlacksmith = onCall(async () => { return { status: 'stale' }; });")
    .replace('repairConsolesFromAlly = onCall(async () => {});',
      "repairConsolesFromAlly = onCall(async () => { return { status: 'changed' }; });");
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  }), /cannot safely map a Blacksmith repair index change mixed with another callable or untracked source edit/i);
});

test('fails closed when a Blacksmith index change is mixed with an untracked helper edit', () => {
  const before = [
    'export const repairConsolesFromBlacksmith = onCall(async () => {',
    "  return 'before';",
    '});',
    '',
    'export const repairConsolesFromAlly = onCall(async () => {',
    "  return 'same';",
    '});',
    '',
  ].join('\n');
  const after = before.replace("return 'before';", "return 'after';") +
    "function untrackedRepairHelper() { return 'changed'; }\n";
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  }), /cannot safely map a Blacksmith repair index change mixed with another callable or untracked source edit/i);
});

test('fails closed when an index diff has no changed named callable', () => {
  const before = [
    'export const repairConsolesFromPhilia = onCall(async () => {',
    "  return 'same';",
    '});',
    '',
  ].join('\n');
  const after = `${before}function untrackedRepairHelper() { return 'changed'; }\n`;
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  }), /no named callable deployment could be proven/i);
});

test('fails closed when a Philia export change is mixed with an untracked index helper edit', () => {
  const before = [
    'export const repairConsolesFromPhilia = onCall(async () => {',
    "  return 'before';",
    '});',
    '',
    'export const repairConsolesFromAlly = onCall(async () => {',
    "  return 'same';",
    '});',
    '',
  ].join('\n');
  const after = before.replace("return 'before';", "return 'after';") +
    "function untrackedRepairHelper() { return 'changed'; }\n";
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: [
      'functions/src/index.ts',
      'src/components/PhiliaRepairPanel.tsx',
      'src/version.test.ts',
      'src/changelog.ts',
      'package.json',
      'package-lock.json',
      'docs/implementation-prompts.json',
    ],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      return revision === 'base' ? before : after;
    },
  }), /cannot safely map a Philia repair index change mixed with another callable or untracked source edit/i);
});

test('maps extraShipAdmission changes to its audited runtime consumers', () => {
  const selected = selectorFor(['functions/src/extraShipAdmission.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    "repairGorgoneionWithDrones",
    "repairWarriorWithDrones",
    "transferBaseCapybaraCargo",
    "assignReplacementRole",
    "joinSession",
    "resumeSession",
    "resolveShipMutiny"
]));
});

test('maps replacementRoles changes to its audited runtime consumers', () => {
  const selected = selectorFor(['functions/src/replacementRoles.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    "repairGorgoneionWithDrones",
    "repairWarriorWithDrones",
    "transferBaseCapybaraCargo",
    "readMyScoutDiscoveryNote",
    "resolvePendingScoutRequest",
    "confirmSetup",
    "startGame",
    "transferShuttleControlCommand",
    "setReplacementEligibility",
    "assignReplacementRole",
    "submitCivilUnrestGrievance",
    "joinSession",
    "resumeSession",
    "moveShipToLocation",
    "jumpShip",
    "adjudicateFailedJump",
    "setShipConsoleLock",
    "advanceTurn",
    "startSinglePlayerDemo",
    "unlockPressAirspace",
    "popShipConfetti",
    "adjustShipResource",
    "adjustShipUnrest",
    "consentCommissarPurge",
    "applyCommissarPurge",
    "getCommissarPurgeAuthority",
    "dismissUnrestAlert",
    "resolveShipMutiny",
    "addShipDamage",
    "adjustShipPopulation",
    "applyShipCounterSteps",
    "setFighterWingCount",
    "buildFighter",
    "dismissPopulationAlert",
    "requestScout",
    "rollHummingbirdHarvest",
    "allocateHummingbirdHarvest",
    "setSmallShipDocking",
    "runSmallShipMaintenance",
    "runVoyage33Maintenance",
    "runMaintenance",
    "drawVipCard",
    "transferVipCard",
    "rerollVipUnrest",
    "publishAdmiralDirectiveCommand",
    "recordPresidentActionCommand",
    "updatePoliticalCapital",
    "setFleetRedAlert",
    "repairAllShipDamage",
    "rollbackMaintenance"
]));
});

test('maps smallShip changes to its audited runtime consumers', () => {
  const selected = selectorFor(['functions/src/smallShip.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    "repairGorgoneionWithDrones",
    "repairWarriorWithDrones",
    "transferBaseCapybaraCargo",
    "startGame",
    "assignReplacementRole",
    "joinSession",
    "resumeSession",
    "jumpShip",
    "adjudicateFailedJump",
    "advanceTurn",
    "startSinglePlayerDemo",
    "setWolfAttackWindow",
    "declareWolfAttack",
    "resolveShipMutiny",
    "addShipDamage",
    "setSmallShipDocking",
    "runSmallShipMaintenance",
    "runVoyage33Maintenance",
    "runVulcanAdditionalLabour",
    "runMaintenance"
]));
});

test('selects only the three changed P503a callables from exact export and request-guard additions', () => {
  const before = [
    "export const resolveWolfConsoleSabotage = onCall(async () => { return 'before-console'; });",
    "export const submitWolfSupplySabotage = onCall(async () => { return 'before-supplies'; });",
    "export const acknowledgeWolfHackingAlert = onCall(async () => { return 'before-ack'; });",
    "export const unrelatedCallable = onCall(async () => { return 'unchanged'; });",
  ].join('\n');
  const after = before
    .replace('before-console', 'after-console')
    .replace('before-supplies', 'after-supplies')
    .replace('before-ack', 'after-ack');
  const selectWithGuard = (guardAfter = P503A_ACK_GUARD_SOURCE_AFTER) => deploymentSelector({
    before: 'base', after: 'candidate',
    files: ['functions/src/index.ts', 'functions/src/requestGuards.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      if (file === 'functions/src/index.ts') return revision === 'base' ? before : after;
      if (file === 'functions/src/requestGuards.ts') {
        return revision === 'base' ? P503A_ACK_GUARD_SOURCE_BEFORE : guardAfter;
      }
      throw new Error(`Unexpected selector source ${file}`);
    },
  });
  const selected = selectWithGuard();
  assert.deepEqual(selectedFunctions(selected), functionTargets(P503A_CALLABLES));
  assert.throws(
    () => selectWithGuard(`${P503A_ACK_GUARD_SOURCE_AFTER}\nexport function unrelatedGuard() { return true; }\n`),
    /Cannot safely map request-guard changes outside the exact audited validators/,
  );
});

test('maps the exact P513 arrest-posse request guard to its exported callable', () => {
  const selected = deploymentSelector({
    before: 'base', after: 'candidate',
    files: ['functions/src/requestGuards.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      if (file === 'functions/src/index.ts') return INDEX_SOURCE;
      if (file === 'functions/src/requestGuards.ts') {
        return revision === 'base'
          ? P513_ARREST_POSSE_GUARD_SOURCE_BEFORE
          : REQUEST_GUARD_SOURCE_AFTER;
      }
      throw new Error(`Unexpected selector source ${file}`);
    },
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(['calculateArrestPosse']));
});

test('maps the P513 arrest-posse domain module to its callable export', () => {
  const selected = selectorFor(['functions/src/arrestPosse.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(['calculateArrestPosse']));
});

test('selects the complete P238 production callable set from the live 0.5.23 baseline', () => {
  const files = execFileSync('git', ['diff', '--name-only', P238_DEPLOYMENT_BASELINE, P238_MAPPED_CANDIDATE], {
    encoding: 'utf8',
  }).split('\n').filter(Boolean);
  const selected = deploymentSelector({
    before: P238_DEPLOYMENT_BASELINE,
    after: P238_MAPPED_CANDIDATE,
    files,
    targets: ['hosting', 'functions'],
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    ...GORGONEION_REPAIR_CALLABLES,
    'runSmallShipMaintenance',
  ]));
});

test('fails closed when a historical full range mixes Philia with older index changes', () => {
  const after = '9fc824f5';
  const files = execFileSync('git', ['diff', '--name-only', P238_DEPLOYMENT_BASELINE, after], {
    encoding: 'utf8',
  }).split('\n').filter(Boolean);
  assert.throws(() => deploymentSelector({
    before: P238_DEPLOYMENT_BASELINE,
    after,
    files,
    targets: ['hosting', 'functions'],
  }), /Cannot safely map a Philia repair index change mixed with another callable or untracked source edit/);
});

test('fails closed on a post-receipt Philia/helper mix even with a verified old baseline and other runtime files', () => {
  const receipt = '2e413cfb58b56300b6003a57d031686cc776caa8';
  const before = '8e8640fe50d16c1a2ab93cdb858f6a6c6569fdcd';
  const receiptIndex = execFileSync('git', ['show', `${receipt}:functions/src/index.ts`], { encoding: 'utf8' });
  const after = 'candidate';
  const currentIndex = `${receiptIndex}\n` +
    "export const repairConsolesFromPhilia = onCall(async () => ({ status: 'stale' }));\n" +
    "function untrackedRepairHelper() { return 'changed'; }\n";
  const isAncestor = (ancestor, descendant) => (
    (ancestor === before && (descendant === receipt || descendant === after)) ||
    (ancestor === receipt && descendant === after)
  );
  assert.throws(() => deploymentSelector({
    before,
    after,
    files: [
      'functions/src/index.ts',
      'functions/src/actionAudit.ts',
      'src/components/PhiliaRepairPanel.tsx',
      'src/version.test.ts',
      'package.json',
      'package-lock.json',
    ],
    filesSinceBaseline: ['functions/src/index.ts', 'functions/src/actionAudit.ts'],
    targets: ['hosting', 'functions'],
    isAncestor,
    sourceAtRevision: (revision, file) => {
      assert.equal(file, 'functions/src/index.ts');
      if (revision === after) return currentIndex;
      return execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8' });
    },
  }), /Cannot safely map a Philia repair index change mixed with another callable or untracked source edit/);
});

test('maps the exact Gorgoneion member-event allowlist delta to its repair callable', () => {
  const selected = selectorFor(['functions/src/eventRedaction.ts'], {
    eventRedactionBefore: EVENT_REDACTION_BEFORE,
    eventRedactionAfter: EVENT_REDACTION_P244_BEFORE,
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(GORGONEION_REPAIR_CALLABLES));
});

test('maps the exact Warrior member-event allowlist delta to its repair callable', () => {
  const selected = selectorFor(['functions/src/eventRedaction.ts'], {
    eventRedactionBefore: EVENT_REDACTION_P244_BEFORE,
    eventRedactionAfter: EVENT_REDACTION_P397_BEFORE,
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(WARRIOR_REPAIR_CALLABLES));
});

test('preserves the exact Endeavour allowlist mapping and deduplicates bundled reviewed additions', () => {
  const endeavourOnly = selectorFor(['functions/src/eventRedaction.ts'], {
    eventRedactionBefore: EVENT_REDACTION_WITHOUT_REVIEWED_ADDITIONS,
    eventRedactionAfter: EVENT_REDACTION_BEFORE,
  });
  assert.deepEqual(selectedFunctions(endeavourOnly), functionTargets(['upgradeEndeavourFieldTargets']));

  const bundled = selectorFor(['functions/src/eventRedaction.ts'], {
    eventRedactionBefore: EVENT_REDACTION_WITHOUT_REVIEWED_ADDITIONS,
  });
  assert.deepEqual(selectedFunctions(bundled), functionTargets([
    ...GORGONEION_REPAIR_CALLABLES,
    ...WARRIOR_REPAIR_CALLABLES,
    'upgradeEndeavourFieldTargets',
  ]));
});

test('maps each exact Maliades event field and envelope pair to its exported callable', () => {
  for (const { eventField, envelopeField, extraEntry = '', callable } of MALIADE_EVENT_REDACTION_ADDITIONS) {
    const before = EVENT_REDACTION_AFTER
      .replace(eventField, '').replace(envelopeField, '').replace(extraEntry, '');
    const selected = selectorFor(['functions/src/eventRedaction.ts'], {
      eventRedactionBefore: before,
      eventRedactionAfter: EVENT_REDACTION_AFTER,
    });
    assert.deepEqual(selectedFunctions(selected), functionTargets([callable]), callable);
  }

  const indexSource = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  assert.match(indexSource, /export const launchDioneMaliades\s*=\s*onCall/);
  assert.match(indexSource, /export\s*\{\s*repairMaliades,\s*resolveMaliadesMedium,\s*resolveMaliadesShort,\s*\}\s*from '\.\/maliadesCallable';/s);
});

test('maps the complete P397 event-redaction delta to its four current Maliades callables', () => {
  const selected = selectorFor(['functions/src/eventRedaction.ts'], {
    eventRedactionBefore: EVENT_REDACTION_P397_BEFORE,
    eventRedactionAfter: EVENT_REDACTION_AFTER,
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    'launchDioneMaliades', 'resolveMaliadesMedium', 'resolveMaliadesShort', 'repairMaliades',
  ]));
});

test('maps Maliades source modules to the exact callables that consume them', () => {
  for (const [file, callables] of Object.entries(MALIADE_SOURCE_MODULE_CALLABLES)) {
    const selected = selectorFor([file]);
    assert.deepEqual(selectedFunctions(selected), functionTargets(callables), file);
  }

  const indexSource = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  const callableSource = readFileSync(new URL('../functions/src/maliadesCallable.ts', import.meta.url), 'utf8');
  assert.match(indexSource, /type WolfAttackStageState,[\s\S]*from '\.\/wolfAttackDeclaration';/);
  assert.match(indexSource, /const stageState: WolfAttackStageState = \{/);
  assert.match(indexSource, /export const declareWolfAttack\s*=\s*onCall/);
  assert.match(indexSource, /export const getDioneMaliadesLaunch\s*=\s*onCall/);
  assert.match(indexSource, /export const launchDioneMaliades\s*=\s*onCall/);
  assert.match(indexSource, /beginMaliadesAttack,[\s\S]*launchMaliades,[\s\S]*parseMaliadesState,[\s\S]*from '\.\/maliadesState';/);
  assert.match(callableSource, /repairMaliades as repairMaliadesState,[\s\S]*type MaliadesMediumChoice,[\s\S]*from '\.\/maliadesState';/);
  assert.match(indexSource, /export\s*\{\s*repairMaliades,\s*resolveMaliadesMedium,\s*resolveMaliadesShort,\s*\}\s*from '\.\/maliadesCallable';/s);
});

test('maps an isolated Maliades repair callable change only to repairMaliades', () => {
  const selected = selectorFor(['functions/src/maliadesCallable.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(['repairMaliades']));
});

test('maps isolated Maliades range callable changes to their own targets', () => {
  const mediumOnly = MALIADE_CALLABLE_BEFORE.replace(
    "runMaliadesRangeAction(request, 'medium'));",
    "runMaliadesRangeAction(request, 'medium')); // reviewed medium-only change",
  );
  const shortOnly = MALIADE_CALLABLE_BEFORE.replace(
    "runMaliadesRangeAction(request, 'short'));",
    "runMaliadesRangeAction(request, 'short')); // reviewed short-only change",
  );
  assert.deepEqual(selectedFunctions(selectorFor(['functions/src/maliadesCallable.ts'], {
    maliadeCallableAfter: mediumOnly,
  })), functionTargets(['resolveMaliadesMedium']));
  assert.deepEqual(selectedFunctions(selectorFor(['functions/src/maliadesCallable.ts'], {
    maliadeCallableAfter: shortOnly,
  })), functionTargets(['resolveMaliadesShort']));
});

test('fails closed for mixed Maliades repair and range callable changes', () => {
  const changedMedium = MALIADE_CALLABLE_AFTER.replace(
    "runMaliadesRangeAction(request, 'medium'));",
    "runMaliadesRangeAction(request, 'medium')); // unreviewed mixed change",
  );
  const changedShort = MALIADE_CALLABLE_AFTER.replace(
    "runMaliadesRangeAction(request, 'short'));",
    "runMaliadesRangeAction(request, 'short')); // unreviewed mixed change",
  );
  assert.throws(() => selectorFor(['functions/src/maliadesCallable.ts'], {
    maliadeCallableAfter: changedMedium,
  }), /Cannot safely map Maliades callable changes/);
  assert.throws(() => selectorFor(['functions/src/maliadesCallable.ts'], {
    maliadeCallableAfter: changedShort,
  }), /Cannot safely map Maliades callable changes/);
});

test('fails closed if repair control revision parsing moves into the Medium request allowlist', () => {
  const withMediumControlKey = replaceMaliadeFixtureOnce(
    MALIADE_CALLABLE_AFTER,
    "    ? ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'choices']",
    "    ? ['sessionId', 'requestId', 'expectedCycle', 'expectedControlRevision', 'expectedRevision', 'choices']",
    'Medium allowlist',
  );
  const movedControlKey = replaceMaliadeFixtureOnce(
    withMediumControlKey,
    "      : ['sessionId', 'requestId', 'expectedCycle', 'expectedControlRevision', 'expectedRevision', 'expectedHostShipId', 'damageToRepair'];",
    "      : ['sessionId', 'requestId', 'expectedCycle', 'expectedRevision', 'expectedHostShipId', 'damageToRepair'];",
    'repair allowlist',
  );
  assert.throws(() => selectorFor(['functions/src/maliadesCallable.ts'], {
    maliadeCallableAfter: movedControlKey,
  }), /Cannot safely map Maliades callable changes/);
});

test('fails closed when an unknown Maliades shared helper changes', () => {
  const changedHelper = MALIADE_CALLABLE_AFTER.replace(
    'Only the active Dione Engineer may use Maliades.',
    'Only the active Dione Engineer may use this altered Maliades action.',
  );
  assert.throws(() => selectorFor(['functions/src/maliadesCallable.ts'], {
    maliadeCallableAfter: changedHelper,
  }), /Cannot safely map Maliades callable changes/);
});

test('maps PDF Escort Wing server modules to their exact deployed callable consumers', () => {
  for (const [file, callables] of Object.entries(PDF_ESCORT_WING_SOURCE_MODULE_CALLABLES)) {
    const selected = selectorFor([file]);
    assert.deepEqual(selectedFunctions(selected), functionTargets(callables), file);
  }

  const indexSource = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  assert.match(indexSource, /export const declareWolfAttack\s*=\s*onCall/);
  assert.match(indexSource, /export const getPdfEscortWingLaunch\s*=\s*onCall/);
  assert.match(indexSource, /export const launchPdfEscortWing\s*=\s*onCall/);
  assert.match(indexSource, /projectPdfEscortWingMemberView/);
});

test('maps away-mission server modules only to their audited deployed callable consumers', () => {
  const selected = selectorFor(Object.keys(AWAY_MISSION_SOURCE_MODULE_CALLABLES));
  assert.deepEqual(selectedFunctions(selected), functionTargets(['dealPrivateInitialCards']));

  const indexSource = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  assert.match(indexSource, /export const dealPrivateInitialCards\s*=\s*onCall/);
  assert.throws(
    () => selectorFor(['functions/src/missionLifecycle.ts']),
    /Functions changed but no named callable deployment could be proven/,
  );
});

test('maps the exact PC04 shared sign-in and mission guard transition to every affected callable', () => {
  const baseSha = '57dedeee3075230cadc6700fc35bcafe7f945343';
  const requestGuardsBefore = execFileSync(
    'git', ['show', `${baseSha}:functions/src/requestGuards.ts`], { encoding: 'utf8' },
  );
  const requestGuardsAfter = execFileSync('git', ['show', '7782840d:functions/src/requestGuards.ts'], { encoding: 'utf8' });
  const indexSource = execFileSync('git', ['show', '7782840d:functions/src/index.ts'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const boundaries = [...indexSource.matchAll(/^export const ([A-Za-z_$][\w$]*)\s*=/gm)];
  const expected = boundaries.flatMap((match, index) => {
    const block = indexSource.slice(match.index, boundaries[index + 1]?.index ?? indexSource.length);
    return /\bonCall\s*[<(]/.test(block) && block.includes('requireUid(') ? [match[1]] : [];
  });
  assert.ok(expected.includes('dealPrivateInitialCards'));

  const selected = deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/requestGuards.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      if (file === 'functions/src/requestGuards.ts') {
        return revision === 'base' ? requestGuardsBefore : requestGuardsAfter;
      }
      if (file === 'functions/src/index.ts') return indexSource;
      return '';
    },
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(expected));
});

test('fails closed when WolfAttackDeclaration changes beyond the exact type-only attack-state fields', () => {
  const altered = WOLF_ATTACK_DECLARATION_AFTER.replace(
    "  return state.status !== 'resolved' || state.airspaceLocked !== false ||",
    '  return false || state.airspaceLocked !== false ||',
  );
  assert.notEqual(altered, WOLF_ATTACK_DECLARATION_AFTER);
  assert.throws(
    () => selectorFor(['functions/src/wolfAttackDeclaration.ts'], {
      wolfAttackDeclarationAfter: altered,
    }),
    /Cannot safely map wolf attack declaration changes outside the exact reviewed type-only attack-state additions/,
  );
});

test('fails closed when a Maliades member-event allowlist expands beyond its exact privacy fields', () => {
  const medium = MALIADE_EVENT_REDACTION_ADDITIONS.find(({ callable }) => callable === 'resolveMaliadesMedium');
  const altered = EVENT_REDACTION_AFTER.replace(
    medium.eventField,
    "  'maliades-medium': ['craftId', 'cycle', 'revision', 'attackRoll'],\n",
  );
  assert.notEqual(altered, EVENT_REDACTION_AFTER);
  assert.throws(
    () => selectorFor(['functions/src/eventRedaction.ts'], {
      eventRedactionBefore: EVENT_REDACTION_P397_BEFORE,
      eventRedactionAfter: altered,
    }),
    /Cannot safely map event redaction changes outside the reviewed additive event field allowlists/,
  );
});

test('fails closed when the Gorgoneion event allowlist delta contains any unrelated edit', () => {
  assert.throws(
    () => selectorFor(['functions/src/eventRedaction.ts'], {
      eventRedactionBefore: EVENT_REDACTION_P397_BEFORE,
      eventRedactionAfter: `${EVENT_REDACTION_P397_BEFORE}// unrelated redaction change\n`,
    }),
    /Cannot safely map event redaction changes outside the reviewed additive event field allowlists/,
  );
});

test('maps the canonical Endeavour research resolver to its writer and P391 consumer', () => {
  const selected = selectorFor(['functions/src/endeavourResearch.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    ...ENDEAVOUR_RESEARCH_CALLABLES,
    'upgradeEndeavourFieldTargets',
  ]));
});

test('maps the Highwall mining state resolver to its callable', () => {
  const selected = selectorFor(['functions/src/highwallMining.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(['runHighwallMining']));
});

test('maps the Hummingbird stale-reply helper only to its two harvest callables', () => {
  const selected = selectorFor(['functions/src/hummingbirdHarvestStaleReply.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest',
  ]));
});

test('maps cadence policy changes to both private research callables', () => {
  const selected = selectorFor(['functions/src/endeavourResearchCadence.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(ENDEAVOUR_RESEARCH_CALLABLES));
});

test('maps candidate reveal and member discovery helpers to every production consumer', () => {
  const selected = selectorFor(['functions/src/candidateRevealProjection.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(CANDIDATE_REVEAL_CALLABLES));
});

test('maps only the reviewed candidate reveal addition in member discovery projection', () => {
  const selected = selectorFor(['functions/src/navigationProjection.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(CANDIDATE_REVEAL_CALLABLES));
});

test('fails closed when navigation projection carries an unrelated change with candidate reveals', () => {
  assert.throws(
    () => selectorFor(['functions/src/navigationProjection.ts'], {
      navigationAfter: `${NAVIGATION_PROJECTION_AFTER}// unrelated projection change\n`,
    }),
    /Cannot safely map navigation projection changes outside the additive candidate-reveal allowlist/,
  );
});

test('maps Commander reroll helpers without relying on index changes', () => {
  const selected = selectorFor(['functions/src/wolfCommanderRerolls.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(COMMAND_AND_CONTROL_CALLABLES));
});

test('deduplicates callables selected through both Wolf helper modules', () => {
  const selected = selectorFor([
    'functions/src/wolfCommandAndControl.ts',
    'functions/src/wolfCommanderRerolls.ts',
  ]);
  assert.deepEqual(selectedFunctions(selected), functionTargets(COMMAND_AND_CONTROL_CALLABLES));
});

test('maps the exact additive Command and Control console metadata delta to its current consumers', () => {
  const selected = selectorFor(['functions/src/consoleMetadata.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(CONSOLE_METADATA_CALLABLES));
});

test('maps standardized action audit helper changes to every production consumer', () => {
  const selected = selectorFor(['functions/src/actionAudit.ts']);
  assert.deepEqual(selected.split(','), [
    'hosting',
    'functions:scavengeDestroyedShipStores',
    'functions:adjustShipResource',
    'functions:adjustShipUnrest',
    'functions:adjustShipPopulation',
    'functions:applyShipCounterSteps',
    'functions:runHighwallMining',
    'functions:authorFacilitatorRuleCall',
    'functions:setFighterWingCount',
    'functions:repairAllShipDamage',
    'functions:addShipDamage',
  ]);
});

test('maps Press event builder changes to every authoritative writer', () => {
  const selected = selectorFor(['functions/src/pressLogEvent.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    'evacuateShuttleSurvivorsCommand',
    'applyCommissarPurge',
    'addShipDamage',
    'adjustShipPopulation',
    'applyShipCounterSteps',
    'runSmallShipMaintenance',
    'runVoyage33Maintenance',
    'runMaintenance',
    'recordPresidentActionCommand',
  ]));
});

test('matches the resolver ID addition in the real console metadata source', () => {
  assert.equal(CONSOLE_METADATA_AFTER.split(P436_RESOLVER_ID_ADDITION).length - 1, 1);
});

test('deduplicates the full Command and Control deployment callable set', () => {
  const selected = selectorFor([
    'functions/src/consoleMetadata.ts',
    'functions/src/wolfCommandAndControl.ts',
    'functions/src/wolfCommanderRerolls.ts',
  ]);
  assert.deepEqual(selectedFunctions(selected), functionTargets(P436_EXPORTS));
});

test('fails closed when console metadata includes an unrelated change', () => {
  assert.throws(
    () => selectorFor(['functions/src/consoleMetadata.ts'], {
      metadataAfter: `${CONSOLE_METADATA_AFTER}// unrelated metadata change\n`,
    }),
    /Cannot safely map console metadata changes outside the additive Command and Control resolver allowlist/,
  );
});

test('keeps unknown Functions helper paths fail-closed', () => {
  assert.throws(
    () => selectorFor(['functions/src/unmappedPrivateHelper.ts']),
    /No audited callable consumer map exists for changed Functions module functions\/src\/unmappedPrivateHelper\.ts/,
  );
});

test('keeps mixed known and unknown Functions helper paths fail-closed', () => {
  assert.throws(
    () => selectorFor([
      'functions/src/wolfCommandAndControl.ts',
      'functions/src/unmappedPrivateHelper.ts',
    ]),
    /No audited callable consumer map exists for changed Functions module functions\/src\/unmappedPrivateHelper\.ts/,
  );
});

test('PC05 setup and maintenance candidate selects runtime consumers before release', () => {
  const before = '7782840d';
  const after = PC05_REVIEWED_CANDIDATE;
  const files = execFileSync('git', ['diff', '--name-only', `${before}..${after}`], {
    encoding: 'utf8',
  }).trim().split('\n');
  const selected = deploymentSelector({ before, after, files, targets: ['hosting', 'functions'] });
  for (const name of [
    'startGame', 'confirmSetup', 'joinSession', 'resumeSession', 'assignLoyalty',
    'runMaintenance', 'rerollVipUnrest', 'resolveShipMutiny',
    'runSmallShipMaintenance', 'runVoyage33Maintenance', 'jumpShip',
  ]) {
    assert.ok(selected.split(',').includes(`functions:${name}`), `${name} must receive the PC05 contract`);
  }
});


test('maps every reviewed mutiny authority consumer in isolation', () => {
  const selected = selectorFor(['functions/src/mutiny.ts']);
  for (const name of ['getAegisCommandAndControl', 'applyAegisCommandAndControl',
    'getDioneMaliadesLaunch', 'launchDioneMaliades', 'getPdfEscortWingLaunch',
    'launchPdfEscortWing', 'runHighwallMining', 'requestScout',
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest']) {
    assert.ok(selected.split(',').includes(`functions:${name}`), name);
  }
});

test('maps factory-created setup consumers in isolation', () => {
  const selected = selectorFor(['functions/src/gameSetup.ts']);
  for (const name of ['resolvePendingScoutRequest', 'parkShuttlesAtAirspaceClosure']) {
    assert.ok(selected.split(',').includes(`functions:${name}`), name);
  }
});

test('maps only the additive reconnect taxonomy change and rejects unrelated error changes', () => {
  const source = readFileSync('functions/src/commandErrors.ts', 'utf8');
  const addition = "  'station-selection-required',\n";
  const select = (afterSource) => deploymentSelector({
    before: 'before', after: 'after', files: ['functions/src/commandErrors.ts'],
    targets: ['functions'], isAncestor: () => false,
    sourceAtRevision: (revision) => revision === 'before' ? source.replace(addition, '') : afterSource,
  });
  assert.deepEqual(selectedFunctions(select(source)), functionTargets(['joinSession', 'resumeSession', 'refreshPresence']));
  assert.throws(() => select(source + '// unrelated runtime edit\n'), /Cannot safely map command error changes/);
});


const PC05_ADDITIONAL_AUTHORITY_CONSUMERS = {
  "shuttleDocking": [
    "transferShuttleControlCommand"
  ],
  "wolfActionAuthorization": [
    "startWolfConsoleVisit",
    "resolveWolfConsoleSabotage",
    "submitWolfSupplySabotage",
    "submitWolfHomingBeacon",
    "submitWolfIntelligence"
  ],
  "mutiny": [
    "repairGorgoneionWithDrones",
    "repairWarriorWithDrones",
    "transferBaseCapybaraCargo",
    "startGame",
    "assignReplacementRole",
    "joinSession",
    "resumeSession",
    "moveShipToLocation",
    "jumpShip",
    "setShipConsoleLock",
    "advanceTurn",
    "startSinglePlayerDemo",
    "setWolfAttackWindow",
    "declareWolfAttack",
    "getAegisCommandAndControl",
    "applyAegisCommandAndControl",
    "getDioneMaliadesLaunch",
    "launchDioneMaliades",
    "getPdfEscortWingLaunch",
    "launchPdfEscortWing",
    "unlockPressAirspace",
    "adjustShipResource",
    "adjustShipUnrest",
    "dismissUnrestAlert",
    "resolveShipMutiny",
    "addShipDamage",
    "adjustShipPopulation",
    "applyShipCounterSteps",
    "setFighterWingCount",
    "buildFighter",
    "dismissPopulationAlert",
    "runHighwallMining",
    "requestScout",
    "rollHummingbirdHarvest",
    "setSmallShipDocking",
    "runSmallShipMaintenance",
    "runVoyage33Maintenance",
    "runVulcanAdditionalLabour",
    "runMaintenance",
    "drawVipCard",
    "transferVipCard",
    "rerollVipUnrest",
    "publishAdmiralDirectiveCommand",
    "recordPresidentActionCommand",
    "updatePoliticalCapital",
    "setFleetRedAlert",
    "repairAllShipDamage",
    "rollbackMaintenance"
  ],
  "voyage33Maintenance": [
    "startGame",
    "joinSession",
    "resumeSession",
    "advanceTurn",
    "startSinglePlayerDemo",
    "resolveShipMutiny",
    "addShipDamage",
    "runVoyage33Maintenance",
    "runMaintenance"
  ]
};
for (const [moduleName, consumers] of Object.entries(PC05_ADDITIONAL_AUTHORITY_CONSUMERS)) {
  test(`maps isolated PC05 ${moduleName} authority changes`, () => {
    const selected = selectorFor([`functions/src/${moduleName}.ts`]).split(',');
    for (const name of consumers) assert.ok(selected.includes(`functions:${name}`), name);
  });
}

test('maps only the reviewed pending-rerole navigation exclusion to its runtime consumers', () => {
  const source = readFileSync('functions/src/navigationProjection.ts', 'utf8');
  const addition = "  if (player.get('replacementStatus') != null) return undefined;\n";
  const select = (afterSource) => deploymentSelector({
    before: 'before', after: 'after', files: ['functions/src/navigationProjection.ts'],
    targets: ['functions'], isAncestor: () => false,
    sourceAtRevision: (revision) => revision === 'before' ? source.replace(addition, '') : afterSource,
  });
  assert.deepEqual(selectedFunctions(select(source)), functionTargets(["activateEndeavourEcmDevice", "resolvePendingScoutRequest", "createSession", "confirmSetup", "startGame", "dealPrivateInitialCards", "assignReplacementRole", "setCandidatePlanCheckpoint", "joinSession", "resumeSession", "moveShipToLocation", "jumpShip", "listUnresolvedJumpFailures", "adjudicateFailedJump", "advanceTurn", "startSinglePlayerDemo", "declareWolfAttack", "submitWolfHomingBeacon", "requestScout", "runMaintenance"]));
  assert.throws(() => select(source + '// unrelated runtime edit\n'), /Cannot safely map navigation projection changes/);
});

test('maps the shared pursuit decision pause to every indexed action and external writer', () => {
  const selected = selectorFor(['functions/src/pursuitEmergencyWindow.ts']).split(',');
  for (const name of [
    'advanceTurn', 'jumpShip', 'runMaintenance', 'activateEndeavourEcmDevice',
    'advanceEndeavourResearchTrack', 'repairMaliades',
  ]) assert.ok(selected.includes(`functions:${name}`), name);
});

test('maps the exact PC05 ECM pause addition only to the activation writer', () => {
  const before = '7782840da0defcf64428877cf6d37249d49b5ffa';
  const after = PC05_REVIEWED_CANDIDATE;
  const selected = deploymentSelector({
    before, after, files: ['functions/src/endeavourEcmDeviceWriter.ts'], targets: ['functions'],
  });
  assert.deepEqual(selectedFunctions(selected), functionTargets(['activateEndeavourEcmDevice']));
});

test('selects exactly 138 named Functions for the exact PC05 release range', () => {
  const before = '0ba386f50689b375153ceee3b2eb11a9ecd19435';
  const verificationBefore = '7782840da0defcf64428877cf6d37249d49b5ffa';
  const after = PC05_REVIEWED_CANDIDATE;
  const files = execFileSync('git', ['diff', '--name-only', `${before}..${after}`], {
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const filesSinceBaseline = execFileSync(
    'git', ['diff', '--name-only', `${verificationBefore}..${after}`], { encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean);
  const classification = classifyChangedFiles(files);
  assert.deepEqual(classification.unknownFiles, []);
  const selected = selectedFunctions(deploymentSelector({
    before, after, files, filesSinceBaseline, targets: classification.targets,
  }));
  assert.equal(new Set(selected).size, 138);
  assert.equal(selected.length, 138);
});


test('maps the exact PC05 jump request contract and rejects an unrelated guard edit', () => {
  const beforeSource = execFileSync('git', ['show', '7782840d:functions/src/requestGuards.ts'], { encoding: 'utf8' });
  const afterSource = execFileSync('git', ['show', `${PC05_REVIEWED_CANDIDATE}:functions/src/requestGuards.ts`], { encoding: 'utf8' });
  const select = (source) => deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/requestGuards.ts'], targets: ['functions'], isAncestor: () => false,
    sourceAtRevision: (revision) => revision === 'base' ? beforeSource : source,
  });
  assert.deepEqual(selectedFunctions(select(afterSource)), functionTargets([
    'advanceTurn', 'jumpShip', 'listUnresolvedJumpFailures', 'adjudicateFailedJump',
  ]));
  assert.throws(() => select(afterSource + '// unrelated guard change\n'), /Cannot safely map request-guard changes/);
});

test('maps only the audited member jump event fields to their writers', () => {
  const source = execFileSync('git', ['show', `${PC05_REVIEWED_CANDIDATE}:functions/src/eventRedaction.ts`], { encoding: 'utf8' });
  const addition = "  'ship-jump': ['shipId', 'outcome', 'length', 'failureRoll', 'failureThreshold', 'fuelSpent', 'damageCount', 'emergency'],\n";
  const select = (afterSource) => deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/eventRedaction.ts'], targets: ['functions'], isAncestor: () => false,
    sourceAtRevision: (revision) => revision === 'base' ? source.replace(addition, '') : afterSource,
  });
  assert.deepEqual(selectedFunctions(select(source)), functionTargets(['jumpShip', 'adjudicateFailedJump']));
  assert.throws(() => select(source.replace("'fuelSpent', 'damageCount'", "'destination', 'fuelSpent', 'damageCount'")), /Cannot safely map event redaction changes/);
});

test('maps ship damage helpers to all audited runtime consumers', () => {
  const selected = selectorFor(['functions/src/shipDamage.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets(["repairConsolesFromAlly", "repairGorgoneionWithDrones", "repairWarriorWithDrones", "transferBaseCapybaraCargo", "readEndeavourResearchWorkspace", "repairMaliades", "createSession", "startGame", "rechargeHostConsoleFromShuttle", "repairConsolesFromBlacksmith", "repairConsolesFromPhilia", "repairConsolesFromMacaw", "repairConsolesFromChacau", "upgradeEndeavourFieldTargets", "joinSession", "resumeSession", "moveShipToLocation", "jumpShip", "adjudicateFailedJump", "advanceTurn", "startSinglePlayerDemo", "getAegisCommandAndControl", "applyAegisCommandAndControl", "getDioneMaliadesLaunch", "launchDioneMaliades", "getPdfEscortWingLaunch", "launchPdfEscortWing", "startWolfConsoleVisit", "resolveWolfConsoleSabotage", "submitWolfSupplySabotage", "acknowledgeWolfHackingAlert", "fleeDestroyedShip", "scavengeDestroyedShipStores", "addShipDamage", "buildFighter", "runVulcanAdditionalLabour", "runMaintenance", "drawVipCard", "repairAllShipDamage"]));
});


test('includes failed-jump adjudication in its shared authority and consequence helpers', () => {
  for (const moduleName of ['mutiny', 'replacementRoles', 'smallShip', 'gameSetup', 'shipPopulation']) {
    assert.ok(selectorFor([`functions/src/${moduleName}.ts`]).split(',').includes('functions:adjudicateFailedJump'), moduleName);
  }
});

test('includes unchanged callable bodies affected by PC05 index-local authority helpers', () => {
  const before = '7782840d';
  const after = PC05_REVIEWED_CANDIDATE;
  const selected = deploymentSelector({ before, after, files: ['functions/src/index.ts'], targets: ['functions'] }).split(',');
  for (const name of ['transferShuttleCargoCommand', 'recycleWithBoa', 'requestShuttleDeparture',
    'beginShuttleTransit', 'retargetShuttleTransit', 'publishPressDispatch', 'dismissPressDispatch',
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
    'investigateAsIntelligenceAgent', 'fleeDestroyedShip', 'rollDice']) {
    assert.ok(selected.includes(`functions:${name}`), `${name} consumes a changed shared authority helper`);
  }
});

test('fails closed when PC05 shared index code changes beyond the audited candidate', () => {
  const beforeSource = execFileSync('git', ['show', '7782840d:functions/src/index.ts'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const afterSource = readFileSync('functions/src/index.ts', 'utf8') + '\n// unaudited shared helper change\n';
  assert.throws(() => deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/index.ts'], targets: ['functions'], isAncestor: () => false,
    sourceAtRevision: (revision) => revision === 'base' ? beforeSource : afterSource,
  }), /Cannot safely map PC05 shared index changes/);
});

const PC06_IMPLEMENTATION_CANDIDATE = '033260dede184135406aba608a3f58093e94df0a';
const pc06SourceAtRevision = (revision, file) => {
  try { return execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }); }
  catch { if (revision === PC05_REVIEWED_CANDIDATE) return ''; throw new Error(`Missing candidate source ${file}`); }
};
const selectPc06 = (files, sourceAtRevision = pc06SourceAtRevision) => deploymentSelector({
  before: PC05_REVIEWED_CANDIDATE, after: PC06_IMPLEMENTATION_CANDIDATE,
  files, targets: ['functions'], sourceAtRevision, isAncestor: () => false,
});
for (const [file, names] of Object.entries({
  'smallShipJump': ['getSmallShipJumpWorkspace', 'jumpSmallShip', 'setSmallShipDocking'],
  'boardingSecurityTeamCallable': ['getBoardingSecurityTeamLocations'],
  'missionCraftCommitment': ['beginShuttleTransit', 'commitAwayMissionLifecycleCommand', 'dealPrivateInitialCards', 'getSmallShipJumpWorkspace', 'jumpShip', 'jumpSmallShip', 'launchPdfEscortWing', 'moveShipToLocation', 'requestShuttleDeparture', 'retargetShuttleTransit', 'setSmallShipDocking'],
  'fleetPartition': ['confirmFleetPartition', 'joinSession', 'resumeSession'],
  'awayMissionLifecycleCallable': ['commitAwayMissionLifecycleCommand'],
  'explorationRewards': ['commitAwayMissionLifecycleCommand'],
  'missionRewardDelivery': ['commitAwayMissionLifecycleCommand'],
  'gorgoneionMissionSupportCallable': ['getGorgoneionMissionSupportProjection', 'applyGorgoneionMissionSupport'],
  'permissionedDismantlingCallable': ['proposePermissionedDismantling', 'consentToPermissionedDismantling', 'declinePermissionedDismantling', 'revokePermissionedDismantlingConsent', 'applyPermissionedDismantling'],
  'voyage33MovementCallable': ['dockVoyage33', 'jumpVoyage33'],
  'sameTableTradeCallable': ['attestPlayerHeldTokenBaseline', 'createSameTableTradeOffer', 'acceptSameTableTradeOffer'],
})) {
  test(`selects all connected PC06 ${file} consumers`, () => {
    assert.deepEqual(selectedFunctions(selectPc06([`functions/src/${file}.ts`])), functionTargets(names));
  });
}
test('selects the PC06 private navigation and shared index helper writers', () => {
  const navigation = selectedFunctions(selectPc06(['functions/src/navigationProjection.ts']));
  for (const name of ['commitAwayMissionLifecycleCommand', 'confirmFleetPartition', 'joinSession', 'resumeSession', 'jumpShip', 'moveShipToLocation']) assert.ok(navigation.includes(`functions:${name}`), name);
  const index = selectedFunctions(selectPc06(['functions/src/index.ts']));
  for (const name of ['recycleWithBoa', 'publishPressDispatch', 'runMaintenance', 'sendFleetGroupMessage', 'jumpSmallShip']) assert.ok(index.includes(`functions:${name}`), name);
});

const sha256 = source => createHash('sha256').update(source).digest('hex');
const voyageHostSyncConsumerNames = ['adjudicateFailedJump', 'jumpShip', 'moveShipToLocation'];
for (const [file, mapPath, consumers] of [
  ['functions/src/voyage33Movement.ts', 'modules', [
    'adjudicateFailedJump', 'dockVoyage33', 'joinSession', 'jumpShip', 'jumpVoyage33',
    'moveShipToLocation', 'resumeSession',
  ]],
  ['functions/src/index.ts', 'indexTransitions', voyageHostSyncConsumerNames],
]) {
  test(`maps the exact Voyage host movement consumers for ${file}`, () => {
    const previous = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const current = readFileSync(file, 'utf8');
    const dependencyMap = JSON.parse(readFileSync('scripts/pc06-deployment-consumers.json', 'utf8'));
    const priorDigest = sha256(previous);
    const currentDigest = sha256(current);
    assert.notEqual(currentDigest, priorDigest, 'the mapped host-sync source must differ from the committed baseline');
    const transitions = mapPath === 'modules'
      ? dependencyMap.moduleTransitions?.[file] ?? []
      : dependencyMap[mapPath] ?? [];
    const transition = transitions.find(candidate => candidate.before === priorDigest && candidate.after === currentDigest);
    assert.deepEqual(transition?.consumers, consumers);
    const selected = selectedFunctions(deploymentSelector({
      before: 'host-sync-baseline', after: 'host-sync-candidate', files: [file], targets: ['functions'],
      sourceAtRevision: revision => revision === 'host-sync-baseline' ? previous : current,
      isAncestor: () => false,
    }));
    assert.deepEqual(selected, functionTargets(consumers));
  });
}
test('rejects a changed PC06 source outside its explicit module or index audit', () => {
  for (const file of ['functions/src/smallShipJump.ts', 'functions/src/navigationProjection.ts', 'functions/src/index.ts']) {
    assert.throws(() => selectPc06([file], (revision, path) => pc06SourceAtRevision(revision, path) +
      (revision === PC06_IMPLEMENTATION_CANDIDATE && path === file ? '\n// unaudited authority edit\n' : '')), /PC06|audited|audit/);
  }
});

const refuelSourceAtRevision = (revision) => execFileSync('git', [
  'show', `${revision === 'base' ? '1f4558b11c53d8e70c76119c27483e40a180c681' : '4c255fb0f974cf9505c956d547de67e4b647401b'}:functions/src/index.ts`,
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
test('deploys runMaintenance for its helper-only Firestore refuel receipt repair', () => {
  assert.deepEqual(selectedFunctions(deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'], targets: ['functions'],
    sourceAtRevision: refuelSourceAtRevision, isAncestor: () => false,
  })), ['functions:runMaintenance']);
});
test('rejects additional index edits mixed with the audited refuel receipt repair', () => {
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts'], targets: ['functions'],
    sourceAtRevision: (revision) => refuelSourceAtRevision(revision) +
      (revision === 'candidate' ? '\n// unaudited helper edit\n' : ''), isAncestor: () => false,
  }), /PC06|audit/);
});

const partitionSourceAtRevision = (revision, file) => execFileSync('git', [
  'show', `${revision === 'base' ? 'a43a7acd2037941a05108588515b8c7e12564551' : 'db16d3ee615d3c2e78f79e877b01cf261e76485a'}:${file}`,
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
test('deploys the fleet partition repair and its exact mission eligibility helper', () => {
  assert.deepEqual(selectedFunctions(deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/index.ts', 'functions/src/missionEligibility.ts'],
    targets: ['functions'], sourceAtRevision: partitionSourceAtRevision, isAncestor: () => false,
  })), ['functions:confirmFleetPartition']);
});
test('rejects unaudited mission eligibility edits mixed with the partition repair', () => {
  assert.throws(() => deploymentSelector({
    before: 'base', after: 'candidate', files: ['functions/src/missionEligibility.ts'], targets: ['functions'],
    sourceAtRevision: (revision, file) => partitionSourceAtRevision(revision, file) +
      (revision === 'candidate' ? '\n// unaudited mission policy edit\n' : ''), isAncestor: () => false,
  }), /audited|audit/i);
});

const taxiSourceAtRevision = (revision, file) => revision === 'base' && file === 'functions/src/scoutTaxiCommunication.ts'
  ? '' : execFileSync('git', ['show', `${revision === 'base' ? 'de80e029d242f750690fa0460a46dc9ef9c82b00' : '137bd64b'}:${file}`],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
test('deploys the separate scout taxi courier and only its exact new contract consumer', () => {
  assert.deepEqual(selectedFunctions(deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/index.ts', 'functions/src/scoutTaxiCommunication.ts'], targets: ['functions'],
    sourceAtRevision: taxiSourceAtRevision, isAncestor: () => false,
  })), ['functions:sendScoutTaxiCourier']);
});
test('rejects an unaudited taxi contract edit rather than silently using the courier map', () => {
  assert.throws(() => deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/scoutTaxiCommunication.ts'], targets: ['functions'],
    sourceAtRevision: (revision, file) => taxiSourceAtRevision(revision, file) +
      (revision === 'candidate' ? '\n// unaudited route authority edit\n' : ''), isAncestor: () => false,
  }), /audited|audit/i);
});

const voyageRepairSourceAtRevision = (revision, file) => execFileSync('git', ['show',
  `${revision === 'base' ? 'a1fd66dc5014ff3c9ea8035edecd8ca394e3d76c' : '5747d1a4'}:${file}`,
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
test('deploys only the exact Voyage jump authority repair consumer', () => {
  assert.deepEqual(selectedFunctions(deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/voyage33MovementCallable.ts'], targets: ['functions'],
    sourceAtRevision: voyageRepairSourceAtRevision, isAncestor: () => false,
  })), ['functions:jumpVoyage33']);
});
test('rejects extra Voyage adapter edits mixed with the exact jump repair', () => {
  assert.throws(() => deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/voyage33MovementCallable.ts'], targets: ['functions'],
    sourceAtRevision: (revision, file) => voyageRepairSourceAtRevision(revision, file) +
      (revision === 'candidate' ? '\n// unaudited authority edit\n' : ''), isAncestor: () => false,
  }), /audited|audit/i);
});

const starlightRepairSourceAtRevision = (revision, file) => execFileSync('git', ['show',
  `${revision === 'base' ? 'a1fd66dc5014ff3c9ea8035edecd8ca394e3d76c' : 'f274dd44'}:${file}`,
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
test('deploys both exact current Starlight fuel policy consumers', () => {
  assert.deepEqual(selectedFunctions(deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/starlightScout.ts'], targets: ['functions'],
    sourceAtRevision: starlightRepairSourceAtRevision, isAncestor: () => false,
  })), ['functions:requestScout', 'functions:sendScoutTaxiCourier']);
});
test('rejects unaudited Starlight fuel policy edits', () => {
  assert.throws(() => deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/starlightScout.ts'], targets: ['functions'],
    sourceAtRevision: (revision, file) => starlightRepairSourceAtRevision(revision, file) +
      (revision === 'candidate' ? '\n// unaudited scout authority\n' : ''), isAncestor: () => false,
  }), /audited|audit/i);
});

const voyageCycleSourceAtRevision = (revision, file) => execFileSync('git', ['show',
  `${revision === 'base' ? 'a1fd66dc5014ff3c9ea8035edecd8ca394e3d76c' : 'ebd0e6fd'}:${file}`,
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
test('deploys the captured-cycle Voyage command and its sole local receipt helper consumer', () => {
  assert.deepEqual(selectedFunctions(deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/index.ts'], targets: ['functions'],
    sourceAtRevision: voyageCycleSourceAtRevision, isAncestor: () => false,
  })), ['functions:runVoyage33Maintenance']);
});
test('rejects an unaudited index helper edit mixed with Voyage cycle reconciliation', () => {
  assert.throws(() => deploymentSelector({ before: 'base', after: 'candidate',
    files: ['functions/src/index.ts'], targets: ['functions'],
    sourceAtRevision: (revision, file) => voyageCycleSourceAtRevision(revision, file) +
      (revision === 'candidate' ? '\n// unaudited shared helper edit\n' : ''), isAncestor: () => false,
  }), /PC06|audit/i);
});
