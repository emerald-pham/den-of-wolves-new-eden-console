import { SHIPS } from './ships';

export interface ShipPopulationTrack {
  readonly steps: readonly number[];
  readonly thresholds: readonly number[];
}

export interface RationSchedule {
  readonly food: readonly [number, number, number, number];
  readonly water: readonly [number, number, number, number];
  readonly populationBand: string;
}

const CAPYBARA_RATION_SCHEDULES: Readonly<Record<'15001-20000' | '5001-15000' | '1-5000', RationSchedule>> = {
  '15001-20000': { food: [0, 3, 7, 11], water: [0, 2, 5, 8], populationBand: '15001-20000' },
  '5001-15000': { food: [0, 3, 6, 10], water: [0, 2, 4, 7], populationBand: '5001-15000' },
  '1-5000': { food: [0, 3, 5, 8], water: [0, 2, 3, 6], populationBand: '1-5000' },
};

// Mirror the authoritative Deluxe A4 Paper Duplex replacement cards in
// functions/src/shipPopulation.ts for the player-facing reference.
const BASE_RATION_SCHEDULES: readonly (RationSchedule & { readonly max: number })[] = [
  { max: 5_000, populationBand: '1-5000', food: [0, 3, 5, 8], water: [0, 2, 3, 6] },
  { max: 15_000, populationBand: '5001-15000', food: [0, 3, 6, 10], water: [0, 2, 4, 7] },
  { max: 25_000, populationBand: '15001-25000', food: [0, 3, 7, 11], water: [0, 2, 5, 8] },
  { max: 35_000, populationBand: '25001-35000', food: [0, 4, 8, 12], water: [0, 3, 6, 9] },
  { max: 50_000, populationBand: '35001-50000', food: [0, 4, 9, 13], water: [0, 4, 7, 10] },
  { max: 70_000, populationBand: '50001-70000', food: [0, 5, 10, 14], water: [0, 4, 9, 12] },
  { max: 90_000, populationBand: '70001-90000', food: [0, 5, 11, 16], water: [0, 5, 10, 13] },
  { max: 100_000, populationBand: '90001-100000', food: [0, 6, 12, 18], water: [0, 6, 11, 14] },
];

export function shipRationSchedule(shipId: string, population: number): RationSchedule {
  if (shipId === 'capybara') return capybaraRationSchedule(population);
  if (!isPopulationOnPrintedTrack(shipId, population)) {
    throw new Error(`${shipId} population is not on its printed track.`);
  }
  const card = BASE_RATION_SCHEDULES.find(schedule => population <= schedule.max);
  if (!card) throw new Error('No printed ration table covers this population.');
  return { populationBand: card.populationBand, food: card.food, water: card.water };
}

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
