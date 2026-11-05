import { STAR_CHART_SYSTEMS, systemForCoordinate } from '@/data/starChartTopology';

/**
 * Plan through the current player's known chart only. Coordinates that are not
 * present in the entitled projection never enter the returned route.
 */
export function planKnownExplorerRoute(
  originCoordinate: string,
  destinationCoordinate: string,
  knownCoordinates: readonly string[],
  knownSystems: Readonly<Record<string, string>>,
): readonly string[] | null {
  const known = new Set(knownCoordinates);
  if (!known.has(originCoordinate) || !known.has(destinationCoordinate)) return null;

  const coordinateByNode = new Map<string, string>();
  for (const system of STAR_CHART_SYSTEMS) {
    const coordinate = knownSystems[system.id];
    if (coordinate && known.has(coordinate)) coordinateByNode.set(system.id, coordinate);
  }

  const origin = systemForCoordinate(originCoordinate, knownSystems);
  const destination = systemForCoordinate(destinationCoordinate, knownSystems);
  if (!origin || !destination || !coordinateByNode.has(origin.id) || !coordinateByNode.has(destination.id)) {
    return null;
  }

  const queue: Array<readonly [nodeId: string, route: readonly string[]]> = [
    [origin.id, [originCoordinate]],
  ];
  const visited = new Set([origin.id]);
  for (let index = 0; index < queue.length; index += 1) {
    const [nodeId, route] = queue[index]!;
    if (nodeId === destination.id) return route;

    const system = STAR_CHART_SYSTEMS.find((candidate) => candidate.id === nodeId);
    for (const neighborId of system?.neighbors ?? []) {
      const coordinate = coordinateByNode.get(neighborId);
      if (!coordinate || visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push([neighborId, [...route, coordinate]]);
    }
  }

  return null;
}
