import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { createWolfChoiceWaiter } from './pc10-combat-choice-readiness.mjs';
import { assertOriginalBaseActor } from './pc10-base-combat-deduction-contracts.mjs';

// Native fixtures execute the actual serialized page.evaluate callback. The SDK
// source distinguishes cache-permitted getDoc from server-only getDocFromServer;
// inert modules below expose that distinction without any browser or network.
const sessionId = 'private-native-session', uid = 'private-native-original-gm';
const originalActor = { hasAuth: true, sameActor: true, sessionId,
  uidHash: createHash('sha256').update(uid).digest('hex').slice(0, 16), profileRoleId: null,
  assignedRoleId: null, activeConsoleRoleId: null, playerRole: 'gm', phase: 'active', cycle: 1,
  fleetGroupId: null, connectionGeneration: 1, identityHydrationRevision: 2,
  replacementRoleId: null, replacementStatus: null, seatId: null,
  airspace: 'restricted', turnStatePhase: 'team', phaseProgression: 'manual',
  instanceId: 'private-native-gm-instance', gmInstanceOwned: true, connection: 'live', freshness: 'server' };
const currentAttack = { sessionId, attackId: 'private-native-attack', turn: 1, revision: 26,
  status: 'declared', currentStep: 'boarding', airspaceLocked: true,
  targets: [{ uid: 'private-target-uid', contactId: 'private-contact-id' }] };
const resolvedAttack = { ...currentAttack, revision: 27, status: 'resolved', currentStep: 'resolved', airspaceLocked: false };
const deniedReply = { status: 'denied', code: 'functions/failed-precondition',
  message: 'Wolf boarding defence is not currently open. [400]' };
const plain = value => JSON.parse(JSON.stringify(value));

function sourceReadFixture({ metadata = { fromCache: false, hasPendingWrites: false },
  attack = currentAttack, serverValue = resolvedAttack, serverError, afterServer = () => {}, sdkReply = deniedReply } = {}) {
  const counts = { getDoc: 0, getDocFromServer: 0, getDocs: 0, sdkChoice: 0, paints: 0 };
  const timeouts = [], records = [], reads = [];
  const fixture = { actor: { ...originalActor }, counts, timeouts, records, reads };
  const path = `sessions/${sessionId}/wolfAttackState/current`;
  const snapshot = (value, meta) => ({ id: 'current', exists: () => value !== null,
    data: () => value, metadata: meta });
  const sdk = {
    doc: (db, requestedPath) => { assert.equal(db.kind, 'same-authenticated-db'); return { path: requestedPath }; },
    collection: (db, requestedPath) => ({ db, path: requestedPath }),
    getDoc: async ref => {
      counts.getDoc += 1; reads.push({ method: 'getDoc', path: ref.path });
      return snapshot(attack, { fromCache: true, hasPendingWrites: false });
    },
    getDocFromServer: async ref => {
      counts.getDocFromServer += 1; reads.push({ method: 'getDocFromServer', path: ref.path });
      assert.equal(ref.path, path);
      if (serverError) throw serverError;
      afterServer(fixture);
      return snapshot(serverValue, metadata);
    },
    getDocs: async ref => {
      counts.getDocs += 1; reads.push({ method: 'getDocs', path: ref.path });
      return { docs: [snapshot(attack, { fromCache: true, hasPendingWrites: false })] };
    },
  };
  const runBrowserCallback = async (callback, input) => {
    const browser = createContext({ input, fetch: async url => {
      assert.equal(url, '/src/lib/firestore.ts');
      return { text: async () => 'import { getFirestore } from "/fixture/firebase_firestore.js";' };
    } });
    assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(browser),
      'undefined,undefined,undefined');
    const sdkModule = new SyntheticModule(Object.keys(sdk), function () {
      for (const [name, value] of Object.entries(sdk)) this.setExport(name, value);
    }, { context: browser });
    const firestore = new SyntheticModule(['db'], function () {
      this.setExport('db', () => ({ kind: 'same-authenticated-db' }));
    }, { context: browser });
    const store = new SyntheticModule(['useSessionStore'], function () {
      this.setExport('useSessionStore', { getState: () => ({
        session: { id: fixture.actor.sessionId, playerDiscovery: null },
        me: { uid, role: 'gm', fleetGroupId: fixture.actor.fleetGroupId,
          connectionGeneration: fixture.actor.connectionGeneration, connected: true },
        identityHydrationRevision: fixture.actor.identityHydrationRevision,
      }) });
    }, { context: browser });
    const modules = new Map([['/fixture/firebase_firestore.js', sdkModule],
      ['/src/lib/firestore.ts', firestore], ['/src/store/useSessionStore.ts', store]]);
    for (const module of modules.values()) { await module.link(() => assert.fail('No fixture imports.')); await module.evaluate(); }
    const script = new Script(`(${callback.toString()})(input)`, {
      importModuleDynamically: async name => { assert.ok(modules.has(name)); return modules.get(name); },
    });
    return script.runInContext(browser);
  };
  const gm = { storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => ({ ...fixture.actor }),
    until: async (_description, predicate, timeout) => {
      timeouts.push(timeout); assert.equal(predicate(fixture.actor), true); return { ...fixture.actor };
    }, callable: async (endpoint, request) => {
      counts.sdkChoice += 1; assert.equal(endpoint, 'getWolfBoardingSpecialChoice');
      assert.deepEqual(request, { sessionId, instanceId: originalActor.instanceId }); return sdkReply;
    }, page: { evaluate: runBrowserCallback, getByRole: () => { counts.paints += 1; assert.fail('No choice paint after denial.'); } } };
  const context = { gm, crew: {}, initial: { sessionId, joinCode: 'native-join' },
    started: { uidHash: originalActor.uidHash, instanceId: originalActor.instanceId },
    roster: [{ roleId: 'admiral', uidHash: 'original-admitted-admiral' }] };
  const adapter = createTwoBrowserGameplay(context);
  const tools = { ...adapter, record: async (stage, detail) => { records.push({ stage, ...plain(detail) }); } };
  return { ...fixture, context, adapter, tools,
    run: () => createWolfChoiceWaiter(context, { tools })(gm, attack, { kind: 'boarding-special' }),
  };
}

test('the exact authenticated single reinspection uses the actual serialized server-only SDK read', async () => {
  const fixture = sourceReadFixture(), observed = [];
  const deadlineAt = Date.now() + 4000;
  const value = await fixture.adapter.read('gm', 'wolfAttackState/current', {
    serverOnly: true, deadlineAt, onSnapshot: async outcome => { observed.push(plain(outcome)); },
  });
  assert.deepEqual(plain(value), { id: 'current', ...resolvedAttack });
  assert.deepEqual(fixture.counts, { getDoc: 0, getDocFromServer: 1, getDocs: 0, sdkChoice: 0, paints: 0 });
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].metadata, { fromCache: false, hasPendingWrites: false });
  assert.ok(fixture.timeouts.every(timeout => timeout > 0 && timeout <= 4000), 'No new readiness budget.');
});

test('normal document and collection reads keep their existing cache-permitted path', async () => {
  const fixture = sourceReadFixture();
  assert.deepEqual(plain(await fixture.adapter.read('gm', 'wolfAttackState/current')), { id: 'current', ...currentAttack });
  assert.deepEqual(plain(await fixture.adapter.read('gm', 'wolfAttackState/current', { collection: true })),
    [{ id: 'current', ...currentAttack }]);
  assert.equal(fixture.counts.getDoc, 1); assert.equal(fixture.counts.getDocs, 1);
  assert.equal(fixture.counts.getDocFromServer, 0);
});

for (const [label, metadata] of [
  ['cached snapshot', { fromCache: true, hasPendingWrites: false }],
  ['pending local mutation', { fromCache: false, hasPendingWrites: true }],
  ['missing metadata', null],
  ['missing cache evidence', { hasPendingWrites: false }],
  ['missing mutation evidence', { fromCache: false }],
]) {
  test(`server-only reinspection rejects ${label} and retains that already observed metadata`, async () => {
    const fixture = sourceReadFixture({ metadata }), observed = [];
    await assert.rejects(fixture.adapter.read('gm', 'wolfAttackState/current', {
      serverOnly: true, deadlineAt: Date.now() + 4000, onSnapshot: outcome => { observed.push(plain(outcome)); },
    }));
    assert.equal(fixture.counts.getDocFromServer, 1); assert.equal(fixture.counts.getDoc, 0);
    assert.equal(observed.length, 1);
  });
}

for (const code of ['unavailable', 'permission-denied']) {
  test(`server-only ${code} never falls back to a cached document or an SDK retry`, async () => {
    const fixture = sourceReadFixture({ serverError: Object.assign(new Error('Private SDK details stay in browser'), { code }) });
    const observed = [];
    await assert.rejects(fixture.adapter.read('gm', 'wolfAttackState/current', {
      serverOnly: true, deadlineAt: Date.now() + 4000, onSnapshot: outcome => { observed.push(plain(outcome)); },
    }), error => error.code === code && !error.message.includes('Private SDK'));
    assert.deepEqual(observed, [{ status: 'error', code }]);
    assert.equal(fixture.counts.getDocFromServer, 1); assert.equal(fixture.counts.getDoc, 0);
  });
}

for (const [label, role, suffix, extra] of [
  ['other role', 'admiral', 'wolfAttackState/current', {}],
  ['other document', 'gm', 'wolfAttackAudience/current', {}],
  ['collection', 'gm', 'wolfAttackState/current', { collection: true }],
  ['expired deadline', 'gm', 'wolfAttackState/current', { deadlineAt: 0 }],
]) {
  test(`the narrow server-only route refuses ${label} before any document read`, async () => {
    const fixture = sourceReadFixture();
    await assert.rejects(fixture.adapter.read(role, suffix, { serverOnly: true, deadlineAt: Date.now() + 4000, ...extra }));
    assert.equal(fixture.reads.length, 0);
  });
}

function reinspectionRecord(fixture) {
  const records = fixture.records.filter(row => row.stage === 'current combat closed boarding source reinspection');
  assert.equal(records.length, 1, 'Retain exactly the already observed single-read outcome.');
  const record = records[0];
  assert.equal(record.gameplayCredit, false); assert.equal(record.actionCredit, false); assert.equal(record.acceptanceCredit, false);
  assert.equal(record.sourceReinspection.readSource, 'server-only');
  assert.equal(record.sourceReinspection.readCount, 1);
  for (const privateValue of [sessionId, uid, originalActor.instanceId, currentAttack.attackId,
    'private-target-uid', 'private-contact-id']) assert.equal(JSON.stringify(record).includes(privateValue), false);
  return record.sourceReinspection;
}

test('mounted GM exact SDK denial resolves through one server-only reinspection with zero credit', async () => {
  const fixture = sourceReadFixture();
  const result = await fixture.run();
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.equal(result.actionCredit, false); assert.equal(result.acceptanceCredit, false);
  assert.deepEqual(result.readDenial.reply, deniedReply);
  assert.deepEqual(fixture.counts, { getDoc: 1, getDocFromServer: 1, getDocs: 0, sdkChoice: 1, paints: 0 });
  assert.deepEqual(reinspectionRecord(fixture).tuple, { sameSession: true, sameAttack: true,
    turn: 1, revision: 27, status: 'resolved', currentStep: 'resolved', airspaceLocked: false });
  assert.deepEqual(reinspectionRecord(fixture).metadata, { fromCache: false, hasPendingWrites: false });
});

test('captured live declared boarding source stays pending when the denied read sees the same locked revision', async () => {
  const captured = { attackId: 'private-native-attack', turn: 1, revision: 33,
    status: 'declared', currentStep: 'boarding', airspaceLocked: true };
  const fixture = sourceReadFixture({ attack: captured, serverValue: captured });
  const result = await fixture.run();
  assert.equal(result.status, 'source-pending');
  assert.equal(result.gameplayCredit, false);
  assert.equal(result.actionCredit, false);
  assert.equal(result.acceptanceCredit, false);
  assert.deepEqual(fixture.counts, { getDoc: 1, getDocFromServer: 1, getDocs: 0, sdkChoice: 1, paints: 0 });
  assert.deepEqual(reinspectionRecord(fixture).tuple, { sameSession: null, sameAttack: true,
    turn: 1, revision: 33, status: 'declared', currentStep: 'boarding', airspaceLocked: true });
  assert.deepEqual(reinspectionRecord(fixture).metadata, { fromCache: false, hasPendingWrites: false });
});

for (const [label, change] of [
  ['unchanged boarding tuple', { ...currentAttack }],
  ['unchanged revision', { ...resolvedAttack, revision: 26 }],
  ['wrong original attack', { ...resolvedAttack, attackId: 'another-private-attack' }],
  ['wrong session', { ...resolvedAttack, sessionId: 'another-private-session' }],
  ['wrong cycle', { ...resolvedAttack, turn: 2 }],
  ['still locked', { ...resolvedAttack, airspaceLocked: true }],
  ['unresolved step', { ...resolvedAttack, currentStep: 'boarding' }],
  ['missing document', null],
]) {
  test(`the actual single server read records then rejects ${label} without retry`, async () => {
    const fixture = sourceReadFixture({ serverValue: change });
    await assert.rejects(fixture.run(), /same newer resolved, unlocked attack/);
    assert.equal(fixture.counts.getDoc, 1); assert.equal(fixture.counts.getDocFromServer, 1);
    assert.equal(fixture.counts.sdkChoice, 1); assert.equal(fixture.counts.paints, 0);
    reinspectionRecord(fixture);
  });
}

for (const [label, drift] of [
  ['UID', { uidHash: 'replacement-account-hash' }],
  ['GM instance', { instanceId: 'replacement-instance' }],
  ['owned GM lease', { gmInstanceOwned: false }],
  ['connection generation', { connectionGeneration: 2 }],
  ['identity hydration', { identityHydrationRevision: 3 }],
  ['same manual cycle', { cycle: 2 }],
]) {
  test(`original GM ${label} remains fenced after the actual server reinspection`, async () => {
    const fixture = sourceReadFixture({ afterServer: target => Object.assign(target.actor, drift) });
    await assert.rejects(fixture.run(), error => {
      for (let cause = error; cause; cause = cause.cause) if (cause.code === deniedReply.code && cause.message === deniedReply.message) return true;
      return false;
    });
    assert.equal(fixture.counts.getDocFromServer, 1); assert.equal(fixture.counts.sdkChoice, 1);
    assert.equal(fixture.counts.paints, 0); reinspectionRecord(fixture);
  });
}

test('an SDK code outside the original exact classification never enters the server reinspection route', async () => {
  const fixture = sourceReadFixture({ sdkReply: { ...deniedReply, code: 'functions/permission-denied' } });
  await assert.rejects(fixture.run());
  assert.equal(fixture.counts.getDoc, 1); assert.equal(fixture.counts.getDocFromServer, 0);
  assert.equal(fixture.counts.sdkChoice, 1); assert.equal(fixture.records.length, 1);
});

for (const code of ['unavailable', 'permission-denied']) {
  test(`mounted reinspection retains only its already observed ${code} outcome and the original SDK denial`, async () => {
    const fixture = sourceReadFixture({ serverError: Object.assign(new Error('private-target-uid'), { code }) });
    await assert.rejects(fixture.run(), error => error.cause?.code === deniedReply.code && error.cause?.message === deniedReply.message);
    const record = reinspectionRecord(fixture);
    assert.equal(record.status, 'failed'); assert.equal(record.code, code); assert.equal(record.tuple, null);
    assert.equal(fixture.counts.getDocFromServer, 1); assert.equal(fixture.counts.getDoc, 1);
  });
}

test('malformed private tuple fields remain bounded diagnostics and fail the original source assertion', async () => {
  const fixture = sourceReadFixture({ serverValue: { ...resolvedAttack,
    revision: { secret: 'private-target-uid' }, status: 'private-contact-id', currentStep: 'private-target-uid' } });
  await assert.rejects(fixture.run(), /same newer resolved, unlocked attack/);
  const record = reinspectionRecord(fixture);
  assert.deepEqual(record.tuple, { sameSession: true, sameAttack: true, turn: 1,
    revision: null, status: null, currentStep: null, airspaceLocked: false });
  assert.equal(fixture.counts.getDocFromServer, 1);
});

const baseSource = await readFile(new URL('./pc10-base-combat-deduction-ui-proof.mjs', import.meta.url), 'utf8');
const gmReaderSource = baseSource.match(/ {2}async function readGm\([^)]*\) \{[\s\S]*?\n {2}\}/);
assert.ok(gmReaderSource, 'Compile the actual Base original-GM read wrapper.');
function baseReaderFixture({ actorBefore = originalActor, actorAfter = originalActor } = {}) {
  const calls = [], observations = [], waits = [];
  const gm = { observe: async () => {
    observations.push(true); return observations.length === 1 ? actorBefore : actorAfter;
  } };
  const a = { read: async (...args) => { calls.push(args); return resolvedAttack; } };
  const waitForOriginalBaseActor = async ({ inspect, original }) => {
    waits.push(true); const current = await inspect(); assertOriginalBaseActor(current, original); return current;
  };
  const reader = Function('gm', 'originalGm', 'a', 'assert', 'assertOriginalBaseActor', 'waitForOriginalBaseActor',
    `return (${gmReaderSource[0].trim()});`)(gm, originalActor, a, assert, assertOriginalBaseActor, waitForOriginalBaseActor);
  return { reader, calls, waits };
}

test('the actual Base GM wrapper forwards the single-read mode and unchanged deadline without a fresh readiness wait', async () => {
  const fixture = baseReaderFixture();
  const options = { serverOnly: true, deadlineAt: Date.now() + 4000, onSnapshot: () => {} };
  assert.deepEqual(await fixture.reader('wolfAttackState/current', options), resolvedAttack);
  assert.deepEqual(fixture.calls, [['gm', 'wolfAttackState/current', options]]);
  assert.equal(fixture.waits.length, 0);
});

for (const position of ['before', 'after']) {
  test(`the actual Base GM wrapper preserves original instance authority ${position} the server read`, async () => {
    const changed = { ...originalActor, instanceId: 'replacement-instance' };
    const fixture = baseReaderFixture(position === 'before' ? { actorBefore: changed } : { actorAfter: changed });
    await assert.rejects(fixture.reader('wolfAttackState/current', { serverOnly: true, deadlineAt: Date.now() + 4000 }));
    assert.equal(fixture.calls.length, position === 'before' ? 0 : 1);
  });
}

test('the actual Base GM wrapper refuses an expired single-read budget before any source read', async () => {
  const fixture = baseReaderFixture();
  await assert.rejects(fixture.reader('wolfAttackState/current', { serverOnly: true, deadlineAt: 0 }));
  assert.equal(fixture.calls.length, 0);
});

test('the actual Base tools callback forwards the narrow read options into its original-GM wrapper', async () => {
  const source = baseSource.match(/read: (\(_role, suffix(?:, options)?\) => readGm\(suffix(?:, options)?\))/);
  assert.ok(source, 'Use the actual composed Base read callback.');
  const calls = [];
  const read = Function('readGm', `return (${source[1]});`)(async (...args) => { calls.push(args); return resolvedAttack; });
  const options = { serverOnly: true, deadlineAt: 12345 };
  assert.deepEqual(await read('gm', 'wolfAttackState/current', options), resolvedAttack);
  assert.deepEqual(calls, [['wolfAttackState/current', options]]);
});
