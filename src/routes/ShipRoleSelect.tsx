import { Link, Navigate, useParams } from 'react-router-dom';
import { findShip } from '@/data/ships';
import { activeFleetShipIds, rolesForShip, findConsoleRole } from '@/data/roles';
import { DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import { useSessionStore } from '@/store/useSessionStore';
import { selectIsGm } from '@/store/useSessionStore';
import { replacementRoleFor } from '@/data/replacementRoles';

export default function ShipRoleSelect() {
  const { shipId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);
  const ship = findShip(shipId);
  const activeRoleIds = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const activeShipIds = activeFleetShipIds(activeRoleIds, session?.activeVesselIds);
  const replacement = me?.replacementRoleId ? replacementRoleFor(me.replacementRoleId) : undefined;
  const replacementAboard = Boolean(replacement && replacement.vesselId === shipId &&
    (replacement.id === 'vip-host' || replacement.id === 'commissar'));
  const aboard = findConsoleRole(me?.activeConsoleRoleId ?? undefined)?.shipId === shipId || replacementAboard;
  const roles = rolesForShip(shipId ?? '').filter((role) => aboard || activeRoleIds.includes(role.id));

  if (!session || !me) return <Navigate to="/" replace />;
  const shipEnabled =
    (ship === undefined || activeShipIds.includes(ship.id)) &&
    (ship?.id !== 'capybara' || session.capybaraEnabled !== false) &&
    (ship?.id !== 'dione' || session.dioneEnabled !== false);
  if (!shipEnabled) return <Navigate to="/console" replace />;
  if (mode !== 'console' || !ship || (roles.length === 0 && !isGm)) {
    return <Navigate to="/console" replace />;
  }

  return (
    <main className="session-mode ship-role-select">
      <section className="session-mode__panel cic-frame">
        <div className="ship-role-select__intro">
          <Link className="session-mode__back cic-text-button" to="/console">
            Back to fleet
          </Link>
          <img
            className="ship-role-select__flag"
            src={ship.flag}
            alt={`${ship.nation} flag`}
            data-shared-flag={ship.id}
            style={{ viewTransitionName: 'shared-ship-flag' }}
          />
          <p className="eyebrow">{session.name} // {ship.name}</p>
          <h1 className="role-select__title">{aboard ? 'View ship consoles' : 'Select command role'}</h1>
        </div>
        <div className="role-select__grid">
          {roles.map((role) => (
            <Link
              className="role-card cic-frame"
              key={role.id}
              to={`/ships/${ship.id}/roles/${role.id}`}
              aria-label={role.name}
            >
              <span className="role-card__name">{role.name}</span>
            </Link>
          ))}
          {replacementAboard && (
            <Link
              className="role-card cic-frame"
              to={`/ships/${ship.id}/roles/${replacement?.id}`}
              aria-label={replacement?.name}
            >
              <span className="role-card__name">{replacement?.name}</span>
              <span className="role-card__description">
                {replacement?.id === 'commissar' ? 'Captain-consented survivor purge' : 'Private Dione VIP hand'}
              </span>
            </Link>
          )}
          {isGm && (
            <Link
              className="role-card cic-frame"
              to={`/ships/${ship.id}/observer`}
              aria-label="View ship consoles"
            >
              <span className="role-card__name">View ship consoles</span>
              <span className="role-card__description">Quiet GM ship view // read only</span>
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
