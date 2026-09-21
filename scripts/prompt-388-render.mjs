#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_388_EVIDENCE_DIR ?? '/tmp/prompt-388-render');
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
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
  const timestamp = new Date(now).toISOString();
  const session = {
    id: 'prompt-388-render', name: 'Highwall mining proof', joinCode: '3880',
    phase: 'active', ownerUid: 'prompt-388-player', createdAt: timestamp, updatedAt: timestamp,
    currentTurn: 2, activeRoleIds: ['icebreaker-miner'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 2, teamPhaseEndsAt: timestamp,
      openAirspaceEndsAt: new Date(now + 900_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: timestamp }],
    shuttleFuelled: { highwall: true },
    shuttleControl: { highwall: {
      shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner',
      ownerUid: 'prompt-388-player', holderUid: 'prompt-388-player', revision: 4,
    } },
    shuttleCargo: { highwall: { ore: 10, materials: 4 } },
    highwallMining: {
      cycle: 2, revision: 2,
      operations: [
        { requestId: 'materials-1', resource: 'materials', rolls: [4], amount: 4 },
        { requestId: 'ore-1', resource: 'ore', rolls: [2, 3, 5], amount: 10 },
      ],
    },
  };
  const me = {
    uid: 'prompt-388-player', sessionId: session.id, displayName: 'Icebreaker Miner',
    role: 'player', seatId: null, assignedRoleId: 'icebreaker-miner',
    activeConsoleRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1', joinedAt: timestamp,
  };
  return JSON.stringify({
    state: { session, me, gmInstance: null, gmAccessAuthenticatedAt: null,
      pendingCommands: [], mode: 'console', lastRoute: '/shuttles/highwall' },
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
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const now = Date.now();
      await context.addInitScript(({ state, timestamp }) => {
        localStorage.setItem('dow-new-eden-session', state);
        localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
        localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
          acknowledgedAt: timestamp, choice: 'full',
        }));
      }, { state: persistedState(now), timestamp: now });
      const page = await context.newPage();
      await page.goto(`${appUrl}/#/shuttles/highwall`, { waitUntil: 'domcontentloaded' });
      const panel = page.getByRole('region', { name: 'Highwall mining operations' });
      await panel.waitFor({ state: 'visible', timeout: 12_000 });
      await panel.scrollIntoViewIfNeeded();
      const measurement = await panel.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const buttons = [...element.querySelectorAll('button')].map((button) => {
          const buttonRect = button.getBoundingClientRect();
          return { label: button.textContent?.trim(), width: buttonRect.width, height: buttonRect.height };
        });
        return {
          fontFamily: getComputedStyle(element).fontFamily,
          bodyScrollWidth: document.documentElement.scrollWidth,
          viewport: { width: innerWidth, height: innerHeight },
          panel: { left: rect.left, right: rect.right, width: rect.width },
          buttons,
          text: element.textContent,
        };
      });
      if (!/Oxanium|Share Tech Mono|monospace/i.test(measurement.fontFamily)) {
        throw new Error(`${viewport.name}: Highwall panel lost the console font: ${measurement.fontFamily}`);
      }
      if (measurement.bodyScrollWidth > viewport.width + 1 || measurement.panel.left < -1 ||
          measurement.panel.right > viewport.width + 1) {
        throw new Error(`${viewport.name}: Highwall panel overflows: ${JSON.stringify(measurement)}`);
      }
      if (measurement.buttons.length !== 2 || measurement.buttons.some((button) => button.height < 44)) {
        throw new Error(`${viewport.name}: mining controls miss the 44px touch target: ${JSON.stringify(measurement)}`);
      }
      if (!measurement.text?.includes('Operations remaining // 1 of 3') ||
          !measurement.text.includes('Operation 2 // 2 + 3 + 5 = 10 ore') ||
          !measurement.buttons.some((button) => button.label === 'Roll 1d6 materials') ||
          !measurement.buttons.some((button) => button.label === 'Roll 3d6 strytium ore')) {
        throw new Error(`${viewport.name}: Highwall operation contract is incomplete: ${JSON.stringify(measurement)}`);
      }
      await page.screenshot({
        path: resolve(OUTPUT_DIR, `highwall-mining-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
      console.log(`Prompt 388 rendered proof passed: ${viewport.name} ${viewport.width}x${viewport.height} ${measurement.fontFamily}`);
      await context.close();
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();
