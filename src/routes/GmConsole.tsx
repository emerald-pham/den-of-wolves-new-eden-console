import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ContactPlot from '@/components/ContactPlot';
import ResourceIcon from '@/components/ResourceIcon';
import { DRADIS_RESIZE_MS } from '@/components/dradisMotion';
import { fleetViewFrom } from '@/data/fleetFormation';
import { RESOURCE_DEFINITIONS, resourcesForShip } from '@/data/resources';
import { SHIPS } from '@/data/ships';
import { ORIGIN_GALACTIC_COORDINATE } from '@/data/ships';
import { CONSOLE_ROLES, DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import { MAX_PLAYER_PRESET, MIN_PLAYER_PRESET, recommendedRoleIds } from '@/data/rolePresets';
import {
  assignWolves,
  assignWolfRoles,
  kickGmInstance,
  setCapybaraEnabled,
  setDioneEnabled,
  setGmControlsLocked,
  setActiveRoleEnabled,
  applyRolePreset,
  adjustShipResource,
} from '@/lib/sessionService';
import { selectIsGm, useSessionStore } from '@/store/useSessionStore';
import { useMotionPreference } from '@/lib/motionPreference';
import type { GmInstance, Player, SessionEvent } from '@/types/game';

interface PlayerRoleGroup {
  readonly id: string;
  readonly label: string;
  readonly players: readonly Player[];
}

interface ShipRoleGroupsProps {
  readonly roles: typeof CONSOLE_ROLES;
  readonly renderRole: (role: typeof CONSOLE_ROLES[number]) => ReactNode;
}

function ShipRoleGroups({ roles, renderRole }: ShipRoleGroupsProps) {
  const shipRoleIds = new Set(SHIPS.map((ship) => ship.id));
  const independentRoles = roles.filter((role) => !shipRoleIds.has(role.shipId));

  return (
    <div className="gm-role-groups">
      {SHIPS.map((ship) => {
        const rolesAboard = roles.filter((role) => role.shipId === ship.id);
        if (rolesAboard.length === 0) return null;
        return (
          <section className="gm-role-group" role="group" aria-label={`${ship.name} roles`} key={ship.id}>
            <header className="gm-role-group__header">
              <img src={ship.flag} alt={`${ship.name} flag`} />
              <span>{ship.name}</span>
            </header>
            <div className="gm-role-group__roles">{rolesAboard.map(renderRole)}</div>
          </section>
        );
      })}
      {independentRoles.length > 0 && (
        <section className="gm-role-group gm-role-group--independent" role="group" aria-label="Independent roles">
          <header className="gm-role-group__header"><span>Independent stations</span></header>
          <div className="gm-role-group__roles">{independentRoles.map(renderRole)}</div>
        </section>
      )}
    </div>
  );
}

function groupConnectedPlayers(players: readonly Player[]): readonly PlayerRoleGroup[] {
  const assignedRoleIds = new Set(CONSOLE_ROLES.map((role) => role.id));
  const groups: PlayerRoleGroup[] = CONSOLE_ROLES.map((role) => {
    const shipName = SHIPS.find((ship) => ship.id === role.shipId)?.name ??
      role.shipId.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    return {
      id: role.id,
      label: `${shipName} // ${role.name}`,
      players: players.filter((player) => player.activeConsoleRoleId === role.id),
    };
  });
  groups.push(
    {
      id: 'gm',
      label: 'GM',
      players: players.filter((player) => player.role === 'gm' && !player.activeConsoleRoleId),
    },
    {
      id: 'observer',
      label: 'Observer',
      players: players.filter((player) => player.role === 'observer' && !player.activeConsoleRoleId),
    },
    {
      id: 'unassigned',
      label: 'Unassigned',
      players: players.filter((player) => player.role === 'player' &&
        (!player.activeConsoleRoleId || !assignedRoleIds.has(player.activeConsoleRoleId))),
    },
  );
  return groups
    .filter((group) => group.players.length > 0)
    .map((group) => ({
      ...group,
      players: [...group.players].sort((left, right) =>
        left.displayName.localeCompare(right.displayName)),
    }));
}

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
  const [connectedPlayers, setConnectedPlayers] = useState<readonly Player[]>([]);
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
  const [changingDione, setChangingDione] = useState(false);
  const [pendingDioneEnabled, setPendingDioneEnabled] = useState<boolean | null>(null);
  const [changingLock, setChangingLock] = useState(false);
  const [assigningWolves, setAssigningWolves] = useState(false);
  const [manualWolfRoleIds, setManualWolfRoleIds] = useState<readonly string[]>([]);
  const [assignedWolfRoleIds, setAssignedWolfRoleIds] = useState<readonly string[]>([]);
  const [playerCount, setPlayerCount] = useState(21);
  const [changingActiveRole, setChangingActiveRole] = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const presetTimer = useRef<number | null>(null);
  const capybaraEnabled = session?.capybaraEnabled !== false;
  const capybaraQueued = pendingCommands.some(
    (command) => command.kind === 'setCapybaraEnabled',
  );
  const dioneEnabled = session?.dioneEnabled !== false;
  const dioneQueued = pendingCommands.some(
    (command) => command.kind === 'setDioneEnabled',
  );
  const controlsLocked = session?.gmControlsLocked === true;
  const lockQueued = pendingCommands.some(
    (command) => command.kind === 'setGmControlsLocked',
  );
  const activeRoleIds = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const recommendedIds = recommendedRoleIds(playerCount);
  const isCustom = activeRoleIds.length !== recommendedIds.length ||
    activeRoleIds.some((roleId) => !recommendedIds.includes(roleId));
  const availableShips = SHIPS.filter(
    (ship) =>
      (capybaraEnabled || ship.id !== 'capybara') &&
      (dioneEnabled || ship.id !== 'dione'),
  );
  const viewer = availableShips.find((ship) => ship.id === viewerId) ?? availableShips[0];
  const viewerCoordinate = session?.shipGalacticCoordinates?.[viewer?.id ?? 'aegis'] ??
    ORIGIN_GALACTIC_COORDINATE;
  const contacts = fleetViewFrom(
    viewer?.id ?? 'aegis',
    capybaraEnabled,
    session?.shipGalacticCoordinates,
    dioneEnabled,
  ).map((ship) => ({
    tag: ship.name.toUpperCase(),
    x: ship.x,
    y: ship.y,
    z: ship.z,
    color: ship.color,
  }));
  const latestAlert = events.find((event) => event.type === 'fullscreen-alert');
  const connectedPlayerGroups = groupConnectedPlayers(connectedPlayers);

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
      subscribeConnectedPlayers,
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
      const stopPlayers = subscribeConnectedPlayers(
        sessionId,
        setConnectedPlayers,
        () => useSessionStore.getState().setCommunicationError({
          code: 'gm-player-roster-link',
          message: 'The connected player roster could not be refreshed.',
        }),
      );
      unsubscribe = () => {
        stopInstances();
        stopEvents();
        stopPlayers();
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

  useEffect(() => {
    if (!dioneEnabled && viewerId === 'dione') setViewerId('aegis');
  }, [dioneEnabled, viewerId]);

  useEffect(() => () => {
    if (presetTimer.current !== null) window.clearTimeout(presetTimer.current);
  }, []);

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

  async function changeDione(enabled: boolean): Promise<void> {
    setChangingDione(true);
    try {
      await setDioneEnabled(enabled);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setChangingDione(false);
      setPendingDioneEnabled(null);
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

  async function randomizeWolves(count: 1 | 2): Promise<void> {
    setAssigningWolves(true);
    setAssignedWolfRoleIds([]);
    try {
      setAssignedWolfRoleIds(await assignWolves(count));
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAssigningWolves(false);
    }
  }

  async function assignSelectedWolves(): Promise<void> {
    setAssigningWolves(true);
    setAssignedWolfRoleIds([]);
    try {
      setAssignedWolfRoleIds(await assignWolfRoles(manualWolfRoleIds));
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setAssigningWolves(false);
    }
  }

  async function applyPreset(nextCount: number): Promise<void> {
    setApplyingPreset(true);
    try {
      await applyRolePreset(nextCount);
    } catch {
      // The shared interception notice reports the server rejection.
    } finally {
      setApplyingPreset(false);
    }
  }

  function changePreset(nextCount: number): void {
    setPlayerCount(nextCount);
    if (presetTimer.current !== null) window.clearTimeout(presetTimer.current);
    presetTimer.current = window.setTimeout(() => {
      presetTimer.current = null;
      void applyPreset(nextCount);
    }, 250);
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
                key={`${viewer?.id ?? 'aegis'}-${String(capybaraEnabled)}-${String(dioneEnabled)}`}
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
                DRADIS perspective // {viewer?.name ?? 'AEGIS'} // GALACTIC COORDINATES // {viewerCoordinate}
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

          <section
            className="gm-console__module gm-fleet-resources cic-frame"
            aria-label="Fleet resource controls"
          >
            <h2 className="gm-console__section-title">Fleet resource stores</h2>
            <p className="gm-fleet-resources__status">
              Authoritative stock // changes transmit to every staffed console
            </p>
            <div className="gm-fleet-resources__ships">
              {SHIPS.map((ship) => {
                const resources = resourcesForShip(ship.id, session.shipResources);
                if (!resources) return null;
                return (
                  <section
                    className="gm-fleet-resource-ship"
                    role="group"
                    aria-label={`${ship.name} resource controls`}
                    key={ship.id}
                  >
                    <header className="gm-fleet-resource-ship__header">
                      <img src={ship.flag} alt={`${ship.name} flag`} />
                      <h3>{ship.name}</h3>
                    </header>
                    <ul>
                      {RESOURCE_DEFINITIONS.map((resource) => {
                        const amount = resources[resource.id];
                        return amount === undefined ? null : (
                          <li key={resource.id} aria-label={`${resource.label}: ${amount}`}>
                            <span className="resource-label">
                              <ResourceIcon id={resource.id} label={resource.label} />
                              <span>{resource.label}</span>
                            </span>
                            <div className="ship-counter__controls">
                              <button
                                type="button"
                                aria-label={`Decrease ${resource.label}`}
                                disabled={amount === 0}
                                onClick={() => void adjustShipResource(ship.id, resource.id, -1)}
                              >−</button>
                              <strong>{amount}</strong>
                              <button
                                type="button"
                                aria-label={`Increase ${resource.label}`}
                                onClick={() => void adjustShipResource(ship.id, resource.id, 1)}
                              >+</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </section>

          <section className="gm-console__module cic-frame" aria-label="Setup">
            <button
              className="gm-controls-lock"
              type="button"
              aria-expanded={setupOpen}
              onClick={() => setSetupOpen((open) => !open)}
            >
              Setup
            </button>
            {setupOpen && (
              <div className="gm-setup" aria-label="Setup controls">
                <button
                  className="gm-dradis__availability"
                  type="button"
                  aria-label={`Turn Capybara ${capybaraEnabled ? 'off' : 'on'}`}
                  aria-pressed={capybaraEnabled}
                  disabled={changingCapybara || capybaraQueued}
                  onClick={() => setPendingCapybaraEnabled(!capybaraEnabled)}
                >
                  Capybara // {capybaraQueued ? 'Change queued' : capybaraEnabled ? 'In convoy' : 'Offline'}
                </button>
                <button
                  className="gm-dradis__availability"
                  type="button"
                  aria-label={`Turn Dione ${dioneEnabled ? 'off' : 'on'}`}
                  aria-pressed={dioneEnabled}
                  disabled={changingDione || dioneQueued}
                  onClick={() => setPendingDioneEnabled(!dioneEnabled)}
                >
                  Dione // {dioneQueued ? 'Change queued' : dioneEnabled ? 'In convoy' : 'Offline'}
                </button>
                <fieldset className="gm-role-setup">
                  <legend>Active roles</legend>
                  <label className="gm-role-preset">
                    <span>Recommended player count</span>
                    <input
                      type="range"
                      aria-label="Player count"
                      min={MIN_PLAYER_PRESET}
                      max={MAX_PLAYER_PRESET}
                      value={playerCount}
                      disabled={applyingPreset}
                      onChange={(event) => changePreset(Number(event.target.value))}
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
                  <ShipRoleGroups
                    roles={CONSOLE_ROLES}
                    renderRole={(role) => {
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
                    }}
                  />
                </fieldset>
                <fieldset className="gm-wolf-setup">
                  <legend>Wolf assignment</legend>
                  <div className="gm-wolf-actions" aria-label="Random wolf assignment">
                    <button
                      className="gm-controls-lock"
                      type="button"
                      disabled={assigningWolves || activeRoleIds.length < 1}
                      onClick={() => void randomizeWolves(1)}
                    >
                      {assigningWolves ? 'Assigning wolves…' : 'Randomly assign 1 wolf'}
                    </button>
                    <button
                      className="gm-controls-lock"
                      type="button"
                      disabled={assigningWolves || activeRoleIds.length < 2}
                      onClick={() => void randomizeWolves(2)}
                    >
                      {assigningWolves ? 'Assigning wolves…' : 'Randomly assign 2 wolves'}
                    </button>
                  </div>
                  <fieldset className="gm-wolf-manual">
                    <legend>Manual wolf assignment</legend>
                    <ShipRoleGroups
                      roles={CONSOLE_ROLES.filter((role) => activeRoleIds.includes(role.id))}
                      renderRole={(role) => (
                      <label className="gm-wolf-role" key={role.id}>
                        <span>{role.name}</span>
                        <input
                          type="checkbox"
                          aria-label={`${role.name} manual wolf assignment`}
                          checked={manualWolfRoleIds.includes(role.id)}
                          disabled={assigningWolves || (!manualWolfRoleIds.includes(role.id) && manualWolfRoleIds.length === 2)}
                          onChange={() => setManualWolfRoleIds((selected) =>
                            selected.includes(role.id)
                              ? selected.filter((id) => id !== role.id)
                              : [...selected, role.id])}
                        />
                      </label>
                      )}
                    />
                    <button
                      className="gm-controls-lock"
                      type="button"
                      disabled={assigningWolves || manualWolfRoleIds.length === 0}
                      onClick={() => void assignSelectedWolves()}
                    >
                      {assigningWolves ? 'Assigning wolves…' : 'Assign selected wolves'}
                    </button>
                  </fieldset>
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

          <section
            className="gm-console__module cic-frame"
            aria-label="Connected players by role"
          >
            <h2 className="gm-console__section-title">Connected players</h2>
            <p className="gm-player-roster__count">
              Live manifest // {connectedPlayers.length} connected
            </p>
            {connectedPlayerGroups.length === 0 ? (
              <p className="gm-console__status">No connected players.</p>
            ) : (
              <ul className="gm-player-roster">
                {connectedPlayerGroups.map((group) => (
                  <li className="gm-player-roster__group" key={group.id}>
                    <div className="gm-player-roster__role">
                      <strong>{group.label}</strong>
                      <span>{group.players.length}</span>
                    </div>
                    <ul aria-label={`${group.label} players`}>
                      {group.players.map((player) => (
                        <li key={player.uid}>{player.displayName}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="gm-console__module cic-frame" aria-label="GM instances">
            <h2 className="gm-console__section-title">GM instances</h2>
            <button
              className="gm-controls-lock"
              type="button"
              aria-label={`${controlsLocked ? 'Unlock' : 'Lock'} GM registration`}
              aria-pressed={controlsLocked}
              disabled={changingLock || lockQueued}
              onClick={() => void toggleLock()}
            >
              <span aria-hidden="true">{controlsLocked ? '🔒' : '🔓'}</span>
              GM registration // {lockQueued ? 'Change queued' : controlsLocked ? 'Locked' : 'Unlocked'}
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
                    : `${event.shipName} // Emergency Bridge Confetti Dispenser // ${event.actorRoleName} // ${event.actorName}`}</span>
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
      {pendingDioneEnabled !== null && (
        <div
          className="settings-backdrop"
          onMouseDown={() => setPendingDioneEnabled(null)}
        >
          <section
            className="settings-dialog cic-frame"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dione-convoy-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-dialog__header">
              <h2 id="dione-convoy-confirm-title">Change convoy manifest</h2>
            </div>
            <p>
              {pendingDioneEnabled
                ? 'Add Dione back to the convoy and every DRADIS view?'
                : 'Remove Dione from the convoy and every DRADIS view?'}
            </p>
            <button
              className="cic-text-button"
              type="button"
              autoFocus
              onClick={() => setPendingDioneEnabled(null)}
            >
              Cancel convoy change
            </button>
            <button
              className="settings-dialog__disconnect"
              type="button"
              disabled={changingDione}
              onClick={() => void changeDione(pendingDioneEnabled)}
            >
              Confirm {pendingDioneEnabled ? 'add' : 'remove'} Dione
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
