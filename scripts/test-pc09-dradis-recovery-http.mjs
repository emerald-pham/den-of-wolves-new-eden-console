import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const uiUrl = process.env.PC09_DRADIS_UI_URL;
const evidencePath = process.env.PC09_DRADIS_EVIDENCE_PATH;
assert.ok(uiUrl && evidencePath, 'The isolated app URL and external evidence path are required.');
await mkdir(dirname(evidencePath), { recursive: true });
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
let f, eo;
let storeModule = '/src/store/useSessionStore.ts';
let firestoreModule = '/src/lib/firestore.ts';
const checks = {}, diagnostics = [], requests = [], renderChecks = [], browserErrors = [];
page.on('pageerror', error => browserErrors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (url.pathname === '/src/store/useSessionStore.ts') storeModule = url.href;
  if (url.pathname === '/src/lib/firestore.ts') firestoreModule = url.href;
});
page.on('response', response => {
  const url = new URL(response.url());
  if (url.pathname.endsWith('/readFleetGroupNavigation')) requests.push({ endpoint: 'readFleetGroupNavigation', status: response.status() });
});
async function identity() {
  return page.evaluate(async ({ module, expectedActor, expectedSession }) => {
    const [{ auth }, { useSessionStore }] = await Promise.all([import('/src/lib/firebase.ts'), import(module)]);
    const s = useSessionStore.getState();
    return { sameActor: auth().currentUser?.uid === expectedActor && s.me?.uid === expectedActor,
      sameSession: s.session?.id === expectedSession && s.me?.sessionId === expectedSession,
      route: location.hash, phase: s.session?.phase, role: s.me?.assignedRoleId,
      activeConsole: s.me?.activeConsoleRoleId, group: s.me?.fleetGroupId,
      connection: s.connection, freshness: s.sessionSnapshotFreshness,
      navigationRevision: s.session?.playerDiscovery?.revision,
      partitionRevision: s.session?.fleetPartitionRevision,
      hydrationRevision: s.identityHydrationRevision,
      online: navigator.onLine, headings: Array.from(document.querySelectorAll('h1, h2'))
        .map(h => h.textContent).filter(text => /^(AEGIS|Wolf attack|Executive Officer|Stations and consoles|Fleet group \/\/ fleet-\d+)$/.test(text)),
      plotPresent: Boolean(document.querySelector('.ship-plot[data-aboard="true"]')),
      localFixUnavailable: Boolean(Array.from(document.querySelectorAll('.ship-plot__label')).find(e => e.textContent.includes('UNAVAILABLE'))),
      panelPresent: Boolean(document.querySelector('.wolf-attack-dradis')) };
  }, { module: storeModule, expectedActor: eo?.localId, expectedSession: f?.sessionId });
}
async function until(label, ready, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await identity();
    if (ready(state)) return state;
    await delay(250);
  }
  diagnostics.push({ label, state: await identity() });
  throw new Error(`${label} did not become ready.`);
}
async function sample(label) {
  const state = await identity();
  const navigation = await page.evaluate(async () => {
    try {
      const { readFleetGroupNavigation } = await import('/src/lib/fleetGroupService.ts');
      const n = await readFleetGroupNavigation();
      return { accepted: true, group: n.groupId, revision: n.navigationRevision,
        shipIds: n.ships.map(s => s.shipId), localViewerPresent: n.ships.some(s => s.shipId === 'aegis' && s.fleetGroupId === n.groupId) };
    } catch (error) { return { accepted: false, code: error.code ?? null, message: error.message }; }
  });
  const member = await page.evaluate(async ({ module, sessionId }) => {
    const { subscribeWolfAttackMemberView } = await import(module);
    return new Promise(resolve => {
      let latest = { received: false }, unsubscribe = () => {};
      const timer = setTimeout(() => { unsubscribe(); resolve(latest); }, 3500);
      unsubscribe = subscribeWolfAttackMemberView(sessionId, view => {
        latest = { received: true, accepted: Boolean(view), revision: view?.revision ?? null,
          status: view?.status ?? null, step: view?.currentStep ?? null, results: view?.results.length ?? 0 };
        if (view) { const accepted = latest; clearTimeout(timer); unsubscribe(); resolve(accepted); }
      });
    });
  }, { module: firestoreModule, sessionId: f.sessionId });
  const trace = await page.evaluate(() => window.__pc09RecoveryTrace ?? []);
  diagnostics.push({ label, state, navigation, member, trace, requests: requests.splice(0) });
}
async function joinThroughUi(joinCode) {
  await page.goto(uiUrl);
  await page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
  await waiver.waitFor();
  const acknowledgements = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
  await acknowledgements.first().waitFor();
  for (let index = 0; index < await acknowledgements.count(); index += 1) await acknowledgements.nth(index).check();
  await waiver.getByRole('status').getByText('FINAL CONFIRMATION READY', { exact: true }).waitFor();
  await waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true }).click();
  await until('ordinary browser join', state => Boolean(state.phase));
  return page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
}
async function command(actor, name, data = {}) {
  const reply = f.ok(await f.call(actor, name, { sessionId: f.sessionId, ...data }), name);
  assert.notEqual(reply.status, 'stale');
  return reply;
}
async function chooseEo() {
  await page.goto(`${uiUrl}/#/console`);
  await page.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor();
  await page.evaluate(async module => {
    const { useSessionStore } = await import(module);
    window.__pc09RecoveryTrace = [];
    let previous;
    useSessionStore.subscribe(s => {
      const value = { hydrationRevision: s.identityHydrationRevision, navigationRevision: s.session?.playerDiscovery?.revision ?? null,
        activeConsole: s.me?.activeConsoleRoleId ?? null, group: s.me?.fleetGroupId ?? null,
        connection: s.connection, freshness: s.sessionSnapshotFreshness };
      const fingerprint = JSON.stringify(value);
      if (fingerprint !== previous) { previous = fingerprint; window.__pc09RecoveryTrace.push(value); }
    });
  }, storeModule);
  await page.getByRole('link', { name: 'AEGIS // Executive Officer // HELD BY YOU', exact: true }).click();
  await until('current ordinary EO console', state => state.sameActor && state.sameSession &&
    state.activeConsole === 'executive-officer' && state.connection === 'live' && state.freshness === 'server');
  await page.getByRole('heading', { name: 'AEGIS', exact: true }).waitFor();
}
try {
  f = await createPc07AuthenticatedSession('PC09 DRADIS reconnect', 20, {
    keepAlive: true, expansion: 'capybara', browserRoleId: 'executive-officer', joinBrowserPlayer: joinThroughUi,
  });
  eo = f.byRole('executive-officer');
  const phase = (await f.session.get()).get('turnPhase');
  await f.session.update({ turnPhase: { ...phase, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600_000).toISOString() } });
  await command(eo, 'beginOpenAirspacePhase', { expectedTurn: 1 });
  await command(f.gm, 'setWolfAttackWindow', { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: 0, status: 'due' });
  const prepared = await command(f.gm, 'stageWolfAttackPreparation', { instanceId: f.instanceId, requestId: randomUUID(),
    expectedRevision: 0, turn: 1, shipIds: [...Array(10).fill('wolf-fighter-wing'), ...Array(5).fill('wolf-assault-transport')],
    targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '' });
  await command(f.gm, 'declareWolfAttack', { instanceId: f.instanceId, requestId: randomUUID(), expectedRevision: prepared.revision });
  await chooseEo();
  const dradis = page.locator('.wolf-attack-dradis');
  await dradis.waitFor({ state: 'visible', timeout: 30_000 });
  await sample('initial declared attack');
  checks.initialOrdinaryAuthProjection = true;
  await context.setOffline(true);
  await until('offline withdrawal', state => state.connection === 'offline' && !state.panelPresent);
  checks.offlineWithdraws = true;
  await context.setOffline(false);
  await until('online recovery without reload', state => state.sameActor && state.sameSession &&
    state.connection === 'live' && state.freshness === 'server');
  await dradis.waitFor({ state: 'visible', timeout: 15_000 });
  await sample('online recovered local fix and attack');
  checks.onlineReacquires = true;
  await command(eo, 'resumeSession');
  await command(eo, 'refreshPresence', { activeConsoleRoleId: 'executive-officer' });
  await page.reload();
  await until('same actor server reload', state => state.sameActor && state.sameSession &&
    state.role === 'executive-officer' && state.connection === 'live' && state.freshness === 'server');
  await chooseEo();
  await dradis.waitFor({ state: 'visible', timeout: 15_000 });
  await sample('same actor recovered reload and ordinary reselection');
  checks.sameActorReloadReacquires = true;

  for (const path of ['', '/wolfAttackState/current', '/wolfAttackPreparation/current', '/serverState/pdfEscortWing']) {
    const response = await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}${path}`,
      { headers: { Authorization: `Bearer ${eo.idToken}` } });
    assert.equal(response.status, 403, 'The ordinary player cannot read private session or attack authority.');
  }
  const audienceUrl = `http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${f.sessionId}/wolfAttackAudience/current`;
  assert.equal((await fetch(audienceUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${eo.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { revision: { integerValue: '999' } } }) })).status, 403,
  'The ordinary player cannot write the authoritative attack projection.');
  checks.privateReadsAndProjectionWritesDenied = true;

  await page.getByRole('button', { name: 'Zoom into DRADIS panel', exact: true }).click();
  const readings = dradis.getByRole('region', { name: 'Wolf attack committed readings', exact: true });
  await readings.waitFor({ state: 'visible' });
  await readings.focus();
  assert.equal(await readings.evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await readings.evaluate(element => element === document.activeElement), false);
  checks.keyboardFocusContinues = true;
  for (const mode of ['reduced', 'normal']) {
    await page.getByRole('button', { name: 'Close DRADIS', exact: true }).click();
    await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Reduce motion', exact: true }).setChecked(mode === 'reduced');
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom into DRADIS panel', exact: true }).click();
    await readings.waitFor({ state: 'visible' });
    for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      const metrics = await page.evaluate(() => {
        const panel = document.querySelector('.wolf-attack-dradis');
        const list = document.querySelector('.wolf-attack-dradis__readings');
        const close = document.querySelector('.ship-plot__close');
        const plot = document.querySelector('.contact-plot__sweep');
        const rect = panel.getBoundingClientRect(), control = close.getBoundingClientRect();
        const font = getComputedStyle(panel);
        return { documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth,
          panelWidth: rect.width, panelHeight: rect.height, fontFamily: font.fontFamily, fontSize: parseFloat(font.fontSize),
          readingsHeight: list.clientHeight, scroll: getComputedStyle(list).overflowY,
          closeWidth: control.width, closeHeight: control.height, sweepDuration: getComputedStyle(plot).animationDuration,
          motion: document.querySelector('[data-motion]').getAttribute('data-motion') };
      });
      assert.ok(metrics.documentWidth <= metrics.viewportWidth, `${mode} ${width}x${height} must fit the viewport.`);
      assert.ok(metrics.panelWidth > 0 && metrics.panelHeight > 0 && metrics.readingsHeight > 0);
      assert.match(metrics.fontFamily, /mono|courier|menlo|consolas/i);
      assert.ok(metrics.fontSize >= 13);
      assert.equal(metrics.scroll, 'auto');
      assert.ok(metrics.closeWidth >= 24 && metrics.closeHeight >= 24);
      assert.equal(metrics.motion, mode === 'reduced' ? 'reduce' : 'full');
      if (mode === 'reduced') assert.equal(metrics.sweepDuration, '0s');
      renderChecks.push({ mode, width, height, ...metrics });
      // Crop only the entitled attack instrument, excluding private role/loyalty panels.
      await dradis.screenshot({ path: `${dirname(evidencePath)}/${mode}-${width}x${height}-attack.png` });
    }
  }
  checks.fourViewportFontsMotionScrollAndTouch = true;
  await page.getByRole('button', { name: 'Close DRADIS', exact: true }).click();
  await page.getByRole('link', { name: 'View ship consoles', exact: true }).click();
  await page.getByRole('heading', { name: 'AEGIS // Station overview', exact: true }).waitFor();
  await dradis.waitFor({ state: 'detached' });
  await page.getByRole('link', { name: 'Back to fleet', exact: true }).click();
  await page.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor();
  await dradis.waitFor({ state: 'detached' });
  await page.getByRole('link', { name: 'AEGIS // Executive Officer // HELD BY YOU', exact: true }).click();
  await dradis.waitFor({ state: 'visible' });
  await page.goBack({ waitUntil: 'commit' });
  await dradis.waitFor({ state: 'detached' });
  await page.goForward({ waitUntil: 'commit' });
  await dradis.waitFor({ state: 'visible' });
  checks.visibleParentAndBrowserBackForward = true;

  assert.deepEqual(browserErrors, []);
  assert.deepEqual(f.heartbeatFailures, []);
  await command(f.gm, 'kickPlayer', { instanceId: f.instanceId, targetUid: eo.localId, requestId: randomUUID() });
  await until('membership revocation withdraws the instrument', state => !state.sameSession && !state.panelPresent);
  assert.equal((await fetch(audienceUrl, { headers: { Authorization: `Bearer ${eo.idToken}` } })).status, 403,
    'A revoked member cannot read the attack projection.');
  assert.notEqual((await f.call(eo, 'resumeSession', { sessionId: f.sessionId })).status, 200,
    'The same revoked identity cannot resume the session.');
  checks.membershipRevocationRemainsClosed = true;
  await writeFile(evidencePath, `${JSON.stringify({ sourceCommit, checks, diagnostics, renderChecks,
    browserErrorCount: browserErrors.length,
    preparedScene: false, productionGameplay: false, fixtureChanges: ['disposable clock deadlines only'],
    identitiesRetained: false, completedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log('Normal authenticated P605 DRADIS reconnect proof passed.');
} catch (error) {
  if (f && eo) await sample('failure diagnostic').catch(() => {});
  await writeFile(`${evidencePath}.failure.json`, `${JSON.stringify({ sourceCommit, message: error.message,
    checks, diagnostics, identitiesRetained: false }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
  if (f) { await f.cleanup(); await f.db.terminate(); }
}
