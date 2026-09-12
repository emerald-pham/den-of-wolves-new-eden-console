import { describe, expect, it } from 'vitest';
import {
  candidateCoordinates,
  EXPLORATION_SITES,
  STAR_CHART_CONNECTIONS,
  STAR_CHART_SYSTEMS,
  siteForCoordinate,
  systemForCoordinate,
} from './starChart';

describe('the printed star chart', () => {
  it('keeps the 22 visible systems and their reciprocal 40-link jump network', () => {
    expect(STAR_CHART_SYSTEMS).toHaveLength(22);
    expect(STAR_CHART_CONNECTIONS).toHaveLength(40);
    expect(new Set(STAR_CHART_SYSTEMS.map((system) => system.coordinate)).size).toBe(22);

    for (const [from, to] of STAR_CHART_CONNECTIONS) {
      expect(systemForCoordinate(from)?.neighbors).toContain(to);
      expect(systemForCoordinate(to)?.neighbors).toContain(from);
    }

    expect(systemForCoordinate('0000')).toMatchObject({
      coordinate: '0000',
      pursuitDistance: 0,
      chartCodes: { A: null, B: null, C: null },
    });
    expect(systemForCoordinate('0101')).toBeUndefined();
  });

  it('keeps the chart overlays and New Eden candidate positions separate from topology', () => {
    expect(candidateCoordinates('A')).toEqual({ N: '6798', O: '0408', P: '4888' });
    expect(candidateCoordinates('B')).toEqual({ N: '0408', O: '1380', P: '1964' });
    expect(candidateCoordinates('C')).toEqual({ N: '6798', O: '8378', P: '4888' });

    expect(siteForCoordinate('6798', 'A')).toMatchObject({
      code: 'N',
      name: 'Ancient Jump Ring',
      candidate: true,
    });
    expect(siteForCoordinate('6798', 'B')).toMatchObject({
      code: 'M',
      name: EXPLORATION_SITES.M.name,
      candidate: false,
    });
    expect(siteForCoordinate('0000', 'A')).toBeUndefined();
  });
});


it('resolves every source-listed coordinate and title on all three selected charts', () => {
  const expectedCodes = {
    '1413': ['A', 'L', 'L'],
    '5143': ['L', 'E', 'L'],
    '9997': ['C', 'L', 'D'],
    '6837': ['D', 'B', 'E'],
    '0488': ['L', 'L', 'C'],
    '6931': ['L', 'I', 'L'],
    '4454': ['M', 'L', 'L'],
    '4753': ['E', 'K', 'G'],
    '1096': ['I', 'F', 'M'],
    '6964': ['G', 'J', 'I'],
    '2580': ['F', 'G', 'J'],
    '3068': ['M', 'M', 'H'],
    '0853': ['L', 'M', 'M'],
    '6943': ['K', 'L', 'F'],
    '6798': ['N', 'M', 'N'],
    '8378': ['J', 'M', 'O'],
    '1964': ['M', 'P', 'K'],
    '1380': ['M', 'O', 'M'],
    '1836': ['H', 'M', 'M'],
    '0408': ['O', 'N', 'M'],
    '4888': ['P', 'H', 'P'],
  } as const;
  const expectedNames = {
    A: 'Lichen-Covered Asteroids',
    B: 'Ice Asteroids',
    C: 'Rare Element Moon',
    D: 'Abandoned Explorer Outpost',
    // The mission heading supplies the full title abbreviated in the chart table.
    E: 'I.C.S.S. Athena Survivors',
    F: 'Abandoned Refuelling Station',
    G: 'Level 5 Survivable Planet',
    H: 'Derelict Research Vessel',
    I: 'Ion Nebula',
    J: 'Unstable Star',
    K: 'Abandoned Wolf Supply Outpost',
    L: 'Active Wolf Outpost',
    M: 'Active Wolf Fortress',
    N: 'Ancient Jump Ring',
    O: 'Deep Nebula',
    P: 'Ancient Space Station',
  } as const;
  for (const [coordinate, codes] of Object.entries(expectedCodes)) {
    for (const [index, chart] of (['A', 'B', 'C'] as const).entries()) {
      const code = codes[index]!;
      expect(siteForCoordinate(coordinate, chart)).toMatchObject({
        code, name: expectedNames[code], candidate: ['N', 'O', 'P'].includes(code),
      });
      if (code === 'L' || code === 'M') {
        expect(siteForCoordinate(coordinate, chart)?.category).toBe('hostile');
      }
    }
  }
  for (const chart of ['A', 'B', 'C'] as const) {
    expect(siteForCoordinate('0000', chart)).toBeUndefined();
    expect(siteForCoordinate('0101', chart)).toBeUndefined();
  }
});
