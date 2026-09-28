import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('crowded PC02 DRADIS names stay readable beside their own returns', async () => {
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
        await page.getByRole('button', { name: /5\. DRADIS/ }).click();
        await page.getByRole('button', { name: 'Crowded contacts' }).click();
        const result = await page.locator('.contact-plot').evaluate((plot) => {
          const contacts = [...plot.querySelectorAll('.contact-plot__contact')];
          const labels = contacts.map((contact) => contact.querySelector('.contact-plot__tag').getBoundingClientRect());
          const marks = contacts.map((contact) => contact.querySelector('.contact-plot__blip').getBoundingClientRect());
          const names = contacts.map((contact) => contact.querySelector('.contact-plot__tag').textContent.trim());
          const boundary = plot.getBoundingClientRect();
          const overlaps = (a, b) => a.left < b.right + 2 && a.right + 2 > b.left &&
            a.top < b.bottom + 2 && a.bottom + 2 > b.top;
          const errors = [];
          for (let index = 0; index < labels.length; index += 1) {
            const label = labels[index];
            if (label.width <= 0 || label.height <= 0 ||
                label.left < boundary.left + 7 || label.right > boundary.right - 7 ||
                label.top < boundary.top + 7 || label.bottom > boundary.bottom - 7) {
              errors.push(`off plot: ${names[index]}`);
            }
            for (let other = index + 1; other < labels.length; other += 1) {
              if (overlaps(label, labels[other])) errors.push(`names overlap: ${names[index]} / ${names[other]}`);
            }
            for (let other = 0; other < marks.length; other += 1) {
              if (other !== index && overlaps(label, marks[other])) {
                errors.push(`name covers return: ${names[index]} / ${names[other]}`);
              }
            }
            const east = contacts[index].dataset.labelAnchor.endsWith('east');
            const gap = east ? marks[index].left - label.right : label.left - marks[index].right;
            if (gap < 3 || gap > 17) errors.push(`detached: ${names[index]} (${gap.toFixed(1)}px)`);
          }
          return { count: contacts.length, errors };
        });
        assert.equal(result.count, 12, `${width}x${height}: expected the crowded fixture`);
        assert.deepEqual(result.errors, [], `${width}x${height}: ${result.errors.join('; ')}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
