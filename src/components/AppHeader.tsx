import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectionIndicator from './ConnectionIndicator';
import { selectConnectionStatus, useSessionStore } from '@/store/useSessionStore';
import {
  disconnectFromSession,
  getSessionPresence,
  releaseGmInstance,
} from '@/lib/sessionService';

export default function AppHeader() {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState<number | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const status = useSessionStore(selectConnectionStatus);
  const joinCode = useSessionStore((state) => state.session?.joinCode);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const releaseQueued = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'releaseGmInstance'));
  const disconnectQueued = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'disconnectFromSession'));

  async function openSettings(): Promise<void> {
    setSettingsOpen(true);
    setConnectedPlayers(null);
    try {
      const presence = await getSessionPresence();
      setConnectedPlayers(presence.connectedPlayers);
    } catch {
      // The disconnect action remains available when presence cannot be read.
    }
  }

  function closeSettings(): void {
    setSettingsOpen(false);
    queueMicrotask(() => settingsButton.current?.focus());
  }

  useEffect(() => {
    if (!settingsOpen) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

  async function disconnectNow(): Promise<void> {
    try {
      await disconnectFromSession();
    } catch {
      // A permanent rejection is reported by the shared interception notice.
    }
    setSettingsOpen(false);
    navigate('/', { replace: true });
  }

  async function releaseGm(): Promise<void> {
    try {
      const disposition = await releaseGmInstance();
      if (disposition === 'queued') return;
    } catch {
      return;
    }
    setSettingsOpen(false);
    navigate('/roles', { replace: true });
  }

  return (
    <header className="app-header">
      {joinCode !== undefined && (
        <div className="session-badge" aria-label={`Session code ${joinCode}`}>
          <span className="session-badge__label">Session code</span>
          <strong className="session-badge__code">{joinCode}</strong>
        </div>
      )}
      <ConnectionIndicator status={status} />
      {joinCode !== undefined && (
        <button
          className="settings-button"
          ref={settingsButton}
          type="button"
          aria-label="Settings"
          onClick={() => void openSettings()}
        >
          <span aria-hidden="true">⚙</span>
        </button>
      )}
      {settingsOpen && (
        <div className="settings-backdrop" onMouseDown={closeSettings}>
          <section
            ref={dialog}
            className="settings-dialog cic-frame"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-dialog__header">
              <h2 id="settings-title">Session settings</h2>
              <button
                className="settings-dialog__close"
                ref={closeButton}
                type="button"
                aria-label="Close settings"
                onClick={closeSettings}
              >
                ×
              </button>
            </div>
            <p>Disconnect this device from session {joinCode}.</p>
            {connectedPlayers === 1 && (
              <p className="settings-dialog__warning">
                You’re the last player to leave the server. After seven days of
                inactivity, this session will be deleted.
              </p>
            )}
            {gmInstance !== null && (
              <button
                className="settings-dialog__disconnect"
                type="button"
                disabled={releaseQueued}
                onClick={() => void releaseGm()}
              >
                {releaseQueued ? 'Release queued' : 'Release GM role'}
              </button>
            )}
            <button
              className="settings-dialog__disconnect"
              type="button"
              disabled={disconnectQueued}
              onClick={() => void disconnectNow()}
            >
              {disconnectQueued ? 'Disconnect queued' : 'Disconnect'}
            </button>
          </section>
        </div>
      )}
    </header>
  );
}
