import { expect, it } from 'vitest';
import { planFleetTaxiTransfer } from './fleetGroupOperations';

const groups = [
  { id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['alice', 'bob'] },
  { id: 'fleet-2', vesselIds: ['icebreaker', 'shepherd'], memberUids: ['cara'] },
];
it('moves at most two current anchor passengers to the selected destination group in one taxi attempt', () => {
  const plan = planFleetTaxiTransfer({ groups, sourceGroupId: 'fleet-1', targetGroupId: 'fleet-2',
    anchorShipId: 'aegis', targetShipId: 'icebreaker', payload: { kind: 'players', playerUids: ['alice', 'bob'] },
    passengers: [{ uid: 'alice', groupId: 'fleet-1', hostShipId: 'aegis', connected: true },
      { uid: 'bob', groupId: 'fleet-1', hostShipId: 'aegis', connected: true }] });
  expect(plan).toEqual({ kind: 'players', sourceGroupId: 'fleet-1', targetGroupId: 'fleet-2',
    targetShipId: 'icebreaker', playerUids: ['alice', 'bob'],
    groups: [
      { id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: [] },
      { id: 'fleet-2', vesselIds: ['icebreaker', 'shepherd'], memberUids: ['cara', 'alice', 'bob'] },
    ] });
  expect(() => planFleetTaxiTransfer({ groups, sourceGroupId: 'fleet-1', targetGroupId: 'fleet-2',
    anchorShipId: 'aegis', targetShipId: 'icebreaker', payload: { kind: 'players', playerUids: ['alice', 'bob', 'cara'] },
    passengers: ['alice', 'bob', 'cara'].map(uid => ({ uid, groupId: 'fleet-1', hostShipId: 'aegis', connected: true })) })).toThrow(/two/i);
});

it('moves fuel atomically in units of one or two, without changing group membership', () => {
  expect(planFleetTaxiTransfer({ groups, sourceGroupId: 'fleet-1', targetGroupId: 'fleet-2',
    anchorShipId: 'aegis', targetShipId: 'icebreaker', payload: { kind: 'fuel', units: 2 },
    passengers: [], sourceFuel: 3, targetFuel: 1 })).toEqual({ kind: 'fuel', sourceGroupId: 'fleet-1',
      targetGroupId: 'fleet-2', targetShipId: 'icebreaker', units: 2, sourceFuel: 1, targetFuel: 3, groups });
  expect(() => planFleetTaxiTransfer({ groups, sourceGroupId: 'fleet-1', targetGroupId: 'fleet-2',
    anchorShipId: 'aegis', targetShipId: 'icebreaker', payload: { kind: 'fuel', units: 2 },
    passengers: [], sourceFuel: 1, targetFuel: 1 })).toThrow(/fuel/i);
});
