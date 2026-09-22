import { describe, expect, it } from 'vitest';
import { navigationState, playerDiscoveryProjection } from './navigationProjection';
import { recordSystemHazard } from './systemHistory';

function player(fields: Record<string, unknown>) {
  return { get: (field: string) => fields[field] };
}

describe('system history persistence and audience projection', () => {
  it('records a producer-owned hazard once by event identity', () => {
    const event = { id: 'maintenance-hazard-1', occurredAt: '2026-09-22T12:00:00.000Z' };
    const once = recordSystemHazard(undefined, 'aegis', '1096', event);
    const twice = recordSystemHazard(once, 'aegis', '1096', event);

    expect(twice.aegis?.['1096']?.hazards).toEqual([event]);
  });

  it('derives one durable discovery from the authoritative self-jump log', () => {
    const state = navigationState({
      shipGalacticCoordinates: { aegis: '5143', dione: '0000' },
      shipNavigationLogs: {
        aegis: [{
          id: 'jump-1', shipId: 'aegis', type: 'self-jump', origin: '0000', destination: '5143',
          occurredAt: '2026-09-13T00:00:00.000Z', stardate: '2026.256.000000',
        }],
        dione: [],
      },
    }, ['aegis', 'dione']);

    expect(state.systemHistory).toEqual({
      aegis: {
        '5143': {
          coordinate: '5143',
          discovery: { id: 'jump-1', occurredAt: '2026-09-13T00:00:00.000Z' },
          attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        },
      },
    });
  });

  it('preserves typed future buckets while discarding malformed history rows', () => {
    const state = navigationState({
      shipGalacticCoordinates: { aegis: '5143' },
      shipNavigationLogs: { aegis: [] },
      systemHistory: {
        aegis: {
          '5143': {
            coordinate: '5143',
            attempts: [{ id: 'attempt-1', occurredAt: '2026-09-13T00:01:00.000Z' }],
            hazards: [{ id: 'hazard-1', occurredAt: '2026-09-13T00:02:00.000Z' }],
            rewards: [{ id: 'reward-1', occurredAt: '2026-09-13T00:03:00.000Z' }],
            clearedThreats: [{ id: 'threat-1', occurredAt: '2026-09-13T00:04:00.000Z' }],
            candidateProgress: [{ id: 'candidate-1', occurredAt: '2026-09-13T00:05:00.000Z' }],
          },
          '9999': { coordinate: '9999', attempts: [] },
        },
      },
    }, ['aegis']);

    expect(state.systemHistory).toMatchObject({
      aegis: {
        '5143': {
          attempts: [{ id: 'attempt-1' }],
          hazards: [{ id: 'hazard-1' }],
          rewards: [{ id: 'reward-1' }],
          clearedThreats: [{ id: 'threat-1' }],
          candidateProgress: [{ id: 'candidate-1' }],
        },
      },
    });
    expect(state.systemHistory?.aegis).not.toHaveProperty('9999');
  });

  it('collapses duplicate persisted arrival events to one discovery, hazard, and reward', () => {
    const repeated = (id: string) => [
      { id, occurredAt: '2026-09-13T00:01:00.000Z' },
      { id, occurredAt: '2026-09-13T00:02:00.000Z' },
    ];
    const discovery = {
      id: 'jump-duplicate', shipId: 'aegis', type: 'self-jump' as const,
      origin: '0000', destination: '5143', occurredAt: '2026-09-13T00:00:00.000Z',
      stardate: '2026.256.000000',
    };
    const state = navigationState({
      shipGalacticCoordinates: { aegis: '5143' },
      shipNavigationLogs: { aegis: [discovery, { ...discovery }] },
      systemHistory: {
        aegis: {
          '5143': {
            coordinate: '5143',
            attempts: repeated('attempt-duplicate'),
            hazards: repeated('hazard-duplicate'),
            rewards: repeated('reward-duplicate'),
            clearedThreats: repeated('threat-duplicate'),
            candidateProgress: repeated('candidate-duplicate'),
          },
        },
      },
    }, ['aegis']);

    expect(state.systemHistory?.aegis?.['5143']).toMatchObject({
      discovery: { id: 'jump-duplicate' },
      attempts: [{ id: 'attempt-duplicate' }],
      hazards: [{ id: 'hazard-duplicate' }],
      rewards: [{ id: 'reward-duplicate' }],
      clearedThreats: [{ id: 'threat-duplicate' }],
      candidateProgress: [{ id: 'candidate-duplicate' }],
    });
  });

  it('projects only the current player ship history after reconnect or replacement', () => {
    const state = navigationState({
      shipGalacticCoordinates: { dione: '5143', shepherd: '1413' },
      shipNavigationLogs: {
        dione: [{
          id: 'dione-jump', shipId: 'dione', type: 'self-jump', origin: '0000', destination: '5143',
          occurredAt: '2026-09-13T00:00:00.000Z', stardate: '2026.256.000000',
        }],
        shepherd: [{
          id: 'shepherd-jump', shipId: 'shepherd', type: 'self-jump', origin: '0000', destination: '1413',
          occurredAt: '2026-09-13T00:01:00.000Z', stardate: '2026.256.000100',
        }],
      },
    }, ['dione', 'shepherd']);

    const dione = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' }), state, 3,
    );
    expect(Object.keys(dione.systemHistory ?? {})).toEqual(['5143']);
    expect(dione.systemHistory).not.toHaveProperty('1413');

    const replacement = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain', replacementRoleId: 'rosal-militia-leader' }),
      state,
      4,
    );
    expect(replacement.shipId).toBe('shepherd');
    expect(Object.keys(replacement.systemHistory ?? {})).toEqual(['1413']);
    expect(replacement.systemHistory).not.toHaveProperty('5143');
  });

  it('preserves a valid candidate reveal only in its entitled ship projection', () => {
    const state = navigationState({
      shipGalacticCoordinates: { aegis: '6798', dione: '0000' },
      shipNavigationLogs: { aegis: [], dione: [] },
      systemHistory: {
        aegis: {
          '6798': {
            coordinate: '6798',
            candidateDiscovery: {
              id: 'arrival-1', occurredAt: '2026-09-22T14:00:00.000Z',
              code: 'N', title: 'Ancient Jump Ring', source: 'arrival',
            },
          },
        },
      },
    }, ['aegis', 'dione']);

    const aegis = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-1', assignedRoleId: 'admiral' }), state, 5,
    );
    const dione = playerDiscoveryProjection(
      player({ fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' }), state, 5,
    );
    expect(aegis.systemHistory?.['6798']?.candidateDiscovery?.code).toBe('N');
    expect(dione.systemHistory).toBeUndefined();
  });

  it('rejects candidate history with a malformed timestamp', () => {
    const state = navigationState({
      shipGalacticCoordinates: { aegis: '6798' },
      shipNavigationLogs: { aegis: [] },
      systemHistory: {
        aegis: {
          '6798': {
            coordinate: '6798',
            candidateDiscovery: {
              id: 'forged-time', occurredAt: 'not-a-time',
              code: 'N', title: 'Ancient Jump Ring', source: 'arrival',
            },
          },
        },
      },
    }, ['aegis']);
    expect(state.systemHistory).toBeUndefined();
  });
});
