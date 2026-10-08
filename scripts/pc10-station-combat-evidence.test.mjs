import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runSparseStationCombat} from './pc10-station-combat-adapter.mjs';
const source=await readFile(new URL('./pc10-fresh-minimum-ring-proof.mjs',import.meta.url),'utf8');
test('actual browser combat collection never reads server-only authority',()=>{
 const browserRead=source.slice(source.indexOf('const read=await gm.page.evaluate(async sid=>'),source.indexOf('},sid);',source.indexOf('const read=await gm.page.evaluate(async sid=>')));
 assert.ok(browserRead.includes('wolfAttackState/current'));assert.ok(browserRead.includes('wolfAttackAudience/current'));
 assert.doesNotMatch(browserRead,/serverState\/|getDocsFromServer|\/players|\/fleetGroups/);
});
test('diagnostic collection failure cannot replace an original gameplay stage failure',async()=>{
 const diagnosticError=Error('private diagnostic collection denied');const gameplayError=Error('actual Wing choice rejected');
 await assert.rejects(runSparseStationCombat({deadlineAt:Date.now()+1000,assertActors:async()=>{},readAttack:async()=>({attackId:'a',turn:2,revision:3,threatSiteCode:'P',status:'declared',currentStep:'targeting'}),onState:async()=>{throw diagnosticError},choose:async()=>{throw gameplayError}}),error=>error===gameplayError);
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
 await assert.rejects(runSparseStationCombat({deadlineAt:Date.now()+1000,assertActors:async()=>{},readAttack:async()=>({attackId:'a',turn:2,revision:3,threatSiteCode:'P',status:'declared',currentStep:'targeting'}),onState:async()=>{throw Error('retention failed')},onDiagnosticError:async(error,attack)=>{observed.push([error.message,attack.attackId]);throw Error('reporting failed')},choose:async()=>{throw original}}),error=>error===original);
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
