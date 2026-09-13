/** Organiser-only chart lookup. This module is server-side and never shipped in the player bundle. */
export type ChartId = 'A' | 'B' | 'C';
export interface OrganiserSiteProjection {
  readonly code: string;
  readonly name: string;
  readonly candidate: boolean;
  readonly summary: string;
}

const CODES: Readonly<Record<string, Readonly<Record<ChartId, string | null>>>> = {
  '0000': { A: null, B: null, C: null }, '5143': { A: 'L', B: 'E', C: 'L' },
  '1413': { A: 'A', B: 'L', C: 'L' }, '9997': { A: 'C', B: 'L', C: 'D' },
  '6837': { A: 'D', B: 'B', C: 'E' }, '0488': { A: 'L', B: 'L', C: 'C' },
  '6931': { A: 'L', B: 'I', C: 'L' }, '4454': { A: 'M', B: 'L', C: 'L' },
  '4753': { A: 'E', B: 'K', C: 'G' }, '1096': { A: 'I', B: 'F', C: 'M' },
  '6964': { A: 'G', B: 'J', C: 'I' }, '2580': { A: 'F', B: 'G', C: 'J' },
  '3068': { A: 'M', B: 'M', C: 'H' }, '0853': { A: 'L', B: 'M', C: 'M' },
  '6943': { A: 'K', B: 'L', C: 'F' }, '6798': { A: 'N', B: 'M', C: 'N' },
  '8378': { A: 'J', B: 'M', C: 'O' }, '1964': { A: 'M', B: 'P', C: 'K' },
  '1380': { A: 'M', B: 'O', C: 'M' }, '1836': { A: 'H', B: 'M', C: 'M' },
  '0408': { A: 'O', B: 'N', C: 'M' }, '4888': { A: 'P', B: 'H', C: 'P' },
};

const SITES: Readonly<Record<string, OrganiserSiteProjection>> = {
  A: { code: 'A', name: 'Lichen-Covered Asteroids', candidate: false, summary: 'Poor system // edible lichen and low-yield strytium ore.' },
  B: { code: 'B', name: 'Ice Asteroids', candidate: false, summary: 'Poor system // icy asteroids with a major mining opportunity.' },
  C: { code: 'C', name: 'Rare Element Moon', candidate: false, summary: 'Poor system // scarce minerals worth mining or studying.' },
  D: { code: 'D', name: 'Abandoned Explorer Outpost', candidate: false, summary: 'Neutral system // salvage and exploration data remain.' },
  E: { code: 'E', name: 'I.C.S.S. Athena Survivors', candidate: false, summary: 'Neutral system // survivors, wreckage and military intelligence.' },
  F: { code: 'F', name: 'Abandoned Refuelling Station', candidate: false, summary: 'Neutral system // fuel, ore and Refinery 124 repair parts.' },
  G: { code: 'G', name: 'Level 5 Survivable Planet', candidate: false, summary: 'Neutral system // food, water and salvage; no pursuit reduction here.' },
  H: { code: 'H', name: 'Derelict Research Vessel', candidate: false, summary: 'Neutral system // the R.S. Venture holds salvage and research data.' },
  I: { code: 'I', name: 'Ion Nebula', candidate: false, summary: 'Hazard // pursuit does not rise here; ships take damage on 3+ in maintenance.' },
  J: { code: 'J', name: 'Unstable Star', candidate: false, summary: 'Hazard // ships take damage on 4+ in maintenance; rich strytium ore.' },
  K: { code: 'K', name: 'Abandoned Wolf Supply Outpost', candidate: false, summary: 'Hazard // the facilitator secretly sets the mission difficulty.' },
  L: { code: 'L', name: 'Active Wolf Outpost', candidate: false, summary: 'Hostile system // continuing Wolf attacks while the base operates.' },
  M: { code: 'M', name: 'Active Wolf Fortress', candidate: false, summary: 'Hostile system // overwhelming Wolf force and continuing attacks.' },
  N: { code: 'N', name: 'Ancient Jump Ring', candidate: true, summary: 'New Eden candidate // repair, research and 5 fuel per ship to pass.' },
  O: { code: 'O', name: 'Deep Nebula', candidate: true, summary: 'New Eden candidate // scouting improves each ship’s long-jump roll.' },
  P: { code: 'P', name: 'Ancient Space Station', candidate: true, summary: 'New Eden candidate // defeat the Wolves and power the station.' },
};

export function organiserSitesForChart(chart: ChartId): Readonly<Record<string, OrganiserSiteProjection>> {
  return Object.fromEntries(Object.entries(CODES).map(([coordinate, codes]) => {
    const code = codes[chart];
    return [coordinate, code ? SITES[code]! : { code: '', name: '', candidate: false, summary: '' }];
  }));
}
