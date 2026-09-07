import { useEffect, useState } from 'react';
import { setEmergencyTimerPaused } from '@/lib/sessionService';
import { hasActiveTurnTimer } from '@/lib/turnPhase';
import type { TurnPhase } from '@/types/game';

type Connection = 'idle' | 'connecting' | 'live' | 'offline';

interface EmergencyTimerPauseControlProps {
  readonly phase: TurnPhase | undefined;
  readonly connection: Connection;
  readonly busy?: boolean;
}

const REQUIRED_CLICKS = 3;

function phaseIdentity(phase: TurnPhase | undefined): string {
  if (!phase) return '';
  return [
    phase.turn,
    phase.teamPhaseEndsAt,
    phase.openAirspaceEndsAt,
    phase.timerPause?.window ?? '',
    phase.timerPause?.remainingMs ?? '',
    phase.timerPause?.pausedAt ?? '',
  ].join(':');
}

/** A deliberate local interlock around the server-authoritative emergency command. */
export default function EmergencyTimerPauseControl({
  phase,
  connection,
  busy = false,
}: EmergencyTimerPauseControlProps) {
  const [now, setNow] = useState(() => Date.now());
  const [clickCount, setClickCount] = useState(0);
  const [changing, setChanging] = useState(false);
  const identity = phaseIdentity(phase);
  const paused = phase?.timerPause !== undefined;
  const timerLive = hasActiveTurnTimer(phase, now);
  const canAct = connection === 'live' && Boolean(phase) && timerLive && !busy && !changing;

  useEffect(() => {
    setNow(Date.now());
    if (!phase || phase.timerPause) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [identity, phase]);

  useEffect(() => {
    setClickCount(0);
  }, [busy, canAct, connection, identity]);

  async function activate(): Promise<void> {
    if (!canAct || !phase) return;
    const nextClickCount = clickCount + 1;
    if (nextClickCount < REQUIRED_CLICKS) {
      setClickCount(nextClickCount);
      return;
    }
    setClickCount(0);
    setChanging(true);
    try {
      await setEmergencyTimerPaused(!paused);
    } catch {
      // The shared communication notice reports the authoritative rejection.
    } finally {
      setChanging(false);
    }
  }

  const clicksRemaining = REQUIRED_CLICKS - clickCount;
  const actionLabel = paused ? 'Re-arm interlock // Resume timer' : 'Disarm interlock // Pause timer';
  const sequenceLabel = paused ? 'Re-arm interlock' : 'Disarm interlock';
  const buttonLabel = changing
    ? `${paused ? 'Resuming' : 'Activating'} emergency timer…`
    : clickCount > 0
      ? `${sequenceLabel} // ${clicksRemaining} ${clicksRemaining === 1 ? 'click' : 'clicks'} remaining`
      : actionLabel;
  const status = paused
    ? 'Emergency timer paused // GM resume required'
    : timerLive
      ? 'Emergency timer // Armed'
      : 'Emergency timer // Standby';

  return (
    <section
      className="gm-console__module gm-emergency-pause cic-frame"
      aria-label="Emergency timer control"
      data-state={paused ? 'paused' : timerLive ? 'armed' : 'standby'}
    >
      <p className="gm-emergency-pause__eyebrow">Emergency systems // timer interlock</p>
      <h2 className="gm-console__section-title">Emergency timer pause</h2>
      <p className="gm-console__status" role="status" aria-live="polite">{status}</p>
      <p className="gm-emergency-pause__warning">
        For emergencies only // three deliberate clicks required to {paused ? 'resume' : 'pause'} all fleet clocks.
      </p>
      <button
        className={`cic-action-button${clickCount > 0 ? ' cic-action-button--confirm' : ''}`}
        type="button"
        disabled={!canAct}
        onClick={() => void activate()}
        aria-label={buttonLabel}
      >
        {buttonLabel}
      </button>
      <p className="gm-emergency-pause__note">
        {!phase || connection !== 'live'
          ? 'Unavailable // live GM timer link required'
          : clickCount > 0
            ? `Interlock sequence // ${REQUIRED_CLICKS - clicksRemaining + 1} of ${REQUIRED_CLICKS}`
            : 'No ordinary-play timer control // use only for a genuine emergency'}
      </p>
    </section>
  );
}
