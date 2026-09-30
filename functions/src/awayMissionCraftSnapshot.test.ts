import { describe, expect, it } from 'vitest';
import { deriveAwayMissionParticipantCraftSnapshots } from './awayMissionCraftSnapshot';
import { emptySmallShipState } from './smallShip';

const participants = [
  { uid: 'wing', roleId: 'wing-commander', craftIds: ['capybara-small'] },
  { uid: 'explorer', roleId: 'quellon-explorer' },
  { uid: 'pdf', roleId: 'refinery-124-pdf-colonel' },
  { uid: 'capybara', roleId: 'capybara-small-captain', craftIds: ['starlight'] },
  { uid: 'warrior', roleId: 'warrior-captain' },
  { uid: 'gorgoneion', roleId: 'gorgoneion-captain' },
  { uid: 'vulcan', roleId: 'vulcan-captain' },
  { uid: 'admiral', roleId: 'admiral', craftIds: ['capybara-small'] },
];

function admittedSmallShipStates(hostShipId: string | null = 'aegis') {
  return Object.fromEntries(['capybara-small', 'warrior', 'gorgoneion', 'vulcan'].map((id) => [
    id,
    {
      ...emptySmallShipState(id, hostShipId),
      dockingRevision: hostShipId === null ? 0 : 1,
    },
  ]));
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    participantSnapshots: participants,
    availableCarrierCraftIds: ['starlight', 'hummingbird', 'pdf-escort-fighter-wing'],
    activeVesselIds: ['aegis', 'dione'],
    smallShipStates: admittedSmallShipStates(),
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
      { participantUid: 'warrior', craftIds: ['warrior'] },
      { participantUid: 'gorgoneion', craftIds: ['gorgoneion'] },
      { participantUid: 'vulcan', craftIds: ['vulcan'] },
      { participantUid: 'admiral', craftIds: [] },
    ]);
  });

  it('does not bind an extra craft when it is undocked, outside the mission group, or at another position', () => {
    const undocked = admittedSmallShipStates(null);
    const undockedResult = deriveAwayMissionParticipantCraftSnapshots(input({ smallShipStates: undocked }));
    expect(undockedResult?.slice(3, 7)).toEqual([
      { participantUid: 'capybara', craftIds: [] },
      { participantUid: 'warrior', craftIds: [] },
      { participantUid: 'gorgoneion', craftIds: [] },
      { participantUid: 'vulcan', craftIds: [] },
    ]);

    const hostOutsideGroup = deriveAwayMissionParticipantCraftSnapshots(input({ opportunityGroupVesselIds: ['dione'] }));
    expect(hostOutsideGroup?.slice(3, 7)).toEqual([
      { participantUid: 'capybara', craftIds: [] },
      { participantUid: 'warrior', craftIds: [] },
      { participantUid: 'gorgoneion', craftIds: [] },
      { participantUid: 'vulcan', craftIds: [] },
    ]);

    const hostAtAnotherCoordinate = deriveAwayMissionParticipantCraftSnapshots(input({
      shipGalacticCoordinates: { aegis: 'M5', dione: 'L4' },
    }));
    expect(hostAtAnotherCoordinate?.slice(3, 7)).toEqual([
      { participantUid: 'capybara', craftIds: [] },
      { participantUid: 'warrior', craftIds: [] },
      { participantUid: 'gorgoneion', craftIds: [] },
      { participantUid: 'vulcan', craftIds: [] },
    ]);
  });

  it('binds the Capybara Captain only for the base Capybara admission', () => {
    expect(deriveAwayMissionParticipantCraftSnapshots(input({ expansion: 'capybara' }))?.[3])
      .toEqual({ participantUid: 'capybara', craftIds: [] });
    expect(deriveAwayMissionParticipantCraftSnapshots(input({ capybaraEnabled: false }))?.[3])
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
