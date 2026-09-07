import { describe, expect, it } from 'vitest';
import {
  DRADIS_MEDIUM_RANGE_MAX_METERS,
  DRADIS_METERS_PER_UNIT,
  DRADIS_SHORT_RANGE_MAX_METERS,
  combatRangeForMeters,
  distanceMetersBetween,
  ambientCombatRange,
} from './dradisRange';

describe('DRADIS contact range summaries', () => {
  it('summarizes measured meters into the three gameplay bands', () => {
    expect(combatRangeForMeters(0)).toBe('short');
    expect(combatRangeForMeters(DRADIS_SHORT_RANGE_MAX_METERS)).toBe('short');
    expect(combatRangeForMeters(DRADIS_SHORT_RANGE_MAX_METERS + 1)).toBe('medium');
    expect(combatRangeForMeters(DRADIS_MEDIUM_RANGE_MAX_METERS)).toBe('medium');
    expect(combatRangeForMeters(DRADIS_MEDIUM_RANGE_MAX_METERS + 1)).toBe('long');
  });

  it('measures an unknown contact from the selected ship origin', () => {
    const object = { x: 0.9, y: 0, z: 0 };
    const aegis = { x: 0, y: 0, z: 0 };
    const capybara = { x: 0.75, y: 0, z: 0 };

    expect(distanceMetersBetween(object, aegis)).toBeCloseTo(0.9 * DRADIS_METERS_PER_UNIT);
    expect(distanceMetersBetween(object, capybara)).toBeCloseTo(0.15 * DRADIS_METERS_PER_UNIT);
    expect(ambientCombatRange(object, aegis)).toBe('long');
    expect(ambientCombatRange(object, capybara)).toBe('short');
  });
});
