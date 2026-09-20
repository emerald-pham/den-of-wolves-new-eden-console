import {
  INITIAL_SHIP_RESOURCES,
  RESOURCE_IDS,
  shipResources,
  type ResourceId,
  type ShipResourceInventories,
  type ShipResourceInventory,
} from './resources';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Preserve legacy absent-ledger defaults, but reject malformed persisted
 * values for every ship this transaction would overwrite.
 */
export function requireScavengeInventories(
  value: unknown,
  affectedShipIds: readonly string[],
): ShipResourceInventories {
  if (value !== undefined && !isRecord(value)) {
    throw new Error('The stored resource ledger root is malformed.');
  }
  const stored = value as Record<string, unknown> | undefined;
  for (const shipId of affectedShipIds) {
    const initial = INITIAL_SHIP_RESOURCES[shipId];
    if (!initial) throw new Error('The stored resource ledger names an unsupported ship.');
    const raw = stored?.[shipId];
    if (raw === undefined) continue;
    if (!isRecord(raw)) throw new Error(`The stored resource ledger for ${shipId} is malformed.`);
    const allowed = new Set(Object.keys(initial));
    for (const [resourceId, amount] of Object.entries(raw)) {
      if (!allowed.has(resourceId) || !Number.isSafeInteger(amount) || (amount as number) < 0) {
        throw new Error(`The stored resource ledger for ${shipId} is malformed.`);
      }
    }
  }
  return shipResources(value);
}

export type ShipStoreAllocation = Readonly<Record<string, Partial<Record<ResourceId, number>>>>;

export interface ShipStoreScavengeInput {
  readonly sourceShipId: string;
  readonly allocations: ShipStoreAllocation;
  readonly activeVesselIds: readonly string[];
  readonly destroyedShipIds: readonly string[];
  readonly shipFleetGroupIds: Readonly<Record<string, string>>;
  readonly inventories: ShipResourceInventories;
}

export interface ShipStoreScavengePlan {
  readonly inventories: ShipResourceInventories;
  readonly transfers: readonly {
    readonly recipientShipId: string;
    readonly resources: Readonly<Partial<Record<ResourceId, number>>>;
  }[];
}

function safeAdd(current: number, amount: number): number {
  if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(amount) || amount < 0 ||
      current > Number.MAX_SAFE_INTEGER - amount) {
    throw new Error('A scavenged resource balance would exceed the safe ledger limit.');
  }
  return current + amount;
}

function zeroInventory(inventory: ShipResourceInventory): ShipResourceInventory {
  return {
    ore: 0,
    fuel: 0,
    food: 0,
    water: 0,
    materials: 0,
    securityTeams: 0,
    ...(inventory.scrap === undefined ? {} : { scrap: 0 }),
  };
}

/**
 * Plan one complete reconciliation of a destroyed ship's stored resources.
 * Every positive balance must be assigned exactly once. Recipients must be
 * active, living vessels in the same authoritative fleet group, and a resource
 * can be assigned only when that recipient's typed ledger supports it.
 */
export function planShipStoreScavenge(input: ShipStoreScavengeInput): ShipStoreScavengePlan {
  const source = input.inventories[input.sourceShipId];
  if (!source || !input.activeVesselIds.includes(input.sourceShipId)) {
    throw new Error('The destroyed source ship is not active in this session.');
  }
  if (!input.destroyedShipIds.includes(input.sourceShipId)) {
    throw new Error('Only a destroyed ship can have its stores scavenged.');
  }
  const sourceGroupId = input.shipFleetGroupIds[input.sourceShipId];
  if (!sourceGroupId) throw new Error('The destroyed ship has no authoritative fleet group.');

  const allocationEntries = Object.entries(input.allocations);
  if (allocationEntries.length < 1 || allocationEntries.length > 6) {
    throw new Error('Choose between one and six recipient ships.');
  }

  const totals = Object.fromEntries(RESOURCE_IDS.map((resourceId) => [resourceId, 0])) as Record<ResourceId, number>;
  const next: Record<string, ShipResourceInventory> = { ...input.inventories };
  const transfers = allocationEntries.map(([recipientShipId, allocation]) => {
    const recipient = input.inventories[recipientShipId];
    if (recipientShipId === input.sourceShipId || !recipient ||
        !input.activeVesselIds.includes(recipientShipId) || input.destroyedShipIds.includes(recipientShipId)) {
      throw new Error('Scavenged stores require a different active, living recipient ship.');
    }
    if (input.shipFleetGroupIds[recipientShipId] !== sourceGroupId) {
      throw new Error('Scavenged stores cannot cross an authoritative fleet-group boundary.');
    }
    const resources: Partial<Record<ResourceId, number>> = {};
    for (const [rawResourceId, rawAmount] of Object.entries(allocation)) {
      if (!RESOURCE_IDS.includes(rawResourceId as ResourceId) ||
          !Number.isSafeInteger(rawAmount) || (rawAmount as number) <= 0) {
        throw new Error('Every scavenged resource amount must be a positive safe integer.');
      }
      const resourceId = rawResourceId as ResourceId;
      if (recipient[resourceId] === undefined || source[resourceId] === undefined) {
        throw new Error('That recipient cannot hold the selected resource.');
      }
      const amount = rawAmount as number;
      totals[resourceId] = safeAdd(totals[resourceId], amount);
      resources[resourceId] = amount;
    }
    if (Object.keys(resources).length === 0) {
      throw new Error('Each recipient must receive at least one resource.');
    }
    next[recipientShipId] = Object.fromEntries(Object.entries(recipient).map(([resourceId, current]) => [
      resourceId,
      safeAdd(current, resources[resourceId as ResourceId] ?? 0),
    ])) as unknown as ShipResourceInventory;
    return { recipientShipId, resources };
  });

  for (const resourceId of RESOURCE_IDS) {
    const sourceAmount = source[resourceId];
    if (sourceAmount === undefined) {
      if (totals[resourceId] !== 0) throw new Error('The source ship does not hold that resource.');
      continue;
    }
    if (totals[resourceId] !== sourceAmount) {
      throw new Error('The allocation must reconcile every destroyed-ship resource exactly.');
    }
  }
  next[input.sourceShipId] = zeroInventory(source);
  return { inventories: next, transfers };
}
