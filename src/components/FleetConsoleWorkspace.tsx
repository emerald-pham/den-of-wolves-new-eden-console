import AegisEnrichedWarheadPanel from './AegisEnrichedWarheadPanel';
import AegisConsoleWorkspace from '@/components/AegisConsoleWorkspace';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import type { ConsoleRole } from '@/data/roles';
import type { Ship } from '@/data/ships';
import { isImplementedAegisRole } from '@/data/aegisConsoles';
import type { DamageDraw, ShipDamageState, ShipNavigationLogs } from '@/types/game';
import type { ShipConsoleProjection } from '@/lib/shipStateProjection';
import AegisCommandAndControlPanel from './AegisCommandAndControlPanel';
import WolfAttackStatusPanel from './WolfAttackStatusPanel';
import WolfRangeActionPanel from './WolfRangeActionPanel';
import WolfBoardingDefencePanel from './WolfBoardingDefencePanel';
import AegisFighterWingLaunchPanel from './AegisFighterWingLaunchPanel';
import WolfFighterRangeActionPanel from './WolfFighterRangeActionPanel';
import WolfBoardingSpecialChoicePanel from './WolfBoardingSpecialChoicePanel';

interface Props {
  readonly ship: Ship;
  readonly role: ConsoleRole | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly damage?: ShipDamageState | undefined;
  readonly damageDraws?: readonly DamageDraw[] | undefined;
  readonly navigationLogs?: ShipNavigationLogs | undefined;
  readonly knownCoordinates?: readonly string[] | undefined;
  readonly knownSystems?: Readonly<Record<string, string>> | undefined;
  readonly consoleLocked?: boolean;
  readonly writable?: boolean;
  /** Selected public vessel state; legacy props remain for standalone references. */
  readonly shipState?: ShipConsoleProjection | undefined;
}

export default function FleetConsoleWorkspace({
  ship,
  role,
  galacticCoordinate,
  fuel,
  damage,
  damageDraws,
  navigationLogs,
  knownCoordinates,
  knownSystems,
  consoleLocked = false,
  writable = false,
  shipState,
}: Props) {
  if (!role || !ship.roles.some(candidate => candidate.id === role.id)) return null;
  const projectedCoordinate = shipState ? shipState.galacticCoordinate : galacticCoordinate;
  const projectedFuel = shipState ? shipState.resources?.fuel ?? 0 : fuel;
  const projectedDamage = shipState ? shipState.damage : damage;
  const projectedNavigationLogs = shipState ? shipState.navigationLogs : navigationLogs;
  const projectedConsoleLock = shipState ? shipState.consoleLocked : consoleLocked;
  if (ship.workspace === 'aegis' && role.id === 'executive-officer') {
    return <>
      <FleetSystemsWorkspace
        ship={ship}
        role={role}
        galacticCoordinate={projectedCoordinate}
        fuel={projectedFuel}
        damage={projectedDamage}
        damageDraws={damageDraws}
        navigationLogs={projectedNavigationLogs}
        knownCoordinates={knownCoordinates}
        knownSystems={knownSystems}
        consoleLocked={projectedConsoleLock}
        writable={writable}
        shipState={shipState}
      />
      <AegisEnrichedWarheadPanel consoleLocked={projectedConsoleLock} />
      <AegisCommandAndControlPanel consoleLocked={projectedConsoleLock} />
      {writable && <WolfRangeActionPanel />}
      {writable && <WolfBoardingDefencePanel />}
      {writable && <WolfBoardingSpecialChoicePanel />}
      <WolfAttackStatusPanel />
    </>;
  }
  if (ship.workspace === 'aegis' && isImplementedAegisRole(role.id)) {
    return <>
      <AegisConsoleWorkspace
        roleId={role.id}
        galacticCoordinate={projectedCoordinate}
        fuel={projectedFuel}
        damage={projectedDamage}
        damageDraws={damageDraws}
        navigationLogs={projectedNavigationLogs}
        knownCoordinates={knownCoordinates}
        knownSystems={knownSystems}
        consoleLocked={projectedConsoleLock}
        shipState={shipState}
      />
      {writable && role.id === 'wing-commander' && <AegisFighterWingLaunchPanel />}
      {writable && role.id === 'wing-commander' && (['fighter-wing-alpha', 'fighter-wing-bravo'] as const).flatMap((sourceId) =>
        (['medium-range', 'short-range'] as const).map((range) => <WolfFighterRangeActionPanel
          key={`${sourceId}-${range}`} sourceId={sourceId} range={range} />))}
      {writable && <WolfBoardingDefencePanel />}
      {writable && <WolfBoardingSpecialChoicePanel />}
      <WolfAttackStatusPanel />
    </>;
  }
  return <>
    <FleetSystemsWorkspace
    key={role.id}
    ship={ship}
    role={role}
    galacticCoordinate={projectedCoordinate}
    fuel={projectedFuel}
    damage={projectedDamage}
    damageDraws={damageDraws}
    navigationLogs={projectedNavigationLogs}
    knownCoordinates={knownCoordinates}
    knownSystems={knownSystems}
    consoleLocked={projectedConsoleLock}
    writable={writable}
      shipState={shipState}
    />
    {writable && <WolfBoardingDefencePanel />}
    {writable && <WolfBoardingSpecialChoicePanel />}
    <WolfAttackStatusPanel />
  </>;
}
