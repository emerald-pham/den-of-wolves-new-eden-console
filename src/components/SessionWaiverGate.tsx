import { useEffect, useState } from 'react';
import {
  acknowledgeSessionWaiver,
  isSessionWaiverAcknowledged,
  readSessionWaiverAcknowledgedAt,
  SESSION_WAIVER_RESET_EVENT,
  SESSION_WAIVER_TTL_MS,
} from '@/lib/sessionWaiver';
import { useSessionStore } from '@/store/useSessionStore';
import SessionWaiver from './SessionWaiver';

/**
 * A browser-local gate shown after a session identity exists. The storage key
 * is deliberately not scoped to the session so changing tables within the
 * 72-hour window does not repeat the same acknowledgement.
 */
export default function SessionWaiverGate() {
  const sessionId = useSessionStore((state) => state.session?.id);
  const playerUid = useSessionStore((state) => state.me?.uid);
  const [acknowledged, setAcknowledged] = useState(() => isSessionWaiverAcknowledged());

  useEffect(() => {
    if (!sessionId || !playerUid) return;
    let timer: number | undefined;
    const recheck = () => {
      window.clearTimeout(timer);
      const valid = isSessionWaiverAcknowledged();
      setAcknowledged(valid);
      if (!valid) return;
      const acknowledgedAt = readSessionWaiverAcknowledgedAt();
      if (acknowledgedAt === null) return;
      timer = window.setTimeout(recheck, acknowledgedAt + SESSION_WAIVER_TTL_MS - Date.now());
    };
    const recheckWhenVisible = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    recheck();
    document.addEventListener('visibilitychange', recheckWhenVisible);
    window.addEventListener('focus', recheck);
    window.addEventListener('storage', recheck);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', recheckWhenVisible);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('storage', recheck);
    };
  }, [acknowledged, playerUid, sessionId]);

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
