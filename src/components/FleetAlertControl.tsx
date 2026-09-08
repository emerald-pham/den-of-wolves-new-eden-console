import { DEFAULT_FLEET_ALERT_MESSAGE, MAX_FLEET_ALERT_LENGTH } from '@/lib/fleetAlertMessage';
import { useEffect, useRef, useState } from 'react';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { setFleetRedAlert } from '@/lib/fleetAlertService';
import { isGameplayLockedAtTurnZero } from '@/lib/gameContext';

const FLEET_ALERT_COOLDOWN_MINUTES = 10;
const FLEET_ALERT_COOLDOWN_MS = FLEET_ALERT_COOLDOWN_MINUTES * 60 * 1000;

export default function FleetAlertControl() {
  const access = useConsoleAccess();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const isGm = useSessionStore(selectIsGm);
  const defaultMessage = DEFAULT_FLEET_ALERT_MESSAGE.toUpperCase();
  const [text, setText] = useState((session?.fleetRedAlert?.text ?? defaultMessage).toUpperCase());
  const [coverOpen, setCoverOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const active = session?.fleetRedAlert?.active === true;
  const lastRaisedAt = session?.fleetRedAlert?.raisedAt;
  const lastRaisedMs = lastRaisedAt ? Date.parse(lastRaisedAt) : Number.NaN;
  const lockout = !active && Number.isFinite(lastRaisedMs) && now - lastRaisedMs < FLEET_ALERT_COOLDOWN_MS;
  useEffect(() => {
    if (!lockout) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockout]);
  if ((access.roleId ?? me?.activeConsoleRoleId) !== 'admiral') return null;
  const lockoutMinutes = lockout
    ? Math.ceil((FLEET_ALERT_COOLDOWN_MS - (now - lastRaisedMs)) / 60_000)
    : 0;
  const cooldownNotice = lockout
    ? `${lockoutMinutes} ${lockoutMinutes === 1 ? 'MINUTE' : 'MINUTES'} REMAINING // FLEET ALERT COOLDOWN`
    : null;
  const turnZeroLocked = isGameplayLockedAtTurnZero(session, isGm);
  const unavailable = turnZeroLocked || !access.writable || connection !== 'live' || session?.phase === 'closed';
  const execute = async (nextActive = !active) => {
    if (busy.current || unavailable) return;
    busy.current = true; setPending(true); setError('');
    try {
      if (nextActive) await setFleetRedAlert(true, text.trim().toUpperCase());
      else await setFleetRedAlert(false);
      setCoverOpen(false);
    }
    catch (cause) {
      setError((cause instanceof Error
        ? cause.message
        : 'FLEET ALERT COMMAND FAILED. TRY AGAIN.').toUpperCase());
    }
    finally { busy.current = false; setPending(false); }
  };
  return <section aria-label="FLEETWIDE RED ALERT"
    className="confetti-dispenser confetti-dispenser--fleet-alert">
    <p className="confetti-dispenser__label">FLEETWIDE RED ALERT</p>
    <label className="fleet-alert-editor">ALERT MESSAGE
      <textarea rows={4} maxLength={MAX_FLEET_ALERT_LENGTH} value={text}
        disabled={pending || unavailable}
        onChange={event => setText(event.target.value.toUpperCase())} />
    </label>
    <button className="cic-action-button" type="button" disabled={pending || unavailable}
      onClick={() => setText(defaultMessage)}>RESTORE DEFAULT</button>
    {active && <button className="cic-action-button" type="button"
      disabled={!coverOpen || pending || unavailable || !text.trim() || text.trim() === (session?.fleetRedAlert?.text ?? defaultMessage).toUpperCase()}
      onClick={() => void execute(true)}>UPDATE ALERT MESSAGE</button>}
    <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
      <button className="confetti-dispenser__trigger" type="button"
        aria-label={active ? 'STAND DOWN' : 'RAISE FLEETWIDE RED ALERT'}
        disabled={!coverOpen || pending || unavailable || lockout || (!active && !text.trim())}
        onClick={() => void execute()}>
        {pending ? 'TRANSMITTING' : active ? 'STAND DOWN' : 'STAND UP'}
      </button>
      <button className="confetti-dispenser__cover" type="button"
        aria-label={`${coverOpen ? 'CLOSE' : 'OPEN'} RED ALERT COMMAND COVER`}
        aria-pressed={coverOpen}
        disabled={pending || unavailable}
        onClick={() => setCoverOpen((current) => !current)}>
        {coverOpen ? 'COVER OPEN' : 'COMMAND LOCK'}
      </button>
    </div>
    <p className="confetti-dispenser__status">
      FLEET COMMAND // {turnZeroLocked ? 'TURN 0 // AWAITING IRIS AUTHENTICATION' : pending ? 'TRANSMITTING' : active ? 'ALERT ACTIVE' : 'STANDING BY'}
    </p>
    {cooldownNotice && <p className="confetti-dispenser__notice">{cooldownNotice}</p>}
    <p className="confetti-dispenser__notice">
      ADMIRAL AUTHORITY REQUIRED // FLEETWIDE TRANSMISSION
    </p>
    {error && <p className="confetti-dispenser__notice" role="alert">{error}</p>}
  </section>;
}
