export const FIGHTER_WING_IDS = [
  'fighter-wing-alpha',
  'fighter-wing-bravo',
] as const;

export type FighterWingId = typeof FIGHTER_WING_IDS[number];

export interface FighterWingCountState {
  readonly count: number;
  readonly revision: number;
}

export type FighterWingCounts = Readonly<Record<FighterWingId, FighterWingCountState>>;

export const FIGHTER_WING_CAPACITY = {
  standard: 4,
  upgraded: 6,
} as const;

export const INITIAL_FIGHTER_WING_COUNTS: FighterWingCounts = {
  'fighter-wing-alpha': { count: 4, revision: 0 },
  'fighter-wing-bravo': { count: 4, revision: 0 },
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Parse only the public, server-owned fighter count projection. */
export function fighterWingCounts(value: unknown): Partial<Record<FighterWingId, FighterWingCountState>> {
  const stored = record(value);
  return Object.fromEntries(FIGHTER_WING_IDS.flatMap((wingId) => {
    const state = record(stored[wingId]);
    const count = nonNegativeInteger(state.count);
    const revision = nonNegativeInteger(state.revision);
    if (count === undefined || count > FIGHTER_WING_CAPACITY.upgraded || revision === undefined) return [];
    return [[wingId, { count, revision }]];
  })) as Partial<Record<FighterWingId, FighterWingCountState>>;
}

export function fighterWingCapacity(upgrades: unknown): 4 | 6 {
  const stored = record(upgrades);
  const aegisUpgrades = Array.isArray(stored.aegis) ? stored.aegis : [];
  return aegisUpgrades.includes('construction-bay') ? FIGHTER_WING_CAPACITY.upgraded : FIGHTER_WING_CAPACITY.standard;
}

export function initialFighterWingCounts(): FighterWingCounts {
  return {
    'fighter-wing-alpha': { ...INITIAL_FIGHTER_WING_COUNTS['fighter-wing-alpha'] },
    'fighter-wing-bravo': { ...INITIAL_FIGHTER_WING_COUNTS['fighter-wing-bravo'] },
  };
}
