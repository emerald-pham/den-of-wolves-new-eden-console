import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt, attachUiReceiptDiagnostics } from './pc10-browser-ui-receipt.mjs';
import { originalProofError, retainProofFailure } from './pc10-proof-failure-evidence.mjs';
import { observeFullGameCallableDiagnostics } from './pc10-full-game-demo-ui-proof.mjs';
import { observeFullGameDemoPresentationMember, proofRuntimeFromViteSource, validateProofRuntime } from './pc10-full-game-demo-proof-helpers.mjs';
import { observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt, openLifecycleSettings, closeLifecycleSettings } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { completeOfferedCyclePresentation } from './pc10-turn-cycle-demo-ui-proof.mjs';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { capturePc10Gate2SourceBinding } from './pc10-gate2-functional-proof.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''), projectId='demo-pc10-owner-integrated-2';
const baseUrl='http://127.0.0.1:5174';
const ports={auth:9109,functions:5011,firestore:8090};
const directory='/tmp/dow-pc10-evidence/two-actor-highwall-mining-2';
const hash=value=>createHash('sha256').update(value).digest('hex'), short=value=>hash(value).slice(0,16);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sourceCommit,process.env.PC10_OWNER_SOURCE_COMMIT);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'');
const require=createRequire(`${root}/package.json`), {chromium}=require('playwright');

const browsers=[],surfaces=[],errors=[],calls=[],requests=[],remoteRequests=[],states=[],receipts=[],claims=[];
let gm,miner,sid,joinCode,stage='not-started',consumed=null,primaryFailure=null,startAt,workEnd,totalEnd;
const actorUids=new Map(),pendingLaunches=[];let stopped=false;
const roleIds={Miner:'icebreaker-miner'};
const evidence={schemaVersion:1,sourceCommit,configuredRoles:16,actualHumans:0,physicalDeviceProof:false,
 actualBrowserProcesses:2,actualBrowserContexts:2,maxMountedSurfaces:2,ordinaryPrimaryAccounts:true,
 manualAuthStorageWrites:false,authCredentialInjection:false,demoCrewPreparation:false,adminGameplayWrites:0,
 wholeGameProof:false,endingProof:false,capacityProof:false,visualUsabilityAccepted:false,
 renderedReleaseGatesPending:true,demoProfileAdapterUsed:false,clockAcceleration:false,
 cohortReason:'Two independent original Auth actors: real GM owns legitimate protected setup/manual progression and is the wrong-role negative; ordinary Icebreaker Miner owns parked unfuelled Highwall and its two standard choices. This does not prove peer/foreign custody, fuelled third operation, full game, capacity or human devices.',
 gmGameplayPreparationUsed:false,settledCargoScreenshotInspectionPending:false,
 independentFinalRenderedTypographyReviewPending:true,
 priorClosedCargoRecoveryReplayed:false,earnedSettledCargoFamilyReplayed:false,earnedWrongHolderNativeDenialReplayed:false,serviceCrossCycleResetProved:false,
 unchangedAdmissionManualSetupAndObserversReused:true,originalPendingCargoAcrossColdReloadProved:false,
 executionTargetMs:120000,executionCapMs:300000,originalPageTimeoutMs:35000,originalOperationTimeoutMs:60000,
 states,receipts,claims,requests,calls,remoteRequests,errors};
async function bounded(operation,timeout,name,onTimeout=()=>{}) {let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(new Error(name));},timeout);})]);}finally{clearTimeout(timer);}}
function budget() { if(lossAckFirstError)throw lossAckFirstError;assert.equal(stopped,false,'Work has stopped; do not begin a subsequent action.');assert.ok(Date.now()+60000<=workEnd,'Not enough cap budget to begin another full original60s operation and normal cleanup.'); }
async function mark(name) { budget();stage=name; await writeFile(`${directory}/progress.json`,JSON.stringify({sourceCommit,stage,elapsedMs:Date.now()-startAt,claims},null,2)+'\n');console.log(JSON.stringify({stage,elapsedMs:Date.now()-startAt})); }
async function snapshot(surface,label) { const value=await observeLifecycleActor(surface,sid);states.push({label,origin:new URL(surface.page.url()).origin,state:value});consumed={stage,label,state:value};await writeFile(`${directory}/consumed-state.json`,JSON.stringify(consumed,null,2)+'\n');return value; }
async function register(surface,label) { const uid=await surface.page.evaluate(async()=>{const {auth}=await import('/src/lib/firebase.ts');if(!auth().currentUser)throw new Error('Normal admission has no Auth user.');return auth().currentUser.uid;});assert.ok(![...actorUids.values()].includes(uid),'Require independent normally admitted Auth identities.');actorUids.set(label,uid);evidence.actualAuthenticatedActors=actorUids.size;await writeFile(`${directory}/owned-identities.json`,JSON.stringify({sid,joinCode,actors:Object.fromEntries(actorUids)},null,2)+'\n',{mode:0o600}); }
async function action(surface,endpoint,choose,options={}) { budget();const value=await captureLifecycleUiAction(surface,endpoint,()=>{budget();return choose();},options);receipts.push(publicLifecycleReceipt(value));return value; }
// Existing ordinary UI surface factory, copied verbatim; original35s/60s budgets retained.
  async function surface(label) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    browsers.push(browser);
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
    async function callable(name, data) {
      return page.evaluate(async ({ name, data, sdkUrl }) => {
        const { functions } = await import('/src/lib/firebase.ts');
        const { httpsCallable } = await import(sdkUrl);
        try { return { status: 'committed', result: (await httpsCallable(functions(), name)(data)).data }; }
        catch (error) { return { status: 'denied', code: error.code, message: error.message }; }
      }, { name, data, sdkUrl });
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
    surfaces.push(result); return result;
  }

async function launchSurface(label) {
 budget();const pending=surface(label).then(async value=>{if(stopped){await value.context.browser().close();throw new Error('Owned launch settled after stop; closed it.');}return value;});pendingLaunches.push(pending);const value=await pending;
 await value.context.route('**/us-central1/*',route=>stopped?route.abort():route.fallback());budget();return value;
}

process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8090';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9109';
const adminRequire=createRequire(`${root}/functions/package.json`);const{initializeApp,getApps}=adminRequire('firebase-admin/app');const{getFirestore}=adminRequire('firebase-admin/firestore');const{getAuth}=adminRequire('firebase-admin/auth');assert.equal(getApps().length,0);initializeApp({projectId});const db=getFirestore();const {fleetGroupRecord}=adminRequire(`${root}/functions/lib/fleetGroups.js`);
await mkdir(directory,{mode:0o700});
const runtime=validateProofRuntime(proofRuntimeFromViteSource(await(await fetch(`${baseUrl}/src/lib/firebaseConfig.ts`)).text()),{baseUrl,projectId,ports});evidence.runtime=runtime;
assert.equal((await db.collection('sessions').get()).size,0);
const preflight=JSON.parse(await readFile('/tmp/dow-pc10-evidence/OWNER_HIGHWALL_MINING_2_LAUNCH_PREFLIGHT_20261008.json','utf8'));assert.equal(preflight.source.sourceCommit,sourceCommit);assert.deepEqual(preflight.scope,{sessions:0,connectedPlayers:0,connectedGmInstances:0});
evidence.preflightSource=preflight.source;evidence.preflightRecordedAt=preflight.recordedAt;
const freezeBytes=await readFile('/tmp/dow-pc10-evidence/OWNER_HIGHWALL_MINING_2_SOURCE_FREEZE_20261008.json');
const freeze=JSON.parse(freezeBytes);assert.equal(freeze.sourceCommit,sourceCommit);
const sourceTree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(freeze.sourceTree,sourceTree);
assert.equal(freeze.macAllocation.status,'EXPLICIT_PARENT_ALLOCATION_GRANTED');
assert.equal(freeze.compiledSourceBuild.sourceCommit,sourceCommit);
assert.equal(freeze.compiledSourceBuild.sourceTree,sourceTree);
assert.equal(freeze.compiledSourceBuild.exitCode,0);
assert.equal(freeze.compiledSourceBuild.compiledTreeSha256,preflight.source.compiledTreeSha256);
const launchBinding=await capturePc10Gate2SourceBinding(root,new URL(import.meta.url).pathname);
assert.equal(launchBinding.sourceCommit,sourceCommit);assert.equal(launchBinding.trackedClean,true);
assert.equal(launchBinding.trackedTreeSha256,preflight.source.trackedTreeSha256);
assert.equal(launchBinding.compiledTreeSha256,preflight.source.compiledTreeSha256);
assert.equal(launchBinding.javascriptTreeSha256,preflight.source.javascriptTreeSha256);
evidence.exactLaunchBinding={sourceTree,trackedTreeSha256:launchBinding.trackedTreeSha256,
 compiledTreeSha256:launchBinding.compiledTreeSha256,javascriptTreeSha256:launchBinding.javascriptTreeSha256,
 compiledSourceBuild:freeze.compiledSourceBuild,macAllocation:freeze.macAllocation};
assert.equal(freeze.runner.sha256,hash(await readFile(new URL(import.meta.url))));
assert.equal(freeze.preflight.sha256,hash(await readFile('/tmp/dow-pc10-evidence/OWNER_HIGHWALL_MINING_2_LAUNCH_PREFLIGHT_20261008.json')));
assert.equal(freeze.status,'FROZEN_BEFORE_EXECUTION');assert.equal(freeze.review.currentStatus,'PASS_BOUNDED_SOURCE_ONLY');
assert.equal(freeze.prelaunchWriterMustSucceed,true);assert.equal(freeze.recordWrittenAfterLaunch,false);
evidence.sourceFreeze={path:'/tmp/dow-pc10-evidence/OWNER_HIGHWALL_MINING_2_SOURCE_FREEZE_20261008.json',sha256:hash(freezeBytes),recordedAt:freeze.recordedAt};



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
        const expected=(endpoint==='requestScout'||endpoint==='transferShuttleCargoCommand'||endpoint==='rechargeHostConsoleFromShuttle'||endpoint==='runHighwallMining')?{...record.serverReply,status:'replayed'}:record.serverReply;
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

const {parseHighwallMiningState}=adminRequire(`${root}/functions/lib/highwallMining.js`);

// Match the existing scoped world witness: all durable gameplay fields, all
// command/audit/control ledgers, and only this action's member events. Ordinary
// presence/navigation events and connection timestamps are outside the effect.
const substantiveFields=[
 'phase','currentTurn','turnLimit','turnState','turnPhase','fullGameDemo',
 'shipResources','shuttleCargo','shuttleControl','shuttleDockings','shuttleVisitLog',
 'shuttleFuelled','consoleCharges','shipDamage','shipUnrest','shipSurvivors','shipUpgrades',
 'maintenanceCycles','serviceShuttleRecharges','fleetGroups','activeVesselIds','activeRoleIds','highwallMining',
];
async function ownedWorld(deadlineAt=Date.now()+15000,diagnosticOnly=false){
 if(diagnosticOnly){
  // Read-only first-failure evidence uses the already owned session/actors,
  // never the stopped action budget or a new gameplay/recovery operation.
  assert.equal(stopped,true);assert.equal(typeof sid,'string');assert.ok(sid&&!sid.includes('/'));
  const gmUid=actorUids.get('GM1'),minerUid=actorUids.get('Miner');
  assert.equal(typeof gmUid,'string');assert.equal(typeof minerUid,'string');assert.ok(gmUid&&minerUid&&gmUid!==minerUid&&!minerUid.includes('/'));
  const read=async run=>{const left=deadlineAt-Date.now();assert.ok(left>0,'Original stopped Highwall diagnostic deadline expired.');
   const value=await bounded(Promise.resolve().then(()=>{assert.ok(Date.now()<deadlineAt,'Original stopped Highwall diagnostic deadline expired.');return run();}),left,'Original stopped Highwall diagnostic deadline expired.');
   assert.ok(Date.now()<deadlineAt,'Original stopped Highwall diagnostic deadline expired.');return value;};
  const session=await read(()=>db.doc(`sessions/${sid}`).get());assert.equal(session.exists,true);assert.equal(session.get('ownerUid'),gmUid,'Refuse a foreign session diagnostic.');
  const player=await read(()=>db.doc(`sessions/${sid}/players/${minerUid}`).get());assert.equal(player.exists,true);assert.equal(player.get('uid'),minerUid);assert.equal(player.get('sessionId'),sid);
  const groupId=player.get('fleetGroupId');assert.equal(typeof groupId,'string');assert.match(groupId,/^fleet-[1-9][0-9]*$/);
  const groupDoc=await read(()=>db.doc(`sessions/${sid}/fleetGroups/${groupId}`).get());const group=fleetGroupRecord(groupDoc.data());
  assert.equal(groupDoc.exists,true);assert.ok(group&&group.id===groupId&&group.memberUids.includes(minerUid),'Refuse unowned group diagnostic.');
  const discovery=await read(()=>db.doc(`sessions/${sid}/playerDiscoveries/${minerUid}`).get());
  return{diagnosticOnly:true,adminGameplayWrites:0,session:{phase:session.get('phase'),cycle:session.get('currentTurn')},
   actor:{uidHash:short(minerUid),groupId,assignedRoleId:player.get('assignedRoleId')??null,activeConsoleRoleId:player.get('activeConsoleRoleId')??null,connectionGeneration:player.get('connectionGeneration')??null},
   currentGroup:{id:groupId,ownMemberIncluded:true,memberShipId:group.memberShipIds?.[minerUid]??null,vesselIds:group.vesselIds},
   discovery:{exists:discovery.exists,groupId:discovery.get('groupId')??null,shipId:discovery.get('shipId')??null,fleetGroupVesselIds:discovery.get('fleetGroupVesselIds')??null,revision:discovery.get('revision')??null},
   stoppedWorkRemainsStopped:true,privateKnowledgePayloadsIncluded:false};
 }
 const names=['commandReceipts','actionAudits','procedureAudits','shuttleControlRequests','shuttleControlAudit','shuttleDepartures','shuttleTransitChains'];
 const [session,sets,events]=await candidateWait(()=>Promise.all([
  db.doc(`sessions/${sid}`).get(),Promise.all(names.map(name=>db.collection(`sessions/${sid}/${name}`).get())),
  db.collection(`sessions/${sid}/events`).where('type','==','highwall-mining').get(),
 ]),deadlineAt,'exact owned Highwall gameplay and receipt/event/audit witness');
 assert.equal(session.exists,true);const raw=session.data(),miningState=parseHighwallMiningState(raw.highwallMining);assert.ok(miningState,'Use the actual Source mining-state parser.');
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 assert.ok(raw.shuttleCargo===undefined||record(raw.shuttleCargo));const cargo=raw.shuttleCargo?.highwall;
 assert.ok(cargo===undefined||record(cargo)&&Object.keys(cargo).every(key=>['ore','materials'].includes(key)));
 const highwallCargo={ore:cargo?.ore??0,materials:cargo?.materials??0};
 for(const value of Object.values(highwallCargo))assert.ok(Number.isSafeInteger(value)&&value>=0);
 assert.ok(record(raw.shuttleFuelled));assert.ok(raw.shuttleFuelled.highwall===undefined||typeof raw.shuttleFuelled.highwall==='boolean');
 const substantive=Object.fromEntries(substantiveFields.filter(key=>Object.hasOwn(raw,key)).map(key=>[key,raw[key]]));
 const digest=set=>({count:set.size,sha256:hash(stable(set.docs.map(doc=>({id:doc.id,data:doc.data()})).sort((a,b)=>a.id.localeCompare(b.id))))});
 const collectionHashes=Object.fromEntries(sets.map((set,i)=>[names[i],digest(set)]));collectionHashes.miningEvents=digest(events);
 return{sessionFieldsSha256:hash(stable(substantive)),substantive,collectionHashes,miningState,highwallCargo,
  fuelled:raw.shuttleFuelled.highwall===true,control:raw.shuttleControl?.highwall,
  dockings:raw.shuttleDockings?.filter(row=>row.shuttleId==='highwall'),selectedFields:substantiveFields,
  comparedEvents:'Only highwall-mining events; ordinary presence/navigation events remain outside the effect witness.',
  normalResumeTimestampFieldsNotCompared:['session.updatedAt','player connection/lease/generation metadata'],adminGameplayWrites:0};
}
const dataCopy=value=>JSON.parse(JSON.stringify(value));
function miningPanel(surface){return surface.page.getByRole('region',{name:'Highwall mining operations',exact:true});}
function remainingOperation(deadlineAt){const left=deadlineAt-Date.now();assert.ok(left>0,'Original Highwall operation deadline expired.');return left;}
async function offeredButton(button,deadlineAt,label){
 await candidateWait(()=>button.waitFor({state:'visible',timeout:Math.min(35000,remainingOperation(deadlineAt))}),deadlineAt,label);
 while(!(await candidateWait(()=>button.isEnabled(),deadlineAt,label)))await candidateWait(()=>delay(100),deadlineAt,label);
}
async function currentHighwall(surface,label,expectedWorld,deadlineAt=Date.now()+60000){
 const member=await memberReady(surface,label,{deadlineAt});let value;
 while(Date.now()<deadlineAt){
  value=await candidateWait(()=>surface.page.evaluate(storeUrl=>import(storeUrl).then(({useSessionStore})=>{
   const s=useSessionStore.getState();return{sessionId:s.session?.id,uid:s.me?.uid,roleId:s.me?.activeConsoleRoleId,
    groupId:s.me?.fleetGroupId,discovery:s.session?.playerDiscovery,control:s.session?.shuttleControl?.highwall,
    dockings:s.session?.shuttleDockings?.filter(row=>row.shuttleId==='highwall'),fuelled:s.session?.shuttleFuelled?.highwall===true,
    miningState:s.session?.highwallMining,highwallCargo:s.session?.shuttleCargo?.highwall??{ore:0,materials:0},
    cycle:s.session?.currentTurn,phase:s.session?.turnState?.phase,progression:s.session?.turnPhase?.progression};
  }),surface.storeModuleUrl()),deadlineAt,'actual current Miner Highwall projection');
  consumed={stage,label,currentHighwall:{member,value}};
  assert.equal(value.sessionId,sid);assert.equal(value.uid,actorUids.get(label));assert.equal(value.roleId,roleIds[label]);assert.equal(value.groupId,member.fleetGroupId);
  const parsed=parseHighwallMiningState(value.miningState);assert.ok(parsed);
  if(value.discovery!==undefined){assert.equal(value.discovery.groupId,member.fleetGroupId);assert.equal(value.discovery.shipId,'icebreaker');assert.ok(value.discovery.fleetGroupVesselIds?.includes('icebreaker'));}
  if(stable(parsed)===stable(expectedWorld.miningState)&&stable(value.highwallCargo)===stable(expectedWorld.highwallCargo)&&
   value.cycle===1&&value.phase==='coordination'&&value.progression==='manual'&&stable(value.control)===stable(expectedWorld.control)&&
   value.discovery?.groupId===member.fleetGroupId&&value.discovery?.shipId==='icebreaker'&&value.discovery?.fleetGroupVesselIds?.includes('icebreaker'))break;
  await candidateWait(()=>delay(100),deadlineAt,'original Highwall projection publication');
 }
 assert.ok(Date.now()<deadlineAt,'Original Highwall discovery deadline expired.');assert.deepEqual(value.control,{shuttleId:'highwall',ownerRoleId:'icebreaker-miner',ownerUid:actorUids.get('Miner'),holderUid:actorUids.get('Miner'),revision:0});
 assert.equal(value.dockings.length,1);assert.equal(value.dockings[0].shipId,'icebreaker');assert.equal(value.fuelled,false);
 assert.equal(value.discovery?.groupId,member.fleetGroupId);assert.equal(value.discovery?.shipId,'icebreaker');assert.ok(value.discovery?.fleetGroupVesselIds?.includes('icebreaker'));
 const after=await memberReady(surface,label,{deadlineAt});for(const key of ['uidHash','sessionId','meSessionId','assignedRoleId','activeConsoleRoleId','seatId','fleetGroupId'])assert.equal(after[key],member[key]);
 return{member:after,value};
}
async function miningWitness(data,reply,before,deadlineAt=Date.now()+60000){
 assert.deepEqual(Object.keys(data).sort(),['sessionId','requestId','resource','expectedRevision','expectedControlRevision','expectedCycle'].sort());
 assert.equal(data.sessionId,sid);assert.equal(typeof data.requestId,'string');assert.match(data.requestId,/^[\w-]{1,128}$/);
 assert.ok(['materials','ore'].includes(data.resource));assert.equal(data.expectedRevision,before.miningState.revision);assert.equal(data.expectedControlRevision,before.control.revision);assert.equal(data.expectedCycle,1);assert.equal(before.fuelled,false);
 assert.deepEqual(Object.keys(reply).sort(),['status','sessionId','requestId','cycle','operation','cargo','actorUid','actorRoleId','vesselId','hostShipId','turn','phase','revision','idempotencyKey','auditId'].sort());
 assert.equal(reply.status,'committed');assert.equal(reply.sessionId,sid);assert.equal(reply.requestId,data.requestId);assert.equal(reply.cycle,1);assert.equal(reply.turn,1);assert.equal(reply.phase,'active');
 assert.equal(reply.actorUid,actorUids.get('Miner'));assert.equal(reply.actorRoleId,roleIds.Miner);assert.equal(reply.vesselId,'highwall');assert.equal(reply.hostShipId,'icebreaker');assert.equal(reply.idempotencyKey,data.requestId);assert.equal(reply.auditId,`highwall-mining-${data.requestId}`);assert.equal(reply.revision,before.miningState.revision+1);
 const op=reply.operation;assert.deepEqual(Object.keys(op).sort(),['requestId','resource','rolls','amount'].sort());assert.equal(op.requestId,data.requestId);assert.equal(op.resource,data.resource);
 assert.equal(op.rolls.length,data.resource==='materials'?1:3);assert.ok(op.rolls.every(value=>Number.isSafeInteger(value)&&value>=1&&value<=6));assert.equal(op.amount,op.rolls.reduce((sum,value)=>sum+value,0));
 assert.deepEqual(reply.cargo,{...before.highwallCargo,[data.resource]:before.highwallCargo[data.resource]+op.amount});
 const [receipt,event,audit]=await candidateWait(()=>Promise.all([
  db.doc(`sessions/${sid}/commandReceipts/${data.requestId}`).get(),db.doc(`sessions/${sid}/events/highwall-mining-${data.requestId}`).get(),db.doc(`sessions/${sid}/actionAudits/${data.requestId}`).get(),
 ]),deadlineAt,'original Highwall committed command receipt/member event/metadata audit');
 assert.equal(receipt.exists,true);assert.deepEqual(receipt.get('result'),reply);assert.deepEqual(receipt.get('serverRolls'),op.rolls);
 assert.deepEqual(receipt.get('fingerprint'),{kind:'highwall-mining',sessionId:sid,actorUid:actorUids.get('Miner'),requestId:data.requestId,resource:data.resource,expectedRevision:data.expectedRevision,expectedControlRevision:data.expectedControlRevision,hostShipId:'icebreaker',cycle:1});
 assert.equal(event.exists,true);for(const [field,value]of Object.entries({type:'highwall-mining',sessionId:sid,actorUid:actorUids.get('Miner'),actorRoleId:roleIds.Miner,requestId:data.requestId,turn:1,phase:'active',revision:reply.revision,visibility:'member',shuttleId:'highwall',resource:data.resource,amount:op.amount,operation:(before.miningState.cycle===1?before.miningState.operations.length:0)+1}))assert.equal(event.get(field),value);assert.deepEqual(event.get('rolls'),op.rolls);
 assert.equal(audit.exists,true);for(const [field,value]of Object.entries({actorUid:actorUids.get('Miner'),actorRoleId:roleIds.Miner,sessionId:sid,action:'highwall-mining',requestId:data.requestId,phase:'active',revision:reply.revision,outcome:'committed',resolutionSource:'server-random',redactionPolicy:'action-audit-metadata-only-v1'}))assert.equal(audit.get(field),value);
 const after=await ownedWorld(deadlineAt),expectedState={cycle:1,revision:reply.revision,operations:[...(before.miningState.cycle===1?before.miningState.operations:[]),op]};
 assert.deepEqual(after.miningState,expectedState);assert.deepEqual(after.highwallCargo,reply.cargo);assert.equal(after.fuelled,false);assert.deepEqual(after.control,before.control);assert.deepEqual(after.dockings,before.dockings);
 assert.deepEqual(after.substantive,{...before.substantive,highwallMining:expectedState,shuttleCargo:{...(before.substantive.shuttleCargo??{}),highwall:reply.cargo}},'Only authoritative mining state and this craft cargo may change.');
 for(const name of Object.keys(before.collectionHashes)){if(['commandReceipts','actionAudits','miningEvents'].includes(name))assert.equal(after.collectionHashes[name].count,before.collectionHashes[name].count+1);else assert.deepEqual(after.collectionHashes[name],before.collectionHashes[name]);}
 return{receiptSha256:hash(stable(receipt.data())),eventSha256:hash(stable(event.data())),auditSha256:hash(stable(audit.data())),rolls:op.rolls,amount:op.amount,committedWorld:after};
}
async function effectsUnchanged(before,deadlineAt,label){const after=await ownedWorld(deadlineAt);assert.deepEqual(after,before,label);return after;}
async function freshRequestId(surface){return surface.page.evaluate(()=>crypto.randomUUID());}
async function exactReplay(surface,data,original,deadlineAt){
 await memberReady(surface,'Miner',{deadlineAt});const before=await ownedWorld(deadlineAt),replay=await candidateWait(()=>surface.callable('runHighwallMining',data),deadlineAt,'captured original normal SDK mining replay');assert.equal(replay.status,'committed');assert.deepEqual(replay.result,{...original,status:'replayed'});await effectsUnchanged(before,deadlineAt,'Original mining replay cannot redraw or add a cargo/event/audit effect.');return replay;
}
async function captureQuota(surface,deadlineAt,label){
 const panel=miningPanel(surface);await candidateWait(()=>panel.waitFor({state:'visible',timeout:Math.min(35000,remainingOperation(deadlineAt))}),deadlineAt,'actual original Miner used-quota region');
 assert.match(await panel.innerText(),/Operations remaining \/\/ 0 of 2/);
 for(const name of ['Roll 1d6 materials','Roll 3d6 strytium ore'])assert.equal(await panel.getByRole('button',{name,exact:true}).isEnabled(),false);
 assert.match(await panel.innerText(),/Fuel Highwall during the Team Phase to unlock its third operation/);
 const bounds=await panel.boundingBox();assert.ok(bounds&&bounds.width>0&&bounds.height>0);
 await candidateWait(()=>surface.paintTwoFrames(),deadlineAt,'ordinary used-quota paint');
 await candidateWait(()=>surface.page.screenshot({path:`${directory}/${label}.png`,timeout:Math.min(35000,remainingOperation(deadlineAt))}),deadlineAt,'ordinary original Miner capture');
 return{label,panelText:await panel.innerText(),bounds,actualTwoPaintFrames:true,sourceCommit,screenshotInspectionPending:true,finalBuildTypographyApproval:false};
}

startAt=Date.now();totalEnd=startAt+300000;workEnd=totalEnd-60000;evidence.startedAt=new Date(startAt).toISOString();
try{await Promise.race([lossAckFailure.then(error=>{throw error;}),bounded((async()=>{
 await mark('launch exactly GM and printed Highwall Miner');gm=await launchSurface('browser-A-normal-GM');miner=await launchSurface('browser-B-normal-Miner');
 await mark('normal GM create and consent');await gm.page.goto(baseUrl);await gm.reducedMotion();const created=await observeUiReceipt({page:gm.page,consumed:{stage},waitForResponse:()=>gm.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/us-central1/createSession')&&r.request().method()==='POST',{timeout:35000}),choose:()=>gm.page.getByRole('button',{name:'Create a session',exact:true}).click()});assert.equal(created.status(),200);const createdBody=await created.json();sid=createdBody.result?.session?.id;joinCode=createdBody.result?.session?.joinCode;assert.match(sid,/^[\w-]{1,128}$/);await register(gm,'GM1');await gm.consent();const initial=await gm.until('Fresh ordinary Cycle0',v=>v.hasAuth&&v.sameActor&&v.sessionId===sid&&v.cycle===0&&v.freshness==='server');joinCode=initial.joinCode;evidence.sessionHash=hash(sid);claims.push('Actual GM normal create/Auth/consent');
 await mark('normal named live GM authorization');await authorizeAndClaim(gm,'GM1','PC10 Highwall mining GM');
 if(!await gm.page.getByRole('region',{name:'Setup',exact:true}).isVisible()){await gm.page.getByRole('button',{name:/^Open station catalog/}).click();await gm.page.getByRole('link',{name:'GM Console',exact:true}).click();}
 const setup=gm.page.getByRole('region',{name:'Setup',exact:true});await setup.getByRole('button',{name:'Setup',exact:true}).click();await setup.getByLabel('Recommended player count',{exact:true}).selectOption('16');await setup.getByLabel('Star chart',{exact:true}).selectOption('A');await action(gm,'confirmSetup',()=>setup.getByRole('button',{name:'Confirm setup // Confirm roster',exact:true}).click());await gm.until('Legal16 roster confirmed',v=>v.setupConfirmed&&v.activeRoleIds.length===16&&v.activeRoleIds.includes('icebreaker-miner')&&v.activeVesselIds.includes('icebreaker'));claims.push('Normal legal16 configured roster; other seats open; no prepared crew');
 // Legal16 uses separate Engineers; Union craft/starting-host controls are not configured.
 await mark('protected unlimited manual preparation before ordinary join');const training=gm.page.locator('fieldset[aria-label="Full-game demo preparation"]');const prepared=await action(gm,'prepareFullGameDemo',async()=>{await training.getByRole('button',{name:'Prepare full-game demo',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // PREPARE FULL-GAME DEMO',exact:true}).click();});assert.equal(prepared.result.status,'committed');assert.deepEqual(prepared.result.fullGameDemo,{status:'preparing',progression:'manual'});await gm.until('Real manual prepared Cycle0',v=>v.cycle===0&&v.gmInstanceOwned&&v.fullGameDemo?.status==='preparing'&&v.fullGameDemo?.progression==='manual');claims.push('Protected manual full-game preparation before ordinary identities join');
 for(const[surface,label]of[[miner,'Miner']]){await mark(`${label} normal join and primary assignment`);await normalJoin(surface,label);const name=(await observeLifecycleActor(surface)).displayName;assert.ok(name);const casting=gm.page.getByRole('region',{name:'Facilitator casting',exact:true});await casting.getByLabel(`Role for ${name}`,{exact:true}).selectOption(roleIds[label]);await action(gm,'assignRole',()=>casting.getByRole('button',{name:`Assign role to ${name}`,exact:true}).click());await memberReady(surface,label,{station:false});await enterRole(surface,label);claims.push(`${label} normal primary assigned role/chooser/seat/SDK authority during Cycle0 casting; no operational berth claim`);}
 await mark('real GM manual Cycle0 to1 and Coordination');const started=await action(gm,'startGame',async()=>{await training.getByRole('button',{name:'Start full-game demo // Advance to Cycle 1',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // START FULL-GAME DEMO // CYCLE 1',exact:true}).click();});assert.equal(started.data.fullGameDemo,true);await liveGm(gm,'GM1','active');
 for(const surface of[gm,miner]){const presented=await completeOfferedCyclePresentation(surface,await snapshot(surface,'Actual Cycle1 presentation'),{clearBriefing:true});assert.equal(presented.sawBriefing,false);assert.equal(presented.actualPaintReady,true);}
 const coordinationDeadline=Date.now()+60000;const offeredCoordination=gm.page.getByRole('button',{name:'Open Coordination manually',exact:true});await candidateWait(()=>action(gm,'advanceFullGameDemoPhase',()=>offeredCoordination.click({timeout:Math.min(35000,coordinationDeadline-Date.now())})),coordinationDeadline,'normal offered GM Coordination control');await candidateWait(()=>gm.until('Real manual Coordination Cycle1',v=>v.cycle===1&&v.phase==='active'&&v.airspace==='lifted'&&v.turnStatePhase==='coordination'&&v.phaseProgression==='manual',coordinationDeadline-Date.now()),coordinationDeadline,'original GM Coordination publication');const phase=await candidateWait(()=>liveGm(gm,'GM1','active',{deadlineAt:coordinationDeadline}),coordinationDeadline,'original GM Coordination receipt/current authority');assert.equal(phase.cycle,1);assert.equal(phase.phaseProgression,'manual');assert.equal(phase.airspace,'lifted');assert.equal(phase.turnStatePhase,'coordination');for(const surface of[miner])await candidateWait(()=>surface.until('Original ordinary Coordination Cycle1',v=>v.cycle===1&&v.phase==='active'&&v.airspace==='lifted'&&v.turnStatePhase==='coordination'&&v.phaseProgression==='manual',coordinationDeadline-Date.now()),coordinationDeadline,'original ordinary Coordination publication');
 const beforeMining=await ownedWorld();await currentHighwall(miner,'Miner',beforeMining);assert.equal(beforeMining.fuelled,false);assert.equal(beforeMining.miningState.operations.length,0);assert.equal(beforeMining.miningState.revision,0);
 await memberNavigate(miner,'Miner',()=>miner.page.getByRole('link',{name:'Open Highwall shuttle console',exact:true}).click(),miningPanel(miner));
 claims.push('Actual GM manual0→1/Coordination; original unfuelled parked Highwall Miner, current Source berth/group/seat/SDK authority and zero operations.');

 await mark('actual first materials choice and committed mining acknowledgement loss');
 const firstDeadline=Date.now()+60000,firstBefore=await ownedWorld(firstDeadline);
 await currentHighwall(miner,'Miner',firstBefore,firstDeadline);
 const interrupted=await installLossAck(miner,'runHighwallMining',(data,reply)=>miningWitness(data,reply,firstBefore,firstDeadline),firstDeadline);lossAckControls.push(interrupted);
 const materials=miningPanel(miner).getByRole('button',{name:'Roll 1d6 materials',exact:true});await offeredButton(materials,firstDeadline,'actual first unfuelled materials choice');
 await candidateWait(()=>materials.click({timeout:Math.min(35000,remainingOperation(firstDeadline))}),firstDeadline,'normal Miner materials handler');
 const lost=await candidateWait(()=>interrupted.settled(remainingOperation(firstDeadline)),firstDeadline,'actual committed mining acknowledgement interruption');
 assert.equal(lost.data.resource,'materials');assert.equal(lost.confirmedBeforeAbort,true);
 await currentHighwall(miner,'Miner',lost.committedWitness.committedWorld,firstDeadline);
 const retry=miningPanel(miner).getByRole('button',{name:'Retry exact Highwall request',exact:true});await offeredButton(retry,firstDeadline,'actual offered original Highwall exact retry');
 assert.match(await miningPanel(miner).innerText(),/Outcome uncertain \/\/ Retry the exact request/);
 interrupted.recover();await candidateWait(()=>retry.click({timeout:Math.min(35000,remainingOperation(firstDeadline))}),firstDeadline,'actual original-request Highwall retry handler');
 const retryReply=await candidateWait(()=>interrupted.recovered(remainingOperation(firstDeadline)),firstDeadline,'actual replayed original Highwall receipt');
 await effectsUnchanged(lost.committedWitness.committedWorld,firstDeadline,'Exact UI retry must preserve every committed gameplay/receipt/event/audit effect.');
 await candidateWait(()=>interrupted.dispose(remainingOperation(firstDeadline)),firstDeadline,'finite owned Highwall acknowledgement observer teardown');
 evidence.firstMining={actualUiRequest:dataCopy(lost.data),actualServerReply:dataCopy(lost.serverReply),actualUiRetryReply:dataCopy(retryReply.result),witness:lost.committedWitness};
 claims.push('Actual original Miner 1d6 materials committed one bound server roll/cargo/state/receipt/member-event/metadata-audit effect before acknowledgement loss; the offered exact UI retry retained its original payload/result with replayed status and unchanged effects. No native RNG call-count instrumentation is claimed.');

 await mark('fresh stale mining revision and independent normal GM wrong-role denial');
 const negativeDeadline=Date.now()+60000,negativeBefore=await ownedWorld(negativeDeadline);
 await currentHighwall(miner,'Miner',negativeBefore,negativeDeadline);
 const staleRequest={...evidence.firstMining.actualUiRequest,requestId:await freshRequestId(miner)};
 const stale=await candidateWait(()=>miner.callable('runHighwallMining',staleRequest),negativeDeadline,'actual currently entitled stale mining request');
 assert.equal(stale.status,'committed');assert.deepEqual(stale.result,{status:'stale',sessionId:sid,requestId:staleRequest.requestId,resource:'materials',expectedRevision:0,currentRevision:1,expectedControlRevision:0,currentControlRevision:0,expectedCycle:1,currentCycle:1,hostShipId:'icebreaker'});
 await effectsUnchanged(negativeBefore,negativeDeadline,'The actual stale envelope is data-only; it must add no mining effect/receipt/event/audit.');
 await liveGm(gm,'GM1','active',{deadlineAt:negativeDeadline});
 const wrongRoleRequest={...staleRequest,requestId:await freshRequestId(gm),expectedRevision:1};
 const wrongRole=await candidateWait(()=>gm.callable('runHighwallMining',wrongRoleRequest),negativeDeadline,'actual independent normally authorized GM wrong-role mining request');
 assert.equal(wrongRole.status,'denied');assert.equal(wrongRole.code,'functions/permission-denied');assert.match(wrongRole.message,/Highwall holder/i);
 await effectsUnchanged(negativeBefore,negativeDeadline,'Wrong GM role cannot add a mining effect/receipt/event/audit.');
 evidence.staleMining={request:staleRequest,result:stale,semanticStatus:'authoritative-stale-data-only-envelope',effectsUnchanged:true};
 evidence.wrongRoleMining={request:wrongRoleRequest,result:wrongRole,originalIndependentGm:true,effectsUnchanged:true};
 claims.push('Fresh entitled stale revision returned the exact authoritative data-only envelope; independent live normally authorized GM was denied as wrong role. Both left selected gameplay/mining receipts/events/audits unchanged. This is not a peer/foreign-player custody/privacy claim.');

 await mark('actual current Miner second ore choice and standard unfuelled quota');
 const secondDeadline=Date.now()+60000,secondBefore=await ownedWorld(secondDeadline);
 await currentHighwall(miner,'Miner',secondBefore,secondDeadline);
 const ore=miningPanel(miner).getByRole('button',{name:'Roll 3d6 strytium ore',exact:true});await offeredButton(ore,secondDeadline,'actual remaining standard ore choice');
 const second=await candidateWait(()=>action(miner,'runHighwallMining',()=>ore.click({timeout:Math.min(35000,remainingOperation(secondDeadline))}),{deadlineAt:secondDeadline}),secondDeadline,'normal current Miner ore handler');
 assert.equal(second.data.resource,'ore');assert.equal(second.data.expectedRevision,1);assert.notEqual(second.data.requestId,evidence.firstMining.actualUiRequest.requestId);
 const secondWitness=await miningWitness(second.data,second.result,secondBefore,secondDeadline);await currentHighwall(miner,'Miner',secondWitness.committedWorld,secondDeadline);
 const quota=await captureQuota(miner,secondDeadline,'Miner-two-unfuelled-operations-used');
 evidence.secondMining={actualUiRequest:second.data,actualServerReply:second.result,witness:secondWitness};evidence.renderedCaptures=[quota];
 claims.push('Actual selected 3d6 ore handler committed the sum of three server dice into only Highwall ore, preserving materials/all host resources/fuel/other craft; second operation/revision and exactly one additional bound receipt/member-event/metadata audit. Current projected results and visible zero-of-two quota/disabled controls agree.');

 await mark('same original Miner cold reload and captured original SDK replay');
 const reloadDeadline=Date.now()+60000,beforeReload=await ownedWorld(reloadDeadline);
 await restoredMember(miner,'Miner',reloadDeadline);await currentHighwall(miner,'Miner',beforeReload,reloadDeadline);
 await effectsUnchanged(beforeReload,reloadDeadline,'Normal original Miner cold reload preserves substantive mining/cargo/once state.');
 evidence.firstMining.actualSdkReplayAfterColdReload=await exactReplay(miner,evidence.firstMining.actualUiRequest,evidence.firstMining.actualServerReply,reloadDeadline);
 evidence.renderedCaptures.push(await captureQuota(miner,reloadDeadline,'Miner-two-unfuelled-operations-used-after-reload'));
 claims.push('Same original Miner cold reload retained UID/primary role/seat/group/current holder/Source member-SDK authority and persisted mining/cargo/zero-of-two quota. Captured original SDK replay returned the original receipt without another result/effect. Pending UI mining intent across a cold document is not claimed.');

 await mark('fresh current-revision third mining request reaches actual unfuelled quota guard');
 const quotaDeadline=Date.now()+60000,quotaBefore=await ownedWorld(quotaDeadline);
 await currentHighwall(miner,'Miner',quotaBefore,quotaDeadline);
 const thirdRequest={...evidence.firstMining.actualUiRequest,requestId:await freshRequestId(miner),expectedRevision:quotaBefore.miningState.revision};
 const third=await candidateWait(()=>miner.callable('runHighwallMining',thirdRequest),quotaDeadline,'actual new currently entitled unfuelled third-operation request');
 assert.equal(third.status,'denied');assert.equal(third.code,'functions/failed-precondition');assert.match(third.message,/completed two operations; fuel it to conduct a third/i);
 await effectsUnchanged(quotaBefore,quotaDeadline,'Fresh current quota refusal cannot draw a new result or add effects/receipts/events/audits.');
 evidence.thirdMining={request:thirdRequest,result:third,reachedCurrentRevisionQuotaGuard:true,effectsUnchanged:true};
 const finalWorld=await ownedWorld(quotaDeadline);assert.equal(finalWorld.miningState.operations.length,2);assert.equal(finalWorld.miningState.revision,2);assert.equal(finalWorld.fuelled,false);assert.equal(finalWorld.collectionHashes.miningEvents.count,2);
 assert.equal(actorUids.size,2);assert.equal(browsers.length,2);assert.equal(surfaces.length,2);assert.equal(errors.length,0);assert.equal(remoteRequests.length,0);assert.equal(lossAckErrors.length,0);assert.equal(evidence.navigationTeardownErrors?.length??0,0);
 evidence.finalWorld=finalWorld;claims.push('A fresh same-Miner/current-revision third operation reached the real unfuelled quota denial with no new mining gameplay/receipt/event/audit effect. Fuelled operation3, new-cycle reset and other roles/mechanics remain outside this slice.');
 evidence.status='BOUNDED_TWO_ACTOR_HIGHWALL_MINING_PASS';evidence.completedAt=new Date().toISOString();
 })(),240000,'Stop Highwall work for five-minute total cap and original one-minute cleanup reserve.',()=>{stopped=true;})]);
}catch(error){stopped=true;primaryFailure=error;evidence.status='BOUNDED_TWO_ACTOR_HIGHWALL_MINING_STOPPED_FIRST_FAILURE';evidence.failedStage=stage;evidence.originalError=originalProofError(error);evidence.consumedState=consumed;const diagnosticEnd=Math.min(Date.now()+10000,totalEnd-45000);evidence.failureDiagnosticErrors=[];
 for(const surface of surfaces){try{await bounded(snapshot(surface,`${surface.label}-first-failure`),Math.max(1,diagnosticEnd-Date.now()),'Original first-failure snapshot deadline');await surface.page.screenshot({path:`${directory}/${surface.label}-first-failure.png`,timeout:Math.max(1,Math.min(5000,diagnosticEnd-Date.now()))});}catch(failure){evidence.failureDiagnosticErrors.push(originalProofError(failure));}}
 try{evidence.firstFailureWorld=await bounded(ownedWorld(diagnosticEnd,true),Math.max(1,diagnosticEnd-Date.now()),'First-failure exact owned Highwall mining witness deadline');}catch(failure){evidence.failureDiagnosticErrors.push(originalProofError(failure));}await retainProofFailure(directory,'highwall-mining',error,{stage,consumed,claims});console.log(JSON.stringify({stoppedAt:stage,message:error.message.slice(0,500),claimsEarned:claims.length}));
} finally {
 stopped=true;
 const cleanup={browsersClosed:0,sessionAbsent:false,joinCodeAbsent:false,deletedOwnPointers:0,deletedOwnAuth:0,otherDataChanged:false,errors:[]};
 const cleanupEnd=totalEnd-1500;
 async function cleanupStep(label,operation) {
  if(Date.now()>=cleanupEnd){cleanup.errors.push({label,code:'execution-cap-cleanup-deadline'});return null;}
  try{return await bounded(Promise.resolve().then(operation),cleanupEnd-Date.now(),`Owned cleanup deadline: ${label}`);}
  catch(error){cleanup.errors.push({label,error:originalProofError(error)});return null;}
 }
 for(const control of lossAckControls)await cleanupStep('settle exact owned interrupted-reply handler',()=>control.dispose(Math.max(1,cleanupEnd-Date.now())));
 await cleanupStep('settle all owned launches',()=>Promise.allSettled(pendingLaunches));
 for(const browser of browsers)await cleanupStep('close owned browser',async()=>{await browser.close();assert.equal(browser.isConnected(),false);cleanup.browsersClosed++;});
 if(sid) {
  await cleanupStep('remove verified exact owned join-code pointer',async()=>{
   if(!joinCode){const originalSession=await db.doc(`sessions/${sid}`).get();joinCode=originalSession.get('joinCode');}
   assert.equal(typeof joinCode,'string');const ref=db.doc(`joinCodes/${joinCode}`);
   await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.exists){assert.equal(doc.get('sessionId'),sid,'Refuse foreign join-code deletion.');tx.delete(ref);}});
   cleanup.joinCodeAbsent=!(await ref.get()).exists;assert.equal(cleanup.joinCodeAbsent,true);
  });
  await cleanupStep('remove exact owned session subtree',async()=>{const session=await db.doc(`sessions/${sid}`).get();if(session.exists)await db.recursiveDelete(session.ref);cleanup.sessionAbsent=!(await db.doc(`sessions/${sid}`).get()).exists;assert.equal(cleanup.sessionAbsent,true);});
  await cleanupStep('remove verified owned membership pointers',async()=>{
   const pointers=await db.collection('activeMemberships').where('sessionId','==',sid).get();const known=new Set(actorUids.values());assert.ok(pointers.docs.every(doc=>known.has(doc.id))&&pointers.size<=2,'Refuse unknown actor cleanup.');
   await db.runTransaction(async tx=>{const current=await Promise.all(pointers.docs.map(doc=>tx.get(doc.ref)));assert.ok(current.every(doc=>doc.exists&&doc.get('sessionId')===sid));for(const doc of current)tx.delete(doc.ref);});cleanup.deletedOwnPointers=pointers.size;cleanup.remainingOwnPointers=(await db.collection('activeMemberships').where('sessionId','==',sid).get()).size;assert.equal(cleanup.remainingOwnPointers,0);
  });
 }
 for(const uid of actorUids.values())await cleanupStep('remove verified fresh owned Auth identity',async()=>{const user=await getAuth().getUser(uid);assert.ok(Date.parse(user.metadata.creationTime)>=startAt&&Date.parse(user.metadata.creationTime)<=Date.now(),'Refuse Auth identity not born in this fresh run.');await getAuth().deleteUser(uid);cleanup.deletedOwnAuth++;});
 await cleanupStep('read final empty session/player/GM scope',async()=>{const scope=await Promise.all([db.collection('sessions').get(),db.collectionGroup('players').where('connected','==',true).get(),db.collectionGroup('gmInstances').where('connected','==',true).get()]);cleanup.scope={sessions:scope[0].size,connectedPlayers:scope[1].size,connectedGmInstances:scope[2].size};assert.deepEqual(cleanup.scope,{sessions:0,connectedPlayers:0,connectedGmInstances:0});});
 await cleanupStep('terminate own Admin client',()=>db.terminate());
 await cleanupStep('verify source unchanged',()=>{assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:1000}).trim(),sourceCommit);assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8',timeout:1000}).trim(),'');evidence.sourceUnchanged=true;});
 if(lossAckFirstError&&!primaryFailure){primaryFailure=lossAckFirstError;evidence.originalError=originalProofError(lossAckFirstError);cleanup.errors.push({label:'late interrupted-reply handler failure',error:originalProofError(lossAckFirstError)});}
 evidence.cleanup=cleanup;evidence.actualBrowserProcesses=browsers.length;evidence.actualBrowserContexts=surfaces.length;evidence.maxMountedSurfaces=surfaces.length;evidence.actualAuthenticatedActors=actorUids.size;evidence.actorUidHashes=Object.fromEntries([...actorUids].map(([label,uid])=>[label,short(uid)]));evidence.elapsedIncludingCleanupMs=Date.now()-startAt;evidence.executionCapMet=Date.now()<=totalEnd;evidence.catalogClosureCredit=0;evidence.checkpointOrReleaseCredit=0;
 if(cleanup.errors.length||!evidence.executionCapMet){evidence.gameplayDisposition=evidence.status;evidence.status='BOUNDED_TWO_ACTOR_HIGHWALL_MINING_CLEANUP_INCOMPLETE';}
 await writeFile(`${directory}/OWNER_RESULT.json`,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({directory,status:evidence.status,claimsEarned:claims.length,actualAuth:actorUids.size,actualBrowsers:browsers.length,elapsedMs:evidence.elapsedIncludingCleanupMs,cleanup}));process.exitCode=primaryFailure||cleanup.errors.length||!evidence.executionCapMet?1:0;
}
