import { describe, expect, it } from 'vitest';
import {
  deriveWolfBoardingSupportCraft,
  relocateWolfBoardingSupportCraft,
  type WolfBoardingCraftAuthorityInput,
} from './wolfBoardingSupport';

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
});
