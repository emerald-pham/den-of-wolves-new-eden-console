import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { createContext, Script, SyntheticModule } from 'node:vm';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { assertWolfChoiceActor, observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';

// Actual adapter and serialized callbacks; inert native authority only. No
// browser, Auth, network, normal resume invocation, gameplay or acceptance.
const roleId = 'executive-officer', sessionId = 'native-identity-session';
const uidFor = role => `private-original-${role}`;
const hash = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const plain = value => JSON.parse(JSON.stringify(value));

function fixture({ pending = false, actorRoleId = roleId, startRole = actorRoleId,
  route = actorRoleId === 'press-officer' ? '#/press' : `#/ships/aegis/roles/${actorRoleId}`,
  sourceChange = {}, memberChange = {}, genericChange = {}, onClick = () => {}, onMetadata = () => {} } = {}) {
  let currentRole = startRole, path = route, documentTimeOrigin = 1000;
  const targetPath = actorRoleId === 'press-officer' ? '#/press' : `#/ships/aegis/roles/${actorRoleId}`;
  const calls = [], callbacks = [], timeouts = [], accepted = [];
  const f = { calls, callbacks, timeouts, accepted, sdkCalls: 0, metadataReads: 0 };
  const member = role => ({ uid: uidFor(role), role: 'player', sessionId,
    assignedRoleId: role, activeConsoleRoleId: role, fleetGroupId: 'native-fleet',
    seatId: `native-seat-${role}`, connectionGeneration: pending ? 12 : 13,
    connected: true, replacementRoleId: null, replacementStatus: null, ...memberChange });
  f.store = { session: { id: sessionId, phase: 'active', currentTurn: 1,
    turnPhase: { airspace: { state: 'restricted' }, progression: 'manual' },
    turnState: { phase: 'team' } }, me: member(startRole),
    identityHydrationRevision: pending ? 0 : 1,
    connection: 'live', sessionSnapshotFreshness: 'server' };
  Object.assign(f.store, sourceChange);
  f.authUid = uidFor(startRole);
  f.resume = () => {
    f.store.me = { ...f.store.me, connectionGeneration: 13 };
    f.store.identityHydrationRevision = 1;
    accepted.push({ generation: 13, hydration: 1 });
  };
  f.replaceDocument = () => { documentTimeOrigin += 1000; };
  const observe = async () => ({ hasAuth: !!f.authUid, sameActor: f.authUid === f.store.me?.uid,
    uidHash: hash(f.authUid), sessionId: f.store.session?.id, profileRoleId: currentRole,
    assignedRoleId: f.store.me?.assignedRoleId, activeConsoleRoleId: f.store.me?.activeConsoleRoleId,
    playerRole: f.store.me?.role, phase: f.store.session?.phase, cycle: f.store.session?.currentTurn,
    connection: f.store.connection, freshness: f.store.sessionSnapshotFreshness,
    airspace: f.store.session?.turnPhase?.airspace.state, turnStatePhase: f.store.session?.turnState?.phase,
    phaseProgression: f.store.session?.turnPhase?.progression, ...genericChange });
  const runCallback = async (callback, input) => {
    f.metadataReads += 1;
    const browser = createContext({ input, crypto: webcrypto, TextEncoder,
      performance: { timeOrigin: documentTimeOrigin } });
    assert.equal(new Script('[typeof process,typeof require,typeof Buffer].join(",")').runInContext(browser),
      'undefined,undefined,undefined');
    const storeModule = new SyntheticModule(['useSessionStore'], function () {
      this.setExport('useSessionStore', { getState: () => structuredClone(f.store) });
    }, { context: browser });
    const authModule = new SyntheticModule(['auth'], function () {
      this.setExport('auth', () => ({ currentUser: f.authUid ? { uid: f.authUid } : null }));
    }, { context: browser });
    const profileModule = new SyntheticModule(['activeDemoActorProfile'], function () {
      this.setExport('activeDemoActorProfile', { roleId: currentRole, sessionId });
    }, { context: browser });
    const modules = new Map([['/src/store/useSessionStore.ts', storeModule],
      ['/src/lib/firebase.ts', authModule], ['/src/lib/demoActorContext.ts', profileModule]]);
    for (const module of modules.values()) { await module.link(() => assert.fail('No fixture imports.')); await module.evaluate(); }
    const script = new Script(`(${callback.toString()})(input)`, {
      importModuleDynamically: async name => {
        assert.ok(modules.has(name), `No extra SDK or source module: ${name}`); return modules.get(name);
      },
    });
    const value = plain(await script.runInContext(browser));
    assert.equal(JSON.stringify(value).includes('private-original-'), false, 'Return only the existing private UID hash.');
    callbacks.push(value); onMetadata(f, callbacks.length); return value;
  };
  const link = (name, target) => ({
    isVisible: async () => true,
    waitFor: async ({ timeout }) => { timeouts.push(timeout); },
    click: async () => {
      calls.push({ name, generation: f.store.me.connectionGeneration, hydration: f.store.identityHydrationRevision });
      path = target; onClick(f, calls.length);
    }, first() { return this; },
  });
  const page = {
    url: () => `http://native.invalid/${path}`,
    evaluate: runCallback,
    goto: async (url, { timeout }) => {
      calls.push({ name: 'ordinary-profile-navigation' }); timeouts.push(timeout);
      const next = new URL(url); currentRole = next.searchParams.get('demoActor').split('~')[1];
      path = next.hash; documentTimeOrigin += 1000;
      f.authUid = uidFor(currentRole); f.store.me = member(currentRole);
      f.store.identityHydrationRevision = pending ? 0 : 1;
    },
    waitForURL: async (predicate, { timeout }) => { timeouts.push(timeout); assert.ok(predicate(new URL(page.url()))); },
    getByRole: (_kind, { name }) => {
      if (name === "Enter this actor's stations") return link(name, '#/console');
      if (name === 'Back to stations') return link(name, '#/console');
      if (name === 'Press Officer') return link(name, '#/press');
      throw new Error(`Unexpected control ${String(name)}`);
    },
    locator: selector => {
      assert.equal(selector, `a[href$="/roles/${actorRoleId}"]`); return link('original-role-chooser', targetPath);
    },
  };
  const crew = { page, observe, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    until: async (_description, predicate, timeout) => {
      timeouts.push(timeout); const state = await observe(); assert.ok(predicate(state)); return state;
    }, callable: async () => { f.sdkCalls += 1; assert.fail('No SDK invocation for selection readiness.'); } };
  const gm = { observe: async () => ({ playerRole: 'gm' }) };
  const adapter = createTwoBrowserGameplay({ gm, crew, initial: { sessionId, joinCode: 'NATIVE' },
    roster: [{ roleId: actorRoleId, uidHash: hash(uidFor(actorRoleId)) }], directory: '/tmp/native-unused' });
  f.crew = crew; f.adapter = adapter;
  f.run = options => adapter.select(actorRoleId, { deadlineAt: Date.now() + 2500, ...options });
  return f;
}

const turn = () => new Promise(resolve => setImmediate(resolve));

test('server feed cannot release a new document before its original normal resume accepts identity', async () => {
  const f = fixture({ pending: true }); let selected;
  const operation = f.run({ enter: false }).then(value => { selected = { generation: f.store.me.connectionGeneration,
    hydration: f.store.identityHydrationRevision }; return value; });
  try {
    await turn(); await turn();
    assert.equal(selected, undefined, 'Live/server cache plus original Auth is not accepted document identity.');
    assert.equal(f.sdkCalls, 0);
  } finally { f.resume(); await operation; }
  assert.deepEqual(selected, { generation: 13, hydration: 1 });
  assert.ok(f.callbacks.some(value => value.identityHydrationRevision === 0));
  assert.ok(f.callbacks.some(value => value.connectionGeneration === 13 && value.identityHydrationRevision === 1));
});

test('ordinary role reselection does not click cached stations before deferred initial identity hydration', async () => {
  const f = fixture({ pending: true, startRole: 'shepherd-engineer', route: '#/console' });
  const operation = f.run();
  try {
    await turn(); await turn();
    assert.deepEqual(f.calls.map(value => value.name), ['ordinary-profile-navigation']);
  } finally { f.resume(); await operation; }
  assert.deepEqual(f.calls.map(value => value.name),
    ['ordinary-profile-navigation', "Enter this actor's stations", 'original-role-chooser']);
  assert.ok(f.calls.slice(1).every(value => value.generation === 13 && value.hydration === 1));
  assert.equal(f.sdkCalls, 0);
});

test('an already accepted original document follows normal Back and chooser without another resume or reload', async () => {
  const f = fixture({ route: '#/brief' }); await f.run();
  assert.deepEqual(f.calls.map(value => value.name), ['Back to stations', 'original-role-chooser']);
  assert.ok(f.metadataReads > 0); assert.equal(f.sdkCalls, 0); assert.equal(f.accepted.length, 0);
});

for (const [field, mutate] of [
  ['connectionGeneration', f => { f.store.me.connectionGeneration = 14; }],
  ['identityHydrationRevision', f => { f.store.identityHydrationRevision = 2; }],
  ['document', f => { f.replaceDocument(); }],
  ['fleetGroupId', f => { f.store.me.fleetGroupId = 'foreign-fleet'; }],
]) test(`normal navigation cannot rebind an accepted original ${field}`, async () => {
  const f = fixture({ route: '#/brief', onClick: (value, count) => { if (count === 1) mutate(value); } });
  await assert.rejects(f.run(), /changed|original|Original/i);
  assert.equal(f.calls.length, 1); assert.equal(f.sdkCalls, 0);
});

test('missing document hydration evidence fails instead of accepting generic live/server', async () => {
  const f = fixture(); delete f.store.identityHydrationRevision;
  await assert.rejects(f.run({ enter: false }), /hydration|Hydration/); assert.equal(f.sdkCalls, 0);
});

test('a zero-hydration document uses only the supplied deadline and cannot become an admitted actor', async () => {
  const f = fixture({ pending: true }), deadlineAt = Date.now() + 40;
  await assert.rejects(f.run({ enter: false, deadlineAt }), /deadline|Deadline/);
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0); assert.equal(f.accepted.length, 0);
});

for (const generation of [undefined, null, -1, 1.5]) {
  test(`accepted hydration with invalid generation ${String(generation)} cannot return a member`, async () => {
    const f = fixture(); f.store.me.connectionGeneration = generation;
    await assert.rejects(f.run({ enter: false }), /generation|Generation/); assert.equal(f.sdkCalls, 0);
  });
}

for (const [field, value] of [
  ['uid', 'private-foreign-user'], ['sessionId', 'foreign-session'],
  ['assignedRoleId', 'wing-commander'], ['role', 'gm'], ['connected', false],
]) test(`serialized current member ${field} cannot be hidden by a matching generic observation`, async () => {
  const f = fixture({ genericChange: { hasAuth: true, sameActor: true, assignedRoleId: roleId, playerRole: 'player' } });
  f.store.me[field] = value;
  await assert.rejects(f.run({ enter: field === 'assignedRoleId' })); assert.equal(f.sdkCalls, 0); assert.equal(f.calls.length, 0);
});

test('a generic held-console projection cannot release a different actual station', async () => {
  const f = fixture({ genericChange: { activeConsoleRoleId: roleId } });
  f.store.me.activeConsoleRoleId = 'wing-commander';
  await assert.rejects(f.run({ deadlineAt: Date.now() + 40 })); assert.equal(f.sdkCalls, 0);
});

test('the original deadline also fences an already expired ordinary document navigation', async () => {
  const f = fixture({ startRole: 'shepherd-engineer', route: '#/console' });
  await assert.rejects(f.run({ deadlineAt: Date.now() - 1 }), /deadline|Deadline/);
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
});

test('a legitimate different current primary permits original-account reading without acquiring that console', async () => {
  const f = fixture({ route: '#/console', memberChange: { assignedRoleId: 'wing-commander',
    activeConsoleRoleId: 'wing-commander', seatId: 'wing-commander' } });
  f.store.session.phase = 'casting';
  await f.run({ enter: false });
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
  assert.ok(f.callbacks.some(value => value.assignedRoleId === 'wing-commander'));
});

test('selection accepts current initial resume generation but a held combat operation still rejects subsequent generation drift', async () => {
  const f = fixture(); await f.run();
  const original = await observeWolfChoiceActor(f.crew);
  assert.equal(original.connectionGeneration, 13); assert.equal(original.identityHydrationRevision, 1);
  f.store.me.connectionGeneration = 14;
  assert.throws(() => assertWolfChoiceActor({ ...original, connectionGeneration: 14 }, original), /connectionGeneration changed/);
  assert.equal(f.sdkCalls, 0);
});

test('accepted normal resume DTO may omit connected while explicit disconnected membership still fails', async () => {
  // Functions resumeSession's player reply retains UID/session/group/generation
  // but omits connected; the current member listener supplies that optional bit.
  const f = fixture(); delete f.store.me.connected;
  await f.run({ enter: false });
  assert.equal(f.sdkCalls, 0);
  const disconnected = fixture(); disconnected.store.me.connected = false;
  await assert.rejects(disconnected.run({ enter: false }));
});

test('the original normally selected Press station uses its active console with no core primary assignment or seat', async () => {
  const f = fixture({ actorRoleId: 'press-officer',
    memberChange: { assignedRoleId: null, seatId: null, activeConsoleRoleId: 'press-officer' } });
  await f.run();
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
  assert.ok(f.callbacks.some(value => value.assignedRoleId === null && value.activeConsoleRoleId === 'press-officer'));
});

test('Press account read mode can select its original released station without claiming Press', async () => {
  const f = fixture({ actorRoleId: 'press-officer', route: '#/brief',
    memberChange: { assignedRoleId: null, seatId: null, activeConsoleRoleId: null } });
  await f.run({ enter: false });
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
});

for (const assignment of ['executive-officer', 'press-officer']) {
  test(`a Press label cannot grant a held Press station with wrong primary assignment ${assignment}`, async () => {
    const f = fixture({ actorRoleId: 'press-officer',
      memberChange: { assignedRoleId: assignment, seatId: null, activeConsoleRoleId: 'press-officer' } });
    await assert.rejects(f.run()); assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
  });
}

test('an active Press label cannot grant that station to an original account holding a core seat', async () => {
  const f = fixture({ actorRoleId: 'press-officer',
    memberChange: { assignedRoleId: null, seatId: 'executive-officer', activeConsoleRoleId: 'press-officer' } });
  await assert.rejects(f.run()); assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
});

test('a normally admitted original core account with no assigned station remains available for an account read', async () => {
  const f = fixture({ route: '#/brief', memberChange: { assignedRoleId: null, activeConsoleRoleId: null, seatId: null } });
  await f.run({ enter: false });
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
  assert.ok(f.callbacks.some(value => value.assignedRoleId === null));
});

test('account read selection cannot manufacture a held core station from a null primary assignment', async () => {
  const f = fixture({ memberChange: { assignedRoleId: null, activeConsoleRoleId: roleId, seatId: null } });
  await assert.rejects(f.run()); assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
});

for (const [name, memberChange] of [
  ['current Comms replacement', { assignedRoleId: null, activeConsoleRoleId: null, seatId: null,
    replacementRoleId: 'comms-officer', replacementStatus: null }],
  ['awaiting reassignment', { assignedRoleId: null, activeConsoleRoleId: null, seatId: null,
    replacementStatus: 'awaiting-re-role' }],
  ['destroyed-ship escape', { assignedRoleId: null, activeConsoleRoleId: null, seatId: null,
    escapeState: { status: 'pending', shipId: 'aegis', revision: 1, destructionEventId: 'native-destruction' } }],
]) test(`${name} permits original-account selection for an entitled read without primary-role credit`, async () => {
  const f = fixture({ route: '#/brief', memberChange });
  await f.run({ enter: false });
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
});

for (const [name, memberChange] of [
  ['current replacement', { replacementRoleId: 'comms-officer' }],
  ['awaiting reassignment', { replacementStatus: 'awaiting-re-role' }],
  ['destroyed-ship escape', { escapeState: { status: 'pending', shipId: 'aegis', revision: 1,
    destructionEventId: 'native-destruction' } }],
]) test(`${name} cannot acquire a historical printed console through a matching cached primary/active label`, async () => {
  const f = fixture({ memberChange });
  await assert.rejects(f.run()); assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
});

for (const [field, mutate] of [
  ['connectionGeneration', f => { f.store.me.connectionGeneration = 14; }],
  ['identityHydrationRevision', f => { f.store.identityHydrationRevision = 2; }],
  ['fleetGroupId', f => { f.store.me.fleetGroupId = 'foreign-fleet'; }],
  ['assignedRoleId', f => { f.store.me.assignedRoleId = 'wing-commander'; }],
]) test(`unassigned account read mode still rejects original ${field} drift`, async () => {
  const f = fixture({ memberChange: { assignedRoleId: null, activeConsoleRoleId: null, seatId: null },
    onMetadata: (value, count) => { if (count === 1) mutate(value); } });
  await assert.rejects(f.run({ enter: false }), /changed|original|Original/i);
  assert.equal(f.calls.length, 0); assert.equal(f.sdkCalls, 0);
});
