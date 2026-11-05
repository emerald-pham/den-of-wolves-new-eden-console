import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {build,stop} from 'esbuild';
import {chromium} from 'playwright';
import {withProofBrowserCleanup} from './proof-tooling-browser-lifecycle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));

test('eligible Base research waits for the actual assigned shuttle link before classifying its route',async()=>{
  const source=await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs',import.meta.url),'utf8');
  const tree=ts.createSourceFile('base.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),callbacks=[];
  function visit(node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='researchCross')callbacks.push(node.initializer.getText(tree));
    ts.forEachChild(node,visit);
  }
  visit(tree);assert.equal(callbacks.length,1);
  const compiled=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {BrowserRouter} from 'react-router-dom';import AssignedShuttlecraft from './src/components/AssignedShuttlecraft';
    function App(){const [ready,setReady]=useState(false);window.__mountScientist=()=>setReady(true);
      return ready?<AssignedShuttlecraft roleId='shepherd-scientist'/>:<p>Loading original Scientist workspace</p>;}
    createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
  `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},
  loader:{'.png':'dataurl'},plugins:[{name:'inert-store-port',setup(builder){
    builder.onResolve({filter:/^@\/store\/useSessionStore$/},()=>({path:'store',namespace:'inert-store'}));
    builder.onLoad({filter:/.*/,namespace:'inert-store'},()=>({contents:
      `export const useSessionStore=selector=>selector({session:{id:'fixture-session',shuttleControl:{}},me:{uid:'original-scientist'}});`}));
  }}]});
  await withProofBrowserCleanup(async resources=>{
    resources.browserServer=await chromium.launchServer({headless:true});
    resources.browser=await chromium.connect(resources.browserServer.wsEndpoint());
    resources.context=await resources.browser.newContext();
    await resources.context.route('**/*',route=>route.request().isNavigationRequest()&&
      new URL(route.request().url()).hostname==='pc10-research.invalid'
      ?route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):route.abort());
    const page=await resources.context.newPage();page.setDefaultTimeout(1000);
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto('https://pc10-research.invalid/');await page.addScriptTag({content:compiled.outputFiles[0].text});
    await page.getByText('Loading original Scientist workspace',{exact:true}).waitFor();assert.deepEqual(pageErrors,[]);
    const actorUidHash=createHash('sha256').update('original-scientist').digest('hex').slice(0,16);
    const readiness={status:'eligible',surface:{page},actorUidHash},pending=[],checks={};let advanced=0;
    const consume=runInNewContext(`(${callbacks[0]})`,{
      currentRoleReadiness:async()=>readiness,pending:(...value)=>pending.push(value),checks,createHash,context:{},
      a:{state:async()=>({shuttleDockings:[{shuttleId:'endeavour',shipId:'shepherd'}],
        shuttleControl:{endeavour:{ownerRoleId:'shepherd-scientist',holderUid:'original-scientist'}}})},
      advanceBaseDetectorResearch:async()=>{
        assert.ok(await page.getByRole('link',{name:'Open Endeavour shuttle console',exact:true}).isVisible());advanced++;
        return {branches:{'detector-research-cross':{status:'committed'}}};
      },
    });
    await page.evaluate(()=>setTimeout(()=>window.__mountScientist(),100));
    assert.equal(await consume(1),true);assert.equal(advanced,1);
    assert.deepEqual(pending,[]);assert.equal(checks.separateScientistResearchCycle1,true);
  },{stopBuild:stop});
});
