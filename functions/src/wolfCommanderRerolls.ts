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

function isTargetRing(value: unknown): value is WolfTargetRing {
  return JSON.stringify(value) === JSON.stringify(CORE_WOLF_TARGET_RING) ||
    JSON.stringify(value) === JSON.stringify(EXPANDED_WOLF_TARGET_RING);
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

function parseRoll(value: unknown, rosterIndex: number, ring: WolfTargetRing): WolfTargetingRollReceipt | undefined {
  if (!isRecord(value) || value.rosterIndex !== rosterIndex || !isWolfShipId(value.shipId) ||
      !isResolvedDie(value.initialDie, ring) || !isResolvedDie(value.finalDie, ring) ||
      typeof value.target !== 'string' || !ring.includes(value.target as never) ||
      !isModifiers(value.modifiers)) return undefined;
  if (value.rerollDie !== undefined && !isResolvedDie(value.rerollDie, ring)) return undefined;
  if (value.shiftedDie !== undefined && !isResolvedDie(value.shiftedDie, ring)) return undefined;
  const printedRerolls = value.printedRerolls;
  const commanderPrintedRerolls = value.commanderPrintedRerolls;
  if (!ring.includes('capybara') && (printedRerolls !== undefined || commanderPrintedRerolls !== undefined)) {
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
      (printedRerolls !== undefined && !ring.includes('capybara'))) return undefined;
  const expectedFinalDie = value.shiftedDie ?? value.rerollDie ?? value.initialDie;
  if (value.finalDie !== expectedFinalDie) return undefined;
  if (hasRedirect ? value.target !== 'aegis' : value.target !== wolfTargetForDie(value.finalDie, ring)) {
    return undefined;
  }
  return {
    rosterIndex,
    shipId: value.shipId,
    initialDie: value.initialDie,
    ...(value.rerollDie === undefined ? {} : { rerollDie: value.rerollDie }),
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
  if (!isRecord(value) || !isTargetRing(value.ring) || !Array.isArray(value.rolls) ||
      value.rolls.length === 0 || value.modifierOrder === undefined ||
      JSON.stringify(value.modifierOrder) !== JSON.stringify([
        'commander-reroll', 'target-shift', 'command-and-control-redirect',
      ])) return undefined;
  const ring = value.ring;
  const rolls = value.rolls.map((roll, index) => parseRoll(roll, index, ring));
  if (rolls.some((roll): roll is undefined => roll === undefined)) return undefined;
  return {
    ring: [...ring],
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
  const upperBound = receipt.ring.includes('capybara') ? 8 : receipt.ring.length;
  const rollConfiguredDie = (): { readonly die: number; readonly printedRerolls: readonly number[] } => {
    const printedRerolls: number[] = [];
    let die = random(upperBound) + 1;
    if (!Number.isSafeInteger(die - 1) || die < 1 || die > upperBound) {
      throw new Error('The server randomness source returned an invalid sample.');
    }
    while (receipt.ring.includes('capybara') && die === 8) {
      printedRerolls.push(die);
      die = random(upperBound) + 1;
      if (!Number.isSafeInteger(die - 1) || die < 1 || die > upperBound) {
        throw new Error('The server randomness source returned an invalid sample.');
      }
    }
    return { die, printedRerolls };
  };
  const rolls = receipt.rolls.map((roll) => {
    if (!selected.has(roll.rosterIndex)) return roll;
    const commander = rollConfiguredDie();
    return {
      ...roll,
      rerollDie: commander.die,
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
): WolfCommanderTargetingView {
  const rerolledIndexes = commanderRerollIndexesFromReceipt(receipt);
  const rerolled = new Set(rerolledIndexes);
  return {
    type: 'wolf-commander-targeting-view',
    sessionId,
    turn,
    revision,
    currentStep: 'targeting',
    rolls: receipt.rolls.map((roll) => ({
      rosterIndex: roll.rosterIndex,
      shipId: roll.shipId,
      die: roll.finalDie,
      target: roll.target,
    })),
    eligibleRerollIndexes: receipt.rolls.flatMap((roll) => rerolled.has(roll.rosterIndex) ? [] : [roll.rosterIndex]),
    rerolledIndexes,
  };
}
