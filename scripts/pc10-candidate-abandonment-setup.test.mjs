import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { candidateAbandonmentShips } from './pc10-fresh-minimum-ring-proof.mjs';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
const { activeVesselIdsForRoles } = require('../functions/lib/gameSetup.js');

// Real current server configuration functions; the member/group observations
// are a labeled source-level fixture of the original native eight-role setup.
function sourceSetup() {
  const activeRoleIds = [...recommendedRoleIds(8)];
  const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
  return { session: { playerCount: 8, activeRoleIds, activeVesselIds, phase: 'active', currentTurn: 1 },
    member: { sessionId: 'original-session', meSessionId: 'original-session', uidHash: 'original-miner',
      fleetGroupId: 'fleet-1', hasAuth: true, sameActor: true, playerRole: 'player',
      assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', seatId: 'icebreaker-miner',
      connection: 'live', freshness: 'server', currentOwnPlayerConfirmed: true, currentCanonicalSeatOwned: true,
      currentMemberBerthPresent: true, currentMemberBerthMatches: true, memberScopeMatches: true,
      sdkHasServerAuthority: true, sdkResumePending: false, memberVesselCount: 5, cycle: 1, phase: 'active' },
    group: { id: 'fleet-1', vesselIds: [...activeVesselIds], memberUids: ['original-miner-uid'],
      memberShipIds: { 'original-miner-uid': 'icebreaker' } },
    expected: { sessionId: 'original-session', actorUid: 'original-miner-uid', actorUidHash: 'original-miner' } };
}

test('ordinary eight-role source configuration supports its actual five ships and original Icebreaker Miner', () => {
  const input = sourceSetup();
  assert.deepEqual(input.session.activeVesselIds, ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124']);
  assert.deepEqual(candidateAbandonmentShips(input), input.session.activeVesselIds);
});

test('source-bound setup rejects an injected Dione, missing Icebreaker or different eight-role roster', () => {
  const extra = sourceSetup(); extra.session.activeVesselIds.push('dione');
  const missing = sourceSetup(); missing.session.activeVesselIds = missing.session.activeVesselIds.filter(id => id !== 'icebreaker');
  const roles = sourceSetup(); roles.session.activeRoleIds[2] = 'dione-captain';
  for (const input of [extra, missing, roles]) assert.throws(() => candidateAbandonmentShips(input));
});

test('five ships alone cannot pass for a foreign actor, group or stale member entitlement', () => {
  const changed = [
    value => { value.member.uidHash = 'other-miner'; },
    value => { value.group.memberUids = []; },
    value => { value.group.vesselIds = value.group.vesselIds.filter(id => id !== 'icebreaker'); },
    value => { value.group.memberShipIds['original-miner-uid'] = 'shepherd'; },
    value => { value.member.assignedRoleId = 'shepherd-scientist'; },
    value => { value.member.freshness = 'cache'; },
    value => { value.member.sdkResumePending = true; },
  ];
  for (const change of changed) { const input = sourceSetup(); change(input); assert.throws(() => candidateAbandonmentShips(input)); }
});
