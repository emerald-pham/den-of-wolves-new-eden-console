import { describe, expect, it } from 'vitest';
import {
  configuredWolfAttackTargetRing,
} from './wolfAttackTargetRing';

describe('configured Wolf attack target ring', () => {
  it('uses the canonical five active full ships for a valid 8–11 player base roster', () => {
    expect(configuredWolfAttackTargetRing([
      'aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ])).toEqual(['aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124']);
  });

  it('preserves the printed six- and seven-target rings when all ships are active', () => {
    expect(configuredWolfAttackTargetRing([
      'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ])).toEqual(['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124']);
    expect(configuredWolfAttackTargetRing([
      'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
    ])).toEqual(['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara']);
  });

  it('does not admit inactive targets or tolerate omission of another required core vessel', () => {
    expect(configuredWolfAttackTargetRing([
      'aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara',
    ])).toEqual(['aegis', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara']);
    expect(() => configuredWolfAttackTargetRing([
      'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
    ])).toThrow(/required active fleet vessels/i);
  });
});
