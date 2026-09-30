import { describe, expect, it } from 'vitest';
import { deriveAwayMissionParticipantCraftSnapshots } from './awayMissionCraftSnapshot';
import { emptySmallShipState } from './smallShip';

const participants = [
  { uid: 'wing', roleId: 'wing-commander', craftIds: ['capybara-small'] },
  { uid: 'explorer', roleId: 'quellon-explorer' },
  { uid: 'pdf', roleId: 'refinery-124-pdf-colonel' },
  { uid: 'capybara', roleId: 'capybara-small-captain', craftIds: ['starlight'] },
  { uid: 'admiral', roleId: 'admiral', craftIds: ['capybara-small'] },
];

function input(overrides: Record<string, unknown> = {}) {
  return {
    participantSnapshots: participants,
    availableCarrierCraftIds: ['starlight', 'hummingbird', 'pdf-escort-fighter-wing'],
    activeVesselIds: ['aegis', 'dione'],
    smallShipStates: {
      'capybara-small': {
        ...emptySmallShipState('capybara-small', 'aegis'),
        dockingRevision: 1,
      },
    },
    expansion: 'base',
    capybaraEnabled: true,
    opportunityGroupVesselIds: ['aegis'],
    opportunityCoordinate: 'L4',
    shipGalacticCoordinates: { aegis: 'L4', dione: 'M5' },
    ...overrides,
  };
}

describe('P403 participant craft snapshots', () => {
  it('binds only admitted source craft to their participant and keeps Capybara separate from carriers', () => {
    expect(deriveAwayMissionParticipantCraftSnapshots(input())).toEqual([
      { participantUid: 'wing', craftIds: ['starlight'] },
      { participantUid: 'explorer', craftIds: ['hummingbird'] },
      { participantUid: 'pdf', craftIds: ['pdf-escort-fighter-wing'] },
      { participantUid: 'capybara', craftIds: ['capybara-small'] },
      { participantUid: 'admiral', craftIds: [] },
    ]);
  });

  it('does not bind the base Capybara when it is absent, undocked, or outside the mission group and position', () => {
    const undocked = {
      'capybara-small': emptySmallShipState('capybara-small'),
    };
    expect(deriveAwayMissionParticipantCraftSnapshots(input({ smallShipStates: undocked })))?.[3]
      .toEqual({ participantUid: 'capybara', craftIds: [] });

    const hostOutsideGroup = input({ opportunityGroupVesselIds: ['dione'] });
    expect(deriveAwayMissionParticipantCraftSnapshots(hostOutsideGroup)?.[3])
      .toEqual({ participantUid: 'capybara', craftIds: [] });

    const hostAtAnotherCoordinate = input({ shipGalacticCoordinates: { aegis: 'M5', dione: 'L4' } });
    expect(deriveAwayMissionParticipantCraftSnapshots(hostAtAnotherCoordinate)?.[3])
      .toEqual({ participantUid: 'capybara', craftIds: [] });
  });

  it('fails closed for malformed P403 identity, admission, or location snapshots', () => {
    expect(deriveAwayMissionParticipantCraftSnapshots(input({ participantSnapshots: [
      { uid: 'duplicate', roleId: 'wing-commander' },
      { uid: 'duplicate', roleId: 'quellon-explorer' },
    ] }))).toBeNull();
    expect(deriveAwayMissionParticipantCraftSnapshots(input({
      availableCarrierCraftIds: ['starlight', 'capybara-small'],
    }))).toBeNull();
    expect(deriveAwayMissionParticipantCraftSnapshots(input({
      availableCarrierCraftIds: ['starlight', 'starlight'],
    }))).toBeNull();
    expect(deriveAwayMissionParticipantCraftSnapshots(input({ smallShipStates: undefined }))).toBeNull();
    expect(deriveAwayMissionParticipantCraftSnapshots(input({ shipGalacticCoordinates: undefined }))).toBeNull();
  });
});
