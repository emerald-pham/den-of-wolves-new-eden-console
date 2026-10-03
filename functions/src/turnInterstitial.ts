import { pauseActiveTurnPhase, resumePausedTurnPhase, type TurnPhase } from './turnZero';

/** A committed cycle briefing captures the actual server window, once. */
export function holdTurnAdvancePhase(phase: TurnPhase, now: number): TurnPhase {
  if (phase.timerPause) return phase;
  const paused = pauseActiveTurnPhase(phase, now);
  return paused?.timerPause
    ? { ...paused, timerPause: { ...paused.timerPause, reason: 'turn-interstitial' } }
    : phase;
}

/** Only the exact currently held cycle can release this kind of pause. */
export function clearHeldTurnAdvancePhase(
  phase: TurnPhase, expectedCycle: number, expectedPausedAt: string, now: number,
): TurnPhase | undefined {
  if (phase.turn !== expectedCycle || phase.timerPause?.reason !== 'turn-interstitial' ||
      phase.timerPause.pausedAt !== expectedPausedAt || now < Date.parse(expectedPausedAt)) return undefined;
  return resumePausedTurnPhase(phase, now);
}
