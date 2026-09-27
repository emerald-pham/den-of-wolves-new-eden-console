#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_620_BLACKSMITH_EVIDENCE_DIR ?? '/tmp/prompt-620-blacksmith-render');
const VIEWPORTS = [
  { name: 'narrow-phone', width: 320, height: 844 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'short-landscape', width: 844, height: 390 },
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
    id: 'prompt-620-blacksmith-render', name: 'Blacksmith repair render review', joinCode: '6200',
    phase: 'active', ownerUid: 'prompt-620-blacksmith-holder', createdAt: timestamp, updatedAt: timestamp,
    configurationLocked: true, currentTurn: 3,
    activeRoleIds: ['icebreaker-engineer'],
    activeVesselIds: ['icebreaker', 'aegis'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: new Date(now + 600_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 1_200_000).toISOString(),
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleControl: { blacksmith: {
      shuttleId: 'blacksmith', ownerRoleId: 'icebreaker-engineer',
      ownerUid: 'prompt-620-blacksmith-holder', holderUid: 'prompt-620-blacksmith-holder', revision: 2,
    } },
    shuttleDockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: timestamp }],
    shuttleFuelled: { blacksmith: true },
    shipDamage: {
      icebreaker: { damagedSystemIds: ['reactor', 'storage', 'jump-drive'], destroyed: false },
      aegis: { damagedSystemIds: ['reactor'], destroyed: false },
    },
    shipResources: {
      icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 12, securityTeams: 2 },
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 8, securityTeams: 9 },
    },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['icebreaker', 'aegis'],
      knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [],
    },
  };
  const me = {
    uid: 'prompt-620-blacksmith-holder', sessionId: session.id, displayName: 'Icebreaker Engineer',
    role: 'player', seatId: null, assignedRoleId: 'icebreaker-engineer',
    activeConsoleRoleId: 'icebreaker-engineer', fleetGroupId: 'fleet-1', joinedAt: timestamp,
  };
  return JSON.stringify({
    state: { session, me, gmInstance: null, gmAccessAuthenticatedAt: null,
      pendingCommands: [], mode: 'console', lastRoute: '/shuttles/blacksmith' },
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
      for (const motion of ['full', 'reduce']) {
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
        await page.route('**/resumeSession', async (route) => {
          const request = route.request();
          const cors = {
            'access-control-allow-origin': appUrl,
            'access-control-allow-credentials': 'true',
            vary: 'Origin',
          };
          if (request.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: {
              ...cors, 'access-control-allow-methods': 'POST, OPTIONS',
              'access-control-allow-headers': 'authorization, content-type, x-firebase-appcheck',
            } });
            return;
          }
          const uid = await page.evaluate(async () => {
            const { auth } = await import('/src/lib/firebase.ts');
            return auth().currentUser?.uid;
          });
          if (!uid) throw new Error('The render harness could not identify the anonymous player.');
          const fixture = JSON.parse(stored).state;
          fixture.me.uid = uid;
          fixture.session.shuttleControl.blacksmith.holderUid = uid;
          await route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
            body: JSON.stringify({ result: { session: fixture.session, player: fixture.me } }) });
        });
        let staleCommand;
        let requestCount = 0;
        await page.route('**/repairConsolesFromBlacksmith', async (route) => {
          const request = route.request();
          const cors = {
            'access-control-allow-origin': appUrl,
            'access-control-allow-credentials': 'true',
            vary: 'Origin',
          };
          if (request.method() === 'OPTIONS') {
            await route.fulfill({
              status: 204,
              headers: { ...cors, 'access-control-allow-methods': 'POST, OPTIONS',
                'access-control-allow-headers': 'authorization, content-type, x-firebase-appcheck' },
            });
            return;
          }
          requestCount += 1;
          const body = request.postDataJSON();
          staleCommand = isRecord(body) && isRecord(body.data) ? body.data : body;
          const stale = {
            status: 'stale', sessionId: staleCommand.sessionId,
            requestId: staleCommand.requestId, shuttleId: 'blacksmith',
            expectedHostShipId: staleCommand.expectedHostShipId,
            systemIds: [...staleCommand.systemIds].sort(),
            expectedControlRevision: staleCommand.expectedControlRevision,
            currentControlRevision: staleCommand.expectedControlRevision + 1,
            expectedRepairRevision: staleCommand.expectedRepairRevision,
            currentRepairRevision: staleCommand.expectedRepairRevision,
            expectedCycle: staleCommand.expectedCycle, currentCycle: staleCommand.expectedCycle,
          };
          await route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
            body: JSON.stringify({ result: stale }) });
        });
        await page.goto(`${appUrl}/#/shuttles/blacksmith`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async () => {
          const { useSessionStore } = await import('/src/store/useSessionStore.ts');
          const state = useSessionStore.getState();
          state.setConnection('live');
          state.setSessionSnapshotFreshness('server');
          state.setSession({
            ...state.session,
            playerDiscovery: {
              groupId: 'fleet-1', fleetGroupVesselIds: ['icebreaker', 'aegis'],
              knownCoordinates: [], knownSystems: {}, pursuitDistance: 0, navigationLogs: [],
            },
          });
        });
        const panel = page.getByRole('region', { name: 'Blacksmith console repair' });
        await panel.waitFor({ state: 'visible', timeout: 12_000 });
        await page.evaluate(async () => document.fonts.ready);
        await panel.scrollIntoViewIfNeeded();
        await panel.getByRole('checkbox', { name: 'Reactor' }).check();
        await page.evaluate(async () => {
          const { useSessionStore } = await import('/src/store/useSessionStore.ts');
          useSessionStore.getState().setConnection('live');
          useSessionStore.getState().setSessionSnapshotFreshness('server');
        });
        await panel.getByRole('button', { name: 'Repair selected consoles' }).click();
        await page.waitForTimeout(500);
        await panel.getByText(/waiting for the current live projection before retrying/i)
          .waitFor({ state: 'visible', timeout: 12_000 });
        if (requestCount !== 1 || !staleCommand) {
          throw new Error(`${viewport.name}/${motion}: expected one explicit stale repair request.`);
        }
        if (await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) !==
            (motion === 'reduce')) {
          throw new Error(`${viewport.name}/${motion}: reduced-motion profile did not match its emulated mode.`);
        }
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}-waiting.png`), fullPage: false,
        });
        await page.evaluate(async () => {
          const { useSessionStore } = await import('/src/store/useSessionStore.ts');
          const state = useSessionStore.getState();
          const session = state.session;
          state.setSession({
            ...session,
            shuttleControl: { blacksmith: { ...session.shuttleControl.blacksmith, revision: 3 } },
          });
        });
        const retry = panel.getByRole('button', { name: 'Retry repair with current revisions' });
        await retry.waitFor({ state: 'visible', timeout: 5_000 });
        const measurement = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const button = element.querySelector('button[aria-label],button:last-of-type');
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
            retryHeight: buttonRect?.height ?? 0,
            checkboxCount: element.querySelectorAll('input[type="checkbox"]').length,
          };
        });
        const normalizedFont = (value) => value.replace(/["']/g, '').replace(/\s+/g, ' ').trim();
        if (normalizedFont(measurement.fontFamily) !== normalizedFont(measurement.expectedFontFamily) ||
            !/monospace/i.test(measurement.fontFamily) || measurement.monospaceGlyphDelta > 0.5 ||
            measurement.fontSize < 14) {
          throw new Error(`${viewport.name}/${motion}: Blacksmith font check failed: ${JSON.stringify(measurement)}`);
        }
        if (measurement.scrollWidth > viewport.width + 1 || measurement.panel.left < -1 ||
            measurement.panel.right > viewport.width + 1) {
          throw new Error(`${viewport.name}/${motion}: Blacksmith panel overflowed: ${JSON.stringify(measurement)}`);
        }
        if (measurement.retryHeight < 44 || measurement.checkboxCount < 1 || await retry.isDisabled()) {
          throw new Error(`${viewport.name}/${motion}: Blacksmith retry controls are not usable: ${JSON.stringify(measurement)}`);
        }
        await page.screenshot({ path: resolve(OUTPUT_DIR, `${viewport.name}-${motion}.png`), fullPage: false });
        console.log(`Blacksmith stale recovery render passed: ${viewport.name} ${viewport.width}x${viewport.height}, motion=${motion}`);
        if (viewport.name === 'phone' && motion === 'full') {
          const returnLink = page.getByRole('link', { name: 'Back to Icebreaker Engineer console' });
          await returnLink.waitFor({ state: 'visible', timeout: 5_000 });
          await returnLink.click();
          await page.waitForURL(/\/ships\/icebreaker\/roles\/icebreaker-engineer$/);
          console.log('Blacksmith return navigation passed: Icebreaker Engineer role workspace.');
        }
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    if (vite.exitCode === null) vite.kill('SIGTERM');
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

await main();
