import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const FIREBASE_CLI = 'firebase-tools@15.29.0';

it('tests Firestore rules before a main-branch deployment', () => {
  const rulesTest = deploy.indexOf('npm run test:rules');
  const deployment = deploy.indexOf(`${FIREBASE_CLI} deploy`);

  expect(rulesTest).toBeGreaterThan(-1);
  expect(deployment).toBeGreaterThan(rulesTest);
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
  expect(packageJson.scripts['test:rules']).toContain(FIREBASE_CLI);
  expect(ci).toContain('npm run test:rules');
  expect(deploy).toContain('npm run test:rules');
  expect(deploy).toContain(FIREBASE_CLI);
  expect(ci).not.toContain('firebase-tools@latest');
  expect(deploy).not.toContain('firebase-tools@latest');
  expect(packageJson.scripts['test:rules']).not.toContain('firebase-tools@latest');
});

it('removes retired Cloud Functions during non-interactive deployment', () => {
  const deployment = deploy.slice(deploy.indexOf(`${FIREBASE_CLI} deploy`));

  expect(deployment).toContain('--non-interactive');
  expect(deployment).toContain('--force');
});

it('skips CI and deployment for documentation-only changes', () => {
  for (const workflow of [ci, deploy]) {
    expect(workflow).toContain('paths-ignore:');
    expect(workflow).toContain("'**/*.md'");
    expect(workflow).toContain("'**/README'");
    expect(workflow).toContain("'**/README.*'");
  }
});
