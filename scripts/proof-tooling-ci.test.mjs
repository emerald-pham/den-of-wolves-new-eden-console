import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { load } from 'js-yaml';
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

function verificationRequired(github, { pulls = [], lookupFails = false, exactHead = false } = {}) {
  const selection = load(ci).jobs['select-candidate']?.steps.find((step) => step.id === 'candidate');
  if (!selection) return true; // Existing CI verifies every event without a selector.
  const directory = mkdtempSync(resolve(tmpdir(), 'dow-ci-selection-'));
  try {
    const gh = resolve(directory, 'gh');
    const output = resolve(directory, 'output');
    writeFileSync(gh, '#!/bin/sh\nif [ "$TEST_GH_FAIL" = "true" ]; then exit 1; fi\nprintf "%s" "$TEST_GH_PULLS"\n');
    chmodSync(gh, 0o755);
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', selection.run], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        EVENT_NAME: github.event_name,
        REPOSITORY: github.repository,
        SOURCE_OWNER: github.repository.split('/')[0],
        HEAD_BRANCH: github.head_ref || github.ref_name,
        HEAD_SHA: 'a'.repeat(40),
        EXACT_HEAD_COMMIT: String(exactHead),
        GITHUB_OUTPUT: output,
        TEST_GH_PULLS: JSON.stringify(pulls),
        TEST_GH_FAIL: String(lookupFails),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const selected = /^run_verification=(true|false)$/m.exec(readFileSync(output, 'utf8'));
    assert.ok(selected, 'candidate selection must emit an explicit verification decision');
    return selected[1] === 'true';
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const coveringPr = {
  state: 'open',
  head: { repo: { full_name: 'owner/console' }, ref: 'tooling/cleanup', sha: 'a'.repeat(40) },
};

test('push arrival cannot cancel PR merge verification even when its incremental range is documentation-only', () => {
  const push = concurrencyFor(candidateEvent());
  const pr = concurrencyFor(candidateEvent({ pullRequest: true }));
  assert.ok(push.group);
  assert.notEqual(pr.group, push.group, 'branch and PR integration checks must not cancel one another');
  assert.equal(push.cancel, true);
  assert.equal(pr.cancel, true);
  const pushRange = classifyRiskGates(['CLAUDE.md']);
  const prRange = classifyRiskGates(['CLAUDE.md', 'src/styles/cic.css']);
  assert.equal(pushRange.typography, false);
  assert.equal(prRange.typography, true);
  for (const arrivals of [[candidateEvent(), candidateEvent({ pullRequest: true })],
    [candidateEvent({ pullRequest: true }), candidateEvent()]]) {
    for (const event of arrivals) {
      assert.equal(verificationRequired(event, { pulls: [coveringPr] }), event.event_name === 'pull_request');
    }
  }
});

test('candidate cancellation isolates forks and branches and preserves exact-main verification', () => {
  const push = concurrencyFor(candidateEvent());
  assert.notEqual(concurrencyFor(candidateEvent({ pullRequest: true, repository: 'contributor/console' })).group, push.group);
  assert.notEqual(concurrencyFor(candidateEvent({ branch: 'tooling/other' })).group, push.group);
  const main = concurrencyFor(candidateEvent({ workflow: 'Deploy', branch: 'main' }));
  assert.notEqual(main.group, push.group);
  assert.equal(main.cancel, false);
});

test('branch verification stays enabled without an exact covering PR, on lookup failure and for exact-main calls', () => {
  const event = candidateEvent();
  for (const pulls of [[], [{ ...coveringPr, state: 'closed' }],
    [{ ...coveringPr, head: { ...coveringPr.head, sha: 'b'.repeat(40) } }],
    [{ ...coveringPr, head: { ...coveringPr.head, ref: 'tooling/other' } }],
    [{ ...coveringPr, head: { ...coveringPr.head, repo: { full_name: 'contributor/console' } } }]]) {
    assert.equal(verificationRequired(event, { pulls }), true);
  }
  assert.equal(verificationRequired(event, { lookupFails: true }), true);
  assert.equal(verificationRequired(event, { pulls: [coveringPr], exactHead: true }), true);

  const workflow = load(ci);
  assert.deepEqual(workflow.jobs.verify.needs, ['select-candidate']);
  assert.equal(workflow.jobs.verify.if, "needs.select-candidate.outputs.run_verification == 'true'");
  assert.equal(workflow.jobs['select-candidate'].permissions['pull-requests'], 'read');
  assert.equal(load(deploy).permissions['pull-requests'], 'read');
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
