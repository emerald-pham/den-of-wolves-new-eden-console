export interface ConsoleRole {
  readonly id: string;
  readonly name: string;
  readonly shipId: 'aegis' | 'press';
}

/** Role catalog grows here as playable consoles are introduced. */
export const CONSOLE_ROLES: readonly ConsoleRole[] = [
  { id: 'press-officer', name: 'Press Officer', shipId: 'press' },
  { id: 'admiral', name: 'Admiral', shipId: 'aegis' },
  { id: 'executive-officer', name: 'Executive Officer', shipId: 'aegis' },
  { id: 'wing-commander', name: 'Wing Commander', shipId: 'aegis' },
];

export const DEFAULT_WOLF_ELIGIBLE_ROLE_IDS = CONSOLE_ROLES.map((role) => role.id);

export const rolesForShip = (shipId: string): readonly ConsoleRole[] =>
  CONSOLE_ROLES.filter((role) => role.shipId === shipId);

export const findConsoleRole = (roleId: string | undefined): ConsoleRole | undefined =>
  CONSOLE_ROLES.find((role) => role.id === roleId);
