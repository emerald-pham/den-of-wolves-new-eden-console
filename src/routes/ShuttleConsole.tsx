import { Link, Navigate } from 'react-router-dom';
import PressConfetti from '@/components/PressConfetti';
import { SHIPS } from '@/data/ships';
import { DEFAULT_ACTIVE_ROLE_IDS, findConsoleRole } from '@/data/roles';
import { SHUTTLECRAFT } from '@/data/shuttles';
import { useSessionStore } from '@/store/useSessionStore';

export default function ShuttleConsole({ shuttleId }: { shuttleId: string }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const mode = useSessionStore((state) => state.mode);
  const shuttle = SHUTTLECRAFT.find((item) => item.id === shuttleId);
  const activeRoles = session?.activeRoleIds ?? DEFAULT_ACTIVE_ROLE_IDS;
  const captainRole = findConsoleRole(shuttle?.captainRoleId);
  const docking = session?.shuttleDockings?.find((item) => item.shuttleId === shuttleId) ??
    (shuttleId === 'snn-press-shuttle'
      ? { shuttleId, shipId: 'aegis', dockedAt: 'SESSION START' }
      : undefined);
  const host = SHIPS.find((ship) => ship.id === docking?.shipId);

  if (!session || !me) return <Navigate to="/" replace />;
  if (!shuttle || (mode !== 'console' && mode !== 'press') || !activeRoles.includes(shuttle.captainRoleId)) {
    return <Navigate to="/console" replace />;
  }

  return (
    <main
      className="ship-console shuttle-console shuttle-console--snn"
      data-console-kind="shuttlecraft"
    >
      <div className="shuttle-console__mark" aria-hidden="true">SNN</div>
      <section className="ship-console__identity" aria-labelledby="shuttle-name">
        <Link className="ship-console__back cic-text-button" to="/console">Leave shuttle</Link>
        <p className="ship-console__nation">{shuttle.operator} // {shuttle.operatorShort}</p>
        <h1 className="ship-console__name" id="shuttle-name">{shuttle.consoleName}</h1>
        <p className="ship-console__type">{shuttle.vesselType}</p>
        <p className="ship-console__role">{captainRole?.name ?? 'Captain'} // Captain</p>
        <p className="ship-console__description">{shuttle.description}</p>
      </section>

      <aside className="ship-console__instruments" aria-label={`${shuttle.consoleName} instruments`}>
        <section className="ship-shuttlebay shuttle-console__systems cic-frame" aria-label="Shuttle systems">
          <p className="ship-shuttlebay__eyebrow">Navigation // live position</p>
          <h2>Shuttle status</h2>
          <p className="shuttle-console__position">
            Shuttle location // {docking ? `Docked // ${host?.name ?? docking.shipId}` : 'In transit'}
          </p>
        </section>

        {shuttle.id === 'snn-press-shuttle' && <PressConfetti />}
      </aside>
    </main>
  );
}
