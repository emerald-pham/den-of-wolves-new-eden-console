import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import * as runner from './pc10-fresh-minimum-ring-proof.mjs';
// Synthetic source-contract fixtures, never Auth/runtime/gameplay acceptance.
// These consume the real compiled pure planners/authority handler. Build the
// unchanged Functions source before this focused file; no emulator is used.
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {candidateWorkspace,resolveCandidateAction}=require('../functions/lib/candidatePaths.js');
const {advanceMaintenance}=require('../functions/lib/maintenance.js');
const {buildVesselActionEnvelope}=require('../functions/lib/vesselActionEnvelope.js');
const {createSessionDebriefCommands}=require('../functions/lib/sessionDebriefCallable.js');
const {commitTerminal,sessionDebriefProjection}=require('../functions/lib/sessionDebrief.js');
const {requireShipCounterBatchRequest}=require('../functions/lib/requestGuards.js');
const sid='contract-ring',groupId='fleet-1',coordinate='1234';
const tracks=['reactor','jump-drive','hydroponics','water-reclamation','advanced-hydroponics'];
const a={sessionId:sid,groupId,cycle:4,phase:'active',coordination:true,now:'2026-10-08T00:00:00.000Z',
 vesselIds:['aegis'],actor:{uid:'gm',gm:true,shipIds:[],research:false,shuttleIds:[]},
 discovered:[{code:'N',coordinate}],ships:{aegis:{fuel:30,materials:10,reactorCapacity:5,destroyed:false,
 jumpCharged:true,jumpDamaged:false,longJumpCost:6,atCandidate:true,jumpedThisCycle:false,coordinate}},
 research:Object.fromEntries(tracks.map(id=>[id,4])),engineeringShuttles:[{id:'black-sheep',available:true}],hiddenScoutCount:0};
const empty={revision:0,sites:{}};
const view=()=>candidateWorkspace(a,empty);

test('actual candidate planner projection is consumed only for exact session/group/cycle/N',()=>{
 const actual=view();assert.equal(runner.assertRingWorkspace(actual,{sessionId:sid,groupId,cycle:4,coordinate,gm:true}).code,'N');
 for(const patch of [{sessionId:'foreign'},{groupId:'fleet-2'},{cycle:5},{paths:[]}])
  assert.throws(()=>runner.assertRingWorkspace({...actual,...patch},{sessionId:sid,groupId,cycle:4,coordinate,gm:true}));
 const ordinary=candidateWorkspace({...a,actor:{...a.actor,gm:false,research:true}},empty);
 assert.equal(Object.hasOwn(ordinary,'privateCalculations'),false);
 assert.throws(()=>runner.assertRingWorkspace({...ordinary,privateCalculations:[{die:6}]},
  {sessionId:sid,groupId,cycle:4,coordinate,gm:false}),/private/i);
});
test('actual candidate committed result binds original session/request/action/revision',()=>{
 const command={sessionId:sid,expectedGroupId:groupId,coordinate,code:'N',action:'contribute-materials',
  requestId:'original-materials',expectedRevision:0,shipId:'aegis',amount:10};
 const actual=resolveCandidateAction(a,empty,command).reply;
 runner.assertRingCandidateCommit(actual,command,view());
 assert.throws(()=>runner.assertRingCandidateCommit({...actual,sessionId:'foreign'},command,view()),/session/i);
 for(const patch of [{requestId:'new-request'},{action:'ring-passage'},{revision:2},{status:'replayed'}])
  assert.throws(()=>runner.assertRingCandidateCommit({...actual,...patch},command,view()));
});
test('resource response uses amount and raw root inventory; exact twelve-step request is legal',()=>{
 const change={sessionId:sid,instanceId:'instance',shipId:'aegis',counter:'resource',resourceId:'fuel',steps:Array(12).fill(1)};
 assert.equal(requireShipCounterBatchRequest(change).steps.length,12);
 const reply={amount:30,...buildVesselActionEnvelope({actorUid:'gm',actorRoleId:null,vesselId:'aegis',turn:4,
  phase:'active',revision:1,idempotencyKey:'counter',auditId:'counter-batch-counter'})};
 runner.assertRingResourceIncrease(reply,{shipResources:{aegis:{fuel:30}}},'aegis','fuel',30);
 assert.throws(()=>runner.assertRingResourceIncrease({...reply,amount:29},{shipResources:{aegis:{fuel:30}}},'aegis','fuel',30));
});
test('actual maintenance planner cycle equals durable maintenanceCycles; no client cycle proxy',()=>{
 const result=advanceMaintenance({shipId:'aegis',cycle:{step:0,revision:0,results:{},charges:[],refuelled:[]},
  currentTurn:4,expectedRevision:0,action:'begin',resources:{ore:5,fuel:30,food:32,water:24,materials:10,securityTeams:9},
  damage:{damagedSystemIds:[],destroyed:false},unrest:0,population:2500,dockings:[],cargo:{},fuelled:{},
  rolls:[1,1],entropy:0.5,now:'2026-10-08T00:00:00.000Z'});
 const reply={status:'committed',cycle:result.cycle};runner.assertRingMaintenanceReply(reply,{maintenanceCycles:{aegis:result.cycle}},'aegis');
 assert.throws(()=>runner.assertRingMaintenanceReply(reply,{maintenanceCycles:{aegis:{...result.cycle,revision:9}}},'aegis'));
});
test('research choice reads real progress map and exact standard/ore debit shape',()=>{
 const result={status:'committed',sessionId:sid,requestId:'science',cycle:4,researchRevision:20,
  trackId:tracks[4],funding:'shepherd-ore',oreCost:5,progress:Object.fromEntries(tracks.map(id=>[id,4]))};
 runner.assertRingResearchChoice(result,{trackId:tracks[4],cycle:4,oreCost:5});
 assert.throws(()=>runner.assertRingResearchChoice({...result,oreCost:0},{trackId:tracks[4],cycle:4,oreCost:5}));
});
test('paid arrival and serverState/navigation remain separate root and navigation reads',()=>{
 runner.assertRingPaidArrival({status:'jumped',fuelCost:6},{shipResources:{aegis:{fuel:30}}},{shipResources:{aegis:{fuel:24}}},'aegis');
 runner.assertRingNavigation({get:key=>key==='shipGalacticCoordinates'?{aegis:coordinate}:undefined},['aegis'],coordinate);
 assert.throws(()=>runner.assertRingNavigation({get:()=>undefined},['aegis'],coordinate));
 assert.throws(()=>runner.assertRingPaidArrival({status:'fuel-shortage',fuelCost:6},{shipResources:{aegis:{fuel:30}}},{shipResources:{aegis:{fuel:24}}},'aegis'));
});
test('craft reservation map is durable and consumed craft disappears from docking array',()=>{
 const root={candidateCraftReservations:{'black-sheep':{code:'N',groupId,coordinate,sourceId:'craft',cycle:4}},shuttleDockings:[]};
 runner.assertRingCraftConsumption(root,'black-sheep');
 assert.throws(()=>runner.assertRingCraftConsumption({...root,shuttleDockings:[{shipId:'shepherd',shuttleId:'black-sheep'}]},'black-sheep'));
});

test('candidate success history uses exact authorized read contract; failure-only begin is rejected without writes',async()=>{
 const documents=new Map(),writes=[];
 const ref=path=>({path,id:path.split('/').at(-1)});
 const snap=path=>({ref:ref(path),exists:documents.has(path),get:key=>documents.get(path)?.[key],data:()=>documents.get(path)});
 const db={doc:ref,runTransaction:async run=>run({get:async target=>snap(target.path),
  update:(target,patch)=>{writes.push(patch);Object.assign(documents.get(target.path),patch);},
  create:(target,value)=>{writes.push(value);documents.set(target.path,value);}})};
 documents.set(`sessions/${sid}`,{phase:'active',currentTurn:4,activeVesselIds:['aegis'],fullGameDemo:{status:'active',progression:'manual'}});
 const session=documents.get(`sessions/${sid}`);
 const committed=commitTerminal({update:(_ref,patch)=>Object.assign(session,patch)},ref(`sessions/${sid}`),snap(`sessions/${sid}`),{
  source:'candidate',committedAt:'2026-10-08T00:00:01.000Z',
  outcome:{type:'game-outcome',result:'success',cause:'candidate-complete',candidateCode:'N',cycle:4,occurredAt:a.now},
  candidate:{code:'N',groups:[{groupId,requirements:[{id:'N-requirements',status:'met'}],rolls:[],losses:[],
   humanCalls:[{id:'ring-far-side-sabotage',cycle:4,audience:'members'}],path:[{action:'ring-repair',result:'completed',audience:'members'}]}]}});
 runner.assertRingSuccessfulSnapshot(session);assert.equal(session.phase,'debrief');assert.equal(session.fullGameDemo.status,'complete');
 documents.set(`sessions/${sid}/players/gm`,{uid:'gm',role:'gm',connected:true});documents.set(`sessions/${sid}/gmInstances/instance`,{uid:'gm',connected:true});
 const handlers=createSessionDebriefCommands({db,isLiveGmInstance:(instance,player,uid)=>instance.get('uid')===uid&&player.get('role')==='gm'});
 const request={sessionId:sid,instanceId:'instance'};
 const read=await runner.readRingEndingHistory((name,data)=>{
  if(name==='getSessionDebrief')return handlers.read({data,auth:{uid:'gm'}});
  if(name==='beginSessionDebrief')return handlers.begin({data,auth:{uid:'gm'}});
  throw Error('Unexpected ending endpoint');
 },request);
 assert.equal(read.type,'session-debrief');assert.deepEqual(read.snapshot,sessionDebriefProjection(committed.snapshot,{groupId:'gm',vesselIds:['aegis'],gm:true}));
 assert.equal(writes.length,0);
 await assert.rejects(handlers.read({data:request,auth:{uid:'ordinary'}}),error=>error.code==='permission-denied');
 const member=sessionDebriefProjection(committed.snapshot,{groupId,vesselIds:['aegis']});
 assert.equal(Object.hasOwn(member.candidate.groups[0],'groupId'),false);
 assert.equal(Object.hasOwn(member.candidate.groups[0].path[0],'audience'),false);
});

test('persisted closed cache cannot qualify same-UID authoritative scoped history',()=>{
 const expected={sessionId:sid,uidHash:'science-hash',groupId,cycle:4,ships:['aegis']};
 const current={hasAuth:true,sameActor:true,phase:'closed',sessionId:sid,uidHash:'science-hash',fleetGroupId:groupId,
  freshness:'cache',hydrationRevision:0,debriefType:'session-debrief',debriefVersion:1,debriefSource:'candidate',
  debriefResult:'success',debriefCandidateCode:'N',debriefCycle:4,debriefGroupCount:1,debriefGroupsPrivacySafe:true,
  debriefPaths:[{action:'ring-repair',result:'completed'},{action:'ring-passage',result:'crossed',shipId:'aegis',fuelSpent:5},
   {action:'sabotage-ring',result:'completed'}]};
 assert.equal(runner.isAcceptedRingClosedHistory(current,expected),false);
 const accepted={...current,freshness:'server',hydrationRevision:1};
 assert.equal(runner.isAcceptedRingClosedHistory(accepted,expected),true);
 for(const patch of [{uidHash:'foreign'},{fleetGroupId:'fleet-2'},{debriefCandidateCode:'O'},
  {debriefGroupCount:2},{debriefGroupsPrivacySafe:false},{debriefPaths:[]}])
  assert.equal(runner.isAcceptedRingClosedHistory({...accepted,...patch},expected),false);
 // Closed-history entitlement never requires a live connection or active station.
 assert.equal(runner.isAcceptedRingClosedHistory({...accepted,connection:'disconnected',activeConsoleRoleId:null},expected),true);
});
