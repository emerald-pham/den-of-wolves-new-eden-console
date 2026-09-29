import { describe, expect, it } from 'vitest';
import {
  advanceVoyage33Maintenance,
  emptyVoyage33MaintenanceState,
  isVoyage33InMutiny,
  parseVoyage33MaintenanceState,
} from './voyage33Maintenance';

const hostResources = {
  ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2,
};

describe('Voyage 33-0 maintenance', () => {
  it('starts the admitted vessel as its own 40,000-survivor state', () => {
    expect(emptyVoyage33MaintenanceState('aegis')).toMatchObject({
      id: 'voyage-33-0', hostShipId: 'aegis', population: 40_000, unrest: 0,
      cycle: { step: 0, revision: 0, charges: [] },
    });
  });

  it('uses the host ledger for the four printed steps and charges one console', () => {
    let state = emptyVoyage33MaintenanceState('aegis');
    let resources = hostResources;
    const actions = [
      { action: 'begin' },
      { action: 'rations', foodLevel: 1, waterLevel: 1 },
      { action: 'unrest', rolls: [6, 6] },
      { action: 'riot', rolls: [6] },
      { action: 'reactor', consoles: ['voyage-reactor'] },
      { action: 'end' },
    ] as const;
    for (const action of actions) {
      const next = advanceVoyage33Maintenance({
        state, expectedRevision: state.cycle.revision, currentTurn: 1,
        hostResources: resources, now: '2026-09-19T00:00:00.000Z', ...action,
      });
      state = next.state;
      resources = next.hostResources;
    }
    expect(resources).toMatchObject({ food: 5, water: 4 });
    expect(state.population).toBe(40_000);
    expect(state.cycle.step).toBe(0);
    expect(state.cycle.results['4']).toMatch(/Charged 1\/1/);
  });

  it('loses the server-rolled population amount and skips charging after a failed unrest check', () => {
    let state = emptyVoyage33MaintenanceState('aegis');
    for (const action of [
      { action: 'begin' },
      { action: 'rations', foodLevel: 0, waterLevel: 0 },
      { action: 'unrest', rolls: [1, 1] },
    ] as const) {
      state = advanceVoyage33Maintenance({
        state, expectedRevision: state.cycle.revision, currentTurn: 1,
        hostResources, now: '2026-09-19T00:00:00.000Z', ...action,
      }).state;
    }
    const failed = advanceVoyage33Maintenance({
      state, expectedRevision: state.cycle.revision, currentTurn: 1,
      hostResources, now: '2026-09-19T00:00:00.000Z', action: 'riot', rolls: [1],
    });
    expect(failed.state.population).toBe(39_999);
    expect(failed.state.cycle.chargingSkipped).toBe(true);
    expect(() => advanceVoyage33Maintenance({
      state: failed.state, expectedRevision: failed.state.cycle.revision,
      currentTurn: 1, hostResources, now: '2026-09-19T00:00:00.000Z',
      action: 'reactor', consoles: ['voyage-reactor'], rolls: [],
    })).toThrow(/charging was skipped/i);
  });

  it('applies the zero-population unrest consequence only on the transition', () => {
    const base = emptyVoyage33MaintenanceState('aegis');
    const state = { ...base, population: 0, unrest: 4,
      cycle: { ...base.cycle, step: 3, revision: 3 } };
    const result = advanceVoyage33Maintenance({
      state, expectedRevision: 3, currentTurn: 2, hostResources,
      now: '2026-09-19T00:00:00.000Z', action: 'riot', rolls: [1],
    });
    expect(result.state.population).toBe(0);
    expect(result.state.unrest).toBe(4);
    expect(result.state.cycle.chargingSkipped).toBe(true);
  });

  it('fails closed on malformed or over-capacity state', () => {
    expect(parseVoyage33MaintenanceState({ id: 'voyage-33-0', hostShipId: 'aegis', population: 40_001 })).toBeUndefined();
    const state = emptyVoyage33MaintenanceState('aegis');
    expect(() => advanceVoyage33Maintenance({
      state, expectedRevision: 0, currentTurn: 1, hostResources,
      now: '2026-09-19T00:00:00.000Z', action: 'reactor', consoles: ['one', 'two'], rolls: [],
    })).toThrow(/current step|available/i);
  });

  it('durably enters mutiny at unrest eight and locks Voyage 33-0 until crew replacement', () => {
    const baseState = emptyVoyage33MaintenanceState('aegis');
    const state = {
      ...baseState,
      unrest: 7,
      cycle: { ...baseState.cycle, step: 2, revision: 2, turn: 1, rationBonus: 0 },
    };
    const triggered = advanceVoyage33Maintenance({
      state, action: 'unrest', expectedRevision: 2, currentTurn: 1,
      hostResources, rolls: [1, 1], now: '2026-09-28T12:00:00.000Z',
    });

    expect(triggered.state.mutiny).toMatchObject({
      status: 'active', revision: 1, triggerUnrest: 9,
    });
    expect(isVoyage33InMutiny(triggered.state)).toBe(true);
    expect(() => advanceVoyage33Maintenance({
      state: triggered.state, action: 'riot', expectedRevision: 3, currentTurn: 1,
      hostResources, rolls: [6], now: 'later',
    })).toThrow(/mutiny.*crew captain/i);
  });
});
