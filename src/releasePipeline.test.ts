import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { applyReleaseFragment, prepareReleaseFragmentFile } from '../scripts/coordination-throughput.mjs';
import {
  finalizeReleaseFragment,
  prepareCoordinationReleaseFragment,
} from '../scripts/emulator-resource-registry.mjs';
import {
  readImplementationProgress,
  validateImplementationProgress,
} from '../scripts/validate-implementation-progress.mjs';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const emulatorCommand = readFileSync('scripts/run-emulator-command.mjs', 'utf8');
const configureEmulatorCommand = readFileSync('scripts/configure-emulator-slot.mjs', 'utf8');
const coordinationRegistryCommand = readFileSync('scripts/emulator-resource-registry.mjs', 'utf8');
const throughputCommand = readFileSync('scripts/coordination-throughput.mjs', 'utf8');
const firestoreIndexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as {
  fieldOverrides: Array<{
    collectionGroup: string;
    fieldPath: string;
    ttl?: boolean;
    indexes: unknown[];
  }>;
};
const FIREBASE_CLI = 'firebase-tools@15.29.0';
const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return stdout.trim();
}

function currentImplementationProgress() {
  const source = readFileSync('src/changelog.ts', 'utf8');
  const block = source.match(/implementationProgress:\s*{([\s\S]*?)}/)?.[1] ?? '';
  const number = (field: string) => Number.parseInt(block.match(new RegExp(`${field}:\\s*(\\d+)`))?.[1] ?? '0', 10);
  return {
    completed: number('completed'),
    total: number('total'),
    percentage: block.match(/percentage:\s*'([^']+)'/)?.[1] ?? '0.00%',
    done: number('done'),
    partial: number('partial'),
    active: number('active'),
    missing: number('missing'),
  };
}

it('tests Firestore rules before a main-branch deployment', () => {
  const rulesTest = deploy.indexOf('npm run test:rules');
  const deployment = deploy.indexOf(`${FIREBASE_CLI} deploy`);

  expect(rulesTest).toBeGreaterThan(-1);
  expect(deployment).toBeGreaterThan(rulesTest);
});

it('does not repeat unit tests during deployment after the pre-push gate', () => {
  expect(ci).toMatch(/^\s*run:\s+npm test\s*$/m);
  expect(deploy).not.toMatch(/^\s*run:\s+npm test\s*$/m);
});

it('deploys only the Firebase surfaces affected by a push', () => {
  expect(deploy).toContain('Determine deployment targets');
  expect(deploy).toContain("package.json|package-lock.json|index.html|public/*|src/*|tsconfig*.json|vite.config.*");
  expect(deploy).toContain("functions/*");
  expect(deploy).toContain("firestore.rules|firestore.indexes.json");
  expect(deploy).toContain('--only "${{ steps.targets.outputs.targets }}"');
  expect(deploy).not.toContain('--only hosting,firestore,functions');
});

it('deploys every Firebase surface when manually dispatched', () => {
  expect(deploy).toContain('github.event_name == \'workflow_dispatch\'');
  expect(deploy).toContain('targets=hosting,firestore,functions');
});

it('uses a version-pinned Firebase CLI throughout CI and deployment', () => {
  expect(packageJson.scripts['test:rules']).toContain('run-emulator-command.mjs');
  expect(emulatorCommand).toContain(FIREBASE_CLI);
  expect(ci).toContain('npm run test:rules');
  expect(deploy).toContain('npm run test:rules');
  expect(deploy).toContain(FIREBASE_CLI);
  expect(ci).not.toContain('firebase-tools@latest');
  expect(deploy).not.toContain('firebase-tools@latest');
  expect(emulatorCommand).not.toContain('firebase-tools@latest');
});

it('runs the rules emulator under the same project ID as the rules harness', () => {
  expect(emulatorCommand).toContain("RULES_PROJECT_ID = 'dow-new-eden-rules-test'");
  expect(emulatorCommand).toMatch(
    /emulators:exec[\s\S]*?--project[\s\S]*?RULES_PROJECT_ID/,
  );
});

it('coordinates emulator commands and gives rules tests an isolated fallback slot', () => {
  expect(emulatorCommand).toContain('reserveAvailableEmulatorSlot');
  expect(emulatorCommand).toContain('firebaseConfigForSlot');
  expect(emulatorCommand).toContain('releaseEmulatorSlot');
  expect(packageJson.scripts['coordination:status']).toContain(
    'emulator-resource-registry.mjs status',
  );
});

it('exposes just-in-time coordination and release-fragment command surfaces', () => {
  expect(coordinationRegistryCommand).toContain("command === 'forecast'");
  expect(coordinationRegistryCommand).toContain("command === 'claim'");
  expect(coordinationRegistryCommand).toContain("command === 'heartbeat'");
  expect(coordinationRegistryCommand).toContain("command === 'release-claim'");
  expect(coordinationRegistryCommand).toContain('prepareCoordinationReleaseFragment');
  expect(coordinationRegistryCommand).toContain('coordinationEntryId');
  expect(coordinationRegistryCommand).toContain('validation.commitSha');
  expect(coordinationRegistryCommand).toContain('baseMainSha');
  expect(coordinationRegistryCommand).toContain('withValidationLease(');
  expect(coordinationRegistryCommand).toContain('validation-queue');
  expect(throughputCommand).toContain("command === 'release-prepare'");
  expect(throughputCommand).toContain("command === 'release-land'");
});

it('re-runs the existing implementation-progress validator against generated release metadata', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-release-finalizer-'));
  const lanePath = resolve(root, 'release-lane.json');
  try {
    await mkdir(resolve(root, 'src'), { recursive: true });
    await mkdir(resolve(root, 'docs'), { recursive: true });
    await writeFile(resolve(root, 'package.json'), readFileSync('package.json', 'utf8'));
    await writeFile(resolve(root, 'package-lock.json'), readFileSync('package-lock.json', 'utf8'));
    await writeFile(resolve(root, 'src/changelog.ts'), readFileSync('src/changelog.ts', 'utf8'));
    await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), readFileSync('docs/IMPLEMENTATION_PROGRESS.md', 'utf8'));
    await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), readFileSync('docs/IMPLEMENTATION_PLAN.md', 'utf8'));

    await prepareReleaseFragmentFile(lanePath, {
      taskId: 'finalizer-task',
      worktree: root,
      baseVersion: '0.3.23',
      baseMainSha: 'main-a',
      changes: ['A validated finalizer note.'],
      implementationProgress: {
        completed: 86,
        total: 730,
        percentage: '11.78%',
        done: 86,
        partial: 24,
        active: 0,
        missing: 620,
      },
    });
    await applyReleaseFragment(lanePath, {
      taskId: 'finalizer-task',
      repositoryDirectory: root,
      currentMainSha: 'main-a',
      validateFinalMetadata: async ({ version, changelogSource }) => {
        const inputs = readImplementationProgress({ cwd: root });
        const result = validateImplementationProgress({
          ...inputs,
          applicationVersion: version,
          changelogSource,
        });
        expect(result.errors).toEqual([]);
      },
    });

    const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    expect(packageJson.version).toBe('0.3.24');
    expect(await readFile(resolve(root, 'src/changelog.ts'), 'utf8')).toContain(
      'A validated finalizer note.',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(`${lanePath}.lock`, { force: true });
  }
});

it('refuses central release landing without a task-bound validation receipt', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-unbound-release-'));
  const lanePath = resolve(root, 'release-lane.json');
  const previousCwd = process.cwd();
  try {
    await mkdir(resolve(root, 'src'), { recursive: true });
    await writeFile(resolve(root, 'package.json'), '{"version":"0.3.23"}\n');
    await writeFile(resolve(root, 'package-lock.json'), '{"packages":{"":{"version":"0.3.23"}}}\n');
    await writeFile(resolve(root, 'src/changelog.ts'), `export const CHANGELOG = [
  { version: APP_VERSION, changes: ['Current.'] },
];
`);

    process.chdir(root);
    await expect(finalizeReleaseFragment(lanePath, {
      taskId: 'unbound-task',
      repositoryDirectory: root,
      baseVersion: '0.3.23',
      baseMainSha: 'main-a',
      currentMainSha: 'main-a',
      changes: ['Should not land.'],
    })).rejects.toThrow(/coordination|receipt|task-bound/i);
    expect(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version).toBe('0.3.23');
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
    await rm(`${lanePath}.lock`, { force: true });
  }
});

it('binds central fragment preparation and landing to the task receipt and current main', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-bound-release-'));
  const lanePath = resolve(root, 'release-lane.json');
  const coordinationPath = resolve(root, 'coordination.json');
  const previousCwd = process.cwd();
  try {
    await mkdir(resolve(root, 'src'), { recursive: true });
    await mkdir(resolve(root, 'docs'), { recursive: true });
    await writeFile(resolve(root, 'package.json'), readFileSync('package.json', 'utf8'));
    await writeFile(resolve(root, 'package-lock.json'), readFileSync('package-lock.json', 'utf8'));
    await writeFile(resolve(root, 'src/changelog.ts'), readFileSync('src/changelog.ts', 'utf8'));
    await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), readFileSync('docs/IMPLEMENTATION_PROGRESS.md', 'utf8'));
    await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), readFileSync('docs/IMPLEMENTATION_PLAN.md', 'utf8'));
    await runGit(root, ['init', '-b', 'main']);
    await runGit(root, ['config', 'user.email', 'coordination@example.test']);
    await runGit(root, ['config', 'user.name', 'Coordination Tests']);
    await runGit(root, ['add', '.']);
    await runGit(root, ['commit', '-m', 'fixture main']);
    const mainSha = await runGit(root, ['rev-parse', 'HEAD']);
    await runGit(root, ['checkout', '-b', 'feature/bound-release']);
    await writeFile(resolve(root, 'src/feature.mjs'), 'export const feature = true;\n');
    await runGit(root, ['add', 'src/feature.mjs']);
    await runGit(root, ['commit', '-m', 'fixture task']);
    const branchSha = await runGit(root, ['rev-parse', 'HEAD']);
    const repositoryIdentity = await runGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const now = new Date().toISOString();
    await writeFile(coordinationPath, JSON.stringify({
      version: 1,
      entries: [{
        id: 'bound-release-task',
        worktree: root,
        pid: process.pid,
        startedAt: now,
        heartbeatAt: now,
        status: 'active',
        branchName: 'feature/bound-release',
        startBranchSha: branchSha,
        startMainSha: mainSha,
        repositoryRoot: root,
        repositoryIdentity,
        intent: 'fixture release',
        versionPlan: 'Tooling-only; retain the application version for the fixture.',
        preemptiveChangelog: 'No player-facing change.',
        workType: 'tooling',
        scopes: ['src/feature.mjs'],
        claims: [],
        validation: {
          commitSha: branchSha,
          completedAt: now,
          passed: true,
          commands: ['focused fixture test'],
          files: ['src/feature.mjs'],
          docsOnly: false,
        },
      }],
      reservations: [],
      configurations: [],
    }));

    process.chdir(root);
    const prepared = await prepareCoordinationReleaseFragment(lanePath, {
      coordinationFilePath: coordinationPath,
      coordinationEntryId: 'bound-release-task',
      changes: ['A bound release note.'],
      implementationProgress: currentImplementationProgress(),
    });
    expect(prepared.fragment).toMatchObject({
      taskId: 'bound-release-task',
      coordinationEntryId: 'bound-release-task',
      coordinationBranchName: 'feature/bound-release',
      coordinationBranchSha: branchSha,
      baseMainSha: mainSha,
    });

    const landed = await finalizeReleaseFragment(lanePath, {
      coordinationFilePath: coordinationPath,
      coordinationEntryId: 'bound-release-task',
    });
    expect(landed).toMatchObject({ taskId: 'bound-release-task', version: '0.3.24' });
    const lane = JSON.parse(await readFile(lanePath, 'utf8'));
    expect(lane.fragments[0]).toMatchObject({
      state: 'landed',
      provenance: {
        coordinationEntryId: 'bound-release-task',
        baseMainSha: mainSha,
        validationReceiptCommitSha: branchSha,
        finalBranchSha: branchSha,
      },
    });
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
    await rm(`${lanePath}.lock`, { force: true });
  }
});

it('records configured slots in the shared worktree coordination file', () => {
  expect(configureEmulatorCommand).toContain('reserveAvailableConfiguredEmulatorSlot');
  expect(configureEmulatorCommand).toContain("args[0] === 'auto'");
  expect(configureEmulatorCommand).toContain('const selectedSlot = configuration.slot');
  expect(configureEmulatorCommand).toContain('firebaseConfigForSlot(baseConfig, selectedSlot)');
  expect(configureEmulatorCommand).toContain('emulatorEnvironmentForSlot(selectedSlot)');
  expect(configureEmulatorCommand).toContain('releaseConfiguredEmulatorSlot');
});

it('removes retired Cloud Functions during non-interactive deployment', () => {
  const deployment = deploy.slice(deploy.indexOf(`${FIREBASE_CLI} deploy`));

  expect(deployment).toContain('--non-interactive');
  expect(deployment).toContain('--force');
});

it('expires server-only join-attempt limiter records without indexing their timestamp', () => {
  expect(firestoreIndexes.fieldOverrides).toContainEqual({
    collectionGroup: 'joinAttemptLimits',
    fieldPath: 'expiresAt',
    ttl: true,
    indexes: [],
  });
});

it('skips CI and deployment for documentation-only changes', () => {
  for (const workflow of [ci, deploy]) {
    expect(workflow).toContain('paths-ignore:');
    expect(workflow).toContain("'**/*.md'");
    expect(workflow).toContain("'**/README'");
    expect(workflow).toContain("'**/README.*'");
  }
});
