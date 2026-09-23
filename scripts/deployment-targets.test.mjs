import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentSelector } from './deployment-targets.mjs';

const P436_CALLABLES = [
  'applyAegisCommandAndControl',
  'applyWolfCommanderTargetRerolls',
  'finishWolfCommanderTargetingRerolls',
  'getAegisCommandAndControl',
  'getWolfCommanderTargeting',
  'rechargeHostConsoleFromShuttle',
  'runVulcanAdditionalLabour',
  'upgradeEndeavourFieldTargets',
];

function selectorFor(files) {
  return deploymentSelector({
    before: 'base',
    after: 'candidate',
    files: ['functions/src/index.ts', ...files],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'base' && descendant === 'candidate',
    sourceAtRevision: (revision, file) => {
      if (file !== 'functions/src/index.ts' || revision === 'base') return '';
      return P436_CALLABLES.map((name) => `export const ${name} = onCall(async () => {});`).join('\n');
    },
  });
}

test('maps Command and Control runtime helpers to every affected callable', () => {
  const selected = selectorFor([
    'functions/src/consoleMetadata.ts',
    'functions/src/wolfCommandAndControl.ts',
    'functions/src/wolfCommanderRerolls.ts',
  ]);
  assert.equal(selected.split(',')[0], 'hosting');
  assert.deepEqual(selected.split(',').slice(1).sort(), P436_CALLABLES.map((name) => `functions:${name}`).sort());
});

test('keeps unknown Functions helper paths fail-closed', () => {
  assert.throws(
    () => selectorFor(['functions/src/unmappedPrivateHelper.ts']),
    /No audited callable consumer map exists for changed Functions module functions\/src\/unmappedPrivateHelper\.ts/,
  );
});
