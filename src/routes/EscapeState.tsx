import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fleeDestroyedShip } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import SessionExitControl from '@/components/SessionExitControl';

/** Player-facing handoff for the server-owned destroyed-ship transition. */
export default function EscapeState() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const setMe = useSessionStore((state) => state.setMe);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!session || !me) return <Navigate to="/" replace />;
  if (me.role !== 'player' || !me.escapeState) {
    return <Navigate to="/roles" replace />;
  }

  const { escapeState } = me;
  async function flee(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fleeDestroyedShip();
      if (result.escapeState) setMe({ ...useSessionStore.getState().me!, escapeState: result.escapeState });
      setMessage(result.status === 'stale'
        ? 'ESCAPE REQUEST STALE // refresh the live session and retry'
        : result.status === 'queued'
          ? 'ESCAPE REQUEST QUEUED // reconnect to confirm the server receipt'
          : 'ESCAPE RECORDED // awaiting facilitator reassignment');
    } catch {
      setMessage('ESCAPE REQUEST REJECTED // refresh the live session and retry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="session-mode escape-state">
      <section className="session-mode__panel cic-frame" aria-labelledby="escape-state-title">
        <SessionExitControl />
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title" id="escape-state-title">Escape state // ship destroyed</h1>
        <p className="role-select__lede">
          Your printed identity remains retained. Ship consoles and station claims are suspended while you leave the destroyed ship.
        </p>
        <dl className="session-mode__readouts">
          <div><dt>Destroyed ship</dt><dd>{escapeState.shipId.toUpperCase()}</dd></div>
          <div><dt>Escape status</dt><dd>{escapeState.status === 'pending' ? 'READY TO FLEE' : 'FLED // AWAITING GM'}</dd></div>
          <div><dt>Identity</dt><dd>{me.replacementRoleId ?? me.assignedRoleId ?? 'Printed role retained'}</dd></div>
        </dl>
        {escapeState.status === 'pending' ? (
          <button className="cic-action-button" type="button" disabled={busy} onClick={() => void flee()}>
            {busy ? 'Recording escape…' : 'Flee destroyed ship'}
          </button>
        ) : (
          <p className="gm-player-roster__note" role="status">Flee recorded. A live facilitator must authorize any replacement role.</p>
        )}
        <p className="gm-player-roster__note" role="status" aria-live="polite">
          {message ?? 'Retained resources and craft remain server-owned while reassignment is adjudicated.'}
        </p>
      </section>
    </main>
  );
}
