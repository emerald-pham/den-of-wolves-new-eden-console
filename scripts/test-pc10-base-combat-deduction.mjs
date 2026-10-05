import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';

// Native procedure contracts only; these surfaces provide no gameplay/Auth evidence.
const contracts = () => import('./pc10-base-combat-deduction-contracts.mjs');
const actor = (changes = {}) => ({ sessionId: 'native-session', uidHash: 'native-executive',
  profileRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', playerRole: 'player',
  cycle: 1, phase: 'active', sameActor: true, connection: 'live', freshness: 'server', ...changes });
const gm = (changes = {}) => actor({ uidHash: 'native-gm', profileRoleId: 'gm', playerRole: 'gm',
  activeConsoleRoleId: null, instanceId: 'native-instance', gmInstanceOwned: true, ...changes });

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
  const result = await resolveLiveWolfAttack({ gm: {}, roster: [] }, { tools, timeoutMs: 10, verifyReplay: false,
    chooseNext: async value => { assert.equal(value.attackId, 'native-only'); supplements++; status = 'resolved'; return true; } });
  assert.equal(result.status, 'resolved'); assert.equal(supplements, 1);
});
