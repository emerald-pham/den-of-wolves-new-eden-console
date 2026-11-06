import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import type { ShipResourceInventory } from './resources';

/** Printed engineering shuttles that can choose console damage for materials. */
export const ENGINEERING_DISMANTLING_CRAFT_IDS = [
  'philia', 'blacksmith', 'chacau', 'ally',
] as const;

export type EngineeringDismantlingCraftId = typeof ENGINEERING_DISMANTLING_CRAFT_IDS[number];

/** Macaw may damage a console instead of repairing it, for one Scrap (PC10-C1). */
export const MACAW_DISMANTLING_CRAFT_ID = 'macaw' as const;
export const MACAW_DISMANTLING_SCRAP_GAIN = 1;
/** Main's Macaw Scrap ledger (P575) is the Capybara inventory. */
export const MACAW_SCRAP_LEDGER_SHIP_ID = 'capybara' as const;

export type PermissionedDismantlingCraftId =
  | EngineeringDismantlingCraftId
  | typeof MACAW_DISMANTLING_CRAFT_ID;

export const PERMISSIONED_DISMANTLING_MATERIAL_GAIN = 3;

/** Engineering craft carry `materialGain`; Macaw carries `scrapGain` instead. */
export interface PermissionedDismantlingProposal {
  readonly craftId: string;
  readonly targetShipId: string;
  readonly targetConsoleId: string;
  readonly targetRevision: number;
  readonly materialGain?: number;
  readonly scrapGain?: number;
}

/**
 * One target-player affirmation for one exact dismantling proposal.
 * The caller persists this receipt and consumes it atomically with the result.
 */
export interface PermissionedDismantlingConsent extends PermissionedDismantlingProposal {
  readonly id: string;
  readonly status: 'granted' | 'revoked' | 'consumed';
  readonly actorUid: string;
}

export interface PermissionedDismantlingResult {
  readonly targetDamage: ShipDamageState;
  readonly targetResources: ShipResourceInventory;
  readonly consumedConsent: PermissionedDismantlingConsent;
  /** Present only for Macaw: the Capybara Scrap ledger after the one-Scrap gain. */
  readonly capybaraScrapAfter?: number;
}

const PROPOSAL_BASE_KEYS = ['craftId', 'targetShipId', 'targetConsoleId', 'targetRevision'];
const RESOURCE_KEYS = ['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isEngineeringDismantlingCraftId(value: string): value is EngineeringDismantlingCraftId {
  return (ENGINEERING_DISMANTLING_CRAFT_IDS as readonly string[]).includes(value);
}

export function isPermissionedDismantlingCraftId(value: string): value is PermissionedDismantlingCraftId {
  return value === MACAW_DISMANTLING_CRAFT_ID || isEngineeringDismantlingCraftId(value);
}

export function isMacawDismantling(value: Readonly<{ craftId: string }>): boolean {
  return value.craftId === MACAW_DISMANTLING_CRAFT_ID;
}

/** The one printed reward field (and its fixed value) for this craft. */
export function dismantlingRewardField(craftId: string): Readonly<{ key: 'materialGain' | 'scrapGain'; value: number }> {
  return craftId === MACAW_DISMANTLING_CRAFT_ID
    ? { key: 'scrapGain', value: MACAW_DISMANTLING_SCRAP_GAIN }
    : { key: 'materialGain', value: PERMISSIONED_DISMANTLING_MATERIAL_GAIN };
}

function requireProposal(value: unknown): PermissionedDismantlingProposal {
  const reward = isRecord(value) && typeof value.craftId === 'string'
    ? dismantlingRewardField(value.craftId) : undefined;
  if (!isRecord(value) || !reward ||
      typeof value.craftId !== 'string' || !isPermissionedDismantlingCraftId(value.craftId) ||
      !hasExactKeys(value, [...PROPOSAL_BASE_KEYS, reward.key]) ||
      typeof value.targetShipId !== 'string' || !Object.prototype.hasOwnProperty.call(SHIP_DAMAGE_DECKS, value.targetShipId) ||
      typeof value.targetConsoleId !== 'string' || !safeNonNegativeInteger(value.targetRevision) ||
      value[reward.key] !== reward.value) {
    throw new Error('Permissioned dismantling proposal is malformed or outside its printed craft and material rules.');
  }
  return {
    craftId: value.craftId,
    targetShipId: value.targetShipId,
    targetConsoleId: value.targetConsoleId,
    targetRevision: value.targetRevision,
    [reward.key]: reward.value,
  };
}

function requireConsent(
  value: unknown,
  proposal: PermissionedDismantlingProposal,
  activeTargetShipPlayerUids: readonly string[],
): PermissionedDismantlingConsent {
  const reward = dismantlingRewardField(proposal.craftId);
  if (!isRecord(value) ||
      !hasExactKeys(value, [...PROPOSAL_BASE_KEYS, reward.key, 'id', 'status', 'actorUid']) ||
      value.status !== 'granted' ||
      typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) ||
      typeof value.actorUid !== 'string' || value.actorUid.length === 0) {
    throw new Error('A current, unused target-ship consent is required before dismantling.');
  }
  if (!activeTargetShipPlayerUids.includes(value.actorUid)) {
    throw new Error('Consent must come from an active player assigned to the target ship.');
  }
  if (value.craftId !== proposal.craftId || value.targetShipId !== proposal.targetShipId ||
      value.targetConsoleId !== proposal.targetConsoleId || value.targetRevision !== proposal.targetRevision ||
      value[reward.key] !== proposal[reward.key]) {
    throw new Error('The consent receipt does not match the proposed action.');
  }
  return {
    id: value.id,
    status: 'granted',
    actorUid: value.actorUid,
    craftId: proposal.craftId,
    targetShipId: proposal.targetShipId,
    targetConsoleId: proposal.targetConsoleId,
    targetRevision: proposal.targetRevision,
    [reward.key]: reward.value,
  };
}

function requireTargetDamage(shipId: string, value: unknown): ShipDamageState {
  const deck = SHIP_DAMAGE_DECKS[shipId];
  if (!deck || !isRecord(value) || !hasExactKeys(value, ['damagedSystemIds', 'destroyed']) ||
      value.destroyed !== false || !Array.isArray(value.damagedSystemIds)) {
    throw new Error('Permissioned dismantling requires a live, canonical target damage state.');
  }
  const knownSystemIds = new Set(deck.map(({ systemId }) => systemId));
  if (value.damagedSystemIds.some((id) => typeof id !== 'string' || !knownSystemIds.has(id)) ||
      new Set(value.damagedSystemIds).size !== value.damagedSystemIds.length) {
    throw new Error('Permissioned dismantling requires canonical target damage identifiers.');
  }
  return { damagedSystemIds: [...value.damagedSystemIds], destroyed: false };
}

function requireTargetResources(value: unknown): ShipResourceInventory {
  if (!isRecord(value) || Object.keys(value).some((key) => !RESOURCE_KEYS.includes(key)) ||
      !['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams'].every((key) => safeNonNegativeInteger(value[key])) ||
      (value.scrap !== undefined && !safeNonNegativeInteger(value.scrap))) {
    throw new Error('Permissioned dismantling requires a safe target resource inventory.');
  }
  return {
    ore: value.ore as number,
    fuel: value.fuel as number,
    food: value.food as number,
    water: value.water as number,
    materials: value.materials as number,
    securityTeams: value.securityTeams as number,
    ...(value.scrap === undefined ? {} : { scrap: value.scrap as number }),
  };
}

/** Resolve one exact target-player-approved dismantling before a transaction commits. */
export function resolvePermissionedDismantling(input: Readonly<{
  proposal: unknown;
  consent: unknown;
  activeTargetShipPlayerUids: readonly string[];
  currentTargetRevision: number;
  targetDamage: unknown;
  targetResources: unknown;
  /** Required for Macaw: the current Capybara Scrap ledger. */
  capybaraScrap?: unknown;
}>): PermissionedDismantlingResult {
  const proposal = requireProposal(input.proposal);
  if (!safeNonNegativeInteger(input.currentTargetRevision) ||
      proposal.targetRevision !== input.currentTargetRevision) {
    throw new Error('The target ship changed after consent; refresh before dismantling.');
  }
  const consent = requireConsent(input.consent, proposal, input.activeTargetShipPlayerUids);
  const targetDamage = requireTargetDamage(proposal.targetShipId, input.targetDamage);
  const damageDeck = SHIP_DAMAGE_DECKS[proposal.targetShipId]!;
  const targetConsole = damageDeck.find(({ systemId }) => systemId === proposal.targetConsoleId);
  if (!targetConsole || targetDamage.damagedSystemIds.includes(proposal.targetConsoleId)) {
    throw new Error('Choose one eligible, undamaged console on the target ship.');
  }
  const targetResources = requireTargetResources(input.targetResources);
  const nextDamage: ShipDamageState = {
    damagedSystemIds: [...targetDamage.damagedSystemIds, targetConsole.systemId],
    destroyed: false,
  };
  const consumedConsent: PermissionedDismantlingConsent = { ...consent, status: 'consumed' };

  if (isMacawDismantling(proposal)) {
    const hostTarget = proposal.targetShipId === MACAW_SCRAP_LEDGER_SHIP_ID;
    const currentScrap = hostTarget ? targetResources.scrap ?? 0 : input.capybaraScrap;
    if (!safeNonNegativeInteger(currentScrap) ||
        (hostTarget && input.capybaraScrap !== currentScrap) ||
        currentScrap > Number.MAX_SAFE_INTEGER - MACAW_DISMANTLING_SCRAP_GAIN) {
      throw new Error('The Capybara Scrap ledger is unavailable or cannot safely receive the one-Scrap gain.');
    }
    const capybaraScrapAfter = currentScrap + MACAW_DISMANTLING_SCRAP_GAIN;
    return {
      targetDamage: nextDamage,
      // Dismantling the host damages and credits the same inventory, so write it once.
      targetResources: hostTarget ? { ...targetResources, scrap: capybaraScrapAfter } : targetResources,
      consumedConsent,
      capybaraScrapAfter,
    };
  }

  if (targetResources.materials > Number.MAX_SAFE_INTEGER - PERMISSIONED_DISMANTLING_MATERIAL_GAIN) {
    throw new Error('The target ship cannot safely receive the dismantling material gain.');
  }
  return {
    targetDamage: nextDamage,
    targetResources: {
      ...targetResources,
      materials: targetResources.materials + PERMISSIONED_DISMANTLING_MATERIAL_GAIN,
    },
    consumedConsent,
  };
}
