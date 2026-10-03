import { expect, it } from 'vitest';
import { navigationState } from './navigationProjection';
import { planFleetPartition } from './fleetPartition';
import { planKnownSystemSharing } from './fleetGroupOperations';

it('automatically rejoins only groups at the same authoritative system and keeps the highest recorded pursuit', () => {
  const ships = ['aegis', 'dione', 'icebreaker'];
  const groups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['alice'] },
    { id: 'fleet-2', vesselIds: ['dione'], memberUids: ['bob'] },
    { id: 'fleet-3', vesselIds: ['icebreaker'], memberUids: ['cara'] },
  ];
  const nav = navigationState({ shipGalacticCoordinates: { aegis: '1413', dione: '1413', icebreaker: '0000' },
    pursuitGroups: { 'fleet-1': 3, 'fleet-2': 5, 'fleet-3': 1 } }, ships);
  const plan = planFleetPartition(nav, groups,
    [{ uid: 'alice', groupId: 'fleet-1', shipId: 'aegis' }, { uid: 'bob', groupId: 'fleet-2', shipId: 'dione' },
      { uid: 'cara', groupId: 'fleet-3', shipId: 'icebreaker' }], ships);
  expect(plan.groups).toEqual([
    { id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['alice', 'bob'], mergedGroupIds: ['fleet-2'] },
    { id: 'fleet-3', vesselIds: ['icebreaker'], memberUids: ['cara'] },
  ]);
  expect(plan.navigation.pursuitGroups).toEqual({ 'fleet-1': 5, 'fleet-3': 1 });
  expect(plan.rejoins).toEqual([{ coordinate: '1413', survivingGroupId: 'fleet-1', absorbedGroupIds: ['fleet-2'], pursuitBefore: { 'fleet-1': 3, 'fleet-2': 5 }, pursuitAfter: 5 }]);
  expect(plan.memberGroups).toEqual({ alice: 'fleet-1', bob: 'fleet-1', cara: 'fleet-3' });
});

it('shares only server-owned scanned coordinates to an explicit current-group ship subset', () => {
  const plan = planKnownSystemSharing({
    groups: [
      { id: 'fleet-1', vesselIds: ['aegis', 'dione', 'icebreaker'], memberUids: ['alice', 'bob'] },
      { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['cara'] },
    ],
    currentGroupId: 'fleet-1',
    senderShipId: 'aegis',
    knownCoordinates: ['0000', '1413'],
    requestedCoordinate: '1413',
    requestedRecipientShipIds: ['dione'],
    scoutedCoordinatesByShip: { aegis: ['1413'], dione: [], icebreaker: [] },
  });
  expect(plan).toEqual({ coordinate: '1413', senderShipId: 'aegis', groupId: 'fleet-1',
    recipientShipIds: ['dione'], nextScoutedCoordinatesByShip: { aegis: ['1413'], dione: ['1413'], icebreaker: [] } });
  expect(() => planKnownSystemSharing({ groups: [{ id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['alice'] }],
    currentGroupId: 'fleet-1', senderShipId: 'aegis', knownCoordinates: ['0000'], requestedCoordinate: '1413',
    requestedRecipientShipIds: ['aegis'], scoutedCoordinatesByShip: {} })).toThrow(/known|scanned/i);
  expect(() => planKnownSystemSharing({ groups: [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['alice'] },
    { id: 'fleet-2', vesselIds: ['dione'], memberUids: ['bob'] },
  ], currentGroupId: 'fleet-1', senderShipId: 'aegis', knownCoordinates: ['1413'], requestedCoordinate: '1413',
    requestedRecipientShipIds: ['dione'], scoutedCoordinatesByShip: {} })).toThrow(/group/i);
});
