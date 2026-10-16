import assert from 'node:assert/strict';

const WOLF_KINDS = new Set(['wolf-agent', 'wolf-cult']);
const ACTOR_FENCE_FIELDS = Object.freeze([
  'sessionId', 'authUid', 'uid', 'uidHash', 'playerRole', 'profileRoleId', 'assignedRoleId',
  'activeConsoleRoleId', 'fleetGroupId', 'connectionGeneration', 'cycle', 'phase',
  'connection', 'freshness', 'connected', 'replacementRoleId', 'replacementStatus', 'escapeState',
  'loyaltyKind',
]);

/** Choose one real current-cycle action for each of the two printed Wolf holders. */
export function buildWolfCycleActionPlan(mode, actors) {
  assert.ok(mode === 'wolf-cult' || mode === 'universal-arbour');
  assert.ok(Array.isArray(actors));
  assert.equal(actors.length, 2, 'The printed 20-role setup has exactly two Wolf holders.');
  assert.equal(new Set(actors.map(actor => actor.roleId)).size, 2, 'Wolf actors must be different role holders.');
  assert.equal(new Set(actors.map(actor => actor.uidHash)).size, 2, 'Actions must be bound to two original authenticated UIDs.');
  assert.ok(actors.every(actor => typeof actor.roleId === 'string' && actor.roleId.length > 0));
  assert.ok(actors.every(actor => typeof actor.uidHash === 'string' && actor.uidHash.length >= 16));
  assert.ok(actors.every(actor => WOLF_KINDS.has(actor.kind)));
  if (mode === 'wolf-cult') {
    assert.deepEqual(new Set(actors.map(actor => actor.kind)), new Set(['wolf-agent', 'wolf-cult']));
  } else {
    assert.deepEqual(actors.map(actor => actor.kind), ['wolf-agent', 'wolf-agent']);
  }
  return actors.map((actor, index) => Object.freeze({
    ...actor,
    action: index === 0 ? 'homing-beacon' : 'provide-intel',
    cycle: 1,
  }));
}

/** Fail closed unless a server-fresh active actor remains the same through a mutation/replay. */
export function assertLiveWolfActorFence(snapshot, expected = {}) {
  assert.ok(snapshot && typeof snapshot === 'object');
  assert.equal(snapshot.authUid, snapshot.uid, 'The selected profile must match Firebase Auth.');
  assert.equal(snapshot.playerRole, 'player');
  assert.equal(snapshot.profileRoleId, expected.roleId ?? snapshot.profileRoleId);
  assert.equal(snapshot.assignedRoleId, snapshot.profileRoleId, 'The Wolf cover must be the server-assigned role.');
  assert.equal(snapshot.activeConsoleRoleId, snapshot.assignedRoleId, 'The current command post must match the cover.');
  assert.equal(snapshot.connected, true, 'The authenticated original actor must remain connected.');
  assert.equal(snapshot.replacementRoleId, null);
  assert.equal(snapshot.replacementStatus, null);
  assert.equal(snapshot.escapeState, null);
  assert.equal(typeof snapshot.fleetGroupId, 'string');
  assert.ok(snapshot.fleetGroupId.length > 0, 'The current same-table group is required.');
  assert.ok(Number.isSafeInteger(snapshot.connectionGeneration) && snapshot.connectionGeneration >= 1);
  assert.ok(Number.isSafeInteger(snapshot.cycle) && snapshot.cycle >= 1);
  assert.equal(snapshot.phase, 'active');
  assert.equal(snapshot.connection, 'live');
  assert.equal(snapshot.freshness, 'server');
  assert.ok(WOLF_KINDS.has(snapshot.loyaltyKind));
  if (expected.sessionId !== undefined) assert.equal(snapshot.sessionId, expected.sessionId);
  if (expected.uidHash !== undefined) assert.equal(snapshot.uidHash, expected.uidHash);
  if (expected.cycle !== undefined) assert.equal(snapshot.cycle, expected.cycle);
  return Object.freeze(Object.fromEntries(ACTOR_FENCE_FIELDS.map(key => [key, snapshot[key]])));
}

export function assertSameWolfActorFence(before, after) {
  const first = assertLiveWolfActorFence(before);
  const second = assertLiveWolfActorFence(after);
  for (const key of ACTOR_FENCE_FIELDS) assert.equal(second[key], first[key], `Actor authority changed at ${key}.`);
  return true;
}

export function assertWolfSupplyRequest(requestData, actor, selection) {
  assert.ok(requestData && typeof requestData === 'object');
  assert.deepEqual(Object.keys(requestData).sort(),
    ['expectedCycle', 'requestId', 'resourceId', 'sessionId', 'shuttleId'].sort());
  assert.equal(requestData.sessionId, actor.sessionId);
  assert.equal(requestData.expectedCycle, actor.cycle);
  assert.equal(typeof requestData.requestId, 'string');
  assert.ok(requestData.requestId.length >= 16);
  assert.equal(requestData.shuttleId, selection.shuttleId);
  assert.equal(requestData.resourceId, selection.resourceId);
  return true;
}

export function assertWolfCycleActionRequest(requestData, actor) {
  assert.ok(requestData && typeof requestData === 'object');
  assert.deepEqual(Object.keys(requestData).sort(), ['expectedCycle', 'requestId', 'sessionId'].sort());
  assert.equal(requestData.sessionId, actor.sessionId);
  assert.equal(requestData.expectedCycle, actor.cycle);
  assert.equal(typeof requestData.requestId, 'string');
  assert.ok(requestData.requestId.length >= 16);
  return true;
}

export function assertWolfCycleActionReply({ action, result, requestData, actor, expectedMessage }) {
  assert.ok(action === 'homing-beacon' || action === 'provide-intel');
  assert.ok(result && typeof result === 'object');
  assert.equal(result.status, 'committed');
  assert.equal(result.type, action === 'homing-beacon' ? 'wolf-homing-beacon' : 'wolf-intelligence');
  assert.equal(result.sessionId, actor.sessionId);
  assert.equal(result.requestId, requestData.requestId);
  assert.equal(result.cycle, actor.cycle);
  assert.equal(result.coverRoleId, actor.assignedRoleId);
  assert.equal(result.revision, 1, 'A fresh Cycle 1 holder consumes its first action compare-and-swap slot.');
  if (action === 'homing-beacon') {
    assert.equal(result.groupId, actor.fleetGroupId);
    assert.equal(result.dueCycle, actor.cycle + 1);
    assert.equal(result.arrivalTiming, 'after-cycle-start');
    assert.equal(typeof result.coordinate, 'string');
  } else {
    assert.equal(result.message, expectedMessage);
    assert.equal(result.suspicion, actor.suspicion + 3);
  }
  return true;
}

export function assertWolfSupplySabotageResult({ result, requestData, actor, startingCargo, oldSuspicion }) {
  assert.ok(result && typeof result === 'object');
  assert.equal(result.status, 'committed');
  assert.equal(result.type, 'wolf-supply-sabotage');
  assert.equal(result.sessionId, actor.sessionId);
  assert.equal(result.requestId, requestData.requestId);
  assert.equal(result.idempotencyKey, requestData.requestId);
  assert.equal(result.actorUid, actor.uid);
  assert.equal(result.actorRoleId, actor.assignedRoleId);
  assert.equal(result.coverRoleId, actor.assignedRoleId);
  assert.equal(result.vesselId, requestData.shuttleId);
  assert.equal(result.shuttleId, requestData.shuttleId);
  assert.equal(result.resourceId, requestData.resourceId);
  assert.equal(result.turn, actor.cycle);
  assert.equal(result.cycle, actor.cycle);
  assert.equal(result.phase, 'active');
  assert.equal(result.revision, 1, 'A fresh Cycle 1 holder consumes its first action compare-and-swap slot.');
  assert.ok(Number.isSafeInteger(startingCargo) && startingCargo > 0);
  assert.equal(result.destroyedAmount, Math.floor(startingCargo / 2));
  assert.equal(result.remainingAmount, startingCargo - result.destroyedAmount);
  assert.equal(result.suspicion, oldSuspicion + 2, 'The server applies the printed +2 suspicion cost.');
  return true;
}

export function assertExactCallableReplay(original, replay) {
  assert.deepEqual(replay, original, 'Retry the same request through the original authenticated SDK identity.');
  return true;
}

export function assertActorFreePlayerNotice(notice, expected) {
  assert.ok(notice && typeof notice === 'object');
  assert.deepEqual(Object.keys(notice).sort(), ['createdAt', 'id', 'sequence', 'sessionId', 'type'].sort());
  assert.equal(notice.type, 'wolf-hacking-overlay-notice');
  assert.equal(notice.sessionId, expected.sessionId);
  assert.equal(notice.id, expected.noticeId);
  assert.equal(notice.sequence, expected.noticeSequence);
  return true;
}

export function blockedPhysicalConsoleBranch() {
  return Object.freeze({
    status: 'blocked',
    credited: false,
    reason: 'The mounted GM console-visit flow requires a real 10-second physical adjacency observation and timely GM confirmation; the virtual actor surfaces cannot attest that event.',
  });
}
