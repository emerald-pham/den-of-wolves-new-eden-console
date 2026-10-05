import { useEffect, useState } from 'react';
import {
  formatTurnPhaseCountdown,
  turnPhaseReadout,
  type TurnPhaseReadout,
} from '@/lib/turnPhase';
import type { TurnPhase } from '@/types/game';

function useTurnPhaseReadout(phase: TurnPhase | undefined): TurnPhaseReadout | undefined {
  const [now, setNow] = useState(() => Date.now());
  const identity = phase
    ? [
        phase.turn,
        phase.teamPhaseEndsAt,
        phase.openAirspaceEndsAt,
        phase.timerPause?.window ?? '',
        phase.timerPause?.remainingMs ?? '',
        phase.timerPause?.pausedAt ?? '',
      ].join(':')
    : '';
  useEffect(() => {
    setNow(Date.now());
    if (!phase) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [identity, phase]);
  return turnPhaseReadout(phase, now);
}

/** Each live airspace window remains a non-interactive instrument inside DRADIS. */
export function DradisAirspaceTimer({ phase }: { readonly phase: TurnPhase | undefined }) {
  const readout = useTurnPhaseReadout(phase);
  const closed = readout?.kind === 'team';
  const open = readout?.kind === 'open' && phase?.airspace.state === 'lifted';
  const manual = phase?.progression === 'manual';
  const paused = phase?.timerPause !== undefined;
  const automatic = phase?.timerPause?.reason === 'empty-session';
  if ((!closed && !open) || phase?.timerPause?.reason === 'turn-interstitial') return null;
  const time = manual ? 'MANUAL' : formatTurnPhaseCountdown(readout.remainingMs);
  const label = closed ? 'Airspace closed' : 'Airspace open';
  const accessible = manual
    ? `${label} // manual GM advance`
    : `${label} // ${time} remaining${paused ? automatic ? ' // awaiting reconnect' : ' // emergency timer paused' : ''}`;
  return (
    <div className="turn-phase-timer" role="status" aria-live="off" data-plot-obstacle
      aria-label={accessible}
      data-tone={paused && !automatic ? 'red' : 'blue'}>
      <span>{label}{manual ? ' // GM-controlled' : paused ? automatic ? ' // Session hold' : ' // Emergency hold' : ''}</span>
      <strong>{time}</strong>
      {manual && <small>GM advances the next phase</small>}
      {paused && <small>{automatic ? 'Resumes on reconnect' : 'GM resume required'}</small>}
    </div>
  );
}

/** The deliberately disabled AEGIS controls make clear that both clocks are automatic. */
export function AirspaceTimerControls({ phase }: { readonly phase: TurnPhase | undefined }) {
  const readout = useTurnPhaseReadout(phase);
  const manual = phase?.progression === 'manual';
  const teamTime = manual ? 'MANUAL' : readout?.kind === 'team'
    ? formatTurnPhaseCountdown(readout.remainingMs)
    : 'COMPLETE';
  const openTime = manual ? 'STANDBY' : readout?.kind === 'open'
    ? formatTurnPhaseCountdown(readout.remainingMs)
    : readout?.kind === 'complete' ? 'COMPLETE' : 'STANDBY';
  const pauseSuffix = phase?.timerPause
    ? phase.timerPause.reason === 'turn-interstitial' ? ' // cycle briefing hold'
      : phase.timerPause.reason === 'empty-session' ? ' // awaiting reconnect' : ' // emergency hold'
    : '';
  return (
    <div className="airspace-control__timers" aria-label={manual ? 'Manual phase controls' : 'Automated phase timers'}>
      <button className="airspace-control__timer" type="button" disabled data-tone="red"
        aria-label={manual ? 'Airspace closed timer // MANUAL // GM advances' : `Airspace closed timer // ${teamTime}${pauseSuffix} // no manual control`}>
        Airspace closed // {teamTime}{manual ? ' // GM advances' : `${pauseSuffix} // no manual control`}
      </button>
      <button className="airspace-control__timer" type="button" disabled data-tone="blue"
        aria-label={manual ? 'Airspace open timer // STANDBY // GM advances' : `Airspace open timer // ${openTime}${pauseSuffix} // no manual control`}>
        Airspace open // {openTime}{manual ? ' // GM advances' : `${pauseSuffix} // no manual control`}
      </button>
    </div>
  );
}
