import { describe, expect, it } from 'vitest';
import { authoritativeHolderShip, resolveHolderBasedDocking } from './shuttleDocking';

const activeVesselIds = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
const dockings = [
  { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'start' },
  { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'start' },
  { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'start' },
  { shuttleId: 'ally', shipId: 'shepherd', dockedAt: 'start' },
] as const;

describe('holder-based shuttle docking', () => {
  it('moves one shuttle to an ordinary holder role and preserves every other row', () => {
    const result = resolveHolderBasedDocking({
      shuttleId: 'starlight',
      holder: { uid: 'miner', role: 'player', assignedRoleId: 'icebreaker-miner' },
      dockings,
      activeVesselIds,
      occurredAt: '2026-09-21T05:00:00.000Z',
    });
    expect(result).toEqual({
      previousHostShipId: 'aegis',
      hostShipId: 'icebreaker',
      dockings: [
        dockings[0],
        { shuttleId: 'starlight', shipId: 'icebreaker', dockedAt: '2026-09-21T05:00:00.000Z' },
        dockings[2],
        dockings[3],
      ],
    });
  });

  it('uses the current Press and joint-engineering craft dock as their holder location', () => {
    expect(authoritativeHolderShip({
      uid: 'press', role: 'player', assignedRoleId: null, activeConsoleRoleId: 'press-officer',
    }, dockings, activeVesselIds)).toBe('dione');
    expect(authoritativeHolderShip({
      uid: 'union', role: 'player', assignedRoleId: 'joint-engineering-quellon-refinery',
    }, dockings, activeVesselIds)).toBe('quellon');
  });

  it('uses a current replacement vessel instead of the historical printed role', () => {
    expect(authoritativeHolderShip({
      uid: 'replacement', role: 'player', assignedRoleId: 'wing-commander',
      replacementRoleId: 'doctor',
    }, dockings, activeVesselIds)).toBe('quellon');
  });

  it('rejects escape, locationless, inactive, duplicate, and Union-invalid destinations', () => {
    expect(() => authoritativeHolderShip({
      uid: 'escape', role: 'player', assignedRoleId: 'wing-commander', escapeState: { status: 'pending' },
    }, dockings, activeVesselIds)).toThrow(/no legal ship/i);
    expect(() => authoritativeHolderShip({ uid: 'none', role: 'player' }, dockings, activeVesselIds))
      .toThrow(/no authoritative role/i);
    expect(() => authoritativeHolderShip({
      uid: 'dione', role: 'player', assignedRoleId: 'dione-engineer',
    }, dockings, ['aegis'])).toThrow(/active fleet ship/i);
    expect(() => resolveHolderBasedDocking({
      shuttleId: 'starlight', holder: { uid: 'wing', role: 'player', assignedRoleId: 'wing-commander' },
      dockings: [...dockings, dockings[1]], activeVesselIds, occurredAt: 'now',
    })).toThrow(/docking state|unique current dock/i);
    expect(() => resolveHolderBasedDocking({
      shuttleId: 'wobbly', holder: { uid: 'wing', role: 'player', assignedRoleId: 'wing-commander' },
      dockings, activeVesselIds, occurredAt: 'now',
    })).toThrow(/cannot dock/i);
  });
});
