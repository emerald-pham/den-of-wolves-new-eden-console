import type { ShipResourceInventory } from './resources';

export const BOA_RECYCLING_LIMIT_PER_CYCLE = 2;

const BOA_RECYCLING_RECIPES = {
  food: { resourceId: 'food', cost: 6 },
  water: { resourceId: 'water', cost: 6 },
  ore: { resourceId: 'ore', cost: 6 },
  materials: { resourceId: 'materials', cost: 3 },
  fuel: { resourceId: 'fuel', cost: 6 },
} as const;

export type BoaRecyclingRecipeId = keyof typeof BOA_RECYCLING_RECIPES;

export interface BoaRecyclingLedger {
  readonly cycle: number;
  readonly revision: number;
  readonly exchangesThisCycle: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** An absent legacy ledger means no Boa exchange has been recorded yet. */
export function parseBoaRecyclingLedger(value: unknown): BoaRecyclingLedger | null {
  if (value === undefined) return { cycle: 0, revision: 0, exchangesThisCycle: 0 };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) =>
    !['cycle', 'revision', 'exchangesThisCycle'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 0 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !Number.isSafeInteger(raw.exchangesThisCycle) ||
      (raw.exchangesThisCycle as number) < 0 ||
      (raw.exchangesThisCycle as number) > BOA_RECYCLING_LIMIT_PER_CYCLE) return null;
  if (raw.cycle === 0) {
    if (raw.revision !== 0 || raw.exchangesThisCycle !== 0) return null;
  } else if ((raw.revision as number) < 1 || (raw.exchangesThisCycle as number) < 1) {
    return null;
  }
  return {
    cycle: raw.cycle as number,
    revision: raw.revision as number,
    exchangesThisCycle: raw.exchangesThisCycle as number,
  };
}

function safeResourceAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function hasSafeInventory(resources: ShipResourceInventory): boolean {
  return safeResourceAmount(resources.ore) &&
    safeResourceAmount(resources.fuel) &&
    safeResourceAmount(resources.food) &&
    safeResourceAmount(resources.water) &&
    safeResourceAmount(resources.materials) &&
    safeResourceAmount(resources.securityTeams) &&
    (resources.scrap === undefined || safeResourceAmount(resources.scrap));
}

/** Resolve one printed Boa trade as a single inventory and cycle-ledger transition. */
export function resolveBoaRecycling(input: Readonly<{
  currentCycle: number;
  expectedCycle: number;
  expectedLedgerRevision: number;
  phase: string;
  fuelled: boolean;
  recipeId: unknown;
  /** The authoritative inventory of the Boa's current docked host. */
  resources: ShipResourceInventory;
  ledger: BoaRecyclingLedger;
}>): Readonly<{
  recipeId: BoaRecyclingRecipeId;
  resourceId: 'food' | 'water' | 'ore' | 'materials' | 'fuel';
  resourceCost: 3 | 6;
  scrapAwarded: 1;
  resources: ShipResourceInventory;
  ledger: BoaRecyclingLedger;
}> {
  if (!Number.isSafeInteger(input.currentCycle) || input.currentCycle < 1) {
    throw new Error('A numbered cycle is required for Boa recycling.');
  }
  if (input.expectedCycle !== input.currentCycle) {
    throw new Error('The Coordination cycle changed; refresh before recycling.');
  }
  if (input.phase !== 'coordination') {
    throw new Error('Boa recycling is available during the Coordination Phase only.');
  }
  if (input.fuelled !== true) {
    throw new Error('Fuel the Boa during the Team Phase before recycling.');
  }
  if (!Number.isSafeInteger(input.expectedLedgerRevision) || input.expectedLedgerRevision < 0 ||
      input.ledger.revision !== input.expectedLedgerRevision ||
      !Number.isSafeInteger(input.ledger.cycle) || input.ledger.cycle < 0 ||
      !Number.isSafeInteger(input.ledger.revision) || input.ledger.revision < 0 ||
      !Number.isSafeInteger(input.ledger.exchangesThisCycle) ||
      input.ledger.exchangesThisCycle < 0 ||
      input.ledger.exchangesThisCycle > BOA_RECYCLING_LIMIT_PER_CYCLE) {
    throw new Error('Boa recycling history changed; refresh before recycling.');
  }
  if (input.ledger.cycle > input.currentCycle ||
      (input.ledger.cycle === 0 &&
        (input.ledger.revision !== 0 || input.ledger.exchangesThisCycle !== 0)) ||
      (input.ledger.cycle > 0 &&
        (input.ledger.revision < 1 || input.ledger.exchangesThisCycle < 1)) ||
      input.ledger.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Boa recycling history is outside the safe cycle range.');
  }
  if (typeof input.recipeId !== 'string' ||
      !Object.prototype.hasOwnProperty.call(BOA_RECYCLING_RECIPES, input.recipeId)) {
    throw new Error('Choose one printed Boa recycling recipe.');
  }
  if (!hasSafeInventory(input.resources)) {
    throw new Error('Boa recycling requires safe resource balances.');
  }

  const exchangesThisCycle = input.ledger.cycle === input.currentCycle
    ? input.ledger.exchangesThisCycle
    : 0;
  if (exchangesThisCycle >= BOA_RECYCLING_LIMIT_PER_CYCLE) {
    throw new Error('The Boa may make at most two exchanges per cycle.');
  }

  const recipeId = input.recipeId as BoaRecyclingRecipeId;
  const recipe = BOA_RECYCLING_RECIPES[recipeId];
  const balance = input.resources[recipe.resourceId];
  const scrap = input.resources.scrap ?? 0;
  if (balance < recipe.cost) {
    throw new Error(`The selected inventory needs ${recipe.cost} ${recipe.resourceId} to recycle.`);
  }
  if (scrap >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Boa recycling would exceed the safe resource range.');
  }

  return {
    recipeId,
    resourceId: recipe.resourceId,
    resourceCost: recipe.cost,
    scrapAwarded: 1,
    resources: {
      ...input.resources,
      [recipe.resourceId]: balance - recipe.cost,
      scrap: scrap + 1,
    },
    ledger: {
      cycle: input.currentCycle,
      revision: input.ledger.revision + 1,
      exchangesThisCycle: exchangesThisCycle + 1,
    },
  };
}
