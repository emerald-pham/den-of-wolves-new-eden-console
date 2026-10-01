import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('PC06 solo scene fits phone, short landscape and desktop in both motion modes', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const reducedMotion of ['no-preference', 'reduce']) {
      for (const [width, height] of [[320,844], [390,844], [844,390], [1440,900]]) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
        try {
          await page.goto(`http://127.0.0.1:${address.port}/pc06-review.html`);
          await page.getByRole('note', { name: 'Synthetic review boundary' }).waitFor();
          assert.match(await page.title(), /PC06/);
          const skip = page.getByRole('link', { name: 'Skip to review step' });
          assert.ok(await skip.evaluate(element => element.getBoundingClientRect().bottom <= 0), 'skip link is outside the viewport until keyboard focus');
          await page.keyboard.press('Tab');
          assert.ok(await skip.evaluate(element => document.activeElement === element && element.getBoundingClientRect().top >= 0), 'keyboard focus reveals the skip link');
          await page.keyboard.press('Tab');
          assert.ok(await skip.evaluate(element => element.getBoundingClientRect().bottom <= 0), 'skip link hides after focus leaves');

          const steps = page.getByRole('navigation', { name: 'PC06 review steps' });
          for (const name of ['1 Movement','2 Cargo and trade','3 Scouting','4 Away mission']) {
            await steps.getByRole('button', { name, exact:true }).click();
            if (name === '1 Movement') {
              for (const [id, shipName, bands] of [
                ['shepherd', 'Shepherd', 'S 3 // M 6 // L 12'],
                ['quellon', 'Quellon', 'S 2 // M 4 // L 8'],
                ['refinery-124', 'Refinery 124', 'S 2 // M 4 // L 8'],
                ['capybara', 'Capybara', 'S 3 // M 6 // L 12'],
              ]) {
                await page.getByRole('combobox', {name:'Fleet Jump Drive preview vessel'}).selectOption(id);
                const drive = page.getByRole('region', {name:`${shipName} Jump Drive control`});
                assert.ok(await drive.getByText(`Cost bands // ${bands}`, {exact:true}).isVisible());
                assert.ok(await drive.getByRole('button', {name:/Jump to/i}).isDisabled());
              }
              await page.getByRole('combobox', {name:'Fleet Jump Drive preview vessel'}).selectOption('aegis');
            }
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(scrollWidth <= width, `${width}x${height} ${reducedMotion} ${name}: ${scrollWidth}px overflow`);
            const inaccessibleControls = await page.locator('.pc06-review button, .pc06-review select').evaluateAll(elements => elements.filter(element => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
            }).map(element => element.textContent));
            assert.deepEqual(inaccessibleControls, [], `${width}x${height} ${name}: offscreen controls`);
            if (name === '2 Cargo and trade') {
              const repair = page.getByRole('region', {name:'Repair Drones review sample'});
              assert.ok(await repair.getByRole('heading', {name:'Gorgoneion Repair Drones',exact:true}).evaluate(element => {
                const style = getComputedStyle(element);
                const normalize = value => value.replace(/["']/g, '').replace(/\s+/g, '').toLowerCase();
                return normalize(style.fontFamily) === normalize(style.getPropertyValue('--cic-display')) && Number.parseFloat(style.fontSize) >= 16;
              }), 'repair heading uses the actual CIC display font and readable size');
              await repair.getByRole('combobox', {name:'Gorgoneion repair console'}).selectOption('jump-drive');
              await repair.getByRole('button', {name:'Repair one console',exact:true}).click();
              assert.match(await repair.getByRole('status', {name:'Repair sample result'}).textContent(), /local.*repaired.*3.*no production/i);
              assert.ok(await repair.getByRole('button', {name:'Repair one console',exact:true}).isDisabled());
              await repair.getByRole('button', {name:'Competing repair sample',exact:true}).click();
              assert.match(await repair.getByRole('status', {name:'Repair sample result'}).textContent(), /changed.*refresh/i);
              await repair.getByRole('button', {name:'Refresh repair sample',exact:true}).click();
              assert.match(await repair.getByRole('status', {name:'Repair sample result'}).textContent(), /refreshed.*already repaired/i);
              const repairControls = await repair.locator('button, select').evaluateAll(elements => elements.filter(element => {
                const rect = element.getBoundingClientRect(); return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
              }).map(element => element.textContent));
              assert.deepEqual(repairControls, [], 'repaired sample controls remain contained');
              await page.getByRole('button', {name:'Load 1 food onto Capybara',exact:true}).click();
              await page.getByRole('button', {name:'Accept exact offer from Juno Reyes',exact:true}).click();
              assert.match(await page.getByRole('region',{name:'Your held tokens'}).textContent(), /Fuel 3/);
            } else if (name === '3 Scouting') {
              await page.getByLabel('Note to your fleet group').fill('Fleet two stays here.');
              await page.getByRole('button',{name:'Send group note',exact:true}).click();
              assert.match(await page.getByRole('region',{name:'Fleet group communication'}).textContent(), /Fleet two stays here/);
              assert.doesNotMatch(await page.getByRole('region',{name:'Fleet 1 sample view'}).textContent(), /Fleet two stays here/);
              await page.getByRole('button',{name:'Reveal Hummingbird scout at 6798',exact:true}).click();
              assert.match(await page.getByRole('region',{name:'Hummingbird scout report'}).textContent(), /Site L/);
              assert.doesNotMatch(await page.getByRole('region',{name:'Fleet 1 sample view'}).textContent(), /Site L/);
            } else if (name === '4 Away mission') {
              await page.getByLabel('Opportunity for A♥').selectOption('explore');
              await page.getByLabel('Opportunity for 4♣').selectOption('recover');
              await page.getByRole('button',{name:'Submit mission assignments',exact:true}).click();
              assert.match(await page.getByRole('region',{name:'Away mission sample path'}).textContent(), /critical success.*total 17/i);
              await page.getByRole('button',{name:'Drop mission rewards at selected ship',exact:true}).click();
              await page.getByRole('button',{name:'Reconnect sample',exact:true}).click();
              assert.match(await page.getByRole('status',{name:'Mission sample result'}).textContent(), /reconnected view/i);
            }
            await page.screenshot({path:`/tmp/pc06-review-${width}x${height}-${reducedMotion}-step${name[0]}.png`,fullPage:true});
          }
          await steps.getByRole('button', { name:'1 Movement', exact:true }).click();
          await page.getByRole('region',{name:'Voyage 33-0 movement'}).getByRole('button',{name:'Dock with Dione',exact:true}).click();
          await page.getByRole('region',{name:'Voyage 33-0 movement'}).getByRole('button',{name:/Jump to Pallas/}).click();
          assert.match(await page.getByRole('status',{name:'Movement sample result'}).textContent(),/local review only/i);
          const smallCraft = page.getByRole('region',{name:'Small-craft Jump Drive review sample'});
          await smallCraft.getByRole('button',{name:'Charge Jump Drive',exact:true}).click();
          assert.match(await smallCraft.getByRole('status',{name:'Small-craft Jump Drive sample result'}).textContent(),/local simulation.*charge ready.*no production charge/i);
          await smallCraft.getByRole('combobox',{name:'Known destination'}).selectOption('5143');
          await smallCraft.getByRole('button',{name:'Execute jump',exact:true}).click();
          await smallCraft.getByText('Arrival knowledge recorded for this Captain',{exact:true}).click();
          assert.match(await smallCraft.textContent(),/Current coordinate5143[\s\S]*Docked hostDetached[\s\S]*Arrival knowledge recorded for this Captain/i);
          assert.match(await smallCraft.getByRole('status',{name:'Small-craft Jump Drive sample result'}).textContent(),/local simulation.*arrival knowledge.*no production jump/i);
          await page.screenshot({path:`/tmp/pc06-review-${width}x${height}-${reducedMotion}-smallcraft-arrival.png`,fullPage:true});
          await smallCraft.getByRole('button',{name:'Stale-origin sample',exact:true}).click();
          await smallCraft.getByRole('combobox',{name:'Known destination'}).selectOption('5143');
          await smallCraft.getByRole('button',{name:'Execute jump',exact:true}).click();
          assert.match(await smallCraft.getByRole('status',{name:'Small-craft Jump Drive sample result'}).textContent(),/stale-origin sample.*refresh/i);
          await smallCraft.getByRole('button',{name:'Refresh movement projection',exact:true}).click();
          assert.ok(await smallCraft.getByText('0101',{exact:true}).isVisible());
          assert.match(await smallCraft.getByRole('status',{name:'Small-craft Jump Drive sample result'}).textContent(),/recovered sample.*no retry/i);
          await page.screenshot({path:`/tmp/pc06-review-${width}x${height}-${reducedMotion}-smallcraft-stale-recovery.png`,fullPage:true});
          if (reducedMotion === 'reduce') {
            assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),true);
            const animations = await page.locator('.pc06-review *').evaluateAll(elements => elements.map(element=>getComputedStyle(element).animationDuration));
            assert.ok(animations.every(duration => duration.split(',').every(value => Number.parseFloat(value) <= 0.001)),`${width}x${height}: active reduced-motion animation`);
          }
          await page.screenshot({path:`/tmp/pc06-review-${width}x${height}-${reducedMotion}.png`,fullPage:true});
        } finally { await page.close(); }
      }
    }
  } finally { await browser?.close(); await server.close(); }
});
