#!/usr/bin/env node

import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';

const root = process.cwd();
const baseline = JSON.parse(await readFile(join(root, 'config/render-performance-baseline.json'), 'utf8'));
const { budgets, measurement } = baseline;
const artifactDirectory = process.env.P637_PERFORMANCE_ARTIFACT_DIR ?? '/tmp/p637-render-performance';
await mkdir(artifactDirectory, { recursive: true });

const percentile = (values, fraction = 0.95) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
const rounded = (value) => Math.round(value * 100) / 100;
const addressOf = (server) => {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a local port.');
  return `http://127.0.0.1:${address.port}`;
};
const acknowledgeSafety = () => {
  const now = Date.now();
  // Keep the production-path startup probe deterministic and local. An offline
  // cached session remains renderable, while a failed remote resume may
  // correctly clear a terminal session and race the route measurement.
  Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
  localStorage.setItem('dow-new-eden-session-waiver', String(now));
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ choice: 'full', acknowledgedAt: now }));
  localStorage.setItem('new-eden-motion-override', 'full');
};
const sessionSeed = () => {
  const now = new Date().toISOString();
  const state = {
    session: { id: 'p637-route', name: 'P637', phase: 'lobby', currentTurn: 0, ownerUid: 'p637-player', createdAt: now, updatedAt: now },
    me: { uid: 'p637-player', sessionId: 'p637-route', displayName: 'Performance probe', role: 'player', joinedAt: now },
    seats: [], gmInstance: null, gmAccessAuthenticatedAt: null, pendingCommands: [], mode: 'console', lastRoute: '/roles',
  };
  localStorage.setItem('dow-new-eden-session', JSON.stringify({ state, version: 1 }));
};

const assetDirectory = join(root, 'dist/assets');
const assetFiles = await readdir(assetDirectory);
const jsFiles = assetFiles.filter((file) => file.endsWith('.js'));
const jsBuffers = await Promise.all(jsFiles.map((file) => readFile(join(assetDirectory, file))));
const jsSizes = await Promise.all(jsFiles.map((file) => stat(join(assetDirectory, file)).then((entry) => entry.size)));
const bundle = {
  rawBytes: jsSizes.reduce((total, size) => total + size, 0),
  gzipBytes: jsBuffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0),
  largestChunkBytes: Math.max(...jsSizes),
  chunks: jsFiles.length,
};
assert.ok(bundle.rawBytes <= budgets.landingBundleRawBytes, `Landing JavaScript is ${bundle.rawBytes} bytes; budget ${budgets.landingBundleRawBytes}.`);
assert.ok(bundle.gzipBytes <= budgets.landingBundleGzipBytes, `Landing gzip JavaScript is ${bundle.gzipBytes} bytes; budget ${budgets.landingBundleGzipBytes}.`);
assert.ok(bundle.largestChunkBytes <= budgets.largestJavaScriptChunkBytes, `Largest JavaScript chunk is ${bundle.largestChunkBytes} bytes; budget ${budgets.largestJavaScriptChunkBytes}.`);

const production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const harnessServer = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await harnessServer.listen();
const browser = await chromium.launch({ headless: true });
try {
  const productionOrigin = addressOf(production);
  const harnessOrigin = addressOf(harnessServer);
  const landingStartup = [];
  const routeStartup = [];
  for (let index = 0; index < measurement.landingAndRouteSamples; index += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === productionOrigin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.addInitScript(acknowledgeSafety);
    let started = performance.now();
    await page.goto(productionOrigin, { waitUntil: 'domcontentloaded' });
    await page.locator('#join-code').waitFor();
    landingStartup.push(performance.now() - started);
    await context.close();

    // Seed before the application module hydrates. Mutating localStorage from
    // an already-running landing page would be overwritten by that page's
    // in-memory Zustand state during navigation.
    const routeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await routeContext.route('**/*', (route) => new URL(route.request().url()).origin === productionOrigin ? route.continue() : route.abort());
    const routePage = await routeContext.newPage();
    await routePage.addInitScript(acknowledgeSafety);
    await routePage.addInitScript(sessionSeed);
    started = performance.now();
    await routePage.goto(`${productionOrigin}/#/roles`, { waitUntil: 'domcontentloaded' });
    await routePage.locator('.role-select').waitFor();
    routeStartup.push(performance.now() - started);
    await routeContext.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === harnessOrigin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.addInitScript(acknowledgeSafety);
  await page.goto(`${harnessOrigin}/scripts/render-performance-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const render = await page.evaluate(async ({ updateSamples, frameSamples }) => {
    if (!window.__p637) throw new Error('P637 browser harness did not initialize.');
    return {
      dradis: await window.__p637.measureDradis(updateSamples),
      attack: await window.__p637.measureAttack(updateSamples),
      missionHands: await window.__p637.measureMissionHands(updateSamples),
      mobileFrames: await window.__p637.measureMobileFrames(frameSamples),
    };
  }, { updateSamples: measurement.renderUpdateSamples, frameSamples: measurement.mobileFrameSamples });
  await context.close();

  const results = {
    measuredAt: new Date().toISOString(), baselineVersion: baseline.version, bundle,
    landingStartup: { samples: landingStartup.map(rounded), p95Ms: rounded(percentile(landingStartup)) },
    routeStartup: { samples: routeStartup.map(rounded), p95Ms: rounded(percentile(routeStartup)) },
    dradisUpdate: { p95Ms: rounded(percentile(render.dradis.samples)), maxMs: rounded(Math.max(...render.dradis.samples)) },
    attackUpdate: { p95Ms: rounded(percentile(render.attack.samples)), maxMs: rounded(Math.max(...render.attack.samples)) },
    missionHandUpdate: { p95Ms: rounded(percentile(render.missionHands.samples)), maxMs: rounded(Math.max(...render.missionHands.samples)) },
    mobileFrame: {
      p95Ms: rounded(percentile(render.mobileFrames.samples)),
      maxMs: rounded(Math.max(...render.mobileFrames.samples)),
      longFrames: render.mobileFrames.samples.filter((sample) => sample > measurement.longFrameThresholdMs).length,
    },
  };
  assert.ok(results.landingStartup.p95Ms <= budgets.landingStartupP95Ms, `Landing startup p95 ${results.landingStartup.p95Ms}ms exceeds ${budgets.landingStartupP95Ms}ms.`);
  assert.ok(results.routeStartup.p95Ms <= budgets.routeStartupP95Ms, `Route startup p95 ${results.routeStartup.p95Ms}ms exceeds ${budgets.routeStartupP95Ms}ms.`);
  assert.ok(results.dradisUpdate.p95Ms <= budgets.dradisUpdateP95Ms, `DRADIS update p95 ${results.dradisUpdate.p95Ms}ms exceeds ${budgets.dradisUpdateP95Ms}ms.`);
  assert.ok(results.attackUpdate.p95Ms <= budgets.attackUpdateP95Ms, `Attack update p95 ${results.attackUpdate.p95Ms}ms exceeds ${budgets.attackUpdateP95Ms}ms.`);
  assert.ok(results.missionHandUpdate.p95Ms <= budgets.missionHandUpdateP95Ms, `Mission-hand update p95 ${results.missionHandUpdate.p95Ms}ms exceeds ${budgets.missionHandUpdateP95Ms}ms.`);
  assert.ok(results.mobileFrame.p95Ms <= budgets.mobileFrameP95Ms, `Mobile frame p95 ${results.mobileFrame.p95Ms}ms exceeds ${budgets.mobileFrameP95Ms}ms.`);
  assert.ok(results.mobileFrame.longFrames <= budgets.mobileLongFrames, `Mobile long frames ${results.mobileFrame.longFrames} exceeds ${budgets.mobileLongFrames}.`);
  await writeFile(join(artifactDirectory, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`PASS P637 render-performance baseline\n${JSON.stringify(results, null, 2)}`);
} finally {
  await browser.close();
  await harnessServer.close();
  await new Promise((resolve) => production.httpServer.close(resolve));
}
