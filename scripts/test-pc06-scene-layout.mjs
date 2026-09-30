import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('PC06 solo scene fits phone, short landscape and desktop in both motion modes', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const reducedMotion of ['no-preference', 'reduce']) {
      for (const [width, height] of [[320,844], [390,844], [844,390], [1440,900]]) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
        try {
          await page.goto(`http://127.0.0.1:${address.port}/pc06-review.html`);
          await page.getByRole('note', { name: 'Synthetic review boundary' }).waitFor();
          assert.match(await page.title(), /PC06/);
          const steps = page.getByRole('navigation', { name: 'PC06 review steps' });
          for (const name of ['1 Movement','2 Cargo and trade','3 Scouting','4 Away mission']) {
            await steps.getByRole('button', { name, exact:true }).click();
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(scrollWidth <= width, `${width}x${height} ${reducedMotion} ${name}: ${scrollWidth}px overflow`);
            const inaccessibleControls = await page.locator('.pc06-review button, .pc06-review select').evaluateAll(elements => elements.filter(element => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
            }).map(element => element.textContent));
            assert.deepEqual(inaccessibleControls, [], `${width}x${height} ${name}: offscreen controls`);
          }
          await steps.getByRole('button', { name:'1 Movement', exact:true }).click();
          await page.getByRole('region',{name:'Voyage 33-0 movement'}).getByRole('button',{name:'Dock with Dione',exact:true}).click();
          await page.getByRole('region',{name:'Voyage 33-0 movement'}).getByRole('button',{name:/Jump to Pallas/}).click();
          assert.match(await page.getByRole('status',{name:'Movement sample result'}).textContent(),/local review only/i);
          if (reducedMotion === 'reduce') {
            assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),true);
            const animations = await page.locator('.pc06-review *').evaluateAll(elements => elements.map(element=>getComputedStyle(element).animationDuration));
            assert.ok(animations.every(duration => duration.split(',').every(value => Number.parseFloat(value) <= 0.001)),`${width}x${height}: active reduced-motion animation`);
          }
          await page.screenshot({path:`/tmp/pc06-review-${width}x${height}-${reducedMotion}.png`,fullPage:true});
        } finally { await page.close(); }
      }
    }
  } finally { await browser?.close(); await server.close(); }
});
