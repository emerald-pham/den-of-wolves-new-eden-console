import { describe, expect, it } from 'vitest';
import { AEGIS_DAMAGE_DECK, SHIP_DAMAGE_DECKS, drawShipDamage, shipDamage } from './shipDamage';

describe('authoritative ship damage deck', () => {
  it('draws one remaining card and damages its matching system', () => {
    const result = drawShipDamage('aegis', {
      damagedSystemIds: ['fighter-bay-alpha'], destroyed: false,
    }, () => 1);
    if (result.destroyed) throw new Error('Expected a damage card.');

    expect(result.card.card).toBe('3♥');
    expect(result.card.systemId).toBe('command-and-control');
    expect(result.state).toEqual({
      damagedSystemIds: ['fighter-bay-alpha', 'command-and-control'],
      destroyed: false,
    });
    expect(result.recycled).toBe(false);
  });

  it('recycles an armoured hull while another card remains', () => {
    const result = drawShipDamage('aegis', {
      damagedSystemIds: AEGIS_DAMAGE_DECK
        .filter(({ systemId }) => !['armoured-hull-i', 'armoured-hull-ii', 'reactor'].includes(systemId))
        .map(({ systemId }) => systemId),
      destroyed: false,
    }, () => 0);
    if (result.destroyed) throw new Error('Expected a damage card.');

    expect(result.card.systemId).toBe('armoured-hull-i');
    expect(result.recycled).toBe(true);
    expect(result.state.damagedSystemIds).not.toContain('armoured-hull-i');
  });

  it('keeps the last armoured hull out of the empty deck, then destroys the ship', () => {
    const allButHull = AEGIS_DAMAGE_DECK
      .filter(({ systemId }) => systemId !== 'armoured-hull-ii')
      .map(({ systemId }) => systemId);
    const finalDraw = drawShipDamage('aegis', {
      damagedSystemIds: allButHull, destroyed: false,
    }, () => 0);
    if (finalDraw.destroyed) throw new Error('Expected the final damage card.');

    expect(finalDraw.recycled).toBe(false);
    expect(finalDraw.state.damagedSystemIds).toContain('armoured-hull-ii');
    const exhausted = drawShipDamage('aegis', finalDraw.state, () => 0);
    expect(exhausted.destroyed).toBe(true);
    expect(exhausted.state.destroyed).toBe(true);
    expect(exhausted.state.damagedSystemIds).toHaveLength(AEGIS_DAMAGE_DECK.length);
    expect(exhausted.state.damagedSystemIds).toEqual(expect.arrayContaining(
      AEGIS_DAMAGE_DECK.map(({ systemId }) => systemId),
    ));
  });

  it('normalizes legacy and malformed session damage state', () => {
    expect(shipDamage(undefined)).toEqual({});
    expect(shipDamage({ aegis: { damagedSystemIds: ['reactor', 'reactor', 42], destroyed: 'no' } }))
      .toEqual({ aegis: { damagedSystemIds: ['reactor'], destroyed: false } });
  });

  it('rejects ships without an implemented damage deck', () => {
    expect(() => drawShipDamage('unknown', { damagedSystemIds: [], destroyed: false }, () => 0))
      .toThrow('damage deck');
  });
});

it.each([
  ['dione', 8, '8♣'], ['icebreaker', 8, '8♠'], ['shepherd', 7, 'A♠'],
  ['quellon', 7, 'A♣'], ['refinery-124', 9, 'A♦'], ['capybara', 7, 'A♠'],
])('provides the printed %s deck with %s cards', (shipId, count, firstCard) => {
  const deck = SHIP_DAMAGE_DECKS[shipId as string];
  expect(deck).toHaveLength(count as number);
  expect(drawShipDamage(shipId as string, { damagedSystemIds: [], destroyed: false }, () => 0))
    .toMatchObject({ card: { card: firstCard, systemId: 'storage' } });
});
