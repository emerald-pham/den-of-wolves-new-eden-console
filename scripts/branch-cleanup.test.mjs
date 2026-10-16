import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { cleanupBranch } from './branch-cleanup.mjs';

const execFileAsync = promisify(execFile);

async function runGit(cwd, args, options = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options,
  });
  return stdout.trimEnd();
}

async function localSha(fixture, branch = fixture.branchName) {
  return runGit(fixture.repo, ['rev-parse', '--verify', `refs/heads/${branch}`]);
}

async function remoteSha(fixture, branch = fixture.branchName) {
  const output = await runGit(fixture.repo, [
    'ls-remote', '--refs', 'origin', `refs/heads/${branch}`,
  ]);
  return output ? output.split('\t')[0] : null;
}

async function fileSha(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function writeCoordination(fixture, state) {
  const identity = await runGit(fixture.repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const normalized = {
    version: 1,
    scope: 'codex-wide',
    versionAgreement: 'fixture',
    entries: [],
    reservations: [],
    configurations: [],
    ...state,
  };
  await writeFile(fixture.coordinationFile, `${JSON.stringify(normalized, null, 2)}\n`);
  return identity;
}

async function withFakeGh(fixture, { response = '[]', fail = false } = {}, action) {
  const oldPath = process.env.PATH;
  const oldResponse = process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE;
  const oldFailure = process.env.BRANCH_CLEANUP_FAKE_GH_FAIL;
  process.env.PATH = `${fixture.ghBin}${delimiter}${oldPath ?? ''}`;
  process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE = response;
  process.env.BRANCH_CLEANUP_FAKE_GH_FAIL = fail ? '1' : '';
  try {
    return await action();
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldResponse === undefined) delete process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE;
    else process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE = oldResponse;
    if (oldFailure === undefined) delete process.env.BRANCH_CLEANUP_FAKE_GH_FAIL;
    else process.env.BRANCH_CLEANUP_FAKE_GH_FAIL = oldFailure;
  }
}

export async function createBranchCleanupFixture({
  branchName = 'task/cleanup-fixture',
  merge = true,
  currentBranch = 'main',
  mainCollision = false,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'den-wolves-branch-cleanup-'));
  const repo = join(root, 'repo');
  const origin = join(root, 'origin.git');
  const artifactDirectory = join(root, 'recovery');
  const coordinationFile = join(root, 'coordination.json');
  const ghBin = join(root, 'bin');
  await Promise.all([mkdir(repo), mkdir(ghBin), mkdir(artifactDirectory)]);
  await runGit(root, ['init', '--bare', '--initial-branch=main', origin]);
  await runGit(root, ['init', '--initial-branch=main', repo]);
  await runGit(repo, ['config', 'user.name', 'Branch Cleanup Fixture']);
  await runGit(repo, ['config', 'user.email', 'branch-cleanup@example.test']);
  await writeFile(join(repo, '.gitignore'), 'local-data/\n');
  await writeFile(join(repo, 'README.md'), 'fixture base\n');
  await runGit(repo, ['add', '.gitignore', 'README.md']);
  await runGit(repo, ['commit', '-m', 'fixture base']);
  await runGit(repo, ['remote', 'add', 'origin', origin]);
  await runGit(repo, ['push', '-u', 'origin', 'main']);
  await runGit(repo, ['remote', 'set-head', 'origin', 'main']);
  await runGit(repo, ['switch', '-c', branchName]);
  await writeFile(join(repo, 'topic.txt'), 'merged topic\n');
  await runGit(repo, ['add', 'topic.txt']);
  await runGit(repo, ['commit', '-m', 'topic commit']);
  await runGit(repo, ['push', '-u', 'origin', branchName]);
  await runGit(repo, ['switch', 'main']);
  if (merge) {
    await runGit(repo, ['merge', '--no-ff', '--no-edit', branchName]);
  }
  if (mainCollision) {
    await mkdir(join(repo, 'local-data'), { recursive: true });
    await writeFile(join(repo, 'local-data', 'cache.txt'), 'tracked main content\n');
    await runGit(repo, ['add', '-f', 'local-data/cache.txt']);
    await runGit(repo, ['commit', '-m', 'main tracks ignored collision']);
  }
  await runGit(repo, ['push', 'origin', 'main']);
  if (currentBranch !== 'main') await runGit(repo, ['switch', currentBranch === 'target' ? branchName : currentBranch]);
  const ghPath = join(ghBin, 'gh');
  await writeFile(ghPath, [
    '#!/bin/sh',
    'if [ "${BRANCH_CLEANUP_FAKE_GH_FAIL:-}" = "1" ]; then',
    '  echo "fixture GitHub metadata failure" >&2',
    '  exit 1',
    'fi',
    'printf "%s\\n" "${BRANCH_CLEANUP_FAKE_GH_RESPONSE:-[]}"',
  ].join('\n') + '\n');
  await chmod(ghPath, 0o700);
  await writeCoordination({ repo, coordinationFile }, {});
  return {
    root,
    repo,
    origin,
    branchName,
    artifactDirectory,
    coordinationFile,
    ghBin,
    runGit: (args, options) => runGit(repo, args, options),
    localSha: (branch) => localSha({ repo, branchName }, branch),
    remoteSha: (branch) => remoteSha({ repo, branchName }, branch),
    cleanup: (options = {}) => cleanupBranch({
      cwd: repo,
      branch: branchName,
      artifactDirectory,
      coordinationFile,
      ...options,
    }),
    writeCoordination: (state) => writeCoordination({ repo, coordinationFile }, state),
    withFakeGh: (options, action) => withFakeGh({ ghBin }, options, action),
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}

async function createUniqueCommit(fixture, branchName = 'race/new-tip') {
  await fixture.runGit(['switch', '-c', branchName]);
  const uniqueFile = `unique-${branchName.replaceAll('/', '-')}.txt`;
  await writeFile(join(fixture.repo, uniqueFile), 'unique tip\n');
  await fixture.runGit(['add', uniqueFile]);
  await fixture.runGit(['commit', '-m', 'unique race tip']);
  const sha = await fixture.runGit(['rev-parse', 'HEAD']);
  await fixture.runGit(['switch', 'main']);
  return sha;
}

function expectReason(report, code) {
  assert.equal(report.decision, 'retained', JSON.stringify(report, null, 2));
  assert.ok(report.reasons.some((reason) => reason.code === code), JSON.stringify(report, null, 2));
}

test('preview is read-only and apply removes only a merged branch after verified recovery', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const beforeLocal = await fixture.localSha();
    const beforeRemote = await fixture.remoteSha();
    const preview = await fixture.cleanup();
    assert.equal(preview.decision, 'would-remove');
    assert.equal(preview.mode, 'preview');
    assert.equal(preview.local.sha, beforeLocal);
    assert.equal(preview.remote.sha, beforeRemote);
    assert.equal(preview.recovery, null);
    assert.equal(await fixture.localSha(), beforeLocal);
    assert.equal(await fixture.remoteSha(), beforeRemote);

    const applied = await fixture.cleanup({ apply: true });
    assert.equal(applied.decision, 'removed');
    assert.equal(applied.actions.remoteBranchRemoved, true);
    assert.equal(applied.actions.localBranchRemoved, true);
    assert.equal(await fixture.localSha().catch(() => null), null);
    assert.equal(await fixture.remoteSha(), null);
    assert.ok(applied.recovery?.bundlePath);
    const manifest = JSON.parse(await readFile(applied.recovery.manifestPath, 'utf8'));
    assert.equal(manifest.targetSha, beforeLocal);
    assert.equal(manifest.bundleSha256, await fileSha(applied.recovery.bundlePath));
    assert.equal(manifest.bundleSha256, applied.recovery.bundleSha256);
    await fixture.runGit(['bundle', 'verify', applied.recovery.bundlePath]);
    const bundleHeads = await fixture.runGit(['bundle', 'list-heads', applied.recovery.bundlePath]);
    assert.match(bundleHeads, new RegExp(`^${beforeLocal} refs/heads/${fixture.branchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));

    const repeated = await fixture.cleanup({ apply: true });
    assert.equal(repeated.decision, 'unchanged');
    assert.equal(repeated.actions.localBranchRemoved, false);
    assert.equal(repeated.actions.remoteBranchRemoved, false);
  } finally {
    await fixture.dispose();
  }
});
