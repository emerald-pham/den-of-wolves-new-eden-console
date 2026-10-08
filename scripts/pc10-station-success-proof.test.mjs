import {createRequire} from 'node:module';import test from 'node:test';import assert from 'node:assert/strict';import * as runner from './pc10-fresh-minimum-ring-proof.mjs';
test('Station plan covers every preset15 printed craft owners and real EO with eight normal actors and bounded genuine combat',()=>{const p=runner.minimumStationPlan();assert.equal(p.actualAuthenticatedActors,8);assert.equal(p.configuredRoles,15);assert.equal(p.browserProcesses,1);assert.equal(p.browserContexts,8);assert.equal(p.hardCapMs,1200000);assert.equal(p.forcedOutcome,false);});
test('Station workflow establishes real paid arrival and combat before existing activation callback',async()=>{const trace=[];const names=['setup','stationArrivalMaintenance','stationDeferCombat','advance','stationCombatMaintenance','stationArrival','stationCombat','stationActivate','stationEnding'];await runner.runStationWorkflow(Object.fromEntries(names.map(name=>[name,async()=>trace.push(name)])));assert.deepEqual(trace,names);});
test('failed actual Station combat precludes activation and close',async()=>{let activated=false;await assert.rejects(runner.runStationWorkflow({setup:async()=>{},stationArrivalMaintenance:async()=>{},stationArrival:async()=>{},stationDeferCombat:async()=>{},advance:async()=>{},stationCombatMaintenance:async()=>{},stationCombat:async()=>{throw Error('surviving Wolves')},stationActivate:async()=>{activated=true}}));assert.equal(activated,false);});
test('Station GM coordinate read binds live owned chart B and unique P without raw-root guessing',async()=>{const surface={storeModuleUrl:()=>'/normal-store',page:{evaluate:async(fn,url)=>{assert.equal(url,'/normal-store');return {chartId:'B',locked:true,candidates:[{coordinate:'1234',code:'P'}]}}}};assert.equal(await runner.readStationCoordinate(surface),'1234');});

test('fighter reactor charges use physical bay console IDs, not fighter source IDs',()=>{assert.deepEqual(runner.stationCombatConsoles(),['jump-drive','fighter-bay-alpha','fighter-bay-bravo','missile-launchers','point-defence-lasers']);});
test('Station liberation consumes actual private serverState marker, never a nonexistent root field',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(new URL('../functions/package.json',import.meta.url));const {organiserSitesForChart}=require('../functions/lib/starChartLookup.js');const coordinate=Object.entries(organiserSitesForChart('B')).find(([,site])=>site.code==='P')[0];
 const marker={type:'candidate-station-liberation',sessionId:'sid',groupId:'fleet-1',coordinate,chart:'B',sequenceId:'wolf-p-station-real',sourceId:'wolf-attack-real',cycle:2,liberatedAt:'2026-10-08T12:00:00.000Z'};let read;
 const result=await runner.readStationLiberation(async path=>{read=path;return {[`fleet-1:${coordinate}`]:marker}}, {currentTurn:2},{sessionId:'sid',groupId:'fleet-1',coordinate,sourceId:'wolf-attack-real',cycle:2});assert.equal(read,'serverState/candidateStationLiberations');assert.deepEqual(result,marker);
});

test('each actual Station paid arrival obtains its own normal scoped grant first',async()=>{const trace=[];await runner.runStationPaidArrivals(['aegis','dione'],{grant:async id=>trace.push(`grant:${id}`),jump:async id=>trace.push(`jump:${id}`)});assert.deepEqual(trace,['grant:aegis','jump:aegis','grant:dione','jump:dione']);});
test('Wing is requalified only after the genuine next cycle with original identity/berth preserved',()=>{const old={hasAuth:true,sameActor:true,uidHash:'wing',sessionId:'sid',playerRole:'player',assignedRoleId:'wing-commander',activeConsoleRoleId:'wing-commander',seatId:'wing-commander',currentCanonicalSeatOwned:true,currentMemberBerthPresent:true,currentMemberBerthMatches:true,connection:'live',freshness:'server',fleetGroupId:'fleet-1',cycle:1};const current={...old,cycle:2};assert.deepEqual(runner.beginStationCombatWing(old,current),current);assert.throws(()=>runner.beginStationCombatWing(old,{...current,uidHash:'foreign'}));});
test('boarding uses the actual exported server and normal client endpoint',()=>{assert.equal(runner.stationBoardingReadEndpoint,'getWolfBoardingDefenceChoice');});
test('Station navigation validates the real server DocumentSnapshot',()=>{runner.assertStationNavigation({get:key=>{assert.equal(key,'shipGalacticCoordinates');return {aegis:'1234'}},data:()=>({shipGalacticCoordinates:{aegis:'1234'}})},['aegis'],'1234');});
test('activation context preserves the original numeric browser SDK timeout within its deadline',async()=>{let received;const context=runner.stationActivationContext({gm:{callable:async(name,data,timeout)=>{received=timeout;return {status:'committed'}}},sessionId:'sid',recordRoot:async()=>({currentTurn:2}),deadlineAt:Date.now()+1000});await context.gm.callable('readCandidateWorkspace',{}, {timeoutMs:1000,deadlineAt:Date.now()+1000});assert.equal(typeof received,'number');assert.ok(received>0&&received<=1000);});
test('activation root adds the exact owned session identity only to its read envelope',async()=>{const raw={currentTurn:2};const context=runner.stationActivationContext({gm:{},sessionId:'sid',recordRoot:async()=>raw});assert.deepEqual(await context.readRoot(),{currentTurn:2,sessionId:'sid'});assert.equal(Object.hasOwn(raw,'sessionId'),false);});

test("failed Cycle1 deferral cannot advance into an unavailable Cycle2 window",async()=>{let advanced=false;await assert.rejects(runner.runStationWorkflow({setup:async()=>{},stationArrivalMaintenance:async()=>{},stationArrival:async()=>{},stationDeferCombat:async()=>{throw Error("deferral denied")},advance:async()=>{advanced=true}}),/deferral denied/);assert.equal(advanced,false);});

test("P paid arrivals are established in the same Cycle2 as source selection",async()=>{let cycle=1,arrivalCycle;const op=Object.fromEntries(["setup","stationArrivalMaintenance","stationDeferCombat","stationCombatMaintenance","stationActivate","stationEnding"].map(n=>[n,async()=>{}]));await runner.runStationWorkflow({...op,advance:async next=>{cycle=next},stationArrival:async()=>{arrivalCycle=cycle},stationCombat:async()=>{assert.equal(arrivalCycle,cycle,"P arrival cycle must equal combat cycle")}});});

test('combat diagnostics retain guard authority while excluding player private data',()=>{
 const root={currentTurn:2,phase:'active',activeRoleIds:['wing-commander'],activeVesselIds:['aegis'],shipDamage:{},maintenanceCycles:{},shuttleControl:{},shuttleDockings:[],shuttleFuelled:{},maliadesState:{},shipResources:{},shipUpgrades:{},fighterWingCounts:{},email:'private',joinCode:'private'};
 const context=runner.stationCombatServerContext({sessionId:'sid',root,pdfWing:{attackId:'attack'},publicAudience:{revision:3},fleetGroups:[{id:'fleet-1',vesselIds:['aegis'],memberUids:['owned'],memberShipIds:{owned:'aegis'}}],players:[{seatId:'wing-commander',kickedAt:null,escapeState:null,uid:'owned',role:'player',assignedRoleId:'wing-commander',fleetGroupId:'fleet-1',email:'private',privateBrief:'private'}]});
 for(const key of ['activeRoleIds','activeVesselIds','shipDamage','maintenanceCycles','shuttleControl','shuttleDockings','shuttleFuelled','maliadesState','shipResources','shipUpgrades','fighterWingCounts'])assert.deepEqual(context[key],root[key]);
 assert.deepEqual(context.pdfEscortWing,{attackId:'attack'});assert.equal(context.players[0].assignedRoleId,'wing-commander');assert.equal(context.players[0].uid,'owned');assert.equal(context.players[0].seatId,'wing-commander');assert.equal(context.players[0].kickedAt,null);assert.equal(context.players[0].escapeState,null);assert.deepEqual(context.fleetGroups[0].memberShipIds,{owned:'aegis'});assert.equal(context.email,undefined);assert.equal(context.joinCode,undefined);assert.equal(context.players[0].email,undefined);assert.equal(context.players[0].privateBrief,undefined);
});

test('preset15 custody preflight rejects omitted core or Press printed owners, disabled Press, absent actual custody and optional Union craft',()=>{
 const req=createRequire(new URL('../functions/package.json',import.meta.url));
 const {recommendedRoleIds}=req('../functions/lib/roleConfiguration.js'),{roleOwnedCraftForRoles}=req('../functions/lib/craftOwnership.js'),{initialShuttleDockingsForRoles}=req('../functions/lib/shuttlecraft.js'),{initialShuttleControl}=req('../functions/lib/shuttleControl.js');
 const activeRoleIds=recommendedRoleIds(15),uids={GM1:'gm',...Object.fromEntries([...new Set([...Object.keys(runner.stationRoleIds),'Executive'])].map(label=>[label,label]))};
 const players=Object.entries({...runner.stationRoleIds,Executive:'executive-officer'}).map(([label,assignedRoleId])=>({uid:uids[label],role:'player',assignedRoleId:assignedRoleId==='press-officer'?null:assignedRoleId,activeConsoleRoleId:assignedRoleId}));
 const dockings=initialShuttleDockingsForRoles(activeRoleIds);
 const root={activeRoleIds,pressEnabled:true,capybaraEnabled:false,shuttleDockings:dockings,shuttleControl:initialShuttleControl(roleOwnedCraftForRoles(activeRoleIds),players.map(player=>({uid:player.uid,roleId:player.assignedRoleId??player.activeConsoleRoleId})))};
 assert.equal(runner.assertStationOwnerCustody(root,players,uids).custodyValidated,true);
 assert.throws(()=>runner.assertStationOwnerCustody({...root,pressEnabled:false},players,uids));
 assert.throws(()=>runner.assertStationOwnerCustody(root,players.filter(player=>player.uid!=='Press'),uids));
 assert.throws(()=>runner.assertStationOwnerCustody(root,players.filter(player=>player.uid!=='Miner'),uids));
 assert.throws(()=>runner.assertStationOwnerCustody(root,players.filter(player=>player.uid!=='Executive'),uids));
 assert.throws(()=>runner.assertStationOwnerCustody(root,players.map(player=>player.uid==='Executive'?{...player,activeConsoleRoleId:'wing-commander'}:player),uids));
 assert.throws(()=>runner.assertStationOwnerCustody(root,players,{...uids,Executive:uids.GM1}));
 assert.throws(()=>runner.assertStationOwnerCustody({...root,shuttleControl:{}},players,uids));
 assert.throws(()=>runner.assertStationOwnerCustody({...root,shuttleDockings:[...dockings,{shuttleId:'wobbly',shipId:'quellon'}]},players,uids));
});

test('Station runtime includes a separate ordinary Press holder without claiming a core seat',()=>{assert.equal(runner.stationRoleIds.Press,'press-officer');});

test('active ordinary Press requires its actual craft scope and explicit null ship berth',()=>{
 const value={activeConsoleRoleId:'press-officer',assignedRoleId:null,seatId:null,pressEnabled:true,pressCraftScopeMatches:true,phase:'active',currentMemberBerthPresent:true,currentMemberBerthNull:true,memberVesselCount:0,memberCraftCount:1};
 assert.equal(runner.stationReady(value,'press-officer'),true);
 for(const patch of [{currentMemberBerthPresent:false},{currentMemberBerthNull:false},{memberVesselCount:1},{memberCraftCount:0}])assert.equal(runner.stationReady({...value,...patch},'press-officer'),false);
});

test('Station chooses additional current crew only after Wing makes no action',async()=>{
 const current={currentStep:'targeting'},trace=[],deadlineAt=Date.now()+1000;
 const result=await runner.chooseStationCombatActor(current,{deadlineAt,chooseWing:async()=>{trace.push('Wing');},chooseCrew:async(_,options)=>{assert.equal(options.deadlineAt,deadlineAt);trace.push('PDF');return {committed:true};}});
 assert.deepEqual(trace,['Wing','PDF']);assert.deepEqual(result,{committed:true});
});
test('pending rejected Wing launch recovery cannot be replaced by another actor choice',async()=>{
 let crewCalled=false;await runner.chooseStationCombatActor({currentStep:'targeting'},{deadlineAt:Date.now()+1000,pendingWingRecovery:true,chooseWing:async()=>undefined,chooseCrew:async()=>{crewCalled=true}});assert.equal(crewCalled,false);
});

test('committed Wing action cannot dispatch another actor against the old revision',async()=>{let crewCalled=false;const result=await runner.chooseStationCombatActor({currentStep:'medium-range'},{deadlineAt:Date.now()+1000,chooseWing:async()=>({committed:true}),chooseCrew:async()=>{crewCalled=true}});assert.deepEqual(result,{committed:true});assert.equal(crewCalled,false);});

// Synthetic owned observation only; no native survival or relocation credit.
test('escaped owner of an actually destroyed host retains custody but receives no future combat choice',()=>{
 const actor={uid:'pdf',roleId:'refinery-124-pdf-colonel',original:{uidHash:'pdf-hash',sessionId:'sid',fleetGroupId:'fleet-1',connectionGeneration:4,documentTimeOrigin:10000,identityHydrationRevision:2}};
 const escapeState={status:'pending',shipId:'refinery-124',destructionEventId:'attack-original',revision:1};
 const root={shipDamage:{'refinery-124':{destroyed:true}}},player={uid:'pdf',sessionId:'sid',role:'player',assignedRoleId:actor.roleId,activeConsoleRoleId:null,seatId:actor.roleId,fleetGroupId:'fleet-1',connectionGeneration:4,connected:true,escapeState};
 const member={hasAuth:true,sameActor:true,uidHash:'pdf-hash',sessionId:'sid',meSessionId:'sid',profileRoleId:null,profileSessionId:null,playerRole:'player',assignedRoleId:actor.roleId,activeConsoleRoleId:null,seatId:actor.roleId,fleetGroupId:'fleet-1',connectionGeneration:4,documentTimeOrigin:10000,identityHydrationRevision:2,connection:'live',freshness:'server',escapeLocked:true,escapeState,browserProjectionConsistent:true,kicked:false,replacementRoleId:null,replacementStatus:null,invalidFields:[]};
 assert.equal(runner.stationInactiveOwner(actor,root,player,member),true);
 for(const patch of [{uid:'foreign'},{escapeState:null},{escapeState:{...player.escapeState,shipId:'icebreaker'}},{activeConsoleRoleId:actor.roleId}])assert.throws(()=>runner.stationInactiveOwner(actor,root,{...player,...patch},member));
 assert.throws(()=>runner.stationInactiveOwner(actor,root,player,{...member,freshness:'cache'}));
 for(const patch of [{escapeState:{...escapeState,destructionEventId:'other-event'}},{escapeState:{...escapeState,revision:2}},{escapeState:{...escapeState,status:'fled'}},{connectionGeneration:5},{documentTimeOrigin:10001},{browserProjectionConsistent:false}])assert.throws(()=>runner.stationInactiveOwner(actor,root,player,{...member,...patch}));
 assert.throws(()=>runner.stationInactiveOwner(actor,root,{...player,escapeState:{...escapeState,fleeRequestId:'flee-1'}},member));
 assert.throws(()=>runner.stationInactiveOwner(actor,root,{...player,escapeState:{...escapeState,status:'fled',fleeRequestId:'flee-1'}},{...member,escapeState:{...escapeState,status:'fled',fleeRequestId:'flee-1'}}));
});


test('Station actual Wing-first consumer forwards cancellation evidence under the original crew deadline', async () => {
  const deadlineAt = Date.now() + 1000, transitions = [], observation = { actionCredit: false };
  const onSourceProgress = async value => transitions.push(value);
  const result = await runner.chooseStationCombatActor({ currentStep: 'boarding' }, {
    deadlineAt, onSourceProgress, chooseWing: async () => undefined,
    chooseCrew: async (_current, options) => {
      assert.equal(options.deadlineAt, deadlineAt);
      assert.equal(options.onSourceProgress, onSourceProgress);
      await options.onSourceProgress(observation);
    },
  });
  assert.equal(result, undefined);
  assert.deepEqual(transitions, [observation]);
});

// Executes the existing nested maintenance consumer; source-shaped, not native.
test('actual Station maintenance charges legal EO weapons and PDF bay through normal maintenance',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('./pc10-fresh-minimum-ring-proof.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async stationCombatMaintenance(){'),end=source.indexOf('async stationCombat(){',start);
 assert.ok(start>0&&end>start);const trace=[];
 const invoke=new Function('dependencies',`const {mark,ships,maintain,stationCombatConsoles,coordination}=dependencies;return ({${source.slice(start,end)}}).stationCombatMaintenance;`)({mark:async()=>{},ships:['aegis','refinery-124','icebreaker'],maintain:async(...args)=>trace.push(args),stationCombatConsoles:runner.stationCombatConsoles,coordination:async cycle=>trace.push(['coordination',cycle])});
 await invoke();assert.deepEqual(trace,[['aegis',['jump-drive','fighter-bay-alpha','fighter-bay-bravo','missile-launchers','point-defence-lasers']],['refinery-124',['jump-drive','fighter-bay']],['icebreaker',['jump-drive']],['coordination',2]]);
});
test('Station normal cohort includes distinct actual Executive Officer without changing Press custody',()=>{assert.equal(runner.stationRoleIds.Executive,'executive-officer');assert.equal(runner.stationRoleIds.Press,'press-officer');});
