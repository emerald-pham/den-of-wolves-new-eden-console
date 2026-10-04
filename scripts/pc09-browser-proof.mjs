import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

/** Ordinary browser joins. Authentication remains in memory and is never
 * injected into storage or serialized in evidence. Track Vite's actual module
 * URL so a reloaded/HMR store cannot masquerade as current browser authority. */
export async function createPc09BrowserProof(baseUrl, {
  width = 390,
  height = 844,
  reducedMotion = 'reduce',
} = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  let storeModuleUrl = '/src/store/useSessionStore.ts';
  let firestoreModuleUrl = '/src/lib/firestore.ts';
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts') storeModuleUrl = url.href;
    if (url.pathname === '/src/lib/firestore.ts') firestoreModuleUrl = url.href;
  });

  async function identity() {
    return page.evaluate(async moduleUrl => {
      const { auth } = await import('/src/lib/firebase.ts');
      const { useSessionStore } = await import(moduleUrl);
      const state = useSessionStore.getState();
      return {
        uid: auth().currentUser?.uid,
        memberUid: state.me?.uid,
        sessionId: state.session?.id,
        roleId: state.me?.assignedRoleId,
        replacementRoleId: state.me?.replacementRoleId,
        activeConsoleRoleId: state.me?.activeConsoleRoleId,
        connection: state.connection,
        freshness: state.sessionSnapshotFreshness,
      };
    }, storeModuleUrl);
  }

  async function untilIdentity(label, ready, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await identity();
      if (ready(state)) return state;
      await delay(250);
    }
    // Report state categories only, never authentication material.
    const state = await identity();
    throw new Error(`${label} did not become ready: ${JSON.stringify({
      sameActor: state.uid === state.memberUid,
      hasSession: Boolean(state.sessionId),
      roleId: state.roleId,
      activeConsoleRoleId: state.activeConsoleRoleId,
      connection: state.connection,
      freshness: state.freshness,
    })}`);
  }

  async function join(joinCode) {
    await page.goto(baseUrl);
    const motion = page.getByRole('button', { name: /^REDUCED MOTION/i });
    if (await motion.isVisible()) await motion.click();
    await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
    await page.getByRole('button', { name: 'Join a session', exact: true }).click();
    const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
    await waiver.waitFor();
    const regulations = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
    await regulations.first().waitFor();
    for (const checkbox of await regulations.all()) await checkbox.check();
    const acknowledge = waiver.getByRole('button', {
      name: 'Acknowledge regulations and continue', exact: true,
    });
    await acknowledge.and(page.locator(':enabled')).waitFor();
    await acknowledge.click();
    await untilIdentity('ordinary joined player', state =>
      Boolean(state.uid && state.uid === state.memberUid && state.sessionId));
    return page.evaluate(async () => {
      const { auth } = await import('/src/lib/firebase.ts');
      const current = auth().currentUser;
      if (!current) throw new Error('The ordinary browser join has no authenticated actor.');
      return { localId: current.uid, idToken: await current.getIdToken() };
    });
  }

  async function assertGeometry() {
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(metrics.document <= metrics.viewport && metrics.body <= metrics.viewport,
      `The current browser route overflows: ${JSON.stringify(metrics)}`);
    return metrics;
  }

  return {
    browser, context, page, errors, join, identity, untilIdentity, assertGeometry,
    moduleUrls: () => ({ storeModuleUrl, firestoreModuleUrl }),
  };
}
