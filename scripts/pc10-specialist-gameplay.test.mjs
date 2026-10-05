import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSpecialistGameplayDriver,
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
  const game = { context: { gm, initial: { sessionId: 'fresh-session' } },
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

test('unknown callable names fail closed instead of receiving generic proof credit', () => {
  assert.throws(() => projectSpecialistActionEvidence({
    roleId: 'capybara-recycler', endpoint: 'unknownCallable', actor: {}, request: {},
    response: { httpStatus: 200, result: {} }, replay: { status: 'committed', result: {} },
    cost: null, projection: {},
  }), /unmapped/);
});
