import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PC10_SPECIALIST_ACTIONS,
  composePc10SpecialistSteps,
  makePc10SpecialistActionStep,
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
  const page = { getByRole: (role, options) => {
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
  const surface = { page: { getByRole: () => ({ isVisible: async () => false }) },
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

test('the action catalog contains specialist ordinary actions and no GM correction shortcut', () => {
  const endpoints = new Set(Object.values(PC10_SPECIALIST_ACTIONS).map(action => action.endpoint));
  for (const endpoint of [
    'buildFighter', 'requestScout', 'advanceEndeavourResearchTrack', 'activateEndeavourEcmDevice',
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest', 'sendFleetGroupMessage',
    'commitWolfBoardingDefenceChoice', 'recycleWithBoa', 'chooseBoaMissionReclamationOpportunity',
    'repairConsolesFromMacaw', 'proposePermissionedDismantling', 'consentToPermissionedDismantling',
    'applyPermissionedDismantling', 'resolveWolfAttackAftermath',
  ]) assert.ok(endpoints.has(endpoint), `missing ordinary source action ${endpoint}`);
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
