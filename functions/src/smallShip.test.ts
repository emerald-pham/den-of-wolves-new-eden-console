import { describe, expect, it } from 'vitest';
import {
  advanceSmallShipMaintenance,
  emptySmallShipState,
  parseSmallShipState,
  SMALL_SHIP_RULES,
  SMALL_SHIP_IDS,
} from './smallShip';
import type { ShipResourceInventory } from './resources';

const hostResources: ShipResourceInventory = {
  ore: 0, fuel: 4, food: 20, water: 20, materials: 1, securityTeams: 2,
};

function docked(id: (typeof SMALL_SHIP_IDS)[number] = 'gorgoneion') {
  return { ...emptySmallShipState(id, 'aegis') };
}

describe('small-ship rules', () => {
  it.each(SMALL_SHIP_IDS)('uses the printed population and charge cap for %s', (id) => {
    const state = docked(id);
    expect(state.population).toBe(SMALL_SHIP_RULES[id].population);
    expect(SMALL_SHIP_RULES[id].reactorCapacity).toBeGreaterThan(0);
    expect(state.cycle.step).toBe(0);
  });

  it('keeps the three audited identities distinct while borrowing their printed ration costs from the host', () => {
    const expectations = [
      { id: 'capybara-small', population: 2_000, reactorCapacity: 2, food: 5, water: 3 },
      { id: 'warrior', population: 2_000, reactorCapacity: 1, food: 5, water: 3 },
      { id: 'vulcan', population: 15_000, reactorCapacity: 2, food: 6, water: 4 },
    ] as const;

    for (const expected of expectations) {
      const state = docked(expected.id);
      expect(state).toMatchObject({ id: expected.id, population: expected.population });
      expect(SMALL_SHIP_RULES[expected.id].reactorCapacity).toBe(expected.reactorCapacity);

      const result = advanceSmallShipMaintenance({
        state: { ...state, cycle: { ...state.cycle, step: 1, revision: 1, turn: 1 } },
        action: 'rations', expectedRevision: 1, currentTurn: 1,
        hostResources: { ...hostResources }, foodLevel: 2, waterLevel: 2, rolls: [], now: 'now',
      });
      expect(result.hostResources).toMatchObject({
        food: hostResources.food - expected.food,
        water: hostResources.water - expected.water,
      });
    }
  });

  it('keeps Gorgoneion at 1,000 survivors and permits at most two charged consoles', () => {
    const state = docked('gorgoneion');
    expect(state.population).toBe(1_000);
    const reactorState = {
      ...state,
      cycle: { ...state.cycle, step: 4, revision: 4, turn: 1 },
    };
    const charged = advanceSmallShipMaintenance({
      state: reactorState, action: 'reactor', expectedRevision: 4, currentTurn: 1,
      hostResources, consoles: ['repair-drones', 'missile-array'], rolls: [], now: 'now',
    });
    expect(charged.state.cycle.charges).toEqual(['repair-drones', 'missile-array']);
    expect(() => advanceSmallShipMaintenance({
      state: reactorState, action: 'reactor', expectedRevision: 4, currentTurn: 1,
      hostResources, consoles: ['repair-drones', 'missile-array', 'force-field-projector'], rolls: [], now: 'now',
    })).toThrow(/capacity/i);
  });

  it('runs only charged base Capybara production against the docked host ledger', () => {
    let state = {
      ...docked('capybara-small'),
      cycle: {
        ...docked('capybara-small').cycle,
        step: 5, revision: 5, turn: 1,
        charges: ['water-reclimator', 'hydroponics'],
      },
    };
    let resources = { ...hostResources, food: 3, water: 2 };

    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'production', expectedRevision: 5, currentTurn: 1,
      hostResources: resources, productionConsoleId: 'water-reclimator', rolls: [], now: 'now',
    }));
    expect(resources).toMatchObject({ food: 3, water: 6 });
    expect(state.cycle).toMatchObject({ step: 5, revision: 6, charges: ['hydroponics'] });
    expect(state.cycle.results['5']).toContain('generated 4 water');

    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'production', expectedRevision: 6, currentTurn: 1,
      hostResources: resources, productionConsoleId: 'hydroponics', rolls: [], now: 'now',
    }));
    expect(resources).toMatchObject({ food: 7, water: 5 });
    expect(state.cycle).toMatchObject({ step: 5, revision: 7, charges: [] });
    expect(state.cycle.results['5']).toContain('generated 4 food');

    const noWater = { ...state, cycle: { ...state.cycle, charges: ['hydroponics'] } };
    expect(() => advanceSmallShipMaintenance({
      state: noWater, action: 'production', expectedRevision: 7, currentTurn: 1,
      hostResources: { ...resources, water: 0 }, productionConsoleId: 'hydroponics', rolls: [], now: 'now',
    })).toThrow(/insufficient water/i);
    expect(() => advanceSmallShipMaintenance({
      state: { ...noWater, id: 'warrior' }, action: 'production', expectedRevision: 7, currentTurn: 1,
      hostResources: resources, productionConsoleId: 'hydroponics', rolls: [], now: 'now',
    })).toThrow(/base Capybara/i);
  });

  it('borrows food and water from the docked host and advances the four steps', () => {
    let state = docked();
    let resources = hostResources;
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'begin', expectedRevision: 0, currentTurn: 1,
      hostResources: resources, rolls: [], now: '2026-01-01T00:00:00.000Z',
    }));
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'rations', expectedRevision: 1, currentTurn: 1,
      hostResources: resources, foodLevel: 1, waterLevel: 1, rolls: [], now: '2026-01-01T00:00:01.000Z',
    }));
    expect(resources).toMatchObject({ food: 17, water: 18 });
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'unrest', expectedRevision: 2, currentTurn: 1,
      hostResources: resources, rolls: [6, 6], now: '2026-01-01T00:00:02.000Z',
    }));
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'riot', expectedRevision: 3, currentTurn: 1,
      hostResources: resources, rolls: [6], now: '2026-01-01T00:00:03.000Z',
    }));
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'reactor', expectedRevision: 4, currentTurn: 1,
      hostResources: resources, consoles: ['console-1'], rolls: [], now: '2026-01-01T00:00:04.000Z',
    }));
    expect(state.cycle).toMatchObject({ step: 5, charges: ['console-1'] });
    ({ state } = advanceSmallShipMaintenance({
      state, action: 'end', expectedRevision: 5, currentTurn: 1,
      hostResources: resources, rolls: [], now: '2026-01-01T00:00:05.000Z',
    }));
    expect(state.cycle).toMatchObject({ step: 0, charges: [] });
  });

  it('turns a failed population roll into loss and skips charging without ship damage', () => {
    let state = docked('warrior');
    let resources = hostResources;
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'begin', expectedRevision: 0, currentTurn: 1,
      hostResources: resources, rolls: [], now: 'now-0',
    }));
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'rations', expectedRevision: 1, currentTurn: 1,
      hostResources: resources, foodLevel: 0, waterLevel: 0, rolls: [], now: 'now-1',
    }));
    ({ state, hostResources: resources } = advanceSmallShipMaintenance({
      state, action: 'unrest', expectedRevision: 2, currentTurn: 1,
      hostResources: resources, rolls: [1, 1], now: 'now-2',
    }));
    const populationBefore = state.population;
    ({ state } = advanceSmallShipMaintenance({
      state, action: 'riot', expectedRevision: 3, currentTurn: 1,
      hostResources: resources, rolls: [1], now: 'now-3',
    }));
    expect(state.population).toBe(populationBefore - 1);
    expect(state.cycle.chargingSkipped).toBe(true);
    expect(() => advanceSmallShipMaintenance({
      state, action: 'reactor', expectedRevision: 4, currentTurn: 1,
      hostResources: resources, consoles: ['console-1'], rolls: [], now: 'now-4',
    })).toThrow(/skipped/i);
  });

  it('rejects an over-capacity reactor and malformed present state', () => {
    const state = docked('warrior');
    expect(() => advanceSmallShipMaintenance({
      state: { ...state, cycle: { ...state.cycle, step: 4, revision: 4 } },
      action: 'reactor', expectedRevision: 4, currentTurn: 1,
      hostResources, consoles: ['console-1', 'console-2'], rolls: [], now: 'now',
    })).toThrow(/capacity/i);
    expect(parseSmallShipState({ ...state, population: -1 }, 'warrior')).toBeUndefined();
  });

  it('raises unrest when a failed population roll reaches zero survivors', () => {
    const baseState = docked('warrior');
    const state = {
      ...baseState,
      population: 1,
      unrest: 2,
      cycle: { ...baseState.cycle, step: 3, revision: 3 },
    };
    const result = advanceSmallShipMaintenance({
      state, action: 'riot', expectedRevision: 3, currentTurn: 1,
      hostResources, rolls: [1], now: 'now',
    });
    expect(result.state.population).toBe(0);
    expect(result.state.unrest).toBe(4);
  });
});
