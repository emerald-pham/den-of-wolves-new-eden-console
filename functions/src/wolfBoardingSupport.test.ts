import { describe, expect, it } from 'vitest';
import {
  deriveWolfBoardingSupportCraft,
  relocateWolfBoardingSupportCraft,
  type WolfBoardingCraftAuthorityInput,
} from './wolfBoardingSupport';
import { activeVesselIdsForRoles } from './gameSetup';
import { recommendedRoleIds } from './roleConfiguration';
import { roleOwnedCraftForRoles } from './craftOwnership';
import { initialShuttleControl } from './shuttleControl';
import { initialShuttleDockingsForRoles, initialShuttleVisitsForDockings } from './shuttlecraft';

const input: WolfBoardingCraftAuthorityInput = {
  activeRoleIds: ['executive-officer', 'dione-engineer', 'capybara-captain', 'refinery-124-pdf-colonel'],
  activeVesselIds: ['aegis', 'dione', 'capybara', 'refinery-124'],
  dockings: [
    { shuttleId: 'pallas', shipId: 'aegis', dockedAt: '2026-10-03T12:00:00.000Z' },
    { shuttleId: 'philia', shipId: 'dione', dockedAt: '2026-10-03T12:00:00.000Z' },
    { shuttleId: 'macaw', shipId: 'capybara', dockedAt: '2026-10-03T12:00:00.000Z' },
    { shuttleId: 'chepu', shipId: 'refinery-124', dockedAt: '2026-10-03T12:00:00.000Z' },
  ],
  visits: [
    { id: 'pallas-start', shuttleId: 'pallas', shipId: 'aegis', action: 'docked', occurredAt: '2026-10-03T12:00:00.000Z' },
    { id: 'philia-start', shuttleId: 'philia', shipId: 'dione', action: 'docked', occurredAt: '2026-10-03T12:00:00.000Z' },
    { id: 'macaw-start', shuttleId: 'macaw', shipId: 'capybara', action: 'docked', occurredAt: '2026-10-03T12:00:00.000Z' },
    { id: 'chepu-start', shuttleId: 'chepu', shipId: 'refinery-124', action: 'docked', occurredAt: '2026-10-03T12:00:00.000Z' },
  ],
  control: {
    pallas: { shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo-owner', holderUid: 'pallas-pilot', revision: 2 },
    philia: { shuttleId: 'philia', ownerRoleId: 'dione-engineer', ownerUid: 'dione-owner', holderUid: 'philia-pilot', revision: 4 },
    macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'capy-owner', holderUid: 'macaw-pilot', revision: 1 },
    chepu: { shuttleId: 'chepu', ownerRoleId: 'refinery-124-pdf-colonel', ownerUid: 'pdf-owner', holderUid: 'chepu-pilot', revision: 7 },
  },
  fuelled: { pallas: true, philia: false, macaw: true, chepu: true },
  roleHolders: [
    { uid: 'xo-owner', roleId: 'executive-officer' }, { uid: 'dione-owner', roleId: 'dione-engineer' },
    { uid: 'capy-owner', roleId: 'capybara-captain' }, { uid: 'pdf-owner', roleId: 'refinery-124-pdf-colonel' },
  ],
  playerUids: ['xo-owner', 'pallas-pilot', 'dione-owner', 'philia-pilot', 'capy-owner', 'macaw-pilot', 'pdf-owner', 'chepu-pilot'],
  retainedShuttles: {},
};

function normal14BoardingInput(overrides: Partial<WolfBoardingCraftAuthorityInput> = {}): WolfBoardingCraftAuthorityInput {
  const activeRoleIds = recommendedRoleIds(14);
  const dockings = initialShuttleDockingsForRoles(activeRoleIds);
  const roleHolders = activeRoleIds.map(roleId => ({ uid: `holder-${roleId}`, roleId }));
  const supportIds = new Set(roleOwnedCraftForRoles(activeRoleIds)
    .filter(craft => craft.kind === 'shuttle' && craft.boardingSupport !== undefined)
    .map(({ id }) => id));
  return {
    activeRoleIds,
    activeVesselIds: activeVesselIdsForRoles(activeRoleIds),
    dockings,
    visits: initialShuttleVisitsForDockings(dockings).filter(({ shuttleId }) => supportIds.has(shuttleId)),
    control: initialShuttleControl(roleOwnedCraftForRoles(activeRoleIds), roleHolders),
    fuelled: { wobbly: true, ally: false },
    roleHolders,
    playerUids: roleHolders.map(({ uid }) => uid),
    retainedShuttles: {},
    ...overrides,
  };
}

describe('Wolf boarding support-craft authority', () => {
  it('derives host support from each registered craft and preserves its distinct owner, holder, host, fuel, and revision', () => {
    const craft = deriveWolfBoardingSupportCraft(input);
    expect(craft).toEqual(expect.arrayContaining([
      expect.objectContaining({ shuttleId: 'pallas', ownerUid: 'xo-owner', holderUid: 'pallas-pilot',
        hostShipId: 'aegis', fuelled: true, controlRevision: 2, pallasRerolls: true, fuelledRelocation: true }),
      expect.objectContaining({ shuttleId: 'chepu', ownerUid: 'pdf-owner', holderUid: 'chepu-pilot',
        hostShipId: 'refinery-124', fuelled: true, controlRevision: 7, pallasRerolls: false, fuelledRelocation: true }),
      expect.objectContaining({ shuttleId: 'macaw', hostShipId: 'capybara', fuelled: true,
        pallasRerolls: false, fuelledRelocation: false }),
      expect.objectContaining({ shuttleId: 'philia', hostShipId: 'dione', fuelled: false,
        pallasRerolls: false, fuelledRelocation: false }),
    ]));
  });

  it('moves only a fuelled Pallas or Chepu and records exactly one departure/docking pair', () => {
    const pallas = deriveWolfBoardingSupportCraft(input).find(({ shuttleId }) => shuttleId === 'pallas')!;
    const moved = relocateWolfBoardingSupportCraft({
      authority: pallas, targetShipId: 'dione', requestId: 'boarding-pallas-move',
      now: '2026-10-03T12:10:00.000Z', ...input,
    });

    expect(moved.dockings.find(({ shuttleId }) => shuttleId === 'pallas'))
      .toEqual({ shuttleId: 'pallas', shipId: 'dione', dockedAt: '2026-10-03T12:10:00.000Z' });
    expect(moved.visits.slice(-2)).toEqual([
      { id: 'wolf-board-boarding-pallas-move-departed', shuttleId: 'pallas', shipId: 'aegis', action: 'departed', occurredAt: '2026-10-03T12:10:00.000Z' },
      { id: 'wolf-board-boarding-pallas-move-docked', shuttleId: 'pallas', shipId: 'dione', action: 'docked', occurredAt: '2026-10-03T12:10:00.000Z' },
    ]);
    expect(moved.control.pallas).toEqual({
      shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo-owner', holderUid: 'pallas-pilot', revision: 3,
    });
    expect(moved.fuelled).toEqual(input.fuelled);
  });

  it('keeps an explicit stay choice unchanged and rejects unfuelled or unregistered relocation', () => {
    const chepu = deriveWolfBoardingSupportCraft(input).find(({ shuttleId }) => shuttleId === 'chepu')!;
    expect(relocateWolfBoardingSupportCraft({
      authority: { ...chepu, fuelled: false }, targetShipId: null, requestId: 'boarding-chepu-stay',
      now: '2026-10-03T12:10:00.000Z', ...input, fuelled: { ...input.fuelled, chepu: false },
    })).toMatchObject({ status: 'stayed', control: input.control, dockings: input.dockings, visits: input.visits });

    expect(() => relocateWolfBoardingSupportCraft({
      authority: { ...chepu, fuelled: false }, targetShipId: 'aegis', requestId: 'boarding-chepu-move',
      now: '2026-10-03T12:10:00.000Z', ...input, fuelled: { ...input.fuelled, chepu: false },
    })).toThrow(/fuelled/i);
    expect(() => deriveWolfBoardingSupportCraft({
      ...input,
      control: { ...input.control, chepu: { ...input.control.chepu!, ownerUid: 'wrong-owner' } },
    })).toThrow(/owner/i);
  });

  it('makes only a removed or replaced craft holder unavailable without blocking other support', () => {
    const unavailable = deriveWolfBoardingSupportCraft({
      ...input,
      roleHolders: input.roleHolders.filter(({ uid }) => uid !== 'xo-owner'),
      playerUids: input.playerUids.filter((uid) => uid !== 'xo-owner' && uid !== 'pallas-pilot'),
    });

    expect(unavailable.map(({ shuttleId }) => shuttleId)).toEqual(['philia', 'macaw', 'chepu']);
  });
});


it('excludes permanently consumed Ring craft from current boarding support while preserving other custody', () => {
  const remaining = deriveWolfBoardingSupportCraft({ ...input, consumedShuttleIds: ['philia'],
    dockings: input.dockings.filter(docking => docking.shuttleId !== 'philia') } as WolfBoardingCraftAuthorityInput);
  expect(remaining.map(craft => craft.shuttleId)).toEqual(['pallas', 'macaw', 'chepu']);
});

it('accepts a source-seeded normal14 roster when never-docked optional GM craft have no visits', () => {
  const seeded = normal14BoardingInput();
  expect(seeded.dockings.map(({ shuttleId }) => shuttleId)).toContain('chepu');
  expect(seeded.dockings.map(({ shuttleId }) => shuttleId)).not.toContain('wobbly');
  expect(seeded.dockings.map(({ shuttleId }) => shuttleId)).not.toContain('ally');
  expect(seeded.visits.map(({ shuttleId }) => shuttleId)).toEqual(['chepu']);
  // Initial control and fuel metadata alone do not mean the optional GM craft were ever docked.
  expect(seeded.control).toHaveProperty('wobbly');
  expect(seeded.control).toHaveProperty('ally');
  const result = deriveWolfBoardingSupportCraft(seeded);
  expect(result.map(({ shuttleId }) => shuttleId)).toEqual(['chepu']);
});

it('still requires history for mandatory and physically docked support craft', () => {
  expect(() => deriveWolfBoardingSupportCraft({ ...input,
    visits: input.visits.filter(({ shuttleId }) => shuttleId !== 'pallas'),
  })).toThrow(/location does not match its visit history/);

  const seeded = normal14BoardingInput();
  expect(() => deriveWolfBoardingSupportCraft({ ...seeded,
    dockings: [...seeded.dockings, { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' }],
  })).toThrow(/location does not match its visit history/);
});

it('does not excuse missing history for retained optional support craft', () => {
  const seeded = normal14BoardingInput({ retainedShuttles: {
    wobbly: { status: 'retained', shuttleId: 'wobbly', ownerRoleId: 'joint-engineering-quellon-refinery',
      holderUid: 'holder-joint-engineering-quellon-refinery', destroyedHostShipId: 'quellon', controlRevision: 0,
      retainedAt: '2026-10-08T00:00:00.000Z' },
  } });
  expect(() => deriveWolfBoardingSupportCraft(seeded)).toThrow(/location does not match its visit history/);
});

it('validates optional craft history when present and rejects fabricated or location-mismatched visits', () => {
  const seeded = normal14BoardingInput();
  const wobblyHistory = [
    { id: 'wobbly-start', shuttleId: 'wobbly', shipId: 'quellon', action: 'docked' as const, occurredAt: 'SESSION START' },
    { id: 'wobbly-departed', shuttleId: 'wobbly', shipId: 'quellon', action: 'departed' as const, occurredAt: 'later' },
  ];
  const departed = deriveWolfBoardingSupportCraft({ ...seeded, visits: [...seeded.visits, ...wobblyHistory] });
  expect(departed.map(({ shuttleId }) => shuttleId)).toEqual(['chepu']);

  expect(() => deriveWolfBoardingSupportCraft({ ...seeded, visits: [...seeded.visits,
    { id: 'fabricated-wobbly-departed', shuttleId: 'wobbly', shipId: 'quellon',
      action: 'departed', occurredAt: 'later' },
  ] })).toThrow(/impossible transition/);
  expect(() => deriveWolfBoardingSupportCraft({ ...seeded,
    dockings: [...seeded.dockings, { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'later' }],
    visits: [...seeded.visits, wobblyHistory[0]!, wobblyHistory[1]!],
  })).toThrow(/location does not match its visit history/);
});
