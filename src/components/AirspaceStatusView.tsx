import type {TurnPhase} from '@/types/game';

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
    : phase?.airspace.state === 'lifted' && Date.now() < Date.parse(phase.openAirspaceEndsAt)
      ? 'Airspace open // local movement authorized.'
      : `Airspace restricted // local craft remain docked.${phase?.airspace.pressAccess ? ' Press exception authorized.' : ''}`;
  return <p role="status" aria-live="polite" aria-label="Current airspace clearance">{text}</p>;
}
