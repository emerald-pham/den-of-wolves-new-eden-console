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
import { recommendedRoleIds } from './roleConfiguration';

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
  it.each([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])(
    'accepts one unique legal assignment for every printed %s-player roster',
    (playerCount) => {
      const activeRoleIds = [...recommendedRoleIds(playerCount)];
      const connectedPlayers = activeRoleIds.map((_roleId, index) => `u${index + 1}`);
      const assignments = activeRoleIds.map((roleId, index) => ({
        uid: connectedPlayers[index]!,
        roleId,
      }));
      const expectedVessels = playerCount < 12
        ? ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124']
        : ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];

      expect(activeRoleIds).toHaveLength(playerCount);
      expect(new Set(activeRoleIds).size).toBe(playerCount);
      expect(activeRoleIds).not.toContain('press-officer');
      expect(activeRoleIds).not.toContain('capybara-captain');
      expect(activeRoleIds).not.toContain('capybara-recycler');
      expect(activeRoleIds.some((roleId) => roleId.startsWith('dione-'))).toBe(playerCount >= 12);
      expect(activeRoleIds.includes('joint-engineering-quellon-refinery'))
        .toBe([8, 9, 14, 15].includes(playerCount));
      expect(activeRoleIds.includes('joint-engineering-shepherd-icebreaker'))
        .toBe([8, 14, 15].includes(playerCount));
      expect(activeVesselIdsForRoles(activeRoleIds)).toEqual(expectedVessels);
      expect(wolfCountForPlayerCount(playerCount)).toBe(playerCount <= 13 ? 1 : 2);
      expect(readinessForSetup({
        phase: 'casting',
        playerCount,
        connectedPlayers,
        assignments,
        loyaltyUids: connectedPlayers,
        facilitatorResponsibilities: { main: true, assistant: true },
        activeRoleIds,
        activeVesselIds: expectedVessels,
      })).toEqual({ ready: true, reasons: [] });
    },
  );

  it('derives active vessels without treating a Union role as a new vessel', () => {
    expect(activeVesselIdsForRoles([
      'admiral', 'joint-engineering-quellon-refinery', 'press-officer',
    ])).toEqual(['aegis', 'quellon', 'refinery-124']);
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
      { uid: 'u2', roleId: 'wing-commander' },
      { uid: 'u3', roleId: 'icebreaker-miner' },
      { uid: 'u4', roleId: 'shepherd-scientist' },
      { uid: 'u5', roleId: 'quellon-explorer' },
      { uid: 'u6', roleId: 'refinery-124-pdf-colonel' },
      { uid: 'u7', roleId: 'joint-engineering-quellon-refinery' },
      { uid: 'u8', roleId: 'joint-engineering-shepherd-icebreaker' },
    ];
    expect(readinessForSetup({
      phase: 'casting',
      playerCount: 8,
      connectedPlayers,
      assignments,
      loyaltyUids: connectedPlayers,
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds: assignments.map(({ roleId }) => roleId),
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    })).toEqual({ ready: true, reasons: [] });
  });

  it('rejects a convenience role that is not part of the configured printed roster', () => {
    const activeRoleIds = [...recommendedRoleIds(8).slice(0, -1), 'press-officer'];
    const connectedPlayers = activeRoleIds.map((_roleId, index) => `u${index + 1}`);
    const assignments = activeRoleIds.map((roleId, index) => ({
      uid: connectedPlayers[index]!,
      roleId,
    }));

    expect(readinessForSetup({
      phase: 'casting',
      playerCount: 8,
      connectedPlayers,
      assignments,
      loyaltyUids: connectedPlayers,
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds,
      activeVesselIds: activeVesselIdsForRoles(activeRoleIds),
    })).toEqual({ ready: false, reasons: ['roles'] });
  });

  it('keeps an enabled Press holder and multiple GM instances outside core readiness and vessel math', () => {
    const coreRoleIds = [...recommendedRoleIds(20)];
    const corePlayers = coreRoleIds.map((_roleId, index) => `u${index + 1}`);
    const pressUid = 'press-21';
    const assignments = coreRoleIds.map((roleId, index) => ({
      uid: corePlayers[index]!,
      roleId,
    }));
    const readinessInput = {
      phase: 'casting',
      playerCount: 20,
      connectedPlayers: [...corePlayers, pressUid],
      assignments,
      loyaltyUids: [...corePlayers, pressUid],
      facilitatorResponsibilities: { main: true, assistant: true },
      gmInstances: ['gm-main', 'gm-assistant'],
      activeRoleIds: coreRoleIds,
      activeVesselIds: activeVesselIdsForRoles(coreRoleIds),
      pressPlayerUids: [pressUid],
    } as Parameters<typeof readinessForSetup>[0];

    expect(readinessForSetup(readinessInput)).toEqual({ ready: true, reasons: [] });
    expect(activeVesselIdsForRoles(coreRoleIds)).not.toContain('snn-press-shuttle');
  });

  it('excludes connected GM-only observers from core and Press readiness counts', () => {
    const coreRoleIds = [...recommendedRoleIds(20)];
    const corePlayers = coreRoleIds.map((_roleId, index) => `u${index + 1}`);
    const pressUid = 'press-21';
    const gmOnlyUids = ['gm-observer-1', 'gm-observer-2'];
    const input = {
      phase: 'casting',
      playerCount: 20,
      connectedPlayers: [...corePlayers, pressUid, ...gmOnlyUids],
      assignments: coreRoleIds.map((roleId, index) => ({ uid: corePlayers[index]!, roleId })),
      loyaltyUids: [...corePlayers, pressUid],
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds: coreRoleIds,
      activeVesselIds: activeVesselIdsForRoles(coreRoleIds),
      pressPlayerUids: [pressUid],
      facilitatorPlayerUids: gmOnlyUids,
    } as Parameters<typeof readinessForSetup>[0] & { facilitatorPlayerUids: string[] };

    expect(readinessForSetup(input)).toEqual({ ready: true, reasons: [] });
  });

  it('ignores orphaned Press loyalty after the station is unclaimed', () => {
    const coreRoleIds = [...recommendedRoleIds(8)];
    const corePlayers = coreRoleIds.map((_roleId, index) => `u${index + 1}`);

    expect(readinessForSetup({
      phase: 'casting',
      playerCount: 8,
      connectedPlayers: corePlayers,
      assignments: coreRoleIds.map((roleId, index) => ({ uid: corePlayers[index]!, roleId })),
      loyaltyUids: [...corePlayers, 'former-press'],
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds: coreRoleIds,
      activeVesselIds: activeVesselIdsForRoles(coreRoleIds),
      pressPlayerUids: [],
    })).toEqual({ ready: true, reasons: [] });
  });

  it('requires a claimed Press holder to carry private loyalty without changing core readiness', () => {
    const coreRoleIds = [...recommendedRoleIds(20)];
    const corePlayers = coreRoleIds.map((_roleId, index) => `u${index + 1}`);
    const pressUid = 'press-21';
    const assignments = coreRoleIds.map((_roleId, index) => ({
      uid: corePlayers[index]!,
      roleId: coreRoleIds[index]!,
    }));
    const input = {
      phase: 'casting',
      playerCount: 20,
      connectedPlayers: [...corePlayers, pressUid],
      assignments,
      loyaltyUids: corePlayers,
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds: coreRoleIds,
      activeVesselIds: activeVesselIdsForRoles(coreRoleIds),
      pressPlayerUids: [pressUid],
    };

    expect(readinessForSetup(input)).toEqual({ ready: false, reasons: ['loyalties'] });
    expect(readinessForSetup({
      ...input,
      loyaltyUids: [...corePlayers, pressUid],
    })).toEqual({ ready: true, reasons: [] });
  });

  it.each([
    ['missing core assignment', (assignments: Array<{ uid: string; roleId: string }>) => assignments.slice(0, -1)],
    ['duplicate core role', (assignments: Array<{ uid: string; roleId: string }>) => assignments.map((assignment, index) =>
      index === assignments.length - 1 ? { ...assignment, roleId: assignments[0]!.roleId } : assignment)],
    ['extra core assignment attached to the Press holder', (assignments: Array<{ uid: string; roleId: string }>) => [
      ...assignments,
      { uid: 'press-21', roleId: assignments[0]!.roleId },
    ]],
  ])('keeps %s core-roster errors visible beside an optional Press claim', (_label, mutate) => {
    const coreRoleIds = [...recommendedRoleIds(20)];
    const corePlayers = coreRoleIds.map((_roleId, index) => `u${index + 1}`);
    const baseAssignments = coreRoleIds.map((_roleId, index) => ({
      uid: corePlayers[index]!,
      roleId: coreRoleIds[index]!,
    }));
    const result = readinessForSetup({
      phase: 'casting',
      playerCount: 20,
      connectedPlayers: [...corePlayers, 'press-21'],
      assignments: mutate(baseAssignments),
      loyaltyUids: [...corePlayers, 'press-21'],
      facilitatorResponsibilities: { main: true, assistant: true },
      activeRoleIds: coreRoleIds,
      activeVesselIds: activeVesselIdsForRoles(coreRoleIds),
      pressPlayerUids: ['press-21'],
    });

    expect(result).toEqual({ ready: false, reasons: ['roles'] });
  });
});
