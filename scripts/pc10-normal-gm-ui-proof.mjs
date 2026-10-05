import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.PC10_UI_URL ?? 'http://127.0.0.1:5174';
const directory = process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/normal-gm-ui';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname), 'Local UI only.');
assert.match(process.env.VITE_FIREBASE_PROJECT_ID ?? '', /^demo-[a-z0-9-]+$/, 'Demo emulator project only.');
await mkdir(directory, { recursive: true });
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const builtRuntimeIndexSha256 = createHash('sha256').update(await readFile('functions/lib/index.js')).digest('hex');
const browsers = [];
const surfaces = [];
const errors = [];
const calls = [];
let stage = 'launch';

async function surface(label) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  browsers.push(browser);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  page.setDefaultNavigationTimeout(25_000);
  let storeUrl = '/src/store/useSessionStore.ts';
  let sdkUrl = '/node_modules/.vite/deps/firebase_functions.js';
  page.on('pageerror', error => errors.push({ surface: label, message: error.message }));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts') storeUrl = url.href;
    if (url.pathname.endsWith('/firebase_functions.js')) sdkUrl = url.href;
  });
  page.on('response', response => {
    const url = new URL(response.url());
    const endpoint = url.pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
    if (endpoint && response.request().method() === 'POST') {
      calls.push({ surface: label, endpoint, transport: 'actual browser Firebase SDK',
        status: response.status(), completedAt: new Date().toISOString() });
    }
  });
  async function observe() {
    return page.evaluate(async moduleUrl => {
      const { auth } = await import('/src/lib/firebase.ts');
      const { useSessionStore } = await import(moduleUrl);
      const state = useSessionStore.getState();
      return { hasAuth: !!auth().currentUser, sameActor: state.me?.uid === auth().currentUser?.uid,
        sessionId: state.session?.id ?? null, joinCode: state.session?.joinCode ?? null,
        cycle: state.session?.currentTurn ?? null, phase: state.session?.phase ?? null,
        playerRole: state.me?.role ?? null, connection: state.connection,
        freshness: state.sessionSnapshotFreshness,
        gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === state.me?.uid &&
          state.gmInstance.sessionId === state.session?.id,
        setupConfirmed: state.session?.setupConfirmed ?? false,
        instanceId: state.gmInstance?.id ?? null };
    }, storeUrl);
  }
  async function until(description, predicate) {
    const deadline = Date.now() + 35_000;
    let current;
    while (Date.now() < deadline) {
      current = await observe();
      if (predicate(current)) return current;
      await delay(250);
    }
    throw new Error(`${description}: ${JSON.stringify(current)}`);
  }
  async function consent() {
    const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
    await waiver.waitFor();
    const checks = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
    assert.equal(await checks.count(), 3);
    for (const checkbox of await checks.all()) await checkbox.check();
    const button = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
    const deadline = Date.now() + 30_000;
    while (!(await button.isEnabled()) && Date.now() < deadline) await delay(100);
    assert.equal(await button.isEnabled(), true, 'Normal consent timer and all regulations remain required.');
    await button.click();
    await waiver.waitFor({ state: 'hidden' });
  }
  async function callable(name, data) {
    return page.evaluate(async ({ name, data, sdkUrl }) => {
      const { functions } = await import('/src/lib/firebase.ts');
      const { httpsCallable } = await import(sdkUrl);
      try { return { status: 'committed', result: (await httpsCallable(functions(), name)(data)).data }; }
      catch (error) { return { status: 'denied', code: error.code }; }
    }, { name, data, sdkUrl });
  }
  const result = { label, page, context, observe, until, consent, callable };
  surfaces.push(result);
  return result;
}

try {
  const gm = await surface('browser-A-GM');
  const crew = await surface('browser-B-ordinary-join');
  stage = 'fresh normal create and consent';
  await gm.page.goto(baseUrl);
  await gm.page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await gm.page.getByRole('button', { name: 'Create a session', exact: true }).click();
  await gm.consent();
  const initial = await gm.until('Cycle 0 ordinary joined identity', state => state.hasAuth && state.sameActor &&
    state.sessionId && state.cycle === 0 && state.freshness === 'server');
  assert.equal(initial.gmInstanceOwned, false);
  assert.ok((await gm.page.locator('body').innerText()).includes('AWAITING CIC HANDSHAKE'));
  stage = 'normal Settings GM authorization';
  await gm.page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = gm.page.getByRole('dialog', { name: 'Session settings', exact: true });
  assert.ok((await settings.innerText()).includes('Awaiting CIC handshake means waiting for the GM to start the game.'));
  // Verify the ordinary joined QR before starting a timed briefing. The old
  // post-start full-page capture could be occluded by the normal transmission.
  const joinLink = settings.getByRole('link', { name: `Open join screen for session ${initial.joinCode}`, exact: true });
  const joinUrl = await joinLink.getAttribute('href');
  const parsedJoin = new URL(joinUrl);
  assert.equal(parsedJoin.search, '', 'No local GM or persona data is forwarded.');
  assert.equal(parsedJoin.hash, `#/?joinCode=${initial.joinCode}`);
  const qr = settings.getByRole('img', { name: `QR code for session ${initial.joinCode}`, exact: true });
  const qrGeometry = [];
  for (const [name, viewport] of [['phone320', { width: 320, height: 844 }],
    ['phone390', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }],
    ['landscape', { width: 844, height: 390 }]]) {
    await gm.page.setViewportSize(viewport);
    await qr.scrollIntoViewIfNeeded();
    const geometry = await qr.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { left: rect.left, right: rect.right, width: rect.width, height: rect.height,
        viewport: innerWidth, visibleAtCenter: center === element || element.contains(center),
        documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth };
    });
    assert.equal(geometry.visibleAtCenter, true, 'The actual rendered QR must be unobscured.');
    assert.ok(geometry.left >= 0 && geometry.right <= viewport.width + 1);
    assert.ok(geometry.documentWidth <= viewport.width + 1 && geometry.bodyWidth <= viewport.width + 1);
    qrGeometry.push({ name, viewport, ...geometry });
    await qr.screenshot({ path: `${directory}/ordinary-qr-${name}.png` });
    await gm.page.screenshot({ path: `${directory}/ordinary-settings-${name}.png` });
  }
  await gm.page.setViewportSize({ width: 1440, height: 900 });
  await writeFile(`${directory}/ordinary-qr-payload.json`, `${JSON.stringify({ payload: joinUrl }, null, 2)}\n`);
  await settings.getByRole('button', { name: 'Authorize local emulator GM', exact: true }).click();
  await settings.getByRole('button', { name: 'Revoke GM access', exact: true }).waitFor();
  await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
  stage = 'normal named GM instance admission';
  await gm.page.getByRole('link', { name: /GM join$/i }).click();
  await gm.page.getByLabel('Input GM Name', { exact: true }).fill('PC10 local GM UI');
  await gm.page.getByRole('button', { name: 'Join as GM', exact: true }).click();
  const ownedGm = await gm.until('Live owned GM instance', state => state.playerRole === 'gm' &&
    state.gmInstanceOwned && state.connection === 'live' && state.freshness === 'server');
  if (!(await gm.page.getByRole('region', { name: 'Setup', exact: true }).isVisible())) {
    await gm.page.getByRole('button', { name: /^Open station catalog/ }).click();
    await gm.page.getByRole('link', { name: 'GM Console', exact: true }).click();
  }
  stage = 'normal setup confirmation';
  const setup = gm.page.getByRole('region', { name: 'Setup', exact: true });
  await setup.getByRole('button', { name: 'Setup', exact: true }).click();
  await setup.getByRole('button', { name: 'Confirm setup // Confirm roster', exact: true }).click();
  const confirmed = await gm.until('Confirmed locked normal roster', state => state.setupConfirmed && state.cycle === 0);
  await gm.page.screenshot({ path: `${directory}/cycle-zero-confirmed.png` });
  stage = 'normal UI start Cycle 0 to 1';
  await setup.getByRole('button', { name: 'Start production // Advance to Cycle 1', exact: true }).click();
  await setup.getByRole('button', { name: 'ARE YOU SURE? // ADVANCE TO CYCLE 1', exact: true }).click();
  const started = await gm.until('Committed ordinary Cycle 1', state => state.cycle === 1 && state.phase === 'active' &&
    state.playerRole === 'gm' && state.gmInstanceOwned);
  await gm.page.screenshot({ path: `${directory}/cycle-one-gm.png` });
  stage = 'Browser B ordinary link admission and consent';
  await crew.page.goto(joinUrl);
  await crew.page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  assert.equal(await crew.page.getByRole('textbox', { name: 'Session code', exact: true }).inputValue(), initial.joinCode);
  await crew.page.getByRole('button', { name: 'Join a session', exact: true }).click();
  await crew.consent();
  const ordinary = await crew.until('Ordinary QR link member', state => state.hasAuth && state.sameActor &&
    state.sessionId === initial.sessionId && state.cycle === 1 && state.freshness === 'server');
  assert.equal(ordinary.playerRole, 'player');
  assert.equal(ordinary.gmInstanceOwned, false);
  const denial = await crew.callable('startGame', { sessionId: initial.sessionId, instanceId: ownedGm.instanceId,
    requestId: randomUUID(), expectedSetupRevision: 0 });
  assert.equal(denial.status, 'denied', 'Ordinary admission must not acquire another member’s GM authority.');
  assert.equal((await crew.observe()).gmInstanceOwned, false);
  await crew.page.screenshot({ path: `${directory}/ordinary-joined.png` });
  assert.deepEqual(errors, []);
  const checks = { actualNormalSettingsGmAuth: true, ownedNamedLiveGmInstance: true,
    realUiCycleZeroToOne: true, existingCicCopyPreserved: true, ordinaryQrEquivalentLink: true,
    normalCodePrefill: true, ordinaryAuthAndUnchangedConsent: true, ordinaryMemberHasNoGmCapability: true };
  await writeFile(`${directory}/evidence.json`, `${JSON.stringify({ schemaVersion: 1, sourceCommit,
    builtRuntimeIndexSha256, recordedAt: new Date().toISOString(), status: 'passed', checks,
    actualBrowserProcesses: 2, actualBrowserContexts: 2, actualAuthenticatedActors: 2,
    normalStartOccupiedCoreActors: 0, sourceSupportedSparseStart: true,
    manualFullGameDressRehearsal: false, wholeGameProof: false, humanDevicePlaytest: false,
    adminGameplayWrites: false, localOnlyGmAuthorization: 'Existing explicitly opted-in loopback demo grant UI',
    initial, confirmed, started, ordinary, qrGeometry, qrCapturedBeforeGmGrant: true,
    authorityDenialCode: denial.code, calls, errors }, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'passed', sourceCommit, directory, checks }));
} catch (error) {
  const states = await Promise.all(surfaces.map(async item => ({ surface: item.label,
    state: await item.observe().catch(cause => ({ unavailable: cause.message })), url: item.page.url() })));
  for (const item of surfaces) await item.page.screenshot({ path: `${directory}/${item.label}-failure.png` }).catch(() => undefined);
  await writeFile(`${directory}/failure.json`, `${JSON.stringify({ status: 'failed', sourceCommit,
    builtRuntimeIndexSha256, stage, message: error.message, states, calls, errors }, null, 2)}\n`);
  console.error(JSON.stringify({ status: 'failed', stage, message: error.message, directory }));
  process.exitCode = 1;
} finally {
  for (const browser of browsers) await browser.close();
}
