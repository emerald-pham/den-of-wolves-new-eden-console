import { describe, expect, it } from 'vitest';
import { recommendedRoleIds } from './roleConfiguration';
import { resolveWolfSupplySabotage } from './wolfSupplySabotage';

const base = {
  coverRoleId: 'dione-engineer',
  activeRoleIds: recommendedRoleIds(18),
  shuttleCargo: {
    philia: { food: 5, water: 4 },
    maliades: { materials: 1 },
  },
  shuttleId: 'philia',
  resourceId: 'food' as const,
};

describe('Wolf supply sabotage', () => {
  it('destroys the floor half of one controlled-shuttle resource and preserves the rest', () => {
    expect(resolveWolfSupplySabotage(base)).toEqual({
      cargo: {
        philia: { food: 3, water: 4 },
        maliades: { materials: 1 },
      },
      destroyedAmount: 2,
      remainingAmount: 3,
    });
    expect(resolveWolfSupplySabotage({ ...base, resourceId: 'water' })).toMatchObject({
      destroyedAmount: 2,
      remainingAmount: 2,
    });
  });

  it('applies printed floor-loss rounding without inventing a minimum loss', () => {
    expect(resolveWolfSupplySabotage({
      ...base,
      shuttleCargo: { philia: { materials: 1 } },
      resourceId: 'materials',
    })).toMatchObject({ destroyedAmount: 0, remainingAmount: 1 });
  });

  it.each([
    ['another role shuttle', { shuttleId: 'starlight' }],
    ['fighter wing', { shuttleId: 'fighter-wing-alpha' }],
    ['empty resource', { shuttleCargo: { philia: { food: 0 } } }],
    ['unknown resource', { resourceId: 'medicine' }],
    ['unknown cargo shuttle', { shuttleCargo: { ghost: { food: 4 } } }],
    ['fractional cargo', { shuttleCargo: { philia: { food: 2.5 } } }],
    ['unsafe cargo', { shuttleCargo: { philia: { food: Number.MAX_SAFE_INTEGER + 1 } } }],
    ['scrap on ordinary shuttle', { shuttleCargo: { philia: { scrap: 4 } }, resourceId: 'scrap' }],
    ['unknown cover role', { coverRoleId: 'space-wizard' }],
    ['inactive cover role', { activeRoleIds: recommendedRoleIds(10) }],
    ['malformed active roster', { activeRoleIds: [...recommendedRoleIds(18), 'space-wizard'] }],
  ] as const)('rejects %s before producing a consequence', (_label, patch) => {
    expect(() => resolveWolfSupplySabotage({
      ...base,
      ...patch,
    } as typeof base)).toThrow();
  });
});
