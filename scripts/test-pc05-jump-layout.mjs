import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const sampleFailures = [
  {
    requestId: 'review-fuel-shortage', shipId: 'aegis', origin: '0000', destination: '9997',
    failureStatus: 'fuel-shortage', failureRevision: 4, currentTurn: 7, fuelAtFailure: 1,
    requiredFuel: 3,
  },
  {
    requestId: 'review-drive-failure', shipId: 'dione', origin: '0000', destination: '5143',
    failureStatus: 'drive-failure', failureRevision: 6, currentTurn: 7, fuelAtFailure: 5,
    failureRoll: 2, failureThreshold: 3,
  },
  {
    requestId: 'review-wrong-coordinate', shipId: 'icebreaker', origin: '0000', destination: '9997',
    failureStatus: 'wrong-destination', failureRevision: 2, currentTurn: 7, fuelAtFailure: 8,
  },
];

const mockService = `
const failures = ${JSON.stringify(sampleFailures)};
export async function listUnresolvedJumpFailures() { return { failures }; }
export function createFailedJumpAdjudicationAttempt(failure, destination) {
  return { sessionId: 'review', instanceId: 'bridge', requestId: 'review-' + failure.requestId,
    expectedRevision: failure.failureRevision, failureRequestId: failure.requestId,
    shipId: failure.shipId, destination };
}
export async function adjudicateFailedJump(attempt) {
  return { status: 'jumped', shipId: attempt.shipId, destination: attempt.destination,
    damageDraws: Array.from({ length: 6 }, (_, index) => ({ systemId: 'system-' + index })) };
}
export function isFailedJumpOutcomeUncertain() { return false; }
export function createJumpShipAttempt(shipId, destination, options = {}) {
  return { sessionId: 'review', instanceId: 'bridge', requestId: 'review-jump-' + shipId,
    expectedRevision: 0, shipId, destination, ...options };
}
export async function jumpShip() { return { status: 'jumped' }; }
export function isJumpShipOutcomeUncertain() { return false; }
export async function advanceTurn() { return {}; }
`;

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  logLevel: 'silent',
  plugins: [{
    name: 'pc05-jump-layout-service-fixture',
    enforce: 'pre',
    resolveId(id) {
      return id === '@/lib/sessionService' || id.endsWith('/src/lib/sessionService') ||
        id.endsWith('/src/lib/sessionService.ts') ? '\0pc05-jump-service-fixture' : null;
    },
    load(id) {
      return id === '\0pc05-jump-service-fixture' ? mockService : null;
    },
  }],
});

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== 'string');
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const motion of ['no-preference', 'reduce']) {
    for (const [name, width, height] of [
      ['compact-phone', 320, 844],
      ['phone', 390, 844],
      ['short-landscape', 844, 390],
      ['desktop', 1440, 900],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
      });
      try {
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.goto(`http://127.0.0.1:${address.port}/scripts/pc05-jump-review.html`);
        for (const [digit, count] of [[1, 5], [2, 1], [3, 4], [4, 3]]) {
          for (let click = 0; click < count; click += 1) {
            await page.getByRole('button', { name: `Increase coordinate digit ${digit}` }).click();
          }
        }
        await page.getByRole('button', { name: 'Lock destination coordinates' }).click();
        await page.getByRole('button', { name: 'Emergency jump to 5143' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Emergency jump to 5143' }).isEnabled(), true,
          `${name}/${motion}: pursuit-10 emergency action should be available after destination lock`);
        await page.getByRole('button', { name: 'Offer emergency jump' }).click();
        await page.locator('.pursuit-emergency-window [role="status"]')
          .getByText('Emergency jump offered to the at-risk fleet groups.').waitFor();
        await page.getByRole('button', { name: 'Check failed jumps' }).click();
        try {
          await page.getByText('UNPRINTED DESTINATION').waitFor({ timeout: 5_000 });
        } catch {
          throw new Error(`Failure cards did not render: ${(await page.locator('body').innerText())}; browser errors: ${pageErrors.join('; ')}`);
        }

        const layout = await page.evaluate(() => {
          const panel = document.querySelector('.jump-failure-panel');
          if (!panel) throw new Error('The production failed-jump panel did not render.');
          const panelBounds = panel.getBoundingClientRect();
          const drive = document.querySelector('.jump-drive');
          if (!drive) throw new Error('The production Jump Drive console did not render.');
          const driveBounds = drive.getBoundingClientRect();
          const pursuit = document.querySelector('.pursuit-emergency-window');
          if (!pursuit) throw new Error('The production pursuit emergency decision panel did not render.');
          const pursuitBounds = pursuit.getBoundingClientRect();
          const controls = [...document.querySelectorAll(
            '.jump-failure-panel button, .jump-failure-panel select, .jump-drive button, .pursuit-emergency-window button',
          )].map((control) => {
            const bounds = control.getBoundingClientRect();
            return {
              text: control.textContent?.trim() ?? control.getAttribute('aria-label'),
              left: bounds.left,
              right: bounds.right,
              height: bounds.height,
            };
          });
          return {
            scrollWidth: document.documentElement.scrollWidth,
            motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'full',
            panel: { left: panelBounds.left, right: panelBounds.right, width: panelBounds.width },
            drive: { left: driveBounds.left, right: driveBounds.right, width: driveBounds.width },
            pursuit: { left: pursuitBounds.left, right: pursuitBounds.right, width: pursuitBounds.width },
            failures: panel.querySelectorAll('.jump-failure-panel__item').length,
            controls,
            landscapeGap: getComputedStyle(panel).rowGap,
          };
        });

        assert.equal(layout.motion, motion === 'reduce' ? 'reduce' : 'full');
        assert.equal(layout.failures, sampleFailures.length, `${name}/${motion}: all current failure types should render`);
        assert.ok(layout.scrollWidth <= width, `${name}/${motion}: horizontal overflow ${layout.scrollWidth}px`);
        assert.ok(layout.panel.left >= 0 && layout.panel.right <= width,
          `${name}/${motion}: panel crosses viewport bounds ${JSON.stringify(layout.panel)}`);
        assert.ok(layout.drive.left >= 0 && layout.drive.right <= width,
          `${name}/${motion}: Jump Drive console crosses viewport bounds ${JSON.stringify(layout.drive)}`);
        assert.ok(layout.pursuit.left >= 0 && layout.pursuit.right <= width,
          `${name}/${motion}: pursuit emergency panel crosses viewport bounds ${JSON.stringify(layout.pursuit)}`);
        for (const control of layout.controls) {
          assert.ok(control.left >= 0 && control.right <= width,
            `${name}/${motion}: control crosses viewport bounds ${JSON.stringify(control)}`);
          assert.ok(control.height >= 36, `${name}/${motion}: control is too short ${JSON.stringify(control)}`);
        }
        if (name === 'short-landscape') assert.equal(layout.landscapeGap, '6.4px');
        assert.deepEqual(pageErrors, [], `${name}/${motion}: browser errors`);
        console.log(`PASS ${name} ${width}x${height} ${motion}: emergency decision, failures, and all controls fit`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
