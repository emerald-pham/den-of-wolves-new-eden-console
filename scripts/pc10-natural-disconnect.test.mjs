import assert from 'node:assert/strict';
import test from 'node:test';

async function proof() { return import('./pc10-natural-disconnect.mjs'); }
const at=milliseconds=>new Date(milliseconds).toISOString();
const phase={turn:1,teamPhaseEndsAt:at(300000),openAirspaceEndsAt:at(600000),
 airspace:{state:'restricted',tickerActive:true,pressAccess:false}};
const before={currentTurn:1,phase:'active',turnPhase:phase,connectedPlayers:9,liveGmInstances:1};
const paused={currentTurn:1,phase:'active',connectedPlayers:0,liveGmInstances:0,
 turnPhase:{...phase,timerPause:{reason:'empty-session',window:'restricted',remainingMs:250000,pausedAt:at(50000)}}};

test('acceptance requires every player and the GM lease to expire naturally',async()=>{
 const {assertNaturalDisconnectState}=await proof();
 assert.doesNotThrow(()=>assertNaturalDisconnectState(before,paused,structuredClone(paused)));
 assert.throws(()=>assertNaturalDisconnectState(before,{...paused,connectedPlayers:1},paused),/connected/i);
 assert.throws(()=>assertNaturalDisconnectState(before,{...paused,liveGmInstances:1},paused),/GM/i);
});

test('the empty-session pause must preserve remaining time and cycle across actual elapsed time',async()=>{
 const {assertNaturalDisconnectState}=await proof();
 assert.throws(()=>assertNaturalDisconnectState(before,paused,{...paused,currentTurn:2}),/cycle|turn/i);
 assert.throws(()=>assertNaturalDisconnectState(before,paused,{...paused,
  turnPhase:{...paused.turnPhase,timerPause:{...paused.turnPhase.timerPause,remainingMs:249999}}}),/stable|remaining|phase/i);
 assert.throws(()=>assertNaturalDisconnectState(before,{...paused,
  turnPhase:{...paused.turnPhase,timerPause:{...paused.turnPhase.timerPause,reason:'turn-interstitial'}}},paused),/empty-session/i);
});

test('remaining time must match the real deadline at pause rather than a seeded constant',async()=>{
 const {assertNaturalDisconnectState}=await proof();
 const forged={...paused,turnPhase:{...paused.turnPhase,
  timerPause:{...paused.turnPhase.timerPause,remainingMs:300000}}};
 assert.throws(()=>assertNaturalDisconnectState(before,forged,forged),/remaining/i);
});

test('normal resume shifts the clock once and later seat/GM recovery cannot shift it again',async()=>{
 const {assertNaturalRecoveryState}=await proof();
 const restored={currentTurn:1,phase:'active',turnPhase:{...phase,
  teamPhaseEndsAt:at(303000),openAirspaceEndsAt:at(603000)}};
 const timing={startedAt:52990,completedAt:53010};
 assert.doesNotThrow(()=>assertNaturalRecoveryState(paused,restored,structuredClone(restored),timing));
 assert.throws(()=>assertNaturalRecoveryState(paused,restored,{...restored,
  turnPhase:{...restored.turnPhase,teamPhaseEndsAt:at(304000)}},timing),/twice|again|stable|phase/i);
 assert.throws(()=>assertNaturalRecoveryState(paused,{...restored,currentTurn:2},restored,timing),/cycle|turn/i);
 assert.throws(()=>assertNaturalRecoveryState(paused,{...restored,turnPhase:phase},restored,timing),/remaining|clock|deadline/i);
});

test('the global scheduler is blocked whenever another table has a connected actor or GM instance',async()=>{
 const {assertSchedulerSessionScope}=await proof();
 const own={ref:{path:'sessions/owned/players/actor'},get:()=>true};
 const ownGm={ref:{path:'sessions/owned/gmInstances/device'},get:()=>true};
 const foreign={ref:{path:'sessions/foreign/players/actor'},get:()=>true};
 assert.doesNotThrow(()=>assertSchedulerSessionScope('owned',[own],[ownGm]));
 assert.throws(()=>assertSchedulerSessionScope('owned',[own,foreign],[ownGm]),/another session/i);
 assert.throws(()=>assertSchedulerSessionScope('owned',[own],[{ref:{path:'sessions/foreign/gmInstances/device'},get:()=>true}]),/another session/i);
});

test('active recovery verifies the seat reclaimed by resume rather than sending a new casting command',async()=>{
 const {assertReturnedCoreStation}=await proof();
 assert.equal(typeof assertReturnedCoreStation,'function','Verify the actual returning seat without bypassing the casting lock.');
 // The real resume reply intentionally omits connected; use the authoritative
 // own player document for that assertion without changing the reply contract.
 const reply={player:{assignedRoleId:'admiral',seatId:'admiral'}};
 const player={id:'same-actor',get:field=>field==='connected'?true:undefined};
 const seat={exists:true,get:field=>({roleId:'admiral',status:'claimed',holderUid:'same-actor'})[field]};
 assert.doesNotThrow(()=>assertReturnedCoreStation({roleId:'admiral',uid:'same-actor',reply,seat,player}));
 assert.throws(()=>assertReturnedCoreStation({roleId:'admiral',uid:'different-actor',reply,seat,player}),/identity|UID|actor/i);
 assert.throws(()=>assertReturnedCoreStation({roleId:'admiral',uid:'same-actor',reply,
  seat:{...seat,get:field=>field==='status'?'open':seat.get(field)},player}),/claimed|seat/i);
 assert.throws(()=>assertReturnedCoreStation({roleId:'admiral',uid:'same-actor',reply,seat,
  player:{...player,get:()=>false}}),/connected/i);
});

test('a failed overlapping proof batch still drains every actual in-flight request before cleanup',async()=>{
 const {awaitProofBatch}=await proof();
 assert.equal(typeof awaitProofBatch,'function','An assertion failure cannot leave unobserved SDK transports running.');
 let complete;
 const unfinished=new Promise(resolve=>{complete=resolve;});
 let drained=false;
 const result=awaitProofBatch([Promise.reject(new Error('Actual local SDK denial.')),unfinished]);
 const observation=result.then(()=>{drained=true;},()=>{drained=true;});
 await Promise.resolve();await Promise.resolve();
 assert.equal(drained,false);
 complete('observed successful operation');
 await assert.rejects(result,/Actual local SDK denial/);
 await observation;
 assert.equal(drained,true);
});

test('native setup maintains ordinary uncast identities and drains that presence before the real lease wait',async()=>{
 const {createNativeSetupPresence}=await proof();
 assert.equal(typeof createNativeSetupPresence,'function','Native setup must supply the normal presence real browsers already send.');
 const timers=new Map(),calls=[];
 let next=0,release;
 const presence=createNativeSetupPresence({setInterval:callback=>{const id=++next;timers.set(id,callback);return id;},
  clearInterval:id=>timers.delete(id)});
 presence.add({roleId:'admiral',sessionId:'own-session',callable:async(name,data)=>{
  calls.push({name,data});await new Promise(resolve=>{release=resolve;});return {status:200};
 }});
 [...timers.values()][1]();
 await Promise.resolve();
 assert.deepEqual(calls,[{name:'refreshPresence',data:{sessionId:'own-session'}}],
  'An uncast SDK actor may renew membership without claiming any console or injecting a timestamp.');
 let drained=false;
 const stopped=presence.stop().then(()=>{drained=true;});
 await Promise.resolve();assert.equal(drained,false);
 release();await stopped;
 assert.equal(timers.size,0);assert.equal(drained,true);
});

test('natural disappearance and recovery use each actual browser observation boundary exactly once',async()=>{
 const {setProofBrowsersOffline}=await proof();
 assert.equal(typeof setProofBrowsersOffline,'function',
  'Natural lease proof must record the actual offline interval through each mounted browser adapter.');
 const calls=[];
 const clients=new Map(['admiral','press-officer'].map(role=>[role,{
  context:{setOffline:()=>{throw new Error('Raw context call bypasses the transport evidence boundary.');}},
  setOffline:async value=>{calls.push({role,value});},
 }]));
 await setProofBrowsersOffline(clients,true);
 await setProofBrowsersOffline(clients,false);
 assert.deepEqual(calls,[{role:'admiral',value:true},{role:'press-officer',value:true},
  {role:'admiral',value:false},{role:'press-officer',value:false}]);
});

test('a rejected natural offline boundary drains its siblings and preserves the actual transition error',async()=>{
 const {setProofBrowsersOffline}=await proof();
 assert.equal(typeof setProofBrowsersOffline,'function');
 const actualError=new Error('Actual browser offline transition failed.');
 let release,drained=false;
 const clients=new Map([['admiral',{setOffline:async()=>{throw actualError;}}],
  ['press-officer',{setOffline:async()=>{await new Promise(resolve=>{release=resolve;});}}]]);
 const result=setProofBrowsersOffline(clients,true);
 const observation=result.then(()=>{drained=true;},()=>{drained=true;});
 await Promise.resolve();await Promise.resolve();
 assert.equal(drained,false,'Do not leave another actual transport transition unobserved.');
 release();
 await assert.rejects(result,error=>error===actualError);
 await observation;
 assert.equal(drained,true);
});
