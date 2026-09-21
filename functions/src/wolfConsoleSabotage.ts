import { SHIP_DAMAGE_DECKS, type DamageCard, type ShipDamageState } from './shipDamage';

export const WOLF_CONSOLE_VISIT_MIN_MS = 10_000;
export const WOLF_CONSOLE_VISIT_MAX_MS = 60_000;

export type WolfConsoleSabotageMode = 'random' | 'chosen';

export interface WolfConsoleSabotageResolution {
  readonly card: DamageCard;
  readonly mode: WolfConsoleSabotageMode;
  readonly suspicionIncrement: 2 | 4;
  readonly state: ShipDamageState;
}

/** Console sabotage cannot select the two AEGIS armour cards. */
export function remainingConsoleSabotageTargets(
  shipId: string,
  damage: ShipDamageState,
): readonly DamageCard[] {
  const deck = SHIP_DAMAGE_DECKS[shipId];
  if (!deck) throw new Error('This ship has no implemented console damage deck.');
  if (damage.destroyed) throw new Error('A destroyed ship cannot receive console sabotage.');
  const damaged = new Set(damage.damagedSystemIds);
  return deck.filter(({ systemId }) =>
    !systemId.startsWith('armoured-hull') && !damaged.has(systemId));
}

/** Resolve the target without accepting a client-generated damage outcome. */
export function resolveWolfConsoleSabotage(
  input: {
    readonly shipId: string;
    readonly damage: ShipDamageState;
    readonly mode: WolfConsoleSabotageMode;
    readonly chosenSystemId?: string;
  },
  randomIndex: (upperBound: number) => number,
): WolfConsoleSabotageResolution {
  const remaining = remainingConsoleSabotageTargets(input.shipId, input.damage);
  if (remaining.length === 0) throw new Error('This ship has no undamaged console available.');
  let card: DamageCard | undefined;
  if (input.mode === 'chosen') {
    card = remaining.find(({ systemId }) => systemId === input.chosenSystemId);
    if (!card) throw new Error('The chosen console is unavailable.');
  } else {
    if (input.chosenSystemId !== undefined) {
      throw new Error('Random console sabotage cannot include a chosen console.');
    }
    const index = randomIndex(remaining.length);
    if (!Number.isInteger(index) || index < 0 || index >= remaining.length) {
      throw new Error('Console sabotage index is outside the remaining deck.');
    }
    card = remaining[index];
  }
  if (!card) throw new Error('Console sabotage could not select a target.');
  return {
    card,
    mode: input.mode,
    suspicionIncrement: input.mode === 'chosen' ? 4 : 2,
    state: {
      damagedSystemIds: [...input.damage.damagedSystemIds, card.systemId],
      destroyed: false,
    },
  };
}

export function requireWolfConsoleVisitWindow(startedAtMillis: number, resolvedAtMillis: number): void {
  if (!Number.isSafeInteger(startedAtMillis) || !Number.isSafeInteger(resolvedAtMillis)) {
    throw new Error('The console visit timing record is malformed.');
  }
  const elapsed = resolvedAtMillis - startedAtMillis;
  if (elapsed < WOLF_CONSOLE_VISIT_MIN_MS) {
    throw new Error('Keep the player adjacent to the console for at least 10 seconds.');
  }
  if (elapsed > WOLF_CONSOLE_VISIT_MAX_MS) {
    throw new Error('The facilitator confirmation window has expired.');
  }
}
