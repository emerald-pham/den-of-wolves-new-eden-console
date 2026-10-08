import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runSparseStationCombat} from './pc10-station-combat-adapter.mjs';
const source=await readFile(new URL('./pc10-fresh-minimum-ring-proof.mjs',import.meta.url),'utf8');
test('actual browser combat collection never reads server-only authority',()=>{
 const browserRead=source.slice(source.indexOf('const read=await gm.page.evaluate(async sid=>'),source.indexOf('},sid);serverCombatContext='));
 assert.ok(browserRead.includes('wolfAttackState/current'));assert.ok(browserRead.includes('wolfAttackAudience/current'));
 assert.doesNotMatch(browserRead,/serverState\/|getDocsFromServer|\/players|\/fleetGroups/);
});
test('diagnostic collection failure cannot replace an original gameplay stage failure',async()=>{
 const diagnosticError=Error('private diagnostic collection denied');const gameplayError=Error('actual Wing choice rejected');
 await assert.rejects(runSparseStationCombat({deadlineAt:Date.now()+1000,assertActors:async()=>{},readAttack:async()=>({attackId:'a',turn:2,revision:3,threatSiteCode:'P',status:'declared',currentStep:'targeting'}),onState:async()=>{throw diagnosticError},choose:async()=>{throw gameplayError}}),error=>error===gameplayError);
});
