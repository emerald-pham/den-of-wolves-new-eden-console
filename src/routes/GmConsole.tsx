import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ContactPlot from '@/components/ContactPlot';
import { fleetViewFrom } from '@/data/fleetFormation';
import { SHIPS } from '@/data/ships';
import {
  kickGmInstance,
  setCapybaraEnabled,
  setGmControlsLocked,
} from '@/lib/sessionService';
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
  const [viewerId, setViewerId] = useState('aegis');
  const [changingCapybara, setChangingCapybara] = useState(false);
  const [changingLock, setChangingLock] = useState(false);
  const capybaraEnabled = session?.capybaraEnabled !== false;
  const capybaraQueued = pendingCommands.some(
    (command) => command.kind === 'setCapybaraEnabled',
  );
  const controlsLocked = session?.gmControlsLocked === true;
  const lockQueued = pendingCommands.some(
    (command) => command.kind === 'setGmControlsLocked',
  );
  const availableShips = SHIPS.filter(
    (ship) => capybaraEnabled || ship.id !== 'capybara',
  );
  const viewer = availableShips.find((ship) => ship.id === viewerId) ?? availableShips[0];
  const contacts = fleetViewFrom(viewer?.id ?? 'aegis', capybaraEnabled).map((ship) => ({
    tag: ship.name.toUpperCase(),
    x: ship.x,
    y: ship.y,
    z: ship.z,
    color: ship.color,
  }));

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

  useEffect(() => {
    if (!capybaraEnabled && viewerId === 'capybara') setViewerId('aegis');
  }, [capybaraEnabled, viewerId]);

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

  async function toggleCapybara(): Promise<void> {
    setChangingCapybara(true);
    try {
      await setCapybaraEnabled(!capybaraEnabled);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingCapybara(false);
    }
  }

  async function toggleLock(): Promise<void> {
    setChangingLock(true);
    try {
      await setGmControlsLocked(!controlsLocked);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingLock(false);
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

        <section className="gm-dradis" aria-label="Fleet DRADIS">
          <div className="gm-dradis__viewport cic-frame">
            <ContactPlot
              key={`${viewer?.id ?? 'aegis'}-${String(capybaraEnabled)}`}
              placement="inset"
              size="min(92cqi, 26rem)"
              contacts={contacts}
              centerLabel={viewer?.name.toUpperCase() ?? 'AEGIS'}
            />
          </div>
          <div className="gm-dradis__controls">
            <p className="gm-dradis__perspective">
              DRADIS perspective // {viewer?.name ?? 'AEGIS'}
            </p>
            <div className="gm-dradis__ships" aria-label="DRADIS perspectives">
              {availableShips.map((ship) => (
                <button
                  type="button"
                  key={ship.id}
                  aria-label={`View DRADIS from ${ship.name}`}
                  aria-pressed={ship.id === viewer?.id}
                  onClick={() => setViewerId(ship.id)}
                >
                  {ship.name}
                </button>
              ))}
            </div>
            <button
              className="gm-dradis__capybara"
              type="button"
              aria-label={`Turn Capybara ${capybaraEnabled ? 'off' : 'on'}`}
              aria-pressed={capybaraEnabled}
              disabled={changingCapybara || capybaraQueued}
              onClick={() => void toggleCapybara()}
            >
              Capybara // {capybaraQueued ? 'Change queued' : capybaraEnabled ? 'In convoy' : 'Offline'}
            </button>
          </div>
        </section>

        <h2 className="gm-console__section-title">GM instances</h2>
        <button
          className="gm-controls-lock"
          type="button"
          aria-label={`${controlsLocked ? 'Unlock' : 'Lock'} GM registration and Setup`}
          aria-pressed={controlsLocked}
          disabled={changingLock || lockQueued}
          onClick={() => void toggleLock()}
        >
          <span aria-hidden="true">{controlsLocked ? '🔒' : '🔓'}</span>
          GM registration + Setup // {lockQueued ? 'Change queued' : controlsLocked ? 'Locked' : 'Unlocked'}
        </button>
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
