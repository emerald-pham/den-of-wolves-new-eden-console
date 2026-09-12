import { describe, expect, it } from 'vitest';
import {
  WOLF_ATTACK_RANGES,
  WOLF_SHIP_CATALOG,
  WOLF_SHIP_IDS,
  wolfShipForId,
  wolfShipsReturningNextAttack,
} from './wolfShipCatalog';

describe('Wolf ship catalog', () => {
  it('contains exactly the six routed Wolf ship cards', () => {
    expect(WOLF_SHIP_CATALOG.map((ship) => ship.id)).toEqual([...WOLF_SHIP_IDS]);
    expect(new Set(WOLF_SHIP_CATALOG.map((ship) => ship.id)).size).toBe(6);
    expect(WOLF_SHIP_CATALOG.map((ship) => ship.damageCapacity)).toEqual([1, 2, 2, 3, 5, 6]);
  });

  it.each(WOLF_SHIP_CATALOG)('$id defines every combat range explicitly', (ship) => {
    expect(Object.keys(ship.ranges).sort()).toEqual([...WOLF_ATTACK_RANGES].sort());
    for (const range of WOLF_ATTACK_RANGES) {
      expect(typeof ship.ranges[range]?.canBeDamaged).toBe('boolean');
      expect(ship.ranges[range]?.ifDestroyed).toBeDefined();
    }
  });

  it('matches every range-specific destruction effect', () => {
    const byId = Object.fromEntries(WOLF_SHIP_CATALOG.map((ship) => [ship.id, ship]));
    expect(byId['wolf-fighter-wing']?.ranges).toEqual({
      long: { canBeDamaged: true, ifDestroyed: { kind: 'no-effect' } },
      medium: { canBeDamaged: true, ifDestroyed: { kind: 'no-effect' } },
      short: { canBeDamaged: true, ifDestroyed: { kind: 'target-damage', amount: 1 } },
    });
    expect(byId['wolf-assault-transport']?.ranges.long.ifDestroyed).toEqual({ kind: 'no-effect' });
    expect(byId['wolf-assault-transport']?.ranges.medium.ifDestroyed).toEqual({ kind: 'no-effect' });
    expect(byId['wolf-assault-transport']?.ranges.short.ifDestroyed).toEqual({ kind: 'no-effect' });
    expect(byId['wolf-destroyer']?.ranges.long.ifDestroyed).toEqual({ kind: 'target-damage', amount: 1 });
    expect(byId['wolf-destroyer']?.ranges.medium.ifDestroyed).toEqual({ kind: 'target-damage', amount: 1 });
    expect(byId['wolf-destroyer']?.ranges.short.ifDestroyed).toEqual({ kind: 'target-damage', amount: 1 });
    expect(byId['wolf-cruiser']?.ranges.long.ifDestroyed).toEqual({ kind: 'no-effect' });
    expect(byId['wolf-cruiser']?.ranges.medium.ifDestroyed).toEqual({ kind: 'target-damage', amount: 1 });
    expect(byId['wolf-cruiser']?.ranges.short.ifDestroyed).toEqual({ kind: 'target-damage', amount: 2 });
    expect(byId['wolf-strikecarrier']?.ranges.long.ifDestroyed).toEqual({ kind: 'target-damage', amount: 2 });
    expect(byId['wolf-strikecarrier']?.ranges.medium.ifDestroyed).toEqual({ kind: 'target-damage', amount: 2 });
    expect(byId['wolf-strikecarrier']?.ranges.short.ifDestroyed).toEqual({ kind: 'target-damage', amount: 2 });
    expect(byId['wolf-battlestation']?.ranges.long.ifDestroyed).toEqual({ kind: 'target-damage', amount: 3 });
    expect(byId['wolf-battlestation']?.ranges.medium.ifDestroyed).toEqual({ kind: 'target-damage', amount: 3 });
    expect(byId['wolf-battlestation']?.ranges.short).toEqual({
      canBeDamaged: false,
      ifDestroyed: { kind: 'cannot-take-damage' },
    });
  });

  it('matches survival effects and the only two return rules', () => {
    expect(wolfShipForId('wolf-fighter-wing')?.ifNotDestroyed)
      .toEqual({ kind: 'target-damage', amount: 1 });
    expect(wolfShipForId('wolf-assault-transport')?.ifNotDestroyed)
      .toEqual({ kind: 'boarding-parties', amount: 4 });
    expect(wolfShipForId('wolf-destroyer')?.ifNotDestroyed)
      .toEqual({ kind: 'target-damage', amount: 2 });
    expect(wolfShipForId('wolf-cruiser')?.ifNotDestroyed)
      .toEqual({ kind: 'target-damage', amount: 3 });
    expect(wolfShipForId('wolf-strikecarrier')?.ifNotDestroyed).toEqual({
      kind: 'target-damage-with-fighter-wing-bonus', amount: 2, fighterWingBonus: 1,
    });
    expect(wolfShipForId('wolf-battlestation')?.ifNotDestroyed)
      .toEqual({ kind: 'target-damage', amount: 3 });
    expect(wolfShipsReturningNextAttack()).toEqual([
      'wolf-fighter-wing', 'wolf-battlestation',
    ]);
  });

  it('fails closed for unknown card IDs', () => {
    expect(wolfShipForId('wolf-unknown')).toBeUndefined();
  });
});
