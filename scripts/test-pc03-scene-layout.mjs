import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('PC03 solo review route stays usable at phone, short-landscape, and desktop sizes with reduced motion', async () => {
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

    const viewports = [[320, 844], [390, 844], [844, 390], [1440, 900]];
    for (const [width, height] of viewports) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      try {
        await page.goto(`http://127.0.0.1:${address.port}/pc03-review.html`);
        assert.match(await page.title(), /PC03.*Navigation and shuttle/i);
        assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
        const expectContained = async (stepLabel) => {
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(scrollWidth <= width, `${width}x${height} ${stepLabel}: horizontal overflow ${scrollWidth}px`);
        };

        await expectContained('chart/system');
        await page.getByRole('button', { name: 'Navigation' }).click();
        await page.getByRole('region', { name: 'Ship navigation map' }).waitFor();
        await expectContained('chart/navigation map');
        const duration = await page.locator('.starmap__scanline').evaluate((element) => getComputedStyle(element).animationDuration);
        const seconds = duration.endsWith('ms') ? Number.parseFloat(duration) / 1000 : Number.parseFloat(duration);
        assert.ok(seconds <= 0.001, `${width}x${height}: reduced-motion animation duration ${duration}`);
        await page.getByRole('button', { name: 'Systems', exact: true }).click();
        await page.getByRole('button', { name: 'Return to Fleet Board' }).click();
        await page.getByRole('button', { name: 'Return to assigned station' }).click();
        await expectContained('chart/navigation return');
      } finally {
        await page.close();
      }
    }

    const [width, height] = [390, 844];
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    try {
      await page.goto(`http://127.0.0.1:${address.port}/pc03-review.html`);
      const steps = page.getByRole('navigation', { name: 'PC03 review steps' });
      const expectContained = async (stepLabel) => {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(scrollWidth <= width, `${width}x${height} ${stepLabel}: horizontal overflow ${scrollWidth}px`);
      };

      await steps.getByRole('button', { name: /2\. Jump Drive/ }).click();
      const control = page.getByRole('region', { name: 'Jump Drive sample control' });
      const digit = control.getByRole('button', { name: 'Increase coordinate digit 1' });
      assert.equal(await digit.isEnabled(), true, 'JumpDriveConsole presentationOnly must allow local digit review');
      await digit.focus();
      await page.keyboard.press('Enter');
      const lock = control.getByRole('button', { name: 'Lock destination coordinates' });
      assert.equal(await lock.isEnabled(), true, 'JumpDriveConsole presentationOnly must allow local coordinate locking');
      await lock.click();
      assert.equal(await control.getByLabel('Locked destination coordinates').textContent(), '6143');
      await expectContained('jump drive');
      assert.equal(await control.getByRole('button', { name: 'Jump to 6143' }).isEnabled(), false, 'sample launch must remain disabled');

      await steps.getByRole('button', { name: /3\. Shuttle route/ }).click();
      const shuttleStates = page.getByRole('group', { name: 'Prepared shuttle states' });
      await shuttleStates.getByRole('button', { name: 'Retargeted' }).click();
      await expectContained('shuttle retargeted');
      await shuttleStates.getByRole('button', { name: 'Airspace closed' }).click();
      await expectContained('shuttle airspace');
      await shuttleStates.getByRole('button', { name: 'Arrived' }).click();
      await expectContained('shuttle arrived');

      await steps.getByRole('button', { name: /4\. Stores and service/ }).click();
      const inventoryStates = page.getByRole('group', { name: 'Prepared stores and service states' });
      await inventoryStates.getByRole('button', { name: 'Depleted' }).click();
      await inventoryStates.getByRole('button', { name: 'Undocked host' }).click();
      await inventoryStates.getByRole('button', { name: 'Cargo stale' }).click();
      await expectContained('stores/service');

      await steps.getByRole('button', { name: /5\. Reconnect/ }).click();
      await page.getByRole('button', { name: 'Apply prepared reconnect snapshot' }).click();
      await expectContained('reconnect');
    } finally {
      await page.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
