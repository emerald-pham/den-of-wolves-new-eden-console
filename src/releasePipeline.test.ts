import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import {
  applyReleaseFragment,
  nextReleaseVersion,
  prepareReleaseFragmentFile,
} from '../scripts/coordination-throughput.mjs';
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
    'docs/implementation-prompts.json',
    'src/routes/Landing.test.tsx',
    'functions/src/index.test.ts',
    'scripts/deployment-targets.mjs',
    '.githooks/commit-msg',
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
          {
            name: 'triggerDradisContact',
            state: 'ACTIVE',
            serviceConfig: {
              service: 'projects/dow-new-eden-console/locations/us-central1/services/trigger-dradis-contact',
            },
          },
          {
            name: 'startSinglePlayerDemo',
            state: 'ACTIVE',
            serviceConfig: {
              service: 'projects/dow-new-eden-console/locations/us-central1/services/start-single-player-demo',
            },
          },
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
    expect.arrayContaining([
      'run', 'services', 'get-iam-policy',
      'projects/dow-new-eden-console/locations/us-central1/services/trigger-dradis-contact',
    ]),
    expect.arrayContaining([
      'run', 'services', 'get-iam-policy',
      'projects/dow-new-eden-console/locations/us-central1/services/start-single-player-demo',
    ]),
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
        {
          name: 'triggerDradisContact',
          state: 'ACTIVE',
          serviceConfig: {
            service: 'projects/dow-new-eden-console/locations/us-central1/services/trigger-dradis-contact',
          },
        },
        {
          name: 'startSinglePlayerDemo',
          state: 'ACTIVE',
          serviceConfig: {
            service: 'projects/dow-new-eden-console/locations/us-central1/services/start-single-player-demo',
          },
        },
      ])
      : JSON.stringify({
        bindings: [{ role: 'roles/cloudfunctions.invoker', members: ['allUsers'] }],
      }),
  })).rejects.toThrow('missing its public invoker policy');
});

it('uses the Cloud Run IAM policy response for Cloud Functions v2 public access', async () => {
  const commands: string[][] = [];
  await expect(verifyDeployment({
    targets: ['functions'],
    projectId: 'dow-new-eden-console',
    expectedVersion: '0.3.26',
    runCommand: async (_command, args) => {
      commands.push([...args]);
      if (args[1] === 'list') {
        return JSON.stringify([
          {
            name: 'triggerDradisContact',
            state: 'ACTIVE',
            serviceConfig: {
              service: 'projects/dow-new-eden-console/locations/us-central1/services/trigger-dradis-contact',
            },
          },
          {
            name: 'startSinglePlayerDemo',
            state: 'ACTIVE',
            serviceConfig: {
              service: 'projects/dow-new-eden-console/locations/us-central1/services/start-single-player-demo',
            },
          },
        ]);
      }
      return JSON.stringify({
        version: 1,
        bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
        etag: 'BwY-v2-policy',
      });
    },
  })).resolves.toMatchObject({ functions: true });

  expect(commands).toEqual(expect.arrayContaining([
    expect.arrayContaining([
      'run', 'services', 'get-iam-policy',
      'projects/dow-new-eden-console/locations/us-central1/services/trigger-dradis-contact',
    ]),
    expect.arrayContaining([
      'run', 'services', 'get-iam-policy',
      'projects/dow-new-eden-console/locations/us-central1/services/start-single-player-demo',
    ]),
  ]));
  expect(commands).not.toEqual(expect.arrayContaining([
    expect.arrayContaining(['functions', 'get-iam-policy']),
  ]));
});

it('fails closed when a v2 function omits or malforms its authoritative service resource', async () => {
  for (const service of [undefined, 'projects/dow-new-eden-console/locations/us-central1/services/']) {
    const commands: string[][] = [];
    await expect(verifyDeployment({
      targets: ['functions'],
      projectId: 'dow-new-eden-console',
      expectedVersion: '0.3.26',
      runCommand: async (_command, args) => {
        commands.push([...args]);
        if (args[1] === 'list') {
          return JSON.stringify([
            {
              name: 'triggerDradisContact',
              state: 'ACTIVE',
              ...(service === undefined ? {} : { serviceConfig: { service } }),
            },
            {
              name: 'startSinglePlayerDemo',
              state: 'ACTIVE',
              serviceConfig: {
                service: 'projects/dow-new-eden-console/locations/us-central1/services/start-single-player-demo',
              },
            },
          ]);
        }
        return JSON.stringify({
          bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
        });
      },
    })).rejects.toThrow('valid Cloud Run service resource');
    expect(commands).toHaveLength(1);
  }
});

it('uses current Google authentication action major in deployment', () => {
  expect(deploy).toContain('google-github-actions/auth@v3');
  expect(deploy).not.toContain('google-github-actions/auth@v2');
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

it('tests Firestore rules before a main-branch deployment', () => {
  const rulesTest = ci.indexOf('npm run test:rules');
  const deployment = deploy.indexOf(`${FIREBASE_CLI} deploy`);

  expect(rulesTest).toBeGreaterThan(-1);
  expect(deployment).toBeGreaterThan(rulesTest);
  expect(deploy).toContain('uses: ./.github/workflows/ci.yml');
  expect(deploy).toContain('needs: [determine-targets, verify]');
});

it('does not repeat unit tests during deployment after CI artifact verification', () => {
  expect(ci).toMatch(/^\s*run:\s+npm test\s*$/m);
  expect(deploy).not.toMatch(/^\s*run:\s+npm test\s*$/m);
});

it('verifies one exact SHA and reuses its build artifacts for deployment', () => {
  expect(ci).toContain('workflow_call:');
  expect(ci).toContain('branches-ignore: [main]');
  expect(ci).not.toContain('branches: [main]');
  expect(ci).toContain('fetch-depth: 0');
  expect(ci).toContain('git switch --create "ci-verify-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"');
  expect(ci).toContain('exact_head_commit:');
  expect(ci).toContain('git rev-parse --verify "$head_sha^"');
  expect(ci).toContain('Identify changed paths');
  expect(ci).not.toContain('validate:work-registration');
  expect(ci).toContain('actions/upload-artifact@v7');
  expect(deploy).toContain('ref: ${{ github.sha }}');
  expect(deploy).toContain('exact_head_commit: true');
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

it('applies a release fragment and updates release metadata', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-release-finalizer-'));
  const lanePath = resolve(root, 'release-lane.json');
  const baseVersion = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
  const nextVersion = nextReleaseVersion(baseVersion);
  try {
    await mkdir(resolve(root, 'src'), { recursive: true });
    await writeFile(resolve(root, 'package.json'), readFileSync('package.json', 'utf8'));
    await writeFile(resolve(root, 'package-lock.json'), readFileSync('package-lock.json', 'utf8'));
    await writeFile(resolve(root, 'src/changelog.ts'), readFileSync('src/changelog.ts', 'utf8'));

    await prepareReleaseFragmentFile(lanePath, {
      taskId: 'finalizer-task',
      worktree: root,
      baseVersion,
      baseMainSha: 'main-a',
      changes: ['A validated finalizer note.'],
    });
    await applyReleaseFragment(lanePath, {
      taskId: 'finalizer-task',
      repositoryDirectory: root,
      currentMainSha: 'main-a',
    });

    const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    expect(packageJson.version).toBe(nextVersion);
    expect(await readFile(resolve(root, 'src/changelog.ts'), 'utf8')).toContain(
      'A validated finalizer note.',
    );
  } finally {
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

it('keeps documentation and roadmap checks separate from application jobs and deployment', () => {
  expect(ci).not.toContain('paths-ignore:');
  expect(ci).toContain("'!**/*.md'");
  expect(ci).toContain("'docs/IMPLEMENTATION_PROGRESS.md'");
  expect(ci).toContain('Check prompt catalog and generated views');
  expect(ci).toContain("if: steps.change_scope.outputs.roadmap_changed == 'true'");
  expect(ci).toContain('run: npm run roadmap:check');
  expect(ci).toContain('npm run coordination:docs');
  expect(ci).toContain("if: steps.change_scope.outputs.documentation_only == 'true'");
  expect(ci).toContain("if: steps.change_scope.outputs.documentation_only != 'true'");
  expect(ci).not.toContain('implementation-registration');
  expect(deploy).toContain('paths-ignore:');
  expect(deploy).toContain("'**/*.md'");
  expect(deploy).toContain("'**/README'");
  expect(deploy).toContain("'**/README.*'");
});
