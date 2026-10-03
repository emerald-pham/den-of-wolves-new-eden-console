import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

/** This probe receives an ordinary authenticated session during real transit. */
export async function provePc07NavigationHttp(f){
 const {db,session,sessionId,wing,gm,instanceId,call,ok}=f;
 const navigation=await db.doc(`sessions/${sessionId}/serverState/navigation`).get();
 const actor=await db.doc(`sessions/${sessionId}/players/${wing.localId}`).get();
 const groupId=actor.get('fleetGroupId');
 const data={sessionId,requestId:randomUUID(),expectedGroupId:groupId,expectedNavigationRevision:navigation.get('revision'),expectedFleetPartitionRevision:(await session.get()).get('fleetPartitionRevision')??0};
 const before=Date.now();const first=ok(await call(wing,'readFleetGroupNavigation',data),'current group navigation');const after=Date.now();
 assert.equal(first.groupId,groupId);assert.ok(Date.parse(first.sampledAt)>=before&&Date.parse(first.sampledAt)<=after);
 assert.ok(first.ships.every(ship=>ship.fleetGroupId===groupId));
 assert.ok(first.ships.some(ship=>ship.shipId==='aegis'));
 assert.equal(first.transits.length,1);assert.equal(first.transits[0].shuttleId,'starlight');
 assert.equal(first.transits[0].sampledAt,first.sampledAt);assert.equal(first.transits[0].fleetGroupId,groupId);
 assert.equal(Object.hasOwn(first.transits[0],'origin'),false);
 assert.deepEqual(Object.keys(first.transits[0]).sort(),['arrivesAt','currentPosition','destinationShipId','fleetGroupId','sampledAt','shuttleId']);
 await new Promise(resolve=>setTimeout(resolve,150));
 const second=ok(await call(wing,'readFleetGroupNavigation',{...data,requestId:randomUUID()}),'fresh transit sample');
 assert.ok(Date.parse(second.sampledAt)>Date.parse(first.sampledAt));
 assert.notDeepEqual(second.transits[0].currentPosition,first.transits[0].currentPosition,'Server advances the sampled current point');
 const stale=await call(wing,'readFleetGroupNavigation',{...data,requestId:randomUUID(),expectedNavigationRevision:data.expectedNavigationRevision+1});assert.notEqual(stale.status,200);
 const forged=await call(wing,'readFleetGroupNavigation',{...data,requestId:randomUUID(),viewerShipId:'dione',instanceId});assert.notEqual(forged.status,200);
 const gmData={sessionId,requestId:randomUUID(),viewerShipId:'aegis',instanceId,expectedNavigationRevision:data.expectedNavigationRevision,expectedFleetPartitionRevision:data.expectedFleetPartitionRevision};
 assert.equal(ok(await call(gm,'readFleetGroupNavigation',gmData),'entitled GM current perspective').groupId,groupId);
 const privateRead=await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}/serverState/navigation`,{headers:{Authorization:`Bearer ${wing.idToken}`}});assert.equal(privateRead.status,403);
 return{kind:'normal-authenticated-local-emulator-http-navigation',checks:{sameGroupShips:true,realServerSampledTransit:true,currentPointChanges:true,sharedSampleInstant:true,staleDenied:true,forgedViewerDenied:true,entitledGmViewer:true,privateNavigationRulesDenied:true},projection:first,productionGameplay:false,preparedReviewScene:false,identitiesRetained:false};
}
