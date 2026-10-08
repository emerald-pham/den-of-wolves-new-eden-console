#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCommand} from './run-emulator-command.mjs';
import {createHash} from 'node:crypto';
import {validateRingAllocation} from './pc10-fresh-minimum-ring-proof.mjs';
import {localGmAccessConfiguration} from './local-gm-access.mjs';
import {capturePc10Gate2SourceBinding} from './pc10-gate2-functional-proof.mjs';
const runner='scripts/pc10-fresh-minimum-ring-proof.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function stationLaunchEnvironment(allocation){return {
 VITE_LOCAL_GM_ACCESS:'1',VITE_USE_EMULATORS:'1',VITE_FIREBASE_PROJECT_ID:allocation.projectId,
 VITE_FIREBASE_AUTH_EMULATOR_PORT:String(allocation.ports.auth),
 VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT:String(allocation.ports.functions),
 VITE_FIREBASE_FIRESTORE_EMULATOR_PORT:String(allocation.ports.firestore),
 VITE_DEV_SERVER_PORT:new URL(allocation.baseUrl).port,
};}
export function validateStationLaunchEnvironment(allocation,environment){
 validateRingAllocation(allocation);assert.equal(allocation.probeFamily,'station-success');
 assert.ok(localGmAccessConfiguration('serve',environment),'Normal local GM configuration must be enabled.');
 for(const[key,value]of Object.entries(stationLaunchEnvironment(allocation)))assert.equal(environment[key],value,`Allocated launch ${key}`);
 return environment;
}
export function stationLaunchCommands(allocation){return {
 emulators:['scripts/run-emulator-command.mjs','start','--project',allocation.projectId],
 vite:['scripts/run-emulator-command.mjs','vite','--host',new URL(allocation.baseUrl).hostname,'--strictPort'],
 proof:['scripts/pc10-station-success-proof.mjs','--allocation'],
};}
export function validateStationLaunchBindings(allocation,binding,indexHash,config,environment){
 validateStationLaunchEnvironment(allocation,environment);
 assert.equal(binding.sourceCommit,allocation.sourceCommit);assert.equal(binding.trackedClean,true);
 assert.equal(binding.externalRunner.sha256,allocation.runnerSha256);
 assert.equal(binding.compiledTreeSha256,allocation.compiledTreeSha256);assert.equal(indexHash,allocation.compiledIndexSha256);
 for(const key of ['auth','functions','firestore'])assert.equal(config.emulators?.[key]?.port,allocation.ports[key],`Firebase allocated ${key}`);
 return true;
}
export function compareStationAdmissionReference(allocation,binding,reference){
 assert.equal(reference.probeFamily,'station-success');assert.equal(reference.runtime.useEmulators,true);
 assert.ok(reference.claims.includes('GM1 ordinary admission/consent, normal local GM authorization and independent owned live instance'));
 assert.ok(reference.receipts.some(r=>r.endpoint==='claimGmInstance'&&r.httpStatus===200));
 assert.deepEqual(reference.runtime.ports,allocation.ports);
 assert.equal(reference.sourceBinding.sourceCommit,reference.sourceCommit);
 const backendSourceChanges=[];
 for(const prior of reference.sourceBinding.trackedFiles.filter(f=>f.path.startsWith('src/')||f.path.startsWith('functions/src/'))){
  const current=binding.trackedFiles.find(f=>f.path===prior.path);assert.ok(current,`Historical product source remains present: ${prior.path}`);
  if(prior.path.startsWith('src/'))assert.equal(current.sha256,prior.sha256,`Successful admission frontend source ${prior.path}`);
  else if(current.sha256!==prior.sha256)backendSourceChanges.push({path:prior.path,priorSha256:prior.sha256,currentSha256:current.sha256});
 }
 const compiledTreeEqual=reference.sourceBinding.compiledTreeSha256===binding.compiledTreeSha256;
 assert.ok(compiledTreeEqual||backendSourceChanges.some(change=>change.path.endsWith('.ts')&&!change.path.endsWith('.test.ts')),'Changed compiled build requires an explicit backend source difference.');
 // Historical admission verifies the setup route, not the repaired current
 // backend. Exact current bytes stay allocation-bound by validateReceipt;
 // the proof must perform fresh ordinary admission before any P gameplay.
 return {referenceCommit:reference.sourceCommit,referenceProject:reference.runtime.projectId,newProject:allocation.projectId,
  portsEqual:true,compiledTreeEqual,productSourcesEqual:backendSourceChanges.length===0,backendSourceChanges,requiresFreshAdmission:true,
  rawLaunchEnvironmentRecorded:false,requiredFlagsValidatedAgainst:'scripts/local-gm-access.mjs and actual AppHeader/LocalGmAccess DEV opt-in gates'};
}
async function validateReceipt(receipt){
 const allocation=JSON.parse(await readFile(receipt.allocationPath,'utf8'));
 assert.deepEqual(allocation,receipt.allocation,'Allocation changed after preparation.');
 assert.ok(Date.now()<Date.parse(allocation.deadlineAt)-60000,'Fresh allocated work window and cleanup reserve required.');
 assert.equal(await realpath(process.cwd()),await realpath(allocation.sourceRoot));
 const binding=await capturePc10Gate2SourceBinding(process.cwd(),resolve(runner));
 assert.deepEqual(binding,receipt.binding,'Source/build bytes changed after launch receipt.');
 const indexHash=sha(await readFile('functions/lib/index.js'));
 const config=JSON.parse(await readFile('firebase.local.json','utf8'));
 const configuredEnv=Object.fromEntries((await readFile('.env.emulators.local','utf8')).trim().split('\n').map(line=>line.split('=')));
 for(const[key,value]of Object.entries(configuredEnv))if(key in receipt.environment)assert.equal(value,receipt.environment[key],`Configured Vite ${key}`);
 validateStationLaunchBindings(allocation,binding,indexHash,config,receipt.environment);
 assert.deepEqual(receipt.commands,stationLaunchCommands(allocation));
 return allocation;
}
export function runStationLaunchCommand(command,args,options={}){return runCommand(command,args,options);}
async function main(){
 const [mode,...args]=process.argv.slice(2);
 if(mode==='--prepare'){
  assert.equal(args.length,6);assert.equal(args[0],'--allocation');assert.equal(args[2],'--reference');assert.equal(args[4],'--receipt');
  const allocationPath=resolve(args[1]),referencePath=resolve(args[3]),receiptPath=resolve(args[5]);
  const allocation=JSON.parse(await readFile(allocationPath,'utf8'));const environment=stationLaunchEnvironment(allocation);
  const binding=await capturePc10Gate2SourceBinding(process.cwd(),resolve(runner));
  validateStationLaunchBindings(allocation,binding,sha(await readFile('functions/lib/index.js')),JSON.parse(await readFile('firebase.local.json','utf8')),environment);
  const reference=compareStationAdmissionReference(allocation,binding,JSON.parse(await readFile(referencePath,'utf8')));
  const receipt={schemaVersion:1,allocationPath,allocation,environment,binding,commands:stationLaunchCommands(allocation),referencePath,reference,runtimeLaunched:false};
  await validateReceipt(receipt);await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(receiptPath);return;
 }
 assert.ok(['--check','--emulators','--vite','--proof'].includes(mode),'Use --prepare, --check, --emulators, --vite or --proof.');
 assert.equal(args.length,mode==='--proof'?3:1);if(mode==='--proof'){assert.equal(args[1],'--evidence');assert.ok(isAbsolute(args[2]));}
 const receiptPath=resolve(args[0]),receipt=JSON.parse(await readFile(receiptPath,'utf8'));await validateReceipt(receipt);
 if(mode==='--check'){console.log('Exact allocated source/build/ports/local GM launch validated; no resource started.');return;}
 const command=receipt.commands[mode.slice(2)];const childArgs=mode==='--proof'?[...command,receipt.allocationPath,'--evidence',args[2]]:command;
 // The established wrapper forwards named signals to its detached owned tree,
 // waits for the inner reservation wrapper to finish, and releases its listeners.
 // Environment is explicit for the wrapper process and inherited by its children.
 for(const[key,value]of Object.entries(receipt.environment))process.env[key]=value;
 await runStationLaunchCommand(process.execPath,childArgs);
}
if(process.argv[1]&&await realpath(process.argv[1])===await realpath(fileURLToPath(import.meta.url)))main().catch(error=>{console.error(error.message);process.exitCode=1;});
