import { describe, expect, it } from 'vitest';
import { resolveStarlightFirstScan } from './starlightScout';

const base = {
  playerRole: 'player', connected: true,
  assignedRoleId: 'wing-commander', seatId: 'wing-commander', replacementRoleId: null,
  activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
  activeVesselIds: ['aegis', 'quellon', 'shepherd'],
  shipGalacticCoordinates: { aegis: '0000', quellon: '0000', shepherd: '0000' },
  cycle: 2,
};

describe('Starlight first scan', () => {
  it.each([
    ['0000', 0],
    ['5143', 1],
    ['9997', 2],
  ] as const)('binds a printed target %s at distance %i to current AEGIS authority',
    (targetCoordinate, distance) => {
      expect(resolveStarlightFirstScan({ ...base, targetCoordinate })).toEqual({
        type: 'scout-request', sourceId: 'starlight', ownerRoleId: 'wing-commander',
        anchorShipId: 'aegis', attempt: 1, cycle: 2,
        originCoordinate: '0000', targetCoordinate, distance,
      });
    });

  it('measures from the current AEGIS coordinate after movement', () => {
    expect(resolveStarlightFirstScan({
      ...base,
      shipGalacticCoordinates: { aegis: '6837', quellon: '0000', shepherd: '0000' },
      targetCoordinate: '1096',
    })).toMatchObject({ originCoordinate: '6837', targetCoordinate: '1096', distance: 2 });
  });

  it.each([
    ['three jumps away', { targetCoordinate: '6931' }],
    ['unknown target', { targetCoordinate: '0101' }],
    ['unknown AEGIS position', {
      targetCoordinate: '5143',
      shipGalacticCoordinates: { aegis: '0101', quellon: '0000', shepherd: '0000' },
    }],
    ['missing fleet position', {
      targetCoordinate: '5143', shipGalacticCoordinates: { aegis: '0000', quellon: '0000' },
    }],
    ['extra fleet position', {
      targetCoordinate: '5143',
      shipGalacticCoordinates: { aegis: '0000', quellon: '0000', shepherd: '0000', dione: '0000' },
    }],
    ['wrong owner', { targetCoordinate: '5143', assignedRoleId: 'admiral', seatId: 'admiral' }],
    ['mismatched seat', { targetCoordinate: '5143', seatId: 'admiral' }],
    ['replacement authority', { targetCoordinate: '5143', replacementRoleId: 'comms-officer' }],
    ['invalid cycle', { targetCoordinate: '5143', cycle: 0 }],
  ] as const)('fails closed for %s', (_label, patch) => {
    expect(() => resolveStarlightFirstScan({ ...base, ...patch })).toThrow();
  });
});
