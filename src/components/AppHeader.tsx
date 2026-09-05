import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectionIndicator from './ConnectionIndicator';
import { selectConnectionStatus, useSessionStore } from '@/store/useSessionStore';

export default function AppHeader() {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const status = useSessionStore(selectConnectionStatus);
  const joinCode = useSessionStore((state) => state.session?.joinCode);
  const disconnect = useSessionStore((state) => state.disconnect);

  function disconnectNow(): void {
    disconnect();
    setSettingsOpen(false);
    navigate('/', { replace: true });
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
          type="button"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <span aria-hidden="true">⚙</span>
        </button>
      )}
      {settingsOpen && (
        <div className="settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-dialog__header">
              <h2 id="settings-title">Session settings</h2>
              <button
                className="settings-dialog__close"
                type="button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <p>Disconnect this device from session {joinCode}.</p>
            <button
              className="settings-dialog__disconnect"
              type="button"
              onClick={disconnectNow}
            >
              Disconnect
            </button>
          </section>
        </div>
      )}
    </header>
  );
}
