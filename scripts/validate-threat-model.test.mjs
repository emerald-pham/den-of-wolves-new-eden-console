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
    /must require an independent review receipt/,
  );
});
