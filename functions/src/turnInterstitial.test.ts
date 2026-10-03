import { expect, it } from 'vitest';
import { holdTurnAdvancePhase, clearHeldTurnAdvancePhase } from './turnInterstitial';
import { startTurnPhase, turnPhaseState } from './turnZero';

const now = Date.parse('2026-10-03T01:00:00.000Z');
it('captures the committed Team duration, parses it and resumes only the exact held transition', () => {
  const original = startTurnPhase(2, now);
  const held = holdTurnAdvancePhase(original, now);
  expect(held.timerPause).toEqual({ reason: 'turn-interstitial', window: 'restricted',
    remainingMs: 300000, pausedAt: new Date(now).toISOString() });
  expect(turnPhaseState(held)).toEqual(held);
  expect(clearHeldTurnAdvancePhase(held, 2, new Date(now).toISOString(), now + 720000)).toEqual({
    ...original, teamPhaseEndsAt: new Date(now + 1020000).toISOString(),
    openAirspaceEndsAt: new Date(now + 1920000).toISOString() });
  expect(clearHeldTurnAdvancePhase(held, 3, new Date(now).toISOString(), now + 720000)).toBeUndefined();
  expect(clearHeldTurnAdvancePhase(held, 2, new Date(now + 1).toISOString(), now + 720000)).toBeUndefined();
  expect(clearHeldTurnAdvancePhase(original, 2, new Date(now).toISOString(), now + 720000)).toBeUndefined();
});
it('does not relabel a genuine emergency or an empty-session hold', () => {
  const original = startTurnPhase(2, now);
  for (const reason of [undefined, 'empty-session'] as const) {
    const phase = {...original, timerPause: {window: 'restricted' as const, remainingMs: 120000,
      pausedAt: new Date(now).toISOString(), ...(reason ? {reason} : {}) }};
    expect(holdTurnAdvancePhase(phase, now)).toEqual(phase);
    expect(clearHeldTurnAdvancePhase(phase, 2, new Date(now).toISOString(), now + 10)).toBeUndefined();
  }
});
