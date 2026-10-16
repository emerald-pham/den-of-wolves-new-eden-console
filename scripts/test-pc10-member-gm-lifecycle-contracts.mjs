import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MEMBER_GM_CASES, assertOriginalActor, assertLateReplyAuthority, assertClearedPrivateState, assertCallbackContext,
  assertCapturedUiRequest, assertRecoveredResult, recoveryProtocol, lifecycleCaseAvailability,
} from './pc10-member-gm-lifecycle-contracts.mjs';

const actor = Object.freeze({ sessionId: 'fresh-session', uidHash: '0123456789abcdef', hasAuth: true,
  sameActor: true, connection: 'live', freshness: 'server', generation: 4, hydrationRevision: 2,
  playerRole: 'gm', instanceId: 'original-instance', gmInstanceOwned: true, claimedAt: 'lease-1',
  privateCount: 0, pendingCount: 0, foreignPendingCount: 0, privateAudienceMatches: true });

test('the finite lifecycle inventory names unmounted procedures and permanent kick disposition', () => {
  assert.equal(MEMBER_GM_CASES['gm-registration-lock'].mounted, false);
  assert.equal(MEMBER_GM_CASES['own-seat-release'].mounted, 'conditional');
  assert.equal(MEMBER_GM_CASES['player-kick'].disposition, 'permanent-session-ban');
});
test('same original live UID, session, generation and GM lease are accepted', () => {
  assert.doesNotThrow(() => assertOriginalActor(actor, { ...actor }, { gm: true }));
});
test('hook entry is bound to the original driver GM and roster, never self-authorized from a new snapshot', () => {
  const context = { initial: { sessionId: actor.sessionId, uidHash: actor.uidHash },
    started: { instanceId: actor.instanceId }, roster: [{ roleId: 'ordinary-role', uidHash: 'member-hash' }] };
  const member = { ...actor, uidHash: 'member-hash', playerRole: 'player', gmInstanceOwned: false,
    instanceId: null, profileRoleId: 'ordinary-role' };
  assert.doesNotThrow(() => assertCallbackContext(context, actor, member));
  assert.throws(() => assertCallbackContext(context, { ...actor, uidHash: 'changed-gm' }, member));
  assert.throws(() => assertCallbackContext(context, { ...actor, instanceId: 'changed-instance' }, member));
  assert.throws(() => assertCallbackContext(context, actor, { ...member, uidHash: 'new-role-account' }));
});
for (const [field, value] of Object.entries({ uidHash: 'fedcba9876543210', sessionId: 'foreign',
  sameActor: false, hasAuth: false, connection: 'connecting', freshness: 'cache', generation: 5,
  instanceId: 'foreign-instance', gmInstanceOwned: false, claimedAt: 'lease-2' })) {
  test(`authority is not inferred after ${field} changes`, () => {
    assert.throws(() => assertOriginalActor(actor, { ...actor, [field]: value }, { gm: true }));
  });
}
test('intentional GM release permits only original live member and never a foreign instance', () => {
  assert.doesNotThrow(() => assertOriginalActor(actor, { ...actor, playerRole: 'player',
    instanceId: null, gmInstanceOwned: false, claimedAt: null }, { releasedGm: true }));
  assert.throws(() => assertOriginalActor(actor, { ...actor, instanceId: 'other' }, { releasedGm: true }));
});
test('late response cannot acquire a later connection or hydrated authority', () => {
  assert.throws(() => assertLateReplyAuthority(actor, { ...actor, hydrationRevision: 3 }));
  assert.throws(() => assertLateReplyAuthority(actor, { ...actor, generation: 5 }));
});
test('rejoin must preserve original Auth UID and gain a real newer server generation', () => {
  assert.doesNotThrow(() => assertOriginalActor(actor, { ...actor, generation: 5 }, { rejoined: true }));
  assert.throws(() => assertOriginalActor(actor, { ...actor, generation: 4 }, { rejoined: true }));
  assert.throws(() => assertOriginalActor(actor, { ...actor, generation: 5, uidHash: 'replacement' }, { rejoined: true }));
});
test('disconnect and kick never retain private projection or another actor outbox', () => {
  const cleared = { ...actor, sessionId: null, sameActor: false, privateCount: 0,
    instanceId: null, gmInstanceOwned: false, foreignPendingCount: 0 };
  assert.doesNotThrow(() => assertClearedPrivateState(actor, cleared));
  assert.throws(() => assertClearedPrivateState(actor, { ...cleared, privateCount: 1 }));
  assert.throws(() => assertClearedPrivateState(actor, { ...cleared, foreignPendingCount: 1 }));
  assert.throws(() => assertClearedPrivateState(actor, { ...cleared, uidHash: 'new-account' }));
});
test('exact recovery is only the actual captured same-session, same-instance UI request', () => {
  const data = { sessionId: actor.sessionId, instanceId: actor.instanceId, requestId: 'real-ui-request' };
  assert.doesNotThrow(() => assertCapturedUiRequest('releaseRole', data, actor));
  assert.throws(() => assertCapturedUiRequest('releaseRole', { ...data, instanceId: 'foreign' }, actor));
  assert.throws(() => assertCapturedUiRequest('releaseRole', { ...data, sessionId: 'foreign' }, actor));
  assert.throws(() => assertCapturedUiRequest('releaseRole', { ...data, requestId: null }, actor));
});
test('denied, queued, stale and changed receipt results earn no recovery credit', () => {
  const original = { sessionId: actor.sessionId, setupRevision: 12 };
  assert.doesNotThrow(() => assertRecoveredResult('releaseRole', original, { status: 'committed', result: original }));
  for (const status of ['denied', 'queued', 'stale']) {
    assert.throws(() => assertRecoveredResult('releaseRole', original, { status, result: original }));
  }
  assert.throws(() => assertRecoveredResult('releaseRole', original, {
    status: 'committed', result: { ...original, setupRevision: 13 } }));
});
test('state-idempotent grant/logout are distinguished from receipt-bound mutations', () => {
  assert.equal(recoveryProtocol('releaseGmInstance'), 'receipt');
  assert.equal(recoveryProtocol('setGmShipConsoleWriteGrant'), 'state-idempotent');
  assert.equal(recoveryProtocol('refreshPresence'), 'state-idempotent');
  assert.equal(recoveryProtocol('logoutGmAccess'), 'state-idempotent');
  assert.equal(recoveryProtocol('claimGmInstance'), 'stable-instance-repeat');
});
test('disconnect is generation-bound cleanup and only Press confetti has an exact receipt', () => {
  assert.equal(recoveryProtocol('disconnectFromSession'), 'generation-bound-cleanup');
  assert.equal(recoveryProtocol('popShipConfetti', { shipId: 'snn-press-shuttle' }), 'receipt');
  assert.equal(recoveryProtocol('popShipConfetti', { shipId: 'aegis' }), 'no-safe-exact-replay');
});
test('casting release never becomes an active-game mutation; stale clearing needs real disconnection', () => {
  assert.equal(lifecycleCaseAvailability('casting-release', { phase: 'active', cycle: 1 }).status, 'blocked');
  assert.equal(lifecycleCaseAvailability('casting-release', { phase: 'casting', cycle: 0 }).status, 'ready');
  assert.equal(lifecycleCaseAvailability('stale-seat-clear', { phase: 'casting', cycle: 0,
    targetDisconnected: false }).status, 'blocked');
  assert.equal(lifecycleCaseAvailability('gm-registration-lock', { phase: 'active', cycle: 1 }).status, 'blocked');
});
