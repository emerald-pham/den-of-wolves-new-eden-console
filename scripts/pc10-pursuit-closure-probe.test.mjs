import test from 'node:test';import assert from 'node:assert/strict';import * as runner from './pc10-fresh-minimum-ring-proof.mjs';
test('closure probe has two fresh actors and no Ring recovery claim',()=>{assert.deepEqual(runner.minimumPursuitClosurePlan(),{actualAuthenticatedActors:2,configuredRoles:13,browserProcesses:1,browserContexts:2,hardCapMs:300000,probeFamily:'pursuit-closure',nClosedHistoryObserved:false});});
test('closure probe workflow contains only legitimate setup and genuine Pursuit closure',async()=>{const trace=[];await runner.runPursuitClosureWorkflow({setup:async()=>trace.push('setup'),pursuitAndClose:async()=>trace.push('pursuit-close')});assert.deepEqual(trace,['setup','pursuit-close']);});
test('closure probe stops if normal setup fails',async()=>{let called=false;await assert.rejects(runner.runPursuitClosureWorkflow({setup:async()=>{throw Error('setup failed')},pursuitAndClose:async()=>{called=true}}));assert.equal(called,false);});

import * as ending from './pc10-full-game-cycle-ending.mjs';
test('entitled GM ending read can start from source-normal debrief without observer snapshot, never foreign authority',()=>{
 const current={hasAuth:true,sameActor:true,playerRole:'gm',gmInstanceOwned:true,sessionId:'own',phase:'debrief',freshness:'server',connection:'live',fullGameDemo:{status:'complete'}};
 assert.equal(ending.isReadyForEntitledGmEndingRead(current,'own'),true);
 for(const patch of [{sessionId:'foreign'},{gmInstanceOwned:false},{sameActor:false},{freshness:'cache'},{phase:'active'}])assert.equal(ending.isReadyForEntitledGmEndingRead({...current,...patch},'own'),false);
});

test('held new cycle completes both normal offered presentations before another Coordination request',async()=>{
 const trace=[],actors=[{label:'GM'},{label:'Reader'}];
 await runner.presentPursuitCycle(actors,async actor=>({phase:'active',cycle:2,ordinaryBriefingHeld:true,label:actor.label}),async(actor,state,options)=>{assert.equal(state.ordinaryBriefingHeld,true);assert.deepEqual(options,{clearBriefing:true});trace.push(actor.label);});
 trace.push('Coordination');assert.deepEqual(trace,['GM','Reader','Coordination']);
});
