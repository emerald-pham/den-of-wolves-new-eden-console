/**
 * Browser-safe map topology. Node IDs are opaque; coordinate labels and site
 * codes arrive only in the server projection for the current viewer.
 */
export interface StarSystemPosition {
  readonly x: number;
  readonly y: number;
}

export interface StarSystem {
  readonly id: string;
  readonly pursuitDistance: number;
  readonly position: StarSystemPosition;
  readonly neighbors: readonly string[];
}

const SYSTEM_LAYOUT: readonly Omit<StarSystem, 'neighbors'>[] = [
  ['system-01', 0, 50, 96], ['system-02', 1, 32, 80], ['system-03', 1, 61, 85],
  ['system-04', 2, 16, 68], ['system-05', 2, 49, 70], ['system-06', 2, 77, 70],
  ['system-07', 3, 34, 57], ['system-08', 3, 67, 55], ['system-09', 4, 20, 45],
  ['system-10', 4, 47, 48], ['system-11', 4, 82, 45], ['system-12', 5, 8, 31],
  ['system-13', 5, 34, 35], ['system-14', 5, 60, 33], ['system-15', 5, 90, 34],
  ['system-16', 6, 18, 22], ['system-17', 6, 51, 22], ['system-18', 6, 78, 24],
  ['system-19', 7, 8, 10], ['system-20', 7, 38, 9], ['system-21', 7, 65, 5], ['system-22', 7, 90, 11],
].map(([id, pursuitDistance, x, y]) => ({
  id: id as string,
  pursuitDistance: pursuitDistance as number,
  position: { x: x as number, y: y as number },
}));

const STAR_CHART_CONNECTIONS_BY_INDEX: readonly (readonly [number, number])[] = [
  [1, 2], [1, 3], [2, 4], [2, 5], [3, 5], [3, 6], [4, 7], [5, 6], [5, 7], [5, 8],
  [6, 8], [7, 8], [7, 9], [7, 10], [8, 10], [8, 11], [9, 10], [9, 13], [9, 12], [10, 13],
  [10, 14], [10, 11], [11, 14], [11, 15], [12, 16], [13, 16], [13, 17], [13, 14], [14, 17],
  [14, 18], [15, 18], [16, 19], [16, 20], [17, 20], [17, 21], [17, 18], [18, 21], [18, 22],
  [19, 20], [21, 22],
];

export const STAR_CHART_CONNECTIONS: readonly (readonly [string, string])[] = Object.freeze(
  STAR_CHART_CONNECTIONS_BY_INDEX.map(([from, to]) => Object.freeze([
    `system-${String(from).padStart(2, '0')}`,
    `system-${String(to).padStart(2, '0')}`,
  ] as const)),
);

const neighborsById = new Map<string, readonly string[]>();
for (const system of SYSTEM_LAYOUT) {
  neighborsById.set(system.id, Object.freeze(STAR_CHART_CONNECTIONS.flatMap(([from, to]) =>
    from === system.id ? [to] : to === system.id ? [from] : [],
  )));
}

export const STAR_CHART_SYSTEMS: readonly StarSystem[] = Object.freeze(SYSTEM_LAYOUT.map((system) => ({
  ...system,
  neighbors: neighborsById.get(system.id) ?? [],
})));

export function systemForNodeId(id: string): StarSystem | undefined {
  return STAR_CHART_SYSTEMS.find((system) => system.id === id);
}

export function systemForCoordinate(
  coordinate: string,
  knownSystems: Readonly<Record<string, string>> = {},
): StarSystem | undefined {
  const nodeId = Object.entries(knownSystems).find(([, known]) => known === coordinate)?.[0];
  return nodeId ? systemForNodeId(nodeId) : undefined;
}

export function coordinateForNode(
  nodeId: string,
  knownSystems: Readonly<Record<string, string>> = {},
): string | undefined {
  return knownSystems[nodeId];
}
