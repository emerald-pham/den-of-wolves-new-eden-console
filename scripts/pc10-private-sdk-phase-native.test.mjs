import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { createPc10BrowserActor } from './pc10-browser-session-proof.mjs';
import { createPc10FunctionalCommand, assessPc10FunctionalTransport } from './pc10-gate2-functional-proof.mjs';
const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const docId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const docHash = createHash('sha256').update(`pc10-native-durable-document\0${docId}`).digest('hex');
const sdkUrl = 'http://127.0.0.1:5174/node_modules/.vite/deps/firebase_firestore.js?v=original-unit';
const phases = ['callback-entry', 'first-import-complete', 'second-import-complete', 'getDoc-invoked', 'originally-settled'];
const turn = () => new Promise(resolve => setImmediate(resolve));
const denied = () => Object.assign(new Error('private SDK error must not enter diagnostics'), { code: 'permission-denied' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});void promise.catch(()=>{});return {promise,resolve,reject}; };
async function fixture(t, { stall, rejectImport, read = 'deny', echoPatch, consolePatch } = {}) {
  t.mock.timers.enable({ apis: ['Date','setTimeout'], now: 1000 });
  const timers=[];const originalSetTimeout=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(...args)=>{timers.push(args[1]);return originalSetTimeout(...args);});
  const page = new EventEmitter(), cdp=new EventEmitter(), pending=deferred();
  const counts={evaluate:0,imports:[],getDoc:0,db:0,doc:0,exists:0}, args=[], messages=[];
  page.setDefaultTimeout=()=>{};page.setDefaultNavigationTimeout=()=>{};
  cdp.send=async name=>{assert.ok(['Network.enable','Network.configureDurableMessages'].includes(name));return {};};
  cdp.detach=async()=>{};
  const context={newPage:async()=>page,newCDPSession:async()=>cdp,close:async()=>{pending.reject(denied());}};
  const client=await createPc10BrowserActor({newContext:async()=>context},'http://127.0.0.1:5174','dione-engineer');
  const sandbox={Date,Symbol,console:{debug: text=>{const data=JSON.parse(text.slice(text.indexOf(':')+1));messages.push(data);
    const patched=consolePatch?consolePatch({...data}):data; if(patched) page.emit('console',{text:()=>text.slice(0,text.indexOf(':')+1)+JSON.stringify(patched),page:()=>page,worker:()=>null});}}};
  Object.defineProperty(sandbox,Symbol.for('pc10-proof-native-durable-document'),{value:docId});
  const realm=vm.createContext(sandbox), modules=new Map();
  const load=async specifier=>{
    counts.imports.push(specifier);
    const first=specifier==='/src/lib/firestore.ts';
    if ((first&&stall==='first-import')||(!first&&stall==='second-import')) await pending.promise;
    if ((first&&rejectImport==='first-import')||(!first&&rejectImport==='second-import')) throw new Error('original import rejection outside SDK catch');
    if (!modules.has(specifier)) {
      const exports=first?{db:()=>{counts.db++;return 'inert-db';}}:{doc:(db,path)=>{counts.doc++;assert.equal(db,'inert-db');assert.ok(path.startsWith('sessions/original-private-session/'));return 'inert-ref';},
        getDocFromServer:ref=>{counts.getDoc++;assert.equal(ref,'inert-ref');if(stall==='getDoc')return pending.promise;
          if(read==='deny')return Promise.reject(denied());return Promise.resolve({exists:()=>{counts.exists++;return true;}});}};
      const mod=new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context:realm});
      await mod.link(()=>assert.fail('No extra imports in inert SDK modules.'));await mod.evaluate();modules.set(specifier,mod);
    }
    return modules.get(specifier);
  };
  page.evaluate=(callback,input)=>{
    counts.evaluate++;args.push(input);
    if(stall==='evaluate')return pending.promise;
    realm.arg=input;
    const script=new vm.Script(`(${callback.toString()})(arg)`,{importModuleDynamically:load});
    const operation=script.runInContext(realm);
    return operation.then(value=>structuredClone(echoPatch?echoPatch(value):value));
  };
  page.emit('request',{url:()=>sdkUrl});
  const original={roleId:'dione-engineer',uid:'original-private-actor',sessionId:'original-private-session',contextHash:digest('context','original-private-context'),scope:{groupId:'fleet-1',vesselIds:['dione'],craftIds:[]}};
  const ledger=[], originals=new Map([[original.roleId,original]]);
  const binding=()=>({authUid:original.uid,storeUid:original.uid,sessionId:original.sessionId,assignedRoleId:original.roleId,activeConsoleRoleId:original.roleId,seatId:original.roleId,contextHash:original.contextHash,nativeDocumentHash:docHash,observedAt:Date.now()});
  const source=()=>({roleId:original.roleId,uid:original.uid,sessionId:original.sessionId,checkedAt:Date.now(),sourceHash:digest('source','same-original-private-authority'),phase:'active',currentTurn:1,connected:true,nonKicked:true,playerRole:'player',assignedRoleId:original.roleId,activeConsoleRoleId:original.roleId,seatId:original.roleId,generation:3,groupId:'fleet-1',vesselIds:['dione'],craftIds:[],sameMembership:true,seatHolderUid:original.uid,seatStatus:'claimed'});
  const command=createPc10FunctionalCommand({ledger,originals,clients:new Map([[original.roleId,client]]),observeBinding:binding,captureAuthority:source,clock:()=>Date.now(),validateReply:c=>({passed:c.reply?.status==='denied'&&c.reply?.code==='permission-denied'})});
  const run=(suffix='secrets/wolf-assignment')=>command(original.roleId,'privateFirestoreRead',{suffix},{expectedDenial:'permission-denied'});
  const record=()=>{assert.ok(ledger[0].privateSdkDiagnostic,'The actual original-command boundary must retain private SDK phase diagnostics.');return ledger[0].privateSdkDiagnostic;};
  const emit=(marker,{foreignPage=false,worker=null}={})=>page.emit('console',{text:()=>`PC10_PRIVATE_SDK_PHASE:${JSON.stringify(marker)}`,page:()=>foreignPage?{}:page,worker:()=>worker});
  t.after(async()=>{pending.reject(denied());await turn();await client.close();t.mock.restoreAll();t.mock.timers.reset();});
  return {client,run,record,ledger,originals,counts,timers,args,messages,emit,pending,turn};
}

import test from 'node:test';
const diagnosticOnly = d => {
  const value=JSON.stringify(d);
  for(const forbidden of ['original-private-actor','original-private-session','secrets/wolf-assignment','serverState/candidates','private SDK error','inert-ref',docId,sdkUrl,'private-token','Bearer'])
    assert.equal(value.includes(forbidden),false,`Private diagnostic must not persist ${forbidden}.`);
};
const core = entry => JSON.stringify(Object.fromEntries(['reply','completedAt','validation','failedAt','failure'].map(key=>[key,entry[key]])));
const marker = (f,ordinal,patch={}) => ({schemaVersion:1,invocationId:f.args[0].invocationId,documentId:docId,ordinal,phase:phases[ordinal],browserAt:Date.now(),...patch});

test('full real actor/privateRead and original command retain five bounded phases and exactly the original denial',async t=>{
  const f=await fixture(t);const reply=await f.run();const d=f.record();
  assert.deepEqual(reply,{status:'denied',code:'permission-denied'});
  assert.deepEqual(Object.keys(reply).sort(),['code','status']);
  assert.equal(d.verification,'VERIFIED');assert.equal(d.outcome,'DENIED');
  assert.deepEqual(d.phases.map(p=>p.phase),phases);assert.equal(d.phases.length,5);
  assert.equal(d.binding.nativeDocumentHash,docHash);assert.equal(d.binding.actorHash,digest('actor',f.ledger[0].original.uid));
  assert.equal(d.binding.sessionHash,digest('session',f.ledger[0].original.sessionId));
  assert.equal(d.binding.commandFingerprint,f.ledger[0].registeredRequestFingerprint);
  assert.equal(d.binding.sourceBeforeHash,f.ledger[0].beforeSource.sourceHash);
  assert.equal(d.collectionTag,'secrets');assert.match(d.suffixHash,/^[a-f0-9]{64}$/);
  assert.equal(Object.getOwnPropertyDescriptor(d,'invocationId').writable,false);
  assert.equal(d.sdkModuleHash,createHash('sha256').update(`pc10-private-sdk-module\0${sdkUrl}`).digest('hex'));
  assert.deepEqual(f.counts,{evaluate:1,imports:['/src/lib/firestore.ts',sdkUrl],getDoc:1,db:1,doc:1,exists:0});
  assert.deepEqual(f.timers,[15000]);diagnosticOnly(d);
});
for (const [stall,expected,imports,getDoc] of [
  ['evaluate',[],0,0],['first-import',['callback-entry'],1,0],
  ['second-import',['callback-entry','first-import-complete'],2,0],
  ['getDoc',phases.slice(0,4),2,1],
]) test(`real ${stall} stall remains UNKNOWN at exactly15000ms and retains only genuine unconfirmed notes`,async t=>{
  const f=await fixture(t,{stall});const operation=f.run();void operation.catch(()=>{});await turn();
  const d=f.record();assert.equal(d.verification,'UNCONFIRMED');assert.equal(d.outcome,'UNKNOWN');
  assert.deepEqual(d.phases.map(p=>p.phase),expected);assert.equal(f.counts.evaluate,1);
  assert.equal(f.counts.imports.length,imports);assert.equal(f.counts.getDoc,getDoc);assert.deepEqual(f.timers,[15000]);
  t.mock.timers.tick(14999);assert.equal(f.ledger[0].failedAt,null);
  t.mock.timers.tick(1);await assert.rejects(operation,/private SDK read exceeded 15000ms/);
  assert.equal(d.deadlineExceeded,true);assert.equal(d.verification,'UNCONFIRMED');assert.equal(d.outcome,'UNKNOWN');
  assert.equal(f.ledger[0].reply,undefined);assert.equal(f.ledger[0].completedAt,null);assert.equal(f.ledger[0].validation,undefined);
  assert.equal(assessPc10FunctionalTransport({commands:f.ledger,originals:f.originals}).functionalStatus,'FAILED');
  diagnosticOnly(d);
});
for(const rejectImport of ['first-import','second-import']) test(`${rejectImport} original rejection stays outside SDK catch and cannot become a denial`,async t=>{
  const f=await fixture(t,{rejectImport});await assert.rejects(f.run(),/original import rejection outside SDK catch/);
  const d=f.record();assert.equal(d.outcome,'UNKNOWN');assert.equal(d.verification,'UNCONFIRMED');
  assert.equal(f.counts.getDoc,0);assert.equal(f.ledger[0].reply,undefined);assert.equal(f.ledger[0].completedAt,null);
  assert.equal(d.operationRejected,true);assert.deepEqual(f.timers,[15000]);diagnosticOnly(d);
});
test('same original late SDK denial is diagnostic only and cannot fill a failed command',async t=>{
  const f=await fixture(t,{stall:'getDoc'});const operation=f.run();void operation.catch(()=>{});await turn();
  t.mock.timers.tick(15000);await assert.rejects(operation,/private SDK read exceeded 15000ms/);
  const before=core(f.ledger[0]);f.pending.reject(denied());await turn();const d=f.record();
  assert.equal(core(f.ledger[0]),before);assert.equal(d.outcome,'UNKNOWN');assert.equal(d.verification,'UNCONFIRMED');
  assert.equal(d.completedAt,null);assert.equal(d.lateSettlement.kind,'evaluate-fulfilled');
  assert.equal(d.lateSettlement.status,'denied');assert.equal(d.lateSettlement.code,'permission-denied');
  assert.equal(f.counts.evaluate,1);assert.equal(f.counts.imports.length,2);assert.equal(f.counts.getDoc,1);
  assert.equal(assessPc10FunctionalTransport({commands:f.ledger,originals:f.originals}).functionalStatus,'FAILED');diagnosticOnly(d);
});
test('a matching forged complete pending console transcript cannot earn phase or SDK outcome credit',async t=>{
  const f=await fixture(t,{stall:'evaluate'});const operation=f.run();void operation.catch(()=>{});await turn();
  const d=f.record();for(let ordinal=0;ordinal<5;ordinal++) f.emit(marker(f,ordinal));
  assert.equal(d.verification,'UNCONFIRMED');assert.equal(d.outcome,'UNKNOWN');assert.equal(f.counts.imports.length,0);assert.equal(f.counts.getDoc,0);
  t.mock.timers.tick(15000);await assert.rejects(operation,/private SDK read exceeded 15000ms/);
  assert.equal(d.verification,'UNCONFIRMED');assert.equal(d.outcome,'UNKNOWN');diagnosticOnly(d);
});
for(const [name,patch] of [
  ['foreign document',{documentId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}],
  ['future marker',{browserAt:1001}],['out-of-window marker',{browserAt:999}],
  ['out-of-order marker',{ordinal:4,phase:'originally-settled'}],
  ['private marker field',{token:'private-token'}],
]) test(`${name} is rejected without persisting arbitrary console data`,async t=>{
  const f=await fixture(t,{stall:'evaluate'});const operation=f.run();void operation.catch(()=>{});await turn();
  const d=f.record();f.emit(marker(f,0,patch));assert.equal(d.verification,'INVALID');assert.equal(d.outcome,'UNKNOWN');
  assert.equal(d.phases.length,0);assert.ok(d.rejections.length>0);diagnosticOnly(d);
  t.mock.timers.tick(15000);await assert.rejects(operation,/private SDK read exceeded 15000ms/);
});
test('foreign immutable invocation and foreign page/worker cannot bind the actual dispatched operation',async t=>{
  const f=await fixture(t,{stall:'evaluate'});const operation=f.run();void operation.catch(()=>{});await turn();
  const d=f.record();f.emit(marker(f,0,{invocationId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}));
  assert.equal(d.phases.length,0);assert.equal(d.channelRejections.foreignInvocation,1);
  f.emit(marker(f,0),{foreignPage:true});f.emit(marker(f,0),{worker:{}});
  assert.equal(d.phases.length,0);assert.equal(d.verification,'INVALID');diagnosticOnly(d);
  t.mock.timers.tick(15000);await assert.rejects(operation,/private SDK read exceeded 15000ms/);
});
test('duplicate console note cannot authenticate even when the original SDK denial completes',async t=>{
  const f=await fixture(t,{consolePatch:data=>{if(data.ordinal===0)f.emit({...data});return data;}});
  const reply=await f.run();const d=f.record();assert.deepEqual(reply,{status:'denied',code:'permission-denied'});
  assert.equal(d.verification,'INVALID');assert.equal(d.outcome,'UNKNOWN');assert.ok(d.rejections.includes('duplicate-or-out-of-order-phase'));
  assert.equal(f.counts.getDoc,1);diagnosticOnly(d);
});
test('same original result must corroborate console provenance; forged returned witness cannot fill it',async t=>{
  const f=await fixture(t,{echoPatch:value=>({...value,phaseWitness:{...value.phaseWitness,invocationId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'}})});
  const reply=await f.run();const d=f.record();assert.deepEqual(reply,{status:'denied',code:'permission-denied'});
  assert.equal(d.verification,'INVALID');assert.equal(d.outcome,'UNKNOWN');assert.ok(d.rejections.includes('original-promise-provenance-mismatch'));
  assert.equal(f.counts.evaluate,1);diagnosticOnly(d);
});
test('original successful private SDK reply stays unclassified and gains no privacy credit from verified phases',async t=>{
  const f=await fixture(t,{read:'read'});await assert.rejects(f.run());const d=f.record();
  assert.deepEqual(f.ledger[0].reply,{status:'read',exists:true});assert.equal(d.verification,'VERIFIED');assert.equal(d.outcome,'READ');
  assert.equal(f.counts.exists,1);assert.equal(assessPc10FunctionalTransport({commands:f.ledger,originals:f.originals}).functionalStatus,'FAILED');diagnosticOnly(d);
});
test('all42 planned inert attempts retain42evaluate/84import/42getDoc and only one unchanged timer each',async t=>{
  const f=await fixture(t);const replies=await Promise.all(Array.from({length:42},(_,i)=>f.run(i%2?'serverState/candidates':'secrets/wolf-assignment')));
  assert.equal(replies.length,42);assert.equal(f.counts.evaluate,42);assert.equal(f.counts.imports.length,84);assert.equal(f.counts.getDoc,42);
  assert.equal(f.timers.length,42);assert.ok(f.timers.every(ms=>ms===15000));assert.equal(f.ledger.length,42);
  assert.equal(new Set(f.ledger.map(c=>c.privateSdkDiagnostic.invocationId)).size,42);
  for(const c of f.ledger){assert.equal(c.privateSdkDiagnostic.verification,'VERIFIED');diagnosticOnly(c.privateSdkDiagnostic);}
});
