import { expect, it } from 'vitest';
import { planFleetPartition, reconcilePartitionMember } from './fleetPartition';
import { navigationState } from './navigationProjection';
const vessels = ['aegis', 'dione', 'icebreaker'];
const groups = [{ id: 'fleet-1', vesselIds: vessels, memberUids: ['alice', 'bob', 'gm'] }];
const players = [{ uid: 'alice', groupId: 'fleet-1', shipId: 'aegis' },
  { uid: 'bob', groupId: 'fleet-1', shipId: 'dione' }, { uid: 'gm', groupId: 'fleet-1', shipId: null }];
const navigation = navigationState({ shipGalacticCoordinates: { aegis: '1413', dione: '0000', icebreaker: '0000' },
  pursuitGroups: { 'fleet-1': 2 } }, vessels);
it('partitions the complete current group by authoritative coordinates and preserves private knowledge', () => {
  const state = { ...navigation, missionExploredCoordinatesByUid: { alice: ['1413'] } };
  const plan = planFleetPartition(state, groups, players, vessels);
  expect(plan.groups).toEqual([
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['alice', 'gm'], memberShipIds: { alice: 'aegis' } },
    { id: 'fleet-2', vesselIds: ['dione', 'icebreaker'], memberUids: ['bob'], memberShipIds: { bob: 'dione' } },
  ]);
  expect(plan.navigation.pursuitGroups).toEqual({ 'fleet-1': 2, 'fleet-2': 2 });
  expect(plan.navigation.missionExploredCoordinatesByUid).toEqual({ alice: ['1413'] });
  expect(plan.memberGroups).toEqual({ alice: 'fleet-1', gm: 'fleet-1', bob: 'fleet-2' });
});
it('keeps unrelated partitions unchanged and refuses mismatched authority without guessing membership', () => {
  const plan = planFleetPartition(navigation, groups, players, vessels);
  expect(planFleetPartition(plan.navigation, plan.groups, players.map(p => ({ ...p, groupId: plan.memberGroups[p.uid] })), vessels).groups).toEqual(plan.groups);
  expect(() => planFleetPartition(navigation, groups, players.slice(1), vessels)).toThrow(/membership/i);
  expect(() => planFleetPartition(navigation, groups, players.map(p => ({ ...p, shipId: 'quellon' })), vessels)).toThrow(/ship/i);
});
it('reconnect preserves a member’s group and admits newcomers only into the designated initial group', () => {
  const plan = planFleetPartition(navigation, groups, players, vessels);
  expect(reconcilePartitionMember(plan.groups, 'bob', 'fleet-2').group.id).toBe('fleet-2');
  expect(reconcilePartitionMember(plan.groups, 'new', undefined).groups[1]).toEqual(plan.groups[1]);
  expect(reconcilePartitionMember(plan.groups, 'new', undefined).group.memberUids).toContain('new');
  expect(() => reconcilePartitionMember(plan.groups, 'bob', 'fleet-1')).toThrow(/membership/i);
  expect(() => reconcilePartitionMember(plan.groups, 'new', 'fleet-2')).toThrow(/membership/i);
});

for (const uid of ['__proto__', 'constructor', 'toString', 'player.with.period']) {
  it(`preserves an own fleet binding and stable audience for UID ${uid}`, () => {
    const reservedGroups = [{ id: 'fleet-1', vesselIds: vessels, memberUids: [uid, 'gm'] }];
    const reservedPlayers = [{ uid, groupId: 'fleet-1', shipId: 'dione' },
      { uid: 'gm', groupId: 'fleet-1', shipId: null }];
    const plan = planFleetPartition(navigation, reservedGroups, reservedPlayers, vessels);
    expect(plan.groups[1]?.memberUids).toEqual([uid]);
    expect(Object.hasOwn(plan.memberGroups, uid)).toBe(true);
    expect(plan.memberGroups[uid]).toBe('fleet-2');
    const resumed = planFleetPartition(plan.navigation, plan.groups,
      reservedPlayers.map(player => ({ ...player, groupId: plan.memberGroups[player.uid]! })), vessels);
    expect(resumed.groups).toEqual(plan.groups);
  });
}
