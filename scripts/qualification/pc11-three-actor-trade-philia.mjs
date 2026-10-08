import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt, attachUiReceiptDiagnostics } from '../pc10-browser-ui-receipt.mjs';
import { originalProofError, retainProofFailure } from '../pc10-proof-failure-evidence.mjs';
import { observeFullGameDemoPresentationMember as observeNormalMember, proofRuntimeFromViteSource, validateProofRuntime } from '../pc10-full-game-demo-proof-helpers.mjs';
import { observeLifecycleActor, captureLifecycleUiAction, publicLifecycleReceipt, openLifecycleSettings, closeLifecycleSettings } from '../pc10-member-gm-lifecycle-ui-proof.mjs';
import { createMemberNavigationResumeObserver } from '../pc10-member-navigation-resume.mjs';
import { PC11_NORMAL_START, pc11GmReadiness, pc11MemberReadiness, pc11NormalStartPreflight, pc11OwnBerthWitness, removePc11OwnedRootRecords, createPc11OwnedRequestTracker, recoverPc11CreatedSession, pc11ProofTiming } from './pc11-normal-start-adapter.mjs';
import { runPc11ContractPreflight } from './pc11-contract-preflight.mjs';
const root=process.env.PC11_SOURCE_ROOT,projectId=process.env.PC11_PROJECT;
assert.equal(process.env.PC11_RUNTIME_ALLOCATED,'yes','Owner allocation required before any runtime access');
assert.ok(root && projectId?.startsWith('demo-pc11-'));
const baseUrl=process.env.PC11_UI_URL;
const ports=JSON.parse(process.env.PC11_PORTS_JSON??'null');
assert.ok(baseUrl?.startsWith('http://127.0.0.1:') && ports && Object.values(ports).every(Number.isSafeInteger));
const directory=process.env.PC11_EVIDENCE_DIRECTORY;assert.ok(directory?.startsWith('/tmp/'));
assert.equal(await realpath(root),await realpath(new URL('../..',import.meta.url)), 'Source must be this integration checkout');
assert.equal(existsSync(`${root}/src/lib/demoActorContext.ts`),false,'Normal PC11 baseline must not silently acquire demo-actor profile semantics.');
assert.ok(!Object.values(ports).some(p=>[9109,5011,8090,9119,5021,8100].includes(p)), 'PC10/hotfix retained ports are excluded');
const hash=value=>createHash('sha256').update(value).digest('hex'), short=value=>hash(value).slice(0,16);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sourceCommit,process.env.PC11_SOURCE_COMMIT);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim(),'');
const sourceContractPreflight=runPc11ContractPreflight(root);
const require=createRequire(`${root}/package.json`), {chromium}=require('playwright');

const gmOnly=process.env.PC11_GM_ONLY==='1';
const browsers=[],surfaces=[],errors=[],calls=[],requests=[],remoteRequests=[],states=[],receipts=[],claims=[];
let gm,owner,recipient,sid,joinCode,creationRequestId,startRequestId,stage='not-started',consumed=null,primaryFailure=null,startAt,workEnd,totalEnd;
const actorUids=new Map(),admissionActors=new Map(),pendingLaunches=[],pendingOriginalIdentities=[];let stopped=false;
const roleIds={Owner:'dione-engineer',Recipient:'dione-president'};
const evidence={schemaVersion:1,sourceCommit,sourceContractPreflight,configuredRoles:gmOnly?null:12,actualHumans:0,physicalDeviceProof:false,
 actualBrowserProcesses:gmOnly?1:3,actualBrowserContexts:gmOnly?1:3,maxMountedSurfaces:gmOnly?1:3,ordinaryPrimaryAccounts:true,
 manualAuthStorageWrites:false,authCredentialInjection:false,demoCrewPreparation:false,adminGameplayWrites:0,
 wholeGameProof:false,endingProof:false,capacityProof:false,visualUsabilityAccepted:false,
 renderedReleaseGatesPending:true,demoProfileAdapterUsed:false,clockAcceleration:false,
 cohortReason:gmOnly?'One ordinary authenticated GM proves only fresh claim ownership and server authority; no players or gameplay setup.':'Ordinary GM production start and briefing clearance with separately admitted Dione Engineer and President prove the exact trade and Philia target-consent path. Legal configured 12-seat Chart A leaves ten other player seats open.',
 unchangedAdmissionManualSetupAndObserversReused:true,tradeAndPhiliaReloadReadback:!gmOnly,
 executionTargetMs:180000,executionCapMs:480000,originalPageTimeoutMs:35000,originalOperationTimeoutMs:60000,
 states,receipts,claims,requests,calls,remoteRequests,errors};
async function bounded(operation,timeout,name,onTimeout=()=>{}) {let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(new Error(name));},timeout);})]);}finally{clearTimeout(timer);}}
function budget() { assert.equal(stopped,false,'Work has stopped; do not begin a subsequent action.');assert.ok(Date.now()+60000<=workEnd,'Not enough cap budget to begin another full original60s operation and normal cleanup.'); }
async function mark(name) { budget();stage=name; await writeFile(`${directory}/progress.json`,JSON.stringify({sourceCommit,stage,elapsedMs:Date.now()-startAt,claims},null,2)+'\n');console.log(JSON.stringify({stage,elapsedMs:Date.now()-startAt})); }
async function snapshot(surface,label) { const value=await observeLifecycleActor(surface,sid);states.push({label,origin:new URL(surface.page.url()).origin,state:value});consumed={stage,label,state:value};await writeFile(`${directory}/consumed-state.json`,JSON.stringify(consumed,null,2)+'\n');return value; }
async function register(surface,label) { const uid=await surface.page.evaluate(async()=>{const {auth}=await import('/src/lib/firebase.ts');if(!auth().currentUser)throw new Error('Normal admission has no Auth user.');return auth().currentUser.uid;});assert.ok(![...actorUids].some(([actor,value])=>actor!==label&&value===uid),'Require independent normally admitted Auth identities.');if(actorUids.has(label))assert.equal(actorUids.get(label),uid,'Original request Auth UID must be retained.');actorUids.set(label,uid);evidence.actualAuthenticatedActors=actorUids.size;await writeFile(`${directory}/owned-identities.json`,JSON.stringify({sid,joinCode,actors:Object.fromEntries(actorUids)},null,2)+'\n',{mode:0o600}); }
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
    createPc11OwnedRequestTracker(page, receipt => {
      if(receipt.endpoint === 'createSession' || receipt.endpoint === 'joinSession') {
        const actor=label==='browser-A-normal-GM'?'GM1':label==='browser-B-normal-Engineer'?'Owner':label==='browser-C-normal-Captain'?'Recipient':null;
        if(!actor) return;
        if(receipt.endpoint === 'createSession') creationRequestId = receipt.requestId;
        const pending=page.evaluate(async()=>{const{auth}=await import('/src/lib/firebase.ts');const uid=auth().currentUser?.uid;if(!uid)throw new Error('Original admission Auth identity absent');return uid;});
        pendingOriginalIdentities.push(pending.then(uid=>{const old=actorUids.get(actor);if(old)assert.equal(old,uid);else {assert.ok(![...actorUids.values()].includes(uid));actorUids.set(actor,uid);}return {ok:true};}).catch(error=>({error})));
      } else {
        try { assert.equal(receipt.sessionId,sid); assert.equal(receipt.instanceId,gm1Instance); startRequestId = receipt.requestId; }
        catch(error) { pendingOriginalIdentities.push(Promise.resolve({error})); stopped=true; }
      }
    });
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
          playerRole: state.me?.role ?? null, profileRoleId: null, profileSessionId: null,
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
    attachUiReceiptDiagnostics(page, { directory, label, inspectState: () => observe() });
    surfaces.push(result); return result;
  }

async function launchSurface(label) {
 budget();const pending=surface(label).then(async value=>{if(stopped){await value.context.browser().close();throw new Error('Owned launch settled after stop; closed it.');}return value;});pendingLaunches.push(pending);const value=await pending;
 await value.context.route('**/us-central1/*',route=>stopped?route.abort():route.fallback());budget();return value;
}

process.env.FIRESTORE_EMULATOR_HOST=`127.0.0.1:${ports.firestore}`;process.env.FIREBASE_AUTH_EMULATOR_HOST=`127.0.0.1:${ports.auth}`;
const adminRequire=createRequire(`${root}/functions/package.json`);const{initializeApp,getApps}=adminRequire('firebase-admin/app');const{getFirestore}=adminRequire('firebase-admin/firestore');const{getAuth}=adminRequire('firebase-admin/auth');assert.equal(getApps().length,0);initializeApp({projectId});const db=getFirestore();const {fleetGroupRecord}=adminRequire(`${root}/functions/lib/fleetGroups.js`);
await mkdir(directory,{mode:0o700});
const runtime=validateProofRuntime(proofRuntimeFromViteSource(await(await fetch(`${baseUrl}/src/lib/firebaseConfig.ts`,{signal:AbortSignal.timeout(5000)})).text()),{baseUrl,projectId,ports});evidence.runtime=runtime;
assert.equal((await db.collection('sessions').get()).size,0);
evidence.builtFunctionsSha256=hash(await readFile(`${root}/functions/lib/index.js`));
const launch=JSON.parse(await readFile(process.env.PC11_RUNTIME_LAUNCH_RECORD,'utf8'));
assert.equal(launch.sourceCommit,sourceCommit);assert.equal(await realpath(launch.sourceRoot),await realpath(root));
assert.equal(launch.projectId,projectId);assert.deepEqual(launch.ports,ports);assert.equal(launch.baseUrl,baseUrl);
assert.equal(launch.builtFunctionsSha256,evidence.builtFunctionsSha256);
assert.equal(launch.functionsBuiltBeforeLaunch,true);assert.equal(launch.processCwdsVerified,true);
assert.ok(Number.isSafeInteger(launch.vitePid)&&launch.vitePid>0&&Number.isSafeInteger(launch.emulatorPid)&&launch.emulatorPid>0);
evidence.ownerLaunchRecord=launch;
const sourceFiles=['src/components/PermissionedDismantlingPanel.tsx','src/components/SameTableTradePanel.tsx','src/components/SmallShipJumpPanel.tsx','src/components/DecisionGuidance.css','src/data/rolePresets.ts'];
for(const file of sourceFiles){const response=await fetch(`${baseUrl}/${file}?raw`,{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);const js=await response.text();assert.equal(hash(js),hash(await readFile(`${root}/${file}`,'utf8')),`Vite loaded exact raw ${file}`);}
evidence.servedSourceFiles=sourceFiles;

const preflightScope=await Promise.all([db.collection('sessions').get(),db.collectionGroup('players').where('connected','==',true).get(),db.collectionGroup('gmInstances').where('connected','==',true).get()]);
assert.deepEqual(preflightScope.map(v=>v.size),[0,0,0]);evidence.preflightScope=[0,0,0];
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
  const own=authority.sessionSnapshotAuthorityFor(sid,uid);return {ownAuthority:own.hasServerSessionAuthority,wrongSessionAuthority:authority.sessionSnapshotAuthorityFor('pc10-absent-session-control',uid).hasServerSessionAuthority};
 },{sid,authorityUrl:surface.sessionAuthorityModuleUrl(),storeUrl:surface.storeModuleUrl()}),remaining(),'Original live GM SDK witness deadline expired.');
 assert.deepEqual(sdk,{ownAuthority:true,wrongSessionAuthority:false});remaining();return value;
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
 await surface.page.evaluate(async({storeUrl,authorityUrl})=>{
  const{useSessionStore}=await import(storeUrl);const authority=await import(authorityUrl);const{auth}=await import('/src/lib/firebase.ts');
  const events=[];const sample=()=>{const state=useSessionStore.getState(),uid=auth().currentUser?.uid;
   const cursor=uid&&state.session?authority.sessionSnapshotAuthorityFor(state.session.id,uid):null;
   return {at:performance.now(),sameActor:!!uid&&state.me?.uid===uid,sessionId:state.session?.id??null,role:state.me?.role??null,
    memberGeneration:state.me?.connectionGeneration??null,hydrationRevision:state.identityHydrationRevision,connection:state.connection,
    freshness:state.sessionSnapshotFreshness,instanceId:state.gmInstance?.id??null,owned:!!uid&&state.gmInstance?.uid===uid,
    recoveryPending:state.gmRecoveryPending,accessCached:state.gmAccessAuthenticatedAt!==null,
    authorityVersion:cursor?authority.sessionSnapshotAuthorityVersion(cursor):null,hasServerAuthority:cursor?.hasServerSessionAuthority??false};};
  events.push({...sample(),origin:'observer-start'});const stop=useSessionStore.subscribe(()=>{if(events.length<300)events.push({...sample(),stack:new Error().stack});});
  window.__pc11GmClaimObservation={events,stop};
 },{storeUrl:surface.storeModuleUrl(),authorityUrl:surface.sessionAuthorityModuleUrl()});
 let claimed;
 try{
  claimed=await action(surface,'claimGmInstance',()=>surface.page.getByRole('button',{name:'Join as GM',exact:true}).click());
  assert.ok(claimed.result?.instance,'Claim response must contain an actual instance descriptor');
  assert.equal(claimed.result.instance.id,claimed.data.instanceId);assert.equal(claimed.result.instance.uid,actorUids.get(label));
  assert.equal(claimed.result.instance.sessionId,sid);assert.equal(typeof claimed.result.instance.claimedAt,'string');
  assert.equal(new Date(claimed.result.instance.claimedAt).toISOString(),claimed.result.instance.claimedAt);
  const live=await liveGm(surface,label);assert.equal(claimed.data.instanceId,live.instanceId);assert.equal(claimed.result.instance.id,live.instanceId);
  gm1Instance=live.instanceId;
  claims.push(`${label} ordinary admission/consent, normal local GM authorization and independent owned live instance`);return live;
 }finally{
  try{
   const events=await bounded(surface.page.evaluate(()=>{const observation=window.__pc11GmClaimObservation;observation?.stop();delete window.__pc11GmClaimObservation;return observation?.events??[];}),Math.max(1,Math.min(5000,workEnd-Date.now())),'GM transition diagnostics deadline');
   const id=claimed?.data?.instanceId,instance=claimed?.result?.instance,expectedUid=actorUids.get(label);
   const summary={httpResultRetained:!!claimed,instancePresent:!!instance,idMatches:!!id&&instance?.id===id,uidMatches:!!expectedUid&&instance?.uid===expectedUid,sessionMatches:instance?.sessionId===sid,claimedAt:instance?.claimedAt??null};
   let canonical=null;
   if(id){const docs=await bounded(Promise.all([db.doc(`sessions/${sid}/gmInstances/${id}`).get(),db.doc(`sessions/${sid}/players/${expectedUid}`).get()]),Math.max(1,Math.min(5000,workEnd-Date.now())),'GM owned canonical witness deadline');canonical={instanceExists:docs[0].exists,instanceUidMatches:docs[0].get('uid')===expectedUid,instanceSessionMatches:docs[0].get('sessionId')===sid,connected:docs[0].get('connected')??null,claimedAt:docs[0].get('claimedAt')?.toDate?.().toISOString()??docs[0].get('claimedAt')??null,memberExists:docs[1].exists,memberRole:docs[1].get('role')??null};}
   await writeFile(`${directory}/gm-claim-startup-observation.json`,JSON.stringify({summary,canonical,events},null,2)+'\n',{mode:0o600});
  }catch(error){(evidence.gmDiagnosticErrors??=[]).push({message:error.message});}
 }
}

// Stop at an action boundary: do not abandon an in-flight create/mutation.
const cancelProof=()=>{stopped=true;};process.once('SIGINT',cancelProof);process.once('SIGTERM',cancelProof);

async function fullMember(surface,{deadlineAt=Date.now()+60000}={}){
 const value=await bounded(observeNormalMember(surface,{knownRoleIds:Object.values(roleIds)}),Math.max(1,deadlineAt-Date.now()),'Original mounted member observation expired.');
 const label=surface===owner?'Owner':surface===recipient?'Recipient':null;
 if(label&&value.playerRole==='player'&&value.phase==='active'&&value.cycle===1){
  return await currentMemberBerthReady(surface,value,label,roleIds[label],deadlineAt)||{...value,currentOwnBerthConfirmed:false};
 }
 return value;
}
function currentMember(value,label,roleId){
 assert.equal(value.uidHash,short(actorUids.get(label)));assert.equal(value.sessionId,sid);assert.equal(value.meSessionId,sid);
 assert.equal(value.hasAuth,true);assert.equal(value.sameActor,true);assert.equal(value.profileRoleId,null);assert.equal(value.profileSessionId,null);
 assert.equal(value.playerRole,'player');assert.equal(value.replacementRoleId,null);assert.equal(value.replacementStatus,null);assert.equal(value.escapeLocked,false);assert.equal(value.kicked,false);assert.deepEqual(value.invalidFields,[]);
 if(value.assignedRoleId===null)return false;assert.equal(value.assignedRoleId,roleId);
 return pc11MemberReadiness(value,{sessionId:sid,uidHash:short(actorUids.get(label)),roleId,stage:value.activeConsoleRoleId==null?'casting':'station'})&&value.memberScopeMatches;
}
function stationReady(value,roleId){return value.activeConsoleRoleId===roleId&&value.seatId===roleId&&value.currentCanonicalSeatOwned;}
// Casting binds the primary station; the normal GM start transaction establishes operational berths.
function castingStationReady(value,label,roleId){return pc11MemberReadiness(value,{sessionId:sid,uidHash:short(actorUids.get(label)),roleId,stage:'station'})&&value.cycle===0&&value.phase==='casting'&&value.setupConfirmed;}
async function currentMemberBerthReady(surface,value,label,roleId,deadlineAt){
 const remaining=()=>{const ms=deadlineAt-Date.now();assert.ok(ms>0,'Original member operation deadline expired.');return ms;};remaining();
 if(!stationReady(value,roleId))return false;
 const raw=await bounded(db.doc(`sessions/${sid}/fleetGroups/${value.fleetGroupId}`).get(),remaining(),'Original member berth group-read deadline expired.');const group=fleetGroupRecord(raw.data());
 const after=await bounded(observeNormalMember(surface,{knownRoleIds:Object.values(roleIds)}),remaining(),'Original member berth reread deadline expired.');remaining();
 const accepted=raw.exists&&pc11OwnBerthWitness(value,after,{uid:actorUids.get(label),uidHash:short(actorUids.get(label)),group,expectedShipId:'dione'});
 states.push({label:stage,actor:label,berthApplicability:{groupId:value.fleetGroupId,readOnlyExactGroup:true,sourceGroupParsed:!!group,ownMemberIncluded:group?.memberUids.includes(actorUids.get(label))===true,ownMapShipMatches:group?.memberShipIds?.[actorUids.get(label)]==='dione',accepted}});return accepted?{...after,currentOwnBerthConfirmed:true}:false;
}
async function memberReady(surface,label,{original,navigation,station=true,casting=false,deadlineAt=Date.now()+60000}={}){
 const roleId=roleIds[label];let value;
 while(Date.now()<deadlineAt){value=await bounded(fullMember(surface,{deadlineAt}),deadlineAt-Date.now(),'Original member SDK observation deadline expired.');consumed={stage,label,original,current:value};navigation?.sample(value);
  if(original){for(const key of ['documentTimeOrigin','uidHash','sessionId','meSessionId','playerRole','assignedRoleId','fleetGroupId','replacementRoleId','replacementStatus','escapeLocked'])assert.equal(value[key],original[key],`Original same-document ${key} changed.`);
   if(value.connectionGeneration!==original.connectionGeneration||value.identityHydrationRevision!==original.identityHydrationRevision){assert.ok(navigation,'Generation/hydration changed without operation-local normal resume evidence.');const accepted=await navigation.accept(original,value,()=>fullMember(surface,{deadlineAt}));if(!accepted){await delay(200);continue;}value={...value,...accepted};}}
  const accepted=currentMember(value,label,roleId)?station?(casting?(castingStationReady(value,label,roleId)?value:false):(value.currentOwnBerthConfirmed?value:false)):value:false;
  if(accepted&&Date.now()<deadlineAt){states.push({label:stage,actor:label,member:accepted});return accepted;}await delay(200);
 }throw new Error(`Mounted member readiness expired: ${JSON.stringify(value)}`);
}
async function memberNavigate(surface,label,choose,readyLocator,deadlineAt=Date.now()+60000){
 const original=await memberReady(surface,label,{deadlineAt});const navigation=createMemberNavigationResumeObserver(surface.page,{directory,roleId:roleIds[label],deadlineAt,memberContract:'pc11-live-base'});let failed;
 let result;
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
 await register(surface,label);budget();await surface.consent();await surface.until('Normal joined fresh casting session',v=>v.hasAuth&&v.sameActor&&v.sessionId===sid&&v.cycle===0&&v.phase==='casting'&&v.setupConfirmed&&v.connection==='live'&&v.freshness==='server');
 const admitted=await fullMember(surface);assert.equal(pc11MemberReadiness(admitted,{sessionId:sid,uidHash:short(actorUids.get(label)),roleId:null,stage:'casting'}),true,'Normal admission must be server-fresh before role assignment or seat claim.');
 admissionActors.set(label,{roleId:roleIds[label],sessionId:sid,uidHash:admitted.uidHash});claims.push(`${label} independent normal Auth/join/consent captured before role assignment`);
}
async function enterRole(surface,label){
 const roleId=roleIds[label],deadlineAt=Date.now()+60000,original=await memberReady(surface,label,{station:false,deadlineAt});const navigation=createMemberNavigationResumeObserver(surface.page,{directory,roleId,deadlineAt,memberContract:'pc11-live-base'});let failed;
 let result;
 try{await navigation.prepare(original);await surface.page.locator(`a[href$="/roles/${roleId}"]`).first().click({timeout:Math.min(35000,deadlineAt-Date.now())});result=await memberReady(surface,label,{original,navigation,casting:true,deadlineAt});}
 catch(error){failed=error;}finally{try{await bounded(navigation.finish(failed),Math.min(5000,Math.max(1,deadlineAt-Date.now())),'Original member navigation teardown expired.');}catch(error){(evidence.navigationTeardownErrors??=[]).push({label,stage,error:originalProofError(error)});if(!failed)failed=error;}}
 if(failed)throw failed;return result;
}
async function ownedWorld(){const doc=await bounded(db.doc(`sessions/${sid}`).get(),15000,'Owned read-only witness timeout');assert.equal(doc.exists,true);const d=doc.data();return {damage:d.shipDamage?.dione,resources:d.shipResources?.dione,control:d.shuttleControl?.philia,docking:d.shuttleDockings?.filter(v=>v.shuttleId==='philia')};}
async function entitled(surface,label){await memberReady(surface,label);return surface.page.evaluate(async storeUrl=>{const {useSessionStore}=await import(storeUrl);const s=useSessionStore.getState();if(s.connection!=='live'||s.sessionSnapshotFreshness!=='server')throw new Error('Fresh entitled server projection required');return {damage:s.session?.shipDamage?.dione,resources:s.session?.shipResources?.dione,control:s.session?.shuttleControl?.philia,docking:s.session?.shuttleDockings?.filter(v=>v.shuttleId==='philia')};},surface.storeModuleUrl());}
async function settle(surface,label,expected){const end=Date.now()+15000;let value;while(Date.now()<end){value=await entitled(surface,label);if(stable(value)===stable(expected))return value;await delay(100);}assert.deepEqual(value,expected,'Entitled current projection must match actual server witness');}
async function held(surface,label){await memberReady(surface,label);return surface.page.evaluate(async({sid,uid})=>{const text=await(await fetch('/src/lib/firestore.ts')).text();const match=text.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);if(!match)throw new Error('SDK import unavailable');const sdk=await import(match[1]);const {db}=await import('/src/lib/firestore.ts');const doc=await sdk.getDocFromServer(sdk.doc(db(),`sessions/${sid}/playerHeldResourceInventories/${uid}`));if(!doc.exists())throw new Error('Held inventory absent');return doc.data().balances;},{sid,uid:actorUids.get(label)});}
async function ordinaryStartPreflight(){
 const canonicalRoleIds=await gm.page.evaluate(async playerCount=>{const{recommendedRoleIds}=await import('/src/data/rolePresets.ts');return [...recommendedRoleIds(playerCount)];},PC11_NORMAL_START.setup.playerCount);
 const projection=await gm.page.evaluate(async moduleUrl=>{
  const{useSessionStore}=await import(moduleUrl),state=useSessionStore.getState(),session=state.session;
  if(!session)throw new Error('Ordinary production start did not retain the live session projection.');
  return {session:{id:session.id,phase:session.phase,currentTurn:session.currentTurn,fullGameDemo:session.fullGameDemo??null,
   setupConfirmed:session.setupConfirmed,playerCount:session.playerCount,chartId:session.chartId,activeRoleIds:[...(session.activeRoleIds??[])],
   dioneEnabled:session.dioneEnabled,activeVesselIds:[...(session.activeVesselIds??[])],shuttleDockings:[...(session.shuttleDockings??[])]},
   occupiedSeatCount:state.seats.filter(seat=>seat.sessionId===session.id&&seat.status==='claimed').length};
 },gm.storeModuleUrl());
 const [gmMember,ownerMember,recipientMember,recoveryPending]=await Promise.all([
  fullMember(gm),fullMember(owner),fullMember(recipient),
  gm.page.evaluate(async moduleUrl=>{const{useSessionStore}=await import(moduleUrl);return useSessionStore.getState().gmRecoveryPending;},gm.storeModuleUrl()),
 ]);
 const expectedGm={sessionId:sid,uidHash:short(actorUids.get('GM1')),instanceId:gm1Instance};
 const gmProof={...gmMember,recoveryPending};
 assert.equal(pc11GmReadiness(gmProof,expectedGm),true,'Original GM must retain the same live owned server-authority instance after ordinary start.');
 const expectedMembers=PC11_NORMAL_START.setup.roles.map(roleId=>{
  const label=Object.keys(roleIds).find(candidate=>roleIds[candidate]===roleId),admitted=admissionActors.get(label);
  assert.ok(admitted,`Expected ${roleId} identity must come from its original normal admission.`);
  return {...admitted};
 });
 const snapshot={...projection,canonicalRoleIds,gm:gmProof,expectedGm,expectedMembers,members:[ownerMember,recipientMember]};
 const readiness=pc11NormalStartPreflight(snapshot);
 assert.deepEqual(readiness,{ready:true,blockers:[]},`Ordinary production start must leave the normal trade/Philia cohort ready: ${JSON.stringify(readiness.blockers)}`);
 states.push({label:'normal-production-start readiness preflight',source:'mounted normal App store plus mounted role preset',canonicalRoleIds,
  occupiedSeatCount:projection.occupiedSeatCount,gmReady:true,expectedRoles:expectedMembers.map(member=>member.roleId),ready:true});
 claims.push('Normal active Cycle 1, cleared briefing, live original GM and two seats match the exact mounted canonical Chart A roster and independently captured admissions');
 return snapshot;
}
startAt=Date.now();({totalEnd,workEnd,executionCapMs:evidence.executionCapMs}=pc11ProofTiming(startAt,Number(process.env.PC11_ALLOCATION_DEADLINE_MS)));evidence.startedAt=new Date(startAt).toISOString();
try{await bounded((async()=>{
 await mark(gmOnly?'launch exactly one normal GM browser':'launch exactly GM/printed-owner/recipient browser surfaces');gm=await launchSurface('browser-A-normal-GM');if(!gmOnly){owner=await launchSurface('browser-B-normal-Engineer');recipient=await launchSurface('browser-C-normal-Captain');}
 await mark('normal GM create and consent');await gm.page.goto(baseUrl);await gm.reducedMotion();const created=await observeUiReceipt({page:gm.page,consumed:{stage},waitForResponse:()=>gm.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/us-central1/createSession')&&r.request().method()==='POST',{timeout:35000}),choose:()=>gm.page.getByRole('button',{name:'Create a session',exact:true}).click()});assert.equal(created.status(),200);creationRequestId=created.request().postDataJSON()?.data?.requestId;assert.match(creationRequestId,/^[\w-]{1,128}$/);const createdBody=await created.json();sid=createdBody.result?.session?.id;joinCode=createdBody.result?.session?.joinCode;assert.match(sid,/^[\w-]{1,128}$/);await register(gm,'GM1');budget();await gm.consent();const initial=await gm.until('Fresh ordinary Cycle0',v=>v.hasAuth&&v.sameActor&&v.sessionId===sid&&v.cycle===0&&v.freshness==='server');joinCode=initial.joinCode;evidence.sessionHash=hash(sid);claims.push('Actual GM normal create/Auth/consent');
 await mark('normal named live GM authorization');await authorizeAndClaim(gm,'GM1','PC11 guidance GM');
 if(gmOnly){assert.equal(actorUids.size,1);assert.equal(browsers.length,1);assert.equal(remoteRequests.length,0);assert.equal(errors.length,0);evidence.status='PC11_GM_STARTUP_ONLY_PASS';evidence.completedAt=new Date().toISOString();return;}
 if(!await gm.page.getByRole('region',{name:'Setup',exact:true}).isVisible()){await gm.page.getByRole('button',{name:/^Open station catalog/}).click();await gm.page.getByRole('link',{name:'GM Console',exact:true}).click();}
 const setup=gm.page.getByRole('region',{name:'Setup',exact:true});await setup.getByRole('button',{name:'Setup',exact:true}).click();await setup.getByLabel('Recommended player count',{exact:true}).selectOption('12');await setup.getByLabel('Star chart',{exact:true}).selectOption('A');await action(gm,'confirmSetup',()=>setup.getByRole('button',{name:'Confirm setup // Confirm roster',exact:true}).click());await gm.until('Legal12 roster confirmed',v=>v.setupConfirmed&&v.activeRoleIds.length===12&&v.activeRoleIds.includes('dione-engineer')&&v.activeRoleIds.includes('dione-president'));claims.push('Normal legal12 configured roster; other seats open; no prepared crew');
 // Legal12 uses separate Engineers; Union craft/starting-host controls are not configured.
 for(const[surface,label]of[[owner,'Owner'],[recipient,'Recipient']]){await mark(`${label} normal join and primary assignment`);await normalJoin(surface,label);const name=(await observeLifecycleActor(surface)).displayName;assert.ok(name);const casting=gm.page.getByRole('region',{name:'Facilitator casting',exact:true});await casting.getByLabel(`Role for ${name}`,{exact:true}).selectOption(roleIds[label]);await action(gm,'assignRole',()=>casting.getByRole('button',{name:`Assign role to ${name}`,exact:true}).click());await memberReady(surface,label,{station:false});await enterRole(surface,label);claims.push(`${label} normal primary assigned role/chooser/seat/SDK authority during Cycle0 casting; no operational berth claim`);}
 await mark('ordinary GM production start');const production=gm.page.locator('fieldset[aria-label="Ordinary production start"]');const started=await action(gm,'startGame',async()=>{await production.getByRole('button',{name:PC11_NORMAL_START.ui.productionButton,exact:true}).click();await production.getByRole('button',{name:'ARE YOU SURE? // ADVANCE TO CYCLE 1',exact:true}).click();});startRequestId=started.data.requestId;assert.match(startRequestId,/^[\w-]{1,128}$/);assert.ok(['committed','replayed'].includes(started.result.status),'Ordinary production start must retain its actual committed UI receipt.');await liveGm(gm,'GM1','active');
 await mark('original GM clears actual Cycle 1 briefing');const briefing=gm.page.getByRole('region',{name:'Cycle briefing clearance',exact:true});const clear=await action(gm,'clearTurnAdvanceInterstitial',()=>briefing.getByRole('button',{name:PC11_NORMAL_START.ui.briefingClearButton,exact:true}).click());assert.ok(['cleared','replayed'].includes(clear.result.status),'The mounted briefing clear must retain its actual UI receipt.');await gm.until('Cycle 1 briefing cleared and clock resumed',v=>v.cycle===1&&v.phase==='active'&&!v.ordinaryBriefingMounted&&!v.ordinaryBriefingHeld);await Promise.all([owner,recipient].map(surface=>surface.paintTwoFrames()));
 await memberReady(owner,'Owner');await memberReady(recipient,'Recipient');await ordinaryStartPreflight();

 await mark('GM-visible physical tabletop baseline attestation');
 evidence.physicalBaselineDisclosure='The actual GM records the two players’ declared physical tabletop counts in the mounted UI; the runner does not observe or seed physical tokens.';
 const baseline=gm.page.getByRole('form',{name:'Physical tabletop baseline',exact:true});
 const balances=n=>({ore:0,fuel:0,food:0,water:0,materials:n,securityTeams:0});
 for(const [surface,label,n] of [[owner,'Owner',2],[recipient,'Recipient',0]]){
  await baseline.getByLabel('Player to attest',{exact:true}).selectOption(actorUids.get(label));
  for(const [field,value] of Object.entries(balances(n)))await baseline.getByLabel(field==='securityTeams'?'Security Teams':field[0].toUpperCase()+field.slice(1),{exact:true}).fill(String(value));
  const result=await action(gm,'attestPlayerHeldTokenBaseline',()=>baseline.getByRole('button',{name:'Record tabletop counts',exact:true}).click());
  assert.equal(result.data.targetUid,actorUids.get(label));assert.equal(result.result.status,'attested');
  assert.deepEqual(await held(surface,label),balances(n));
 }
 await mark('ordinary same-table send and accept one material');
 const trade=owner.page.getByRole('region',{name:'Same-table trade',exact:true});
 const recipientSelector=trade.getByRole('combobox',{name:'Recipient',exact:true});
 async function retainRecipientSelector(){
  const nodes=await trade.locator('select').evaluateAll(selects=>selects.map(select=>({id:select.id,disabled:select.disabled,labelText:[...select.labels].map(label=>label.textContent),options:[...select.options].map(option=>({value:option.value,label:option.textContent,disabled:option.disabled}))})));
  const notices=await trade.locator('.same-table-trade__notice,.same-table-trade__empty').allTextContents();
  const diagnostic={stage,actor:await fullMember(owner),recipientUidHash:short(actorUids.get('Recipient')),notices,selectors:nodes.map(select=>({...select,options:select.options.map(option=>({label:option.label,disabled:option.disabled,valueHash:option.value?short(option.value):null,isExactOriginalRecipient:option.value===actorUids.get('Recipient')}))}))};
  await writeFile(`${directory}/trade-recipient-selector.json`,JSON.stringify(diagnostic,null,2)+'\n',{mode:0o600});
 }
 try{await recipientSelector.selectOption(actorUids.get('Recipient'),{timeout:35000});assert.equal(await recipientSelector.inputValue(),actorUids.get('Recipient'));}
 finally{try{await bounded(retainRecipientSelector(),Math.max(1,Math.min(5000,workEnd-Date.now())),'Recipient selector diagnostic budget');}catch(error){(evidence.tradeDiagnosticErrors??=[]).push({stage:'recipient selector',message:error.message});}}

 await trade.getByLabel('Materials amount',{exact:true}).fill('1');
 const sent=await action(owner,'createSameTableTradeOffer',()=>trade.getByRole('button',{name:'Send exact offer',exact:true}).click());
 assert.equal(sent.result.offer.fromUid,actorUids.get('Owner'));assert.equal(sent.result.offer.toUid,actorUids.get('Recipient'));
 assert.deepEqual(sent.result.offer.quantities,balances(1));
 assert.deepEqual(await held(owner,'Owner'),balances(2));assert.deepEqual(await held(recipient,'Recipient'),balances(0));
 claims.push('Actual exact original-recipient offer created with server-normalized quantities; sending leaves both held inventories unchanged');
 const offer=recipient.page.getByRole('region',{name:'Same-table trade',exact:true}).getByRole('button',{name:/^Accept exact offer from /});
 try{await offer.waitFor();}finally{
  try{
   const diagnostic=await bounded(recipient.page.evaluate(()=>{
    const region=document.querySelector('section.same-table-trade');
    return region?{present:true,text:region.textContent,buttons:[...region.querySelectorAll('button')].map(button=>({name:button.getAttribute('aria-label')||button.textContent,disabled:button.disabled})),
     alerts:[...region.querySelectorAll('[role=alert]')].map(node=>node.textContent)}:{present:false};
   }),Math.max(1,Math.min(5000,workEnd-Date.now())),'Recipient accept DOM diagnostic budget');
   await writeFile(`${directory}/trade-recipient-accept-dom.json`,JSON.stringify({stage,offerId:sent.data.offerId,quantities:sent.result.offer.quantities,diagnostic},null,2)+'\n',{mode:0o600});
  }catch(error){(evidence.tradeDiagnosticErrors??=[]).push({stage:'recipient accept DOM',message:error.message});}
 }
 const accepted=await action(recipient,'acceptSameTableTradeOffer',()=>offer.click());assert.equal(accepted.data.offerId,sent.data.offerId);
 assert.deepEqual(await held(owner,'Owner'),balances(1));assert.deepEqual(await held(recipient,'Recipient'),balances(1));
 await restoredMember(owner,'Owner');await restoredMember(recipient,'Recipient');
 assert.deepEqual(await held(owner,'Owner'),balances(1));assert.deepEqual(await held(recipient,'Recipient'),balances(1));
 claims.push('Offer changes no holdings; exact acceptance moves one material once; both normal reloads retain entitled held balances');
 await mark('Philia current docked owner proposes exact console');
 const before=await ownedWorld();assert.equal(before.control.holderUid,actorUids.get('Owner'));assert.equal(before.docking.length,1);assert.equal(before.docking[0].shipId,'dione');
 await settle(owner,'Owner',before);await settle(recipient,'Recipient',before);
 const proposal=owner.page.getByRole('region',{name:'Permissioned dismantling proposal',exact:true});
 await memberNavigate(owner,'Owner',()=>owner.page.getByRole('link',{name:'Open Philia shuttle console',exact:true}).click(),proposal);
 const options=await proposal.getByRole('combobox',{name:'Undamaged target console',exact:true}).locator('option').evaluateAll(nodes=>nodes.filter(n=>n.value&&!n.disabled).map(n=>n.value));assert.ok(options.length);
 const consoleId=options[0];await proposal.getByRole('combobox',{name:'Undamaged target console',exact:true}).selectOption(consoleId);
 const requested=await action(owner,'proposePermissionedDismantling',()=>proposal.getByRole('button',{name:'Request target-player permission',exact:true}).click());
 assert.equal(requested.data.craftId,'philia');assert.equal(requested.data.targetShipId,'dione');assert.equal(requested.data.targetConsoleId,consoleId);
 assert.deepEqual(await ownedWorld(),before);await settle(owner,'Owner',before);await settle(recipient,'Recipient',before);
 const inbox=recipient.page.getByRole('region',{name:'Permissioned dismantling request',exact:true});await inbox.getByRole('button',{name:'Grant permission',exact:true}).waitFor();
 const granted=await action(recipient,'consentToPermissionedDismantling',()=>inbox.getByRole('button',{name:'Grant permission',exact:true}).click());assert.equal(granted.data.proposalId,requested.data.proposalId);
 assert.deepEqual(await ownedWorld(),before);await settle(owner,'Owner',before);await settle(recipient,'Recipient',before);
 const applied=await action(owner,'applyPermissionedDismantling',()=>proposal.getByRole('button',{name:'Apply consented dismantling',exact:true}).click());assert.equal(applied.data.proposalId,requested.data.proposalId);assert.equal(applied.result.status,'applied');assert.equal(applied.result.materialGain,3);assert.equal(applied.result.targetConsoleId,consoleId);
 const after=await ownedWorld();assert.equal(after.resources.materials,before.resources.materials+3);assert.deepEqual([...after.damage.damagedSystemIds].sort(),[...before.damage.damagedSystemIds,consoleId].sort());
 const unchangedResources={...after.resources,materials:before.resources.materials};assert.deepEqual(unchangedResources,before.resources);assert.deepEqual({...after.damage,damagedSystemIds:before.damage.damagedSystemIds},before.damage);assert.deepEqual(after.control,before.control);assert.deepEqual(after.docking,before.docking);
 await settle(owner,'Owner',after);await settle(recipient,'Recipient',after);
 await restoredMember(owner,'Owner');await restoredMember(recipient,'Recipient');await settle(owner,'Owner',after);await settle(recipient,'Recipient',after);assert.deepEqual(await ownedWorld(),after);
 await memberNavigate(owner,'Owner',()=>owner.page.getByRole('link',{name:'Back to Dione Engineer console',exact:true}).click());assert.match(owner.page.url(),/\/ships\/dione\/roles\/dione-engineer/);
 await owner.page.screenshot({path:`${directory}/Engineer-return.png`});await recipient.page.screenshot({path:`${directory}/President-consent-readback.png`});
 evidence.philia={before,after,consoleId,proposalHash:short(requested.data.proposalId),reloadReadback:true};
 claims.push('Philia request/grant cause no damage/resources change; apply damages exact console and adds3 target materials; both current entitled readbacks and normal reloads agree; visible Engineer return preserves authority');
 assert.equal(actorUids.size,3);assert.equal(browsers.length,3);assert.equal(remoteRequests.length,0);assert.equal(errors.length,0);evidence.status='PC11_THREE_ACTOR_TRADE_PHILIA_PASS';evidence.completedAt=new Date().toISOString();
 })(),workEnd-startAt,'Stop trade/Philia work for allocated deadline and cleanup reserve.',()=>{stopped=true;});
}catch(error){stopped=true;primaryFailure=error;evidence.status=gmOnly?'PC11_GM_STARTUP_ONLY_STOPPED_FIRST_FAILURE':'PC11_THREE_ACTOR_TRADE_PHILIA_STOPPED_FIRST_FAILURE';evidence.failedStage=stage;evidence.originalError=originalProofError(error);evidence.consumedState=consumed;const diagnosticEnd=Math.min(Date.now()+10000,totalEnd-45000);evidence.failureDiagnosticErrors=[];
 for(const surface of surfaces){try{await bounded(snapshot(surface,`${surface.label}-first-failure`),Math.max(1,diagnosticEnd-Date.now()),'Original first-failure snapshot deadline');await surface.page.screenshot({path:`${directory}/${surface.label}-first-failure.png`,timeout:Math.max(1,Math.min(5000,diagnosticEnd-Date.now()))});}catch(failure){evidence.failureDiagnosticErrors.push(originalProofError(failure));}}
 try{if(!gmOnly)evidence.firstFailureWorld=await bounded(ownedWorld(),Math.max(1,diagnosticEnd-Date.now()),'First-failure exact owned trade/Philia witness deadline');}catch(failure){evidence.failureDiagnosticErrors.push(originalProofError(failure));}await retainProofFailure(directory,'pc11-trade-philia',error,{stage,consumed,claims});console.log(JSON.stringify({stoppedAt:stage,message:error.message.slice(0,500),claimsEarned:claims.length}));
} finally {
 stopped=true;
 const cleanup={browsersClosed:0,sessionAbsent:false,joinCodeAbsent:false,deletedOwnPointers:0,deletedOwnAuth:0,otherDataChanged:false,errors:[]};
 const cleanupEnd=totalEnd-1500;
 const cleanupStep = async (label,operation) => {
  if(Date.now()>=cleanupEnd){cleanup.errors.push({label,code:'execution-cap-cleanup-deadline'});return null;}
  try{return await bounded(Promise.resolve().then(operation),cleanupEnd-Date.now(),`Owned cleanup deadline: ${label}`);}
  catch(error){cleanup.errors.push({label,error:originalProofError(error)});return null;}
 };
 await cleanupStep('settle captured original request identities',async()=>{const values=await Promise.all(pendingOriginalIdentities);for(const value of values)if(value.error)throw value.error;});
 if(!sid&&creationRequestId&&actorUids.has('GM1'))await cleanupStep('recover exact original create scope',async()=>{sid=await recoverPc11CreatedSession({db,uid:actorUids.get('GM1'),requestId:creationRequestId});});
 await cleanupStep('settle all owned launches',()=>Promise.allSettled(pendingLaunches));
 for(const browser of browsers)await cleanupStep('close owned browser',async()=>{await browser.close();assert.equal(browser.isConnected(),false);cleanup.browsersClosed++;});
 if(sid) {
  await cleanupStep('remove verified exact owned join-code pointer',async()=>{
   if(!joinCode){const originalSession=await db.doc(`sessions/${sid}`).get();joinCode=originalSession.get('joinCode');}
   assert.equal(typeof joinCode,'string');const ref=db.doc(`joinCodes/${joinCode}`);
   await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.exists){assert.equal(doc.get('sessionId'),sid,'Refuse foreign join-code deletion.');tx.delete(ref);}});
   cleanup.joinCodeAbsent=!(await ref.get()).exists;assert.equal(cleanup.joinCodeAbsent,true);
  });
  await cleanupStep('remove exact owned top-level proof records',async()=>{cleanup.rootRecords=await removePc11OwnedRootRecords({db,uid:actorUids.get('GM1'),sessionId:sid,creationRequestId,startRequestId,instanceId:gm1Instance});});
  await cleanupStep('remove exact owned session subtree',async()=>{const session=await db.doc(`sessions/${sid}`).get();if(session.exists)await db.recursiveDelete(session.ref);cleanup.sessionAbsent=!(await db.doc(`sessions/${sid}`).get()).exists;assert.equal(cleanup.sessionAbsent,true);});
  await cleanupStep('remove verified owned membership pointers',async()=>{
   const pointers=await db.collection('activeMemberships').where('sessionId','==',sid).get();const known=new Set(actorUids.values());assert.ok(pointers.docs.every(doc=>known.has(doc.id))&&pointers.size<=3,'Refuse unknown actor cleanup.');
   await db.runTransaction(async tx=>{const current=await Promise.all(pointers.docs.map(doc=>tx.get(doc.ref)));assert.ok(current.every(doc=>doc.exists&&doc.get('sessionId')===sid));for(const doc of current)tx.delete(doc.ref);});cleanup.deletedOwnPointers=pointers.size;cleanup.remainingOwnPointers=(await db.collection('activeMemberships').where('sessionId','==',sid).get()).size;assert.equal(cleanup.remainingOwnPointers,0);
  });
 }
 for(const uid of actorUids.values())await cleanupStep('remove verified fresh owned Auth identity',async()=>{const user=await getAuth().getUser(uid);assert.ok(Date.parse(user.metadata.creationTime)>=startAt&&Date.parse(user.metadata.creationTime)<=Date.now(),'Refuse Auth identity not born in this fresh run.');await getAuth().deleteUser(uid);cleanup.deletedOwnAuth++;});
 await cleanupStep('read final empty session/player/GM scope',async()=>{const scope=await Promise.all([db.collection('sessions').get(),db.collectionGroup('players').where('connected','==',true).get(),db.collectionGroup('gmInstances').where('connected','==',true).get()]);cleanup.scope={sessions:scope[0].size,connectedPlayers:scope[1].size,connectedGmInstances:scope[2].size};assert.deepEqual(cleanup.scope,{sessions:0,connectedPlayers:0,connectedGmInstances:0});});
 await cleanupStep('terminate own Admin client',()=>db.terminate());
 await cleanupStep('verify source unchanged',async()=>{assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:1000}).trim(),sourceCommit);assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8',timeout:1000}).trim(),'');assert.equal(hash(await readFile(`${root}/functions/lib/index.js`)),evidence.builtFunctionsSha256);evidence.sourceUnchanged=true;});
 evidence.cleanup=cleanup;evidence.actualBrowserProcesses=browsers.length;evidence.actualBrowserContexts=surfaces.length;evidence.maxMountedSurfaces=surfaces.length;evidence.actualAuthenticatedActors=actorUids.size;evidence.actorUidHashes=Object.fromEntries([...actorUids].map(([label,uid])=>[label,short(uid)]));evidence.elapsedIncludingCleanupMs=Date.now()-startAt;evidence.executionCapMet=Date.now()<=totalEnd;evidence.catalogClosureCredit=0;evidence.checkpointOrReleaseCredit=0;
 if(cleanup.errors.length||!evidence.executionCapMet){evidence.gameplayDisposition=evidence.status;evidence.status='PC11_THREE_ACTOR_TRADE_PHILIA_CLEANUP_INCOMPLETE';}
 await writeFile(`${directory}/OWNER_RESULT.json`,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({directory,status:evidence.status,claimsEarned:claims.length,actualAuth:actorUids.size,actualBrowsers:browsers.length,elapsedMs:evidence.elapsedIncludingCleanupMs,cleanup}));process.exitCode=primaryFailure||cleanup.errors.length||!evidence.executionCapMet?1:0;
}
