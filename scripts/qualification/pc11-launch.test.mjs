import test from 'node:test';
import assert from 'node:assert/strict';
import {launchPlan,checkServedEnvironment} from './pc11-launch.mjs';
test('known launch prerequisites produce correct isolated local GM binding',()=>{
 const plan=launchPlan({slot:5,projectId:'demo-pc11-test',evidenceDirectory:'/tmp/pc11-test'});
 assert.deepEqual(plan.ports,{auth:9149,functions:5051,firestore:8130});assert.equal(plan.baseUrl,'http://127.0.0.1:5178');
 const env={...plan.env,DEV:true};const source=`import.meta.env = ${JSON.stringify(env)};\n`;
 assert.equal(checkServedEnvironment(source,plan).localGmEnabled,true);
 for(const change of [{VITE_LOCAL_GM_ACCESS:'0'},{VITE_FIREBASE_PROJECT_ID:'production'},{VITE_FIREBASE_AUTH_EMULATOR_PORT:'9119'},{VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT:'5021'},{DEV:false}])assert.throws(()=>checkServedEnvironment(`import.meta.env = ${JSON.stringify({...env,...change})};\n`,plan));
 assert.throws(()=>checkServedEnvironment('export default "wrong format"',plan));
});
test('retained rows and production namespace cannot become launch plans',()=>{
 for(const slot of [0,1,2,3,4,15])assert.throws(()=>launchPlan({slot,projectId:'demo-pc11-test',evidenceDirectory:'/tmp/test'}));
 assert.throws(()=>launchPlan({slot:5,projectId:'dow-new-eden-console',evidenceDirectory:'/tmp/test'}));
});
test('complete source-only CLI defaults slot5 without creating evidence or runtime',async()=>{
 const {execFileSync}=await import('node:child_process');const {existsSync}=await import('node:fs');
 const {randomUUID}=await import('node:crypto');const evidence=`/tmp/pc11-launch-check-${randomUUID()}`;
 const output=execFileSync(process.execPath,['scripts/qualification/pc11-launch.mjs','--check','--project','demo-pc11-check','--evidence',evidence],{encoding:'utf8'});
 const result=JSON.parse(output);assert.equal(result.slot,5);assert.equal(result.env.VITE_LOCAL_GM_ACCESS,'1');assert.equal(existsSync(evidence),false);
});
test('GM-only source plan uses one actor and creates no runtime or evidence',async()=>{
 const {execFileSync}=await import('node:child_process');const {existsSync}=await import('node:fs');
 const {randomUUID}=await import('node:crypto');const evidence=`/tmp/pc11-gm-check-${randomUUID()}`;
 const output=execFileSync(process.execPath,['scripts/qualification/pc11-launch.mjs','--check','--gm-only','--project','demo-pc11-gm-check','--evidence',evidence],{encoding:'utf8'});
 const result=JSON.parse(output);assert.equal(result.setup.authenticatedActors,1);assert.equal(result.setup.mode,'gm-startup-only');assert.equal(result.setup.configuredSlots,0);assert.equal(existsSync(evidence),false);
});

test('normal proof launch stays within the five minute owner allocation',()=>{
 const plan=launchPlan({slot:5,projectId:'demo-pc11-budget',evidenceDirectory:'/tmp/pc11-budget'});
 assert.equal(plan.allocationMilliseconds,300000);
});

test('proof cancellation reserves terminal service teardown within allocation',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./pc11-launch.mjs',import.meta.url),'utf8');
 assert.ok(!source.includes('deadline-Date.now()-12000'),'Twelve seconds cannot fit10s services plus4s ports and evidence');
 assert.ok(source.includes('deadline-Date.now()-25000'),'Keep25s terminal cleanup reserve');
 assert.ok(source.includes('allocationWithinCap'),'Persist exact cap outcome');
});

test('a failed launch returns only its configured row and local files and restores what it displaced',async()=>{
 const {mkdtemp,mkdir,readFile,rm,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {resolve}=await import('node:path');
 const {configureLaunchSlot,returnLaunchSlot}=await import('./pc11-launch.mjs');
 const {configureEmulatorSlot}=await import('../configure-emulator-slot.mjs');
 const {parseCoordinationState,reserveConfiguredEmulatorSlot}=await import('../emulator-resource-registry.mjs');
 const directory=await mkdtemp(resolve(tmpdir(),'pc11-launch-return-'));
 // Temporary registry, fake worktrees and stubbed port checks only.
 const coordinationPath=resolve(directory,'coordination.json'),worktree=resolve(directory,'launch-worktree'),foreign=resolve(directory,'foreign-worktree');
 const free=async()=>true,localConfig=resolve(worktree,'firebase.local.json'),localEnvironment=resolve(worktree,'.env.emulators.local');
 try{
  await mkdir(worktree);await mkdir(foreign);
  await writeFile(resolve(worktree,'firebase.json'),'{"emulators":{}}\n');
  await writeFile(localConfig,'pre-existing firebase.local.json\n');await writeFile(localEnvironment,'pre-existing .env.emulators.local\n');
  const preexisting=await reserveConfiguredEmulatorSlot({filePath:coordinationPath,slot:2,worktree,ports:[59002],portCheck:free});
  const foreignRow=await reserveConfiguredEmulatorSlot({filePath:coordinationPath,slot:6,worktree:foreign,ports:[59006],portCheck:free});
  const launch=await configureLaunchSlot({slot:5,worktree,coordinationPath,runConfigure:()=>configureEmulatorSlot({slot:5,repositoryDirectory:worktree,coordinationPath,portCheck:free})});
  assert.notEqual(await readFile(localConfig,'utf8'),'pre-existing firebase.local.json\n');
  // A later start step fails; the launcher returns what it took.
  await returnLaunchSlot(launch);
  const state=parseCoordinationState(await readFile(coordinationPath,'utf8'));
  assert.deepEqual([...state.configurations].sort((left,right)=>left.slot-right.slot),[preexisting,foreignRow]);
  assert.equal(await readFile(localConfig,'utf8'),'pre-existing firebase.local.json\n');
  assert.equal(await readFile(localEnvironment,'utf8'),'pre-existing .env.emulators.local\n');
 }finally{await rm(directory,{recursive:true,force:true});}
});
