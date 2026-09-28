import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('PC04 solo review route stays usable at phone, short-landscape, and desktop sizes with reduced motion', async () => {
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
        await page.goto(`http://127.0.0.1:${address.port}/pc04-review.html`);
        assert.match(await page.title(), /PC04.*Exploration and split-fleet/i);
        assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
        const expectContained = async (label) => {
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(scrollWidth <= width, `${width}x${height} ${label}: horizontal overflow ${scrollWidth}px`);
        };
        const steps = page.getByRole('navigation', { name: 'PC04 review steps' });

        await expectContained('entry');
        const entry = page.getByRole('region', { name: 'Prepared unified console entry' });
        await entry.getByRole('link', { name: /AEGIS.*Admiral.*HELD BY YOU/i }).click();
        assert.match(await entry.getByRole('region', { name: 'Prepared station preview' }).textContent(), /no station claim/i);

        await steps.getByRole('button', { name: '2 Read the console' }).click();
        await expectContained('typography');
        assert.equal(await page.getByText(/RED ALERT \/\/ WOLF ATTACK IMMINENT/).count(), 1);

        await steps.getByRole('button', { name: '3 Follow a mission' }).click();
        await expectContained('mission');
        const mission = page.getByRole('region', { name: 'New-location mission start' });
        await mission.getByRole('checkbox', { name: /Dione Engineer/i }).check();
        await mission.getByRole('checkbox', { name: /AEGIS Wing Commander/i }).check();
        await mission.getByLabel('Mission Leader').selectOption('dione-engineer-player');
        await mission.getByRole('button', { name: 'Start mission' }).click();
        assert.match(await mission.getByRole('status', { name: 'Mission start result' }).textContent(), /mission started/i);
        await mission.getByRole('region', { name: 'Mission start receipts' }).waitFor();
        const privateHand = page.getByRole('region', { name: 'Private away mission cards' });
        await privateHand.getByRole('button', { name: /discard this card secretly/i }).click();
        assert.match(await privateHand.textContent(), /card was discarded secretly/i);

        await steps.getByRole('button', { name: '4 Follow a split' }).click();
        const split = page.getByRole('region', { name: 'Prepared split fleet' });
        await split.getByRole('button', { name: 'Scout taxi' }).click();
        assert.match(await page.getByRole('status', { name: 'Prepared split state' }).textContent(), /range check/i);
        await split.getByRole('button', { name: 'Pending rejoin' }).click();
        assert.match(await page.getByRole('status', { name: 'Prepared split state' }).textContent(), /no invented merge/i);
        await expectContained('split');

        await steps.getByRole('button', { name: '5 Recover safely' }).click();
        assert.equal(await page.getByRole('button', { name: 'Repeat automated mission start' }).isEnabled(), false);
        await expectContained('recovery');

        const animatedDurations = await page.locator('.pc04-review *').evaluateAll((elements) =>
          elements.map((element) => getComputedStyle(element).animationDuration));
        assert.ok(animatedDurations.every((duration) => duration === '0s' || duration === '0.001s'),
          `${width}x${height}: reduced-motion styles left an active animation`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
