import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  chooseAvailableEmulatorSlot,
  changedFilesBaseRef,
  finishCoordinationEntry,
  claimCoordinationEntry,
  heartbeatCoordinationEntry,
  releaseCoordinationClaim,
  forecastCoordinationConflicts,
  formatConflictForecast,
  formatCoordinationState,
  isPortFree,
  nextApplicationVersion,
  parseCoordinationState,
  pruneOrphanedConfigurations,
  pruneDeadReservations,
  readCoordinationState,
  releaseEmulatorSlot,
  reserveAvailableEmulatorSlot,
  reserveAvailableConfiguredEmulatorSlot,
  reserveConfiguredEmulatorSlot,
  reserveEmulatorSlot,
  validationPlanForFiles,
  deriveCopyOnlyValidationProfile,
  prepareValidationEmulator,
  cleanupValidationEmulator,
  executeValidationProcess,
  validateImplementationPromptClaims,
  validateCoordinationEntry,
  amendCoordinationEntry,
  validateReleaseCompletion,
  normalizeGitHubOriginToSsh,
} from '../../scripts/emulator-resource-registry.mjs';
import * as coordinationRegistry from '../../scripts/emulator-resource-registry.mjs';

const execFileAsync = promisify(execFile);

async function runFixtureGit(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return stdout.trim();
}

type CoordinationConflict = {
  entry: Record<string, unknown>;
  type: 'scope' | 'claim';
  requested: string;
  matched: string;
};

type CoordinationRegistryExtensions = {
  findCoordinationConflict(options: {
    activeEntries: readonly Record<string, unknown>[];
    repositoryIdentity: string;
    repositoryRoot: string;
    worktree: string;
    scopes: readonly string[];
    claims: readonly string[];
  }): CoordinationConflict | undefined;
  formatCoordinationConflict(conflict: CoordinationConflict): string;
};

const coordinationRegistryExtensions =
  coordinationRegistry as unknown as CoordinationRegistryExtensions;
const { findCoordinationConflict, formatCoordinationConflict } =
  coordinationRegistryExtensions;

const codeValidation = {
  commitSha: 'branch-sha',
  completedAt: '2026-09-07T00:05:00.000Z',
  passed: true,
          commands: [
            'git diff --check',
            'npm run validate:implementation-progress',
            'npm run lint',
            'npm run test:all',
            'npm run build',
    'npm run build --prefix functions',
  ],
  files: ['scripts/example.mjs'],
  docsOnly: false,
  reviews: {},
};

const releaseEntry = {
  id: 'release-task',
  worktree: process.cwd(),
  startedAt: '2026-09-07T00:00:00.000Z',
  status: 'active',
  intent: 'land a release',
  versionPlan: 'Reserve application patch version 0.3.3.',
  preemptiveChangelog: 'A player-facing release note.',
  startBranchSha: 'start-sha',
  startMainSha: 'start-main-sha',
  validation: codeValidation,
};

function releaseState(overrides = {}) {
  return {
    branchName: 'fix/release-task',
    branchSha: 'branch-sha',
    startBranchSha: 'start-sha',
    branchBaselineIsAncestor: true,
    mainSha: 'main-sha',
    originMainSha: 'main-sha',
    mainContainsBranch: true,
    worktreeClean: true,
    branchVersion: '0.3.3',
    mainVersion: '0.3.2',
    branchLockVersion: '0.3.3',
    mainLockVersion: '0.3.2',
    branchChangelog: [
      { version: '0.3.3', source: 'new release' },
      { version: '0.3.2', source: 'previous release' },
    ],
    mainChangelog: [
      { version: '0.3.2', source: 'previous release' },
    ],
    changedFiles: ['scripts/example.mjs'],
    ...overrides,
  };
}

describe('local emulator coordination', () => {
  async function currentGitIdentity() {
    return {
      branchName: await runFixtureGit(process.cwd(), ['branch', '--show-current']),
      repositoryRoot: await runFixtureGit(process.cwd(), ['rev-parse', '--show-toplevel']),
      repositoryIdentity: await runFixtureGit(process.cwd(), [
        'rev-parse', '--path-format=absolute', '--git-common-dir',
      ]),
    };
  }

  function amendmentEntry(overrides: Record<string, unknown> = {}) {
    return {
      id: 'amend-owner',
      worktree: process.cwd(),
      status: 'active',
      startedAt: '2099-01-01T00:00:00.000Z',
      heartbeatAt: '2099-01-01T00:00:00.000Z',
      intent: 'amend coordination ownership',
      versionPlan: 'Tooling-only; no application version change.',
      preemptiveChangelog: 'No player-facing change.',
      scopes: ['scripts/emulator-resource-registry.mjs'],
      claims: ['coordination-scope-amendment'],
      ...overrides,
    };
  }

  it('allows the active owner to append normalized scopes and claims with an audit event', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-amend-${randomUUID()}.json`);
    const identity = await currentGitIdentity();
    const entry = { ...amendmentEntry(), ...identity };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      const amended = await amendCoordinationEntry(filePath, {
        id: entry.id,
        scope: './src\\config\\emulatorResourceRegistry.test.ts/',
        claims: 'Implementation-Dependencies-Prompt-122, implementation-dependencies-prompt-122',
      });

      expect(amended).toMatchObject({
        id: entry.id,
        scopes: [
          'scripts/emulator-resource-registry.mjs',
          'src/config/emulatorResourceRegistry.test.ts',
        ],
        claims: ['coordination-scope-amendment', 'implementation-dependencies-prompt-122'],
      });
      expect(amended.amendments).toEqual([expect.objectContaining({
        scopes: ['src/config/emulatorResourceRegistry.test.ts'],
        claims: ['implementation-dependencies-prompt-122'],
        branchName: identity.branchName,
        worktree: process.cwd(),
      })]);
      expect(amended.startBranchSha).toBeUndefined();
      expect(amended.versionPlan).toBe(entry.versionPlan);
      expect(amended.preemptiveChangelog).toBe(entry.preemptiveChangelog);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('registers intent without taking scopes or claims until an explicit just-in-time claim', async () => {
    const rootPath = resolve(tmpdir(), `den-of-wolves-coordination-intent-${randomUUID()}`);
    const originPath = `${rootPath}.origin.git`;
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-intent-${randomUUID()}.json`);
    const scriptPath = resolve(process.cwd(), 'scripts/emulator-resource-registry.mjs');
    try {
      await mkdir(rootPath, { recursive: true });
      await runFixtureGit(rootPath, ['init', '-b', 'main']);
      await runFixtureGit(rootPath, ['config', 'user.email', 'fixture@example.test']);
      await runFixtureGit(rootPath, ['config', 'user.name', 'Fixture']);
      await writeFile(resolve(rootPath, 'README.md'), 'fixture\n');
      await runFixtureGit(rootPath, ['add', 'README.md']);
      await runFixtureGit(rootPath, ['commit', '-m', 'fixture']);
      await runFixtureGit(rootPath, ['switch', '-c', 'feature/intent']);
      await runFixtureGit(rootPath, ['init', '--bare', originPath]);
      await runFixtureGit(rootPath, ['remote', 'add', 'origin', originPath]);

      await execFileAsync(process.execPath, [
        scriptPath,
        'begin',
        '--intent', 'prepare a feature release',
        '--version-plan', 'release lane allocates the next version',
        '--preemptive-changelog', 'A visible feature note.',
        '--work-type', 'product',
        '--implementation-prompt', '055',
        '--scope', 'src/components',
        '--claims', 'release-metadata',
      ], {
        cwd: rootPath,
        env: { ...process.env, CODEX_COORDINATION_FILE: filePath },
        encoding: 'utf8',
      });

      const state = JSON.parse(await readFile(filePath, 'utf8'));
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0]).toMatchObject({
        status: 'active',
        scopes: [],
        claims: [],
        requestedScopes: ['src/components'],
        requestedClaims: ['release-metadata'],
      });
    } finally {
      await rm(rootPath, { recursive: true, force: true });
      await rm(originPath, { recursive: true, force: true });
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  }, 15_000);

  it('claims, heartbeats, and explicitly releases exact ownership without allowing takeover', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-claim-${randomUUID()}.json`);
    const identity = await currentGitIdentity();
    const now = '2099-01-01T00:00:00.000Z';
    const entry = {
      ...amendmentEntry({
        id: 'jit-owner',
        scopes: [],
        claims: [],
        heartbeatAt: now,
        startedAt: now,
      }),
      ...identity,
    };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      const claimed = await claimCoordinationEntry(filePath, {
        id: entry.id,
        scope: 'src/config/emulatorResourceRegistry.test.ts',
        claims: 'coordination-leaf',
        now,
      });
      expect(claimed).toMatchObject({
        status: 'active',
        scopes: ['src/config/emulatorResourceRegistry.test.ts'],
        claims: ['coordination-leaf'],
      });

      const heartbeat = await heartbeatCoordinationEntry(filePath, {
        id: entry.id,
        now: '2099-01-01T00:00:01.000Z',
        leaseMs: 60_000,
      });
      expect(heartbeat).toMatchObject({
        status: 'active',
        heartbeatAt: '2099-01-01T00:00:01.000Z',
        lease: { takeoverAllowed: false, ownerConfirmationRequired: false },
      });

      const released = await releaseCoordinationClaim(filePath, {
        id: entry.id,
        scope: 'src/config/emulatorResourceRegistry.test.ts',
        claims: 'coordination-leaf',
        now: '2099-01-01T00:00:02.000Z',
      });
      expect(released).toMatchObject({ status: 'active', scopes: [], claims: [] });
      expect(released.claimReleases).toEqual([expect.objectContaining({
        scopes: ['src/config/emulatorResourceRegistry.test.ts'],
        claims: ['coordination-leaf'],
      })]);
      expect((await readCoordinationState(filePath)).entries[0]).toMatchObject({
        status: 'active',
        scopes: [],
        claims: [],
      });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('keeps an expired owner claim blocking and requires owner confirmation before release', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-expired-claim-${randomUUID()}.json`);
    const identity = await currentGitIdentity();
    const entry = {
      ...amendmentEntry({
        id: 'expired-owner',
        scopes: ['src/config'],
        claims: ['coordination-expired'],
        heartbeatAt: '2099-01-01T00:00:00.000Z',
        startedAt: '2099-01-01T00:00:00.000Z',
      }),
      ...identity,
    };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(releaseCoordinationClaim(filePath, {
        id: entry.id,
        claims: 'coordination-expired',
        now: '2099-01-01T00:02:00.000Z',
        leaseMs: 60_000,
      })).rejects.toThrow(/owner confirmation|required.*heartbeat/i);
      expect((await readCoordinationState(filePath)).entries[0]).toMatchObject({
        status: 'active',
        claims: ['coordination-expired'],
      });

      const forecast = forecastCoordinationConflicts({
        activeEntries: [entry],
        repositoryIdentity: identity.repositoryIdentity,
        repositoryRoot: identity.repositoryRoot,
        worktree: '/other/worktree',
        scopes: ['src/config/emulatorResourceRegistry.test.ts'],
        claims: ['coordination-expired'],
      });
      expect(forecast.blocked).toBe(true);
      expect(formatConflictForecast(forecast)).toContain('shared claim remains exclusive');
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('rejects an amendment from an expired owner until the owner heartbeats', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-expired-amend-${randomUUID()}.json`);
    const identity = await currentGitIdentity();
    const entry = {
      ...amendmentEntry({
        id: 'expired-amend-owner',
        heartbeatAt: '2099-01-01T00:00:00.000Z',
      }),
      ...identity,
    };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(amendCoordinationEntry(filePath, {
        id: entry.id,
        scope: 'src/config',
        now: '2099-01-01T00:02:00.000Z',
        leaseMs: 60_000,
      })).rejects.toThrow(/owner confirmation|required.*heartbeat/i);
      expect((await readCoordinationState(filePath)).entries[0]).toMatchObject({
        scopes: entry.scopes,
        claims: entry.claims,
      });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('exposes active-entry amendments through the package command surface', async () => {
    const packageMetadata = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(packageMetadata.scripts?.['coordination:amend'])
      .toBe('node scripts/emulator-resource-registry.mjs amend');
  });

  it('rejects an amendment that conflicts with another active owner and leaves both entries unchanged', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-amend-conflict-${randomUUID()}.json`);
    const identity = await currentGitIdentity();
    const owner = { ...amendmentEntry(), ...identity };
    const other = {
      ...amendmentEntry({
        id: 'other-owner',
        worktree: '/other/worktree',
        claims: ['exclusive-new-claim'],
      }),
      ...identity,
    };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [owner, other],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(amendCoordinationEntry(filePath, {
        id: owner.id,
        claims: 'exclusive-new-claim',
      })).rejects.toThrow(
        new RegExp(`exclusive-new-claim.*${other.id}.*${other.worktree}`),
      );
      const state = await readCoordinationState(filePath);
      expect(state.entries).toEqual([owner, other]);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('rejects unknown, foreign, and mismatched-branch entries', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-amend-owner-${randomUUID()}.json`);
    const identity = await currentGitIdentity();
    const foreign = {
      ...amendmentEntry({ id: 'foreign-owner', worktree: '/foreign/worktree' }),
      ...identity,
    };
    const mismatched = {
      ...amendmentEntry({ id: 'mismatched-branch' }),
      ...identity,
      branchName: 'other/branch',
    };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [foreign, mismatched],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(amendCoordinationEntry(filePath, {
        id: 'missing-owner',
        scope: 'src/config',
      })).rejects.toThrow(/No coordination entry found/);
      await expect(amendCoordinationEntry(filePath, {
        id: foreign.id,
        scope: 'src/config',
      })).rejects.toThrow(/belongs to \/foreign\/worktree/);
      await expect(amendCoordinationEntry(filePath, {
        id: mismatched.id,
        scope: 'src/config',
      })).rejects.toThrow(/branch .* does not match/);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('rejects terminal and duplicate or no-op amendments without mutating the entry', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-coordination-amend-terminal-${randomUUID()}.json`);
    const identity = await currentGitIdentity();
    const terminal = { ...amendmentEntry({ id: 'terminal-owner', status: 'complete' }), ...identity };
    const active = { ...amendmentEntry({ id: 'duplicate-owner' }), ...identity };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [terminal, active],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(amendCoordinationEntry(filePath, {
        id: terminal.id,
        scope: 'src/config',
      })).rejects.toThrow(/already complete/);
      await expect(amendCoordinationEntry(filePath, {
        id: active.id,
        scope: './scripts/emulator-resource-registry.mjs',
        claims: 'COORDINATION-SCOPE-AMENDMENT',
      })).rejects.toThrow(/already declared|no new/i);
      await expect(amendCoordinationEntry(filePath, {
        id: active.id,
      })).rejects.toThrow(/scope.*claims.*value/);
      const state = await readCoordinationState(filePath);
      expect(state.entries).toEqual([terminal, active]);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('rejects overlapping scopes across worktrees in the same Git repository', () => {
    const owner = {
      id: 'prompt-662',
      worktree: '/worktrees/prompt-662',
      repositoryRoot: '/repo',
      repositoryIdentity: '/repo/.git',
      status: 'active',
      scopes: ['docs'],
      claims: ['implementation-plan'],
    };

    expect(findCoordinationConflict({
      activeEntries: [owner],
      repositoryIdentity: '/repo/.git',
      repositoryRoot: '/repo',
      worktree: '/worktrees/current',
      scopes: ['docs/WORKTREE_COORDINATION.md'],
      claims: [],
    })).toMatchObject({
      entry: owner,
      type: 'scope',
      requested: 'docs/WORKTREE_COORDINATION.md',
      matched: 'docs',
    });
  });

  it('rejects exact claims across worktrees in the same Git repository', () => {
    const owner = {
      id: 'claim-owner',
      worktree: '/worktrees/owner',
      repositoryRoot: '/repo',
      repositoryIdentity: '/repo/.git',
      status: 'active',
      scopes: ['scripts'],
      claims: ['coordination-worktree-identity'],
    };

    expect(findCoordinationConflict({
      activeEntries: [owner],
      repositoryIdentity: '/repo/.git',
      repositoryRoot: '/repo',
      worktree: '/worktrees/current',
      scopes: ['src/config'],
      claims: ['coordination-worktree-identity'],
    })).toMatchObject({
      entry: owner,
      type: 'claim',
      requested: 'coordination-worktree-identity',
      matched: 'coordination-worktree-identity',
    });
  });

  it('allows disjoint same-repository scopes and identical scopes in another repository', () => {
    const owner = {
      id: 'other-owner',
      worktree: '/worktrees/other',
      repositoryRoot: '/repo',
      repositoryIdentity: '/repo/.git',
      status: 'active',
      scopes: ['docs'],
      claims: ['same-repo-only'],
    };

    expect(findCoordinationConflict({
      activeEntries: [owner],
      repositoryIdentity: '/repo/.git',
      repositoryRoot: '/repo',
      worktree: '/worktrees/current',
      scopes: ['scripts'],
      claims: ['different-claim'],
    })).toBeUndefined();
    expect(findCoordinationConflict({
      activeEntries: [owner],
      repositoryIdentity: '/another-repo/.git',
      repositoryRoot: '/another-repo',
      worktree: '/worktrees/another-repo',
      scopes: ['docs'],
      claims: ['same-repo-only'],
    })).toBeUndefined();
  });

  it('uses repositoryRoot as the compatibility identity for legacy active entries', () => {
    expect(findCoordinationConflict({
      activeEntries: [{
        id: 'legacy-owner',
        worktree: '/worktrees/legacy',
        repositoryRoot: '/repo',
        status: 'active',
        scopes: ['scripts'],
        claims: ['legacy-claim'],
      }],
      repositoryIdentity: '/repo/.git',
      repositoryRoot: '/repo',
      worktree: '/worktrees/current',
      scopes: [],
      claims: ['legacy-claim'],
    })).toMatchObject({ type: 'claim', matched: 'legacy-claim' });
  });

  it('formats ownership conflicts with the owner entry, worktree, and matched field', () => {
    expect(formatCoordinationConflict({
      entry: {
        id: 'owner-entry',
        worktree: '/worktrees/owner',
      },
      type: 'scope',
      requested: 'src/config/emulatorResourceRegistry.test.ts',
      matched: 'src/config',
    })).toBe(
      'Declared scope "src/config/emulatorResourceRegistry.test.ts" overlaps active entry ' +
      'owner-entry at /worktrees/owner (matched scope "src/config"). ' +
      'Coordinate ownership before starting.',
    );
  });

  it('normalizes GitHub HTTPS origins to SSH without changing other transports', () => {
    expect(normalizeGitHubOriginToSsh(
      'https://github.com/emerald-pham/den-of-wolves-new-eden-console.git',
    )).toBe('git@github.com:emerald-pham/den-of-wolves-new-eden-console.git');
    expect(normalizeGitHubOriginToSsh(
      'git@github.com:emerald-pham/den-of-wolves-new-eden-console.git',
    )).toBe('git@github.com:emerald-pham/den-of-wolves-new-eden-console.git');
    expect(normalizeGitHubOriginToSsh('https://gitlab.com/example/project.git'))
      .toBe('https://gitlab.com/example/project.git');
  });

  it('retains the task baseline when evaluating changed files after merge', () => {
    expect(changedFilesBaseRef({
      mainSha: 'main-sha',
      startBranchSha: 'start-sha',
      mainContainsBranch: true,
    })).toBe('start-sha');
    const postMergeBaseline = {
      mainSha: 'merged-main-sha',
      startBranchSha: 'task-start-sha',
      mainContainsBranch: true,
      validatedBaseSha: 'pre-merge-main-sha',
      validatedBaseIsAncestorOfMain: true,
    } as Parameters<typeof changedFilesBaseRef>[0] & {
      validatedBaseSha: string;
      validatedBaseIsAncestorOfMain: boolean;
    };
    expect(changedFilesBaseRef(postMergeBaseline)).toBe('pre-merge-main-sha');
    const stalePostMergeBaseline = {
      ...postMergeBaseline,
      validatedBaseIsAncestorOfMain: false,
    } as Parameters<typeof changedFilesBaseRef>[0] & {
      validatedBaseSha: string;
      validatedBaseIsAncestorOfMain: boolean;
    };
    expect(changedFilesBaseRef(stalePostMergeBaseline)).toBe('task-start-sha');
    expect(changedFilesBaseRef({
      mainSha: 'main-sha',
      startBranchSha: 'start-sha',
      mainContainsBranch: false,
    })).toBe('main-sha');
  });

  it('keeps distinct base and lettered prompt claims independent', () => {
    expect(validateImplementationPromptClaims([
      { id: 'base-agent', status: 'active', implementationPrompt: '598' },
      { id: 'lettered-agent', status: 'active', implementationPrompt: '598a' },
    ])).toEqual(new Map([
      ['598', 'base-agent'],
      ['598a', 'lettered-agent'],
    ]));
  });

  it('rejects duplicate active prompt claims after normalization', () => {
    expect(() => validateImplementationPromptClaims([
      { id: 'first-agent', status: 'active', implementationPrompt: 598 },
      { id: 'second-agent', status: 'active', implementationPrompt: '598' },
    ])).toThrow(/Prompt 598 is already claimed by first-agent/);
  });

  it('keeps a reservation while either its wrapper or child process remains alive', () => {
    const state = {
      ...parseCoordinationState(JSON.stringify({ entries: [], reservations: [{
        slot: 4, worktree: '/worktrees/current', kind: 'rules', pid: 101,
        childPid: 202, command: 'rules', claimedAt: 'now',
      }], configurations: [] })),
    };

    expect(pruneDeadReservations(state, (pid) => pid === 202).reservations).toHaveLength(1);
    expect(pruneDeadReservations(state, () => false).reservations).toHaveLength(0);
  });
  it('routes rules tests to another slot when the preview owns the preferred slot', () => {
    expect(
      chooseAvailableEmulatorSlot({
        preferredSlot: 4,
        availableSlots: [4, 5],
        worktree: '/worktrees/current',
        kind: 'rules',
        reservations: [
          {
            slot: 4,
            worktree: '/worktrees/current',
            kind: 'emulators',
            pid: 123,
            command: 'npm run emulators',
            claimedAt: '2026-09-06T20:00:00.000Z',
          },
        ],
      }),
    ).toBe(5);
  });

  it('keeps an entire slot isolated from a different worktree', () => {
    expect(
      chooseAvailableEmulatorSlot({
        preferredSlot: 4,
        availableSlots: [4, 5],
        worktree: '/worktrees/current',
        kind: 'vite',
        reservations: [
          {
            slot: 4,
            worktree: '/worktrees/other',
            kind: 'rules',
            pid: 456,
            command: 'npm run test:rules',
            claimedAt: '2026-09-06T20:00:00.000Z',
          },
        ],
      }),
    ).toBe(5);
  });

  it('allows the preview web server to share its own worktree slot', () => {
    expect(
      chooseAvailableEmulatorSlot({
        preferredSlot: 4,
        availableSlots: [4, 5],
        worktree: '/worktrees/current',
        kind: 'vite',
        reservations: [
          {
            slot: 4,
            worktree: '/worktrees/current',
            kind: 'emulators',
            pid: 123,
            command: 'npm run emulators',
            claimedAt: '2026-09-06T20:00:00.000Z',
          },
        ],
      }),
    ).toBe(4);
  });

  it('prints version agreement and preemptive changelog fields for other agents', () => {
    const output = formatCoordinationState({
      version: 1,
      versionAgreement: 'Increment the patch version for each completed product fix.',
      entries: [
        {
          id: 'task-1',
          worktree: '/worktrees/current',
          pid: 123,
          startedAt: '2026-09-06T20:00:00.000Z',
          intent: 'Prevent rules emulator port collisions.',
          versionPlan: '0.2.59 -> 0.2.60 if player-facing.',
          preemptiveChangelog: 'Rules validation remains reliable during preview.',
          resources: ['emulator-slot-4'],
        },
      ],
      reservations: [],
      configurations: [],
    });

    expect(output).toContain('Version agreement');
    expect(output).toContain('Prevent rules emulator port collisions.');
    expect(output).toContain('Rules validation remains reliable during preview.');
    expect(output).toContain(
      'Configured worktree slots (reserved; unavailable to other worktrees)',
    );
    expect(output).toContain('Live emulator reservations');
  });

  it('reports free isolated emulator slots instead of implying one shared emulator', () => {
    const output = formatCoordinationState({
      version: 1,
      versionAgreement: 'agreement',
      entries: [],
      reservations: [
        {
          slot: 3,
          worktree: '/worktrees/live',
          kind: 'emulators',
          pid: 456,
          command: 'npm run emulators',
          claimedAt: '2026-09-06T20:00:00.000Z',
        },
      ],
      configurations: [
        {
          id: 'configured-slot',
          slot: 1,
          worktree: '/worktrees/configured',
          configuredAt: '2026-09-06T20:00:00.000Z',
        },
      ],
    });

    expect(output).toContain('15 isolated emulator slots');
    expect(output).toContain('available slots: 0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14');
    expect(output).toContain('occupied slots: 1, 3');
    expect(output).toContain('npm run emulators:configure -- auto');
  });

  it('keeps default status focused on active work while retaining opt-in history', () => {
    const state = {
      version: 1,
      versionAgreement: 'agreement',
      entries: [
        {
          id: 'active-task',
          worktree: '/worktrees/active',
          startedAt: '2026-09-07T00:00:00.000Z',
          status: 'active',
          intent: 'Current coordination work.',
          versionPlan: 'tooling-only',
          preemptiveChangelog: 'none',
        },
        {
          id: 'complete-task',
          worktree: '/worktrees/complete',
          startedAt: '2026-09-06T00:00:00.000Z',
          status: 'complete',
          intent: 'Historical coordination work.',
          versionPlan: 'tooling-only',
          preemptiveChangelog: 'none',
        },
      ],
      reservations: [],
      configurations: [],
    };

    const activeOutput = formatCoordinationState(state);
    expect(activeOutput).toContain('Current coordination work.');
    expect(activeOutput).not.toContain('Historical coordination work.');
    expect(activeOutput).toContain('1 completed entry hidden');
    expect(formatCoordinationState(state, { includeHistory: true }))
      .toContain('Historical coordination work.');
  });

  it('derives the documented validation plan from changed files', () => {
    expect(validationPlanForFiles(['README.md', 'docs/WORKTREE_COORDINATION.md'])).toEqual({
      documentationOnly: true,
      requiresDocumentationReview: true,
      requiresVisualReview: false,
      commands: ['git diff --check', 'npm run coordination:docs'],
    });
    expect(validationPlanForFiles(['src/routes/ShipConsole.tsx'])).toEqual({
      documentationOnly: false,
      requiresDocumentationReview: false,
      requiresVisualReview: true,
  commands: [
    'git diff --check',
    'npm run validate:implementation-progress',
    'npm run lint',
        'npm run test:all',
        'npm run build',
        'npm run build --prefix functions',
      ],
    });
    expect(validationPlanForFiles(['CLAUDE.md', 'scripts/release.mjs']).commands).toContain(
      'npm run coordination:docs',
    );
  });

  it('fails closed for uncertain copy-only diffs and derives a bounded focused plan', () => {
    const before = `export function RoleSelect() { return <p aria-label="Old status">Old status</p>; }\n`;
    const after = `export function RoleSelect() { return <p aria-label="New status">New status</p>; }\n`;
    const copyDiff = [
      'diff --git a/src/components/RoleSelect.tsx b/src/components/RoleSelect.tsx',
      '@@ -1 +1 @@',
      '-export function RoleSelect() { return <p aria-label="Old status">Old status</p>; }',
      '+export function RoleSelect() { return <p aria-label="New status">New status</p>; }',
      'diff --git a/src/components/RoleSelect.test.tsx b/src/components/RoleSelect.test.tsx',
      '@@ -1 +1 @@',
      '-expect(screen.getByLabelText("Old status")).toBeInTheDocument();',
      '+expect(screen.getByLabelText("New status")).toBeInTheDocument();',
    ].join('\n');

    expect(deriveCopyOnlyValidationProfile({
      changedFiles: ['src/components/RoleSelect.tsx', 'src/components/RoleSelect.test.tsx'],
      diffText: copyDiff,
      sources: {
        'src/components/RoleSelect.tsx': { before, after },
        'src/components/RoleSelect.test.tsx': {
          before: 'expect(screen.getByLabelText("Old status")).toBeInTheDocument();\n',
          after: 'expect(screen.getByLabelText("New status")).toBeInTheDocument();\n',
        },
      },
    })).toMatchObject({
      kind: 'copy-only',
      commands: expect.arrayContaining([
        'npm test -- --run src/components/RoleSelect.test.tsx',
        'npm run lint',
        'npm run build',
      ]),
    });

    expect(deriveCopyOnlyValidationProfile({
      changedFiles: ['src/components/RoleSelect.tsx', 'src/components/RoleSelect.test.tsx'],
      diffText: copyDiff.replace('aria-label="Old status"', 'role="alert"'),
      sources: {
        'src/components/RoleSelect.tsx': { before, after: after.replace('aria-label="New status"', 'role="alert"') },
        'src/components/RoleSelect.test.tsx': {
          before: 'expect(screen.getByLabelText("Old status")).toBeInTheDocument();\n',
          after: 'expect(screen.getByLabelText("New status")).toBeInTheDocument();\n',
        },
      },
    })).toMatchObject({ kind: 'full', reason: expect.stringMatching(/ARIA|structure|allowlist/i) });
  });

  it('fails closed when committed diff evidence is missing or the test is not a companion', () => {
    const before = `export function RoleSelect() { return <p>Old status</p>; }\n`;
    const after = `export function RoleSelect() { return <p>New status</p>; }\n`;
    const sources = {
      'src/components/RoleSelect.tsx': { before, after },
      'src/components/RoleSelect.test.tsx': {
        before: 'expect(screen.getByText("Old status")).toBeInTheDocument();\n',
        after: 'expect(screen.getByText("New status")).toBeInTheDocument();\n',
      },
    };

    expect(deriveCopyOnlyValidationProfile({
      changedFiles: Object.keys(sources),
      diffText: '',
      sources,
    })).toMatchObject({ kind: 'full' });

    expect(deriveCopyOnlyValidationProfile({
      changedFiles: ['src/components/RoleSelect.tsx', 'src/components/Other.test.tsx'],
      diffText: [
        'diff --git a/src/components/RoleSelect.tsx b/src/components/RoleSelect.tsx',
        '@@ -1 +1 @@',
        '-export function RoleSelect() { return <p>Old status</p>; }',
        '+export function RoleSelect() { return <p>New status</p>; }',
        'diff --git a/src/components/Other.test.tsx b/src/components/Other.test.tsx',
        '@@ -1 +1 @@',
        '-expect(screen.getByText("Old status")).toBeInTheDocument();',
        '+expect(screen.getByText("New status")).toBeInTheDocument();',
      ].join('\n'),
      sources: {
        ...sources,
        'src/components/Other.test.tsx': sources['src/components/RoleSelect.test.tsx'],
      },
    })).toMatchObject({ kind: 'full' });
  });

  it('rejects application-root copy and test import changes from the fast path', () => {
    const appSources = {
      'src/App.tsx': {
        before: 'export function App() { return <p>Old status</p>; }\n',
        after: 'export function App() { return <p>New status</p>; }\n',
      },
      'src/App.test.tsx': {
        before: 'expect(screen.getByText("Old status")).toBeInTheDocument();\n',
        after: 'expect(screen.getByText("New status")).toBeInTheDocument();\n',
      },
    };
    expect(deriveCopyOnlyValidationProfile({
      changedFiles: Object.keys(appSources),
      diffText: [
        'diff --git a/src/App.tsx b/src/App.tsx',
        '@@ -1 +1 @@',
        '-export function App() { return <p>Old status</p>; }',
        '+export function App() { return <p>New status</p>; }',
        'diff --git a/src/App.test.tsx b/src/App.test.tsx',
        '@@ -1 +1 @@',
        '-expect(screen.getByText("Old status")).toBeInTheDocument();',
        '+expect(screen.getByText("New status")).toBeInTheDocument();',
      ].join('\n'),
      sources: appSources,
    })).toMatchObject({ kind: 'full' });

    const sourceFiles = {
      'src/components/RoleSelect.tsx': {
        before: 'export function RoleSelect() { return <p>Old status</p>; }\n',
        after: 'export function RoleSelect() { return <p>New status</p>; }\n',
      },
      'src/components/RoleSelect.test.tsx': {
        before: 'vi.mock("old-module"); expect(screen.getByText("Old status")).toBeInTheDocument();\n',
        after: 'vi.mock("new-module"); expect(screen.getByText("New status")).toBeInTheDocument();\n',
      },
    };
    expect(deriveCopyOnlyValidationProfile({
      changedFiles: Object.keys(sourceFiles),
      diffText: [
        'diff --git a/src/components/RoleSelect.tsx b/src/components/RoleSelect.tsx',
        '@@ -1 +1 @@',
        '-export function RoleSelect() { return <p>Old status</p>; }',
        '+export function RoleSelect() { return <p>New status</p>; }',
        'diff --git a/src/components/RoleSelect.test.tsx b/src/components/RoleSelect.test.tsx',
        '@@ -1 +1 @@',
        '-vi.mock("old-module"); expect(screen.getByText("Old status")).toBeInTheDocument();',
        '+vi.mock("new-module"); expect(screen.getByText("New status")).toBeInTheDocument();',
      ].join('\n'),
      sources: sourceFiles,
    })).toMatchObject({ kind: 'full' });
  });

  it('prepares and cleans only the emulator config it created', async () => {
    const root = resolve(tmpdir(), `den-of-wolves-auto-validation-${randomUUID()}`);
    const configurationPath = resolve(root, 'firebase.local.json');
    const environmentPath = resolve(root, '.env.emulators.local');
    const filePath = resolve(tmpdir(), `den-of-wolves-auto-validation-${randomUUID()}.json`);
    const configuration = {
      id: 'configuration-owned', slot: 3, worktree: root,
      configuredAt: '2026-09-09T00:00:00.000Z', ports: [5031],
    };
    const released: unknown[] = [];
    try {
      const prepared = await prepareValidationEmulator({
        repositoryDirectory: root,
        coordinationPath: filePath,
        localFirebaseConfigPath: configurationPath,
        localEnvironmentPath: environmentPath,
        reserve: async () => configuration,
        release: async () => undefined,
        baseConfig: { emulators: {} },
        configForSlot: () => ({ emulators: { firestore: { port: 5031 } } }),
        environmentForSlot: () => ({ VITE_USE_EMULATORS: '1' }),
      });
      expect(prepared).toMatchObject({
        created: true,
        configurationId: 'configuration-owned',
        slot: 3,
      });
      await writeFile(configurationPath, 'replacement-owned-by-another-process');
      await cleanupValidationEmulator(prepared, {
        release: async (ownedConfiguration: typeof configuration) => { released.push(ownedConfiguration); },
        localFirebaseConfigPath: configurationPath,
        localEnvironmentPath: environmentPath,
        replaceFile: async (path: string, content: string) => writeFile(path, content),
      });
      expect(await readFile(configurationPath, 'utf8')).toBe('replacement-owned-by-another-process');
      expect(await readFile(environmentPath).catch(() => undefined)).toBeUndefined();
      expect(released).toEqual([configuration]);

      await writeFile(configurationPath, 'pre-existing');
      const preserved = await prepareValidationEmulator({
        repositoryDirectory: root,
        coordinationPath: filePath,
        localFirebaseConfigPath: configurationPath,
        localEnvironmentPath: environmentPath,
        reserve: async () => { throw new Error('must not allocate with existing config'); },
      });
      expect(preserved.created).toBe(false);
      expect(await readFile(configurationPath, 'utf8')).toBe('pre-existing');

      const failureRoot = resolve(tmpdir(), `den-of-wolves-auto-validation-failure-${randomUUID()}`);
      const failureConfig = resolve(failureRoot, 'firebase.local.json');
      const failureEnvironment = resolve(failureRoot, '.env.emulators.local');
      const failureFilePath = resolve(tmpdir(), `den-of-wolves-auto-validation-failure-${randomUUID()}.json`);
      const failedReleases: unknown[] = [];
      await expect(prepareValidationEmulator({
        repositoryDirectory: failureRoot,
        coordinationPath: failureFilePath,
        localFirebaseConfigPath: failureConfig,
        localEnvironmentPath: failureEnvironment,
        reserve: async () => ({ ...configuration, worktree: failureRoot }),
        release: async (ownedConfiguration: typeof configuration) => { failedReleases.push(ownedConfiguration); },
        baseConfig: { emulators: {} },
        configForSlot: () => { throw new Error('invalid base config'); },
      })).rejects.toThrow('invalid base config');
      expect(failedReleases).toHaveLength(1);
      expect(await readFile(failureConfig).catch(() => undefined)).toBeUndefined();
      expect(await readFile(failureEnvironment).catch(() => undefined)).toBeUndefined();
    } finally {
      await unlink(configurationPath).catch(() => undefined);
      await unlink(environmentPath).catch(() => undefined);
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('preserves a pre-existing environment file when it creates only the missing config', async () => {
    const root = resolve(tmpdir(), `den-of-wolves-auto-validation-env-${randomUUID()}`);
    const configurationPath = resolve(root, 'firebase.local.json');
    const environmentPath = resolve(root, '.env.emulators.local');
    const filePath = resolve(tmpdir(), `den-of-wolves-auto-validation-env-${randomUUID()}.json`);
    const configuration = {
      id: 'configuration-owned-env', slot: 3, worktree: root,
      configuredAt: '2026-09-09T00:00:00.000Z', ports: [5031],
    };
    const existingEnvironment = 'VITE_USE_EMULATORS=1\n';
    try {
      await mkdir(root, { recursive: true });
      await writeFile(environmentPath, existingEnvironment, 'utf8');
      const prepared = await prepareValidationEmulator({
        repositoryDirectory: root,
        coordinationPath: filePath,
        localFirebaseConfigPath: configurationPath,
        localEnvironmentPath: environmentPath,
        reserve: async () => configuration,
        release: async () => undefined,
        baseConfig: { emulators: {} },
        configForSlot: () => ({ emulators: { firestore: { port: 5031 } } }),
        environmentForSlot: () => ({ VITE_USE_EMULATORS: '1' }),
      });

      expect(prepared.created).toBe(true);
      expect(await readFile(environmentPath, 'utf8')).toBe(existingEnvironment);
      await cleanupValidationEmulator(prepared, { release: async () => undefined });
      expect(await readFile(environmentPath, 'utf8')).toBe(existingEnvironment);
      expect(await readFile(configurationPath).catch(() => undefined)).toBeUndefined();
    } finally {
      await unlink(configurationPath).catch(() => undefined);
      await unlink(environmentPath).catch(() => undefined);
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('preserves a same-content replacement made after setup', async () => {
    const root = resolve(tmpdir(), `den-of-wolves-auto-validation-identity-${randomUUID()}`);
    const configurationPath = resolve(root, 'firebase.local.json');
    const environmentPath = resolve(root, '.env.emulators.local');
    const filePath = resolve(tmpdir(), `den-of-wolves-auto-validation-identity-${randomUUID()}.json`);
    const configuration = {
      id: 'configuration-owned-identity', slot: 3, worktree: root,
      configuredAt: '2026-09-09T00:00:00.000Z', ports: [5031],
    };
    try {
      const prepared = await prepareValidationEmulator({
        repositoryDirectory: root,
        coordinationPath: filePath,
        localFirebaseConfigPath: configurationPath,
        localEnvironmentPath: environmentPath,
        reserve: async () => configuration,
        release: async () => undefined,
        baseConfig: { emulators: {} },
        configForSlot: () => ({ emulators: { firestore: { port: 5031 } } }),
        environmentForSlot: () => ({ VITE_USE_EMULATORS: '1' }),
      });
      const generatedConfig = await readFile(configurationPath, 'utf8');
      await writeFile(configurationPath, generatedConfig, 'utf8');
      await chmod(configurationPath, 0o640);

      await cleanupValidationEmulator(prepared, { release: async () => undefined });
      expect(await readFile(configurationPath, 'utf8')).toBe(generatedConfig);
    } finally {
      await unlink(configurationPath).catch(() => undefined);
      await unlink(environmentPath).catch(() => undefined);
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('serializes concurrent same-worktree setup without clobbering or partial JSON', async () => {
    const root = resolve(tmpdir(), `den-of-wolves-auto-validation-concurrent-${randomUUID()}`);
    const configurationPath = resolve(root, 'firebase.local.json');
    const environmentPath = resolve(root, '.env.emulators.local');
    const filePath = resolve(tmpdir(), `den-of-wolves-auto-validation-concurrent-${randomUUID()}.json`);
    const configuration = {
      id: 'configuration-concurrent', slot: 3, worktree: root,
      configuredAt: '2026-09-09T00:00:00.000Z', ports: [5031],
    };
    let allocations = 0;
    const options = {
      repositoryDirectory: root,
      coordinationPath: filePath,
      localFirebaseConfigPath: configurationPath,
      localEnvironmentPath: environmentPath,
      reserve: async () => { allocations += 1; return configuration; },
      release: async () => undefined,
      baseConfig: { emulators: {} },
      configForSlot: () => ({ emulators: { firestore: { port: 5031 } } }),
      environmentForSlot: () => ({ VITE_USE_EMULATORS: '1' }),
    };
    try {
      const prepared = await Promise.all([
        prepareValidationEmulator(options),
        prepareValidationEmulator(options),
      ]);
      expect(prepared.filter(({ created }) => created)).toHaveLength(1);
      expect(allocations).toBe(1);
      expect(JSON.parse(await readFile(configurationPath, 'utf8'))).toEqual({
        emulators: { firestore: { port: 5031 } },
      });
      expect(await readFile(environmentPath, 'utf8')).toBe('VITE_USE_EMULATORS=1\n');
      await Promise.all(prepared.map((value) => cleanupValidationEmulator(value, { release: async () => undefined })));
      expect(await readFile(configurationPath).catch(() => undefined)).toBeUndefined();
      expect(await readFile(environmentPath).catch(() => undefined)).toBeUndefined();
    } finally {
      await unlink(configurationPath).catch(() => undefined);
      await unlink(environmentPath).catch(() => undefined);
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('blocks validation when test growth needs review and no justification is supplied', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-test-growth-${randomUUID()}.json`);
    const commands: string[] = [];

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [{ ...releaseEntry, validation: undefined }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          changedFiles: ['src/example.test.ts'],
          testGrowth: {
            baseSha: 'start-sha',
            headSha: 'branch-sha',
            changedTestFiles: ['src/example.test.ts'],
            addedTestFiles: 1,
            addedTestLines: 240,
            addedTestCases: 2,
            linesPerAddedCase: 120,
          },
        }),
        commandRunner: async (command) => {
          commands.push(command);
        },
      })).rejects.toThrow(/test-growth gate.*justification/i);
      expect(commands).toEqual([]);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('records test-growth metrics and a legitimate justification in the validation receipt', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-test-growth-${randomUUID()}.json`);
    const justification = 'Shared security matrix covers both client roles.';

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [{ ...releaseEntry, validation: undefined }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        'test-growth-justification': justification,
        release: releaseState({
          changedFiles: ['src/example.test.ts'],
          testGrowth: {
            baseSha: 'start-sha',
            headSha: 'branch-sha',
            changedTestFiles: ['src/example.test.ts'],
            addedTestFiles: 1,
            addedTestLines: 240,
            addedTestCases: 2,
            linesPerAddedCase: 120,
          },
        }),
        commandRunner: async () => undefined,
      } as Parameters<typeof validateCoordinationEntry>[1] & {
        'test-growth-justification': string;
      });

      const state = await readCoordinationState(filePath);
      const testGrowthReceipt = (state.entries[0]?.validation as {
        testGrowth?: Record<string, unknown>;
      } | undefined)?.testGrowth;
      expect(testGrowthReceipt).toMatchObject({
        passed: true,
        reviewRequired: true,
        waived: true,
        justification,
        baseSha: 'start-sha',
        headSha: 'branch-sha',
        addedTestLines: 240,
        addedTestCases: 2,
      });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('records a passing validation receipt against the exact branch SHA', async () => {
    const root = resolve(tmpdir(), `den-of-wolves-validation-receipt-${randomUUID()}`);
    const firebasePath = resolve(root, 'firebase.json');
    const generatedConfigPath = resolve(root, 'firebase.local.json');
    const generatedEnvironmentPath = resolve(root, '.env.emulators.local');
    const filePath = resolve(tmpdir(), `den-of-wolves-validation-${randomUUID()}.json`);
    const commands: string[] = [];

    try {
      await mkdir(root, { recursive: true });
      await writeFile(firebasePath, JSON.stringify({ emulators: {} }), 'utf8');
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [{
          ...releaseEntry,
          validation: undefined,
        }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState(),
        repositoryDirectory: root,
        commandRunner: async (command) => {
          commands.push(command);
        },
      });

      const state = await readCoordinationState(filePath);
      expect(commands).toEqual(codeValidation.commands);
      expect(state.entries[0]?.validation).toMatchObject({
        commitSha: 'branch-sha',
        passed: true,
        docsOnly: false,
        emulator: {
          setup: 'auto',
          generatedFiles: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringMatching(/firebase\.local\.json$/),
              identity: expect.objectContaining({
                contentHash: expect.any(String),
                device: expect.any(Number),
                inode: expect.any(Number),
                mtimeNs: expect.any(String),
                ctimeNs: expect.any(String),
              }),
            }),
          ]),
        },
      });
    } finally {
      await unlink(firebasePath).catch(() => undefined);
      await unlink(generatedConfigPath).catch(() => undefined);
      await unlink(generatedEnvironmentPath).catch(() => undefined);
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('reuses an identical passing validation receipt without rerunning commands', async () => {
    const root = resolve(tmpdir(), `den-of-wolves-validation-reuse-${randomUUID()}`);
    const firebasePath = resolve(root, 'firebase.json');
    const generatedConfigPath = resolve(root, 'firebase.local.json');
    const generatedEnvironmentPath = resolve(root, '.env.emulators.local');
    const filePath = resolve(tmpdir(), `den-of-wolves-validation-reuse-${randomUUID()}.json`);
    const commands: string[] = [];
    const commandDirectories: string[] = [];

    try {
      await mkdir(root, { recursive: true });
      await mkdir(resolve(root, 'node_modules/example-package'), { recursive: true });
      await writeFile(firebasePath, JSON.stringify({ emulators: {} }), 'utf8');
      await writeFile(
        resolve(root, 'node_modules/example-package/index.js'),
        'export const installedValue = 1;\n',
        'utf8',
      );
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [{ ...releaseEntry, validation: undefined }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState(),
        repositoryDirectory: root,
        commandRunner: async (command, commandDirectory) => {
          commands.push(command);
          commandDirectories.push(commandDirectory);
        },
      });
      expect(commands).toEqual(codeValidation.commands);
      expect(new Set(commandDirectories)).toEqual(new Set([root]));

      const firstState = await readCoordinationState(filePath);
      const firstValidation = firstState.entries[0]?.validation;
      expect(firstValidation?.inputFingerprint).toMatchObject({
        schemaVersion: 1,
        identity: expect.any(String),
      });
      commands.length = 0;

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState(),
        repositoryDirectory: root,
        commandRunner: async (command) => {
          commands.push(command);
        },
      })).resolves.toMatchObject({
        id: releaseEntry.id,
        validationReused: true,
        validation: firstValidation,
      });

      const state = await readCoordinationState(filePath);
      expect(commands).toEqual([]);
      expect(state.entries[0]?.validation).toEqual(firstValidation);
      expect(state.entries[0]?.validationHistory).toBeUndefined();

      commandDirectories.length = 0;
      await writeFile(
        resolve(root, 'node_modules/example-package/index.js'),
        'export const installedValue = 2;\n',
        'utf8',
      );
      const changedDependencyResult = await validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState(),
        repositoryDirectory: root,
        commandRunner: async (command, commandDirectory) => {
          commands.push(command);
          commandDirectories.push(commandDirectory);
        },
      });
      expect(changedDependencyResult.validationReused).toBeUndefined();
      expect(commands).toEqual(codeValidation.commands);
      expect(new Set(commandDirectories)).toEqual(new Set([root]));
      const changedDependencyState = await readCoordinationState(filePath);
      const changedDependencyValidation = changedDependencyState.entries[0]?.validation;
      expect(changedDependencyState.entries[0]?.validationHistory).toEqual([firstValidation]);

      commands.length = 0;
      commandDirectories.length = 0;
      await writeFile(generatedEnvironmentPath, 'VITE_USE_EMULATORS=1\n', 'utf8');
      const changedInputResult = await validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState(),
        repositoryDirectory: root,
        commandRunner: async (command, commandDirectory) => {
          commands.push(command);
          commandDirectories.push(commandDirectory);
        },
      });
      expect(changedInputResult.validationReused).toBeUndefined();
      expect(commands).toEqual(codeValidation.commands);
      expect(new Set(commandDirectories)).toEqual(new Set([root]));
      expect((await readCoordinationState(filePath)).entries[0]?.validationHistory)
        .toEqual([firstValidation, changedDependencyValidation]);
    } finally {
      await unlink(firebasePath).catch(() => undefined);
      await unlink(generatedConfigPath).catch(() => undefined);
      await unlink(generatedEnvironmentPath).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('reruns a legacy passing receipt that has no input fingerprint', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-validation-legacy-${randomUUID()}.json`);
    const commands: string[] = [];
    const documentationValidation = {
      ...codeValidation,
      commands: ['git diff --check', 'npm run coordination:docs'],
      files: ['docs/example.md'],
      docsOnly: true,
      reviews: { documentation: 'Documentation reviewed.' },
    };
    const entry = {
      ...releaseEntry,
      workType: 'tooling',
      versionPlan: 'Tooling-only; no application version change.',
      scopes: ['docs/example.md'],
      validation: documentationValidation,
    };
    const release = releaseState({
      mainContainsBranch: false,
      mainIsAncestorOfBranch: true,
      branchVersion: '0.3.2',
      mainVersion: '0.3.2',
      branchLockVersion: '0.3.2',
      mainLockVersion: '0.3.2',
      branchChangelog: [{ version: '0.3.2', source: 'existing release' }],
      mainChangelog: [{ version: '0.3.2', source: 'existing release' }],
      changedFiles: ['docs/example.md'],
    });

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      const result = await validateCoordinationEntry(filePath, {
        id: entry.id,
        release,
        'documentation-review': 'Documentation reviewed.',
        commandRunner: async (command) => {
          commands.push(command);
        },
      });

      expect(result.validationReused).toBeUndefined();
      expect(commands).toEqual(documentationValidation.commands);
      expect((await readCoordinationState(filePath)).entries[0]?.validationHistory)
        .toEqual([documentationValidation]);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('rejects a receipt when coordination inputs change while commands run', async () => {
    const root = resolve(tmpdir(), `den-of-wolves-validation-input-race-${randomUUID()}`);
    const filePath = resolve(tmpdir(), `den-of-wolves-validation-input-race-${randomUUID()}.json`);
    const entry = {
      ...releaseEntry,
      workType: 'tooling',
      versionPlan: 'Tooling-only; no application version change.',
      scopes: ['docs/example.md'],
      claims: ['fixture-validation-input-race'],
      validation: undefined,
    };
    const release = releaseState({
      mainContainsBranch: false,
      mainIsAncestorOfBranch: true,
      branchVersion: '0.3.2',
      mainVersion: '0.3.2',
      branchLockVersion: '0.3.2',
      mainLockVersion: '0.3.2',
      branchChangelog: [{ version: '0.3.2', source: 'existing release' }],
      mainChangelog: [{ version: '0.3.2', source: 'existing release' }],
      changedFiles: ['docs/example.md'],
    });
    let changed = false;

    try {
      await mkdir(root, { recursive: true });
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: entry.id,
        release,
        repositoryDirectory: root,
        'documentation-review': 'Documentation reviewed.',
        commandRunner: async () => {
          if (changed) return;
          changed = true;
          const state = JSON.parse(await readFile(filePath, 'utf8'));
          state.entries[0].claims.push('claim-added-during-validation');
          await writeFile(filePath, JSON.stringify(state), 'utf8');
        },
      })).rejects.toThrow(/coordination entry changed while checks ran|validation inputs changed/i);

      const finalEntry = (await readCoordinationState(filePath)).entries[0];
      expect(finalEntry?.claims).toContain('claim-added-during-validation');
      expect(finalEntry?.validation).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('reuses validation through the CLI when the live checkout is unchanged', async () => {
    const rootPath = resolve(tmpdir(), `den-of-wolves-validation-live-reuse-${randomUUID()}`);
    const originPath = `${rootPath}.origin.git`;
    const filePath = resolve(tmpdir(), `den-of-wolves-validation-live-reuse-${randomUUID()}.json`);
    const scriptPath = resolve(process.cwd(), 'scripts/emulator-resource-registry.mjs');

    try {
      await mkdir(rootPath, { recursive: true });
      const root = await realpath(rootPath);
      await runFixtureGit(root, ['init', '-b', 'main']);
      await runFixtureGit(root, ['config', 'user.email', 'fixture@example.test']);
      await runFixtureGit(root, ['config', 'user.name', 'Fixture']);
      await mkdir(resolve(root, 'docs'), { recursive: true });
      await mkdir(resolve(root, 'src'), { recursive: true });
      await writeFile(resolve(root, 'package.json'), JSON.stringify({
        version: '0.3.22',
        scripts: { 'coordination:docs': 'node -e ""' },
      }));
      await writeFile(resolve(root, 'package-lock.json'), JSON.stringify({
        packages: { '': { version: '0.3.22' } },
      }));
      await writeFile(resolve(root, 'src/changelog.ts'), 'const changes = [{ version: APP_VERSION }];\n');
      await writeFile(resolve(root, 'docs/example.md'), 'Baseline.\n');
      await runFixtureGit(root, ['add', '.']);
      await runFixtureGit(root, ['commit', '-m', 'fixture baseline']);
      const baseSha = await runFixtureGit(root, ['rev-parse', 'HEAD']);
      await runFixtureGit(root, ['init', '--bare', originPath]);
      await runFixtureGit(root, ['remote', 'add', 'origin', originPath]);
      await runFixtureGit(root, ['push', '-u', 'origin', 'main']);

      await runFixtureGit(root, ['switch', '-c', 'docs/validation-live-reuse']);
      await writeFile(resolve(root, 'docs/example.md'), 'Reviewed documentation.\n');
      await runFixtureGit(root, ['add', 'docs/example.md']);
      await runFixtureGit(root, ['commit', '-m', 'fixture documentation']);
      const entry = {
        id: 'validation-live-reuse',
        worktree: root,
        startedAt: '2026-09-10T00:00:00.000Z',
        status: 'active',
        intent: 'fixture unchanged validation reuse',
        workType: 'tooling',
        scopes: ['docs/example.md'],
        claims: ['fixture-validation-live-reuse'],
        branchName: 'docs/validation-live-reuse',
        startBranchSha: baseSha,
        startMainSha: baseSha,
        versionPlan: 'Tooling-only; no application version change.',
        preemptiveChangelog: 'No player-facing change.',
      };
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');
      const environment = { ...process.env, CODEX_COORDINATION_FILE: filePath };

      const first = await execFileAsync(process.execPath, [
        scriptPath,
        'validate',
        '--id', entry.id,
        '--documentation-review', 'Fixture documentation reviewed.',
      ], { cwd: root, env: environment, encoding: 'utf8' });
      expect(first.stdout).toMatch(/Validated coordination entry validation-live-reuse/);
      const firstValidation = JSON.parse(await readFile(filePath, 'utf8')).entries[0]?.validation;

      const second = await execFileAsync(process.execPath, [
        scriptPath,
        'validate',
        '--id', entry.id,
      ], { cwd: root, env: environment, encoding: 'utf8' });
      expect(second.stdout).toMatch(/Reused passing validation.*validation-live-reuse/);
      const finalEntry = JSON.parse(await readFile(filePath, 'utf8')).entries[0];
      expect(finalEntry.validation).toEqual(firstValidation);
      expect(finalEntry.validationHistory).toBeUndefined();
    } finally {
      await rm(rootPath, { recursive: true, force: true });
      await rm(originPath, { recursive: true, force: true });
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('retains tooling classification during the final validation recheck', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-tooling-recheck-${randomUUID()}.json`);
    const toolingEntry = {
      ...releaseEntry,
      workType: 'tooling',
      versionPlan: 'Proof-only non-feature work; keep the application version unchanged.',
      scopes: ['docs/example.md'],
      validation: undefined,
    };
    const unchangedRelease = releaseState({
      mainContainsBranch: false,
      mainIsAncestorOfBranch: true,
      branchVersion: '0.3.2',
      mainVersion: '0.3.2',
      branchLockVersion: '0.3.2',
      mainLockVersion: '0.3.2',
      branchChangelog: [{ version: '0.3.2', source: 'existing release' }],
      mainChangelog: [{ version: '0.3.2', source: 'existing release' }],
      changedFiles: ['docs/example.md'],
    });

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [toolingEntry],
        reservations: [],
        configurations: [],
      }));

      await expect(validateCoordinationEntry(filePath, {
        id: toolingEntry.id,
        release: unchangedRelease,
        'documentation-review': 'Proof-only documentation reviewed.',
        commandRunner: async () => undefined,
      })).resolves.toMatchObject({
        validation: { passed: true, commitSha: unchangedRelease.branchSha },
      });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('rejects validation until the task branch contains current main', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-validation-${randomUUID()}.json`);
    const commands: string[] = [];

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [{
          ...releaseEntry,
          validation: undefined,
        }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          mainContainsBranch: false,
          mainIsAncestorOfBranch: false,
        }),
        commandRunner: async (command) => {
          commands.push(command);
        },
      })).rejects.toThrow(/reconcile.*main|main.*ancestor/i);
      expect(commands).toEqual([]);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('atomically assigns distinct rows when worktrees auto-configure concurrently', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-registry-test-${randomUUID()}.json`);

    try {
      const configurations = await Promise.all([
        reserveAvailableConfiguredEmulatorSlot({
          filePath,
          availableSlots: [0, 1],
          worktree: '/worktrees/first',
          portsForSlot: () => [1],
          portCheck: async () => true,
        }),
        reserveAvailableConfiguredEmulatorSlot({
          filePath,
          availableSlots: [0, 1],
          worktree: '/worktrees/second',
          portsForSlot: () => [1],
          portCheck: async () => true,
        }),
      ]);

      expect(new Set(configurations.map((configuration) => configuration.slot))).toEqual(
        new Set([0, 1]),
      );
      expect((await readCoordinationState(filePath)).configurations).toHaveLength(2);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('skips an occupied slot and rows already configured by other worktrees', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-registry-test-${randomUUID()}.json`);

    try {
      await reserveConfiguredEmulatorSlot({
        filePath,
        slot: 1,
        worktree: '/worktrees/other',
        ports: [5001],
        portCheck: async () => true,
      });

      const configuration = await reserveAvailableConfiguredEmulatorSlot({
        filePath,
        availableSlots: [0, 1, 2],
        worktree: '/worktrees/current',
        portsForSlot: (slot) => [slot === 0 ? 5000 : 5001],
        portCheck: async (port) => port !== 5000,
      });

      expect(configuration.slot).toBe(2);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('reclaims configured rows left by completed worktrees without touching active work', () => {
    const state = {
      version: 1,
      versionAgreement: 'agreement',
      entries: [
        {
          id: 'active-entry',
          worktree: '/worktrees/active',
          startedAt: '2026-09-07T00:00:00.000Z',
          status: 'active',
          intent: 'active work',
          versionPlan: 'tooling-only',
          preemptiveChangelog: 'none',
        },
        {
          id: 'complete-entry',
          worktree: '/worktrees/complete',
          startedAt: '2026-09-06T00:00:00.000Z',
          status: 'complete',
          intent: 'finished work',
          versionPlan: 'tooling-only',
          preemptiveChangelog: 'none',
        },
      ],
      reservations: [
        {
          id: 'live-reservation',
          slot: 2,
          worktree: '/worktrees/live',
          kind: 'emulators',
          pid: process.pid,
          command: 'npm run emulators',
          claimedAt: '2026-09-07T00:00:00.000Z',
        },
      ],
      configurations: [
        {
          id: 'active-config',
          slot: 0,
          worktree: '/worktrees/active',
          configuredAt: '2026-09-07T00:00:00.000Z',
        },
        {
          id: 'complete-config',
          slot: 1,
          worktree: '/worktrees/complete',
          configuredAt: '2026-09-07T00:00:00.000Z',
        },
        {
          id: 'live-config',
          slot: 2,
          worktree: '/worktrees/live',
          configuredAt: '2026-09-07T00:00:00.000Z',
        },
      ],
    };

    expect(pruneOrphanedConfigurations(state).configurations.map((configuration) => configuration.id))
      .toEqual(['active-config', 'live-config']);
  });

  it('reclaims a configured row when its active worktree no longer exists', () => {
    const state = {
      version: 1,
      versionAgreement: 'agreement',
      entries: [{
        id: 'missing-entry',
        worktree: '/worktrees/missing',
        startedAt: '2026-09-07T00:00:00.000Z',
        status: 'active',
        intent: 'abandoned worktree',
        versionPlan: 'tooling-only',
        preemptiveChangelog: 'none',
      }],
      reservations: [],
      configurations: [{
        id: 'missing-config',
        slot: 4,
        worktree: '/worktrees/missing',
        configuredAt: '2026-09-07T00:00:00.000Z',
      }],
    };

    expect(pruneOrphanedConfigurations(
      state,
      (worktree) => worktree !== '/worktrees/missing',
    ).configurations).toEqual([]);
  });

  it('does not remove a replacement lock while releasing its own lease', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-registry-test-${randomUUID()}.json`);
    const lockPath = `${filePath}.lock`;
    let replaced = false;

    try {
      await reserveEmulatorSlot({
        filePath,
        slot: 0,
        worktree: '/worktrees/current',
        kind: 'rules',
        command: 'npm run test:rules',
        ports: [1],
        portCheck: async () => {
          if (!replaced) {
            replaced = true;
            await writeFile(
              lockPath,
              `${JSON.stringify({ pid: process.pid, token: 'replacement-lock' })}\n`,
              'utf8',
            );
          }
          return true;
        },
      });

      expect(await readFile(lockPath, 'utf8')).toContain('replacement-lock');
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
      await unlink(`${lockPath}.recovery`).catch(() => undefined);
    }
  });

  it('atomically moves a rules lease to a complete free slot and releases it', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-registry-test-${randomUUID()}.json`);
    const portCheck = async () => true;

    try {
      await reserveEmulatorSlot({
        filePath,
        slot: 4,
        worktree: '/worktrees/current',
        kind: 'emulators',
        command: 'npm run emulators',
        ports: [1],
        portCheck,
      });

      const rulesReservation = await reserveAvailableEmulatorSlot({
        filePath,
        preferredSlot: 4,
        availableSlots: [4, 5],
        worktree: '/worktrees/current',
        kind: 'rules',
        command: 'npm run test:rules',
        portsForSlot: () => [2],
        portCheck,
      });

      expect(rulesReservation.slot).toBe(5);
      await releaseEmulatorSlot(rulesReservation, filePath);
      expect((await readCoordinationState(filePath)).reservations).toHaveLength(1);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('treats a wildcard listener as occupying a local emulator port', async () => {
    const server = createServer();
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.once('error', rejectPromise);
      server.listen({ host: '0.0.0.0', port: 0 }, () => resolvePromise());
    });

    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new Error('The test listener did not receive a numeric port.');
    }

    try {
      expect(await isPortFree(address.port)).toBe(false);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it('does not silently discard a corrupted shared coordination file', () => {
    expect(() => parseCoordinationState('{not-json')).toThrow(/coordination/i);
  });

  it('rejects completion when main does not contain the task branch commit', () => {
    expect(() => validateReleaseCompletion({
      entry: releaseEntry,
      release: releaseState({ mainContainsBranch: false }),
    })).toThrow(/main.*does not contain.*branch commit/i);
  });

  it('rejects completion from a dirty checkout', () => {
    expect(() => validateReleaseCompletion({
      entry: releaseEntry,
      release: releaseState({ worktreeClean: false }),
    })).toThrow(/uncommitted changes/i);
  });

  it('rejects completion without a validation receipt for the current branch SHA', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        validation: {
          ...codeValidation,
          commitSha: 'older-branch-sha',
        },
      },
      release: releaseState(),
    })).toThrow(/validation.*branch-sha|branch-sha.*validation/i);
  });

  it('rejects a validation receipt whose derived profile evidence is stale', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        validation: {
          ...codeValidation,
          profile: {
            kind: 'full',
            reason: 'derived full profile',
            commands: [],
            evidence: {
              baseSha: 'older-base-sha',
              branchSha: 'branch-sha',
              diffIdentity: 'committed-diff-hash',
            },
          },
        },
      },
      release: releaseState(),
    })).toThrow(/profile.*evidence|evidence.*base/i);
  });

  it('rejects a fabricated copy-only receipt that omits authoritative changed files', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        validation: {
          ...codeValidation,
          files: ['src/components/RoleSelect.test.tsx'],
          commands: [
            'git diff --check',
            'npm run validate:implementation-progress',
            'npm run lint',
            'npm run build',
            'npm test -- --run src/components/RoleSelect.test.tsx',
          ],
          profile: {
            kind: 'copy-only',
            reason: 'fabricated static-copy result',
            commands: [
              'npm run validate:implementation-progress',
              'npm run lint',
              'npm run build',
              'npm test -- --run src/components/RoleSelect.test.tsx',
            ],
            evidence: {
              baseSha: 'main-sha',
              branchSha: 'branch-sha',
              diffIdentity: 'fabricated-diff-hash',
            },
          },
        },
      },
      release: releaseState({
        changedFiles: ['scripts/validation-profile.mjs', 'src/config/emulatorResourceRegistry.mjs'],
      }),
    })).toThrow(/receipt.*files|changed files|authoritative|exact/i);
  });

  it('kills detached validation descendants before reporting a timeout', async () => {
    const markerPath = resolve(tmpdir(), `den-of-wolves-validation-child-${randomUUID()}.txt`);
    const childCode = [
      "const { spawn } = require('node:child_process');",
      "const { writeFileSync } = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      'writeFileSync(process.argv[1], String(child.pid));',
      'setInterval(() => {}, 1000);',
    ].join('\n');
    try {
      await expect(executeValidationProcess(
        process.execPath,
        ['-e', childCode, markerPath],
        process.cwd(),
        { timeoutMs: 250 },
      )).rejects.toThrow(/timed out/i);
      const childPid = Number(await readFile(markerPath, 'utf8'));
      expect(() => process.kill(childPid, 0)).toThrow();
    } finally {
      await unlink(markerPath).catch(() => undefined);
    }
  });

  it('rejects completion without a test-growth receipt for changed test files', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        validation: {
          ...codeValidation,
          files: ['src/example.test.ts'],
        },
      },
      release: releaseState({
        changedFiles: ['src/example.test.ts'],
        testGrowth: {
          baseSha: 'start-sha',
          headSha: 'branch-sha',
          changedTestFiles: ['src/example.test.ts'],
          addedTestFiles: 1,
          addedTestLines: 240,
          addedTestCases: 2,
          linesPerAddedCase: 120,
        },
      }),
    })).toThrow(/test-growth/i);
  });

  it('uses the validated test-growth receipt after main reconciliation widens the live diff', () => {
    const validatedTestGrowth = {
      baseSha: 'main-before-merge',
      headSha: 'branch-sha',
      changedTestFiles: ['src/example.test.ts'],
      addedTestFiles: 1,
      addedTestLines: 80,
      addedTestCases: 2,
      linesPerAddedCase: 40,
      passed: true,
      reviewRequired: false,
      waived: false,
      justification: '',
    };

    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        validation: {
          ...codeValidation,
          files: ['src/example.test.ts'],
          testGrowth: validatedTestGrowth,
        } as typeof codeValidation & { testGrowth: typeof validatedTestGrowth },
      },
      release: releaseState({
        changedFiles: ['src/example.test.ts'],
        testGrowth: {
          ...validatedTestGrowth,
          baseSha: 'task-start-sha',
          addedTestLines: 420,
          addedTestCases: 3,
          linesPerAddedCase: 140,
        },
      }),
    })).not.toThrow();
  });

  it('rejects task-scope changes committed after the validated tip', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        scopes: ['scripts/example.mjs'],
        validation: {
          ...codeValidation,
          commitSha: 'validated-tip',
          files: ['scripts/example.mjs'],
        },
      },
      release: releaseState({
        changedFiles: ['scripts/example.mjs'],
        validationTaskTipSha: 'validated-tip',
        postValidationChangedFiles: ['scripts/example.mjs'],
      }),
    })).toThrow(/after validated tip|not covered by the receipt/i);
  });

  it('rejects an unvalidated branch commit outside the declared task scope', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        scopes: ['scripts/example.mjs'],
        validation: {
          ...codeValidation,
          commitSha: 'validated-tip',
          files: ['scripts/example.mjs'],
        },
      },
      release: releaseState({
        branchSha: 'unvalidated-branch-tip',
        changedFiles: ['scripts/example.mjs'],
        validationTaskTipSha: 'validated-tip',
        validationReceiptCommitSha: 'validated-tip',
        postValidationChangedFiles: ['docs/unrelated.md'],
      }),
    })).toThrow(/branch.*advanced|revalidate|current branch/i);
  });

  it('requires the human review attestation that matches documentation or UI scope', () => {
    const documentationEntry = {
      ...releaseEntry,
      validation: {
        ...codeValidation,
        commands: ['git diff --check'],
        files: ['CLAUDE.md'],
        docsOnly: true,
      },
    };
    expect(() => validateReleaseCompletion({
      entry: documentationEntry,
      release: releaseState({ changedFiles: ['CLAUDE.md'] }),
    })).toThrow(/documentation.*review/i);

    const visualEntry = {
      ...releaseEntry,
      validation: {
        ...codeValidation,
        files: ['src/routes/ShipConsole.tsx'],
        reviews: {},
      },
    };
    expect(() => validateReleaseCompletion({
      entry: visualEntry,
      release: releaseState({ changedFiles: ['src/routes/ShipConsole.tsx'] }),
    })).toThrow(/visual.*review/i);
  });

  it('rejects package metadata that is out of sync with the root lockfile', () => {
    expect(() => validateReleaseCompletion({
      entry: releaseEntry,
      release: releaseState({ branchLockVersion: '0.2.102' }),
    })).toThrow(/package\.json.*package-lock\.json/i);
  });

  it('rejects a stale branch that lowers the application version', () => {
    expect(() => validateReleaseCompletion({
      entry: releaseEntry,
      release: releaseState({
        mainContainsBranch: false,
        branchVersion: '0.2.95',
        mainVersion: '0.2.100',
        branchChangelog: [{ version: '0.2.95', source: 'old release' }],
        mainChangelog: [
          { version: '0.2.100', source: 'new release' },
          { version: '0.2.99', source: 'newer release' },
        ],
      }),
    })).toThrow(/0\.2\.95.*older.*0\.2\.100/i);
  });

  it('rolls the patch component into the next middle component at 99', () => {
    expect(nextApplicationVersion('0.2.98')).toBe('0.2.99');
    expect(nextApplicationVersion('0.2.99')).toBe('0.3.0');
  });

  it('rejects a player-facing version whose patch component skips the rollover gate', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-rollover-gate-${randomUUID()}.json`);

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [{
          ...releaseEntry,
          validation: undefined,
          versionPlan: 'Reserve application patch version 0.2.100.',
        }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          mainContainsBranch: false,
          branchVersion: '0.2.100',
          mainVersion: '0.2.99',
          branchLockVersion: '0.2.100',
          mainLockVersion: '0.2.99',
          branchChangelog: [
            { version: '0.2.100', source: 'new release' },
            { version: '0.2.99', source: 'previous release' },
          ],
          mainChangelog: [{ version: '0.2.99', source: 'previous release' }],
        }),
        commandRunner: async () => undefined,
      })).rejects.toThrow(/rollover|0\.3\.0|patch component/i);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('allows the first release after patch 99 to use the next middle component', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-rollover-gate-${randomUUID()}.json`);

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [{
          ...releaseEntry,
          validation: undefined,
          versionPlan: 'Reserve application patch version 0.3.0.',
        }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          mainContainsBranch: false,
          branchVersion: '0.3.0',
          mainVersion: '0.2.99',
          branchLockVersion: '0.3.0',
          mainLockVersion: '0.2.99',
          branchChangelog: [
            { version: '0.3.0', source: 'new release' },
            { version: '0.2.99', source: 'previous release' },
          ],
          mainChangelog: [{ version: '0.2.99', source: 'previous release' }],
        }),
        commandRunner: async () => undefined,
      })).resolves.toMatchObject({ id: releaseEntry.id });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('keeps the rollover gate active when a branch is already merged', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        versionPlan: 'Reserve application patch version 0.2.100.',
      },
      release: releaseState({
        branchVersion: '0.2.100',
        mainVersion: '0.2.99',
        branchLockVersion: '0.2.100',
        mainLockVersion: '0.2.99',
        branchChangelog: [
          { version: '0.2.100', source: 'new release' },
          { version: '0.2.99', source: 'previous release' },
        ],
        mainChangelog: [{ version: '0.2.99', source: 'previous release' }],
      }),
    })).toThrow(/rollover|0\.3\.0|patch component/i);
  });

  it('rejects a branch that would replace newer changelog entries', () => {
    expect(() => validateReleaseCompletion({
      entry: releaseEntry,
      release: releaseState({
        mainContainsBranch: false,
        branchChangelog: [
          { version: '0.2.103', source: 'new release' },
        ],
        mainChangelog: [
          { version: '0.2.102', source: 'previous release' },
          { version: '0.2.100', source: 'older release' },
        ],
      }),
    })).toThrow(/0\.2\.102.*changelog/i);
  });

  it('allows tooling-only enrichment of the current release coverage entry', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-current-changelog-${randomUUID()}.json`);

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [{
          ...releaseEntry,
          workType: 'tooling',
          versionPlan: 'Tooling-only; no application version bump.',
        }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          mainContainsBranch: false,
          branchVersion: '0.3.5',
          mainVersion: '0.3.5',
          branchLockVersion: '0.3.5',
          mainLockVersion: '0.3.5',
          branchChangelog: [
            { version: '0.3.5', source: 'detailed current release coverage' },
            { version: '0.3.4', source: 'previous release' },
          ],
          mainChangelog: [
            { version: '0.3.5', source: 'generic current release summary' },
            { version: '0.3.4', source: 'previous release' },
          ],
        }),
        commandRunner: async () => undefined,
      })).resolves.toMatchObject({ id: releaseEntry.id });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('allows tooling-only enrichment of historical release coverage metadata', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        workType: 'tooling',
        versionPlan: 'Tooling-only; correct historical prompt coverage metadata.',
      },
      release: releaseState({
        branchVersion: '0.3.5',
        mainVersion: '0.3.5',
        branchLockVersion: '0.3.5',
        mainLockVersion: '0.3.5',
        branchChangelog: [
          { version: '0.3.5', source: 'generic current release summary' },
          {
            version: '0.3.4',
            source: "version: '0.3.4' implementationPrompts: [598] changes: ['historical change']",
          },
        ],
        mainChangelog: [
          { version: '0.3.5', source: 'generic current release summary' },
          {
            version: '0.3.4',
            source: "version: '0.3.4' changes: ['historical change']",
          },
        ],
      }),
    })).not.toThrow();
  });

  it('preserves a previous APP_VERSION entry across a new release', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-release-preservation-${randomUUID()}.json`);

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [releaseEntry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          mainContainsBranch: false,
          branchChangelog: [
            { version: '0.3.3', source: "version: '0.3.3' changes: ['new release']" },
            { version: '0.3.2', source: "version: '0.3.2' changes: ['previous release']" },
          ],
          mainChangelog: [
            { version: '0.3.2', source: "version: APP_VERSION changes: ['previous release']" },
          ],
        }),
        commandRunner: async () => undefined,
      })).resolves.toMatchObject({ id: releaseEntry.id });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('records final branch, main, remote, and pushed state when completion succeeds', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-release-gate-${randomUUID()}.json`);

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [releaseEntry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await finishCoordinationEntry(filePath, {
        id: releaseEntry.id,
        result: 'landed and pushed',
        release: releaseState(),
      });

      const state = await readCoordinationState(filePath);
      expect(state.entries[0]).toMatchObject({
        status: 'complete',
        outcome: 'landed',
        result: 'landed and pushed',
        finalBranchName: 'fix/release-task',
        finalBranchSha: 'branch-sha',
        mainSha: 'main-sha',
        originMainSha: 'main-sha',
        pushed: true,
      });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('finishes through the CLI using the contained validated receipt after main advances', async () => {
    const rootPath = resolve(tmpdir(), `den-of-wolves-finish-provenance-${randomUUID()}`);
    const originPath = `${rootPath}.origin.git`;
    const filePath = resolve(tmpdir(), `den-of-wolves-finish-provenance-${randomUUID()}.json`);
    const scriptPath = resolve(process.cwd(), 'scripts/emulator-resource-registry.mjs');

    try {
      await mkdir(rootPath, { recursive: true });
      const root = await realpath(rootPath);
      await runFixtureGit(root, ['init', '-b', 'main']);
      await runFixtureGit(root, ['config', 'user.email', 'fixture@example.test']);
      await runFixtureGit(root, ['config', 'user.name', 'Fixture']);
      await mkdir(resolve(root, 'src'), { recursive: true });
      await mkdir(resolve(root, 'scripts'), { recursive: true });
      await writeFile(resolve(root, 'package.json'), JSON.stringify({ version: '0.3.22' }));
      await writeFile(resolve(root, 'package-lock.json'), JSON.stringify({
        packages: { '': { version: '0.3.22' } },
      }));
      await writeFile(resolve(root, 'src/changelog.ts'), 'const changes = [{ version: APP_VERSION }];\n');
      await writeFile(resolve(root, 'scripts/base.mjs'), 'export const base = true;\n');
      await runFixtureGit(root, ['add', '.']);
      await runFixtureGit(root, ['commit', '-m', 'fixture baseline']);
      const baseSha = await runFixtureGit(root, ['rev-parse', 'HEAD']);

      await runFixtureGit(root, ['switch', '-c', 'feature/finish-provenance']);
      await writeFile(resolve(root, 'scripts/example.mjs'), 'export const fixture = true;\n');
      await runFixtureGit(root, ['add', 'scripts/example.mjs']);
      await runFixtureGit(root, ['commit', '-m', 'fixture task']);
      const taskTipSha = await runFixtureGit(root, ['rev-parse', 'HEAD']);

      await runFixtureGit(root, ['switch', 'main']);
      await runFixtureGit(root, ['merge', '--ff-only', 'feature/finish-provenance']);
      await writeFile(resolve(root, 'scripts/unrelated.mjs'), 'export const unrelated = true;\n');
      await runFixtureGit(root, ['add', 'scripts/unrelated.mjs']);
      await runFixtureGit(root, ['commit', '-m', 'fixture unrelated main change']);
      const currentMainSha = await runFixtureGit(root, ['rev-parse', 'HEAD']);
      await runFixtureGit(root, ['init', '--bare', originPath]);
      await runFixtureGit(root, ['remote', 'add', 'origin', originPath]);
      await runFixtureGit(root, ['push', '-u', 'origin', 'main']);
      await runFixtureGit(root, ['branch', 'feature/finish-provenance-main', currentMainSha]);
      await runFixtureGit(root, ['switch', 'feature/finish-provenance']);

      const { stdout: diff } = await execFileAsync('git', [
        'diff', '--unified=0', `${baseSha}...${taskTipSha}`,
      ], { cwd: root, encoding: 'utf8' });
      const validation = {
        commitSha: taskTipSha,
        completedAt: '2026-09-10T00:05:00.000Z',
        passed: true,
        commands: validationPlanForFiles(['scripts/example.mjs'], {
          profile: { kind: 'full', reason: 'fixture', commands: [] },
        }).commands,
        files: ['scripts/example.mjs'],
        docsOnly: false,
        profile: {
          kind: 'full',
          reason: 'fixture',
          commands: [],
          evidence: {
            baseSha,
            branchSha: taskTipSha,
            diffIdentity: createHash('sha256').update(diff.trim()).digest('hex'),
          },
        },
      };
      const restoredEntry = {
        id: 'finish-provenance-restored',
        worktree: root,
        startedAt: '2026-09-10T00:00:00.000Z',
        status: 'active',
        intent: 'fixture finish provenance',
        workType: 'tooling',
        scopes: ['scripts/example.mjs'],
        claims: ['fixture-finish-provenance-restored'],
        branchName: 'feature/finish-provenance',
        startBranchSha: baseSha,
        startMainSha: baseSha,
        versionPlan: 'Tooling-only; retain application version 0.3.22.',
        preemptiveChangelog: 'No player-facing change.',
        validation,
      };
      const revalidated = {
        ...validation,
        commitSha: currentMainSha,
      };
      const mergedEntry = {
        ...restoredEntry,
        id: 'finish-provenance-merged',
        claims: ['fixture-finish-provenance-merged'],
        branchName: 'feature/finish-provenance-main',
        validation: revalidated,
      };
      const state = {
        version: 1,
        versionAgreement: 'agreement',
        entries: [restoredEntry, mergedEntry],
        reservations: [],
        configurations: [],
      };
      await writeFile(filePath, JSON.stringify(state), 'utf8');

      const { stdout: restoredOutput } = await execFileAsync(process.execPath, [
        scriptPath, 'finish', '--id', 'finish-provenance-restored',
      ], {
        cwd: root,
        env: { ...process.env, CODEX_COORDINATION_FILE: filePath },
        encoding: 'utf8',
      });

      expect(restoredOutput).toMatch(/Completed coordination entry finish-provenance-restored/);
      await runFixtureGit(root, ['switch', 'feature/finish-provenance-main']);
      const { stdout: mergedOutput } = await execFileAsync(process.execPath, [
        scriptPath, 'finish', '--id', 'finish-provenance-merged',
      ], {
        cwd: root,
        env: { ...process.env, CODEX_COORDINATION_FILE: filePath },
        encoding: 'utf8',
      });

      expect(mergedOutput).toMatch(/Completed coordination entry finish-provenance-merged/);
      const finishedState = JSON.parse(await readFile(filePath, 'utf8'));
      expect(finishedState.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'finish-provenance-restored',
          status: 'complete',
          outcome: 'landed',
          finalBranchSha: taskTipSha,
          mainSha: currentMainSha,
          originMainSha: currentMainSha,
          pushed: true,
        }),
        expect.objectContaining({
          id: 'finish-provenance-merged',
          status: 'complete',
          outcome: 'landed',
          finalBranchSha: currentMainSha,
          mainSha: currentMainSha,
          originMainSha: currentMainSha,
          pushed: true,
        }),
      ]));
      expect(finishedState.entries[0]).toMatchObject({
        status: 'complete',
      });
    } finally {
      await rm(rootPath, { recursive: true, force: true });
      await rm(originPath, { recursive: true, force: true });
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('refreshes receipt provenance when revalidation covers corrected task files', async () => {
    const rootPath = resolve(tmpdir(), `den-of-wolves-revalidation-refresh-${randomUUID()}`);
    const originPath = `${rootPath}.origin.git`;
    const filePath = resolve(tmpdir(), `den-of-wolves-revalidation-refresh-${randomUUID()}.json`);
    const scriptPath = resolve(process.cwd(), 'scripts/emulator-resource-registry.mjs');

    try {
      await mkdir(rootPath, { recursive: true });
      const root = await realpath(rootPath);
      await runFixtureGit(root, ['init', '-b', 'main']);
      await runFixtureGit(root, ['config', 'user.email', 'fixture@example.test']);
      await runFixtureGit(root, ['config', 'user.name', 'Fixture']);
      await mkdir(resolve(root, 'docs'), { recursive: true });
      await mkdir(resolve(root, 'src'), { recursive: true });
      await writeFile(resolve(root, 'package.json'), JSON.stringify({
        version: '0.3.22',
        scripts: { 'coordination:docs': 'node -e ""' },
      }));
      await writeFile(resolve(root, 'package-lock.json'), JSON.stringify({
        packages: { '': { version: '0.3.22' } },
      }));
      await writeFile(resolve(root, 'src/changelog.ts'), 'const changes = [{ version: APP_VERSION }];\n');
      await writeFile(resolve(root, 'docs/release.md'), 'Initial baseline.\n');
      await runFixtureGit(root, ['add', '.']);
      await runFixtureGit(root, ['commit', '-m', 'fixture baseline']);
      const baseSha = await runFixtureGit(root, ['rev-parse', 'HEAD']);
      await runFixtureGit(root, ['init', '--bare', originPath]);
      await runFixtureGit(root, ['remote', 'add', 'origin', originPath]);
      await runFixtureGit(root, ['push', '-u', 'origin', 'main']);

      await runFixtureGit(root, ['switch', '-c', 'docs/revalidation-refresh']);
      await writeFile(resolve(root, 'docs/release.md'), 'Initial reviewed artifact.\n');
      await runFixtureGit(root, ['add', 'docs/release.md']);
      await runFixtureGit(root, ['commit', '-m', 'fixture initial artifact']);
      const initialArtifactTipSha = await runFixtureGit(root, ['rev-parse', 'HEAD']);
      const { stdout: initialDiff } = await execFileAsync('git', [
        'diff', '--unified=0', `${baseSha}...${initialArtifactTipSha}`,
      ], { cwd: root, encoding: 'utf8' });
      const initialValidation = {
        commitSha: initialArtifactTipSha,
        completedAt: '2026-09-10T00:05:00.000Z',
        passed: true,
        commands: ['git diff --check', 'npm run coordination:docs'],
        files: ['docs/release.md'],
        docsOnly: true,
        profile: {
          kind: 'full',
          reason: 'fixture initial validation',
          commands: [],
          evidence: {
            baseSha,
            branchSha: initialArtifactTipSha,
            diffIdentity: createHash('sha256').update(initialDiff.trim()).digest('hex'),
          },
        },
        reviews: { documentation: 'Initial artifact reviewed.' },
      };

      await runFixtureGit(root, ['switch', '-c', 'docs/revalidation-out-of-scope']);
      await writeFile(resolve(root, 'docs/unrelated.md'), 'Unowned follow-up.\n');
      await runFixtureGit(root, ['add', 'docs/unrelated.md']);
      await runFixtureGit(root, ['commit', '-m', 'fixture unowned follow-up']);
      const outOfScopeEntry = {
        id: 'revalidation-out-of-scope',
        worktree: root,
        startedAt: '2026-09-10T00:00:00.000Z',
        status: 'active',
        intent: 'fixture reject unowned revalidation',
        workType: 'documentation',
        scopes: ['docs/release.md'],
        claims: ['fixture-revalidation-out-of-scope'],
        branchName: 'docs/revalidation-out-of-scope',
        startBranchSha: baseSha,
        startMainSha: baseSha,
        versionPlan: 'Documentation-only; no application version change.',
        preemptiveChangelog: 'No player-facing change.',
        validation: initialValidation,
      };
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [outOfScopeEntry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(execFileAsync(process.execPath, [
        scriptPath,
        'validate',
        '--id',
        outOfScopeEntry.id,
        '--documentation-review',
        'Original artifact remains reviewed.',
      ], {
        cwd: root,
        env: { ...process.env, CODEX_COORDINATION_FILE: filePath },
        encoding: 'utf8',
      })).rejects.toThrow(/changed files outside declared scope.*docs\/unrelated\.md/i);
      expect(JSON.parse(await readFile(filePath, 'utf8')).entries[0]?.validation)
        .toMatchObject({ commitSha: initialArtifactTipSha });

      const legacyUnscopedEntry = {
        ...outOfScopeEntry,
        id: 'revalidation-legacy-unscoped',
        scopes: [],
        claims: ['fixture-revalidation-legacy-unscoped'],
      };
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [legacyUnscopedEntry],
        reservations: [],
        configurations: [],
      }), 'utf8');
      await expect(execFileAsync(process.execPath, [
        scriptPath,
        'validate',
        '--id',
        legacyUnscopedEntry.id,
        '--documentation-review',
        'Original artifact remains reviewed.',
      ], {
        cwd: root,
        env: { ...process.env, CODEX_COORDINATION_FILE: filePath },
        encoding: 'utf8',
      })).rejects.toThrow(/changed files outside.*docs\/unrelated\.md/i);
      expect(JSON.parse(await readFile(filePath, 'utf8')).entries[0]?.validation)
        .toMatchObject({ commitSha: initialArtifactTipSha });

      await runFixtureGit(root, ['switch', 'docs/revalidation-refresh']);

      await writeFile(resolve(root, 'docs/release.md'), 'Corrected reviewed artifact.\n');
      await runFixtureGit(root, ['add', 'docs/release.md']);
      await runFixtureGit(root, ['commit', '-m', 'fixture corrected artifact']);
      const correctedArtifactTipSha = await runFixtureGit(root, ['rev-parse', 'HEAD']);

      const entry = {
        id: 'revalidation-refresh',
        worktree: root,
        startedAt: '2026-09-10T00:00:00.000Z',
        status: 'active',
        intent: 'fixture receipt refresh',
        workType: 'documentation',
        scopes: ['docs/release.md'],
        claims: ['fixture-revalidation-refresh'],
        branchName: 'docs/revalidation-refresh',
        startBranchSha: baseSha,
        startMainSha: baseSha,
        versionPlan: 'Documentation-only; no application version change.',
        preemptiveChangelog: 'No player-facing change.',
        validation: initialValidation,
      };
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await execFileAsync(process.execPath, [
        scriptPath,
        'validate',
        '--id',
        entry.id,
        '--documentation-review',
        'Corrected artifact reviewed.',
      ], {
        cwd: root,
        env: { ...process.env, CODEX_COORDINATION_FILE: filePath },
        encoding: 'utf8',
      });

      const revalidatedState = JSON.parse(await readFile(filePath, 'utf8'));
      expect(revalidatedState.entries[0]?.validation).toMatchObject({
        commitSha: correctedArtifactTipSha,
        files: ['docs/release.md'],
        profile: {
          evidence: {
            baseSha,
            branchSha: correctedArtifactTipSha,
          },
        },
        provenanceRefresh: {
          previousCommitSha: initialArtifactTipSha,
          previousTaskTipSha: initialArtifactTipSha,
          files: ['docs/release.md'],
        },
        reviews: { documentation: 'Corrected artifact reviewed.' },
      });
      expect(revalidatedState.entries[0]?.validationHistory).toEqual([
        expect.objectContaining({ commitSha: initialArtifactTipSha }),
      ]);

      await runFixtureGit(root, ['switch', 'main']);
      await runFixtureGit(root, ['merge', '--ff-only', 'docs/revalidation-refresh']);
      await runFixtureGit(root, ['push', 'origin', 'main']);
      await runFixtureGit(root, ['switch', 'docs/revalidation-refresh']);

      const { stdout: finishOutput } = await execFileAsync(process.execPath, [
        scriptPath, 'finish', '--id', entry.id,
      ], {
        cwd: root,
        env: { ...process.env, CODEX_COORDINATION_FILE: filePath },
        encoding: 'utf8',
      });

      expect(finishOutput).toMatch(/Completed coordination entry revalidation-refresh/);
      expect(JSON.parse(await readFile(filePath, 'utf8')).entries[0]).toMatchObject({
        status: 'complete',
        outcome: 'landed',
        finalBranchSha: correctedArtifactTipSha,
        mainSha: correctedArtifactTipSha,
        originMainSha: correctedArtifactTipSha,
        pushed: true,
      });
    } finally {
      await rm(rootPath, { recursive: true, force: true });
      await rm(originPath, { recursive: true, force: true });
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  }, 15_000);

  it('preserves committed work only after its remote destination is verified', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-preserve-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify({ version: 1, entries: [releaseEntry], reservations: [], configurations: [] }));
      await finishCoordinationEntry(filePath, {
        id: releaseEntry.id,
        outcome: 'preserved',
        'preserve-ref': 'origin/fix/release-task',
        release: releaseState({ mainContainsBranch: false }),
        preservedRefSha: 'branch-sha',
      });
      expect((await readCoordinationState(filePath)).entries[0]).toMatchObject({
        status: 'complete', outcome: 'preserved', pushed: false,
        preservation: { kind: 'remote-ref', destination: 'origin/fix/release-task', commitSha: 'branch-sha' },
      });
    } finally { await unlink(filePath).catch(() => undefined); }
  });

  it('rejects an unverified preservation destination without closing the entry', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-preserve-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify({ version: 1, entries: [releaseEntry], reservations: [], configurations: [] }));
      await expect(finishCoordinationEntry(filePath, {
        id: releaseEntry.id, outcome: 'preserved', 'preserve-ref': 'origin/fix/release-task',
        release: releaseState({ mainContainsBranch: false }), preservedRefSha: 'other-sha',
      })).rejects.toThrow(/destination does not contain branch commit/i);
      expect((await readCoordinationState(filePath)).entries[0]?.status).toBe('active');
    } finally { await unlink(filePath).catch(() => undefined); }
  });

  it('records an explicit clean discard without implying a merge or push', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-discard-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify({ version: 1, entries: [releaseEntry], reservations: [], configurations: [] }));
      await finishCoordinationEntry(filePath, {
        id: releaseEntry.id, outcome: 'discarded', reason: 'Superseded by another implementation.',
        release: releaseState({ mainContainsBranch: false }),
      });
      expect((await readCoordinationState(filePath)).entries[0]).toMatchObject({
        status: 'complete', outcome: 'discarded', pushed: false,
        discard: { reason: 'Superseded by another implementation.', branchSha: 'branch-sha' },
      });
    } finally { await unlink(filePath).catch(() => undefined); }
  });

  it('rejects discard when the checkout is dirty or no reason is supplied', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-discard-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify({ version: 1, entries: [releaseEntry], reservations: [], configurations: [] }));
      await expect(finishCoordinationEntry(filePath, {
        id: releaseEntry.id, outcome: 'discarded', release: releaseState(),
      })).rejects.toThrow(/reason is required/i);
      await expect(finishCoordinationEntry(filePath, {
        id: releaseEntry.id, outcome: 'discarded', reason: 'Stop work',
        release: releaseState({ worktreeClean: false }),
      })).rejects.toThrow(/uncommitted changes/i);
    } finally { await unlink(filePath).catch(() => undefined); }
  });

  it('rejects changed files outside a declared scope before validation runs', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-scope-${randomUUID()}.json`);
    try {
      await writeFile(filePath, JSON.stringify({ version: 1, entries: [{
        ...releaseEntry, workType: 'tooling', scopes: ['scripts/'],
      }], reservations: [], configurations: [] }));
      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({ mainContainsBranch: false, mainIsAncestorOfBranch: true, changedFiles: ['src/App.tsx'] }),
        commandRunner: async () => undefined,
      })).rejects.toThrow(/outside declared scope.*src\/App\.tsx/i);
    } finally { await unlink(filePath).catch(() => undefined); }
  });

  it('rejects completion while the worktree owns a live emulator reservation', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-release-gate-${randomUUID()}.json`);

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        versionAgreement: 'agreement',
        entries: [releaseEntry],
        reservations: [{
          id: 'live-rules-reservation',
          slot: 4,
          worktree: process.cwd(),
          kind: 'rules',
          pid: process.pid,
          command: 'npm run test:rules',
          claimedAt: '2026-09-07T00:05:00.000Z',
        }],
        configurations: [],
      }), 'utf8');

      await expect(finishCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState(),
      })).rejects.toThrow(/live.*reservation|stop.*process|teardown/i);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('allows a merged tooling branch to retain the older application version', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        versionPlan: 'Tooling-only; no application version bump.',
      },
      release: releaseState({
        branchVersion: '0.2.102',
        mainVersion: '0.2.106',
        branchLockVersion: '0.2.102',
        mainLockVersion: '0.2.106',
        branchChangelog: [{ version: '0.2.102', source: 'tooling base' }],
        mainChangelog: [{ version: '0.2.106', source: 'newer main release' }],
      }),
    })).not.toThrow();
  });

  it('uses structured work type instead of free-text wording for version gates', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        workType: 'product',
        implementationPrompt: 15,
        versionPlan: 'Product change; no application version bump was written yet.',
      },
      release: releaseState({
        mainContainsBranch: false,
        branchVersion: '0.3.2',
        branchLockVersion: '0.3.2',
        branchChangelog: [{ version: '0.3.2', source: 'previous release' }],
        changedFiles: ['docs/IMPLEMENTATION_PROGRESS.md'],
      }),
    })).toThrow(/player-facing work must increment|version plan/i);
  });

  it('requires product work to identify a plan prompt', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        workType: 'product',
        versionPlan: 'Reserve application patch version 0.3.3.',
      },
      release: releaseState({
        changedFiles: ['docs/IMPLEMENTATION_PROGRESS.md'],
      }),
    })).toThrow(/implementation prompt/i);
  });

  it('requires plan-backed product work to update the progress ledger', () => {
    expect(() => validateReleaseCompletion({
      entry: {
        ...releaseEntry,
        workType: 'product',
        implementationPrompt: 15,
        versionPlan: 'Reserve application patch version 0.3.3.',
      },
      release: releaseState({
        changedFiles: ['src/App.tsx'],
      }),
    })).toThrow(/IMPLEMENTATION_PROGRESS/i);
  });

  it('accepts a validated product release fragment while the branch leaves central metadata untouched', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-plan-fragment-${randomUUID()}.json`);
      const fragment = {
        baseVersion: '0.3.23',
        taskId: releaseEntry.id,
        implementationPrompts: ['141'],
      implementationProgress: {
        completed: 86,
        total: 730,
        percentage: '11.78%',
        done: 86,
        partial: 24,
        active: 0,
        missing: 620,
      },
      changes: ['A release-lane feature note.'],
      validated: true,
    };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [{
          ...releaseEntry,
          workType: 'product',
          implementationPrompt: 141,
          versionPlan: 'Reserve application patch version 0.3.24.',
          scopes: ['scripts/feature.mjs'],
        }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          branchVersion: '0.3.24',
          branchLockVersion: '0.3.24',
          branchChangelog: [
            { version: '0.3.24', source: 'A release-lane feature note.' },
            { version: '0.3.23', source: 'previous release' },
          ],
          changedFiles: ['scripts/feature.mjs'],
        }),
        releaseFragment: fragment,
        commandRunner: async () => undefined,
      })).resolves.toMatchObject({ id: releaseEntry.id });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });

  it('loads and validates a task-bound release fragment from the coordination validate file option', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-plan-fragment-cli-${randomUUID()}.json`);
    const fragmentPath = resolve(tmpdir(), `den-of-wolves-plan-fragment-${randomUUID()}.json`);
    const applicationVersion = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8')).version;
    const entry = {
      ...releaseEntry,
      workType: 'product',
      implementationPrompt: 141,
      versionPlan: `Reserve application patch version ${applicationVersion}.`,
      scopes: ['scripts/feature.mjs'],
    };
    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [entry],
        reservations: [],
        configurations: [],
      }), 'utf8');
      await writeFile(fragmentPath, JSON.stringify({
        id: 'release-fragment-cli',
        taskId: entry.id,
        baseVersion: applicationVersion,
        changes: ['A CLI-loaded release note.'],
        implementationPrompts: ['141'],
      }), 'utf8');

      const validated = await validateCoordinationEntry(filePath, {
        id: entry.id,
        release: releaseState({
          branchVersion: nextApplicationVersion(applicationVersion),
          branchLockVersion: nextApplicationVersion(applicationVersion),
          mainVersion: applicationVersion,
          mainLockVersion: applicationVersion,
          branchChangelog: [
            { version: nextApplicationVersion(applicationVersion), source: 'A CLI-loaded release note.' },
            { version: applicationVersion, source: 'previous release' },
          ],
          mainChangelog: [
            { version: applicationVersion, source: 'previous release' },
          ],
          changedFiles: ['scripts/feature.mjs'],
        }),
        'release-fragment-file': fragmentPath,
        'release-fragment-id': 'release-fragment-cli',
        commandRunner: async () => undefined,
      });
      expect(validated.validation?.releaseFragment).toMatchObject({
        id: 'release-fragment-cli',
        taskId: entry.id,
        validated: true,
      });
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
      await unlink(`${filePath}.validation-queue.json`).catch(() => undefined);
      await unlink(`${filePath}.validation-queue.json.lock`).catch(() => undefined);
      await unlink(fragmentPath).catch(() => undefined);
    }
  });

  it('does not let an unvalidated or foreign release fragment waive product metadata gates', () => {
    const productEntry = {
      ...releaseEntry,
      workType: 'product' as const,
      implementationPrompt: 141,
      versionPlan: 'Reserve application patch version 0.3.3.',
    };
    const release = releaseState({ changedFiles: ['scripts/example.mjs'] });

    expect(() => validateReleaseCompletion({
      entry: productEntry,
      release,
      releaseFragment: {
        taskId: 'different-task',
        validated: true,
        changes: ['A note.'],
      },
    })).toThrow(/task-bound|IMPLEMENTATION_PROGRESS/i);

    expect(() => validateReleaseCompletion({
      entry: productEntry,
      release,
      releaseFragment: {
        taskId: productEntry.id,
        validated: false,
        changes: ['A note.'],
      },
    })).toThrow(/validated|IMPLEMENTATION_PROGRESS/i);
  });

  it('runs the required prompt through the progress gate before validation commands', async () => {
    const filePath = resolve(tmpdir(), `den-of-wolves-plan-gate-${randomUUID()}.json`);

    try {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: [{
          ...releaseEntry,
          workType: 'product',
          implementationPrompt: 999,
          scopes: ['docs/'],
          validation: undefined,
        }],
        reservations: [],
        configurations: [],
      }), 'utf8');

      await expect(validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState({
          changedFiles: ['docs/IMPLEMENTATION_PROGRESS.md'],
        }),
        commandRunner: async () => {
          throw new Error('validation commands should not run');
        },
      })).rejects.toThrow(/required implementation-plan Prompt 999/i);
    } finally {
      await unlink(filePath).catch(() => undefined);
      await unlink(`${filePath}.lock`).catch(() => undefined);
    }
  });
});
