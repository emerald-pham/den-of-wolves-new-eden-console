import { describe, expect, it } from 'vitest';
import { resolveCommsOfficerScan } from './commsOfficerScout';

const base = {
  playerRole: 'player', connected: true,
  // Replacement authority is independent of historical core fields.
  assignedRoleId: 'wing-commander', seatId: 'admiral', replacementRoleId: 'comms-officer',
  activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
  activeVesselIds: ['aegis', 'quellon', 'shepherd'],
  shipGalacticCoordinates: { aegis: '0000', quellon: '0000', shepherd: '0000' },
  priorScans: [], cycle: 5,
};

describe('Comms Officer short-range scouting', () => {
  it.each([
    ['0000', 0],
    ['5143', 1],
  ] as const)('binds printed target %s at distance %i to current AEGIS authority',
    (targetCoordinate, distance) => {
      expect(resolveCommsOfficerScan({ ...base, targetCoordinate })).toEqual({
        type: 'scout-request', sourceId: 'comms-officer', ownerRoleId: 'comms-officer',
        anchorShipId: 'aegis', attempt: 1, cycle: 5,
        originCoordinate: '0000', targetCoordinate, distance,
      });
    });

  it('measures from AEGIS after its authoritative position changes', () => {
    expect(resolveCommsOfficerScan({
      ...base,
      shipGalacticCoordinates: { aegis: '6837', quellon: '0000', shepherd: '0000' },
      targetCoordinate: '4454',
    })).toMatchObject({ originCoordinate: '6837', targetCoordinate: '4454', distance: 1 });
  });

  it.each([
    ['two jumps away', { targetCoordinate: '9997' }],
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
    ['scan already used', { targetCoordinate: '5143', priorScans: [{ attempt: 1 }] }],
    ['no replacement', { targetCoordinate: '5143', replacementRoleId: null }],
    ['other replacement', { targetCoordinate: '5143', replacementRoleId: 'vip-host' }],
    ['disconnected replacement', { targetCoordinate: '5143', connected: false }],
    ['invalid cycle', { targetCoordinate: '5143', cycle: 0 }],
  ] as const)('fails closed for %s', (_label, patch) => {
    expect(() => resolveCommsOfficerScan({ ...base, ...patch })).toThrow();
  });
});
