import { describe, expect, it } from 'vitest';
import { isGameplayLockedAtTurnZero, isInGameRoute } from './gameContext';

describe('gameplay route boundary', () => {
  it.each(['/roles', '/console', '/ships/aegis/roles', '/gm'])('%s is out of game', (path) => {
    expect(isInGameRoute(path)).toBe(false);
  });

  it.each([
    '/ships/aegis/roles/admiral',
    '/union/roles/joint-engineering-quellon-refinery',
    '/press',
  ])('%s is in game', (path) => {
    expect(isInGameRoute(path)).toBe(true);
  });
});

describe('turn-zero gameplay lock', () => {
  it('holds player gameplay controls until the GM begins Turn 1', () => {
    expect(isGameplayLockedAtTurnZero({ currentTurn: 0 }, false)).toBe(true);
    expect(isGameplayLockedAtTurnZero({ currentTurn: 0 }, true)).toBe(false);
    expect(isGameplayLockedAtTurnZero({ currentTurn: 1 }, false)).toBe(false);
    expect(isGameplayLockedAtTurnZero({}, false)).toBe(false);
  });
});
