import { ORIGIN_GALACTIC_COORDINATE, SHIPS } from './ships';

export interface FleetPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FleetContact extends FleetPoint {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

/**
 * The first fleet geometry is intentionally data, not layout code. Coordinates
 * are measured from AEGIS inside a unit-scale loose bubble, ready to be swapped
 * for later battle formations without changing the plot renderer.
 */
export const FLEET_FORMATION: Readonly<Record<string, FleetPoint>> = {
  aegis: { x: 0, y: 0, z: 0 },
  dione: { x: -0.32, y: 0.18, z: 0.22 },
  icebreaker: { x: 0.26, y: -0.12, z: 0.28 },
  capybara: { x: -0.08, y: -0.31, z: 0.12 },
  shepherd: { x: 0.34, y: 0.24, z: -0.16 },
  quellon: { x: -0.28, y: -0.08, z: -0.26 },
  'refinery-124': { x: 0.09, y: 0.32, z: 0.31 },
};

const round = (value: number): number => Math.round(value * 1e4) / 1e4;

export function fleetViewFrom(
  viewerId: string,
  capybaraEnabled = true,
  shipGalacticCoordinates: Readonly<Record<string, string>> = {},
  dioneEnabled = true,
): readonly FleetContact[] {
  const viewer = FLEET_FORMATION[viewerId] ?? FLEET_FORMATION.aegis;
  if (!viewer) return [];

  const viewerCoordinate = shipGalacticCoordinates[viewerId] ?? ORIGIN_GALACTIC_COORDINATE;
  return SHIPS.filter((ship) =>
    ship.id !== viewerId &&
    (capybaraEnabled || ship.id !== 'capybara') &&
    (dioneEnabled || ship.id !== 'dione') &&
    (shipGalacticCoordinates[ship.id] ?? ORIGIN_GALACTIC_COORDINATE) === viewerCoordinate)
    .flatMap((ship) => {
    const point = FLEET_FORMATION[ship.id];
    if (!point) return [];
    return [{
      id: ship.id,
      name: ship.name,
      color: ship.dradisColor ?? ship.color,
      x: round(point.x - viewer.x),
      y: round(point.y - viewer.y),
      z: round(point.z - viewer.z),
    }];
  });
}
