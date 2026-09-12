import AegisConsoleWorkspace from '@/components/AegisConsoleWorkspace';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import type { ConsoleRole } from '@/data/roles';
import type { Ship } from '@/data/ships';
import { isImplementedAegisRole } from '@/data/aegisConsoles';
import type { DamageDraw, ShipDamageState, ShipNavigationLogs } from '@/types/game';
import type { ShipConsoleProjection } from '@/lib/shipStateProjection';

interface Props {
  readonly ship: Ship;
  readonly role: ConsoleRole | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly damage?: ShipDamageState | undefined;
  readonly damageDraws?: readonly DamageDraw[] | undefined;
  readonly navigationLogs?: ShipNavigationLogs | undefined;
  readonly consoleLocked?: boolean;
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
  consoleLocked = false,
  shipState,
}: Props) {
  if (!role || !ship.roles.some(candidate => candidate.id === role.id)) return null;
  const projectedCoordinate = shipState ? shipState.galacticCoordinate : galacticCoordinate;
  const projectedFuel = shipState ? shipState.resources?.fuel ?? 0 : fuel;
  const projectedDamage = shipState ? shipState.damage : damage;
  const projectedNavigationLogs = shipState ? shipState.navigationLogs : navigationLogs;
  const projectedConsoleLock = shipState ? shipState.consoleLocked : consoleLocked;
  if (ship.workspace === 'aegis' && isImplementedAegisRole(role.id)) {
    return (
      <AegisConsoleWorkspace
        roleId={role.id}
        galacticCoordinate={projectedCoordinate}
        fuel={projectedFuel}
        damage={projectedDamage}
        damageDraws={damageDraws}
        navigationLogs={projectedNavigationLogs}
        consoleLocked={projectedConsoleLock}
        shipState={shipState}
      />
    );
  }
  return <FleetSystemsWorkspace
    key={role.id}
    ship={ship}
    role={role}
    galacticCoordinate={projectedCoordinate}
    fuel={projectedFuel}
    damage={projectedDamage}
    damageDraws={damageDraws}
    navigationLogs={projectedNavigationLogs}
    consoleLocked={projectedConsoleLock}
    shipState={shipState}
  />;
}
