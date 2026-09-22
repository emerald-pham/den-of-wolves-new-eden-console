import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = resolve(process.env.PROMPT_592_EVIDENCE_DIR ?? '/tmp/p592-render');
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1440, height: 900 },
];
async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolvePromise); });
  const address = server.address();
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return address.port;
}
async function waitForHttp(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function persistedState(now) {
  const session = {
    id: 'prompt-592-render', name: 'Craft help review', joinCode: '5920', phase: 'casting', ownerUid: 'prompt-592-player',
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), currentTurn: 0,
    activeRoleIds: ['wing-commander'],
  };
  const me = { uid: 'prompt-592-player', sessionId: session.id, displayName: 'Wing Commander', role: 'player', assignedRoleId: 'wing-commander', seatId: null, joinedAt: new Date(now).toISOString() };
  return JSON.stringify({ state: { session, me, gmInstance: null, pendingCommands: [], mode: 'console', lastRoute: '/roles' }, version: 1 });
}
async function main() {
  mkdirSync(OUT, { recursive: true });
  const port = await freePort(); const appUrl = `http://127.0.0.1:${port}`;
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], { cwd: ROOT, env: { ...process.env, BROWSER: 'none' }, stdio: 'ignore' });
  let browser;
  try {
    await waitForHttp(appUrl);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const now = Date.now();
      await context.addInitScript(({ state, timestamp }) => {
        localStorage.setItem('dow-new-eden-session', state);
        localStorage.setItem('dow-new-eden-session-waiver', String(timestamp));
        localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ acknowledgedAt: timestamp, choice: 'full' }));
      }, { state: persistedState(now), timestamp: now });
      const page = await context.newPage();
      await page.goto(`${appUrl}/#/roles`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Connect this device' }).waitFor({ state: 'visible', timeout: 12_000 });
      await page.evaluate(async () => {
        const { useSessionStore } = await import('/src/store/useSessionStore.ts');
        useSessionStore.getState().setRoleBrief({
          assignmentUid: 'prompt-592-player', roleId: 'wing-commander', roleName: 'Wing Commander', vesselName: 'AEGIS',
          text: 'Operate the fighter wings.', commonRules: 'Keep this brief private.',
          ownedCraftIds: ['starlight', 'fighter-wing-alpha', 'fighter-wing-bravo'], setupRevision: 1,
        });
        window.location.hash = '#/brief';
      });
      const title = page.getByRole('heading', { name: 'Wing Commander' });
      await title.waitFor({ state: 'visible', timeout: 12_000 });
      const measurement = await page.getByRole('heading', { name: 'Fighter Wing Alpha' }).locator('..').evaluate((element) => ({
        text: element.textContent?.replace(/\s+/g, ' ').trim(),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        fontFamily: getComputedStyle(element.querySelector('h3')).fontFamily,
        rect: (() => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right }; })(),
      }));
      if (!/Printed owner.*Wing Commander.*Phase rules.*Action rules/i.test(measurement.text ?? '')) throw new Error(`${viewport.name}: owner/phase/action copy missing: ${measurement.text}`);
      if (!/Combat rules/i.test(measurement.text ?? '')) throw new Error(`${viewport.name}: combat copy missing: ${measurement.text}`);
      if (!/Oxanium|Share Tech Mono|monospace/i.test(measurement.fontFamily)) throw new Error(`${viewport.name}: craft help lost console font: ${measurement.fontFamily}`);
      if (measurement.scrollWidth > viewport.width + 1 || measurement.rect.left < -1 || measurement.rect.right > viewport.width + 1) throw new Error(`${viewport.name}: craft help overflows: ${JSON.stringify(measurement)}`);
      await page.screenshot({ path: resolve(OUT, `role-brief-craft-help-${viewport.width}x${viewport.height}.png`), fullPage: false });
      console.log(`Prompt 592 rendered proof passed: ${viewport.name} ${viewport.width}x${viewport.height}`);
      await context.close();
    }
  } finally { await browser?.close(); vite.kill('SIGTERM'); }
}
await main();
