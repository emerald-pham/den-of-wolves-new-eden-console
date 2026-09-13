/**
 * Server-owned Dione VIP Lounge deck.
 *
 * The printed sheet names nine physical cards.  Their later maintenance
 * effect belongs to Prompt 191; this module only owns the private entitlement
 * and the state transitions needed to draw, trade, and eventually consume one.
 */
export const VIP_CARD_DEFINITIONS = [
  { id: 'party-deck', name: 'Party Deck' },
  { id: 'spa-deck', name: 'Spa Deck' },
  { id: 'gaming-deck', name: 'Gaming Deck' },
  { id: 'casino-deck', name: 'Casino Deck' },
  { id: 'theatre-deck', name: 'Theatre Deck' },
  { id: 'restaurant-deck', name: 'Restaurant Deck' },
  { id: 'art-deck', name: 'Art Deck' },
  { id: 'family-fun-deck', name: 'Family Fun Deck' },
  { id: 'theme-park-deck', name: 'Theme Park Deck' },
] as const;

export type VipCardId = typeof VIP_CARD_DEFINITIONS[number]['id'];
export type VipCardName = typeof VIP_CARD_DEFINITIONS[number]['name'];
export type VipCardStatus = 'available' | 'spent';

export interface VipDeckCard {
  readonly id: VipCardId;
  readonly name: VipCardName;
  readonly ownerUid: string | null;
  readonly status: VipCardStatus;
}

export interface VipDeckState {
  readonly revision: number;
  readonly cards: readonly VipDeckCard[];
}

export interface VipCardProjection {
  readonly id: VipCardId;
  readonly name: VipCardName;
  readonly status: VipCardStatus;
}

export interface VipHandProjection {
  readonly sessionId: string;
  readonly ownerUid: string;
  readonly revision: number;
  readonly cards: readonly VipCardProjection[];
}

const DEFINITION_BY_ID = new Map<VipCardId, typeof VIP_CARD_DEFINITIONS[number]>(
  VIP_CARD_DEFINITIONS.map((card) => [card.id, card]),
);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isCardId(value: unknown): value is VipCardId {
  return typeof value === 'string' && DEFINITION_BY_ID.has(value as VipCardId);
}

function isStatus(value: unknown): value is VipCardStatus {
  return value === 'available' || value === 'spent';
}

function normalizeCard(value: unknown): VipDeckCard | undefined {
  const raw = record(value);
  if (!raw || !isCardId(raw.id) || !isStatus(raw.status) ||
      (raw.ownerUid !== null && typeof raw.ownerUid !== 'string')) return undefined;
  const definition = DEFINITION_BY_ID.get(raw.id);
  if (!definition || (raw.status === 'spent' && raw.ownerUid === null)) return undefined;
  return { id: definition.id, name: definition.name, ownerUid: raw.ownerUid as string | null, status: raw.status };
}

/** Parse only the nine printed cards; malformed server state fails closed. */
export function parseVipDeckState(value: unknown): VipDeckState | undefined {
  const raw = record(value);
  const revision = nonNegativeInteger(raw?.revision);
  if (revision === undefined || !Array.isArray(raw?.cards) || raw.cards.length !== VIP_CARD_DEFINITIONS.length) {
    return undefined;
  }
  const cards = raw.cards.map(normalizeCard);
  if (cards.some((card) => card === undefined)) return undefined;
  const normalized = cards as VipDeckCard[];
  if (new Set(normalized.map((card) => card.id)).size !== VIP_CARD_DEFINITIONS.length) return undefined;
  return { revision, cards: normalized };
}

export function emptyVipDeckState(): VipDeckState {
  return {
    revision: 0,
    cards: VIP_CARD_DEFINITIONS.map((card) => ({ ...card, ownerUid: null, status: 'available' as const })),
  };
}

export function vipHandForState(state: VipDeckState, sessionId: string, ownerUid: string): VipHandProjection {
  return {
    sessionId,
    ownerUid,
    revision: state.revision,
    cards: state.cards
      .filter((card) => card.ownerUid === ownerUid)
      .map(({ id, name, status }) => ({ id, name, status })),
  };
}

export function availableVipCards(state: VipDeckState): readonly VipDeckCard[] {
  return state.cards.filter((card) => card.status === 'available' && card.ownerUid === null);
}

/** Draw exactly one remaining physical card using a server-selected index. */
export function drawVipCardState(
  state: VipDeckState,
  ownerUid: string,
  randomIndex: number,
): { readonly state: VipDeckState; readonly card: VipDeckCard } | undefined {
  const available = availableVipCards(state);
  if (!Number.isSafeInteger(randomIndex) || randomIndex < 0 || randomIndex >= available.length) return undefined;
  const card = available[randomIndex];
  if (!card) return undefined;
  const next: VipDeckCard = { ...card, ownerUid, status: 'available' };
  return {
    card: next,
    state: {
      revision: state.revision + 1,
      cards: state.cards.map((candidate) => candidate.id === card.id ? next : candidate),
    },
  };
}

/** Transfer an unspent card during Coordination, preserving its identity. */
export function transferVipCardState(
  state: VipDeckState,
  ownerUid: string,
  targetUid: string,
  cardId: string,
): VipDeckState | undefined {
  if (!ownerUid || !targetUid || ownerUid === targetUid || !isCardId(cardId)) return undefined;
  const card = state.cards.find((candidate) => candidate.id === cardId);
  if (!card || card.ownerUid !== ownerUid || card.status !== 'available') return undefined;
  return {
    revision: state.revision + 1,
    cards: state.cards.map((candidate) => candidate.id === card.id
      ? { ...candidate, ownerUid: targetUid }
      : candidate),
  };
}

/**
 * Durable single-use transition for the later Prompt 191 resolver.  P190
 * stores this state machine but deliberately exposes no gameplay trigger.
 */
export function consumeVipCardState(
  state: VipDeckState,
  ownerUid: string,
  cardId: string,
): VipDeckState | undefined {
  if (!ownerUid || !isCardId(cardId)) return undefined;
  const card = state.cards.find((candidate) => candidate.id === cardId);
  if (!card || card.ownerUid !== ownerUid || card.status !== 'available') return undefined;
  return {
    revision: state.revision + 1,
    cards: state.cards.map((candidate) => candidate.id === card.id
      ? { ...candidate, status: 'spent' as const }
      : candidate),
  };
}
