import { expect, it } from 'vitest';
import { advanceMaintenance, rerollMaintenanceUnrest, type MaintenanceInput } from './maintenance';

function unrestInput(): MaintenanceInput {
  return {
    shipId: 'dione',
    cycle: { step: 3, revision: 3, results: { '2': 'Spent 6 food and 6 water.' }, charges: [], refuelled: [], rationBonus: 9, turn: 1 },
    currentTurn: 1, expectedRevision: 3, action: 'unrest',
    resources: { ore: 0, fuel: 0, food: 30, water: 30, materials: 0, securityTeams: 0 },
    damage: { damagedSystemIds: [], destroyed: false },
    unrest: 7, population: 100_000, dockings: [], cargo: {}, fuelled: {},
    rolls: [1, 1], entropy: 0.5, now: '2026-09-28T12:00:00.000Z',
  };
}

it('retains the server dice and pre-check unrest for a one-die VIP reroll', () => {
  const result = advanceMaintenance(unrestInput());
  expect(result.unrest).toBe(9);
  expect(result.cycle).toMatchObject({
    step: 4, unrestRolls: [1, 1], unrestBeforeCheck: 7,
  });

  const rerolled = rerollMaintenanceUnrest(result.cycle, result.unrest, 0, 6);
  expect(rerolled.unrest).toBe(8);
  expect(rerolled.cycle).toMatchObject({
    step: 4, revision: 5, unrestRolls: [6, 1], unrestBeforeCheck: 7,
    results: { '3': expect.stringContaining('6 + 1 + 9') },
  });
  expect(rerolled.cycle.results['4']).toBeUndefined();
});

it('rejects a stale unrest counter, an invalid die, or a reroll after step 4', () => {
  const result = advanceMaintenance(unrestInput());
  expect(() => rerollMaintenanceUnrest(result.cycle, 7, 0, 6)).toThrow(/changed/);
  expect(() => rerollMaintenanceUnrest(result.cycle, 9, 2, 6)).toThrow(/die/);
  expect(() => rerollMaintenanceUnrest(result.cycle, 9, 0, 7)).toThrow(/die/);
  expect(() => rerollMaintenanceUnrest({ ...result.cycle, step: 5 }, 9, 0, 6)).toThrow(/step/);
});

it('can avert a threshold crossing before riot without undoing other effects', () => {
  const first = advanceMaintenance({ ...unrestInput(), cycle: { ...unrestInput().cycle, rationBonus: 15 }, unrest: 7 });
  expect(first.unrest).toBe(8);
  const rerolled = rerollMaintenanceUnrest(first.cycle, first.unrest, 0, 6);
  expect(rerolled.unrest).toBe(7);
  expect(rerolled.cycle.results['2']).toBe(first.cycle.results['2']);
});
