import { SHIPS } from './ships';
import type { RoleId, VesselId } from '@/types/identifiers';

export type ConsoleShipId =
  | 'press'
  | 'joint-engineering-union'
  | 'aegis'
  | 'dione'
  | 'icebreaker'
  | 'capybara'
  | 'shepherd'
  | 'quellon'
  | 'refinery-124';

export interface ConsoleRole {
  readonly id: RoleId;
  readonly name: string;
  readonly shipId: VesselId;
  readonly commandAuthority?: 'captain' | 'officer';
}

/** Ship roles come from vessel files; only non-ship stations are registered here. */
export const CONSOLE_ROLES: readonly ConsoleRole[] = [
  { id: 'press-officer', name: 'Press Officer', shipId: 'press' },
  ...SHIPS.flatMap((ship) => ship.roles),
  {
    id: 'joint-engineering-quellon-refinery',
    name: 'Quellon / Refinery Engineer',
    shipId: 'joint-engineering-union',
    commandAuthority: 'officer',
  },
  {
    id: 'joint-engineering-shepherd-icebreaker',
    name: 'Shepherd / Icebreaker Engineer',
    shipId: 'joint-engineering-union',
    commandAuthority: 'officer',
  },
];

export const JOINT_ENGINEERING_ROLE_IDS = [
  'joint-engineering-quellon-refinery',
  'joint-engineering-shepherd-icebreaker',
] as const;

export const DEFAULT_ACTIVE_ROLE_IDS = CONSOLE_ROLES
  .filter((role) => role.id !== 'press-officer' && !JOINT_ENGINEERING_ROLE_IDS.includes(
    role.id as typeof JOINT_ENGINEERING_ROLE_IDS[number],
  ))
  .map((role) => role.id);


export const rolesForShip = (shipId: string): readonly ConsoleRole[] =>
  CONSOLE_ROLES.filter((role) => role.shipId === shipId);

export const findConsoleRole = (roleId: string | undefined): ConsoleRole | undefined =>
  CONSOLE_ROLES.find((role) => role.id === roleId);

/** Resolve the canonical full-ship selector, with a legacy role fallback. */
export function activeFleetShipIds(
  activeRoleIds: readonly string[] | undefined,
  activeVesselIds: readonly string[] | undefined,
): readonly string[] {
  if (activeVesselIds !== undefined) {
    const knownShipIds = new Set<string>(SHIPS.map((ship) => ship.id));
    return activeVesselIds.filter((shipId) => knownShipIds.has(shipId));
  }

  // Legacy setup snapshots used an empty role array while still permitting a
  // GM to inspect every ship (and a held player role to remain visible).
  const activeRoles = new Set(
    activeRoleIds === undefined || activeRoleIds.length === 0
      ? DEFAULT_ACTIVE_ROLE_IDS
      : activeRoleIds,
  );
  const unionShips: Readonly<Record<string, readonly string[]>> = {
    'joint-engineering-quellon-refinery': ['quellon', 'refinery-124'],
    'joint-engineering-shepherd-icebreaker': ['shepherd', 'icebreaker'],
  };
  return SHIPS
    .filter((ship) => ship.roles.some((role) => activeRoles.has(role.id)) ||
      Object.entries(unionShips).some(([roleId, shipIds]) =>
        activeRoles.has(roleId) && shipIds.includes(ship.id)))
    .map((ship) => ship.id);
}
