import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPECIALIST_ACTION_MAP,
  projectSpecialistActionEvidence,
  sameActionReceipt,
} from './pc10-specialist-gameplay.mjs';

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
