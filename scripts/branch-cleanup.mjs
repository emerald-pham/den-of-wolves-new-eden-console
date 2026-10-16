#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  coordinationFilePath,
  emptyCoordinationState,
  parseCoordinationState,
  pruneDeadReservations,
} from './emulator-resource-registry.mjs';

const execFileAsync = promisify(execFile);
const commandTimeoutContext = new AsyncLocalStorage();
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_TIMEOUT_MS = 300_000;
const DEFAULT_ARTIFACT_DIRECTORY = resolve(
  homedir(), '.codex', 'recovery-bundles', 'den-of-wolves-branch-cleanup',
);
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

class CommandFailure extends Error {
  constructor(command, args, error) {
    const detail = String(error?.stderr ?? '').trim() || String(error?.message ?? error);
    super(`${command} ${args.join(' ')} failed: ${detail}`, { cause: error });
    this.exitCode = Number.isInteger(error?.code) ? error.code : null;
  }
}

async function run(command, args, { cwd, allowedExitCodes = [] } = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: commandTimeoutContext.getStore() ?? DEFAULT_COMMAND_TIMEOUT_MS,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never',
      },
    });
    return String(result.stdout ?? '').trimEnd();
  } catch (error) {
    if (allowedExitCodes.includes(error?.code)) return null;
    throw new CommandFailure(command, args, error);
  }
}

function within(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

async function canonicalPath(path) {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    return absolute;
  }
}

async function resolveProspectivePath(path) {
  let current = resolve(path);
  const missingSegments = [];
  while (true) {
    try {
      const actual = await realpath(current);
      return resolve(actual, ...missingSegments);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

function addReason(report, code, message) {
  if (!report.reasons.some((reason) => reason.code === code)) report.reasons.push({ code, message });
  report.decision = 'retained';
  return report;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCoordinationPayload(payload) {
  if (!isRecord(payload)) throw new Error('The coordination ledger root must be a JSON object.');
  if (payload.version !== 1 || payload.scope !== 'codex-wide' || !nonEmptyString(payload.versionAgreement)) {
    throw new Error('The coordination ledger schema version, scope, or version agreement is unknown.');
  }
  for (const key of ['entries', 'reservations', 'configurations']) {
    if (!Array.isArray(payload[key])) throw new Error(`The coordination ledger ${key} field must be an array.`);
  }
  for (const [index, entry] of payload.entries.entries()) {
    if (!isRecord(entry) || !nonEmptyString(entry.id) || !['active', 'parked', 'complete'].includes(entry.status) ||
        !nonEmptyString(entry.branchName) || !nonEmptyString(entry.worktree)) {
      throw new Error(`Coordination entry ${index} is missing valid ownership fields.`);
    }
    for (const key of ['repositoryIdentity', 'repositoryRoot']) {
      if (entry[key] !== undefined && !nonEmptyString(entry[key])) {
        throw new Error(`Coordination entry ${index} has malformed ${key}.`);
      }
    }
  }
  for (const [index, reservation] of payload.reservations.entries()) {
    if (!isRecord(reservation) || !nonEmptyString(reservation.worktree) || !Number.isInteger(reservation.slot) || reservation.slot < 0) {
      throw new Error(`Coordination reservation ${index} is missing valid checkout or slot metadata.`);
    }
    for (const key of ['pid', 'childPid']) {
      if (reservation[key] !== undefined && (!Number.isSafeInteger(reservation[key]) || reservation[key] < 1)) {
        throw new Error(`Coordination reservation ${index} has malformed ${key}.`);
      }
    }
    if (!Number.isSafeInteger(reservation.pid) && !Number.isSafeInteger(reservation.childPid)) {
      throw new Error(`Coordination reservation ${index} has no valid process owner.`);
    }
  }
  for (const [index, configuration] of payload.configurations.entries()) {
    if (!isRecord(configuration) || !nonEmptyString(configuration.worktree) || !Number.isInteger(configuration.slot) || configuration.slot < 0) {
      throw new Error(`Coordination configuration ${index} is missing valid checkout or slot metadata.`);
    }
  }
}

async function strictCoordinationState(coordinationFile) {
  let contents;
  try {
    contents = await readFile(coordinationFile, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyCoordinationState();
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(contents);
  } catch (error) {
    throw new Error(`The coordination ledger is not valid JSON: ${error.message}`, { cause: error });
  }
  validateCoordinationPayload(payload);
  return pruneDeadReservations(parseCoordinationState(contents));
}

function isValidBranchName(branch) {
  return typeof branch === 'string' && branch.length > 0 && !branch.includes('\0');
}

async function currentBranch(root) {
  return (await run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, allowedExitCodes: [1] })) || '';
}

async function branchSha(root, branch) {
  const expectedRef = `refs/heads/${branch}`;
  const output = await run('git', [
    'for-each-ref', '--format=%(refname)%00%(objectname)', expectedRef,
  ], { cwd: root });
  const matching = output.split('\n').map((line) => line.split('\0')).find(([ref]) => ref === expectedRef);
  return matching?.[1] && SHA_PATTERN.test(matching[1]) ? matching[1] : null;
}

async function remoteBranchSha(root, branch) {
  const ref = `refs/heads/${branch}`;
  const output = await run('git', ['ls-remote', '--heads', '--refs', 'origin', ref], { cwd: root });
  const matches = output.split('\n').filter(Boolean).flatMap((line) => {
    const [sha, name] = line.split('\t');
    return name === ref && SHA_PATTERN.test(sha ?? '') ? [{ sha, ref: name }] : [];
  });
  if (matches.length > 1) throw new Error(`Remote returned multiple tips for ${ref}.`);
  return matches[0]?.sha ?? null;
}

async function defaultBranchName(root) {
  const remoteHead = await run('git', ['ls-remote', '--symref', 'origin', 'HEAD'], { cwd: root });
  const names = remoteHead.split('\n').filter((entry) => entry.startsWith('ref: refs/heads/') && entry.endsWith('\tHEAD'))
    .map((entry) => entry.slice('ref: refs/heads/'.length, entry.length - '\tHEAD'.length));
  return names.length === 1 && isValidBranchName(names[0]) ? names[0] : null;
}

async function fetchDefaultBranch(root, branch) {
  const remoteRef = `refs/heads/${branch}`;
  const trackingRef = `refs/remotes/origin/${branch}`;
  await run('git', ['fetch', '--no-tags', 'origin', `+${remoteRef}:${trackingRef}`], { cwd: root });
  const sha = await run('git', ['rev-parse', '--verify', `${trackingRef}^{commit}`], { cwd: root });
  if (!SHA_PATTERN.test(sha)) throw new Error(`Fetched default ref ${trackingRef} did not resolve to a commit.`);
  return sha;
}

function parseWorktreeList(output) {
  return output.split(/\n\s*\n/).map((block) => {
    const record = { path: null, branch: null, prunable: false };
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) record.path = line.slice('worktree '.length);
      else if (line.startsWith('branch ')) record.branch = line.slice('branch '.length);
      else if (line.startsWith('prunable ')) record.prunable = true;
    }
    return record;
  }).filter((record) => record.path);
}

async function branchWorktreeReason(root, branch, { allowCurrentWorktree = false } = {}) {
  const worktrees = parseWorktreeList(await run('git', ['worktree', 'list', '--porcelain'], { cwd: root }));
  for (const worktree of worktrees) {
    if (worktree.branch !== `refs/heads/${branch}`) continue;
    const worktreeRoot = await canonicalPath(worktree.path);
    if (allowCurrentWorktree && worktreeRoot === root && await currentBranch(root) === branch) continue;
    return {
      code: 'branch-in-other-worktree',
      message: `The branch ${branch} is still attached to a Git checkout at ${worktree.path}${worktree.prunable ? ' (missing path)' : ''}.`,
    };
  }
  return null;
}

async function repositoryIdentityAt(path) {
  try {
    const gitDirectory = await run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: path });
    return canonicalPath(gitDirectory);
  } catch {
    return null;
  }
}

async function ledgerIdentity(entry) {
  if (typeof entry?.repositoryIdentity === 'string' && entry.repositoryIdentity.trim()) {
    return canonicalPath(entry.repositoryIdentity);
  }
  if (typeof entry?.repositoryRoot === 'string' && entry.repositoryRoot.trim()) {
    return repositoryIdentityAt(entry.repositoryRoot);
  }
  if (typeof entry?.worktree === 'string' && entry.worktree.trim()) {
    return repositoryIdentityAt(entry.worktree);
  }
  return null;
}

async function coordinationReason({ coordinationFile, root, identity, branch }) {
  let state;
  try {
    state = await strictCoordinationState(coordinationFile);
  } catch (error) {
    return {
      code: 'coordination-metadata-unavailable',
      message: `The shared coordination ledger could not be read safely: ${error.message}`,
    };
  }

  for (const entry of state.entries ?? []) {
    if (entry?.branchName !== branch) continue;
    const entryIdentity = await ledgerIdentity(entry);
    const entryWorktree = typeof entry.worktree === 'string' ? await canonicalPath(entry.worktree) : null;
    const ownershipStatus = entry.status === 'active' || entry.status === 'parked';
    if (!entryIdentity && ownershipStatus) {
      return {
        code: 'coordination-ownership',
        message: `The ${entry.status} ledger entry ${entry.id} owns ${branch}, but its repository identity cannot be verified.`,
      };
    }
    if (!entryIdentity && entryWorktree && entryWorktree !== root) {
      return {
        code: 'branch-in-other-worktree',
        message: `The coordination ledger registers ${branch} in another checkout at ${entry.worktree}, but its repository identity cannot be verified.`,
      };
    }
    if (entryIdentity !== identity) continue;
    if (ownershipStatus) {
      return {
        code: 'coordination-ownership',
        message: `The ${entry.status} ledger entry ${entry.id} still owns ${branch}.`,
      };
    }
    if (entryWorktree && entryWorktree !== root) {
      return {
        code: 'branch-in-other-worktree',
        message: `The coordination ledger still registers ${branch} in another checkout at ${entry.worktree}.`,
      };
    }
  }

  for (const registration of [...(state.reservations ?? []), ...(state.configurations ?? [])]) {
    if (typeof registration?.worktree !== 'string') continue;
    if (await canonicalPath(registration.worktree) === root) {
      return {
        code: 'checkout-in-use',
        message: `The current checkout still has a shared coordination reservation or configuration.`,
      };
    }
  }

  return null;
}

async function recoveryDirectoryReason({ root, coordinationFile, artifactDirectory }) {
  let state;
  try {
    state = await strictCoordinationState(coordinationFile);
  } catch (error) {
    return {
      code: 'coordination-metadata-unavailable',
      message: `The shared coordination ledger could not be validated safely: ${error.message}`,
    };
  }
  try {
    const prospectiveArtifactRoot = await resolveProspectivePath(artifactDirectory);
    const worktrees = parseWorktreeList(await run('git', ['worktree', 'list', '--porcelain'], { cwd: root }));
    const registeredPaths = [
      ...worktrees.map((worktree) => worktree.path),
      ...(state.entries ?? []).map((entry) => entry?.worktree),
      ...(state.reservations ?? []).map((reservation) => reservation?.worktree),
      ...(state.configurations ?? []).map((configuration) => configuration?.worktree),
    ].filter((path) => typeof path === 'string' && path.trim());
    for (const registeredPath of registeredPaths) {
      const registeredRoot = await resolveProspectivePath(registeredPath);
      if (within(registeredRoot, prospectiveArtifactRoot)) {
        return {
          code: 'recovery-directory-inside-worktree',
          message: `Recovery artifacts must be stored outside every registered checkout; ${artifactDirectory} is inside ${registeredPath}.`,
        };
      }
    }
    return null;
  } catch (error) {
    return {
      code: 'recovery-directory-unavailable',
      message: `Recovery artifact isolation could not be verified safely: ${error.message}`,
    };
  }
}

async function verifyBundleRestoresIndependently({ root, branch, targetSha, bundlePath }) {
  let verificationDirectory;
  try {
    verificationDirectory = await mkdtemp(join(dirname(bundlePath), '.branch-cleanup-restore-'));
    const emptyRepository = join(verificationDirectory, 'restore.git');
    await run('git', ['init', '--bare', '--quiet', emptyRepository], { cwd: root });
    await run('git', [
      '--git-dir', emptyRepository,
      'fetch', '--no-tags', bundlePath,
      `refs/heads/${branch}:refs/heads/restored`,
    ], { cwd: root });
    const restoredSha = await run('git', [
      '--git-dir', emptyRepository,
      'rev-parse', '--verify', 'refs/heads/restored^{commit}',
    ], { cwd: root });
    if (restoredSha !== targetSha) throw new Error(`The independent restore produced ${restoredSha}, expected ${targetSha}.`);
    await run('git', ['--git-dir', emptyRepository, 'fsck', '--full', '--no-reflogs', '--no-progress'], { cwd: root });
    return null;
  } catch (error) {
    return error;
  } finally {
    if (verificationDirectory) await rm(verificationDirectory, { recursive: true, force: true });
  }
}

async function pullRequestReason(root, branch) {
  try {
    const output = await execFileAsync('gh', [
      'pr', 'list', '--state', 'open', '--head', branch,
      '--json', 'number,headRefName,headRefOid',
    ], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: commandTimeoutContext.getStore() ?? DEFAULT_COMMAND_TIMEOUT_MS,
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: '1',
        GH_NO_UPDATE_NOTIFIER: '1',
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never',
      },
    });
    const pullRequests = JSON.parse(String(output.stdout ?? ''));
    if (!Array.isArray(pullRequests)) throw new Error('GitHub returned a non-list pull request response.');
    if (pullRequests.length > 0) {
      const number = pullRequests[0]?.number;
      return {
        code: 'open-pull-request',
        message: `An open pull request still uses ${branch}${number ? ` (PR #${number})` : ''}.`,
      };
    }
    return null;
  } catch (error) {
    return {
      code: 'pull-request-metadata-unavailable',
      message: `Open pull request metadata could not be verified: ${error.message}`,
    };
  }
}

async function inspectCandidate(report, context, { allowCurrentWorktree = true } = {}) {
  const { root, identity, branch, coordinationFile } = context;
  try {
    const local = await branchSha(root, branch);
    report.local = { exists: Boolean(local), sha: local };

    await run('git', ['remote', 'get-url', 'origin'], { cwd: root });
    const defaultName = await defaultBranchName(root);
    if (!defaultName || !isValidBranchName(defaultName)) {
      return { reason: { code: 'remote-default-unknown', message: 'The origin default branch could not be identified safely.' } };
    }
    const checkedName = await run('git', ['check-ref-format', `refs/heads/${defaultName}`], {
      cwd: root,
      allowedExitCodes: [1],
    });
    if (checkedName === null) {
      return { reason: { code: 'remote-default-unknown', message: 'The origin default branch name is invalid.' } };
    }
    const [defaultSha, mainSha] = await Promise.all([
      fetchDefaultBranch(root, defaultName),
      fetchDefaultBranch(root, 'main'),
    ]);
    report.defaultBranch = { name: defaultName, sha: defaultSha };

    const remote = await remoteBranchSha(root, branch);
    report.remote = { name: 'origin', exists: Boolean(remote), sha: remote };
    if (!local && !remote) return { unchanged: true };
    if (!local) {
      return { reason: { code: 'local-branch-missing', message: `The local branch ${branch} is absent while origin still has a tip.` } };
    }
    if (branch === 'main' || branch === defaultName) {
      return { reason: { code: 'protected-default-branch', message: `The protected branch ${branch} is the repository default or main branch.` } };
    }
    if (remote && local !== remote) {
      return {
        reason: {
          code: 'local-remote-tip-mismatch',
          message: `Local ${branch} is at ${local}, while origin is at ${remote}.`,
        },
      };
    }

    const ancestor = await run('git', ['merge-base', '--is-ancestor', local, mainSha], {
      cwd: root,
      allowedExitCodes: [1],
    });
    if (ancestor === null) {
      return { reason: { code: 'branch-not-merged', message: `The tip of ${branch} is not an ancestor of freshly fetched origin/main.` } };
    }

    const worktreeReason = await branchWorktreeReason(root, branch, { allowCurrentWorktree });
    if (worktreeReason) return { reason: worktreeReason };

    const ownership = await coordinationReason({ coordinationFile, root, identity, branch });
    if (ownership) return { reason: ownership };

    if (await currentBranch(root) === branch) {
      const status = await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root });
      if (status) {
        return {
          reason: {
            code: 'checkout-not-clean',
            message: `The current checkout has tracked or untracked changes; ignored files are preserved and are not included in this check.`,
          },
        };
      }
    }

    const pullRequest = await pullRequestReason(root, branch);
    if (pullRequest) return { reason: pullRequest };

    return { local, remote, defaultName, defaultSha, mainSha };
  } catch (error) {
    return {
      reason: {
        code: 'git-metadata-unavailable',
        message: `Git metadata could not be verified safely: ${error.message}`,
      },
    };
  }
}

async function prepareRecovery({ root, identity, branch, targetSha, defaultBranch, defaultSha, coordinationFile, artifactDirectory }) {
  let directory;
  try {
    const initialPathReason = await recoveryDirectoryReason({ root, coordinationFile, artifactDirectory });
    if (initialPathReason) return { reason: initialPathReason };
    await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
    const actualArtifactRoot = await realpath(artifactDirectory);
    const postCreatePathReason = await recoveryDirectoryReason({ root, coordinationFile, artifactDirectory });
    if (postCreatePathReason) return { reason: postCreatePathReason };
    if (within(root, actualArtifactRoot)) return { reason: { code: 'recovery-directory-inside-worktree', message: 'Recovery artifacts must be stored outside the repository working tree.' } };

    directory = resolve(actualArtifactRoot, [
      'branch', branch.replaceAll('/', '_'),
      targetSha.slice(0, 12),
      new Date().toISOString().replaceAll(':', '-'),
      randomUUID().slice(0, 8),
    ].join('-'));
    const beforeBundleReason = await recoveryDirectoryReason({ root, coordinationFile, artifactDirectory });
    if (beforeBundleReason) return { reason: beforeBundleReason };
    await mkdir(directory, { recursive: false, mode: 0o700 });
    const bundlePath = resolve(directory, 'recovery.bundle');
    const manifestPath = resolve(directory, 'manifest.json');
    await run('git', ['bundle', 'create', bundlePath, `refs/heads/${branch}`], { cwd: root });
    await run('git', ['bundle', 'verify', bundlePath], { cwd: root });
    const heads = await run('git', ['bundle', 'list-heads', bundlePath], { cwd: root });
    const expectedHead = `${targetSha} refs/heads/${branch}`;
    if (!heads.split('\n').includes(expectedHead)) {
      return {
        recovery: { directory, bundlePath, manifestPath, verified: false },
        reason: {
          code: 'recovery-verification-failed',
          message: `The recovery bundle does not contain the expected tip ${targetSha}.`,
        },
      };
    }
    const bundleBytes = await readFile(bundlePath);
    const bundleSha256 = createHash('sha256').update(bundleBytes).digest('hex');
    const independentRestoreError = await verifyBundleRestoresIndependently({ root, branch, targetSha, bundlePath });
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      repositoryIdentity: identity,
      repositoryRoot: root,
      branch,
      targetSha,
      defaultBranch,
      defaultSha,
      bundle: 'recovery.bundle',
      bundleSha256,
      bundleBytes: bundleBytes.byteLength,
      independentRestoreVerified: !independentRestoreError,
    };
    const temporaryManifest = `${manifestPath}.${randomUUID()}.tmp`;
    try {
      const beforeManifestReason = await recoveryDirectoryReason({ root, coordinationFile, artifactDirectory });
      if (beforeManifestReason) return { recovery: { directory, bundlePath, manifestPath, verified: false }, reason: beforeManifestReason };
      await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryManifest, manifestPath);
    } finally {
      await unlink(temporaryManifest).catch(() => undefined);
    }
    const manifestSha256 = createHash('sha256').update(await readFile(manifestPath)).digest('hex');
    if (independentRestoreError) {
      return {
        recovery: {
          directory, bundlePath, manifestPath, bundleSha256, manifestSha256,
          independentlyRestored: false, verified: false,
        },
        reason: {
          code: 'recovery-not-self-contained',
          message: `The recovery bundle could not restore its branch into an empty bare repository: ${independentRestoreError.message}`,
        },
      };
    }
    return {
      recovery: { directory, bundlePath, manifestPath, bundleSha256, manifestSha256, independentlyRestored: true, verified: true },
    };
  } catch (error) {
    return {
      recovery: directory ? { directory, verified: false } : null,
      reason: {
        code: 'recovery-failed',
        message: `A verified recovery bundle and manifest could not be prepared: ${error.message}`,
      },
    };
  }
}

async function compareLocalTip(root, branch, expectedSha) {
  try {
    return await branchSha(root, branch) === expectedSha;
  } catch {
    return false;
  }
}

async function restoreCurrentBranch(root, branch, expectedSha) {
  if (!await compareLocalTip(root, branch, expectedSha)) return false;
  try {
    await run('git', ['switch', '--no-overwrite-ignore', branch], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function reportFor(branch, apply) {
  return {
    version: 1,
    branch,
    mode: apply ? 'apply' : 'preview',
    decision: 'retained',
    repository: null,
    defaultBranch: null,
    local: { exists: false, sha: null },
    remote: { name: 'origin', exists: false, sha: null },
    actions: {
      detached: false,
      remoteBranchRemoved: false,
      remoteBranchRemovalUnconfirmed: false,
      localBranchRemoved: false,
    },
    reasons: [],
    recovery: null,
  };
}

/**
 * Preview or remove one terminal local branch and its matching origin ref.
 * Worktree directories and repository files are never removed by this command.
 */
async function cleanupBranchInternal({
  cwd = process.cwd(),
  branch,
  apply = false,
  coordinationFile,
  artifactDirectory,
} = {}) {
  const requestedRoot = resolve(cwd);
  let root;
  try {
    root = await realpath(await run('git', ['rev-parse', '--show-toplevel'], { cwd: requestedRoot }));
  } catch (error) {
    const report = reportFor(branch ?? '', apply);
    return addReason(report, 'not-a-git-checkout', `The requested directory is not a Git checkout: ${error.message}`);
  }

  const report = reportFor(branch ?? '', apply);
  let identity;
  try {
    identity = await realpath(await run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root }));
  } catch (error) {
    return addReason(report, 'git-metadata-unavailable', `The repository identity could not be verified: ${error.message}`);
  }
  report.repository = { root, identity };

  const targetBranch = branch === undefined ? await currentBranch(root).catch(() => '') : branch;
  report.branch = targetBranch;
  if (!targetBranch) return addReason(report, 'current-branch-unavailable', 'The current checkout is detached; pass --branch NAME to select one branch.');
  if (!isValidBranchName(targetBranch)) return addReason(report, 'invalid-branch-name', 'A branch name is required.');
  try {
    const validRef = await run('git', ['check-ref-format', `refs/heads/${targetBranch}`], { cwd: root, allowedExitCodes: [1] });
    if (validRef === null) return addReason(report, 'invalid-branch-name', `Invalid local branch name: ${targetBranch}.`);
  } catch (error) {
    return addReason(report, 'git-metadata-unavailable', `The branch name could not be checked safely: ${error.message}`);
  }

  const coordinationPath = resolve(coordinationFile ?? coordinationFilePath());
  const proposedArtifactDirectory = artifactDirectory === undefined
    ? DEFAULT_ARTIFACT_DIRECTORY
    : (isAbsolute(artifactDirectory) ? resolve(artifactDirectory) : resolve(root, artifactDirectory));
  try {
    const pathReason = await recoveryDirectoryReason({ root, coordinationFile: coordinationPath, artifactDirectory: proposedArtifactDirectory });
    if (pathReason) return addReason(report, pathReason.code, pathReason.message);
  } catch (error) {
    return addReason(report, 'recovery-directory-unavailable', `The recovery directory path could not be resolved safely: ${error.message}`);
  }

  const context = { root, identity, branch: targetBranch, coordinationFile: coordinationPath };
  const inspected = await inspectCandidate(report, context);
  if (inspected.unchanged) {
    report.decision = 'unchanged';
    report.reasons.push({ code: 'already-absent', message: `The local and origin refs for ${targetBranch} are already absent.` });
    return report;
  }
  if (inspected.reason) return addReason(report, inspected.reason.code, inspected.reason.message);
  report.decision = apply ? 'ready' : 'would-remove';
  if (!apply) return report;

  const recoveryResult = await prepareRecovery({
    root,
    identity,
    branch: targetBranch,
    targetSha: inspected.local,
    defaultBranch: inspected.defaultName,
    defaultSha: inspected.defaultSha,
    coordinationFile: coordinationPath,
    artifactDirectory: proposedArtifactDirectory,
  });
  if (recoveryResult.recovery) report.recovery = recoveryResult.recovery;
  if (recoveryResult.reason) return addReason(report, recoveryResult.reason.code, recoveryResult.reason.message);

  const rechecked = await inspectCandidate(report, context);
  if (rechecked.unchanged) {
    report.decision = 'unchanged';
    report.reasons.push({ code: 'already-absent', message: `The local and origin refs for ${targetBranch} are already absent.` });
    return report;
  }
  if (rechecked.reason) return addReason(report, rechecked.reason.code, rechecked.reason.message);
  if (rechecked.local !== inspected.local || rechecked.remote !== inspected.remote) {
    return addReason(report, 'branch-tip-changed', `The branch tip changed while recovery was being prepared; no branch ref was deleted.`);
  }

  const wasCurrentBranch = await currentBranch(root) === targetBranch;
  if (wasCurrentBranch) {
    try {
      const cleanStatus = await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root });
      if (cleanStatus) return addReason(report, 'checkout-not-clean', 'The current checkout changed before it could be detached.');
      await run('git', ['switch', '--no-overwrite-ignore', '--detach', rechecked.defaultSha], { cwd: root });
      report.actions.detached = true;
    } catch (error) {
      return addReason(report, 'checkout-change-blocked', `The current checkout could not detach without overwriting files: ${error.message}`);
    }
  }

  const finalInspection = await inspectCandidate(report, context, { allowCurrentWorktree: false });
  if (finalInspection.unchanged) {
    report.decision = 'unchanged';
    report.reasons.push({ code: 'already-absent', message: `The local and origin refs for ${targetBranch} are already absent.` });
    return report;
  }
  if (finalInspection.reason) {
    if (wasCurrentBranch && report.actions.detached) {
      report.actions.reattached = await restoreCurrentBranch(root, targetBranch, inspected.local);
    }
    return addReason(report, finalInspection.reason.code, finalInspection.reason.message);
  }
  if (finalInspection.local !== inspected.local || finalInspection.remote !== inspected.remote) {
    if (wasCurrentBranch && report.actions.detached) {
      report.actions.reattached = await restoreCurrentBranch(root, targetBranch, inspected.local);
    }
    return addReason(report, 'branch-tip-changed', 'The branch tip changed immediately before deletion; both refs were retained.');
  }

  if (rechecked.remote) {
    try {
      await run('git', [
        'push', '--porcelain',
        `--force-with-lease=refs/heads/${targetBranch}:${rechecked.remote}`,
        'origin', `:refs/heads/${targetBranch}`,
      ], { cwd: root });
      report.actions.remoteBranchRemoved = true;
    } catch (error) {
      let currentRemote;
      try {
        currentRemote = await remoteBranchSha(root, targetBranch);
      } catch {
        // The failed push and unavailable follow-up both retain the local ref.
      }
      if (wasCurrentBranch && report.actions.detached) {
        report.actions.reattached = await restoreCurrentBranch(root, targetBranch, inspected.local);
      }
      if (currentRemote === null) {
        report.remote = { name: 'origin', exists: false, sha: null };
        report.actions.remoteBranchRemovalUnconfirmed = true;
        return addReason(
          report,
          'remote-delete-unconfirmed',
          `Origin no longer has ${targetBranch}, but the deletion command did not confirm its exact-SHA lease; the local recovery ref was retained.`,
        );
      }
      if (currentRemote !== undefined) report.remote = { name: 'origin', exists: true, sha: currentRemote };
      return addReason(
        report,
        currentRemote !== undefined && currentRemote !== rechecked.remote ? 'remote-tip-changed' : 'remote-delete-failed',
        currentRemote !== undefined && currentRemote !== rechecked.remote
          ? `Origin changed ${targetBranch} during cleanup; its exact-SHA deletion was not confirmed, so the local ref was retained.`
          : `Origin did not confirm deletion of ${targetBranch}: ${error.message}`,
      );
    }

    let afterPush;
    try {
      afterPush = await remoteBranchSha(root, targetBranch);
    } catch (error) {
      return addReason(report, 'remote-metadata-unavailable', `Origin deletion could not be verified: ${error.message}`);
    }
    if (afterPush) {
      return addReason(report, 'remote-branch-reappeared', `Origin still has ${targetBranch} after the leased deletion.`);
    }
  }

  const ownership = await coordinationReason({ coordinationFile: coordinationPath, root, identity, branch: targetBranch });
  if (ownership) return addReason(report, ownership.code, ownership.message);
  try {
    const attached = await branchWorktreeReason(root, targetBranch);
    if (attached) return addReason(report, attached.code, attached.message);
  } catch (error) {
    return addReason(report, 'worktree-metadata-unavailable', `Git worktree registration could not be rechecked: ${error.message}`);
  }

  const finalLocalSha = await branchSha(root, targetBranch).catch(() => null);
  if (finalLocalSha !== inspected.local) {
    return addReason(report, 'local-tip-changed', `The local tip of ${targetBranch} changed after the recovery bundle was verified; compare-and-swap retained the new local ref.`);
  }

  try {
    const attached = await branchWorktreeReason(root, targetBranch);
    if (attached) return addReason(report, attached.code, attached.message);
    await run('git', ['update-ref', '-d', `refs/heads/${targetBranch}`, inspected.local], { cwd: root });
    report.actions.localBranchRemoved = true;
  } catch (error) {
    const latest = await branchSha(root, targetBranch).catch(() => null);
    return addReason(
      report,
      latest && latest !== inspected.local ? 'local-tip-changed' : 'local-delete-failed',
      latest && latest !== inspected.local
        ? `The local tip of ${targetBranch} changed during compare-and-swap; the new ref was retained.`
        : `Git did not confirm deletion of ${targetBranch}: ${error.message}`,
    );
  }

  report.decision = 'removed';
  return report;
}

export async function cleanupBranch(options = {}) {
  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  if (!Number.isSafeInteger(commandTimeoutMs) || commandTimeoutMs < 1 || commandTimeoutMs > MAX_COMMAND_TIMEOUT_MS) {
    throw new RangeError(`commandTimeoutMs must be an integer between 1 and ${MAX_COMMAND_TIMEOUT_MS}.`);
  }
  return commandTimeoutContext.run(commandTimeoutMs, () => cleanupBranchInternal(options));
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--branch' || argument === '--artifact-dir' || argument === '--coordination-file') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      if (argument === '--branch') options.branch = value;
      else if (argument === '--artifact-dir') options.artifactDirectory = value;
      else options.coordinationFile = value;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown branch cleanup option: ${argument}`);
    }
  }
  return options;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/branch-cleanup.mjs [--branch NAME] [--apply] [--artifact-dir PATH] [--coordination-file PATH]');
      return;
    }
    const report = await cleanupBranch(options);
    console.log(JSON.stringify(report, null, 2));
    if (report.decision === 'retained') process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
