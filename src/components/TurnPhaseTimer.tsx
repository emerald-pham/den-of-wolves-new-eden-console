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
    ? `${phase.turn}:${phase.teamPhaseEndsAt}:${phase.openAirspaceEndsAt}`
    : '';
  useEffect(() => {
    setNow(Date.now());
    if (!phase) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [identity, phase]);
  return turnPhaseReadout(phase, now);
}

/** The restricted-airspace clock remains an instrument inside the DRADIS frame. */
export function DradisTeamPhaseTimer({ phase }: { readonly phase: TurnPhase | undefined }) {
  const readout = useTurnPhaseReadout(phase);
  if (!readout || readout.kind !== 'team') return null;
  const time = formatTurnPhaseCountdown(readout.remainingMs);
  return (
    <div className="turn-phase-timer" role="status" aria-live="off"
      aria-label={`Airspace restricted // ${time} remaining`} data-tone="blue">
      <span>Airspace restricted</span>
      <strong>{time}</strong>
    </div>
  );
}

/** The open-airspace clock occupies the lower edge of the fleet ticker. */
export function TickerOpenAirspaceTimer({ phase }: { readonly phase: TurnPhase | undefined }) {
  const readout = useTurnPhaseReadout(phase);
  if (!readout || readout.kind !== 'open' || phase?.airspace.state !== 'lifted') return null;
  const time = formatTurnPhaseCountdown(readout.remainingMs);
  return (
    <span className="fleet-ticker__phase-timer" role="status" aria-live="off"
      aria-label={`Airspace open // ${time} remaining`}>
      Airspace open // {time}
    </span>
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
  return (
    <div className="airspace-control__timers" aria-label="Automated phase timers">
      <button className="airspace-control__timer" type="button" disabled data-tone="red"
        aria-label={`Airspace restricted timer // ${teamTime} // no manual control`}>
        Airspace restricted // {teamTime} // no manual control
      </button>
      <button className="airspace-control__timer" type="button" disabled data-tone="blue"
        aria-label={`Airspace open timer // ${openTime} // no manual control`}>
        Airspace open // {openTime} // no manual control
      </button>
    </div>
  );
}
