import { describe, expect, it } from 'vitest';
import {
  configuredWolfAttackTargetRing,
} from './wolfAttackTargetRing';

describe('configured Wolf attack target ring', () => {
  it('uses the canonical five active full ships for a valid 8–11 player base roster', () => {
    expect(configuredWolfAttackTargetRing([
      'aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ], { playerCount: 8, expansion: 'base' })).toEqual([
      'aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ]);
  });

  it('preserves the printed six- and seven-target rings when all ships are active', () => {
    expect(configuredWolfAttackTargetRing([
      'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ], { playerCount: 12, expansion: 'base' })).toEqual([
      'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ]);
    expect(configuredWolfAttackTargetRing([
      'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
    ], { playerCount: 19, expansion: 'capybara' })).toEqual([
      'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
    ]);
  });

  it('does not admit inactive targets or tolerate omission of another required core vessel', () => {
    expect(() => configuredWolfAttackTargetRing([
      'aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
    ], { playerCount: 8, expansion: 'base' })).toThrow(/Dione is required/i);
    expect(() => configuredWolfAttackTargetRing([
      'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ], { playerCount: 8, expansion: 'base' })).toThrow(/configured active fleet vessels/i);
    expect(() => configuredWolfAttackTargetRing([
      'aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ], { playerCount: 18, expansion: 'base' })).toThrow(/Dione is required/i);
    expect(() => configuredWolfAttackTargetRing([
      'aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
    ], { playerCount: 19, expansion: 'capybara' })).toThrow(/Dione is required/i);
    expect(() => configuredWolfAttackTargetRing([
      'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara-small',
    ], { playerCount: 19, expansion: 'capybara' })).toThrow(/unsupported target vessel/i);
  });
});
