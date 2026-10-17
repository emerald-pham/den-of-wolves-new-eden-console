import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const compiler = resolve(root, 'node_modules/typescript/bin/tsc');

function compile(fixture) {
  return spawnSync(process.execPath, [compiler, '--noEmit', '--allowJs', '--skipLibCheck',
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--types', 'node', '--strict', resolve(root, 'scripts', fixture)], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('correct role-entry consumer reads current live identity from the checked snapshot', () => {
  const result = compile('pc10-role-entry-valid-consumer.mts');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout + result.stderr, '');
});

test('TypeScript rejects live identity reads from original role-entry actor metadata', () => {
  const result = compile('pc10-role-entry-invalid-consumer.mts');
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  const diagnostics = result.stdout + result.stderr;
  assert.match(diagnostics, /error TS2339: Property 'sameActor' does not exist on type .+\./);
  assert.equal((diagnostics.match(/error TS\d{4}:/g) ?? []).length, 1, diagnostics);
  assert.doesNotMatch(diagnostics, /TS2307|TS2688|Cannot find module|Cannot find type definition/);
});
