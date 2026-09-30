import { expect, it } from 'vitest';
import { validShuttleEvacuationAmounts } from './shuttleEvacuationService';

it('intersects both printed tracks with the remaining per-cycle allowance', () => {
  expect(validShuttleEvacuationAmounts({
    sourceShipId: 'quellon', destinationShipId: 'capybara',
    sourcePopulation: 30_000, destinationPopulation: 13_000, remaining: 3_000,
  })).toEqual([2_000]);
  expect(validShuttleEvacuationAmounts({
    sourceShipId: 'quellon', destinationShipId: 'capybara',
    sourcePopulation: 30_000, destinationPopulation: 13_000, remaining: 1_999,
  })).toEqual([]);
});

it('offers bounded transfers from exact rescued-survivor counts', () => {
  const amounts = validShuttleEvacuationAmounts({ sourceShipId: 'quellon', destinationShipId: 'capybara',
    sourcePopulation: 29750, destinationPopulation: 13000, remaining: 3000 });
  expect(amounts).toContain(1750);
  expect(amounts).toContain(2000);
  expect(amounts.every(amount => amount > 0 && amount <= 3000)).toBe(true);
});
