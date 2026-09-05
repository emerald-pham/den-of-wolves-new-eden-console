import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { kickGmInstance } from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import type { GmInstance } from '@/types/game';

export default function GmConsole() {
  const session = useSessionStore((state) => state.session);
  const sessionId = session?.id;
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
    if (!isGm || !sessionId) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeGmInstances }) => {
      if (!active) return;
      unsubscribe = subscribeGmInstances(
        sessionId,
        (next) => {
          setInstances(next);
          setLoading(false);
        },
        () => {
          setLoading(false);
          useSessionStore.getState().setCommunicationError({
            code: 'gm-manifest-link',
            message: 'The live GM instance manifest could not be refreshed.',
          });
        },
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isGm, sessionId]);

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
        <Link className="session-mode__back cic-text-button" to="/roles">
          Back to roles
        </Link>
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
