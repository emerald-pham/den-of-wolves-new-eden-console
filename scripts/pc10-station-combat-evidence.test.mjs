import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import {readFile} from 'node:fs/promises';
import {runSparseStationCombat} from './pc10-station-combat-adapter.mjs';
const source=await readFile(new URL('./pc10-fresh-minimum-ring-proof.mjs',import.meta.url),'utf8');

function extractStationTurnStateBrowserCallback() {
 const readerStart=source.indexOf('async function readTurnState');
 const callbackStart=source.indexOf('async({sid,storeUrl,authorityUrl,expectedAuthority})=>{',readerStart);
 const callbackEnd=source.indexOf('\n    },{sid,storeUrl:gm.storeModuleUrl()',callbackStart);
 assert.ok(readerStart>=0&&callbackStart>readerStart&&callbackEnd>callbackStart,
  'The test must execute the actual normal-GM browser callback from readTurnState.');
 let callback=source.slice(callbackStart,callbackEnd).trimEnd()+'}';
 callback=callback
  .replace("const{auth}=await import('/src/lib/firebase.ts'),{useSessionStore}=await import(storeUrl),authority=await import(authorityUrl);",
   'const{auth}=deps.firebase,{useSessionStore}=deps.store,authority=deps.authority;')
  .replace("await(await fetch('/src/lib/firestore.ts')).text()", "await(await deps.fetch('/src/lib/firestore.ts')).text()")
  .replace("const sdk=await import(match[1]),{db}=await import('/src/lib/firestore.ts');",'const sdk=deps.sdk,{db}=deps.firestore;')
  .replaceAll('crypto.subtle.digest','deps.crypto.subtle.digest')
  .replaceAll('new TextEncoder()','new deps.TextEncoder()');
 assert.doesNotMatch(callback,/await import\(/,
  'Only browser module imports are injected; the callback logic remains extracted from production source.');
 assert.ok(callback.includes("deps.fetch('/src/lib/firestore.ts')"),
  'The extracted source callback must retain its actual Firestore module lookup.');
 return new Function('deps',`return (${callback});`);
}

const stationTurnStateBrowserCallback=extractStationTurnStateBrowserCallback();
const stationTurnStateSessionId='source-owned-session';
const stationTurnStateUid='source-owned-original-gm';
const stationTurnStateClaimedAt='2026-10-08T13:40:00.123Z';
const stationTurnStateUidHash=createHash('sha256').update(stationTurnStateUid).digest('hex').slice(0,16);
function firestoreTimestamp(iso) {
 const milliseconds=Date.parse(iso);
 return {seconds:Math.floor(milliseconds/1000),nanoseconds:(milliseconds%1000)*1_000_000,
  toDate:()=>new Date(milliseconds)};
}
function stationTurnStateCallbackInput(serverClaimedAt,{storeClaimedAt=stationTurnStateClaimedAt}={}) {
 const state={connection:'live',sessionSnapshotFreshness:'server',identityHydrationRevision:2,
  me:{uid:stationTurnStateUid,role:'gm',connectionGeneration:4},
  session:{id:stationTurnStateSessionId},
  gmInstance:{id:'original-gm-instance',uid:stationTurnStateUid,sessionId:stationTurnStateSessionId,claimedAt:storeClaimedAt}};
 const root={phase:'active',currentTurn:3,turnLimit:6,
  fullGameDemo:{status:'active',progression:'manual'},
  turnPhase:{turn:3,teamPhaseEndsAt:'2026-10-08T13:50:00.000Z',openAirspaceEndsAt:'2026-10-08T14:10:00.000Z',
   airspace:{state:'restricted',tickerActive:true,pressAccess:false},progression:'manual'},
  turnState:{currentTurn:3,maxTurn:6,phase:'team',phaseRevision:13,
   startedAt:'2026-10-08T13:30:00.000Z',endsAt:'2026-10-08T13:50:00.000Z'}};
 const player={role:'gm',connected:true,connectionGeneration:4};
 const instance={uid:stationTurnStateUid,sessionId:stationTurnStateSessionId,connected:true};
 if(serverClaimedAt!==stationMissingClaim)instance.claimedAt=serverClaimedAt;
 const documents=new Map([
  [`sessions/${stationTurnStateSessionId}`,root],
  [`sessions/${stationTurnStateSessionId}/players/${stationTurnStateUid}`,player],
  [`sessions/${stationTurnStateSessionId}/gmInstances/original-gm-instance`,instance],
 ]);
 const deps={
  firebase:{auth:()=>({currentUser:{uid:stationTurnStateUid}})},
  store:{useSessionStore:{getState:()=>state}},
  authority:{sessionSnapshotAuthorityFor:(sessionId,uid)=>({hasServerSessionAuthority:sessionId===stationTurnStateSessionId&&uid===stationTurnStateUid}),
   memberSessionResumeBlocksFreshness:()=>false},
  fetch:async()=>({text:async()=>`export { getDocFromServer } from './firebase_firestore.js?v=source-test';`}),
  sdk:{doc:(_db,path)=>({path}),getDocFromServer:async ref=>({exists:()=>documents.has(ref.path),data:()=>documents.get(ref.path)})},
  firestore:{db:()=>({})},crypto:webcrypto,TextEncoder,
 };
 return {deps,args:{sid:stationTurnStateSessionId,storeUrl:'source-test-store',authorityUrl:'source-test-authority',
  expectedAuthority:{sessionId:stationTurnStateSessionId,uidHash:stationTurnStateUidHash,generation:4,
   hydrationRevision:2,instanceId:'original-gm-instance',claimedAt:stationTurnStateClaimedAt}}};
}
const stationMissingClaim=Symbol('missing claimedAt field');

test('actual browser combat collection never reads server-only authority',()=>{
 const start=source.indexOf('async function readAttack');
 const end=source.indexOf('async function readTurnState',start);
 const browserRead=source.slice(start,end);
 assert.ok(browserRead.includes('wolfAttackState/current'));assert.ok(browserRead.includes('wolfAttackAudience/current'));
 assert.doesNotMatch(browserRead,/serverState\/|getDocsFromServer|\/players|\/fleetGroups/);
});
test('default original GM attack reads preserve the existing 60-second cap while explicit stage deadlines stay bounded',()=>{
 const start=source.indexOf('async function readAttack');
 const end=source.indexOf('async function readTurnState',start);
 const browserRead=source.slice(start,end);
 assert.match(browserRead,/async function readAttack\(\{deadlineAt:operationDeadlineAt=Math\.min\(Date\.now\(\)\+60000,workEnd\)\}=\{\}\)/,
  'A default attack read must retain the original live-GM 60-second cap and the outer work deadline.');
 assert.ok(browserRead.includes("liveGm(gm,'GM1','active',{deadlineAt:operationDeadlineAt})"),
  'Explicit stage deadlines must reach the existing live-GM authority reader.');
 assert.ok(browserRead.includes("operationDeadlineAt,'Original GM browser P attack read expired.'"),
  'The actual Firestore read must remain bounded by that same operation deadline.');
});
test('Station phase catch-up reads the whole phase envelope and original GM lease from its owned browser',()=>{
 const start=source.indexOf('async function readTurnState');
 const end=source.indexOf('const recordDiagnosticError',start);
 const browserRead=source.slice(start,end);
 assert.ok(browserRead.includes('getDocFromServer'),'The turn phase must come from a current server read through the original browser SDK.');
 assert.match(browserRead,/sessions\/\$\{sid\}/);
 assert.ok(browserRead.includes('turnPhase'));assert.ok(browserRead.includes('turnState'));
 assert.ok(browserRead.includes('airspace'));assert.ok(browserRead.includes('progression'));
 assert.ok(browserRead.includes('gmInstances'));assert.ok(browserRead.includes('claimedAt'));
 assert.ok(browserRead.includes('gm1OriginalAuthority'));
 assert.doesNotMatch(browserRead,/readStationCombatGuardAuthority|serverContext|serverState\//,
  'Admin diagnostics and private attack support docs cannot qualify the member phase projection.');
});
test('actual extracted browser phase callback normalizes a current Firestore Timestamp to the browser claim lease',async()=>{
 const fixture=stationTurnStateCallbackInput(firestoreTimestamp(stationTurnStateClaimedAt));
 const read=await stationTurnStateBrowserCallback(fixture.deps)(fixture.args);
 assert.equal(read.gmAuthority.claimedAt,stationTurnStateClaimedAt);
 assert.equal(read.session.turnState.phase,'team');
});
test('actual extracted browser phase callback rejects foreign, absent, and malformed claim timestamps',async()=>{
 const candidates=[
  firestoreTimestamp('2026-10-08T13:40:01.123Z'),
  stationMissingClaim,
  {seconds:'malformed',nanoseconds:0},
 ];
 for(const serverClaimedAt of candidates){
  const fixture=stationTurnStateCallbackInput(serverClaimedAt);
  await assert.rejects(stationTurnStateBrowserCallback(fixture.deps)(fixture.args),/lease|claim|authority/i);
 }
});
test('diagnostic collection failure cannot replace an original gameplay stage failure',async()=>{
 const diagnosticError=Error('private diagnostic collection denied');const gameplayError=Error('actual Wing choice rejected');
 await assert.rejects(runSparseStationCombat({deadlineAt:Date.now()+1000,assertActors:async()=>{},readAttack:async()=>({attackId:'a',turn:2,revision:3,threatSiteCode:'P',status:'declared',currentStep:'targeting',targetGroupId:'fleet-owned',threatSourceId:'arrival-owned',airspaceLocked:true}),onState:async()=>{throw diagnosticError},choose:async()=>{throw gameplayError}}),error=>error===gameplayError);
});

const runner=await import('./pc10-fresh-minimum-ring-proof.mjs');
const scope={ownedSyntheticSession:true,sessionId:'owned-session',ownedSessionId:'owned-session',projectId:'demo-owned',expectedProjectId:'demo-owned',firestoreHost:'127.0.0.1:8130',expectedFirestoreHost:'127.0.0.1:8130'};
function inspectionClient(){
 const reads=[];const snapshot=(path,data)=>({exists:true,id:path.split('/').at(-1),data:()=>data});
 const db={projectId:'demo-owned',doc:path=>({get:async()=>{reads.push(path);return snapshot(path,path.endsWith('/wolfAttackState/current')?{attackId:'actual'}:path.endsWith('/serverState/pdfEscortWing')?{attackId:'actual',fighters:4}:{currentTurn:2,shipDamage:{},joinCode:'never-retained'});}}),collection:path=>({get:async()=>{reads.push(path);return {docs:[snapshot(`${path}/owned`,path.endsWith('/players')?{role:'player',assignedRoleId:'wing-commander',email:'never-retained'}:{vesselIds:['aegis'],memberShipIds:{owned:'aegis'}})]};}})};
 return {db,reads};
}
test('private guard inspection uses only bounded owned-session Admin gets and keeps provenance distinct',async()=>{
 const {db,reads}=inspectionClient();const authority=await runner.readStationCombatGuardAuthority({db,scope});
 assert.deepEqual(reads,['sessions/owned-session','sessions/owned-session/wolfAttackState/current','sessions/owned-session/serverState/pdfEscortWing','sessions/owned-session/players','sessions/owned-session/fleetGroups']);
 assert.equal(authority.inspection.channel,'isolated-emulator-admin-read-only');assert.equal(authority.authoritativeAttack.attackId,'actual');
 const context=runner.stationCombatServerContext({...authority,publicAudience:null});assert.equal(context.joinCode,undefined);assert.equal(context.players[0].email,undefined);assert.deepEqual(context.shipDamage,{});
});
test('inspection rejects production, remote hosts, foreign or unowned sessions before any read',async()=>{
 for(const bad of [{ownedSyntheticSession:false},{sessionId:'foreign'},{sessionId:'../foreign',ownedSessionId:'../foreign'},{projectId:'production',expectedProjectId:'production'},{expectedProjectId:'demo-other'},{firestoreHost:'firestore.googleapis.com:443'},{expectedFirestoreHost:'127.0.0.1:9999'}]){
  const {db,reads}=inspectionClient();await assert.rejects(runner.readStationCombatGuardAuthority({db,scope:{...scope,...bad}}));assert.deepEqual(reads,[]);
 }
 const {db,reads}=inspectionClient();db.projectId='demo-other';await assert.rejects(runner.readStationCombatGuardAuthority({db,scope}));assert.deepEqual(reads,[]);
});
test('diagnostic reporter failure cannot mask the gameplay error; browser authority failure remains fatal',async()=>{
 const original=Error('original gameplay failure');const observed=[];
 await assert.rejects(runSparseStationCombat({deadlineAt:Date.now()+1000,assertActors:async()=>{},readAttack:async()=>({attackId:'a',turn:2,revision:3,threatSiteCode:'P',status:'declared',currentStep:'targeting',targetGroupId:'fleet-owned',threatSourceId:'arrival-owned',airspaceLocked:true}),onState:async()=>{throw Error('retention failed')},onDiagnosticError:async(error,attack)=>{observed.push([error.message,attack.attackId]);throw Error('reporting failed')},choose:async()=>{throw original}}),error=>error===original);
 assert.deepEqual(observed,[['retention failed','a']]);let diagnosticCalled=false;
 await assert.rejects(runSparseStationCombat({deadlineAt:Date.now()+1000,assertActors:async()=>{},readAttack:async()=>{throw original},onState:async()=>{diagnosticCalled=true},choose:async()=>{}}),error=>error===original);assert.equal(diagnosticCalled,false);
});
test('actual unchanged rules keep server authority private while GM current attack and member audience reads exist',async()=>{
 const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
 assert.match(rules,/match \/serverState\/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
 assert.match(rules,/match \/wolfAttackState\/\{projectionId\}\s*\{\s*allow get: if projectionId == 'current' && isGm\(sessionId\);/);
 assert.match(rules,/match \/wolfAttackAudience\/\{projectionId\}\s*\{\s*allow get: if projectionId == 'current' && isMember\(sessionId\)/);
 assert.ok(source.includes('Promise.allSettled(['));assert.ok(source.includes('onDiagnosticError:async(error,attack)'));assert.ok(source.includes("evidence.stationDiagnosticStatus='incomplete'"));
});

test('boarding diagnostics retain actual visit and retained state without inventing absent fields',()=>{
 const base={sessionId:'owned',root:{},players:[],fleetGroups:[]};
 const visits=[{id:'real',shuttleId:'chepu',shipId:'refinery-124',action:'docked',occurredAt:'SESSION START'}];
 const retained={chepu:{destroyedHostId:'refinery-124'}};
 const context=runner.stationCombatServerContext({...base,root:{shuttleVisitLog:visits,retainedShuttles:retained}});
 assert.deepEqual(context.shuttleVisitLog,visits);assert.deepEqual(context.retainedShuttles,retained);
 const absent=runner.stationCombatServerContext(base);assert.equal(Object.hasOwn(absent,'shuttleVisitLog'),false);assert.equal(Object.hasOwn(absent,'retainedShuttles'),false);
});
