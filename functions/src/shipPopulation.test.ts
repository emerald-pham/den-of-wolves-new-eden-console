import { describe, expect, it } from 'vitest';
import {
  acknowledgePopulationAlert,
  capybaraRationSchedule,
  INITIAL_SHIP_SURVIVORS,
  populationChange,
  populationForShip,
  populationTrackForShip,
} from './shipPopulation';

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
  it.each([-1, 20_001, 14_999, 1.5, Number.NaN])('rejects invalid Capybara population %s', population => {
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
    expect(() => populationChange('capybara',5500,-1,false)).toThrow();
    expect(() => populationChange('capybara',0,-1,false)).toThrow();
    expect(() => populationChange('capybara',20000,1,false)).toThrow();
    expect(() => populationChange('capybara',15000,-1,true)).toThrow();
  });
  it('acknowledges only the targeted GM and does not mutate other recipients', () => {
    expect(acknowledgePopulationAlert(['gm1','gm2'],'gm1')).toEqual(['gm2']);
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
