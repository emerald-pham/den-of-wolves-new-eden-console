import { expect, it } from 'vitest';
import { extendActiveTurnPhase, isPlayerGameplayLockedAtTurnZero } from './turnZero';

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
