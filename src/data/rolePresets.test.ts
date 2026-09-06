import { describe, expect, it } from 'vitest';
import {
  isJointEngineeringRoleAvailable,
  isValidRoleConfiguration,
  recommendedRoleIds,
} from './rolePresets';

describe('recommended player-count role presets', () => {
  it('uses the Joint Engineering Union only in the low-count matrix presets', () => {
    expect(recommendedRoleIds(8)).toEqual(expect.arrayContaining([
      'joint-engineering-quellon-refinery',
      'joint-engineering-shepherd-icebreaker',
    ]));
    expect(recommendedRoleIds(18)).not.toContain('joint-engineering-quellon-refinery');
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
    expect(isJointEngineeringRoleAvailable(recommendedRoleIds(16), quellonRefinery)).toBe(false);
  });

  it('treats Union engineers as low-count replacements for their paired ship engineers', () => {
    const quellonRefinery = 'joint-engineering-quellon-refinery';
    const shepherdIcebreaker = 'joint-engineering-shepherd-icebreaker';

    expect(isJointEngineeringRoleAvailable(recommendedRoleIds(14), quellonRefinery)).toBe(true);
    expect(isJointEngineeringRoleAvailable(recommendedRoleIds(14), shepherdIcebreaker)).toBe(true);
    expect(isJointEngineeringRoleAvailable([
      ...recommendedRoleIds(14), 'quellon-engineer',
    ], quellonRefinery)).toBe(false);
    expect(isJointEngineeringRoleAvailable([
      ...recommendedRoleIds(18), quellonRefinery,
    ], quellonRefinery)).toBe(false);
    expect(isJointEngineeringRoleAvailable([
      ...recommendedRoleIds(11).filter((roleId) =>
        roleId !== 'quellon-engineer' && roleId !== 'refinery-124-engineer'),
      quellonRefinery,
    ], quellonRefinery)).toBe(false);
    expect(isValidRoleConfiguration(recommendedRoleIds(14))).toBe(true);
    expect(isValidRoleConfiguration([
      ...recommendedRoleIds(14), 'quellon-engineer',
    ])).toBe(false);
  });

  it('keeps Capybara for 20+ and combines Capybara with Press at 21', () => {
    expect(recommendedRoleIds(19)).toContain('press-officer');
    expect(recommendedRoleIds(19)).not.toContain('capybara-captain');
    expect(recommendedRoleIds(20)).toEqual(expect.arrayContaining([
      'capybara-captain', 'capybara-recycler',
    ]));
    expect(recommendedRoleIds(20)).not.toContain('press-officer');
    expect(recommendedRoleIds(21)).toEqual(expect.arrayContaining([
      'capybara-captain', 'capybara-recycler', 'press-officer',
    ]));
  });
});
