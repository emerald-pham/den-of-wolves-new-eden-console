import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createPc07AuthenticatedSession} from './pc07-authenticated-session.mjs';
const directory=process.env.PC07_UI_EVIDENCE_DIR;assert.ok(directory,'External evidence directory required.');
const f=await createPc07AuthenticatedSession('PC07 normal local UI recovery',8,{clearBriefing:false});
let browser,page;const errors=[];
try{
 await mkdir(directory,{recursive:true});
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const origin=process.env.PC07_LOCAL_UI_ORIGIN??'http://127.0.0.1:5174';
 assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
 await page.goto(origin);
 await page.getByRole('button',{name:/^REDUCED MOTION/i}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Authorize local emulator GM',exact:true}).click();
 await page.getByText('GM access remains authorized on this device for 24 hours.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
 const joinCode=(await f.session.get()).get('joinCode');
 await page.getByRole('textbox',{name:'Session code',exact:true}).fill(joinCode);
 await page.getByRole('button',{name:'Join a session',exact:true}).click();
 await page.getByRole('dialog',{name:'CODE OF CONDUCT',exact:true}).waitFor();
 for(const checkbox of await page.getByRole('checkbox',{name:/^Acknowledge regulation/}).all())await checkbox.check();
 const acknowledge=page.getByRole('button',{name:'Acknowledge regulations and continue',exact:true});
 await acknowledge.waitFor();await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Acknowledge regulations and continue');return button&&!button.disabled;});
 await acknowledge.click();
 const clear=page.getByRole('button',{name:'Clear cycle briefing // resume clock',exact:true});
 await clear.waitFor({state:'visible',timeout:30000});
 const held=(await f.session.get()).get('turnPhase');assert.equal(held.timerPause.reason,'turn-interstitial');
 await page.screenshot({path:`${directory}/phone-held-current-clock.png`,fullPage:true});
 await context.setOffline(true);
 await page.waitForTimeout(300);
 await page.screenshot({path:`${directory}/phone-offline-before-assertion.png`,fullPage:true});
 await writeFile(`${directory}/offline-browser-state.json`,JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText(),clearanceCount:await page.locator('button').filter({hasText:'Clear cycle briefing // resume clock'}).count()},null,2)+'\n');
 assert.ok(await clear.isDisabled(),'Actual offline browser withdraws the current clearance');
 await page.screenshot({path:`${directory}/phone-offline-clearance.png`,fullPage:true});
 await context.setOffline(false);
 await clear.waitFor({state:'visible'});await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Clear cycle briefing // resume clock');return button&&!button.disabled;});
 await clear.click();await page.getByText('Cycle clock held // preserved time resumes when this briefing clears.',{exact:true}).waitFor({state:'hidden'});
 const resumed=(await f.session.get()).get('turnPhase');assert.equal(resumed.timerPause,undefined);
 const hold=(await f.db.doc(`sessions/${f.sessionId}/turnInterstitials/1`).get()).data();
 assert.equal(Date.parse(resumed.teamPhaseEndsAt)-Date.parse(hold.clearedAt),600000);
 assert.equal(resumed.airspace.state,'restricted');
 await page.reload();await page.waitForTimeout(1000);
 await writeFile(`${directory}/reload-link-state.json`,JSON.stringify({links:await page.locator('a').evaluateAll(elements=>elements.map(e=>({html:e.outerHTML,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height},display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,role:e.getAttribute('role')}))),accessibleLinks:await page.getByRole('link').allTextContents()},null,2)+'\n');
 await page.getByRole('link',{name:/GM join/i}).waitFor({timeout:20000});
 await page.getByRole('link',{name:/GM join/i}).click();
 await page.getByRole('textbox',{name:/^Input GM Name$/i}).fill('PC07 UI facilitator');
 // Reload restores a cache first; wait for the ordinary member read to finish.
 // This observes runtime freshness only. Identity and session writes stay in UI.
 await page.waitForFunction(async()=>{const {useSessionStore}=await import('/src/store/useSessionStore.ts');const s=useSessionStore.getState();return s.connection==='live'&&s.sessionSnapshotFreshness==='server';},{},{timeout:20000});
 await page.getByRole('button',{name:'Join as GM',exact:true}).click();
 await page.getByRole('button',{name:'GM joined',exact:true}).waitFor();
 await page.goto(`${origin}/#/gm`);
 await page.getByRole('heading',{name:/GM Console/i}).waitFor({timeout:20000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.ship-plot')].some(plot=>plot.textContent.includes('DRADIS // LOCAL PLOT')&&!plot.textContent.includes('UNAVAILABLE')));
 await page.screenshot({path:`${directory}/phone-normal-gm-console.png`,fullPage:true});
 await page.screenshot({path:`${directory}/phone-normal-gm-viewport.png`});
 let maintenanceProof=false;
 if(process.env.PC07_UI_MAINTENANCE==='1'){
  await page.goto(`${origin}/#/roles`);
  await page.getByRole('button',{name:/^Open station catalog/i}).click();
  await page.getByRole('link',{name:'View AEGIS station overview',exact:true}).click();
  await page.getByRole('link',{name:'View ship consoles',exact:true}).click();
  const access=page.getByRole('button',{name:'GM ship console read write access',exact:true});
  await access.click();
  await page.getByRole('alertdialog',{name:'Are you sure?',exact:true}).getByRole('button',{name:'ARE YOU SURE?',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="GM ship console read write access"]')?.getAttribute('aria-pressed')==='true');
  const cycle=page.getByRole('region',{name:'AEGIS maintenance cycle',exact:true});
  const current=await f.session.get();const resources=current.get('shipResources.aegis');
  async function clickCurrent(name){
   const button=cycle.getByRole('button',{name,exact:true}).and(page.locator(':enabled'));
   await button.waitFor({state:'visible',timeout:20000});await button.click();
  }
  await clickCurrent('Begin Maintenance Cycle: Cycle 1');await clickCurrent('ARE YOU SURE?');
  await clickCurrent('Check storage');
  await cycle.getByRole('combobox',{name:'Food ration level',exact:true}).selectOption('1');
  await cycle.getByRole('combobox',{name:'Water ration level',exact:true}).selectOption('1');
  await clickCurrent('Proceed with rations');await clickCurrent('Run unrest check');await clickCurrent('Run riot check');
  await cycle.getByRole('checkbox',{name:/^Jump Drive$/i}).check();
  await clickCurrent('Power up reactor');await clickCurrent('ARE YOU SURE?');
  await clickCurrent('Proceed with refuelling');await clickCurrent('Proceed with refuelling');
  await clickCurrent('End maintenance cycle');
  await page.waitForFunction(async()=>{const{useSessionStore}=await import('/src/store/useSessionStore.ts');return Boolean(useSessionStore.getState().session?.maintenanceCycles?.aegis?.completedAt);});
  let completed=(await f.session.get()).data();
  for(let attempt=0;!completed.maintenanceCycles.aegis.completedAt&&attempt<30;attempt++){
   await new Promise(resolve=>setTimeout(resolve,100));completed=(await f.session.get()).data();
  }
  const ledger=completed.maintenanceCycles.aegis;
  await writeFile(`${directory}/maintenance-authoritative-ledger.json`,JSON.stringify({ledger,
   resourcesBefore:resources,resourcesAfter:completed.shipResources.aegis,identitiesRetained:false},null,2)+'\n');
  assert.equal(ledger.turn,1);assert.ok(ledger.completedAt);assert.ok(ledger.charges.includes('jump-drive'));
  for(const step of ['1','2','3','4','5','6','7'])assert.ok(ledger.results[step],`Actual UI committed printed step ${step}`);
  assert.ok(completed.shipResources.aegis.food<resources.food);assert.ok(completed.shipResources.aegis.water<resources.water);
  assert.ok(await cycle.getByRole('button',{name:'Begin Maintenance Cycle: Cycle 1',exact:true}).isDisabled());
  await page.screenshot({path:`${directory}/phone-normal-aegis-maintenance.png`,fullPage:true});
  await page.getByRole('link',{name:/Change role/i}).click();
  await page.getByRole('link',{name:/Back to fleet/i}).click();
  assert.ok(await page.getByRole('link',{name:'View AEGIS station overview',exact:true}).isVisible());
  maintenanceProof=true;
 }
 assert.deepEqual(errors,[]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
 await writeFile(`${directory}/summary.json`,JSON.stringify({kind:'normal-authenticated-local-emulator-ui',checks:{normalJoin:true,realServerHeldClock:true,offlineControlDisabled:true,reconnectRestoresClear:true,normalClearPreservesTenMinutes:true,restrictedTeamAfterClear:true,normalReload:true,ordinaryNamedGmJoin:true,currentServerDradisComposed:true,...(maintenanceProof?{ordinaryScopedGmGrant:true,normalAegisPrintedMaintenanceUi:true,sevenCommittedSteps:true,serverRationCostsAndCharge:true,secondCycleDisabled:true,stationNavigationReturned:true}:{})},productionGameplay:false,preparedReviewScene:false,identitiesRetained:false,completedAt:new Date().toISOString()},null,2)+'\n');
 console.log('PC07 normal local browser hold/reconnect/clear and named GM proof passed.');
}catch(error){if(page){await page.screenshot({path:`${directory}/failure.png`,fullPage:true});await writeFile(`${directory}/failure-state.json`,JSON.stringify({message:error.message,url:page.url(),errors,body:await page.locator('body').innerText(),links:await page.locator('a').evaluateAll(elements=>elements.map(e=>({html:e.outerHTML,aria:e.closest('[aria-hidden]')?.outerHTML.slice(0,300),inert:e.closest('[inert]')?.tagName})))},null,2)+'\n');}throw error;}finally{await browser?.close();await f.cleanup();}
