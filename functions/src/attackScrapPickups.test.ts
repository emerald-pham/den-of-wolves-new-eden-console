import { describe, expect, it } from 'vitest';
import {
  carryForwardAttackScrapPickups,
  parseAttackScrapPickups,
  takeAttackScrapPickup,
} from './attackScrapPickups';

type Fields = Record<string, unknown>;

const damageRow = (target: string, amount: number, destroyed = false): Fields => ({
  target, amount, populationBefore: 2_500, population: 2_000,
  state: { damagedSystemIds: [], destroyed }, draws: Array.from({ length: amount }, () => ({ casualty: false })),
});
const resolvedAttack = (attackId: string, turn: number, fleetDamage: Fields[], scrapClaims?: Fields): Fields => ({
  type: 'wolf-attack-state', status: 'resolved', attackId, turn,
  calculationReceipt: {
    type: 'wolf-combat-calculation', version: 1, requestId: `final-${attackId}`,
    phase: { turn, phase: 'coordination' }, targeting: {}, ranges: [], boarding: [],
    fleetDamage, returningInstanceIds: [],
  },
  ...(scrapClaims ? { aftermath: { scrapClaims } } : {}),
});

describe('attack Scrap pickups that outlive their attack', () => {
  it('carries each uncollected threshold pickup of the finished attack forward, keyed by ship', () => {
    const ledger = carryForwardAttackScrapPickups({}, resolvedAttack('attack-7', 7, [
      damageRow('aegis', 3), damageRow('dione', 2), damageRow('quellon', 5, true), damageRow('shepherd', 4),
    ], { shepherd: { shuttleId: 'macaw', scrap: 1 } }));

    expect(ledger).toEqual({
      aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }],
      quellon: [{ attackId: 'attack-7', turn: 7, destroyed: true }],
    });
  });

  it('keeps an earlier pickup beside a later attack pickup for the same ship and never duplicates an attack', () => {
    const first = carryForwardAttackScrapPickups({}, resolvedAttack('attack-7', 7, [damageRow('aegis', 3)]));
    const second = carryForwardAttackScrapPickups(first, resolvedAttack('attack-8', 8, [damageRow('aegis', 4)]));

    expect(second).toEqual({ aegis: [
      { attackId: 'attack-7', turn: 7, destroyed: false },
      { attackId: 'attack-8', turn: 8, destroyed: false },
    ] });
    expect(carryForwardAttackScrapPickups(second, resolvedAttack('attack-8', 8, [damageRow('aegis', 4)])))
      .toEqual(second);
  });

  it('carries nothing from an unresolved attack or one without a combat damage receipt', () => {
    expect(carryForwardAttackScrapPickups({}, { ...resolvedAttack('attack-7', 7, [damageRow('aegis', 3)]),
      status: 'declared' })).toEqual({});
    expect(carryForwardAttackScrapPickups({}, { type: 'wolf-attack-state', status: 'resolved',
      attackId: 'attack-7', turn: 7 })).toEqual({});
    expect(carryForwardAttackScrapPickups({}, undefined)).toEqual({});
  });

  it('removes exactly one collected pickup and reports a missing one', () => {
    const ledger = { aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false },
      { attackId: 'attack-8', turn: 8, destroyed: false }] };

    expect(takeAttackScrapPickup(ledger, 'aegis', 'attack-7')).toEqual({
      pickup: { attackId: 'attack-7', turn: 7, destroyed: false },
      ledger: { aegis: [{ attackId: 'attack-8', turn: 8, destroyed: false }] },
    });
    expect(takeAttackScrapPickup({ aegis: [{ attackId: 'attack-8', turn: 8, destroyed: false }] }, 'aegis', 'attack-8'))
      .toEqual({ pickup: { attackId: 'attack-8', turn: 8, destroyed: false }, ledger: {} });
    expect(takeAttackScrapPickup(ledger, 'aegis', 'attack-9')).toBeUndefined();
    expect(takeAttackScrapPickup(ledger, 'dione', 'attack-7')).toBeUndefined();
  });

  it('accepts an absent ledger and rejects malformed or duplicated entries', () => {
    expect(parseAttackScrapPickups(undefined)).toEqual({});
    expect(parseAttackScrapPickups({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] }))
      .toEqual({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });
    expect(parseAttackScrapPickups([])).toBeUndefined();
    expect(parseAttackScrapPickups({ 'not-a-ship': [{ attackId: 'attack-7', turn: 7, destroyed: false }] }))
      .toBeUndefined();
    expect(parseAttackScrapPickups({ aegis: [{ attackId: 'attack-7', turn: 0, destroyed: false }] })).toBeUndefined();
    expect(parseAttackScrapPickups({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: 'no' }] })).toBeUndefined();
    expect(parseAttackScrapPickups({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false, scrap: 9 }] }))
      .toBeUndefined();
    expect(parseAttackScrapPickups({ aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false },
      { attackId: 'attack-7', turn: 7, destroyed: false }] })).toBeUndefined();
  });
});
