import { describe, expect, it } from 'vitest';
import { recommendedRoleIds as clientRecommendedRoleIds } from '../../src/data/rolePresets';
import {
  DEFAULT_SESSION_CONFIGURATION,
  defaultSuspicionForLoyalty,
  loyaltyAssignmentDecision,
  normalizeSessionConfiguration,
  readinessForSetup,
  activeVesselIdsForRoles,
  printedRosterForPlayerCount,
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

  it('projects the exact printed roster matrix across client and server for every supported count', () => {
    const expectedRoleIds: Readonly<Record<number, readonly string[]>> = {
      8: [
        'admiral', 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer',
        'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
        'joint-engineering-shepherd-icebreaker',
      ],
      9: [
        'admiral', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer',
        'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel',
        'joint-engineering-quellon-refinery',
      ],
      10: [
        'admiral', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer',
        'shepherd-scientist', 'quellon-engineer', 'quellon-explorer',
        'refinery-124-engineer', 'refinery-124-pdf-colonel',
      ],
      11: [
        'admiral', 'wing-commander', 'icebreaker-engineer', 'icebreaker-miner',
        'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer',
        'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
      ],
      12: [
        'admiral', 'wing-commander', 'dione-engineer', 'dione-president',
        'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer',
        'shepherd-scientist', 'quellon-engineer', 'quellon-explorer',
        'refinery-124-engineer', 'refinery-124-pdf-colonel',
      ],
      13: [
        'admiral', 'executive-officer', 'wing-commander', 'dione-engineer',
        'dione-president', 'icebreaker-engineer', 'icebreaker-miner',
        'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer',
        'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
      ],
      14: [
        'admiral', 'wing-commander', 'dione-captain', 'dione-president',
        'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain',
        'shepherd-scientist', 'quellon-captain', 'quellon-explorer',
        'refinery-124-captain', 'refinery-124-pdf-colonel',
        'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
      ],
      15: [
        'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
        'dione-president', 'icebreaker-captain', 'icebreaker-miner',
        'shepherd-captain', 'shepherd-scientist', 'quellon-captain',
        'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel',
        'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
      ],
      16: [
        'admiral', 'wing-commander', 'dione-captain', 'dione-president',
        'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
        'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
        'quellon-captain', 'quellon-engineer', 'quellon-explorer',
        'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
      ],
      17: [
        'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
        'dione-president', 'icebreaker-captain', 'icebreaker-engineer',
        'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer',
        'shepherd-scientist', 'quellon-captain', 'quellon-engineer',
        'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer',
        'refinery-124-pdf-colonel',
      ],
      18: [
        'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
        'dione-engineer', 'dione-president', 'icebreaker-captain',
        'icebreaker-engineer', 'icebreaker-miner', 'shepherd-captain',
        'shepherd-engineer', 'shepherd-scientist', 'quellon-captain',
        'quellon-engineer', 'quellon-explorer', 'refinery-124-captain',
        'refinery-124-engineer', 'refinery-124-pdf-colonel',
      ],
    };
    const expectedShipsByCount: Readonly<Record<number, readonly string[]>> = {
      8: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      9: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      10: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      11: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      12: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      13: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      14: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      15: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      16: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      17: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      18: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    };
    const expectedUnionByCount: Readonly<Record<number, readonly string[]>> = {
      8: ['joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'],
      9: ['joint-engineering-quellon-refinery'],
      10: [], 11: [], 12: [], 13: [],
      14: ['joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'],
      15: ['joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker'],
      16: [], 17: [], 18: [],
    };

    for (let playerCount = 8; playerCount <= 18; playerCount += 1) {
      const roster = printedRosterForPlayerCount(playerCount);
      expect(roster).toEqual({
        playerCount,
        roleIds: expectedRoleIds[playerCount],
        vesselIds: expectedShipsByCount[playerCount],
        unionRoleIds: expectedUnionByCount[playerCount],
        dioneEnabled: playerCount >= 12,
        wolfCount: playerCount <= 13 ? 1 : 2,
      });
      expect(clientRecommendedRoleIds(playerCount)).toEqual(expectedRoleIds[playerCount]);
      expect(roster.roleIds).toEqual(clientRecommendedRoleIds(playerCount));
      expect(roster.roleIds).not.toContain('capybara-captain');
      expect(roster.roleIds).not.toContain('capybara-recycler');
      expect(roster.vesselIds).not.toContain('capybara');
    }
    expect(() => printedRosterForPlayerCount(7)).toThrow('playerCount must be an integer from 8 through 18.');
    expect(() => printedRosterForPlayerCount(19)).toThrow('playerCount must be an integer from 8 through 18.');
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
