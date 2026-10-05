import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLiveWolfAttack } from './pc10-live-wolf-attack-ui-proof.mjs';

/** Native adapter surfaces only. No actual Auth, browser, gameplay or RNG credit. */
function currentRange({ actionCount = 3, requestChange, controlChange, onSelection, replayChange } = {}) {
  const choices = [], mutations = [], replays = [], reads = [];
  let roleId, revision = 19, status = 'declared', captured, actorPatch = {};
  const current = () => ({ attackId: 'native-range-attack', turn: 1, revision, status,
    currentStep: 'short-range', preparation: { shipIds: ['native-contact'] } });
  const view = { type: 'wolf-range-action-choice-view', sessionId: 'native-session', turn: 1,
    revision: 19, currentStep: 'short-range', range: 'short-range', choiceStatus: 'targets-required',
    contacts: [
      { contactId: 'one', available: true, requiredCoverageDamage: 1 },
      { contactId: 'two', available: true, requiredCoverageDamage: 1 },
    ],
    eligibleActions: Array.from({ length: actionCount }, (_, index) => ({ actionId: `alpha-${index}`, sourceId: 'aegis-alpha-wing' })),
    hitSlots: Array.from({ length: actionCount }, (_, index) => ({ actionId: `alpha-${index}`, count: 1, damagePerHit: 1 })),
  };
  const controls = view.hitSlots.map((slot, index) => {
    const control = { label: 'Alpha Fighter Wing hit 1', selected: null, offered: ['one', 'two'],
      isVisible: async () => true, isEnabled: async () => true,
      getAttribute: async name => { assert.equal(name, 'aria-label'); return control.label; },
      locator: name => { assert.equal(name, 'option'); return { evaluateAll: async () => [...control.offered] }; },
      selectOption: async value => {
        assert.ok(control.offered.includes(value)); control.selected = value;
        choices.push({ index, actionId: slot.actionId, value });
        onSelection?.({ index, changeActor: patch => { actorPatch = patch; },
          changeSource: patch => { revision = patch.revision ?? revision; status = patch.status ?? status; } });
      },
    };
    return control;
  });
  controlChange?.(controls);
  const authority = { sessionId: 'native-session', fleetGroupId: 'fleet-1', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null, seatId: 'native-seat', connected: true };
  const observation = role => ({ hasAuth: true, sameActor: true, sessionId: 'native-session', phase: 'active', cycle: 1,
    uidHash: `native-${role}`, profileRoleId: role, assignedRoleId: role,
    activeConsoleRoleId: role, playerRole: 'player', connection: 'live', freshness: 'server',
    airspace: 'restricted', turnStatePhase: 'team', phaseProgression: 'manual', ...actorPatch });
  const response = { status: () => 200, request: () => ({ postDataJSON: () => ({ data: captured }) }) };
  const commit = async () => {
    const request = { sessionId: 'native-session', requestId: 'native-target-request',
      expectedTurn: 1, expectedRevision: 19, range: 'short-range',
      assignments: view.hitSlots.map((slot, index) => ({ actionId: slot.actionId, contactIds: [controls[index].selected] })),
    };
    captured = requestChange ? requestChange(structuredClone(request)) : request;
    mutations.push({ roleId, request: structuredClone(captured) }); revision += 1; status = 'resolved';
  };
  const control = (kind, name) => ({
    isVisible: async () => name !== 'Use selected actions', isEnabled: async () => true,
    waitFor: async () => {}, count: async () => 1,
    innerText: async () => kind === 'region' && /Fighter Wing (Alpha|Bravo) Short Range actions/.test(name)
      ? 'Cycle 1 // This range is committed.'
      : kind === 'region' && name === 'Highwall Cannon Short Range choice'
        ? 'Cycle 1 // You passed this range action.' : 'Cycle 1 // Short Range // Choose current targets.',
    click: async () => { if (name === 'Commit target assignments') await commit(); },
    getByRole: (nextKind, options = {}) => nextKind === 'combobox' ? {
      count: async () => controls.length, first: () => controls[0], all: async () => controls,
    } : control(nextKind, options.name),
  });
  const page = { evaluate: async () => ({ ...authority }), waitForResponse: async () => response,
    getByRole: (kind, options = {}) => control(kind, options.name) };
  const result = { status: 'committed', attackId: 'native-range-attack', revision: 20,
    serverConsequence: { lockedFace: 4, contactsRemaining: 0 } };
  const gm = { page, observe: async () => ({ ...observation('gm'), playerRole: 'gm', assignedRoleId: null,
    activeConsoleRoleId: null, instanceId: 'native-instance', gmInstanceOwned: true }) };
  const crew = { page, storeModuleUrl: () => '/native-store', observe: async () => observation(roleId),
    callable: async (endpoint, fields) => {
      if (endpoint === 'assignWolfRangeTargets') {
        replays.push({ endpoint, fields: structuredClone(fields) }); assert.deepEqual(fields, captured);
        return { status: 'committed', result: replayChange ? replayChange(structuredClone(result)) : structuredClone(result) };
      }
      reads.push(endpoint);
      if (endpoint === 'getWolfFighterRangeActionChoice') return { status: 'committed', result: {
        type: 'wolf-fighter-range-action-choice-view', sessionId: 'native-session', turn: 1, revision,
        range: 'short-range', sourceId: fields.sourceId, launched: true, choiceStatus: 'committed' } };
      if (endpoint === 'getWolfRangeSupportActionChoice') return { status: 'committed', result: {
        type: 'wolf-range-support-action-choice-view', sessionId: 'native-session', turn: 1, revision,
        range: 'short-range', sourceId: 'highwall', choiceStatus: 'passed' } };
      assert.equal(endpoint, 'getWolfRangeActionChoice'); return { status: 'committed', result: structuredClone(view) };
    } };
  const roster = ['wing-commander', 'executive-officer', 'icebreaker-miner'].map(roleId => ({ roleId, uidHash: `native-${roleId}` }));
  const context = { gm, crew, initial: { sessionId: 'native-session' },
    started: { uidHash: 'native-gm', instanceId: 'native-instance' }, roster };
  const tools = { read: async () => current(), record: async () => {},
    state: async () => ({ phase: 'active', cycle: 1, turnPhase: { airspace: { state: 'restricted' } },
      activeVesselIds: ['aegis', 'icebreaker'], maintenanceCycles: {} }),
    select: async role => { roleId = role; return role === 'gm' ? gm : crew; },
    receipt: async (_surface, endpoint, decision) => {
      assert.equal(endpoint, 'assignWolfRangeTargets'); await decision(); return structuredClone(result);
    } };
  const run = options => resolveLiveWolfAttack(context, { tools, timeoutMs: 1_000, ...options });
  return { run, view, controls, choices, mutations, replays, reads };
}

test('default resolver reuses current action slots when three distinct Alpha actions print the same hit label', async () => {
  const f = currentRange();
  assert.equal(new Set(f.controls.map(control => control.label)).size, 1);
  const resolved = await f.run();
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(f.choices, [
    { index: 0, actionId: 'alpha-0', value: 'one' },
    { index: 1, actionId: 'alpha-1', value: 'two' },
    { index: 2, actionId: 'alpha-2', value: 'one' },
  ]);
  assert.deepEqual(f.mutations[0].request.assignments, f.choices.map(choice => ({ actionId: choice.actionId, contactIds: [choice.value] })));
  assert.equal(f.replays.length, 1);
  assert.deepEqual(f.replays[0].fields, f.mutations[0].request, 'Only exact original UI request is replayed.');
  assert.deepEqual(f.reads, ['getWolfFighterRangeActionChoice', 'getWolfFighterRangeActionChoice',
    'getWolfRangeSupportActionChoice', 'getWolfRangeActionChoice'], 'Reuse existing current source waiter, no extra getter.');
});

for (const [name, change, actionCount = 1] of [
  ['action identity', request => { request.assignments[0].actionId = 'foreign-action'; return request; }],
  ['contact identity', request => { request.assignments[0].contactIds = ['foreign-contact']; return request; }],
  ['action count', request => { request.assignments = []; return request; }],
  ['extra contact', request => { request.assignments[0].contactIds.push('two'); return request; }],
  ['action order', request => { request.assignments.reverse(); return request; }, 2],
]) test(`default resolver rejects captured ${name} different from the current selected action plan before replay`, async () => {
  const f = currentRange({ actionCount, requestChange: change });
  await assert.rejects(f.run(), /assignments/);
  assert.equal(f.replays.length, 0, 'Wrong captured targets cannot start SDK receipt recovery.');
});

test('target assignment receipt retains the authoritative cycle, revision and current range', async () => {
  for (const [field, value] of [['expectedTurn', 2], ['expectedRevision', 20], ['range', 'medium-range']]) {
    const f = currentRange({ actionCount: 1, requestChange: request => ({ ...request, [field]: value }) });
    await assert.rejects(f.run(), new RegExp(field)); assert.equal(f.replays.length, 0);
  }
});

test('reused source selector rejects wrong count or label rather than choosing a fallback target field', async () => {
  for (const [change, message] of [
    [controls => { controls.pop(); }, /rendered target field count/],
    [controls => { controls[0].label = 'Bravo Fighter Wing hit 1'; }, /rendered field order/],
  ]) {
    const f = currentRange({ actionCount: 1, controlChange: change });
    await assert.rejects(f.run(), message); assert.equal(f.choices.length, 0); assert.equal(f.mutations.length, 0);
  }
});

test('reused source selector never substitutes an offered contact outside its current entitled target plan', async () => {
  const f = currentRange({ actionCount: 1, controlChange: controls => { controls[0].offered = ['foreign-contact']; } });
  await assert.rejects(f.run(), /current enabled opaque contact/);
  assert.equal(f.choices.length, 0); assert.equal(f.mutations.length, 0);
});

test('original actor change during target paint withdraws the remaining transient selections before any commit', async () => {
  const f = currentRange({ actionCount: 2, onSelection: ({ index, changeActor }) => {
    if (index === 0) changeActor({ assignedRoleId: 'admiral' });
  } });
  await assert.rejects(f.run(), /Original combat assignedRoleId/);
  assert.equal(f.choices.length, 1); assert.equal(f.mutations.length, 0);
});

test('target reuse preserves the existing authoritative source revision check before UI commit', async () => {
  const f = currentRange({ actionCount: 1, onSelection: ({ changeSource }) => changeSource({ revision: 20 }) });
  await assert.rejects(f.run(), /Current source revision/); assert.equal(f.mutations.length, 0);
});

test('exact target replay still rejects a changed server consequence', async () => {
  const f = currentRange({ actionCount: 1, replayChange: result => {
    result.serverConsequence.lockedFace = 6; return result;
  } });
  await assert.rejects(f.run(), /preserve server rolls and consequences/);
  assert.equal(f.replays.length, 1);
});
