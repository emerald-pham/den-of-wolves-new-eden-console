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

test('launcher forwards actual SIGINT to owned process tree and waits for scoped teardown',async()=>{
 const {EventEmitter}=await import('node:events');const {runStationLaunchCommand}=await import('./pc10-station-runtime-launch.mjs');const signals=new EventEmitter(),child=new EventEmitter();child.pid=123;const stopped=[];child.kill=signal=>stopped.push(signal);let complete=false;
 const pending=runStationLaunchCommand('node',['owned-wrapper'],{signalSource:signals,spawnProcess:()=>child,terminateProcessTree:(owned,signal)=>{assert.equal(owned,child);stopped.push(signal)}}).then(()=>{complete=true});
 signals.emit('SIGINT');await Promise.resolve();assert.equal(complete,false);child.emit('exit',0,null);await pending;assert.deepEqual(stopped,['SIGINT']);assert.equal(signals.listenerCount('SIGINT'),0);assert.equal(signals.listenerCount('SIGTERM'),0);
});

test('reviewed backend repair reports historical admission delta and requires fresh current admission',async()=>{
 const {compareStationAdmissionReference}=await import('./pc10-station-runtime-launch.mjs');
 const prior={compiledTreeSha256:'old-build',trackedFiles:[{path:'src/components/LocalGmAccess.tsx',sha256:'same'},{path:'functions/src/index.ts',sha256:'old-source'}]};
 const reference={probeFamily:'station-success',sourceCommit:'prior',sourceBinding:{sourceCommit:'prior',...prior},runtime:{useEmulators:true,ports:allocation.ports,projectId:'demo-prior'},claims:['GM1 ordinary admission/consent, normal local GM authorization and independent owned live instance'],receipts:[{endpoint:'claimGmInstance',httpStatus:200}]};
 const current={compiledTreeSha256:'new-build',trackedFiles:[{path:'src/components/LocalGmAccess.tsx',sha256:'same'},{path:'functions/src/index.ts',sha256:'new-source'}]};
 const result=compareStationAdmissionReference(allocation,current,reference);
 assert.equal(result.compiledTreeEqual,false);assert.equal(result.productSourcesEqual,false);assert.equal(result.requiresFreshAdmission,true);
 assert.deepEqual(result.backendSourceChanges,[{path:'functions/src/index.ts',priorSha256:'old-source',currentSha256:'new-source'}]);
 assert.throws(()=>compareStationAdmissionReference(allocation,{...prior,compiledTreeSha256:'unexplained-build'},reference));
 assert.throws(()=>compareStationAdmissionReference(allocation,{...current,trackedFiles:[{path:'src/components/LocalGmAccess.tsx',sha256:'changed'},{path:'functions/src/index.ts',sha256:'new-source'}]},reference));
});

test('historical admission discloses frontend regression test changes without treating them as product route changes',async()=>{
 const {compareStationAdmissionReference}=await import('./pc10-station-runtime-launch.mjs');
 const prior={compiledTreeSha256:'same-build',trackedFiles:[{path:'src/components/AegisFighterWingLaunchPanel.tsx',sha256:'same'},{path:'src/components/AegisFighterWingLaunchPanel.test.tsx',sha256:'prior-test'}]};
 const reference={probeFamily:'station-success',sourceCommit:'prior',sourceBinding:{sourceCommit:'prior',...prior},runtime:{useEmulators:true,ports:allocation.ports,projectId:'demo-prior'},claims:['GM1 ordinary admission/consent, normal local GM authorization and independent owned live instance'],receipts:[{endpoint:'claimGmInstance',httpStatus:200}]};
 const current={...prior,trackedFiles:[prior.trackedFiles[0],{path:prior.trackedFiles[1].path,sha256:'new-test'}]};
 const result=compareStationAdmissionReference(allocation,current,reference);
 assert.deepEqual(result.frontendTestSourceChanges,[{path:prior.trackedFiles[1].path,priorSha256:'prior-test',currentSha256:'new-test'}]);
 assert.equal(result.requiresFreshAdmission,true);
 assert.throws(()=>compareStationAdmissionReference(allocation,{...current,trackedFiles:[{path:prior.trackedFiles[0].path,sha256:'changed-product'},current.trackedFiles[1]]},reference));
});
