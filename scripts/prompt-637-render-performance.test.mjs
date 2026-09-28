import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  collectJavaScriptModuleGraph,
  isAwayMissionDiscardChunkRequest,
  measureBundleSizes,
  playerConsoleRouteProbe,
} from './prompt-637-render-performance.mjs';

test('recognizes only the protected away-mission discard browser chunk', () => {
  assert.equal(isAwayMissionDiscardChunkRequest('http://127.0.0.1:4173/assets/AwayMissionDiscardPanel-abc123.js'), true);
  assert.equal(isAwayMissionDiscardChunkRequest('http://127.0.0.1:4173/assets/AwayMissionDiscardPanel-abc123.js?v=1'), true);
  assert.equal(isAwayMissionDiscardChunkRequest('http://127.0.0.1:4173/assets/SessionMode-abc123.js'), false);
  assert.equal(isAwayMissionDiscardChunkRequest('http://127.0.0.1:4173/src/components/AwayMissionDiscardPanel.tsx'), false);
});

test('measures the PC04 player station catalog instead of the GM-only Role Select route', () => {
  assert.deepEqual(playerConsoleRouteProbe(), {
    route: '/console',
    readySelector: '.fleet-roster',
    forceOffline: false,
  });
});

test('keeps the PC04 mission-start workspace out of the landing module graph', async () => {
  const gmConsole = await readFile(new URL('../src/routes/GmConsole.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(gmConsole, /^import AwayMissionStartPanel from/m);
  assert.match(
    gmConsole,
    /const AwayMissionStartPanel = lazy\(\(\) => import\('@\/components\/AwayMissionStartPanel'\)\);/,
  );
});

test('defers PC04 mission discard and fleet-group detail until their protected surfaces render', async () => {
  const [app, navigation] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ShipNavigationWorkspace.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(app, /^import SessionMode from/m);
  assert.match(app, /const SessionMode = lazy\(\(\) => import\('@\/routes\/SessionMode'\)\);/);
  assert.doesNotMatch(app, /^import AwayMissionDiscardPanel from/m);
  assert.match(app, /const AwayMissionDiscardPanel = lazy\(\(\) => import\('@\/components\/AwayMissionDiscardPanel'\)\);/);
  assert.doesNotMatch(navigation, /^import FleetGroupContext from/m);
  assert.match(navigation, /const FleetGroupContext = lazy\(\(\) => import\('\.\/FleetGroupContext'\)\);/);
});

test('measures landing HTML modulepreloads and static imports, excluding lazy and isolated review assets', async (t) => {
  const distDirectory = await mkdtemp(join(tmpdir(), 'p637-render-performance-'));
  const assetDirectory = join(distDirectory, 'assets');
  await mkdir(assetDirectory, { recursive: true });
  t.after(() => rm(distDirectory, { recursive: true, force: true }));

  const assets = {
    'index.js': 'import { boot } from "./landing-module.js"; import("./lazy-route.js"); boot();',
    'landing-module.js': 'import "./static-leaf.js"; export const boot = () => {};',
    'static-leaf.js': 'export const ready = true;',
    'preloaded.js': 'export const preloaded = true;',
    'lazy-route.js': `export const lazyPayload = "${'L'.repeat(600)}";`,
    'review.js': `export const reviewPayload = "${'R'.repeat(300)}";`,
    'orphan.js': `export const orphanPayload = "${'O'.repeat(700)}";`,
  };
  await Promise.all(Object.entries(assets).map(([name, contents]) =>
    writeFile(join(assetDirectory, name), contents)));
  await writeFile(join(distDirectory, 'index.html'), [
    '<script type="module" crossorigin src="/assets/index.js"></script>',
    '<link rel="modulepreload" crossorigin href="/assets/preloaded.js">',
  ].join('\n'));
  await writeFile(join(distDirectory, 'pc01-review.html'), [
    '<script crossorigin src="/assets/review.js" type="module"></script>',
    '<link href="/assets/static-leaf.js" rel="modulepreload">',
  ].join('\n'));

  const measured = await measureBundleSizes(distDirectory);

  assert.deepEqual(measured.landing.files.map((file) => basename(file)).sort(), [
    'index.js', 'landing-module.js', 'preloaded.js', 'static-leaf.js',
  ]);
  assert.equal(measured.landing.rawBytes, [
    'index.js', 'landing-module.js', 'preloaded.js', 'static-leaf.js',
  ].reduce((total, name) => total + Buffer.byteLength(assets[name]), 0));
  assert.deepEqual(measured.review.files.map((file) => basename(file)).sort(), ['review.js', 'static-leaf.js']);
  assert.equal(measured.wholeBuild.files.length, Object.keys(assets).length);
  assert.equal(measured.wholeBuild.largestChunkBytes, Buffer.byteLength(assets['orphan.js']));
});

test('rejects missing or unsupported landing roots and static imports', async (t) => {
  const distDirectory = await mkdtemp(join(tmpdir(), 'p637-invalid-entry-'));
  const assetDirectory = join(distDirectory, 'assets');
  await mkdir(assetDirectory, { recursive: true });
  t.after(() => rm(distDirectory, { recursive: true, force: true }));

  await writeFile(join(distDirectory, 'index.html'), '<html><body>No module entry</body></html>');
  await assert.rejects(() => collectJavaScriptModuleGraph(distDirectory), /module script/i);

  await writeFile(join(distDirectory, 'index.html'),
    '<script type="module" src="https://example.invalid/external.js"></script>');
  await assert.rejects(() => collectJavaScriptModuleGraph(distDirectory), /module script/i);

  await writeFile(join(assetDirectory, 'index.js'), 'import "https://example.invalid/dependency.js";');
  await writeFile(join(distDirectory, 'index.html'),
    '<script type="module" src="/assets/index.js"></script>');
  await assert.rejects(() => collectJavaScriptModuleGraph(distDirectory), /static import/i);
});
