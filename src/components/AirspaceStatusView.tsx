import type {TurnPhase} from '@/types/game';
import { turnPhaseDeadlinePassed } from '@/lib/turnPhase';

/** One current operational status; its inputs come from the subscribed authority. */
export default function AirspaceStatusView({phase, current, restriction}: {
  readonly phase: TurnPhase | undefined;
  readonly current: boolean;
  readonly restriction?: string;
}) {
  const text = !current ? 'Reconnect to confirm current airspace clearance.'
    : phase?.timerPause?.reason === 'turn-interstitial' ? 'Cycle briefing clearance required // clock held.'
    : phase?.timerPause ? 'Airspace restricted // clock held.'
    : restriction ? `Airspace restricted // ${restriction}`
    : phase?.progression === 'manual' && phase.airspace.state === 'restricted'
      ? 'Airspace restricted // awaiting GM manual phase advance.'
    : phase?.progression === 'manual' && phase.airspace.state === 'lifted'
      ? 'Airspace open // manual GM progression.'
    : phase?.airspace.state === 'lifted' && !turnPhaseDeadlinePassed(phase, 'open')
      ? 'Airspace open // local movement authorized.'
      : `Airspace restricted // local craft remain docked.${phase?.airspace.pressAccess ? ' Press exception authorized.' : ''}`;
  return <p role="status" aria-live="polite" aria-label="Current airspace clearance">{text}</p>;
}
