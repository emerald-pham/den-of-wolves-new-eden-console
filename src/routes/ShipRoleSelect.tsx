import { Link, Navigate, useParams } from 'react-router-dom';
import { findShip } from '@/data/ships';
import { rolesForShip } from '@/data/roles';
import { DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import { useSessionStore } from '@/store/useSessionStore';
import { selectIsGm } from '@/store/useSessionStore';
import { consoleRoleRoute } from '@/lib/consoleRole';

export default function ShipRoleSelect() {
  const { shipId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const isGm = useSessionStore(selectIsGm);
  const ship = findShip(shipId);
  const activeRoleIds = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const roles = rolesForShip(shipId ?? '').filter((role) => activeRoleIds.includes(role.id));

  if (!session || !me) return <Navigate to="/" replace />;
  const shipEnabled =
    (ship?.id !== 'capybara' || session.capybaraEnabled !== false) &&
    (ship?.id !== 'dione' || session.dioneEnabled !== false);
  if (!shipEnabled) return <Navigate to="/console" replace />;
  if (!isGm && me.activeConsoleRoleId) {
    return <Navigate to={consoleRoleRoute(me.activeConsoleRoleId)} replace />;
  }
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
          <h1 className="role-select__title">Select command role</h1>
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
          {isGm && (
            <Link
              className="role-card cic-frame"
              to={`/ships/${ship.id}/observer`}
              aria-label="Observer"
            >
              <span className="role-card__name">Observer</span>
              <span className="role-card__description">GM ship access</span>
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
