import { describe, expect, it } from 'vitest';
import {
  isJointEngineeringRoleAvailable,
  isValidRoleConfiguration,
  recommendedRoleIds,
} from './rolePresets';

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

describe('recommended player-count role presets', () => {
  it('selects the exact ordered printed roster for every supported count', () => {
    for (const [playerCountText, expected] of Object.entries(EXPECTED_PRINTED_ROSTERS)) {
      const playerCount = Number(playerCountText);
      const actual = recommendedRoleIds(playerCount);
      expect(actual, `player count ${playerCount}`).toEqual(expected);
      expect(actual).toHaveLength(playerCount);
      expect(new Set(actual).size).toBe(playerCount);
      expect(actual).not.toContain('press-officer');
      expect(actual).not.toContain('capybara-captain');
      expect(actual).not.toContain('capybara-recycler');
    }
  });

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
