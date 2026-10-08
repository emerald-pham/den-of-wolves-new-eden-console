#!/usr/bin/env node

import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { build as viteBuild, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

function tagAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function moduleAssetSpecifiers(html) {
  const specifiers = [];
  for (const [tag] of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    if (/^<script\b/i.test(tag) && tagAttribute(tag, 'type')?.toLowerCase() === 'module') {
      const source = tagAttribute(tag, 'src');
      if (!source) throw new Error('Module script has no measurable local source.');
      specifiers.push({ kind: 'module script', source });
    } else if (/^<link\b/i.test(tag) &&
      tagAttribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('modulepreload')) {
      const href = tagAttribute(tag, 'href');
      if (!href) throw new Error('Module preload has no measurable local source.');
      specifiers.push({ kind: 'module preload', source: href });
    }
  }
  return specifiers;
}

function localJavaScriptPath(distDirectory, importerPath, specifier) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(specifier)) return null;
  const pathname = decodeURIComponent(specifier.split(/[?#]/, 1)[0]);
  if (!pathname) return null;
  const distRoot = resolve(distDirectory);
  const candidate = resolve(pathname.startsWith('/')
    ? join(distRoot, pathname.slice(1))
    : join(dirname(importerPath), pathname));
  const pathFromDist = relative(distRoot, candidate);
  if (pathFromDist === '..' || pathFromDist.startsWith(`..${sep}`) || pathFromDist.startsWith(sep)) return null;
  if (!['.js', '.mjs'].includes(extname(candidate).toLowerCase())) return null;
  return candidate;
}

export async function collectJavaScriptModuleGraph(distDirectory, htmlFile = 'index.html') {
  const distRoot = resolve(distDirectory);
  const htmlPath = resolve(distRoot, htmlFile);
  const html = await readFile(htmlPath, 'utf8');
  const roots = moduleAssetSpecifiers(html);
  if (!roots.some(({ kind }) => kind === 'module script')) {
    throw new Error(`${htmlFile} has no measurable local module script.`);
  }
  const pending = roots.map(({ kind, source }) => {
    const path = localJavaScriptPath(distRoot, htmlPath, source);
    if (!path) throw new Error(`Unsupported ${kind} source in ${htmlFile}: ${source}`);
    return path;
  });
  const assets = new Set();
  await init;

  while (pending.length > 0) {
    const assetPath = pending.pop();
    if (assets.has(assetPath)) continue;
    const source = await readFile(assetPath, 'utf8');
    assets.add(assetPath);
    const [imports] = parse(source);
    for (const entry of imports) {
      if (entry.d !== -1) continue;
      const specifier = source.slice(entry.s, entry.e);
      const dependency = localJavaScriptPath(distRoot, assetPath, specifier);
      if (!dependency) throw new Error(`Unsupported static import in ${assetPath}: ${specifier}`);
      if (!assets.has(dependency)) pending.push(dependency);
    }
  }

  return [...assets].sort();
}

async function allJavaScriptAssets(assetDirectory) {
  const entries = await readdir(assetDirectory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(assetDirectory, entry.name);
    if (entry.isDirectory()) return allJavaScriptAssets(path);
    return entry.isFile() && ['.js', '.mjs'].includes(extname(entry.name).toLowerCase()) ? [path] : [];
  }));
  return nested.flat().sort();
}

async function summarizeJavaScriptAssets(distDirectory, files) {
  const buffers = await Promise.all(files.map((file) => readFile(file)));
  const sizes = buffers.map((buffer) => buffer.byteLength);
  return {
    rawBytes: sizes.reduce((total, size) => total + size, 0),
    gzipBytes: buffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0),
    largestChunkBytes: sizes.length > 0 ? Math.max(...sizes) : 0,
    chunks: files.length,
    files: files.map((file) => relative(distDirectory, file)),
  };
}

export async function measureBundleSizes(distDirectory) {
  const distRoot = resolve(distDirectory);
  const wholeBuildFiles = await allJavaScriptAssets(join(distRoot, 'assets'));
  const landingFiles = await collectJavaScriptModuleGraph(distRoot);
  let review = null;
  let hasReviewPage = false;
  try {
    await stat(join(distRoot, 'pc01-review.html'));
    hasReviewPage = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (hasReviewPage) {
    const reviewFiles = await collectJavaScriptModuleGraph(distRoot, 'pc01-review.html');
    review = await summarizeJavaScriptAssets(distRoot, reviewFiles);
  }
  return {
    landing: await summarizeJavaScriptAssets(distRoot, landingFiles),
    wholeBuild: await summarizeJavaScriptAssets(distRoot, wholeBuildFiles),
    review,
  };
}

export function playerConsoleRouteProbe() {
  return {
    route: '/console',
    readySelector: '.fleet-roster',
    forceOffline: false,
  };
}

export function isAwayMissionDiscardChunkRequest(url) {
  return /\/assets\/AwayMissionDiscardPanel-[^/?#]+\.js(?:[?#]|$)/.test(url);
}

async function main() {
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
const acknowledgeSafety = ({ forceOffline = false } = {}) => {
  const now = Date.now();
  // Keep external traffic blocked at the browser context. Reporting the
  // browser itself as offline causes protected-listener cache misses to be
  // interpreted as a kicked player before the station catalog can render.
  if (forceOffline) {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
  }
  localStorage.setItem('dow-new-eden-session-waiver', JSON.stringify({
    acknowledgedAt: now,
    termsVersion: 'code-of-conduct-v1',
  }));
  localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ choice: 'full', acknowledgedAt: now }));
  localStorage.setItem('new-eden-motion-override', 'full');
};
const sessionSeed = ({ lastRoute, mission = false }) => {
  const now = new Date().toISOString();
  const state = {
    session: { id: 'p637-route', name: 'P637', phase: 'lobby', currentTurn: 0, ownerUid: 'p637-player', createdAt: now, updatedAt: now },
    me: { uid: 'p637-player', sessionId: 'p637-route', displayName: 'Performance probe', role: 'player', joinedAt: now },
    seats: [], gmInstance: null, gmAccessAuthenticatedAt: null, pendingCommands: [], mode: 'console', lastRoute,
    awayMissionHandPointers: mission ? [{
      sessionId: 'p637-route', participantUid: 'p637-player', missionId: 'p637-mission',
      handId: 'p637-hand', phase: 'discarding', revision: 1, discarded: false,
    }] : [],
    awayMissionHands: [],
  };
  localStorage.setItem('dow-new-eden-session', JSON.stringify({ state, version: 1 }));
};

const routeProbe = playerConsoleRouteProbe();
const bundle = await measureBundleSizes(join(root, 'dist'));
const harnessOutput = join(artifactDirectory, 'harness-dist');
let production;
let harnessServer;
let browser;
try {
  // Compile the component harness with the same production JSX transform and
  // bundler used by the application. It is emitted only to the evidence
  // directory and never enters the deployable dist tree.
  await viteBuild({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { alias: { '@': join(root, 'src') } },
    build: {
      outDir: harnessOutput,
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: { input: join(root, 'scripts/render-performance-harness.html') },
    },
  });
  production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  harnessServer = await preview({
    configFile: false,
    root,
    build: { outDir: harnessOutput },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  browser = await chromium.launch({ headless: true });
  const productionOrigin = addressOf(production);
  const harnessOrigin = addressOf(harnessServer);
  const landingStartup = [];
  const routeStartup = [];
  const landingRequests = [];
  for (let index = 0; index < measurement.landingAndRouteSamples; index += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === productionOrigin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('request', (request) => landingRequests.push(request.url()));
    await page.addInitScript(acknowledgeSafety, { forceOffline: routeProbe.forceOffline });
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
    await routePage.addInitScript(acknowledgeSafety, { forceOffline: routeProbe.forceOffline });
    await routePage.addInitScript(sessionSeed, { lastRoute: routeProbe.route, mission: false });
    started = performance.now();
    await routePage.goto(`${productionOrigin}/#${routeProbe.route}`, { waitUntil: 'domcontentloaded' });
    await routePage.locator(routeProbe.readySelector).waitFor().catch(async (error) => {
      const body = (await routePage.locator('body').innerText().catch(() => '')).slice(0, 1_000);
      const persisted = await routePage.evaluate(() => localStorage.getItem('dow-new-eden-session'))
        .catch(() => null);
      console.error(`Route probe failed at ${routePage.url()}\n${body}\nPersisted session: ${persisted}`);
      throw error;
    });
    routeStartup.push(performance.now() - started);
    await routeContext.close();
  }

  const missionContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await missionContext.route('**/*', (route) => new URL(route.request().url()).origin === productionOrigin ? route.continue() : route.abort());
  const missionPage = await missionContext.newPage();
  const missionRequests = [];
  missionPage.on('request', (request) => missionRequests.push(request.url()));
  await missionPage.addInitScript(acknowledgeSafety, { forceOffline: routeProbe.forceOffline });
  await missionPage.addInitScript(sessionSeed, { lastRoute: routeProbe.route, mission: true });
  await missionPage.goto(`${productionOrigin}/#${routeProbe.route}`, { waitUntil: 'domcontentloaded' });
  await missionPage.locator('.away-mission-private-panel').waitFor();
  await missionContext.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === harnessOrigin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.addInitScript(acknowledgeSafety, { forceOffline: routeProbe.forceOffline });
  await page.goto(`${harnessOrigin}/scripts/render-performance-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.evaluate(() => document.fonts.ready);
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
    renderMeasurement: {
      clock: 'fixed 60Hz animation frames and timeouts; native performance.now',
      budgetedUpdate: 'React commit, two production sweep callbacks, synchronous style/layout and two native paint waits',
      workCost: 'diagnostic only; budgeted update minus native paint waits',
      mobileFrames: 'fixed sweep workload; native animation-frame intervals including work and paint waits',
    },
    landingStartup: { samples: landingStartup.map(rounded), p95Ms: rounded(percentile(landingStartup)) },
    routeStartup: { samples: routeStartup.map(rounded), p95Ms: rounded(percentile(routeStartup)) },
    protectedMissionChunk: {
      landingRequests: landingRequests.filter(isAwayMissionDiscardChunkRequest).length,
      missionRequests: missionRequests.filter(isAwayMissionDiscardChunkRequest).length,
    },
    dradisUpdate: {
      p95Ms: rounded(percentile(render.dradis.samples)),
      maxMs: rounded(Math.max(...render.dradis.samples)),
      samples: render.dradis.samples.map(rounded),
      workP95Ms: rounded(percentile(render.dradis.workSamples)),
      workSamples: render.dradis.workSamples.map(rounded),
      labelLayoutReads: render.dradis.labelLayoutReads,
      labelLayoutReadSamples: render.dradis.labelLayoutReadSamples,
    },
    attackUpdate: {
      p95Ms: rounded(percentile(render.attack.samples)), maxMs: rounded(Math.max(...render.attack.samples)),
      workP95Ms: rounded(percentile(render.attack.workSamples)),
    },
    missionHandUpdate: {
      p95Ms: rounded(percentile(render.missionHands.samples)), maxMs: rounded(Math.max(...render.missionHands.samples)),
      workP95Ms: rounded(percentile(render.missionHands.workSamples)),
    },
    mobileFrame: {
      p95Ms: rounded(percentile(render.mobileFrames.samples)),
      maxMs: rounded(Math.max(...render.mobileFrames.samples)),
      longFrames: render.mobileFrames.samples.filter((sample) => sample > measurement.longFrameThresholdMs).length,
      samples: render.mobileFrames.samples.map(rounded),
      labelLayoutReads: render.mobileFrames.labelLayoutReads,
      labelLayoutReadSamples: render.mobileFrames.labelLayoutReadSamples,
    },
  };
  // Preserve measurements before enforcing budgets so a regression produces
  // the machine-readable CI artifact needed to diagnose the breached surface.
  await writeFile(join(artifactDirectory, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  assert.ok(bundle.landing.rawBytes <= budgets.landingBundleRawBytes, `Landing JavaScript is ${bundle.landing.rawBytes} bytes; budget ${budgets.landingBundleRawBytes}.`);
  assert.ok(bundle.landing.gzipBytes <= budgets.landingBundleGzipBytes, `Landing gzip JavaScript is ${bundle.landing.gzipBytes} bytes; budget ${budgets.landingBundleGzipBytes}.`);
  assert.ok(bundle.wholeBuild.largestChunkBytes <= budgets.largestJavaScriptChunkBytes, `Largest JavaScript chunk is ${bundle.wholeBuild.largestChunkBytes} bytes; budget ${budgets.largestJavaScriptChunkBytes}.`);
  assert.ok(results.landingStartup.p95Ms <= budgets.landingStartupP95Ms, `Landing startup p95 ${results.landingStartup.p95Ms}ms exceeds ${budgets.landingStartupP95Ms}ms.`);
  assert.ok(results.routeStartup.p95Ms <= budgets.routeStartupP95Ms, `Route startup p95 ${results.routeStartup.p95Ms}ms exceeds ${budgets.routeStartupP95Ms}ms.`);
  assert.equal(results.protectedMissionChunk.landingRequests, 0,
    'Landing requested the protected away-mission discard chunk.');
  assert.ok(results.protectedMissionChunk.missionRequests > 0,
    'A player with a private away-mission pointer did not request the protected discard chunk.');
  assert.ok(results.dradisUpdate.p95Ms <= budgets.dradisUpdateP95Ms, `DRADIS update p95 ${results.dradisUpdate.p95Ms}ms exceeds ${budgets.dradisUpdateP95Ms}ms.`);
  const maxLabelReads = (measurement.renderUpdateSamples + 1) * 20 * budgets.dradisLabelLayoutReadsPerContactUpdate;
  assert.ok(results.dradisUpdate.labelLayoutReads <= maxLabelReads,
    `DRADIS label layout made ${results.dradisUpdate.labelLayoutReads} synchronous reads; budget ${maxLabelReads}.`);
  assert.ok(results.attackUpdate.p95Ms <= budgets.attackUpdateP95Ms, `Attack update p95 ${results.attackUpdate.p95Ms}ms exceeds ${budgets.attackUpdateP95Ms}ms.`);
  assert.ok(results.missionHandUpdate.p95Ms <= budgets.missionHandUpdateP95Ms, `Mission-hand update p95 ${results.missionHandUpdate.p95Ms}ms exceeds ${budgets.missionHandUpdateP95Ms}ms.`);
  assert.ok(results.mobileFrame.p95Ms <= budgets.mobileFrameP95Ms, `Mobile frame p95 ${results.mobileFrame.p95Ms}ms exceeds ${budgets.mobileFrameP95Ms}ms.`);
  assert.ok(results.mobileFrame.longFrames <= budgets.mobileLongFrames, `Mobile long frames ${results.mobileFrame.longFrames} exceeds ${budgets.mobileLongFrames}.`);
  console.log(`PASS P637 render-performance baseline\n${JSON.stringify(results, null, 2)}`);
} finally {
  await browser?.close().catch(() => undefined);
  if (harnessServer) await new Promise((resolve) => harnessServer.httpServer.close(resolve));
  if (production) await new Promise((resolve) => production.httpServer.close(resolve));
}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
