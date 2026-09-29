import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outputDirectory = resolve(root, 'dist');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, 'docs/implementation-prompts.json'), 'utf8'));
const catalogCounts = catalog.prompts.reduce((counts, prompt) => ({
  ...counts,
  [prompt.status]: (counts[prompt.status] ?? 0) + 1,
}), {});
const expectedProgress = {
  completed: catalogCounts.done ?? 0,
  total: catalog.prompts.length,
  percentage: `${(((catalogCounts.done ?? 0) / catalog.prompts.length) * 100).toFixed(2)}%`,
};
const workerSource = await readFile(resolve(outputDirectory, 'sw.js'), 'utf8');
const assetPath = workerSource.match(/"(\/assets\/changelog-display-[^"]+\.json)"/)?.[1];
if (!assetPath) throw new Error('The generated service worker does not precache the changelog display asset.');

const asset = JSON.parse(await readFile(resolve(outputDirectory, assetPath.slice(1)), 'utf8'));
if (!Array.isArray(asset.entries) || asset.entries[0]?.version !== packageJson.version) {
  throw new Error('The emitted changelog display asset does not match the application version.');
}
if (
  asset.currentProgress?.completed !== expectedProgress.completed
  || asset.currentProgress?.total !== expectedProgress.total
  || asset.currentProgress?.percentage !== expectedProgress.percentage
) {
  throw new Error('The emitted changelog display asset does not contain the current catalog progress.');
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff2', 'font/woff2'],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = resolve(outputDirectory, `.${requestedPath}`);
    if (filePath !== outputDirectory && !filePath.startsWith(`${outputDirectory}${sep}`)) {
      response.writeHead(400).end('Bad path');
      return;
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Could not start the local preview server.');

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const motionPrompt = page.getByRole('dialog', { name: /motion safety check/i });
  if (await motionPrompt.count() > 0) {
    await page.getByRole('button', { name: /normal motion/i }).click();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'View changelog' }).click();
  await page.getByRole('heading', { name: `Build ${packageJson.version}` }).waitFor({ state: 'visible' });
  await page.getByText(
    `Current build catalog: ${expectedProgress.completed} of ${expectedProgress.total} complete (${expectedProgress.percentage})`,
  ).waitFor({ state: 'visible' });
  const assertSettingsLayout = async (label) => {
    await page.locator('.settings-changelog__entries').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const backdrop = document.querySelector('.settings-backdrop');
      const dialog = document.querySelector('.settings-dialog');
      const entries = document.querySelector('.settings-changelog__entries');
      if (!backdrop || !dialog || !entries) return null;
      const backdropRect = backdrop.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const entriesRect = entries.getBoundingClientRect();
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        backdropTop: backdropRect.top,
        backdropBottom: backdropRect.bottom,
        backdropWidth: backdropRect.width,
        dialogTop: dialogRect.top,
        dialogBottom: dialogRect.bottom,
        entriesTop: entriesRect.top,
        entriesBottom: entriesRect.bottom,
        entriesHeight: entriesRect.height,
        entriesScrollHeight: entries.scrollHeight,
        entriesClientHeight: entries.clientHeight,
        backdropScrollTop: backdrop.scrollTop,
        backdropScrollHeight: backdrop.scrollHeight,
        backdropClientHeight: backdrop.clientHeight,
        motion: document.querySelector('[data-motion]')?.getAttribute('data-motion'),
      };
    });
    if (
      !layout
      || layout.documentWidth > layout.width
      || layout.backdropTop !== 0
      || layout.backdropBottom < layout.height
      || layout.backdropWidth > layout.width
      || layout.entriesTop < 0
      || layout.entriesBottom > layout.height + 1
      || layout.entriesHeight <= 0
      || layout.entriesScrollHeight <= layout.entriesClientHeight
    ) {
      throw new Error(`Settings layout failed at ${label}: ${JSON.stringify(layout)}`);
    }
    return layout;
  };
  await assertSettingsLayout('390x844 normal-motion phone');

  await page.setViewportSize({ width: 1440, height: 900 });
  await assertSettingsLayout('1440x900 normal-motion desktop');
  await page.getByRole('checkbox', { name: 'Reduce motion' }).check();
  await page.setViewportSize({ width: 844, height: 390 });
  const landscapeLayout = await assertSettingsLayout('844x390 reduced-motion landscape');
  if (landscapeLayout.motion !== 'reduce') throw new Error('Reduced motion was not active in the short-landscape check.');

  const assetWasPrecached = await page.evaluate(async (path) => {
    const response = await caches.match(new URL(path, location.origin).href);
    return response?.ok === true;
  }, assetPath);
  if (!assetWasPrecached) throw new Error('The changelog display JSON is missing from the installed service worker cache.');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.getByRole('button', { name: 'Settings' }).count() !== 1) {
    const bodyText = await page.locator('body').innerText();
    throw new Error(`Settings is not available in the production preview. Page errors: ${pageErrors.join('; ')}. Body: ${bodyText.slice(0, 800)}`);
  }
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'View changelog' }).click();
  await page.getByRole('heading', { name: `Build ${packageJson.version}` }).waitFor({ state: 'visible' });
  const renderedReleaseCount = await page.locator('.settings-changelog__entry').count();
  if (renderedReleaseCount !== asset.entries.length) {
    throw new Error(`Offline Settings rendered ${renderedReleaseCount} of ${asset.entries.length} changelog releases.`);
  }
  const latestEntry = await page.locator('.settings-changelog__entry').first().innerText();
  if (!latestEntry.includes('PC05 is complete')) {
    throw new Error('Offline Settings loaded the asset but did not render the current changelog copy.');
  }
  const historicalPc05Entry = await page.getByRole('heading', { name: 'Build 0.5.57' })
    .locator('..').innerText();
  if (!historicalPc05Entry.includes('458 of 751 planned items were complete')) {
    throw new Error('Offline Settings did not preserve the historical 0.5.57 catalog snapshot.');
  }
  if (pageErrors.length > 0) throw new Error(`Offline changelog caused page errors: ${pageErrors.join('; ')}`);
  console.log(`Offline Settings loaded ${asset.entries.length} releases from precached ${assetPath}.`);
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}
