import { describe, expect, it } from 'vitest';
import {
  ownedCraftIdsForRole,
  roleOwnedCraftForRoles,
  roleOwnedCraftManifestForSetup,
  roleOwnedCraftManifestMatches,
} from './craftOwnership';

describe('role-owned craft composition', () => {
  it('derives every represented shuttle and fighter wing from the active printed roles', () => {
    const craft = roleOwnedCraftForRoles([
      'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
      'quellon-explorer', 'refinery-124-pdf-colonel',
      'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
    ]);

    expect(craft.map(({ id }) => id)).toEqual([
      'snn-press-shuttle', 'starlight', 'fighter-wing-alpha', 'fighter-wing-bravo',
      'highwall', 'endeavour', 'hummingbird', 'chepu', 'pdf-escort-fighter-wing',
      'wobbly', 'ally',
    ]);
    expect(craft.every(({ ownerRoleId }) => [
      'press-officer', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
      'quellon-explorer', 'refinery-124-pdf-colonel',
      'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
    ].includes(ownerRoleId))).toBe(true);
    expect(craft.map(({ id }) => id)).not.toContain('macaw');
    expect(craft.map(({ id }) => id)).not.toContain('pallas');
  });

  it('adds expansion craft only when both Capybara roles are active', () => {
    const craft = roleOwnedCraftForRoles([
      'admiral', 'wing-commander', 'capybara-captain', 'capybara-recycler',
    ]);
    expect(craft.map(({ id }) => id)).toEqual(expect.arrayContaining(['macaw', 'boa']));
    expect(ownedCraftIdsForRole('capybara-captain', [
      'admiral', 'wing-commander', 'capybara-captain', 'capybara-recycler',
    ])).toEqual(['macaw']);
  });

  it('rejects a changed owner or mode in the persisted server manifest', () => {
    const expected = roleOwnedCraftManifestForSetup(['admiral', 'wing-commander'], 'base-capybara');
    expect(roleOwnedCraftManifestMatches(expected, expected)).toBe(true);
    expect(roleOwnedCraftManifestMatches({
      ...expected,
      roleOwnedCraft: expected.roleOwnedCraft.map((craft, index) =>
        index === 1 ? { ...craft, ownerRoleId: 'admiral' } : craft),
    }, expected)).toBe(false);
    expect(roleOwnedCraftManifestMatches({ ...expected, vesselMode: 'expansion-capybara' }, expected)).toBe(false);
  });
});
