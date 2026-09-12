/** The three printed combat ranges used by every Wolf ship card. */
export const WOLF_ATTACK_RANGES = ['long', 'medium', 'short'] as const;
export type WolfAttackRange = typeof WOLF_ATTACK_RANGES[number];

export const WOLF_SHIP_IDS = [
  'wolf-fighter-wing',
  'wolf-assault-transport',
  'wolf-destroyer',
  'wolf-cruiser',
  'wolf-strikecarrier',
  'wolf-battlestation',
] as const;
export type WolfShipId = typeof WOLF_SHIP_IDS[number];

export type WolfShipDestructionEffect =
  | Readonly<{ kind: 'no-effect' }>
  | Readonly<{ kind: 'target-damage'; amount: number }>
  | Readonly<{ kind: 'cannot-take-damage' }>;

export type WolfShipSurvivalEffect =
  | Readonly<{ kind: 'target-damage'; amount: number }>
  | Readonly<{ kind: 'boarding-parties'; amount: number }>
  | Readonly<{
    kind: 'target-damage-with-fighter-wing-bonus';
    amount: number;
    fighterWingBonus: number;
  }>;

export type WolfShipReturnRule =
  | Readonly<{ kind: 'no-return' }>
  | Readonly<{ kind: 'next-attack' }>;

export interface WolfShipRangeRule {
  readonly canBeDamaged: boolean;
  readonly ifDestroyed: WolfShipDestructionEffect;
}

export interface WolfShipCatalogEntry {
  readonly id: WolfShipId;
  readonly label: string;
  readonly damageCapacity: number;
  readonly ranges: Readonly<Record<WolfAttackRange, WolfShipRangeRule>>;
  readonly ifNotDestroyed: WolfShipSurvivalEffect;
  readonly returnRule: WolfShipReturnRule;
}

const noEffect = (): WolfShipDestructionEffect => ({ kind: 'no-effect' });
const targetDamage = (amount: number): WolfShipDestructionEffect => ({ kind: 'target-damage', amount });

const WOLF_FIGHTER_WING: WolfShipCatalogEntry = {
  id: 'wolf-fighter-wing',
  label: 'Wolf Fighter Wing',
  damageCapacity: 1,
  ranges: {
    long: { canBeDamaged: true, ifDestroyed: noEffect() },
    medium: { canBeDamaged: true, ifDestroyed: noEffect() },
    short: { canBeDamaged: true, ifDestroyed: targetDamage(1) },
  },
  ifNotDestroyed: { kind: 'target-damage', amount: 1 },
  returnRule: { kind: 'next-attack' },
};

const WOLF_ASSAULT_TRANSPORT: WolfShipCatalogEntry = {
  id: 'wolf-assault-transport',
  label: 'Wolf Assault Transport',
  damageCapacity: 2,
  ranges: {
    long: { canBeDamaged: true, ifDestroyed: noEffect() },
    medium: { canBeDamaged: true, ifDestroyed: noEffect() },
    short: { canBeDamaged: true, ifDestroyed: noEffect() },
  },
  ifNotDestroyed: { kind: 'boarding-parties', amount: 4 },
  returnRule: { kind: 'no-return' },
};

const WOLF_DESTROYER: WolfShipCatalogEntry = {
  id: 'wolf-destroyer',
  label: 'Wolf Destroyer',
  damageCapacity: 2,
  ranges: {
    long: { canBeDamaged: true, ifDestroyed: targetDamage(1) },
    medium: { canBeDamaged: true, ifDestroyed: targetDamage(1) },
    short: { canBeDamaged: true, ifDestroyed: targetDamage(1) },
  },
  ifNotDestroyed: { kind: 'target-damage', amount: 2 },
  returnRule: { kind: 'no-return' },
};

const WOLF_CRUISER: WolfShipCatalogEntry = {
  id: 'wolf-cruiser',
  label: 'Wolf Cruiser',
  damageCapacity: 3,
  ranges: {
    long: { canBeDamaged: true, ifDestroyed: noEffect() },
    medium: { canBeDamaged: true, ifDestroyed: targetDamage(1) },
    short: { canBeDamaged: true, ifDestroyed: targetDamage(2) },
  },
  ifNotDestroyed: { kind: 'target-damage', amount: 3 },
  returnRule: { kind: 'no-return' },
};

const WOLF_STRIKECARRIER: WolfShipCatalogEntry = {
  id: 'wolf-strikecarrier',
  label: 'Wolf Fleet Strikecarrier',
  damageCapacity: 5,
  ranges: {
    long: { canBeDamaged: true, ifDestroyed: targetDamage(2) },
    medium: { canBeDamaged: true, ifDestroyed: targetDamage(2) },
    short: { canBeDamaged: true, ifDestroyed: targetDamage(2) },
  },
  ifNotDestroyed: {
    kind: 'target-damage-with-fighter-wing-bonus',
    amount: 2,
    fighterWingBonus: 1,
  },
  returnRule: { kind: 'no-return' },
};

const WOLF_BATTLESTATION: WolfShipCatalogEntry = {
  id: 'wolf-battlestation',
  label: 'Wolf Battlestation',
  damageCapacity: 6,
  ranges: {
    long: { canBeDamaged: true, ifDestroyed: targetDamage(3) },
    medium: { canBeDamaged: true, ifDestroyed: targetDamage(3) },
    short: { canBeDamaged: false, ifDestroyed: { kind: 'cannot-take-damage' } },
  },
  ifNotDestroyed: { kind: 'target-damage', amount: 3 },
  returnRule: { kind: 'next-attack' },
};

/** Canonical server-safe transcription of the routed Wolf ship-card table. */
export const WOLF_SHIP_CATALOG: readonly WolfShipCatalogEntry[] = [
  WOLF_FIGHTER_WING,
  WOLF_ASSAULT_TRANSPORT,
  WOLF_DESTROYER,
  WOLF_CRUISER,
  WOLF_STRIKECARRIER,
  WOLF_BATTLESTATION,
];

export function wolfShipForId(id: string): WolfShipCatalogEntry | undefined {
  return WOLF_SHIP_CATALOG.find((ship) => ship.id === id);
}

export function wolfShipsReturningNextAttack(): readonly WolfShipId[] {
  return WOLF_SHIP_CATALOG
    .filter((ship) => ship.returnRule.kind === 'next-attack')
    .map((ship) => ship.id);
}
