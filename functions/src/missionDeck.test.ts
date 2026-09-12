import { describe, expect, it } from 'vitest';
import {
  MISSION_DECK_ID,
  MISSION_DECK_RANKS,
  MISSION_DECK_SCHEMA_VERSION,
  MISSION_DECK_SUITS,
  missionCardsForState,
  missionDeck,
  missionDeckStateFromCards,
  parseMissionDeckState,
  shuffledMissionDeck,
} from './missionDeck';

describe('authoritative mission deck', () => {
  it('contains three suits without 2s or 3s and applies printed values', () => {
    const deck = missionDeck();

    expect(deck).toHaveLength(33);
    expect(new Set(deck.map((card) => card.suit))).toEqual(new Set(MISSION_DECK_SUITS));
    expect(new Set(deck.map((card) => card.rank))).toEqual(new Set(MISSION_DECK_RANKS));
    expect(deck.some((card) => card.rank === '2' || card.rank === '3')).toBe(false);
    expect(deck.filter((card) => card.rank === 'A').every((card) => card.value === 10)).toBe(true);
    expect(deck.filter((card) => /^\d+$/.test(card.rank)).every((card) => card.value === Number(card.rank))).toBe(true);
    expect(deck.filter((card) => ['J', 'Q', 'K'].includes(card.rank)).every((card) => card.value === -5)).toBe(true);
    expect(new Set(deck.map((card) => card.id)).size).toBe(deck.length);
  });

  it('shuffles every card with an injected deterministic Fisher-Yates source', () => {
    const shuffled = shuffledMissionDeck(() => 0);

    expect(shuffled).toHaveLength(33);
    expect(new Set(shuffled.map((card) => card.id))).toEqual(new Set(missionDeck().map((card) => card.id)));
    expect(shuffled.map((card) => card.id)).not.toEqual(missionDeck().map((card) => card.id));
  });

  it('rejects an invalid shuffle index and malformed persisted state', () => {
    expect(() => shuffledMissionDeck((upperBound) => upperBound)).toThrow(/outside/i);
    const valid = missionDeckStateFromCards(missionDeck());
    expect(parseMissionDeckState(valid)).toEqual(valid);
    const rotated = { ...valid, order: [...valid.order.slice(1), valid.order[0]!] };
    expect(parseMissionDeckState(rotated)).toEqual(rotated);
    expect(parseMissionDeckState({ ...valid, order: [...valid.order.slice(0, -1), valid.order[0]] })).toBeNull();
    expect(parseMissionDeckState({ ...valid, deckId: 'other' })).toBeNull();
  });

  it('reconstructs typed cards from the persisted internal identity order', () => {
    const state = missionDeckStateFromCards(shuffledMissionDeck(() => 0));
    const cards = missionCardsForState(state);

    expect(state).toMatchObject({ schemaVersion: MISSION_DECK_SCHEMA_VERSION, deckId: MISSION_DECK_ID });
    expect(cards.map((card) => card.id)).toEqual(state.order);
    expect(cards.map((card) => card.value)).toContain(-5);
  });
});
