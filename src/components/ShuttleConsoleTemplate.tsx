import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import PressConfetti from './PressConfetti';
import PressDispatch from './PressDispatch';
import RoleAssignment from './RoleAssignment';
import RoleConsoleTemplate from './RoleConsoleTemplate';
import { SHIPS } from '@/data/ships';
import type { Shuttlecraft, ShuttleCapability } from '@/data/vessels/templates';
import type { ShuttleDocking } from '@/types/game';

const SHUTTLE_CAPABILITIES: Record<ShuttleCapability, { component: ComponentType<{ shuttle: Shuttlecraft }>; placement: 'workspace' | 'instruments' }> = {
  'newspaper-confetti': { component: PressConfetti, placement: 'instruments' },
  'press-dispatches': { component: PressDispatch, placement: 'workspace' },
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
  const workspaceCapabilities = shuttle.capabilities.filter(capability => SHUTTLE_CAPABILITIES[capability].placement === 'workspace');
  const instrumentCapabilities = shuttle.capabilities.filter(capability => SHUTTLE_CAPABILITIES[capability].placement === 'instruments');
  const renderCapability = (capability: ShuttleCapability) => {
    const Capability = SHUTTLE_CAPABILITIES[capability].component;
    return <Capability key={capability} shuttle={shuttle} />;
  };
  return (
    <main
      className={`ship-console ship-console--gameplay shuttle-console ${shuttle.consoleClass ?? ''}`}
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
        {workspaceCapabilities.length > 0 && (
          <RoleConsoleTemplate label={`${captainName} console`}
            eyebrow={`${shuttle.shortName} // ${captainName}`}
            title={`${captainName} console`}
            telemetry={<div><dt>Shuttle location</dt><dd>{docking ? `Docked // ${host?.name ?? docking.shipId}` : 'In transit'}</dd></div>}>
            {workspaceCapabilities.map(renderCapability)}
          </RoleConsoleTemplate>
        )}
      </section>

      <aside className="ship-console__instruments" aria-label={`${shuttle.consoleName} instruments`}>
        <section className="ship-shuttlebay shuttle-console__systems cic-frame" aria-label="Shuttle systems">
          <p className="ship-shuttlebay__eyebrow">Navigation // live position</p>
          <h2>Shuttle status</h2>
          <p className="shuttle-console__position">
            Shuttle location // {docking ? `Docked // ${host?.name ?? docking.shipId}` : 'In transit'}
          </p>
        </section>

        {instrumentCapabilities.map(renderCapability)}
      </aside>
    </main>
  );
}
