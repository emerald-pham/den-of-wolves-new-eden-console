import { describe, expect, it } from 'vitest';
import {
  initialMaliadesState,
  launchMaliades,
  parseMaliadesState,
  repairMaliades,
  resolveMaliadesMedium,
  resolveMaliadesShort,
} from './maliadesState';

function dice(...values: number[]): (upperBound: number) => number {
  let index = 0;
  return (upperBound) => {
    const value = values[index++];
    if (value === undefined) throw new Error('The test ran out of dice.');
    if (value < 1 || value > upperBound) throw new Error(`Unexpected die ${value}.`);
    return value - 1;
  };
}

function launched() {
  return launchMaliades(initialMaliadesState(), { expectedRevision: 0, launchAllowed: true });
}

describe('authoritative Maliades state', () => {
  it('starts immutable and admits one authorized launch', () => {
    const initial = initialMaliadesState();
    expect(initial).toMatchObject({ revision: 0, launched: false, damage: 0, destroyed: false, medium: null, short: null });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(launchMaliades(initial, { expectedRevision: 0, launchAllowed: true })).toMatchObject({
      revision: 1, launched: true, damage: 0, destroyed: false,
    });
    expect(() => launchMaliades(initial, { expectedRevision: 0, launchAllowed: false })).toThrow(/launch check/i);
  });

  it('rejects stale and replayed launch transitions without changing state', () => {
    const state = launched();
    expect(() => launchMaliades(state, { expectedRevision: 0, launchAllowed: true })).toThrow(/changed/i);
    expect(() => launchMaliades(state, { expectedRevision: 1, launchAllowed: true })).toThrow(/already launched/i);
  });

  it('persists the Medium choice and only takes printed self-risk on a failed attack die', () => {
    const state = launched();
    const result = resolveMaliadesMedium(state, {
      expectedRevision: 1,
      choices: [
        { kind: 'target-shift', targetId: 'wolf-1', shift: -1 },
        { kind: 'attack', targetId: 'wolf-2' },
      ],
      random: dice(4),
    });
    expect(result.resolution).toEqual({
      targetShift: { targetId: 'wolf-1', shift: -1 },
      attack: { targetId: 'wolf-2', die: 4, hit: true, selfDamage: 0 },
    });
    expect(result.state).toMatchObject({ revision: 2, launched: true, damage: 0, destroyed: false });
    expect(Object.isFrozen(result.state.medium)).toBe(true);
    expect(() => resolveMaliadesMedium(result.state, {
      expectedRevision: 2, choices: [{ kind: 'attack', targetId: 'wolf-3' }], random: dice(1),
    })).toThrow(/already resolved/i);
  });

  it('round-trips a target-shift-only Medium choice through the canonical state shape', () => {
    const result = resolveMaliadesMedium(launched(), {
      expectedRevision: 1,
      choices: [{ kind: 'target-shift', targetId: 'wolf-1', shift: 1 }],
      random: dice(),
    });
    expect(parseMaliadesState(result.state)).toEqual(result.state);
    expect(parseMaliadesState(result.state)?.medium).toEqual({
      targetShift: { targetId: 'wolf-1', shift: 1 },
      attack: null,
    });
  });

  it('allows one printed Medium attack to add one damage risk and destroys at three', () => {
    let state = launched();
    state = resolveMaliadesShort(state, {
      expectedRevision: 1, targetIds: ['wolf-a', 'wolf-b'], random: dice(1, 1),
    }).state;
    expect(state).toMatchObject({ revision: 2, damage: 2, destroyed: false, short: { selfDamage: 2 } });
    state = resolveMaliadesMedium(state, {
      expectedRevision: 2, choices: [{ kind: 'attack', targetId: 'wolf-c' }], random: dice(2),
    }).state;
    expect(state).toMatchObject({ revision: 3, damage: 3, destroyed: true });
    expect(() => resolveMaliadesShort(state, { expectedRevision: 3, targetIds: ['wolf-d'], random: dice(2) })).toThrow(/destroyed/i);
    expect(() => repairMaliades(state, {
      expectedRevision: 3, fuelled: true, damageToRepair: 1, materialsAvailable: 1,
    })).toThrow(/destroyed/i);
  });

  it('repairs only selected existing damage when fuel and materials are authoritative', () => {
    let state = launched();
    state = resolveMaliadesShort(state, {
      expectedRevision: 1, targetIds: ['wolf-a', 'wolf-b'], random: dice(1, 3),
    }).state;
    const repaired = repairMaliades(state, {
      expectedRevision: 2, fuelled: true, damageToRepair: 1, materialsAvailable: 4,
    });
    expect(repaired).toMatchObject({ materialsRemaining: 3, state: { revision: 3, damage: 0, destroyed: false } });
    expect(() => repairMaliades(state, {
      expectedRevision: 2, fuelled: false, damageToRepair: 1, materialsAvailable: 1,
    })).toThrow(/Fuel/i);
    expect(() => repairMaliades(state, {
      expectedRevision: 1, fuelled: true, damageToRepair: 1, materialsAvailable: 1,
    })).toThrow(/changed/i);
  });

  it('keeps Short risk independent and enforces its two-target limit and thresholds', () => {
    const result = resolveMaliadesShort(launched(), {
      expectedRevision: 1, targetIds: ['wolf-a', 'wolf-b'], random: dice(1, 2),
    });
    expect(result.resolution).toEqual({
      rolls: [
        { targetId: 'wolf-a', die: 1, hit: false, selfDamage: 1 },
        { targetId: 'wolf-b', die: 2, hit: true, selfDamage: 0 },
      ],
      selfDamage: 1,
    });
    expect(result.state).toMatchObject({ revision: 2, damage: 1, short: result.resolution });
    expect(() => resolveMaliadesShort(launched(), {
      expectedRevision: 1, targetIds: ['wolf-a', 'wolf-a'], random: dice(2),
    })).toThrow(/distinct/i);
    expect(() => resolveMaliadesShort(launched(), {
      expectedRevision: 1, targetIds: ['a', 'b', 'c'], random: dice(2, 2),
    })).toThrow(/two targets/i);
  });

  it('rejects malformed persisted state and accepts the canonical immutable state', () => {
    expect(parseMaliadesState({ ...initialMaliadesState(), damage: 3, destroyed: false })).toBeNull();
    expect(parseMaliadesState({ ...initialMaliadesState(), launched: true })).toBeNull();
    expect(parseMaliadesState({ ...initialMaliadesState(), revision: 1 })).toBeNull();
    expect(parseMaliadesState({ ...initialMaliadesState(), revision: 4 })).toBeNull();
    expect(parseMaliadesState({ ...launched(), revision: 1, medium: { attack: {
      targetId: 'wolf-1', die: 1, hit: true, selfDamage: 0,
    }, targetShift: null } })).toBeNull();
    const parsed = parseMaliadesState(launched());
    expect(parsed).toEqual(launched());
    expect(Object.isFrozen(parsed)).toBe(true);
  });
});
