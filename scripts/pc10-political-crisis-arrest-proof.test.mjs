import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEquivalentExactReplay,
  assertFreshManualStart,
  assertGmInstanceFence,
  assertPlayerActorFence,
  assertSimulatedAttendanceRoster,
  blockedSourceBranch,
  privateSafeActionReceipt,
} from './pc10-political-crisis-arrest-proof-contracts.mjs';

const gm = {
  sessionId: 'session-1', uidHash: 'a'.repeat(16), playerRole: 'gm',
  cycle: 1, phase: 'active', turnStatePhase: 'team',
  fullGameDemo: { status: 'active', progression: 'manual' },
  connection: 'live', freshness: 'server', gmInstanceOwned: true, instanceId: 'instance-1',
};

test('the named fresh-game callback gate requires an active manual Cycle 1 Team start', () => {
  assert.doesNotThrow(() => assertFreshManualStart({ gm, started: gm, initial: { sessionId: gm.sessionId } }));
  for (const changed of [
    { ...gm, sessionId: 'other' },
    { ...gm, cycle: 2 },
    { ...gm, turnStatePhase: 'coordination' },
    { ...gm, phase: 'closed' },
    { ...gm, connection: 'connecting' },
    { ...gm, freshness: 'cache' },
    { ...gm, fullGameDemo: { status: 'active', progression: 'automatic' } },
  ]) {
    assert.throws(() => assertFreshManualStart({ gm: changed, started: changed,
      initial: { sessionId: 'session-1' } }));
  }
});

test('player mutation fence keeps the same original authenticated role/session/cycle', () => {
  const expected = { sessionId: 'session-1', uidHash: 'b'.repeat(16), roleId: 'dione-captain',
    cycle: 1, phase: 'active', turnStatePhase: 'team' };
  const current = { ...expected, sameActor: true, profileRoleId: expected.roleId,
    assignedRoleId: expected.roleId, activeConsoleRoleId: expected.roleId,
    connection: 'live', freshness: 'server' };
  assert.doesNotThrow(() => assertPlayerActorFence(current, expected));
  for (const changed of [
    { ...current, sessionId: 'other' },
    { ...current, uidHash: 'c'.repeat(16) },
    { ...current, profileRoleId: 'dione-engineer' },
    { ...current, activeConsoleRoleId: 'dione-engineer' },
    { ...current, cycle: 2 },
    { ...current, connection: 'offline' },
    { ...current, freshness: 'cache' },
  ]) assert.throws(() => assertPlayerActorFence(changed, expected));
});

test('GM mutation fence binds the current owned instance, same actor and live snapshot', () => {
  assert.doesNotThrow(() => assertGmInstanceFence(gm, gm));
  assert.throws(() => assertGmInstanceFence({ ...gm, instanceId: 'other' }, gm));
  assert.throws(() => assertGmInstanceFence({ ...gm, gmInstanceOwned: false }, gm));
  assert.throws(() => assertGmInstanceFence({ ...gm, sameActor: false }, gm));
  assert.throws(() => assertGmInstanceFence({ ...gm, freshness: 'cache' }, gm));
});

test('exact replay compares the committed domain receipt while allowing its replay label', () => {
  assert.doesNotThrow(() => assertEquivalentExactReplay(
    { status: 'committed', revision: 3, cycle: 1, value: 'public-result' },
    { status: 'replayed', revision: 3, cycle: 1, value: 'public-result' },
  ));
  assert.throws(() => assertEquivalentExactReplay(
    { status: 'committed', revision: 3, value: 'first' },
    { status: 'replayed', revision: 4, value: 'different' },
  ));
});

test('simulated posse inputs must be explicitly manual-demo and current, distinct, non-target accounts', () => {
  const input = { demo: { status: 'active', progression: 'manual' },
    currentPlayerUids: ['target', 'a', 'b', 'c'], targetUid: 'target',
    presentPlayerUids: ['a', 'b'], attendanceEvidence: 'simulated-demo', physicalAttendance: false };
  assert.doesNotThrow(() => assertSimulatedAttendanceRoster(input));
  assert.throws(() => assertSimulatedAttendanceRoster({ ...input, demo: { status: 'preparing', progression: 'manual' } }));
  assert.throws(() => assertSimulatedAttendanceRoster({ ...input, presentPlayerUids: ['a', 'outsider'] }));
  assert.throws(() => assertSimulatedAttendanceRoster({ ...input, presentPlayerUids: ['a', 'a'] }));
  assert.throws(() => assertSimulatedAttendanceRoster({ ...input, presentPlayerUids: ['target'] }));
  assert.throws(() => assertSimulatedAttendanceRoster({ ...input, physicalAttendance: true }));
});

test('unoffered source branches stay blocked, unmet required branches throw, and evidence is allowlisted', () => {
  const blocked = blockedSourceBranch('pending-crisis-voyage', 'admit-voyage', ['no-current-approaching-vessel-crisis']);
  assert.deepEqual(blocked, { family: 'pending-crisis-voyage', branch: 'admit-voyage',
    status: 'blocked', accepted: false, blockerCodes: ['no-current-approaching-vessel-crisis'] });
  assert.throws(() => blockedSourceBranch('pending-politics-press', 'publish-dispatch', [], { required: true }));
  const receipt = privateSafeActionReceipt({
    family: 'pending-politics-press', branch: 'publish-dispatch', endpoint: 'publishPressDispatch',
    actor: { uidHash: 'b'.repeat(16), roleId: 'press-officer' }, sessionId: 'session-1', cycle: 1,
    request: { requestId: 'secret-id', text: 'private text', presidentCandidateId: 'secret-vote' },
    result: { status: 'committed', secret: 'private result', revision: 2 },
    replay: { status: 'replayed', secret: 'private result', revision: 2 },
  });
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.requestSha256.length, 64);
  assert.equal(receipt.requestIdSha256.length, 64);
  assert.equal(JSON.stringify(receipt).includes('private text'), false);
  assert.equal(JSON.stringify(receipt).includes('secret-vote'), false);
  assert.equal(JSON.stringify(receipt).includes('secret-id'), false);
});
