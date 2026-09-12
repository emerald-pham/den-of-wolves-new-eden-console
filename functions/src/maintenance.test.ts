import { expect, it } from 'vitest';
import { advanceMaintenance, MAINTENANCE_ORDERS, type MaintenanceInput } from './maintenance';
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
  }))).toThrow(/once per turn/i);

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

it('refuels only docked shuttles, spends fuel, prevents double refuelling, and ends explicitly', () => {
  const base = input({ action: 'bays', cycle: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] }, refuels: { 'shuttle-bay-zeta': 'starlight' }, dockings: [{ shipId: 'aegis', shuttleId: 'starlight' }] });
  const result = advanceMaintenance(base);
  expect(result.resources.fuel).toBe(3);
  expect(result.fuelled.starlight).toBe(true);
  expect(result.cycle.step).toBe(7);
  expect(() => advanceMaintenance({ ...base, dockings: [] })).toThrow(/docked/);
  expect(() => advanceMaintenance({ ...base, refuels: { 'shuttle-bay-zeta': 'starlight', 'shuttle-bay-omega': 'starlight' } })).toThrow(/once/);
  const omega = advanceMaintenance({ ...base, action: 'bays', cycle: result.cycle, expectedRevision: 1, refuels: {} });
  expect(omega.cycle).toMatchObject({ step: 7, revision: 2, results: { '7': expect.stringContaining('Shuttle Bay Omega') } });
  expect(advanceMaintenance({ ...base, action: 'end', cycle: omega.cycle, expectedRevision: 2 }).cycle.step).toBe(0);
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
