import { describe, expect, it } from 'vitest';
import { capybaraRationSchedule, isPopulationOnPrintedTrack, shipRationSchedule } from './shipPopulation';

it.each([
  ['dione', 90_000, '70001-90000', [0, 5, 11, 16], [0, 5, 10, 13]],
  ['dione', 70_000, '50001-70000', [0, 5, 10, 14], [0, 4, 9, 12]],
  ['icebreaker', 34_000, '25001-35000', [0, 4, 8, 12], [0, 3, 6, 9]],
  ['shepherd', 24_000, '15001-25000', [0, 3, 7, 11], [0, 2, 5, 8]],
  ['quellon', 15_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
  ['refinery-124', 5_000, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
] as const)('matches printed client %s table at %i survivors', (shipId, population, populationBand, food, water) => {
  expect(shipRationSchedule(shipId, population)).toEqual({ populationBand, food, water });
});

describe('Capybara ration replacement schedules', () => {
  it.each([
    [20_000, '15001-20000', [0, 3, 7, 11], [0, 2, 5, 8]],
    [15_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
    [6_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
    [5_000, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
  ] as const)('selects the server-matching schedule at %i survivors',
    (population, populationBand, food, water) => {
      expect(capybaraRationSchedule(population)).toEqual({ populationBand, food, water });
    });
  it('distinguishes printed markers from exact rescue counts and rejects capacity overflow', () => {
    expect(isPopulationOnPrintedTrack('capybara', 15_000)).toBe(true);
    expect(isPopulationOnPrintedTrack('capybara', 14_999)).toBe(false);
    expect(capybaraRationSchedule(14_999).populationBand).toBe('5001-15000');
    expect(() => capybaraRationSchedule(20_001)).toThrow(/printed track/i);
  });
});
