import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const host = '127.0.0.1';
const port = Number(process.env.TICKER_SMOKE_PORT ?? 4179);
const appUrl = `http://${host}:${port}/`;
const artifactDirectory = process.env.TICKER_SMOKE_ARTIFACT_DIR
  ?? path.join('/tmp', 'fleet-ticker-smoke');
const expectedText = 'SNN // CURRENT SERVER BROADCAST';

const session = {
  id: 'ticker-browser-smoke',
  name: 'Ticker browser smoke',
  joinCode: 'BIRD',
  phase: 'active',
  ownerUid: 'ticker-smoke-player',
  createdAt: '2026-09-13T16:00:00.000Z',
  updatedAt: '2026-09-13T16:00:00.000Z',
  fleetTicker: {
    revision: 7,
    nextSequence: 7,
    replayCursor: 7,
    current: {
      id: 'ticker-browser-smoke:fleet-ticker:7',
      sequence: 7,
      source: 'press',
      priority: 20,
      text: expectedText,
      tone: 'normal',
      gap: 'long',
      createdAt: '2026-09-13T16:00:00.000Z',
    },
    queued: [],
    draining: [],
    dismissed: [],
  },
};

const player = {
  uid: 'ticker-smoke-player',
  sessionId: 'ticker-browser-smoke',
  displayName: 'Ticker Smoke Player',
  role: 'player',
  seatId: null,
  activeConsoleRoleId: 'admiral',
  joinedAt: '2026-09-13T16:00:00.000Z',
};

const persistedSession = {
  state: {
    session,
    me: player,
    gmInstance: null,
    gmAccessAuthenticatedAt: null,
    pendingCommands: [],
    mode: 'console',
    lastRoute: '/console',
  },
  version: 1,
};

function startVite() {
  const output = [];
  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), 'node_modules/vite/bin/vite.js'), '--host', host, '--port', String(port), '--strictPort'],
    { cwd: process.cwd(), env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout?.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr?.on('data', (chunk) => output.push(chunk.toString()));
  return { child, output: () => output.join('').slice(-4000) };
}

async function waitForServer(child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before browser smoke started.\n${output()}`);
    }
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Vite at ${appUrl}.\n${output()}`);
}

async function assertTicker(page, label, fontMode, reducedMotion) {
  await page.waitForFunction(
    () => document.querySelector('.fleet-ticker [role="status"]') !== null,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForFunction(() => {
    const ticker = document.querySelector('.fleet-ticker');
    const frame = ticker?.querySelector('.fleet-ticker__window')?.getBoundingClientRect();
    if (!ticker || !frame) return false;
    const tickerBounds = ticker.getBoundingClientRect();
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const tickerStyle = getComputedStyle(ticker);
    const frameStyle = getComputedStyle(ticker.querySelector('.fleet-ticker__window'));
    const intersectsViewport = (bounds) => bounds.right > viewport.left &&
      bounds.left < viewport.right && bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    if (!intersectsViewport(tickerBounds) || !intersectsViewport(frame) ||
        tickerStyle.display === 'none' || tickerStyle.visibility === 'hidden' ||
        Number(tickerStyle.opacity) <= 0 || frameStyle.display === 'none' ||
        frameStyle.visibility === 'hidden' || Number(frameStyle.opacity) <= 0) return false;
    return [...ticker.querySelectorAll('.fleet-ticker__copy, .fleet-ticker__message')]
      .filter((element) => !element.closest('.fleet-ticker__probe'))
      .some((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return element.textContent?.includes('SNN // CURRENT SERVER BROADCAST') &&
          bounds.width > 0 && bounds.height > 0 && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0 &&
          bounds.right > frame.left && bounds.left < frame.right &&
          bounds.bottom > frame.top && bounds.top < frame.bottom;
      });
  }, undefined, { timeout: 5_000 });
  const snapshot = await page.evaluate(() => {
    const ticker = document.querySelector('.fleet-ticker');
    const frame = ticker?.querySelector('.fleet-ticker__window');
    const status = ticker?.querySelector('[role="status"]');
    const frameBounds = frame?.getBoundingClientRect();
    const tickerBounds = ticker?.getBoundingClientRect();
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const intersectsViewport = (bounds) => bounds !== undefined && bounds.right > viewport.left &&
      bounds.left < viewport.right && bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    const tickerStyle = ticker ? getComputedStyle(ticker) : null;
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const viewportVisible = intersectsViewport(tickerBounds) && intersectsViewport(frameBounds) &&
      tickerStyle?.display !== 'none' && tickerStyle?.visibility !== 'hidden' &&
      Number(tickerStyle?.opacity ?? 0) > 0 && frameStyle?.display !== 'none' &&
      frameStyle?.visibility !== 'hidden' && Number(frameStyle?.opacity ?? 0) > 0;
    const paintedText = ticker
      ? [...ticker.querySelectorAll('.fleet-ticker__copy, .fleet-ticker__message')]
        .filter((element) => !element.closest('.fleet-ticker__probe'))
        .some((element) => {
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return element.textContent?.includes('SNN // CURRENT SERVER BROADCAST') &&
            bounds.width > 0 &&
            bounds.height > 0 && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0 &&
            frameBounds !== undefined && bounds.right > frameBounds.left &&
            bounds.left < frameBounds.right && bounds.bottom > frameBounds.top &&
            bounds.top < frameBounds.bottom;
        })
      : false;
    return {
      fontStatus: document.fonts?.status ?? 'unavailable',
      fontPatchInstalled: Boolean(window.__tickerSmokeFontPatch),
      ticker: Boolean(ticker),
      text: status?.getAttribute('aria-label') ?? status?.textContent?.trim() ?? '',
      tickerBounds: tickerBounds?.toJSON() ?? null,
      frameBounds: frameBounds?.toJSON() ?? null,
      viewportVisible,
      paintedText,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      motion: document.querySelector('[data-motion]')?.dataset.motion ?? null,
    };
  });

  if (!snapshot.ticker || !snapshot.viewportVisible || !snapshot.paintedText || !snapshot.tickerBounds ||
      snapshot.tickerBounds.width <= 0 || snapshot.tickerBounds.height <= 0) {
    throw new Error(`${label}: ticker is not painted in the viewport: ${JSON.stringify(snapshot)}`);
  }
  if (!snapshot.text.includes(expectedText)) {
    throw new Error(`${label}: visible ticker text is wrong: ${JSON.stringify(snapshot)}`);
  }
  if (snapshot.overflow) {
    throw new Error(`${label}: ticker introduced horizontal overflow: ${JSON.stringify(snapshot)}`);
  }
  const expectedMotion = reducedMotion ? 'reduce' : 'full';
  if (snapshot.motion !== expectedMotion) {
    throw new Error(`${label}: motion fixture was not applied: ${JSON.stringify(snapshot)}`);
  }
  if (fontMode === 'pending' && (!snapshot.fontPatchInstalled || snapshot.fontStatus !== 'loading')) {
    throw new Error(`${label}: pending-font fixture did not remain pending: ${JSON.stringify(snapshot)}`);
  }
  if (fontMode === 'ready' && snapshot.fontStatus !== 'loaded') {
    throw new Error(`${label}: ready-font fixture remained pending: ${JSON.stringify(snapshot)}`);
  }
}

async function runCase(fontMode, reducedMotion, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  const localOrigin = new URL(appUrl).origin;
  await context.route('**/*', (route) => {
    const requestUrl = route.request().url();
    try {
      const parsedUrl = new URL(requestUrl);
      if (parsedUrl.origin === localOrigin || parsedUrl.protocol === 'data:' || parsedUrl.protocol === 'blob:') {
        return route.continue();
      }
    } catch {
      if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
    }
    return route.abort();
  });
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    if (url.protocol === 'ws:' && url.host === new URL(appUrl).host) {
      socket.connectToServer();
    } else {
      socket.close();
    }
  });
  await context.addInitScript(({ fixture, fontMode: mode, reduced }) => {
    localStorage.setItem('dow-new-eden-session', JSON.stringify(fixture));
    localStorage.setItem('new-eden-motion-override', reduced ? 'reduce' : 'full');
    localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
      acknowledgedAt: Date.now(),
      choice: reduced ? 'reduce' : 'full',
    }));
    localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
    if (mode !== 'pending') return;
    const fonts = document.fonts;
    let patched = false;
    try {
      Object.defineProperty(fonts, 'status', { configurable: true, value: 'loading' });
      Object.defineProperty(fonts, 'ready', {
        configurable: true,
        value: new Promise(() => undefined),
      });
      patched = true;
    } catch {
      // The assertion below fails closed if a browser does not expose a patchable FontFaceSet.
    }
    window.__tickerSmokeFontPatch = patched;
  }, { fixture: persistedSession, fontMode, reduced: reducedMotion });

  const page = await context.newPage();
  await page.setViewportSize(viewport);
  const label = `${fontMode}/${reducedMotion ? 'reduced' : 'normal'}/${viewport.width}x${viewport.height}`;
  try {
    await page.goto(`${appUrl}#/ships/aegis`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
    await assertTicker(page, `${label}/initial`, fontMode, reducedMotion);

    await page.goto(`${appUrl}#/ships/aegis/roles/admiral`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
    await assertTicker(page, `${label}/navigation`, fontMode, reducedMotion);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
    await assertTicker(page, `${label}/reload`, fontMode, reducedMotion);
  } catch (error) {
    await mkdir(artifactDirectory, { recursive: true });
    const screenshotPath = path.join(
      artifactDirectory,
      `ticker-${fontMode}-${reducedMotion ? 'reduced' : 'normal'}-${viewport.width}x${viewport.height}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nFailure screenshot: ${screenshotPath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

const { child: vite, output: viteOutput } = startVite();
try {
  await waitForServer(vite, viteOutput);
  for (const fontMode of ['pending', 'ready']) {
    for (const reducedMotion of [false, true]) {
      for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        await runCase(fontMode, reducedMotion, viewport);
        console.log(`Ticker browser smoke passed: ${fontMode}/${reducedMotion ? 'reduced' : 'normal'}/${viewport.width}x${viewport.height}`);
      }
    }
  }
} finally {
  if (vite.exitCode === null) vite.kill('SIGTERM');
}
