export interface ShipPopulationTrack {
  readonly steps: readonly number[];
  readonly thresholds: readonly number[];
}

export const SHIP_POPULATION_TRACKS: Readonly<Record<string, ShipPopulationTrack>> = {
  "dione": {"steps": [100000, 95000, 90000, 86000, 82000, 78000, 74000, 70000, 66000, 62000, 58000, 54000, 50000, 47000, 44000, 41000, 38000, 35000, 33000, 31000, 29000, 27000, 25000, 23500, 22000, 20500, 19000, 17500, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [90000, 70000, 50000, 35000, 25000, 15000, 5000, 0]},
  "icebreaker": {"steps": [40000, 37000, 34000, 32000, 30000, 28000, 26500, 25000, 23500, 22000, 20500, 19000, 17500, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [34000, 25000, 15000, 5000, 0]},
  "shepherd": {"steps": [30000, 28000, 26000, 24000, 22000, 20500, 19000, 17500, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [24000, 15000, 5000, 0]},
  "quellon": {"steps": [30000, 28000, 26000, 24000, 22000, 20500, 19000, 17500, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [24000, 15000, 5000, 0]},
  "refinery-124": {"steps": [20000, 18500, 17000, 16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0], "thresholds": [15000, 5000, 0]},
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

export const INITIAL_SHIP_SURVIVORS: Readonly<Record<string, number>> = {
  aegis: 2500,
  dione: 100000,
  icebreaker: 40000,
  capybara: 20000,
  shepherd: 30000,
  quellon: 30000,
  'refinery-124': 20000,
};

export function populationTrackForShip(shipId: string): ShipPopulationTrack | undefined {
  return SHIP_POPULATION_TRACKS[shipId];
}

export function populationForShip(shipId: string, stored?: Readonly<Record<string, number>>): number | undefined {
  return stored?.[shipId] ?? INITIAL_SHIP_SURVIVORS[shipId];
}

export function populationChange(shipId: string, current: number, delta: -1 | 1, pending: boolean): {
  amount: number; alertRaised: boolean;
} {
  if (pending) throw new Error('The GM population alert must be dismissed first.');
  const track = populationTrackForShip(shipId);
  if (!track) throw new Error('This ship has no survivor track.');
  const index = track.steps.indexOf(current);
  if (index < 0) throw new Error('Population is not on the printed track.');
  const amount = track.steps[index - delta];
  if (amount === undefined) throw new Error('Population is already at the track endpoint.');
  return { amount, alertRaised: track.thresholds.includes(amount) };
}

export function acknowledgePopulationAlert(targets: readonly string[], instanceId: string): string[] {
  return targets.filter((id) => id !== instanceId);
}
