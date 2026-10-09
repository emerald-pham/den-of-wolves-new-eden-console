import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {assertOriginalActor} from './pc10-member-gm-lifecycle-contracts.mjs';
import {captureLifecycleUiAction,recoverLifecycleUiAction,publicLifecycleReceipt} from './pc10-member-gm-lifecycle-ui-proof.mjs';
const observerSource=await readFile(new URL('./pc10-member-gm-lifecycle-ui-proof.mjs',import.meta.url),'utf8');
const presentationSource=await readFile(new URL('./pc10-turn-cycle-demo-ui-proof.mjs',import.meta.url),'utf8');
const sdkSource=await readFile(new URL('../src/lib/sessionService.ts',import.meta.url),'utf8');
const serverSource=await readFile(new URL('../functions/src/index.ts',import.meta.url),'utf8');
const observerCode=observerSource.slice(observerSource.indexOf('export async function observeLifecycleActor('),observerSource.indexOf('\nexport async function untilLifecycle('));
const presentationCode=presentationSource.slice(presentationSource.indexOf('async function offered('),presentationSource.indexOf('/** Additive hooks'));
const sdkAst=ts.createSourceFile('sessionService.ts',sdkSource,ts.ScriptTarget.Latest,true);
const connectCode=['connect','connectWithRetryPolicy'].map(name=>sdkAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(sdkAst)).join('\n');
const serverAst=ts.createSourceFile('index.ts',serverSource,ts.ScriptTarget.Latest,true);
let startNode;function findStart(n){if(ts.isVariableDeclaration(n)&&n.name.getText(serverAst)==='startGame')startNode=n;ts.forEachChild(n,findStart);}findStart(serverAst);
const replies=[];function findReply(n){if(ts.isVariableDeclaration(n)&&n.name.getText(serverAst)==='result'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer)&&n.initializer.properties.some(p=>p.name?.getText(serverAst)==='setupReceipt'))replies.push(n.initializer);ts.forEachChild(n,findReply);}findReply(startNode);
assert.equal(replies.length,1,'Use the actual committed startGame result expression.');
const startReplyCode=ts.transpileModule('globalThis.reply = '+replies[0].getText(serverAst),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
// Execute the actual manual clock and announcement producers; controlled transaction ports remain source-only.
const turnSource=await readFile(new URL('../functions/src/turnZero.ts',import.meta.url),'utf8');
const turnAst=ts.createSourceFile('turnZero.ts',turnSource,ts.ScriptTarget.Latest,true);
const turnCode=turnAst.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>/DURATION_MS$/.test(d.name.getText(turnAst)))||ts.isFunctionDeclaration(n)&&['phaseDurationsForTurn','startTurnPhase','pauseActiveTurnPhase'].includes(n.name?.text)).map(n=>n.getText(turnAst)).join('\n');
const holdSource=await readFile(new URL('../functions/src/turnInterstitial.ts',import.meta.url),'utf8');
const holdAst=ts.createSourceFile('turnInterstitial.ts',holdSource,ts.ScriptTarget.Latest,true);
const holdCode=holdAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='holdTurnAdvancePhase').getText(holdAst);
const announcementNodes=[];function findAnnouncement(n){if(ts.isVariableDeclaration(n)&&n.name.getText(serverAst)==='announcement'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer)&&n.initializer.properties.some(p=>p.name?.getText(serverAst)==='survivorPopulation'))announcementNodes.push(n.initializer);ts.forEachChild(n,findAnnouncement);}findAnnouncement(serverAst);
assert.equal(announcementNodes.length,1,'Use actual new-cycle announcement producer.');
const transitionProducer=ts.transpileModule(turnCode+'\n'+holdCode+'\nglobalThis.phase = holdTurnAdvancePhase(startTurnPhase(1, 1000, {progression: "manual"}), 1000);\nglobalThis.announcement = '+announcementNodes[0].getText(serverAst),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,16);
function fixture(){
 const uid='original-setup-member';let profile=null;const profileModules=[];let user={uid},clock=1000,onDigest=null,onObserve=null,onPaint=null,resumeResolve;
 let state={session:{id:'original-session',phase:'casting',currentTurn:0,setupRevision:13,fullGameDemo:{status:'preparing',progression:'manual'}},me:{uid,role:'player',connected:true,connectionGeneration:1,assignedRoleId:'wing-commander',activeConsoleRoleId:'wing-commander',seatId:'wing-commander',fleetGroupId:'fleet-1'},connection:'live',sessionSnapshotFreshness:'server',identityHydrationRevision:1,gmInstance:null,gmRecoveryPending:false,gmAccessAuthenticatedAt:null,pendingCommands:[],gmAwayMissionHandPointers:[],gmLoyaltyCensusStatus:'loading',roleBrief:null};
 let transmission=false,briefing=false,observerCalls=0,clicks=0;
 const events=[];state.setConnection=value=>{state={...state,connection:value};events.push(['connection',value]);};state.setSessionSnapshotFreshness=value=>{state={...state,sessionSnapshotFreshness:value};events.push(['freshness',value]);};state.setGmRecoveryPending=value=>{state={...state,gmRecoveryPending:value};};state.setCommunicationError=()=>{};
 const store={getState:()=>state};
 const sdk={sessionSnapshotAuthorityFor:()=>({hasServerSessionAuthority:state.sdkServer!==false&&state.sessionSnapshotFreshness==='server'}),memberSessionResumeBlocksFreshness:()=>state.resumePending===true};
 const vmContext=vm.createContext({URL,TextEncoder,crypto:{subtle:{digest:async(...args)=>{if(onDigest){const effect=onDigest;onDigest=null;await effect();}return webcrypto.subtle.digest(...args);}}},document:{querySelector:selector=>selector.includes('briefing')?(briefing?{}:null):(transmission?{}:null)},Date:{now:()=>clock,parse:Date.parse},assert,assertOriginalActor,delay:async()=>{clock+=100;},captureLifecycleUiAction,recoverLifecycleUiAction,publicLifecycleReceipt});
 const modules={'/src/lib/firebase.ts':{auth:()=>({currentUser:user})},'/src/lib/demoActorContext.ts':{activeDemoActorProfile:profile},'/src/store/useSessionStore.ts':{useSessionStore:store},'/src/lib/sessionSnapshotAuthority.ts':sdk};
 const surface={storeModuleUrl:()=>'/src/store/useSessionStore.ts',sessionAuthorityModuleUrl:()=>'/src/lib/sessionSnapshotAuthority.ts',page:{evaluate:async(callback,input)=>{observerCalls++;if(onObserve)await onObserve(observerCalls);const script=new vm.Script(`(${callback.toString()})`,{importModuleDynamically:async name=>{const entries=Object.entries(modules[name]);const module=new vm.SyntheticModule(entries.map(([k])=>k),function(){for(const[k,v]of entries)this.setExport(k,v);},{context:vmContext});await module.link(()=>{throw new Error('No extra fixture imports.');});await module.evaluate();if(name==='/src/lib/demoActorContext.ts')profileModules.push(module);return module;}});return script.runInContext(vmContext)(input);},getByRole:()=>({getByRole:()=>({count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,click:async()=>{clicks++;}})})},paintTwoFrames:async()=>{if(onPaint)await onPaint();}};
 const load=async(code)=>{const module=new vm.SourceTextModule(code,{context:vmContext});await module.link(()=>{throw new Error('No extra top-level imports.');});await module.evaluate();return module.namespace;};
 const transitionContext={exports:{},nextTurn:1,announcementPopulation:100,pendingFormalAnnouncements:[],skipTurnStartAnnouncement:false};vm.runInNewContext(transitionProducer,transitionContext);
 const startContext={start:{sessionId:state.session.id,requestId:'real-captured-request',fullGameDemo:true},transition:{currentTurn:1,turnStartAnnouncement:transitionContext.announcement,turnPhase:transitionContext.phase},committedSetupRevision:14,setupReceipt:{}};
 vm.runInNewContext(startReplyCode,startContext);const result=startContext.reply;
 const startCapture={endpoint:'startGame',httpStatus:200,before:{sessionId:result.sessionId,uidHash:hash('original-gm'),hasAuth:true,sameActor:true,connection:'live',freshness:'server',privateAudienceMatches:true,foreignPendingCount:0,generation:1,playerRole:'gm',gmInstanceOwned:true,instanceId:'original-gm-instance',claimedAt:'2026-10-09T02:01:00.000Z',phase:'casting',cycle:0,setupRevision:13},data:{sessionId:result.sessionId,instanceId:'original-gm-instance',requestId:result.requestId,expectedSetupRevision:13},result};
 return{surface,state:()=>state,set:delta=>{state={...state,...delta};},user:()=>user,setUser:v=>{user=v;},setProfile:v=>{profile=v;modules['/src/lib/demoActorContext.ts'].activeDemoActorProfile=v;for(const module of profileModules)module.setExport('activeDemoActorProfile',v);},setDigest:f=>{onDigest=f;},setObserve:f=>{onObserve=f;},setPaint:f=>{onPaint=f;},clock:()=>clock,setClock:v=>{clock=v;},events,clicks:()=>clicks,startCapture,
  observe:async()=>{const{observeLifecycleActor}=await load(observerCode);return observeLifecycleActor(surface,state.session.id,{sdkAuthority:true});},
  present:async(expected,extra={})=>{vmContext.observeLifecycleActor=(...args)=>load(observerCode).then(({observeLifecycleActor})=>observeLifecycleActor(...args));const{completeOfferedCyclePresentation}=await load(presentationCode);return completeOfferedCyclePresentation(surface,expected,{clearBriefing:true,deadlineAt:2000,setupStart:startCapture,sdkAuthority:true,...extra});},
  publish:()=>{state={...state,session:{...state.session,phase:'active',currentTurn:result.currentTurn,setupRevision:result.setupRevision,fullGameDemo:result.fullGameDemo,turnPhase:result.turnPhase,turnStartAnnouncement:result.turnStartAnnouncement}};transmission=false;},
  connect:async()=>{const context=vm.createContext({window:{navigator:{onLine:true}},useSessionStore:store,auth:()=>({currentUser:user}),latestConnectAttemptGeneration:0,resumeRateLimitHold:null,ensureSignedIn:async()=>{},resumeSession:async()=>{await new Promise(resolve=>{resumeResolve=resolve;});state.setSessionSnapshotFreshness('server');return true;},clearConnectRateLimitAfterAuthority:()=>{},flushPendingCommands:async()=>true,reconcileGmAuthority:async()=>{},TERMINAL_RESUME_ERRORS:new Set(),errorCode:()=>null,isRateLimitedCommandError:()=>false});const module=new vm.SourceTextModule(ts.transpileModule(connectCode,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context});await module.link(()=>{throw new Error('Connect uses controlled existing ports.');});await module.evaluate();const pending=module.namespace.connect();while(!resumeResolve)await Promise.resolve();return pending;},
  resume:()=>resumeResolve(),hash:()=>hash(uid),};
}
test('actual lifecycle observer rejects original Auth changed inside awaited digest',async()=>{const f=fixture();f.setDigest(()=>f.setUser({uid:'foreign'}));await assert.rejects(f.observe(),/Auth UID changed/i);});
test('actual lifecycle observer samples current store after digest instead of qualifying obsolete live state',async()=>{const f=fixture();f.setDigest(()=>f.set({connection:'connecting',sessionSnapshotFreshness:'cache'}));const current=await f.observe();assert.equal(current.connection,'connecting');assert.equal(current.freshness,'cache');});
test('actual setup connect producer→observer→presentation waits for stable live authority before returning to next action',async()=>{
 const f=fixture(),anchor=await f.observe();f.publish();let connected;
 // Do not await the producer: the presentation consumer must observe its real pending transition.
 const pending=f.connect();await Promise.resolve();await Promise.resolve();
 f.setObserve(async count=>{if(count>=3){f.resume();connected=await pending;}});
 const ready=await f.present(anchor);assert.equal(ready.actualPaintReady,true);assert.equal(f.state().connection,'live');assert.equal(f.state().sessionSnapshotFreshness,'server');assert.equal(f.clicks(),0);assert.equal(f.hash(),anchor.uidHash);assert.deepEqual(f.events.slice(0,2),[['connection','connecting'],['freshness','cache']]);void connected;
});
test('same original receipt publication may remain passive at its exact precommit tuple before committed Cycle1 arrives',async()=>{const f=fixture(),anchor=await f.observe();f.setObserve(count=>{if(count>=3)f.publish();});const ready=await f.present(anchor);assert.equal(ready.actualPaintReady,true);assert.equal(f.state().session.currentTurn,1);});
for(const[name,delta]of[['hydration',{identityHydrationRevision:2}],['SDK revoked',{sdkServer:false}],['resume pending',{resumePending:true}],['recovery pending',{gmRecoveryPending:true}],['replaced station',{me:{uid:'original-setup-member',role:'player',connected:true,connectionGeneration:1,assignedRoleId:'executive-officer',activeConsoleRoleId:'executive-officer',seatId:'executive-officer',fleetGroupId:'fleet-1'}}]]){
 test(`current ${name} after real committed start cannot qualify presentation or next action`,async()=>{const f=fixture(),anchor=await f.observe();f.publish();f.set(delta);f.setObserve(count=>{if(count>4)f.setClock(100000);});await assert.rejects(f.present(anchor));assert.equal(f.clicks(),0);});
}
test('expired original caller deadline after a slow actual observer cannot qualify return',async()=>{const f=fixture(),anchor=await f.observe();f.publish();f.setDigest(()=>f.setClock(2001));await assert.rejects(f.present(anchor),/deadline|budget/i);assert.equal(f.clicks(),0);});
test('fresh actor source recheck after paint rejects hydration mutation with zero subsequent action',async()=>{const f=fixture(),anchor=await f.observe();f.publish();f.setPaint(()=>f.set({identityHydrationRevision:2}));await assert.rejects(f.present(anchor));assert.equal(f.clicks(),0);});
test('unknown committed source phase/cycle is never treated as ordinary readiness latency',async()=>{const f=fixture(),anchor=await f.observe();f.publish();f.set({session:{...f.state().session,currentTurn:2}});await assert.rejects(f.present(anchor));assert.equal(f.clicks(),0);});

for(const [name,mutate] of [
 ['foreign session',f=>f.set({session:{...f.state().session,id:'foreign-session'}})],
 ['changed generation',f=>f.set({me:{...f.state().me,connectionGeneration:2}})],
 ['foreign private audience',f=>f.set({roleBrief:{assignmentUid:'foreign-member'}})],
 ['foreign pending command',f=>f.set({pendingCommands:[{payload:{sessionId:'foreign-session'}}]})],
 ['changed group',f=>f.set({me:{...f.state().me,fleetGroupId:'foreign-fleet'}})],
 ['replacement role',f=>f.set({me:{...f.state().me,replacementRoleId:'executive-officer',replacementStatus:'active'}})],
 ['kicked original member',f=>f.set({me:{...f.state().me,kickedAt:'2026-10-09T02:01:00.000Z'}})],
 ['malformed committed clock',f=>{delete f.startCapture.result.turnPhase.teamPhaseEndsAt;}],
 ['foreign committed session',f=>{f.startCapture.result.sessionId='foreign-session';}],
 ['unknown pending connection',f=>f.set({connection:'offline',sessionSnapshotFreshness:'cache'})],
 ]) test(`${name} cannot become setup readiness`,async()=>{const f=fixture(),anchor=await f.observe();f.publish();mutate(f);await assert.rejects(f.present(anchor));assert.equal(f.clicks(),0);});
test('perpetual real connecting never resets the original caller deadline or reaches a next action',async()=>{const f=fixture(),anchor=await f.observe();f.publish();f.set({connection:'connecting',sessionSnapshotFreshness:'cache'});await assert.rejects(f.present(anchor),/deadline|budget/i);assert.equal(f.clicks(),0);assert.ok(f.clock()<=2100);});
for (const revision of [null, '0', -1]) test(`present malformed announcement revision ${JSON.stringify(revision)} is rejected`,async()=>{const f=fixture(),anchor=await f.observe();f.startCapture.result.turnStartAnnouncement.revision=revision;f.publish();await assert.rejects(f.present(anchor));assert.equal(f.clicks(),0);});
test('actual initial announcement absence is sampled as absence, separately from historical display projection',async()=>{const f=fixture();f.publish();const current=await f.observe();assert.equal(current.announcementRevisionPresent,false);assert.equal(current.announcementRevisionRaw,null);});

test('actual observer reads live demo-profile binding after awaited digest',async()=>{const f=fixture();f.setDigest(()=>f.setProfile({roleId:'wing-commander',sessionId:'foreign-session'}));const current=await f.observe();assert.equal(current.profileSessionId,'foreign-session');assert.equal(current.profileRoleId,'wing-commander');});
test('foreign original demo profile cannot qualify a setup anchor or next action',async()=>{const f=fixture();f.setProfile({roleId:'wing-commander',sessionId:'foreign-session'});const anchor=await f.observe();f.publish();await assert.rejects(f.present(anchor));assert.equal(f.clicks(),0);});
