import { isSupportedShipPopulation } from './shipPopulation';
import { RESOURCE_IDS, type ShipResourceInventory } from './resources';
import type { MissionRewardResourceId } from './missionCards';
import { isNonRewardMissionEffect } from './missionRewards';

interface RewardAmounts { readonly resources: unknown }
export interface MissionRewardDeliveryInput {
  readonly shipId: string;
  readonly inventory: unknown;
  readonly population: unknown;
  readonly minerals: unknown;
  readonly rewards: readonly RewardAmounts[];
  readonly specialRewards: readonly RewardAmounts[];
}

export interface BoaMissionRewardDeliveryInput extends MissionRewardDeliveryInput {
  readonly boaReclamationOpportunityId: string;
  readonly boaScrapCargo: unknown;
}

export interface BoaMissionRewardDeliveryPlan {
  readonly inventory: ShipResourceInventory;
  readonly population: number;
  readonly minerals: number;
  readonly deltas: Readonly<Partial<Record<MissionRewardResourceId, number>>>;
  readonly boaScrapAwarded: 0 | 1;
  readonly boaScrapCargo: Readonly<{ scrap?: number }>;
}

/** Strict ledger arithmetic: printed minerals remain cargo, never invented ore. */
export function planMissionRewardDelivery(input: MissionRewardDeliveryInput): {
  readonly inventory: ShipResourceInventory;
  readonly population: number;
  readonly minerals: number;
  readonly deltas: Readonly<Partial<Record<MissionRewardResourceId, number>>>;
} | null {
  if (!record(input.inventory) || !amount(input.population) || !amount(input.minerals) ||
      !Array.isArray(input.rewards) || !Array.isArray(input.specialRewards)) return null;
  const inventory = { ...input.inventory };
  for (const id of RESOURCE_IDS) {
    if (id === 'scrap' && inventory[id] === undefined) continue;
    if (!amount(inventory[id])) return null;
  }
  const deltas: Partial<Record<MissionRewardResourceId, number>> = {};
  const validIds = new Set<string>([...RESOURCE_IDS, 'survivors', 'minerals']);
  for (const reward of [...input.rewards, ...input.specialRewards]) {
    if (!record(reward) || !record(reward.resources)) return null;
    for (const [id, value] of Object.entries(reward.resources)) {
      if (!validIds.has(id) || !amount(value)) return null;
      const key = id as MissionRewardResourceId;
      const total = (deltas[key] ?? 0) + value;
      if (!amount(total)) return null;
      deltas[key] = total;
    }
  }
  for (const id of RESOURCE_IDS) {
    if ((deltas[id] ?? 0) === 0) continue;
    const total = (inventory[id] ?? 0) as number;
    if (!amount(total + deltas[id]!)) return null;
    inventory[id] = total + deltas[id]!;
  }
  const population = input.population + (deltas.survivors ?? 0);
  const minerals = input.minerals + (deltas.minerals ?? 0);
  if (!isSupportedShipPopulation(input.shipId, population) || !amount(minerals)) return null;
  return { inventory: inventory as unknown as ShipResourceInventory, population, minerals, deltas };
}

/** Route the one selected Boa reclamation reward to the shuttle's Scrap-only cargo. */
export function planBoaMissionRewardDelivery(
  input: BoaMissionRewardDeliveryInput,
): BoaMissionRewardDeliveryPlan | null {
  if (!record(input) || typeof input.boaReclamationOpportunityId !== 'string' ||
      input.boaReclamationOpportunityId.length === 0 || !Array.isArray(input.rewards)) return null;
  const cargo = input.boaScrapCargo === undefined ? {} : input.boaScrapCargo;
  if (!record(cargo) || Object.keys(cargo).some((key) => key !== 'scrap') ||
      cargo.scrap !== undefined && !amount(cargo.scrap)) return null;
  const matches = input.rewards.filter((reward) => record(reward) &&
    reward.opportunityId === input.boaReclamationOpportunityId);
  if (matches.length !== 1) return null;
  const selected = matches[0] as unknown as Record<string, unknown>;
  const selectedResources = selected.resources;
  const effects = selected.effects;
  // Only a kept non-reward consequence may accompany the Scrap; any reward effect means a broken replacement.
  if (!record(selectedResources) || !Array.isArray(effects) || !effects.every(isNonRewardMissionEffect) ||
      selected.bulkHaulageApplied !== false) return null;
  let boaScrapAwarded: 0 | 1;
  if (selected.branch === 'none') {
    if (Object.keys(selectedResources).length !== 0) return null;
    boaScrapAwarded = 0;
  } else if (selected.branch === 'success' || selected.branch === 'critical') {
    if (Object.keys(selectedResources).length !== 1 || selectedResources.scrap !== 1) return null;
    boaScrapAwarded = 1;
  } else return null;

  const currentScrap = cargo.scrap ?? 0;
  if (boaScrapAwarded === 1 && currentScrap >= Number.MAX_SAFE_INTEGER) return null;
  const filteredRewards = input.rewards.map((reward) => {
    if (!record(reward) || reward.opportunityId !== input.boaReclamationOpportunityId) return reward;
    return { ...reward, resources: {} };
  });
  const delivery = planMissionRewardDelivery({
    shipId: input.shipId,
    inventory: input.inventory,
    population: input.population,
    minerals: input.minerals,
    rewards: filteredRewards,
    specialRewards: input.specialRewards,
  });
  if (!delivery) return null;
  const nextScrap = currentScrap + boaScrapAwarded;
  return {
    ...delivery,
    boaScrapAwarded,
    boaScrapCargo: nextScrap === 0 ? {} : { scrap: nextScrap },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function amount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
