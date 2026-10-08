import assert from 'node:assert/strict';
import {assertSparseStationWing,runSparseStationCombat,stationBoardingRead,recoverStationLaunch,assertRecoveredStationLaunch,stationSurvivingRepairTargets} from './pc10-station-combat-adapter.mjs';
import {dispatchStationCrewChoice} from './pc10-station-crew-dispatch.mjs';
import {runMinimumCandidateSuccessProbe} from './pc10-minimum-candidate-success.mjs';
import { runPursuitLimitEnding } from './pc10-full-game-cycle-ending.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt, attachUiReceiptDiagnostics } from './pc10-browser-ui-receipt.mjs';
import { originalProofError, rememberProofFailure, retainProofFailure, heldProofFailureObservations } from './pc10-proof-failure-evidence.mjs';
import { observeFullGameCallableDiagnostics } from './pc10-full-game-demo-ui-proof.mjs';
import { observeFullGameDemoPresentationMember, proofRuntimeFromViteSource, validateProofRuntime } from './pc10-full-game-demo-proof-helpers.mjs';
import { observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt, openLifecycleSettings, closeLifecycleSettings } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { completeOfferedCyclePresentation } from './pc10-turn-cycle-demo-ui-proof.mjs';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { capturePc10Gate2SourceBinding } from './pc10-gate2-functional-proof.mjs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeOfferedTurnAdvance } from './pc10-full-game-demo-proof-helpers.mjs';

export function minimumRingPlan() {
 return { actualAuthenticatedActors:3, configuredRoles:13, browserProcesses:2, browserContexts:3,
  roles:['gm','shepherd-scientist','shepherd-engineer'], hardCapMs:1200000,
  unchangedEvidenceReplayed:false, sourceOnlyUntilAllocated:true };
}
export async function runRingWorkflow(operations) {
 await operations.setup();
 for(let cycle=1;cycle<=4;cycle++) {
  await operations.researchCycle(cycle);
  if(cycle<4)await operations.advance(cycle+1);
 }
 await operations.arrive();await operations.repairRing();await operations.crossAndRecover();
 await operations.finishPassages();await operations.sabotageAndClose();
}
export async function runStationCombatWaves({maximumWaves=12,assertActors,prepareAndDeclare,runWave,persistWaves,acknowledgeBetweenWaves}) {
 let liberated=false;const waves=[];
 for(let wave=1;wave<=maximumWaves&&!liberated;wave++){
  await assertActors({wave});
  await prepareAndDeclare({wave});
  const final=await runWave({wave});
  waves.push({wave,attackId:final.attackId,repeat:final.pStationRepeat});
  liberated=final.pStationRepeat.status==='stopped';
  await persistWaves(waves);
  if(!liberated&&wave<maximumWaves)await acknowledgeBetweenWaves?.({wave,final,nextWave:wave+1});
 }
 assert.equal(liberated,true,'Real Station combat must end with zero surviving Wolves before activation.');
 return waves;
}
export const stationBoardingReadEndpoint='getWolfBoardingDefenceChoice';
export async function runStationPaidArrivals(ships,{grant,jump}){for(const ship of ships){await grant(ship);await jump(ship);}}
export function beginStationCombatWing(original,current){assert.equal(original.cycle,1);assert.equal(current.cycle,2);assertSparseStationWing(current,{...original,cycle:2});return current;}
export function assertStationNavigation(navigation,ships,coordinate){return assertRingNavigation(navigation,ships,coordinate);}
export function stationActivationContext(input){return {code:'P',...input,gm:{...input.gm,callable:(name,data,options)=>{const timeoutMs=Math.min(options.timeoutMs,options.deadlineAt-Date.now());assert.ok(Number.isFinite(timeoutMs)&&timeoutMs>0);return input.gm.callable(name,data,timeoutMs);}},readRoot:async()=>({...await input.recordRoot(),sessionId:input.sessionId})};}
export async function readStationCombatGuardAuthority({db,scope}){
 assert.equal(scope.ownedSyntheticSession,true,'Only a fresh owned synthetic fixture may be inspected.');
 assert.match(scope.sessionId,/^[A-Za-z0-9_-]+$/);assert.equal(scope.sessionId,scope.ownedSessionId);
 assert.match(scope.projectId,/^demo-[a-z0-9-]+$/);assert.equal(scope.projectId,scope.expectedProjectId);
 assert.equal(db.projectId,scope.projectId,'Existing Admin client must belong to the allocated demo project.');
 assert.match(scope.firestoreHost,/^127\.0\.0\.1:[0-9]+$/);assert.equal(scope.firestoreHost,scope.expectedFirestoreHost);
 if(scope.gmInstanceId!==undefined)assert.match(scope.gmInstanceId,/^[A-Za-z0-9_-]{1,128}$/);
 const prefix=`sessions/${scope.sessionId}`;
 const [session,attack,pdfWing,players,fleetGroups,gmInstance]=await Promise.all([
  db.doc(prefix).get(),db.doc(`${prefix}/wolfAttackState/current`).get(),db.doc(`${prefix}/serverState/pdfEscortWing`).get(),
  db.collection(`${prefix}/players`).get(),db.collection(`${prefix}/fleetGroups`).get(),
  scope.gmInstanceId?db.doc(`${prefix}/gmInstances/${scope.gmInstanceId}`).get():Promise.resolve(null),
 ]);
 assert.equal(session.exists,true,'Owned fixture root must still exist.');
 return {sessionId:scope.sessionId,root:session.data(),authoritativeAttack:attack.exists?attack.data():null,
  pdfWing:pdfWing.exists?pdfWing.data():null,players:players.docs.map(player=>({...player.data(),uid:player.id})),
  fleetGroups:fleetGroups.docs.map(group=>({...group.data(),id:group.id})),
  gmInstance:gmInstance?.exists?{...gmInstance.data(),id:scope.gmInstanceId}:null,
  inspection:{channel:'isolated-emulator-admin-read-only',projectId:scope.projectId,firestoreHost:scope.firestoreHost,observedAt:new Date().toISOString()}};
}
export function stationCombatServerContext({sessionId,root,pdfWing,publicAudience,players,fleetGroups}){
 const keys=['currentTurn','phase','turnPhase','turnState','activeRoleIds','activeVesselIds','shipDamage','maintenanceCycles','shuttleControl','shuttleDockings','shuttleVisitLog','retainedShuttles','shuttleFuelled','maliadesState','shipResources','shipUpgrades','fighterWingCounts','smallShipStates','expansion','capybaraEnabled','shipSurvivors','shipUnrest','shipMutinies','populationAlerts','unrestAlerts','vesselActionRevisions','gameOutcome','survivorOutcome','debriefSnapshot','debriefMode','candidateState','navigation'];
 const playerKeys=['uid','role','assignedRoleId','activeConsoleRoleId','replacementRoleId','replacementStatus','connected','seatId','kickedAt','escapeState','fleetGroupId'];
 return {sessionId,...Object.fromEntries(keys.filter(key=>root[key]!==undefined).map(key=>[key,root[key]])),pdfEscortWing:pdfWing,publicAudience,fleetGroups:fleetGroups.map(group=>Object.fromEntries(['id','vesselIds','memberUids','memberShipIds'].filter(key=>group[key]!==undefined).map(key=>[key,group[key]]))),players:players.map(player=>Object.fromEntries(playerKeys.filter(key=>player[key]!==undefined).map(key=>[key,player[key]])))};
}
function stationPopulationGmAuthorityTuple({live,lifecycle,serverPlayer,serverInstance,claimInstance,expectedSessionId,expectedUid}){
 assert.ok(live&&lifecycle&&serverPlayer&&serverInstance,'Station GM authority requires both browser observers and current server-owned lease rows.');
 assert.equal(live.hasAuth,true);assert.equal(live.sameActor,true);assert.equal(live.sessionId,expectedSessionId,'Native live GM sessionId must match the original owned session.');assert.equal(live.connection,'live');assert.equal(live.freshness,'server');
 assert.ok(typeof live.uidHash==='string'&&live.uidHash.length>0);assert.ok(Number.isSafeInteger(live.connectionGeneration)&&live.connectionGeneration>=1,'Native live GM observer must expose its actual connectionGeneration.');
 assert.ok(Number.isSafeInteger(live.hydrationRevision)&&live.hydrationRevision>=1,'Native live GM observer must expose its actual hydrationRevision.');
 assert.equal(live.profileSessionId,null,'Native live GM profileSessionId must be null.');
 assert.equal(lifecycle.hasAuth,true);assert.equal(lifecycle.sameActor,true);assert.equal(lifecycle.sessionId,expectedSessionId);assert.equal(lifecycle.connection,'live');assert.equal(lifecycle.freshness,'server');
 assert.equal(lifecycle.uidHash,live.uidHash);assert.equal(lifecycle.generation,live.connectionGeneration,'Lifecycle generation must agree with the native live observer connectionGeneration.');
 assert.equal(lifecycle.hydrationRevision,live.hydrationRevision,'Both browser observations must share the current identity hydration revision.');
 assert.equal(lifecycle.playerRole,'gm');assert.equal(lifecycle.profileRoleId,null);
 assert.equal(lifecycle.gmInstanceOwned,true);assert.equal(live.gmInstanceOwned,true);assert.equal(lifecycle.instanceId,live.instanceId,'Lifecycle and native observer must share the current GM instanceId.');
 assert.ok(typeof live.instanceId==='string'&&live.instanceId.length>0);assert.ok(typeof lifecycle.claimedAt==='string'&&lifecycle.claimedAt.length>0,'Lifecycle observer must expose its actual claimedAt lease.');
 assert.equal(serverPlayer.uid,expectedUid);assert.equal(serverPlayer.sessionId,expectedSessionId);assert.equal(serverPlayer.role,'gm');assert.equal(serverPlayer.connected,true);
 assert.equal(serverPlayer.connectionGeneration,live.connectionGeneration,'Server player generation must agree with both current browser observations.');
 assert.equal(serverInstance.id,live.instanceId);assert.equal(serverInstance.uid,expectedUid);assert.equal(serverInstance.sessionId,expectedSessionId);assert.equal(serverInstance.connected,true);
 const claimedAt=ringGrantLeaseToken(serverInstance.claimedAt);assert.equal(lifecycle.claimedAt,claimedAt,'Browser lifecycle claim lease must match the current server-owned GM instance.');
 if(claimInstance){assert.equal(claimInstance.id,live.instanceId);assert.equal(claimInstance.uid,expectedUid);assert.equal(claimInstance.sessionId,expectedSessionId);
  assert.equal(claimInstance.claimedAt,claimedAt,'Original claim receipt must match the current server-owned GM instance lease.');}
 return {sessionId:expectedSessionId,uidHash:live.uidHash,generation:live.connectionGeneration,
  hydrationRevision:live.hydrationRevision,instanceId:live.instanceId,claimedAt};
}
export function stationPopulationGmActorAnchor(input){
 return Object.freeze(stationPopulationGmAuthorityTuple(input));
}
export function assertStationPopulationGmActorObserver(anchor,{live,lifecycle}){
 for(const key of ['sessionId','uidHash','hydrationRevision','instanceId'])assert.equal(lifecycle[key],anchor[key],`Original Station GM ${key} changed during population acknowledgment.`);
 assert.equal(live.sessionId,anchor.sessionId);assert.equal(live.uidHash,anchor.uidHash);assert.equal(live.hydrationRevision,anchor.hydrationRevision);
 assert.equal(live.connectionGeneration,anchor.generation,'Original Station GM native connectionGeneration changed during population acknowledgment.');
 assert.equal(lifecycle.generation,anchor.generation,'Original Station GM lifecycle generation changed during population acknowledgment.');
 assert.equal(lifecycle.claimedAt,anchor.claimedAt,'Original Station GM claim lease changed during population acknowledgment.');
 assert.equal(live.instanceId,anchor.instanceId);assert.equal(lifecycle.instanceId,anchor.instanceId);
}
export function assertStationPopulationGmActorAuthority(anchor,input){
 const current=stationPopulationGmAuthorityTuple(input);
 for(const key of ['sessionId','uidHash','generation','hydrationRevision','instanceId','claimedAt'])assert.equal(current[key],anchor[key],`Original Station GM ${key} changed during population acknowledgment.`);
 return true;
}
export function stationPopulationGmRetainedObserver(actor){
 assert.ok(actor?.live&&actor?.lifecycle,'A retained Station GM observation requires both actual browser observers.');
 const live={...actor.live},joinCodePresent=Object.hasOwn(live,'joinCode'),joinCodeWasNull=live.joinCode===null;
 delete live.joinCode;
 return {live,lifecycle:actor.lifecycle,redactions:{nativeJoinCode:{present:joinCodePresent,wasNull:joinCodeWasNull}}};
}
export async function stationPopulationGmAuthorityPreflight({readActor,readServerAuthority,claimInstance,expectedSessionId,expectedUid,onActorObservation=()=>{}}){
 const before=await readActor();onActorObservation('before',before);
 const server=await readServerAuthority(),current=await readActor();onActorObservation('current',current);
 const authorityInput=actor=>({...actor,serverPlayer:server.serverPlayer,serverInstance:server.serverInstance,claimInstance,expectedSessionId,expectedUid});
 const initialAnchor=stationPopulationGmActorAnchor(authorityInput(before));
 const anchor=stationPopulationGmActorAnchor(authorityInput(current));
 assert.deepEqual(anchor,initialAnchor,'Original GM authority changed during the claim preflight.');
 return {anchor,actor:current,serverAuthority:server};
}
export function stationPopulationAlertsForGm(populationAlerts,instanceId){
 assert.ok(typeof instanceId==='string'&&instanceId.length>0);
 const targets=Object.entries(populationAlerts??{}).filter(([,alert])=>alert?.targetGmInstanceIds?.includes(instanceId));
 return targets;
}
export function stationPopulationUiRows(alerts){return alerts.map(([shipId,alert])=>{assert.equal(alert.shipId,shipId);return{shipId,shipName:alert.shipName,population:alert.population,targetGmInstanceIds:alert.targetGmInstanceIds};});}
export function stationPopulationDialogMatches(dialog,alert){return dialog?.role==='alertdialog'&&dialog.name==='Survivor population threshold reached'&&dialog.text.includes(alert.shipName)&&dialog.text.includes(alert.population.toLocaleString('en-US'))&&dialog.text.includes('A census threshold requires GM attention.');}
function stationPopulationStable(value){return value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stationPopulationStable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stationPopulationStable(value[key])}`).join(',')}}`;}
export function stationPopulationSelectVisibleAlert(sourceAlerts,uiAlerts,dialog){
 const exactDialog=dialog?.role==='alertdialog'&&dialog.name==='Survivor population threshold reached';
 if(!sourceAlerts.length||stationPopulationStable(uiAlerts)!==stationPopulationStable(stationPopulationUiRows(sourceAlerts))||!exactDialog)return null;
 const[shipId,alert]=sourceAlerts[0];
 if(!stationPopulationDialogMatches(dialog,uiAlerts[0]))throw new Error('The exact visible population dialog does not match the first current-GM server alert.');
 return{shipId,alert};
}
export function stationDialogAccessibleName(labelledBy,labelTextById){
 return (labelledBy??'').split(/\s+/).map(id=>labelTextById?.[id]?.trim()).filter(Boolean).join(' ');
}
export function stationPopulationAckMutinyRows(context){
 const require=createRequire(new URL('../functions/package.json',import.meta.url));
 const {parseShipMutiny,isShipInMutiny}=require('./lib/mutiny.js');
 const ids=new Set([...(context.activeVesselIds??[]),...Object.keys(context.shipUnrest??{}),...Object.keys(context.shipMutinies??{})]);
 const blocked=[];
 for(const shipId of ids){
  assert.ok(typeof shipId==='string'&&shipId.length>0,'Stop on an invalid ship ID in population acknowledgment safety data.');
  const unrest=context.shipUnrest?.[shipId]??0;
  assert.ok(Number.isSafeInteger(unrest)&&unrest>=0&&unrest<=10,`Stop on invalid unrest for ${shipId}.`);
  const rawMutiny=context.shipMutinies?.[shipId],mutiny=parseShipMutiny(rawMutiny);
  assert.ok(rawMutiny==null||mutiny,`Stop on a malformed mutiny record for ${shipId}.`);
  if(isShipInMutiny(mutiny,unrest))blocked.push([shipId,mutiny]);
 }
 return blocked;
}
export async function stationPopulationDismissIntent({deadlineAt,now=Date.now,expected,readCurrentIntent,readIntentBookend,click}){
 assert.ok(Number.isFinite(deadlineAt)&&now()<deadlineAt,'Original Station wave deadline expired before population dismissal.');
 const current=await readCurrentIntent();
 assert.ok(now()<deadlineAt,'Original Station wave deadline expired during final population intent verification.');
 assert.deepEqual(current,expected,'Population dismissal intent changed before the normal click.');
 const bookend=await readIntentBookend();
 assert.ok(now()<deadlineAt,'Original Station wave deadline expired during the final population source bookend.');
 assert.deepEqual(bookend,{actor:expected.actor,source:expected.source,attack:expected.attack},'GM authority, source state, or final attack changed during the final mounted-control checks.');
 assert.ok(now()<deadlineAt,'Original Station wave deadline expired before the population dismissal click.');
 return click();
}
export function assertStationPopulationAcknowledgmentTransition(before,after,shipId){
 const unchanged=['sessionId','currentTurn','phase','turnPhase','turnState','activeRoleIds','activeVesselIds','shipDamage','maintenanceCycles','shuttleControl','shuttleDockings','shuttleVisitLog','retainedShuttles','shuttleFuelled','maliadesState','shipResources','shipUpgrades','fighterWingCounts','smallShipStates','expansion','capybaraEnabled','shipSurvivors','shipUnrest','shipMutinies','unrestAlerts','gameOutcome','survivorOutcome','debriefSnapshot','debriefMode','candidateState','navigation'];
 for(const key of unchanged)assert.deepEqual(after[key],before[key],`Population acknowledgment must not change ${key}.`);
 const priorAlerts={...(before.populationAlerts??{})};assert.ok(Object.hasOwn(priorAlerts,shipId),'Only a current server-owned population alert may be acknowledged.');delete priorAlerts[shipId];
 assert.deepEqual(after.populationAlerts??{},priorAlerts,'Only the exact acknowledged population alert may be removed.');
 const priorRevisions={...(before.vesselActionRevisions??{})},nextRevisions={...(after.vesselActionRevisions??{})};
 const expectedRevision=priorRevisions[shipId]??0;assert.ok(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0);
 assert.equal(nextRevisions[shipId],expectedRevision+1,'Dismissal must commit its one actual vessel revision.');
 delete priorRevisions[shipId];delete nextRevisions[shipId];assert.deepEqual(nextRevisions,priorRevisions,'Dismissal must not revise another vessel.');
 return {expectedRevision,revision:expectedRevision+1};
}
export function stationCombatConsoles(){return ['jump-drive','fighter-bay-alpha','fighter-bay-bravo'];}
export async function readStationLiberation(readDocument,root,expected){const require=createRequire(new URL('../functions/package.json',import.meta.url));const {parseCandidateStationLiberations}=require('../functions/lib/candidateStationLiberation.js');const markers=parseCandidateStationLiberations(await readDocument('serverState/candidateStationLiberations'));const marker=markers[`${expected.groupId}:${expected.coordinate}`];assert.ok(marker);for(const key of ['sessionId','groupId','coordinate','sourceId','cycle'])assert.equal(marker[key],expected[key]);assert.equal(marker.cycle,root.currentTurn);return marker;}
export function stationReady(value,roleId){return roleId==='press-officer'?value.activeConsoleRoleId===roleId&&value.assignedRoleId===null&&value.seatId===null&&value.pressEnabled&&value.pressCraftScopeMatches&&(value.phase==='casting'||(value.currentMemberBerthPresent&&value.currentMemberBerthNull&&value.memberVesselCount===0&&value.memberCraftCount===1)):value.activeConsoleRoleId===roleId&&value.seatId===roleId&&value.currentCanonicalSeatOwned;}
function stationLossEscapeTuple(value){
 const require=createRequire(new URL('../functions/package.json',import.meta.url)),{parsePlayerEscapeState}=require('../functions/lib/escapeState.js');
 const parsed=parsePlayerEscapeState(value);if(!parsed)return null;
 const keys=Object.keys(value).sort();
 assert.ok(keys.join(',')==='destructionEventId,revision,shipId,status'||
  keys.join(',')==='destructionEventId,fleeRequestId,revision,shipId,status',
  'Escape state must retain the exact server-owned tuple, including only its optional flee request ID.');
 return parsed;
}
function stationLossServerTuple(actor,root,player){
 const require=createRequire(new URL('../functions/package.json',import.meta.url)),{shipForRole}=require('../functions/lib/crewAccess.js');
 const shipId=shipForRole(actor.roleId);if(!shipId||root.shipDamage?.[shipId]?.destroyed!==true)return null;
 assert.ok(player&&typeof player==='object','Destroyed-host owner requires the current server player.');
 assert.equal(player.uid,actor.uid);assert.equal(player.sessionId,actor.original.sessionId);assert.equal(player.role,'player');
 assert.equal(player.assignedRoleId,actor.roleId);assert.equal(player.activeConsoleRoleId,null);assert.equal(player.seatId,actor.roleId);
 assert.equal(player.fleetGroupId,actor.original.fleetGroupId);assert.equal(player.connected,true);
 assert.ok(Number.isSafeInteger(player.connectionGeneration)&&player.connectionGeneration>=1,'Server player requires its current generation.');
 assert.ok(!player.kickedAt&&player.replacementRoleId==null&&player.replacementStatus==null);
 const escape=stationLossEscapeTuple(player.escapeState);assert.ok(escape,'Destroyed-host owner requires explicit current server escape state.');
 assert.equal(escape.status,'pending');assert.equal(escape.shipId,shipId);
 assert.equal(escape.fleeRequestId,undefined,'A server escape tuple with a flee request cannot qualify as an inactive owner.');
 return {shipId,escape};
}
function sameStationLossTuple(left,right){
 return left.shipId===right.shipId&&left.escape.status===right.escape.status&&left.escape.shipId===right.escape.shipId&&
  left.escape.destructionEventId===right.escape.destructionEventId&&left.escape.revision===right.escape.revision&&
  left.escape.fleeRequestId===right.escape.fleeRequestId;
}
export async function chooseStationCombatActor(current,{chooseWing,chooseCrew,pendingWingRecovery=false,deadlineAt}){const choice=await chooseWing(current,{deadlineAt});if(choice?.committed||pendingWingRecovery&&current.currentStep==='targeting')return choice;return chooseCrew(current,{deadlineAt});}
export function stationInactiveOwner(actor,root,player,member){
 const current=stationLossServerTuple(actor,root,player);if(!current)return false;
 for(const key of ['uidHash','sessionId','fleetGroupId'])assert.equal(member[key],actor.original[key]);
 assert.equal(member.meSessionId,actor.original.sessionId);assert.equal(member.hasAuth,true);assert.equal(member.sameActor,true);
 assert.equal(member.profileRoleId,null);assert.equal(member.profileSessionId,null);assert.equal(member.playerRole,'player');
 assert.equal(member.assignedRoleId,actor.roleId);assert.equal(member.activeConsoleRoleId,null);assert.equal(member.seatId,actor.roleId);
 assert.equal(member.freshness,'server');assert.equal(member.connectionGeneration,player.connectionGeneration);
 assert.equal(member.documentTimeOrigin,actor.original.documentTimeOrigin);assert.ok(Number.isSafeInteger(member.identityHydrationRevision)&&member.identityHydrationRevision>=1);
 assert.equal(member.browserProjectionConsistent,true);
 if(member.connected!==undefined)assert.equal(member.connected,true);
 if(member.currentOwnPlayerConfirmed!==undefined)assert.equal(member.currentOwnPlayerConfirmed,true);
 const browserEscape=stationLossEscapeTuple(member.escapeState);assert.ok(browserEscape,'Destroyed-host owner requires the actual browser escape tuple.');
 assert.equal(browserEscape.fleeRequestId,undefined,'A player with a flee request is not an eligible inactive owner.');
 for(const key of ['status','shipId','destructionEventId','revision'])assert.equal(browserEscape[key],current.escape[key]);
 assert.equal(member.escapeLocked,true);
 assert.equal(member.connection,'live');assert.equal(member.freshness,'server');assert.equal(member.kicked,false);
 assert.equal(member.replacementRoleId,null);assert.equal(member.replacementStatus,null);assert.deepEqual(member.invalidFields,[]);
 return true; // Read-only inactive custody owner; no private choice getter or mutation.
}
function stationLossBrowserSample(actor,player,member,anchor,current){
 const sample={
  uidHash:member.uidHash,sessionId:member.sessionId,meSessionId:member.meSessionId,hasAuth:member.hasAuth,sameActor:member.sameActor,
  profileRoleId:member.profileRoleId,profileSessionId:member.profileSessionId,playerRole:member.playerRole,
  assignedRoleId:member.assignedRoleId,activeConsoleRoleId:member.activeConsoleRoleId,seatId:member.seatId,fleetGroupId:member.fleetGroupId,
  replacementRoleId:member.replacementRoleId,replacementStatus:member.replacementStatus,kicked:member.kicked,
  connected:member.connected,currentOwnPlayerConfirmed:member.currentOwnPlayerConfirmed,
  connection:member.connection,freshness:member.freshness,connectionGeneration:member.connectionGeneration,
  documentTimeOrigin:member.documentTimeOrigin,identityHydrationRevision:member.identityHydrationRevision,
  escapeLocked:member.escapeLocked,escapeState:member.escapeState,escapeStateValid:member.escapeStateValid,
 };
 assert.equal(sample.uidHash,actor.original.uidHash);assert.equal(sample.sessionId,actor.original.sessionId);
 assert.equal(sample.meSessionId,actor.original.sessionId);assert.equal(sample.hasAuth,true);assert.equal(sample.sameActor,true);
 assert.equal(sample.profileRoleId,null);assert.equal(sample.profileSessionId,null);assert.equal(sample.playerRole,'player');
 assert.equal(sample.assignedRoleId,actor.roleId);assert.equal(sample.seatId,actor.roleId);assert.equal(sample.fleetGroupId,actor.original.fleetGroupId);
 assert.equal(sample.replacementRoleId,null);assert.equal(sample.replacementStatus,null);assert.equal(sample.kicked,false);
 assert.ok(['live','connecting','offline','disconnected'].includes(sample.connection),'Browser connection state is malformed.');
 assert.ok(sample.freshness===null||['server','cache','unknown'].includes(sample.freshness),'Browser freshness state is malformed.');
 if(member.connected!==undefined)assert.equal(typeof member.connected,'boolean');
 if(member.currentOwnPlayerConfirmed!==undefined)assert.equal(typeof member.currentOwnPlayerConfirmed,'boolean');
 assert.ok(Number.isSafeInteger(sample.connectionGeneration)&&sample.connectionGeneration>=1);
 assert.equal(sample.documentTimeOrigin,actor.original.documentTimeOrigin);
 assert.ok(Number.isSafeInteger(sample.identityHydrationRevision)&&sample.identityHydrationRevision>=1);
 assert.ok(sample.activeConsoleRoleId===null||sample.activeConsoleRoleId===actor.roleId,'Loss feed changed to a foreign console.');
 if(anchor){for(const key of ['connectionGeneration','documentTimeOrigin','identityHydrationRevision'])assert.equal(sample[key],anchor[key],`Original station loss ${key} changed while waiting.`);}
 if(sample.escapeStateValid===false)assert.fail('Browser escape state is malformed.');
 const baseProjection=Object.hasOwn(member,'browserProjectionConsistent'),incoherentBase=baseProjection&&member.browserProjectionConsistent!==true;
 const escape=sample.escapeState==null?null:stationLossEscapeTuple(sample.escapeState);
 if(escape){assert.equal(escape.status,'pending','Fled or otherwise finalized escape state cannot qualify as an inactive owner.');
  assert.equal(escape.fleeRequestId,undefined,'A flee request cannot qualify as an inactive owner.');
  for(const key of ['shipId','destructionEventId','revision'])assert.equal(escape[key],current.escape[key],`Browser loss ${key} differs from the pinned server tuple.`);}
 if(!incoherentBase)assert.equal(sample.escapeLocked,escape!==null);
 const phase=sample.activeConsoleRoleId===actor.roleId&&sample.escapeLocked===false?'before':
  sample.activeConsoleRoleId===null&&sample.escapeLocked===true?
   escape?.status==='pending'&&escape.shipId===current.escape.shipId?'after':'after-unverified':'other';
 if(phase==='other')assert.fail('Browser member is neither the original nor server-cleared loss projection.');
 if(player.connectionGeneration!==sample.connectionGeneration)assert.fail('Current server and browser generations differ.');
 return {sample,phase,escape};
}
function stationLossObservation(actor,root,player,member,attempt){
 const require=createRequire(new URL('../functions/package.json',import.meta.url)),{shipForRole}=require('../functions/lib/crewAccess.js');
 const shipId=shipForRole(actor.roleId),damage=shipId?root?.shipDamage?.[shipId]:null;
 const damageSummary=damage&&typeof damage==='object'?{
  destroyed:typeof damage.destroyed==='boolean'?damage.destroyed:null,
  damagedSystemIds:Array.isArray(damage.damagedSystemIds)&&damage.damagedSystemIds.every(value=>typeof value==='string')?damage.damagedSystemIds:[],
 }:null;
 const safeEscape=value=>value==null?null:{status:typeof value?.status==='string'?value.status:'invalid',
  shipId:typeof value?.shipId==='string'?value.shipId:null,destructionEventId:typeof value?.destructionEventId==='string'?value.destructionEventId:null,
  revision:Number.isSafeInteger(value?.revision)?value.revision:null,
  ...(typeof value?.fleeRequestId==='string'?{fleeRequestId:value.fleeRequestId}:{})};
 const safeBrowser=value=>value?{
  uidHash:value.uidHash??null,sessionId:value.sessionId??null,meSessionId:value.meSessionId??null,hasAuth:value.hasAuth===true,sameActor:value.sameActor===true,
  profileRoleId:value.profileRoleId??null,profileSessionId:value.profileSessionId??null,playerRole:value.playerRole??null,
  assignedRoleId:value.assignedRoleId??null,activeConsoleRoleId:value.activeConsoleRoleId??null,seatId:value.seatId??null,fleetGroupId:value.fleetGroupId??null,
  replacementRoleId:value.replacementRoleId??null,replacementStatus:value.replacementStatus??null,kicked:value.kicked===true,
  connected:value.connected===true,currentOwnPlayerConfirmed:value.currentOwnPlayerConfirmed===true,
  connection:value.connection??null,freshness:value.freshness??null,connectionGeneration:value.connectionGeneration??null,
  documentTimeOrigin:value.documentTimeOrigin??null,identityHydrationRevision:value.identityHydrationRevision??null,
  escapeLocked:value.escapeLocked===true,escapeState:safeEscape(value.escapeState),escapeStateValid:value.escapeStateValid!==false,
 } : null;
 return {attempt,roleId:actor.roleId,uidHash:actor.original.uidHash,sessionId:actor.original.sessionId,groupId:actor.original.fleetGroupId,
  shipId,root:{shipDamage:damageSummary},serverPlayer:player?{uidMatchesActor:player.uid===actor.uid,sessionId:player.sessionId??null,
   role:player.role??null,assignedRoleId:player.assignedRoleId??null,activeConsoleRoleId:player.activeConsoleRoleId??null,
   seatId:player.seatId??null,fleetGroupId:player.fleetGroupId??null,connectionGeneration:player.connectionGeneration??null,
   connected:player.connected===true,kicked:player.kickedAt!=null,replacementRoleId:player.replacementRoleId??null,
   replacementStatus:player.replacementStatus??null,escapeState:safeEscape(player.escapeState)}:null,
  browserMember:safeBrowser(member),browserLossSample:safeBrowser(member?.browserLossSample),
  browserLossSamples:Array.isArray(member?.browserLossSamples)?member.browserLossSamples.map(safeBrowser):null,
  browserAuthUidStable:member?.browserAuthUidStable!==false};
}
function stationLossProjectionPhase(actor,player,member,anchor,current){
 if(member.browserAuthUidStable===false)assert.fail('Browser Auth identity changed during the loss tuple read.');
 const members=Array.isArray(member.browserLossSamples)?member.browserLossSamples:
  member.browserLossSample?[member.browserLossSample,member]:[member];
 if(Array.isArray(member.browserLossSamples))assert.equal(member.browserLossSamples.length,2,'Browser loss read requires exactly two identity bookends.');
 const phases=members.map(value=>stationLossBrowserSample(actor,player,value,anchor,current));
 if(member.browserProjectionConsistent!==true)return 'pending';
 const compared=['uidHash','sessionId','meSessionId','hasAuth','sameActor','profileRoleId','profileSessionId','playerRole',
  'assignedRoleId','activeConsoleRoleId','seatId','fleetGroupId','replacementRoleId','replacementStatus','kicked','connected',
  'connection','freshness','connectionGeneration','documentTimeOrigin','identityHydrationRevision','escapeLocked','escapeState'];
 const sameProjection=(left,right)=>compared.every(key=>JSON.stringify(left.sample[key])===JSON.stringify(right.sample[key]));
 if(phases.some(value=>value.phase!=='after'||value.sample.connection!=='live'||value.sample.freshness!=='server'||
   value.sample.connected===false||value.sample.currentOwnPlayerConfirmed===false))return 'pending';
 if(phases.some(value=>!sameProjection(value,phases[0])))return 'pending';
 if(members.length>1&&members.some(value=>!compared.every(key=>{
  const current=key==='connected'?member.currentOwnPlayerConfirmed:member[key];
  return JSON.stringify(value[key]??null)===JSON.stringify(current??null);
 })))return 'pending';
 for(const value of phases){assert.ok(value.escape);for(const key of ['status','shipId','destructionEventId','revision'])assert.equal(value.escape[key],current.escape[key]);}
 return 'confirmed';
}
// This consumer seam lets source-shaped proof tests exercise the same actor
// selection and bounded normal-feed convergence used by the runner.
export async function selectStationCombatCrew(actors,{ships,readRoot,readPlayers,readMember,onInactive,onObservation,wait=delay,deadlineAt=Date.now()+5000}={}){
 assert.ok(Number.isFinite(deadlineAt),'Station owner selection requires the original operation deadline.');
 const require=createRequire(new URL('../functions/package.json',import.meta.url)),{shipForRole}=require('../functions/lib/crewAccess.js');
 assert.ok(Array.isArray(actors)&&actors.length>0,'Station owner selection requires the original planned crew.');
 assert.equal(new Set(actors.map(actor=>actor.uid)).size,actors.length,'Original station crew cannot contain duplicate owners.');
 const observations=[],anchors=new Map(),lossPins=new Map();let attempt=0;
 const remaining=()=>{const value=deadlineAt-Date.now();assert.ok(value>0,'Original station owner feed deadline expired.');return value;};
 const readBeforeDeadline=async(action,label)=>{remaining();const value=await action();remaining();return value;};
 try{
  while(true){remaining();attempt++;const root=await readBeforeDeadline(()=>readRoot(deadlineAt),'Station current host loss');if(ships)stationSurvivingRepairTargets(ships,root);
   const observationByUid=new Map();
   for(const actor of actors){const observation=stationLossObservation(actor,root,null,null,attempt);observations.push(observation);observationByUid.set(actor.uid,observation);onObservation?.(observation);}
   const rows=await readBeforeDeadline(()=>readPlayers(deadlineAt),'Station current custody owners');
   assert.ok(Array.isArray(rows),'Current station player collection is malformed.');
   const byUid=new Map();for(const player of rows){assert.ok(player&&typeof player==='object'&&typeof player.uid==='string'&&player.uid.length>0,'Current station player row is malformed.');
    assert.equal(byUid.has(player.uid),false,'Current station player collection contains a duplicate owner.');byUid.set(player.uid,player);}
   for(const actor of actors){const observation=observationByUid.get(actor.uid);Object.assign(observation,stationLossObservation(actor,root,byUid.get(actor.uid),null,attempt));}
   const active=[],inactive=[];let pending=false;
   for(const actor of actors){remaining();const player=byUid.get(actor.uid),observation=observationByUid.get(actor.uid),shipId=shipForRole(actor.roleId);
    const serverLost=!!shipId&&root.shipDamage?.[shipId]?.destroyed===true,pinned=lossPins.get(actor.uid);
    if(pinned&&!serverLost)assert.fail('Previously observed destroyed root changed before original owner confirmation.');
    let current=null;
    if(serverLost){current=stationLossServerTuple(actor,root,player);if(pinned){assert.ok(sameStationLossTuple(pinned,current),'Authoritative server loss tuple changed while waiting.');}
     else lossPins.set(actor.uid,current);}
    const member=await readBeforeDeadline(()=>readMember(actor,{loss:serverLost,deadlineAt}),'Station original owner projection');
    Object.assign(observation,stationLossObservation(actor,root,player,member,attempt));
    if(!serverLost){active.push(actor);continue;}
    let anchor=anchors.get(actor.uid);
    if(!anchor){
     assert.equal(member.documentTimeOrigin,actor.original.documentTimeOrigin);
     assert.ok(Number.isSafeInteger(member.identityHydrationRevision)&&member.identityHydrationRevision>=1);
     assert.ok(Number.isSafeInteger(member.connectionGeneration)&&member.connectionGeneration>=1);
     assert.equal(member.connectionGeneration,player.connectionGeneration,'First current browser and server generations must match.');
     anchor={connectionGeneration:member.connectionGeneration,documentTimeOrigin:member.documentTimeOrigin,identityHydrationRevision:member.identityHydrationRevision};
     anchors.set(actor.uid,anchor);
    }
    const phase=stationLossProjectionPhase(actor,player,member,anchor,current);
    if(phase==='pending'){pending=true;break;}
    stationInactiveOwner(actor,root,player,member);inactive.push({actor,member});
   }
   if(!pending){remaining();for(const {actor,member} of inactive){remaining();onInactive?.(actor,member);remaining();}remaining();return active;}
   await readBeforeDeadline(()=>wait(Math.min(200,remaining())), 'Station normal owner feed wait');
  }
 }catch(error){rememberProofFailure(error,{stationInactiveOwnerObservations:observations});throw error;}
}
export const stationRoleIds={Recipient:'wing-commander',Miner:'icebreaker-miner',Scientist:'shepherd-scientist',Explorer:'quellon-explorer',Colonel:'refinery-124-pdf-colonel',Press:'press-officer'};
// Read-only preflight of the actual normally admitted preset14 custody roster.
export function assertStationOwnerCustody(root,players,actorUids){
 const require=createRequire(new URL('../functions/package.json',import.meta.url));
 const {recommendedRoleIds}=require('../functions/lib/roleConfiguration.js');
 const {roleOwnedCraftForRoles,shuttleDockingsMatchRoleOwnedCraft}=require('../functions/lib/craftOwnership.js');
 const {parseShuttleControl}=require('../functions/lib/shuttleControl.js');
 assert.deepEqual([...root.activeRoleIds].sort(),[...recommendedRoleIds(14)].sort());
 assert.equal(root.pressEnabled,true);assert.equal(root.capybaraEnabled,false);
 assert.equal(shuttleDockingsMatchRoleOwnedCraft(root.activeRoleIds,root.shuttleDockings),true);
 const expected=roleOwnedCraftForRoles(root.activeRoleIds).filter(craft=>craft.kind==='shuttle'&&craft.enabledMode==='standard');
 assert.deepEqual(root.shuttleDockings.map(row=>row.shuttleId).sort(),expected.map(craft=>craft.id).sort(),'All six mandatory owned shuttles; optional Union craft must be absent.');
 const control=parseShuttleControl(root.shuttleControl);assert.ok(control,'Actual authoritative custody must parse.');
 const occupied=players.filter(player=>player.role==='player'&&!player.kickedAt);
 assert.equal(occupied.length,6);assert.equal(new Set(Object.values(actorUids)).size,7);
 for(const craft of expected){
  const owners=occupied.filter(player=>(player.assignedRoleId??(player.activeConsoleRoleId==='press-officer'?'press-officer':null))===craft.ownerRoleId);assert.equal(owners.length,1,`Printed owner for ${craft.id} is mandatory.`);
  const [label]=Object.entries(stationRoleIds).find(([,roleId])=>roleId===craft.ownerRoleId);
  assert.equal(owners[0].uid,actorUids[label]);assert.equal(control[craft.id]?.ownerRoleId,craft.ownerRoleId);
  assert.equal(control[craft.id]?.ownerUid,owners[0].uid);assert.equal(control[craft.id]?.holderUid,owners[0].uid);
 }
 return {actualAuthenticatedActors:7,configuredRoles:14,custodyValidated:true,mandatoryShuttleIds:expected.map(craft=>craft.id)};
}
export function minimumStationPlan(){return {actualAuthenticatedActors:7,configuredRoles:14,browserProcesses:1,browserContexts:7,hardCapMs:1200000,probeFamily:'station-success',forcedOutcome:false};}
export async function runStationWorkflow(operations){await operations.setup();await operations.stationArrivalMaintenance();await operations.stationDeferCombat();await operations.advance(2);await operations.stationCombatMaintenance();await operations.stationArrival();await operations.stationCombat();await operations.stationActivate();await operations.stationEnding();}
export function minimumPursuitClosurePlan(){return {actualAuthenticatedActors:2,configuredRoles:13,browserProcesses:1,browserContexts:2,hardCapMs:300000,probeFamily:'pursuit-closure',nClosedHistoryObserved:false};}
export async function presentPursuitCycle(surfaces,observe,present=completeOfferedCyclePresentation){for(const surface of surfaces)await present(surface,await observe(surface),{clearBriefing:true});}
export async function runPursuitClosureWorkflow(operations){await operations.setup();await operations.pursuitAndClose();}
export function validateRingAllocation(input) {
 assert.equal(input?.status,'EXPLICIT_PARENT_ALLOCATION_GRANTED','Runtime requires explicit parent allocation.');
 assert.ok(isAbsolute(input.sourceRoot));assert.match(input.projectId,/^demo-[a-z0-9-]+$/);
 const url=new URL(input.baseUrl);assert.equal(url.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
 assert.deepEqual(Object.keys(input.ports).sort(),['auth','firestore','functions']);
 assert.ok(Object.values(input.ports).every(port=>Number.isSafeInteger(port)&&port>0&&port<=65535));
 assert.equal(new Set([...Object.values(input.ports),Number(url.port)]).size,4);
 for(const key of ['sourceCommit','runnerSha256','compiledIndexSha256','compiledTreeSha256'])assert.match(input[key]??'',key==='sourceCommit'?/^[0-9a-f]{40}$/:/^[0-9a-f]{64}$/,key);
 return input;
}
// Ring-specific source contract seams. Pure fixtures are not runtime evidence.
export function ringGrantLeaseToken(stamp) { return typeof stamp==='string'?stamp:stamp.toDate().toISOString(); }
export function ringResearchRevision(view) { return view.researchRevision; }
export function assertRingWorkspace(view,{sessionId,groupId,cycle,coordinate,gm}) {
 assert.equal(view.type,'candidate-workspace');assert.equal(view.sessionId,sessionId);
 assert.equal(view.groupId,groupId);assert.equal(view.cycle,cycle);
 if(!gm)assert.equal(Object.hasOwn(view,'privateCalculations'),false,'Ordinary Ring workspace must not contain private calculations.');
 const paths=view.paths.filter(path=>path.code==='N'&&path.coordinate===coordinate);assert.equal(paths.length,1);
 return paths[0];
}
export function assertRingCandidateCommit(result,data,view) {
 assert.equal(result.type,'candidate-action-result');assert.equal(result.sessionId,data.sessionId,'Candidate result session must match original request.');assert.equal(result.requestId,data.requestId);
 assert.equal(result.action,data.action);assert.equal(result.code,'N');assert.equal(result.status,'committed');
 assert.equal(result.revision,view.revision+1);
}
export function assertRingResourceIncrease(result,root,shipId,resourceId,amount) {
 assert.equal(root.shipResources[shipId][resourceId],amount);assert.equal(result.amount,amount);
}
export function assertRingMaintenanceReply(result,root,shipId) {
 assert.equal(result.status,'committed');assert.deepEqual(root.maintenanceCycles[shipId],result.cycle);
}
export function assertRingResearchChoice(result,{trackId,cycle,oreCost}) {
 assert.equal(result.status,'committed');assert.equal(result.progress[trackId],cycle);assert.equal(result.oreCost,oreCost);
}
export function assertRingPaidArrival(result,before,after,shipId) {
 assert.equal(result.status,'jumped');assert.equal(before.shipResources[shipId].fuel-after.shipResources[shipId].fuel,result.fuelCost);
}
export function assertRingNavigation(navigation,ships,coordinate) {
 assert.ok(ships.every(ship=>navigation.get('shipGalacticCoordinates')[ship]===coordinate));
}
export function assertRingCraftConsumption(root,shuttleId) {
 assert.equal(root.candidateCraftReservations[shuttleId].code,'N');assert.ok(!root.shuttleDockings.some(dock=>dock.shuttleId===shuttleId));
}
export function assertRingSuccessfulSnapshot(root) {
 assert.equal(root.debriefSnapshot.source,'candidate');assert.equal(root.debriefSnapshot.result,'success');assert.equal(root.debriefSnapshot.candidate.code,'N');
}
export function isAcceptedRingClosedHistory(value,expected) {
 const paths=value.debriefPaths;
 return value.hasAuth&&value.sameActor&&value.phase==='closed'&&value.sessionId===expected.sessionId&&
  value.uidHash===expected.uidHash&&value.fleetGroupId===expected.groupId&&value.freshness==='server'&&
  Number.isSafeInteger(value.hydrationRevision)&&value.hydrationRevision>0&&
  value.debriefType==='session-debrief'&&value.debriefVersion===1&&value.debriefSource==='candidate'&&
  value.debriefResult==='success'&&value.debriefCandidateCode==='N'&&value.debriefCycle===expected.cycle&&
  value.debriefGroupCount===1&&value.debriefGroupsPrivacySafe===true&&Array.isArray(paths)&&
  paths.some(step=>step.action==='ring-repair'&&step.result==='completed')&&
  paths.some(step=>step.action==='sabotage-ring'&&step.result==='completed')&&
  expected.ships.every(shipId=>paths.some(step=>step.action==='ring-passage'&&step.result==='crossed'&&step.shipId===shipId&&step.fuelSpent===5));
}
export function assertRingClosedServerReceipt(endpoint,result,{sessionId,uid,groupId}) {
 let generation;
 if(endpoint==='resumeSession') {
  assert.equal(result.player.uid,uid);assert.equal(result.player.sessionId,sessionId);
  assert.equal(result.player.fleetGroupId,groupId);generation=result.player.connectionGeneration;
 }else {
  assert.equal(endpoint,'getCurrentMemberSession');assert.equal(result.type,'current-member-session');
  assert.equal(result.sessionId,sessionId);assert.equal(result.actorUid,uid);assert.equal(result.groupId,groupId);
  generation=result.connectionGeneration;
 }
 assert.ok(Number.isSafeInteger(generation)&&generation>=1);assert.equal(result.session.id,sessionId);
 assert.equal(result.session.phase,'closed');assertRingSuccessfulSnapshot(result.session);return generation;
}
export async function readRingEndingHistory(sdk,{sessionId,instanceId}) {
 const history=await sdk('getSessionDebrief',{sessionId,instanceId});
 assert.equal(history.type,'session-debrief');assert.equal(history.sessionId,sessionId);
 assertRingSuccessfulSnapshot({debriefSnapshot:history.snapshot});return history;
}
export async function readRingCoordinate(surface) {
 const chart=await surface.page.evaluate(async storeUrl=>{
  const {useSessionStore}=await import(storeUrl);const {auth}=await import('/src/lib/firebase.ts');
  const state=useSessionStore.getState(),uid=auth().currentUser?.uid,session=state.session;
  if(!uid||state.me?.uid!==uid||state.me?.role!=='gm'||state.gmInstance?.uid!==uid)throw new Error('Current entitled mounted GM chart required.');
  return{chartId:session?.chartId,locked:session?.configurationLocked===true||session?.chartSelectionLocked===true,
   candidates:Object.entries(session?.organiserSites??{}).filter(([,site])=>site.code==='N'&&site.candidate===true).map(([coordinate,site])=>({coordinate,code:site.code}))};
 },surface.storeModuleUrl());
 assert.equal(chart.chartId,'A');assert.equal(chart.locked,true,'Require actual locked GM chart.');
 assert.equal(chart.candidates.length,1,'Actual GM chart must contain exactly one Ring candidate.');
 assert.equal(chart.candidates[0].code,'N');assert.match(chart.candidates[0].coordinate,/^\d{4}$/);
 return chart.candidates[0].coordinate;
}
export async function readStationCoordinate(surface) {
 const chart=await surface.page.evaluate(async storeUrl=>{
  const {useSessionStore}=await import(storeUrl);const {auth}=await import('/src/lib/firebase.ts');
  const state=useSessionStore.getState(),uid=auth().currentUser?.uid,session=state.session;
  if(!uid||state.me?.uid!==uid||state.me?.role!=='gm'||state.gmInstance?.uid!==uid)throw new Error('Current entitled mounted GM chart required.');
  return{chartId:session?.chartId,locked:session?.configurationLocked===true||session?.chartSelectionLocked===true,
   candidates:Object.entries(session?.organiserSites??{}).filter(([,site])=>site.code==='P'&&site.candidate===true).map(([coordinate,site])=>({coordinate,code:site.code}))};
 },surface.storeModuleUrl());
 assert.equal(chart.chartId,'B');assert.equal(chart.locked,true,'Require actual locked GM chart.');
 assert.equal(chart.candidates.length,1,'Actual GM chart must contain exactly one Station candidate.');
 assert.equal(chart.candidates[0].code,'P');assert.match(chart.candidates[0].coordinate,/^\d{4}$/);
 return chart.candidates[0].coordinate;
}
export function createRingMaintenancePacer({now=Date.now,wait=delay}={}) {
 let last=null;
 return async()=>{if(last!==null){const remaining=last+2100-now();if(remaining>0)await wait(remaining);}last=now();};
}
export function assertFreshRingIdentity(user,startAt,preexistingUids) {
 assert.equal(preexistingUids.has(user.uid),false,'Never delete a preexisting Auth identity.');
 assert.ok(Date.parse(user.metadata.creationTime)>=Math.floor(startAt/1000)*1000,'Require own fresh Auth identity.');
}
export function assertRingRuntimeClean(errors,remoteRequests) {
 assert.deepEqual(errors,[],'Native page errors prevent proof acceptance.');
 assert.deepEqual(remoteRequests,[],'Blocked remote requests prevent proof acceptance.');
}
export function expectedRingRecoveryReply(original) { return {...original,status:'replayed'}; }
export function finalizeRingEvidence(evidence, cleanup, originalFailure) {
 evidence.cleanup=cleanup;
 if(cleanup.errors.length){
  evidence.status='failed';
  return originalFailure??new Error('Owned cleanup incomplete; no successful proof closeout.');
 }
 return originalFailure;
}
export async function runFreshMinimumRingProof({allocationPath,directory,probeFamily='ring'}) {
 assert.ok(isAbsolute(allocationPath)&&isAbsolute(directory));
 const allocation=validateRingAllocation(JSON.parse(await readFile(allocationPath,'utf8')));
 const closureOnly=probeFamily==='pursuit-closure',stationOnly=probeFamily==='station-success',sparse=closureOnly||stationOnly;assert.ok(sparse||probeFamily==='ring');
 if(sparse)assert.equal(allocation.probeFamily,probeFamily);
 const plan=closureOnly?minimumPursuitClosurePlan():stationOnly?minimumStationPlan():minimumRingPlan();
 const {sourceRoot:root,projectId,baseUrl,ports}=allocation;
 assert.ok(!resolve(directory).startsWith(resolve(root)+'/'),'Evidence stays outside source.');
 const hash=value=>createHash('sha256').update(value).digest('hex'),short=value=>hash(value).slice(0,16);
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 assert.equal(sourceCommit,allocation.sourceCommit);
 assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'');
 assert.equal(hash(await readFile(new URL(import.meta.url))),allocation.runnerSha256);
 assert.equal(hash(await readFile(`${root}/functions/lib/index.js`)),allocation.compiledIndexSha256);
 const sourceBinding=await capturePc10Gate2SourceBinding(root,fileURLToPath(import.meta.url));
 assert.equal(sourceBinding.compiledTreeSha256,allocation.compiledTreeSha256);
 const require=createRequire(`${root}/package.json`),{chromium}=require('playwright');
 const browsers=[],surfaces=[],errors=[],calls=[],requests=[],remoteRequests=[],states=[],receipts=[],claims=[];
 let gm,owner,recipient,sid,joinCode,stage='not-started',consumed=null,primaryFailure=null;
 const startAt=Date.now(),totalEnd=startAt+plan.hardCapMs,workEnd=totalEnd-60000;
 const actorUids=new Map(),pendingLaunches=[],preexistingUids=new Set();let stopped=false;
 const paceMaintenance=createRingMaintenancePacer();
 const roleIds=stationOnly?stationRoleIds:{Owner:'shepherd-engineer',Recipient:'shepherd-scientist'};
 const stationCrew=[];
 const evidence={schemaVersion:1,...plan,sourceCommit,runnerSha256:allocation.runnerSha256,
  compiledIndexSha256:allocation.compiledIndexSha256,sourceBinding,actualHumans:0,actualBrowserProcesses:0,
  actualBrowserContexts:0,actualAuthenticatedActors:0,adminGameplayWrites:0,acceleratedClock:false,
  normalOriginPersistence:true,authCredentialInjection:false,demoCrewPreparation:false,
  wholeGameProof:false,capacityProof:false,endingProof:false,visualUsabilityAccepted:false,
  discoveryPreparationEvidenceReused:true,priorResearchEvidenceReusedWithinOriginalScopeOnly:true,
  sourceOnlyUntilAllocated:false,states,receipts,claims,errors,remoteRequests,
  startedAt:new Date(startAt).toISOString(),originalOperationTimeoutMs:60000};
async function bounded(operation,timeout,name,onTimeout=()=>{}) {let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(new Error(name));},timeout);})]);}finally{clearTimeout(timer);}}
function budget() { if(lossAckFirstError)throw lossAckFirstError;assert.equal(stopped,false,'Work has stopped; do not begin a subsequent action.');assert.ok(Date.now()+60000<=workEnd,'Not enough cap budget to begin another full original60s operation and normal cleanup.'); }
async function mark(name) { budget();stage=name; await writeFile(`${directory}/progress.json`,JSON.stringify({sourceCommit,stage,elapsedMs:Date.now()-startAt,claims},null,2)+'\n');console.log(JSON.stringify({stage,elapsedMs:Date.now()-startAt})); }
async function snapshot(surface,label) { const value=await observeLifecycleActor(surface,sid);states.push({label,origin:new URL(surface.page.url()).origin,state:value});consumed={stage,label,state:value};await writeFile(`${directory}/consumed-state.json`,JSON.stringify(consumed,null,2)+'\n');return value; }
async function register(surface,label) { const uid=await surface.page.evaluate(async()=>{const {auth}=await import('/src/lib/firebase.ts');if(!auth().currentUser)throw new Error('Normal admission has no Auth user.');return auth().currentUser.uid;});assert.ok(![...actorUids.values()].includes(uid),'Require independent normally admitted Auth identities.');actorUids.set(label,uid);evidence.actualAuthenticatedActors=actorUids.size;await writeFile(`${directory}/owned-identities.json`,JSON.stringify({sid,joinCode,actors:Object.fromEntries(actorUids)},null,2)+'\n',{mode:0o600}); }
async function action(surface,endpoint,choose,options={}) { budget();const value=await captureLifecycleUiAction(surface,endpoint,()=>{budget();return choose();},options);receipts.push(publicLifecycleReceipt(value));return value; }
  async function surface(label) {
    let browser=browsers[!sparse&&label.includes('Scientist')?1:0];
    if(!browser){browser=await chromium.launch({channel:'chrome',headless:true});browsers.push(browser);}
    evidence.actualBrowserProcesses=browsers.length;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
      if (['127.0.0.1', 'localhost'].includes(url.hostname) &&
        [new URL(baseUrl).port, ...Object.values(ports).map(String)].includes(url.port)) return route.continue();
      remoteRequests.push(`${url.origin}${url.pathname}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(35_000); page.setDefaultNavigationTimeout(35_000);
    let storeUrl = '/src/store/useSessionStore.ts', sdkUrl = '/node_modules/.vite/deps/firebase_functions.js';
    let authorityUrl = null;
    page.on('pageerror', error => errors.push({ surface: label, message: error.message, originalError: originalProofError(error) }));
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) authorityUrl = null;
      // Retain this document's first normal App/SDK import, including Vite's
      // query. Later bare proof imports must not replace its module identity.
      if (url.pathname === '/src/lib/sessionSnapshotAuthority.ts' && authorityUrl === null) authorityUrl = url.href;
      if (url.pathname === '/src/store/useSessionStore.ts') storeUrl = url.href;
      if (url.pathname.endsWith('/firebase_functions.js')) sdkUrl = url.href;
      const endpoint = url.pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
      if (endpoint && request.method() === 'POST') requests.push({ surface: label, endpoint,
        transport: 'actual browser Firebase SDK', at: new Date().toISOString() });
    });
    page.on('response', response => {
      const endpoint = new URL(response.url()).pathname.match(/\/us-central1\/([A-Za-z][A-Za-z0-9_]*)$/)?.[1];
      if (endpoint && response.request().method() === 'POST') calls.push({ surface: label, endpoint,
        transport: 'actual browser Firebase SDK', status: response.status(), at: new Date().toISOString() });
    });
    async function observe() {
      return page.evaluate(async moduleUrl => {
        const { auth } = await import('/src/lib/firebase.ts');
        const { activeDemoActorProfile } = await import('/src/lib/demoActorContext.ts');
        const { useSessionStore } = await import(moduleUrl);
        const originalUid = auth().currentUser?.uid;
        const hash = async value => value ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
          .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
        const uidHash = await hash(originalUid);
        // Digest first so this observation's store and Auth tuple is current.
        const state = useSessionStore.getState(), user = auth().currentUser;
        if (user?.uid !== originalUid) throw new Error('Original Auth UID changed during full-game actor observation.');
        return { hasAuth: !!user, sameActor: !!user && state.me?.uid === user.uid, uidHash,
          documentTimeOrigin: performance.timeOrigin,
          sessionId: state.session?.id ?? null, joinCode: state.session?.joinCode ?? null,
          cycle: state.session?.currentTurn ?? null, phase: state.session?.phase ?? null,
          announcementTurn: state.session?.turnStartAnnouncement?.turn ?? null,
          announcementRevision: state.session?.turnStartAnnouncement
            ? state.session.turnStartAnnouncement.revision ?? 0 : null,
          naturalTransmissionMounted: document.querySelector('.intrusion--fleet .turn-start-announcement__console')?.isConnected === true,
          ordinaryBriefingMounted: document.querySelector('[aria-label="Cycle briefing clearance"]')?.isConnected === true,
          ordinaryBriefingHeld: state.session?.turnPhase?.timerPause?.reason === 'turn-interstitial',
          playerRole: state.me?.role ?? null, profileRoleId: activeDemoActorProfile?.roleId ?? null,
          profileSessionId: activeDemoActorProfile?.sessionId ?? null,
          assignedRoleId: state.me?.assignedRoleId ?? null, activeConsoleRoleId: state.me?.activeConsoleRoleId ?? null,
          connection: state.connection, freshness: state.sessionSnapshotFreshness,
          hydrationRevision:state.identityHydrationRevision,fleetGroupId:state.me?.fleetGroupId??null,
          connectionGeneration:state.me?.connectionGeneration??null,
          communicationError: state.communicationError ? { code: state.communicationError.code,
            kind: state.communicationError.kind ?? null } : null,
          setupUi: { confirmEnabled: [...document.querySelectorAll('button')].some(button =>
            button.getAttribute('aria-label') === 'Confirm setup // Confirm roster' && !button.disabled),
            rosterStatus: document.querySelector('[aria-label="Roster confirmation status"]')?.textContent ?? '',
            authorityStatus: document.querySelector('[aria-label="Setup authority status"]')?.textContent ?? '' },
          gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === state.me?.uid && state.gmInstance.sessionId === state.session?.id,
          instanceId: state.gmInstance?.id ?? null, setupConfirmed: state.session?.setupConfirmed ?? false,
          setupRevision: state.session?.setupRevision ?? null, activeRoleIds: state.session?.activeRoleIds ?? [],
          activeVesselIds: state.session?.activeVesselIds ?? [], pressEnabled: state.session?.pressEnabled !== false,
          capybaraEnabled: state.session?.capybaraEnabled !== false,
          fullGameDemo: state.session?.fullGameDemo ?? null, phaseProgression: state.session?.turnPhase?.progression ?? null,
          airspace: state.session?.turnPhase?.airspace.state ?? null, turnStatePhase: state.session?.turnState?.phase ?? null,
          turnStatePhaseRevision: state.session?.turnState?.phaseRevision ?? null,
          gameOutcomeCause: state.session?.gameOutcome?.cause ?? null,
          debriefType: state.session?.debriefSnapshot?.type ?? null,
          debriefVersion: state.session?.debriefSnapshot?.version ?? null,
          debriefSource: state.session?.debriefSnapshot?.source ?? null,
          debriefResult: state.session?.debriefSnapshot?.result ?? null,
          debriefCause: state.session?.debriefSnapshot?.cause ?? null,
          debriefCycle: state.session?.debriefSnapshot?.cycle ?? null,
          debriefCandidateCode:state.session?.debriefSnapshot?.candidate?.code??null,
          debriefGroupCount:state.session?.debriefSnapshot?.candidate?.groups?.length??null,
          debriefPaths:state.session?.debriefSnapshot?.candidate?.groups?.flatMap(group=>group.path??[])??[],
          debriefGroupsPrivacySafe:state.session?.debriefSnapshot?.candidate?.groups?.every(group=>
            !Object.hasOwn(group,'groupId')&&(group.path??[]).every(step=>!Object.hasOwn(step,'audience')))??false,
          privateLoyaltyPresent: !!state.privateLoyalty, briefRoleId: state.roleBrief?.roleId ?? null,
          briefMatchesActor: !!state.roleBrief && state.roleBrief.assignmentUid === user?.uid,
          pendingCommandCount: state.pendingCommands.length };
      }, storeUrl);
    }
    async function until(description, predicate, timeout = 60_000) {
      const deadline = Date.now() + timeout; let current;
      while (Date.now() < deadline) {
        current = await observe(); if (predicate(current)) return current; await delay(250);
      }
      throw new Error(`${description}: ${JSON.stringify(current)}`);
    }
    async function consent() {
      const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
      const admissionDeadline = Date.now() + 35_000;
      while (!(await waiver.isVisible()) && Date.now() < admissionDeadline) {
        const failed = calls.find(call => call.surface === label &&
          ['createSession', 'joinSession'].includes(call.endpoint) && call.status >= 400);
        if (failed) throw new Error(`Real ${failed.endpoint} returned HTTP ${failed.status} before consent mounted.`);
        await delay(100);
      }
      assert.equal(await waiver.isVisible(), true, 'Normal admission must mount the consent dialog.');
      const checks = waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ });
      assert.equal(await checks.count(), 3);
      for (const checkbox of await checks.all()) await checkbox.check();
      const button = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
      const deadline = Date.now() + 30_000;
      while (!(await button.isEnabled()) && Date.now() < deadline) await delay(100);
      assert.equal(await button.isEnabled(), true, 'Existing regulations and countdown are required.');
      await button.click(); await waiver.waitFor({ state: 'hidden' });
    }
    async function callable(name, data, timeoutMs=35000) {
      return page.evaluate(async ({ name, data, sdkUrl, timeoutMs }) => {
        const { functions } = await import('/src/lib/firebase.ts');
        const { httpsCallable } = await import(sdkUrl);
        try { return { status: 'committed', result: (await httpsCallable(functions(), name, {timeout:timeoutMs})(data)).data }; }
        catch (error) { return { status: 'denied', code: error.code, message: error.message }; }
      }, { name, data, sdkUrl, timeoutMs });
    }
    async function reducedMotion() {
      const button = page.getByRole('button', { name: /^REDUCED MOTION/i });
      if (await button.isVisible().catch(() => false)) await button.click();
    }
    async function paintTwoFrames() {
      await page.evaluate(() => new Promise(resolveFrame => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame(true)));
      }));
    }
    const result = { label, page, context, observe, until, consent, callable, reducedMotion, paintTwoFrames,
      storeModuleUrl: () => storeUrl, sessionAuthorityModuleUrl: () => authorityUrl };
    attachUiReceiptDiagnostics(page, { directory, label, inspectState: () => observeFullGameCallableDiagnostics(result) });
    surfaces.push(result); evidence.actualBrowserContexts=surfaces.length; return result;
  }
async function launchSurface(label) {
 budget();const pending=surface(label).then(async value=>{if(stopped){await value.context.browser().close();throw new Error('Owned launch settled after stop; closed it.');}return value;});pendingLaunches.push(pending);const value=await pending;
 await value.context.route('**/us-central1/*',route=>stopped?route.abort():route.fallback());budget();return value;
}


 process.env.FIRESTORE_EMULATOR_HOST=`127.0.0.1:${ports.firestore}`;
 process.env.FIREBASE_AUTH_EMULATOR_HOST=`127.0.0.1:${ports.auth}`;
 const adminRequire=createRequire(`${root}/functions/package.json`);
 const {initializeApp,deleteApp}=adminRequire('firebase-admin/app');
 const {getFirestore}=adminRequire('firebase-admin/firestore'),{getAuth}=adminRequire('firebase-admin/auth');
 const adminApp=initializeApp({projectId},`pc10-ring-${Date.now()}`),db=getFirestore(adminApp),adminAuth=getAuth(adminApp);
 const {fleetGroupRecord}=adminRequire(`${root}/functions/lib/fleetGroups.js`);
 const {MAINTENANCE_ORDERS}=adminRequire(`${root}/functions/lib/maintenanceOrder.js`);
 const {MAINTENANCE_RULES}=adminRequire(`${root}/functions/lib/maintenance.js`);
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stable).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
let gm1Instance,gm1OriginalAuthority,gm1ClaimInstance;
async function liveGm(surface,label,phase,{deadlineAt=Date.now()+60000}={}) {
 const remaining=()=>{const left=deadlineAt-Date.now();assert.ok(left>0,'Original live GM operation deadline expired.');return left;};
 const expectedUidHash=short(actorUids.get(label));
 const value=await bounded(surface.until(`${label} original normally authenticated live GM`,v=>{
  if(v.hasAuth)assert.equal(v.uidHash,expectedUidHash,'Original GM Auth UID changed.');
  if(v.sessionId!==null)assert.equal(v.sessionId,sid,'Original GM displayed a foreign session.');
  return v.hasAuth&&v.sameActor&&v.sessionId===sid&&v.playerRole==='gm'&&v.gmInstanceOwned&&v.connection==='live'&&v.freshness==='server'&&v.profileRoleId===null&&v.profileSessionId===null&&(!phase||v.phase===phase);
 },remaining()),remaining(),'Original live GM readiness deadline expired.');
 const expectedInstance=gm1Instance;if(expectedInstance)assert.equal(value.instanceId,expectedInstance);
 const sdk=await bounded(surface.page.evaluate(async({sid,authorityUrl,storeUrl})=>{
  const{auth}=await import('/src/lib/firebase.ts');const{useSessionStore}=await import(storeUrl);const authority=await import(authorityUrl);const uid=auth().currentUser?.uid,state=useSessionStore.getState();
  if(!uid||state.me?.uid!==uid||state.session?.id!==sid||state.me?.role!=='gm'||state.gmInstance?.uid!==uid)throw new Error('Current original GM tuple required.');
  const own=authority.sessionSnapshotAuthorityFor(sid,uid);return {ownAuthority:own.hasServerSessionAuthority,resumePending:authority.memberSessionResumeBlocksFreshness(own),wrongSessionAuthority:authority.sessionSnapshotAuthorityFor('pc10-absent-session-control',uid).hasServerSessionAuthority};
 },{sid,authorityUrl:surface.sessionAuthorityModuleUrl(),storeUrl:surface.storeModuleUrl()}),remaining(),'Original live GM SDK witness deadline expired.');
 assert.deepEqual(sdk,{ownAuthority:true,resumePending:false,wrongSessionAuthority:false});remaining();return value;
}

async function authorizeAndClaim(surface,label,name) {
 const before=await snapshot(surface,`${label}-before-normal-local-authorization`),origin=new URL(surface.page.url()).origin;
 const settings=await openLifecycleSettings(surface),authorize=settings.getByRole('button',{name:'Authorize local emulator GM',exact:true});
 await authorize.waitFor({state:'visible',timeout:35000});
 const response=await observeUiReceipt({page:surface.page,consumed:{stage,label,credentialPayloadRecorded:false},waitForResponse:()=>surface.page.waitForResponse(r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname==='/__local-gm-access'&&r.request().method()==='POST',{timeout:60000}),choose:()=>authorize.click()});
 assert.equal(response.status(),200);assert.equal((await response.json()).authenticated,true);
 await settings.getByRole('button',{name:'Revoke GM access',exact:true}).waitFor();const authorized=await snapshot(surface,`${label}-normally-authorized`);
 for(const key of ['uidHash','sessionId','generation','playerRole'])assert.equal(authorized[key],before[key]);assert.equal(authorized.gmInstanceOwned,false);assert.equal(authorized.gmAccessCached,true);
 await closeLifecycleSettings(settings);await surface.page.getByRole('link',{name:/GM join$/i}).click();await surface.page.getByLabel('Input GM Name',{exact:true}).fill(name);
 const claimed=await action(surface,'claimGmInstance',()=>surface.page.getByRole('button',{name:'Join as GM',exact:true}).click());
 const live=await liveGm(surface,label);assert.equal(claimed.data.instanceId,live.instanceId);assert.equal(claimed.result.instance.id,live.instanceId);
 gm1Instance=live.instanceId;gm1ClaimInstance=claimed.result.instance;
 const deadlineAt=Date.now()+60000,preflight=await stationPopulationGmAuthorityPreflight({
  readActor:()=>readStationGmActor(surface,label,null,deadlineAt),
  readServerAuthority:()=>readStationGmAuthorityServerRows(deadlineAt,gm1Instance,'Original GM claim server preflight'),
  claimInstance:gm1ClaimInstance,expectedSessionId:sid,expectedUid:actorUids.get(label),
  onActorObservation:(sample,actor)=>states.push({label:`${label} GM claim preflight ${sample} browser authority`,actor:label,
   browserObservation:stationPopulationGmRetainedObserver(actor)})});
 gm1OriginalAuthority=preflight.anchor;
 claims.push(`${label} ordinary admission/consent, normal local GM authorization and independent owned live instance`);return live;
}

const lossAcks=[],lossAckErrors=[],lossAckControls=[];evidence.lossAcks=lossAcks;evidence.lossAckErrors=lossAckErrors;
let lossAckFirstError=null,notifyLossAckFailure;const lossAckFailure=new Promise(resolve=>{notifyLossAckFailure=resolve;});
function latchLossAckError(error,endpoint){lossAckErrors.push({endpoint,error:originalProofError(error)});if(!lossAckFirstError){lossAckFirstError=error;stopped=true;notifyLossAckFailure(error);}}
async function candidateWait(run,deadlineAt,label){budget();const remaining=deadlineAt-Date.now();assert.ok(remaining>0,`Original candidate operation deadline expired: ${label}`);const operation=Promise.resolve().then(()=>{budget();return run();});const value=await bounded(Promise.race([operation,lossAckFailure.then(error=>{throw error;})]),remaining,`Original candidate operation deadline expired: ${label}`,()=>{stopped=true;});budget();assert.ok(Date.now()<deadlineAt,`Original candidate operation deadline expired: ${label}`);return value;}
async function readStationGmAuthorityServerRows(deadlineAt,instanceId,label='Station original GM authority source read'){
 const authority=await candidateWait(()=>readStationCombatGuardAuthority({db,scope:{ownedSyntheticSession:true,sessionId:sid,ownedSessionId:sid,
  projectId,expectedProjectId:allocation.projectId,firestoreHost:process.env.FIRESTORE_EMULATOR_HOST,
  expectedFirestoreHost:`127.0.0.1:${ports.firestore}`,gmInstanceId:instanceId}}),deadlineAt,label);
 const uid=actorUids.get('GM1'),serverPlayer=authority.players.find(player=>player.uid===uid),serverInstance=authority.gmInstance;
 assert.ok(serverPlayer,'Current original GM player row must remain present.');assert.ok(serverInstance,'Current original GM instance lease must remain present.');
 return {authority,serverPlayer,serverInstance};
}
async function readStationGmActor(surface,label,phase,deadlineAt){
 const live=await liveGm(surface,label,phase,{deadlineAt});
 const lifecycle=await candidateWait(()=>observeLifecycleActor(surface,sid),deadlineAt,'Original Station GM lifecycle actor read');
 return {live,lifecycle};
}
async function installLossAck(surface,endpoint,waitCommitted,operationDeadlineAt=Date.now()+60000) {
 const pattern=`**/us-central1/${endpoint}`,record={surface:surface.label,endpoint,heldRetries:0,normalRecoveries:0,successfulRecoveries:0,recoveringReplies:[]};
 let mode='hold',firstStarted=false,firstError=null,settleFirst,settleRecovery;const first=new Promise(resolve=>{settleFirst=resolve;}),recovery=new Promise(resolve=>{settleRecovery=resolve;});const running=new Set();
 const fail=error=>{if(!firstError){firstError=error;record.originalError=originalProofError(error);}latchLossAckError(error,endpoint);settleRecovery({error:firstError});};
 const healthy=()=>{if(firstError)throw firstError;};
 const handler=route=>{
  const task=(async()=>{
   const deadlineAt=Math.min(operationDeadlineAt,Date.now()+60000),remaining=()=>{const ms=deadlineAt-Date.now();assert.ok(ms>0,'Original interrupted-reply handler deadline expired.');return ms;};let delegated=false;
   try {
    if(stopped||mode==='stopped')return;
    const request=route.request();if(request.method()!=='POST'){delegated=true;await bounded(route.fallback(),remaining(),'Original CORS transport deadline expired.');return;}const data=request.postDataJSON()?.data;
    assert.equal(data?.sessionId,sid);assert.equal(typeof data?.requestId,'string');
    if(endpoint==='setCandidatePlanCheckpoint')assert.equal(data.instanceId,gm1Instance);
    if(firstStarted){assert.equal(stable(data),stable(record.data),'Interruption recovery must retain original request identity and payload.');
     if(mode==='recover'){
      record.normalRecoveries++;
      const responsePromise=surface.page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`)&&response.request().method()==='POST'&&stable(response.request().postDataJSON()?.data)===stable(record.data),{timeout:Math.min(35000,remaining())});
      const accepted=responsePromise.then(value=>({value}),error=>({error}));
      // Playwright forwards fallback only after this route callback returns.
      // Track the original browser receipt separately; recovered/dispose own its
      // original deadline and first-error propagation, without manufacturing a reply.
      const observer=(async()=>{
       try{
        const reply=await bounded(Promise.race([accepted,recovery.then(value=>value.error?{error:value.error}:new Promise(()=>{}))]),remaining(),'Original recovering POST response deadline expired.');
        if(reply.error)throw reply.error;healthy();
        assert.equal(reply.value.status(),200,'Actual recovering POST must succeed.');
        const body=await bounded(reply.value.json(),remaining(),'Original recovering POST body deadline expired.');
        const expected=expectedRingRecoveryReply(record.serverReply);
        assert.deepEqual(body?.result,expected,'Actual recovering POST must equal the original durable receipt.');healthy();
        const observed={httpStatus:reply.value.status(),result:body.result,originalRequestIdentityMatched:true};
        record.recoveringReplies.push(observed);record.successfulRecoveries++;settleRecovery(observed);
       }catch(error){fail(error);}
      })();running.add(observer);observer.finally(()=>running.delete(observer));
      delegated=true;await bounded(route.fallback(),remaining(),'Original recovery request transport deadline expired.');return;
     }record.heldRetries++;return;}
    firstStarted=true;record.data=data;const response=await bounded(route.fetch({timeout:Math.min(20000,remaining())}),remaining(),'Original real POST deadline expired.');assert.equal(response.status(),200,'Original real server reply must succeed before interrupting acknowledgement.');
    const body=await bounded(response.json(),remaining(),'Original real POST body deadline expired.');assert.ok(body?.result);record.serverReply=body.result;
    record.committedWitness=await bounded(waitCommitted(data,body.result),remaining(),'Original owned committed witness deadline expired.');record.confirmedBeforeAbort=true;
   }catch(error){fail(error);}
   finally{if(!delegated){try{await bounded(route.abort('failed'),remaining(),'Original interrupted acknowledgement abort deadline expired.');}catch(error){fail(error);}
    if(!record.firstSettled){record.firstSettled=true;settleFirst(record);}}}
  })();running.add(task);task.finally(()=>running.delete(task));return task;
 };
 await bounded(surface.page.route(pattern,handler),35000,'Original interrupted-reply route installation deadline expired.');lossAcks.push(record);
 return {record,assertHealthy:healthy,recover(){healthy();mode='recover';},async settled(ms){const value=await bounded(first,ms,'Original interrupted-reply operation expired.');healthy();assert.equal(value.confirmedBeforeAbort,true);return value;},
  async recovered(ms){const value=await bounded(recovery,ms,'Original recovering POST acknowledgement deadline expired.');healthy();if(value.error)throw value.error;assert.equal(value.originalRequestIdentityMatched,true);return value;},
  async dispose(ms){mode='stopped';const deadlineAt=Date.now()+Math.min(5000,ms),remaining=()=>{const left=deadlineAt-Date.now();assert.ok(left>0,'Original interrupted-reply disposal deadline expired.');return left;};try{await bounded(surface.page.unroute(pattern,handler),remaining(),'Original interrupted-reply teardown deadline expired.');await bounded(Promise.allSettled([...running]),remaining(),'Original interrupted-reply settlement deadline expired.');healthy();}catch(error){if(error!==firstError)fail(error);throw error;}}};
}
// End of finite lost-ack adapter.

async function assertStationCustody(){const current=await recordRoot(),players=await db.collection(`sessions/${sid}/players`).get();const result=assertStationOwnerCustody(current,players.docs.map(player=>({...player.data(),uid:player.id})),Object.fromEntries(actorUids));evidence.stationCustody=result;return result;}
async function fullMember(surface){return observeFullGameDemoPresentationMember(surface,{knownRoleIds:Object.values(roleIds)});}
async function fullStationLossMember(surface){
 const member=await fullMember(surface);
 const browserLoss=await surface.page.evaluate(async moduleUrl=>{
  const {auth}=await import('/src/lib/firebase.ts'),{activeDemoActorProfile}=await import('/src/lib/demoActorContext.ts');
  const {useSessionStore}=await import(moduleUrl);
  const take=()=>{const user=auth().currentUser,state=useSessionStore.getState(),me=state.me,rawUid=user?.uid??null;
   const rawEscape=me?.escapeState,keys=rawEscape&&typeof rawEscape==='object'&&!Array.isArray(rawEscape)?Object.keys(rawEscape).sort():[];
   const hasFleeRequestId=rawEscape&&Object.hasOwn(rawEscape,'fleeRequestId');
   const escapeStateValid=rawEscape==null||(keys.length===(hasFleeRequestId?5:4)&&
    keys.join(',')===(hasFleeRequestId?'destructionEventId,fleeRequestId,revision,shipId,status':'destructionEventId,revision,shipId,status'))&&
   (rawEscape.status==='pending'||rawEscape.status==='fled')&&typeof rawEscape.shipId==='string'&&rawEscape.shipId.length>0&&
    typeof rawEscape.destructionEventId==='string'&&rawEscape.destructionEventId.length>0&&Number.isSafeInteger(rawEscape.revision)&&rawEscape.revision>=1&&
    (!hasFleeRequestId||typeof rawEscape.fleeRequestId==='string'&&rawEscape.fleeRequestId.length>0);
   const escapeState=rawEscape==null||!escapeStateValid?null:{status:rawEscape.status,shipId:rawEscape.shipId,
    destructionEventId:rawEscape.destructionEventId,revision:rawEscape.revision,...(hasFleeRequestId?{fleeRequestId:rawEscape.fleeRequestId}:{})};
   return {rawUid,sessionId:state.session?.id??null,meSessionId:me?.sessionId??null,hasAuth:!!user,sameActor:!!user&&user.uid===me?.uid,
   profileRoleId:activeDemoActorProfile?.roleId??null,profileSessionId:activeDemoActorProfile?.sessionId??null,playerRole:me?.role??null,
   assignedRoleId:me?.assignedRoleId??null,activeConsoleRoleId:me?.activeConsoleRoleId??null,seatId:me?.seatId??null,
   fleetGroupId:me?.fleetGroupId??null,replacementRoleId:me?.replacementRoleId??null,replacementStatus:me?.replacementStatus??null,
   kicked:me?.kickedAt!=null,connected:me?.connected===true,connection:state.connection??null,freshness:state.sessionSnapshotFreshness??null,
   connectionGeneration:me?.connectionGeneration??null,documentTimeOrigin:performance.timeOrigin,
   identityHydrationRevision:state.identityHydrationRevision,escapeLocked:rawEscape!=null,escapeState,escapeStateValid};
  };
  const before=take();
  const uidHash=before.rawUid?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(before.rawUid))))
   .map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,16):null;
  const after=take(),authUidStable=before.rawUid===after.rawUid;
  const publicSample=value=>{const {rawUid,...sample}=value;return {...sample,uidHash};};
  return {before:publicSample(before),after:publicSample(after),authUidStable};
 },surface.storeModuleUrl());
 const compared=['uidHash','sessionId','meSessionId','hasAuth','sameActor','profileRoleId','profileSessionId','playerRole',
  'assignedRoleId','activeConsoleRoleId','seatId','fleetGroupId','replacementRoleId','replacementStatus','kicked','connected',
  'connection','freshness','connectionGeneration','documentTimeOrigin','identityHydrationRevision','escapeLocked','escapeState'];
 const memberCompared=compared.filter(key=>key!=='escapeState');
 const memberMatches=sample=>memberCompared.every(key=>{
  const left=key==='connected'?member.currentOwnPlayerConfirmed:member[key],right=sample[key];
  return left===right;
 });
 const [before,after]=[browserLoss.before,browserLoss.after];
 const stableBookend=compared.every(key=>key==='escapeState'?JSON.stringify(before[key]??null)===JSON.stringify(after[key]??null):before[key]===after[key]);
 const browserProjectionConsistent=browserLoss.authUidStable&&before.escapeStateValid&&after.escapeStateValid&&stableBookend&&
  memberMatches(before)&&memberMatches(after)&&member.invalidFields.length===0;
 return {...member,browserProjectionConsistent,escapeState:browserProjectionConsistent?after.escapeState:null,
  escapeStateValid:before.escapeStateValid&&after.escapeStateValid,browserLossSample:after,
  browserLossSamples:[before,after],browserAuthUidStable:browserLoss.authUidStable};
}
function currentMember(value,label,roleId){
 assert.equal(value.uidHash,short(actorUids.get(label)));assert.equal(value.sessionId,sid);assert.equal(value.meSessionId,sid);
 assert.equal(value.hasAuth,true);assert.equal(value.sameActor,true);assert.equal(value.profileRoleId,null);assert.equal(value.profileSessionId,null);
 assert.equal(value.playerRole,'player');assert.equal(value.replacementRoleId,null);assert.equal(value.replacementStatus,null);assert.equal(value.escapeLocked,false);assert.equal(value.kicked,false);assert.deepEqual(value.invalidFields,[]);
 if(roleId==='press-officer'){assert.equal(value.assignedRoleId,null);if(value.activeConsoleRoleId!=='press-officer')return false;assert.equal(value.seatId,null);if(!value.pressEnabled||!value.pressCraftScopeMatches)return false;}else {if(value.assignedRoleId===null)return false;assert.equal(value.assignedRoleId,roleId);}
 return value.connection==='live'&&value.freshness==='server'&&value.currentOwnPlayerConfirmed&&value.memberScopeMatches&&value.sdkHasServerAuthority&&!value.sdkResumePending;
}

// Casting binds the primary station; the normal GM start transaction establishes operational berths.
function castingStationReady(value,roleId){return stationReady(value,roleId)&&value.cycle===0&&value.phase==='casting'&&value.setupConfirmed&&value.fullGameDemoExact&&value.fullGameDemo?.status==='preparing'&&value.fullGameDemo?.progression==='manual';}
async function currentMemberBerthReady(surface,value,label,roleId,deadlineAt){
 const remaining=()=>{const ms=deadlineAt-Date.now();assert.ok(ms>0,'Original member operation deadline expired.');return ms;};remaining();
 if(!stationReady(value,roleId))return false;
 if(roleId==='press-officer')return value; // Actual Press craft scope is authoritative; Press has no core ship berth.
 if(value.currentMemberBerthPresent)return value.currentMemberBerthMatches?value:false;
 const raw=await bounded(db.doc(`sessions/${sid}/fleetGroups/${value.fleetGroupId}`).get(),remaining(),'Original member berth group-read deadline expired.');const group=fleetGroupRecord(raw.data());
 const absentMap=raw.exists&&group?.id===value.fleetGroupId&&group.memberUids.includes(actorUids.get(label))&&!Object.hasOwn(raw.data(),'memberShipIds');
 const after=await bounded(fullMember(surface),remaining(),'Original member berth reread deadline expired.');remaining();
 const sameTuple=['documentTimeOrigin','uidHash','sessionId','meSessionId','playerRole','assignedRoleId','activeConsoleRoleId','seatId','fleetGroupId','connectionGeneration','identityHydrationRevision'].every(key=>after[key]===value[key]);
 const accepted=absentMap&&sameTuple&&!after.currentMemberBerthPresent&&currentMember(after,label,roleId)&&stationReady(after,roleId);
 states.push({label:stage,actor:label,berthApplicability:{groupId:value.fleetGroupId,readOnlyExactGroup:true,sourceGroupParsed:!!group,ownMemberIncluded:group?.memberUids.includes(actorUids.get(label))===true,mapAbsent:absentMap,originalTupleUnchanged:sameTuple,accepted}});return accepted?after:false;
}
async function memberReady(surface,label,{original,navigation,station=true,casting=false,deadlineAt=Date.now()+60000}={}){
 const roleId=roleIds[label];let value;
 while(Date.now()<deadlineAt){value=await bounded(fullMember(surface),deadlineAt-Date.now(),'Original member SDK observation deadline expired.');consumed={stage,label,original,current:value};navigation?.sample(value);
  if(original){for(const key of ['documentTimeOrigin','uidHash','sessionId','meSessionId','playerRole','assignedRoleId','fleetGroupId','replacementRoleId','replacementStatus','escapeLocked'])assert.equal(value[key],original[key],`Original same-document ${key} changed.`);
   if(value.connectionGeneration!==original.connectionGeneration||value.identityHydrationRevision!==original.identityHydrationRevision){assert.ok(navigation,'Generation/hydration changed without operation-local normal resume evidence.');const accepted=await navigation.accept(original,value,()=>fullMember(surface));if(!accepted){await delay(200);continue;}value={...value,...accepted};}}
  const accepted=currentMember(value,label,roleId)?station?(casting?(castingStationReady(value,roleId)?value:false):await currentMemberBerthReady(surface,value,label,roleId,deadlineAt)):value:false;
  if(accepted&&Date.now()<deadlineAt){states.push({label:stage,actor:label,member:accepted});return accepted;}await delay(200);
 }throw new Error(`Mounted member readiness expired: ${JSON.stringify(value)}`);
}
async function memberNavigate(surface,label,choose,readyLocator,deadlineAt=Date.now()+60000){
 const original=await memberReady(surface,label,{deadlineAt});const navigation=createMemberNavigationResumeObserver(surface.page,{directory,roleId:roleIds[label],deadlineAt});let failed;
 try{await navigation.prepare(original);await bounded(Promise.resolve().then(choose),Math.min(35000,deadlineAt-Date.now()),'Original normal member navigation expired.');const after=await memberReady(surface,label,{original,navigation,deadlineAt});if(readyLocator)await readyLocator.waitFor({state:'visible',timeout:Math.min(35000,deadlineAt-Date.now())});return after;}
 catch(error){failed=error;throw error;}finally{try{await bounded(navigation.finish(failed),Math.min(5000,Math.max(1,deadlineAt-Date.now())),'Original member navigation teardown expired.');}catch(error){(evidence.navigationTeardownErrors??=[]).push({label,stage,error:originalProofError(error)});if(!failed)throw error;}}
}
async function restoredMember(surface,label,deadlineAt=Date.now()+60000){
 const before=await memberReady(surface,label,{deadlineAt});await surface.page.reload({timeout:Math.min(35000,deadlineAt-Date.now())});
 await bounded(surface.until('Original persisted Auth/member document restoration',v=>{if(v.hasAuth)assert.equal(v.uidHash,before.uidHash);if(v.sessionId!==null)assert.equal(v.sessionId,sid);return v.hasAuth&&v.sameActor&&v.connection==='live'&&v.freshness==='server'&&v.playerRole==='player'&&v.activeConsoleRoleId===roleIds[label];},deadlineAt-Date.now()),deadlineAt-Date.now(),'Original restored document deadline expired.');
 const after=await memberReady(surface,label,{deadlineAt});assert.notEqual(after.documentTimeOrigin,before.documentTimeOrigin);for(const key of ['uidHash','assignedRoleId','activeConsoleRoleId','seatId','fleetGroupId'])assert.equal(after[key],before[key]);assert.equal(after.currentCanonicalSeatOwned,true);assert.ok(after.connectionGeneration>=before.connectionGeneration);states.push({label:`${label} normal cold-document reload`,before,after});return after;
}
async function normalJoin(surface,label){
 await surface.page.goto(baseUrl);await surface.reducedMotion();await surface.page.getByRole('textbox',{name:'Session code',exact:true}).fill(joinCode);
 const response=await observeUiReceipt({page:surface.page,consumed:{stage,label,ordinaryOrigin:baseUrl},waitForResponse:()=>surface.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/us-central1/joinSession')&&r.request().method()==='POST',{timeout:35000}),choose:()=>surface.page.getByRole('button',{name:'Join a session',exact:true}).click()});assert.equal(response.status(),200);
 await register(surface,label);await surface.consent();await surface.until('Normal joined fresh manual training',v=>v.hasAuth&&v.sameActor&&v.sessionId===sid&&v.connection==='live'&&v.freshness==='server'&&v.fullGameDemo?.status==='preparing');claims.push(`${label} independent normal Auth/join/consent`);
}
async function enterStationPress(surface){
 const deadlineAt=Date.now()+60000;await action(surface,'refreshPresence',()=>surface.page.getByRole('link',{name:'Press Officer',exact:true}).click(),{deadlineAt,matches:data=>data.sessionId===sid&&data.activeConsoleRoleId==='press-officer'});
 return memberReady(surface,'Press',{casting:true,deadlineAt});
}
async function enterRole(surface,label){
 const roleId=roleIds[label],deadlineAt=Date.now()+60000,original=await memberReady(surface,label,{station:false,deadlineAt});const navigation=createMemberNavigationResumeObserver(surface.page,{directory,roleId,deadlineAt});let failed;
 try{await navigation.prepare(original);await surface.page.locator(`a[href$="/roles/${roleId}"]`).first().click({timeout:Math.min(35000,deadlineAt-Date.now())});return await memberReady(surface,label,{original,navigation,casting:true,deadlineAt});}
 catch(error){failed=error;throw error;}finally{try{await bounded(navigation.finish(failed),Math.min(5000,Math.max(1,deadlineAt-Date.now())),'Original member navigation teardown expired.');}catch(error){(evidence.navigationTeardownErrors??=[]).push({label,stage,error:originalProofError(error)});if(!failed)throw error;}}
}

// Native Ring-only operations follow.
 async function op(run,deadlineAt=Math.min(Date.now()+60000,workEnd)) {
  budget();const remaining=deadlineAt-Date.now();assert.ok(remaining>0);
  return candidateWait(()=>run(deadlineAt),deadlineAt,'Ring original operation');
 }
 async function recordRoot(){return op(async()=>{const value=await db.doc(`sessions/${sid}`).get();assert.equal(value.exists,true);return value.data();});}
 async function sdk(surface,name,data){
  return op(async deadlineAt=>{
   if(name==='runMaintenance')await paceMaintenance();
   if(surface===gm)await liveGm(gm,'GM1',undefined,{deadlineAt});
   else await memberReady(surface,surface===owner?'Owner':'Recipient',{deadlineAt});
   const response=await surface.callable(name,data,Math.min(35000,deadlineAt-Date.now()));
   assert.equal(response.status,'committed',`${name}: ${response.code??response.message}`);
   assert.notEqual(response.result?.status,'stale',`${name} original source revision changed`);
   assert.ok(response.result);receipts.push({endpoint:name,request:data,result:response.result,transport:'ordinary browser SDK'});
   return response.result;
  });
 }
 async function grant(shipId){
  const lease=await op(()=>db.doc(`sessions/${sid}/gmInstances/${gm1Instance}`).get());
  const claimedAt=ringGrantLeaseToken(lease.get('claimedAt'));
  await sdk(gm,'setGmShipConsoleWriteGrant',{sessionId:sid,instanceId:gm1Instance,claimedAt,shipId,enabled:true});
 }
 async function supply(shipId,resourceId,minimum){
  await grant(shipId);let current=await recordRoot(),amount=current.shipResources[shipId][resourceId];
  const before=amount;
  while(amount<minimum){
   const count=Math.min(12,minimum-amount);
   const result=await sdk(gm,'applyShipCounterSteps',{sessionId:sid,instanceId:gm1Instance,shipId,
    counter:'resource',resourceId,steps:Array(count).fill(1),expectedRevision:current.vesselActionRevisions?.[shipId]??0,requestId:crypto.randomUUID()});
   current=await recordRoot();amount+=count;assertRingResourceIncrease(result,current,shipId,resourceId,amount);
  }
  (evidence.gmPreparation??=[]).push({shipId,resourceId,before,after:amount,mechanism:'normal official GM counter handler; no gameplay injection'});
 }
 async function repair(shipId){
  const current=await recordRoot();assert.notEqual(current.shipDamage[shipId]?.destroyed,true,'Never resurrect a destroyed vessel.');
  if(!current.shipDamage[shipId]?.damagedSystemIds?.length)return;
  await grant(shipId);await sdk(gm,'repairAllShipDamage',{sessionId:sid,instanceId:gm1Instance,shipId,
   expectedRevision:current.vesselActionRevisions?.[shipId]??0,requestId:crypto.randomUUID()});
  assert.deepEqual((await recordRoot()).shipDamage[shipId].damagedSystemIds,[]);
 }
 async function maintain(shipId,consoles=['jump-drive']){
  await grant(shipId);const current=await recordRoot();let revision=current.maintenanceCycles?.[shipId]?.revision??0;
  for(const step of ['begin',...MAINTENANCE_ORDERS[shipId],'end']){
   const result=await sdk(gm,'runMaintenance',{sessionId:sid,instanceId:gm1Instance,shipId,action:step,
    expectedRevision:revision,requestId:crypto.randomUUID(),
    ...(step==='rations'?{foodLevel:3,waterLevel:3}:{}),...(step==='reactor'?{consoles}:{}),
    ...(step==='bays'?{refuels:{}}:{})});
   assertRingMaintenanceReply(result,await recordRoot(),shipId);revision=result.cycle.revision;
   if(step==='begin'||step==='riot')await repair(shipId);
  }
 }
 async function coordination(cycle){
  await op(async deadlineAt=>{
   await liveGm(gm,'GM1','active',{deadlineAt});
   const button=gm.page.getByRole('button',{name:'Open Coordination manually',exact:true});
   if(await button.isVisible())await action(gm,'advanceFullGameDemoPhase',()=>button.click());
   await gm.until('Original manual Coordination publication',v=>v.cycle===cycle&&v.phase==='active'&&v.airspace==='lifted'&&v.turnStatePhase==='coordination',deadlineAt-Date.now());
  });
 }
 const TRACKS=['reactor','jump-drive','hydroponics','water-reclamation','advanced-hydroponics'];
 let coordinate,groupId,ships,crossing;
 async function workspace(surface=gm){
  const view=await sdk(surface,'readCandidateWorkspace',{sessionId:sid,expectedGroupId:groupId,...(surface===gm?{instanceId:gm1Instance}:{})});
  const current=await recordRoot();const path=assertRingWorkspace(view,{sessionId:sid,groupId,cycle:current.currentTurn,coordinate,gm:surface===gm});return{view,path};
 }
 async function candidate(surface,actionName,choice={}){
  const{view}=await workspace(surface);if(choice.shipId&&surface===gm)await grant(choice.shipId);
  const data={sessionId:sid,requestId:crypto.randomUUID(),expectedRevision:view.revision,expectedGroupId:groupId,
   code:'N',coordinate,action:actionName,...choice,...(surface===gm?{instanceId:gm1Instance}:{})};
  const result=await sdk(surface,'executeCandidateAction',data);
  assertRingCandidateCommit(result,data,view);return{data,result};
 }
 async function ringWitness(){
  const current=await recordRoot();
  const fields=['phase','currentTurn','shipResources','shipDamage','shipSurvivors','candidateVesselOutcomes',
   'candidateCraftReservations','shuttleControl','shuttleDockings','debriefSnapshot','gameOutcome','survivorOutcome'];
  const documents=await op(()=>Promise.all(['serverState/candidates'].map(path=>db.doc(`sessions/${sid}/${path}`).get())));
  const collections=await op(()=>Promise.all(['candidateActionReceipts','candidateCalculationAudits','actionAudits','procedureAudits'].map(path=>db.collection(`sessions/${sid}/${path}`).get())));
  return{root:hash(stable(Object.fromEntries(fields.map(key=>[key,current[key]??null])))),
   documents:documents.map(doc=>({path:doc.ref.path.split('/').slice(-2).join('/'),hash:hash(stable(doc.data()??null))})),
   collections:collections.map(set=>({path:set.query.path.split('/').at(-1),count:set.size,
    hash:hash(stable(set.docs.map(doc=>({id:doc.id,data:doc.data()})).sort((a,b)=>a.id.localeCompare(b.id))))}))};
 }
 const operations={
  async setup(){
   await mark(sparse?`fresh ordinary GM plus ${stationOnly?'Wing Station':'reader Pursuit'} setup`:'fresh ordinary three-actor Ring setup');
   gm=await launchSurface('browser-A-normal-GM');if(!sparse)owner=await launchSurface('browser-A-independent-Engineer');recipient=await launchSurface(sparse?`browser-A-independent-${stationOnly?'Wing':'Scientist'}`:'browser-B-normal-Scientist');
   if(stationOnly){stationCrew.push({label:'Recipient',roleId:roleIds.Recipient,surface:recipient});for(const[label,roleId]of Object.entries(roleIds).filter(([label])=>label!=='Recipient'))stationCrew.push({label,roleId,surface:await launchSurface(`browser-A-independent-${label}`)});}
   assert.equal(browsers.length,plan.browserProcesses);assert.equal(surfaces.length,plan.browserContexts);
   await gm.page.goto(baseUrl);await gm.reducedMotion();
   const created=await observeUiReceipt({page:gm.page,waitForResponse:()=>gm.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/us-central1/createSession')&&r.request().method()==='POST'),choose:()=>gm.page.getByRole('button',{name:'Create a session',exact:true}).click()});
   assert.equal(created.status(),200);const body=await created.json();sid=body.result?.session?.id;joinCode=body.result?.session?.joinCode;assert.match(sid,/^[\w-]{1,128}$/);
   await register(gm,'GM1');await gm.consent();await gm.until('Fresh Cycle0',v=>v.sameActor&&v.sessionId===sid&&v.cycle===0&&v.freshness==='server');
   await authorizeAndClaim(gm,'GM1','PC10 minimum Ring GM');
   if(!await gm.page.getByRole('region',{name:'Setup',exact:true}).isVisible()){await gm.page.getByRole('button',{name:/^Open station catalog/}).click();await gm.page.getByRole('link',{name:'GM Console',exact:true}).click();}
   const setup=gm.page.getByRole('region',{name:'Setup',exact:true});await setup.getByRole('button',{name:'Setup',exact:true}).click();
   await setup.getByLabel('Recommended player count',{exact:true}).selectOption(String(plan.configuredRoles));await setup.getByLabel('Star chart',{exact:true}).selectOption(stationOnly?'B':'A');
   if(stationOnly){
    const disableCapybara=setup.getByRole('button',{name:'Disable Capybara',exact:true});
    if(await disableCapybara.isVisible()){await disableCapybara.click();await gm.page.getByRole('button',{name:'Confirm remove Capybara',exact:true}).click();}
   }
   await action(gm,'confirmSetup',()=>setup.getByRole('button',{name:'Confirm setup // Confirm roster',exact:true}).click());
   await gm.until('Legal configured roles with unused seats open',v=>v.setupConfirmed&&v.activeRoleIds.length===plan.configuredRoles&&Object.values(roleIds).filter(id=>id!=='press-officer').every(id=>v.activeRoleIds.includes(id))&&(!stationOnly||(v.pressEnabled&&!v.capybaraEnabled)));
   const training=gm.page.locator('fieldset[aria-label="Full-game demo preparation"]');
   await action(gm,'prepareFullGameDemo',async()=>{await training.getByRole('button',{name:'Prepare full-game demo',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // PREPARE FULL-GAME DEMO',exact:true}).click();});
   for(const[surface,label]of(stationOnly?stationCrew.map(actor=>[actor.surface,actor.label]):sparse?[[recipient,'Recipient']]:[[owner,'Owner'],[recipient,'Recipient']])){
    await normalJoin(surface,label);if(stationOnly&&label==='Press'){await enterStationPress(surface);continue;}const name=(await observeLifecycleActor(surface)).displayName;assert.ok(name);
    const casting=gm.page.getByRole('region',{name:'Facilitator casting',exact:true});await casting.getByLabel(`Role for ${name}`,{exact:true}).selectOption(roleIds[label]);
    await action(gm,'assignRole',()=>casting.getByRole('button',{name:`Assign role to ${name}`,exact:true}).click());
    await memberReady(surface,label,{station:false});await enterRole(surface,label);
   }
   assert.equal(actorUids.size,plan.actualAuthenticatedActors);
   await action(gm,'startGame',async()=>{await training.getByRole('button',{name:'Start full-game demo // Advance to Cycle 1',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // START FULL-GAME DEMO // CYCLE 1',exact:true}).click();});
   await liveGm(gm,'GM1','active');
   for(const surface of surfaces)await completeOfferedCyclePresentation(surface,await snapshot(surface,'Actual Cycle1 presentation'),{clearBriefing:true});
   if(sparse){const reader=await memberReady(recipient,'Recipient');groupId=reader.fleetGroupId;if(stationOnly){evidence.stationWingOriginal=reader;for(const actor of stationCrew){const member=await memberReady(actor.surface,actor.label);assert.equal(member.fleetGroupId,groupId);actor.original=member;}await assertStationCustody();}
    claims.push(stationOnly?'Fresh normal14-role manual setup with GM and six printed craft owners including separate Press; unused core seats open, optional Union craft absent':'Fresh normal13-role manual setup with GM and one ordinary reader; no Ring prerequisites or recovery replay');return;}
   const science=await memberReady(recipient,'Recipient'),engineer=await memberReady(owner,'Owner');assert.equal(science.fleetGroupId,engineer.fleetGroupId);groupId=science.fleetGroupId;
   const current=await recordRoot();ships=current.activeVesselIds;assert.equal(ships.length,6);assert.ok(ships.includes('aegis'));
   coordinate=await op(async deadlineAt=>{await liveGm(gm,'GM1','active',{deadlineAt});return readRingCoordinate(gm);});
   assert.equal(current.shuttleControl.endeavour.holderUid,actorUids.get('Recipient'));assert.equal(current.shuttleControl['black-sheep'].holderUid,actorUids.get('Owner'));
   await supply('shepherd','ore',40);await supply('aegis','materials',10);
   for(const ship of ships){const rule=MAINTENANCE_RULES[ship];await supply(ship,'food',rule.food[3]*4);await supply(ship,'water',rule.water[3]*4);await supply(ship,'fuel',30);}
   claims.push('Fresh normal manual13-role setup with only GM/Scientist/Engineering holder; required new state only, no old discovery/checkpoint requalification');
  },
  async stationArrivalMaintenance(){
   await mark('legitimate Station Cycle1 charged maintenance');const current=await recordRoot();ships=current.activeVesselIds;assert.equal(ships.length,6);coordinate=await readStationCoordinate(gm);
   for(const ship of ships){const rule=MAINTENANCE_RULES[ship];await supply(ship,'food',rule.food[3]*2);await supply(ship,'water',rule.water[3]*2);await supply(ship,'fuel',30);await maintain(ship);}
   await coordination(1);
  },
  async stationArrival(){
   await mark('actual paid Station arrival and genuine Wing berth');
   await runStationPaidArrivals(ships,{grant,jump:async shipId=>{const before=await recordRoot(),result=await sdk(gm,'jumpShip',{sessionId:sid,instanceId:gm1Instance,shipId,destination:coordinate,requestId:crypto.randomUUID()});assertRingPaidArrival(result,before,await recordRoot(),shipId);}});
   const nav=await db.doc(`sessions/${sid}/serverState/navigation`).get();assertStationNavigation(nav,ships,coordinate);
   const wing=await fullMember(recipient);assert.equal((await recordRoot()).currentTurn,2);assert.equal(wing.fleetGroupId,groupId);evidence.stationWingOriginal=beginStationCombatWing(evidence.stationWingOriginal,wing);
   claims.push('Six real charged paid P arrivals; normal movement establishes exact original Wing AEGIS memberShipIds berth');
  },
  async stationDeferCombat(){
   await mark('ordinary Cycle1 deferral required for first Cycle2 Station attack');
   const actor=await liveGm(gm,'GM1','active');assert.equal(actor.cycle,1);
   const timing=gm.page.getByRole('region',{name:'Wolf attack timing controls',exact:true});
   const prior=await db.doc(`sessions/${sid}/wolfAttackWindow/current`).get();const revision=prior.exists?prior.get('revision'):0;
   const receipt=await action(gm,'setWolfAttackWindow',()=>timing.getByRole('button',{name:'Defer to Cycle 2',exact:true}).click());
   assert.equal(receipt.data.sessionId,sid);assert.equal(receipt.data.status,'deferred');assert.equal(receipt.data.expectedRevision,revision);
   assert.equal(receipt.result.status,'deferred');assert.equal(receipt.result.turn,2);assert.equal(receipt.result.revision,revision+1);
   const deferred=await db.doc(`sessions/${sid}/wolfAttackWindow/current`).get();
   assert.equal(deferred.get('status'),'deferred');assert.equal(deferred.get('turn'),2);
   assert.equal(deferred.get('revision'),revision+1);
   evidence.stationCycle1Deferral={status:'deferred',turn:2,revision:revision+1,receipt:publicLifecycleReceipt(receipt)};
  },
  async stationCombatMaintenance(){
   await mark('legitimate Station Cycle2 maintenance and actual fighter charges');
   for(const ship of ships)await maintain(ship,ship==='aegis'?stationCombatConsoles():['jump-drive']);
   await coordination(2);
  },
  async stationCombat(){
   await mark('source Station combat with real Wing choices and ordinary GM composition');
   const timing=gm.page.getByRole('region',{name:'Wolf attack timing controls',exact:true});await timing.getByLabel('Target fleet group',{exact:true}).selectOption(groupId);
   const source=timing.getByLabel('Triggered Wolf site',{exact:true});let sourceId;const sourceDeadline=Date.now()+60000;
   while(Date.now()<sourceDeadline&&!sourceId){sourceId=await source.locator('option').evaluateAll(options=>options.find(option=>!option.disabled&&/^P \/\//.test(option.textContent.trim()))?.value);if(!sourceId)await delay(200);}
   assert.ok(sourceId,'Real paid P arrival must offer normal Station threat source.');await source.selectOption(sourceId);
   await action(gm,'setWolfAttackWindow',()=>timing.getByRole('button',{name:'Mark threat source due',exact:true}).click());
   const preparation=gm.page.getByRole('region',{name:'Private Wolf attack preparation',exact:true});
   await preparation.getByLabel('Battlestation count',{exact:true}).fill('1');await preparation.getByLabel('Fleet Strikecarrier count',{exact:true}).fill('4');
   await action(gm,'stageWolfAttackPreparation',()=>preparation.getByRole('button',{name:'Save private attack draft',exact:true}).click());
   let browserCombatContext,lastCombatSampleHash;
   async function readAttack(){
    await liveGm(gm,'GM1','active');
    const read=await gm.page.evaluate(async sid=>{
     const source=await(await fetch('/src/lib/firestore.ts')).text(),match=source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);if(!match)throw Error('Actual served Firestore SDK import required');
     const sdk=await import(match[1]),{db}=await import('/src/lib/firestore.ts');
     const [attack,audience]=await Promise.all(['wolfAttackState/current','wolfAttackAudience/current'].map(path=>sdk.getDocFromServer(sdk.doc(db(),`sessions/${sid}/${path}`))));
     if(!attack.exists())throw Error('Current real Station attack missing');
     return {attack:attack.data(),publicAudience:audience.exists()?audience.data():null};
    },sid);browserCombatContext={channel:'original-GM-browser-Firestore-SDK',sessionId:sid,observedAt:new Date().toISOString(),publicAudience:read.publicAudience};return read.attack;
   }
   const recordDiagnosticError=(channel,error,attack)=>{
    const entry={channel,error:originalProofError(error),attackId:attack.attackId,turn:attack.turn,revision:attack.revision,step:attack.currentStep};
    evidence.stationDiagnosticStatus='incomplete';
    const fingerprint=hash(stable({channel,message:entry.error.message}));
    if(!(evidence.stationDiagnosticErrors??=[]).some(item=>item.fingerprint===fingerprint))evidence.stationDiagnosticErrors.push({...entry,fingerprint});
    return entry;
   };
   const retainCombatState=async attack=>{
    const results=await Promise.allSettled([
     bounded(readStationCombatGuardAuthority({db,scope:{ownedSyntheticSession:true,sessionId:sid,ownedSessionId:sid,projectId,expectedProjectId:allocation.projectId,firestoreHost:process.env.FIRESTORE_EMULATOR_HOST,expectedFirestoreHost:`127.0.0.1:${ports.firestore}`}}),5000,'Private Station emulator inspection expired.'),
     bounded(fullMember(recipient),5000,'Station diagnostic member observation expired.'),
     bounded(recipient.page.locator('section[aria-label]').evaluateAll(nodes=>nodes.filter(node=>/fighter|wolf|boarding/i.test(node.getAttribute('aria-label')??'')).map(node=>({label:node.getAttribute('aria-label'),visible:node.getClientRects().length>0,text:node.innerText.slice(0,2000),buttons:[...node.querySelectorAll('button')].map(button=>({label:button.innerText,disabled:button.disabled})),selects:[...node.querySelectorAll('select')].map(select=>({label:select.getAttribute('aria-label'),disabled:select.disabled}))}))),5000,'Station diagnostic mount observation expired.'),
    ]);
    const diagnosticErrors=[];const channels=['emulator-admin-read-only','original-Wing-member','original-Wing-mounted-panels'];
    const values=results.map((result,index)=>{if(result.status==='fulfilled')return result.value;diagnosticErrors.push(recordDiagnosticError(channels[index],result.reason,attack));return null;});
    const [authority,member,mountedPanels]=values;
    const serverContext=authority?{...stationCombatServerContext({...authority,publicAudience:null}),authoritativeAttack:authority.authoritativeAttack,inspection:authority.inspection}:null;
    const sample={attack,browserContext:browserCombatContext,serverContext,member,mountedPanels,diagnosticErrors};
    evidence.stationDiagnosticStatus??='complete';
    evidence.stationCombatLatest={observedAt:new Date().toISOString(),...sample};
    const sampleHash=hash(stable(sample));if(sampleHash!==lastCombatSampleHash){lastCombatSampleHash=sampleHash;(evidence.stationCombatTransitions??=[]).push({observedAt:evidence.stationCombatLatest.observedAt,attackId:attack.attackId,revision:attack.revision,step:attack.currentStep,status:attack.status,decisionSummary:attack.decisionSummary??null});}
    await writeFile(`${directory}/Station-combat-latest.json`,JSON.stringify(evidence.stationCombatLatest,null,2)+'\n');
   };
   const launchViews=new Map(),recoveredLaunches=new Map();
   const observeLaunchRead=async response=>{
    if(!new URL(response.url()).pathname.endsWith('/us-central1/getAegisFighterWingLaunch')||response.request().method()!=='POST'||response.status()!==200)return;
    try {const body=await response.json(),view=body.result;
     if(view?.sessionId===sid&&['fighter-wing-alpha','fighter-wing-bravo'].includes(view.wingId))launchViews.set(view.wingId,view);
    } catch(error){recordDiagnosticError('passive-launch-ui-read',error,{});}
   };
   recipient.page.on('response',observeLaunchRead);
   const assertCrewActor=async(actor,{current,deadlineAt})=>{
    const member=await memberReady(actor.surface,actor.label,{deadlineAt});
    for(const key of ['uidHash','sessionId','meSessionId','playerRole','assignedRoleId','fleetGroupId'])assert.equal(member[key],actor.original[key],`Original Station ${actor.label} ${key}`);
    assert.equal(member.cycle,current.turn);assert.equal(member.phase,'active');return member;
   };
   const assertStationActors=async()=>{budget();await liveGm(gm,'GM1','active');assertSparseStationWing(await fullMember(recipient),evidence.stationWingOriginal);};
   const recoverChoice=async(error,current,{deadlineAt})=>recoverStationLaunch(error,current,{
    observations:heldProofFailureObservations(error),readAttack:async()=>{const fresh=await readAttack();await retainCombatState(fresh);return fresh;},assertActors:assertStationActors,deadlineAt,used:recoveredLaunches,
    readLaunchView:async(wingId,limit,fresh)=>{while(Date.now()<limit){
     const views=['fighter-wing-alpha','fighter-wing-bravo'].map(id=>launchViews.get(id));
     const button=recipient.page.getByRole('button',{name:`Launch Fighter Wing ${wingId.endsWith('alpha')?'Alpha':'Bravo'}`,exact:true});
     if(views.every(view=>view?.sessionId===sid&&view.attackId===fresh.attackId&&view.turn===fresh.turn&&view.revision===fresh.revision)&&await button.isVisible()&&await button.isEnabled())return launchViews.get(wingId);
     await delay(Math.min(100,limit-Date.now()));
    }throw error;},
    retain:async(original,context)=>{
     const artifact=await retainProofFailure(directory,'station-launch-stale-recovery',original,context);
     assert.equal(artifact.evidenceWriteFailed,false,'Original rejected launch must be retained before recovery.');
     await retainCombatState(context.freshAttack);
     (evidence.stationLaunchRecoveries??=[]).push({originalFailureArtifact:artifact.path,...context,
      recovery:'existing UI refresh followed by one new explicit choice; no SDK mutation/replay'});
     await writeFile(`${directory}/Station-launch-recoveries.json`,JSON.stringify(evidence.stationLaunchRecoveries,null,2)+'\n');
    },
   });
   const chooseWing=async(current,{deadlineAt})=>{
    assertSparseStationWing(await fullMember(recipient),evidence.stationWingOriginal);
    if(current.currentStep==='targeting'){
     const pendingRecovery=[...recoveredLaunches.values()].find(row=>row.view.attackId===current.attackId&&!row.committed);
     for(const label of ['Fighter Wing Alpha','Fighter Wing Bravo']){if(pendingRecovery&&pendingRecovery.view.wingId!==`fighter-wing-${label.endsWith('Alpha')?'alpha':'bravo'}`)continue;const launch=recipient.page.getByRole('button',{name:`Launch ${label}`,exact:true}),pass=recipient.page.getByRole('button',{name:`Pass ${label}`,exact:true});if(await launch.isVisible()&&await launch.isEnabled()){const capture=await action(recipient,'launchAegisFighterWing',()=>launch.click(),{deadlineAt});assertRecoveredStationLaunch(capture,current,recoveredLaunches);const recovered=evidence.stationLaunchRecoveries?.findLast(row=>row.freshAttack.attackId===current.attackId&&row.failedRequest.wingId===capture.data.wingId);if(recovered){recovered.committedReceipt=publicLifecycleReceipt(capture);await writeFile(`${directory}/Station-launch-recoveries.json`,JSON.stringify(evidence.stationLaunchRecoveries,null,2)+'\n');}return {committed:true};}if(await pass.isVisible()&&await pass.isEnabled()){assert.equal(Boolean(pendingRecovery),false,'A rejected launch cannot silently become a pass.');await action(recipient,'passWolfFighterLaunchChoice',()=>pass.click(),{deadlineAt});return {committed:true};}}
    }else if(['medium-range','short-range'].includes(current.currentStep)){
     const range=current.currentStep==='medium-range'?'Medium Range':'Short Range';
     for(const label of ['Fighter Wing Alpha','Fighter Wing Bravo']){const panel=recipient.page.getByRole('region',{name:`${label} ${range} actions`,exact:true});if(!await panel.isVisible())continue;
      if(range==='Medium Range'){const actions=panel.getByRole('combobox',{name:/^Fighter \d+ action$/});for(let i=0;i<await actions.count();i++){const select=actions.nth(i),name=(await select.getAttribute('aria-label')).replace('action','target');await select.selectOption('attack');const target=panel.getByRole('combobox',{name,exact:true}),options=await target.locator('option').evaluateAll(nodes=>nodes.filter(node=>node.value&&!node.disabled).map(node=>({value:node.value,label:node.textContent})));if(options.length)await target.selectOption((options.find(option=>/battlestation/i.test(option.label))??options[i%options.length]).value);}}
      else for(const box of await panel.getByRole('checkbox',{name:/^Fighter \d+ Short attack$/}).all())await box.check();
      const use=panel.getByRole('button',{name:range==='Medium Range'?'Resolve Medium actions':'Resolve selected Short attacks',exact:true}),pass=panel.getByRole('button',{name:range==='Medium Range'?'Pass Medium Range':'Pass Short Range',exact:true});const button=await use.isVisible()&&await use.isEnabled()?use:pass;
      if(await button.isVisible()&&await button.isEnabled()){await action(recipient,'commitWolfFighterRangeActionChoice',()=>button.click(),{deadlineAt});return {committed:true};}
     }
    }
    assert.ok(Date.now()<deadlineAt); // Additional actors use only their current ordinary crew surfaces.
   };
   const readOwnedStationAuthority=deadlineAt=>candidateWait(()=>readStationCombatGuardAuthority({db,scope:{ownedSyntheticSession:true,sessionId:sid,ownedSessionId:sid,projectId,expectedProjectId:allocation.projectId,firestoreHost:process.env.FIRESTORE_EMULATOR_HOST,expectedFirestoreHost:`127.0.0.1:${ports.firestore}`,gmInstanceId:gm1Instance}}),deadlineAt,'Station population acknowledgment source read');
   const assertStationAckActor=(anchor,actor)=>assertStationPopulationGmActorObserver(anchor,actor);
   const assertStationAckAuthority=(anchor,actor,authority)=>{
    const serverPlayer=authority.players.find(player=>player.uid===actorUids.get('GM1'));
    assertStationPopulationGmActorAuthority(anchor,{...actor,serverPlayer,serverInstance:authority.gmInstance,claimInstance:gm1ClaimInstance,expectedSessionId:sid,expectedUid:actorUids.get('GM1')});
   };
   const stationGmPopulationProjection=async deadlineAt=>{
    const projection=await candidateWait(()=>gm.page.evaluate(async storeUrl=>{
    const{useSessionStore}=await import(storeUrl),store=useSessionStore.getState(),session=store.session,instance=store.gmInstance;
    const targets=value=>Object.values(value??{}).filter(alert=>instance&&Array.isArray(alert.targetGmInstanceIds)&&alert.targetGmInstanceIds.includes(instance.id)).map(alert=>({shipId:alert.shipId,shipName:alert.shipName,population:alert.population,targetGmInstanceIds:[...alert.targetGmInstanceIds]}));
    const visible=element=>element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).display!=='none';
    const labelTextById=Object.fromEntries(Array.from(document.querySelectorAll('[id]')).map(element=>[element.id,element.textContent?.trim()??'']));
    const visibleDialogs=Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]')).filter(visible).map(element=>({role:element.getAttribute('role'),labelledBy:element.getAttribute('aria-labelledby')??'',labelTextById,text:element.innerText.slice(0,1200)}));
    const mutinyPanels=Array.from(document.querySelectorAll('section[aria-label]')).filter(element=>visible(element)&&/mutiny recovery/i.test(element.getAttribute('aria-label')??'')).map(element=>element.getAttribute('aria-label'));
    return{sessionId:session?.id??null,phase:session?.phase??null,connection:store.connection,freshness:store.sessionSnapshotFreshness,generation:store.me?.connectionGeneration??null,hydrationRevision:store.identityHydrationRevision,instanceId:instance?.id??null,vesselActionRevisions:session?.vesselActionRevisions??{},targetedPopulation:targets(session?.populationAlerts),targetedUnrest:targets(session?.unrestAlerts),visibleDialogs,mutinyPanels};
    },gm.storeModuleUrl()),deadlineAt,'Station current GM population alert projection');
    projection.visibleDialogs=projection.visibleDialogs.map(({labelledBy,labelTextById,...dialog})=>({...dialog,name:stationDialogAccessibleName(labelledBy,labelTextById)}));
    return projection;
   };
   const assertSafePopulationAckState=(authority,context)=>{
    assert.equal(context.phase,'active','Only active gameplay may dismiss an informational population alert.');
    assert.equal(context.gameOutcome??null,null,'Stop on a game outcome.');assert.equal(context.survivorOutcome??null,null,'Stop on a survivor ending.');assert.equal(context.debriefSnapshot??null,null,'Stop on debrief or ruling.');assert.notEqual(context.debriefMode?.active,true,'Stop on an active endgame review.');
    const unrest=Object.values(context.unrestAlerts??{}).filter(alert=>alert.targetGmInstanceIds?.includes(gm1Instance));assert.equal(unrest.length,0,'Do not acknowledge while an unrest alert is pending.');
    const activeMutinies=stationPopulationAckMutinyRows(context);assert.deepEqual(activeMutinies,[],'Stop while mutiny recovery is active or unresolved.');
    const replacements=authority.players.filter(player=>player.replacementRoleId!=null||player.replacementStatus!=null);assert.deepEqual(replacements,[],'Stop while any replacement transfer is pending.');
   };
   const stationPopulationDismissMount=async()=>{
    const alertDialog=gm.page.getByRole('alertdialog',{name:'Survivor population threshold reached',exact:true});
    const dialogCount=await alertDialog.count(),visible=dialogCount===1&&await alertDialog.isVisible();
    const dismiss=alertDialog.getByRole('button',{name:'Dismiss population alert',exact:true});
    const dismissCount=await dismiss.count(),enabled=dismissCount===1&&await dismiss.isEnabled();
    return{alertDialog,dismiss,mounted:{dialogCount,visible,dismissCount,enabled}};
   };
   const stationAckSafeSummary=(context,shipId)=>({sessionId:context.sessionId,currentTurn:context.currentTurn,phase:context.phase,shipId,populationAlert:context.populationAlerts?.[shipId]??null,vesselActionRevision:context.vesselActionRevisions?.[shipId]??0,shipSurvivors:context.shipSurvivors,shipResources:context.shipResources,shipDamage:context.shipDamage,shipUnrest:context.shipUnrest,shipMutinies:context.shipMutinies,unrestAlerts:context.unrestAlerts,gameOutcome:context.gameOutcome??null,survivorOutcome:context.survivorOutcome??null,debriefSnapshot:context.debriefSnapshot??null,debriefMode:context.debriefMode??null});
   const acknowledgeStationPopulationAlert=async({wave,nextWave,final,deadlineAt})=>{
    assert.ok(Number.isFinite(deadlineAt)&&Date.now()<deadlineAt,'Original Station wave deadline expired before population acknowledgment.');
    assert.equal(final.status,'resolved');assert.equal(final.currentStep,'resolved');assert.equal(final.pStationRepeat?.status,'repeat','Only a normal repeat wave may acknowledge its informational alert.');
    const actorAnchor=gm1OriginalAuthority,initialActor=await readStationGmActor(gm,'GM1','active',deadlineAt);assertStationAckActor(actorAnchor,initialActor);
    let ready=null;
    while(Date.now()<deadlineAt){
     const currentActor=await readStationGmActor(gm,'GM1','active',deadlineAt);assertStationAckActor(actorAnchor,currentActor);
     const authority=await readOwnedStationAuthority(deadlineAt);assertStationAckAuthority(actorAnchor,currentActor,authority);
     const context=stationCombatServerContext({...authority,publicAudience:null});assertSafePopulationAckState(authority,context);
     const sourceAlerts=stationPopulationAlertsForGm(context.populationAlerts,gm1Instance);
     const projection=await stationGmPopulationProjection(deadlineAt);
     for(const key of ['sessionId','phase','generation','hydrationRevision','instanceId'])assert.equal(projection[key],({sessionId:sid,phase:'active',generation:actorAnchor.generation,hydrationRevision:actorAnchor.hydrationRevision,instanceId:actorAnchor.instanceId})[key],`Current GM browser projection ${key} changed.`);
     assert.equal(projection.connection,'live');assert.equal(projection.freshness,'server');
     assert.deepEqual(projection.targetedUnrest,[],'Do not dismiss a population alert while the GM-targeted unrest alert is visible.');
     assert.deepEqual(projection.mutinyPanels,[],'Do not proceed while a mutiny recovery panel is visible.');
     const exactDialog=projection.visibleDialogs.length===1&&projection.visibleDialogs[0].role==='alertdialog'&&projection.visibleDialogs[0].name==='Survivor population threshold reached';
     if(projection.visibleDialogs.length&&!exactDialog)throw new Error('Stop on an unknown or consequential modal; only the exact population alert is eligible.');
     const uiAlerts=projection.targetedPopulation;
     if(sourceAlerts.length===0&&uiAlerts.length===0&&projection.visibleDialogs.length===0)return false;
     const visibleAlert=stationPopulationSelectVisibleAlert(sourceAlerts,uiAlerts,projection.visibleDialogs[0]);
     if(visibleAlert){
      const{shipId:mapShipId,alert}=visibleAlert;
      assert.ok(Number.isSafeInteger(alert.population)&&alert.population>=0);
      ready={authority,context,projection,shipId:mapShipId,alert};break;
     }
     await candidateWait(()=>delay(Math.min(150,deadlineAt-Date.now())),deadlineAt,'Station normal population alert feed wait');
    }
    assert.ok(ready,'The original Station wave deadline expired before the population alert was consistently visible.');
    const beforeActorObservation=await readStationGmActor(gm,'GM1','active',deadlineAt);assertStationAckActor(actorAnchor,beforeActorObservation);
    const beforeActor=beforeActorObservation.lifecycle;
    const beforeAuthority=await readOwnedStationAuthority(deadlineAt);assertStationAckAuthority(actorAnchor,beforeActorObservation,beforeAuthority);
    const before=stationCombatServerContext({...beforeAuthority,publicAudience:null});assertSafePopulationAckState(beforeAuthority,before);
    assert.equal(stable(before),stable(ready.context),'Station source changed before the targeted informational acknowledgment.');
    assert.ok(beforeAuthority.authoritativeAttack,'Retain the actual final server Station attack before acknowledgment.');assert.equal(beforeAuthority.authoritativeAttack.attackId,final.attackId);assert.equal(beforeAuthority.authoritativeAttack.revision,final.revision);assert.equal(beforeAuthority.authoritativeAttack.status,'resolved');assert.equal(beforeAuthority.authoritativeAttack.currentStep,'resolved');assert.equal(beforeAuthority.authoritativeAttack.pStationRepeat?.status,'repeat');
    const beforeProjection=await stationGmPopulationProjection(deadlineAt);assert.equal(stable(beforeProjection),stable(ready.projection),'The exact alert/actor projection changed before the acknowledgment.');
    const shipId=ready.shipId,expectedRevision=before.vesselActionRevisions?.[shipId]??0;assert.ok(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0);
    assert.equal(beforeProjection.vesselActionRevisions?.[shipId]??0,expectedRevision,'The current GM feed must expose the same source vessel revision as the server before dismissal.');
    const {dismiss,mounted}=await stationPopulationDismissMount();assert.deepEqual(mounted,{dialogCount:1,visible:true,dismissCount:1,enabled:true});
    const expectedIntent={actor:actorAnchor,source:stable(before),attack:stable(beforeAuthority.authoritativeAttack),projection:stable(beforeProjection),shipId,alert:stable(ready.alert),revision:expectedRevision,mounted};
    const readCurrentIntent=async()=>{
     assert.ok(Date.now()<deadlineAt,'Original Station wave deadline expired before final population intent reads.');
     const currentActor=await readStationGmActor(gm,'GM1','active',deadlineAt);assertStationAckActor(actorAnchor,currentActor);
     const currentAuthority=await readOwnedStationAuthority(deadlineAt);assertStationAckAuthority(actorAnchor,currentActor,currentAuthority);
     const current=stationCombatServerContext({...currentAuthority,publicAudience:null});assertSafePopulationAckState(currentAuthority,current);
     assert.equal(stable(current),stable(before),'Station source or alert tuple changed before the normal population dismissal click.');
     assert.equal(stable(currentAuthority.authoritativeAttack),stable(beforeAuthority.authoritativeAttack),'Resolved Station attack changed before the population dismissal click.');
     const currentProjection=await stationGmPopulationProjection(deadlineAt);
     for(const key of ['sessionId','phase','connection','freshness','generation','hydrationRevision','instanceId'])assert.equal(currentProjection[key],beforeProjection[key],`Current GM projection ${key} changed before the population dismissal click.`);
     assert.deepEqual(currentProjection.targetedUnrest,[],'Stop if unrest becomes pending before the population dismissal click.');assert.deepEqual(currentProjection.mutinyPanels,[],'Stop if mutiny recovery appears before the population dismissal click.');
     const currentAlerts=stationPopulationAlertsForGm(current.populationAlerts,gm1Instance);assert.equal(currentAlerts[0]?.[0],shipId);assert.equal(stable(currentAlerts[0]?.[1]),stable(ready.alert));
     const currentUi=stationPopulationUiRows(currentAlerts);assert.deepEqual(currentProjection.targetedPopulation,currentUi);
     assert.equal(currentProjection.visibleDialogs.length,1);assert.equal(stationPopulationDialogMatches(currentProjection.visibleDialogs[0],currentUi[0]),true);
     const currentMount=await stationPopulationDismissMount();
     return{actor:actorAnchor,source:stable(current),attack:stable(currentAuthority.authoritativeAttack),projection:stable(currentProjection),shipId,alert:stable(currentAlerts[0][1]),revision:current.vesselActionRevisions?.[shipId]??0,mounted:currentMount.mounted};
    };
    const readIntentBookend=async()=>{
     assert.ok(Date.now()<deadlineAt,'Original Station wave deadline expired before the final source bookend.');
     const bookendActor=await readStationGmActor(gm,'GM1','active',deadlineAt);assertStationAckActor(actorAnchor,bookendActor);
     const bookendAuthority=await readOwnedStationAuthority(deadlineAt);assertStationAckAuthority(actorAnchor,bookendActor,bookendAuthority);
     const bookend=stationCombatServerContext({...bookendAuthority,publicAudience:null});assertSafePopulationAckState(bookendAuthority,bookend);
     assert.equal(stable(bookend),stable(before),'Station source, safety state, or pinned population alert changed during the final mounted-control checks.');
     assert.equal(stable(bookendAuthority.authoritativeAttack),stable(beforeAuthority.authoritativeAttack),'Resolved Station attack changed during the final mounted-control checks.');
     return{actor:actorAnchor,source:stable(bookend),attack:stable(bookendAuthority.authoritativeAttack)};
    };
    assert.ok(Date.now()<deadlineAt,'Original Station wave deadline expired before population dismissal intent verification.');
    const capture=await action(gm,'dismissPopulationAlert',()=>stationPopulationDismissIntent({deadlineAt,expected:expectedIntent,readCurrentIntent,readIntentBookend,click:()=>{const timeout=deadlineAt-Date.now();assert.ok(Number.isFinite(timeout)&&timeout>0,'Original Station wave deadline expired immediately before the population dismissal click.');return dismiss.click({timeout});}}),{deadlineAt,original:beforeActor,gm:true,matches:data=>data?.sessionId===sid&&data?.shipId===shipId&&data?.instanceId===gm1Instance&&data?.expectedRevision===expectedRevision});
    assert.equal(capture.httpStatus,200);assert.equal(capture.data.sessionId,sid);assert.equal(capture.data.shipId,shipId);assert.equal(capture.data.instanceId,gm1Instance);assert.equal(capture.data.expectedRevision,expectedRevision);assert.equal(typeof capture.data.requestId,'string');assert.ok(capture.data.requestId.length>0);
    const response=capture.result,gmPlayer=beforeAuthority.players.find(player=>player.uid===actorUids.get('GM1'));assert.ok(gmPlayer);assert.equal(gmPlayer.role,'gm');assert.equal(response.dismissed,true);assert.equal(response.actorUid,actorUids.get('GM1'));assert.equal(response.actorRoleId,gmPlayer.activeConsoleRoleId??null);assert.equal(response.vesselId,shipId);assert.equal(response.turn,before.currentTurn);assert.equal(response.phase,'active');assert.equal(response.revision,expectedRevision+1);assert.equal(response.idempotencyKey,capture.data.requestId);assert.equal(response.auditId,`dismiss-population-${capture.data.requestId}`);
    const entry={wave,nextWave,attack:{attackId:final.attackId,revision:final.revision,status:final.status,currentStep:final.currentStep,pStationRepeat:final.pStationRepeat},actor:actorAnchor,ui:{role:'alertdialog',name:'Survivor population threshold reached',button:'Dismiss population alert',shipId,shipName:ready.alert.shipName,population:ready.alert.population},request:{endpoint:'dismissPopulationAlert',httpStatus:capture.httpStatus,data:capture.data,responseBody:{result:response}},sourceBefore:stationAckSafeSummary(before,shipId),sourceAfter:null,browserBefore:beforeProjection,browserAfter:null};
    (evidence.stationPopulationAcknowledgments??=[]).push(entry);await writeFile(`${directory}/Station-population-alert-acks.json`,JSON.stringify(evidence.stationPopulationAcknowledgments,null,2)+'\n');
    const afterAuthority=await readOwnedStationAuthority(deadlineAt),after=stationCombatServerContext({...afterAuthority,publicAudience:null});entry.sourceAfter=stationAckSafeSummary(after,shipId);await writeFile(`${directory}/Station-population-alert-acks.json`,JSON.stringify(evidence.stationPopulationAcknowledgments,null,2)+'\n');
    assertSafePopulationAckState(afterAuthority,after);assertStationPopulationAcknowledgmentTransition(before,after,shipId);assert.equal(stable(afterAuthority.authoritativeAttack),stable(beforeAuthority.authoritativeAttack),'Population acknowledgment must not change the resolved Station attack.');
    const afterActor=await readStationGmActor(gm,'GM1','active',deadlineAt);assertStationAckActor(actorAnchor,afterActor);assertStationAckAuthority(actorAnchor,afterActor,afterAuthority);
    const remainingAlerts=stationPopulationAlertsForGm(after.populationAlerts,gm1Instance),remainingUi=stationPopulationUiRows(remainingAlerts);
    let settledProjection=null;while(Date.now()<deadlineAt){
     const currentActor=await readStationGmActor(gm,'GM1','active',deadlineAt);assertStationAckActor(actorAnchor,currentActor);
     const currentAuthority=await readOwnedStationAuthority(deadlineAt);assertStationAckAuthority(actorAnchor,currentActor,currentAuthority);
     const currentContext=stationCombatServerContext({...currentAuthority,publicAudience:null});assertSafePopulationAckState(currentAuthority,currentContext);
     assert.equal(stable(currentContext),stable(after),'Station source changed while awaiting normal population alert publication.');assert.equal(stable(currentAuthority.authoritativeAttack),stable(afterAuthority.authoritativeAttack),'Resolved Station attack changed while awaiting alert publication.');
     const current=await stationGmPopulationProjection(deadlineAt);for(const key of ['sessionId','phase','connection','freshness','generation','hydrationRevision','instanceId'])assert.equal(current[key],beforeProjection[key],`Normal GM feed ${key} changed during population dismissal.`);
     assert.deepEqual(current.targetedUnrest,[],'Stop if unrest becomes pending during dismissal.');assert.deepEqual(current.mutinyPanels,[],'Stop if mutiny recovery appears during dismissal.');
     const exactPopulationDialog=current.visibleDialogs.length===1&&current.visibleDialogs[0].role==='alertdialog'&&current.visibleDialogs[0].name==='Survivor population threshold reached';
     if(current.visibleDialogs.length&&!exactPopulationDialog)throw new Error('Stop if a consequential or unknown modal replaces the population alert.');
     if(current.visibleDialogs.length&& !stationPopulationDialogMatches(current.visibleDialogs[0],ready.alert)&&!(remainingAlerts.length&&stationPopulationDialogMatches(current.visibleDialogs[0],remainingAlerts[0][1])))throw new Error('Stop if a changed or unrecognized population tuple replaces the acknowledged alert.');
     const feedMatches=stable(current.targetedPopulation)===stable(remainingUi)&&stable(current.vesselActionRevisions)===stable(after.vesselActionRevisions??{});
     const dialogMatches=remainingAlerts.length?exactPopulationDialog&&stationPopulationDialogMatches(current.visibleDialogs[0],remainingAlerts[0][1]):current.visibleDialogs.length===0;
     if(feedMatches&&dialogMatches){settledProjection=current;break;}
     await candidateWait(()=>delay(Math.min(150,deadlineAt-Date.now())),deadlineAt,'Station normal population dismissal feed wait');
    }
    assert.ok(settledProjection,'Normal browser feed did not publish the exact remaining population alerts before the next wave.');entry.browserAfter=settledProjection;await writeFile(`${directory}/Station-population-alert-acks.json`,JSON.stringify(evidence.stationPopulationAcknowledgments,null,2)+'\n');
    if(remainingAlerts.length)await acknowledgeStationPopulationAlert({wave,nextWave,final,deadlineAt});
    return true;
   };
   const activeCrew=async(deadlineAt)=>{
    const actors=stationCrew.map(actor=>({...actor,uid:actorUids.get(actor.label)}));
    return selectStationCombatCrew(actors,{ships,
     readRoot:()=>candidateWait(()=>recordRoot(),deadlineAt,'Station current host loss'),
     readPlayers:async()=>{const players=await candidateWait(()=>db.collection(`sessions/${sid}/players`).get(),deadlineAt,'Station current custody owners');return players.docs.map(player=>({...player.data(),uid:player.id}));},
     readMember:(actor,{loss})=>candidateWait(()=>loss?fullStationLossMember(actor.surface):fullMember(actor.surface),deadlineAt,'Station original owner projection'),
     onObservation:observation=>(evidence.stationInactiveOwnerObservations??=[]).push(observation),
     onInactive:(actor,member)=>(evidence.stationInactiveOwners??=[]).push({roleId:actor.roleId,uidHash:member.uidHash,shipDestroyed:true,explicitEscape:true,noChoiceIssued:true}),
     wait:milliseconds=>candidateWait(()=>delay(milliseconds),deadlineAt,'Station normal owner feed wait'),deadlineAt});
   };
   const choose=(current,{deadlineAt})=>chooseStationCombatActor(current,{deadlineAt,chooseWing,pendingWingRecovery:[...recoveredLaunches.values()].some(row=>row.view.attackId===current.attackId&&!row.committed),chooseCrew:async(attack,options)=>dispatchStationCrewChoice(attack,{...options,sessionId:sid,actors:await activeCrew(options.deadlineAt),assertActor:assertCrewActor,readAttack,action})});
   try {
   let stationWaveDeadlineAt;
   const waves=await runStationCombatWaves({maximumWaves:12,
    assertActors:async()=>{await assertStationActors();},
    prepareAndDeclare:async()=>{for(const ship of stationSurvivingRepairTargets(ships,await recordRoot()))await repair(ship);await liveGm(gm,'GM1','active');await action(gm,'declareWolfAttack',()=>preparation.getByRole('button',{name:'Declare Wolf attack',exact:true}).click());},
    runWave:async()=>{stationWaveDeadlineAt=Math.min(Date.now()+480000,workEnd-60000);return runSparseStationCombat({deadlineAt:stationWaveDeadlineAt,readAttack,onState:retainCombatState,onDiagnosticError:async(error,attack)=>{recordDiagnosticError('diagnostic-retention',error,attack);},assertActors:async()=>{budget();await liveGm(gm,'GM1','active');assertSparseStationWing(await fullMember(recipient),evidence.stationWingOriginal);},choose,recoverChoice});},
    acknowledgeBetweenWaves:context=>acknowledgeStationPopulationAlert({...context,deadlineAt:stationWaveDeadlineAt}),
    persistWaves:currentWaves=>writeFile(`${directory}/Station-combat-waves.json`,JSON.stringify(currentWaves,null,2)+'\n')});
   const current=await recordRoot();await readStationLiberation(path=>db.doc(`sessions/${sid}/${path}`).get().then(doc=>doc.data()),current,{sessionId:sid,groupId,coordinate,sourceId:waves.at(-1).attackId,cycle:current.currentTurn});evidence.stationCombatWaves=waves;
   claims.push('Actual source-bound Station waves finalized with real server rolls; durable zero-survivor liberation precedes any Reactor contribution');
   } finally {recipient.page.off('response',observeLaunchRead);}
  },
  async stationActivate(){
   await mark('existing tested sparse activation callback after actual liberation');assertSparseStationWing(await fullMember(recipient),evidence.stationWingOriginal);for(const ship of stationSurvivingRepairTargets(ships,await recordRoot()))await repair(ship);
   const before=await recordRoot();const result=await runMinimumCandidateSuccessProbe(stationActivationContext({gm,wing:{...recipient,observe:()=>fullMember(recipient)},sessionId:sid,groupId,coordinate,recordRoot,selectGmShip:grant,deadlineAt:Math.min(Date.now()+60000,workEnd),configuredRoleCount:plan.configuredRoles}));
   evidence.stationActivation=result;assert.equal((await recordRoot()).debriefSnapshot.candidate.code,'P');claims.push('Unique real available Reactors consumed through current GM scoped grants; actual18+ capacity triggers immutable P success');
  },
  async stationEnding(){
   await mark('normal P success ending read and immutable GM close');const ended=await recordRoot();assert.equal(ended.debriefSnapshot.source,'candidate');assert.equal(ended.debriefSnapshot.result,'success');assert.equal(ended.debriefSnapshot.candidate.code,'P');const snapshotHash=hash(stable(ended.debriefSnapshot));
   const result=await sdk(gm,'getSessionDebrief',{sessionId:sid,instanceId:gm1Instance});assert.equal(result.snapshot.candidate.code,'P');
   await gm.page.getByRole('dialog',{name:'Endgame evaluation',exact:true}).waitFor();await gm.page.screenshot({path:`${directory}/Station-GM-ending.png`});await action(gm,'closeSession',()=>gm.page.getByRole('button',{name:'Close session',exact:true}).click());await gm.until('Actual closed P history',v=>v.phase==='closed');assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   evidence.endingProof=true;claims.push('Actual P candidate success displayed through entitled GM read; normal Close retains immutable snapshot. P member closed reload remains separate.');
  },
  async pursuitAndClose(){
   await mark('ordinary offered Pursuit ending and GM Close');
   const initial={sessionId:sid};
   await bounded(runPursuitLimitEnding({gm,crew:recipient,initial,directory,entitledGmEndingRead:true,afterCycleAdvance:cycle=>presentPursuitCycle(surfaces,surface=>snapshot(surface,`Pursuit Cycle${cycle} presentation`))}),workEnd-Date.now(),'Pursuit closure work cap exhausted.',()=>{stopped=true;});
   const ended=await recordRoot();assert.equal(ended.phase,'closed');assert.equal(ended.debriefSnapshot.source,'failure-review');assert.equal(ended.debriefSnapshot.cause,'pursuit-limit');
   const snapshotHash=hash(stable(ended.debriefSnapshot));
   await mark('fresh authoritative ordinary Pursuit closed history');
   const deadlineAt=Math.min(Date.now()+60000,workEnd),priorDocument=(await recipient.observe()).documentTimeOrigin;
   const response=await op(()=>observeUiReceipt({page:recipient.page,
    waitForResponse:()=>recipient.page.waitForResponse(r=>['resumeSession','getCurrentMemberSession'].includes(new URL(r.url()).pathname.split('/').at(-1))&&r.request().method()==='POST'&&r.request().postDataJSON()?.data?.sessionId===sid,{timeout:Math.min(35000,deadlineAt-Date.now())}),
    choose:()=>recipient.page.reload({timeout:Math.min(35000,deadlineAt-Date.now())})}),deadlineAt);
   assert.equal(response.status(),200);const endpoint=new URL(response.url()).pathname.split('/').at(-1),body=await response.json();
   const result=body.result;let generation;
   if(endpoint==='resumeSession'){assert.equal(result.player.uid,actorUids.get('Recipient'));assert.equal(result.player.sessionId,sid);assert.equal(result.player.fleetGroupId,groupId);generation=result.player.connectionGeneration;}
   else{assert.equal(endpoint,'getCurrentMemberSession');assert.equal(result.type,'current-member-session');assert.equal(result.sessionId,sid);assert.equal(result.actorUid,actorUids.get('Recipient'));assert.equal(result.groupId,groupId);generation=result.connectionGeneration;}
   assert.ok(Number.isSafeInteger(generation)&&generation>=1);assert.equal(result.session.id,sid);assert.equal(result.session.phase,'closed');
   const publicSnapshot=result.session.debriefSnapshot;assert.equal(publicSnapshot.type,'session-debrief');assert.equal(publicSnapshot.source,'failure-review');assert.equal(publicSnapshot.result,'failure');assert.equal(publicSnapshot.cause,'pursuit-limit');assert.equal(publicSnapshot.cycle,ended.debriefSnapshot.cycle);
   for(const group of publicSnapshot.candidate?.groups??[]){assert.equal(Object.hasOwn(group,'groupId'),false);for(const step of group.path??[])assert.equal(Object.hasOwn(step,'audience'),false);}
   receipts.push({endpoint,result,transport:'normal Pursuit closed-history reload receipt'});
   await op(()=>recipient.until('Fresh same-UID server Pursuit history',v=>v.documentTimeOrigin!==priorDocument&&v.hasAuth&&v.sameActor&&v.uidHash===short(actorUids.get('Recipient'))&&v.sessionId===sid&&v.fleetGroupId===groupId&&v.connectionGeneration===generation&&v.phase==='closed'&&v.freshness==='server'&&Number.isSafeInteger(v.hydrationRevision)&&v.hydrationRevision>0&&v.debriefType==='session-debrief'&&v.debriefVersion===1&&v.debriefSource==='failure-review'&&v.debriefResult==='failure'&&v.debriefCause==='pursuit-limit'&&v.debriefCycle===ended.debriefSnapshot.cycle,deadlineAt-Date.now()),deadlineAt);
   assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   await recipient.page.getByRole('dialog',{name:'Endgame evaluation',exact:true}).waitFor();await recipient.page.screenshot({path:`${directory}/Pursuit-reader-authoritative-history.png`});
   evidence.endingProof=true;evidence.nClosedHistoryObserved=false;claims.push('Normal Pursuit freeze/GM Close preserves immutable snapshot; fresh same-UID ordinary reload bound to real server receipt and public history');
  },
  async researchCycle(cycle){
   await mark(`actual ordinary Scientist research and official GM maintenance Cycle${cycle}`);
   assert.equal((await recordRoot()).currentTurn,cycle);
   for(const[index,trackId]of TRACKS.entries()){
    const view=await sdk(recipient,'readEndeavourResearchWorkspace',{sessionId:sid});
    const current=await recordRoot(),data={sessionId:sid,requestId:crypto.randomUUID(),expectedCycle:cycle,
     expectedControlRevision:current.shuttleControl.endeavour.revision,expectedResearchRevision:ringResearchRevision(view),
     trackId,funding:index<3?'standard':'shepherd-ore'};
    const result=await sdk(recipient,'advanceEndeavourResearchTrack',data);
    assertRingResearchChoice(result,{trackId,cycle,oreCost:index<3?0:5});
   }
   for(const ship of ships)await maintain(ship);
   await coordination(cycle);
  },
  async advance(cycle){
   await mark(`ordinary manual Advance to Cycle${cycle}`);
   await op(async deadlineAt=>{
    const before=await liveGm(gm,'GM1','active',{deadlineAt}),confirmation=gm.page.getByRole('button',{name:`ARE YOU SURE? // Advance to Cycle ${cycle}`,exact:true});
    await action(gm,'advanceTurn',()=>completeOfferedTurnAdvance({expected:{sessionId:sid,uidHash:before.uidHash,instanceId:gm1Instance,cycle:cycle-1},
     inspect:async()=>({...await gm.observe(),confirmationOffered:await confirmation.isVisible()}),
     clickAdvance:()=>gm.page.getByRole('button',{name:`Advance to Cycle ${cycle}`,exact:true}).click(),clickConfirmation:()=>confirmation.click()}));
    await gm.until('Original next cycle publication',v=>v.cycle===cycle&&v.phase==='active',deadlineAt-Date.now());
    for(const surface of surfaces)await completeOfferedCyclePresentation(surface,await snapshot(surface,`Cycle${cycle} presentation`),{clearBriefing:true});
   });
  },
  async arrive(){
   await mark('actual charged paid arrivals at N');
   for(const shipId of ships){
    await grant(shipId);const before=await recordRoot();
    const result=await sdk(gm,'jumpShip',{sessionId:sid,instanceId:gm1Instance,shipId,destination:coordinate,
     requestId:crypto.randomUUID(),expectedRevision:before.vesselActionRevisions?.[shipId]??0});
    const after=await recordRoot();assertRingPaidArrival(result,before,after,shipId);
   }
   const navigation=await op(()=>db.doc(`sessions/${sid}/serverState/navigation`).get());
   assertRingNavigation(navigation,ships,coordinate);
   await memberReady(recipient,'Recipient');await memberReady(owner,'Owner');
   claims.push('Six genuinely charged/paid arrivals provide new Ring discovery state; no scout matrix replay or relocation substitute');
  },
  async repairRing(){
   await mark('three entitled actors produce actual Ring repair');
   const before=await recordRoot();await candidate(gm,'contribute-materials',{shipId:'aegis',amount:10});
   assert.equal(before.shipResources.aegis.materials-(await recordRoot()).shipResources.aegis.materials,10);
   await candidate(recipient,'contribute-research',{trackIds:TRACKS});
   const {path}=await workspace(owner);assert.ok(path.engineeringShuttles.some(craft=>craft.id==='black-sheep'));
   await candidate(owner,'commit-engineering-shuttle',{shuttleId:'black-sheep'});
   const after=await recordRoot();assertRingCraftConsumption(after,'black-sheep');
   assert.equal((await workspace()).path.repaired,true);
   claims.push('Actual10material debit, five distinct real4-cross tracks, holder contribution, permanent craft reservation/docking removal and automatic Ring repair');
  },
  async crossAndRecover(){
   await mark('paid actual UI crossing with interrupted durable original reply and cold reload');
   const deadlineAt=Date.now()+60000,before=await recordRoot();await grant('aegis');
   const panel=gm.page.getByRole('region',{name:'Candidate preparation and actions',exact:true});
   await panel.getByRole('combobox',{name:'GM candidate vessel',exact:true}).selectOption('aegis');
   await action(gm,'setGmShipConsoleWriteGrant',()=>panel.getByRole('button',{name:'Enable GM candidate ship control',exact:true}).click());
   const control=await installLossAck(gm,'executeCandidateAction',async(data,reply)=>{
    assert.equal(data.action,'ring-passage');assert.equal(data.shipId,'aegis');assert.equal(reply.outcome,'crossed');
    const receipt=await db.doc(`sessions/${sid}/candidateActionReceipts/${data.requestId}`).get();assert.deepEqual(receipt.get('result'),reply);
    const current=await recordRoot();assert.equal(before.shipResources.aegis.fuel-current.shipResources.aegis.fuel,5);
    return await ringWitness();
   },deadlineAt);lossAckControls.push(control);
   await op(()=>panel.getByRole('button',{name:'Cross Ring // aegis // five fuel',exact:true}).click(),deadlineAt);
   await control.settled(deadlineAt-Date.now());crossing=control.record;
   await op(()=>panel.getByRole('button',{name:'Retry original candidate request',exact:true}).waitFor({state:'visible'}),deadlineAt);
   const beforeReload=await ringWitness();await op(()=>gm.page.reload(),deadlineAt);await liveGm(gm,'GM1','active',{deadlineAt});
   assert.equal((await gm.observe()).uidHash,short(actorUids.get('GM1')));assert.deepEqual(await ringWitness(),beforeReload);
   const retry=gm.page.getByRole('region',{name:'Candidate preparation and actions',exact:true}).getByRole('button',{name:'Retry original candidate request',exact:true});
   await op(()=>retry.waitFor({state:'visible'}),deadlineAt);control.recover();
   await op(()=>action(gm,'executeCandidateAction',()=>retry.click()),deadlineAt);
   await control.recovered(deadlineAt-Date.now());assert.deepEqual(await ringWitness(),beforeReload);
   await control.dispose(Math.max(1,deadlineAt-Date.now()));
   const replay=await sdk(gm,'executeCandidateAction',crossing.data);assert.deepEqual(replay,{...crossing.serverReply,status:'replayed'});assert.deepEqual(await ringWitness(),beforeReload);
   const denial=await op(()=>recipient.callable('executeCandidateAction',crossing.data));assert.equal(denial.status,'denied');assert.equal(denial.code,'functions/permission-denied');assert.deepEqual(await ringWitness(),beforeReload);
   claims.push('619 Ring paid crossing original UI intent survives lost acknowledgement/cold GM reload; exact UI and SDK replay preserve fuel, original receipt/audit/state; actual wrong-actor replay denied without mutation');
  },
  async finishPassages(){
   await mark('remaining ordinary official GM paid Ring passages');
   for(const shipId of ships.filter(ship=>ship!=='aegis')){const before=await recordRoot();const{result}=await candidate(gm,'ring-passage',{shipId});assert.equal(result.outcome,'crossed');assert.equal(result.fuelSpent,5);assert.equal(before.shipResources[shipId].fuel-(await recordRoot()).shipResources[shipId].fuel,5);}
  },
  async sabotageAndClose(){
   await mark('explicit far-side sabotage produces immutable candidate success');
   await candidate(gm,'sabotage-ring');await gm.until('Actual Ring debrief publication',v=>v.phase==='debrief'&&v.fullGameDemo?.status==='complete');
   const ended=await recordRoot();assertRingSuccessfulSnapshot(ended);
   const snapshotHash=hash(stable(ended.debriefSnapshot));
   const late=await sdk(gm,'executeCandidateAction',crossing.data);assert.deepEqual(late,{...crossing.serverReply,status:'replayed'});assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   await readRingEndingHistory((name,data)=>sdk(gm,name,data),{sessionId:sid,instanceId:gm1Instance});assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   await gm.page.getByRole('dialog',{name:'Endgame evaluation',exact:true}).waitFor();await gm.page.screenshot({path:`${directory}/Ring-GM-ending.png`});
   await action(gm,'closeSession',()=>gm.page.getByRole('button',{name:'Close session',exact:true}).click());await gm.until('Actual closed Ring history',v=>v.phase==='closed');
   assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   const closedDeadlineAt=Math.min(Date.now()+60000,workEnd),priorDocument=(await recipient.observe()).documentTimeOrigin;
   const closedResponse=await op(()=>observeUiReceipt({page:recipient.page,consumed:{stage,closedHistory:true},
    waitForResponse:()=>recipient.page.waitForResponse(response=>{
     const endpoint=new URL(response.url()).pathname.split('/').at(-1);
     return ['resumeSession','getCurrentMemberSession'].includes(endpoint)&&response.request().method()==='POST'&&response.request().postDataJSON()?.data?.sessionId===sid;
    },{timeout:Math.min(35000,closedDeadlineAt-Date.now())}),
    choose:()=>recipient.page.reload({timeout:Math.min(35000,closedDeadlineAt-Date.now())})}),closedDeadlineAt);
   assert.equal(closedResponse.status(),200);const endpoint=new URL(closedResponse.url()).pathname.split('/').at(-1),closedBody=await closedResponse.json();
   const closedGeneration=assertRingClosedServerReceipt(endpoint,closedBody.result,{sessionId:sid,uid:actorUids.get('Recipient'),groupId});
   receipts.push({endpoint,result:closedBody.result,transport:'normal closed-history reload receipt'});
   const restored=await op(()=>recipient.until('Entitled ordinary Scientist server closed history after original reload',v=>
    v.documentTimeOrigin!==priorDocument&&v.connectionGeneration===closedGeneration&&isAcceptedRingClosedHistory(v,{sessionId:sid,uidHash:short(actorUids.get('Recipient')),groupId,cycle:ended.debriefSnapshot.cycle,ships}),closedDeadlineAt-Date.now()),closedDeadlineAt);
   assert.equal(restored.uidHash,short(actorUids.get('Recipient')));await recipient.page.getByRole('dialog',{name:'Endgame evaluation',exact:true}).waitFor();await recipient.page.screenshot({path:`${directory}/Ring-Scientist-closed-history.png`});
   evidence.endingProof=true;evidence.candidate619OriginalPaidPassageRecovery=true;
   claims.push('Actual GM far-side sabotage blocks pursuit, source Ring success/debrief, exact late crossing receipt, automatic immutable success freeze, authorized GM history read, immutable close and entitled same-UID closed-history reload');
  },
 };
 let directoryCreated=false;
 try{
  await mkdir(directory,{mode:0o700});directoryCreated=true;
  const runtime=await bounded(fetch(`${baseUrl}/src/lib/firebaseConfig.ts`).then(response=>response.text()),15000,'Original preflight runtime read expired.');
  evidence.runtime=validateProofRuntime(proofRuntimeFromViteSource(runtime),{baseUrl,projectId,ports});
  assert.equal((await bounded(db.collection('sessions').get(),15000,'Original preflight session census expired.')).size,0);
  const authCensus=await bounded(adminAuth.listUsers(1000),15000,'Original preflight Auth census expired.');
  assert.equal(authCensus.pageToken,undefined,'Use a fresh bounded isolated runtime.');
  for(const user of authCensus.users)preexistingUids.add(user.uid);
  evidence.preexistingAuthCount=preexistingUids.size;
  await writeFile(`${directory}/prelaunch.json`,JSON.stringify({allocation,sourceCommit,plan,nativeLaunched:false},null,2)+'\n');
  await Promise.race([lossAckFailure.then(error=>{throw error;}),bounded(closureOnly?runPursuitClosureWorkflow(operations):stationOnly?runStationWorkflow(operations):runRingWorkflow(operations),workEnd-Date.now(),'Ring execution work cap exhausted.',()=>{stopped=true;})]);
  assertRingRuntimeClean(errors,remoteRequests);evidence.status='passed';
 }catch(error){primaryFailure=error;stopped=true;evidence.status='failed';evidence.firstFailure={stage,error:originalProofError(error)};
  if(directoryCreated)await retainProofFailure(directory,'minimum-ring',error,{stage,consumed,claims}).catch(()=>{});
 }finally{
  stopped=true;const cleanup={browsersClosed:0,sessionAbsent:false,deletedOwnAuth:0,deletedOwnPointers:0,errors:[],otherDataChanged:'not-measured'};
  async function clean(label,run){const remaining=totalEnd-Date.now()-1000;if(remaining<=0){cleanup.errors.push({label,error:'original cleanup cap expired'});return;}try{return await bounded(Promise.resolve().then(run),remaining,`Original ${label} cleanup expired.`);}catch(error){cleanup.errors.push({label,error:originalProofError(error)});}}
  for(const control of lossAckControls)await clean('interrupted reply handler',()=>control.dispose(Math.min(5000,totalEnd-Date.now()-1000)));
  await clean('owned pending launches',()=>Promise.allSettled(pendingLaunches));
  for(const browser of browsers)await clean('owned browser',async()=>{await browser.close();assert.equal(browser.isConnected(),false);cleanup.browsersClosed++;});
  if(sid){
   await clean('own join pointer',()=>db.runTransaction(async tx=>{const ref=db.doc(`joinCodes/${joinCode}`),doc=await tx.get(ref);if(doc.exists){assert.equal(doc.get('sessionId'),sid);tx.delete(ref);}}));
   await clean('own membership pointers',async()=>{const pointers=await db.collection('activeMemberships').where('sessionId','==',sid).get();assert.ok(pointers.docs.every(doc=>[...actorUids.values()].includes(doc.id)));await db.runTransaction(async tx=>{const documents=await Promise.all(pointers.docs.map(doc=>tx.get(doc.ref)));for(const doc of documents){assert.equal(doc.get('sessionId'),sid);tx.delete(doc.ref);}});cleanup.deletedOwnPointers=pointers.size;});
   await clean('own fresh session',async()=>{await db.recursiveDelete(db.doc(`sessions/${sid}`));cleanup.sessionAbsent=!(await db.doc(`sessions/${sid}`).get()).exists;assert.equal(cleanup.sessionAbsent,true);});
  }
  for(const uid of actorUids.values())await clean('own fresh Auth',async()=>{const user=await adminAuth.getUser(uid);assertFreshRingIdentity(user,startAt,preexistingUids);await adminAuth.deleteUser(uid);cleanup.deletedOwnAuth++;});
  await clean('source unchanged',async()=>{assert.deepEqual(await capturePc10Gate2SourceBinding(root,fileURLToPath(import.meta.url)),sourceBinding);assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'');});
  await clean('own Admin client',async()=>{await db.terminate();await deleteApp(adminApp);});
  evidence.cleanup=cleanup;evidence.elapsedMs=Date.now()-startAt;
  primaryFailure=finalizeRingEvidence(evidence,cleanup,primaryFailure);
  if(directoryCreated)await writeFile(`${directory}/OWNER_RESULT.json`,JSON.stringify(evidence,null,2)+'\n');
 }
 if(primaryFailure)throw primaryFailure;return evidence;
}
if(process.argv[1]&&await realpath(process.argv[1])===await realpath(fileURLToPath(import.meta.url))){
 const args=process.argv.slice(2);assert.equal(args.length,4,'Use --allocation ABSOLUTE_JSON --evidence NEW_ABSOLUTE_DIRECTORY.');
 assert.equal(args[0],'--allocation');assert.equal(args[2],'--evidence');
 await runFreshMinimumRingProof({allocationPath:args[1],directory:args[3]});
}
