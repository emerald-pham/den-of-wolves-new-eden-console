import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(new URL('../..',import.meta.url).pathname),req=createRequire(root+'/package.json'),ts=req('typescript');
const index=await readFile(root+'/functions/src/index.ts','utf8'),service=await readFile(root+'/src/lib/sessionService.ts','utf8');
const nodeFor=(source,name)=>{const ast=ts.createSourceFile(name+'.ts',source,ts.ScriptTarget.Latest,true);
 const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n);return n.getText(ast);};
const compile=(source,ports,tail)=>new Function(...Object.keys(ports),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText.replace(/^export /gm,'')+';'+tail)(...Object.values(ports));
const alpha='fighter-wing-alpha',bravo='fighter-wing-bravo',uid='wing-inert',sessionId='session-inert',attackId='attack-inert';
const rawClock=req(root+'/functions/lib/turnZero.js').startTurnPhase(1,1900000000000,{progression:'manual'});
const clock={...rawClock,airspace:{...rawClock.airspace,state:'restricted',tickerActive:true}};
const combatModule=req(root+'/functions/lib/fighterWingCombat.js');
const combat=combatModule.launchAegisFighterWing(combatModule.initialAegisFighterWingAttack({attackId,cycle:1,counts:{[alpha]:4,[bravo]:4}}),
 {attackId,cycle:1,wingId:alpha,expectedRevision:0,bayCharged:true,bayDamaged:false});
const snapshot=data=>({get:key=>data[key]});
const session={currentTurn:1,turnPhase:clock,shipDamage:{aegis:{destroyed:false,damagedSystemIds:[]}},
 maintenanceCycles:{aegis:{turn:1,step:6,revision:6,charges:['fighter-bay-alpha','fighter-bay-bravo'],refuelled:[]}}};
const actualView=compile(nodeFor(index,'wolfFighterLaunchChoiceMap')+'\n'+nodeFor(index,'aegisFighterWingLaunchView'),{
 isRecord:x=>!!x&&typeof x==='object'&&!Array.isArray(x),isCanonicalRequestId:req(root+'/functions/lib/requestGuards.js').isCanonicalRequestId,
 WOLF_FIGHTER_LAUNCH_SOURCE_IDS:[alpha,bravo,'pdf-escort-fighter-wing','maliades'],commandError:(_code,message)=>new Error(message),
 sessionTurn:x=>x,aegisFighterWingCombatStateForAttack:()=>combat,turnPhaseState:x=>x,
 parseMaintenanceCycle:req(root+'/functions/lib/maintenance.js').parseMaintenanceCycle,
 SHIP_DAMAGE_DECKS:{aegis:[{systemId:'fighter-bay-alpha'},{systemId:'fighter-bay-bravo'}]},},'return aegisFighterWingLaunchView;');
function producer(step='targeting'){
 const state={type:'wolf-attack-state',status:'declared',turn:1,attackId,revision:step==='targeting'?4:step==='long-range'?5:6,currentStep:step,
  deadlineAt:clock.openAirspaceEndsAt,airspaceLocked:true,fighterLaunchChoices:{
   [alpha]:{sourceId:alpha,status:'launched',turn:1,attackId,revision:3,actorUid:uid,actorRoleId:'wing-commander',requestId:'alpha-inert'},
   [bravo]:{sourceId:bravo,status:'passed',turn:1,attackId,revision:4,actorUid:uid,actorRoleId:'wing-commander',requestId:'bravo-inert'}}};
 return {state,member:req(root+'/functions/lib/wolfAttackAudience.js').projectWolfAttackMemberView({sessionId,state,serverTime:'2030-03-17T17:46:40.000Z'}),
  views:Object.fromEntries([alpha,bravo].map(id=>[id,actualView(sessionId,snapshot(session),snapshot(state),id)]))};
}
function client(raw){
 const calls=[],store={session:{id:sessionId,currentTurn:1,phase:'active',turnPhase:clock},me:{uid,sessionId,role:'player',connected:true,
  assignedRoleId:'wing-commander',activeConsoleRoleId:'wing-commander',seatId:'wing-commander',connectionGeneration:1},
  connection:'live',sessionSnapshotFreshness:'server',identityHydrationRevision:1,setCommunicationError:()=>{}};
 const functions=['aegisFighterWingLaunchViewReply','aegisFighterWingLaunchResultReply','getAegisFighterWingLaunch','launchAegisFighterWing'];
 const api=compile(functions.map(name=>nodeFor(service,name)).join('\n'),{useSessionStore:{getState:()=>store},functions:()=>({}),
  requireFreshSessionAuthority:()=>assert.equal(store.connection,'live'),sessionAuthorityCheckpoint:()=>({}),sessionAuthorityUid:()=>uid,
  ensureSignedIn:async()=>{},authorityCheckpointIsCurrent:()=>true,interception:e=>e.message,commandId:()=> 'launch-inert',
  httpsCallable:(_fn,endpoint)=>async payload=>{calls.push({endpoint,payload});return {data:endpoint==='getAegisFighterWingLaunch'?raw.views[payload.wingId]:raw.receipt};}},
  'return {get:getAegisFighterWingLaunch,launch:launchAegisFighterWing};');return {...api,calls,store};
}
const operatorPath=process.env.P181_BRAVO_OPERATOR_PATH;assert.ok(operatorPath,'Bind the reviewed source-only operator explicitly.');
const operator=await import(pathToFileURL(resolve(operatorPath)).href);
async function wingReader(raw){
 const c=client(raw);const importer=async path=>path==='/src/lib/firebase.ts'?{auth:()=>({currentUser:{uid}})}:
  path==='/src/lib/firestore.ts'?{db:()=>({})}:path==='store-inert'?{useSessionStore:{getState:()=>c.store}}:
  path==='/served/firebase_firestore.js'?{doc:(_db,path)=>path,getDocFromServer:async()=>({metadata:{fromCache:false},exists:()=>true,data:()=>raw.member})}:
  path==='/src/lib/sessionService.ts'?{getAegisFighterWingLaunch:c.get}:assert.fail('Unexpected fixture module '+path);
 const surface={storeModuleUrl:()=> 'store-inert',page:{evaluate:async(fn,args)=>new Function('importer','fetch','performance',
  'return ('+fn.toString().replace(/\bimport\(/g,'importer(')+');')(importer,async()=>({text:async()=> 'import {doc} from "/served/firebase_firestore.js";'}),{timeOrigin:1000})(args)}};
 return {value:await operator.readManualAlphaObservation(surface,{uid,sessionId}),calls:c.calls};
}
test('actual targeting producer passes actual current client getter and Wing reader control',async()=>{
 const raw=producer(),{value,calls}=await wingReader(raw);assert.deepEqual(value.views,raw.views);assert.equal(calls.length,2);
});
for(const step of ['long-range','medium-range'])test('actual '+step+' producer remains readable through actual client getter and Wing reader',async()=>{
 const raw=producer(step);assert.equal(raw.views[alpha].launched,true);assert.equal(raw.views[alpha].choiceStatus,'launched');assert.equal(raw.views[alpha].reason,'waiting');
 const {value}=await wingReader(raw);assert.deepEqual(value.views,raw.views);assert.equal(value.member.currentStep,step);assert.equal(value.views[bravo].launched,false);
});
test('read compatibility retains malformed, eligible contradiction, integer, source and current-role denials',async()=>{
 for(const mutate of [v=>v.reason='passed',v=>delete v.choiceStatus,v=>v.choiceStatus='passed',v=>v.eligible=true,
  v=>v.wingRevision=-1,v=>v.fighters=1.5,v=>v.wingId=bravo,v=>v.sessionId='foreign']){
  const raw=producer('medium-range');mutate(raw.views[alpha]);await assert.rejects(client(raw).get(alpha),/invalid AEGIS Fighter Wing launch view/);
 }
 const raw=producer();const c=client(raw);c.store.me.activeConsoleRoleId='admiral';await assert.rejects(c.get(alpha),/Only the active/);assert.equal(c.calls.length,0);
});
test('directly coupled original launch receipt remains already-launched; waiting read projection cannot become a mutation receipt',async()=>{
 const raw=producer(),receipt={...raw.views[alpha],status:'committed',requestId:'launch-inert',revision:4};
 const original=client({...raw,receipt});assert.equal((await original.launch(alpha,1,3,0)).reason,'already-launched');
 for(const status of ['committed','replayed']){
  const waiting=producer('medium-range').views[alpha];const c=client({...raw,receipt:{...waiting,status,requestId:'launch-inert',revision:4}});
  await assert.rejects(c.launch(alpha,1,3,0),/invalid AEGIS Fighter Wing launch receipt/);
 }
});
