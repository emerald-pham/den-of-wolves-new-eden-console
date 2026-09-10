import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { finalizeReleaseFragment } from '../scripts/emulator-resource-registry.mjs';

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

    await finalizeReleaseFragment(lanePath, {
      taskId: 'finalizer-task',
      repositoryDirectory: root,
      baseVersion: '0.3.23',
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
