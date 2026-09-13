import { jumpDistanceBetween, STAR_CHART_CONNECTIONS, STAR_CHART_COORDINATES } from './starChartGraph';

/**
 * Server-only chart topology. The browser receives only the opaque node IDs
 * and the coordinates already entitled to its current projection.
 */
export interface DiscoverySystem {
  readonly id: string;
  readonly coordinate: string;
  readonly pursuitDistance: number;
}

const ID_BY_COORDINATE = new Map(
  STAR_CHART_COORDINATES.map((coordinate, index) => [coordinate, `system-${String(index + 1).padStart(2, '0')}`]),
);

const PURSUIT_DISTANCE_BY_COORDINATE = new Map(
  STAR_CHART_COORDINATES.map((coordinate) => [coordinate, jumpDistanceBetween('0000', coordinate) ?? 0]),
);

export const DISCOVERY_SYSTEMS: readonly DiscoverySystem[] = Object.freeze(
  STAR_CHART_COORDINATES.map((coordinate) => Object.freeze({
    id: ID_BY_COORDINATE.get(coordinate)!,
    coordinate,
    pursuitDistance: PURSUIT_DISTANCE_BY_COORDINATE.get(coordinate) ?? 0,
  })),
);

export function discoverySystemId(coordinate: string): string | undefined {
  return ID_BY_COORDINATE.get(coordinate);
}

export function discoverySystemsForCoordinates(
  coordinates: readonly string[],
): Readonly<Record<string, string>> {
  return Object.fromEntries([...new Set(coordinates)].flatMap((coordinate) => {
    const id = discoverySystemId(coordinate);
    return id ? [[id, coordinate]] : [];
  }));
}

export function allDiscoverySystems(): Readonly<Record<string, string>> {
  return Object.fromEntries(DISCOVERY_SYSTEMS.map((system) => [system.id, system.coordinate]));
}

export function pursuitDistanceForCoordinate(coordinate: string): number {
  return PURSUIT_DISTANCE_BY_COORDINATE.get(coordinate) ?? 0;
}

export function pursuitDistancesForCoordinates(
  coordinates: Readonly<Record<string, string>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(coordinates).map(([shipId, coordinate]) => [
    shipId, pursuitDistanceForCoordinate(coordinate),
  ]));
}

export function discoveryConnections(): readonly (readonly [string, string])[] {
  return STAR_CHART_CONNECTIONS.flatMap(([from, to]) => {
    const fromId = discoverySystemId(from);
    const toId = discoverySystemId(to);
    return fromId && toId ? [[fromId, toId] as const] : [];
  });
}
