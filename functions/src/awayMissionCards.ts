import {
  missionCardsForState,
  type MissionCardId,
  type MissionCard,
  type MissionDeckState,
} from './missionDeck';

/**
 * Source-authorized ordinary away-mission carriers. The team chooses its
 * connected group roster independently; these craft IDs establish carriage,
 * not which role holders may participate.
 */
export const AWAY_MISSION_ROLE_CRAFT = {
  'wing-commander': ['starlight'],
  'icebreaker-miner': ['highwall'],
  'shepherd-scientist': ['endeavour'],
  'quellon-explorer': ['hummingbird'],
  'refinery-124-pdf-colonel': ['pdf-escort-fighter-wing'],
  'capybara-recycler': ['boa'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type AwayMissionParticipantSnapshot = Readonly<{
  uid: string;
  roleId: string;
}>;

export type AwayMissionCardAllocation = Readonly<{
  participant: AwayMissionParticipantSnapshot;
  card: MissionCard;
}>;

export type FiniteMissionDeckAllocation = Readonly<{
  allocations: readonly AwayMissionCardAllocation[];
  dealtCountBefore: number;
  dealtCountAfter: number;
  cards: readonly MissionCard[];
  recycledCardIds: readonly MissionCardId[];
  remainingResolvedDiscardCardIds: readonly MissionCardId[];
}>;

/** Build an injective known-path ID for a mission/participant hand pair. */
export function awayMissionHandId(missionId: string, participantUid: string): string {
  return `m${missionId.length}_${missionId}u${participantUid.length}_${participantUid}`;
}

export function awayMissionCraftForRole(roleId: string): readonly string[] {
  return AWAY_MISSION_ROLE_CRAFT[roleId as keyof typeof AWAY_MISSION_ROLE_CRAFT] ?? [];
}

/** Read the mutable cursor that lives beside P402's immutable deck order. */
export function missionDeckDealtCount(value: unknown, deckLength: number): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const cursor = candidate.dealtCount;
  if (cursor === undefined) return 0;
  return Number.isSafeInteger(cursor) && (cursor as number) >= 0 &&
    (cursor as number) <= deckLength ? cursor as number : null;
}

/** Allocate the next cards without changing the server-owned deck order. */
export function allocateMissionCards(
  state: MissionDeckState,
  dealtCount: number,
  participants: readonly AwayMissionParticipantSnapshot[],
): readonly AwayMissionCardAllocation[] | null {
  if (!Number.isSafeInteger(dealtCount) || dealtCount < 0 ||
      dealtCount + participants.length > state.order.length) return null;
  const cards = missionCardsForState(state).slice(dealtCount, dealtCount + participants.length);
  if (cards.length !== participants.length) return null;
  return participants.map((participant, index) => ({
    participant,
    card: cards[index]!,
  }));
}

/** Read the server-only pool of discards from missions that have resolved. */
export function missionDeckResolvedDiscardCardIds(
  value: unknown,
  state: MissionDeckState,
  dealtCount: number,
): readonly MissionCardId[] | null {
  if (!isRecord(value) || !Number.isSafeInteger(dealtCount) || dealtCount < 0 ||
      dealtCount > state.order.length) return null;
  const raw = value.resolvedDiscardCardIds;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const resolved: MissionCardId[] = [];
  for (const candidate of raw) {
    if (typeof candidate !== 'string' || seen.has(candidate)) return null;
    const index = state.order.indexOf(candidate as MissionCardId);
    if (index < 0 || index >= dealtCount) return null;
    seen.add(candidate);
    resolved.push(candidate as MissionCardId);
  }
  return resolved;
}

/** Draw top cards first, using resolved mission discards only for a shortfall. */
export function allocateMissionCardsWithResolvedDiscards(
  state: MissionDeckState,
  dealtCount: number,
  resolvedDiscardCardIds: readonly MissionCardId[],
  participants: readonly AwayMissionParticipantSnapshot[],
): FiniteMissionDeckAllocation | null {
  if (!Array.isArray(participants) || participants.some((participant) => !participant ||
      typeof participant.uid !== 'string' || typeof participant.roleId !== 'string')) return null;
  const draw = drawMissionCardsWithResolvedDiscards(
    state, dealtCount, resolvedDiscardCardIds, participants.length,
  );
  if (!draw) return null;
  return {
    ...draw,
    allocations: participants.map((participant, index) => ({ participant, card: draw.cards[index]! })),
  };
}

/** Draw a fixed number of cards under the same top-first finite-deck policy. */
export function drawMissionCardsWithResolvedDiscards(
  state: MissionDeckState,
  dealtCount: number,
  resolvedDiscardCardIds: readonly MissionCardId[],
  count: number,
): Omit<FiniteMissionDeckAllocation, 'allocations'> | null {
  const availableResolvedDiscards = missionDeckResolvedDiscardCardIds(
    { resolvedDiscardCardIds }, state, dealtCount,
  );
  if (availableResolvedDiscards === null || !Number.isSafeInteger(count) || count < 0) return null;

  const topCardCount = Math.min(count, state.order.length - dealtCount);
  const recycledCount = count - topCardCount;
  if (recycledCount > availableResolvedDiscards.length) return null;

  const cardsById = new Map(missionCardsForState(state).map((card) => [card.id, card]));
  const topCards = missionCardsForState(state).slice(dealtCount, dealtCount + topCardCount);
  const recycledCardIds = availableResolvedDiscards.slice(0, recycledCount);
  const recycledCards = recycledCardIds.map((cardId) => cardsById.get(cardId));
  const cards = [...topCards, ...recycledCards];
  if (cards.length !== count || cards.some((card) => !card)) return null;

  return {
    cards: cards as MissionCard[],
    dealtCountBefore: dealtCount,
    dealtCountAfter: dealtCount + topCardCount,
    recycledCardIds,
    remainingResolvedDiscardCardIds: availableResolvedDiscards.slice(recycledCount),
  };
}

/** Add a mission's private discards only after its server lifecycle resolves. */
export function addResolvedMissionDiscards(
  state: MissionDeckState,
  dealtCount: number,
  currentResolvedDiscardCardIds: readonly MissionCardId[],
  newlyResolvedDiscardCardIds: readonly MissionCardId[],
): readonly MissionCardId[] | null {
  const available = missionDeckResolvedDiscardCardIds(
    { resolvedDiscardCardIds: currentResolvedDiscardCardIds }, state, dealtCount,
  );
  if (available === null || !Array.isArray(newlyResolvedDiscardCardIds)) return null;
  const seen = new Set<string>(available);
  const appended: MissionCardId[] = [];
  for (const cardId of newlyResolvedDiscardCardIds) {
    if (typeof cardId !== 'string' || state.order.indexOf(cardId as MissionCardId) < 0 ||
        state.order.indexOf(cardId as MissionCardId) >= dealtCount || seen.has(cardId)) return null;
    seen.add(cardId);
    appended.push(cardId as MissionCardId);
  }
  return [...available, ...appended];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
