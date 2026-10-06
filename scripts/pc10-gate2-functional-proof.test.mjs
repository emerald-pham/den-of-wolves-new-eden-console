import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPc10FunctionalCommand, assertPc10CommandedMemberProjection,
  assessPc10FunctionalTransport, createPc10FunctionalCommand,
  transitionPc10FunctionalBrowser, runPc10Gate2FunctionalScenario,
} from './pc10-gate2-functional-proof.mjs';

const documentHash = 'a'.repeat(64);
const original = { roleId: 'aegis-captain', uid: 'original-a', sessionId: 'original-session', contextHash: 'b'.repeat(64) };
const source = (changes = {}) => ({ roleId: original.roleId, uid: original.uid, sessionId: original.sessionId,
  phase: 'active', currentTurn: 1, connected: true, nonKicked: true, playerRole: 'player',
  assignedRoleId: original.roleId, activeConsoleRoleId: original.roleId, seatId: original.roleId,
  seatHolderUid: original.uid, seatStatus: 'claimed', sameMembership: true, generation: 3,
  groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [], checkedAt: 10, lastSeenAtMs: 9,
  ...changes });
const binding = (changes = {}) => ({ authUid: original.uid, storeUid: original.uid, sessionId: original.sessionId,
  assignedRoleId: original.roleId, activeConsoleRoleId: original.roleId, seatId: original.roleId,
  contextHash: original.contextHash, nativeDocumentHash: documentHash, online: true, observedAt: 10, ...changes });
const member = (actor = original, authority = source()) => ({ status: 200, result: {
  type: 'current-member-session', actorUid: actor.uid, sessionId: actor.sessionId, groupId: authority.groupId,
  connectionGeneration: authority.generation, assignedRoleId: authority.assignedRoleId,
  activeConsoleRoleId: authority.activeConsoleRoleId,
  session: { id: actor.sessionId, phase: 'active', currentTurn: 1,
    memberSessionScope: { groupId: authority.groupId, vesselIds: authority.vesselIds, craftIds: authority.craftIds },
    shipResources: { aegis: { water: 8 } }, shuttleControl: {}, populationAlerts: {}, unrestAlerts: {} },
} });
const command = (changes = {}) => ({ commandId: 'original-command', roleId: original.roleId, name: 'getCurrentMemberSession',
  original, data: { sessionId: original.sessionId }, registeredAt: 10, issuedAt: 11, completedAt: 12,
  beforeBinding: binding(), afterBinding: binding({ observedAt: 13 }),
  beforeSource: source(), afterSource: source({ checkedAt: 13 }),
  invocation: { startedAt: 11, completedAt: 12, nativeDocumentHash: documentHash },
  reply: member(), validation: { passed: true }, ...changes });
const observation = (changes = {}) => ({ roleId: original.roleId, name: 'getCurrentMemberSession', captureMode: 'native-durable',
  actorHash: 'c'.repeat(64), sessionHash: 'd'.repeat(64), nativeDocumentHash: documentHash,
  nativeContextHash: 'e'.repeat(64), nativeFrameHash: 'f'.repeat(64), nativeLoaderHash: '1'.repeat(64),
  protocolRequestHash: '2'.repeat(64), status: 200, requestFinishedAt: 12, requestFailedAt: null,
  bodyCompletedAt: 13, bodyHash: '3'.repeat(64), failureCategory: null, httpOutcome: 'result',
  bodyFailureStage: 'native-get-response-body', bodyReadFailureReason: 'body-unavailable', ...changes });

test('original awaited SDK outcome and both original document/source bindings qualify a command', () => {
  assert.doesNotThrow(() => assertPc10FunctionalCommand(command()));
});
for (const [label, changes] of [
  ['unfinished SDK reply', { completedAt: null }], ['missing original SDK result', { reply: undefined }],
  ['rebound original UID', { afterBinding: binding({ authUid: 'another-uid' }) }],
  ['store actor mismatch', { beforeBinding: binding({ storeUid: 'another-uid' }) }],
  ['rebound SID', { afterBinding: binding({ sessionId: 'another-session' }) }],
  ['different command payload SID', { data: { sessionId: 'another-session' } }],
  ['same-UID replaced document mid-command', { afterBinding: binding({ nativeDocumentHash: '4'.repeat(64) }) }],
  ['different invocation document', { invocation: { startedAt: 11, completedAt: 12, nativeDocumentHash: '4'.repeat(64) } }],
  ['foreign source seat holder', { afterSource: source({ seatHolderUid: 'another-uid' }) }],
  ['changed cycle', { afterSource: source({ currentTurn: 2 }) }],
  ['stale after-source witness', { afterSource: source({ checkedAt: 10 }) }],
  ['source point taken after original issue', { beforeSource: source({ checkedAt: 14 }) }],
  ['unclassified non-200 command', { reply: { status: 429, error: { status: 'RESOURCE_EXHAUSTED' } } }],
  ['unchecked original outcome', { validation: { passed: false } }],
]) test(`${label} cannot silently pass`, () => assert.throws(() => assertPc10FunctionalCommand(command(changes))));

test('current-member response checks original top-level UID/SID and independently witnessed fleet audience', () => {
  assert.doesNotThrow(() => assertPc10CommandedMemberProjection({ reply: member(), original, before: source(), after: source() }));
});
for (const [label, mutate] of [
  ['foreign top-level UID', reply => { reply.result.actorUid = 'foreign'; }],
  ['foreign top-level SID', reply => { reply.result.sessionId = 'foreign'; }],
  ['wrong source group', reply => { reply.result.groupId = 'fleet-2'; }],
  ['foreign audience vessel', reply => { reply.result.session.memberSessionScope.vesselIds.push('dione'); }],
  ['foreign vessel map', reply => { reply.result.session.shipResources.dione = { water: 99 }; }],
  ['foreign craft map', reply => { reply.result.session.shuttleControl.highwall = {}; }],
  ['unlisted private top-level field', reply => { reply.result.session.loyaltyAssignments = {}; }],
  ['nested server-only private field', reply => { reply.result.session.shipResources.aegis.memberShipIds = { foreign: 'dione' }; }],
  ['generation outside authority interval', reply => { reply.result.connectionGeneration = 9; }],
]) test(`${label} is rejected on the original commanded projection`, () => {
  const reply = member(); mutate(reply);
  assert.throws(() => assertPc10CommandedMemberProjection({ reply, original, before: source(), after: source() }));
});
test('Press has zero vessel audience and only source-owned SNN craft entitlement', () => {
  const press = { ...original, roleId: 'press-officer' };
  const authority = source({ roleId: press.roleId, assignedRoleId: null, seatId: null,
    activeConsoleRoleId: press.roleId, vesselIds: [], craftIds: ['snn-press-shuttle'], pressHolderUid: press.uid });
  const reply = member(press, authority); reply.result.session.shipResources = {};
  reply.result.session.shuttleControl = { 'snn-press-shuttle': { holderUid: press.uid, ownerRoleId: press.roleId } };
  assert.doesNotThrow(() => assertPc10CommandedMemberProjection({ reply, original: press, before: authority, after: authority }));
  reply.result.session.shipResources.aegis = { water: 8 };
  assert.throws(() => assertPc10CommandedMemberProjection({ reply, original: press, before: authority, after: authority }));
});
test('exact expected denial is required; GM start and active casting deny distinct codes', () => {
  for (const code of ['permission-denied', 'failed-precondition']) {
    assert.doesNotThrow(() => assertPc10FunctionalCommand(command({ name: 'startGame', expectedDenial: code,
      reply: { status: 'denied', error: { code: `functions/${code}` } } })));
  }
  assert.throws(() => assertPc10FunctionalCommand(command({ expectedDenial: 'permission-denied',
    reply: { status: 'denied', error: { code: 'functions/failed-precondition' } } })));
});

test('unread passive private response stays explicitly UNINSPECTED and strict transport INCOMPLETE', () => {
  const raw = observation({ bodyCompletedAt: null, bodyHash: null, failureCategory: 'response-observation-unavailable' });
  const failures = [{ roleId: raw.roleId, name: raw.name, protocolRequestHash: raw.protocolRequestHash,
    category: 'response-observation-unavailable', status: 200 }];
  const result = assessPc10FunctionalTransport({ commands: [command()], observations: [raw], failures, drains: [{ outcome: 'failed' }] });
  assert.equal(result.functionalStatus, 'PASSED');
  assert.equal(result.commandedPrivacyStatus, 'PASSED');
  assert.equal(result.passivePrivacyStatus, 'UNINSPECTED');
  assert.equal(result.strictTransportStatus, 'INCOMPLETE');
  assert.equal(result.instrumentationLimits[0].originalReplyKnown, false);
  assert.equal(raw.bodyHash, null); assert.equal(failures.length, 1);
  assert.equal(assessPc10FunctionalTransport({ commands: [command({ reply: undefined })], observations: [raw], failures }).functionalStatus, 'FAILED');
});
test('unexpected HTTP failures, unknown failure categories and native identity discrepancy remain hard failures', () => {
  for (const input of [
    { observations: [observation({ status: 500 })] },
    { observations: [observation({ status: 403, httpOutcome: 'error', denialCode: 'PERMISSION_DENIED' })] },
    { failures: [{ roleId: original.roleId, category: 'native-identity-mismatch' }] },
    { failures: [{ roleId: original.roleId, category: 'future-unknown-category' }] },
  ]) assert.equal(assessPc10FunctionalTransport({ commands: [command()], ...input }).functionalStatus, 'FAILED');
});
test('historical strict failure packet is preserved, never accepted as a new functional run', () => {
  const old = { status: 'failed', originalStrictNativeInstrumentationStatus: 'failed', capacityAcceptance: false };
  const bytes = JSON.stringify(old);
  assert.equal(assessPc10FunctionalTransport({ commands: [], historicalRecord: old }).functionalStatus, 'FAILED');
  assert.equal(JSON.stringify(old), bytes);
});

test('one functional command issues exactly one original SDK invocation and records original awaited reply', async () => {
  const ledger = [], seen = []; let sourcePoints = 0, identityPoints = 0;
  const client = { callable: async (...args) => { seen.push(args); return member(); },
    sdkInvocationForReply: () => ({ startedAt: 11, completedAt: 12, nativeDocumentHash: documentHash }) };
  const issue = createPc10FunctionalCommand({ ledger, originals: new Map([[original.roleId, original]]),
    clients: new Map([[original.roleId, client]]),
    observeBinding: async () => binding({ observedAt: identityPoints++ ? 13 : 10 }),
    captureAuthority: async () => source({ checkedAt: sourcePoints++ ? 13 : 10 }),
    clock: (() => { let at = 10; return () => at++; })(), validateReply: () => ({ passed: true }) });
  const reply = await issue(original.roleId, 'getCurrentMemberSession');
  assert.equal(reply.status, 200); assert.equal(seen.length, 1);
  assert.deepEqual(seen[0][2], { retainPresenceAuthority: true });
  assert.equal(ledger.length, 1); assert.equal(ledger[0].reply, reply);
});
test('failed original command is retained before issue and has no replay or replacement getter', async () => {
  const ledger = []; let calls = 0;
  const issue = createPc10FunctionalCommand({ ledger, originals: new Map([[original.roleId, original]]),
    clients: new Map([[original.roleId, { callable: async () => { calls++; throw Error('original transport'); } }]]),
    observeBinding: async () => binding(), captureAuthority: async () => source(), validateReply: () => ({ passed: true }) });
  await assert.rejects(issue(original.roleId, 'resumeSession'), /original transport/);
  assert.equal(calls, 1); assert.equal(ledger.length, 1); assert.ok(ledger[0].failedAt);
  assert.equal(ledger[0].completedAt, null);
});

test('a failed strict passive-body drain uses exactly one public reload and retains the original failure', async () => {
  const transitions = [], drains = []; let reloads = 0, wrapped = 0;
  const client = { drainObservedCalls: async () => { throw Error('native body unavailable'); },
    reload: async () => { wrapped++; }, page: { reload: async () => { reloads++; } } };
  await transitionPc10FunctionalBrowser({ roleId: original.roleId, kind: 'reload', client, transitions, drains,
    observeBinding: async () => binding({ nativeDocumentHash: reloads ? '4'.repeat(64) : documentHash }),
    captureAuthority: async () => source(), original,
    qualifyDrainGap: () => ({ allowed: true, limitations: ['original passive body unknown'] }) });
  assert.equal(reloads, 1); assert.equal(wrapped, 0); assert.equal(drains[0].outcome, 'failed');
  assert.equal(transitions[0].seam, 'public-Playwright-after-recorded-passive-drain-gap');
  assert.equal(transitions[0].outcome, 'completed');
});
test('a drain identity/authority/unclassified transport failure cannot unlock the public transition seam', async () => {
  let actual = 0;
  await assert.rejects(transitionPc10FunctionalBrowser({ roleId: original.roleId, kind: 'reload', original,
    client: { drainObservedCalls: async () => { throw Error('bad identity'); }, page: { reload: async () => actual++ } },
    transitions: [], drains: [], observeBinding: async () => binding(), captureAuthority: async () => source(),
    qualifyDrainGap: () => ({ allowed: false }) }));
  assert.equal(actual, 0);
});

test('finite orchestration keeps 7/7/6 writes, original claim replays and all 21 commanded recovered privacy responses', async () => {
  const roles = Array.from({ length: 20 }, (_, i) => `core-${i}`), all = [...roles, 'press-officer'];
  const commands = [], transitions = [], recovered = [], cohorts = [];
  const table = { fixture: { roles, seatClaimRequests: Object.fromEntries(roles.map(role => [role, { requestId: `original-${role}`, seatId: role }])),
    session: { get: async () => ({ get: key => key === 'currentTurn' ? 1 : key === 'pressDispatch' ? { revision: 0 } : 1 }) } },
    clients: new Map(all.map(role => [role, {}])) };
  const replies = new Map();
  const harness = {
    assertRoster: async () => {}, recoveredPrivacy: async state => { recovered.push({ state, actors: [...all] }); },
    command: async (role, name, payload = {}, options = {}) => {
      commands.push({ role, name, payload, options });
      if (options.expectedDenial) return { status: 'denied', error: { code: `functions/${options.expectedDenial}` } };
      if (name === 'resumeSession') return { status: 200, result: { player: { fleetGroupId: 'fleet-1' } } };
      const key = `${role}:${name}:${payload.requestId ?? ''}`;
      if (!replies.has(key)) replies.set(key, { status: 200, result: { status: 'committed', groupId: 'fleet-1' } });
      return replies.get(key);
    },
    privateRead: async () => ({ status: 'denied', code: 'permission-denied' }),
    transition: async (role, kind) => { transitions.push({ role, kind }); },
    assertRecovered: async () => {}, assertMessages: async choices => cohorts.push(choices.length),
    assertPress: async () => {}, assertClaims: async () => {},
    naturalDisconnect: async qualified => {
      assert.equal(typeof qualified.command, 'function');
      assert.equal(qualified.clients.size, 21);
      return { passed: true, checks: { remainingTimeRestoredExactlyOnce: true } };
    },
  };
  const result = await runPc10Gate2FunctionalScenario(table, harness);
  assert.deepEqual(cohorts, [7, 7, 6]);
  assert.deepEqual(recovered.map(row => row.state), ['initial-resume', 'online', 'reload', 'natural-expiry']);
  assert.ok(recovered.every(row => row.actors.length === 21));
  assert.equal(transitions.length, 63);
  for (const role of roles) {
    const claims = commands.filter(row => row.role === role && row.name === 'claimSeat');
    assert.equal(claims.length, 2); assert.equal(claims[0].payload, table.fixture.seatClaimRequests[role]);
    assert.deepEqual(claims[1].payload, claims[0].payload);
  }
  assert.equal(result.naturalDisconnect.passed, true);
});
