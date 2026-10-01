import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('security-team location panel fits phone, short landscape, and desktop in both motion modes', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const reducedMotion of ['no-preference', 'reduce']) {
      for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1440, 900]]) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
        try {
          await page.goto(`http://127.0.0.1:${address.port}/pc06-security-locations.html`);
          await page.getByRole('note', { name: 'Synthetic local-only review fixture' }).waitFor();
          assert.match(await page.title(), /PC06.*Security team locations/i);
          assert.match(await page.getByRole('note', { name: 'Synthetic local-only review fixture' }).textContent(),
            /synthetic.*no callable.*Firestore write.*live game/i);

          const panel = page.getByRole('region', { name: 'Security team locations' });
          await panel.waitFor();
          assert.match(await panel.textContent(), /Docked at AEGIS[\s\S]*Undocked[\s\S]*Docked at Dione/);
          await page.getByRole('button', { name: 'Refresh locations' }).click();
          assert.match(await page.getByRole('status', { name: 'Local preview status' }).textContent(), /1/);

          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(scrollWidth <= width, `${width}x${height} ${reducedMotion}: ${scrollWidth}px horizontal overflow`);
          const offscreenControls = await page.locator('.boarding-security-workspace button').evaluateAll((elements) =>
            elements.filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
            }).map((element) => element.textContent));
          assert.deepEqual(offscreenControls, [], `${width}x${height}: offscreen controls`);
          const fontFamily = await page.locator('.boarding-security-workspace h2').evaluate((element) =>
            getComputedStyle(element).fontFamily);
          assert.match(fontFamily, /SFMono-Regular.*monospace/i,
            'the heading resolves through the installed CIC monospace stack');

          if (reducedMotion === 'reduce') {
            assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
            const animations = await page.locator('.boarding-security-workspace *').evaluateAll((elements) =>
              elements.map((element) => getComputedStyle(element).animationDuration));
            assert.ok(animations.every((duration) => duration.split(',').every((value) =>
              Number.parseFloat(value) <= 0.001)), `${width}x${height}: active reduced-motion animation`);
            const transitions = await page.locator('.boarding-security-workspace *').evaluateAll((elements) =>
              elements.map((element) => getComputedStyle(element).transitionDuration));
            assert.ok(transitions.every((duration) => duration.split(',').every((value) =>
              Number.parseFloat(value) <= 0.001)), `${width}x${height}: active reduced-motion transition`);
          }

          await page.screenshot({
            path: `/tmp/pc06-security-locations-${width}x${height}-${reducedMotion}.png`,
            fullPage: true,
          });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
