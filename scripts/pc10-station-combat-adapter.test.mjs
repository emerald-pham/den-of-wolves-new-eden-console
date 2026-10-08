import assert from 'node:assert/strict';import test from 'node:test';import * as adapter from './pc10-station-combat-adapter.mjs';
import { heldProofFailureObservations, rememberProofFailure } from './pc10-proof-failure-evidence.mjs';
test('sparse combat actor requires actual original Wing berth, never legacy absent-map or GM substitution',()=>{const actor={hasAuth:true,sameActor:true,uidHash:'wing',sessionId:'sid',playerRole:'player',assignedRoleId:'wing-commander',activeConsoleRoleId:'wing-commander',seatId:'wing-commander',currentCanonicalSeatOwned:true,currentMemberBerthPresent:true,currentMemberBerthMatches:true,connection:'live',freshness:'server',fleetGroupId:'fleet-1',cycle:2};adapter.assertSparseStationWing(actor,actor);for(const patch of [{currentMemberBerthPresent:false},{uidHash:'foreign'},{playerRole:'gm'},{assignedRoleId:'executive-officer'},{freshness:'cache'}])assert.throws(()=>adapter.assertSparseStationWing({...actor,...patch},actor));});
test('sparse Station combat awaits actual source progress and returns only finalized Station attack',async()=>{let index=0;const states=[{attackId:'real',turn:2,revision:1,status:'declared',currentStep:'targeting',threatSiteCode:'P'},{attackId:'real',turn:2,revision:2,status:'resolved',currentStep:'resolved',threatSiteCode:'P',pStationRepeat:{status:'stopped'}}];const result=await adapter.runSparseStationCombat({deadlineAt:Date.now()+1000,readAttack:async()=>states[index],assertActors:async()=>{},choose:async()=>{index++;},wait:async()=>{}});assert.equal(result.status,'resolved');});
test('no adapter credit can come from foreign attack or fabricated resolution type',async()=>{let i=0;await assert.rejects(adapter.runSparseStationCombat({deadlineAt:Date.now()+1000,readAttack:async()=>({attackId:i++?'foreign':'own',turn:2,revision:1,status:'declared',currentStep:'targeting',threatSiteCode:'P'}),assertActors:async()=>{},choose:async()=>{},wait:async()=>{}}));});
const boarding={attackId:'original',turn:2,revision:5,threatSiteCode:'P',status:'declared',currentStep:'boarding'};
const pending={type:'wolf-boarding-defence-choice-view',sessionId:'sid',turn:2,revision:6,targetShipId:'aegis',choiceStatus:'pending',availableSecurityTeams:2};
test('boarding accepts only fresh same-attack pending revision after legitimate automatic empty-crew progress',async()=>{const result=await adapter.stationBoardingRead(boarding,{sessionId:'sid',readChoice:async()=>({status:'committed',result:pending}),readAttack:async()=>({...boarding,revision:6})});assert.equal(result.kind,'choice');assert.equal(result.view.revision,6);});
test('boarding invalid-phase is terminal only after fresh same original P attack has actually finalized',async()=>{const result=await adapter.stationBoardingRead(boarding,{sessionId:'sid',readChoice:async()=>({status:'denied',code:'functions/failed-precondition',message:'Wolf boarding defence is not currently open.'}),readAttack:async()=>({...boarding,status:'resolved',currentStep:'resolved',revision:6,pStationRepeat:{status:'repeat'}})});assert.equal(result.kind,'resolved');});
test('boarding race never masks authority/transport rejection or foreign finalized attack',async()=>{for(const patch of [{status:'denied',code:'functions/permission-denied',message:'not entitled'},{status:'denied',code:'functions/unavailable',message:'network'}])await assert.rejects(adapter.stationBoardingRead(boarding,{sessionId:'sid',readChoice:async()=>patch,readAttack:async()=>({...boarding,status:'resolved',currentStep:'resolved',pStationRepeat:{status:'stopped'}})}));await assert.rejects(adapter.stationBoardingRead(boarding,{sessionId:'sid',readChoice:async()=>({status:'committed',result:pending}),readAttack:async()=>({...boarding,attackId:'foreign',revision:6})}));});
test('already committed current boarding choice waits for normal progress without a second UI commit',async()=>{const result=await adapter.stationBoardingRead(boarding,{sessionId:'sid',readChoice:async()=>({status:'committed',result:{...pending,choiceStatus:'committed'}}),readAttack:async()=>({...boarding,revision:6})});assert.equal(result.kind,'refresh');});
test('combat failure retains last authoritative original attack and stage instead of only timeout text',async()=>{const states=[];const current={attackId:'original',turn:2,revision:3,threatSiteCode:'P',status:'declared',currentStep:'long-range',deadlineAt:'9999-12-31T23:59:59.999Z',decisionSummary:{range:{status:'pending'}}};await assert.rejects(adapter.runSparseStationCombat({deadlineAt:Date.now()+1000,readAttack:async()=>current,assertActors:async()=>{},onState:async state=>states.push(state),choose:async()=>{throw Error('actionable held stage')},wait:async()=>{}}),/actionable held stage/);assert.deepEqual(states,[current]);});
test('captured stale launch race can use bounded observed UI recovery before normal fresh clicks',async()=>{
 let index=0,choices=0,recoveries=0;const stale=Error('launchAegisFighterWing: actual UI request rejected.');
 const states=[{attackId:'original',turn:2,revision:1,status:'declared',currentStep:'targeting',threatSiteCode:'P'},{attackId:'original',turn:2,revision:2,status:'declared',currentStep:'targeting',threatSiteCode:'P'},{attackId:'original',turn:2,revision:3,status:'resolved',currentStep:'resolved',threatSiteCode:'P',pStationRepeat:{status:'repeat'}}];
 const final=await adapter.runSparseStationCombat({deadlineAt:Date.now()+1000,readAttack:async()=>states[index],assertActors:async()=>{},choose:async()=>{if(choices++===0)throw stale;index=2;},recoverChoice:async(error,current,{deadlineAt})=>{assert.equal(error,stale);assert.equal(current.revision,1);assert.ok(deadlineAt>Date.now());recoveries++;index=1;return true;},wait:async()=>{}});
 assert.equal(final.status,'resolved');assert.equal(recoveries,1);assert.equal(choices,2);
});
const rejectedLaunch={operation:'captureLifecycleUiAction',endpoint:'launchAegisFighterWing',httpStatus:400,
 requestData:{sessionId:'sid',wingId:'fighter-wing-alpha',requestId:'rejected-id',expectedTurn:2,expectedRevision:1,expectedWingRevision:0},
 before:{sessionId:'sid',uidHash:'wing'},current:{sessionId:'sid',uidHash:'wing'},body:{error:{status:'FAILED_PRECONDITION',details:{commandError:'stale-revision'},message:'The AEGIS Fighter Wing launch view is stale. Refresh the current Wolf attack.'}}};
const launchCurrent={attackId:'original',turn:2,revision:1,status:'declared',currentStep:'targeting',threatSiteCode:'P'};
const refreshedLaunch={sessionId:'sid',attackId:'original',turn:2,revision:2,wingId:'fighter-wing-alpha',wingRevision:0,eligible:true,launched:false};
function recoveryOptions(patch={}){return {observations:[structuredClone(rejectedLaunch)],readAttack:async()=>({...launchCurrent,revision:2}),readLaunchView:async()=>refreshedLaunch,assertActors:async()=>{},deadlineAt:Date.now()+1000,used:new Map(),retain:async()=>{},...patch};}
test('only exact observed stale rejection uses refreshed same-attack UI authority once',async()=>{
 const original=Error('original observed rejection'),options=recoveryOptions();let checks=0,retained;
 options.assertActors=async()=>checks++;options.retain=async(error,context)=>{assert.equal(error,original);retained=context};
 assert.equal(await adapter.recoverStationLaunch(original,launchCurrent,options),true);assert.equal(checks,2);assert.equal(retained.freshUiLaunchView,refreshedLaunch);
 await assert.rejects(adapter.recoverStationLaunch(original,launchCurrent,options),error=>error===original);
 const capture={data:{...rejectedLaunch.requestData,requestId:'fresh-choice',expectedRevision:2},result:{attackId:'original',wingId:'fighter-wing-alpha',launched:true}};
 adapter.assertRecoveredStationLaunch(capture,launchCurrent,options.used);
 assert.throws(()=>adapter.assertRecoveredStationLaunch({...capture,data:{...capture.data,requestId:'rejected-id'}},launchCurrent,options.used));
 assert.throws(()=>adapter.assertRecoveredStationLaunch({...capture,data:{...capture.data,expectedWingRevision:1}},launchCurrent,options.used));
});
test('stale recovery never admits transport uncertainty, other errors, foreign authority, ineligible wing or expiration',async()=>{
 const original=Error('original');const bad=[];
 for(const patch of [{httpStatus:500},{httpStatus:200},{endpoint:'passWolfFighterLaunchChoice'},{body:{error:{status:'PERMISSION_DENIED'}}},{current:{sessionId:'sid',uidHash:'foreign'}},{requestData:{...rejectedLaunch.requestData,expectedTurn:3}}])bad.push({observations:[{...rejectedLaunch,...patch}]});
 for(const patch of [{attackId:'foreign'},{turn:3},{revision:1},{currentStep:'medium-range'},{status:'resolved'},{threatSiteCode:'N'}])bad.push({readAttack:async()=>({...launchCurrent,revision:2,...patch})});
 for(const patch of [{sessionId:'foreign'},{attackId:'foreign'},{revision:1},{wingId:'fighter-wing-bravo'},{eligible:false},{launched:true},{wingRevision:-1}])bad.push({readLaunchView:async()=>({...refreshedLaunch,...patch})});
 bad.push({observations:[]},{deadlineAt:Date.now()-1},{assertActors:async()=>{throw original}});
 for(const patch of bad){let retained=false;await assert.rejects(adapter.recoverStationLaunch(original,launchCurrent,recoveryOptions({...patch,retain:async()=>{retained=true}})),error=>error===original);assert.equal(retained,false);}
});
test('accepted stale recovery never resets its original deadline at a higher attack revision',async()=>{
 let i=0,limit;const original=Error('stale');
 await assert.rejects(adapter.runSparseStationCombat({deadlineAt:Date.now()+1000,readAttack:async()=>({...launchCurrent,revision:i+1}),assertActors:async()=>{},choose:async(_state,{deadlineAt})=>{if(i===0){limit=deadlineAt;throw original;}assert.equal(deadlineAt,limit);throw Error('second rejection fatal');},recoverChoice:async error=>{if(error!==original)return false;i++;return true;},wait:async()=>{}}),/second rejection fatal/);
});

const plannedStationHosts=['aegis','dione','icebreaker','shepherd','quellon','refinery-124'];
function stationRootWithDamage(overrides={}) {
 return {activeVesselIds:[...plannedStationHosts],shipDamage:Object.fromEntries(plannedStationHosts.map(shipId=>
  [shipId,{destroyed:false,damagedSystemIds:[]}]).map(([shipId,damage])=>[shipId,{...damage,...overrides[shipId]}]))};
}
function stationWorkspaceShips() {
 return [
  {shipId:'aegis',result:'awaiting-choice',canAct:true,blocker:'',reactorCapacity:5},
  {shipId:'dione',result:'awaiting-choice',canAct:true,blocker:'',reactorCapacity:4},
  {shipId:'icebreaker',result:'awaiting-choice',canAct:true,blocker:'',reactorCapacity:4},
  {shipId:'shepherd',result:'awaiting-choice',canAct:true,blocker:'',reactorCapacity:3},
  {shipId:'quellon',result:'awaiting-choice',canAct:true,blocker:'',reactorCapacity:3},
  {shipId:'refinery-124',result:'awaiting-choice',canAct:true,blocker:'',reactorCapacity:4},
 ];
}
test('Station repair selection skips only actually destroyed members of the original planned host roster',()=>{
 const root=stationRootWithDamage({icebreaker:{destroyed:true,damagedSystemIds:['reactor']},'refinery-124':{destroyed:true,damagedSystemIds:['reactor']}});
 assert.deepEqual(adapter.stationSurvivingRepairTargets(plannedStationHosts,root),['aegis','dione','shepherd','quellon']);
});
test('Station repair selection keeps every explicitly living host when no vessel was destroyed',()=>{
 assert.deepEqual(adapter.stationSurvivingRepairTargets(plannedStationHosts,stationRootWithDamage()),plannedStationHosts);
});
test('Station repair selection fails closed on duplicate, foreign, or missing damage authority',()=>{
 const root=stationRootWithDamage();
 assert.throws(()=>adapter.stationSurvivingRepairTargets([...plannedStationHosts,'aegis'],root),/duplicate|unique/i);
 assert.throws(()=>adapter.stationSurvivingRepairTargets([...plannedStationHosts,'foreign-ship'],root),/roster|planned|foreign|active/i);
 const missing=stationRootWithDamage();delete missing.shipDamage.icebreaker;
 assert.throws(()=>adapter.stationSurvivingRepairTargets(plannedStationHosts,missing),/damage|icebreaker|missing/i);
 const undefinedDamage=stationRootWithDamage();delete undefinedDamage.shipDamage.icebreaker.destroyed;
 assert.throws(()=>adapter.stationSurvivingRepairTargets(plannedStationHosts,undefinedDamage),/destroyed|damage|boolean/i);
});
test('Station Reactor plan counts only unique living candidates and reports the fixed 18 threshold',()=>{
 const ships=stationWorkspaceShips();
 Object.assign(ships.find(ship=>ship.shipId==='icebreaker'),{result:'lost',canAct:false,blocker:'Lost or destroyed ship.'});
 Object.assign(ships.find(ship=>ship.shipId==='refinery-124'),{result:'lost',canAct:false,blocker:'Lost or destroyed ship.'});
 assert.deepEqual(adapter.stationReactorCapacity(ships),{capacity:15,requiredCapacity:18,meetsThreshold:false,
  eligibleShipIds:['aegis','dione','shepherd','quellon']});
});
test('Station Reactor plan accepts exactly 18 actual capacity after source-reported damage and loss',()=>{
 const ships=stationWorkspaceShips().filter(ship=>ship.shipId!=='refinery-124');
 ships.find(ship=>ship.shipId==='icebreaker').reactorCapacity=3;
 assert.deepEqual(adapter.stationReactorCapacity(ships),{capacity:18,requiredCapacity:18,meetsThreshold:true,
  eligibleShipIds:['aegis','dione','icebreaker','shepherd','quellon']});
});
test('Station Reactor plan rejects duplicate identities and permission-blocked living rows',()=>{
 const duplicate=stationWorkspaceShips();duplicate.push({...duplicate[0]});
 assert.throws(()=>adapter.stationReactorCapacity(duplicate),/duplicate|unique/i);
 const denied=stationWorkspaceShips();Object.assign(denied[1],{canAct:false,blocker:'Current ship authority is unavailable.'});
 assert.throws(()=>adapter.stationReactorCapacity(denied),/canAct|blocked|authority/i);
});
test('Station Reactor plan skips only a source-marked lost row and rejects malformed path capacity',()=>{
 const invalidLost=stationWorkspaceShips();
 Object.assign(invalidLost[2],{result:'lost',canAct:false,blocker:'Unknown blocker.'});
 assert.throws(()=>adapter.stationReactorCapacity(invalidLost),/lost|blocker/i);
 const missingCapacity=stationWorkspaceShips();delete missingCapacity[0].reactorCapacity;
 assert.throws(()=>adapter.stationReactorCapacity(missingCapacity),/capacity/i);
});

function stationDeclareRetryContext(overrides={}) {
 const actor={sessionId:'owned-synthetic',uidHash:'synthetic-gm-hash',generation:1,hydrationRevision:1,
  instanceId:'gm-instance-synthetic',claimedAt:'synthetic-claim',hasAuth:true,sameActor:true,
  connection:'live',freshness:'server',playerRole:'gm',profileRoleId:null,profileSessionId:null,
  gmInstanceOwned:true,phase:'active',cycle:2};
 return {
  wave:10,
  actor,
  session:{phase:'active',currentTurn:2,fullGameDemo:{status:'active',progression:'manual'},
   turnPhase:{turn:2,teamPhaseEndsAt:'source-deadline-team',openAirspaceEndsAt:'source-deadline-open',
    airspace:{state:'lifted',tickerActive:true,pressAccess:false},timerPause:null,progression:'manual'},
   turnState:{currentTurn:2,maxTurn:8,phase:'coordination',phaseRevision:22,
    startedAt:'source-start',endsAt:'source-end'},gameOutcome:null,survivorOutcome:null,
   debriefMode:{active:false,revision:0},hasDebriefSnapshot:false},
  window:{status:'due',turn:2,revision:20,targetGroupId:'fleet-1',threatSiteCode:'P',threatSourceId:'p-source'},
  preparation:{turn:2,shipIds:['wolf-strikecarrier','wolf-battlestation'],targetMode:'pre-rolled',
   targetAssignments:[],modifiers:[],notes:'',revision:10,compositionKind:'p-station-repeat',targetGroupId:'fleet-1'},
  attack:{type:'wolf-attack-state',attackId:'previous-resolved-attack',turn:2,attackNumber:9,revision:10,
   preparationRevision:9,status:'resolved',currentStep:'resolved',airspaceLocked:false,
   targetGroupId:'fleet-1',threatSiteCode:'P',threatSourceId:'p-source',pStationRepeat:{status:'repeat'}},
  ...overrides,
 };
}

function stationDeclare429Error({observation={}, attach=true}={}) {
 const error=new Error('declareWolfAttack: actual UI request rejected.');
 const held={operation:'captureLifecycleUiAction',endpoint:'declareWolfAttack',httpStatus:429,
  requestData:{sessionId:'owned-synthetic',instanceId:'gm-instance-synthetic',requestId:'denied-request',expectedRevision:10},
  before:{...stationDeclareRetryContext().actor},current:{...stationDeclareRetryContext().actor},
  body:{error:{status:'RESOURCE_EXHAUSTED',message:'Too many requests for this session. Please try again shortly.',
   details:{commandError:'rate-limited',retryAfterSeconds:26}}},...observation};
 if(attach)rememberProofFailure(error,held);
 return {error,held};
}

test('rate-limited Station declaration waits once, then requires the identical normal-GM source and lease tuple',async()=>{
 let now=1000,reads=0,actorChecks=0,waited=0;const used=new Set(),expected=stationDeclareRetryContext();
 const {error,held}=stationDeclare429Error();
 const recovery=await adapter.recoverStationRateLimitedDeclaration(error,{expectedContext:expected,
  readCurrent:async()=>{reads++;return structuredClone(expected);},assertActor:async()=>{actorChecks++;},
  deadlineAt:100_000,now:()=>now,wait:async(ms,deadlineAt)=>{waited=ms;assert.equal(deadlineAt,100_000);now+=ms;},used});
 assert.equal(heldProofFailureObservations(error).length,1);
 assert.equal(recovery.retryAfterMs,26_000);assert.equal(recovery.deadlineAt,100_000);
 assert.equal(recovery.deniedRequestId,'denied-request');assert.equal(recovery.expectedRevision,10);
 assert.equal(waited,26_000);assert.equal(now,27_000);assert.equal(reads,1);assert.ok(actorChecks>=2);
 const capture={endpoint:'declareWolfAttack',httpStatus:200,
  data:{sessionId:'owned-synthetic',instanceId:'gm-instance-synthetic',requestId:'fresh-request',expectedRevision:10},
  before:{...expected.actor},result:{status:'committed',type:'wolf-attack-declaration',sessionId:'owned-synthetic',
   requestId:'fresh-request',turn:2,revision:11,currentStep:'targeting',airspaceLocked:true,
   deadlineAt:'2026-10-08T19:00:00.000Z',parkedCraftCount:2,announcementId:'announcement-1'}};
 assert.throws(()=>adapter.assertRecoveredStationDeclaration({...capture,data:{...capture.data,
  requestId:'denied-request'}},{...recovery,committed:false}),/fresh|different|request/i);
 assert.throws(()=>adapter.assertRecoveredStationDeclaration({...capture,data:{...capture.data,
  expectedRevision:11}},{...recovery,committed:false}),error=>error?.actual===11&&error?.expected===10);
 assert.equal(adapter.assertRecoveredStationDeclaration(capture,recovery),true);
});

test('Station declaration recovery refuses unsupported errors, bodies, and retry hints without reading or waiting',async()=>{
 const expected=stationDeclareRetryContext();
 const variants=[
  stationDeclare429Error({attach:false}).error,
  stationDeclare429Error({observation:{endpoint:'advanceWolfAttackLifecycle'}}).error,
  stationDeclare429Error({observation:{httpStatus:500}}).error,
  stationDeclare429Error({observation:{requestData:{...stationDeclare429Error().held.requestData,expectedRevision:9}}}).error,
  stationDeclare429Error({observation:{before:{...stationDeclareRetryContext().actor,claimedAt:'foreign-claim'}}}).error,
  stationDeclare429Error({observation:{body:{error:{status:'UNAVAILABLE',details:{commandError:'rate-limited',retryAfterSeconds:26}}}}}).error,
  ...[0,-1,1.5,61,'26'].map(retryAfterSeconds=>stationDeclare429Error({observation:{body:{error:{status:'RESOURCE_EXHAUSTED',
   details:{commandError:'rate-limited',retryAfterSeconds}}}}}).error),
 ];
 for(const error of variants){let reads=0,waits=0;
  await assert.rejects(adapter.recoverStationRateLimitedDeclaration(error,{expectedContext:expected,
   readCurrent:async()=>{reads++;return structuredClone(expected);},assertActor:async()=>{},
   deadlineAt:100_000,now:()=>1000,wait:async()=>{waits++;}}),value=>value===error);
  assert.equal(reads,0);assert.equal(waits,0);
 }
});

test('Station declaration recovery fails closed on changed authority, phase, preparation, window, attack, or expired deadline',async()=>{
 const expected=stationDeclareRetryContext();const patches=[
  {actor:{...expected.actor,sessionId:'foreign'}},{actor:{...expected.actor,uidHash:'foreign'}},
  {actor:{...expected.actor,instanceId:'replacement'}},{actor:{...expected.actor,claimedAt:'new-lease'}},
  {actor:{...expected.actor,generation:2}},{actor:{...expected.actor,hydrationRevision:2}},
  {session:{...expected.session,turnState:{...expected.session.turnState,phase:'team'}}},
  {session:{...expected.session,turnPhase:{...expected.session.turnPhase,airspace:{...expected.session.turnPhase.airspace,state:'restricted'}}}},
  {session:{...expected.session,turnPhase:{...expected.session.turnPhase,timerPause:{reason:'pause'}}}},
  {session:{...expected.session,gameOutcome:{result:'ended'}}},
  {preparation:{...expected.preparation,revision:11}},{window:{...expected.window,revision:21}},
  {window:{...expected.window,threatSiteCode:'N'}},{attack:{...expected.attack,attackId:'new-attack'}},
  {attack:{...expected.attack,status:'declared'}},{attack:{...expected.attack,currentStep:'boarding'}},
  {attack:{...expected.attack,airspaceLocked:true}},
 ];
 for(const patch of patches){const {error}=stationDeclare429Error();let waits=0;
  await assert.rejects(adapter.recoverStationRateLimitedDeclaration(error,{expectedContext:expected,
   readCurrent:async()=>({...structuredClone(expected),...structuredClone(patch)}),assertActor:async()=>{},
   deadlineAt:100_000,now:()=>1000,wait:async ms=>{waits++;assert.equal(ms,26_000);}}),value=>value===error);
  assert.equal(waits,1);
 }
 const {error}=stationDeclare429Error();let readCount=0,waitCount=0;
 await assert.rejects(adapter.recoverStationRateLimitedDeclaration(error,{expectedContext:expected,
  readCurrent:async()=>{readCount++;return structuredClone(expected);},assertActor:async()=>{},
  deadlineAt:20_000,now:()=>1000,wait:async()=>{waitCount++;}}),value=>value===error);
 assert.equal(readCount,0);assert.equal(waitCount,0);
});

test('Station declaration recovery permits a genuinely absent previous attack only on wave one and only once per declaration',async()=>{
 let now=1000;const expected=stationDeclareRetryContext({wave:1,attack:null});const used=new Set();
 const {error}=stationDeclare429Error({observation:{requestData:{sessionId:'owned-synthetic',
  instanceId:'gm-instance-synthetic',requestId:'first-wave-denial',expectedRevision:10}}});
 const options={expectedContext:expected,readCurrent:async()=>structuredClone(expected),assertActor:async()=>{},
  deadlineAt:100_000,now:()=>now,wait:async ms=>{now+=ms;},used};
 assert.equal((await adapter.recoverStationRateLimitedDeclaration(error,options)).deniedRequestId,'first-wave-denial');
 await assert.rejects(adapter.recoverStationRateLimitedDeclaration(error,options),value=>value===error);
 const secondWave=stationDeclareRetryContext({attack:null});const {error:secondError}=stationDeclare429Error();
 await assert.rejects(adapter.recoverStationRateLimitedDeclaration(secondError,{...options,expectedContext:secondWave,used:new Set()}),value=>value===secondError);
});

test('actual GM attack finalization is retained before an unavailable Wing action fence',async()=>{
 const current={attackId:'same',turn:2,revision:3,threatSiteCode:'P',status:'resolved',currentStep:'resolved',pStationRepeat:{status:'stopped'}},states=[];
 const final=await adapter.runSparseStationCombat({deadlineAt:Date.now()+1000,readAttack:async()=>current,onState:async value=>states.push(value),assertActors:async()=>{throw Error('Wing host was destroyed; no future Wing action')},choose:async()=>{throw Error('must not choose')}});
 assert.equal(final,current);assert.deepEqual(states,[current]);
});
