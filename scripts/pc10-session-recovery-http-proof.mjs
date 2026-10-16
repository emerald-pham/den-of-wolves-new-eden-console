import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC10_RECOVERY_EVIDENCE_PATH;
assert.ok(evidencePath, 'Use an external evidence path.');
const emulatorConfig=JSON.parse(await readFile('firebase.local.json','utf8')).emulators;
const functionsPort=emulatorConfig.functions.port;
let fixture;
const calls = [];
const checks = {};
async function treeHash() {
  const files=[];
  const visit=async directory => {
    for(const item of await readdir(directory,{withFileTypes:true})) {
      const path=join(directory,item.name);
      if(item.isDirectory()) await visit(path); else files.push(path);
    }
  };
  await visit('functions/lib');
  const hash=createHash('sha256');
  for(const path of files.sort()) hash.update(path.replace('functions/lib/','')+'\0').update(await readFile(path));
  return hash.digest('hex');
}
const report={type:'pc10-session-recovery-http-proof',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  functionsCompiledTreeSha256:await treeHash(),actorClients:9,browserContexts:0,actualHumanDevices:0,
  adminGameplaySeeds:[],localEmulatorOnly:true,project:process.env.VITE_FIREBASE_PROJECT_ID,
  emulatorPorts:{auth:emulatorConfig.auth.port,functions:functionsPort,firestore:emulatorConfig.firestore.port},calls,checks};
async function call(actor,name,data={},directTransport=false) {
  const started=performance.now();
  const payload={sessionId:fixture.sessionId,...data};
  let result;
  if(directTransport) {
    const response=await fetch(`http://127.0.0.1:${functionsPort}/${fixture.project}/us-central1/${name}`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.idToken}`},
      body:JSON.stringify({data:payload}),
    });
    result={status:response.status,...await response.json()};
  } else result=await fixture.call(actor,name,payload);
  calls.push({name,httpStatus:result.status,status:result.error?.status??result.result?.status??'ok',durationMs:Math.round(performance.now()-started)});
  assert.equal(result.status,200,`${name}: ${result.error?.status}`);
  return result.result;
}
async function deny(actor,name,expectedStatus,data={}) {
  const started=performance.now();
  const reply=await fixture.call(actor,name,{sessionId:fixture.sessionId,...data});
  calls.push({name,httpStatus:reply.status,status:reply.error?.status,durationMs:Math.round(performance.now()-started)});
  assert.equal(reply.error?.status,expectedStatus);
  return reply;
}
try {
  fixture=await createPc07AuthenticatedSession('PC10 bounded recovery contention proof',8,{keepAlive:true});
  const {db,sessionId,players,gm,instanceId}=fixture;
  const watched=[['session',`sessions/${sessionId}`],['navigation',`sessions/${sessionId}/serverState/navigation`],
    ['gm-discovery',`sessions/${sessionId}/gmDiscovery/current`],
    ...players.map((actor,index)=>[`player-discovery-${index}`,`sessions/${sessionId}/playerDiscoveries/${actor.localId}`])];
  const before=await Promise.all(watched.map(async([kind,path])=>({kind,path,snapshot:await db.doc(path).get()})));
  const original=(await db.doc(`sessions/${sessionId}/players/${players[0].localId}`).get()).data();
  const resumed=await call(players[0],'resumeSession');
  assert.equal(resumed.player.connectionGeneration,original.connectionGeneration+1);
  assert.equal(resumed.player.assignedRoleId,original.assignedRoleId);
  assert.equal(resumed.player.seatId,original.seatId);
  const rewritten=[];
  for(const {kind,path,snapshot} of before) if(!snapshot.updateTime.isEqual((await db.doc(path).get()).updateTime)) rewritten.push(kind);
  checks.stableResumeSharedDocumentsRewritten=rewritten;
  assert.deepEqual(rewritten,[],'A stable live resume must not rewrite shared navigation, session, or other discovery documents.');
  checks.stableResumeKeepsGenerationAndAuthority=true;
  const generations=await Promise.all(players.map(async actor=>(await db.doc(`sessions/${sessionId}/players/${actor.localId}`).get()).get('connectionGeneration')));
  await Promise.all(players.map(async(actor,index)=>{
    const reply=await call(actor,'resumeSession');
    assert.equal(reply.player.connectionGeneration,generations[index]+1);
    await call(actor,'getCurrentMemberSession');
    await call(actor,'refreshPresence');
  }).concat([call(gm,'refreshPresence',{instanceId})]));
  checks.overlappingIndependentActors=players.length+1;
  const mismatched=players.find(actor=>actor.localId!==players[0].localId);
  await deny(mismatched,'refreshPresence','PERMISSION_DENIED',{activeConsoleRoleId:original.assignedRoleId});
  checks.foreignConsoleDenied=true;
  await deny(mismatched,'refreshPresence','PERMISSION_DENIED',{instanceId});
  checks.foreignGmLeaseDenied=true;
  const generationBeforeRace=(await db.doc(`sessions/${sessionId}/players/${players[0].localId}`).get()).get('connectionGeneration');
  const race=await Promise.all([call(players[0],'resumeSession'),call(players[0],'resumeSession')]);
  assert.deepEqual(race.map(reply=>reply.player.connectionGeneration).sort((a,b)=>a-b),
    [generationBeforeRace+1,generationBeforeRace+2]);
  // A stale-generation disconnect succeeds as a server no-op. Its HTTP
  // response must not mark this live actor departed in fixture bookkeeping.
  await call(players[0],'disconnectFromSession',{connectionGeneration:original.connectionGeneration},true);
  const afterStale=(await db.doc(`sessions/${sessionId}/players/${players[0].localId}`).get()).data();
  assert.equal(afterStale.connected,true);
  assert.equal(afterStale.connectionGeneration,generationBeforeRace+2);
  assert.equal(afterStale.seatId,original.seatId);
  checks.sameIdentityRaceAndStaleDisconnectPreserved=true;
  const departing=players[1];
  const departedRef=db.doc(`sessions/${sessionId}/players/${departing.localId}`);
  const departure=await departedRef.get();
  await call(departing,'disconnectFromSession',{connectionGeneration:departure.get('connectionGeneration')});
  assert.equal((await db.doc(`activeMemberships/${departing.localId}`).get()).exists,false);
  const recovered=await call(departing,'resumeSession');
  assert.equal(recovered.player.connectionGeneration,departure.get('connectionGeneration')+1);
  assert.equal(recovered.player.seatId,null);
  assert.equal(recovered.player.assignedRoleId,null);
  assert.equal((await departedRef.get()).get('connected'),true);
  assert.equal((await db.doc(`activeMemberships/${departing.localId}`).get()).get('sessionId'),sessionId);
  await call(departing,'getCurrentMemberSession');
  checks.explicitDepartureAndMissingMembershipRecoveryPreserved=true;
  const revoked=players[2];
  await call(gm,'kickPlayer',{instanceId,targetUid:revoked.localId,requestId:randomUUID()});
  await deny(revoked,'getCurrentMemberSession','PERMISSION_DENIED');
  await deny(revoked,'resumeSession','FAILED_PRECONDITION');
  await deny(revoked,'refreshPresence','PERMISSION_DENIED');
  checks.immediateRevocationFreshReadDenied=true;
  report.passed=true;
} catch(error) {
  report.passed=false;
  report.failure=String(error.message);
  throw error;
} finally {
  await mkdir(dirname(evidencePath),{recursive:true});
  await writeFile(evidencePath,JSON.stringify(report,null,2)+'\n');
  await fixture?.cleanup();
}
