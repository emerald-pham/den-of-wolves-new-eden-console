import { describe, expect, it } from 'vitest';
import { capybaraRationSchedule } from './shipPopulation';

describe('Capybara ration replacement schedules', () => {
  it.each([
    [20_000, '15001-20000', [0, 3, 7, 11], [0, 2, 5, 8]],
    [15_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
    [5_001, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
    [5_000, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
  ] as const)('selects the server-matching schedule at %i survivors',
    (population, populationBand, food, water) => {
      expect(capybaraRationSchedule(population)).toEqual({ populationBand, food, water });
    });
});
