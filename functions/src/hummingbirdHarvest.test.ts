import { expect, it } from 'vitest';
import { addHarvestToCargo, parseHummingbirdHarvestState, resolvedHarvestValues } from './hummingbirdHarvest';

it('maps the selected die to food and the other die to water', () => {
  expect(resolvedHarvestValues([2, 5], 0)).toEqual({ food: 2, water: 5 });
  expect(resolvedHarvestValues([2, 5], 1)).toEqual({ food: 5, water: 2 });
  expect(addHarvestToCargo({ food: 3, water: 4 }, [2, 5], 1)).toEqual({ food: 8, water: 6 });
});

it('rejects resolved dice that do not match the persisted allocation', () => {
  expect(parseHummingbirdHarvestState({
    sessionId: 's1', ownerUid: 'u1', turn: 1, hostShipId: 'quellon', revision: 2,
    status: 'resolved', rolls: [2, 5], foodDieIndex: 0, food: 5, water: 2,
    requestId: 'allocate-1', createdAt: 'now', resolvedAt: 'later',
  })).toBeUndefined();
});

it('accepts a pending server roll without client allocation values', () => {
  expect(parseHummingbirdHarvestState({
    sessionId: 's1', ownerUid: 'u1', turn: 1, hostShipId: 'quellon', revision: 1,
    status: 'pending', rolls: [2, 5], requestId: 'roll-1', createdAt: 'now',
  })).toMatchObject({ status: 'pending', rolls: [2, 5], revision: 1 });
});
