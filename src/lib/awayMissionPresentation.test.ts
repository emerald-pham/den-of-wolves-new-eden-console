import { expect, it } from 'vitest';
import { missionOverrunForCurrentPhase } from './awayMissionPresentation';
const state = { status: 'active', overrun: false } as const;
const clock = { currentTurn: 2, turnPhase: { turn: 2, teamPhaseEndsAt: '2026-09-30T12:00:00Z',
  openAirspaceEndsAt: '2026-09-30T12:20:00Z', airspace: { state: 'restricted', tickerActive: true, pressAccess: false } } };
it('shows a mission continuing beyond its source Team phase without another command or new card deal', () => {
  expect(missionOverrunForCurrentPhase(state, 1, clock as never).overrun).toBe(true);
  expect(missionOverrunForCurrentPhase(state, 2, clock as never).overrun).toBe(false);
  expect(missionOverrunForCurrentPhase(state, 2, { ...clock, turnPhase: { ...clock.turnPhase,
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false } } } as never).overrun).toBe(true);
  expect(missionOverrunForCurrentPhase(state, undefined, clock as never)).toBe(state);
  expect(missionOverrunForCurrentPhase(state, 1, { ...clock, turnPhase: { ...clock.turnPhase, turn: 1 } } as never)).toBe(state);
  expect(missionOverrunForCurrentPhase({ status: 'complete', overrun: false }, 1, clock as never).overrun).toBe(false);
});
