#!/usr/bin/env node
// Run only against an already started demo Auth/Functions/Firestore emulator row.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { localGmAccessConfiguration, grantLocalGmAccess } from './local-gm-access.mjs';
const env = Object.fromEntries((await readFile('.env.emulators.local','utf8')).trim().split('\n').map(line=>line.split('=')));
const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
const config = localGmAccessConfiguration('serve', {...env,VITE_LOCAL_GM_ACCESS:'1',VITE_FIREBASE_PROJECT_ID:projectId});
if (!config) throw Error('Explicit demo-project and valid configured emulator row required.');
const functionsPort = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT);
assert.ok(Number.isInteger(functionsPort) && functionsPort > 0 && functionsPort <= 65535);
const signup = await fetch(`http://127.0.0.1:${config.authPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${projectId}`, {
 method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true}),
});
assert.equal(signup.ok,true);
const {idToken,localId} = await signup.json();
async function call(name,data) {
 const response = await fetch(`http://127.0.0.1:${functionsPort}/${projectId}/us-central1/${name}`, {
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${idToken}`},body:JSON.stringify({data}),
 });
 return {status:response.status,body:await response.json()};
}
const created = await call('createSession',{requestId:randomUUID(),joinCodeVersion:2,name:'Local GM isolation verification'});
assert.equal(created.status,200);
const sessionId = created.body.result.session.id;
const claim = {sessionId,instanceId:'local-native-gm',name:'Local native GM',deviceLabel:'Local emulator validation'};
const unseeded = await call('claimGmInstance',claim);
assert.equal(unseeded.body.error.status,'PERMISSION_DENIED');
const wrongPassword = await call('loginGmAccess',{password:'not-a-gm-password'});
assert.equal(wrongPassword.body.error.status,'PERMISSION_DENIED');
const clientWrite = await fetch(`http://127.0.0.1:${config.firestorePort}/v1/projects/${projectId}/databases/(default)/documents/gmAccess/${localId}`, {
 method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${idToken}`},
 body:JSON.stringify({fields:{uid:{stringValue:localId},authenticatedAt:{timestampValue:new Date().toISOString()}}}),
});
assert.equal(clientWrite.status,403, 'The normal authenticated client cannot grant itself GM access.');
await grantLocalGmAccess(config,{method:'POST',origin:'http://127.0.0.1:5175',host:'127.0.0.1:5175',remoteAddress:'127.0.0.1',token:idToken});
const authorized = await call('claimGmInstance',claim);
assert.equal(authorized.status,200);
assert.equal(authorized.body.result.instance.uid,localId);
const resumed = await call('resumeSession',{sessionId});
assert.equal(resumed.status,200);
assert.equal(resumed.body.result.player.role,'gm');
const revoked = await call('logoutGmAccess',{sessionId,instanceId:claim.instanceId});
assert.equal(revoked.status,200);
const afterRevoke = await call('claimGmInstance',claim);
assert.equal(afterRevoke.body.error.status,'PERMISSION_DENIED');
const receipt = {kind:'local-emulator-production-handler-proof',project:'demo project',completedAt:new Date().toISOString(),
 checks:{normalCreateSession:true,unseededClaimDenied:true,wrongProductionPasswordDenied:true,clientLeaseWriteDenied:true,
 localHelperLeaseAccepted:true,normalNamedClaimGranted:true,normalLogoutRevokesLease:true,reclaimAfterRevokeDenied:true},
 productionGameplay:false,identitiesRetained:false};
if(process.env.LOCAL_GM_EVIDENCE_PATH)await writeFile(process.env.LOCAL_GM_EVIDENCE_PATH,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify(receipt));
