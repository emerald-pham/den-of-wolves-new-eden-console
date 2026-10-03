import assert from 'node:assert/strict';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const directory = process.env.PC07_CHOICE_EVIDENCE_DIR;
assert.ok(directory, 'An external evidence directory is required.');
const source = resolve('src/__pc07AttackChoiceLayout.tsx');
const html = resolve('__pc07-attack-choice-layout.html');

test('actual Captain, EO and target-crew choices remain readable and usable in eight viewport/motion cases', async () => {
  assert.ok(!existsSync(source) && !existsSync(html), 'Temporary harness paths must be unused.');
  writeFileSync(html, '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/__pc07AttackChoiceLayout.tsx"></script></body></html>');
  writeFileSync(source, `import {useState} from 'react';import {createRoot} from 'react-dom/client';import '@/index.css';
import {WolfForceFieldChoicePanelView} from '@/components/WolfForceFieldChoicePanel';
import {WolfRangeActionPanelView} from '@/components/WolfRangeActionPanel';
import {WolfBoardingDefencePanelView} from '@/components/WolfBoardingDefencePanel';
function Scene(){const[result,setResult]=useState('Prepared callback only; no native command sent.'),deadline='2026-10-03T12:10:00.000Z';
const range={type:'wolf-range-action-choice-view' as const,sessionId:'prepared',turn:1,revision:4,currentStep:'medium-range' as const,
range:'medium-range' as const,choiceStatus:'pending' as const,deadlineAt:deadline,eligibleActions:[
{actionId:'missile-medium',sourceId:'aegis-missile-launchers',range:'medium-range' as const},
{actionId:'pdl-medium',sourceId:'aegis-point-defence-lasers',range:'medium-range' as const}],hitSlots:[],contacts:[
{contactId:'contact-1',targetShipId:'aegis',available:true},{contactId:'contact-2',targetShipId:'dione',available:true}]};
return <main style={{padding:'1rem',width:'100%',minWidth:0,boxSizing:'border-box'}}><h1>Prepared attack choices</h1>
<p role="status" aria-label="Prepared callback result">{result}</p>
<WolfForceFieldChoicePanelView view={{type:'wolf-force-field-choice-view',sessionId:'prepared',turn:1,revision:2,attackId:'prepared-attack',
hostShipId:'aegis',dockingRevision:1,fleetGroupId:'fleet-1',choiceStatus:'pending',targetShipIds:['aegis','dione','refinery-124'],deadlineAt:deadline}}
onChoose={ship=>setResult('Prepared protection: '+ship)} onPass={()=>setResult('Prepared Force Field pass')}/>
<div aria-label="Prepared range use"><WolfRangeActionPanelView view={range} onUseActions={actions=>setResult('Prepared actions: '+actions.join(','))}
onPass={()=>setResult('Prepared range pass')} onAssignTargets={()=>setResult('Unexpected prepared target path')}/></div>
<div aria-label="Prepared hit targets"><WolfRangeActionPanelView view={{...range,revision:5,choiceStatus:'targets-required',
hitSlots:[{actionId:'missile-medium',count:3}]}} onUseActions={()=>{}} onPass={()=>{}}
onAssignTargets={targets=>setResult('Prepared targets: '+targets[0].contactIds.join(','))}/></div>
<WolfBoardingDefencePanelView view={{type:'wolf-boarding-defence-choice-view',sessionId:'prepared',turn:1,revision:6,targetShipId:'aegis',
boardingParties:2,availableSecurityTeams:3,choiceStatus:'pending',deadlineAt:deadline}} onChoose={teams=>setResult('Prepared defence: '+teams)}/>
</main>};createRoot(document.getElementById('root')!).render(<Scene/>);`);
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
  let browser;
  const cases = [];
  try {
    await mkdir(directory, { recursive: true }); await server.listen();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const reducedMotion of ['no-preference', 'reduce']) for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
      const errors = [], writes = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.method() !== 'GET') writes.push(request.method()); });
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      try {
        await page.goto(`${origin}/__pc07-attack-choice-layout.html`); await page.evaluate(() => document.fonts.ready);
        for (const select of await page.locator('select').all()) {
          await select.scrollIntoViewIfNeeded();
          const geometry = await select.evaluate(element => {
            const r = element.getBoundingClientRect(), s = getComputedStyle(element);
            return { font: parseFloat(s.fontSize), height: r.height, family: s.fontFamily, mono: s.getPropertyValue('--cic-mono'),
              left: r.left, right: r.right, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === element };
          });
          assert.ok(geometry.font >= 16, `${width}px actual choice select has ${geometry.font}px text`);
          assert.ok(geometry.height >= 44 && geometry.left >= -1 && geometry.right <= width + 1 && geometry.hit, 'Choice input must be reachable');
          const normalize = value => value.replace(/["']/g, '').replace(/\s+/g, '').toLowerCase();
          assert.equal(normalize(geometry.family), normalize(geometry.mono), 'Choice input uses actual CIC mono');
        }
        for (const input of await page.locator('input[type="checkbox"],input[type="radio"]').all()) {
          const box = await input.evaluate(element => {
            const label = element.closest('label'), r = label.getBoundingClientRect(), s = getComputedStyle(label);
            return { width: element.getBoundingClientRect().width, height: r.height, font: parseFloat(s.fontSize), left: r.left, right: r.right };
          });
          assert.ok(box.width >= 20 && box.height >= 44 && box.font >= 14 && box.left >= -1 && box.right <= width + 1, 'Readable, tappable choice label');
        }
        for (const copy of await page.locator('[class$="__notice"],[class$="__detail"],[class$="__deadline"],[class$="__unused"]').all()) {
          assert.ok(await copy.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 14, 'Decision body copy is readable');
        }
        const result = page.getByRole('status', { name: 'Prepared callback result' });
        await page.getByRole('radio', { name: 'AEGIS', exact: true }).check();
        const protect = page.getByRole('button', { name: 'Protect selected ship' });
        await protect.focus(); await page.keyboard.press('Enter'); assert.match(await result.textContent(), /Prepared protection: aegis/);
        const use = page.getByLabel('Prepared range use');
        await use.getByRole('checkbox', { name: 'Missile launchers' }).check();
        await use.getByRole('button', { name: 'Use selected actions' }).click(); assert.match(await result.textContent(), /Prepared actions: missile-medium/);
        const targets = page.getByLabel('Prepared hit targets');
        await targets.getByRole('combobox', { name: 'Missile launchers hit 1' }).selectOption('contact-1');
        await targets.getByRole('combobox', { name: 'Missile launchers hit 2' }).selectOption('contact-2');
        await targets.getByRole('button', { name: 'Commit target assignments' }).click(); assert.match(await result.textContent(), /Prepared targets: contact-1,contact-2/);
        await page.getByRole('combobox', { name: 'Security Teams committed' }).selectOption('0');
        await page.getByRole('button', { name: 'Commit defence' }).click(); assert.match(await result.textContent(), /Prepared defence: 0/);
        for (const button of await page.getByRole('button').all()) {
          assert.ok(await button.evaluate(element => element.getBoundingClientRect().height) >= 44, 'Action button has a 44px target');
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'No horizontal overflow');
        assert.deepEqual(errors, []); assert.deepEqual(writes, [], 'Prepared render sends no native write');
        await page.screenshot({ path: `${directory}/${width}x${height}-${reducedMotion}.png`, fullPage: true });
        cases.push({ width, height, reducedMotion, actualChoiceControls: true, cicFont: true, nativeWrites: false });
      } catch (error) {
        await page.screenshot({ path: `${directory}/${width}x${height}-${reducedMotion}-failure.png`, fullPage: true }); throw error;
      } finally { await page.close(); }
    }
    await writeFile(`${directory}/summary.json`, JSON.stringify({ kind: 'prepared-current-attack-choice-render-only', cases, completedAt: new Date().toISOString() }, null, 2) + '\n');
  } finally { await browser?.close(); await server.close(); unlinkSync(source); unlinkSync(html); }
});
