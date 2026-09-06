import MaintenanceSystems from './MaintenanceSystems';
import { useState } from 'react';
import RoleConsoleTemplate from './RoleConsoleTemplate';
import type { Ship } from '@/data/ships';
import type { ConsoleRole } from '@/data/roles';
import { EXECUTIVE_SYSTEMS, proceduresForRole } from '@/data/roleProcedures';
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
  const [page, setPage] = useState<'systems' | 'procedures'>('systems');
  const maintenance = ship.maintenance;
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
  return <RoleConsoleTemplate label={`${ship.name} ${role.name} console`}
    eyebrow={`${ship.name} // ${role.name}`} title={page === 'systems' ? 'Ship systems' : 'Role procedures'}
    telemetry={<><div><dt>Galactic coordinates</dt><dd>{galacticCoordinate}</dd></div><div><dt>Fuel in stores</dt><dd>{fuel}</dd></div></>}
    pages={[{ id: 'systems', label: 'Ship systems' }, { id: 'procedures', label: 'Role procedures' }]}
    activePage={page} onPageChange={setPage}>
    <p>Charges, upgrades and procedure outcomes are tracked at the table. Damage condition is shared when available.</p>
    {page === 'systems' && (maintenance
      ? <MaintenanceSystems name={ship.name} systems={systems} renderSystem={renderSystem} rations={<>
      <div className="aegis-ration-table"><table aria-label={`${ship.name} initial ration schedule`}>
        <thead><tr><th>Ration</th><th>None</th><th>Minimal</th><th>Short</th><th>Normal</th></tr></thead>
        <tbody><tr><th>Food</th>{maintenance.food.map((value, index) => <td key={index}>{value}</td>)}</tr>
          <tr><th>Water</th>{maintenance.water.map((value, index) => <td key={index}>{value}</td>)}</tr>
          <tr><th>Bonus</th>{[0, 3, 6, 9].map(value => <td key={value}>+{value}</td>)}</tr></tbody>
      </table></div>
      <p>Initial ration schedule. At a starred population threshold, use the facilitator’s replacement schedule.</p>
      </>} />
      : <div className="aegis-system-grid">{systems.map(renderSystem)}</div>)}
    {page === 'procedures' && <div className="aegis-system-grid">{proceduresForRole(role.id).map(procedure => <article className="aegis-system cic-frame" key={procedure.name}>
      <h3>{procedure.name}</h3><p>{procedure.effect}</p>
    </article>)}</div>}
  </RoleConsoleTemplate>;
}
