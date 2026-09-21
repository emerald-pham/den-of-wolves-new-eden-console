import { describe, expect, it } from 'vitest';
import { resolveEndeavourScan } from './endeavourScout';

const base = {
  playerRole: 'player', connected: true,
  assignedRoleId: 'shepherd-scientist', seatId: 'shepherd-scientist', replacementRoleId: null,
  activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
  activeVesselIds: ['aegis', 'quellon', 'shepherd'],
  priorScans: [], cycle: 4,
};

describe('Endeavour long-range scouting', () => {
  it.each(['0000', '6931', '4888'] as const)(
    'allows one request for printed system %s regardless of range',
    (targetCoordinate) => {
      expect(resolveEndeavourScan({ ...base, targetCoordinate })).toEqual({
        type: 'scout-request', sourceId: 'endeavour', ownerRoleId: 'shepherd-scientist',
        anchorShipId: 'shepherd', attempt: 1, cycle: 4, targetCoordinate, range: 'unlimited',
      });
    },
  );

  it.each([
    ['unknown system', { targetCoordinate: '0101' }],
    ['scan already used', { targetCoordinate: '4888', priorScans: [{ attempt: 1 }] }],
    ['wrong owner', { targetCoordinate: '4888', assignedRoleId: 'wing-commander', seatId: 'wing-commander' }],
    ['mismatched seat', { targetCoordinate: '4888', seatId: 'wing-commander' }],
    ['replacement authority', { targetCoordinate: '4888', replacementRoleId: 'rosal-militia-leader' }],
    ['inactive Shepherd', {
      targetCoordinate: '4888', activeRoleIds: ['wing-commander', 'quellon-explorer'],
      activeVesselIds: ['aegis', 'quellon'],
    }],
    ['invalid cycle', { targetCoordinate: '4888', cycle: 0 }],
  ] as const)('fails closed for %s', (_label, patch) => {
    expect(() => resolveEndeavourScan({ ...base, ...patch })).toThrow();
  });
});
