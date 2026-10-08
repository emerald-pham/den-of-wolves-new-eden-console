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
import { pc11ProofTiming } from './qualification/pc11-normal-start-adapter.mjs';
import { capturePc10Gate2SourceBinding } from './pc10-gate2-functional-proof.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''), projectId='demo-pc10-owner-integrated-2';
const baseUrl='http://127.0.0.1:5174';
const ports={auth:9109,functions:5011,firestore:8090};
const directory='/tmp/dow-pc10-evidence/three-actor-scout-private-audience-3';
const hash=value=>createHash('sha256').update(value).digest('hex'), short=value=>hash(value).slice(0,16);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sourceCommit,process.env.PC10_OWNER_SOURCE_COMMIT);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'');
const require=createRequire(`${root}/package.json`), {chromium}=require('playwright');

const browsers=[],surfaces=[],errors=[],calls=[],requests=[],remoteRequests=[],states=[],receipts=[],claims=[];
const scoutResponseBodies=[],pendingScoutResponses=[];
let gm,scientist,peer,sid,joinCode,stage='not-started',consumed=null,primaryFailure=null,startAt,workEnd,totalEnd;
const actorUids=new Map(),pendingLaunches=[];let stopped=false;
const roleIds={Scientist:'shepherd-scientist',Peer:'icebreaker-miner'};
const evidence={schemaVersion:1,sourceCommit,configuredRoles:16,actualHumans:0,physicalDeviceProof:false,
 actualBrowserProcesses:0,actualBrowserContexts:0,maxMountedSurfaces:0,ordinaryPrimaryAccounts:true,
 manualAuthStorageWrites:false,authCredentialInjection:false,demoCrewPreparation:false,adminGameplayWrites:0,
 wholeGameProof:false,endingProof:false,capacityProof:false,visualUsabilityAccepted:false,
 renderedReleaseGatesPending:true,demoProfileAdapterUsed:false,clockAcceleration:false,
 cohortReason:'Three original normal Auth identities: live GM for protected fresh setup/manual start, Shepherd Scientist for one actual Endeavour request, and same-group Icebreaker Miner peer for entitled candidate names versus requester-only report/index/note. Foreign-group, revoked-member, outcome and human-device claims are outside this slice.',
 unchangedAdmissionManualSetupAndObserversReused:true,acceptedDiscoveryPrefixReplayedOnlyForNewPopulatedAudience:true,
 originalPageTimeoutMs:35000,originalOperationTimeoutMs:60000,executionTargetMs:180000,
 states,receipts,claims,requests,calls,remoteRequests,errors,scoutResponseBodies};
async function bounded(operation,timeout,name,onTimeout=()=>{}) {let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(new Error(name));},timeout);})]);}finally{clearTimeout(timer);}}
function budget() { assert.equal(stopped,false,'Work has stopped; do not begin a subsequent action.');assert.ok(Date.now()+60000<=workEnd,'Not enough cap budget to begin another full original60s operation and normal cleanup.'); }
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
      if (!['listMyScoutReports','readPrivateScoutResult','readMyScoutDiscoveryNote'].includes(endpoint) ||
          response.request().method() !== 'POST') return;
      const index=scoutResponseBodies.length;
      const bodyRecord={surface:label,endpoint,httpStatus:response.status(),at:new Date().toISOString(),bodyStatus:'pending'};
      scoutResponseBodies.push(bodyRecord);
      const pending=(async()=>{
        try {
          const request=response.request().postDataJSON()?.data;
          bodyRecord.requestData=Object.fromEntries(['sessionId','requestId','noteId']
            .filter(key=>Object.hasOwn(request??{},key)).map(key=>[key,request[key]]));
          if(Object.hasOwn(request??{},'instanceId'))bodyRecord.borrowedInstanceHash=hash(request.instanceId);
          bodyRecord.rawResponse=await response.json();
          bodyRecord.bodyStatus='received';
        } catch(error) {bodyRecord.bodyStatus='failed';bodyRecord.originalError=originalProofError(error);}
        await writeFile(`${directory}/scout-response-${index+1}.json`,JSON.stringify(bodyRecord,null,2)+'\n',{flag:'wx',mode:0o600});
      })();
      // Attach a rejection handler immediately; cleanup still checks the
      // original rejected promise and reports any diagnostic writer failure.
      void pending.catch(()=>{});
      pendingScoutResponses.push(pending);
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
const runtime=validateProofRuntime(proofRuntimeFromViteSource(await bounded(fetch(`${baseUrl}/src/lib/firebaseConfig.ts`).then(value=>value.text()),15000,'Original Vite runtime read deadline')),{baseUrl,projectId,ports});evidence.runtime=runtime;
assert.equal((await bounded(db.collection('sessions').get(),15000,'Original empty-scope read deadline')).size,0);
const preflight=JSON.parse(await readFile('/tmp/dow-pc10-evidence/OWNER_SCOUT_PRIVATE_AUDIENCE_3_LAUNCH_PREFLIGHT_20261008.json','utf8'));assert.equal(preflight.source.sourceCommit,sourceCommit);assert.deepEqual(preflight.scope,{sessions:0,connectedPlayers:0,connectedGmInstances:0});
evidence.preflightSource=preflight.source;evidence.preflightRecordedAt=preflight.recordedAt;
const freezeBytes=await readFile('/tmp/dow-pc10-evidence/OWNER_SCOUT_PRIVATE_AUDIENCE_3_SOURCE_FREEZE_20261008.json');
const freeze=JSON.parse(freezeBytes);assert.equal(freeze.sourceCommit,sourceCommit);
const sourceTree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(freeze.sourceTree,sourceTree);
assert.equal(freeze.macAllocation.status,'EXPLICIT_PARENT_ALLOCATION_GRANTED');
assert.equal(freeze.compiledSourceBuild.reusedForSourceCommit??freeze.compiledSourceBuild.sourceCommit,sourceCommit);
if(freeze.compiledSourceBuild.sourceCommit!==sourceCommit)assert.equal(freeze.compiledSourceBuild.functionsAndRulesSourceUnchanged,true);
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
assert.equal(freeze.preflight.sha256,hash(await readFile('/tmp/dow-pc10-evidence/OWNER_SCOUT_PRIVATE_AUDIENCE_3_LAUNCH_PREFLIGHT_20261008.json')));
assert.equal(freeze.status,'FROZEN_BEFORE_EXECUTION');assert.equal(freeze.review.currentStatus,'PASS_BOUNDED_SOURCE_ONLY');
assert.equal(freeze.prelaunchWriterMustSucceed,true);assert.equal(freeze.recordWrittenAfterLaunch,false);
evidence.sourceFreeze={path:'/tmp/dow-pc10-evidence/OWNER_SCOUT_PRIVATE_AUDIENCE_3_SOURCE_FREEZE_20261008.json',sha256:hash(freezeBytes),recordedAt:freeze.recordedAt};



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

async function candidateWait(run,deadlineAt,label){
 budget();const remaining=deadlineAt-Date.now();assert.ok(remaining>0,`Original operation deadline expired: ${label}`);
 const value=await bounded(Promise.resolve().then(()=>{budget();return run();}),remaining,`Original operation deadline expired: ${label}`,()=>{stopped=true;});
 budget();assert.ok(Date.now()<deadlineAt,`Original operation deadline expired: ${label}`);return value;
}
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
 const original=await memberReady(surface,label,{deadlineAt});const navigation=createMemberNavigationResumeObserver(surface.page,{directory,roleId:roleIds[label],deadlineAt});let failed,result;
 try{await navigation.prepare(original);await bounded(Promise.resolve().then(choose),Math.min(35000,deadlineAt-Date.now()),'Original normal member navigation expired.');result=await memberReady(surface,label,{original,navigation,deadlineAt});if(readyLocator)await readyLocator.waitFor({state:'visible',timeout:Math.min(35000,deadlineAt-Date.now())});}
 catch(error){failed=error;}finally{try{await bounded(navigation.finish(failed),Math.min(5000,Math.max(1,deadlineAt-Date.now())),'Original member navigation teardown expired.');}catch(error){(evidence.navigationTeardownErrors??=[]).push({label,stage,error:originalProofError(error)});if(!failed)failed=error;}}
 if(failed)throw failed;return result;
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
 const roleId=roleIds[label],deadlineAt=Date.now()+60000,original=await memberReady(surface,label,{station:false,deadlineAt});const navigation=createMemberNavigationResumeObserver(surface.page,{directory,roleId,deadlineAt});let failed,result;
 try{await navigation.prepare(original);await surface.page.locator(`a[href$="/roles/${roleId}"]`).first().click({timeout:Math.min(35000,deadlineAt-Date.now())});result=await memberReady(surface,label,{original,navigation,casting:true,deadlineAt});}
 catch(error){failed=error;}finally{try{await bounded(navigation.finish(failed),Math.min(5000,Math.max(1,deadlineAt-Date.now())),'Original member navigation teardown expired.');}catch(error){(evidence.navigationTeardownErrors??=[]).push({label,stage,error:originalProofError(error)});if(!failed)failed=error;}}
 if(failed)throw failed;return result;
}

async function scoutPrivateWorld(requestId,noteId,deadlineAt){
 const paths=[`sessions/${sid}/serverState/navigation`,`sessions/${sid}/scoutRequests/${requestId}`,
  `sessions/${sid}/scoutResults/${requestId}`,`sessions/${sid}/scoutResolutionAudits/${requestId}`,
  `sessions/${sid}/commandReceipts/${requestId}`,`sessions/${sid}/playerDiscoveryNotes/${actorUids.get('Scientist')}/notes/${noteId}`];
 const docs=await candidateWait(()=>Promise.all(paths.map(path=>db.doc(path).get())),deadlineAt,'scoped durable scout read witness');
 assert.ok(docs.every(doc=>doc.exists),'Every privacy target must be populated by the original real scout.');
 const names=['scoutRequests','scoutResults','scoutResolutionAudits','commandReceipts'];
 const sets=await candidateWait(()=>Promise.all(names.map(name=>db.collection(`sessions/${sid}/${name}`).get())),deadlineAt,'scoped scout collection counts');
 return{documents:docs.map((doc,index)=>({kind:['navigation','request','result','resolution-audit','receipt','requester-note'][index],sha256:hash(stable(doc.data()))})),
  collections:Object.fromEntries(sets.map((set,index)=>[names[index],{count:set.size,sha256:hash(stable(set.docs.map(doc=>({id:doc.id,data:doc.data()})).sort((a,b)=>a.id.localeCompare(b.id))))}]))};
}
async function resolveOriginalScout(data,reply,deadlineAt){
 assert.equal(data.sessionId,sid);assert.equal(data.entitlementId,'endeavour');assert.equal(reply.requestId,data.requestId);
 let rows;
 while(Date.now()<deadlineAt){
  rows=await candidateWait(()=>Promise.all([db.doc(`sessions/${sid}/scoutResults/${data.requestId}`).get(),
   db.doc(`sessions/${sid}/scoutResolutionAudits/${data.requestId}`).get(),db.doc(`sessions/${sid}/scoutRequests/${data.requestId}`).get(),
   db.collection(`sessions/${sid}/playerDiscoveryNotes/${actorUids.get('Scientist')}/notes`).where('requestId','==',data.requestId).get()]),deadlineAt,'original automatic scout resolution');
  if(rows[0].exists&&rows[1].exists&&rows[3].size===1)break;
  await candidateWait(()=>delay(100),deadlineAt,'original automatic scout resolution feed');
 }
 assert.ok(Date.now()<deadlineAt,'Original automatic resolution deadline expired.');
 const[result,audit,request,notes]=rows;assert.equal(notes.size,1);
 assert.equal(result.get('requesterUid'),actorUids.get('Scientist'));assert.equal(result.get('sourceId'),'endeavour');
 assert.equal(result.get('cycle'),1);assert.equal(result.get('targetCoordinate'),data.targetCoordinate);
 assert.equal(request.get('actorUid'),actorUids.get('Scientist'));assert.equal(request.get('anchorShipId'),'shepherd');assert.equal(request.get('receivingShipId'),'shepherd');
 assert.equal(notes.docs[0].get('requesterUid'),actorUids.get('Scientist'));assert.equal(notes.docs[0].get('shipId'),'shepherd');
 assert.equal(audit.get('resolutionMode'),'automatic');
 return{requestId:data.requestId,noteId:notes.docs[0].id,noteRecordedAt:notes.docs[0].get('recordedAt'),coordinate:data.targetCoordinate,fact:result.get('systemFact'),requesterUidHash:short(result.get('requesterUid')),
  resultSha256:hash(stable(result.data())),noteSha256:hash(stable(notes.docs[0].data())),auditSha256:hash(stable(audit.data()))};
}
async function privateReadAudience(discovery,deadlineAt){
 const requester=await memberReady(scientist,'Scientist',{deadlineAt}),ordinaryPeer=await memberReady(peer,'Peer',{deadlineAt});
 assert.equal(requester.fleetGroupId,ordinaryPeer.fleetGroupId,'This is an actual same-group peer boundary.');
 const before=await scoutPrivateWorld(discovery.requestId,discovery.noteId,deadlineAt);
 const ownIndex=await candidateWait(()=>scientist.callable('listMyScoutReports',{sessionId:sid}),deadlineAt,'original requester report index');
 assert.equal(ownIndex.status,'committed');assert.equal(ownIndex.result.length,1);
 assert.equal(ownIndex.result[0].requestId,discovery.requestId);assert.equal(ownIndex.result[0].noteId,discovery.noteId);assert.equal(ownIndex.result[0].status,'resolved');
 assert.deepEqual(ownIndex.result,[{requestId:discovery.requestId,cycle:1,entitlementId:'endeavour',targetCoordinate:discovery.fact.coordinate,status:'resolved',noteId:discovery.noteId}]);
 const own=await candidateWait(()=>scientist.callable('readPrivateScoutResult',{sessionId:sid,requestId:discovery.requestId}),deadlineAt,'original requester full scout result');
 assert.equal(own.status,'committed');assert.equal(own.result.requesterUid,actorUids.get('Scientist'));assert.equal(own.result.requestId,discovery.requestId);assert.deepEqual(own.result.systemFact,discovery.fact);
 assert.deepEqual(own.result,{type:'private-scout-result',sessionId:sid,requestId:discovery.requestId,requesterUid:actorUids.get('Scientist'),sourceId:'endeavour',cycle:1,targetCoordinate:discovery.fact.coordinate,systemFact:discovery.fact});
 const note=await candidateWait(()=>scientist.callable('readMyScoutDiscoveryNote',{sessionId:sid,noteId:discovery.noteId}),deadlineAt,'original requester durable scout note');
 assert.equal(note.status,'committed');assert.equal(note.result.id,discovery.noteId);assert.deepEqual(note.result.systemFact,discovery.fact);
 assert.deepEqual(note.result,{type:'player-discovery-note',id:discovery.noteId,cycle:1,targetCoordinate:discovery.fact.coordinate,systemFact:discovery.fact,recordedAt:discovery.noteRecordedAt});
 const peerIndex=await candidateWait(()=>peer.callable('listMyScoutReports',{sessionId:sid}),deadlineAt,'ordinary peer own empty scout report index');
 assert.equal(peerIndex.status,'committed');assert.deepEqual(peerIndex.result,[]);
 for(const[name,payload]of[
  ['readPrivateScoutResult',{sessionId:sid,requestId:discovery.requestId}],
  ['readMyScoutDiscoveryNote',{sessionId:sid,noteId:discovery.noteId}],
  ['readPrivateScoutResult',{sessionId:sid,requestId:discovery.requestId,instanceId:gm1Instance}],
 ]){const denied=await candidateWait(()=>peer.callable(name,payload),deadlineAt,'same-group peer requester-only denial');assert.equal(denied.status,'denied');assert.equal(denied.code,'functions/permission-denied');}
 const mounted=await candidateWait(()=>peer.page.evaluate(async({sid,storeUrl,requesterUid,requestId,noteId})=>{
  const{auth}=await import('/src/lib/firebase.ts');const{db}=await import('/src/lib/firestore.ts');
  const source=await(await fetch('/src/lib/firestore.ts')).text(),match=source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
  if(!match)throw new Error('Observe the actual mounted Firestore SDK.');
  const{doc,getDocFromServer,collection,getDocsFromServer}=await import(match[1]);const{useSessionStore}=await import(storeUrl);
  const uid=auth().currentUser?.uid,state=useSessionStore.getState();
  if(!uid||state.me?.uid!==uid||state.me.role!=='player'||state.session?.id!==sid)throw new Error('Original ordinary peer required.');
  const own=await getDocFromServer(doc(db(),`sessions/${sid}/playerDiscoveries/${uid}`));if(!own.exists())throw new Error('Current own peer discovery projection must exist.');
  const projection=own.data(),reads=[];
  const targets=[['private-result',`sessions/${sid}/scoutResults/${requestId}`],['private-request',`sessions/${sid}/scoutRequests/${requestId}`],
   ['private-audit',`sessions/${sid}/scoutResolutionAudits/${requestId}`],['requester-note',`sessions/${sid}/playerDiscoveryNotes/${requesterUid}/notes/${noteId}`],
   ['requester-discovery',`sessions/${sid}/playerDiscoveries/${requesterUid}`]];
  for(const[kind,path]of targets){try{const value=await getDocFromServer(doc(db(),path));reads.push({kind,status:'allowed',exists:value.exists()});}catch(error){reads.push({kind,status:'denied',code:error.code});}}
  for(const[kind,path]of[['results-query',`sessions/${sid}/scoutResults`],['requests-query',`sessions/${sid}/scoutRequests`],
   ['audit-query',`sessions/${sid}/scoutResolutionAudits`],['requester-notes-query',`sessions/${sid}/playerDiscoveryNotes/${requesterUid}/notes`],['discovery-query',`sessions/${sid}/playerDiscoveries`]]){
   try{const value=await getDocsFromServer(collection(db(),path));reads.push({kind,status:'allowed',count:value.size});}catch(error){reads.push({kind,status:'denied',code:error.code});}
  }
  return{candidateReveals:projection.candidateReveals,reads,privatePayloadRecorded:false,
   currentMemberPrivateKeys:['organiserSites','organiserSystems','scoutRequests','scoutResults','scoutResolutionAudits','playerDiscoveryNotes','candidatePlanCheckpoint','privateCalculations'].filter(key=>Object.hasOwn(state.session,key))};
 },{sid,storeUrl:peer.storeModuleUrl(),requesterUid:actorUids.get('Scientist'),requestId:discovery.requestId,noteId:discovery.noteId}),deadlineAt,'actual ordinary peer populated document and query reads');
 assert.deepEqual(mounted.candidateReveals,[{code:discovery.fact.code,title:discovery.fact.title}],'Same-group names are entitled; requester identity, request, note and coordinate are outside this allowlist.');
 assert.deepEqual(mounted.reads.map(read=>read.kind),['private-result','private-request','private-audit','requester-note','requester-discovery','results-query','requests-query','audit-query','requester-notes-query','discovery-query']);
 for(const read of mounted.reads){assert.equal(read.status,'denied',`Populated peer boundary leaked ${read.kind}.`);assert.equal(read.code,'permission-denied');}
 assert.deepEqual(mounted.currentMemberPrivateKeys,[]);
 const envelope=await candidateWait(()=>peer.callable('getCurrentMemberSession',{sessionId:sid}),deadlineAt,'actual ordinary peer server member allowlist');
 assert.equal(envelope.status,'committed');assert.equal(envelope.result.type,'current-member-session');assert.equal(envelope.result.sessionId,sid);
 assert.equal(envelope.result.actorUid,actorUids.get('Peer'));assert.equal(envelope.result.groupId,ordinaryPeer.fleetGroupId);
 assert.equal(envelope.result.session.id,sid);assert.equal(envelope.result.session.currentTurn,1);
 assert.deepEqual(Object.keys(envelope.result).sort(),['type','sessionId','actorUid','groupId','session'].sort());
 for(const key of ['organiserSites','organiserSystems','scoutRequests','scoutResults','scoutResolutionAudits','playerDiscoveryNotes','candidatePlanCheckpoint','privateCalculations'])assert.equal(Object.hasOwn(envelope.result.session,key),false,`Actual server member envelope leaked ${key}.`);
 const after=await scoutPrivateWorld(discovery.requestId,discovery.noteId,deadlineAt);assert.deepEqual(after,before,'Scoped private reads/denials do not mutate the original scout, note, navigation or receipts.');
 const originalAfter=await memberReady(peer,'Peer',{deadlineAt});
 for(const key of ['documentTimeOrigin','uidHash','sessionId','meSessionId','assignedRoleId','activeConsoleRoleId','seatId','fleetGroupId','connectionGeneration','identityHydrationRevision'])assert.equal(originalAfter[key],ordinaryPeer[key],'Audience reads preserve the original current peer authority.');
 return{groupId:ordinaryPeer.fleetGroupId,requesterIndexCount:ownIndex.result.length,peerIndexCount:peerIndex.result.length,
  requesterFullResultAllowed:true,requesterNoteAllowed:true,peerResultNoteAndBorrowedGmDenied:true,
  sameGroupCandidateNamesAllowed:true,candidateReveals:mounted.candidateReveals,reads:mounted.reads,actualServerMemberAllowlistPrivateKeysAbsent:true,scopedDurableStateUnchanged:true};
}
async function ownedWorld(deadlineAt){return bounded(db.doc(`sessions/${sid}/serverState/navigation`).get(),Math.max(1,deadlineAt-Date.now()),'Original diagnostic navigation deadline').then(doc=>({navigationSha256:doc.exists?hash(stable(doc.data())):null}));}
startAt=Date.now();
const timing=pc11ProofTiming(startAt,Number(freeze.macAllocation.parentDeadlineEpochMs));
totalEnd=timing.totalEnd;workEnd=timing.workEnd;evidence.startedAt=new Date(startAt).toISOString();
evidence.executionCapMs=timing.executionCapMs;evidence.parentAllocationDeadline=new Date(totalEnd).toISOString();
try{await bounded((async()=>{
 await mark('launch exactly GM, original Scientist and ordinary peer');gm=await launchSurface('browser-A-normal-GM');scientist=await launchSurface('browser-B-normal-Scientist');peer=await launchSurface('browser-C-normal-Peer');
 await mark('normal GM create and consent');await gm.page.goto(baseUrl);await gm.reducedMotion();const created=await observeUiReceipt({page:gm.page,consumed:{stage},waitForResponse:()=>gm.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/us-central1/createSession')&&r.request().method()==='POST',{timeout:35000}),choose:()=>gm.page.getByRole('button',{name:'Create a session',exact:true}).click()});assert.equal(created.status(),200);const createdBody=await created.json();sid=createdBody.result?.session?.id;joinCode=createdBody.result?.session?.joinCode;assert.match(sid,/^[\w-]{1,128}$/);await register(gm,'GM1');await gm.consent();const initial=await gm.until('Fresh ordinary Cycle0',v=>v.hasAuth&&v.sameActor&&v.sessionId===sid&&v.cycle===0&&v.freshness==='server');joinCode=initial.joinCode;evidence.sessionHash=hash(sid);claims.push('Actual GM normal create/Auth/consent');
 await mark('normal named live GM authorization');await authorizeAndClaim(gm,'GM1','PC10 private scout audience GM');
 if(!await gm.page.getByRole('region',{name:'Setup',exact:true}).isVisible()){await gm.page.getByRole('button',{name:/^Open station catalog/}).click();await gm.page.getByRole('link',{name:'GM Console',exact:true}).click();}
 const setup=gm.page.getByRole('region',{name:'Setup',exact:true});await setup.getByRole('button',{name:'Setup',exact:true}).click();await setup.getByLabel('Recommended player count',{exact:true}).selectOption('16');await setup.getByLabel('Star chart',{exact:true}).selectOption('A');await action(gm,'confirmSetup',()=>setup.getByRole('button',{name:'Confirm setup // Confirm roster',exact:true}).click());await gm.until('Legal16 roster confirmed',v=>v.setupConfirmed&&v.activeRoleIds.length===16&&v.activeRoleIds.includes('icebreaker-miner')&&v.activeRoleIds.includes('shepherd-scientist')&&v.activeVesselIds.includes('icebreaker')&&v.activeVesselIds.includes('shepherd'));claims.push('Normal legal16 configured roster; other seats open; no prepared crew');
 // Legal16 uses separate Engineers; Union craft/starting-host controls are not configured.
 await mark('protected unlimited manual preparation before ordinary join');const training=gm.page.locator('fieldset[aria-label="Full-game demo preparation"]');const prepared=await action(gm,'prepareFullGameDemo',async()=>{await training.getByRole('button',{name:'Prepare full-game demo',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // PREPARE FULL-GAME DEMO',exact:true}).click();});assert.equal(prepared.result.status,'committed');assert.deepEqual(prepared.result.fullGameDemo,{status:'preparing',progression:'manual'});await gm.until('Real manual prepared Cycle0',v=>v.cycle===0&&v.gmInstanceOwned&&v.fullGameDemo?.status==='preparing'&&v.fullGameDemo?.progression==='manual');claims.push('Protected manual full-game preparation before ordinary identities join');
 for(const[surface,label]of[[scientist,'Scientist'],[peer,'Peer']]){await mark(`${label} normal join and primary assignment`);await normalJoin(surface,label);const name=(await observeLifecycleActor(surface)).displayName;assert.ok(name);const casting=gm.page.getByRole('region',{name:'Facilitator casting',exact:true});await casting.getByLabel(`Role for ${name}`,{exact:true}).selectOption(roleIds[label]);await action(gm,'assignRole',()=>casting.getByRole('button',{name:`Assign role to ${name}`,exact:true}).click());await memberReady(surface,label,{station:false});await enterRole(surface,label);claims.push(`${label} normal primary assigned role/chooser/seat/SDK authority during Cycle0 casting; no operational berth claim`);}
 await mark('real GM manual Cycle0 to1 and Coordination');const started=await action(gm,'startGame',async()=>{await training.getByRole('button',{name:'Start full-game demo // Advance to Cycle 1',exact:true}).click();await training.getByRole('button',{name:'ARE YOU SURE? // START FULL-GAME DEMO // CYCLE 1',exact:true}).click();});assert.equal(started.data.fullGameDemo,true);await liveGm(gm,'GM1','active');
 for(const surface of[gm,scientist,peer]){const presented=await completeOfferedCyclePresentation(surface,await snapshot(surface,'Actual Cycle1 presentation'),{clearBriefing:true});assert.equal(presented.sawBriefing,false);assert.equal(presented.actualPaintReady,true);}
 const coordinationDeadline=Date.now()+60000;const offeredCoordination=gm.page.getByRole('button',{name:'Open Coordination manually',exact:true});await candidateWait(()=>action(gm,'advanceFullGameDemoPhase',()=>offeredCoordination.click({timeout:Math.min(35000,coordinationDeadline-Date.now())})),coordinationDeadline,'normal offered GM Coordination control');await candidateWait(()=>gm.until('Real manual Coordination Cycle1',v=>v.cycle===1&&v.phase==='active'&&v.airspace==='lifted'&&v.turnStatePhase==='coordination'&&v.phaseProgression==='manual',coordinationDeadline-Date.now()),coordinationDeadline,'original GM Coordination publication');const phase=await candidateWait(()=>liveGm(gm,'GM1','active',{deadlineAt:coordinationDeadline}),coordinationDeadline,'original GM Coordination receipt/current authority');assert.equal(phase.cycle,1);assert.equal(phase.phaseProgression,'manual');assert.equal(phase.airspace,'lifted');assert.equal(phase.turnStatePhase,'coordination');for(const surface of[scientist,peer])await candidateWait(()=>surface.until('Original ordinary Coordination Cycle1',v=>v.cycle===1&&v.phase==='active'&&v.airspace==='lifted'&&v.turnStatePhase==='coordination'&&v.phaseProgression==='manual',coordinationDeadline-Date.now()),coordinationDeadline,'original ordinary Coordination publication');
  await mark('one real Cycle1 Endeavour scout populates requester and same-group candidate audiences');
  const scoutDeadline=Date.now()+60000;
  const selected=await candidateWait(()=>gm.page.evaluate(storeUrl=>import(storeUrl).then(({useSessionStore})=>{
   const session=useSessionStore.getState().session;
   const entries=Object.entries(session.organiserSites??{}).filter(([,site])=>site.code==='N'&&site.candidate===true);
   if(entries.length!==1)throw new Error('Actual entitled selected GM chart has one N candidate.');
   return{chartId:session.chartId,locked:session.configurationLocked===true||session.chartSelectionLocked===true,coordinate:entries[0][0],title:entries[0][1].name,code:'N'};
  }),gm.storeModuleUrl()),scoutDeadline,'entitled GM selects actual printed candidate');
  assert.equal(selected.chartId,'A');assert.equal(selected.locked,true);
  const region=scientist.page.getByRole('region',{name:'Endeavour scouting request',exact:true});
  await candidateWait(()=>memberNavigate(scientist,'Scientist',()=>scientist.page.getByRole('link',{name:'Open Endeavour shuttle console',exact:true}).click(),region,scoutDeadline),scoutDeadline,'ordinary original Endeavour navigation');
  await candidateWait(()=>region.getByLabel('Printed system coordinate',{exact:true}).fill(selected.coordinate),scoutDeadline,'ordinary printed scout target');
  const recorded=await candidateWait(()=>action(scientist,'requestScout',()=>region.getByRole('button',{name:'Record request',exact:true}).click()),scoutDeadline,'actual ordinary scout UI commit');
  assert.equal(recorded.result.status,'requested');assert.equal(recorded.data.targetCoordinate,selected.coordinate);
  const discovery=await resolveOriginalScout(recorded.data,recorded.result,scoutDeadline);assert.deepEqual(discovery.fact,{coordinate:selected.coordinate,code:selected.code,title:selected.title});
  evidence.originalScout=discovery;
  await candidateWait(()=>region.getByRole('button',{name:'Refresh reports',exact:true}).click(),scoutDeadline,'actual requester refresh control');
  const report=region.getByRole('region',{name:'Endeavour scout report',exact:true});
  await candidateWait(()=>report.getByText(selected.title,{exact:true}).waitFor(),scoutDeadline,'actual original requester report');
  await candidateWait(()=>report.getByText('Discovery note saved for this station.',{exact:true}).waitFor(),scoutDeadline,'actual original saved note guidance');
  await candidateWait(()=>report.screenshot({path:`${directory}/Scientist-original-private-scout-report.png`,timeout:Math.min(5000,scoutDeadline-Date.now())}),scoutDeadline,'actual requester report region capture');
  claims.push('One actual original Cycle1 Endeavour UI request automatically resolves to one bound private result, note and audit; current requester report mounts. Existing N/O/P outcomes are not replayed.');
  await mark('same-group peer full report/index/note and populated Rules query boundary');
  evidence.audience=await privateReadAudience(discovery,Date.now()+60000);
  claims.push('Requester reads its original full report/index/durable note; current ordinary same-group peer receives only allowed candidate code/title, has an empty own report index, and cannot borrow the live GM instance to read requester data.');
  claims.push('Ten real normal peer SDK document/query attempts deny populated requester, private result/request/audit/note and discovery collections; no scoped scout/navigation/receipt effect and no private fields in the member session.');
  await mark('original peer cold-document persistence and same-group privacy recovery');
  await restoredMember(peer,'Peer',Date.now()+60000);
  evidence.afterPeerReload=await privateReadAudience(discovery,Date.now()+60000);
  claims.push('The original peer cold reload keeps its normal Auth, assignment, seat, group and mounted SDK authority; original requester-private denial and allowed candidate names persist.');
  assert.equal(actorUids.size,3);assert.equal(browsers.length,3);assert.equal(surfaces.length,3);assert.equal(errors.length,0);assert.equal(remoteRequests.length,0);assert.equal(evidence.navigationTeardownErrors?.length??0,0);
  evidence.status='BOUNDED_THREE_ACTOR_SCOUT_PRIVATE_AUDIENCE_PASS';evidence.completedAt=new Date().toISOString();
  })(),Math.max(1,workEnd-Date.now()),'Stop private audience work at the absolute parent deadline minus original cleanup reserve.',()=>{stopped=true;});
}catch(error){stopped=true;primaryFailure=error;evidence.status='BOUNDED_THREE_ACTOR_SCOUT_PRIVATE_AUDIENCE_STOPPED_FIRST_FAILURE';evidence.failedStage=stage;evidence.originalError=originalProofError(error);evidence.consumedState=consumed;const diagnosticEnd=Math.min(Date.now()+10000,totalEnd-45000);evidence.failureDiagnosticErrors=[];
 for(const surface of surfaces){try{await bounded(snapshot(surface,`${surface.label}-first-failure`),Math.max(1,diagnosticEnd-Date.now()),'Original first-failure snapshot deadline');await surface.page.screenshot({path:`${directory}/${surface.label}-first-failure.png`,timeout:Math.max(1,Math.min(5000,diagnosticEnd-Date.now()))});}catch(failure){evidence.failureDiagnosticErrors.push(originalProofError(failure));}}
 try{evidence.firstFailureWorld=await bounded(ownedWorld(diagnosticEnd,true),Math.max(1,diagnosticEnd-Date.now()),'First-failure exact owned scout navigation witness deadline');}catch(failure){evidence.failureDiagnosticErrors.push(originalProofError(failure));}await retainProofFailure(directory,'scout-private-audience',error,{stage,consumed,claims});console.log(JSON.stringify({stoppedAt:stage,message:error.message.slice(0,500),claimsEarned:claims.length}));
} finally {
 stopped=true;
 const cleanup={browsersClosed:0,sessionAbsent:false,joinCodeAbsent:false,deletedOwnPointers:0,deletedOwnAuth:0,errors:[]};
 const cleanupEnd=totalEnd-1500;
 const cleanupStep=async(label,operation)=>{
  if(Date.now()>=cleanupEnd){cleanup.errors.push({label,code:'execution-cap-cleanup-deadline'});return null;}
  try{return await bounded(Promise.resolve().then(operation),cleanupEnd-Date.now(),`Owned cleanup deadline: ${label}`);}
  catch(error){cleanup.errors.push({label,error:originalProofError(error)});return null;}
 };
 await cleanupStep('settle all owned launches',()=>Promise.allSettled(pendingLaunches));
 for(const browser of browsers)await cleanupStep('close owned browser',async()=>{await browser.close();assert.equal(browser.isConnected(),false);cleanup.browsersClosed++;});
 await cleanupStep('settle private scout response body diagnostics',async()=>{const settled=await Promise.allSettled(pendingScoutResponses);assert.ok(settled.every(item=>item.status==='fulfilled'),'Preserve response-body diagnostic write failures.');});
 if(sid) {
  await cleanupStep('remove verified exact owned join-code pointer',async()=>{
   if(!joinCode){const originalSession=await db.doc(`sessions/${sid}`).get();joinCode=originalSession.get('joinCode');}
   assert.equal(typeof joinCode,'string');const ref=db.doc(`joinCodes/${joinCode}`);
   await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.exists){assert.equal(doc.get('sessionId'),sid,'Refuse foreign join-code deletion.');tx.delete(ref);}});
   cleanup.joinCodeAbsent=!(await ref.get()).exists;assert.equal(cleanup.joinCodeAbsent,true);
  });
  await cleanupStep('remove exact owned session subtree',async()=>{const session=await db.doc(`sessions/${sid}`).get();if(session.exists)await db.recursiveDelete(session.ref);cleanup.sessionAbsent=!(await db.doc(`sessions/${sid}`).get()).exists;assert.equal(cleanup.sessionAbsent,true);});
  await cleanupStep('remove verified owned membership pointers',async()=>{
   const pointers=await db.collection('activeMemberships').where('sessionId','==',sid).get();const known=new Set(actorUids.values());assert.ok(pointers.docs.every(doc=>known.has(doc.id))&&pointers.size<=3,'Refuse unknown actor cleanup.');
   await db.runTransaction(async tx=>{const current=await Promise.all(pointers.docs.map(doc=>tx.get(doc.ref)));assert.ok(current.every(doc=>doc.exists&&doc.get('sessionId')===sid));for(const doc of current)tx.delete(doc.ref);});cleanup.deletedOwnPointers=pointers.size;cleanup.remainingOwnPointers=(await db.collection('activeMemberships').where('sessionId','==',sid).get()).size;assert.equal(cleanup.remainingOwnPointers,0);
  });
 }
 for(const uid of actorUids.values())await cleanupStep('remove verified fresh owned Auth identity',async()=>{const user=await getAuth().getUser(uid);assert.ok(Date.parse(user.metadata.creationTime)>=startAt&&Date.parse(user.metadata.creationTime)<=Date.now(),'Refuse Auth identity not born in this fresh run.');await getAuth().deleteUser(uid);cleanup.deletedOwnAuth++;});
 await cleanupStep('read final empty session/player/GM scope',async()=>{const scope=await Promise.all([db.collection('sessions').get(),db.collectionGroup('players').where('connected','==',true).get(),db.collectionGroup('gmInstances').where('connected','==',true).get()]);cleanup.scope={sessions:scope[0].size,connectedPlayers:scope[1].size,connectedGmInstances:scope[2].size};assert.deepEqual(cleanup.scope,{sessions:0,connectedPlayers:0,connectedGmInstances:0});});
 await cleanupStep('terminate own Admin client',()=>db.terminate());
 await cleanupStep('verify source unchanged',()=>{assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:1000}).trim(),sourceCommit);assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8',timeout:1000}).trim(),'');evidence.sourceUnchanged=true;});
 evidence.cleanup=cleanup;evidence.actualBrowserProcesses=browsers.length;evidence.actualBrowserContexts=surfaces.length;evidence.maxMountedSurfaces=surfaces.length;evidence.actualAuthenticatedActors=actorUids.size;evidence.actorUidHashes=Object.fromEntries([...actorUids].map(([label,uid])=>[label,short(uid)]));evidence.elapsedIncludingCleanupMs=Date.now()-startAt;evidence.executionCapMet=Date.now()<=totalEnd;evidence.catalogClosureCredit=0;evidence.checkpointOrReleaseCredit=0;
 if(cleanup.errors.length||!evidence.executionCapMet){evidence.gameplayDisposition=evidence.status;evidence.status='BOUNDED_THREE_ACTOR_SCOUT_PRIVATE_AUDIENCE_CLEANUP_INCOMPLETE';}
 await writeFile(`${directory}/OWNER_RESULT.json`,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({directory,status:evidence.status,claimsEarned:claims.length,actualAuth:actorUids.size,actualBrowsers:browsers.length,elapsedMs:evidence.elapsedIncludingCleanupMs,cleanup}));process.exitCode=primaryFailure||cleanup.errors.length||!evidence.executionCapMet?1:0;
}
