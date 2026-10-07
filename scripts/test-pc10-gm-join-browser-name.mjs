import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Render the real static GM-join Link attributes and actual stylesheet in a
// native browser. This is finite control accessibility proof, not React route,
// authenticated gameplay, server authority, or whole-game acceptance.
const source = await readFile(new URL('../src/routes/SessionMode.tsx', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const matches = [...source.matchAll(/<Link\b([^>]*?)>\s*GM join\s*<\/Link>/g)];
assert.equal(matches.length, 1, 'Bind exactly the existing Source-defined normal GM join Link.');
const attributes = matches[0][1];
const classes = /className="([A-Za-z0-9_ -]+)"/.exec(attributes)?.[1];
const target = /\bto="([^"]+)"/.exec(attributes)?.[1];
const label = /aria-label="([^"]+)"/.exec(attributes)?.[1];
assert.equal(target, '/roles');
assert.ok(classes?.split(' ').includes('session-mode__back'));
assert.match(attributes, /state=\{\{\s*intent:\s*'gm-join'\s*\}\}/,
  'The actual React Link must keep its existing normal join intent.');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const html = '<!doctype html><html><head><style>' + stylesheet + '</style></head><body>' +
  '<main class="fleet-roster"><header class="fleet-roster__header"><a class="' + escape(classes) +
  '" href="#' + escape(target) + '"' + (label ? ' aria-label="' + escape(label) + '"' : '') +
  '>GM join</a></header></main></body></html>';
let browser, context, page;
const blockedRequests = [];
before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => { blockedRequests.push(new URL(route.request().url()).protocol); return route.abort(); });
  page = await context.newPage(); page.setDefaultTimeout(5_000);
});
after(async () => { await context?.close(); await browser?.close(); });
async function mount() { await page.setContent(html, { waitUntil: 'domcontentloaded' }); }

test('bridge: the real Source CSS renders the decorative arrow on the one visible GM join control', async () => {
  await mount();
  const control = page.locator('a.session-mode__back');
  assert.equal(await control.count(), 1); assert.equal(await control.isVisible(), true);
  assert.equal(await control.evaluate(element => getComputedStyle(element, '::before').content), '"←"');
  assert.equal(await control.textContent(), 'GM join');
  console.log(JSON.stringify({ finiteBrowserAriaSnapshot: await control.ariaSnapshot(), actualCss: true,
    authenticatedGameAcceptance: false, sdkCalls: 0 }));
});

test('the normal GM join control has its exact intended accessible name in the native browser', async () => {
  await mount();
  const exact = page.getByRole('link', { name: 'GM join', exact: true });
  assert.equal(await exact.count(), 1, 'Decorative CSS must not change the exact normal GM join accessible name.');
  assert.equal(await exact.isVisible(), true);
});

test('the exact named normal GM join control is keyboard reachable and follows its original route', async () => {
  await mount();
  const exact = page.getByRole('link', { name: 'GM join', exact: true });
  assert.equal(await exact.count(), 1);
  await page.keyboard.press('Tab');
  assert.equal(await exact.evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#/roles');
  assert.equal(await exact.textContent(), 'GM join');
  assert.ok(blockedRequests.every(protocol => protocol === 'http:' || protocol === 'https:' || protocol === 'file:'),
    'No service or gameplay request is permitted; optional font requests are aborted.');
});
