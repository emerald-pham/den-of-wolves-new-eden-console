import { describe, expect, it } from 'vitest';
import { rolesForShip } from './roles';

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
});
