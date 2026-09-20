#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_591_EVIDENCE_DIR ?? '/tmp/prompt-591-render');
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
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function persistedState(now) {
  const session = {
    id: 'prompt-591-render', name: 'Maintenance reference review', joinCode: '5910',
    phase: 'active', ownerUid: 'prompt-591-player', configurationLocked: true,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    currentTurn: 1, activeRoleIds: ['admiral'], activeVesselIds: ['aegis'],
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 1_200_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 } },
    shipSurvivors: { aegis: 2_500 }, shipUnrest: { aegis: 0 },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipUpgrades: { aegis: [] }, shipGalacticCoordinates: { aegis: '0000' },
    maintenanceCycles: { aegis: { step: 2, revision: 2, results: { '1': 'Storage intact.' }, charges: [], refuelled: [], turn: 1 } },
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }],
    shuttleFuelled: { starlight: true },
  };
  const me = {
    uid: 'prompt-591-player', sessionId: session.id, displayName: 'Admiral', role: 'player',
    assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', seatId: 'admiral',
    joinedAt: new Date(now).toISOString(),
  };
  return JSON.stringify({
    state: { session, me, gmInstance: null, pendingCommands: [], mode: 'console', lastRoute: '/ships/aegis/roles/admiral' },
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
        localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: timestamp, choice: 'full' }));
      }, { state: persistedState(now), timestamp: now });
      const page = await context.newPage();
      await page.goto(`${appUrl}/#/ships/aegis/roles/admiral`, { waitUntil: 'domcontentloaded' });
      const reference = page.getByRole('complementary', { name: 'AEGIS maintenance reference' });
      await reference.waitFor({ state: 'visible', timeout: 12_000 });
      await reference.scrollIntoViewIfNeeded();
      const measurement = await reference.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const heading = element.querySelector('h4');
        const detail = element.querySelector('dd');
        return {
          copy: element.textContent?.replace(/\s+/g, ' ').trim(),
          headingFont: heading ? getComputedStyle(heading).fontFamily : '',
          detailFont: detail ? getComputedStyle(detail).fontFamily : '',
          rect: { left: rect.left, right: rect.right },
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
        };
      });
      if (!/Sequence.*1 Storage.*7 Shuttle Bay Omega/i.test(measurement.copy ?? '') ||
          !/Rations.*Food 0 \/ 3 \/ 5 \/ 8.*Water 0 \/ 2 \/ 3 \/ 6/i.test(measurement.copy ?? '') ||
          !/Fuel expiry.*Shuttle fuel.*next cycle/i.test(measurement.copy ?? '')) {
        throw new Error(`${viewport.name}: maintenance reference copy is incomplete: ${measurement.copy}`);
      }
      if (!/Oxanium|Share Tech Mono|monospace/i.test(measurement.headingFont) ||
          !/Oxanium|Share Tech Mono|monospace/i.test(measurement.detailFont)) {
        throw new Error(`${viewport.name}: maintenance reference lost console fonts: ${JSON.stringify(measurement)}`);
      }
      if (measurement.scrollWidth > viewport.width + 1 || measurement.rect.left < -1 || measurement.rect.right > viewport.width + 1) {
        throw new Error(`${viewport.name}: maintenance reference overflows: ${JSON.stringify(measurement)}`);
      }
      await page.screenshot({
        path: resolve(OUTPUT_DIR, `maintenance-reference-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
      });
      console.log(`Prompt 591 rendered proof passed: ${viewport.name} ${viewport.width}x${viewport.height}`);
      await context.close();
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();
