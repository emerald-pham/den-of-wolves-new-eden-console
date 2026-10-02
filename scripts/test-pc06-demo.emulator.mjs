import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {localGmAccessConfiguration,grantLocalGmAccess} from './local-gm-access.mjs';
const env=Object.fromEntries((await readFile('.env.emulators.local','utf8')).trim().split('\n').map(line=>line.split('=')));
const project=process.env.VITE_FIREBASE_PROJECT_ID;
const config=localGmAccessConfiguration('serve',{...env,VITE_LOCAL_GM_ACCESS:'1',VITE_FIREBASE_PROJECT_ID:project});
if(!config)throw Error('Explicit demo project and configured local emulator ports required.');
const ports={auth:config.authPort,firestore:config.firestorePort,functions:Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT)};
assert.ok(Number.isInteger(ports.functions)&&ports.functions>0&&ports.functions<=65535);
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {recommendedRoleIds}=require('../functions/lib/roleConfiguration.js');
async function actor(){const r=await fetch(`http://127.0.0.1:${ports.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${project}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});assert.equal(r.status,200);return r.json();}
async function call(actor,name,data){const r=await fetch(`http://127.0.0.1:${ports.functions}/${project}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${actor.idToken}`},body:JSON.stringify({data})});const body=await r.json();return{status:r.status,...body};}
function ok(reply,step){assert.equal(reply.status,200,`${step}: ${reply.error?.message}`);return reply.result;}
const gm=await actor(),player=await actor(),foreign=await actor();
const created=ok(await call(gm,'createSession',{requestId:randomUUID(),joinCodeVersion:2,name:'PC06 local composed Demo'}),'create');const sessionId=created.session.id;
await grantLocalGmAccess(config,{method:'POST',host:'127.0.0.1:5175',origin:'http://127.0.0.1:5175',remoteAddress:'127.0.0.1',token:gm.idToken});
const instanceId='pc06-local-demo';ok(await call(gm,'claimGmInstance',{sessionId,instanceId,name:'Local Demo facilitator',deviceLabel:'Local transport proof'}),'GM claim');
const confirmed=ok(await call(gm,'confirmSetup',{sessionId,instanceId,requestId:randomUUID(),expectedSetupRevision:created.session.setupRevision??0,playerCount:18,chartId:'A',lockChart:true,expansion:'base',turnLimit:6,dioneEnabled:true,capybaraEnabled:false,universalArbourEnabled:false,wolfCultEnabled:false,activeRoleIds:recommendedRoleIds(18)}),'confirm setup');
const joined=ok(await call(player,'joinSession',{joinCode:created.session.joinCode,displayName:'Local Demo participant'}),'join');
ok(await call(gm,'assignRole',{sessionId,instanceId,requestId:randomUUID(),targetUid:player.localId,roleId:'admiral'}),'cast');
const resumed=ok(await call(player,'resumeSession',{sessionId}),'resume');
ok(await call(player,'claimSeat',{sessionId,seatId:'admiral',requestId:randomUUID(),expectedSetupRevision:resumed.session.setupRevision}),'seat');
ok(await call(player,'refreshPresence',{sessionId,activeConsoleRoleId:'admiral'}),'enter participant console');
ok(await call(gm,'disconnectFromSession',{sessionId,instanceId,connectionGeneration:created.player.connectionGeneration}),'GM leave for single-player demo');
const started=ok(await call(player,'startSinglePlayerDemo',{sessionId}),'start Demo');assert.equal(started.currentTurn,1);assert.equal(started.singlePlayerDemo.status,'active');
async function snapshot(){const base=`http://127.0.0.1:${ports.firestore}/v1/projects/${project}/databases/(default)/documents/sessions/${sessionId}`;const a=await fetch(base,{headers:{Authorization:'Bearer owner'}});const b=await fetch(`${base}/serverState/navigation`,{headers:{Authorization:'Bearer owner'}});const c=await fetch(`${base}/events?pageSize=300`,{headers:{Authorization:'Bearer owner'}});return{session:await a.json(),navigation:await b.json(),events:await c.json()};}
const activeRecovery=ok(await call(player,'resumeSession',{sessionId}),'active Demo resume');assert.deepEqual(activeRecovery.session.singlePlayerDemo,{status:'active',finalCycle:1});
const activeJoin=ok(await call(player,'joinSession',{joinCode:created.session.joinCode,displayName:'Local Demo participant'}),'active Demo join');assert.deepEqual(activeJoin.session.singlePlayerDemo,{status:'active',finalCycle:1});
const before=await snapshot();const request={sessionId,shipId:'aegis',destination:'1413',requestId:randomUUID()};
for(const [candidate,payload] of [[player,request],[player,request],[player,{...request,requestId:randomUUID(),expectedRevision:999}],[foreign,{...request,requestId:randomUUID()}]]){const denied=await call(candidate,'jumpShip',payload);if(candidate===foreign){assert.equal(denied.error.status,'PERMISSION_DENIED');}else{assert.equal(denied.error.status,'FAILED_PRECONDITION',denied.error.message);assert.equal(denied.error.message,'Jumps are unavailable in Demo mode.');}}
assert.deepEqual(await snapshot(),before,'Demo jump requests write nothing to fuel/location/pursuit/events/cycle state.');
ok(await call(gm,'joinSession',{joinCode:created.session.joinCode,displayName:'Local Demo facilitator'}),'GM return');ok(await call(gm,'claimGmInstance',{sessionId,instanceId,name:'Local Demo facilitator',deviceLabel:'Local transport proof'}),'GM reclaim');
const finishRequest={sessionId,instanceId,requestId:randomUUID(),expectedTurn:1,overridePhaseTimer:true,skipTurnStartAnnouncement:true};const finished=ok(await call(gm,'advanceTurn',finishRequest),'finish Demo');assert.equal(finished.mode,'demo');assert.equal(finished.status,'complete');assert.equal(finished.currentTurn,1);
assert.deepEqual(ok(await call(gm,'advanceTurn',finishRequest),'exact Demo replay'),finished);
const recovered=ok(await call(player,'resumeSession',{sessionId}),'participant recover');assert.equal(recovered.session.currentTurn,1);assert.equal(recovered.session.singlePlayerDemo.status,'complete');
const final=ok(await call(gm,'advanceTurn',{...finishRequest,requestId:randomUUID()}),'fresh post-complete retry');assert.equal(final.currentTurn,1);
if(process.env.LOCAL_DEMO_EVIDENCE_PATH)await writeFile(process.env.LOCAL_DEMO_EVIDENCE_PATH,JSON.stringify({kind:'local-emulator-normal-callable-transport',completedAt:new Date().toISOString(),checks:{normalCreateJoinChartLockCastingSeat:true,soleParticipantDemoCycle1:true,normalStaleReplayForeignJumpDeniedBeforeAnyWrite:true,normalGMReturnFinishDemo:true,exactAndFreshFinishStayCycle1:true,participantResumeCompleteCycle1:true},productionGameplay:false,identitiesRetained:false},null,2)+'\n');console.log('Local Demo normal transport composition and zero-write boundary passed.');
