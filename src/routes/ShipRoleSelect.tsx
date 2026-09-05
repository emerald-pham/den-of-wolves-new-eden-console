import { Link, Navigate, useParams } from 'react-router-dom';
import { findShip } from '@/data/ships';
import { rolesForShip } from '@/data/roles';
import { useSessionStore } from '@/store/useSessionStore';

export default function ShipRoleSelect() {
  const { shipId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const ship = findShip(shipId);
  const roles = rolesForShip(shipId ?? '');

  if (!session || !me) return <Navigate to="/" replace />;
  if (mode !== 'console' || !ship || roles.length === 0) {
    return <Navigate to="/console" replace />;
  }

  return (
    <main className="session-mode ship-role-select">
      <section className="session-mode__panel cic-frame">
        <Link className="session-mode__back cic-text-button" to="/console">
          Back to fleet
        </Link>
        <p className="eyebrow">{session.name} // {ship.name}</p>
        <h1 className="role-select__title">Select command role</h1>
        <p className="role-select__lede">These stations share the same {ship.name} command console.</p>
        <div className="role-select__grid">
          {roles.map((role) => (
            <Link
              className="role-card cic-frame"
              key={role.id}
              to={`/ships/${ship.id}/roles/${role.id}`}
              aria-label={role.name}
            >
              <span className="role-card__name">{role.name}</span>
              <span className="role-card__description">Shared {ship.name} command view</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
