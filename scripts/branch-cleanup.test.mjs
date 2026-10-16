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

test('unique tips, default branches, and local/remote tip mismatches are retained', async () => {
  const fixture = await createBranchCleanupFixture({ merge: false });
  try {
    const branchTip = await fixture.localSha();
    const unique = await fixture.cleanup();
    expectReason(unique, 'branch-not-merged');
    assert.equal(unique.local.sha, branchTip);
    assert.equal(await fixture.localSha(), branchTip);
    assert.equal(await fixture.remoteSha(), branchTip);

    const main = await fixture.cleanup({ branch: 'main' });
    expectReason(main, 'protected-default-branch');
    assert.equal(await fixture.runGit(['rev-parse', 'refs/heads/main']), main.local.sha);
  } finally {
    await fixture.dispose();
  }

  const mismatched = await createBranchCleanupFixture();
  try {
    const localTip = await mismatched.localSha();
    const remoteTip = await createUniqueCommit(mismatched);
    await execFileAsync('git', ['--git-dir', mismatched.origin, 'update-ref', `refs/heads/${mismatched.branchName}`, remoteTip]);
    const report = await mismatched.cleanup({ apply: true });
    expectReason(report, 'local-remote-tip-mismatch');
    assert.equal(report.local.sha, localTip);
    assert.equal(report.remote.sha, remoteTip);
    assert.equal(await mismatched.localSha(), localTip);
    assert.equal(await mismatched.remoteSha(), remoteTip);
  } finally {
    await mismatched.dispose();
  }
});

test('active or parked ownership retains the branch, while another repository is ignored', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const branchTip = await fixture.localSha();
    await fixture.writeCoordination({ entries: [{
      id: 'foreign-entry',
      status: 'active',
      branchName: fixture.branchName,
      worktree: join(fixture.root, 'foreign-missing-checkout'),
      repositoryIdentity: join(fixture.root, 'foreign.git'),
    }] });
    assert.equal((await fixture.cleanup()).decision, 'would-remove');

    const repositoryIdentity = await fixture.runGit(['rev-parse', '--path-format=absolute', '--git-common-dir']);
    for (const status of ['active', 'parked']) {
      await fixture.writeCoordination({ entries: [{
        id: `${status}-owner`,
        status,
        branchName: fixture.branchName,
        worktree: join(fixture.root, `${status}-missing-checkout`),
        repositoryIdentity,
      }] });
      const report = await fixture.cleanup({ apply: true });
      expectReason(report, 'coordination-ownership');
      assert.equal(await fixture.localSha(), branchTip);
      assert.equal(await fixture.remoteSha(), branchTip);
    }
  } finally {
    await fixture.dispose();
  }
});

test('a reserved or configured current checkout is retained', async () => {
  const fixture = await createBranchCleanupFixture({ currentBranch: 'target' });
  try {
    const branchTip = await fixture.localSha();
    await fixture.writeCoordination({
      reservations: [{ worktree: fixture.repo, pid: 321 }],
      configurations: [{ worktree: fixture.repo, slot: 2 }],
    });
    const report = await fixture.cleanup({ apply: true });
    expectReason(report, 'checkout-in-use');
    assert.equal(await fixture.localSha(), branchTip);
    assert.equal(await fixture.remoteSha(), branchTip);
    assert.equal(await fixture.runGit(['branch', '--show-current']), fixture.branchName);
  } finally {
    await fixture.dispose();
  }
});

test('open pull requests and unavailable GitHub metadata retain the branch', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const branchTip = await fixture.localSha();
    const openPr = await fixture.withFakeGh({
      response: JSON.stringify([{ number: 44, headRefName: fixture.branchName, headRefOid: branchTip }]),
    }, () => fixture.cleanup({ apply: true }));
    expectReason(openPr, 'open-pull-request');
    assert.equal(await fixture.localSha(), branchTip);
    assert.equal(await fixture.remoteSha(), branchTip);

    const unavailable = await fixture.withFakeGh({ fail: true }, () => fixture.cleanup({ apply: true }));
    expectReason(unavailable, 'pull-request-metadata-unavailable');
    assert.equal(await fixture.localSha(), branchTip);
    assert.equal(await fixture.remoteSha(), branchTip);
  } finally {
    await fixture.dispose();
  }
});

test('another registered checkout retains the branch, including a missing worktree path', async () => {
  const fixture = await createBranchCleanupFixture();
  const alternateCheckout = join(fixture.root, 'alternate-checkout');
  try {
    await fixture.runGit(['worktree', 'add', alternateCheckout, fixture.branchName]);
    const attached = await fixture.cleanup({ apply: true });
    expectReason(attached, 'branch-in-other-worktree');
    assert.equal(await fixture.localSha(), attached.local.sha);
    assert.equal(await fixture.remoteSha(), attached.remote.sha);

    await rm(alternateCheckout, { recursive: true, force: true });
    const missing = await fixture.cleanup({ apply: true });
    expectReason(missing, 'branch-in-other-worktree');
    assert.match(await fixture.runGit(['worktree', 'list', '--porcelain']), /prunable/);
    assert.equal(await fixture.localSha(), missing.local.sha);
  } finally {
    await fixture.dispose();
  }
});

test('current checkout detaches at the fetched default tip and preserves ignored files', async () => {
  const fixture = await createBranchCleanupFixture({ currentBranch: 'target' });
  try {
    await mkdir(join(fixture.repo, 'local-data'), { recursive: true });
    const ignoredFile = join(fixture.repo, 'local-data', 'private-cache.txt');
    await writeFile(ignoredFile, 'keep this ignored file\n');
    const expectedDefaultSha = await fixture.runGit(['rev-parse', 'refs/remotes/origin/main']);
    const report = await fixture.cleanup({ apply: true });
    assert.equal(report.decision, 'removed');
    assert.equal(report.actions.detached, true);
    assert.equal(await fixture.runGit(['rev-parse', 'HEAD']), expectedDefaultSha);
    assert.equal(await fixture.runGit(['branch', '--show-current']), '');
    assert.equal(await readFile(ignoredFile, 'utf8'), 'keep this ignored file\n');
    assert.equal(await fixture.localSha().catch(() => null), null);
    assert.equal(await fixture.remoteSha(), null);
  } finally {
    await fixture.dispose();
  }
});

test('a tracked destination cannot overwrite ignored data during detach', async () => {
  const fixture = await createBranchCleanupFixture({ currentBranch: 'target', mainCollision: true });
  try {
    const branchTip = await fixture.localSha();
    const ignoredFile = join(fixture.repo, 'local-data', 'cache.txt');
    await writeFile(ignoredFile, 'user-only ignored data\n');
    const report = await fixture.cleanup({ apply: true });
    expectReason(report, 'checkout-change-blocked');
    assert.equal(await readFile(ignoredFile, 'utf8'), 'user-only ignored data\n');
    assert.equal(await fixture.localSha(), branchTip);
    assert.equal(await fixture.remoteSha(), branchTip);
    assert.equal(await fixture.runGit(['branch', '--show-current']), fixture.branchName);
  } finally {
    await fixture.dispose();
  }
});

test('dirty tracked or untracked target checkouts are retained', async () => {
  const fixture = await createBranchCleanupFixture({ currentBranch: 'target' });
  try {
    const branchTip = await fixture.localSha();
    await writeFile(join(fixture.repo, 'untracked.txt'), 'keep untracked data\n');
    const report = await fixture.cleanup({ apply: true });
    expectReason(report, 'checkout-not-clean');
    assert.equal(await fixture.localSha(), branchTip);
    assert.equal(await fixture.remoteSha(), branchTip);
    assert.equal(await readFile(join(fixture.repo, 'untracked.txt'), 'utf8'), 'keep untracked data\n');
  } finally {
    await fixture.dispose();
  }
});

test('recovery artifacts inside the worktree are rejected before mutation', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const localTip = await fixture.localSha();
    const report = await fixture.cleanup({ apply: true, artifactDirectory: join(fixture.repo, 'recovery') });
    expectReason(report, 'recovery-directory-inside-worktree');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), localTip);
  } finally {
    await fixture.dispose();
  }
});

async function installPrePushRace(fixture, { kind, raceSha }) {
  const hooksPath = join(fixture.root, 'hooks');
  await mkdir(hooksPath);
  await fixture.runGit(['config', 'core.hooksPath', hooksPath]);
  const hook = [
    '#!/bin/sh',
    'if [ "${BRANCH_CLEANUP_RACE_KIND:-}" = "remote" ]; then',
    '  git --git-dir="$BRANCH_CLEANUP_RACE_ORIGIN" update-ref "$BRANCH_CLEANUP_RACE_REF" "$BRANCH_CLEANUP_RACE_SHA"',
    'elif [ "${BRANCH_CLEANUP_RACE_KIND:-}" = "local" ]; then',
    '  git -C "$BRANCH_CLEANUP_RACE_REPO" update-ref "$BRANCH_CLEANUP_RACE_REF" "$BRANCH_CLEANUP_RACE_SHA"',
    'fi',
    'exit 0',
  ].join('\n') + '\n';
  await writeFile(join(hooksPath, 'pre-push'), hook);
  await chmod(join(hooksPath, 'pre-push'), 0o700);
  const prior = {
    kind: process.env.BRANCH_CLEANUP_RACE_KIND,
    origin: process.env.BRANCH_CLEANUP_RACE_ORIGIN,
    repo: process.env.BRANCH_CLEANUP_RACE_REPO,
    ref: process.env.BRANCH_CLEANUP_RACE_REF,
    sha: process.env.BRANCH_CLEANUP_RACE_SHA,
  };
  process.env.BRANCH_CLEANUP_RACE_KIND = kind;
  process.env.BRANCH_CLEANUP_RACE_ORIGIN = fixture.origin;
  process.env.BRANCH_CLEANUP_RACE_REPO = fixture.repo;
  process.env.BRANCH_CLEANUP_RACE_REF = `refs/heads/${fixture.branchName}`;
  process.env.BRANCH_CLEANUP_RACE_SHA = raceSha;
  return () => {
    for (const [key, value] of Object.entries({
      BRANCH_CLEANUP_RACE_KIND: prior.kind,
      BRANCH_CLEANUP_RACE_ORIGIN: prior.origin,
      BRANCH_CLEANUP_RACE_REPO: prior.repo,
      BRANCH_CLEANUP_RACE_REF: prior.ref,
      BRANCH_CLEANUP_RACE_SHA: prior.sha,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test('remote SHA lease rejects a branch that changes during deletion', async () => {
  const fixture = await createBranchCleanupFixture();
  let restoreRace;
  try {
    const localTip = await fixture.localSha();
    const raceSha = await createUniqueCommit(fixture);
    restoreRace = await installPrePushRace(fixture, { kind: 'remote', raceSha });
    const report = await fixture.cleanup({ apply: true });
    expectReason(report, 'remote-tip-changed');
    assert.equal(report.actions.remoteBranchRemoved, false);
    assert.equal(report.actions.localBranchRemoved, false);
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), raceSha);
  } finally {
    restoreRace?.();
    await fixture.dispose();
  }
});

test('local tip is rechecked after the leased remote deletion', async () => {
  const fixture = await createBranchCleanupFixture();
  let restoreRace;
  try {
    const originalTip = await fixture.localSha();
    const raceSha = await createUniqueCommit(fixture);
    restoreRace = await installPrePushRace(fixture, { kind: 'local', raceSha });
    const report = await fixture.cleanup({ apply: true });
    expectReason(report, 'local-tip-changed');
    assert.equal(report.actions.remoteBranchRemoved, true);
    assert.equal(report.actions.localBranchRemoved, false);
    assert.equal(await fixture.localSha(), raceSha);
    assert.equal(await fixture.remoteSha(), null);
    assert.equal(report.recovery.bundleSha256, await fileSha(report.recovery.bundlePath));
    assert.notEqual(originalTip, raceSha);
  } finally {
    restoreRace?.();
    await fixture.dispose();
  }
});
