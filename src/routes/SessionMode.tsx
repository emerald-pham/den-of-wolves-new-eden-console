import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { selectIsGm, useSessionStore, type ConsoleMode } from '@/store/useSessionStore';
import { SHIPS, SHIP_ORIGIN_LABELS, VOYAGE_33_0, type ShipOrigin } from '@/data/ships';
import { activeFleetShipIds, rolesForShip } from '@/data/roles';
import { DEFAULT_ACTIVE_ROLE_IDS, CONSOLE_ROLES } from '@/data/roles';
import ShuttleConsole from '@/routes/ShuttleConsole';
import { isJointEngineeringRoleAvailable } from '@/data/rolePresets';
import type { Seat, Voyage33Admission } from '@/types/game';
import { replacementRoleFor } from '@/data/replacementRoles';

const MODE_LABELS: Record<ConsoleMode, string> = {
  gm: 'GM',
  console: 'Roles',
  press: 'Press',
};

export default function SessionMode({ mode }: { mode: ConsoleMode }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const seats = useSessionStore((state) => state.seats);
  const selectedMode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);

  if (!session || !me) return <Navigate to="/" replace />;
  if (mode === 'gm' && !isGm) return <Navigate to="/roles" replace />;
  const modeIsValid = selectedMode === mode || (mode === 'press' && selectedMode === 'console');
  if (!modeIsValid) return <Navigate to="/roles" replace />;
  if (mode === 'press' && session.pressEnabled === false) {
    return <Navigate to="/console" replace />;
  }

  if (mode === 'console') {
    return (
      <FleetRoster
        sessionName={session.name}
        capybaraEnabled={session.capybaraEnabled !== false}
        dioneEnabled={session.dioneEnabled !== false}
        pressEnabled={session.pressEnabled !== false}
        pressClaimed={session.pressClaimed === true}
        activeRoleIds={session.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS}
        {...(session.activeVesselIds === undefined ? {} : { activeVesselIds: session.activeVesselIds })}
        {...(session.admittedVesselIds === undefined ? {} : { admittedVesselIds: session.admittedVesselIds })}
        {...(session.voyage33Admission === undefined ? {} : { voyage33Admission: session.voyage33Admission })}
        isGm={isGm}
        seats={seats}
        viewerUid={me.uid}
        activeConsoleRoleId={me.activeConsoleRoleId ?? null}
        replacementRoleId={me.replacementRoleId ?? null}
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
  { origin: 'earth', label: SHIP_ORIGIN_LABELS.earth },
  { origin: 'colonies', label: SHIP_ORIGIN_LABELS.colonies },
];

function FleetRoster({
  sessionName,
  capybaraEnabled,
  dioneEnabled,
  pressEnabled,
  pressClaimed,
  activeRoleIds,
  activeVesselIds,
  admittedVesselIds,
  voyage33Admission,
  isGm,
  seats,
  viewerUid,
  activeConsoleRoleId,
  replacementRoleId,
}: {
  sessionName: string;
  capybaraEnabled: boolean;
  dioneEnabled: boolean;
  pressEnabled: boolean;
  pressClaimed: boolean;
  activeRoleIds: readonly string[];
  activeVesselIds?: readonly string[];
  admittedVesselIds?: readonly string[];
  voyage33Admission?: Voyage33Admission;
  isGm: boolean;
  seats: readonly Seat[];
  viewerUid: string;
  activeConsoleRoleId: string | null;
  replacementRoleId: string | null;
}) {
  const [query, setQuery] = useState('');
  const active = new Set(activeRoleIds);
  const activeShips = new Set(activeFleetShipIds(activeRoleIds, activeVesselIds));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const unionRoles = CONSOLE_ROLES.filter(
    (role) => role.shipId === 'joint-engineering-union' &&
      isJointEngineeringRoleAvailable(activeRoleIds, role.id),
  );
  const visibleUnionRoles = unionRoles.filter((role) => matchesConsoleSearch(
    normalizedQuery,
    'Joint Engineering Union',
    role.name,
  ));
  const showPress = !normalizedQuery || matchesConsoleSearch(
    normalizedQuery,
    'SNN Press Shuttle',
    'Press Officer',
  );
  const voyage33Admitted = admittedVesselIds?.includes(VOYAGE_33_0.id) &&
    voyage33Admission?.id === VOYAGE_33_0.id &&
    matchesConsoleSearch(normalizedQuery, VOYAGE_33_0.name, VOYAGE_33_0.nation, VOYAGE_33_0.description);
  const replacementRole = replacementRoleId ? replacementRoleFor(replacementRoleId) : undefined;
  const visibleReplacementRole = !isGm && activeConsoleRoleId === null &&
    replacementRole?.kind === 'role' && matchesConsoleSearch(
    normalizedQuery,
    replacementRole.name,
    replacementRole.vesselName,
    'replacement',
  ) ? replacementRole : undefined;
  return (
    <main className="fleet-roster">
      <header className="fleet-roster__header">
        <Link className="session-mode__back cic-text-button" to="/roles">
          Back to roles
        </Link>
        <p className="eyebrow">{sessionName}</p>
        <h1 className="role-select__title">Select a role</h1>
        <p className="role-select__lede">Choose an independent or shipboard station.</p>
        <label className="fleet-roster__filter">
          Filter consoles
          <input
            type="search"
            value={query}
            placeholder="Search ship or console"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <section className="fleet-group" aria-labelledby="independent-roles">
        <h2 className="fleet-group__title" id="independent-roles">Independent stations</h2>
        <div className="role-select__grid">
          {visibleReplacementRole && <Link
            className="role-card cic-frame"
            to={`/replacement/${visibleReplacementRole.id}`}
            aria-label={visibleReplacementRole.name}
          >
            <span className="role-card__name">{visibleReplacementRole.name}</span>
            <span className="role-card__description">
              {visibleReplacementRole.vesselName} // facilitator reassignment
            </span>
            <span className="role-card__status">ASSIGNED TO YOU</span>
          </Link>}
          {isGm && <Link
            className="role-card cic-frame"
            to="/gm"
            aria-label="GM Console"
          >
            <span className="role-card__name">GM Console</span>
            <span className="role-card__description">Session controls and fleet oversight</span>
          </Link>}
          {pressEnabled && showPress && <Link
            className="role-card cic-frame"
            to="/press"
            aria-label="Press Officer"
          >
            <span className="role-card__name">Press Officer</span>
            <span className="role-card__description">
              SNN // Unaffiliated Independent Press Shuttle
            </span>
            <span className="role-card__status">
              {activeConsoleRoleId === 'press-officer' ? 'HELD BY YOU' : pressClaimed ? 'CLAIMED // READ-ONLY' : 'OPEN'}
            </span>
          </Link>}
          {visibleUnionRoles.map((role) => (
            <Link
              className="role-card cic-frame"
              to={`/union/roles/${role.id}`}
              aria-label={role.name}
              key={role.id}
            >
              <span className="role-card__name">{role.name}</span>
              <span className="role-card__description">Joint Engineering Union</span>
              <span className="role-card__status">{consoleStatus(role.id, seats, viewerUid, activeConsoleRoleId)}</span>
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
              activeShips.has(ship.id) &&
              (capybaraEnabled || ship.id !== 'capybara') &&
              (dioneEnabled || ship.id !== 'dione') &&
              (isGm || rolesForShip(ship.id).some((role) => active.has(role.id))))
              .map((ship) => {
                const roles = rolesForShip(ship.id).filter((role) => isGm || active.has(role.id));
                const visibleRoles = roles.filter((role) => matchesConsoleSearch(
                  normalizedQuery,
                  ship.name,
                  ship.nation,
                  role.name,
                ));
                if (visibleRoles.length === 0) return null;
                return (
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
                    <div className="fleet-card__console-list" aria-label={`${ship.name} console catalog`}>
                      {visibleRoles.map((role) => {
                        const status = consoleStatus(role.id, seats, viewerUid, activeConsoleRoleId);
                        return (
                          <Link
                            className="fleet-card__console-link"
                            to={`/ships/${ship.id}/roles/${role.id}`}
                            aria-label={`${ship.name} // ${role.name} // ${status}`}
                            key={role.id}
                          >
                            <span>{role.name}</span>
                            <span className="fleet-card__console-status">{status}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
          </div>
        </section>
      ))}

      {voyage33Admitted && (
        <section className="fleet-group" aria-labelledby="admitted-vessels">
          <h2 className="fleet-group__title" id="admitted-vessels">Admitted vessels</h2>
          <div className="fleet-group__grid">
            <article className="fleet-card fleet-card--voyage-33-0 cic-frame" aria-label={VOYAGE_33_0.name}>
              <div className="fleet-card__link">
                <img
                  className="fleet-card__flag"
                  src={VOYAGE_33_0.flag}
                  alt={`${VOYAGE_33_0.nation} flag`}
                  data-shared-flag={VOYAGE_33_0.id}
                />
                <span className="fleet-card__content">
                  <span className="fleet-card__nation">{VOYAGE_33_0.nationShort} // {VOYAGE_33_0.vesselType}</span>
                  <span className="fleet-card__name">{VOYAGE_33_0.name}</span>
                  <span className="fleet-card__description">{VOYAGE_33_0.description}</span>
                  <span className="fleet-card__description">
                    {voyage33Admission.population.toLocaleString()} survivors // unrest {voyage33Admission.unrest}
                  </span>
                  <span className="fleet-card__description">
                    Host docking required // maintenance steps {voyage33Admission.commitments.maintenanceSteps[0]}–
                    {voyage33Admission.commitments.maintenanceSteps.at(-1)}
                    // max {voyage33Admission.commitments.maxConsoleCharges} console charge
                  </span>
                  <span className="fleet-card__description">Host assignment pending</span>
                </span>
              </div>
            </article>
          </div>
        </section>
      )}
    </main>
  );
}

function consoleStatus(
  roleId: string,
  seats: readonly Seat[],
  viewerUid: string,
  activeConsoleRoleId: string | null,
): 'OPEN' | 'HELD BY YOU' | 'CLAIMED // READ-ONLY' {
  const seat = seats.find((candidate) => (candidate.roleId ?? candidate.id) === roleId);
  if (!seat) return activeConsoleRoleId === roleId ? 'HELD BY YOU' : 'OPEN';
  if (seat.holderUid === viewerUid) return 'HELD BY YOU';
  if (seat.status === 'open') return 'OPEN';
  return 'CLAIMED // READ-ONLY';
}

function matchesConsoleSearch(query: string, ...terms: string[]): boolean {
  if (!query) return true;
  const haystack = terms.join(' ').toLocaleLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
}
