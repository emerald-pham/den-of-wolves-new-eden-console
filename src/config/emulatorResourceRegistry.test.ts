import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chooseAvailableEmulatorSlot,
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
} from '../../scripts/emulator-resource-registry.mjs';

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
});
