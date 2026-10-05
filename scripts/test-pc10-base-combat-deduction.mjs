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
