import assert from 'node:assert/strict';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright';

const evidence = resolve(process.env.PC09_DEFERRED_ROUTE_EVIDENCE_DIR ?? '/tmp/pc09-deferred-ship-route');
await mkdir(evidence, {recursive: true});
const assets = await readdir('dist/assets');
const shipEntry = assets.find(name => /^ShipConsole-[^/]+\.js$/.test(name));
assert.ok(shipEntry, 'Ship consoles require their own deferred route entry, outside the landing graph.');
const rejectedModules = [
  {name: 'ShipConsole', path: '/ships/aegis/roles/admiral', message: 'Could not open ship console.'},
  {name: 'PresidentOffice', path: '/president', message: "Could not open President's office."},
  {name: 'ElectionWorkspace', path: '/election', message: 'Could not open presidential election.'},
  {name: 'CrisisReportPanel', path: '/president', message: 'Crisis report could not open.'},
].map(module => {
  const entry = assets.find(name => name.startsWith(`${module.name}-`) && name.endsWith('.js'));
  assert.ok(entry, `${module.name} must retain its deferred module entry.`);
  return {...module, entry};
});
const result = {kind: 'prepared local browser loading/navigation proof', actualAuthentication: false,
  productionWrites: 0, landingShipRequests: 0, cases: [], rejectedCases: [],
  deliberateModuleRejections: [], blockedRemoteRequests: [], pageErrors: []};
const server = await preview({preview: {host: '127.0.0.1', port: 0, strictPort: false}});
const address = server.httpServer.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({headless: true});
let currentProofPage;
const stamp = '2026-01-01T00:00:00.000Z';
const fixture = {session: {id: 'pc09-prepared-lazy', name: 'Prepared loading check', phase: 'active',
  currentTurn: 3, ownerUid: 'pc09-prepared-lazy-player', createdAt: stamp, updatedAt: stamp,
  activeRoleIds: ['admiral'], activeVesselIds: ['aegis']},
  me: {uid: 'pc09-prepared-lazy-player', sessionId: 'pc09-prepared-lazy', displayName: 'Prepared player',
    role: 'player', seatId: 'admiral', assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral', joinedAt: stamp},
  seats: [], gmInstance: null, gmAccessAuthenticatedAt: null, pendingCommands: [], mode: 'console',
  lastRoute: '/console', awayMissionHandPointers: [], awayMissionHands: []};

async function contextFor(viewport, prepared = false, rejectEntry) {
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
      return route.abort('internetdisconnected');
    }
    if (rejectEntry && url.pathname === `/assets/${rejectEntry}`) {
      result.deliberateModuleRejections.push({entry: rejectEntry, viewport});
      return route.abort('failed');
    }
    if (url.pathname === `/assets/${shipEntry}`) {
      if (!prepared) result.landingShipRequests += 1;
      // Hold the real deferred module so the loading return control is observable.
      if (!rejectEntry) return;
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
    currentProofPage = current;
    current.on('pageerror', error => result.pageErrors.push(error.message));
    await current.goto(`${origin}/#/ships/aegis/roles/admiral`, {waitUntil: 'domcontentloaded'});
    const loading = current.locator('main').filter({hasText: 'Opening ship console…'});
    await loading.waitFor({state: 'visible'});
    // Existing CSS uppercases the label and adds a decorative return arrow.
    const back = loading.getByRole('link', {name: /^(?:←\s*)?Back to stations$/i});
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

  for (const module of rejectedModules) {
    for (const viewport of [{width: 390, height: 844}, {width: 1440, height: 900}, {width: 844, height: 390}]) {
      const context = await contextFor(viewport, true, module.entry);
      const current = await context.newPage();
      currentProofPage = current;
      current.on('pageerror', error => result.pageErrors.push(error.message));
      await current.goto(`${origin}/#${module.path}`, {waitUntil: 'domcontentloaded'});
      const alert = current.getByRole('alert').filter({hasText: module.message});
      await alert.waitFor({state: 'visible'});
      const main = current.locator('main').filter({has: current.getByRole('link', {
        name: /^(?:←\s*)?Back to stations$/i,
      })});
      await main.waitFor({state: 'visible'});
      const back = main.getByRole('link', {name: /^(?:←\s*)?Back to stations$/i});
      const geometry = await back.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return {width: rect.width, height: rect.height, font: getComputedStyle(node).fontFamily,
          overflow: document.documentElement.scrollWidth > innerWidth, fonts: document.fonts.status};
      });
      assert.ok(geometry.width >= 44 && geometry.height >= 44);
      assert.match(geometry.font, /monospace/i);
      assert.equal(geometry.overflow, false);
      assert.equal(geometry.fonts, 'loaded');
      const notice = module.name === 'CrisisReportPanel'
        ? current.getByRole('complementary', {name: 'Crisis report unavailable'}) : main;
      const reloadGeometry = await notice.getByRole('button', {name: /^Reload console$/i}).evaluate(node => {
        const rect = node.getBoundingClientRect();
        return {width: rect.width, height: rect.height, font: getComputedStyle(node).fontFamily};
      });
      assert.ok(reloadGeometry.width >= 44 && reloadGeometry.height >= 44,
        'The visible reload action must retain a 44-pixel touch target.');
      assert.match(reloadGeometry.font, /monospace/i);
      const alertGeometry = await alert.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const header = document.querySelector('.app-header')?.getBoundingClientRect();
        return {top: rect.top, headerBottom: header?.bottom ?? 0};
      });
      assert.ok(alertGeometry.top >= alertGeometry.headerBottom,
        'The failure notice must remain readable below the persistent header.');
      await current.screenshot({path: `${evidence}/${module.name}-${viewport.width}x${viewport.height}-rejected.png`});
      await back.focus();
      await current.keyboard.press('Enter');
      await current.waitForURL('**/#/console');
      const retained = await current.evaluate(() => JSON.parse(localStorage.getItem('dow-new-eden-session')).state);
      assert.equal(retained.session?.id, fixture.session.id);
      assert.equal(retained.me?.uid, fixture.me.uid);
      result.rejectedCases.push({module: module.name, viewport, rejectionContained: true,
        routedReturnRetained: true, keyboardBack: true, fixtureIdentityRetained: true,
        geometry, reloadGeometry, alertGeometry});
      await context.close();
    }
  }
  assert.equal(result.deliberateModuleRejections.length, 12);
  assert.deepEqual(result.pageErrors, []);
  result.completedAt = new Date().toISOString();
  await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2)+'\n');
  console.log(`PASS deferred modules: landing isolation, ${result.cases.length} pending and ${result.rejectedCases.length} rejection/keyboard Back cases. Remote requests are blocked; this is not authenticated gameplay.`);
} catch (error) {
  if (currentProofPage && !currentProofPage.isClosed()) {
    result.failure = {message: error.message, url: currentProofPage.url(),
      visibleText: await currentProofPage.locator('body').innerText(),
      fixtureState: await currentProofPage.evaluate(() => localStorage.getItem('dow-new-eden-session'))};
    await currentProofPage.screenshot({path: `${evidence}/failure.png`});
  }
  await writeFile(`${evidence}/failure.json`, JSON.stringify(result, null, 2)+'\n');
  throw error;
} finally {
  await browser.close();
  await new Promise(done => server.httpServer.close(done));
}
