import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const evidence=process.env.PC07_RENDER_EVIDENCE_DIR??'/tmp/pc07-briefing-layout';
const mock=`window.pc07BriefingLayout = true; export async function clearTurnAdvanceInterstitial(){}`;
test('cycle briefing clearance stays visible, reachable and readable in every viewport and motion mode',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent',plugins:[{name:'pc07-briefing-layout',enforce:'pre',
  resolveId(id){return id==='@/lib/turnInterstitialService'||/\/src\/lib\/turnInterstitialService(?:\.ts)?$/.test(id)?'\0pc07-layout-clear':null;},
  load(id){return id==='\0pc07-layout-clear'?mock:null;}}]});let browser;
 try{await server.listen();await mkdir(evidence,{recursive:true});const {port}=server.httpServer.address();browser=await chromium.launch({channel:'chrome',headless:true});
  for(const reducedMotion of ['no-preference','reduce'])for(const [width,height]of[[320,844],[390,844],[844,390],[1440,900]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion});
   try{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.goto(`http://127.0.0.1:${port}/scripts/pc07-briefing-review.html`);const clear=page.getByRole('button',{name:'Clear cycle briefing // resume clock'});await clear.waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.ok(await clear.evaluate(e=>e===document.activeElement),'clear receives initial focus');
    const check=await clear.evaluate(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return{bounds:r.toJSON(),font:s.fontFamily,paint:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.ok(check.paint,`${width}x${height}: clearance is topmost painted control`);assert.ok(check.bounds.height>=44);assert.ok(check.bounds.x>=0&&check.bounds.right<=width&&check.bounds.bottom<=height);assert.equal(check.overflow,false);assert.match(check.font,/SFMono-Regular/);
    const signal=page.locator('.intrusion__signal');const signalRect=await signal.boundingBox();const controlRect=await page.locator('.turn-interstitial-clear').boundingBox();
    assert.ok(signalRect.y+signalRect.height<=controlRect.y+1,`${width}x${height}: transmission and action do not overlap`);
    await page.screenshot({path:`${evidence}/${width}x${height}-${reducedMotion}.png`,fullPage:true});
    await page.keyboard.press('Enter');
   }finally{await page.close();}
  }
 }finally{await browser?.close();await server.close();}
});
