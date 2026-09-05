import { describe, expect, it } from 'vitest';
import {
  generateSurvivorPopulation,
  shouldRefreshSurvivorPopulation,
} from './survivorPopulation';

describe('survivor population', () => {
  it('generates only permitted values in the survivor range', () => {
    expect(generateSurvivorPopulation(() => 0)).toBe(222_501);
    expect(generateSurvivorPopulation(() => 0.999_999)).toBe(242_499);
  });

  it('holds the app-wide value through its seven-day activity window', () => {
    const lastActivity = new Date('2026-01-01T00:00:00.000Z');

    expect(shouldRefreshSurvivorPopulation(lastActivity, new Date('2026-01-07T23:59:59.999Z')))
      .toBe(false);
    expect(shouldRefreshSurvivorPopulation(lastActivity, new Date('2026-01-08T00:00:00.000Z')))
      .toBe(true);
  });
});
