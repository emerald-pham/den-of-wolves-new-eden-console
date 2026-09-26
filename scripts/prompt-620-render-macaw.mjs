#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_620_EVIDENCE_DIR ?? '/tmp/prompt-620-macaw-render');
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

async function waitForHttp(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function persistedState(now) {
  const timestamp = new Date(now).toISOString();
  const session = {
    id: 'prompt-620-macaw-render', name: 'Macaw repair render review', joinCode: '6200',
    phase: 'active', ownerUid: 'prompt-620-captain', createdAt: timestamp, updatedAt: timestamp,
    configurationLocked: true, currentTurn: 3,
    activeRoleIds: ['capybara-captain', 'capybara-recycler'],
    activeVesselIds: ['capybara', 'aegis'], expansion: 'capybara', capybaraEnabled: true,
    turnPhase: {
      turn: 3, teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 1_200_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleControl: { macaw: {
      shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'prompt-620-captain',
      holderUid: 'prompt-620-captain', revision: 2,
    } },
    shuttleDockings: [{ shuttleId: 'macaw', shipId: 'capybara', dockedAt: timestamp }],
    shuttleFuelled: { macaw: true },
    shipDamage: {
      capybara: { damagedSystemIds: ['reactor', 'storage'], destroyed: false },
      aegis: { damagedSystemIds: ['reactor'], destroyed: false },
    },
    shipResources: {
      capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
    },
  };
  const me = {
    uid: 'prompt-620-captain', sessionId: session.id, displayName: 'Capybara Captain',
    role: 'player', seatId: null, assignedRoleId: 'capybara-captain',
    activeConsoleRoleId: 'capybara-captain', fleetGroupId: 'fleet-1', joinedAt: timestamp,
  };
  return JSON.stringify({
    state: { session, me, gmInstance: null, gmAccessAuthenticatedAt: null,
      pendingCommands: [], mode: 'console', lastRoute: '/shuttles/macaw' },
    version: 1,
  });
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT, env: { ...process.env, BROWSER: 'none' }, stdio: 'ignore',
  });
  let browser;
  try {
    await waitForHttp(appUrl);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const viewport of VIEWPORTS) {
      for (const motion of MOTION_MODES) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block' });
        const now = Date.now();
        const state = persistedState(now);
        await context.addInitScript(({ stored, timestamp, motionChoice }) => {
          localStorage.setItem('dow-new-eden-session', stored);
          localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
          localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
            acknowledgedAt: timestamp, choice: motionChoice,
          }));
          localStorage.setItem('new-eden-motion-override', motionChoice === 'reduce' ? 'reduce' : 'full');
        }, { stored: state, timestamp: now, motionChoice: motion });
        const page = await context.newPage();
        await page.emulateMedia({ reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
        await page.goto(`${appUrl}/#/shuttles/macaw`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
          const { useSessionStore } = await import('/src/store/useSessionStore.ts');
          useSessionStore.getState().setConnection('live');
          useSessionStore.getState().setSessionSnapshotFreshness('server');
        });
        const panel = page.getByRole('region', { name: 'Macaw console repair' });
        await panel.waitFor({ state: 'visible', timeout: 12_000 });
        await page.evaluate(() => document.fonts.ready);
        await panel.scrollIntoViewIfNeeded();
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
            fontFamily,
            expectedFontFamily,
            fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
            monospaceGlyphDelta: Math.abs(narrowGlyphWidth - wideGlyphWidth),
            scrollWidth: document.documentElement.scrollWidth,
            viewport: { width: innerWidth, height: innerHeight },
            panel: { left: rect.left, right: rect.right },
            button: buttonRect ? { height: buttonRect.height, text: button?.textContent?.trim() } : null,
            checkboxes: element.querySelectorAll('input[type="checkbox"]').length,
          };
        });
        const normalizeFontStack = (value) => value
          .replace(/[\"']/g, '').replace(/\s+/g, ' ').trim();
        if (normalizeFontStack(measurement.fontFamily) !== normalizeFontStack(measurement.expectedFontFamily) ||
            !/monospace/i.test(measurement.fontFamily) || measurement.monospaceGlyphDelta > 0.5 ||
            measurement.fontSize < 14) {
          throw new Error(`${viewport.name}/${motion}: Macaw panel font check failed: ${JSON.stringify(measurement)}`);
        }
        if (measurement.scrollWidth > viewport.width + 1 || measurement.panel.left < -1 ||
            measurement.panel.right > viewport.width + 1) {
          throw new Error(`${viewport.name}/${motion}: Macaw panel overflowed: ${JSON.stringify(measurement)}`);
        }
        if (!measurement.button || measurement.button.height < 44 || measurement.checkboxes < 1) {
          throw new Error(`${viewport.name}/${motion}: Macaw repair controls are not usable: ${JSON.stringify(measurement)}`);
        }
        const returnLabel = await page.locator('.ship-console__back').allTextContents();
        const returnLink = page.getByRole('link', { name: /Back to .*Captain console/i });
        if (await returnLink.count() === 0) {
          throw new Error(`${viewport.name}/${motion}: no visible Captain return link: ${JSON.stringify(returnLabel)}`);
        }
        await returnLink.first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}.png`), fullPage: false,
        });
        console.log(`Macaw render passed: ${viewport.name} ${viewport.width}x${viewport.height}, motion=${motion}, font=${measurement.fontFamily}`);
        if (viewport.name === 'phone' && motion === 'full') {
          await returnLink.first().click();
          await page.waitForURL(/\/ships\/capybara\/roles\/capybara-captain$/);
          console.log('Macaw return navigation passed: Captain role workspace.');
        }
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();
