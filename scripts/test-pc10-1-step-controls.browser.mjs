import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

const servedRoot = resolve(process.env.PC10_1_REVIEW_ROOT ?? '');
const evidenceDirectory = resolve(process.env.PC10_1_EVIDENCE_DIR ?? '');
const label = (process.env.PC10_1_EVIDENCE_LABEL ?? 'run').replace(/[^a-z0-9-]/gi, '-');
const browserPath = '/Users/emeraldpham/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const port = 8513;
const origin = `http://127.0.0.1:${port}`;
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

assert.ok(process.env.PC10_1_REVIEW_ROOT, 'Set PC10_1_REVIEW_ROOT to the immutable baseline artifact or private candidate build.');
assert.ok(process.env.PC10_1_EVIDENCE_DIR, 'Set PC10_1_EVIDENCE_DIR to the private evidence directory.');

test('PC10.1 step controls keep their summary, labels and enabled navigation inside the viewport', { timeout: 90_000 }, async () => {
  await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  await chmod(evidenceDirectory, 0o700);
  const evidenceFiles = [];
  const observations = [];
  const issues = [];
  const runtimeErrors = [];
  const blockedRequests = [];
  let browser;
  let context;
  let page;

  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
      const filePath = resolve(servedRoot, `.${pathname}`);
      if (filePath !== servedRoot && !filePath.startsWith(`${servedRoot}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const file = await stat(filePath);
      if (!file.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': file.size,
        'Content-Type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });

  async function saveJson(filename, contents) {
    const path = resolve(evidenceDirectory, filename);
    await writeFile(path, `${JSON.stringify(contents, null, 2)}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
    evidenceFiles.push(path);
  }

  async function screenshot(filename) {
    const path = resolve(evidenceDirectory, filename);
    await page.screenshot({ path, fullPage: false });
    await chmod(path, 0o600);
    evidenceFiles.push(path);
  }

  async function selectCheck(index) {
    const labels = ['1 Scientist fieldwork', '2 Explorer fieldwork', '3 Candidate preparation'];
    await page.getByRole('navigation', { name: 'PC10.1 review checks' }).getByRole('button', { name: labels[index], exact: true }).click();
    await page.waitForFunction((expected) => document.querySelector('.pc07-review__step-controls p')?.textContent?.startsWith(`${expected} / 3`), index + 1);
    await page.locator('.pc07-review__step-controls').scrollIntoViewIfNeeded();
  }

  async function snapshot(name, expectedIndex) {
    const measured = await page.locator('.pc07-review__step-controls').evaluate((footer) => {
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      const textRects = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].map((box) => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }));
      };
      const summary = footer.querySelector('p');
      const buttons = [...footer.querySelectorAll('button')];
      const main = document.querySelector('main');
      return {
        viewportWidth: window.innerWidth,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        rootOverflowX: getComputedStyle(document.querySelector('.pc07-review')).overflowX,
        main: rect(main),
        footer: { ...rect(footer), clientWidth: footer.clientWidth, scrollWidth: footer.scrollWidth },
        summary: { text: summary.textContent, ...rect(summary), textRects: textRects(summary) },
        buttons: buttons.map((button) => ({ text: button.textContent.trim(), disabled: button.disabled, ...rect(button), textRects: textRects(button) })),
      };
    });
    const current = await page.locator('.pc07-review__step-controls p').textContent();
    const record = { name, expectedIndex, current, ...measured };
    observations.push(record);

    const withinViewport = (box) => box.left >= -0.5 && box.right <= measured.documentClientWidth + 0.5;
    if (measured.viewportWidth !== measured.documentClientWidth) issues.push(`${name}: document client width differs from viewport`);
    if (measured.documentScrollWidth > measured.documentClientWidth) issues.push(`${name}: document has horizontal scroll overflow`);
    if (!withinViewport(measured.main)) issues.push(`${name}: review workspace extends beyond the viewport`);
    if (!withinViewport(measured.footer)) issues.push(`${name}: step controls extend beyond the viewport`);
    if (measured.footer.scrollWidth > measured.footer.clientWidth + 1) issues.push(`${name}: step controls contain hidden horizontal overflow (${measured.footer.scrollWidth}px > ${measured.footer.clientWidth}px)`);
    if (!withinViewport(measured.summary)) issues.push(`${name}: summary element extends beyond the viewport`);
    for (const box of measured.summary.textRects) {
      if (!withinViewport(box)) issues.push(`${name}: summary text is clipped at the viewport edge (${box.left.toFixed(1)}..${box.right.toFixed(1)}px)`);
    }
    for (const button of measured.buttons) {
      if (!withinViewport(button)) issues.push(`${name}: ${button.text} control extends beyond the viewport (${button.left.toFixed(1)}..${button.right.toFixed(1)}px)`);
      for (const box of button.textRects) {
        if (!withinViewport(box)) issues.push(`${name}: ${button.text} text is clipped at the viewport edge (${box.left.toFixed(1)}..${box.right.toFixed(1)}px)`);
      }
    }
    if (!current?.startsWith(`${expectedIndex + 1} / 3`)) issues.push(`${name}: step summary does not match the selected check`);
    if (measured.buttons.length !== 2) issues.push(`${name}: expected Previous and Next controls`);
    if (measured.buttons[0]?.disabled !== (expectedIndex === 0)) issues.push(`${name}: Previous enabled state does not match the selected check`);
    if (measured.buttons[1]?.disabled !== (expectedIndex === 2)) issues.push(`${name}: Next enabled state does not match the selected check`);
    return record;
  }

  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(port, '127.0.0.1', resolveListen);
    });
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    context = await browser.newContext({
      viewport: { width: 320, height: 844 },
      reducedMotion: 'no-preference',
      serviceWorkers: 'block',
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (requestUrl.origin === origin && ['GET', 'HEAD'].includes(request.method())) {
        await route.continue();
      } else {
        blockedRequests.push({ method: request.method(), url: request.url() });
        await route.abort();
      }
    });
    page = await context.newPage();
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await page.goto(`${origin}/pc10-1-review.html`, { waitUntil: 'networkidle' });
    await page.getByRole('note', { name: 'Prepared review boundary' }).waitFor();

    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await page.setViewportSize({ width: 320, height: 844 });
    await selectCheck(1);
    const target = await snapshot('320x844-root32-step2', 1);
    assert.equal(target.rootFontSize, '32px', 'Large-text case must use a 200% root font size.');
    await screenshot(`${label}-step2-320x844-root32.png`);
    await selectCheck(0);
    await snapshot('320x844-root32-step1', 0);
    await page.getByRole('button', { name: 'Next review step' }).click();
    await page.waitForFunction(() => document.querySelector('.pc07-review__step-controls p')?.textContent?.startsWith('2 / 3'));
    await page.locator('.pc07-review__step-controls').scrollIntoViewIfNeeded();
    await snapshot('320x844-root32-step2-next', 1);
    await page.getByRole('button', { name: 'Next review step' }).click();
    await page.waitForFunction(() => document.querySelector('.pc07-review__step-controls p')?.textContent?.startsWith('3 / 3'));
    await page.locator('.pc07-review__step-controls').scrollIntoViewIfNeeded();
    await snapshot('320x844-root32-step3', 2);
    await page.getByRole('button', { name: 'Previous review step' }).click();
    await page.waitForFunction(() => document.querySelector('.pc07-review__step-controls p')?.textContent?.startsWith('2 / 3'));
    await page.locator('.pc07-review__step-controls').scrollIntoViewIfNeeded();
    await snapshot('320x844-root32-step2-previous', 1);

    await page.evaluate(() => { document.documentElement.style.fontSize = '16px'; });
    await page.setViewportSize({ width: 320, height: 844 });
    await selectCheck(1);
    await snapshot('320x844-root16-step2', 1);

    await page.setViewportSize({ width: 1440, height: 900 });
    await selectCheck(1);
    await snapshot('1440x900-root16-step2', 1);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 844, height: 390 });
    await selectCheck(1);
    await snapshot('844x390-root16-reduced-step2', 1);

    const report = {
      task: 'PC10.1 Step 2 footer containment at 320px with 200% root text',
      label,
      servedRoot,
      origin,
      runnerPid: process.pid,
      browserVersion: await browser.version(),
      generatedAt: new Date().toISOString(),
      observations,
      issues,
      runtimeErrors,
      blockedRequests,
      evidenceFiles,
    };
    await saveJson(`${label}-results.json`, report);
    assert.deepEqual(issues, [], `Step controls must remain fully visible at every sampled viewport. Details: ${issues.join('; ')}`);
    assert.deepEqual(runtimeErrors, [], 'The prepared scene must not produce runtime or console errors.');
    assert.deepEqual(blockedRequests, [], 'The prepared scene must not attempt non-local network requests.');
  } catch (error) {
    if (page && !evidenceFiles.some((path) => path.endsWith(`${label}-step2-320x844-root32.png`))) {
      try { await screenshot(`${label}-failure-320x844-root32.png`); } catch { /* Preserve the original browser failure. */ }
    }
    await saveJson(`${label}-failure.json`, {
      task: 'PC10.1 Step 2 footer containment at 320px with 200% root text',
      label,
      servedRoot,
      origin,
      runnerPid: process.pid,
      generatedAt: new Date().toISOString(),
      observations,
      issues,
      runtimeErrors,
      blockedRequests,
      failure: error instanceof Error ? error.stack ?? error.message : String(error),
      evidenceFiles,
    });
    throw error;
  } finally {
    await context?.close();
    await browser?.close();
    if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
  }
});
