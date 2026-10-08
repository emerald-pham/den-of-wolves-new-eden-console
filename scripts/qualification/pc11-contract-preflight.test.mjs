import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('one source-only preflight exercises clean live-base contract without runtime allocation or browser', () => {
  const output = execFileSync(process.execPath, ['scripts/qualification/pc11-contract-preflight.mjs', '--check'], {
    encoding: 'utf8', env: { ...process.env, PC11_RUNTIME_ALLOCATED: '', PC11_DIST_RUNTIME_ALLOCATED: '' },
  });
  const result = JSON.parse(output);
  assert.equal(result.status, 'PC11_SOURCE_CONTRACT_PREFLIGHT_PASS');
  assert.equal(result.browserProcesses, 0); assert.equal(result.sdkClients, 0); assert.equal(result.networkRequests, 0);
  assert.ok(result.testFiles.includes('scripts/qualification/pc11-live-base-contract.test.mjs'));
});

test('launcher and runner run source preflight before any runtime process or SDK client', async () => {
  const runner = await readFile(new URL('./pc11-three-actor-trade-philia.mjs', import.meta.url), 'utf8');
  const launcher = await readFile(new URL('./pc11-launch.mjs', import.meta.url), 'utf8');
  const runnerCheck = runner.indexOf('runPc11ContractPreflight(');
  assert.ok(runnerCheck >= 0 && runnerCheck < runner.indexOf("require('playwright')"));
  const launcherCheck = launcher.indexOf('runPc11ContractPreflight(');
  assert.ok(launcherCheck >= 0 && launcherCheck < launcher.indexOf("await command('configure'"));
});
