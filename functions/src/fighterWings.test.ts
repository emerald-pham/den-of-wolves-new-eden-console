import { describe, expect, it } from 'vitest';
import {
  FIGHTER_WING_CAPACITY,
  fighterWingCapacity,
  fighterWingCounts,
  initialFighterWingCounts,
} from './fighterWings';

describe('fighter wing state', () => {
  it('starts both new AEGIS wings at four fighters with independent revisions', () => {
    expect(initialFighterWingCounts()).toEqual({
      'fighter-wing-alpha': { count: 4, revision: 0 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    });
  });

  it('keeps malformed or over-capacity projections unavailable', () => {
    expect(fighterWingCounts({
      'fighter-wing-alpha': { count: 6, revision: 3 },
      'fighter-wing-bravo': { count: 7, revision: 1 },
      'private-wing': { count: 2, revision: 1 },
    })).toEqual({ 'fighter-wing-alpha': { count: 6, revision: 3 } });
  });

  it('derives effective capacity only from the authoritative Construction Bay upgrade', () => {
    expect(fighterWingCapacity({ aegis: [] })).toBe(FIGHTER_WING_CAPACITY.standard);
    expect(fighterWingCapacity({ aegis: ['construction-bay'] })).toBe(FIGHTER_WING_CAPACITY.upgraded);
    expect(fighterWingCapacity({ aegis: ['construction-bay', 'private-value'] })).toBe(6);
  });
});
