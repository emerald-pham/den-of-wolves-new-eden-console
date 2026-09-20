import { describe, expect, it } from 'vitest';
import { planShipStoreScavenge, requireScavengeInventories } from './shipStoreScavenge';

const inventories = {
  aegis: { ore: 2, fuel: 3, food: 4, water: 1, materials: 2, securityTeams: 1 },
  dione: { ore: 0, fuel: 1, food: 2, water: 3, materials: 0, securityTeams: 2 },
  capybara: { ore: 0, fuel: 1, food: 1, water: 1, materials: 0, securityTeams: 2, scrap: 3 },
};

it('reconciles every destroyed-ship balance across legal same-group recipients', () => {
  const result = planShipStoreScavenge({
    sourceShipId: 'aegis', inventories,
    activeVesselIds: ['aegis', 'dione', 'capybara'],
    destroyedShipIds: ['aegis'],
    shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-1', capybara: 'fleet-1' },
    allocations: {
      dione: { ore: 2, fuel: 1, food: 4, securityTeams: 1 },
      capybara: { fuel: 2, water: 1, materials: 2 },
    },
  });

  expect(result.inventories.aegis).toEqual({
    ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0,
  });
  expect(result.inventories.dione).toMatchObject({ ore: 2, fuel: 2, food: 6, securityTeams: 3 });
  expect(result.inventories.capybara).toMatchObject({ fuel: 3, water: 2, materials: 2, scrap: 3 });
  expect(result.transfers).toHaveLength(2);
});

describe('fail-closed scavenging authority', () => {
  const base = {
    sourceShipId: 'aegis', inventories,
    activeVesselIds: ['aegis', 'dione', 'capybara'],
    destroyedShipIds: ['aegis'],
    shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-1', capybara: 'fleet-1' },
    allocations: { dione: { ore: 2, fuel: 3, food: 4, water: 1, materials: 2, securityTeams: 1 } },
  } as const;

  it('rejects a living source and any incomplete or excessive allocation', () => {
    expect(() => planShipStoreScavenge({ ...base, destroyedShipIds: [] })).toThrow(/destroyed/i);
    expect(() => planShipStoreScavenge({ ...base, allocations: { dione: { food: 3 } } })).toThrow(/reconcile/i);
    expect(() => planShipStoreScavenge({
      ...base, allocations: { dione: { ...base.allocations.dione, food: 5 } },
    })).toThrow(/reconcile/i);
  });

  it('rejects cross-group, destroyed, inactive, self, and unsupported recipients', () => {
    expect(() => planShipStoreScavenge({
      ...base, shipFleetGroupIds: { ...base.shipFleetGroupIds, dione: 'fleet-2' },
    })).toThrow(/fleet-group/i);
    expect(() => planShipStoreScavenge({ ...base, destroyedShipIds: ['aegis', 'dione'] })).toThrow(/living/i);
    expect(() => planShipStoreScavenge({ ...base, activeVesselIds: ['aegis', 'capybara'] })).toThrow(/living/i);
    expect(() => planShipStoreScavenge({ ...base, allocations: { aegis: base.allocations.dione } })).toThrow(/different/i);
    expect(() => planShipStoreScavenge({
      ...base,
      sourceShipId: 'capybara',
      destroyedShipIds: ['capybara'],
      allocations: { dione: { ore: 0, fuel: 1, food: 1, water: 1, securityTeams: 2, scrap: 3 } },
    })).toThrow(/positive|cannot hold/i);
  });

  it('rejects a recipient ledger overflow', () => {
    expect(() => planShipStoreScavenge({
      ...base,
      inventories: { ...inventories, dione: { ...inventories.dione, food: Number.MAX_SAFE_INTEGER } },
    })).toThrow(/safe ledger/i);
  });
});

describe('persisted ledger validation', () => {
  it('preserves absent legacy defaults and accepts complete safe affected ledgers', () => {
    expect(requireScavengeInventories(undefined, ['aegis']).aegis).toBeDefined();
    expect(requireScavengeInventories(inventories, ['aegis', 'dione'])).toMatchObject(inventories);
  });

  it.each([
    null,
    { aegis: -1 },
    { aegis: { ...inventories.aegis, ore: -1 } },
    { aegis: { ...inventories.aegis, ore: Number.MAX_SAFE_INTEGER + 1 } },
    { aegis: { ...inventories.aegis, scrap: 1 } },
  ])('rejects malformed affected persisted ledgers %#', (stored) => {
    expect(() => requireScavengeInventories(stored, ['aegis'])).toThrow(/ledger.*malformed/i);
  });
});
