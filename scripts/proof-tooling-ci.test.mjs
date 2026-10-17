import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { classifyRiskGates } from './risk-gates.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const deploy = await readFile(resolve(root, '.github/workflows/deploy.yml'), 'utf8');

function concurrencyFor(github) {
  const block = /^concurrency:\n([\s\S]*?)(?=^\S)/m.exec(ci)?.[1];
  assert.ok(block, 'CI must declare its concurrency policy');
  const evaluate = (expression) => runInNewContext(expression, { github }, { timeout: 1000 });
  return {
    group: /^  group: (.+)$/m.exec(block)?.[1]
      .replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) => evaluate(expression)),
    cancel: evaluate(/^  cancel-in-progress: \$\{\{\s*(.*?)\s*\}\}$/m.exec(block)?.[1]),
  };
}

function candidateEvent({ pullRequest = false, repository = 'owner/console', branch = 'tooling/cleanup', workflow = 'CI' } = {}) {
  return {
    workflow,
    repository: 'owner/console',
    event_name: pullRequest ? 'pull_request' : 'push',
    event: { pull_request: { number: pullRequest ? 24 : undefined, head: { repo: { full_name: pullRequest ? repository : undefined } } } },
    ref: pullRequest ? 'refs/pull/24/merge' : `refs/heads/${branch}`,
    ref_name: pullRequest ? '24/merge' : branch,
    head_ref: pullRequest ? branch : '',
  };
}

test('push and pull-request checks for one candidate share a cancelable concurrency group', () => {
  const push = concurrencyFor(candidateEvent());
  const pr = concurrencyFor(candidateEvent({ pullRequest: true }));
  assert.ok(push.group);
  assert.equal(pr.group, push.group, 'opening or updating a PR must supersede duplicate branch CI');
  assert.equal(push.cancel, true);
  assert.equal(pr.cancel, true);
});

test('candidate cancellation isolates forks and branches and preserves exact-main verification', () => {
  const push = concurrencyFor(candidateEvent());
  assert.notEqual(concurrencyFor(candidateEvent({ pullRequest: true, repository: 'contributor/console' })).group, push.group);
  assert.notEqual(concurrencyFor(candidateEvent({ branch: 'tooling/other' })).group, push.group);
  const main = concurrencyFor(candidateEvent({ workflow: 'Deploy', branch: 'main' }));
  assert.notEqual(main.group, push.group);
  assert.equal(main.cancel, false);
});

test('the named proof preflight runs only its maintained source contracts', () => {
  assert.equal(packageJson.scripts['test:proof-preflight'],
    'node --test scripts/qualification/pc11-contract-preflight.test.mjs scripts/proof-tooling-ci.test.mjs scripts/proof-tooling-browser-lifecycle.test.mjs');
});

test('tooling and shared UI selector risks use the existing unit gate and bounded browser smoke', () => {
  const profile = classifyRiskGates([
    '.github/workflows/ci.yml',
    'package.json',
    'src/components/FleetAlertControl.tsx',
    'src/routes/ShipConsoleNavigation.test.tsx',
    'scripts/proof-tooling-redalert.browser.test.mjs',
    'scripts/qualification/pc11-live-base-contract.test.mjs',
  ]);
  assert.equal(profile.unit, true);

  const unitName = ci.indexOf('- name: Unit tests');
  const installName = ci.indexOf('- name: Install Playwright Chromium for proof-tool browser smoke');
  const browserName = ci.indexOf('- name: Fleetwide Red Alert selector browser smoke');
  const typographyInstallName = ci.indexOf('- name: Install rendered typography browser');
  assert.ok(unitName >= 0 && unitName < installName && browserName > typographyInstallName && typographyInstallName > installName,
    'the proof smoke must follow an available Playwright Chromium installation');
  assert.match(ci.slice(unitName, installName), /if: steps\.change_scope\.outputs\.unit == 'true'[\s\S]*?npm run test:unit/);
  assert.match(ci.slice(installName, browserName), /if: steps\.change_scope\.outputs\.unit == 'true' && steps\.change_scope\.outputs\.typography != 'true'/);
  assert.match(ci.slice(installName, browserName), /npx playwright install --with-deps chromium/);
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
