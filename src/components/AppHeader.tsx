import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectionIndicator from './ConnectionIndicator';
import SessionReadouts from './SessionReadouts';
import { selectConnectionStatus, useSessionStore } from '@/store/useSessionStore';
import {
  disconnectFromSession,
  releaseConsoleRole,
  releaseGmInstance,
} from '@/lib/sessionService';
import { APP_VERSION } from '@/version';
import { setMotionOverride, useMotionPreference } from '@/lib/motionPreference';

export default function AppHeader() {
  const navigate = useNavigate();
  const header = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty(
      '--app-header-height', `${element.getBoundingClientRect().height}px`,
    );
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty('--app-header-height');
    };
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState<number | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const status = useSessionStore(selectConnectionStatus);
  const sessionId = useSessionStore((state) => state.session?.id);
  const joinCode = useSessionStore((state) => state.session?.joinCode);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const activeConsoleRoleId = useSessionStore((state) => state.me?.activeConsoleRoleId);
  const releaseQueued = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'releaseGmInstance'));
  const disconnectQueued = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'disconnectFromSession'));
  const { override, reducedMotion, systemReducedMotion } = useMotionPreference();

  function openSettings(): void {
    setSettingsOpen(true);
  }

  useEffect(() => {
    if (!sessionId) {
      setConnectedPlayers(null);
      return;
    }
    let active = true;
    let unsubscribe: () => void = () => undefined;
    setConnectedPlayers(null);
    void import('@/lib/firestore').then(({ subscribeConnectedPlayers }) => {
      if (!active) return;
      unsubscribe = subscribeConnectedPlayers(
        sessionId,
        (players) => setConnectedPlayers(players.length),
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [sessionId]);

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
    const disconnecting = disconnectFromSession();
    setSettingsOpen(false);
    navigate('/', { replace: true });
    try {
      await disconnecting;
    } catch {
      // A permanent rejection is reported by the shared interception notice.
    }
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

  async function releaseRole(): Promise<void> {
    try {
      await releaseConsoleRole();
    } catch {
      return;
    }
    setSettingsOpen(false);
    navigate('/console', { replace: true });
  }

  return (
    <header ref={header} className="app-header">
      {joinCode !== undefined && (
        <SessionReadouts
          joinCode={joinCode}
          connectedPlayers={connectedPlayers}
          label="Current session"
        />
      )}
      <ConnectionIndicator status={status} />
      {joinCode !== undefined && (
        <button
          className="settings-button"
          ref={settingsButton}
          type="button"
          aria-label="Settings"
          onClick={openSettings}
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
            {joinCode !== undefined && (
              <SessionReadouts
                joinCode={joinCode}
                connectedPlayers={connectedPlayers}
                label="Session status"
              />
            )}
            <p>Disconnect this device from session {joinCode}.</p>
            <p className="settings-dialog__version">Build {APP_VERSION}</p>
            <section className="settings-dialog__motion" aria-labelledby="motion-settings-title">
              <h3 id="motion-settings-title">Motion</h3>
              <p>System reduced motion is {systemReducedMotion ? 'on' : 'off'}.</p>
              <label>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(event) => setMotionOverride(event.target.checked ? 'reduce' : 'full')}
                />
                Reduce motion
              </label>
              <p>
                {override === 'system'
                  ? 'Following your system setting.'
                  : 'Overriding your system setting for this console.'}
              </p>
              {override !== 'system' && (
                <button type="button" className="settings-dialog__system" onClick={() => setMotionOverride('system')}>
                  Use system setting
                </button>
              )}
            </section>
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
            {activeConsoleRoleId && (
              <button
                className="settings-dialog__disconnect"
                type="button"
                onClick={() => void releaseRole()}
              >
                Release role
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
