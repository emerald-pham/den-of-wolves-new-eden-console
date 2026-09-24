import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deploymentSelector } from './deployment-targets.mjs';

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
const BASE_CAPYBARA_CARGO_CALLABLES = ['transferBaseCapybaraCargo'];
const SMALL_SHIP_MAINTENANCE_CALLABLES = ['runSmallShipMaintenance'];
const P238_DEPLOYMENT_BASELINE = '213efd24bedd65f5ef60c800f6dc8e63308af08b';
const P238_MAPPED_CANDIDATE = 'd005c510';
const CANDIDATE_REVEAL_CALLABLES = [
  'advanceTurn', 'assignReplacementRole', 'confirmSetup', 'joinSession', 'jumpShip',
  'moveShipToLocation', 'resumeSession', 'runMaintenance',
];
const P436_EXPORTS = [...COMMAND_AND_CONTROL_CALLABLES, ...CONSOLE_METADATA_CALLABLES];

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
const NAVIGATION_PROJECTION_AFTER = readFileSync(
  new URL('../functions/src/navigationProjection.ts', import.meta.url), 'utf8',
);
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
  ...BASE_CAPYBARA_CARGO_CALLABLES, ...SMALL_SHIP_MAINTENANCE_CALLABLES,
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
assert.equal(EVENT_REDACTION_AFTER.split(GORGONEION_EVENT_FIELD_ENTRY).length - 1, 1);
assert.equal(EVENT_REDACTION_AFTER.split(GORGONEION_ENVELOPE_FIELD_ENTRY).length - 1, 1);
assert.equal(EVENT_REDACTION_AFTER.split(WARRIOR_EVENT_FIELD_ENTRY).length - 1, 1);
assert.equal(EVENT_REDACTION_AFTER.split(WARRIOR_ENVELOPE_FIELD_ENTRY).length - 1, 1);
const EVENT_REDACTION_P244_BEFORE = EVENT_REDACTION_AFTER
  .replace(WARRIOR_EVENT_FIELD_ENTRY, '')
  .replace(WARRIOR_ENVELOPE_FIELD_ENTRY, '');
const EVENT_REDACTION_BEFORE = EVENT_REDACTION_AFTER
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
  eventRedactionAfter = EVENT_REDACTION_AFTER,
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

test('maps strict extra-ship admission to its assignment, projection, and repair consumers', () => {
  const selected = selectorFor(['functions/src/extraShipAdmission.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    'assignReplacementRole', 'joinSession', 'resumeSession',
    'repairGorgoneionWithDrones', 'repairWarriorWithDrones', ...BASE_CAPYBARA_CARGO_CALLABLES,
  ]));
});

test('maps replacement-role admission changes to assignment and cargo transfer consumers', () => {
  const selected = selectorFor(['functions/src/replacementRoles.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    'assignReplacementRole', ...BASE_CAPYBARA_CARGO_CALLABLES,
  ]));
});

test('maps small-ship maintenance changes only to the callables that execute the changed resolver', () => {
  const selected = selectorFor(['functions/src/smallShip.ts']);
  assert.deepEqual(selectedFunctions(selected), functionTargets([
    ...GORGONEION_REPAIR_CALLABLES,
    ...WARRIOR_REPAIR_CALLABLES,
    ...BASE_CAPYBARA_CARGO_CALLABLES,
    'runSmallShipMaintenance',
  ]));
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

test('selects the Warrior consumer on the full range after its callable enters the live export surface', () => {
  const after = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['diff', '--name-only', P238_DEPLOYMENT_BASELINE, after], {
    encoding: 'utf8',
  }).split('\n').filter(Boolean);
  const selected = deploymentSelector({
    before: P238_DEPLOYMENT_BASELINE,
    after,
    files,
    targets: ['hosting', 'functions'],
  });
  const deployed = selectedFunctions(selected);
  for (const name of [
    ...GORGONEION_REPAIR_CALLABLES,
    ...WARRIOR_REPAIR_CALLABLES,
    ...SMALL_SHIP_MAINTENANCE_CALLABLES,
  ]) {
    assert.ok(deployed.includes(`functions:${name}`), `${name} must be selected for the full shared-consumer range`);
  }
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
    eventRedactionAfter: EVENT_REDACTION_AFTER,
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

test('fails closed when the Gorgoneion event allowlist delta contains any unrelated edit', () => {
  assert.throws(
    () => selectorFor(['functions/src/eventRedaction.ts'], {
      eventRedactionAfter: `${EVENT_REDACTION_AFTER}// unrelated redaction change\n`,
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
