import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { disconnectFromSession } from '@/lib/sessionService';

/** A route-level session exit for screens whose only parent is the landing page. */
export default function SessionExitControl() {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function leaveSession(): Promise<void> {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const disconnecting = disconnectFromSession();
    navigate('/', { replace: true });
    try {
      await disconnecting;
    } catch {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <button
      className="cic-action-button cic-action-button--confirm"
      type="button"
      disabled={busy}
      style={confirming
        ? { color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' }
        : undefined}
      onBlur={() => setConfirming(false)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setConfirming(false);
      }}
      onClick={() => void leaveSession()}
    >
      {busy ? 'Leaving session…' : confirming ? 'ARE YOU SURE?' : 'Leave session'}
    </button>
  );
}
