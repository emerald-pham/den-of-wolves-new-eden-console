#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  coordinationFilePath,
  readCoordinationState,
} from './emulator-resource-registry.mjs';

const execFileAsync = promisify(execFile);

export const DEFAULT_WORKTREE_LIMIT = 50;

function normalizedPath(path) {
  return resolve(path);
}

/** Parse `git worktree list --porcelain` without depending on display columns. */
export function parseWorktreePorcelain(output = '') {
  const records = [];
  let current;

  const finishRecord = () => {
    if (!current?.path) return;
    records.push({
      ...current,
      isPrimary: records.length === 0,
    });
  };

  for (const line of String(output).split('\n')) {
    if (line.startsWith('worktree ')) {
      finishRecord();
      current = { path: line.slice('worktree '.length) };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
      continue;
    }
    if (line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    }
  }
  finishRecord();
  return records;
}

/** Parse the gate's intentionally small command-line surface. */
export function parseWorktreeLimitArguments(argumentsList = []) {
  let apply = false;
  let limit = DEFAULT_WORKTREE_LIMIT;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    const inlineLimit = argument.match(/^--limit=(.+)$/);
    if (argument === '--limit' || inlineLimit) {
      const value = inlineLimit?.[1] ?? argumentsList[++index];
      if (!/^\d+$/.test(value ?? '')) {
        throw new Error('--limit must be a positive integer.');
      }
      limit = Number(value);
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      return { apply, limit, help: true };
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('--limit must be a positive integer.');
  }
  return { apply, limit };
}

/** Worktrees with active coordination, local changes, or unmerged commits stay protected. */
export function planWorktreePrune({
  worktrees = [],
  limit = DEFAULT_WORKTREE_LIMIT,
  currentWorktree,
  activeWorktrees = new Set(),
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('Worktree limit must be a positive integer.');
  }
  const normalizedCurrentWorktree = currentWorktree ? normalizedPath(currentWorktree) : undefined;
  const normalizedActiveWorktrees = new Set(
    [...activeWorktrees].filter(Boolean).map((worktree) => normalizedPath(worktree)),
  );
  const existingWorktrees = worktrees.filter((worktree) => worktree.exists);
  const removalsNeeded = Math.max(0, existingWorktrees.length - limit);
  const protectedWorktrees = [];
  const eligible = [];

  for (const worktree of existingWorktrees) {
    const worktreePath = normalizedPath(worktree.path);
    let reason;
    if (worktree.isPrimary) reason = 'primary worktree';
    else if (worktreePath === normalizedCurrentWorktree) reason = 'current worktree';
    else if (normalizedActiveWorktrees.has(worktreePath)) reason = 'active coordination work';
    else if (!worktree.clean) reason = 'dirty worktree';
    else if (!worktree.mergedIntoMain) reason = 'unmerged commit';

    if (reason) protectedWorktrees.push({ ...worktree, reason });
    else eligible.push(worktree);
  }

  eligible.sort((left, right) =>
    left.createdAtMs - right.createdAtMs || left.path.localeCompare(right.path));
  const removals = eligible.slice(0, removalsNeeded);

  return {
    existingCount: existingWorktrees.length,
    limit,
    removalsNeeded,
    removals,
    protected: protectedWorktrees,
    shortfall: removalsNeeded - removals.length,
  };
}

function activeWorktreesFromCoordination(state) {
  const worktrees = new Set();
  for (const entry of state.entries ?? []) {
    if (entry?.status === 'active' && typeof entry.worktree === 'string') {
      worktrees.add(normalizedPath(entry.worktree));
    }
  }
  for (const reservation of state.reservations ?? []) {
    if (typeof reservation?.worktree === 'string') worktrees.add(normalizedPath(reservation.worktree));
  }
  for (const configuration of state.configurations ?? []) {
    if (typeof configuration?.worktree === 'string') worktrees.add(normalizedPath(configuration.worktree));
  }
  return worktrees;
}

async function git(args, cwd) {
  const result = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout;
}

async function isWorktreeClean(worktreePath) {
  const status = await git(['-C', worktreePath, 'status', '--porcelain', '--untracked-files=all']);
  return status.length === 0;
}

async function isMergedIntoMain(worktreePath) {
  try {
    await git(['-C', worktreePath, 'merge-base', '--is-ancestor', 'HEAD', 'main']);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

async function worktreeMetadata(worktree) {
  try {
    const metadata = await stat(worktree.path);
    if (!metadata.isDirectory()) return { ...worktree, exists: false };
    const createdAtMs = Number.isFinite(metadata.birthtimeMs) && metadata.birthtimeMs > 0
      ? metadata.birthtimeMs
      : metadata.mtimeMs;
    const [clean, mergedIntoMain] = await Promise.all([
      isWorktreeClean(worktree.path),
      isMergedIntoMain(worktree.path),
    ]);
    return { ...worktree, exists: true, clean, mergedIntoMain, createdAtMs };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ...worktree, exists: false };
    throw error;
  }
}

async function readWorktreePrunePlan({ cwd, limit, readState = readCoordinationState }) {
  const [porcelain, coordinationState] = await Promise.all([
    git(['worktree', 'list', '--porcelain'], cwd),
    readState(coordinationFilePath()),
  ]);
  const worktrees = await Promise.all(parseWorktreePorcelain(porcelain).map(worktreeMetadata));
  return planWorktreePrune({
    worktrees,
    limit,
    currentWorktree: cwd,
    activeWorktrees: activeWorktreesFromCoordination(coordinationState),
  });
}

function formatPathList(title, worktrees, formatter) {
  if (worktrees.length === 0) return `${title}: none`;
  return [title, ...worktrees.map((worktree) => `  ${formatter(worktree)}`)].join('\n');
}

export function formatWorktreePrunePlan(plan) {
  const lines = [
    `Worktrees on disk: ${plan.existingCount}; limit: ${plan.limit}; removals required: ${plan.removalsNeeded}.`,
    formatPathList('Oldest eligible worktrees', plan.removals, (worktree) => worktree.path),
  ];
  if (plan.shortfall > 0) {
    lines.push(`Blocked: ${plan.shortfall} more safe removal${plan.shortfall === 1 ? '' : 's'} required.`);
    lines.push(formatPathList(
      'Protected worktrees',
      plan.protected,
      (worktree) => `${worktree.path} (${worktree.reason})`,
    ));
  }
  return lines.join('\n');
}

/**
 * Inspect or enforce the local cap. Applying never forces a worktree removal;
 * each loop re-reads coordination, cleanliness, and main ancestry before Git
 * removes the current oldest safe candidate.
 */
export async function enforceWorktreeLimit({
  cwd = process.cwd(),
  limit = DEFAULT_WORKTREE_LIMIT,
  apply = false,
  readPlan = readWorktreePrunePlan,
  removeWorktree = (worktreePath) => git(['worktree', 'remove', worktreePath], cwd),
} = {}) {
  let plan = await readPlan({ cwd, limit });
  if (!apply || plan.removalsNeeded === 0) return { plan, removed: [] };
  if (plan.shortfall > 0) {
    throw new Error(`${formatWorktreePrunePlan(plan)}\nRefusing to force-remove protected worktrees.`);
  }

  const removed = [];
  while (plan.removalsNeeded > 0) {
    if (plan.shortfall > 0 || plan.removals.length === 0) {
      throw new Error(`${formatWorktreePrunePlan(plan)}\nRefusing to force-remove protected worktrees.`);
    }
    const candidate = plan.removals[0];
    await removeWorktree(candidate.path);
    removed.push(candidate.path);
    plan = await readPlan({ cwd, limit });
  }
  return { plan, removed };
}

function usage() {
  return [
    'Usage: node scripts/enforce-worktree-limit.mjs [--limit 50] [--apply]',
    '',
    'Without --apply, exits nonzero while the existing-worktree count exceeds the limit.',
    'With --apply, removes only the oldest clean, main-contained worktrees that',
    'have no active coordination entry, reservation, or configured emulator row.',
  ].join('\n');
}

async function main() {
  const options = parseWorktreeLimitArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await enforceWorktreeLimit(options);
  console.log(formatWorktreePrunePlan(result.plan));
  if (result.removed.length > 0) {
    console.log(formatPathList('Removed worktrees', result.removed, (worktreePath) => worktreePath));
  }
  if (result.plan.removalsNeeded > 0) {
    console.error(options.apply
      ? 'The worktree cap remains unmet because protected worktrees cannot be removed safely.'
      : 'Run again with --apply to remove the listed oldest eligible worktrees.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
