import { expect, it } from 'vitest';
import { advanceMaintenance, type MaintenanceInput } from './maintenance';
const input = (overrides: Partial<MaintenanceInput> = {}): MaintenanceInput => ({
  shipId: 'aegis', cycle: { step: 0, revision: 0, results: {}, charges: [], refuelled: [] },
  expectedRevision: 0, action: 'begin', resources: { ore: 5, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
  damage: { damagedSystemIds: [], destroyed: false }, unrest: 0, population: 2500,
  dockings: [], cargo: {}, fuelled: {}, rolls: [1, 1], entropy: 0.5, ...overrides,
});
it('starts once and rejects stale commands and out-of-order steps', () => {
  const started = advanceMaintenance(input());
  expect(started.cycle).toMatchObject({ step: 1, revision: 1 });
  expect(() => advanceMaintenance(input({ cycle: started.cycle }))).toThrow(/changed/);
  expect(() => advanceMaintenance(input({ action: 'riot' }))).toThrow(/step/);
});
it('halves damaged storage and docked cargo with losses rounded down', () => {
  const result = advanceMaintenance(input({ action: 'storage', cycle: { step: 1, revision: 0, results: {}, charges: [], refuelled: [] },
    damage: { damagedSystemIds: ['storage'], destroyed: false },
    dockings: [{ shipId: 'aegis', shuttleId: 'starlight' }], cargo: { starlight: { food: 5 }, pallas: { food: 5 } },
  }));
  expect(result.resources).toMatchObject({ ore: 3, food: 4, materials: 1 });
  expect(result.cargo).toEqual({ starlight: { food: 3 }, pallas: { food: 5 } });
  expect(result.cycle.step).toBe(2);
  expect(result.cycle.results['1']).toMatch(/lost/i);
});
it('spends food and water separately and retains both ration bonuses', () => {
  const result = advanceMaintenance(input({ action: 'rations', cycle: { step: 2, revision: 0, results: {}, charges: [], refuelled: [] }, foodLevel: 1, waterLevel: 2 }));
  expect(result.resources).toMatchObject({ food: 5, water: 3 });
  expect(result.cycle.rationBonus).toBe(9);
  expect(() => advanceMaintenance(input({ action: 'rations', cycle: { ...result.cycle, step: 2, revision: 0 }, foodLevel: 3, waterLevel: 3, resources: { ...result.resources, food: 1 } }))).toThrow(/food/i);
});
it.each([[1, 1, 0, 2], [3, 3, 6, 1], [6, 6, 9, 0]])('applies unrest thresholds for %s + %s + %s', (a, b, bonus, gain) => {
  const result = advanceMaintenance(input({ action: 'unrest', cycle: { step: 3, revision: 0, results: {}, charges: [], refuelled: [], rationBonus: bonus }, rolls: [a, b] }));
  expect(result.unrest).toBe(gain);
  expect(result.cycle.step).toBe(4);
});
it('resolves riot damage and survivor loss, but not on a roll equal to unrest', () => {
  const base = input({ action: 'riot', unrest: 4, cycle: { step: 4, revision: 0, results: {}, charges: [], refuelled: [] }, rolls: [1, 1], entropy: 0 });
  expect(advanceMaintenance(base)).toMatchObject({ population: 2000, damage: { damagedSystemIds: ['fighter-bay-alpha'] } });
  expect(advanceMaintenance({ ...base, rolls: [4, 1] }).population).toBe(2500);
});
it('replaces old charges at reactor power-up and enforces damaged capacity', () => {
  const base = input({ action: 'reactor', cycle: { step: 5, revision: 0, results: {}, charges: ['jump-drive'], refuelled: [] }, consoles: ['fighter-bay-alpha'], damage: { damagedSystemIds: ['reactor'], destroyed: false } });
  expect(advanceMaintenance(base).cycle.charges).toEqual(['fighter-bay-alpha']);
  expect(() => advanceMaintenance({ ...base, consoles: ['fighter-bay-alpha', 'fighter-bay-bravo', 'jump-drive'] })).toThrow(/capacity/);
  expect(() => advanceMaintenance({ ...base, consoles: ['storage'] })).toThrow(/console/);
});
it('refuels only docked shuttles, spends fuel, prevents double refuelling, and ends explicitly', () => {
  const base = input({ action: 'bays', cycle: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] }, refuels: { 'shuttle-bay-zeta': 'starlight' }, dockings: [{ shipId: 'aegis', shuttleId: 'starlight' }] });
  const result = advanceMaintenance(base);
  expect(result.resources.fuel).toBe(3);
  expect(result.fuelled.starlight).toBe(true);
  expect(result.cycle.step).toBe(7);
  expect(() => advanceMaintenance({ ...base, dockings: [] })).toThrow(/docked/);
  expect(() => advanceMaintenance({ ...base, refuels: { 'shuttle-bay-zeta': 'starlight', 'shuttle-bay-omega': 'starlight' } })).toThrow(/once/);
  expect(advanceMaintenance({ ...base, action: 'end', cycle: result.cycle, expectedRevision: 1 }).cycle.step).toBe(0);
});

it.each(['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'])('completes a %s cycle, including riot damage', shipId => {
  let state = input({ shipId, entropy: 0, population: shipId === 'aegis' ? 2500 : shipId === 'dione' ? 100000 : shipId === 'icebreaker' ? 40000 : ['quellon', 'shepherd'].includes(shipId) ? 30000 : 20000, unrest: 5 });
  for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end']) {
    const result = advanceMaintenance({ ...state, action, foodLevel: 0, waterLevel: 0, consoles: [], refuels: {} });
    state = { ...state, ...result, expectedRevision: result.cycle.revision };
  }
  expect(state.cycle.step).toBe(0);
  expect(state.cycle.revision).toBe(8);
  expect(state.damage.damagedSystemIds.length).toBeGreaterThan(0);
});
it('allows ending a maintenance cycle when a riot destroys the ship', () => {
  const result = advanceMaintenance(input({ action: 'end', cycle: { step: 7, revision: 0, results: {}, charges: [], refuelled: [] }, damage: { damagedSystemIds: [], destroyed: true } }));
  expect(result.cycle.step).toBe(0);
});
