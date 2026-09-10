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
  heartbeatValidationLeaseFile,
  insertReleaseChangelogEntry,
  leaseStatusForEntry,
  markValidationLeaseReleased,
  prepareReleaseFragment,
  prepareReleaseFragmentFile,
  pruneValidationQueue,
  queueValidationLease,
  queueValidationRequest,
  refreshCoordinationLease,
  refreshValidationLease,
  releaseValidationLease,
  releaseValidationLeaseFile,
  validationRequestMode,
  validationPollDelay,
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
  it('backs validation queue polling off within a bounded interval', () => {
    expect(validationPollDelay(100, 1_000)).toBe(200);
    expect(validationPollDelay(200, 1_000)).toBe(400);
    expect(validationPollDelay(800, 1_000)).toBe(1_000);
    expect(validationPollDelay(1_000, 1_000)).toBe(1_000);
  });

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

  it('includes owner lease expiration and confirmation state in the forecast', () => {
    const forecast = forecastCoordinationConflicts({
      activeEntries: [activeEntry()],
      repositoryIdentity: repoIdentity,
      repositoryRoot: repoRoot,
      worktree: '/worktrees/current',
      scopes: ['src/components/RoleSelect.tsx'],
      now: '2026-09-10T12:03:00.000Z',
      leaseMs: 60_000,
    } as never);

    expect(forecast.conflicts[0]).toMatchObject({
      lease: {
        state: 'owner-confirmation-needed',
        ownerConfirmationRequired: true,
        takeoverAllowed: false,
      },
    });
    expect(forecast.conflicts[0]?.lease.expiresAt).toBe('2026-09-10T12:01:00.000Z');
    expect(formatConflictForecast(forecast)).toContain(
      'lease owner-confirmation-needed until 2026-09-10T12:01:00.000Z; owner confirmation required; takeover disabled',
    );
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
    expect(() => markValidationLeaseReleased(second.state, 'not-second', {
      ownerToken: 'not-second-token',
      ownerPid: process.pid,
    } as never)).toThrow(/owner|ticket/i);

    expect(markValidationLeaseReleased(second.state, 'second', {
      ownerToken: second.ticket.ownerToken,
      ownerPid: second.ticket.ownerPid,
    })).toMatchObject({ pending: [] });

    const released = releaseValidationLease(second.state, 'first', {
      now: '2026-09-10T12:00:02.000Z',
      ownerToken: first.ticket.ownerToken,
      ownerPid: first.ticket.ownerPid,
    });
    expect(released.active).toEqual([
      expect.objectContaining({ id: 'second', state: 'active' }),
    ]);
    expect(released.pending).toHaveLength(0);
  });

  it('binds validation lease heartbeat/release to the owner token and PID, pruning only dead PIDs', () => {
    const state = emptyValidationQueueState({ maxConcurrency: 1 });
    const first = enqueueValidation(state, {
      requestId: 'authorized',
      entryId: 'entry-authorized',
      worktree: '/worktrees/authorized',
      kind: 'release',
      ownerToken: 'token-authorized',
      ownerPid: 501,
    });
    const second = enqueueValidation(first.state, {
      requestId: 'queued-live',
      entryId: 'entry-live',
      worktree: '/worktrees/live',
      kind: 'release',
      ownerToken: 'token-live',
      ownerPid: 502,
    });
    const orphan = enqueueValidation(second.state, {
      requestId: 'queued-dead',
      entryId: 'entry-dead',
      worktree: '/worktrees/dead',
      kind: 'release',
      ownerToken: 'token-dead',
      ownerPid: 503,
    });

    expect(() => refreshValidationLease(first.state, 'authorized', {
      ownerToken: 'wrong-token',
      ownerPid: 501,
    } as never)).toThrow(/owner|token/i);
    expect(() => releaseValidationLease(first.state, 'authorized', {
      ownerToken: 'token-authorized',
      ownerPid: 999,
    } as never)).toThrow(/owner|PID|pid/i);
    expect(refreshValidationLease(first.state, 'authorized', {
      ownerToken: 'token-authorized',
      ownerPid: 501,
      now: '2026-09-10T12:00:01.000Z',
    }).active[0]).toMatchObject({
      ownerToken: 'token-authorized',
      ownerPid: 501,
      heartbeatAt: '2026-09-10T12:00:01.000Z',
    });

    const pruned = pruneValidationQueue(orphan.state, (pid) => pid !== 503);
    expect(pruned.active).toHaveLength(1);
    expect(pruned.pending).toEqual([
      expect.objectContaining({ id: 'queued-live', ownerPid: 502 }),
    ]);
    const promoted = releaseValidationLease(pruned, 'authorized', {
      ownerToken: 'token-authorized',
      ownerPid: 501,
    });
    expect(promoted.active).toEqual([
      expect.objectContaining({ id: 'queued-live', state: 'active' }),
    ]);
  });

  it('enforces owner binding through the file queue API and exposes heartbeat/release cleanup', async () => {
    const filePath = resolve(tmpdir(), `coordination-validation-owner-${randomUUID()}.json`);
    try {
      const acquired = await queueValidationLease(filePath, {
        requestId: 'file-ticket',
        entryId: 'entry-file',
        worktree: '/worktrees/file',
        kind: 'release',
        ownerToken: 'file-token',
        ownerPid: process.pid,
      });
      await expect(heartbeatValidationLeaseFile(filePath, 'file-ticket', {
        ownerToken: 'wrong-token',
        ownerPid: process.pid,
      } as never)).rejects.toThrow(/owner|token/i);
      await heartbeatValidationLeaseFile(filePath, 'file-ticket', {
        ownerToken: 'file-token',
        ownerPid: process.pid,
      });
      await expect(releaseValidationLeaseFile(filePath, 'file-ticket', {
        ownerToken: 'wrong-token',
        ownerPid: process.pid,
      } as never)).rejects.toThrow(/owner|token/i);
      await releaseValidationLeaseFile(filePath, 'file-ticket', {
        ownerToken: acquired.ticket.ownerToken,
        ownerPid: acquired.ticket.ownerPid,
      });
    } finally {
      await rm(filePath, { force: true });
      await rm(`${filePath}.lock`, { force: true });
    }
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
        baseMainSha: 'main-a',
      }, { now: '2026-09-10T12:00:00.000Z' });
      expect(await readFile(resolve(root, 'package.json'), 'utf8')).toContain('0.3.23');
      expect(await readFile(resolve(root, 'src/changelog.ts'), 'utf8')).toContain('Previous release.');

      const finalizationChecks: Array<{ version: string; changelogSource: string }> = [];
      const landed = await applyReleaseFragment(lanePath, {
        taskId: 'task-a',
        repositoryDirectory: root,
        now: '2026-09-10T12:00:01.000Z',
        currentMainSha: 'main-a',
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
        currentMainSha: 'main-a',
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
        baseMainSha: 'main-a',
      });

      await expect(applyReleaseFragment(lanePath, {
        taskId: 'duplicate-task',
        repositoryDirectory: root,
        currentMainSha: 'main-a',
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
      await expect(applyReleaseFragment(lanePath, {
        taskId: 'base-sha-task',
        repositoryDirectory: root,
      })).rejects.toThrow(/current main.*commit|main.*SHA|base/i);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(`${lanePath}.lock`, { force: true });
    }
  });

  it('recovers a durable release-finalization journal after a partial publish', async () => {
    const root = resolve(tmpdir(), `coordination-release-recovery-${randomUUID()}`);
    const lanePath = resolve(root, 'release-lane.json');
    try {
      await mkdir(resolve(root, 'src'), { recursive: true });
      const packagePath = resolve(root, 'package.json');
      const lockfilePath = resolve(root, 'package-lock.json');
      const changelogPath = resolve(root, 'src/changelog.ts');
      const originalPackage = '{\n  "name": "fixture",\n  "version": "0.3.23"\n}\n';
      const originalLockfile = '{\n  "packages": {\n    "": { "version": "0.3.23" }\n  }\n}\n';
      const originalChangelog = `export const CHANGELOG = [
  {
    version: APP_VERSION,
    changes: ['Previous release.'],
  },
];
`;
      await writeFile(packagePath, originalPackage);
      await writeFile(lockfilePath, originalLockfile);
      await writeFile(changelogPath, originalChangelog);

      const prepared = prepareReleaseFragment(emptyReleaseLaneState(), {
        taskId: 'recovery-task',
        worktree: root,
        changes: ['Recovered release note.'],
        baseVersion: '0.3.23',
        baseMainSha: 'main-a',
      });
      const allocated = allocateReleaseFragment(prepared.state, {
        taskId: 'recovery-task',
        currentVersion: '0.3.23',
      });
      const nextPackage = `${JSON.stringify({ name: 'fixture', version: '0.3.24' }, null, 2)}\n`;
      const nextLockfile = `${JSON.stringify({ packages: { '': { version: '0.3.24' } } }, null, 2)}\n`;
      const frozenChangelog = originalChangelog.replace(
        'version: APP_VERSION',
        "version: '0.3.23'",
      );
      const nextChangelog = insertReleaseChangelogEntry(
        frozenChangelog,
        allocated.fragment,
        '0.3.24',
      );
      await writeFile(packagePath, nextPackage); // Simulates the first rename before process death.
      await writeFile(lanePath, JSON.stringify({
        ...allocated.state,
        finalization: {
          state: 'finalizing',
          taskId: allocated.fragment.taskId,
          fragmentId: allocated.fragment.id,
          targetVersion: allocated.fragment.version,
          files: [
            { path: packagePath, originalContent: originalPackage, nextContent: nextPackage },
            { path: lockfilePath, originalContent: originalLockfile, nextContent: nextLockfile },
            { path: changelogPath, originalContent: originalChangelog, nextContent: nextChangelog },
          ],
        },
      }));

      const recovered = await applyReleaseFragment(lanePath, {
        taskId: allocated.fragment.taskId,
        repositoryDirectory: root,
        currentMainSha: 'main-a',
      });

      expect(recovered).toMatchObject({
        taskId: 'recovery-task',
        version: '0.3.24',
        idempotent: true,
      });
      expect(await readFile(packagePath, 'utf8')).toBe(nextPackage);
      expect(await readFile(lockfilePath, 'utf8')).toBe(nextLockfile);
      expect(await readFile(changelogPath, 'utf8')).toBe(nextChangelog);
      expect(JSON.parse(await readFile(lanePath, 'utf8'))).not.toHaveProperty('finalization');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(`${lanePath}.lock`, { force: true });
    }
  });
});
