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


test('typography readiness waits for a late lazy target after the heading is visible', async () => {
  const { waitForTypographyTargets } = await import('./typography-browser-readiness.mjs');
  let revealMap;
  const mapReady = new Promise((resolve) => { revealMap = resolve; });
  const waits = [];
  let completed = false;
  const page = {
    locator(selector) {
      return { first() { return { waitFor(options) {
        waits.push([selector, options]);
        return selector === '.map label' ? mapReady : Promise.resolve();
      } }; } };
    },
  };
  const ready = waitForTypographyTargets(page, [['heading', 'h1'], ['map', '.map label']])
    .then(() => { completed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false, 'a visible heading cannot make a lazy map ready');
  assert.deepEqual(waits, [
    ['h1', { state: 'visible', timeout: 15_000 }],
    ['.map label', { state: 'visible', timeout: 15_000 }],
  ], 'all required targets share the existing readiness bound');
  revealMap();
  await ready;
  assert.equal(completed, true);
});

test('typography readiness rejects an unavailable required target', async () => {
  const { waitForTypographyTargets } = await import('./typography-browser-readiness.mjs');
  const missing = new Error('map did not become visible');
  const page = {
    locator(selector) {
      return { first() { return { waitFor() {
        return selector === '.map label' ? Promise.reject(missing) : Promise.resolve();
      } }; } };
    },
  };
  await assert.rejects(
    waitForTypographyTargets(page, [['heading', 'h1'], ['map', '.map label']]),
    (error) => error === missing,
  );
});

test('computed typography uses complete target readiness before measurement', () => {
  assert.ok(browserGate.includes('await waitForTypographyTargets(page, surface.targets)'),
    'the full gate must wait for every required sample, including lazy GM controls');
});


test('local typography fixture permits only its own Vite origin', async () => {
  const { installTypographyNetworkBoundary } = await import('./typography-browser-readiness.mjs');
  let handler;
  const context = { route: async (pattern, callback) => {
    assert.equal(pattern, '**/*');
    handler = callback;
  } };
  await installTypographyNetworkBoundary(context, 'http://127.0.0.1:4321');
  const decisions = [];
  for (const url of [
    'http://127.0.0.1:4321/src/components/GmStarmapModule.tsx',
    'http://127.0.0.1:4321/fonts/ShareTechMono-Regular.woff2',
    'https://us-central1-example.cloudfunctions.net/resumeSession',
    'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel',
    'http://127.0.0.1:9999/other-app',
  ]) {
    await handler({
      request: () => ({ url: () => url }),
      continue: async () => { decisions.push(['continue', url]); },
      abort: async (reason) => { decisions.push(['abort', url, reason]); },
    });
  }
  assert.deepEqual(decisions.map(([action, , reason]) => [action, reason]), [
    ['continue', undefined], ['continue', undefined],
    ['abort', 'internetdisconnected'], ['abort', 'internetdisconnected'],
    ['abort', 'internetdisconnected'],
  ]);
});

test('fixture network boundary rejects a nonlocal application origin', async () => {
  const { installTypographyNetworkBoundary } = await import('./typography-browser-readiness.mjs');
  let registered = false;
  const context = { route: async () => { registered = true; } };
  await assert.rejects(
    installTypographyNetworkBoundary(context, 'https://example.web.app'),
    /local Vite origin/,
  );
  assert.equal(registered, false);
});

test('render fixture installs its network boundary before opening the page', () => {
  assert.ok(browserGate.includes('await installTypographyNetworkBoundary(context, appUrl)'),
    'local synthetic state must not race real production resume requests');
  assert.ok(browserGate.indexOf('await installTypographyNetworkBoundary(context, appUrl)') <
    browserGate.indexOf('const page = await context.newPage()'));
});
