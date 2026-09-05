import { Link, Navigate, useParams } from 'react-router-dom';
import { findShip } from '@/data/ships';
import { useSessionStore } from '@/store/useSessionStore';

export default function ShipConsole() {
  const { shipId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const ship = findShip(shipId);

  if (!session || !me) return <Navigate to="/" replace />;
  if (
    mode !== 'console' || !ship ||
    (ship.id === 'capybara' && session.capybaraEnabled === false)
  ) return <Navigate to="/console" replace />;

  return (
    <main className={`ship-console ship-console--${ship.id}`}>
      <img className="ship-console__flag" src={ship.flag} alt={`${ship.nation} flag`} />
      <section className="ship-console__identity" aria-labelledby="ship-name">
        <Link className="ship-console__back cic-text-button" to="/console">Leave ship</Link>
        <p className="ship-console__nation">{ship.nation} // {ship.nationShort}</p>
        <h1 className="ship-console__name" id="ship-name">{ship.name}</h1>
        <p className="ship-console__type">{ship.vesselType}</p>
        <p className="ship-console__description">{ship.description}</p>
      </section>
    </main>
  );
}
