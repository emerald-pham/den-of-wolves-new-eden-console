#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  EMULATOR_SLOT_COUNT,
  emulatorPortsForSlot,
  vitePortForSlot,
} from './emulator-slots.js';

export const COORDINATION_FILE_ENV = 'DOW_EMULATOR_COORDINATION_FILE';
export const COORDINATION_SCHEMA_VERSION = 1;
export const DEFAULT_VERSION_AGREEMENT =
  'Increment the patch version for each completed player-facing fix; do not bump tooling-only work.';

const DEFAULT_COORDINATION_FILE = 'den-of-wolves-new-eden-coordination.json';
const LOCK_RETRY_MS = 50;
const LOCK_ATTEMPTS = 600;
const EMPTY_LOCK_GRACE_MS = 1_000;
const APPLICATION_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const execFileAsync = promisify(execFile);

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isDocumentationFile(filePath) {
  const fileName = basename(filePath);
  return /\.mdx?$/i.test(fileName) || fileName === 'README' || /^README\./i.test(fileName);
}

function isVisualFile(filePath) {
  return /\.(css|html|jsx|scss|tsx)$/i.test(filePath) ||
    /(^|\/)src\/(components|routes|styles)\//.test(filePath);
}

/** Derive the checks and explicit human attestations required by changed files. */
export function validationPlanForFiles(changedFiles = []) {
  const files = (Array.isArray(changedFiles) ? changedFiles : [])
    .filter((filePath) => typeof filePath === 'string' && filePath.trim());
  const documentationOnly = files.length > 0 && files.every(isDocumentationFile);
  const requiresDocumentationReview = files.some(isDocumentationFile);
  const commands = documentationOnly
    ? ['git diff --check', 'npm run coordination:docs']
    : [
        'git diff --check',
        'npm run lint',
        'npm run test:all',
        'npm run build',
        'npm run build --prefix functions',
        ...(requiresDocumentationReview ? ['npm run coordination:docs'] : []),
      ];
  return {
    documentationOnly,
    requiresDocumentationReview,
    requiresVisualReview: files.some(isVisualFile),
    commands,
  };
}

function normalizeChangelogSource(source) {
  return source.replace(/\s+/g, ' ').trim();
}

function normalizeChangelogEntrySource(source) {
  return normalizeChangelogSource(source).replace(
    /^version:\s*(?:APP_VERSION|['"]\d+\.\d+\.\d+['"])/,
    'version: <VERSION>',
  );
}

function parseApplicationVersion(source, ref) {
  const match = source.match(/"version"\s*:\s*"([^"]+)"/);
  const version = match?.[1];
  if (!version || !APPLICATION_VERSION_PATTERN.test(version)) {
    throw new Error(`Cannot read a valid application version from ${ref}.`);
  }
  return version;
}

function parseLockfileVersion(source, ref) {
  let lockfile;
  try {
    lockfile = JSON.parse(source);
  } catch (error) {
    throw new Error(`Cannot read ${ref} as JSON.`, { cause: error });
  }
  const version = lockfile?.packages?.['']?.version;
  if (typeof version !== 'string' || !APPLICATION_VERSION_PATTERN.test(version)) {
    throw new Error(`Cannot read a valid root package version from ${ref}.`);
  }
  return version;
}

export function compareApplicationVersions(left, right) {
  const leftParts = left.match(APPLICATION_VERSION_PATTERN);
  const rightParts = right.match(APPLICATION_VERSION_PATTERN);
  if (!leftParts || !rightParts) {
    throw new Error(`Cannot compare invalid application versions: ${left} and ${right}.`);
  }

  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftParts[index]) - Number(rightParts[index]);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function parseChangelogSnapshot(source, applicationVersion) {
  const versionPattern = /version:\s*(APP_VERSION|['"](\d+\.\d+\.\d+)['"])/g;
  const matches = [...source.matchAll(versionPattern)];
  if (matches.length === 0) {
    throw new Error('Cannot read any release entries from src/changelog.ts.');
  }

  return matches.map((match, index) => {
    const version = match[1] === 'APP_VERSION' ? applicationVersion : match[2];
    if (!version || !APPLICATION_VERSION_PATTERN.test(version)) {
      throw new Error(`Cannot read a valid changelog version near ${match[0]}.`);
    }
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    return {
      version,
      source: normalizeChangelogSource(source.slice(start, end)),
    };
  });
}

function isToolingOnlyVersionPlan(versionPlan) {
  return /tooling-only|documentation-only|no application version|no[- ]player[- ]facing change/i
    .test(versionPlan ?? '');
}

function plannedApplicationVersion(versionPlan) {
  const matches = [...(versionPlan ?? '').matchAll(/\b\d+\.\d+\.\d+\b/g)];
  return matches.at(-1)?.[0];
}

function changelogPreservationErrors(mainChangelog, branchChangelog) {
  const branchEntries = new Map();
  const errors = [];

  for (const entry of branchChangelog) {
    if (branchEntries.has(entry.version)) {
      errors.push(`branch changelog repeats version ${entry.version}`);
    }
    branchEntries.set(entry.version, entry);
  }

  for (const mainEntry of mainChangelog) {
    const branchEntry = branchEntries.get(mainEntry.version);
    if (!branchEntry) {
      errors.push(
        `branch changelog is missing main's ${mainEntry.version} entry and would replace newer release notes`,
      );
      continue;
    }
    if (
      normalizeChangelogEntrySource(branchEntry.source) !==
      normalizeChangelogEntrySource(mainEntry.source)
    ) {
      errors.push(
        `branch changelog would replace main's ${mainEntry.version} entry`,
      );
    }
  }

  return errors;
}

function releaseMetadataErrors({ entry, release, requireMerged }) {
  const errors = [];

  if (!release.branchName || release.branchName === 'HEAD') {
    errors.push('the checkout is detached');
  } else if (release.branchName === 'main') {
    errors.push('the task is running directly on main');
  }
  if (entry.branchName && release.branchName !== entry.branchName) {
    errors.push(
      `the checkout branch ${release.branchName} does not match the coordination branch ${entry.branchName}`,
    );
  }

  if (requireMerged && !release.mainContainsBranch) {
    errors.push(
      `main (${release.mainSha}) does not contain the task branch commit ${release.branchSha}`,
    );
  }

  if (release.originMainSha !== release.mainSha) {
    errors.push(
      `origin/main (${release.originMainSha}) does not match local main (${release.mainSha}); push or reconcile the main branch`,
    );
  }

  if (!release.worktreeClean) {
    errors.push('the checkout has uncommitted changes');
  }

  if (release.branchVersion !== release.branchLockVersion) {
    errors.push(
      `branch package.json version ${release.branchVersion} does not match package-lock.json version ${release.branchLockVersion}`,
    );
  }
  if (release.mainVersion !== release.mainLockVersion) {
    errors.push(
      `main package.json version ${release.mainVersion} does not match package-lock.json version ${release.mainLockVersion}`,
    );
  }

  if (release.branchChangelog[0]?.version !== release.branchVersion) {
    errors.push(
      `branch changelog newest entry does not match package.json version ${release.branchVersion}`,
    );
  }
  if (release.mainChangelog[0]?.version !== release.mainVersion) {
    errors.push(
      `main changelog newest entry does not match package.json version ${release.mainVersion}`,
    );
  }

  const versionOrder = compareApplicationVersions(
    release.branchVersion,
    release.mainVersion,
  );
  if (versionOrder < 0 && !release.mainContainsBranch) {
    errors.push(
      `branch application version ${release.branchVersion} is older than main ${release.mainVersion}`,
    );
  }
  if (
    isToolingOnlyVersionPlan(entry.versionPlan) &&
    versionOrder !== 0 &&
    !release.mainContainsBranch
  ) {
    errors.push(
      `tooling-only work must not change the application version from ${release.mainVersion} to ${release.branchVersion}`,
    );
  }
  if (!release.mainContainsBranch && !isToolingOnlyVersionPlan(entry.versionPlan)) {
    const plannedVersion = plannedApplicationVersion(entry.versionPlan);
    if (release.branchVersion === release.mainVersion) {
      errors.push('player-facing work must increment the application version');
    }
    if (plannedVersion !== release.branchVersion) {
      errors.push(
        `version plan ${plannedVersion ?? 'does not name a version'} does not match branch application version ${release.branchVersion}`,
      );
    }
  }

  if (!release.mainContainsBranch) {
    errors.push(...changelogPreservationErrors(
      release.mainChangelog,
      release.branchChangelog,
    ));
  }

  return errors;
}

function validationReceiptErrors(entry, release) {
  const errors = [];
  const receipt = entry.validation;
  const changedFiles = Array.isArray(receipt?.files) ? receipt.files : release.changedFiles;
  const plan = validationPlanForFiles(changedFiles);

  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    errors.push('no committed task changes were found from the coordination start SHA');
  }
  if (!receipt) {
    errors.push('no validation receipt is recorded; run coordination:validate first');
    return errors;
  }
  if (receipt.commitSha !== release.branchSha) {
    errors.push(
      `validation receipt commit ${receipt.commitSha} does not match final branch SHA ${release.branchSha}`,
    );
  }
  if (receipt.passed !== true) {
    errors.push('the recorded validation receipt is not passing');
  }
  if (!Array.isArray(receipt.files) || receipt.files.length === 0) {
    errors.push('validation receipt does not record the changed files it checked');
  }
  if (receipt.docsOnly !== plan.documentationOnly) {
    errors.push('validation receipt scope does not match the current changed files');
  }
  const recordedCommands = Array.isArray(receipt.commands) ? receipt.commands : [];
  for (const command of plan.commands) {
    if (!recordedCommands.includes(command)) {
      errors.push(`validation receipt is missing required command ${command}`);
    }
  }
  if (plan.requiresDocumentationReview && !text(receipt.reviews?.documentation)) {
    errors.push('documentation changes require a documentation review receipt');
  }
  if (plan.requiresVisualReview && !text(receipt.reviews?.visual)) {
    errors.push('UI changes require a visual review receipt');
  }
  return errors;
}

/**
 * Validate the Git/release state before a coordination entry can become
 * historical. This is intentionally pure so the failure contract is tested
 * without depending on a particular checkout or network remote.
 */
export function validateReleaseCompletion({ entry, release }) {
  const errors = releaseMetadataErrors({ entry, release, requireMerged: true });
  errors.push(...validationReceiptErrors(entry, release));

  if (errors.length > 0) {
    throw new Error(
      `Cannot complete coordination entry ${entry.id}: ${errors.join('; ')}.`,
    );
  }

  return {
    pushed: release.originMainSha === release.mainSha,
  };
}

async function runGit(args, cwd = process.cwd()) {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

async function gitIsAncestor(ancestor, descendant, cwd) {
  try {
    await runGit(['merge-base', '--is-ancestor', ancestor, descendant], cwd);
    return true;
  } catch (error) {
    if (error?.status === 1 || error?.code === 1) return false;
    throw error;
  }
}

async function readGitFile(ref, path, cwd) {
  return runGit(['show', `${ref}:${path}`], cwd);
}

async function readTaskChangedFiles(branchSha, cwd) {
  const output = await runGit(['diff', '--name-only', `main...${branchSha}`], cwd);
  return output.split('\n').map((filePath) => filePath.trim()).filter(Boolean);
}

/** Read the live checkout and remote state used by the completion gate. */
export async function readReleaseState({ cwd = process.cwd(), startBranchSha } = {}) {
  const [branchName, branchSha, mainSha, remoteMainLine] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', 'HEAD'], cwd),
    runGit(['rev-parse', 'main'], cwd),
    runGit(['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], cwd),
  ]);
  const originMainSha = remoteMainLine.split(/\s+/)[0];
  if (!originMainSha) {
    throw new Error('Cannot verify pushed state: origin/main returned no commit.');
  }

  const [branchPackage, mainPackage, branchLockfile, mainLockfile, branchChangelog, mainChangelog, status] = await Promise.all([
    readGitFile('HEAD', 'package.json', cwd),
    readGitFile('main', 'package.json', cwd),
    readGitFile('HEAD', 'package-lock.json', cwd),
    readGitFile('main', 'package-lock.json', cwd),
    readGitFile('HEAD', 'src/changelog.ts', cwd),
    readGitFile('main', 'src/changelog.ts', cwd),
    runGit(['status', '--porcelain'], cwd),
  ]);
  const branchVersion = parseApplicationVersion(branchPackage, 'HEAD:package.json');
  const mainVersion = parseApplicationVersion(mainPackage, 'main:package.json');
  const changedFiles = await readTaskChangedFiles(branchSha, cwd);

  return {
    branchName,
    branchSha,
    mainSha,
    originMainSha,
    mainContainsBranch: await gitIsAncestor(branchSha, mainSha, cwd),
    worktreeClean: status.length === 0,
    branchVersion,
    mainVersion,
    branchLockVersion: parseLockfileVersion(branchLockfile, 'HEAD:package-lock.json'),
    mainLockVersion: parseLockfileVersion(mainLockfile, 'main:package-lock.json'),
    branchChangelog: parseChangelogSnapshot(branchChangelog, branchVersion),
    mainChangelog: parseChangelogSnapshot(mainChangelog, mainVersion),
    changedFiles,
    ...(startBranchSha
      ? {
          startBranchSha,
          branchBaselineIsAncestor: await gitIsAncestor(startBranchSha, branchSha, cwd),
        }
      : {}),
  };
}

const VALIDATION_COMMANDS = new Map([
  ['npm run coordination:docs', ['run', 'coordination:docs']],
  ['npm run lint', ['run', 'lint']],
  ['npm run test:all', ['run', 'test:all']],
  ['npm run build', ['run', 'build']],
  ['npm run build --prefix functions', ['run', 'build', '--prefix', 'functions']],
]);

async function runValidationCommand(command, cwd) {
  if (command === 'git diff --check') {
    await runGit(['diff', '--check', 'main...HEAD'], cwd);
    return;
  }
  const args = VALIDATION_COMMANDS.get(command);
  if (!args) throw new Error(`No executable validation mapping exists for ${command}.`);
  await execFileAsync('npm', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60 * 60 * 1000,
  });
}

function validPid(value) {
  return Number.isInteger(value) && value > 0;
}

function processIsAlive(pid) {
  if (!validPid(pid)) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** Return the one coordination file shared by local worktrees on this host. */
export function coordinationFilePath(
  environment = process.env,
  temporaryDirectory = tmpdir(),
) {
  const configuredPath = environment[COORDINATION_FILE_ENV];
  if (typeof configuredPath === 'string' && configuredPath.trim()) {
    return resolve(configuredPath);
  }
  return resolve(temporaryDirectory, DEFAULT_COORDINATION_FILE);
}

export function emptyCoordinationState() {
  return {
    version: COORDINATION_SCHEMA_VERSION,
    versionAgreement: DEFAULT_VERSION_AGREEMENT,
    entries: [],
    reservations: [],
    configurations: [],
  };
}

function normalizeState(value) {
  const record = objectRecord(value);
  const entries = Array.isArray(record.entries)
    ? record.entries.filter((entry) => objectRecord(entry).id)
    : [];
  const reservations = Array.isArray(record.reservations)
    ? record.reservations.filter(
        (reservation) =>
          Number.isInteger(reservation?.slot) &&
          typeof reservation?.worktree === 'string' &&
          typeof reservation?.kind === 'string' &&
          validPid(reservation?.pid),
      )
    : [];
  const configurations = Array.isArray(record.configurations)
    ? record.configurations.filter(
        (configuration) =>
          Number.isInteger(configuration?.slot) &&
          typeof configuration?.worktree === 'string',
      )
    : [];

  return {
    version: COORDINATION_SCHEMA_VERSION,
    versionAgreement: text(record.versionAgreement, DEFAULT_VERSION_AGREEMENT),
    entries,
    reservations,
    configurations,
  };
}

export function parseCoordinationState(content) {
  try {
    return normalizeState(JSON.parse(content));
  } catch (error) {
    throw new Error('The shared emulator coordination file is corrupted.', {
      cause: error,
    });
  }
}

export function pruneDeadReservations(state, isAlive = processIsAlive) {
  return {
    ...state,
    reservations: state.reservations.filter((reservation) => isAlive(reservation.pid)),
  };
}

/**
 * Recover durable configuration rows when a task skipped its end cleanup.
 *
 * A configured row is needed only while its worktree has an active coordination
 * entry or a live process reservation. Completed historical entries and
 * worktrees with no live lease must not permanently consume the finite slot
 * pool. This deliberately does not infer liveness from age.
 */
export function pruneOrphanedConfigurations(state) {
  const activeWorktrees = new Set(
    (Array.isArray(state.entries) ? state.entries : [])
      .filter((entry) => entry?.status === 'active' && typeof entry.worktree === 'string')
      .map((entry) => entry.worktree),
  );
  const liveReservationWorktrees = new Set(
    (Array.isArray(state.reservations) ? state.reservations : [])
      .filter((reservation) => typeof reservation?.worktree === 'string')
      .map((reservation) => reservation.worktree),
  );

  return {
    ...state,
    configurations: (Array.isArray(state.configurations) ? state.configurations : [])
      .filter(
        (configuration) =>
          activeWorktrees.has(configuration.worktree) ||
          liveReservationWorktrees.has(configuration.worktree),
      ),
  };
}

function reservationBlocksSlot(reservation, request) {
  if (reservation.slot !== request.slot) return false;

  // A slot is isolated between worktrees. Within one worktree, the Vite
  // process may share the Firebase processes, but two Firebase-backed
  // processes must never point at the same Firestore instance.
  if (reservation.worktree !== request.worktree) return true;
  if (reservation.kind === 'configuration') return false;
  if (reservation.kind === 'vite' || request.kind === 'vite') {
    return reservation.kind === request.kind;
  }
  return true;
}

function coordinationReservations(state) {
  return [
    ...state.reservations,
    ...state.configurations.map((configuration) => ({
      ...configuration,
      kind: 'configuration',
      pid: 0,
      command: 'configured worktree slot',
      claimedAt: configuration.configuredAt,
    })),
  ];
}

/**
 * Select a preferred slot unless a live reservation blocks it. The caller
 * still checks OS ports while holding the registry lock; this pure helper is
 * intentionally easy to exercise without starting emulators.
 */
export function chooseAvailableEmulatorSlot({
  preferredSlot,
  availableSlots,
  worktree,
  kind,
  reservations,
}) {
  const candidates = [preferredSlot, ...availableSlots].filter(
    (slot, index, allSlots) =>
      Number.isInteger(slot) && allSlots.indexOf(slot) === index,
  );

  return candidates.find(
    (slot) =>
      !reservations.some((reservation) =>
        reservationBlocksSlot(reservation, { slot, worktree, kind }),
      ),
  );
}

function reservationSummary(reservations, slot) {
  return reservations
    .filter((reservation) => reservation.slot === slot)
    .map(
      (reservation) =>
        reservation.kind === 'configuration'
          ? `configuration by ${reservation.worktree}`
          : `${reservation.kind} by ${reservation.worktree} (pid ${reservation.pid})`,
    )
    .join('; ');
}

function reservationId() {
  return `${process.pid}-${Date.now()}-${randomUUID()}`;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function lockOwner(content) {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = JSON.parse(trimmed);
    if (validPid(parsed?.pid)) {
      return {
        pid: parsed.pid,
        token: typeof parsed.token === 'string' ? parsed.token : undefined,
      };
    }
  } catch {
    // Lock files from the original registry stored only the PID. Keep those
    // files recoverable while new owners use a token for safe release.
  }

  const pid = Number.parseInt(trimmed, 10);
  return validPid(pid) ? { pid, token: undefined } : undefined;
}

async function lockIsStale(lockPath) {
  try {
    const [content, metadata] = await Promise.all([
      readFile(lockPath, 'utf8'),
      stat(lockPath),
    ]);
    if (!content.trim()) {
      return Date.now() - metadata.mtimeMs >= EMPTY_LOCK_GRACE_MS;
    }

    const owner = lockOwner(content);
    return owner === undefined || !processIsAlive(owner.pid);
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

async function releaseOwnedLock(lockPath, token) {
  try {
    const owner = lockOwner(await readFile(lockPath, 'utf8'));
    if (owner?.token !== token) return;
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function reclaimStaleRecoveryLock(recoveryPath) {
  if (!(await lockIsStale(recoveryPath))) return false;
  await delay(LOCK_RETRY_MS);
  if (!(await lockIsStale(recoveryPath))) return false;
  await unlink(recoveryPath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
  return true;
}

/** Serialize stale-lock removal so a waiter cannot delete a replacement lock. */
async function reclaimStaleLock(lockPath) {
  const recoveryPath = `${lockPath}.recovery`;
  const recoveryToken = randomUUID();
  let recoveryHandle;

  try {
    recoveryHandle = await open(recoveryPath, 'wx', 0o600);
    await recoveryHandle.writeFile(
      `${JSON.stringify({ pid: process.pid, token: recoveryToken })}\n`,
      'utf8',
    );
  } catch (error) {
    if (recoveryHandle) await recoveryHandle.close().catch(() => undefined);
    if (error?.code === 'EEXIST') {
      await reclaimStaleRecoveryLock(recoveryPath);
      return false;
    }
    throw error;
  }

  try {
    if (!(await lockIsStale(lockPath))) return false;
    await delay(LOCK_RETRY_MS);
    if (!(await lockIsStale(lockPath))) return false;
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    return true;
  } finally {
    await recoveryHandle.close();
    await releaseOwnedLock(recoveryPath, recoveryToken);
  }
}

async function withCoordinationLock(filePath, operation) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const lockPath = `${filePath}.lock`;
  const lockToken = randomUUID();
  let lockHandle;

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    let candidateHandle;
    try {
      candidateHandle = await open(lockPath, 'wx', 0o600);
      await candidateHandle.writeFile(
        `${JSON.stringify({ pid: process.pid, token: lockToken })}\n`,
        'utf8',
      );
      lockHandle = candidateHandle;
      break;
    } catch (error) {
      if (candidateHandle) {
        await candidateHandle.close().catch(() => undefined);
        await releaseOwnedLock(lockPath, lockToken).catch(() => undefined);
      }
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath)) {
        await reclaimStaleLock(lockPath);
      } else {
        await delay(LOCK_RETRY_MS);
      }
    }
  }

  if (!lockHandle) {
    throw new Error(
      `Timed out waiting for the local emulator coordination lock at ${lockPath}.`,
    );
  }

  try {
    return await operation();
  } finally {
    await lockHandle.close();
    await releaseOwnedLock(lockPath, lockToken);
  }
}

async function readStateUnlocked(filePath) {
  try {
    return parseCoordinationState(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyCoordinationState();
    throw error;
  }
}

async function writeStateUnlocked(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export async function readCoordinationState(filePath = coordinationFilePath()) {
  return pruneDeadReservations(await readStateUnlocked(filePath));
}

function bindPortIsFree(port, host) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen({ host, port }, () => {
      server.close((error) => resolvePromise(!error));
    });
  });
}

async function lsofPortIsFree(port) {
  try {
    const result = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8' },
    );
    return result.stdout.trim().length === 0;
  } catch (error) {
    if (error?.code === 1) return true;
    if (error?.code === 'ENOENT') return undefined;
    return undefined;
  }
}

export async function isPortFree(port, host = '127.0.0.1') {
  // Binding only to 127.0.0.1 can miss a process listening on a wildcard
  // address on macOS. lsof sees both forms and is also the repository's
  // documented port-ownership check; retain a bind fallback for machines
  // without lsof (and for callers that request a different host).
  if (host === '127.0.0.1') {
    const lsofResult = await lsofPortIsFree(port);
    if (lsofResult !== undefined) return lsofResult;
  }
  return bindPortIsFree(port, host === '127.0.0.1' ? '0.0.0.0' : host);
}

async function occupiedPorts(ports, portCheck) {
  const results = await Promise.all(
    ports.map(async (port) => ({ port, free: await portCheck(port) })),
  );
  return results.filter(({ free }) => !free).map(({ port }) => port);
}

function newReservation({ slot, worktree, kind, command, ports }) {
  return {
    id: reservationId(),
    slot,
    worktree,
    kind,
    pid: process.pid,
    command,
    claimedAt: new Date().toISOString(),
    ports: [...ports],
  };
}

function blockedSlotError({ filePath, slot, kind, state }) {
  const owners = reservationSummary(state.reservations, slot);
  const ownerText = owners || 'a process that is not registered in the coordination file';
  return new Error(
    `Cannot claim emulator slot ${slot} for ${kind}: ${ownerText}. ` +
      `See ${filePath}; stop or reconfigure the owning worktree before retrying.`,
  );
}

function occupiedSlotError({ filePath, slot, kind, ports }) {
  return new Error(
    `Cannot claim emulator slot ${slot} for ${kind}: port(s) ${ports.join(', ')} ` +
      `are already listening. See ${filePath} and choose a free slot.`,
  );
}

async function claimSlot({
  filePath,
  slot,
  worktree,
  kind,
  command,
  ports,
  portCheck,
  state,
}) {
  const reservations = coordinationReservations(state);
  const blockingReservation = reservations.find((reservation) =>
    reservationBlocksSlot(reservation, { slot, worktree, kind }),
  );
  if (blockingReservation) {
    throw blockedSlotError({
      filePath,
      slot,
      kind,
      state: { ...state, reservations },
    });
  }

  const occupied = await occupiedPorts(ports, portCheck);
  if (occupied.length > 0) {
    throw occupiedSlotError({ filePath, slot, kind, ports: occupied });
  }

  const reservation = newReservation({ slot, worktree, kind, command, ports });
  state.reservations.push(reservation);
  return reservation;
}

/** Record the configured slot before writing local config files. */
export async function reserveConfiguredEmulatorSlot({
  filePath = coordinationFilePath(),
  slot,
  worktree = process.cwd(),
  ports,
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservations = coordinationReservations(state);
    const blockingReservation = reservations.find((reservation) =>
      reservationBlocksSlot(reservation, {
        slot,
        worktree,
        kind: 'configuration',
      }),
    );
    if (blockingReservation) {
      throw blockedSlotError({
        filePath,
        slot,
        kind: 'configuration',
        state: { ...state, reservations },
      });
    }

    const occupied = await occupiedPorts(ports, portCheck);
    if (occupied.length > 0) {
      throw occupiedSlotError({
        filePath,
        slot,
        kind: 'configuration',
        ports: occupied,
      });
    }

    const configuration = {
      id: `configuration-${randomUUID()}`,
      slot,
      worktree,
      configuredAt: new Date().toISOString(),
      ports: [...ports],
    };
    state.configurations = state.configurations.filter(
      (candidate) => candidate.worktree !== worktree,
    );
    state.configurations.push(configuration);
    await writeStateUnlocked(filePath, state);
    return configuration;
  });
}

/**
 * Atomically select and record the first complete free worktree slot.
 *
 * Configuration is a durable row claim, so this operation must select the
 * row and write it while holding the same lock. A status scan followed by a
 * separate configure command would let concurrent worktrees choose the same
 * row.
 */
export async function reserveAvailableConfiguredEmulatorSlot({
  filePath = coordinationFilePath(),
  preferredSlot,
  worktree = process.cwd(),
  availableSlots = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot),
  portsForSlot = (slot) => [
    ...Object.values(emulatorPortsForSlot(slot)),
    vitePortForSlot(slot),
  ],
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservations = coordinationReservations(state);
    const firstCandidate = chooseAvailableEmulatorSlot({
      preferredSlot,
      availableSlots,
      worktree,
      kind: 'configuration',
      reservations,
    });

    if (firstCandidate === undefined) {
      throw new Error(
        'No unreserved emulator slot is available for configuration. ' +
          `See ${filePath}; configured rows remain reserved for their worktrees.`,
      );
    }

    const candidateSlots = [
      firstCandidate,
      ...availableSlots.filter((candidate) => candidate !== firstCandidate),
    ];
    for (const candidate of candidateSlots) {
      const slot = chooseAvailableEmulatorSlot({
        preferredSlot: candidate,
        availableSlots: [],
        worktree,
        kind: 'configuration',
        reservations,
      });
      if (slot === undefined) continue;

      const ports = portsForSlot(slot);
      const occupied = await occupiedPorts(ports, portCheck);
      if (occupied.length > 0) continue;

      const configuration = {
        id: `configuration-${randomUUID()}`,
        slot,
        worktree,
        configuredAt: new Date().toISOString(),
        ports: [...ports],
      };
      state.configurations = state.configurations.filter(
        (candidateConfiguration) => candidateConfiguration.worktree !== worktree,
      );
      state.configurations.push(configuration);
      await writeStateUnlocked(filePath, state);
      return configuration;
    }

    throw new Error(
      'No free emulator port set is available for configuration. ' +
        `See ${filePath}; stop a listening process or release a configured worktree row.`,
    );
  });
}

export async function releaseConfiguredEmulatorSlot(
  configuration,
  filePath = coordinationFilePath(),
) {
  if (!configuration?.worktree) return;

  await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    state.configurations = state.configurations.filter((candidate) => {
      if (configuration.id) return candidate.id !== configuration.id;
      return !(
        candidate.worktree === configuration.worktree &&
        candidate.slot === configuration.slot
      );
    });
    await writeStateUnlocked(filePath, state);
  });
}

/** Claim one configured slot after checking both the registry and OS ports. */
export async function reserveEmulatorSlot({
  filePath = coordinationFilePath(),
  slot,
  worktree = process.cwd(),
  kind,
  command,
  ports,
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservation = await claimSlot({
      filePath,
      slot,
      worktree,
      kind,
      command,
      ports,
      portCheck,
      state,
    });
    await writeStateUnlocked(filePath, state);
    return reservation;
  });
}

/** Claim the first free complete slot, preferring the worktree's configured slot. */
export async function reserveAvailableEmulatorSlot({
  filePath = coordinationFilePath(),
  preferredSlot,
  worktree = process.cwd(),
  kind,
  command,
  availableSlots = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot),
  portsForSlot = (slot) => Object.values(emulatorPortsForSlot(slot)),
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const slot = chooseAvailableEmulatorSlot({
      preferredSlot,
      availableSlots,
      worktree,
      kind,
      reservations: coordinationReservations(state),
    });

    if (slot === undefined) {
      throw new Error(
        `No unreserved emulator slot is available for ${kind}. ` +
          `See ${filePath}, stop a running worktree, and retry.`,
      );
    }

    const candidateSlots = [slot, ...availableSlots.filter((candidate) => candidate !== slot)];
    for (const candidate of candidateSlots) {
      const candidateSlot = chooseAvailableEmulatorSlot({
        preferredSlot: candidate,
        availableSlots: [],
        worktree,
        kind,
        reservations: coordinationReservations(state),
      });
      if (candidateSlot === undefined) continue;

      const ports = portsForSlot(candidateSlot);
      if ((await occupiedPorts(ports, portCheck)).length > 0) continue;

      const reservation = newReservation({
        slot: candidateSlot,
        worktree,
        kind,
        command,
        ports,
      });
      state.reservations.push(reservation);
      await writeStateUnlocked(filePath, state);
      return reservation;
    }

    throw new Error(
      `No free emulator port set is available for ${kind}. ` +
        `See ${filePath}, stop a running worktree, and retry.`,
    );
  });
}

export async function releaseEmulatorSlot(
  reservation,
  filePath = coordinationFilePath(),
) {
  if (!reservation?.id) return;

  await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    state.reservations = state.reservations.filter(
      (candidate) => candidate.id !== reservation.id,
    );
    await writeStateUnlocked(filePath, state);
  });
}

function formatEntry(entry) {
  const status = text(entry.status, 'active');
  const resources = Array.isArray(entry.resources) && entry.resources.length > 0
    ? entry.resources.join(', ')
    : 'none declared';
  const lines = [
    `- [${status}] ${entry.id} — ${text(entry.intent, 'No intent recorded.')}`,
    `  worktree: ${text(entry.worktree, 'unknown')}`,
    `  started: ${text(entry.startedAt, 'unknown')} | version plan: ${text(entry.versionPlan, 'not recorded')}`,
    `  preemptive changelog: ${text(entry.preemptiveChangelog, 'not recorded')}`,
    `  resources: ${resources}`,
  ];
  if (entry.startBranchSha || entry.startMainSha) {
    lines.push(
      `  start state: branch ${text(entry.startBranchSha, 'unknown')} | main ${text(entry.startMainSha, 'unknown')}`,
    );
  }
  if (entry.validation) {
    lines.push(
      `  validation: ${entry.validation.passed === true ? 'passed' : 'failed'} @ ${text(entry.validation.commitSha, 'unknown')} | commands ${Array.isArray(entry.validation.commands) ? entry.validation.commands.length : 0}`,
    );
  }
  if (entry.finalBranchSha || entry.mainSha || entry.originMainSha) {
    lines.push(
      `  release state: ${text(entry.finalBranchName, 'unknown')} @ ${text(entry.finalBranchSha, 'unknown')} | main ${text(entry.mainSha, 'unknown')} | origin/main ${text(entry.originMainSha, 'unknown')} | pushed ${entry.pushed === true ? 'yes' : 'no'}`,
    );
  }
  return lines.join('\n');
}

function formatReservation(reservation) {
  const ports = Array.isArray(reservation.ports) ? reservation.ports.join(', ') : 'unknown';
  return `- slot ${reservation.slot} — ${reservation.kind} — ${reservation.worktree} — pid ${reservation.pid} — ports ${ports}`;
}

/** Render the coordination file as a compact, agent-readable status pane. */
export function formatCoordinationState(state) {
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const reservations = Array.isArray(state.reservations) ? state.reservations : [];
  const configurations = Array.isArray(state.configurations) ? state.configurations : [];
  const occupiedSlots = new Set(
    [...reservations, ...configurations]
      .map((resource) => resource?.slot)
      .filter(
        (slot) => Number.isInteger(slot) && slot >= 0 && slot < EMULATOR_SLOT_COUNT,
      ),
  );
  const availableSlots = Array.from(
    { length: EMULATOR_SLOT_COUNT },
    (_, slot) => slot,
  ).filter((slot) => !occupiedSlots.has(slot));
  const formatSlots = (slots) => (slots.length > 0 ? slots.join(', ') : 'none');
  const lines = [
    '# Den of Wolves local coordination',
    '',
    '## Version agreement',
    text(state.versionAgreement, DEFAULT_VERSION_AGREEMENT),
    '',
    '## Preemptive changelog / active work',
  ];

  if (entries.length === 0) lines.push('- none');
  else lines.push(...entries.map(formatEntry));

  lines.push(
    '',
    `## Emulator capacity (${EMULATOR_SLOT_COUNT} isolated emulator slots)`,
    `- available slots: ${formatSlots(availableSlots)}`,
    `- occupied slots: ${formatSlots([...occupiedSlots].sort((a, b) => a - b))}`,
    '- Claim a free row atomically with `npm run emulators:configure -- auto`.',
    '',
    '## Configured worktree slots (reserved; unavailable to other worktrees)',
  );
  if (configurations.length === 0) lines.push('- none');
  else {
    lines.push(
      ...configurations.map(
        (configuration) =>
          `- slot ${configuration.slot} — ${configuration.worktree} — configured ${text(configuration.configuredAt, 'unknown')}`,
      ),
    );
  }

  lines.push('', '## Live emulator reservations');
  if (reservations.length === 0) lines.push('- none');
  else lines.push(...reservations.map(formatReservation));

  return `${lines.join('\n')}\n`;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}.`);
    options[name] = value;
    index += 1;
  }
  return options;
}

async function readGitStartState(cwd = process.cwd()) {
  const [branchName, branchSha, mainSha] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', 'HEAD'], cwd),
    runGit(['rev-parse', 'main'], cwd),
  ]);
  if (branchName === 'HEAD') {
    throw new Error('coordination begin requires an attached branch; create one before editing.');
  }
  if (branchName === 'main') {
    throw new Error('coordination begin refuses to register work directly on main.');
  }
  return { branchName, branchSha, mainSha };
}

async function beginEntry(filePath, options) {
  const required = ['intent', 'version-plan', 'preemptive-changelog'];
  for (const name of required) {
    if (!options[name]) throw new Error(`coordination begin requires --${name} <text>.`);
  }

  const start = await readGitStartState();
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const existing = state.entries.find(
      (candidate) => candidate.status === 'active' && candidate.worktree === process.cwd(),
    );
    if (existing) {
      throw new Error(
        `An active coordination entry already exists for this worktree: ${existing.id}.`,
      );
    }
    const entry = {
      id: `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`,
      worktree: process.cwd(),
      pid: process.pid,
      startedAt: new Date().toISOString(),
      status: 'active',
      branchName: start.branchName,
      startBranchSha: start.branchSha,
      startMainSha: start.mainSha,
      intent: options.intent,
      versionPlan: options['version-plan'],
      preemptiveChangelog: options['preemptive-changelog'],
      resources: options.resources
        ? options.resources.split(',').map((resource) => resource.trim()).filter(Boolean)
        : [],
    };
    const plannedVersion = plannedApplicationVersion(entry.versionPlan);
    if (plannedVersion) {
      const conflictingEntry = state.entries.find(
        (candidate) =>
          candidate.status === 'active' &&
          plannedApplicationVersion(candidate.versionPlan) === plannedVersion,
      );
      if (conflictingEntry) {
        throw new Error(
          `Application version ${plannedVersion} is already reserved by active entry ${conflictingEntry.id}.`,
        );
      }
    }
    state.entries.push(entry);
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

export async function validateCoordinationEntry(filePath, options) {
  if (!options.id) throw new Error('coordination validate requires --id <entry-id>.');

  const preparation = await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }
    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id} from ${process.cwd()}; ` +
          `it belongs to ${entry.worktree}.`,
      );
    }

    const startBranchSha = entry.startBranchSha || options['start-sha'];
    if (!startBranchSha) {
      throw new Error(
        `Coordination entry ${entry.id} has no start branch SHA; rerun with --start-sha <commit> once to backfill it.`,
      );
    }
    const release = options.release ?? await readReleaseState({ startBranchSha });
    const errors = releaseMetadataErrors({ entry, release, requireMerged: false });
    if (release.branchBaselineIsAncestor === false) {
      errors.push(
        `start branch SHA ${startBranchSha} is not an ancestor of branch ${release.branchSha}; do not rewrite the task history`,
      );
    }
    if (!Array.isArray(release.changedFiles) || release.changedFiles.length === 0) {
      errors.push('no committed task changes were found from the coordination start SHA');
    }
    if (errors.length > 0) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id}: ${errors.join('; ')}.`,
      );
    }

    const plan = validationPlanForFiles(release.changedFiles);
    const documentationReview = text(options['documentation-review']);
    const visualReview = text(options['visual-review']);
    if (plan.requiresDocumentationReview && !documentationReview) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id}: documentation changes require --documentation-review <summary>.`,
      );
    }
    if (plan.requiresVisualReview && !visualReview) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id}: UI changes require --visual-review <summary>.`,
      );
    }

    return {
      entryStartedAt: entry.startedAt,
      entryBranchName: entry.branchName,
      entryVersionPlan: entry.versionPlan,
      startBranchSha,
      release,
      plan,
      documentationReview,
      visualReview,
    };
  });

  const commandRunner = options.commandRunner ?? runValidationCommand;
  for (const command of preparation.plan.commands) {
    try {
      await commandRunner(command, process.cwd());
    } catch (error) {
      throw new Error(
        `Validation command failed for ${options.id}: ${command}. ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  const finalRelease = options.release ?? await readReleaseState({
    startBranchSha: preparation.startBranchSha,
  });
  if (finalRelease.branchSha !== preparation.release.branchSha) {
    throw new Error(
      `Cannot record validation for ${options.id}: branch SHA changed from ${preparation.release.branchSha} to ${finalRelease.branchSha} while checks ran; rerun validation.`,
    );
  }
  const finalErrors = releaseMetadataErrors({
    entry: {
      id: options.id,
      branchName: preparation.entryBranchName,
      versionPlan: preparation.entryVersionPlan,
    },
    release: finalRelease,
    requireMerged: false,
  });
  if (finalErrors.length > 0) {
    throw new Error(
      `Cannot record validation for ${options.id}: ${finalErrors.join('; ')}.`,
    );
  }

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }
    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id} from ${process.cwd()}; ` +
          `it belongs to ${entry.worktree}.`,
      );
    }
    if (entry.startedAt !== preparation.entryStartedAt) {
      throw new Error(
        `Cannot record validation for ${entry.id}: the coordination entry changed while checks ran; rerun validation.`,
      );
    }

    entry.startBranchSha = preparation.startBranchSha;
    entry.startMainSha = entry.startMainSha || finalRelease.mainSha;
    entry.validation = {
      commitSha: finalRelease.branchSha,
      completedAt: new Date().toISOString(),
      passed: true,
      commands: preparation.plan.commands,
      files: preparation.release.changedFiles,
      docsOnly: preparation.plan.documentationOnly,
      reviews: {
        ...(preparation.documentationReview
          ? { documentation: preparation.documentationReview }
          : {}),
        ...(preparation.visualReview ? { visual: preparation.visualReview } : {}),
      },
    };
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

export async function finishCoordinationEntry(filePath, options) {
  if (!options.id) throw new Error('coordination finish requires --id <entry-id>.');

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }

    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot complete coordination entry ${entry.id} from ${process.cwd()}; ` +
          `it belongs to ${entry.worktree}.`,
      );
    }

    const release = options.release ?? await readReleaseState({
      startBranchSha: entry.startBranchSha,
    });
    const validation = validateReleaseCompletion({ entry, release });
    entry.status = 'complete';
    entry.completedAt = new Date().toISOString();
    if (options.result) entry.result = options.result;
    entry.finalBranchName = release.branchName;
    entry.finalBranchSha = release.branchSha;
    entry.mainSha = release.mainSha;
    entry.originMainSha = release.originMainSha;
    entry.mainContainsBranch = release.mainContainsBranch;
    entry.pushed = validation.pushed;
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

async function status(filePath) {
  const state = await withCoordinationLock(filePath, async () => {
    const cleanState = pruneOrphanedConfigurations(
      pruneDeadReservations(await readStateUnlocked(filePath)),
    );
    await writeStateUnlocked(filePath, cleanState);
    return cleanState;
  });
  console.log(`Coordination file: ${filePath}`);
  console.log(formatCoordinationState(state));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const filePath = coordinationFilePath();

  if (command === 'status') {
    await status(filePath);
    return;
  }

  const options = parseOptions(args);
  if (command === 'begin') {
    const entry = await beginEntry(filePath, options);
    console.log(`Registered preemptive work entry ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'validate') {
    const entry = await validateCoordinationEntry(filePath, options);
    console.log(`Validated coordination entry ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'finish') {
    const entry = await finishCoordinationEntry(filePath, options);
    console.log(`Completed coordination entry ${entry.id} in ${filePath}.`);
    return;
  }

  throw new Error(
    'usage: node scripts/emulator-resource-registry.mjs <status|begin|validate|finish> [options]',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
