import { describe, expect, it } from 'vitest';
import { rolesForShip } from '@/data/roles';
import {
  SCAFFOLDED_CONSOLE_SHIP_IDS,
  SCAFFOLDED_CONSOLE_ROLE_IDS,
  isScaffoldedConsoleRole,
} from './shipConsoleWorkspaces';

describe('fleet console workspace scaffolds', () => {
  it('covers every role on each remaining fleet ship', () => {
    expect(SCAFFOLDED_CONSOLE_SHIP_IDS).toEqual([
      'dione', 'icebreaker', 'capybara', 'shepherd', 'quellon', 'refinery-124',
    ]);

    const expectedRoleIds = SCAFFOLDED_CONSOLE_SHIP_IDS.flatMap((shipId) =>
      rolesForShip(shipId).map((role) => role.id));
    expect(SCAFFOLDED_CONSOLE_ROLE_IDS).toEqual(expectedRoleIds);
  });

  it('does not scaffold AEGIS, shuttle, or joint-engineering roles', () => {
    expect(isScaffoldedConsoleRole('aegis', 'executive-officer')).toBe(false);
    expect(isScaffoldedConsoleRole('press', 'press-officer')).toBe(false);
    expect(isScaffoldedConsoleRole(
      'joint-engineering-union',
      'joint-engineering-quellon-refinery',
    )).toBe(false);
  });
});
