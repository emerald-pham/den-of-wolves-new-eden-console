import assert from 'node:assert/strict';
import {createConnection} from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {emulatorEnvironmentForSlot,emulatorPortsForSlot,vitePortForSlot} from '../emulator-slots.js';
import {localGmAccessConfiguration} from '../local-gm-access.mjs';
import {proofProcessExitCode,readProofLogExcerpt} from '../proof-test-invocation.mjs';
import {proofRuntimeFromViteSource,validateProofRuntime} from '../pc10-full-game-demo-proof-helpers.mjs';
import {coordinationFilePath,releaseConfiguredEmulatorSlot,readCoordinationState} from '../emulator-resource-registry.mjs';
import {runPc11ContractPreflight} from './pc11-contract-preflight.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
async function within(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error(label);error.exitCode=124;reject(error);},ms);})]);}finally{clearTimeout(timer);}}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function launchPlan({slot=5,projectId,evidenceDirectory}){
 assert.ok(Number.isSafeInteger(slot)&&slot>=5&&slot<=14,'Only free non-retained rows5–14');
 assert.match(projectId??'',/^demo-pc11-[a-z0-9-]+$/);
 assert.ok(evidenceDirectory?.startsWith('/tmp/'),'New /tmp evidence directory required');
 const ports=emulatorPortsForSlot(slot),baseUrl=`http://127.0.0.1:${vitePortForSlot(slot)}`;
 const env={...emulatorEnvironmentForSlot(slot),VITE_FIREBASE_PROJECT_ID:projectId,VITE_LOCAL_GM_ACCESS:'1'};
 assert.deepEqual(localGmAccessConfiguration('serve',env),{projectId,authPort:ports.auth,firestorePort:ports.firestore});
 return {allocationMilliseconds:300000,slot,projectId,evidenceDirectory,baseUrl,ports:{auth:ports.auth,functions:ports.functions,firestore:ports.firestore},env};
}
export function checkServedEnvironment(source,plan){
 const match=source.match(/import\.meta\.env\s*=\s*(\{[^\n]+\});/);assert.ok(match,'Actual Vite environment assignment');
 const env=JSON.parse(match[1]);assert.equal(env.VITE_LOCAL_GM_ACCESS,'1','Local GM UI/plugin opt-in required');assert.equal(env.DEV,true);
 validateProofRuntime(proofRuntimeFromViteSource(source),plan);
 assert.deepEqual(localGmAccessConfiguration('serve',env),{projectId:plan.projectId,authPort:plan.ports.auth,firestorePort:plan.ports.firestore});
 return {localGmEnabled:true,projectId:plan.projectId,ports:plan.ports};
}
// The launch's configured row: `runConfigure` performs the configure step
// (a configure-emulator-slot.mjs child in a real launch). The launch records
// the row and local files it displaced so its return, after the launcher's
// process and port checks, gives back only what this launch took.
async function readOptionalText(path){try{return await readFile(path,'utf8');}catch(error){if(error?.code==='ENOENT')return undefined;throw error;}}
export async function configureLaunchSlot({slot,worktree=root,coordinationPath=coordinationFilePath(),runConfigure}){
 const before=(await readCoordinationState(coordinationPath)).configurations.find(c=>c.worktree===worktree);
 const previous=await Promise.all(['firebase.local.json','.env.emulators.local'].map(async name=>{const path=resolve(worktree,name);return {path,previous:await readOptionalText(path)};}));
 await runConfigure();
 const created=(await readCoordinationState(coordinationPath)).configurations.find(c=>c.worktree===worktree&&c.slot===slot);
 const files=await Promise.all(previous.map(async file=>({...file,written:await readOptionalText(file.path)})));
 return {slot,worktree,coordinationPath,files,configuration:created&&(before&&before.id!==created.id?{...created,replaces:before}:created)};
}
export async function returnLaunchSlot(launch){
 for(const {path,previous,written} of launch.files??[]){
  // Restore only a file this launch rewrote and nobody has changed since.
  if(written===undefined||written===previous||(await readOptionalText(path))!==written)continue;
  if(previous===undefined)await unlink(path).catch(error=>{if(error?.code!=='ENOENT')throw error;});
  else await writeFile(path,previous);
 }
 // Release by id only; the registry restores the displaced row when its slot is still free.
 if(launch.configuration)await releaseConfiguredEmulatorSlot(launch.configuration,launch.coordinationPath);
}
async function sourceChecks(){
 const presets=await readFile(`${root}/src/data/rolePresets.ts`,'utf8');const row=presets.match(/12:\s*\[([^\]]+)\]/)?.[1];assert.ok(row?.includes("'dione-engineer'")&&row.includes("'dione-president'"));
 const runner=await readFile(`${root}/scripts/qualification/pc11-three-actor-trade-philia.mjs`,'utf8');assert.ok(runner.includes("selectOption('12')")&&runner.includes("Recipient:'dione-president'"));
 return {configuredSlots:12,authenticatedActors:3,emptyPlayerSlots:10};
}
async function main(){
 const args=process.argv.slice(2),run=args.includes('--run');
 const value=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
 const plan=launchPlan({slot:Number(value('--slot')||5),projectId:value('--project'),evidenceDirectory:value('--evidence')});
 const sourceContractPreflight=await runPc11ContractPreflight(root);
 const gmOnly=args.includes('--gm-only');
 const setup=gmOnly?{configuredSlots:0,authenticatedActors:1,emptyPlayerSlots:0,mode:'gm-startup-only'}:await sourceChecks();
 if(!run){console.log(JSON.stringify({mode:'source-only-check',...plan,setup,sourceContractPreflight}));return;}
 assert.ok(args.includes('--allocated'),'Fresh owner runtime allocation is required');
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'');
 const allocationStartedAt=Date.now(),deadline=allocationStartedAt+plan.allocationMilliseconds,children=[],cleanup={errors:[]};let launchSlot,cancelled=false,notifyCancellation,primaryError;
 const cancellation=new Promise(resolve=>{notifyCancellation=resolve;});
 const onCancel=signal=>{cancelled=true;const error=new Error(`Owner cancelled ${signal}; cleanup required`);error.exitCode=proofProcessExitCode({signal});notifyCancellation(error);};
 const onInt=()=>onCancel('SIGINT'),onTerm=()=>onCancel('SIGTERM');process.once('SIGINT',onInt);process.once('SIGTERM',onTerm);
 const interruptible=operation=>Promise.race([operation,cancellation.then(e=>{throw e;})]);
 await mkdir(plan.evidenceDirectory,{recursive:false,mode:0o700});
 async function start(name,command,argv,env={}){
  const log=await open(`${plan.evidenceDirectory}/${name}.log`,'wx');
  const child=spawn(command,argv,{cwd:root,env:{...process.env,...env},stdio:['ignore',log.fd,log.fd]});
  const result=new Promise((res,rej)=>{child.once('error',rej);child.once('exit',(code,signal)=>res({code,signal}));});
  children.push({name,child,result,log,logPath:`${plan.evidenceDirectory}/${name}.log`});return children.at(-1);
 }
 async function command(name,cmd,args){const c=await start(name,cmd,args);const result=await interruptible(within(c.result,Math.min(60000,Math.max(1,deadline-Date.now()-30000)),`${name} exceeded setup budget`));if(result.code!==0||result.signal){const error=new Error(`${name} failed; full log: ${c.logPath}`);error.exitCode=proofProcessExitCode(result);error.processResult={...result,logPath:c.logPath};throw error;}}
 try{
  launchSlot=await configureLaunchSlot({slot:plan.slot,runConfigure:async()=>await command('configure',process.execPath,['scripts/configure-emulator-slot.mjs',String(plan.slot)])});
  await command('functions-build','npm',['run','build','--prefix','functions']);
  const builtFunctionsSha256=sha(await readFile(`${root}/functions/lib/index.js`));
  const vite=await start('vite',process.execPath,['scripts/run-emulator-command.mjs','vite','--host','127.0.0.1'],plan.env);
  const emulator=await start('emulators',process.execPath,['scripts/run-emulator-command.mjs','start','--project',plan.projectId,'--only','auth,functions,firestore']);
  const readinessEnd=Math.min(Date.now()+120000,deadline-120000);let observed,lastError;
  while(Date.now()<readinessEnd){if(cancelled)throw new Error('Owner cancellation before browser launch');try{
   const source=await (await fetch(`${plan.baseUrl}/src/lib/firebaseConfig.ts`,{signal:AbortSignal.timeout(3000)})).text();observed=checkServedEnvironment(source,plan);
   const response=await fetch(`http://127.0.0.1:${plan.ports.functions}/${plan.projectId}/us-central1/createSession`,{signal:AbortSignal.timeout(3000)});
   assert.equal(response.status,400,'Loaded callable rejects harmless GET');break;
  }catch(e){lastError=e;observed=null;await delay(500);}}
  assert.ok(observed,`Runtime readiness failed: ${lastError?.message}`);
  const launch={sourceCommit,sourceRoot:root,projectId:plan.projectId,ports:plan.ports,baseUrl:plan.baseUrl,builtFunctionsSha256,functionsBuiltBeforeLaunch:true,processCwdsVerified:true,vitePid:vite.child.pid,emulatorPid:emulator.child.pid,recordedAt:new Date().toISOString(),spawnCwd:root,observedEnvironment:observed,setup};
  const launchPath=`${plan.evidenceDirectory}/launch.json`;await writeFile(launchPath,JSON.stringify(launch,null,2)+'\n');
  if(cancelled)throw new Error('Owner cancellation before proof spawn');
  const proof=await start('proof',process.execPath,['scripts/qualification/pc11-three-actor-trade-philia.mjs'],{PC11_GM_ONLY:gmOnly?'1':'0',PC11_RUNTIME_ALLOCATED:'yes',PC11_SOURCE_ROOT:root,PC11_SOURCE_COMMIT:sourceCommit,PC11_PROJECT:plan.projectId,PC11_UI_URL:plan.baseUrl,PC11_PORTS_JSON:JSON.stringify(plan.ports),PC11_EVIDENCE_DIRECTORY:`${plan.evidenceDirectory}/run`,PC11_RUNTIME_LAUNCH_RECORD:launchPath,PC11_ALLOCATION_DEADLINE_MS:String(deadline-30000)});
  const result=await interruptible(within(proof.result,Math.max(1,deadline-Date.now()-25000),'Allocated deadline reached; stop and retain proof evidence'));if(result.code!==0||result.signal){const error=new Error(`Proof stopped; retain run/OWNER_RESULT.json and full log: ${proof.logPath}`);error.exitCode=proofProcessExitCode(result);error.processResult={...result,logPath:proof.logPath};throw error;}
 }catch(error){primaryError=error;}
 finally{
  const activeProof=children.find(c=>c.name==='proof'&&c.child.exitCode===null&&c.child.signalCode===null);
  if(activeProof){try{activeProof.child.kill('SIGINT');}catch(error){cleanup.errors.push(`Could not interrupt proof child: ${error.message}`);}await within(activeProof.result,Math.min(120000,Math.max(1,deadline-Date.now()-25000)),'Proof cancellation cleanup deadline').catch(e=>cleanup.errors.push(e.message));}
  let registry={reservations:[]};try{registry=await readCoordinationState();}catch(error){cleanup.errors.push(`Could not read coordination state during cleanup: ${error.message}`);}
  await Promise.all(children.reverse().map(async c=>{
   try{
   const own=registry.reservations.find(r=>r.pid===c.child.pid&&r.worktree===root&&r.slot===plan.slot);
   const group=Number.isSafeInteger(own?.childPid)?own.childPid:null;
   const alive=()=>c.child.exitCode===null&&c.child.signalCode===null;
   if(alive()){
    c.child.kill('SIGINT');await within(c.result,5000,`${c.name} INT deadline`).catch(()=>{});
    if(alive()){
     // Existing wrappers ignore a second signal. Their recorded detached child
     // group is owned by this exact spawn/row; escalate only that group.
     try{if(group)process.kill(-group,'SIGTERM');else c.child.kill('SIGTERM');}catch(e){if(e.code!=='ESRCH')cleanup.errors.push(e.message);}
     await within(c.result,3000,`${c.name} TERM deadline`).catch(()=>{});
     if(alive()){try{if(group)process.kill(-group,'SIGKILL');c.child.kill('SIGKILL');}catch(e){if(e.code!=='ESRCH')cleanup.errors.push(e.message);}await within(c.result,2000,`${c.name} final shutdown deadline`).catch(e=>cleanup.errors.push(e.message));}
    }
   }
   }catch(error){cleanup.errors.push(`${c.name} process cleanup failed: ${error.message}`);}
   finally{try{await c.log.close();}catch(error){cleanup.errors.push(`${c.name} log close failed: ${error.message}`);}}
  }));
  process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);
  const openPorts=[];for(const port of [new URL(plan.baseUrl).port,...Object.values(plan.ports)]){const listening=await new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port:Number(port)});socket.setTimeout(Math.min(1000,Math.max(1,deadline-Date.now()-2000)));socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(true);});});if(listening)openPorts.push(Number(port));}
  cleanup.openPorts=openPorts;if(openPorts.length)cleanup.errors.push('Owned row still has listeners; retain configuration and inspect exact processes');
  if(launchSlot&&!openPorts.length){try{await returnLaunchSlot(launchSlot);}catch(error){cleanup.errors.push(`Could not release configured emulator slot: ${error.message}`);}}
  cleanup.elapsedMilliseconds=Date.now()-allocationStartedAt;cleanup.allocationWithinCap=cleanup.elapsedMilliseconds<=plan.allocationMilliseconds;if(!cleanup.allocationWithinCap)cleanup.errors.push('Owner allocation cap exceeded');cleanup.closedAt=new Date().toISOString();try{await writeFile(`${plan.evidenceDirectory}/launcher-cleanup.json`,JSON.stringify(cleanup,null,2)+'\n');}catch(error){cleanup.errors.push(`Could not write launcher cleanup evidence: ${error.message}`);}
  if(cleanup.errors.length){if(primaryError)primaryError.cleanupErrors=cleanup.errors;else{primaryError=new Error('Launcher cleanup incomplete; inspect launcher-cleanup.json');primaryError.exitCode=1;primaryError.cleanupErrors=cleanup.errors;}}
 }
 if(primaryError){
  if(!primaryError.processResult){const failedProof=children.find(c=>c.name==='proof');if(failedProof){const result=await failedProof.result.catch(error=>({code:null,signal:null,error}));if(result.code!==0||result.signal||result.error){primaryError.processResult={...result,logPath:failedProof.logPath};primaryError.exitCode??=proofProcessExitCode(result);}}}
  const processResult=primaryError.processResult;if(processResult?.logPath&&!processResult.diagnosticsPrinted){try{const excerpt=await readProofLogExcerpt(processResult.logPath);const status=processResult.signal?`signal ${processResult.signal} (exit code ${primaryError.exitCode??proofProcessExitCode(processResult)})`:`exit code ${processResult.code??primaryError.exitCode??1}`;process.stderr.write(`Proof process failed with ${status}. Full log: ${processResult.logPath}\n${excerpt?`Log excerpt (last 80 lines):\n${excerpt}\n`:'Log excerpt: (empty)\n'}`);processResult.diagnosticsPrinted=true;}catch(error){primaryError.diagnosticError=error;}}
  throw primaryError;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);if(e.diagnosticError)console.error(`Diagnostics also failed: ${e.diagnosticError.message}`);for(const failure of e.cleanupErrors??[])console.error(`Cleanup also failed: ${failure}`);process.exitCode=e.exitCode??1;});
