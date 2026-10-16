import assert from 'node:assert/strict';

const SOURCE_ALLOWED_KINDS = Object.freeze({
  'wolf-cult': Object.freeze(['fleet-loyalist', 'wolf-agent', 'wolf-cult', 'intelligence-agent', 'android', 'friend']),
  'universal-arbour': Object.freeze(['fleet-loyalist', 'wolf-agent', 'intelligence-agent', 'universal-arbour', 'android', 'friend']),
});
const ADDITIVE_CALLBACKS = Object.freeze(['onSetup', 'onBeforeStart', 'onStarted']);

/**
 * Compose only normal GM-authored records for one explicitly selected printed
 * 20-role optional scenario. The role-to-kind plan is ephemeral proof state:
 * callers must not persist it or include it in evidence.
 */
export function buildExplicitLoyaltyScenarioPlan(rosterRoleIds, mode) {
  assert.ok(Array.isArray(rosterRoleIds), 'Use the ordinarily admitted actor roster.');
  assert.ok(Object.hasOwn(SOURCE_ALLOWED_KINDS, mode), 'Choose one supported explicit printed scenario.');
  assert.ok(rosterRoleIds.every(roleId => typeof roleId === 'string' && roleId.length > 0));
  assert.equal(new Set(rosterRoleIds).size, rosterRoleIds.length, 'The ordinary admitted role roster must be unique.');
  assert.equal(rosterRoleIds.length, 21, 'The proof scenario uses exactly 20 confirmed core roles and one claimed Press Officer.');
  assert.equal(rosterRoleIds.filter(roleId => roleId === 'press-officer').length, 1,
    'Use exactly one ordinary claimed Press Officer.');
  const coreRoleIds = rosterRoleIds.filter(roleId => roleId !== 'press-officer');
  assert.equal(coreRoleIds.length, 20, 'The printed optional proof is a 20-role setup.');

  const primaryRoles = mode === 'wolf-cult'
    ? [
      { holderRoleId: coreRoleIds[0], kind: 'wolf-agent' },
      { holderRoleId: coreRoleIds[1], kind: 'wolf-cult' },
    ]
    : [
      { holderRoleId: coreRoleIds[0], kind: 'universal-arbour' },
      { holderRoleId: coreRoleIds[1], kind: 'wolf-agent' },
      { holderRoleId: coreRoleIds[2], kind: 'wolf-agent' },
    ];
  const intelligenceRoleIndex = mode === 'wolf-cult' ? 2 : 3;
  primaryRoles.push(
    { holderRoleId: coreRoleIds[intelligenceRoleIndex], kind: 'intelligence-agent' },
    { holderRoleId: coreRoleIds[intelligenceRoleIndex + 1], kind: 'android' },
    { holderRoleId: 'press-officer', kind: 'friend', partnerRoleId: coreRoleIds[intelligenceRoleIndex + 2] },
  );
  const covered = new Set(primaryRoles.flatMap(item => [item.holderRoleId, ...(item.partnerRoleId ? [item.partnerRoleId] : [])]));
  for (const roleId of rosterRoleIds) {
    if (!covered.has(roleId)) primaryRoles.push({ holderRoleId: roleId, kind: 'fleet-loyalist' });
  }
  assert.equal(new Set(primaryRoles.map(item => item.holderRoleId)).size, primaryRoles.length,
    'Each callable request has one unique primary target.');
  assert.equal(new Set(primaryRoles.flatMap(item => [item.holderRoleId, ...(item.partnerRoleId ? [item.partnerRoleId] : [])])).size,
    rosterRoleIds.length, 'Requests cover every current core holder and claimed Press Officer once.');
  assert.deepEqual(new Set(primaryRoles.map(item => item.kind)), new Set(SOURCE_ALLOWED_KINDS[mode]));
  assert.equal(primaryRoles.filter(item => item.kind === 'friend').length, 1,
    'Use one normal reciprocal Friend request, with the stable Press holder paired to a core holder.');
  assert.equal(primaryRoles.filter(item => item.kind === 'wolf-agent' || item.kind === 'wolf-cult').length, 2,
    'Both optional 20-role configurations keep exactly two printed Wolf identities.');
  return primaryRoles;
}

/** Only aggregate non-identity counts belong in proof evidence. */
export function summarizeExplicitLoyaltyScenarioPlan(plan, mode) {
  assert.ok(Object.hasOwn(SOURCE_ALLOWED_KINDS, mode));
  assert.ok(Array.isArray(plan));
  const coveredHolders = new Set(plan.flatMap(item => [item.holderRoleId, ...(item.partnerRoleId ? [item.partnerRoleId] : [])]));
  return {
    mode,
    holderCount: coveredHolders.size,
    requestCount: plan.length,
    coverageComplete: coveredHolders.size === 21,
    printedWolfCount: plan.filter(item => item.kind === 'wolf-agent' || item.kind === 'wolf-cult').length,
    wolfAgentCount: plan.filter(item => item.kind === 'wolf-agent').length,
    wolfCultCount: plan.filter(item => item.kind === 'wolf-cult').length,
    universalArbourCount: plan.filter(item => item.kind === 'universal-arbour').length,
    friendPairCount: plan.filter(item => item.kind === 'friend' && item.partnerRoleId).length,
    sourceAllowedKinds: [...SOURCE_ALLOWED_KINDS[mode]],
  };
}

/**
 * Gate a first optional assignment on an authenticated, current GM read of the
 * absent census plus the actual fresh Cycle 0 setup. Return an explicit
 * allowlist so evidence cannot accidentally include private rows or identities.
 */
export function assertFreshOptionalLoyaltySetup(snapshot, expected) {
  assert.ok(snapshot && typeof snapshot === 'object');
  assert.ok(expected && typeof expected === 'object');
  assert.ok(Object.hasOwn(SOURCE_ALLOWED_KINDS, expected.mode), 'Choose one supported optional scenario.');
  assert.equal(typeof expected.sessionId, 'string');
  assert.ok(expected.sessionId.length > 0);
  assert.equal(snapshot.sessionId, expected.sessionId, 'The live GM projection must belong to this fresh session.');
  assert.equal(snapshot.sameAuthenticatedGm, true, 'Use the current real authenticated GM identity.');
  assert.equal(snapshot.ownedGmInstance, true, 'Use the current GM-owned instance.');
  assert.equal(snapshot.connection, 'live');
  assert.equal(snapshot.freshness, 'server', 'Use current server state, never persisted cache.');
  assert.equal(snapshot.currentTurn, 0, 'Assignments occur in the genuine Cycle 0 setup.');
  assert.ok(['lobby', 'casting'].includes(snapshot.phase), 'Setup must remain unlocked before Cycle 1.');
  assert.equal(snapshot.fullGameDemoStatus, 'preparing', 'Only the protected prepared training session is eligible.');
  assert.equal(snapshot.setupConfirmed, true, 'The ordinary printed roster must already be confirmed.');
  assert.equal(snapshot.activeCoreRoleCount, 20, 'The confirmed setup must contain the complete 20-role core roster.');
  assert.equal(snapshot.confirmedActorCount, 21, 'The manager must show all 20 real core accounts and the claimed Press account.');
  assert.equal(snapshot.censusStatus, 'empty', 'Wait for the live GM census to confirm absence before the first assignment.');
  assert.equal(snapshot.censusRecordCount, 0, 'The confirmed-empty census must contain no configured private records.');
  assert.equal(snapshot.wolfCultEnabled, expected.mode === 'wolf-cult', 'The session configuration must retain the explicitly selected printed option.');
  assert.equal(snapshot.universalArbourEnabled, expected.mode === 'universal-arbour',
    'The session configuration must retain only one mutually exclusive optional scenario.');

  return {
    censusStatus: 'empty', censusRecordCount: 0, mode: expected.mode,
    liveGmAuthority: true, freshCycleZeroSetup: true,
    configuredCoreRoleCount: 20, confirmedActorCount: 21,
  };
}

/** Merge the proof hooks after existing driver hooks without replacing runEnding or other options. */
export function mergeOptionalLoyaltyCallbacks(driverOptions, proofCallbacks) {
  assert.ok(driverOptions && typeof driverOptions === 'object');
  assert.ok(proofCallbacks && typeof proofCallbacks === 'object');
  assert.ok(Object.keys(proofCallbacks).every(name => ADDITIVE_CALLBACKS.includes(name)),
    'Only the explicitly additive fresh-game driver hooks may be composed here.');
  const merged = { ...driverOptions };
  for (const name of ADDITIVE_CALLBACKS) {
    const existing = driverOptions[name];
    const additional = proofCallbacks[name];
    if (existing !== undefined) assert.equal(typeof existing, 'function', `${name} must be callable.`);
    if (additional !== undefined) assert.equal(typeof additional, 'function', `${name} must be callable.`);
    if (existing && additional) {
      merged[name] = async context => {
        await existing(context);
        return additional(context);
      };
    } else if (additional) merged[name] = additional;
  }
  return merged;
}
