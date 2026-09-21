import { describe, expect, it } from 'vitest';
import { resolveStarlightFirstScan, resolveStarlightSecondScan } from './starlightScout';

const base = {
  playerRole: 'player', connected: true,
  assignedRoleId: 'wing-commander', seatId: 'wing-commander', replacementRoleId: null,
  activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'],
  activeVesselIds: ['aegis', 'quellon', 'shepherd'],
  shipGalacticCoordinates: { aegis: '0000', quellon: '0000', shepherd: '0000' },
  cycle: 2,
};

const firstScan = resolveStarlightFirstScan({ ...base, targetCoordinate: '5143' });
const priorScans = [firstScan];
const fuel = {
  maintenanceCycles: {
    aegis: {
      step: 7, revision: 8, turn: 2, results: {}, charges: [], refuelled: ['starlight'],
    },
  },
  shuttleFuelled: { starlight: true },
};

describe('Starlight fuelled second scan', () => {
  it('authorizes one distinct eligible target from current-cycle fuel authority', () => {
    expect(resolveStarlightSecondScan({
      ...base, ...fuel, priorScans, targetCoordinate: '9997',
    })).toEqual({
      type: 'scout-request', sourceId: 'starlight', ownerRoleId: 'wing-commander',
      anchorShipId: 'aegis', attempt: 2, cycle: 2, originCoordinate: '0000',
      targetCoordinate: '9997', distance: 2, firstTargetCoordinate: '5143',
    });
  });

  it('measures the additional target from the current AEGIS position', () => {
    expect(resolveStarlightSecondScan({
      ...base, ...fuel, priorScans,
      shipGalacticCoordinates: { aegis: '6837', quellon: '0000', shepherd: '0000' },
      targetCoordinate: '1096',
    })).toMatchObject({ originCoordinate: '6837', targetCoordinate: '1096', distance: 2 });
  });

  it.each([
    ['same target', { targetCoordinate: '5143' }],
    ['no first scan', { targetCoordinate: '9997', priorScans: [] }],
    ['additional scan already used', {
      targetCoordinate: '9997', priorScans: [firstScan, { ...firstScan, attempt: 2 }],
    }],
    ['unfuelled', { targetCoordinate: '9997', shuttleFuelled: { starlight: false } }],
    ['missing fuel row', { targetCoordinate: '9997', shuttleFuelled: {} }],
    ['unknown fuel row', {
      targetCoordinate: '9997', shuttleFuelled: { starlight: true, teleport: false },
    }],
    ['stale maintenance cycle', {
      targetCoordinate: '9997',
      maintenanceCycles: { aegis: { ...fuel.maintenanceCycles.aegis, turn: 1 } },
    }],
    ['maintenance has not reached shuttle bays', {
      targetCoordinate: '9997',
      maintenanceCycles: { aegis: { ...fuel.maintenanceCycles.aegis, step: 6 } },
    }],
    ['no current refuel receipt', {
      targetCoordinate: '9997',
      maintenanceCycles: { aegis: { ...fuel.maintenanceCycles.aegis, refuelled: [] } },
    }],
    ['malformed refuel receipt', {
      targetCoordinate: '9997',
      maintenanceCycles: { aegis: { ...fuel.maintenanceCycles.aegis, refuelled: ['starlight', 7] } },
    }],
    ['unknown shuttle in refuel receipt', {
      targetCoordinate: '9997',
      maintenanceCycles: {
        aegis: { ...fuel.maintenanceCycles.aegis, refuelled: ['starlight', 'forged-shuttle'] },
      },
    }],
    ['duplicate refuel receipt', {
      targetCoordinate: '9997',
      maintenanceCycles: { aegis: { ...fuel.maintenanceCycles.aegis, refuelled: ['starlight', 'starlight'] } },
    }],
    ['first scan from another cycle', { targetCoordinate: '9997', priorScans: [{ ...firstScan, cycle: 1 }] }],
    ['forged first distance', { targetCoordinate: '9997', priorScans: [{ ...firstScan, distance: 2 }] }],
    ['extra first-scan field', { targetCoordinate: '9997', priorScans: [{ ...firstScan, secret: true }] }],
    ['far second target', { targetCoordinate: '6931' }],
    ['wrong owner', { targetCoordinate: '9997', assignedRoleId: 'admiral', seatId: 'admiral' }],
  ] as const)('fails closed for %s', (_label, patch) => {
    expect(() => resolveStarlightSecondScan({
      ...base, ...fuel, priorScans, ...patch,
    })).toThrow();
  });
});
