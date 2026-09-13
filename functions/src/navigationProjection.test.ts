import { describe, expect, it } from 'vitest';
import { navigationState, playerDiscoveryProjection } from './navigationProjection';

function player(fields: Record<string, unknown>) {
  return { get: (field: string) => fields[field] };
}

const navigation = navigationState({
  shipGalacticCoordinates: { dione: '5143', shepherd: '1413' },
  shipNavigationLogs: {
    dione: [{
      id: 'dione-own', shipId: 'dione', type: 'self-jump', origin: '0000', destination: '5143',
      occurredAt: '2026-09-12T20:00:00.000Z', stardate: '2026.255.200000',
    }, {
      id: 'dione-other', shipId: 'shepherd', type: 'ship-jump-arrival', origin: '0000', destination: '1413',
      occurredAt: '2026-09-12T20:00:00.000Z', stardate: '2026.255.200000',
    }],
    shepherd: [{
      id: 'shepherd-own', shipId: 'shepherd', type: 'self-jump', origin: '0000', destination: '1413',
      occurredAt: '2026-09-12T20:01:00.000Z', stardate: '2026.255.200100',
    }],
  },
}, ['dione', 'shepherd']);

describe('server discovery projections', () => {
  it('fails closed for malformed legacy navigation records', () => {
    expect(navigationState({
      shipGalacticCoordinates: { dione: '5143', shepherd: 1413 },
      shipNavigationLogs: {
        dione: [{ shipId: 'dione', type: 'self-jump', destination: '5143' }],
        shepherd: 'not-a-log-array',
      },
    }, ['dione', 'shepherd'])).toEqual({
      shipGalacticCoordinates: { dione: '5143', shepherd: '0000' },
      shipNavigationLogs: { dione: [], shepherd: [] },
    });
  });

  it('entitles each ship to its own authoritative visits without group union', () => {
    const dione = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' }), navigation, 4,
    );
    const shepherd = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-2', assignedRoleId: 'shepherd-captain' }), navigation, 4,
    );

    expect(dione).toMatchObject({
      groupId: 'fleet-1', shipId: 'dione', currentCoordinate: '5143', pursuitDistance: 1,
    });
    expect(dione.knownCoordinates).toEqual(['0000', '5143']);
    expect(dione.navigationLogs).toHaveLength(1);
    expect(dione.navigationLogs[0]?.shipId).toBe('dione');
    expect(dione.knownSystems).toEqual({ 'system-01': '0000', 'system-02': '5143' });
    expect(dione.knownCoordinates).not.toContain('1413');
    expect(shepherd).toMatchObject({
      groupId: 'fleet-2', shipId: 'shepherd', currentCoordinate: '1413', pursuitDistance: 1,
    });
    expect(shepherd.navigationLogs).toHaveLength(1);
    expect(shepherd.navigationLogs[0]?.shipId).toBe('shepherd');
    expect(shepherd.knownCoordinates).not.toContain('5143');
  });

  it('gives an unassigned member only the stable origin fix', () => {
    expect(playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-2', assignedRoleId: null }), navigation, 4,
    )).toEqual({
      groupId: 'fleet-2',
      knownCoordinates: ['0000'],
      knownSystems: { 'system-01': '0000' },
      pursuitDistance: 0,
      navigationLogs: [],
      revision: 4,
    });
  });
});
