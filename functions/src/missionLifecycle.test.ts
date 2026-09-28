import { describe, expect, it } from 'vitest';
import {
  addFacilitatorCardsFromTopDeck,
  allocateBlindExtraMissionCard,
  assignRemainingMissionCards,
  calculateMissionOpportunityTotals,
  createMissionLifecycleState,
  discardMissionCardSecretly,
  missionLeaderCardRequestCounts,
  openMissionDiscarding,
  privateMissionHandForParticipant,
  recordMissionCardRequest,
  type MissionBonusSourceInput,
  type MissionLifecycleParticipant,
  type MissionLifecycleState,
  type MissionLifecycleStateInput,
} from './missionLifecycle';
import {
  missionDeck,
  missionDeckStateFromCards,
  type MissionCardId,
  type MissionDeckState,
} from './missionDeck';

const asCardId = (value: string): MissionCardId => value as MissionCardId;

const standardParticipants: readonly MissionLifecycleParticipant[] = [
  { uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] },
  { uid: 'bob', roleId: 'icebreaker-miner', craftIds: ['highwall'] },
];

function deckWithPrefix(prefix: readonly string[]): MissionDeckState {
  const cards = missionDeck();
  const preferred = prefix.map((id) => {
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) throw new Error(`Unknown fixture card: ${id}`);
    return card;
  });
  const preferredIds = new Set(preferred.map(({ id }) => id));
  return missionDeckStateFromCards([
    ...preferred,
    ...cards.filter(({ id }) => !preferredIds.has(id)),
  ]);
}

function buildState(overrides: Partial<MissionLifecycleStateInput> = {}): MissionLifecycleState {
  const participants = overrides.participants ?? standardParticipants;
  const initialCards = overrides.initialCards ?? participants.map((participant, index) => ({
    participantUid: participant.uid,
    cardId: asCardId(index === 0 ? 'A♥' : '4♥'),
  }));
  const state = createMissionLifecycleState({
    missionId: 'mission-1',
    siteCode: 'A',
    leaderUid: 'alice',
    participants,
    deckState: missionDeckStateFromCards(missionDeck()),
    dealtCount: participants.length,
    initialCards,
    ...overrides,
  });
  if (!state) throw new Error('Invalid mission lifecycle fixture.');
  return state;
}

function addExtra(
  state: MissionLifecycleState,
  participantUid: string,
  opportunityId: string,
  requestId: string,
): MissionLifecycleState {
  const result = allocateBlindExtraMissionCard(state, { participantUid, opportunityId, requestId });
  if (!result) throw new Error('Could not allocate a fixture extra card.');
  return result.state;
}

function openDiscards(state: MissionLifecycleState): MissionLifecycleState {
  const next = openMissionDiscarding(state);
  if (!next) throw new Error('Could not open fixture discards.');
  return next;
}

function discard(
  state: MissionLifecycleState,
  participantUid: string,
  cardId: string,
): MissionLifecycleState {
  const result = discardMissionCardSecretly(state, participantUid, asCardId(cardId));
  if (!result) throw new Error(`Could not discard ${participantUid}'s fixture card.`);
  return result.state;
}

function assign(
  state: MissionLifecycleState,
  participantUid: string,
  placements: readonly { readonly cardId: string; readonly opportunityId: string }[],
): MissionLifecycleState {
  const result = assignRemainingMissionCards(state, participantUid, placements.map((placement) => ({
    cardId: asCardId(placement.cardId),
    opportunityId: placement.opportunityId,
  })));
  if (!result) throw new Error(`Could not assign ${participantUid}'s fixture cards.`);
  return result.state;
}

function completeAssignments(
  state: MissionLifecycleState,
  placementsByUid: Readonly<Record<string, readonly { readonly cardId: string; readonly opportunityId: string }[]>>,
): MissionLifecycleState {
  for (const participant of state.participants) {
    state = assign(state, participant.uid, placementsByUid[participant.uid] ?? []);
  }
  return state;
}

function dealTopCards(state: MissionLifecycleState): MissionLifecycleState {
  const result = addFacilitatorCardsFromTopDeck(state, 'facilitator-deal-1', () => 0);
  if (!result) throw new Error('Could not deal fixture facilitator cards.');
  return result.state;
}

describe('pure away-mission lifecycle', () => {
  it('records participant requests as a count only and exposes no reason field', () => {
    const state = buildState();
    const requested = recordMissionCardRequest(state, {
      participantUid: 'bob',
      count: 2,
      reason: 'secret strategy',
    });

    expect(requested?.requestsByParticipant).toEqual([{ participantUid: 'bob', count: 2 }]);
    expect(missionLeaderCardRequestCounts(requested!)).toEqual([
      { participantUid: 'bob', count: 2 },
    ]);
    expect(JSON.stringify(requested?.requestsByParticipant)).not.toContain('secret strategy');
    expect(recordMissionCardRequest(state, { participantUid: 'outsider', count: 1 })).toBeNull();
    expect(recordMissionCardRequest(state, { participantUid: 'bob', count: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('allocates an extra card blindly and safely replays the same leader request', () => {
    const initial = buildState();
    const first = allocateBlindExtraMissionCard(initial, {
      participantUid: 'bob',
      opportunityId: 'A-1',
      requestId: 'allocate-1',
    });

    expect(first?.receipt).toEqual({
      status: 'committed',
      requestId: 'allocate-1',
      participantUid: 'bob',
      opportunityId: 'A-1',
      cardCount: 1,
    });
    expect(first?.state.dealtCount).toBe(3);
    expect(JSON.stringify(first?.receipt)).not.toMatch(/cardId|rank|suit|value|5♥/);
    expect(privateMissionHandForParticipant(first!.state, 'bob')?.cards.map(({ id }) => id))
      .toEqual(['4♥', '5♥']);
    expect(privateMissionHandForParticipant(first!.state, 'alice')?.cards.map(({ id }) => id))
      .toEqual(['A♥']);

    const replay = allocateBlindExtraMissionCard(first!.state, {
      participantUid: 'bob',
      opportunityId: 'A-1',
      requestId: 'allocate-1',
    });
    expect(replay?.receipt.status).toBe('replayed');
    expect(replay?.state).toEqual(first?.state);
    expect(replay?.state.dealtCount).toBe(3);
  });

  it('limits blind distribution to one card per participant and opportunity', () => {
    const first = allocateBlindExtraMissionCard(buildState(), {
      participantUid: 'alice',
      opportunityId: 'A-1',
      requestId: 'allocate-1',
    });
    expect(first).not.toBeNull();

    expect(allocateBlindExtraMissionCard(first!.state, {
      participantUid: 'alice',
      opportunityId: 'A-1',
      requestId: 'allocate-2',
    })).toBeNull();
    expect(first!.state.dealtCount).toBe(3);
    expect(allocateBlindExtraMissionCard(first!.state, {
      participantUid: 'alice',
      opportunityId: 'A-2',
      requestId: 'allocate-1',
    })).toBeNull();
  });

  it('supports the P403 one-card-per-participant discard ledger and consumes an owned extra card once', () => {
    let state = addExtra(buildState(), 'bob', 'A-2', 'allocate-bob-a2');
    state = openDiscards(state);

    const aliceDiscard = discardMissionCardSecretly(state, 'alice', asCardId('A♥'));
    expect(aliceDiscard?.receipt).toEqual({ participantUid: 'alice', discarded: true });
    expect(JSON.stringify(aliceDiscard?.receipt)).not.toContain('A♥');
    state = aliceDiscard!.state;
    const bobDiscard = discardMissionCardSecretly(state, 'bob', asCardId('5♥'));
    expect(bobDiscard?.state.phase).toBe('assignment-ready');
    expect(bobDiscard?.state.discardedParticipantUids).toEqual(['alice', 'bob']);
    expect(bobDiscard?.state.discardedCardIds).toEqual(['A♥', '5♥']);
    expect(privateMissionHandForParticipant(bobDiscard!.state, 'bob')?.cards.map(({ id, status }) => ({ id, status })))
      .toEqual([{ id: '4♥', status: 'remaining' }, { id: '5♥', status: 'discarded' }]);
    expect(discardMissionCardSecretly(bobDiscard!.state, 'bob', asCardId('4♥'))).toBeNull();
    expect(discardMissionCardSecretly(bobDiscard!.state, 'alice', asCardId('4♥'))).toBeNull();
  });

  it('hydrates the existing P403 discarded-card ledger and prevents discarded cards from assignment', () => {
    const state = buildState({
      phase: 'assignment-ready',
      discardedParticipantUids: ['alice', 'bob'],
      discardedCardIds: [asCardId('A♥'), asCardId('4♥')],
    });

    expect(assignRemainingMissionCards(state, 'alice', [{
      cardId: asCardId('A♥'),
      opportunityId: 'A-1',
    }])).toBeNull();
  });

  it('requires every remaining owned card and rejects duplicate opportunities in one participant assignment', () => {
    let state = buildState();
    state = addExtra(state, 'alice', 'A-1', 'allocate-alice-a1');
    state = addExtra(state, 'alice', 'A-2', 'allocate-alice-a2');
    state = openDiscards(state);
    state = discard(state, 'alice', 'A♥');
    state = discard(state, 'bob', '4♥');

    expect(assignRemainingMissionCards(state, 'alice', [
      { cardId: asCardId('5♥'), opportunityId: 'A-1' },
      { cardId: asCardId('6♥'), opportunityId: 'A-1' },
    ])).toBeNull();
    expect(assignRemainingMissionCards(state, 'alice', [
      { cardId: asCardId('4♥'), opportunityId: 'A-1' },
      { cardId: asCardId('6♥'), opportunityId: 'A-2' },
    ])).toBeNull();
    expect(assignRemainingMissionCards(state, 'alice', [
      { cardId: asCardId('5♥'), opportunityId: 'A-1' },
    ])).toBeNull();

    const assigned = assignRemainingMissionCards(state, 'alice', [
      { cardId: asCardId('5♥'), opportunityId: 'A-1' },
      { cardId: asCardId('6♥'), opportunityId: 'A-2' },
    ]);
    expect(assigned?.state.assignments).toEqual([
      { participantUid: 'alice', opportunityId: 'A-1', cardId: '5♥', faceDown: true },
      { participantUid: 'alice', opportunityId: 'A-2', cardId: '6♥', faceDown: true },
    ]);
    expect(JSON.stringify(assigned?.receipt)).not.toMatch(/cardId|5♥|6♥/);
    const complete = assignRemainingMissionCards(assigned!.state, 'bob', []);
    expect(complete?.state.phase).toBe('assignments-complete');
  });

  it('adds and shuffles one server top-deck card only for each nonempty opportunity', () => {
    let state = addExtra(buildState(), 'bob', 'A-2', 'allocate-bob-a2');
    state = openDiscards(state);
    state = discard(state, 'alice', 'A♥');
    state = discard(state, 'bob', '4♥');
    state = completeAssignments(state, {
      bob: [{ cardId: '5♥', opportunityId: 'A-1' }],
    });

    const dealt = addFacilitatorCardsFromTopDeck(state, 'facilitator-deal-1', () => 0);
    expect(dealt?.state.facilitatorCards.map(({ opportunityId }) => opportunityId)).toEqual(['A-1']);
    expect(dealt?.state.shuffledPiles.map(({ opportunityId }) => opportunityId)).toEqual(['A-1']);
    expect(dealt?.state.dealtCount).toBe(state.dealtCount + 1);
    expect(dealt?.receipt).toEqual({
      status: 'committed',
      requestId: 'facilitator-deal-1',
      addedCount: 1,
      opportunityIds: ['A-1'],
    });
    expect(JSON.stringify(dealt?.receipt)).not.toMatch(/cardId|rank|suit|value|6♥/);
  });

  it('replays facilitator top-deck addition without drawing or shuffling again', () => {
    let state = addExtra(buildState(), 'bob', 'A-2', 'allocate-bob-a2');
    state = openDiscards(state);
    state = discard(state, 'alice', 'A♥');
    state = discard(state, 'bob', '4♥');
    state = completeAssignments(state, {
      bob: [{ cardId: '5♥', opportunityId: 'A-1' }],
    });
    let shuffleCalls = 0;
    const first = addFacilitatorCardsFromTopDeck(state, 'facilitator-deal-1', (upperBound) => {
      shuffleCalls += 1;
      return upperBound - 1;
    });
    expect(first).not.toBeNull();
    const callsAfterCommit = shuffleCalls;

    const replay = addFacilitatorCardsFromTopDeck(first!.state, 'facilitator-deal-1', () => {
      throw new Error('A replay must not draw or reshuffle.');
    });
    expect(replay?.receipt.status).toBe('replayed');
    expect(replay?.state).toEqual(first?.state);
    expect(replay?.state.dealtCount).toBe(first?.state.dealtCount);
    expect(shuffleCalls).toBe(callsAfterCommit);
    expect(addFacilitatorCardsFromTopDeck(first!.state, 'different-request', () => 0)).toBeNull();
  });

  it('fails closed on an exhausted deck or invalid server shuffle index without partial state changes', () => {
    let state = addExtra(buildState(), 'bob', 'A-2', 'allocate-bob-a2');
    state = openDiscards(state);
    state = discard(state, 'alice', 'A♥');
    state = discard(state, 'bob', '4♥');
    state = completeAssignments(state, {
      bob: [{ cardId: '5♥', opportunityId: 'A-1' }],
    });

    const invalidShuffle = addFacilitatorCardsFromTopDeck(state, 'bad-shuffle', (upperBound) => upperBound);
    expect(invalidShuffle).toBeNull();
    expect(state.phase).toBe('assignments-complete');
    expect(state.facilitatorCards).toEqual([]);

    const exhausted = { ...state, dealtCount: state.deckState.order.length };
    expect(addFacilitatorCardsFromTopDeck(exhausted, 'depleted-deck', () => 0)).toBeNull();
  });

  it('derives totals, bonuses, and critical branches from server-owned card and contribution ledgers', () => {
    const participants: readonly MissionLifecycleParticipant[] = [
      { uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] },
      { uid: 'bob', roleId: 'refinery-124-pdf-colonel', craftIds: ['pdf-escort-fighter-wing'] },
    ];
    const deckState = deckWithPrefix(['4♥', '6♥', 'A♥', 'A♦', '5♥', '5♦']);
    let state = buildState({
      siteCode: 'D',
      participants,
      leaderUid: 'alice',
      deckState,
      dealtCount: 2,
      initialCards: [
        { participantUid: 'alice', cardId: asCardId('4♥') },
        { participantUid: 'bob', cardId: asCardId('6♥') },
      ],
    });
    state = addExtra(state, 'alice', 'D-1', 'allocate-alice-d1');
    state = addExtra(state, 'bob', 'D-2', 'allocate-bob-d2');
    state = openDiscards(state);
    state = discard(state, 'alice', '4♥');
    state = discard(state, 'bob', '6♥');
    state = completeAssignments(state, {
      alice: [{ cardId: 'A♥', opportunityId: 'D-1' }],
      bob: [{ cardId: 'A♦', opportunityId: 'D-2' }],
    });
    state = dealTopCards(state);

    const bonusSources: readonly MissionBonusSourceInput[] = [
      { participantUid: 'alice', source: { kind: 'craft', id: 'starlight' }, bonuses: { salvage: 1 } },
      {
        participantUid: 'bob',
        source: { kind: 'craft', id: 'pdf-escort-fighter-wing' },
        bonuses: { salvage: 1 },
      },
    ];
    const results = calculateMissionOpportunityTotals(state, bonusSources, {});
    expect(results).toEqual([
      expect.objectContaining({
        opportunityId: 'D-1',
        cardTotal: 15,
        bonusTotal: 1,
        total: 16,
        difficulty: 14,
        criticalThreshold: 20,
        outcome: 'success',
        rewardBranch: 'success',
      }),
      expect.objectContaining({
        opportunityId: 'D-2',
        cardTotal: 15,
        bonusTotal: 1,
        total: 16,
        difficulty: 14,
        criticalThreshold: 20,
        outcome: 'success',
        rewardBranch: 'success',
      }),
      expect.objectContaining({
        opportunityId: 'D-3',
        cardTotal: 0,
        bonusTotal: 0,
        total: 0,
        difficulty: null,
        criticalThreshold: null,
        outcome: 'automatic-failure',
        rewardBranch: 'none',
      }),
    ]);
    expect(JSON.stringify(results)).not.toMatch(/A♥|A♦|5♥|rank|suit|cardId/);
  });

  it('does not apply an authorized craft bonus unless its owner contributed to that opportunity', () => {
    const participants: readonly MissionLifecycleParticipant[] = [
      { uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] },
      { uid: 'bob', roleId: 'refinery-124-pdf-colonel', craftIds: ['pdf-escort-fighter-wing'] },
    ];
    const deckState = deckWithPrefix(['4♥', '6♥', 'A♥', 'A♦', '5♥', '5♦']);
    let state = buildState({
      siteCode: 'D', participants, leaderUid: 'alice', deckState, dealtCount: 2,
      initialCards: [
        { participantUid: 'alice', cardId: asCardId('4♥') },
        { participantUid: 'bob', cardId: asCardId('6♥') },
      ],
    });
    state = addExtra(state, 'alice', 'D-1', 'allocate-alice-d1');
    state = addExtra(state, 'bob', 'D-2', 'allocate-bob-d2');
    state = openDiscards(state);
    state = discard(state, 'alice', '4♥');
    state = discard(state, 'bob', '6♥');
    state = completeAssignments(state, {
      alice: [{ cardId: 'A♥', opportunityId: 'D-1' }],
      bob: [{ cardId: 'A♦', opportunityId: 'D-2' }],
    });
    state = dealTopCards(state);

    const results = calculateMissionOpportunityTotals(state, [
      { participantUid: 'alice', source: { kind: 'craft', id: 'starlight' }, bonuses: { salvage: 1 } },
      {
        participantUid: 'bob',
        source: { kind: 'craft', id: 'pdf-escort-fighter-wing' },
        bonuses: { salvage: 1 },
      },
    ], {});

    expect(results?.find(({ opportunityId }) => opportunityId === 'D-1')?.bonusTotal).toBe(1);
    expect(results?.find(({ opportunityId }) => opportunityId === 'D-2')?.bonusTotal).toBe(1);
    expect(results?.find(({ opportunityId }) => opportunityId === 'D-3')?.bonusTotal).toBe(0);
  });

  it('uses the printed secret d6 multiplier and critical offset for Wolf Supply Outpost K', () => {
    const participants: readonly MissionLifecycleParticipant[] = [
      { uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] },
    ];
    const deckState = deckWithPrefix(['4♥', '10♥', '10♦']);
    let state = buildState({
      siteCode: 'K',
      participants,
      leaderUid: 'alice',
      deckState,
      dealtCount: 1,
      initialCards: [{ participantUid: 'alice', cardId: asCardId('4♥') }],
    });
    state = addExtra(state, 'alice', 'K-1', 'allocate-alice-k1');
    state = openDiscards(state);
    state = discard(state, 'alice', '4♥');
    state = assign(state, 'alice', [{ cardId: '10♥', opportunityId: 'K-1' }]);
    state = dealTopCards(state);

    const result = calculateMissionOpportunityTotals(state, [], { 'K-1': 2 });
    expect(result).toEqual([
      expect.objectContaining({
        opportunityId: 'K-1',
        cardTotal: 20,
        difficulty: 10,
        criticalThreshold: 20,
        outcome: 'critical-success',
        rewardBranch: 'critical',
      }),
    ]);
    expect(calculateMissionOpportunityTotals(state, [], { 'K-1': 7 })).toBeNull();
    expect(calculateMissionOpportunityTotals(state, [], { 'K-1': 2, 'unknown': 3 })).toBeNull();
  });

  it('rejects unknown cards at hydration, assignment, and private projection boundaries', () => {
    expect(createMissionLifecycleState({
      missionId: 'mission-1',
      siteCode: 'A',
      leaderUid: 'alice',
      participants: standardParticipants,
      deckState: missionDeckStateFromCards(missionDeck()),
      dealtCount: 2,
      initialCards: [
        { participantUid: 'alice', cardId: 'forged-card' as MissionCardId },
        { participantUid: 'bob', cardId: asCardId('4♥') },
      ],
    })).toBeNull();

    const valid = buildState();
    const forged = {
      ...valid,
      cards: valid.cards.map((card, index) => index === 0
        ? { ...card, cardId: 'forged-card' as MissionCardId }
        : card),
    } as MissionLifecycleState;
    expect(privateMissionHandForParticipant(forged, 'alice')).toBeNull();
    expect(assignRemainingMissionCards(forged, 'alice', [{
      cardId: 'forged-card' as MissionCardId,
      opportunityId: 'A-1',
    }])).toBeNull();
  });
});
