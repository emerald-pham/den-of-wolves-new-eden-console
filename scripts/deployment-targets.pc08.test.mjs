import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyChangedFiles} from './deployment-targets.mjs';

test('the standalone PC08 review page selects Hosting with no unknown deployment path', () => {
  const result = classifyChangedFiles(['pc08-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});
