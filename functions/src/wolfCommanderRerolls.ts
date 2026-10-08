import {
  CORE_WOLF_TARGET_RING,
  EXPANDED_WOLF_TARGET_RING,
  type WolfTargetRing,
  type WolfTargetingReceipt,
  type WolfTargetingRollReceipt,
  type WolfRandomInt,
  wolfTargetForDie,
} from './wolfCombatMath';
import { WOLF_SHIP_IDS, type WolfShipId } from './wolfShipCatalog';

export type WolfCommanderTargetingView = Readonly<{
  type: 'wolf-commander-targeting-view';
  sessionId: string;
  turn: number;
  revision: number;
  currentStep: 'targeting';
  rerollsFinalized: boolean;
  rolls: readonly {
    readonly rosterIndex: number;
    readonly shipId: WolfShipId;
    readonly die: number;
    readonly target: string;
  }[];
  eligibleRerollIndexes: readonly number[];
  rerolledIndexes: readonly number[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalSourceRing(value: unknown): value is WolfTargetRing {
  return JSON.stringify(value) === JSON.stringify(CORE_WOLF_TARGET_RING.filter(target => target !== 'dione')) ||
    JSON.stringify(value) === JSON.stringify(CORE_WOLF_TARGET_RING) ||
    JSON.stringify(value) === JSON.stringify(EXPANDED_WOLF_TARGET_RING);
}

function isOrderedParticipatingRing(value: unknown, sourceRing: WolfTargetRing): value is WolfTargetRing {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((target) => typeof target !== 'string') || new Set(value).size !== value.length) return false;
  let previousIndex = -1;
  return value.every((target) => {
    const index = sourceRing.indexOf(target as WolfTargetRing[number]);
    if (index <= previousIndex) return false;
    previousIndex = index;
    return true;
  });
}

function isWolfShipId(value: unknown): value is WolfShipId {
  return (WOLF_SHIP_IDS as readonly unknown[]).includes(value);
}

function isResolvedDie(value: unknown, ring: WolfTargetRing): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= ring.length;
}

function isModifiers(value: unknown): value is WolfTargetingRollReceipt['modifiers'] {
  if (!Array.isArray(value) || value.some((modifier) =>
    modifier !== 'commander-reroll' && modifier !== 'target-shift' &&
    modifier !== 'command-and-control-redirect')) return false;
  const allowedOrder = ['commander-reroll', 'target-shift', 'command-and-control-redirect'];
  return new Set(value).size === value.length && value.every((modifier, index) =>
    index === 0 || allowedOrder.indexOf(modifier) > allowedOrder.indexOf(value[index - 1]!));
}

function parseRoll(
  value: unknown,
  rosterIndex: number,
  ring: WolfTargetRing,
  sourceRing: WolfTargetRing,
): WolfTargetingRollReceipt | undefined {
  if (!isRecord(value) || value.rosterIndex !== rosterIndex || !isWolfShipId(value.shipId) ||
      !isResolvedDie(value.initialDie, ring) || !isResolvedDie(value.finalDie, ring) ||
      typeof value.target !== 'string' || !ring.includes(value.target as never) ||
      !isModifiers(value.modifiers)) return undefined;
  if (value.sourceDie !== undefined && !isResolvedDie(value.sourceDie, sourceRing)) return undefined;
  if (value.commanderSourceDie !== undefined && !isResolvedDie(value.commanderSourceDie, sourceRing)) return undefined;
  if (value.rerollDie !== undefined && !isResolvedDie(value.rerollDie, ring)) return undefined;
  if (value.shiftedDie !== undefined && !isResolvedDie(value.shiftedDie, ring)) return undefined;
  const nonparticipatingRerolls = value.nonparticipatingTargetRerolls;
  const commanderNonparticipatingRerolls = value.commanderNonparticipatingTargetRerolls;
  if (nonparticipatingRerolls !== undefined && nonparticipatingRerolls !== 1 ||
      commanderNonparticipatingRerolls !== undefined && commanderNonparticipatingRerolls !== 1) return undefined;
  if (value.sourceDie !== undefined) {
    const initialSourceTarget = wolfTargetForDie(value.sourceDie, sourceRing);
    const initialTargetParticipates = ring.includes(initialSourceTarget);
    if (initialTargetParticipates !== (nonparticipatingRerolls === undefined) ||
        initialTargetParticipates && value.initialDie !== ring.indexOf(initialSourceTarget) + 1) return undefined;
  } else if (nonparticipatingRerolls !== undefined) return undefined;
  if (value.commanderSourceDie !== undefined) {
    if (value.rerollDie === undefined) return undefined;
    const commanderSourceTarget = wolfTargetForDie(value.commanderSourceDie, sourceRing);
    const commanderTargetParticipates = ring.includes(commanderSourceTarget);
    if (commanderTargetParticipates !== (commanderNonparticipatingRerolls === undefined) ||
        commanderTargetParticipates && value.rerollDie !== ring.indexOf(commanderSourceTarget) + 1) return undefined;
  } else if (commanderNonparticipatingRerolls !== undefined) return undefined;
  const printedRerolls = value.printedRerolls;
  const commanderPrintedRerolls = value.commanderPrintedRerolls;
  if (!sourceRing.includes('capybara') && (printedRerolls !== undefined || commanderPrintedRerolls !== undefined)) {
    return undefined;
  }
  if (printedRerolls !== undefined && (!Array.isArray(printedRerolls) ||
      printedRerolls.length < 1 || printedRerolls.some((die) => die !== 8))) return undefined;
  if (commanderPrintedRerolls !== undefined && (!Array.isArray(commanderPrintedRerolls) ||
      commanderPrintedRerolls.length < 1 || commanderPrintedRerolls.some((die) => die !== 8))) return undefined;
  const modifiers = value.modifiers as WolfTargetingRollReceipt['modifiers'];
  const hasCommanderReroll = modifiers.includes('commander-reroll');
  const hasTargetShift = modifiers.includes('target-shift');
  const hasRedirect = modifiers.includes('command-and-control-redirect');
  if ((value.rerollDie === undefined) !== !hasCommanderReroll ||
      (value.shiftedDie === undefined) !== !hasTargetShift ||
      (commanderPrintedRerolls !== undefined && !hasCommanderReroll) ||
      (printedRerolls !== undefined && !sourceRing.includes('capybara'))) return undefined;
  const expectedFinalDie = value.shiftedDie ?? value.rerollDie ?? value.initialDie;
  if (value.finalDie !== expectedFinalDie) return undefined;
  if (hasRedirect ? value.target !== 'aegis' : value.target !== wolfTargetForDie(value.finalDie, ring)) {
    return undefined;
  }
  return {
    rosterIndex,
    shipId: value.shipId,
    initialDie: value.initialDie,
    ...(value.sourceDie === undefined ? {} : { sourceDie: value.sourceDie as number }),
    ...(nonparticipatingRerolls === undefined ? {} : { nonparticipatingTargetRerolls: 1 as const }),
    ...(value.rerollDie === undefined ? {} : { rerollDie: value.rerollDie }),
    ...(value.commanderSourceDie === undefined ? {} : { commanderSourceDie: value.commanderSourceDie as number }),
    ...(commanderNonparticipatingRerolls === undefined
      ? {} : { commanderNonparticipatingTargetRerolls: 1 as const }),
    ...(value.shiftedDie === undefined ? {} : { shiftedDie: value.shiftedDie }),
    finalDie: value.finalDie,
    target: value.target as WolfTargetingRollReceipt['target'],
    ...(printedRerolls === undefined ? {} : { printedRerolls: [...printedRerolls] as number[] }),
    ...(commanderPrintedRerolls === undefined
      ? {} : { commanderPrintedRerolls: [...commanderPrintedRerolls] as number[] }),
    modifiers: [...modifiers],
  };
}

/** Parse only the targeting receipt fields needed by the next private action. */
export function parseWolfTargetingReceipt(value: unknown): WolfTargetingReceipt | undefined {
  if (!isRecord(value) || !Array.isArray(value.ring) || !Array.isArray(value.rolls) ||
      value.rolls.length === 0 || value.modifierOrder === undefined ||
      JSON.stringify(value.modifierOrder) !== JSON.stringify([
        'commander-reroll', 'target-shift', 'command-and-control-redirect',
      ])) return undefined;
  const sourceRing = value.sourceRing === undefined ? value.ring : value.sourceRing;
  if (!isCanonicalSourceRing(sourceRing) || !isOrderedParticipatingRing(value.ring, sourceRing) ||
      value.sourceRing === undefined && !isCanonicalSourceRing(value.ring)) return undefined;
  const ring = value.ring as WolfTargetRing;
  if (JSON.stringify(sourceRing) !== JSON.stringify(ring) &&
      (!Array.isArray(value.rolls) || value.rolls.some((roll) => !isRecord(roll) ||
        !Number.isSafeInteger(roll.sourceDie) ||
        roll.rerollDie !== undefined && !Number.isSafeInteger(roll.commanderSourceDie)))) return undefined;
  const rolls = value.rolls.map((roll, index) => parseRoll(roll, index, ring, sourceRing));
  if (rolls.some((roll): roll is undefined => roll === undefined)) return undefined;
  return {
    ring: [...ring],
    sourceRing: [...sourceRing],
    rolls: rolls as WolfTargetingRollReceipt[],
    modifierOrder: ['commander-reroll', 'target-shift', 'command-and-control-redirect'],
  };
}

function validateIndexes(indexes: readonly number[], rosterLength: number): void {
  if (new Set(indexes).size !== indexes.length || indexes.some((index) =>
    !Number.isSafeInteger(index) || index < 0 || index >= rosterLength)) {
    throw new Error('Commander rerolls must contain unique eligible roster indexes.');
  }
}

/**
 * Apply only the selected Commander rerolls to an existing server receipt.
 * Initial rolls and every unselected roll are copied without regeneration.
 */
export function applyWolfCommanderRerolls(
  receipt: WolfTargetingReceipt,
  indexes: readonly number[],
  random: WolfRandomInt,
): WolfTargetingReceipt {
  validateIndexes(indexes, receipt.rolls.length);
  const selected = new Set(indexes);
  const alreadyRerolled = receipt.rolls.filter((roll) =>
    selected.has(roll.rosterIndex) &&
    (roll.rerollDie !== undefined || roll.modifiers.includes('commander-reroll')),
  );
  if (alreadyRerolled.length > 0) {
    throw new Error('A Commander targeting die may be rerolled only once.');
  }
  if (receipt.rolls.some((roll) => selected.has(roll.rosterIndex) &&
      (roll.shiftedDie !== undefined || roll.modifiers.includes('target-shift') ||
       roll.modifiers.includes('command-and-control-redirect')))) {
    throw new Error('Commander rerolls close before later targeting modifiers.');
  }
  const sourceRing = receipt.sourceRing ?? receipt.ring;
  const upperBound = sourceRing.includes('capybara') ? 8 : sourceRing.length;
  const boundedSample = (bound: number): number => {
    const value = random(bound);
    if (!Number.isSafeInteger(value) || value < 0 || value >= bound) {
      throw new Error('The server randomness source returned an invalid sample.');
    }
    return value;
  };
  const rollConfiguredDie = (): {
    readonly die: number;
    readonly sourceDie: number;
    readonly printedRerolls: readonly number[];
    readonly nonparticipatingTargetRerolls: 0 | 1;
  } => {
    const printedRerolls: number[] = [];
    let sourceDie = boundedSample(upperBound) + 1;
    while (sourceRing.includes('capybara') && sourceDie === 8) {
      printedRerolls.push(sourceDie);
      sourceDie = boundedSample(upperBound) + 1;
    }
    const sourceTarget = wolfTargetForDie(sourceDie, sourceRing);
    const participatingDie = receipt.ring.indexOf(sourceTarget);
    if (participatingDie >= 0) {
      return { die: participatingDie + 1, sourceDie, printedRerolls, nonparticipatingTargetRerolls: 0 };
    }
    return {
      die: boundedSample(receipt.ring.length) + 1,
      sourceDie,
      printedRerolls,
      nonparticipatingTargetRerolls: 1,
    };
  };
  const rolls = receipt.rolls.map((roll) => {
    if (!selected.has(roll.rosterIndex)) return roll;
    const commander = rollConfiguredDie();
    return {
      ...roll,
      rerollDie: commander.die,
      commanderSourceDie: commander.sourceDie,
      ...(commander.nonparticipatingTargetRerolls === 0
        ? {} : { commanderNonparticipatingTargetRerolls: 1 as const }),
      finalDie: commander.die,
      target: wolfTargetForDie(commander.die, receipt.ring),
      ...(commander.printedRerolls.length === 0
        ? {} : { commanderPrintedRerolls: commander.printedRerolls }),
      modifiers: [...roll.modifiers, 'commander-reroll'] as WolfTargetingRollReceipt['modifiers'],
    };
  });
  return { ...receipt, rolls };
}

export function commanderRerollIndexesFromReceipt(receipt: WolfTargetingReceipt): readonly number[] {
  return receipt.rolls.flatMap((roll) =>
    roll.rerollDie === undefined && !roll.modifiers.includes('commander-reroll')
      ? [] : [roll.rosterIndex]);
}

export function commanderTargetingView(
  sessionId: string,
  turn: number,
  revision: number,
  receipt: WolfTargetingReceipt,
  rerollsFinalized = false,
): WolfCommanderTargetingView {
  const rerolledIndexes = commanderRerollIndexesFromReceipt(receipt);
  const rerolled = new Set(rerolledIndexes);
  return {
    type: 'wolf-commander-targeting-view',
    sessionId,
    turn,
    revision,
    currentStep: 'targeting',
    rerollsFinalized,
    rolls: receipt.rolls.map((roll) => ({
      rosterIndex: roll.rosterIndex,
      shipId: roll.shipId,
      die: roll.finalDie,
      target: roll.target,
    })),
    eligibleRerollIndexes: rerollsFinalized
      ? []
      : receipt.rolls.flatMap((roll) => rerolled.has(roll.rosterIndex) ? [] : [roll.rosterIndex]),
    rerolledIndexes,
  };
}
