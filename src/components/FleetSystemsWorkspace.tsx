import { useState } from 'react';
import MaintenanceSystems from './MaintenanceSystems';
import JumpFailureReadout from './JumpFailureReadout';
import FleetRoleConsoleTemplate from './FleetRoleConsoleTemplate';
import ShipNavigationWorkspace from './ShipNavigationWorkspace';
import AssignedShuttlecraft from './AssignedShuttlecraft';
import type { Ship } from '@/data/ships';
import type { ConsoleRole } from '@/data/roles';
import { EXECUTIVE_SYSTEMS, proceduresForRole } from '@/data/roleProcedures';
import { AEGIS_ROLE_CONSOLES } from '@/data/aegisConsoles';
import type { DamageDraw, ShipDamageState, ShipNavigationLogs } from '@/types/game';

// Split only explicit rule headings; phrases such as “damaged jumps” stay intact.
function systemEffectRows(effect: string) {
  const parts = effect.split(/(?:^|\s+)(?:If )?(Upgraded|Damaged)(?::\s*|(?= \+)|,\s*)/i);
  const baseline = parts[0]?.trim() ?? '';
  const rules: { label: string; effect: string }[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    rules.push({
      label: parts[index]?.toLowerCase() === 'upgraded' ? 'If Upgraded (By Shepherd)' : 'If Damaged',
      effect: parts[index + 1]?.trim() ?? '',
    });
  }
  return { baseline, rules };
}

export default function FleetSystemsWorkspace({
  ship,
  role,
  fuel,
  galacticCoordinate,
  damage,
  damageDraws,
  navigationLogs,
  consoleLocked = false,
  includeAssignedShuttlecraft = true,
}: {
  readonly ship: Ship;
  readonly role: ConsoleRole;
  readonly fuel: number;
  readonly galacticCoordinate: string;
  readonly damage?: ShipDamageState | undefined;
  readonly damageDraws?: readonly DamageDraw[] | undefined;
  readonly navigationLogs?: ShipNavigationLogs | undefined;
  readonly consoleLocked?: boolean | undefined;
  readonly includeAssignedShuttlecraft?: boolean;
}) {
  const [page, setPage] = useState<'systems' | 'navigation'>('systems');
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
    const { baseline, rules } = systemEffectRows(system.effect);
    const damaged = damage?.damagedSystemIds.includes(system.id) ?? false;
    return <article
      className="aegis-system cic-frame"
      key={system.id}
      aria-label={`${system.name} system // ${damaged ? 'damaged' : 'operational'}`}
      data-damaged={String(damaged)}
    >
      <h3>{system.name}</h3>{baseline && <p>{baseline}</p>}
      {system.id === 'jump-drive' && <JumpFailureReadout />}
      <dl><div className="aegis-system__condition">
        <dt>Condition</dt><dd>{damaged ? 'Damaged' : 'Operational'}</dd>
      </div>{rules.map(rule => <div className={rule.label === 'If Damaged' ? 'aegis-system__damaged-rule' : undefined}
        key={rule.label}><dt>{rule.label}</dt><dd>{rule.effect}</dd></div>)}
      </dl>
    </article>;
  };
  const procedures = proceduresForRole(role.id);
  return <FleetRoleConsoleTemplate shipName={ship.name} roleName={role.name}
    title={page === 'systems' ? 'Ship systems' : 'Navigation'}
    galacticCoordinate={galacticCoordinate} fuel={fuel}
    reactorCapacity={commandMetrics.reactor} jumpCosts={commandMetrics.jump} damage={damage}
    pages={[{ id: 'systems', label: 'Ship systems' }, { id: 'navigation', label: 'Navigation' }]}
    activePage={page} onPageChange={setPage}>
    {page === 'navigation' ? <ShipNavigationWorkspace
      shipId={ship.id}
      shipName={ship.name}
      currentCoordinate={galacticCoordinate}
      entries={navigationLogs?.[ship.id]}
      consoleLocked={consoleLocked}
    /> : <>
      {maintenance
      ? <MaintenanceSystems shipId={ship.id} name={ship.name} systems={systems} renderSystem={renderSystem} damageDraws={damageDraws} rations={<>
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
      {includeAssignedShuttlecraft && <AssignedShuttlecraft roleId={role.id} />}
    </>}
  </FleetRoleConsoleTemplate>;
}
