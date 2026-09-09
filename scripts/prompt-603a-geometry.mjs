#!/usr/bin/env node

import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(
  process.env.PROMPT_603A_EVIDENCE_DIR ?? join(ROOT, 'evidence/prompt-603a'),
);
const CHROME = process.env.CHROME_BIN
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = [
  { name: 'portrait-phone', width: 320, height: 844 },
  { name: 'wide-phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
const APP_BASE = 'http://127.0.0.1';
const SESSION_STORAGE_KEY = 'dow-new-eden-session';
const WAIVER_STORAGE_KEY = 'dow-new-eden-session-waiver';
const MOTION_SAFETY_STORAGE_KEY = 'dow-new-eden-motion-safety';
const MOTION_OVERRIDE_STORAGE_KEY = 'new-eden-motion-override';

const wait = (milliseconds) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, milliseconds);
});

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : null;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error('Could not allocate a local port.');
  return port;
}

async function waitForHttp(url, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process may still be starting.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitFor(predicate, description, timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.open = new Promise((resolvePromise, reject) => {
      this.socket.addEventListener('open', resolvePromise, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.open;
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function readPageTarget(debugPort, appUrl) {
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/list`);
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === 'page' && target.url.includes(appUrl))
    ?? targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a page target.');
  return page.webSocketDebuggerUrl;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result?.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text
        ?? 'Browser evaluation failed.',
    );
  }
  return result?.result?.value;
}

function sessionSeed({ activeConsoleRoleId = null, reducedMotion = false } = {}) {
  const now = Date.now();
  const session = {
    id: 'prompt-603a-geometry',
    name: 'VISUAL REVIEW // LONG CIC SESSION TICKET LABEL FOR WRAPPED LAYOUT',
    joinCode: '603A',
    phase: 'lobby',
    ownerUid: 'prompt-603a-player',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    currentTurn: 0,
    capybaraEnabled: true,
    dioneEnabled: true,
  };
  const me = {
    uid: 'prompt-603a-player',
    sessionId: session.id,
    displayName: 'Prompt 603a visual reviewer with a deliberately long browser label',
    role: 'player',
    seatId: null,
    joinedAt: new Date(now).toISOString(),
    ...(activeConsoleRoleId ? { activeConsoleRoleId } : {}),
  };
  const state = {
    session,
    me,
    gmInstance: null,
    gmAccessAuthenticatedAt: null,
    pendingCommands: [],
    mode: 'console',
    lastRoute: activeConsoleRoleId ? '/ships/aegis/roles' : '/roles',
  };
  const motionRecord = JSON.stringify({
    acknowledgedAt: now,
    choice: reducedMotion ? 'reduce' : 'full',
  });
  return `
    localStorage.setItem(${JSON.stringify(SESSION_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify({ state, version: 1 }))});
    localStorage.setItem(${JSON.stringify(WAIVER_STORAGE_KEY)}, ${JSON.stringify(String(now))});
    localStorage.setItem(${JSON.stringify(MOTION_SAFETY_STORAGE_KEY)}, ${JSON.stringify(motionRecord)});
    localStorage.setItem(${JSON.stringify(MOTION_OVERRIDE_STORAGE_KEY)}, ${JSON.stringify(reducedMotion ? 'reduce' : 'full')});
  `;
}

const rectScript = `
  (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      right: Math.round(rect.right * 100) / 100,
      bottom: Math.round(rect.bottom * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    };
  }
`;

async function measurePage(cdp, route) {
  const raw = await evaluate(cdp, `(() => {
    const rect = ${rectScript};
    const header = rect(document.querySelector('.app-header'));
    const ticket = rect(document.querySelector('.session-readouts'));
    const content = rect(
      document.querySelector('.role-select__intro')
      ?? document.querySelector('.ship-role-select .session-mode__panel')
      ?? document.querySelector('.session-mode'),
    );
    const plot = rect(document.querySelector('.ship-plot[data-aboard="true"]'));
    const intersects = (left, right) => Boolean(left && right
      && left.left < right.right && left.right > right.left
      && left.top < right.bottom && left.bottom > right.top);
    const interactive = [...document.querySelectorAll(
      'button, a[href], input:not([type="checkbox"]), textarea, select',
    )]
      .map((element) => ({ element, rect: rect(element) }))
      .filter(({ rect: itemRect }) => itemRect && itemRect.width > 0 && itemRect.height > 0)
      .map(({ element, rect: itemRect }) => ({
        tag: element.tagName.toLowerCase(),
        label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 80),
        rect: itemRect,
      }));
    const targetHeights = interactive.map(({ rect: itemRect }) => itemRect.height);
    const main = document.querySelector('main');
    const sessionName = document.querySelector('.role-select__intro .eyebrow')
      ?? document.querySelector('.ship-role-select__intro .eyebrow');
    const root = document.querySelector('[data-motion]');
    const sessionMode = document.querySelector('.session-mode, .role-select');
    const indicator = document.querySelector('.indicator');
    const rank = document.querySelector('.player-rank');
    return {
      route: ${JSON.stringify(route)},
      header,
      ticket,
      content,
      plot,
      headerContentGap: header && content ? Math.round((content.top - header.bottom) * 100) / 100 : null,
      ticketContentIntersection: intersects(ticket, content),
      plotContentIntersection: intersects(plot, content),
      plotContentVerticalGap: plot && content ? Math.round((content.top - plot.bottom) * 100) / 100 : null,
      appHeaderHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-header-height').trim(),
      sessionPaddingTop: sessionMode ? getComputedStyle(sessionMode).paddingTop : null,
      sessionAlignContent: sessionMode ? getComputedStyle(sessionMode).alignContent : null,
      sessionName: sessionName?.textContent?.trim() ?? null,
      sessionNameLength: sessionName?.textContent?.trim().length ?? 0,
      indicator: indicator?.textContent?.trim() ?? null,
      rank: rank?.textContent?.trim() ?? null,
      motion: root?.getAttribute('data-motion') ?? null,
      shipPlotTransitionDuration: plot ? getComputedStyle(document.querySelector('.ship-plot')).transitionDuration : null,
      scroll: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 0.5,
        mainHeight: main?.getBoundingClientRect().height ?? null,
      },
      interactive: {
        count: interactive.length,
        minimumHeight: targetHeights.length ? Math.min(...targetHeights) : null,
        under44: interactive.filter(({ rect: itemRect }) => itemRect.height < 44).map(({ tag, label, rect: itemRect }) => ({ tag, label, rect: itemRect })),
      },
    };
  })()`);
  return raw;
}

async function navigate(cdp, appUrl, route, seed) {
  await evaluate(cdp, seed);
  await cdp.send('Page.navigate', { url: `${appUrl}/?prompt603a=${Date.now()}#${route}` });
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.app-header') && document.querySelector(${JSON.stringify(route === '/roles' ? '.role-select' : '.ship-role-select')}))`),
    `${route} to render`,
  );
  await wait(350);
}

async function screenshot(cdp, filename) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const path = resolve(OUTPUT_DIR, filename);
  writeFileSync(path, Buffer.from(result.data, 'base64'));
  return path;
}

async function clickSettings(cdp) {
  await evaluate(cdp, "document.querySelector('.settings-button')?.click()");
  await waitFor(
    () => evaluate(cdp, 'Boolean(document.querySelector(".settings-dialog"))'),
    'settings dialog to open',
  );
  await wait(100);
}

async function measureSettings(cdp) {
  return evaluate(cdp, `(() => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        x: Math.round(value.x * 100) / 100,
        y: Math.round(value.y * 100) / 100,
        top: Math.round(value.top * 100) / 100,
        right: Math.round(value.right * 100) / 100,
        bottom: Math.round(value.bottom * 100) / 100,
        width: Math.round(value.width * 100) / 100,
        height: Math.round(value.height * 100) / 100,
      };
    };
    const controls = [...document.querySelectorAll('.settings-dialog button, .settings-dialog input:not([type="checkbox"]), .settings-dialog textarea, .settings-dialog select')]
      .map((element) => rect(element))
      .filter(Boolean);
    return {
      dialog: rect(document.querySelector('.settings-dialog')),
      sessionTicket: rect(document.querySelector('.settings-dialog .session-readouts')),
      controlCount: controls.length,
      minimumControlHeight: controls.length ? Math.min(...controls.map((item) => item.height)) : null,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 0.5,
    };
  })()`);
}

async function measureFocus(cdp) {
  return evaluate(cdp, `(() => {
    const settings = document.querySelector('.settings-button');
    settings?.focus({ preventScroll: true });
    const active = document.activeElement;
    const style = active instanceof HTMLElement ? getComputedStyle(active) : null;
    const rect = active instanceof HTMLElement ? active.getBoundingClientRect() : null;
    return {
      element: active instanceof HTMLElement ? active.className : null,
      focusVisible: active instanceof HTMLElement && active.matches(':focus-visible'),
      outline: style?.outline ?? null,
      outlineWidth: style?.outlineWidth ?? null,
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    };
  })()`);
}

function assertRecord(record) {
  if (!record.header || !record.ticket || !record.content) {
    throw new Error(`Missing shared geometry on ${record.route}.`);
  }
  if (record.headerContentGap === null || record.headerContentGap < 0) {
    throw new Error(`Header overlaps routed content on ${record.route}.`);
  }
  if (record.ticketContentIntersection || record.plotContentIntersection) {
    throw new Error(`Ticket/DRADIS overlaps routed content on ${record.route}.`);
  }
  if (record.scroll.horizontalOverflow) {
    throw new Error(`Horizontal overflow found on ${record.route}.`);
  }
  const isTouchViewport = record.viewport.width <= 600 || record.viewport.height <= 600;
  if (isTouchViewport && record.interactive.under44.length > 0) {
    throw new Error(`Interactive target under 44px found on ${record.route}: ${record.interactive.under44.map((item) => `${item.tag}:${item.label}:${item.rect.height}`).join(', ')}`);
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const appPort = await freePort();
  const debugPort = await freePort();
  const appUrl = `${APP_BASE}:${appPort}`;
  const profileDir = mkdtempSync(join(tmpdir(), 'dow-603a-geometry-'));
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(appPort)], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: 'ignore',
  });
  let chrome;
  let cdp;
  try {
    await waitForHttp(`${appUrl}/`);
    chrome = spawn(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      `${appUrl}/#/roles`,
    ], { stdio: 'ignore' });
    const socketUrl = await readPageTarget(debugPort, appUrl);
    cdp = new CdpSession(socketUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const records = [];
    for (const viewport of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      });
      for (const routeConfig of [
        { route: '/roles', slug: 'roles', roleId: null },
        { route: '/ships/aegis/roles', slug: 'ship-roles', roleId: 'admiral' },
      ]) {
        const recordSeed = sessionSeed({ activeConsoleRoleId: routeConfig.roleId });
        await navigate(cdp, appUrl, routeConfig.route, recordSeed);
        const record = await measurePage(cdp, routeConfig.route);
        record.viewport = viewport;
        record.screenshot = await screenshot(cdp, `${routeConfig.slug}-${viewport.width}x${viewport.height}.png`);
        assertRecord(record);
        records.push(record);
      }
    }

    const variantViewport = { name: 'wide-phone', width: 390, height: 844 };
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: variantViewport.width,
      height: variantViewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: variantViewport.width,
      screenHeight: variantViewport.height,
    });
    await navigate(cdp, appUrl, '/roles', sessionSeed());
    await clickSettings(cdp);
    const settings = await measureSettings(cdp);
    settings.viewport = variantViewport;
    settings.screenshot = await screenshot(cdp, 'roles-settings-390x844.png');
    if (settings.minimumControlHeight < 44) {
      throw new Error('Settings action controls did not retain 44px targets.');
    }
    await evaluate(cdp, "document.querySelector('.settings-dialog__close')?.click()");
    await waitFor(
      () => evaluate(cdp, 'Boolean(!document.querySelector(".settings-dialog"))'),
      'settings dialog to close',
    );
    const focus = await measureFocus(cdp);
    focus.viewport = variantViewport;
    focus.screenshot = await screenshot(cdp, 'roles-focus-390x844.png');

    await navigate(cdp, appUrl, '/roles', sessionSeed({ reducedMotion: true }));
    const reducedMotion = await measurePage(cdp, '/roles');
    reducedMotion.viewport = variantViewport;
    reducedMotion.screenshot = await screenshot(cdp, 'roles-reduced-motion-390x844.png');
    if (reducedMotion.motion !== 'reduce') throw new Error('Reduced-motion seed did not reach the rendered app.');

    const output = {
      prompt: '603a',
      generatedAt: new Date().toISOString(),
      command: 'npm run test:geometry:603a',
      source: 'Chrome DevTools Protocol DOMRect capture against the local Vite build; no mocked layout values.',
      viewports: VIEWPORTS,
      records,
      variants: {
        longLabels: {
          sessionName: records[0].sessionName,
          sessionNameLength: records[0].sessionNameLength,
          horizontalOverflow: records.some((record) => record.scroll.horizontalOverflow),
        },
        settings,
        keyboardFocus: focus,
        reducedMotion,
      },
      assertions: {
        headerBeforeContent: true,
        sessionTicketOutsideRoleContent: true,
        shipDradisOutsideShipRoleContent: true,
        noHorizontalOverflow: true,
        touchViewportInteractiveTargetsAtLeast44px: true,
        settingsControlsAtLeast44px: settings.minimumControlHeight >= 44,
        portraitAndLandscapeCovered: true,
      },
    };
    writeFileSync(resolve(OUTPUT_DIR, 'geometry.json'), `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({
      output: resolve(OUTPUT_DIR, 'geometry.json'),
      screenshots: records.map((record) => record.screenshot).concat([
        settings.screenshot,
        focus.screenshot,
        reducedMotion.screenshot,
      ]),
      viewports: VIEWPORTS.map(({ width, height }) => `${width}x${height}`),
      records: records.length,
      variants: Object.keys(output.variants),
    }, null, 2));
  } finally {
    try {
      if (cdp) {
        await evaluate(cdp, `[
          ${JSON.stringify(SESSION_STORAGE_KEY)},
          ${JSON.stringify(WAIVER_STORAGE_KEY)},
          ${JSON.stringify(MOTION_SAFETY_STORAGE_KEY)},
          ${JSON.stringify(MOTION_OVERRIDE_STORAGE_KEY)},
        ].forEach((key) => localStorage.removeItem(key))`);
        cdp.close();
      }
    } catch {
      // The isolated profile is removed below even if the browser already exited.
    }
    if (chrome && !chrome.killed) chrome.kill('SIGTERM');
    if (vite && !vite.killed) vite.kill('SIGTERM');
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        rmSync(profileDir, { recursive: true, force: true });
        break;
      } catch {
        await wait(100);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
