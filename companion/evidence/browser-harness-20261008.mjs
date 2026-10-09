import { chromium } from '/private/tmp/dow-pc09-execution-20261004/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { reserveEmulatorSlot, releaseEmulatorSlot } from '/Users/emeraldpham/Documents/Codex/2026-10-08/task-14/casting-companion/scripts/emulator-resource-registry.mjs';
const worktree = '/Users/emeraldpham/Documents/Codex/2026-10-08/task-14/casting-companion';
const artifacts = '/tmp/dow-casting-qualification-20261008';
const start = Date.now(), stop = Date.parse('2026-10-08T23:48:00Z');
assert.ok(start >= Date.parse('2026-10-08T23:36:00Z') && start < stop, 'outside allocated browser window');
const reservation = await reserveEmulatorSlot({ slot: 5, worktree, kind: 'vite', command: 'synthetic casting qualification static server + one Chromium', ports: [5178] });
let browser, server, context, currentPage;
const report = { startedAt: new Date().toISOString(), source: '71e9815f + reduced-motion CSS working diff', manifest: 'companion/evidence/standalone-build-manifest.json', scope: 'Unchanged builder/owner responses/characters/settings/intro only. Prior recipient-auth assignment/dossier flow excluded after bearer-link steering.', cases: [], failures: [], errors: [] };
const guard = setTimeout(() => { browser?.close().catch(() => {}); server?.close(); }, Math.min(11 * 60000, stop - start));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  if (name.endsWith('reduced-intro')) { await page.screenshot({ path: `${artifacts}/${name}-viewport.png` }); }
  await writeFile(`${artifacts}/${name}.aria.txt`, await page.locator('body').ariaSnapshot());
  const metrics = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
    focused: { tag: document.activeElement.tagName, text: document.activeElement.textContent.slice(0, 120) },
    elements: [...document.querySelectorAll('h1,h2,button,input,select,textarea,label,[role="alert"]')].filter(el => el.getBoundingClientRect().width && getComputedStyle(el).display !== 'none').map(el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      return { tag: el.tagName, type: el.type, text: (el.textContent || el.value || '').slice(0, 100), family: style.fontFamily, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor, x: rect.x, y: rect.y, width: rect.width, height: rect.height, controlTargetHeight: ['checkbox','radio'].includes(el.type) ? el.closest('label')?.getBoundingClientRect().height : rect.height };
    }),
  }));
  const session = await page.context().newCDPSession(page); await session.send('DOM.enable'); await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument');
  const fonts = {};
  for (const selector of ['h1', 'button', 'label']) {
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (nodeId) fonts[selector] = await session.send('CSS.getPlatformFontsForNode', { nodeId });
  }
  await session.detach();
  metrics.platformFonts = fonts; report.cases.push({ name, ...metrics });
  if (metrics.scrollWidth > metrics.viewport.width + 1) report.failures.push(`${name}: horizontal overflow ${metrics.scrollWidth}>${metrics.viewport.width}`);
  for (const el of metrics.elements) if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(el.tag) && el.controlTargetHeight < 43.5) report.failures.push(`${name}: ${el.tag}/${el.type} target ${el.controlTargetHeight}px`);
}
try {
  server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const file = resolve(worktree, 'companion-dist', path === '/' ? 'index.html' : path.slice(1));
      if (!file.startsWith(resolve(worktree, 'companion-dist') + '/')) throw new Error('outside root');
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); response.end(await readFile(file));
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5178, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  for (const configuration of [
    { name: 'phone', viewport: { width: 390, height: 844 } },
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'landscape', viewport: { width: 844, height: 390 } },
    { name: 'phone-large-text', viewport: { width: 390, height: 844 }, largeText: true },
  ]) {
    context = await browser.newContext({ viewport: configuration.viewport, reducedMotion: 'reduce' });
    const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(5000); page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('dow-casting-synthetic-intro-seen', 'yes'));
    await page.goto('http://127.0.0.1:5178'); await page.getByRole('heading', { name: 'Casting workspace', exact: true }).waitFor();
    if (configuration.largeText) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await capture(page, `${configuration.name}-home`);
    await page.getByRole('button', { name: 'Form builder', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Synthetic casting — 海狼');
    await page.getByRole('button', { name: 'Add question', exact: true }).click();
    await page.getByLabel('Question label', { exact: true }).last().fill('LongUnbrokenQuestion'.repeat(12));
    await page.getByRole('combobox', { name: 'Question type', exact: true }).last().selectOption('multiple');
    await page.getByLabel('Choices — one per line', { exact: true }).last().fill('Pilot, Engineer\n外交官 🐺');
    await capture(page, `${configuration.name}-builder`);
    await page.getByRole('button', { name: 'Preview form', exact: true }).click(); await capture(page, `${configuration.name}-preview`);
    await page.getByRole('button', { name: 'Back to builder', exact: true }).click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Draft saved.' }).waitFor();
    await page.getByRole('button', { name: 'Publish form', exact: true }).click(); await page.getByRole('link', { name: 'Open direct form link' }).waitFor();
    await page.getByRole('button', { name: 'Responses', exact: true }).click(); await capture(page, `${configuration.name}-responses`);
    await page.getByRole('button', { name: 'Characters', exact: true }).click(); await capture(page, `${configuration.name}-characters`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Replay flag intro', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.casting-intro img')].every(img => img.complete && img.naturalWidth > 0));
    await capture(page, `${configuration.name}-reduced-intro`); assert.equal(await page.locator('[data-flag]').count(), 7);
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip intro');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Replay flag intro');
    await context.close(); context = undefined;
  }
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', recordVideo: { dir: `${artifacts}/motion-video`, size: { width: 1440, height: 900 } } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:5178');
  await page.locator('.casting-intro').waitFor();
  const timeline = [];
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(i === 0 ? 350 : 1000);
    timeline.push(await page.locator('[data-flag]').evaluateAll(elements => elements.map(el => ({ flag: el.dataset.flag, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform, imageLoaded: el.querySelector('img').naturalWidth > 0, naturalWidth: el.querySelector('img').naturalWidth, naturalHeight: el.querySelector('img').naturalHeight }))));
    await page.screenshot({ path: `${artifacts}/motion-flag-${i}.png` });
  }
  await page.locator('.casting-intro').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H1');
  await writeFile(`${artifacts}/motion-timeline.json`, JSON.stringify(timeline, null, 2));
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Replay flag intro', exact: true }).click(); await page.getByRole('button', { name: 'Skip intro', exact: true }).click(); assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Replay flag intro'); report.animatedReplaySkip = 'observed';
  const video = page.video(); await context.close(); context = undefined; report.motionVideo = await video.path();
} catch (error) { report.errors.push(error.stack); if (currentPage) { await currentPage.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {}); await writeFile(`${artifacts}/failure.aria.txt`, await currentPage.locator('body').ariaSnapshot()).catch(() => {}); } }
finally {
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await releaseEmulatorSlot(reservation); clearTimeout(guard);
  report.finishedAt = new Date().toISOString(); report.cleanup = 'browser/context/server closed and own runtime reservation released';
  await writeFile(`${artifacts}/browser-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ startedAt: report.startedAt, finishedAt: report.finishedAt, cases: report.cases.length, failures: report.failures, errors: report.errors, cleanup: report.cleanup }));
}
if (report.failures.length || report.errors.length) process.exitCode = 1;
