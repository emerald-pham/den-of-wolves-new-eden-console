import { expect, it } from 'vitest';
import { populationTrackForShip } from './shipPopulation';
import { populationTrackForShip as serverTrack, populationChange } from '../../functions/src/shipPopulation';

const printed = {
  "dione": {
    "steps": [
      100000,
      95000,
      90000,
      86000,
      82000,
      78000,
      74000,
      70000,
      66000,
      62000,
      58000,
      54000,
      50000,
      47000,
      44000,
      41000,
      38000,
      35000,
      33000,
      31000,
      29000,
      27000,
      25000,
      23500,
      22000,
      20500,
      19000,
      17500,
      16000,
      15000,
      14000,
      13000,
      12000,
      11000,
      10000,
      9000,
      8000,
      7000,
      6000,
      5000,
      4500,
      4000,
      3500,
      3000,
      2500,
      2000,
      1500,
      1250,
      1000,
      750,
      500,
      250,
      0
    ],
    "thresholds": [
      90000,
      70000,
      50000,
      35000,
      25000,
      15000,
      5000,
      0
    ]
  },
  "icebreaker": {
    "steps": [
      40000,
      37000,
      34000,
      32000,
      30000,
      28000,
      26500,
      25000,
      23500,
      22000,
      20500,
      19000,
      17500,
      16000,
      15000,
      14000,
      13000,
      12000,
      11000,
      10000,
      9000,
      8000,
      7000,
      6000,
      5000,
      4500,
      4000,
      3500,
      3000,
      2500,
      2000,
      1500,
      1250,
      1000,
      750,
      500,
      250,
      0
    ],
    "thresholds": [
      34000,
      25000,
      15000,
      5000,
      0
    ]
  },
  "shepherd": {
    "steps": [
      30000,
      28000,
      26000,
      24000,
      22000,
      20500,
      19000,
      17500,
      16000,
      15000,
      14000,
      13000,
      12000,
      11000,
      10000,
      9000,
      8000,
      7000,
      6000,
      5000,
      4500,
      4000,
      3500,
      3000,
      2500,
      2000,
      1500,
      1250,
      1000,
      750,
      500,
      250,
      0
    ],
    "thresholds": [
      24000,
      15000,
      5000,
      0
    ]
  },
  "quellon": {
    "steps": [
      30000,
      28000,
      26000,
      24000,
      22000,
      20500,
      19000,
      17500,
      16000,
      15000,
      14000,
      13000,
      12000,
      11000,
      10000,
      9000,
      8000,
      7000,
      6000,
      5000,
      4500,
      4000,
      3500,
      3000,
      2500,
      2000,
      1500,
      1250,
      1000,
      750,
      500,
      250,
      0
    ],
    "thresholds": [
      24000,
      15000,
      5000,
      0
    ]
  },
  "refinery-124": {
    "steps": [
      20000,
      18500,
      17000,
      16000,
      15000,
      14000,
      13000,
      12000,
      11000,
      10000,
      9000,
      8000,
      7000,
      6000,
      5000,
      4500,
      4000,
      3500,
      3000,
      2500,
      2000,
      1500,
      1250,
      1000,
      750,
      500,
      250,
      0
    ],
    "thresholds": [
      15000,
      5000,
      0
    ]
  }
} as const;

it.each(Object.entries(printed))('preserves every printed %s survivor step on client and server', (ship, track) => {
  expect(populationTrackForShip(ship)).toEqual(track);
  expect(serverTrack(ship)).toEqual(track);
  for (let index = 0; index < track.steps.length - 1; index++) {
    const current = track.steps[index]!;
    const next = track.steps[index + 1]!;
    expect(populationChange(ship, current, -1, false)).toEqual({ amount: next, alertRaised: (track.thresholds as readonly number[]).includes(next) });
  }
  expect(() => populationChange(ship, track.steps[0], 1, false)).toThrow();
  expect(() => populationChange(ship, 0, -1, false)).toThrow();
  expect(() => populationChange(ship, 123, -1, false)).toThrow();
  expect(() => populationChange(ship, track.thresholds[0], -1, true)).toThrow();
});
