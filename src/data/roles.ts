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

/** Role catalog grows here as playable consoles are introduced. */
export const CONSOLE_ROLES: readonly ConsoleRole[] = [
  { id: 'press-officer', name: 'Press Officer', shipId: 'press' },
  { id: 'admiral', name: 'Admiral', shipId: 'aegis', commandAuthority: 'captain' },
  { id: 'executive-officer', name: 'Executive Officer', shipId: 'aegis', commandAuthority: 'officer' },
  { id: 'wing-commander', name: 'Wing Commander', shipId: 'aegis', commandAuthority: 'officer' },
  { id: 'dione-captain', name: 'Captain', shipId: 'dione', commandAuthority: 'captain' },
  { id: 'dione-engineer', name: 'Engineer', shipId: 'dione', commandAuthority: 'officer' },
  { id: 'dione-president', name: 'President', shipId: 'dione', commandAuthority: 'officer' },
  { id: 'icebreaker-captain', name: 'Captain', shipId: 'icebreaker', commandAuthority: 'captain' },
  { id: 'icebreaker-engineer', name: 'Engineer', shipId: 'icebreaker', commandAuthority: 'officer' },
  { id: 'icebreaker-miner', name: 'Miner', shipId: 'icebreaker', commandAuthority: 'officer' },
  { id: 'quellon-captain', name: 'Captain', shipId: 'quellon', commandAuthority: 'captain' },
  { id: 'quellon-engineer', name: 'Engineer', shipId: 'quellon', commandAuthority: 'officer' },
  { id: 'quellon-explorer', name: 'Explorer', shipId: 'quellon', commandAuthority: 'officer' },
  { id: 'shepherd-captain', name: 'Captain', shipId: 'shepherd', commandAuthority: 'captain' },
  { id: 'shepherd-engineer', name: 'Engineer', shipId: 'shepherd', commandAuthority: 'officer' },
  { id: 'shepherd-scientist', name: 'Scientist', shipId: 'shepherd', commandAuthority: 'officer' },
  { id: 'refinery-124-captain', name: 'Captain', shipId: 'refinery-124', commandAuthority: 'captain' },
  { id: 'refinery-124-engineer', name: 'Engineer', shipId: 'refinery-124', commandAuthority: 'officer' },
  { id: 'refinery-124-pdf-colonel', name: 'P.D.F. Colonel', shipId: 'refinery-124', commandAuthority: 'officer' },
  { id: 'capybara-captain', name: 'Capybara Captain', shipId: 'capybara', commandAuthority: 'captain' },
  { id: 'capybara-recycler', name: 'Capybara Recycler', shipId: 'capybara', commandAuthority: 'officer' },
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
  .filter((role) => !JOINT_ENGINEERING_ROLE_IDS.includes(
    role.id as typeof JOINT_ENGINEERING_ROLE_IDS[number],
  ))
  .map((role) => role.id);

export const DEFAULT_WOLF_ELIGIBLE_ROLE_IDS = CONSOLE_ROLES.map((role) => role.id);

export const rolesForShip = (shipId: string): readonly ConsoleRole[] =>
  CONSOLE_ROLES.filter((role) => role.shipId === shipId);

export const findConsoleRole = (roleId: string | undefined): ConsoleRole | undefined =>
  CONSOLE_ROLES.find((role) => role.id === roleId);
