import { randomInt } from 'node:crypto';
import {
  drawShipDamage,
  type ShipDamageState,
  type DamageCard,
  type DamageDeckExhaustionPolicy,
} from './shipDamage';
import { populationChange } from './shipPopulation';
import {
  WOLF_ATTACK_RANGES,
  wolfShipForId,
  type WolfShipId,
  type WolfShipSurvivalEffect,
} from './wolfShipCatalog';
import type { ScheduledWolfAttackComposition } from './wolfAttackComposition';
import { turnPhaseState, type TurnPhase } from './turnZero';

/** The target ring printed by the base Wolf attack rules. */
export const CORE_WOLF_TARGET_RING = [
  'aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124',
] as const;
/** Expansion targeting adds the full Capybara as the seventh printed target.
 * The d8's eighth face is handled as a server reroll before this ring maps it. */
export const EXPANDED_WOLF_TARGET_RING = [...CORE_WOLF_TARGET_RING, 'capybara'] as const;
export type WolfFleetTargetId = typeof EXPANDED_WOLF_TARGET_RING[number];
export type WolfTargetRing = readonly WolfFleetTargetId[];

export const WOLF_ATTACK_STEPS = [
  'targeting', 'long-range', 'medium-range', 'short-range', 'boarding',
] as const;
export type WolfAttackStep = typeof WOLF_ATTACK_STEPS[number];
export type WolfCombatRange = Exclude<WolfAttackStep, 'targeting' | 'boarding'>;

/**
 * A server-only source of bounded entropy. Callers must never pass dice or
 * targets from a client request; the callable owns this dependency and only
 * injects a deterministic source in unit tests.
 */
export type WolfRandomInt = (upperBound: number) => number;

const secureRandomInt: WolfRandomInt = (upperBound) => randomInt(upperBound);

function assertRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Reflect.ownKeys(value).forEach(key => {
    const child = (value as Record<PropertyKey, unknown>)[key];
    if (typeof child === 'object' && child !== null) deepFreeze(child);
  });
  return value;
}

function boundedRandomInt(random: WolfRandomInt, upperBound: number): number {
  const value = random(upperBound);
  if (!Number.isSafeInteger(value) || value < 0 || value >= upperBound) {
    throw new Error('The server randomness source returned an invalid sample.');
  }
  return value;
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
}

function uniqueStrings(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates.`);
}

function targetRingIsValid(ring: WolfTargetRing): void {
  if (ring.length < 1 || new Set(ring).size !== ring.length) {
    throw new Error('The Wolf target ring must contain unique targets.');
  }
}

/** Convert a d6/d8 result into the configured target ring. */
export function wolfTargetForDie(die: number, ring: WolfTargetRing = CORE_WOLF_TARGET_RING): WolfFleetTargetId {
  targetRingIsValid(ring);
  if (!Number.isSafeInteger(die) || die < 1 || die > ring.length) {
    throw new Error('The target die is outside the configured target ring.');
  }
  return ring[die - 1]!;
}

/** Apply a printed target-number modifier with the documented wraparound. */
export function shiftWolfTargetDie(
  die: number,
  shift: number,
  ring: WolfTargetRing = CORE_WOLF_TARGET_RING,
): number {
  targetRingIsValid(ring);
  if (!Number.isSafeInteger(die) || die < 1 || die > ring.length) {
    throw new Error('The target die is outside the configured target ring.');
  }
  if (!Number.isSafeInteger(shift)) throw new Error('The target shift must be an integer.');
  return ((die - 1 + shift) % ring.length + ring.length) % ring.length + 1;
}

export interface WolfTargetingModifierInput {
  /** Zero-based final-roster indexes, chosen by an authorized Commander. */
  readonly commanderRerollIndexes?: readonly number[];
  /** Zero-based final-roster index redirected by authorized Command and Control. */
  readonly commandAndControlRedirectIndex?: number;
  /** Server-authorized target-number shifts, applied after a reroll and before redirect. */
  readonly targetShifts?: Readonly<Record<string, number>>;
}

export interface WolfTargetingRollReceipt {
  readonly rosterIndex: number;
  readonly shipId: WolfShipId;
  readonly initialDie: number;
  readonly rerollDie?: number;
  readonly shiftedDie?: number;
  readonly finalDie: number;
  readonly target: WolfFleetTargetId;
  readonly printedRerolls?: readonly number[];
  readonly commanderPrintedRerolls?: readonly number[];
  readonly modifiers: readonly ('commander-reroll' | 'target-shift' | 'command-and-control-redirect')[];
}

export interface WolfTargetingReceipt {
  readonly ring: WolfTargetRing;
  readonly rolls: readonly WolfTargetingRollReceipt[];
  readonly modifierOrder: readonly ['commander-reroll', 'target-shift', 'command-and-control-redirect'];
}

function validateRosterIndexes(indexes: readonly number[], rosterLength: number, label: string): void {
  uniqueStrings(indexes.map(String), label);
  indexes.forEach(index => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= rosterLength) {
      throw new Error(`${label} contains an out-of-range roster index.`);
    }
  });
}

/**
 * Roll one server-owned die per Wolf ship. Staged GM target assignments are
 * intentionally absent from this API: preparation is a private hint, while
 * this final targeting result is generated here in the printed order.
 */
export function resolveWolfTargeting(
  composition: ScheduledWolfAttackComposition,
  modifiers: WolfTargetingModifierInput = {},
  ring: WolfTargetRing = CORE_WOLF_TARGET_RING,
  random: WolfRandomInt = secureRandomInt,
): WolfTargetingReceipt {
  targetRingIsValid(ring);
  const expansionRing = ring.includes('capybara');
  const dieUpperBound = expansionRing ? 8 : ring.length;
  const rollConfiguredDie = (): { readonly die: number; readonly printedRerolls: readonly number[] } => {
    const printedRerolls: number[] = [];
    let die = boundedRandomInt(random, dieUpperBound) + 1;
    while (expansionRing && die === 8) {
      printedRerolls.push(die);
      die = boundedRandomInt(random, dieUpperBound) + 1;
    }
    return { die, printedRerolls };
  };
  const rerollIndexes = modifiers.commanderRerollIndexes ?? [];
  validateRosterIndexes(rerollIndexes, composition.shipIds.length, 'Commander rerolls');
  const redirectIndex = modifiers.commandAndControlRedirectIndex;
  if (redirectIndex !== undefined) {
    validateRosterIndexes([redirectIndex], composition.shipIds.length, 'Command and Control redirect');
  }
  const targetShifts = modifiers.targetShifts ?? {};
  Object.entries(targetShifts).forEach(([key, shift]) => {
    const index = Number(key);
    validateRosterIndexes([index], composition.shipIds.length, 'Target shifts');
    if (!Number.isSafeInteger(shift)) throw new Error('Target shifts must be integers.');
  });
  const rerolls = new Set(rerollIndexes);
  const rolls = composition.shipIds.map((shipId, rosterIndex): WolfTargetingRollReceipt => {
    const initial = rollConfiguredDie();
    const initialDie = initial.die;
    const commanderReroll = rerolls.has(rosterIndex) ? rollConfiguredDie() : undefined;
    const rerollDie = commanderReroll?.die;
    const shiftedDie = targetShifts[String(rosterIndex)] === undefined
      ? undefined
      : shiftWolfTargetDie(rerollDie ?? initialDie, targetShifts[String(rosterIndex)]!, ring);
    const finalDie = shiftedDie ?? rerollDie ?? initialDie;
    const modifiersApplied: WolfTargetingRollReceipt['modifiers'][number][] = [];
    if (rerollDie !== undefined) modifiersApplied.push('commander-reroll');
    if (shiftedDie !== undefined) modifiersApplied.push('target-shift');
    if (redirectIndex === rosterIndex) {
      modifiersApplied.push('command-and-control-redirect');
    }
    return {
      rosterIndex,
      shipId,
      initialDie,
      ...(rerollDie === undefined ? {} : { rerollDie }),
      ...(shiftedDie === undefined ? {} : { shiftedDie }),
      finalDie,
      target: redirectIndex === rosterIndex ? 'aegis' : wolfTargetForDie(finalDie, ring),
      ...(initial.printedRerolls.length === 0 ? {} : { printedRerolls: initial.printedRerolls }),
      ...(commanderReroll && commanderReroll.printedRerolls.length > 0
        ? { commanderPrintedRerolls: commanderReroll.printedRerolls } : {}),
      modifiers: modifiersApplied,
    };
  });
  return {
    ring: [...ring],
    rolls,
    modifierOrder: ['commander-reroll', 'target-shift', 'command-and-control-redirect'],
  };
}

export interface WolfCombatShip {
  readonly instanceId: string;
  readonly shipId: WolfShipId;
  readonly target: WolfFleetTargetId;
  readonly damageTaken: number;
  readonly destroyed: boolean;
}

export function wolfCombatRoster(targeting: WolfTargetingReceipt): readonly WolfCombatShip[] {
  return targeting.rolls.map((roll) => ({
    instanceId: `${roll.rosterIndex}:${roll.shipId}`,
    shipId: roll.shipId,
    target: roll.target,
    damageTaken: 0,
    destroyed: false,
  }));
}

export interface WolfDicePool {
  readonly sides: number;
  readonly count: number;
  readonly successAt: number;
  readonly damagePerSuccess: number;
}

export interface WolfRangeAction {
  readonly actionId: string;
  readonly sourceId: string;
  readonly range: WolfCombatRange;
  readonly dice?: WolfDicePool;
  readonly fixedDamage?: number;
  readonly maxTargets: number;
}

export interface WolfRangeAssignment {
  readonly actionId: string;
  /** Targets are selected after the server roll; dice and damage are never accepted. */
  readonly targetInstanceIds: readonly string[];
}

export type WolfRangeTargetShiftSourceId =
  | 'aegis-alpha-wing'
  | 'aegis-bravo-wing'
  | 'maliades'
  | 'pdf-escort-wing';

export interface WolfRangeTargetShiftChoice {
  readonly sourceId: WolfRangeTargetShiftSourceId;
  /** Stable choice position: fighter index for a wing, zero for Maliades. */
  readonly choiceIndex: number;
  readonly rosterIndex: number;
  readonly shift: -1 | 1;
}

export interface WolfRangeTargetShift extends WolfRangeTargetShiftChoice {
  readonly fromDie: number;
  readonly toDie: number;
}

export type WolfRangeTargetShiftPlan = Readonly<{
  choices: readonly WolfRangeTargetShiftChoice[];
  ring: WolfTargetRing;
}>;

export interface WolfDiceReceipt {
  readonly actionId: string;
  readonly sourceId: string;
  readonly range: WolfCombatRange;
  readonly rolls: readonly number[];
  readonly successes: number;
  readonly damage: number;
}

export interface WolfRangeReceipt {
  readonly range: WolfCombatRange;
  /** Entire committed roster in stable order before this range's shifts or damage. */
  readonly targetSnapshot: readonly Readonly<{ instanceId: string; target: WolfFleetTargetId }>[];
  readonly dice: readonly WolfDiceReceipt[];
  readonly assignments: readonly WolfRangeAssignment[];
  /** Ordered server-resolved Medium fighter target changes. */
  readonly targetShifts: readonly WolfRangeTargetShift[];
  /** Successful hits that had no distinct live, range-legal contact to receive them. */
  readonly unusedHitsByAction: readonly Readonly<{ actionId: string; count: number }>[];
  readonly damageByInstance: Readonly<Record<string, number>>;
  readonly destroyedInstanceIds: readonly string[];
  readonly destructionDamageByTarget: Readonly<Record<WolfFleetTargetId, number>>;
}

/** Resolve the printed ±1 target-number operation for one range source. */
export function applyWolfRangeTargetShift(
  sourceId: WolfRangeTargetShiftSourceId,
  currentDie: number,
  shift: -1 | 1,
  ring: WolfTargetRing = CORE_WOLF_TARGET_RING,
): number {
  if (!['aegis-alpha-wing', 'aegis-bravo-wing', 'maliades', 'pdf-escort-wing'].includes(sourceId)) {
    throw new Error('Unknown Wolf range target-shift source.');
  }
  if (shift !== -1 && shift !== 1) throw new Error('Wolf target shifts must be -1 or 1.');
  const sixTargetEndpointRing = ring.length === CORE_WOLF_TARGET_RING.length;
  const normalizedDie = sixTargetEndpointRing && currentDie === 0 ? ring.length
    : sixTargetEndpointRing && currentDie === 7 ? 1 : currentDie;
  const shiftedDie = shiftWolfTargetDie(normalizedDie, shift, ring);
  if (sixTargetEndpointRing && normalizedDie === 1 && shift === -1) return 0;
  if (sixTargetEndpointRing && normalizedDie === ring.length && shift === 1) return 7;
  return shiftedDie;
}

/** Map a printed target number back to the target currently represented by it. */
export function wolfTargetForRangeTargetNumber(
  sourceId: WolfRangeTargetShiftSourceId,
  targetNumber: number,
  ring: WolfTargetRing = CORE_WOLF_TARGET_RING,
): WolfFleetTargetId {
  if (!['aegis-alpha-wing', 'aegis-bravo-wing', 'maliades', 'pdf-escort-wing'].includes(sourceId)) {
    throw new Error('Unknown Wolf range target-shift source.');
  }
  if (ring.length === CORE_WOLF_TARGET_RING.length && targetNumber === 0) {
    if (!ring.includes('refinery-124')) throw new Error('Refinery 124 is outside the configured Wolf target ring.');
    return 'refinery-124';
  }
  if (ring.length === CORE_WOLF_TARGET_RING.length && targetNumber === 7) {
    if (!ring.includes('aegis')) throw new Error('AEGIS is outside the configured Wolf target ring.');
    return 'aegis';
  }
  return wolfTargetForDie(targetNumber, ring);
}

/** Return the effective die for a current target when a range source is about to shift it. */
export function wolfTargetNumberForRangeSource(
  sourceId: WolfRangeTargetShiftSourceId,
  target: WolfFleetTargetId,
  ring: WolfTargetRing = CORE_WOLF_TARGET_RING,
): number {
  if (!['aegis-alpha-wing', 'aegis-bravo-wing', 'maliades', 'pdf-escort-wing'].includes(sourceId)) {
    throw new Error('Unknown Wolf range target-shift source.');
  }
  const index = ring.indexOf(target);
  if (index < 0) throw new Error('The current Wolf target is outside the configured target ring.');
  return index + 1;
}

/**
 * Apply a server-owned set of fighter shifts to the current range targets.
 * The target dice are carried forward independently from the original targeting receipt.
 */
export function resolveWolfRangeTargetShifts(input: Readonly<{
  roster: readonly WolfCombatShip[];
  currentDice: readonly number[];
  choices: readonly WolfRangeTargetShiftChoice[];
  ring: WolfTargetRing;
}>): Readonly<{
  roster: readonly WolfCombatShip[];
  currentDice: readonly number[];
  targetShifts: readonly WolfRangeTargetShift[];
}> {
  targetRingIsValid(input.ring);
  if (!Array.isArray(input.roster) || !Array.isArray(input.currentDice) ||
      input.currentDice.length !== input.roster.length || !Array.isArray(input.choices)) {
    throw new Error('Wolf range shifts require a matching current roster and target-die list.');
  }
  input.currentDice.forEach((die) => {
    if (!Number.isSafeInteger(die) || die < 0 || die > 7) {
      throw new Error('A current Wolf target die is outside the supported range.');
    }
  });
  const seenChoices = new Set<string>();
  for (const choice of input.choices) {
    if (!choice || !['aegis-alpha-wing', 'aegis-bravo-wing', 'maliades', 'pdf-escort-wing'].includes(choice.sourceId) ||
        !Number.isSafeInteger(choice.choiceIndex) || choice.choiceIndex < 0 ||
        !Number.isSafeInteger(choice.rosterIndex) || choice.rosterIndex < 0 || choice.rosterIndex >= input.roster.length ||
        (choice.shift !== -1 && choice.shift !== 1) ||
        (choice.sourceId === 'maliades' && choice.choiceIndex !== 0)) {
      throw new Error('A Wolf range target shift choice is malformed.');
    }
    if (input.roster[choice.rosterIndex]?.destroyed) {
      throw new Error('A destroyed Wolf ship cannot have its target shifted.');
    }
    const key = `${choice.sourceId}:${choice.choiceIndex}`;
    if (seenChoices.has(key)) throw new Error('A fighter choice may shift at most one Wolf target per range.');
    seenChoices.add(key);
  }
  const orderedChoices = [...input.choices].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId) || left.choiceIndex - right.choiceIndex);
  const currentDice = [...input.currentDice];
  const roster = [...input.roster];
  const targetShifts = orderedChoices.map((choice): WolfRangeTargetShift => {
    const fromDie = currentDice[choice.rosterIndex]!;
    const toDie = applyWolfRangeTargetShift(choice.sourceId, fromDie, choice.shift, input.ring);
    const target = wolfTargetForRangeTargetNumber(choice.sourceId, toDie, input.ring);
    currentDice[choice.rosterIndex] = toDie;
    roster[choice.rosterIndex] = { ...roster[choice.rosterIndex]!, target };
    return { ...choice, fromDie, toDie };
  });
  return deepFreeze({ roster, currentDice, targetShifts });
}

/** Replay one receipt's ordered fighter shifts from its immutable pre-range target snapshot. */
export function replayWolfRangeTargetSnapshot(
  targetSnapshot: readonly Readonly<{ instanceId: string; target: WolfFleetTargetId }>[],
  targetShifts: readonly WolfRangeTargetShift[],
  ring: WolfTargetRing,
): readonly Readonly<{ instanceId: string; target: WolfFleetTargetId }>[] {
  targetRingIsValid(ring);
  if (!Array.isArray(targetSnapshot) || !Array.isArray(targetShifts) ||
      targetSnapshot.some((entry) => !entry || typeof entry.instanceId !== 'string' || !entry.instanceId ||
        !ring.includes(entry.target)) || new Set(targetSnapshot.map(({ instanceId }) => instanceId)).size !== targetSnapshot.length) {
    throw new Error('A Wolf range target snapshot is malformed for its configured ring.');
  }
  if (targetShifts.length === 0) {
    return deepFreeze(targetSnapshot.map(({ instanceId, target }) => ({ instanceId, target })));
  }
  const sourceId = targetShifts[0]!.sourceId;
  if (!['aegis-alpha-wing', 'aegis-bravo-wing', 'maliades', 'pdf-escort-wing'].includes(sourceId)) {
    throw new Error('A Wolf range target shift source is malformed.');
  }
  const currentDice = targetSnapshot.map(({ target }) => wolfTargetNumberForRangeSource(sourceId, target, ring));
  const ordered = [...targetShifts].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId) || left.choiceIndex - right.choiceIndex);
  if (JSON.stringify(ordered) !== JSON.stringify(targetShifts)) {
    throw new Error('Wolf range target shifts must be in canonical source and choice order.');
  }
  const seenChoices = new Set<string>();
  for (const entry of targetShifts) {
    if (!entry || !['aegis-alpha-wing', 'aegis-bravo-wing', 'maliades', 'pdf-escort-wing'].includes(entry.sourceId) ||
        !Number.isSafeInteger(entry.choiceIndex) || entry.choiceIndex < 0 ||
        !Number.isSafeInteger(entry.rosterIndex) || entry.rosterIndex < 0 || entry.rosterIndex >= targetSnapshot.length ||
        (entry.shift !== -1 && entry.shift !== 1) ||
        (entry.sourceId === 'maliades' && entry.choiceIndex !== 0) ||
        !Number.isSafeInteger(entry.fromDie) || entry.fromDie < 0 || entry.fromDie > 7 ||
        !Number.isSafeInteger(entry.toDie) || entry.toDie < 0 || entry.toDie > 7) {
      throw new Error('A Wolf range target shift receipt is malformed.');
    }
    const key = `${entry.sourceId}:${entry.choiceIndex}`;
    if (seenChoices.has(key)) throw new Error('A fighter choice may shift at most one Wolf target per range.');
    seenChoices.add(key);
    const currentDie = currentDice[entry.rosterIndex]!;
    if (entry.fromDie !== currentDie ||
        entry.toDie !== applyWolfRangeTargetShift(entry.sourceId, currentDie, entry.shift, ring)) {
      throw new Error('A Wolf range target shift does not replay from its target snapshot.');
    }
    currentDice[entry.rosterIndex] = entry.toDie;
  }
  return deepFreeze(targetSnapshot.map(({ instanceId }, index) => ({
    instanceId,
    target: wolfTargetForRangeTargetNumber(sourceId, currentDice[index]!, ring),
  })));
}

/** Private, immutable dice samples committed before any player target assignment. */
export interface WolfRangeLockedRoll {
  readonly actionId: string;
  readonly sourceId: string;
  readonly range: WolfCombatRange;
  readonly rolls: readonly number[];
  readonly successes: number;
  readonly damage: number;
  readonly damagePerHit: number;
}

export interface WolfRangeRollLock {
  readonly range: WolfCombatRange;
  readonly dice: readonly WolfRangeLockedRoll[];
}

function validateDicePool(pool: WolfDicePool): void {
  if (!Number.isSafeInteger(pool.sides) || pool.sides < 2 || pool.sides > 1000) {
    throw new Error('Dice sides must be 2..1000.');
  }
  if (!Number.isSafeInteger(pool.count) || pool.count < 1 || pool.count > 100) {
    throw new Error('Dice count must be 1..100.');
  }
  if (!Number.isSafeInteger(pool.successAt) || pool.successAt < 1 || pool.successAt > pool.sides) {
    throw new Error('The dice success threshold is outside the dice range.');
  }
  requirePositiveInteger(pool.damagePerSuccess, 'damagePerSuccess');
}

function rollPool(pool: WolfDicePool, random: WolfRandomInt): { rolls: readonly number[]; successes: number; damage: number } {
  validateDicePool(pool);
  const rolls = Array.from({ length: pool.count }, () => boundedRandomInt(random, pool.sides) + 1);
  const successes = rolls.filter(roll => roll >= pool.successAt).length;
  return { rolls, successes, damage: successes * pool.damagePerSuccess };
}

/** Roll every selected action in a range together, before the actor assigns any target. */
export function lockWolfRangeActions(
  range: WolfCombatRange,
  actions: readonly WolfRangeAction[],
  random: WolfRandomInt = secureRandomInt,
): WolfRangeRollLock {
  if (range !== 'long-range' && range !== 'medium-range' && range !== 'short-range') {
    throw new Error('Unknown Wolf combat range.');
  }
  const selected = actions.filter(action => action.range === range);
  uniqueStrings(selected.map(action => action.actionId), 'Wolf range action IDs');
  const dice = selected.map((action): WolfRangeLockedRoll => {
    if (!action.actionId || !action.sourceId || action.range !== range ||
        !Number.isSafeInteger(action.maxTargets) || action.maxTargets < 1) {
      throw new Error('Wolf range actions require stable IDs and a valid target limit.');
    }
    const hasDice = action.dice !== undefined;
    const hasFixed = action.fixedDamage !== undefined;
    if (hasDice === hasFixed) throw new Error('A Wolf action must define either dice or fixed damage.');
    if (hasFixed) {
      requirePositiveInteger(action.fixedDamage!, 'fixedDamage');
      return {
        actionId: action.actionId,
        sourceId: action.sourceId,
        range,
        rolls: [],
        successes: 1,
        damage: action.fixedDamage!,
        damagePerHit: action.fixedDamage!,
      };
    }
    const pool = action.dice!;
    const rolled = rollPool(pool, random);
    return {
      actionId: action.actionId,
      sourceId: action.sourceId,
      range,
      rolls: [...rolled.rolls],
      successes: rolled.successes,
      damage: rolled.damage,
      damagePerHit: pool.damagePerSuccess,
    };
  });
  return deepFreeze({ range, dice });
}

function rosterById(roster: readonly WolfCombatShip[]): Map<string, WolfCombatShip> {
  const map = new Map<string, WolfCombatShip>();
  roster.forEach(ship => {
    if (map.has(ship.instanceId)) throw new Error('Wolf combat instance IDs must be unique.');
    map.set(ship.instanceId, ship);
  });
  return map;
}

/** Contacts that can receive hits at the start of the simultaneous range. */
export function wolfRangeLegalTargetInstanceIds(
  range: WolfCombatRange,
  roster: readonly WolfCombatShip[],
): readonly string[] {
  const live = roster.filter(ship => !ship.destroyed);
  return live
    .filter(ship => range !== 'short-range' || ship.shipId !== 'wolf-battlestation')
    .map(({ instanceId }) => instanceId);
}

/** Fixed targets chosen before dice cannot rely on unknown aggregate Wing coverage. */
export function wolfRangeFixedTargetInstanceIds(
  range: WolfCombatRange,
  roster: readonly WolfCombatShip[],
): readonly string[] {
  if (range === 'short-range') {
    const wings = roster.filter((ship) => !ship.destroyed && ship.shipId === 'wolf-fighter-wing');
    if (wings.length > 0) return wings.map(({ instanceId }) => instanceId);
  }
  return wolfRangeLegalTargetInstanceIds(range, roster);
}

function damageRecord(): Record<WolfFleetTargetId, number> {
  return Object.fromEntries(EXPANDED_WOLF_TARGET_RING.map(id => [id, 0])) as Record<WolfFleetTargetId, number>;
}

function addFleetDamage(record: Record<WolfFleetTargetId, number>, target: WolfFleetTargetId, amount: number): void {
  requireNonNegativeInteger(amount, 'damage');
  record[target] += amount;
}

/** Resolve one range after all its server rolls have been taken. */
export function resolveWolfRange(
  range: WolfCombatRange,
  actions: readonly WolfRangeAction[],
  assignments: readonly WolfRangeAssignment[],
  roster: readonly WolfCombatShip[],
  random: WolfRandomInt = secureRandomInt,
  targetShiftPlan?: WolfRangeTargetShiftPlan,
): { readonly roster: readonly WolfCombatShip[]; readonly receipt: WolfRangeReceipt } {
  if (range !== 'long-range' && range !== 'medium-range' && range !== 'short-range') {
    throw new Error('Unknown Wolf combat range.');
  }
  const rangeActions = actions.filter(action => action.range === range);
  const actionIds = rangeActions.map(action => action.actionId);
  uniqueStrings(actionIds, 'Wolf range action IDs');
  if (rangeActions.some(action => action.actionId.length < 1 || action.sourceId.length < 1)) {
    throw new Error('Wolf range actions require stable action and source IDs.');
  }
  uniqueStrings(assignments.map(assignment => assignment.actionId), 'Wolf range assignments');
  if (assignments.some(assignment => !actionIds.includes(assignment.actionId))) {
    throw new Error('A Wolf range assignment names an unknown action.');
  }
  if (targetShiftPlan && range !== 'medium-range' && targetShiftPlan.choices.length > 0) {
    throw new Error('Wolf fighter target shifts are only available at Medium Range.');
  }
  const targetSnapshot = roster.map(({ instanceId, target }) => ({ instanceId, target }));
  const targetShiftResolution = targetShiftPlan && targetShiftPlan.choices.length > 0
    ? resolveWolfRangeTargetShifts({
      roster,
      currentDice: roster.map(({ target }) =>
        wolfTargetNumberForRangeSource(targetShiftPlan.choices[0]!.sourceId, target, targetShiftPlan.ring)),
      choices: targetShiftPlan.choices,
      ring: targetShiftPlan.ring,
    })
    : { roster, targetShifts: [] as readonly WolfRangeTargetShift[] };
  const assignmentMap = new Map(assignments.map(assignment => [assignment.actionId, assignment]));
  const rosterMap = rosterById(roster);
  const legalTargetIds = new Set(wolfRangeLegalTargetInstanceIds(range, roster));
  const dice: WolfDiceReceipt[] = [];
  const damageByInstance: Record<string, number> = {};
  const fleetDamage = damageRecord();
  const nextRoster = new Map(rosterById(targetShiftResolution.roster));
  const destroyedInstanceIds: string[] = [];
  const rolledActions = rangeActions.map(action => {
    const hasDice = action.dice !== undefined;
    const hasFixed = action.fixedDamage !== undefined;
    if (hasDice === hasFixed) throw new Error('A Wolf action must define either dice or fixed damage.');
    if (!Number.isSafeInteger(action.maxTargets) || action.maxTargets < 1) {
      throw new Error('A Wolf action must allow at least one target.');
    }
    const roll = hasDice ? rollPool(action.dice!, random) : {
      rolls: [], successes: 1, damage: action.fixedDamage!,
    };
    if (hasFixed) requirePositiveInteger(action.fixedDamage!, 'fixedDamage');
    const assignment = assignmentMap.get(action.actionId);
    const targetInstanceIds = assignment?.targetInstanceIds ?? [];
    const illegalTargetId = targetInstanceIds.find(instanceId => !legalTargetIds.has(instanceId));
    if (illegalTargetId !== undefined) {
      const illegalTarget = rosterMap.get(illegalTargetId);
      if (range === 'short-range' && illegalTarget?.shipId === 'wolf-battlestation') {
        throw new Error('A Battlestation cannot take Short Range damage.');
      }
      if (range === 'short-range' && illegalTarget?.shipId !== 'wolf-fighter-wing' &&
          roster.some(ship => !ship.destroyed && ship.shipId === 'wolf-fighter-wing')) {
        throw new Error('Short Range damage must be assigned to surviving Fighter Wings first.');
      }
      throw new Error('Wolf damage targeted an unavailable or range-ineligible ship.');
    }
    const successfulHits = hasDice ? roll.successes : 1;
    const requiredTargets = Math.min(successfulHits, action.maxTargets, legalTargetIds.size);
    if (targetInstanceIds.length !== requiredTargets) {
      throw new Error('A Wolf action must assign one target per generated hit, up to distinct live legal contacts.');
    }
    if (new Set(targetInstanceIds).size !== targetInstanceIds.length) {
      throw new Error('This Wolf action requires distinct target assignments.');
    }
    dice.push({ actionId: action.actionId, sourceId: action.sourceId, range, ...roll });
    return {
      action, hasDice, roll, targetInstanceIds,
      unusedHits: Math.max(0, successfulHits - targetInstanceIds.length),
    };
  });

  // The printed rules roll every action in a range simultaneously, then
  // choose targets. Keep range eligibility fixed while accumulating damage,
  // then apply it as one simultaneous damage batch.
  const damageTakenByInstance: Record<string, number> = {};
  for (const { action, hasDice, targetInstanceIds } of rolledActions) {
    const perTargetDamage = hasDice ? action.dice!.damagePerSuccess : action.fixedDamage!;
    targetInstanceIds.forEach(instanceId => {
      const current = nextRoster.get(instanceId);
      if (!current || current.destroyed || !legalTargetIds.has(instanceId)) {
        throw new Error('Wolf damage targeted an unavailable ship.');
      }
      damageByInstance[instanceId] = (damageByInstance[instanceId] ?? 0) + perTargetDamage;
      damageTakenByInstance[instanceId] = (damageTakenByInstance[instanceId] ?? 0) + perTargetDamage;
    });
  }
  if (range === 'short-range') {
    const assignedNonWing = Object.keys(damageTakenByInstance).some((instanceId) =>
      rosterMap.get(instanceId)?.shipId !== 'wolf-fighter-wing');
    if (assignedNonWing) {
      const uncoveredWing = roster.filter((ship) => !ship.destroyed && ship.shipId === 'wolf-fighter-wing').some((ship) => {
        const catalog = wolfShipForId(ship.shipId);
        return !catalog || ship.damageTaken + (damageTakenByInstance[ship.instanceId] ?? 0) < catalog.damageCapacity;
      });
      if (uncoveredWing) {
        throw new Error('Short Range hits must cover all surviving Fighter Wings first.');
      }
    }
  }
  for (const [instanceId, damage] of Object.entries(damageTakenByInstance)) {
    const current = nextRoster.get(instanceId);
    if (!current || current.destroyed) throw new Error('Wolf damage targeted an unavailable ship.');
      const catalog = wolfShipForId(current.shipId);
      if (!catalog) throw new Error('Unknown Wolf ship catalog entry.');
      const damageTaken = current.damageTaken + damage;
      const destroyed = damageTaken >= catalog.damageCapacity;
      nextRoster.set(instanceId, { ...current, damageTaken, destroyed });
      if (destroyed) {
        destroyedInstanceIds.push(instanceId);
        const effect = catalog.ranges[range === 'long-range' ? 'long' : range === 'medium-range' ? 'medium' : 'short'].ifDestroyed;
        if (effect.kind === 'target-damage') addFleetDamage(fleetDamage, current.target, effect.amount);
      }
  }
  const receipt: WolfRangeReceipt = {
    range,
    targetSnapshot,
    dice,
    // The returned receipt is frozen below. Clone caller-owned assignments so
    // freezing that receipt cannot freeze a request object or its target list.
    assignments: assignments
      .filter(assignment => actionIds.includes(assignment.actionId))
      .map(assignment => ({
        actionId: assignment.actionId,
        targetInstanceIds: [...assignment.targetInstanceIds],
      })),
    targetShifts: targetShiftResolution.targetShifts,
    unusedHitsByAction: rolledActions
      .filter(({ unusedHits }) => unusedHits > 0)
      .map(({ action: { actionId }, unusedHits }) => ({ actionId, count: unusedHits })),
    damageByInstance,
    destroyedInstanceIds,
    destructionDamageByTarget: fleetDamage,
  };
  return {
    roster: [...nextRoster.values()],
    receipt: deepFreeze(receipt),
  };
}

/** Apply assignments to a committed range roll lock without drawing new randomness. */
export function resolveLockedWolfRange(input: Readonly<{
  range: WolfCombatRange;
  actions: readonly WolfRangeAction[];
  locked: WolfRangeRollLock;
  assignments: readonly WolfRangeAssignment[];
  roster: readonly WolfCombatShip[];
  targetShiftPlan?: WolfRangeTargetShiftPlan;
}>): { readonly roster: readonly WolfCombatShip[]; readonly receipt: WolfRangeReceipt } {
  const actions = input.actions.filter(action => action.range === input.range);
  if (input.locked.range !== input.range || input.locked.dice.length !== actions.length ||
      input.locked.dice.some((roll, index) => {
        const action = actions[index];
        return !action || roll.actionId !== action.actionId || roll.sourceId !== action.sourceId ||
          roll.range !== input.range || !Number.isSafeInteger(roll.successes) || roll.successes < 0 ||
          !Number.isSafeInteger(roll.damage) || roll.damage < 0 ||
          !Number.isSafeInteger(roll.damagePerHit) || roll.damagePerHit < 1 ||
          !Array.isArray(roll.rolls) || (action.dice
            ? roll.rolls.length !== action.dice.count ||
              roll.rolls.some(value => !Number.isSafeInteger(value) || value < 1 || value > action.dice!.sides) ||
              roll.successes !== roll.rolls.filter(value => value >= action.dice!.successAt).length ||
              roll.damage !== roll.successes * action.dice!.damagePerSuccess ||
              roll.damagePerHit !== action.dice.damagePerSuccess
            : action.fixedDamage !== roll.damage || roll.successes !== 1 ||
              roll.rolls.length !== 0 || roll.damagePerHit !== action.fixedDamage)
          ;
      })) {
    throw new Error('The committed Wolf range dice do not match the current action set.');
  }
  const samples = input.locked.dice.flatMap((roll, index) =>
    actions[index]?.dice ? roll.rolls.map(value => value - 1) : []);
  let cursor = 0;
  const applied = resolveWolfRange(
    input.range,
    actions,
    input.assignments,
    input.roster,
    upperBound => {
      const sample = samples[cursor++];
      if (sample === undefined || sample >= upperBound) {
        throw new Error('The committed Wolf range dice are unavailable for this action set.');
      }
      return sample;
    },
    input.targetShiftPlan,
  );
  const lockedReceipt = input.locked.dice.map(({ actionId, sourceId, range, rolls, successes, damage }) => ({
    actionId, sourceId, range, rolls, successes, damage,
  }));
  if (cursor !== samples.length || JSON.stringify(applied.receipt.dice) !== JSON.stringify(lockedReceipt)) {
    throw new Error('The resolved Wolf range does not match its committed dice.');
  }
  return applied;
}

export interface WolfBoardingDefence {
  readonly target: WolfFleetTargetId;
  readonly securityTeams: number;
  /** The private inventory total before the choice reserved its ordinary teams. */
  readonly availableSecurityTeams?: number;
  /** Commander leadership is committed for at most one attacked target. */
  readonly commanderLed?: boolean;
  /** Two dice per selected team, permitted only while parties outnumber teams. */
  readonly militiaDoubleTeams?: boolean;
  /** Up to three extra rolls chosen by the current Rosal Militia Leader. */
  readonly militiaFrontLineDice?: number;
  /** The docked Pallas is the only craft that grants this additional allowance. */
  readonly pallasRerollAvailable?: boolean;
  /** Initial d6 outcomes locked before reroll actors are asked to choose. */
  readonly lockedRolls?: readonly number[];
  readonly rerolls?: readonly WolfBoardingRerollChoice[];
}

export interface WolfBoardingRerollChoice {
  readonly source: 'aegis' | 'pallas';
  readonly dieIndexes: readonly number[];
  /** Server-rolled values committed with the choice; absent only in pure legacy calculations. */
  readonly rolls?: readonly number[];
}

export interface WolfBoardingReceipt {
  readonly target: WolfFleetTargetId;
  readonly baseBoardingParties: number;
  readonly commanderBonus: number;
  readonly boardingParties: number;
  readonly securityTeams: number;
  readonly availableSecurityTeams: number;
  readonly rolls: readonly number[];
  readonly frontLineDice: number;
  readonly militiaLeaderKilled: boolean;
  readonly rerolls: readonly Readonly<{
    source: WolfBoardingRerollChoice['source'];
    dieIndexes: readonly number[];
    rolls: readonly number[];
  }>[];
  readonly securityCasualties: number;
  readonly boarderCasualties: number;
  readonly survivingBoardingParties: number;
  readonly damage: number;
}

function boardersByTarget(roster: readonly WolfCombatShip[]): Record<WolfFleetTargetId, number> {
  const parties = damageRecord();
  roster.filter(ship => !ship.destroyed).forEach(ship => {
    const effect = wolfShipForId(ship.shipId)?.ifNotDestroyed;
    if (effect?.kind === 'boarding-parties') addFleetDamage(parties, ship.target, effect.amount);
  });
  return parties;
}

export function wolfBoardingPartyCounts(roster: readonly WolfCombatShip[]): Readonly<Record<WolfFleetTargetId, number>> {
  return Object.freeze(boardersByTarget(roster));
}

/** Roll and persist boarding dice once, before any reroll actor is shown the outcomes. */
export function lockWolfBoardingDefenceRolls(
  roster: readonly WolfCombatShip[],
  defence: readonly WolfBoardingDefence[],
  random: WolfRandomInt = secureRandomInt,
): readonly WolfBoardingDefence[] {
  if (defence.some((choice) => choice.rerolls !== undefined && choice.rerolls.length > 0)) {
    throw new Error('Boarding rerolls cannot be committed before defence dice are locked.');
  }
  const receipts = resolveWolfBoarding(roster, defence, random);
  const rollsByTarget = new Map(receipts.map(({ target, rolls }) => [target, [...rolls]]));
  return Object.freeze(defence.map((choice) => Object.freeze({
    ...choice, lockedRolls: Object.freeze(rollsByTarget.get(choice.target) ?? []),
  })));
}

/** Resolve base boarding defence using server-owned d6s. */
export function resolveWolfBoarding(
  roster: readonly WolfCombatShip[],
  defence: readonly WolfBoardingDefence[],
  random: WolfRandomInt = secureRandomInt,
): readonly WolfBoardingReceipt[] {
  const parties = boardersByTarget(roster);
  uniqueStrings(defence.map(value => value.target), 'Boarding defence targets');
  if (defence.some((choice) => parties[choice.target] < 1)) {
    throw new Error('Boarding defence cannot be committed for a target without live parties.');
  }
  if (defence.filter((choice) => choice.commanderLed === true).length > 1) {
    throw new Error('The Wolf Commander may lead only one boarding action.');
  }
  const defenceByTarget = new Map(defence.map(value => [value.target, value]));
  return EXPANDED_WOLF_TARGET_RING.flatMap(target => {
    const baseBoardingParties = parties[target];
    if (baseBoardingParties < 1) return [];
    const chosen = defenceByTarget.get(target);
    if (!chosen) {
      throw new Error(`Security-team defence is required for ${target}.`);
    }
    requireNonNegativeInteger(chosen.securityTeams, 'securityTeams');
    const availableSecurityTeams = chosen.availableSecurityTeams ?? chosen.securityTeams;
    requireNonNegativeInteger(availableSecurityTeams, 'availableSecurityTeams');
    if (chosen.securityTeams > availableSecurityTeams) {
      throw new Error('The selected Security Teams exceed the available host inventory.');
    }
    const militiaFrontLineDice = chosen.militiaFrontLineDice ?? 0;
    if (!Number.isSafeInteger(militiaFrontLineDice) || militiaFrontLineDice < 0 || militiaFrontLineDice > 3) {
      throw new Error('The Militia Leader may choose zero to three front-line dice.');
    }
    if (militiaFrontLineDice > availableSecurityTeams) {
      throw new Error('The Militia Leader cannot risk more teams than the available inventory.');
    }
    const commanderBonus = chosen.commanderLed === true ? 2 : 0;
    const boardingParties = baseBoardingParties + commanderBonus;
    const militiaDoubleTeams = chosen.militiaDoubleTeams === true;
    if (militiaDoubleTeams && !(boardingParties > availableSecurityTeams)) {
      throw new Error('Two dice per Security Team are available only while boarding parties outnumber teams.');
    }
    const diceCount = chosen.militiaDoubleTeams === true ? 2 : 1;
    const rollCount = chosen.securityTeams * diceCount + militiaFrontLineDice;
    const rolls = chosen.lockedRolls === undefined
      ? Array.from({ length: rollCount }, () => boundedRandomInt(random, 6) + 1)
      : [...chosen.lockedRolls];
    if (rolls.length !== rollCount || rolls.some((roll) => !Number.isSafeInteger(roll) || roll < 1 || roll > 6)) {
      throw new Error('The locked boarding dice do not match the committed defence choice.');
    }
    const teamDice: number[][] = [];
    for (let team = 0; team < chosen.securityTeams; team += 1) {
      teamDice.push(rolls.slice(team * diceCount, (team + 1) * diceCount));
    }
    const securityTeamRollCount = teamDice.flat().length;
    const frontLineStart = securityTeamRollCount;
    const normalizedRerolls = [...(chosen.rerolls ?? [])].sort((left, right) =>
      left.source === right.source ? 0 : left.source === 'aegis' ? -1 : 1);
    uniqueStrings(normalizedRerolls.map(({ source }) => source), 'Boarding reroll sources');
    const rerolls = normalizedRerolls.map((choice) => {
      if (choice.source !== 'aegis' && choice.source !== 'pallas') {
        throw new Error('Unknown boarding reroll source.');
      }
      if (choice.source === 'aegis' && target !== 'aegis') {
        throw new Error('The AEGIS Battle Sheet can reroll only AEGIS defence dice.');
      }
      if (choice.source === 'pallas' && chosen.pallasRerollAvailable !== true) {
        throw new Error('Pallas rerolls require its current docking host.');
      }
      if (!Array.isArray(choice.dieIndexes) || choice.dieIndexes.length > 3) {
        throw new Error('Each boarding reroll source can choose up to three dice.');
      }
      uniqueStrings(choice.dieIndexes.map(String), 'Boarding reroll die indexes');
      if (choice.rolls !== undefined && (choice.rolls.length !== choice.dieIndexes.length ||
          choice.rolls.some((roll) => !Number.isSafeInteger(roll) || roll < 1 || roll > 6))) {
        throw new Error('The committed boarding reroll outcomes are malformed.');
      }
      const rerollValues = choice.dieIndexes.map((dieIndex) => {
        if (!Number.isSafeInteger(dieIndex) || dieIndex < 0 || dieIndex >= rolls.length) {
          throw new Error('A boarding reroll names an unavailable defence die.');
        }
        return choice.rolls?.[choice.dieIndexes.indexOf(dieIndex)] ?? boundedRandomInt(random, 6) + 1;
      });
      choice.dieIndexes.forEach((dieIndex, index) => { rolls[dieIndex] = rerollValues[index]!; });
      return { source: choice.source, dieIndexes: [...choice.dieIndexes], rolls: rerollValues };
    });
    let teamDieIndex = 0;
    const teamRollsAfterReroll = teamDice.map((teamValues) => teamValues.map(() => rolls[teamDieIndex++]!));
    const currentFrontLineRolls = rolls.slice(frontLineStart);
    const resolvedTeamCasualties = teamRollsAfterReroll.filter((teamRolls) => teamRolls.includes(1)).length;
    const resolvedFrontLineCasualties = currentFrontLineRolls.filter((roll) => roll === 1).length;
    const finalSecurityCasualties = Math.min(availableSecurityTeams, resolvedTeamCasualties + resolvedFrontLineCasualties);
    const resolvedBoarderCasualties = Math.min(
      rolls.filter(roll => roll >= 4).length,
      boardingParties,
    );
    const survivingBoardingParties = Math.max(0, boardingParties - resolvedBoarderCasualties);
    return [{
      target,
      baseBoardingParties,
      commanderBonus,
      boardingParties,
      securityTeams: chosen.securityTeams,
      availableSecurityTeams,
      rolls,
      frontLineDice: militiaFrontLineDice,
      militiaLeaderKilled: currentFrontLineRolls.includes(1),
      rerolls,
      securityCasualties: finalSecurityCasualties,
      boarderCasualties: resolvedBoarderCasualties,
      survivingBoardingParties,
      damage: survivingBoardingParties,
    }];
  });
}

export interface FleetCombatState {
  readonly damage: ShipDamageState;
  readonly population: number;
}

export interface FleetDamageDrawReceipt {
  readonly target: WolfFleetTargetId;
  readonly amount: number;
  readonly draws: readonly ({
    readonly destroyed: boolean;
    readonly card?: DamageCard;
    readonly recycled?: boolean;
    readonly casualty: boolean;
  })[];
  readonly state: ShipDamageState;
  readonly population: number;
}

/** Reuse the existing damage deck and population invariants for combat damage. */
export function applyWolfFleetDamage(
  target: WolfFleetTargetId,
  amount: number,
  current: FleetCombatState,
  random: WolfRandomInt = secureRandomInt,
  options: { readonly exhaustedDeckPolicy?: 'facilitator-ruling' | 'destroy' } = {},
): FleetDamageDrawReceipt {
  requireNonNegativeInteger(amount, 'amount');
  let state = current.damage;
  let population = current.population;
  requireNonNegativeInteger(population, 'population');
  const draws: FleetDamageDrawReceipt['draws'][number][] = [];
  for (let index = 0; index < amount; index += 1) {
    const exhaustionPolicy: DamageDeckExhaustionPolicy = options.exhaustedDeckPolicy === 'destroy'
      ? 'destroy-on-required-draw'
      : 'facilitator-ruling';
    const draw = drawShipDamage(target, state, upperBound => boundedRandomInt(random, upperBound), undefined, exhaustionPolicy);
    if (draw.destroyed) {
      state = draw.state;
      draws.push({ destroyed: true, casualty: false });
      break;
    }
    state = draw.state;
    const casualty = !draw.card.systemId.startsWith('armoured-hull') && population > 0;
    if (casualty) population = populationChange(target, population, -1, false).amount;
    draws.push({ destroyed: false, card: draw.card, recycled: draw.recycled, casualty });
    if (state.destroyed) break;
  }
  return { target, amount, draws, state, population };
}

function applySurvivalEffect(
  effect: WolfShipSurvivalEffect,
  ship: WolfCombatShip,
  survivingFighterWings: number,
  fleetDamage: Record<WolfFleetTargetId, number>,
  boarding: Record<WolfFleetTargetId, number>,
): void {
  if (effect.kind === 'target-damage') addFleetDamage(fleetDamage, ship.target, effect.amount);
  if (effect.kind === 'target-damage-with-fighter-wing-bonus') {
    addFleetDamage(fleetDamage, ship.target, effect.amount + (survivingFighterWings * effect.fighterWingBonus));
  }
  if (effect.kind === 'boarding-parties') addFleetDamage(boarding, ship.target, effect.amount);
}

function resolveSurvivorEffects(roster: readonly WolfCombatShip[]): {
  readonly fleetDamage: Readonly<Record<WolfFleetTargetId, number>>;
  readonly boardingParties: Readonly<Record<WolfFleetTargetId, number>>;
  readonly returningInstanceIds: readonly string[];
} {
  const fleetDamage = damageRecord();
  const boardingParties = damageRecord();
  const survivingFighterWings = roster.filter(ship => !ship.destroyed && ship.shipId === 'wolf-fighter-wing').length;
  const returningInstanceIds: string[] = [];
  roster.filter(ship => !ship.destroyed).forEach(ship => {
    const catalog = wolfShipForId(ship.shipId);
    if (!catalog) throw new Error('Unknown Wolf ship catalog entry.');
    applySurvivalEffect(catalog.ifNotDestroyed, ship, survivingFighterWings, fleetDamage, boardingParties);
    if (catalog.returnRule.kind === 'next-attack') returningInstanceIds.push(ship.instanceId);
  });
  return { fleetDamage, boardingParties, returningInstanceIds };
}

export interface WolfPhaseReceipt {
  readonly turn: number;
  readonly phase: 'coordination' | 'team';
  readonly serverTime: string;
  readonly deadlineAt: string;
  readonly overrun: boolean;
}

export interface WolfFleetDamageResult {
  readonly target: WolfFleetTargetId;
  readonly amount: number;
  readonly state: ShipDamageState;
  readonly populationBefore: number;
  readonly population: number;
  readonly draws: FleetDamageDrawReceipt['draws'];
}

export interface WolfCalculationReceipt {
  readonly type: 'wolf-combat-calculation';
  readonly version: 1;
  readonly requestId: string;
  readonly phase: WolfPhaseReceipt;
  readonly targeting: WolfTargetingReceipt;
  readonly ranges: readonly WolfRangeReceipt[];
  readonly boarding: readonly WolfBoardingReceipt[];
  readonly fleetDamage: readonly WolfFleetDamageResult[];
  readonly forceField: Readonly<{
    status: 'protected';
    targetShipId: WolfFleetTargetId;
    preventedDamage: number;
  } | { status: 'unavailable'; preventedDamage: 0 }>;
  readonly returningInstanceIds: readonly string[];
  /** Private attack-bound action replayed from the Fighter Ace audit receipt. */
  readonly fighterAce?: WolfFighterAceActionReceipt;
  /** Private post-range survivor roster used to validate subsequent-attack lookups. */
  readonly survivingWolfShips?: readonly {
    readonly instanceId: string;
    readonly shipId: WolfShipId;
    readonly target: WolfFleetTargetId;
  }[];
}

export const WOLF_FIGHTER_ACE_SOURCE_IDS = [
  'fighter-wing-alpha', 'fighter-wing-bravo', 'pdf-escort-fighter-wing',
] as const;
export type WolfFighterAceSourceId = typeof WOLF_FIGHTER_ACE_SOURCE_IDS[number];

export interface WolfFighterAcePermissionReceipt {
  readonly type: 'pdf-fighter-ace-permission';
  readonly attackId: string;
  readonly turn: number;
  readonly sourceId: WolfFighterAceSourceId;
  readonly fighterIndex: number;
  readonly aceUid: string;
  readonly actorUid: string;
  readonly actorRoleId: 'wing-commander' | 'refinery-124-pdf-colonel';
  readonly requestId: string;
  readonly revision: number;
}

export interface WolfFighterAceSourceStateReceipt {
  readonly sourceId: WolfFighterAceSourceId;
  readonly fighters: number;
  readonly losses: number;
  /** Attack-scoped source revision. */
  readonly revision: number;
  readonly launched: boolean;
  readonly attackId: string;
  readonly cycle: number;
  /** Durable fighter-wing count revision. */
  readonly durableRevision: number;
}

export interface WolfFighterAceActionReceipt {
  readonly type: 'pdf-fighter-ace-action';
  readonly attackId: string;
  readonly turn: number;
  readonly revision: number;
  readonly requestId: string;
  readonly actorUid: string;
  readonly actorRoleId: 'pdf-fighter-ace';
  readonly fighterUid: string;
  readonly sourceId: WolfFighterAceSourceId;
  readonly fighterIndex: number;
  readonly permissionActor: WolfFighterAcePermissionReceipt;
  readonly permissionActorUid: string;
  readonly permissionActorRoleId: 'wing-commander' | 'refinery-124-pdf-colonel';
  readonly permissionRequestId: string;
  readonly permissionRevision: number;
  readonly range: 'long' | 'medium' | 'short';
  readonly submittedTargetId: string;
  readonly extraTargetId: string | null;
  readonly submittedTargetShift: -1 | 1 | null;
  readonly resolvedTargetShift: Readonly<{
    instanceId: string;
    from: number;
    to: number;
    shift: -1 | 1;
  }> | null;
  readonly rosterBefore: readonly WolfCombatShip[];
  readonly targetResults: readonly Readonly<{
    instanceId: string;
    shipId: WolfShipId;
    damage: number;
    destroyed: boolean;
  }>[];
  readonly sourceStateBefore: WolfFighterAceSourceStateReceipt;
  readonly sourceStateAfter: WolfFighterAceSourceStateReceipt;
  readonly outcome: Readonly<{
    damage: number;
    targetDestroyed: boolean;
    fighterDestroyed: boolean;
    aceDied: boolean;
    escaped: boolean;
  }>;
  readonly rolls: readonly number[];
  readonly committedAt: string;
}

export interface WolfAttackFinalizationInput {
  readonly requestId: string;
  /** Declaration identity, required whenever a Fighter Ace action is replayed. */
  readonly attackId?: string;
  readonly fighterAceAction?: WolfFighterAceActionReceipt;
  readonly commanderRangeAdjustments?: Readonly<Partial<Record<WolfCombatRange, unknown>>>;
  /** The source's current permission receipt, keyed by the committed source ID. */
  readonly fighterAcePermissions?: Readonly<Partial<Record<WolfFighterAceSourceId, WolfFighterAcePermissionReceipt>>>;
  readonly targeting: WolfTargetingReceipt;
  readonly roster: readonly WolfCombatShip[];
  /** The committed source/dice/target receipts, in printed range order. */
  readonly ranges: readonly WolfRangeReceipt[];
  readonly phase: TurnPhase;
  readonly now?: number;
  readonly targetRing?: WolfTargetRing;
  readonly boardingDefence: readonly WolfBoardingDefence[];
  readonly forceFieldTargetId: WolfFleetTargetId | null;
  readonly fleetState: Readonly<Partial<Record<WolfFleetTargetId, FleetCombatState>>>;
  readonly randomInt?: WolfRandomInt;
}

function stableReceiptValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableReceiptValue);
  if (assertRecord(value)) return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableReceiptValue(value[key])]),
  );
  return value;
}

function sameReceiptValue(left: unknown, right: unknown): boolean {
  try { return JSON.stringify(stableReceiptValue(left)) === JSON.stringify(stableReceiptValue(right)); }
  catch { return false; }
}

function hasExactReceiptKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function validateWolfFighterAceSourceState(
  value: unknown,
  sourceId: WolfFighterAceSourceId,
  attackId: string,
  turn: number,
): value is WolfFighterAceSourceStateReceipt {
  if (!assertRecord(value) || !hasExactReceiptKeys(value, [
    'sourceId', 'fighters', 'losses', 'revision', 'durableRevision', 'launched', 'attackId', 'cycle',
  ])) return false;
  return value.sourceId === sourceId && Number.isSafeInteger(value.fighters) && (value.fighters as number) >= 0 &&
    Number.isSafeInteger(value.losses) && (value.losses as number) >= 0 &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 &&
    Number.isSafeInteger(value.durableRevision) && (value.durableRevision as number) >= 0 &&
    typeof value.launched === 'boolean' && value.attackId === attackId && value.cycle === turn;
}

function validateWolfFighterAcePermission(
  value: unknown,
  action: WolfFighterAceActionReceipt,
  attackId: string,
  turn: number,
): value is WolfFighterAcePermissionReceipt {
  if (!assertRecord(value) || !hasExactReceiptKeys(value, [
    'type', 'attackId', 'turn', 'sourceId', 'fighterIndex', 'aceUid', 'actorUid', 'actorRoleId', 'requestId', 'revision',
  ])) return false;
  const expectedRole = action.sourceId === 'pdf-escort-fighter-wing'
    ? 'refinery-124-pdf-colonel' : 'wing-commander';
  return value.type === 'pdf-fighter-ace-permission' && value.attackId === attackId && value.turn === turn &&
    value.sourceId === action.sourceId && value.fighterIndex === action.fighterIndex &&
    typeof value.aceUid === 'string' && value.aceUid === action.actorUid &&
    typeof value.actorUid === 'string' && value.actorUid.length > 0 && value.actorRoleId === expectedRole &&
    typeof value.requestId === 'string' && value.requestId.length > 0 &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 &&
    action.fighterUid === action.actorUid && action.permissionActorUid === value.actorUid &&
    action.permissionActorRoleId === value.actorRoleId && action.permissionRequestId === value.requestId &&
    action.permissionRevision === value.revision;
}

export interface WolfFighterAceReplayContext {
  readonly attackId: string;
  readonly turn: number;
  readonly targetRing: WolfTargetRing;
  /** The permission record still stored on this attack for the selected source. */
  readonly persistedPermission: unknown;
}

export interface WolfFighterAceReplayResult {
  readonly roster: readonly WolfCombatShip[];
  readonly destructionDamageByTarget: Readonly<Record<WolfFleetTargetId, number>>;
}

function validateWolfCombatRoster(value: unknown, targetRing: WolfTargetRing): value is readonly WolfCombatShip[] {
  if (!Array.isArray(value)) return false;
  const instanceIds = new Set<string>();
  return value.every((entry) => {
    if (!assertRecord(entry) || !hasExactReceiptKeys(entry, ['instanceId', 'shipId', 'target', 'damageTaken', 'destroyed']) ||
        typeof entry.instanceId !== 'string' || !entry.instanceId || instanceIds.has(entry.instanceId) ||
        typeof entry.shipId !== 'string' || !wolfShipForId(entry.shipId as WolfShipId) ||
        !targetRing.includes(entry.target as WolfFleetTargetId) ||
        !Number.isSafeInteger(entry.damageTaken) || (entry.damageTaken as number) < 0 ||
        typeof entry.destroyed !== 'boolean') return false;
    const catalog = wolfShipForId(entry.shipId as WolfShipId)!;
    if ((entry.damageTaken as number) > catalog.damageCapacity ||
        entry.destroyed !== ((entry.damageTaken as number) >= catalog.damageCapacity)) return false;
    instanceIds.add(entry.instanceId);
    return true;
  });
}

function contactRosterIndex(contactId: unknown, roster: readonly WolfCombatShip[]): number {
  if (typeof contactId !== 'string') return -1;
  const match = /^contact-([1-9]\d*)$/.exec(contactId);
  const index = match ? Number(match[1]) - 1 : -1;
  return Number.isSafeInteger(index) && index >= 0 && index < roster.length ? index : -1;
}

/**
 * Strictly replay the one permitted Ace action against its captured roster
 * before the selected ordinary range. Range progression and finalization use
 * this same server-side boundary, so card damage and destruction effects apply once.
 */
export function replayWolfFighterAceBeforeRange(
  roster: readonly WolfCombatShip[],
  action: WolfFighterAceActionReceipt,
  context: WolfFighterAceReplayContext,
): WolfFighterAceReplayResult {
  const actionKeys = [
    'type', 'attackId', 'turn', 'revision', 'requestId', 'actorUid', 'actorRoleId', 'fighterUid', 'sourceId',
    'fighterIndex', 'permissionActor', 'permissionActorUid', 'permissionActorRoleId', 'permissionRequestId',
    'permissionRevision', 'range', 'submittedTargetId', 'extraTargetId', 'submittedTargetShift',
    'resolvedTargetShift', 'rosterBefore', 'targetResults', 'sourceStateBefore', 'sourceStateAfter', 'outcome',
    'rolls', 'committedAt',
  ];
  if (!assertRecord(action) || !hasExactReceiptKeys(action, actionKeys) ||
      !context.attackId || action.type !== 'pdf-fighter-ace-action' || action.attackId !== context.attackId ||
      action.turn !== context.turn || !Number.isSafeInteger(action.turn) ||
      !Number.isSafeInteger(action.revision) || (action.revision as number) < 1 ||
      typeof action.requestId !== 'string' || !action.requestId ||
      typeof action.actorUid !== 'string' || !action.actorUid || action.actorRoleId !== 'pdf-fighter-ace' ||
      action.fighterUid !== action.actorUid ||
      !WOLF_FIGHTER_ACE_SOURCE_IDS.includes(action.sourceId as WolfFighterAceSourceId) ||
      !Number.isSafeInteger(action.fighterIndex) || (action.fighterIndex as number) < 0 ||
      !validateWolfFighterAcePermission(action.permissionActor, action, context.attackId, context.turn) ||
      !sameReceiptValue(action.permissionActor, context.persistedPermission) ||
      typeof action.committedAt !== 'string' || !Number.isFinite(Date.parse(action.committedAt))) {
    throw new Error('The Fighter Ace permission or attack binding is malformed or stale.');
  }
  if (!validateWolfCombatRoster(roster, context.targetRing) ||
      !validateWolfCombatRoster(action.rosterBefore, context.targetRing) ||
      !sameReceiptValue(action.rosterBefore, roster)) {
    throw new Error('The captured pre-action roster does not match the current combat roster.');
  }
  const before = action.sourceStateBefore;
  const after = action.sourceStateAfter;
  if (!validateWolfFighterAceSourceState(before, action.sourceId as WolfFighterAceSourceId, context.attackId, context.turn) ||
      !validateWolfFighterAceSourceState(after, action.sourceId as WolfFighterAceSourceId, context.attackId, context.turn) ||
      !before.launched || (action.fighterIndex as number) >= before.fighters || after.revision !== before.revision + 1 ||
      after.fighters !== before.fighters - (assertRecord(action.outcome) && action.outcome.fighterDestroyed === true ? 1 : 0) ||
      after.losses !== before.losses + (assertRecord(action.outcome) && action.outcome.fighterDestroyed === true ? 1 : 0) ||
      after.durableRevision !== before.durableRevision +
        (assertRecord(action.outcome) && action.outcome.fighterDestroyed === true ? 1 : 0) ||
      after.launched !== before.launched || after.attackId !== before.attackId || after.cycle !== before.cycle) {
    throw new Error('The Fighter Ace source slot and durable loss receipt do not match its committed outcome.');
  }
  if (!assertRecord(action.outcome) || !hasExactReceiptKeys(action.outcome, [
    'damage', 'targetDestroyed', 'fighterDestroyed', 'aceDied', 'escaped',
  ]) || !Number.isSafeInteger(action.outcome.damage) || (action.outcome.damage as number) < 0 ||
      typeof action.outcome.targetDestroyed !== 'boolean' || typeof action.outcome.fighterDestroyed !== 'boolean' ||
      typeof action.outcome.aceDied !== 'boolean' || typeof action.outcome.escaped !== 'boolean') {
    throw new Error('The Fighter Ace outcome summary is malformed.');
  }
  if ((action.range !== 'long' && action.range !== 'medium' && action.range !== 'short') ||
      (action.submittedTargetShift !== null && action.submittedTargetShift !== -1 && action.submittedTargetShift !== 1) ||
      (action.extraTargetId !== null && typeof action.extraTargetId !== 'string') ||
      (action.range !== 'short' && action.extraTargetId !== null) ||
      (action.range !== 'medium' && action.submittedTargetShift !== null) ||
      (action.range === 'medium' ? action.resolvedTargetShift === null && action.submittedTargetShift !== null :
        action.resolvedTargetShift !== null)) {
    throw new Error('The Fighter Ace range inputs are malformed or outside their printed range.');
  }
  if (!Array.isArray(action.rolls) || (action.range === 'long'
    ? action.rolls.length !== 3 || action.rolls.some((roll) => !Number.isSafeInteger(roll) || roll < 1 || roll > 6)
    : action.rolls.length !== 0)) {
    throw new Error('The Fighter Ace server dice do not match its selected range.');
  }

  const primaryIndex = contactRosterIndex(action.submittedTargetId, roster);
  const primary = roster[primaryIndex];
  if (!primary || primary.destroyed || !context.targetRing.includes(primary.target)) {
    throw new Error('The Fighter Ace primary contact does not match a live current roster target.');
  }
  const primaryCatalog = wolfShipForId(primary.shipId);
  const rangeName = action.range as 'long' | 'medium' | 'short';
  if (!primaryCatalog || !primaryCatalog.ranges[rangeName].canBeDamaged) {
    throw new Error('The Fighter Ace primary contact cannot take damage at this range.');
  }
  let expectedTargetRows: { index: number; damage: number }[];
  if (rangeName === 'long') {
    expectedTargetRows = [{
      index: primaryIndex,
      damage: Math.min(action.rolls.filter((roll) => roll >= 3).length,
        primaryCatalog.damageCapacity - primary.damageTaken),
    }];
  } else if (rangeName === 'medium') {
    expectedTargetRows = [{ index: primaryIndex, damage: 1 }];
  } else if (action.extraTargetId === null) {
    expectedTargetRows = [{ index: primaryIndex, damage: 1 }];
  } else if (action.extraTargetId === action.submittedTargetId) {
    expectedTargetRows = [{
      index: primaryIndex,
      damage: Math.min(2, primaryCatalog.damageCapacity - primary.damageTaken),
    }];
  } else {
    const extraIndex = contactRosterIndex(action.extraTargetId, roster);
    const extra = roster[extraIndex];
    const extraCatalog = extra ? wolfShipForId(extra.shipId) : undefined;
    if (!extra || extra.destroyed || !extraCatalog || !extraCatalog.ranges.short.canBeDamaged) {
      throw new Error('The Fighter Ace Short extra contact does not match a live printed target.');
    }
    expectedTargetRows = [
      { index: primaryIndex, damage: Math.min(1, primaryCatalog.damageCapacity - primary.damageTaken) },
      { index: extraIndex, damage: Math.min(1, extraCatalog.damageCapacity - extra.damageTaken) },
    ];
  }
  if (!Array.isArray(action.targetResults) || action.targetResults.length !== expectedTargetRows.length) {
    throw new Error('The Fighter Ace per-contact damage rows do not match its selected targets.');
  }
  const destructionDamage = damageRecord();
  const nextRoster = [...roster];
  let appliedDamage = 0;
  expectedTargetRows.forEach(({ index, damage }, rowIndex) => {
    const current = roster[index];
    if (!current) throw new Error('The Fighter Ace target index is outside its captured roster.');
    const result: unknown = action.targetResults[rowIndex];
    const catalog = wolfShipForId(current.shipId);
    if (!catalog) throw new Error('The Fighter Ace target is absent from the printed ship catalog.');
    const destroyed = current.damageTaken + damage >= catalog.damageCapacity;
    if (!assertRecord(result) || !hasExactReceiptKeys(result, ['instanceId', 'shipId', 'damage', 'destroyed']) ||
        result.instanceId !== current.instanceId || result.shipId !== current.shipId || result.damage !== damage ||
        result.destroyed !== destroyed) {
      throw new Error('The Fighter Ace target result does not match actual capped printed damage.');
    }
    nextRoster[index] = { ...current, damageTaken: current.damageTaken + damage, destroyed };
    appliedDamage += damage;
    if (destroyed) {
      const effect = catalog.ranges[rangeName].ifDestroyed;
      if (effect.kind === 'target-damage') addFleetDamage(destructionDamage, current.target, effect.amount);
    }
  });
  const primaryResult = action.targetResults[0];
  const hasExtraShot = rangeName === 'short' && action.extraTargetId !== null;
  const expectedOutcome = {
    damage: appliedDamage,
    targetDestroyed: action.targetResults[0]!.destroyed,
    fighterDestroyed: rangeName === 'long' ? !action.targetResults[0]!.destroyed : hasExtraShot,
    aceDied: rangeName === 'long' && !action.targetResults[0]!.destroyed,
    escaped: hasExtraShot,
  };
  if (!sameReceiptValue(action.outcome, expectedOutcome) ||
      !assertRecord(primaryResult) || primaryResult.instanceId !== primary.instanceId) {
    throw new Error('The Fighter Ace outcome summary does not match its capped target effects.');
  }
  if (rangeName === 'medium') {
    const rawShift: unknown = action.resolvedTargetShift;
    if (action.submittedTargetShift === null) {
      if (rawShift !== null) throw new Error('The Fighter Ace receipt has an unrequested target shift.');
    } else {
      const from = context.targetRing.indexOf(primary.target) + 1;
      const to = shiftWolfTargetDie(from, action.submittedTargetShift, context.targetRing);
      if (!assertRecord(rawShift) || !hasExactReceiptKeys(rawShift, ['instanceId', 'from', 'to', 'shift']) ||
          rawShift.instanceId !== primary.instanceId || rawShift.from !== from || rawShift.to !== to ||
          rawShift.shift !== action.submittedTargetShift) {
        throw new Error('The Fighter Ace target shift does not match its server-resolved target ring movement.');
      }
      const shiftedIndex = nextRoster.findIndex((ship) => ship.instanceId === primary.instanceId);
      nextRoster[shiftedIndex] = { ...nextRoster[shiftedIndex]!, target: wolfTargetForDie(to, context.targetRing) };
    }
  }
  return { roster: nextRoster, destructionDamageByTarget: { ...destructionDamage } };
}

export interface WolfPreRangeMutationContext {
  readonly attackId: string;
  readonly turn: number;
  readonly range: WolfCombatRange;
  readonly targetRing: WolfTargetRing;
  readonly commanderAdjustment?: unknown;
  readonly fighterAceAction?: WolfFighterAceActionReceipt;
  readonly persistedPermission?: unknown;
}

/** Replay genuine pre-range choices in their committed transaction order. */
export function replayWolfPreRangeMutations(
  roster: readonly WolfCombatShip[],
  context: WolfPreRangeMutationContext,
): WolfFighterAceReplayResult {
  let current = [...roster];
  const damage = damageRecord();
  const steps: { revision: number; kind: 'commander' | 'ace' }[] = [];
  const raw = context.commanderAdjustment;
  if (raw !== undefined) {
    if (!assertRecord(raw) || !hasExactReceiptKeys(raw, [
      'type', 'status', 'attackId', 'turn', 'revision', 'range', 'rosterIndex', 'instanceId', 'shipId',
      'fromTarget', 'toTarget', 'fromTargetNumber', 'toTargetNumber', 'delta', 'actorUid', 'actorRoleId', 'requestId',
    ]) || !context.attackId || raw.type !== 'wolf-commander-range-target-adjustment' || raw.status !== 'committed' ||
        raw.attackId !== context.attackId || raw.turn !== context.turn || !Number.isSafeInteger(context.turn) || context.turn < 1 ||
        raw.range !== context.range || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
        !Number.isSafeInteger(raw.rosterIndex) || (raw.rosterIndex as number) < 0 ||
        typeof raw.actorUid !== 'string' || !raw.actorUid || raw.actorRoleId !== 'wolf-commander' ||
        typeof raw.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(raw.requestId) ||
        (raw.delta !== -1 && raw.delta !== 1)) {
      throw new Error('The Commander range adjustment binding is malformed or stale.');
    }
    steps.push({ revision: raw.revision as number, kind: 'commander' });
  }
  if (context.fighterAceAction) {
    if (context.fighterAceAction.range !== context.range.replace('-range', '') ||
        !Number.isSafeInteger(context.fighterAceAction.revision) || context.fighterAceAction.revision < 1) {
      throw new Error('The Fighter Ace pre-range binding or revision is malformed.');
    }
    steps.push({ revision: context.fighterAceAction.revision, kind: 'ace' });
  }
  if (steps.length === 2 && steps[0]!.revision === steps[1]!.revision) {
    throw new Error('Pre-range choices require distinct revisions to establish their committed order.');
  }
  for (const step of steps.sort((a, b) => a.revision - b.revision)) {
    if (step.kind === 'ace') {
      const ace = replayWolfFighterAceBeforeRange(current, context.fighterAceAction!, {
        attackId: context.attackId, turn: context.turn, targetRing: context.targetRing,
        persistedPermission: context.persistedPermission,
      });
      current = [...ace.roster];
      context.targetRing.forEach((target) => addFleetDamage(damage, target, ace.destructionDamageByTarget[target]));
    } else {
      const adjustment = raw as Record<string, unknown>;
      const index = adjustment.rosterIndex as number;
      const selected = current[index];
      const from = selected ? context.targetRing.indexOf(selected.target) + 1 : 0;
      const to = from > 0 ? shiftWolfTargetDie(from, adjustment.delta as -1 | 1, context.targetRing) : 0;
      if (!selected || selected.destroyed ||
          selected.instanceId !== adjustment.instanceId || selected.shipId !== adjustment.shipId ||
          selected.target !== adjustment.fromTarget || from !== adjustment.fromTargetNumber ||
          to !== adjustment.toTargetNumber || context.targetRing[to - 1] !== adjustment.toTarget) {
        throw new Error('The Commander range adjustment does not match its current roster identity and target dial.');
      }
      current[index] = { ...selected, target: adjustment.toTarget as WolfFleetTargetId };
    }
  }
  return { roster: current, destructionDamageByTarget: damage };
}

export interface WolfAttackCalculationInput {
  readonly requestId: string;
  readonly composition: ScheduledWolfAttackComposition;
  readonly phase: TurnPhase;
  readonly now?: number;
  readonly targetingModifiers?: WolfTargetingModifierInput;
  /** The authoritative configured target ring (five/six/seven ships for PC07). */
  readonly targetRing?: WolfTargetRing;
  /** Explicitly empty arrays mean this attack has no actions/defence choices. */
  readonly rangeActions: readonly WolfRangeAction[];
  readonly rangeAssignments: readonly WolfRangeAssignment[];
  readonly boardingDefence: readonly WolfBoardingDefence[];
  /** Explicit null means the current session has no charged pre-target Force Field. */
  readonly forceFieldTargetId?: WolfFleetTargetId | null;
  /** Every target in the printed ring must have an authoritative state. */
  readonly fleetState: Readonly<Partial<Record<WolfFleetTargetId, FleetCombatState>>>;
  readonly randomInt?: WolfRandomInt;
}

function phaseReceipt(phase: TurnPhase, now: number, allowRestricted = false): WolfPhaseReceipt {
  const canonical = turnPhaseState(phase);
  if (!canonical || !Number.isFinite(Date.parse(canonical.openAirspaceEndsAt))) {
    throw new Error('The Wolf combat deadline is not a valid server instant.');
  }
  if (canonical.timerPause !== undefined) throw new Error('Wolf attack resolution is paused by the shared session clock.');
  const overrun = now >= Date.parse(canonical.openAirspaceEndsAt);
  if (canonical.airspace.state !== 'lifted' && !overrun && !allowRestricted) {
    throw new Error('Wolf combat resolves during the Coordination phase.');
  }
  return {
    turn: canonical.turn,
    phase: overrun ? 'team' : 'coordination',
    serverTime: new Date(now).toISOString(),
    deadlineAt: canonical.openAirspaceEndsAt,
    // The routed rules allow a Wolf attack to overrun into Team Phase. Record
    // that fact for the receipt; do not invent a per-step deadline policy.
    overrun,
  };
}

/**
 * Finish already committed targeting and range choices. This path never
 * replays range randomness: it rolls only the entitled boarding defence and
 * the final fleet damage deck, after all five printed attack steps are ready.
 */
export function finalizeWolfAttack(input: WolfAttackFinalizationInput): WolfCalculationReceipt {
  if (!input.requestId || typeof input.requestId !== 'string') throw new Error('requestId is required.');
  if (!Array.isArray(input.ranges) || !Array.isArray(input.boardingDefence) || !Array.isArray(input.roster) ||
      !assertRecord(input.fleetState)) throw new Error('Committed Wolf finalization inputs are incomplete.');
  if (input.fighterAceAction !== undefined &&
      (typeof input.attackId !== 'string' || input.attackId.length === 0)) {
    throw new Error('The attack identity is required to replay a Fighter Ace action.');
  }
  const targetRing = input.targetRing ?? CORE_WOLF_TARGET_RING;
  targetRingIsValid(targetRing);
  const smallRing = CORE_WOLF_TARGET_RING.filter(target => target !== 'dione');
  if (JSON.stringify(targetRing) !== JSON.stringify(smallRing) &&
      JSON.stringify(targetRing) !== JSON.stringify(CORE_WOLF_TARGET_RING) &&
      JSON.stringify(targetRing) !== JSON.stringify(EXPANDED_WOLF_TARGET_RING)) {
    throw new Error('The configured Wolf target ring must match the supported five-, six-, or seven-ship order.');
  }
  const rangeOrder = WOLF_ATTACK_RANGES.map(value => `${value}-range`);
  if (!input.targeting || JSON.stringify(input.targeting.ring) !== JSON.stringify(targetRing) ||
      !Array.isArray(input.targeting.rolls) || input.roster.length !== input.targeting.rolls.length ||
      !Array.isArray(input.ranges) || input.ranges.length !== rangeOrder.length ||
      input.ranges.some((range, index) => range?.range !== rangeOrder[index])) {
    throw new Error('The committed Wolf attack does not contain its ordered targeting and three range receipts.');
  }
  let replayRoster = [...wolfCombatRoster(input.targeting)];
  if (replayRoster.some((ship) => !targetRing.includes(ship.target))) {
    throw new Error('The targeting receipt contains a target outside its configured ring.');
  }
  if (input.fighterAceAction !== undefined && (!assertRecord(input.fighterAceAction) ||
      (input.fighterAceAction.range !== 'long' && input.fighterAceAction.range !== 'medium' &&
        input.fighterAceAction.range !== 'short'))) {
    throw new Error('The attack-bound Fighter Ace receipt has an invalid range.');
  }
  const rangeDestructionDamage = damageRecord();
  const actionIds = new Set<string>();
  let snapshotBackedRangeSeen = false;
  let fighterAceActionApplied = false;
  for (const range of input.ranges as readonly WolfRangeReceipt[]) {
    const legacyRange = range.targetSnapshot === undefined && (range.targetShifts === undefined ||
      Array.isArray(range.targetShifts) && range.targetShifts.length === 0);
    const snapshotBackedRange = Array.isArray(range.targetSnapshot) && Array.isArray(range.targetShifts);
    if ((!legacyRange && !snapshotBackedRange) || legacyRange && snapshotBackedRangeSeen ||
        !Array.isArray(range.dice) || !Array.isArray(range.assignments) ||
        !Array.isArray(range.unusedHitsByAction) ||
        !assertRecord(range.damageByInstance) || !Array.isArray(range.destroyedInstanceIds) ||
        !assertRecord(range.destructionDamageByTarget)) {
      throw new Error('Committed Wolf range receipts are malformed or out of order.');
    }
    const rangeName = range.range === 'long-range' ? 'long' : range.range === 'medium-range' ? 'medium' : 'short';
    const preRange = replayWolfPreRangeMutations(replayRoster, {
      attackId: input.attackId ?? '', turn: input.phase.turn, targetRing, range: range.range,
      ...(input.commanderRangeAdjustments?.[range.range] !== undefined
        ? { commanderAdjustment: input.commanderRangeAdjustments[range.range] } : {}),
      ...(input.fighterAceAction?.range === rangeName ? {
        fighterAceAction: input.fighterAceAction,
        persistedPermission: input.fighterAcePermissions?.[input.fighterAceAction.sourceId],
      } : {}),
    });
    replayRoster = [...preRange.roster];
    targetRing.forEach((target) => addFleetDamage(
      rangeDestructionDamage, target, preRange.destructionDamageByTarget[target],
    ));
    if (input.fighterAceAction?.range === rangeName) {
      if (fighterAceActionApplied) throw new Error('The attack contains more than one Fighter Ace range action.');
      fighterAceActionApplied = true;
    }
    if (snapshotBackedRange) {
      snapshotBackedRangeSeen = true;
      const expectedSnapshot = replayRoster.map(({ instanceId, target }) => ({ instanceId, target }));
      if (JSON.stringify(range.targetSnapshot) !== JSON.stringify(expectedSnapshot)) {
        throw new Error(`The ${range.range} target snapshot does not match the preceding committed range.`);
      }
      if (range.range !== 'medium-range' && range.targetShifts.length > 0) {
        throw new Error('Wolf target shifts are only valid during Medium Range.');
      }
      const effectiveTargets = replayWolfRangeTargetSnapshot(range.targetSnapshot, range.targetShifts, targetRing);
      if (range.targetShifts.some((shift: WolfRangeTargetShift) => replayRoster[shift.rosterIndex]?.destroyed)) {
        throw new Error('A destroyed Wolf ship cannot have its target shifted.');
      }
      replayRoster = replayRoster.map((ship, index) => ({ ...ship, target: effectiveTargets[index]!.target }));
    }

    const rangeActionIds = new Set<string>();
    const successesByAction = new Map<string, number>();
    for (const die of range.dice) {
      if (!die.actionId || typeof die.sourceId !== 'string' || !die.sourceId || actionIds.has(die.actionId) ||
          die.range !== range.range ||
          !Number.isSafeInteger(die.successes) || die.successes < 0 ||
          !Number.isSafeInteger(die.damage) || die.damage < 0 ||
          !Array.isArray(die.rolls) || die.rolls.some((roll: number) =>
            !Number.isSafeInteger(roll) || roll < 1 || roll > 1000)) {
        throw new Error('A committed Wolf range dice receipt is malformed.');
      }
      actionIds.add(die.actionId);
      rangeActionIds.add(die.actionId);
      successesByAction.set(die.actionId, die.successes);
    }
    const assignedInstanceIds = new Set<string>();
    if (range.assignments.some((assignment: WolfRangeAssignment) => !rangeActionIds.has(assignment.actionId) ||
        !Array.isArray(assignment.targetInstanceIds) ||
        new Set(assignment.targetInstanceIds).size !== assignment.targetInstanceIds.length ||
        assignment.targetInstanceIds.some((id: string) => {
          const ship = replayRoster.find((candidate) => candidate.instanceId === id);
          if (!ship || ship.destroyed) return true;
          assignedInstanceIds.add(id);
          return false;
        }))) {
      throw new Error('A committed Wolf range assignment is malformed.');
    }
    uniqueStrings(range.assignments.map((assignment: WolfRangeAssignment) => assignment.actionId),
      'Committed Wolf range assignments');
    const assignedCountByAction = new Map<string, number>();
    range.assignments.forEach((assignment: WolfRangeAssignment) => {
      assignedCountByAction.set(assignment.actionId, assignment.targetInstanceIds.length);
    });
    const expectedUnusedByAction = [...successesByAction].flatMap(([actionId, successes]) => {
      const unused = Math.max(0, successes - (assignedCountByAction.get(actionId) ?? 0));
      return unused > 0 ? [{ actionId, count: unused }] : [];
    });
    if (JSON.stringify(range.unusedHitsByAction) !== JSON.stringify(expectedUnusedByAction) ||
        range.unusedHitsByAction.some(({ actionId, count }: { actionId: string; count: number }) =>
          !rangeActionIds.has(actionId) || !Number.isSafeInteger(count) || count < 1)) {
      throw new Error('A committed Wolf unused-hit receipt is malformed.');
    }
    if (Object.keys(range.damageByInstance).some((instanceId) => !assignedInstanceIds.has(instanceId)) ||
        [...assignedInstanceIds].some((instanceId) => range.damageByInstance[instanceId] === undefined)) {
      throw new Error('A committed Wolf damage receipt does not match its target assignments.');
    }
    const expectedDestroyed: string[] = [];
    const expectedRangeDestructionDamage = damageRecord();
    for (const [instanceId, damage] of Object.entries(range.damageByInstance)) {
      const index = replayRoster.findIndex((ship) => ship.instanceId === instanceId);
      const current = replayRoster[index];
      const catalog = current ? wolfShipForId(current.shipId) : undefined;
      if (!current || current.destroyed || !catalog || !catalog.ranges[rangeName].canBeDamaged ||
          !Number.isSafeInteger(damage) || (damage as number) < 1) {
        throw new Error('A committed Wolf damage receipt is malformed.');
      }
      const damageTaken = current.damageTaken + (damage as number);
      const destroyed = damageTaken >= catalog.damageCapacity;
      replayRoster[index] = { ...current, damageTaken, destroyed };
      if (destroyed) {
        expectedDestroyed.push(instanceId);
        const effect = catalog.ranges[rangeName].ifDestroyed;
        if (effect.kind === 'target-damage') {
          addFleetDamage(expectedRangeDestructionDamage, current.target, effect.amount);
        }
      }
    }
    if (!Array.isArray(range.destroyedInstanceIds) ||
        new Set(range.destroyedInstanceIds).size !== range.destroyedInstanceIds.length ||
        JSON.stringify([...range.destroyedInstanceIds].sort()) !== JSON.stringify([...expectedDestroyed].sort())) {
      throw new Error(`The ${range.range} destruction list does not match its committed damage.`);
    }
    if (JSON.stringify(Object.keys(range.destructionDamageByTarget).sort()) !==
        JSON.stringify([...EXPANDED_WOLF_TARGET_RING].sort()) ||
        EXPANDED_WOLF_TARGET_RING.some((target) => !Number.isSafeInteger(range.destructionDamageByTarget[target]) ||
          range.destructionDamageByTarget[target] !== expectedRangeDestructionDamage[target])) {
      throw new Error('A committed Wolf destruction effect does not match the source catalog and current targets.');
    }
    targetRing.forEach((target) => addFleetDamage(rangeDestructionDamage, target, expectedRangeDestructionDamage[target]));
  }
  if (input.fighterAceAction && !fighterAceActionApplied) {
    throw new Error('The Fighter Ace action does not match an attack range.');
  }
  if (input.roster.some((ship, index) => !ship || ship.instanceId !== replayRoster[index]?.instanceId ||
      ship.shipId !== replayRoster[index]?.shipId || ship.target !== replayRoster[index]?.target ||
      ship.damageTaken !== replayRoster[index]?.damageTaken || ship.destroyed !== replayRoster[index]?.destroyed ||
      !targetRing.includes(ship.target) || !Number.isSafeInteger(ship.damageTaken) || ship.damageTaken < 0)) {
    throw new Error('The committed Wolf roster does not match its targeting and ordered range receipts.');
  }
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('now must be a finite server instant.');
  const phase = phaseReceipt(input.phase, now, true);
  for (const target of targetRing) {
    const state = input.fleetState[target];
    if (!assertRecord(state) || !assertRecord(state.damage) || !Array.isArray(state.damage.damagedSystemIds) ||
        !state.damage.damagedSystemIds.every(id => typeof id === 'string') ||
        typeof state.damage.destroyed !== 'boolean') {
      throw new Error(`A complete authoritative fleet combat state is required for ${target}.`);
    }
    requireNonNegativeInteger(state.population as number, `${target} population`);
  }
  if (input.forceFieldTargetId !== null && !targetRing.includes(input.forceFieldTargetId)) {
    throw new Error('The committed Force Field target is outside the active fleet ring.');
  }
  const random = input.randomInt ?? secureRandomInt;
  const partyCounts = boardersByTarget(replayRoster);
  const attackedTargets = targetRing.filter(target => partyCounts[target] > 0);
  uniqueStrings(input.boardingDefence.map(({ target }) => target), 'Boarding defence targets');
  if (input.boardingDefence.some(({ target, securityTeams }) => !attackedTargets.includes(target) ||
      !Number.isSafeInteger(securityTeams) || securityTeams < 0) ||
      attackedTargets.some(target => !input.boardingDefence.some(choice => choice.target === target))) {
    throw new Error('Every attacked active fleet target requires its entitled Security Teams choice.');
  }
  const boarding = resolveWolfBoarding(replayRoster, input.boardingDefence, random);
  const survival = resolveSurvivorEffects(replayRoster);
  const damageTotals = damageRecord();
  for (const target of targetRing) {
    addFleetDamage(damageTotals, target, rangeDestructionDamage[target]);
  }
  for (const [target, amount] of Object.entries(survival.fleetDamage)) {
    if ((targetRing as readonly string[]).includes(target)) addFleetDamage(damageTotals, target as WolfFleetTargetId, amount);
  }
  boarding.forEach(result => addFleetDamage(damageTotals, result.target, result.damage));

  let forceField: WolfCalculationReceipt['forceField'] = { status: 'unavailable', preventedDamage: 0 };
  if (input.forceFieldTargetId !== null) {
    const target = input.forceFieldTargetId;
    const preventedDamage = Math.min(2, damageTotals[target]);
    damageTotals[target] -= preventedDamage;
    forceField = { status: 'protected', targetShipId: target, preventedDamage };
  }
  const fleetDamage: WolfFleetDamageResult[] = [];
  targetRing.forEach(target => {
    const amount = damageTotals[target];
    if (amount < 1) return;
    const state = input.fleetState[target];
    if (!state) throw new Error(`A complete authoritative fleet combat state is required for ${target}.`);
    const result = applyWolfFleetDamage(target, amount, state, random, { exhaustedDeckPolicy: 'destroy' });
    fleetDamage.push({
      target: result.target, amount: result.amount, state: result.state,
      populationBefore: state.population, population: result.population, draws: result.draws,
    });
  });
  return deepFreeze({
    type: 'wolf-combat-calculation', version: 1, requestId: input.requestId, phase,
    targeting: input.targeting, ranges: input.ranges, boarding, fleetDamage,
    forceField,
    ...(input.fighterAceAction ? { fighterAce: input.fighterAceAction } : {}),
    returningInstanceIds: survival.returningInstanceIds,
    survivingWolfShips: replayRoster.filter(({ destroyed }) => !destroyed)
      .map(({ instanceId, shipId, target }) => ({ instanceId, shipId, target })),
  });
}

/**
 * Resolve the server-owned, deterministic shape of one Wolf attack. This is
 * the calculation boundary consumed by declaration/advancement callables: it
 * never accepts dice, damage, casualties, or staged target assignments as
 * outcomes and returns every generated sample in one immutable receipt.
 */
export function calculateWolfAttack(input: WolfAttackCalculationInput): WolfCalculationReceipt {
  if (!input.requestId || typeof input.requestId !== 'string') throw new Error('requestId is required.');
  if (!Array.isArray(input.rangeActions)) {
    throw new Error('rangeActions must be provided as authoritative input.');
  }
  if (!Array.isArray(input.rangeAssignments)) {
    throw new Error('rangeAssignments must be provided as authoritative input.');
  }
  if (!Array.isArray(input.boardingDefence)) {
    throw new Error('boardingDefence must be provided as authoritative input.');
  }
  if (!assertRecord(input.fleetState)) {
    throw new Error('fleetState must be provided as authoritative input.');
  }
  const targetRing = input.targetRing ?? CORE_WOLF_TARGET_RING;
  targetRingIsValid(targetRing);
  const smallRing = CORE_WOLF_TARGET_RING.filter(target => target !== 'dione');
  if (JSON.stringify(targetRing) !== JSON.stringify(smallRing) &&
      JSON.stringify(targetRing) !== JSON.stringify(CORE_WOLF_TARGET_RING) &&
      JSON.stringify(targetRing) !== JSON.stringify(EXPANDED_WOLF_TARGET_RING)) {
    throw new Error('The configured Wolf target ring must match the supported five-, six-, or seven-ship order.');
  }
  for (const target of targetRing) {
    const state = input.fleetState[target];
    if (!assertRecord(state) || !assertRecord(state.damage) ||
        !Array.isArray(state.damage.damagedSystemIds) ||
        !state.damage.damagedSystemIds.every(id => typeof id === 'string') ||
        typeof state.damage.destroyed !== 'boolean') {
      throw new Error(`A complete authoritative fleet combat state is required for ${target}.`);
    }
    requireNonNegativeInteger(state.population as number, `${target} population`);
  }
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('now must be a finite server instant.');
  const random = input.randomInt ?? secureRandomInt;
  const phase = phaseReceipt(input.phase, now);
  if (input.forceFieldTargetId !== undefined && input.forceFieldTargetId !== null &&
      !targetRing.includes(input.forceFieldTargetId)) {
    throw new Error('The committed Force Field target is outside the active fleet ring.');
  }
  const actionIds = input.rangeActions.map(action => action.actionId);
  uniqueStrings(actionIds, 'Wolf range action IDs');
  if (input.rangeAssignments.some(assignment => !actionIds.includes(assignment.actionId))) {
    throw new Error('A Wolf range assignment names an unknown action.');
  }
  const targeting = resolveWolfTargeting(
    input.composition,
    input.targetingModifiers,
    targetRing,
    random,
  );
  let roster = wolfCombatRoster(targeting);
  const ranges: WolfRangeReceipt[] = [];
  for (const range of WOLF_ATTACK_RANGES.map(value => `${value}-range` as WolfCombatRange)) {
    if (input.rangeActions.some(action => action.range === range)) {
      const resolved = resolveWolfRange(
        range,
        input.rangeActions,
        input.rangeAssignments.filter(assignment =>
          input.rangeActions.some(action => action.range === range && action.actionId === assignment.actionId)),
        roster,
        random,
      );
      roster = [...resolved.roster];
      ranges.push(resolved.receipt);
    }
  }
  const boarding = resolveWolfBoarding(roster, input.boardingDefence, random);
  const survival = resolveSurvivorEffects(roster);
  const damageTotals = damageRecord();
  [...ranges.flatMap(range => Object.entries(range.destructionDamageByTarget)),
    ...Object.entries(survival.fleetDamage)].forEach(([target, amount]) => {
    if ((targetRing as readonly string[]).includes(target)) {
      addFleetDamage(damageTotals, target as WolfFleetTargetId, amount as number);
    }
  });
  boarding.forEach(result => {
    if ((targetRing as readonly string[]).includes(result.target)) {
      addFleetDamage(damageTotals, result.target, result.damage);
    }
  });
  let forceField: WolfCalculationReceipt['forceField'] = { status: 'unavailable', preventedDamage: 0 };
  if (input.forceFieldTargetId) {
    const target = input.forceFieldTargetId;
    const preventedDamage = Math.min(2, damageTotals[target]);
    damageTotals[target] -= preventedDamage;
    forceField = { status: 'protected', targetShipId: target, preventedDamage };
  }
  const fleetDamage: WolfFleetDamageResult[] = [];
  targetRing.forEach((target) => {
    const amount = damageTotals[target];
    if (amount < 1) return;
    const state = input.fleetState[target];
    if (!state) throw new Error(`A complete authoritative fleet combat state is required for ${target}.`);
    const result = applyWolfFleetDamage(target, amount, state, random, { exhaustedDeckPolicy: 'destroy' });
    fleetDamage.push({ target: result.target, amount: result.amount, state: result.state,
      populationBefore: state.population, population: result.population, draws: result.draws });
  });
  return deepFreeze({
    type: 'wolf-combat-calculation',
    version: 1,
    requestId: input.requestId,
    phase,
    targeting,
    ranges,
    boarding,
    fleetDamage,
    forceField,
    returningInstanceIds: survival.returningInstanceIds,
    survivingWolfShips: roster.filter(({ destroyed }) => !destroyed)
      .map(({ instanceId, shipId, target }) => ({ instanceId, shipId, target })),
  });
}

/** Runtime guard for replaying only a complete calculation receipt. */
export function isWolfCalculationReceipt(value: unknown): value is WolfCalculationReceipt {
  if (!assertRecord(value) || value.type !== 'wolf-combat-calculation' || value.version !== 1 ||
      typeof value.requestId !== 'string' || !assertRecord(value.phase) ||
      (value.phase.phase !== 'coordination' && value.phase.phase !== 'team') || !Array.isArray(value.ranges) ||
      !Array.isArray(value.boarding) || !Array.isArray(value.fleetDamage) ||
      !Array.isArray(value.returningInstanceIds) || !assertRecord(value.targeting)) return false;
  if (value.survivingWolfShips !== undefined && (!Array.isArray(value.survivingWolfShips) ||
      value.survivingWolfShips.some((ship) => !assertRecord(ship) || typeof ship.instanceId !== 'string' ||
        typeof ship.shipId !== 'string' || typeof ship.target !== 'string'))) return false;
  return true;
}
