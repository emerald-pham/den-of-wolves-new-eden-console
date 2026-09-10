#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COORDINATION_THROUGHPUT_SCHEMA_VERSION = 1;
export const DEFAULT_COORDINATION_LEASE_MS = 90_000;
export const DEFAULT_VALIDATION_CONCURRENCY = 2;
export const RELEASE_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

const LOCK_RETRY_MS = 25;
const LOCK_ATTEMPTS = 2_400;
const DEFAULT_COORDINATION_FILE = 'den-of-wolves-new-eden-coordination.json';

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];
}

function normalizePath(value) {
  const path = text(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return path;
}

function normalizeClaim(value) {
  return text(value).toLowerCase();
}

function pathOverlaps(left, right) {
  if (!left || !right) return false;
  return left === '*' || right === '*' || left === right ||
    left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function pathLooksLikeFile(value) {
  const name = basename(value);
  return /\.[a-z0-9]+$/i.test(name);
}

function sameRepository(candidate, { repositoryIdentity, repositoryRoot }) {
  if (text(candidate?.repositoryIdentity) && text(repositoryIdentity)) {
    return candidate.repositoryIdentity === repositoryIdentity;
  }
  return Boolean(candidate?.repositoryRoot && repositoryRoot && candidate.repositoryRoot === repositoryRoot);
}

function claimIsCrossRepository(claim) {
  return claim.startsWith('emulator-slot-') ||
    claim.startsWith('coordination-') ||
    claim.startsWith('release-');
}

function leafSuggestion(requested, files = []) {
  const candidates = files
    .map(normalizePath)
    .filter((file) => file && pathOverlaps(file, requested) && pathLooksLikeFile(file));
  if (candidates.length > 0) return candidates;
  if (pathLooksLikeFile(requested)) return [requested];
  return [`${requested.replace(/\/$/, '')}/<leaf-file>`];
}

function conflictKey(conflict) {
  return [conflict.type, conflict.ownerId, conflict.requested, conflict.matched].join('\u0000');
}

/**
 * Forecast all ownership conflicts before a task starts. A forecast is
 * descriptive only: an active owner remains the blocker, including when the
 * requested and matched paths are the same leaf file.
 */
export function forecastCoordinationConflicts({
  activeEntries = [],
  repositoryIdentity,
  repositoryRoot,
  worktree,
  scopes = [],
  files = [],
  claims = [],
} = {}) {
  const requestedScopes = list(scopes).map(normalizePath).filter(Boolean);
  const requestedFiles = list(files).map(normalizePath).filter(Boolean);
  const requestedClaims = [...new Set(list(claims).map(normalizeClaim).filter(Boolean))];
  const conflicts = [];
  const suggestions = [];

  const addConflict = (entry, type, requested, matched, ownerScopes) => {
    const normalizedRequested = normalizePath(requested);
    const normalizedMatched = normalizePath(matched);
    if (!normalizedRequested || !normalizedMatched) return;
    const sameFile = pathLooksLikeFile(normalizedRequested) &&
      pathLooksLikeFile(normalizedMatched) && normalizedRequested === normalizedMatched;
    const candidateFiles = requestedFiles.length > 0 ? requestedFiles : ownerScopes;
    const suggestedScopes = leafSuggestion(normalizedRequested, candidateFiles);
    const suggestion = type === 'claim'
      ? 'The shared claim remains exclusive; wait for the owner.'
      : sameFile
      ? `Wait for the owner; the exact leaf file "${normalizedMatched}" remains exclusive.`
      : `Narrow to exact leaf-file scopes such as ${suggestedScopes.map((scope) => `"${scope}"`).join(', ')}.`;
    const conflict = {
      type,
      ownerId: text(entry?.id, 'unknown'),
      ownerWorktree: text(entry?.worktree, 'unknown'),
      ownerIntent: text(entry?.intent, ''),
      requested: normalizedRequested,
      matched: normalizedMatched,
      sameFile,
      suggestion,
    };
    const key = conflictKey(conflict);
    if (conflicts.some((candidate) => conflictKey(candidate) === key)) return;
    conflicts.push(conflict);
    for (const scope of suggestedScopes) {
      if (!suggestions.includes(scope)) suggestions.push(scope);
    }
  };

  for (const entry of Array.isArray(activeEntries) ? activeEntries : []) {
    if (entry?.status !== 'active' || entry.worktree === worktree) continue;
    const repositoryMatch = sameRepository(entry, { repositoryIdentity, repositoryRoot });
    const ownerScopes = [
      ...list(entry.scopes).map(normalizePath),
      ...list(entry.files).map(normalizePath),
    ].filter(Boolean);
    if (repositoryMatch) {
      for (const requested of requestedScopes) {
        for (const matched of ownerScopes.filter((scope) => pathOverlaps(requested, scope))) {
          addConflict(entry, 'scope', requested, matched, ownerScopes);
        }
      }
      for (const requested of requestedFiles) {
        for (const matched of ownerScopes.filter((scope) => pathOverlaps(requested, scope))) {
          addConflict(entry, 'file', requested, matched, ownerScopes);
        }
      }
    }

    const ownerClaims = new Set(list(entry.claims).map(normalizeClaim));
    for (const requested of requestedClaims) {
      if (ownerClaims.has(requested) && (repositoryMatch || claimIsCrossRepository(requested))) {
        addConflict(entry, 'claim', requested, requested, []);
      }
    }
  }

  return {
    blocked: conflicts.length > 0,
    conflicts,
    suggestedScopes: suggestions,
  };
}

/** Render a short, actionable forecast without implying that a stale owner can be taken over. */
export function formatConflictForecast(forecast) {
  const conflicts = Array.isArray(forecast?.conflicts) ? forecast.conflicts : [];
  if (conflicts.length === 0) return 'No coordination conflicts forecast.';
  return conflicts.map((conflict) => {
    const owner = `${text(conflict.ownerId, 'unknown')} at ${text(conflict.ownerWorktree, 'unknown')}`;
    const type = text(conflict.type, 'scope');
    const base = `Conflict with ${owner}: requested ${type} "${conflict.requested}" matches owner ${type} "${conflict.matched}".`;
    const suggestion = text(conflict.suggestion, 'Wait for the active owner before writing.');
    const exclusivity = conflict.sameFile
      ? ' same-file writes remain exclusive; wait for the owner.'
      : '';
    return `${base} ${suggestion}${exclusivity}`;
  }).join('\n');
}

function dateValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function isoDate(value = new Date()) {
  const date = dateValue(value);
  if (!date) throw new Error(`Invalid timestamp: ${String(value)}.`);
  return date.toISOString();
}

function leaseDuration(value) {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_COORDINATION_LEASE_MS;
  return Math.floor(value);
}

/** Describe an active owner lease; an expired lease needs confirmation, never takeover. */
export function leaseStatusForEntry(entry, {
  now = Date.now(),
  leaseMs = DEFAULT_COORDINATION_LEASE_MS,
} = {}) {
  const current = dateValue(now) ?? new Date();
  const duration = leaseDuration(leaseMs);
  if (entry?.status !== 'active') {
    return {
      state: 'terminal',
      ownerConfirmationRequired: false,
      takeoverAllowed: false,
      lastHeartbeatAt: undefined,
      expiresAt: undefined,
      ageMs: 0,
    };
  }

  const lastHeartbeat = dateValue(entry.heartbeatAt ?? entry.startedAt);
  const ageMs = lastHeartbeat ? Math.max(0, current.getTime() - lastHeartbeat.getTime()) : Number.POSITIVE_INFINITY;
  const ownerConfirmationRequired = !lastHeartbeat || ageMs > duration;
  const expiresAt = lastHeartbeat
    ? new Date(lastHeartbeat.getTime() + duration).toISOString()
    : undefined;
  return {
    state: ownerConfirmationRequired ? 'owner-confirmation-needed' : 'healthy',
    ownerConfirmationRequired,
    takeoverAllowed: false,
    lastHeartbeatAt: lastHeartbeat?.toISOString(),
    expiresAt,
    ageMs,
  };
}

export function coordinationTakeoverAllowed() {
  return false;
}

/** Refresh only the current active entry; this does not alter ownership or lifecycle status. */
export function refreshCoordinationLease(entry, {
  now = new Date(),
  leaseMs = DEFAULT_COORDINATION_LEASE_MS,
} = {}) {
  if (entry?.status !== 'active') {
    throw new Error(`Cannot heartbeat coordination entry ${text(entry?.id, 'unknown')}: it is not active.`);
  }
  const heartbeatAt = isoDate(now);
  const status = leaseStatusForEntry({ ...entry, heartbeatAt }, { now: heartbeatAt, leaseMs });
  return {
    ...entry,
    heartbeatAt,
    lease: {
      state: status.state,
      ownerConfirmationRequired: false,
      takeoverAllowed: false,
      lastHeartbeatAt: heartbeatAt,
      expiresAt: status.expiresAt,
    },
  };
}

export function leaseStatusesForEntries(entries = [], options = {}) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    entry,
    lease: leaseStatusForEntry(entry, options),
  }));
}

function normalizeConcurrency(value) {
  if (!Number.isInteger(value) || value < 1) return DEFAULT_VALIDATION_CONCURRENCY;
  return Math.min(value, 16);
}

function cloneQueueState(state) {
  const record = objectRecord(state);
  return {
    version: COORDINATION_THROUGHPUT_SCHEMA_VERSION,
    maxConcurrency: normalizeConcurrency(record.maxConcurrency),
    nextSequence: Number.isInteger(record.nextSequence) && record.nextSequence > 0 ? record.nextSequence : 1,
    active: Array.isArray(record.active) ? record.active.map((ticket) => ({ ...objectRecord(ticket) })) : [],
    pending: Array.isArray(record.pending) ? record.pending.map((ticket) => ({ ...objectRecord(ticket) })) : [],
  };
}

export function emptyValidationQueueState({ maxConcurrency = DEFAULT_VALIDATION_CONCURRENCY } = {}) {
  return {
    version: COORDINATION_THROUGHPUT_SCHEMA_VERSION,
    maxConcurrency: normalizeConcurrency(maxConcurrency),
    nextSequence: 1,
    active: [],
    pending: [],
  };
}

export function validationRequestMode(request = {}) {
  const kind = text(request.kind).toLowerCase();
  const isRelease = request.release === true || kind === 'release' || kind === 'full-release';
  const isFocused = request.focused === true || request.profile === 'copy-only' || kind === 'focused';
  return isFocused && !isRelease ? 'focused' : 'expensive';
}

function requestId(request) {
  return text(request.requestId ?? request.id, `validation-${randomUUID()}`);
}

function queueTimestamp(options) {
  return isoDate(options?.now ?? new Date());
}

/** Enqueue an expensive validation FIFO, or explicitly bypass focused validation. */
export function enqueueValidation(state, request = {}, options = {}) {
  const next = cloneQueueState(state);
  const id = requestId(request);
  const mode = validationRequestMode(request);
  const existing = [...next.active, ...next.pending].find((ticket) => ticket.id === id);
  if (existing) return { state: next, ticket: existing, duplicate: true };

  const queuedAt = queueTimestamp(options);
  if (mode === 'focused') {
    return {
      state: next,
      ticket: {
        id,
        entryId: text(request.entryId, 'unknown'),
        worktree: text(request.worktree, 'unknown'),
        kind: text(request.kind, 'focused'),
        mode,
        state: 'bypassed',
        queuedAt,
      },
      bypassed: true,
    };
  }

  const sequence = next.nextSequence;
  next.nextSequence += 1;
  const baseTicket = {
    id,
    entryId: text(request.entryId, 'unknown'),
    worktree: text(request.worktree, 'unknown'),
    kind: text(request.kind, 'full'),
    mode,
    sequence,
    queuedAt,
    heartbeatAt: queuedAt,
  };
  const ticket = next.active.length < next.maxConcurrency
    ? { ...baseTicket, state: 'active', startedAt: queuedAt }
    : { ...baseTicket, state: 'queued' };
  if (ticket.state === 'active') next.active.push(ticket);
  else next.pending.push(ticket);
  return {
    state: next,
    ticket,
    queued: ticket.state === 'queued',
  };
}

export const queueValidationRequest = enqueueValidation;

function promoteValidationQueue(state, now = new Date()) {
  const next = cloneQueueState(state);
  const startedAt = isoDate(now);
  next.pending.sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
  while (next.active.length < next.maxConcurrency && next.pending.length > 0) {
    const pending = next.pending.shift();
    if (!pending) break;
    next.active.push({
      ...pending,
      state: 'active',
      startedAt,
      heartbeatAt: startedAt,
    });
  }
  return next;
}

/** Release only the exact active ticket; queued work is promoted in FIFO order. */
export function releaseValidationLease(state, ticketId, { now = new Date() } = {}) {
  const next = cloneQueueState(state);
  const index = next.active.findIndex((ticket) => ticket.id === ticketId);
  if (index < 0) return next;
  next.active.splice(index, 1);
  return promoteValidationQueue(next, now);
}

export const markValidationLeaseReleased = releaseValidationLease;

export function refreshValidationLease(state, ticketId, {
  now = new Date(),
  leaseMs = DEFAULT_COORDINATION_LEASE_MS,
} = {}) {
  const next = cloneQueueState(state);
  const ticket = next.active.find((candidate) => candidate.id === ticketId);
  if (!ticket) throw new Error(`Cannot heartbeat validation ticket ${ticketId}: it is not active.`);
  const heartbeatAt = isoDate(now);
  const status = leaseStatusForEntry({ status: 'active', heartbeatAt }, { now: heartbeatAt, leaseMs });
  Object.assign(ticket, {
    heartbeatAt,
    lease: {
      state: status.state,
      ownerConfirmationRequired: false,
      takeoverAllowed: false,
      lastHeartbeatAt: heartbeatAt,
      expiresAt: status.expiresAt,
    },
  });
  return next;
}

export function validationLeaseStatus(ticket, options = {}) {
  return leaseStatusForEntry({
    status: ticket?.state === 'active' ? 'active' : ticket?.state,
    heartbeatAt: ticket?.heartbeatAt ?? ticket?.startedAt ?? ticket?.queuedAt,
  }, options);
}

export function validationQueueStatus(state) {
  const normalized = cloneQueueState(state);
  return {
    maxConcurrency: normalized.maxConcurrency,
    active: normalized.active.length,
    queued: normalized.pending.length,
    available: Math.max(0, normalized.maxConcurrency - normalized.active.length),
    activeTickets: normalized.active,
    pendingTickets: normalized.pending,
  };
}

function parseReleaseVersion(version) {
  const match = text(version).match(RELEASE_VERSION_PATTERN);
  if (!match) throw new Error(`Invalid application version: ${String(version)}.`);
  return match.slice(1).map(Number);
}

export function compareReleaseVersions(left, right) {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}

export function nextReleaseVersion(version) {
  const [major, middle, patch] = parseReleaseVersion(version);
  return patch >= 99 ? `${major}.${middle + 1}.0` : `${major}.${middle}.${patch + 1}`;
}

function cloneReleaseLaneState(state) {
  const record = objectRecord(state);
  return {
    version: COORDINATION_THROUGHPUT_SCHEMA_VERSION,
    nextSequence: Number.isInteger(record.nextSequence) && record.nextSequence > 0 ? record.nextSequence : 1,
    fragments: Array.isArray(record.fragments)
      ? record.fragments.map((fragment) => ({ ...objectRecord(fragment), changes: list(fragment.changes) }))
      : [],
  };
}

export function emptyReleaseLaneState() {
  return {
    version: COORDINATION_THROUGHPUT_SCHEMA_VERSION,
    nextSequence: 1,
    fragments: [],
  };
}

function validateFragmentChanges(changes) {
  const normalized = list(changes);
  if (normalized.length === 0) throw new Error('A release fragment requires at least one visible change.');
  return normalized;
}

function implementationPrompts(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((prompt) => (typeof prompt === 'number' && Number.isInteger(prompt)) ||
    (typeof prompt === 'string' && /^\d{3}[a-z]*$/i.test(prompt.trim())))
    .map((prompt) => typeof prompt === 'string' ? prompt.trim().toLowerCase() : prompt);
}

/** Prepare metadata only; package.json, package-lock.json, and changelog stay untouched. */
export function prepareReleaseFragment(state, {
  taskId,
  worktree,
  changes,
  implementationPrompts: prompts = [],
  implementationProgress,
  baseVersion,
} = {}, { now = new Date() } = {}) {
  const normalizedTaskId = text(taskId);
  if (!normalizedTaskId) throw new Error('A release fragment requires a task id.');
  const normalizedWorktree = text(worktree);
  if (!normalizedWorktree) throw new Error(`Release fragment ${normalizedTaskId} requires a worktree.`);
  const normalizedBaseVersion = text(baseVersion);
  if (!normalizedBaseVersion) {
    throw new Error(`Release fragment ${normalizedTaskId} must record the current main version before landing.`);
  }
  parseReleaseVersion(normalizedBaseVersion);
  const next = cloneReleaseLaneState(state);
  const existing = next.fragments.find((fragment) => fragment.taskId === normalizedTaskId);
  if (existing) throw new Error(`Release fragment for ${normalizedTaskId} already exists (${existing.state}).`);
  const fragment = {
    id: `release-fragment-${randomUUID()}`,
    sequence: next.nextSequence,
    taskId: normalizedTaskId,
    worktree: normalizedWorktree,
    state: 'prepared',
    preparedAt: isoDate(now),
    changes: validateFragmentChanges(changes),
    implementationPrompts: implementationPrompts(prompts),
    baseVersion: normalizedBaseVersion,
    ...(Object.keys(objectRecord(implementationProgress)).length > 0
      ? { implementationProgress: { ...objectRecord(implementationProgress) } }
      : {}),
  };
  next.nextSequence += 1;
  next.fragments.push(fragment);
  return { state: next, fragment };
}

function highestAllocatedVersion(fragments) {
  const versions = fragments
    .map((fragment) => fragment.version)
    .filter((version) => typeof version === 'string' && RELEASE_VERSION_PATTERN.test(version));
  return versions.reduce((highest, version) => !highest || compareReleaseVersions(version, highest) > 0 ? version : highest, undefined);
}

/** Allocate exactly the next version for one prepared task, preserving FIFO and monotonicity. */
export function allocateReleaseFragment(state, {
  taskId,
  currentVersion,
} = {}, { now = new Date() } = {}) {
  const normalizedTaskId = text(taskId);
  const next = cloneReleaseLaneState(state);
  const index = next.fragments.findIndex((fragment) => fragment.taskId === normalizedTaskId);
  if (index < 0) throw new Error(`No prepared release fragment exists for ${normalizedTaskId || 'unknown task'}.`);
  const current = next.fragments[index];
  if (current.state === 'allocated') throw new Error(`Release fragment ${normalizedTaskId} is already allocated version ${current.version}.`);
  if (current.state === 'landed') return { state: next, fragment: current, idempotent: true };
  const nextPrepared = next.fragments
    .filter((fragment) => fragment.state === 'prepared')
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))[0];
  if (nextPrepared && nextPrepared.taskId !== normalizedTaskId) {
    throw new Error(`Release fragment ${normalizedTaskId} cannot be reordered; allocate ${nextPrepared.taskId} first.`);
  }
  const version = nextReleaseVersion(currentVersion);
  if (!current.baseVersion) {
    throw new Error(`Release fragment ${normalizedTaskId} has no recorded main version.`);
  }
  if (current.baseVersion !== currentVersion) {
    throw new Error(`Release fragment ${normalizedTaskId} requires main version ${current.baseVersion}, but current main is ${currentVersion}.`);
  }
  const highest = highestAllocatedVersion(next.fragments);
  if (highest && compareReleaseVersions(version, highest) <= 0) {
    throw new Error(`Release fragment ${normalizedTaskId} would not advance beyond allocated version ${highest}.`);
  }
  const allocated = {
    ...current,
    state: 'allocated',
    version,
    allocatedAt: isoDate(now),
  };
  next.fragments[index] = allocated;
  return {
    state: next,
    fragment: allocated,
    changelogEntry: renderReleaseChangelogEntry(allocated, version),
  };
}

function sourceString(value) {
  return JSON.stringify(String(value));
}

/** Render one independent top-level ChangelogEntry for one task. */
export function renderReleaseChangelogEntry(fragment, version = fragment?.version) {
  const normalizedVersion = text(version);
  parseReleaseVersion(normalizedVersion);
  const lines = [
    '  {',
    '    version: APP_VERSION,',
  ];
  const prompts = implementationPrompts(fragment?.implementationPrompts);
  if (prompts.length > 0) lines.push(`    implementationPrompts: ${JSON.stringify(prompts)},`);
  const progress = objectRecord(fragment?.implementationProgress);
  if (Object.keys(progress).length > 0) {
    lines.push('    implementationProgress: {');
    for (const field of ['completed', 'total', 'percentage', 'done', 'partial', 'active', 'missing']) {
      if (progress[field] !== undefined) lines.push(`      ${field}: ${sourceString(progress[field])},`);
    }
    lines.push('    },');
  }
  lines.push('    changes: [');
  for (const change of validateFragmentChanges(fragment?.changes)) lines.push(`      ${sourceString(change)},`);
  lines.push('    ],', '  },');
  return `${lines.join('\n')}\n`;
}

export function insertReleaseChangelogEntry(source, fragment, version = fragment?.version) {
  const marker = source.indexOf('CHANGELOG');
  const open = marker >= 0 ? source.indexOf('[', marker) : -1;
  if (open < 0) throw new Error('Cannot find the top-level CHANGELOG array.');
  return `${source.slice(0, open + 1)}\n${renderReleaseChangelogEntry(fragment, version)}${source.slice(open + 1)}`;
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeJsonAtomically(path, value) {
  await writeTextAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomically(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function withFileLock(filePath, operation) {
  const lockPath = `${filePath}.lock`;
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  let handle;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(`${process.pid}:${randomUUID()}\n`, 'utf8');
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, LOCK_RETRY_MS));
    }
  }
  if (!handle) throw new Error(`Timed out waiting for coordination throughput lock at ${lockPath}.`);
  try {
    return await operation();
  } finally {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

async function readJsonState(filePath, fallback) {
  const content = await readOptional(filePath);
  if (content === undefined) return fallback;
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`The coordination throughput file ${filePath} is corrupted.`, { cause: error });
  }
}

export async function readReleaseLaneState(filePath) {
  return cloneReleaseLaneState(await readJsonState(filePath, emptyReleaseLaneState()));
}

/** Heartbeat one active owner entry in a shared coordination file. */
export async function heartbeatCoordinationEntryFile(filePath, {
  id,
  worktree = process.cwd(),
  now = new Date(),
  leaseMs = DEFAULT_COORDINATION_LEASE_MS,
} = {}) {
  return withFileLock(filePath, async () => {
    const state = objectRecord(await readJsonState(filePath, { entries: [] }));
    const entries = Array.isArray(state.entries) ? state.entries : [];
    const index = entries.findIndex((entry) => entry?.id === text(id));
    if (index < 0) throw new Error(`No coordination entry found for ${text(id, 'unknown')}.`);
    const entry = entries[index];
    if (entry.status !== 'active') {
      throw new Error(`Cannot heartbeat coordination entry ${entry.id}: it is not active.`);
    }
    if (entry.worktree !== worktree) {
      throw new Error(`Cannot heartbeat coordination entry ${entry.id} from ${worktree}; it belongs to ${entry.worktree}.`);
    }
    const updated = refreshCoordinationLease(entry, { now, leaseMs });
    entries[index] = updated;
    const nextState = { ...state, entries };
    await writeJsonAtomically(filePath, nextState);
    return updated;
  });
}

export async function prepareReleaseFragmentFile(filePath, options, operationOptions = {}) {
  return withFileLock(filePath, async () => {
    const state = await readJsonState(filePath, emptyReleaseLaneState());
    const result = prepareReleaseFragment(state, options, operationOptions);
    await writeJsonAtomically(filePath, result.state);
    return result;
  });
}

export async function allocateReleaseFragmentFile(filePath, options, operationOptions = {}) {
  return withFileLock(filePath, async () => {
    const state = await readJsonState(filePath, emptyReleaseLaneState());
    const result = allocateReleaseFragment(state, options, operationOptions);
    await writeJsonAtomically(filePath, result.state);
    return result;
  });
}

async function readPackageVersion(repositoryDirectory, packagePath) {
  const source = await readFile(resolve(repositoryDirectory, packagePath), 'utf8');
  const packageJson = JSON.parse(source);
  const version = packageJson?.version;
  parseReleaseVersion(version);
  return { source, packageJson, version };
}

async function readLockVersion(repositoryDirectory, lockfilePath) {
  const source = await readFile(resolve(repositoryDirectory, lockfilePath), 'utf8');
  const lockfile = JSON.parse(source);
  const version = lockfile?.packages?.['']?.version;
  parseReleaseVersion(version);
  return { source, lockfile, version };
}

function topChangelogVersion(source, packageVersion) {
  const match = source.match(/version\s*:\s*(APP_VERSION|['"](\d+\.\d+\.\d+)['"])/);
  if (!match) throw new Error('src/changelog.ts has no top-level release version.');
  return match[1] === 'APP_VERSION' ? packageVersion : match[2];
}

async function writeReleaseFilesAtomically(files) {
  const originals = await Promise.all(files.map(async (file) => ({
    ...file,
    original: await readOptional(file.path),
  })));
  const temporaryPaths = [];
  try {
    for (const file of originals) {
      const temporaryPath = `${file.path}.${process.pid}.${randomUUID()}.tmp`;
      temporaryPaths.push(temporaryPath);
      await mkdir(dirname(file.path), { recursive: true });
      await writeFile(temporaryPath, file.content, { encoding: 'utf8', mode: 0o600 });
    }
    for (let index = 0; index < originals.length; index += 1) {
      await rename(temporaryPaths[index], originals[index].path);
    }
  } catch (error) {
    for (const file of originals) {
      if (file.original === undefined) await unlink(file.path).catch(() => undefined);
      else await writeFile(file.path, file.original, 'utf8').catch(() => undefined);
    }
    throw error;
  } finally {
    await Promise.all(temporaryPaths.map((path) => unlink(path).catch(() => undefined)));
  }
}

function landedResult(fragment) {
  return {
    taskId: fragment.taskId,
    fragmentId: fragment.id,
    version: fragment.version,
    changedFiles: [...(fragment.changedFiles ?? ['package.json', 'package-lock.json', 'src/changelog.ts'])],
    idempotent: true,
  };
}

/**
 * Strictly land one prepared fragment. Main metadata must still be the
 * fragment's base; the allocated version must be exactly next(main), and the
 * three release files are written as one guarded transaction.
 */
export async function applyReleaseFragment(filePath, {
  taskId,
  repositoryDirectory = process.cwd(),
  packagePath = 'package.json',
  lockfilePath = 'package-lock.json',
  changelogPath = 'src/changelog.ts',
  now = new Date(),
} = {}) {
  return withFileLock(filePath, async () => {
    let state = cloneReleaseLaneState(await readJsonState(filePath, emptyReleaseLaneState()));
    const index = state.fragments.findIndex((fragment) => fragment.taskId === text(taskId));
    if (index < 0) throw new Error(`No prepared release fragment exists for ${text(taskId, 'unknown task')}.`);
    let fragment = state.fragments[index];
    if (fragment.state === 'landed') return landedResult(fragment);

    const packageFile = await readPackageVersion(repositoryDirectory, packagePath);
    const lockFile = await readLockVersion(repositoryDirectory, lockfilePath);
    if (packageFile.version !== lockFile.version) {
      throw new Error(`Release lane requires package.json and package-lock.json to agree; received ${packageFile.version} and ${lockFile.version}.`);
    }
    const changelogAbsolutePath = resolve(repositoryDirectory, changelogPath);
    const changelogSource = await readFile(changelogAbsolutePath, 'utf8');
    const changelogVersion = topChangelogVersion(changelogSource, packageFile.version);
    if (changelogVersion !== packageFile.version) {
      throw new Error(`Release lane requires the changelog newest version ${packageFile.version}; received ${changelogVersion}.`);
    }

    if (fragment.state === 'prepared') {
      const allocated = allocateReleaseFragment(state, {
        taskId: fragment.taskId,
        currentVersion: packageFile.version,
      }, { now });
      state = allocated.state;
      fragment = allocated.fragment;
    }
    const expectedVersion = nextReleaseVersion(packageFile.version);
    if (!fragment.baseVersion) {
      throw new Error(`Release fragment ${fragment.taskId} has no recorded main version; prepare it again with --base-version.`);
    }
    if (fragment.baseVersion !== packageFile.version) {
      throw new Error(`Release fragment ${fragment.taskId} requires main version ${fragment.baseVersion}, but current main is ${packageFile.version}.`);
    }
    if (fragment.version !== expectedVersion) {
      // A crash after publishing the files but before recording the lane can
      // be recovered only when the visible note and package version agree.
      const alreadyVisible = fragment.version === packageFile.version &&
        fragment.changes.every((change) => changelogSource.includes(change));
      if (alreadyVisible) {
        const landed = {
          ...fragment,
          state: 'landed',
          landedAt: isoDate(now),
          changedFiles: [packagePath, lockfilePath, changelogPath],
        };
        state.fragments[state.fragments.findIndex((candidate) => candidate.id === fragment.id)] = landed;
        await writeJsonAtomically(filePath, state);
        return landedResult(landed);
      }
      throw new Error(`Release fragment ${fragment.taskId} version ${fragment.version} is not the next version after main ${packageFile.version}; reconcile main before landing.`);
    }

    const nextPackage = { ...packageFile.packageJson, version: fragment.version };
    const nextLockfile = {
      ...lockFile.lockfile,
      packages: {
        ...objectRecord(lockFile.lockfile.packages),
        '': { ...objectRecord(lockFile.lockfile.packages?.['']), version: fragment.version },
      },
    };
    const nextChangelog = insertReleaseChangelogEntry(changelogSource, fragment, fragment.version);
    await writeReleaseFilesAtomically([
      { path: resolve(repositoryDirectory, packagePath), content: `${JSON.stringify(nextPackage, null, 2)}\n` },
      { path: resolve(repositoryDirectory, lockfilePath), content: `${JSON.stringify(nextLockfile, null, 2)}\n` },
      { path: changelogAbsolutePath, content: nextChangelog },
    ]);

    const landed = {
      ...fragment,
      state: 'landed',
      landedAt: isoDate(now),
      changedFiles: [packagePath, lockfilePath, changelogPath],
    };
    state.fragments[state.fragments.findIndex((candidate) => candidate.id === fragment.id)] = landed;
    await writeJsonAtomically(filePath, state);
    return {
      taskId: landed.taskId,
      fragmentId: landed.id,
      version: landed.version,
      changedFiles: landed.changedFiles,
      idempotent: false,
      changelogEntry: renderReleaseChangelogEntry(landed, landed.version),
    };
  });
}

export async function queueValidationLease(filePath, request, options = {}) {
  return withFileLock(filePath, async () => {
    const state = await readJsonState(filePath, emptyValidationQueueState());
    const result = enqueueValidation(state, request, options);
    await writeJsonAtomically(filePath, result.state);
    return result;
  });
}

export async function releaseValidationLeaseFile(filePath, ticketId, options = {}) {
  return withFileLock(filePath, async () => {
    const state = await readJsonState(filePath, emptyValidationQueueState());
    const next = releaseValidationLease(state, ticketId, options);
    await writeJsonAtomically(filePath, next);
    return next;
  });
}

export async function heartbeatValidationLeaseFile(filePath, ticketId, options = {}) {
  return withFileLock(filePath, async () => {
    const state = await readJsonState(filePath, emptyValidationQueueState());
    const next = refreshValidationLease(state, ticketId, options);
    await writeJsonAtomically(filePath, next);
    return next;
  });
}

export async function withValidationLease(filePath, request, operation, {
  pollMs = 100,
  timeoutMs = 60 * 60 * 1000,
  signal,
  ...options
} = {}) {
  const result = await queueValidationLease(filePath, request, options);
  const ticket = result.ticket;
  if (ticket.state === 'bypassed') return operation(ticket);
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      if (signal?.aborted) throw new Error(`Validation lease ${ticket.id} was interrupted.`);
      const state = cloneQueueState(await readJsonState(filePath, emptyValidationQueueState()));
      if (state.active.some((candidate) => candidate.id === ticket.id)) break;
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for validation lease ${ticket.id}.`);
      await new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(resolvePromise, pollMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          rejectPromise(new Error(`Validation lease ${ticket.id} was interrupted.`));
        }, { once: true });
      });
    }
    return await operation(ticket);
  } finally {
    await releaseValidationLeaseFile(filePath, ticket.id, options);
  }
}

function coordinationFilePath() {
  const configured = process.env.CODEX_COORDINATION_FILE || process.env.DOW_EMULATOR_COORDINATION_FILE;
  return configured ? resolve(configured) : resolve(tmpdir(), DEFAULT_COORDINATION_FILE);
}

function parseCliOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}.`);
    if (name === 'change') {
      options.change = [...(options.change ?? []), value];
    } else {
      options[name] = value;
    }
    index += 1;
  }
  return options;
}

async function cliMain() {
  const [command, ...args] = process.argv.slice(2);
  const optionArgs = command === 'validation-queue' ? args.slice(1) : args;
  const options = parseCliOptions(optionArgs);
  const lanePath = resolve(options.file || `${coordinationFilePath()}.release-lane.json`);
  if (command === 'heartbeat') {
    const updated = await heartbeatCoordinationEntryFile(resolve(options.file || coordinationFilePath()), {
      id: options.id,
      worktree: options.worktree || process.cwd(),
      leaseMs: options['lease-ms'] ? Number(options['lease-ms']) : undefined,
    });
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  if (command === 'conflict-forecast') {
    const state = await readJsonState(resolve(options.file || coordinationFilePath()), { entries: [] });
    const forecast = forecastCoordinationConflicts({
      activeEntries: state.entries,
      repositoryIdentity: options['repository-identity'],
      repositoryRoot: options['repository-root'],
      worktree: options.worktree || process.cwd(),
      scopes: options.scope?.split(',').filter(Boolean),
      files: options.files?.split(',').filter(Boolean),
      claims: options.claims?.split(',').filter(Boolean),
    });
    console.log(formatConflictForecast(forecast));
    return;
  }
  if (command === 'release-prepare') {
    const result = await prepareReleaseFragmentFile(lanePath, {
      taskId: options['task-id'],
      worktree: options.worktree || process.cwd(),
      changes: options.change,
      implementationPrompts: options['implementation-prompts']?.split(',').filter(Boolean),
      baseVersion: options['base-version'],
    });
    console.log(JSON.stringify(result.fragment, null, 2));
    return;
  }
  if (command === 'release-land') {
    const result = await applyReleaseFragment(lanePath, {
      taskId: options['task-id'],
      repositoryDirectory: options.repository || process.cwd(),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'validation-queue') {
    const queuePath = resolve(options.file || `${coordinationFilePath()}.validation-queue.json`);
    const [action] = args;
    if (action === 'status') {
      const state = await readJsonState(queuePath, emptyValidationQueueState());
      console.log(JSON.stringify(validationQueueStatus(state), null, 2));
      return;
    }
    if (action === 'acquire') {
      const result = await queueValidationLease(queuePath, {
        requestId: options['request-id'],
        entryId: options['entry-id'],
        worktree: options.worktree || process.cwd(),
        kind: options.kind || 'full',
        profile: options.profile,
      });
      console.log(JSON.stringify(result.ticket, null, 2));
      return;
    }
    if (action === 'release') {
      await releaseValidationLeaseFile(queuePath, options['ticket-id']);
      console.log(`Released validation ticket ${options['ticket-id']}.`);
      return;
    }
  }
  if (command === 'lease-status') {
    const state = await readJsonState(resolve(options.file || coordinationFilePath()), { entries: [] });
    const statuses = leaseStatusesForEntries(state.entries, {
      now: options.now || Date.now(),
      leaseMs: options['lease-ms'] ? Number(options['lease-ms']) : undefined,
    });
    console.log(statuses.map(({ entry, lease }) => ({
      id: entry.id,
      status: entry.status,
      worktree: entry.worktree,
      lease,
    })).map((entry) => JSON.stringify(entry)).join('\n'));
    return;
  }
  throw new Error(
    'usage: coordination-throughput.mjs <conflict-forecast|heartbeat|release-prepare|release-land|validation-queue|lease-status> [options]',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cliMain().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
