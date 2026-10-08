import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Bounded callback for sparse ordinary-account setup; no launch, admission, seed or die.
export function qualifyMinimumCandidateActors(input) {
  assert.ok(['N', 'O', 'P'].includes(input.code));
  assert.ok(typeof input.sessionId === 'string' && input.sessionId.length);
  assert.ok(Number.isSafeInteger(input.configuredRoleCount) && input.configuredRoleCount >= 8);
  const actors = input.code === 'P' ? [input.gm, input.wing] : [input.gm, input.scientist, input.representative];
  for (const actor of actors) {
    assert.ok(actor?.hasAuth && actor.sameActor, 'Retain actual ordinary Auth identity.');
    assert.equal(actor.sessionId, input.sessionId);
    assert.equal(actor.connection, 'live'); assert.equal(actor.freshness, 'server');
    assert.ok(typeof actor.uidHash === 'string' && actor.uidHash.length);
    assert.equal(actor.phase, 'active'); assert.ok(Number.isSafeInteger(actor.cycle) && actor.cycle >= 1);
  }
  assert.equal(new Set(actors.map(actor => actor.uidHash)).size, actors.length, 'Actors must be distinct.');
  assert.equal(input.gm.playerRole, 'gm'); assert.equal(input.gm.gmInstanceOwned, true);
  assert.ok(input.gm.instanceId);
  const requireRole = (actor, roles) => {
    assert.equal(actor.playerRole, 'player'); assert.ok(roles.includes(actor.assignedRoleId));
    assert.equal(actor.activeConsoleRoleId, actor.assignedRoleId); assert.equal(actor.seatId, actor.assignedRoleId);
    assert.equal(actor.currentCanonicalSeatOwned, true, 'Canonical ordinary role seat must be current.');
  };
  if (input.code === 'P') requireRole(input.wing, ['wing-commander']);
  else {
    requireRole(input.scientist, ['shepherd-scientist']);
    requireRole(input.representative, input.code === 'N' ? ['shepherd-engineer', 'dione-engineer'] : ['admiral', 'executive-officer']);
  }
  return { actualAuthenticatedActors: actors.length, configuredRoleCount: input.configuredRoleCount,
    fullRosterAdmission: false, actualHumans: 0, outcomeSliceOnly: true };
}

/** Consume source-produced prerequisites using current ordinary SDK calls.
 * readRoot is the accepted runner's authenticated GM reader; selectGmShip is
 * its real scoped-grant control. No gameplay state seeding is permitted.
 * Setup/arrival/research/combat claims require separate genuine evidence.
 */
export async function runMinimumCandidateSuccessProbe(context) {
  const { code, gm, sessionId, groupId, coordinate, readRoot, selectGmShip, deadlineAt } = context;
  assert.ok(['N', 'O', 'P'].includes(code)); assert.match(groupId, /^fleet-[1-9]\d*$/);
  assert.match(coordinate, /^\d{4}$/); assert.equal(typeof readRoot, 'function');
  assert.equal(typeof selectGmShip, 'function'); assert.ok(Number.isFinite(deadlineAt));
  const budget = () => assert.ok(Date.now() < deadlineAt, 'Original candidate slice deadline expired.');
  const observe = async surface => { budget(); const result = await surface.observe(); budget(); return result; };
  const root = async () => { budget(); const result = await readRoot(); budget(); assert.equal(result.sessionId, sessionId); return result; };
  const initial = await root(), gmActor = await observe(gm);
  const actors = { code, sessionId, configuredRoleCount: initial.activeRoleIds.length, gm: gmActor };
  if (code === 'P') actors.wing = await observe(context.wing);
  else { actors.scientist = await observe(context.scientist); actors.representative = await observe(context.representative); }
  const cohort = qualifyMinimumCandidateActors(actors);
  assert.equal(initial.phase, 'active'); assert.equal(initial.currentTurn, gmActor.cycle);
  const receipts = [];
  async function callable(name, data) {
    budget(); const current = await observe(gm);
    for (const key of ['uidHash', 'sessionId', 'instanceId']) assert.equal(current[key], gmActor[key]);
    assert.equal(current.gmInstanceOwned, true);
    const response = await gm.callable(name, data); budget();
    assert.equal(response.status, 'committed', `${name} transport failed: ${response.code ?? 'unknown'}`);
    assert.ok(response.result); assert.notEqual(response.result.status, 'stale');
    return response.result;
  }
  async function workspace() {
    const result = await callable('readCandidateWorkspace', { sessionId, instanceId: gmActor.instanceId, expectedGroupId: groupId });
    assert.ok(Number.isSafeInteger(result.revision) && result.revision >= 0);
    const paths = result.paths.filter(path => path.code === code && path.coordinate === coordinate);
    assert.equal(paths.length, 1, 'Use the exact genuinely discovered current-group candidate.');
    return { revision: result.revision, path: paths[0] };
  }
  async function action(actionName, extra = {}) {
    const view = await workspace();
    if (extra.shipId) { budget(); await selectGmShip(extra.shipId); budget(); }
    const data = { sessionId, instanceId: gmActor.instanceId, requestId: randomUUID(),
      expectedRevision: view.revision, expectedGroupId: groupId, code, coordinate, action: actionName, ...extra };
    const result = await callable('executeCandidateAction', data);
    assert.equal(result.type, 'candidate-action-result'); assert.equal(result.status, 'committed');
    assert.equal(result.sessionId, sessionId); assert.equal(result.requestId, data.requestId);
    assert.equal(result.code, code); assert.equal(result.action, actionName);
    assert.equal(result.revision, view.revision + 1);
    receipts.push({ request: data, result }); return result;
  }
  const start = await workspace();
  if (code === 'N') assert.equal(start.path.repaired, true, 'Real research/materials/holder-craft repair is required.');
  if (code === 'P') assert.equal(start.path.liberated, true, 'Actual authoritative Station liberation is required.');
  let outcomeObserved;
  for (const ship of start.path.ships) {
    if (ship.result && ship.result !== 'awaiting-choice') continue;
    assert.equal(ship.canAct, true, `Current candidate action is blocked for ${ship.shipId}.`);
    if (code === 'P' && ship.reactorCapacity <= 0) continue;
    const reply = await action(code === 'N' ? 'ring-passage' : code === 'O' ? 'nebula-jump' : 'contribute-reactor', { shipId: ship.shipId });
    if (code === 'N') { assert.equal(reply.outcome, 'crossed'); assert.equal(reply.fuelSpent, 5); }
    if (code === 'O') { assert.ok(['reached', 'lost'].includes(reply.outcome)); assert.ok(reply.fuelSpent > 0); }
    if (reply.outcome === 'activated') { outcomeObserved = 'activated'; break; }
  }
  if (code === 'N') {
    const view = await workspace(); assert.equal(view.path.canSabotage, true);
    await action('sabotage-ring'); outcomeObserved = 'crossed';
  }
  const ending = await root();
  assert.equal(ending.phase, 'debrief', 'Other active groups or insufficient capacity retain an open outcome.');
  assert.equal(ending.debriefSnapshot?.source, 'candidate'); assert.equal(ending.debriefSnapshot?.result, 'success');
  assert.equal(ending.debriefSnapshot?.candidate?.code, code);
  if (code === 'O') outcomeObserved = 'reached';
  assert.ok(outcomeObserved, 'Station did not actually activate; preserve this failed bounded slice.');
  return { ...cohort, code, outcomeObserved, receipts, debriefSnapshot: ending.debriefSnapshot,
    interruptedActionRecoveryProved: false, closedHistoryProved: false, sourceOnlyUntilExecuted: true };
}
