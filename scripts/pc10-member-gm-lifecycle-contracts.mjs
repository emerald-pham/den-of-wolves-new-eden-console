import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Source pin is a planning baseline, never a claim that this build was served.
export const MEMBER_TURN_SOURCE_PIN = '5f5aa4ef652dc58b6a1de3c8530db825fcaa349b';
export const MEMBER_GM_CASES = Object.freeze({
  'casting-release': { mounted: true, phase: 'casting', endpoints: ['releaseRole', 'assignRole'] },
  'stale-seat-clear': { mounted: true, phase: 'casting', endpoints: ['disconnectFromSession', 'releaseSeat', 'joinSession', 'assignRole'] },
  'own-seat-release': { mounted: 'conditional', phase: 'casting', endpoints: ['releaseSeat'],
    limit: 'RoleSelect mounts this only for an existing GM holder; ordinary GM claim forbids a core station.' },
  'member-console': { mounted: true, endpoints: ['refreshPresence'] },
  'member-disconnect': { mounted: true, endpoints: ['disconnectFromSession', 'joinSession'] },
  'member-interrupted-release': { mounted: true, endpoints: ['refreshPresence'] },
  'optional-gm': { mounted: true, endpoints: ['loginGmAccess', 'claimGmInstance', 'releaseGmInstance', 'kickGmInstance', 'logoutGmAccess'] },
  'gm-ship-grant-lock': { mounted: true, phase: 'active', endpoints: ['setGmShipConsoleWriteGrant', 'setShipConsoleLock'] },
  'player-kick': { mounted: true, disposition: 'permanent-session-ban', endpoints: ['kickPlayer', 'joinSession'] },
  'gm-registration-lock': { mounted: false, endpoints: ['setGmControlsLocked'],
    limit: 'Current RoleSelect/GmConsole have no mounted registration-lock writer; no initial SDK mutation is permitted.' },
});

export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

export function assertCallbackContext(context, gm, crew, controllerUidHash) {
  assert.equal(gm.sessionId, context.initial.sessionId); assert.equal(gm.uidHash, context.initial.uidHash);
  assertOriginalActor(gm, gm, { gm: true });
  const originalInstance = context.started?.instanceId ?? context.prepared?.instanceId;
  if (originalInstance) assert.equal(gm.instanceId, originalInstance);
  assert.equal(crew.sessionId, context.initial.sessionId); assert.notEqual(crew.uidHash, gm.uidHash);
  assertOriginalActor(crew, crew);
  if (crew.profileRoleId === 'controller') {
    assert.ok(controllerUidHash); assert.equal(crew.uidHash, controllerUidHash);
  } else {
    const original = context.roster.find(row => row.roleId === crew.profileRoleId);
    assert.ok(original, 'Selected actor must be present in the genuine original roster.');
    assert.equal(crew.uidHash, original.uidHash);
  }
}

export function assertOriginalActor(expected, current, options = {}) {
  assert.ok(expected?.sessionId && expected.uidHash, 'Bind the genuine actor before choosing a control.');
  assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
  assert.equal(current.uidHash, expected.uidHash, 'Never replace the original Auth account.');
  assert.equal(current.sessionId, expected.sessionId);
  assert.equal(current.connection, 'live'); assert.equal(current.freshness, 'server');
  assert.equal(current.privateAudienceMatches, true);
  assert.equal(current.foreignPendingCount, 0, 'No foreign session/actor command may be replayed.');
  assert.ok(Number.isSafeInteger(current.generation) && current.generation >= 1, 'Read real server connection generation.');
  if (options.rejoined) assert.ok(current.generation > expected.generation);
  else assert.equal(current.generation, expected.generation);
  if (options.gm) {
    assert.equal(current.playerRole, 'gm'); assert.equal(current.gmInstanceOwned, true);
    assert.equal(current.instanceId, expected.instanceId); assert.equal(current.claimedAt, expected.claimedAt);
  }
  if (options.releasedGm) {
    assert.equal(current.playerRole, 'player'); assert.equal(current.gmInstanceOwned, false);
    assert.equal(current.instanceId, null);
  }
}

export function assertLateReplyAuthority(before, current) {
  assertOriginalActor(before, current, { gm: before.gmInstanceOwned });
  assert.equal(current.hydrationRevision, before.hydrationRevision, 'A late response cannot hydrate a new authority generation.');
  assert.equal(current.activeConsoleRoleId, before.activeConsoleRoleId);
}

/** Current Source emits content count; original Native aggregate-zero fixtures remain valid. */
export function assertClearedPrivatePayload(current) {
  assert.ok(current && typeof current === 'object' && !Array.isArray(current), 'Use a held private-clearance observation.');
  if ('privatePayloadCount' in current) {
    assert.ok(Object.hasOwn(current, 'privatePayloadCount') && Number.isSafeInteger(current.privatePayloadCount) &&
      current.privatePayloadCount >= 0 && current.privatePayloadCount === 0,
    'The Source private-payload count must be an own, safe nonnegative integer zero.');
  } else {
    // Legacy Native fixtures prove absence through their original aggregate zero.
    // Current Source observations always supply the new field; no unknown count is guessed.
    assert.equal(current.privateCount, 0);
  }
}

export function assertClearedPrivateState(before, current) {
  assert.equal(current.hasAuth, true); assert.equal(current.uidHash, before.uidHash);
  assert.equal(current.sessionId, null); assertClearedPrivatePayload(current);
  assert.equal(current.instanceId, null); assert.equal(current.gmInstanceOwned, false);
  assert.equal(current.foreignPendingCount, 0);
}

const RECEIPTS = new Set(['releaseRole', 'assignRole', 'releaseSeat', 'releaseGmInstance',
  'kickGmInstance', 'kickPlayer', 'setShipConsoleLock', 'beginSessionDebrief', 'closeSession',
  'clearTurnAdvanceInterstitial', 'advanceTurn', 'advanceFullGameDemoPhase']);
const STATE_REPEATS = new Set(['refreshPresence', 'setGmShipConsoleWriteGrant', 'logoutGmAccess',
  'setDebriefMode', 'setGmControlsLocked', 'beginOpenAirspacePhase']);
export function recoveryProtocol(endpoint, data) {
  if (endpoint === 'disconnectFromSession') return 'generation-bound-cleanup';
  if (endpoint === 'popShipConfetti') return data?.shipId === 'snn-press-shuttle' ? 'receipt' : 'no-safe-exact-replay';
  if (RECEIPTS.has(endpoint)) return 'receipt';
  if (STATE_REPEATS.has(endpoint)) return 'state-idempotent';
  if (endpoint === 'claimGmInstance') return 'stable-instance-repeat';
  return 'no-safe-exact-replay';
}

export function assertCapturedUiRequest(endpoint, data, actor) {
  assert.ok(data && typeof data === 'object' && !Array.isArray(data));
  if (endpoint !== 'loginGmAccess' && endpoint !== 'logoutGmAccess') assert.equal(data.sessionId, actor.sessionId);
  if (endpoint === 'claimGmInstance') assert.ok(typeof data.instanceId === 'string' && data.instanceId.length > 0);
  else if (data.instanceId !== undefined && data.instanceId !== null) assert.equal(data.instanceId, actor.instanceId);
  if (recoveryProtocol(endpoint, data) === 'receipt') assert.ok(typeof data.requestId === 'string' && data.requestId.length > 0);
  if (endpoint === 'disconnectFromSession') assert.equal(data.connectionGeneration, actor.generation);
}

export function assertRecoveredResult(endpoint, original, reply, data) {
  assert.equal(recoveryProtocol(endpoint, data), 'receipt', 'Receipt credit requires the source receipt protocol.');
  assert.equal(reply.status, 'committed'); assert.deepEqual(reply.result, original);
}

export function lifecycleCaseAvailability(id, state) {
  const definition = MEMBER_GM_CASES[id]; assert.ok(definition, `Unknown finite case ${id}`);
  if (definition.mounted === false) return { status: 'blocked', reason: definition.limit };
  if (definition.phase === 'casting' && !(state.cycle === 0 && ['lobby', 'casting'].includes(state.phase))) {
    return { status: 'blocked', reason: 'Next actor: live GM in a separate fresh Cycle 0 casting session.' };
  }
  if (definition.phase === 'active' && state.phase !== 'active') return { status: 'blocked', reason: 'Next actor: GM must start normal full gameplay.' };
  if (id === 'stale-seat-clear' && !state.targetDisconnected) return { status: 'blocked', reason: 'The original holder must actually disconnect before this disclosed intervention.' };
  return { status: 'ready' };
}
