#!/usr/bin/env node
// Read-only: this command never labels a checkout safe to delete.
import { execFileSync } from 'node:child_process';
import { statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseWorktrees(output) {
  return output.split('\0\0').filter(Boolean).map((record) => {
    const fields = record.split('\0');
    return {
      path: fields.find((field) => field.startsWith('worktree '))?.slice(9),
      branch: fields.find((field) => field.startsWith('branch '))?.slice(7) ?? '(detached)',
    };
  }).filter((entry) => entry.path);
}

export function storageWarnings(availableBytes, worktreeCount) {
  const warnings = [];
  if (availableBytes < 20 * 1024 ** 3) warnings.push('Less than 20 GiB available: review local storage before installing dependencies or creating more checkouts.');
  if (worktreeCount > 20) warnings.push('More than 20 registered worktrees: review finished tasks for deliberate cleanup. Count alone does not prove any checkout is disposable.');
  return warnings;
}

export function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--sizes')) throw new Error('Usage: node scripts/local-storage.mjs [--sizes]');
  const worktrees = parseWorktrees(execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8' }));
  const filesystem = statfsSync(process.cwd());
  const available = filesystem.bavail * filesystem.bsize;
  console.log(`Available on this checkout's filesystem: ${(available / 1024 ** 3).toFixed(1)} GiB`);
  console.log(`Registered worktrees for this repository: ${worktrees.length}`);
  for (const warning of storageWarnings(available, worktrees.length)) console.log(`WARNING: ${warning}`);
  console.log('Read-only inventory; active/parked tasks, unique work, ignored files, and live processes require separate review.');
  console.log('Cleanup procedure: docs/LOCAL_STORAGE.md');
  if (!args.includes('--sizes')) {
    console.log('Use --sizes for a slower per-worktree disk scan (KiB). No files are removed.');
    return;
  }
  console.log('Directory block usage can double-count APFS clones; it is not a guaranteed reclaim estimate.');
  for (const worktree of worktrees) {
    console.log(`Inspecting ${worktree.path} [${worktree.branch}]`);
    try {
      const size = execFileSync('du', ['-sk', worktree.path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      console.log(size.trimEnd());
    } catch (error) {
      console.error(`Could not fully measure ${worktree.path}: ${error.stderr?.toString().trim() || error.message}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
