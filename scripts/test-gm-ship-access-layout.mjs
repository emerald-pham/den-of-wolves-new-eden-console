import assert from 'node:assert/strict';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const HARNESS_PATH = resolve(ROOT, 'src/__gmShipAccessLayoutRender.tsx');
const HTML_PATH = resolve(ROOT, '__gm-ship-access-layout-render.html');
const VIEWPORTS = [
  { name: 'wide', width: 1280, height: 720 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
];

function writeHarness() {
  if (existsSync(HARNESS_PATH) || existsSync(HTML_PATH)) {
    throw new Error('A temporary GM ship access render harness path already exists.');
  }
  writeFileSync(HTML_PATH, `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module" src="/src/__gmShipAccessLayoutRender.tsx"></script></body></html>`);
  writeFileSync(HARNESS_PATH, `import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import '@/index.css';
import AppHeader from '@/components/AppHeader';
import ShipPlot from '@/components/ShipPlot';
import ScreenFade from '@/components/ScreenFade';
import ShipConsole from '@/routes/ShipConsole';
import { useMotionPreference } from '@/lib/motionPreference';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';

const sessionId = 'local-gm-ship-access-layout';
const timestamp = new Date().toISOString();
const session = {
  id: sessionId, name: 'Local observer layout review', joinCode: 'LOCAL', phase: 'lobby',
  ownerUid: 'local-gm', createdAt: timestamp, updatedAt: timestamp, currentTurn: 1,
} as unknown as GameSession;
const player = {
  uid: 'local-gm', sessionId, displayName: 'Local GM', role: 'gm', seatId: null,
  joinedAt: timestamp,
} as unknown as Player;
const store = useSessionStore.getState();
store.reset();
store.setIdentity(session, player);
store.setGmInstance({
  id: 'local-gm-instance', sessionId, uid: player.uid, name: player.displayName,
  deviceLabel: 'Local layout review', claimedAt: timestamp,
});
store.setGmAccessAuthenticatedAt(Date.now());
store.setMode('console');
store.setLastRoute('/ships/aegis/observer');

function ReviewShell() {
  const { reducedMotion } = useMotionPreference();
  return <div data-motion={reducedMotion ? 'reduce' : 'full'}>
    <HashRouter>
      <ShipPlot hostile={false} aboard viewerId="aegis" ambientSession={session} />
      <AppHeader />
      <ScreenFade>{screen => <Routes location={screen}>
        <Route path="/ships/:shipId/observer" element={<ShipConsole observer />} />
        <Route path="/ships/:shipId/roles" element={<main>Local role navigation</main>} />
      </Routes>}</ScreenFade>
    </HashRouter>
  </div>;
}

createRoot(document.getElementById('root')!).render(<ReviewShell />);`);
}

test('GM ship access stays pointer-reachable beside the ship identity and preserves DRADIS zoom', async () => {
  writeHarness();
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });

    for (const motion of ['no-preference', 'reduce']) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: motion,
          serviceWorkers: 'block',
        });
        const page = await context.newPage();
        await page.route('**/*', route => {
          const requestUrl = new URL(route.request().url());
          return requestUrl.origin === origin ? route.continue() : route.abort();
        });
        try {
          await page.goto(`${origin}/__gm-ship-access-layout-render.html#/ships/aegis/observer`);
          const access = page.getByRole('region', { name: 'GM ship console access' });
          const accessButton = access.getByRole('button', { name: 'GM ship console read write access' });
          await accessButton.waitFor({ state: 'visible', timeout: 12_000 });
          await page.evaluate(() => document.fonts.ready);
          await accessButton.scrollIntoViewIfNeeded();

          const geometry = await accessButton.evaluate(button => {
            const bounds = element => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
            };
            const buttonRect = bounds(button);
            const identity = button.closest('.ship-console__identity');
            const identityRect = identity ? bounds(identity) : null;
            const plot = document.querySelector('.ship-plot[data-aboard="true"]');
            const plotRect = plot ? bounds(plot) : null;
            const centerX = (buttonRect.left + buttonRect.right) / 2;
            const centerY = (buttonRect.top + buttonRect.bottom) / 2;
            const hit = document.elementFromPoint(centerX, centerY);
            const overlaps = (a, b) =>
              a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            return {
              button: buttonRect,
              identity: identityRect,
              plot: plotRect,
              insideIdentity: Boolean(identity),
              buttonOverlapsPlot: plotRect ? overlaps(buttonRect, plotRect) : false,
              centerHitIsButton: hit === button || button.contains(hit),
              viewport: { width: innerWidth, height: innerHeight },
            };
          });
          const label = `${viewport.name} ${viewport.width}x${viewport.height} ${motion}`;
          assert.ok(geometry.insideIdentity,
            `${label}: access must sit inside the left identity panel; geometry=${JSON.stringify(geometry)}`);
          assert.equal(geometry.buttonOverlapsPlot, false,
            `${label}: access must not overlap compact DRADIS; geometry=${JSON.stringify(geometry)}`);
          assert.equal(geometry.centerHitIsButton, true,
            `${label}: the access button center must hit the button; geometry=${JSON.stringify(geometry)}`);
          console.log(`${label}: GM access ${JSON.stringify(geometry)}`);

          await accessButton.click();
          assert.ok(await page.getByRole('alertdialog', { name: 'Are you sure?' }).isVisible(),
            `${label}: pointer activation opens the existing confirmation`);
          const confirmation = page.getByRole('alertdialog', { name: 'Are you sure?' });
          const confirmButton = confirmation.getByRole('button', { name: 'ARE YOU SURE?', exact: true });
          const confirmationGeometry = await confirmButton.evaluate(button => {
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return { centerHitIsButton: hit === button || button.contains(hit),
              visibleInViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
              height: rect.height, hit: hit?.className ?? null };
          });
          assert.ok(confirmationGeometry.centerHitIsButton && confirmationGeometry.visibleInViewport,
            `${label}: confirmation must receive its pointer above ship identity and DRADIS; geometry=${JSON.stringify(confirmationGeometry)}`);
          assert.ok(confirmationGeometry.height >= 44, `${label}: confirmation retains a touch target`);
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('alertdialog', { name: 'Are you sure?' }).count(), 0,
            `${label}: Escape dismisses the confirmation without granting access`);
          assert.equal(await accessButton.getAttribute('aria-pressed'), 'false',
            `${label}: cancel leaves the observer in Read mode`);

          const plot = page.locator('.ship-plot[data-aboard="true"]');
          const zoom = page.getByRole('button', { name: 'Zoom into DRADIS panel' });
          const compactPlotBox = await plot.boundingBox();
          assert.ok(compactPlotBox, `${label}: compact DRADIS has visible geometry`);
          await zoom.scrollIntoViewIfNeeded();
          const zoomGeometry = await zoom.evaluate(button => {
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return { centerHitIsButton: hit === button || button.contains(hit), rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } };
          });
          assert.ok(zoomGeometry.centerHitIsButton,
            `${label}: DRADIS Zoom center must hit its button; geometry=${JSON.stringify(zoomGeometry)}`);
          console.log(`${label}: DRADIS Zoom ${JSON.stringify(zoomGeometry)}`);
          await zoom.click();
          assert.equal(await plot.getAttribute('data-expanded'), 'true', `${label}: DRADIS Zoom remains functional`);
          await page.getByRole('button', { name: 'Close DRADIS' }).click();
          assert.equal(await plot.getAttribute('data-expanded'), 'false', `${label}: DRADIS closes normally`);
          await page.waitForFunction(expected => {
            const element = document.querySelector('.ship-plot[data-aboard="true"]');
            if (!element || element.getAttribute('data-expanded') !== 'false') return false;
            const rect = element.getBoundingClientRect();
            return Math.abs(rect.width - expected.width) < 1 && Math.abs(rect.height - expected.height) < 1;
          }, { width: compactPlotBox.width, height: compactPlotBox.height });
          await page.screenshot({ path: `/tmp/gm-ship-access-${viewport.width}x${viewport.height}-${motion}.png`, fullPage: true });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser?.close();
    await server.close();
    unlinkSync(HARNESS_PATH);
    unlinkSync(HTML_PATH);
  }
});
