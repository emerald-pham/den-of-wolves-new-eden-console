import MaintenanceSystems from './MaintenanceSystems';
import AirspaceControl from './AirspaceControl';
import JumpFailureReadout from './JumpFailureReadout';
import JumpDriveConsole from './JumpDriveConsole';
import FleetRoleConsoleTemplate from './FleetRoleConsoleTemplate';
import ShipNavigationWorkspace from './ShipNavigationWorkspace';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AEGIS_FIGHTER_BAY_SYSTEMS,
  AEGIS_ROLE_CONSOLES,
  isImplementedAegisRole,
  type AegisCraft,
  type AegisShipSystem,
} from '@/data/aegisConsoles';
import type { DamageDraw, MaintenanceCycle, ShipDamageState, ShipNavigationLogs } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import type { ShipConsoleProjection } from '@/lib/shipStateProjection';

interface Props {
  readonly roleId: string | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly damage?: ShipDamageState | undefined;
  readonly damageDraws?: readonly DamageDraw[] | undefined;
  readonly navigationLogs?: ShipNavigationLogs | undefined;
  readonly consoleLocked?: boolean | undefined;
  readonly shipState?: ShipConsoleProjection | undefined;
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

type ChargeState = 'charged' | 'not-charged' | 'unavailable';

function SystemStatus({
  damaged,
  damagedRule,
  charge,
  upgraded,
}: {
  readonly damaged: boolean | null;
  readonly damagedRule: string;
  readonly charge?: { readonly state: ChargeState; readonly unavailableReason?: string };
  readonly upgraded?: { readonly label: string; readonly value: string };
}) {
  const condition = damaged === null
    ? 'Unavailable // awaiting live server state'
    : damaged ? 'Damaged' : 'Operational';
  const chargeText = charge?.state === 'charged'
    ? 'Charged'
    : charge?.state === 'not-charged'
      ? 'Not charged'
      : charge?.unavailableReason ?? 'Unavailable // awaiting live server state';

  return (
    <dl>
      <div className="aegis-system__condition">
        <dt>Condition</dt><dd>{condition}</dd>
      </div>
      {charge && <div><dt>Charge</dt><dd>{chargeText}</dd></div>}
      {upgraded && <div><dt>{upgraded.label}</dt><dd>{upgraded.value}</dd></div>}
      <div className="aegis-system__damaged-rule"><dt>If Damaged</dt><dd>{damaged === null ? 'Unavailable // awaiting live server state' : damagedRule}</dd></div>
    </dl>
  );
}

function liveStateLabel(
  freshness: 'unknown' | 'cache' | 'server',
  connection: 'idle' | 'connecting' | 'live' | 'offline',
) {
  if (freshness === 'server') {
    return connection === 'offline'
      ? 'Live server snapshot // reconnecting for updates'
      : 'Live server snapshot';
  }
  if (connection === 'connecting') return 'Loading live server state';
  if (connection === 'offline' || freshness === 'cache') return 'Unavailable // reconnect required';
  return 'Awaiting live server state';
}

function FighterWingCard({
  craft,
  authoritativeDamage,
  constructionBayUpgraded,
  fighterWingCount,
  hasServerSnapshot,
  maintenance,
  snapshotLabel,
  fighterCapacity,
}: {
  readonly craft: AegisCraft;
  readonly authoritativeDamage: ShipDamageState | undefined;
  readonly constructionBayUpgraded: boolean | null;
  readonly fighterWingCount: { readonly count: number; readonly revision: number } | undefined;
  readonly hasServerSnapshot: boolean;
  readonly maintenance: MaintenanceCycle | undefined;
  readonly snapshotLabel: string;
  readonly fighterCapacity: { readonly standard: number; readonly upgraded: number };
}) {
  const baySystem = craft.launchSystemId
    ? AEGIS_FIGHTER_BAY_SYSTEMS[craft.launchSystemId]
    : undefined;
  const damaged = hasServerSnapshot && craft.launchSystemId && authoritativeDamage
    ? authoritativeDamage.damagedSystemIds.includes(craft.launchSystemId)
    : null;
  const charge: { readonly state: ChargeState; readonly unavailableReason?: string } = hasServerSnapshot && maintenance
    ? {
      state: maintenance.charges.includes(craft.launchSystemId ?? '') ? 'charged' : 'not-charged',
    }
    : {
      state: 'unavailable',
      unavailableReason: hasServerSnapshot
        ? 'Unavailable // no active maintenance cycle'
        : 'Unavailable // awaiting live server state',
    };
  const launchEligibility = damaged === null || charge.state === 'unavailable'
    ? `Unavailable // ${damaged === null ? 'awaiting live bay state' : 'current charge state is unavailable'}`
    : damaged
      ? 'Blocked // bay damaged'
      : charge.state === 'charged'
        ? 'Eligible // bay charged and operational'
        : 'Blocked // bay not charged';
  const capacity = constructionBayUpgraded === null
    ? 'Unavailable // awaiting live server state'
    : `${constructionBayUpgraded ? fighterCapacity.upgraded : fighterCapacity.standard} fighters // Construction Bay ${constructionBayUpgraded ? 'upgraded' : 'standard'}`;

  return (
    <article
      className="aegis-craft cic-frame"
      data-damaged={damaged === null ? undefined : String(damaged)}
      key={craft.id}
    >
      <p>{craft.type} // {craft.assignment}</p>
      <h3>{craft.name}</h3>
      <p className="aegis-craft__state" role="status" aria-live="polite">{snapshotLabel}</p>
      <dl>
        <div><dt>Effective capacity</dt><dd>{capacity}</dd></div>
        <div><dt>Launch eligibility</dt><dd>{launchEligibility}</dd></div>
        <div><dt>Live strength</dt><dd>{hasServerSnapshot && fighterWingCount
          ? `${fighterWingCount.count} fighters // revision ${fighterWingCount.revision}`
          : hasServerSnapshot
            ? 'Unavailable // server has not published a fighter count'
            : 'Unavailable // awaiting fighter count from the server'}</dd></div>
      </dl>
      {baySystem && <>
        <p className="aegis-craft__system-label">Assigned system // {baySystem.name}</p>
        <p>{baySystem.baseline}</p>
        <SystemStatus
          damaged={damaged}
          charge={charge}
          upgraded={{
            label: 'Upgrade source',
            value: constructionBayUpgraded === null
              ? 'Unavailable // awaiting live server state'
              : `Construction Bay // ${constructionBayUpgraded ? 'upgraded' : 'standard'}`,
          }}
          damagedRule={baySystem.damaged}
        />
      </>}
    </article>
  );
}

function AdmiralConsole({ galacticCoordinate, fuel, damage, damageDraws, navigationLogs, consoleLocked, shipState }: Omit<Props, 'roleId'>) {
  const console = AEGIS_ROLE_CONSOLES.admiral;
  const session = useSessionStore((state) => state.session);
  const maintenanceCycle = shipState ? shipState.maintenanceCycle : session?.maintenanceCycles?.aegis;
  const upgrades = shipState ? shipState.upgrades : session?.shipUpgrades?.aegis ?? [];
  const jumpState = shipState ? shipState.jumpState : session?.shipJumpStates?.aegis;
  const currentTurn = shipState ? shipState.currentTurn : session?.currentTurn;
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
        shipState={shipState}
        renderSystem={system => <SystemCard key={system.id} system={system}
          damaged={damage?.damagedSystemIds.includes(system.id) ?? false}
          fuel={fuel}
          galacticCoordinate={galacticCoordinate}
          charged={maintenanceCycle?.charges.includes('jump-drive') ?? false}
          upgraded={upgrades.includes('jump-drive')}
          consoleLocked={consoleLocked ?? false}
          turnZeroLocked={currentTurn === 0}
          integrityLockedUntil={jumpState?.integrityLockedUntil} />}
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

function WingCommanderConsole({ galacticCoordinate, fuel, damage, navigationLogs, consoleLocked, shipState }: Omit<Props, 'roleId'>) {
  const [page, setPage] = useState<'flight' | 'combat' | 'navigation'>('flight');
  const console = AEGIS_ROLE_CONSOLES['wing-commander'];
  const session = useSessionStore((state) => state.session);
  const sessionSnapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const connection = useSessionStore((state) => state.connection);
  const starlight = console.craft[0];
  if (!starlight) return null;
  const hasServerSnapshot = Boolean(session && sessionSnapshotFreshness === 'server');
  const snapshotLabel = liveStateLabel(sessionSnapshotFreshness, connection);
  const maintenance = shipState ? shipState.maintenanceCycle : session?.maintenanceCycles?.aegis;
  const upgrades = shipState ? shipState.upgrades : session?.shipUpgrades?.aegis ?? [];
  const authoritativeDamage = damage ?? (shipState ? shipState.damage : session?.shipDamage?.aegis);
  const constructionBayUpgraded = hasServerSnapshot
    ? upgrades.includes('construction-bay')
    : null;
  const fighterWingCounts = shipState?.fighterWingCounts ?? session?.fighterWingCounts;

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
            <FighterWingCard
              key={craft.id}
              craft={craft}
              authoritativeDamage={authoritativeDamage}
              constructionBayUpgraded={constructionBayUpgraded}
              fighterWingCount={fighterWingCounts?.[craft.id]}
              hasServerSnapshot={hasServerSnapshot}
              maintenance={maintenance}
              snapshotLabel={snapshotLabel}
              fighterCapacity={console.fighterCapacity}
            />
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

export default function AegisConsoleWorkspace({ roleId, galacticCoordinate, fuel, damage, damageDraws, navigationLogs, consoleLocked, shipState }: Props) {
  if (!isImplementedAegisRole(roleId)) return null;
  return roleId === 'admiral'
    ? <AdmiralConsole galacticCoordinate={galacticCoordinate} fuel={fuel} damage={damage} damageDraws={damageDraws} navigationLogs={navigationLogs} consoleLocked={consoleLocked} shipState={shipState} />
    : <WingCommanderConsole galacticCoordinate={galacticCoordinate} fuel={fuel} damage={damage} navigationLogs={navigationLogs} consoleLocked={consoleLocked} shipState={shipState} />;
}
