export const MAX_PURSUIT = 10;

export type PursuitStatus = 'tracked' | 'critical' | 'surrounded';

/** Accept only a server-authored value that fits the printed pursuit track. */
export function authoritativePursuitValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_PURSUIT
    ? value
    : undefined;
}

/** Read the printed shortest-route depth from the shared galactic map. */
export function pursuitDistanceForCoordinate(_coordinate: string, entitledDistance = 0): number {
  return Number.isFinite(entitledDistance) && entitledDistance >= 0 ? entitledDistance : 0;
}

export function pursuitStatusForScore(score: number): PursuitStatus {
  if (score >= MAX_PURSUIT) return 'surrounded';
  if (score >= 8) return 'critical';
  return 'tracked';
}
