import assert from 'node:assert/strict';
import test from 'node:test';

// Keep the pre-implementation RED behavioral: loading the absent adapter is
// tolerated so the assertion names the normal-state contract that is missing.
let readiness;
let sameActorEpoch;
let gmReadiness;
let normalStartPreflight;
try {
  ({
    pc11MemberReadiness: readiness,
    pc11SameActorEpoch: sameActorEpoch,
    pc11GmReadiness: gmReadiness,
    pc11NormalStartPreflight: normalStartPreflight,
  } = await import('./pc11-normal-start-adapter.mjs'));
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
    cycle: 1,
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

test('member identity epoch cannot drift or regress without exact normal resume evidence', () => {
  const before = {
    uidHash: 'engineer-uid-hash',
    sessionId: 'fresh-normal-session',
    documentTimeOrigin: 100,
    connectionGeneration: 2,
    identityHydrationRevision: 3,
  };
  assert.equal(sameActorEpoch?.(before, { ...before }), true);
  const resumed = {
    ...before,
    connectionGeneration: 3,
    identityHydrationRevision: 4,
  };
  assert.equal(sameActorEpoch?.(before, resumed), false);
  assert.equal(sameActorEpoch?.(before, resumed, {
    status: 'accepted',
    source: 'normal-resumeSession',
    uidHash: before.uidHash,
    sessionId: before.sessionId,
    connectionGeneration: resumed.connectionGeneration,
    identityHydrationRevision: resumed.identityHydrationRevision,
    sdkHasServerAuthority: true,
  }), true);
  assert.equal(sameActorEpoch?.(before, { ...resumed, uidHash: 'other-actor' }, {
    status: 'accepted', source: 'normal-resumeSession', uidHash: before.uidHash,
    sessionId: before.sessionId, connectionGeneration: 3,
    identityHydrationRevision: 4, sdkHasServerAuthority: true,
  }), false);
  assert.equal(sameActorEpoch?.(before, { ...before, identityHydrationRevision: 2 }), false);
});

test('GM readiness requires the exact current owned live instance and server authority', () => {
  const gm = {
    hasAuth: true,
    sameActor: true,
    uidHash: 'gm-uid-hash',
    sessionId: 'fresh-normal-session',
    meSessionId: 'fresh-normal-session',
    profileRoleId: null,
    profileSessionId: null,
    playerRole: 'gm',
    connectionGeneration: 1,
    identityHydrationRevision: 1,
    connection: 'live',
    freshness: 'server',
    currentOwnPlayerConfirmed: true,
    sdkHasServerAuthority: true,
    sdkResumePending: false,
    instanceId: 'fresh-gm-instance',
    gmInstanceOwned: true,
  };
  const expected = {
    sessionId: 'fresh-normal-session',
    uidHash: 'gm-uid-hash',
    instanceId: 'fresh-gm-instance',
  };
  assert.equal(gmReadiness?.(gm, expected), true);
  assert.equal(gmReadiness?.({ ...gm, gmInstanceOwned: false }, expected), false);
  assert.equal(gmReadiness?.({ ...gm, instanceId: 'foreign-instance' }, expected), false);
  assert.equal(gmReadiness?.({ ...gm, sdkHasServerAuthority: false }, expected), false);
});

test('normal start preflight requires the legal twelve-seat Dione and docked Philia state', () => {
  const gm = {
    hasAuth: true, sameActor: true, uidHash: 'gm-uid-hash',
    sessionId: 'fresh-normal-session', meSessionId: 'fresh-normal-session',
    profileRoleId: null, profileSessionId: null, playerRole: 'gm',
    connectionGeneration: 1, identityHydrationRevision: 1,
    connection: 'live', freshness: 'server', currentOwnPlayerConfirmed: true,
    sdkHasServerAuthority: true, sdkResumePending: false,
    instanceId: 'fresh-gm-instance', gmInstanceOwned: true, fullGameDemo: null,
  };
  const player = (uidHash, roleId) => ({
    ...castingMember,
    uidHash,
    assignedRoleId: roleId,
    phase: 'active',
    cycle: 1,
    activeConsoleRoleId: roleId,
    seatId: roleId,
    currentCanonicalSeatOwned: true,
  });
  const snapshot = {
    session: {
      id: 'fresh-normal-session', phase: 'active', currentTurn: 1,
      fullGameDemo: null, setupConfirmed: true, playerCount: 12, chartId: 'A',
      activeRoleIds: ['admiral', 'wing-commander', 'dione-engineer', 'dione-president',
        'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist',
        'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
      dioneEnabled: true, activeVesselIds: ['dione'],
      shuttleDockings: [{ shuttleId: 'philia', shipId: 'dione' }],
    },
    gm,
    expectedGm: { sessionId: 'fresh-normal-session', uidHash: 'gm-uid-hash', instanceId: 'fresh-gm-instance' },
    members: [player('engineer-uid-hash', 'dione-engineer'), player('president-uid-hash', 'dione-president')],
    occupiedSeatCount: 2,
  };
  assert.deepEqual(normalStartPreflight?.(snapshot), { ready: true, blockers: [] });
  assert.ok(normalStartPreflight?.({ ...snapshot, session: { ...snapshot.session, phase: 'closed' } })
    .blockers.includes('session must be active and nonterminal'));
  assert.ok(normalStartPreflight?.({ ...snapshot, session: { ...snapshot.session, fullGameDemo: { status: 'active' } } })
    .blockers.includes('session must be a normal production session without a training marker'));
  assert.ok(normalStartPreflight?.({ ...snapshot, occupiedSeatCount: 1 }).blockers
    .includes('exactly the Engineer and President seats must be occupied'));
});
