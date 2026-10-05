import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PC10_SPECIALIST_ACTIONS,
  composePc10SpecialistSteps,
  createPc10SpecialistGameplayCallback,
  createPc10SpecialistPhaseSteps,
  makePc10SpecialistActionStep,
  runPc10SpecialistAction,
  runCapybaraMaintenanceCycle,
} from './pc10-specialist-phases.mjs';

test('Capybara maintenance uses the normal Recyclotron and leaves the cycle to the caller', async () => {
  const initial = { sessionId: 'fresh-session' };
  const context = { initial, roster: [
    { roleId: 'capybara-captain', uidHash: 'captain-hash' },
    { roleId: 'capybara-recycler', uidHash: 'recycler-hash' },
  ] };
  const state = { live: true, sessionId: 'fresh-session', cycle: 2, phase: 'active',
    turnPhase: { airspace: { state: 'restricted' } }, activeVesselIds: ['capybara'],
    shuttleDockings: [{ shuttleId: 'macaw', shipId: 'capybara' }], shuttleFuelled: { macaw: false },
    shipResources: { capybara: { fuel: 2 } }, shipDamage: { capybara: { destroyed: false, damagedSystemIds: [] } },
    maintenanceCycles: {} };
  const calls = [];
  const game = { context: { ...context, gm: {}, initial }, state: async () => state,
    maintenanceUi: async (...args) => {
      calls.push(args);
      state.maintenanceCycles.capybara = { turn: 2, step: 0, completedAt: 'server-time' };
      return state.maintenanceCycles.capybara;
    } };

  const result = await runCapybaraMaintenanceCycle({ game, context, cycle: 2, refuelCraft: 'macaw' });
  assert.deepEqual(calls, [['capybara', 'capybara-recycler', {
    consoles: [], refuels: { 'Shuttle Bay': 'macaw' },
  }]]);
  assert.deepEqual(result, { status: 'completed', cycle: 2, roleId: 'capybara-recycler', refueledCraft: 'macaw' });
  assert.equal(state.cycle, 2, 'The specialist step must not advance the cycle.');
});

test('Capybara maintenance rejects a mismatched or already completed cycle without clicking UI', async () => {
  const context = { initial: { sessionId: 'fresh-session' }, roster: [{ roleId: 'capybara-recycler' }] };
  let calls = 0;
  const game = { context: { ...context, gm: {} }, state: async () => ({ live: true,
    sessionId: 'fresh-session', cycle: 1, phase: 'active',
    turnPhase: { airspace: { state: 'restricted' } }, activeVesselIds: ['capybara'], maintenanceCycles: {} }),
    maintenanceUi: async () => { calls += 1; } };
  const wrongCycle = await runCapybaraMaintenanceCycle({ game, context, cycle: 2, refuelCraft: 'boa' });
  assert.deepEqual(wrongCycle, { status: 'uncredited', reason: 'expected-cycle-not-live', cycle: 2 });
  assert.equal(calls, 0);
});

test('Capybara maintenance leaves unavailable shuttle refuelling uncredited without completing a cycle', async () => {
  const context = { initial: { sessionId: 'fresh-session' }, roster: [{ roleId: 'capybara-recycler' }] };
  const state = { live: true, sessionId: 'fresh-session', cycle: 1, phase: 'active',
    turnPhase: { airspace: { state: 'restricted' } }, activeVesselIds: ['capybara'],
    shuttleDockings: [{ shuttleId: 'macaw', shipId: 'capybara' }], shuttleFuelled: { macaw: true },
    shipResources: { capybara: { fuel: 2 } }, shipDamage: { capybara: { destroyed: false, damagedSystemIds: [] } },
    maintenanceCycles: {} };
  let calls = 0;
  const game = { context: { ...context, gm: {} }, state: async () => state,
    maintenanceUi: async () => { calls += 1; } };
  const result = await runCapybaraMaintenanceCycle({ game, context, cycle: 1, refuelCraft: 'macaw' });
  assert.deepEqual(result, { status: 'uncredited', reason: 'craft-already-fuelled', cycle: 1 });
  assert.equal(calls, 0);
});

test('specialist action steps use the offered rendered control and caller-selected receipt verifier', async () => {
  const clicks = [];
  const button = { isVisible: async () => true, isEnabled: async () => true,
    click: async () => { clicks.push('recycle'); } };
  const region = { getByRole: (role, options) => {
    assert.equal(role, 'button');
    assert.equal(options.name.test('Recycle 6 Food for 1 Scrap'), true);
    return button;
  }, getByLabel: (name, options) => {
    assert.equal(name, 'Resource to recycle'); assert.equal(options.exact, true);
    return { selectOption: async value => assert.equal(value, 'food') };
  } };
  let currentUrl = 'http://demo.invalid/#/ships/capybara/roles/capybara-recycler';
  const shuttleLink = { isVisible: async () => true, isEnabled: async () => true,
    click: async () => { currentUrl = 'http://demo.invalid/#/shuttles/boa'; } };
  const page = { url: () => currentUrl,
    waitForURL: async predicate => assert.equal(predicate(new URL(currentUrl)), true),
    getByRole: (role, options) => {
      if (role === 'link') { assert.equal(options.name, 'Open Boa shuttle console'); return shuttleLink; }
      assert.equal(role, 'region'); assert.equal(options.name, 'Boa recycling'); return region;
    } };
  const surface = { page, observe: async () => ({ sameActor: true, sessionId: 'fresh-session',
    uidHash: 'recycler-hash', profileRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler',
    connection: 'live', freshness: 'server' }) };
  const game = { context: { initial: { sessionId: 'fresh-session' }, roster: [
    { roleId: 'capybara-recycler', uidHash: 'recycler-hash' },
  ] }, select: async roleId => {
    assert.equal(roleId, 'capybara-recycler'); return surface;
  } };
  let captureArgs;
  const driver = { capture: async args => { captureArgs = args; await args.click(page); return { evidence: { response: { resultStatus: 'committed' } } }; } };
  const step = makePc10SpecialistActionStep('boa-recycle', {
    recipe: 'food', amount: 6,
    inspect: async () => ({ ready: true, gmRevision: 6, crewRevision: 6,
      renderedStatusCode: 'public-result-visible' }),
  });
  const result = await step({ game, driver, context: game.context });
  assert.deepEqual(clicks, ['recycle']);
  assert.equal(captureArgs.roleId, 'capybara-recycler');
  assert.equal(captureArgs.endpoint, 'recycleWithBoa');
  assert.deepEqual(captureArgs.cost, { resource: 'food', amount: 6, result: '1 Scrap' });
  assert.equal(typeof captureArgs.inspect, 'function');
  assert.equal(result.status, 'captured');
});

test('specialist actions leave missing live opportunities and private choices explicitly uncredited', async () => {
  let selects = 0, captures = 0;
  const unavailableRegion = { getByRole: () => ({ isVisible: async () => false }),
    getByLabel: () => ({ selectOption: async () => undefined }) };
  let currentUrl = 'http://demo.invalid/#/ships/capybara/roles/capybara-recycler';
  const shuttleLink = { isVisible: async () => true, isEnabled: async () => true,
    click: async () => { currentUrl = 'http://demo.invalid/#/shuttles/boa'; } };
  const unavailablePage = { url: () => currentUrl,
    waitForURL: async predicate => assert.equal(predicate(new URL(currentUrl)), true),
    getByRole: (role, options) => role === 'link' ? shuttleLink : unavailableRegion };
  const surface = { page: unavailablePage,
    observe: async () => ({ sameActor: true, sessionId: 'fresh-session', uidHash: 'recycler-hash',
      profileRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler',
      connection: 'live', freshness: 'server' }) };
  const game = { context: { initial: { sessionId: 'fresh-session' }, roster: [
    { roleId: 'capybara-recycler', uidHash: 'recycler-hash' },
  ] }, select: async () => { selects += 1; return surface; } };
  const driver = { capture: async () => { captures += 1; } };
  const noTaskChoice = makePc10SpecialistActionStep('boa-reclamation', {
    opportunityLabel: 'Printed site 1234',
    inspect: async () => ({ ready: true, gmRevision: 1, crewRevision: 1,
      renderedStatusCode: 'mission-choice-visible' }),
  });
  const absent = await noTaskChoice({ game, driver, context: game.context });
  assert.deepEqual(absent, { status: 'uncredited', actionId: 'boa-reclamation',
    reason: 'explicit-choice-required', missingChoices: ['taskOpportunityId'] });
  assert.equal(selects, 0, 'Do not navigate into or silently choose a private mission task.');

  const noLiveButton = makePc10SpecialistActionStep('boa-recycle', {
    recipe: 'food', amount: 6,
    inspect: async () => ({ ready: true, gmRevision: 1, crewRevision: 1,
      renderedStatusCode: 'public-result-visible' }),
  });
  const unavailable = await noLiveButton({ game, driver, context: game.context });
  assert.equal(unavailable.status, 'uncredited');
  assert.equal(unavailable.reason, 'control-not-currently-offered');
  assert.equal(captures, 0);
});

test('Macaw does not accept Capybara self-target salvage without the facilitator ruling', async () => {
  let selects = 0;
  const result = await runPc10SpecialistAction({
    game: { context: { initial: { sessionId: 'fresh-session' }, roster: [
      { roleId: 'capybara-captain', uidHash: 'captain-hash' },
    ] }, select: async () => { selects += 1; } },
    driver: { capture: async () => assert.fail('self-target must remain blocked before UI submission') },
    actionId: 'macaw-salvage-propose', targetRoleId: 'capybara-captain', targetShipId: 'capybara',
    targetConsoleId: 'jump-drive', targetConsoleLabel: 'Jump Drive',
    inspect: async () => ({ ready: true, gmRevision: 1, crewRevision: 1,
      renderedStatusCode: 'public-result-visible' }),
  });
  assert.deepEqual(result, { status: 'uncredited', actionId: 'macaw-salvage-propose',
    reason: 'self-target-prohibited-pending-facilitator-ruling' });
  assert.equal(selects, 0);
});

test('the action catalog contains specialist ordinary actions and no GM correction shortcut', () => {
  const endpoints = new Set(Object.values(PC10_SPECIALIST_ACTIONS).map(action => action.endpoint));
  for (const endpoint of [
    'buildFighter', 'requestScout', 'advanceEndeavourResearchTrack', 'activateEndeavourEcmDevice',
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest', 'sendFleetGroupMessage',
    'commitWolfBoardingDefenceChoice', 'recycleWithBoa', 'chooseBoaMissionReclamationOpportunity',
    'repairConsolesFromMacaw', 'proposePermissionedDismantling', 'consentToPermissionedDismantling',
    'applyPermissionedDismantling', 'resolveWolfAttackAftermath',
  ]) assert.ok(endpoints.has(endpoint), `missing ordinary source action ${endpoint}`);
  assert.equal(PC10_SPECIALIST_ACTIONS['explorer-route-request']?.endpoint, 'requestShuttleDeparture');
  assert.equal(PC10_SPECIALIST_ACTIONS['explorer-route-transit']?.endpoint, 'beginShuttleTransit');
  assert.equal(PC10_SPECIALIST_ACTIONS['explorer-route-arrival']?.endpoint, 'completeShuttleArrival');
  assert.equal(endpoints.has('setFighterWingCount'), false);
});

test('phase composition places real caller callbacks around two cycle-specific specialist stages', async () => {
  const calls = [];
  const callback = name => async ({ game, context, driver }) => {
    assert.ok(game && context && driver);
    calls.push(name);
    return { status: 'completed', phase: name };
  };
  const steps = composePc10SpecialistSteps({
    beforeSpecialists: callback('base-before'),
    cycleOne: [callback('cycle-1')],
    betweenCycles: callback('base-cycle-transition'),
    cycleTwo: [callback('cycle-2')],
    candidateEnding: callback('candidate-ending'),
    terminalEnding: callback('terminal-ending'),
  });
  for (const step of steps) await step({ game: {}, context: {}, driver: {} });
  assert.deepEqual(calls, [
    'base-before', 'cycle-1', 'base-cycle-transition', 'cycle-2', 'candidate-ending', 'terminal-ending',
  ]);
});

test('phase plan compiles Capybara cycles and normal UI actions into runnable ordered callbacks', async () => {
  const calls = [];
  const planSteps = createPc10SpecialistPhaseSteps({
    beforeSpecialists: async () => calls.push('base-before'),
    cycleOne: [
      { actionId: 'capybara-maintenance', cycle: 1, refuelCraft: 'boa' },
      async () => calls.push('cycle-one-action'),
    ],
    betweenCycles: async () => calls.push('base-cycle-transition'),
    cycleTwo: [{ actionId: 'capybara-maintenance', cycle: 2, refuelCraft: 'macaw' }],
    candidateEnding: async () => calls.push('candidate-ending'),
    terminalEnding: async () => calls.push('terminal-ending'),
  });
  assert.equal(planSteps.length, 7);
  assert.ok(planSteps.every(step => typeof step === 'function'));

  const context = { initial: { sessionId: 'fresh-session' }, roster: [{ roleId: 'capybara-recycler' }] };
  const state = { live: true, sessionId: 'fresh-session', cycle: 1, phase: 'active',
    turnPhase: { airspace: { state: 'restricted' } }, activeVesselIds: ['capybara'],
    shuttleDockings: [{ shuttleId: 'boa', shipId: 'capybara' }], shuttleFuelled: { boa: false },
    shipResources: { capybara: { fuel: 2 } }, shipDamage: { capybara: { destroyed: false, damagedSystemIds: [] } },
    maintenanceCycles: {} };
  const game = { context: { ...context, initial: context.initial, gm: {} }, state: async () => state,
    maintenanceUi: async (shipId, roleId, options) => {
      calls.push(`${shipId}/${roleId}/${Object.values(options.refuels)[0]}`);
      state.maintenanceCycles.capybara = { turn: 1, step: 0, completedAt: 'server-time' };
      return state.maintenanceCycles.capybara;
    } };
  const outcome = await planSteps[1]({ context, game, driver: {} });
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.refueledCraft, 'boa');
  assert.deepEqual(calls, ['capybara/capybara-recycler/boa']);
});

test('specialist callback reuses the injected browser helper and keeps terminal callbacks caller-owned', async () => {
  const calls = [];
  const context = { initial: { sessionId: 'fresh-session' }, gm: {}, crew: {}, roster: [], directory: '/tmp/proof' };
  const game = { context, actions: [], state: async () => ({ sessionId: 'fresh-session', live: true, cycle: 1 }),
    select: async () => ({}), save: async (_name, details) => { calls.push(`save:${details.status}`); } };
  const callback = createPc10SpecialistGameplayCallback({
    createTwoBrowserGameplay: actualContext => {
      assert.equal(actualContext, context);
      return game;
    },
    plan: { beforeSpecialists: async () => calls.push('base'),
      cycleOne: [async () => calls.push('specialist')],
      candidateEnding: async () => calls.push('candidate'),
      terminalEnding: async () => calls.push('terminal') },
  });
  assert.equal(typeof callback, 'function');
  const result = await callback(context);
  assert.deepEqual(calls, ['base', 'specialist', 'candidate', 'terminal', 'save:recorded']);
  assert.equal(result.outcomes.length, 4);
  assert.equal(result.game, game);
});
