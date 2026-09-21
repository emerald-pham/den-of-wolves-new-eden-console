import { describe, expect, it } from 'vitest';
import {
  remainingConsoleSabotageTargets,
  requireWolfConsoleVisitWindow,
  resolveWolfConsoleSabotage,
} from './wolfConsoleSabotage';

describe('Wolf console sabotage', () => {
  it('draws a remaining console on the server and assigns two suspicion', () => {
    const result = resolveWolfConsoleSabotage({
      shipId: 'aegis',
      damage: { damagedSystemIds: ['fighter-bay-alpha'], destroyed: false },
      mode: 'random',
    }, () => 0);
    expect(result).toMatchObject({
      mode: 'random', suspicionIncrement: 2,
      card: { systemId: 'fighter-bay-bravo' },
      state: { damagedSystemIds: ['fighter-bay-alpha', 'fighter-bay-bravo'], destroyed: false },
    });
  });

  it('accepts only an undamaged chosen console and assigns four suspicion', () => {
    const result = resolveWolfConsoleSabotage({
      shipId: 'dione',
      damage: { damagedSystemIds: ['storage'], destroyed: false },
      mode: 'chosen',
      chosenSystemId: 'reactor',
    }, () => { throw new Error('chosen mode must not draw'); });
    expect(result).toMatchObject({
      mode: 'chosen', suspicionIncrement: 4, card: { systemId: 'reactor' },
    });
    expect(() => resolveWolfConsoleSabotage({
      shipId: 'dione', damage: result.state, mode: 'chosen', chosenSystemId: 'reactor',
    }, () => 0)).toThrow('chosen console is unavailable');
  });

  it('excludes armour from both target modes', () => {
    const remaining = remainingConsoleSabotageTargets('aegis', {
      damagedSystemIds: [
        'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control', 'missile-launchers',
        'point-defence-lasers', 'storage', 'jump-drive', 'reactor', 'construction-bay',
        'shuttle-bay-zeta', 'shuttle-bay-omega',
      ],
      destroyed: false,
    });
    expect(remaining).toEqual([]);
  });

  it('enforces the server-timed ten-to-sixty-second visit window', () => {
    expect(() => requireWolfConsoleVisitWindow(1_000, 10_999)).toThrow('at least 10 seconds');
    expect(() => requireWolfConsoleVisitWindow(1_000, 11_000)).not.toThrow();
    expect(() => requireWolfConsoleVisitWindow(1_000, 61_000)).not.toThrow();
    expect(() => requireWolfConsoleVisitWindow(1_000, 61_001)).toThrow('expired');
  });
});
