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
// These full blobs differ only in pdfEscortWingLaunchViewReply. Admission,
// Auth and GM handlers remain byte-identical; every other frontend stays strict.
const pdfAdmissionDelta={path:'src/lib/sessionService.ts',
 priorSha256:'ffe6dedf083c325bf0da12cd54c400309101228fe4cfb29b38799e9575f3abcd',
 currentSha256:'8327087e75e23a2d63a98cd0aed109cc678820be57a60d4f91da7a0b40e5487d',
 scope:'pdfEscortWingLaunchViewReply-only'};
function validatePdfAdmissionCompatibility(compatibility){
 assert.ok(isAbsolute(compatibility.path),'Absolute admission compatibility evidence path required.');
 assert.match(compatibility.sha256??'',/^[0-9a-f]{64}$/,'Admission compatibility evidence hash required.');
 const reviews={};
 for(const[key,expectedHash,candidate]of[
  ['pdfReview','3dbb380b57cc6983e253d1bb61d3befbb260f9db44f4575b5fd0899a07c4df42','c06c717870993eba1ce0f3a2f1b8b53886366910'],
  ['typeOnlyReview','27100f4a7c31a6b9721b00ddf87a66f6ff4446240a81ec691c5db4db181cf450','559e22bd55fa38b1b54c76ee2aaf75fca97d0858'],
 ]){
  const review=compatibility[key];assert.ok(typeof review?.raw==='string',`Missing ${key} raw review evidence.`);
  assert.ok(isAbsolute(review.path),`Absolute ${key} review evidence path required.`);
  assert.equal(sha(review.raw),expectedHash,`Exact independently reviewed ${key} bytes required.`);
  const parsed=JSON.parse(review.raw);assert.equal(parsed.status,'PASS_SOURCE_ONLY');assert.equal(parsed.candidate,candidate);
  if(key==='pdfReview')assert.equal(parsed.sourceBindings[pdfAdmissionDelta.path],pdfAdmissionDelta.currentSha256);
  else{
   assert.equal(parsed.base,reviews.pdfReview.candidate);
   assert.equal(parsed.sourceBindings.find(row=>row.path===pdfAdmissionDelta.path)?.candidate.sha256,pdfAdmissionDelta.currentSha256);
  }
  reviews[key]={path:review.path,sha256:expectedHash,candidate};
 }
 return{path:compatibility.path,sha256:compatibility.sha256,...reviews};
}
async function readAdmissionCompatibility(path){
 if(path===null)return null;
 assert.ok(typeof path==='string'&&isAbsolute(path),'Absolute admission compatibility evidence path required.');
 const raw=await readFile(path,'utf8'),config=JSON.parse(raw);
 assert.deepEqual(Object.keys(config).sort(),['pdfReviewPath','typeOnlyReviewPath'],'Only the two reviewed admission evidence paths are supported.');
 assert.ok(typeof config.pdfReviewPath==='string'&&isAbsolute(config.pdfReviewPath),'Absolute PDF review path required.');
 assert.ok(typeof config.typeOnlyReviewPath==='string'&&isAbsolute(config.typeOnlyReviewPath),'Absolute type-only review path required.');
 return{path,sha256:sha(raw),pdfReview:{path:config.pdfReviewPath,raw:await readFile(config.pdfReviewPath,'utf8')},
  typeOnlyReview:{path:config.typeOnlyReviewPath,raw:await readFile(config.typeOnlyReviewPath,'utf8')}};
}
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
export function compareStationAdmissionReference(allocation,binding,reference,compatibility=null){
 assert.equal(reference.probeFamily,'station-success');assert.equal(reference.runtime.useEmulators,true);
 assert.ok(reference.claims.includes('GM1 ordinary admission/consent, normal local GM authorization and independent owned live instance'));
 assert.ok(reference.receipts.some(r=>r.endpoint==='claimGmInstance'&&r.httpStatus===200));
 assert.deepEqual(reference.runtime.ports,allocation.ports);
 assert.equal(reference.sourceBinding.sourceCommit,reference.sourceCommit);
 const compatibilityEvidence=compatibility===null?null:validatePdfAdmissionCompatibility(compatibility);
 const backendSourceChanges=[],frontendTestSourceChanges=[],frontendProductSourceChanges=[];
 const priorPaths=new Set(reference.sourceBinding.trackedFiles.map(file=>file.path));
 for(const current of binding.trackedFiles.filter(file=>file.path.startsWith('src/')&&!/\.test\.tsx?$/.test(file.path))){
  assert.ok(priorPaths.has(current.path),`New admission frontend source requires its own review: ${current.path}`);
 }
 for(const prior of reference.sourceBinding.trackedFiles.filter(f=>f.path.startsWith('src/')||f.path.startsWith('functions/src/'))){
  const current=binding.trackedFiles.find(f=>f.path===prior.path);assert.ok(current,`Historical product source remains present: ${prior.path}`);
  if(prior.path.startsWith('src/')&&/\.test\.tsx?$/.test(prior.path)){
   if(current.sha256!==prior.sha256)frontendTestSourceChanges.push({path:prior.path,priorSha256:prior.sha256,currentSha256:current.sha256});
  } else if(prior.path.startsWith('src/')&&current.sha256!==prior.sha256){
   assert.ok(compatibilityEvidence&&prior.path===pdfAdmissionDelta.path&&prior.sha256===pdfAdmissionDelta.priorSha256&&current.sha256===pdfAdmissionDelta.currentSha256,
    `Successful admission frontend source requires exact reviewed compatibility: ${prior.path}`);
   frontendProductSourceChanges.push({...pdfAdmissionDelta});
  }
  else if(current.sha256!==prior.sha256)backendSourceChanges.push({path:prior.path,priorSha256:prior.sha256,currentSha256:current.sha256});
 }
 const compiledTreeEqual=reference.sourceBinding.compiledTreeSha256===binding.compiledTreeSha256;
 assert.ok(compiledTreeEqual||backendSourceChanges.some(change=>change.path.endsWith('.ts')&&!change.path.endsWith('.test.ts')),'Changed compiled build requires an explicit backend source difference.');
 // Historical admission verifies the setup route, not the repaired current
 // backend. Exact current bytes stay allocation-bound by validateReceipt;
 // the proof must perform fresh ordinary admission before any P gameplay.
 return {referenceCommit:reference.sourceCommit,referenceProject:reference.runtime.projectId,newProject:allocation.projectId,
  portsEqual:true,compiledTreeEqual,productSourcesEqual:backendSourceChanges.length===0&&frontendProductSourceChanges.length===0,
  backendSourceChanges,frontendTestSourceChanges,frontendProductSourceChanges,compatibilityEvidence,requiresFreshAdmission:true,
  rawLaunchEnvironmentRecorded:false,requiredFlagsValidatedAgainst:'scripts/local-gm-access.mjs and actual AppHeader/LocalGmAccess DEV opt-in gates'};
}
async function validateReceipt(receipt){
 const allocation=JSON.parse(await readFile(receipt.allocationPath,'utf8'));
 assert.deepEqual(allocation,receipt.allocation,'Allocation changed after preparation.');
 assert.ok(Date.now()<Date.parse(allocation.deadlineAt)-60000,'Fresh allocated work window and cleanup reserve required.');
 assert.equal(await realpath(process.cwd()),await realpath(allocation.sourceRoot));
 const binding=await capturePc10Gate2SourceBinding(process.cwd(),resolve(runner));
 assert.deepEqual(binding,receipt.binding,'Source/build bytes changed after launch receipt.');
 const referenceRaw=await readFile(receipt.referencePath,'utf8');
 assert.equal(sha(referenceRaw),receipt.referenceSha256,'Historical admission reference changed after preparation.');
 const compatibility=await readAdmissionCompatibility(receipt.compatibilityPath);
 assert.deepEqual(compareStationAdmissionReference(allocation,binding,JSON.parse(referenceRaw),compatibility),receipt.reference,
  'Historical admission reference or reviewed compatibility changed after preparation.');
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
  assert.ok(args.length===6||args.length===8);assert.equal(args[0],'--allocation');assert.equal(args[2],'--reference');assert.equal(args[4],'--receipt');
  if(args.length===8){assert.equal(args[6],'--admission-compatibility');assert.ok(isAbsolute(args[7]),'Absolute admission compatibility path required.');}
  const allocationPath=resolve(args[1]),referencePath=resolve(args[3]),receiptPath=resolve(args[5]);
  const compatibilityPath=args.length===8?args[7]:null;
  const allocation=JSON.parse(await readFile(allocationPath,'utf8'));const environment=stationLaunchEnvironment(allocation);
  const binding=await capturePc10Gate2SourceBinding(process.cwd(),resolve(runner));
  validateStationLaunchBindings(allocation,binding,sha(await readFile('functions/lib/index.js')),JSON.parse(await readFile('firebase.local.json','utf8')),environment);
  const referenceRaw=await readFile(referencePath,'utf8'),compatibility=await readAdmissionCompatibility(compatibilityPath);
  const reference=compareStationAdmissionReference(allocation,binding,JSON.parse(referenceRaw),compatibility);
  const receipt={schemaVersion:1,allocationPath,allocation,environment,binding,commands:stationLaunchCommands(allocation),
   referencePath,referenceSha256:sha(referenceRaw),reference,compatibilityPath,runtimeLaunched:false};
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
