import assert from 'node:assert/strict';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright';

const evidence = resolve(process.env.PC09_DEFERRED_ROUTE_EVIDENCE_DIR ?? '/tmp/pc09-deferred-ship-route');
await mkdir(evidence, {recursive: true});
const assets = await readdir('dist/assets');
const shipEntry = assets.find(name => /^ShipConsole-[^/]+\.js$/.test(name));
assert.ok(shipEntry, 'Ship consoles require their own deferred route entry, outside the landing graph.');
const result = {kind: 'prepared local browser loading/navigation proof', actualAuthentication: false,
  productionWrites: 0, landingShipRequests: 0, cases: [], blockedRemoteRequests: [], pageErrors: []};
const server = await preview({preview: {host: '127.0.0.1', port: 0, strictPort: false}});
const address = server.httpServer.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({headless: true});
const stamp = '2026-01-01T00:00:00.000Z';
const fixture = {session: {id: 'pc09-prepared-lazy', name: 'Prepared loading check', phase: 'lobby',
  currentTurn: 0, ownerUid: 'pc09-prepared-lazy-player', createdAt: stamp, updatedAt: stamp},
  me: {uid: 'pc09-prepared-lazy-player', sessionId: 'pc09-prepared-lazy', displayName: 'Prepared player',
    role: 'player', seatId: 'admiral', assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', joinedAt: stamp},
  seats: [], gmInstance: null, gmAccessAuthenticatedAt: null, pendingCommands: [], mode: 'console',
  lastRoute: '/console', awayMissionHandPointers: [], awayMissionHands: []};

async function contextFor(viewport, prepared = false) {
  const context = await browser.newContext({viewport, serviceWorkers: 'block', reducedMotion: 'reduce'});
  await context.addInitScript(({prepared, fixture}) => {
    const now = Date.now();
    localStorage.setItem('dow-new-eden-session-waiver', String(now));
    localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({choice: 'reduce', acknowledgedAt: now}));
    if (prepared) {
      Object.defineProperty(Navigator.prototype, 'onLine', {configurable: true, get: () => false});
      localStorage.setItem('dow-new-eden-session', JSON.stringify({state: fixture, version: 1}));
    }
  }, {prepared, fixture});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      result.blockedRemoteRequests.push({origin: url.origin, reason: 'prepared proof network boundary'});
      return route.abort();
    }
    if (url.pathname === `/assets/${shipEntry}`) {
      if (!prepared) result.landingShipRequests += 1;
      // Hold the real deferred module so the loading return control is observable.
      return;
    }
    return route.continue();
  });
  return context;
}

try {
  const landing = await contextFor({width: 390, height: 844});
  const page = await landing.newPage();
  await page.goto(origin);
  await page.locator('main').first().waitFor({state: 'visible'});
  assert.equal(result.landingShipRequests, 0, 'Landing must not request the ship-console module.');
  await landing.close();

  for (const viewport of [{width: 390, height: 844}, {width: 1440, height: 900}, {width: 844, height: 390}]) {
    const context = await contextFor(viewport, true);
    const current = await context.newPage();
    current.on('pageerror', error => result.pageErrors.push(error.message));
    await current.goto(`${origin}/#/ships/aegis/roles/admiral`, {waitUntil: 'domcontentloaded'});
    const loading = current.locator('main').filter({hasText: 'Opening ship console…'});
    await loading.waitFor({state: 'visible'});
    const back = loading.getByRole('link', {name: 'Back to stations', exact: true});
    const geometry = await back.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return {width: rect.width, height: rect.height, font: getComputedStyle(node).fontFamily,
        overflow: document.documentElement.scrollWidth > innerWidth, fonts: document.fonts.status};
    });
    assert.ok(geometry.width >= 44 && geometry.height >= 44);
    assert.match(geometry.font, /monospace/i);
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.fonts, 'loaded');
    await current.screenshot({path: `${evidence}/${viewport.width}x${viewport.height}-loading.png`});
    await back.focus();
    await current.keyboard.press('Enter');
    await current.waitForURL('**/#/console');
    const retained = await current.evaluate(() => JSON.parse(localStorage.getItem('dow-new-eden-session')).state);
    assert.equal(retained.session?.id, fixture.session.id);
    assert.equal(retained.me?.uid, fixture.me.uid);
    result.cases.push({viewport, loadingVisible: true, keyboardBack: true, fixtureIdentityRetained: true, geometry});
    await context.close();
  }
  assert.deepEqual(result.pageErrors, []);
  result.completedAt = new Date().toISOString();
  await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2)+'\n');
  console.log(`PASS deferred ship route: landing isolation and ${result.cases.length} prepared loading/keyboard Back viewports. Remote requests are blocked; this is not authenticated gameplay.`);
} finally {
  await browser.close();
  await new Promise(done => server.httpServer.close(done));
}
