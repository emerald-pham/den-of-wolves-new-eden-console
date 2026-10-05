import { expect, it } from 'vitest';
import { emptyMaintenanceCycle } from './maintenance';
import { advanceSmallShipMaintenance, emptySmallShipState } from './smallShip';
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

it('does not permit Vulcan Additional Labour from a closed cycle missing its Team result receipts', () => {
  const baseState = emptySmallShipState('vulcan', 'aegis');
  const closed = advanceSmallShipMaintenance({
    state: {
      ...baseState,
      cycle: {
        ...baseState.cycle, step: 5, revision: 5, turn: 1,
        charges: ['additional-labour-1'], startedAt: '2026-09-12T16:00:00.000Z',
      },
    },
    action: 'end', expectedRevision: 5, currentTurn: 1,
    hostResources: targetResources, rolls: [], now: '2026-09-12T16:05:00.000Z',
  });

  expect(closed.state.cycle).toMatchObject({ step: 0, charges: ['additional-labour-1'] });
  expect(() => applyVulcanAdditionalLabour({ ...base, sourceCycle: closed.state.cycle }))
    .toThrow(/available after Vulcan maintenance in the current cycle/i);
});

function completeNaturalVulcanMaintenance() {
  let state = emptySmallShipState('vulcan', 'aegis');
  let hostResources = { ...targetResources };
  for (const action of ['begin', 'rations', 'unrest', 'riot', 'reactor', 'end']) {
    const result = advanceSmallShipMaintenance({ state, action,
      expectedRevision: state.cycle.revision, currentTurn: 1, hostResources,
      foodLevel: 1, waterLevel: 1, rolls: [6, 6],
      consoles: [...VULCAN_ADDITIONAL_LABOUR_CONSOLES], now: '2026-10-05T09:00:00.000Z' });
    state = result.state;
    hostResources = result.hostResources;
  }
  return state.cycle;
}

it('keeps both natural Team maintenance charges usable independently after the normal end reset', () => {
  const completed = completeNaturalVulcanMaintenance();
  expect(completed).toMatchObject({ step: 0, turn: 1, chargingSkipped: false,
    completedAt: '2026-10-05T09:00:00.000Z', charges: [...VULCAN_ADDITIONAL_LABOUR_CONSOLES] });
  expect(Object.keys(completed.results).sort()).toEqual(['1', '2', '3', '4']);
  const first = applyVulcanAdditionalLabour({ ...base, sourceCycle: completed });
  expect(first.sourceCycle).toMatchObject({ step: 0, completedAt: completed.completedAt,
    revision: completed.revision + 1, charges: ['additional-labour-2'] });
  const second = applyVulcanAdditionalLabour({ ...base, sourceCycle: first.sourceCycle,
    sourceConsoleId: 'additional-labour-2', targetShipId: 'dione', targetConsoleId: 'hydroponics' });
  expect(second.sourceCycle.charges).toEqual([]);
  expect(second.targetResources).toMatchObject({ water: 3, food: 13 });
  expect(second.immediate).toBe(true);
});

it('rejects unfinished, malformed, skipped, or stale closed maintenance without consuming a charge', () => {
  const completed = completeNaturalVulcanMaintenance();
  for (const invalid of [
    { ...completed, completedAt: undefined },
    { ...completed, completedAt: 'invalid' },
    { ...completed, startedAt: undefined },
    { ...completed, results: { '1': 'rations', '2': 'unrest', '3': 'riot' } },
    { ...completed, chargingSkipped: true },
    { ...completed, turn: 2 },
  ]) {
    const before = structuredClone(invalid);
    expect(() => applyVulcanAdditionalLabour({ ...base, sourceCycle: invalid })).toThrow(/current cycle/i);
    expect(invalid).toEqual(before);
  }
});
