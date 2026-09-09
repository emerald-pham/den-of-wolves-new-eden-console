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
  {
    name: 'portrait-phone', width: 320, height: 844, connectedPlayers: 1,
    safeArea: { top: 24, right: 10, bottom: 16, left: 10 },
  },
  {
    name: 'wide-phone', width: 390, height: 844, connectedPlayers: 2,
    safeArea: { top: 24, right: 10, bottom: 16, left: 10 },
  },
  {
    name: 'short-landscape', width: 844, height: 390, connectedPlayers: 8,
    safeArea: { top: 10, right: 24, bottom: 10, left: 24 },
  },
  {
    name: 'desktop', width: 1440, height: 900, connectedPlayers: 20,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  },
];
const APP_BASE = 'http://127.0.0.1';
const SESSION_STORAGE_KEY = 'dow-new-eden-session';
const WAIVER_STORAGE_KEY = 'dow-new-eden-session-waiver';
const MOTION_SAFETY_STORAGE_KEY = 'dow-new-eden-motion-safety';
const MOTION_OVERRIDE_STORAGE_KEY = 'new-eden-motion-override';
const CONNECTED_PLAYERS_STORAGE_KEY = 'prompt-603a-connected-players';

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

function sessionSeed({
  activeConsoleRoleId = null,
  reducedMotion = false,
  connectedPlayers = 1,
} = {}) {
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
  const seats = [
    ['admiral', 'AEGIS // Admiral'],
    ['executive-officer', 'AEGIS // Executive Officer'],
    ['wing-commander', 'AEGIS // Wing Commander'],
  ].map(([roleId, label]) => ({
    id: roleId,
    sessionId: session.id,
    roleId,
    label,
    factionId: 'aegis',
    status: 'open',
    holderUid: null,
    claimedAt: null,
  }));
  const state = {
    session,
    me,
    seats,
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
    sessionStorage.setItem(${JSON.stringify(CONNECTED_PLAYERS_STORAGE_KEY)}, ${JSON.stringify(String(connectedPlayers))});
  `;
}

const rectScript = `
  (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      left: Math.round(rect.left * 100) / 100,
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
    const describe = (element, key) => {
      const bounds = rect(element);
      if (!bounds) return null;
      return {
        key,
        tag: element.tagName.toLowerCase(),
        text: (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        rect: bounds,
      };
    };
    const collect = (selector, key) => [...document.querySelectorAll(selector)]
      .map((element, index) => describe(element, key + '[' + (index + 1) + ']'))
      .filter(Boolean);
    const first = (selector, key) => describe(document.querySelector(selector), key);
    const header = first('.app-header', 'header');
    const headerRegions = [
      header,
      first('.session-readouts', 'session-readouts'),
      first('.session-badge', 'session-ticket'),
      first('.personnel-count', 'connected-player-count'),
      first('.fleet-ticker', 'fleet-broadcast'),
      first('.player-rank', 'rank'),
      first('.indicator', 'connection-indicator'),
      first('.settings-button', 'settings'),
    ].filter(Boolean);
    const isShipRoute = ${JSON.stringify(route.startsWith('/ships/'))};
    const routeRegions = isShipRoute
      ? [
          ...collect('.ship-role-select', 'ship-role-select'),
          ...collect('.ship-role-select .session-mode__panel', 'ship-role-panel'),
          ...collect('.ship-role-select__intro', 'ship-role-intro'),
          ...collect('.ship-role-select__flag', 'ship-flag'),
          ...collect('.ship-role-select .session-mode__back', 'ship-back'),
          ...collect('.ship-role-select .role-select__title', 'ship-title'),
          ...collect('.ship-role-select .role-select__grid', 'ship-role-grid'),
          ...collect('.ship-role-select .role-card', 'ship-role-card'),
          ...collect('.ship-role-select .role-card__name', 'ship-role-card-name'),
          ...collect('.ship-role-select .role-card__description', 'ship-role-card-description'),
        ]
      : [
          ...collect('.role-select', 'role-select'),
          ...collect('.role-select__intro', 'role-intro'),
          ...collect('.role-select__title', 'role-title'),
          ...collect('.role-select__lede', 'role-lede'),
          ...collect('.role-seat-board', 'seat-board'),
          ...collect('.role-seat-board__header', 'seat-board-header'),
          ...collect('.role-seat-board__list', 'seat-board-list'),
          ...collect('.role-seat', 'seat'),
          ...collect('.role-seat__identity', 'seat-identity'),
          ...collect('.role-seat__state', 'seat-state'),
          ...collect('.role-seat__action', 'seat-action'),
          ...collect('.role-select__grid', 'role-grid'),
          ...collect('.role-card', 'role-card'),
          ...collect('.role-card__name', 'role-card-name'),
          ...collect('.role-card__description', 'role-card-description'),
          ...collect('.role-claim__button', 'gm-claim-control'),
          ...collect('.role-claim__input', 'gm-name-input'),
          ...collect('.role-controls-lock', 'gm-lock-control'),
        ];
    const content = isShipRoute
      ? first('.ship-role-select .session-mode__panel', 'ship-role-panel')
      : first('.role-select__intro', 'role-intro');
    const plot = first('.ship-plot[data-aboard="true"]', 'ship-plot');
    const intersects = (left, right) => Boolean(left && right
      && left.rect.left < right.rect.right && left.rect.right > right.rect.left
      && left.rect.top < right.rect.bottom && left.rect.bottom > right.rect.top);
    const collisionRegions = routeRegions.filter((region) => (
      !['role-select[1]', 'ship-role-select[1]'].includes(region.key)
    ));
    const intersections = [];
    const collectIntersections = (leftRegions, rightRegions, type) => {
      leftRegions.forEach((left) => rightRegions.forEach((right) => {
        if (intersects(left, right)) intersections.push({ type, left: left.key, right: right.key });
      }));
    };
    collectIntersections(headerRegions, collisionRegions, 'header-route');
    if (plot) collectIntersections([plot], collisionRegions, 'plot-route');
    const interactive = [...document.querySelectorAll(
      'button, a[href], input, textarea, select',
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
    const personnel = document.querySelector('.personnel-count');
    const connectedPlayerCount = personnel
      ? Number((personnel.textContent || '').match(/\\d+/)?.[0] ?? NaN)
      : null;
    const reducedTicker = document.querySelector('.fleet-ticker[data-reduced="true"]');
    const reducedMessage = reducedTicker?.querySelector('.fleet-ticker__message');
    const reducedTickerGeometry = reducedTicker && reducedMessage ? {
      ticker: rect(reducedTicker),
      message: rect(reducedMessage),
      text: reducedMessage.textContent?.trim() ?? '',
      whiteSpace: getComputedStyle(reducedMessage).whiteSpace,
      overflowWrap: getComputedStyle(reducedMessage).overflowWrap,
      clientWidth: reducedTicker.clientWidth,
      scrollWidth: reducedTicker.scrollWidth,
      clientHeight: reducedTicker.clientHeight,
      scrollHeight: reducedTicker.scrollHeight,
    } : null;
    return {
      route: ${JSON.stringify(route)},
      header,
      sessionReadouts: first('.session-readouts', 'session-readouts'),
      ticket: first('.session-badge', 'session-ticket'),
      content,
      headerRegions,
      routeRegions,
      plot,
      intersections,
      headerContentGap: header && content ? Math.round((content.rect.top - header.rect.bottom) * 100) / 100 : null,
      ticketContentIntersection: intersections.some(({ left }) => left === 'session-ticket'),
      plotContentIntersection: intersections.some(({ left }) => left === 'ship-plot'),
      plotContentVerticalGap: plot && content ? Math.round((content.rect.top - plot.rect.bottom) * 100) / 100 : null,
      appHeaderHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-header-height').trim(),
      sessionPaddingTop: sessionMode ? getComputedStyle(sessionMode).paddingTop : null,
      sessionAlignContent: sessionMode ? getComputedStyle(sessionMode).alignContent : null,
      sessionName: sessionName?.textContent?.trim() ?? null,
      sessionNameLength: sessionName?.textContent?.trim().length ?? 0,
      indicator: indicator?.textContent?.trim() ?? null,
      rank: rank?.textContent?.trim() ?? null,
      connectedPlayerCount: Number.isFinite(connectedPlayerCount) ? connectedPlayerCount : null,
      motion: root?.getAttribute('data-motion') ?? null,
      reducedTicker: reducedTickerGeometry,
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
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await waitFor(() => evaluate(cdp, 'location.href === "about:blank"'), 'blank document');
  const seedScript = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
  await cdp.send('Page.navigate', { url: `${appUrl}/?prompt603a=${Date.now()}#${route}` });
  await waitFor(
    () => evaluate(cdp, `Boolean(
      location.hash.endsWith(${JSON.stringify(`#${route}`)}) &&
      document.querySelector('.session-badge__code')?.textContent === '603A' &&
      document.querySelector('.app-header') &&
      document.querySelector(${JSON.stringify(route === '/roles' ? '.role-select' : '.ship-role-select')})
    )`),
    `${route} store hydration`,
  );
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: seedScript.identifier,
  });
  await waitForStableLayout(cdp, route);
}

async function waitForStableLayout(cdp, route) {
  let previous = null;
  let stableSamples = 0;
  await waitFor(async () => {
    const snapshot = await measurePage(cdp, route);
    const signature = JSON.stringify(snapshot);
    if (signature === previous) stableSamples += 1;
    else stableSamples = 0;
    previous = signature;
    return stableSamples >= 2;
  }, `${route} layout stabilization`);
}

async function ensureAppOrigin(cdp, appUrl) {
  await cdp.send('Page.navigate', { url: `${appUrl}/?prompt603a=bootstrap#/roles` });
  await waitFor(
    () => evaluate(cdp, `location.origin === ${JSON.stringify(appUrl)}`),
    'local app origin',
  );
}

async function setViewport(cdp, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: viewport.safeArea,
  });
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

async function measureKeyboardFocus(cdp, route) {
  const target = await evaluate(cdp, `(() => {
    const element = ${JSON.stringify(route.startsWith('/ships/'))}
      ? document.querySelector('.ship-role-select a.role-card')
      : document.querySelector('.role-select .role-claim__input:not(:disabled)')
        ?? document.querySelector('.role-select button.role-card:not(:disabled)');
    if (!element) return null;
    return {
      className: element.className,
      label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 80),
    };
  })()`);
  await evaluate(cdp, 'document.activeElement?.blur()');
  let initial = null;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    await dispatchTab(cdp);
    initial = await describeActiveFocus(cdp);
    if (initial?.className === target?.className && initial?.label === target?.label) break;
  }
  const order = await evaluate(cdp, `(() => [...document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
  )].map((element) => ({
    tag: element.tagName.toLowerCase(),
    className: element.className,
    label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 80),
  })))()`);
  await dispatchTab(cdp);
  const after = await describeActiveFocus(cdp);
  return { order, initial, afterTab: after };
}

async function dispatchTab(cdp) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
}

async function describeActiveFocus(cdp) {
  return evaluate(cdp, `(() => {
    const active = document.activeElement;
    const focusables = [...document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    )];
    if (!(active instanceof HTMLElement)) return null;
    const value = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    return {
      tag: active.tagName.toLowerCase(),
      className: active.className,
      label: (active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 80),
      focusVisible: active.matches(':focus-visible'),
      outline: style.outline,
      rect: {
        x: Math.round(value.x * 100) / 100,
        y: Math.round(value.y * 100) / 100,
        width: Math.round(value.width * 100) / 100,
        height: Math.round(value.height * 100) / 100,
      },
      index: focusables.indexOf(active),
    };
  })()`);
}

async function measureHeaderScroll(cdp) {
  const before = await evaluate(cdp, `(() => {
    const element = document.querySelector('.app-header');
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return { top: value.top, bottom: value.bottom, scrollY: window.scrollY };
  })()`);
  await evaluate(cdp, 'window.scrollTo(0, document.documentElement.scrollHeight)');
  await waitFor(() => evaluate(cdp, 'window.scrollY > 0'), 'document scroll to advance');
  const after = await evaluate(cdp, `(() => {
    const element = document.querySelector('.app-header');
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return { top: value.top, bottom: value.bottom, scrollY: window.scrollY };
  })()`);
  await evaluate(cdp, 'window.scrollTo(0, 0)');
  await waitFor(() => evaluate(cdp, 'window.scrollY === 0'), 'document scroll to restore');
  return {
    before,
    after,
    moved: Boolean(before && after && after.top < before.top),
    leavesViewport: Boolean(after && after.bottom <= 0),
  };
}

function assertRecord(record) {
  if (!record.header || !record.ticket || !record.content) {
    throw new Error(`Missing shared geometry on ${record.route}.`);
  }
  const requiredRegions = record.route.startsWith('/ships/')
    ? ['ship-role-panel[1]', 'ship-role-intro[1]', 'ship-role-grid[1]', 'ship-role-card[1]']
    : ['role-select[1]', 'role-intro[1]', 'role-grid[1]', 'role-card[1]'];
  const regionKeys = new Set(record.routeRegions.map(({ key }) => key));
  const missingRegions = requiredRegions.filter((key) => !regionKeys.has(key));
  if (missingRegions.length > 0) {
    throw new Error(`Missing Role Select regions on ${record.route}: ${missingRegions.join(', ')}`);
  }
  if (record.headerContentGap === null || record.headerContentGap < 0) {
    throw new Error(`Header overlaps routed content on ${record.route}.`);
  }
  if (record.intersections.length > 0) {
    throw new Error(`Shared chrome overlaps routed content on ${record.route}: ${JSON.stringify(record.intersections)}`);
  }
  if (record.scroll.horizontalOverflow) {
    throw new Error(`Horizontal overflow found on ${record.route}.`);
  }
  const safeArea = record.safeArea;
  const headerRect = record.header.rect;
  if (
    headerRect.top < safeArea.top - 0.5 ||
    headerRect.left < safeArea.left - 0.5 ||
    headerRect.right > record.viewport.width - safeArea.right + 0.5
  ) {
    throw new Error(`Header escapes the simulated safe area on ${record.route}.`);
  }
  if (record.connectedPlayerCount !== record.connectedPlayersSeed) {
    throw new Error(`Connected-player seed did not hydrate on ${record.route}: expected ${record.connectedPlayersSeed}, got ${record.connectedPlayerCount}.`);
  }
  if (record.route.startsWith('/ships/') && record.viewport.width === 390 &&
      record.viewport.height === 844 && !record.headerScroll?.leavesViewport) {
    throw new Error('The absolute app header did not leave the viewport after document scroll.');
  }
  const isTouchViewport = record.viewport.width <= 600 || record.viewport.height <= 600;
  if (isTouchViewport && record.interactive.under44.length > 0) {
    throw new Error(`Interactive target under 44px found on ${record.route}: ${record.interactive.under44.map((item) => `${item.tag}:${item.label}:${item.rect.height}`).join(', ')}`);
  }
  if (record.motion === 'reduce' && record.reducedTicker && (
    record.reducedTicker.whiteSpace !== 'normal' ||
    record.reducedTicker.overflowWrap !== 'anywhere' ||
    record.reducedTicker.message === null
  )) {
    throw new Error(`Reduced-motion FleetBroadcast is not fully wrapped on ${record.route}.`);
  }
}

function assertKeyboardFocus(focus, route) {
  if (!focus.initial || !focus.afterTab || !focus.initial.rect || !focus.afterTab.rect) {
    throw new Error(`Keyboard focus did not reach a visible control on ${route}.`);
  }
  if (!focus.initial.focusVisible || !focus.afterTab.focusVisible) {
    throw new Error(`Keyboard focus ring was not visible on ${route}.`);
  }
  if (focus.afterTab.index !== focus.initial.index + 1) {
    throw new Error(`Keyboard order skipped a focusable control on ${route}.`);
  }
  if (focus.initial.rect.width <= 0 || focus.initial.rect.height <= 0 ||
      focus.afterTab.rect.width <= 0 || focus.afterTab.rect.height <= 0) {
    throw new Error(`Keyboard focus rectangle was empty on ${route}.`);
  }
}

function normalizeGeometry(value) {
  if (Array.isArray(value)) return value.map(normalizeGeometry);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'generatedAt' && key !== 'screenshot')
        .map(([key, entry]) => [key, normalizeGeometry(entry)]),
    );
  }
  return value;
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
    await ensureAppOrigin(cdp, appUrl);
    const records = [];
    for (const viewport of VIEWPORTS) {
      await setViewport(cdp, viewport);
      for (const routeConfig of [
        { route: '/roles', slug: 'roles', roleId: null },
        { route: '/ships/aegis/roles', slug: 'ship-roles', roleId: 'admiral' },
      ]) {
        const recordSeed = sessionSeed({
          activeConsoleRoleId: routeConfig.roleId,
          connectedPlayers: viewport.connectedPlayers,
        });
        await navigate(cdp, appUrl, routeConfig.route, recordSeed);
        const record = await measurePage(cdp, routeConfig.route);
        record.viewport = viewport;
        record.safeArea = viewport.safeArea;
        record.connectedPlayersSeed = viewport.connectedPlayers;
        if (routeConfig.roleId && viewport.width === 390 && viewport.height === 844) {
          record.headerScroll = await measureHeaderScroll(cdp);
        }
        record.screenshot = await screenshot(cdp, `${routeConfig.slug}-${viewport.width}x${viewport.height}.png`);
        assertRecord(record);
        records.push(record);
      }
    }

    const variantViewport = VIEWPORTS.find(({ width, height }) => width === 390 && height === 844);
    if (!variantViewport) throw new Error('Missing 390x844 geometry viewport.');
    await setViewport(cdp, variantViewport);
    await navigate(cdp, appUrl, '/roles', sessionSeed({
      connectedPlayers: variantViewport.connectedPlayers,
    }));
    const roleFocus = await measureKeyboardFocus(cdp, '/roles');
    roleFocus.viewport = variantViewport;
    roleFocus.screenshot = await screenshot(cdp, 'roles-role-focus-390x844.png');
    assertKeyboardFocus(roleFocus, '/roles');

    await navigate(cdp, appUrl, '/ships/aegis/roles', sessionSeed({
      activeConsoleRoleId: 'admiral',
      connectedPlayers: variantViewport.connectedPlayers,
    }));
    const shipRoleFocus = await measureKeyboardFocus(cdp, '/ships/aegis/roles');
    shipRoleFocus.viewport = variantViewport;
    shipRoleFocus.screenshot = await screenshot(cdp, 'ship-roles-focus-390x844.png');
    assertKeyboardFocus(shipRoleFocus, '/ships/aegis/roles');

    await navigate(cdp, appUrl, '/roles', sessionSeed({
      connectedPlayers: variantViewport.connectedPlayers,
    }));
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

    await navigate(cdp, appUrl, '/roles', sessionSeed({
      reducedMotion: true,
      connectedPlayers: variantViewport.connectedPlayers,
    }));
    const reducedMotion = await measurePage(cdp, '/roles');
    reducedMotion.viewport = variantViewport;
    reducedMotion.safeArea = variantViewport.safeArea;
    reducedMotion.connectedPlayersSeed = variantViewport.connectedPlayers;
    reducedMotion.screenshot = await screenshot(cdp, 'roles-reduced-motion-390x844.png');
    assertRecord(reducedMotion);
    if (reducedMotion.motion !== 'reduce') throw new Error('Reduced-motion seed did not reach the rendered app.');

    const expectedConnectedPlayerCounts = [...new Set(VIEWPORTS.map(({ connectedPlayers }) => connectedPlayers))]
      .sort((left, right) => left - right);
    const measuredConnectedPlayerCounts = [...new Set(records.map(({ connectedPlayerCount }) => connectedPlayerCount))]
      .sort((left, right) => left - right);
    const noIntersections = records.every(({ intersections }) => intersections.length === 0) &&
      reducedMotion.intersections.length === 0;
    const measuredRecords = [...records, reducedMotion];
    const safeAreasVerified = measuredRecords.every((record) => {
      const bounds = record.header.rect;
      const insets = record.safeArea;
      return bounds.top >= insets.top - 0.5 && bounds.left >= insets.left - 0.5 &&
        bounds.right <= record.viewport.width - insets.right + 0.5;
    });
    const touchTargetsVerified = records
      .filter(({ viewport }) => viewport.width <= 600 || viewport.height <= 600)
      .every(({ interactive }) => interactive.under44.length === 0);
    const reducedTickerWrapped = reducedMotion.reducedTicker?.whiteSpace === 'normal' &&
      reducedMotion.reducedTicker.overflowWrap === 'anywhere' &&
      reducedMotion.reducedTicker.message !== null;
    const expectedViewportNames = VIEWPORTS.map(({ name }) => name);
    const measuredViewportNames = [...new Set(records.map(({ viewport }) => viewport.name))];
    const output = {
      prompt: '603a',
      generatedAt: new Date().toISOString(),
      command: 'npm run test:geometry:603a',
      source: 'Chrome DevTools Protocol DOMRect capture against the local Vite build; layout values are not mocked. Connected-player counts use the development-only AppHeader session-storage seed so each rendered variant is deterministic.',
      viewports: VIEWPORTS,
      records,
      variants: {
        longLabels: {
          sessionName: records[0].sessionName,
          sessionNameLength: records[0].sessionNameLength,
          horizontalOverflow: records.some((record) => record.scroll.horizontalOverflow),
        },
        settings,
        keyboardFocus: {
          settings: focus,
          roleSelect: roleFocus,
          shipRoleSelect: shipRoleFocus,
        },
        reducedMotion,
      },
      assertions: {
        headerBeforeContent: records.every(({ headerContentGap }) => headerContentGap >= 0) &&
          reducedMotion.headerContentGap >= 0,
        sessionTicketOutsideRoleContent: records.every(({ ticketContentIntersection }) => !ticketContentIntersection) &&
          !reducedMotion.ticketContentIntersection,
        shipDradisOutsideShipRoleContent: records
          .filter(({ route }) => route.startsWith('/ships/'))
          .every(({ plotContentIntersection }) => !plotContentIntersection),
        allRoleSelectRegionsMeasured: records.every(({ routeRegions }) => routeRegions.length > 0) &&
          reducedMotion.routeRegions.length > 0,
        noIntersections,
        noHorizontalOverflow: records.every(({ scroll }) => !scroll.horizontalOverflow) &&
          !reducedMotion.scroll.horizontalOverflow,
        touchViewportInteractiveTargetsAtLeast44px: touchTargetsVerified,
        settingsControlsAtLeast44px: settings.minimumControlHeight >= 44,
        connectedPlayerCounts: measuredConnectedPlayerCounts,
        connectedPlayerCountVariantsCovered: expectedConnectedPlayerCounts.every((count) =>
          measuredConnectedPlayerCounts.includes(count)),
        safeAreasVerified,
        keyboardOrderAndFocusVerified: [roleFocus, shipRoleFocus]
          .every(({ initial, afterTab }) => Boolean(
            initial?.focusVisible && afterTab?.focusVisible &&
            initial.rect?.width > 0 && initial.rect?.height > 0 &&
            afterTab.rect?.width > 0 && afterTab.rect?.height > 0 &&
            afterTab.index === initial.index + 1,
          )),
        absoluteHeaderLeavesViewportAfterScroll: Boolean(
          records.find(({ headerScroll }) => headerScroll)?.headerScroll?.leavesViewport,
        ),
        reducedMotionTickerWrapped: reducedTickerWrapped,
        portraitAndLandscapeCovered: expectedViewportNames.every((name) => measuredViewportNames.includes(name)),
      },
    };
    writeFileSync(resolve(OUTPUT_DIR, 'geometry.json'), `${JSON.stringify(output, null, 2)}\n`);
    writeFileSync(
      resolve(OUTPUT_DIR, 'geometry.normalized.json'),
      `${JSON.stringify(normalizeGeometry(output), null, 2)}\n`,
    );
    console.log(JSON.stringify({
      output: resolve(OUTPUT_DIR, 'geometry.json'),
      normalizedOutput: resolve(OUTPUT_DIR, 'geometry.normalized.json'),
      screenshots: records.map((record) => record.screenshot).concat([
        settings.screenshot,
        focus.screenshot,
        roleFocus.screenshot,
        shipRoleFocus.screenshot,
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
        ].forEach((key) => localStorage.removeItem(key));
        sessionStorage.removeItem(${JSON.stringify(CONNECTED_PLAYERS_STORAGE_KEY)});`);
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
