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
  'dione': [
    { card: '8♣', systemId: 'storage', systemName: 'Storage' },
    { card: '9♣', systemId: 'reactor', systemName: 'Reactor' },
    { card: '10♣', systemId: 'shuttle-bay', systemName: 'Shuttle Bay' },
    { card: 'J♣', systemId: 'hydroponics', systemName: 'Hydroponics' },
    { card: 'Q♣', systemId: 'water-reclamation', systemName: 'Water Reclamation' },
    { card: 'K♣', systemId: 'vip-lounge', systemName: 'VIP Lounge' },
    { card: '10♦', systemId: 'fighter-bay', systemName: 'Fighter Bay' },
    { card: 'J♦', systemId: 'jump-drive', systemName: 'Jump Drive' },
  ],
  'icebreaker': [
    { card: '8♠', systemId: 'storage', systemName: 'Storage' },
    { card: '9♠', systemId: 'reactor', systemName: 'Reactor' },
    { card: '10♠', systemId: 'shuttle-bay', systemName: 'Shuttle Bay' },
    { card: 'J♠', systemId: 'hydroponics', systemName: 'Hydroponics' },
    { card: 'Q♠', systemId: 'water-reclamation', systemName: 'Water Reclamation' },
    { card: 'K♠', systemId: 'mining-drone-control', systemName: 'Mining Drone Control' },
    { card: 'Q♦', systemId: 'jump-drive', systemName: 'Jump Drive' },
    { card: 'K♦', systemId: 'ram-scoop', systemName: 'Ram Scoop' },
  ],
  'shepherd': [
    { card: 'A♠', systemId: 'storage', systemName: 'Storage' },
    { card: '2♠', systemId: 'reactor', systemName: 'Reactor' },
    { card: '3♠', systemId: 'shuttle-bay', systemName: 'Shuttle Bay' },
    { card: '4♠', systemId: 'water-reclamation', systemName: 'Water Reclamation' },
    { card: '5♠', systemId: 'advanced-hydroponics', systemName: 'Advanced Hydroponics' },
    { card: '6♠', systemId: 'advanced-hydroponics-ii', systemName: 'Advanced Hydroponics II' },
    { card: '7♠', systemId: 'jump-drive', systemName: 'Jump Drive' },
  ],
  'quellon': [
    { card: 'A♣', systemId: 'storage', systemName: 'Storage' },
    { card: '2♣', systemId: 'reactor', systemName: 'Reactor' },
    { card: '3♣', systemId: 'shuttle-bay', systemName: 'Shuttle Bay' },
    { card: '4♣', systemId: 'hydroponics', systemName: 'Hydroponics' },
    { card: '5♣', systemId: 'water-production', systemName: 'Water Production' },
    { card: '6♣', systemId: 'water-production-ii', systemName: 'Water Production II' },
    { card: '7♣', systemId: 'jump-drive', systemName: 'Jump Drive' },
  ],
  'refinery-124': [
    { card: 'A♦', systemId: 'storage', systemName: 'Storage' },
    { card: '2♦', systemId: 'reactor', systemName: 'Reactor' },
    { card: '3♦', systemId: 'shuttle-bay', systemName: 'Shuttle Bay' },
    { card: '4♦', systemId: 'hydroponics', systemName: 'Hydroponics' },
    { card: '5♦', systemId: 'water-reclamation', systemName: 'Water Reclamation' },
    { card: '6♦', systemId: 'fuel-refinery', systemName: 'Fuel Refinery' },
    { card: '7♦', systemId: 'fuel-refinery-ii', systemName: 'Fuel Refinery II' },
    { card: '8♦', systemId: 'fighter-bay', systemName: 'Fighter Bay' },
    { card: '9♦', systemId: 'jump-drive', systemName: 'Jump Drive' },
  ],
  'capybara': [
    { card: 'A♠', systemId: 'storage', systemName: 'Storage' },
    { card: '2♠', systemId: 'advanced-hydroponics', systemName: 'Advanced Hydroponics' },
    { card: '3♠', systemId: 'reactor', systemName: 'Reactor' },
    { card: '4♠', systemId: 'water-production', systemName: 'Water Production' },
    { card: '5♠', systemId: 'jump-drive', systemName: 'Jump Drive' },
    { card: '6♠', systemId: 'shuttle-bay', systemName: 'Shuttle Bay' },
    { card: '7♠', systemId: 'scrap-refinery', systemName: 'Scrap Refinery' },
  ],

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
