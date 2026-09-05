import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ContactPlot from '@/components/ContactPlot';
import { DRADIS_RESIZE_MS } from '@/components/dradisMotion';
import { fleetViewFrom } from '@/data/fleetFormation';
import { SHIPS } from '@/data/ships';
import { ORIGIN_GALACTIC_COORDINATE } from '@/data/ships';
import { CONSOLE_ROLES, DEFAULT_ACTIVE_ROLE_IDS, DEFAULT_WOLF_ELIGIBLE_ROLE_IDS } from '@/data/roles';
import { MAX_PLAYER_PRESET, MIN_PLAYER_PRESET, recommendedRoleIds } from '@/data/rolePresets';
import {
  assignWolves,
  kickGmInstance,
  setCapybaraEnabled,
  setGmControlsLocked,
  setWolfRoleEnabled,
  setActiveRoleEnabled,
  applyRolePreset,
} from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { useMotionPreference } from '@/lib/motionPreference';
import type { GmInstance, SessionEvent } from '@/types/game';

export default function GmConsole() {
  const { reducedMotion } = useMotionPreference();
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
  const [events, setEvents] = useState<readonly SessionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const [dradisExpanded, setDradisExpanded] = useState(false);
  const dradisRef = useRef<HTMLElement>(null);
  const dradisPreviousBounds = useRef<DOMRect | null>(null);
  const dradisAnimation = useRef<Animation | null>(null);
  const [viewerId, setViewerId] = useState('aegis');
  const [changingCapybara, setChangingCapybara] = useState(false);
  const [pendingCapybaraEnabled, setPendingCapybaraEnabled] = useState<boolean | null>(null);
  const [changingLock, setChangingLock] = useState(false);
  const [changingWolfRole, setChangingWolfRole] = useState<string | null>(null);
  const [wolfCount, setWolfCount] = useState<1 | 2>(1);
  const [assigningWolves, setAssigningWolves] = useState(false);
  const [assignedWolfRoleIds, setAssignedWolfRoleIds] = useState<readonly string[]>([]);
  const [playerCount, setPlayerCount] = useState(21);
  const [changingActiveRole, setChangingActiveRole] = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const capybaraEnabled = session?.capybaraEnabled !== false;
  const capybaraQueued = pendingCommands.some(
    (command) => command.kind === 'setCapybaraEnabled',
  );
  const controlsLocked = session?.gmControlsLocked === true;
  const lockQueued = pendingCommands.some(
    (command) => command.kind === 'setGmControlsLocked',
  );
  const wolfEligibleRoleIds = session?.wolfEligibleRoleIds ?? DEFAULT_WOLF_ELIGIBLE_ROLE_IDS;
  const activeRoleIds = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const recommendedIds = recommendedRoleIds(playerCount);
  const isCustom = activeRoleIds.length !== recommendedIds.length ||
    activeRoleIds.some((roleId) => !recommendedIds.includes(roleId));
  const wolfRoleQueued = new Set(pendingCommands.flatMap((command) =>
    command.kind === 'setWolfRoleEnabled' ? [command.payload.roleId] : []));
  const availableShips = SHIPS.filter(
    (ship) => capybaraEnabled || ship.id !== 'capybara',
  );
  const viewer = availableShips.find((ship) => ship.id === viewerId) ?? availableShips[0];
  const viewerCoordinate = session?.shipGalacticCoordinates?.[viewer?.id ?? 'aegis'] ??
    ORIGIN_GALACTIC_COORDINATE;
  const contacts = fleetViewFrom(
    viewer?.id ?? 'aegis',
    capybaraEnabled,
    session?.shipGalacticCoordinates,
  ).map((ship) => ({
    tag: ship.name.toUpperCase(),
    x: ship.x,
    y: ship.y,
    z: ship.z,
    color: ship.color,
  }));
  const latestAlert = events.find((event) => event.type === 'fullscreen-alert');

  useLayoutEffect(() => {
    const dradis = dradisRef.current;
    const previous = dradisPreviousBounds.current;
    dradisPreviousBounds.current = null;
    if (!dradis || !previous || typeof dradis.animate !== 'function') return;
    if (reducedMotion) return;

    const next = dradis.getBoundingClientRect();
    if (next.width === 0 || next.height === 0) return;
    dradisAnimation.current = dradis.animate([
      {
        transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) ` +
          `scale(${previous.width / next.width}, ${previous.height / next.height})`,
      },
      { transform: 'none' },
    ], {
      duration: DRADIS_RESIZE_MS,
      easing: 'ease-in-out',
    });
  }, [dradisExpanded, reducedMotion]);

  const toggleDradis = () => {
    const dradis = dradisRef.current;
    if (dradis) dradisPreviousBounds.current = dradis.getBoundingClientRect();
    dradisAnimation.current?.cancel();
    dradisAnimation.current = null;
    setDradisExpanded((expanded) => !expanded);
  };

  useEffect(() => {
    if (!isGm || !sessionId) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({
      subscribeGmInstances,
      subscribeSessionEvents,
    }) => {
      if (!active) return;
      const stopInstances = subscribeGmInstances(
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
      const stopEvents = subscribeSessionEvents(
        sessionId,
        setEvents,
        () => useSessionStore.getState().setCommunicationError({
          code: 'gm-event-log-link',
          message: 'The live GM event log could not be refreshed.',
        }),
      );
      unsubscribe = () => {
        stopInstances();
        stopEvents();
      };
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

  async function changeCapybara(enabled: boolean): Promise<void> {
    setChangingCapybara(true);
    try {
      await setCapybaraEnabled(enabled);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingCapybara(false);
      setPendingCapybaraEnabled(null);
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

  async function toggleWolfRole(roleId: string, enabled: boolean): Promise<void> {
    setChangingWolfRole(roleId);
    setAssignedWolfRoleIds([]);
    try {
      await setWolfRoleEnabled(roleId, enabled);
      if (!enabled && wolfCount === 2 && wolfEligibleRoleIds.length <= 2) setWolfCount(1);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingWolfRole(null);
    }
  }

  async function randomizeWolves(): Promise<void> {
    setAssigningWolves(true);
    setAssignedWolfRoleIds([]);
    try {
      setAssignedWolfRoleIds(await assignWolves(wolfCount));
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAssigningWolves(false);
    }
  }

  async function changePreset(nextCount: number): Promise<void> {
    setPlayerCount(nextCount);
    setApplyingPreset(true);
    try {
      await applyRolePreset(nextCount);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setApplyingPreset(false);
    }
  }

  async function toggleActiveRole(roleId: string, enabled: boolean): Promise<void> {
    setChangingActiveRole(roleId);
    try {
      await setActiveRoleEnabled(roleId, enabled);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingActiveRole(null);
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

        <div className="gm-console__grid">
          <section
            ref={dradisRef}
            className="gm-console__module gm-dradis cic-frame"
            aria-label="Fleet DRADIS"
            data-expanded={String(dradisExpanded)}
          >
            <div className="gm-dradis__viewport">
              <ContactPlot
                key={`${viewer?.id ?? 'aegis'}-${String(capybaraEnabled)}`}
                placement="inset"
                size={dradisExpanded ? 'min(94vmin, 128vw)' : '92cqi'}
                contacts={contacts}
                centerLabel={viewer?.name.toUpperCase() ?? 'AEGIS'}
              />
              <button
                className="gm-dradis__toggle"
                type="button"
                aria-label={`${dradisExpanded ? 'Collapse' : 'Expand'} DRADIS display`}
                aria-pressed={dradisExpanded}
                onClick={toggleDradis}
              />
            </div>
            <div className="gm-dradis__controls">
              <p className="gm-dradis__perspective">
                DRADIS perspective // {viewer?.name ?? 'AEGIS'} // Galactic coordinates // {viewerCoordinate}
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
            </div>
          </section>

          <section className="gm-console__module cic-frame" aria-label="Setup">
            <button
              className="gm-controls-lock"
              type="button"
              aria-expanded={setupOpen}
              disabled={controlsLocked}
              onClick={() => setSetupOpen((open) => !open)}
            >
              Setup
            </button>
            {setupOpen && (
              <div className="gm-setup" aria-label="Setup controls">
                <button
                  className="gm-dradis__capybara"
                  type="button"
                  aria-label={`Turn Capybara ${capybaraEnabled ? 'off' : 'on'}`}
                  aria-pressed={capybaraEnabled}
                  disabled={changingCapybara || capybaraQueued}
                  onClick={() => setPendingCapybaraEnabled(!capybaraEnabled)}
                >
                  Capybara // {capybaraQueued ? 'Change queued' : capybaraEnabled ? 'In convoy' : 'Offline'}
                </button>
                <fieldset className="gm-role-setup">
                  <legend>Active roles</legend>
                  <label className="gm-role-preset">
                    <span>Recommended player count</span>
                    <input
                      type="range"
                      aria-label="Recommended player count"
                      min={MIN_PLAYER_PRESET}
                      max={MAX_PLAYER_PRESET}
                      value={playerCount}
                      disabled={applyingPreset}
                      onChange={(event) => void changePreset(Number(event.target.value))}
                    />
                    <output>{playerCount} players</output>
                  </label>
                  <p className="gm-role-template-status" aria-live="polite">
                    {isCustom ? 'Custom' : 'Recommended'}
                  </p>
                  <p className="gm-role-setup__note">
                    Joint Engineering Union is recommended with fewer than 18 active roles,
                    but may be enabled manually at any time.
                  </p>
                  <div className="gm-role-setup__grid">
                    {CONSOLE_ROLES.map((role) => {
                      const enabled = activeRoleIds.includes(role.id);
                      return (
                        <label className="gm-wolf-role" key={role.id}>
                          <span>{role.name}</span>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`${role.name} role availability`}
                            checked={enabled}
                            disabled={changingActiveRole === role.id}
                            onChange={() => void toggleActiveRole(role.id, !enabled)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="gm-wolf-setup">
                  <legend>Wolf eligibility</legend>
                  {CONSOLE_ROLES.map((role) => {
                    const enabled = wolfEligibleRoleIds.includes(role.id);
                    return (
                      <label className="gm-wolf-role" key={role.id}>
                        <span>{role.name}</span>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`${role.name} wolf eligibility`}
                          checked={enabled}
                          disabled={!activeRoleIds.includes(role.id) || changingWolfRole === role.id || wolfRoleQueued.has(role.id)}
                          onChange={() => void toggleWolfRole(role.id, !enabled)}
                        />
                      </label>
                    );
                  })}
                  <label className="gm-wolf-count">
                    Wolves
                    <select
                      aria-label="Wolf count"
                      value={wolfCount}
                      onChange={(event) => setWolfCount(Number(event.target.value) as 1 | 2)}
                    >
                      <option value={1} disabled={wolfEligibleRoleIds.length < 1}>1 wolf</option>
                      <option value={2} disabled={wolfEligibleRoleIds.length < 2}>2 wolves</option>
                    </select>
                  </label>
                  <button
                    className="gm-controls-lock"
                    type="button"
                    disabled={assigningWolves || wolfEligibleRoleIds.length < wolfCount}
                    onClick={() => void randomizeWolves()}
                  >
                    {assigningWolves ? 'Assigning wolves…' : 'Randomly assign wolves'}
                  </button>
                  {assignedWolfRoleIds.length > 0 && (
                    <p className="gm-wolf-result" role="status">
                      Assigned // {assignedWolfRoleIds.map((roleId) =>
                        CONSOLE_ROLES.find((role) => role.id === roleId)?.name ?? roleId).join(', ')}
                    </p>
                  )}
                </fieldset>
              </div>
            )}
          </section>

          <section className="gm-console__module cic-frame" aria-label="GM instances">
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

          <section className="gm-console__module gm-console__module--event-log cic-frame">
            <h2 className="gm-console__section-title">Event log</h2>
            {latestAlert?.type === 'fullscreen-alert' && (
              <div className="gm-event-alert gm-event-alert--critical" role="alert">
                {latestAlert.sourceRoleName} // {latestAlert.message}
              </div>
            )}
            <ul className="gm-event-log" aria-label="GM event log">
              {events.length === 0 ? <li>No logged events.</li> : events.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString()}</time>
                  <span>{event.type === 'fullscreen-alert'
                    ? `${event.sourceRoleName} // FULLSCREEN ALERT // ${event.message}`
                    : `${event.shipName} // Emergency Bridge Confetti Dispenser // ${event.actorName}`}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
      {pendingCapybaraEnabled !== null && (
        <div
          className="settings-backdrop"
          onMouseDown={() => setPendingCapybaraEnabled(null)}
        >
          <section
            className="settings-dialog cic-frame"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="convoy-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-dialog__header">
              <h2 id="convoy-confirm-title">Change convoy manifest</h2>
            </div>
            <p>
              {pendingCapybaraEnabled
                ? 'Add Capybara back to the convoy and every DRADIS view?'
                : 'Remove Capybara from the convoy and every DRADIS view?'}
            </p>
            <button
              className="cic-text-button"
              type="button"
              autoFocus
              onClick={() => setPendingCapybaraEnabled(null)}
            >
              Cancel convoy change
            </button>
            <button
              className="settings-dialog__disconnect"
              type="button"
              disabled={changingCapybara}
              onClick={() => void changeCapybara(pendingCapybaraEnabled)}
            >
              Confirm {pendingCapybaraEnabled ? 'add' : 'remove'} Capybara
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
