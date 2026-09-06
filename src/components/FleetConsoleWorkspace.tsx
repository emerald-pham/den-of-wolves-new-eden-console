import AegisConsoleWorkspace from '@/components/AegisConsoleWorkspace';
import FleetSystemsWorkspace from './FleetSystemsWorkspace';
import type { ConsoleRole } from '@/data/roles';
import type { Ship } from '@/data/ships';
import { isImplementedAegisRole } from '@/data/aegisConsoles';

interface Props {
  readonly ship: Ship;
  readonly role: ConsoleRole | undefined;
  readonly galacticCoordinate: string;
  readonly fuel: number;
}

export default function FleetConsoleWorkspace({ ship, role, galacticCoordinate, fuel }: Props) {
  if (!role || !ship.roles.some(candidate => candidate.id === role.id)) return null;
  if (ship.workspace === 'aegis' && isImplementedAegisRole(role.id)) {
    return <AegisConsoleWorkspace roleId={role.id} galacticCoordinate={galacticCoordinate} fuel={fuel} />;
  }
  return <FleetSystemsWorkspace key={role.id} ship={ship} role={role} galacticCoordinate={galacticCoordinate} fuel={fuel} />;
}
