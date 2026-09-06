import { useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { setFleetRedAlert } from '@/lib/fleetAlertService';

export default function FleetAlertControl() {
  const { session, me, connection } = useSessionStore();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  if (me?.activeConsoleRoleId !== 'admiral') return null;
  const active = session?.fleetRedAlert?.active === true;
  const execute = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try { await setFleetRedAlert(!active); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Fleet alert command failed. Try again.'); }
    finally { busy.current = false; setPending(false); }
  };
  return <section aria-label="Fleet alert command" className="fleet-alert-command">
    <button className="cic-action-button" disabled={pending || connection !== 'live' || session?.phase === 'closed'} onClick={() => void execute()}>
      {active ? 'Stand down' : 'Fleetwide red alert'}
    </button>
    <span>{pending ? 'Transmitting command…' : active ? 'Red alert active // Fleetwide' : 'Fleet alert // Standing by'}</span>
    {error && <p role="alert">{error}</p>}
  </section>;
}
