export interface AegisShipSystem {
  readonly id: string;
  readonly name: string;
  readonly station: string;
  readonly timing?: 1 | 5 | 6 | 7 | 'ftl' | 'combat' | 'passive';
  readonly baseline: string;
  readonly upgraded?: string;
  readonly damaged: string;
}

export interface AegisCraft {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly assignment: string;
  /** The ship-system id that controls launch eligibility, when applicable. */
  readonly launchSystemId?: string;
}

export const FIGHTER_WING_IDS = [
  'fighter-wing-alpha',
  'fighter-wing-bravo',
] as const;

const ADMIRAL_SYSTEMS: readonly AegisShipSystem[] = [
  {
    id: 'armoured-hull-i',
    name: 'Armoured Hull I',
    station: 'Damage control',
    timing: 'passive',
    baseline: 'Passive armour section. No charge required.',
    damaged: 'Do not lose survivors for this damage. Recycle the damage card after resolution unless the deck is empty.',
  },
  {
    id: 'armoured-hull-ii',
    name: 'Armoured Hull II',
    station: 'Damage control',
    timing: 'passive',
    baseline: 'Passive armour section. No charge required.',
    damaged: 'Do not lose survivors for this damage. Recycle the damage card after resolution unless the deck is empty.',
  },
  {
    id: 'storage',
    name: 'Storage',
    station: 'Maintenance // 1',
    timing: 1,
    baseline: 'Stored resources remain available to the ship and docked shuttlecraft.',
    damaged: 'Each maintenance cycle, discard half of every stored resource, including shuttle cargo. Round losses down.',
  },
  {
    id: 'reactor',
    name: 'Reactor',
    station: 'Maintenance // 5',
    timing: 5,
    baseline: 'Charge up to 5 consoles for this turn.',
    upgraded: 'Charge 6 consoles.',
    damaged: 'Charge 2 consoles.',
  },
  {
    id: 'shuttle-bay-zeta',
    name: 'Shuttle Bay Zeta',
    station: 'Maintenance // 6',
    timing: 6,
    baseline: 'Spend 1 strytium fuel to refuel one docked shuttle.',
    damaged: 'Cannot refuel a shuttle.',
  },
  {
    id: 'shuttle-bay-omega',
    name: 'Shuttle Bay Omega',
    station: 'Maintenance // 7',
    timing: 7,
    baseline: 'Spend 1 strytium fuel to refuel one docked shuttle.',
    damaged: 'Cannot refuel a shuttle.',
  },
  {
    id: 'jump-drive',
    name: 'Jump Drive',
    station: 'Airspace open // FTL',
    timing: 'ftl',
    baseline: 'Short // 2 fuel · Medium // 3 fuel · Long // 6 fuel.',
    upgraded: 'Each jump costs 1 fewer fuel. If damaged, fail only on a roll of 1.',
    damaged: 'A jump fails on a roll of 1–3.',
  },
  {
    id: 'construction-bay',
    name: 'Construction Bay',
    station: 'Charged console',
    timing: 5,
    baseline: 'When charged, spend 1 material per replacement fighter. Add fighters to one wing, up to 4.',
    upgraded: 'Each fighter wing may hold up to 6 fighters.',
    damaged: 'Cannot add fighters.',
  },
];

const WING_CRAFT: readonly AegisCraft[] = [
  {
    id: 'starlight',
    name: 'I.C.S.S. Starlight',
    type: 'Exploration shuttle',
    assignment: 'Scouting and away-mission support',
  },
  {
    id: 'fighter-wing-alpha',
    name: 'Fighter Wing Alpha',
    type: 'Carrier fighter wing',
    assignment: 'Fighter Bay Alpha',
    launchSystemId: 'fighter-bay-alpha',
  },
  {
    id: 'fighter-wing-bravo',
    name: 'Fighter Wing Bravo',
    type: 'Carrier fighter wing',
    assignment: 'Fighter Bay Bravo',
    launchSystemId: 'fighter-bay-bravo',
  },
];

/** Shared ship-system descriptions used by the Wing Commander flight cards. */
export const AEGIS_FIGHTER_BAY_SYSTEMS: Readonly<Record<string, AegisShipSystem>> = {
  'fighter-bay-alpha': {
    id: 'fighter-bay-alpha',
    name: 'Fighter Bay Alpha',
    station: 'Combat // launch eligibility',
    timing: 'combat',
    baseline: 'A charged, undamaged bay permits this fighter wing to launch during a Wolf Attack.',
    damaged: 'Cannot launch fighters.',
  },
  'fighter-bay-bravo': {
    id: 'fighter-bay-bravo',
    name: 'Fighter Bay Bravo',
    station: 'Combat // launch eligibility',
    timing: 'combat',
    baseline: 'A charged, undamaged bay permits this fighter wing to launch during a Wolf Attack.',
    damaged: 'Cannot launch fighters.',
  },
};

export const AEGIS_ROLE_CONSOLES = {
  admiral: {
    systems: ADMIRAL_SYSTEMS,
    jumpCosts: { short: 2, medium: 3, long: 6 },
    reactorCapacity: 5,
    maintenanceSteps: [
      'Storage',
      'Rations',
      'Unrest check',
      'Riot check',
      'Reactor',
      'Shuttle Bay Zeta',
      'Shuttle Bay Omega',
    ],
    rations: {
      food: [0, 3, 5, 8],
      water: [0, 2, 3, 6],
      bonuses: [0, 3, 6, 9],
    },
  },
  'wing-commander': {
    craft: WING_CRAFT,
    scoutRange: 2,
    awayMissionBonus: { explore: 3, salvage: 1 },
    fighterCapacity: { standard: 4, upgraded: 6 },
  },
} as const;

export type ImplementedAegisRoleId = keyof typeof AEGIS_ROLE_CONSOLES;

export function isImplementedAegisRole(roleId: string | undefined): roleId is ImplementedAegisRoleId {
  return roleId === 'admiral' || roleId === 'wing-commander';
}
