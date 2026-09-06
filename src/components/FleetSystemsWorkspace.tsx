import { useState } from 'react';
import RoleConsoleTemplate from './RoleConsoleTemplate';
import type { Ship } from '@/data/ships';
import type { ConsoleRole } from '@/data/roles';
import { EXECUTIVE_SYSTEMS, proceduresForRole } from '@/data/roleProcedures';
import type { ShipDamageState } from '@/types/game';

export default function FleetSystemsWorkspace({ ship, role, fuel, galacticCoordinate, damage }: {
  readonly ship: Ship;
  readonly role: ConsoleRole;
  readonly fuel: number;
  readonly galacticCoordinate: string;
  readonly damage?: ShipDamageState | undefined;
}) {
  const [page, setPage] = useState<'systems' | 'procedures' | 'maintenance'>('systems');
  const maintenance = ship.maintenance;
  const systems = role.id === 'executive-officer' ? EXECUTIVE_SYSTEMS : ship.systems ?? [];
  const damagedCards = new Set(ship.damageDeck
    .filter(({ systemId }) => damage?.damagedSystemIds.includes(systemId))
    .map(({ card }) => card));
  return <RoleConsoleTemplate label={`${ship.name} ${role.name} console`}
    eyebrow={`${ship.name} // ${role.name}`} title={page === 'systems' ? 'Ship systems' : page === 'procedures' ? 'Role procedures' : 'Maintenance cycle'}
    telemetry={<><div><dt>Galactic coordinates</dt><dd>{galacticCoordinate}</dd></div><div><dt>Fuel in stores</dt><dd>{fuel}</dd></div></>}
    pages={[{ id: 'systems', label: 'Ship systems' }, { id: 'procedures', label: 'Role procedures' }, ...(maintenance ? [{ id: 'maintenance' as const, label: 'Maintenance cycle' }] : [])]}
    activePage={page} onPageChange={setPage}>
    <p>Charges, upgrades and procedure outcomes are tracked at the table. Damage condition is shared when available.</p>
    {page === 'systems' && <div className="aegis-system-grid">{systems.map(system => {
      const damaged = damagedCards.has(system.card);
      return <article
        className="aegis-system cic-frame"
        key={system.card}
        aria-label={`${system.name} system // ${damaged ? 'damaged' : 'operational'}`}
        data-damaged={String(damaged)}
      >
        <header><span>{system.card}</span></header><h3>{system.name}</h3><p>{system.effect}</p>
        <dl><div className="aegis-system__condition">
          <dt>Condition</dt><dd>{damaged ? 'Damaged' : 'Operational'}</dd>
        </div></dl>
      </article>;
    })}</div>}
    {page === 'procedures' && <div className="aegis-system-grid">{proceduresForRole(role.id).map(procedure => <article className="aegis-system cic-frame" key={procedure.name}>
      <h3>{procedure.name}</h3><p>{procedure.effect}</p>
    </article>)}</div>}
    {page === 'maintenance' && maintenance && <div className="aegis-maintenance">
      <p>Reactor capacity // {maintenance.reactor} consoles. Jump fuel // {maintenance.jump.join(' / ')} (short / medium / long).</p>
      <ol aria-label={`${ship.name} maintenance sequence`}>{['Storage', 'Rations', 'Unrest check', 'Riot check', 'Reactor', 'Shuttle Bay'].map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol>
      <div className="aegis-ration-table"><table aria-label={`${ship.name} initial ration schedule`}>
        <thead><tr><th>Ration</th><th>None</th><th>Minimal</th><th>Short</th><th>Normal</th></tr></thead>
        <tbody><tr><th>Food</th>{maintenance.food.map((value, index) => <td key={index}>{value}</td>)}</tr>
          <tr><th>Water</th>{maintenance.water.map((value, index) => <td key={index}>{value}</td>)}</tr>
          <tr><th>Bonus</th>{[0, 3, 6, 9].map(value => <td key={value}>+{value}</td>)}</tr></tbody>
      </table></div>
      <p>Initial ration schedule. At a starred population threshold, use the facilitator’s replacement schedule.</p>
      <p>Unrest check: roll 2d6 plus both ration bonuses. Under 12 adds 2 unrest; otherwise under 20 adds 1. Riot check: roll 1d6; below current unrest deals 1 damage.</p>
    </div>}
  </RoleConsoleTemplate>;
}
