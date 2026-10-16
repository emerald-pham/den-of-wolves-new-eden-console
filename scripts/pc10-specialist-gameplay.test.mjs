import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSpecialistGameplayDriver,
  createSpecialistGameplayCallback,
  SPECIALIST_ACTION_MAP,
  projectSpecialistActionEvidence,
  sameActionReceipt,
} from './pc10-specialist-gameplay.mjs';

test('specialist driver waits for matching live GM and ordinary crew projections and a visible result', async () => {
  const gm = { label: 'gm' }, crew = { label: 'crew' };
  const live = { live: true, sessionId: 'fresh-session', cycle: 1 };
  const actor = { uidHash: 'same-actor-hash', sessionId: 'fresh-session', sameActor: true,
    profileRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler',
    connection: 'live', freshness: 'server' };
  crew.observe = async () => actor;
  let polls = 0;
  const game = {
    context: { gm, initial: { sessionId: 'fresh-session' } },
    select: async () => crew,
    state: async surface => surface === gm
      ? polls === 0 ? { ...live, live: false } : live
      : live,
  };
  const driver = createSpecialistGameplayDriver(game, { wait: async () => { polls += 1; } });
  const proof = await driver.waitForCommit({ surface: crew, actor,
    inspect: async ({ gmState, crewState, actor: currentActor }) => ({
      ready: gmState.live && crewState.live && currentActor.activeConsoleRoleId === 'capybara-recycler',
      gmRevision: 9, crewRevision: 9, renderedStatusCode: 'public-result-visible',
    }) });
  assert.equal(polls, 1, 'Do not accept an optimistic result before the GM projection is current.');
  assert.deepEqual(proof.gm, { source: 'server', cycle: 1, revision: 9, status: 'committed' });
  assert.deepEqual(proof.crew, { source: 'server', cycle: 1, revision: 9, status: 'committed' });
  assert.equal(proof.renderedStatus, 'public-result-visible');
});

test('specialist driver never commits a projection from another session or changed actor', async () => {
  const gm = { label: 'gm' }, crew = { label: 'crew' };
  const game = { context: { gm, initial: { sessionId: 'fresh-session' } }, select: async () => crew,
    state: async () => ({ live: true, sessionId: 'other-session', cycle: 1 }) };
  const driver = createSpecialistGameplayDriver(game, { now: () => 1, timeoutMs: 0 });
  const actor = { uidHash: 'same-actor-hash', sessionId: 'fresh-session', sameActor: true,
    profileRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler',
    connection: 'live', freshness: 'server' };
  crew.observe = async () => actor;
  await assert.rejects(driver.waitForCommit({ surface: crew, actor,
    inspect: async () => ({ ready: true, gmRevision: 9, crewRevision: 9,
      renderedStatusCode: 'public-result-visible' }) }), /fresh-session|same normally authenticated actor/i);
});

test('specialist driver waits until GM and current crew view show the same cycle', async () => {
  const gm = { label: 'gm' }, crew = { label: 'crew' };
  let crewCycle = 0, polls = 0;
  const actor = { uidHash: 'same-actor-hash', sessionId: 'fresh-session', sameActor: true,
    profileRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler',
    connection: 'live', freshness: 'server' };
  crew.observe = async () => actor;
  const game = { context: { gm, initial: { sessionId: 'fresh-session' } }, select: async () => crew,
    state: async surface => ({ live: true, sessionId: 'fresh-session', cycle: surface === gm ? 1 : crewCycle }) };
  const driver = createSpecialistGameplayDriver(game, { wait: async () => { polls += 1; crewCycle = 1; } });
  const proof = await driver.waitForCommit({ surface: crew, actor,
    inspect: async () => ({ ready: true, gmRevision: 4, crewRevision: 4,
      renderedStatusCode: 'public-result-visible' }) });
  assert.equal(polls, 1, 'Wait for the originating crew projection to catch up before the next action.');
  assert.equal(proof.gm.cycle, proof.crew.cycle);
});

test('specialist evidence keeps only bounded action, actor, revision, cost, and result fields', () => {
  const evidence = projectSpecialistActionEvidence({
    roleId: 'capybara-recycler',
    endpoint: 'recycleWithBoa',
    actor: {
      uid: 'RAW-AUTH-UID', uidHash: 'sha256-actor', sessionId: 'RAW-SESSION-ID',
      activeConsoleRoleId: 'capybara-recycler', connection: 'live', freshness: 'server',
    },
    request: {
      sessionId: 'RAW-SESSION-ID', requestId: 'request-7', recipeId: 'food',
      expectedControlRevision: 3, expectedRecyclingRevision: 2, expectedCycle: 1,
      expectedHostShipId: 'aegis', privatePayload: 'DO-NOT-RECORD',
    },
    response: { httpStatus: 200, result: {
      status: 'committed', requestId: 'request-7', revision: 3, scrapRemaining: 4,
      privatePayload: 'DO-NOT-RECORD',
    } },
    replay: { status: 'committed', result: {
      status: 'replayed', requestId: 'request-7', revision: 3, scrapRemaining: 4,
      privatePayload: 'DO-NOT-RECORD',
    } },
    cost: { resource: 'food', amount: 6, result: '1 Scrap' },
    projection: {
      gm: { source: 'server', revision: 3 },
      crew: { source: 'server', revision: 3 },
      renderedStatus: 'Recycled 6 Food from AEGIS // Boa carries 4 Scrap.',
    },
  });

  assert.equal(evidence.roleId, 'capybara-recycler');
  assert.equal(evidence.actor.uidHash, 'sha256-actor');
  assert.equal(evidence.actor.sessionIdHash.length, 64);
  assert.deepEqual(evidence.request, {
    requestId: 'request-7', recipeId: 'food', expectedControlRevision: 3,
    expectedRecyclingRevision: 2, expectedCycle: 1, expectedHostShipId: 'aegis',
  });
  assert.deepEqual(evidence.response, { httpStatus: 200, resultStatus: 'committed', revision: 3,
    scrapRemaining: 4, replayStatus: 'replayed', replayRevision: 3, exactReplay: true, projectionRevision: 3 });
  assert.equal(evidence.projection.gm.revision, evidence.projection.crew.revision);
  assert.equal(JSON.stringify(evidence).includes('RAW-AUTH-UID'), false);
  assert.equal(JSON.stringify(evidence).includes('RAW-SESSION-ID'), false);
  assert.equal(JSON.stringify(evidence).includes('DO-NOT-RECORD'), false);
});

test('exact replay compares the committed receipt while allowing its replay status to differ', () => {
  assert.equal(sameActionReceipt(
    { status: 'committed', revision: 8, scrapRemaining: 4 },
    { status: 'replayed', revision: 8, scrapRemaining: 4 },
  ), true);
  assert.equal(sameActionReceipt(
    { status: 'committed', revision: 8, scrapRemaining: 4 },
    { status: 'replayed', revision: 9, scrapRemaining: 4 },
  ), false);
});

test('action map names the ordinary authenticated specialist source paths', () => {
  const endpoints = new Set(SPECIALIST_ACTION_MAP.map((entry) => entry.endpoint));
  for (const endpoint of [
    'repairConsolesFromMacaw', 'applyPermissionedDismantling', 'recycleWithBoa',
    'chooseBoaMissionReclamationOpportunity', 'resolveWolfAttackAftermath',
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest', 'buildFighter',
    'requestScout', 'advanceEndeavourResearchTrack', 'launchPdfEscortWing',
    'sendFleetGroupMessage',
  ]) assert.ok(endpoints.has(endpoint), `missing source-backed action ${endpoint}`);
  assert.equal(endpoints.has('setFighterWingCount'), false, 'The GM correction callable is not an ordinary Wing Commander proof action.');
});

test('PDF group relay evidence hashes the message instead of storing its text', () => {
  const message = 'PC10 current-group relay copy must remain private to the actual test run.';
  const evidence = projectSpecialistActionEvidence({
    roleId: 'refinery-124-pdf-colonel', endpoint: 'sendFleetGroupMessage',
    actor: { uidHash: 'sha256-pdf', sessionId: 'session' },
    request: { requestId: 'note-1', expectedGroupId: 'fleet-2', text: message },
    response: { httpStatus: 200, result: { status: 'committed', groupId: 'fleet-2', messageId: 'note-1' } },
    replay: { status: 'committed', result: { status: 'replayed', groupId: 'fleet-2', messageId: 'note-1' } },
    cost: null, projection: {},
  });
  assert.equal(evidence.request.text, undefined);
  assert.equal(evidence.request.textLength, message.length);
  assert.equal(evidence.request.textHash.length, 64);
  assert.equal(JSON.stringify(evidence).includes(message), false);
});

test('rendered private and group text is represented only by a bounded status code', () => {
  const evidence = projectSpecialistActionEvidence({
    roleId: 'quellon-explorer', endpoint: 'allocateHummingbirdHarvest',
    actor: { uidHash: 'sha256-explorer', sessionId: 'session' },
    request: { requestId: 'harvest-1', expectedRevision: 1, foodDieIndex: 0 },
    response: { httpStatus: 200, result: { status: 'committed', revision: 2 } },
    replay: { status: 'committed', result: { status: 'replayed', revision: 2 } },
    cost: null, projection: { renderedStatus: 'private die result is 6 and 5; do not persist',
      privateActorStatus: 'private roll contains die values 6 and 5' },
  });
  assert.equal(evidence.projection.renderedStatus, undefined);
  assert.equal(evidence.projection.privateActorStatus, undefined);
  assert.equal(JSON.stringify(evidence).includes('die result'), false);
  assert.equal(JSON.stringify(evidence).includes('6 and 5'), false);
});

test('private research and mission selectors are hashed in request and response receipts', () => {
  const evidence = projectSpecialistActionEvidence({
    roleId: 'shepherd-scientist', endpoint: 'advanceEndeavourResearchTrack',
    actor: { uidHash: 'sha256-scientist', sessionId: 'session' },
    request: { requestId: 'research-1', trackId: 'wolf-agent-detector', funding: 'shepherd-ore',
      expectedControlRevision: 2, expectedResearchRevision: 4, expectedCycle: 1 },
    response: { httpStatus: 200, result: { status: 'committed', revision: 5, trackId: 'wolf-agent-detector' } },
    replay: { status: 'committed', result: { status: 'replayed', revision: 5, trackId: 'wolf-agent-detector' } },
    cost: { resource: 'ore', amount: 5 }, projection: {},
  });
  assert.equal(evidence.request.trackId, undefined);
  assert.equal(evidence.response.trackId, undefined);
  assert.equal(evidence.request.trackIdHash.length, 64);
  assert.equal(JSON.stringify(evidence).includes('wolf-agent-detector'), false);
});

test('boarding proof retains the actually selected bounded Security Teams count', () => {
  const evidence = projectSpecialistActionEvidence({
    roleId: 'dione-engineer', endpoint: 'commitWolfBoardingDefenceChoice',
    actor: { uidHash: 'sha256-defender', sessionId: 'session' },
    request: { requestId: 'boarding-1', attackId: 'attack-1',
      choice: { action: 'security-teams', targetShipId: 'dione', securityTeams: 2 } },
    response: { httpStatus: 200, result: { status: 'committed', revision: 8, choiceStatus: 'committed' } },
    replay: { status: 'committed', result: { status: 'replayed', revision: 8, choiceStatus: 'committed' } },
    cost: null, projection: {},
  });
  assert.deepEqual(evidence.request.choice, {
    action: 'security-teams', targetShipId: 'dione', securityTeams: 2,
  });
});

test('shuttle route evidence hashes destination and transit identifiers', () => {
  const evidence = projectSpecialistActionEvidence({
    roleId: 'quellon-explorer', endpoint: 'requestShuttleDeparture',
    actor: { uidHash: 'sha256-explorer', sessionId: 'session' },
    request: { sessionId: 'session', requestId: 'departure-1', shuttleId: 'hummingbird',
      destinationShipId: 'refinery-124', expectedControlRevision: 3, expectedCycle: 2 },
    response: { httpStatus: 200, result: { status: 'committed', revision: 4,
      shuttleId: 'hummingbird', destinationShipId: 'refinery-124' } },
    replay: { status: 'committed', result: { status: 'replayed', revision: 4,
      shuttleId: 'hummingbird', destinationShipId: 'refinery-124' } },
    cost: null, projection: {},
  });
  assert.equal(evidence.request.destinationShipId, undefined);
  assert.equal(evidence.request.destinationShipIdHash.length, 64);
  assert.equal(JSON.stringify(evidence).includes('refinery-124'), false);
});

test('away-mission evidence hashes private assignment and opportunity identifiers', () => {
  const evidence = projectSpecialistActionEvidence({
    roleId: 'shepherd-scientist', endpoint: 'commitAwayMissionLifecycleCommand',
    actor: { uidHash: 'sha256-scientist', sessionId: 'session' },
    request: { requestId: 'mission-1', missionId: 'private-mission-card-9',
      expectedRevision: 4, type: 'use-opportunity', opportunityId: 'secret-opportunity-2', shipId: 'dione' },
    response: { httpStatus: 200, result: { status: 'committed', revision: 5, expectedRevision: 4 } },
    replay: { status: 'committed', result: { status: 'replayed', revision: 5, expectedRevision: 4 } },
    cost: null, projection: {},
  });
  assert.equal(evidence.request.missionId, undefined);
  assert.equal(evidence.request.opportunityId, undefined);
  assert.equal(evidence.request.missionIdHash.length, 64);
  assert.equal(evidence.request.opportunityIdHash.length, 64);
  assert.equal(JSON.stringify(evidence).includes('private-mission-card-9'), false);
  assert.equal(JSON.stringify(evidence).includes('secret-opportunity-2'), false);
});

test('arrival proof accepts the source-specific replayable arrival receipt shape', () => {
  const evidence = projectSpecialistActionEvidence({
    roleId: 'quellon-explorer', endpoint: 'completeShuttleArrival',
    actor: { uidHash: 'sha256-explorer', sessionId: 'session' },
    request: { shuttleId: 'hummingbird', transitRequestId: 'private-transit-2', expectedControlRevision: 7 },
    response: { httpStatus: 200, result: { hostShipId: 'refinery-124', arrivedAt: '2026-10-05T08:00:00Z' } },
    replay: { status: 'committed', result: { hostShipId: 'refinery-124', arrivedAt: '2026-10-05T08:00:00Z' } },
    cost: null, projection: { gm: { source: 'server', cycle: 3, revision: 8 },
      crew: { source: 'server', cycle: 3, revision: 8 }, renderedStatus: 'public-result-visible' },
  });
  assert.equal(evidence.response.resultStatus, 'arrived');
  assert.equal(evidence.response.exactReplay, true);
  assert.equal(evidence.response.projectionRevision, 8);
  assert.equal(evidence.response.hostShipId, undefined);
});

test('callback records failures without calling a partial gameplay run complete', async () => {
  let saved;
  const game = { context: { gm: {}, initial: { sessionId: 'fresh-session' } },
    select: async () => ({}), state: async () => ({}),
    save: async (name, details) => { saved = { name, details }; } };
  const callback = createSpecialistGameplayCallback({ createTwoBrowserGameplay: () => game,
    name: 'Capybara proof', steps: [async () => ({ failed: true, reason: 'real-http-error' })] });
  const result = await callback({ initial: { sessionId: 'fresh-session' } });
  assert.equal(result.outcomes.length, 1);
  assert.equal(saved.name, 'specialist-gameplay-progress.json');
  assert.equal(saved.details.status, 'recorded');
  assert.equal(saved.details.acceptance, 'not-claimed');
  assert.equal(saved.details.failedActions, 1);
  assert.equal(saved.details.committedActions, 0);
});

test('callback credits the exact source-specific arrival receipt after live projections converge', async () => {
  let saved;
  const game = { context: { gm: {}, initial: { sessionId: 'fresh-session' } },
    select: async () => ({}), state: async () => ({}), actions: [], save: async (_name, details) => { saved = details; } };
  const callback = createSpecialistGameplayCallback({ createTwoBrowserGameplay: () => game,
    steps: [async () => ({ evidence: { endpoint: 'completeShuttleArrival', response: {
      resultStatus: 'arrived', exactReplay: true, projectionRevision: 8,
    } } })] });
  const result = await callback({ initial: { sessionId: 'fresh-session' } });
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0].evidence.endpoint, 'completeShuttleArrival');
  assert.equal(saved.committedActions, 1);
  assert.equal(saved.uncreditedActions, 0);
});

test('unknown callable names fail closed instead of receiving generic proof credit', () => {
  assert.throws(() => projectSpecialistActionEvidence({
    roleId: 'capybara-recycler', endpoint: 'unknownCallable', actor: {}, request: {},
    response: { httpStatus: 200, result: {} }, replay: { status: 'committed', result: {} },
    cost: null, projection: {},
  }), /unmapped/);
});
