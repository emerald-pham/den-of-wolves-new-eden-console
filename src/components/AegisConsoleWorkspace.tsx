import MaintenanceSystems from './MaintenanceSystems';
import AirspaceControl from './AirspaceControl';
import JumpFailureReadout from './JumpFailureReadout';
import JumpDriveConsole from './JumpDriveConsole';
import FleetRoleConsoleTemplate from './FleetRoleConsoleTemplate';
import ShipNavigationWorkspace from './ShipNavigationWorkspace';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AEGIS_ROLE_CONSOLES,
  isImplementedAegisRole,
  type AegisShipSystem,
} from '@/data/aegisConsoles';
import type { DamageDraw, ShipDamageState, ShipNavigationLogs } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';

interface Props {
  readonly roleId: string | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly damage?: ShipDamageState | undefined;
  readonly damageDraws?: readonly DamageDraw[] | undefined;
  readonly navigationLogs?: ShipNavigationLogs | undefined;
  readonly consoleLocked?: boolean | undefined;
}

function SystemCard({
  system,
  damaged,
  fuel,
  galacticCoordinate,
  charged,
  upgraded,
  consoleLocked,
  turnZeroLocked,
  integrityLockedUntil,
}: {
  readonly system: AegisShipSystem;
  readonly damaged: boolean;
  readonly fuel: number;
  readonly galacticCoordinate: string;
  readonly charged: boolean;
  readonly upgraded: boolean;
  readonly consoleLocked: boolean;
  readonly turnZeroLocked: boolean;
  readonly integrityLockedUntil?: string | undefined;
}) {
  return (
    <article
      className="aegis-system cic-frame"
      aria-label={`${system.name} system // ${damaged ? 'damaged' : 'operational'}`}
      data-damaged={String(damaged)}
    >
      <header>
        <p>{system.station}</p>
      </header>
      <h3>{system.name}</h3>
      <p>{system.baseline}</p>
      {system.id === 'jump-drive' && <JumpFailureReadout />}
      {system.id === 'jump-drive' && <JumpDriveConsole
        shipId="aegis"
        shipName="AEGIS"
        currentCoordinate={galacticCoordinate}
        fuel={fuel}
        jumpCosts={[
          AEGIS_ROLE_CONSOLES.admiral.jumpCosts.short,
          AEGIS_ROLE_CONSOLES.admiral.jumpCosts.medium,
          AEGIS_ROLE_CONSOLES.admiral.jumpCosts.long,
        ]}
        charged={charged}
        damaged={damaged}
        upgraded={upgraded}
        consoleLocked={consoleLocked}
        turnZeroLocked={turnZeroLocked}
        integrityLockedUntil={integrityLockedUntil}
      />}
      <dl>
        <div className="aegis-system__condition">
          <dt>Condition</dt><dd>{damaged ? 'Damaged' : 'Operational'}</dd>
        </div>
        {system.upgraded && <div><dt>If Upgraded (By Shepherd)</dt><dd>{system.upgraded}</dd></div>}
        <div className="aegis-system__damaged-rule"><dt>If Damaged</dt><dd>{system.damaged}</dd></div>
      </dl>
    </article>
  );
}

function AdmiralConsole({ galacticCoordinate, fuel, damage, damageDraws, navigationLogs, consoleLocked }: Omit<Props, 'roleId'>) {
  const console = AEGIS_ROLE_CONSOLES.admiral;
  const session = useSessionStore((state) => state.session);
  const [page, setPage] = useState<'systems' | 'navigation'>('systems');

  return (
    <FleetRoleConsoleTemplate
      shipName="AEGIS"
      roleName="Admiral"
      title={page === 'systems' ? 'Ship systems' : 'Navigation'}
      galacticCoordinate={galacticCoordinate}
      fuel={fuel}
      reactorCapacity={console.reactorCapacity}
      jumpCosts={[console.jumpCosts.short, console.jumpCosts.medium, console.jumpCosts.long]}
      damage={damage}
      pages={[{ id: 'systems', label: 'Ship systems' }, { id: 'navigation', label: 'Navigation' }]}
      activePage={page} onPageChange={setPage}
    >
      {page === 'navigation' ? <ShipNavigationWorkspace
        shipId="aegis"
        shipName="AEGIS"
        currentCoordinate={galacticCoordinate}
        entries={navigationLogs?.aegis}
        consoleLocked={consoleLocked}
      /> : <>
      <MaintenanceSystems shipId="aegis" name="AEGIS" systems={console.systems}
        damageDraws={damageDraws}
        renderSystem={system => <SystemCard key={system.id} system={system}
          damaged={damage?.damagedSystemIds.includes(system.id) ?? false}
          fuel={fuel}
          galacticCoordinate={galacticCoordinate}
          charged={session?.maintenanceCycles?.aegis?.charges.includes('jump-drive') ?? false}
          upgraded={session?.shipUpgrades?.aegis?.includes('jump-drive') ?? false}
          consoleLocked={consoleLocked ?? false}
          turnZeroLocked={session?.currentTurn === 0}
          integrityLockedUntil={session?.shipJumpStates?.aegis?.integrityLockedUntil} />}
        rations={<>
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
        </>} />
      <AirspaceControl />
      </>}
    </FleetRoleConsoleTemplate>
  );
}

function WingCommanderConsole({ galacticCoordinate, fuel, damage, navigationLogs, consoleLocked }: Omit<Props, 'roleId'>) {
  const [page, setPage] = useState<'flight' | 'combat' | 'navigation'>('flight');
  const console = AEGIS_ROLE_CONSOLES['wing-commander'];
  const starlight = console.craft[0];
  if (!starlight) return null;

  return (
    <FleetRoleConsoleTemplate shipName="AEGIS" roleName="Wing Commander"
      title={page === 'flight' ? 'Flight group' : page === 'combat' ? 'Combat doctrine' : 'Navigation'}
      galacticCoordinate={galacticCoordinate} fuel={fuel}
      reactorCapacity={AEGIS_ROLE_CONSOLES.admiral.reactorCapacity}
      jumpCosts={[
        AEGIS_ROLE_CONSOLES.admiral.jumpCosts.short,
        AEGIS_ROLE_CONSOLES.admiral.jumpCosts.medium,
        AEGIS_ROLE_CONSOLES.admiral.jumpCosts.long,
      ]} damage={damage}
      telemetry={<div><dt>Flight assets</dt><dd>{console.craft.length}</dd></div>}
      pages={[{ id: 'flight', label: 'Flight group' }, { id: 'combat', label: 'Combat doctrine' }, { id: 'navigation', label: 'Navigation' }]} activePage={page} onPageChange={setPage}>
      {page === 'navigation' ? <ShipNavigationWorkspace
        shipId="aegis"
        shipName="AEGIS"
        currentCoordinate={galacticCoordinate}
        entries={navigationLogs?.aegis}
        consoleLocked={consoleLocked}
      /> : page === 'flight' ? (
        <div className="aegis-craft-grid">
          <article className="aegis-craft aegis-craft--starlight cic-frame">
            <p>Exploration shuttle // Airspace open</p>
            <h3>{starlight.name}</h3>
            <dl>
              <div><dt>Scouting envelope</dt><dd>One system within {console.scoutRange} jumps of AEGIS</dd></div>
              <div><dt>Fuelled sortie</dt><dd>Scout a second system</dd></div>
              <div><dt>Away mission</dt><dd>Explore +{console.awayMissionBonus.explore} // Salvage +{console.awayMissionBonus.salvage}</dd></div>
              <div><dt>Fuel state</dt><dd>Tracked at the table</dd></div>
            </dl>
            <Link className="cic-text-button" to={`/shuttles/${starlight.id}`}
              aria-label="Open Starlight shuttle console">
              Open shuttle console
            </Link>
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
    </FleetRoleConsoleTemplate>
  );
}

export default function AegisConsoleWorkspace({ roleId, galacticCoordinate, fuel, damage, damageDraws, navigationLogs, consoleLocked }: Props) {
  if (!isImplementedAegisRole(roleId)) return null;
  return roleId === 'admiral'
    ? <AdmiralConsole galacticCoordinate={galacticCoordinate} fuel={fuel} damage={damage} damageDraws={damageDraws} navigationLogs={navigationLogs} consoleLocked={consoleLocked} />
    : <WingCommanderConsole galacticCoordinate={galacticCoordinate} fuel={fuel} damage={damage} navigationLogs={navigationLogs} consoleLocked={consoleLocked} />;
}
