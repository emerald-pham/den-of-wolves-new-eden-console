import { ROLE_OWNED_CRAFT_CATALOG } from './craftOwnership';
import { isValidRoleConfiguration, ROLE_IDS } from './roleConfiguration';
import { RESOURCE_IDS, type ResourceId } from './resources';
import { scrapShuttleIdsForRoles } from './shuttlecraft';

export interface WolfSupplySabotageInput {
  readonly coverRoleId: string;
  readonly activeRoleIds: readonly string[];
  readonly shuttleCargo: unknown;
  readonly shuttleId: string;
  readonly resourceId: ResourceId;
}

export interface WolfSupplySabotageResult {
  readonly cargo: Record<string, Record<string, number>>;
  readonly destroyedAmount: number;
  readonly remainingAmount: number;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve one supply sabotage against an exact server-owned cargo ledger.
 * Malformed or unknown stored rows fail closed instead of being projected away.
 */
export function resolveWolfSupplySabotage(
  input: WolfSupplySabotageInput,
): WolfSupplySabotageResult {
  if (!isValidRoleConfiguration(input.activeRoleIds) ||
      !(ROLE_IDS as readonly string[]).includes(input.coverRoleId) ||
      (input.coverRoleId !== 'press-officer' && !input.activeRoleIds.includes(input.coverRoleId))) {
    throw new Error('The active role roster is malformed.');
  }
  const craft = ROLE_OWNED_CRAFT_CATALOG.find((candidate) => candidate.id === input.shuttleId);
  if (!craft || craft.kind !== 'shuttle' || craft.ownerRoleId !== input.coverRoleId) {
    throw new Error('Choose a shuttle controlled by the Wolf cover role.');
  }
  if (!isRecord(input.shuttleCargo)) {
    throw new Error('The shuttle cargo ledger is malformed.');
  }

  const validResources = new Set<string>(RESOURCE_IDS);
  const validShuttles = new Set(ROLE_OWNED_CRAFT_CATALOG
    .filter((candidate) => candidate.kind === 'shuttle')
    .map((candidate) => candidate.id));
  const scrapShuttles = scrapShuttleIdsForRoles(input.activeRoleIds);
  const cargo: Record<string, Record<string, number>> = {};
  for (const [shuttleId, rawInventory] of Object.entries(input.shuttleCargo)) {
    if (!validShuttles.has(shuttleId) || !isRecord(rawInventory)) {
      throw new Error('The shuttle cargo ledger is malformed.');
    }
    const inventory: Record<string, number> = {};
    for (const [resourceId, amount] of Object.entries(rawInventory)) {
      if (!validResources.has(resourceId) || !Number.isSafeInteger(amount) || (amount as number) < 0 ||
          (resourceId === 'scrap' && !scrapShuttles.has(shuttleId))) {
        throw new Error('The shuttle cargo ledger is malformed.');
      }
      inventory[resourceId] = amount as number;
    }
    cargo[shuttleId] = inventory;
  }

  const current = cargo[input.shuttleId]?.[input.resourceId];
  if (!Number.isSafeInteger(current) || (current as number) <= 0) {
    throw new Error('Choose a stored resource on the controlled shuttle.');
  }
  const destroyedAmount = Math.floor((current as number) / 2);
  const remainingAmount = (current as number) - destroyedAmount;
  cargo[input.shuttleId] = { ...cargo[input.shuttleId], [input.resourceId]: remainingAmount };
  return { cargo, destroyedAmount, remainingAmount };
}
