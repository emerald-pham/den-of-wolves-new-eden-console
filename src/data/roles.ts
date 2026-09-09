import { SHIPS } from './ships';

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
  readonly id: string;
  readonly name: string;
  readonly shipId: ConsoleShipId;
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
