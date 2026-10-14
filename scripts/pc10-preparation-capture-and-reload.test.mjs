import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { captureP181PreparationPublicUi, p181PreparationTuple,
  runP181StarlightMovementScoutUiProof } from './pc10-starlight-movement-scout-ui-proof.mjs';

// Actual edited source bodies with inert DOM/transport/evidence ports. Geometry
// and screenshot bytes are mocks: this earns no pixel, browser or backend credit.
const sourcePath = 'scripts/pc10-starlight-movement-scout-ui-proof.mjs';
const source = await readFile(sourcePath, 'utf8');
const directory = resolve('source-evidence/preparation-capture-and-reload-20261013',
  process.env.PC10_PREPARATION_CONTROL_RUN_LABEL ?? 'controls-unlabeled');
const checks = [];
const record = (caseName, details) => checks.push({ caseName, observedAtMs: Date.now(), ...details });

function publicPage({ unknown = false, screenshotError, restoreError, mutateDuringCapture,
  stationStatus = 'OPEN', privateSuffix = false, shipOverview = false } = {}) {
  const stationSelector = shipOverview ? '.ship-role-select .role-card' : '.fleet-card__console-link';
  const dom = new JSDOM('<!doctype html><html><head><style>* {background-image:none}</style></head><body>' +
    (unknown ? '<main>PRIVATE_UNRELATED_CONTENT</main>' :
      '<header><span class="indicator"><span>CONNECTED // AWAITING CIC AUTHENTICATION</span></span></header>' +
      '<main' + (shipOverview ? ' class="ship-role-select"' : '') + '><h1 class="role-select__title">' +
      (shipOverview ? 'AEGIS // Station overview' : 'Stations and consoles') + '</h1>' +
      '<a class="' + (shipOverview ? 'role-card' : 'fleet-card__console-link') + '" href="#/ships/aegis/roles/admiral"><span>Admiral</span><span>' + stationStatus +
      '</span>' + (privateSuffix ? '<span>PRIVATE_SUFFIX</span>' : '') + '</a></main>') +
    '<input value="PRIVATE_INPUT_VALUE"><p class="private-brief">PRIVATE_ROLE_CONTENT</p>' +
    '<p>RAW_ACTOR_AND_SESSION_IDENTIFIERS</p><img src="data:image/png;base64,AA==" alt="PRIVATE_IMAGE"></body></html>');
  Object.defineProperty(dom.window.HTMLElement.prototype, 'getClientRects', { value: () => [{ width: 20, height: 20 }] });
  const events = [], screenshotBytes = Buffer.from('mock privacy-redacted screenshot bytes');
  let evaluations = 0;
  const style = node => dom.window.getComputedStyle(node);
  const page = {
    evaluate: async (callback, args) => {
      evaluations += 1; events.push(evaluations === 1 ? 'redact-current-public-dom' : 'restore-original-page');
      if (evaluations > 1 && restoreError) throw restoreError;
      return runInNewContext('(' + String(callback) + ')(__args)', { __args: args,
        document: dom.window.document, getComputedStyle: style, MutationObserver: dom.window.MutationObserver, Date });
    },
    screenshot: async options => {
      events.push('screenshot-redacted-current-page');
      assert.equal(options.fullPage, false); assert.ok(options.timeout > 0);
      assert.equal(style(dom.window.document.querySelector('input')).visibility, 'hidden');
      assert.equal(style(dom.window.document.querySelector('.private-brief')).visibility, 'hidden');
      assert.equal(style(dom.window.document.querySelector('img')).visibility, 'hidden');
      assert.equal(style(dom.window.document.querySelector('.indicator')).visibility, 'visible');
      assert.equal(style(dom.window.document.querySelector(stationSelector)).visibility, privateSuffix ? 'hidden' : 'visible');
      assert.equal(style(dom.window.document.body).visibility, 'hidden');
      assert.equal(style(dom.window.document.documentElement).backgroundImage, 'none');
      if (mutateDuringCapture) {
        const node = dom.window.document.querySelector(stationSelector);
        node.textContent = 'PRIVATE_LATE_ROLE_CONTENT';
        await Promise.resolve(); await Promise.resolve();
        assert.equal(node.hasAttribute('data-p181-public-capture'), false);
        assert.equal(style(node).visibility, 'hidden');
      }
      if (screenshotError) throw screenshotError;
      return screenshotBytes;
    },
  };
  return { surface: { page }, dom, events, screenshotBytes,
    assertRestored() {
      assert.equal(dom.window.document.querySelectorAll('[data-p181-public-capture]').length, 0);
      assert.equal(dom.window.document.querySelectorAll('style[id^="p181-public-"]').length, 0);
      assert.equal(dom.window.document.querySelector('input').value, 'PRIVATE_INPUT_VALUE');
    } };
}

function actualNativeRetention(page, pendingReadiness, { writeError } = {}) {
  const start = source.indexOf('  const retainFirstFailure = async', source.indexOf('export async function runP181StarlightMovementScoutNative('));
  const end = source.indexOf('\n  const previousFirestoreEmulatorHost', start);
  const errorStart = source.indexOf('const safeP181Error =');
  const errorEnd = source.indexOf('\n\nfunction p181Remaining(', errorStart);
  assert.ok(start > 0 && end > start && errorEnd > errorStart);
  const boundedStart = source.indexOf('function p181Remaining(');
  const boundedEnd = source.indexOf('\n/** The original parent', boundedStart);
  const retained = [], writes = [], bounds = [];
  const diagnostic = { active: true, frozen: false, actorRole: 'admiral', surface: page.surface,
    activeAwaitedOperation: 'normal-navigation.station-readiness-consumer', pendingReadiness,
    steps: [{ ordinal: 1, actorRole: 'admiral', operation: 'actual-source-read',
      startedAtMs: Date.now() - 20, completedAtMs: null, status: 'pending' }] };
  const cutoff = Date.now() + 1000;
  const context = { assert, createHash, resolve, Date, setTimeout, clearTimeout,
    fingerprint: value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex'),
    normalPreparationDiagnostic: diagnostic, privateFailureArtifact: null, normalOperationsStopped: false,
    captureP181PreparationPublicUi, directory, sourceCommit: 'source-only-test',
    sourceBindingsBefore: { sourceFiles: {} }, trace: [], remoteRequests: [], pageErrors: [], originalCreate: {},
    cleanupDeadlineAt: cutoff, rememberProofFailure: () => {},
    writeFile: async (_path, bytes, options) => { writes.push({ bytes, options }); if (writeError) throw writeError; },
    retainProofFailure: async (_directory, _label, error, detail) => {
      page.events.push('retain-original-primary'); retained.push({ error, detail });
      return { path: 'mock-original-primary', evidenceWriteFailed: false };
    } };
  context.finalizationBounded = (label, action, deadline) => {
    bounds.push({ label, deadline }); assert.ok(deadline <= cutoff);
    return context.actualBounded(label, action, deadline);
  };
  context.actualBounded = runInNewContext(source.slice(boundedStart, boundedEnd) + '\np181BoundedWork', context);
  const retain = runInNewContext('(() => { ' + source.slice(errorStart,errorEnd) + '\n' + source.slice(start,end) +
    '\nreturn retainFirstFailure; })()', context);
  return { retain, retained, writes, bounds, diagnostic, cutoff };
}

test('public preparation tuple retains held flags and comparisons without private identifiers or content', () => {
  const original = { uidHash: 'PRIVATE_UID_HASH', sessionId: 'PRIVATE_SESSION_ID', meSessionId: 'PRIVATE_SESSION_ID',
    documentTimeOrigin: 1000, fleetGroupId: 'PRIVATE_FLEET_GROUP' };
  const tuple = p181PreparationTuple({ ...original, hasAuth: true, sameActor: true, playerRole: 'player',
    assignedRoleId: 'admiral', activeConsoleRoleId: null, seatId: null, phase: 'casting', cycle: 0,
    connectionGeneration: 1, identityHydrationRevision: 1, freshness: 'server', connection: 'live',
    currentMemberBerthPresent: true, currentMemberBerthNull: true, currentMemberBerthMatches: false,
    sdkHasServerAuthority: true, sdkResumePending: false, invalidFields: [],
    joinCode: 'PRIVATE_JOIN_CODE', privateRoleContent: 'PRIVATE_ROLE_CONTENT', inputValue: 'PRIVATE_INPUT_VALUE' }, original);
  assert.equal(JSON.stringify(tuple).includes('PRIVATE_'), false);
  assert.equal(tuple.sessionIdMatchesOriginal, true); assert.equal(tuple.currentMemberBerthNull, true);
  assert.equal(tuple.assignedRoleId, 'admiral'); assert.ok(Number.isSafeInteger(tuple.sampledAtMs));
  record('safe-held-readiness-tuple', { tuple });
});

test('actual current-page public DOM redaction excludes inputs and private content and restores the owned page', async t => {
  const page = publicPage(); t.after(() => page.dom.window.close());
  const captured = await captureP181PreparationPublicUi(page.surface, Date.now()+500, Date.now()+1000);
  assert.equal(captured.label, 'privacy-redacted current-page diagnostic'); assert.equal(captured.screenshot, page.screenshotBytes);
  assert.equal(JSON.stringify(captured.publicDom).includes('PRIVATE_'), false); assert.equal(captured.publicDom.length, 3);
  assert.match(captured.omissions, /inputs.*private/); page.assertRestored();
  assert.deepEqual(page.events, ['redact-current-public-dom', 'screenshot-redacted-current-page', 'restore-original-page']);
  record('public-dom-redaction-and-restoration', { publicDom: captured.publicDom, omissions: captured.omissions, events: page.events });
});

test('an unknown or private-only current screen fails closed with no raw screenshot fallback', async t => {
  const page = publicPage({ unknown: true }); t.after(() => page.dom.window.close());
  await assert.rejects(captureP181PreparationPublicUi(page.surface, Date.now()+500, Date.now()+1000), /capture unavailable/);
  assert.equal(page.events.includes('screenshot-redacted-current-page'), false); page.assertRestored();
  record('unknown-current-screen-fails-closed', { noScreenshot: true, events: page.events });
});

test('late private mutation of an approved actual public node is hidden before the screenshot port samples it', async t => {
  const page = publicPage({ mutateDuringCapture: true }); t.after(() => page.dom.window.close());
  const captured = await captureP181PreparationPublicUi(page.surface, Date.now()+500, Date.now()+1000);
  assert.equal(JSON.stringify(captured.publicDom).includes('PRIVATE_'), false); page.assertRestored();
  record('late-private-mutation-hidden', { noPrivateMetadata: true, restored: true });
});

test('actual source-shaped adjacent status spans retain only whole public labels and hide private suffixes', async t => {
  for (const stationStatus of ['CLAIMED // READ-ONLY', 'OCCUPIED // READ-ONLY']) {
    const page = publicPage({ stationStatus,shipOverview:stationStatus==='OCCUPIED // READ-ONLY' }); t.after(() => page.dom.window.close());
    const captured = await captureP181PreparationPublicUi(page.surface, Date.now()+500, Date.now()+1000);
    assert.equal(captured.publicDom.find(row => row.kind === 'station').text, 'Admiral ' + stationStatus); page.assertRestored();
    record('adjacent-'+stationStatus, { canonicalPublicLabel: 'Admiral ' + stationStatus });
  }
  const page = publicPage({ privateSuffix:true }); t.after(() => page.dom.window.close());
  const captured = await captureP181PreparationPublicUi(page.surface, Date.now()+500, Date.now()+1000);
  assert.equal(captured.publicDom.some(row => row.kind === 'station'), false);
  assert.equal(JSON.stringify(captured.publicDom).includes('PRIVATE_SUFFIX'), false); page.assertRestored();
  record('private-suffix-denied', { publicStationOmitted:true, screenshotNodeHidden:true });
});

test('actual before-cleanup retention preserves original timeout identity and current actor with safe capture failure', async t => {
  const page = publicPage({ screenshotError: new Error('PRIVATE_CAPTURE_ERROR') }); t.after(() => page.dom.window.close());
  const held = { connectionGeneration: 2, identityHydrationRevision: 1, currentMemberBerthNull: false,
    currentMemberBerthMatches: true, sdkResumePending: true };
  const consumer = actualNativeRetention(page, held);
  const original = Object.assign(new Error('original prepare timeout'), { name: 'TimeoutError' });
  let cleaned = 0;
  await assert.rejects(runP181StarlightMovementScoutUiProof({ proofProfile: 'wing-bays',
    initial: { phase: 'lobby', cycle: 0, setupConfirmed: false }, absoluteDeadlineMs: Date.now()+500,
    cleanupDeadlineMs: consumer.cutoff, io: { prepareNormalSession: async () => { throw original; },
      observeWingBayActors: async () => {}, observeWingBayState: async () => {}, performWingBayMaintenanceAction: async () => {},
      retainFirstFailure: consumer.retain,
      cleanupOwnedResources: async ({ firstError, deadlineAt }) => {
        assert.equal(firstError, original); assert.equal(deadlineAt, consumer.cutoff); page.assertRestored();
        assert.equal(consumer.retained[0].error, original); page.events.push('owned-cleanup'); cleaned += 1;
        return { status: 'owned-cleanup-complete' };
      } } }), error => error === original);
  assert.equal(cleaned, 1); assert.equal(consumer.retained.length, 1); assert.equal(consumer.writes.length, 0);
  const diagnostic = consumer.retained[0].detail.normalPreparationDiagnostic;
  assert.equal(diagnostic.actorRole, 'admiral'); assert.deepEqual(diagnostic.pendingReadiness, held);
  assert.equal(diagnostic.publicUiCapture.status, 'failed-closed'); assert.equal(diagnostic.publicUiCapture.rawPageFallback, false);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE_CAPTURE_ERROR'), false); assert.equal(consumer.diagnostic.frozen, true);
  assert.ok(page.events.indexOf('restore-original-page') < page.events.indexOf('owned-cleanup'));
  record('capture-failure-keeps-primary-before-cleanup', { errorIdentityPreserved: true, actorRole: diagnostic.actorRole,
    safeCapture: diagnostic.publicUiCapture, events: page.events, cutoff: consumer.cutoff });
});

test('successful current-actor diagnostic retention freezes held timestamps before one owned cleanup', async t => {
  const page = publicPage(); t.after(() => page.dom.window.close()); const consumer = actualNativeRetention(page, { sdkResumePending: true });
  const original = new Error('original finite preparation failure'); await consumer.retain(original, { deadlineAt: consumer.cutoff });
  page.assertRestored(); assert.equal(consumer.retained[0].error, original); assert.equal(consumer.writes.length, 1);
  assert.equal(consumer.writes[0].options.flag, 'wx'); assert.equal(consumer.writes[0].options.mode, 0o600);
  const diagnostic = consumer.retained[0].detail.normalPreparationDiagnostic;
  assert.equal(diagnostic.publicUiCapture.actorRole, 'admiral'); assert.equal(diagnostic.publicUiCapture.renderedOrUsabilityAcceptance, false);
  assert.equal(diagnostic.publicUiCapture.sha256, createHash('sha256').update(page.screenshotBytes).digest('hex'));
  assert.equal(diagnostic.steps[0].completedAtMs, null); assert.ok(diagnostic.frozenAtMs >= diagnostic.steps[0].startedAtMs);
  consumer.diagnostic.steps[0].status = 'later-source-change'; assert.equal(diagnostic.steps[0].status, 'pending');
  record('successful-private-diagnostic-retention', { actorRole: diagnostic.actorRole, steps: diagnostic.steps,
    captureLabel: diagnostic.publicUiCapture.label, originalErrorIdentity: true });
});

test('capture restoration and finite capture cutoff failures cannot replace the original primary failure', async t => {
  for (const mode of ['restore-failure', 'expired-cutoff']) {
    const page = publicPage({ ...(mode === 'restore-failure' ? { restoreError: new Error('PRIVATE_RESTORE_ERROR') } : {}) });
    t.after(() => page.dom.window.close()); const consumer = actualNativeRetention(page, { sdkResumePending: true });
    const original = new Error('original finite failure');
    let artifact, cleanupCalls = 0;
    await assert.rejects(runP181StarlightMovementScoutUiProof({ proofProfile:'wing-bays',
      initial:{ phase:'lobby',cycle:0,setupConfirmed:false },absoluteDeadlineMs:Date.now()+500,cleanupDeadlineMs:consumer.cutoff,
      io:{ prepareNormalSession:async()=>{throw original;},observeWingBayActors:async()=>{},observeWingBayState:async()=>{},
        performWingBayMaintenanceAction:async()=>{},retainFirstFailure:async error=>{
          assert.equal(error,original);artifact=await consumer.retain(error,{deadlineAt:mode==='expired-cutoff'?Date.now()-1:consumer.cutoff});
        },cleanupOwnedResources:async({firstError,deadlineAt})=>{
          assert.equal(firstError,original);assert.equal(deadlineAt,consumer.cutoff);cleanupCalls+=1;
          return {status:'owned-cleanup-complete'};
        } } }),error=>error===original);
    assert.equal(cleanupCalls,1);
    if (mode === 'expired-cutoff') page.assertRestored();
    if(mode==='expired-cutoff') {assert.equal(artifact.evidenceWriteFailed,true);assert.equal(consumer.retained.length,0);}
    else {assert.equal(consumer.retained[0].error,original);assert.equal(consumer.retained[0].detail.normalPreparationDiagnostic.publicUiCapture.rawPageFallback,false);}
    assert.equal(consumer.writes.length, 0);
    assert.ok(consumer.bounds.every(row => row.deadline <= consumer.cutoff));
    record(mode, { primaryIdentityPreserved: true, screenshotWritten: false, bounds: consumer.bounds });
  }
});

test('actual preparation read entry follows GM member and Admiral surfaces and clears a previous actor tuple', async () => {
  const start = source.indexOf('  const markPreparationActor =');
  const end = source.indexOf('\n  const bounded =', start);
  const readStart = source.indexOf('  const readFullActor =',source.indexOf('export async function runP181StarlightMovementScoutNative('));
  const readEnd = source.indexOf('\n  const waitForFullActor =',readStart);
  assert.ok(start > 0 && end > start && readEnd > readStart);
  const gm={},wingCommander={},admiral={};
  const diagnostic={active:true,frozen:false,actorRole:'admiral',surface:admiral,pendingReadiness:{sdkResumePending:true},steps:[]};
  const context={normalPreparationDiagnostic:diagnostic,gm,wingCommander,admiral,Date,p181PreparationTuple,
    P181_NORMAL_SETUP:{roleIds:[]},operationDeadline:()=>Date.now()+1000,
    bounded:async(_label,operation,_deadline,hold)=>{const result=await operation();hold?.(result);return result;},
    observeFullGameDemoPresentationMember:async surface=>{
      assert.equal(diagnostic.surface,surface);assert.equal(diagnostic.pendingReadiness,null);
      return {connectionGeneration:2,identityHydrationRevision:1,sdkResumePending:true,invalidFields:[]};
    }};
  const read=runInNewContext('(() => {'+source.slice(start,end)+'\n'+source.slice(readStart,readEnd)+'\nreturn readFullActor;})()',context);
  for(const [surface,role] of [[gm,'gm'],[wingCommander,'wing-commander'],[admiral,'admiral']]) {
    await read(surface);assert.equal(diagnostic.actorRole,role);assert.equal(diagnostic.activeAwaitedOperation,'readFullActor.await-member-read');
    assert.equal(diagnostic.pendingReadiness.connectionGeneration,2);
    record('current-preparation-actor-'+role,{tupleMatchesCurrentActor:true,oldTupleCleared:true});
  }
});

test('completed preparation history cannot become the current actor screenshot or readiness tuple', async t => {
  const page=publicPage();t.after(()=>page.dom.window.close());const consumer=actualNativeRetention(page,{sdkResumePending:true});
  consumer.diagnostic.active=false;consumer.diagnostic.completedAtMs=Date.now()-1;
  const originalError=new Error('later non-preparation failure');await consumer.retain(originalError,{deadlineAt:consumer.cutoff});
  const diagnostic=consumer.retained[0].detail.normalPreparationDiagnostic;
  assert.equal(consumer.retained[0].error,originalError);assert.equal(diagnostic.activeAtFailure,false);
  assert.equal(diagnostic.actorRole,null);assert.equal(diagnostic.pendingReadiness,null);assert.equal(diagnostic.activeAwaitedOperation,null);
  assert.equal(diagnostic.completedHistory.lastActorRole,'admiral');assert.equal(diagnostic.publicUiCapture.reason,'preparation-inactive');
  assert.equal(page.events.includes('screenshot-redacted-current-page'),false);assert.equal(consumer.writes.length,0);
  record('inactive-preparation-capture-denied',{historyRetained:true,noStaleScreenshot:true,currentActor:null});
});

const uid = 'mock-original-admiral', sessionId = 'mock-source-session', roleId = 'admiral';
const uidHash = createHash('sha256').update(uid).digest('hex').slice(0,16);
const original = { documentTimeOrigin: 1000, hasAuth: true, sameActor: true, uidHash, sessionId, meSessionId: sessionId,
  profileRoleId: null, profileSessionId: null, playerRole: 'player', fleetGroupId: 'fleet-1', connected: true,
  assignedRoleId: null, activeConsoleRoleId: null, seatId: null, replacementRoleId: null, replacementStatus: null,
  kicked: false, escapeLocked: false, phase: 'casting', cycle: 0, setupConfirmed: true, memberScopeMatches: true,
  connectionGeneration: 1, identityHydrationRevision: 1, connection: 'live', freshness: 'server', invalidFields: [], fullGameDemo: null,
  currentOwnPlayerConfirmed: true, currentCanonicalSeatOwned: false, currentMemberBerthPresent: true,
  currentMemberBerthNull: true, currentMemberBerthMatches: false, sdkHasServerAuthority: true, sdkResumePending: false };
const current = { ...original, documentTimeOrigin: 2000, assignedRoleId: roleId, connectionGeneration: 2,
  identityHydrationRevision: 1, currentMemberBerthNull: false, currentMemberBerthMatches: true };
const assignment = { endpoint: 'assignRole', httpStatus: 200,
  before: { sessionId, playerRole: 'gm', uidHash: 'a'.repeat(16), gmInstanceOwned: true, instanceId: 'mock-gm-instance', setupRevision: 1 },
  data: { sessionId, targetUid: uid, roleId, instanceId: 'mock-gm-instance', expectedSetupRevision: 1 },
  result: { sessionId, setupRevision: 2 } };
async function navigation(t, label, { noReceipt = false, status = 200, replyUid = uid, replyGeneration = 2 } = {}) {
  const events = new EventEmitter(); const page = { url: () => 'http://127.0.0.1:5178/#/console',
    on: (name, callback) => events.on(name, callback), off: (name, callback) => events.off(name, callback) };
  const observer = createMemberNavigationResumeObserver(page, { directory: resolve(directory,label), roleId,
    deadlineAt: Date.now()+1000, proofProfile: 'wing-bays', memberContract: 'pc11-live-base', transition: 'casting-assignment',
    documentReload: true, expectedGmUidHash: assignment.before.uidHash, expectedGmInstanceId: assignment.before.instanceId });
  t.after(() => observer.finish()); await observer.prepare(original);
  const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5051/demo-mock/us-central1/resumeSession',
    postDataJSON: () => ({ data: { sessionId } }) };
  const deliver = () => { events.emit('request', request); events.emit('response', {
    request: () => request, url: request.url, status: () => status, json: async () => ({ result: {
      session: { id: sessionId }, player: { uid: replyUid, sessionId, role: 'player', fleetGroupId: 'fleet-1', assignedRoleId: roleId,
        activeConsoleRoleId: null, seatId: null, replacementRoleId: null, replacementStatus: null, connectionGeneration: replyGeneration } } }) }); };
  if (!noReceipt) deliver();
  return { observer, events, deliver, accept: (value, reread = value) => observer.accept(original,value,async () => reread,assignment) };
}

test('reload member acceptance waits for actual positive projection and SDK fence and keeps positive loss before pin terminal', async t => {
  const { observer, accept } = await navigation(t,'positive-and-fence');
  assert.equal(await accept({ ...current, sdkResumePending: true }), false);
  assert.throws(() => observer.sample({ ...current, currentMemberBerthPresent: false, currentMemberBerthMatches: false }), /positive berth was retired/);
  record('positive-before-fence-loss-terminal', { pendingGrantsAuthority: false, missingBerthRejected: true });
});

test('reload cannot accept a current canonical null at the captured resumed lease or a positive epoch without its receipt', async t => {
  const { observer } = await navigation(t,'canonical-null');
  assert.throws(() => observer.sample({ ...current, currentMemberBerthNull: true, currentMemberBerthMatches: false }), /resumed canonical berth was null/);
  const absent = await navigation(t,'no-captured-receipt',{ noReceipt: true });
  await assert.rejects(absent.accept(current), /without its captured normal resume receipt/);
  record('canonical-null-and-no-receipt-denied', { canonicalNullTerminal: true, noReceiptDenied: true });
});

test('explicit reload binding denies foreign actor session document group role scope and lease instead of repinning', async t => {
  for (const [label, mutation] of [
    ['actor', { uidHash: 'b'.repeat(16) }], ['session', { sessionId: 'foreign', meSessionId: 'foreign' }],
    ['old-document', { documentTimeOrigin: 1000 }], ['group', { fleetGroupId: 'fleet-2' }],
    ['role', { assignedRoleId: 'wing-commander' }], ['scope', { memberScopeMatches: false }],
    ['lease', { connectionGeneration: 3 }], ['disconnected', { connected: false }],
    ['kicked', { kicked: true }], ['replacement', { replacementRoleId: 'admiral' }],
  ]) {
    const { observer } = await navigation(t,label); assert.throws(() => observer.sample({ ...current,...mutation }), /changed its actor, document, role, scope or lease/);
    record('bound-'+label, { rejected: true });
  }
  const { observer } = await navigation(t,'second-document'); observer.sample({ ...current, sdkResumePending: true });
  assert.throws(() => observer.sample({ ...current, documentTimeOrigin: 3000 }), /explicitly reloaded document/);
  record('no-second-document-adoption', { rejected: true });
});

test('real request receipt consumer rejects HTTP denial wrong reply actor lease and a second captured resume', async t => {
  for (const [label, options] of [['http-denial',{ status:403 }], ['reply-actor',{ replyUid:'foreign' }], ['reply-lease',{ replyGeneration:3 }]]) {
    const f = await navigation(t,label,options); await assert.rejects(f.accept(current), /HTTP 200|changed its actor/);
    record(label, { rejected: true });
  }
  const f = await navigation(t,'second-resume');
  const second = { method: () => 'POST', url: () => 'http://127.0.0.1:5051/demo-mock/us-central1/resumeSession',
    postDataJSON: () => ({ data: { sessionId } }) };
  f.events.emit('request',second); assert.equal(f.observer.resumeRequestCount(),2);
  await assert.rejects(f.accept(current), /multiple normal resume requests/);
  record('single-captured-resume-ceiling', { requests:2, rejected:true });
});

test('actual helper preserves the original finite deadline and rejects a second document during its settled reread', async t => {
  const f = await navigation(t,'settled-document-change');
  await assert.rejects(f.accept(current,{ ...current, documentTimeOrigin:3000 }), /explicitly reloaded document/);
  const events = new EventEmitter();
  const observer = createMemberNavigationResumeObserver({ on:(name,cb)=>events.on(name,cb), off:(name,cb)=>events.off(name,cb),
    url:()=> 'http://127.0.0.1:5178/#/console' }, { directory: resolve(directory,'expired-helper'), roleId,
    deadlineAt: Date.now()-1, proofProfile:'wing-bays',memberContract:'pc11-live-base',transition:'casting-assignment',documentReload:true,
    expectedGmUidHash:assignment.before.uidHash,expectedGmInstanceId:assignment.before.instanceId });
  t.after(()=>observer.finish()); await observer.prepare(original);
  await assert.rejects(observer.accept(original,current,async()=>current,assignment), /deadline expired/);
  record('original-helper-cutoff-and-settled-document', { deadlineNotExtended:true, secondDocumentDenied:true });
});

after(async () => {
  await mkdir(directory,{ recursive:true,mode:0o700 });
  const hashes = await Promise.all([sourcePath,'scripts/pc10-member-navigation-resume.mjs',
    'scripts/pc10-preparation-capture-and-reload.test.mjs'].map(async path => {
    const bytes=await readFile(path); return { path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length };
  }));
  await writeFile(resolve(directory,'focused-control-trace.json'),JSON.stringify({ runtime:process.version,
    sourceBase:'f141da68e45a9f52c9330c8b8baa544823f5c695',sourceOnly:true,hashes,checks,
    limits:['Actual edited consumer bodies; constructed observation/transport ports outside the separately mounted App case.',
      'JSDOM geometry/CSS and screenshot byte ports cannot establish browser pixel redaction, native Auth, backend, gameplay or release acceptance.'] },null,2)+'\n',
  { flag:'wx',mode:0o600 });
});
