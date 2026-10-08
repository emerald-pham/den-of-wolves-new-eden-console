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

test('member readiness rejects empty expected actor and session identities', () => {
  const emptyIdentity = { ...castingMember, uidHash: '', sessionId: '', meSessionId: '' };
  assert.equal(readiness?.(emptyIdentity, {
    sessionId: '', uidHash: '', roleId: 'dione-engineer', stage: 'casting',
  }), false);
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
  for (const invalid of [
    { ...before, documentTimeOrigin: 0 },
    { ...before, documentTimeOrigin: Number.NaN },
    { ...before, documentTimeOrigin: Number.POSITIVE_INFINITY },
    { ...before, connectionGeneration: 0 },
    { ...before, identityHydrationRevision: 0 },
  ]) {
    assert.equal(sameActorEpoch?.(invalid, { ...invalid }), false);
  }
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
    connected: true,
    kicked: false,
    recoveryPending: false,
    currentOwnPlayerConfirmed: true,
    sdkHasServerAuthority: true,
    sdkResumePending: false,
    instanceId: 'fresh-gm-instance',
    gmInstanceOwned: true,
    invalidFields: [],
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
  for (const changed of [
    { uidHash: '', sessionId: '' , instanceId: '' },
    { connected: false },
    { kicked: true },
    { recoveryPending: true },
    { invalidFields: ['instanceId'] },
  ]) {
    assert.equal(gmReadiness?.({ ...gm, ...changed }, {
      ...expected,
      uidHash: changed.uidHash ?? expected.uidHash,
      sessionId: changed.sessionId ?? expected.sessionId,
      instanceId: changed.instanceId ?? expected.instanceId,
    }), false);
  }
});

function normalStartSnapshot() {
  const gm = {
    hasAuth: true, sameActor: true, uidHash: 'gm-uid-hash',
    sessionId: 'fresh-normal-session', meSessionId: 'fresh-normal-session',
    profileRoleId: null, profileSessionId: null, playerRole: 'gm',
    connectionGeneration: 1, identityHydrationRevision: 1,
    connection: 'live', freshness: 'server', currentOwnPlayerConfirmed: true,
    connected: true, kicked: false, recoveryPending: false, invalidFields: [],
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
  const activeRoleIds = ['admiral', 'wing-commander', 'dione-engineer', 'dione-president',
    'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist',
    'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'];
  return {
    session: {
      id: 'fresh-normal-session', phase: 'active', currentTurn: 1,
      fullGameDemo: null, setupConfirmed: true, playerCount: 12, chartId: 'A',
      activeRoleIds,
      dioneEnabled: true, activeVesselIds: ['dione'],
      shuttleDockings: [{ shuttleId: 'philia', shipId: 'dione' }],
    },
    canonicalRoleIds: [...activeRoleIds],
    gm,
    expectedGm: { sessionId: 'fresh-normal-session', uidHash: 'gm-uid-hash', instanceId: 'fresh-gm-instance' },
    expectedMembers: [
      { roleId: 'dione-engineer', sessionId: 'fresh-normal-session', uidHash: 'engineer-uid-hash' },
      { roleId: 'dione-president', sessionId: 'fresh-normal-session', uidHash: 'president-uid-hash' },
    ],
    members: [player('engineer-uid-hash', 'dione-engineer'), player('president-uid-hash', 'dione-president')],
    occupiedSeatCount: 2,
  };
}

test('normal start preflight requires a configured twelve-seat Dione and docked Philia state', () => {
  const snapshot = normalStartSnapshot();
  assert.deepEqual(normalStartPreflight?.(snapshot), { ready: true, blockers: [] });
  assert.ok(normalStartPreflight?.({ ...snapshot, session: { ...snapshot.session, phase: 'closed' } })
    .blockers.includes('session must be active and nonterminal'));
  assert.ok(normalStartPreflight?.({ ...snapshot, session: { ...snapshot.session, fullGameDemo: { status: 'active' } } })
    .blockers.includes('session must be a normal production session without a training marker'));
  assert.ok(normalStartPreflight?.({ ...snapshot, occupiedSeatCount: 1 }).blockers
    .includes('exactly the Engineer and President seats must be occupied'));
});

test('normal start preflight requires the live canonical role source and exact configured roster', () => {
  const snapshot = normalStartSnapshot();
  assert.ok(normalStartPreflight?.({ ...snapshot, canonicalRoleIds: undefined }).blockers
    .includes('canonical twelve-seat roster must be supplied from live normal setup configuration'));

  const differentCanonicalRoster = [...snapshot.canonicalRoleIds];
  differentCanonicalRoster.reverse();
  assert.ok(normalStartPreflight?.({ ...snapshot, canonicalRoleIds: differentCanonicalRoster }).blockers
    .includes('active twelve-seat roster must exactly match live normal setup configuration'));

  const illegalRoles = [...snapshot.session.activeRoleIds];
  illegalRoles[11] = 'not-a-configured-role';
  assert.ok(normalStartPreflight?.({
    ...snapshot,
    session: { ...snapshot.session, activeRoleIds: illegalRoles },
  }).blockers.includes('active twelve-seat roster must exactly match live normal setup configuration'));
});

test('normal start preflight rejects missing, null, or empty fleet group identities', () => {
  const snapshot = normalStartSnapshot();
  for (const invalidGroup of [undefined, null, '']) {
    const members = snapshot.members.map(member => ({ ...member, fleetGroupId: invalidGroup }));
    assert.ok(normalStartPreflight?.({ ...snapshot, members }).blockers
      .includes('two distinct live players must own the Engineer and President seats in one fleet group'),
    `fleetGroupId ${String(invalidGroup)} must not satisfy shared-group readiness`);
  }
  const membersWithoutGroup = snapshot.members.map(({ fleetGroupId: _fleetGroupId, ...member }) => member);
  assert.ok(normalStartPreflight?.({ ...snapshot, members: membersWithoutGroup }).blockers
    .includes('two distinct live players must own the Engineer and President seats in one fleet group'));
});

test('normal start preflight binds the GM and players to the expected normal-session actors', () => {
  const snapshot = normalStartSnapshot();
  const foreignGm = {
    ...snapshot,
    gm: { ...snapshot.gm, sessionId: 'foreign-session', meSessionId: 'foreign-session' },
    expectedGm: { ...snapshot.expectedGm, sessionId: 'foreign-session' },
  };
  assert.ok(normalStartPreflight?.(foreignGm).blockers
    .includes('the normal authenticated GM must match the active session'));

  const replacedPlayer = {
    ...snapshot,
    members: [{ ...snapshot.members[0], uidHash: 'replacement-actor' }, snapshot.members[1]],
  };
  assert.ok(normalStartPreflight?.(replacedPlayer).blockers
    .includes('seated players must match their independently captured normal-admission identities'));
});

test('normal start preflight requires three distinct authenticated actors', () => {
  const snapshot = normalStartSnapshot();
  const gmIsEngineer = {
    ...snapshot,
    gm: { ...snapshot.gm, uidHash: snapshot.members[0].uidHash },
    expectedGm: { ...snapshot.expectedGm, uidHash: snapshot.members[0].uidHash },
  };
  assert.ok(normalStartPreflight?.(gmIsEngineer).blockers
    .includes('the normal GM and both players must be three distinct authenticated actors'));
});
