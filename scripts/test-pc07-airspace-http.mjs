import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createPc07AuthenticatedSession} from './pc07-authenticated-session.mjs';
const f=await createPc07AuthenticatedSession('PC07 authenticated airspace boundaries');
const{db,session,sessionId,call,ok,gm,instanceId}=f;
const wing=f.byRole('wing-commander'),crew=f.byRole('icebreaker-miner');
assert.ok(wing&&crew,'Printed craft owners present in ordinary eight-player roster');
const departure={sessionId,requestId:randomUUID(),shuttleId:'starlight',destinationShipId:'icebreaker',expectedControlRevision:0,expectedCycle:1};
const denied=async(actor,name,data)=>{const r=await call(actor,name,data);assert.ok(r.status!==200,`${name} unexpectedly allowed`);assert.ok(['FAILED_PRECONDITION','PERMISSION_DENIED'].includes(r.error.status));};
try{
 await denied(wing,'requestShuttleDeparture',departure);
 await denied(wing,'beginOpenAirspacePhase',{sessionId,expectedTurn:1});
 // Accelerate this disposable emulator clock only; gameplay commands remain normal Auth/HTTP.
 const phase=(await session.get()).get('turnPhase');
 await session.update({turnPhase:{...phase,teamPhaseEndsAt:new Date(Date.now()-1000).toISOString(),openAirspaceEndsAt:new Date(Date.now()+600000).toISOString()}});
 const [a,b]=await Promise.all([call(wing,'beginOpenAirspacePhase',{sessionId,expectedTurn:1}),call(crew,'beginOpenAirspacePhase',{sessionId,expectedTurn:1})]);
 assert.equal(ok(a,'open').turnPhase.airspace.state,'lifted');assert.equal(ok(b,'competing open').turnPhase.airspace.state,'lifted');
 const opened=await db.collection(`sessions/${sessionId}/events`).where('type','==','airspace-opened').get();assert.equal(opened.size,1);
 const ticker=(await session.get()).get('fleetTicker');assert.match(JSON.stringify(ticker),/AIRSPACE CONTROL \/\/ AIRSPACE OPEN/);
 await denied(wing,'beginOpenAirspacePhase',{sessionId,expectedTurn:2});
 const group=db.doc(`sessions/${sessionId}/fleetGroups/fleet-1`),originalGroup=(await group.get()).data();
 await group.update({vesselIds:originalGroup.vesselIds.filter(id=>id!=='icebreaker')});
 await denied(wing,'requestShuttleDeparture',{...departure,requestId:randomUUID()});
 await group.set(originalGroup);
 await session.update({missionCraftCommitments:{starlight:{missionId:'local-mission',sourceCycle:1}}});
 await denied(wing,'requestShuttleDeparture',{...departure,requestId:randomUUID()});
 await session.update({missionCraftCommitments:{}});
 await db.doc(`sessions/${sessionId}/wolfAttackState/current`).set({status:'declared',airspaceLocked:true});
 await denied(wing,'requestShuttleDeparture',{...departure,requestId:randomUUID()});
 await denied(wing,'beginOpenAirspacePhase',{sessionId,expectedTurn:1});
 await db.doc(`sessions/${sessionId}/wolfAttackState/current`).delete();
 const before=(await session.get()).get('turnPhase');
 ok(await call(gm,'setEmergencyTimerPaused',{sessionId,instanceId,expectedTurn:1,paused:true}),'pause');
 await denied(wing,'requestShuttleDeparture',{...departure,requestId:randomUUID()});
 const recovered=ok(await call(wing,'resumeSession',{sessionId}),'reconnect');assert.ok(recovered.session.turnPhase.timerPause);
 ok(await call(gm,'setEmergencyTimerPaused',{sessionId,instanceId,expectedTurn:1,paused:false}),'resume');
 assert.equal((await session.get()).get('turnPhase').airspace.state,before.airspace.state);
 const request={...departure,requestId:randomUUID()};
 const committed=ok(await call(wing,'requestShuttleDeparture',request),'legal local departure');assert.equal(committed.status,'requested');
 assert.equal(ok(await call(wing,'requestShuttleDeparture',request),'exact departure replay').status,'replayed');
 await session.update({quarantineDocking:{type:'quarantine-docking',status:'active',crisisId:'local-outbreak',crisisRevision:1,revision:1,
  affectedShipIds:['icebreaker'],communications:'allowed',acceptedByShip:{}}});
 const handoff={sessionId,requestId:randomUUID(),shuttleId:'starlight',action:'handoff',targetUid:crew.localId,expectedRevision:0};
 ok(await call(wing,'transferShuttleControlCommand',handoff),'quarantine first inbound');
 const quarantine=(await session.get()).get('quarantineDocking');assert.equal(quarantine.revision,2);assert.equal(quarantine.communications,'allowed');
 assert.equal((await group.get()).get('communicationScope'),originalGroup.communicationScope);
 assert.equal(ok(await call(wing,'transferShuttleControlCommand',handoff),'quarantine exact replay').status,'replayed');
 ok(await call(wing,'transferShuttleControlCommand',{sessionId,requestId:randomUUID(),shuttleId:'starlight',action:'reclaim',expectedRevision:1}),'quarantine outbound reclaim');
 await denied(wing,'transferShuttleControlCommand',{...handoff,requestId:randomUUID(),expectedRevision:2});
 const direct=await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}?updateMask.fieldPaths=turnPhase`,
  {method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${wing.idToken}`},
   body:JSON.stringify({fields:{turnPhase:{mapValue:{fields:{turn:{integerValue:'999'}}}}}})});
 assert.equal(direct.status,403,'Member cannot rewrite the shared clock through Firestore');
 const evidence={kind:'normal-authenticated-local-emulator-http-with-labeled-disposable-clock-and-restriction-fixtures',
  checks:{ordinaryRoster8:true,teamDockedDenied:true,authoritativeOpenAndOneEvent:true,truthfulOpenTicker:true,staleCycleDenied:true,
   splitDestinationDenied:true,missionCraftDenied:true,wolfLockedDenied:true,pauseRecovery:true,normalDepartureAndExactReplay:true,
   quarantineInboundAuditedOnce:true,quarantineSecondInboundDenied:true,quarantineCommunicationsPreserved:true,directClockWriteDenied:true},
  productionGameplay:false,preparedReviewScene:false,fixtureChanges:['clock deadlines','split membership context','mission commitment','Wolf restriction context','quarantine policy'],
  identitiesRetained:false,completedAt:new Date().toISOString()};
 if(process.env.PC07_AIRSPACE_EVIDENCE_PATH)await writeFile(process.env.PC07_AIRSPACE_EVIDENCE_PATH,JSON.stringify(evidence,null,2)+'\n');
 console.log('PC07 authenticated airspace edge/reconnect/announcement proof passed.');
}finally{await f.cleanup();}
