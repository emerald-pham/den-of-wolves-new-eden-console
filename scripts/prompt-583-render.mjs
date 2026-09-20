#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_583_EVIDENCE_DIR ?? '/tmp/prompt-583-render');
const EXPECTED_COPY = 'Capybara balance // Consider +6 Wolf damage capacity per attack. '
  + 'The facilitator chooses the adjustment; this reminder does not change attacks.';
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
const ACTIVE_ROLE_IDS = [
  'admiral', 'executive-officer', 'wing-commander',
  'dione-captain', 'dione-president',
  'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
  'quellon-captain', 'quellon-engineer', 'quellon-explorer',
  'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
  'capybara-captain', 'capybara-recycler',
];

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
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function persistedState(now) {
  const session = {
    id: 'prompt-583-render',
    name: 'Capybara balance review',
    joinCode: '5830',
    phase: 'lobby',
    ownerUid: 'prompt-583-gm',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    currentTurn: 0,
    activeRoleIds: ACTIVE_ROLE_IDS,
    expansion: 'capybara',
    capybaraEnabled: true,
    pressEnabled: true,
    pressClaimed: true,
  };
  const me = {
    uid: 'prompt-583-gm',
    sessionId: session.id,
    displayName: 'Facilitator',
    role: 'gm',
    seatId: null,
    joinedAt: new Date(now).toISOString(),
  };
  const gmInstance = {
    id: 'prompt-583-console',
    sessionId: session.id,
    uid: me.uid,
    name: 'CIC console',
    deviceLabel: 'Browser proof',
    claimedAt: new Date(now).toISOString(),
    responsibilities: [],
  };
  return JSON.stringify({
    state: {
      session,
      me,
      gmInstance,
      gmAccessAuthenticatedAt: now,
      pendingCommands: [],
      mode: 'console',
      lastRoute: '/gm',
    },
    version: 1,
  });
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: 'ignore',
  });
  let browser;
  try {
    await waitForHttp(appUrl);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const now = Date.now();
      await context.addInitScript(({ state, timestamp }) => {
        localStorage.setItem('dow-new-eden-session', state);
        localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
        localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
          acknowledgedAt: timestamp,
          choice: 'full',
        }));
      }, { state: persistedState(now), timestamp: now });
      const page = await context.newPage();
      await page.goto(`${appUrl}/#/gm`, { waitUntil: 'domcontentloaded' });
      const guidance = page.getByText('Capybara balance', { exact: false }).filter({ hasText: '+6' });
      await guidance.waitFor({ state: 'visible', timeout: 12_000 });
      await guidance.scrollIntoViewIfNeeded();
      const measurement = await guidance.evaluate((element, expectedCopy) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          copy: element.textContent?.replace(/\s+/g, ' ').trim(),
          expectedCopy,
          fontFamily: style.fontFamily,
          fontSize: Number.parseFloat(style.fontSize),
          rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
          viewport: { width: innerWidth, height: innerHeight },
          bodyScrollWidth: document.documentElement.scrollWidth,
        };
      }, EXPECTED_COPY);
      if (measurement.copy !== EXPECTED_COPY) {
        throw new Error(`${viewport.name}: guidance copy mismatch: ${measurement.copy}`);
      }
      if (!/Oxanium|Share Tech Mono|monospace/i.test(measurement.fontFamily)) {
        throw new Error(`${viewport.name}: guidance lost the console font: ${measurement.fontFamily}`);
      }
      if (measurement.fontSize < 14) {
        throw new Error(`${viewport.name}: guidance is smaller than 14px: ${measurement.fontSize}`);
      }
      if (measurement.bodyScrollWidth > viewport.width + 1 || measurement.rect.left < -1
          || measurement.rect.right > viewport.width + 1) {
        throw new Error(`${viewport.name}: guidance causes horizontal overflow: ${JSON.stringify(measurement)}`);
      }
      await page.screenshot({
        path: resolve(OUTPUT_DIR, `capybara-balance-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
      console.log(`Prompt 583 rendered proof passed: ${viewport.name} ${viewport.width}x${viewport.height} ${measurement.fontFamily}`);
      await context.close();
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();
