import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWolfChoiceActor, createWolfChoiceWaiter, observeWolfChoiceActor, waitForWolfChoiceReadiness } from './pc10-combat-choice-readiness.mjs';

// Native counterexamples only. No browser, Auth, gameplay or physical proof.
const discovery = (change = {}) => ({ groupId: 'fleet-1', shipId: 'shepherd', revision: 1,
  fleetGroupVesselIds: ['shepherd', 'icebreaker'], ...change });
const actor = (change = {}) => ({ sessionId: 'native-session', uidHash: 'original-shepherd',
  profileRoleId: 'shepherd-engineer', assignedRoleId: 'shepherd-engineer', activeConsoleRoleId: 'shepherd-engineer',
  playerRole: 'player', hasAuth: true, sameActor: true, connection: 'live', freshness: 'server',
  phase: 'active', cycle: 1, fleetGroupId: 'fleet-1', connectionGeneration: 4, identityHydrationRevision: 1,
  replacementRoleId: null, replacementStatus: null, seatId: 'shepherd-engineer',
  entitledShipId: 'shepherd', discoveryAuthority: discovery(), ...change });
const attack = { sessionId: 'native-session', attackId: 'native-attack', turn: 1, revision: 22,
  status: 'declared', currentStep: 'boarding' };
const choice = { type: 'wolf-boarding-defence-choice-view', sessionId: 'native-session',
  turn: 1, revision: 22, targetShipId: 'shepherd', boardingParties: 4, availableSecurityTeams: 2,
  choiceStatus: 'pending', deadlineAt: '9999-12-31T23:59:59.999Z' };

function fixture({ inspectActor = () => actor(), readChoice = () => choice, inspectPaint,
  deadlineAt = 600 } = {}) {
  let time = 0, reads = 0, paints = 0;
  return { counters: () => ({ time, reads, paints }), setTime: value => { time = value; }, options: {
    original: actor(), expected: attack, requireBoardingDiscovery: true, deadlineAt, timeoutMs: 60_000,
    now: () => time, wait: async () => { time += 200; },
    inspectActor: async () => inspectActor(time), inspectAttack: async () => attack,
    readChoice: async () => { reads++; return readChoice(time); },
    inspectPaint: async view => { paints++; return inspectPaint?.(view, time) ?? { status: 'eligible', reason: 'Enabled actual selector.' }; },
  } };
}

for (const [name, changed] of Object.entries({
  absent: { discoveryAuthority: null },
  'wrong group': { discoveryAuthority: discovery({ groupId: 'other-group' }) },
  'wrong ship': { discoveryAuthority: discovery({ shipId: 'icebreaker' }) },
  'missing ship': { discoveryAuthority: discovery({ shipId: null }) },
  'missing revision': { discoveryAuthority: discovery({ revision: null }) },
  'malformed revision': { discoveryAuthority: discovery({ revision: '1' }) },
  'missing vessel audience': { discoveryAuthority: discovery({ fleetGroupVesselIds: null }) },
  'foreign vessel audience': { discoveryAuthority: discovery({ fleetGroupVesselIds: ['icebreaker'] }) },
})) {
  test(`boarding cannot qualify an enabled selector with ${name} discovery authority`, async () => {
    const f = fixture({ inspectActor: () => actor(changed) });
    await assert.rejects(waitForWolfChoiceReadiness(f.options), /deadline|discovery/i);
    assert.deepEqual(f.counters(), { time: 600, reads: 0, paints: 0 });
  });
}

test('initial discovery hydration completes before one boarding read/paint inside the same deadline', async () => {
  const f = fixture({ inspectActor: time => actor({ discoveryAuthority: time < 400 ? null : discovery() }),
    inspectPaint: (_view, time) => { assert.equal(time, 400); return { status: 'eligible' }; } });
  const result = await waitForWolfChoiceReadiness(f.options);
  assert.equal(result.status, 'eligible'); assert.equal(result.gameplayCredit, false);
  assert.deepEqual(result.originalActor.boardingDiscoveryAuthority, discovery());
  assert.deepEqual(f.counters(), { time: 400, reads: 1, paints: 1 });
});

test('discovery wait plus delayed boarding reply cannot acquire a second stage budget', async () => {
  const f = fixture({ deadlineAt: 500,
    inspectActor: time => actor({ discoveryAuthority: time < 400 ? null : discovery() }),
    readChoice: time => { f.setTime(time + 200); return choice; } });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /deadline/i);
  assert.deepEqual(f.counters(), { time: 600, reads: 1, paints: 0 });
});

for (const [name, changed] of Object.entries({
  group: { discoveryAuthority: discovery({ groupId: 'other-group' }) },
  ship: { discoveryAuthority: discovery({ shipId: 'icebreaker' }) },
  revision: { discoveryAuthority: discovery({ revision: 2 }) },
  vessels: { discoveryAuthority: discovery({ fleetGroupVesselIds: ['shepherd', 'quellon'] }) },
  'vessel order': { discoveryAuthority: discovery({ fleetGroupVesselIds: ['icebreaker', 'shepherd'] }) },
  removal: { discoveryAuthority: null },
  'entitled ship': { entitledShipId: 'icebreaker' },
  UID: { uidHash: 'different-account' },
  console: { activeConsoleRoleId: 'shepherd-scientist' },
  generation: { connectionGeneration: 5 },
})) {
  test(`post-bind ${name} change rejects before boarding mutation`, async () => {
    const ready = await waitForWolfChoiceReadiness(fixture().options);
    assert.deepEqual(ready.originalActor?.boardingDiscoveryAuthority, discovery());
    assert.doesNotThrow(() => assertWolfChoiceActor(actor(), ready.originalActor));
    let mutations = 0;
    assert.throws(() => { assertWolfChoiceActor(actor(changed), ready.originalActor); mutations++; });
    assert.equal(mutations, 0);
  });
}

test('discovery changing while the entitled reply is in flight cannot qualify its selector', async () => {
  let current = actor();
  const f = fixture({ inspectActor: () => current,
    readChoice: () => { current = actor({ discoveryAuthority: discovery({ revision: 2 }) }); return choice; } });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /discovery/i);
  assert.equal(f.counters().paints, 0);
});

test('a source choice for another ship cannot qualify under the bound original discovery', async () => {
  const f = fixture({ readChoice: () => ({ ...choice, targetShipId: 'icebreaker' }) });
  await assert.rejects(waitForWolfChoiceReadiness(f.options), /ship|discovery/i);
  assert.equal(f.counters().paints, 0);
});

test('the real boarding waiter requests the discovery fence rather than trusting an enabled native selector', async () => {
  let calls = 0;
  const originalGm = actor({ uidHash: 'original-gm', playerRole: 'gm', profileRoleId: 'gm',
    assignedRoleId: null, activeConsoleRoleId: null, instanceId: 'original-instance', gmInstanceOwned: true });
  const current = actor({ discoveryAuthority: null });
  const crew = { observe: async () => current, storeModuleUrl: () => '/native-store',
    page: { evaluate: async () => ({ ...current, connected: true }), getByRole: () => ({
      isVisible: async () => true, innerText: async () => 'Cycle 1 // boarding',
      getByRole: () => ({ count: async () => 1, first() { return this; }, isEnabled: async () => true }),
    }) }, callable: async () => { calls++; return { status: 'committed', result: choice }; } };
  const gm = { observe: async () => originalGm };
  const waiter = createWolfChoiceWaiter({ gm, crew, initial: { sessionId: 'native-session' },
    started: { uidHash: 'original-gm', instanceId: 'original-instance' },
    roster: [{ roleId: 'shepherd-engineer', uidHash: 'original-shepherd' }] },
  { originalGm, tools: { read: async () => attack } });
  await assert.rejects(waiter(crew, attack, { kind: 'boarding-defence' }, { deadlineAt: Date.now() + 40 }), /deadline|discovery/i);
  assert.equal(calls, 0);
});

// These ordinary role/current-berth fixtures exercise the observer mapping,
// not a browser or admission. Catalog vessel identity is not boarding berth.
for (const { name, roleId, replacementRoleId = null, catalogShipId, shipId, vesselIds } of [
  { name: 'Shepherd / Icebreaker joint station', roleId: 'joint-engineering-shepherd-icebreaker',
    catalogShipId: null, shipId: 'icebreaker', vesselIds: ['shepherd', 'icebreaker'] },
  { name: 'Quellon / Refinery joint station', roleId: 'joint-engineering-quellon-refinery',
    catalogShipId: null, shipId: 'refinery-124', vesselIds: ['quellon', 'refinery-124'] },
  { name: 'Comms replacement at its current passenger berth', roleId: 'shepherd-engineer',
    replacementRoleId: 'comms-officer', catalogShipId: 'aegis', shipId: 'icebreaker',
    vesselIds: ['aegis', 'icebreaker'] },
  { name: 'Warrior replacement at its current passenger berth', roleId: 'shepherd-engineer',
    replacementRoleId: 'warrior-captain', catalogShipId: 'warrior', shipId: 'icebreaker',
    vesselIds: ['warrior', 'icebreaker'] },
]) {
  test(`boarding observer binds protected current berth for ${name}`, async () => {
    const current = actor({ assignedRoleId: roleId, activeConsoleRoleId: replacementRoleId ? null : roleId,
      replacementRoleId, seatId: replacementRoleId ? null : roleId, entitledShipId: catalogShipId,
      discoveryAuthority: discovery({ shipId, fleetGroupVesselIds: vesselIds }) });
    const surface = { observe: async () => current, storeModuleUrl: () => '/native-store',
      page: { evaluate: async () => ({ ...current, connected: true }) } };
    const observed = await observeWolfChoiceActor(surface);
    assert.equal(observed.entitledShipId, shipId, 'The protected current berth supersedes historical catalog identity.');
    const f = fixture({ inspectActor: () => observed, readChoice: () => ({ ...choice, targetShipId: shipId }) });
    f.options.original = current;
    const ready = await waitForWolfChoiceReadiness(f.options);
    assert.equal(ready.status, 'eligible'); assert.equal(ready.gameplayCredit, false);
    assert.equal(ready.originalActor.entitledShipId, shipId);
    assert.deepEqual(ready.originalActor.boardingDiscoveryAuthority, current.discoveryAuthority);
    assert.deepEqual(f.counters(), { time: 0, reads: 1, paints: 1 });
    assert.doesNotThrow(() => assertWolfChoiceActor(observed, ready.originalActor));
    assert.throws(() => assertWolfChoiceActor({ ...observed,
      discoveryAuthority: { ...observed.discoveryAuthority, shipId: vesselIds.find(id => id !== shipId) },
    }, ready.originalActor), /discovery/i);
  });
}
