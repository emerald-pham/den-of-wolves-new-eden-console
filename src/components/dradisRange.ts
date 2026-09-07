import type { Vector } from './sweep';

export type CombatRange = 'long' | 'medium' | 'short';

/** One unit of the shared DRADIS world frame represents one kilometre. */
export const DRADIS_METERS_PER_UNIT = 1_000;
/** Unknown contacts use equal thirds of the local DRADIS detection volume. */
export const DRADIS_SHORT_RANGE_MAX_METERS = DRADIS_METERS_PER_UNIT / 3;
export const DRADIS_MEDIUM_RANGE_MAX_METERS = DRADIS_METERS_PER_UNIT * 2 / 3;

export function distanceMetersBetween(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * DRADIS_METERS_PER_UNIT;
}

export function combatRangeForMeters(distanceMeters: number): CombatRange {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= DRADIS_SHORT_RANGE_MAX_METERS) {
    return 'short';
  }
  if (distanceMeters <= DRADIS_MEDIUM_RANGE_MAX_METERS) return 'medium';
  return 'long';
}

/** Unknown returns are the one DRADIS exception whose band follows measured distance. */
export function ambientCombatRange(object: Vector, origin: Vector): CombatRange {
  return combatRangeForMeters(distanceMetersBetween(object, origin));
}
