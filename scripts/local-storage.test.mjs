import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorktrees, storageWarnings } from './local-storage.mjs';

test('NUL-delimited worktree paths preserve spaces and newlines', () => {
  assert.deepEqual(parseWorktrees('worktree /tmp/a b\0HEAD abc\0branch refs/heads/main\0\0worktree /tmp/new\nline\0HEAD def\0detached\0\0'), [
    { path: '/tmp/a b', branch: 'refs/heads/main' },
    { path: '/tmp/new\nline', branch: '(detached)' },
  ]);
});

test('warns independently about low storage and accumulated worktrees', () => {
  assert.equal(storageWarnings(2 * 1024 ** 3, 2).length, 1);
  assert.equal(storageWarnings(50 * 1024 ** 3, 349).length, 1);
  assert.equal(storageWarnings(2 * 1024 ** 3, 349).length, 2);
  assert.deepEqual(storageWarnings(20 * 1024 ** 3, 20), []);
});
