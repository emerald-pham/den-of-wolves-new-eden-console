import assert from 'node:assert/strict';
import test from 'node:test';
import { minimumRingPlan, runRingWorkflow, selectStationCombatCrew } from './pc10-fresh-minimum-ring-proof.mjs';

function stationLossFixture({ originalGeneration = 4, currentGeneration = 4 } = {}) {
  const actor = { uid: 'pdf', roleId: 'refinery-124-pdf-colonel',
    original: { uidHash: 'pdf-hash', sessionId: 'sid', fleetGroupId: 'fleet-1',
      connectionGeneration: originalGeneration, documentTimeOrigin: 10000, identityHydrationRevision: 2 } };
  const escapeState = { status: 'pending', shipId: 'refinery-124', destructionEventId: 'wolf-loss-1', revision: 3 };
  const root = { shipDamage: { 'refinery-124': { damagedSystemIds: ['reactor'], destroyed: true } } };
  const player = { uid: 'pdf', sessionId: 'sid', role: 'player', assignedRoleId: actor.roleId,
    activeConsoleRoleId: null, seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: currentGeneration,
    connected: true, escapeState };
  const commonMember = { hasAuth: true, sameActor: true, uidHash: 'pdf-hash', sessionId: 'sid', meSessionId: 'sid',
    profileRoleId: null, profileSessionId: null, playerRole: 'player', assignedRoleId: actor.roleId,
    seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: currentGeneration, documentTimeOrigin: 10000,
    identityHydrationRevision: 2, connection: 'live', freshness: 'server', kicked: false,
    replacementRoleId: null, replacementStatus: null, invalidFields: [] };
  return { actor, root, player, escapeState,
    before: { ...commonMember, activeConsoleRoleId: actor.roleId, escapeLocked: false,
      escapeState: null, browserProjectionConsistent: true },
    after: { ...commonMember, activeConsoleRoleId: null, escapeLocked: true,
      escapeState, browserProjectionConsistent: true } };
}

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

test('station consumer waits for normal browser feed after authoritative server loss before removing the owner from choices', async () => {
  const actor = { uid: 'pdf', roleId: 'refinery-124-pdf-colonel',
    original: { uidHash: 'pdf-hash', sessionId: 'sid', fleetGroupId: 'fleet-1',
      connectionGeneration: 4, documentTimeOrigin: 10000, identityHydrationRevision: 2 } };
  const escapeState = { status: 'pending', shipId: 'refinery-124', destructionEventId: 'wolf-loss-1', revision: 3 };
  const root = { shipDamage: { 'refinery-124': { damagedSystemIds: ['reactor'], destroyed: true } } };
  const player = { uid: 'pdf', sessionId: 'sid', role: 'player', assignedRoleId: actor.roleId,
    activeConsoleRoleId: null, seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: 4,
    connected: true, escapeState };
  const commonMember = { hasAuth: true, sameActor: true, uidHash: 'pdf-hash', sessionId: 'sid', meSessionId: 'sid',
    profileRoleId: null, profileSessionId: null, playerRole: 'player', assignedRoleId: actor.roleId,
    seatId: actor.roleId, fleetGroupId: 'fleet-1', connectionGeneration: 4, documentTimeOrigin: 10000,
    identityHydrationRevision: 2, connection: 'live', freshness: 'server', kicked: false,
    replacementRoleId: null, replacementStatus: null, invalidFields: [] };
  const browserBeforeNormalFeed = { ...commonMember, activeConsoleRoleId: actor.roleId,
    escapeLocked: false, escapeState: null, browserProjectionConsistent: true };
  const browserAfterNormalFeed = { ...commonMember, activeConsoleRoleId: null,
    escapeLocked: true, escapeState, browserProjectionConsistent: true };
  const browserReads = [browserBeforeNormalFeed, browserAfterNormalFeed];
  const reads = { root: 0, players: 0, member: 0 }, waits = [], inactive = [];

  const active = await selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => { reads.root++; return root; },
    readPlayers: async () => { reads.players++; return [player]; },
    readMember: async () => browserReads[Math.min(reads.member++, browserReads.length - 1)],
    wait: async milliseconds => { waits.push(milliseconds); },
    onInactive: (value, member) => inactive.push({ roleId: value.roleId, escapeState: member.escapeState }),
  });

  assert.deepEqual(active, []);
  assert.deepEqual(inactive, [{ roleId: actor.roleId, escapeState }]);
  assert.deepEqual(reads, { root: 2, players: 2, member: 2 });
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 0 && waits[0] <= 200);
});

test('station loss wait tolerates connecting/cache publication while pinning the first current generation', async () => {
  const { actor, root, player, before, after } = stationLossFixture({ originalGeneration: 3, currentGeneration: 4 });
  const connecting = { ...before, connection: 'connecting', freshness: 'cache', connectionGeneration: 4 };
  const reads = { root: 0, players: 0, member: 0 };
  const active = await selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => { reads.root++; return root; },
    readPlayers: async () => { reads.players++; return [player]; },
    readMember: async () => [connecting, after][Math.min(reads.member++, 1)],
    wait: async () => {},
  });
  assert.deepEqual(active, []);
  assert.deepEqual(reads, { root: 2, players: 2, member: 2 });
});

test('station loss wait rejects a changed server escape tuple instead of rebasing to it', async () => {
  const { actor, root, player, before, after } = stationLossFixture();
  const nextEscape = { ...player.escapeState, destructionEventId: 'wolf-loss-2', revision: 4 };
  let playerReads = 0, memberReads = 0;
  await assert.rejects(selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => root,
    readPlayers: async () => [{ ...player, escapeState: playerReads++ === 0 ? player.escapeState : nextEscape }],
    readMember: async () => [before, { ...after, escapeState: nextEscape }][Math.min(memberReads++, 1)],
    wait: async () => {},
  }), /loss tuple changed/i);
  assert.equal(playerReads, 2);
  assert.equal(memberReads, 1);
});

test('station loss wait rejects a destroyed root that disappears after the server loss was observed', async () => {
  const { actor, root, player, before } = stationLossFixture();
  const roots = [root, { shipDamage: { 'refinery-124': { damagedSystemIds: [], destroyed: false } } }];
  let rootReads = 0;
  await assert.rejects(selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => roots[Math.min(rootReads++, 1)],
    readPlayers: async () => [player],
    readMember: async () => before,
    wait: async () => {},
  }), /destroyed root changed/i);
  assert.equal(rootReads, 2);
});

test('station loss wait rejects torn before/after browser reads before accepting the normal feed', async () => {
  const { actor, root, player, before, after } = stationLossFixture();
  const torn = { ...after, browserLossSample: after, browserLossSamples: [before, after], browserProjectionConsistent: true };
  const coherent = { ...after, browserLossSample: after, browserLossSamples: [after, after], browserProjectionConsistent: true };
  let memberReads = 0;
  const active = await selectStationCombatCrew([actor], {
    deadlineAt: Date.now() + 1000,
    readRoot: async () => root,
    readPlayers: async () => [player],
    readMember: async () => [torn, coherent][Math.min(memberReads++, 1)],
    wait: async () => {},
  });
  assert.deepEqual(active, []);
  assert.equal(memberReads, 2);
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
