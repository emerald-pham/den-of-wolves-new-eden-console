import { expect, it } from 'vitest';
import { advanceMaintenance, MAINTENANCE_ORDERS, MAINTENANCE_RULES, type MaintenanceInput } from './maintenance';
import { resolveJumpAttempt } from './jumpDrive';
const input = (overrides: Partial<MaintenanceInput> = {}): MaintenanceInput => ({
  shipId: 'aegis', cycle: { step: 0, revision: 0, results: {}, charges: [], refuelled: [] },
  currentTurn: 1, expectedRevision: 0, action: 'begin', resources: { ore: 5, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
  damage: { damagedSystemIds: [], destroyed: false }, unrest: 0, population: 2500,
  dockings: [], cargo: {}, fuelled: {}, rolls: [1, 1], entropy: 0.5,
  now: '2026-09-06T12:00:00.000Z', ...overrides,
});

const REACTOR_CAPACITY_MATRIX: ReadonlyArray<{
  shipId: string;
  nominalCapacity: number;
  damagedPenalty: number;
  eligibleConsoles: readonly string[];
}> = [
  {
    shipId: 'aegis', nominalCapacity: 5, damagedPenalty: 3,
    eligibleConsoles: [
      'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
      'missile-launchers', 'point-defence-lasers', 'construction-bay', 'jump-drive',
    ],
  },
  {
    shipId: 'dione', nominalCapacity: 4, damagedPenalty: 3,
    eligibleConsoles: ['hydroponics', 'water-reclamation', 'vip-lounge', 'fighter-bay', 'jump-drive'],
  },
  {
    shipId: 'icebreaker', nominalCapacity: 4, damagedPenalty: 3,
    eligibleConsoles: ['hydroponics', 'water-reclamation', 'mining-drone-control', 'jump-drive', 'ram-scoop'],
  },
  {
    shipId: 'shepherd', nominalCapacity: 3, damagedPenalty: 2,
    eligibleConsoles: ['water-reclamation', 'advanced-hydroponics', 'advanced-hydroponics-ii', 'jump-drive'],
  },
  {
    shipId: 'quellon', nominalCapacity: 3, damagedPenalty: 2,
    eligibleConsoles: ['hydroponics', 'water-production', 'water-production-ii', 'jump-drive'],
  },
  {
    shipId: 'refinery-124', nominalCapacity: 4, damagedPenalty: 3,
    eligibleConsoles: ['hydroponics', 'water-reclamation', 'fuel-refinery', 'fuel-refinery-ii', 'fighter-bay', 'jump-drive'],
  },
  {
    shipId: 'capybara', nominalCapacity: 3, damagedPenalty: 3,
    eligibleConsoles: ['advanced-hydroponics', 'water-production', 'scrap-refinery', 'jump-drive'],
  },
];

it('registers each implemented full vessel maintenance lane from its printed sequence', () => {
  expect(MAINTENANCE_ORDERS.aegis).toEqual(['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays']);
  for (const shipId of ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'] as const) {
    expect(MAINTENANCE_ORDERS[shipId]).toEqual(['storage', 'rations', 'unrest', 'riot', 'reactor', 'bays']);
  }
});

it('starts once and rejects stale commands and out-of-order steps', () => {
  const started = advanceMaintenance(input());
  expect(started.cycle).toMatchObject({
    step: 1, revision: 1, turn: 1, startedAt: '2026-09-06T12:00:00.000Z',
  });
  expect(() => advanceMaintenance(input({ cycle: started.cycle }))).toThrow(/changed/);
  expect(() => advanceMaintenance(input({ action: 'riot' }))).toThrow(/step/);
});

it('does not carry unknown persisted cycle fields into the next authoritative result', () => {
  const result = advanceMaintenance(input({
    cycle: ({
      step: 0,
      revision: 3,
      results: {},
      charges: [],
      refuelled: [],
      facilitatorNotes: 'hidden adjudication',
      candidateBonus: 4,
    } as MaintenanceInput['cycle'] & Record<string, unknown>),
    expectedRevision: 3,
  }));

  expect(result.cycle).toMatchObject({ step: 1, revision: 4, turn: 1 });
  expect(result.cycle).not.toHaveProperty('facilitatorNotes');
  expect(result.cycle).not.toHaveProperty('candidateBonus');
});

it('allows only one maintenance cycle per turn', () => {
  expect(() => advanceMaintenance(input({
    cycle: {
      step: 0, revision: 8, turn: 1, results: { '7': 'Maintenance cycle complete.' },
      charges: [], refuelled: [], completedAt: '2026-09-06T12:04:00.000Z',
    },
    expectedRevision: 8,
  }))).toThrow(/once per cycle/i);

  expect(advanceMaintenance(input({
    currentTurn: 2,
    cycle: {
      step: 0, revision: 8, turn: 1, results: { '7': 'Maintenance cycle complete.' },
      charges: [], refuelled: [], completedAt: '2026-09-06T12:04:00.000Z',
    },
    expectedRevision: 8,
  }))).toMatchObject({ cycle: { step: 1, turn: 2 } });
});

it('retains the server-owned start time and records completion time', () => {
  const completed = advanceMaintenance(input({
    shipId: 'dione',
    action: 'end', expectedRevision: 7, now: '2026-09-06T12:04:00.000Z',
    cycle: {
      step: 7, revision: 7, results: {}, charges: [], refuelled: [],
      startedAt: '2026-09-06T12:00:00.000Z',
    },
  }));

  expect(completed.cycle).toMatchObject({
    step: 0,
    startedAt: '2026-09-06T12:00:00.000Z',
    completedAt: '2026-09-06T12:04:00.000Z',
  });
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

it('applies Capybara Storage to every in-scope store, including Scrap and docked shuttle cargo', () => {
  const result = advanceMaintenance(input({
    shipId: 'capybara',
    action: 'storage',
    cycle: { step: 1, revision: 0, results: {}, charges: [], refuelled: [] },
    resources: { ore: 5, fuel: 3, food: 9, water: 4, materials: 3, securityTeams: 2, scrap: 5 },
    damage: { damagedSystemIds: ['storage'], destroyed: false },
    dockings: [
      { shipId: 'capybara', shuttleId: 'macaw' },
      { shipId: 'capybara', shuttleId: 'boa' },
    ],
    cargo: {
      macaw: { food: 5, scrap: 5 },
      boa: { scrap: 3 },
      starlight: { food: 5 },
    },
  }));

  expect(result.resources).toEqual({
    ore: 3, fuel: 2, food: 5, water: 2, materials: 2, securityTeams: 1, scrap: 3,
  });
  expect(result.cargo).toEqual({
    macaw: { food: 3, scrap: 3 },
    boa: { scrap: 2 },
    starlight: { food: 5 },
  });
});

it('uses the printed Capybara Storage and Reactor policy', () => {
  expect(MAINTENANCE_RULES.capybara).toEqual({
    food: [0, 3, 7, 11], water: [0, 2, 5, 8], reactor: 3, damagedPenalty: 3,
  });
  const nominal = advanceMaintenance(input({
    shipId: 'capybara', action: 'reactor',
    cycle: { step: 5, revision: 0, results: {}, charges: [], refuelled: [] },
    consoles: ['advanced-hydroponics', 'water-production', 'scrap-refinery'],
  }));
  expect(nominal.cycle.charges).toEqual(['advanced-hydroponics', 'water-production', 'scrap-refinery']);
  expect(() => advanceMaintenance(input({
    shipId: 'capybara', action: 'reactor',
    cycle: { step: 5, revision: 0, results: {}, charges: [], refuelled: [] },
    damage: { damagedSystemIds: ['reactor'], destroyed: false },
    upgraded: ['reactor'],
    consoles: ['advanced-hydroponics', 'water-production'],
  }))).toThrow(/capacity/i);
  const damagedUpgraded = advanceMaintenance(input({
    shipId: 'capybara', action: 'reactor',
    cycle: { step: 5, revision: 0, results: {}, charges: [], refuelled: [] },
    damage: { damagedSystemIds: ['reactor'], destroyed: false },
    upgraded: ['reactor'],
    consoles: ['jump-drive'],
  }));
  expect(damagedUpgraded.cycle.charges).toEqual(['jump-drive']);
});
it('resolves the charged Capybara Scrap Refinery choice atomically', () => {
  const base = input({
    shipId: 'capybara', action: 'production', expectedRevision: 0,
    productionConsoleId: 'scrap-refinery',
    cycle: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: ['scrap-refinery'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
  });

  const generated = advanceMaintenance({ ...base, productionScrap: false });
  expect(generated.resources).toMatchObject({ scrap: 4, materials: 0 });
  expect(generated.cycle).toMatchObject({ step: 6, revision: 1, charges: [] });
  expect(generated.cycle.results['5']).toContain('Scrap Refinery: generated 1 Scrap.');

  const converted = advanceMaintenance({ ...base, productionScrap: true });
  expect(converted.resources).toMatchObject({ scrap: 2, materials: 3 });
  expect(converted.cycle.results['5']).toContain('Scrap Refinery: spent 1 Scrap, generated 3 materials.');
  expect(() => advanceMaintenance({ ...base, productionScrap: true,
    resources: { ...base.resources, scrap: 0 } })).toThrow(/Insufficient Scrap/);
  expect(() => advanceMaintenance({ ...base, damage: { damagedSystemIds: ['scrap-refinery'], destroyed: false } }))
    .toThrow(/Damaged production console/);
});
it('spends food and water separately and retains both ration bonuses', () => {
  const result = advanceMaintenance(input({ action: 'rations', cycle: { step: 2, revision: 0, results: {}, charges: [], refuelled: [] }, foodLevel: 1, waterLevel: 2 }));
  expect(result.resources).toMatchObject({ food: 5, water: 3 });
  expect(result.cycle.rationBonus).toBe(9);
  expect(() => advanceMaintenance(input({ action: 'rations', cycle: { ...result.cycle, step: 2, revision: 0 }, foodLevel: 3, waterLevel: 3, resources: { ...result.resources, food: 1 } }))).toThrow(/food/i);
});
it.each([
  [16_000, 11, 8],
  [15_000, 10, 7],
  [6_000, 10, 7],
  [5_000, 8, 6],
] as const)('uses the Capybara replacement ration schedule at %i survivors', (population, food, water) => {
  const result = advanceMaintenance(input({
    shipId: 'capybara', action: 'rations', population,
    cycle: { step: 2, revision: 0, results: {}, charges: [], refuelled: [] },
    foodLevel: 3, waterLevel: 3,
    resources: { ore: 0, fuel: 3, food: 30, water: 30, materials: 0, securityTeams: 2, scrap: 3 },
  }));
  expect(result.resources).toMatchObject({ food: 30 - food, water: 30 - water });
  expect(result.cycle.rationBonus).toBe(18);
});
it('adds two unrest exactly once when Capybara reaches zero population', () => {
  const first = advanceMaintenance(input({
    shipId: 'capybara', action: 'riot', population: 250, unrest: 1,
    cycle: { step: 4, revision: 0, results: {}, charges: [], refuelled: [] },
    rolls: [0], entropy: 0,
  }));
  expect(first).toMatchObject({ population: 0, unrest: 3 });

  const second = advanceMaintenance(input({
    shipId: 'capybara', action: 'riot', population: first.population, unrest: first.unrest,
    damage: first.damage,
    cycle: { step: 4, revision: 0, results: {}, charges: [], refuelled: [] },
    rolls: [0], entropy: 0.5,
  }));
  expect(second).toMatchObject({ population: 0, unrest: 3 });
});
it.each([[1, 1, 0, 2], [3, 3, 6, 1], [6, 6, 9, 0]])('applies unrest thresholds for %s + %s + %s', (a, b, bonus, gain) => {
  const result = advanceMaintenance(input({ action: 'unrest', cycle: { step: 3, revision: 0, results: {}, charges: [], refuelled: [], rationBonus: bonus }, rolls: [a, b] }));
  expect(result.unrest).toBe(gain);
  expect(result.cycle.step).toBe(4);
});
it('resolves riot damage and survivor loss, but not on a roll equal to unrest', () => {
  const base = input({ action: 'riot', unrest: 4, cycle: { step: 4, revision: 0, results: {}, charges: [], refuelled: [] }, rolls: [1, 1], entropy: 0, damageDrawId: 'riot-draw' });
  const riot = advanceMaintenance(base);
  expect(riot).toMatchObject({ population: 2000, damage: { damagedSystemIds: ['fighter-bay-alpha'] } });
  expect(riot.cycle).toMatchObject({ damageDrawId: 'riot-draw' });
  expect(riot.cycle.results['4']).toContain('Fighter Bay Alpha damaged.');
  expect(riot.cycle.results['4']).not.toContain('A♥');
  const noRiot = advanceMaintenance({ ...base, rolls: [4, 1] });
  expect(noRiot.population).toBe(2500);
  expect(noRiot.cycle.results['4']).toBe('Rolled 4 against unrest 4. No riot.');
  expect(noRiot.cycle).not.toHaveProperty('damageDrawId');
});

it('reports armour absorbing riot damage and recycling its card', () => {
  const result = advanceMaintenance(input({
    action: 'riot',
    unrest: 4,
    cycle: { step: 4, revision: 0, results: {}, charges: [], refuelled: [] },
    rolls: [1, 1],
    entropy: 0.39,
    damageDrawId: 'armour-draw',
  }));

  expect(result.damageDraw).toMatchObject({
    destroyed: false,
    card: { card: '6♥', systemName: 'Armoured Hull I' },
    recycled: true,
  });
  expect(result.cycle.results['4']).toContain('Armoured Hull I absorbed damage.');
});
it('replaces old charges at reactor power-up and enforces damaged capacity', () => {
  const base = input({ action: 'reactor', cycle: { step: 5, revision: 0, results: {}, charges: ['jump-drive'], refuelled: [] }, consoles: ['fighter-bay-alpha'], damage: { damagedSystemIds: ['reactor'], destroyed: false } });
  expect(advanceMaintenance(base).cycle.charges).toEqual(['fighter-bay-alpha']);
  expect(() => advanceMaintenance({ ...base, consoles: ['fighter-bay-alpha', 'fighter-bay-bravo', 'jump-drive'] })).toThrow(/capacity/);
  expect(() => advanceMaintenance({ ...base, consoles: ['storage'] })).toThrow(/console/);
});

it('rejects nonexistent, non-chargeable, duplicate, and damaged consoles', () => {
  const base = input({
    action: 'reactor',
    cycle: { step: 5, revision: 0, results: {}, charges: [], refuelled: [] },
  });
  for (const consoleId of ['not-a-console', 'storage', 'reactor', 'shuttle-bay-zeta', 'armoured-hull-i']) {
    expect(() => advanceMaintenance({ ...base, consoles: [consoleId] }), consoleId)
      .toThrow(/invalid or damaged console selected/i);
  }
  expect(() => advanceMaintenance({
    ...base,
    consoles: ['fighter-bay-alpha', 'fighter-bay-alpha'],
  })).toThrow(/invalid or damaged console selected/i);
  expect(() => advanceMaintenance({
    ...base,
    damage: { damagedSystemIds: ['fighter-bay-alpha'], destroyed: false },
    consoles: ['fighter-bay-alpha'],
  })).toThrow(/invalid or damaged console selected/i);
});

it('preserves the printed damaged Jump Drive integrity exception', () => {
  const result = advanceMaintenance(input({
    action: 'reactor',
    cycle: { step: 5, revision: 0, results: {}, charges: [], refuelled: [] },
    damage: { damagedSystemIds: ['jump-drive'], destroyed: false },
    consoles: ['jump-drive'],
  }));

  expect(result.cycle.charges).toEqual(['jump-drive']);
});

it('resolves charged Dione Hydroponics atomically and removes only its charge', () => {
  const result = advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics',
    cycle: { step: 6, revision: 4, results: { '5': 'Reactor powered up.' }, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
    expectedRevision: 4,
    resources: { ore: 0, fuel: 0, food: 1, water: 2, materials: 0, securityTeams: 0 },
  }));

  expect(result.resources).toMatchObject({ food: 4, water: 1 });
  expect(result.cycle).toMatchObject({ step: 6, revision: 5, charges: ['water-reclamation'] });
  expect(result.cycle.results['5']).toContain('Hydroponics: spent 1 water, generated 3 food.');
});

it('applies Dione production upgrades and enforces production order without trapping an unavailable Hydroponics console', () => {
  const upgradedHydroponics = advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics', upgraded: ['hydroponics'],
    cycle: { step: 6, revision: 0, results: {}, charges: ['hydroponics'], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 0, water: 1, materials: 0, securityTeams: 0 },
  }));
  expect(upgradedHydroponics.resources).toMatchObject({ food: 5, water: 0 });

  const upgradedWaterReclamation = advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'water-reclamation', upgraded: ['water-reclamation'],
    cycle: { step: 6, revision: 0, results: {}, charges: ['water-reclamation'], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 },
  }));
  expect(upgradedWaterReclamation.resources).toMatchObject({ water: 4 });

  const waterFirst = advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'water-reclamation',
    cycle: { step: 6, revision: 0, results: {}, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 },
  }));
  expect(waterFirst.resources.water).toBe(2);
  expect(waterFirst.cycle.charges).toEqual(['hydroponics']);
  expect(() => advanceMaintenance({
    ...input(), shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics',
    cycle: waterFirst.cycle, expectedRevision: waterFirst.cycle.revision, resources: waterFirst.resources,
  })).toThrow(/before Water Reclamation/);
  expect(waterFirst).toMatchObject({ resources: { food: 0, water: 2 }, cycle: { charges: ['hydroponics'] } });

  expect(() => advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'water-reclamation',
    cycle: { step: 6, revision: 0, results: {}, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 0, water: 1, materials: 0, securityTeams: 0 },
  }))).toThrow(/Hydroponics before Water Reclamation/);

  const damagedHydroponics = advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'water-reclamation',
    cycle: { step: 6, revision: 0, results: {}, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
    damage: { damagedSystemIds: ['hydroponics'], destroyed: false },
    resources: { ore: 0, fuel: 0, food: 0, water: 1, materials: 0, securityTeams: 0 },
  }));
  expect(damagedHydroponics.resources.water).toBe(3);
  expect(damagedHydroponics.cycle.charges).toEqual(['hydroponics']);
});

it('records an explicit production skip so the next console can run without spending resources', () => {
  expect(() => advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'water-reclamation', productionMode: 'skip',
    cycle: { step: 6, revision: 0, results: {}, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 0, water: 1, materials: 0, securityTeams: 0 },
  }))).toThrow(/Resolve Hydroponics before Water Reclamation/);

  const skipped = advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics', productionMode: 'skip',
    cycle: { step: 6, revision: 0, results: {}, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 0, water: 14, materials: 0, securityTeams: 0 },
  }));
  expect(skipped.resources).toMatchObject({ food: 0, water: 14 });
  expect(skipped.cycle.charges).toEqual(['water-reclamation']);
  expect(skipped.cycle.results['5']).toContain('Hydroponics skipped.');

  const waterSkippedWithoutSupply = advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'water-reclamation', productionMode: 'skip',
    cycle: { step: 6, revision: 0, results: {}, charges: ['water-reclamation', 'hydroponics'], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 },
  }));
  expect(() => advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics',
    cycle: waterSkippedWithoutSupply.cycle, expectedRevision: waterSkippedWithoutSupply.cycle.revision,
    resources: waterSkippedWithoutSupply.resources,
  }))).toThrow(/before Water Reclamation/);
  expect(() => advanceMaintenance(input({
    shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics', productionMode: 'skip',
    cycle: waterSkippedWithoutSupply.cycle, expectedRevision: waterSkippedWithoutSupply.cycle.revision,
    resources: waterSkippedWithoutSupply.resources,
  }))).toThrow(/before Water Reclamation/);
});

it('rejects uncharged or damaged Dione production without changing the resource ledger', () => {
  const base = input({
    shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics',
    cycle: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] },
    resources: { ore: 0, fuel: 0, food: 2, water: 1, materials: 0, securityTeams: 0 },
  });
  expect(() => advanceMaintenance(base)).toThrow(/not charged/i);
  expect(() => advanceMaintenance({ ...base, cycle: { ...base.cycle, charges: ['hydroponics'] }, damage: { damagedSystemIds: ['hydroponics'], destroyed: false } })).toThrow(/damaged/i);
});

it('resolves Capybara Advanced Hydroponics with its base, Scrap, and upgrade yields', () => {
  const base = advanceMaintenance(input({
    shipId: 'capybara', action: 'production', productionConsoleId: 'advanced-hydroponics',
    cycle: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: ['advanced-hydroponics'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 },
  }));
  expect(base.resources).toMatchObject({ food: 15, water: 2, scrap: 2 });
  expect(base.cycle).toMatchObject({ step: 6, revision: 1, charges: [] });
  expect(base.cycle.results['5']).toContain('Advanced Hydroponics: spent 2 water, generated 6 food.');

  const scrap = advanceMaintenance(input({
    shipId: 'capybara', action: 'production', productionConsoleId: 'advanced-hydroponics', productionScrap: true,
    cycle: { step: 6, revision: 0, results: {}, charges: ['advanced-hydroponics'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 },
  }));
  expect(scrap.resources).toMatchObject({ food: 21, water: 2, scrap: 1 });
  expect(scrap.cycle.results['5']).toContain('1 Scrap');

  const upgraded = advanceMaintenance(input({
    shipId: 'capybara', action: 'production', productionConsoleId: 'advanced-hydroponics', productionScrap: true,
    upgraded: ['advanced-hydroponics'],
    cycle: { step: 6, revision: 0, results: {}, charges: ['advanced-hydroponics'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 },
  }));
  expect(upgraded.resources).toMatchObject({ food: 24, water: 2, scrap: 1 });
});

it('resolves Capybara Water Production with its base, Scrap, and upgrade yields', () => {
  const base = advanceMaintenance(input({
    shipId: 'capybara', action: 'production', productionConsoleId: 'water-production',
    cycle: { step: 6, revision: 0, results: {}, charges: ['water-production'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 },
  }));
  expect(base.resources).toMatchObject({ food: 9, water: 10, scrap: 2 });

  const scrap = advanceMaintenance(input({
    shipId: 'capybara', action: 'production', productionConsoleId: 'water-production', productionScrap: true,
    cycle: { step: 6, revision: 0, results: {}, charges: ['water-production'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 },
  }));
  expect(scrap.resources).toMatchObject({ water: 16, scrap: 1 });

  const upgraded = advanceMaintenance(input({
    shipId: 'capybara', action: 'production', productionConsoleId: 'water-production', productionScrap: true,
    upgraded: ['water-production'],
    cycle: { step: 6, revision: 0, results: {}, charges: ['water-production'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 },
  }));
  expect(upgraded.resources).toMatchObject({ water: 19, scrap: 1 });
});

it.each([
  ['advanced-hydroponics', 'food'],
  ['water-production', 'water'],
] as const)('clamps Capybara %s base, Scrap, and upgraded output at the safe integer boundary', (productionConsoleId, resource) => {
  for (const variant of [
    { productionScrap: false, upgraded: [] as string[] },
    { productionScrap: true, upgraded: [] as string[] },
    { productionScrap: true, upgraded: [productionConsoleId] },
  ]) {
    const result = advanceMaintenance(input({
      shipId: 'capybara', action: 'production', productionConsoleId,
      productionScrap: variant.productionScrap, upgraded: variant.upgraded,
      cycle: { step: 6, revision: 0, results: {}, charges: [productionConsoleId], refuelled: [] },
      resources: {
        ore: 0, fuel: 3, food: resource === 'food' ? Number.MAX_SAFE_INTEGER : 9,
        water: resource === 'water' ? Number.MAX_SAFE_INTEGER : 4,
        materials: 0, securityTeams: 2, scrap: variant.productionScrap ? 2 : 0,
      },
    }));
    expect(result.resources[resource]).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(result.resources[resource])).toBe(true);
    expect(result.resources.scrap).toBe(variant.productionScrap ? 1 : 0);
    expect(result.cycle.charges).toEqual([]);
  }
});

it.each([
  ['advanced-hydroponics', 'Advanced Hydroponics'],
  ['water-production', 'Water Production'],
] as const)('uses the Capybara console label when skipping %s', (productionConsoleId, label) => {
  const result = advanceMaintenance(input({
    shipId: 'capybara', action: 'production', productionConsoleId, productionMode: 'skip',
    cycle: { step: 6, revision: 0, results: {}, charges: [productionConsoleId], refuelled: [] },
  }));
  expect(result.cycle.results['5']).toBe(`${label} skipped.`);
});

it('rejects Capybara production without chargeable resources or a usable console', () => {
  const base = input({
    shipId: 'capybara', action: 'production', productionConsoleId: 'advanced-hydroponics', productionScrap: true,
    cycle: { step: 6, revision: 0, results: {}, charges: ['advanced-hydroponics'], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 1, materials: 0, securityTeams: 2, scrap: 0 },
  });
  expect(() => advanceMaintenance(base)).toThrow(/Insufficient water/i);
  expect(() => advanceMaintenance({ ...base, resources: { ...base.resources, water: 4 } })).toThrow(/Insufficient Scrap/i);
  expect(() => advanceMaintenance({ ...base, cycle: { ...base.cycle, charges: [] } })).toThrow(/not charged/i);
  expect(() => advanceMaintenance({ ...base, cycle: { ...base.cycle, charges: ['advanced-hydroponics'] }, damage: { damagedSystemIds: ['advanced-hydroponics'], destroyed: false } })).toThrow(/damaged/i);
  expect(base.resources).toMatchObject({ food: 9, water: 1, scrap: 0 });
});

it.each([
  { prompt: '198', shipId: 'icebreaker', consoleId: 'hydroponics', resource: 'food', base: 3, upgraded: 5, waterCost: 1 },
  { prompt: '199', shipId: 'icebreaker', consoleId: 'water-reclamation', resource: 'water', base: 2, upgraded: 4, waterCost: 0 },
  { prompt: '200', shipId: 'icebreaker', consoleId: 'mining-drone-control', resource: 'materials', base: 3, upgraded: 5, waterCost: 0 },
  { prompt: '208', shipId: 'shepherd', consoleId: 'water-reclamation', resource: 'water', base: 2, upgraded: 4, waterCost: 0 },
  { prompt: '209', shipId: 'shepherd', consoleId: 'advanced-hydroponics', resource: 'food', base: 12, upgraded: 16, waterCost: 2 },
  { prompt: '209', shipId: 'shepherd', consoleId: 'advanced-hydroponics-ii', resource: 'food', base: 12, upgraded: 16, waterCost: 2 },
  { prompt: '220', shipId: 'quellon', consoleId: 'hydroponics', resource: 'food', base: 3, upgraded: 5, waterCost: 1 },
  { prompt: '221', shipId: 'quellon', consoleId: 'water-production', resource: 'water', base: 12, upgraded: 16, waterCost: 0 },
  { prompt: '221', shipId: 'quellon', consoleId: 'water-production-ii', resource: 'water', base: 12, upgraded: 16, waterCost: 0 },
  { prompt: '228', shipId: 'refinery-124', consoleId: 'hydroponics', resource: 'food', base: 3, upgraded: 5, waterCost: 1 },
  { prompt: '229', shipId: 'refinery-124', consoleId: 'water-reclamation', resource: 'water', base: 2, upgraded: 4, waterCost: 0 },
] as const)('resolves Prompt $prompt $shipId $consoleId at base and upgraded output', ({
  shipId, consoleId, resource, base: baseYield, upgraded: upgradedYield, waterCost,
}) => {
  const resources = { ore: 12, fuel: 5, food: 9, water: 8, materials: 3, securityTeams: 2 };
  for (const [upgradeIds, expectedYield] of [[[], baseYield], [[consoleId], upgradedYield]] as const) {
    const result = advanceMaintenance(input({
      shipId, action: 'production', productionConsoleId: consoleId, upgraded: upgradeIds,
      cycle: { step: 6, revision: 0, results: {}, charges: [consoleId], refuelled: [] },
      resources,
    }));
    expect(result.resources[resource]).toBe(resources[resource] + expectedYield -
      (resource === 'water' ? waterCost : 0));
    expect(result.resources.water).toBe(resources.water - waterCost +
      (resource === 'water' ? expectedYield : 0));
    expect(result.cycle).toMatchObject({ step: 6, revision: 1, charges: [] });
  }
});

it('resolves both Refinery 124 Fuel Refinery consoles independently with base and upgraded limits', () => {
  const first = advanceMaintenance(input({
    shipId: 'refinery-124', action: 'production', productionConsoleId: 'fuel-refinery', productionOreAmount: 10,
    cycle: { step: 6, revision: 0, results: {}, charges: ['fuel-refinery', 'fuel-refinery-ii'], refuelled: [] },
    resources: { ore: 25, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
  }));
  expect(first.resources).toMatchObject({ ore: 15, fuel: 15 });
  expect(first.cycle.charges).toEqual(['fuel-refinery-ii']);

  const second = advanceMaintenance(input({
    shipId: 'refinery-124', action: 'production', productionConsoleId: 'fuel-refinery-ii', productionOreAmount: 15,
    expectedRevision: first.cycle.revision, cycle: first.cycle, resources: first.resources,
    upgraded: ['fuel-refinery-ii'],
  }));
  expect(second.resources).toMatchObject({ ore: 0, fuel: 30 });
  expect(second.cycle.charges).toEqual([]);
  expect(second.cycle.results['5']).toMatch(/Fuel Refinery:.*Fuel Refinery II:/);

  expect(() => advanceMaintenance(input({
    shipId: 'refinery-124', action: 'production', productionConsoleId: 'fuel-refinery', productionOreAmount: 11,
    cycle: { step: 6, revision: 0, results: {}, charges: ['fuel-refinery'], refuelled: [] },
  }))).toThrow(/between 1 and 10 ore/i);
  expect(() => advanceMaintenance(input({
    shipId: 'refinery-124', action: 'production', productionConsoleId: 'fuel-refinery', productionOreAmount: 10,
    cycle: { step: 6, revision: 0, results: {}, charges: ['fuel-refinery'], refuelled: [] },
    resources: { ore: 9, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 },
  }))).toThrow(/Insufficient ore/i);
  for (const fuel of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 5]) {
    expect(() => advanceMaintenance(input({
      shipId: 'refinery-124', action: 'production', productionConsoleId: 'fuel-refinery', productionOreAmount: 10,
      cycle: { step: 6, revision: 0, results: {}, charges: ['fuel-refinery'], refuelled: [] },
      resources: { ore: 10, fuel, food: 0, water: 0, materials: 0, securityTeams: 0 },
    }))).toThrow(/fuel storage capacity/i);
  }
});

it.each(REACTOR_CAPACITY_MATRIX)('enforces printed Reactor capacity for $shipId', ({ shipId, nominalCapacity, damagedPenalty, eligibleConsoles }) => {
  const variants = [
    { label: 'nominal', capacity: nominalCapacity, damaged: false, upgraded: false },
    { label: 'upgraded', capacity: nominalCapacity + 1, damaged: false, upgraded: true },
    { label: 'damaged', capacity: Math.max(0, nominalCapacity - damagedPenalty), damaged: true, upgraded: false },
    { label: 'damaged and upgraded', capacity: Math.max(0, nominalCapacity + 1 - damagedPenalty), damaged: true, upgraded: true },
  ];

  for (const variant of variants) {
    const cycle = { step: 5, revision: 0, results: {}, charges: [], refuelled: [] };
    const damage = { damagedSystemIds: variant.damaged ? ['reactor'] : [], destroyed: false };
    const upgraded = variant.upgraded ? ['reactor'] : [];
    const exact = advanceMaintenance(input({
      shipId, action: 'reactor', cycle, damage, upgraded,
      consoles: eligibleConsoles.slice(0, variant.capacity),
    }));

    expect(exact.cycle.charges, `${shipId} ${variant.label}`).toHaveLength(variant.capacity);
    expect(exact.cycle.results['5']).toContain(`Charged ${variant.capacity}/${variant.capacity} consoles.`);

    const capacityPlusOne = eligibleConsoles.slice(0, variant.capacity + 1);
    if (capacityPlusOne.length > variant.capacity) {
      expect(() => advanceMaintenance(input({
        shipId, action: 'reactor', cycle, damage, upgraded, consoles: capacityPlusOne,
      })), `${shipId} ${variant.label}`).toThrow(/capacity/);
    }
  }
});

it('resolves AEGIS Zeta then Omega as separate one-craft bays before maintenance can end', () => {
  const base = input({
    action: 'bays',
    cycle: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] },
    refuels: { 'shuttle-bay-zeta': 'starlight' },
    dockings: [
      { shipId: 'aegis', shuttleId: 'starlight' },
      { shipId: 'aegis', shuttleId: 'pallas' },
    ],
    fuelled: { starlight: false, pallas: false },
  });

  expect(() => advanceMaintenance({
    ...base,
    refuels: { 'shuttle-bay-omega': 'pallas' },
  })).toThrow(/out-of-order shuttle bay/i);
  expect(() => advanceMaintenance({
    ...base,
    damage: { damagedSystemIds: ['shuttle-bay-zeta'], destroyed: false },
  })).toThrow(/damaged shuttle bay/i);
  const zeta = advanceMaintenance(base);
  expect(zeta).toMatchObject({
    resources: { fuel: 3 },
    fuelled: { starlight: true, pallas: false },
    cycle: {
      step: 7, revision: 1, refuelled: ['starlight'],
      results: { '6': expect.stringContaining('Shuttle Bay Zeta') },
    },
  });
  expect(() => advanceMaintenance({
    ...base, action: 'end', cycle: zeta.cycle, expectedRevision: 1,
  })).toThrow(/not available/i);

  const omegaInput = {
    ...base,
    cycle: zeta.cycle,
    expectedRevision: 1,
    resources: zeta.resources,
    fuelled: zeta.fuelled,
    refuels: { 'shuttle-bay-omega': 'pallas' },
  };
  expect(() => advanceMaintenance({
    ...omegaInput,
    refuels: { 'shuttle-bay-zeta': 'pallas' },
  })).toThrow(/out-of-order shuttle bay/i);
  expect(() => advanceMaintenance({
    ...omegaInput,
    damage: { damagedSystemIds: ['shuttle-bay-omega'], destroyed: false },
  })).toThrow(/damaged shuttle bay/i);
  expect(() => advanceMaintenance({
    ...omegaInput,
    refuels: { 'shuttle-bay-omega': 'starlight' },
  })).toThrow(/once per cycle/i);
  const omega = advanceMaintenance(omegaInput);
  expect(omega).toMatchObject({
    resources: { fuel: 2 },
    fuelled: { starlight: true, pallas: true },
    cycle: {
      step: 7, revision: 2, refuelled: ['starlight', 'pallas'],
      results: { '7': expect.stringContaining('Shuttle Bay Omega') },
    },
  });
  expect(advanceMaintenance({
    ...omegaInput, action: 'end', cycle: omega.cycle, expectedRevision: 2,
  }).cycle.step).toBe(0);
});

it.each([
  ['dione', 'philia'],
  ['icebreaker', 'highwall'],
  ['shepherd', 'endeavour'],
  ['quellon', 'hummingbird'],
  ['refinery-124', 'chacau'],
] as const)('resolves %s ordinary single-bay fuelling for exactly one docked craft', (shipId, shuttleId) => {
  const base = input({
    shipId,
    action: 'bays',
    cycle: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] },
    resources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 },
    dockings: [
      { shipId, shuttleId },
      { shipId, shuttleId: `${shuttleId}-other` },
    ],
    fuelled: { [shuttleId]: false },
    refuels: { 'shuttle-bay': shuttleId },
  });

  const result = advanceMaintenance(base);
  expect(result.resources.fuel).toBe(3);
  expect(result.fuelled[shuttleId]).toBe(true);
  expect(result.cycle).toMatchObject({
    step: 7,
    refuelled: [shuttleId],
    results: { '6': expect.stringMatching(/spent 1 fuel/i) },
  });
  expect(() => advanceMaintenance({
    ...base,
    damage: { damagedSystemIds: ['shuttle-bay'], destroyed: false },
  })).toThrow(/damaged shuttle bay cannot refuel/i);
  expect(() => advanceMaintenance({
    ...base,
    fuelled: { [shuttleId]: true },
  })).toThrow(/only once per cycle/i);
  expect(() => advanceMaintenance({
    ...base,
    dockings: [{ shipId: 'aegis', shuttleId }],
  })).toThrow(/must be docked at this ship/i);
});

it.each(['macaw', 'boa'] as const)('applies Capybara\'s single 6♠ bay to one %s and no second choice that turn', (shuttleId) => {
  const result = advanceMaintenance(input({
    shipId: 'capybara', action: 'bays',
    cycle: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: [], refuelled: [] },
    resources: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 },
    dockings: [
      { shipId: 'capybara', shuttleId: 'macaw' },
      { shipId: 'capybara', shuttleId: 'boa' },
    ],
    fuelled: { macaw: false, boa: false },
    refuels: { 'shuttle-bay': shuttleId },
  }));

  expect(result.resources.fuel).toBe(2);
  expect(result.fuelled).toEqual({ macaw: shuttleId === 'macaw', boa: shuttleId === 'boa' });
  expect(result.cycle).toMatchObject({ step: 7, refuelled: [shuttleId] });
  expect(() => advanceMaintenance({
    ...input({ shipId: 'capybara', action: 'bays', cycle: result.cycle, expectedRevision: result.cycle.revision }),
    dockings: [
      { shipId: 'capybara', shuttleId: 'macaw' },
      { shipId: 'capybara', shuttleId: 'boa' },
    ],
    fuelled: result.fuelled,
    refuels: { 'shuttle-bay': shuttleId === 'macaw' ? 'boa' : 'macaw' },
  })).toThrow(/action is not available at the current step/i);
});

it('runs full Capybara maintenance through production, bay, and its charged jump in order', () => {
  let state = input({
    shipId: 'capybara',
    resources: {
      ore: 0, fuel: 12, food: 20, water: 10, materials: 0, securityTeams: 2, scrap: 2,
    },
    population: 20_000,
    dockings: [
      { shipId: 'capybara', shuttleId: 'macaw' },
      { shipId: 'capybara', shuttleId: 'boa' },
    ],
    fuelled: { macaw: false, boa: false },
    rolls: [6, 6],
  });
  const apply = (overrides: Partial<MaintenanceInput>) => {
    const result = advanceMaintenance({ ...state, ...overrides });
    state = { ...state, ...result, expectedRevision: result.cycle.revision };
    return result;
  };

  apply({ action: 'begin' });
  apply({ action: 'storage' });
  apply({ action: 'rations', foodLevel: 1, waterLevel: 1 });
  apply({ action: 'unrest', rolls: [6, 6] });
  apply({ action: 'riot', rolls: [6] });
  const reactor = apply({
    action: 'reactor',
    consoles: ['advanced-hydroponics', 'water-production', 'jump-drive'],
  });
  expect(reactor.cycle).toMatchObject({
    step: 6,
    charges: ['advanced-hydroponics', 'water-production', 'jump-drive'],
  });

  apply({
    action: 'production', productionConsoleId: 'advanced-hydroponics', productionScrap: true,
  });
  const production = apply({
    action: 'production', productionConsoleId: 'water-production', productionScrap: false,
  });
  expect(production.cycle.charges).toEqual(['jump-drive']);
  expect(production.cycle.results['5']).toMatch(/Advanced Hydroponics.*Water Production/);

  const bay = apply({ action: 'bays', refuels: { 'shuttle-bay': 'macaw' } });
  expect(bay).toMatchObject({
    cycle: { step: 7, refuelled: ['macaw'], charges: ['jump-drive'] },
    fuelled: { macaw: true, boa: false },
  });
  const completed = apply({ action: 'end' });
  expect(completed.cycle).toMatchObject({
    step: 0,
    charges: ['jump-drive'],
    results: {
      '1': expect.stringContaining('Storage intact'),
      '2': expect.stringContaining('Spent 3 food and 2 water'),
      '3': expect.stringContaining('unrest'),
      '4': expect.stringContaining('No riot'),
      '5': expect.stringContaining('Water Production'),
      '6': expect.stringContaining('refuelled macaw'),
      '7': 'Maintenance cycle complete.',
    },
  });
  expect(completed.population).toBe(20_000);

  const jump = resolveJumpAttempt({
    shipId: 'capybara', origin: '0000', destination: '5143', currentTurn: 1,
    fuel: completed.resources.fuel, charged: completed.cycle.charges.includes('jump-drive'),
    damaged: false, upgraded: false, now: new Date('2026-09-06T12:05:00.000Z'),
    transitionId: 'capybara-jump-1',
  });
  expect(jump).toMatchObject({
    status: 'jumped',
    origin: '0000', destination: '5143', length: 'short', fuelCost: 3, remainingFuel: 8,
    transition: { id: 'capybara-jump-1', shipId: 'capybara' },
  });
});

it.each(['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'])('completes a %s cycle, including riot damage', shipId => {
  let state = input({ shipId, entropy: 0, population: shipId === 'aegis' ? 2500 : shipId === 'dione' ? 100000 : shipId === 'icebreaker' ? 40000 : ['quellon', 'shepherd'].includes(shipId) ? 30000 : 20000, unrest: 5 });
  const actions = shipId === 'aegis'
    ? ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays', 'end']
    : ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end'];
  for (const action of actions) {
    const result = advanceMaintenance({ ...state, action, foodLevel: 0, waterLevel: 0, consoles: [], refuels: {} });
    state = { ...state, ...result, expectedRevision: result.cycle.revision };
  }
  expect(state.cycle.step).toBe(0);
  expect(state.cycle.revision).toBe(shipId === 'aegis' ? 9 : 8);
  expect(state.damage.damagedSystemIds.length).toBeGreaterThan(0);
});
it('allows ending a maintenance cycle when a riot destroys the ship', () => {
  const result = advanceMaintenance(input({ action: 'end', cycle: { step: 7, revision: 0, results: {}, charges: [], refuelled: [] }, damage: { damagedSystemIds: [], destroyed: true } }));
  expect(result.cycle.step).toBe(0);
});
