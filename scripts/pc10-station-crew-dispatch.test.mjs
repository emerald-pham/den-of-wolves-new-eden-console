import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchStationCrewChoice } from './pc10-station-crew-dispatch.mjs';

const sessionId = 'session-pc10';
const deadlineAt = Date.now() + 15_000;

function attack(currentStep, revision = 8) {
  return { attackId: 'attack-p', threatSiteCode: 'P', turn: 3, revision,
    status: 'declared', currentStep };
}

function surface(roleId, response, { entitledShipId = 'icebreaker', path = '/ships/icebreaker' } = {}) {
  const effects = { clicks: [], selected: [], reads: [] };
  const actor = { hasAuth: true, sameActor: true, uidHash: `uid-${roleId}`, sessionId,
    profileRoleId: roleId, assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId,
    playerRole: 'player', phase: 'active', cycle: 3, fleetGroupId: 'fleet-p', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null,
    airspace: 'lifted', turnStatePhase: 'coordination', phaseProgression: 'manual',
    connection: 'live', freshness: 'server' };
  const authority = { sessionId, fleetGroupId: 'fleet-p', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null,
    seatId: roleId, connected: true,
    discoveryAuthority: { groupId: 'fleet-p', shipId: entitledShipId, revision: 2,
      fleetGroupVesselIds: [entitledShipId] } };
  const matches = (candidate, requested) => requested instanceof RegExp
    ? requested.test(candidate) : candidate === requested;
  const locator = (name, enabled = true, visible = true) => ({
    isVisible: async () => visible,
    isEnabled: async () => enabled,
    click: async () => { effects.clicks.push(name); },
    waitFor: async () => {},
    selectOption: async value => { effects.selected.push([name, value]); },
    check: async () => { effects.selected.push([name, true]); },
    count: async () => 1,
    first() { return this; },
    nth() { return this; },
    all: async () => [this],
    locator: () => ({ evaluateAll: async () => [0, 1, 2].map(value => ({ value: String(value), disabled: false })) }),
  });
  let linkOpened = false;
  const panel = {
    isVisible: async () => true,
    innerText: async () => `Cycle 3 // current source choice`,
    getByRole: (kind, options = {}) => {
      if (kind === 'button') {
        const name = options.name;
        const known = typeof name === 'string' ? name : Object.keys(buttons).find(value => matches(value, name));
        return locator(known ?? String(name), buttons[known] !== false, buttons[known] !== undefined);
      }
      if (kind === 'combobox') {
        const name = options.name;
        const known = typeof name === 'string' ? name : String(name);
        return locator(known, true, true);
      }
      if (kind === 'checkbox') return locator(String(options.name), true, true);
      return locator(String(options.name), true, true);
    },
  };
  const buttons = Object.create(null);
  if (response?.type === 'pdf-escort-wing-launch-view') {
    buttons['Launch PDF Escort Wing'] = true;
    buttons['Pass PDF Escort Wing'] = true;
  }
  if (response?.sourceId === 'highwall') {
    buttons['Use Highwall Cannon'] = response.actionAvailable;
    buttons['Pass this range'] = true;
  }
  if (response?.wingId === 'pdf-escort-fighter-wing') buttons['Pass Medium Range'] = true;
  if (response?.choice?.kind === 'relocation') buttons['Stay at REFINERY 124'] = true;
  if (response?.type === 'wolf-boarding-defence-choice-view') buttons['Commit defence'] = true;
  const page = {
    locator: () => panel,
    getByRole: (kind, options = {}) => {
      if (kind === 'link') return {
        isVisible: async () => roleId === 'icebreaker-miner',
        waitFor: async () => {},
        click: async () => { linkOpened = true; effects.clicks.push(options.name); },
      };
      return panel;
    },
    url: () => `https://new-eden.invalid${linkOpened ? '/shuttles/highwall' : path}`,
    evaluate: async () => authority,
  };
  return Object.assign({ label: roleId, page,
    observe: async () => actor,
    storeModuleUrl: () => 'test://useSessionStore',
    callable: async (endpoint, payload) => {
      effects.reads.push({ endpoint, payload });
      return { status: 'committed', result: response };
    },
  }, { effects });
}

function options(actors, current, onAction) {
  const actorChecks = [];
  return { actors, sessionId, deadlineAt, assertActor: async (actor, context) => {
    actorChecks.push({ roleId: actor.roleId, stage: context.stage });
    assert.equal(actor.surface.label, actor.roleId);
  }, readAttack: async () => current, action: async (surface, endpoint, choose, metadata) => {
    await choose();
    onAction?.({ surface, endpoint, metadata });
    return { endpoint, httpStatus: 200, result: { status: 'committed' } };
  }, actorChecks };
}

test('dispatches the currently offered PDF launch through its colonel console and original deadline', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let accepted;
  const opts = options([{ roleId: pdf.label, surface: pdf }], attack('targeting'), value => { accepted = value; });
  const result = await dispatchStationCrewChoice(attack('targeting'), opts);
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(pdf.effects.reads.map(read => read.endpoint), ['getPdfEscortWingLaunch']);
  assert.deepEqual(pdf.effects.clicks, ['Launch PDF Escort Wing']);
  assert.equal(accepted.endpoint, 'launchPdfEscortWing');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
});

test('dispatches the PDF medium-range choice from the current escort view', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'wolf-fighter-range-action-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, wingId: 'pdf-escort-fighter-wing',
    wingLabel: 'P.D.F. Escort Fighter Wing', range: 'medium-range', choiceStatus: 'pending', launched: true,
    fighters: [{ fighterIndex: 0 }], targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 4 }] });
  let accepted;
  const opts = options([{ roleId: pdf.label, surface: pdf }], attack('medium-range'), value => { accepted = value; });
  const result = await dispatchStationCrewChoice(attack('medium-range'), opts);
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(pdf.effects.reads.map(read => read.endpoint), ['getWolfEscortRangeActionChoice']);
  assert.ok(pdf.effects.selected.some(([, value]) => value === 'attack'));
  assert.ok(pdf.effects.selected.some(([, value]) => value === 'contact-1'));
  assert.equal(accepted.endpoint, 'commitWolfEscortRangeActionChoice');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
});

test('opens the current Miner Highwall console and explicitly passes a long-range choice', async () => {
  const miner = surface('icebreaker-miner', { type: 'wolf-range-support-action-choice-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, sourceId: 'highwall',
    actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending', eligible: true,
    actionAvailable: false, deadlineAt: '9999-12-31T23:59:59.999Z', contacts: [] });
  let accepted;
  const opts = options([{ roleId: miner.label, surface: miner }], attack('long-range'), value => { accepted = value; });
  const result = await dispatchStationCrewChoice(attack('long-range'), opts);
  assert.deepEqual(result, { committed: true });
  assert.equal(miner.effects.clicks[0], 'Open Highwall shuttle console');
  assert.equal(miner.effects.clicks.at(-1), 'Pass this range');
  assert.equal(accepted.endpoint, 'commitWolfRangeSupportActionChoice');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
});

test('continues across supplied boarding actors until the source offers a current crew special choice', async () => {
  const wing = surface('wing-commander', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { entitledShipId: 'aegis' });
  const pdf = surface('refinery-124-pdf-colonel', { type: 'wolf-boarding-special-choice-view',
    sessionId, turn: 3, revision: 8, choice: { kind: 'relocation', craftId: 'chepu',
      currentHostId: 'refinery-124', fuelled: false, controlRevision: 2, legalHostIds: ['refinery-124'] } },
  { entitledShipId: 'refinery-124' });
  let accepted;
  const current = attack('boarding');
  const opts = options([{ roleId: wing.label, surface: wing }, { roleId: pdf.label, surface: pdf }], current,
    value => { accepted = value; });
  const result = await dispatchStationCrewChoice(current, opts);
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(wing.effects.reads.map(read => read.endpoint), ['getWolfBoardingSpecialChoice', 'getWolfBoardingDefenceChoice']);
  assert.deepEqual(pdf.effects.reads.map(read => read.endpoint), ['getWolfBoardingSpecialChoice']);
  assert.deepEqual(pdf.effects.clicks, ['Stay at REFINERY 124']);
  assert.equal(accepted.endpoint, 'commitWolfBoardingSpecialChoice');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
});

test('commits defence only for the current discovered ship and chooses within offered Security Team options', async () => {
  const miner = surface('icebreaker-miner', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { entitledShipId: 'icebreaker' });
  const defence = { type: 'wolf-boarding-defence-choice-view', sessionId, turn: 3, revision: 8,
    targetShipId: 'icebreaker', boardingParties: 2, availableSecurityTeams: 2,
    choiceStatus: 'pending', deadlineAt: '9999-12-31T23:59:59.999Z' };
  // One surface provides the same ordinary actor's two actual current views.
  const crew = surface('icebreaker-miner', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { entitledShipId: 'icebreaker' });
  crew.callable = async (endpoint, payload) => {
    crew.effects.reads.push({ endpoint, payload });
    return { status: 'committed', result: endpoint === 'getWolfBoardingSpecialChoice'
      ? { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' } : defence };
  };
  let accepted;
  const current = attack('boarding');
  const opts = options([{ roleId: miner.label, surface: crew }], current, value => { accepted = value; });
  const result = await dispatchStationCrewChoice(current, opts);
  assert.deepEqual(result, { committed: true });
  assert.equal(crew.effects.clicks.at(-1), 'Commit defence');
  assert.ok(crew.effects.selected.some(([, value]) => value === '2'));
  assert.equal(accepted.endpoint, 'commitWolfBoardingDefenceChoice');
  assert.deepEqual(accepted.metadata.expectedRequest, { sessionId, expectedTurn: 3,
    expectedRevision: 8, targetShipId: 'icebreaker', securityTeams: 2 });
});

test('does not select absent crew, the Press desk, or the existing Wing route for non-boarding steps', async () => {
  const press = surface('press-officer', { type: 'wolf-boarding-special-choice-unavailable', sessionId,
    reason: 'no-special-choice' });
  const result = await dispatchStationCrewChoice(attack('long-range'), options([
    { roleId: 'absent-pdf-colonel', surface: surface('absent-pdf-colonel', null) },
    { roleId: press.label, surface: press },
    { roleId: 'wing-commander', surface: surface('wing-commander', null) },
  ], attack('long-range')));
  assert.equal(result, undefined);
  assert.equal(press.effects.reads.length, 0);
});

test('unknown offered boarding special kinds fail with a specific error before any mutation', async () => {
  const crew = surface('refinery-124-pdf-colonel', { type: 'wolf-boarding-special-choice-view',
    sessionId, turn: 3, revision: 8, choice: { kind: 'unknown-source-choice' } },
  { entitledShipId: 'refinery-124' });
  const opts = options([{ roleId: crew.label, surface: crew }], attack('boarding'));
  await assert.rejects(dispatchStationCrewChoice(attack('boarding'), opts),
    /Unknown current boarding special choice kind: unknown-source-choice/);
  assert.deepEqual(crew.effects.clicks, []);
});
