import type { BaseCapybaraCargoState } from '@/types/game';

export const BASE_CAPYBARA_CARGO_TYPES = [
  'securityTeams', 'ore', 'fuel', 'food', 'water', 'materials',
] as const;

const EMPTY_INVENTORY = Object.freeze({
  securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 0,
});

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

/** Parse only the public six-track base Capybara ledger. */
export function parseBaseCapybaraCargoState(value: unknown): BaseCapybaraCargoState | null {
  if (value === undefined) return { revision: 0, inventory: EMPTY_INVENTORY };
  const raw = record(value);
  const inventory = record(raw?.inventory);
  if (!raw || !hasExactKeys(raw, ['revision', 'inventory']) ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !inventory || !hasExactKeys(inventory, BASE_CAPYBARA_CARGO_TYPES) ||
      Object.values(inventory).some((amount) =>
        !Number.isSafeInteger(amount) || (amount as number) < 0)) return null;
  return {
    revision: raw.revision as number,
    inventory: {
      securityTeams: inventory.securityTeams as number,
      ore: inventory.ore as number,
      fuel: inventory.fuel as number,
      food: inventory.food as number,
      water: inventory.water as number,
      materials: inventory.materials as number,
    },
  };
}
