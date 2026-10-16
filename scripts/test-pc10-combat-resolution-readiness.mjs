import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForWolfChoiceReadiness } from './pc10-combat-choice-readiness.mjs';

// Native counterexamples for the observed rev24 -> resolved rev25 transition.
// No browser, state mutation, physical playtest or gameplay acceptance is implied.
const actor = (change = {}) => ({ hasAuth: true, sameActor: true, sessionId: 'native-session',
  uidHash: 'native-executive', profileRoleId: 'executive-officer', assignedRoleId: 'executive-officer',
  activeConsoleRoleId: 'executive-officer', playerRole: 'player', phase: 'active', cycle: 1,
  fleetGroupId: 'fleet-1', connectionGeneration: 3, identityHydrationRevision: 2,
  replacementRoleId: null, replacementStatus: null, seatId: 'native-seat',
  airspace: 'restricted', turnStatePhase: 'coordination', phaseProgression: 'manual',
  connection: 'live', freshness: 'server', ...change });
const gm = (change = {}) => actor({ uidHash: 'native-gm', profileRoleId: 'gm', assignedRoleId: null,
  activeConsoleRoleId: null, playerRole: 'gm', fleetGroupId: null, seatId: null,
  instanceId: 'native-owned-instance', gmInstanceOwned: true, ...change });
const expected = { sessionId: 'native-session', attackId: 'native-attack', turn: 1,
  revision: 24, status: 'declared', currentStep: 'boarding', airspaceLocked: true };
const resolved = (change = {}) => ({ ...expected, revision: 25, status: 'resolved', currentStep: 'resolved',
  airspaceLocked: false, ...change });

function fixture({ current = resolved(), actorAt = () => actor({ airspace: 'lifted' }),
  gmAt = () => gm({ airspace: 'lifted' }), sourceAt } = {}) {
  const counts = { actors: 0, gms: 0, sources: 0, choices: 0, paints: 0, waits: 0 };
  return { counts, options: { original: actor(), originalGm: gm(), expected, timeoutMs: 60_000,
    deadlineAt: 600, now: () => counts.waits * 200, wait: async () => { counts.waits++; },
    inspectActor: async () => actorAt(++counts.actors), inspectGm: async () => gmAt(++counts.gms),
    inspectAttack: async () => sourceAt ? sourceAt(++counts.sources) : (counts.sources++, current),
    readChoice: async () => { counts.choices++; return { ...expected, type: 'wolf-boarding-special-choice-unavailable', reason: 'no-special-choice' }; },
    inspectPaint: async () => { counts.paints++; return { status: 'source-excluded', reason: 'no-special-choice', explicit: true }; },
  } };
}

test('same original GM and actor observe a resolved unlocked attack as source progress, without accepting another choice', async () => {
  const f = fixture();
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.deepEqual(result.expected, expected);
  assert.equal(f.counts.sources, 1); assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0); assert.equal(f.counts.waits, 0);
});

test('resolution arriving after the original private choice read prevents an obsolete panel from becoming accepted', async () => {
  const f = fixture({ actorAt: n => actor(n <= 2 ? {} : { airspace: 'lifted' }),
    gmAt: n => gm(n <= 2 ? {} : { airspace: 'lifted' }),
    sourceAt: n => n === 1 ? expected : resolved() });
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.equal(f.counts.choices, 1); assert.equal(f.counts.paints, 0); assert.equal(f.counts.waits, 0);
});

test('resolution arriving after paint grants no available-choice credit and never renews its original deadline', async () => {
  const f = fixture({ actorAt: n => actor(n <= 3 ? {} : { airspace: 'lifted' }),
    gmAt: n => gm(n <= 3 ? {} : { airspace: 'lifted' }),
    sourceAt: n => n === 1 ? expected : resolved() });
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.equal(f.counts.choices, 1); assert.equal(f.counts.paints, 1); assert.equal(f.counts.waits, 0);
});

test('lifted airspace needs the same original attack, session, cycle, newer revision and resolved unlocked source', async () => {
  for (const change of [{ attackId: 'foreign' }, { sessionId: 'foreign' }, { turn: 2 }, { revision: 24 },
    { revision: undefined }, { status: 'declared' }, { currentStep: 'boarding' },
    { airspaceLocked: true }, { airspaceLocked: undefined }]) {
    const f = fixture({ current: resolved(change) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options), /airspace/);
    assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0);
  }
});

test('GM demotion, different instance, session, generation or phase remains a hard failure before a private source read', async () => {
  for (const change of [{ playerRole: 'player' }, { instanceId: 'foreign' }, { gmInstanceOwned: false },
    { sessionId: 'foreign' }, { uidHash: 'foreign' }, { connectionGeneration: 4 },
    { identityHydrationRevision: 3 }, { phase: 'debrief' }, { cycle: 2 }, { turnStatePhase: 'team' },
    { phaseProgression: 'automatic' }, { hasAuth: false }, { sameActor: false }]) {
    const f = fixture({ gmAt: () => gm({ airspace: 'lifted', ...change }) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.counts.sources, 0); assert.equal(f.counts.choices, 0);
  }
});

test('member group, role, seat, replacement or actor generation drift remains a hard failure during normal resolution', async () => {
  for (const change of [{ fleetGroupId: 'fleet-2' }, { profileRoleId: 'admiral' }, { assignedRoleId: 'admiral' },
    { activeConsoleRoleId: 'admiral' }, { seatId: 'foreign' }, { replacementStatus: 'active' },
    { replacementRoleId: 'foreign' }, { connectionGeneration: 4 }, { identityHydrationRevision: 3 },
    { uidHash: 'foreign' }, { phase: 'debrief' }, { hasAuth: false }, { sameActor: false }]) {
    const f = fixture({ actorAt: () => actor({ airspace: 'lifted', ...change }) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.counts.sources, 0); assert.equal(f.counts.choices, 0);
  }
});

test('an unproven airspace state or reversed transition cannot use the resolved-source exception', async () => {
  for (const airspace of ['unknown', 'restricted']) {
    const f = fixture({ actorAt: () => actor({ airspace }) });
    if (airspace === 'restricted') f.options.original.airspace = 'lifted';
    await assert.rejects(waitForWolfChoiceReadiness(f.options), /airspace/);
    assert.equal(f.counts.choices, 0);
  }
});

test('cache or offline actor state never qualifies a terminal transition despite an unlocked source', async () => {
  const f = fixture({ actorAt: () => actor({ airspace: 'lifted', connection: 'offline', freshness: 'cache' }) });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /deadline/);
  assert.equal(f.counts.sources, 0); assert.equal(f.counts.choices, 0); assert.equal(f.counts.waits, 3);
});

test('a GM authority change while the final private attack read is in flight cannot qualify terminal progress', async () => {
  for (const change of [{ playerRole: 'player' }, { instanceId: 'foreign' }, { gmInstanceOwned: false },
    { uidHash: 'foreign' }, { connectionGeneration: 4 }, { turnStatePhase: 'team' }]) {
    const f = fixture({ gmAt: n => gm({ airspace: 'lifted', ...(n > 1 ? change : {}) }) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.counts.sources, 1); assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0);
  }
});

test('an actor change while the final private attack read is in flight cannot qualify terminal progress', async () => {
  for (const change of [{ uidHash: 'foreign' }, { fleetGroupId: 'fleet-2' }, { seatId: 'foreign' },
    { connectionGeneration: 4 }, { replacementStatus: 'active' }]) {
    const f = fixture({ actorAt: n => actor({ airspace: 'lifted', ...(n > 1 ? change : {}) }) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.counts.sources, 1); assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0);
  }
});

test('the real GM-private attack document binds its session through original reader authority without an invented payload field', async () => {
  const current = resolved(); delete current.sessionId;
  const f = fixture({ current });
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.equal(f.counts.sources, 1); assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0);
});

test('a private attack without a session field still cannot cross the original actor and owned GM session binding', async () => {
  const current = resolved(); delete current.sessionId;
  for (const key of ['original', 'originalGm']) {
    const f = fixture({ current });
    f.options[key].sessionId = 'foreign';
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.counts.sources, 0); assert.equal(f.counts.choices, 0);
  }
});

test('normal attack finalization restores Team/restricted to Coordination/lifted only for the same resolved source', async () => {
  const current = resolved(); delete current.sessionId;
  const f = fixture({ current, actorAt: () => actor({ airspace: 'lifted', turnStatePhase: 'coordination' }),
    gmAt: () => gm({ airspace: 'lifted', turnStatePhase: 'coordination' }) });
  f.options.original.turnStatePhase = 'team'; f.options.originalGm.turnStatePhase = 'team';
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'source-changed'); assert.equal(result.gameplayCredit, false);
  assert.equal(f.counts.sources, 1); assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0); assert.equal(f.counts.waits, 0);
});

test('a Team-to-Coordination phase change while airspace remains restricted is not normal terminal progress', async () => {
  const f = fixture({ actorAt: () => actor({ airspace: 'restricted', turnStatePhase: 'coordination' }),
    gmAt: () => gm({ airspace: 'restricted', turnStatePhase: 'coordination' }) });
  f.options.original.turnStatePhase = 'team'; f.options.originalGm.turnStatePhase = 'team';
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /turnStatePhase/);
  assert.equal(f.counts.sources, 0); assert.equal(f.counts.choices, 0);
});

test('Team/restricted to Coordination/lifted still requires a newer same-attack resolved unlocked document', async () => {
  for (const change of [{ status: 'declared' }, { attackId: 'foreign' }, { turn: 2 }, { revision: 24 },
    { currentStep: 'boarding' }, { airspaceLocked: true }]) {
    const f = fixture({ current: resolved(change) });
    f.options.original.turnStatePhase = 'team'; f.options.originalGm.turnStatePhase = 'team';
    await assert.rejects(waitForWolfChoiceReadiness(f.options), /airspace|turnStatePhase/);
    assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0);
  }
});

test('a restored combat window cannot mask an in-flight original GM instance or actor lease change', async () => {
  for (const which of ['actor', 'gm']) {
    const f = fixture({ actorAt: n => actor({ airspace: 'lifted', ...(which === 'actor' && n > 1 ? { connectionGeneration: 4 } : {}) }),
      gmAt: n => gm({ airspace: 'lifted', ...(which === 'gm' && n > 1 ? { instanceId: 'foreign' } : {}) }) });
    f.options.original.turnStatePhase = 'team'; f.options.originalGm.turnStatePhase = 'team';
    await assert.rejects(waitForWolfChoiceReadiness(f.options));
    assert.equal(f.counts.sources, 1); assert.equal(f.counts.choices, 0); assert.equal(f.counts.paints, 0);
  }
});
