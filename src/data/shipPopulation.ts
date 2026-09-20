import { SHIPS } from './ships';

export interface ShipPopulationTrack {
  readonly steps: readonly number[];
  readonly thresholds: readonly number[];
}

export interface RationSchedule {
  readonly food: readonly [number, number, number, number];
  readonly water: readonly [number, number, number, number];
  readonly populationBand: '15001-20000' | '5001-15000' | '1-5000';
}

const CAPYBARA_RATION_SCHEDULES: Readonly<Record<RationSchedule['populationBand'], RationSchedule>> = {
  '15001-20000': { food: [0, 3, 7, 11], water: [0, 2, 5, 8], populationBand: '15001-20000' },
  '5001-15000': { food: [0, 3, 6, 10], water: [0, 2, 4, 7], populationBand: '5001-15000' },
  '1-5000': { food: [0, 3, 5, 8], water: [0, 2, 3, 6], populationBand: '1-5000' },
};

export function capybaraRationSchedule(population: number): RationSchedule {
  if (!isPopulationOnPrintedTrack('capybara', population)) {
    throw new Error('Capybara population is not on its printed track.');
  }
  if (population <= 5_000) return CAPYBARA_RATION_SCHEDULES['1-5000'];
  if (population <= 15_000) return CAPYBARA_RATION_SCHEDULES['5001-15000'];
  return CAPYBARA_RATION_SCHEDULES['15001-20000'];
}

export const SHIP_POPULATION_TRACKS: Readonly<Record<string, ShipPopulationTrack>> =
  Object.fromEntries(SHIPS.flatMap((ship) => ship.populationTrack ? [[ship.id, ship.populationTrack]] : []));

export const INITIAL_SHIP_SURVIVORS: Readonly<Record<string, number>> =
  Object.fromEntries(SHIPS.map((ship) => [ship.id, ship.printedStatistics.population]));

export const SHIP_SPECIFICATIONS: Readonly<Record<string, {
  length: string; tonnage: number; crewCapacity: number; passengerCapacity: number;
}>> = Object.fromEntries(SHIPS.map((ship) => [ship.id, ship.printedStatistics.capacity]));

export function populationTrackForShip(shipId: string): ShipPopulationTrack | undefined {
  return SHIP_POPULATION_TRACKS[shipId];
}

export function isPopulationOnPrintedTrack(shipId: string, population: unknown): population is number {
  return Number.isSafeInteger(population) &&
    populationTrackForShip(shipId)?.steps.includes(population as number) === true;
}

export function populationForShip(shipId: string, stored?: Readonly<Record<string, number>>): number | undefined {
  return stored?.[shipId] ?? INITIAL_SHIP_SURVIVORS[shipId];
}
