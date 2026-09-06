import { SHIPS } from './ships';

export interface ShipPopulationTrack {
  readonly steps: readonly number[];
  readonly thresholds: readonly number[];
}

export const SHIP_POPULATION_TRACKS: Readonly<Record<string, ShipPopulationTrack>> =
  Object.fromEntries(SHIPS.flatMap((ship) => ship.populationTrack ? [[ship.id, ship.populationTrack]] : []));

export const INITIAL_SHIP_SURVIVORS: Readonly<Record<string, number>> =
  Object.fromEntries(Object.entries(SHIP_POPULATION_TRACKS).map(([shipId, track]) => [
    shipId,
    track.steps[0] ?? 0,
  ]));

export const SHIP_SPECIFICATIONS: Readonly<Record<string, {
  length: string; tonnage: number; crewCapacity: number; passengerCapacity: number;
}>> = Object.fromEntries(SHIPS.flatMap((ship) => ship.specifications ? [[ship.id, ship.specifications]] : []));

export function populationTrackForShip(shipId: string): ShipPopulationTrack | undefined {
  return SHIP_POPULATION_TRACKS[shipId];
}

export function populationForShip(shipId: string, stored?: Readonly<Record<string, number>>): number | undefined {
  return stored?.[shipId] ?? INITIAL_SHIP_SURVIVORS[shipId];
}
