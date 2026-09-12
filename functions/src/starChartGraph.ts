/** Canonical jump topology shared by the browser and Functions; no platform imports. */
export const STAR_CHART_COORDINATES: readonly string[] = Object.freeze([
  '0000',
  '5143',
  '1413',
  '9997',
  '6837',
  '0488',
  '6931',
  '4454',
  '4753',
  '1096',
  '6964',
  '2580',
  '3068',
  '0853',
  '6943',
  '6798',
  '8378',
  '1964',
  '1380',
  '1836',
  '0408',
  '4888',
]);

/** Each undirected edge occurs once; nested tuples cannot be mutated by consumers. */
export const STAR_CHART_CONNECTIONS: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['0000', '5143'] as const),
  Object.freeze(['0000', '1413'] as const),
  Object.freeze(['5143', '9997'] as const),
  Object.freeze(['5143', '6837'] as const),
  Object.freeze(['1413', '6837'] as const),
  Object.freeze(['1413', '0488'] as const),
  Object.freeze(['9997', '6931'] as const),
  Object.freeze(['6837', '0488'] as const),
  Object.freeze(['6837', '6931'] as const),
  Object.freeze(['6837', '4454'] as const),
  Object.freeze(['0488', '4454'] as const),
  Object.freeze(['6931', '4454'] as const),
  Object.freeze(['6931', '4753'] as const),
  Object.freeze(['6931', '1096'] as const),
  Object.freeze(['4454', '1096'] as const),
  Object.freeze(['4454', '6964'] as const),
  Object.freeze(['4753', '1096'] as const),
  Object.freeze(['4753', '3068'] as const),
  Object.freeze(['4753', '2580'] as const),
  Object.freeze(['1096', '3068'] as const),
  Object.freeze(['1096', '0853'] as const),
  Object.freeze(['1096', '6964'] as const),
  Object.freeze(['6964', '0853'] as const),
  Object.freeze(['6964', '6943'] as const),
  Object.freeze(['2580', '6798'] as const),
  Object.freeze(['3068', '6798'] as const),
  Object.freeze(['3068', '8378'] as const),
  Object.freeze(['3068', '0853'] as const),
  Object.freeze(['0853', '8378'] as const),
  Object.freeze(['0853', '1964'] as const),
  Object.freeze(['6943', '1964'] as const),
  Object.freeze(['6798', '1380'] as const),
  Object.freeze(['6798', '1836'] as const),
  Object.freeze(['8378', '1836'] as const),
  Object.freeze(['8378', '0408'] as const),
  Object.freeze(['8378', '1964'] as const),
  Object.freeze(['1964', '0408'] as const),
  Object.freeze(['1964', '4888'] as const),
  Object.freeze(['1380', '1836'] as const),
  Object.freeze(['0408', '4888'] as const),
]);

const neighborsByCoordinate = new Map(STAR_CHART_COORDINATES.map(coordinate => [
  coordinate,
  Object.freeze(STAR_CHART_CONNECTIONS.flatMap(([from, to]) =>
    from === coordinate ? [to] : to === coordinate ? [from] : [],
  )),
]));

/** Unknown and unprinted coordinates have no graph entry. */
export function neighborsForCoordinate(coordinate: string): readonly string[] | undefined {
  return neighborsByCoordinate.get(coordinate);
}
