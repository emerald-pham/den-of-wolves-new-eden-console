import { describe, expect, it } from 'vitest';
import { resolveCommsOfficerScan } from './commsOfficerScout';
import { resolveHummingbirdScan } from './hummingbirdScout';
import { resolveStarlightFirstScan } from './starlightScout';

const activeRoleIds = ['wing-commander', 'quellon-explorer', 'shepherd-scientist'];
const activeVesselIds = ['aegis', 'quellon', 'shepherd'];
const postJumpCoordinates = { aegis: '4888', quellon: '4888', shepherd: '0000' };

describe('scout current-authority boundary', () => {
  it.each([
    [
      'Starlight',
      () => resolveStarlightFirstScan({
        playerRole: 'player', connected: true,
        assignedRoleId: 'wing-commander', seatId: 'wing-commander', replacementRoleId: null,
        activeRoleIds, activeVesselIds, shipGalacticCoordinates: postJumpCoordinates,
        cycle: 4, targetCoordinate: '9997',
        // A client may remember the pre-jump origin, but it is never range authority.
        originCoordinate: '0000',
      }),
    ],
    [
      'Hummingbird',
      () => resolveHummingbirdScan({
        playerRole: 'player', connected: true,
        assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', replacementRoleId: null,
        activeRoleIds, activeVesselIds, shipGalacticCoordinates: postJumpCoordinates,
        priorScans: [], cycle: 4, targetCoordinate: '6931', originCoordinate: '0000',
      }),
    ],
    [
      'Comms Officer',
      () => resolveCommsOfficerScan({
        playerRole: 'player', connected: true,
        assignedRoleId: null, seatId: null, replacementRoleId: 'comms-officer',
        activeRoleIds, activeVesselIds, shipGalacticCoordinates: postJumpCoordinates,
        priorScans: [], cycle: 4, targetCoordinate: '5143', originCoordinate: '0000',
      }),
    ],
  ])('rejects %s range that only the stale pre-jump client origin would allow', (_label, resolve) => {
    expect(resolve).toThrow();
  });

  it('records the post-jump authoritative origin when the new position permits the target', () => {
    expect(resolveStarlightFirstScan({
      playerRole: 'player', connected: true,
      assignedRoleId: 'wing-commander', seatId: 'wing-commander', replacementRoleId: null,
      activeRoleIds, activeVesselIds, shipGalacticCoordinates: postJumpCoordinates,
      cycle: 4, targetCoordinate: '0408', originCoordinate: '0000',
    })).toMatchObject({ originCoordinate: '4888', targetCoordinate: '0408', distance: 1 });
  });

  it.each([
    [
      'former Wing Commander',
      () => resolveStarlightFirstScan({
        playerRole: 'player', connected: true,
        assignedRoleId: 'admiral', seatId: 'admiral', replacementRoleId: null,
        activeRoleIds, activeVesselIds, shipGalacticCoordinates: postJumpCoordinates,
        cycle: 4, targetCoordinate: '0408', claimedOwnerRoleId: 'wing-commander',
      }),
    ],
    [
      'former Quellon Explorer',
      () => resolveHummingbirdScan({
        playerRole: 'player', connected: true,
        assignedRoleId: 'admiral', seatId: 'admiral', replacementRoleId: null,
        activeRoleIds, activeVesselIds, shipGalacticCoordinates: postJumpCoordinates,
        priorScans: [], cycle: 4, targetCoordinate: '0408', claimedOwnerRoleId: 'quellon-explorer',
      }),
    ],
    [
      'former Comms Officer',
      () => resolveCommsOfficerScan({
        playerRole: 'player', connected: true,
        assignedRoleId: null, seatId: null, replacementRoleId: null,
        activeRoleIds, activeVesselIds, shipGalacticCoordinates: postJumpCoordinates,
        priorScans: [], cycle: 4, targetCoordinate: '0408', claimedOwnerRoleId: 'comms-officer',
      }),
    ],
  ])('rejects a %s even when the client claims the old authority', (_label, resolve) => {
    expect(resolve).toThrow();
  });
});
