import { describe, expect, it } from 'vitest';
import {
  MAX_PURSUIT,
  pursuitDistanceForCoordinate,
  pursuitScoreForPosition,
  pursuitStatusForScore,
} from './pursuit';

describe('pursuit track calculations', () => {
  it('uses the printed shortest-route depth for a system position', () => {
    expect(pursuitDistanceForCoordinate('0000')).toBe(0);
    expect(pursuitDistanceForCoordinate('8378')).toBe(6);
    expect(pursuitDistanceForCoordinate('4888')).toBe(7);
  });

  it('recalculates a ship position from the turn load and its own depth', () => {
    expect(pursuitScoreForPosition(1, '0000')).toBe(2);
    expect(pursuitScoreForPosition(4, '8378')).toBe(2);
    expect(pursuitScoreForPosition(4, '5143')).toBe(7);
  });

  it('keeps the track inside the printed 0–10 instrument range', () => {
    expect(pursuitScoreForPosition(1, '4888')).toBe(0);
    expect(pursuitScoreForPosition(5, '0000')).toBe(MAX_PURSUIT);
    expect(pursuitStatusForScore(MAX_PURSUIT)).toBe('surrounded');
    expect(pursuitStatusForScore(8)).toBe('critical');
    expect(pursuitStatusForScore(7)).toBe('tracked');
  });
});
