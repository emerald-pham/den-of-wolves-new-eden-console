import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';

/**
 * Engineering shuttles whose printed operation includes permissioned console
 * dismantling.  Authority for the holder, docking, cycle, and consent actor
 * remains outside this source-certain domain primitive until the production
 * contract records those rules.
 */
export const ENGINEERING_DISMANTLING_CRAFT_IDS = [
  'philia', 'blacksmith', 'chacau', 'ally',
] as const;

export type EngineeringDismantlingCraftId = typeof ENGINEERING_DISMANTLING_CRAFT_IDS[number];

export const PERMISSIONED_DISMANTLING_MATERIALS = 3;

export interface PermissionedDismantlingResult {
  readonly damage: ShipDamageState;
  readonly engineeringMaterials: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEngineeringDismantlingCraftId(value: string): value is EngineeringDismantlingCraftId {
  return (ENGINEERING_DISMANTLING_CRAFT_IDS as readonly string[]).includes(value);
}

function knownDamageState(shipId: string, value: ShipDamageState): void {
  const deck = SHIP_DAMAGE_DECKS[shipId];
  if (!deck || !isRecord(value) || Object.keys(value).some((key) => !['damagedSystemIds', 'destroyed'].includes(key)) ||
      value.destroyed !== false || !Array.isArray(value.damagedSystemIds)) {
    throw new Error('Permissioned dismantling requires a live, canonical target damage state.');
  }
  const knownSystemIds = new Set(deck.map(({ systemId }) => systemId));
  if (value.damagedSystemIds.some((id) => typeof id !== 'string' || !knownSystemIds.has(id)) ||
      new Set(value.damagedSystemIds).size !== value.damagedSystemIds.length) {
    throw new Error('Permissioned dismantling requires canonical target damage identifiers.');
  }
}

/**
 * Apply the source-defined effect of one permissioned dismantling.
 *
 * This function deliberately accepts only the fact that consent was granted;
 * it does not invent which target player may grant it or how long a receipt
 * remains valid.  Those authority and lifetime rules belong to the future
 * server callable once the product contract defines them.
 */
export function resolvePermissionedDismantling(input: Readonly<{
  craftId: string;
  targetShipId: string;
  targetConsoleId: string;
  targetDamage: ShipDamageState;
  engineeringMaterials: number;
  targetPlayerConsented: boolean;
}>): PermissionedDismantlingResult {
  if (!isEngineeringDismantlingCraftId(input.craftId)) {
    throw new Error('Only a printed engineering craft may dismantle a console.');
  }
  if (input.targetPlayerConsented !== true) {
    throw new Error('A target-ship player must consent before dismantling a console.');
  }
  if (!Object.prototype.hasOwnProperty.call(SHIP_DAMAGE_DECKS, input.targetShipId)) {
    throw new Error('Permissioned dismantling requires a target ship with a canonical damage deck.');
  }
  knownDamageState(input.targetShipId, input.targetDamage);
  if (!Number.isSafeInteger(input.engineeringMaterials) || input.engineeringMaterials < 0 ||
      input.engineeringMaterials > Number.MAX_SAFE_INTEGER - PERMISSIONED_DISMANTLING_MATERIALS) {
    throw new Error('Permissioned dismantling requires a safe engineering material count.');
  }
  const targetConsole = SHIP_DAMAGE_DECKS[input.targetShipId]!
    .find(({ systemId }) => systemId === input.targetConsoleId);
  if (!targetConsole || input.targetDamage.damagedSystemIds.includes(input.targetConsoleId)) {
    throw new Error('Choose one undamaged console on the target ship.');
  }
  return {
    damage: {
      damagedSystemIds: [...input.targetDamage.damagedSystemIds, targetConsole.systemId],
      destroyed: false,
    },
    engineeringMaterials: input.engineeringMaterials + PERMISSIONED_DISMANTLING_MATERIALS,
  };
}
