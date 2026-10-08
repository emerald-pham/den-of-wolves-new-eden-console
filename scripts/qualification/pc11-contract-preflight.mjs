import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const testFiles = Object.freeze([
  'scripts/qualification/pc11-normal-start-adapter.test.mjs',
  'scripts/qualification/pc11-three-actor-trade-philia.test.mjs',
  'scripts/qualification/pc11-live-base-contract.test.mjs',
]);

/** Cheap executable contract check. Never import the runner, start a browser,
 * initialize Firebase/Admin, contact a service, or reserve an emulator row. */
export function runPc11ContractPreflight(root = defaultRoot) {
  execFileSync(process.execPath, ['--test', ...testFiles], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PC11_RUNTIME_ALLOCATED: '', PC11_DIST_RUNTIME_ALLOCATED: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: 'PC11_SOURCE_CONTRACT_PREFLIGHT_PASS', testFiles: [...testFiles],
    browserProcesses: 0, sdkClients: 0, networkRequests: 0, runtimeProof: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(runPc11ContractPreflight(), null, 2)}\n`); }
  catch (error) { process.stderr.write(error.stdout || error.stderr || error.message); process.exitCode = 1; }
}
