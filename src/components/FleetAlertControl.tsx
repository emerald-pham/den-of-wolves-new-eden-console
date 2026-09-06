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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Fleet alert command failed. Try again.'); }
    finally { busy.current = false; setPending(false); }
  };
  const unavailable = connection !== 'live' || session?.phase === 'closed';
  return <section aria-label="Fleetwide red alert"
    className="confetti-dispenser confetti-dispenser--fleet-alert">
    <p className="confetti-dispenser__label">Fleetwide Red Alert</p>
    <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
      <button className="confetti-dispenser__trigger" type="button"
        aria-label={active ? 'Stand down' : 'Raise fleetwide red alert'}
        disabled={!coverOpen || pending || unavailable}
        onClick={() => void execute()}>
        {pending ? 'Transmitting' : active ? 'Stand down' : 'Stand up'}
      </button>
      <button className="confetti-dispenser__cover" type="button"
        aria-label={`${coverOpen ? 'Close' : 'Open'} red alert command cover`}
        aria-pressed={coverOpen}
        disabled={pending}
        onClick={() => setCoverOpen((current) => !current)}>
        {coverOpen ? 'Cover open' : 'Command lock'}
      </button>
    </div>
    <p className="confetti-dispenser__status">
      Fleet command // {pending ? 'Transmitting' : active ? 'Alert active' : 'Standing by'}
    </p>
    <p className="confetti-dispenser__notice">
      Admiral authority required // Fleetwide transmission
    </p>
    {error && <p className="confetti-dispenser__notice" role="alert">{error}</p>}
  </section>;
}
