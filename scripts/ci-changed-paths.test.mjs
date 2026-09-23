import assert from 'node:assert/strict';
import test from 'node:test';
import { changedPaths, UNKNOWN_DIFF } from './ci-changed-paths.mjs';

const HEAD = 'a'.repeat(40);
const BEFORE = 'b'.repeat(40);
const MERGE_BASE = 'd'.repeat(40);

function fixture(overrides = {}) {
  const calls = [];
  const result = changedPaths({
    headSha: HEAD,
    pushBeforeSha: BEFORE,
    revisionExists: (revision) => {
      calls.push(['exists', revision]);
      return revision === BEFORE;
    },
    fetchRevision: (revision) => {
      calls.push(['fetch', revision]);
      return revision === FETCHED;
    },
    mergeBase: (...args) => {
      calls.push(['merge-base', ...args]);
      return MERGE_BASE;
    },
    diffNameOnly: (...args) => {
      calls.push(['diff', ...args]);
      return ['src/example.ts'];
    },
    ...overrides,
  });
  return { calls, result };
}

test('keeps an available branch before commit as the diff baseline', () => {
  const { calls, result } = fixture();
  assert.deepEqual(result.paths, ['src/example.ts']);
  assert.equal(result.source, 'push-before');
  assert.deepEqual(calls, [
    ['exists', BEFORE],
    ['diff', BEFORE, HEAD],
  ]);
});

test('fetches an unavailable branch before commit before using a fallback', () => {
  const calls = [];
  let fetched = false;
  const result = changedPaths({
    headSha: HEAD,
    pushBeforeSha: BEFORE,
    revisionExists: (revision) => {
      calls.push(['exists', revision]);
      return fetched;
    },
    fetchRevision: (revision) => {
      calls.push(['fetch', revision]);
      fetched = true;
      return true;
    },
    mergeBase: (...args) => {
      calls.push(['merge-base', ...args]);
      return MERGE_BASE;
    },
    diffNameOnly: (...args) => {
      calls.push(['diff', ...args]);
      return ['src/example.ts'];
    },
  });
  assert.deepEqual(result.paths, ['src/example.ts']);
  assert.equal(result.source, 'fetched-push-before');
  assert.deepEqual(calls, [
    ['exists', BEFORE],
    ['fetch', BEFORE],
    ['exists', BEFORE],
    ['diff', BEFORE, HEAD],
  ]);
});

test('uses origin/main merge-base when a force-push before commit cannot be fetched', () => {
  const calls = [];
  const result = changedPaths({
    headSha: HEAD,
    pushBeforeSha: BEFORE,
    revisionExists: (revision) => {
      calls.push(['exists', revision]);
      return false;
    },
    fetchRevision: (revision) => {
      calls.push(['fetch', revision]);
      return false;
    },
    mergeBase: (...args) => {
      calls.push(['merge-base', ...args]);
      return MERGE_BASE;
    },
    diffNameOnly: (...args) => {
      calls.push(['diff', ...args]);
      return ['src/example.ts'];
    },
  });
  assert.deepEqual(result.paths, ['src/example.ts']);
  assert.equal(result.source, 'merge-base');
  assert.deepEqual(calls, [
    ['exists', BEFORE],
    ['fetch', BEFORE],
    ['merge-base', 'origin/main', HEAD],
    ['diff', MERGE_BASE, HEAD],
  ]);
});

test('uses a full-gate sentinel when neither before nor merge-base is available', () => {
  const { calls, result } = fixture({
    revisionExists: () => false,
    fetchRevision: () => false,
    mergeBase: () => '',
  });
  assert.deepEqual(result.paths, [UNKNOWN_DIFF]);
  assert.equal(result.source, 'unknown');
  assert.equal(calls.some(([kind]) => kind === 'diff'), false);
});

test('uses origin/main merge-base for a branch event without a usable before commit', () => {
  const { result } = fixture({
    pushBeforeSha: '0'.repeat(40),
    mergeBase: () => MERGE_BASE,
  });
  assert.deepEqual(result.paths, ['src/example.ts']);
  assert.equal(result.source, 'merge-base');
});

test('preserves pull-request base selection and does not fetch a push before value', () => {
  const pullRequestBase = 'e'.repeat(40);
  const { calls, result } = fixture({
    pullRequestBaseSha: pullRequestBase,
    revisionExists: () => { throw new Error('must not inspect PR base'); },
    fetchRevision: () => { throw new Error('must not fetch PR base'); },
    mergeBase: () => { throw new Error('must not calculate PR merge-base'); },
  });
  assert.deepEqual(result.paths, ['src/example.ts']);
  assert.equal(result.source, 'pull-request');
  assert.deepEqual(calls, [['diff', pullRequestBase, HEAD]]);
});

test('treats an unchanged branch range as unknown instead of under-classifying it', () => {
  const { result } = fixture({
    pushBeforeSha: HEAD,
    revisionExists: () => true,
  });
  assert.deepEqual(result.paths, [UNKNOWN_DIFF]);
  assert.equal(result.source, 'unknown');
});

test('converts a branch diff failure into a full-gate sentinel', () => {
  const { result } = fixture({
    diffNameOnly: () => { throw new Error('missing object'); },
  });
  assert.deepEqual(result.paths, [UNKNOWN_DIFF]);
  assert.equal(result.source, 'unknown');
  assert.match(result.error.message, /missing object/);
});
