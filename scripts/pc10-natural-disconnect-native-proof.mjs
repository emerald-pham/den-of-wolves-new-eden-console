import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {createPc07AuthenticatedSession} from './pc07-authenticated-session.mjs';
import {createNativeSetupPresence,runPc10NaturalDisconnectAcceptance} from './pc10-natural-disconnect.mjs';

const directory=process.env.PC10_NATURAL_DISCONNECT_EVIDENCE_DIRECTORY;
assert.ok(directory,'Use an external evidence directory for the focused native proof.');
const project=process.env.VITE_FIREBASE_PROJECT_ID;
assert.ok(project?.startsWith('demo-'),'Require an explicit emulator project.');
const emulator=JSON.parse(await readFile('firebase.local.json','utf8')).emulators;
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {recommendedRoleIds}=require('../functions/lib/roleConfiguration.js');
const roles=recommendedRoleIds(8);
const nativeActors=new Map(),actions=[];
const setupPresence=createNativeSetupPresence();
let fixture,stage='normal anonymous SDK authentication';
async function createNativeActor(roleId) {
 const app=initializeApp({projectId:project,apiKey:project,authDomain:`${project}.firebaseapp.com`},
  `natural-disconnect-${roleId}-${randomUUID()}`);
 const auth=getAuth(app);connectAuthEmulator(auth,`http://127.0.0.1:${emulator.auth.port}`,{disableWarnings:true});
 const functions=getFunctions(app);connectFunctionsEmulator(functions,'127.0.0.1',emulator.functions.port);
 const authenticated=await signInAnonymously(auth);
 const originalUid=authenticated.user.uid;
 async function callable(name,data) {
  const startedAt=Date.now();
  let reply;
  try {
   const result=await httpsCallable(functions,name,{timeout:60_000})(data);
   reply={status:200,result:result.data};
  } catch(error) {reply={status:'denied',error:{code:error.code}};}
  actions.push({roleId,name,transport:'independent-native-Firebase-SDK',startedAt,completedAt:Date.now(),
   status:reply.status,denialCode:reply.error?.code??null});
  return reply;
 }
 async function join(joinCode) {
  const reply=await callable('joinSession',{joinCode,displayName:'Focused native disconnect actor'});
  assert.equal(reply.status,200,'Ordinary SDK join must succeed.');
  setupPresence.add({roleId,sessionId:reply.result.session.id,callable});
  return {localId:originalUid,idToken:await auth.currentUser.getIdToken()};
 }
 return {app,auth,originalUid,join,callable};
}
try {
 for(const roleId of roles)nativeActors.set(roleId,await createNativeActor(roleId));
 stage='ordinary SDK joins and normal GM setup';
 fixture=await createPc07AuthenticatedSession('PC10 real lease native SDK disconnect proof',8,{
  keepAlive:true,serializeFixtureCalls:false,clearBriefing:true,
  joinBrowserPlayers:Object.fromEntries([...nativeActors].map(([roleId,actor])=>[roleId,actor.join])),
 });
 // This adapter supplies normal SDK heartbeats only while waiting for casting.
 // After setup, the fixture's registered actor/GM timers are the sole renewals
 // and the acceptance driver stops/drains all of them before actual expiry.
 await setupPresence.stop();
 const originalCall=fixture.call;
 const actorRoles=new Map(fixture.players.map((actor,index)=>[actor.localId,roles[index]]));
 actorRoles.set(fixture.gm.localId,'gm');
 fixture.call=(actor,name,data)=>nativeActors.has(actorRoles.get(actor.localId))
  ?nativeActors.get(actorRoles.get(actor.localId)).callable(name,data):originalCall(actor,name,data);
 const table={fixture,clients:new Map(),actions,
  command:(roleId,name,payload={})=>fixture.call(roleId==='gm'?fixture.gm:fixture.byRole(roleId),name,
   {sessionId:fixture.sessionId,...payload}),
  assertSameIdentity:async()=>{
   for(const actor of nativeActors.values())assert.equal(actor.auth.currentUser?.uid,actor.originalUid,
    'Keep the original normal Firebase Auth UID; never mint a recovery identity.');
  },
 };
 stage='natural-expiry and ordinary SDK recovery acceptance';
 const report=await runPc10NaturalDisconnectAcceptance(table,{directory,expectBrowserContexts:0,restartHeartbeats:false});
 console.log(JSON.stringify({passed:report.passed,actorClients:report.actorClients,
  nativeSdkActors:nativeActors.size,browserContexts:0,actualHumanDevices:0,
  leaseWaitElapsedMs:report.leaseWaitElapsedMs,checks:report.checks}));
} catch(error) {
 await mkdir(directory,{recursive:true});
 await writeFile(`${directory}/native-failure.json`,JSON.stringify({passed:false,stage,
  message:error.message,actorClients:nativeActors.size+Number(Boolean(fixture?.gm)),
  actualIndependentBrowserContexts:0,actualHumanDevices:0,tokensOrCredentialsRecorded:false,actions},null,2)+'\n');
 throw error;
} finally {
 try {await setupPresence.stop();}
 finally {try {await fixture?.cleanup();}
  finally {await Promise.all([...nativeActors.values()].map(actor=>deleteApp(actor.app)));}
 }
}
