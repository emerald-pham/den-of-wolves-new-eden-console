import { expect, it } from 'vitest';
import { emptyMaintenanceCycle } from './maintenance';
import { applyVulcanAdditionalLabour, VULCAN_ADDITIONAL_LABOUR_CONSOLES } from './vulcanLabour';

const sourceCycle = {
  step: 5, revision: 4, turn: 1, results: {},
  charges: [...VULCAN_ADDITIONAL_LABOUR_CONSOLES],
};
const targetResources = {
  ore: 0, fuel: 3, food: 10, water: 4, materials: 0, securityTeams: 2,
};
const base = {
  sourceCycle,
  sourceConsoleId: 'additional-labour-1' as const,
  currentTurn: 1,
  targetShipId: 'aegis',
  targetConsoleId: 'jump-drive',
  targetCycle: emptyMaintenanceCycle(),
  targetResources,
  targetDamage: { damagedSystemIds: [], destroyed: false },
  targetUnrest: 0,
  targetPopulation: 2500,
  targetDockings: [],
  targetCargo: {},
  targetFuelled: {},
  targetUpgrades: [],
  now: '2026-09-12T17:00:00.000Z',
};

it('consumes each Additional Labour charge independently and charges an external console once', () => {
  const first = applyVulcanAdditionalLabour(base);
  expect(first.sourceCycle).toMatchObject({ revision: 5, charges: ['additional-labour-2'] });
  expect(first.targetCycle).toMatchObject({ revision: 1, charges: ['jump-drive'] });
  expect(first.immediate).toBe(false);

  const second = applyVulcanAdditionalLabour({
    ...base, sourceCycle: first.sourceCycle, sourceConsoleId: 'additional-labour-2',
    targetCycle: first.targetCycle,
    targetConsoleId: 'construction-bay',
  });
  expect(second.sourceCycle).toMatchObject({ revision: 6, charges: [] });
  expect(second.targetCycle).toMatchObject({ revision: 2, charges: ['jump-drive', 'construction-bay'] });
});

it('resolves an implemented maintenance production effect atomically', () => {
  const result = applyVulcanAdditionalLabour({
    ...base,
    targetShipId: 'dione',
    targetConsoleId: 'hydroponics',
    targetResources: { ...targetResources, water: 4, food: 2 },
  });
  expect(result.immediate).toBe(true);
  expect(result.targetResources).toMatchObject({ water: 3, food: 5 });
  expect(result.targetCycle).toMatchObject({ revision: 1, charges: [] });
  expect(result.message).toContain('Hydroponics');
});

it('binds a Fuel Refinery ore choice into immediate Additional Labour production', () => {
  const result = applyVulcanAdditionalLabour({
    ...base,
    targetShipId: 'refinery-124',
    targetConsoleId: 'fuel-refinery-ii',
    targetResources: { ...targetResources, ore: 15, fuel: 5 },
    targetUpgrades: ['fuel-refinery-ii'],
    productionOreAmount: 15,
  });
  expect(result.immediate).toBe(true);
  expect(result.targetResources).toMatchObject({ ore: 0, fuel: 20 });
  expect(result.targetCycle).toMatchObject({ revision: 1, charges: [] });
  expect(result.message).toContain('spent 15 ore, generated 15 fuel');
});

it('rejects a duplicate, damaged, stale-turn, or unknown target before mutation', () => {
  expect(() => applyVulcanAdditionalLabour({
    ...base, targetCycle: { ...emptyMaintenanceCycle(), charges: ['jump-drive'] },
  })).toThrow(/already charged/i);
  expect(() => applyVulcanAdditionalLabour({
    ...base, targetDamage: { damagedSystemIds: ['construction-bay'], destroyed: false },
    targetConsoleId: 'construction-bay',
  })).toThrow(/damaged/i);
  expect(() => applyVulcanAdditionalLabour({ ...base, currentTurn: 2 })).toThrow(/current cycle/i);
  expect(() => applyVulcanAdditionalLabour({ ...base, targetConsoleId: 'reactor' })).toThrow(/permitted/i);
  expect(() => applyVulcanAdditionalLabour({ ...base, targetShipId: 'vulcan' })).toThrow(/another active ship/i);
});
