import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const directory=process.env.PC07_SCENE_EVIDENCE_DIR;
assert.ok(directory,'An external evidence directory is required.');
const labels=['1 Groups and DRADIS','2 Known systems','3 Taxi and rejoin','4 Attack lifecycle','5 Recovery'];
test('PC07 prepared scene keeps all five checks usable and isolated in eight responsive/motion cases',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent'});
 let browser;const cases=[];
 try{
  await mkdir(directory,{recursive:true});await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true});const address=server.httpServer.address();
  for(const reducedMotion of ['no-preference','reduce'])for(const[width,height]of[[320,844],[390,844],[844,390],[1440,900]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion});const failures=[],requests=[];
   page.on('pageerror',error=>failures.push(error.message));
   page.on('request',request=>{if(request.method()!=='GET'||!/^(?:localhost|127\.0\.0\.1)$/.test(new URL(request.url()).hostname))requests.push({method:request.method(),url:request.url()});});
   try{
    await page.goto(`http://127.0.0.1:${address.port}/pc07-review.html`);
    await page.getByRole('note',{name:'Prepared review boundary'}).waitFor();
    const skip=page.getByRole('link',{name:'Skip to review workspace'});
    await page.keyboard.press('Tab');assert.ok(await skip.evaluate(e=>document.activeElement===e&&e.getBoundingClientRect().top>=0));
    const navigation=page.getByRole('navigation',{name:'PC07 review steps'});
    for(const label of labels){
     await navigation.getByRole('button',{name:label,exact:true}).click();
     assert.equal(await navigation.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width} ${label}: root overflow`);
     const bounds=await page.locator('main button,main select,main textarea,main input').evaluateAll(elements=>elements.filter(e=>{
      const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1||r.right>document.documentElement.clientWidth+1);
     }).map(e=>e.textContent));assert.deepEqual(bounds,[],`${width} ${label}: clipped controls`);
     const size=await page.locator('.pc07-review__controls button,.pc07-review__step-controls button,.fleet-group-workspace button').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height<44).map(e=>e.textContent));
     assert.deepEqual(size,[],`${width} ${label}: touch target`);
     const fonts=await page.locator('.pc07-review__intro h2').evaluateAll(es=>es.map(e=>{
      const s=getComputedStyle(e),n=v=>v.replace(/["']/g,'').replace(/\s+/g,'').toLowerCase();return n(s.fontFamily)===n(s.getPropertyValue('--cic-display'));
     }));assert.ok(fonts.every(Boolean),'Actual CIC display font');
     if(label.startsWith('1')){
      await page.getByRole('textbox',{name:'Note to your fleet group'}).fill('LOCAL GROUP NOTE');
      await page.getByRole('button',{name:'Send group note',exact:true}).click();
      assert.match(await page.getByRole('list',{name:'Current group announcements'}).textContent(),/LOCAL GROUP NOTE/);
      await page.getByRole('button',{name:'View Fleet-2 sample',exact:true}).click();
      assert.doesNotMatch(await page.getByRole('list',{name:'Current group announcements'}).textContent(),/LOCAL GROUP NOTE/);
      await page.getByRole('button',{name:'Cached connection sample',exact:true}).click();
      assert.match(await page.locator('.ship-plot').textContent(),/UNAVAILABLE/);
      await page.getByRole('button',{name:'Current server sample',exact:true}).click();
     }
     if(label.startsWith('2')){
      assert.deepEqual(await page.getByRole('combobox',{name:'Scanned system to share'}).locator('option').allTextContents(),['3145','3155']);
      await page.getByRole('checkbox',{name:'ICEBREAKER',exact:true}).check();
      await page.getByRole('combobox',{name:'Scanned system to share'}).selectOption('3155');
      await page.getByRole('button',{name:'Share scanned system',exact:true}).click();
      assert.match(await page.getByRole('status',{name:'Known system sample result'}).textContent(),/3155 \/\/ ICEBREAKER/);
      await page.getByRole('button',{name:'Cached knowledge sample',exact:true}).click();
      assert.ok(await page.getByRole('button',{name:'Share scanned system',exact:true}).isDisabled());
      await page.getByRole('button',{name:'Current knowledge sample',exact:true}).click();
     }
     if(label.startsWith('3')){
      await page.getByRole('combobox',{name:'Fuel units'}).selectOption('2');
      await page.getByRole('button',{name:'Send scout taxi',exact:true}).click();
      assert.match(await page.getByRole('status',{name:'Taxi sample result'}).textContent(),/2 fuel/);
      assert.ok(await page.getByRole('button',{name:'Send scout taxi',exact:true}).isDisabled());
      await page.getByRole('button',{name:'Arrival at the same fix sample',exact:true}).click();
      await page.getByRole('button',{name:'Rejoin co-located sample',exact:true}).click();
      assert.match(await page.getByRole('status',{name:'Rejoin sample result'}).textContent(),/pursuit 4 retained/);
     }
     if(label.startsWith('4')){
      const choices=page.getByRole('region',{name:'Actual prepared attack choices'});
      assert.match(await choices.getByRole('note',{name:'Prepared choice examples'}).textContent(),/Independent local examples/);
      for(const select of await choices.locator('select').all()){
       await select.scrollIntoViewIfNeeded();
       const size=await select.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {font:parseFloat(s.fontSize),height:r.height};});
       assert.ok(size.font>=16&&size.height>=44,`${width}px solo actual choice select: ${size.font}px / ${size.height}px`);
      }
      for(const input of await choices.locator('input[type="radio"],input[type="checkbox"]').all()){
       const size=await input.evaluate(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,labelHeight:e.closest('label').getBoundingClientRect().height};});
       assert.ok(size.width>=20&&size.height>=20&&size.labelHeight>=44,'Prepared choice checkbox/radio and label geometry');
      }
      await choices.getByRole('radio',{name:'AEGIS',exact:true}).check();
      await choices.getByRole('button',{name:'Protect selected ship',exact:true}).click();
      assert.match(await choices.getByRole('status',{name:'Prepared choice callback result'}).textContent(),/Local Captain choice: AEGIS/);
      await choices.getByRole('button',{name:'Show locked hit targets sample',exact:true}).click();
      await choices.getByRole('combobox',{name:'Missile launchers hit 1',exact:true}).selectOption('local-contact-1');
      await choices.getByRole('combobox',{name:'Missile launchers hit 2',exact:true}).selectOption('local-contact-2');
      await choices.getByRole('button',{name:'Commit target assignments',exact:true}).click();
      assert.match(await choices.getByRole('status',{name:'Prepared choice callback result'}).textContent(),/2 local contacts; 1 hit unused/);
      await choices.getByRole('combobox',{name:'Security Teams committed',exact:true}).selectOption('0');
      await choices.getByRole('button',{name:'Commit defence',exact:true}).click();
      assert.match(await choices.getByRole('region',{name:'AEGIS boarding defence'}).textContent(),/0 Security Teams committed/);
      const summary=choices.getByRole('region',{name:'Current attack choices',exact:true});
      await choices.getByRole('button',{name:'Offline decision summary sample',exact:true}).click();
      assert.doesNotMatch(await summary.textContent(),/Prepared EO/);
      await choices.getByRole('button',{name:'Restore choice examples',exact:true}).click();
      assert.match(await summary.textContent(),/Prepared EO \/\/ Reconnect pending/);
      await page.getByRole('button',{name:'Declare attack sample',exact:true}).click();
      await page.getByRole('button',{name:'Pause attack sample',exact:true}).click();
      assert.ok(await page.getByRole('button',{name:'Pass charged weapon sample',exact:true}).isDisabled());
      await page.getByRole('button',{name:'Reconnect attack sample',exact:true}).click();
      await page.getByRole('button',{name:'Pass charged weapon sample',exact:true}).click();
      assert.equal(await page.getByRole('list',{name:'Committed attack results'}).locator('li').count(),3);
      await page.getByRole('button',{name:'Commit boarding sample',exact:true}).click();
      assert.match(await page.getByRole('status',{name:'Attack sample result'}).textContent(),/airspace opens once/);
     }
     if(label.startsWith('5')){
      await page.getByRole('button',{name:'Offline recovery sample',exact:true}).click();
      assert.ok(await page.getByRole('button',{name:'Clear cycle briefing // resume clock',exact:true}).isDisabled());
      await page.getByRole('button',{name:'Reconnect sample',exact:true}).click();
      await page.getByRole('button',{name:'Clear cycle briefing // resume clock',exact:true}).click();
      assert.match(await page.getByRole('status',{name:'Recovery sample result'}).textContent(),/5:00 preserved/);
     }
     await page.screenshot({path:`${directory}/${width}x${height}-${reducedMotion}-step${label[0]}.png`,fullPage:true});
    }
    assert.deepEqual(failures,[],'No runtime errors');assert.deepEqual(requests,[],'Prepared scene sends no auth/gameplay/write/external request');
    assert.equal(await page.getByRole('link',{name:'Return to station and console chooser'}).getAttribute('href'),'/#/');
    if(reducedMotion==='reduce')assert.ok(await page.locator('.pc07-review *').evaluateAll(es=>es.every(e=>getComputedStyle(e).animationDuration.split(',').every(v=>parseFloat(v)<=.001))));
    cases.push({width,height,reducedMotion,steps:5,isolated:true,geometry:true,fonts:true});
   }finally{await page.close();}
  }
  await writeFile(`${directory}/summary.json`,JSON.stringify({kind:'prepared-responsive-render-only',productionGameplay:false,cases,completedAt:new Date().toISOString()},null,2)+'\n');
 }finally{await browser?.close();await server.close();}
});
