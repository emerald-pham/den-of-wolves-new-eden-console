#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_620_ENDEAVOUR_UPGRADE_EVIDENCE_DIR ??
  '/tmp/prompt-620-endeavour-upgrade-render');
const HARNESS_PATH = resolve(ROOT, 'src/__prompt620EndeavourUpgradeRender.tsx');
const HTML_PATH = resolve(ROOT, '__prompt620-endeavour-upgrade-render.html');
const VIEWPORTS = [
  { name: 'narrow-phone', width: 320, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'short-landscape', width: 844, height: 390 },
];
const MOTION_MODES = ['full', 'reduce'];

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port.');
  return address.port;
}

async function waitForHttp(url, child, readOutput) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited early.\n${readOutput()}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}.\n${readOutput()}`);
}

function writeHarness() {
  if (existsSync(HARNESS_PATH) || existsSync(HTML_PATH)) {
    throw new Error('A temporary Endeavour render harness path already exists.');
  }
  writeFileSync(HTML_PATH, `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module" src="/src/__prompt620EndeavourUpgradeRender.tsx"></script></body></html>`);
  writeFileSync(HARNESS_PATH, `import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import EndeavourFieldUpgradePanel from '@/components/EndeavourFieldUpgradePanel';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player, ShuttleControlEntry } from '@/types/game';
import type { EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';
import type { EndeavourFieldUpgradePurchaseState } from '@/lib/endeavourFieldUpgradeService';

const now = Date.now();
const timestamp = new Date(now).toISOString();
const control: ShuttleControlEntry = {
  shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'render-scientist',
  holderUid: 'render-scientist', revision: 4,
};
const session = {
  id: 'p620-render', name: 'Endeavour upgrade render', joinCode: '6200', phase: 'active',
  ownerUid: 'render-scientist', currentTurn: 3,
  activeRoleIds: ['shepherd-scientist', 'admiral'],
  activeVesselIds: ['shepherd', 'aegis', 'quellon'],
  shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: timestamp }],
  shuttleControl: { endeavour: control }, shuttleFuelled: { endeavour: false },
  turnPhase: {
    turn: 3, teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
    openAirspaceEndsAt: new Date(now + 1_200_000).toISOString(),
    airspace: { state: 'lifted', tickerActive: false, pressAccess: false },
  },
  playerDiscovery: {
    groupId: 'fleet-1', fleetGroupVesselIds: ['shepherd', 'aegis', 'quellon'],
    knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [], revision: 1,
  },
  shipUpgrades: { shepherd: [], aegis: [], quellon: [] },
  createdAt: timestamp, updatedAt: timestamp,
} as unknown as GameSession;
const me = {
  uid: 'render-scientist', sessionId: session.id, displayName: 'Scientist', role: 'player',
  seatId: null, assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist',
  fleetGroupId: 'fleet-1', joinedAt: timestamp,
} as unknown as Player;
const workspace: EndeavourResearchWorkspace = {
  status: 'ready', sessionId: session.id, cycle: 3, researchRevision: 2,
  cadence: { cycle: 3, revision: 2, choices: [] },
  progress: { reactor: 1, 'jump-drive': 0, 'advanced-hydroponics': 0, 'water-reclamation': 0 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 1, totalBoxes: 5, currentMaterialCost: 7, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
    { trackId: 'advanced-hydroponics', name: 'Advanced Hydroponics', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 18, complete: false },
    { trackId: 'water-reclamation', name: 'Water Reclamation', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 8, complete: false },
  ],
  shepherdOre: 10, fieldUpgradeState: { upgradeRevision: 6, targetsUsedThisCycle: 0 },
};
const purchaseState: EndeavourFieldUpgradePurchaseState = {
  status: 'ready', sessionId: session.id, cycle: 3, researchRevision: 2,
  upgradeRevision: 6, targetsUsedThisCycle: 0,
};
const store = useSessionStore.getState();
store.reset();
store.setIdentity(session, me);
store.setConnection('live');
store.setSessionSnapshotFreshness('server');
store.setMode('console');

createRoot(document.getElementById('root')!).render(
  <main className="ship-console ship-console--gameplay shuttle-console">
    <section className="console-workspace cic-frame shuttle-console__workspace">
      <EndeavourFieldUpgradePanel control={control} workspace={workspace} purchaseState={purchaseState} />
    </section>
  </main>,
);`);
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeHarness();
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;
  const output = [];
  const vite = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT, env: { ...process.env, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout?.on('data', (chunk) => output.push(chunk.toString()));
  vite.stderr?.on('data', (chunk) => output.push(chunk.toString()));
  let browser;
  try {
    await waitForHttp(appUrl, vite, () => output.join('').slice(-4000));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const viewport of VIEWPORTS) {
      for (const motion of MOTION_MODES) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block',
        });
        const page = await context.newPage();
        await page.emulateMedia({ reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
        await page.goto(`${appUrl}/__prompt620-endeavour-upgrade-render.html`, { waitUntil: 'domcontentloaded' });
        const panel = page.getByRole('region', { name: 'Endeavour field-upgrade purchase controls' });
        await panel.waitFor({ state: 'visible', timeout: 12_000 });
        await page.evaluate(async () => document.fonts.ready);
        await panel.scrollIntoViewIfNeeded();
        await panel.getByRole('checkbox', { name: 'Shepherd // Reactor // 7 materials' }).check();
        const measurement = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const action = element.querySelector('.cic-action-button');
          const actionRect = action?.getBoundingClientRect();
          const fontFamily = getComputedStyle(element).fontFamily;
          const expectedFontFamily = getComputedStyle(document.documentElement)
            .getPropertyValue('--cic-mono').trim();
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) context.font = getComputedStyle(element).font;
          const narrowGlyphWidth = context?.measureText('iiiiiiii').width ?? 0;
          const wideGlyphWidth = context?.measureText('WWWWWWWW').width ?? 0;
          return {
            fontFamily, expectedFontFamily,
            fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
            monospaceGlyphDelta: Math.abs(narrowGlyphWidth - wideGlyphWidth),
            scrollWidth: document.documentElement.scrollWidth,
            viewport: { width: innerWidth, height: innerHeight },
            panel: { left: rect.left, right: rect.right, width: rect.width },
            action: actionRect ? { height: actionRect.height, text: action?.textContent?.trim() } : null,
            checkboxes: element.querySelectorAll('input[type="checkbox"]').length,
            checked: element.querySelectorAll('input[type="checkbox"]:checked').length,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            textColor: getComputedStyle(element.querySelector('.console-workspace__status')).color,
            backgroundColor: getComputedStyle(element).backgroundColor,
          };
        });
        const normalizeFont = (value) => value.replace(/["']/g, '').replace(/\s+/g, ' ').trim();
        if (normalizeFont(measurement.fontFamily) !== normalizeFont(measurement.expectedFontFamily) ||
            !/monospace/i.test(measurement.fontFamily) || measurement.monospaceGlyphDelta > 0.5 ||
            measurement.fontSize < 14) {
          throw new Error(`${viewport.name}/${motion}: Endeavour font check failed: ${JSON.stringify(measurement)}`);
        }
        if (measurement.scrollWidth > viewport.width + 1 || measurement.panel.left < -1 ||
            measurement.panel.right > viewport.width + 1) {
          throw new Error(`${viewport.name}/${motion}: Endeavour panel overflowed: ${JSON.stringify(measurement)}`);
        }
        if (!measurement.action || measurement.action.height < 44 || measurement.checkboxes < 1 ||
            measurement.checked !== 1 || measurement.reducedMotion !== (motion === 'reduce') ||
            await panel.getByRole('button', { name: 'Purchase selected upgrades' }).isDisabled()) {
          throw new Error(`${viewport.name}/${motion}: Endeavour controls are not usable: ${JSON.stringify(measurement)}`);
        }
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}.png`), fullPage: false,
        });
        console.log(`Endeavour field-upgrade render passed: ${viewport.name} ${viewport.width}x${viewport.height}, motion=${motion}`);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    if (vite.exitCode === null) vite.kill('SIGTERM');
    rmSync(HARNESS_PATH, { force: true });
    rmSync(HTML_PATH, { force: true });
  }
}

await main();
