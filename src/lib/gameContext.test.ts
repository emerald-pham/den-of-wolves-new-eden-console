import { describe, expect, it } from 'vitest';
import { isInGameRoute } from './gameContext';

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
