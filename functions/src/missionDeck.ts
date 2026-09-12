import { randomInt } from 'node:crypto';

export const MISSION_DECK_SCHEMA_VERSION = 1 as const;
export const MISSION_DECK_ID = 'away-mission-v1' as const;

export const MISSION_DECK_SUITS = ['hearts', 'diamonds', 'clubs'] as const;
export type MissionDeckSuit = typeof MISSION_DECK_SUITS[number];

const MISSION_DECK_SUIT_SYMBOLS = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
} as const satisfies Record<MissionDeckSuit, string>;
export type MissionDeckSuitSymbol = typeof MISSION_DECK_SUIT_SYMBOLS[MissionDeckSuit];

export const MISSION_DECK_RANKS = [
  'A', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
] as const;
export type MissionDeckRank = typeof MISSION_DECK_RANKS[number];
export type MissionCardId = `${MissionDeckRank}${MissionDeckSuitSymbol}`;

const MISSION_CARD_VALUES = {
  A: 10,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: -5,
  Q: -5,
  K: -5,
} as const satisfies Record<MissionDeckRank, number>;

export interface MissionCard {
  readonly id: MissionCardId;
  readonly rank: MissionDeckRank;
  readonly suit: MissionDeckSuit;
  readonly value: number;
}

export interface MissionDeckState {
  readonly schemaVersion: typeof MISSION_DECK_SCHEMA_VERSION;
  readonly deckId: typeof MISSION_DECK_ID;
  readonly order: readonly MissionCardId[];
}

export type MissionDeckRandomIndex = (upperBound: number) => number;

const cryptographicRandomIndex: MissionDeckRandomIndex = (upperBound) => randomInt(upperBound);

function missionCardId(rank: MissionDeckRank, suit: MissionDeckSuit): MissionCardId {
  return `${rank}${MISSION_DECK_SUIT_SYMBOLS[suit]}` as MissionCardId;
}

function cardFromId(id: MissionCardId): MissionCard {
  const symbol = id.slice(-1) as MissionDeckSuitSymbol;
  const suit = (Object.entries(MISSION_DECK_SUIT_SYMBOLS)
    .find(([, candidate]) => candidate === symbol)?.[0] ?? '') as MissionDeckSuit;
  const rank = id.slice(0, -1) as MissionDeckRank;
  return { id, rank, suit, value: MISSION_CARD_VALUES[rank] };
}

/** The printed mission deck: three suits, with 2s and 3s omitted. */
export function missionDeck(): readonly MissionCard[] {
  return MISSION_DECK_SUITS.flatMap((suit) =>
    MISSION_DECK_RANKS.map((rank) => ({
      id: missionCardId(rank, suit),
      rank,
      suit,
      value: MISSION_CARD_VALUES[rank],
    })),
  );
}

/** Fisher-Yates shuffle using Node's cryptographically secure randomInt. */
export function shuffledMissionDeck(
  randomIndex: MissionDeckRandomIndex = cryptographicRandomIndex,
): readonly MissionCard[] {
  const cards = [...missionDeck()];
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapWith = randomIndex(index + 1);
    if (!Number.isInteger(swapWith) || swapWith < 0 || swapWith > index) {
      throw new Error('Mission deck shuffle index is outside the remaining deck.');
    }
    [cards[index], cards[swapWith]] = [cards[swapWith]!, cards[index]!];
  }
  return cards;
}

export function missionDeckStateFromCards(cards: readonly MissionCard[]): MissionDeckState {
  const order = cards.map((card) => card.id);
  if (!isCompleteMissionDeckOrder(order)) {
    throw new Error('Mission deck order must contain every printed card exactly once.');
  }
  return {
    schemaVersion: MISSION_DECK_SCHEMA_VERSION,
    deckId: MISSION_DECK_ID,
    order,
  };
}

/** Parse persisted server state and fail closed on a forged or stale order. */
export function parseMissionDeckState(value: unknown): MissionDeckState | null {
  if (!isRecord(value) || value.schemaVersion !== MISSION_DECK_SCHEMA_VERSION ||
      value.deckId !== MISSION_DECK_ID || !Array.isArray(value.order) ||
      !isCompleteMissionDeckOrder(value.order)) {
    return null;
  }
  return {
    schemaVersion: MISSION_DECK_SCHEMA_VERSION,
    deckId: MISSION_DECK_ID,
    order: [...value.order] as MissionCardId[],
  };
}

export function missionCardsForState(state: MissionDeckState): readonly MissionCard[] {
  return state.order.map(cardFromId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCompleteMissionDeckOrder(value: unknown): value is MissionCardId[] {
  if (!Array.isArray(value) || value.length !== MISSION_DECK_SUITS.length * MISSION_DECK_RANKS.length) {
    return false;
  }
  const expected = new Set(missionDeck().map((card) => card.id));
  const order = value.filter((card): card is MissionCardId => typeof card === 'string');
  return order.length === value.length && new Set(order).size === expected.size &&
    order.every((card) => expected.has(card));
}
