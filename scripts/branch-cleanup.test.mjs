import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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

async function withFakeGh(fixture, { response = '[]', fail = false, hang = false, stubborn = false, auditPath = '' } = {}, action) {
  const oldPath = process.env.PATH;
  const oldResponse = process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE;
  const oldFailure = process.env.BRANCH_CLEANUP_FAKE_GH_FAIL;
  const oldHang = process.env.BRANCH_CLEANUP_FAKE_GH_HANG;
  const oldStubborn = process.env.BRANCH_CLEANUP_FAKE_GH_STUBBORN;
  const oldAuditPath = process.env.BRANCH_CLEANUP_FAKE_GH_AUDIT;
  process.env.PATH = `${fixture.ghBin}${delimiter}${oldPath ?? ''}`;
  process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE = response;
  process.env.BRANCH_CLEANUP_FAKE_GH_FAIL = fail ? '1' : '';
  process.env.BRANCH_CLEANUP_FAKE_GH_HANG = hang ? '1' : '';
  process.env.BRANCH_CLEANUP_FAKE_GH_STUBBORN = stubborn ? '1' : '';
  process.env.BRANCH_CLEANUP_FAKE_GH_AUDIT = auditPath;
  try {
    return await action();
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldResponse === undefined) delete process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE;
    else process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE = oldResponse;
    if (oldFailure === undefined) delete process.env.BRANCH_CLEANUP_FAKE_GH_FAIL;
    else process.env.BRANCH_CLEANUP_FAKE_GH_FAIL = oldFailure;
    if (oldHang === undefined) delete process.env.BRANCH_CLEANUP_FAKE_GH_HANG;
    else process.env.BRANCH_CLEANUP_FAKE_GH_HANG = oldHang;
    if (oldStubborn === undefined) delete process.env.BRANCH_CLEANUP_FAKE_GH_STUBBORN;
    else process.env.BRANCH_CLEANUP_FAKE_GH_STUBBORN = oldStubborn;
    if (oldAuditPath === undefined) delete process.env.BRANCH_CLEANUP_FAKE_GH_AUDIT;
    else process.env.BRANCH_CLEANUP_FAKE_GH_AUDIT = oldAuditPath;
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
    'if [ "${BRANCH_CLEANUP_FAKE_GH_HANG:-}" = "1" ]; then',
    '  printf "%s:%s\\n" "${GH_PROMPT_DISABLED:-}" "${GIT_TERMINAL_PROMPT:-}" > "${BRANCH_CLEANUP_FAKE_GH_AUDIT:-/dev/null}"',
    '  exec sleep 3',
    'fi',
    'if [ "${BRANCH_CLEANUP_FAKE_GH_STUBBORN:-}" = "1" ]; then',
    '  exec node -e \'process.on("SIGTERM", () => {}); setTimeout(() => process.exit(1), 1800); setInterval(() => {}, 1000)\'',
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
    cleanup: (options = {}) => {
      const execute = () => cleanupBranch({
        cwd: repo,
        branch: branchName,
        artifactDirectory,
        coordinationFile,
        ...options,
      });
      if (process.env.BRANCH_CLEANUP_FAKE_GH_RESPONSE !== undefined ||
          process.env.BRANCH_CLEANUP_FAKE_GH_FAIL !== undefined) return execute();
      return withFakeGh({ ghBin }, {}, execute);
    },
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
  await fixture.runGit(['push', 'origin', `${sha}:refs/heads/fixture/race-object`]);
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

test('live origin HEAD is protected while cleanup ancestry always uses freshly fetched origin/main', async () => {
  const defaultFixture = await createBranchCleanupFixture();
  try {
    await execFileAsync('git', [
      '--git-dir', defaultFixture.origin,
      'symbolic-ref', 'HEAD', `refs/heads/${defaultFixture.branchName}`,
    ]);
    const protectedRemoteDefault = await defaultFixture.cleanup();
    expectReason(protectedRemoteDefault, 'protected-default-branch');
    assert.equal(protectedRemoteDefault.defaultBranch.name, defaultFixture.branchName);
  } finally {
    await defaultFixture.dispose();
  }

  const nonMainDefault = await createBranchCleanupFixture();
  try {
    const mainMergeTip = await nonMainDefault.runGit(['rev-parse', 'main^1']);
    await nonMainDefault.runGit(['branch', 'release', mainMergeTip]);
    await nonMainDefault.runGit(['push', 'origin', 'release']);
    await execFileAsync('git', ['--git-dir', nonMainDefault.origin, 'symbolic-ref', 'HEAD', 'refs/heads/release']);
    await nonMainDefault.runGit(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/release']);

    const mergedIntoMain = await nonMainDefault.cleanup();
    assert.equal(mergedIntoMain.decision, 'would-remove', JSON.stringify(mergedIntoMain, null, 2));
    assert.equal(mergedIntoMain.defaultBranch.name, 'release');
    await assert.rejects(execFileAsync('git', [
      'merge-base', '--is-ancestor', nonMainDefault.branchName, 'refs/remotes/origin/release',
    ], { cwd: nonMainDefault.repo }));
  } finally {
    await nonMainDefault.dispose();
  }
});

test('active or parked ownership retains the branch, while another repository is ignored', async () => {
  const fixture = await createBranchCleanupFixture();
  const unrelatedRepository = await createBranchCleanupFixture({ branchName: fixture.branchName });
  try {
    const branchTip = await fixture.localSha();
    const unrelatedIdentity = await unrelatedRepository.runGit(['rev-parse', '--path-format=absolute', '--git-common-dir']);
    await fixture.writeCoordination({ entries: [{
      id: 'foreign-entry',
      status: 'active',
      branchName: fixture.branchName,
      worktree: unrelatedRepository.repo,
      repositoryRoot: unrelatedRepository.repo,
      repositoryIdentity: unrelatedIdentity,
    }] });
    assert.equal((await fixture.cleanup()).decision, 'would-remove');

    await fixture.writeCoordination({ entries: [{
      id: 'missing-checkout-registration',
      status: 'complete',
      branchName: fixture.branchName,
      worktree: join(fixture.root, 'missing-registered-checkout'),
    }] });
    const missingRegistration = await fixture.cleanup({ apply: true });
    expectReason(missingRegistration, 'branch-in-other-worktree');
    assert.equal(await fixture.localSha(), branchTip);
    assert.equal(await fixture.remoteSha(), branchTip);

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
    await Promise.all([fixture.dispose(), unrelatedRepository.dispose()]);
  }
});

test('same-origin clone owners and unresolved owner origins retain the shared branch', async () => {
  const fixture = await createBranchCleanupFixture();
  const sharedClone = join(fixture.root, 'shared-origin-clone');
  try {
    const localTip = await fixture.localSha();
    const remoteTip = await fixture.remoteSha();
    await runGit(fixture.root, ['clone', `file://${fixture.origin}`, sharedClone]);
    await runGit(sharedClone, ['switch', '--track', '-c', fixture.branchName, `origin/${fixture.branchName}`]);
    const cloneIdentity = await runGit(sharedClone, ['rev-parse', '--path-format=absolute', '--git-common-dir']);

    for (const status of ['active', 'parked']) {
      await fixture.writeCoordination({ entries: [{
        id: `same-origin-${status}`,
        status,
        branchName: fixture.branchName,
        worktree: sharedClone,
        repositoryRoot: sharedClone,
        repositoryIdentity: cloneIdentity,
      }] });
      const report = await fixture.cleanup({ apply: true });
      expectReason(report, 'coordination-ownership');
      assert.equal(await fixture.localSha(), localTip);
      assert.equal(await fixture.remoteSha(), remoteTip);
    }

    await fixture.writeCoordination({ entries: [{
      id: 'same-origin-complete-checkout',
      status: 'complete',
      branchName: fixture.branchName,
      worktree: sharedClone,
      repositoryRoot: sharedClone,
      repositoryIdentity: cloneIdentity,
    }] });
    const completedCheckout = await fixture.cleanup({ apply: true });
    expectReason(completedCheckout, 'branch-in-other-worktree');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), remoteTip);

    const githubHttpsOrigin = 'https://github.com/example/den-of-wolves.git';
    const githubSshOrigin = 'git@github.com:Example/Den-of-Wolves.git';
    const localOriginUrl = `file://${fixture.origin}`;
    await fixture.runGit(['remote', 'set-url', 'origin', githubHttpsOrigin]);
    await fixture.runGit(['config', '--add', `url.${localOriginUrl}.insteadOf`, githubHttpsOrigin]);
    await runGit(sharedClone, ['remote', 'set-url', 'origin', githubSshOrigin]);
    await runGit(sharedClone, ['config', '--add', `url.${localOriginUrl}.insteadOf`, githubSshOrigin]);
    await fixture.writeCoordination({ entries: [{
      id: 'github-equivalent-origin-owner',
      status: 'active',
      branchName: fixture.branchName,
      worktree: sharedClone,
      repositoryRoot: sharedClone,
      repositoryIdentity: cloneIdentity,
    }] });
    const equivalentGitHubOrigins = await fixture.cleanup({ apply: true });
    expectReason(equivalentGitHubOrigins, 'coordination-ownership');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), remoteTip);

    await fixture.writeCoordination({ entries: [{
      id: 'unresolved-origin-owner',
      status: 'parked',
      branchName: fixture.branchName,
      worktree: join(fixture.root, 'unavailable-owner-checkout'),
      repositoryRoot: join(fixture.root, 'unavailable-owner-repository'),
      repositoryIdentity: join(fixture.root, 'unavailable-owner.git'),
    }] });
    const unresolvedOrigin = await fixture.cleanup({ apply: true });
    expectReason(unresolvedOrigin, 'coordination-ownership');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), remoteTip);
  } finally {
    await fixture.dispose();
  }
});

test('coordination ownership compares effective fetch and push origins across URL aliases', async () => {
  const fixture = await createBranchCleanupFixture();
  const owner = join(fixture.root, 'owner-clone');
  const unrelatedPushOrigin = join(fixture.root, 'unrelated-push.git');
  try {
    const localTip = await fixture.localSha();
    const remoteTip = await fixture.remoteSha();
    await runGit(fixture.root, ['clone', `file://${fixture.origin}`, owner]);
    await runGit(owner, ['switch', '--track', '-c', fixture.branchName, `origin/${fixture.branchName}`]);

    const rewrittenOrigin = `file://${fixture.origin}`;
    const candidateAlias = 'https://candidate-alias.invalid/example/repo.git';
    const ownerAlias = 'https://owner-alias.invalid/example/repo.git';
    await fixture.runGit(['remote', 'set-url', 'origin', candidateAlias]);
    await fixture.runGit(['config', '--add', `url.${rewrittenOrigin}.insteadOf`, candidateAlias]);
    await runGit(owner, ['remote', 'set-url', 'origin', ownerAlias]);
    await runGit(owner, ['config', '--add', `url.${rewrittenOrigin}.insteadOf`, ownerAlias]);

    const ownerIdentity = await runGit(owner, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    await fixture.writeCoordination({ entries: [{
      id: 'effective-alias-active-owner',
      status: 'active',
      branchName: fixture.branchName,
      worktree: owner,
      repositoryRoot: owner,
      repositoryIdentity: ownerIdentity,
    }] });
    const sameEffectiveOrigin = await fixture.cleanup({ apply: true });
    expectReason(sameEffectiveOrigin, 'coordination-ownership');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), remoteTip);

    await runGit(fixture.root, ['init', '--bare', '--initial-branch=main', unrelatedPushOrigin]);
    await runGit(owner, ['config', 'remote.origin.pushurl', `file://${unrelatedPushOrigin}`]);
    const divergentPushOrigin = await fixture.cleanup({ apply: true });
    expectReason(divergentPushOrigin, 'coordination-ownership');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), remoteTip);
  } finally {
    await fixture.dispose();
  }
});

test('candidate fetch and push destinations must match before cleanup mutates either repository', async () => {
  const fixture = await createBranchCleanupFixture();
  const unrelatedPushOrigin = join(fixture.root, 'unrelated-push.git');
  try {
    const targetSha = await fixture.localSha();
    await runGit(fixture.root, ['clone', '--bare', fixture.origin, unrelatedPushOrigin]);
    await fixture.runGit(['config', 'remote.origin.pushurl', unrelatedPushOrigin]);
    await fixture.runGit(['update-ref', '-d', 'refs/remotes/origin/main']);

    for (const apply of [false, true]) {
      const report = await fixture.cleanup({ apply });
      expectReason(report, 'origin-identity-unverified');
      assert.equal(report.recovery, null);
      assert.equal(await fixture.localSha(), targetSha);
      assert.equal(await fixture.remoteSha(), targetSha);
      assert.match(await runGit(fixture.repo, [
        'ls-remote', '--heads', unrelatedPushOrigin, `refs/heads/${fixture.branchName}`,
      ]), new RegExp(`^${targetSha}\\s`));
      await assert.rejects(fixture.runGit(['rev-parse', '--verify', 'refs/remotes/origin/main']));
    }
  } finally {
    await fixture.dispose();
  }
});

test('malformed coordination metadata cannot be normalized into an empty ownership ledger', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const localTip = await fixture.localSha();
    const remoteTip = await fixture.remoteSha();
    const validState = {
      version: 1,
      scope: 'codex-wide',
      versionAgreement: 'fixture',
      entries: [],
      reservations: [],
      configurations: [],
    };
    const malformedStates = [
      ['entries type', { ...validState, entries: { discarded: true } }],
      ['reservation type', { ...validState, reservations: 'discarded' }],
      ['configuration worktree', { ...validState, configurations: [{ slot: 2 }] }],
      ['missing owner id', {
        ...validState,
        entries: [{ status: 'active', branchName: fixture.branchName, worktree: fixture.repo }],
      }],
      ['malformed owner branch', {
        ...validState,
        entries: [{ id: 'bad-branch-owner', status: 'active', branchName: 42, worktree: fixture.repo }],
      }],
      ['unknown schema', { ...validState, version: 99 }],
    ];
    for (const [label, state] of malformedStates) {
      await writeFile(fixture.coordinationFile, `${JSON.stringify(state)}\n`);
      const report = await fixture.cleanup({ apply: true });
      assert.equal(report.decision, 'retained', `${label}: ${JSON.stringify(report, null, 2)}`);
      assert.ok(report.reasons.some((reason) => reason.code === 'coordination-metadata-unavailable'), label);
      assert.equal(await fixture.localSha(), localTip, label);
      assert.equal(await fixture.remoteSha(), remoteTip, label);
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
      reservations: [{ worktree: fixture.repo, pid: 321, slot: 3 }],
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

test('hanging GitHub metadata is bounded and runs without interactive prompts', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const localTip = await fixture.localSha();
    const auditPath = join(fixture.root, 'gh-environment.txt');
    const startedAt = Date.now();
    const report = await fixture.withFakeGh({ hang: true, auditPath }, () => fixture.cleanup({
      apply: true,
      commandTimeoutMs: 150,
    }));
    const elapsedMs = Date.now() - startedAt;
    expectReason(report, 'pull-request-metadata-unavailable');
    assert.ok(elapsedMs < 1500, `GitHub metadata command took ${elapsedMs}ms despite its timeout.`);
    assert.equal(await readFile(auditPath, 'utf8'), '1:0\n');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), localTip);
  } finally {
    await fixture.dispose();
  }
});

test('GitHub metadata timeout kills a child that ignores SIGTERM', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const localTip = await fixture.localSha();
    const startedAt = Date.now();
    const report = await fixture.withFakeGh({ stubborn: true }, () => fixture.cleanup({
      apply: true,
      commandTimeoutMs: 150,
    }));
    const elapsedMs = Date.now() - startedAt;
    expectReason(report, 'pull-request-metadata-unavailable');
    assert.ok(elapsedMs < 1500, `SIGTERM-ignoring GitHub metadata child lived ${elapsedMs}ms past its timeout.`);
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), localTip);
  } finally {
    await fixture.dispose();
  }
});

test('an unconfirmed remote deletion timeout retains local recovery when origin is already absent', async () => {
  const fixture = await createBranchCleanupFixture();
  let restoreRace;
  try {
    const localTip = await fixture.localSha();
    restoreRace = await installPrePushRace(fixture, { kind: 'remote-delete-hang' });
    const startedAt = Date.now();
    const report = await fixture.cleanup({ apply: true, commandTimeoutMs: 150 });
    const elapsedMs = Date.now() - startedAt;
    expectReason(report, 'remote-delete-unconfirmed');
    assert.ok(elapsedMs < 1500, `Timed-out remote deletion took ${elapsedMs}ms to return.`);
    assert.equal(report.actions.remoteBranchRemoved, false);
    assert.equal(report.actions.remoteBranchRemovalUnconfirmed, true);
    assert.equal(report.actions.localBranchRemoved, false);
    assert.equal(report.recovery.verified, true);
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), null);
  } finally {
    restoreRace?.();
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
    await mkdir(join(fixture.repo, 'local-data'), { recursive: true });
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

test('recovery artifacts are excluded from every registered checkout and symlink alias', async () => {
  const fixture = await createBranchCleanupFixture();
  const alternateCheckout = join(fixture.root, 'alternate-checkout');
  const missingCheckout = join(fixture.root, 'missing-checkout');
  const checkoutAlias = join(fixture.root, 'alternate-alias');
  try {
    await fixture.runGit(['worktree', 'add', '--detach', alternateCheckout, 'main']);
    const siblingArtifact = join(alternateCheckout, 'recovery');
    const localTip = await fixture.localSha();
    const remoteTip = await fixture.remoteSha();
    const sibling = await fixture.cleanup({ apply: true, artifactDirectory: siblingArtifact });
    expectReason(sibling, 'recovery-directory-inside-worktree');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), remoteTip);
    await assert.rejects(readFile(join(siblingArtifact, 'manifest.json')));

    await symlink(alternateCheckout, checkoutAlias, 'dir');
    const viaAlias = await fixture.cleanup({ apply: true, artifactDirectory: join(checkoutAlias, 'recovery') });
    expectReason(viaAlias, 'recovery-directory-inside-worktree');
    await assert.rejects(readFile(join(alternateCheckout, 'recovery', 'manifest.json')));

    await fixture.runGit(['worktree', 'add', '--detach', missingCheckout, 'main']);
    await rm(missingCheckout, { recursive: true, force: true });
    const missingRootArtifact = join(missingCheckout, 'recovery');
    const missingRoot = await fixture.cleanup({ apply: true, artifactDirectory: missingRootArtifact });
    expectReason(missingRoot, 'recovery-directory-inside-worktree');
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), remoteTip);
    await assert.rejects(readFile(join(missingRootArtifact, 'manifest.json')));
  } finally {
    await fixture.dispose();
  }
});

test('a shallow repository is retained when its bundle cannot restore into an empty bare repository', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const shallowRepo = join(fixture.root, 'shallow-clone');
    await runGit(fixture.root, [
      'clone', '--depth=1', '--branch', fixture.branchName,
      `file://${fixture.origin}`, shallowRepo,
    ]);
    const localTip = await runGit(shallowRepo, ['rev-parse', `refs/heads/${fixture.branchName}`]);
    const report = await fixture.withFakeGh({}, () => cleanupBranch({
      cwd: shallowRepo,
      branch: fixture.branchName,
      apply: true,
      artifactDirectory: fixture.artifactDirectory,
      coordinationFile: fixture.coordinationFile,
    }));
    const restoreRepository = join(fixture.root, 'restore-verifier.git');
    await runGit(fixture.root, ['init', '--bare', restoreRepository]);
    let restoreError = null;
    try {
      await runGit(restoreRepository, [
        'fetch', report.recovery.bundlePath,
        `refs/heads/${fixture.branchName}:refs/heads/restored`,
      ]);
    } catch (error) {
      restoreError = error;
    }

    if (restoreError) {
      expectReason(report, 'recovery-not-self-contained');
      assert.equal(await runGit(shallowRepo, ['rev-parse', `refs/heads/${fixture.branchName}`]), localTip);
      assert.equal(await fixture.remoteSha(), localTip);
    } else {
      assert.equal(report.decision, 'removed', JSON.stringify(report, null, 2));
      assert.equal(await runGit(restoreRepository, ['rev-parse', 'refs/heads/restored']), localTip);
    }
  } finally {
    await fixture.dispose();
  }
});

async function installPrePushRace(fixture, { kind, raceSha = '' }) {
  const hooksPath = join(fixture.root, 'hooks');
  await mkdir(hooksPath);
  await fixture.runGit(['config', 'core.hooksPath', hooksPath]);
  const hook = [
    '#!/bin/sh',
    'if [ "${BRANCH_CLEANUP_RACE_KIND:-}" = "remote" ]; then',
    '  git --git-dir="$BRANCH_CLEANUP_RACE_ORIGIN" update-ref "$BRANCH_CLEANUP_RACE_REF" "$BRANCH_CLEANUP_RACE_SHA"',
    'elif [ "${BRANCH_CLEANUP_RACE_KIND:-}" = "local" ]; then',
    '  git -C "$BRANCH_CLEANUP_RACE_REPO" update-ref "$BRANCH_CLEANUP_RACE_REF" "$BRANCH_CLEANUP_RACE_SHA"',
    'elif [ "${BRANCH_CLEANUP_RACE_KIND:-}" = "root-reattach" ]; then',
    '  git -C "$BRANCH_CLEANUP_RACE_REPO" symbolic-ref HEAD "$BRANCH_CLEANUP_RACE_REF"',
    'elif [ "${BRANCH_CLEANUP_RACE_KIND:-}" = "remote-delete-hang" ]; then',
    '  git --git-dir="$BRANCH_CLEANUP_RACE_ORIGIN" update-ref -d "$BRANCH_CLEANUP_RACE_REF"',
    '  exec sleep 3',
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

async function installReferenceTransactionRace(fixture, { kind, worktree = fixture.repo }) {
  const hooksPath = join(fixture.root, 'reference-hooks');
  await mkdir(hooksPath);
  const hookPath = join(hooksPath, 'reference-transaction');
  const resultPath = join(fixture.root, 'reference-transaction-result.txt');
  await fixture.runGit(['config', 'core.hooksPath', hooksPath]);
  await writeFile(hookPath, [
    '#!/bin/sh',
    'if [ "$1" = "prepared" ] && [ "${BRANCH_CLEANUP_REF_RACE_KIND:-}" = "reattach" ]; then',
    '  while read old new ref; do',
    '    if [ "$ref" = "$BRANCH_CLEANUP_REF_RACE_REF" ]; then',
    '      git -C "$BRANCH_CLEANUP_REF_RACE_REPO" symbolic-ref HEAD "$ref" >"$BRANCH_CLEANUP_REF_RACE_RESULT" 2>&1',
    '      printf "%s\\n" "$?" >>"$BRANCH_CLEANUP_REF_RACE_RESULT"',
    '    fi',
    '  done',
    'fi',
    'exit 0',
  ].join('\n') + '\n');
  await chmod(hookPath, 0o700);
  const prior = {
    kind: process.env.BRANCH_CLEANUP_REF_RACE_KIND,
    repo: process.env.BRANCH_CLEANUP_REF_RACE_REPO,
    ref: process.env.BRANCH_CLEANUP_REF_RACE_REF,
    result: process.env.BRANCH_CLEANUP_REF_RACE_RESULT,
  };
  process.env.BRANCH_CLEANUP_REF_RACE_KIND = kind;
  process.env.BRANCH_CLEANUP_REF_RACE_REPO = worktree;
  process.env.BRANCH_CLEANUP_REF_RACE_REF = `refs/heads/${fixture.branchName}`;
  process.env.BRANCH_CLEANUP_REF_RACE_RESULT = resultPath;
  return {
    resultPath,
    restore: () => {
      for (const [key, value] of Object.entries({
        BRANCH_CLEANUP_REF_RACE_KIND: prior.kind,
        BRANCH_CLEANUP_REF_RACE_REPO: prior.repo,
        BRANCH_CLEANUP_REF_RACE_REF: prior.ref,
        BRANCH_CLEANUP_REF_RACE_RESULT: prior.result,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
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

test('local CAS retains a replacement already merged to default after remote deletion', async () => {
  const fixture = await createBranchCleanupFixture();
  let restoreRace;
  try {
    const originalTip = await fixture.localSha();
    const raceSha = await fixture.runGit(['rev-parse', 'refs/remotes/origin/main']);
    assert.notEqual(raceSha, originalTip);
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

test('cleanup retains the local ref if the initiating checkout is reattached during remote deletion', async () => {
  const fixture = await createBranchCleanupFixture();
  let restoreRace;
  try {
    const localTip = await fixture.localSha();
    restoreRace = await installPrePushRace(fixture, { kind: 'root-reattach' });
    const report = await fixture.cleanup({ apply: true });
    expectReason(report, 'branch-in-other-worktree');
    assert.equal(report.actions.remoteBranchRemoved, true);
    assert.equal(report.actions.localBranchRemoved, false);
    assert.equal(await fixture.localSha(), localTip);
    assert.equal(await fixture.remoteSha(), null);
    assert.equal(await fixture.runGit(['branch', '--show-current']), fixture.branchName);
  } finally {
    restoreRace?.();
    await fixture.dispose();
  }
});

test('local ref deletion cannot leave the initiating HEAD dangling when reattached in its transaction hook', async () => {
  const fixture = await createBranchCleanupFixture();
  let race;
  try {
    const targetSha = await fixture.localSha();
    race = await installReferenceTransactionRace(fixture, { kind: 'reattach' });
    const report = await fixture.cleanup({ apply: true });
    const headCommit = await fixture.runGit(['rev-parse', '--verify', 'HEAD^{commit}']);
    const headRef = await fixture.runGit(['symbolic-ref', '-q', 'HEAD']).catch(() => null);
    assert.ok(headCommit, 'the initiating checkout HEAD must still resolve to a commit');
    assert.ok(await readFile(race.resultPath, 'utf8'), 'the prepared transaction hook must attempt reattachment');
    if (headRef === `refs/heads/${fixture.branchName}`) {
      assert.equal(await fixture.localSha(), targetSha, 'a symbolic HEAD must retain its branch ref');
    }
    if (report.decision === 'removed') {
      assert.equal(await fixture.localSha().catch(() => null), null);
      assert.notEqual(headRef, `refs/heads/${fixture.branchName}`);
    }
  } finally {
    race?.restore();
    await fixture.dispose();
  }
});

for (const state of ['detached linked', 'symbolic linked', 'symbolic primary']) {
  test(`cleanup protects a registered checkout HEAD (${state}) throughout local deletion`, async () => {
    const fixture = await createBranchCleanupFixture();
    let race;
    try {
      const linkedCheckout = join(fixture.root, 'linked-checkout');
      await fixture.runGit(['worktree', 'add', '--detach', linkedCheckout, 'main']);
      if (state === 'symbolic linked') {
        await runGit(linkedCheckout, ['switch', '-c', 'sibling/owner']);
      }
      const cleanupRoot = state === 'symbolic primary' ? linkedCheckout : fixture.repo;
      const protectedRoot = state === 'symbolic primary' ? fixture.repo : linkedCheckout;
      const expectedCommit = await runGit(protectedRoot, ['rev-parse', 'HEAD']);
      const expectedRef = await runGit(protectedRoot, ['symbolic-ref', '-q', 'HEAD']).catch(() => null);
      race = await installReferenceTransactionRace(fixture, { kind: 'reattach', worktree: protectedRoot });

      const report = await fixture.cleanup({ cwd: cleanupRoot, apply: true });
      assert.equal(await runGit(protectedRoot, ['rev-parse', '--verify', 'HEAD^{commit}']), expectedCommit);
      assert.equal(await runGit(protectedRoot, ['symbolic-ref', '-q', 'HEAD']).catch(() => null), expectedRef);
      assert.ok(await readFile(race.resultPath, 'utf8'), 'the transaction hook must attempt the competing attachment');
      assert.equal(report.decision, 'removed', JSON.stringify(report, null, 2));
      assert.equal(await fixture.localSha().catch(() => null), null);
      assert.equal(await fixture.remoteSha(), null);
      const protectedHead = await runGit(protectedRoot, ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD']);
      await assert.rejects(readFile(`${protectedHead}.lock`), { code: 'ENOENT' });
    } finally {
      race?.restore();
      await fixture.dispose();
    }
  });
}

test('an existing checkout HEAD lock retains both refs and releases only newly acquired guards', async () => {
  const fixture = await createBranchCleanupFixture();
  try {
    const first = join(fixture.root, 'first-checkout');
    const second = join(fixture.root, 'second-checkout');
    await fixture.runGit(['worktree', 'add', '--detach', first, 'main']);
    await fixture.runGit(['worktree', 'add', '--detach', second, 'main']);
    const firstHead = await runGit(first, ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD']);
    const secondHead = await runGit(second, ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD']);
    await writeFile(`${secondHead}.lock`, 'another Git operation owns this lock\n');
    const targetSha = await fixture.localSha();

    const report = await fixture.cleanup({ apply: true });
    expectReason(report, 'worktree-head-guard-unavailable');
    assert.equal(await fixture.localSha(), targetSha);
    assert.equal(await fixture.remoteSha(), targetSha);
    assert.equal(await readFile(`${secondHead}.lock`, 'utf8'), 'another Git operation owns this lock\n');
    await assert.rejects(readFile(`${firstHead}.lock`), { code: 'ENOENT' });
  } finally {
    await fixture.dispose();
  }
});
