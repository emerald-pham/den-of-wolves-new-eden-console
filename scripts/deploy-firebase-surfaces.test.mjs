import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { deploymentBatches, deployFirebaseSurfaces } from './deploy-firebase-surfaces.mjs';

const namedTargets = count => Array.from({ length: count }, (_, index) => 'functions:callable' + index);
const project = 'demo-deploy-batches';

test('the complete 216-name release is deployed once in bounded batches before its surfaces', () => {
  const functions = namedTargets(216);
  const batches = deploymentBatches(['hosting', 'firestore', ...functions].join(','));
  assert.equal(batches.length, 23);
  assert.ok(batches.slice(0, -1).every(batch => batch.length <= 10));
  assert.deepEqual(batches.slice(0, -1).flat(), functions);
  assert.deepEqual(batches.at(-1), ['hosting', 'firestore']);
});

test('broad, duplicate, malformed and empty selectors fail before any deployment', async () => {
  for (const deployOnly of ['', 'functions', 'functions:callable0,functions',
    'functions:callable0,functions:callable0', 'hosting,', 'storage',
    'functions:callable0;echo bad', 'functions:codebase:callable0']) {
    let calls = 0;
    await assert.rejects(deployFirebaseSurfaces({ project, deployOnly,
      run: async () => { calls += 1; }, log: () => {} }));
    assert.equal(calls, 0);
  }
});

test('surface-only releases retain their exact selector and explicit pinned CLI controls', async () => {
  const calls = [];
  await deployFirebaseSurfaces({ project, deployOnly: 'hosting,firestore',
    run: async (...args) => { calls.push(args); }, log: () => {} });
  assert.deepEqual(calls, [['npx', ['--yes', 'firebase-tools@15.29.0', 'deploy',
    '--project', project, '--only', 'hosting,firestore', '--non-interactive', '--force']]]);
});

test('the next batch waits for the prior provider deployment to finish', async () => {
  const calls = [];
  let finishFirst;
  const first = new Promise(resolve => { finishFirst = resolve; });
  const release = deployFirebaseSurfaces({ project,
    deployOnly: namedTargets(11).join(','), log: () => {},
    run: async (command, args) => {
      calls.push({ command, selector: args[args.indexOf('--only') + 1] });
      if (calls.length === 1) await first;
    } });
  assert.equal(calls.length, 1);
  finishFirst();
  await release;
  assert.deepEqual(calls.map(call => call.selector.split(',').length), [10, 1]);
});

test('a failed Function batch stops the release before later Functions or Hosting publish', async () => {
  const calls = [];
  await assert.rejects(deployFirebaseSurfaces({ project,
    deployOnly: [...namedTargets(21), 'hosting', 'firestore'].join(','), log: () => {},
    run: async (command, args) => {
      calls.push(args[args.indexOf('--only') + 1]);
      if (calls.length === 2) throw new Error('provider 429');
    } }), /provider 429/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(selector => !selector.includes('hosting') && !selector.includes('firestore')));
});

test('invalid project input is rejected without invoking the CLI', async () => {
  let calls = 0;
  await assert.rejects(deployFirebaseSurfaces({ project: '--unsafe', deployOnly: 'hosting',
    run: async () => { calls += 1; }, log: () => {} }), /project ID/);
  assert.equal(calls, 0);
});

test('main uses batching and retains verified artifacts, WIF, and strict revision verification', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(workflow, /node scripts\/deploy-firebase-surfaces\.mjs/);
  assert.match(workflow, /CI_VERIFIED_ARTIFACTS: '1'/);
  assert.match(workflow, /google-github-actions\/auth@v3/);
  assert.match(workflow, /--function-revisions-file/);
  assert.match(readFileSync('.github/workflows/ci.yml', 'utf8'),
    /node --test scripts\/deploy-firebase-surfaces\.test\.mjs/);
});

test('the existing explicit manual full-deployment path remains available without an automatic broad fallback', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(workflow, /DEPLOY_EVENT: \$\{\{ github\.event_name \}\}/);
  assert.ok(workflow.includes('if [[ "$DEPLOY_EVENT" == "workflow_dispatch" && ",$DEPLOY_ONLY," == *,functions,* ]]; then'));
  assert.match(workflow, /npx --yes firebase-tools@15\.29\.0 deploy/);
});
