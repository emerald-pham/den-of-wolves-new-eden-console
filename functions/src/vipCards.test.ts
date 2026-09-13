import { describe, expect, it } from 'vitest';
import {
  VIP_CARD_DEFINITIONS,
  availableVipCards,
  consumeVipCardState,
  drawVipCardState,
  emptyVipDeckState,
  parseVipDeckState,
  transferVipCardState,
  vipHandForState,
} from './vipCards';

describe('Dione VIP deck', () => {
  it('contains exactly the nine printed named cards', () => {
    expect(VIP_CARD_DEFINITIONS.map((card) => card.name)).toEqual([
      'Party Deck', 'Spa Deck', 'Gaming Deck', 'Casino Deck', 'Theatre Deck',
      'Restaurant Deck', 'Art Deck', 'Family Fun Deck', 'Theme Park Deck',
    ]);
  });

  it('draws one remaining card, increments revision, and projects it only to its owner', () => {
    const result = drawVipCardState(emptyVipDeckState(), 'alice', 3);
    expect(result?.card.name).toBe('Casino Deck');
    expect(result?.state.revision).toBe(1);
    expect(vipHandForState(result!.state, 's1', 'alice').cards).toEqual([
      { id: 'casino-deck', name: 'Casino Deck', status: 'available' },
    ]);
    expect(vipHandForState(result!.state, 's1', 'bob').cards).toEqual([]);
  });

  it('rejects duplicate draw state and malformed private deck data', () => {
    const first = drawVipCardState(emptyVipDeckState(), 'alice', 0)!;
    expect(drawVipCardState(first.state, 'bob', 0)?.card.id).not.toBe(first.card.id);
    expect(parseVipDeckState({ revision: 1, cards: [] })).toBeUndefined();
  });

  it('indexes uniformly within the remaining cards without wrapping high indexes', () => {
    const state = emptyVipDeckState();
    const partiallyDepleted = {
      ...state,
      revision: 6,
      cards: state.cards.map((card, index) => index < 6
        ? { ...card, ownerUid: `owner-${index}` }
        : card),
    };
    expect(availableVipCards(partiallyDepleted).map((card) => card.id)).toEqual([
      'art-deck', 'family-fun-deck', 'theme-park-deck',
    ]);
    expect(drawVipCardState(partiallyDepleted, 'alice', 2)?.card.id).toBe('theme-park-deck');
    expect(drawVipCardState(partiallyDepleted, 'alice', 3)).toBeUndefined();
  });

  it('transfers only the current unspent owner card and rejects stale owners', () => {
    const first = drawVipCardState(emptyVipDeckState(), 'alice', 0)!;
    const transferred = transferVipCardState(first.state, 'alice', 'bob', first.card.id)!;
    expect(vipHandForState(transferred, 's1', 'alice').cards).toEqual([]);
    expect(vipHandForState(transferred, 's1', 'bob').cards[0]).toMatchObject({ id: first.card.id });
    expect(transferVipCardState(first.state, 'bob', 'carol', first.card.id)).toBeUndefined();
  });

  it('marks a card spent exactly once and refuses replay or transfer after consumption', () => {
    const first = drawVipCardState(emptyVipDeckState(), 'alice', 0)!;
    const spent = consumeVipCardState(first.state, 'alice', first.card.id)!;
    expect(vipHandForState(spent, 's1', 'alice').cards[0]).toMatchObject({ id: first.card.id, status: 'spent' });
    expect(consumeVipCardState(spent, 'alice', first.card.id)).toBeUndefined();
    expect(transferVipCardState(spent, 'alice', 'bob', first.card.id)).toBeUndefined();
  });
});
