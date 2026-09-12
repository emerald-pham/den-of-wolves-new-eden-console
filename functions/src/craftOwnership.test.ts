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

  it('keeps Condor owned by the Quellon Engineer', () => {
    expect(ownedCraftIdsForRole('quellon-engineer', ['quellon-engineer']))
      .toEqual(['condor']);
  });

  it('keeps Blacksmith owned by the Icebreaker Engineer', () => {
    expect(ownedCraftIdsForRole('icebreaker-engineer', ['icebreaker-engineer']))
      .toEqual(['blacksmith']);
  });

  it('keeps Black Sheep owned by the Shepherd Engineer', () => {
    expect(ownedCraftIdsForRole('shepherd-engineer', ['shepherd-engineer']))
      .toEqual(['black-sheep']);
  });

  it('keeps Chacau owned by the Refinery 124 Engineer', () => {
    expect(ownedCraftIdsForRole('refinery-124-engineer', ['refinery-124-engineer']))
      .toEqual(['chacau']);
  });

  it('keeps Chepu owned by the Refinery 124 PDF Colonel', () => {
    expect(ownedCraftIdsForRole('refinery-124-pdf-colonel', ['refinery-124-pdf-colonel']))
      .toEqual(['chepu', 'pdf-escort-fighter-wing']);
  });

  it('keeps Ally with the Shepherd / Icebreaker Union Engineer pairing', () => {
    expect(ownedCraftIdsForRole(
      'joint-engineering-shepherd-icebreaker',
      ['joint-engineering-shepherd-icebreaker'],
    )).toEqual(['ally']);
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
