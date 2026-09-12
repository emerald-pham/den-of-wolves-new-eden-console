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
