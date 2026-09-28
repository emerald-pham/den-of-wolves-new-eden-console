import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const artifactDirectory = process.env.DRADIS_VISIBILITY_ARTIFACT_DIR ?? '/tmp/dradis-label-visibility';
await mkdir(artifactDirectory, { recursive: true });
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  logLevel: 'silent',
});
await server.listen();
const address = server.httpServer?.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const viewports = [
  ['desktop', 1440, 900],
  ['phone', 390, 844],
  ['short-landscape', 844, 390],
];
const results = [];

const pairSnapshot = (contact) => {
  const plot = contact.closest('.contact-plot');
  const label = contact.querySelector('.contact-plot__tag');
  const blip = contact.querySelector('.contact-plot__blip');
  const alpha = (node) => {
    let value = 1;
    for (let element = node; element && element !== plot.parentElement; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return 0;
      value *= Number.parseFloat(style.opacity);
      if (element === plot) break;
    }
    return value;
  };
  return {
    name: label.textContent.trim(),
    labelAlpha: alpha(label),
    blipAlpha: alpha(blip),
    labelOpacity: getComputedStyle(label).opacity,
    blipOpacity: getComputedStyle(blip).opacity,
    acquired: contact.querySelector('.contact-plot__apparent').dataset.acquired === 'true',
  };
};

const assertPaired = (sample, label) => {
  assert.ok(Math.abs(sample.labelAlpha - sample.blipAlpha) <= 0.025,
    `${label}: name alpha ${sample.labelAlpha.toFixed(3)} differs from contact alpha ${sample.blipAlpha.toFixed(3)}`);
};

async function pageFor(viewportName, width, height, motion, mode = 'contact') {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
  });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/scripts/dradis-visibility-harness.html?motion=${motion}&mode=${mode}`);
  await page.locator('.contact-plot').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => {
    const plot = document.querySelector('.contact-plot');
    if (!plot) throw new Error('The production DRADIS plot did not render.');
    window.__dradisScanEvents = 0;
    plot.addEventListener('dradis-contact-scan', () => { window.__dradisScanEvents += 1; });
    return {
      still: plot.dataset.still,
      motion: document.querySelector('[data-motion]')?.getAttribute('data-motion'),
      contactCount: plot.querySelectorAll('.contact-plot__contact').length,
      sweepDuration: getComputedStyle(plot.querySelector('.contact-plot__sweep')).animationDuration,
    };
  });
  assert.equal(info.still, motion === 'reduce' ? 'true' : 'false');
  assert.equal(info.motion, motion === 'reduce' ? 'reduce' : 'full');
  assert.equal(info.sweepDuration, motion === 'reduce' ? '0s' : '0.9s');
  assert.ok(info.contactCount > 0, 'expected production ContactPlot contacts');
  return { context, page, pageErrors, viewportName, width, height, motion, mode };
}

async function waitForScan(page, previousCount = 0) {
  await page.waitForFunction((previous) => window.__dradisScanEvents > previous, previousCount, { timeout: 12_000 });
}

async function snapshot(page, selector = '.contact-plot__contact') {
  return page.locator(selector).first().evaluate(pairSnapshot);
}

async function runNormalContact(viewport) {
  const { context, page, pageErrors, viewportName, width, height } = await pageFor(...viewport, 'full');
  try {
    const firstContact = page.locator('.contact-plot__contact').first();
    const initial = await firstContact.evaluate(pairSnapshot);
    assert.equal(initial.acquired, false, `${viewportName}: an unacquired contact must remain hidden`);
    assert.equal(initial.labelAlpha, 0, `${viewportName}: an unacquired name must not appear early`);
    assert.equal(initial.blipAlpha, 0, `${viewportName}: an unacquired return must remain hidden`);

    await waitForScan(page);
    const plot = page.locator('.contact-plot');
    await plot.evaluate((element) => element.querySelectorAll('.contact-plot__sweep')
      .forEach((sweep) => sweep.getAnimations().forEach((animation) => animation.pause())));
    const acquired = await firstContact.evaluate(pairSnapshot);
    assert.equal(acquired.acquired, true, `${viewportName}: sweep did not acquire the contact`);
    assertPaired(acquired, `${viewportName} sweep boundary`);

    await firstContact.evaluate((contact, time) => {
      for (const selector of ['.contact-plot__tag', '.contact-plot__blip']) {
        for (const animation of contact.querySelector(selector).getAnimations()) {
          if (animation.effect?.getTiming().duration !== 7000) continue;
          animation.pause();
          animation.currentTime = time;
        }
      }
    }, 3500);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    const fading = await firstContact.evaluate(pairSnapshot);
    results.push({ viewportName, mode: 'normal', component: 'ContactPlot', state: 'mid-fade', ...fading });
    if (viewportName === 'desktop') {
      await page.screenshot({ path: `${artifactDirectory}/desktop-normal-mid-fade.png` });
    }
    assertPaired(fading, `${viewportName} mid-fade`);

    const beforeRefresh = await page.evaluate(() => window.__dradisScanEvents);
    await plot.evaluate((element) => element.querySelectorAll('.contact-plot__sweep')
      .forEach((sweep) => sweep.getAnimations().forEach((animation) => animation.play())));
    await waitForScan(page, beforeRefresh);
    await plot.evaluate((element) => element.querySelectorAll('.contact-plot__sweep')
      .forEach((sweep) => sweep.getAnimations().forEach((animation) => animation.pause())));
    await firstContact.evaluate((contact) => {
      for (const selector of ['.contact-plot__tag', '.contact-plot__blip']) {
        for (const animation of contact.querySelector(selector).getAnimations()) {
          if (animation.effect?.getTiming().duration !== 7000) continue;
          animation.pause();
          animation.currentTime = 0;
        }
      }
    });
    const refreshed = await firstContact.evaluate(pairSnapshot);
    results.push({ viewportName, mode: 'normal', component: 'ContactPlot', state: 'repeat-sweep', ...refreshed });
    assertPaired(refreshed, `${viewportName} repeat sweep`);

    await firstContact.evaluate((contact) => {
      for (const selector of ['.contact-plot__tag', '.contact-plot__blip']) {
        for (const animation of contact.querySelector(selector).getAnimations()) {
          if (animation.effect?.getTiming().duration !== 7000) continue;
          animation.pause();
          animation.currentTime = 7000;
        }
      }
    });
    const postFade = await firstContact.evaluate(pairSnapshot);
    results.push({ viewportName, mode: 'normal', component: 'ContactPlot', state: 'post-fade', ...postFade });
    assertPaired(postFade, `${viewportName} post-fade`);

    await page.evaluate(() => window.__dradisVisibility.setTag('CONTACT BETA'));
    const changedContact = page.locator('.contact-plot__contact').first();
    await page.getByText('CONTACT BETA', { exact: true }).waitFor();
    const changed = await changedContact.evaluate(pairSnapshot);
    assert.equal(changed.acquired, false, `${viewportName}: renamed track inherited stale acquisition`);
    assert.equal(changed.labelAlpha, 0, `${viewportName}: changed name appeared before its new contact`);
    assert.equal(changed.blipAlpha, 0, `${viewportName}: changed return appeared before acquisition`);

    const priorScan = await page.evaluate(() => window.__dradisScanEvents);
    await plot.evaluate((element) => element.querySelectorAll('.contact-plot__sweep')
      .forEach((sweep) => sweep.getAnimations().forEach((animation) => animation.play())));
    await waitForScan(page, priorScan);
    await plot.evaluate((element) => element.querySelectorAll('.contact-plot__sweep')
      .forEach((sweep) => sweep.getAnimations().forEach((animation) => animation.pause())));
    await changedContact.evaluate((contact) => {
      for (const selector of ['.contact-plot__tag', '.contact-plot__blip']) {
        for (const animation of contact.querySelector(selector).getAnimations()) {
          if (animation.effect?.getTiming().duration !== 7000) continue;
          animation.pause();
          animation.currentTime = 3500;
        }
      }
    });
    const changedFade = await changedContact.evaluate(pairSnapshot);
    results.push({ viewportName, mode: 'normal', component: 'ContactPlot', state: 'changed-contact-mid-fade', ...changedFade });
    assertPaired(changedFade, `${viewportName} changed contact mid-fade`);

    if (pageErrors.length > 0) throw new Error(`Browser errors: ${pageErrors.join('; ')}`);
    console.log(`PASS ${viewportName} ${width}x${height}: ContactPlot initial, sweep, refresh, changed track, mid-fade and post-fade`);
  } finally {
    await context.close();
  }
}

async function runNormalShip(viewport) {
  const { context, page, pageErrors, viewportName, width, height } = await pageFor(...viewport, 'full', 'ship');
  try {
    const plot = page.locator('.contact-plot');
    const compactToggle = page.getByRole('button', { name: 'Zoom into DRADIS panel' });
    assert.equal(await compactToggle.count(), 0, 'expanded test plot unexpectedly rendered the compact toggle');
    const initial = await snapshot(page);
    assert.equal(initial.labelAlpha, 0, `${viewportName}: ShipPlot name appeared before acquisition`);
    assert.equal(initial.blipAlpha, 0, `${viewportName}: ShipPlot return appeared before acquisition`);
    await waitForScan(page);
    const acquiredContact = page.locator(
      ".contact-plot__contact:has(.contact-plot__apparent[data-acquired='true'])",
    ).first();
    await acquiredContact.waitFor({ state: 'attached' });
    await plot.evaluate((element) => element.querySelectorAll('.contact-plot__sweep')
      .forEach((sweep) => sweep.getAnimations().forEach((animation) => animation.pause())));
    const acquired = await acquiredContact.evaluate(pairSnapshot);
    assertPaired(acquired, `${viewportName} ShipPlot sweep boundary`);
    await acquiredContact.evaluate((contact) => {
      for (const selector of ['.contact-plot__tag', '.contact-plot__blip']) {
        for (const animation of contact.querySelector(selector).getAnimations()) {
          if (animation.effect?.getTiming().duration !== 7000) continue;
          animation.pause();
          animation.currentTime = 3500;
        }
      }
    });
    const fading = await acquiredContact.evaluate(pairSnapshot);
    results.push({ viewportName, mode: 'normal', component: 'ShipPlot', state: 'mid-fade', ...fading });
    assertPaired(fading, `${viewportName} ShipPlot mid-fade`);
    await acquiredContact.evaluate((contact) => {
      for (const selector of ['.contact-plot__tag', '.contact-plot__blip']) {
        for (const animation of contact.querySelector(selector).getAnimations()) {
          if (animation.effect?.getTiming().duration !== 7000) continue;
          animation.pause();
          animation.currentTime = 7000;
        }
      }
    });
    const postFade = await acquiredContact.evaluate(pairSnapshot);
    results.push({ viewportName, mode: 'normal', component: 'ShipPlot', state: 'post-fade', ...postFade });
    assertPaired(postFade, `${viewportName} ShipPlot post-fade`);
    if (pageErrors.length > 0) throw new Error(`Browser errors: ${pageErrors.join('; ')}`);
    console.log(`PASS ${viewportName} ${width}x${height}: production ShipPlot sweep boundary, mid-fade and post-fade`);
  } finally {
    await context.close();
  }
}

async function runReduced(viewport, mode) {
  const { context, page, pageErrors, viewportName, width, height } = await pageFor(...viewport, 'reduce', mode);
  try {
    const plot = page.locator('.contact-plot');
    const contacts = page.locator('.contact-plot__contact');
    const count = await contacts.count();
    assert.ok(count > 0);
    for (let index = 0; index < count; index += 1) {
      const pair = await contacts.nth(index).evaluate(pairSnapshot);
      assert.ok(pair.labelAlpha > 0.55, `${viewportName}: reduced-motion name was not visible with its return`);
      assert.ok(pair.blipAlpha > 0.55, `${viewportName}: reduced-motion return was not visible with its name`);
      assertPaired(pair, `${viewportName} reduced-motion ${mode}`);
    }
    assert.equal(await plot.locator('.contact-plot__sweep').first()
      .evaluate((node) => getComputedStyle(node).animationName), 'none');
    if (mode === 'contact') {
      await page.evaluate(() => window.__dradisVisibility.setTag('CONTACT BETA'));
      const changed = await snapshot(page);
      assert.equal(changed.name, 'CONTACT BETA');
      assertPaired(changed, `${viewportName} reduced-motion changed contact`);
    }
    if (pageErrors.length > 0) throw new Error(`Browser errors: ${pageErrors.join('; ')}`);
    results.push({ viewportName, mode: 'reduced', component: mode === 'contact' ? 'ContactPlot' : 'ShipPlot', state: 'static', count });
    console.log(`PASS ${viewportName} ${width}x${height}: reduced-motion ${mode} keeps names on visible contacts`);
  } finally {
    await context.close();
  }
}

try {
  for (const viewport of viewports) {
    await runNormalContact(viewport);
    await runNormalShip(viewport);
    await runReduced(viewport, 'contact');
    await runReduced(viewport, 'ship');
  }
  await writeFile(`${artifactDirectory}/visibility-evidence.json`, `${JSON.stringify(results, null, 2)}\n`);
} finally {
  await browser.close();
  await server.close();
}
