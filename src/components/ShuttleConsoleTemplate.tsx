import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import PressConfetti from './PressConfetti';
import RoleAssignment from './RoleAssignment';
import { SHIPS } from '@/data/ships';
import type { Shuttlecraft, ShuttleCapability } from '@/data/vessels/templates';
import type { ShuttleDocking } from '@/types/game';

const SHUTTLE_CAPABILITIES: Record<ShuttleCapability, ComponentType<{ shuttle: Shuttlecraft }>> = {
  'newspaper-confetti': PressConfetti,
};

interface Props {
  readonly shuttle: Shuttlecraft;
  readonly captainName: string;
  readonly canLeave: boolean;
  readonly docking?: ShuttleDocking | undefined;
}

/** Every shuttle uses this layout; vessel files supply identity and opt-in equipment. */
export default function ShuttleConsoleTemplate({ shuttle, captainName, canLeave, docking }: Props) {
  const host = SHIPS.find((ship) => ship.id === docking?.shipId);
  return (
    <main
      className={`ship-console shuttle-console ${shuttle.consoleClass ?? ''}`}
      data-console-kind="shuttlecraft"
    >
      {shuttle.mark && <div className="shuttle-console__mark" aria-hidden="true">{shuttle.mark}</div>}
      <section className="ship-console__identity" aria-labelledby="shuttle-name">
        {canLeave && (
          <Link className="ship-console__back cic-text-button" to="/console">Leave shuttle</Link>
        )}
        <p className="ship-console__nation">{shuttle.operator} // {shuttle.operatorShort}</p>
        <h1 className="ship-console__name" id="shuttle-name">{shuttle.consoleName}</h1>
        <p className="ship-console__type">{shuttle.vesselType}</p>
        <p className="ship-console__description">{shuttle.description}</p>
        <RoleAssignment value={`${captainName} // Captain`} />
      </section>

      <aside className="ship-console__instruments" aria-label={`${shuttle.consoleName} instruments`}>
        <section className="ship-shuttlebay shuttle-console__systems cic-frame" aria-label="Shuttle systems">
          <p className="ship-shuttlebay__eyebrow">Navigation // live position</p>
          <h2>Shuttle status</h2>
          <p className="shuttle-console__position">
            Shuttle location // {docking ? `Docked // ${host?.name ?? docking.shipId}` : 'In transit'}
          </p>
        </section>

        {shuttle.capabilities.map((capability) => {
          const Capability = SHUTTLE_CAPABILITIES[capability];
          return <Capability key={capability} shuttle={shuttle} />;
        })}
      </aside>
    </main>
  );
}
