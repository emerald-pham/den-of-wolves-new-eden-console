import assert from 'node:assert/strict';
import {test} from 'node:test';
import {classifyChangedFiles} from './deployment-targets.mjs';

test('the PC09 prepared review entry is a Hosting deployment input', () => {
  const result = classifyChangedFiles(['pc09-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});
