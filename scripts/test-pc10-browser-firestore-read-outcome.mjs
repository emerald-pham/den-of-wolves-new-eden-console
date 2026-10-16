import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { unwrapBrowserFirestoreReadOutcome } from './pc10-two-browser-gameplay.mjs';

test('allowed browser reads preserve document, missing-document, and collection results', () => {
  const document = { id: 'visible-current-document', field: 'current value' };
  const collection = [{ id: 'visible-first-document' }, { id: 'visible-second-document' }];

  assert.deepEqual(unwrapBrowserFirestoreReadOutcome({ status: 'ok', value: document }), document);
  assert.equal(unwrapBrowserFirestoreReadOutcome({ status: 'ok', value: null }), null);
  assert.deepEqual(unwrapBrowserFirestoreReadOutcome({ status: 'ok', value: collection }), collection);
});

test('a permission-denied code captured in the browser is restored to the Node caller', () => {
  assert.throws(
    () => unwrapBrowserFirestoreReadOutcome({ status: 'error', code: 'permission-denied' }),
    error => error instanceof Error && error.code === 'permission-denied',
  );
});

test('unknown and code-less browser failures stay rejected instead of becoming permission denials', () => {
  assert.throws(
    () => unwrapBrowserFirestoreReadOutcome({ status: 'error', code: 'unavailable' }),
    error => error instanceof Error && error.code === 'unavailable' && error.code !== 'permission-denied',
  );
  assert.throws(
    () => unwrapBrowserFirestoreReadOutcome({ status: 'error', code: null }),
    error => error instanceof Error && error.code === undefined,
  );
});

test('the real shared browser read serializes only the SDK error code across page.evaluate', async () => {
  const source = await readFile(new URL('./pc10-two-browser-gameplay.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function read(roleId, suffix, { collection = false } = {})');
  const end = source.indexOf('\n  async function ui(', start);
  assert.ok(start >= 0 && end > start, 'Find the current shared browser read path.');
  const readImplementation = source.slice(start, end);

  assert.match(readImplementation, /return\s+\{\s*status:\s*'ok',\s*value\s*\}/);
  assert.match(readImplementation, /catch\s*\(error\)/,
    'Catch the original SDK error inside page.evaluate before it crosses to Node.');
  assert.match(readImplementation, /status:\s*'error',\s*code:\s*typeof error\?\.code === 'string' \? error\.code : null/,
    'Serialize the actual code without parsing messages or forwarding the error object.');
  assert.match(readImplementation, /unwrapBrowserFirestoreReadOutcome\(outcome\)/);
  assert.doesNotMatch(readImplementation, /error\.message|JSON\.stringify\(error\)/,
    'Keep SDK messages and payload details inside the browser context.');
});
