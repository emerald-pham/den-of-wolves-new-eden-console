import {
  scheduledWolfAttackComposition,
} from './wolfAttackComposition';
import { WOLF_SHIP_IDS, type WolfShipId, wolfShipForId } from './wolfShipCatalog';
import { commanderAttackRequirement, wolfThreatComposition, type WolfThreatSiteCode } from './wolfThreatProtocol';

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
export type WolfAttackCompositionKind = WolfThreatSiteCode | 'commander' | 'p-station-repeat';

export interface WolfAttackPreparationCompositionRule {
  readonly kind: WolfAttackCompositionKind;
  readonly targetGroupId: string;
  readonly targetGroupPursuit?: number;
}

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
  readonly compositionKind?: WolfAttackCompositionKind;
  readonly targetGroupId?: string;
  readonly targetGroupPursuit?: number;
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

export interface WolfPreparedComposition {
  readonly shipIds: readonly WolfShipId[];
  readonly counts: Readonly<Record<WolfShipId, number>>;
  readonly damageCapacity: number;
}

/** Validate the private roster under its server-selected ordinary, entry, or Commander rule. */
export function wolfAttackCompositionForRule(
  turn: number,
  shipIds: readonly string[],
  rule?: WolfAttackPreparationCompositionRule,
): WolfPreparedComposition {
  if (!rule) return scheduledWolfAttackComposition(turn, shipIds);
  if (!Number.isSafeInteger(turn) || turn < 1 || !Array.isArray(shipIds) || shipIds.length < 1 || shipIds.length > 24 ||
      !/^fleet-[1-9][0-9]*$/.test(rule.targetGroupId)) {
    throw new Error('Invalid threat attack preparation.');
  }
  if (rule.kind === 'L' || rule.kind === 'M' || rule.kind === 'P') {
    return wolfThreatComposition(rule.kind, shipIds);
  }
  if (rule.kind === 'p-station-repeat') {
    const counts: Record<WolfShipId, number> = {
      'wolf-fighter-wing': 0,
      'wolf-assault-transport': 0,
      'wolf-destroyer': 0,
      'wolf-cruiser': 0,
      'wolf-strikecarrier': 0,
      'wolf-battlestation': 0,
    };
    const canonicalShipIds: WolfShipId[] = [];
    let damageCapacity = 0;
    for (const shipId of shipIds) {
      const ship = typeof shipId === 'string' ? wolfShipForId(shipId) : undefined;
      if (!ship) throw new Error('The P Station repeat composition contains an unknown surviving ship.');
      canonicalShipIds.push(ship.id);
      counts[ship.id] += 1;
      damageCapacity += ship.damageCapacity;
    }
    return Object.freeze({
      shipIds: Object.freeze(canonicalShipIds),
      counts: Object.freeze(counts),
      damageCapacity,
    });
  }
  if (rule.kind !== 'commander' || !Number.isSafeInteger(rule.targetGroupPursuit) ||
      (rule.targetGroupPursuit as number) < 0 || (rule.targetGroupPursuit as number) > 10) {
    throw new Error("The Commander attack dial is not bound to the selected group's current pursuit.");
  }
  const counts: Record<WolfShipId, number> = {
    'wolf-fighter-wing': 0,
    'wolf-assault-transport': 0,
    'wolf-destroyer': 0,
    'wolf-cruiser': 0,
    'wolf-strikecarrier': 0,
    'wolf-battlestation': 0,
  };
  const canonicalShipIds: WolfShipId[] = [];
  let damageCapacity = 0;
  for (const shipId of shipIds) {
    const ship = typeof shipId === 'string' ? wolfShipForId(shipId) : undefined;
    if (!ship) throw new Error('The Commander attack composition contains an unknown ship.');
    canonicalShipIds.push(ship.id);
    counts[ship.id] += 1;
    damageCapacity += ship.damageCapacity;
  }
  if (damageCapacity !== commanderAttackRequirement(rule.targetGroupPursuit as number)) {
    throw new Error('The Commander attack composition must exactly match ten plus the selected group pursuit.');
  }
  return Object.freeze({
    shipIds: Object.freeze(canonicalShipIds),
    counts: Object.freeze(counts),
    damageCapacity,
  });
}

export function wolfAttackCompositionForPreparation(preparation: WolfAttackPreparation): WolfPreparedComposition {
  const rule = preparation.compositionKind
    ? {
      kind: preparation.compositionKind,
      targetGroupId: preparation.targetGroupId ?? '',
      ...(preparation.compositionKind === 'commander' && Number.isSafeInteger(preparation.targetGroupPursuit)
        ? { targetGroupPursuit: preparation.targetGroupPursuit } : {}),
    } as WolfAttackPreparationCompositionRule
    : undefined;
  return wolfAttackCompositionForRule(preparation.turn, preparation.shipIds, rule);
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
  let composition: WolfPreparedComposition;
  const compositionKind = value.compositionKind;
  const targetGroupId = value.targetGroupId;
  const targetGroupPursuit = value.targetGroupPursuit;
  const validKind = compositionKind === 'L' || compositionKind === 'M' ||
    compositionKind === 'P' || compositionKind === 'commander' || compositionKind === 'p-station-repeat';
  if ((compositionKind !== undefined && !validKind) ||
      (compositionKind === undefined && (targetGroupId !== undefined || targetGroupPursuit !== undefined)) ||
      (compositionKind !== undefined && (typeof targetGroupId !== 'string' || !/^fleet-[1-9][0-9]*$/.test(targetGroupId))) ||
      (compositionKind !== 'commander' && targetGroupPursuit !== undefined)) return undefined;
  try {
    composition = wolfAttackCompositionForRule(value.turn as number, shipIds, compositionKind === undefined
      ? undefined
      : {
        kind: compositionKind as WolfAttackCompositionKind,
        targetGroupId: targetGroupId as string,
        ...(Number.isSafeInteger(targetGroupPursuit) ? { targetGroupPursuit: targetGroupPursuit as number } : {}),
      });
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
    ...(validKind && typeof targetGroupId === 'string'
      ? { compositionKind: compositionKind as WolfAttackCompositionKind, targetGroupId } : {}),
    ...(compositionKind === 'commander' && Number.isSafeInteger(targetGroupPursuit)
      ? { targetGroupPursuit: targetGroupPursuit as number } : {}),
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
  rule?: WolfAttackPreparationCompositionRule,
): Omit<WolfAttackPreparation, 'revision'> {
  if (!Number.isSafeInteger(input.turn) || input.turn < 1) throw new Error('Invalid attack cycle.');
  const composition = wolfAttackCompositionForRule(input.turn, input.shipIds, rule);
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
    ...(rule ? {
      compositionKind: rule.kind,
      targetGroupId: rule.targetGroupId,
      ...(rule.targetGroupPursuit === undefined ? {} : { targetGroupPursuit: rule.targetGroupPursuit }),
    } : {}),
  };
}

export const DEFAULT_FIRST_TURN_WOLF_SHIP_IDS: readonly WolfShipId[] = Object.freeze([
  ...Array<WolfShipId>(10).fill(WOLF_SHIP_IDS[0]),
  ...Array<WolfShipId>(5).fill(WOLF_SHIP_IDS[1]),
]);
