import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';
import { heldProofFailureObservations, rememberProofFailure } from './pc10-proof-failure-evidence.mjs';
// P-specific source adapter. Injected synthetic tests do not establish native authority.
const stationStepOrder = ['targeting', 'long-range', 'medium-range', 'short-range', 'boarding', 'resolved'];
export function assertStationCombatSource(current, original = current, previous = original) {
 assert.ok(current && original && previous, 'Current original Station attack source is required.');
 for(const key of ['attackId','targetGroupId','threatSourceId']) {
  assert.ok(typeof original[key]==='string'&&original[key].length>0, `Original Station ${key} is required.`);
  assert.equal(current[key],original[key],`Original Station ${key} changed.`);
 }
 assert.ok(Number.isSafeInteger(original.turn)&&original.turn>=1,'Original Station attack cycle is required.');
 assert.equal(current.turn,original.turn);assert.equal(original.threatSiteCode,'P');assert.equal(current.threatSiteCode,'P');
 assert.ok(Number.isSafeInteger(current.revision)&&current.revision>=1&&current.revision>=previous.revision,
  'Original Station attack revision regressed or is malformed.');
 const priorStep=stationStepOrder.indexOf(previous.currentStep),nextStep=stationStepOrder.indexOf(current.currentStep);
 assert.ok(priorStep>=0&&nextStep>=priorStep,'Original Station attack step regressed or is unknown.');
 if(nextStep!==priorStep)assert.ok(current.revision>previous.revision,'Forward Station progress must advance revision.');
 if(current.status==='resolved') {
  assert.equal(current.currentStep,'resolved');assert.equal(current.airspaceLocked,false,'A finalized Station attack must release its lock.');
  assert.ok(['repeat','stopped'].includes(current.pStationRepeat?.status),'A finalized Station attack requires its actual repeat or stopped outcome.');
 } else {
  assert.equal(current.status,'declared');assert.notEqual(current.currentStep,'resolved');
  assert.equal(current.airspaceLocked,true,'A declared Station attack must keep its lock.');
 }
 return current;
}
export function assertSparseStationWing(actor,original){
 for(const key of ['uidHash','sessionId','fleetGroupId','cycle'])assert.equal(actor[key],original[key],`Original Station Wing ${key}`);
 for(const key of ['hasAuth','sameActor','currentCanonicalSeatOwned','currentMemberBerthPresent','currentMemberBerthMatches'])assert.equal(actor[key],true,`Station Wing requires ${key}`);
 assert.equal(actor.playerRole,'player');assert.equal(actor.assignedRoleId,'wing-commander');assert.equal(actor.activeConsoleRoleId,'wing-commander');assert.equal(actor.seatId,'wing-commander');assert.equal(actor.connection,'live');assert.equal(actor.freshness,'server');
}
export async function runSparseStationCombat({deadlineAt,readAttack,assertActors,choose,wait=delay,onState=async()=>{},onDiagnosticError=async()=>{},recoverChoice=async()=>false}){
 assert.ok(Number.isFinite(deadlineAt));let original,previous,stageKey,stageDeadline,recoveryDeadline;
 while(Date.now()<deadlineAt){
  const current=await readAttack();assert.ok(Date.now()<deadlineAt,'Original Station combat budget expired during source read.');
  original??=structuredClone(current);assertStationCombatSource(current,original,previous??original);
  previous=structuredClone(current);try{await onState(current);}catch(error){try{await onDiagnosticError(error,current);}catch{/* Diagnostic reporting cannot replace the gameplay failure. */}}
  if(current.status==='resolved'){assert.equal(current.currentStep,'resolved');assert.ok(['repeat','stopped'].includes(current.pStationRepeat?.status));return current;}
  await assertActors();assert.equal(current.status,'declared');assert.ok(['targeting','long-range','medium-range','short-range','boarding'].includes(current.currentStep));
  const key=JSON.stringify([current.attackId,current.revision,current.currentStep]);if(key!==stageKey){stageKey=key;stageDeadline=Math.min(Date.now()+60000,deadlineAt,recoveryDeadline??Infinity);}
  assert.ok(Date.now()<stageDeadline,'Original Station combat stage deadline expired.');
  try { const choice=await choose(current,{deadlineAt:stageDeadline});if(choice?.committed)recoveryDeadline=undefined; } catch(error) {
   if(!await recoverChoice(error,current,{deadlineAt:stageDeadline}))throw error;
   recoveryDeadline=stageDeadline;
  }assert.ok(Date.now()<stageDeadline,'Original Station choice deadline expired.');await wait(Math.min(250,stageDeadline-Date.now()));
 }throw new Error('Original Station combat budget expired.');
}
export async function stationBoardingRead(current,{readChoice,readAttack,sessionId}){
 assert.equal(current.status,'declared');assert.equal(current.currentStep,'boarding');
 const reply=await readChoice();
 const closedRace=reply.status==='denied'&&reply.code==='functions/failed-precondition'&&reply.message==='Wolf boarding defence is not currently open.';
 assert.ok(reply.status==='committed'||closedRace,`Boarding read failed: ${reply.code??reply.status}`);
 if(reply.status==='committed')assert.equal(reply.result.sessionId,sessionId);
 const fresh=await readAttack();for(const key of ['attackId','turn','threatSiteCode'])assert.equal(fresh[key],current[key],`Original boarding ${key}`);
 assert.equal(fresh.threatSiteCode,'P');assert.ok(Number.isSafeInteger(fresh.revision)&&fresh.revision>=current.revision);
 if(fresh.status==='resolved'){
  assert.equal(fresh.currentStep,'resolved');assert.ok(['repeat','stopped'].includes(fresh.pStationRepeat?.status));
  return {kind:'resolved',attack:fresh};
 }
 assert.equal(closedRace,false,'Boarding phase rejection without actual same-attack finalization.');
 assert.equal(fresh.status,'declared');assert.equal(fresh.currentStep,'boarding');
 const view=reply.result;
 if(view.type==='wolf-boarding-defence-choice-view'){
  assert.equal(view.turn,fresh.turn);assert.equal(view.targetShipId,'aegis');assert.ok(['pending','committed'].includes(view.choiceStatus));
  assert.ok(Number.isSafeInteger(view.revision)&&view.revision>=current.revision&&view.revision<=fresh.revision);
  if(view.revision!==fresh.revision||view.choiceStatus==='committed')return {kind:'refresh'};
 }else{
  assert.equal(view.type,'wolf-boarding-defence-choice-unavailable');assert.ok(['no-boarders','not-your-choice'].includes(view.reason));
 }
 return {kind:'choice',view};
}

/** One exact rejected launch may use the existing UI refresh; never rebase an uncertain commit. */
export async function recoverStationLaunch(error,current,{observations,readAttack,readLaunchView,assertActors,
 deadlineAt,used,retain}) {
 const held=observations.findLast(item=>item.operation==='captureLifecycleUiAction'&&item.endpoint==='launchAegisFighterWing');
 const data=held?.requestData,body=held?.body;
 const valid=held?.httpStatus===400&&body?.error?.status==='FAILED_PRECONDITION'&&
  body.error.details?.commandError==='stale-revision'&&
  body.error.message==='The AEGIS Fighter Wing launch view is stale. Refresh the current Wolf attack.'&&
  current.status==='declared'&&current.currentStep==='targeting'&&
  ['fighter-wing-alpha','fighter-wing-bravo'].includes(data?.wingId)&&
  data.expectedTurn===current.turn&&Number.isSafeInteger(data.expectedRevision)&&
  Number.isSafeInteger(data.expectedWingRevision)&&typeof data.requestId==='string'&&
  typeof held.before?.uidHash==='string'&&held.before.uidHash.length>0&&
  data.sessionId===held.before?.sessionId&&held.before?.uidHash===held.current?.uidHash&&
  held.before?.sessionId===held.current?.sessionId;
 if(!valid||Date.now()>=deadlineAt)throw error;
 const key=JSON.stringify([current.attackId,current.turn,data.wingId]);if(used.has(key))throw error;
 await assertActors();const fresh=await readAttack();
 if(fresh.attackId!==current.attackId||fresh.turn!==current.turn||fresh.threatSiteCode!=='P'||
  fresh.status!=='declared'||fresh.currentStep!=='targeting'||!Number.isSafeInteger(fresh.revision)||
  fresh.revision<=data.expectedRevision)throw error;
 const view=await readLaunchView(data.wingId,deadlineAt,fresh);
 if(view?.sessionId!==data.sessionId||view.attackId!==current.attackId||view.turn!==current.turn||
  view.wingId!==data.wingId||view.revision!==fresh.revision||!Number.isSafeInteger(view.wingRevision)||
  view.wingRevision<data.expectedWingRevision||view.eligible!==true||view.launched!==false||Date.now()>=deadlineAt)throw error;
 await assertActors();await retain(error,{failedRequest:data,freshAttack:fresh,freshUiLaunchView:view,deadlineAt});
 used.set(key,{failedRequestId:data.requestId,view,deadlineAt});return true;
}
export function assertRecoveredStationLaunch(capture,current,used) {
 const key=JSON.stringify([current.attackId,current.turn,capture.data.wingId]),recovery=used.get(key);
 if(!recovery)return;const {view}=recovery;
 assert.notEqual(capture.data.requestId,recovery.failedRequestId,'Fresh rejected-launch choice needs a new request ID.');
 assert.equal(capture.data.expectedTurn,view.turn);assert.equal(capture.data.expectedRevision,view.revision);
 assert.equal(capture.data.expectedWingRevision,view.wingRevision);assert.equal(capture.result.attackId,current.attackId);
 assert.equal(capture.result.wingId,view.wingId);assert.equal(capture.result.launched,true);
 assert.ok(Date.now()<recovery.deadlineAt,'Original rejected-launch deadline expired.');
 recovery.committed=true;
}

// Selection seams for the finite Station proof. A destroyed hull stays in the
// original roster, but it can never be selected for repair or Reactor power.
export function stationSurvivingRepairTargets(plannedShipIds,root) {
 assert.ok(Array.isArray(plannedShipIds)&&plannedShipIds.length>0,'Original Station host roster is required.');
 const planned=new Set();
 for(const shipId of plannedShipIds){
  assert.equal(typeof shipId,'string','Original Station host ID must be a string.');
  assert.match(shipId,/^[a-z][a-z0-9-]*$/,'Original Station host ID must be canonical.');
  assert.equal(planned.has(shipId),false,`Duplicate original Station host ${shipId}.`);planned.add(shipId);
 }
 assert.ok(root&&typeof root==='object'&&!Array.isArray(root),'Current authoritative Station root is required.');
 assert.ok(Array.isArray(root.activeVesselIds),'Current authoritative original Station host roster is missing.');
 const current=new Set();
 for(const shipId of root.activeVesselIds){
  assert.equal(typeof shipId,'string','Current Station host ID must be a string.');
  assert.equal(current.has(shipId),false,`Duplicate current Station host ${shipId}.`);current.add(shipId);
 }
 assert.deepEqual([...current].sort(),[...planned].sort(),'Current Station hosts must match the original planned host IDs.');
 assert.ok(root.shipDamage&&typeof root.shipDamage==='object'&&!Array.isArray(root.shipDamage),
  'Current authoritative ship-damage map is required.');
 return plannedShipIds.filter(shipId=>{
  const damage=root.shipDamage[shipId];
  assert.ok(damage&&typeof damage==='object'&&!Array.isArray(damage),`Current damage record is missing for ${shipId}.`);
  assert.equal(typeof damage.destroyed,'boolean',`Current destroyed state is missing for ${shipId}.`);
  assert.ok(Array.isArray(damage.damagedSystemIds),`Current damaged-system list is missing for ${shipId}.`);
  const systems=new Set();
  for(const systemId of damage.damagedSystemIds){
   assert.equal(typeof systemId,'string',`Damaged system ID is malformed for ${shipId}.`);
   assert.equal(systems.has(systemId),false,`Duplicate damaged system ${systemId} for ${shipId}.`);systems.add(systemId);
  }
  return damage.destroyed===false;
 });
}
export function stationReactorCapacity(viewShips) {
 assert.ok(Array.isArray(viewShips)&&viewShips.length>0,'Current authoritative Station workspace ships are required.');
 const seen=new Set(),eligibleShipIds=[];let capacity=0;
 for(const ship of viewShips){
  assert.ok(ship&&typeof ship==='object'&&!Array.isArray(ship),'Station workspace ship row must be an object.');
  const {shipId,result,canAct,blocker,reactorCapacity}=ship;
  assert.equal(typeof shipId,'string','Station workspace ship ID must be a string.');
  assert.match(shipId,/^[a-z][a-z0-9-]*$/,'Station workspace ship ID must be canonical.');
  assert.equal(seen.has(shipId),false,`Duplicate Station workspace ship ${shipId}.`);seen.add(shipId);
  assert.ok(Number.isSafeInteger(reactorCapacity)&&reactorCapacity>=0,
   `Current Reactor capacity is missing or invalid for ${shipId}.`);
  if(result==='lost'){
   assert.equal(canAct,false,`Lost Station ship ${shipId} cannot act.`);
   assert.equal(blocker,'Lost or destroyed ship.',`Lost Station ship ${shipId} needs the source-reported loss blocker.`);
   continue;
  }
  assert.equal(result,'awaiting-choice',`Unexpected current Station action result for ${shipId}.`);
  assert.equal(canAct,true,`Living Station ship ${shipId} is blocked from Reactor contribution.`);
  assert.equal(blocker,'',`Living Station ship ${shipId} has a current contribution blocker.`);
  if(reactorCapacity===0)continue;
  eligibleShipIds.push(shipId);capacity+=reactorCapacity;
 }
 return {capacity,requiredCapacity:18,meetsThreshold:capacity>=18,eligibleShipIds};
}

const stationDeclarationActorKeys=['sessionId','uidHash','generation','hydrationRevision','instanceId','claimedAt',
 'hasAuth','sameActor','privateAudienceMatches','foreignPendingCount','playerRole','profileRoleId','profileSessionId',
 'gmInstanceOwned','connection','freshness','phase','cycle'];
function stationDeclarationStable(value){
 return value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stationDeclarationStable).join(',')}]`:
  `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stationDeclarationStable(value[key])}`).join(',')}}`;
}
function stationDeclarationActorTuple(actor,label){
 assert.ok(actor&&typeof actor==='object'&&!Array.isArray(actor),`${label} original GM actor is required.`);
 if(Object.hasOwn(actor,'live')||Object.hasOwn(actor,'lifecycle')){
  assert.ok(actor.live&&typeof actor.live==='object'&&!Array.isArray(actor.live));
  assert.ok(actor.lifecycle&&typeof actor.lifecycle==='object'&&!Array.isArray(actor.lifecycle));
  const {live,lifecycle}=actor;
  for(const key of ['hasAuth','sameActor','sessionId','uidHash','connectionGeneration','hydrationRevision','instanceId',
   'profileRoleId','profileSessionId','playerRole','gmInstanceOwned','connection','freshness'])
   assert.ok(Object.hasOwn(live,key)&&live[key]!==undefined,`${label} native live GM ${key} evidence is required.`);
  for(const [liveKey,lifecycleKey] of [['hasAuth','hasAuth'],['sameActor','sameActor'],['sessionId','sessionId'],
   ['uidHash','uidHash'],['connectionGeneration','generation'],['hydrationRevision','hydrationRevision'],
   ['instanceId','instanceId'],['profileRoleId','profileRoleId'],['playerRole','playerRole'],
   ['gmInstanceOwned','gmInstanceOwned'],['connection','connection'],['freshness','freshness']])
   assert.equal(live[liveKey],lifecycle[lifecycleKey],`${label} live and lifecycle GM ${liveKey} must agree.`);
  assert.equal(live.profileSessionId,null,`${label} native live GM profileSessionId must be explicitly null.`);
  if(Object.hasOwn(lifecycle,'profileSessionId'))assert.equal(lifecycle.profileSessionId,live.profileSessionId);
  actor={...lifecycle,profileSessionId:live.profileSessionId};
 }
 for(const key of stationDeclarationActorKeys)assert.ok(Object.hasOwn(actor,key)&&actor[key]!==undefined,
  `${label} original GM ${key} evidence is required.`);
 assert.ok(typeof actor.sessionId==='string'&&actor.sessionId.length>0);
 assert.ok(typeof actor.uidHash==='string'&&actor.uidHash.length>0);
 assert.ok(Number.isSafeInteger(actor.generation)&&actor.generation>=1);
 assert.ok(Number.isSafeInteger(actor.hydrationRevision)&&actor.hydrationRevision>=1);
 assert.ok(typeof actor.instanceId==='string'&&actor.instanceId.length>0);
 assert.ok(typeof actor.claimedAt==='string'&&actor.claimedAt.length>0);
 assert.equal(actor.hasAuth,true);assert.equal(actor.sameActor,true);
 assert.equal(actor.privateAudienceMatches,true,`${label} original GM actor must still match the private attack audience.`);
 assert.equal(actor.foreignPendingCount,0,`${label} original GM actor cannot have pending commands for another session.`);
 assert.equal(actor.profileRoleId,null);assert.equal(actor.profileSessionId,null);assert.equal(actor.gmInstanceOwned,true);
 assert.equal(actor.connection,'live');assert.equal(actor.freshness,'server');assert.equal(actor.phase,'active');
 assert.ok(Number.isSafeInteger(actor.cycle)&&actor.cycle>=1);
 return Object.fromEntries(stationDeclarationActorKeys.map(key=>[key,actor[key]]));
}
function stationDeclarationLifecycleTuple(actor,label){
 assert.ok(actor&&typeof actor==='object'&&!Array.isArray(actor),`${label} lifecycle actor is required.`);
 const lifecycleKeys=stationDeclarationActorKeys.filter(key=>key!=='profileSessionId');
 for(const key of lifecycleKeys)assert.ok(Object.hasOwn(actor,key)&&actor[key]!==undefined,
  `${label} lifecycle ${key} evidence is required.`);
 return Object.fromEntries(lifecycleKeys.map(key=>[key,actor[key]]));
}
function stationDeclarationSourceTuple(context,label){
 assert.ok(context&&typeof context==='object'&&!Array.isArray(context),`${label} source context is required.`);
 assert.ok(Number.isSafeInteger(context.wave)&&context.wave>=1,`${label} Station wave is required.`);
 const actor=stationDeclarationActorTuple(context.actor,label);
 const session=context.session;
 assert.ok(session&&typeof session==='object'&&!Array.isArray(session),`${label} current session source is required.`);
 assert.equal(session.phase,'active');assert.ok(Number.isSafeInteger(session.currentTurn)&&session.currentTurn>=1);
 assert.equal(actor.cycle,session.currentTurn,'Original GM cycle must match the server session cycle.');
 assert.deepEqual(session.fullGameDemo,{status:'active',progression:'manual'});
 const phase=session.turnPhase;
 assert.ok(phase&&typeof phase==='object'&&!Array.isArray(phase));assert.equal(phase.turn,session.currentTurn);
 assert.ok(typeof phase.teamPhaseEndsAt==='string'&&phase.teamPhaseEndsAt.length>0);
 assert.ok(typeof phase.openAirspaceEndsAt==='string'&&phase.openAirspaceEndsAt.length>0);
 assert.deepEqual(phase.airspace,{state:'lifted',tickerActive:true,pressAccess:false});
 assert.ok(phase.timerPause===null||phase.timerPause===undefined,'Station declaration cannot recover through a paused timer.');
 assert.equal(phase.progression,'manual');
 assert.deepEqual(session.turnState&&{currentTurn:session.turnState.currentTurn,maxTurn:session.turnState.maxTurn,
  phase:session.turnState.phase,phaseRevision:session.turnState.phaseRevision,startedAt:session.turnState.startedAt,
  endsAt:session.turnState.endsAt},{currentTurn:session.currentTurn,maxTurn:session.turnState?.maxTurn,
  phase:'coordination',phaseRevision:session.turnState?.phaseRevision,startedAt:session.turnState?.startedAt,
  endsAt:session.turnState?.endsAt});
 assert.ok(Number.isSafeInteger(session.turnState.maxTurn)&&session.turnState.maxTurn>=session.currentTurn);
 assert.ok(Number.isSafeInteger(session.turnLimit)&&session.turnLimit===session.turnState.maxTurn);
 assert.ok(Number.isSafeInteger(session.turnState.phaseRevision)&&session.turnState.phaseRevision>=0);
 assert.ok(typeof session.turnState.startedAt==='string'&&typeof session.turnState.endsAt==='string');
 assert.equal(session.gameOutcome??null,null);assert.equal(session.survivorOutcome??null,null);
 assert.equal(session.hasDebriefSnapshot??false,false);assert.equal(session.debriefMode?.active??false,false);
 const window=context.window,preparation=context.preparation;
 assert.ok(window&&typeof window==='object'&&!Array.isArray(window),`${label} current Wolf window is required.`);
 assert.equal(window.status,'due');assert.equal(window.turn,session.currentTurn);
 assert.ok(Number.isSafeInteger(window.revision)&&window.revision>=0);
 assert.equal(window.threatSiteCode,'P');assert.match(window.targetGroupId,/^fleet-[1-9][0-9]*$/);
 assert.match(window.threatSourceId,/^arrival-[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
 assert.ok(preparation&&typeof preparation==='object'&&!Array.isArray(preparation),`${label} current private preparation is required.`);
 assert.equal(preparation.turn,session.currentTurn);assert.ok(Number.isSafeInteger(preparation.revision)&&preparation.revision>0);
 assert.equal(preparation.targetGroupId,window.targetGroupId,'Prepared P composition must remain pinned to the due threat group.');
 assert.ok(Array.isArray(preparation.shipIds)&&preparation.shipIds.length>0);
 assert.ok(preparation.targetMode==='manual'||preparation.targetMode==='pre-rolled');
 assert.ok(Array.isArray(preparation.targetAssignments)&&Array.isArray(preparation.modifiers));
 assert.equal(typeof preparation.notes,'string');
 const attack=context.attack;
 if(attack===null){
  assert.equal(context.wave,1,'Only the first Station wave can have no previous private attack.');
  assert.equal(preparation.compositionKind,'P','The initial due P attack must use its source P composition.');
 }
 else{
  assert.equal(preparation.compositionKind,'p-station-repeat','Only a later Station repeat may use p-station-repeat composition.');
  assert.ok(attack&&typeof attack==='object'&&!Array.isArray(attack),`${label} current private attack is malformed.`);
  assert.equal(attack.type,'wolf-attack-state');assert.ok(typeof attack.attackId==='string'&&attack.attackId.length>0);
  assert.ok(Number.isSafeInteger(attack.attackNumber)&&attack.attackNumber>=1);
  assert.ok(Number.isSafeInteger(attack.preparationRevision)&&attack.preparationRevision>=0);
  assert.equal(attack.turn,session.currentTurn);assert.equal(attack.threatSiteCode,'P');
  assert.equal(attack.targetGroupId,window.targetGroupId);assert.equal(attack.threatSourceId,window.threatSourceId);
  assert.ok(Number.isSafeInteger(attack.revision)&&attack.revision>=0);
  assert.equal(attack.status,'resolved');assert.equal(attack.currentStep,'resolved');assert.equal(attack.airspaceLocked,false);
  assert.equal(attack.pStationRepeat?.status,'repeat','A subsequent Station declaration requires the prior attack to have repeated.');
  assert.ok(context.wave>1,'A prior resolved P attack is valid only after the first wave.');
 }
 // These are the decision-bearing source fields. Firestore's ordinary update
 // timestamps and unrelated session heartbeat data are deliberately excluded.
 const sessionProjection={phase:session.phase,currentTurn:session.currentTurn,turnLimit:session.turnLimit,
  fullGameDemo:{status:session.fullGameDemo.status,progression:session.fullGameDemo.progression},
  turnPhase:{turn:phase.turn,teamPhaseEndsAt:phase.teamPhaseEndsAt,openAirspaceEndsAt:phase.openAirspaceEndsAt,
   airspace:{state:phase.airspace.state,tickerActive:phase.airspace.tickerActive,pressAccess:phase.airspace.pressAccess},
   timerPause:phase.timerPause??null,progression:phase.progression},
  turnState:{currentTurn:session.turnState.currentTurn,maxTurn:session.turnState.maxTurn,
   phase:session.turnState.phase,phaseRevision:session.turnState.phaseRevision,
   startedAt:session.turnState.startedAt,endsAt:session.turnState.endsAt},
  gameOutcome:null,survivorOutcome:null,debriefModeActive:false,hasDebriefSnapshot:false};
 const windowProjection={status:window.status,turn:window.turn,revision:window.revision,
  targetGroupId:window.targetGroupId,threatSiteCode:window.threatSiteCode,threatSourceId:window.threatSourceId};
 const preparationProjection={turn:preparation.turn,revision:preparation.revision,compositionKind:preparation.compositionKind,
  targetGroupId:preparation.targetGroupId,shipIds:[...preparation.shipIds],
  targetMode:preparation.targetMode,targetAssignments:structuredClone(preparation.targetAssignments),
  modifiers:[...preparation.modifiers],notes:preparation.notes};
 const attackProjection=attack===null?null:{type:attack.type,attackId:attack.attackId,turn:attack.turn,
  attackNumber:attack.attackNumber,revision:attack.revision,preparationRevision:attack.preparationRevision,
  status:attack.status,currentStep:attack.currentStep,airspaceLocked:attack.airspaceLocked,
  targetGroupId:attack.targetGroupId,threatSiteCode:attack.threatSiteCode,threatSourceId:attack.threatSourceId,
  pStationRepeat:structuredClone(attack.pStationRepeat)};
 return {wave:context.wave,actor,session:sessionProjection,window:windowProjection,
  preparation:preparationProjection,attack:attackProjection};
}

/** Compare the already-pinned normal-GM phase, private preparation/window, and prior attack. */
export function assertStationDeclarationRetryContext(expected,current){
 const expectedTuple=stationDeclarationSourceTuple(expected,'Pinned'),currentTuple=stationDeclarationSourceTuple(current,'Current');
 assert.equal(stationDeclarationStable(currentTuple),stationDeclarationStable(expectedTuple),
  'Original Station declaration actor, phase, preparation, window, or prior attack changed.');
 return current;
}

/** Retain only the exact role, source, and timing fields that authorize a retry. */
export function stationDeclarationRetryProjection(context){return stationDeclarationSourceTuple(context,'Pinned');}

/**
 * Recover only an exact held normal-UI rate-limit rejection for a prepared P declaration.
 * The caller owns the UI click and must keep it inside this original deadline.
 */
export async function recoverStationRateLimitedDeclaration(error,{expectedContext,readCurrent,assertActor,
 deadlineAt,now=Date.now,wait=delay,used=new Set(),onObservation=()=>{}}={}){
 const notify=event=>{try{onObservation(event);}catch{/* Diagnostic retention cannot replace the original declaration failure. */}};
 const reject=(cause)=>{
  if(cause!==error)rememberProofFailure(error,{stationDeclarationRetryRejected:{message:cause?.message??String(cause)}});
  throw error;
 };
 let held,retryAfterMs,usedKey;
 try{
  assert.ok(Number.isFinite(deadlineAt)&&Number.isFinite(now())&&now()<deadlineAt,'Original Station declaration deadline is required and must remain open.');
  assert.equal(typeof readCurrent,'function');assert.equal(typeof assertActor,'function');assert.ok(used instanceof Set);
  const observations=heldProofFailureObservations(error);
  assert.equal(observations.length,1,'One exact held UI request observation is required.');
  held=observations[0];assert.equal(held.operation,'captureLifecycleUiAction');assert.equal(held.endpoint,'declareWolfAttack');
  assert.equal(held.httpStatus,429);assert.deepEqual(held.body?.error?.status,'RESOURCE_EXHAUSTED');
  assert.equal(held.body.error.details?.commandError,'rate-limited');
  assert.equal(held.body.error.message,'Too many requests for this session. Please try again shortly.');
  assert.ok(Number.isSafeInteger(held.body.error.details?.retryAfterSeconds)&&held.body.error.details.retryAfterSeconds>=1&&held.body.error.details.retryAfterSeconds<=60,
   'Exact rate-limit retryAfterSeconds must be an integer from 1 through 60.');
  retryAfterMs=held.body.error.details.retryAfterSeconds*1000;
  const request=held.requestData;
  assert.ok(request&&typeof request==='object'&&!Array.isArray(request));
  assert.equal(Object.keys(request).sort().join('|'),'expectedRevision|instanceId|requestId|sessionId',
   'Held declaration request must have the exact normal UI payload shape.');
  assert.equal(typeof request.requestId,'string');assert.ok(request.requestId.length>0);
  const expectedTuple=stationDeclarationSourceTuple(expectedContext,'Pinned');
  assert.equal(request.sessionId,expectedTuple.actor.sessionId);assert.equal(request.instanceId,expectedTuple.actor.instanceId);
  assert.equal(request.expectedRevision,expectedTuple.preparation.revision,
   'Held rate-limited declaration must use the pinned preparation revision.');
  const before=stationDeclarationActorTuple(held.before,'Held before'),current=stationDeclarationActorTuple(held.current,'Held current');
  assert.equal(stationDeclarationStable(before),stationDeclarationStable(expectedTuple.actor));
  assert.equal(stationDeclarationStable(current),stationDeclarationStable(expectedTuple.actor));
  usedKey=stationDeclarationStable({sessionId:request.sessionId,instanceId:request.instanceId,
   wave:expectedTuple.wave,expectedRevision:request.expectedRevision,windowRevision:expectedTuple.window.revision,
   previousAttackId:expectedTuple.attack?.attackId??null});
  assert.equal(used.has(usedKey),false,'This Station declaration already used its single retry.');
  assert.ok(now()+retryAfterMs<deadlineAt,'The complete rate-limit wait and a fresh UI action must fit the original deadline.');
 }catch(cause){return reject(cause);}
 used.add(usedKey);
 let waitStartedAt,waitCompletedAt,sourceReadCompletedAt;
 try{
  await assertActor(expectedContext.actor);
  assert.ok(now()<deadlineAt,'Original Station declaration deadline expired before the rate-limit wait.');
  waitStartedAt=now();notify({kind:'retry-wait',state:'started',at:new Date(waitStartedAt).toISOString(),retryAfterMs,deadlineAt});
  await wait(retryAfterMs,deadlineAt);
  waitCompletedAt=now();notify({kind:'retry-wait',state:'completed',at:new Date(waitCompletedAt).toISOString(),retryAfterMs,deadlineAt});
  assert.ok(now()>=waitStartedAt+retryAfterMs,'The complete source-reported rate-limit interval must elapse before retry.');
  assert.ok(now()<deadlineAt,'Original Station declaration deadline expired during the rate-limit wait.');
  await assertActor(expectedContext.actor);
  assert.ok(now()<deadlineAt,'Original Station declaration deadline expired before the fresh source read.');
  notify({kind:'retry-source-read',state:'started',at:new Date(now()).toISOString(),deadlineAt});
  const currentContext=await readCurrent(deadlineAt);
  sourceReadCompletedAt=now();notify({kind:'retry-source-read',state:'completed',at:new Date(sourceReadCompletedAt).toISOString(),deadlineAt});
  assert.ok(now()<deadlineAt,'Original Station declaration deadline expired during the fresh source read.');
  assertStationDeclarationRetryContext(expectedContext,currentContext);
  await assertActor(expectedContext.actor);
  assert.ok(now()<deadlineAt,'Original Station declaration deadline expired before returning retry authority.');
  return {expectedContext,deadlineAt,now,used,usedKey,retryAfterMs,deniedRequestId:held.requestData.requestId,
   expectedRevision:held.requestData.expectedRevision,sessionId:held.requestData.sessionId,
   instanceId:held.requestData.instanceId,waitStartedAt,waitCompletedAt,sourceReadCompletedAt,committed:false};
 }catch(cause){return reject(cause);}
}

/** Verify the single fresh UI declaration receipt after a permitted retry. */
export function assertRecoveredStationDeclaration(capture,recovery){
 assert.ok(recovery&&typeof recovery==='object'&&recovery.committed===false,'Unconsumed Station declaration retry authority is required.');
 assert.ok(recovery.now()<recovery.deadlineAt,'Original Station declaration deadline expired before retry receipt verification.');
 assert.equal(capture?.endpoint,'declareWolfAttack');assert.equal(capture.httpStatus,200);
 const data=capture.data;assert.ok(data&&typeof data==='object'&&!Array.isArray(data));
 assert.equal(Object.keys(data).sort().join('|'),'expectedRevision|instanceId|requestId|sessionId');
 assert.equal(data.sessionId,recovery.sessionId);assert.equal(data.instanceId,recovery.instanceId);
 assert.equal(data.expectedRevision,recovery.expectedRevision);assert.equal(typeof data.requestId,'string');
 assert.ok(data.requestId.length>0);assert.notEqual(data.requestId,recovery.deniedRequestId,
  'A bounded rate-limit recovery must use a fresh UI command ID.');
 const expectedActor=stationDeclarationSourceTuple(recovery.expectedContext,'Pinned').actor;
 const capturedActor=stationDeclarationLifecycleTuple(capture.before,'Retry capture');
 const expectedLifecycle=Object.fromEntries(stationDeclarationActorKeys.filter(key=>key!=='profileSessionId')
  .map(key=>[key,expectedActor[key]]));
 assert.equal(stationDeclarationStable(capturedActor),stationDeclarationStable(expectedLifecycle));
 const result=capture.result;assert.ok(result&&typeof result==='object'&&!Array.isArray(result));
 assert.equal(result.status,'committed');assert.equal(result.type,'wolf-attack-declaration');
 assert.equal(result.sessionId,recovery.sessionId);assert.equal(result.requestId,data.requestId);
 assert.equal(result.turn,recovery.expectedContext.session.currentTurn);assert.equal(result.currentStep,'targeting');
 assert.equal(result.airspaceLocked,true);assert.ok(Number.isSafeInteger(result.revision)&&result.revision>=1);
 assert.ok(typeof result.deadlineAt==='string'&&Number.isFinite(Date.parse(result.deadlineAt)));
 assert.ok(Number.isSafeInteger(result.parkedCraftCount)&&result.parkedCraftCount>=0);
 assert.ok(typeof result.announcementId==='string'&&result.announcementId.length>0);
 assert.ok(recovery.now()<recovery.deadlineAt,'Original Station declaration deadline expired after retry receipt verification.');
 recovery.committed=true;return true;
}
