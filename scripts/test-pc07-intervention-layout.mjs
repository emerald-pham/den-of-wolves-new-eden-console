import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const directory=process.env.PC07_INTERVENTION_EVIDENCE_DIR;
assert.ok(directory,'An external evidence directory is required.');
const source=resolve('src/__pc07InterventionLayout.tsx'),html=resolve('__pc07-intervention-layout.html');
test('actual GM attack intervention forms stay readable and reachable in eight responsive/motion cases',async()=>{
 assert.ok(!existsSync(source)&&!existsSync(html),'Temporary harness must have an unused path.');
 writeFileSync(html,'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/__pc07InterventionLayout.tsx"></script></body></html>');
 writeFileSync(source,`import {useState} from 'react';import {createRoot} from 'react-dom/client';
import '@/index.css';import WolfAttackRecoveryControl from '@/components/WolfAttackRecoveryControl';
import EmergencyTimerPauseControl from '@/components/EmergencyTimerPauseControl';
import GmWolfDecisionSummary from '@/components/GmWolfDecisionSummary';
function Scene(){const[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[result,setResult]=useState('Prepared geometry only; no native command sent.');
const now=Date.now(),phase={turn:2,teamPhaseEndsAt:new Date(now+300000).toISOString(),openAirspaceEndsAt:new Date(now+1200000).toISOString(),airspace:{state:'restricted' as const,tickerActive:true,pressAccess:false}};
return <main className="gm-console" style={{width:'100%',minWidth:0,padding:'1rem',boxSizing:'border-box'}}>
<section className="gm-console__module cic-frame"><h1 className="gm-console__section-title">Prepared intervention geometry</h1>
<WolfAttackRecoveryControl available busy={false} reason={reason} confirmed={confirmed} onReason={value=>{setReason(value);setConfirmed(false);}} onConfirm={setConfirmed} onRecover={()=>setResult('Prepared scoped recovery accepted.')}/><p role="status" aria-label="Prepared recovery result">{result}</p></section>
<EmergencyTimerPauseControl phase={phase} connection="live" attack={{turn:2,revision:4,currentStep:'targeting'}} authorityKey="prepared-gm"/>
<GmWolfDecisionSummary available currentStep="boarding" players={[{uid:'prepared-captain',displayName:'Captain Ari'}] as never}
summary={{commander:{status:'committed',actors:[]},commandAndControl:{status:'passed',actors:[]},
forceField:{status:'selected',targetShipId:'refinery-124',actor:{uid:'prepared-captain',connected:false}},
boarding:{status:'pending',targets:[{targetShipId:'refinery-124',status:'pending',boardingParties:2,
actors:[{uid:'prepared-captain',connected:false}]},{targetShipId:'shepherd',status:'committed',boardingParties:1,
securityTeams:2,actors:[]}]}}}/></main>}
createRoot(document.getElementById('root')!).render(<Scene/>);`);
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent'});let browser;const cases=[];
 try{
  await mkdir(directory,{recursive:true});await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true});const address=server.httpServer.address();
  const origin=`http://127.0.0.1:${address.port}`;
  for(const reducedMotion of ['no-preference','reduce'])for(const[width,height]of[[320,844],[390,844],[844,390],[1440,900]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion});const errors=[],writes=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{if(request.method()!=='GET')writes.push(request.method());});
   await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   try{
    await page.goto(`${origin}/__pc07-intervention-layout.html`);
    await page.getByText('Attack progress recovery',{exact:true}).click();await page.evaluate(()=>document.fonts.ready);
    const recovery=page.getByRole('textbox',{name:'Attack recovery reason'}),timer=page.getByRole('textbox',{name:'Attack timer intervention reason'});
    for(const input of [recovery,timer]){
     await input.scrollIntoViewIfNeeded();
     const geometry=await input.evaluate(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return{font:parseFloat(s.fontSize),height:r.height,family:s.fontFamily,mono:s.getPropertyValue('--cic-mono'),left:r.left,right:r.right,hit:hit===element};});
     assert.ok(geometry.font>=16,`${width} ${await input.getAttribute('aria-label')}: ${geometry.font}px input font`);
     assert.ok(geometry.height>=44&&geometry.left>=-1&&geometry.right<=width+1&&geometry.hit,'Input must be visible and pointer-reachable');
     const normalize=value=>value.replace(/["']/g,'').replace(/\s+/g,'').toLowerCase();
     assert.equal(normalize(geometry.family),normalize(geometry.mono),'Actual CIC mono input font');
    }
    const confirm=page.getByRole('checkbox',{name:'I confirm advancing the resolved targeting stage into Long Range.'});
    await confirm.scrollIntoViewIfNeeded();
    const label=await confirm.evaluate(element=>{const r=element.closest('label').getBoundingClientRect(),s=getComputedStyle(element.closest('label'));
      return{height:r.height,font:parseFloat(s.fontSize),left:r.left,right:r.right,input:element.getBoundingClientRect().width};});
    assert.ok(label.height>=44&&label.font>=14&&label.input>=20&&label.left>=-1&&label.right<=width+1,'Readable 44px confirmation label and 20px checkbox');
    assert.ok(await page.getByRole('button',{name:'Recover targeting progress'}).isDisabled());
    await recovery.fill('Retry this resolved targeting transition after reconnect.');await confirm.check();
    await page.getByRole('button',{name:'Recover targeting progress'}).click();
    assert.match(await page.getByRole('status',{name:'Prepared recovery result'}).textContent(),/Prepared scoped recovery accepted/);
    await timer.fill('Safety pause requested for the current declared attack.');
    assert.ok(await page.getByRole('button',{name:'Disarm interlock // Pause timer'}).isEnabled());
    const decisions=page.getByRole('region',{name:'Current attack choices'});
    assert.match(await decisions.textContent(),/Protecting Refinery 124/);
    assert.match(await decisions.textContent(),/Captain Ari \/\/ Reconnect pending/);
    assert.equal(await decisions.locator('button,input,textarea,select').count(),0,'GM decision summary is read-only');
    for(const element of await decisions.locator('p,h3,strong').all()){
     const geometry=await element.evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();
      return{font:parseFloat(s.fontSize),family:s.fontFamily,expected:s.getPropertyValue(node.tagName==='H3'?'--cic-display':'--cic-mono'),left:r.left,right:r.right};});
     const normalize=value=>value.replace(/["']/g,'').replace(/\s+/g,'').toLowerCase();
     assert.ok(geometry.font>=14&&geometry.left>=-1&&geometry.right<=width+1,'GM decision copy remains readable without overflow');
     assert.equal(normalize(geometry.family),normalize(geometry.expected),'GM decision summary uses actual CIC fonts');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'No root overflow');
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'Geometry fixture sends no native write');
    await page.screenshot({path:`${directory}/${width}x${height}-${reducedMotion}.png`,fullPage:true});
    cases.push({width,height,reducedMotion,readableInputs:true,reachable:true,cicFont:true,readOnlyDecisionSummary:true,nativeWrites:false});
   }catch(error){await page.screenshot({path:`${directory}/${width}x${height}-${reducedMotion}-failure.png`,fullPage:true});throw error;}
   finally{await page.close();}
  }
  await writeFile(`${directory}/summary.json`,JSON.stringify({kind:'prepared-current-GM-intervention-render-only',cases,completedAt:new Date().toISOString()},null,2)+'\n');
 }finally{await browser?.close();await server.close();unlinkSync(source);unlinkSync(html);}
});
