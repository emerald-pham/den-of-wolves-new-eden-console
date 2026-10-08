import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';
// P-specific source adapter. Injected synthetic tests do not establish native authority.
export function assertSparseStationWing(actor,original){
 for(const key of ['uidHash','sessionId','fleetGroupId','cycle'])assert.equal(actor[key],original[key],`Original Station Wing ${key}`);
 for(const key of ['hasAuth','sameActor','currentCanonicalSeatOwned','currentMemberBerthPresent','currentMemberBerthMatches'])assert.equal(actor[key],true,`Station Wing requires ${key}`);
 assert.equal(actor.playerRole,'player');assert.equal(actor.assignedRoleId,'wing-commander');assert.equal(actor.activeConsoleRoleId,'wing-commander');assert.equal(actor.seatId,'wing-commander');assert.equal(actor.connection,'live');assert.equal(actor.freshness,'server');
}
export async function runSparseStationCombat({deadlineAt,readAttack,assertActors,choose,wait=delay,onState=async()=>{},onDiagnosticError=async()=>{},recoverChoice=async()=>false}){
 assert.ok(Number.isFinite(deadlineAt));let original,stageKey,stageDeadline,recoveryDeadline;
 while(Date.now()<deadlineAt){
  await assertActors();const current=await readAttack();assert.ok(current);assert.equal(current.threatSiteCode,'P');
  original??={attackId:current.attackId,turn:current.turn};assert.equal(current.attackId,original.attackId);assert.equal(current.turn,original.turn);assert.ok(Number.isSafeInteger(current.revision));try{await onState(current);}catch(error){try{await onDiagnosticError(error,current);}catch{/* Diagnostic reporting cannot replace the gameplay failure. */}}
  if(current.status==='resolved'){assert.equal(current.currentStep,'resolved');assert.ok(['repeat','stopped'].includes(current.pStationRepeat?.status));return current;}
  assert.equal(current.status,'declared');assert.ok(['targeting','long-range','medium-range','short-range','boarding'].includes(current.currentStep));
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

// Selection seams for the finite Station proof. These initially preserve the
// runner's all-planned-ships behavior so the regressions can expose the loss.
export function stationSurvivingRepairTargets(plannedShipIds,root) {
 return [...plannedShipIds];
}
export function stationReactorCapacity(viewShips) {
 const capacity=viewShips.reduce((sum,ship)=>sum+ship.reactorCapacity,0);
 return {capacity,requiredCapacity:18,meetsThreshold:capacity>=18,eligibleShipIds:viewShips.map(ship=>ship.shipId)};
}
