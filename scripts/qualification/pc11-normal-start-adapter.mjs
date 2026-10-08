import assert from 'node:assert/strict';

export const PC11_NORMAL_START = Object.freeze({
  setup: Object.freeze({
    playerCount: 12,
    chartId: 'A',
    roles: Object.freeze(['dione-engineer', 'dione-president']),
  }),
  ui: Object.freeze({
    setupRegion: 'Setup',
    setupButton: 'Confirm setup // Confirm roster',
    productionRegion: 'Ordinary production start',
    productionButton: 'Start production // Advance to Cycle 1',
    briefingClearButton: 'Clear cycle briefing // resume clock',
  }),
  progression: 'ordinary-production',
  proofInputs: Object.freeze({
    canonicalRoleIds: 'read from the live normal setup configuration; never infer from this adapter',
    expectedMembers: 'capture uidHash and sessionId at normal casting admission, before station claims',
  }),
});

function isNonblankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function commonLiveMember(value, expected) {
  return Boolean(value && expected &&
    value.hasAuth === true && value.sameActor === true &&
    isNonblankString(expected.uidHash) && value.uidHash === expected.uidHash &&
    isNonblankString(expected.sessionId) && value.sessionId === expected.sessionId &&
    value.meSessionId === expected.sessionId &&
    value.profileRoleId == null && value.profileSessionId == null &&
    value.playerRole === 'player' && value.connected === true &&
    value.currentOwnPlayerConfirmed === true && value.kicked === false &&
    value.escapeLocked === false && value.replacementRoleId == null &&
    value.replacementStatus == null && value.fullGameDemo == null &&
    Number.isSafeInteger(value.connectionGeneration) && value.connectionGeneration >= 1 &&
    Number.isSafeInteger(value.identityHydrationRevision) && value.identityHydrationRevision >= 1 &&
    (expected.connectionGeneration === undefined || value.connectionGeneration === expected.connectionGeneration) &&
    (expected.identityHydrationRevision === undefined || value.identityHydrationRevision === expected.identityHydrationRevision) &&
    value.connection === 'live' && value.freshness === 'server' &&
    value.sdkHasServerAuthority === true &&
    Array.isArray(value.invalidFields) && value.invalidFields.length === 0);
}

/** A normally admitted member is ready during casting before claiming a seat. */
export function pc11MemberReadiness(value, expected) {
  if (!commonLiveMember(value, expected)) return false;
  if (expected.stage === 'casting') {
    return value.cycle === 0 && value.phase === 'casting' && value.setupConfirmed === true &&
      value.assignedRoleId === (expected.roleId ?? null) &&
      value.activeConsoleRoleId == null && value.seatId == null;
  }
  if (expected.stage === 'station' && typeof expected.roleId === 'string') {
    return (value.phase === 'casting' && value.cycle === 0 || value.phase === 'active' && value.cycle === 1) &&
      value.assignedRoleId === expected.roleId && value.activeConsoleRoleId === expected.roleId &&
      value.seatId === expected.roleId && value.currentCanonicalSeatOwned === true;
  }
  return false;
}

/** Preserve the same Auth/session epoch; accept a changed epoch only with its exact server-resume receipt. */
export function pc11SameActorEpoch(before, after, resumeEvidence) {
  if (!before || !after || !isNonblankString(before.uidHash) || !isNonblankString(after.uidHash) ||
      before.uidHash !== after.uidHash || !isNonblankString(before.sessionId) ||
      !isNonblankString(after.sessionId) || before.sessionId !== after.sessionId ||
      before.profileRoleId !== after.profileRoleId || before.profileSessionId !== after.profileSessionId ||
      !Number.isFinite(before.documentTimeOrigin) || before.documentTimeOrigin <= 0 ||
      !Number.isFinite(after.documentTimeOrigin) || after.documentTimeOrigin <= 0 ||
      !Number.isSafeInteger(before.connectionGeneration) ||
      before.connectionGeneration < 1 ||
      !Number.isSafeInteger(after.connectionGeneration) ||
      after.connectionGeneration < 1 ||
      !Number.isSafeInteger(before.identityHydrationRevision) ||
      before.identityHydrationRevision < 1 ||
      !Number.isSafeInteger(after.identityHydrationRevision) ||
      after.identityHydrationRevision < 1 ||
      after.connectionGeneration < before.connectionGeneration ||
      after.identityHydrationRevision < before.identityHydrationRevision) return false;

  const sameEpoch = before.documentTimeOrigin === after.documentTimeOrigin &&
    before.connectionGeneration === after.connectionGeneration &&
    before.identityHydrationRevision === after.identityHydrationRevision;
  if (sameEpoch) return true;
  return resumeEvidence?.status === 'accepted' &&
    resumeEvidence.source === 'normal-resumeSession' &&
    resumeEvidence.uidHash === after.uidHash && resumeEvidence.sessionId === after.sessionId &&
    resumeEvidence.connectionGeneration === after.connectionGeneration &&
    resumeEvidence.identityHydrationRevision === after.identityHydrationRevision &&
    resumeEvidence.sdkHasServerAuthority === true;
}

/** A live GM must own the exact current instance and mounted server-authority cursor. */
export function pc11GmReadiness(value, expected) {
  return Boolean(value && expected && value.hasAuth === true && value.sameActor === true &&
    isNonblankString(expected.uidHash) && value.uidHash === expected.uidHash &&
    isNonblankString(expected.sessionId) && value.sessionId === expected.sessionId &&
    value.meSessionId === expected.sessionId && value.playerRole === 'gm' &&
    value.profileRoleId == null && value.profileSessionId == null && value.fullGameDemo == null &&
    Number.isSafeInteger(value.connectionGeneration) && value.connectionGeneration >= 1 &&
    Number.isSafeInteger(value.identityHydrationRevision) && value.identityHydrationRevision >= 1 &&
    value.connection === 'live' && value.freshness === 'server' &&
    value.connected === true && value.kicked === false && value.recoveryPending === false &&
    Array.isArray(value.invalidFields) && value.invalidFields.length === 0 &&
    value.currentOwnPlayerConfirmed === true && value.sdkHasServerAuthority === true &&
    value.gmInstanceOwned === true &&
    isNonblankString(expected.instanceId) && value.instanceId === expected.instanceId);
}

/** Check a read-only snapshot after normal production start, before trade/Philia actions. */
export function pc11NormalStartPreflight(snapshot) {
  const blockers = [];
  const session = snapshot?.session;
  const roles = session?.activeRoleIds;
  const members = snapshot?.members;
  if (!session || session.phase !== 'active' || session.currentTurn !== 1) {
    blockers.push('session must be active and nonterminal');
  }
  if (session?.fullGameDemo != null) {
    blockers.push('session must be a normal production session without a training marker');
  }
  if (session?.setupConfirmed !== true || session?.playerCount !== PC11_NORMAL_START.setup.playerCount ||
      session?.chartId !== PC11_NORMAL_START.setup.chartId || !Array.isArray(roles) || roles.length !== 12 ||
      new Set(roles).size !== 12 || PC11_NORMAL_START.setup.roles.some(roleId => !roles.includes(roleId))) {
    blockers.push('setup must be a configured twelve-seat Chart A roster with Dione Engineer and President');
  }
  const canonicalRoles = snapshot?.canonicalRoleIds;
  if (!Array.isArray(canonicalRoles) || canonicalRoles.length !== 12 ||
      new Set(canonicalRoles).size !== 12 || canonicalRoles.some(roleId => typeof roleId !== 'string' || roleId.length === 0)) {
    blockers.push('canonical twelve-seat roster must be supplied from live normal setup configuration');
  } else if (!Array.isArray(roles) || JSON.stringify(roles) !== JSON.stringify(canonicalRoles)) {
    blockers.push('active twelve-seat roster must exactly match live normal setup configuration');
  }
  if (session?.dioneEnabled !== true || !session.activeVesselIds?.includes('dione') ||
      !session.shuttleDockings?.some(docking => docking.shuttleId === 'philia' && docking.shipId === 'dione')) {
    blockers.push('Dione must be active with Philia docked at its normal starting host');
  }
  if (session?.id && snapshot?.expectedGm?.sessionId !== session.id) {
    blockers.push('the normal authenticated GM must match the active session');
  }
  if (!pc11GmReadiness(snapshot?.gm, snapshot?.expectedGm)) {
    blockers.push('the normal authenticated GM must own its exact live instance and server authority');
  }
  if (!Array.isArray(members) || members.length !== 2 || snapshot?.occupiedSeatCount !== 2) {
    blockers.push('exactly the Engineer and President seats must be occupied');
  } else {
    const byRole = new Map(members.map(member => [member.assignedRoleId, member]));
    const expectedMembers = Array.isArray(snapshot?.expectedMembers) ? snapshot.expectedMembers : [];
    const expectedByRole = new Map(expectedMembers.map(member => [member?.roleId, member]));
    const expectedMembersReady = PC11_NORMAL_START.setup.roles.every(roleId => {
      const expected = expectedByRole.get(roleId);
      return expected && expected.sessionId === session?.id &&
        typeof expected.uidHash === 'string' && expected.uidHash.trim().length > 0;
    });
    const admissionIdentitiesMatch = PC11_NORMAL_START.setup.roles.every(roleId => {
      const expected = expectedByRole.get(roleId);
      const member = byRole.get(roleId);
      return expected && member && member.uidHash === expected.uidHash && member.sessionId === expected.sessionId;
    });
    if (!expectedMembersReady || expectedMembers.length !== 2 || !admissionIdentitiesMatch) {
      blockers.push('seated players must match their independently captured normal-admission identities');
    }
    const allReady = PC11_NORMAL_START.setup.roles.every(roleId => {
      const member = byRole.get(roleId);
      const expected = expectedByRole.get(roleId);
      return member && pc11MemberReadiness(member, {
        sessionId: session.id,
        uidHash: expected?.uidHash,
        roleId,
        stage: 'station',
      });
    });
    const fleetGroupId = members[0]?.fleetGroupId;
    if (!allReady || !expectedMembersReady || new Set(members.map(member => member.uidHash)).size !== 2 ||
        typeof fleetGroupId !== 'string' || fleetGroupId.trim().length === 0 ||
        members[1]?.fleetGroupId !== fleetGroupId) {
      blockers.push('two distinct live players must own the Engineer and President seats in one fleet group');
    }
    if (new Set([snapshot?.gm?.uidHash, ...members.map(member => member.uidHash)]).size !== 3) {
      blockers.push('the normal GM and both players must be three distinct authenticated actors');
    }
  }
  return { ready: blockers.length === 0, blockers };
}

if (process.argv.includes('--show-contract')) {
  assert.equal(PC11_NORMAL_START.progression, 'ordinary-production');
  process.stdout.write(`${JSON.stringify(PC11_NORMAL_START, null, 2)}\n`);
}
