import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { kickGmInstance, listGmInstances } from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import type { GmInstance } from '@/types/game';

export default function GmConsole() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const local = useSessionStore((state) => state.gmInstance);
  const isGm = useSessionStore(selectIsGm);
  const pendingCommands = useSessionStore((state) => state.pendingCommands);
  const queuedKicks = new Set(
    pendingCommands.flatMap((command) =>
      command.kind === 'kickGmInstance' ? [command.payload.targetInstanceId] : []),
  );
  const [instances, setInstances] = useState<readonly GmInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isGm) return;
    let current = true;
    void listGmInstances()
      .then((next) => { if (current) setInstances(next); })
      .catch(() => undefined)
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [isGm]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (!isGm || !local) return <Navigate to="/roles" replace />;

  async function kick(instance: GmInstance): Promise<void> {
    try {
      const disposition = await kickGmInstance(instance.id);
      if (disposition !== 'queued') {
        setInstances((current) => current.filter((item) => item.id !== instance.id));
      }
    } catch {
      // The shared interception notice reports the server rejection.
    }
  }

  return (
    <main className="session-mode gm-console">
      <section className="session-mode__panel cic-frame">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">GM Console</h1>
        <p className="role-select__lede">Active GM instances for session {session.joinCode}.</p>
        {loading ? <p className="gm-console__status">Receiving instance manifest…</p> : (
          <ul className="gm-instance-list">
            {instances.map((instance) => {
              const own = instance.id === local.id;
              return (
                <li className="gm-instance cic-frame" key={instance.id}>
                  <div>
                    <strong>{instance.name}</strong>
                    <span>{instance.deviceLabel}</span>
                    {own && <span>THIS DEVICE</span>}
                  </div>
                  {!own && (
                    <button
                      type="button"
                      disabled={queuedKicks.has(instance.id)}
                      onClick={() => void kick(instance)}
                    >
                      {queuedKicks.has(instance.id) ? `Kick queued: ${instance.name}` : `Kick ${instance.name}`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
