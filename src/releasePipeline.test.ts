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
import {
  ALL_DEPLOYMENT_TARGETS,
  classifyChangedFiles,
  formatGitHubOutputs,
} from '../scripts/deployment-targets.mjs';
import { verifyDeployment } from '../scripts/verify-deployment.mjs';
import { classifyDeploymentRange } from '../scripts/deployment-targets.mjs';

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

it('classifies changed files into affected deployment surfaces', () => {
  expect(classifyChangedFiles(['src/routes/Landing.tsx']).targets).toEqual(['hosting']);
  expect(classifyChangedFiles(['firestore.rules']).targets).toEqual(['firestore']);
  expect(classifyChangedFiles(['functions/src/index.ts']).targets).toEqual(['functions']);
  expect(classifyChangedFiles(['firebase.json']).targets).toEqual([...ALL_DEPLOYMENT_TARGETS]);
  expect(classifyChangedFiles(['src/routes/Landing.tsx', 'functions/src/index.ts']).targets)
    .toEqual(['hosting', 'functions']);
});

it('classifies the cumulative range from the last successful deployment', () => {
  // A queued main run must include every surface changed since the deployed
  // SHA, not only the latest push's event.before..event.after range.
  const result = classifyChangedFiles([
    'functions/src/index.ts',
    'firestore.rules',
  ]);

  expect(result.targets).toEqual(['firestore', 'functions']);
});

it('skips proven documentation, test, and tooling-only changes', () => {
  const result = classifyChangedFiles([
    'README.md',
    'docs/ci-deploy-setup.md',
    'src/routes/Landing.test.tsx',
    'functions/src/index.test.ts',
    'scripts/deployment-targets.mjs',
    '.github/workflows/ci.yml',
  ]);

  expect(result.targets).toEqual([]);
  expect(result.unknownFiles).toEqual([]);
  expect(formatGitHubOutputs(result)).toContain('has_targets=false');
});

it('fails closed to all surfaces for an unknown changed file', () => {
  const result = classifyChangedFiles(['.env.production']);

  expect(result.targets).toEqual([...ALL_DEPLOYMENT_TARGETS]);
  expect(result.unknownFiles).toEqual(['.env.production']);
});

it('treats manual deployment as an explicit all-surface request', () => {
  expect(classifyChangedFiles([], { manual: true }).targets).toEqual([...ALL_DEPLOYMENT_TARGETS]);
});

it('verifies Hosting and public Functions through injected production adapters', async () => {
  const commands: string[][] = [];
  const result = await verifyDeployment({
    targets: [...ALL_DEPLOYMENT_TARGETS],
    projectId: 'dow-new-eden-console',
    expectedVersion: '0.3.26',
    hostingUrl: 'https://dow-new-eden-console.web.app',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ version: '0.3.26' }),
    }),
    runCommand: async (_command, args) => {
      commands.push([...args]);
      if (args[1] === 'list') {
        return JSON.stringify([
          { name: 'triggerDradisContact', state: 'ACTIVE' },
          { name: 'startSinglePlayerDemo', state: 'ACTIVE' },
        ]);
      }
      if (args[0] === 'firestore') {
        return JSON.stringify({
          name: 'projects/dow-new-eden-console/databases/(default)',
          type: 'FIRESTORE_NATIVE',
        });
      }
      return JSON.stringify({
        bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
      });
    },
  });

  expect(result).toEqual({ hosting: true, firestore: true, functions: true });
  expect(commands).toEqual(expect.arrayContaining([
    expect.arrayContaining(['functions', 'list', '--v2', '--regions=us-central1']),
    expect.arrayContaining(['functions', 'get-iam-policy', 'triggerDradisContact']),
    expect.arrayContaining(['functions', 'get-iam-policy', 'startSinglePlayerDemo']),
    expect.arrayContaining(['firestore', 'databases', 'describe', '--database=(default)']),
  ]));
});

it('verifies the exact Firestore Native database resource without an API state field', () => {
  const verifier = readFileSync('scripts/verify-deployment.mjs', 'utf8');
  expect(verifier).toContain("database?.type === 'FIRESTORE_NATIVE'");
  expect(verifier).toContain('projects/${projectId}/databases/(default)');
  expect(verifier).not.toContain("database?.state");
});

it('rejects the legacy Cloud Functions invoker role for a gen2 public Function', async () => {
  await expect(verifyDeployment({
    targets: ['functions'],
    projectId: 'dow-new-eden-console',
    expectedVersion: '0.3.26',
    runCommand: async (_command, args) => args[1] === 'list'
      ? JSON.stringify([
        { name: 'triggerDradisContact', state: 'ACTIVE' },
        { name: 'startSinglePlayerDemo', state: 'ACTIVE' },
      ])
      : JSON.stringify({
        bindings: [{ role: 'roles/cloudfunctions.invoker', members: ['allUsers'] }],
      }),
  })).rejects.toThrow('missing its public invoker policy');
});

it('blocks stale deployment runs and non-ancestral baselines before target selection', () => {
  const changedFiles = ['src/routes/Landing.tsx', 'functions/src/index.ts'];
  const stale = classifyDeploymentRange({
    before: 'baseline-sha',
    after: 'old-main-tip',
    currentMainTip: 'new-main-tip',
    changedFiles,
    isAncestor: () => true,
  });
  expect(stale).toMatchObject({ currentTip: false, staleRun: true, targets: [] });

  const unrelated = classifyDeploymentRange({
    before: 'unrelated-sha',
    after: 'current-main-tip',
    currentMainTip: 'current-main-tip',
    changedFiles,
    isAncestor: () => false,
  });
  expect(unrelated).toMatchObject({ currentTip: true, baselineAncestry: false });
  expect(unrelated.targets).toEqual([...ALL_DEPLOYMENT_TARGETS]);
});

it('executes target decisions against real Git ancestry and current-tip guards', async () => {
  const repositoryDirectory = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-deployment-targets-'));
  const script = resolve(process.cwd(), 'scripts/deployment-targets.mjs');
  const git = (args: string[]) => execFileAsync('git', args, {
    cwd: repositoryDirectory,
    encoding: 'utf8',
  });
  const runTargets = async (before: string, after: string, currentMainTip: string) => {
    const { stdout } = await execFileAsync(process.execPath, [
      script,
      '--before', before,
      '--after', after,
      '--current-main-tip', currentMainTip,
      '--manual', 'false',
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    return stdout;
  };
  try {
    await git(['init', '--quiet', '--initial-branch=main']);
    await git(['config', 'user.email', 'ci@example.test']);
    await git(['config', 'user.name', 'CI']);
    await git(['commit', '--quiet', '--allow-empty', '-m', 'baseline']);
    const baselineSha = await runGit(repositoryDirectory, ['rev-parse', 'HEAD']);
    await mkdir(resolve(repositoryDirectory, 'src'), { recursive: true });
    await writeFile(resolve(repositoryDirectory, 'src', 'Landing.tsx'), 'export {}\n');
    await git(['add', '.']);
    await git(['commit', '--quiet', '-m', 'hosting']);
    const hostingSha = await runGit(repositoryDirectory, ['rev-parse', 'HEAD']);
    await mkdir(resolve(repositoryDirectory, 'functions', 'src'), { recursive: true });
    await writeFile(resolve(repositoryDirectory, 'functions', 'src', 'index.ts'), 'export {}\n');
    await git(['add', '.']);
    await git(['commit', '--quiet', '-m', 'functions']);
    const currentSha = await runGit(repositoryDirectory, ['rev-parse', 'HEAD']);

    const cumulative = await runTargets(baselineSha, currentSha, currentSha);
    expect(cumulative).toContain('targets=hosting,functions');
    expect(cumulative).toContain('current_tip=true');
    expect(cumulative).toContain('baseline_ancestry=true');

    const stale = await runTargets(hostingSha, hostingSha, currentSha);
    expect(stale).toContain('has_targets=false');
    expect(stale).toContain('stale_run=true');

    const reversed = await runTargets(currentSha, hostingSha, hostingSha);
    expect(reversed).toContain('targets=hosting,firestore,functions');
    expect(reversed).toContain('baseline_ancestry=false');
  } finally {
    await rm(repositoryDirectory, { recursive: true, force: true });
  }
});

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
  const rulesTest = ci.indexOf('npm run test:rules');
  const deployment = deploy.indexOf(`${FIREBASE_CLI} deploy`);

  expect(rulesTest).toBeGreaterThan(-1);
  expect(deployment).toBeGreaterThan(rulesTest);
  expect(deploy).toContain('uses: ./.github/workflows/ci.yml');
  expect(deploy).toContain('needs: [determine-targets, verify]');
});

it('does not repeat unit tests during deployment after the pre-push gate', () => {
  expect(ci).toMatch(/^\s*run:\s+npm test\s*$/m);
  expect(deploy).not.toMatch(/^\s*run:\s+npm test\s*$/m);
});

it('verifies one exact SHA and reuses its build artifacts for deployment', () => {
  expect(ci).toContain('workflow_call:');
  expect(ci).toContain('branches-ignore: [main]');
  expect(ci).not.toContain('branches: [main]');
  expect(ci).toContain('fetch-depth: 0');
  expect(ci).toContain('git switch --create "ci-verify-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"');
  expect(ci).toContain('actions/upload-artifact@v7');
  expect(deploy).toContain('ref: ${{ github.sha }}');
  expect(deploy).toContain('actions/download-artifact@v8');
  expect(deploy).toContain('needs: [determine-targets, verify]');
});

it('keeps CI dependency caches, timeouts, and single-pass bundle checking explicit', () => {
  expect(ci).toContain('cache-dependency-path:');
  expect(ci).toContain('package-lock.json');
  expect(ci).toContain('functions/package-lock.json');
  expect(ci).toContain('npm ci --prefer-offline --no-audit');
  expect(ci).toContain('npm ci --prefix functions --prefer-offline --no-audit');
  expect(ci).toContain('timeout-minutes: 30');
  expect(ci).toContain('node scripts/check-bundle-size.mjs');
});

it('uses current Node 24 action runtimes in verification and deployment', () => {
  expect(ci).toContain('actions/checkout@v7');
  expect(ci).toContain('actions/setup-node@v7');
  expect(deploy.match(/actions\/checkout@v7/g)).toHaveLength(2);
  expect(deploy).toContain('actions/setup-node@v7');
  expect(`${ci}\n${deploy}`).not.toMatch(/actions\/(?:checkout|setup-node)@v4/);
});

it('uses current artifact action majors throughout the exact-SHA pipeline', () => {
  expect(ci.match(/actions\/upload-artifact@v7/g)).toHaveLength(2);
  expect(deploy.match(/actions\/download-artifact@v8/g)).toHaveLength(2);
  expect(`${ci}\n${deploy}`).not.toMatch(/actions\/(?:upload|download)-artifact@v[1-6]/);
});

it('preflights deploy runtime dependencies and scopes deployment credentials', () => {
  expect(deploy).toContain('node-version: 22');
  expect(deploy).toContain('cache-dependency-path: functions/package-lock.json');
  expect(deploy).toContain('npm ci --prefix functions --omit=dev --prefer-offline --no-audit');
  expect(deploy).toContain('id-token: write');
  expect(deploy).toContain('      actions: read');
  expect(deploy).toContain('Confirm commit remains current main tip');
  expect(deploy).toContain('GH_TOKEN: ${{ github.token }}');
  expect(deploy).not.toMatch(/^[ ]{2}id-token: write$/m);
});

it('deploys only the Firebase surfaces affected by a push', () => {
  expect(deploy).toContain('scripts/deployment-targets.mjs');
  expect(deploy).toContain('--only "${{ needs.determine-targets.outputs.targets }}"');
  expect(deploy).not.toContain('--only hosting,firestore,functions');
});

it('deploys every Firebase surface when manually dispatched', () => {
  expect(deploy).toContain('EVENT_NAME: ${{ github.event_name }}');
  expect(deploy).toContain('--manual');
  expect(deploy).toContain('workflow_dispatch');
});

it('uses the last successful deployment as the cumulative target baseline', () => {
  expect(deploy).toContain('actions: read');
  expect(deploy).toContain('Find last successful deployment baseline');
  expect(deploy).toContain('actions/workflows/deploy.yml/runs?branch=main');
  expect(deploy).toContain('.conclusion == "success"');
  expect(deploy).toContain('actions/runs/$run_id/jobs?per_page=100');
  expect(deploy).toContain('select(.name == "deploy")');
  expect(deploy).toContain('deploy_conclusion');
  expect(deploy).toContain('queue: max');
  expect(deploy).toContain('cancel-in-progress: false');
  expect(deploy).toContain('BASELINE_SHA');
  expect(deploy).toContain('steps.baseline.outputs.base_sha');
  expect(deploy).toContain('steps.current-tip.outputs.sha');
  expect(deploy).toContain('--current-main-tip');
  expect(deploy).toContain('current_tip: ${{ steps.targets.outputs.current_tip }}');
});

it('uses a version-pinned Firebase CLI throughout CI and deployment', () => {
  expect(packageJson.scripts['test:rules']).toContain('run-emulator-command.mjs');
  expect(emulatorCommand).toContain(FIREBASE_CLI);
  expect(ci).toContain('npm run test:rules');
  expect(ci).toContain('npm run test:rules');
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
      baseVersion: '0.3.26',
      baseMainSha: 'main-a',
      changes: ['A validated finalizer note.'],
      implementationProgress: {
        completed: 88,
        total: 730,
        percentage: '12.05%',
        done: 88,
        partial: 25,
        active: 0,
        missing: 617,
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
    expect(packageJson.version).toBe('0.3.27');
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
  const coordinationPath = resolve(root, 'coordination.json');
  const previousCwd = process.cwd();
  try {
    await mkdir(resolve(root, 'src'), { recursive: true });
    await writeFile(resolve(root, 'package.json'), '{"version":"0.3.23"}\n');
    await writeFile(resolve(root, 'package-lock.json'), '{"packages":{"":{"version":"0.3.23"}}}\n');
    await writeFile(resolve(root, 'src/changelog.ts'), `export const CHANGELOG = [
  { version: APP_VERSION, changes: ['Current.'] },
];
`);
    await runGit(root, ['init', '-b', 'main']);
    await runGit(root, ['config', 'user.email', 'coordination@example.test']);
    await runGit(root, ['config', 'user.name', 'Coordination Tests']);
    await runGit(root, ['add', '.']);
    await runGit(root, ['commit', '-m', 'fixture main']);
    await runGit(root, ['checkout', '-b', 'feature/unbound-release']);
    const branchSha = await runGit(root, ['rev-parse', 'HEAD']);
    const mainSha = await runGit(root, ['rev-parse', 'main']);
    const repositoryIdentity = await runGit(root, [
      'rev-parse', '--path-format=absolute', '--git-common-dir',
    ]);
    const now = new Date().toISOString();
    await writeFile(coordinationPath, JSON.stringify({
      version: 1,
      entries: [{
        id: 'unbound-task',
        worktree: root,
        pid: process.pid,
        startedAt: now,
        heartbeatAt: now,
        status: 'active',
        branchName: 'feature/unbound-release',
        startBranchSha: branchSha,
        startMainSha: mainSha,
        repositoryRoot: root,
        repositoryIdentity,
        intent: 'fixture release',
        versionPlan: 'Tooling-only; retain the application version for the fixture.',
        preemptiveChangelog: 'No player-facing change.',
        workType: 'tooling',
        scopes: [],
        claims: [],
      }],
      reservations: [],
      configurations: [],
    }));

    process.chdir(root);
    await expect(finalizeReleaseFragment(lanePath, {
      taskId: 'unbound-task',
      repositoryDirectory: root,
      coordinationFilePath: coordinationPath,
      baseVersion: '0.3.23',
      baseMainSha: mainSha,
      currentMainSha: mainSha,
      changes: ['Should not land.'],
    })).rejects.toThrow(
      'Release fragment unbound-task requires a passing task-bound validation receipt before landing.',
    );
    expect(JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version).toBe('0.3.23');
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
    await rm(`${lanePath}.lock`, { force: true });
    await rm(`${coordinationPath}.lock`, { force: true });
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
    expect(landed).toMatchObject({ taskId: 'bound-release-task', version: '0.3.27' });
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

it('keeps local Functions predeploy compilation while verifying CI artifacts', () => {
  expect(readFileSync('firebase.json', 'utf8')).toContain('CI_VERIFIED_ARTIFACTS');
  expect(readFileSync('firebase.json', 'utf8')).toContain('verify-functions-artifact.mjs');
  expect(deploy).toContain('CI_VERIFIED_ARTIFACTS: \'1\'');
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
