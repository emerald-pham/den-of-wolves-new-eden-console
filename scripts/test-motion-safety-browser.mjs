import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const artifacts = process.env.MOTION_SMOKE_ARTIFACT_DIR ?? '/tmp/p589a-motion-safety';
await mkdir(artifacts, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[320, 844], [1440, 900], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    // Exercise the real application without reaching production services.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(origin);
      const dialog = page.getByRole('dialog', { name: /motion safety check/i });
      await dialog.waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.motion-safety-content').evaluate(el => el.inert), true);
      const choices = dialog.getByRole('button');
      assert.equal(await choices.count(), 2);
      for (const button of await choices.all()) {
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
      }
      await dialog.getByRole('button', { name: /normal motion/i }).focus();
      await page.keyboard.press('Shift+Tab');
      assert.equal(await dialog.getByRole('button', { name: /reduced motion/i }).evaluate(el => el === document.activeElement), true);
      await page.screenshot({ path: `${artifacts}/${width}x${height}-gate.png` });
      await dialog.getByRole('button', { name: /normal motion/i }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.motion-safety-content').evaluate(el => el.inert), false);
      // Move the stored acknowledgement near expiry, without reloading the gate.
      await page.evaluate(() => {
        localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({ choice: 'full', acknowledgedAt: Date.now() - 86400000 + 1200 }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'dow-new-eden-motion-safety' }));
      });
      await dialog.waitFor({ timeout: 5000 });
      assert.equal(await page.locator('.motion-safety-shell').getAttribute('data-motion'), 'reduce');
      assert.equal(await page.locator('.motion-safety-content').evaluate(el => el.inert), true);
      await dialog.getByRole('button', { name: /reduced motion/i }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.reload();
      await page.locator('.motion-safety-content').waitFor();
      assert.equal(await dialog.count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('new-eden-motion-override')), 'reduce');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false);
      console.log(`PASS ${width}x${height}: initial gate, keyboard focus, live expiry, fresh reduced choice and reload`);
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/${width}x${height}-failure.png` });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await server.close();
}
