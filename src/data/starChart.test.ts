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
