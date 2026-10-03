import { expect, it } from 'vitest';
import { firstTurnWolfAttackComposition } from './wolfAttackComposition';
import {
  CORE_WOLF_TARGET_RING,
  EXPANDED_WOLF_TARGET_RING,
  resolveWolfTargeting,
} from './wolfCombatMath';
import {
  applyWolfCommanderRerolls,
  commanderTargetingView,
  parseWolfTargetingReceipt,
} from './wolfCommanderRerolls';

it('accepts the canonical five-ship receipt while denying arbitrary subsets, reordered rings and out-of-ring dice', () => {
  const ring = CORE_WOLF_TARGET_RING.filter(target => target !== 'dione');
  const receipt = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, ring, () => 0);
  expect(parseWolfTargetingReceipt(receipt)).toEqual(receipt);
  expect(parseWolfTargetingReceipt({ ...receipt, ring: ring.slice(0, 4) })).toBeUndefined();
  expect(parseWolfTargetingReceipt({ ...receipt, ring: [...ring].reverse() })).toBeUndefined();
  expect(parseWolfTargetingReceipt({ ...receipt, rolls: [{ ...receipt.rolls[0], initialDie: 6, finalDie: 6 }, ...receipt.rolls.slice(1)] })).toBeUndefined();
});

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

it('exposes a closed reroll window without re-publishing any reroll choices', () => {
  const receipt = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, CORE_WOLF_TARGET_RING, () => 1);
  const view = commanderTargetingView('s1', 2, 4, receipt, true);

  expect(view).toMatchObject({
    rerollsFinalized: true,
    eligibleRerollIndexes: [],
    rerolledIndexes: [],
  });
  expect(JSON.stringify(view)).not.toMatch(/initialDie|finalDie|modifierOrder|damage|private/i);
});
