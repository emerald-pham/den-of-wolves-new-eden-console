import {
  allocateMissionCards,
  AWAY_MISSION_ROLE_CRAFT,
  awayMissionCraftForRole,
  missionDeckDealtCount,
  type AwayMissionParticipantSnapshot,
} from './awayMissionCards';
import {
  missionCardForCode,
  type CanonicalMissionCardCode,
  type MissionOpportunityTrait,
} from './missionCards';
import {
  missionCardsForState,
  missionDeck,
  parseMissionDeckState,
  type MissionCard,
  type MissionCardId,
  type MissionDeckRandomIndex,
  type MissionDeckState,
} from './missionDeck';

const CANONICAL_CARDS = new Map<string, MissionCard>(missionDeck().map((card) => [card.id, card]));
const KNOWN_AWAY_MISSION_CRAFT_IDS = new Set<string>(Object.values(AWAY_MISSION_ROLE_CRAFT).flat());
const OPPORTUNITY_TRAITS: readonly MissionOpportunityTrait[] = [
  'exploration',
  'mining',
  'science',
  'searchAndRescue',
  'salvage',
  'engineering',
];

export type MissionLifecyclePhase =
  | 'awaiting-card-selection'
  | 'discarding'
  | 'assignment-ready'
  | 'assigning'
  | 'assignments-complete'
  | 'facilitator-cards-added';

export interface MissionLifecycleParticipant extends AwayMissionParticipantSnapshot {
  /** Optional server-owned snapshot for source-defined device bonuses. */
  readonly deviceIds?: readonly string[];
}

export interface MissionLifecycleInitialCard {
  readonly participantUid: string;
  readonly cardId: MissionCardId;
}

export interface MissionLifecycleStateInput {
  readonly missionId: string;
  readonly siteCode: CanonicalMissionCardCode;
  readonly leaderUid: string;
  readonly participants: readonly MissionLifecycleParticipant[];
  /** Shared carriers present for the mission; never projected as participant ownership. */
  readonly availableCarrierCraftIds: readonly string[];
  readonly deckState: MissionDeckState;
  /** The P402 cursor after P403's initial deal. */
  readonly dealtCount: number;
  /** P403's one private starting card for each selected participant. */
  readonly initialCards: readonly MissionLifecycleInitialCard[];
  readonly phase?: 'awaiting-card-selection' | 'discarding' | 'assignment-ready';
  /** Existing P403 ledger fields; card ids are retained only in server state. */
  readonly discardedParticipantUids?: readonly string[];
  readonly discardedCardIds?: readonly MissionCardId[];
}

export interface MissionLifecycleOwnedCard {
  readonly participantUid: string;
  readonly cardId: MissionCardId;
  readonly source: 'initial' | 'leader-extra';
  /** Allocation slot only; the participant still chooses the final opportunity. */
  readonly distributionOpportunityId?: string;
}

export interface MissionLifecycleAssignment {
  readonly participantUid: string;
  readonly opportunityId: string;
  readonly cardId: MissionCardId;
  readonly faceDown: true;
}

export interface MissionLifecycleFacilitatorCard {
  readonly opportunityId: string;
  readonly cardId: MissionCardId;
}

export interface MissionLifecycleState {
  readonly missionId: string;
  readonly siteCode: CanonicalMissionCardCode;
  readonly leaderUid: string;
  readonly participants: readonly MissionLifecycleParticipant[];
  readonly availableCarrierCraftIds: readonly string[];
  readonly phase: MissionLifecyclePhase;
  readonly deckState: MissionDeckState;
  readonly dealtCount: number;
  readonly cards: readonly MissionLifecycleOwnedCard[];
  /** Extra-card requests after P403's one private initial card; no reason is stored. */
  readonly requestsByParticipant: readonly { readonly participantUid: string; readonly count: number }[];
  /** P403-compatible one-card-per-participant discard ledger. */
  readonly discardedParticipantUids: readonly string[];
  readonly discardedCardIds: readonly MissionCardId[];
  readonly extraAllocationReceipts: readonly {
    readonly requestId: string;
    readonly participantUid: string;
    readonly opportunityId: string;
    readonly cardId: MissionCardId;
  }[];
  readonly assignments: readonly MissionLifecycleAssignment[];
  readonly assignedParticipantUids: readonly string[];
  readonly facilitatorCards: readonly MissionLifecycleFacilitatorCard[];
  readonly shuffledPiles: readonly {
    readonly opportunityId: string;
    readonly cardIds: readonly MissionCardId[];
  }[];
  readonly facilitatorDealReceipt: {
    readonly requestId: string;
    readonly fingerprint: string;
    readonly dealtCountBefore: number;
    readonly addedCount: number;
    readonly opportunityIds: readonly string[];
  } | null;
}

export interface MissionLeaderExtraCardReceipt {
  readonly status: 'committed' | 'replayed';
  readonly requestId: string;
  readonly participantUid: string;
  readonly opportunityId: string;
  readonly cardCount: 1;
}

export interface MissionParticipantDiscardReceipt {
  readonly participantUid: string;
  readonly discarded: true;
}

export interface MissionParticipantAssignmentReceipt {
  readonly participantUid: string;
  readonly assignedCount: number;
  readonly opportunityIds: readonly string[];
}

export interface MissionFacilitatorDealReceipt {
  readonly status: 'committed' | 'replayed';
  readonly requestId: string;
  readonly addedCount: number;
  readonly opportunityIds: readonly string[];
}

export interface MissionBonusSourceInput {
  readonly participantUid: string;
  readonly source: Readonly<{
    readonly kind: 'craft' | 'role' | 'device';
    readonly id: string;
  }>;
  readonly bonuses: Readonly<Partial<Record<MissionOpportunityTrait, number>>>;
}

export interface MissionOpportunityResolution {
  readonly opportunityId: string;
  readonly contributorCount: number;
  readonly cardTotal: number;
  readonly bonusBreakdown: readonly Readonly<{
    readonly participantUid: string;
    readonly source: Readonly<{ readonly kind: 'craft' | 'role' | 'device'; readonly id: string }>;
    readonly trait: MissionOpportunityTrait;
    readonly amount: number;
  }>[];
  readonly bonusTotal: number;
  readonly total: number;
  readonly difficulty: number | null;
  readonly criticalThreshold: number | null;
  readonly outcome: 'automatic-failure' | 'failure' | 'success' | 'critical-success';
  readonly rewardBranch: 'none' | 'success' | 'critical';
}

/**
 * Create a server-side lifecycle snapshot from P403's private deal and mission
 * record. Card identities in this state must never be copied into a leader or
 * public projection.
 */
export function createMissionLifecycleState(
  input: MissionLifecycleStateInput,
): MissionLifecycleState | null {
  const opportunity = missionCardForCode(input.siteCode);
  const deckState = parseMissionDeckState(input.deckState);
  const availableCarrierCraftIds = normalizeAvailableCarrierCraftIds(input.availableCarrierCraftIds);
  const dealtCount = missionDeckDealtCount({ dealtCount: input.dealtCount }, deckState?.order.length ?? 0);
  if (!isNonEmptyString(input.missionId) || !opportunity || !deckState || !availableCarrierCraftIds ||
      dealtCount === null ||
      !isNonEmptyString(input.leaderUid) || !Array.isArray(input.participants) ||
      input.participants.length === 0 || !Array.isArray(input.initialCards) ||
      input.initialCards.length !== input.participants.length) return null;

  const participants = input.participants.map(normalizeParticipant);
  if (participants.some((participant) => participant === null)) return null;
  const normalizedParticipants = participants as MissionLifecycleParticipant[];
  const participantUids = normalizedParticipants.map(({ uid }) => uid);
  if (new Set(participantUids).size !== participantUids.length ||
      !participantUids.includes(input.leaderUid)) return null;

  const initialByParticipant = new Map<string, MissionCardId>();
  for (const candidate of input.initialCards) {
    if (!isRecord(candidate) || typeof candidate.participantUid !== 'string' ||
        !participantUids.includes(candidate.participantUid) || !isMissionCardId(candidate.cardId) ||
        initialByParticipant.has(candidate.participantUid)) return null;
    const participantUid = candidate.participantUid;
    const cardId = candidate.cardId;
    const cardIndex = deckState.order.indexOf(cardId);
    if (cardIndex < 0 || cardIndex >= dealtCount) return null;
    initialByParticipant.set(participantUid, cardId);
  }
  if (initialByParticipant.size !== participantUids.length) return null;

  const discardedParticipantUids = input.discardedParticipantUids ?? [];
  const discardedCardIds = input.discardedCardIds ?? [];
  if (!validP403DiscardLedger(normalizedParticipants, initialByParticipant, discardedParticipantUids, discardedCardIds)) {
    return null;
  }
  const phase = input.phase ?? 'awaiting-card-selection';
  if (phase !== 'awaiting-card-selection' && phase !== 'discarding' && phase !== 'assignment-ready') return null;
  if ((phase === 'awaiting-card-selection' && discardedParticipantUids.length !== 0) ||
      (phase === 'discarding' && discardedParticipantUids.length >= participantUids.length) ||
      (phase === 'assignment-ready' && discardedParticipantUids.length !== participantUids.length)) return null;

  const state: MissionLifecycleState = {
    missionId: input.missionId,
    siteCode: input.siteCode,
    leaderUid: input.leaderUid,
    participants: normalizedParticipants,
    availableCarrierCraftIds,
    phase,
    deckState,
    dealtCount,
    cards: normalizedParticipants.map((participant) => ({
      participantUid: participant.uid,
      cardId: initialByParticipant.get(participant.uid)!,
      source: 'initial',
    })),
    requestsByParticipant: [],
    discardedParticipantUids: [...discardedParticipantUids],
    discardedCardIds: [...discardedCardIds],
    extraAllocationReceipts: [],
    assignments: [],
    assignedParticipantUids: [],
    facilitatorCards: [],
    shuffledPiles: [],
    facilitatorDealReceipt: null,
  };
  return isValidMissionLifecycleState(state) ? state : null;
}

/** Store just the requested extra-card count under the server-derived participant uid. */
export function recordMissionCardRequest(
  state: MissionLifecycleState,
  participantUid: string,
  request: unknown,
): MissionLifecycleState | null {
  if (!isValidMissionLifecycleState(state) || state.phase !== 'awaiting-card-selection' ||
      !isNonEmptyString(participantUid) || !isParticipant(state, participantUid) ||
      !isRecord(request) || !Number.isSafeInteger(request.count) ||
      (request.count as number) < 1) return null;

  const nextRequests = state.requestsByParticipant.filter((entry) => entry.participantUid !== participantUid);
  nextRequests.push({ participantUid, count: request.count as number });
  nextRequests.sort((left, right) => participantOrder(state, left.participantUid) -
    participantOrder(state, right.participantUid));
  const nextState = { ...state, requestsByParticipant: nextRequests };
  return isValidMissionLifecycleState(nextState) ? nextState : null;
}

/** Leader-only view of request counts. It contains no reason or card data. */
export function missionLeaderCardRequestCounts(
  state: MissionLifecycleState,
  actorUid: string,
): readonly { readonly participantUid: string; readonly count: number }[] | null {
  if (!isValidMissionLifecycleState(state) || actorUid !== state.leaderUid) return null;
  return state.requestsByParticipant.map(({ participantUid, count }) => ({ participantUid, count }));
}

/**
 * Give one server-drawn card to a participant, up to their requested number of
 * extras. `opportunityId` is the leader's distribution slot for the
 * one-per-player-per-opportunity cap; the participant can still choose the
 * final opportunity during assignment.
 */
export function allocateBlindExtraMissionCard(
  state: MissionLifecycleState,
  command: Readonly<{ actorUid: string; participantUid: string; opportunityId: string; requestId: string }>,
): Readonly<{ state: MissionLifecycleState; receipt: MissionLeaderExtraCardReceipt }> | null {
  if (!isValidMissionLifecycleState(state) || !isRecord(command) ||
      command.actorUid !== state.leaderUid || !isNonEmptyString(command.participantUid) ||
      !isNonEmptyString(command.requestId) ||
      !isOpportunityId(state.siteCode, command.opportunityId)) return null;
  const replay = state.extraAllocationReceipts.find(({ requestId }) => requestId === command.requestId);
  if (replay) {
    if (replay.participantUid !== command.participantUid || replay.opportunityId !== command.opportunityId) return null;
    return {
      state,
      receipt: {
        status: 'replayed',
        requestId: replay.requestId,
        participantUid: replay.participantUid,
        opportunityId: replay.opportunityId,
        cardCount: 1,
      },
    };
  }
  if (state.phase !== 'awaiting-card-selection' || !isParticipant(state, command.participantUid) ||
      state.cards.some((card) => card.source === 'leader-extra' &&
        card.participantUid === command.participantUid &&
        card.distributionOpportunityId === command.opportunityId)) return null;
  const requestedExtraCount = state.requestsByParticipant.find(({ participantUid }) =>
    participantUid === command.participantUid)?.count ?? 0;
  const alreadyAllocatedExtraCount = state.cards.filter((card) => card.source === 'leader-extra' &&
    card.participantUid === command.participantUid).length;
  if (alreadyAllocatedExtraCount >= requestedExtraCount) return null;

  const participant = state.participants.find(({ uid }) => uid === command.participantUid)!;
  const allocations = allocateMissionCards(state.deckState, state.dealtCount, [participant]);
  const allocation = allocations?.[0];
  if (!allocation || !isMissionCardId(allocation.card.id) ||
      state.cards.some(({ cardId }) => cardId === allocation.card.id)) return null;
  const nextState: MissionLifecycleState = {
    ...state,
    dealtCount: state.dealtCount + 1,
    cards: [...state.cards, {
      participantUid: command.participantUid,
      cardId: allocation.card.id,
      source: 'leader-extra',
      distributionOpportunityId: command.opportunityId,
    }],
    extraAllocationReceipts: [...state.extraAllocationReceipts, {
      requestId: command.requestId,
      participantUid: command.participantUid,
      opportunityId: command.opportunityId,
      cardId: allocation.card.id,
    }],
  };
  if (!isValidMissionLifecycleState(nextState)) return null;
  return {
    state: nextState,
    receipt: {
      status: 'committed',
      requestId: command.requestId,
      participantUid: command.participantUid,
      opportunityId: command.opportunityId,
      cardCount: 1,
    },
  };
}

/** Begin the private discard phase after leader allocations are complete. */
export function openMissionDiscarding(state: MissionLifecycleState): MissionLifecycleState | null {
  if (!isValidMissionLifecycleState(state)) return null;
  if (state.phase === 'discarding') return state;
  if (state.phase !== 'awaiting-card-selection') return null;
  return { ...state, phase: 'discarding' };
}

/**
 * Secretly consume one card the participant owns. With only the P403 initial
 * hand this is the existing one-card discard; added cards can also be chosen.
 */
export function discardMissionCardSecretly(
  state: MissionLifecycleState,
  participantUid: string,
  cardId: MissionCardId,
): Readonly<{ state: MissionLifecycleState; receipt: MissionParticipantDiscardReceipt }> | null {
  if (!isValidMissionLifecycleState(state) || state.phase !== 'discarding' ||
      !isParticipant(state, participantUid) || !isMissionCardId(cardId) ||
      state.discardedParticipantUids.includes(participantUid)) return null;
  const ownedCard = state.cards.find((card) => card.cardId === cardId && card.participantUid === participantUid);
  if (!ownedCard || state.discardedCardIds.includes(cardId) ||
      state.assignments.some((assignment) => assignment.cardId === cardId)) return null;

  const discardedParticipantUids = [...state.discardedParticipantUids, participantUid];
  const discardedCardIds = [...state.discardedCardIds, cardId];
  const allDiscarded = discardedParticipantUids.length === state.participants.length;
  const nextState: MissionLifecycleState = {
    ...state,
    phase: allDiscarded ? 'assignment-ready' : 'discarding',
    discardedParticipantUids,
    discardedCardIds,
  };
  if (!isValidMissionLifecycleState(nextState)) return null;
  return { state: nextState, receipt: { participantUid, discarded: true } };
}

/** Assign all non-discarded cards in one participant's hand face down. */
export function assignRemainingMissionCards(
  state: MissionLifecycleState,
  participantUid: string,
  placements: readonly Readonly<{ cardId: MissionCardId; opportunityId: string }>[],
): Readonly<{ state: MissionLifecycleState; receipt: MissionParticipantAssignmentReceipt }> | null {
  if (!isValidMissionLifecycleState(state) ||
      (state.phase !== 'assignment-ready' && state.phase !== 'assigning') ||
      !isParticipant(state, participantUid) || state.assignedParticipantUids.includes(participantUid) ||
      !Array.isArray(placements)) return null;

  const definition = missionCardForCode(state.siteCode)!;
  const normalized: { cardId: MissionCardId; opportunityId: string }[] = [];
  for (const placement of placements) {
    if (!isRecord(placement) || !isMissionCardId(placement.cardId) ||
        !isOpportunityId(state.siteCode, placement.opportunityId)) return null;
    normalized.push({ cardId: placement.cardId, opportunityId: placement.opportunityId });
  }
  const remainingCardIds = state.cards
    .filter((card) => card.participantUid === participantUid && !state.discardedCardIds.includes(card.cardId))
    .map(({ cardId }) => cardId);
  const placedCardIds = normalized.map(({ cardId }) => cardId);
  const placedOpportunityIds = normalized.map(({ opportunityId }) => opportunityId);
  if (placedCardIds.length !== remainingCardIds.length ||
      new Set(placedCardIds).size !== placedCardIds.length ||
      placedCardIds.some((cardId) => !remainingCardIds.includes(cardId)) ||
      new Set(placedOpportunityIds).size !== placedOpportunityIds.length) return null;

  const assignments: MissionLifecycleAssignment[] = [
    ...state.assignments,
    ...normalized.map(({ cardId, opportunityId }) => ({
      participantUid,
      opportunityId,
      cardId,
      faceDown: true as const,
    })),
  ];
  const assignedParticipantUids = [...state.assignedParticipantUids, participantUid];
  const allAssigned = assignedParticipantUids.length === state.participants.length;
  const opportunityOrder = new Map<string, number>(definition.opportunities.map(({ id }, index) => [id, index]));
  const opportunityIds = [...placedOpportunityIds].sort((left, right) =>
    opportunityOrder.get(left)! - opportunityOrder.get(right)!);
  const nextState: MissionLifecycleState = {
    ...state,
    phase: allAssigned ? 'assignments-complete' : 'assigning',
    assignments,
    assignedParticipantUids,
  };
  if (!isValidMissionLifecycleState(nextState)) return null;
  return {
    state: nextState,
    receipt: { participantUid, assignedCount: normalized.length, opportunityIds },
  };
}

/** Participant-private view; it can only return the requested owner's own hand. */
export function privateMissionHandForParticipant(
  state: MissionLifecycleState,
  participantUid: string,
): Readonly<{
  missionId: string;
  participantUid: string;
  cards: readonly Readonly<{
    id: MissionCardId;
    rank: MissionCard['rank'];
    suit: MissionCard['suit'];
    value: number;
    status: 'remaining' | 'discarded' | 'assigned';
  }>[];
}> | null {
  if (!isValidMissionLifecycleState(state) || !isParticipant(state, participantUid)) return null;
  const cards = state.cards.filter(({ participantUid: owner }) => owner === participantUid).map(({ cardId }) => {
    const card = CANONICAL_CARDS.get(cardId)!;
    const status: 'remaining' | 'discarded' | 'assigned' = state.discardedCardIds.includes(cardId)
      ? 'discarded'
      : state.assignments.some((assignment) => assignment.cardId === cardId)
        ? 'assigned'
        : 'remaining';
    return { id: card.id, rank: card.rank, suit: card.suit, value: card.value, status };
  });
  return { missionId: state.missionId, participantUid, cards };
}

/**
 * Draw one top card for each opportunity with a participant contribution,
 * then shuffle each hidden pile. The injected index source makes the operation
 * deterministic in domain tests; the server adapter supplies its secure RNG.
 */
export function addFacilitatorCardsFromTopDeck(
  state: MissionLifecycleState,
  requestId: string,
  randomIndex: MissionDeckRandomIndex,
): Readonly<{ state: MissionLifecycleState; receipt: MissionFacilitatorDealReceipt }> | null {
  if (!isValidMissionLifecycleState(state) || !isNonEmptyString(requestId)) return null;
  const fingerprint = assignmentFingerprint(state);
  const storedReceipt = state.facilitatorDealReceipt;
  if (storedReceipt) {
    if (storedReceipt.requestId !== requestId || storedReceipt.fingerprint !== fingerprint) return null;
    return {
      state,
      receipt: {
        status: 'replayed',
        requestId,
        addedCount: storedReceipt.addedCount,
        opportunityIds: [...storedReceipt.opportunityIds],
      },
    };
  }
  if (state.phase !== 'assignments-complete' || typeof randomIndex !== 'function') return null;

  const definition = missionCardForCode(state.siteCode)!;
  const nonemptyOpportunities = definition.opportunities
    .filter(({ id }) => state.assignments.some((assignment) => assignment.opportunityId === id));
  const orderedDeck = missionCardsForState(state.deckState);
  const drawn = orderedDeck.slice(state.dealtCount, state.dealtCount + nonemptyOpportunities.length);
  if (drawn.length !== nonemptyOpportunities.length || drawn.some(({ id }) =>
    !isMissionCardId(id) || state.cards.some((card) => card.cardId === id))) return null;

  const facilitatorCards = nonemptyOpportunities.map((opportunity, index) => ({
    opportunityId: opportunity.id,
    cardId: drawn[index]!.id,
  }));
  const shuffledPiles: { opportunityId: string; cardIds: MissionCardId[] }[] = [];
  for (const opportunity of nonemptyOpportunities) {
    const pile = [
      ...state.assignments
        .filter((assignment) => assignment.opportunityId === opportunity.id)
        .map(({ cardId }) => cardId),
      facilitatorCards.find(({ opportunityId }) => opportunityId === opportunity.id)!.cardId,
    ];
    const shuffled = shuffleCardIds(pile, randomIndex);
    if (!shuffled) return null;
    shuffledPiles.push({ opportunityId: opportunity.id, cardIds: shuffled });
  }

  const nextState: MissionLifecycleState = {
    ...state,
    phase: 'facilitator-cards-added',
    dealtCount: state.dealtCount + drawn.length,
    facilitatorCards,
    shuffledPiles,
    facilitatorDealReceipt: {
      requestId,
      fingerprint,
      dealtCountBefore: state.dealtCount,
      addedCount: drawn.length,
      opportunityIds: nonemptyOpportunities.map(({ id }) => id),
    },
  };
  if (!isValidMissionLifecycleState(nextState)) return null;
  return {
    state: nextState,
    receipt: {
      status: 'committed',
      requestId,
      addedCount: drawn.length,
      opportunityIds: nonemptyOpportunities.map(({ id }) => id),
    },
  };
}

/**
 * Calculate hidden totals and exact success branches from canonical card ids.
 * Bonus sources and secret d6 results must be loaded by a trusted server path;
 * do not accept either as participant-supplied arithmetic.
 */
export function calculateMissionOpportunityTotals(
  state: MissionLifecycleState,
  bonusSources: readonly MissionBonusSourceInput[],
  secretD6Rolls: Readonly<Record<string, number>> = {},
): readonly MissionOpportunityResolution[] | null {
  if (!isValidMissionLifecycleState(state) || state.phase !== 'facilitator-cards-added' ||
      !Array.isArray(bonusSources) || !isRecord(secretD6Rolls)) return null;
  const normalizedBonusSources = normalizeBonusSources(state, bonusSources);
  if (!normalizedBonusSources) return null;
  const definition = missionCardForCode(state.siteCode)!;
  const assignedOpportunityIds = new Set(state.assignments.map(({ opportunityId }) => opportunityId));
  const requiredRollIds = definition.opportunities
    .filter((opportunity) => assignedOpportunityIds.has(opportunity.id) && opportunity.difficultyRule !== undefined)
    .map(({ id }) => id);
  const requiredRollIdSet = new Set<string>(requiredRollIds);
  const suppliedRollIds = Object.keys(secretD6Rolls);
  if (suppliedRollIds.length !== requiredRollIds.length ||
      requiredRollIds.some((id) => !Object.hasOwn(secretD6Rolls, id)) ||
      suppliedRollIds.some((id) => !requiredRollIdSet.has(id)) ||
      suppliedRollIds.some((id) => !Number.isSafeInteger(secretD6Rolls[id]) ||
        secretD6Rolls[id]! < 1 || secretD6Rolls[id]! > 6)) return null;

  const results: MissionOpportunityResolution[] = [];
  for (const opportunity of definition.opportunities) {
    const assignments = state.assignments.filter(({ opportunityId }) => opportunityId === opportunity.id);
    if (assignments.length === 0) {
      results.push({
        opportunityId: opportunity.id,
        contributorCount: 0,
        cardTotal: 0,
        bonusBreakdown: [],
        bonusTotal: 0,
        total: 0,
        difficulty: null,
        criticalThreshold: null,
        outcome: 'automatic-failure',
        rewardBranch: 'none',
      });
      continue;
    }

    const facilitatorCard = state.facilitatorCards.find(({ opportunityId }) => opportunityId === opportunity.id);
    if (!facilitatorCard) return null;
    const cardIds = [...assignments.map(({ cardId }) => cardId), facilitatorCard.cardId];
    const cardValues = cardIds.map((cardId) => CANONICAL_CARDS.get(cardId)?.value);
    if (cardValues.some((value) => value === undefined)) return null;
    const cardTotal = (cardValues as number[]).reduce((sum, value) => sum + value, 0);
    const contributors = [...new Set(assignments.map(({ participantUid }) => participantUid))];
    const bonusBreakdown = normalizedBonusSources
      .filter(({ participantUid }) => contributors.includes(participantUid))
      .flatMap((bonusSource) => opportunity.traits.flatMap((trait) => {
        const amount = bonusSource.bonuses[trait];
        return amount === undefined ? [] : [{
          participantUid: bonusSource.participantUid,
          source: bonusSource.source,
          trait,
          amount,
        }];
      }));
    const bonusTotal = bonusBreakdown.reduce((total, bonus) => total + bonus.amount, 0);
    const total = cardTotal + bonusTotal;
    if (!Number.isSafeInteger(bonusTotal) || !Number.isSafeInteger(total)) return null;

    let difficulty = opportunity.difficulty;
    let criticalThreshold = opportunity.criticalThreshold;
    if (opportunity.difficultyRule) {
      const roll = secretD6Rolls[opportunity.id];
      if (typeof roll !== 'number' || !Number.isSafeInteger(roll) || roll < 1 || roll > 6) return null;
      difficulty = roll * opportunity.difficultyRule.successMultiplier;
      criticalThreshold = difficulty + opportunity.difficultyRule.criticalOffset;
    }
    if (difficulty === null || !Number.isSafeInteger(difficulty) || difficulty < 0 ||
        (criticalThreshold !== null && (!Number.isSafeInteger(criticalThreshold) || criticalThreshold < difficulty))) {
      return null;
    }
    const critical = criticalThreshold !== null && total >= criticalThreshold;
    const successful = total >= difficulty;
    results.push({
      opportunityId: opportunity.id,
      contributorCount: contributors.length,
      cardTotal,
      bonusBreakdown,
      bonusTotal,
      total,
      difficulty,
      criticalThreshold,
      outcome: !successful ? 'failure' : critical ? 'critical-success' : 'success',
      rewardBranch: !successful ? 'none' : critical ? 'critical' : 'success',
    });
  }
  return results;
}

function normalizeParticipant(value: unknown): MissionLifecycleParticipant | null {
  if (!isRecord(value) || !isNonEmptyString(value.uid) || !isNonEmptyString(value.roleId)) return null;
  const deviceIds = value.deviceIds;
  if (deviceIds !== undefined && (!Array.isArray(deviceIds) ||
      deviceIds.some((deviceId) => !isNonEmptyString(deviceId)) ||
      new Set(deviceIds).size !== deviceIds.length)) return null;
  return {
    uid: value.uid,
    roleId: value.roleId,
    ...(deviceIds === undefined ? {} : { deviceIds: [...deviceIds] as string[] }),
  };
}

function normalizeAvailableCarrierCraftIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((craftId) => !isNonEmptyString(craftId) || !KNOWN_AWAY_MISSION_CRAFT_IDS.has(craftId)) ||
      new Set(value).size !== value.length) return null;
  return [...value] as string[];
}

function validP403DiscardLedger(
  participants: readonly MissionLifecycleParticipant[],
  initialByParticipant: ReadonlyMap<string, MissionCardId>,
  discardedParticipantUids: readonly string[],
  discardedCardIds: readonly MissionCardId[],
): boolean {
  if (!Array.isArray(discardedParticipantUids) || !Array.isArray(discardedCardIds) ||
      discardedParticipantUids.length !== discardedCardIds.length ||
      new Set(discardedParticipantUids).size !== discardedParticipantUids.length ||
      new Set(discardedCardIds).size !== discardedCardIds.length) return false;
  return discardedParticipantUids.every((uid, index) => {
    const cardId = discardedCardIds[index];
    return participants.some(({ uid: participantUid }) => participantUid === uid) &&
      isMissionCardId(cardId) && initialByParticipant.get(uid) === cardId;
  });
}

function isValidMissionLifecycleState(value: unknown): value is MissionLifecycleState {
  if (!isRecord(value) || !isNonEmptyString(value.missionId) ||
      typeof value.siteCode !== 'string' || !missionCardForCode(value.siteCode) ||
      !isNonEmptyString(value.leaderUid) || !Array.isArray(value.participants) ||
      value.participants.length === 0 || !Array.isArray(value.availableCarrierCraftIds) ||
      !normalizeAvailableCarrierCraftIds(value.availableCarrierCraftIds) || !Array.isArray(value.cards) ||
      !Array.isArray(value.requestsByParticipant) || !Array.isArray(value.discardedParticipantUids) ||
      !Array.isArray(value.discardedCardIds) || !Array.isArray(value.extraAllocationReceipts) ||
      !Array.isArray(value.assignments) || !Array.isArray(value.assignedParticipantUids) ||
      !Array.isArray(value.facilitatorCards) || !Array.isArray(value.shuffledPiles) ||
      (value.facilitatorDealReceipt !== null && !isRecord(value.facilitatorDealReceipt))) return false;
  const deckState = parseMissionDeckState(value.deckState);
  const dealtCount = missionDeckDealtCount({ dealtCount: value.dealtCount }, deckState?.order.length ?? 0);
  const definition = missionCardForCode(value.siteCode);
  if (!deckState || dealtCount === null || !definition ||
      !['awaiting-card-selection', 'discarding', 'assignment-ready', 'assigning',
        'assignments-complete', 'facilitator-cards-added'].includes(String(value.phase))) return false;

  const participants = value.participants.map(normalizeParticipant);
  if (participants.some((participant) => participant === null)) return false;
  const normalizedParticipants = participants as MissionLifecycleParticipant[];
  const participantUids = normalizedParticipants.map(({ uid }) => uid);
  if (new Set(participantUids).size !== participantUids.length || !participantUids.includes(value.leaderUid)) return false;
  const opportunityIds = definition.opportunities.map(({ id }) => id);
  const opportunityIdSet = new Set<string>(opportunityIds);
  const participantSet = new Set(participantUids);
  const initialCounts = new Map<string, number>();
  const extraCounts = new Map<string, number>();
  const cardOwners = new Map<string, string>();
  const extraSlots = new Set<string>();
  for (const candidate of value.cards) {
    if (!isRecord(candidate) || typeof candidate.participantUid !== 'string' ||
        !participantSet.has(candidate.participantUid) ||
        !isMissionCardId(candidate.cardId) || !['initial', 'leader-extra'].includes(String(candidate.source)) ||
        cardOwners.has(candidate.cardId)) return false;
    const cardIndex = deckState.order.indexOf(candidate.cardId);
    if (cardIndex < 0 || cardIndex >= dealtCount) return false;
    cardOwners.set(candidate.cardId, candidate.participantUid);
    if (candidate.source === 'initial') {
      if (candidate.distributionOpportunityId !== undefined) return false;
      initialCounts.set(candidate.participantUid, (initialCounts.get(candidate.participantUid) ?? 0) + 1);
    } else {
      if (candidate.distributionOpportunityId === undefined ||
          !opportunityIdSet.has(String(candidate.distributionOpportunityId))) return false;
      const slot = `${candidate.participantUid}\u0000${candidate.distributionOpportunityId}`;
      if (extraSlots.has(slot)) return false;
      extraSlots.add(slot);
      extraCounts.set(candidate.participantUid, (extraCounts.get(candidate.participantUid) ?? 0) + 1);
    }
  }
  if (normalizedParticipants.some(({ uid }) => initialCounts.get(uid) !== 1)) return false;

  const requests = new Set<string>();
  const requestedExtraCounts = new Map<string, number>();
  for (const request of value.requestsByParticipant) {
    if (!isRecord(request) || Object.keys(request).some((key) => key !== 'participantUid' && key !== 'count') ||
        typeof request.participantUid !== 'string' || !participantSet.has(request.participantUid) ||
        !Number.isSafeInteger(request.count) || (request.count as number) < 1 || requests.has(request.participantUid)) {
      return false;
    }
    requests.add(request.participantUid);
    requestedExtraCounts.set(request.participantUid, request.count as number);
  }
  if ([...extraCounts].some(([uid, count]) => count > (requestedExtraCounts.get(uid) ?? 0))) return false;

  const discardedUids = new Set<string>();
  const discardedCardIds = new Set<string>();
  if (value.discardedParticipantUids.length !== value.discardedCardIds.length) return false;
  for (let index = 0; index < value.discardedParticipantUids.length; index += 1) {
    const uid = value.discardedParticipantUids[index];
    const cardId = value.discardedCardIds[index];
    if (typeof uid !== 'string' || !participantSet.has(uid) || discardedUids.has(uid) ||
        !isMissionCardId(cardId) || discardedCardIds.has(cardId) || cardOwners.get(cardId) !== uid) return false;
    discardedUids.add(uid);
    discardedCardIds.add(cardId);
  }

  const allocationRequestIds = new Set<string>();
  const allocationCards = new Set<string>();
  for (const receipt of value.extraAllocationReceipts) {
    if (!isRecord(receipt) || !isNonEmptyString(receipt.requestId) ||
        !isNonEmptyString(receipt.participantUid) || !participantSet.has(receipt.participantUid) ||
        typeof receipt.opportunityId !== 'string' || !opportunityIdSet.has(receipt.opportunityId) ||
        !isMissionCardId(receipt.cardId) || allocationRequestIds.has(receipt.requestId) ||
        allocationCards.has(receipt.cardId) || cardOwners.get(receipt.cardId) !== receipt.participantUid ||
        !value.cards.some((card) => isRecord(card) && card.cardId === receipt.cardId &&
          card.source === 'leader-extra' && card.distributionOpportunityId === receipt.opportunityId)) return false;
    allocationRequestIds.add(receipt.requestId);
    allocationCards.add(receipt.cardId);
  }
  if (allocationCards.size !== value.cards.filter((card) => isRecord(card) && card.source === 'leader-extra').length) return false;

  const assignmentCards = new Set<string>();
  const assignmentPairs = new Set<string>();
  const assignmentsByParticipant = new Map<string, MissionLifecycleAssignment[]>();
  for (const assignment of value.assignments) {
    if (!isRecord(assignment) || typeof assignment.participantUid !== 'string' ||
        !participantSet.has(assignment.participantUid) || typeof assignment.opportunityId !== 'string' ||
        !opportunityIdSet.has(assignment.opportunityId) || !isMissionCardId(assignment.cardId) ||
        assignment.faceDown !== true || assignmentCards.has(assignment.cardId) ||
        discardedCardIds.has(assignment.cardId) || cardOwners.get(assignment.cardId) !== assignment.participantUid) return false;
    const pair = `${assignment.participantUid}\u0000${assignment.opportunityId}`;
    if (assignmentPairs.has(pair)) return false;
    assignmentPairs.add(pair);
    assignmentCards.add(assignment.cardId);
    const participantAssignments = assignmentsByParticipant.get(assignment.participantUid) ?? [];
    participantAssignments.push(assignment as unknown as MissionLifecycleAssignment);
    assignmentsByParticipant.set(assignment.participantUid, participantAssignments);
  }
  const assignedUids = new Set<string>();
  for (const uid of value.assignedParticipantUids) {
    if (typeof uid !== 'string' || !participantSet.has(uid) || assignedUids.has(uid)) return false;
    assignedUids.add(uid);
  }
  if ([...assignmentsByParticipant.keys()].some((uid) => !assignedUids.has(uid))) return false;
  for (const uid of assignedUids) {
    const remainingIds = value.cards.filter((card) => isRecord(card) && card.participantUid === uid &&
      !discardedCardIds.has(String(card.cardId))).map((card) => String(card.cardId));
    const placedIds = (assignmentsByParticipant.get(uid) ?? []).map(({ cardId }) => cardId);
    const placedIdSet = new Set<string>(placedIds);
    if (remainingIds.length !== placedIds.length || remainingIds.some((cardId) => !placedIdSet.has(cardId))) return false;
  }

  const facilitatorByOpportunity = new Map<string, string>();
  const allCardIds = new Set([...cardOwners.keys()]);
  for (const facilitatorCard of value.facilitatorCards) {
    if (!isRecord(facilitatorCard) || typeof facilitatorCard.opportunityId !== 'string' ||
        !opportunityIdSet.has(facilitatorCard.opportunityId) || !isMissionCardId(facilitatorCard.cardId) ||
        facilitatorByOpportunity.has(facilitatorCard.opportunityId) || allCardIds.has(facilitatorCard.cardId)) return false;
    const cardIndex = deckState.order.indexOf(facilitatorCard.cardId);
    if (cardIndex < 0 || cardIndex >= dealtCount) return false;
    facilitatorByOpportunity.set(facilitatorCard.opportunityId, facilitatorCard.cardId);
    allCardIds.add(facilitatorCard.cardId);
  }

  const pileByOpportunity = new Map<string, readonly string[]>();
  for (const pile of value.shuffledPiles) {
    if (!isRecord(pile) || typeof pile.opportunityId !== 'string' || !opportunityIdSet.has(pile.opportunityId) ||
        !Array.isArray(pile.cardIds) || pileByOpportunity.has(pile.opportunityId) ||
        pile.cardIds.some((cardId) => !isMissionCardId(cardId))) return false;
    pileByOpportunity.set(pile.opportunityId, pile.cardIds as string[]);
  }

  const phase = value.phase as MissionLifecyclePhase;
  if (phase === 'awaiting-card-selection' && (discardedUids.size !== 0 || value.assignments.length !== 0 ||
      value.facilitatorCards.length !== 0 || value.facilitatorDealReceipt !== null)) return false;
  if (phase === 'discarding' && (discardedUids.size >= participantUids.length || value.assignments.length !== 0 ||
      value.facilitatorCards.length !== 0 || value.facilitatorDealReceipt !== null)) return false;
  if (phase === 'assignment-ready' && (discardedUids.size !== participantUids.length ||
      value.assignments.length !== 0 || value.assignedParticipantUids.length !== 0 ||
      value.facilitatorCards.length !== 0 || value.facilitatorDealReceipt !== null)) return false;
  if (phase === 'assigning' && (discardedUids.size !== participantUids.length || assignedUids.size === 0 ||
      assignedUids.size >= participantUids.length || value.facilitatorCards.length !== 0 ||
      value.facilitatorDealReceipt !== null)) return false;
  if (phase === 'assignments-complete' && (discardedUids.size !== participantUids.length ||
      assignedUids.size !== participantUids.length || value.facilitatorCards.length !== 0 ||
      value.facilitatorDealReceipt !== null)) return false;
  if (phase === 'facilitator-cards-added') {
    const expectedOpportunityIds = definition.opportunities
      .filter(({ id }) => stateHasAssignments(value.assignments as readonly unknown[], id)).map(({ id }) => id);
    if (discardedUids.size !== participantUids.length || assignedUids.size !== participantUids.length ||
        expectedOpportunityIds.length !== facilitatorByOpportunity.size ||
        expectedOpportunityIds.some((id) => !facilitatorByOpportunity.has(id) || !pileByOpportunity.has(id)) ||
        pileByOpportunity.size !== expectedOpportunityIds.length || !isRecord(value.facilitatorDealReceipt)) return false;
    const receipt = value.facilitatorDealReceipt;
    const receiptOpportunityIds = receipt.opportunityIds;
    if (!isNonEmptyString(receipt.requestId) || typeof receipt.fingerprint !== 'string' ||
        typeof receipt.dealtCountBefore !== 'number' || !Number.isSafeInteger(receipt.dealtCountBefore) ||
        receipt.dealtCountBefore < 0 ||
        typeof receipt.addedCount !== 'number' || !Number.isSafeInteger(receipt.addedCount) ||
        !Array.isArray(receiptOpportunityIds) ||
        receipt.addedCount !== expectedOpportunityIds.length ||
        receipt.dealtCountBefore + receipt.addedCount !== dealtCount ||
        receipt.dealtCountBefore + receipt.addedCount > deckState.order.length ||
        receiptOpportunityIds.length !== expectedOpportunityIds.length ||
        expectedOpportunityIds.some((id, index) => receiptOpportunityIds[index] !== id)) return false;
    const expectedTopCards = missionCardsForState(deckState).slice(
      receipt.dealtCountBefore,
      receipt.dealtCountBefore + receipt.addedCount,
    );
    if (expectedTopCards.length !== expectedOpportunityIds.length ||
        expectedOpportunityIds.some((opportunityId, index) =>
          facilitatorByOpportunity.get(opportunityId) !== expectedTopCards[index]?.id)) return false;
    for (const opportunityId of expectedOpportunityIds) {
      const expectedCards = [
        ...(assignmentsByParticipant.size === 0 ? [] : value.assignments
          .filter((assignment) => isRecord(assignment) && assignment.opportunityId === opportunityId)
          .map((assignment) => String((assignment as Record<string, unknown>).cardId))),
        facilitatorByOpportunity.get(opportunityId)!,
      ].sort();
      const actualCards = [...(pileByOpportunity.get(opportunityId) ?? [])].sort();
      if (expectedCards.length !== actualCards.length || expectedCards.some((cardId, index) => cardId !== actualCards[index])) {
        return false;
      }
    }
    if (receipt.fingerprint !== assignmentFingerprint(value as unknown as MissionLifecycleState)) return false;
  }
  return true;
}

function normalizeBonusSources(
  state: MissionLifecycleState,
  bonusSources: readonly MissionBonusSourceInput[],
): readonly MissionBonusSourceInput[] | null {
  const seen = new Set<string>();
  const normalized: MissionBonusSourceInput[] = [];
  for (const candidate of bonusSources) {
    if (!isRecord(candidate) || typeof candidate.participantUid !== 'string' ||
        !isRecord(candidate.source) || !isNonEmptyString(candidate.source.id) ||
        !['craft', 'role', 'device'].includes(String(candidate.source.kind)) ||
        !isRecord(candidate.bonuses) || !isParticipant(state, candidate.participantUid)) return null;
    const participant = state.participants.find(({ uid }) => uid === candidate.participantUid)!;
    const kind = candidate.source.kind as 'craft' | 'role' | 'device';
    const sourceId = candidate.source.id;
    const isAuthorized = kind === 'craft'
      ? state.availableCarrierCraftIds.includes(sourceId) &&
        awayMissionCraftForRole(participant.roleId).includes(sourceId)
      : kind === 'role'
        ? participant.roleId === sourceId
        : participant.deviceIds?.includes(sourceId) === true;
    const key = `${participant.uid}\u0000${kind}\u0000${sourceId}`;
    if (!isAuthorized || seen.has(key)) return null;
    seen.add(key);
    const bonuses: Partial<Record<MissionOpportunityTrait, number>> = {};
    for (const [trait, amount] of Object.entries(candidate.bonuses)) {
      if (!OPPORTUNITY_TRAITS.includes(trait as MissionOpportunityTrait) ||
          !Number.isSafeInteger(amount) || (amount as number) < 1) return null;
      bonuses[trait as MissionOpportunityTrait] = amount as number;
    }
    normalized.push({ participantUid: participant.uid, source: { kind, id: sourceId }, bonuses });
  }
  return normalized;
}

function shuffleCardIds(
  cardIds: readonly MissionCardId[],
  randomIndex: MissionDeckRandomIndex,
): MissionCardId[] | null {
  const shuffled = [...cardIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    if (!Number.isSafeInteger(swapIndex) || swapIndex < 0 || swapIndex > index) return null;
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function assignmentFingerprint(state: Pick<MissionLifecycleState, 'missionId' | 'siteCode' | 'assignments'>): string {
  const assignments = [...state.assignments].map(({ participantUid, opportunityId, cardId }) => ({
    participantUid,
    opportunityId,
    cardId,
  })).sort((left, right) => left.opportunityId.localeCompare(right.opportunityId) ||
    left.participantUid.localeCompare(right.participantUid) || left.cardId.localeCompare(right.cardId));
  return JSON.stringify({ missionId: state.missionId, siteCode: state.siteCode, assignments });
}

function isOpportunityId(siteCode: string, opportunityId: unknown): opportunityId is string {
  return typeof opportunityId === 'string' &&
    missionCardForCode(siteCode)?.opportunities.some(({ id }) => id === opportunityId) === true;
}

function isMissionCardId(value: unknown): value is MissionCardId {
  return typeof value === 'string' && CANONICAL_CARDS.has(value);
}

function isParticipant(state: MissionLifecycleState, participantUid: string): boolean {
  return state.participants.some(({ uid }) => uid === participantUid);
}

function participantOrder(state: MissionLifecycleState, participantUid: string): number {
  return state.participants.findIndex(({ uid }) => uid === participantUid);
}

function stateHasAssignments(value: readonly unknown[], opportunityId: string): boolean {
  return value.some((assignment) => isRecord(assignment) && assignment.opportunityId === opportunityId);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
