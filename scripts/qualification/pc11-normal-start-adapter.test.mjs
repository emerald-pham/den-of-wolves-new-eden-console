import assert from 'node:assert/strict';
import test from 'node:test';

// Keep the pre-implementation RED behavioral: loading the absent adapter is
// tolerated so the assertion names the normal-state contract that is missing.
let readiness;
try {
  ({ pc11MemberReadiness: readiness } = await import('./pc11-normal-start-adapter.mjs'));
} catch {
  readiness = undefined;
}

const castingMember = Object.freeze({
  hasAuth: true,
  sameActor: true,
  uidHash: 'engineer-uid-hash',
  sessionId: 'fresh-normal-session',
  meSessionId: 'fresh-normal-session',
  profileRoleId: null,
  profileSessionId: null,
  playerRole: 'player',
  assignedRoleId: 'dione-engineer',
  activeConsoleRoleId: null,
  seatId: null,
  fleetGroupId: 'fleet-1',
  replacementRoleId: null,
  replacementStatus: null,
  escapeLocked: false,
  kicked: false,
  connected: true,
  currentOwnPlayerConfirmed: true,
  connectionGeneration: 1,
  identityHydrationRevision: 1,
  connection: 'live',
  freshness: 'server',
  cycle: 0,
  phase: 'casting',
  setupConfirmed: true,
  fullGameDemo: null,
  currentCanonicalSeatOwned: false,
  sdkHasServerAuthority: true,
  sdkResumePending: false,
  invalidFields: [],
});

test('ordinary casting identity is live before it claims a canonical station seat', () => {
  assert.equal(readiness?.(castingMember, {
    sessionId: 'fresh-normal-session',
    uidHash: 'engineer-uid-hash',
    roleId: 'dione-engineer',
    stage: 'casting',
  }), true, 'ordinary casting does not require PC10 training markers or a seat claim');
});

test('live station readiness still requires the exact current canonical seat', () => {
  const seatedMember = {
    ...castingMember,
    activeConsoleRoleId: 'dione-engineer',
    seatId: 'dione-engineer',
    phase: 'active',
    currentCanonicalSeatOwned: true,
  };
  assert.equal(readiness?.(seatedMember, {
    sessionId: 'fresh-normal-session',
    uidHash: 'engineer-uid-hash',
    roleId: 'dione-engineer',
    stage: 'station',
  }), true);
  assert.equal(readiness?.({ ...seatedMember, currentCanonicalSeatOwned: false }, {
    sessionId: 'fresh-normal-session',
    uidHash: 'engineer-uid-hash',
    roleId: 'dione-engineer',
    stage: 'station',
  }), false, 'a stale or unclaimed station never gains readiness');
});

test('normal readiness rejects identity, server freshness, and mounted SDK authority drift', () => {
  const expected = {
    sessionId: 'fresh-normal-session',
    uidHash: 'engineer-uid-hash',
    roleId: 'dione-engineer',
    stage: 'casting',
  };
  for (const changed of [
    { sameActor: false },
    { uidHash: 'different-actor' },
    { sessionId: 'foreign-session' },
    { freshness: 'cache' },
    { sdkHasServerAuthority: false },
    { sdkResumePending: true },
    { profileRoleId: 'dione-engineer' },
  ]) {
    assert.equal(readiness?.({ ...castingMember, ...changed }, expected), false);
  }
});
