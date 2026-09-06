import AegisConsoleWorkspace from '@/components/AegisConsoleWorkspace';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import type { ConsoleRole } from '@/data/roles';
import type { Ship } from '@/data/ships';
import { isImplementedAegisRole } from '@/data/aegisConsoles';
import type { ShipDamageState } from '@/types/game';

interface Props {
  readonly ship: Ship;
  readonly role: ConsoleRole | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
  readonly damage?: ShipDamageState | undefined;
}

export default function FleetConsoleWorkspace({ ship, role, galacticCoordinate, fuel, damage }: Props) {
  if (!role || !ship.roles.some(candidate => candidate.id === role.id)) return null;
  if (ship.workspace === 'aegis' && isImplementedAegisRole(role.id)) {
    return (
      <AegisConsoleWorkspace
        roleId={role.id}
        galacticCoordinate={galacticCoordinate}
        fuel={fuel}
        damage={damage}
      />
    );
  }
  return <FleetSystemsWorkspace
    key={role.id}
    ship={ship}
    role={role}
    galacticCoordinate={galacticCoordinate}
    fuel={fuel}
    damage={damage}
  />;
}
