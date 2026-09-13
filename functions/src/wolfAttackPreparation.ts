import {
  scheduledWolfAttackComposition,
  type ScheduledWolfAttackComposition,
} from './wolfAttackComposition';
import { WOLF_SHIP_IDS, type WolfShipId } from './wolfShipCatalog';

/** Fleet targets that may be named in a private preparation draft. */
export const WOLF_ATTACK_TARGET_IDS = [
  'aegis',
  'dione',
  'icebreaker',
  'quellon',
  'shepherd',
  'refinery-124',
  'capybara',
] as const;
export type WolfAttackTargetId = typeof WOLF_ATTACK_TARGET_IDS[number];

/**
 * Preparation markers are deliberately a closed vocabulary. They describe
 * printed or configured choices for the later combat engine; they never carry
 * damage, dice results, casualties, or any other combat outcome.
 */
export const WOLF_ATTACK_PREPARATION_MODIFIER_IDS = [
  'wolf-commander-target-reroll',
  'aegis-command-and-control',
  'gorgoneion-force-field-projector',
  'enriched-warheads',
  'pallas-boarding-rerolls',
  'chepu-boarding-support',
  'engineering-service-shuttle-support',
  'aegis-boarding-rerolls',
  'rosal-militia-leader',
  'wolf-commander-boarding-lead',
] as const;
export type WolfAttackPreparationModifierId = typeof WOLF_ATTACK_PREPARATION_MODIFIER_IDS[number];

export const WOLF_ATTACK_TARGET_MODES = ['manual', 'pre-rolled'] as const;
export type WolfAttackTargetMode = typeof WOLF_ATTACK_TARGET_MODES[number];

export interface WolfAttackTargetAssignment {
  readonly cardIndex: number;
  readonly targetShipId: WolfAttackTargetId;
}

export interface WolfAttackPreparationInput {
  readonly turn: number;
  readonly shipIds: readonly string[];
  readonly targetMode: WolfAttackTargetMode;
  readonly targetAssignments: readonly WolfAttackTargetAssignment[];
  readonly modifiers: readonly WolfAttackPreparationModifierId[];
  readonly notes: string;
}

export interface WolfAttackPreparation extends Omit<WolfAttackPreparationInput, 'shipIds'> {
  readonly shipIds: readonly WolfShipId[];
  readonly revision: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTargetId(value: unknown): value is WolfAttackTargetId {
  return typeof value === 'string' &&
    (WOLF_ATTACK_TARGET_IDS as readonly string[]).includes(value);
}

function isModifierId(value: unknown): value is WolfAttackPreparationModifierId {
  return typeof value === 'string' &&
    (WOLF_ATTACK_PREPARATION_MODIFIER_IDS as readonly string[]).includes(value);
}

/** Read a private draft without trusting malformed legacy data. */
export function wolfAttackPreparationState(value: unknown): WolfAttackPreparation | undefined {
  if (!record(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !Number.isSafeInteger(value.turn) || (value.turn as number) < 1 ||
      !WOLF_ATTACK_TARGET_MODES.includes(value.targetMode as WolfAttackTargetMode) ||
      typeof value.notes !== 'string' || !Array.isArray(value.shipIds) ||
      !Array.isArray(value.targetAssignments) || !Array.isArray(value.modifiers)) {
    return undefined;
  }
  const shipIds = value.shipIds.filter((id): id is string => typeof id === 'string');
  if (shipIds.length !== value.shipIds.length) return undefined;
  let composition: ScheduledWolfAttackComposition;
  try {
    composition = scheduledWolfAttackComposition(value.turn as number, shipIds);
  } catch {
    return undefined;
  }
  const targetAssignments = value.targetAssignments.map((assignment) => {
    if (!record(assignment) || !Number.isSafeInteger(assignment.cardIndex) ||
        (assignment.cardIndex as number) < 0 || !isTargetId(assignment.targetShipId)) return undefined;
    return {
      cardIndex: assignment.cardIndex as number,
      targetShipId: assignment.targetShipId,
    };
  });
  const modifiers = value.modifiers.filter(isModifierId);
  if (targetAssignments.some((assignment) => assignment === undefined) ||
      modifiers.length !== value.modifiers.length ||
      new Set(targetAssignments.map((assignment) => assignment?.cardIndex)).size !== targetAssignments.length ||
      targetAssignments.some((assignment) => (assignment?.cardIndex ?? -1) >= composition.shipIds.length)) {
    return undefined;
  }
  return {
    revision: value.revision as number,
    turn: value.turn as number,
    shipIds: composition.shipIds,
    targetMode: value.targetMode as WolfAttackTargetMode,
    targetAssignments: targetAssignments as WolfAttackTargetAssignment[],
    modifiers: [...new Set(modifiers)],
    notes: value.notes,
  };
}

/**
 * Validate the submitted preparation against the current server setup. The
 * later combat prompt owns dice, damage, and declaration; this helper only
 * accepts configured card/target/modifier preparation.
 */
export function validateWolfAttackPreparation(
  input: WolfAttackPreparationInput,
  activeVesselIds: readonly string[],
): Omit<WolfAttackPreparation, 'revision'> {
  if (!Number.isSafeInteger(input.turn) || input.turn < 1) throw new Error('Invalid attack cycle.');
  const composition = scheduledWolfAttackComposition(input.turn, input.shipIds);
  if (!WOLF_ATTACK_TARGET_MODES.includes(input.targetMode)) throw new Error('Invalid targeting mode.');
  if (input.notes.length > 2_000) throw new Error('Preparation notes are too long.');
  const activeTargets = new Set(activeVesselIds.filter((id): id is WolfAttackTargetId => isTargetId(id)));
  if (activeTargets.size === 0) throw new Error('No configured fleet targets are available.');
  const seenCards = new Set<number>();
  const targetAssignments = input.targetAssignments.map((assignment) => {
    if (!Number.isSafeInteger(assignment.cardIndex) || assignment.cardIndex < 0 ||
        assignment.cardIndex >= composition.shipIds.length || seenCards.has(assignment.cardIndex)) {
      throw new Error('Each prepared target must name one unique Wolf card.');
    }
    if (!isTargetId(assignment.targetShipId) || !activeTargets.has(assignment.targetShipId)) {
      throw new Error('The prepared target is not an active fleet vessel.');
    }
    seenCards.add(assignment.cardIndex);
    return { cardIndex: assignment.cardIndex, targetShipId: assignment.targetShipId };
  });
  if (new Set(input.modifiers).size !== input.modifiers.length ||
      input.modifiers.some((modifier) => !isModifierId(modifier))) {
    throw new Error('The preparation contains an unsupported modifier.');
  }
  return {
    turn: input.turn,
    shipIds: composition.shipIds,
    targetMode: input.targetMode,
    targetAssignments,
    modifiers: [...input.modifiers],
    notes: input.notes.trim(),
  };
}

export const DEFAULT_FIRST_TURN_WOLF_SHIP_IDS: readonly WolfShipId[] = Object.freeze([
  ...Array<WolfShipId>(10).fill(WOLF_SHIP_IDS[0]),
  ...Array<WolfShipId>(5).fill(WOLF_SHIP_IDS[1]),
]);
