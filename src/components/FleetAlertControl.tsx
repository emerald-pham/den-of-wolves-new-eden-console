import { DEFAULT_FLEET_ALERT_MESSAGE, MAX_FLEET_ALERT_LENGTH } from '@/lib/fleetAlertMessage';
import { useRef, useState } from 'react';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { useSessionStore } from '@/store/useSessionStore';
import { setFleetRedAlert } from '@/lib/fleetAlertService';

export default function FleetAlertControl() {
  const access = useConsoleAccess();
  const { session, me, connection } = useSessionStore();
  const [text, setText] = useState(session?.fleetRedAlert?.text ?? DEFAULT_FLEET_ALERT_MESSAGE);
  const [coverOpen, setCoverOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  if ((access.roleId ?? me?.activeConsoleRoleId) !== 'admiral') return null;
  const active = session?.fleetRedAlert?.active === true;
  const execute = async (nextActive = !active) => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try {
      if (nextActive) await setFleetRedAlert(true, text.trim().toLowerCase());
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
  const unavailable = !access.writable || connection !== 'live' || session?.phase === 'closed';
  return <section aria-label="FLEETWIDE RED ALERT"
    className="confetti-dispenser confetti-dispenser--fleet-alert">
    <p className="confetti-dispenser__label">FLEETWIDE RED ALERT</p>
    <label className="fleet-alert-editor">ALERT MESSAGE
      <textarea rows={4} maxLength={MAX_FLEET_ALERT_LENGTH} value={text}
        disabled={pending || unavailable}
        onChange={event => setText(event.target.value.toLowerCase())} />
    </label>
    <button className="cic-action-button" type="button" disabled={pending || unavailable}
      onClick={() => setText(DEFAULT_FLEET_ALERT_MESSAGE)}>RESTORE DEFAULT</button>
    {active && <button className="cic-action-button" type="button"
      disabled={!coverOpen || pending || unavailable || !text.trim() || text.trim() === (session?.fleetRedAlert?.text ?? DEFAULT_FLEET_ALERT_MESSAGE)}
      onClick={() => void execute(true)}>UPDATE ALERT MESSAGE</button>}
    <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
      <button className="confetti-dispenser__trigger" type="button"
        aria-label={active ? 'STAND DOWN' : 'RAISE FLEETWIDE RED ALERT'}
        disabled={!coverOpen || pending || unavailable || (!active && !text.trim())}
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
      FLEET COMMAND // {pending ? 'TRANSMITTING' : active ? 'ALERT ACTIVE' : 'STANDING BY'}
    </p>
    <p className="confetti-dispenser__notice">
      ADMIRAL AUTHORITY REQUIRED // FLEETWIDE TRANSMISSION
    </p>
    {error && <p className="confetti-dispenser__notice" role="alert">{error}</p>}
  </section>;
}
