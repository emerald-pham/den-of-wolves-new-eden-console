import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runProofTestCommand } from '../proof-test-invocation.mjs';

const defaultRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const testFiles = Object.freeze([
  'scripts/qualification/pc11-normal-start-adapter.test.mjs',
  'scripts/qualification/pc11-three-actor-trade-philia.test.mjs',
  'scripts/qualification/pc11-live-base-contract.test.mjs',
]);

/** Cheap executable contract check. Never import the runner, start a browser,
 * initialize Firebase/Admin, contact a service, or reserve an emulator row. */
export async function runPc11ContractPreflight(root = defaultRoot) {
  const processResult = await runProofTestCommand(process.execPath, ['--test', ...testFiles], {
    cwd: root,
    timeoutMs: 15000,
    env: { PC11_RUNTIME_ALLOCATED: '', PC11_DIST_RUNTIME_ALLOCATED: '' },
  });

  if (processResult.exitCode !== 0) {
    const error = new Error(`PC11 source contract preflight exited with status ${processResult.exitCode}; full log: ${processResult.logPath}`);
    error.exitCode = processResult.exitCode;
    error.processResult = processResult;
    throw error;
  }

  return { status: 'PC11_SOURCE_CONTRACT_PREFLIGHT_PASS', testFiles: [...testFiles],
    browserProcesses: 0, sdkClients: 0, networkRequests: 0, runtimeProof: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPc11ContractPreflight()
    .then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = error.exitCode ?? 1;
    });
}
