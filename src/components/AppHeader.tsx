import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConnectionIndicator from './ConnectionIndicator';
import SessionReadouts from './SessionReadouts';
import {
  selectConnectionStatus,
  selectGmAccessAuthenticated,
  useSessionStore,
} from '@/store/useSessionStore';
import {
  disconnectFromSession,
  loginGmAccess,
  logoutGmAccess,
  releaseConsoleRole,
  releaseGmInstance,
  startSinglePlayerDemo,
} from '@/lib/sessionService';
import { APP_VERSION } from '@/version';
import { setMotionOverride, useMotionPreference } from '@/lib/motionPreference';
import { findConsoleRole } from '@/data/roles';
import { CHANGELOG } from '@/changelog';
import FleetBroadcast from './FleetBroadcast';

const CONNECTION_STATUS_GRACE_MS = 30_000;
const CONNECTION_ACTIVITY_WINDOW_MS = CONNECTION_STATUS_GRACE_MS;
const CONNECTION_STATUS_STARTUP_LIE_MS = 5_000;
const VISUAL_CONNECTED_PLAYERS_STORAGE_KEY = 'prompt-603a-connected-players';

function readVisualConnectedPlayers(): number | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = window.sessionStorage.getItem(VISUAL_CONNECTED_PLAYERS_STORAGE_KEY);
    if (raw === null) return null;
    const count = Number(raw);
    return Number.isSafeInteger(count) && count >= 0 && count <= 99 ? count : null;
  } catch {
    return null;
  }
}

/**
 * Keep the header optimistic while the first connection attempt settles.
 * This is presentation-only: the session store remains the source of truth
 * for commands and other behavior. A known connected state, including the
 * separate reconnect grace, always wins over this startup default.
 */
function useStartupConnectionStatusLie(
  status: ReturnType<typeof selectConnectionStatus>,
  hasCachedSession: boolean,
  explicitlyOffline: boolean,
): ReturnType<typeof selectConnectionStatus> {
  const [showRealStatus, setShowRealStatus] = useState(false);
  const hasKnownConnection = useRef(status !== 'red' || hasCachedSession);
  if (status !== 'red' || hasCachedSession) hasKnownConnection.current = true;

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setShowRealStatus(true),
      CONNECTION_STATUS_STARTUP_LIE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  return showRealStatus || hasKnownConnection.current || status !== 'red' || explicitlyOffline
    ? status
    : 'yellow';
}

/**
 * Keep the last known connection light steady while a reconnect has a chance
 * to complete. The offline icon is deliberately hard to earn: the player
 * must have been continuously active for more than the activity window before
 * the outage, and the outage must then outlast a second full grace window.
 * Interaction after the outage never changes that decision. This is
 * presentation-only: commands still read the authoritative connection state
 * from the session store.
 */
function useConnectionStatusGrace(
  status: ReturnType<typeof selectConnectionStatus>,
  hasCachedSession: boolean,
): ReturnType<typeof selectConnectionStatus> {
  const [graceDeadline, setGraceDeadline] = useState<number | null>(null);
  const [offlineDisplayMode, setOfflineDisplayMode] = useState<'eligible' | 'hidden' | null>(() =>
    hasCachedSession && status === 'red' ? 'hidden' : null,
  );
  const statusRef = useRef(status);
  const cachedSessionRef = useRef(hasCachedSession);
  const activityStartedAt = useRef<number | null>(null);
  const lastPlayerActivityAt = useRef<number | null>(null);
  const previousStatus = useRef(status);
  const previousHasCachedSession = useRef(hasCachedSession);
  const lastConnectedStatus = useRef<ReturnType<typeof selectConnectionStatus>>(
    status === 'red' ? 'green' : status,
  );
  statusRef.current = status;
  cachedSessionRef.current = hasCachedSession;
  if (status !== 'red') lastConnectedStatus.current = status;

  const resetActivity = () => {
    activityStartedAt.current = null;
    lastPlayerActivityAt.current = null;
  };

  useLayoutEffect(() => {
    const becameOffline = previousStatus.current !== 'red' && status === 'red';
    const gainedCachedSession = !previousHasCachedSession.current && hasCachedSession;
    previousStatus.current = status;
    previousHasCachedSession.current = hasCachedSession;

    if (!hasCachedSession) {
      setGraceDeadline(null);
      setOfflineDisplayMode(null);
      return;
    }
    if (status !== 'red') {
      setGraceDeadline(null);
      setOfflineDisplayMode(null);
      return;
    }
    if (becameOffline || gainedCachedSession) {
      const now = Date.now();
      const activityStart = activityStartedAt.current;
      const lastActivityAt = lastPlayerActivityAt.current;
      const activityDuration = activityStart === null ? null : now - activityStart;
      const activityAge = lastActivityAt === null ? null : now - lastActivityAt;
      const wasContinuouslyActive = activityDuration !== null
        && activityDuration > CONNECTION_ACTIVITY_WINDOW_MS
        && activityAge !== null
        && activityAge >= 0
        && activityAge <= CONNECTION_ACTIVITY_WINDOW_MS;
      setOfflineDisplayMode(wasContinuouslyActive ? 'eligible' : 'hidden');
      setGraceDeadline(
        wasContinuouslyActive ? now + CONNECTION_STATUS_GRACE_MS : null,
      );
    }
  }, [hasCachedSession, status]);

  useEffect(() => {
    if (graceDeadline === null) return;
    const timeout = window.setTimeout(
      () => setGraceDeadline(null),
      Math.max(0, graceDeadline - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [graceDeadline]);

  useEffect(() => {
    const markInteraction = () => {
      if (!cachedSessionRef.current || statusRef.current === 'red') return;
      const now = Date.now();
      const lastActivityAt = lastPlayerActivityAt.current;
      if (lastActivityAt === null || now - lastActivityAt > CONNECTION_ACTIVITY_WINDOW_MS) {
        activityStartedAt.current = now;
      }
      lastPlayerActivityAt.current = now;
    };
    const restorePassiveContext = () => {
      resetActivity();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' || document.visibilityState === 'visible') {
        restorePassiveContext();
      }
    };

    document.addEventListener('pointerdown', markInteraction, true);
    document.addEventListener('click', markInteraction, true);
    document.addEventListener('keydown', markInteraction, true);
    document.addEventListener('input', markInteraction, true);
    document.addEventListener('change', markInteraction, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', restorePassiveContext);
    window.addEventListener('focus', restorePassiveContext);
    window.addEventListener('pagehide', restorePassiveContext);
    window.addEventListener('pageshow', restorePassiveContext);
    return () => {
      document.removeEventListener('pointerdown', markInteraction, true);
      document.removeEventListener('click', markInteraction, true);
      document.removeEventListener('keydown', markInteraction, true);
      document.removeEventListener('input', markInteraction, true);
      document.removeEventListener('change', markInteraction, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', restorePassiveContext);
      window.removeEventListener('focus', restorePassiveContext);
      window.removeEventListener('pagehide', restorePassiveContext);
      window.removeEventListener('pageshow', restorePassiveContext);
    };
  }, []);

  if (hasCachedSession && status === 'red') {
    if (offlineDisplayMode !== 'eligible' || graceDeadline !== null) {
      return lastConnectedStatus.current;
    }
  }
  return status;
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
  const [gmAccessPassword, setGmAccessPassword] = useState('');
  const [gmAccessBusy, setGmAccessBusy] = useState(false);
  const [singlePlayerDemoBusy, setSinglePlayerDemoBusy] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState<number | null>(
    readVisualConnectedPlayers,
  );
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const status = useSessionStore(selectConnectionStatus);
  const explicitlyOffline = useSessionStore((state) => state.connection === 'offline');
  const sessionId = useSessionStore((state) => state.session?.id);
  const playerUid = useSessionStore((state) => state.me?.uid);
  const reconnectDisplayStatus = useConnectionStatusGrace(status, Boolean(sessionId && playerUid));
  const displayStatus = useStartupConnectionStatusLie(
    reconnectDisplayStatus,
    Boolean(sessionId && playerUid),
    explicitlyOffline,
  );
  const joinCode = useSessionStore((state) => state.session?.joinCode);
  const hasSession = sessionId !== undefined && joinCode !== undefined;
  const currentTurn = useSessionStore((state) => state.session?.currentTurn);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const gmAccessAuthenticated = useSessionStore(selectGmAccessAuthenticated);
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
  const singlePlayerDemoAvailable = currentTurn === 0 && connectedPlayers === 1;
  const indicatorStatus = displayStatus === 'green' && currentTurn === 0 ? 'blue' : displayStatus;

  function openSettings(): void {
    setConfirmDisconnect(false);
    setChangelogOpen(false);
    setSettingsOpen(true);
  }

  useEffect(() => {
    const visualConnectedPlayers = readVisualConnectedPlayers();
    if (visualConnectedPlayers !== null) {
      setConnectedPlayers(visualConnectedPlayers);
      return () => undefined;
    }
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

  async function loginGm(): Promise<void> {
    setGmAccessBusy(true);
    try {
      await loginGmAccess(gmAccessPassword);
      setGmAccessPassword('');
    } catch {
      // The shared interception notice carries the actionable server error.
    } finally {
      setGmAccessBusy(false);
    }
  }

  async function startDemo(): Promise<void> {
    if (!singlePlayerDemoAvailable || singlePlayerDemoBusy) return;
    setSinglePlayerDemoBusy(true);
    closeSettings();
    try {
      await startSinglePlayerDemo();
    } catch {
      // The shared interception notice carries the actionable server error.
    } finally {
      setSinglePlayerDemoBusy(false);
    }
  }

  async function logoutGm(): Promise<void> {
    const wasGm = gmInstance !== null;
    setGmAccessBusy(true);
    try {
      await logoutGmAccess();
      setGmAccessPassword('');
      if (wasGm) {
        setSettingsOpen(false);
        navigate('/roles', { replace: true });
      }
    } catch {
      // The shared interception notice carries the actionable server error.
    } finally {
      setGmAccessBusy(false);
    }
  }

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
      <button
        className="settings-button"
        ref={settingsButton}
        type="button"
        aria-label="Settings"
        onClick={openSettings}
      >
        <span aria-hidden="true">⚙</span>
      </button>
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
            {hasSession && <p>Disconnect this device from session {joinCode}.</p>}
            <p className="settings-dialog__version">Build {APP_VERSION}</p>
            {singlePlayerDemoAvailable && (
              <section className="settings-dialog__demo" aria-labelledby="single-player-demo-title">
                <h3 id="single-player-demo-title">Single-player demo</h3>
                <p>Start the Turn One demo for this session.</p>
                <button
                  className="settings-dialog__gm-access-button"
                  type="button"
                  disabled={singlePlayerDemoBusy}
                  onClick={() => void startDemo()}
                >
                  {singlePlayerDemoBusy ? 'Starting single-player demo…' : 'Start single-player demo'}
                </button>
              </section>
            )}
            <section className="settings-dialog__gm-access" aria-labelledby="gm-access-settings-title">
              <h3 id="gm-access-settings-title">
                <span className="settings-dialog__gm-access-icon" aria-hidden="true">
                  {gmAccessAuthenticated ? '🔓' : '🔐'}
                </span>{' '}
                GM access
              </h3>
              <p>
                To run a game as GM, email{' '}
                <a href="mailto:emerald.pham@hey.com">emerald.pham@hey.com</a>{' '}
                to request the access password. Include proof that you have access to an
                original Den of Wolves: New Eden product. This keeps GM secrets from being
                spoiled and helps prevent unauthorized use.
              </p>
              {gmAccessAuthenticated ? (
                <>
                  <p className="settings-dialog__gm-access-status">
                    🔓 GM access login is remembered in this browser and automatically logs out
                    after 24 hours.
                  </p>
                  <button
                    className="settings-dialog__gm-access-button"
                    type="button"
                    disabled={gmAccessBusy}
                    onClick={() => void logoutGm()}
                  >
                    {gmAccessBusy ? 'Logging out…' : 'Log out GM access'}
                  </button>
                </>
              ) : (
                <form className="settings-dialog__gm-access-form" onSubmit={(event) => {
                  event.preventDefault();
                  void loginGm();
                }}>
                  <label htmlFor="settings-gm-access-password">GM access password</label>
                  <input
                    id="settings-gm-access-password"
                    type="password"
                    value={gmAccessPassword}
                    disabled={gmAccessBusy}
                    maxLength={128}
                    autoComplete="current-password"
                    onChange={(event) => setGmAccessPassword(event.target.value)}
                  />
                  <button
                    className="settings-dialog__gm-access-button"
                    type="submit"
                    disabled={gmAccessBusy || gmAccessPassword.trim().length === 0}
                  >
                    {gmAccessBusy ? 'Logging in…' : 'Log in'}
                  </button>
                </form>
              )}
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
            {hasSession && (
              <>
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
              </>
            )}
          </section>
        </div>
      )}
    </header>
  );
}
