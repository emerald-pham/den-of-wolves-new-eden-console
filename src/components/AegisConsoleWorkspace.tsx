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
import aegis from '@/data/vessels/aegis';
import type { DamageDraw, MaintenanceCycle, ShipDamageState, ShipNavigationLogs, TurnPhase } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import type { ShipConsoleProjection } from '@/lib/shipStateProjection';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { phaseForSession } from '@/lib/turnPhase';
import {
  buildFighter as buildFighterAction,
  exchangeFighterWings,
  type AegisFighterWingId,
  type FighterBuildResult,
} from '@/lib/sessionService';
import AdmiralDirectiveWorkspace from './AdmiralDirectives';
import AegisFighterWingExchangePanel from './AegisFighterWingExchangePanel';

interface Props {
  readonly roleId: string | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly damage?: ShipDamageState | undefined;
  readonly damageDraws?: readonly DamageDraw[] | undefined;
  readonly navigationLogs?: ShipNavigationLogs | undefined;
  readonly knownCoordinates?: readonly string[] | undefined;
  readonly knownSystems?: Readonly<Record<string, string>> | undefined;
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
  integrityLockedUntil,
}: {
  readonly system: AegisShipSystem;
  readonly damaged: boolean;
  readonly fuel: number;
  readonly galacticCoordinate: string;
  readonly charged: boolean;
  readonly upgraded: boolean;
  readonly consoleLocked: boolean;
  readonly integrityLockedUntil?: string | undefined;
}) {
  const session = useSessionStore((state) => state.session);
  const jumpState = session?.shipJumpStates?.aegis;
  const pursuitValue = session?.playerDiscovery?.shipId === 'aegis'
    ? session.playerDiscovery.pursuitValue
    : session?.pursuitGroups?.[session.shipFleetGroupIds?.aegis ?? ''];
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
          aegis.printedStatistics.jumpCosts.short,
          aegis.printedStatistics.jumpCosts.medium,
          aegis.printedStatistics.jumpCosts.long,
        ]}
        charged={charged}
        damaged={damaged}
        upgraded={upgraded}
        consoleLocked={consoleLocked}
        integrityLockedUntil={integrityLockedUntil}
        emergencyJumpUsed={jumpState?.emergencyJumpUsed ?? false}
        {...(jumpState?.lastFailureRequestId
          ? { lastFailureRequestId: jumpState.lastFailureRequestId } : {})}
        {...(pursuitValue === undefined ? {} : { pursuitValue })}
        pursuitEmergencyWindowStatus={session?.pursuitEmergencyWindow?.status}
        demoMode={session?.singlePlayerDemo !== undefined}
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

function fighterBuildGuidance({ hasServerSnapshot, connection, writable, constructionTurnAvailable,
  teamPhaseAvailable, constructionBayDamaged, constructionBayCharged, maintenance,
  fighterWingCount, capacity, materials }: {
  readonly hasServerSnapshot: boolean;
  readonly connection: 'idle' | 'connecting' | 'live' | 'offline';
  readonly writable: boolean;
  readonly constructionTurnAvailable: boolean;
  readonly teamPhaseAvailable: boolean;
  readonly constructionBayDamaged: boolean | null;
  readonly constructionBayCharged: boolean;
  readonly maintenance: MaintenanceCycle | undefined;
  readonly fighterWingCount: { readonly count: number; readonly revision: number } | undefined;
  readonly capacity: number;
  readonly materials: number | undefined;
}): string {
  if (!hasServerSnapshot) return 'Build unavailable // awaiting live server state. Next actor // Wing Commander reconnects for the current build state.';
  if (connection !== 'live') return 'Build unavailable // reconnect required. Next actor // Wing Commander restores the live connection.';
  if (!writable) return 'Build unavailable // read-only view. Next actor // the current entitled console actor uses their own console; a GM observer needs explicit Write access.';
  if (!constructionTurnAvailable) return 'Build unavailable // Cycle 1 required. Next actor // GM completes the normal start.';
  if (!teamPhaseAvailable) return 'Build unavailable // Team Phase required. Next actor // Wing Commander waits for Team Phase; GM controls cycle advancement.';
  if (constructionBayDamaged === null) return 'Build unavailable // awaiting Construction Bay state. Next actor // Wing Commander waits for the current server state.';
  if (constructionBayDamaged) return 'Build unavailable // Construction Bay damaged. Next actor // an Engineering shuttle repairs it.';
  if (!maintenance) return 'Build unavailable // Construction Bay charge state unavailable. Next actor // AEGIS Admiral or Executive Officer uses the current maintenance cycle.';
  if (!constructionBayCharged) return 'Build unavailable // Construction Bay not charged. Next actor // AEGIS Admiral or Executive Officer charges it through maintenance.';
  if (!fighterWingCount) return 'Build unavailable // fighter strength is not published. Next actor // Wing Commander waits for the current server strength.';
  if (fighterWingCount.count >= capacity) return `Build unavailable // wing at capacity (${capacity} fighters). Next actor // Wing Commander waits for space in this wing.`;
  if (materials === undefined) return 'Build unavailable // construction materials are not published. Next actor // Wing Commander waits for the current server resource state.';
  if (materials < 1) return 'Build unavailable // 1 material required. Next actor // AEGIS crew obtains construction materials, then the Wing Commander builds.';
  return `${materials} material${materials === 1 ? '' : 's'} available. Next actor // Wing Commander builds one fighter for one material.`;
}

/**
 * Explain the first reason the Team Phase exchange cannot be sent, mirroring
 * the server's guards so a disabled control always says what to wait for.
 */
function fighterWingExchangeBlocker({ hasServerSnapshot, connection, writable, currentTurn, phase,
  counts, capacity, sourceWingId }: {
  readonly hasServerSnapshot: boolean;
  readonly connection: 'idle' | 'connecting' | 'live' | 'offline';
  readonly writable: boolean;
  readonly currentTurn: number | undefined;
  readonly phase: TurnPhase | undefined;
  readonly counts: Readonly<Record<AegisFighterWingId, { readonly count: number; readonly revision: number } | undefined>>;
  readonly capacity: 4 | 6;
  readonly sourceWingId: AegisFighterWingId;
}): string | null {
  if (!hasServerSnapshot) return 'Exchange unavailable // awaiting live server state. Next actor // Wing Commander reconnects for the current wing counts.';
  if (connection !== 'live') return 'Exchange unavailable // reconnect required. Next actor // Wing Commander restores the live connection.';
  if (!writable) return 'Exchange unavailable // read-only view. Next actor // the Wing Commander uses their own console; a GM observer needs explicit Write access.';
  if (currentTurn === 0) return 'Exchange unavailable // Cycle 1 required. Next actor // GM completes the normal start.';
  if (!phase || phase.airspace.state !== 'restricted') return 'Exchange unavailable // Team Phase required. Next actor // Wing Commander waits for the next Team Phase; GM controls cycle advancement.';
  if (phase.timerPause) return 'Exchange unavailable // Team Phase clock paused. Next actor // GM resumes the clock.';
  const targetWingId: AegisFighterWingId = sourceWingId === 'fighter-wing-alpha' ? 'fighter-wing-bravo' : 'fighter-wing-alpha';
  const wingName = (wingId: AegisFighterWingId) => wingId === 'fighter-wing-alpha' ? 'Alpha' : 'Bravo';
  const source = counts[sourceWingId];
  const target = counts[targetWingId];
  if (!source || !target) return 'Exchange unavailable // fighter strength is not published. Next actor // Wing Commander waits for the current server strength.';
  const reverseOpen = target.count >= 1 && source.count < capacity;
  const alternative = reverseOpen
    ? ` Choose ${wingName(targetWingId)} to ${wingName(sourceWingId)} instead.`
    : source.count < 1 ? ' Neither wing can give a fighter.' : ' Both wings are full.';
  if (source.count < 1) return `Exchange unavailable // ${wingName(sourceWingId)} has no fighters to move.${alternative}`;
  if (target.count >= capacity) {
    return `Exchange unavailable // ${wingName(targetWingId)} already holds ${capacity} fighters, its capacity.${alternative}`;
  }
  return null;
}

/** Describe the latest server reply to this console's build request without inventing state. */
function fighterBuildResultNotice(wingName: string, result: FighterBuildResult | null): string {
  if (!result) {
    return 'Last build not confirmed // check live strength and materials before building again. Building this wing again resends the same request and cannot spend a second material.';
  }
  if (result.status === 'stale') {
    return 'Last build not committed // AEGIS state changed before the build committed. No material was spent; review the live state and try again.';
  }
  const prefix = result.status === 'replayed' ? 'Last build already committed' : 'Last build committed';
  if (result.count === undefined || result.fighterWingRevision === undefined || result.materials === undefined) {
    return `${prefix} // ${wingName} strength and materials update from the server.`;
  }
  return `${prefix} // ${wingName} now ${result.count} fighters (revision ${result.fighterWingRevision}) // 1 material spent // ${result.materials} material${result.materials === 1 ? '' : 's'} remain${result.materials === 1 ? 's' : ''}.`;
}

export function FighterWingCard({
  craft,
  authoritativeDamage,
  constructionBayUpgraded,
  fighterWingCount,
  materials,
  canBuild,
  buildPending,
  onBuild,
  hasServerSnapshot,
  maintenance,
  snapshotLabel,
  fighterCapacity,
  buildGuidance,
  buildNotice,
}: {
  readonly craft: AegisCraft;
  readonly authoritativeDamage: ShipDamageState | undefined;
  readonly constructionBayUpgraded: boolean | null;
  readonly fighterWingCount: { readonly count: number; readonly revision: number } | undefined;
  readonly materials: number | undefined;
  readonly canBuild: boolean;
  readonly buildPending: boolean;
  readonly onBuild: () => void;
  readonly hasServerSnapshot: boolean;
  readonly maintenance: MaintenanceCycle | undefined;
  readonly snapshotLabel: string;
  readonly fighterCapacity: { readonly standard: number; readonly upgraded: number };
  readonly buildGuidance?: string;
  readonly buildNotice?: string | undefined;
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
  const buildLabel = !hasServerSnapshot
    ? 'Build unavailable // awaiting live server state'
    : fighterWingCount === undefined
      ? 'Build unavailable // fighter strength is not published'
      : !canBuild
        ? 'Build unavailable // charge, damage, phase, or materials guard'
        : `${materials ?? 0} material${materials === 1 ? '' : 's'} available`;

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
          ? `${fighterWingCount.count} fighter${fighterWingCount.count === 1 ? '' : 's'} // revision ${fighterWingCount.revision}`
          : hasServerSnapshot
            ? 'Unavailable // server has not published a fighter count'
            : 'Unavailable // awaiting fighter count from the server'}</dd></div>
        <div><dt>Construction materials</dt><dd>{hasServerSnapshot && materials !== undefined
          ? `${materials} material${materials === 1 ? '' : 's'}`
          : 'Unavailable // awaiting live resource state'}</dd></div>
      </dl>
      <div className="aegis-craft__construction-action">
        <p>{buildGuidance ?? buildLabel}</p>
        <button className="cic-action-button" type="button" disabled={!canBuild || buildPending}
          aria-busy={buildPending}
          onClick={onBuild}>
          {buildPending ? 'Building fighter…' : 'Build 1 fighter // 1 material'}
        </button>
        {(buildPending || buildNotice) && <p className="aegis-craft__build-result" role="status" aria-live="polite">
          {buildPending ? 'Build pending // awaiting the server commit.' : buildNotice}
        </p>}
      </div>
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

/** The Admiral and Executive Officer use the same server-backed maintenance lane. */
export function AegisMaintenanceSystems({ galacticCoordinate, fuel, damage, damageDraws, consoleLocked, shipState }:
  Pick<Props, 'galacticCoordinate' | 'fuel' | 'damage' | 'damageDraws' | 'consoleLocked' | 'shipState'>) {
  const console = AEGIS_ROLE_CONSOLES.admiral;
  const session = useSessionStore((state) => state.session);
  const maintenanceCycle = shipState ? shipState.maintenanceCycle : session?.maintenanceCycles?.aegis;
  const upgrades = shipState ? shipState.upgrades : session?.shipUpgrades?.aegis ?? [];
  const jumpState = shipState ? shipState.jumpState : session?.shipJumpStates?.aegis;
  return (
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
  );
}

function AdmiralConsole({ galacticCoordinate, fuel, damage, damageDraws, navigationLogs, knownCoordinates, knownSystems, consoleLocked, shipState }: Omit<Props, 'roleId'>) {
  const printedStatistics = aegis.printedStatistics;
  const session = useSessionStore((state) => state.session);
  const upgrades = shipState ? shipState.upgrades : session?.shipUpgrades?.aegis ?? [];
  const [page, setPage] = useState<'systems' | 'navigation' | 'directives'>('systems');

  return (
    <FleetRoleConsoleTemplate
      shipName="AEGIS"
      roleName="Admiral"
      title={page === 'systems' ? 'Ship systems' : page === 'navigation' ? 'Navigation' : 'Fleet directives'}
      galacticCoordinate={galacticCoordinate}
      fuel={fuel}
      reactorCapacity={printedStatistics.reactorCapacity}
      jumpCosts={[printedStatistics.jumpCosts.short, printedStatistics.jumpCosts.medium, printedStatistics.jumpCosts.long]}
      jumpDriveUpgraded={upgrades.includes('jump-drive')}
      damage={damage}
      pages={[
        { id: 'systems', label: 'Ship systems' },
        { id: 'navigation', label: 'Navigation' },
        { id: 'directives', label: 'Fleet directives' },
      ]}
      activePage={page} onPageChange={setPage}
    >
      {page === 'navigation' ? <ShipNavigationWorkspace
        shipId="aegis"
        shipName="AEGIS"
        currentCoordinate={galacticCoordinate}
          entries={navigationLogs?.aegis}
          knownCoordinates={knownCoordinates}
        knownSystems={knownSystems}
        consoleLocked={consoleLocked}
      /> : page === 'directives' ? <AdmiralDirectiveWorkspace consoleLocked={consoleLocked ?? false} /> : <>
      <AegisMaintenanceSystems galacticCoordinate={galacticCoordinate} fuel={fuel}
        damage={damage} damageDraws={damageDraws} consoleLocked={consoleLocked} shipState={shipState} />
      <AirspaceControl />
      </>}
    </FleetRoleConsoleTemplate>
  );
}

function WingCommanderConsole({ galacticCoordinate, fuel, damage, navigationLogs, knownCoordinates, knownSystems, consoleLocked, shipState }: Omit<Props, 'roleId'>) {
  const [page, setPage] = useState<'flight' | 'combat' | 'navigation'>('flight');
  const console = AEGIS_ROLE_CONSOLES['wing-commander'];
  const session = useSessionStore((state) => state.session);
  const sessionSnapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const connection = useSessionStore((state) => state.connection);
  const access = useConsoleAccess();
  const [buildingWing, setBuildingWing] = useState<string | null>(null);
  const [buildNotices, setBuildNotices] = useState<Readonly<Record<string, string>>>({});
  const starlight = console.craft[0];
  if (!starlight) return null;
  const hasServerSnapshot = Boolean(session && sessionSnapshotFreshness === 'server');
  const snapshotLabel = liveStateLabel(sessionSnapshotFreshness, connection);
  const maintenance = shipState ? shipState.maintenanceCycle : session?.maintenanceCycles?.aegis;
  const resources = shipState ? shipState.resources : session?.shipResources?.aegis;
  const upgrades = shipState ? shipState.upgrades : session?.shipUpgrades?.aegis ?? [];
  const authoritativeDamage = damage ?? (shipState ? shipState.damage : session?.shipDamage?.aegis);
  const constructionBayUpgraded = hasServerSnapshot
    ? upgrades.includes('construction-bay')
    : null;
  const constructionBayDamaged = hasServerSnapshot
    ? authoritativeDamage?.damagedSystemIds.includes('construction-bay') ?? false
    : null;
  const constructionBayCharged = hasServerSnapshot && maintenance?.charges.includes('construction-bay') === true;
  const teamPhaseAvailable = !session?.turnPhase || phaseForSession(session)?.airspace.state === 'restricted';
  const constructionTurnAvailable = session?.currentTurn !== 0;
  const fighterWingCounts = shipState?.fighterWingCounts ?? session?.fighterWingCounts;
  const fighterWings = console.craft.filter((craft) => craft.fighterWing);
  const fighterWingCombat = fighterWings[0]?.fighterWing?.combat;
  const exchangeCounts = {
    'fighter-wing-alpha': hasServerSnapshot ? fighterWingCounts?.['fighter-wing-alpha'] : undefined,
    'fighter-wing-bravo': hasServerSnapshot ? fighterWingCounts?.['fighter-wing-bravo'] : undefined,
  };
  const exchangeCapacity = constructionBayUpgraded ? 6 : 4;

  return (
    <FleetRoleConsoleTemplate shipName="AEGIS" roleName="Wing Commander"
      title={page === 'flight' ? 'Flight group' : page === 'combat' ? 'Combat doctrine' : 'Navigation'}
      galacticCoordinate={galacticCoordinate} fuel={fuel}
      reactorCapacity={aegis.printedStatistics.reactorCapacity}
      jumpCosts={[
        aegis.printedStatistics.jumpCosts.short,
        aegis.printedStatistics.jumpCosts.medium,
        aegis.printedStatistics.jumpCosts.long,
      ]} jumpDriveUpgraded={upgrades.includes('jump-drive')} damage={damage}
      telemetry={<div><dt>Flight assets</dt><dd>{console.craft.length}</dd></div>}
      pages={[{ id: 'flight', label: 'Flight group' }, { id: 'combat', label: 'Combat doctrine' }, { id: 'navigation', label: 'Navigation' }]} activePage={page} onPageChange={setPage}>
      {page === 'navigation' ? <ShipNavigationWorkspace
        shipId="aegis"
        shipName="AEGIS"
        currentCoordinate={galacticCoordinate}
          entries={navigationLogs?.aegis}
          knownCoordinates={knownCoordinates}
        knownSystems={knownSystems}
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
              <div><dt>Fuel state</dt><dd>Tracked at the console</dd></div>
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
              fighterWingCount={craft.fighterWing ? fighterWingCounts?.[craft.fighterWing.countId] : undefined}
              materials={resources?.materials}
              canBuild={Boolean(
                access.writable && connection === 'live' && hasServerSnapshot &&
                constructionBayCharged && constructionBayDamaged === false && teamPhaseAvailable &&
                constructionTurnAvailable && craft.fighterWing &&
                fighterWingCounts?.[craft.fighterWing.countId] &&
                fighterWingCounts[craft.fighterWing.countId]!.count <
                  (constructionBayUpgraded ? craft.fighterWing.capacity.upgraded : craft.fighterWing.capacity.standard) &&
                (resources?.materials ?? 0) >= 1,
              )}
              buildPending={buildingWing === craft.fighterWing?.countId}
              onBuild={() => {
                if (!craft.fighterWing || buildingWing !== null) return;
                const wingId = craft.fighterWing.countId;
                const recordNotice = (result: FighterBuildResult | null) =>
                  setBuildNotices((notices) => ({ ...notices, [wingId]: fighterBuildResultNotice(craft.name, result) }));
                setBuildingWing(wingId);
                void buildFighterAction(wingId).then(recordNotice, () => recordNotice(null))
                  .finally(() => setBuildingWing(null));
              }}
              buildNotice={craft.fighterWing ? buildNotices[craft.fighterWing.countId] : undefined}
              hasServerSnapshot={hasServerSnapshot}
              maintenance={maintenance}
              snapshotLabel={snapshotLabel}
              fighterCapacity={craft.fighterWing?.capacity ?? console.fighterCapacity}
              buildGuidance={fighterBuildGuidance({ hasServerSnapshot, connection, writable: access.writable,
                constructionTurnAvailable, teamPhaseAvailable, constructionBayDamaged, constructionBayCharged,
                maintenance, fighterWingCount: craft.fighterWing ? fighterWingCounts?.[craft.fighterWing.countId] : undefined,
                capacity: constructionBayUpgraded
                  ? (craft.fighterWing?.capacity ?? console.fighterCapacity).upgraded
                  : (craft.fighterWing?.capacity ?? console.fighterCapacity).standard,
                materials: resources?.materials })}
            />
          ))}
          <AegisFighterWingExchangePanel
            counts={exchangeCounts}
            capacity={exchangeCapacity}
            blockerFor={(sourceWingId) => fighterWingExchangeBlocker({
              hasServerSnapshot, connection, writable: access.writable, currentTurn: session?.currentTurn,
              phase: phaseForSession(session), counts: exchangeCounts, capacity: exchangeCapacity, sourceWingId,
            })}
            onExchange={exchangeFighterWings}
          />
        </div>
      ) : (
        <div className="aegis-combat-grid">
          <article className="aegis-doctrine cic-frame">
            <p>Attack phase // Fighter action</p>
            <h3>Medium range</h3>
            <p>{fighterWingCombat?.mediumRange}</p>
          </article>
          <article className="aegis-doctrine cic-frame">
            <p>Attack phase // Fighter action</p>
            <h3>Short range</h3>
            <p>{fighterWingCombat?.shortRange} {fighterWingCombat?.lossRule}</p>
          </article>
          <p className="aegis-doctrine__notice">
            Each launched fighter acts at both ranges // assign all short-range damage to hostile fighter wings first
          </p>
        </div>
      )}
    </FleetRoleConsoleTemplate>
  );
}

export default function AegisConsoleWorkspace({ roleId, galacticCoordinate, fuel, damage, damageDraws, navigationLogs, knownCoordinates, knownSystems, consoleLocked, shipState }: Props) {
  if (!isImplementedAegisRole(roleId)) return null;
  return roleId === 'admiral'
    ? <AdmiralConsole galacticCoordinate={galacticCoordinate} fuel={fuel} damage={damage} damageDraws={damageDraws} navigationLogs={navigationLogs} knownCoordinates={knownCoordinates} knownSystems={knownSystems} consoleLocked={consoleLocked} shipState={shipState} />
    : <WingCommanderConsole galacticCoordinate={galacticCoordinate} fuel={fuel} damage={damage} navigationLogs={navigationLogs} knownCoordinates={knownCoordinates} knownSystems={knownSystems} consoleLocked={consoleLocked} shipState={shipState} />;
}
