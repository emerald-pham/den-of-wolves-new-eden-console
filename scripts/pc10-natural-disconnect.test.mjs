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
