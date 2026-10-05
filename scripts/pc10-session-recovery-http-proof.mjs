import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC10_RECOVERY_EVIDENCE_PATH;
assert.ok(evidencePath, 'Use an external evidence path.');
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
  adminGameplaySeeds:[],localEmulatorOnly:true,calls,checks};
async function call(actor,name,data={}) {
  const started=performance.now();
  const result=await fixture.call(actor,name,{sessionId:fixture.sessionId,...data});
  calls.push({name,httpStatus:result.status,status:result.error?.status??result.result?.status??'ok',durationMs:Math.round(performance.now()-started)});
  assert.equal(result.status,200,`${name}: ${result.error?.status}`);
  return result.result;
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
  const denied=await fixture.call(mismatched,'refreshPresence',{sessionId,activeConsoleRoleId:original.assignedRoleId});
  assert.equal(denied.error?.status,'PERMISSION_DENIED');
  checks.foreignConsoleDenied=true;
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
