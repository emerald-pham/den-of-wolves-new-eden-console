import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { findShip } from '@/data/ships';
import { findConsoleRole } from '@/data/roles';
import { popShipConfetti } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';

type ConfettiStyle = CSSProperties & Record<`--${string}`, string | number>;
const CONFETTI_PIECES = Array.from({ length: 48 }, (_, index) => ({
  index,
  style: {
    '--confetti-x': `${((index * 47) % 101) - 50}vw`,
    '--confetti-y': `${-35 - ((index * 29) % 55)}vh`,
    '--confetti-turn': `${180 + ((index * 83) % 720)}deg`,
    '--confetti-delay': `${(index % 8) * 24}ms`,
    '--confetti-hue': (index * 67) % 360,
  } as ConfettiStyle,
}));

export default function ShipConsole() {
  const { shipId, roleId } = useParams();
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const pendingCommands = useSessionStore((state) => state.pendingCommands);
  const ship = findShip(shipId);
  const consoleRole = findConsoleRole(roleId);
  const validRole = !roleId || consoleRole?.shipId === ship?.id;
  const [coverOpen, setCoverOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [burst, setBurst] = useState(0);
  const spent = Boolean(ship && session?.confettiUsedShipIds?.includes(ship.id));
  const queued = Boolean(ship && session && pendingCommands.some(
    (command) => command.kind === 'popShipConfetti' &&
      command.payload.sessionId === session.id && command.payload.shipId === ship.id,
  ));

  useEffect(() => {
    if (!session?.id || !ship) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeShipConfetti }) => {
      if (!active) return;
      unsubscribe = subscribeShipConfetti(
        session.id,
        ship.id,
        () => setBurst((current) => current + 1),
        () => useSessionStore.getState().setCommunicationError({
          code: 'confetti-signal-link',
          message: 'The Emergency Bridge Confetti Dispenser signal link was lost.',
        }),
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [session?.id, ship]);

  useEffect(() => {
    if (burst === 0) return;
    const timer = window.setTimeout(() => setBurst(0), 3_500);
    return () => window.clearTimeout(timer);
  }, [burst]);

  if (!session || !me) return <Navigate to="/" replace />;
  if (
    mode !== 'console' || !ship || !validRole ||
    (ship.id === 'capybara' && session.capybaraEnabled === false)
  ) return <Navigate to="/console" replace />;

  async function activate(): Promise<void> {
    if (!ship || spent || queued || activating) return;
    setActivating(true);
    try {
      await popShipConfetti(ship.id);
      setCoverOpen(false);
    } catch {
      // The shared interception notice reports races and connectivity failures.
    } finally {
      setActivating(false);
    }
  }

  return (
    <main className={`ship-console ship-console--${ship.id}`}>
      <img className="ship-console__flag" src={ship.flag} alt={`${ship.nation} flag`} />
      <section className="ship-console__identity" aria-labelledby="ship-name">
        <Link
          className="ship-console__back cic-text-button"
          to={roleId ? `/ships/${ship.id}/roles` : '/console'}
        >
          {roleId ? 'Change role' : 'Leave ship'}
        </Link>
        <p className="ship-console__nation">{ship.nation} // {ship.nationShort}</p>
        <h1 className="ship-console__name" id="ship-name">{ship.name}</h1>
        <p className="ship-console__type">{ship.vesselType}</p>
        {consoleRole && <p className="ship-console__role">{consoleRole.name}</p>}
        <p className="ship-console__description">{ship.description}</p>
      </section>
      <section className="confetti-dispenser" aria-label="Emergency Bridge Confetti Dispenser">
        <p className="confetti-dispenser__label">Emergency Bridge Confetti Dispenser</p>
        <div className="confetti-dispenser__housing" data-open={String(coverOpen)}>
          <button
            className="confetti-dispenser__trigger"
            type="button"
            aria-label={spent
              ? 'Emergency Bridge Confetti Dispenser spent'
              : queued
                ? 'Emergency Bridge Confetti Dispenser activation queued'
                : 'Activate Emergency Bridge Confetti Dispenser'}
            disabled={!coverOpen || spent || queued || activating}
            onClick={() => void activate()}
          >
            {spent ? 'SPENT' : queued ? 'QUEUED' : activating ? 'FIRING' : 'POP'}
          </button>
          <button
            className="confetti-dispenser__cover"
            type="button"
            aria-label={`${coverOpen ? 'Close' : 'Open'} confetti activation cover`}
            aria-pressed={coverOpen}
            disabled={spent || queued}
            onClick={() => setCoverOpen((current) => !current)}
          >
            {coverOpen ? 'COVER OPEN' : 'COMMAND LOCK'}
          </button>
        </div>
        <p className="confetti-dispenser__status">
          ONE USE // {spent ? 'DISCHARGED' : queued ? 'QUEUED' : activating ? 'FIRING' : 'ARMED'}
        </p>
        {!spent && !queued && (
          <p className="confetti-dispenser__notice" role="status">
            COMMAND CODES // CAPTAIN AUTHORITY REQUIRED // TWO OFFICERS MAY OVERRIDE
          </p>
        )}
      </section>
      {burst > 0 && (
        <div className="confetti-burst" key={burst} aria-hidden="true">
          {CONFETTI_PIECES.map((piece) => (
            <i className="confetti-burst__piece" key={piece.index} style={piece.style} />
          ))}
        </div>
      )}
    </main>
  );
}
