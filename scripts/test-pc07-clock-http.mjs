#!/usr/bin/env node
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {localGmAccessConfiguration,grantLocalGmAccess} from './local-gm-access.mjs';
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
async function call(actor,name,data){const r=await fetch(`http://127.0.0.1:${functionsPort}/${project}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.idToken}`},body:JSON.stringify({data})});return{status:r.status,...await r.json()};}
function ok(reply,step){assert.equal(reply.status,200,`${step}: ${reply.error?.message}`);return reply.result;}
const gm=await actor(),foreign=await actor(),players=await Promise.all(Array.from({length:8},actor));
const created=ok(await call(gm,'createSession',{requestId:randomUUID(),joinCodeVersion:2,name:'PC07 authenticated clock proof'}),'create');const sessionId=created.session.id;const session=db.doc(`sessions/${sessionId}`);
try{
 await grantLocalGmAccess(config,{method:'POST',host:'127.0.0.1:5175',origin:'http://127.0.0.1:5175',remoteAddress:'127.0.0.1',token:gm.idToken});
 const instanceId='pc07-local-clock';ok(await call(gm,'claimGmInstance',{sessionId,instanceId,name:'Local facilitator',deviceLabel:'HTTP proof'}),'GM claim');
 const roles=recommendedRoleIds(8);
 ok(await call(gm,'confirmSetup',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:created.session.setupRevision??0,playerCount:8,chartId:'A',lockChart:true,expansion:'base',turnLimit:6,dioneEnabled:false,capybaraEnabled:false,universalArbourEnabled:false,wolfCultEnabled:false,activeRoleIds:roles}),'confirm');
 for(const [i,player]of players.entries()){
  ok(await call(player,'joinSession',{joinCode:created.session.joinCode,displayName:`Local actor ${i+1}`}), 'join');
  ok(await call(gm,'assignRole',{sessionId,instanceId,requestId:randomUUID(),targetUid:player.localId,roleId:roles[i]}),'cast');
  const current=ok(await call(player,'resumeSession',{sessionId}),'resume');
  ok(await call(player,'claimSeat',{sessionId,seatId:roles[i],requestId:randomUUID(),expectedSetupRevision:current.session.setupRevision}),'seat');
  ok(await call(player,'refreshPresence',{sessionId,activeConsoleRoleId:roles[i]}),'console');
 }
 const gmCurrent=ok(await call(gm,'resumeSession',{sessionId,instanceId}),'GM resume');
 const started=ok(await call(gm,'startGame',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:gmCurrent.session.setupRevision}),'start');
 assert.equal(started.currentTurn,1);const phase=(await session.get()).get('turnPhase');assert.equal(phase.timerPause.reason,'turn-interstitial');assert.equal(phase.timerPause.remainingMs,600000);
 const base={sessionId,expectedCycle:1,expectedPausedAt:phase.timerPause.pausedAt};const exact={...base,requestId:randomUUID()};
 assert.equal((await call(foreign,'clearTurnAdvanceInterstitial',exact)).error.status,'PERMISSION_DENIED');
 assert.equal((await call(players[0],'beginOpenAirspacePhase',{sessionId,expectedTurn:1})).error.status,'FAILED_PRECONDITION');
 assert.equal((await call(gm,'setEmergencyTimerPaused',{sessionId,instanceId,expectedTurn:1,paused:false})).error.status,'FAILED_PRECONDITION');
 const direct=await fetch(`http://127.0.0.1:${config.firestorePort}/v1/projects/${project}/databases/(default)/documents/sessions/${sessionId}/turnInterstitials/1`,{headers:{Authorization:`Bearer ${players[0].idToken}`}});assert.equal(direct.status,403);
 const disconnect=ok(await call(players[0],'resumeSession',{sessionId}),'recover held');assert.equal(disconnect.session.turnPhase.timerPause.pausedAt,base.expectedPausedAt);
 const [first,second]=await Promise.all([call(players[0],'clearTurnAdvanceInterstitial',exact),call(players[1],'clearTurnAdvanceInterstitial',{...base,requestId:randomUUID()})]);
 const firstResult=ok(first,'first clear'),secondResult=ok(second,'competing clear');assert.deepEqual(secondResult,firstResult);
 const resumed=(await session.get()).get('turnPhase');assert.equal(resumed.timerPause,undefined);assert.equal(Date.parse(resumed.openAirspaceEndsAt)-Date.parse(resumed.teamPhaseEndsAt),Date.parse(phase.openAirspaceEndsAt)-Date.parse(phase.teamPhaseEndsAt));
 const held=(await db.doc(`sessions/${sessionId}/turnInterstitials/1`).get()).data();assert.equal(Date.parse(resumed.teamPhaseEndsAt)-Date.parse(held.clearedAt),600000);
 assert.deepEqual(ok(await call(players[0],'clearTurnAdvanceInterstitial',exact),'exact replay'),firstResult);
 assert.equal((await call(players[0],'clearTurnAdvanceInterstitial',{...exact,expectedCycle:2})).error.status,'FAILED_PRECONDITION');
 const events=await db.collection(`sessions/${sessionId}/events`).get();assert.equal(events.docs.filter(d=>d.id==='turn-interstitial-cleared-1').length,1);
 assert.equal((await call(players[0],'beginOpenAirspacePhase',{sessionId,expectedTurn:1})).error.status,'FAILED_PRECONDITION');
 const evidence={kind:'normal-authenticated-local-emulator-http-and-rules',checks:{ordinaryCreateChartCastSeatStart8:true,initialTenMinutesPreserved:true,reconnectRestoresUnclearedHold:true,foreignActorAndPrivateReadDenied:true,emergencyAndEarlyAirspaceDenied:true,competingClearCommitsOnce:true,exactReplay:true,staleCycleDenied:true,deadlineResumesExactRemaining:true},productionGameplay:false,preparedSession:false,identitiesRetained:false,completedAt:new Date().toISOString()};
 if(process.env.PC07_HTTP_EVIDENCE_PATH)await writeFile(process.env.PC07_HTTP_EVIDENCE_PATH,JSON.stringify(evidence,null,2)+'\n');console.log('PC07 normal authenticated HTTP cycle-clear and Rules composition passed.');
}finally{await db.recursiveDelete(session);}
