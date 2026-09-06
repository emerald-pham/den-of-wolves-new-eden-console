/** Printed Capybara track: descending, with unequal gaps between steps. */
export const POPULATION_STEPS: readonly number[] = [
  20000, 18500, 17000, 16000, 15000, 14000, 13000, 12000, 11000, 10000,
  9000, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3000, 2500, 2000,
  1500, 1250, 1000, 750, 500, 250, 0,
];
export const POPULATION_THRESHOLDS: readonly number[] = [15000, 5000, 0];
export function populationForShip(shipId: string, stored?: Readonly<Record<string, number>>): number | undefined {
  return shipId === 'capybara' ? stored?.[shipId] ?? 20000 : undefined;
}

export function populationChange(current: number, delta: -1 | 1, pending: boolean): {
  amount: number; alertRaised: boolean;
} {
  if (pending) throw new Error('The GM population alert must be dismissed first.');
  const index = POPULATION_STEPS.indexOf(current);
  if (index < 0) throw new Error('Population is not on the printed track.');
  const amount = POPULATION_STEPS[index - delta];
  if (amount === undefined) throw new Error('Population is already at the track endpoint.');
  return { amount, alertRaised: POPULATION_THRESHOLDS.includes(amount) };
}

export function acknowledgePopulationAlert(targets: readonly string[], instanceId: string): string[] {
  return targets.filter((id) => id !== instanceId);
}
