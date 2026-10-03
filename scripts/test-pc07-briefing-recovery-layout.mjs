import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const evidence=process.env.PC07_RENDER_EVIDENCE_DIR??'/tmp/pc07-briefing-recovery-layout';
const mock=`window.pc07BriefingLayout = true; export async function clearTurnAdvanceInterstitial(){throw new Error('The CIC connection could not confirm the clearance. Reconnect and retry this same briefing.');}`;
test('held briefing and recovery messages remain readable without covering the transmission',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent',plugins:[{name:'pc07-briefing-recovery-layout',enforce:'pre',
  resolveId(id){return id==='@/lib/turnInterstitialService'||/\/src\/lib\/turnInterstitialService(?:\.ts)?$/.test(id)?'\0pc07-layout-clear':null;},
  load(id){return id==='\0pc07-layout-clear'?mock:null;}}]});let browser;
 try{await server.listen();await mkdir(evidence,{recursive:true});const {port}=server.httpServer.address();browser=await chromium.launch({channel:'chrome',headless:true});
  for(const reducedMotion of ['no-preference','reduce'])for(const [width,height]of[[320,844],[844,390]])for(const state of ['offline','error']){
   const page=await browser.newPage({viewport:{width,height},reducedMotion});
   try{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.goto(`http://127.0.0.1:${port}/scripts/pc07-briefing-review.html?initial&${state}`);
    const clear=page.getByRole('button',{name:'Clear cycle briefing // resume clock'});await clear.waitFor();await page.evaluate(()=>document.fonts.ready);
    if(state==='error'){await clear.click();await page.getByRole('alert').waitFor();}
    else assert.equal(await clear.isDisabled(),true);
    // Native browser time exercises the long first-cycle narrative, not a fake frame clock.
    await page.locator('.turn-start-announcement__console[data-slide="4"]').waitFor({timeout:20000});
    const signal=await page.locator('.intrusion__signal').boundingBox();const control=await page.locator('.turn-interstitial-clear').boundingBox();
    assert.ok(signal.y+signal.height<=control.y+1,`${width}x${height}/${state}: transmission and recovery do not overlap`);
    const result=await page.locator('.turn-interstitial-clear').evaluate(e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth,scroll:e.scrollHeight>e.clientHeight};});
    assert.ok(result.top>=0&&result.bottom<=height);assert.equal(result.overflow,false);assert.equal(result.scroll,false);
    await page.screenshot({path:`${evidence}/${width}x${height}-${reducedMotion}-${state}.png`,fullPage:true});
   }finally{await page.close();}
  }
 }finally{await browser?.close();await server.close();}
});
