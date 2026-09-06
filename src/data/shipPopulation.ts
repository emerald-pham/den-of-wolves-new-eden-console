export interface ShipPopulationTrack {
  readonly steps: readonly number[];
  readonly thresholds: readonly number[];
}

export const SHIP_POPULATION_TRACKS: Readonly<Record<string, ShipPopulationTrack>> = {
  aegis: {
    steps: [2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0],
    thresholds: [0],
  },
  capybara: {
    steps: [
      20000, 18500, 17000, 16000, 15000, 14000, 13000, 12000, 11000, 10000,
      9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000,
      1500, 1250, 1000, 750, 500, 250, 0,
    ],
    thresholds: [15000, 5000, 0],
  },
};

export const INITIAL_SHIP_SURVIVORS: Readonly<Record<string, number>> =
  Object.fromEntries(Object.entries(SHIP_POPULATION_TRACKS).map(([shipId, track]) => [
    shipId,
    track.steps[0] ?? 0,
  ]));

export const SHIP_SPECIFICATIONS: Readonly<Record<string, {
  length: string; tonnage: number; crewCapacity: number; passengerCapacity: number;
}>> = {
  aegis: { length: '250m', tonnage: 80000, crewCapacity: 3000, passengerCapacity: 100 },
  capybara: { length: '600m', tonnage: 800000, crewCapacity: 5000, passengerCapacity: 500 },
};

export function populationTrackForShip(shipId: string): ShipPopulationTrack | undefined {
  return SHIP_POPULATION_TRACKS[shipId];
}

export function populationForShip(shipId: string, stored?: Readonly<Record<string, number>>): number | undefined {
  return stored?.[shipId] ?? INITIAL_SHIP_SURVIVORS[shipId];
}
