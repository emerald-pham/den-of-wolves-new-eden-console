import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';

// Native procedure contracts only; these surfaces provide no gameplay/Auth evidence.
const contracts = () => import('./pc10-base-combat-deduction-contracts.mjs');
const actor = (changes = {}) => ({ hasAuth: true, sessionId: 'native-session', uidHash: 'native-executive',
  profileRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', playerRole: 'player',
  cycle: 1, phase: 'active', sameActor: true, connection: 'live', freshness: 'server', ...changes });
const gm = (changes = {}) => actor({ uidHash: 'native-gm', profileRoleId: 'gm', playerRole: 'gm',
  activeConsoleRoleId: null, instanceId: 'native-instance', gmInstanceOwned: true, ...changes });

function researchRouteFixture({ route = '#/ships/shepherd/roles/shepherd-scientist', missing = false } = {}) {
  const calls = [];
  const page = {
    url: () => `http://127.0.0.1:5174/${route}`,
    getByRole: (kind, options) => {
      assert.equal(kind, 'link');
      assert.deepEqual(options, { name: 'Open Endeavour shuttle console', exact: true });
      return {
        waitFor: async () => { calls.push('wait-link'); if (missing) throw new Error('normal-link deadline'); },
        click: async () => { calls.push('click-link'); route = '#/shuttles/endeavour'; },
      };
    },
    waitForURL: async predicate => {
      calls.push('wait-route');
      assert.equal(predicate(new URL(page.url())), true);
    },
  };
  return { page, calls, checkpoint: async () => { calls.push('original-actor'); } };
}

test('required research navigation waits for the normal Endeavour link and exact route before credit', async () => {
  const { openBaseEndeavourResearchRoute } = await contracts();
  assert.equal(typeof openBaseEndeavourResearchRoute, 'function');
  const fixture = researchRouteFixture();
  await openBaseEndeavourResearchRoute(fixture);
  assert.deepEqual(fixture.calls, ['original-actor', 'wait-link', 'original-actor', 'click-link', 'wait-route', 'original-actor']);
});

test('an already mounted Endeavour route preserves original actor checks without another navigation', async () => {
  const { openBaseEndeavourResearchRoute } = await contracts();
  assert.equal(typeof openBaseEndeavourResearchRoute, 'function');
  const fixture = researchRouteFixture({ route: '#/shuttles/endeavour' });
  await openBaseEndeavourResearchRoute(fixture);
  assert.deepEqual(fixture.calls, ['original-actor', 'original-actor']);
});

test('changed original Scientist authority after link readiness prevents the research navigation click', async () => {
  const { openBaseEndeavourResearchRoute } = await contracts();
  assert.equal(typeof openBaseEndeavourResearchRoute, 'function');
  const fixture = researchRouteFixture();
  let checks = 0;
  fixture.checkpoint = async () => { fixture.calls.push('original-actor'); if (++checks === 2) throw new Error('original actor changed'); };
  await assert.rejects(openBaseEndeavourResearchRoute(fixture), /original actor changed/);
  assert.deepEqual(fixture.calls, ['original-actor', 'wait-link', 'original-actor']);
});

test('a missing normal Endeavour link fails within its existing locator deadline without route bypass', async () => {
  const { openBaseEndeavourResearchRoute } = await contracts();
  assert.equal(typeof openBaseEndeavourResearchRoute, 'function');
  const fixture = researchRouteFixture({ missing: true });
  await assert.rejects(openBaseEndeavourResearchRoute(fixture), /normal-link deadline/);
  assert.deepEqual(fixture.calls, ['original-actor', 'wait-link']);
});

const researchWorkspace = () => ({ tracks: [{ trackId: 'wolf-agent-detector', name: 'Wolf Agent Detector',
  crossedBoxes: 0, totalBoxes: 5, complete: false, currentMaterialCost: 5 }],
  cadence: { choices: [] }, shepherdOre: 8, scienceDevices: { detectorBuilt: false } });
const researchPaint = () => ({ busy: 'false', progressVisible: true, detectorVisible: false,
  rows: ['Wolf Agent Detector: 0 of 5 boxes crossed; next field-upgrade cost is 5 materials. Available for a research choice.'],
  text: 'CYCLE CHOICES: 0 OF 3 STANDARD; 0 OF 2 ADDITIONAL. SHEPHERD // 8 ORE AVAILABLE' });

test('actual CIC uppercase research paint matches the same authoritative numeric state', async () => {
  const { baseResearchPaintMatches } = await contracts();
  assert.equal(typeof baseResearchPaintMatches, 'function');
  assert.equal(baseResearchPaintMatches(researchPaint(), researchWorkspace()), true);
  assert.equal(baseResearchPaintMatches({ ...researchPaint(), text: researchPaint().text.toLowerCase() }, researchWorkspace()), true);
});

test('research paint cannot credit stale boxes, current field cost, cadence or Shepherd ore', async () => {
  const { baseResearchPaintMatches } = await contracts();
  assert.equal(typeof baseResearchPaintMatches, 'function');
  for (const changed of [
    { rows: [researchPaint().rows[0].replace('0 of 5', '1 of 5')] },
    { rows: [researchPaint().rows[0].replace('5 materials', '4 materials')] },
    { text: researchPaint().text.replace('0 OF 3', '1 OF 3') },
    { text: researchPaint().text.replace('0 OF 2', '1 OF 2') },
    { text: researchPaint().text.replace('8 ORE', '7 ORE') },
  ]) assert.equal(baseResearchPaintMatches({ ...researchPaint(), ...changed }, researchWorkspace()), false);
});

test('loading, unpainted progress or absent source detector track cannot count as research readiness', async () => {
  const { baseResearchPaintMatches } = await contracts();
  assert.equal(typeof baseResearchPaintMatches, 'function');
  for (const changed of [{ busy: 'true' }, { busy: null }, { progressVisible: false }, { rows: [] }])
    assert.equal(baseResearchPaintMatches({ ...researchPaint(), ...changed }, researchWorkspace()), false);
  assert.equal(baseResearchPaintMatches(researchPaint(), { ...researchWorkspace(), tracks: [] }), false);
});

test('a paid research receipt requires its matching visible consequence in the same research paint', async () => {
  const { baseResearchPaintMatches } = await contracts();
  assert.equal(typeof baseResearchPaintMatches, 'function');
  assert.equal(baseResearchPaintMatches(researchPaint(), researchWorkspace(), { status: 'committed' }), false);
  for (const notice of ['WOLF AGENT DETECTOR ADVANCED ONE RESEARCH BOX.', 'Wolf Agent Detector research request was confirmed.'])
    assert.equal(baseResearchPaintMatches({ ...researchPaint(), text: researchPaint().text + ' ' + notice }, researchWorkspace(), { status: 'committed' }), true);
});

test('completed Detector research also requires the actual eligible Detector panel to be mounted', async () => {
  const { baseResearchPaintMatches } = await contracts();
  assert.equal(typeof baseResearchPaintMatches, 'function');
  const workspace = researchWorkspace();
  workspace.tracks[0] = { ...workspace.tracks[0], crossedBoxes: 5, complete: true, currentMaterialCost: 10 };
  workspace.scienceDevices.detectorBuilt = true;
  const paint = { ...researchPaint(), rows: ['Wolf Agent Detector: 5 of 5 boxes crossed; current purchase cost is 10 materials. Research complete.'] };
  assert.equal(baseResearchPaintMatches(paint, workspace), false);
  assert.equal(baseResearchPaintMatches({ ...paint, detectorVisible: true }, workspace), true);
});

test('source research paint follows unavailable early purchases and retained completion prices', async () => {
  const { baseResearchPaintMatches } = await contracts();
  for (const [crossedBoxes, currentMaterialCost] of [[1, null], [2, null], [3, 18], [4, 12], [5, 10]]) {
    const complete = crossedBoxes === 5;
    const workspace = researchWorkspace();
    workspace.tracks[0] = { ...workspace.tracks[0], crossedBoxes, currentMaterialCost, complete };
    const cost = currentMaterialCost === null ? 'purchase unavailable.'
      : complete ? `current purchase cost is ${currentMaterialCost} materials.`
        : `next field-upgrade cost is ${currentMaterialCost} materials.`;
    const paint = { ...researchPaint(), rows: [`Wolf Agent Detector: ${crossedBoxes} of 5 boxes crossed; ${cost} ${complete ? 'Research complete.' : 'Available for a research choice.'}`] };
    assert.equal(baseResearchPaintMatches(paint, workspace), true, `Actual current ${crossedBoxes}-cross unbuilt paint must match.`);
    assert.equal(baseResearchPaintMatches({ ...paint, rows: [paint.rows[0].replace(cost, 'purchase unavailable.')] },
      { ...workspace, tracks: [{ ...workspace.tracks[0], currentMaterialCost: 10 }] }), false);
  }
});

test('source research paint requires the paid Detector mount independently of research completion', async () => {
  const { baseResearchPaintMatches } = await contracts();
  for (const [crossedBoxes, currentMaterialCost] of [[3, 18], [5, 10]]) {
    const complete = crossedBoxes === 5;
    const workspace = researchWorkspace();
    workspace.tracks[0] = { ...workspace.tracks[0], crossedBoxes, currentMaterialCost, complete };
    const row = `Wolf Agent Detector: ${crossedBoxes} of 5 boxes crossed; ${complete ? 'current purchase' : 'next field-upgrade'} cost is ${currentMaterialCost} materials. ${complete ? 'Research complete.' : 'Available for a research choice.'}`;
    const paint = { ...researchPaint(), rows: [row] };
    assert.equal(baseResearchPaintMatches(paint, workspace), true);
    assert.equal(baseResearchPaintMatches({ ...paint, detectorVisible: true }, workspace), false);
    workspace.scienceDevices.detectorBuilt = true;
    assert.equal(baseResearchPaintMatches(paint, workspace), false);
    assert.equal(baseResearchPaintMatches({ ...paint, detectorVisible: true }, workspace), true);
  }
});

test('source research paint cannot infer construction from missing or malformed private construction state', async () => {
  const { baseResearchPaintMatches } = await contracts();
  for (const scienceDevices of [undefined, null, {}, { detectorBuilt: 'true' }]) {
    assert.equal(baseResearchPaintMatches(researchPaint(), { ...researchWorkspace(), scienceDevices }), false);
  }
});

test('source research cadence requires the chosen status rather than an old available-choice row', async () => {
  const { baseResearchPaintMatches } = await contracts();
  assert.equal(typeof baseResearchPaintMatches, 'function');
  const workspace = researchWorkspace(); workspace.cadence.choices = [{ trackId: 'wolf-agent-detector', funding: 'standard' }];
  const paint = { ...researchPaint(), text: researchPaint().text.replace('0 OF 3', '1 OF 3') };
  assert.equal(baseResearchPaintMatches(paint, workspace), false);
  assert.equal(baseResearchPaintMatches({ ...paint, rows: [paint.rows[0].replace('Available for a research choice.', 'Chosen this cycle.')] }, workspace), true);
});

test('a confirmed loyalty UI receipt needs no recovery click before the next private assignment', async()=>{
 const {waitForBaseLoyaltyUiReceipt}=await contracts();
 assert.equal(typeof waitForBaseLoyaltyUiReceipt,'function');
 let retries=0;
 const result=await waitForBaseLoyaltyUiReceipt({original:gm(),inspect:async()=>gm(),
  inspectUi:async()=>({confirmed:true,retryReady:false}),retry:async()=>{retries++;}});
 assert.deepEqual(result,{visibleConsequence:true,exactUiRetries:0});assert.equal(retries,0);
});

test('an uncertain loyalty panel finishes only its exact original visible retry and receipt',async()=>{
 const {waitForBaseLoyaltyUiReceipt}=await contracts();
 assert.equal(typeof waitForBaseLoyaltyUiReceipt,'function');
 let retries=0;
 const receipt={sessionId:'native-session',setupRevision:4,assignedUids:['native-target']};
 const result=await waitForBaseLoyaltyUiReceipt({original:gm(),inspect:async()=>gm(),
  inspectUi:async()=>({confirmed:retries===1,retryReady:retries===0}),
  requestFingerprint:'native-original-fingerprint',receipt,
  retry:async()=>{retries++;return {requestFingerprint:'native-original-fingerprint',receipt};},wait:async()=>{}});
 assert.deepEqual(result,{visibleConsequence:true,exactUiRetries:1});assert.equal(retries,1);
});

test('loyalty UI recovery rejects a new request or changed committed receipt before credit',async()=>{
 const {waitForBaseLoyaltyUiReceipt}=await contracts();
 assert.equal(typeof waitForBaseLoyaltyUiReceipt,'function');
 const receipt={sessionId:'native-session',setupRevision:4,assignedUids:['native-target']};
 for(const result of [{requestFingerprint:'new-request',receipt},
  {requestFingerprint:'original',receipt:{...receipt,setupRevision:5}}]){
  let retries=0;
  await assert.rejects(waitForBaseLoyaltyUiReceipt({original:gm(),inspect:async()=>gm(),
   inspectUi:async()=>({confirmed:false,retryReady:true}),requestFingerprint:'original',receipt,
   retry:async()=>{retries++;return result;},wait:async()=>{}}));
  assert.equal(retries,1,'Never issue a second recovery mutation after a contradiction.');
 }
});

test('changed original GM authority rejects loyalty UI recovery before its visible retry',async()=>{
 const {waitForBaseLoyaltyUiReceipt}=await contracts();
 assert.equal(typeof waitForBaseLoyaltyUiReceipt,'function');
 let retries=0;
 await assert.rejects(waitForBaseLoyaltyUiReceipt({original:gm(),inspect:async()=>gm({instanceId:'other'}),
  inspectUi:async()=>({confirmed:false,retryReady:true}),retry:async()=>{retries++;}}));
 assert.equal(retries,0);
});

test('one exact loyalty retry cannot credit an unconfirmed panel or extend its original deadline',async()=>{
 const {waitForBaseLoyaltyUiReceipt}=await contracts();
 assert.equal(typeof waitForBaseLoyaltyUiReceipt,'function');
 let now=0,retries=0;
 const receipt={sessionId:'native-session',setupRevision:4,assignedUids:['native-target']};
 await assert.rejects(waitForBaseLoyaltyUiReceipt({original:gm(),inspect:async()=>gm(),
  inspectUi:async()=>({confirmed:false,retryReady:true}),requestFingerprint:'original',receipt,
  retry:async()=>{retries++;return {requestFingerprint:'original',receipt};},
  timeoutMs:1000,now:()=>now,wait:async()=>{now+=200;}}),/deadline|unconfirmed/i);
 assert.equal(retries,1);assert.equal(now,1000);
});

test('opening combat uses the exact printed first composition only in the actual Cycle1 or deferredCycle2 window', async () => {
  const { openingWolfCounts } = await contracts();
  const counts = openingWolfCounts({ cycle: 1, window: null, attack: null });
  assert.equal(counts['wolf-fighter-wing'], 10); assert.equal(counts['wolf-assault-transport'], 5);
  assert.equal(Object.values(counts).reduce((sum, value) => sum + value, 0), 15);
  assert.deepEqual(openingWolfCounts({ cycle: 2, window: { status: 'deferred', turn: 2 }, attack: null }), counts);
  for (const input of [{ cycle: 3, window: null }, { cycle: 2, window: null },
    { cycle: 1, window: { status: 'due', turn: 1, threatSiteCode: 'P' } },
    { cycle: 1, attack: { status: 'resolved', attackNumber: 1 } }]) assert.throws(() => openingWolfCounts(input));
});

test('a current source actor cannot change UID, role, console, cycle or audience while keeping receipt credit', async () => {
  const { assertOriginalBaseActor } = await contracts();
  assert.doesNotThrow(() => assertOriginalBaseActor(actor(), actor()));
  for (const change of [{ uidHash: 'other' }, { profileRoleId: 'admiral' },
    { playerRole: 'gm' }, { activeConsoleRoleId: 'admiral' }, { cycle: 2 },
    { sessionId: 'other' }, { connection: 'reconnecting' }, { sameActor: false }])
    assert.throws(() => assertOriginalBaseActor(actor(change), actor()));
});

test('same-UID GM demotion or original instance replacement invalidates private read acceptance', async () => {
  const { assertOriginalBaseActor } = await contracts();
  for (const change of [{ playerRole: 'player' }, { instanceId: 'new-instance' }, { gmInstanceOwned: false }])
    assert.throws(() => assertOriginalBaseActor(gm(change), gm()));
});

test('a private source UID maps only to the original named Auth roster, never a new actor alias', async () => {
  const { originalRoleForUid } = await contracts();
  const uid = 'native-auth-uid', uidHash = createHash('sha256').update(uid).digest('hex').slice(0, 16);
  assert.equal(originalRoleForUid(uid, [{ roleId: 'quellon-explorer', uidHash }]), 'quellon-explorer');
  assert.throws(() => originalRoleForUid('foreign', [{ roleId: 'quellon-explorer', uidHash }]));
});

test('private deduction results retain their actual reported value and reject hidden truth, wrong actor, target or cycle', async () => {
  const { validatePrivateDeductionReply } = await contracts();
  const expected = { sessionId: 'native-session', cycle: 1, investigatorUid: 'native-investigator', targetUid: 'native-target' };
  const result = { type: 'intelligence-investigation', requestId: 'native-request', revision: 1,
    ...expected, reportedWolf: false, targetDisplayName: 'Native player', suspicion: 8 };
  assert.equal(validatePrivateDeductionReply(result, expected).reportedWolf, false);
  for (const changed of [{ ...result, actualWolf: true }, { ...result, accurate: true },
    { ...result, accuracyRoll: 4 }, { ...result, targetUid: 'foreign' },
    { ...result, investigatorUid: 'foreign' }, { ...result, cycle: 2 }])
    assert.throws(() => validatePrivateDeductionReply(changed, expected));
});

test('conditional deduction absence stays explicitly uncredited and blocks a caller-required branch', async () => {
  const { assertRequiredBaseBranches } = await contracts();
  const branches = { 'wolf-resolution': { status: 'committed' },
    'agent-detector': { status: 'blocked', blocker: 'Four real research crosses are incomplete.', nextActor: 'shepherd-scientist' } };
  assert.doesNotThrow(() => assertRequiredBaseBranches(branches, ['wolf-resolution']));
  assert.throws(() => assertRequiredBaseBranches(branches, ['agent-detector']), /agent-detector/);
  assert.throws(() => assertRequiredBaseBranches(branches, ['unobserved']), /unobserved/);
});

function receiptSurface({ requestChanges = {}, after = actor(), result = { type: 'native-result', revision: 4 }, httpStatus = 200 } = {}) {
  let observations = 0, replayCalls = 0, clicks = 0;
  const request = { sessionId: 'native-session', requestId: 'native-request', expectedTurn: 1,
    attackId: 'native-attack', expectedRevision: 3, ...requestChanges };
  const response = { status: () => httpStatus, json: async () => ({ result }),
    request: () => ({ postDataJSON: () => ({ data: request }) }) };
  const surface = { label: 'native crew', observe: async () => ++observations === 1 ? actor() : after,
    page: { waitForResponse: async () => response }, callable: async () => { replayCalls++; return { status: 'committed', result }; } };
  return { surface, click: async () => { clicks++; }, counts: () => ({ replayCalls, clicks }) };
}

test('actual UI receipt capture binds the current original actor and exact source revision before its unchanged SDK retry', async () => {
  const { captureBaseUiReceipt } = await contracts();
  const fixture = receiptSurface(), records = [];
  const result = await captureBaseUiReceipt({ surface: fixture.surface, endpoint: 'nativeEndpoint',
    expectedActor: actor(), expectedRequest: { attackId: 'native-attack', expectedRevision: 3 },
    decision: fixture.click, record: value => records.push(value) });
  assert.equal(result.revision, 4); assert.deepEqual(fixture.counts(), { replayCalls: 1, clicks: 1 });
  assert.equal(records[0].expectedRevision, 3); assert.equal(records[0].httpStatus, 200);
  assert.equal(records.at(-1).exactOriginalSdkReplay, true);
});

test('a pending private reply under changed original authority is rejected before any SDK retry', async () => {
  const { captureBaseUiReceipt } = await contracts();
  const fixture = receiptSurface({ after: actor({ profileRoleId: 'admiral' }) });
  await assert.rejects(captureBaseUiReceipt({ surface: fixture.surface, endpoint: 'nativeEndpoint',
    expectedActor: actor(), decision: fixture.click, record: () => {} }));
  assert.equal(fixture.counts().replayCalls, 0);
});

test('old rendered source revision cannot be credited or replayed after its request disagrees with the current source', async () => {
  const { captureBaseUiReceipt } = await contracts();
  const fixture = receiptSurface({ requestChanges: { expectedRevision: 2 } }), records = [];
  await assert.rejects(captureBaseUiReceipt({ surface: fixture.surface, endpoint: 'nativeEndpoint', expectedActor: actor(),
    expectedRequest: { expectedRevision: 3 }, decision: fixture.click, record: value => records.push(value) }));
  assert.equal(records[0].expectedRevision, 2); assert.equal(fixture.counts().replayCalls, 0);
});

test('real denial evidence is retained before failing the procedure and creates no replay credit', async () => {
  const { captureBaseUiReceipt } = await contracts();
  const fixture = receiptSurface({ httpStatus: 400 }), records = [];
  await assert.rejects(captureBaseUiReceipt({ surface: fixture.surface, endpoint: 'nativeEndpoint', expectedActor: actor(),
    decision: fixture.click, record: value => records.push(value) }));
  assert.equal(records[0].httpStatus, 400); assert.equal(fixture.counts().replayCalls, 0);
});

test('the existing real attack resolver accepts an explicit source-control supplement before its old limited actor loop', async () => {
  let status = 'declared', supplements = 0;
  const current = () => ({ attackId: 'native-only', status, revision: 1, currentStep: 'native-choice', turn: 1 });
  const tools = { read: async () => current(), state: async () => ({ phase: 'active', cycle: 1 }), record: async () => {} };
  const result = await resolveLiveWolfAttack({ gm: { observe: async () => gm() }, roster: [],
    initial: { sessionId: 'native-session' } }, { tools, timeoutMs: 10, verifyReplay: false,
    chooseNext: async value => { assert.equal(value.attackId, 'native-only'); supplements++; status = 'resolved'; return true; } });
  assert.equal(result.status, 'resolved'); assert.equal(supplements, 1);
});

test('the current-phase original GM wait observes cache transitions without accepting or changing the source actor', async () => {
  const { waitForOriginalBaseActor } = await contracts();
  let reads = 0, time = 0;
  const current = await waitForOriginalBaseActor({ original: gm(),
    inspect: async () => { reads++; return gm(reads < 3 ? { freshness: 'cache', connection: 'reconnecting' } : {}); },
    now: () => time, wait: async () => { time += 1; }, timeoutMs: 4 });
  assert.equal(reads, 3); assert.equal(current.freshness, 'server');
});

test('a cache period does not relax original Auth, GM ownership, instance, phase or role fences', async () => {
  const { waitForOriginalBaseActor } = await contracts();
  for (const change of [{ hasAuth: false }, { uidHash: 'foreign' }, { sameActor: false },
    { playerRole: 'player' }, { instanceId: 'replacement' }, { gmInstanceOwned: false }, { phase: 'debrief' }]) {
    let reads = 0;
    await assert.rejects(waitForOriginalBaseActor({ original: gm(),
      inspect: async () => { reads++; return gm({ connection: 'reconnecting', freshness: 'cache', ...change }); },
      timeoutMs: 2, now: () => 0, wait: async () => { throw new Error('Wrong identities cannot wait for permission.'); } }));
    assert.equal(reads, 1);
  }
});

test('current-phase readiness has a bounded read-only deadline and produces no endpoint replay', async () => {
  const { waitForOriginalBaseActor } = await contracts();
  let reads = 0, time = 0;
  await assert.rejects(waitForOriginalBaseActor({ original: gm(),
    inspect: async () => { reads++; return gm({ freshness: 'cache' }); }, timeoutMs: 2,
    now: () => time, wait: async () => { time += 1; } }), /deadline|fresh|live/i);
  assert.equal(reads, 2);
});

const aftermath = (changes = {}) => ({ type: 'wolf-attack-member-view', schemaVersion: 1,
  sessionId: 'native-session', attackId: 'native-attack', turn: 1, revision: 9,
  status: 'resolved', phase: 'active', currentStep: 'resolved', range: null,
  deadlineAt: '2026-10-05T10:00:00Z', serverTime: '2026-10-05T10:00:01Z', visibility: 'members',
  redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
  remainingThreatCount: 2, returningThreatCount: 1,
  results: [{ range: 'boarding', sourceId: 'wolf-attack-damage', targetId: 'aegis', bearing: null,
    contactReference: 'AEGIS', effect: 'Fleet damage', outcome: { damage: 1, populationLoss: 1000 },
    serverTime: '2026-10-05T10:00:01Z' }], ...changes });
const committedAttack = { attackId: 'native-attack', turn: 1, revision: 9 };

test('member aftermath acceptance awaits both the exact source revision and the real rendered committed results', async () => {
  const { waitForBaseMemberAftermath } = await contracts();
  let reads = 0, paints = 0, time = 0;
  const result = await waitForBaseMemberAftermath({ original: actor(), inspect: async () => actor(),
    expected: committedAttack, read: async () => ++reads === 1 ? aftermath({ revision: 8 }) : aftermath(),
    renderedReady: async () => ++paints > 1, now: () => time, wait: async () => { time += 1; }, timeoutMs: 4 });
  assert.equal(result.revision, 9); assert.equal(reads, 3); assert.equal(paints, 2);
});

test('pending entitled member reads cannot be accepted under a changed original role, UID or console', async () => {
  const { waitForBaseMemberAftermath } = await contracts();
  for (const change of [{ uidHash: 'foreign' }, { profileRoleId: 'admiral' }, { activeConsoleRoleId: 'admiral' }]) {
    let reads = 0;
    await assert.rejects(waitForBaseMemberAftermath({ original: actor(),
      inspect: async () => reads ? actor(change) : actor(), read: async () => { reads++; return aftermath(); },
      expected: committedAttack, renderedReady: async () => true }));
    assert.equal(reads, 1);
  }
});

test('a public aftermath read rejects nested private dice or unknown fields instead of laundering the raw server document', async () => {
  const { assertSafeBaseMemberAftermath } = await contracts();
  assert.doesNotThrow(() => assertSafeBaseMemberAftermath(aftermath(), { sessionId: 'native-session', ...committedAttack }));
  for (const value of [aftermath({ secret: 'hidden' }), aftermath({ calculationReceipt: { rolls: [6] } }),
    aftermath({ results: [{ ...aftermath().results[0], outcome: { damage: 1, dice: [6] } }] }),
    aftermath({ results: [{ ...aftermath().results[0], actorUid: 'hidden' }] })])
    assert.throws(() => assertSafeBaseMemberAftermath(value, { sessionId: 'native-session', ...committedAttack }));
});

test('private investigator replies fail closed on arbitrary nested additions as well as named truth fields', async () => {
  const { validatePrivateDeductionReply } = await contracts();
  const expected = { sessionId: 'native-session', cycle: 1, investigatorUid: 'native-investigator', targetUid: 'native-target' };
  const result = { type: 'wolf-agent-detector-test', status: 'committed', requestId: 'native-request', revision: 1,
    targetDisplayName: 'Native target', reportedWolf: false, ...expected };
  assert.doesNotThrow(() => validatePrivateDeductionReply(result, expected));
  for (const unknown of [{ evidence: { actualWolf: true } }, { suspicion: 7 }, { status: 'stale' }])
    assert.throws(() => validatePrivateDeductionReply({ ...result, ...unknown }, expected));
});

test('source attack requests use actual per-callable bindings and never invent a CAS field on aftermath', async () => {
  const { baseWolfActionExpectation } = await contracts();
  assert.deepEqual(baseWolfActionExpectation('commitWolfFighterRangeActionChoice', committedAttack), { expectedTurn: 1, expectedRevision: 9 });
  assert.deepEqual(baseWolfActionExpectation('resolveWolfAttackAftermath', committedAttack), { attackId: 'native-attack' });
  assert.throws(() => baseWolfActionExpectation('inventedWolfMutation', committedAttack));
});

test('exact receipt recovery preserves meaningful source status values and every committed consequence', async () => {
  const { captureBaseUiReceipt } = await contracts();
  const fixture = receiptSurface({ result: { status: 'due', turn: 1, revision: 4 } });
  fixture.surface.callable = async () => ({ status: 'committed', result: { status: 'deferred', turn: 1, revision: 4 } });
  await assert.rejects(captureBaseUiReceipt({ surface: fixture.surface, endpoint: 'setWolfAttackWindow',
    expectedActor: actor(), decision: fixture.click, record: () => {} }), /consequence|preserve/i);
});

test('UI control names resolve against the actual source presenters for Short Maliades, GM ruling and private investigation', async () => {
  const { BASE_COMBAT_CONTROL_LABELS } = await contracts();
  for (const [key, file] of [
    ['maliadesShort', 'src/components/DioneMaliadesRangeActions.tsx'],
    ['commanderRuling', 'src/components/WolfBoardingChoicePanels.tsx'],
    ['investigationRegion', 'src/components/PrivateLoyaltyPanel.tsx']]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(source.replace(/\s+/g, ' ').includes(BASE_COMBAT_CONTROL_LABELS[key]), `The normal ${key} control must actually exist in source.`);
  }
});

test('Short Range assignments respect actual server fighter-coverage constraints and distinct targets per source', async () => {
  const { chooseBaseRangeAssignments } = await contracts();
  const view = { range: 'short-range', choiceStatus: 'targets-required',
    eligibleActions: [{ actionId: 'missiles', sourceId: 'aegis-missile-launchers' }, { actionId: 'lasers', sourceId: 'aegis-point-defence-lasers' }],
    hitSlots: [{ actionId: 'missiles', count: 2, damagePerHit: 1 }, { actionId: 'lasers', count: 1, damagePerHit: 1 }],
    contacts: [{ contactId: 'contact-1', available: true, requiredCoverageDamage: null },
      { contactId: 'contact-2', available: true, requiredCoverageDamage: 2 },
      { contactId: 'contact-3', available: true, requiredCoverageDamage: 1 }] };
  const choices = chooseBaseRangeAssignments(view);
  assert.deepEqual(choices, [{ actionId: 'missiles', contactIds: ['contact-2', 'contact-3'] }, { actionId: 'lasers', contactIds: ['contact-2'] }]);
  for (const choice of choices) assert.equal(new Set(choice.contactIds).size, choice.contactIds.length);
  assert.throws(() => chooseBaseRangeAssignments({ ...view, contacts: [{ contactId: 'contact-1', available: true }] }), /coverage/i);
});

function nativeOccupiedRoster(count) {
  const roles = ['refinery-124-pdf-colonel', 'wing-commander', 'quellon-explorer',
    ...Array.from({ length: count - 3 }, (_, i) => `native-role-${i}`), 'press-officer'];
  const holders = roles.map((roleId, i) => ({ uid: `native-current-${i}`, role: 'player', connected: true,
    assignedRoleId: roleId === 'press-officer' ? null : roleId, activeConsoleRoleId: roleId,
    seatId: roleId === 'press-officer' ? null : `native-seat-${i}`, replacementRoleId: null,
    replacementStatus: null, escapeState: null }));
  const roster = holders.map(holder => ({ roleId: holder.activeConsoleRoleId,
    uidHash: createHash('sha256').update(holder.uid).digest('hex').slice(0, 16) }));
  return { holders, roster, activeRoleIds: roles.filter(role => role !== 'press-officer'), playerCount: count };
}

test('the ordinary explicit setup plan covers exactly occupied18/20 core holders and claimed Press using actual original identities', async () => {
  const { baseDeductionAssignments } = await contracts();
  for (const count of [18, 20]) {
    const source = nativeOccupiedRoster(count), assignments = baseDeductionAssignments({ ...source, scenario: 'wolf-cult' });
    assert.equal(assignments.length, count + 1);
    assert.equal(assignments.filter(value => value.kind === 'wolf-agent').length, 1);
    assert.equal(assignments.filter(value => value.kind === 'wolf-cult').length, 1);
    assert.equal(assignments.filter(value => value.kind === 'intelligence-agent').length, 1);
    assert.equal(new Set(assignments.map(value => value.uid)).size, assignments.length);
    assert.equal(assignments.find(value => value.kind === 'intelligence-agent').roleId, 'quellon-explorer');
    assert.equal(assignments[0].kind, 'wolf-agent', 'Assign an actual other Wolf before enabling Intelligence.');
  }
});

test('the explicit setup plan rejects missing or replaced occupied holders, unknown UID mappings and conflicting source roles', async () => {
  const { baseDeductionAssignments } = await contracts(), source = nativeOccupiedRoster(18);
  for (const changed of [{ holders: source.holders.slice(1) },
    { holders: source.holders.map((holder, i) => i === 0 ? { ...holder, uid: 'foreign-current' } : holder) },
    { holders: source.holders.map((holder, i) => i === 0 ? { ...holder, replacementStatus: 'pending' } : holder) },
    { intelligenceRoleId: 'wing-commander' }, { playerCount: 12 }, { scenario: 'automatic-default' }])
    assert.throws(() => baseDeductionAssignments({ ...source, scenario: 'wolf-cult', ...changed }));
});

async function setupSurface(t, { replaceAfterClick = false, foreignUid = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-native-base-setup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let enabled = false, clicks = 0, calls = 0;
  const gmState = () => gm({ uidHash: foreignUid ? 'foreign' : 'native-gm', cycle: 0, phase: 'casting',
    instanceId: enabled && replaceAfterClick ? 'replacement' : 'native-instance' });
  const surface = { observe: async () => gmState(), callable: async () => { calls++; },
    page: { getByRole: (_role, { name }) => ({
      isVisible: async () => name === `${enabled ? 'Disable' : 'Enable'} Wolf Cult`,
      isEnabled: async () => true,
      getAttribute: async () => String(enabled),
      click: async () => { enabled = true; clicks++; },
    }) } };
  return { context: { gm: surface, initial: { sessionId: 'native-session', uidHash: 'native-gm' }, directory },
    counts: () => ({ clicks, calls, enabled }) };
}

test('the optional deduction setup hook selects only the actual pre-confirmation GM UI choice, never a setup SDK mutation', async t => {
  const { createBaseDeductionSetupHooks } = await import('./pc10-base-deduction-setup-ui-proof.mjs');
  const fixture = await setupSurface(t), hooks = createBaseDeductionSetupHooks();
  assert.equal(typeof hooks.onBeforeStart, 'function');
  await hooks.onSetup(fixture.context);
  assert.deepEqual(fixture.counts(), { clicks: 1, calls: 0, enabled: true });
  const evidence = JSON.parse(await readFile(`${fixture.context.directory}/base-deduction-setup.json`, 'utf8'));
  assert.equal(evidence.status, 'awaiting-normal-confirmation-and-occupied-casting');
  assert.equal(evidence.actorUidsRecorded, false); assert.equal(evidence.privateProcedureAcceptance, false);
});

test('a changed GM identity or instance cannot receive deduction setup credit after the visible choice', async t => {
  const { createBaseDeductionSetupHooks } = await import('./pc10-base-deduction-setup-ui-proof.mjs');
  for (const change of [{ foreignUid: true }, { replaceAfterClick: true }]) {
    const fixture = await setupSurface(t, change);
    await assert.rejects(createBaseDeductionSetupHooks().onSetup(fixture.context));
    assert.equal(fixture.counts().calls, 0);
  }
});

test('opening prerequisites accept the five-charge separate-cycle route and reject incomplete, old or damaged authority', async () => {
  const { assertBaseCombatPrerequisites } = await contracts();
  const charges = ['fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control', 'missile-launchers', 'point-defence-lasers'];
  const state = { cycle: 1, phase: 'active', turnPhase: { turn: 1, airspace: { state: 'lifted' } },
    maintenanceCycles: { aegis: { turn: 1, step: 0, completedAt: '2026-10-05T10:00:00Z', charges } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } } };
  assert.deepEqual(assertBaseCombatPrerequisites(state, 1).requiredConsoleIds, charges);
  assert.doesNotThrow(() => assertBaseCombatPrerequisites({ ...state, cycle: 2,
    turnPhase: { ...state.turnPhase, turn: 2 }, maintenanceCycles: { aegis: { ...state.maintenanceCycles.aegis, turn: 2 } } }, 2));
  for (const changed of [
    { maintenanceCycles: { aegis: { ...state.maintenanceCycles.aegis, step: 7, completedAt: undefined } } },
    { maintenanceCycles: { aegis: { ...state.maintenanceCycles.aegis, turn: 0 } } },
    { maintenanceCycles: { aegis: { ...state.maintenanceCycles.aegis, charges: ['jump-drive', ...charges.slice(0, 4)] } } },
    { shipDamage: { aegis: { damagedSystemIds: ['fighter-bay-alpha'], destroyed: false } } },
    { shipDamage: { aegis: { damagedSystemIds: [], destroyed: true } } },
  ]) assert.throws(() => assertBaseCombatPrerequisites({ ...state, ...changed }, 1));
});

test('painted aftermath must match actual returned outcome strings and threat counts, even when source/time metadata match', async () => {
  const { baseMemberRowsMatch } = await contracts(), view = aftermath();
  const row = 'Boarding wolf-attack-damage → AEGIS 1 damage // 1000 population lost Committed 2026-10-05T10:00:01Z';
  assert.equal(baseMemberRowsMatch(view, [row], '2 remaining hostile ships // 1 returning next attack'), true);
  assert.equal(baseMemberRowsMatch(view, [row.replace('1 damage', '0 damage')], '2 remaining hostile ships // 1 returning next attack'), false);
  assert.equal(baseMemberRowsMatch(view, [row], '0 remaining hostile ships // 0 returning next attack'), false);
  assert.equal(baseMemberRowsMatch(view, [row, row], '2 remaining hostile ships // 1 returning next attack'), false);
});

test('one paid research cross awaits exact original Scientist revision, cadence, resources and real research/detector paint', async () => {
  const { waitForBaseResearchReceipt } = await contracts();
  const original = actor({ profileRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', cycle: 4 });
  const cadence = { cycle: 4, revision: 4, choices: [{ trackId: 'wolf-agent-detector', funding: 'standard', oreCost: 0 }] };
  const receipt = { status: 'committed', sessionId: 'native-session', cycle: 4, researchRevision: 4,
    trackId: 'wolf-agent-detector', funding: 'standard', oreCost: 0, shepherdOre: 9,
    progress: { 'wolf-agent-detector': 4 }, cadence };
  const workspace = { status: 'ready', sessionId: 'native-session', cycle: 4, researchRevision: 4,
    progress: receipt.progress, cadence, shepherdOre: 9 };
  let reads = 0, paints = 0, time = 0;
  const result = await waitForBaseResearchReceipt({ inspect: async () => original, original, receipt,
    read: async () => ++reads === 1 ? { ...workspace, researchRevision: 3 } : workspace,
    renderedReady: async () => ++paints > 1, now: () => time, wait: async () => { time++; }, timeoutMs: 5 });
  assert.equal(result.researchRevision, 4); assert.equal(reads, 3); assert.equal(paints, 2);
  for (const changed of [{ cycle: 3 }, { shepherdOre: 8 }, { progress: { 'wolf-agent-detector': 3 } },
    { cadence: { ...cadence, choices: [] } }]) await assert.rejects(waitForBaseResearchReceipt({
    inspect: async () => original, original, receipt, read: async () => ({ ...workspace, ...changed }),
    renderedReady: async () => true, now: () => 0, wait: async () => { throw new Error('Inconsistent committed source cannot wait into credit.'); } }));
});

test('a pending private research read cannot return under a replaced original Scientist', async () => {
  const { waitForBaseResearchReceipt } = await contracts();
  const original = actor({ profileRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist' });
  let fetched = false;
  await assert.rejects(waitForBaseResearchReceipt({ original,
    inspect: async () => fetched ? { ...original, uidHash: 'foreign-scientist' } : original,
    receipt: { status: 'committed', sessionId: 'native-session', cycle: 1, researchRevision: 1,
      trackId: 'wolf-agent-detector', funding: 'standard', oreCost: 0, progress: { 'wolf-agent-detector': 1 },
      cadence: { cycle: 1, revision: 1, choices: [] }, shepherdOre: 9 },
    read: async () => { fetched = true; return {}; }, renderedReady: async () => true }));
  assert.equal(fetched, true);
});

test('ordinary explicit loyalty setup preserves source suspicion values and the two-five/one-ten Loyalist distribution', async () => {
  const { baseDeductionAssignments } = await contracts();
  for (const count of [18, 20]) {
    const assignments = baseDeductionAssignments({ ...nativeOccupiedRoster(count), scenario: 'wolf-cult' });
    assert.equal(assignments.find(value => value.kind === 'wolf-agent').suspicion, 0);
    assert.equal(assignments.find(value => value.kind === 'wolf-cult').suspicion, 15);
    assert.equal(assignments.find(value => value.kind === 'intelligence-agent').suspicion, 6);
    const loyalists = assignments.filter(value => value.kind === 'fleet-loyalist');
    assert.equal(loyalists.filter(value => value.suspicion === 5).length, 2);
    assert.equal(loyalists.filter(value => value.suspicion === 10).length, 1);
    assert.ok(loyalists.every(value => [0, 5, 10].includes(value.suspicion)));
    assert.equal(assignments.find(value => value.roleId === 'press-officer').suspicion, 0);
  }
});

test('source suspicion holders can be caller-selected only from three distinct actual original core Loyalists', async () => {
  const { baseDeductionAssignments } = await contracts(), source = nativeOccupiedRoster(18);
  const roles = ['native-role-3', 'native-role-4', 'native-role-5'];
  const choices = baseDeductionAssignments({ ...source, scenario: 'wolf-cult', fleetSuspicionRoleIds: roles });
  assert.deepEqual(roles.map(role => choices.find(value => value.roleId === role).suspicion), [5, 5, 10]);
  for (const invalid of [['native-role-3', 'native-role-3', 'native-role-5'],
    ['quellon-explorer', 'native-role-4', 'native-role-5'], ['foreign', 'native-role-4', 'native-role-5'],
    ['press-officer', 'native-role-4', 'native-role-5'], roles.slice(0, 2)])
    assert.throws(() => baseDeductionAssignments({ ...source, scenario: 'wolf-cult', fleetSuspicionRoleIds: invalid }));
});
