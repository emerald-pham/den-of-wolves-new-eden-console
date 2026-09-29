import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const browserGate = readFileSync(new URL('./test-typography-browser.mjs', import.meta.url), 'utf8');

test('exact-SHA Hosting verification always runs both typography gates', () => {
  assert.ok(/typography_required:[\s\S]*?type: boolean/.test(ci), 'CI needs a typography_required input');
  assert.ok(/TYPOGRAPHY_REQUIRED: \$\{\{ inputs\.typography_required \|\| false \}\}/.test(ci),
    'CI must receive the reusable-workflow typography requirement');
  assert.ok(/run_font=\$FONT_REQUIRED[\s\S]*?run_typography=\$TYPOGRAPHY_REQUIRED[\s\S]*?if \[ "\$has_hosting" = "true" \]; then[\s\S]*?run_font=true[\s\S]*?run_typography=true[\s\S]*?echo "font=\$run_font"[\s\S]*?echo "typography=\$run_typography"/.test(ci),
    'Hosting verification must force both gates even when reusable inputs are false');
  assert.ok(/outputs\.font == 'true'[\s\S]*?npm run test:font-consistency/.test(ci),
    'the source-level console font test must run when required');
  assert.ok(/outputs\.typography == 'true'[\s\S]*?npm run test:typography:browser/.test(ci),
    'the gate must execute when required');
  assert.ok(/outputs\.typography == 'true'[\s\S]*?playwright install --with-deps chromium/.test(ci),
    'the required browser gate must install its runtime');
  assert.equal(packageJson.scripts['test:typography:browser'], 'node scripts/test-typography-browser.mjs');
  assert.equal(packageJson.scripts['test:typography:release-gate'], 'node --test scripts/test-typography-release-gate.mjs');
  assert.ok(/name: Typography release-gate contract[\s\S]*?npm run test:typography:release-gate/.test(ci),
    'CI must validate that the release gate remains wired');
  assert.ok(/const PC01_SHA = '4e8e3876108709f2a620c4f71ea874183d3db4ee'/.test(browserGate),
    'the rendered comparison must use the exact accepted PC01 commit');
  for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1440, 900]]) {
    assert.ok(browserGate.includes(`width: ${width}, height: ${height}`),
      `the rendered comparison must cover ${width}x${height}`);
  }
  for (const metric of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'geometry']) {
    assert.ok(browserGate.includes(metric), `the browser gate must measure ${metric}`);
  }
  for (const surface of [
    'entry-catalog', 'gm-join', 'shared-header', 'dradis', 'press-shuttle', 'gm-console', 'mission',
  ]) {
    assert.ok(browserGate.includes(`id: '${surface}'`), `the browser gate must capture ${surface}`);
  }
  assert.ok(
    browserGate.includes("['gm-section-title', '.gm-console .gm-console__section-title']"),
    'the GM section-title sample must stay inside the GM route instead of racing a global lazy panel',
  );
  assert.ok(browserGate.includes('page.screenshot'), 'the browser gate must save rendered screenshots');
});

test('exact-SHA deployment cannot bypass typography verification before Hosting deploy', () => {
  assert.ok(/typography_required:[\s\S]*?contains\(needs\.determine-targets\.outputs\.targets, 'hosting'\)/.test(deploy),
    'Hosting targets must enable the typography gate unconditionally');
  assert.ok(/deploy:[\s\S]*?needs: \[determine-targets, verify\]/.test(deploy),
    'deployment must depend on reusable exact-SHA verification');
});
