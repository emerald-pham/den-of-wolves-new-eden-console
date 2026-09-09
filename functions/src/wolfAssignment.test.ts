import { describe, expect, it } from 'vitest';
import { chooseWolfRoles, deriveRoutineWolfAssignment } from './wolfAssignment';

describe('wolf assignment', () => {
  it('chooses the requested number of distinct enabled roles', () => {
    const randomValues = [2, 0];
    const chosen = chooseWolfRoles(
      ['press-officer', 'navigator', 'engineer'],
      2,
      (upperBound) => (randomValues.shift() ?? 0) % upperBound,
    );

    expect(chosen).toHaveLength(2);
    expect(new Set(chosen).size).toBe(2);
    expect(chosen.every((roleId) =>
      ['press-officer', 'navigator', 'engineer'].includes(roleId))).toBe(true);
  });

  it('rejects more wolves than enabled roles', () => {
    expect(() => chooseWolfRoles(['press-officer'], 2, () => 0))
      .toThrow(/enabled roles/i);
  });

  it('derives routine Wolf count and eligible pool from the locked core plus one claimed Press holder', () => {
    const result = deriveRoutineWolfAssignment({
      playerCount: 20,
      occupiedCoreRoleIds: ['admiral', 'icebreaker-miner', 'shepherd-scientist'],
      pressEnabled: true,
      claimedPressRoleId: 'press-officer',
      randomIndex: () => 0,
    });

    expect(result.wolfCount).toBe(2);
    expect(result.eligibleRoleIds).toEqual([
      'admiral', 'icebreaker-miner', 'shepherd-scientist', 'press-officer',
    ]);
    expect(result.selectedRoleIds).toHaveLength(2);
    expect(result.selectedRoleIds).not.toContain('gm');
  });

  it('never adds Press or a third role when Press is disabled or unclaimed', () => {
    const result = deriveRoutineWolfAssignment({
      playerCount: 20,
      occupiedCoreRoleIds: ['admiral', 'icebreaker-miner', 'shepherd-scientist'],
      pressEnabled: false,
      claimedPressRoleId: null,
      randomIndex: () => 0,
    });

    expect(result.wolfCount).toBe(2);
    expect(result.eligibleRoleIds).toEqual([
      'admiral', 'icebreaker-miner', 'shepherd-scientist',
    ]);
    expect(result.selectedRoleIds).toHaveLength(2);
    expect(result.selectedRoleIds).not.toContain('press-officer');
  });
});
