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

it('accepts canonical source rings and ordered participating subsets while denying malformed rings and dice', () => {
  const ring = CORE_WOLF_TARGET_RING.filter(target => target !== 'dione');
  const receipt = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, ring, () => 0);
  expect(parseWolfTargetingReceipt(receipt)).toEqual(receipt);
  const grouped = resolveWolfTargeting(firstTurnWolfAttackComposition(), {}, ring.slice(2), () => 0, ring);
  expect(parseWolfTargetingReceipt(grouped)).toEqual(grouped);
  expect(parseWolfTargetingReceipt({ ...grouped, ring: ['refinery-124', 'shepherd'] })).toBeUndefined();
  expect(parseWolfTargetingReceipt({ ...receipt, ring: [...ring].reverse() })).toBeUndefined();
  expect(parseWolfTargetingReceipt({ ...receipt, rolls: [{ ...receipt.rolls[0], initialDie: 6, finalDie: 6 }, ...receipt.rolls.slice(1)] })).toBeUndefined();
});

it('rerolls a nonparticipating source face once into a bounded participating target draw', () => {
  const ring = ['quellon', 'shepherd', 'refinery-124'] as const;
  const bounds: number[] = [];
  const receipt = resolveWolfTargeting(
    firstTurnWolfAttackComposition(), {}, ring, (upperBound) => {
      bounds.push(upperBound);
      return 0;
    }, CORE_WOLF_TARGET_RING,
  );

  expect(bounds.slice(0, 4)).toEqual([6, 3, 6, 3]);
  expect(receipt.rolls[0]).toMatchObject({
    sourceDie: 1, initialDie: 1, target: 'quellon', nonparticipatingTargetRerolls: 1,
  });
  expect(parseWolfTargetingReceipt(receipt)).toEqual(receipt);
});

it('keeps the Capybara d8 face-eight reroll separate from a nonparticipating Capybara target reroll', () => {
  const ring = CORE_WOLF_TARGET_RING;
  const samples = [7, 0, 6, 2];
  const receipt = resolveWolfTargeting(
    firstTurnWolfAttackComposition(), {}, ring, (upperBound) => {
      const sample = samples.shift() ?? 0;
      expect(sample).toBeLessThan(upperBound);
      return sample;
    }, EXPANDED_WOLF_TARGET_RING,
  );

  expect(receipt.rolls[0]).toMatchObject({ initialDie: 1, target: 'aegis', printedRerolls: [8] });
  expect(receipt.rolls[1]).toMatchObject({
    sourceDie: 7, initialDie: 3, target: 'icebreaker', nonparticipatingTargetRerolls: 1,
  });
  expect(parseWolfTargetingReceipt(receipt)).toEqual(receipt);
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
