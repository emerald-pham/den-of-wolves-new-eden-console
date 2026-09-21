import { describe, expect, it } from 'vitest';
import {
  ROLE_OWNED_CRAFT_CATALOG,
  battleTableCraftActionsForParkedCraft,
  craftStartingManifestForSetup,
  craftStartingManifestHasUnresolvedHosts,
  craftStartingManifestMatches,
  ownedCraftIdsForRole,
  roleOwnedCraftForRoles,
  roleOwnedCraftManifestForSetup,
  roleOwnedCraftManifestMatches,
  shuttleDockingsMatchRoleOwnedCraft,
} from './craftOwnership';
import { initialShuttleDockingsForRoles } from './shuttlecraft';

describe('role-owned craft composition', () => {
  it('marks only printed range-combat craft for Wolf battle-table actions', () => {
    expect(ROLE_OWNED_CRAFT_CATALOG
      .filter((craft) => craft.wolfAttackRole === 'battle-table')
      .map((craft) => craft.id)).toEqual([
      'fighter-wing-alpha', 'fighter-wing-bravo', 'maliades', 'highwall', 'boa',
      'pdf-escort-fighter-wing',
    ]);
    expect(battleTableCraftActionsForParkedCraft([
      'starlight', 'fighter-wing-alpha', 'pallas', 'maliades', 'highwall', 'blacksmith',
    ])).toEqual([
      { craftId: 'fighter-wing-alpha', kind: 'fighter-wing', ownerRoleId: 'wing-commander' },
      { craftId: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer' },
      { craftId: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner' },
    ]);
    expect(() => battleTableCraftActionsForParkedCraft(['maliades', 'maliades']))
      .toThrow(/unique/i);
    expect(() => battleTableCraftActionsForParkedCraft(['invented-craft']))
      .toThrow(/unknown/i);
  });

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

  it('keeps Endeavour owned by the Shepherd Scientist and off the Wolf battle table', () => {
    expect(ownedCraftIdsForRole('shepherd-scientist', ['shepherd-scientist']))
      .toEqual(['endeavour']);
    expect(ROLE_OWNED_CRAFT_CATALOG.find(({ id }) => id === 'endeavour')).toEqual({
      id: 'endeavour',
      kind: 'shuttle',
      ownerRoleId: 'shepherd-scientist',
      enabledMode: 'standard',
      wolfAttackRole: 'park-only',
    });
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

  it('keeps Chepu and the PDF Escort Fighter Wing owned by the Refinery 124 PDF Colonel', () => {
    expect(ownedCraftIdsForRole('refinery-124-pdf-colonel', ['refinery-124-pdf-colonel']))
      .toEqual(['chepu', 'pdf-escort-fighter-wing']);
  });

  it('keeps Ally with the Shepherd / Icebreaker Union Engineer pairing', () => {
    expect(ownedCraftIdsForRole(
      'joint-engineering-shepherd-icebreaker',
      ['joint-engineering-shepherd-icebreaker'],
    )).toEqual(['ally']);
  });

  it('keeps both AEGIS fighter wings independently owned by the Wing Commander', () => {
    expect(ownedCraftIdsForRole('wing-commander', ['wing-commander']))
      .toEqual(['starlight', 'fighter-wing-alpha', 'fighter-wing-bravo']);
  });

  it('keeps Wobbly owned by the active Quellon/Refinery Union assignment', () => {
    expect(ownedCraftIdsForRole('joint-engineering-quellon-refinery', [
      'joint-engineering-quellon-refinery',
    ])).toEqual(['wobbly']);
  });

  it('rejects a changed owner or mode in the persisted server manifest', () => {
    const expected = roleOwnedCraftManifestForSetup(['admiral', 'wing-commander'], 'base-capybara');
    expect(roleOwnedCraftManifestMatches(expected, expected)).toBe(true);
    expect(roleOwnedCraftManifestMatches({
      ...expected,
      roleOwnedCraft: expected.roleOwnedCraft.map((craft, index) =>
        index === 1 ? { ...craft, ownerRoleId: 'admiral' } : craft),
    }, expected)).toBe(false);
    expect(roleOwnedCraftManifestMatches({
      ...expected,
      roleOwnedCraft: expected.roleOwnedCraft.map((craft, index) =>
        index === 1 ? { ...craft, enabledMode: 'gm-controlled' } : craft),
    }, expected)).toBe(false);
    expect(roleOwnedCraftManifestMatches({ ...expected, vesselMode: 'expansion-capybara' }, expected)).toBe(false);
    expect(roleOwnedCraftManifestMatches({
      ...expected,
      roleOwnedCraft: expected.roleOwnedCraft.map((craft, index) =>
        index === 1 ? { ...craft, wolfAttackRole: 'battle-table' } : craft),
    }, expected)).toBe(false);
  });

  it('composes every craft with its exact starting host, owner, kind, and enabled mode', () => {
    const activeRoleIds = [
      'admiral', 'executive-officer', 'wing-commander',
      'dione-engineer',
      'icebreaker-miner', 'icebreaker-engineer',
      'capybara-captain', 'capybara-recycler',
      'shepherd-scientist', 'shepherd-engineer',
      'quellon-explorer', 'quellon-engineer',
      'refinery-124-engineer', 'refinery-124-pdf-colonel',
      'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
    ];
    const dockings = [
      ...initialShuttleDockingsForRoles(activeRoleIds),
      { shuttleId: 'wobbly', shipId: 'quellon' },
      { shuttleId: 'ally', shipId: 'shepherd' },
    ];
    const manifest = craftStartingManifestForSetup(activeRoleIds, 'expansion-capybara', dockings);
    expect(manifest.entries.map(({
      id, kind, ownerRoleId, enabledMode, wolfAttackRole, startingHostId,
    }) => ({
      id, kind, ownerRoleId, enabledMode, wolfAttackRole, startingHostId,
    }))).toEqual([
      { id: 'snn-press-shuttle', kind: 'shuttle', ownerRoleId: 'press-officer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'dione' },
      { id: 'starlight', kind: 'shuttle', ownerRoleId: 'wing-commander', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'aegis' },
      { id: 'fighter-wing-alpha', kind: 'fighter-wing', ownerRoleId: 'wing-commander', enabledMode: 'standard', wolfAttackRole: 'battle-table', startingHostId: 'aegis' },
      { id: 'fighter-wing-bravo', kind: 'fighter-wing', ownerRoleId: 'wing-commander', enabledMode: 'standard', wolfAttackRole: 'battle-table', startingHostId: 'aegis' },
      { id: 'pallas', kind: 'shuttle', ownerRoleId: 'executive-officer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'aegis' },
      { id: 'philia', kind: 'shuttle', ownerRoleId: 'dione-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'dione' },
      { id: 'maliades', kind: 'shuttle', ownerRoleId: 'dione-engineer', enabledMode: 'standard', wolfAttackRole: 'battle-table', startingHostId: 'dione' },
      { id: 'highwall', kind: 'shuttle', ownerRoleId: 'icebreaker-miner', enabledMode: 'standard', wolfAttackRole: 'battle-table', startingHostId: 'icebreaker' },
      { id: 'blacksmith', kind: 'shuttle', ownerRoleId: 'icebreaker-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'icebreaker' },
      { id: 'macaw', kind: 'shuttle', ownerRoleId: 'capybara-captain', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'capybara' },
      { id: 'boa', kind: 'shuttle', ownerRoleId: 'capybara-recycler', enabledMode: 'standard', wolfAttackRole: 'battle-table', startingHostId: 'capybara' },
      { id: 'endeavour', kind: 'shuttle', ownerRoleId: 'shepherd-scientist', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'shepherd' },
      { id: 'black-sheep', kind: 'shuttle', ownerRoleId: 'shepherd-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'shepherd' },
      { id: 'hummingbird', kind: 'shuttle', ownerRoleId: 'quellon-explorer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'quellon' },
      { id: 'condor', kind: 'shuttle', ownerRoleId: 'quellon-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'quellon' },
      { id: 'chacau', kind: 'shuttle', ownerRoleId: 'refinery-124-engineer', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'refinery-124' },
      { id: 'chepu', kind: 'shuttle', ownerRoleId: 'refinery-124-pdf-colonel', enabledMode: 'standard', wolfAttackRole: 'park-only', startingHostId: 'refinery-124' },
      { id: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel', enabledMode: 'standard', wolfAttackRole: 'battle-table', startingHostId: 'refinery-124' },
      { id: 'wobbly', kind: 'shuttle', ownerRoleId: 'joint-engineering-quellon-refinery', enabledMode: 'gm-controlled', wolfAttackRole: 'park-only', startingHostId: 'quellon' },
      { id: 'ally', kind: 'shuttle', ownerRoleId: 'joint-engineering-shepherd-icebreaker', enabledMode: 'gm-controlled', wolfAttackRole: 'park-only', startingHostId: 'shepherd' },
    ]);
    expect(craftStartingManifestMatches(manifest, manifest, [
      'aegis', 'dione', 'icebreaker', 'capybara', 'shepherd', 'quellon', 'refinery-124',
    ])).toBe(true);
  });

  it('fails closed for duplicate, missing, unknown, and unresolved Union dockings', () => {
    const activeRoleIds = ['admiral', 'wing-commander', 'joint-engineering-quellon-refinery'];
    const initial = initialShuttleDockingsForRoles(activeRoleIds);
    const expected = craftStartingManifestForSetup(activeRoleIds, 'none', initial);
    expect(shuttleDockingsMatchRoleOwnedCraft(activeRoleIds, initial)).toBe(true);
    expect(expected.entries.some((entry) => entry.id === 'wobbly')).toBe(false);
    expect(craftStartingManifestMatches(expected, expected, ['aegis', 'quellon'])).toBe(true);
    const resolved = [...initial, { shuttleId: 'wobbly', shipId: 'quellon' }];
    expect(shuttleDockingsMatchRoleOwnedCraft(activeRoleIds, resolved)).toBe(true);
    const resolvedManifest = craftStartingManifestForSetup(activeRoleIds, 'none', resolved);
    expect(craftStartingManifestMatches(resolvedManifest, resolvedManifest, ['aegis', 'quellon'])).toBe(true);
    expect(shuttleDockingsMatchRoleOwnedCraft(activeRoleIds, [
      ...resolved,
      { shuttleId: 'wobbly', shipId: 'quellon' },
    ])).toBe(false);
    expect(shuttleDockingsMatchRoleOwnedCraft(activeRoleIds, [
      ...resolved,
      { shuttleId: 'unknown', shipId: 'aegis' },
    ])).toBe(false);
    expect(shuttleDockingsMatchRoleOwnedCraft(activeRoleIds, [
      ...resolved,
      { shuttleId: 'macaw', shipId: 'aegis' },
    ])).toBe(false);
    expect(shuttleDockingsMatchRoleOwnedCraft(activeRoleIds, [
      ...initial,
      { shuttleId: 'wobbly', shipId: 'aegis' },
    ])).toBe(false);
    expect(craftStartingManifestForSetup(activeRoleIds, 'none', [
      ...initial,
      { shuttleId: 'wobbly', shipId: 'aegis' },
    ]).entries.some((entry) => entry.id === 'wobbly')).toBe(false);

    const allyRoles = ['admiral', 'wing-commander', 'joint-engineering-shepherd-icebreaker'];
    const allyInitial = initialShuttleDockingsForRoles(allyRoles);
    expect(shuttleDockingsMatchRoleOwnedCraft(allyRoles, [
      ...allyInitial,
      { shuttleId: 'ally', shipId: 'quellon' },
    ])).toBe(false);
    expect(shuttleDockingsMatchRoleOwnedCraft(allyRoles, [
      ...allyInitial,
      { shuttleId: 'ally', shipId: 'icebreaker' },
    ])).toBe(true);
  });

  it('accepts only a legacy null placeholder for an optional Union entry', () => {
    const activeRoleIds = ['admiral', 'wing-commander', 'joint-engineering-quellon-refinery'];
    const expected = craftStartingManifestForSetup(
      activeRoleIds,
      'none',
      initialShuttleDockingsForRoles(activeRoleIds),
    );
    const legacyPlaceholder = {
      ...expected,
      entries: [
        ...expected.entries,
        {
          id: 'wobbly', kind: 'shuttle' as const,
          ownerRoleId: 'joint-engineering-quellon-refinery',
          enabledMode: 'gm-controlled' as const, startingHostId: null,
        },
      ],
    };
    expect(craftStartingManifestHasUnresolvedHosts(legacyPlaceholder, expected)).toBe(true);
    expect(craftStartingManifestHasUnresolvedHosts({
      ...legacyPlaceholder,
      entries: legacyPlaceholder.entries.map((entry) =>
        entry.id === 'wobbly' ? { ...entry, startingHostId: 'quellon' } : entry),
    }, expected)).toBe(false);
  });

  it('preserves a moved current docking instead of resetting to printed start', () => {
    const activeRoleIds = ['admiral', 'wing-commander'];
    const current = initialShuttleDockingsForRoles(activeRoleIds).map((docking) =>
      docking.shuttleId === 'starlight' ? { ...docking, shipId: 'quellon' } : docking);
    const manifest = craftStartingManifestForSetup(activeRoleIds, 'none', current);
    expect(manifest.entries.find((entry) => entry.id === 'starlight')?.startingHostId).toBe('quellon');
  });
});
