import MaintenanceSystems from './MaintenanceSystems';
import FleetRoleConsoleTemplate from './FleetRoleConsoleTemplate';
import type { Ship } from '@/data/ships';
import type { ConsoleRole } from '@/data/roles';
import { EXECUTIVE_SYSTEMS, proceduresForRole } from '@/data/roleProcedures';
import { AEGIS_ROLE_CONSOLES } from '@/data/aegisConsoles';
import type { ShipDamageState } from '@/types/game';

function systemEffectLabel(effect: string): string {
  return effect
    .replaceAll('Upgraded:', 'If Upgraded (By Shepherd):')
    .replaceAll('Upgraded +', 'If Upgraded (By Shepherd): +')
    .replaceAll('Damaged:', 'If Damaged:');
}

export default function FleetSystemsWorkspace({ ship, role, fuel, galacticCoordinate, damage }: {
  readonly ship: Ship;
  readonly role: ConsoleRole;
  readonly fuel: number;
  readonly galacticCoordinate: string;
  readonly damage?: ShipDamageState | undefined;
}) {
  const maintenance = ship.maintenance;
  const commandMetrics = maintenance ?? {
    reactor: AEGIS_ROLE_CONSOLES.admiral.reactorCapacity,
    jump: [
      AEGIS_ROLE_CONSOLES.admiral.jumpCosts.short,
      AEGIS_ROLE_CONSOLES.admiral.jumpCosts.medium,
      AEGIS_ROLE_CONSOLES.admiral.jumpCosts.long,
    ],
  };
  const systems = role.id === 'executive-officer' ? EXECUTIVE_SYSTEMS : ship.systems ?? [];
  const renderSystem = (system: (typeof systems)[number]) => {
    const damaged = damage?.damagedSystemIds.includes(system.id) ?? false;
    return <article
      className="aegis-system cic-frame"
      key={system.id}
      aria-label={`${system.name} system // ${damaged ? 'damaged' : 'operational'}`}
      data-damaged={String(damaged)}
    >
      <h3>{system.name}</h3><p>{systemEffectLabel(system.effect)}</p>
      <dl><div className="aegis-system__condition">
        <dt>Condition</dt><dd>{damaged ? 'Damaged' : 'Operational'}</dd>
      </div></dl>
    </article>;
  };
  const procedures = proceduresForRole(role.id);
  return <FleetRoleConsoleTemplate shipName={ship.name} roleName={role.name}
    title="Ship systems"
    galacticCoordinate={galacticCoordinate} fuel={fuel}
    reactorCapacity={commandMetrics.reactor} jumpCosts={commandMetrics.jump} damage={damage}>
    {maintenance
      ? <MaintenanceSystems name={ship.name} systems={systems} renderSystem={renderSystem} rations={<>
      <div className="aegis-ration-table"><table aria-label={`${ship.name} initial ration schedule`}>
        <thead><tr><th>Ration</th><th>None</th><th>Minimal</th><th>Short</th><th>Normal</th></tr></thead>
        <tbody><tr><th>Food</th>{maintenance.food.map((value, index) => <td key={index}>{value}</td>)}</tr>
          <tr><th>Water</th>{maintenance.water.map((value, index) => <td key={index}>{value}</td>)}</tr>
          <tr><th>Bonus</th>{[0, 3, 6, 9].map(value => <td key={value}>+{value}</td>)}</tr></tbody>
      </table></div>
      <p>Initial ration schedule. At a starred population threshold, use the facilitator’s replacement schedule.</p>
      </>} />
      : <div className="aegis-system-grid">{systems.map(renderSystem)}</div>}
    {procedures.length > 0 && <section className="console-workspace__section"
      aria-label={`${ship.name} ${role.name} role procedures`}>
      <h3>Role procedures</h3>
      <div className="aegis-system-grid">{procedures.map(procedure => <article className="aegis-system cic-frame" key={procedure.name}>
        <h3>{procedure.name}</h3><p>{procedure.effect}</p>
      </article>)}</div>
    </section>}
  </FleetRoleConsoleTemplate>;
}
