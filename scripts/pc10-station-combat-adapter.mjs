import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';
// P-specific source adapter. Injected synthetic tests do not establish native authority.
export function assertSparseStationWing(actor,original){
 for(const key of ['uidHash','sessionId','fleetGroupId','cycle'])assert.equal(actor[key],original[key],`Original Station Wing ${key}`);
 for(const key of ['hasAuth','sameActor','currentCanonicalSeatOwned','currentMemberBerthPresent','currentMemberBerthMatches'])assert.equal(actor[key],true,`Station Wing requires ${key}`);
 assert.equal(actor.playerRole,'player');assert.equal(actor.assignedRoleId,'wing-commander');assert.equal(actor.activeConsoleRoleId,'wing-commander');assert.equal(actor.seatId,'wing-commander');assert.equal(actor.connection,'live');assert.equal(actor.freshness,'server');
}
export async function runSparseStationCombat({deadlineAt,readAttack,assertActors,choose,wait=delay}){
 assert.ok(Number.isFinite(deadlineAt));let original,stageKey,stageDeadline;
 while(Date.now()<deadlineAt){
  await assertActors();const current=await readAttack();assert.ok(current);assert.equal(current.threatSiteCode,'P');
  original??={attackId:current.attackId,turn:current.turn};assert.equal(current.attackId,original.attackId);assert.equal(current.turn,original.turn);assert.ok(Number.isSafeInteger(current.revision));
  if(current.status==='resolved'){assert.equal(current.currentStep,'resolved');assert.ok(['repeat','stopped'].includes(current.pStationRepeat?.status));return current;}
  assert.equal(current.status,'declared');assert.ok(['targeting','long-range','medium-range','short-range','boarding'].includes(current.currentStep));
  const key=JSON.stringify([current.attackId,current.revision,current.currentStep]);if(key!==stageKey){stageKey=key;stageDeadline=Math.min(Date.now()+60000,deadlineAt);}
  assert.ok(Date.now()<stageDeadline,'Original Station combat stage deadline expired.');
  await choose(current,{deadlineAt:stageDeadline});assert.ok(Date.now()<stageDeadline,'Original Station choice deadline expired.');await wait(Math.min(250,stageDeadline-Date.now()));
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
