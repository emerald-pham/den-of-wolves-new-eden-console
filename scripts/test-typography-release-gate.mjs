import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('computed-style typography is required for Hosting release verification', () => {
  assert.ok(/typography_required:[\s\S]*?type: boolean/.test(ci), 'CI needs a typography_required input');
  assert.ok(/TYPOGRAPHY_REQUIRED: \$\{\{ inputs\.typography_required \|\| false \}\}/.test(ci),
    'CI must receive the reusable-workflow typography requirement');
  assert.ok(/echo "typography=\$TYPOGRAPHY_REQUIRED" >> "\$GITHUB_OUTPUT"/.test(ci),
    'exact-SHA verification must forward the required gate');
  assert.ok(/outputs\.typography == 'true'[\s\S]*?npm run test:typography:browser/.test(ci),
    'the gate must execute when required');
  assert.ok(/outputs\.typography == 'true'[\s\S]*?playwright install --with-deps chromium/.test(ci),
    'the required browser gate must install its runtime');
  assert.equal(packageJson.scripts['test:typography:browser'], 'node scripts/test-typography-browser.mjs');
  assert.equal(packageJson.scripts['test:typography:release-gate'], 'node --test scripts/test-typography-release-gate.mjs');
  assert.ok(/name: Typography release-gate contract[\s\S]*?npm run test:typography:release-gate/.test(ci),
    'CI must validate that the release gate remains wired');
});

test('exact-SHA deployment cannot bypass typography verification before Hosting deploy', () => {
  assert.ok(/typography_required:[\s\S]*?contains\(needs\.determine-targets\.outputs\.targets, 'hosting'\)/.test(deploy),
    'Hosting targets must enable the typography gate unconditionally');
  assert.ok(/deploy:[\s\S]*?needs: \[determine-targets, verify\]/.test(deploy),
    'deployment must depend on reusable exact-SHA verification');
});
