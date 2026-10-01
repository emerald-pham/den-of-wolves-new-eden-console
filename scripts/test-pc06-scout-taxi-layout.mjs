import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const mockService = `window.pc06CourierLayoutFixture = true;
export function createScoutTaxiCommunicationActions() { return { send: async () => ({ status: 'committed' }) }; }`;
test('real courier controls remain readable and keyboard usable at narrow, landscape and desktop sizes', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent', plugins: [{
    name: 'pc06-local-courier-layout', enforce: 'pre',
    resolveId(id) { return id === '@/lib/scoutTaxiCommunicationService' || /\/src\/lib\/scoutTaxiCommunicationService(?:\.ts)?$/.test(id)
      ? '\0pc06-courier-layout-service' : null; },
    load(id) { return id === '\0pc06-courier-layout-service' ? mockService : null; },
  }] });
  let browser;
  try {
    await server.listen(); const address = server.httpServer.address();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const reducedMotion of ['no-preference', 'reduce']) for (const [width, height] of [[320,844],[390,844],[844,390],[1440,900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
      try {
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.goto(`http://127.0.0.1:${address.port}/scripts/pc06-scout-taxi-review.html`);
        const panel = page.getByRole('region', { name: 'Hummingbird scout taxi courier' });
        await panel.waitFor(); await page.evaluate(() => document.fonts.ready);
        const target = page.getByLabel('Courier destination ship');
        await target.selectOption('aegis'); await target.focus();
        await page.keyboard.press('Tab');
        const note = page.getByLabel('Courier note');
        assert.ok(await note.evaluate(element => element === document.activeElement));
        await note.fill('Hold position.'); await page.keyboard.press('Tab');
        const send = page.getByRole('button', { name: 'Send scout taxi courier' });
        assert.ok(await send.evaluate(element => element === document.activeElement));
        await page.keyboard.press('Enter'); await page.getByText(/courier round trip completed/i).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const overflow = await panel.locator('select, textarea, button').evaluateAll(elements => elements.filter(element => {
          const r = element.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.width < 100;
        }).map(element => element.tagName));
        assert.deepEqual(overflow, [], `${width}x${height}: usable bounds`);
        await page.screenshot({ path: `/tmp/pc06-courier-${width}x${height}-${reducedMotion}.png`, fullPage: true });
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
});
