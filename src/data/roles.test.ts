import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVE_ROLE_IDS, rolesForShip } from './roles';

describe('fleet console roles', () => {
  it.each([
    ['aegis', ['Admiral', 'Executive Officer', 'Wing Commander']],
    ['dione', ['Captain', 'Engineer', 'President']],
    ['icebreaker', ['Captain', 'Engineer', 'Miner']],
    ['quellon', ['Captain', 'Engineer', 'Explorer']],
    ['shepherd', ['Captain', 'Engineer', 'Scientist']],
    ['refinery-124', ['Captain', 'Engineer', 'P.D.F. Colonel']],
    ['capybara', ['Capybara Captain', 'Capybara Recycler']],
  ])('defines the pictured %s stations', (shipId, names) => {
    expect(rolesForShip(shipId).map(({ name }) => name)).toEqual(names);
  });

  it('defines two Joint Engineering Union seats that start disabled', () => {
    const union = rolesForShip('joint-engineering-union');
    expect(union.map(({ name }) => name)).toEqual([
      'Quellon / Refinery Engineer',
      'Shepherd / Icebreaker Engineer',
    ]);
    expect(union.every(({ id }) => !DEFAULT_ACTIVE_ROLE_IDS.includes(id))).toBe(true);
  });
});
