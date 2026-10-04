import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const directory = process.env.PC09_SCENE_EVIDENCE_DIR;
assert.ok(directory, 'An external evidence directory is required.');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const labels = ['1 Battle aftermath', '2 Crew, GM and Press', '3 Investigation and arrest', '4 Specialist and President', '5 Elections and crises'];

test('PC09 real-presenter tour is isolated, accessible and responsive in eight cases', async () => {
  const server = await createServer({server: {host: '127.0.0.1', port: 0}, logLevel: 'silent'});
  let browser;
  const cases = [];
  try {
    await mkdir(directory, {recursive: true}); await server.listen();
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const {port} = server.httpServer.address();
    for (const reducedMotion of ['no-preference', 'reduce']) {
      for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1440, 900]]) {
        const page = await browser.newPage({viewport: {width, height}, reducedMotion});
        const errors = [], writes = [], serviceRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {
          if (request.method() !== 'GET') writes.push({method: request.method(), url: request.url()});
          if (/googleapis\.com|firebaseio\.com|\/us-central1\/|\/google\.firestore\./.test(request.url())) serviceRequests.push(request.url());
        });
        try {
          await page.goto(`http://127.0.0.1:${port}/pc09-review.html`);
          await page.getByRole('note', {name: 'Prepared review boundary'}).waitFor();
          await page.keyboard.press('Tab');
          const skip = page.getByRole('link', {name: 'Skip to review workspace'});
          assert.ok(await skip.evaluate(element => document.activeElement === element && element.getBoundingClientRect().top >= 0));
          await page.keyboard.press('Enter');
          assert.ok(await page.locator('#pc09-review-content').evaluate(element => document.activeElement === element));
          const navigation = page.getByRole('navigation', {name: 'PC09 review steps'});
          for (const [index, label] of labels.entries()) {
            await navigation.getByRole('button', {name: label, exact: true}).click();
            assert.equal(await navigation.getByRole('button', {name: label, exact: true}).getAttribute('aria-pressed'), 'true');
            if (index === 0) {
              const repair = page.getByRole('button', {name: 'Repair one console // 3 materials', exact: true});
              assert.equal(await repair.isEnabled(), false);
              await page.getByRole('combobox', {name: 'Gorgoneion repair console'}).selectOption('missile-launchers');
              await repair.click(); assert.equal(await repair.isEnabled(), false);
              const build = page.getByRole('button', {name: 'Build fighter // 1 material', exact: true});
              await build.click(); assert.equal(await build.isEnabled(), false);
              await page.getByRole('region', {name: 'Wolf attack DRADIS'}).getByText('Unknown', {exact: true}).first().waitFor();
            } else if (index === 1) {
              const desk = page.getByRole('region', {name: 'Press dispatch desk'});
              await desk.getByRole('textbox', {name: 'Dispatch', exact: true}).fill('The fleet recovered after the attack.');
              await desk.getByRole('button', {name: 'Publish dispatch', exact: true}).click();
              await desk.getByText('Current dispatches // 1', {exact: true}).waitFor();
              await desk.getByRole('button', {name: /^Dismiss dispatch:/}).click();
            } else if (index === 2) {
              const detector = page.getByRole('region', {name: 'Wolf Agent Detector'});
              await detector.getByRole('button', {name: 'Run detector test', exact: true}).click();
              await detector.getByText(/Alex \/\/ Report: Wolf/).waitFor();
              await detector.getByText(/1 test remains/).waitFor();
              await page.getByRole('button', {name: 'Calculate required players', exact: true}).click();
              await page.getByText('players needed', {exact: false}).waitFor();
            } else if (index === 3) {
              const host = page.getByRole('region', {name: 'VIP Host maintenance benefit'});
              await host.getByRole('button', {name: 'Record ship visit', exact: true}).click();
              await host.getByRole('button', {name: 'Reroll one maintenance die', exact: true}).click();
              await host.getByText('The hosted maintenance reroll has been used.', {exact: true}).waitFor();
              await page.getByRole('region', {name: 'Presidential visit'}).getByRole('button', {name: 'Spend 1 and reduce unrest', exact: true}).click();
              await page.getByRole('status').filter({hasText: /2 political capital; AEGIS unrest 1/}).waitFor();
            } else {
              const election = page.getByRole('region', {name: 'Presidential election', exact: true});
              await election.getByRole('combobox', {name: 'President', exact: true}).selectOption('candidate-ada');
              await election.getByRole('combobox', {name: 'Vice President', exact: true}).selectOption('candidate-bo');
              await election.getByRole('button', {name: 'Submit secret ballot', exact: true}).click();
              await election.getByText('President: Ada // Vice President: Bo', {exact: true}).waitFor();
              await page.getByRole('region', {name: 'Formal Team-start announcements'}).getByText('Fleet leadership', {exact: true}).waitFor();
              await page.getByRole('button', {name: 'Hide report', exact: true}).click();
              await page.getByRole('button', {name: 'Read report', exact: true}).click();
            }
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px ${label}: horizontal overflow`);
            const geometry = await page.locator('main button,main select,main textarea,main input').evaluateAll(elements => elements.flatMap(element => {
              const rect = element.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return [];
              const failures = [];
              if (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1) failures.push('clipped');
              if (!['checkbox', 'radio'].includes(element.type) && rect.height < 44) failures.push('under44');
              return failures.map(failure => ({failure, control: element.textContent || element.getAttribute('aria-label')}));
            }));
            assert.deepEqual(geometry, [], `${label}: control geometry`);
            assert.ok(await page.locator('.pc07-review__intro h2').evaluate(element => {
              const style = getComputedStyle(element), normalize = value => value.replace(/["']/g, '').replace(/\s+/g, '').toLowerCase();
              return normalize(style.fontFamily) === normalize(style.getPropertyValue('--cic-display'));
            }), `${label}: existing display font`);
            await page.screenshot({path: `${directory}/${width}x${height}-${reducedMotion}-step${index + 1}.png`, fullPage: true});
          }
          await page.getByRole('button', {name: 'Previous review step', exact: true}).click();
          assert.equal(await navigation.getByRole('button', {name: labels[3], exact: true}).getAttribute('aria-pressed'), 'true');
          assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(serviceRequests, []);
          cases.push({width, height, reducedMotion, steps: 5, errors, writes, serviceRequests});
        } catch (error) {
          await page.screenshot({path: `${directory}/${width}x${height}-${reducedMotion}-failure.png`, fullPage: true});
          await writeFile(`${directory}/failure.json`, JSON.stringify({sourceCommit, width, height, reducedMotion, error: String(error), errors, writes}, null, 2));
          throw error;
        } finally {await page.close();}
      }
    }
    await writeFile(`${directory}/result.json`, JSON.stringify({sourceCommit, boundary: 'prepared-only; no gameplay or physical-device claim', cases}, null, 2));
  } finally {await browser?.close(); await server.close();}
});

test('PC09 return opens the actual application at phone and desktop sizes', async () => {
  const server = await createServer({server: {host: '127.0.0.1', port: 0}, logLevel: 'silent'});
  let browser;
  try {
    await server.listen(); browser = await chromium.launch({channel: 'chrome', headless: true});
    const {port} = server.httpServer.address();
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const page = await browser.newPage({viewport: {width, height}, reducedMotion: 'reduce'});
      await page.goto(`http://127.0.0.1:${port}/pc09-review.html`);
      const back = page.getByRole('link', {name: 'Return to station and console chooser', exact: true});
      await back.focus(); await page.keyboard.press('Enter');
      await page.waitForURL(`http://127.0.0.1:${port}/#/`);
      await page.getByRole('dialog', {name: 'MOTION SAFETY CHECK'}).waitFor();
      await page.getByRole('button', {name: /REDUCED MOTION.*PLAYABLE MODE/}).click();
      await page.getByRole('heading', {name: /Den of Wolves: New Eden/}).waitFor();
      assert.equal(await page.locator('.pc09-review').count(), 0);
      assert.ok(await page.getByRole('button', {name: 'Join a session', exact: true}).isVisible());
      await page.screenshot({path: `${directory}/${width}x${height}-returned-parent.png`, fullPage: true});
      await page.close();
    }
  } finally {await browser?.close(); await server.close();}
});
