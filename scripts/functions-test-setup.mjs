// Vitest global setup for the Functions test project. A clean checkout has
// neither the Functions dependencies nor the generated casting core under
// functions/lib, and both otherwise surface as module-resolution failures
// reported as test failures. Stop at once with one instruction when the
// dependencies are missing; build the generated core before tests load.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

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
  buildCastingCoreAtomically(root);
}

/**
 * Build the casting core the way scripts/build-casting-companion-core.mjs
 * does, into a temporary file beside it, then rename it into place. A test
 * worker or concurrent run that already opened the previous core keeps
 * reading it whole instead of a half-written file. The build script stays
 * unchanged because editing it selects a Functions deploy; a test pins the
 * two outputs to the same bytes.
 */
function buildCastingCoreAtomically(root) {
  const outfile = resolve(root, 'functions', 'lib', 'casting-companion-core.cjs');
  const temporary = resolve(dirname(outfile), `.casting-companion-core.${process.pid}.${randomBytes(6).toString('hex')}.tmp.cjs`);
  mkdirSync(dirname(outfile), { recursive: true });
  try {
    buildSync({
      absWorkingDir: root,
      entryPoints: [resolve(root, 'functions', 'casting-companion-entry.mjs')],
      outfile: temporary,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      sourcemap: false,
      logLevel: 'error',
    });
    renameSync(temporary, outfile);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export default function setup() {
  prepareFunctionsTests();
}
