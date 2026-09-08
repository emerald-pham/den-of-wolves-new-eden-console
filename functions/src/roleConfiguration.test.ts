import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTIVE_ROLE_IDS,
  isJointEngineeringRoleAvailable,
  isValidRoleConfiguration,
  ROLE_IDS,
  recommendedRoleIds,
} from './roleConfiguration';

const EXPECTED_PRINTED_ROSTERS: Readonly<Record<number, readonly string[]>> = {
  8: [
    'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
    'quellon-explorer', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ],
  9: [
    'admiral', 'wing-commander', 'icebreaker-engineer', 'icebreaker-miner',
    'shepherd-engineer', 'shepherd-scientist', 'quellon-explorer',
    'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
  ],
  10: [
    'admiral', 'wing-commander', 'icebreaker-engineer', 'icebreaker-miner',
    'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer',
    'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
  ],
  11: [
    'admiral', 'executive-officer', 'wing-commander', 'icebreaker-engineer',
    'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist',
    'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer',
    'refinery-124-pdf-colonel',
  ],
  12: [
    'admiral', 'wing-commander', 'dione-engineer', 'dione-president',
    'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer',
    'shepherd-scientist', 'quellon-engineer', 'quellon-explorer',
    'refinery-124-engineer', 'refinery-124-pdf-colonel',
  ],
  13: [
    'admiral', 'executive-officer', 'wing-commander', 'dione-engineer',
    'dione-president', 'icebreaker-engineer', 'icebreaker-miner',
    'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer',
    'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
  ],
  14: [
    'admiral', 'wing-commander', 'dione-captain', 'dione-president',
    'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain',
    'shepherd-scientist', 'quellon-captain', 'quellon-explorer',
    'refinery-124-captain', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ],
  15: [
    'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
    'dione-president', 'icebreaker-captain', 'icebreaker-miner',
    'shepherd-captain', 'shepherd-scientist', 'quellon-captain',
    'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ],
  16: [
    'admiral', 'wing-commander', 'dione-captain', 'dione-president',
    'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
    'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
    'quellon-captain', 'quellon-engineer', 'quellon-explorer',
    'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
  ],
  17: [
    'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
    'dione-president', 'icebreaker-captain', 'icebreaker-engineer',
    'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer',
    'shepherd-scientist', 'quellon-captain', 'quellon-engineer',
    'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer',
    'refinery-124-pdf-colonel',
  ],
  18: [
    'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
    'dione-engineer', 'dione-president', 'icebreaker-captain',
    'icebreaker-engineer', 'icebreaker-miner', 'shepherd-captain',
    'shepherd-engineer', 'shepherd-scientist', 'quellon-captain',
    'quellon-engineer', 'quellon-explorer', 'refinery-124-captain',
    'refinery-124-engineer', 'refinery-124-pdf-colonel',
  ],
};

describe('role configuration', () => {
  it('selects the exact ordered printed roster for every supported count', () => {
    for (const [playerCountText, expected] of Object.entries(EXPECTED_PRINTED_ROSTERS)) {
      const playerCount = Number(playerCountText);
      const actual = recommendedRoleIds(playerCount);
      expect(actual, `player count ${playerCount}`).toEqual(expected);
      expect(actual).toHaveLength(playerCount);
      expect(new Set(actual).size).toBe(playerCount);
      expect(isValidRoleConfiguration(actual)).toBe(true);
      expect(actual).not.toContain('press-officer');
      expect(actual).not.toContain('capybara-captain');
      expect(actual).not.toContain('capybara-recycler');
    }
  });

  it('keeps union roles off by default and allows every known role', () => {
    expect(ROLE_IDS).toContain('joint-engineering-quellon-refinery');
    expect(DEFAULT_ACTIVE_ROLE_IDS).not.toContain('joint-engineering-quellon-refinery');
  });

  it('keeps the owner-set 20-core preset separate from Press', () => {
    expect(recommendedRoleIds(19)).toEqual([]);
    expect(recommendedRoleIds(20)).toContain('capybara-recycler');
    expect(recommendedRoleIds(21)).toEqual([]);
    expect(isValidRoleConfiguration([...recommendedRoleIds(20), 'press-officer'])).toBe(false);
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
