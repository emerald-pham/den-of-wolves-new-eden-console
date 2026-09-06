import AegisConsoleWorkspace from '@/components/AegisConsoleWorkspace';
import type { ConsoleRole } from '@/data/roles';
import type { Ship } from '@/data/ships';
import { isScaffoldedConsoleRole } from '@/data/shipConsoleWorkspaces';

interface Props {
  readonly ship: Ship;
  readonly role: ConsoleRole | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
}

export default function FleetConsoleWorkspace({ ship, role, galacticCoordinate, fuel }: Props) {
  if (ship.id === 'aegis') {
    return (
      <AegisConsoleWorkspace
        roleId={role?.id}
        galacticCoordinate={galacticCoordinate}
        fuel={fuel}
      />
    );
  }

  if (!role || !isScaffoldedConsoleRole(ship.id, role.id)) return null;

  return (
    <section
      className="console-workspace console-scaffold cic-frame"
      aria-label={`${ship.name} ${role.name} console scaffold`}
    >
      <header className="console-workspace__header">
        <div>
          <p className="console-workspace__eyebrow">Fleet console scaffold // {ship.name}</p>
          <h2>{role.name} console</h2>
        </div>
        <dl className="console-workspace__telemetry">
          <div><dt>Galactic coordinates</dt><dd>{galacticCoordinate}</dd></div>
          <div><dt>Build state</dt><dd>Scaffold ready</dd></div>
        </dl>
      </header>
      <div className="console-scaffold__grid">
        <article className="console-scaffold__module cic-frame">
          <p>Implementation boundary</p>
          <h3>Reference package staged</h3>
          <p>No gameplay controls active. Add only this role’s approved systems and procedures here.</p>
        </article>
        <article className="console-scaffold__module cic-frame">
          <p>Shared integrations</p>
          <h3>Ship telemetry connected</h3>
          <p>Position, stores, census, shuttlebay, navigation, and session authority remain shared.</p>
        </article>
      </div>
    </section>
  );
}
