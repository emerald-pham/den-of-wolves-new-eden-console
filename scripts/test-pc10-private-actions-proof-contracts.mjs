import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertActorFreePlayerNotice,
  assertExactCallableReplay,
  assertLiveWolfActorFence,
  assertSameWolfActorFence,
  assertWolfCycleActionReply,
  assertWolfCycleActionRequest,
  assertWolfSupplyRequest,
  assertWolfSupplySabotageResult,
  blockedPhysicalConsoleBranch,
  buildWolfCycleActionPlan,
} from './pc10-private-actions-proof-contracts.mjs';

const wolfActors = [
  { roleId: 'aegis-engineer', uidHash: 'aaaaaaaaaaaaaaaa', kind: 'wolf-agent' },
  { roleId: 'vulcan-science-officer', uidHash: 'bbbbbbbbbbbbbbbb', kind: 'wolf-cult' },
];

function actorSnapshot(patch = {}) {
  return {
    authUid: 'auth-uid-a', uid: 'auth-uid-a', uidHash: 'aaaaaaaaaaaaaaaa',
    sessionId: 'session-current', playerRole: 'player', profileRoleId: 'aegis-engineer',
    assignedRoleId: 'aegis-engineer', activeConsoleRoleId: 'aegis-engineer',
    fleetGroupId: 'group-current', connectionGeneration: 3, connected: true,
    cycle: 1, phase: 'active', connection: 'live', freshness: 'server',
    replacementRoleId: null, replacementStatus: null, escapeState: null,
    loyaltyKind: 'wolf-agent', ...patch,
  };
}

test('current-cycle Wolf actions use two configured original actors, one action each', () => {
  assert.deepEqual(buildWolfCycleActionPlan('wolf-cult', wolfActors).map(({ roleId, action, cycle }) =>
    ({ roleId, action, cycle })), [
    { roleId: 'aegis-engineer', action: 'homing-beacon', cycle: 1 },
    { roleId: 'vulcan-science-officer', action: 'provide-intel', cycle: 1 },
  ]);
  assert.deepEqual(buildWolfCycleActionPlan('universal-arbour', [
    { ...wolfActors[0], kind: 'wolf-agent' },
    { ...wolfActors[1], kind: 'wolf-agent' },
  ]).map(item => item.action), ['homing-beacon', 'provide-intel']);
});

test('Wolf choreography rejects a duplicate UID, missing holder, or invented optional-mode holder', () => {
  assert.throws(() => buildWolfCycleActionPlan('wolf-cult', [
    wolfActors[0], { ...wolfActors[1], uidHash: wolfActors[0].uidHash },
  ]));
  assert.throws(() => buildWolfCycleActionPlan('wolf-cult', [wolfActors[0]]));
  assert.throws(() => buildWolfCycleActionPlan('universal-arbour', [
    wolfActors[0], wolfActors[1], { roleId: 'extra', uidHash: 'cccccccccccccccc', kind: 'wolf-agent' },
  ]));
  assert.throws(() => buildWolfCycleActionPlan('universal-arbour', wolfActors));
});

test('Wolf action fence requires current Auth, cover, group, generation and fresh active-cycle authority', () => {
  const base = actorSnapshot();
  assert.equal(assertLiveWolfActorFence(base, { sessionId: 'session-current', roleId: 'aegis-engineer' }).uid, base.uid);
  for (const patch of [
    { authUid: 'other-auth' }, { assignedRoleId: 'other-role' }, { activeConsoleRoleId: 'other-role' },
    { phase: 'debrief' },
    { connection: 'offline' }, { freshness: 'persisted' }, { replacementStatus: 'awaiting-re-role' },
    { escapeState: { status: 'pending' } },
  ]) assert.throws(() => assertLiveWolfActorFence(actorSnapshot(patch)));
  assert.throws(() => assertSameWolfActorFence(base, actorSnapshot({ fleetGroupId: 'group-other' })));
  assert.throws(() => assertSameWolfActorFence(base, actorSnapshot({ connectionGeneration: 4 })));
});

test('supply receipt proves the server floor-half, +2 suspicion and exact replay', () => {
  const actor = actorSnapshot();
  const requestData = { sessionId: actor.sessionId, requestId: 'req-1234567890abcdef', expectedCycle: 1,
    shuttleId: 'aegis-shuttle', resourceId: 'fuel' };
  const result = { status: 'committed', type: 'wolf-supply-sabotage', sessionId: actor.sessionId,
    requestId: requestData.requestId, idempotencyKey: requestData.requestId, actorUid: actor.uid,
    actorRoleId: actor.assignedRoleId, coverRoleId: actor.assignedRoleId, vesselId: requestData.shuttleId,
    shuttleId: requestData.shuttleId, resourceId: requestData.resourceId, turn: 1, cycle: 1,
    phase: 'active', revision: 1, destroyedAmount: 2, remainingAmount: 3, suspicion: 8 };
  assert.equal(assertWolfSupplySabotageResult({ result, requestData, actor, startingCargo: 5, oldSuspicion: 6 }), true);
  assert.equal(assertWolfSupplyRequest(requestData, actor, { shuttleId: 'aegis-shuttle', resourceId: 'fuel' }), true);
  assert.throws(() => assertWolfSupplyRequest({ ...requestData, hiddenOverride: true }, actor,
    { shuttleId: 'aegis-shuttle', resourceId: 'fuel' }));
  assert.equal(assertExactCallableReplay(result, structuredClone(result)), true);
  assert.throws(() => assertWolfSupplySabotageResult({ result: { ...result, destroyedAmount: 1 },
    requestData, actor, startingCargo: 5, oldSuspicion: 6 }));
  assert.throws(() => assertWolfSupplySabotageResult({ result: { ...result, suspicion: 9 },
    requestData, actor, startingCargo: 5, oldSuspicion: 6 }));
});

test('beacon and handler replies are individually bound to each actor and exact request', () => {
  for (const [index, actor] of wolfActors.entries()) {
    const snapshot = actorSnapshot({ uid: `auth-uid-${index}`, authUid: `auth-uid-${index}`,
      uidHash: actor.uidHash, profileRoleId: actor.roleId, assignedRoleId: actor.roleId,
      activeConsoleRoleId: actor.roleId, loyaltyKind: actor.kind, suspicion: 6,
      fleetGroupId: `group-${index}` });
    const requestData = { sessionId: snapshot.sessionId, requestId: `request-${index}-1234567890`, expectedCycle: 1 };
    assert.equal(assertWolfCycleActionRequest(requestData, snapshot), true);
    if (index === 0) {
      const result = { status: 'committed', type: 'wolf-homing-beacon', sessionId: snapshot.sessionId,
        requestId: requestData.requestId, cycle: 1, revision: 1, coverRoleId: snapshot.assignedRoleId,
        groupId: snapshot.fleetGroupId, coordinate: 'training-only-in-memory', dueCycle: 2,
        arrivalTiming: 'after-cycle-start' };
      assert.equal(assertWolfCycleActionReply({ action: 'homing-beacon', requestData, actor: snapshot, result }), true);
      assert.throws(() => assertWolfCycleActionReply({ action: 'homing-beacon', requestData, actor: snapshot,
        result: { ...result, revision: 2 } }));
    } else {
      assert.equal(assertWolfCycleActionReply({ action: 'provide-intel', requestData, actor: snapshot,
        expectedMessage: 'Training proof // private handler action.',
        result: { status: 'committed', type: 'wolf-intelligence', sessionId: snapshot.sessionId,
          requestId: requestData.requestId, cycle: 1, revision: 1, coverRoleId: snapshot.assignedRoleId,
          message: 'Training proof // private handler action.', suspicion: 9 } }), true);
    }
  }
});

test('player notice is actor-free and physical console observation stays explicitly blocked', () => {
  const notice = { id: 'notice-000000000001', type: 'wolf-hacking-overlay-notice',
    sessionId: 'session-current', sequence: 1, createdAt: 'server-time' };
  assert.equal(assertActorFreePlayerNotice(notice, { sessionId: notice.sessionId,
    noticeId: notice.id, noticeSequence: notice.sequence }), true);
  assert.throws(() => assertActorFreePlayerNotice({ ...notice, actorUid: 'private' }, {
    sessionId: notice.sessionId, noticeId: notice.id, noticeSequence: notice.sequence,
  }));
  assert.deepEqual(blockedPhysicalConsoleBranch(), {
    status: 'blocked', credited: false,
    reason: 'The mounted GM console-visit flow requires a real 10-second physical adjacency observation and timely GM confirmation; the virtual actor surfaces cannot attest that event.',
  });
});
