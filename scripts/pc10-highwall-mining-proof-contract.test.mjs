import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

// Read and exercise the real finite consumers without importing the native
// runner: no browser, emulator, network or Firebase identity is started here.
const path=process.env.PC10_HIGHWALL_RUNNER??new URL('./pc10-highwall-mining-ui-proof.mjs',import.meta.url);
const source=await readFile(path,'utf8'),require=createRequire(import.meta.url),ts=require('typescript');
const ast=ts.createSourceFile(String(path),source,ts.ScriptTarget.Latest,true),mainTry=ast.statements.find(ts.isTryStatement),work=[];
assert.ok(mainTry);function visit(n){if(ts.isArrowFunction(n)&&ts.isBlock(n.body)&&n.body.getText(ast).includes("launchSurface('browser-A-normal-GM')"))work.push(n.body);ts.forEachChild(n,visit);}visit(mainTry.tryBlock);assert.equal(work.length,1);const main=work[0].statements;
const plain=v=>JSON.parse(JSON.stringify(v)),check={...assert,deepEqual:(a,b,m)=>assert.deepEqual(plain(a),plain(b),m)};
const execute=(body,context)=>vm.runInNewContext(`(async()=>{${body}})()`,context);
const original={sessionId:'owned-session',requestId:'original-intent',entitlementId:'endeavour',targetCoordinate:'6798'};
async function fixture({data=original,endpoint='requestScout',serverResult,http=200,waitFailure,blockUnroute=false,responseHttp=200,responseResult,abortFailure,fallbackFailure,responseAfterHandlerReturn=false}={}) {
 const source=await readFile(path,'utf8');
 const start=source.indexOf('async function installLossAck('),end=source.indexOf('// End of finite lost-ack adapter.',start);
 assert.ok(start>=0&&end>start,'Finite actual-reply interruption adapter must exist.');
 const faults=[],records=[],events=[];let handler,responseWaiter,pendingResponse,responseTimer;
 const adapter=vm.runInNewContext(`(${source.slice(start,end)})`,{assert:{...assert,deepEqual:(a,b,message)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),message)},sid:'owned-session',gm1Instance:'owned-gm',stopped:false,lossAckErrors:faults,lossAcks:records,originalProofError:e=>({name:e.name,message:e.message}),stable:JSON.stringify,URL,Date,setTimeout,clearTimeout,latchLossAckError:(e,endpoint)=>faults.push({endpoint,error:{name:e.name,message:e.message}}),bounded:async(p,ms,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})]);}finally{clearTimeout(timer);}}});
 const surface={label:'ordinary-scientist',page:{route:async(_pattern,value)=>{handler=value;},unroute:async()=>{events.push('unroute');if(blockUnroute)return new Promise(()=>{});},waitForResponse:async predicate=>new Promise((resolve,reject)=>{responseWaiter={predicate,resolve:value=>{clearTimeout(responseTimer);resolve(value);}};if(responseAfterHandlerReturn)responseTimer=setTimeout(()=>reject(new Error('Real transport reply unavailable until the route callback returns')),40);})}};
 const routeFor=(requestData,method='POST')=>({
  request:()=>({method:()=>method,postDataJSON:()=>({data:requestData})}),
  fetch:async()=>{events.push('real fetch');return {status:()=>http,json:async()=>({result:serverResult??{status:'requested',requestId:requestData.requestId}})};},
  abort:async()=>{events.push('abort acknowledgement');if(abortFailure)throw abortFailure;},
  fallback:async()=>{
   events.push('normal fallback');if(fallbackFailure)throw fallbackFailure;
   if(responseWaiter){
    const deliver=()=>{
     const response={url:()=>`http://127.0.0.1:5011/us-central1/${endpoint}`,request:()=>({method:()=>'POST',postDataJSON:()=>({data:requestData})}),status:()=>responseHttp,json:async()=>({result:responseResult??{status:'replayed',requestId:requestData.requestId}})};
     assert.equal(responseWaiter.predicate(response),true);responseWaiter.resolve(response);
    };
    if(responseAfterHandlerReturn)pendingResponse=deliver;else deliver();
   }
  }
 });
 const control=await adapter(surface,endpoint,async()=>{events.push('committed witness');if(waitFailure)throw waitFailure;return {oneResult:true};});
 return {control,faults,records,events,trigger:async(requestData=data,method='POST')=>{await handler(routeFor(requestData,method));if(pendingResponse){const deliver=pendingResponse;pendingResponse=null;deliver();}}};
}

test('Highwall launches only independent normal GM and Miner surfaces',async()=>{
 const end=main.findIndex(n=>n.getText(ast).includes("await mark('normal GM create and consent')"));assert.ok(end>0);const launched=[];
 await execute(main.slice(0,end).map(n=>n.getText(ast)).join('\n'),{mark:async()=>{},launchSurface:async label=>{launched.push(label);return{label};}});
 assert.deepEqual(launched,['browser-A-normal-GM','browser-B-normal-Miner']);
});
test('Highwall admits and assigns only the original normal Miner, without the Engineer/Captain family',async()=>{
 const loop=main.find(n=>ts.isForOfStatement(n)&&n.getText(ast).includes('normalJoin(surface,label)'));assert.ok(loop);const joined=[],assigned=[],entered=[];
 const gm={page:{getByRole:()=>({getByLabel:()=>({selectOption:async role=>assigned.push(role)}),getByRole:()=>({click:async()=>{}})})}};
 await execute(loop.getText(ast),{gm,miner:{label:'Miner'},owner:{label:'Engineer'},recipient:{label:'Captain'},roleIds:{Miner:'icebreaker-miner',Owner:'shepherd-engineer',Recipient:'shepherd-captain'},mark:async()=>{},normalJoin:async(_s,label)=>joined.push(label),observeLifecycleActor:async s=>({displayName:s.label}),action:async(_s,e,choose)=>{assert.equal(e,'assignRole');await choose();},memberReady:async()=>{},enterRole:async(_s,label)=>entered.push(label),claims:[],evidence:{},assert:check});
 assert.deepEqual(joined,['Miner']);assert.deepEqual(assigned,['icebreaker-miner']);assert.deepEqual(entered,['Miner']);
});
test('Highwall keeps five minutes total and the existing one-minute cleanup reserve',async()=>{
 const i=ast.statements.findIndex(n=>n.getText(ast).startsWith('startAt=Date.now()'));assert.ok(i>=0);const context={startAt:null,totalEnd:null,workEnd:null,Date:{now:()=>1000},evidence:{}};
 await execute(ast.statements.slice(i,i+3).map(n=>n.getText(ast)).join('\n'),context);assert.equal(context.totalEnd-context.startAt,300000);assert.equal(context.totalEnd-context.workEnd,60000);
});
const miningRequest={sessionId:'owned-session',requestId:'mining-original',resource:'materials',expectedRevision:0,expectedControlRevision:0,expectedCycle:1};
const miningCommitted={status:'committed',sessionId:'owned-session',requestId:'mining-original',cycle:1,revision:1,operation:{requestId:'mining-original',resource:'materials',rolls:[3],amount:3},cargo:{ore:0,materials:3},actorUid:'miner-uid',actorRoleId:'icebreaker-miner',vesselId:'highwall',hostShipId:'icebreaker',turn:1,phase:'active',idempotencyKey:'mining-original',auditId:'highwall-mining-mining-original'};
const miningFixture=options=>fixture({endpoint:'runHighwallMining',data:miningRequest,serverResult:miningCommitted,responseResult:{...miningCommitted,status:'replayed'},responseAfterHandlerReturn:true,...options});
test('actual interrupted mining transport accepts its original committed receipt with replayed status after callback return',async()=>{
 const f=await miningFixture();try{await f.trigger();const seen=await f.control.settled(1000);assert.equal(seen.confirmedBeforeAbort,true);assert.deepEqual(f.events,['real fetch','committed witness','abort acknowledgement']);f.control.recover();await f.trigger();const recovered=await f.control.recovered(1000);assert.deepEqual(plain(recovered.result),{...miningCommitted,status:'replayed'});assert.equal(f.events.filter(e=>e==='real fetch').length,1);}finally{await f.control.dispose(1000).catch(()=>{});}
});
test('held duplicate mining requests cannot issue a second server fetch',async()=>{
 const f=await miningFixture();await f.trigger();await f.control.settled(1000);await f.trigger();assert.equal(f.events.filter(e=>e==='real fetch').length,1);assert.equal(f.control.record.heldRetries,1);await f.control.dispose(1000);
});
test('changed selected resource cannot enter original mining transport recovery',async()=>{
 const f=await miningFixture();await f.trigger();await f.control.settled(1000);f.control.recover();await f.trigger({...miningRequest,resource:'ore'});assert.equal(f.events.filter(e=>e==='real fetch').length,1);assert.throws(()=>f.control.assertHealthy(),/identity|payload|materials|ore/);await assert.rejects(f.control.dispose(1000));
});
for(const [label,responseResult,responseHttp]of[
 ['changed roll',{...miningCommitted,status:'replayed',operation:{...miningCommitted.operation,rolls:[4],amount:4}},200],
 ['changed actor',{...miningCommitted,status:'replayed',actorUid:'foreign'},200],
 ['denied recovery',{...miningCommitted,status:'replayed'},403],
])test(`mining actual recovery rejects ${label}`,async()=>{
 const f=await miningFixture({responseResult,responseHttp});await f.trigger();await f.control.settled(1000);f.control.recover();await f.trigger();await assert.rejects(f.control.recovered(1000));assert.equal(f.events.filter(e=>e==='real fetch').length,1);await assert.rejects(f.control.dispose(1000));
});
test('normal mining CORS preflight remains untouched and the commit witness precedes abort',async()=>{
 const f=await miningFixture();await f.trigger(miningRequest,'OPTIONS');assert.deepEqual(f.events,['normal fallback']);await f.trigger();await f.control.settled(1000);assert.deepEqual(f.events,['normal fallback','real fetch','committed witness','abort acknowledgement']);await f.control.dispose(1000);
});

// Exercise the actual native witness's first source-bound validation stage.
// Before the new family exists, the real recharge witness demonstrates its
// incompatible payload/result contract. No missing-module/import error is RED.
function witnessValidation(){
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='miningWitness')??ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='rechargeWitness');assert.ok(node);
 const statements=node.body.statements,stop=statements.findIndex(n=>n.getText(ast).startsWith('const [receipt,event,audit'));assert.ok(stop>0);
 const prefix=node.getText(ast).slice(0,node.getText(ast).indexOf('{')+1)+statements.slice(0,stop).map(n=>n.getText(ast)).join('\n')+'}';
 return vm.runInNewContext(`(${prefix})`,{assert:check,sid:'owned-session',actorUids:new Map([['Miner','miner-uid']]),roleIds:{Miner:'icebreaker-miner'},stable:JSON.stringify});
}
const miningBefore={miningState:{cycle:0,revision:0,operations:[]},highwallCargo:{ore:0,materials:0},fuelled:false,control:{revision:0},hostMaintenance:{revision:8,results:{'5':'Reactor powered up. Previous unused charge lost. Charged 1/3 consoles.'}}};
test('the actual mining witness accepts real 1d6 materials and exact zero-to-one revision/cargo transition',async()=>{await witnessValidation()(miningRequest,miningCommitted,miningBefore,Date.now()+1000);});
for(const [label,change]of[
 ['foreign actor',{actorUid:'foreign'}],['wrong request',{requestId:'foreign'}],
 ['amount unequal to dice',{operation:{...miningCommitted.operation,amount:4}}],
 ['out-of-range die',{operation:{...miningCommitted.operation,rolls:[7],amount:7}}],
 ['wrong cargo increment',{cargo:{ore:0,materials:4}}],
 ['wrong number of dice',{operation:{...miningCommitted.operation,rolls:[1,1,1],amount:3}}],
])test(`the real mining validation rejects ${label}`,async()=>{await assert.rejects(witnessValidation()(miningRequest,{...miningCommitted,...change},miningBefore,Date.now()+1000));});

async function completeMiningWitness({missingReceipt=false,foreignEvent=false,unrelatedMutation=false}={}){
 const first={requestId:'mining-original',resource:'materials',rolls:[3],amount:3};
 const data={...miningRequest,requestId:'mining-ore',resource:'ore',expectedRevision:1};
 const reply={...miningCommitted,requestId:'mining-ore',idempotencyKey:'mining-ore',auditId:'highwall-mining-mining-ore',revision:2,operation:{requestId:'mining-ore',resource:'ore',rolls:[2,5,1],amount:8},cargo:{ore:8,materials:3}};
 const control={shuttleId:'highwall',ownerRoleId:'icebreaker-miner',ownerUid:'miner-uid',holderUid:'miner-uid',revision:0},dockings=[{shuttleId:'highwall',shipId:'icebreaker',dockedAt:'original'}];
 const miningState={cycle:1,revision:1,operations:[first]},cargo={ore:0,materials:3};
 const substantive={phase:'active',currentTurn:1,shipResources:{icebreaker:{ore:10,fuel:4}},highwallMining:miningState,shuttleCargo:{highwall:cargo,'black-sheep':{food:1}},shuttleControl:{highwall:control},shuttleDockings:dockings,shuttleFuelled:{}};
 const collections={commandReceipts:{count:1,sha256:'receipt-before'},actionAudits:{count:1,sha256:'audit-before'},miningEvents:{count:1,sha256:'event-before'},shuttleControlRequests:{count:0,sha256:'same-control'},shuttleControlAudit:{count:0,sha256:'same-control-audit'},shuttleDepartures:{count:0,sha256:'same-departures'},shuttleTransitChains:{count:0,sha256:'same-chains'}};
 const before={...miningBefore,miningState,highwallCargo:cargo,control,dockings,substantive,collectionHashes:collections};
 const after=plain(before);after.miningState={cycle:1,revision:2,operations:[first,reply.operation]};after.highwallCargo=reply.cargo;after.substantive.highwallMining=after.miningState;after.substantive.shuttleCargo.highwall=reply.cargo;
 if(unrelatedMutation)after.substantive.shipResources.icebreaker.fuel=3;
 for(const n of ['commandReceipts','actionAudits','miningEvents'])after.collectionHashes[n]={count:2,sha256:`${n}-after`};
 const rows={
  'commandReceipts/mining-ore':{fingerprint:{kind:'highwall-mining',sessionId:'owned-session',actorUid:'miner-uid',requestId:'mining-ore',resource:'ore',expectedRevision:1,expectedControlRevision:0,hostShipId:'icebreaker',cycle:1},result:reply,serverRolls:[2,5,1]},
  'events/highwall-mining-mining-ore':{type:'highwall-mining',sessionId:'owned-session',actorUid:foreignEvent?'foreign':'miner-uid',actorRoleId:'icebreaker-miner',requestId:'mining-ore',turn:1,phase:'active',revision:2,visibility:'member',shuttleId:'highwall',resource:'ore',rolls:[2,5,1],amount:8,operation:2},
  'actionAudits/mining-ore':{actorUid:'miner-uid',actorRoleId:'icebreaker-miner',sessionId:'owned-session',action:'highwall-mining',requestId:'mining-ore',phase:'active',revision:2,outcome:'committed',resolutionSource:'server-random',redactionPolicy:'action-audit-metadata-only-v1'},
 };
 const db={doc:p=>{assert.ok(p.startsWith('sessions/owned-session/'));const key=p.slice('sessions/owned-session/'.length),v=rows[key];return{get:async()=>({exists:!!v&&!(missingReceipt&&key.startsWith('commandReceipts/')),get:field=>field.split('.').reduce((a,k)=>a?.[k],v),data:()=>v})};}};
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='miningWitness')??ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='rechargeWitness');assert.ok(fn);
 const consume=vm.runInNewContext(`(${fn.getText(ast)})`,{assert:check,sid:'owned-session',actorUids:new Map([['Miner','miner-uid']]),roleIds:{Miner:'icebreaker-miner'},db,stable:JSON.stringify,hash:String,candidateWait:run=>run(),ownedWorld:async()=>after});
 return consume(data,reply,before,Date.now()+1000);
}
test('the full actual witness binds 3d6 ore, receipt, event, metadata audit and only its cargo/state effects',async()=>{const seen=await completeMiningWitness();assert.equal(seen.committedWorld.miningState.revision,2);assert.deepEqual(plain(seen.committedWorld.highwallCargo),{ore:8,materials:3});});
for(const [label,fault]of[['missing bound receipt',{missingReceipt:true}],['foreign event actor',{foreignEvent:true}],['unrelated fuel debit',{unrelatedMutation:true}]])test(`the full real mining witness rejects ${label}`,async()=>{await assert.rejects(completeMiningWitness(fault));});
