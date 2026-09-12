import { expect, it } from 'vitest';
import {
  extendActiveTurnPhase,
  isPlayerGameplayLockedAtTurnZero,
  isTurnPhaseTimerActive,
  pauseActiveTurnPhase,
  resumePausedTurnPhase,
  startTurnPhase,
  turnStateForPhase,
  turnStateState,
  updateTurnStateForPhase,
} from './turnZero';

it('reserves Turn 0 gameplay commands for GMs', () => {
  expect(isPlayerGameplayLockedAtTurnZero(0, 'player')).toBe(true);
  expect(isPlayerGameplayLockedAtTurnZero(0, 'gm')).toBe(false);
  expect(isPlayerGameplayLockedAtTurnZero(1, 'player')).toBe(false);
  expect(isPlayerGameplayLockedAtTurnZero(undefined, 'player')).toBe(false);
});

const phase = {
  turn: 3,
  teamPhaseEndsAt: '2026-09-07T12:05:00.000Z',
  openAirspaceEndsAt: '2026-09-07T12:20:00.000Z',
  airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false },
};

it('extends a live restricted window and preserves its full open window', () => {
  expect(extendActiveTurnPhase(
    phase,
    'restricted',
    Date.parse('2026-09-07T12:00:00.000Z'),
  )).toEqual({
    ...phase,
    teamPhaseEndsAt: '2026-09-07T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-07T12:25:00.000Z',
  });
});

it('extends a live open window without moving the restricted deadline', () => {
  expect(extendActiveTurnPhase(
    {
      ...phase,
      teamPhaseEndsAt: '2026-09-07T11:55:00.000Z',
      airspace: { ...phase.airspace, state: 'lifted' },
    },
    'open',
    Date.parse('2026-09-07T12:00:00.000Z'),
  )).toEqual({
    ...phase,
    teamPhaseEndsAt: '2026-09-07T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-07T12:25:00.000Z',
    airspace: { ...phase.airspace, state: 'lifted' },
  });
});

it('does not extend a window that is not currently active', () => {
  expect(extendActiveTurnPhase(
    phase,
    'open',
    Date.parse('2026-09-07T12:00:00.000Z'),
  )).toBeUndefined();
  expect(extendActiveTurnPhase(
    phase,
    'restricted',
    Date.parse('2026-09-07T12:06:00.000Z'),
  )).toBeUndefined();
});

it('pauses and resumes the server-owned clock without losing the held time', () => {
  const paused = pauseActiveTurnPhase(
    phase,
    Date.parse('2026-09-07T12:02:00.000Z'),
  );

  expect(paused).toEqual({
    ...phase,
    timerPause: {
      window: 'restricted',
      remainingMs: 3 * 60_000,
      pausedAt: '2026-09-07T12:02:00.000Z',
    },
  });
  expect(isTurnPhaseTimerActive(paused, Date.parse('2026-09-07T12:30:00.000Z'))).toBe(true);

  expect(resumePausedTurnPhase(
    paused!,
    Date.parse('2026-09-07T12:04:00.000Z'),
  )).toEqual({
    ...phase,
    teamPhaseEndsAt: '2026-09-07T12:07:00.000Z',
    openAirspaceEndsAt: '2026-09-07T12:22:00.000Z',
  });
});

it('does not create a second pause or extend a paused window', () => {
  const paused = pauseActiveTurnPhase(phase, Date.parse('2026-09-07T12:02:00.000Z'))!;
  expect(pauseActiveTurnPhase(paused, Date.parse('2026-09-07T12:03:00.000Z'))).toEqual(paused);
  expect(extendActiveTurnPhase(
    paused,
    'restricted',
    Date.parse('2026-09-07T12:03:00.000Z'),
  )).toBeUndefined();
});

it('records a complete turn entity across the existing Team-to-Coordination boundary', () => {
  const startedAt = '2026-09-07T12:00:00.000Z';
  const team = startTurnPhase(1, Date.parse(startedAt));
  const initial = turnStateForPhase(team, 7, 1, startedAt);

  expect(initial).toEqual({
    currentTurn: 1,
    maxTurn: 7,
    phase: 'team',
    phaseRevision: 1,
    startedAt,
    endsAt: '2026-09-07T12:10:00.000Z',
  });
  expect(turnStateState(initial)).toEqual(initial);
  expect(updateTurnStateForPhase(team, initial)).toEqual(initial);

  const coordination = {
    ...team,
    airspace: { ...team.airspace, state: 'lifted' as const },
  };
  expect(updateTurnStateForPhase(coordination, initial)).toEqual({
    currentTurn: 1,
    maxTurn: 7,
    phase: 'coordination',
    phaseRevision: 2,
    startedAt: '2026-09-07T12:10:00.000Z',
    endsAt: '2026-09-07T12:30:00.000Z',
  });
});

it('rejects an incomplete or impossible turn entity without inventing a fallback', () => {
  expect(turnStateState({
    currentTurn: 1,
    maxTurn: 7,
    phase: 'team',
    phaseRevision: 1,
    startedAt: '2026-09-07T12:00:00.000Z',
  })).toBeUndefined();
  expect(turnStateState({
    currentTurn: 8,
    maxTurn: 7,
    phase: 'coordination',
    phaseRevision: 2,
    startedAt: '2026-09-07T12:10:00.000Z',
    endsAt: '2026-09-07T12:30:00.000Z',
  })).toBeUndefined();
});
