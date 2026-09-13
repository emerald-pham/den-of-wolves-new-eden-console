import { expect, it } from 'vitest';
import { firstTurnWolfAttackComposition, scheduledWolfAttackComposition } from './wolfAttackComposition';

it('builds the exact first attack and rejects equal-capacity substitutions', () => {
  const first = firstTurnWolfAttackComposition();
  expect(first.shipIds).toHaveLength(15);
  expect(first.counts).toEqual({
    'wolf-fighter-wing': 10, 'wolf-assault-transport': 5,
    'wolf-destroyer': 0, 'wolf-cruiser': 0, 'wolf-strikecarrier': 0, 'wolf-battlestation': 0,
  });
  expect(first.damageCapacity).toBe(20);
  expect(scheduledWolfAttackComposition(1, [...first.shipIds].reverse()).counts).toEqual(first.counts);
  expect(() => scheduledWolfAttackComposition(1, Array<string>(20).fill('wolf-fighter-wing')))
    .toThrow(/ten fighter wings/);
});

it('accepts both later capacity boundaries and rejects the immediately adjacent totals', () => {
  expect(scheduledWolfAttackComposition(2, [
    'wolf-battlestation', 'wolf-battlestation', 'wolf-cruiser',
  ]).damageCapacity).toBe(15);
  const fourStations = Array<string>(4).fill('wolf-battlestation');
  expect(scheduledWolfAttackComposition(8, fourStations).damageCapacity).toBe(24);
  expect(() => scheduledWolfAttackComposition(2, [
    'wolf-battlestation', 'wolf-battlestation', 'wolf-destroyer',
  ])).toThrow(/15 to 24/);
  expect(() => scheduledWolfAttackComposition(2, [...fourStations, 'wolf-fighter-wing']))
    .toThrow(/15 to 24/);
});

it('rejects unknown cards and invalid turns, and isolates a validated roster from later edits', () => {
  for (const turn of [0, -1, 1.5, NaN, Infinity]) {
    expect(() => scheduledWolfAttackComposition(turn, [])).toThrow(/Invalid attack cycle/);
  }
  expect(() => scheduledWolfAttackComposition(2, ['constructor'])).toThrow(/Unknown Wolf ship/);
  expect(() => scheduledWolfAttackComposition(2, [])).toThrow(/15 to 24/);
  expect(() => scheduledWolfAttackComposition(2, Array<string>(25).fill('wolf-fighter-wing')))
    .toThrow(/Invalid attack composition/);
  const input = Array<string>(3).fill('wolf-strikecarrier');
  const result = scheduledWolfAttackComposition(2, input);
  input[0] = 'wolf-fighter-wing';
  expect(result.shipIds).toEqual(Array<string>(3).fill('wolf-strikecarrier'));
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.shipIds)).toBe(true);
  expect(Object.isFrozen(result.counts)).toBe(true);
});
