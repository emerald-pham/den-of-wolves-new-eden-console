import { expect, it } from 'vitest';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import {
  EXPANDED_WOLF_TARGET_RING,
  resolveWolfTargeting,
} from './wolfCombatMath';
import { applyWolfCommanderRerolls } from './wolfCommanderRerolls';

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
