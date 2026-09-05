import { Link, Navigate } from 'react-router-dom';
import { selectIsGm, useSessionStore, type ConsoleMode } from '@/store/useSessionStore';
import { SHIPS, type ShipOrigin } from '@/data/ships';
import { findConsoleRole, rolesForShip } from '@/data/roles';
import { DEFAULT_ACTIVE_ROLE_IDS, CONSOLE_ROLES } from '@/data/roles';
import ShuttleConsole from '@/routes/ShuttleConsole';
import { consoleRoleRoute } from '@/lib/consoleRole';

const MODE_LABELS: Record<ConsoleMode, string> = {
  gm: 'GM',
  console: 'Roles',
  press: 'Press',
};

export default function SessionMode({ mode }: { mode: ConsoleMode }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const selectedMode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);

  if (!session || !me) return <Navigate to="/" replace />;
  if (mode === 'gm' && !isGm) return <Navigate to="/roles" replace />;
  const activeRoleShipId = findConsoleRole(me.activeConsoleRoleId ?? undefined)?.shipId;
  const activeRoleShipEnabled =
    (activeRoleShipId !== 'capybara' || session.capybaraEnabled !== false) &&
    (activeRoleShipId !== 'dione' || session.dioneEnabled !== false);
  if (mode === 'console' && !isGm && me.activeConsoleRoleId && activeRoleShipEnabled) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }
  const modeIsValid = selectedMode === mode || (mode === 'press' && selectedMode === 'console');
  if (!modeIsValid) return <Navigate to="/roles" replace />;

  if (mode === 'console') {
    return (
      <FleetRoster
        sessionName={session.name}
        capybaraEnabled={session.capybaraEnabled !== false}
        dioneEnabled={session.dioneEnabled !== false}
        activeRoleIds={session.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS}
        isGm={isGm}
      />
    );
  }

  if (mode === 'press') {
    return <ShuttleConsole shuttleId="snn-press-shuttle" />;
  }

  return (
    <main className="session-mode">
      <div className="session-mode__panel cic-frame">
        <Link className="session-mode__back cic-text-button" to="/roles">
          Back to roles
        </Link>
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">{MODE_LABELS[mode]} connected</h1>
        <p className="role-select__lede">
          Session {session.joinCode} is ready on this device.
        </p>
      </div>
    </main>
  );
}

const FLEET_GROUPS: readonly { origin: ShipOrigin; label: string }[] = [
  { origin: 'earth', label: 'Old Nations of Earth' },
  { origin: 'colonies', label: 'New Nations of the Colonies' },
];

function FleetRoster({
  sessionName,
  capybaraEnabled,
  dioneEnabled,
  activeRoleIds,
  isGm,
}: {
  sessionName: string;
  capybaraEnabled: boolean;
  dioneEnabled: boolean;
  activeRoleIds: readonly string[];
  isGm: boolean;
}) {
  const active = new Set(activeRoleIds);
  const unionRoles = CONSOLE_ROLES.filter(
    (role) => role.shipId === 'joint-engineering-union' && active.has(role.id),
  );
  return (
    <main className="fleet-roster">
      <header className="fleet-roster__header">
        <Link className="session-mode__back cic-text-button" to="/roles">
          Back to roles
        </Link>
        <p className="eyebrow">{sessionName}</p>
        <h1 className="role-select__title">Select a role</h1>
        <p className="role-select__lede">Choose an independent or shipboard station.</p>
      </header>

      <section className="fleet-group" aria-labelledby="independent-roles">
        <h2 className="fleet-group__title" id="independent-roles">Independent stations</h2>
        <div className="role-select__grid">
          {active.has('press-officer') && <Link
            className="role-card cic-frame"
            to="/press"
            aria-label="Press Officer"
          >
            <span className="role-card__name">Press Officer</span>
            <span className="role-card__description">
              SNN // Unaffiliated Independent Press Shuttle
            </span>
          </Link>}
          {unionRoles.map((role) => (
            <Link
              className="role-card cic-frame"
              to={`/union/roles/${role.id}`}
              aria-label={role.name}
              key={role.id}
            >
              <span className="role-card__name">{role.name}</span>
              <span className="role-card__description">Joint Engineering Union</span>
            </Link>
          ))}
        </div>
      </section>

      {FLEET_GROUPS.map(({ origin, label }) => (
        <section className="fleet-group" aria-labelledby={`fleet-${origin}`} key={origin}>
          <h2 className="fleet-group__title" id={`fleet-${origin}`}>{label}</h2>
          <div className="fleet-group__grid">
            {SHIPS.filter((ship) =>
              ship.origin === origin &&
              (capybaraEnabled || ship.id !== 'capybara') &&
              (dioneEnabled || ship.id !== 'dione') &&
              (isGm || rolesForShip(ship.id).some((role) => active.has(role.id)))).map((ship) => (
              <article
                className={`fleet-card fleet-card--${ship.id} cic-frame`}
                aria-label={ship.name}
                key={ship.id}
              >
                <Link
                  className="fleet-card__link"
                  to={rolesForShip(ship.id).length > 0 ? `/ships/${ship.id}/roles` : `/ships/${ship.id}`}
                  aria-label={`Join ${ship.name} ship`}
                >
                  <img
                    className="fleet-card__flag"
                    src={ship.flag}
                    alt={`${ship.nation} flag`}
                    data-shared-flag={ship.id}
                  />
                  <span className="fleet-card__content">
                    <span className="fleet-card__nation">{ship.nationShort} // {ship.vesselType}</span>
                    <span className="fleet-card__name">{ship.name}</span>
                    <span className="fleet-card__description">{ship.description}</span>
                    <span className="fleet-card__action">Join ship</span>
                  </span>
                </Link>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
