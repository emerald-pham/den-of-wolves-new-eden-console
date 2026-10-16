import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createPc07AuthenticatedSession} from './pc07-authenticated-session.mjs';
import {awaitProofBatch} from './pc10-natural-disconnect.mjs';

const evidencePath=process.env.PC10_PRESS_CONTENTION_EVIDENCE_PATH;
assert.ok(evidencePath,'Save evidence outside the checkout.');
const project=process.env.VITE_FIREBASE_PROJECT_ID;
assert.ok(project?.startsWith('demo-'),'Use an explicit local emulator project.');
const emulator=JSON.parse(await readFile('firebase.local.json','utf8')).emulators;
const functionsPort=emulator.functions.port;
async function compiledHash() {
 const files=[];
 async function visit(directory) {for(const entry of await readdir(directory,{withFileTypes:true})) {
  const path=join(directory,entry.name);if(entry.isDirectory())await visit(path);else files.push(path);
 }}
 await visit('functions/lib');const hash=createHash('sha256');
 for(const file of files.sort())hash.update(file.replace('functions/lib/','')+'\0').update(await readFile(file));
 return hash.digest('hex');
}
const calls=[],checks={};
const report={type:'pc10-press-steady-member-contention-http-proof',
 sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 functionsCompiledTreeSha256:await compiledHash(),project,
 emulatorPorts:{auth:emulator.auth.port,functions:functionsPort,firestore:emulator.firestore.port},
 independentCoreAuthActors:20,independentPressAuthActors:1,gmAuthActors:1,
 actualIndependentBrowserContexts:0,actualHumanDevices:0,adminGameplaySeeds:[],
 transport:'normal-independent-Auth-emulator-HTTP',
 scheduling:'21 genuinely overlapping native requests; no driver retries or serialization',calls,checks};
let fixture;
async function http(actor,name,data) {
 const response=await fetch(`http://127.0.0.1:${functionsPort}/${project}/us-central1/${name}`,{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.idToken}`},
  body:JSON.stringify({data}),signal:AbortSignal.timeout(60_000),
 });
 return {status:response.status,...await response.json()};
}
try {
 fixture=await createPc07AuthenticatedSession('PC10 steady Press native21 contention proof',20,{
  keepAlive:true,serializeFixtureCalls:false,expansion:'capybara',capybaraEnabled:true,
  joinPressPlayer:async joinCode=>{
   const response=await fetch(`http://127.0.0.1:${emulator.auth.port}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project}`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
   assert.equal(response.status,200,'The additional Press actor uses ordinary anonymous Auth.');
   const actor=await response.json();
   assert.equal((await http(actor,'joinSession',{joinCode,displayName:'Native Press proof actor'})).status,200);
   return actor;
  },
 });
 const actors=[...fixture.players.map((actor,index)=>({actor,roleId:fixture.roles[index]})),
  {actor:fixture.press,roleId:'press-officer'}];
 const watched=[['session',fixture.session],['navigation',fixture.session.collection('serverState').doc('navigation')],
  ['gm-discovery',fixture.session.collection('gmDiscovery').doc('current')],
  ...actors.map(({actor,roleId})=>[`discovery-${roleId}`,fixture.session.collection('playerDiscoveries').doc(actor.localId)])];
 const before=await Promise.all(watched.map(async([kind,reference])=>({kind,reference,snapshot:await reference.get()})));
 const generations=await Promise.all(actors.map(async({actor})=>
  (await fixture.session.collection('players').doc(actor.localId).get()).get('connectionGeneration')));
 async function call({actor,roleId},name,data={}) {
  const startedAt=Date.now();
  let reply;
  try {reply=await http(actor,name,{sessionId:fixture.sessionId,...data});}
  catch(error) {calls.push({roleId,name,startedAt,completedAt:Date.now(),status:'transport-failed',code:error.name});throw error;}
  calls.push({roleId,name,startedAt,completedAt:Date.now(),status:reply.status,code:reply.error?.status??null});
  return reply;
 }
 console.log('Starting all 21 actual normal Auth HTTP resumes concurrently; no transport retries.');
 const replies=await awaitProofBatch(actors.map(actor=>call(actor,'resumeSession')));
 for(const [index,reply] of replies.entries()) {
  assert.equal(reply.status,200,`${actors[index].roleId} actual concurrent resume must succeed.`);
  assert.equal(reply.result.player.connectionGeneration,generations[index]+1,'Every identity advances its own generation once.');
  assert.equal(reply.result.player.activeConsoleRoleId,actors[index].roleId,'Each actor keeps its own core or Press console.');
 }
 checks.all21ActualConcurrentResumesSucceeded=true;
 report.stableSharedDocumentsRewritten=[];
 for(const {kind,reference,snapshot} of before) {
  const after=await reference.get();
  if(!snapshot.updateTime?.isEqual(after.updateTime))report.stableSharedDocumentsRewritten.push(kind);
 }
 assert.deepEqual(report.stableSharedDocumentsRewritten,[],
  'Current core and Press resumes/heartbeats must not rewrite shared session/navigation/discovery state.');
 checks.stableResumeSharedWritesAbsent=true;
 const reads=await awaitProofBatch(actors.map(actor=>call(actor,'getCurrentMemberSession')));
 for(const reply of reads)assert.equal(reply.status,200,'Every actual authenticated reader succeeds.');
 const presence=await awaitProofBatch(actors.map(actor=>call(actor,'refreshPresence',{activeConsoleRoleId:actor.roleId})));
 for(const reply of presence)assert.equal(reply.status,200,'All 21 actors renew only their legitimate own console.');
 const foreignPress=await call(actors[0],'refreshPresence',{activeConsoleRoleId:'press-officer'});
 assert.equal(foreignPress.error?.status,'FAILED_PRECONDITION','A core actor cannot take over the optional Press station.');
 assert.equal((await fixture.session.get()).get('pressHolderUid'),fixture.press.localId,'The legitimate Press UID stays authoritative.');
 checks.all21CurrentReadersAndConsoleRenewalsSucceeded=true;
 checks.foreignPressClaimDenied=true;
 const generation=(await fixture.session.collection('players').doc(actors[0].actor.localId).get()).get('connectionGeneration');
 const races=await awaitProofBatch([call(actors[0],'resumeSession'),call(actors[0],'resumeSession')]);
 for(const reply of races)assert.equal(reply.status,200,'Two real same-UID requests may race normally.');
 assert.deepEqual(races.map(reply=>reply.result.player.connectionGeneration).sort((a,b)=>a-b),[generation+1,generation+2]);
 checks.sameUidGenerationRacePreserved=true;
 assert.equal(fixture.heartbeatFailures.length,0,'Normal synthetic heartbeat failures must be surfaced.');
 checks.normalHeartbeatsHadNoFailures=true;
 report.passed=true;
} catch(error) {report.passed=false;report.failure=error.message;throw error;}
finally {
 report.functionsCompiledTreeSha256AtEnd=await compiledHash();
 assert.equal(report.functionsCompiledTreeSha256AtEnd,report.functionsCompiledTreeSha256,'Runtime bytes must remain stable throughout this run.');
 await mkdir(dirname(evidencePath),{recursive:true});
 await writeFile(evidencePath,JSON.stringify(report,null,2)+'\n');
 await fixture?.cleanup();
}
