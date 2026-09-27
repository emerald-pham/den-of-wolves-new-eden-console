#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_620_PHILIA_EVIDENCE_DIR ?? '/tmp/prompt-620-philia-render');
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

function persistedState(now) {
  const timestamp = new Date(now).toISOString();
  const session = {
    id: 'prompt-620-philia-render', name: 'Philia repair render review', joinCode: '6200',
    phase: 'active', ownerUid: 'prompt-620-philia-holder', createdAt: timestamp, updatedAt: timestamp,
    configurationLocked: true, currentTurn: 3,
    activeRoleIds: ['dione-engineer'],
    activeVesselIds: ['dione', 'aegis', 'shepherd'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 1_200_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleControl: { philia: {
      shuttleId: 'philia', ownerRoleId: 'dione-engineer',
      ownerUid: 'prompt-620-philia-holder', holderUid: 'prompt-620-philia-holder', revision: 2,
    } },
    shuttleDockings: [{ shuttleId: 'philia', shipId: 'dione', dockedAt: timestamp }],
    shuttleFuelled: { philia: false },
    shipDamage: {
      dione: { damagedSystemIds: ['reactor', 'storage'], destroyed: false },
      aegis: { damagedSystemIds: ['reactor'], destroyed: false },
      shepherd: { damagedSystemIds: ['reactor'], destroyed: false },
    },
    shipResources: {
      dione: { ore: 0, fuel: 4, food: 13, water: 14, materials: 12, securityTeams: 2 },
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 8, securityTeams: 9 },
      shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 8, securityTeams: 2 },
    },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['dione', 'aegis', 'shepherd'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [],
    },
  };
  const me = {
    uid: 'prompt-620-philia-holder', sessionId: session.id, displayName: 'Dione Engineer',
    role: 'player', seatId: null, assignedRoleId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer', fleetGroupId: 'fleet-1',
    joinedAt: timestamp,
  };
  return JSON.stringify({
    state: { session, me, gmInstance: null, gmAccessAuthenticatedAt: null,
      pendingCommands: [], mode: 'console', lastRoute: '/shuttles/philia' },
    version: 1,
  });
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
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
        const now = Date.now();
        const stored = persistedState(now);
        await context.addInitScript(({ session, timestamp, motionChoice }) => {
          localStorage.setItem('dow-new-eden-session', session);
          localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
          localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
            acknowledgedAt: timestamp, choice: motionChoice,
          }));
          localStorage.setItem('new-eden-motion-override', motionChoice === 'reduce' ? 'reduce' : 'full');
        }, { session: stored, timestamp: now, motionChoice: motion });
        const page = await context.newPage();
        await page.emulateMedia({ reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
        await page.goto(`${appUrl}/#/shuttles/philia`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
          const { useSessionStore } = await import('/src/store/useSessionStore.ts');
          const store = useSessionStore.getState();
          store.setConnection('live');
          store.setSessionSnapshotFreshness('server');
          store.setSession({
            ...store.session,
            playerDiscovery: {
              groupId: 'fleet-1', fleetGroupVesselIds: ['dione', 'aegis', 'shepherd'],
              knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [],
            },
          });
        });
        const panel = page.getByRole('region', { name: 'Philia console repair' });
        await panel.waitFor({ state: 'visible', timeout: 12_000 });
        await page.evaluate(async () => document.fonts.ready);
        await panel.scrollIntoViewIfNeeded();
        await panel.getByRole('checkbox', { name: 'Reactor' }).check();
        const measurement = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const button = element.querySelector('button');
          const buttonRect = button?.getBoundingClientRect();
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
            panel: { left: rect.left, right: rect.right },
            button: buttonRect ? { height: buttonRect.height, text: button?.textContent?.trim() } : null,
            checkboxes: element.querySelectorAll('input[type="checkbox"]').length,
          };
        });
        const normalizedFont = (value) => value.replace(/["']/g, '').replace(/\s+/g, ' ').trim();
        if (normalizedFont(measurement.fontFamily) !== normalizedFont(measurement.expectedFontFamily) ||
            !/monospace/i.test(measurement.fontFamily) || measurement.monospaceGlyphDelta > 0.5 ||
            measurement.fontSize < 14) {
          throw new Error(`${viewport.name}/${motion}: Philia font check failed: ${JSON.stringify(measurement)}`);
        }
        if (measurement.scrollWidth > viewport.width + 1 || measurement.panel.left < -1 ||
            measurement.panel.right > viewport.width + 1) {
          throw new Error(`${viewport.name}/${motion}: Philia panel overflowed: ${JSON.stringify(measurement)}`);
        }
        if (!measurement.button || measurement.button.height < 44 || measurement.checkboxes < 1 ||
            await panel.getByRole('button', { name: 'Repair selected consoles' }).isDisabled()) {
          throw new Error(`${viewport.name}/${motion}: Philia repair controls are not usable: ${JSON.stringify(measurement)}`);
        }
        const returnLink = page.getByRole('link', { name: 'Back to Dione Engineer console' });
        await returnLink.waitFor({ state: 'visible', timeout: 5_000 });
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}.png`), fullPage: false,
        });
        console.log(`Philia render passed: ${viewport.name} ${viewport.width}x${viewport.height}, motion=${motion}`);
        if (viewport.name === 'phone' && motion === 'full') {
          await returnLink.click();
          await page.waitForURL(/\/ships\/dione\/roles\/dione-engineer$/);
          console.log('Philia return navigation passed: Dione Engineer role workspace.');
        }
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    if (vite.exitCode === null) vite.kill('SIGTERM');
  }
}

await main();
