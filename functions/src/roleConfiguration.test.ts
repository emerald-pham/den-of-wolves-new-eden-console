import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTIVE_ROLE_IDS,
  isJointEngineeringRoleAvailable,
  isValidRoleConfiguration,
  ROLE_IDS,
  recommendedRoleIds,
} from './roleConfiguration';

describe('role configuration', () => {
  it('keeps union roles off by default and allows every known role', () => {
    expect(ROLE_IDS).toContain('joint-engineering-quellon-refinery');
    expect(DEFAULT_ACTIVE_ROLE_IDS).not.toContain('joint-engineering-quellon-refinery');
  });

  it('configures the extended player presets', () => {
    expect(recommendedRoleIds(19)).toContain('press-officer');
    expect(recommendedRoleIds(20)).toContain('capybara-recycler');
    expect(recommendedRoleIds(21)).toEqual(expect.arrayContaining([
      'press-officer', 'capybara-captain', 'capybara-recycler',
    ]));
  });

  it('keeps each Union station in exactly its printed roster rows', () => {
    const quellonRefinery = 'joint-engineering-quellon-refinery';
    const shepherdIcebreaker = 'joint-engineering-shepherd-icebreaker';

    for (const playerCount of [8, 9, 14, 15]) {
      expect(isJointEngineeringRoleAvailable(recommendedRoleIds(playerCount), quellonRefinery)).toBe(true);
    }
    for (const playerCount of [8, 14, 15]) {
      expect(isJointEngineeringRoleAvailable(recommendedRoleIds(playerCount), shepherdIcebreaker)).toBe(true);
    }
    expect(isJointEngineeringRoleAvailable(recommendedRoleIds(9), shepherdIcebreaker)).toBe(false);
  });

  it('allows Union replacement coverage only below the full roster and without its paired engineers', () => {
    const roleId = 'joint-engineering-quellon-refinery';

    expect(isJointEngineeringRoleAvailable(recommendedRoleIds(14), roleId)).toBe(true);
    expect(isJointEngineeringRoleAvailable([...recommendedRoleIds(14), 'quellon-engineer'], roleId))
      .toBe(false);
    expect(isJointEngineeringRoleAvailable([...recommendedRoleIds(18), roleId], roleId))
      .toBe(false);
    expect(isJointEngineeringRoleAvailable([
      ...recommendedRoleIds(11).filter((configuredRoleId) =>
        configuredRoleId !== 'quellon-engineer' && configuredRoleId !== 'refinery-124-engineer'),
      roleId,
    ], roleId)).toBe(false);
    expect(isValidRoleConfiguration(recommendedRoleIds(14))).toBe(true);
    expect(isValidRoleConfiguration([...recommendedRoleIds(14), 'quellon-engineer'])).toBe(false);
  });
});
