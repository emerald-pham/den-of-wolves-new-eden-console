#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  EMULATOR_SLOT_COUNT,
  emulatorEnvironmentForSlot,
  emulatorPortsForSlot,
  firebaseConfigForSlot,
  vitePortForSlot,
} from './emulator-slots.js';
import {
  applyReleaseFragment,
  coordinationClaimIsCrossRepository,
  formatConflictForecast,
  forecastCoordinationConflicts,
  leaseStatusForEntry,
  leaseStatusesForEntries,
  prepareReleaseFragmentFile,
  readReleaseLaneState,
  refreshCoordinationLease,
  withValidationLease,
} from './coordination-throughput.mjs';
import {
  deriveCopyOnlyValidationProfile,
  deriveValidationProfile,
} from './validation-profile.mjs';

export { deriveCopyOnlyValidationProfile } from './validation-profile.mjs';
export {
  applyReleaseFragment,
  coordinationClaimIsCrossRepository,
  formatConflictForecast,
  forecastCoordinationConflicts,
  leaseStatusForEntry,
  leaseStatusesForEntries,
  prepareReleaseFragmentFile,
  readReleaseLaneState,
  refreshCoordinationLease,
  withValidationLease,
} from './coordination-throughput.mjs';

export const CODEX_COORDINATION_FILE_ENV = 'CODEX_COORDINATION_FILE';
export const COORDINATION_FILE_ENV = 'DOW_EMULATOR_COORDINATION_FILE';
export const COORDINATION_SCHEMA_VERSION = 1;
export const COORDINATION_SCOPE = 'codex-wide';
export const DEFAULT_VERSION_AGREEMENT =
  'Increment the patch version for each completed player-facing fix; roll 0.x.99 over to 0.(x+1).0; do not bump tooling-only work.';

const DEFAULT_COORDINATION_FILE = 'den-of-wolves-new-eden-coordination.json';
const APPLICATION_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_APPLICATION_PATCH_VERSION = 99;
const LOCK_RETRY_MS = 50;
const LOCK_ATTEMPTS = 600;
const EMPTY_LOCK_GRACE_MS = 1_000;
const VALIDATION_PROCESS_TIMEOUT_MS = 60 * 60 * 1000;
const VALIDATION_PROCESS_ESCALATION_MS = 1_000;
const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const execFileAsync = promisify(execFile);

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isoNow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${String(value)}.`);
  return date.toISOString();
}

function normalizePromptId(value) {
  const prompt = text(value);
  return prompt ? prompt.toLowerCase() : null;
}

function normalizePath(value) {
  return text(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function parseList(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.flatMap((item) => String(item ?? '').split(',').map((part) => part.trim())).filter(Boolean);
}

function normalizeScope(value) {
  const normalized = normalizePath(value);
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Invalid repository-relative scope: ${String(value)}.`);
  }
  return normalized;
}

function normalizeOwnership(options = {}) {
  const scopes = [...new Set(parseList(options.scope ?? options.scopes).map(normalizeScope))];
  const claims = [...new Set(parseList(options.claims ?? options.claim).map((claim) => claim.toLowerCase()))];
  const resources = [...new Set(parseList(options.resources).map((resource) => resource.toLowerCase()))];
  return { scopes, claims, resources };
}

function coordinationEntryOwnsOwnership(entry) {
  return entry?.status === 'active' || entry?.status === 'parked';
}

function isDocumentationFile(filePath) {
  const name = basename(filePath);
  return /\.md$/i.test(name) || name === 'README' || /^README\./i.test(name);
}

function contentIdentity(content) {
  return createHash('sha256').update(String(content)).digest('hex');
}

export function validationPlanForFiles(changedFiles = [], { profile, affectedTests = [] } = {}) {
  const files = (Array.isArray(changedFiles) ? changedFiles : [])
    .filter((filePath) => typeof filePath === 'string' && filePath.trim())
    .map(normalizePath);
  const documentationOnly = files.length > 0 && files.every(isDocumentationFile);
  const derived = profile ?? deriveValidationProfile({ changedFiles: files, affectedTests, repositoryDirectory: process.cwd() });
  return {
    documentationOnly,
    requiresDocumentationReview: false,
    requiresVisualReview: false,
    requiresReview: derived.requiresReview === true,
    reviewReason: derived.reviewReason,
    commands: documentationOnly ? ['git diff --check'] : [...(derived.commands ?? [])],
    profile: derived,
  };
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

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function normalizeGitHubOriginToSsh(originUrl) {
  const origin = typeof originUrl === 'string' ? originUrl.trim() : '';
  const match = origin.match(/^https:\/\/github\.com\/(.+)$/i);
  return match ? `git@github.com:${match[1]}` : origin;
}

async function runGit(args, cwd = process.cwd()) {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  return result.stdout.trim();
}

export async function ensureSshOrigin(cwd = process.cwd()) {
  const currentOrigin = await runGit(['remote', 'get-url', 'origin'], cwd);
  const origin = normalizeGitHubOriginToSsh(currentOrigin);
  if (origin === currentOrigin) return { changed: false, origin };
  await runGit(['remote', 'set-url', 'origin', origin], cwd);
  return { changed: true, previousOrigin: currentOrigin, origin };
}

async function readMainRef(cwd = process.cwd()) {
  let lastError;
  for (const ref of ['main', 'origin/main']) {
    try {
      return { ref, sha: await runGit(['rev-parse', '--verify', `${ref}^{commit}`], cwd) };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error('Cannot resolve the main branch from main or origin/main.', { cause: lastError });
}

async function gitIsAncestor(ancestor, descendant, cwd = process.cwd()) {
  try {
    await runGit(['merge-base', '--is-ancestor', ancestor, descendant], cwd);
    return true;
  } catch (error) {
    if (error?.status === 1 || error?.code === 1) return false;
    throw error;
  }
}

async function readGitStartState(cwd = process.cwd()) {
  const [branchName, branchSha, main, repositoryRoot, repositoryIdentity] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', 'HEAD'], cwd),
    readMainRef(cwd),
    runGit(['rev-parse', '--show-toplevel'], cwd),
    runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd),
  ]);
  if (branchName === 'HEAD') throw new Error('coordination begin requires an attached branch.');
  if (branchName === 'main') throw new Error('coordination begin refuses to register work directly on main.');
  return { branchName, branchSha, mainSha: main.sha, repositoryRoot: resolve(repositoryRoot), repositoryIdentity: resolve(repositoryIdentity) };
}

export function changedFilesBaseRef({
  mainSha,
  startBranchSha,
  mainContainsBranch,
  mainIsAncestorOfBranch,
  validatedBaseSha,
  validatedBaseIsAncestorOfMain,
}) {
  if (validatedBaseSha && validatedBaseIsAncestorOfMain) return validatedBaseSha;
  if (mainIsAncestorOfBranch) return mainSha;
  return mainContainsBranch && startBranchSha ? startBranchSha : mainSha;
}

async function readChangedFiles(baseSha, headSha, cwd) {
  try {
    const output = await runGit(['diff', '--name-only', `${baseSha}...${headSha}`], cwd);
    return output.split('\n').map(normalizePath).filter(Boolean);
  } catch {
    return [];
  }
}

function parseApplicationVersion(source, ref) {
  const version = String(source).match(/"version"\s*:\s*"([^"]+)"/)?.[1];
  if (!version || !APPLICATION_VERSION_PATTERN.test(version)) throw new Error(`Cannot read a valid application version from ${ref}.`);
  return version;
}

function parseLockfileVersion(source, ref) {
  try {
    const version = JSON.parse(source)?.packages?.['']?.version;
    if (!version || !APPLICATION_VERSION_PATTERN.test(version)) throw new Error('invalid root version');
    return version;
  } catch (error) {
    throw new Error(`Cannot read a valid root package version from ${ref}.`, { cause: error });
  }
}

export function compareApplicationVersions(left, right) {
  const leftParts = String(left).match(APPLICATION_VERSION_PATTERN);
  const rightParts = String(right).match(APPLICATION_VERSION_PATTERN);
  if (!leftParts || !rightParts) throw new Error(`Cannot compare invalid application versions: ${left} and ${right}.`);
  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(leftParts[index]) - Number(rightParts[index]);
    if (delta) return delta > 0 ? 1 : -1;
  }
  return 0;
}

export function nextApplicationVersion(version) {
  const parts = String(version).match(APPLICATION_VERSION_PATTERN);
  if (!parts) throw new Error(`Cannot calculate the next application version from invalid version: ${version}.`);
  const [major, middle, patch] = parts.slice(1).map(Number);
  return patch >= MAX_APPLICATION_PATCH_VERSION ? `${major}.${middle + 1}.0` : `${major}.${middle}.${patch + 1}`;
}

export function parseChangelogSnapshot(source, applicationVersion) {
  const matches = [...String(source).matchAll(/version:\s*(APP_VERSION|['"](\d+\.\d+\.\d+)['"])/g)];
  if (matches.length === 0) throw new Error('Cannot read any release entries from src/changelog.ts.');
  return matches.map((match, index) => {
    const version = match[1] === 'APP_VERSION' ? applicationVersion : match[2];
    if (!APPLICATION_VERSION_PATTERN.test(version)) throw new Error(`Cannot read a valid changelog version near ${match[0]}.`);
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? String(source).length;
    return { version, source: String(source).slice(start, end).replace(/\s+/g, ' ').trim() };
  });
}

function changelogPreservationErrors(mainChangelog, branchChangelog) {
  const branchByVersion = new Map();
  const errors = [];
  for (const entry of branchChangelog) {
    if (branchByVersion.has(entry.version)) errors.push(`branch changelog repeats version ${entry.version}`);
    branchByVersion.set(entry.version, entry);
  }
  for (const mainEntry of mainChangelog) {
    const branchEntry = branchByVersion.get(mainEntry.version);
    if (!branchEntry) errors.push(`branch changelog is missing main's ${mainEntry.version} entry`);
    else if (branchEntry.source !== mainEntry.source && mainEntry.version !== branchChangelog[0]?.version) errors.push(`branch changelog would replace main's ${mainEntry.version} entry`);
  }
  return errors;
}

/** Read the live checkout and release metadata needed by validation/finish. */
export async function readReleaseState({ cwd = process.cwd(), startBranchSha, validation } = {}) {
  const [branchName, branchSha, main, trackingMain, remoteLine, status] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', 'HEAD'], cwd),
    readMainRef(cwd),
    runGit(['rev-parse', '--verify', 'origin/main^{commit}'], cwd),
    runGit(['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], cwd),
    runGit(['status', '--porcelain'], cwd),
  ]);
  const mainSha = main.sha;
  const originMainSha = remoteLine.split(/\s+/)[0];
  const [branchPackage, mainPackage, branchLock, mainLock, branchChangelog, mainChangelog] = await Promise.all([
    runGit(['show', 'HEAD:package.json'], cwd),
    runGit(['show', `${main.ref}:package.json`], cwd),
    runGit(['show', 'HEAD:package-lock.json'], cwd),
    runGit(['show', `${main.ref}:package-lock.json`], cwd),
    runGit(['show', 'HEAD:src/changelog.ts'], cwd),
    runGit(['show', `${main.ref}:src/changelog.ts`], cwd),
  ]);
  const branchVersion = parseApplicationVersion(branchPackage, 'HEAD:package.json');
  const mainVersion = parseApplicationVersion(mainPackage, `${main.ref}:package.json`);
  const mainContainsBranch = await gitIsAncestor(branchSha, mainSha, cwd);
  const mainIsAncestorOfBranch = await gitIsAncestor(mainSha, branchSha, cwd);
  const validatedProfileEvidence = objectRecord(validation?.profile?.evidence);
  const validatedBaseSha = text(validation?.baseSha, text(validatedProfileEvidence.baseSha));
  const validatedBaseIsAncestorOfMain = validatedBaseSha
    ? await gitIsAncestor(validatedBaseSha, mainSha, cwd)
    : false;
  const base = changedFilesBaseRef({
    mainSha,
    startBranchSha,
    mainContainsBranch,
    mainIsAncestorOfBranch,
    validatedBaseSha,
    validatedBaseIsAncestorOfMain,
  });
  const changedFiles = await readChangedFiles(base, branchSha, cwd);
  const diffText = await runGit(['diff', '--unified=0', `${base}...${branchSha}`], cwd);
  const profile = deriveValidationProfile({ changedFiles, repositoryDirectory: cwd });
  return {
    branchName, branchSha, mainSha, originTrackingMainSha: trackingMain, originMainSha,
    mainContainsBranch, mainIsAncestorOfBranch, worktreeClean: status.length === 0,
    branchVersion, mainVersion,
    branchLockVersion: parseLockfileVersion(branchLock, 'HEAD:package-lock.json'),
    mainLockVersion: parseLockfileVersion(mainLock, `${main.ref}:package-lock.json`),
    branchChangelog: parseChangelogSnapshot(branchChangelog, branchVersion),
    mainChangelog: parseChangelogSnapshot(mainChangelog, mainVersion),
    changedFiles,
    validationProfile: { ...profile, evidence: { baseSha: base, branchSha, diffIdentity: contentIdentity(diffText) } },
    ...(startBranchSha ? { startBranchSha, branchBaselineIsAncestor: await gitIsAncestor(startBranchSha, branchSha, cwd) } : {}),
    validation,
  };
}

function releaseStateErrors({ entry, release, requireMerged = true }) {
  const errors = [];
  if (!release.branchName || release.branchName === 'HEAD') errors.push('the checkout is detached');
  if (release.branchName === 'main') errors.push('the task is running directly on main');
  if (entry?.branchName && release.branchName !== entry.branchName) errors.push(`checkout branch ${release.branchName} does not match ${entry.branchName}`);
  if (!release.worktreeClean) errors.push('the checkout has uncommitted changes');
  if (requireMerged && release.mainContainsBranch !== true) errors.push(`main (${release.mainSha}) does not contain task branch ${release.branchSha}`);
  if (release.originMainSha !== release.mainSha) errors.push(`origin/main (${release.originMainSha}) does not match local main (${release.mainSha})`);
  if (release.branchVersion !== release.branchLockVersion) errors.push('branch package.json and package-lock.json versions differ');
  if (release.mainVersion !== release.mainLockVersion) errors.push('main package.json and package-lock.json versions differ');
  if (release.branchChangelog?.[0]?.version !== release.branchVersion) errors.push('branch changelog newest version does not match package.json');
  if (release.mainChangelog?.[0]?.version !== release.mainVersion) errors.push('main changelog newest version does not match package.json');
  if (release.mainContainsBranch !== true) errors.push(...changelogPreservationErrors(release.mainChangelog ?? [], release.branchChangelog ?? []));
  return errors;
}

export function validateReleaseCompletion({ entry, release }) {
  const errors = releaseStateErrors({ entry, release, requireMerged: true });
  if (errors.length) throw new Error(`Cannot complete coordination entry ${entry.id}: ${errors.join('; ')}.`);
  return { pushed: release.originMainSha === release.mainSha };
}

function lockOwner(content) {
  const trimmed = String(content).trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (validPid(parsed?.pid)) {
      return {
        pid: parsed.pid,
        token: typeof parsed.token === 'string' ? parsed.token : undefined,
      };
    }
  } catch {
    // Legacy lock files stored only the PID. They remain recoverable, while
    // new locks carry a token so release cannot remove a replacement lock.
  }

  const pid = Number.parseInt(trimmed, 10);
  return validPid(pid) ? { pid, token: undefined } : undefined;
}

async function lockIsStale(lockPath) {
  try {
    const [content, metadata] = await Promise.all([readFile(lockPath, 'utf8'), stat(lockPath)]);
    if (!String(content).trim()) return Date.now() - metadata.mtimeMs >= EMPTY_LOCK_GRACE_MS;
    const owner = lockOwner(content);
    return !owner || !processIsAlive(owner.pid);
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
      await candidateHandle.writeFile(`${JSON.stringify({ pid: process.pid, token: lockToken })}\n`, 'utf8');
      lockHandle = candidateHandle;
      break;
    } catch (error) {
      if (candidateHandle) {
        await candidateHandle.close().catch(() => undefined);
        await releaseOwnedLock(lockPath, lockToken).catch(() => undefined);
      }
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath)) await reclaimStaleLock(lockPath);
      else await delay(LOCK_RETRY_MS);
    }
  }
  if (!lockHandle) throw new Error(`Timed out waiting for coordination lock at ${lockPath}.`);
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
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export function coordinationFilePath(environment = process.env, temporaryDirectory = tmpdir()) {
  const configured = [environment[CODEX_COORDINATION_FILE_ENV], environment[COORDINATION_FILE_ENV]].find((candidate) => typeof candidate === 'string' && candidate.trim());
  return resolve(configured || resolve(temporaryDirectory, DEFAULT_COORDINATION_FILE));
}

export function emptyCoordinationState() {
  return { version: COORDINATION_SCHEMA_VERSION, scope: COORDINATION_SCOPE, versionAgreement: DEFAULT_VERSION_AGREEMENT, entries: [], reservations: [], configurations: [] };
}

function normalizeState(record) {
  const source = objectRecord(record);
  return {
    ...source,
    version: COORDINATION_SCHEMA_VERSION,
    scope: COORDINATION_SCOPE,
    versionAgreement: text(source.versionAgreement, DEFAULT_VERSION_AGREEMENT),
    entries: Array.isArray(source.entries) ? source.entries.filter((entry) => objectRecord(entry).id) : [],
    reservations: Array.isArray(source.reservations) ? source.reservations.filter((reservation) => objectRecord(reservation).worktree) : [],
    configurations: Array.isArray(source.configurations) ? source.configurations.filter((configuration) => objectRecord(configuration).worktree) : [],
  };
}

export function parseCoordinationState(content) {
  try {
    return normalizeState(JSON.parse(content));
  } catch (error) {
    throw new Error(`The shared emulator coordination file is corrupted. ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export function pruneDeadReservations(state, isAlive = processIsAlive) {
  return { ...state, reservations: (state.reservations ?? []).filter((reservation) => isAlive(reservation.pid) || (validPid(reservation.childPid) && isAlive(reservation.childPid))) };
}

export function pruneOrphanedConfigurations(state, worktreeExists = () => true) {
  const active = new Set((state.entries ?? []).filter((entry) => entry.status === 'active' && worktreeExists(entry.worktree)).map((entry) => entry.worktree));
  const reserved = new Set((state.reservations ?? []).map((reservation) => reservation.worktree));
  return { ...state, configurations: (state.configurations ?? []).filter((configuration) => active.has(configuration.worktree) || reserved.has(configuration.worktree)) };
}

export async function readCoordinationState(filePath = coordinationFilePath()) {
  return pruneDeadReservations(await readStateUnlocked(filePath));
}

export function coordinationStateChanged(previous, next) {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

function centralClaimConflict(entries, ownerId, worktree, claims, resources = []) {
  const requestedClaims = new Set(claims.map((claim) => claim.toLowerCase()));
  const requestedResources = new Set(resources.map((resource) => resource.toLowerCase()));
  for (const entry of entries) {
    if (!coordinationEntryOwnsOwnership(entry) || entry.id === ownerId || entry.worktree === worktree) continue;
    const entryClaims = parseList(entry.claims).map((claim) => claim.toLowerCase());
    const entryResources = parseList(entry.resources).map((resource) => resource.toLowerCase());
    const claim = entryClaims.find((candidate) => requestedClaims.has(candidate) && coordinationClaimIsCrossRepository(candidate));
    if (claim) return { entry, type: 'claim', requested: claim, matched: claim };
    const resource = entryResources.find((candidate) => requestedResources.has(candidate));
    if (resource) return { entry, type: 'resource', requested: resource, matched: resource };
  }
  return undefined;
}

export function findCoordinationConflict({ activeEntries = [], repositoryIdentity, repositoryRoot, worktree, scopes = [], claims = [], resources = [], files = [] } = {}) {
  void repositoryIdentity; void repositoryRoot; void scopes; void files;
  return centralClaimConflict(activeEntries, undefined, worktree, claims, resources);
}

export function formatCoordinationConflict(conflict) {
  return `Declared ${conflict.type} "${conflict.requested}" overlaps active entry ${conflict.entry.id} at ${conflict.entry.worktree}; coordinate ownership before starting.`;
}

export function formatCoordinationState(state, { includeHistory = false } = {}) {
  const allEntries = Array.isArray(state.entries) ? state.entries : [];
  const entries = includeHistory ? allEntries : allEntries.filter((entry) => entry.status !== 'complete');
  const hidden = allEntries.length - entries.length;
  const reservations = Array.isArray(state.reservations) ? state.reservations : [];
  const configurations = Array.isArray(state.configurations) ? state.configurations : [];
  const occupied = new Set([...reservations, ...configurations].map((resource) => resource.slot).filter(Number.isInteger));
  const available = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot).filter((slot) => !occupied.has(slot));
  const lines = ['# Codex-wide coordination', 'All local repositories on this host share this coordination registry.', '', includeHistory ? '## Work history' : '## Active work'];
  lines.push(...(entries.length ? entries.map(formatEntry) : ['- none']));
  if (hidden) lines.push(`- ${hidden} completed ${hidden === 1 ? 'entry' : 'entries'} hidden; use --history to show full history.`);
  lines.push('', `## Emulator capacity (${EMULATOR_SLOT_COUNT} isolated emulator slots)`, `- available slots: ${available.join(', ') || 'none'}`, `- occupied slots: ${[...occupied].sort((a, b) => a - b).join(', ') || 'none'}`, '', '## Configured worktree slots');
  lines.push(...(configurations.length ? configurations.map((configuration) => `- slot ${configuration.slot} — ${configuration.worktree} — configured ${text(configuration.configuredAt, 'unknown')}`) : ['- none']));
  lines.push('', '## Live emulator reservations');
  lines.push(...(reservations.length ? reservations.map(formatReservation) : ['- none']));
  return `${lines.join('\n')}\n`;
}

function formatEntry(entry) {
  const resources = parseList(entry.resources);
  const ownership = `scopes ${parseList(entry.scopes).join(', ') || 'none'} | claims ${parseList(entry.claims).join(', ') || 'none'}`;
  const lines = [`- [${text(entry.status, 'active')}] ${entry.id} — ${text(entry.intent, 'No intent recorded.')}`, `  worktree: ${text(entry.worktree, 'unknown')} | branch: ${text(entry.branchName, 'unknown')}`, `  started: ${text(entry.startedAt, 'unknown')} | resources: ${resources.join(', ') || 'none'}`, `  ownership: ${ownership}`];
  if (entry.implementationPrompt) lines.push(`  implementation prompt: ${normalizePromptId(entry.implementationPrompt)}`);
  if (entry.parked?.checkpointSha) lines.push(`  parked checkpoint: ${entry.parked.checkpointSha} | next action: ${text(entry.parked.nextAction, 'not recorded')}`);
  if (entry.validation) lines.push(`  validation: ${entry.validation.passed === true ? 'passed' : 'failed'} @ ${text(entry.validation.commitSha, 'unknown')} | profile ${text(entry.validation.profile?.kind, 'unknown')}`);
  if (entry.outcome) lines.push(`  outcome: ${entry.outcome}`);
  return lines.join('\n');
}

function formatReservation(reservation) {
  const child = validPid(reservation.childPid) ? ` / child ${reservation.childPid}` : '';
  return `- slot ${reservation.slot} — ${reservation.kind} — ${reservation.worktree} — pid ${reservation.pid}${child} — ports ${(reservation.ports ?? []).join(', ') || 'unknown'}`;
}

function bindPortIsFree(port, host) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen({ host, port }, () => server.close((error) => resolvePromise(!error)));
  });
}

async function lsofPortIsFree(port) {
  try {
    const result = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return result.stdout.trim().length === 0;
  } catch (error) {
    if (error?.code === 1) return true;
    return undefined;
  }
}

export async function isPortFree(port, host = '127.0.0.1') {
  if (host === '127.0.0.1') {
    const result = await lsofPortIsFree(port);
    if (result !== undefined) return result;
  }
  return bindPortIsFree(port, host === '127.0.0.1' ? '0.0.0.0' : host);
}

export function parseListeningPortSnapshot(output = '') {
  const ports = new Set();
  for (const match of String(output).matchAll(/:(\d+)\s+\(LISTEN\)/g)) ports.add(Number(match[1]));
  return ports;
}

function reservationId() {
  return `${process.pid}-${Date.now()}-${randomUUID()}`;
}

function coordinationReservations(state) {
  return [...(state.reservations ?? []), ...(state.configurations ?? []).map((configuration) => ({ ...configuration, kind: 'configuration', pid: 0 }))];
}

function reservationBlocksSlot(reservation, request) {
  if (reservation.slot !== request.slot) return false;
  if (reservation.worktree !== request.worktree) return true;
  if (reservation.kind === 'configuration' && request.kind === 'configuration') return true;
  if (reservation.kind === 'configuration') return false;
  if (reservation.kind === 'vite' || request.kind === 'vite') return reservation.kind === request.kind;
  return true;
}

export function chooseAvailableEmulatorSlot({ preferredSlot, availableSlots, worktree, kind, reservations }) {
  const candidates = [preferredSlot, ...(availableSlots ?? [])].filter((slot, index, all) => Number.isInteger(slot) && all.indexOf(slot) === index);
  return candidates.find((slot) => !(reservations ?? []).some((reservation) => reservationBlocksSlot(reservation, { slot, worktree, kind })));
}

async function occupiedPorts(ports, portCheck) {
  const result = await Promise.all((ports ?? []).map(async (port) => ({ port, free: await portCheck(port) })));
  return result.filter(({ free }) => !free).map(({ port }) => port);
}

function slotError(filePath, slot, kind, state) {
  const owners = coordinationReservations(state).filter((reservation) => reservation.slot === slot).map((reservation) => `${reservation.kind} by ${reservation.worktree}`).join('; ') || 'a registered or listening process';
  return new Error(`Cannot claim emulator slot ${slot} for ${kind}: ${owners}. See ${filePath}.`);
}

export async function reserveConfiguredEmulatorSlot({ filePath = coordinationFilePath(), slot, worktree = process.cwd(), ports, portCheck = isPortFree }) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    if (coordinationReservations(state).some((reservation) => reservationBlocksSlot(reservation, { slot, worktree, kind: 'configuration' }))) throw slotError(filePath, slot, 'configuration', state);
    const occupied = await occupiedPorts(ports, portCheck);
    if (occupied.length) throw new Error(`Cannot claim emulator slot ${slot}: port(s) ${occupied.join(', ')} are already listening.`);
    const configuration = { id: `configuration-${randomUUID()}`, slot, worktree, configuredAt: isoNow(), ports: [...ports] };
    state.configurations = (state.configurations ?? []).filter((candidate) => candidate.worktree !== worktree);
    state.configurations.push(configuration);
    await writeStateUnlocked(filePath, state);
    return configuration;
  });
}

export async function reserveAvailableConfiguredEmulatorSlot({ filePath = coordinationFilePath(), preferredSlot, worktree = process.cwd(), availableSlots = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot), portsForSlot = (slot) => [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)], portCheck = isPortFree }) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    for (const slot of [preferredSlot, ...availableSlots].filter((candidate, index, all) => Number.isInteger(candidate) && all.indexOf(candidate) === index)) {
      if (coordinationReservations(state).some((reservation) => reservationBlocksSlot(reservation, { slot, worktree, kind: 'configuration' }))) continue;
      const ports = portsForSlot(slot);
      if ((await occupiedPorts(ports, portCheck)).length) continue;
      const configuration = { id: `configuration-${randomUUID()}`, slot, worktree, configuredAt: isoNow(), ports: [...ports] };
      state.configurations = (state.configurations ?? []).filter((candidate) => candidate.worktree !== worktree);
      state.configurations.push(configuration);
      await writeStateUnlocked(filePath, state);
      return configuration;
    }
    throw new Error(`No free emulator slot is available for configuration. See ${filePath}.`);
  });
}

export async function releaseConfiguredEmulatorSlot(configuration, filePath = coordinationFilePath()) {
  if (!configuration?.worktree) return;
  await withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath);
    state.configurations = (state.configurations ?? []).filter((candidate) => configuration.id ? candidate.id !== configuration.id : !(candidate.worktree === configuration.worktree && candidate.slot === configuration.slot));
    await writeStateUnlocked(filePath, state);
  });
}

export async function reserveEmulatorSlot({ filePath = coordinationFilePath(), slot, worktree = process.cwd(), kind, command, ports, portCheck = isPortFree }) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    if (coordinationReservations(state).some((reservation) => reservationBlocksSlot(reservation, { slot, worktree, kind }))) throw slotError(filePath, slot, kind, state);
    const occupied = await occupiedPorts(ports, portCheck);
    if (occupied.length) throw new Error(`Cannot claim emulator slot ${slot}: port(s) ${occupied.join(', ')} are already listening.`);
    const reservation = { id: reservationId(), slot, worktree, kind, command, pid: process.pid, claimedAt: isoNow(), ports: [...ports] };
    state.reservations.push(reservation);
    await writeStateUnlocked(filePath, state);
    return reservation;
  });
}

export async function reserveAvailableEmulatorSlot({ filePath = coordinationFilePath(), preferredSlot, worktree = process.cwd(), kind, command, availableSlots = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot), portsForSlot = (slot) => Object.values(emulatorPortsForSlot(slot)), portCheck = isPortFree }) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    for (const slot of [preferredSlot, ...availableSlots].filter((candidate, index, all) => Number.isInteger(candidate) && all.indexOf(candidate) === index)) {
      if (coordinationReservations(state).some((reservation) => reservationBlocksSlot(reservation, { slot, worktree, kind }))) continue;
      const ports = portsForSlot(slot);
      if ((await occupiedPorts(ports, portCheck)).length) continue;
      const reservation = { id: reservationId(), slot, worktree, kind, command, pid: process.pid, claimedAt: isoNow(), ports: [...ports] };
      state.reservations.push(reservation);
      await writeStateUnlocked(filePath, state);
      return reservation;
    }
    throw new Error(`No free emulator slot is available for ${kind}. See ${filePath}.`);
  });
}

export async function releaseEmulatorSlot(reservation, filePath = coordinationFilePath()) {
  if (!reservation?.id) return;
  await withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath);
    state.reservations = (state.reservations ?? []).filter((candidate) => candidate.id !== reservation.id);
    await writeStateUnlocked(filePath, state);
  });
}

export async function updateReservationChildPid(reservation, childPid, filePath = coordinationFilePath()) {
  if (!validPid(childPid)) throw new Error(`Invalid emulator child PID: ${childPid}.`);
  return withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath);
    const current = state.reservations.find((candidate) => candidate.id === reservation?.id);
    if (!current) throw new Error(`Cannot attach child PID: reservation ${reservation?.id} is not active.`);
    current.childPid = childPid;
    await writeStateUnlocked(filePath, state);
    return current;
  });
}

async function fileIdentity(path) {
  try {
    const [content, metadata] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    return { contentHash: contentIdentity(content), device: metadata.dev, inode: metadata.ino, mtimeNs: String(metadata.mtimeNs ?? metadata.mtimeMs), ctimeNs: String(metadata.ctimeNs ?? metadata.ctimeMs) };
  } catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; }
}

function sameFileIdentity(left, right) {
  return Boolean(left && right && left.contentHash === right.contentHash && left.device === right.device && left.inode === right.inode && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs);
}

async function writeNoClobber(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.close();
    await link(temporaryPath, path);
  } finally { await unlink(temporaryPath).catch(() => undefined); }
}

export async function prepareValidationEmulator({ environment = process.env, repositoryDirectory = process.cwd(), coordinationPath = coordinationFilePath(), localFirebaseConfigPath = resolve(repositoryDirectory, 'firebase.local.json'), localEnvironmentPath = resolve(repositoryDirectory, '.env.emulators.local'), reserve = reserveAvailableConfiguredEmulatorSlot, release = releaseConfiguredEmulatorSlot, baseConfig, configForSlot = firebaseConfigForSlot, environmentForSlot = emulatorEnvironmentForSlot } = {}) {
  const setupLockPath = `${localFirebaseConfigPath}.validation.lock`;
  return withCoordinationLock(setupLockPath, async () => {
    const preexistingConfig = await fileIdentity(localFirebaseConfigPath);
    const preexistingEnvironment = await fileIdentity(localEnvironmentPath);
    if (preexistingConfig || environment.CI) return { created: false, configurationId: undefined, slot: undefined, preexistingConfigIdentity: preexistingConfig?.contentHash ?? 'ci-configured', preexistingEnvironmentIdentity: preexistingEnvironment?.contentHash, files: [] };
    const configuration = await reserve({ filePath: coordinationPath, worktree: repositoryDirectory, availableSlots: Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot), portsForSlot: (slot) => [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)] });
    const prepared = { created: true, configurationId: configuration.id, slot: configuration.slot, preexistingConfigIdentity: 'absent', preexistingEnvironmentIdentity: preexistingEnvironment?.contentHash, files: [], configuration, coordinationPath };
    try {
      const source = baseConfig ?? JSON.parse(await readFile(resolve(repositoryDirectory, 'firebase.json'), 'utf8'));
      const localConfig = `${JSON.stringify(configForSlot(source, configuration.slot), null, 2)}\n`;
      const environmentText = `${Object.entries(environmentForSlot(configuration.slot)).map(([name, value]) => `${name}=${value}`).join('\n')}\n`;
      for (const [path, content, preexisting] of [[localFirebaseConfigPath, localConfig, preexistingConfig], [localEnvironmentPath, environmentText, preexistingEnvironment]]) {
        if (preexisting) continue;
        if (await fileIdentity(path)) throw new Error(`Emulator setup raced with another owner at ${path}; retry validation after preserving that config.`);
        await writeNoClobber(path, content);
        const identity = await fileIdentity(path);
        if (!identity) throw new Error(`Emulator setup could not verify ${path}.`);
        prepared.files.push({ path, content, identity });
      }
      return prepared;
    } catch (error) {
      await cleanupValidationEmulator(prepared, { release });
      throw error;
    }
  });
}

export async function cleanupValidationEmulator(prepared, { release = releaseConfiguredEmulatorSlot } = {}) {
  if (!prepared?.created) return { released: false, removedFiles: [], outcome: 'preserved' };
  const removedFiles = [];
  const cleanupErrors = [];
  try {
    for (const file of prepared.files ?? []) {
      try {
        if (sameFileIdentity(await fileIdentity(file.path), file.identity)) {
          await unlink(file.path).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
          removedFiles.push(file.path);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  } finally {
    if (prepared.configuration) await release(prepared.configuration, prepared.coordinationPath);
  }
  if (cleanupErrors.length > 0) throw cleanupErrors[0];
  return { released: Boolean(prepared.configuration?.id), removedFiles, outcome: 'cleaned' };
}

function terminateValidationProcess(child, signal) {
  if (!child?.pid) return;
  if (process.platform === 'win32') child.kill(signal);
  else { try { process.kill(-child.pid, signal); } catch (error) { if (error?.code !== 'ESRCH') throw error; } }
}

async function waitForValidationProcessGroupExit(pid, timeoutMs) {
  if (!pid || process.platform === 'win32') return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(-pid, 0); } catch (error) { if (error?.code === 'ESRCH') return true; throw error; }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  try { process.kill(-pid, 0); return false; } catch (error) { if (error?.code === 'ESRCH') return true; throw error; }
}

export function executeValidationProcess(command, args, cwd, { signalSource = process, signal, timeoutMs = VALIDATION_PROCESS_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const controller = new AbortController();
    let child; let receivedSignal; let processError; let settled = false; let timeoutTimer; let escalationTimer;
    const stdout = []; const stderr = [];
    const cleanup = () => { clearTimeout(timeoutTimer); clearTimeout(escalationTimer); signalSource.removeListener('SIGINT', onInterrupt); signalSource.removeListener('SIGTERM', onTerminate); signal?.removeEventListener('abort', onAbort); };
    const rejectOnce = (error) => { if (!settled) { settled = true; cleanup(); rejectPromise(error); } };
    const resolveOnce = (value) => { if (!settled) { settled = true; cleanup(); resolvePromise(value); } };
    const abort = (reason) => { if (receivedSignal) return; receivedSignal = typeof reason === 'string' ? reason : 'SIGTERM'; terminateValidationProcess(child, receivedSignal); controller.abort(receivedSignal); };
    const onInterrupt = () => abort('SIGINT'); const onTerminate = () => abort('SIGTERM'); const onAbort = () => abort(signal.reason);
    if (signal) signal.aborted ? abort(signal.reason) : signal.addEventListener('abort', onAbort, { once: true }); else { signalSource.once('SIGINT', onInterrupt); signalSource.once('SIGTERM', onTerminate); }
    try {
      child = spawn(command, args, { cwd, signal: controller.signal, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', (chunk) => stdout.push(chunk)); child.stderr?.on('data', (chunk) => stderr.push(chunk));
      child.once('error', (error) => { processError ??= error; });
      child.once('close', async (code, signalName) => {
        try {
          if (receivedSignal || processError || code !== 0) {
            terminateValidationProcess(child, 'SIGTERM');
            if (!(await waitForValidationProcessGroupExit(child.pid, VALIDATION_PROCESS_ESCALATION_MS))) terminateValidationProcess(child, 'SIGKILL');
          }
        } catch (error) { processError ??= error; }
        if (receivedSignal === 'TIMEOUT') rejectOnce(new Error(`${command} validation timed out after ${timeoutMs}ms.`));
        else if (receivedSignal) rejectOnce(new Error(`${command} validation was interrupted by ${receivedSignal}.`));
        else if (processError) rejectOnce(processError);
        else if (code !== 0) rejectOnce(Object.assign(new Error(`${command} exited with ${signalName ? `signal ${signalName}` : `code ${code}`}.`), { code, signal: signalName }));
        else resolveOnce({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
      });
    } catch (error) { rejectOnce(error); }
    timeoutTimer = setTimeout(() => { if (!receivedSignal) { receivedSignal = 'TIMEOUT'; terminateValidationProcess(child, 'SIGTERM'); escalationTimer = setTimeout(() => terminateValidationProcess(child, 'SIGKILL'), VALIDATION_PROCESS_ESCALATION_MS); } }, timeoutMs);
  });
}

const VALIDATION_COMMANDS = new Map([
  ['npm run coordination:docs', ['run', 'coordination:docs']],
  ['npm run lint', ['run', 'lint']],
  ['npm run test:all', ['run', 'test:all']],
  ['npm run build', ['run', 'build']],
  ['npm run build --prefix functions', ['run', 'build', '--prefix', 'functions']],
]);

function safeFocusedTestPath(value) {
  const path = normalizePath(value);
  if (!path || path.startsWith('/') || path.startsWith('-') || path.split('/').includes('..') || path.includes('\0')) throw new Error(`Invalid focused test path: ${value || 'missing path'}.`);
  return path;
}

export async function runValidationCommand(command, cwd, options = {}) {
  if (command === 'git diff --check') { await runGit(['diff', '--check', 'main...HEAD'], cwd); return; }
  const prefix = 'npm test -- --run ';
  if (command.startsWith(prefix)) { await executeValidationProcess('npm', ['test', '--', '--run', safeFocusedTestPath(command.slice(prefix.length).trim())], cwd, options); return; }
  const args = VALIDATION_COMMANDS.get(command);
  if (!args) throw new Error(`No executable validation mapping exists for ${command}.`);
  await executeValidationProcess('npm', args, cwd, options);
}

function changedFilesForRelease(release, entry) {
  return [...new Set((release?.changedFiles ?? entry?.changedFiles ?? []).map(normalizePath).filter(Boolean))];
}

export async function beginCoordinationEntry(filePath, options = {}) {
  const start = await readGitStartState();
  const { scopes, claims, resources } = normalizeOwnership(options);
  const workType = text(options['work-type'], 'tooling');
  if (!['product', 'tooling', 'documentation', 'investigation'].includes(workType)) throw new Error('coordination begin requires --work-type product|tooling|documentation|investigation.');
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    if (state.entries.some((entry) => coordinationEntryOwnsOwnership(entry) && entry.worktree === process.cwd())) throw new Error('An active coordination entry already exists for this worktree.');
    const conflict = centralClaimConflict(state.entries, undefined, process.cwd(), claims, resources);
    if (conflict) throw new Error(formatConflictForecast({ conflicts: [{ ...conflict, ownerId: conflict.entry.id, ownerWorktree: conflict.entry.worktree, ownerIntent: conflict.entry.intent ?? '', sameFile: false, suggestion: 'The shared resource remains exclusive; wait for the owner.', lease: leaseStatusForEntry(conflict.entry) }] }));
    const now = isoNow();
    const implementationPrompt = normalizePromptId(options['implementation-prompt']);
    const entry = {
      id: `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`,
      worktree: process.cwd(), pid: process.pid, startedAt: now, heartbeatAt: now, status: 'active',
      branchName: start.branchName, startBranchSha: start.branchSha, startMainSha: start.mainSha,
      repositoryRoot: start.repositoryRoot, repositoryIdentity: start.repositoryIdentity,
      intent: text(options.intent, 'Unspecified coordination work.'),
      versionPlan: text(options['version-plan'], 'No application version change.'),
      preemptiveChangelog: text(options['preemptive-changelog'], 'No player-facing change.'),
      workType, scopes, claims, resources, requestedScopes: scopes, requestedClaims: claims,
      ...(implementationPrompt ? { implementationPrompt } : {}),
    };
    state.entries.push(entry);
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

async function updateOwnership(filePath, options = {}, mode = 'amend') {
  if (!options.id) throw new Error(`coordination ${mode} requires --id <entry-id>.`);
  const { scopes, claims, resources } = normalizeOwnership(options);
  if (scopes.length === 0 && claims.length === 0 && resources.length === 0 && mode !== 'claim') throw new Error(`coordination ${mode} requires ownership or resource values.`);
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot ${mode} coordination entry ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    const conflict = centralClaimConflict(state.entries, entry.id, process.cwd(), claims, resources);
    if (conflict) throw new Error(formatConflictForecast({ conflicts: [{ ...conflict, ownerId: conflict.entry.id, ownerWorktree: conflict.entry.worktree, ownerIntent: conflict.entry.intent ?? '', sameFile: false, suggestion: 'The shared resource remains exclusive; wait for the owner.', lease: leaseStatusForEntry(conflict.entry) }] }));
    entry.scopes = [...new Set([...(entry.scopes ?? []), ...scopes])];
    entry.claims = [...new Set([...(entry.claims ?? []), ...claims])];
    entry.resources = [...new Set([...(entry.resources ?? []), ...resources])];
    if (options['implementation-prompt'] !== undefined) entry.implementationPrompt = normalizePromptId(options['implementation-prompt']);
    entry.amendments = [...(entry.amendments ?? []), { amendedAt: isoNow(options.now), scopes, claims, resources }];
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

export async function amendCoordinationEntry(filePath, options = {}) { return updateOwnership(filePath, options, 'amend'); }
export async function claimCoordinationEntry(filePath, options = {}) { return updateOwnership(filePath, options, 'claim'); }

export async function heartbeatCoordinationEntry(filePath, options = {}) {
  if (!options.id) throw new Error('coordination heartbeat requires --id <entry-id>.');
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') throw new Error(`Cannot heartbeat coordination entry ${entry.id}: it is not active.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot heartbeat coordination entry ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    const updated = refreshCoordinationLease({ ...entry, heartbeatAt: isoNow(options.now) }, { now: options.now });
    Object.assign(entry, updated, { heartbeatAt: updated.heartbeatAt ?? isoNow(options.now) });
    await writeStateUnlocked(filePath, state);
    return entry;
  });
}

export async function releaseCoordinationClaim(filePath, options = {}) {
  if (!options.id) throw new Error('coordination release-claim requires --id <entry-id>.');
  const { scopes, claims, resources } = normalizeOwnership(options);
  if (!scopes.length && !claims.length && !resources.length) throw new Error('coordination release-claim requires ownership or resource values.');
  return withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath); const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot release coordination claim for ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    const scopeSet = new Set(scopes); const claimSet = new Set(claims); const resourceSet = new Set(resources);
    entry.scopes = (entry.scopes ?? []).filter((scope) => !scopeSet.has(normalizePath(scope)));
    entry.claims = (entry.claims ?? []).filter((claim) => !claimSet.has(String(claim).toLowerCase()));
    entry.resources = (entry.resources ?? []).filter((resource) => !resourceSet.has(String(resource).toLowerCase()));
    entry.claimReleases = [...(entry.claimReleases ?? []), { releasedAt: isoNow(options.now), scopes, claims, resources }];
    await writeStateUnlocked(filePath, state);
    return entry;
  });
}

export const releaseCoordinationClaims = releaseCoordinationClaim;

export async function forecastCoordinationEntry(filePath, options = {}) {
  const state = await readCoordinationState(filePath); const start = await readGitStartState();
  return forecastCoordinationConflicts({ activeEntries: state.entries, repositoryIdentity: options['repository-identity'] ?? start.repositoryIdentity, repositoryRoot: options['repository-root'] ?? start.repositoryRoot, worktree: options.worktree ?? process.cwd(), scopes: parseList(options.scope), files: parseList(options.files), claims: parseList(options.claims ?? options.claim), resources: parseList(options.resources), now: options.now ?? Date.now(), leaseMs: options['lease-ms'] ? Number(options['lease-ms']) : undefined });
}

export async function parkCoordinationEntry(filePath, options = {}) {
  if (!options.id) throw new Error('coordination park requires --id <entry-id>.');
  const checkpoint = text(options['checkpoint-sha']).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(checkpoint)) throw new Error('coordination park requires an exact 40-character --checkpoint-sha value.');
  return withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath); const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot park coordination entry ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    const current = await readGitStartState();
    if (current.branchName !== entry.branchName || current.branchSha.toLowerCase() !== checkpoint) throw new Error(`Cannot park coordination entry ${entry.id}: checkpoint or branch does not match the current checkout.`);
    if ((await runGit(['status', '--porcelain', '--untracked-files=all'])).trim()) throw new Error(`Cannot park coordination entry ${entry.id}: the checkout is not clean.`);
    const now = isoNow(options.now); entry.status = 'parked'; entry.parkedAt = now; entry.parked = { status: 'parked', parkedAt: now, checkpointSha: checkpoint, worktree: process.cwd(), branchName: current.branchName, nextAction: text(options['next-action'], 'Resume when the blocker clears.') }; entry.lease = { state: 'parked-no-heartbeat-required', ownerConfirmationRequired: false, takeoverAllowed: false };
    await writeStateUnlocked(filePath, state); return entry;
  });
}

export async function resumeCoordinationEntry(filePath, options = {}) {
  if (!options.id) throw new Error('coordination resume requires --id <entry-id>.');
  return withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath); const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'parked') throw new Error(`Cannot resume coordination entry ${entry.id}: it is not parked.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot resume coordination entry ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    const parked = objectRecord(entry.parked); const checkpoint = text(options['checkpoint-sha'], text(parked.checkpointSha)).toLowerCase(); const current = await readGitStartState();
    if (current.branchName !== entry.branchName || current.branchSha.toLowerCase() !== checkpoint) throw new Error(`Cannot resume coordination entry ${entry.id}: parked checkpoint does not match the current checkout.`);
    if ((await runGit(['status', '--porcelain', '--untracked-files=all'])).trim()) throw new Error(`Cannot resume coordination entry ${entry.id}: the checkout is not clean.`);
    const now = isoNow(options.now); entry.status = 'active'; entry.resumedAt = now; entry.heartbeatAt = now; entry.parked = { ...parked, status: 'resumed', resumedAt: now }; entry.lease = { state: 'healthy', ownerConfirmationRequired: false, takeoverAllowed: false, lastHeartbeatAt: now };
    await writeStateUnlocked(filePath, state); return entry;
  });
}

export async function prepareCoordinationReleaseFragment(filePath, options = {}) {
  const taskId = text(options.coordinationEntryId ?? options['coordination-id'] ?? options.id ?? options.taskId);
  if (!taskId) throw new Error('release fragment preparation requires --id <coordination-entry-id>.');
  const coordinationPath = resolve(options.coordinationFilePath ?? options['coordination-file'] ?? coordinationFilePath());
  const state = await readCoordinationState(coordinationPath); const entry = state.entries.find((candidate) => candidate.id === taskId);
  if (!entry) throw new Error(`No coordination entry found for ${taskId}.`);
  if (entry.status !== 'active') throw new Error(`Coordination entry ${taskId} is not active.`);
  const repositoryDirectory = resolve(options.repositoryDirectory ?? options.worktree ?? process.cwd()); const start = await readGitStartState(repositoryDirectory); const packageJson = JSON.parse(await readFile(resolve(repositoryDirectory, 'package.json'), 'utf8'));
  return prepareReleaseFragmentFile(resolve(filePath), { taskId, worktree: repositoryDirectory, changes: options.changes ?? parseList(options.change), baseVersion: packageJson.version, baseMainSha: start.mainSha, coordinationEntryId: entry.id, coordinationBranchName: start.branchName, coordinationBranchSha: start.branchSha }, { now: options.now ?? new Date() });
}

export async function finalizeReleaseFragment(filePath, options = {}) {
  const taskId = text(options.coordinationEntryId ?? options['coordination-id'] ?? options.id ?? options.taskId);
  if (!taskId) throw new Error('release fragment finalization requires --id <coordination-entry-id>.');
  const lanePath = resolve(filePath); let lane = await readReleaseLaneState(lanePath); let fragment = lane.fragments.find((candidate) => candidate.taskId === taskId);
  if (!fragment) { await prepareCoordinationReleaseFragment(lanePath, options); lane = await readReleaseLaneState(lanePath); fragment = lane.fragments.find((candidate) => candidate.taskId === taskId); }
  const repositoryDirectory = resolve(options.repositoryDirectory ?? options.worktree ?? process.cwd()); const start = await readGitStartState(repositoryDirectory);
  return applyReleaseFragment(lanePath, { taskId, repositoryDirectory, packagePath: options.packagePath, lockfilePath: options.lockfilePath, changelogPath: options.changelogPath, currentMainSha: start.mainSha, now: options.now ?? new Date() });
}

export async function validateCoordinationEntry(filePath, options = {}) {
  if (!options.id) throw new Error('coordination validate requires --id <entry-id>.');
  const snapshot = await withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath);
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot validate coordination entry ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    return {
      id: entry.id,
      worktree: entry.worktree,
      startBranchSha: entry.startBranchSha,
      validation: entry.validation,
    };
  });

  const release = options.release ?? await readReleaseState({ cwd: process.cwd(), startBranchSha: snapshot.startBranchSha });
  if (release.worktreeClean !== true || release.mainIsAncestorOfBranch !== true) {
    throw new Error(
      `Coordination entry ${snapshot.id} must validate a clean branch reconciled with current main ` +
      `(clean=${release.worktreeClean}, mainIsAncestorOfBranch=${release.mainIsAncestorOfBranch}).`,
    );
  }
  const files = changedFilesForRelease(release, snapshot);
  const profile = deriveValidationProfile({ changedFiles: files, repositoryDirectory: process.cwd(), forceFull: options.forceFull === true });
  const commands = validationPlanForFiles(files, { profile }).commands;
  const releaseEvidence = objectRecord(release.validationProfile?.evidence);
  const validationBaseSha = text(releaseEvidence.baseSha);
  const validationDiffIdentity = text(releaseEvidence.diffIdentity);
  const previous = snapshot.validation;
  const reusable = options.force !== true && previous?.passed === true &&
    previous.commitSha === release.branchSha &&
    JSON.stringify(previous.files) === JSON.stringify(files) &&
    JSON.stringify(previous.commands) === JSON.stringify(commands) &&
    previous.profile?.kind === profile.kind &&
    previous.baseSha === validationBaseSha &&
    previous.diffIdentity === validationDiffIdentity;

  const recordValidation = async (validation, { reused = false } = {}) => withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath);
    const entry = state.entries.find((candidate) => candidate.id === snapshot.id);
    if (!entry) throw new Error(`No coordination entry found for ${snapshot.id}.`);
    if (entry.status !== 'active') throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot record validation for ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    if (snapshot.startBranchSha && entry.startBranchSha !== snapshot.startBranchSha) {
      throw new Error(`Coordination entry ${entry.id} changed its branch baseline while validation was running; rerun validation.`);
    }
    if (JSON.stringify(entry.validation ?? null) !== JSON.stringify(snapshot.validation ?? null)) {
      throw new Error(`Coordination entry ${entry.id} received another validation result while validation was running; rerun validation.`);
    }
    entry.validation = validation;
    entry.validationHistory = [...(entry.validationHistory ?? []), validation];
    entry.validationReused = reused;
    await writeStateUnlocked(filePath, state);
    return entry;
  });

  if (reusable) return recordValidation(previous, { reused: true });
  if (profile.requiresReview === true && !text(options.review ?? options['independent-review'])) {
    throw new Error(`Coordination entry ${snapshot.id} requires one independent holistic review before validation can finish.`);
  }

  const runner = options.commandRunner ?? runValidationCommand;
  const outcomes = [];
  const failedValidation = (error) => ({
    passed: false,
    commitSha: release.branchSha,
    profile,
    files,
    commands,
    outcomes,
    ...(validationBaseSha ? { baseSha: validationBaseSha } : {}),
    ...(validationDiffIdentity ? { diffIdentity: validationDiffIdentity } : {}),
    error: error instanceof Error ? error.message : String(error),
    validatedAt: isoNow(),
  });
  try {
    for (const command of commands) {
      await runner(command, process.cwd(), options);
      outcomes.push({ command, passed: true });
    }
  } catch (error) {
    try { await recordValidation(failedValidation(error)); } catch { /* Preserve the command failure for the caller. */ }
    throw error;
  }

  if (!options.release) {
    const after = await readReleaseState({ cwd: process.cwd(), startBranchSha: snapshot.startBranchSha });
    if (after.branchSha !== release.branchSha || after.mainSha !== release.mainSha ||
      after.worktreeClean !== true || after.mainIsAncestorOfBranch !== true) {
      const error = new Error(`Coordination entry ${snapshot.id} changed while validation was running; rerun validation on the new branch state.`);
      try { await recordValidation(failedValidation(error)); } catch { /* Preserve the state-change failure for the caller. */ }
      throw error;
    }
  }

  const validation = {
    passed: true,
    commitSha: release.branchSha,
    profile,
    files,
    commands,
    outcomes,
    ...(validationBaseSha ? { baseSha: validationBaseSha } : {}),
    ...(validationDiffIdentity ? { diffIdentity: validationDiffIdentity } : {}),
    ...(profile.requiresReview ? { review: text(options.review ?? options['independent-review']) } : {}),
    validatedAt: isoNow(),
  };
  return recordValidation(validation);
}

export async function finishCoordinationEntry(filePath, options = {}) {
  if (!options.id) throw new Error('coordination finish requires --id <entry-id>.');
  return withCoordinationLock(filePath, async () => {
    const state = await readStateUnlocked(filePath); const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    if (entry.worktree !== process.cwd()) throw new Error(`Cannot finish coordination entry ${entry.id} from ${process.cwd()}; it belongs to ${entry.worktree}.`);
    const outcome = text(options.outcome, 'landed'); if (!['landed', 'preserved', 'discarded'].includes(outcome)) throw new Error('coordination finish outcome must be landed, preserved, or discarded.');
    const release = options.release ?? await readReleaseState({ cwd: process.cwd(), startBranchSha: entry.startBranchSha, validation: entry.validation });
    if (outcome === 'landed') {
      if (entry.validation?.passed !== true || entry.validation.commitSha !== release.branchSha) throw new Error(`Cannot complete coordination entry ${entry.id}: run coordination:validate on the current branch first.`);
      validateReleaseCompletion({ entry, release });
    } else if (outcome === 'preserved') {
      const destination = text(options['preserve-ref']); if (!destination) throw new Error(`Cannot preserve coordination entry ${entry.id}: --preserve-ref is required.`);
      const separator = destination.indexOf('/'); if (separator < 1 || separator === destination.length - 1) throw new Error('--preserve-ref must be remote/branch.');
      const actual = options.preservedRefSha ?? (await runGit(['ls-remote', '--exit-code', destination.slice(0, separator), `refs/heads/${destination.slice(separator + 1)}`])).split(/\s+/)[0];
      if (actual !== release.branchSha) throw new Error(`Preserved ref ${destination} does not contain ${release.branchSha}.`);
      entry.preservation = { destination, commitSha: release.branchSha, verifiedAt: isoNow() };
    } else {
      const reason = text(options.reason); if (!reason) throw new Error(`Cannot discard coordination entry ${entry.id}: --reason is required.`);
      entry.discard = { reason, branchSha: release.branchSha, changedFiles: changedFilesForRelease(release, entry) };
    }
    entry.status = 'complete'; entry.outcome = outcome; entry.completedAt = isoNow(); if (text(options.result)) entry.result = text(options.result); entry.finalBranchName = release.branchName; entry.finalBranchSha = release.branchSha; entry.mainSha = release.mainSha; entry.originMainSha = release.originMainSha; entry.pushed = outcome === 'landed' && release.originMainSha === release.mainSha;
    await writeStateUnlocked(filePath, state); return entry;
  });
}

export function normalizeFilePathForValidation(filePath) { return safeFocusedTestPath(filePath); }

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]; if (!argument?.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2); const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}.`);
    if (['scope', 'claims', 'claim', 'resources', 'files', 'change'].includes(name)) options[name] = [...(Array.isArray(options[name]) ? options[name] : []), value]; else options[name] = value;
    index += 1;
  }
  return options;
}

async function status(filePath, includeHistory) {
  const state = await readCoordinationState(filePath); console.log(`Coordination file: ${filePath}`); console.log(formatCoordinationState(state, { includeHistory }));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'status') { await status(coordinationFilePath(), args.includes('--history')); return; }
  const options = parseOptions(args); const filePath = resolve(options.file ?? coordinationFilePath()); const lanePath = resolve(options['lane-file'] ?? `${filePath}.release-lane.json`);
  if (command === 'begin') { const entry = await beginCoordinationEntry(filePath, options); console.log(`Registered coordination entry ${entry.id} in ${filePath}.`); return; }
  if (command === 'park') { const entry = await parkCoordinationEntry(filePath, options); console.log(`Parked coordination entry ${entry.id} at ${entry.parked.checkpointSha}.`); return; }
  if (command === 'resume') { const entry = await resumeCoordinationEntry(filePath, options); console.log(`Resumed coordination entry ${entry.id}.`); return; }
  if (command === 'forecast' || command === 'conflict-forecast') { console.log(formatConflictForecast(await forecastCoordinationEntry(filePath, options))); return; }
  if (command === 'claim') { const entry = await claimCoordinationEntry(filePath, options); console.log(`Claimed coordination ownership for ${entry.id}.`); return; }
  if (command === 'heartbeat') { console.log(JSON.stringify(await heartbeatCoordinationEntry(filePath, options), null, 2)); return; }
  if (command === 'release-claim') { const entry = await releaseCoordinationClaim(filePath, options); console.log(`Released coordination ownership for ${entry.id}.`); return; }
  if (command === 'lease-status') { const state = await readCoordinationState(filePath); console.log(leaseStatusesForEntries(state.entries, { now: options.now ?? Date.now() }).map(({ entry, lease }) => JSON.stringify({ id: entry.id, status: entry.status, worktree: entry.worktree, lease })).join('\n')); return; }
  if (command === 'release-prepare') { console.log(JSON.stringify(await prepareCoordinationReleaseFragment(lanePath, { ...options, coordinationEntryId: options['task-id'] ?? options.id, coordinationFilePath: filePath, changes: options.change ? parseList(options.change) : [] }), null, 2)); return; }
  if (command === 'release-land') { console.log(JSON.stringify(await finalizeReleaseFragment(lanePath, { ...options, coordinationEntryId: options['task-id'] ?? options.id, coordinationFilePath: filePath }), null, 2)); return; }
  if (command === 'amend') { const entry = await amendCoordinationEntry(filePath, options); console.log(`Amended coordination entry ${entry.id}.`); return; }
  if (command === 'validate') { const entry = await validateCoordinationEntry(filePath, options); console.log(entry.validationReused ? `Reused passing validation for ${entry.id}.` : `Validated coordination entry ${entry.id}.`); return; }
  if (command === 'finish') { const entry = await finishCoordinationEntry(filePath, options); console.log(`Completed coordination entry ${entry.id}.`); return; }
  throw new Error('usage: node scripts/emulator-resource-registry.mjs <status|begin|park|resume|forecast|claim|heartbeat|release-claim|lease-status|release-prepare|release-land|amend|validate|finish> [options]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
