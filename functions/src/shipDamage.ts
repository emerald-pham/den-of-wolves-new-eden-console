export interface DamageCard {
  readonly card: string;
  readonly systemId: string;
  readonly systemName: string;
  readonly recycleAfterResolution?: boolean;
}

export interface ShipDamageState {
  readonly damagedSystemIds: readonly string[];
  readonly destroyed: boolean;
}

export const AEGIS_DAMAGE_DECK: readonly DamageCard[] = [
  { card: 'A♥', systemId: 'fighter-bay-alpha', systemName: 'Fighter Bay Alpha' },
  { card: '2♥', systemId: 'fighter-bay-bravo', systemName: 'Fighter Bay Bravo' },
  { card: '3♥', systemId: 'command-and-control', systemName: 'Command and Control' },
  { card: '4♥', systemId: 'missile-launchers', systemName: 'Missile Launchers' },
  { card: '5♥', systemId: 'point-defence-lasers', systemName: 'Point Defence Lasers' },
  {
    card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I',
    recycleAfterResolution: true,
  },
  {
    card: '7♥', systemId: 'armoured-hull-ii', systemName: 'Armoured Hull II',
    recycleAfterResolution: true,
  },
  { card: '8♥', systemId: 'storage', systemName: 'Storage' },
  { card: '9♥', systemId: 'jump-drive', systemName: 'Jump Drive' },
  { card: '10♥', systemId: 'reactor', systemName: 'Reactor' },
  { card: 'J♥', systemId: 'construction-bay', systemName: 'Construction Bay' },
  { card: 'Q♥', systemId: 'shuttle-bay-zeta', systemName: 'Shuttle Bay Zeta' },
  { card: 'K♥', systemId: 'shuttle-bay-omega', systemName: 'Shuttle Bay Omega' },
];

export const SHIP_DAMAGE_DECKS: Readonly<Record<string, readonly DamageCard[]>> = {
  aegis: AEGIS_DAMAGE_DECK,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Restore a safe damage snapshot from a legacy or partially malformed session. */
export function shipDamage(value: unknown): Record<string, ShipDamageState> {
  if (!isRecord(value)) return {};
  const result: Record<string, ShipDamageState> = {};
  for (const [shipId, deck] of Object.entries(SHIP_DAMAGE_DECKS)) {
    const stored = value[shipId];
    if (!isRecord(stored)) continue;
    const knownIds = new Set(deck.map(({ systemId }) => systemId));
    const damagedSystemIds = Array.isArray(stored.damagedSystemIds)
      ? [...new Set(stored.damagedSystemIds.filter(
        (id): id is string => typeof id === 'string' && knownIds.has(id),
      ))]
      : [];
    result[shipId] = { damagedSystemIds, destroyed: stored.destroyed === true };
  }
  return result;
}

export type DamageDrawResult =
  | { readonly state: ShipDamageState; readonly destroyed: true }
  | {
    readonly state: ShipDamageState;
    readonly destroyed: false;
    readonly card: DamageCard;
    readonly recycled: boolean;
  };

/** Draw a remaining damage card; the injected index keeps the rules deterministic in tests. */
export function drawShipDamage(
  shipId: string,
  state: ShipDamageState,
  randomIndex: (upperBound: number) => number,
): DamageDrawResult {
  const deck = SHIP_DAMAGE_DECKS[shipId];
  if (!deck) throw new Error('This ship has no implemented damage deck.');
  if (state.destroyed) return { state, destroyed: true };

  const damaged = new Set(state.damagedSystemIds);
  const remaining = deck.filter(({ systemId }) => !damaged.has(systemId));
  if (remaining.length === 0) {
    return { state: { ...state, destroyed: true }, destroyed: true };
  }
  const index = randomIndex(remaining.length);
  if (!Number.isInteger(index) || index < 0 || index >= remaining.length) {
    throw new Error('Damage card index is outside the remaining deck.');
  }
  const card = remaining[index]!;
  const recycled = card.recycleAfterResolution === true && remaining.length > 1;
  const nextDamaged = recycled
    ? [...state.damagedSystemIds]
    : [...state.damagedSystemIds, card.systemId];
  return {
    card,
    recycled,
    destroyed: false,
    state: { damagedSystemIds: nextDamaged, destroyed: false },
  };
}
