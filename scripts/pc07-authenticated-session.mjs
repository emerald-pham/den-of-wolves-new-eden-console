import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {localGmAccessConfiguration,grantLocalGmAccess} from './local-gm-access.mjs';

/** Normal local Auth/HTTP setup. Tokens stay in memory and never enter evidence. */
export async function createPc07AuthenticatedSession(name) {
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
 const gm=await actor(),players=await Promise.all(Array.from({length:8},actor));
 const created=ok(await call(gm,'createSession',{requestId:randomUUID(),joinCodeVersion:2,name}),'create');
 const sessionId=created.session.id,session=db.doc(`sessions/${sessionId}`),instanceId='pc07-local-proof';
 try{
  await grantLocalGmAccess(config,{method:'POST',host:'127.0.0.1:5174',origin:'http://127.0.0.1:5174',remoteAddress:'127.0.0.1',token:gm.idToken});
  ok(await call(gm,'claimGmInstance',{sessionId,instanceId,name:'Local facilitator',deviceLabel:'PC07 HTTP proof'}),'GM claim');
  const roles=recommendedRoleIds(8);
  ok(await call(gm,'confirmSetup',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:created.session.setupRevision??0,playerCount:8,chartId:'A',lockChart:true,expansion:'base',turnLimit:6,dioneEnabled:false,capybaraEnabled:false,universalArbourEnabled:false,wolfCultEnabled:false,activeRoleIds:roles}),'confirm');
  for(const [i,player]of players.entries()){
   ok(await call(player,'joinSession',{joinCode:created.session.joinCode,displayName:`Local actor ${i+1}`}), 'join');
   ok(await call(gm,'assignRole',{sessionId,instanceId,requestId:randomUUID(),targetUid:player.localId,roleId:roles[i]}),'cast');
   const current=ok(await call(player,'resumeSession',{sessionId}),'resume');
   ok(await call(player,'claimSeat',{sessionId,seatId:roles[i],requestId:randomUUID(),expectedSetupRevision:current.session.setupRevision}),'seat');
   ok(await call(player,'refreshPresence',{sessionId,activeConsoleRoleId:roles[i]}),'console');
  }
  const current=ok(await call(gm,'resumeSession',{sessionId,instanceId}),'GM resume');
  ok(await call(gm,'startGame',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:current.session.setupRevision}),'start');
  const hold=(await session.get()).get('turnPhase').timerPause;
  ok(await call(players[0],'clearTurnAdvanceInterstitial',{sessionId,expectedCycle:1,expectedPausedAt:hold.pausedAt,requestId:randomUUID()}),'briefing clear');
  return{db,config,project,gm,players,roles,sessionId,session,instanceId,call,ok,
   byRole:role=>players[roles.indexOf(role)],cleanup:()=>db.recursiveDelete(session)};
 }catch(error){await db.recursiveDelete(session);throw error;}
}
