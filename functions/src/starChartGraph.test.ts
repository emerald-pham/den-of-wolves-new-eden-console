import { expect, it } from 'vitest';
import {
  jumpDistanceBetween,
  STAR_CHART_CONNECTIONS,
  STAR_CHART_COORDINATES,
  neighborsForCoordinate,
} from './starChartGraph';

it('returns exactly the source adjacency for every printed system', () => {
  const expected: Record<string, readonly string[]> = {
    '0000': ['5143', '1413'],
    '5143': ['0000', '9997', '6837'],
    '1413': ['0000', '6837', '0488'],
    '9997': ['5143', '6931'],
    '6837': ['5143', '1413', '0488', '6931', '4454'],
    '0488': ['1413', '6837', '4454'],
    '6931': ['9997', '6837', '4454', '4753', '1096'],
    '4454': ['6837', '0488', '6931', '1096', '6964'],
    '4753': ['6931', '1096', '3068', '2580'],
    '1096': ['6931', '4454', '4753', '3068', '0853', '6964'],
    '6964': ['4454', '1096', '0853', '6943'],
    '2580': ['4753', '6798'],
    '3068': ['4753', '1096', '6798', '8378', '0853'],
    '0853': ['3068', '1096', '6964', '8378', '1964'],
    '6943': ['6964', '1964'],
    '6798': ['2580', '3068', '1380', '1836'],
    '8378': ['3068', '0853', '1836', '0408', '1964'],
    '1964': ['0853', '6943', '8378', '0408', '4888'],
    '1380': ['6798', '1836'],
    '1836': ['1380', '6798', '8378'],
    '0408': ['8378', '1964', '4888'],
    '4888': ['0408', '1964'],
  };
  expect([...STAR_CHART_COORDINATES].sort()).toEqual(Object.keys(expected).sort());
  for (const [coordinate, neighbors] of Object.entries(expected)) {
    expect([...(neighborsForCoordinate(coordinate) ?? [])].sort()).toEqual([...neighbors].sort());
  }
  for (const unknown of ['0101', 'toString', '__proto__', '00000', '']) {
    expect(neighborsForCoordinate(unknown)).toBeUndefined();
  }
});

it('protects exported topology and returned adjacency against consumer mutation', () => {
  const before = [...neighborsForCoordinate('0000')!];
  expect(Reflect.set(neighborsForCoordinate('0000')!, '0', '0101')).toBe(false);
  expect(Reflect.set(STAR_CHART_CONNECTIONS[0]!, '0', '0101')).toBe(false);
  expect(Reflect.set(STAR_CHART_CONNECTIONS, '0', ['0101', '0000'])).toBe(false);
  expect(Reflect.set(STAR_CHART_COORDINATES, '0', '0101')).toBe(false);
  expect(neighborsForCoordinate('0000')).toEqual(before);
});

it('matches every printed shortest route distance from the start system', () => {
  const expectedDistances: Record<string, number> = {
    '0000': 0,
    '5143': 1,
    '1413': 1,
    '9997': 2,
    '6837': 2,
    '0488': 2,
    '6931': 3,
    '4454': 3,
    '4753': 4,
    '1096': 4,
    '6964': 4,
    '2580': 5,
    '3068': 5,
    '0853': 5,
    '6943': 5,
    '6798': 6,
    '8378': 6,
    '1964': 6,
    '1380': 7,
    '1836': 7,
    '0408': 7,
    '4888': 7,
  };

  expect(Object.keys(expectedDistances).sort()).toEqual([...STAR_CHART_COORDINATES].sort());
  for (const [coordinate, distance] of Object.entries(expectedDistances)) {
    expect(jumpDistanceBetween('0000', coordinate)).toBe(distance);
    expect(jumpDistanceBetween(coordinate, '0000')).toBe(distance);
  }
  expect(jumpDistanceBetween('0101', '0000')).toBeNull();
  expect(jumpDistanceBetween('0000', '0101')).toBeNull();
});
