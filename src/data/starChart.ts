/**
 * The printed DoWNE star chart is a 2D jump network. The organiser's A/B/C
 * sheets change the A–P site code at a coordinate, but never change the
 * topology or the pursuit distance of that coordinate.
 *
 * Source: DoWNE - A4 Single Sided v1.1.pdf, pp. 23–30; see also
 * docs/reference/den-of-wolves-new-eden/references/
 * REFERENCE_ONLY_EXPLORATION_AND_AWAY_MISSIONS.md.
 *
 * 0101 is deliberately absent: it is referenced by the Wolf Commander's
 * surrender ability, not printed on any star chart.
 */

export const STAR_CHART_IDS = ['A', 'B', 'C'] as const;
export type StarChartId = typeof STAR_CHART_IDS[number];

export const EXPLORATION_CODES = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
] as const;
export type ExplorationCode = typeof EXPLORATION_CODES[number];
export const EDEN_CANDIDATE_CODES = ['N', 'O', 'P'] as const;
export type EdenCandidateCode = typeof EDEN_CANDIDATE_CODES[number];

export type SiteCategory = 'poor' | 'neutral' | 'hostile' | 'candidate';

export interface ExplorationSite {
  readonly code: ExplorationCode;
  readonly name: string;
  readonly category: SiteCategory;
  readonly candidate: boolean;
  readonly summary: string;
}

export interface StarSystemPosition {
  /** Printed chart position, normalized to the 0–100 SVG viewBox. */
  readonly x: number;
  readonly y: number;
}

export interface StarSystem {
  readonly coordinate: string;
  /** Number of graph jumps from 0000 by the shortest route. */
  readonly pursuitDistance: number;
  readonly position: StarSystemPosition;
  readonly chartCodes: Readonly<Record<StarChartId, ExplorationCode | null>>;
  readonly neighbors: readonly string[];
}

/** Every undirected edge appears once, with the printed coordinate order. */
export const STAR_CHART_CONNECTIONS: readonly (readonly [string, string])[] = [
  ['0000', '5143'], ['0000', '1413'],
  ['5143', '9997'], ['5143', '6837'],
  ['1413', '6837'], ['1413', '0488'],
  ['9997', '6931'],
  ['6837', '0488'], ['6837', '6931'], ['6837', '4454'],
  ['0488', '4454'],
  ['6931', '4454'], ['6931', '4753'], ['6931', '1096'],
  ['4454', '1096'], ['4454', '6964'],
  ['4753', '1096'], ['4753', '3068'], ['4753', '2580'],
  ['1096', '3068'], ['1096', '0853'], ['1096', '6964'],
  ['6964', '0853'], ['6964', '6943'],
  ['2580', '6798'],
  ['3068', '6798'], ['3068', '8378'], ['3068', '0853'],
  ['0853', '8378'], ['0853', '1964'],
  ['6943', '1964'],
  ['6798', '1380'], ['6798', '1836'],
  ['8378', '1836'], ['8378', '0408'], ['8378', '1964'],
  ['1964', '0408'], ['1964', '4888'],
  ['1380', '1836'],
  ['0408', '4888'],
];

const SYSTEM_LAYOUT: readonly Omit<StarSystem, 'neighbors'>[] = [
  {
    coordinate: '0000', pursuitDistance: 0, position: { x: 50, y: 96 },
    chartCodes: { A: null, B: null, C: null },
  },
  {
    coordinate: '5143', pursuitDistance: 1, position: { x: 32, y: 80 },
    chartCodes: { A: 'L', B: 'E', C: 'L' },
  },
  {
    coordinate: '1413', pursuitDistance: 1, position: { x: 61, y: 85 },
    chartCodes: { A: 'A', B: 'L', C: 'L' },
  },
  {
    coordinate: '9997', pursuitDistance: 2, position: { x: 16, y: 68 },
    chartCodes: { A: 'C', B: 'L', C: 'D' },
  },
  {
    coordinate: '6837', pursuitDistance: 2, position: { x: 49, y: 70 },
    chartCodes: { A: 'D', B: 'B', C: 'E' },
  },
  {
    coordinate: '0488', pursuitDistance: 2, position: { x: 77, y: 70 },
    chartCodes: { A: 'L', B: 'L', C: 'C' },
  },
  {
    coordinate: '6931', pursuitDistance: 3, position: { x: 34, y: 57 },
    chartCodes: { A: 'L', B: 'I', C: 'L' },
  },
  {
    coordinate: '4454', pursuitDistance: 3, position: { x: 67, y: 55 },
    chartCodes: { A: 'M', B: 'L', C: 'L' },
  },
  {
    coordinate: '4753', pursuitDistance: 4, position: { x: 20, y: 45 },
    chartCodes: { A: 'E', B: 'K', C: 'G' },
  },
  {
    coordinate: '1096', pursuitDistance: 4, position: { x: 47, y: 48 },
    chartCodes: { A: 'I', B: 'F', C: 'M' },
  },
  {
    coordinate: '6964', pursuitDistance: 4, position: { x: 82, y: 45 },
    chartCodes: { A: 'G', B: 'J', C: 'I' },
  },
  {
    coordinate: '2580', pursuitDistance: 5, position: { x: 8, y: 31 },
    chartCodes: { A: 'F', B: 'G', C: 'J' },
  },
  {
    coordinate: '3068', pursuitDistance: 5, position: { x: 34, y: 35 },
    chartCodes: { A: 'M', B: 'M', C: 'H' },
  },
  {
    coordinate: '0853', pursuitDistance: 5, position: { x: 60, y: 33 },
    chartCodes: { A: 'L', B: 'M', C: 'M' },
  },
  {
    coordinate: '6943', pursuitDistance: 5, position: { x: 90, y: 34 },
    chartCodes: { A: 'K', B: 'L', C: 'F' },
  },
  {
    coordinate: '6798', pursuitDistance: 6, position: { x: 18, y: 22 },
    chartCodes: { A: 'N', B: 'M', C: 'N' },
  },
  {
    coordinate: '8378', pursuitDistance: 6, position: { x: 51, y: 22 },
    chartCodes: { A: 'J', B: 'M', C: 'O' },
  },
  {
    coordinate: '1964', pursuitDistance: 6, position: { x: 78, y: 24 },
    chartCodes: { A: 'M', B: 'P', C: 'K' },
  },
  {
    coordinate: '1380', pursuitDistance: 7, position: { x: 8, y: 10 },
    chartCodes: { A: 'M', B: 'O', C: 'M' },
  },
  {
    coordinate: '1836', pursuitDistance: 7, position: { x: 38, y: 9 },
    chartCodes: { A: 'H', B: 'M', C: 'M' },
  },
  {
    coordinate: '0408', pursuitDistance: 7, position: { x: 65, y: 5 },
    chartCodes: { A: 'O', B: 'N', C: 'M' },
  },
  {
    coordinate: '4888', pursuitDistance: 7, position: { x: 90, y: 11 },
    chartCodes: { A: 'P', B: 'H', C: 'P' },
  },
];

export const STAR_CHART_SYSTEMS: readonly StarSystem[] = SYSTEM_LAYOUT.map((system) => ({
  ...system,
  neighbors: STAR_CHART_CONNECTIONS.flatMap(([from, to]) => {
    if (from === system.coordinate) return [to];
    if (to === system.coordinate) return [from];
    return [];
  }),
}));

export const EXPLORATION_SITES: Readonly<Record<ExplorationCode, ExplorationSite>> = {
  A: {
    code: 'A', name: 'Lichen-Covered Asteroids', category: 'poor', candidate: false,
    summary: 'Poor system // edible lichen and low-yield strytium ore.',
  },
  B: {
    code: 'B', name: 'Ice Asteroids', category: 'poor', candidate: false,
    summary: 'Poor system // icy asteroids with a major mining opportunity.',
  },
  C: {
    code: 'C', name: 'Rare Element Moon', category: 'poor', candidate: false,
    summary: 'Poor system // scarce minerals worth mining or studying.',
  },
  D: {
    code: 'D', name: 'Abandoned Explorer Outpost', category: 'neutral', candidate: false,
    summary: 'Neutral system // salvage and exploration data remain.',
  },
  E: {
    code: 'E', name: 'I.C.S.S. Athena Survivors', category: 'neutral', candidate: false,
    summary: 'Neutral system // survivors, wreckage and military intelligence.',
  },
  F: {
    code: 'F', name: 'Abandoned Refuelling Station', category: 'neutral', candidate: false,
    summary: 'Neutral system // fuel, ore and Refinery 124 repair parts.',
  },
  G: {
    code: 'G', name: 'Level 5 Survivable Planet', category: 'neutral', candidate: false,
    summary: 'Neutral system // food, water and salvage; no pursuit reduction here.',
  },
  H: {
    code: 'H', name: 'Derelict Research Vessel', category: 'neutral', candidate: false,
    summary: 'Neutral system // the R.S. Venture holds salvage and research data.',
  },
  I: {
    code: 'I', name: 'Ion Nebula', category: 'hostile', candidate: false,
    summary: 'Hazard // pursuit does not rise here; ships take damage on 3+ in maintenance.',
  },
  J: {
    code: 'J', name: 'Unstable Star', category: 'hostile', candidate: false,
    summary: 'Hazard // ships take damage on 4+ in maintenance; rich strytium ore.',
  },
  K: {
    code: 'K', name: 'Abandoned Wolf Supply Outpost', category: 'hostile', candidate: false,
    summary: 'Hazard // the facilitator secretly sets the mission difficulty.',
  },
  L: {
    code: 'L', name: 'Active Wolf Outpost', category: 'hostile', candidate: false,
    summary: 'Hostile system // continuing Wolf attacks while the base operates.',
  },
  M: {
    code: 'M', name: 'Active Wolf Fortress', category: 'hostile', candidate: false,
    summary: 'Hostile system // overwhelming Wolf force and continuing attacks.',
  },
  N: {
    code: 'N', name: 'Ancient Jump Ring', category: 'candidate', candidate: true,
    summary: 'New Eden candidate // repair, research and 5 fuel per ship to pass.',
  },
  O: {
    code: 'O', name: 'Deep Nebula', category: 'candidate', candidate: true,
    summary: 'New Eden candidate // scouting improves each ship’s long-jump roll.',
  },
  P: {
    code: 'P', name: 'Ancient Space Station', category: 'candidate', candidate: true,
    summary: 'New Eden candidate // defeat the Wolves and power the station.',
  },
};

export function systemForCoordinate(coordinate: string): StarSystem | undefined {
  return STAR_CHART_SYSTEMS.find((system) => system.coordinate === coordinate);
}

export function siteForCoordinate(
  coordinate: string,
  chart: StarChartId,
): ExplorationSite | undefined {
  const code = systemForCoordinate(coordinate)?.chartCodes[chart];
  return code === null || code === undefined ? undefined : EXPLORATION_SITES[code];
}

function coordinateForCode(chart: StarChartId, code: EdenCandidateCode): string {
  const system = STAR_CHART_SYSTEMS.find((candidate) => candidate.chartCodes[chart] === code);
  if (!system) throw new Error(`Chart ${chart} does not contain candidate ${code}.`);
  return system.coordinate;
}

export function candidateCoordinates(
  chart: StarChartId,
): Readonly<Record<EdenCandidateCode, string>> {
  return {
    N: coordinateForCode(chart, 'N'),
    O: coordinateForCode(chart, 'O'),
    P: coordinateForCode(chart, 'P'),
  };
}
