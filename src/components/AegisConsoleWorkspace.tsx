import RoleConsoleTemplate from './RoleConsoleTemplate';
import { useState } from 'react';
import {
  AEGIS_ROLE_CONSOLES,
  isImplementedAegisRole,
  type AegisShipSystem,
} from '@/data/aegisConsoles';
import type { ShipDamageState } from '@/types/game';

interface Props {
  readonly roleId: string | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly damage?: ShipDamageState | undefined;
}

function SystemCard({ system, damaged }: {
  readonly system: AegisShipSystem;
  readonly damaged: boolean;
}) {
  return (
    <article
      className="aegis-system cic-frame"
      aria-label={`${system.name} system // ${damaged ? 'damaged' : 'operational'}`}
      data-damaged={String(damaged)}
    >
      <header>
        <span>{system.card}</span>
        <p>{system.station}</p>
      </header>
      <h3>{system.name}</h3>
      <p>{system.baseline}</p>
      <dl>
        <div className="aegis-system__condition">
          <dt>Condition</dt><dd>{damaged ? 'Damaged' : 'Operational'}</dd>
        </div>
        {system.upgraded && <div><dt>Upgraded</dt><dd>{system.upgraded}</dd></div>}
        <div><dt>Damaged</dt><dd>{system.damaged}</dd></div>
      </dl>
    </article>
  );
}

function AdmiralConsole({ galacticCoordinate, fuel, damage }: Omit<Props, 'roleId'>) {
  const console = AEGIS_ROLE_CONSOLES.admiral;

  return (
    <RoleConsoleTemplate label="AEGIS Admiral console" eyebrow="AEGIS command console // Admiral"
      title="Ship systems" telemetry={<>
          <div><dt>Galactic coordinates</dt><dd>{galacticCoordinate}</dd></div>
          <div><dt>Fuel in stores</dt><dd>{fuel}</dd></div>
          <div><dt>Reactor capacity</dt><dd>{console.reactorCapacity} consoles</dd></div>
          <div>
            <dt>Damage state</dt>
            <dd>{damage?.destroyed
              ? 'Destroyed'
              : `${damage?.damagedSystemIds.length ?? 0} systems`}</dd>
          </div>
      </>}
      >
      <div className="systems-maintenance-layout">
        <div className="aegis-system-grid">
          <p className="aegis-jump-costs">
            Jump requirement // Short {console.jumpCosts.short} // Medium {console.jumpCosts.medium} // Long {console.jumpCosts.long}
          </p>
          {console.systems.map((system) => (
            <SystemCard
              key={system.id}
              system={system}
              damaged={damage?.damagedSystemIds.includes(system.id) ?? false}
            />
          ))}
        </div>
        <div className="aegis-maintenance">
          <h3>Maintenance cycle</h3>
          <ol aria-label="AEGIS maintenance sequence">
            {console.maintenanceSteps.map((step, index) => (
              <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>
            ))}
          </ol>
          <div className="aegis-ration-table">
            <table aria-label="AEGIS ration schedule">
              <thead>
                <tr><th>Ration</th><th>None</th><th>Minimal</th><th>Short</th><th>Normal</th></tr>
              </thead>
              <tbody>
                <tr><th>Food</th>{console.rations.food.map((value) => <td key={value}>{value}</td>)}</tr>
                <tr><th>Water</th>{console.rations.water.map((value) => <td key={value}>{value}</td>)}</tr>
                <tr><th>Bonus</th>{console.rations.bonuses.map((value) => <td key={value}>+{value}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <div className="aegis-maintenance__checks">
            <p><strong>Unrest check</strong> // Roll 2d6 plus both ration bonuses. Under 12 adds 2 unrest; under 20 adds 1.</p>
            <p><strong>Riot check</strong> // Roll 1d6. A result below current unrest deals 1 damage.</p>
          </div>
        </div>
      </div>
    </RoleConsoleTemplate>
  );
}

function WingCommanderConsole({ galacticCoordinate }: Omit<Props, 'roleId' | 'fuel'>) {
  const [page, setPage] = useState<'flight' | 'combat'>('flight');
  const console = AEGIS_ROLE_CONSOLES['wing-commander'];
  const starlight = console.craft[0];
  if (!starlight) return null;

  return (
    <RoleConsoleTemplate label="AEGIS Wing Commander console" eyebrow="AEGIS flight operations // Wing Commander"
      title={page === 'flight' ? 'Flight group' : 'Combat doctrine'} telemetry={<>
          <div><dt>AEGIS coordinates</dt><dd>{galacticCoordinate}</dd></div>
          <div><dt>Flight assets</dt><dd>{console.craft.length}</dd></div>
      </>}
      pages={[{ id: 'flight', label: 'Flight group' }, { id: 'combat', label: 'Combat doctrine' }]} activePage={page} onPageChange={setPage}>
      {page === 'flight' ? (
        <div className="aegis-craft-grid">
          <article className="aegis-craft aegis-craft--starlight cic-frame">
            <p>Exploration shuttle // Coordination phase</p>
            <h3>{starlight.name}</h3>
            <dl>
              <div><dt>Scouting envelope</dt><dd>One system within {console.scoutRange} jumps of AEGIS</dd></div>
              <div><dt>Fuelled sortie</dt><dd>Scout a second system</dd></div>
              <div><dt>Away mission</dt><dd>Explore +{console.awayMissionBonus.explore} // Salvage +{console.awayMissionBonus.salvage}</dd></div>
              <div><dt>Fuel state</dt><dd>Tracked at the table</dd></div>
            </dl>
          </article>
          {console.craft.slice(1).map((craft) => (
            <article className="aegis-craft cic-frame" key={craft.id}>
              <p>{craft.type} // {craft.assignment}</p>
              <h3>{craft.name}</h3>
              <dl>
                <div><dt>Capacity</dt><dd>{console.fighterCapacity.standard} fighters // {console.fighterCapacity.upgraded} upgraded</dd></div>
                <div><dt>Launch authority</dt><dd>Assigned fighter bay must be charged and undamaged</dd></div>
                <div><dt>Live strength</dt><dd>Tracked at the table</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="aegis-combat-grid">
          <article className="aegis-doctrine cic-frame">
            <p>Attack phase // Fighter action</p>
            <h3>Medium range</h3>
            <p>Each fighter may shift one hostile ship’s targeting number by +1 or −1, with 1 and 6 wrapping, or roll one die and deal 1 damage on 5+.</p>
          </article>
          <article className="aegis-doctrine cic-frame">
            <p>Attack phase // Fighter action</p>
            <h3>Short range</h3>
            <p>Roll up to one die per fighter. Deal 1 damage on 3+; one fighter is destroyed for each roll of 1 or 2.</p>
          </article>
          <p className="aegis-doctrine__notice">
            Each launched fighter acts at both ranges // assign all short-range damage to hostile fighter wings first
          </p>
        </div>
      )}
    </RoleConsoleTemplate>
  );
}

export default function AegisConsoleWorkspace({ roleId, galacticCoordinate, fuel, damage }: Props) {
  if (!isImplementedAegisRole(roleId)) return null;
  return roleId === 'admiral'
    ? <AdmiralConsole galacticCoordinate={galacticCoordinate} fuel={fuel} damage={damage} />
    : <WingCommanderConsole galacticCoordinate={galacticCoordinate} />;
}
