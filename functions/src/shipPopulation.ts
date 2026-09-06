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
