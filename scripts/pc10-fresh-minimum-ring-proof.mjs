import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt, attachUiReceiptDiagnostics } from './pc10-browser-ui-receipt.mjs';
import { originalProofError, retainProofFailure } from './pc10-proof-failure-evidence.mjs';
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
export async function runFreshMinimumRingProof({allocationPath,directory}) {
 assert.ok(isAbsolute(allocationPath)&&isAbsolute(directory));
 const allocation=validateRingAllocation(JSON.parse(await readFile(allocationPath,'utf8')));
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
 const startAt=Date.now(),totalEnd=startAt+1200000,workEnd=totalEnd-60000;
 const actorUids=new Map(),pendingLaunches=[],preexistingUids=new Set();let stopped=false;
 const paceMaintenance=createRingMaintenancePacer();
 const roleIds={Owner:'shepherd-engineer',Recipient:'shepherd-scientist'};
 const evidence={schemaVersion:1,...minimumRingPlan(),sourceCommit,runnerSha256:allocation.runnerSha256,
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
    let browser=browsers[label.includes('Scientist')?1:0];
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
let gm1Instance;
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
 gm1Instance=live.instanceId;
 claims.push(`${label} ordinary admission/consent, normal local GM authorization and independent owned live instance`);return live;
}

const lossAcks=[],lossAckErrors=[],lossAckControls=[];evidence.lossAcks=lossAcks;evidence.lossAckErrors=lossAckErrors;
let lossAckFirstError=null,notifyLossAckFailure;const lossAckFailure=new Promise(resolve=>{notifyLossAckFailure=resolve;});
function latchLossAckError(error,endpoint){lossAckErrors.push({endpoint,error:originalProofError(error)});if(!lossAckFirstError){lossAckFirstError=error;stopped=true;notifyLossAckFailure(error);}}
async function candidateWait(run,deadlineAt,label){budget();const remaining=deadlineAt-Date.now();assert.ok(remaining>0,`Original candidate operation deadline expired: ${label}`);const operation=Promise.resolve().then(()=>{budget();return run();});const value=await bounded(Promise.race([operation,lossAckFailure.then(error=>{throw error;})]),remaining,`Original candidate operation deadline expired: ${label}`,()=>{stopped=true;});budget();assert.ok(Date.now()<deadlineAt,`Original candidate operation deadline expired: ${label}`);return value;}
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

async function fullMember(surface){return observeFullGameDemoPresentationMember(surface,{knownRoleIds:Object.values(roleIds)});}
function currentMember(value,label,roleId){
 assert.equal(value.uidHash,short(actorUids.get(label)));assert.equal(value.sessionId,sid);assert.equal(value.meSessionId,sid);
 assert.equal(value.hasAuth,true);assert.equal(value.sameActor,true);assert.equal(value.profileRoleId,null);assert.equal(value.profileSessionId,null);
 assert.equal(value.playerRole,'player');assert.equal(value.replacementRoleId,null);assert.equal(value.replacementStatus,null);assert.equal(value.escapeLocked,false);assert.equal(value.kicked,false);assert.deepEqual(value.invalidFields,[]);
 if(value.assignedRoleId===null)return false;assert.equal(value.assignedRoleId,roleId);
 return value.connection==='live'&&value.freshness==='server'&&value.currentOwnPlayerConfirmed&&value.memberScopeMatches&&value.sdkHasServerAuthority&&!value.sdkResumePending;
}
function stationReady(value,roleId){return value.activeConsoleRoleId===roleId&&value.seatId===roleId&&value.currentCanonicalSeatOwned;}
// Casting binds the primary station; the normal GM start transaction establishes operational berths.
function castingStationReady(value,roleId){return stationReady(value,roleId)&&value.cycle===0&&value.phase==='casting'&&value.setupConfirmed&&value.fullGameDemoExact&&value.fullGameDemo?.status==='preparing'&&value.fullGameDemo?.progression==='manual';}
async function currentMemberBerthReady(surface,value,label,roleId,deadlineAt){
 const remaining=()=>{const ms=deadlineAt-Date.now();assert.ok(ms>0,'Original member operation deadline expired.');return ms;};remaining();
 if(!stationReady(value,roleId))return false;
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
  const stamp=lease.get('claimedAt'),claimedAt=typeof stamp==='string'?stamp:stamp.toDate().toISOString();
  await sdk(gm,'setGmShipConsoleWriteGrant',{sessionId:sid,instanceId:gm1Instance,claimedAt,shipId,enabled:true});
 }
 async function supply(shipId,resourceId,minimum){
  await grant(shipId);let current=await recordRoot(),amount=current.shipResources[shipId][resourceId];
  const before=amount;
  while(amount<minimum){
   const count=Math.min(12,minimum-amount);
   const result=await sdk(gm,'applyShipCounterSteps',{sessionId:sid,instanceId:gm1Instance,shipId,
    counter:'resource',resourceId,steps:Array(count).fill(1),expectedRevision:current.vesselActionRevisions?.[shipId]??0,requestId:crypto.randomUUID()});
   current=await recordRoot();assert.equal(current.shipResources[shipId][resourceId],amount+count);
   amount+=count;assert.equal(result.amount,amount);
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
 async function maintain(shipId){
  await grant(shipId);const current=await recordRoot();let revision=current.maintenanceCycles?.[shipId]?.revision??0;
  for(const step of ['begin',...MAINTENANCE_ORDERS[shipId],'end']){
   const result=await sdk(gm,'runMaintenance',{sessionId:sid,instanceId:gm1Instance,shipId,action:step,
    expectedRevision:revision,requestId:crypto.randomUUID(),
    ...(step==='rations'?{foodLevel:3,waterLevel:3}:{}),...(step==='reactor'?{consoles:['jump-drive']}:{}),
    ...(step==='bays'?{refuels:{}}:{})});
   assert.equal(result.status,'committed');revision=result.cycle.revision;
   assert.deepEqual((await recordRoot()).maintenanceCycles[shipId],result.cycle);
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
  const current=await recordRoot();assert.equal(view.type,'candidate-workspace');assert.equal(view.sessionId,sid);
  assert.equal(view.groupId,groupId);assert.equal(view.cycle,current.currentTurn);
  const paths=view.paths.filter(path=>path.code==='N'&&path.coordinate===coordinate);assert.equal(paths.length,1);
  return{view,path:paths[0]};
 }
 async function candidate(surface,actionName,choice={}){
  const{view}=await workspace(surface);if(choice.shipId&&surface===gm)await grant(choice.shipId);
  const data={sessionId:sid,requestId:crypto.randomUUID(),expectedRevision:view.revision,expectedGroupId:groupId,
   code:'N',coordinate,action:actionName,...choice,...(surface===gm?{instanceId:gm1Instance}:{})};
  const result=await sdk(surface,'executeCandidateAction',data);
  assert.equal(result.type,'candidate-action-result');assert.equal(result.requestId,data.requestId);
  assert.equal(result.action,actionName);assert.equal(result.code,'N');assert.equal(result.status,'committed');
  assert.equal(result.revision,view.revision+1);return{data,result};
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
   await mark('fresh ordinary three-actor Ring setup');
   gm=await launchSurface('browser-A-normal-GM');owner=await launchSurface('browser-A-independent-Engineer');recipient=await launchSurface('browser-B-normal-Scientist');
   assert.equal(browsers.length,2);assert.equal(surfaces.length,3);
   await gm.page.goto(baseUrl);await gm.reducedMotion();
   const created=await observeUiReceipt({page:gm.page,waitForResponse:()=>gm.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/us-central1/createSession')&&r.request().method()==='POST'),choose:()=>gm.page.getByRole('button',{name:'Create a session',exact:true}).click()});
   assert.equal(created.status(),200);const body=await created.json();sid=body.result?.session?.id;joinCode=body.result?.session?.joinCode;assert.match(sid,/^[\w-]{1,128}$/);
   await register(gm,'GM1');await gm.consent();await gm.until('Fresh Cycle0',v=>v.sameActor&&v.sessionId===sid&&v.cycle===0&&v.freshness==='server');
   await authorizeAndClaim(gm,'GM1','PC10 minimum Ring GM');
   if(!await gm.page.getByRole('region',{name:'Setup',exact:true}).isVisible()){await gm.page.getByRole('button',{name:/^Open station catalog/}).click();await gm.page.getByRole('link',{name:'GM Console',exact:true}).click();}
   const setup=gm.page.getByRole('region',{name:'Setup',exact:true});await setup.getByRole('button',{name:'Setup',exact:true}).click();
   await setup.getByLabel('Recommended player count',{exact:true}).selectOption('13');await setup.getByLabel('Star chart',{exact:true}).selectOption('A');
   await action(gm,'confirmSetup',()=>setup.getByRole('button',{name:'Confirm setup // Confirm roster',exact:true}).click());
   await gm.until('Legal13 configured roles with unused seats open',v=>v.setupConfirmed&&v.activeRoleIds.length===13&&Object.values(roleIds).every(id=>v.activeRoleIds.includes(id)));
   const training=gm.page.locator('fieldset[aria-label="Full-game demo preparation"]');
   await action(gm,'prepareFullGameDemo',async()=>{await training.getByRole('button',{name:'Prepare full-game demo',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // PREPARE FULL-GAME DEMO',exact:true}).click();});
   for(const[surface,label]of[[owner,'Owner'],[recipient,'Recipient']]){
    await normalJoin(surface,label);const name=(await observeLifecycleActor(surface)).displayName;assert.ok(name);
    const casting=gm.page.getByRole('region',{name:'Facilitator casting',exact:true});await casting.getByLabel(`Role for ${name}`,{exact:true}).selectOption(roleIds[label]);
    await action(gm,'assignRole',()=>casting.getByRole('button',{name:`Assign role to ${name}`,exact:true}).click());
    await memberReady(surface,label,{station:false});await enterRole(surface,label);
   }
   assert.equal(actorUids.size,3);
   await action(gm,'startGame',async()=>{await training.getByRole('button',{name:'Start full-game demo // Advance to Cycle 1',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // START FULL-GAME DEMO // CYCLE 1',exact:true}).click();});
   await liveGm(gm,'GM1','active');
   for(const surface of surfaces)await completeOfferedCyclePresentation(surface,await snapshot(surface,'Actual Cycle1 presentation'),{clearBriefing:true});
   const science=await memberReady(recipient,'Recipient'),engineer=await memberReady(owner,'Owner');assert.equal(science.fleetGroupId,engineer.fleetGroupId);groupId=science.fleetGroupId;
   const current=await recordRoot();ships=current.activeVesselIds;assert.equal(ships.length,6);assert.ok(ships.includes('aegis'));
   coordinate=Object.entries(current.organiserSites).filter(([,site])=>site.code==='N'&&site.candidate===true).map(([location])=>location)[0];assert.match(coordinate,/^\d{4}$/);
   assert.equal(current.shuttleControl.endeavour.holderUid,actorUids.get('Recipient'));assert.equal(current.shuttleControl['black-sheep'].holderUid,actorUids.get('Owner'));
   await supply('shepherd','ore',40);await supply('aegis','materials',10);
   for(const ship of ships){const rule=MAINTENANCE_RULES[ship];await supply(ship,'food',rule.food[3]*4);await supply(ship,'water',rule.water[3]*4);await supply(ship,'fuel',30);}
   claims.push('Fresh normal manual13-role setup with only GM/Scientist/Engineering holder; required new state only, no old discovery/checkpoint requalification');
  },
  async researchCycle(cycle){
   await mark(`actual ordinary Scientist research and official GM maintenance Cycle${cycle}`);
   assert.equal((await recordRoot()).currentTurn,cycle);
   for(const[index,trackId]of TRACKS.entries()){
    const view=await sdk(recipient,'readEndeavourResearchWorkspace',{sessionId:sid});
    const current=await recordRoot(),data={sessionId:sid,requestId:crypto.randomUUID(),expectedCycle:cycle,
     expectedControlRevision:current.shuttleControl.endeavour.revision,expectedResearchRevision:view.researchRevision,
     trackId,funding:index<3?'standard':'shepherd-ore'};
    const result=await sdk(recipient,'advanceEndeavourResearchTrack',data);
    assert.equal(result.status,'committed');assert.equal(result.progress[trackId],cycle);assert.equal(result.oreCost,index<3?0:5);
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
    assert.equal(result.status,'jumped');const after=await recordRoot();assert.equal(before.shipResources[shipId].fuel-after.shipResources[shipId].fuel,result.fuelCost);
   }
   const navigation=await op(()=>db.doc(`sessions/${sid}/serverState/navigation`).get());
   assert.ok(ships.every(ship=>navigation.get('shipGalacticCoordinates')[ship]===coordinate));
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
   const after=await recordRoot();assert.equal(after.candidateCraftReservations['black-sheep'].code,'N');assert.ok(!after.shuttleDockings.some(dock=>dock.shuttleId==='black-sheep'));
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
   const ended=await recordRoot();assert.equal(ended.debriefSnapshot.source,'candidate');assert.equal(ended.debriefSnapshot.result,'success');assert.equal(ended.debriefSnapshot.candidate.code,'N');
   const snapshotHash=hash(stable(ended.debriefSnapshot));
   const late=await sdk(gm,'executeCandidateAction',crossing.data);assert.deepEqual(late,{...crossing.serverReply,status:'replayed'});assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   const freeze=await sdk(gm,'beginSessionDebrief',{sessionId:sid,instanceId:gm1Instance,requestId:crypto.randomUUID()});assert.equal(freeze.phase,'debrief');assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   await gm.page.getByRole('dialog',{name:'Endgame evaluation',exact:true}).waitFor();await gm.page.screenshot({path:`${directory}/Ring-GM-ending.png`});
   await action(gm,'closeSession',()=>gm.page.getByRole('button',{name:'Close session',exact:true}).click());await gm.until('Actual closed Ring history',v=>v.phase==='closed');
   assert.equal(hash(stable((await recordRoot()).debriefSnapshot)),snapshotHash);
   await recipient.page.reload();const restored=await recipient.until('Entitled ordinary Scientist closed history after original reload',v=>v.sameActor&&v.phase==='closed'&&v.sessionId===sid);
   assert.equal(restored.uidHash,short(actorUids.get('Recipient')));await recipient.page.getByRole('dialog',{name:'Endgame evaluation',exact:true}).waitFor();await recipient.page.screenshot({path:`${directory}/Ring-Scientist-closed-history.png`});
   evidence.endingProof=true;evidence.candidate619OriginalPaidPassageRecovery=true;
   claims.push('Actual GM far-side sabotage blocks pursuit, source Ring success/debrief, exact late crossing receipt, idempotent freeze, immutable close and entitled same-UID closed-history reload');
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
  await writeFile(`${directory}/prelaunch.json`,JSON.stringify({allocation,sourceCommit,plan:minimumRingPlan(),nativeLaunched:false},null,2)+'\n');
  await Promise.race([lossAckFailure.then(error=>{throw error;}),bounded(runRingWorkflow(operations),workEnd-Date.now(),'Ring execution work cap exhausted.',()=>{stopped=true;})]);
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
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);assert.equal(args.length,4,'Use --allocation ABSOLUTE_JSON --evidence NEW_ABSOLUTE_DIRECTORY.');
 assert.equal(args[0],'--allocation');assert.equal(args[2],'--evidence');
 await runFreshMinimumRingProof({allocationPath:args[1],directory:args[3]});
}
