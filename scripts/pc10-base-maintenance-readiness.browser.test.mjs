import assert from 'node:assert/strict';
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

test('eligible Base maintenance waits for the actual workspace before deciding it is unavailable',async()=>{
  const source=await readFile(new URL('./pc10-base-gameplay-composed-post-combat.mjs',import.meta.url),'utf8');
  const tree=ts.createSourceFile('base.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const callbacks=[];
  function visit(node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='paidMaintenance')callbacks.push(node.initializer.getText(tree));
    ts.forEachChild(node,visit);
  }
  visit(tree);assert.equal(callbacks.length,1);
  const compiled=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import MaintenanceSystems from './src/components/MaintenanceSystems';
    function App(){const [ready,setReady]=useState(false),[open,setOpen]=useState(false);
      window.__mountMaintenance=()=>setReady(true);
      if(!ready)return <p>Loading current original console</p>;
      return open?<MaintenanceSystems name='AEGIS' shipId='aegis' systems={[]}
        renderSystem={()=>null} rations={null}/>:<button onClick={()=>setOpen(true)}>Maintenance</button>;}
    createRoot(document.getElementById('root')).render(<App/>);
  `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':resolve(root,'src')},
  loader:{'.css':'empty','.png':'dataurl'},define:{'import.meta.env':JSON.stringify({MODE:'test',DEV:false})},
  plugins:[{name:'inert-maintenance-network-ports',setup(builder){
    builder.onResolve({filter:/^@\/(store\/useSessionStore|lib\/(maintenanceService|shipDamageService|consoleAccess))$/},args=>
      ({path:args.path,namespace:'maintenance-port'}));
    builder.onLoad({filter:/.*/,namespace:'maintenance-port'},args=>({contents:
      args.path.includes('useSessionStore')?`export const useSessionStore=selector=>selector({session:{id:'fixture-session',currentTurn:1,phase:'active'},me:{uid:'original-eo',role:'player'},connection:'live',sessionSnapshotFreshness:'server'});export const selectHasLiveServerSnapshot=state=>state.connection==='live'&&state.sessionSnapshotFreshness==='server';`:
      args.path.includes('consoleAccess')?`export const useConsoleAccess=()=>({writable:true,roleId:'executive-officer'});`:
      args.path.includes('maintenanceService')?`export const runMaintenance=async()=>{},rollbackMaintenance=async()=>{};`:
        `export const assignShipDamage=async()=>{},repairAllShipDamage=async()=>{};`}));
  }}]});
  await withProofBrowserCleanup(async resources=>{
    resources.browserServer=await chromium.launchServer({headless:true});
    resources.browser=await chromium.connect(resources.browserServer.wsEndpoint());
    resources.context=await resources.browser.newContext();
    await resources.context.route('**/*',route=>route.request().isNavigationRequest()&&
      new URL(route.request().url()).hostname==='pc10-maintenance.invalid'
      ?route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):route.abort());
    const page=await resources.context.newPage();page.setDefaultTimeout(1000);
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto('https://pc10-maintenance.invalid/');await page.addScriptTag({content:compiled.outputFiles[0].text});
    assert.deepEqual(pageErrors,[],'The actual component fixture must load before its consumer can be tested.');
    await page.getByText('Loading current original console',{exact:true}).waitFor();
    const completed=[],pending=[],checks={};
    const surface={page},readiness={status:'eligible',surface};
    const consume=runInNewContext(`(${callbacks[0]})`,{
      ships:[['aegis','executive-officer','AEGIS',['Jump Drive'],{}]],combatConsoles:['Fighter Bay Alpha','Fighter Bay Bravo'],
      chooseCurrentShipRole:async()=>({status:'eligible',roleId:'executive-officer',readiness}),
      currentRoleReadiness:async()=>readiness,pending:(...value)=>pending.push(value),checks,
      sourceTools:{gmRepair:async()=>{throw Error('No native mutation in this fixture');}},
      a:{maintenanceUi:async(ship,role)=>{
        assert.ok(await page.getByRole('button',{name:'Begin Maintenance Cycle: Cycle 1',exact:true}).isVisible());
        completed.push({ship,role});
      }},
    });
    await page.evaluate(()=>setTimeout(()=>window.__mountMaintenance(),100));
    await consume(1,true);
    assert.deepEqual(completed,[{ship:'aegis',role:'executive-officer'}]);
    assert.deepEqual(pending,[]);assert.equal(checks.allSixMaintenanceCycle1,true);
  },{stopBuild:stop});
});
