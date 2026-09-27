#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_620_EVIDENCE_DIR ?? '/tmp/prompt-620-maliades-render');
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
    id: 'prompt-620-maliades-render', name: 'Maliades repair render review', joinCode: '6200',
    phase: 'active', ownerUid: 'prompt-620-engineer', createdAt: timestamp, updatedAt: timestamp,
    configurationLocked: true, currentTurn: 2,
    activeRoleIds: ['dione-engineer', 'dione-president'],
    activeVesselIds: ['dione'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 1_200_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { maliades: {
      shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'prompt-620-engineer',
      holderUid: 'prompt-620-engineer', revision: 2,
    } },
    shuttleDockings: [{ shuttleId: 'maliades', shipId: 'dione', dockedAt: timestamp }],
    shuttleFuelled: { maliades: true },
    maliadesState: {
      revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true,
      damage: 1, destroyed: false, medium: null, short: null,
    },
    shipDamage: {
      dione: { damagedSystemIds: [], destroyed: false },
    },
    shipResources: {
      dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 3, securityTeams: 2 },
    },
  };
  const me = {
    uid: 'prompt-620-engineer', sessionId: session.id, displayName: 'Dione Engineer',
    role: 'player', seatId: null, assignedRoleId: 'dione-engineer',
    activeConsoleRoleId: 'dione-engineer', fleetGroupId: 'fleet-1', joinedAt: timestamp,
  };
  return JSON.stringify({
    state: { session, me, gmInstance: null, gmAccessAuthenticatedAt: null,
      pendingCommands: [], mode: 'console', lastRoute: '/shuttles/maliades' },
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
        await page.goto(`${appUrl}/#/shuttles/maliades`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
          const { useSessionStore } = await import('/src/store/useSessionStore.ts');
          useSessionStore.getState().setConnection('live');
          useSessionStore.getState().setSessionSnapshotFreshness('server');
        });
        const panel = page.getByRole('region', { name: 'Maliades operations' });
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
          throw new Error(`${viewport.name}/${motion}: Maliades panel font check failed: ${JSON.stringify(measurement)}`);
        }
        if (measurement.scrollWidth > viewport.width + 1 || measurement.panel.left < -1 ||
            measurement.panel.right > viewport.width + 1) {
          throw new Error(`${viewport.name}/${motion}: Maliades panel overflowed: ${JSON.stringify(measurement)}`);
        }
        if (!measurement.button || measurement.button.height < 44) {
          throw new Error(`${viewport.name}/${motion}: Maliades repair controls are not usable: ${JSON.stringify(measurement)}`);
        }
        const returnLabel = await page.locator('.ship-console__back').allTextContents();
        const returnLink = page.getByRole('link', { name: /Back to .*Engineer console/i });
        if (await returnLink.count() === 0) {
          throw new Error(`${viewport.name}/${motion}: no visible Engineer return link: ${JSON.stringify(returnLabel)}`);
        }
        await returnLink.first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}.png`), fullPage: false,
        });
        console.log(`Maliades render passed: ${viewport.name} ${viewport.width}x${viewport.height}, motion=${motion}, font=${measurement.fontFamily}`);
        if (viewport.name === 'phone' && motion === 'full') {
          await returnLink.first().click();
          await page.waitForURL(/\/ships\/dione\/roles\/dione-engineer$/);
          console.log('Maliades return navigation passed: Engineer role workspace.');
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
