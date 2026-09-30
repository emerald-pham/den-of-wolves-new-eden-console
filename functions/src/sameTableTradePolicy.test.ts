import { describe, expect, it } from 'vitest';
import { resolveSameTableTrade } from './sameTableTradePolicy';

const offer = {
  id: 'offer-1',
  fromUid: 'giver',
  toUid: 'receiver',
  tableId: 'aegis',
  revision: 5,
  quantities: { ore: 3, fuel: 2 },
} as const;

const input = {
  offer,
  acceptance: { actorUid: 'receiver', offer },
  participants: [
    { uid: 'giver', active: true, tableId: 'aegis' },
    { uid: 'receiver', active: true, tableId: 'aegis' },
  ],
  currentRevision: 5,
  sourceInventory: {
    ore: 10, fuel: 8, food: 1, water: 2, materials: 4, securityTeams: 3,
  },
  recipientInventory: {
    ore: 1, fuel: 0, food: 2, water: 5, materials: 6, securityTeams: 7,
  },
} as const;

function offerAndAcceptance(nextOffer: unknown) {
  return {
    ...input,
    offer: nextOffer,
    acceptance: { actorUid: 'receiver', offer: nextOffer },
  };
}

describe('same-table trade policy', () => {
  it('commits the exact typed quantities as one bilateral transfer with a stable receipt', () => {
    const before = structuredClone(input);

    const result = resolveSameTableTrade(input);

    expect(result).toEqual({
      status: 'committed',
      sourceInventory: {
        ore: 7, fuel: 6, food: 1, water: 2, materials: 4, securityTeams: 3,
      },
      recipientInventory: {
        ore: 4, fuel: 2, food: 2, water: 5, materials: 6, securityTeams: 7,
      },
      receipt: {
        receiptId: 'offer-1',
        offerId: 'offer-1',
        fromUid: 'giver',
        toUid: 'receiver',
        tableId: 'aegis',
        revision: 5,
        quantities: {
          ore: 3, fuel: 2, food: 0, water: 0, materials: 0, securityTeams: 0,
        },
      },
    });
    expect(input).toEqual(before);
    expect(result.sourceInventory).not.toBe(input.sourceInventory);
    expect(result.recipientInventory).not.toBe(input.recipientInventory);
  });

  it.each([
    ['missing quantities', undefined],
    ['empty quantities', {}],
    ['all-zero quantities', { ore: 0, fuel: 0 }],
    ['negative quantity', { ore: -1 }],
    ['fractional quantity', { ore: 1.5 }],
    ['unsafe quantity', { ore: Number.MAX_SAFE_INTEGER + 1 }],
    ['unknown resource', { ore: 1, scrap: 1 }],
  ])('rejects %s without changing either balance', (_label, quantities) => {
    const malformedOffer = { ...offer, quantities };
    const attempt = offerAndAcceptance(malformedOffer);
    const before = structuredClone(attempt);

    expect(() => resolveSameTableTrade(attempt as never)).toThrow();
    expect(attempt).toEqual(before);
  });

  it.each([
    ['source overdraw', { sourceInventory: { ...input.sourceInventory, ore: 2 } }],
    ['recipient overflow', { recipientInventory: { ...input.recipientInventory, ore: Number.MAX_SAFE_INTEGER } }],
    ['malformed source balance', { sourceInventory: { ...input.sourceInventory, scrap: 9 } }],
    ['negative recipient balance', { recipientInventory: { ...input.recipientInventory, water: -1 } }],
  ])('rejects %s atomically', (_label, change) => {
    const attempt = { ...input, ...change };
    const before = structuredClone(attempt);

    expect(() => resolveSameTableTrade(attempt as never)).toThrow();
    expect(attempt).toEqual(before);
  });

  it.each([
    ['inactive sender', { participants: [
      { uid: 'giver', active: false, tableId: 'aegis' },
      { uid: 'receiver', active: true, tableId: 'aegis' },
    ] }],
    ['inactive recipient', { participants: [
      { uid: 'giver', active: true, tableId: 'aegis' },
      { uid: 'receiver', active: false, tableId: 'aegis' },
    ] }],
    ['different current tables', { participants: [
      { uid: 'giver', active: true, tableId: 'aegis' },
      { uid: 'receiver', active: true, tableId: 'dione' },
    ] }],
    ['offer names another table', { offer: { ...offer, tableId: 'dione' } }],
    ['missing sender', { participants: [{ uid: 'receiver', active: true, tableId: 'aegis' }] }],
  ])('rejects %s with no partial transfer', (_label, change) => {
    const attempt = { ...input, ...change };
    const before = structuredClone(attempt);

    expect(() => resolveSameTableTrade(attempt as never)).toThrow();
    expect(attempt).toEqual(before);
  });

  it('requires the recipient, never the proposer, to accept the exact offer snapshot', () => {
    expect(() => resolveSameTableTrade({
      ...input,
      acceptance: { actorUid: 'giver', offer },
    })).toThrow(/recipient/i);

    expect(() => resolveSameTableTrade({
      ...input,
      acceptance: { actorUid: 'receiver', offer: { ...offer, quantities: { ore: 4, fuel: 2 } } },
    })).toThrow(/exact offer/i);
  });

  it('rejects a stale offer and a changed offer that kept its old acceptance', () => {
    expect(() => resolveSameTableTrade({ ...input, currentRevision: 6 }))
      .toThrow(/stale|changed/i);

    expect(() => resolveSameTableTrade({
      ...input,
      offer: { ...offer, quantities: { ore: 4, fuel: 2 } },
    })).toThrow(/exact offer/i);
  });

  it('replays an exact committed offer without applying the transfer again or changing its receipt', () => {
    const committed = resolveSameTableTrade(input);
    const replay = resolveSameTableTrade({
      ...input,
      currentRevision: 6,
      participants: [
        { uid: 'giver', active: false, tableId: null },
        { uid: 'receiver', active: true, tableId: 'dione' },
      ],
      sourceInventory: committed.sourceInventory,
      recipientInventory: committed.recipientInventory,
      existingReceipt: committed.receipt,
    });

    expect(replay.status).toBe('replayed');
    expect(replay.sourceInventory).toEqual(committed.sourceInventory);
    expect(replay.recipientInventory).toEqual(committed.recipientInventory);
    expect(replay.receipt).toEqual(committed.receipt);
  });

  it('does not treat a receipt for a changed offer as an idempotent replay', () => {
    const committed = resolveSameTableTrade(input);
    const changedOffer = { ...offer, quantities: { ore: 4, fuel: 2 } };

    expect(() => resolveSameTableTrade({
      ...input,
      offer: changedOffer,
      acceptance: { actorUid: 'receiver', offer: changedOffer },
      sourceInventory: committed.sourceInventory,
      recipientInventory: committed.recipientInventory,
      existingReceipt: committed.receipt,
    })).toThrow(/receipt|match|changed/i);
  });
});
