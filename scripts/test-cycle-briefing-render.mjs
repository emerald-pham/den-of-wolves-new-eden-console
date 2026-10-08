import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {build,preview} from 'vite';
import {chromium} from 'playwright';
const root=process.cwd();
const output=await mkdtemp(join(tmpdir(),'dow-cycle-render-build-'));
const evidence=resolve(process.env.CYCLE_RENDER_EVIDENCE ?? '/tmp/dow-cycle-render');
await mkdir(evidence,{recursive:true});
let server,browser;
const results=[];
try {
 await build({root,logLevel:'warn',build:{outDir:output,emptyOutDir:true,rollupOptions:{input:resolve(root,'scripts/fixtures/cycle-briefing.html')}}});
 server=await preview({root,logLevel:'warn',build:{outDir:output},preview:{host:'127.0.0.1',port:0}});
 const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1440,height:900}]) {
  for(const actor of ['gm','player']) {
   const context=await browser.newContext({viewport,reducedMotion:'reduce'});
   // This fixture imports only the actual presentation consumer. Never contact Firebase.
   await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
   const page=await context.newPage();
   await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/cycle-briefing.html?actor=${actor}`);
   await page.getByText('FLEET LINK AUTHORIZED',{exact:true}).waitFor();
   await page.evaluate(()=>document.fonts.ready);
   const metrics=await page.evaluate(()=>{
    const selectors=['.turn-start-announcement__message','.turn-start-announcement__readout-label','.turn-start-announcement__readout-value','.turn-interstitial-clear button'];
    const envelope=document.querySelector('.intrusion--fleet').getBoundingClientRect();
    return {viewport:{width:innerWidth,height:innerHeight},envelope:{x:envelope.x,width:envelope.width,height:envelope.height},scrollWidth:document.documentElement.scrollWidth,
     samples:selectors.flatMap(selector=>{const el=document.querySelector(selector);if(!el)return [];const s=getComputedStyle(el),r=el.getBoundingClientRect();return [{selector,family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,text:el.textContent,width:r.width,height:r.height}];})};
   });
   const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
   const dom=await cdp.send('DOM.getDocument');
   for(const sample of metrics.samples){const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:sample.selector});sample.paintedFonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
   const screenshot=join(evidence,`${actor}-${viewport.width}x${viewport.height}.png`);await page.screenshot({path:screenshot});
   results.push({actor,...metrics,screenshot});
   await context.close();
  }
 }
 await writeFile(join(evidence,'metrics.json'),JSON.stringify(results,null,2));
 // Negative control: released layout has 16px phone gutters and must fail this assertion.
 for(const result of results){
  assert.ok(Math.abs(result.envelope.x)<0.5 && Math.abs(result.envelope.width-result.viewport.width)<0.5,`blue envelope must reach screen edges for ${result.actor}/${result.viewport.width}: ${JSON.stringify(result.envelope)}`);
  assert.ok(result.scrollWidth<=result.viewport.width,`horizontal overflow ${result.actor}/${result.viewport.width}`);
  assert.equal(result.samples.some(x=>x.selector==='.turn-interstitial-clear button'),result.actor==='gm','clearance visibility must follow real actor role');
  for(const sample of result.samples){assert.ok(sample.width>0&&sample.height>0);assert.ok(sample.paintedFonts.length>0,'actual painted font required');assert.match(sample.family,/monospace/);}
 }
 console.log(`PASS 6 production-built consumer renders; actual painted font evidence: ${evidence}`);
}finally{await browser?.close();await server?.httpServer.close();await rm(output,{recursive:true,force:true});}
