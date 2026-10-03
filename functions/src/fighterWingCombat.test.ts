import { describe, expect, it, vi } from 'vitest';
import { CORE_WOLF_TARGET_RING, EXPANDED_WOLF_TARGET_RING } from './wolfCombatMath';
import {
  initialAegisFighterWingAttack,
  launchAegisFighterWing,
  resolveAegisFighterWingMedium,
  resolveAegisFighterWingShort,
} from './fighterWingCombat';

function dice(...values: number[]): (upperBound: number) => number {
  let index = 0;
  return (upperBound) => {
    const value = values[index++];
    if (value === undefined) throw new Error('The test ran out of dice.');
    if (value < 1 || value > upperBound) throw new Error(`Unexpected die ${value}.`);
    return value - 1;
  };
}

const identity = { attackId: 'wolf-attack-4', cycle: 4 } as const;

describe('authoritative Alpha and Bravo fighter combat state', () => {
  it('keeps per-wing launch independent and requires that wing’s own charged, undamaged bay', () => {
    const initial = initialAegisFighterWingAttack({
      ...identity,
      counts: { 'fighter-wing-alpha': 4, 'fighter-wing-bravo': 6 },
    });
    const alpha = launchAegisFighterWing(initial, {
      expectedRevision: 0, ...identity, wingId: 'fighter-wing-alpha', bayCharged: true, bayDamaged: false,
    });

    expect(alpha.wings['fighter-wing-alpha']).toMatchObject({ launched: true, fighters: 4 });
    expect(alpha.wings['fighter-wing-bravo']).toMatchObject({ launched: false, fighters: 6 });
    expect(() => launchAegisFighterWing(alpha, {
      expectedRevision: 1, ...identity, wingId: 'fighter-wing-bravo', bayCharged: false, bayDamaged: false,
    })).toThrow(/charge/i);
    expect(() => launchAegisFighterWing(alpha, {
      expectedRevision: 1, ...identity, wingId: 'fighter-wing-bravo', bayCharged: true, bayDamaged: true,
    })).toThrow(/damaged/i);
  });

  it('lets each launched Medium fighter choose one target shift or one attack, with printed wraparound', () => {
    const initial = initialAegisFighterWingAttack({ ...identity, counts: { 'fighter-wing-alpha': 2, 'fighter-wing-bravo': 0 } });
    const launched = launchAegisFighterWing(initial, {
      expectedRevision: 0, ...identity, wingId: 'fighter-wing-alpha', bayCharged: true, bayDamaged: false,
    });
    const result = resolveAegisFighterWingMedium(launched, {
      expectedRevision: 1, ...identity, wingId: 'fighter-wing-alpha', targetRing: CORE_WOLF_TARGET_RING,
      actions: [
        { fighterIndex: 0, kind: 'target-shift', targetInstanceId: '2:wolf-frigate', targetNumber: 1, shift: -1 },
        { fighterIndex: 1, kind: 'attack', targetInstanceId: '3:wolf-dreadnought' },
      ],
      random: dice(5),
    });

    expect(result.targetShifts).toEqual([{
      fighterIndex: 0, targetInstanceId: '2:wolf-frigate', from: 1, to: 0,
    }]);
    expect(result.attacks).toEqual([{
      fighterIndex: 1, targetInstanceId: '3:wolf-dreadnought', die: 5, hit: true, damage: 1,
    }]);
    expect(result.state.wings['fighter-wing-alpha']).toMatchObject({ mediumResolved: true, fighters: 2 });
    expect(() => resolveAegisFighterWingMedium(result.state, {
      expectedRevision: 2, ...identity, wingId: 'fighter-wing-alpha', targetRing: CORE_WOLF_TARGET_RING,
      actions: [{ fighterIndex: 0, kind: 'attack', targetInstanceId: '3:wolf-dreadnought' }], random: dice(5),
    })).toThrow(/already resolved/i);
  });

  it('rejects using one fighter twice in a Medium choice and rejects an unlaunched wing', () => {
    const initial = initialAegisFighterWingAttack({ ...identity, counts: { 'fighter-wing-alpha': 2, 'fighter-wing-bravo': 2 } });
    expect(() => resolveAegisFighterWingMedium(initial, {
      expectedRevision: 0, ...identity, wingId: 'fighter-wing-alpha', targetRing: CORE_WOLF_TARGET_RING,
      actions: [{ fighterIndex: 0, kind: 'attack', targetInstanceId: '0:wolf-frigate' }], random: dice(5),
    })).toThrow(/launch/i);

    const launched = launchAegisFighterWing(initial, {
      expectedRevision: 0, ...identity, wingId: 'fighter-wing-alpha', bayCharged: true, bayDamaged: false,
    });
    expect(() => resolveAegisFighterWingMedium(launched, {
      expectedRevision: 1, ...identity, wingId: 'fighter-wing-alpha', targetRing: CORE_WOLF_TARGET_RING,
      actions: [
        { fighterIndex: 0, kind: 'attack', targetInstanceId: '0:wolf-frigate' },
        { fighterIndex: 0, kind: 'target-shift', targetInstanceId: '1:wolf-dreadnought', targetNumber: 2, shift: 1 },
      ],
      random: dice(5),
    })).toThrow(/only once/i);
  });

  it('applies Short losses to only the selected wing, after one roll per committed fighter', () => {
    const initial = initialAegisFighterWingAttack({ ...identity, counts: { 'fighter-wing-alpha': 4, 'fighter-wing-bravo': 4 } });
    const launched = launchAegisFighterWing(initial, {
      expectedRevision: 0, ...identity, wingId: 'fighter-wing-alpha', bayCharged: true, bayDamaged: false,
    });
    const result = resolveAegisFighterWingShort(launched, {
      expectedRevision: 1, ...identity, wingId: 'fighter-wing-alpha', fighterIndexes: [0, 1, 2, 3],
      random: dice(1, 2, 3, 6),
    });

    expect(result.rolls).toEqual([
      { fighterIndex: 0, die: 1, hit: false, destroyed: true },
      { fighterIndex: 1, die: 2, hit: false, destroyed: true },
      { fighterIndex: 2, die: 3, hit: true, destroyed: false },
      { fighterIndex: 3, die: 6, hit: true, destroyed: false },
    ]);
    expect(result).toMatchObject({ losses: 2, state: { revision: 2, wings: {
      'fighter-wing-alpha': { fighters: 2, losses: 2, shortResolved: true },
      'fighter-wing-bravo': { fighters: 4, losses: 0, shortResolved: false },
    } } });
  });

  it('rejects stale attack identities and revisions before consuming randomness', () => {
    const initial = initialAegisFighterWingAttack({ ...identity, counts: { 'fighter-wing-alpha': 1, 'fighter-wing-bravo': 0 } });
    const launched = launchAegisFighterWing(initial, {
      expectedRevision: 0, ...identity, wingId: 'fighter-wing-alpha', bayCharged: true, bayDamaged: false,
    });
    const random = vi.fn(dice(5));
    expect(() => resolveAegisFighterWingMedium(launched, {
      expectedRevision: 1, attackId: 'old-attack', cycle: 3, wingId: 'fighter-wing-alpha', targetRing: CORE_WOLF_TARGET_RING,
      actions: [{ fighterIndex: 0, kind: 'attack', targetInstanceId: '0:wolf-frigate' }], random,
    })).toThrow(/different Wolf attack/i);
    expect(random).not.toHaveBeenCalled();
  });

  it('uses the configured seven-target ring instead of the six-target endpoint aliases', () => {
    const initial = initialAegisFighterWingAttack({ ...identity, counts: { 'fighter-wing-alpha': 1, 'fighter-wing-bravo': 0 } });
    const launched = launchAegisFighterWing(initial, {
      expectedRevision: 0, ...identity, wingId: 'fighter-wing-alpha', bayCharged: true, bayDamaged: false,
    });
    const result = resolveAegisFighterWingMedium(launched, {
      expectedRevision: 1, ...identity, wingId: 'fighter-wing-alpha', targetRing: EXPANDED_WOLF_TARGET_RING,
      actions: [{ fighterIndex: 0, kind: 'target-shift', targetInstanceId: '0:wolf-frigate', targetNumber: 1, shift: -1 }],
      random: dice(),
    });

    expect(result.targetShifts).toEqual([{
      fighterIndex: 0, targetInstanceId: '0:wolf-frigate', from: 1, to: 7,
    }]);
  });
});
