import { describe, expect, it } from 'vitest';
import { chooseWolfRoles } from './wolfAssignment';

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
});
