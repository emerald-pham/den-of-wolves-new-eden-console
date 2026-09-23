import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it, vi } from 'vitest';
import {
  applyReleaseFragment,
  nextReleaseVersion,
  prepareReleaseFragmentFile,
} from '../scripts/coordination-throughput.mjs';
import {
  ALL_DEPLOYMENT_TARGETS,
  classifyChangedFiles,
  deploymentSelector,
  formatGitHubOutputs,
} from '../scripts/deployment-targets.mjs';
import { captureFunctionRevisions, verifyDeployment } from '../scripts/verify-deployment.mjs';
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
  expect(classifyChangedFiles(['src/routes/Landing.tsx']).riskGates)
    .toMatchObject({ ticker: true, font: true, webBuild: true });
  expect(classifyChangedFiles(['functions/src/index.ts']).riskGates)
    .toMatchObject({ ticker: false, font: false, functions: true });
});

it('selects changed callable exports plus audited consumers of changed shared helpers', () => {
  const callable = (name: string, body: string) => `export const ${name} = onCall(async (request) => { ${body} });\n`;
  const before = [callable('confirmSetup', 'return oldSetup();'), callable('startGame', 'return oldStart();'), callable('readSession', 'return read();')].join('');
  const after = [callable('confirmSetup', 'return limitedSetup();'), callable('startGame', 'return limitedStart();'), callable('readSession', 'return read();')].join('');
  const policy = (extra = '') => `export const CALLABLE_RATE_LIMIT_POLICIES = {\n  resumeSession: { windowMs: 60000, maxRequests: 10 },\n  getSessionPresence: { windowMs: 60000, maxRequests: 12 },\n  listGmInstances: { windowMs: 60000, maxRequests: 60 },\n  rollDice: { windowMs: 60000, maxRequests: 30 },\n${extra}} as const;\nexport function evaluate() { return true; }\n`;
  const previousPolicy = policy();
  const currentPolicy = policy('  confirmSetup: { windowMs: 60000, maxRequests: 12 },\n  startGame: { windowMs: 60000, maxRequests: 6 },\n  declareWolfAttack: { windowMs: 60000, maxRequests: 6 },\n  runMaintenance: { windowMs: 60000, maxRequests: 30 },\n');
  const selected = deploymentSelector({
    before: 'base', after: 'candidate', targets: ['hosting', 'functions'],
    files: ['functions/src/index.ts', 'functions/src/callableRateLimit.ts'],
    sourceAtRevision: (revision, filePath) => filePath.endsWith('/index.ts')
      ? (revision === 'base' ? before : after)
      : (revision === 'base' ? previousPolicy : currentPolicy),
    isAncestor: () => false,
  });

  expect(selected).toBe('hosting,functions:confirmSetup,functions:startGame,functions:declareWolfAttack,functions:runMaintenance');
});

it('selects every current and future callable consumer when shared limiter behavior changes', () => {
  const before = `export const CALLABLE_RATE_LIMIT_POLICIES = {\n  resumeSession: { windowMs: 60000, maxRequests: 10 },\n} as const;\nexport function evaluate() { return true; }\n`;
  const after = before.replace('return true', 'return false');
  const selected = deploymentSelector({
    before: 'base', after: 'candidate', targets: ['functions'],
    files: ['functions/src/callableRateLimit.ts'],
    sourceAtRevision: (revision) => revision === 'base' ? before : after,
    isAncestor: () => false,
  });
  expect(selected).toBe([
    'hosting', 'functions:resumeSession', 'functions:getSessionPresence', 'functions:listGmInstances',
    'functions:rollDice', 'functions:confirmSetup', 'functions:startGame',
    'functions:declareWolfAttack', 'functions:runMaintenance',
  ].join(','));
});

it('maps Firestore adapter changes to every callable that imports its authority path', () => {
  const selected = deploymentSelector({
    before: 'base', after: 'candidate', targets: ['functions'],
    files: ['functions/src/callableRateLimitFirestore.ts'],
    isAncestor: () => false,
  });
  expect(selected).toContain('functions:resumeSession');
  expect(selected).toContain('functions:rollDice');
  expect(selected).toContain('functions:runMaintenance');
  expect(selected).toContain('functions:startGame');
});

it('fails closed when named callable scope or deployment baseline is unknown', () => {
  expect(() => deploymentSelector({
    before: 'base', after: 'candidate', targets: ['functions'],
    files: ['functions/src/newSharedAuthorization.ts'],
  })).toThrow('No audited callable consumer map');
  expect(() => deploymentSelector({
    targets: ['functions'], files: ['functions/src/index.ts'],
  })).toThrow('known successful deployment baseline');
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

it('keeps exact Hosting builds while selecting unit and bundle checks by risk', () => {
  expect(ci).toContain('run_unit=$UNIT_REQUIRED');
  expect(ci).toContain('run_web_build=$has_hosting');
  expect(ci).toContain('run_bundle=$BUNDLE_REQUIRED');
  expect(ci).not.toContain('run_unit=$has_hosting');
  expect(ci).not.toContain('run_bundle=$has_hosting');
});

it('keeps a real server release out of web gates when package files only bump version', async () => {
  const repositoryDirectory = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-release-risk-'));
  const git = (args: string[]) => execFileAsync('git', args, {
    cwd: repositoryDirectory,
    encoding: 'utf8',
  });
  try {
    await git(['init', '--quiet', '--initial-branch=main']);
    await git(['config', 'user.email', 'ci@example.test']);
    await git(['config', 'user.name', 'CI']);
    await mkdir(resolve(repositoryDirectory, 'src'), { recursive: true });
    await mkdir(resolve(repositoryDirectory, 'functions', 'src'), { recursive: true });
    await mkdir(resolve(repositoryDirectory, 'docs'), { recursive: true });
    await writeFile(resolve(repositoryDirectory, 'package.json'), JSON.stringify({
      name: 'console', version: '0.4.90', dependencies: { react: '1' },
    }));
    await writeFile(resolve(repositoryDirectory, 'package-lock.json'), JSON.stringify({
      name: 'console', version: '0.4.90', lockfileVersion: 3,
      packages: { '': { name: 'console', version: '0.4.90', dependencies: { react: '1' } } },
    }));
    await writeFile(resolve(repositoryDirectory, 'src/changelog.ts'), 'export const version = "0.4.90";\n');
    await writeFile(resolve(repositoryDirectory, 'functions', 'src', 'index.ts'), "export const value = onCall(async () => { return 1; });\n");
    await writeFile(resolve(repositoryDirectory, 'docs', 'implementation-prompts.json'), '{}\n');
    await git(['add', '.']);
    await git(['commit', '--quiet', '-m', 'baseline']);
    const before = await runGit(repositoryDirectory, ['rev-parse', 'HEAD']);
    const packageDocument = JSON.parse(await readFile(resolve(repositoryDirectory, 'package.json'), 'utf8'));
    packageDocument.version = '0.4.91';
    await writeFile(resolve(repositoryDirectory, 'package.json'), JSON.stringify(packageDocument));
    const lockDocument = JSON.parse(await readFile(resolve(repositoryDirectory, 'package-lock.json'), 'utf8'));
    lockDocument.version = '0.4.91';
    lockDocument.packages[''].version = '0.4.91';
    await writeFile(resolve(repositoryDirectory, 'package-lock.json'), JSON.stringify(lockDocument));
    await writeFile(resolve(repositoryDirectory, 'src/changelog.ts'), 'export const version = "0.4.91";\n');
    await writeFile(resolve(repositoryDirectory, 'functions', 'src', 'index.ts'), "export const value = onCall(async () => { return 2; });\n");
    await writeFile(resolve(repositoryDirectory, 'docs', 'implementation-prompts.json'), '{"done":true}\n');
    await git(['add', '.']);
    await git(['commit', '--quiet', '-m', 'release']);
    const after = await runGit(repositoryDirectory, ['rev-parse', 'HEAD']);

    const result = classifyDeploymentRange({
      before,
      after,
      currentMainTip: after,
      isAncestor: () => true,
      cwd: repositoryDirectory,
    });
    expect(result.targets).toEqual(['hosting', 'functions']);
    expect(result.riskGates).toMatchObject({
      functions: true,
      webBuild: true,
      unit: false,
      bundle: false,
      ticker: false,
      font: false,
    });
  } finally {
    await rm(repositoryDirectory, { recursive: true, force: true });
  }
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

it('waits for the expected Hosting version to propagate without accepting the old release', async () => {
  vi.useFakeTimers();
  try {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version: '0.3.83' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ version: '0.3.85' }) });
    const check = verifyDeployment({
      targets: 'hosting', projectId: 'example', expectedVersion: '0.3.85', fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(check).resolves.toEqual({ hosting: true, functions: false, firestore: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith('https://example.web.app/build-version.json', { cache: 'no-store' });
  } finally {
    vi.useRealTimers();
  }
});

it('still rejects a persistently wrong Hosting version after bounded retries', async () => {
  vi.useFakeTimers();
  try {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '0.3.83' }) });
    const check = expect(verifyDeployment({
      targets: 'hosting', projectId: 'example', expectedVersion: '0.3.85', fetchImpl,
    })).rejects.toThrow('Hosting version 0.3.83 does not match expected 0.3.85.');
    await vi.advanceTimersByTimeAsync(30000);
    await check;
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
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
          {
            name: 'repairConsolesFromBlacksmith',
            state: 'ACTIVE',
            serviceConfig: {
              service: 'projects/dow-new-eden-console/locations/us-central1/services/repair-consoles-from-blacksmith',
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
    expect.arrayContaining([
      'run', 'services', 'get-iam-policy',
      'projects/dow-new-eden-console/locations/us-central1/services/repair-consoles-from-blacksmith',
    ]),
    expect.arrayContaining(['firestore', 'databases', 'describe', '--database=(default)']),
  ]));
});

it('proves every selected Function published a different ready Cloud Run revision', async () => {
  const commands: string[][] = [];
  const runCommand = async (_command: string, args: string[]) => {
    commands.push([...args]);
    if (args[0] === 'functions' && args[1] === 'describe') {
      return JSON.stringify({
        serviceConfig: {
          service: `projects/dow-new-eden-console/locations/us-central1/services/${args[2]}`,
        },
      });
    }
    if (args[0] === 'run' && args[1] === 'services' && args[2] === 'describe') {
      return JSON.stringify({ status: { latestReadyRevisionName: `${args[3]}-rev-2` } });
    }
    if (args[0] === 'functions' && args[1] === 'list') {
      return JSON.stringify([
        ...['triggerDradisContact', 'startSinglePlayerDemo', 'repairConsolesFromBlacksmith'].map((name) => ({
          name, state: 'ACTIVE',
          serviceConfig: { service: `projects/dow-new-eden-console/locations/us-central1/services/${name}` },
        })),
      ]);
    }
    return JSON.stringify({ bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] });
  };
  const previousFunctionRevisions = await captureFunctionRevisions({
    functionNames: 'confirmSetup,startGame', projectId: 'dow-new-eden-console', runCommand,
  });
  expect(previousFunctionRevisions).toEqual({
    confirmSetup: 'confirmSetup-rev-2', startGame: 'startGame-rev-2',
  });

  await expect(verifyDeployment({
    targets: 'functions', projectId: 'dow-new-eden-console', expectedVersion: '0.5.13',
    functionNames: 'confirmSetup,startGame',
    previousFunctionRevisions: { confirmSetup: 'confirmSetup-rev-1', startGame: 'startGame-rev-1' },
    runCommand,
  })).resolves.toMatchObject({ functions: true });
  expect(commands).toEqual(expect.arrayContaining([
    expect.arrayContaining(['functions', 'describe', 'confirmSetup']),
    expect.arrayContaining(['functions', 'describe', 'startGame']),
    expect.arrayContaining(['run', 'services', 'describe', 'confirmSetup']),
    expect.arrayContaining(['run', 'services', 'describe', 'startGame']),
  ]));
  await expect(verifyDeployment({
    targets: 'functions', projectId: 'dow-new-eden-console', expectedVersion: '0.5.13',
    functionNames: 'confirmSetup', previousFunctionRevisions: { confirmSetup: 'confirmSetup-rev-2' },
    runCommand,
  })).rejects.toThrow('did not publish a new ready revision');
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
          {
            name: 'repairConsolesFromBlacksmith',
            state: 'ACTIVE',
            serviceConfig: {
              service: 'projects/dow-new-eden-console/locations/us-central1/services/repair-consoles-from-blacksmith',
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
    expect.arrayContaining([
      'run', 'services', 'get-iam-policy',
      'projects/dow-new-eden-console/locations/us-central1/services/repair-consoles-from-blacksmith',
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
    await writeFile(resolve(repositoryDirectory, 'functions', 'src', 'index.ts'), "export const createThing = onCall(async () => { return 'candidate'; });\n");
    await git(['add', '.']);
    await git(['commit', '--quiet', '-m', 'functions']);
    const currentSha = await runGit(repositoryDirectory, ['rev-parse', 'HEAD']);

    const cumulative = await runTargets(baselineSha, currentSha, currentSha);
    expect(cumulative).toContain('targets=hosting,functions');
    expect(cumulative).toContain('deploy_only=hosting,functions:createThing');
    expect(cumulative).toContain('function_names=createThing');
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
  expect(ci).toContain('run: npm run test:rules');
  expect(ci).toContain("if: steps.change_scope.outputs.firestore == 'true'");
  expect(deploy).toContain('uses: ./.github/workflows/ci.yml');
  expect(deploy).toContain('needs: [determine-targets, verify]');
  expect(deploy.indexOf('needs: [determine-targets, verify]'))
    .toBeLessThan(deploy.indexOf(`${FIREBASE_CLI} deploy`));
});

it('does not repeat unit tests during deployment after CI artifact verification', () => {
  expect(ci).toContain('run: npm run test:unit');
  expect(ci).toContain('run: npm run test:functions');
  expect(deploy).not.toContain('run: npm run test:unit');
  expect(deploy).not.toContain('run: npm run test:functions');
});

it('verifies one exact SHA and reuses its build artifacts for deployment', () => {
  expect(ci).toContain('workflow_call:');
  expect(ci).toContain('branches-ignore: [main]');
  expect(ci).not.toContain('branches: [main]');
  expect(ci).toContain('fetch-depth: 0');
  expect(ci).toContain('git switch --create "ci-verify-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"');
  expect(ci).toContain('exact_head_commit:');
  expect(ci).toContain('deployment_targets:');
  expect(ci).toContain('DEPLOYMENT_TARGETS:');
  expect(ci).toContain('Identify changed paths');
  expect(ci).not.toContain('validate:work-registration');
  expect(ci).toContain('actions/upload-artifact@v7');
  expect(deploy).toContain('ref: ${{ github.sha }}');
  expect(deploy).toContain('exact_head_commit: true');
  expect(deploy).toContain('deployment_targets: ${{ needs.determine-targets.outputs.targets }}');
  expect(deploy).toContain("ticker_required: ${{ needs.determine-targets.outputs.ticker_required == 'true' }}");
  expect(deploy).toContain("font_required: ${{ needs.determine-targets.outputs.font_required == 'true' }}");
  expect(deploy).toContain("unit_required: ${{ needs.determine-targets.outputs.unit_required == 'true' }}");
  expect(deploy).toContain("web_build_required: ${{ needs.determine-targets.outputs.web_build_required == 'true' }}");
  expect(deploy).toContain("bundle_required: ${{ needs.determine-targets.outputs.bundle_required == 'true' }}");
  expect(deploy).toContain('actions/download-artifact@v8');
  expect(deploy).toContain('needs: [determine-targets, verify]');
});

it('forces full exact-SHA verification when a merge diff appears documentation-only', () => {
  // A deployment merge can have a docs-only first-parent diff while its tree
  // still contains pending product changes since the deployed baseline.
  expect(ci).toMatch(/if \[ "\$EXACT_HEAD_COMMIT" = "true" \]; then[\s\S]+?documentation_only=false[\s\S]+?roadmap_changed=true/);
  expect(ci).toContain('echo "exact_head_commit=$EXACT_HEAD_COMMIT" >> "$GITHUB_OUTPUT"');
  expect(ci).toContain("if: steps.change_scope.outputs.documentation_only == 'true' || steps.change_scope.outputs.exact_head_commit == 'true'");
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

it('runs exact-SHA browser gates in parallel without weakening branch validation', () => {
  expect(ci).toContain('exact-sha-browser-gates:');
  expect(ci).toContain("if: ${{ inputs.exact_head_commit && (inputs.ticker_required || inputs.render_required) }}");
  expect(ci).toContain("if: ${{ inputs.ticker_required }}");
  expect(ci).toContain("if: ${{ inputs.render_required }}");
  expect(ci).toContain('Build web for render baseline');
  expect(ci).toContain("steps.change_scope.outputs.exact_head_commit != 'true'");
  expect(ci.match(/run: npm run test:ticker:browser/g)).toHaveLength(2);
  expect(ci.match(/run: node scripts\/prompt-637-render-performance\.mjs/g)).toHaveLength(2);
  expect(deploy).toContain('needs: [determine-targets, verify]');
});

it('uses current Node 24 action runtimes in verification and deployment', () => {
  expect(ci).toContain('actions/checkout@v7');
  expect(ci).toContain('actions/setup-node@v7');
  expect(deploy.match(/actions\/checkout@v7/g)).toHaveLength(2);
  expect(deploy).toContain('actions/setup-node@v7');
  expect(`${ci}\n${deploy}`).not.toMatch(/actions\/(?:checkout|setup-node)@v4/);
});

it('uses current artifact action majors throughout the exact-SHA pipeline', () => {
  const uploadActions = ci.match(/actions\/upload-artifact@v\d+/g) ?? [];
  expect(uploadActions.length).toBeGreaterThan(0);
  expect(new Set(uploadActions)).toEqual(new Set(['actions/upload-artifact@v7']));
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
  expect(deploy).toContain('--only "$DEPLOY_ONLY"');
  expect(deploy).toContain('targets: ${{ steps.targets.outputs.targets }}');
  expect(deploy).toContain('deploy_only: ${{ steps.targets.outputs.deploy_only }}');
  expect(deploy).toContain('needs.determine-targets.outputs.function_names');
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
  expect(ci).toContain("if: steps.change_scope.outputs.unit == 'true'");
  expect(ci).toContain("if: steps.change_scope.outputs.functions == 'true'");
  expect(ci).toContain("if: steps.change_scope.outputs.firestore == 'true'");
  expect(ci).not.toContain('implementation-registration');
  expect(deploy).toContain('branches: [main]');
  expect(deploy).not.toContain('paths-ignore:');
});
