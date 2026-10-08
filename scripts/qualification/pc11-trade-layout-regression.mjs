import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Test-only renderer. No listener/browser before an explicit new owner window.
assert.equal(process.env.PC11_RENDER_ALLOCATED, 'yes', 'Fresh parent browser allocation required');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const directory = process.env.PC11_RENDER_EVIDENCE;
const auditPath = process.env.PC11_BUILD_AUDIT;
const port = Number(process.env.PC11_RENDER_PORT);
assert.ok(directory?.startsWith('/tmp/') && auditPath?.startsWith('/tmp/'));
assert.ok(Number.isSafeInteger(port) && port >= 4200 && port <= 4299);
const audit = JSON.parse(await readFile(auditPath, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [file, expected] of Object.entries(audit.artifactHashes)) {
  assert.equal(hash(await readFile(resolve(root, 'dist', file))), expected, `Exact built artifact: ${file}`);
}
const version = JSON.parse(await readFile(resolve(root, 'dist/build-version.json'), 'utf8')).version;
assert.equal(version, JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version);
await mkdir(directory, { recursive: false });
const require = createRequire(`${root}/package.json`);
const { chromium } = require('playwright');
const origin = `http://127.0.0.1:${port}`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, origin).pathname);
    const path = resolve(root, 'dist', `.${name}`);
    assert.ok(path.startsWith(resolve(root, 'dist') + '/'));
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
let browser;
const result = { version, candidate: audit.candidate, syntheticOnly: true, remoteRequests: [], errors: [], samples: [] };
const timer = setTimeout(() => { result.errors.push('120-second render allocation exceeded'); void browser?.close(); server.close(); }, 120000);
try {
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    result.remoteRequests.push(`${url.origin}${url.pathname}`); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => result.errors.push(error.message));
  for (const [name, width, height, scale] of [
    ['landscape', 844, 390, 1], ['narrow', 320, 844, 1],
    ['desktop', 1440, 900, 1], ['landscape-enlarged', 844, 390, 1.25],
  ]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${origin}/pc06-review.html`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '2 Cargo and trade', exact: true }).click();
    await page.locator('.same-table-trade__offer').first().waitFor();
    await page.evaluate(scale => {
      if (scale !== 1) document.documentElement.style.fontSize = `${scale * 100}%`;
      // Long content in the existing synthetic scene; no session/store mutation.
      const heading = document.querySelector('.same-table-trade__offer-copy h4');
      if (scale !== 1 && heading) heading.textContent = 'Offer from Captain Alexandria Montgomery';
    }, scale);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    const measured = await page.locator('.same-table-trade__offer').evaluateAll(offers => offers.map(offer => {
      const copy = offer.querySelector('.same-table-trade__offer-copy');
      const heading = copy.querySelector('h4');
      const button = offer.querySelector('button');
      const rect = copy.getBoundingClientRect();
      const style = getComputedStyle(copy), offerStyle = getComputedStyle(offer);
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      context.font = style.font;
      const minimumReadingWidth = 16 * context.measureText('0').width;
      const availableWidth = offer.clientWidth - parseFloat(offerStyle.paddingLeft) - parseFloat(offerStyle.paddingRight);
      const buttonRect = button?.getBoundingClientRect();
      return { text: heading.textContent, copyWidth: rect.width, minimumReadingWidth, availableWidth,
        fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
        copyOverflow: copy.scrollWidth > copy.clientWidth + 1,
        button: buttonRect ? { x: buttonRect.x, right: buttonRect.right, width: buttonRect.width, height: buttonRect.height,
          overflow: button.scrollWidth > button.clientWidth + 1 } : null };
    }));
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }));
    const screenshot = `${name}.png`;
    await page.screenshot({ path: `${directory}/${screenshot}`, fullPage: true });
    result.samples.push({ name, width, height, scale, measured, geometry, screenshot });
    assert.ok(measured.length > 0, 'Actual built offer consumer required');
    for (const offer of measured) {
      assert.ok(offer.copyWidth + 1 >= Math.min(offer.availableWidth, offer.minimumReadingWidth),
        `Offer text compressed below a readable sixteen-character measure: ${name} ${offer.copyWidth.toFixed(1)}px`);
      assert.equal(offer.copyOverflow, false, `Offer copy overflow: ${name}`);
      if (offer.button) {
        assert.ok(offer.button.height >= 44 && offer.button.width > 0);
        assert.ok(offer.button.x >= -1 && offer.button.right <= width + 1 && !offer.button.overflow,
          `Offer action clipped: ${name}`);
      }
    }
    assert.ok(geometry.documentWidth <= width + 1, `Document overflow: ${name}`);
    const accept = page.getByRole('button', { name: /Accept exact offer from/ }).first();
    await accept.focus();
    assert.equal(await accept.evaluate(node => node === document.activeElement), true, 'Acceptance remains keyboard reachable');
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.remoteRequests, []);
  result.status = 'BUILT_TRADE_LAYOUT_PASS';
} catch (error) { result.status = 'BUILT_TRADE_LAYOUT_FAIL'; result.failure = error.message; process.exitCode = 1; }
finally {
  clearTimeout(timer); await browser?.close(); await new Promise(done => server.close(done));
  await writeFile(`${directory}/result.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, failure: result.failure, samples: result.samples.length, directory }));
}
