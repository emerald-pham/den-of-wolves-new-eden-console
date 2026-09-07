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
  const paused = phase?.timerPause !== undefined;
  if (!closed && !open) return null;
  const time = formatTurnPhaseCountdown(readout.remainingMs);
  const label = closed ? 'Airspace closed' : 'Airspace open';
  return (
    <div className="turn-phase-timer" role="status" aria-live="off"
      aria-label={`${label} // ${time} remaining${paused ? ' // emergency timer paused' : ''}`}
      data-tone={paused ? 'red' : 'blue'}>
      <span>{label}{paused ? ' // Emergency hold' : ''}</span>
      <strong>{time}</strong>
      {paused && <small>GM resume required</small>}
    </div>
  );
}

/** The deliberately disabled AEGIS controls make clear that both clocks are automatic. */
export function AirspaceTimerControls({ phase }: { readonly phase: TurnPhase | undefined }) {
  const readout = useTurnPhaseReadout(phase);
  const teamTime = readout?.kind === 'team'
    ? formatTurnPhaseCountdown(readout.remainingMs)
    : 'COMPLETE';
  const openTime = readout?.kind === 'open'
    ? formatTurnPhaseCountdown(readout.remainingMs)
    : readout?.kind === 'complete' ? 'COMPLETE' : 'STANDBY';
  const pauseSuffix = phase?.timerPause ? ' // emergency hold' : '';
  return (
    <div className="airspace-control__timers" aria-label="Automated phase timers">
      <button className="airspace-control__timer" type="button" disabled data-tone="red"
        aria-label={`Airspace closed timer // ${teamTime}${pauseSuffix} // no manual control`}>
        Airspace closed // {teamTime}{pauseSuffix} // no manual control
      </button>
      <button className="airspace-control__timer" type="button" disabled data-tone="blue"
        aria-label={`Airspace open timer // ${openTime}${pauseSuffix} // no manual control`}>
        Airspace open // {openTime}{pauseSuffix} // no manual control
      </button>
    </div>
  );
}
