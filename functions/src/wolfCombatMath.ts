import { randomInt } from 'node:crypto';
import { drawShipDamage, type ShipDamageState, type DamageCard } from './shipDamage';
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
  readonly dice: readonly WolfDiceReceipt[];
  readonly assignments: readonly WolfRangeAssignment[];
  readonly damageByInstance: Readonly<Record<string, number>>;
  readonly destroyedInstanceIds: readonly string[];
  readonly destructionDamageByTarget: Readonly<Record<WolfFleetTargetId, number>>;
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

function rosterById(roster: readonly WolfCombatShip[]): Map<string, WolfCombatShip> {
  const map = new Map<string, WolfCombatShip>();
  roster.forEach(ship => {
    if (map.has(ship.instanceId)) throw new Error('Wolf combat instance IDs must be unique.');
    map.set(ship.instanceId, ship);
  });
  return map;
}

function damageRecord(): Record<WolfFleetTargetId, number> {
  return Object.fromEntries(CORE_WOLF_TARGET_RING.map(id => [id, 0])) as Record<WolfFleetTargetId, number>;
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
  const assignmentMap = new Map(assignments.map(assignment => [assignment.actionId, assignment]));
  const rosterMap = rosterById(roster);
  const dice: WolfDiceReceipt[] = [];
  const damageByInstance: Record<string, number> = {};
  const fleetDamage = damageRecord();
  const nextRoster = new Map(rosterMap);
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
    if (targetInstanceIds.length > action.maxTargets) {
      throw new Error('A Wolf action received more targets than its printed limit.');
    }
    const requiredTargets = hasDice ? roll.successes : 1;
    if (targetInstanceIds.length !== requiredTargets) {
      throw new Error('A Wolf action must assign one target per generated hit.');
    }
    if (new Set(targetInstanceIds).size !== targetInstanceIds.length) {
      throw new Error('This Wolf action requires distinct target assignments.');
    }
    dice.push({ actionId: action.actionId, sourceId: action.sourceId, range, ...roll });
    return { action, hasDice, roll, targetInstanceIds };
  });

  // The printed rules roll every action in a range simultaneously, then
  // choose targets. Apply assignments only after every server roll is fixed.
  for (const { action, hasDice, targetInstanceIds } of rolledActions) {
    const perTargetDamage = hasDice ? action.dice!.damagePerSuccess : action.fixedDamage!;
    targetInstanceIds.forEach(instanceId => {
      const current = nextRoster.get(instanceId);
      if (!current || current.destroyed) throw new Error('Wolf damage targeted an unavailable ship.');
      if (range === 'short-range' && current.shipId === 'wolf-battlestation') {
        throw new Error('A Battlestation cannot take Short Range damage.');
      }
      if (range === 'short-range' && current.shipId !== 'wolf-fighter-wing' &&
          [...nextRoster.values()].some(ship => !ship.destroyed && ship.shipId === 'wolf-fighter-wing')) {
        throw new Error('Short Range damage must be assigned to surviving Fighter Wings first.');
      }
      damageByInstance[instanceId] = (damageByInstance[instanceId] ?? 0) + perTargetDamage;
      const catalog = wolfShipForId(current.shipId);
      if (!catalog) throw new Error('Unknown Wolf ship catalog entry.');
      const damageTaken = current.damageTaken + perTargetDamage;
      const destroyed = damageTaken >= catalog.damageCapacity;
      nextRoster.set(instanceId, { ...current, damageTaken, destroyed });
      if (destroyed) {
        destroyedInstanceIds.push(instanceId);
        const effect = catalog.ranges[range === 'long-range' ? 'long' : range === 'medium-range' ? 'medium' : 'short'].ifDestroyed;
        if (effect.kind === 'target-damage') addFleetDamage(fleetDamage, current.target, effect.amount);
      }
    });
  }
  return {
    roster: [...nextRoster.values()],
    receipt: {
      range,
      dice,
      // The returned receipt is frozen below. Clone caller-owned assignments so
      // freezing that receipt cannot freeze a request object or its target list.
      assignments: assignments
        .filter(assignment => actionIds.includes(assignment.actionId))
        .map(assignment => ({
          actionId: assignment.actionId,
          targetInstanceIds: [...assignment.targetInstanceIds],
        })),
      damageByInstance,
      destroyedInstanceIds,
      destructionDamageByTarget: fleetDamage,
    },
  };
}

export interface WolfBoardingDefence {
  readonly target: WolfFleetTargetId;
  readonly securityTeams: number;
}

export interface WolfBoardingReceipt {
  readonly target: WolfFleetTargetId;
  readonly boardingParties: number;
  readonly securityTeams: number;
  readonly rolls: readonly number[];
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

/** Resolve base boarding defence using server-owned d6s. */
export function resolveWolfBoarding(
  roster: readonly WolfCombatShip[],
  defence: readonly WolfBoardingDefence[],
  random: WolfRandomInt = secureRandomInt,
): readonly WolfBoardingReceipt[] {
  const parties = boardersByTarget(roster);
  uniqueStrings(defence.map(value => value.target), 'Boarding defence targets');
  const defenceByTarget = new Map(defence.map(value => [value.target, value]));
  return CORE_WOLF_TARGET_RING.flatMap(target => {
    const boardingParties = parties[target];
    if (boardingParties < 1) return [];
    const chosen = defenceByTarget.get(target);
    if (!chosen) {
      throw new Error(`Security-team defence is required for ${target}.`);
    }
    requireNonNegativeInteger(chosen.securityTeams, 'securityTeams');
    // Every selected security team rolls. The number of boarders only caps the
    // casualties they can inflict; it does not remove dice from the defence.
    const rolls = Array.from({ length: chosen.securityTeams },
      () => boundedRandomInt(random, 6) + 1);
    const securityCasualties = rolls.filter(roll => roll === 1).length;
    const boarderCasualties = Math.min(
      rolls.filter(roll => roll >= 4).length,
      boardingParties,
    );
    const survivingBoardingParties = Math.max(0, boardingParties - boarderCasualties);
    return [{
      target,
      boardingParties,
      securityTeams: chosen.securityTeams,
      rolls,
      securityCasualties,
      boarderCasualties,
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
): FleetDamageDrawReceipt {
  requireNonNegativeInteger(amount, 'amount');
  let state = current.damage;
  let population = current.population;
  requireNonNegativeInteger(population, 'population');
  const draws: FleetDamageDrawReceipt['draws'][number][] = [];
  for (let index = 0; index < amount; index += 1) {
    const draw = drawShipDamage(target, state, upperBound => boundedRandomInt(random, upperBound));
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
  readonly returningInstanceIds: readonly string[];
}

export interface WolfAttackCalculationInput {
  readonly requestId: string;
  readonly composition: ScheduledWolfAttackComposition;
  readonly phase: TurnPhase;
  readonly now?: number;
  readonly targetingModifiers?: WolfTargetingModifierInput;
  /** Explicitly empty arrays mean this attack has no actions/defence choices. */
  readonly rangeActions: readonly WolfRangeAction[];
  readonly rangeAssignments: readonly WolfRangeAssignment[];
  readonly boardingDefence: readonly WolfBoardingDefence[];
  /** Every target in the printed ring must have an authoritative state. */
  readonly fleetState: Readonly<Record<WolfFleetTargetId, FleetCombatState>>;
  readonly randomInt?: WolfRandomInt;
}

function phaseReceipt(phase: TurnPhase, now: number): WolfPhaseReceipt {
  const canonical = turnPhaseState(phase);
  if (!canonical || !Number.isFinite(Date.parse(canonical.openAirspaceEndsAt))) {
    throw new Error('The Wolf combat deadline is not a valid server instant.');
  }
  const overrun = now >= Date.parse(canonical.openAirspaceEndsAt);
  if (canonical.airspace.state !== 'lifted' && !overrun) {
    throw new Error('Wolf combat resolves during the Coordination phase.');
  }
  return {
    turn: canonical.turn,
    phase: canonical.airspace.state === 'lifted' ? 'coordination' : 'team',
    serverTime: new Date(now).toISOString(),
    deadlineAt: canonical.openAirspaceEndsAt,
    // The routed rules allow a Wolf attack to overrun into Team Phase. Record
    // that fact for the receipt; do not invent a per-step deadline policy.
    overrun,
  };
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
  for (const target of CORE_WOLF_TARGET_RING) {
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
  const actionIds = input.rangeActions.map(action => action.actionId);
  uniqueStrings(actionIds, 'Wolf range action IDs');
  if (input.rangeAssignments.some(assignment => !actionIds.includes(assignment.actionId))) {
    throw new Error('A Wolf range assignment names an unknown action.');
  }
  const targeting = resolveWolfTargeting(
    input.composition,
    input.targetingModifiers,
    CORE_WOLF_TARGET_RING,
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
    if ((CORE_WOLF_TARGET_RING as readonly string[]).includes(target)) {
      addFleetDamage(damageTotals, target as typeof CORE_WOLF_TARGET_RING[number], amount as number);
    }
  });
  boarding.forEach(result => {
    // The current calculation entry point resolves the base six-ship fleet.
    // Expansion targeting has its own ring and later damage contract; do not
    // turn an unconfigured Capybara fleet state into an implicit crash here.
    if ((CORE_WOLF_TARGET_RING as readonly string[]).includes(result.target)) {
      addFleetDamage(damageTotals, result.target as typeof CORE_WOLF_TARGET_RING[number], result.damage);
    }
  });
  const fleetDamage: WolfFleetDamageResult[] = [];
  Object.entries(damageTotals).forEach(([target, amount]) => {
    if (amount < 1) return;
    const state = input.fleetState[target as WolfFleetTargetId];
    const result = applyWolfFleetDamage(target as WolfFleetTargetId, amount, state, random);
    fleetDamage.push({ target: result.target, amount: result.amount, state: result.state, population: result.population, draws: result.draws });
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
    returningInstanceIds: survival.returningInstanceIds,
  });
}

/** Runtime guard for replaying only a complete calculation receipt. */
export function isWolfCalculationReceipt(value: unknown): value is WolfCalculationReceipt {
  if (!assertRecord(value) || value.type !== 'wolf-combat-calculation' || value.version !== 1 ||
      typeof value.requestId !== 'string' || !assertRecord(value.phase) ||
      (value.phase.phase !== 'coordination' && value.phase.phase !== 'team') || !Array.isArray(value.ranges) ||
      !Array.isArray(value.boarding) || !Array.isArray(value.fleetDamage) ||
      !Array.isArray(value.returningInstanceIds) || !assertRecord(value.targeting)) return false;
  return true;
}
