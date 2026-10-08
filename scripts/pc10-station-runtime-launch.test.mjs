import test from 'node:test';import assert from 'node:assert/strict';import{validateStationLaunchEnvironment}from'./pc10-station-runtime-launch.mjs';
const allocation={status:'EXPLICIT_PARENT_ALLOCATION_GRANTED',probeFamily:'station-success',sourceRoot:'/tmp/scoped-station',projectId:'demo-scoped-station',baseUrl:'http://127.0.0.1:5178',ports:{auth:9149,functions:5051,firestore:8130},sourceCommit:'a'.repeat(40),runnerSha256:'b'.repeat(64),compiledIndexSha256:'c'.repeat(64),compiledTreeSha256:'d'.repeat(64)};
const environment={VITE_LOCAL_GM_ACCESS:'1',VITE_USE_EMULATORS:'1',VITE_FIREBASE_PROJECT_ID:allocation.projectId,VITE_FIREBASE_AUTH_EMULATOR_PORT:'9149',VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT:'5051',VITE_FIREBASE_FIRESTORE_EMULATOR_PORT:'8130',VITE_DEV_SERVER_PORT:'5178'};
test('launch rejects missing local GM opt-in before spawning any resource',()=>{const bad={...environment};delete bad.VITE_LOCAL_GM_ACCESS;assert.throws(()=>validateStationLaunchEnvironment(allocation,bad),/local GM/i);});
test('launch requires every allocated service and Vite port, project and emulator opt-in',()=>{for(const key of Object.keys(environment)){assert.throws(()=>validateStationLaunchEnvironment(allocation,{...environment,[key]:'incorrect'}),undefined,key);}});
test('launch accepts the normal local GM contract with exact allocated environment',()=>{assert.deepEqual(validateStationLaunchEnvironment(allocation,environment),environment);});

test('launch binds exact clean candidate, runner bytes, compiled tree/index and Firebase ports',async()=>{
 const {validateStationLaunchBindings}=await import('./pc10-station-runtime-launch.mjs');
 const binding={sourceCommit:allocation.sourceCommit,trackedClean:true,externalRunner:{sha256:allocation.runnerSha256},compiledTreeSha256:allocation.compiledTreeSha256};const config={emulators:Object.fromEntries(Object.entries(allocation.ports).map(([key,port])=>[key,{port}]))};
 assert.equal(validateStationLaunchBindings(allocation,binding,allocation.compiledIndexSha256,config,environment),true);
 for(const bad of [{...binding,sourceCommit:'e'.repeat(40)},{...binding,trackedClean:false},{...binding,externalRunner:{sha256:'e'.repeat(64)}},{...binding,compiledTreeSha256:'e'.repeat(64)}])assert.throws(()=>validateStationLaunchBindings(allocation,bad,allocation.compiledIndexSha256,config,environment));
 assert.throws(()=>validateStationLaunchBindings(allocation,binding,'e'.repeat(64),config,environment));
 for(const key of Object.keys(allocation.ports))assert.throws(()=>validateStationLaunchBindings(allocation,binding,allocation.compiledIndexSha256,{emulators:{...config.emulators,[key]:{port:1}}},environment));
});
test('only established wrappers and strict loopback Vite receive the complete explicit launch env',async()=>{const {stationLaunchCommands,stationLaunchEnvironment}=await import('./pc10-station-runtime-launch.mjs');assert.deepEqual(stationLaunchEnvironment(allocation),environment);assert.deepEqual(stationLaunchCommands(allocation),{emulators:['scripts/run-emulator-command.mjs','start','--project','demo-scoped-station'],vite:['scripts/run-emulator-command.mjs','vite','--host','127.0.0.1','--strictPort'],proof:['scripts/pc10-station-success-proof.mjs','--allocation']});});
test('successful admission reference is genuine and binds prior product/build/ports while disclosing missing raw launch flags',async()=>{
 const {compareStationAdmissionReference}=await import('./pc10-station-runtime-launch.mjs');const binding={compiledTreeSha256:allocation.compiledTreeSha256,trackedFiles:[{path:'src/components/LocalGmAccess.tsx',sha256:'good'}]};
 const reference={probeFamily:'station-success',sourceCommit:'prior',sourceBinding:{sourceCommit:'prior',...binding},runtime:{useEmulators:true,ports:allocation.ports,projectId:'demo-prior'},claims:['GM1 ordinary admission/consent, normal local GM authorization and independent owned live instance'],receipts:[{endpoint:'claimGmInstance',httpStatus:200}]};
 assert.equal(compareStationAdmissionReference(allocation,binding,reference).rawLaunchEnvironmentRecorded,false);
 assert.throws(()=>compareStationAdmissionReference(allocation,binding,{...reference,receipts:[]}));
 assert.throws(()=>compareStationAdmissionReference(allocation,{...binding,trackedFiles:[{path:'src/components/LocalGmAccess.tsx',sha256:'changed'}]},reference));
 assert.throws(()=>compareStationAdmissionReference(allocation,{...binding,compiledTreeSha256:'changed'},reference));
});
