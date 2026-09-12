import { describe, expect, it } from 'vitest';
import {
  INITIAL_SHIP_RESOURCES,
  canAdjustShipCounter,
  isResourceShipId,
  nextResourceAmount,
  unrestChange,
  shipResources,
} from './resources';

describe('authoritative fleet resources', () => {
  it('reserves direct resource changes for an active GM instance', () => {
    expect(canAdjustShipCounter('player', false)).toBe(false);
    expect(canAdjustShipCounter('gm', false)).toBe(false);
    expect(canAdjustShipCounter('gm', true)).toBe(true);
  });

  it('excludes the press shuttle from ships with tracked stores', () => {
    expect(isResourceShipId('aegis')).toBe(true);
    expect(isResourceShipId('snn-press-shuttle')).toBe(false);
  });

  it('initializes every ship with the printed starting stock', () => {
    expect(INITIAL_SHIP_RESOURCES).toEqual({
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
      dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 },
      icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 3, securityTeams: 2 },
      shepherd: { ore: 0, fuel: 4, food: 10, water: 8, materials: 0, securityTeams: 2 },
      quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 },
      'refinery-124': { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
      capybara: {
        ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3,
      },
    });
  });

  it('restores starting stock for legacy sessions and preserves stored values', () => {
    expect(shipResources(undefined)).toEqual(INITIAL_SHIP_RESOURCES);
    expect(shipResources({ aegis: { fuel: 1 } })).toEqual({
      ...INITIAL_SHIP_RESOURCES,
      aegis: { ...INITIAL_SHIP_RESOURCES.aegis, fuel: 1 },
    });
  });

  it('keeps malformed persisted ledgers nonnegative and integer typed without restoring spent stock', () => {
    const inventories = shipResources({
      aegis: {
        fuel: -2,
        food: 1.5,
        water: Number.POSITIVE_INFINITY,
        materials: Number.NaN,
        securityTeams: null,
      },
      capybara: { scrap: -1 },
    });

    expect(inventories.aegis).toMatchObject({
      fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0,
    });
    expect(inventories.capybara?.scrap).toBe(0);
    expect(Object.values(inventories).flatMap(inventory => Object.values(inventory))
      .every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true);
  });

  it('moves resource stock without allowing a negative amount', () => {
    expect(nextResourceAmount(4, 1)).toBe(5);
    expect(nextResourceAmount(0, -1)).toBe(0);
  });

  it('holds unrest at seven and raises or respects the GM alert lock', () => {
    expect(unrestChange(4, 1, false)).toEqual({ kind: 'applied', amount: 5 });
    expect(unrestChange(7, 1, false)).toEqual({ kind: 'overflow', amount: 8 });
    expect(unrestChange(7, -1, true)).toEqual({ kind: 'blocked' });
    expect(unrestChange(8, 1, false)).toEqual({ kind: 'applied', amount: 9 });
    expect(unrestChange(10, 1, false)).toEqual({ kind: 'applied', amount: 10 });
  });
});
