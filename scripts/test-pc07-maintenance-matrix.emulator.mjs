#!/usr/bin/env node
// Fixture-backed native Firestore proof; normal authenticated HTTP/UI is recorded separately.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^127\.0\.0\.1:\d+$/);
assert.match(process.env.GCLOUD_PROJECT ?? '', /^demo-/);
const require = createRequire(new URL('../functions/package.json',import.meta.url));
const {getFirestore} = require('firebase-admin/firestore');
const {runMaintenance,runSmallShipMaintenance,runVoyage33Maintenance} = require('../functions/lib/index.js');
const {emptySmallShipState} = require('../functions/lib/smallShip.js');
const db=getFirestore();
const full=[['aegis',8,6,2500,7],['dione',18,14,100000,6],['icebreaker',13,10,40000,6],['shepherd',12,9,30000,6],['quellon',12,9,30000,6],['refinery-124',11,8,20000,6],['capybara',11,8,20000,6]];
const small=[['gorgoneion',8,6,'repair-drones'],['capybara-small',8,6,'hydroponics'],['warrior',8,6,'repair-drones'],['vulcan',10,7,'additional-labour-1']];
const completed=[];
for(const [ship,food,water,population,bays] of [...full,...small,['voyage-33-0',13,10,40000,0]]){
 const id=`pc07-maintenance-${process.pid}-${ship}`,uid=`${id}-gm`,session=db.doc(`sessions/${id}`);
 const now=new Date().toISOString(),end=new Date(Date.now()+20*60_000).toISOString();
 const isSmall=small.some(row=>row[0]===ship),isVoyage=ship==='voyage-33-0',host=isSmall||isVoyage?'aegis':ship;
 const inventory={ore:30,fuel:20,food:60,water:60,materials:12,securityTeams:9,...(ship==='capybara'?{scrap:3}:{})};
 const state=isSmall?emptySmallShipState(ship,host):undefined;
 const voyage={id:ship,hostShipId:host,dockingRevision:0,population:40000,unrest:0,cycle:{step:0,revision:0,results:{},charges:[]}};
 const call=data=>({auth:{uid,token:{sub:uid,firebase:{sign_in_provider:'custom'}}},data});
 try{
  const batch=db.batch();
  batch.set(session,{phase:'active',currentTurn:1,configurationLocked:true,chartId:'A',chartSelectionLocked:true,activeVesselIds:[host],admittedVesselIds:isVoyage?[ship]:[],
   capybaraEnabled:['capybara','capybara-small'].includes(ship),dioneEnabled:true,expansion:ship==='capybara'?'capybara':'base',
   shipResources:{[host]:inventory},shipSurvivors:{[host]:isSmall||isVoyage?2500:population},shipUnrest:{[host]:0},
   shipDamage:{[host]:{damagedSystemIds:[],destroyed:false}},shipUpgrades:{},maintenanceCycles:{},shuttleCargo:{},shuttleDockings:[],shuttleFuelled:{},
   turnPhase:{turn:1,teamPhaseEndsAt:end,openAirspaceEndsAt:end,airspace:{state:'restricted',tickerActive:true,pressAccess:false}},
   unrestAlerts:{},populationAlerts:{},...(state?{smallShipStates:{[ship]:state}}:{}),...(isVoyage?{voyage33Maintenance:voyage,
    voyage33Admission:{type:'voyage-admission',sessionId:id,id:ship,status:'admitted',crisisId:'matrix',crisisRevision:0,population:40000,unrest:0,hostShipId:null,
     commitments:{requiresHostDocking:true,hostProvidesResources:true,maintenanceSteps:[1,2,3,4],maxConsoleCharges:1}}}:{}),});
  batch.set(db.doc(`sessions/${id}/players/${uid}`),{uid,sessionId:id,role:'gm',connected:true});
  batch.set(db.doc(`sessions/${id}/gmInstances/bridge`),{uid,connected:true,claimedAt:now,lastSeenAt:now});
  batch.set(db.doc(`sessions/${id}/gmInstances/bridge/private/shipConsoleWriteGrant`),{type:'gm-ship-console-write-grant',sessionId:id,instanceId:'bridge',uid,shipId:host,grantedAt:now});
  batch.set(db.doc(`sessions/${id}/serverState/navigation`),{shipGalacticCoordinates:{[host]:'0000'},shipNavigationLogs:{}});
  await batch.commit();
  const handler=isSmall?runSmallShipMaintenance:isVoyage?runVoyage33Maintenance:runMaintenance;
  const steps=isSmall||isVoyage?['begin','rations','unrest','riot','reactor','end']:['begin','storage','rations','unrest','riot','reactor',...Array(bays-5).fill('bays'),'end'];
  let revision=0;
  for(const [i,action]of steps.entries()){
   const consoles=isSmall?[population]:isVoyage?['hydroponics']:['jump-drive'];
   const data={sessionId:id,instanceId:'bridge',requestId:`matrix-${i}`,action,expectedRevision:revision,
    ...(isSmall?{smallShipId:ship}:{shipId:ship}),...(isVoyage?{expectedDockingRevision:0,expectedCycle:1}:{}),
    ...(action==='rations'?{foodLevel:3,waterLevel:3}:{}),...(action==='reactor'?{consoles}:{}),...(action==='bays'?{refuels:{}}:{})};
   const result=await handler.run(call(data));assert.equal(result.status,'committed',`${ship} ${action}`);
   const cycle=result.cycle;assert.equal(cycle.revision,revision+1);revision=cycle.revision;
   const after=(await session.get()).data();const beforeReplay=JSON.stringify(after);
   assert.equal((await handler.run(call(data))).status,'replayed');assert.equal(JSON.stringify((await session.get()).data()),beforeReplay);
   if(action==='rations'){assert.equal(after.shipResources[host].food,60-food);assert.equal(after.shipResources[host].water,60-water);}
   if(action==='unrest')assert.match(cycle.results[isSmall||isVoyage?'2':'3'],/Rolled [1-6] \+ [1-6]/);
  }
  const final=(await session.get()).data();const cycle=isSmall?final.smallShipStates[ship].cycle:isVoyage?final.voyage33Maintenance.cycle:final.maintenanceCycles[ship];
  assert.equal(cycle.step,0);assert.equal(cycle.turn,1);assert.ok(cycle.completedAt);assert.equal(cycle.charges.length,1);
  await assert.rejects(handler.run(call({sessionId:id,instanceId:'bridge',requestId:'second-cycle',action:'begin',expectedRevision:revision,
   ...(isSmall?{smallShipId:ship}:{shipId:ship}),...(isVoyage?{expectedDockingRevision:0,expectedCycle:1}:{})})),e=>e.code==='failed-precondition');
  completed.push({ship,steps:steps.length,completed:true,exactReplay:true,printedRations:true,serverDice:true,chargeRetained:true,secondCycleDenied:true});
 }finally{await db.recursiveDelete(session);}
}
const evidence={kind:'fixture-authenticated-native-production-handlers-real-firestore',checks:completed,productionGameplay:false,identitiesRetained:false,completedAt:new Date().toISOString()};
if(process.env.PC07_MATRIX_EVIDENCE_PATH)await writeFile(process.env.PC07_MATRIX_EVIDENCE_PATH,JSON.stringify(evidence,null,2)+'\n');
console.log(`PC07 native all-vessel matrix passed: ${completed.length}/12 printed paths.`);
