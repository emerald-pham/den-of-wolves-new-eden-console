import { Link, Navigate } from 'react-router-dom';
import { selectIsGm, useSessionStore, type ConsoleMode } from '@/store/useSessionStore';
import { SHIPS, type ShipOrigin } from '@/data/ships';

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
  if (selectedMode !== mode) return <Navigate to="/roles" replace />;

  if (mode === 'console') {
    return (
      <FleetRoster
        sessionName={session.name}
        capybaraEnabled={session.capybaraEnabled !== false}
      />
    );
  }

  if (mode === 'press') {
    return (
      <main className="session-mode">
        <div className="session-mode__panel cic-frame">
          <Link className="session-mode__back cic-text-button" to="/roles">
            Back to roles
          </Link>
          <p className="eyebrow">{session.name} // Independent Press</p>
          <h1 className="role-select__title">SNN — System News Network</h1>
          <p className="role-select__lede">Unaffiliated Independent Press Shuttle</p>
        </div>
      </main>
    );
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
  { origin: 'earth', label: 'Old Nations of Earth and Interstellar Council' },
  { origin: 'colonies', label: 'New Nations of the Colonies' },
];

function FleetRoster({
  sessionName,
  capybaraEnabled,
}: {
  sessionName: string;
  capybaraEnabled: boolean;
}) {
  return (
    <main className="fleet-roster">
      <header className="fleet-roster__header">
        <Link className="session-mode__back cic-text-button" to="/roles">
          Back to roles
        </Link>
        <p className="eyebrow">{sessionName}</p>
        <h1 className="role-select__title">Join a ship</h1>
        <p className="role-select__lede">Select the vessel this screen belongs to.</p>
      </header>

      {FLEET_GROUPS.map(({ origin, label }) => (
        <section className="fleet-group" aria-labelledby={`fleet-${origin}`} key={origin}>
          <h2 className="fleet-group__title" id={`fleet-${origin}`}>{label}</h2>
          <div className="fleet-group__grid">
            {SHIPS.filter((ship) =>
              ship.origin === origin && (capybaraEnabled || ship.id !== 'capybara')).map((ship) => (
              <article
                className={`fleet-card fleet-card--${ship.id} cic-frame`}
                aria-label={ship.name}
                key={ship.id}
              >
                <Link
                  className="fleet-card__link"
                  to={ship.id === 'aegis' ? '/ships/aegis/roles' : `/ships/${ship.id}`}
                  aria-label={`Join ${ship.name} ship`}
                >
                  <img className="fleet-card__flag" src={ship.flag} alt={`${ship.nation} flag`} />
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
