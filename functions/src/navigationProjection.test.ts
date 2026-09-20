import { describe, expect, it, vi } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  navigationState,
  navigationStateDocumentPath,
  playerDiscoveryProjection,
  pursuitGroups,
  writePlayerDiscoveryProjection,
} from './navigationProjection';

const firestore = getFirestore(initializeApp({ projectId: 'p284-navigation-test' }, 'p284-navigation-path'));

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
  it('uses a valid Firestore document reference for private navigation state', () => {
    const reference = firestore.doc(navigationStateDocumentPath('s1'));
    expect(reference.path).toBe('sessions/s1/serverState/navigation');
  });

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
      pursuitGroups: {},
    });
  });

  it('fails closed for unprinted coordinate values in legacy state and logs', () => {
    expect(navigationState({
      shipGalacticCoordinates: { dione: '9999' },
      shipNavigationLogs: {
        dione: [{
          id: 'unknown-route', shipId: 'dione', type: 'self-jump', origin: '0000', destination: '9999',
          occurredAt: '2026-09-12T20:00:00.000Z', stardate: '2026.255.200000',
        }, {
          id: 'unknown-origin', shipId: 'dione', type: 'self-jump', origin: '9999', destination: '5143',
          occurredAt: '2026-09-12T20:01:00.000Z', stardate: '2026.255.200100',
        }],
      },
    }, ['dione'])).toEqual({
      shipGalacticCoordinates: { dione: '9999' },
      shipNavigationLogs: { dione: [] },
      pursuitGroups: {},
    });

    expect(playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' }),
      navigationState({ shipGalacticCoordinates: { dione: '9999' } }, ['dione']), 5,
    )).toMatchObject({ currentCoordinate: '0000', knownCoordinates: ['0000'] });
  });

  it('entitles each ship to its own authoritative visits without group union', () => {
    const groupedNavigation = { ...navigation, pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 } };
    const dione = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' }), groupedNavigation, 4,
    );
    const shepherd = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-2', assignedRoleId: 'shepherd-captain' }), groupedNavigation, 4,
    );

    expect(dione).toMatchObject({
      groupId: 'fleet-1', shipId: 'dione', currentCoordinate: '5143', pursuitDistance: 1,
      pursuitValue: 2,
    });
    expect(dione.knownCoordinates).toEqual(['0000', '5143']);
    expect(dione.navigationLogs).toHaveLength(1);
    expect(dione.navigationLogs[0]?.shipId).toBe('dione');
    expect(dione.knownSystems).toEqual({ 'system-01': '0000', 'system-02': '5143' });
    expect(dione.knownCoordinates).not.toContain('1413');
    expect(shepherd).toMatchObject({
      groupId: 'fleet-2', shipId: 'shepherd', currentCoordinate: '1413', pursuitDistance: 1,
      pursuitValue: 7,
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

it('migrates legacy pursuit without allowing aliases to overwrite canonical state', () => {
  expect(pursuitGroups({}, { fleet: 2 })).toEqual({ 'fleet-1': 2 });
  expect(pursuitGroups({}, { fleet: 10, 'fleet-1': 2 })).toEqual({ 'fleet-1': 2 });
  expect(pursuitGroups({}, { 'fleet-1': 2, fleet: 10 })).toEqual({ 'fleet-1': 2 });
  expect(pursuitGroups({}, { 'fleet-1': 'bad', fleet: 10 })).toEqual({});
  expect(pursuitGroups({ pursuitGroups: { 'fleet-1': 4 } }, { fleet: 10 })).toEqual({ 'fleet-1': 4 });
});

it('replaces a player projection so valid pursuit becomes pending when authority disappears', () => {
  const set = vi.fn();
  const ref = { path: 'sessions/s1/playerDiscoveries/u1' };
  const owner = player({ fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' });
  writePlayerDiscoveryProjection(
    { set } as never,
    ref as never,
    owner,
    { ...navigation, pursuitGroups: { 'fleet-1': 2 } },
    5,
  );
  writePlayerDiscoveryProjection(
    { set } as never,
    ref as never,
    owner,
    { ...navigation, pursuitGroups: {} },
    6,
  );
  writePlayerDiscoveryProjection(
    { set } as never,
    ref as never,
    player({ fleetGroupId: 'fleet-2', assignedRoleId: 'dione-captain' }),
    { ...navigation, pursuitGroups: { 'fleet-1': 2 } },
    7,
  );

  expect(set.mock.calls[0]?.[1]).toMatchObject({ pursuitValue: 2, revision: 5 });
  expect(set.mock.calls[1]?.[1]).not.toHaveProperty('pursuitValue');
  expect(set.mock.calls[1]?.[1]).toMatchObject({ groupId: 'fleet-1', revision: 6 });
  expect(set.mock.calls[1]).toHaveLength(2);
  expect(set.mock.calls[2]?.[1]).not.toHaveProperty('pursuitValue');
  expect(set.mock.calls[2]?.[1]).toMatchObject({ groupId: 'fleet-2', revision: 7 });
});

it('replacement entitlement supersedes historical assignment without a fallback', () => {
  const fields = { fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' };
  const replacement = playerDiscoveryProjection(player({ ...fields, replacementRoleId: 'rosal-militia-leader' }), navigation, 5);
  expect(replacement.shipId).toBe('shepherd');
  expect(replacement.knownCoordinates).toEqual(['0000', '1413']);
  for (const replacementRoleId of ['wolf-commander', 'unknown-role', 7]) {
    const revoked = playerDiscoveryProjection(player({ ...fields, replacementRoleId }), navigation, 5);
    expect(revoked.shipId).toBeUndefined();
    expect(revoked.knownCoordinates).toEqual(['0000']);
    expect(revoked.navigationLogs).toEqual([]);
  }
});
