import { describe, expect, it, vi } from 'vitest';
import { ROLE_OWNED_CRAFT_CATALOG } from './craftOwnership';
import { drawShipDamage } from './shipDamage';
import { applyWolfFleetDamage, type WolfFleetTargetId } from './wolfCombatMath';

const shuttleIds = ROLE_OWNED_CRAFT_CATALOG
  .filter((craft) => craft.kind === 'shuttle')
  .map((craft) => craft.id);

describe('registered shuttle damage immunity', () => {
  it.each(shuttleIds)('rejects environmental ship damage for %s before sampling a card', (shuttleId) => {
    const random = vi.fn(() => 0);
    expect(() => drawShipDamage(
      shuttleId,
      { damagedSystemIds: [], destroyed: false },
      random,
    )).toThrow(/no implemented damage deck/i);
    expect(random).not.toHaveBeenCalled();
  });

  it.each(shuttleIds)('rejects Wolf fleet damage for %s before sampling a card', (shuttleId) => {
    const random = vi.fn(() => 0);
    expect(() => applyWolfFleetDamage(
      shuttleId as WolfFleetTargetId,
      1,
      { damage: { damagedSystemIds: [], destroyed: false }, population: 1 },
      random,
    )).toThrow(/no implemented damage deck/i);
    expect(random).not.toHaveBeenCalled();
  });
});
