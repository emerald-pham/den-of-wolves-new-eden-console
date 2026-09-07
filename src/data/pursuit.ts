import { systemForCoordinate } from './starChart';

export const MAX_PURSUIT = 10;

export type PursuitStatus = 'tracked' | 'critical' | 'surrounded';

/** Read the printed shortest-route depth from the shared galactic map. */
export function pursuitDistanceForCoordinate(coordinate: string): number {
  return systemForCoordinate(coordinate)?.pursuitDistance ?? 0;
}

/** Calculate the pursuit value for one ship at its current position. */
export function pursuitScoreForPosition(currentTurn: number, coordinate: string): number {
  if (!Number.isFinite(currentTurn) || currentTurn <= 0) return 0;
  const turnLoad = Math.floor(currentTurn) * 2;
  return Math.max(0, Math.min(MAX_PURSUIT, turnLoad - pursuitDistanceForCoordinate(coordinate)));
}

export function pursuitStatusForScore(score: number): PursuitStatus {
  if (score >= MAX_PURSUIT) return 'surrounded';
  if (score >= 8) return 'critical';
  return 'tracked';
}
