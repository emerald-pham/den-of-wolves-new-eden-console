const LOWEST_SURVIVOR_POPULATION = 222_500;
const PERMITTED_FINAL_DIGITS = [1, 2, 3, 4, 6, 7, 8, 9] as const;
const SURVIVOR_VALUE_COUNT = 16_000;
export const SURVIVOR_POPULATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** A uniform draw among values in range whose final digit is neither zero nor five. */
export function generateSurvivorPopulation(random: () => number): number {
  const index = Math.floor(random() * SURVIVOR_VALUE_COUNT);
  return LOWEST_SURVIVOR_POPULATION + Math.floor(index / PERMITTED_FINAL_DIGITS.length) * 10
    + (PERMITTED_FINAL_DIGITS[index % PERMITTED_FINAL_DIGITS.length] ?? 1);
}

/** Rotation occurs only after the whole companion console has gone quiet for a week. */
export function shouldRefreshSurvivorPopulation(lastActivity: Date, now: Date): boolean {
  return now.getTime() - lastActivity.getTime() >= SURVIVOR_POPULATION_RETENTION_MS;
}
