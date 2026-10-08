import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchStationCrewChoice } from './pc10-station-crew-dispatch.mjs';
import { heldProofFailureObservations } from './pc10-proof-failure-evidence.mjs';

const sessionId = 'session-pc10';
const deadlineAt = Date.now() + 60_000;

function attack(currentStep, revision = 8) {
  return { attackId: 'attack-p', threatSiteCode: 'P', turn: 3, revision,
    status: 'declared', currentStep, airspaceLocked: true };
}

function surface(roleId, response, { entitledShipId = 'icebreaker', path = '/ships/icebreaker/roles/icebreaker-miner',
  responses = {}, defenceOptions = ['0', '1', '2'], profileRoleId = roleId,
  ownerReturnHref = '/ships/icebreaker/roles/icebreaker-miner', onLinkWait } = {}) {
  const effects = { clicks: [], selected: [], reads: [], enabledChecks: [] };
  const selectedValues = new Map();
  const actor = { hasAuth: true, sameActor: true, uidHash: `uid-${roleId}`, sessionId,
    profileRoleId, assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId,
    playerRole: 'player', phase: 'active', cycle: 3, fleetGroupId: 'fleet-p', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null,
    airspace: 'restricted', turnStatePhase: 'team', turnStatePhaseRevision: 1,
    turnStateCurrentTurn: 3, turnStateMaxTurn: 6,
    turnStateStartedAt: '2026-10-08T00:10:00.000Z',
    turnStateEndsAt: '2026-10-08T00:10:00.000Z',
    openAirspaceEndsAt: '2026-10-08T00:30:00.000Z', teamPhaseEndsAt: '2026-10-08T00:10:00.000Z',
    turnPhaseTurn: 3, turnPhaseOpenAirspaceEndsAt: '2026-10-08T00:30:00.000Z',
    turnPhaseTeamPhaseEndsAt: '2026-10-08T00:10:00.000Z',
    phaseProgression: 'manual',
    connection: 'live', freshness: 'server' };
  const originalMember = structuredClone(actor);
  const authority = { sessionId, fleetGroupId: 'fleet-p', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null,
    seatId: roleId, connected: true,
    discoveryAuthority: { groupId: 'fleet-p', shipId: entitledShipId, revision: 2,
      fleetGroupVesselIds: [entitledShipId] } };
  const matches = (candidate, requested) => requested instanceof RegExp
    ? requested.test(candidate) : candidate === requested;
  const locator = (name, enabled = true, visible = true) => ({
    isVisible: async () => visible,
    isEnabled: async () => {
      const actual = typeof enabled === 'function' ? enabled() : enabled;
      effects.enabledChecks.push({ name, actual });
      return actual;
    },
    click: async () => { effects.clicks.push(name); },
    waitFor: async () => {},
    selectOption: async value => { effects.selected.push([name, value]); selectedValues.set(name, String(value)); },
    check: async () => { effects.selected.push([name, true]); },
    count: async () => 1,
    first() { return this; },
    nth() { return this; },
    all() { return Promise.resolve([this]); },
    locator: () => ({ evaluateAll: async inspect => inspect(defenceOptions.map(value => ({ value: String(value), disabled: false }))) }),
  });
  let currentRoute = path;
  let currentResponse = response;
  const panel = {
    isVisible: async () => currentRoute !== '/shuttles/highwall',
    innerText: async () => currentResponse?.reason === 'no-boarders'
      ? 'No surviving boarding parties are present on this ship. No Security Teams choice is required.'
      : `Cycle 3 // current source choice`,
    getByRole: (kind, options = {}) => {
      if (kind === 'button') {
        const name = options.name;
        const known = typeof name === 'string' ? name : Object.keys(buttons).find(value => matches(value, name));
        return locator(known ?? String(name), buttons[known] !== false, buttons[known] !== undefined);
      }
      if (kind === 'combobox') {
        const name = options.name;
        const fighterLabels = (currentResponse?.fighters ?? []).flatMap(({ fighterIndex }) => [
          `Fighter ${fighterIndex + 1} action`, `Fighter ${fighterIndex + 1} target`,
        ]);
        const known = typeof name === 'string' ? name : fighterLabels.find(label => name?.test?.(label)) ?? String(name);
        const enabled = known.endsWith(' target')
          ? () => ['attack', 'target-shift'].includes(selectedValues.get(known.replace('target', 'action')))
          : true;
        return locator(known, enabled, true);
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
  if (response?.wingId === 'pdf-escort-fighter-wing') {
    buttons['Pass Medium Range'] = true;
    buttons['Pass Short Range'] = true;
    buttons['Resolve Medium actions'] = true;
    buttons['Resolve selected Short attacks'] = true;
  }
  if (response?.choice?.kind === 'relocation') buttons['Stay at REFINERY 124'] = true;
  if ([response, ...Object.values(responses)].some(view => view?.type === 'wolf-boarding-defence-choice-view'))
    buttons['Commit defence'] = true;
  const page = {
    locator: () => ({ ...panel, isVisible: async () => currentRoute !== '/shuttles/highwall' }),
    getByRole: (kind, options = {}) => {
      if (kind === 'link') {
        const isVisible = async () => roleId === 'icebreaker-miner' &&
          (options.name === 'Open Highwall shuttle console' ? currentRoute !== '/shuttles/highwall'
            : options.name === 'Back to Icebreaker Miner console' && currentRoute === '/shuttles/highwall');
        return {
          isVisible,
          waitFor: async ({ state } = {}) => {
            if (state === 'visible' && !(await isVisible()))
              throw new Error(`Link ${String(options.name)} is not visible on ${currentRoute}.`);
            await onLinkWait?.(options.name, currentRoute);
          },
          getAttribute: async name => name === 'href'
            ? options.name === 'Back to Icebreaker Miner console' ? ownerReturnHref
              : options.name === 'Open Highwall shuttle console' ? '/shuttles/highwall' : null
            : null,
          click: async () => {
            if (!(await isVisible())) throw new Error(`Link ${String(options.name)} is not visible on ${currentRoute}.`);
            currentRoute = options.name === 'Open Highwall shuttle console'
              ? '/shuttles/highwall' : '/ships/icebreaker/roles/icebreaker-miner';
            effects.clicks.push(options.name);
            effects.routes.push(currentRoute);
          },
        };
      }
      if (kind === 'region' && /boarding/i.test(options.name ?? '')) return {
        ...panel,
        isVisible: async () => currentRoute !== '/shuttles/highwall',
      };
      if (kind === 'region' && /^Highwall Cannon /.test(options.name ?? '')) return {
        ...panel,
        isVisible: async () => currentRoute === '/shuttles/highwall',
      };
      return panel;
    },
    url: () => `https://new-eden.invalid/#${currentRoute}`,
    evaluate: async () => ({ ...actor, ...authority }),
  };
  effects.routes = [];
  return Object.assign({ label: roleId, page, route: () => currentRoute,
    originalMember,
    observe: async () => actor,
    storeModuleUrl: () => 'test://useSessionStore',
    testActor: actor,
    testAuthority: authority,
    callable: async (endpoint, payload) => {
      effects.reads.push({ endpoint, payload });
      currentResponse = responses[endpoint] ?? response;
      return { status: 'committed', result: currentResponse };
    },
  }, { effects });
}

function setLiftedCoordinationProjection(actor) {
  actor.testActor.airspace = 'lifted';
  actor.testActor.turnStatePhase = 'coordination';
  actor.testActor.turnStateEndsAt = actor.testActor.openAirspaceEndsAt;
}

function publishDeclaredAttackLock(actor, current) {
  actor.testActor.airspace = 'restricted';
  actor.testActor.turnStatePhase = 'team';
  actor.testActor.turnStatePhaseRevision++;
  actor.testActor.turnStateEndsAt = actor.testActor.teamPhaseEndsAt;
  return { ...current, airspaceLocked: true };
}

function options(actors, current, onAction, deadline = deadlineAt) {
  const actorChecks = [];
  return { actors, sessionId, deadlineAt: deadline, assertActor: async (actor, context) => {
    const observed = await actor.surface.observe();
    actorChecks.push({ roleId: actor.roleId, stage: context.stage, profileRoleId: observed.profileRoleId });
    assert.equal(actor.surface.label, actor.roleId);
    for (const key of ['uidHash', 'sessionId', 'playerRole', 'assignedRoleId', 'fleetGroupId'])
      assert.equal(observed[key], actor.surface.originalMember[key], `Original member ${key} must remain exact.`);
    assert.equal(observed.cycle, context.current.turn);
    assert.equal(observed.phase, 'active');
    return observed;
  }, readAttack: async () => current, action: async (surface, endpoint, choose, metadata) => {
    await choose();
    onAction?.({ surface, endpoint, metadata });
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
  }, actorChecks };
}

test('dispatches the currently offered PDF launch through its colonel console and original deadline', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true }, { profileRoleId: null });
  let accepted;
  const opts = options([{ roleId: pdf.label, surface: pdf }], attack('targeting'), value => { accepted = value; });
  const result = await dispatchStationCrewChoice(attack('targeting'), opts);
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(pdf.effects.reads.map(read => read.endpoint), ['getPdfEscortWingLaunch']);
  assert.deepEqual(pdf.effects.clicks, ['Launch PDF Escort Wing']);
  assert.equal(accepted.endpoint, 'launchPdfEscortWing');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
  assert.equal(Object.hasOwn(accepted.metadata, 'original'), false,
    'Lifecycle capture receives the original deadline and actor fence, never an incompatible observer snapshot.');
  assert.ok(opts.actorChecks.length > 0 && opts.actorChecks.every(check => check.profileRoleId === null),
    'An assigned actor with null profileRoleId stays bound to its observed live identity.');
});

test('retains the consumed PDF source reply and exact stale panel text when readiness rejects it', async () => {
  // Source-backed synthetic shape: the server's PDF view projects a recorded
  // unavailable choice with reason=waiting; Attempt21 did not retain this
  // reply or a native PDF panel snapshot.
  const view = { type: 'pdf-escort-wing-launch-view', sessionId, turn: 3, revision: 8,
    wingRevision: 4, launched: false, eligible: false, choiceStatus: 'unavailable', reason: 'waiting' };
  const pdf = surface('refinery-124-pdf-colonel', view);
  const staleText = 'Waiting for an active Wolf Attack targeting window.';
  pdf.page.locator = selector => {
    assert.equal(selector, '[aria-label="PDF Escort Wing launch control"]');
    return { isVisible: async () => true, innerText: async () => staleText };
  };
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /Painted blocker must match the current source reason/);
  const held = heldProofFailureObservations(failure).find(entry =>
    entry.operation === 'station-crew-current-source-readiness');
  assert.ok(held, 'The original readiness failure must retain its consumed observations.');
  assert.deepEqual(held.consumedObservations.sourceReplies, [{ endpoint: 'getPdfEscortWingLaunch',
    reply: { status: 'committed', result: view } }]);
  assert.deepEqual(held.consumedObservations.paintObservations, [{ panelText: staleText,
    result: { status: 'pending', reason: 'The current source blocker has not painted.' } }]);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('stops without a second actor choice when the attack tuple changes during the source read', async () => {
  let latest = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.callable = async (endpoint, payload, timeoutMs) => {
    pdf.effects.reads.push({ endpoint, payload, timeoutMs });
    latest = attack('targeting', 9);
    return { status: 'committed', result: { type: 'pdf-escort-wing-launch-view', sessionId,
      turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true } };
  };
  let actions = 0;
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => latest;
  opts.action = async () => { actions++; throw new Error('Changed source must stop before UI action.'); };
  assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
  assert.equal(actions, 0);
  assert.ok(pdf.effects.reads[0].timeoutMs > 0 && pdf.effects.reads[0].timeoutMs <= 35_000);
});

test('does not dispatch if the authoritative attack lock drops after the strict scope snapshot', async () => {
  let latest = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.callable = async (endpoint, payload, timeoutMs) => {
    pdf.effects.reads.push({ endpoint, payload, timeoutMs });
    latest = { ...latest, airspaceLocked: false };
    return { status: 'committed', result: { type: 'pdf-escort-wing-launch-view', sessionId,
      turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true } };
  };
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => latest;
  let actions = 0;
  opts.action = async () => { actions++; throw new Error('Unlocked attack must stop before UI action.'); };
  assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
  assert.equal(actions, 0);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('returns no choice when the supplied attack has already changed before dispatcher entry', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => attack('targeting', 9);
  assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('waits for the declared attack lock and restricted member view before freezing PDF action scope', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let latest = { ...initial, airspaceLocked: false };
  setLiftedCoordinationProjection(pdf);
  let pageSamples = 0;
  pdf.page.evaluate = async () => {
    const observed = { ...pdf.testActor, ...pdf.testAuthority };
    pageSamples++;
    if (pageSamples === 1) latest = publishDeclaredAttackLock(pdf, latest);
    return observed;
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
  opts.readAttack = async () => latest;
  opts.assertActor = async actor => { assert.equal(actor.surface.label, actor.roleId); return actor.surface.observe(); };
  const callable = pdf.callable;
  pdf.callable = async (...args) => {
    assert.equal(latest.airspaceLocked, true, 'No source view may be read before the server attack lock.');
    assert.equal(pdf.testActor.airspace, 'restricted', 'No source view may be read before the member projection is restricted.');
    assert.equal(pdf.testActor.turnStatePhase, 'team');
    assert.equal(pdf.testActor.turnStatePhaseRevision, 2,
      'The declaration must derive the Team phase revision from the captured Coordination revision.');
    assert.equal(pdf.testActor.turnStateCurrentTurn, 3);
    assert.equal(pdf.testActor.turnStateMaxTurn, 6);
    assert.equal(pdf.testActor.turnStateStartedAt, '2026-10-08T00:10:00.000Z');
    assert.equal(pdf.testActor.turnStateEndsAt, pdf.testActor.teamPhaseEndsAt);
    return callable(...args);
  };

  assert.deepEqual(await dispatchStationCrewChoice(initial, opts), { committed: true });
  assert.ok(pageSamples >= 3, 'The actor must be sampled again after the attack locks and once more by the strict observer.');
  assert.equal(pdf.effects.reads.length, 1);
  assert.equal(pdf.effects.clicks.at(-1), 'Launch PDF Escort Wing');
});

function installDelayedRestrictedProjection(actor, current) {
  const initial = { ...current, airspaceLocked: false };
  let latest = initial, sampleCount = 0;
  setLiftedCoordinationProjection(actor);
  actor.page.evaluate = async () => {
    const observed = { ...actor.testActor, ...actor.testAuthority };
    sampleCount++;
    if (sampleCount === 1) latest = publishDeclaredAttackLock(actor, latest);
    return observed;
  };
  const callable = actor.callable;
  actor.callable = async (...args) => {
    assert.equal(latest.airspaceLocked, true, 'The exact P attack must be authoritatively locked before any current choice read.');
    assert.equal(actor.testActor.airspace, 'restricted', 'The source read must wait for this member’s restricted projection.');
    assert.equal(actor.testActor.turnStatePhase, 'team');
    assert.equal(actor.testActor.turnStatePhaseRevision, 2,
      'The source-derived Coordination-to-Team phase revision must be exactly one higher.');
    assert.equal(actor.testActor.turnStateCurrentTurn, 3);
    assert.equal(actor.testActor.turnStateMaxTurn, 6);
    assert.equal(actor.testActor.turnStateStartedAt, '2026-10-08T00:10:00.000Z');
    assert.equal(actor.testActor.turnStateEndsAt, actor.testActor.teamPhaseEndsAt);
    return callable(...args);
  };
  return { initial, readAttack: async () => latest, sampleCount: () => sampleCount };
}

const delayedLockCases = [
  { name: 'PDF escort range', roleId: 'refinery-124-pdf-colonel', step: 'medium-range',
    view: { type: 'wolf-fighter-range-action-view', sessionId, attackId: 'attack-p', turn: 3, revision: 8,
      wingId: 'pdf-escort-fighter-wing', wingLabel: 'P.D.F. Escort Fighter Wing', range: 'medium-range',
      choiceStatus: 'pending', launched: true, fighters: [{ fighterIndex: 0 }],
      targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 4 }] },
    endpoint: 'getWolfEscortRangeActionChoice' },
  { name: 'Miner Highwall range', roleId: 'icebreaker-miner', step: 'long-range', path: '/shuttles/highwall',
    view: { type: 'wolf-range-support-action-choice-view', sessionId, attackId: 'attack-p', turn: 3, revision: 8,
      sourceId: 'highwall', actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending',
      eligible: true, actionAvailable: false }, endpoint: 'getWolfRangeSupportActionChoice' },
  { name: 'boarding special', roleId: 'refinery-124-pdf-colonel', step: 'boarding',
    view: { type: 'wolf-boarding-special-choice-view', sessionId, turn: 3, revision: 8,
      choice: { kind: 'relocation', craftId: 'chepu', currentHostId: 'refinery-124', fuelled: false,
        controlRevision: 2, legalHostIds: ['refinery-124'] } }, endpoint: 'getWolfBoardingSpecialChoice',
    entitledShipId: 'refinery-124' },
  { name: 'boarding defence', roleId: 'icebreaker-miner', step: 'boarding',
    view: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
    responses: { getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-view', sessionId,
      turn: 3, revision: 8, targetShipId: 'icebreaker', boardingParties: 1,
      availableSecurityTeams: 2, choiceStatus: 'pending' } }, endpoint: 'getWolfBoardingSpecialChoice',
    secondaryEndpoint: 'getWolfBoardingDefenceChoice' },
];

for (const scenario of delayedLockCases) {
  test(`waits for the locked restricted projection before reading ${scenario.name}`, async () => {
    const actor = surface(scenario.roleId, scenario.view, { path: scenario.path,
      entitledShipId: scenario.entitledShipId, responses: scenario.responses });
    const current = attack(scenario.step);
    const delayed = installDelayedRestrictedProjection(actor, current);
    const opts = options([{ roleId: actor.label, surface: actor }], delayed.initial);
    opts.readAttack = delayed.readAttack;
    opts.assertActor = async supplied => {
      assert.equal(supplied.surface.label, supplied.roleId);
      const sample = await supplied.surface.observe();
      assert.equal(sample.uidHash, supplied.surface.testActor.uidHash);
      return sample;
    };

    const result = await dispatchStationCrewChoice(delayed.initial, opts);
    assert.ok(result === undefined || result.committed === true);
    assert.ok(actor.effects.reads.some(read => read.endpoint === scenario.endpoint));
    if (scenario.secondaryEndpoint)
      assert.ok(actor.effects.reads.some(read => read.endpoint === scenario.secondaryEndpoint));
    assert.ok(delayed.sampleCount() >= 3);
  });
}

test('keeps the original discovery epoch pinned during restricted-lock readiness and retains the failure evidence', async () => {
  const actor = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  const delayed = installDelayedRestrictedProjection(actor, current);
  const originalEvaluate = actor.page.evaluate;
  let samples = 0;
  actor.page.evaluate = async (...args) => {
    samples++;
    if (samples === 2) actor.testAuthority.discoveryAuthority = { ...actor.testAuthority.discoveryAuthority,
      revision: actor.testAuthority.discoveryAuthority.revision + 1 };
    return originalEvaluate(...args);
  };
  const opts = options([{ roleId: actor.label, surface: actor }], delayed.initial);
  opts.readAttack = delayed.readAttack;
  opts.assertActor = async supplied => supplied.surface.observe();
  let failure;
  try { await dispatchStationCrewChoice(delayed.initial, opts); } catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /discovery authority changed before choice scope freeze/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.equal(held.consumedObservations.actorScopes.length, 2);
  assert.equal(held.consumedObservations.actorScopes[0].discoveryAuthority.revision, 2);
  assert.equal(held.consumedObservations.actorScopes[1].discoveryAuthority.revision, 3);
  assert.deepEqual(actor.effects.reads, []);
  assert.deepEqual(actor.effects.clicks, []);
});

for (const changedField of ['attackId', 'revision']) {
  test(`stops with zero source or UI work when the current attack ${changedField} changes during lock readiness`, async () => {
    const initial = { ...attack('targeting'), airspaceLocked: false };
    const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
      sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
    let attackReads = 0, actions = 0;
    const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
    opts.readAttack = async () => {
      attackReads++;
      return attackReads === 1 ? initial : { ...initial,
        [changedField]: changedField === 'revision' ? initial.revision + 1 : 'replacement-attack' };
    };
    opts.action = async () => { actions++; throw new Error('A changed attack must not reach a UI action.'); };

    assert.equal(await dispatchStationCrewChoice(initial, opts), undefined);
    assert.ok(attackReads >= 2, 'The attack must change after dispatcher entry while the actor scope is being sampled.');
    assert.deepEqual(pdf.effects.reads, []);
    assert.deepEqual(pdf.effects.clicks, []);
    assert.equal(actions, 0);
  });
}

test('keeps the original deadline when the member remains lifted and retains timeout observations', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  setLiftedCoordinationProjection(pdf);
  const originalDeadlineAt = Date.now() + 120;
  const opts = { ...options([{ roleId: pdf.label, surface: pdf }], initial), deadlineAt: originalDeadlineAt,
    readAttack: async () => initial };
  let failure;
  try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /deadline expired/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.equal(held.deadlineAt, originalDeadlineAt);
  assert.deepEqual(held.originalAttack, { attackId: 'attack-p', threatSiteCode: 'P', turn: 3,
    revision: 8, status: 'declared', currentStep: 'targeting', airspaceLocked: false });
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

for (const changedField of ['connectionGeneration', 'identityHydrationRevision', 'uidHash']) {
  test(`rejects ${changedField} drift during lock readiness before reading or acting`, async () => {
    const initial = { ...attack('targeting'), airspaceLocked: false };
    const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
      sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
    let latest = initial, samples = 0;
    setLiftedCoordinationProjection(pdf);
    pdf.page.evaluate = async () => {
      samples++;
      if (samples === 1) {
        const observed = { ...pdf.testActor, ...pdf.testAuthority };
        latest = publishDeclaredAttackLock(pdf, latest);
        return observed;
      }
      if (samples === 2) {
        if (changedField === 'uidHash') pdf.testActor.uidHash = 'different-authenticated-actor';
        else {
          pdf.testActor[changedField]++;
          pdf.testAuthority[changedField]++;
        }
      }
      return { ...pdf.testActor, ...pdf.testAuthority };
    };
    const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
    opts.readAttack = async () => latest;
    let failure;
    try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

    assert.match(failure?.message ?? '', new RegExp(`Original combat ${changedField} changed|Original Station actor ${changedField} changed|Original member ${changedField} must remain exact`));
    const [held] = heldProofFailureObservations(failure);
    assert.equal(held.operation, 'station-crew-lock-readiness');
    assert.ok(held.consumedObservations.actorScopes.length >= 1);
    assert.deepEqual(pdf.effects.reads, []);
    assert.deepEqual(pdf.effects.clicks, []);
  });
}

test('rejects a mixed restricted/coordination pair during lock readiness', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let latest = initial, samples = 0;
  setLiftedCoordinationProjection(pdf);
  pdf.page.evaluate = async () => {
    samples++;
    if (samples === 1) {
      const observed = { ...pdf.testActor, ...pdf.testAuthority };
      pdf.testActor.airspace = 'restricted';
      latest = { ...latest, airspaceLocked: true };
      return observed;
    }
    return { ...pdf.testActor, ...pdf.testAuthority };
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
  opts.readAttack = async () => latest;
  let failure;
  try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /restricted\/coordination|turnStatePhase changed/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects a phaseRevision jump beyond the exact declaration-derived increment', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let latest = initial, samples = 0;
  setLiftedCoordinationProjection(pdf);
  pdf.page.evaluate = async () => {
    samples++;
    if (samples === 1) {
      const observed = { ...pdf.testActor, ...pdf.testAuthority };
      latest = publishDeclaredAttackLock(pdf, latest);
      pdf.testActor.turnStatePhaseRevision++;
      return observed;
    }
    return { ...pdf.testActor, ...pdf.testAuthority };
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
  opts.readAttack = async () => latest;
  let failure;
  try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /phaseRevision|turnState phase revision/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects restricted-to-lifted restoration after scope freeze inside the strict observer fence', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let strictSamples = 0;
  pdf.observe = async () => ({ ...pdf.testActor });
  pdf.page.evaluate = async () => {
    strictSamples++;
    if (strictSamples === 4) pdf.testActor.airspace = 'lifted';
    return { ...pdf.testActor, ...pdf.testAuthority };
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /Original combat airspace changed/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-current-source-readiness');
  assert.equal(held.originalActor.airspace, 'restricted');
  assert.equal(held.consumedObservations.actorScopes.length, 2);
  assert.deepEqual(pdf.effects.reads, [], 'Strict post-freeze actor drift is rejected before private choice read.');
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects a post-freeze turnStatePhase change inside the strict observer fence', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let strictSamples = 0;
  pdf.observe = async () => ({ ...pdf.testActor });
  pdf.page.evaluate = async () => {
    strictSamples++;
    if (strictSamples === 4) pdf.testActor.turnStatePhase = 'coordination';
    return { ...pdf.testActor, ...pdf.testAuthority };
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /Original combat turnStatePhase changed/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-current-source-readiness');
  assert.equal(held.originalActor.turnStatePhase, 'team');
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('does not treat a generic action wrapper status as a committed source receipt', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.action = async (surface, endpoint, choose, metadata) => {
    await choose();
    return { endpoint, data: metadata.expectedRequest, status: 'committed' };
  };
  await assert.rejects(dispatchStationCrewChoice(current, opts),
    /Actual launchPdfEscortWing UI result did not carry a committed or replayed source receipt/);
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
  assert.deepEqual(accepted.metadata.expectedRequest.actions,
    [{ kind: 'attack', targetContactId: 'contact-1', fighterIndex: 0 }]);
});

test('commits the visible PDF Short fighters from the current source view', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'wolf-fighter-range-action-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, wingId: 'pdf-escort-fighter-wing',
    wingLabel: 'P.D.F. Escort Fighter Wing', range: 'short-range', choiceStatus: 'pending', launched: true,
    fighters: [{ fighterIndex: 0 }], targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 4 }] });
  let accepted;
  const current = attack('short-range');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current, value => { accepted = value; });
  const result = await dispatchStationCrewChoice(current, opts);
  assert.deepEqual(result, { committed: true });
  assert.ok(pdf.effects.selected.some(([name, value]) => String(name).includes('Short attack') && value === true));
  assert.equal(accepted.endpoint, 'commitWolfEscortRangeActionChoice');
  assert.deepEqual(accepted.metadata.expectedRequest.fighterIndexes, [0]);
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

test('returns from the real Highwall route to the printed Miner console before boarding reads', async () => {
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall', responses: {
    getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
    getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
  } });
  const current = attack('boarding');
  const result = await dispatchStationCrewChoice(current, { ...options([{ roleId: miner.label, surface: miner }], current),
    deadlineAt: Date.now() + 400 });
  assert.equal(result, undefined);
  assert.equal(miner.effects.clicks[0], 'Back to Icebreaker Miner console');
  assert.equal(miner.route(), '/ships/icebreaker/roles/icebreaker-miner');
  assert.deepEqual(miner.effects.routes, ['/ships/icebreaker/roles/icebreaker-miner']);
  assert.deepEqual(miner.effects.reads.map(read => read.endpoint), [
    'getWolfBoardingSpecialChoice', 'getWolfBoardingDefenceChoice',
  ]);
});

test('returns from Highwall before directly offered Miner boarding defence', async () => {
  const miner = surface('icebreaker-miner', { type: 'wolf-range-support-action-choice-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, sourceId: 'highwall',
    actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending', eligible: true,
    actionAvailable: false, deadlineAt: '9999-12-31T23:59:59.999Z', contacts: [] }, { defenceOptions: ['0', '1'], responses: {
    getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
    getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-view', sessionId,
      turn: 3, revision: 8, choiceStatus: 'pending', targetShipId: 'icebreaker', availableSecurityTeams: 1 },
  } });
  const rangeAttack = attack('long-range');
  const rangeResult = await dispatchStationCrewChoice(rangeAttack,
    { ...options([{ roleId: miner.label, surface: miner }], rangeAttack), deadlineAt: Date.now() + 10_000 });
  assert.deepEqual(rangeResult, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Open Highwall shuttle console', 'Pass this range']);
  assert.equal(miner.route(), '/shuttles/highwall');

  const current = attack('boarding');
  let accepted;
  const result = await dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current,
    value => { accepted = value; }, Date.now() + 10_000));
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Open Highwall shuttle console', 'Pass this range',
    'Back to Icebreaker Miner console', 'Commit defence']);
  assert.equal(miner.route(), '/ships/icebreaker/roles/icebreaker-miner');
  assert.deepEqual(miner.effects.reads.map(read => read.endpoint), [
    'getWolfRangeSupportActionChoice', 'getWolfBoardingSpecialChoice', 'getWolfBoardingDefenceChoice',
  ]);
  assert.equal(accepted.endpoint, 'commitWolfBoardingDefenceChoice');
});

test('does not click a Miner return link when the owner destination is not the assigned console', async () => {
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    ownerReturnHref: '/ships/quellon/roles/quellon-engineer', responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const current = attack('boarding');
  await assert.rejects(dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current)),
    /printed Miner owner return link must target the assigned Miner console/);
  assert.deepEqual(miner.effects.clicks, []);
  assert.deepEqual(miner.effects.reads, []);
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('does not follow a same-path Miner return href from a foreign origin', async () => {
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    ownerReturnHref: 'https://outside.invalid/ships/icebreaker/roles/icebreaker-miner', responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const current = attack('boarding');
  await assert.rejects(dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current)),
    /current console navigation link must stay on the original browser origin/);
  assert.deepEqual(miner.effects.clicks, [], 'A same-path cross-origin owner href must be rejected before click.');
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('rejects Miner generation drift before the owner return click under the current-member fence', async () => {
  let miner;
  miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    onLinkWait: async name => {
      if (name === 'Back to Icebreaker Miner console') {
        miner.testActor.connectionGeneration++;
        miner.testAuthority.connectionGeneration++;
      }
    }, responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const current = attack('boarding');
  await assert.rejects(dispatchStationCrewChoice(current,
    options([{ roleId: miner.label, surface: miner }], current)),
  /Original (?:combat connectionGeneration|Station actor connectionGeneration) changed/);
  assert.deepEqual(miner.effects.clicks, []);
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('rejects P attack revision drift while the Miner owner return link is waiting', async () => {
  const current = attack('boarding');
  let liveAttack = current;
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    onLinkWait: async name => {
      if (name === 'Back to Icebreaker Miner console') liveAttack = { ...current, revision: current.revision + 1 };
    }, responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const opts = options([{ roleId: miner.label, surface: miner }], current);
  opts.readAttack = async () => liveAttack;
  await assert.rejects(dispatchStationCrewChoice(current, opts),
    /The original P attack or exact lock changed before final Station UI intent/);
  assert.deepEqual(miner.effects.clicks, []);
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('Highwall entry is a no-op when already mounted and remains stable on repeated range dispatch', async () => {
  const miner = surface('icebreaker-miner', { type: 'wolf-range-support-action-choice-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, sourceId: 'highwall',
    actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending', eligible: true,
    actionAvailable: false, deadlineAt: '9999-12-31T23:59:59.999Z', contacts: [] }, { path: '/shuttles/highwall' });
  const current = attack('long-range');
  const first = await dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current));
  assert.deepEqual(first, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Pass this range']);
  const second = await dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current));
  assert.deepEqual(second, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Pass this range', 'Pass this range']);
  assert.equal(miner.route(), '/shuttles/highwall');
  assert.deepEqual(miner.effects.routes, []);
});

test('continues across supplied boarding actors until the source offers a current crew special choice', async () => {
  const wing = surface('wing-commander', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { entitledShipId: 'aegis', responses: {
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
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
  const defence = { type: 'wolf-boarding-defence-choice-view', sessionId, turn: 3, revision: 8,
    targetShipId: 'icebreaker', boardingParties: 2, availableSecurityTeams: 2,
    choiceStatus: 'pending', deadlineAt: '9999-12-31T23:59:59.999Z' };
  // One surface provides the same ordinary actor's two actual current views.
  const crew = surface('icebreaker-miner', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { entitledShipId: 'icebreaker', responses: {
      getWolfBoardingDefenceChoice: defence,
    } });
  let accepted;
  const current = attack('boarding');
  const opts = options([{ roleId: crew.label, surface: crew }], current, value => { accepted = value; });
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

for (const stage of ['enabled-control wait', 'lifecycle capture wait']) {
  for (const changedField of ['turnStatePhase', 'turnStatePhaseRevision', 'attack revision']) {
    test(`rejects frozen ${changedField} drift during the ${stage} before PDF launch intent`, async () => {
      const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
        sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
      const current = attack('targeting');
      let latestAttack = current;
      let enabledAttackDrift = false, postEnableAttackReads = 0;
      const mutate = () => {
        if (changedField === 'turnStatePhase') pdf.testActor.turnStatePhase = 'coordination';
        else if (changedField === 'turnStatePhaseRevision') pdf.testActor.turnStatePhaseRevision++;
        else if (stage === 'enabled-control wait') enabledAttackDrift = true;
        else latestAttack = attack('targeting', current.revision + 1);
      };
      const opts = options([{ roleId: pdf.label, surface: pdf }], current);
      opts.readAttack = async () => {
        if (enabledAttackDrift) {
          postEnableAttackReads++;
          return postEnableAttackReads === 1 ? current : attack('targeting', current.revision + 1);
        }
        return latestAttack;
      };

      if (stage === 'enabled-control wait') {
        const originalLocator = pdf.page.locator;
        pdf.page.locator = (...args) => {
          const panel = originalLocator(...args), originalGetByRole = panel.getByRole;
          return { ...panel, getByRole: (kind, requested) => {
            const control = originalGetByRole(kind, requested);
            if (kind === 'button' && requested.name === 'Launch PDF Escort Wing')
              return { ...control, isEnabled: async () => { mutate(); return true; } };
            return control;
          } };
        };
      } else {
        opts.action = async (surface, endpoint, choose, metadata) => {
          mutate();
          await choose();
          return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
        };
      }

      let result, failure;
      try { result = await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
      assert.ok(failure, `Expected stale UI intent rejection; received ${JSON.stringify(result)}.`);
      assert.match(failure.message, changedField === 'attack revision' ? /attack|source changed/i : /phase|turnState/);
      const [held] = heldProofFailureObservations(failure).filter(item => item.operation === 'station-crew-final-ui-intent');
      assert.ok(held, 'The original final-intent failure must retain its frozen scope and read trace.');
      assert.equal(held.deadlineAt, deadlineAt);
      assert.equal(held.originalAttack.attackId, current.attackId);
      assert.ok(held.consumedObservations.actorScopes.length > 0);
      if (stage === 'enabled-control wait' && changedField === 'attack revision')
        assert.equal(postEnableAttackReads, 2, 'The frozen attack must be rechecked inside the final UI-intent callback.');
      assert.deepEqual(pdf.effects.clicks, [], 'Stale UI intent must be rejected before a browser click.');
    });
  }
}

test('rechecks the exact P attack after the final actor sample before PDF launch intent', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  let insideAction = false, finalAttackRead = false, latestAttack = current;
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => {
    if (insideAction && !finalAttackRead) {
      finalAttackRead = true;
      return current;
    }
    return latestAttack;
  };
  const originalEvaluate = pdf.page.evaluate;
  pdf.page.evaluate = async (...args) => {
    const sample = await originalEvaluate(...args);
    if (insideAction && finalAttackRead) latestAttack = attack('targeting', current.revision + 1);
    return sample;
  };
  opts.action = async (surface, endpoint, choose, metadata) => {
    insideAction = true;
    await choose();
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
  };

  let result, failure;
  try { result = await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
  assert.ok(failure, `Expected post-sample attack drift rejection; received ${JSON.stringify(result)}.`);
  assert.match(failure.message, /attack|source changed/i);
  const [held] = heldProofFailureObservations(failure).filter(item => item.operation === 'station-crew-final-ui-intent');
  assert.ok(held, 'The final-intent failure must retain the original source evidence.');
  assert.equal(held.observedAttack.revision, current.revision + 1);
  assert.deepEqual(pdf.effects.clicks, [], 'The old source action must not click after the attack changes during actor sampling.');
});
