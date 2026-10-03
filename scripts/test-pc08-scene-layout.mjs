import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const directory = process.env.PC08_SCENE_EVIDENCE_DIR;
assert.ok(directory, 'An external evidence directory is required.');
const labels = ['1 DRADIS and shuttles', '2 Weapons', '3 Fleet fighters', '4 Boarding defence', '5 Results and recovery'];

test('PC08 real-presenter review is isolated and usable in eight viewport and motion cases', async () => {
  const server = await createServer({server: {host: '127.0.0.1', port: 0}, logLevel: 'silent'});
  let browser;
  const cases = [];
  try {
    await mkdir(directory, {recursive: true});
    await server.listen();
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const address = server.httpServer.address();
    for (const reducedMotion of ['no-preference', 'reduce']) {
      for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1440, 900]]) {
        const page = await browser.newPage({viewport: {width, height}, reducedMotion});
        const errors = [], writes = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {
          if (request.method() !== 'GET') writes.push({method: request.method(), url: request.url()});
        });
        try {
          await page.goto(`http://127.0.0.1:${address.port}/pc08-review.html`);
          await page.getByRole('note', {name: 'Prepared review boundary'}).waitFor();
          await page.keyboard.press('Tab');
          assert.ok(await page.getByRole('link', {name: 'Skip to review workspace'}).evaluate(element =>
            document.activeElement === element && element.getBoundingClientRect().top >= 0));
          const navigation = page.getByRole('navigation', {name: 'PC08 review steps'});
          for (const [index, label] of labels.entries()) {
            await navigation.getByRole('button', {name: label, exact: true}).click();
            assert.equal(await navigation.getByRole('button', {name: label, exact: true}).getAttribute('aria-pressed'), 'true');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px ${label}: horizontal overflow`);
            const clipped = await page.locator('main button,main select,main textarea,main input').evaluateAll(elements =>
              elements.filter(element => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
              }).map(element => element.textContent));
            assert.deepEqual(clipped, [], `${label}: clipped controls`);
            const smallControls = await page.locator('.pc07-review__controls button,.pc07-review__step-controls button').evaluateAll(elements =>
              elements.filter(element => element.getBoundingClientRect().height < 44).map(element => element.textContent));
            assert.deepEqual(smallControls, [], `${label}: touch target under 44px`);
            assert.ok(await page.locator('.pc07-review__intro h2').evaluate(element => {
              const style = getComputedStyle(element), normalize = value => value.replace(/["']/g, '').replace(/\s+/g, '').toLowerCase();
              return normalize(style.fontFamily) === normalize(style.getPropertyValue('--cic-display'));
            }), `${label}: actual display font`);
            if (index === 0) {
              const contained = async () => {
                const geometry = await page.locator('.pc07-review__plot').evaluate(host => {
                  const plot = host.querySelector('.ship-plot');
                  const rect = element => {const value = element.getBoundingClientRect(); return {left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height};};
                  return {frame: rect(plot), slot: rect(host)};
                });
                const {frame, slot} = geometry;
                assert.ok(frame.width > 100 && frame.height > 100 && frame.left >= slot.left - 1 && frame.top >= slot.top - 1 && frame.right <= slot.right + 1 && frame.bottom <= slot.bottom + 1,
                  `${width}px ${reducedMotion}: plot containment ${JSON.stringify(geometry)}`);
              };
              await contained();
              await page.locator('.ship-plot__toggle').click();
              await page.waitForFunction(() => document.querySelector('.ship-plot')?.dataset.expanded === 'true');
              await contained();
              await page.locator('.ship-plot__close').click();
              await page.waitForFunction(() => document.querySelector('.ship-plot')?.dataset.expanded === 'false');
              await contained();
              await page.getByRole('button', {name: 'travelling sample', exact: true}).click();
              await page.getByRole('button', {name: 'Cached connection sample', exact: true}).click();
              assert.match(await page.locator('.ship-plot').textContent(), /UNAVAILABLE/);
              await page.getByRole('button', {name: 'Current server sample', exact: true}).click();
              await page.getByRole('button', {name: 'rejoined sample', exact: true}).click();
            } else if (index === 1) {
              await page.getByRole('checkbox', {name: 'Missile launchers', exact: true}).check();
              await page.getByRole('button', {name: 'Use selected actions', exact: true}).click();
              await page.getByRole('combobox', {name: 'Missile launchers hit 1', exact: true}).selectOption('local-contact-1');
              await page.getByRole('button', {name: 'Commit target assignments', exact: true}).click();
              assert.match(await page.getByRole('status', {name: 'Prepared weapon result'}).textContent(), /committed/);
              await page.getByRole('button', {name: 'Damaged weapon sample', exact: true}).click();
              assert.ok(await page.getByRole('button', {name: 'Use selected actions', exact: true}).isDisabled());
            } else if (index === 2) {
              await page.getByRole('button', {name: 'Bravo sample', exact: true}).click();
              await page.getByRole('button', {name: 'Show Short Range loss sample', exact: true}).click();
              assert.match(await page.getByRole('status', {name: 'Prepared fighter result'}).textContent(), /Other wings retain/);
            } else if (index === 3) {
              await page.getByRole('combobox', {name: 'Security Teams committed', exact: true}).selectOption('2');
              await page.getByRole('button', {name: 'Commit defence', exact: true}).click();
              assert.match(await page.getByRole('status', {name: 'Prepared boarding result'}).textContent(), /2 Security Teams/);
              await page.getByRole('button', {name: 'Commander sample', exact: true}).click();
              await page.getByRole('button', {name: /Lead at Aegis/}).click();
              await page.getByRole('button', {name: 'Support sample', exact: true}).click();
              await page.getByRole('button', {name: 'Move Pallas to Dione', exact: true}).click();
              await page.getByRole('button', {name: 'Militia sample', exact: true}).click();
              await page.getByRole('checkbox', {name: 'Roll two dice per Security Team', exact: true}).check();
              await page.getByRole('combobox', {name: 'Front-line dice', exact: true}).selectOption('2');
              await page.getByRole('button', {name: 'Commit defence', exact: true}).click();
              for (const source of ['AEGIS', 'Pallas']) {
                await page.getByRole('button', {name: `${source} reroll sample`, exact: true}).click();
                await page.getByRole('checkbox', {name: 'Aegis die 1: 1', exact: true}).check();
                await page.getByRole('button', {name: 'Reroll selected dice', exact: true}).click();
                assert.match(await page.getByRole('status', {name: 'Prepared boarding result'}).textContent(), new RegExp(`${source} chose 1`));
              }
              await page.getByRole('button', {name: 'Ruling sample', exact: true}).click();
              assert.ok(await page.getByRole('button', {name: 'Record facilitator ruling', exact: true}).isDisabled());
              await page.getByRole('textbox', {name: 'Facilitator ruling', exact: true}).fill('Prepared adjudication retained.');
              await page.getByRole('button', {name: 'Record facilitator ruling', exact: true}).click();
              assert.match(await page.getByRole('region', {name: 'Facilitator ruling for destroyed Commander-led parties'}).textContent(), /Prepared adjudication retained/);
              assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px full boarding choices: horizontal overflow`);
            } else {
              await page.getByRole('button', {name: 'Offline sample', exact: true}).click();
              assert.match(await page.getByRole('region', {name: 'Wolf attack status'}).textContent(), /Attack complete/);
              await page.getByRole('button', {name: 'Reconnect sample', exact: true}).click();
              assert.match(await page.getByRole('status', {name: 'Prepared recovery result'}).textContent(), /same committed/);
            }
            await page.screenshot({path: `${directory}/${width}x${height}-${reducedMotion}-step-${index + 1}.png`, fullPage: true});
          }
          assert.equal(await page.getByRole('link', {name: 'Return to station and console chooser'}).getAttribute('href'), '/#/');
          assert.deepEqual(errors, []);
          assert.deepEqual(writes, []);
          cases.push({width, height, reducedMotion, steps: labels.length, errors, writes});
        } catch (error) {
          await page.screenshot({path: `${directory}/${width}x${height}-${reducedMotion}-failure.png`, fullPage: true});
          throw error;
        } finally {
          await page.close();
        }
      }
    }
    await writeFile(`${directory}/summary.json`, `${JSON.stringify({boundary: 'prepared-real-presenter-ui-only', cases, completedAt: new Date().toISOString()}, null, 2)}\n`);
  } finally {
    await browser?.close();
    await server.close();
  }
});
