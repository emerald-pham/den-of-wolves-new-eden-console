import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const runner = join(root, 'scripts/pc10-security-http-proof.mjs');

async function runSelectedMode(args) {
  const temporary = await mkdtemp(join(tmpdir(), 'pc10-p631-dispatch-'));
  const tracePath = join(temporary, 'dispatch-trace.json');
  const loaderPath = join(temporary, 'loader.mjs');
  const fakeFilesPath = join(temporary, 'fake-fs-promises.mjs');
  const fakePlaywrightPath = join(temporary, 'fake-playwright.mjs');
  const fakeFixturePath = join(temporary, 'fake-pc07-authenticated-session.mjs');
  const fakeFocusedRunnerPath = join(temporary, 'fake-focused-runner.mjs');

  await writeFile(loaderPath, `
const files = ${JSON.stringify(pathToFileURL(fakeFilesPath).href)};
const playwright = ${JSON.stringify(pathToFileURL(fakePlaywrightPath).href)};
const fixture = ${JSON.stringify(pathToFileURL(fakeFixturePath).href)};
const focused = ${JSON.stringify(pathToFileURL(fakeFocusedRunnerPath).href)};
export async function resolve(specifier, context, nextResolve) {
  const fromSecurityRunner = context.parentURL?.endsWith('/scripts/pc10-security-http-proof.mjs');
  if (fromSecurityRunner && specifier === 'node:fs/promises') return { url: files, shortCircuit: true };
  if (fromSecurityRunner && specifier === 'playwright') return { url: playwright, shortCircuit: true };
  if (fromSecurityRunner && specifier === './pc07-authenticated-session.mjs') return { url: fixture, shortCircuit: true };
  if (fromSecurityRunner && specifier === './pc10-member-rate-security-ui-proof.mjs') return { url: focused, shortCircuit: true };
  return nextResolve(specifier, context);
}
`);
  await writeFile(fakeFilesPath, `
import * as real from 'node:fs/promises';
export const readFile = async (path, ...args) => String(path) === '.env.emulators.local'
  ? 'VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT=5011' : real.readFile(path, ...args);
export const readdir = async (path, ...args) => String(path) === 'functions/lib'
  ? [] : real.readdir(path, ...args);
export const mkdir = real.mkdir;
export const writeFile = real.writeFile;
`);
  await writeFile(fakePlaywrightPath, `
export const chromium = { launch: async () => { throw new Error('A browser must not start in the dispatch test.'); } };
`);
  await writeFile(fakeFixturePath, `
import { writeFile } from 'node:fs/promises';
export async function createPc07AuthenticatedSession(_name, playerCount, options = {}) {
  await writeFile(process.env.PC10_DISPATCH_TRACE, JSON.stringify({
    mode: 'legacy-security', playerCount, keepAlive: options.keepAlive === true,
  }));
  throw new Error('CONTROLLED_FIXTURE_STOP');
}
`);
  await writeFile(fakeFocusedRunnerPath, `
import { writeFile } from 'node:fs/promises';
export async function runP631MemberRateSecurityUiProof() {
  await writeFile(process.env.PC10_DISPATCH_TRACE, JSON.stringify({
    mode: 'p631-focused', actors: 2, fixturePlayers: 1,
  }));
}
`);

  const env = { ...process.env,
    PC10_SECURITY_EVIDENCE_PATH: join(temporary, 'unused-report.json'),
    PC10_SECURITY_UI_DIR: join(temporary, 'unused-ui'),
    PC07_LOCAL_GM_ORIGIN: 'http://127.0.0.1:5174',
    PC10_DISPATCH_TRACE: tracePath,
  };
  delete env.PC10_FUNCTIONS_SOURCE_COMMIT;
  try {
    const child = spawnSync(process.execPath,
      ['--no-warnings', '--experimental-loader', loaderPath, runner, ...args],
      { cwd: root, env, encoding: 'utf8', timeout: 10_000 });
    let trace = null;
    try { trace = JSON.parse(await readFile(tracePath, 'utf8')); } catch { /* A dispatch failure retains no trace. */ }
    return { child, trace };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test('security proof CLI dispatches the selected member-rate scope and preserves its default full mode', async () => {
  const legacy = await runSelectedMode([]);
  assert.equal(legacy.trace?.mode, 'legacy-security', legacy.child.stderr);
  assert.equal(legacy.trace?.playerCount, 8, 'The existing unselected security mode keeps its eight-player fixture.');
  assert.match(legacy.child.stderr, /CONTROLLED_FIXTURE_STOP/);

  const selected = await runSelectedMode(['--member-rate']);
  assert.equal(selected.trace?.mode, 'p631-focused',
    `The selected consumer must enter the focused P631 runner. Current dispatch observed: ${JSON.stringify(selected.trace)}`);
  assert.equal(selected.trace?.actors, 2);
  assert.equal(selected.trace?.fixturePlayers, 1);
  assert.equal(selected.child.status, 0, selected.child.stderr);
});
