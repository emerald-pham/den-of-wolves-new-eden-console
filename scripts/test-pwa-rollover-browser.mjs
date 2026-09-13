import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const projectRoot = process.cwd();
const sourceDist = path.join(projectRoot, 'dist');
if (!fs.existsSync(path.join(sourceDist, 'sw.js'))) {
  throw new Error('Run npm run build before the P624 browser rollover harness.');
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p624-sw-rollover-'));
const v1Root = path.join(fixtureRoot, 'v1');
const v2Root = path.join(fixtureRoot, 'v2');
fs.cpSync(sourceDist, v1Root, { recursive: true });
fs.cpSync(sourceDist, v2Root, { recursive: true });
const v2WorkerPath = path.join(v2Root, 'sw.js');
const v2Worker = fs.readFileSync(v2WorkerPath, 'utf8')
  .replace(/new-eden-console-shell-[^"']+/, 'new-eden-console-shell-rollover-v2');
fs.writeFileSync(v2WorkerPath, v2Worker);
fs.writeFileSync(path.join(v2Root, 'build-version.json'), JSON.stringify({ version: 'rollover-v2' }));

let activeRoot = v1Root;
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const relativePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.resolve(activeRoot, `.${relativePath}`);
  if (!filePath.startsWith(`${activeRoot}${path.sep}`) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  response.setHeader('Cache-Control', relativePath === '/sw.js' || relativePath === '/build-version.json'
    ? 'no-store'
    : 'no-cache');
  response.setHeader('Content-Type', mimeTypes[path.extname(filePath)] ?? 'application/octet-stream');
  fs.createReadStream(filePath).pipe(response);
});

const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const browser = await chromium.launch({ headless: true });
try {
  const port = await listen();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10_000);
  const pendingCommand = {
    id: 'p624-rollover-fixture',
    kind: 'disconnectFromSession',
    payload: { sessionId: 'p624-fixture' },
    createdAt: new Date().toISOString(),
  };
  const baseUrl = `http://127.0.0.1:${port}`;
  await page.goto(`${baseUrl}/#/roles`);
  await page.evaluate((command) => {
    localStorage.setItem('dow-new-eden-session', JSON.stringify({
      state: {
        session: {
          id: 'p624-fixture',
          name: 'P624 browser fixture',
          joinCode: '6240',
          phase: 'lobby',
          ownerUid: 'fixture-player',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        me: {
          uid: 'fixture-player',
          sessionId: 'p624-fixture',
          displayName: 'Fixture player',
          role: 'player',
          seatId: null,
          joinedAt: new Date().toISOString(),
        },
        pendingCommands: [command],
        mode: 'player',
        lastRoute: '/roles',
      },
      version: 1,
    }));
    localStorage.setItem('dow-new-eden-session-waiver', String(Date.now()));
    localStorage.setItem('dow-new-eden-motion-safety', JSON.stringify({
      acknowledgedAt: Date.now(),
      choice: 'reduce',
    }));
    localStorage.setItem('new-eden-motion-override', 'reduce');
  }, pendingCommand);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1000);

  const readProof = () => page.evaluate(async () => {
    const persisted = JSON.parse(localStorage.getItem('dow-new-eden-session') ?? '{}');
    return {
      hash: location.hash,
      controller: Boolean(navigator.serviceWorker.controller),
      cacheNames: await caches.keys(),
      pendingCommands: persisted.state?.pendingCommands?.length ?? 0,
    };
  });
  const before = await readProof();
  console.log(JSON.stringify({ phase: 'v1-controlled', before }));
  activeRoot = v2Root;
  await page.evaluate(async () => {
    const serviceWorker = await navigator.serviceWorker.ready;
    await serviceWorker.update();
  });
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.ready).waiting));
  console.log(JSON.stringify({ phase: 'v2-waiting' }));
  const applyButton = page.getByRole('button', { name: 'Apply update' });
  try {
    await applyButton.waitFor({ state: 'visible' });
  } catch (error) {
    console.error(JSON.stringify({ phase: 'missing-apply-control', url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1200) }));
    throw error;
  }
  await applyButton.click();
  const reloadButton = page.getByRole('button', { name: 'Reload app' });
  await reloadButton.waitFor({ state: 'visible' });
  const activated = await readProof();
  if (activated.hash !== '#/roles' || activated.pendingCommands !== 1 || !activated.controller) {
    throw new Error(`Explicit Apply changed the saved view: ${JSON.stringify(activated)}`);
  }
  await Promise.all([
    page.waitForLoadState('load'),
    reloadButton.click(),
  ]);
  await page.waitForTimeout(500);
  const after = await readProof();
  if (after.hash !== '#/roles' || after.pendingCommands !== 1 || !after.controller) {
    throw new Error(`Explicit reload lost the saved view: ${JSON.stringify(after)}`);
  }
  if (after.cacheNames.length < 2) {
    throw new Error(`Expected both versioned shell caches to remain usable: ${JSON.stringify(after)}`);
  }
  console.log(JSON.stringify({
    fixture: 'static-host-only; no Firebase or server replay claim',
    before,
    activated,
    after,
    controls: 'Apply update -> controllerchange -> Reload app',
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
