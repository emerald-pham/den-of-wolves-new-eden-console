import { describe, expect, it } from 'vitest';
import {
  initialFighterWingState,
  launchFighterWing,
  resolveFighterWingMedium,
  resolveFighterWingShort,
  shiftFighterTargetNumber,
} from './fighterWingState';

const launched = (wingId: 'fighter-wing-alpha' | 'fighter-wing-bravo', fighters = 4) =>
  launchFighterWing(initialFighterWingState(wingId, fighters), { bayCharged: true, bayDamaged: false });

function dice(...values: number[]): (upperBound: number) => number {
  let index = 0;
  return (upperBound) => {
    const value = values[index++];
    if (value === undefined) throw new Error('The test ran out of dice.');
    return value < 1 ? value : value - 1;
  };
}

describe('authoritative AEGIS fighter-wing state', () => {
  it('starts Alpha and Bravo as separate state with independent limits', () => {
    const alpha = initialFighterWingState('fighter-wing-alpha', 4);
    const bravo = initialFighterWingState('fighter-wing-bravo', 6, 6);
    expect(alpha).toMatchObject({ wingId: 'fighter-wing-alpha', fighters: 4, capacity: 4, launched: false });
    expect(bravo).toMatchObject({ wingId: 'fighter-wing-bravo', fighters: 6, capacity: 6, launched: false });
    expect(alpha).not.toBe(bravo);
  });

  it('requires each wing to have its own charged, undamaged launch bay', () => {
    const alpha = initialFighterWingState('fighter-wing-alpha', 4);
    expect(() => launchFighterWing(alpha, { bayCharged: false, bayDamaged: false })).toThrow(/Charge/);
    expect(() => launchFighterWing(alpha, { bayCharged: true, bayDamaged: true })).toThrow(/damaged/);
    expect(launchFighterWing(alpha, { bayCharged: true, bayDamaged: false })).toMatchObject({
      wingId: 'fighter-wing-alpha', launched: true, launchedFighterCount: 4,
    });
    expect(launched('fighter-wing-bravo')).toMatchObject({ wingId: 'fighter-wing-bravo', launched: true });
    expect(() => launchFighterWing(initialFighterWingState('fighter-wing-alpha', 0), {
      bayCharged: true, bayDamaged: false,
    })).toThrow(/without fighters/);
  });

  it('keeps Medium target shifts and attacks independent per wing and fighter', () => {
    const alpha = launched('fighter-wing-alpha');
    const result = resolveFighterWingMedium(alpha, [
      { fighterIndex: 0, kind: 'target-shift', targetId: 'wolf-0', targetNumber: 1, shift: -1 },
      { fighterIndex: 1, kind: 'target-shift', targetId: 'wolf-1', targetNumber: 6, shift: 1 },
      { fighterIndex: 2, kind: 'attack', targetId: 'wolf-2' },
    ], dice(5));
    expect(result.targetShifts).toMatchObject([
      { fighterIndex: 0, shiftedTargetNumber: 0 },
      { fighterIndex: 1, shiftedTargetNumber: 7 },
    ]);
    expect(result.attacks).toEqual([{ fighterIndex: 2, targetId: 'wolf-2', die: 5, hit: true }]);
    expect(result.state).toMatchObject({ wingId: 'fighter-wing-alpha', mediumResolved: true, fighters: 4 });
    expect(resolveFighterWingMedium(launched('fighter-wing-bravo'), [
      { fighterIndex: 0, kind: 'attack', targetId: 'wolf-bravo' },
    ], dice(4)).attacks[0]).toMatchObject({ targetId: 'wolf-bravo', die: 4, hit: false });
  });

  it('enforces one Medium action per committed fighter and each wing limit', () => {
    const alpha = launched('fighter-wing-alpha', 2);
    expect(() => resolveFighterWingMedium(alpha, [
      { fighterIndex: 0, kind: 'attack', targetId: 'wolf-0' },
      { fighterIndex: 0, kind: 'attack', targetId: 'wolf-1' },
    ], dice(5))).toThrow(/only one Medium Range action/);
    expect(() => resolveFighterWingMedium(alpha, [
      { fighterIndex: 0, kind: 'attack', targetId: 'wolf-0' },
      { fighterIndex: 1, kind: 'attack', targetId: 'wolf-1' },
      { fighterIndex: 2, kind: 'attack', targetId: 'wolf-2' },
    ], dice(5))).toThrow(/exceeds this wing/);
  });

  it('resolves Short Range hits and losses only within the selected wing', () => {
    const alpha = resolveFighterWingMedium(launched('fighter-wing-alpha'), [], dice()).state;
    const result = resolveFighterWingShort(alpha, [0, 1, 2, 3], dice(1, 2, 3, 6));
    expect(result.rolls).toEqual([
      { fighterIndex: 0, die: 1, hit: false, destroyed: true },
      { fighterIndex: 1, die: 2, hit: false, destroyed: true },
      { fighterIndex: 2, die: 3, hit: true, destroyed: false },
      { fighterIndex: 3, die: 6, hit: true, destroyed: false },
    ]);
    expect(result).toMatchObject({ losses: 2, state: { wingId: 'fighter-wing-alpha', fighters: 2, losses: 2 } });
    expect(launched('fighter-wing-bravo')).toMatchObject({ fighters: 4, losses: 0 });
    expect(() => resolveFighterWingShort(result.state, [0], dice(3))).toThrow(/already resolved/);
  });

  it('accepts only the printed target-number shifts and safe random samples', () => {
    expect(shiftFighterTargetNumber(1, -1)).toBe(0);
    expect(shiftFighterTargetNumber(6, 1)).toBe(7);
    expect(() => shiftFighterTargetNumber(0, 1)).toThrow(/from 1 through 6/);
    expect(() => shiftFighterTargetNumber(2, 0 as -1 | 1)).toThrow(/-1 or 1/);
    const state = launched('fighter-wing-alpha');
    expect(() => resolveFighterWingMedium(state, [
      { fighterIndex: 0, kind: 'attack', targetId: 'wolf-0' },
    ], () => 6)).toThrow(/invalid sample/);
  });
});
