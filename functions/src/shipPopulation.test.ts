import { describe, expect, it } from 'vitest';
import {
  acknowledgePopulationAlert,
  capybaraRationSchedule,
  INITIAL_SHIP_SURVIVORS,
  populationChange,
  populationForShip,
  populationTrackForShip,
  shipRationSchedule,
} from './shipPopulation';

it.each([
  ['dione', 100_000, '90001-100000', [0, 6, 12, 18], [0, 6, 11, 14]],
  ['dione', 90_000, '70001-90000', [0, 5, 11, 16], [0, 5, 10, 13]],
  ['dione', 70_000, '50001-70000', [0, 5, 10, 14], [0, 4, 9, 12]],
  ['dione', 50_000, '35001-50000', [0, 4, 9, 13], [0, 4, 7, 10]],
  ['dione', 35_000, '25001-35000', [0, 4, 8, 12], [0, 3, 6, 9]],
  ['dione', 25_000, '15001-25000', [0, 3, 7, 11], [0, 2, 5, 8]],
  ['dione', 15_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
  ['dione', 5_000, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
  ['dione', 0, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
  ['icebreaker', 34_000, '25001-35000', [0, 4, 8, 12], [0, 3, 6, 9]],
  ['shepherd', 24_000, '15001-25000', [0, 3, 7, 11], [0, 2, 5, 8]],
  ['quellon', 15_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
  ['refinery-124', 5_000, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
  ['aegis', 2_500, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
] as const)('selects printed %s replacement at %i survivors', (shipId, population, populationBand, food, water) => {
  expect(shipRationSchedule(shipId, population)).toEqual({ populationBand, food, water });
});

it('uses printed ration bands for exact rescued-survivor counts between track steps', () => {
  expect(shipRationSchedule('dione', 69_999).populationBand).toBe('50001-70000');
  expect(shipRationSchedule('aegis', 1750).populationBand).toBe('1-5000');
  expect(() => shipRationSchedule('dione', 100001)).toThrow(/printed track/i);
});

it('initializes the current survivor count for every fleet ship', () => {
  expect(INITIAL_SHIP_SURVIVORS).toEqual({
    aegis: 2500,
    dione: 100000,
    icebreaker: 40000,
    capybara: 20000,
    shepherd: 30000,
    quellon: 30000,
    'refinery-124': 20000,
  });
});

describe('Capybara survivor track', () => {
  it.each([
    [20_000, '15001-20000', [0, 3, 7, 11], [0, 2, 5, 8]],
    [16_000, '15001-20000', [0, 3, 7, 11], [0, 2, 5, 8]],
    [15_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
    [6_000, '5001-15000', [0, 3, 6, 10], [0, 2, 4, 7]],
    [5_000, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
    [250, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
    [0, '1-5000', [0, 3, 5, 8], [0, 2, 3, 6]],
  ] as const)('selects the printed replacement schedule at %i survivors',
    (population, populationBand, food, water) => {
      expect(capybaraRationSchedule(population)).toEqual({ populationBand, food, water });
    });
  it.each([-1, 20_001, 1.5, Number.NaN])('rejects invalid Capybara population %s', population => {
    expect(() => capybaraRationSchedule(population)).toThrow(/printed track/i);
  });
  it('preserves every printed step and the initial population', () => {
    expect(populationTrackForShip('capybara')?.steps).toEqual([20000,18500,17000,16000,15000,14000,13000,12000,11000,10000,9000,8000,7000,6000,5000,4500,4000,3500,3000,2500,2000,1500,1250,1000,750,500,250,0]);
    expect(populationForShip('capybara')).toBe(20000);
  });
  it('advances one printed step, including unequal numerical gaps', () => {
    expect(populationChange('capybara', 20000, -1, false)).toEqual({ amount: 18500, alertRaised: false });
    expect(populationChange('capybara', 1250, 1, false)).toEqual({ amount: 1500, alertRaised: false });
  });
  it.each([[16000,-1,15000],[6000,-1,5000],[250,-1,0],[14000,1,15000]])('alerts upon reaching a red step from %i', (from, delta, amount) => {
    expect(populationChange('capybara', from, delta as -1 | 1, false)).toEqual({ amount, alertRaised: true });
  });
  it('rejects off-track values, endpoints and pending alerts', () => {
    expect(populationChange('capybara',5500,-1,false)).toEqual({ amount: 5000, alertRaised: true });
    expect(populationChange('capybara',5500,1,false)).toEqual({ amount: 6000, alertRaised: false });
    expect(() => populationChange('capybara',0,-1,false)).toThrow();
    expect(() => populationChange('capybara',20000,1,false)).toThrow();
    expect(() => populationChange('capybara',15000,-1,true)).toThrow();
  });
  it('lets one targeted GM own the consequence without waiting for optional instances', () => {
    expect(acknowledgePopulationAlert(['gm1','gm2'],'gm1')).toEqual([]);
    expect(acknowledgePopulationAlert(['gm1'],'stranger')).toEqual(['gm1']);
  });
});

describe('AEGIS survivor track', () => {
  it('preserves the complete printed low-population ladder and 0 alert', () => {
    expect(populationTrackForShip('aegis')).toEqual({
      steps: [2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0],
      thresholds: [0],
    });
    expect(populationForShip('aegis')).toBe(2500);
    expect(populationChange('aegis', 250, -1, false))
      .toEqual({ amount: 0, alertRaised: true });
  });
});

it('preserves exact rescue totals until the next explicitly requested printed population step', () => {
  expect(capybaraRationSchedule(14750).populationBand).toBe('5001-15000');
  expect(populationChange('dione',95750,-1,false)).toEqual({ amount: 95000, alertRaised: false });
  expect(() => populationChange('dione',100001,-1,false)).toThrow();
});
