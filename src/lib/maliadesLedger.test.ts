import { describe, expect, it } from 'vitest';
import { parseMaliadesState } from './maliadesLedger';

describe('parseMaliadesState', () => {
  it('returns an immutable unlaunched state when the legacy field is absent', () => {
    const state = parseMaliadesState(undefined);
    expect(state).toEqual({ revision: 0, attackId: null, attackCycle: null, launched: false, damage: 0, destroyed: false, medium: null, short: null });
  });

  it('accepts a canonical launch and resolution projection', () => {
    expect(parseMaliadesState({
      revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 1, destroyed: false,
      medium: { targetShift: { targetId: 'wolf-1', shift: 1 }, attack: null },
      short: null,
    })).toMatchObject({ revision: 2, launched: true, damage: 1 });
  });

  it('fails closed for forged or impossible snapshots', () => {
    expect(parseMaliadesState({ revision: 1, attackId: 'attack-2', attackCycle: 2, launched: false, damage: 0, destroyed: false, medium: null, short: null })).toMatchObject({ attackId: 'attack-2' });
    expect(parseMaliadesState({
      revision: 2, attackId: null, attackCycle: 2, launched: true, damage: 1, destroyed: false,
      medium: null, short: null,
    })).toBeUndefined();
    expect(parseMaliadesState({
      revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 0, destroyed: false,
      medium: { targetShift: null, attack: { targetId: 'wolf-1', die: 1, hit: true, selfDamage: 0 } },
      short: null,
    })).toBeUndefined();
  });
});
