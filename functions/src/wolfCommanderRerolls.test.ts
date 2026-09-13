import { expect, it } from 'vitest';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import {
  CORE_WOLF_TARGET_RING,
  EXPANDED_WOLF_TARGET_RING,
  resolveWolfTargeting,
} from './wolfCombatMath';
import { applyWolfCommanderRerolls, parseWolfTargetingReceipt } from './wolfCommanderRerolls';

it('patches only selected rolls and keeps printed Capybara 8 rerolls separate', () => {
  const initial = resolveWolfTargeting(
    firstTurnWolfAttackComposition(), {}, EXPANDED_WOLF_TARGET_RING, () => 0,
  );
  const unselectedBefore = initial.rolls[1];
  const samples = [7, 0];
  const next = applyWolfCommanderRerolls(initial, [0], (upperBound) => {
    const sample = samples.shift() ?? 0;
    expect(sample).toBeLessThan(upperBound);
    return sample;
  });

  expect(next.rolls[0]).toMatchObject({
    initialDie: 1, rerollDie: 1, finalDie: 1, target: 'aegis',
    commanderPrintedRerolls: [8],
    modifiers: ['commander-reroll'],
  });
  expect(next.rolls[1]).toBe(unselectedBefore);
});

it('rejects resolved Capybara d8 values and preserves legitimate C&C redirects', () => {
  const baseRoll = {
    rosterIndex: 0,
    shipId: 'wolf-fighter-wing' as const,
    initialDie: 2,
    finalDie: 2,
    target: 'dione' as const,
    modifiers: [] as const,
  };
  const base = {
    ring: [...CORE_WOLF_TARGET_RING],
    rolls: [baseRoll],
    modifierOrder: ['commander-reroll', 'target-shift', 'command-and-control-redirect'] as const,
  };
  expect(parseWolfTargetingReceipt({
    ...base, rolls: [{ ...baseRoll, finalDie: 8 }],
  })).toBeUndefined();
  expect(parseWolfTargetingReceipt({
    ...base, rolls: [{ ...baseRoll, target: 'shepherd' }],
  })).toBeUndefined();
  expect(parseWolfTargetingReceipt({
    ...base,
    rolls: [{
      ...baseRoll,
      target: 'aegis',
      modifiers: ['command-and-control-redirect'],
    }],
  })).toBeDefined();
});
