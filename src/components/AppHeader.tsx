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
import { findConsoleRole } from '@/data/roles';
import { CHANGELOG } from '@/changelog';
import FleetBroadcast from './FleetBroadcast';

const CONNECTION_STATUS_GRACE_MS = 1_000;

/**
 * Keep the last known in-session light steady just long enough for a restored
 * browser or waking tab to reconnect. This is presentation-only: commands
 * still read the authoritative connection state from the session store.
 */
function useConnectionStatusGrace(
  status: ReturnType<typeof selectConnectionStatus>,
  hasCachedSession: boolean,
): ReturnType<typeof selectConnectionStatus> {
  const [graceDeadline, setGraceDeadline] = useState<number | null>(() =>
    hasCachedSession && status === 'red' ? Date.now() + CONNECTION_STATUS_GRACE_MS : null,
  );

  useEffect(() => {
    if (graceDeadline === null) return;
    const timeout = window.setTimeout(
      () => setGraceDeadline(null),
      Math.max(0, graceDeadline - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [graceDeadline]);

  useEffect(() => {
    const restoreCachedLight = () => {
      if (document.visibilityState === 'visible' && hasCachedSession && status === 'red') {
        setGraceDeadline(Date.now() + CONNECTION_STATUS_GRACE_MS);
      }
    };
    document.addEventListener('visibilitychange', restoreCachedLight);
    return () => document.removeEventListener('visibilitychange', restoreCachedLight);
  }, [hasCachedSession, status]);

  return hasCachedSession && status === 'red' && graceDeadline !== null ? 'green' : status;
}

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
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState<number | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const status = useSessionStore(selectConnectionStatus);
  const sessionId = useSessionStore((state) => state.session?.id);
  const playerUid = useSessionStore((state) => state.me?.uid);
  const displayStatus = useConnectionStatusGrace(status, Boolean(sessionId && playerUid));
  const joinCode = useSessionStore((state) => state.session?.joinCode);
  const currentTurn = useSessionStore((state) => state.session?.currentTurn);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const activeConsoleRoleId = useSessionStore((state) => state.me?.activeConsoleRoleId);
  const releaseQueued = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'releaseGmInstance'));
  const disconnectQueued = useSessionStore((state) =>
    state.pendingCommands.some((command) => command.kind === 'disconnectFromSession'));
  const { reducedMotion, systemReducedMotion } = useMotionPreference();
  const secondaryRole = findConsoleRole(activeConsoleRoleId ?? undefined)?.name;
  const rank = gmInstance
    ? ['GM', secondaryRole].filter(Boolean).join(' / ')
    : (secondaryRole ?? null);
  const indicatorStatus = displayStatus === 'green' && currentTurn === 0 ? 'blue' : displayStatus;

  function openSettings(): void {
    setConfirmDisconnect(false);
    setChangelogOpen(false);
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
    setConfirmDisconnect(false);
    setSettingsOpen(false);
    setChangelogOpen(false);
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

  useEffect(() => {
    if (!settingsOpen || !sessionId || disconnectQueued) {
      setConfirmDisconnect(false);
    }
  }, [disconnectQueued, sessionId, settingsOpen]);

  async function disconnectNow(): Promise<void> {
    const disconnecting = disconnectFromSession();
    setConfirmDisconnect(false);
    setSettingsOpen(false);
    navigate('/', { replace: true });
    try {
      await disconnecting;
    } catch {
      // A permanent rejection is reported by the shared interception notice.
    }
  }

  function requestDisconnect(): void {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }
    setConfirmDisconnect(false);
    void disconnectNow();
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
      <FleetBroadcast />
      {rank !== null && <p className="player-rank">Rank: {rank}</p>}
      <ConnectionIndicator status={indicatorStatus} />
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
            <section className="settings-dialog__gm-access" aria-labelledby="gm-access-settings-title">
              <h3 id="gm-access-settings-title">GM access</h3>
              <p>
                To run a game as GM, email{' '}
                <a href="mailto:emerald.pham@hey.com">emerald.pham@hey.com</a>{' '}
                to request the access password. Include proof that you have access to an
                original Den of Wolves: New Eden product. This keeps GM secrets from being
                spoiled and helps prevent unauthorized use.
              </p>
            </section>
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
            </section>
            <section className="settings-changelog" aria-labelledby="changelog-title">
              <div className="settings-changelog__header">
                <h3 id="changelog-title">Changelog</h3>
                <button
                  className="settings-changelog__toggle"
                  type="button"
                  aria-expanded={changelogOpen}
                  aria-controls="settings-changelog-entries"
                  onClick={() => setChangelogOpen((open) => !open)}
                >
                  {changelogOpen ? 'Hide changelog' : 'View changelog'}
                </button>
              </div>
              {changelogOpen && (
                <div
                  id="settings-changelog-entries"
                  className="settings-changelog__entries"
                  role="region"
                  aria-label="Changelog entries"
                  tabIndex={0}
                >
                  {CHANGELOG.map((entry) => (
                    <article className="settings-changelog__entry" key={entry.version}>
                      <h4>Build {entry.version}</h4>
                      <ul>
                        {entry.changes.map((change) => <li key={change}>{change}</li>)}
                      </ul>
                    </article>
                  ))}
                </div>
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
              style={confirmDisconnect
                ? { color: 'var(--cic-danger)', borderColor: 'var(--cic-danger)' }
                : undefined}
              onBlur={() => setConfirmDisconnect(false)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                setConfirmDisconnect(false);
              }}
              onClick={requestDisconnect}
            >
              {disconnectQueued ? 'Disconnect queued' : confirmDisconnect ? 'ARE YOU SURE?' : 'Disconnect'}
            </button>
          </section>
        </div>
      )}
    </header>
  );
}
