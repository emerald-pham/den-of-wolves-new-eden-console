// Vitest global setup for the Functions test project. A clean checkout has
// neither the Functions dependencies nor the generated casting core under
// functions/lib, and both otherwise surface as module-resolution failures
// reported as test failures. Stop at once with one instruction when the
// dependencies are missing; build the generated core before tests load.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function functionsTestPrerequisiteError(root = ROOT) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'functions', 'package.json'), 'utf8'));
  const missing = Object.keys(manifest.dependencies ?? {})
    .filter((name) => !existsSync(resolve(root, 'functions', 'node_modules', name, 'package.json')))
    .sort();
  if (missing.length === 0) return null;
  return `Functions dependencies are not installed (missing ${missing.join(', ')}). ` +
    'Run `npm ci --prefix functions`, then rerun the Functions tests.';
}

/**
 * Build the generated casting core under `root`, or stop the process with only
 * the install instruction. Exiting here, rather than throwing, keeps Vitest
 * from adding a stack trace and a "No test files found" report.
 */
export function prepareFunctionsTests(root = ROOT) {
  const error = functionsTestPrerequisiteError(root);
  if (error) {
    process.stderr.write(`${error}\n`);
    process.exit(1);
  }
  execFileSync(process.execPath, [resolve(root, 'scripts', 'build-casting-companion-core.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
}

export default function setup() {
  prepareFunctionsTests();
}
