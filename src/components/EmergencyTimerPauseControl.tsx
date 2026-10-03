import { useEffect, useState } from 'react';
import { setEmergencyTimerPaused } from '@/lib/sessionService';
import { hasActiveTurnTimer } from '@/lib/turnPhase';
import type { TurnPhase } from '@/types/game';

type Connection = 'idle' | 'connecting' | 'live' | 'offline';

interface EmergencyTimerPauseControlProps {
  readonly phase: TurnPhase | undefined;
  readonly connection: Connection;
  readonly busy?: boolean;
  readonly attack?: Readonly<{turn:number;revision:number;currentStep:string}>;
  readonly authorityKey?: string;
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
  attack,
  authorityKey,
}: EmergencyTimerPauseControlProps) {
  const [now, setNow] = useState(() => Date.now());
  const [clickCount, setClickCount] = useState(0);
  const [changing, setChanging] = useState(false);
  const [reason,setReason]=useState('');
  const identity = `${phaseIdentity(phase)}:${attack?.turn??''}:${attack?.revision??''}:${attack?.currentStep??''}:${authorityKey??''}`;
  const automatic = phase?.timerPause?.reason === 'empty-session';
  const briefing = phase?.timerPause?.reason === 'turn-interstitial';
  const paused = phase?.timerPause !== undefined;
  const timerLive = hasActiveTurnTimer(phase, now);
  const cleanReason=reason.trim();
  const canAct = connection === 'live' && Boolean(phase) && timerLive && !busy && !changing && !automatic && !briefing &&
    (!attack || attack.turn===phase?.turn && cleanReason.length>=8 && cleanReason.length<=400);

  useEffect(() => {
    setNow(Date.now());
    if (!phase || phase.timerPause) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [identity, phase]);

  useEffect(() => {
    setClickCount(0);
  }, [busy, canAct, connection, identity, reason]);
  useEffect(()=>setReason(''),[identity,connection]);

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
      if (attack) await setEmergencyTimerPaused(!paused,{
        expectedAttackRevision:attack.revision,reason:cleanReason,dangerConfirmed:true,
      });
      else await setEmergencyTimerPaused(!paused);
    } catch {
      // The shared communication notice reports the authoritative rejection.
    } finally {
      setChanging(false);
    }
  }

  const clicksRemaining = REQUIRED_CLICKS - clickCount;
  const actionLabel = paused ? 'Re-arm interlock // Resume timer' : 'Disarm interlock // Pause timer';
  const sequenceLabel = paused ? 'Re-arm interlock' : 'Disarm interlock';
  const buttonLabel = briefing ? 'Clear cycle briefing first' : automatic ? 'Awaiting reconnect' : changing
    ? `${paused ? 'Resuming' : 'Activating'} emergency timer…`
    : clickCount > 0
      ? `${sequenceLabel} // ${clicksRemaining} ${clicksRemaining === 1 ? 'confirmation' : 'confirmations'} remaining`
      : actionLabel;
  const status = briefing ? 'Cycle clock held // briefing clearance required' : automatic ? 'Session timer paused // resumes on reconnect' : paused
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
        {briefing
          ? 'Clear the committed cycle briefing to resume its preserved time.'
          : automatic
          ? 'The empty-session hold clears when a participant reconnects.'
          : `For emergencies only // three deliberate confirmations required to ${paused ? 'resume' : 'pause'} all fleet clocks.`}
      </p>
      {attack&&<label className="gm-wolf-preparation__field gm-emergency-pause__reason">
        <span>Attack timer intervention reason // 8–400 characters</span>
        <textarea aria-label="Attack timer intervention reason" rows={2} minLength={8} maxLength={400}
          value={reason} disabled={connection!=='live'||busy||changing||automatic||briefing}
          onChange={event=>setReason(event.target.value)} />
        <span>Revision {attack.revision} // three confirmations authorize only this clock change.
          The private audit retains its reason and before/after clock; committed attack choices stay unchanged.</span>
      </label>}
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
