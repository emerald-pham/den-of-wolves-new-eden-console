import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MANIFEST_PATH, validateThreatModel } from './validate-threat-model.mjs';

async function manifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}

test('accepts the checked-in threat model and its source evidence', async () => {
  assert.deepEqual(await validateThreatModel({ manifest: await manifest() }), []);
});

test('rejects an unmapped in-scope threat', async () => {
  const model = await manifest();
  model.threats.find((threat) => threat.id === 'SESSION_CODE_GUESSING').controlIds = [];
  assert.match(
    (await validateThreatModel({ manifest: model })).join('\n'),
    /SESSION_CODE_GUESSING: no controls mapped/,
  );
});

test('rejects a removed baseline control', async () => {
  const model = await manifest();
  model.controls = model.controls.filter((control) => control.id !== 'CALLABLE_APPCHECK');
  assert.match(
    (await validateThreatModel({ manifest: model })).join('\n'),
    /controls must inventory exactly/,
  );
});

test('rejects source-and-test controls with no focused test evidence', async () => {
  const model = await manifest();
  model.controls.find((control) => control.id === 'CALLABLE_APPCHECK').testChecks = [];
  const errors = (await validateThreatModel({ manifest: model })).join('\n');
  assert.match(errors, /reviewed per-control source\/test contract/);
  assert.match(errors, /CALLABLE_APPCHECK: source-and-test controls require focused test anchors/);
});

test('rejects unrelated files relabeled as source or test evidence', async () => {
  const model = await manifest();
  const control = model.controls.find((candidate) => candidate.id === 'CALLABLE_APPCHECK');
  control.sourceChecks = [{ file: 'package.json', contains: ['firebase'] }];
  control.testChecks = [{ file: 'package.json', contains: ['scripts'] }];
  assert.match(
    (await validateThreatModel({ manifest: model })).join('\n'),
    /reviewed per-control source\/test contract/,
  );
});

test('rejects unrelated source content replacing a reviewed anchor', async () => {
  assert.match(
    (await validateThreatModel({
      manifest: await manifest(),
      sourceOverrides: { 'functions/src/runtimeOptions.ts': 'export const unrelated = true;\n' },
    })).join('\n'),
    /CALLABLE_APPCHECK: functions\/src\/runtimeOptions\.ts is missing/,
  );
});

test('requires governance Markdown to trigger the gate on pushes and pull requests', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(
    (await validateThreatModel({
      manifest: await manifest(),
      sourceOverrides: {
        '.github/workflows/ci.yml': workflow.replaceAll("      - 'CLAUDE.md'\n", ''),
      },
    })).join('\n'),
    /CLAUDE\.md must trigger both pull_request and push validation/,
  );
});

test('rejects a runtime gap hidden inside the non-feature proof prompt', async () => {
  const model = await manifest();
  model.gapPolicy.demonstratedRuntimeGaps = ['raise callable capacity'];
  assert.match(
    (await validateThreatModel({ manifest: model })).join('\n'),
    /separately registered feature prompt/,
  );
});

test('rejects removal of the independent review receipt', async () => {
  const model = await manifest();
  model.trustModel.independentReviewReceipt = 'optional';
  assert.match(
    (await validateThreatModel({ manifest: model })).join('\n'),
    /must name the enforced exact-head coordination review and release gate/,
  );
});
