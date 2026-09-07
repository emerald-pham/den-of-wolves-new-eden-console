import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

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
