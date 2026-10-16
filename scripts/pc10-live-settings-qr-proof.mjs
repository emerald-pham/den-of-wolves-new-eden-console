import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {
  assertNormalSettingsJoin,assertOriginalSettingsActor,
  settingsGeometryFailures,settingsTokenFailures,assertStableSettingsBinding,
  assertSettingsReturnUrl,
} from './pc10-live-settings-qr-contracts.mjs';

const VIEWPORTS = Object.freeze([
  {name:'phone320',width:320,height:844},{name:'phone390',width:390,height:844},
  {name:'desktop',width:1440,height:900},{name:'landscape',width:844,height:390},
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_FILES = ['src/components/AppHeader.tsx','src/components/SessionJoinQr.tsx','src/components/SessionReadouts.tsx',
  'src/components/TurnStartAnnouncement.tsx','src/components/Intrusion.tsx','src/components/CycleBriefingClearanceView.tsx',
  'src/hooks/useDialogFocus.ts','src/lib/sessionJoinLink.ts','src/lib/motionPreference.ts',
  'src/styles/intrusion.css','src/styles/cic.css','src/index.css'];
async function sourceBinding(root) {
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const trackedDirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim() !== '';
  const compiled=[];
  async function scan(directory) {
    for (const item of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path=join(directory,item.name);
      if (item.isDirectory()) await scan(path);
      else if (item.isFile()) compiled.push({path:relative(join(root,'functions/lib'),path),sha256:hash(await readFile(path))});
      else throw new Error('Unexpected symlink in compiled runtime binding.');
    }
  }
  await scan(join(root,'functions/lib'));
  assert.ok(compiled.some(file=>file.path==='index.js'),'An existing real Functions build is required.');
  const sourceFiles=await Promise.all(SOURCE_FILES.map(async path=>({path,sha256:hash(await readFile(join(root,path)))})));
  const callbackFiles=await Promise.all(['pc10-live-settings-qr-proof.mjs','pc10-live-settings-qr-contracts.mjs']
    .map(async name=>({name,sha256:hash(await readFile(new URL(name,import.meta.url)))})));
  return {sourceCommit,trackedDirty,compiledTreeSha256:hash(JSON.stringify(compiled)),compiled,sourceFiles,callbackFiles};
}
export class SettingsVisualProofFailure extends Error {
  constructor(path) { super(`Actual Settings visual evidence failed: ${path}`); this.code='PC10_SETTINGS_VISUAL_CONTRACT'; this.evidencePath=path; }
}
const namedError = (code,message) => Object.assign(new Error(message),{code});
const SETTINGS_STAGES = new Set(['source-binding-start','entry-audience','select-roster-actor','selected-actor-ready',
  'normal-transmission-completion',
  'normalize-demo-crew','normalize-manager-stations','focus-private-brief','private-brief-open','private-brief-back',
  'browser-private-back','viewport-capture','final-audience','restore-audience','restore-dialog','restore-controller',
  'restore-roster-actor','restore-entry-route','restore-viewport','restore-media','restore-scroll','restore-source-binding']);
const SETTINGS_ERROR_CATEGORIES = new Map([
  ['PC10_SETTINGS_SOURCE_DRIFT','source'],['PC10_SETTINGS_IDENTITY','identity'],['PC10_SETTINGS_PRIVACY','privacy'],
  ['PC10_SETTINGS_RESTORATION','restoration'],['PC10_SETTINGS_VISUAL_CONTRACT','visual'],
]);
function classifySettingsFailure(error,stage) {
  const code=SETTINGS_ERROR_CATEGORIES.has(error?.code) ? error.code : 'PC10_SETTINGS_PROOF_FAILED';
  const category=SETTINGS_ERROR_CATEGORIES.get(code) ?? (error?.name==='TimeoutError' ? 'timeout'
    : error?.name==='AssertionError' ? 'assertion' : 'operation-failed');
  return {stage:SETTINGS_STAGES.has(stage)?stage:'unknown',code,category};
}

/** Fleet transmission ignores pointer events while painting above Settings.
 * Wait for its normal lifecycle, including any ordinary held briefing, then
 * check the DOM again after two real frames. No clock or presentation changes. */
export async function waitForLiveSettingsPaintReady({page,checkpoint}) {
  const deadline=Date.now()+60_000;
  const remaining=()=>{
    const timeout=deadline-Date.now();
    if(timeout<=0)throw Object.assign(new Error('Normal Settings paint readiness timed out.'),{name:'TimeoutError'});
    return timeout;
  };
  await checkpoint();
  await page.locator('.turn-start-announcement__console').waitFor({state:'detached',timeout:remaining()});
  await page.locator('.turn-interstitial-clear').waitFor({state:'detached',timeout:remaining()});
  await page.waitForFunction(async()=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return !document.querySelector('.turn-start-announcement__console, .turn-interstitial-clear');
  },undefined,{timeout:remaining(),polling:'raf'});
  await checkpoint();
  return {normalTransmissionCompleted:true,paintFrames:2};
}

/** Center through normal scrolling instead of aligning fractional control
 * edges to the viewport boundary; paint the real position before measuring. */
export async function scrollLiveSettingsTargetIntoView(target) {
  await target.evaluate(element=>new Promise(resolve=>{
    element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    requestAnimationFrame(()=>requestAnimationFrame(resolve));
  }));
}

/** Use normal keyboard links without switching the selected authenticated actor.
 * Ship consoles do not have Back; the crew manager is the existing route to it. */
export async function navigateLiveSettingsToConsole({page,checkpoint,onStage=()=>{}}) {
  await checkpoint();
  if (new URL(page.url()).hash!=='#/console') {
    if (new URL(page.url()).hash!=='#/demo-actors') {
      onStage('normalize-demo-crew');
      const crew=page.getByRole('link',{name:'Demo crew',exact:true});
      await crew.focus(); await crew.press('Enter');
      await page.waitForURL(url=>url.hash==='#/demo-actors'); await checkpoint();
    }
    onStage('normalize-manager-stations');
    const back=page.getByRole('link',{name:'Back to stations',exact:true});
    await back.focus(); await back.press('Enter');
    await page.waitForURL(url=>url.hash==='#/console'); await checkpoint();
  }
  onStage('focus-private-brief');
  const brief=page.getByRole('link',{name:'Open private brief',exact:true});
  await brief.focus(); await checkpoint();
  return brief;
}

/** Current actor and Crew controller replace the whole authenticated document.
 * Await that normal navigation before evaluating its SDK/store. Loading time
 * consumes the same sixty-second readiness window used by the caller's until. */
export async function restoreLiveSettingsActor({page,crew,entry,selected,sessionId,joinCode,onStage=()=>{}}) {
  const current=await crew.observe();
  assert.ok(current.sameActor && current.uidHash===selected.uidHash && current.sessionId===sessionId,
    'Restoration requires the original selected actor identity.');
  const previousUrl=new URL(page.url());
  if (entry.profileRoleId==='controller') {
    onStage('restore-controller');
    await page.getByRole('link',{name:'Crew controller',exact:true}).click();
  } else {
    onStage('restore-roster-actor');
    await page.getByLabel('Current actor',{exact:true}).selectOption(entry.profileRoleId);
  }
  const deadline=Date.now()+60_000;
  await page.waitForURL(url=>{
    if (url.origin!==previousUrl.origin || url.pathname!==previousUrl.pathname || url.hash!=='#/demo-actors') return false;
    try { assertSettingsReturnUrl(url.href,{sessionId,roleId:entry.profileRoleId},joinCode); return true; }
    catch { return false; }
  });
  const remaining=deadline-Date.now();
  if (remaining<=0) throw namedError('PC10_SETTINGS_RESTORATION','Original actor navigation exhausted its existing readiness window.');
  return crew.until('Restore original actor after Settings',state=>state.sameActor && state.uidHash===entry.uidHash &&
    state.sessionId===sessionId && state.profileRoleId===entry.profileRoleId && state.connection==='live' && state.freshness==='server',remaining);
}

/** Failure-only metadata captured before restoration can change the document.
 * Its one-second read-only probe cap does not extend any action/SDK deadline. */
export async function captureLiveSettingsFailure({page,stage,error,probeBudgetMs=1000}) {
  const startedAt=Date.now();
  let route='unknown';
  try {
    const hash=new URL(page.url()).hash;
    route=({'#/console':'console','#/brief':'brief','#/demo-actors':'demo-actors','#/':'session-entry'})[hash] ??
      (/^#\/ships\/[a-z0-9_-]+(?:\/(?:roles(?:\/[a-z0-9_-]+)?|observer))?$/i.test(hash)?'ship-console'
        : /^#\/shuttles\/[a-z0-9_-]+$/i.test(hash)?'shuttle-console':'other');
  } catch { /* No URL or query values are serialized. */ }
  const definitions=[['demoCrew','link','Demo crew'],['managerBack','link','Back to stations'],
    ['openPrivateBrief','link','Open private brief'],['settings','button','Settings'],
    ['closeSettings','button','Close settings'],['currentActor','label','Current actor'],
    ['crewController','link','Crew controller']];
  const controls=Object.fromEntries(definitions.map(([key])=>[key,null]));
  const renderingKeys=['briefMounted','briefBackMounted','stationsMounted','crewManagerMounted','escapeMounted',
    'deferredFailureLayoutMounted','screenFadeMounted','screenFadeCrossing','screenFadeExiting'];
  const rendering=Object.fromEntries(renderingKeys.map(key=>[key,null]));
  let renderingProbeStatus='pending';
  const probes=definitions.map(async([key,role,name])=>{
    try {
      const locator=role==='label' ? page.getByLabel(name,{exact:true}) : page.getByRole(role,{name,exact:true});
      const visible=await locator.isVisible();
      controls[key]=typeof visible==='boolean'?visible:null;
    } catch { /* Unavailable probes stay null, never guessed false or true. */ }
  });
  probes.push((async()=>{
    try {
      const value=await page.evaluate(()=>{
        const fade=document.querySelector('.screen-fade');
        const crossing=fade?.getAttribute('data-crossing'),phase=fade?.getAttribute('data-phase');
        return {
          briefMounted:!!document.querySelector('.role-brief-screen'),
          briefBackMounted:!!document.querySelector('.role-brief-screen a[href="#/console"]'),
          stationsMounted:!!document.querySelector('main.fleet-roster'),
          crewManagerMounted:!!document.querySelector('main.demo-actor-manager'),
          escapeMounted:!!document.querySelector('main.escape-state'),
          // This matches the existing deferred route failure layout; no notice
          // text is read and its presence alone does not establish a cause.
          deferredFailureLayoutMounted:!!document.querySelector('.screen-fade main.session-mode > .session-mode__panel > p[role="alert"] + button'),
          screenFadeMounted:!!fade,
          screenFadeCrossing:crossing==='true'?true:crossing==='false'?false:null,
          screenFadeExiting:phase==='out'?true:phase==='in'?false:null,
        };
      });
      for (const key of renderingKeys) rendering[key]=typeof value?.[key]==='boolean'?value[key]:null;
      renderingProbeStatus=Object.values(rendering).some(value=>value===null)?'unavailable':'complete';
    } catch { renderingProbeStatus='unavailable'; }
  })());
  const budget=Number.isSafeInteger(probeBudgetMs) && probeBudgetMs>0 && probeBudgetMs<=1000 ? probeBudgetMs : 1000;
  let timer;
  try {
    const observed=await Promise.race([
      Promise.all(probes).then(()=>({controls:{...controls},probeStatus:Object.values(controls).some(value=>value===null)?'unavailable':'complete',
        rendering:{...rendering},renderingProbeStatus})),
      new Promise(resolve=>{timer=setTimeout(()=>resolve({controls:{...controls},probeStatus:'timed-out',
        rendering:{...rendering},renderingProbeStatus:renderingProbeStatus==='pending'?'timed-out':renderingProbeStatus}),budget);}),
    ]);
    return {...classifySettingsFailure(error,stage),capturePhase:'before-restoration',route,
      startedAt,capturedAt:Date.now(),...observed};
  } finally { clearTimeout(timer); }
}

/** Preserve an original proof error while making restoration failure explicit.
 * The caller's existing failed-status/actor/route gate still prohibits success. */
export async function recordLiveSettingsRestoration({evidence,restore,stage}) {
  try { await restore(); return true; }
  catch (error) {
    evidence.status='failed';
    evidence.restorationFailure=classifySettingsFailure(error,stage());
    return false;
  }
}

/** Additive onStarted callback. It reuses only the parent's actual two surfaces. */
export function createLiveSettingsQrProof({sourceRoot=process.cwd(),actorRoleId,expectedSourceSha}={}) {
  return async function proveLiveSettingsQr({gm,crew,initial,started,roster,directory}) {
    assert.ok(gm?.page && crew?.page && initial?.sessionId && started?.cycle >= 1 && Array.isArray(roster));
    const page=crew.page,root=resolve(sourceRoot),output=resolve(directory,'live-settings-qr');
    const evidencePath=join(output,'evidence.json');
    const base=new URL(page.url());
    assert.ok(['127.0.0.1','localhost'].includes(base.hostname) && base.protocol==='http:','Local parent runtime only.');
    assert.equal(new URL(gm.page.url()).origin,base.origin);
    await mkdir(output,{recursive:true});
    const evidence={schemaVersion:1,evidenceClass:'actual ordinary player UI callback',status:'running',
      actualHumans:0,physicalAttendanceProof:false,newBrowsers:0,newAuthContexts:0,gameplayWrites:0,
      renderedFixtures:false,decoderStatus:'pending separate native pixel decode',captures:[],visualFailures:[]};
    const write=async()=>writeFile(evidencePath,`${JSON.stringify(evidence,null,2)}\n`);
    let identityFailed=false,selected,expected,entry;
    let currentStage='source-binding-start',restorationStage='restore-audience';
    const stage=value=>{currentStage=value;evidence.stage=value;};
    const entryHref=page.url();
    const originalViewport=page.viewportSize(),originalMedia=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
    const originalScroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
    try {
      evidence.bindingStart=await sourceBinding(root);
      if (expectedSourceSha && evidence.bindingStart.sourceCommit !== expectedSourceSha) throw namedError('PC10_SETTINGS_SOURCE_DRIFT','The expected source does not match.');
      assertStableSettingsBinding(evidence.bindingStart,evidence.bindingStart);
      stage('entry-audience');
      entry=await crew.observe();
      assert.ok(entry.hasAuth && entry.sameActor && entry.sessionId===initial.sessionId,'Actual entry identity required.');
      assertSettingsReturnUrl(entryHref,{sessionId:initial.sessionId,roleId:entry.profileRoleId},initial.joinCode);
      assert.equal(await page.getByRole('dialog',{name:'Session settings',exact:true}).count(),0,'Callback enters with Settings closed.');
      selected=roster.find(actor=>actor.roleId===(actorRoleId ?? entry.profileRoleId) && actor.roleId!=='press-officer') ??
        (actorRoleId ? undefined : roster.find(actor=>actor.roleId!=='press-officer'));
      assert.ok(selected,'Select an existing normally admitted core roster actor.');
      expected={sessionId:initial.sessionId,uidHash:selected.uidHash,roleId:selected.roleId};
      stage('select-roster-actor');
      if (entry.uidHash!==selected.uidHash) {
        await page.getByLabel('Current actor',{exact:true}).selectOption(selected.roleId);
        await page.waitForURL(url=>url.searchParams.get('demoActor')===`${initial.sessionId}~${selected.roleId}`);
      }
      const observe=async()=>{
        const state=await crew.observe();
        const granted=await page.evaluate(async()=>{
          const {useSessionStore,selectGmAccessAuthenticated}=await import('/src/store/useSessionStore.ts');
          const current=useSessionStore.getState();
          return {gmAccessAuthenticated:selectGmAccessAuthenticated(current),gmInstanceOwned:current.gmInstance!==null};
        });
        return {...state,...granted};
      };
      stage('selected-actor-ready');
      await crew.until('Original live roster actor for Settings',state=>state.hasAuth && state.sameActor &&
        state.uidHash===selected.uidHash && state.sessionId===initial.sessionId && state.playerRole==='player' &&
        state.connection==='live' && state.freshness==='server' && state.briefMatchesActor && state.briefRoleId===selected.roleId);
      const checkpoint=async()=>{
        const state=await observe();
        try { return assertOriginalSettingsActor(state,expected); }
        catch { identityFailed=true; throw namedError('PC10_SETTINGS_IDENTITY','Original ordinary actor/Auth/private audience changed.'); }
      };
      evidence.originalActor=await checkpoint();
      stage('normal-transmission-completion');
      evidence.paintReadiness=await waitForLiveSettingsPaintReady({page,checkpoint});
      await write();
      // The real private route is visited solely to exercise its existing Back.
      // Its private contents are neither serialized nor captured unmasked.
      const openBrief=await navigateLiveSettingsToConsole({page,checkpoint,onStage:stage});
      stage('private-brief-open'); await openBrief.press('Enter');
      await page.waitForURL(url=>url.hash==='#/brief'); await checkpoint();
      const back=page.getByRole('link',{name:'Back to stations',exact:true});
      stage('private-brief-back');
      await back.focus(); await back.press('Enter'); await page.waitForURL(url=>url.hash==='#/console');
      await checkpoint(); stage('browser-private-back');
      await page.goBack(); await page.waitForURL(url=>url.hash==='#/brief'); await checkpoint();
      await back.focus(); await back.press('Enter'); await page.waitForURL(url=>url.hash==='#/console');
      evidence.back={keyboardBackToStations:true,browserBackRestoredPrivateRoute:true,sameOriginalActor:true};
      await page.emulateMedia({reducedMotion:'reduce'});
      for (const viewport of VIEWPORTS) {
        stage('viewport-capture');
        await checkpoint(); await page.setViewportSize({width:viewport.width,height:viewport.height});
        const settingsButton=page.getByRole('button',{name:'Settings',exact:true});
        await scrollLiveSettingsTargetIntoView(settingsButton);
        const opener=await measure(settingsButton,'Settings');
        const capture={name:viewport.name,viewport,stage:'opener-measured',opener};
        evidence.captures.push(capture); await write();
        await settingsButton.focus(); await settingsButton.press('Enter');
        const dialog=page.getByRole('dialog',{name:'Session settings',exact:true}); await dialog.waitFor();
        const close=dialog.getByRole('button',{name:'Close settings',exact:true});
        const qr=dialog.getByRole('img',{name:`QR code for session ${initial.joinCode}`,exact:true});
        const link=dialog.getByRole('link',{name:`Open join screen for session ${initial.joinCode}`,exact:true});
        const payload={baseHref:page.url(),href:await link.getAttribute('href'),joinCode:initial.joinCode,
          linkName:(await link.innerText()).trim(),qrName:await qr.getAttribute('aria-label'),
          code:(await dialog.locator('.session-badge__code').innerText()).trim()};
        try { evidence.joinPayload={href:assertNormalSettingsJoin(payload),joinCode:initial.joinCode}; }
        catch { identityFailed=true; throw namedError('PC10_SETTINGS_PRIVACY','The actual join alternative violates normal admission privacy.'); }
        capture.paintReadiness=await waitForLiveSettingsPaintReady({page,checkpoint});
        await scrollLiveSettingsTargetIntoView(qr);
        const metrics=await qr.evaluate(element=>{
          const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          const r=element.getBoundingClientRect(),center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,
            bodyWidth:document.body.scrollWidth,dialog:box(element.closest('[role=dialog]')),qr:box(element),
            qrVisibleAtCenter:center===element || element.contains(center),controls:[]};
        });
        metrics.controls.push(opener);
        Object.assign(capture,{stage:'qr-measured',metrics}); await write();
        const png=join(output,`qr-${viewport.name}.png`),screen=join(output,`masked-settings-${viewport.name}.png`);
        const panel=join(output,`settings-panel-${viewport.name}.png`);
        await qr.screenshot({path:png});
        Object.assign(capture,{qrPng:png,qrPngSha256:hash(await readFile(png))}); await write();
        await dialog.screenshot({path:panel,mask:[dialog.locator('input[type=password]')],maskColor:'#04070a'});
        await page.screenshot({path:screen,mask:[page.locator('main'),page.locator('input[type=password]')],maskColor:'#04070a'});
        Object.assign(capture,{screen,panel,
          screenshotPrivacy:'Private main route is masked in viewport image; separate actual Settings panel and public QR crops preserve their rendered controls.'});
        for (const control of await dialog.locator('button,input,select,textarea,a[href]').all()) {
          if (!(await control.isVisible())) continue;
          const checkbox=await control.evaluate(element=>element.matches('input[type=checkbox]'));
          const target=checkbox ? control.locator('xpath=..') : control;
          await scrollLiveSettingsTargetIntoView(target);
          const name=await control.evaluate(element=>element.getAttribute('aria-label') ||
            [...element.labels ?? []].map(label=>label.textContent.trim()).join(' ') || element.textContent.trim());
          metrics.controls.push(await measure(target,name));
          capture.stage='controls-measured'; await write();
        }
        const typography=await dialog.evaluate(element=>{
          const root=getComputedStyle(document.documentElement),sample=(selector,name,expectedColor)=>{
            const style=getComputedStyle(element.querySelector(selector));
            return {name,expectedColor,fontFamily:style.fontFamily,fontSize:parseFloat(style.fontSize),color:style.color};
          };
          return {mono:root.getPropertyValue('--cic-mono').trim(),radius:getComputedStyle(element).borderTopLeftRadius,
            ...Object.fromEntries(['void','ink','amber','cyan'].map(key=>[key,root.getPropertyValue(`--cic-${key}`).trim()])),
            samples:[sample('#settings-title','Settings title','amber'),sample('.session-join-qr h3','Join heading','cyan'),sample('.session-join-qr__link','Join link','cyan')]};
        });
        await close.focus(); await page.keyboard.press('Shift+Tab');
        const trapped=await dialog.evaluate(element=>element.contains(document.activeElement));
        await page.keyboard.press('Tab');
        const focusReturned=await close.evaluate(element=>document.activeElement===element);
        const reduced={media:await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),
          checked:await dialog.getByRole('checkbox',{name:'Reduce motion',exact:true}).isChecked()};
        await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
        const restoredFocus=await settingsButton.evaluate(element=>document.activeElement===element);
        const failures=[...settingsGeometryFailures(metrics),...settingsTokenFailures(typography)];
        if (!trapped || !focusReturned || !restoredFocus) failures.push('Settings keyboard containment or opener focus restoration failed.');
        if (!reduced.media || !reduced.checked) failures.push('Actual reduced-motion preference is not active.');
        Object.assign(capture,{stage:'complete',typography,reduced,keyboard:{trapped,focusReturned,restoredFocus},failures,actor:await checkpoint()});
        evidence.visualFailures.push(...failures.map(message=>({viewport:viewport.name,message})));
        await write();
      }
      stage('final-audience'); evidence.actorAfter=await checkpoint();
      evidence.status=evidence.visualFailures.length ? 'visual-failed' : 'pixels-captured-awaiting-decode';
    } catch (error) {
      evidence.status='failed'; evidence.error={...classifySettingsFailure(error,currentStage),
        message:'Actual Settings callback did not complete; inspect preserved pre-restoration diagnostics and source.'};
      evidence.failureBeforeRestoration=await captureLiveSettingsFailure({page,stage:currentStage,error});
      throw error;
    } finally {
      await recordLiveSettingsRestoration({evidence,stage:()=>restorationStage,restore:async()=>{
        if (!identityFailed && entry && selected && expected) {
          const state=await crew.observe();
          if (state.sameActor && state.uidHash===selected.uidHash && state.sessionId===initial.sessionId) {
            const close=page.getByRole('button',{name:'Close settings',exact:true});
            restorationStage='restore-dialog';
            if (await close.isVisible().catch(()=>false)) await close.press('Escape');
            if (entry.uidHash!==selected.uidHash) await restoreLiveSettingsActor({page,crew,entry,selected,
              sessionId:initial.sessionId,joinCode:initial.joinCode,onStage:value=>{restorationStage=value;}});
            const restored=await crew.observe();
            assert.ok(restored.sameActor && restored.uidHash===entry.uidHash && restored.sessionId===initial.sessionId);
            if (page.url()!==entryHref) {
              restorationStage='restore-entry-route';
              // A normal browser reload keeps this document's original SDK identity.
              // The URL is checked above and carries no capability or credential.
              await page.goto(entryHref);
              await crew.until('Restore original actor UI route',state=>state.sameActor && state.uidHash===entry.uidHash &&
                state.sessionId===initial.sessionId && state.connection==='live' && state.freshness==='server');
            }
            evidence.restoration={sameEntryActor:(await crew.observe()).uidHash===entry.uidHash,sameEntryRoute:page.url()===entryHref};
          } else evidence.restoration={skipped:'Current identity is not the original selected actor.'};
        } else evidence.restoration={skipped:'Fail-closed identity/privacy mismatch.'};
        restorationStage='restore-viewport';
        if (originalViewport) await page.setViewportSize(originalViewport);
        restorationStage='restore-media';
        await page.emulateMedia({reducedMotion:originalMedia?'reduce':'no-preference'});
        restorationStage='restore-scroll';
        if (evidence.restoration?.sameEntryRoute) await page.evaluate(position=>scrollTo(position.x,position.y),originalScroll);
        restorationStage='restore-source-binding';
        evidence.bindingEnd=await sourceBinding(root);
        assertStableSettingsBinding(evidence.bindingStart,evidence.bindingEnd);
      }});
      await write();
    }
    if (evidence.status==='failed' || evidence.restoration?.sameEntryActor!==true || evidence.restoration?.sameEntryRoute!==true) throw namedError('PC10_SETTINGS_RESTORATION','Original UI/source restoration was not verified.');
    if (evidence.visualFailures.length) throw new SettingsVisualProofFailure(evidencePath);
    return evidence;
  };
}

async function measure(locator,name) {
  return locator.evaluate((element,name)=>{
    const r=element.getBoundingClientRect(),center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {name,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
      visibleAtCenter:center===element || element.contains(center)};
  },name);
}
