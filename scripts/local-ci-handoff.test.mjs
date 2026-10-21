import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { runLocalCiHandoff } from './local-ci-handoff.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture.root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function copyPolicyFile(root, relativePath) {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(sourceRoot, relativePath), destination);
}

function createFixture({ commitMessage = 'test: handoff candidate', alteredWorkflow = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dow-local-ci-handoff-'));
  const bare = join(root, 'remote.git');
  const repo = join(root, 'repo');
  fixtures.push({ root });
  mkdirSync(repo);
  git(root, 'init', '--bare', bare);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'CI Handoff Test');
  git(repo, 'config', 'user.email', 'ci-handoff@example.invalid');

  for (const path of [
    '.github/workflows/ci.yml',
    '.githooks/pre-push',
    'package.json',
    'package-lock.json',
    'scripts/ci-changed-paths.mjs',
    'scripts/risk-gates.mjs',
    'scripts/tracker-paths.mjs',
    'scripts/local-ci-handoff.mjs',
  ]) copyPolicyFile(repo, path);
  chmodSync(join(repo, '.githooks/pre-push'), 0o755);
  git(repo, 'config', 'core.hooksPath', '.githooks');
  if (alteredWorkflow) {
    writeFileSync(join(repo, '.github/workflows/ci.yml'), '\n# unreviewed workflow change\n', { flag: 'a' });
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'test: seed supported CI contract');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'fetch', 'origin', 'main');
  git(repo, 'switch', '-c', 'topic/ci-handoff');
  writeFileSync(join(repo, 'scripts/fixture-change.mjs'), 'export const candidate = true;\n');
  git(repo, 'add', 'scripts/fixture-change.mjs');
  git(repo, 'commit', '-m', commitMessage);
  const headSha = git(repo, 'rev-parse', 'HEAD');
  return { root, bare, repo, headSha };
}

function successfulCommand() {
  return { exitCode: 0, signal: null, stdout: '', stderr: '' };
}

function successfulAdapter(calls, customize = () => successfulCommand()) {
  return async (command) => {
    calls.push(command);
    return customize(command, calls.length);
  };
}

test('a complete local cohort hands off the exact tested SHA through the ordinary push hook', async () => {
  const fixture = createFixture();
  const calls = [];
  const result = await runLocalCiHandoff({
    cwd: fixture.repo,
    runCommand: successfulAdapter(calls),
  });

  assert.equal(result.headSha, fixture.headSha);
  assert.equal(result.remoteSha, fixture.headSha);
  assert.equal(result.remoteBranch, 'topic/ci-handoff');
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff').split('\t')[0], fixture.headSha);
  assert.ok(calls.some(({ label }) => label === 'Install locked root dependencies for release contracts'));
  assert.ok(calls.some(({ label }) => label === 'Unit tests'));
  assert.ok(calls.some(({ label }) => label === 'Fleetwide Red Alert selector browser smoke'));
});

test('a failed or cancelled required stage blocks handoff', async (t) => {
  for (const [name, result] of [
    ['failed', { exitCode: 1, signal: null, stdout: '', stderr: 'test failure' }],
    ['cancelled', { exitCode: null, signal: 'SIGTERM', stdout: '', stderr: '' }],
  ]) {
    await t.test(name, async () => {
      const fixture = createFixture();
      const calls = [];
      await assert.rejects(runLocalCiHandoff({
        cwd: fixture.repo,
        runCommand: successfulAdapter(calls, (_command, index) => index === 1 ? result : successfulCommand()),
      }), /failed|cancelled|incomplete/i);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('a required test cohort reporting skipped tests blocks handoff', async () => {
  const fixture = createFixture();
  const calls = [];
  await assert.rejects(runLocalCiHandoff({
    cwd: fixture.repo,
    runCommand: successfulAdapter(calls, (command) => command.label === 'Unit tests'
      ? { ...successfulCommand(), stdout: 'Tests 1 passed | 1 skipped (2)\n' }
      : successfulCommand()),
  }), /skip/i);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('dirty worktrees are rejected before running any CI stage', async () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.repo, 'scripts/fixture-change.mjs'), 'uncommitted drift\n');
  const calls = [];
  await assert.rejects(runLocalCiHandoff({
    cwd: fixture.repo,
    runCommand: successfulAdapter(calls),
  }), /clean|dirty/i);
  assert.equal(calls.length, 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('worktree or HEAD drift during a stage stops the remaining cohort and push', async (t) => {
  await t.test('dirty tree', async () => {
    const fixture = createFixture();
    const calls = [];
    await assert.rejects(runLocalCiHandoff({
      cwd: fixture.repo,
      runCommand: successfulAdapter(calls, () => {
        writeFileSync(join(fixture.repo, 'scripts/fixture-change.mjs'), 'drift during tests\n');
        return successfulCommand();
      }),
    }), /drift|clean|changed/i);
    assert.equal(calls.length, 1);
    assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
  });

  await t.test('new commit', async () => {
    const fixture = createFixture();
    const calls = [];
    await assert.rejects(runLocalCiHandoff({
      cwd: fixture.repo,
      runCommand: successfulAdapter(calls, () => {
        writeFileSync(join(fixture.repo, 'scripts/fixture-change.mjs'), 'new candidate\n');
        git(fixture.repo, 'add', 'scripts/fixture-change.mjs');
        git(fixture.repo, 'commit', '-m', 'test: concurrent candidate change');
        return successfulCommand();
      }),
    }), /HEAD|revision|changed|drift/i);
    assert.equal(calls.length, 1);
    assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
  });
});

test('unreviewed workflow contents fail closed before any CI stage', async () => {
  const fixture = createFixture({ alteredWorkflow: true });
  const calls = [];
  await assert.rejects(runLocalCiHandoff({
    cwd: fixture.repo,
    runCommand: successfulAdapter(calls),
  }), /workflow|supported|fingerprint|plan/i);
  assert.equal(calls.length, 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('GitHub Actions skip directives are refused before running CI', async (t) => {
  for (const message of ['test: skip [skip ci]', 'test: skip\n\nskip-checks: true']) {
    await t.test(message.split('\n')[0], async () => {
      const fixture = createFixture({ commitMessage: message });
      const calls = [];
      await assert.rejects(runLocalCiHandoff({
        cwd: fixture.repo,
        runCommand: successfulAdapter(calls),
      }), /skip|directive/i);
      assert.equal(calls.length, 0);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('a newly changed default branch invalidates the captured base before handoff', async () => {
  const fixture = createFixture();
  const auxiliary = join(fixture.root, 'second-checkout');
  git(fixture.root, 'clone', fixture.bare, auxiliary);
  git(auxiliary, 'config', 'user.name', 'Concurrent CI Handoff Test');
  git(auxiliary, 'config', 'user.email', 'concurrent@example.invalid');
  writeFileSync(join(auxiliary, 'main-change.txt'), 'move main while local CI is running\n');
  git(auxiliary, 'add', 'main-change.txt');
  git(auxiliary, 'commit', '-m', 'test: advance main');
  let advanced = false;
  const calls = [];
  await assert.rejects(runLocalCiHandoff({
    cwd: fixture.repo,
    runCommand: successfulAdapter(calls, () => {
      if (!advanced) {
        git(auxiliary, 'push', 'origin', 'HEAD:main');
        advanced = true;
      }
      return successfulCommand();
    }),
  }), /base|stale|changed|remote/i);
  assert.ok(calls.length > 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('an already published exact SHA is reported as a no-op, not a new handoff', async () => {
  const fixture = createFixture();
  git(fixture.repo, 'push', 'origin', 'HEAD:refs/heads/topic/ci-handoff');
  const calls = [];
  await assert.rejects(runLocalCiHandoff({
    cwd: fixture.repo,
    runCommand: successfulAdapter(calls),
  }), /already|no-op|same SHA/i);
  assert.equal(calls.length, 0);
});

test('a rejected remote push does not report success or retry', async () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.bare, 'hooks/pre-receive'), '#!/bin/sh\necho controlled rejection >&2\nexit 1\n');
  chmodSync(join(fixture.bare, 'hooks/pre-receive'), 0o755);
  const calls = [];
  await assert.rejects(runLocalCiHandoff({
    cwd: fixture.repo,
    runCommand: successfulAdapter(calls),
  }), /push|remote|reject/i);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});
