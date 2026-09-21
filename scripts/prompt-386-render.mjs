#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_386_EVIDENCE_DIR ?? '/tmp/prompt-386-render');
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
    id: 'prompt-386-render',
    name: 'Service shuttle recharge proof',
    joinCode: '3860',
    phase: 'active',
    ownerUid: 'prompt-386-player',
    createdAt: timestamp,
    updatedAt: timestamp,
    currentTurn: 2,
    activeRoleIds: ['quellon-engineer'],
    activeVesselIds: ['quellon'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: timestamp,
      openAirspaceEndsAt: new Date(now + 900_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'condor', shipId: 'quellon', dockedAt: timestamp }],
    shuttleFuelled: { condor: true },
    shuttleControl: {
      condor: {
        shuttleId: 'condor', ownerRoleId: 'quellon-engineer',
        ownerUid: 'prompt-386-player', holderUid: 'prompt-386-player', revision: 4,
      },
    },
    maintenanceCycles: {
      quellon: {
        step: 0, revision: 9, turn: 2,
        results: { '7': 'Maintenance cycle complete.' },
        charges: ['jump-drive'], refuelled: ['condor'], completedAt: timestamp,
      },
    },
    shipDamage: { quellon: { damagedSystemIds: ['water-production'], destroyed: false } },
    serviceShuttleRecharges: {},
  };
  const me = {
    uid: 'prompt-386-player',
    sessionId: session.id,
    displayName: 'Quellon Engineer',
    role: 'player',
    seatId: null,
    assignedRoleId: 'quellon-engineer',
    activeConsoleRoleId: 'quellon-engineer',
    fleetGroupId: 'fleet-1',
    joinedAt: timestamp,
  };
  return JSON.stringify({
    state: {
      session,
      me,
      gmInstance: null,
      gmAccessAuthenticatedAt: null,
      pendingCommands: [],
      mode: 'console',
      lastRoute: '/shuttles/condor',
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
      await page.goto(`${appUrl}/#/shuttles/condor`, { waitUntil: 'domcontentloaded' });
      const panel = page.getByRole('region', { name: 'Service shuttle recharge' });
      await panel.waitFor({ state: 'visible', timeout: 12_000 });
      await panel.scrollIntoViewIfNeeded();
      const measurement = await panel.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const select = element.querySelector('select');
        const button = element.querySelector('button');
        const selectRect = select?.getBoundingClientRect();
        const buttonRect = button?.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          fontFamily: style.fontFamily,
          bodyScrollWidth: document.documentElement.scrollWidth,
          viewport: { width: innerWidth, height: innerHeight },
          panel: { left: rect.left, right: rect.right, width: rect.width },
          select: selectRect && { width: selectRect.width, height: selectRect.height },
          button: buttonRect && { width: buttonRect.width, height: buttonRect.height },
          options: [...(select?.options ?? [])].map((option) => option.text),
          buttonLabel: button?.textContent?.trim(),
        };
      });
      if (!/Oxanium|Share Tech Mono|monospace/i.test(measurement.fontFamily)) {
        throw new Error(`${viewport.name}: service panel lost the console font: ${measurement.fontFamily}`);
      }
      if (measurement.bodyScrollWidth > viewport.width + 1 || measurement.panel.left < -1
          || measurement.panel.right > viewport.width + 1) {
        throw new Error(`${viewport.name}: service panel overflows: ${JSON.stringify(measurement)}`);
      }
      if (!measurement.select || !measurement.button ||
          measurement.select.height < 44 || measurement.button.height < 44) {
        throw new Error(`${viewport.name}: recharge controls miss the 44px touch target: ${JSON.stringify(measurement)}`);
      }
      if (measurement.buttonLabel !== 'Recharge console' ||
          !measurement.options.includes('Hydroponics') ||
          measurement.options.includes('Jump Drive') ||
          measurement.options.includes('Water Production')) {
        throw new Error(`${viewport.name}: eligible console filtering is incorrect: ${JSON.stringify(measurement)}`);
      }
      await page.screenshot({
        path: resolve(OUTPUT_DIR, `service-recharge-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
      console.log(`Prompt 386 rendered proof passed: ${viewport.name} ${viewport.width}x${viewport.height} ${measurement.fontFamily}`);
      await context.close();
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();
