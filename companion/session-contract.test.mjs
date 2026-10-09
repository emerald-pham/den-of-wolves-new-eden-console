import test from 'node:test';
import assert from 'node:assert/strict';
import { CastingService } from './casting.mjs';
import { SessionCastingStore, createSessionCastingGateway } from './session-contract.mjs';
const now = 1800000000000, uid = 'synthetic-gm';
const actor = { uid, workspace: 'alpha', instanceId: 'gm-a' };
const schema = { title: 'Casting', description: '', sections: [{title:'Names',questions:[{id:'name',label:'Player',type:'short',required:true}]}] };
function fixture(change = () => {}) {
 const seed = { memberships:[{uid,workspace:'alpha',role:'owner'}],directory:[],state:new CastingService({memberships:[]}).exportSyntheticState(),bindings:[{workspace:'alpha',sessionId:'lobby-a'}],bindingReceipts:[],
  gmAccess:[{uid,authenticatedAt:now-1000}],sessions:[{id:'lobby-a',phase:'lobby',currentTurn:0,players:[{uid,role:'gm',connected:true,lastSeenAt:now}],instances:[{id:'gm-a',uid,connected:true,lastSeenAt:now}]},{id:'other',phase:'active',currentTurn:2,players:[{uid,role:'gm',connected:true,lastSeenAt:now}],instances:[{id:'gm-b',uid,connected:true,lastSeenAt:now}]}]};
 change(seed);const store=new SessionCastingStore(seed,{now:()=>now});
 const gateway=createSessionCastingGateway({store,verifyContext:async c=>({appVerified:true,identity:c?.signedOut?null:{uid,verified:true,durable:true},instanceId:c?.instanceId??'gm-a'}),verifySubmissionAttempt:async({attempt})=>({nonce:attempt,scope:'synthetic-respondent'})});
 const call=(operation,payload,context={})=>gateway.handle({operation,payload,context}); return {store,call};
}
for(const [name,change] of [
 ['non-GM',s=>s.sessions[0].players[0].role='player'],
 ['expired GM access',s=>s.gmAccess[0].authenticatedAt=now-7*86400000],
 ['revoked GM access',s=>s.gmAccess=[]],
 ['stale GM instance',s=>s.sessions[0].instances[0].lastSeenAt=now-45000],
 ['cross-session instance',s=>s.sessions[0].instances=[]],
]) test(`${name} cannot read private workspace even with prior owner membership`,async()=>{const f=fixture(change);await assert.rejects(f.call('workspace',{workspace:'alpha'}),{code:'permission-denied'});});
test('lobby GM can bind/select a workspace without starting game; binding cannot move to another session',async()=>{
 const f=fixture();const result=await f.call('bindWorkspace',{workspace:'fresh',sessionId:'lobby-a',attempt:'bind'});assert.equal(result.sessionId,'lobby-a');assert.deepEqual(await f.call('bindWorkspace',{workspace:'fresh',sessionId:'lobby-a',attempt:'bind'}),result);
 await assert.rejects(f.call('bindWorkspace',{workspace:'fresh',sessionId:'other',attempt:'move'},{instanceId:'gm-b'}),{code:'failed-precondition'});
 assert.equal(f.store.checkpointSynthetic().sessions[0].phase,'lobby');assert.equal(f.store.checkpointSynthetic().sessions[0].currentTurn,0);
});
test('anonymous authenticated GM identity is supported, signed-out and bearer-only edits denied',async()=>{
 const f=fixture();const g=createSessionCastingGateway({store:f.store,verifyContext:async()=>({appVerified:true,identity:{uid,verified:true,durable:false},instanceId:'gm-a'})});assert.ok(await g.handle({operation:'workspace',payload:{workspace:'alpha'}}));
 await assert.rejects(f.call('workspace',{workspace:'alpha'},{signedOut:true}),{code:'unauthenticated'});
});
test('bearer snapshot is anonymous view-only; update is explicit; rotation/revocation never restore prior handles',async()=>{
 const f=fixture();const form=await f.call('createForm',{workspace:'alpha',definition:schema,attempt:'form'});const pub=await f.call('publish',{workspace:'alpha',formId:form.id,expectedRevision:1,attempt:'pub'});
 const r=await f.call('submit',{handle:pub.handle,version:1,answers:{name:'Fixture'},attempt:'a'.repeat(32)});
 const t=await f.call('createTemplate',{workspace:'alpha',template:{name:'Pilot',details:''},attempt:'template'});
 const i=await f.call('createInstance',{workspace:'alpha',templateId:t.id,details:{playerName:'One',characterName:'Pilot',details:'Published'},attempt:'instance'});
 const p={workspace:'alpha',responseId:r.id,instanceId:i.id,expectedResponseRevision:1,expectedInstanceRevision:1,attempt:'share'};
 const share=await f.call('assign',p);assert.match(share.handle,/^[A-Za-z0-9_-]{32}$/);
 const read=()=>f.call('dossier',{handle:share.handle},{signedOut:true});assert.deepEqual(await read(),{playerName:'One',characterName:'Pilot',details:'Published',revision:1});
 await f.call('updateInstance',{workspace:'alpha',instanceId:i.id,expectedRevision:1,details:{playerName:'Two',characterName:'Pilot',details:'Private draft'},attempt:'edit'});assert.equal((await read()).details,'Published');
 await f.call('publishDossierUpdate',{workspace:'alpha',responseId:r.id,expectedResponseRevision:2,expectedInstanceRevision:2,expectedInstanceId:i.id,attempt:'update'});assert.equal((await read()).details,'Private draft');
 const rotated=await f.call('assign',{...p,expectedResponseRevision:3,expectedInstanceRevision:2,attempt:'rotate'});assert.notEqual(rotated.handle,share.handle);await assert.rejects(read(),{code:'not-found'});
 await f.call('revoke',{workspace:'alpha',responseId:r.id,expectedResponseRevision:4,attempt:'revoke'});await assert.rejects(f.call('dossier',{handle:rotated.handle},{signedOut:true}),{code:'not-found'});
 await assert.rejects(f.call('updateInstance',{workspace:'alpha',instanceId:i.id,expectedRevision:2,details:{playerName:'Hack',characterName:'Hack',details:'Hack'},attempt:'hack'},{signedOut:true}),{code:'unauthenticated'});
});
test('session authority changes deny receipt replay; deleted/closed session disables bearer and public form',async()=>{
 const f=fixture();const form=await f.call('createForm',{workspace:'alpha',definition:schema,attempt:'form'});const published=await f.call('publish',{workspace:'alpha',formId:form.id,expectedRevision:1,attempt:'publish'});
 await f.store.changeAuthoritySynthetic(s=>s.gmAccess=[]);await assert.rejects(f.call('createForm',{workspace:'alpha',definition:schema,attempt:'form'}),{code:'permission-denied'});
 assert.ok(await f.call('publicForm',{handle:published.handle},{signedOut:true}));await f.store.changeAuthoritySynthetic(s=>s.sessions[0].phase='closed');await assert.rejects(f.call('publicForm',{handle:published.handle},{signedOut:true}),{code:'not-found'});
});
test('interrupted binding and writes do not duplicate, lost acknowledgement replays under current authority',async()=>{
 const f=fixture();await assert.rejects(f.store.invoke({...actor,workspace:'fresh'},'bindWorkspace',['lobby-a','bind'],{interrupt:'beforeCommit'}),{code:'unavailable'});assert.ok(!f.store.checkpointSynthetic().bindings.some(b=>b.workspace==='fresh'));
 await assert.rejects(f.store.invoke(actor,'createForm',[schema,'create'],{interrupt:'afterCommit'}),{code:'unavailable'});const recovered=await f.store.invoke(actor,'createForm',[schema,'create']);assert.equal(f.store.checkpointSynthetic().state.forms.length,1);assert.ok(recovered.id);
 await assert.rejects(f.store.invoke(actor,'createForm',[{...schema,title:'Changed'},'create']),/retry conflict/);
});
test('three instances remain distinct and stale revisions or wrong workspace never overwrite them',async()=>{
 const f=fixture();const template=await f.call('createTemplate',{workspace:'alpha',template:{name:'Pilot',details:''},attempt:'t'});const instances=[];
 for(let n=0;n<3;n++)instances.push(await f.call('createInstance',{workspace:'alpha',templateId:template.id,details:{playerName:`Player${n}`,characterName:`Pilot${n}`,details:`Detail${n}`},attempt:`i${n}`}));assert.equal(new Set(instances.map(i=>i.id)).size,3);
 await assert.rejects(f.call('createInstance',{workspace:'alpha',templateId:template.id,details:{playerName:'Four',characterName:'Four',details:''},attempt:'four'}),{code:'resource-exhausted'});
 await f.call('updateInstance',{workspace:'alpha',instanceId:instances[0].id,expectedRevision:1,details:{playerName:'Edited',characterName:'Edited',details:'Edited'},attempt:'edit'});
 await assert.rejects(f.call('updateInstance',{workspace:'alpha',instanceId:instances[0].id,expectedRevision:1,details:{playerName:'Stale',characterName:'Stale',details:''},attempt:'stale'}),{code:'aborted'});
 assert.equal((await f.call('instance',{workspace:'alpha',instanceId:instances[1].id})).playerName,'Player1');await assert.rejects(f.call('instance',{workspace:'other',instanceId:instances[1].id}),{code:'permission-denied'});
});
for(const [name,change] of [['future access',s=>s.gmAccess[0].authenticatedAt=now+1],['future instance',s=>s.sessions[0].instances[0].lastSeenAt=now+1],['missing GM timestamps',s=>delete s.sessions[0].instances[0].lastSeenAt],['infinite heartbeat',s=>s.sessions[0].instances[0].lastSeenAt=Infinity],['disconnected',s=>s.sessions[0].players[0].connected=false]])test(`${name} fails closed`,async()=>{const f=fixture(change);await assert.rejects(f.call('workspace',{workspace:'alpha'}),{code:'permission-denied'});});
test('kicked GM cannot read mutate or replay a previously successful receipt',async()=>{
 const f=fixture();await f.call('createForm',{workspace:'alpha',definition:schema,attempt:'create'});await f.store.changeAuthoritySynthetic(s=>s.sessions[0].players[0].kickedAt=now);
 await assert.rejects(f.call('workspace',{workspace:'alpha'}),{code:'permission-denied'});await assert.rejects(f.call('createForm',{workspace:'alpha',definition:schema,attempt:'create'}),{code:'permission-denied'});
});
for(const appVerified of ['false',{},1])test(`malformed AppCheck ${JSON.stringify(appVerified)} rejects`,async()=>{
 const f=fixture();const gateway=createSessionCastingGateway({store:f.store,verifyContext:async()=>({appVerified,identity:{uid,verified:true},instanceId:'gm-a'})});await assert.rejects(gateway.handle({operation:'workspace',payload:{workspace:'alpha'}}),{code:'failed-precondition'});
});
