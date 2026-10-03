import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPc07AuthenticatedSession} from './pc07-authenticated-session.mjs';

/** Real local commands compose maintenance, transit and declaration. Only the
 * disposable clock is accelerated; no resources, dice or attack results seed. */
export async function createPc07AttackHttpSession({beforeDeclaration,playerCount=12,reactorConsoles=['jump-drive'],rationLevel=1}={}) {
 const f=await createPc07AuthenticatedSession('PC07 ordinary attack and airspace proof',playerCount);
 const {db,gm,instanceId,session,sessionId,call,ok}=f;
 try {
  const lease=(await db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`).get()).data();
  const claimedAt=typeof lease.claimedAt==='string'?lease.claimedAt:lease.claimedAt.toDate().toISOString();
  ok(await call(gm,'setGmShipConsoleWriteGrant',{sessionId,instanceId,shipId:'aegis',enabled:true,claimedAt}),'ship console grant');
  let revision=0;
  for(const action of ['begin','storage','rations','unrest','riot','reactor','bays','bays','end']) {
   const data={sessionId,instanceId,shipId:'aegis',action,expectedRevision:revision,requestId:randomUUID(),
    ...(action==='rations'?{foodLevel:rationLevel,waterLevel:rationLevel}:{}),
    ...(action==='reactor'?{consoles:reactorConsoles}:{}),
    ...(action==='bays'?{refuels:revision===6?{'shuttle-bay-zeta':'starlight'}:{}}:{})};
   const reply=ok(await call(gm,'runMaintenance',data),`maintenance ${action}`);revision=reply.cycle.revision;
  }
  assert.equal((await session.get()).get('shuttleFuelled').starlight,true,'Normal printed bay refuels Starlight');
  const wing=f.byRole('wing-commander');assert.ok(wing);
  const phase=(await session.get()).get('turnPhase');
  await session.update({turnPhase:{...phase,teamPhaseEndsAt:new Date(Date.now()-1000).toISOString(),openAirspaceEndsAt:new Date(Date.now()+600000).toISOString()}});
  ok(await call(wing,'beginOpenAirspacePhase',{sessionId,expectedTurn:1}),'open Coordination');
  const departureId=randomUUID();
  ok(await call(wing,'requestShuttleDeparture',{sessionId,requestId:departureId,shuttleId:'starlight',destinationShipId:'icebreaker',expectedControlRevision:0,expectedCycle:1}),'local departure');
  const transit=ok(await call(wing,'beginShuttleTransit',{sessionId,requestId:randomUUID(),shuttleId:'starlight',expectedDepartureRequestId:departureId,expectedControlRevision:0,expectedCycle:1}),'normal transit');
  assert.equal(transit.status,'in-transit');
  if(beforeDeclaration)await beforeDeclaration({...f,wing,transit});
  ok(await call(gm,'setWolfAttackWindow',{sessionId,instanceId,requestId:randomUUID(),expectedRevision:0,status:'due'}),'Wolf window');
  const preparation=ok(await call(gm,'stageWolfAttackPreparation',{sessionId,instanceId,requestId:randomUUID(),expectedRevision:0,turn:1,
   shipIds:[...Array(10).fill('wolf-fighter-wing'),...Array(5).fill('wolf-assault-transport')],targetMode:'pre-rolled',targetAssignments:[],modifiers:[],notes:''}),'printed initial attack');
  const declarationCommand={sessionId,instanceId,requestId:randomUUID(),expectedRevision:preparation.revision};
  const declaration=ok(await call(gm,'declareWolfAttack',declarationCommand),'declare');
  const after=(await session.get()).data();
  assert.equal(after.turnPhase.airspace.state,'restricted');
  assert.equal((await db.doc(`sessions/${sessionId}/shuttleTransitChains/starlight`).get()).exists,false);
  assert.equal((await db.doc(`sessions/${sessionId}/shuttleDepartures/starlight`).get()).exists,false);
  assert.ok(after.shuttleDockings.some(d=>d.shuttleId==='starlight'),'Declaration parks the actual craft');
  const parking=await db.collection(`sessions/${sessionId}/events`).where('type','==','wolf-attack-declared').get();
  assert.equal(parking.size,1,'Declaration commits one safe parking announcement');
  assert.ok(parking.docs[0].get('parkedCraftCount')>=1);
  return {...f,wing,declaration,declarationCommand,fixtureChanges:['disposable clock deadlines'],maintenanceRevision:revision};
 }catch(error){await f.cleanup();throw error;}
}
