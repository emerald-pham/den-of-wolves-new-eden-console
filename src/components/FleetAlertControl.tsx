import { useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { setFleetRedAlert } from '@/lib/fleetAlertService';

export default function FleetAlertControl() {
  const { session, me, connection } = useSessionStore();
  const [coverOpen, setCoverOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  if (me?.activeConsoleRoleId !== 'admiral') return null;
  const active = session?.fleetRedAlert?.active === true;
  const execute = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try {
      await setFleetRedAlert(!active);
      setCoverOpen(false);
    }
    catch (cause) {
      setError((cause instanceof Error
        ? cause.message
        : 'FLEET ALERT COMMAND FAILED. TRY AGAIN.').toUpperCase());
    }
    finally { busy.current = false; setPending(false); }
  };
  const unavailable = connection !== 'live' || session?.phase === 'closed';
  return <section aria-label="FLEETWIDE RED ALERT"
    className="confetti-dispenser confetti-dispenser--fleet-alert">
    <p className="confetti-dispenser__label">FLEETWIDE RED ALERT</p>
    <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
      <button className="confetti-dispenser__trigger" type="button"
        aria-label={active ? 'STAND DOWN' : 'RAISE FLEETWIDE RED ALERT'}
        disabled={!coverOpen || pending || unavailable}
        onClick={() => void execute()}>
        {pending ? 'TRANSMITTING' : active ? 'STAND DOWN' : 'STAND UP'}
      </button>
      <button className="confetti-dispenser__cover" type="button"
        aria-label={`${coverOpen ? 'CLOSE' : 'OPEN'} RED ALERT COMMAND COVER`}
        aria-pressed={coverOpen}
        disabled={pending}
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
