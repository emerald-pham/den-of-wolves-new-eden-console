import { describe, expect, it } from 'vitest';
import {
  authoritativePursuitValue,
  MAX_PURSUIT,
  pursuitDistanceForCoordinate,
  pursuitStatusForScore,
} from './pursuit';

describe('pursuit track calculations', () => {
  it('uses the printed shortest-route depth for a system position', () => {
    expect(pursuitDistanceForCoordinate('0000')).toBe(0);
    expect(pursuitDistanceForCoordinate('8378', 6)).toBe(6);
    expect(pursuitDistanceForCoordinate('4888', 7)).toBe(7);
  });

  it('accepts only an authoritative value on the printed 0–10 track', () => {
    expect(authoritativePursuitValue(2)).toBe(2);
    expect(authoritativePursuitValue(MAX_PURSUIT)).toBe(MAX_PURSUIT);
    for (const stale of [-1, 11, 2.5, Number.NaN, undefined, '10']) {
      expect(authoritativePursuitValue(stale)).toBeUndefined();
    }
    expect(pursuitStatusForScore(MAX_PURSUIT)).toBe('surrounded');
    expect(pursuitStatusForScore(8)).toBe('critical');
    expect(pursuitStatusForScore(7)).toBe('tracked');
  });
});
