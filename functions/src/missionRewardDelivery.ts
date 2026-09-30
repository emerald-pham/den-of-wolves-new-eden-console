import { isSupportedShipPopulation } from './shipPopulation';
import { RESOURCE_IDS, type ShipResourceInventory } from './resources';
import type { MissionRewardResourceId } from './missionCards';

interface RewardAmounts { readonly resources: unknown }
export interface MissionRewardDeliveryInput {
  readonly shipId: string;
  readonly inventory: unknown;
  readonly population: unknown;
  readonly minerals: unknown;
  readonly rewards: readonly RewardAmounts[];
  readonly specialRewards: readonly RewardAmounts[];
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function amount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
