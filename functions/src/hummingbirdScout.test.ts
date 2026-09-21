import { describe, expect, it } from 'vitest';
import { resolveHummingbirdScan } from './hummingbirdScout';

const base = {
  playerRole: 'player', connected: true,
  assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', replacementRoleId: null,
  activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
  activeVesselIds: ['aegis', 'quellon', 'shepherd'],
  shipGalacticCoordinates: { aegis: '0000', quellon: '0000', shepherd: '0000' },
  priorScans: [], cycle: 3,
};

describe('Hummingbird scouting', () => {
  it.each([
    ['0000', 0],
    ['5143', 1],
    ['9997', 2],
    ['6931', 3],
  ] as const)('binds printed target %s at distance %i to current Quellon authority',
    (targetCoordinate, distance) => {
      expect(resolveHummingbirdScan({ ...base, targetCoordinate })).toEqual({
        type: 'scout-request', sourceId: 'hummingbird', ownerRoleId: 'quellon-explorer',
        anchorShipId: 'quellon', attempt: 1, cycle: 3,
        originCoordinate: '0000', targetCoordinate, distance,
      });
    });

  it('measures from Quellon after its authoritative position changes', () => {
    expect(resolveHummingbirdScan({
      ...base,
      shipGalacticCoordinates: { aegis: '0000', quellon: '6837', shepherd: '0000' },
      targetCoordinate: '1096',
    })).toMatchObject({ originCoordinate: '6837', targetCoordinate: '1096', distance: 2 });
  });

  it.each([
    ['four jumps away', { targetCoordinate: '4753' }],
    ['unknown target', { targetCoordinate: '0101' }],
    ['unknown Quellon position', {
      targetCoordinate: '5143',
      shipGalacticCoordinates: { aegis: '0000', quellon: '0101', shepherd: '0000' },
    }],
    ['missing fleet position', {
      targetCoordinate: '5143', shipGalacticCoordinates: { aegis: '0000', quellon: '0000' },
    }],
    ['extra fleet position', {
      targetCoordinate: '5143',
      shipGalacticCoordinates: { aegis: '0000', quellon: '0000', shepherd: '0000', dione: '0000' },
    }],
    ['scan already used', { targetCoordinate: '5143', priorScans: [{ attempt: 1 }] }],
    ['wrong owner', { targetCoordinate: '5143', assignedRoleId: 'wing-commander', seatId: 'wing-commander' }],
    ['mismatched seat', { targetCoordinate: '5143', seatId: 'wing-commander' }],
    ['replacement authority', { targetCoordinate: '5143', replacementRoleId: 'doctor' }],
    ['invalid cycle', { targetCoordinate: '5143', cycle: 0 }],
  ] as const)('fails closed for %s', (_label, patch) => {
    expect(() => resolveHummingbirdScan({ ...base, ...patch })).toThrow();
  });
});
