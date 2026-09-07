import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chooseAvailableEmulatorSlot,
  finishCoordinationEntry,
  formatCoordinationState,
  isPortFree,
  parseCoordinationState,
  pruneOrphanedConfigurations,
  readCoordinationState,
  releaseEmulatorSlot,
  reserveAvailableEmulatorSlot,
  reserveAvailableConfiguredEmulatorSlot,
  reserveConfiguredEmulatorSlot,
  reserveEmulatorSlot,
  validationPlanForFiles,
  validateCoordinationEntry,
  validateReleaseCompletion,
} from '../../scripts/emulator-resource-registry.mjs';

const codeValidation = {
  commitSha: 'branch-sha',
  completedAt: '2026-09-07T00:05:00.000Z',
  passed: true,
  commands: [
    'git diff --check',
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
  versionPlan: 'Reserve application patch version 0.2.103.',
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
    branchVersion: '0.2.103',
    mainVersion: '0.2.102',
    branchLockVersion: '0.2.103',
    mainLockVersion: '0.2.102',
    branchChangelog: [
      { version: '0.2.103', source: 'new release' },
      { version: '0.2.102', source: 'previous release' },
    ],
    mainChangelog: [
      { version: '0.2.102', source: 'previous release' },
    ],
    changedFiles: ['scripts/example.mjs'],
    ...overrides,
  };
}

describe('local emulator coordination', () => {
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

  it('derives the documented validation plan from changed files', () => {
    expect(validationPlanForFiles(['README.md', 'docs/WORKTREE_COORDINATION.md'])).toEqual({
      documentationOnly: true,
      requiresDocumentationReview: true,
      requiresVisualReview: false,
      commands: ['git diff --check'],
    });
    expect(validationPlanForFiles(['src/routes/ShipConsole.tsx'])).toEqual({
      documentationOnly: false,
      requiresDocumentationReview: false,
      requiresVisualReview: true,
      commands: [
        'git diff --check',
        'npm run lint',
        'npm run test:all',
        'npm run build',
        'npm run build --prefix functions',
      ],
    });
  });

  it('records a passing validation receipt against the exact branch SHA', async () => {
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

      await validateCoordinationEntry(filePath, {
        id: releaseEntry.id,
        release: releaseState(),
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
      });
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
});
