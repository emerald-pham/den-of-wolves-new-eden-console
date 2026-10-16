import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFreshOptionalLoyaltySetup,
  buildExplicitLoyaltyScenarioPlan,
  mergeOptionalLoyaltyCallbacks,
  summarizeExplicitLoyaltyScenarioPlan,
} from './pc10-explicit-loyalty-proof-plan.mjs';

const coreRoles = Array.from({ length: 20 }, (_, index) => `training-role-${index + 1}`);
const roster = [...coreRoles, 'press-officer'];
const safeSetup = mode => ({
  sessionId: 'fresh-session', sameAuthenticatedGm: true, ownedGmInstance: true,
  connection: 'live', freshness: 'server', currentTurn: 0, phase: 'casting',
  fullGameDemoStatus: 'preparing', setupConfirmed: true, activeCoreRoleCount: 20,
  confirmedActorCount: 21, censusStatus: 'empty', censusRecordCount: 0,
  wolfCultEnabled: mode === 'wolf-cult', universalArbourEnabled: mode === 'universal-arbour',
});

function covered(plan) {
  return new Set(plan.flatMap(item => [item.holderRoleId, ...(item.partnerRoleId ? [item.partnerRoleId] : [])]));
}

function counts(plan, kind) {
  return plan.filter(item => item.kind === kind).length;
}

test('fresh 20-role optional scenarios cover all 21 real holders and exactly the two printed Wolf identities', () => {
  const cultPlan = buildExplicitLoyaltyScenarioPlan(roster, 'wolf-cult');
  const arbourPlan = buildExplicitLoyaltyScenarioPlan(roster, 'universal-arbour');
  assert.equal(cultPlan.length, 20);
  assert.equal(arbourPlan.length, 20);
  assert.deepEqual(covered(cultPlan), new Set(roster));
  assert.deepEqual(covered(arbourPlan), new Set(roster));
  assert.equal(counts(cultPlan, 'wolf-agent'), 1);
  assert.equal(counts(cultPlan, 'wolf-cult'), 1);
  assert.equal(counts(arbourPlan, 'wolf-agent'), 2);
  assert.equal(counts(arbourPlan, 'universal-arbour'), 1);
  assert.equal(counts(cultPlan, 'universal-arbour'), 0);
  assert.equal(counts(arbourPlan, 'wolf-cult'), 0);

  const cultFriend = cultPlan.find(item => item.kind === 'friend');
  const arbourFriend = arbourPlan.find(item => item.kind === 'friend');
  assert.equal(cultFriend?.holderRoleId, 'press-officer');
  assert.equal(arbourFriend?.holderRoleId, 'press-officer');
  assert.ok(coreRoles.includes(cultFriend?.partnerRoleId));
  assert.ok(coreRoles.includes(arbourFriend?.partnerRoleId));
  assert.equal(counts(cultPlan, 'friend'), 1, 'Friend is one reciprocal pair, not two independent request rows.');
  assert.equal(counts(arbourPlan, 'friend'), 1);

  const cultSummary = summarizeExplicitLoyaltyScenarioPlan(cultPlan, 'wolf-cult');
  const arbourSummary = summarizeExplicitLoyaltyScenarioPlan(arbourPlan, 'universal-arbour');
  assert.equal(cultSummary.printedWolfCount, 2);
  assert.equal(arbourSummary.printedWolfCount, 2);
  assert.deepEqual(new Set([...cultSummary.sourceAllowedKinds, ...arbourSummary.sourceAllowedKinds]), new Set([
    'fleet-loyalist', 'wolf-agent', 'wolf-cult', 'intelligence-agent', 'universal-arbour', 'android', 'friend',
  ]));
});

test('scenario planning requires a complete fresh 20-role roster with the one normally claimed Press holder', () => {
  assert.throws(() => buildExplicitLoyaltyScenarioPlan([...coreRoles.slice(0, 19), 'press-officer'], 'wolf-cult'), /20|roster/i);
  assert.throws(() => buildExplicitLoyaltyScenarioPlan(coreRoles, 'universal-arbour'), /Press/i);
  assert.throws(() => buildExplicitLoyaltyScenarioPlan([...roster, coreRoles[0]], 'universal-arbour'), /unique|duplicate/i);
  assert.throws(() => buildExplicitLoyaltyScenarioPlan(roster, 'ordinary'), /scenario|mode/i);
});

test('pre-start gate accepts only the live GM authority, preparing marker, selected mode, and server-confirmed empty census', () => {
  for (const mode of ['wolf-cult', 'universal-arbour']) {
    const snapshot = safeSetup(mode);
    const safe = assertFreshOptionalLoyaltySetup(snapshot, { mode, sessionId: 'fresh-session' });
    assert.deepEqual(safe, {
      censusStatus: 'empty', censusRecordCount: 0, mode,
      liveGmAuthority: true, freshCycleZeroSetup: true,
      configuredCoreRoleCount: 20, confirmedActorCount: 21,
    });
    assert.deepEqual(Object.keys(safe).sort(), [
      'censusRecordCount', 'censusStatus', 'confirmedActorCount', 'configuredCoreRoleCount',
      'freshCycleZeroSetup', 'liveGmAuthority', 'mode',
    ].sort(), 'The captured census result is an allowlisted aggregate, not a private-record dump.');
  }

  const invalid = [
    { censusStatus: 'loading' }, { censusStatus: 'error' }, { censusStatus: 'present' },
    { censusRecordCount: 1 }, { sameAuthenticatedGm: false }, { ownedGmInstance: false },
    { connection: 'connecting' }, { freshness: 'cache' }, { currentTurn: 1 }, { phase: 'active' },
    { fullGameDemoStatus: 'active' }, { setupConfirmed: false }, { activeCoreRoleCount: 19 },
    { confirmedActorCount: 20 }, { wolfCultEnabled: true, universalArbourEnabled: true },
  ];
  for (const patch of invalid) {
    assert.throws(() => assertFreshOptionalLoyaltySetup({ ...safeSetup('wolf-cult'), ...patch },
      { mode: 'wolf-cult', sessionId: 'fresh-session' }));
  }
  assert.throws(() => assertFreshOptionalLoyaltySetup(safeSetup('universal-arbour'),
    { mode: 'wolf-cult', sessionId: 'fresh-session' }), /configuration|scenario/i);
});

test('optional proof callbacks compose after existing driver hooks without replacing ending or ordinary driver options', async () => {
  const calls = [];
  const ending = async () => calls.push('ending');
  const base = { playerCount: 20, gameplayOnly: false, runEnding: ending,
    onSetup: async () => calls.push('base-setup'), onBeforeStart: async () => calls.push('base-before'),
    onStarted: async () => calls.push('base-started') };
  const proof = { onSetup: async () => calls.push('proof-setup'),
    onBeforeStart: async () => calls.push('proof-before'), onStarted: async () => calls.push('proof-started') };
  const merged = mergeOptionalLoyaltyCallbacks(base, proof);
  assert.equal(merged.playerCount, 20);
  assert.equal(merged.gameplayOnly, false);
  assert.equal(merged.runEnding, ending);
  await merged.onSetup({}); await merged.onBeforeStart({}); await merged.onStarted({});
  assert.deepEqual(calls, ['base-setup', 'proof-setup', 'base-before', 'proof-before', 'base-started', 'proof-started']);
});
