import { describe, expect, it } from 'vitest';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { applyGorgoneionMissionSupport } from './gorgoneionMissionSupport';

const cards = missionDeck();
const deckState = missionDeckStateFromCards(cards);
const topFive = deckState.order.slice(0, 5);
const tail = deckState.order.slice(5);

function input(overrides: Record<string, unknown> = {}) {
  return {
    deckState,
    phase: 'before-first-deal',
    dealtCount: 0,
    topCardIds: ['7♥', 'A♥'],
    bottomCardIds: ['6♥', '5♥', '4♥'],
    ...overrides,
  };
}

describe('Gorgoneion mission support policy', () => {
  it('partitions exactly the inspected top five and preserves each group and the untouched tail order', () => {
    const result = applyGorgoneionMissionSupport(input());

    expect(result?.order).toEqual([
      'A♥', '7♥',
      ...tail,
      '4♥', '5♥', '6♥',
    ]);
    expect(result?.order.slice(2, 2 + tail.length)).toEqual(tail);
    expect([...result!.order].sort()).toEqual([...deckState.order].sort());
  });

  it('returns only a deck state of card IDs and no card values', () => {
    const result = applyGorgoneionMissionSupport(input());

    expect(result).toEqual(expect.objectContaining({
      schemaVersion: deckState.schemaVersion,
      deckId: deckState.deckId,
    }));
    expect(Object.keys(result ?? {}).sort()).toEqual(['deckId', 'order', 'schemaVersion']);
    expect(JSON.stringify(result)).not.toMatch(/"(?:rank|suit|value)"/);
  });

  it('allows every inspected card to stay on top, preserving the original deck', () => {
    const result = applyGorgoneionMissionSupport(input({
      topCardIds: [...topFive].reverse(),
      bottomCardIds: [],
    }));

    expect(result?.order).toEqual(deckState.order);
  });

  it('allows every inspected card to go to the bottom after the untouched tail', () => {
    const result = applyGorgoneionMissionSupport(input({
      topCardIds: [],
      bottomCardIds: [...topFive].reverse(),
    }));

    expect(result?.order).toEqual([...tail, ...topFive]);
  });

  it.each([
    ['wrong phase', { phase: 'awaiting-card-selection' }],
    ['a card has already been dealt', { dealtCount: 1 }],
    ['negative deal count', { dealtCount: -1 }],
    ['fractional deal count', { dealtCount: 0.5 }],
    ['non-numeric deal count', { dealtCount: '0' }],
    ['fewer than five choices', { bottomCardIds: ['4♥', '5♥'] }],
    ['a valid card outside the inspected top five', {
      topCardIds: ['8♥'],
      bottomCardIds: ['4♥', '5♥', '6♥', '7♥'],
    }],
    ['an unknown card ID', {
      topCardIds: ['not-a-card'],
      bottomCardIds: ['4♥', '5♥', '6♥', '7♥'],
    }],
    ['a malformed card ID', {
      topCardIds: [7],
      bottomCardIds: ['4♥', '5♥', '6♥', '7♥'],
    }],
    ['a duplicate within a destination group', {
      topCardIds: ['A♥', 'A♥'],
      bottomCardIds: ['5♥', '6♥', '7♥'],
    }],
    ['a duplicate across destination groups', {
      topCardIds: ['A♥', '4♥'],
      bottomCardIds: ['4♥', '6♥', '7♥'],
    }],
    ['a malformed destination group', { topCardIds: 'A♥' }],
    ['an extra request field', { unexpected: true }],
  ])('fails closed for %s', (_name, overrides) => {
    expect(applyGorgoneionMissionSupport(input(overrides))).toBeNull();
  });

  it('fails closed when the stored deck is malformed or its order contains duplicate IDs', () => {
    expect(applyGorgoneionMissionSupport(input({ deckState: null }))).toBeNull();
    expect(applyGorgoneionMissionSupport(input({
      deckState: { ...deckState, order: [...deckState.order.slice(0, -1), deckState.order[0]] },
    }))).toBeNull();
  });
});
