import { describe, expect, it } from 'vitest';
import {
  acknowledgePopulationAlert,
  populationChange,
  populationForShip,
  populationTrackForShip,
} from './shipPopulation';

describe('Capybara survivor track', () => {
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
