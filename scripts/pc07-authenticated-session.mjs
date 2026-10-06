import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {localGmAccessConfiguration,grantLocalGmAccess} from './local-gm-access.mjs';
import {buildPc07ExplicitLoyaltyAssignments} from './pc07-explicit-loyalty-setup.mjs';
import {createFixtureHeartbeatController} from './fixture-heartbeats.mjs';
import {createPc10CallableTrace,observePc10CallableTrace} from './pc10-proof-diagnostics.mjs';
export {createFixtureHeartbeatController} from './fixture-heartbeats.mjs';

/** Proof metadata has no credentials, freeform values, or operational/private projections. */
export function buildFixtureCallableObservation({name,transport,actorUid,sessionId,startedAt,completedAt,status,reply}={}) {
 assert.match(name??'',/^[A-Za-z][\w]{0,99}$/);
 assert.ok(['authenticated-emulator-HTTP','independent-browser-SDK'].includes(transport));
 const hash=(kind,value)=>typeof value==='string'&&/^[\w-]{1,128}$/.test(value)
  ?createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex'):null;
 const result=reply?.result??reply?.data;
 const player=result?.player;
 const generation=result?.connectionGeneration??player?.connectionGeneration;
 const codes=['UNAUTHENTICATED','PERMISSION_DENIED','INVALID_ARGUMENT','RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION','NOT_FOUND','ABORTED','UNAVAILABLE','DEADLINE_EXCEEDED','INTERNAL'];
 return {name,transport,startedAt,completedAt,durationMs:completedAt-startedAt,status,
  actorHash:hash('actor',actorUid??result?.actorUid??player?.uid),
  sessionHash:hash('session',sessionId??result?.sessionId??result?.session?.id),
  groupHash:hash('group',result?.groupId??player?.fleetGroupId),
  connectionGeneration:Number.isSafeInteger(generation)&&generation>=1?generation:null,
  denialCode:codes.includes(reply?.error?.status)?reply.error.status:null,
  denialCategory:['rate-limit-state-invalid','rate-limited'].includes(reply?.error?.details?.commandError)
   ?reply.error.details.commandError:null};
}

/** Diagnose a failed fixture before its own data is removed; always retain that failure. */
export async function finishFailedPc07Fixture(error,{observeFailure,cleanup}) {
 try{if(observeFailure)await observeFailure();}
 catch{error.pc07FailureObservationUnavailable=true;}
 try{await cleanup();error.pc07FailureCleanupComplete=true;}
 catch(cleanupError){error.pc07FailureCleanupUnavailable=true;error.pc07FailureCleanupError=cleanupError;}
 throw error;
}

/** A native proof request must fail observably instead of waiting indefinitely.
 * There is no transport retry; production callable limits are unchanged. */
export async function performFixtureCallable({origin,project,actor,name,data,timeoutMs=60_000,onCallableIssued,onCallableObservation}) {
 const signal=AbortSignal.timeout(timeoutMs);
 const startedAt=Date.now();
 const trace=createPc10CallableTrace({name,transport:'authenticated-emulator-HTTP',data,
  actorUid:actor.localId,startedAt});
 let terminalObservationSent=false;
 if(trace&&onCallableIssued)onCallableIssued({...trace});
 try{
  const response=await fetch(`${origin}/${project}/us-central1/${name}`,{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.idToken}`},
   body:JSON.stringify({data}),signal,
  });
  if(trace)observePc10CallableTrace(trace,{stage:'headers',at:Date.now(),status:response.status});
  const reply={status:response.status,...await response.json()};
  const completedAt=Date.now();
  if(trace)observePc10CallableTrace(trace,{stage:'body',at:completedAt,reply});
  terminalObservationSent=true;
  if(onCallableObservation)onCallableObservation({...trace,...buildFixtureCallableObservation({name,
   transport:'authenticated-emulator-HTTP',actorUid:actor.localId,sessionId:data?.sessionId,
   startedAt,completedAt,status:reply.status,reply})});
  return reply;
 }catch(error){
  const failure=signal.aborted
   ?new Error(`Local fixture callable ${name} exceeded ${timeoutMs}ms without a reply.`):error;
  if(trace&&!terminalObservationSent){
   observePc10CallableTrace(trace,{stage:trace.headersReceivedAt!==null&&!signal.aborted?'body-unavailable':'failed',at:Date.now()});
   try{if(onCallableObservation)onCallableObservation({...trace});}
   catch{failure.pc07CallableObservationUnavailable=true;}
  }
  throw failure;
 }
}

/** Actual browser clients must control their own presence in disconnect proof.
 * A synthetic keep-alive must not silently keep an offline browser connected. */
export function shouldMaintainFixturePresence({ browserControlled, browserOwnsPresence = false,
 serializeFixtureCalls = false } = {}) {
 return !browserControlled || (!browserOwnsPresence && !serializeFixtureCalls);
}

/** Join actual browser clients into selected printed core seats before assigning the other actors. */
export async function joinConfiguredBrowserPlayers({roles,players,joinCode,browserRoleId,joinBrowserPlayer,joinBrowserPlayers}={}) {
 const configured=new Map();
 if(joinBrowserPlayers!==undefined){
  assert.ok(joinBrowserPlayers&&typeof joinBrowserPlayers==='object'&&!Array.isArray(joinBrowserPlayers),
   'Browser core players must be provided as a role-to-join-function mapping.');
  for(const [roleId,join]of Object.entries(joinBrowserPlayers)){
   assert.equal(typeof join,'function',`Browser join for ${roleId} must be a function.`);
   configured.set(roleId,join);
  }
 }
 if(joinBrowserPlayer!==undefined){
  assert.equal(typeof joinBrowserPlayer,'function','The singular browser join must be a function.');
  assert.ok(browserRoleId,'The singular browser join requires a printed core role.');
  assert.ok(!configured.has(browserRoleId),`${browserRoleId} must be configured once.`);
  configured.set(browserRoleId,joinBrowserPlayer);
 }
 const browserIndexes=new Set();
 for(const [roleId,join]of configured){
  const index=roles.indexOf(roleId);
  assert.ok(index>=0,`${roleId} must be a printed core station.`);
  assert.ok(players[index],`An authenticated player must occupy ${roleId}.`);
  const browserActor=await join(joinCode);
  assert.ok(browserActor&&typeof browserActor==='object'&&browserActor.localId,
   `The browser join for ${roleId} must return its authenticated player actor.`);
  players[index]=browserActor;
  browserIndexes.add(index);
 }
 return browserIndexes;
}

/** Normal local Auth/HTTP setup. Tokens stay in memory and never enter evidence. */
export async function createPc07AuthenticatedSession(name,playerCount=8,{clearBriefing=true,keepAlive=false,serializeFixtureCalls=false,browserOwnsPresence=false,expansion='base',capybaraEnabled=expansion==='capybara',fullGameManual=false,chartId='A',turnLimit=6,browserRoleId,joinBrowserPlayer,joinBrowserPlayers,joinPressPlayer,activeRoleIdsOverride,unionCraftStartingHosts={},explicitLoyaltySetup,onCallableIssued,onCallableObservation,beforeFailureCleanup,beforeFailureDeletion}={}) {
 const env=Object.fromEntries((await readFile('.env.emulators.local','utf8')).trim().split('\n').map(line=>line.split('=')));
 const project=process.env.VITE_FIREBASE_PROJECT_ID;
 const config=localGmAccessConfiguration('serve',{...env,VITE_LOCAL_GM_ACCESS:'1',VITE_FIREBASE_PROJECT_ID:project});
 if(!config)throw Error('Explicit demo project and isolated emulator ports required.');
 const functionsPort=Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT);
 const require=createRequire(new URL('../functions/package.json',import.meta.url));
 const {recommendedRoleIds}=require('../functions/lib/roleConfiguration.js');
 const {getFirestore}=require('firebase-admin/firestore');
 const {initializeApp,getApps}=require('firebase-admin/app');
 process.env.FIRESTORE_EMULATOR_HOST=`127.0.0.1:${config.firestorePort}`;
 if(!getApps().length)initializeApp({projectId:project});const db=getFirestore();
 async function actor(){const r=await fetch(`http://127.0.0.1:${config.authPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});assert.equal(r.status,200);return r.json();}
 const disconnected=new Set();
 let pendingFixtureCall=Promise.resolve();
 async function performCall(actor,name,data){const reply=await performFixtureCallable({origin:`http://127.0.0.1:${functionsPort}`,project,actor,name,data,onCallableIssued,onCallableObservation});
  if(reply.status===200){if(name==='disconnectFromSession')disconnected.add(actor.localId);if(name==='resumeSession')disconnected.delete(actor.localId);}
  return reply;}
 function call(actor,name,data){
  if(!serializeFixtureCalls)return performCall(actor,name,data);
  // Serialize synthetic API actors and their keep-alive calls. Real browser
  // requests remain ordinary independent SDK calls; no failed request retries
  // or result assertions are hidden by this local proof option.
  const next=pendingFixtureCall.then(()=>performCall(actor,name,data));
  pendingFixtureCall=next.catch(()=>undefined);
  return next;
 }
 function ok(reply,step){assert.equal(reply.status,200,`${step}: ${reply.error?.message}`);return reply.result;}
 const gm=await actor(),players=await Promise.all(Array.from({length:playerCount},actor));
 const created=ok(await call(gm,'createSession',{requestId:randomUUID(),joinCodeVersion:2,name}),'create');
 const sessionId=created.session.id,session=db.doc(`sessions/${sessionId}`),instanceId='pc07-local-proof';
 const heartbeatPlayers=new Map(),heartbeatFailures=[];
 let gmHeartbeatPending=Promise.resolve(),playerHeartbeatPending=Promise.resolve();
 function queueGmHeartbeat(running){
  gmHeartbeatPending=gmHeartbeatPending.catch(error=>{
   heartbeatFailures.push({actor:'gm-heartbeat-loop',message:String(error?.message??error)});
  }).then(async()=>{
   if(!running()||disconnected.has(gm.localId))return;
   try{
    const reply=await call(gm,'refreshPresence',{sessionId,instanceId});
    if(reply.status!==200)heartbeatFailures.push({actor:'gm',status:reply.status,
     message:String(reply.error?.message??'presence refresh failed')});
   }catch(error){heartbeatFailures.push({actor:'gm',message:String(error?.message??error)});}
  });
  return gmHeartbeatPending;
 }
 function queuePlayerHeartbeats(running){
  playerHeartbeatPending=playerHeartbeatPending.catch(error=>{
   heartbeatFailures.push({actor:'player-heartbeat-loop',message:String(error?.message??error)});
  }).then(async()=>{
   for(const {actor:player,label} of heartbeatPlayers.values()){
    if(!running())return;
    if(disconnected.has(player.localId))continue;
    try{
     const reply=await call(player,'refreshPresence',{sessionId});
     if(reply.status!==200)heartbeatFailures.push({actor:label,status:reply.status,
      message:String(reply.error?.message??'presence refresh failed')});
    }catch(error){heartbeatFailures.push({actor:label,message:String(error?.message??error)});}
   }
  });
  return playerHeartbeatPending;
 }
 const heartbeats=createFixtureHeartbeatController({gmTick:queueGmHeartbeat,playerTick:queuePlayerHeartbeats});
 function startHeartbeat(){if(keepAlive)heartbeats.start();}
 let failureContext;
 try{
  const appOrigin=process.env.PC07_LOCAL_GM_ORIGIN??'http://127.0.0.1:5174';
  await grantLocalGmAccess(config,{method:'POST',host:new URL(appOrigin).host,origin:appOrigin,remoteAddress:'127.0.0.1',token:gm.idToken});
  ok(await call(gm,'claimGmInstance',{sessionId,instanceId,name:'Local facilitator',deviceLabel:'PC07 HTTP proof'}),'GM claim');
  startHeartbeat();
  const roles=activeRoleIdsOverride??recommendedRoleIds(playerCount);
  const seatClaimRequests={};
  failureContext={db,project,sessionId,instanceId,gm,players,roles,seatClaimRequests};
  const explicitAssignments=explicitLoyaltySetup
   ?buildPc07ExplicitLoyaltyAssignments(roles,explicitLoyaltySetup):null;
  const confirmed=ok(await call(gm,'confirmSetup',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:created.session.setupRevision??0,playerCount,chartId,lockChart:true,expansion,turnLimit,dioneEnabled:playerCount>=12,capybaraEnabled,universalArbourEnabled:false,wolfCultEnabled:explicitLoyaltySetup!==undefined,activeRoleIds:roles}),'confirm');
  let setupRevision=(await session.get()).get('setupRevision')??confirmed.setupRevision??created.session.setupRevision??0;
  if(fullGameManual){
   // The actual live GM permanently prepares the fresh training session
   // before any ordinary player joins. No chart or timer state is seeded.
   const prepared=ok(await call(gm,'prepareFullGameDemo',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:setupRevision}),'prepare full-game demo');
   assert.equal(prepared.status,'committed');
   assert.deepEqual(prepared.fullGameDemo,{status:'preparing',progression:'manual'});
  }
  const unionCraftSetupProof=[];
  for(const [craftId,hostShipId]of Object.entries(unionCraftStartingHosts)){
   const expectedSetupRevision=setupRevision;
   const requestId=randomUUID();
   const request={sessionId,instanceId,requestId,expectedSetupRevision,craftId,hostShipId};
   const initialized=ok(await call(gm,'setUnionCraftStartingHost',request),'initialize '+craftId);
   assert.equal(initialized.status,'committed');
   const beforeReplay=await session.get();
   const replay=ok(await call(gm,'setUnionCraftStartingHost',request),'replay '+craftId);
   assert.deepEqual(replay,initialized,'An exact Union retry returns the original committed receipt.');
   const afterReplay=await session.get();
   assert.equal(afterReplay.get('setupRevision'),initialized.setupRevision,
    'An exact Union retry must not advance setup twice.');
   assert.deepEqual(afterReplay.get('shuttleDockings'),beforeReplay.get('shuttleDockings'),
    'An exact Union retry must not rewrite the starting docking.');
   const otherLegalHost=craftId==='wobbly'?'refinery-124':'icebreaker';
   const stale=await call(gm,'setUnionCraftStartingHost',{...request,requestId:randomUUID(),
    expectedSetupRevision,hostShipId:otherLegalHost});
   assert.notEqual(stale.status,200,'A stale Union host write must be rejected.');
   assert.equal((await session.get()).get('setupRevision'),initialized.setupRevision,
    'A stale Union host write must not advance the setup revision.');
   unionCraftSetupProof.push({craftId,hostShipId,requestId,firstStatus:initialized.status,
    replayStatus:replay.status,replayDidNotAdvanceRevision:true,replayPreservedDockings:true,
    staleHostDenied:true,setupRevision:initialized.setupRevision});
   setupRevision=initialized.setupRevision;
  }
  const browserIndexes=await joinConfiguredBrowserPlayers({roles,players,joinCode:created.session.joinCode,
   browserRoleId,joinBrowserPlayer,joinBrowserPlayers});
  for(const [i,player]of players.entries()){
   if(!browserIndexes.has(i))ok(await call(player,'joinSession',{joinCode:created.session.joinCode,displayName:`Local actor ${i+1}`}), 'join');
   ok(await call(gm,'assignRole',{sessionId,instanceId,requestId:randomUUID(),targetUid:player.localId,roleId:roles[i]}),'cast');
   const current=ok(await call(player,'resumeSession',{sessionId}),'resume');
   const seatClaimRequest={sessionId,seatId:roles[i],requestId:randomUUID(),expectedSetupRevision:current.session.setupRevision};
   ok(await call(player,'claimSeat',seatClaimRequest),'seat');
   seatClaimRequests[roles[i]]=Object.freeze(seatClaimRequest);
   ok(await call(player,'refreshPresence',{sessionId,activeConsoleRoleId:roles[i]}),'console');
   if(shouldMaintainFixturePresence({browserControlled:browserIndexes.has(i),browserOwnsPresence,serializeFixtureCalls})){
    heartbeatPlayers.set(player.localId,{actor:player,label:`player-${i+1}`});
   }
  }
  const explicitLoyaltySetupProof=[];
  if(explicitAssignments){
   const setupOrder=[...explicitAssignments].sort((left,right)=>{
    const order=kind=>kind==='wolf-agent'?0:kind==='wolf-cult'?1:kind==='intelligence-agent'?2:3;
    return order(left.kind)-order(right.kind);
   });
   for(const assignment of setupOrder){
    const player=players[roles.indexOf(assignment.roleId)];
    assert.ok(player,`An occupied player must hold ${assignment.roleId}.`);
    const result=ok(await call(gm,'assignLoyalty',{sessionId,instanceId,requestId:randomUUID(),
     targetUid:player.localId,kind:assignment.kind,suspicion:assignment.suspicion}),
     `assign ${assignment.kind} to ${assignment.roleId}`);
    explicitLoyaltySetupProof.push({roleId:assignment.roleId,kind:assignment.kind,
     suspicion:assignment.suspicion,targetUid:player.localId,setupRevision:result.setupRevision});
   }
  }
  const press=joinPressPlayer?await joinPressPlayer(created.session.joinCode):undefined;
  failureContext.press=press;
  if(press){ok(await call(press,'refreshPresence',{sessionId,activeConsoleRoleId:'press-officer'}),'Press claim');
   if(shouldMaintainFixturePresence({browserControlled:true,browserOwnsPresence,serializeFixtureCalls})){
    heartbeatPlayers.set(press.localId,{actor:press,label:'press'});}}
  const current=ok(await call(gm,'resumeSession',{sessionId,instanceId}),'GM resume');
  ok(await call(gm,'startGame',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:current.session.setupRevision,
   ...(fullGameManual?{fullGameDemo:true}:{})}),'start');
  const hold=(await session.get()).get('turnPhase').timerPause;
  if(fullGameManual){
   assert.equal(hold,undefined,'A fresh unlimited manual demo has no timed briefing hold.');
  }else if(clearBriefing)ok(await call(players[0],'clearTurnAdvanceInterstitial',{sessionId,expectedCycle:1,expectedPausedAt:hold.pausedAt,requestId:randomUUID()}),'briefing clear');
  const loyaltyActors=explicitLoyaltySetup?{
   wolfAgent:players[roles.indexOf(explicitLoyaltySetup.wolfAgentRoleId)],
   wolfCult:players[roles.indexOf(explicitLoyaltySetup.wolfCultRoleId)],
   intelligenceAgent:players[roles.indexOf(explicitLoyaltySetup.intelligenceAgentRoleId)],
  }:undefined;
  return{db,config,project,gm,players,press,roles,seatClaimRequests:Object.freeze(seatClaimRequests),unionCraftSetupProof,explicitLoyaltySetupProof,
   loyaltyActors,heartbeatFailures,sessionId,session,instanceId,call,ok,
   byRole:role=>players[roles.indexOf(role)],byLoyalty:kind=>loyaltyActors?.[kind],
   stopHeartbeats:()=>heartbeats.stop(),restartHeartbeats:startHeartbeat,cleanup:async()=>{
    await heartbeats.stop();
    await db.recursiveDelete(session);
   }};
 }catch(error){
  return finishFailedPc07Fixture(error,{
   observeFailure:beforeFailureCleanup&&failureContext?()=>beforeFailureCleanup(failureContext,error):undefined,
   cleanup:async()=>{
    await heartbeats.stop();
    // This release barrier is independent of the best-effort observer. A
    // rejected or pending browser close must never authorize SID deletion.
    if(beforeFailureDeletion)await beforeFailureDeletion();
    await db.recursiveDelete(session);
   },
  });
 }
}
