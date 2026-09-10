import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  allocateReleaseFragment,
  applyReleaseFragment,
  emptyReleaseLaneState,
  emptyValidationQueueState,
  enqueueValidation,
  formatConflictForecast,
  forecastCoordinationConflicts,
  heartbeatCoordinationEntryFile,
  leaseStatusForEntry,
  markValidationLeaseReleased,
  prepareReleaseFragment,
  prepareReleaseFragmentFile,
  queueValidationRequest,
  refreshCoordinationLease,
  releaseValidationLease,
  validationRequestMode,
} from '../../scripts/coordination-throughput.mjs';

const repoIdentity = '/repo/.git';
const repoRoot = '/repo';
const execFileAsync = promisify(execFile);
const throughputScript = resolve(process.cwd(), 'scripts/coordination-throughput.mjs');

function activeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'owner-entry',
    worktree: '/worktrees/owner',
    repositoryIdentity: repoIdentity,
    repositoryRoot: repoRoot,
    status: 'active',
    startedAt: '2026-09-10T12:00:00.000Z',
    heartbeatAt: '2026-09-10T12:00:00.000Z',
    scopes: ['src/components/RoleSelect.tsx'],
    claims: [],
    ...overrides,
  };
}

describe('coordination throughput primitives', () => {
  it('forecasts every matching owner with requested and matched scopes plus a leaf-file suggestion', () => {
    const forecast = forecastCoordinationConflicts({
      activeEntries: [activeEntry()],
      repositoryIdentity: repoIdentity,
      repositoryRoot: repoRoot,
      worktree: '/worktrees/current',
      scopes: ['src/components'],
      claims: [],
      files: ['src/components/RoleSelect.tsx'],
    });

    expect(forecast.blocked).toBe(true);
    expect(forecast.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ownerId: 'owner-entry',
        ownerWorktree: '/worktrees/owner',
        requested: 'src/components',
        matched: 'src/components/RoleSelect.tsx',
        sameFile: false,
      }),
      expect.objectContaining({
        requested: 'src/components/RoleSelect.tsx',
        matched: 'src/components/RoleSelect.tsx',
        sameFile: true,
      }),
    ]));
    expect(formatConflictForecast(forecast)).toContain(
      'owner-entry at /worktrees/owner: requested scope "src/components" matches owner scope "src/components/RoleSelect.tsx"',
    );
    expect(formatConflictForecast(forecast)).toContain('Narrow to exact leaf-file scopes');
    expect(formatConflictForecast(forecast)).toContain('same-file writes remain exclusive');
  });

  it('reports exact cross-repository claims but leaves unrelated scopes available', () => {
    const owner = activeEntry({ claims: ['coordination-validation-queue'] });
    const claimForecast = forecastCoordinationConflicts({
      activeEntries: [owner],
      repositoryIdentity: '/other/.git',
      repositoryRoot: '/other',
      worktree: '/worktrees/other',
      scopes: ['src/config'],
      claims: ['coordination-validation-queue'],
    });
    expect(claimForecast.conflicts).toEqual([
      expect.objectContaining({
        type: 'claim',
        requested: 'coordination-validation-queue',
        matched: 'coordination-validation-queue',
      }),
    ]);
    expect(formatConflictForecast(claimForecast)).toContain(
      'shared claim remains exclusive; wait for the owner',
    );
    expect(formatConflictForecast(claimForecast)).not.toContain('<leaf-file>');

    const scopeForecast = forecastCoordinationConflicts({
      activeEntries: [owner],
      repositoryIdentity: '/other/.git',
      repositoryRoot: '/other',
      worktree: '/worktrees/other',
      scopes: ['src/config'],
      claims: ['different-claim'],
    });
    expect(scopeForecast.blocked).toBe(false);
  });

  it('marks an inactive owner lease for confirmation without enabling takeover', () => {
    const stale = leaseStatusForEntry(activeEntry(), {
      now: '2026-09-10T12:03:00.000Z',
      leaseMs: 60_000,
    });
    expect(stale).toMatchObject({
      state: 'owner-confirmation-needed',
      ownerConfirmationRequired: true,
      takeoverAllowed: false,
    });

    const refreshed = refreshCoordinationLease(activeEntry(), {
      now: '2026-09-10T12:03:00.000Z',
      leaseMs: 60_000,
    });
    expect(refreshed).toMatchObject({
      status: 'active',
      heartbeatAt: '2026-09-10T12:03:00.000Z',
      lease: expect.objectContaining({
        state: 'healthy',
        ownerConfirmationRequired: false,
        takeoverAllowed: false,
      }),
    });
  });

  it('heartbeats the owning entry in the shared file without releasing or transferring it', async () => {
    const filePath = resolve(tmpdir(), `coordination-heartbeat-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [activeEntry()],
        reservations: [],
        configurations: [],
      }));
      const updated = await heartbeatCoordinationEntryFile(filePath, {
        id: 'owner-entry',
        worktree: '/worktrees/owner',
        now: '2026-09-10T12:03:00.000Z',
        leaseMs: 60_000,
      });
      expect(updated).toMatchObject({
        id: 'owner-entry',
        status: 'active',
        heartbeatAt: '2026-09-10T12:03:00.000Z',
        lease: expect.objectContaining({
          ownerConfirmationRequired: false,
          takeoverAllowed: false,
        }),
      });
      expect(JSON.parse(await readFile(filePath, 'utf8')).entries).toEqual([
        expect.objectContaining({ id: 'owner-entry', status: 'active' }),
      ]);
    } finally {
      await rm(filePath, { force: true });
      await rm(`${filePath}.lock`, { force: true });
    }
  });

  it('exposes executable heartbeat and conflict-forecast commands for coordination operators', async () => {
    const filePath = resolve(tmpdir(), `coordination-throughput-cli-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [activeEntry()],
        reservations: [],
        configurations: [],
      }));
      const heartbeat = await execFileAsync(process.execPath, [
        throughputScript,
        'heartbeat',
        '--file', filePath,
        '--id', 'owner-entry',
        '--worktree', '/worktrees/owner',
      ], { encoding: 'utf8' });
      expect(heartbeat.stdout).toContain('owner-entry');

      const forecast = await execFileAsync(process.execPath, [
        throughputScript,
        'conflict-forecast',
        '--file', filePath,
        '--repository-root', repoRoot,
        '--repository-identity', repoIdentity,
        '--worktree', '/worktrees/current',
        '--scope', 'src/components/RoleSelect.tsx',
      ], { encoding: 'utf8' });
      expect(forecast.stdout).toContain('same-file writes remain exclusive');
    } finally {
      await rm(filePath, { force: true });
      await rm(`${filePath}.lock`, { force: true });
    }
  });

  it('exposes a fair validation-queue status command without requiring a focused run', async () => {
    const filePath = resolve(tmpdir(), `coordination-validation-queue-cli-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify(emptyValidationQueueState({ maxConcurrency: 2 })));
      const status = await execFileAsync(process.execPath, [
        throughputScript,
        'validation-queue',
        'status',
        '--file', filePath,
      ], { encoding: 'utf8' });
      expect(JSON.parse(status.stdout)).toMatchObject({
        maxConcurrency: 2,
        active: 0,
        queued: 0,
      });
    } finally {
      await rm(filePath, { force: true });
      await rm(`${filePath}.lock`, { force: true });
    }
  });

  it('keeps active leases and only releases them by exact ticket id', () => {
    const state = emptyValidationQueueState({ maxConcurrency: 1 });
    const first = enqueueValidation(state, {
      requestId: 'first',
      entryId: 'entry-first',
      worktree: '/worktrees/first',
      kind: 'full',
    }, { now: '2026-09-10T12:00:00.000Z' });
    const second = enqueueValidation(first.state, {
      requestId: 'second',
      entryId: 'entry-second',
      worktree: '/worktrees/second',
      kind: 'full',
    }, { now: '2026-09-10T12:00:01.000Z' });

    expect(first.ticket).toMatchObject({ id: 'first', state: 'active' });
    expect(second.ticket).toMatchObject({ id: 'second', state: 'queued' });
    expect(markValidationLeaseReleased(second.state, 'not-second').active).toHaveLength(1);

    expect(markValidationLeaseReleased(second.state, 'second').pending).toHaveLength(0);

    const released = releaseValidationLease(second.state, 'first', {
      now: '2026-09-10T12:00:02.000Z',
    });
    expect(released.active).toEqual([
      expect.objectContaining({ id: 'second', state: 'active' }),
    ]);
    expect(released.pending).toHaveLength(0);
  });

  it('bypasses focused validation but queues release validation even when marked focused', () => {
    expect(validationRequestMode({ kind: 'focused', profile: 'copy-only' })).toBe('focused');
    expect(validationRequestMode({ kind: 'release', profile: 'copy-only' })).toBe('expensive');
    const result = queueValidationRequest(emptyValidationQueueState({ maxConcurrency: 1 }), {
      requestId: 'focused',
      entryId: 'focused-entry',
      worktree: '/worktrees/focused',
      kind: 'focused',
      profile: 'copy-only',
    }, { now: '2026-09-10T12:00:00.000Z' });
    expect(result.ticket).toMatchObject({ state: 'bypassed', mode: 'focused' });
    expect(result.state.active).toHaveLength(0);
    expect(result.state.pending).toHaveLength(0);
  });

  it('allocates one FIFO release fragment at a time without version skips or batching', () => {
    const prepared = prepareReleaseFragment(emptyReleaseLaneState(), {
      taskId: 'task-a',
      worktree: '/worktrees/a',
      changes: ['A visible release note.'],
      baseVersion: '0.3.23',
    }, { now: '2026-09-10T12:00:00.000Z' });
    expect(prepared.fragment).toMatchObject({
      taskId: 'task-a',
      state: 'prepared',
    });
    expect(prepared.fragment.version).toBeUndefined();

    const allocated = allocateReleaseFragment(prepared.state, {
      taskId: 'task-a',
      currentVersion: '0.3.23',
    }, { now: '2026-09-10T12:00:01.000Z' });
    expect(allocated.fragment).toMatchObject({
      taskId: 'task-a',
      state: 'allocated',
      version: '0.3.24',
    });
    expect(allocated.fragment.changes).toEqual(['A visible release note.']);
    expect(() => allocateReleaseFragment(allocated.state, {
      taskId: 'task-a',
      currentVersion: '0.3.23',
    })).toThrow(/already allocated/);
  });

  it('prepares a release fragment without touching package metadata or changelog, then lands it once', async () => {
    const root = resolve(tmpdir(), `coordination-release-lane-${randomUUID()}`);
    const lanePath = resolve(root, 'release-lane.json');
    try {
      await mkdir(resolve(root, 'src'), { recursive: true });
      await writeFile(resolve(root, 'package.json'), '{\n  "name": "fixture",\n  "version": "0.3.23"\n}\n');
      await writeFile(resolve(root, 'package-lock.json'), '{\n  "packages": {\n    "": { "version": "0.3.23" }\n  }\n}\n');
      await writeFile(resolve(root, 'src/changelog.ts'), `export const CHANGELOG = [\n  {\n    version: APP_VERSION,\n    changes: ['Previous release.'],\n  },\n];\n`);

      await prepareReleaseFragmentFile(lanePath, {
        taskId: 'task-a',
        worktree: root,
        changes: ['A visible release note.'],
        baseVersion: '0.3.23',
      }, { now: '2026-09-10T12:00:00.000Z' });
      expect(await readFile(resolve(root, 'package.json'), 'utf8')).toContain('0.3.23');
      expect(await readFile(resolve(root, 'src/changelog.ts'), 'utf8')).toContain('Previous release.');

      const finalizationChecks: Array<{ version: string; changelogSource: string }> = [];
      const landed = await applyReleaseFragment(lanePath, {
        taskId: 'task-a',
        repositoryDirectory: root,
        now: '2026-09-10T12:00:01.000Z',
        validateFinalMetadata: ({ version, changelogSource }: { version: string; changelogSource: string }) => {
          finalizationChecks.push({ version, changelogSource });
        },
      });
      expect(landed).toMatchObject({
        taskId: 'task-a',
        version: '0.3.24',
        changedFiles: ['package.json', 'package-lock.json', 'src/changelog.ts'],
      });
      expect(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version).toBe('0.3.24');
      expect(JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8')).packages[''].version).toBe('0.3.24');
      const changelog = await readFile(resolve(root, 'src/changelog.ts'), 'utf8');
      expect(changelog.match(/version: APP_VERSION/g)).toHaveLength(1);
      expect(changelog).toContain("version: '0.3.23'");
      expect(changelog).toContain('A visible release note.');
      expect(finalizationChecks).toHaveLength(1);
      expect(finalizationChecks[0]).toMatchObject({ version: '0.3.24' });
      expect(finalizationChecks[0]?.changelogSource).toContain('A visible release note.');

      const repeated = await applyReleaseFragment(lanePath, {
        taskId: 'task-a',
        repositoryDirectory: root,
        now: '2026-09-10T12:00:02.000Z',
      });
      expect(repeated).toMatchObject({
        taskId: landed.taskId,
        fragmentId: landed.fragmentId,
        version: landed.version,
        changedFiles: landed.changedFiles,
        idempotent: true,
      });
      expect((await readFile(resolve(root, 'src/changelog.ts'), 'utf8')).match(/A visible release note\./g)).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(`${lanePath}.lock`, { force: true });
    }
  });

  it('rejects a release source with more than one current top-level changelog entry', async () => {
    const root = resolve(tmpdir(), `coordination-release-duplicate-${randomUUID()}`);
    const lanePath = resolve(root, 'release-lane.json');
    try {
      await mkdir(resolve(root, 'src'), { recursive: true });
      await writeFile(resolve(root, 'package.json'), '{\n  "version": "0.3.23"\n}\n');
      await writeFile(resolve(root, 'package-lock.json'), '{"packages":{"":{"version":"0.3.23"}}}\n');
      await writeFile(resolve(root, 'src/changelog.ts'), `export const CHANGELOG = [
  { version: APP_VERSION, changes: ['Current one.'] },
  { version: APP_VERSION, changes: ['Current duplicate.'] },
];
`);
      await prepareReleaseFragmentFile(lanePath, {
        taskId: 'duplicate-task',
        worktree: root,
        changes: ['A note.'],
        baseVersion: '0.3.23',
      });

      await expect(applyReleaseFragment(lanePath, {
        taskId: 'duplicate-task',
        repositoryDirectory: root,
      })).rejects.toThrow(/exactly one|duplicate|newest/i);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(`${lanePath}.lock`, { force: true });
    }
  });

  it('requires the current main commit to equal the fragment base before landing', async () => {
    const root = resolve(tmpdir(), `coordination-release-base-sha-${randomUUID()}`);
    const lanePath = resolve(root, 'release-lane.json');
    try {
      await mkdir(resolve(root, 'src'), { recursive: true });
      await writeFile(resolve(root, 'package.json'), '{"version":"0.3.23"}\n');
      await writeFile(resolve(root, 'package-lock.json'), '{"packages":{"":{"version":"0.3.23"}}}\n');
      await writeFile(resolve(root, 'src/changelog.ts'), `export const CHANGELOG = [
  { version: APP_VERSION, changes: ['Current.'] },
];
`);
      await prepareReleaseFragmentFile(lanePath, {
        taskId: 'base-sha-task',
        worktree: root,
        changes: ['A note.'],
        baseVersion: '0.3.23',
        baseMainSha: 'main-a',
      } as never);

      await expect(applyReleaseFragment(lanePath, {
        taskId: 'base-sha-task',
        repositoryDirectory: root,
        currentMainSha: 'main-b',
      } as never)).rejects.toThrow(/main.*base|base.*main|reconcile/i);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(`${lanePath}.lock`, { force: true });
    }
  });
});
