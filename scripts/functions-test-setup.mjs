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

export default function setup() {
  const error = functionsTestPrerequisiteError();
  if (error) throw new Error(error);
  execFileSync(process.execPath, [resolve(ROOT, 'scripts', 'build-casting-companion-core.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}
