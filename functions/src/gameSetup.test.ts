import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_CONFIGURATION,
  defaultSuspicionForLoyalty,
  loyaltyAssignmentDecision,
  normalizeSessionConfiguration,
  readinessForSetup,
  activeVesselIdsForRoles,
  roleAssignmentDecision,
  projectPrivateSetup,
  wolfCountForPlayerCount,
} from './gameSetup';

describe('authoritative setup configuration', () => {
  it('normalizes the legacy session shape to a printed base-game configuration', () => {
    expect(normalizeSessionConfiguration({})).toEqual(DEFAULT_SESSION_CONFIGURATION);
    expect(normalizeSessionConfiguration({
      playerCount: 14,
      chartId: 'B',
      expansion: 'capybara',
      turnLimit: 7,
    })).toEqual({
      playerCount: 14,
      chartId: 'B',
      expansion: 'capybara',
      turnLimit: 7,
      dioneEnabled: true,
      capybaraEnabled: true,
    });
  });

  it.each([
    ['playerCount', { playerCount: 7 }],
    ['chartId', { chartId: 'D' }],
    ['expansion', { expansion: 'mixed' }],
    ['turnLimit', { turnLimit: 9 }],
    ['dione', { playerCount: 8, dioneEnabled: true }],
  ])('rejects an unsupported %s option before writes', (_name, input) => {
    expect(() => normalizeSessionConfiguration(input)).toThrow();
  });

  it('maps the printed player-count range to one or two hidden wolves', () => {
    expect(wolfCountForPlayerCount(8)).toBe(1);
    expect(wolfCountForPlayerCount(13)).toBe(1);
    expect(wolfCountForPlayerCount(14)).toBe(2);
    expect(wolfCountForPlayerCount(18)).toBe(2);
  });
});

describe('casting and private setup policy', () => {
  it('keeps role assignment exclusive while allowing only configured Union pairings', () => {
    const assignments = [{ uid: 'u1', roleId: 'admiral' }];
    expect(roleAssignmentDecision(assignments, 'u1', 'scientist', ['admiral', 'scientist']))
      .toMatchObject({ allowed: false, reason: 'player-already-assigned' });
    expect(roleAssignmentDecision(assignments, 'u2', 'admiral', ['admiral', 'scientist']))
      .toMatchObject({ allowed: false, reason: 'role-already-assigned' });
    expect(roleAssignmentDecision([], 'u1', 'joint-engineering-quellon-refinery', [
      'admiral', 'joint-engineering-quellon-refinery', 'icebreaker-miner',
    ])).toMatchObject({ allowed: false, reason: 'incomplete-union-roster' });
  });

  it('uses the printed starting suspicion values', () => {
    expect(defaultSuspicionForLoyalty('fleet-loyalist')).toEqual([0, 5, 10]);
    expect(defaultSuspicionForLoyalty('wolf-agent')).toEqual([0]);
    expect(defaultSuspicionForLoyalty('intelligence-agent')).toEqual([6]);
    expect(defaultSuspicionForLoyalty('universal-arbour')).toEqual([10]);
    expect(defaultSuspicionForLoyalty('wolf-cult')).toEqual([15]);
    expect(defaultSuspicionForLoyalty('android')).toEqual([]);
  });

  it('accepts only the printed suspicion value for each private loyalty kind', () => {
    expect(loyaltyAssignmentDecision('wolf-agent', 0)).toEqual({ allowed: true, suspicion: 0 });
    expect(loyaltyAssignmentDecision('intelligence-agent', 6)).toEqual({ allowed: true, suspicion: 6 });
    expect(loyaltyAssignmentDecision('android', null)).toEqual({ allowed: true, suspicion: null });
    expect(loyaltyAssignmentDecision('fleet-loyalist', 4)).toMatchObject({
      allowed: false, reason: 'invalid-suspicion',
    });
  });

  it('projects only a player\'s own brief and loyalty while facilitators receive the census', () => {
    const setup = {
      briefs: { u1: { roleId: 'admiral', text: 'private brief' }, u2: { roleId: 'miner', text: 'other brief' } },
      loyalties: {
        u1: { kind: 'android', suspicion: null },
        u2: { kind: 'wolf-agent', suspicion: 0 },
      },
      friendPairs: { u1: 'u2' },
      censusNotes: { u2: 'facilitator note' },
    } as const;

    expect(projectPrivateSetup(setup, 'u1', false)).toEqual({
      brief: { roleId: 'admiral', text: 'private brief' },
      loyalty: { kind: 'android', suspicion: null },
      friend: undefined,
    });
    expect(projectPrivateSetup(setup, 'u1', true)).toMatchObject({
      census: {
        u2: { kind: 'wolf-agent', suspicion: 0, note: 'facilitator note' },
      },
    });
    expect(JSON.stringify(projectPrivateSetup(setup, 'u1', false))).not.toContain('wolf-agent');
    expect(JSON.stringify(projectPrivateSetup(setup, 'u1', false))).not.toContain('facilitator note');
  });
});

describe('start readiness', () => {
  it('derives active vessels without treating a Union role as a new vessel', () => {
    expect(activeVesselIdsForRoles([
      'admiral', 'joint-engineering-quellon-refinery', 'press-officer',
    ])).toEqual(['aegis', 'quellon', 'refinery-124', 'press']);
  });
  it('names every missing setup responsibility without leaking private reasons', () => {
    expect(readinessForSetup({
      phase: 'lobby',
      playerCount: 8,
      connectedPlayers: ['u1'],
      assignments: [],
      loyaltyUids: [],
      facilitatorResponsibilities: { main: false, assistant: false },
      activeRoleIds: ['admiral'],
      activeVesselIds: ['aegis'],
    })).toEqual({
      ready: false,
      reasons: [
        'wrong-phase', 'players', 'roles', 'loyalties',
        'main-facilitator', 'assistant-facilitator', 'vessels',
      ],
    });
  });

  it('accepts a complete public readiness shape without returning hidden assignments', () => {
    const connectedPlayers = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
    const assignments = [
      { uid: 'u1', roleId: 'admiral' },
      { uid: 'u2', roleId: 'icebreaker-miner' },
      { uid: 'u3', roleId: 'shepherd-scientist' },
      { uid: 'u4', roleId: 'quellon-explorer' },
      { uid: 'u5', roleId: 'refinery-124-pdf-colonel' },
      { uid: 'u6', roleId: 'joint-engineering-quellon-refinery' },
      { uid: 'u7', roleId: 'joint-engineering-shepherd-icebreaker' },
      { uid: 'u8', roleId: 'press-officer' },
    ];
    expect(readinessForSetup({
      phase: 'casting',
      playerCount: 8,
      connectedPlayers,
      assignments,
      loyaltyUids: connectedPlayers,
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds: assignments.map(({ roleId }) => roleId),
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'press'],
    })).toEqual({ ready: true, reasons: [] });
  });
});
