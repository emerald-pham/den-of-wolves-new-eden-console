import assert from 'node:assert/strict';
import test from 'node:test';
import { minimumRingPlan, runRingWorkflow } from './pc10-fresh-minimum-ring-proof.mjs';

test('fresh Ring plan has three entitled Auth identities and zero unused-seat accounts', () => {
  const plan = minimumRingPlan();
  assert.equal(plan.actualAuthenticatedActors, 3);
  assert.equal(plan.configuredRoles, 13);
  assert.equal(plan.browserProcesses, 2);
  assert.equal(plan.browserContexts, 3);
  assert.equal(plan.hardCapMs, 1200000);
});

// Synthetic procedure contracts, never gameplay evidence. Each operation is
// replaced by the concrete normal-UI/SDK implementation in the executable.
test('fresh workflow creates actual prerequisites, then original recovery and ending; no discovery/checkpoint replay', async () => {
  const trace = [];
  const operations = Object.fromEntries(['setup', 'researchCycle', 'advance', 'arrive', 'repairRing',
    'crossAndRecover', 'finishPassages', 'sabotageAndClose'].map(name => [name, async value => {
    trace.push({ name, value }); return name === 'setup' ? { sessionId: 'fresh' } : undefined;
  }]));
  await runRingWorkflow(operations);
  assert.deepEqual(trace.map(value => value.name), ['setup', 'researchCycle', 'advance', 'researchCycle',
    'advance', 'researchCycle', 'advance', 'researchCycle', 'arrive', 'repairRing', 'crossAndRecover',
    'finishPassages', 'sabotageAndClose']);
  assert.deepEqual(trace.filter(value => value.name === 'researchCycle').map(value => value.value), [1, 2, 3, 4]);
  assert.deepEqual(trace.filter(value => value.name === 'advance').map(value => value.value), [2, 3, 4]);
  assert.equal(trace.some(value => /discover|checkpoint/i.test(value.name)), false);
});

test('first prerequisite failure stops the workflow before candidate outcomes', async () => {
  const trace = [];
  const operations = { setup: async () => trace.push('setup'),
    researchCycle: async () => { trace.push('research'); throw new Error('real research unavailable'); },
    arrive: async () => trace.push('arrive') };
  await assert.rejects(runRingWorkflow(operations), /real research unavailable/);
  assert.deepEqual(trace, ['setup', 'research']);
});

import * as proof from './pc10-fresh-minimum-ring-proof.mjs';
test('cleanup failure cannot publish a passed proof or erase the original failure', () => {
 const first = new Error('original crossing failure');
 const evidence = {status:'passed'};
 const cleanup = {errors:[{label:'owned Auth',error:'delete denied'}]};
 assert.equal(typeof proof.finalizeRingEvidence, 'function');
 const failure = proof.finalizeRingEvidence(evidence, cleanup, null);
 assert.equal(evidence.status,'failed'); assert.match(failure.message,/cleanup/i);
 assert.equal(proof.finalizeRingEvidence({status:'failed'},cleanup,first),first);
});
test('allocation binds the complete compiled tree before runtime', () => {
 const input={status:'EXPLICIT_PARENT_ALLOCATION_GRANTED',sourceRoot:'/tmp/source',projectId:'demo-ring',
 baseUrl:'http://127.0.0.1:5190',ports:{auth:9190,firestore:8180,functions:5100},
 sourceCommit:'a'.repeat(40),runnerSha256:'b'.repeat(64),compiledIndexSha256:'c'.repeat(64)};
 assert.throws(()=>proof.validateRingAllocation(input),/compiledTreeSha256/);
 assert.equal(proof.validateRingAllocation({...input,compiledTreeSha256:'d'.repeat(64)}).compiledTreeSha256,'d'.repeat(64));
});

test('actual candidate recovery expects server replay status while preserving every original result field',()=>{
 const original={type:'candidate-action-result',status:'committed',action:'ring-passage',requestId:'original',fuelSpent:5,outcome:'crossed'};
 assert.equal(typeof proof.expectedRingRecoveryReply,'function');
 assert.deepEqual(proof.expectedRingRecoveryReply(original),{...original,status:'replayed'});
 assert.equal(original.status,'committed');
});

test('maintenance pacing prevents the server thirty-request minute burst without retry or bypass',async()=>{
 let now=0;const waits=[];
 assert.equal(typeof proof.createRingMaintenancePacer,'function');
 const pace=proof.createRingMaintenancePacer({now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}});
 const times=[];for(let i=0;i<31;i++){await pace();times.push(now);}
 assert.ok(times[30]-times[0]>60000);assert.equal(waits.length,30);
});
test('owned Auth freshness tolerates second precision but forbids a preexisting identity',()=>{
 assert.equal(typeof proof.assertFreshRingIdentity,'function');
 proof.assertFreshRingIdentity({uid:'fresh',metadata:{creationTime:new Date(100000).toUTCString()}},100999,new Set());
 assert.throws(()=>proof.assertFreshRingIdentity({uid:'old',metadata:{creationTime:new Date(100000).toUTCString()}},100999,new Set(['old'])),/preexisting/i);
 assert.throws(()=>proof.assertFreshRingIdentity({uid:'old',metadata:{creationTime:new Date(99000).toUTCString()}},100999,new Set()),/fresh/i);
});
test('page errors and blocked remote requests preclude successful native proof',()=>{
 assert.equal(typeof proof.assertRingRuntimeClean,'function');
 proof.assertRingRuntimeClean([],[]);
 assert.throws(()=>proof.assertRingRuntimeClean([{message:'page failed'}],[]),/page/i);
 assert.throws(()=>proof.assertRingRuntimeClean([],['https://outside.example/']),/remote/i);
});

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('CLI entrypoint validates arguments through both canonical and /tmp alias paths',()=>{
 const canonical=fileURLToPath(new URL('./pc10-fresh-minimum-ring-proof.mjs',import.meta.url));
 const alias=canonical.replace(/^\/private\/tmp\//,'/tmp/');
 for(const filename of new Set([canonical,alias])){
  const result=spawnSync(process.execPath,[filename,'--invalid'],{encoding:'utf8'});
  assert.notEqual(result.status,0,`${filename} silently skipped its CLI guard`);
  assert.match(result.stderr,/Use --allocation/);
 }
});

test('Ring location comes from the entitled mounted GM chart, with exactly one candidate and locked chart',async()=>{
 assert.equal(typeof proof.readRingCoordinate,'function');
 let reads=0;
 const surface={storeModuleUrl:()=>'/native/store',page:{evaluate:async(callback,url)=>{
  assert.equal(typeof callback,'function');assert.equal(url,'/native/store');reads++;
  return{chartId:'A',locked:true,candidates:[{code:'N',coordinate:'1234'}]};
 }}};
 assert.equal(await proof.readRingCoordinate(surface),'1234');assert.equal(reads,1);
 surface.page.evaluate=async()=>({chartId:'A',locked:true,candidates:[]});
 await assert.rejects(proof.readRingCoordinate(surface),/one Ring/i);
 surface.page.evaluate=async()=>({chartId:'A',locked:false,candidates:[{code:'N',coordinate:'1234'}]});
 await assert.rejects(proof.readRingCoordinate(surface),/locked/i);
});
