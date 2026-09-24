import assert from 'node:assert/strict';
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
const INDEX_SOURCE = P436_EXPORTS.map((name) => `export const ${name} = onCall(async () => {});`).join('\n');

function selectorFor(files, {
  metadataBefore = CONSOLE_METADATA_BEFORE,
  metadataAfter = CONSOLE_METADATA_AFTER,
  navigationBefore = NAVIGATION_PROJECTION_BEFORE,
  navigationAfter = NAVIGATION_PROJECTION_AFTER,
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
