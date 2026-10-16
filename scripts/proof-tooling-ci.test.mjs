import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { classifyRiskGates } from './risk-gates.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const deploy = await readFile(resolve(root, '.github/workflows/deploy.yml'), 'utf8');

test('the named proof preflight runs only its maintained source contracts', () => {
  assert.equal(packageJson.scripts['test:proof-preflight'],
    'node --test scripts/qualification/pc11-contract-preflight.test.mjs scripts/proof-tooling-ci.test.mjs');
});

test('the exact-head unit risk flag installs Chrome and runs the bounded selector browser smoke', () => {
  const profile = classifyRiskGates([
    'src/components/FleetAlertControl.tsx',
    'scripts/proof-tooling-redalert.browser.test.mjs',
    'scripts/qualification/pc11-live-base-contract.test.mjs',
  ]);
  assert.equal(profile.unit, true);

  const installName = ci.indexOf('- name: Install Chrome for proof-tool browser smoke');
  const browserName = ci.indexOf('- name: Fleetwide Red Alert selector browser smoke');
  assert.ok(installName >= 0 && browserName > installName, 'Chrome setup must precede the proof smoke');
  assert.match(ci.slice(installName, browserName), /if: steps\.change_scope\.outputs\.unit == 'true'/);
  assert.match(ci.slice(installName, browserName), /npx playwright install --with-deps chrome/);
  assert.match(ci.slice(browserName), /if: steps\.change_scope\.outputs\.unit == 'true'[\s\S]*?npm run test:proof-redalert-browser/);
});

test('the cheap proof preflight always runs and exact-head unit risk remains threaded through deployment CI', () => {
  const installRoot = ci.indexOf('- name: Install locked root dependencies for release contracts');
  const preflight = ci.indexOf('- name: Bounded proof-tool contract preflight');
  assert.ok(preflight > installRoot, 'the preflight must run after locked root dependencies install');
  assert.match(ci.slice(preflight), /run: npm run test:proof-preflight/);
  assert.match(ci, /unit_required:[\s\S]*?type: boolean/);
  assert.match(ci, /run_unit=\$UNIT_REQUIRED[\s\S]*?echo "unit=\$run_unit"/);
  assert.match(deploy, /unit_required: \$\{\{ steps\.targets\.outputs\.unit \}\}/);
  assert.match(deploy, /unit_required: \$\{\{ needs\.determine-targets\.outputs\.unit_required == 'true' \}\}/);
});
