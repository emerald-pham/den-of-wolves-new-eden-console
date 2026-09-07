import { useEffect, useState } from 'react';
import {
  acknowledgeSessionWaiver,
  isSessionWaiverAcknowledged,
  SESSION_WAIVER_RESET_EVENT,
} from '@/lib/sessionWaiver';
import { useSessionStore } from '@/store/useSessionStore';
import SessionWaiver from './SessionWaiver';

/**
 * A browser-local gate shown after a session identity exists. The storage key
 * is deliberately not scoped to the session so changing tables within the
 * twenty-four-hour window does not repeat the same acknowledgement.
 */
export default function SessionWaiverGate() {
  const sessionId = useSessionStore((state) => state.session?.id);
  const playerUid = useSessionStore((state) => state.me?.uid);
  const [acknowledged, setAcknowledged] = useState(() => isSessionWaiverAcknowledged());

  useEffect(() => {
    if (!sessionId || !playerUid) return;
    setAcknowledged(isSessionWaiverAcknowledged());
  }, [playerUid, sessionId]);

  useEffect(() => {
    const reset = () => setAcknowledged(false);
    window.addEventListener(SESSION_WAIVER_RESET_EVENT, reset);
    return () => window.removeEventListener(SESSION_WAIVER_RESET_EVENT, reset);
  }, []);

  if (!sessionId || !playerUid || acknowledged) return null;

  return (
    <SessionWaiver
      onAcknowledge={() => {
        acknowledgeSessionWaiver();
        setAcknowledged(true);
      }}
    />
  );
}
