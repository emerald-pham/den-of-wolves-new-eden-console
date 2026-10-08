import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const root = await realpath(process.cwd());
const output = await mkdtemp(join(tmpdir(), 'dow-mobile-layout-build-'));
const evidence = resolve(process.env.MOBILE_LAYOUT_EVIDENCE ?? '/tmp/dow-mobile-layout-render');
await mkdir(evidence, { recursive: true });
let server, browser;
const results = [];
try {
  await build({ root, logLevel: 'warn', build: {
    outDir: output, emptyOutDir: true,
    rollupOptions: { input: resolve(root, 'scripts/fixtures/mobile-layout.html') },
  } });
  server = await preview({ root, logLevel: 'warn', build: { outDir: output }, preview: { host: '127.0.0.1', port: 0 } });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const cases = process.env.MOBILE_LAYOUT_RED_ONLY === 'true'
    ? [{ width: 390, height: 844, scale: 1.5 }]
    : [{ width: 320, height: 844, scale: 1 }, { width: 390, height: 844, scale: 1 },
      { width: 844, height: 390, scale: 1 }, { width: 390, height: 844, scale: 1.5 }];
  for (const viewport of cases) for (const actor of ['gm', 'player']) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
      isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort('internetdisconnected'));
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/scripts/fixtures/mobile-layout.html?actor=${actor}`);
      await page.locator('.ship-console__identity > h1').waitFor();
      await page.addStyleTag({ content: `html { font-size: ${16 * viewport.scale}px !important; }` });
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const heading = document.querySelector('.ship-console__identity > h1');
        const style = getComputedStyle(heading), rect = heading.getBoundingClientRect();
        // A word must remain on one line; a total-heading height assertion misses split words.
        const wordLines = [...heading.textContent.matchAll(/\S+/g)].map(match => {
          const range = document.createRange();
          range.setStart(heading.firstChild, match.index);
          range.setEnd(heading.firstChild, match.index + match[0].length);
          return { word: match[0], lines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size };
        });
        const identity = document.querySelector('.ship-console__identity').getBoundingClientRect();
        return { rootWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, wordLines,
          identity: { left: identity.left, right: identity.right },
          heading: { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight,
            lineHeight: style.lineHeight, width: rect.width, height: rect.height } };
      });
      const stem = `${actor}-${viewport.width}x${viewport.height}-${viewport.scale}`;
      await page.locator('.ship-console__identity > h1').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(evidence, `${stem}-heading.png`) });
      if (actor === 'gm') {
        const zoom = page.locator('.gm-dradis .ship-plot__toggle');
        await zoom.click();
        const dialog = page.getByRole('dialog', { name: 'Fleet DRADIS' });
        await dialog.waitFor();
        const trigger = dialog.getByRole('button', { name: 'Trigger unknown contact', exact: true });
        assert.equal(await trigger.count(), 1, 'the expanded modal must have one effects control');
        metrics.control = await trigger.evaluate(element => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          const clippingAncestors = [];
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const s = getComputedStyle(ancestor), r = ancestor.getBoundingClientRect();
            if (['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowX)) clippingAncestors.push({
              className: ancestor.className, left: r.left, right: r.right,
            });
          }
          return { left: rect.left, right: rect.right, width: rect.width, height: rect.height,
            family: style.fontFamily, size: style.fontSize, clippingAncestors };
        });
        await page.screenshot({ path: join(evidence, `${stem}-portal.png`) });
        await trigger.focus();
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        metrics.focusRestored = await zoom.evaluate(element => document.activeElement === element);
      }
      const cdp = await context.newCDPSession(page);
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
      const dom = await cdp.send('DOM.getDocument');
      const { nodeId } = await cdp.send('DOM.querySelector', {
        nodeId: dom.root.nodeId, selector: '.ship-console__identity > h1',
      });
      metrics.heading.paintedFonts = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
      results.push({ actor, ...viewport, ...metrics });
    } finally { await context.close(); }
  }
  await writeFile(join(evidence, 'metrics.json'), JSON.stringify(results, null, 2));
  // Collect all three regressions before asserting so one failure does not hide another.
  const failures = [];
  for (const result of results) {
    if (result.rootWidth > result.width || result.identity.right > result.width + 1)
      failures.push(`${result.actor}/${result.width}/${result.scale}: player panel overflow ${result.rootWidth}px, identity right=${result.identity.right}`);
    if (result.actor === 'gm') {
      if (result.wordLines.some(word => word.lines > 1)) failures.push(`GM heading splits a word: ${JSON.stringify(result.wordLines)}`);
      if (result.control.clippingAncestors.some(parent => result.control.left < parent.left - 1 || result.control.right > parent.right + 1))
        failures.push(`GM effect control clipped: ${JSON.stringify(result.control)}`);
      assert.equal(result.focusRestored, true, 'Escape must restore focus to the actual zoom control');
    }
    assert.match(result.heading.family, /monospace/);
    assert.ok(result.heading.paintedFonts.length > 0, 'actual painted heading font is required');
  }
  assert.deepEqual(failures, [], 'actual built consumers must retain readable enlarged text and controls');
  console.log(`PASS ${results.length} actual-consumer mobile layout renders; evidence: ${evidence}`);
} finally {
  await browser?.close(); await server?.httpServer.close();
  await rm(output, { recursive: true, force: true });
}
