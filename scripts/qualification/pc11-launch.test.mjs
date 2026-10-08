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
