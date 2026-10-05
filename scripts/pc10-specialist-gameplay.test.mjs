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
    scrapRemaining: 4, replayStatus: 'replayed', replayRevision: 3, exactReplay: true });
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
    'rollHummingbirdHarvest', 'allocateHummingbirdHarvest', 'setFighterWingCount',
    'requestScout', 'advanceEndeavourResearchTrack', 'launchPdfEscortWing',
    'sendFleetGroupMessage',
  ]) assert.ok(endpoints.has(endpoint), `missing source-backed action ${endpoint}`);
});

test('unknown callable names fail closed instead of receiving generic proof credit', () => {
  assert.throws(() => projectSpecialistActionEvidence({
    roleId: 'capybara-recycler', endpoint: 'unknownCallable', actor: {}, request: {},
    response: { httpStatus: 200, result: {} }, replay: { status: 'committed', result: {} },
    cost: null, projection: {},
  }), /unmapped/);
});
