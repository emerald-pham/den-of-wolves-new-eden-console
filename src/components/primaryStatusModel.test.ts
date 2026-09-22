import { expect, it } from 'vitest';
import type { GameSession, GmInstance, Player } from '@/types/game';
import type { CommunicationError } from '@/store/useSessionStore';
import { primaryStatusModel, type PrimaryStatusContext } from './primaryStatusModel';

function context(overrides: Partial<PrimaryStatusContext> = {}): PrimaryStatusContext {
  return {
    pathname: '/roles',
    session: { id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', currentTurn: 0 } as GameSession,
    player: null,
    facilitatorActive: false,
    facilitatorAccessAuthenticated: false,
    facilitator: null,
    roleBrief: null,
    communicationError: null,
    connection: 'live',
    snapshotFreshness: 'server',
    ...overrides,
  };
}

it('reports Cycle 0, lobby phase, and the current role-selection location without guessing authority', () => {
  expect(primaryStatusModel(context())).toMatchObject({
    cycle: 'CYCLE 0',
    phase: 'LOBBY',
    location: 'SESSION // ROLE SELECT',
    authority: 'AUTHORITY // AWAITING PLAYER PROJECTION',
    nextAction: 'SELECT A PLAYER MODE OR AUTHORIZE FACILITATOR ACCESS IN SETTINGS',
    failureState: 'NO ACTIVE FAILURE REPORTED',
    severity: 'normal',
  });
});

it('uses the server-owned phase projection and calls the numbered clock a cycle', () => {
  const session = {
    id: 's1',
    name: 'Table one',
    joinCode: '4821',
    phase: 'active',
    currentTurn: 3,
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2026-09-22T14:05:00.000Z',
      openAirspaceEndsAt: '2026-09-22T14:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  } as GameSession;

  expect(primaryStatusModel(context({ pathname: '/ships/aegis/roles/admiral', session }))).toMatchObject({
    cycle: 'CYCLE 3',
    phase: 'ACTIVE // TEAM PHASE // AIRSPACE RESTRICTED',
    location: 'AEGIS // Admiral',
    nextAction: 'REVIEW THE CURRENT SHIP STATION ACTIONS',
  });
});

it('identifies shuttle, replacement, and observer locations from the active route', () => {
  expect(primaryStatusModel(context({ pathname: '/shuttles/starlight' })).location)
    .toContain('SHUTTLE //');
  expect(primaryStatusModel(context({ pathname: '/replacement/commissar' })).location)
    .toBe('Icebreaker // Commissar');
  expect(primaryStatusModel(context({ pathname: '/ships/aegis/observer' })).location)
    .toBe('SHIP // AEGIS // OBSERVER VIEW');
});

it('names mission, attack, and debrief locations and keeps error copy on cycle terminology', () => {
  expect(primaryStatusModel(context({ pathname: '/missions/away-team' })).location)
    .toBe('MISSION // AWAY-TEAM');
  expect(primaryStatusModel(context({ pathname: '/attacks/wolf' })).location)
    .toBe('ATTACK // WOLF');
  expect(primaryStatusModel(context({ pathname: '/debrief' })).nextAction)
    .toBe('REVIEW THE DEBRIEF');
  expect(primaryStatusModel(context({
    communicationError: {
      code: 'failed-precondition',
      message: 'Turn 3 claim rejected // review the turn report.',
    } as CommunicationError,
  })).failureState).toBe('Cycle 3 claim rejected // review the cycle report.');
});

it('reports only current facilitator authority and an explicit ship write grant', () => {
  const facilitator = {
    sessionId: 's1',
    name: 'Kara',
    shipConsoleWriteGrant: { shipId: 'aegis' },
  } as GmInstance;
  expect(primaryStatusModel(context({
    pathname: '/ships/aegis/observer',
    facilitatorActive: true,
    facilitator,
  })).authority).toBe('FACILITATOR OBSERVER // SHIP WRITE GRANT ACTIVE');
  expect(primaryStatusModel(context({
    pathname: '/ships/dione/observer',
    facilitatorActive: true,
    facilitator,
  })).authority).toBe('FACILITATOR OBSERVER // READ ONLY');
});

it('never presents cached or reconnecting projections as current authority or failure status', () => {
  const cachedPlayer = {
    role: 'player',
    activeConsoleRoleId: 'admiral',
  } as Player;
  expect(primaryStatusModel(context({
    player: cachedPlayer,
    connection: 'offline',
    snapshotFreshness: 'cache',
  })).authority).toContain('LAST REPORTED // VERIFY LIVE AUTHORITY');
  expect(primaryStatusModel(context({
    player: cachedPlayer,
    connection: 'offline',
    snapshotFreshness: 'cache',
  })).failureState).toBe('SESSION OFFLINE // SAVED VIEW MAY BE STALE');
});

it('shows the reported command failure or authoritative game outcome as the failure state', () => {
  const communicationError = {
    code: 'permission-denied',
    message: 'Station claim rejected // refresh the live seat map.',
  } as CommunicationError;
  expect(primaryStatusModel(context({ communicationError })).failureState)
    .toBe(communicationError.message);

  const session = {
    id: 's1',
    name: 'Table one',
    joinCode: '4821',
    phase: 'failure',
    currentTurn: 5,
    gameOutcome: {
      type: 'game-outcome',
      result: 'failure',
      cause: 'pursuit-limit',
      cycle: 5,
      navigationRevision: 2,
      occurredAt: '2026-09-22T14:20:00.000Z',
    },
  } as GameSession;
  expect(primaryStatusModel(context({ session })).failureState)
    .toBe('GAME FAILURE // PURSUIT LIMIT // CYCLE 5');
});
