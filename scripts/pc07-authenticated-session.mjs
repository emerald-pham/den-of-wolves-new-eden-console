import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {localGmAccessConfiguration,grantLocalGmAccess} from './local-gm-access.mjs';

/** Normal local Auth/HTTP setup. Tokens stay in memory and never enter evidence. */
export async function createPc07AuthenticatedSession(name,playerCount=8,{clearBriefing=true,keepAlive=false,expansion='base',capybaraEnabled=expansion==='capybara',browserRoleId,joinBrowserPlayer,joinPressPlayer,activeRoleIdsOverride,unionCraftStartingHosts={}}={}) {
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
 async function call(actor,name,data){const r=await fetch(`http://127.0.0.1:${functionsPort}/${project}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.idToken}`},body:JSON.stringify({data})});const reply={status:r.status,...await r.json()};
  if(r.status===200){if(name==='disconnectFromSession')disconnected.add(actor.localId);if(name==='resumeSession')disconnected.delete(actor.localId);}
  return reply;}
 function ok(reply,step){assert.equal(reply.status,200,`${step}: ${reply.error?.message}`);return reply.result;}
 const gm=await actor(),players=await Promise.all(Array.from({length:playerCount},actor));
 const created=ok(await call(gm,'createSession',{requestId:randomUUID(),joinCodeVersion:2,name}),'create');
 const sessionId=created.session.id,session=db.doc(`sessions/${sessionId}`),instanceId='pc07-local-proof';
 const heartbeatPlayers=new Map(),heartbeatFailures=[];
 let gmHeartbeat,playerHeartbeat,gmHeartbeatPending=Promise.resolve(),playerHeartbeatPending=Promise.resolve();
 function queueGmHeartbeat(){
  gmHeartbeatPending=gmHeartbeatPending.catch(error=>{
   heartbeatFailures.push({actor:'gm-heartbeat-loop',message:String(error?.message??error)});
  }).then(async()=>{
   if(disconnected.has(gm.localId))return;
   try{
    const reply=await call(gm,'refreshPresence',{sessionId,instanceId});
    if(reply.status!==200)heartbeatFailures.push({actor:'gm',status:reply.status,
     message:String(reply.error?.message??'presence refresh failed')});
   }catch(error){heartbeatFailures.push({actor:'gm',message:String(error?.message??error)});}
  });
 }
 function queuePlayerHeartbeats(){
  playerHeartbeatPending=playerHeartbeatPending.catch(error=>{
   heartbeatFailures.push({actor:'player-heartbeat-loop',message:String(error?.message??error)});
  }).then(async()=>{
   for(const {actor:player,label} of heartbeatPlayers.values()){
    if(disconnected.has(player.localId))continue;
    try{
     const reply=await call(player,'refreshPresence',{sessionId});
     if(reply.status!==200)heartbeatFailures.push({actor:label,status:reply.status,
      message:String(reply.error?.message??'presence refresh failed')});
    }catch(error){heartbeatFailures.push({actor:label,message:String(error?.message??error)});}
   }
  });
 }
 function startHeartbeat(){if(!keepAlive||gmHeartbeat)return;
  gmHeartbeat=setInterval(queueGmHeartbeat,10000);
  playerHeartbeat=setInterval(queuePlayerHeartbeats,10000);
 }
 try{
  const appOrigin=process.env.PC07_LOCAL_GM_ORIGIN??'http://127.0.0.1:5174';
  await grantLocalGmAccess(config,{method:'POST',host:new URL(appOrigin).host,origin:appOrigin,remoteAddress:'127.0.0.1',token:gm.idToken});
  ok(await call(gm,'claimGmInstance',{sessionId,instanceId,name:'Local facilitator',deviceLabel:'PC07 HTTP proof'}),'GM claim');
  startHeartbeat();
  const roles=activeRoleIdsOverride??recommendedRoleIds(playerCount);
  const confirmed=ok(await call(gm,'confirmSetup',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:created.session.setupRevision??0,playerCount,chartId:'A',lockChart:true,expansion,turnLimit:6,dioneEnabled:playerCount>=12,capybaraEnabled,universalArbourEnabled:false,wolfCultEnabled:false,activeRoleIds:roles}),'confirm');
  let setupRevision=(await session.get()).get('setupRevision')??confirmed.setupRevision??created.session.setupRevision??0;
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
  const browserIndex=browserRoleId?roles.indexOf(browserRoleId):-1;
  if(joinBrowserPlayer){assert.ok(browserIndex>=0,'The browser fills a printed core station.');players[browserIndex]=await joinBrowserPlayer(created.session.joinCode);}
  for(const [i,player]of players.entries()){
   if(i!==browserIndex)ok(await call(player,'joinSession',{joinCode:created.session.joinCode,displayName:`Local actor ${i+1}`}), 'join');
   ok(await call(gm,'assignRole',{sessionId,instanceId,requestId:randomUUID(),targetUid:player.localId,roleId:roles[i]}),'cast');
   const current=ok(await call(player,'resumeSession',{sessionId}),'resume');
   ok(await call(player,'claimSeat',{sessionId,seatId:roles[i],requestId:randomUUID(),expectedSetupRevision:current.session.setupRevision}),'seat');
   ok(await call(player,'refreshPresence',{sessionId,activeConsoleRoleId:roles[i]}),'console');
   heartbeatPlayers.set(player.localId,{actor:player,label:`player-${i+1}`});
  }
  const press=joinPressPlayer?await joinPressPlayer(created.session.joinCode):undefined;
  if(press){ok(await call(press,'refreshPresence',{sessionId,activeConsoleRoleId:'press-officer'}),'Press claim');
   heartbeatPlayers.set(press.localId,{actor:press,label:'press'});}
  const current=ok(await call(gm,'resumeSession',{sessionId,instanceId}),'GM resume');
  ok(await call(gm,'startGame',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:current.session.setupRevision}),'start');
  const hold=(await session.get()).get('turnPhase').timerPause;
  if(clearBriefing)ok(await call(players[0],'clearTurnAdvanceInterstitial',{sessionId,expectedCycle:1,expectedPausedAt:hold.pausedAt,requestId:randomUUID()}),'briefing clear');
  return{db,config,project,gm,players,press,roles,unionCraftSetupProof,heartbeatFailures,sessionId,session,instanceId,call,ok,
   byRole:role=>players[roles.indexOf(role)],cleanup:async()=>{
    clearInterval(gmHeartbeat);clearInterval(playerHeartbeat);
    await Promise.all([gmHeartbeatPending,playerHeartbeatPending]);
    await db.recursiveDelete(session);
   }};
 }catch(error){
  clearInterval(gmHeartbeat);clearInterval(playerHeartbeat);
  await Promise.all([gmHeartbeatPending,playerHeartbeatPending]);
  await db.recursiveDelete(session);throw error;
 }
}
