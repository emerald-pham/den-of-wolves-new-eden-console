import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('every PC02 review step fits the viewport at owner review sizes', async () => {
  const server = await createServer({
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'silent',
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address !== 'string');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      try {
        await page.goto(`http://127.0.0.1:${address.port}/pc02-review.html`);
        const steps = page.getByRole('navigation', { name: 'PC02 review steps' });
        for (const name of ['Setup', 'Waiver', 'Fleet board', 'Press handoff', 'DRADIS', 'Leave and reconnect']) {
          await steps.getByRole('button', { name: new RegExp(name, 'i') }).click();
          if (name === 'Press handoff') {
            await page.getByRole('combobox', { name: 'Review perspective' }).selectOption('press');
          }
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(scrollWidth <= width, `${width}x${height} ${name}: horizontal overflow ${scrollWidth}px`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
