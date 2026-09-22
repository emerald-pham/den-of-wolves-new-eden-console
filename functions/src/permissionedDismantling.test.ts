import { describe, expect, it } from 'vitest';
import {
  ENGINEERING_DISMANTLING_CRAFT_IDS,
  PERMISSIONED_DISMANTLING_MATERIALS,
  resolvePermissionedDismantling,
} from './permissionedDismantling';

const base = {
  craftId: 'philia',
  targetShipId: 'dione',
  targetConsoleId: 'reactor',
  targetDamage: { damagedSystemIds: ['storage'], destroyed: false },
  engineeringMaterials: 4,
  targetPlayerConsented: true,
} as const;

describe('permissioned dismantling', () => {
  it('accepts each printed engineering craft and credits three materials', () => {
    for (const craftId of ENGINEERING_DISMANTLING_CRAFT_IDS) {
      expect(resolvePermissionedDismantling({ ...base, craftId })).toEqual({
        damage: { damagedSystemIds: ['storage', 'reactor'], destroyed: false },
        engineeringMaterials: 4 + PERMISSIONED_DISMANTLING_MATERIALS,
      });
    }
  });

  it('requires explicit target-ship consent', () => {
    expect(() => resolvePermissionedDismantling({ ...base, targetPlayerConsented: false }))
      .toThrow(/target-ship player must consent/i);
  });

  it.each([
    ['unknown craft', { craftId: 'macaw' }],
    ['unknown target ship', { targetShipId: 'unknown-ship' }],
    ['unknown console', { targetConsoleId: 'invented-console' }],
    ['already damaged console', { targetDamage: { damagedSystemIds: ['reactor'], destroyed: false } }],
    ['destroyed target', { targetDamage: { damagedSystemIds: [], destroyed: true } }],
    ['duplicate damage', { targetDamage: { damagedSystemIds: ['storage', 'storage'], destroyed: false } }],
    ['negative materials', { engineeringMaterials: -1 }],
    ['malformed damage', { targetDamage: { damagedSystemIds: ['not-a-dione-console'], destroyed: false } }],
  ])('rejects %s without a partial result', (_label, change) => {
    expect(() => resolvePermissionedDismantling({ ...base, ...change })).toThrow();
  });

  it('returns fresh immutable state without changing the input', () => {
    const input = { ...base, targetDamage: { ...base.targetDamage, damagedSystemIds: [...base.targetDamage.damagedSystemIds] } };
    const result = resolvePermissionedDismantling(input);
    expect(result.damage).not.toBe(input.targetDamage);
    expect(result.damage.damagedSystemIds).not.toBe(input.targetDamage.damagedSystemIds);
    expect(input).toEqual(base);
  });
});
