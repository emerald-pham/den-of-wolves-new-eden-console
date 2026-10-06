import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import {createFixtureHeartbeatController} from './fixture-heartbeats.mjs';

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const execute=promisify(execFile);

/** The scheduled function scans collection groups. Never run it beside a live foreign table. */
export function assertSchedulerSessionScope(sessionId,players,instances) {
 const foreign=[...players,...instances].filter(document=>{
  const segments=document.ref.path.split('/');
  return document.get('connected')===true&&
   (segments[0]!=='sessions'||segments[1]!==sessionId||segments.length!==4);
 });
 assert.equal(foreign.length,0,'The global scheduler would touch connected actors in another session.');
}

/** Observe every real transport, including siblings of a failed operation, before cleanup. */
export async function awaitProofBatch(operations) {
 const results=await Promise.allSettled(operations);
 const failures=results.filter(result=>result.status==='rejected');
 if(failures.length)throw failures[0].reason;
 return results.map(result=>result.value);
}

/** Preserve each mounted collector's actual transport interval during the real lease proof. */
export async function setProofBrowsersOffline(clients,offline) {
 return awaitProofBatch([...clients.values()].map(client=>client.setOffline(offline)));
}

/** Native adapters need the ordinary presence the real App sends before casting. */
export function createNativeSetupPresence({setInterval,clearInterval}={}) {
 const actors=new Map();
 const heartbeats=createFixtureHeartbeatController({setInterval,clearInterval,gmTick:async()=>{},
  playerTick:running=>awaitProofBatch([...actors.values()].map(async({roleId,sessionId,callable})=>{
   if(!running())return;
   const reply=await callable('refreshPresence',{sessionId});
   assert.equal(reply.status,200,`${roleId} ordinary SDK setup heartbeat must succeed.`);
  })),
 });
 return {
  add(actor) {
   assert.ok(actor.sessionId&&typeof actor.callable==='function','Register only an already joined SDK actor.');
   actors.set(actor.roleId,actor);heartbeats.start();
  },
  stop:heartbeats.stop,
 };
}

export function assertReturnedCoreStation({roleId,uid,reply,seat,player}) {
 assert.equal(player.id,uid,'The original UID must identify the authoritative player document.');
 assert.equal(player.get('connected'),true,'The original actor must be connected after normal resume.');
 assert.equal(reply.player.assignedRoleId,roleId,'Same identity must recover its assigned core role.');
 assert.equal(reply.player.seatId,roleId,'Normal resume must return its reclaimed own seat.');
 assert.equal(seat.exists,true,'The returning seat record must exist.');
 assert.equal(seat.get('roleId'),roleId,'The seat must match the assigned core role.');
 assert.equal(seat.get('status'),'claimed','Normal resume must reclaim the available own seat.');
 assert.equal(seat.get('holderUid'),uid,'Only the original UID may own the reclaimed seat.');
}

function deadline(phase,window) {
 const value=Date.parse(window==='restricted'?phase.teamPhaseEndsAt:phase.openAirspaceEndsAt);
 assert.ok(Number.isFinite(value),'The authoritative phase needs a valid deadline.');
 return value;
}
function sameCycle(before,after) {
 assert.equal(after.phase,'active','Natural recovery must stay in the active game.');
 assert.equal(after.currentTurn,before.currentTurn,'Disconnect/reconnect cannot advance the cycle.');
 assert.equal(after.turnPhase.turn,before.turnPhase.turn,'The phase turn cannot advance.');
}

export function assertNaturalDisconnectState(before,paused,later) {
 sameCycle(before,paused);sameCycle(before,later);
 for(const snapshot of [paused,later]) {
  assert.equal(snapshot.connectedPlayers,0,'Every actor must be disconnected by real lease expiry.');
  assert.equal(snapshot.liveGmInstances,0,'The GM instance lease must also expire.');
 }
 const pause=paused.turnPhase.timerPause;
 assert.equal(pause?.reason,'empty-session','Only the genuine empty-session hold proves natural expiry.');
 assert.ok(Number.isSafeInteger(pause.remainingMs)&&pause.remainingMs>0,'The remaining time must be positive.');
 const pausedAt=Date.parse(pause.pausedAt);
 assert.ok(Number.isFinite(pausedAt),'The server must record a real pause timestamp.');
 assert.equal(pause.remainingMs,deadline(before.turnPhase,pause.window)-pausedAt,
  'Remaining time must equal the original authoritative deadline minus the real pause timestamp.');
 assert.equal(paused.turnPhase.teamPhaseEndsAt,before.turnPhase.teamPhaseEndsAt,'Expiry cannot shift the team deadline.');
 assert.equal(paused.turnPhase.openAirspaceEndsAt,before.turnPhase.openAirspaceEndsAt,'Expiry cannot shift coordination.');
 assert.deepEqual(later.turnPhase,paused.turnPhase,'The paused phase and remaining time must stay stable while empty.');
}

export function assertNaturalRecoveryState(paused,restored,finished,{startedAt,completedAt}) {
 sameCycle(paused,restored);sameCycle(paused,finished);
 assert.equal(restored.turnPhase.timerPause,undefined,'Normal resume must release the empty-session hold.');
 const pause=paused.turnPhase.timerPause;
 const heldMs=Date.parse(restored.turnPhase.openAirspaceEndsAt)-Date.parse(paused.turnPhase.openAirspaceEndsAt);
 const resumedAt=Date.parse(pause.pausedAt)+heldMs;
 assert.ok(resumedAt>=startedAt&&resumedAt<=completedAt,
  'The clock shift must come from the real successful resume request.');
 assert.equal(Date.parse(restored.turnPhase.teamPhaseEndsAt)-Date.parse(paused.turnPhase.teamPhaseEndsAt),
  pause.window==='restricted'?heldMs:0,'Only the live paused clock window may move its deadline.');
 assert.equal(deadline(restored.turnPhase,pause.window)-resumedAt,pause.remainingMs,
  'Normal resume must restore exactly the held remaining time.');
 assert.deepEqual(finished.turnPhase,restored.turnPhase,'Later player/GM/seat recovery cannot shift the phase again.');
}

async function compiledTreeHash(root) {
 const base=join(root,'functions/lib'),files=[];
 async function visit(directory) {
  for(const item of await readdir(directory,{withFileTypes:true})) {
   const path=join(directory,item.name);
   if(item.isDirectory())await visit(path);else files.push(path);
  }
 }
 await visit(base);
 const hash=createHash('sha256');
 for(const path of files.sort())hash.update(path.slice(base.length+1)+'\0').update(await readFile(path));
 return hash.digest('hex');
}

/** Invoke the existing background function, rather than writing lastSeen/clock fields with Admin. */
export async function runLocalNaturalExpiryScheduler({fixture,root=sourceRoot}) {
 assert.ok(fixture.project?.startsWith('demo-'),'Only an explicitly named local demo project is permitted.');
 const emulator=JSON.parse(await readFile(join(root,'firebase.local.json'),'utf8')).emulators;
 assert.equal(emulator.firestore.port,fixture.config.firestorePort,'Use this fixture\'s reserved Firestore row.');
 const {stdout}=await execute(process.execPath,[join(root,'scripts/pc10-natural-expiry-scheduler.mjs'),
  fixture.project,fixture.sessionId,String(emulator.firestore.port)],{
  cwd:root,timeout:60_000,maxBuffer:1024*1024,
  env:{...process.env,FIRESTORE_EMULATOR_HOST:`127.0.0.1:${emulator.firestore.port}`,
   FIREBASE_AUTH_EMULATOR_HOST:`127.0.0.1:${emulator.auth.port}`,
   GCLOUD_PROJECT:fixture.project,GOOGLE_CLOUD_PROJECT:fixture.project,
   FUNCTIONS_EMULATOR:'true',FIREBASE_CONFIG:JSON.stringify({projectId:fixture.project})},
 });
 const line=stdout.trim().split('\n').findLast(value=>value.startsWith('{'));
 assert.ok(line,'The real background scheduler must return its local invocation receipt.');
 return JSON.parse(line);
}

async function snapshot(fixture) {
 const [session,players,instances]=await Promise.all([fixture.session.get(),
  fixture.session.collection('players').get(),fixture.session.collection('gmInstances').get()]);
 const state={phase:session.get('phase'),currentTurn:session.get('currentTurn'),turnPhase:session.get('turnPhase'),
  connectedPlayers:players.docs.filter(doc=>doc.get('connected')===true).length,
  liveGmInstances:instances.docs.filter(doc=>doc.get('connected')===true).length};
 return {state,session,players,instances};
}

/** Reuse the owner's already-created browser table. The caller owns cleanup and later gameplay. */
export async function runPc10NaturalDisconnectAcceptance(table,{
 directory,root=sourceRoot,emptyObservationMs=3000,leaseMarginMs=750,
 expectBrowserContexts=21,restartHeartbeats=true,
 progress=message=>console.log(message),
}={}) {
 assert.ok(directory,'Save the natural-disconnect proof outside the source checkout.');
 assert.ok(emptyObservationMs>=1000,'Observe an actual elapsed empty-table hold.');
 assert.ok(leaseMarginMs>=0,'Never shorten the real server lease.');
 const {fixture,clients=new Map(),command}=table;
 assert.equal(typeof fixture.stopHeartbeats,'function','The fixture must stop all synthetic heartbeats including GM.');
 assert.equal(clients.size,expectBrowserContexts,'Use exactly the declared independent browser context count.');
 const actors=[{roleId:'gm',actor:fixture.gm},
  ...fixture.players.map((actor,index)=>({roleId:fixture.roles[index],actor})),
  ...(fixture.press?[{roleId:'press-officer',actor:fixture.press}]:[])];
 const require=createRequire(new URL('../functions/package.json',import.meta.url));
 const {PRESENCE_LEASE_MS}=require(join(root,'functions/lib/sessionLifecycle.js'));
 assert.equal(PRESENCE_LEASE_MS,45000,'Proof must use the real production presence lease.');
 const emulator=JSON.parse(await readFile(join(root,'firebase.local.json'),'utf8')).emulators;
 const calls=[],checks={},backgroundInvocations=[];
 const report={type:'pc10-natural-all-player-disconnect-proof',schemaVersion:1,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  functionsCompiledTreeSha256:await compiledTreeHash(root),project:fixture.project,
  emulatorPorts:{auth:emulator.auth.port,functions:emulator.functions.port,firestore:emulator.firestore.port},
  actorClients:actors.length,actualIndependentBrowserContexts:clients.size,actualHumanDevices:0,
  independentCoreAuthActors:fixture.players.length,independentPressAuthActors:fixture.press?1:0,gmAuthActors:1,
  localEmulatorOnly:true,tokensOrCredentialsRecorded:false,
  adminGameplaySeeds:[],leaseMs:PRESENCE_LEASE_MS,
  transportClass:clients.size?'independent-browser-SDK-and-authenticated-GM-HTTP':'independent-native-SDK-and-authenticated-GM-HTTP',
  calls,checks,backgroundInvocations,
 };
 const assertIdentity=async()=>{
  const states=await awaitProofBatch([...clients.values()].map(client=>client.observe()));
  for(const state of states)assert.ok(state.hasAuth&&state.sameActor,'A browser must retain its original authenticated identity.');
  if(table.assertSameIdentity)await table.assertSameIdentity();
 };
 async function operation(role,name,payload={}) {
  const startedAt=Date.now();
  const reply=await command(role,name,payload);
  const completedAt=Date.now();
  calls.push({roleId:role,name,startedAt,completedAt,status:reply.status,
   resultStatus:reply.result?.status??null,denialCode:reply.error?.code??reply.error?.status??null});
  return {reply,startedAt,completedAt};
 }
 async function checked(role,name,payload={}) {
  const result=await operation(role,name,payload);
  assert.equal(result.reply.status,200,`${role} ${name} must succeed through its normal authenticated transport.`);
  return {...result,reply:result.reply.result};
 }
 try {
  await assertIdentity();
  let before=await snapshot(fixture);
  assert.equal(before.state.phase,'active','Start from a real active table.');
  assert.equal(before.state.turnPhase.timerPause,undefined,'Begin after the actual briefing is acknowledged.');
  assert.ok(Date.parse(before.state.turnPhase.openAirspaceEndsAt)>Date.now()+PRESENCE_LEASE_MS+leaseMarginMs,
   'Begin while the normal game clock has enough actual time for the lease to expire.');
  assert.equal(before.state.connectedPlayers,actors.length,'All declared actors must begin connected.');
  assert.equal(before.state.liveGmInstances,1,'One normal GM instance must begin live.');
  assert.deepEqual(new Set(before.players.docs.map(doc=>doc.id)),new Set(actors.map(({actor})=>actor.localId)),
   'The natural expiry proof owns exactly this table\'s real actors.');
  // Renew normally once before disappearance; this is not a clock/lease seed.
  await awaitProofBatch(actors.map(({roleId})=>checked(roleId,'refreshPresence',
   roleId==='gm'?{instanceId:fixture.instanceId}:{activeConsoleRoleId:roleId})));
  await fixture.stopHeartbeats();
  assert.equal(fixture.heartbeatFailures.length,0,'Fixture heartbeat failures cannot be hidden by stopping the timers.');
  await setProofBrowsersOffline(clients,true);
  const offlineAt=Date.now();
  before=await snapshot(fixture);
  report.before=before.state;
  report.offlineAt=offlineAt;
  progress(`All ${actors.length} actors have stopped renewing; waiting the actual ${PRESENCE_LEASE_MS}ms lease on the isolated table.`);
  await delay(PRESENCE_LEASE_MS+leaseMarginMs);
  report.leaseWaitElapsedMs=Date.now()-offlineAt;
  const expiredCandidates=await snapshot(fixture);
  // Record this returned source snapshot before a lease assertion can reject it.
  // These diagnostics neither renew a lease nor replace the original guards below.
  const checkedAt=Date.now();
  const originalActors=new Map(actors.map(({roleId,actor})=>[actor.localId,roleId]));
  const describeLease=(doc,identity)=>{
   const candidate={...identity,sourcePath:doc.ref.path,sessionId:doc.get('sessionId')??null,
    connected:doc.get('connected')===true,lastSeenAtMs:null,lastSeenAtValidity:'missing',
    ageMs:null,agedPastLease:false};
   try {
    const timestamp=doc.get('lastSeenAt');
    if(timestamp!=null) {
     if(typeof timestamp.toMillis!=='function')candidate.lastSeenAtValidity='unsupported-type';
     else {
      const milliseconds=timestamp.toMillis();
      candidate.lastSeenAtValidity=Number.isFinite(milliseconds)?'valid':'non-finite';
      if(Number.isFinite(milliseconds)) {
       candidate.lastSeenAtMs=milliseconds;candidate.ageMs=checkedAt-milliseconds;
       candidate.agedPastLease=candidate.ageMs>=PRESENCE_LEASE_MS;
      }
     }
    }
   } catch(error) {
    candidate.lastSeenAtValidity='read-failed';
    candidate.lastSeenAtReadFailure={name:error?.name??null,message:error?.message??null};
   }
   return candidate;
  };
  report.leaseCandidates={checkedAt,expectedSessionId:fixture.sessionId,
   players:expiredCandidates.players.docs.map(doc=>describeLease(doc,{actorUid:doc.id,
    originalActorUid:originalActors.has(doc.id)?doc.id:null,originalRoleId:originalActors.get(doc.id)??null})),
   gmInstances:expiredCandidates.instances.docs.map(doc=>describeLease(doc,{instanceId:doc.id,
    actorUid:doc.get('uid')??null,originalActorUid:fixture.gm.localId,originalInstanceId:fixture.instanceId})),
  };
  const lastSeen=expiredCandidates.players.docs.map(doc=>doc.get('lastSeenAt')?.toMillis());
  assert.ok(lastSeen.every(time=>Number.isFinite(time)&&Date.now()-time>=PRESENCE_LEASE_MS),
   'Every actor must actually age past the lease without an Admin lastSeen edit or hidden renewal.');
  const gmLastSeen=expiredCandidates.instances.docs.map(doc=>doc.get('lastSeenAt')?.toMillis());
  assert.ok(gmLastSeen.length===1&&gmLastSeen.every(time=>Number.isFinite(time)&&Date.now()-time>=PRESENCE_LEASE_MS),
   'The same GM instance must also age past the actual lease.');
  backgroundInvocations.push(await runLocalNaturalExpiryScheduler({fixture,root}));
  const paused=await snapshot(fixture);
  report.paused=paused.state;
  const expiredMemberships=await fixture.db.getAll(...actors.map(({actor})=>fixture.db.doc(`activeMemberships/${actor.localId}`)));
  assert.ok(expiredMemberships.every(doc=>!doc.exists),'Expiry must remove every own active membership.');
  for(const {roleId,actor} of actors.filter(({roleId})=>roleId!=='gm')) {
   const prior=before.players.docs.find(doc=>doc.id===actor.localId);
   const after=paused.players.docs.find(doc=>doc.id===actor.localId);
   assert.equal(after.get('assignedRoleId')??null,prior.get('assignedRoleId')??null,'Natural expiry preserves the assigned core role.');
   assert.equal(after.get('seatId')??null,prior.get('seatId')??null,'Natural expiry preserves the returning seat pointer.');
   assert.equal(after.get('activeConsoleRoleId'),roleId,'Natural expiry preserves the legitimate own console binding.');
  }
  progress(`The existing background scheduler expired all ${actors.length} actors. Checking the real empty-session hold before normal recovery.`);
  const emptySince=Date.now();
  await delay(emptyObservationMs);
  backgroundInvocations.push(await runLocalNaturalExpiryScheduler({fixture,root}));
  const later=await snapshot(fixture);
  report.emptyObservationElapsedMs=Date.now()-emptySince;
  assertNaturalDisconnectState(before.state,paused.state,later.state);
  checks.allActorsAndGmLeaseExpiredNaturally=true;
  checks.emptySessionRemainingTimeStable=true;
  checks.actualBackgroundSchedulerIdempotent=true;
  checks.coreRoleSeatAndConsolePointersRetained=true;
  // GM is independent of browser contexts. Its same-UID normal resume releases
  // the hold once; all SDK contexts recover concurrently after that commit.
  const resumedGm=await checked('gm','resumeSession');
  const restored=await snapshot(fixture);
  report.restored=restored.state;
  await checked('gm','claimGmInstance',{instanceId:fixture.instanceId,
   name:'Local facilitator',deviceLabel:'Natural-disconnect local proof'});
  await checked('gm','refreshPresence',{instanceId:fixture.instanceId});
  await setProofBrowsersOffline(clients,false);
  await awaitProofBatch(actors.filter(({roleId})=>roleId!=='gm').map(async({roleId,actor})=>{
   const result=await checked(roleId,'resumeSession');
   if(roleId!=='press-officer') {
    // Active-game resume itself reclaims this preserved pointer. A NEW seat
    // casting request is correctly locked after startGame and is not recovery.
    const [seat,player]=await fixture.db.getAll(fixture.session.collection('seats').doc(roleId),
     fixture.session.collection('players').doc(actor.localId));
    assertReturnedCoreStation({roleId,uid:actor.localId,reply:result.reply,seat,player});
   }
   await checked(roleId,'refreshPresence',{activeConsoleRoleId:roleId});
  }));
  const activeRecast=await operation(fixture.roles[0],'claimSeat',{seatId:fixture.roles[0],
   requestId:randomUUID(),expectedSetupRevision:(await fixture.session.get()).get('setupRevision')});
  assert.notEqual(activeRecast.reply.status,200,'A new casting command must remain denied during the active game.');
  assert.match(activeRecast.reply.error?.code??activeRecast.reply.error?.status??'',
   /failed-precondition|FAILED_PRECONDITION/,'The actual casting lock must reject the new active request.');
  await assertIdentity();
  const finished=await snapshot(fixture);
  report.finished=finished.state;
  assertNaturalRecoveryState(paused.state,restored.state,finished.state,resumedGm);
  assert.equal(finished.state.connectedPlayers,actors.length,'Every original identity must reconnect.');
  assert.equal(finished.state.liveGmInstances,1,'The same GM identity must reclaim one live instance.');
  for(const {roleId,actor} of actors) {
   const player=finished.players.docs.find(doc=>doc.id===actor.localId);
   assert.equal(player.get('connected'),true,'The original actor is connected after normal recovery.');
   if(roleId==='gm')assert.equal(player.get('role'),'gm','Normal GM claim restores GM authority.');
   else {
    assert.equal(player.get('activeConsoleRoleId'),roleId,'Normal recovery restores only the own console.');
    if(roleId!=='press-officer') {
     const seat=await fixture.session.collection('seats').doc(roleId).get();
     assert.equal(seat.get('status'),'claimed','The original core seat is claimed again.');
     assert.equal(seat.get('holderUid'),actor.localId,'Only the original UID owns the returning seat.');
    }
   }
  }
  checks.sameAuthenticatedIdentitiesRecovered=true;
  checks.normalSdkCoreRecovery=true;
  if(fixture.press)checks.normalSdkPressRecovery=true;
  checks.newActiveCastingRequestStillDenied=true;
  checks.sameGmNormalClaim=true;
  checks.remainingTimeRestoredExactlyOnce=true;
  checks.cyclePreserved=true;
  report.passed=true;
  if(restartHeartbeats)fixture.restartHeartbeats();
  return report;
 } catch(error) {
  report.passed=false;report.failure=error.message;
  throw error;
 } finally {
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,report.passed?'natural-disconnect.json':'natural-disconnect-failure.json'),
   JSON.stringify(report,null,2)+'\n');
 }
}
