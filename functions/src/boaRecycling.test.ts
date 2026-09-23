import { describe, expect, it } from 'vitest';
import type { ShipResourceInventory } from './resources';
import {
  parseBoaRecyclingLedger,
  resolveBoaRecycling,
} from './boaRecycling';

const base = {
  currentCycle: 2,
  expectedCycle: 2,
  expectedLedgerRevision: 0,
  phase: 'coordination',
  fuelled: true,
  recipeId: 'food',
  resources: {
    ore: 12,
    fuel: 12,
    food: 12,
    water: 12,
    materials: 6,
    securityTeams: 2,
    scrap: 0,
  },
  ledger: { cycle: 0, revision: 0, exchangesThisCycle: 0 },
} as const;

describe('Boa recycling', () => {
  it.each([
    ['food', 'food', 6],
    ['water', 'water', 6],
    ['ore', 'ore', 6],
    ['materials', 'materials', 3],
    ['fuel', 'fuel', 6],
  ] as const)('trades the printed %s recipe for exactly one Scrap', (recipeId, resourceId, cost) => {
    const result = resolveBoaRecycling({ ...base, recipeId });

    expect(result).toMatchObject({
      recipeId,
      resourceId,
      resourceCost: cost,
      scrapAwarded: 1,
      resources: {
        [resourceId]: base.resources[resourceId] - cost,
        scrap: 1,
      },
      ledger: { cycle: 2, revision: 1, exchangesThisCycle: 1 },
    });
    for (const resource of ['food', 'water', 'ore', 'materials', 'fuel'] as const) {
      if (resource !== resourceId) {
        expect(result.resources[resource]).toBe(base.resources[resource]);
      }
    }
    expect(result.resources.securityTeams).toBe(base.resources.securityTeams);
  });

  it('applies inventory and cycle usage as one immutable transition', () => {
    const result = resolveBoaRecycling(base);

    expect(result.resources).not.toBe(base.resources);
    expect(result.ledger).not.toBe(base.ledger);
    expect(base.resources).toEqual({
      ore: 12, fuel: 12, food: 12, water: 12, materials: 6, securityTeams: 2, scrap: 0,
    });
    expect(base.ledger).toEqual({ cycle: 0, revision: 0, exchangesThisCycle: 0 });
  });

  it('adds the first Scrap when an older inventory has no Scrap field', () => {
    const legacyResources: ShipResourceInventory = {
      ore: base.resources.ore,
      fuel: base.resources.fuel,
      food: base.resources.food,
      water: base.resources.water,
      materials: base.resources.materials,
      securityTeams: base.resources.securityTeams,
    };
    const result = resolveBoaRecycling({ ...base, resources: legacyResources });

    expect(result.resources.scrap).toBe(1);
  });

  it('allows two exchanges per cycle and rejects a third, including repeated recipes', () => {
    const first = resolveBoaRecycling(base);
    const second = resolveBoaRecycling({
      ...base,
      expectedLedgerRevision: first.ledger.revision,
      resources: first.resources,
      ledger: first.ledger,
    });

    expect(second.resources).toMatchObject({ food: 0, scrap: 2 });
    expect(second.ledger).toEqual({ cycle: 2, revision: 2, exchangesThisCycle: 2 });
    expect(() => resolveBoaRecycling({
      ...base,
      expectedLedgerRevision: second.ledger.revision,
      resources: second.resources,
      ledger: second.ledger,
    })).toThrow(/at most two exchanges per cycle/i);
  });

  it('starts a fresh two-exchange allowance on the next cycle', () => {
    const first = resolveBoaRecycling(base);
    const second = resolveBoaRecycling({
      ...base,
      expectedLedgerRevision: first.ledger.revision,
      resources: first.resources,
      ledger: first.ledger,
    });
    const nextCycle = resolveBoaRecycling({
      ...base,
      currentCycle: 3,
      expectedCycle: 3,
      expectedLedgerRevision: second.ledger.revision,
      recipeId: 'water',
      resources: second.resources,
      ledger: second.ledger,
    });

    expect(nextCycle.ledger).toEqual({ cycle: 3, revision: 3, exchangesThisCycle: 1 });
    expect(nextCycle.resources).toMatchObject({ water: 6, scrap: 3 });
  });

  it.each([
    ['unfuelled shuttle', { fuelled: false }],
    ['wrong phase', { phase: 'team' }],
    ['stale cycle', { expectedCycle: 1 }],
    ['stale ledger revision', { expectedLedgerRevision: 1 }],
    ['insufficient recipe stock', { resources: { ...base.resources, food: 5 } }],
    ['invalid recipe', { recipeId: 'securityTeams' }],
  ])('rejects %s without a partial result', (_label, patch) => {
    expect(() => resolveBoaRecycling({ ...base, ...patch } as never)).toThrow();
  });

  it('rejects unsafe inventory and malformed cycle history', () => {
    expect(() => resolveBoaRecycling({
      ...base,
      resources: { ...base.resources, scrap: Number.MAX_SAFE_INTEGER },
    })).toThrow(/safe resource range/i);
    expect(parseBoaRecyclingLedger({ cycle: 2, revision: 2, exchangesThisCycle: 3 })).toBeNull();
    expect(parseBoaRecyclingLedger({ cycle: 2, revision: -1, exchangesThisCycle: 1 })).toBeNull();
    expect(parseBoaRecyclingLedger({ cycle: 2, revision: 1, exchangesThisCycle: 1, unexpected: true })).toBeNull();
  });

  it('treats an absent legacy ledger as no Boa exchanges recorded', () => {
    expect(parseBoaRecyclingLedger(undefined)).toEqual({
      cycle: 0, revision: 0, exchangesThisCycle: 0,
    });
  });
});
