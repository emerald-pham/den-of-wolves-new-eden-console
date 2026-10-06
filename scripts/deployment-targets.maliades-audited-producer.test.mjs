import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deploymentSelector } from './deployment-targets.mjs';

const callableSource = readFileSync(
  new URL('../functions/src/maliadesCallable.ts', import.meta.url), 'utf8',
);
const indexSource = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
const repairExport = "export const repairMaliades = auditedOnCall('repairMaliades', CALLABLE_RUNTIME_OPTIONS, async request => {";

function makeLegacyRepairFixture(source) {
  const start = source.indexOf(repairExport);
  assert.notEqual(start, -1, 'fixture must start from the current audited repair producer');
  assert.equal(source.indexOf(repairExport, start + repairExport.length), -1);
  const end = source.indexOf('\n});', start + repairExport.length);
  assert.notEqual(end, -1, 'fixture must find the end of the current repair handler');
  return `${source.slice(0, start)}${repairExport}\n  void request;\n  return null;\n});\n`;
}

const legacyRepairFixture = makeLegacyRepairFixture(callableSource);

function selectMaliadesChange(candidate) {
  return deploymentSelector({
    before: 'legacy-fixture',
    after: 'current-producer',
    files: ['functions/src/index.ts', 'functions/src/maliadesCallable.ts'],
    targets: ['hosting', 'functions'],
    isAncestor: (ancestor, descendant) => ancestor === 'legacy-fixture' && descendant === 'current-producer',
    sourceAtRevision: (revision, file) => {
      if (file === 'functions/src/index.ts') return indexSource;
      if (file === 'functions/src/maliadesCallable.ts') {
        return revision === 'legacy-fixture' ? legacyRepairFixture : candidate;
      }
      return '';
    },
  });
}

function selectedFunctionNames(selected) {
  return selected.split(',').filter((target) => target.startsWith('functions:')).sort();
}

test('maps the current audited Maliades producer through the real deployment selector', () => {
  assert.deepEqual(selectedFunctionNames(selectMaliadesChange(callableSource)), ['functions:repairMaliades']);
});

test('keeps the current audited producer fail-closed when repair and range handlers change together', () => {
  const mixed = callableSource.replace(
    "runMaliadesRangeAction(request, 'medium'));",
    "runMaliadesRangeAction(request, 'medium')); // mixed source change",
  );
  assert.notEqual(mixed, callableSource);
  assert.throws(() => selectMaliadesChange(mixed), /mixed, empty, or ambiguous/i);
});

test('keeps shared Maliades producer drift fail-closed', () => {
  const sharedChange = callableSource.replace(
    'Only the active Dione Engineer may use Maliades.',
    'Only an altered active Dione Engineer may use Maliades.',
  );
  assert.notEqual(sharedChange, callableSource);
  assert.throws(() => selectMaliadesChange(sharedChange), /outside the exact repair-only CAS contract/i);
});
