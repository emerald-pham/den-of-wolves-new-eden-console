import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTwoLiveGmResponsibilityMove } from './pc10-two-live-gm-responsibility-proof.mjs';

// New proof-contract coverage. No prior callback exists, so an absent import
// is not a qualified RED and these tests claim no test-first product credit.
const actor = (uidHash, instanceId, profileRoleId = null) => ({
  sessionId: 'fresh-session', uidHash, instanceId, claimedAt: '2026-10-06T23:00:00.000Z',
  profileRoleId, hasAuth: true, sameActor: true, playerRole: 'gm', gmInstanceOwned: true,
  connection: 'live', freshness: 'server', phase: 'casting', cycle: 0,
  generation: 1, hydrationRevision: 1, privateAudienceMatches: true,
  foreignPendingCount: 0, pendingCount: 0, seatId: null,
  assignedRoleId: null, activeConsoleRoleId: null,
});
const originalA = actor('1111111111111111', 'original-A-instance');
const originalB = actor('2222222222222222', 'temporary-B-instance', 'controller');
const assistantCoverage = [
  [originalA.instanceId, originalB.instanceId],
  [originalB.instanceId],
  [originalA.instanceId],
];
function input(step = 0) {
  const before = { ...(step === 2 ? originalB : originalA), setupRevision: 20 + step };
  const request = { sessionId: before.sessionId, instanceId: before.instanceId,
    requestId: `native-request-${step}`, expectedSetupRevision: before.setupRevision,
    responsibility: 'assistant', mode: ['share', 'drop', 'handoff'][step],
    targetInstanceId: step === 2 ? originalA.instanceId : originalB.instanceId };
  return { step, originalA: { ...originalA }, originalB: { ...originalB },
    expectedRevision: before.setupRevision,
    capture: { before, data: request, httpStatus: 200,
      result: { status: 'committed', requestId: request.requestId,
        setupRevision: before.setupRevision + 1,
        responsibilities: [['main', 'assistant'], ['main'], []][step],
        coverage: { main: [originalA.instanceId], assistant: [...assistantCoverage[step]] } } } };
}

test('the exact three normal moves restore both A lanes and emit only hashed authority', () => {
  for (const step of [0, 1, 2]) {
    const value = input(step), receipt = assertTwoLiveGmResponsibilityMove(value);
    assert.equal(receipt.mode, ['share', 'drop', 'handoff'][step]);
    assert.equal(receipt.afterRevision, value.expectedRevision + 1);
    assert.equal(receipt.sdkReplay, false);
    assert.equal(receipt.coverage.main.length, 1);
    assert.equal(receipt.coverage.assistant.length, step === 0 ? 2 : 1);
    const persisted = JSON.stringify(receipt);
    for (const raw of ['fresh-session', originalA.instanceId, originalB.instanceId,
      originalA.claimedAt, value.capture.data.requestId]) assert.equal(persisted.includes(raw), false);
  }
});

test('a stale native request cannot claim a current responsibility result', () => {
  const value = input(); value.capture.data.expectedSetupRevision -= 1;
  assert.throws(() => assertTwoLiveGmResponsibilityMove(value), /current setup revision/);
});

test('a different authenticated UID or instance lease cannot use A responsibility authority', () => {
  for (const key of ['uidHash', 'instanceId', 'claimedAt']) {
    const value = input(); value.capture.before[key] = `foreign-${key}`;
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value), /original live GM authority/);
  }
});

test('both distinct owned live GM actors are required', () => {
  const mutations = [
    value => { value.originalB.uidHash = value.originalA.uidHash; },
    value => { value.originalB.instanceId = value.originalA.instanceId; },
    value => { value.originalA.sessionId = ''; value.originalB.sessionId = ''; value.capture.before.sessionId = ''; value.capture.data.sessionId = ''; },
    value => { value.originalB.sessionId = 'foreign-session'; },
    value => { value.originalB.connection = 'offline'; },
    value => { value.originalB.gmInstanceOwned = false; },
    value => { value.originalB.playerRole = 'player'; },
    value => { value.originalB.profileRoleId = 'admiral'; },
  ];
  for (const mutate of mutations) {
    const value = input(); mutate(value);
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value));
  }
});

test('a third, foreign, missing or duplicate target/coverage instance is rejected', () => {
  const mutations = [
    value => { value.capture.data.targetInstanceId = 'third-instance'; },
    value => { value.capture.result.coverage.assistant = [originalA.instanceId]; },
    value => { value.capture.result.coverage.main = [originalB.instanceId]; },
    value => { value.capture.result.coverage.main.push('third-instance'); },
    value => { value.capture.result.coverage.assistant.push(originalB.instanceId); },
  ];
  for (const mutate of mutations) {
    const value = input(); mutate(value);
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value));
  }
});

test('only the actual fixed UI-native body and committed next revision are accepted', () => {
  const mutations = [
    value => { value.capture.data.password = 'never-supplied'; },
    value => { value.capture.data.responsibility = 'main'; },
    value => { value.capture.data.mode = 'handoff'; },
    value => { value.capture.result.status = 'replayed'; },
    value => { value.capture.result.setupRevision += 1; },
    value => { value.capture.result.requestId = 'different-request'; },
    value => { value.capture.result.responsibilities = ['assistant']; },
    value => { value.capture.httpStatus = 403; },
  ];
  for (const mutate of mutations) {
    const value = input(); mutate(value);
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value));
  }
});

test('freshness, casting, pending-command and original-member mismatches fail closed', () => {
  const mutations = [
    value => { value.capture.before.freshness = 'cache'; },
    value => { value.capture.before.sameActor = false; },
    value => { value.capture.before.sessionId = 'foreign-session'; },
    value => { value.capture.before.phase = 'active'; },
    value => { value.capture.before.cycle = 1; },
    value => { value.capture.before.generation += 1; },
    value => { value.capture.before.pendingCount = 1; },
    value => { value.capture.before.foreignPendingCount = 1; },
    value => { value.capture.before.privateAudienceMatches = false; },
    value => { value.capture.before.seatId = 'admiral'; },
  ];
  for (const mutate of mutations) {
    const value = input(); mutate(value);
    assert.throws(() => assertTwoLiveGmResponsibilityMove(value));
  }
});
