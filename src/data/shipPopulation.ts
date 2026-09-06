/** Printed Capybara track: descending, with unequal gaps between steps. */
export const POPULATION_STEPS: readonly number[] = [
  20000, 18500, 17000, 16000, 15000, 14000, 13000, 12000, 11000, 10000,
  9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000,
  1500, 1250, 1000, 750, 500, 250, 0,
];
export const POPULATION_THRESHOLDS: readonly number[] = [15000, 5000, 0];
export const SHIP_SPECIFICATIONS: Readonly<Record<string, {
  length: string; tonnage: number; crewCapacity: number; passengerCapacity: number;
}>> = {
  capybara: { length: '600m', tonnage: 800000, crewCapacity: 5000, passengerCapacity: 500 },
};

export function populationForShip(shipId: string, stored?: Readonly<Record<string, number>>): number | undefined {
  return shipId === 'capybara' ? stored?.[shipId] ?? 20000 : undefined;
}
