import assert from 'node:assert/strict';
import test from 'node:test';
import * as helpers from './pc10-candidate-proof-helpers.mjs';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';

const stale = 'Candidate session authority changed. Refresh the live report.';
const actor = (changes = {}) => ({ sessionId: 'ordinary-ring', uidHash: 'original-dione-captain',
  profileRoleId: 'dione-captain', assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  playerRole: 'player', phase: 'active', cycle: 4, fleetGroupId: 'actual-group', connectionGeneration: 1,
  identityHydrationRevision: 3, replacementRoleId: null, replacementStatus: null, seatId: null,
  airspace: 'open', turnStatePhase: 'coordination', phaseProgression: 'manual',
  hasAuth: true, sameActor: true, connection: 'live', freshness: 'server', pendingCommandCount: 0, ...changes });
const painted = (changes = {}) => ({ panelCount: 1, panelVisible: true, headerCount: 1,
  cycle: 4, revision: 8, messages: [], receiving: false, pendingAttempt: false,
  control: { count: 1, visible: true, enabled: true }, refresh: { count: 1, visible: true, enabled: true }, ...changes });
const hydrating = (changes = {}) => painted({ headerCount: 0, cycle: undefined, revision: undefined,
  receiving: true, control: { count: 0, visible: false, enabled: false }, ...changes });
const previous = () => ({ endpoint: 'executeCandidateAction', request: { sessionId: 'ordinary-ring',
  expectedGroupId: 'actual-group', code: 'N' }, result: { type: 'candidate-action-result',
  status: 'committed', sessionId: 'ordinary-ring', code: 'N', revision: 8 } });

function fixture(changes = {}) {
  let time = 0, actorReads = 0, panelReads = 0, refreshes = 0, choices = 0;
  const events = [];
  const options = { observeActor: async () => { actorReads++; return actor(); },
    inspectPanel: async () => { panelReads++; return painted(); }, expectedReceipt: previous(),
    refresh: async ({ deadlineAt }) => { assert.equal(deadlineAt, 35_000); events.push('refresh'); refreshes++; },
    choose: async ready => { events.push('choose'); choices++; return { ...ready, actualReceipt: true }; },
    now: () => time, wait: async () => { time += 100; }, ...changes };
  return { options, events, get time() { return time; }, set time(value) { time = value; },
    get actorReads() { return actorReads; }, get panelReads() { return panelReads; },
    get refreshes() { return refreshes; }, get choices() { return choices; } };
}
async function run(f) {
  assert.equal(typeof helpers.waitForCandidateChoice, 'function', 'The current candidate choice needs its bounded mounted-control readiness leaf.');
  return helpers.waitForCandidateChoice(f.options);
}

test('late candidate hydration waits for the actual source header and exact enabled crossing before choosing', async () => {
  let reads = 0;
  const f = fixture({ inspectPanel: async () => ++reads < 3 ? hydrating() : painted() });
  const result = await run(f);
  assert.equal(result.cycle, 4); assert.equal(result.revision, 8);
  assert.equal(result.original.uidHash, actor().uidHash); assert.equal(result.deadlineAt, 35_000);
  assert.equal(f.time, 200); assert.equal(f.refreshes, 0); assert.equal(f.choices, 1);
});

test('only the exact stale-cursor status uses one existing refresh and then current paint, even when that status remains', async () => {
  let reads = 0;
  const f = fixture({ inspectPanel: async () => ++reads < 3
    ? hydrating({ messages: [stale] }) : painted({ messages: [stale] }) });
  const result = await run(f);
  assert.equal(result.revision, 8); assert.deepEqual(f.events, ['refresh', 'choose']);
  assert.equal(f.refreshes, 1); assert.equal(f.choices, 1);
});

test('a residual classified status beside an already current enabled crossing does not refresh away that control', async () => {
  const f = fixture({ inspectPanel: async () => painted({ messages: [stale] }) });
  await run(f); assert.equal(f.refreshes, 0); assert.equal(f.choices, 1);
});

test('a persistent stale read can refresh once but receives no choice or deadline restart', async () => {
  const f = fixture({ inspectPanel: async () => hydrating({ messages: [stale] }) });
  await assert.rejects(run(f), /candidate choice.*deadline/i);
  assert.equal(f.time, 35_000); assert.equal(f.refreshes, 1); assert.equal(f.choices, 0);
});

for (const [reason, changes] of Object.entries({
  'UID': { uidHash: 'replacement-account' }, 'session': { sessionId: 'foreign-session' },
  'group': { fleetGroupId: 'foreign-group' }, 'generation': { connectionGeneration: 2 },
  'profile role': { profileRoleId: 'executive-officer' }, 'assigned role': { assignedRoleId: 'dione-engineer' },
  'console': { activeConsoleRoleId: null }, 'player role': { playerRole: 'gm' },
  'identity hydration': { identityHydrationRevision: 4 }, 'replacement': { replacementRoleId: 'new-role' },
  'seat': { seatId: 'new-seat' }, 'phase': { phase: 'debrief' }, 'cycle': { cycle: 5 },
  'airspace': { airspace: 'restricted' }, 'turn phase': { turnStatePhase: 'team' },
  'cached projection': { freshness: 'cache' }, 'offline projection': { connection: 'offline' },
  'authentication': { hasAuth: false }, 'different current actor': { sameActor: false },
})) test(`a changed ${reason} cannot refresh or choose for the original candidate actor`, async () => {
  let reads = 0;
  const f = fixture({ observeActor: async () => actor(++reads === 1 ? {} : changes),
    inspectPanel: async () => hydrating({ messages: [stale] }) });
  await assert.rejects(run(f), /changed|original|live|equal|true/i);
  assert.equal(f.refreshes, 0); assert.equal(f.choices, 0);
});

test('an original missing group or connection generation cannot acquire candidate control', async () => {
  for (const changes of [{ fleetGroupId: null }, { connectionGeneration: null }, { activeConsoleRoleId: null }]) {
    const f = fixture({ observeActor: async () => actor(changes) });
    await assert.rejects(run(f), /original|group|generation|console/i);
    assert.equal(f.choices, 0);
  }
});

test('an unclassified source error is not refreshable, even beside a valid crossing', async () => {
  for (const messages of [['Candidate operations unavailable.'], [` ${stale}`], ['Different authority rejection'], [stale, 'Other error']]) {
    const f = fixture({ inspectPanel: async () => painted({ messages }) });
    await assert.rejects(run(f), /unclassified.*candidate/i);
    assert.equal(f.refreshes, 0); assert.equal(f.choices, 0);
  }
});

test('a pending mutation, transmitting choice, or original retry never becomes a new crossing', async () => {
  const cases = [
    { observeActor: async () => actor({ pendingCommandCount: 1 }) },
    { inspectPanel: async () => painted({ pendingAttempt: true }) },
    { inspectPanel: async () => painted({ messages: ['Transmitting candidate choice…'] }) },
  ];
  for (const options of cases) {
    const f = fixture(options);
    await assert.rejects(run(f), /pending.*candidate|candidate.*pending/i);
    assert.equal(f.refreshes, 0); assert.equal(f.choices, 0);
  }
});

test('wrong printed cycle, unsafe revision or changed latest actual receipt cannot enable a crossing', async () => {
  for (const changes of [{ cycle: 3 }, { revision: -1 }, { revision: 8.5 }, { revision: 9 }, { headerCount: 2 }]) {
    const f = fixture({ inspectPanel: async () => painted(changes) });
    await assert.rejects(run(f), /current.*cycle|revision|header/i);
    assert.equal(f.refreshes, 0); assert.equal(f.choices, 0);
  }
  for (const receipt of [
    { ...previous(), request: { ...previous().request, expectedGroupId: 'foreign-group' } },
    { ...previous(), result: { ...previous().result, sessionId: 'foreign-session' } },
    { ...previous(), result: { ...previous().result, status: 'stale' } },
  ]) {
    const f = fixture({ expectedReceipt: receipt });
    await assert.rejects(run(f), /receipt|group|session|stale/i); assert.equal(f.choices, 0);
  }
});

test('duplicate panels or requested crossing controls are rejected instead of choosing the first', async () => {
  for (const changes of [{ panelCount: 2 }, { control: { count: 2, visible: true, enabled: true } }]) {
    const f = fixture({ inspectPanel: async () => painted(changes) });
    await assert.rejects(run(f), /one|unique|duplicate|cardinality/i); assert.equal(f.choices, 0);
  }
});

test('absent or disabled exact controls remain uncredited through the same deadline', async () => {
  for (const changes of [
    { panelCount: 0, panelVisible: false }, { panelVisible: false },
    { control: { count: 0, visible: false, enabled: false } },
    { control: { count: 1, visible: true, enabled: false } },
  ]) {
    const f = fixture({ inspectPanel: async () => painted(changes), deadlineAt: 300 });
    await assert.rejects(run(f), /candidate choice.*deadline/i);
    assert.equal(f.time, 300); assert.equal(f.refreshes, 0); assert.equal(f.choices, 0);
  }
});

test('the mounted refresh must be unique, visible and enabled; missing recovery remains pending without a fallback', async () => {
  for (const refresh of [{ count: 0, visible: false, enabled: false }, { count: 1, visible: false, enabled: true },
    { count: 1, visible: true, enabled: false }]) {
    const f = fixture({ inspectPanel: async () => hydrating({ messages: [stale], refresh }), deadlineAt: 300 });
    await assert.rejects(run(f), /candidate choice.*deadline/i); assert.equal(f.refreshes, 0); assert.equal(f.choices, 0);
  }
});

test('authority withdrawn while the refresh awaits is rejected before any resumed crossing', async () => {
  let changed = false;
  const f = fixture({ observeActor: async () => actor(changed ? { fleetGroupId: 'new-group' } : {}),
    inspectPanel: async () => changed ? painted() : hydrating({ messages: [stale] }),
    refresh: async () => { changed = true; } });
  await assert.rejects(run(f), /group.*changed/i); assert.equal(f.choices, 0);
});

test('final control revision changes after readiness cannot use the previous rendered closure', async () => {
  let reads = 0;
  const f = fixture({ expectedReceipt: undefined, inspectPanel: async () => painted({ revision: ++reads === 1 ? 8 : 9 }) });
  await assert.rejects(run(f), /revision.*changed|changed.*revision/i); assert.equal(f.choices, 0);
});

test('initial original observation and optional refresh consume the same 35-second budget', async () => {
  const first = fixture();
  first.options.observeActor = async () => { first.time = 35_000; return actor(); };
  await assert.rejects(run(first), /candidate choice.*deadline/i);
  assert.equal(first.panelReads, 0); assert.equal(first.choices, 0);
  const refreshing = fixture({ inspectPanel: async () => hydrating({ messages: [stale] }) });
  refreshing.options.refresh = async () => { refreshing.time = 35_000; };
  await assert.rejects(run(refreshing), /candidate choice.*deadline/i); assert.equal(refreshing.choices, 0);
});

test('an earlier caller deadline and a late paid response remain failures rather than restarting the budget', async () => {
  const blocked = fixture({ inspectPanel: async () => hydrating(), deadlineAt: 200 });
  await assert.rejects(run(blocked), /candidate choice.*deadline/i); assert.equal(blocked.time, 200);
  const paid = fixture();
  paid.options.choose = async () => { paid.time = 35_000; return { alreadyCommitted: true }; };
  await assert.rejects(run(paid), /candidate choice.*deadline/i);
});

function browserFixture({ mode = 'late', payloadChanges = {}, resultChanges = {}, status = 200 } = {}) {
  let refreshed = 0, clicked = 0, panelReads = 0, responseObserver;
  const events = [], timeouts = [];
  const result = { type: 'candidate-action-result', status: 'committed', sessionId: 'ordinary-ring',
    requestId: 'real-current-request', code: 'N', action: 'ring-passage', revision: 9, outcome: 'crossed', fuelSpent: 5, ...resultChanges };
  const payload = { sessionId: 'ordinary-ring', requestId: 'real-current-request', expectedGroupId: 'actual-group',
    expectedRevision: 8, code: 'N', action: 'ring-passage', shipId: 'dione', coordinate: 'actual-site', ...payloadChanges };
  const control = name => ({ count: async () => 1, isVisible: async () => name !== 'Retry original candidate request',
    isEnabled: async () => true, click: async settings => {
      timeouts.push(settings.timeout);
      if (name === 'Refresh candidate operations') { refreshed++; events.push('refresh'); return; }
      assert.equal(name, 'Cross Ring // dione // five fuel'); clicked++; events.push('cross');
      assert.ok(responseObserver, 'Observe the original real POST before choosing.');
      responseObserver({ status: () => status, json: async () => ({ result }),
        request: () => ({ postDataJSON: () => ({ data: payload }) }) });
    } });
  const panel = { count: async () => 1, isVisible: async () => true,
    innerText: async () => {
      panelReads++;
      const ready = mode === 'stale' ? refreshed > 0 : panelReads >= 3;
      return ready ? 'Cycle 4 // candidate revision 8\nCross Ring // dione // five fuel'
        : 'Receiving current candidate operations…';
    }, getByRole: (role, options = {}) => role === 'status'
      ? { allTextContents: async () => mode === 'stale' ? [stale] : [] }
      : { ...control(options.name), count: async () => options.name === 'Retry original candidate request' ? 0
        : options.name === 'Cross Ring // dione // five fuel' &&
          !(mode === 'stale' ? refreshed > 0 : panelReads >= 3) ? 0 : 1 },
  };
  const surface = { label: 'BrowserB original Dione Captain', observe: async () => actor(), storeModuleUrl: () => '/actual-store.ts',
    page: { evaluate: async (_read, moduleUrl) => {
      assert.equal(moduleUrl, '/actual-store.ts'); events.push('original read-only authority');
      return { sessionId: 'ordinary-ring', fleetGroupId: 'actual-group', connectionGeneration: 1,
        identityHydrationRevision: 3, replacementRoleId: null, replacementStatus: null, seatId: null, connected: true };
    }, getByRole: (role, options) => {
      assert.equal(role, 'region'); assert.deepEqual(options, { name: 'Candidate preparation and actions', exact: true });
      return panel;
    }, waitForResponse: (predicate, settings) => {
      const request = { method: () => 'POST' };
      assert.equal(predicate({ request: () => request, url: () => 'http://127.0.0.1:5021/demo-proof/us-central1/executeCandidateAction' }), true);
      timeouts.push(settings.timeout); events.push('observe POST');
      return new Promise(resolve => { responseObserver = resolve; });
    } } };
  return { surface, result, events, timeouts, get refreshed() { return refreshed; }, get clicked() { return clicked; },
    context: { gm: {}, crew: surface, initial: { sessionId: 'ordinary-ring', joinCode: 'normal-join' },
      roster: [{ roleId: 'dione-captain', uidHash: actor().uidHash }], directory: '/tmp/no-candidate-runtime' } };
}

test('the Ring callback leaf binds the actual panel, one refresh, original actor and captured current assignment payload', async () => {
  const f = browserFixture({ mode: 'stale' });
  const tools = candidateGameplayTools(f.context);
  assert.equal(typeof tools.candidateChoice, 'function');
  let time = 0;
  assert.deepEqual(await tools.candidateChoice(f.surface, 'dione', { now: () => time, wait: async () => { time += 100; } }), f.result);
  assert.equal(f.refreshed, 1); assert.equal(f.clicked, 1);
  assert.ok(f.events.indexOf('observe POST') < f.events.indexOf('cross'));
  assert.ok(f.timeouts.every(value => value > 0 && value <= 35_000));
});

test('the Ring callback waits late paint without refreshing or substituting any getter or SDK mutation', async () => {
  const f = browserFixture(); const tools = candidateGameplayTools(f.context);
  assert.equal(typeof tools.candidateChoice, 'function');
  let time = 0;
  await tools.candidateChoice(f.surface, 'dione', { now: () => time, wait: async () => { time += 100; } });
  assert.equal(f.refreshed, 0); assert.equal(f.clicked, 1);
  assert.equal(f.events.filter(value => value === 'observe POST').length, 1);
  assert.ok(f.timeouts.every(value => value <= 35_000 - time));
});

test('the original Ring UI response must carry the same requested ship, action, group, cycle source revision and session', async () => {
  for (const payloadChanges of [{ shipId: 'aegis' }, { action: 'nebula-jump' }, { expectedRevision: 7 },
    { expectedGroupId: 'other-group' }, { sessionId: 'other-session' }, { code: 'O' }]) {
    const f = browserFixture({ mode: 'stale', payloadChanges });
    const tools = candidateGameplayTools(f.context); assert.equal(typeof tools.candidateChoice, 'function');
    await assert.rejects(tools.candidateChoice(f.surface, 'dione'), /current candidate.*payload|candidate.*request/i);
    assert.equal(f.clicked, 1, 'An unexpected observed response fails and never triggers a replacement mutation.');
  }
});

test('the new mounted leaf preserves original HTTP failure and stale-result assertions without retrying mutations', async () => {
  for (const options of [{ mode: 'stale', status: 403 }, { mode: 'stale', resultChanges: { status: 'stale' } }]) {
    const f = browserFixture(options); const tools = candidateGameplayTools(f.context);
    assert.equal(typeof tools.candidateChoice, 'function');
    await assert.rejects(tools.candidateChoice(f.surface, 'dione'), /executeCandidateAction|current UI state/i);
    assert.equal(f.clicked, 1);
  }
});

test('the entry snapshot cannot discard a pending original mutation merely because the next observation has cleared it', async () => {
  let reads = 0;
  const f = fixture({ observeActor: async () => actor({ pendingCommandCount: ++reads === 1 ? 1 : 0 }) });
  await assert.rejects(run(f), /pending.*candidate|candidate.*pending/i);
  assert.equal(f.choices, 0); assert.equal(f.refreshes, 0);
});

test('an already exhausted surrounding candidate callback deadline cannot begin a new35s leaf', async () => {
  const f = browserFixture({ mode: 'stale' }); f.context.deadlineAt = 0;
  const tools = candidateGameplayTools(f.context); assert.equal(typeof tools.candidateChoice, 'function');
  let time = 0;
  await assert.rejects(tools.candidateChoice(f.surface, 'dione', { now: () => time,
    wait: async () => { time += 100; } }), /candidate choice.*deadline/i);
  assert.equal(f.refreshed, 0); assert.equal(f.clicked, 0);
});
