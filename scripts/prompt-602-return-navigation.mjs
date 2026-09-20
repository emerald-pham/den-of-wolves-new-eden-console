#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(process.env.PROMPT_602_EVIDENCE_DIR ?? '/tmp/prompt-602-return-navigation');
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
const CORE_ROLES = [
  'admiral', 'executive-officer', 'wing-commander',
  'dione-captain', 'dione-engineer', 'dione-president',
  'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
  'quellon-captain', 'quellon-engineer', 'quellon-explorer',
  'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
];
const UNION_ROLES = [
  'admiral', 'wing-commander', 'dione-captain', 'dione-president',
  'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist',
  'quellon-captain', 'quellon-explorer', 'refinery-124-captain',
  'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
  'joint-engineering-shepherd-icebreaker',
];

const ROUTES = [
  { slug: 'roles', path: '/roles', label: 'Leave session', expectedPath: '/', sessionExit: true },
  { slug: 'brief', path: '/brief', label: 'Back to roles', expectedPath: '/roles', brief: true, assignedRoleId: 'admiral' },
  { slug: 'escape', path: '/escape', label: 'Leave session', expectedPath: '/', sessionExit: true, escape: true },
  { slug: 'gm', path: '/gm', label: 'Back to role selection', expectedPath: '/console', gm: true },
  { slug: 'fleet', path: '/console', label: 'Back to roles', expectedPath: '/roles' },
  { slug: 'press', path: '/press', label: 'Back to Independent Stations', expectedPath: '/console', mode: 'press' },
  { slug: 'shuttle', path: '/shuttles/wobbly', label: 'Back to Joint Engineering Union', expectedPath: '/union/roles/joint-engineering-quellon-refinery', activeRoleId: 'joint-engineering-quellon-refinery', roles: UNION_ROLES },
  { slug: 'ship-roles', path: '/ships/aegis/roles', label: 'Back to fleet', expectedPath: '/console', activeRoleId: 'admiral' },
  { slug: 'ship-role', path: '/ships/aegis/roles/admiral', label: 'View ship consoles', expectedPath: '/ships/aegis/roles', activeRoleId: 'admiral' },
  { slug: 'ship-observer', path: '/ships/aegis/observer', label: 'Change role', expectedPath: '/ships/aegis/roles', gm: true },
  { slug: 'ship-root', path: '/ships/aegis', label: 'Leave ship', expectedPath: '/console', gm: true },
  { slug: 'union', path: '/union/roles/joint-engineering-quellon-refinery', label: 'Back to role selection', expectedPath: '/console', activeRoleId: 'joint-engineering-quellon-refinery', roles: UNION_ROLES },
  { slug: 'not-found', path: '/missing-console', label: 'Back to the console', expectedPath: '/', noSession: true },
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

function persistedState(route, timestamp) {
  if (route.noSession) return null;
  const session = {
    id: 'prompt-602-navigation', name: 'Return navigation review', joinCode: '6020',
    phase: 'lobby', ownerUid: route.gm ? 'prompt-602-gm' : 'prompt-602-player',
    createdAt: new Date(timestamp).toISOString(), updatedAt: new Date(timestamp).toISOString(),
    currentTurn: 0, activeRoleIds: route.roles ?? CORE_ROLES,
    capybaraEnabled: true, dioneEnabled: true, pressEnabled: true, pressClaimed: true,
  };
  const me = {
    uid: route.gm ? 'prompt-602-gm' : 'prompt-602-player', sessionId: session.id,
    displayName: route.gm ? 'Facilitator' : 'Navigator', role: route.gm ? 'gm' : 'player',
    seatId: null, joinedAt: new Date(timestamp).toISOString(),
    ...(route.activeRoleId ? { activeConsoleRoleId: route.activeRoleId } : {}),
    ...(route.assignedRoleId ? { assignedRoleId: route.assignedRoleId } : {}),
    ...(route.escape ? {
      escapeState: {
        status: 'pending', shipId: 'aegis', destructionEventId: 'prompt-602-destruction', revision: 1,
      },
    } : {}),
  };
  const gmInstance = route.gm ? {
    id: 'prompt-602-gm-console', sessionId: session.id, uid: me.uid, name: 'CIC console',
    deviceLabel: 'Browser proof', claimedAt: new Date(timestamp).toISOString(), responsibilities: [],
  } : null;
  return JSON.stringify({
    state: {
      session, me, gmInstance, gmAccessAuthenticatedAt: route.gm ? timestamp : null,
      pendingCommands: [], mode: route.mode ?? 'console', lastRoute: route.path,
    },
    version: 1,
  });
}

async function activateRoute(page, appUrl, route) {
  await page.goto(`${appUrl}/#${route.brief ? '/roles' : route.path}`, { waitUntil: 'domcontentloaded' });
  if (!route.brief) return;
  await page.getByRole('heading', { name: 'Connect this device' }).waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    useSessionStore.getState().setRoleBrief({
      assignmentUid: 'prompt-602-player', roleId: 'admiral', roleName: 'Admiral',
      vesselName: 'AEGIS', text: 'Coordinate the fleet.',
      commonRules: 'Keep this brief private.', ownedCraftIds: [], setupRevision: 1,
    });
    window.location.hash = '#/brief';
  });
}

async function inspectRoute(page, viewport, route) {
  const escapedLabel = route.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const accessibleName = new RegExp(`^${escapedLabel}$`, 'i');
  const control = page.locator('a, button').filter({ hasText: accessibleName }).first();
  await control.waitFor({ state: 'visible', timeout: 12_000 });
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  const measurement = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const centerY = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      tag: element.tagName,
      focused: document.activeElement === element,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      fontFamily: getComputedStyle(element).fontFamily,
      tabIndex: element.tabIndex,
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      hitTarget: hit === element || element.contains(hit),
    };
  });
  if (!['A', 'BUTTON'].includes(measurement.tag) || !measurement.focused || measurement.tabIndex < 0) {
    throw new Error(`${route.slug}: return control is not keyboard focusable: ${JSON.stringify(measurement)}`);
  }
  if (measurement.rect.height < 44 || measurement.rect.width < 44) {
    throw new Error(`${route.slug}: return control is smaller than 44px: ${JSON.stringify(measurement.rect)}`);
  }
  if (measurement.scrollWidth > viewport.width + 1 || measurement.rect.left < -1
      || measurement.rect.right > viewport.width + 1 || !measurement.hitTarget) {
    throw new Error(`${route.slug}: return control is clipped, overlapped, or causes overflow: ${JSON.stringify(measurement)}`);
  }
  if (!/Oxanium|Share Tech Mono|monospace/i.test(measurement.fontFamily)) {
    throw new Error(`${route.slug}: return control lost the console font: ${measurement.fontFamily}`);
  }
  return { control, measurement };
}

async function sessionIdentity(page) {
  return page.evaluate(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    return { sessionId: state.session?.id ?? null, playerUid: state.me?.uid ?? null };
  });
}

async function activateReturn(page, route, control) {
  if (route.sessionExit) {
    await control.press('Enter');
    const confirm = page.getByRole('button', { name: 'ARE YOU SURE?', exact: true });
    await confirm.waitFor({ state: 'visible' });
    const armed = await confirm.evaluate((element) => ({
      color: element.style.color,
      borderColor: element.style.borderColor,
    }));
    if (armed.color !== 'var(--cic-danger)' || armed.borderColor !== 'var(--cic-danger)') {
      throw new Error(`${route.slug}: session release did not enter the danger confirmation state.`);
    }
    const retained = await sessionIdentity(page);
    if (retained.sessionId !== 'prompt-602-navigation' || retained.playerUid === null) {
      throw new Error(`${route.slug}: first exit activation released identity: ${JSON.stringify(retained)}`);
    }
    await confirm.press('Enter');
  } else {
    await control.press('Enter');
  }

  await page.waitForFunction(
    (expectedPath) => window.location.hash === `#${expectedPath}`,
    route.expectedPath,
    { timeout: 12_000 },
  );
  const identity = await sessionIdentity(page);
  if (route.sessionExit) {
    if (identity.sessionId !== null || identity.playerUid !== null) {
      throw new Error(`${route.slug}: confirmed session release retained identity: ${JSON.stringify(identity)}`);
    }
  } else if (!route.noSession && identity.sessionId !== 'prompt-602-navigation') {
    throw new Error(`${route.slug}: logical return released or replaced the live session.`);
  }
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
      for (const route of ROUTES) {
        const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
        const timestamp = Date.now();
        const state = persistedState(route, timestamp);
        await context.addInitScript(({ persisted, now }) => {
          localStorage.clear();
          sessionStorage.clear();
          if (persisted) localStorage.setItem('dow-new-eden-session', persisted);
          localStorage.setItem('dow-new-eden-session-waiver', String(now));
          localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: now, choice: 'full' }));
        }, { persisted: state, now: timestamp });
        const page = await context.newPage();
        await activateRoute(page, appUrl, route);
        const { control, measurement } = await inspectRoute(page, viewport, route);
        await page.screenshot({
          path: resolve(OUTPUT_DIR, `${route.slug}-${viewport.width}x${viewport.height}.png`),
          fullPage: false,
        });
        await activateReturn(page, route, control);
        console.log(`Prompt 602 return proof passed: ${route.slug}/${viewport.width}x${viewport.height} ${measurement.tag}`);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
  }
}

await main();
