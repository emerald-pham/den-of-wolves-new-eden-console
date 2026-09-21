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
