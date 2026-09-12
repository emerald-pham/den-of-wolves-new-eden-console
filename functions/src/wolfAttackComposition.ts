import { WOLF_SHIP_IDS, wolfShipForId, type WolfShipId } from './wolfShipCatalog';

export interface ScheduledWolfAttackComposition {
  readonly shipIds: readonly WolfShipId[];
  readonly counts: Readonly<Record<WolfShipId, number>>;
  readonly damageCapacity: number;
}

/** Ordinary scheduled attacks only; encounter and Commander attacks have separate rules. */
export function scheduledWolfAttackComposition(
  turn: number,
  shipIds: readonly string[],
): ScheduledWolfAttackComposition {
  if (!Number.isSafeInteger(turn) || turn < 1) throw new Error('Invalid attack turn.');
  // Every card has at least one capacity, so a legal scheduled attack cannot exceed 24 cards.
  if (!Array.isArray(shipIds) || shipIds.length > 24) throw new Error('Invalid attack composition.');
  const counts = Object.fromEntries(WOLF_SHIP_IDS.map((id) => [id, 0])) as Record<WolfShipId, number>;
  const validatedIds: WolfShipId[] = [];
  let damageCapacity = 0;
  for (const id of shipIds) {
    const ship = wolfShipForId(id);
    if (!ship) throw new Error('Unknown Wolf ship.');
    counts[ship.id] += 1;
    validatedIds.push(ship.id);
    damageCapacity += ship.damageCapacity;
  }
  if (turn === 1) {
    if (validatedIds.length !== 15 || counts['wolf-fighter-wing'] !== 10 ||
        counts['wolf-assault-transport'] !== 5) {
      throw new Error('The first attack requires ten fighter wings and five assault transports.');
    }
  } else if (damageCapacity < 15 || damageCapacity > 24) {
    throw new Error('A later scheduled attack requires 15 to 24 damage capacity.');
  }
  return Object.freeze({
    shipIds: Object.freeze(validatedIds),
    counts: Object.freeze(counts),
    damageCapacity,
  });
}

/** A deterministic server-side starting roster, independent of any submitted card choices. */
export function firstTurnWolfAttackComposition(): ScheduledWolfAttackComposition {
  return scheduledWolfAttackComposition(1, [
    ...Array<string>(10).fill('wolf-fighter-wing'),
    ...Array<string>(5).fill('wolf-assault-transport'),
  ]);
}
