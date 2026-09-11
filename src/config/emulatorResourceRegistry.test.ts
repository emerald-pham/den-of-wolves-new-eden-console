import { execFile, execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { promisify } from 'node:util';
import {
  beginCoordinationEntry,
  chooseAvailableEmulatorSlot,
  changedFilesBaseRef,
  finishCoordinationEntry,
  forecastCoordinationConflicts,
  parseChangelogSnapshot,
  parseCoordinationState,
  prepareValidationEmulator,
  readReleaseState,
  cleanupValidationEmulator,
  releaseConfiguredEmulatorSlot,
  reserveConfiguredEmulatorSlot,
  validationPlanForFiles,
  validateCoordinationEntry,
} from '../../scripts/emulator-resource-registry.mjs';

const repositoryDirectory = process.cwd();
const execFileAsync = promisify(execFile);

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), `emulator-registry-${randomUUID()}-`));
  return { directory, filePath: resolve(directory, 'coordination.json') };
}

function releaseSnapshot(changedFiles: readonly string[], branchSha = 'validated-branch') {
  return {
    branchName: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repositoryDirectory, encoding: 'utf8' }).trim(),
    branchSha,
    mainSha: 'main-sha',
    originMainSha: 'main-sha',
    mainContainsBranch: true,
    mainIsAncestorOfBranch: true,
    worktreeClean: true,
    changedFiles: [...changedFiles],
    branchVersion: '0.3.28',
    mainVersion: '0.3.28',
    branchLockVersion: '0.3.28',
    mainLockVersion: '0.3.28',
    branchChangelog: [{ version: '0.3.28', source: 'current release' }],
    mainChangelog: [{ version: '0.3.28', source: 'current release' }],
  };
}

async function releaseGitFixture({ largeDiff = false }: { largeDiff?: boolean } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), `emulator-release-${randomUUID()}-`));
  const remote = resolve(root, 'remote.git');
  const directory = resolve(root, 'checkout');
  await execFileAsync('git', ['init', '--bare', remote]);
  await execFileAsync('git', ['init', '-b', 'main', directory]);
  await execFileAsync('git', ['config', 'user.email', 'runtime@example.test'], { cwd: directory });
  await execFileAsync('git', ['config', 'user.name', 'Runtime Test'], { cwd: directory });
  await execFileAsync('git', ['remote', 'add', 'origin', remote], { cwd: directory });
  await mkdir(resolve(directory, 'src'), { recursive: true });
  await mkdir(resolve(directory, 'scripts'), { recursive: true });
  await writeFile(resolve(directory, 'package.json'), '{"name":"release-fixture","version":"1.0.0"}\n');
  await writeFile(resolve(directory, 'package-lock.json'), '{"name":"release-fixture","version":"1.0.0","lockfileVersion":3,"packages":{"":{"name":"release-fixture","version":"1.0.0"}}}\n');
  await writeFile(resolve(directory, 'src/changelog.ts'), 'export const entries = [{ version: APP_VERSION, text: \'fixture\' }];\n');
  await execFileAsync('git', ['add', '.'], { cwd: directory });
  await execFileAsync('git', ['commit', '-m', 'fixture baseline'], { cwd: directory });
  await execFileAsync('git', ['push', '-u', 'origin', 'main'], { cwd: directory });
  await execFileAsync('git', ['switch', '-c', 'tooling/late-registration'], { cwd: directory });
  await writeFile(resolve(directory, 'scripts/task.mjs'), 'export const task = true;\n');
  if (largeDiff) {
    await writeFile(
      resolve(directory, 'scripts/catalog-sized-change.mjs'),
      `export const catalog = ${JSON.stringify('x'.repeat(1_100_000))};\n`,
    );
  }
  await execFileAsync('git', ['add', 'scripts'], { cwd: directory });
  await execFileAsync('git', ['commit', '-m', 'candidate change'], { cwd: directory });
  const branchSha = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: directory })).stdout.trim();
  const mainSha = (await execFileAsync('git', ['rev-parse', 'main'], { cwd: directory })).stdout.trim();
  return { root, directory, branchSha, mainSha };
}

async function waitForFile(path: string, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, 'utf8');
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code !== 'ENOENT') throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

describe('simplified coordination registry', () => {
  it('preserves existing records while making source scopes advisory', () => {
    const state = parseCoordinationState(JSON.stringify({
      version: 1,
      entries: [{ id: 'legacy', worktree: '/other/worktree', status: 'active', scopes: ['src/store'] }],
      reservations: [],
      configurations: [],
      retainedField: 'untouched',
    }));

    expect(state.retainedField).toBe('untouched');
    const sourceForecast = forecastCoordinationConflicts({
      activeEntries: state.entries,
      worktree: repositoryDirectory,
      scopes: ['src/store/sessionService.ts'],
    });
    expect(sourceForecast.blocked).toBe(false);
  });

  it('blocks central claims and concrete shared resources across worktrees', () => {
    const owner = {
      id: 'owner',
      worktree: '/other/worktree',
      status: 'active',
      claims: ['package.json'],
      resources: ['firebase-emulator:0'],
      startedAt: '2026-09-11T00:00:00.000Z',
    };

    expect(forecastCoordinationConflicts({
      activeEntries: [owner],
      worktree: repositoryDirectory,
      claims: ['package.json'],
    }).blocked).toBe(true);
    expect(forecastCoordinationConflicts({
      activeEntries: [owner],
      worktree: repositoryDirectory,
      resources: ['firebase-emulator:0'],
    }).conflicts[0]?.type).toBe('resource');
  });

  it('keeps emulator slots isolated without age-based takeover', () => {
    expect(chooseAvailableEmulatorSlot({
      preferredSlot: 0,
      availableSlots: [0, 1],
      worktree: '/current/worktree',
      kind: 'firebase',
      reservations: [{ slot: 0, worktree: '/other/worktree', kind: 'firebase', pid: 1 }],
    })).toBe(1);

    return fixture().then(async ({ directory, filePath }) => {
      try {
        const first = await reserveConfiguredEmulatorSlot({
          filePath,
          slot: 0,
          worktree: '/other/worktree',
          ports: [5500],
          portCheck: async () => true,
        });
        await expect(reserveConfiguredEmulatorSlot({
          filePath,
          slot: 0,
          worktree: '/current/worktree',
          ports: [5500],
          portCheck: async () => true,
        })).rejects.toThrow(/Cannot claim emulator slot 0/);
        await releaseConfiguredEmulatorSlot(first, filePath);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });

  it('serializes stale-lock recovery and preserves concurrent configuration writes', async () => {
    const { directory, filePath } = await fixture();
    const lockPath = `${filePath}.lock`;
    const recoveryPath = `${lockPath}.recovery`;
    try {
      await writeFile(lockPath, `${JSON.stringify({ pid: 999_999_999, token: 'stale-owner' })}\n`);
      const first = reserveConfiguredEmulatorSlot({
        filePath,
        slot: 0,
        worktree: '/worktrees/first',
        ports: [5600],
        portCheck: async () => true,
      });
      await expect(waitForFile(recoveryPath)).resolves.toContain('pid');
      const second = reserveConfiguredEmulatorSlot({
        filePath,
        slot: 1,
        worktree: '/worktrees/second',
        ports: [5610],
        portCheck: async () => true,
      });
      const [firstConfiguration, secondConfiguration] = await Promise.all([first, second]);
      const state = JSON.parse(await readFile(filePath, 'utf8'));
      expect(state.configurations.map((configuration: { id: string }) => configuration.id).sort())
        .toEqual([firstConfiguration.id, secondConfiguration.id].sort());
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serializes same-worktree validation setup before reserving an emulator row', async () => {
    const root = await mkdtemp(resolve(tmpdir(), `validation-setup-${randomUUID()}-`));
    const filePath = resolve(root, 'coordination.json');
    const configurationPath = resolve(root, 'firebase.local.json');
    const environmentPath = resolve(root, '.env.emulators.local');
    const activeConfigurations: Array<{ id: string; slot: number; worktree: string }> = [];
    let reserveCalls = 0;
    const reserve = async () => {
      const configuration = { id: `configuration-${++reserveCalls}`, slot: reserveCalls - 1, worktree: root };
      activeConfigurations.splice(0, activeConfigurations.length, configuration);
      return configuration;
    };
    const release = async (configuration: { id: string }) => {
      const index = activeConfigurations.findIndex((candidate) => candidate.id === configuration.id);
      if (index >= 0) activeConfigurations.splice(index, 1);
    };
    try {
      const [first, second] = await Promise.all([
        prepareValidationEmulator({
          environment: {}, repositoryDirectory: root, coordinationPath: filePath,
          localFirebaseConfigPath: configurationPath, localEnvironmentPath: environmentPath,
          reserve, release, baseConfig: { emulators: {} },
        }),
        prepareValidationEmulator({
          environment: {}, repositoryDirectory: root, coordinationPath: filePath,
          localFirebaseConfigPath: configurationPath, localEnvironmentPath: environmentPath,
          reserve, release, baseConfig: { emulators: {} },
        }),
      ]);

      expect(reserveCalls).toBe(1);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(activeConfigurations).toEqual([{ id: first.configurationId!, slot: first.slot!, worktree: root }]);
      expect(await readFile(configurationPath, 'utf8')).toContain('firestore');
      await cleanupValidationEmulator(first, { release });
      expect(activeConfigurations).toEqual([]);
      await expect(readFile(configurationPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(environmentPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('releases its configuration when cleanup cannot unlink an owned file', async () => {
    const root = await mkdtemp(resolve(tmpdir(), `validation-cleanup-${randomUUID()}-`));
    const configurationPath = resolve(root, 'firebase.local.json');
    const environmentPath = resolve(root, '.env.emulators.local');
    const configuration = { id: 'configuration-owned', slot: 0, worktree: root };
    const released: string[] = [];
    try {
      const prepared = await prepareValidationEmulator({
        environment: {}, repositoryDirectory: root, coordinationPath: resolve(root, 'coordination.json'),
        localFirebaseConfigPath: configurationPath, localEnvironmentPath: environmentPath,
        reserve: async () => configuration,
        release: async (owned: { id: string }) => { released.push(owned.id); },
        baseConfig: { emulators: {} },
      });
      await writeFile(configurationPath, 'replacement-owned-by-another-process\n');
      await chmod(root, 0o500);
      await expect(cleanupValidationEmulator(prepared, {
        release: async (owned: { id: string }) => { released.push(owned.id); },
      })).rejects.toMatchObject({ code: 'EACCES' });
      expect(released).toEqual(['configuration-owned']);
      await chmod(root, 0o700);
      expect(await readFile(configurationPath, 'utf8')).toBe('replacement-owned-by-another-process\n');
    } finally {
      await chmod(root, 0o700).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('supports begin, amend, park, and resume without a session artifact', async () => {
    const { directory, filePath } = await fixture();
    try {
      await execFileAsync('git', ['init', '-b', 'main'], { cwd: directory });
      await execFileAsync('git', ['config', 'user.email', 'runtime@example.test'], { cwd: directory });
      await execFileAsync('git', ['config', 'user.name', 'Runtime Test'], { cwd: directory });
      await writeFile(resolve(directory, 'README.md'), 'fixture\n');
      await writeFile(resolve(directory, '.gitignore'), 'coordination.json*\n');
      await execFileAsync('git', ['add', 'README.md', '.gitignore'], { cwd: directory });
      await execFileAsync('git', ['commit', '-m', 'fixture'], { cwd: directory });
      await execFileAsync('git', ['switch', '-c', 'tooling/runtime'], { cwd: directory });
      const scriptUrl = pathToFileURL(resolve(repositoryDirectory, 'scripts/emulator-resource-registry.mjs')).href;
      const code = `
        import { beginCoordinationEntry, amendCoordinationEntry, parkCoordinationEntry, resumeCoordinationEntry } from ${JSON.stringify(scriptUrl)};
        const filePath = ${JSON.stringify(filePath)};
        const started = await beginCoordinationEntry(filePath, { intent: 'runtime lifecycle', 'work-type': 'tooling', scope: 'scripts/runtime.mjs', claims: 'validation-queue' });
        if (started.status !== 'active' || started.sessionGoals !== undefined) throw new Error('begin lifecycle failed');
        const amended = await amendCoordinationEntry(filePath, { id: started.id, resources: 'firebase-emulator:1' });
        if (!amended.resources.includes('firebase-emulator:1')) throw new Error('amend lifecycle failed');
        const checkpoint = (await import('node:child_process')).execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        const parked = await parkCoordinationEntry(filePath, { id: started.id, 'checkpoint-sha': checkpoint, 'next-action': 'resume after review' });
        if (parked.status !== 'parked') throw new Error('park lifecycle failed');
        const resumed = await resumeCoordinationEntry(filePath, { id: started.id });
        if (resumed.status !== 'active' || resumed.parked?.status !== 'resumed') throw new Error('resume lifecycle failed');
      `;
      await execFileAsync(process.execPath, ['--input-type=module', '--eval', code], { cwd: directory });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('runs validation outside the coordination lock and records a simple result', async () => {
    const { directory, filePath } = await fixture();
    let runnerStarted: () => void = () => undefined;
    const runnerReady = new Promise<void>((resolvePromise) => { runnerStarted = resolvePromise; });
    let releaseRunner: () => void = () => undefined;
    const runnerReleased = new Promise<void>((resolvePromise) => { releaseRunner = resolvePromise; });
    try {
      const started = await beginCoordinationEntry(filePath, {
        intent: 'short lock validation',
        'work-type': 'tooling',
        scope: 'scripts/runtime.mjs',
      });
      const release = releaseSnapshot(['scripts/runtime.mjs']);
      const validation = validateCoordinationEntry(filePath, {
        id: started.id,
        release,
        commandRunner: async () => {
          runnerStarted();
          await runnerReleased;
        },
      });
      await runnerReady;

      const reservation = await Promise.race([
        reserveConfiguredEmulatorSlot({
          filePath,
          slot: 0,
          worktree: repositoryDirectory,
          ports: [5600],
          portCheck: async () => true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('coordination lock remained held')), 500)),
      ]) as Awaited<ReturnType<typeof reserveConfiguredEmulatorSlot>>;
      await releaseConfiguredEmulatorSlot(reservation, filePath);
      releaseRunner();
      const completed = await validation;
      expect(completed.validation?.passed).toBe(true);
      expect(completed.validation?.commitSha).toBe('validated-branch');
      expect(completed.validation?.profile.kind).toBe('tooling');
      expect(completed.validation?.outcomes.length).toBeGreaterThan(0);
    } finally {
      releaseRunner();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('runs a diff check for an unchanged candidate instead of recording an empty pass', async () => {
    const { directory, filePath } = await fixture();
    try {
      const started = await beginCoordinationEntry(filePath, {
        intent: 'unchanged validation',
        'work-type': 'tooling',
      });
      const commands: string[] = [];
      const completed = await validateCoordinationEntry(filePath, {
        id: started.id,
        release: releaseSnapshot([]),
        commandRunner: async (command) => { commands.push(command); },
      });
      expect(completed.validation?.profile.kind).toBe('no-changes');
      expect(commands).toEqual(['git diff --check']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects reuse for a dirty candidate and verifies a clean landed finish', async () => {
    const { directory, filePath } = await fixture();
    try {
      const started = await beginCoordinationEntry(filePath, { intent: 'finish lifecycle', 'work-type': 'tooling' });
      const release = releaseSnapshot(['scripts/runtime.mjs']);
      const validated = await validateCoordinationEntry(filePath, {
        id: started.id,
        release,
        commandRunner: async () => undefined,
      });
      await expect(validateCoordinationEntry(filePath, {
        id: started.id,
        release: { ...release, worktreeClean: false },
        commandRunner: async () => { throw new Error('dirty candidate was executed'); },
      })).rejects.toThrow(/clean branch/);

      const packageJson = JSON.parse(await readFile(resolve(repositoryDirectory, 'package.json'), 'utf8'));
      const changelogSource = await readFile(resolve(repositoryDirectory, 'src/changelog.ts'), 'utf8');
      const currentChangelog = parseChangelogSnapshot(changelogSource, packageJson.version);
      const finished = await finishCoordinationEntry(filePath, {
        id: started.id,
        outcome: 'landed',
        release: {
          ...release,
          branchSha: validated.validation?.commitSha ?? 'validated-branch',
          branchVersion: packageJson.version,
          mainVersion: packageJson.version,
          branchLockVersion: packageJson.version,
          mainLockVersion: packageJson.version,
          branchChangelog: currentChangelog,
          mainChangelog: currentChangelog,
        },
      });
      expect(finished.status).toBe('complete');
      expect(finished.outcome).toBe('landed');
      expect(finished.pushed).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('classifies tooling changes with the affected validation profile', () => {
    const plan = validationPlanForFiles(['scripts/runtime.mjs']);
    expect(plan.profile.kind).toBe('tooling');
    expect(plan.requiresReview).toBe(false);
    expect(plan.commands).toContain('npm run lint');
  });

  it('uses current main for late registration and keeps the validated diff after landing', () => {
    expect(changedFilesBaseRef({
      mainSha: 'current-main',
      startBranchSha: 'candidate',
      mainContainsBranch: false,
      mainIsAncestorOfBranch: true,
    })).toBe('current-main');
    expect(changedFilesBaseRef({
      mainSha: 'landed-main',
      startBranchSha: 'candidate',
      mainContainsBranch: true,
      mainIsAncestorOfBranch: true,
      validatedBaseSha: 'validated-main',
      validatedBaseIsAncestorOfMain: true,
    })).toBe('validated-main');
  });

  it('derives late-registration files from current main and retains them after landing', async () => {
    const fixtureState = await releaseGitFixture();
    try {
      const beforeLanding = await readReleaseState({
        cwd: fixtureState.directory,
        startBranchSha: fixtureState.branchSha,
      });
      expect(beforeLanding.mainSha).toBe(fixtureState.mainSha);
      expect(beforeLanding.mainIsAncestorOfBranch).toBe(true);
      expect(beforeLanding.changedFiles).toContain('scripts/task.mjs');
      const validation = {
        passed: true,
        commitSha: fixtureState.branchSha,
        profile: beforeLanding.validationProfile!,
        files: beforeLanding.changedFiles,
        commands: [],
        outcomes: [],
        baseSha: beforeLanding.validationProfile?.evidence?.baseSha as string,
        diffIdentity: beforeLanding.validationProfile?.evidence?.diffIdentity as string,
        validatedAt: '2026-09-11T00:00:00.000Z',
      };
      await execFileAsync('git', ['switch', 'main'], { cwd: fixtureState.directory });
      await execFileAsync('git', ['merge', '--ff-only', 'tooling/late-registration'], { cwd: fixtureState.directory });
      await execFileAsync('git', ['push', 'origin', 'main'], { cwd: fixtureState.directory });
      await execFileAsync('git', ['switch', 'tooling/late-registration'], { cwd: fixtureState.directory });
      const afterLanding = await readReleaseState({
        cwd: fixtureState.directory,
        startBranchSha: fixtureState.branchSha,
        validation,
      });
      expect(afterLanding.mainContainsBranch).toBe(true);
      expect(afterLanding.changedFiles).toContain('scripts/task.mjs');
      expect(afterLanding.validationProfile?.evidence?.baseSha).toBe(beforeLanding.validationProfile?.evidence?.baseSha);
    } finally {
      await rm(fixtureState.root, { recursive: true, force: true });
    }
  });

  it('reads an actual release state whose diff exceeds git\'s default output buffer', async () => {
    const fixtureState = await releaseGitFixture({ largeDiff: true });
    try {
      const release = await readReleaseState({
        cwd: fixtureState.directory,
        startBranchSha: fixtureState.branchSha,
      });
      expect(release.changedFiles).toContain('scripts/catalog-sized-change.mjs');
      expect(release.validationProfile?.evidence?.diffIdentity).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await rm(fixtureState.root, { recursive: true, force: true });
    }
  });
});
