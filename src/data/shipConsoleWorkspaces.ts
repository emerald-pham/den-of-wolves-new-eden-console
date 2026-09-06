import { SHIPS } from './ships';
import { CONSOLE_ROLES, rolesForShip } from '@/data/roles';

export const SCAFFOLDED_CONSOLE_SHIP_IDS = SHIPS.filter((ship) => ship.workspace === 'scaffold')
  .map((ship) => ship.id);

const scaffoldedShipIds = new Set<string>(SCAFFOLDED_CONSOLE_SHIP_IDS);

export const SCAFFOLDED_CONSOLE_ROLE_IDS = SCAFFOLDED_CONSOLE_SHIP_IDS.flatMap(
  (shipId) => rolesForShip(shipId).map((role) => role.id),
);

const scaffoldedRoleIds = new Set(SCAFFOLDED_CONSOLE_ROLE_IDS);

export function isScaffoldedConsoleRole(
  shipId: string | undefined,
  roleId: string | undefined,
): boolean {
  return Boolean(
    shipId && roleId &&
    scaffoldedShipIds.has(shipId) &&
    scaffoldedRoleIds.has(roleId) &&
    CONSOLE_ROLES.some((role) => role.id === roleId && role.shipId === shipId),
  );
}
